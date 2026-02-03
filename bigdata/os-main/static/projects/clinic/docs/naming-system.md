# Unified Naming & Display System

This document explains how the system handles record naming ("Display Name"), ensuring consistency between Backend (API/Database) and Frontend (UI/Grid/Forms).

## Core Philosophy

1. **Virtual by Default**: We do **NOT** define `display_name` in schema fields. It is calculated on-the-fly.
2. **Auto-Injected**: If a translation table exists (`*_lang`), the Backend auto-injects `display_name` **into the translation table only** (never in the base table).
2. **Schema Driven**: The naming logic is determined by the `smart_features` in the JSON schema.
3. **Translation First**: If a system supports multiple languages, the naming logic prioritizes the active language.

---

## 1. Backend Logic (The Source of Truth)

The `Hydrator.js` is responsible for calculating the `display_name` for every record. It follows a strict **4-Step Priority**:

### Priority 1: Display Rule (Explicit)

If the schema defines a `display_rule`, it is **always** used.

* **Configuration**: `smart_features.display_rule` in JSON.
* **Example**: `clinic_doctors` uses `user` field (which links to the User's name).
* **Logic**: The system resolves the fields specified in the rule.

### Priority 2: Translation Table (Automatic)

If no rule exists, the system checks for a translation table (e.g., `clinic_patients_lang`).

* **Logic**: It looks for the first `nvarchar` column (usually `name` or `title`) in the translation table.
* **Exclusions**: It strictly ignores system columns (`id`, `display_name`, `created_date`, etc.).
* **Safety**: Phone/mobile-like values are rejected as display names.
* **Strict Mode**: If a defined translation table exists (even if empty for a specific record), the system **STOPS** here. It does **NOT** fall back to the base table's text columns. This prevents issues like showing a phone number when the Arabic name is missing.

### Priority 3: Base Table (Fallback)

**Only** if NO translation table exists for this entity.

* **Logic**: It looks for the first valid `nvarchar` column in the main table.
* **Exclusions**: It ignores `mobile`, `phone`, `tel`, `code`, `id`, and UUIDs.

### Priority 4: Foreign Keys & Standard Labels

If all above fail (e.g., a pure linking table):

* **Logic**: It checks standard Foreign Keys (defined in `display_fk_priority`).
* **Example**: A `clinic_visit_ticket` might show "Visit - [Patient Name]".
* **Final Fallback**: Returns the Table Label (e.g. "Patient") or ID.

---

## 2. Frontend Logic (Presentation)

The Frontend (`schema-crud.js` -> `displayNameForRecord`) consumes the data prepared by the Backend.

### Resolution Order

1. **`record.display_name`**: The value calculated by the Backend (highest priority).
2. **`record.name` / `label` / `title`**: Standard semantic keys.
3. **`record.i18n`**: If the record has embedded translations, it checks the current language for `name`/`label`/`title`.

### Safety Features

* **No "Smart" Guessing**: The Frontend does **NOT** iterate through random columns to find a string. It looks for specific, safe keys. This ensures that if the Backend sends a "clean" object, the Frontend won't accidentally display a phone number or code.
* **UUID Filtering**: It actively rejects values that look like UUIDs.

---

## 3. Schema Configuration Guidelines

To ensure this system works correctly, follow these rules in `*_schema.json`:

1. **No `display_name` Column**: Never add `display_name` to the `fields` array or `smart_features.columns`. It is a virtual property.
2. **No UI Input**: `display_name` must never appear in **Create** forms. It is computed by the Backend.
2. **Valid Display Rules**: usage of `display_rule` must reference valid, existing fields. Avoid circular references (e.g., referencing `display_name` inside a rule).
3. **Translation Tables**: Ensure `*_lang` tables have a clear descriptive column (e.g., `name`).

## Troubleshooting

* **Issue**: "Arabic name shows Phone Number".
  * **Cause**: Cached `display_name` values were polluted with phone-like strings.
  * **Fix**: The Backend now rejects phone-like values when resolving `display_name`.
  * **Recovery**: Recompute cached display names (or save the record to trigger recalculation).
