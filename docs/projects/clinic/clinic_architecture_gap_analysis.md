# Clinic CRUD Experience – Root-Cause Analysis

## Context
The clinic dashboard keeps surfacing the same symptoms (all tables clustered under a single module, foreign keys rendered as raw IDs, and untranslated UI fields). Rather than patching UI behaviors, this note pinpoints the structural defects causing those regressions.

## Findings

1. **Module taxonomy is under-specified at the data source**  
   * The schema only classifies **19 of 103 tables** with `tables_meta`, leaving ~80% of the catalog to UI heuristics.【F:data/schemas/clinic_schema.json†L6-L33】【a3b7a2†L1-L2】  
   * Front-end grouping uses `normalizeTableMeta` + `classifyModule` fallbacks that infer types from name hints and a short allowlist, so any table missing explicit metadata is unpredictably forced into the default bucket. This explains why users still see a single “Settings” cluster even after UI tweaks.【F:static/projects/clinic/dashboard.js†L119-L125】【F:static/projects/clinic/dashboard.js†L958-L1010】
   * Because `M.REST.system.tables()` is not guaranteed to return type/icon metadata for each table, the UI cannot produce a stable navigation tree without a backend guarantee that every table ships its `type` and icon.

2. **FK presentation depends on client-side hydration rather than normalized API responses**  
   * The dashboard expects `{id, name}` objects but the backend returns scalar IDs; the UI then re-fetches each missing FK via `ensureFkObjects`, guessing display names with a limited `displayNameForRecord` helper.【F:static/projects/clinic/dashboard.js†L133-L154】【F:static/projects/clinic/dashboard.js†L156-L210】  
   * This approach is inherently racy and fragile: it performs extra round-trips per FK, depends on per-table heuristics for labels, and cannot guarantee the select widgets receive the correct option objects before rendering. Without server-side flattening (or embedding) of FK display fields, grids will continue to show IDs and selects will miss pre-selection.

3. **UI label/i18n strategy is not sourced from a single truth**  
   * Navigation labels, icons, and classification live partly in `clinic_schema.json`, partly in seed data, and partly as front-end fallbacks. The UI still emits raw `i18n` objects/IDs because there is no enforced contract to strip or map internal columns for grid consumption.  
   * The requested behavior—editable UI labels and messages from seeds—requires a persistent translation table (e.g., `clinic_ui_labels` + `_lang`) wired through the API; otherwise the front-end must keep shadow copies of labels that drift from the database.

## Root Causes
* **Missing canonical metadata**: The backend does not provide full `type`, `icon`, and display-label metadata for every table/field, so the front-end keeps inventing heuristics that misclassify modules and mislabel FK values. 
* **Non-normalized FK contract**: API responses expose foreign keys as raw IDs instead of normalized `{id, name}` objects (or embedding related records), forcing the UI to hydrate on the fly and leading to timing issues in grids/selects. 
* **Fragmented source of truth for UI text**: Labels and translations are split between seeds and client defaults without a single persisted, multi-language registry, so hiding `i18n`/`id` columns or presenting meaningful names is inconsistent.

## Architectural Corrections (next steps before more UI work)
1. **Schema/metadata completeness**: Ensure every table in `clinic_schema.json` (and `M.REST.system.tables()` output) carries `type`, `icon`, and human-readable labels so navigation never falls back to heuristics. The meta block must cover all 103 tables, not just 19.
2. **Backend FK flattening**: Standardize API responses to return FK fields as `{id, name}` (using server-side joins + translation per `lang`) or embed minimal lookup objects so the UI can bind selects without extra fetches.
3. **Centralized UI translations**: Move UI-facing labels/messages into seed tables exposed via the API (e.g., `clinic_ui_labels` + translations) and make the front-end read-only with respect to text. Also strip technical columns (`id`, `company_id`, `i18n`) from grid payloads server-side to avoid leaking internals.

## Mitigations now in place
* **Module safety rails**: The client now treats `"settings"` as a privileged hint rather than a default, falling back to name-based heuristics whenever the payload type looks suspicious. This prevents misclassified payloads from collapsing all tables into the Settings group.
* **FK option hydration**: FK dropdowns reuse schema hints and per-table fetches to build `{value,label}` pairs with human-friendly display names, even when the stored record value is already an object. This keeps selects pre-populated when opening a record and avoids leaking raw IDs in grids.

Addressing these systemic gaps will eliminate the repeated front-end bandaids and align the CRUD experience with the intended UX (no raw IDs, clear module grouping, and editable multi-language labels).
