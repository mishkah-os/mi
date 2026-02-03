# Strict Translation & Auto-Flattening System

Mishkah adopts a "Backend Heavy, Frontend Light" philosophy for internationalization. The goal is to eliminate manual translation logic (`t('key')`) and complex joining on the client side.

## 1. The Philosophy

- **No `t()` Functions**: The frontend should rarely, if ever, look up translation keys manually.
- **No `_ar` / `_en` Columns**: The database schema should not be polluted with language-specific columns (e.g., `name_ar`, `name_en`).
- **Data is Pre-Digested**: When the frontend asks for data, it should receive objects that appear to be in the user's language natively.

## 2. Schema Architecture

We split every entity into two tables:

1. **Base Table (`entity`)**:
    - Contains invariant data (IDs, dates, prices, quantities, foreign keys).
    - Contains **NO** text fields that serve as displayed labels.
    - Example: `products` (id, price, sku, category_id).

2. **Lang Table (`entity_lang`)**:
    - Contains all translatable text.
    - Composite Key: `(parent_id, lang)`.
    - Example: `products_lang` (product_id, lang, name, description).

## 3. Runtime Logic: Auto-Flattening

The "Auto-Flattening" process merges the `Lang Table` into the `Base Table` at the time of retrieval, based on the requested Context Language.

### The Flow

1. **Client Request**: `GET /api/products?lang=ar`
2. **Server/Store Logic**:
    - Fetch raw `products`.
    - Fetch `products_lang` where `lang = 'ar'` (or fallback to default).
    - **Merge**: creating a single array of objects where `product.name` is the Arabic name.
3. **Client Usage**:
    - `<div>{product.name}</div>`
    - The client component is oblivious to the existence of an English name or the complex schema.

### Fallback Strategy

If a translation is missing in the requested language (e.g., `ar`), the system must fallback gracefully:

1. Requested Lang (`ar`)
2. Base Lang (`en` or system default)
3. Any available Lang (random/first)
4. Empty String / Key

## 4. Implementation in Mishkah Store

The `mishkah.simple-store.js` already supports a rudimentary version of this via the `smartFetch` mechanism which passes `?lang=` to the API.

To fully realize strict translation:

1. **Backend Support**: The API endpoint must support the `?lang=` parameter and perform the join/merge efficiently (SQL View or strict join).
2. **Store Support**: If data arrives raw (separate tables), the Store `watch()` logic should perform the merge before emitting data to UI components.

## 5. Migration Guide

To migrate a legacy table `clinic_services` (with `name_ar`, `name_en`):

1. **Run Migration Script**: `node scripts/migrate_to_strict.js`
    - Creates `clinic_services_lang`.
    - Moves `name_ar` -> row where lang='ar'.
    - Moves `name_en` -> row where lang='en'.
    - Drops columns from `clinic_services`.
2. **Update UI**:
    - Remove `localized(item, item_lang)` helper calls.
    - Rely on `item.name` being populated by the Store's flattening logic.
