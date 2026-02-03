# CRUD System & Automatic Naming Documentation

This document outlines the architecture of the data-driven CRUD system and the Automatic Naming (Sequence) rules, using the **Clinic** module as a reference implementation.

## 1. Schema-Driven Architecture

The core of the system is the **JSON Schema** definition (e.g., `clinic_schema.json`). This single source of truth drives:

1. **Database Structure**: Tables, columns, and relationships are automatically generated/migrated.
2. **API Endpoints**: CRUD endpoints are automatically provisioned.
3. **UI Generation**: The frontend uses `smart_features` and `field` metadata to render forms, tables, and filters.

### Key Components of `clinic_schema.json`

- **`fields`**: Defines data types, validation rules, and UI hints (`labels`, `sort`).
- **`smart_features`**: Module-specific configuration.
  - `settings.icon`, `settings.colors`: UI branding.
  - `settings.groups`: Logical grouping of fields in forms (e.g., "Basic Info", "Contact").
- **`smart_features.sequences`**: Definition of auto-numbering rules for specific fields.

---

## 2. Automatic Naming Rules (Sequences)

The system uses a flexible `SequenceManager` (located in `os/src/sequenceManager.js`) to generate human-readable unique identifiers (like `PAT-00001` or `INV-2024-005`).

### Configuration

Sequences are defined in the `smart_features.sequences` section of the schema or in a separate sequence rules file.

#### Example Configuration (from `clinic_patients`)

```json
"sequences": {
  "patient_code": {
    "start": 1,
    "prefix": "PAT",
    "padding": 5,
    "delimiter": "-",
    "preview_label": {
      "ar": "تسلسل تلقائي",
      "en": "Auto sequence"
    }
  }
}
```

#### Supported Options

| Option | Description | Example |
| :--- | :--- | :--- |
| `start` | The starting number for the sequence. | `1` |
| `prefix` | Static text to appear before the number. | `"PAT"`, `"INV"` |
| `suffix` | Static text to appear after the number. | `"-A"` |
| `padding` | Total width of the number part (zero-padded). | `5` (results in `00001`) |
| `delimiter` | Separator between parts (prefix, date, number). | `"-"`, `"/"` |
| `dateFormat` | (Optional) Date format to include in the ID. | `"YYYYMM"`, `"YYYY"` |
| `reset` | (Optional) Reset policy. Set to `"daily"` to reset counter every day. | `"daily"` |

### How It Works

1. **Trigger**: Logic is triggered when a field has `default_expr: "sequence:field_name"`.
2. **Generation**: The backend calculates the next value based on the current state (stored in `sequence-state.json`) and the rules.
3. **Persistence**: The state is updated atomically to prevent duplicates.

### Example Output

- Rule: `prefix="PAT"`, `padding=5`, `delimiter="-"`
  - Result: `PAT-00001`, `PAT-00002`...
- Rule: `prefix="INV"`, `dateFormat="YYYY"`, `padding=4`, `delimiter="/"`, `includeDate=true`
  - Result: `INV/2024/0001`

---

## 3. Localization (Vertical Translation)

The system adopts a **Vertical Translation Strategy**, which is distinct from the traditional "Horizontal" approach (e.g., `name_en`, `name_ar` columns in the same table).

### The Concept

Instead of polluting the main entity table with multiple columns for each language, we use a dedicated **Translation Table** (`*_lang`) linked 1-to-many with the Base Table.

- **Base Table** (`clinic_patients`): Stores "Single Version of Truth" data (IDs, Dates, Numbers, Foreign Keys).
- **Translation Table** (`clinic_patients_lang`): Stores **all** text content that varies by language.
  - **Structure**: One row per language per entity.
  - **PK**: Composite of `(entity_id, lang)`.

### Benefits

1. **Scalability**: Add new languages (e.g., French, Spanish) without altering the database schema.
2. **Performance**: The base table remains lean and fixed-width, improving scan performance for analytics.
3. **Clean Architecture**: Separation of "Data" vs "Content".

### System Fields

Certain fields are automatically managed in the translation table:

#### `display_name`

- **Purpose**: A cached, standard representation of the record (e.g. "John Doe - PAT-1001").
- **Behavior**:
  - Automatically calculated and injected into the `_lang` table by the backend (`display-name-cache.js`).
  - **Auto-Injected**: The field definition is automatically added to the schema in-memory (via `SmartSchema`) with `is_edit_show: false`. No need to define it manually in `clinic_schema.json`.
  - Used for Search and Autocomplete dropdowns.

#### `lang`

- **Purpose**: ISO code of the language (e.g., `ar`, `en`).
- **Behavior**: Handled automatically by the CRUD API `_lang` payload processor.

---

## 4. UI Integration

The frontend reads `clinic_schema.json` to build the UI dynamically, respecting the Vertical Translation architecture.

- **Multi-Language Forms**: The UI detects `_lang` tables and renders tabbed inputs (e.g., "English", "Arabic") for translatable fields.
- **Hidden Fields**: System fields like `display_name` should be defined in the schema with `is_edit_show: false` to prevent user tampering.
- **Auto-Naming**: Fields like `patient_code` triggered by `default_expr: "sequence:..."` are read-only or hidden during creation.
