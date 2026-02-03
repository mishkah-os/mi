# Vertical Language + CRUD Data Flow (Clinic)

This document explains how the backend and frontend handle the "vertical language" model
(base table + _lang table), how the schema and seeds define it, and why the Clinic CRUD
was showing UUIDs instead of translated names.

## 1) Vertical language model (data shape)

### Base table (horizontal core data)

Example: `clinic_types`

- Holds identity and non-text fields.
- Does NOT store translated labels.

Example record:

```json
{
  "id": "c21e44b7-257e-5ec0-aaed-73b5ca1f38df",
  "company_id": "35BA090E-2828-41ED-9C66-054979646F36",
  "standard_duration_minutes": 30,
  "begin_date": "2025-12-16T10:00:00",
  "is_active": 1
}
```

### Translation table (vertical text rows)

Example: `clinic_types_lang`

- One row per (record, language).
- Uses `<base_table>_id` + `lang` to link to the base row.

Example record:

```json
{
  "id": "7512d3f3-9546-40f2-abea-90d06d76fe3c",
  "clinic_types_id": "c21e44b7-257e-5ec0-aaed-73b5ca1f38df",
  "lang": "ar",
  "name": "PT - Physical Therapy",
  "created_date": "2025-12-17T06:10:40.220Z"
}
```

This is the "vertical" part: all languages are stacked in rows, not columns.

## 2) Where this structure is defined

- Schema: `data/schemas/clinic_schema.json`
  - Defines every base table and its `_lang` table.
  - FK relationships are used to detect foreign keys.
  - Translation tables follow `<table>_lang` convention.

- Seeds: `data/branches/pt/modules/clinic/seeds/initial.json`
  - This file currently contains language bootstrap only.
  - Real data is already materialized in:
    `data/branches/pt/modules/clinic/live/data.json`.

## 3) Backend translation pipeline

### 3.1 Load translations map

File: `src/backend/i18nLoader.js`

- `loadTranslationsPayload(store, { lang, fallbackLang })` builds:
  - `translations[tableName][recordId] = { name, title, ... }`
  - `availableLanguages`

It reads from all `_lang` tables in the store.

### 3.2 Attach translations to base rows

File: `src/backend/i18nLoader.js`

- `attachTranslationsToRows(store, tableName, rows, { lang, fallbackLang })`
  - Adds `row.i18n.lang[lang] = { ...translationFields }`
  - Merges fallback language if needed.

Important fix (root cause of UUID issue):

- Base rows MUST match translations by `row.id`, not by the first `*_id` field.
- The old logic used the first `*_id` it saw (often `company_id`), which caused:
  - No translation match for the base row.
  - Missing `name` in `i18n.lang[lang]`.
  - FK hydration fell back to UUID.

Fix applied in `src/backend/i18nLoader.js`:

```javascript
const directId = row && (row.id || row.Id || row.uuid || row.uid);
const refId = directId || extractReferenceId(row, tableName);
```

## 4) Backend FK hydration pipeline

### 4.1 Smart schema

File: `src/backend/smartSchema.js`

- Detects translation tables automatically (`*_lang`).
- Identifies the display field for each translatable table.
- Collects foreign keys based on schema references.

### 4.2 Hydrator

File: `src/backend/hydrator.js`

- Step 1: `attachTranslationsToRows()` for the base table.
- Step 2: Resolve foreign keys.
  - Fetch target rows by ID.
  - Attach translations to target rows.
  - Produce `{ id, name }` objects for FK fields.

Example hydrated `clinic_rooms` record:

```json
{
  "id": "3869d3bd-4f8f-5488-9826-b7aa64743ee4",
  "clinic_type": {
    "id": "0715dc76-870a-5418-ba1e-0ac0a0af77cf",
    "name": "Slimming"
  },
  "room_code": "SLIM-1",
  "i18n": { "lang": { "ar": { "name": "Slimming Room 1" } } }
}
```

## 5) CRUD REST contract

### 5.1 Endpoints

File: `src/server.js`

- `GET /api/v1/crud/tables`
  - Returns schema, modules, and `fkReferences`.

- `POST /api/v1/crud/:table/search`
  - Returns `{ data, count, page, limit }`.
  - Data is already hydrated (translations + FK objects).

- `GET /api/v1/crud/:table/:id`
  - Returns `{ record, translations, translationFields, languages }`.
  - `translations` are from `_lang` table (vertical rows).

### 5.2 Translation payload shape

- Frontend sends:

```json
{
  "record": { "clinic_type": "<uuid>", "room_code": "PT-1" },
  "translations": {
    "ar": { "name": "PT Room 1" },
    "en": { "name": "PT Room 1" },
    "__strategy": "merge"
  }
}
```

- Backend uses:
  - `normalizeTranslationPayload()`
  - `applyRecordTranslations()`

## 6) Frontend flow (Clinic dashboard)

### 6.1 REST access

File: `static/lib/mishkah-rest.js`

- Pure REST wrapper; no translation logic.
- Uses `/api/v1/crud` endpoints.

### 6.2 CRUD UI logic

File: `static/projects/clinic/dashboard.js`

- `loadTables()` reads `/crud/tables` and builds FK map.
- `loadTableData()` calls `/crud/:table/search`.
- `ensureFkObjects()` caches FK lookups for select inputs.
- `renderRecordEditor()` uses FK options to render `<select>`.

### 6.3 Display rendering

File: `static/projects/clinic/UniversalComp.js`

- Table cells show `val.name` or `val.label` if the cell is an object.
- If the FK object has no `name`, the UI falls back to raw UUID.

## 7) Why the UUID appeared (root cause)

1. `clinic_rooms.clinic_type` is a FK to `clinic_types`.
2. The hydration step needs the translated `name` for `clinic_types`.
3. Translations were NOT attached to `clinic_types` rows because:
   - The translation matcher used the wrong ID (`company_id`).
4. Hydrator produced `{ id, name: "[uuid]" }` for the FK.
5. UI rendered UUIDs instead of translated names.

Fixing the ID matching in `attachTranslationsToRows()` restores correct labels.

## 8) Operational rules for all future modules

- Always define a `_lang` table for every translatable base table.
- The `_lang` table must include `<base_table>_id` and `lang`.
- Schema MUST declare FK references for all FK columns (even if the column name
  does not end with `_id`).
- Backend should be the single source of truth for:
  - Translation aggregation.
  - FK hydration and display names.
- Frontend should only consume hydrated values, not re-infer translations.
- Keep FK ID columns (`*_id`) as primitive values (string/uuid). Never assign
  objects into `*_id` fields; use the companion field without `_id` for objects.
- For list views, merge translation fields into display rows and render those
  fields first so the user sees the meaningful labels immediately.
- Define table naming and column order rules in `smart_features`:
  - `display_rule.parts`: array of tokens to build a user-facing name.
  - `display_fk_priority`: preferred FK fields for auto name resolution.

### display_rule part types

Each `parts[]` entry supports the following shapes:

- `{ "type": "text", "value": " / " }`
  - Constant string used as a separator or label.
- `{ "type": "field", "name": "patient" }` (default)
  - Uses the field value. If it is a FK, the FK's `display_name` is resolved recursively.
  - If it is a normal column, the direct value is used (no UUIDs are shown).
- `{ "type": "fk", "name": "booking" }`
  - Alias of `field` with the intent that it is a FK. Uses recursive `display_name`.
- `{ "type": "lang", "name": "name" }`
  - Reads from the translation payload only (`i18n.lang` or legacy `i18n`) with language priority.
  - This is strict: it does not fall back to base columns.
- `{ "type": "direct", "name": "code" }`
  - Reads the base column value only (no FK resolution).
  - UUID-like values are suppressed.

### columns metadata (per-table column catalog)

Each table can define `smart_features.columns` to control display order, visibility, searchability, labels, and defaults.

Required keys (backend fills defaults when missing):

- `name`: column name
- `sort`: numeric order (ascending)
- `is_table_show`: show in list view
- `is_edit_show`: show in edit form
- `is_searchable`: include in search
- `source`: one of `lang`, `direct`, `fk`
- `labels`: `{ ar, en }` with fallback to column name
- `component`: optional UI component name (string or null)
- `default_value`: literal default (string/number/bool) for new records
- `default_expr`: expression string for dynamic defaults (`now`, `today`, `localStorage:KEY`, `cookie:KEY`)
- `events`: optional event metadata object (for future field behaviors)

Example:

```json
{
  "name": "patient",
  "sort": 30,
  "is_table_show": true,
  "is_edit_show": true,
  "is_searchable": true,
  "source": "fk",
  "labels": { "ar": "المريض", "en": "Patient" },
  "component": null,
  "default_value": null,
  "default_expr": null,
  "events": null
}
```

## 9) Quick validation checklist

- `data/schemas/<module>_schema.json` includes `<table>_lang` and FK references.
- `data/branches/<branch>/modules/<module>/live/data.json` has `_lang` rows.
- `GET /api/v1/crud/<table>/search` returns hydrated FK objects with `name`.
- `GET /api/v1/crud/<table>/<id>` returns `translations` map and fields.
