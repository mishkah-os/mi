import { deepClone, createId } from '../utils.js';
import { attachTranslationsToRows, loadTranslationsPayload } from './i18nLoader.js';

/**
 * Hydrator: The Muscle of the Universal CRUD.
 * 
 * Responsibilities:
 * 1. Takes raw rows from DB.
 * 2. Attaches generic translations (via i18nLoader).
 * 3. Resolves Foreign Keys into Objects { id, name, ... }.
 * 4. Respects Language Context (ar/en).
 */
class Hydrator {
    static sharedCaches = new Map();

    static getCacheKey(store) {
        const branch = store && store.branchId ? String(store.branchId) : 'default';
        const moduleId = store && store.moduleId ? String(store.moduleId) : 'default';
        return `${branch}:${moduleId}`;
    }

    static getSharedCaches(store) {
        const key = Hydrator.getCacheKey(store);
        if (!Hydrator.sharedCaches.has(key)) {
            Hydrator.sharedCaches.set(key, {
                nameCache: new Map(),
                rowCache: new Map(),
                translationCache: new Map()
            });
        }
        return Hydrator.sharedCaches.get(key);
    }

    static invalidateAll(store) {
        const caches = Hydrator.getSharedCaches(store);
        if (!caches) return;
        caches.nameCache.clear();
        caches.rowCache.clear();
        caches.translationCache.clear();
    }

    static invalidateTable(store, tableName) {
        const caches = Hydrator.getSharedCaches(store);
        if (!caches || !tableName) return;
        const tableKey = String(tableName).toLowerCase();
        caches.rowCache.delete(tableKey);
        for (const key of caches.nameCache.keys()) {
            if (key.startsWith(tableKey + ':')) {
                caches.nameCache.delete(key);
            }
        }
    }

    constructor(smartSchema, store, options = {}) {
        this.schema = smartSchema;
        this.store = store; // Access to DB methods (listTable, etc)
        const maxDepth = Number(options.maxDepth);
        this.maxDepth = Number.isFinite(maxDepth) ? Math.max(1, maxDepth) : 19;
        const shared = Hydrator.getSharedCaches(store) || {};
        this.nameCache = shared.nameCache || new Map();
        this.rowCache = shared.rowCache || new Map();
        this.translationCache = shared.translationCache || new Map();
    }

    /**
     * Main entry point to hydrate a list of records.
     * @param {string} tableName - The primary table name
     * @param {Array} rows - Raw DB rows
     * @param {string} lang - Target language (e.g. 'ar')
     * @param {string} fallbackLang - Fallback language (e.g. 'en')
     */
    async hydrate(tableName, rows, lang = 'ar', fallbackLang = 'en') {
        if (!rows || !rows.length) return [];

        try {
            // 1. Attach Translations for the Primary Table (the rows themselves)
            //    Uses existing i18nLoader logic which is already capable.
            //    It merges _lang fields into the row object.
            let hydrated = attachTranslationsToRows(this.store, tableName, rows, { lang, fallbackLang });
            hydrated = hydrated.map((row) => this.flattenTranslationFields(tableName, row, { lang, fallbackLang }));

            // 2. Resolve Smart Foreign Keys
            hydrated = await this.resolveSmartForeignKeys(tableName, hydrated, lang, fallbackLang, this.maxDepth);

            // 3. Attach computed display names for the table itself
            hydrated = hydrated.map((row) => {
                const displayName = this.resolveDisplayName(tableName, row, {
                    lang,
                    fallbackLang,
                    maxDepth: this.maxDepth
                });
                if (displayName) {
                    row.display_name = displayName;
                }
                return row;
            });

            return hydrated;
        } catch (error) {
            // If hydration fails, return original rows (degraded mode)
            console.error(`[Hydrator] Failed to hydrate table "${tableName}":`, error.message);
            return rows;
        }
    }

    getPreferredLangs(lang, fallbackLang) {
        const primary = typeof lang === 'string' && lang.trim() ? lang.trim().toLowerCase() : null;
        const fallback = typeof fallbackLang === 'string' && fallbackLang.trim() ? fallbackLang.trim().toLowerCase() : null;
        const ordered = [];
        if (primary) ordered.push(primary);
        if (fallback && fallback !== primary) ordered.push(fallback);
        if (!ordered.includes('ar')) ordered.push('ar');
        if (!ordered.includes('en')) ordered.push('en');
        return ordered;
    }

    isLikelyUuid(value) {
        if (!value || typeof value !== 'string') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
    }

    isValidAutoName(value) {
        if (!value || typeof value !== 'string') return false;
        const trimmed = value.trim();
        if (!trimmed) return false;
        // Block strict UUIDs
        if (this.isLikelyUuid(trimmed)) return false;
        // Block "id-" prefix (common frontend placeholder)
        if (/^id-/i.test(trimmed)) return false;
        // Block ISO Dates/Timestamps (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
        return true;
    }

    isLikelyPhone(value) {
        if (!value || typeof value !== 'string') return false;
        const trimmed = value.trim();
        if (!trimmed) return false;
        // If contains letters, it's not a phone
        if (/[a-z\u0600-\u06FF]/i.test(trimmed)) return false;
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length < 6) return false;
        return /^[+()\d\s\-\.]+$/.test(trimmed);
    }

    humanizeColumnName(name) {
        if (!name) return '';
        return String(name)
            .replace(/_/g, ' ')
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    getTableLabel(tableName) {
        if (!tableName) return '';
        const tableDef = this.schema.tables.get(String(tableName).toLowerCase());
        const label = tableDef?.label || tableDef?.name || '';
        return label || String(tableName);
    }

    resolveTranslationField(row, fieldName, options = {}) {
        if (!row || !fieldName) return null;
        const lang = options.lang || 'ar';
        const fallbackLang = options.fallbackLang || 'ar';
        const preferred = this.getPreferredLangs(lang, fallbackLang);
        const i18n = row.i18n || {};
        const langTable = i18n.lang && typeof i18n.lang === 'object' ? i18n.lang : null;

        // Try preferred languages first from i18n.lang structure
        if (langTable) {
            for (const code of preferred) {
                const entry = langTable[code];
                if (entry && entry[fieldName] != null && entry[fieldName] !== '') {
                    const value = String(entry[fieldName]);
                    if (String(fieldName).toLowerCase() === 'display_name' && this.isLikelyPhone(value)) continue;
                    if (this.isValidAutoName(value)) return value.trim();
                }
            }
            // Try any available language from i18n.lang
            const keys = Object.keys(langTable);
            for (const key of keys) {
                const entry = langTable[key];
                if (entry && entry[fieldName] != null && entry[fieldName] !== '') {
                    const value = String(entry[fieldName]);
                    if (String(fieldName).toLowerCase() === 'display_name' && this.isLikelyPhone(value)) continue;
                    if (this.isValidAutoName(value)) return value.trim();
                }
            }
        }

        // Fallback to direct i18n structure (legacy format)
        for (const code of preferred) {
            const entry = i18n[code];
            if (entry && entry[fieldName] != null && entry[fieldName] !== '') {
                const value = String(entry[fieldName]);
                if (String(fieldName).toLowerCase() === 'display_name' && this.isLikelyPhone(value)) continue;
                if (this.isValidAutoName(value)) return value.trim();
            }
        }

        // No valid translation found - return null instead of falling back to ID
        return null;
    }

    flattenTranslationFields(tableName, row, { lang, fallbackLang } = {}) {
        if (!row || typeof row !== 'object') return row;
        const clone = row;
        const preferred = this.getPreferredLangs(lang, fallbackLang);
        let translation = null;

        const recordId = clone.id ? String(clone.id) : null;
        if (recordId) {
            const payload = this.getTranslationsPayload(lang, fallbackLang);
            const tableTranslations = payload.translations?.[tableName] || payload.translations?.[tableName?.toLowerCase?.()] || null;
            if (tableTranslations && tableTranslations[recordId]) {
                translation = tableTranslations[recordId];
            }
        }

        if (!translation) {
            const i18n = clone.i18n || {};
            const langContainer = i18n.lang && typeof i18n.lang === 'object' ? i18n.lang : null;
            if (langContainer) {
                for (const code of preferred) {
                    if (langContainer[code]) {
                        translation = langContainer[code];
                        break;
                    }
                }
                if (!translation) {
                    const keys = Object.keys(langContainer);
                    if (keys.length) translation = langContainer[keys[0]];
                }
            } else {
                for (const code of preferred) {
                    if (i18n[code]) {
                        translation = i18n[code];
                        break;
                    }
                }
                if (!translation) {
                    const keys = Object.keys(i18n).filter((key) => key !== 'lang');
                    if (keys.length) translation = i18n[keys[0]];
                }
            }
        }

        if (translation && typeof translation === 'object') {
            for (const [key, value] of Object.entries(translation)) {
                if (clone[key] === null || clone[key] === undefined || clone[key] === '') {
                    clone[key] = value;
                }
            }
            const langKey = preferred[0] || 'ar';
            if (!clone.i18n || typeof clone.i18n !== 'object') {
                clone.i18n = {};
            }
            if (!clone.i18n.lang || typeof clone.i18n.lang !== 'object') {
                clone.i18n.lang = {};
            }
            if (!clone.i18n.lang[langKey]) {
                clone.i18n.lang[langKey] = { ...translation };
            }
        }
        return clone;
    }

    getTranslationsPayload(lang, fallbackLang) {
        const key = `${lang || 'ar'}::${fallbackLang || 'ar'}`;
        if (!this.translationCache.has(key)) {
            this.translationCache.set(key, loadTranslationsPayload(this.store, { lang, fallbackLang }));
        }
        return this.translationCache.get(key);
    }

    getRowById(tableName, id) {
        if (!tableName || !id) return null;
        const normalizedTable = String(tableName).toLowerCase();
        const normalizedId = String(id);
        if (!this.rowCache.has(normalizedTable)) {
            const rows = this.store.listTable(tableName) || [];
            const map = new Map();
            for (const row of rows) {
                if (row && row.id) {
                    map.set(String(row.id), row);
                }
            }
            this.rowCache.set(normalizedTable, map);
        }
        const tableMap = this.rowCache.get(normalizedTable);
        return tableMap ? tableMap.get(normalizedId) || null : null;
    }

    resolveDisplayName(tableName, rowOrId, options = {}) {
        const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : this.maxDepth;
        const lang = options.lang || 'ar';
        const fallbackLang = options.fallbackLang || 'ar';
        const visited = options.visited || new Set();

        const row = (rowOrId && typeof rowOrId === 'object')
            ? rowOrId
            : this.getRowById(tableName, rowOrId);
        if (!row) return null;

        const recordId = row.id ? String(row.id) : null;
        const cacheKey = recordId ? `${tableName}:${recordId}:${lang}:${fallbackLang}` : null;
        if (!options.ignoreNameCache && cacheKey && this.nameCache.has(cacheKey)) {
            return this.nameCache.get(cacheKey);
        }

        const hasRule = !!this.schema.getDisplayRule(tableName);
        if (!options.ignoreCachedDisplay && !hasRule) {
            const cachedDisplay = this.resolveTranslationField(row, 'display_name', { lang, fallbackLang });
            if (cachedDisplay) {
                if (cacheKey) {
                    this.nameCache.set(cacheKey, cachedDisplay);
                }
                return cachedDisplay;
            }
        }

        const visitKey = recordId ? `${tableName}:${recordId}` : `${tableName}:${createId('row')}`;
        if (visited.has(visitKey)) {
            return null;
        }
        if (maxDepth <= 0) {
            return null;
        }
        visited.add(visitKey);

        const enriched = this.flattenTranslationFields(
            tableName,
            deepClone(row),
            { lang, fallbackLang }
        );

        let name = this.applyDisplayRule(tableName, enriched, { lang, fallbackLang, maxDepth, visited });
        if (!name) {
            name = this.applyAutoDisplay(tableName, enriched, { lang, fallbackLang, maxDepth, visited });
        }
        if (!name) {
            name = this.getTableLabel(tableName);
        }

        if (cacheKey) {
            this.nameCache.set(cacheKey, name);
        }
        visited.delete(visitKey);
        return name;
    }

    applyDisplayRule(tableName, row, options = {}) {
        const rule = this.schema.getDisplayRule(tableName);
        if (!rule) return null;

        const parts = Array.isArray(rule) ? rule : (Array.isArray(rule.parts) ? rule.parts : []);
        if (!parts.length) return null;

        const segments = [];
        let hasFieldValue = false;
        for (const part of parts) {
            if (part == null) continue;
            if (typeof part === 'string') {
                if (part.trim()) segments.push(part);
                continue;
            }
            if (typeof part !== 'object') continue;
            const type = String(part.type || 'field').toLowerCase();
            if (type === 'text') {
                const rawValue = part.value;
                if (rawValue != null) {
                    if (typeof rawValue === 'object') {
                        const preferred = this.getPreferredLangs(options.lang, options.fallbackLang);
                        let textValue = null;
                        for (const code of preferred) {
                            if (rawValue[code]) {
                                textValue = rawValue[code];
                                break;
                            }
                        }
                        if (!textValue) {
                            const keys = Object.keys(rawValue);
                            if (keys.length) textValue = rawValue[keys[0]];
                        }
                        if (textValue != null) segments.push(String(textValue));
                    } else {
                        segments.push(String(rawValue));
                    }
                }
                continue;
            }
            const fieldName = part.name || part.field;
            if (!fieldName) continue;
            let value = null;
            if (type === 'lang') {
                value = this.resolveTranslationField(row, fieldName, options);
            } else if (type === 'direct') {
                const direct = row[fieldName];
                if (direct != null && direct !== '') {
                    if (typeof direct === 'string') {
                        const trimmed = direct.trim();
                        value = this.isValidAutoName(trimmed) ? trimmed : null;
                    } else if (typeof direct === 'number') {
                        value = String(direct);
                    }
                }
            } else {
                value = this.resolveFieldValue(tableName, row, fieldName, options);
            }
            if (value) {
                segments.push(value);
                hasFieldValue = true;
            }
        }

        const joined = segments.join('');
        if (!hasFieldValue) return null;
        return joined && joined.trim() ? joined.trim() : null;
    }

    applyAutoDisplay(tableName, row, options = {}) {
        const displayField = this.schema.getDisplayField(tableName);
        if (displayField && typeof row[displayField] === 'string') {
            const value = row[displayField].trim();
            // Never use UUID as display name
            if (this.isValidAutoName(value)) {
                return value;
            }
        }

        // CRITICAL: Follow CRUD_SYSTEM.ar.md display_rule specification
        // 1. Check translation table (_lang) for FIRST nvarchar column
        // Use schema table definition directly for reliable field order
        const langTableName = `${tableName}_lang`;
        const langTableDef = this.schema.tables.get(langTableName.toLowerCase());
        const isPhoneField = (name) => /(^|_)(phone|mobile|tel)(_|$)/i.test(String(name || ''));

        if (langTableDef && Array.isArray(langTableDef.fields)) {
            for (const field of langTableDef.fields) {
                if (!field) continue;
                const colName = field.columnName || field.name;
                if (!colName) continue;
                const lower = String(colName).toLowerCase();

                // Skip system fields
                if (['id', 'lang', 'display_name', 'created_date', 'modified_date'].includes(lower)) continue;
                if (lower.endsWith('_id')) continue;
                if (isPhoneField(lower)) continue;

                // Check if it's nvarchar/text type
                const fieldType = String(field.type || '').toLowerCase();
                if (!['nvarchar', 'varchar', 'text'].includes(fieldType)) continue;

                // Try to get value from flattened row
                const raw = row[colName];
                if (typeof raw === 'string') {
                    const value = raw.trim();
                    if (this.isValidAutoName(value)) {
                        return value;
                    }
                }
            }
        }

        // 2. If no translation found, AND no translation table exists, check base table for FIRST nvarchar
        const tableDef = this.schema.tables.get(String(tableName).toLowerCase());
        if (!langTableDef && tableDef && Array.isArray(tableDef.fields)) {
            for (const field of tableDef.fields) {
                // Skip foreign key fields
                if (!field || field.references) continue;
                const column = field.columnName || field.name;
                if (!column) continue;
                // Skip known system fields
                const lower = String(column).toLowerCase();
                if (['id', 'created_date', 'modified_date', 'created_by', 'modified_by'].includes(lower)) continue;
                if (lower.endsWith('_id')) continue;
                if (isPhoneField(lower)) continue;

                const raw = row[column];
                if (typeof raw === 'string') {
                    const value = raw.trim();
                    // CRITICAL: Skip UUID values entirely
                    if (this.isValidAutoName(value)) {
                        return value;
                    }
                }
            }
        }

        // 3. Try foreign keys as last resort
        const fkPriority = this.schema.getDisplayFkPriority(tableName);
        const priority = Array.isArray(fkPriority) ? fkPriority.map((name) => String(name)) : [];
        const ignore = new Set(['company_id', 'branch_id', 'created_by', 'modified_by', 'user_insert']);
        const fkFields = Array.isArray(tableDef?.fields)
            ? tableDef.fields.filter((field) => field && field.references && field.columnName && !ignore.has(String(field.columnName)))
            : [];
        fkFields.sort((a, b) => {
            const aName = String(a.columnName);
            const bName = String(b.columnName);
            const aIdx = priority.indexOf(aName);
            const bIdx = priority.indexOf(bName);
            if (aIdx === -1 && bIdx === -1) return 0;
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
        });

        for (const field of fkFields) {
            const value = this.resolveFieldValue(tableName, row, field.columnName, options);
            if (value) return value;
        }

        // Return null instead of ID - let caller decide what to do
        return null;
    }

    resolveFieldValue(tableName, row, fieldName, options = {}) {
        if (!row || !fieldName) return null;
        const raw = row[fieldName];
        if (raw == null || raw === '') return null;

        if (typeof raw === 'object') {
            if (typeof raw.name === 'string' && raw.name.trim()) return raw.name.trim();
            if (typeof raw.label === 'string' && raw.label.trim()) return raw.label.trim();
            if (raw.id) {
                const targetTable = this.schema.getReferenceTarget(tableName, fieldName);
                if (targetTable) {
                    const nextDepth = Number.isFinite(options.maxDepth) ? options.maxDepth - 1 : this.maxDepth - 1;
                    return this.resolveDisplayName(targetTable, raw.id, {
                        ...options,
                        maxDepth: nextDepth
                    });
                }
            }
        }

        const targetTable = this.schema.getReferenceTarget(tableName, fieldName);
        if (targetTable) {
            const nextDepth = Number.isFinite(options.maxDepth) ? options.maxDepth - 1 : this.maxDepth - 1;
            return this.resolveDisplayName(targetTable, raw, {
                ...options,
                maxDepth: nextDepth
            });
        }

        if (typeof raw === 'string' && raw.trim()) {
            if (this.isValidAutoName(raw)) return raw.trim();
            return null;
        }
        if (typeof raw === 'number') return String(raw);
        return null;
    }

    getColumnsOrder(tableName) {
        const meta = this.schema.getColumnsMeta(tableName);
        if (Array.isArray(meta) && meta.length) {
            const ordered = meta
                .filter((entry) => entry && entry.name && entry.is_table_show !== false)
                .sort((a, b) => {
                    const aSort = Number.isFinite(a.sort) ? a.sort : 0;
                    const bSort = Number.isFinite(b.sort) ? b.sort : 0;
                    return aSort - bSort;
                })
                .map((entry) => String(entry.name));
            if (ordered.length) return ordered;
        }

        // Fallback: build order from table definition
        const tableDef = this.schema.tables.get(String(tableName).toLowerCase());
        const translationConfig = this.schema.getTranslationConfig(tableName);
        const translationFields = Array.isArray(translationConfig?.fields) ? translationConfig.fields : [];
        const cleanTranslations = translationFields.filter((field) => {
            const lower = String(field).toLowerCase();
            if (['id', 'lang', 'display_name', 'created_date', 'modified_date'].includes(lower)) return false;
            if (lower.endsWith('_id')) return false;
            return true;
        });

        const baseFields = Array.isArray(tableDef?.fields)
            ? tableDef.fields.map((field) => field.columnName || field.name).filter(Boolean)
            : [];

        const ordered = ['display_name']
            .concat(cleanTranslations)
            .concat(baseFields.filter((field) => !cleanTranslations.includes(field)));

        return Array.from(new Set(ordered));
    }

    getColumnsMeta(tableName) {
        const smartMeta = this.schema.getColumnsMeta(tableName);
        const autoMeta = this.buildAutoColumnsMeta(tableName);
        const normalizedAuto = Array.isArray(autoMeta) ? autoMeta : [];

        const smartFeatures = this.schema.getSmartFeatures(tableName) || {};
        const groupDefs = (smartFeatures.settings && smartFeatures.settings.groups) || {};
        const sequenceDefs = (smartFeatures.settings && smartFeatures.settings.sequences) || {};
        const orderedGroups = Object.keys(groupDefs)
            .map((id) => ({ id, order: groupDefs[id]?.order ?? 999 }))
            .sort((a, b) => a.order - b.order);
        const primaryGroup = orderedGroups.length ? orderedGroups[0].id : 'basic';

        const byName = new Map();
        normalizedAuto.forEach((entry) => {
            if (entry && entry.name) {
                byName.set(String(entry.name), { ...entry });
            }
        });

        if (Array.isArray(smartMeta)) {
            smartMeta.forEach((entry) => {
                if (!entry || !entry.name) return;
                const key = String(entry.name);
                const base = byName.get(key) || {};
                byName.set(key, { ...base, ...entry });
            });
        }

        const merged = Array.from(byName.values());
        let nextSort = 10;
        merged.forEach((entry) => {
            if (!entry) return;
            if (!Number.isFinite(entry.sort)) {
                entry.sort = nextSort;
                nextSort += 10;
            }
            if (!entry.group) entry.group = primaryGroup;
            const explicitTableShow = entry.is_table_show === true;
            if (entry.is_table_show === undefined) entry.is_table_show = entry.group === primaryGroup;
            if (explicitTableShow) entry.is_table_show = true; // honor explicit show regardless of group
            if (entry.is_edit_show === undefined) entry.is_edit_show = true;
            if (entry.is_searchable === undefined) entry.is_searchable = true;
            if (!entry.labels || typeof entry.labels !== 'object') {
                const fallback = this.humanizeColumnName(entry.name);
                entry.labels = { ar: fallback, en: fallback };
            } else {
                const fallback = this.humanizeColumnName(entry.name);
                if (!entry.labels.ar) entry.labels.ar = fallback;
                if (!entry.labels.en) entry.labels.en = fallback;
            }
            if (!entry.component) entry.component = null;
            if (entry.default_value === undefined) entry.default_value = null;
            if (entry.default_expr === undefined) entry.default_expr = null;
            if (entry.events === undefined) entry.events = null;
            if (sequenceDefs && Object.prototype.hasOwnProperty.call(sequenceDefs, entry.name)) {
                entry.sequence = sequenceDefs[entry.name];
                if (entry.readonly === undefined) entry.readonly = true;
            }
        });

        merged.sort((a, b) => {
            const aSort = Number.isFinite(a.sort) ? a.sort : 0;
            const bSort = Number.isFinite(b.sort) ? b.sort : 0;
            return aSort - bSort;
        });
        return merged;
    }

    buildAutoColumnsMeta(tableName) {
        const tableDef = this.schema.tables.get(String(tableName).toLowerCase());
        if (!tableDef) return [];

        const translationConfig = this.schema.getTranslationConfig(tableName);
        const translationFields = Array.isArray(translationConfig?.fields) ? translationConfig.fields : [];
        const cleanTranslations = translationFields.filter((field) => {
            const lower = String(field).toLowerCase();
            if (['id', 'lang', 'created_date', 'modified_date'].includes(lower)) return false;
            if (lower.endsWith('_id')) return false;
            return true;
        });

        const priority = [
            'display_name', 'name', 'title', 'label', 'full_name', 'code', 'number',
            'sequence', 'visit_sequence', 'status', 'type', 'category', 'kind',
            'service', 'room', 'clinic', 'department', 'specialty',
            'patient', 'doctor', 'device', 'station', 'package', 'contract',
            'booking', 'slot', 'visit_ticket', 'invoice', 'payment',
            'amount', 'price', 'qty', 'quantity', 'notes', 'begin_date',
            'created_date', 'modified_date'
        ];

        const baseFields = Array.isArray(tableDef.fields)
            ? tableDef.fields.map((field) => ({
                name: field.columnName || field.name,
                isFk: !!(field.references && field.references.table),
                label: field.label || field.columnName || field.name,
                label_ar: field.label_ar,
                label_en: field.label_en
            })).filter((field) => field.name)
            : [];

        const byName = new Map();
        const addMeta = (name, source, labelMeta = {}) => {
            if (!name) return;
            if (byName.has(name)) return;
            const fallback = this.humanizeColumnName(name);
            const labels = {
                ar: labelMeta.label_ar || labelMeta.label || fallback,
                en: labelMeta.label_en || labelMeta.label || fallback
            };
            byName.set(name, {
                name,
                source,
                labels
            });
        };

        if (!translationConfig) {
            addMeta('display_name', 'direct', { label: 'Display Name' });
        }

        cleanTranslations.forEach((field) => {
            addMeta(field, 'lang', { label: field });
        });

        baseFields
            .filter((field) => field.isFk)
            .forEach((field) => {
                addMeta(field.name, 'fk', field);
            });

        baseFields
            .filter((field) => !field.isFk)
            .forEach((field) => {
                addMeta(field.name, 'direct', field);
            });

        const rank = (name) => {
            const idx = priority.indexOf(String(name));
            return idx === -1 ? 999 : idx;
        };

        const entries = Array.from(byName.values());
        const groupRank = { display_name: 0, lang: 1, fk: 2, direct: 3 };
        entries.sort((a, b) => {
            const ga = groupRank[a.source] ?? 9;
            const gb = groupRank[b.source] ?? 9;
            if (ga !== gb) return ga - gb;
            const pa = rank(a.name);
            const pb = rank(b.name);
            if (pa !== pb) return pa - pb;
            return String(a.name).localeCompare(String(b.name));
        });

        let sort = 10;
        entries.forEach((entry) => {
            entry.sort = sort;
            entry.is_table_show = true;
            entry.is_edit_show = true;
            entry.is_searchable = true;
            entry.component = null;
            entry.default_value = null;
            entry.default_expr = null;
            entry.events = null;
            sort += 10;
        });

        // Always hide display_name from forms/tables (virtual field)
        entries.forEach((entry) => {
            if (String(entry.name).toLowerCase() === 'display_name') {
                entry.is_edit_show = false;
                entry.is_table_show = false;
            }
        });

        return entries;
    }

    async resolveSmartForeignKeys(tableName, rows, lang, fallbackLang, depth = 1) {
        const tableDef = this.schema.tables.get(tableName.toLowerCase());
        if (!tableDef || !tableDef.fields) {
            // Table not in schema or has no fields - return as-is
            return rows;
        }

        // A. Identify FK Fields
        const fkFields = tableDef.fields.filter(f =>
            f && f.references && f.references.table
        );

        // Heuristic pass: if schema misses FK metadata, infer from *_id columns
        const seen = new Set(fkFields.map(f => f.columnName.toLowerCase()));
        for (const field of (tableDef.fields || [])) {
            const col = (field && field.columnName || '').toLowerCase();
            if (!col.endsWith('_id')) continue;
            if (seen.has(col)) continue;
            const base = col.replace(/_id$/, '');
            const candidates = [base, base + 's', base + '_lang'];
            const target = candidates.find(name => this.schema.tables.has(name));
            if (target) {
                fkFields.push(Object.assign({}, field, { references: { table: target } }));
                seen.add(col);
            }
        }

        if (!fkFields.length) return rows;

        // B. Collect IDs to Fetch per Target Table
        //    Map<TargetTable, Set<ID>>
        const fetchPlan = new Map();

        for (const row of rows) {
            for (const field of fkFields) {
                const fkValue = row[field.columnName];
                if (!fkValue) continue;
                const fkId = typeof fkValue === 'object' ? fkValue.id || fkValue.Id || fkValue.uuid || fkValue.uid : fkValue;
                if (!fkId) continue;

                const targetTable = field.references.table;
                if (!fetchPlan.has(targetTable)) {
                    fetchPlan.set(targetTable, new Set());
                }
                fetchPlan.get(targetTable).add(fkId);
            }
        }

        // C. Bulk Fetch & Hydrate Targets
        //    Map<TargetTable, Map<ID, {id, name}>>
        const lookupCache = new Map();

        for (const [targetTable, idSet] of fetchPlan.entries()) {
            const ids = Array.from(idSet);
            if (!ids.length) continue;

            // 1. Fetch Raw Rows (mocking simple store 'listTable' or similar)
            //    In a real SQL env we'd use WHERE id IN (...), here we might filter listTable
            //    Note: This depends on Store capabilities. Assuming simple synchronous/async list.
            //    If Store is heavy, this implies N+1 if not optimized. We assume 'listTable' works.
            const rawTargets = (this.store.listTable(targetTable) || [])
                .filter(r => idSet.has(r.id));

            // 2. Recursively Hydrate the Target (to get ITS name translated!)
            //    This is the "Genius" part: The Doctor's Name is translated based on Lang.
            let hydratedTargets = attachTranslationsToRows(this.store, targetTable, rawTargets, { lang, fallbackLang });
            hydratedTargets = hydratedTargets.map((row) => this.flattenTranslationFields(targetTable, row, { lang, fallbackLang }));
            if (depth > 1) {
                hydratedTargets = await this.resolveSmartForeignKeys(targetTable, hydratedTargets, lang, fallbackLang, depth - 1);
            }

            // 3. Build lookup map
            const displayField = this.schema.getDisplayField(targetTable);

            const map = new Map();
            for (const t of hydratedTargets) {
                // Flatten: Extract translated name from i18n structure to top level
                const nameVal = this.resolveDisplayName(targetTable, t, {
                    lang,
                    fallbackLang,
                    maxDepth: Math.max(1, depth)
                }) || t[displayField];

                map.set(t.id, {
                    id: t.id,
                    name: nameVal || this.getTableLabel(targetTable)
                });
            }
            lookupCache.set(targetTable, map);
        }

        // D. Replace IDs with Objects (IN-PLACE for performance)
        // No deepClone - we modify rows directly since they're already cloned by caller if needed
        for (const row of rows) {
            for (const field of fkFields) {
                const val = row[field.columnName];
                if (!val) continue;
                if (typeof val === 'object' && (val.name || val.label)) {
                    const objName = field.columnName.replace(/_id$/i, '');
                    row[objName] = val;
                    continue;
                }

                const targetTable = field.references.table;
                const cache = lookupCache.get(targetTable);
                const objName = field.columnName.replace(/_id$/i, '');
                if (cache && cache.has(val)) {
                    // Strategy: Add new property with base name (company_id -> company)
                    // Keep original ID field for backward compatibility
                    row[objName] = cache.get(val);
                    continue;
                }

                const fallbackName = this.resolveDisplayName(targetTable, val, {
                    lang,
                    fallbackLang,
                    maxDepth: Math.max(1, depth)
                }) || this.getTableLabel(targetTable);
                row[objName] = { id: val, name: fallbackName };
            }
        }

        return rows;
    }
}

export default Hydrator;
