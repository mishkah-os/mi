# SBN Seeds Transformation Summary

**Date:** 2025-11-23
**File:** `/home/user/os/data/branches/sbn/modules/mostamal/seeds/initial.json`
**Transformation:** Language-specific to Language-agnostic schema

---

## Overview

Successfully transformed the SBN seeds file from a mixed data structure (with text fields embedded in main records) to a clean language-agnostic schema where:

1. **Main tables** contain only structural data (IDs, numbers, booleans, dates)
2. **Lang tables** contain all translatable text fields
3. Each lang record has: `id`, `{parent}_id` (FK), `lang`, text fields, `is_auto`, `created_at`

---

## Statistics

### Tables Summary
- **Total Tables:** 22
- **Main Tables:** 12
- **Lang Tables:** 10
- **Tables without lang counterpart:** 2 (sbn_follows, sbn_ui_labels)

### Record Counts

| Main Table | Records | Lang Table | Records | Languages |
|-----------|---------|------------|---------|-----------|
| sbn_users | 8 | sbn_users_lang | 8 | ar:8 |
| sbn_user_roles | 4 | sbn_user_roles_lang | 4 | ar:4 |
| sbn_categories | 17 | sbn_categories_lang | 20 | ar:17, en:3 |
| sbn_products | 5 | sbn_products_lang | 5 | ar:5 |
| sbn_services | 4 | sbn_services_lang | 4 | ar:4 |
| sbn_wiki_articles | 3 | sbn_wiki_articles_lang | 3 | ar:3 |
| sbn_posts | 4 | sbn_posts_lang | 4 | ar:4 |
| sbn_comments | 3 | sbn_comments_lang | 3 | ar:3 |
| sbn_reviews | 3 | sbn_reviews_lang | 3 | ar:3 |
| sbn_hashtags | 5 | sbn_hashtags_lang | 5 | ar:5 |
| sbn_follows | 4 | - | - | - |
| sbn_ui_labels | 138 | - | - | - |

---

## Transformation Details

### 1. Field Separation

#### sbn_users
**Removed from main:** `full_name`, `bio`
**Moved to lang:** `full_name`, `bio`
**Kept in main:** user_id, email, username, password_hash, phone, phone_verified, email_verified, avatar_url, cover_url, gender, birth_date, location_city, location_country, preferred_lang, account_type, is_seller, is_service_provider, is_content_creator, is_verified, trust_score, followers_count, following_count, posts_count, status, last_login_at, created_at, updated_at

#### sbn_categories
**Removed from main:** `name`, `description`, `lang` (deleted)
**Moved to lang:** `name`, `description`
**Kept in main:** category_id, parent_id, category_type, slug, icon_url, cover_url, sort_order, is_active, items_count, created_at, updated_at

#### sbn_products
**Removed from main:** `title`, `description`, `brand`, `model`, `color`, `size`, `material`, `lang` (deleted)
**Moved to lang:** `title`, `description`, `brand`, `model`, `color`, `size`, `material`
**Kept in main:** product_id, seller_id, category_id, condition, price, original_price, currency, quantity, year, images, video_url, location_city, location_district, latitude, longitude, is_negotiable, is_delivery_available, delivery_cost, views_count, likes_count, shares_count, comments_count, saves_count, status, featured_until, created_at, updated_at, published_at, sold_at

#### sbn_services
**Removed from main:** `title`, `description`, `lang` (deleted)
**Moved to lang:** `title`, `description`
**Kept in main:** service_id, provider_id, category_id, service_type, price_min, price_max, currency, duration_min, duration_max, images, video_url, portfolio_urls, location_city, is_remote, is_onsite, availability, rating_avg, rating_count, orders_completed, views_count, likes_count, saves_count, status, featured_until, created_at, updated_at, published_at

#### sbn_wiki_articles
**Removed from main:** `title`, `excerpt`, `content`, `seo_title`, `seo_description`, `lang` (deleted)
**Moved to lang:** `title`, `excerpt`, `content`, `seo_title`, `seo_description`
**Kept in main:** article_id, author_id, parent_id, category_id, slug, content_format, cover_image, reading_time_minutes, difficulty_level, is_featured, views_count, likes_count, shares_count, comments_count, saves_count, status, seo_keywords, created_at, updated_at, published_at

### 2. _i18n Table Conversion

The transformation successfully converted existing `_i18n` tables to the new `_lang` format:

- **sbn_categories_i18n** → **sbn_categories_lang** (3 English translations preserved)
- All English translations retained their language code (`lang: "en"`)
- Proper FK relationships maintained to parent records

### 3. ID Generation Pattern

Lang record IDs follow the pattern: `{parent_id}_lang_{lang_code}`

Examples:
- User: `usr_001` → Lang ID: `usr_001_lang_ar`
- Category: `cat_001` → Lang ID: `cat_001_lang_ar`
- Product: `prod_001` → Lang ID: `prod_001_lang_ar`

For converted _i18n records, original IDs were preserved when possible.

---

## Quality Checks - All Passed ✅

1. ✅ **No lang fields in main tables** - All main tables are language-agnostic
2. ✅ **Proper lang table structure** - All lang tables have: id, FK, lang, is_auto, created_at
3. ✅ **No _i18n tables remaining** - All converted to _lang format
4. ✅ **Valid FK references** - All lang records reference existing main records
5. ✅ **Correct is_auto values** - All seed data marked as manual (is_auto: false)

---

## Schema Version Update

```json
{
  "name": "sbn-initial-seed",
  "title": "Initial Mock Data for Mostamal Hawa (SBN) - Language Agnostic",
  "version": 2,  // ← Updated from 1 to 2
  "meta": {
    "branchId": "sbn",
    "moduleId": "mostamal",
    "lastUpdatedAt": "2025-11-23T09:39:34.046Z",
    "description": "Language-agnostic data structure with separate _lang tables for all translatable content."
  }
}
```

---

## Benefits of New Structure

### 1. True Language-Agnostic Design
- Main records contain no language-specific data
- Can add new languages without modifying main tables
- Easy to query data regardless of language preference

### 2. Clean Separation of Concerns
- Structural data (IDs, counts, dates) in main tables
- Translatable content in lang tables
- Clear FK relationships between them

### 3. Flexible Translation Management
- Each record can have multiple language versions
- Track which translations are auto-generated (`is_auto` field)
- Easy to add/update/delete translations independently

### 4. Consistent Pattern
- All tables follow the same pattern
- Predictable ID generation
- Standard lang table structure across all entities

---

## Next Steps

The seeds file is now ready to be used with the new schema. To load it:

```bash
# The seeds should automatically load when the server starts
npm run dev

# Or manually trigger seed loading if needed
# (depends on your seed loading implementation)
```

---

## Files Modified

- ✅ `/home/user/os/data/branches/sbn/modules/mostamal/seeds/initial.json` - Transformed and updated

## Temporary Files (Cleaned Up)

- ~~transform-seeds.js~~ - Removed after successful transformation
- ~~verify-seeds.js~~ - Removed after verification

---

**Transformation Status:** ✅ COMPLETE
**Data Integrity:** ✅ VERIFIED
**Ready for Use:** ✅ YES
