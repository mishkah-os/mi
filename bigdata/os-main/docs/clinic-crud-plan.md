# Universal CRUD System: "The Genius Architecture"

This document outlines the architecture for a highly intelligent, schema-driven, and multilingual CRUD system. The core philosophy is **"Backend Intelligence, Frontend Simplicity"**. The Backend is responsible for complex data assembly (hydration) and disassembly (dehydration), while the Frontend blindly renders what it receives based on the schema.

> **Operational Note:** The static entrypoint (`static/crud-universal.html`) now boots with a deterministic Tailwind configuration and RTL-safe defaults, so this plan assumes the browser shell is stable while backend intelligence evolves.

---

## 1. The Core Philosophy: "Smart Foreign Keys" & "Dynamic Languages"

### 1.1. The FK Revolution

In traditional systems, an API returns:

```json
{ "doctor_id": "550e8400-e29b-41d4-a716-446655440000" }
```

And the frontend scurries around fetching lookups. **No more.**

 Our system returns:

```json
{
  "doctor": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Dr. House", 
    "image": "/uploads/doctors/house.jpg" // Optional extra fields defined in schema
  }
}
```

The Backend **intercepts** the response. It sees `doctor_id` in the schema references `users` table. It automatically:

1. Lookups the `users` record.
2. Joins with `users_lang` based on the **Context Language** (e.g., Arabic).
3. Falls back to English (or Primary Language) if Arabic is missing.
4. Constructs the `{ id, name }` object.

### 1.2. Dynamic Multilingual Architecture

We do not hardcode "Ar/En". Languages are dynamic keys.

**The Write Payload (Frontend -> Backend)**
When saving a record (e.g., a Company), the Frontend sends the **exact same structure** it received, plus any edits.

```json
{
  "id": "uuid...",
  "tax_number": "123456",
  "is_active": true,
  "translations": [
    { "lang": "en", "name": "Mishkah Corp" },
    { "lang": "ar", "name": "شركة مشكاة" },
    { "lang": "fr", "name": "Mishkah SARL" } // Dynamically added by user!
  ]
}
```

**The Read Payload (Backend -> Frontend)**

```json
{
  "id": "uuid...",
  "tax_number": "123456",
  "is_active": true,
  // The backend determines which "name" to show in the UI list based on user's lang
  "name": "شركة مشكاة", 
  "translations": [ ... ] // Full translations list included for Edit forms
}
```

---

## 2. Universal API Blueprint

We need a single, powerful endpoint structure that serves ALL master tables.

### 2.1. Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/crud/:schema/search` | Advanced search, pagination, filtering. Returns hydrated list. |
| `GET` | `/api/v1/crud/:schema/:id` | Get single hydrated record with all translation rows. |
| `POST` | `/api/v1/crud/:schema` | Create new record. Accepts Unified DTO. |
| `PUT` | `/api/v1/crud/:schema/:id` | Update record. Accepts Unified DTO. |
| `DELETE` | `/api/v1/crud/:schema/:id` | Soft delete (is_active=0) or Hard delete. |
| `GET` | `/api/v1/crud/:schema/schema` | Returns the raw JSON schema + lookup metadata for this table. |

### 2.2. The Schema Intelligence (Meta-Schema)

We will enhance `clinic_schema.json` with "Smart Attributes".

- **Convention over Configuration**:
  - Any table `X` is translatable if `X_lang` exists.
  - The "Display Field" is implicitly the first `nvarchar` field in `X_lang`.
  - The "UI Widget" for FKs to `X` is implicitly "Smart Select" (Autocomplete).
- **Versioning**: optimistic concurrency with `version` on base row and translation rows; saves must increment matching versions.

**Example Schema Extension (Optional Overrides):**

```json
{
  "name": "companies",
  // Everything below is AUTO-INFERRED because "companies_lang" exists.
  // We only add "smart_features" if we want to OVERRIDE defaults (e.g. extra search fields).
  "smart_features": {
    "search_fields": ["tax_number", "companies_lang.name"] // Custom search
  }
}
```

---

## 3. Backend Implementation Strategy (The "Brain")

### 3.1. Schema Discovery (Zero Config)

On startup, the `SmartSchema` engine scans all tables:

1. **Linkage**: If `Table A` and `Table A_lang` exist -> Mark `A` as Translatable.
2. **Display Field**: Scan `A_lang`. Find first `nvarchar` column (e.g., `name` or `title`). Set as implicit Display Field.
3. **FK Wiring**: Any FK pointing to `A` in other tables is marked for "Smart Hydration".

### 3.2. The `Hydrator` Class

A generic utility that runs after every SQL SELECT.

1. Input: Raw Row `[ { id, parent_company_id, ... } ]`
2. Input: Target Language `ar`
3. Process:
    - Iterate fields.
    - If field is FK (e.g., `parent_company_id`) -> Collect IDs.
    - **Bulk Fetch**: Execute `SELECT id, name FROM companies_lang WHERE lang = 'ar' AND companies_id IN (...)`.
    - Map back to object: `row.parent_company = { id: row.parent_company_id, name: "Fetched Name" }`.
    - Remove raw `parent_company_id` (optional, or keep both).

### 3.2. The `Persister` Class

A generic utility for INSERT/UPDATE.

1. Input: Unified DTO ` { ..., translations: [...] } `
2. Process:
    - Transaction Start.
    - Extract "Base Fields" (non-translated). Update Main Table.
    - Extract "Translations". Loop through them.
    - `MERGE` (Upsert) into `_lang` table based on `(parent_id, lang)`.
    - Transaction Commit.

---

## 4. Frontend Architecture (The "Renderer")

The Frontend is dumb. It asks: *"What is the schema?"* and *"Here is the data"*.

### 4.1. The `UniversalForm` Component

- **Props**: `schema`, `data` (optional)
- **Logic**:
  - Loops through `schema.fields`.
  - Determines Widget Type (`text`, `number`, `date`, `smart-fk`, `translation-grid`).
  - **`smart-fk` Widget**: Instead of just a dropdown, it's an Autocomplete that calls `/api/v1/crud/:target_schema/search`. It receives `{id, name}` objects. It displays `name`, stores `id`.
  - **`translation-grid` Widget**: A dynamic table at the bottom. Columns: `Language` (Dropdown), `Name` (Text), `Description` (Text). Allowed to add infinite rows for infinite languages.

### 4.2. The `UniversalTable` Component

- **Props**: `schema`, `data`
- **Logic**:
  - Columns = `schema.list_fields`.
  - If a column is an FK, it expects an Object in the data. `row.company.name`. It renders that string.
  - Sorting/Filtering passes standardized query params to Backend.

---

## 5. Migration Roadmap

1. **Phase 1: Foundation (Backend)**
    - [ ] Create `SmartSchema` helper (parses `json` schema, identifies FKs and Lang tables).
    - [ ] Implement `Hydrator` middleware (The "Getter").
    - [ ] Implement `Persister` service (The "Saver").
    - [ ] Create generic API router `src/routes/crud.js`.

2. **Phase 2: Universal UI (Frontend)**
    - [ ] Build `SchemaProvider` (Fetches schemas).
    - [ ] Build `UniversalTable` (Smart columns).
    - [ ] Build `UniversalForm` (Smart inputs + Translation Manager).
    - [ ] Build `SmartSelect` (Autocomplete using the generic search API).

3. **Phase 3: Integration**
    - [ ] Replace existing hardcoded endpoints with Generic CRUD.
    - [ ] Test with `companies`, `branches`, `users`.

---

## 6. Example Flow: "Adding a Company"

1. **User** opens "New Company".
2. **Frontend** fetches `schema('companies')`.
3. **Form** renders:
    - `Tax Number` (Text)
    - `Begin Date` (Date)
    - `Parent Company` (Smart Select -> calls `GET /api/crud/companies/search`)
    - **Translations Area**:
        - Row 1: [ English ] [ "Mishkah Inc" ]
        - Row 2: [ Arabic ] [ "شركة مشكاة" ] (+ Add Row button)
4. **User** clicks Save.
5. **Payload sent**:

    ```json
    {
       "tax_number": "123",
       "parent_company": { "id": "uuid..." }, // or child_id
       "translations": [ { "lang": "en", "name": "..." }, { "lang": "ar", "name": "..." } ]
    }
    ```

6. **Backend** saves to `companies` and `companies_lang`. Returns hydrated object.
7. **UI** adds new object to local list (no refresh needed because response is fully hydrated).

This is the **Antigravity CRUD System**.
