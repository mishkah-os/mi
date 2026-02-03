import config from './config/index.js';
import { loadTranslationsPayload } from './backend/i18nLoader.js';

const { DEFAULT_BRANCH_ID } = config;

export function resolveBranchId(url) {
    return url.searchParams.get('branch') || DEFAULT_BRANCH_ID;
}

export function resolveLangParam(url) {
    return (url.searchParams.get('lang') || 'ar').toLowerCase();
}

export function normalizeIdentifier(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function normalizeLangCode(code, fallback = 'ar') {
    if (!code || typeof code !== 'string') return fallback;
    return code.trim().toLowerCase() || fallback;
}

export function extractTranslationFields(record, fkColumn) {
    const fields = {};
    for (const [key, value] of Object.entries(record || {})) {
        const normalized = String(key || '').toLowerCase();
        if (normalized === 'id' || normalized === fkColumn.toLowerCase() || normalized === 'lang') continue;
        if (normalized === 'display_name') continue;
        if (normalized === 'created_date' || normalized === 'modified_date') continue;
        if (normalized.endsWith('_id') && normalized !== fkColumn.toLowerCase()) continue;
        fields[key] = value;
    }
    return fields;
}

export function buildTranslationBundle(store, tableName, recordId) {
    const langTable = `${tableName}_lang`;
    if (!store.tables || !store.tables.includes(langTable)) {
        return { translations: {}, fields: [] };
    }

    const fkColumn = `${tableName}_id`;
    const translations = {};
    const fields = new Set();
    const records = (store.listTable(langTable) || []).filter((row) => row[fkColumn] === recordId);

    for (const row of records) {
        const lang = normalizeLangCode(row.lang);
        const payload = extractTranslationFields(row, fkColumn);
        Object.keys(payload).forEach((key) => fields.add(key));
        translations[lang] = payload;
    }

    return { translations, fields: Array.from(fields) };
}

export function normalizeTranslationPayload(input = {}, opts = {}) {
    const strategy = input.__strategy || input.__mode || opts.defaultStrategy || 'merge';
    const upsert = {};
    const remove = [];

    if (Array.isArray(input.__delete)) {
        input.__delete.forEach((code) => {
            const normalized = normalizeLangCode(code);
            if (normalized) remove.push(normalized);
        });
    }

    for (const [lang, payload] of Object.entries(input || {})) {
        if (lang.startsWith('__')) continue;
        const normalizedLang = normalizeLangCode(lang);
        if (!normalizedLang) continue;

        if (payload === null || payload === undefined) {
            remove.push(normalizedLang);
            continue;
        }

        if (typeof payload !== 'object') continue;

        const filtered = {};
        for (const [field, value] of Object.entries(payload)) {
            if (value !== undefined) {
                filtered[field] = value;
            }
        }

        if (Object.keys(filtered).length > 0) {
            upsert[normalizedLang] = filtered;
        }
    }

    return { strategy, upsert, remove };
}

export function applyRecordTranslations(store, tableName, recordId, operations = {}) {
    const langTable = `${tableName}_lang`;
    if (!store.tables || !store.tables.includes(langTable)) {
        return [];
    }

    const fkColumn = `${tableName}_id`;
    const replaceAll = operations.strategy === 'replace';
    const upsert = operations.upsert || {};
    const toDelete = new Set((operations.remove || []).map(normalizeLangCode).filter(Boolean));

    const existing = (store.listTable(langTable) || []).filter((row) => row[fkColumn] === recordId);
    const kept = [];
    const seen = new Set();

    for (const row of existing) {
        const lang = normalizeLangCode(row.lang);
        if (!lang) continue;

        if (replaceAll || toDelete.has(lang)) {
            store.remove(langTable, { id: row.id });
            continue;
        }

        if (seen.has(lang)) {
            store.remove(langTable, { id: row.id });
            continue;
        }
        seen.add(lang);

        const payload = upsert[lang];
        if (payload && Object.keys(payload).length > 0) {
            const merged = { ...row, ...payload, [fkColumn]: recordId, lang };
            const saved = store.save(langTable, merged, { branchId: store.branchId });
            kept.push(saved.record || saved);
            delete upsert[lang];
        } else {
            kept.push(row);
        }
    }

    for (const [lang, payload] of Object.entries(upsert)) {
        if (!payload || typeof payload !== 'object') continue;
        const record = { ...payload, [fkColumn]: recordId, lang };
        const inserted = store.insert(langTable, record, { branchId: store.branchId });
        kept.push(inserted.record || inserted);
    }

    return kept;
}

export function listAvailableLanguages(store) {
    try {
        const seeded = store.listTable('languages');
        if (Array.isArray(seeded) && seeded.length) {
            return seeded.map((entry) => ({
                code: normalizeLangCode(entry.code),
                name: entry.name || entry.code,
                direction: entry.direction || (entry.code === 'ar' ? 'rtl' : 'ltr'),
                is_default: Boolean(entry.is_default),
                is_active: entry.is_active !== false
            }));
        }
    } catch (_err) {
        // fall back to translation discovery below
    }

    const fallback = loadTranslationsPayload(store, {});
    return (fallback.availableLanguages || []).map((code) => ({
        code,
        name: code.toUpperCase(),
        direction: code === 'ar' ? 'rtl' : 'ltr',
        is_default: code === 'ar',
        is_active: true
    }));
}

export function parseImageList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const arr = JSON.parse(value);
            return Array.isArray(arr) ? arr : [];
        } catch (_err) {
            return [];
        }
    }
    return [];
}

export function buildClassifiedLangIndex(entries) {
    const index = {};
    (entries || []).forEach((entry) => {
        if (!entry || !entry.classified_id || !entry.lang) return;
        if (!index[entry.classified_id]) {
            index[entry.classified_id] = {};
        }
        index[entry.classified_id][entry.lang.toLowerCase()] = entry;
    });
    return index;
}

export function selectClassifiedTranslation(record, langIndex, lang) {
    const bucket = langIndex[record.classified_id] || {};
    return bucket[lang] || bucket['ar'] || bucket['en'] || null;
}

export function mapClassifiedRecord(record, langIndex, lang) {
    const translation = selectClassifiedTranslation(record, langIndex, lang);
    const images = parseImageList(record.images);
    return {
        id: record.classified_id,
        seller_id: record.seller_id,
        category_id: record.category_id,
        title: translation?.title || record.title,
        description: translation?.description || record.description || '',
        price: record.price != null ? Number(record.price) : null,
        currency: record.currency || 'EGP',
        images,
        contact_phone: record.contact_phone || '',
        contact_whatsapp: record.contact_whatsapp || '',
        location_city: record.location_city || '',
        location_district: record.location_district || '',
        status: record.status || 'active',
        expires_at: record.expires_at || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        published_at: record.published_at,
        views_count: record.views_count || 0,
        leads_count: record.leads_count || 0
    };
}

export function normalizeImageList(value) {
    if (!value) return '[]';
    let arr = [];
    if (Array.isArray(value)) {
        arr = value;
    } else if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            arr = Array.isArray(parsed) ? parsed : value.split(',').map((part) => part.trim());
        } catch (_err) {
            arr = value.split(',').map((part) => part.trim());
        }
    }
    const sanitized = arr
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .slice(0, 12);
    return JSON.stringify(sanitized);
}

export function normalizeFilterClauses(filterInput) {
    if (!filterInput) return [];
    if (Array.isArray(filterInput)) {
        return filterInput.filter((entry) => entry && typeof entry === 'object');
    }
    if (typeof filterInput === 'object') {
        return [filterInput];
    }
    return [];
}

export function normalizeOperator(value) {
    if (!value || typeof value !== 'string') return '=';
    return value.trim().toLowerCase();
}

export function evaluateFilterCondition(fieldValue, clause) {
    if (clause && typeof clause === 'object' && clause.operator !== undefined) {
        const operator = normalizeOperator(clause.operator);
        const expected = clause.value;
        switch (operator) {
            case '=':
            case 'eq':
                return fieldValue === expected;
            case '!=':
            case '<>':
            case 'ne':
                return fieldValue !== expected;
            case '>':
            case 'gt':
                return Number(fieldValue) > Number(expected);
            case '>=':
            case 'gte':
                return Number(fieldValue) >= Number(expected);
            case '<':
            case 'lt':
                return Number(fieldValue) < Number(expected);
            case '<=':
            case 'lte':
                return Number(fieldValue) <= Number(expected);
            case 'in': {
                const list = Array.isArray(expected) ? expected : [expected];
                return list.some((entry) => entry === fieldValue);
            }
            case 'not in':
            case 'nin': {
                const list = Array.isArray(expected) ? expected : [expected];
                return !list.some((entry) => entry === fieldValue);
            }
            case 'like': {
                if (typeof fieldValue !== 'string' || typeof expected !== 'string') return false;
                const regex = new RegExp(expected.replace(/[%_]/g, '.*'), 'i');
                return regex.test(fieldValue);
            }
            default:
                return false;
        }
    }
    return fieldValue === clause;
}

export function applyModuleFilters(rows, filterInput) {
    const clauses = normalizeFilterClauses(filterInput);
    if (!clauses.length) return rows;
    return rows.filter((row) =>
        clauses.every((clause) =>
            Object.entries(clause).every(([field, condition]) => evaluateFilterCondition(row?.[field], condition))
        )
    );
}

export function applyModuleOrdering(rows, orderInput) {
    if (!orderInput) return rows;
    const descriptors = Array.isArray(orderInput) ? orderInput : [orderInput];
    const normalized = descriptors
        .map((entry) => {
            if (typeof entry === 'string') {
                return { field: entry, direction: 'asc' };
            }
            if (Array.isArray(entry) && entry.length) {
                return { field: entry[0], direction: entry[1] || 'asc' };
            }
            if (entry && typeof entry === 'object' && entry.field) {
                return { field: entry.field, direction: entry.direction || entry.dir || 'asc' };
            }
            return null;
        })
        .filter((item) => item && item.field);
    if (!normalized.length) return rows;
    const copy = rows.slice();
    copy.sort((a, b) => {
        for (const descriptor of normalized) {
            const direction = String(descriptor.direction || 'asc').toLowerCase() === 'desc' ? -1 : 1;
            const av = a?.[descriptor.field];
            const bv = b?.[descriptor.field];
            if (av == null && bv == null) continue;
            if (av == null) return 1 * direction;
            if (bv == null) return -1 * direction;
            if (av === bv) continue;
            if (typeof av === 'number' && typeof bv === 'number') {
                return av > bv ? direction : -direction;
            }
            const aStr = String(av).toLowerCase();
            const bStr = String(bv).toLowerCase();
            if (aStr === bStr) continue;
            return aStr > bStr ? direction : -direction;
        }
        return 0;
    });
    return copy;
}

export function resolveExpiryDate(input) {
    if (input && typeof input === 'string' && input.trim()) return input;
    const days = Number(process.env.CLASSIFIEDS_DEFAULT_EXPIRY_DAYS || 30);
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return future.toISOString();
}

export function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
}

export function parseModuleList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
        return Array.from(new Set(input.map((item) => normalizeIdentifier(item)).filter(Boolean)));
    }
    if (typeof input === 'string') {
        return parseModuleList(
            input
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
        );
    }
    return [];
}

export function buildServiceLangIndex(entries) {
    const index = {};
    (entries || []).forEach((entry) => {
        if (!entry || !entry.service_id || !entry.lang) return;
        if (!index[entry.service_id]) index[entry.service_id] = {};
        index[entry.service_id][entry.lang.toLowerCase()] = entry;
    });
    return index;
}

export function selectServiceTranslation(record, langIndex, lang) {
    const bucket = langIndex[record.service_id] || {};
    return bucket[lang] || bucket['ar'] || bucket['en'] || null;
}

export function mapServiceRecord(record, langIndex, lang) {
    const translation = selectServiceTranslation(record, langIndex, lang);
    const images = parseImageList(record.images);
    const portfolio = parseImageList(record.portfolio_urls);
    return {
        id: record.service_id,
        provider_id: record.provider_id,
        category_id: record.category_id,
        title: translation?.title || record.title || '',
        description: translation?.description || record.description || '',
        service_type: record.service_type || 'project_based',
        price_min: record.price_min != null ? Number(record.price_min) : null,
        price_max: record.price_max != null ? Number(record.price_max) : null,
        currency: record.currency || 'EGP',
        duration_min: record.duration_min != null ? Number(record.duration_min) : null,
        duration_max: record.duration_max != null ? Number(record.duration_max) : null,
        images,
        portfolio_urls: portfolio,
        video_url: record.video_url || '',
        location_city: record.location_city || '',
        is_remote: !!record.is_remote,
        is_onsite: !!record.is_onsite,
        availability: record.availability || null,
        rating_avg: record.rating_avg != null ? Number(record.rating_avg) : 0,
        rating_count: record.rating_count || 0,
        orders_completed: record.orders_completed || 0,
        views_count: record.views_count || 0,
        likes_count: record.likes_count || 0,
        saves_count: record.saves_count || 0,
        status: record.status || 'active',
        featured_until: record.featured_until || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        published_at: record.published_at
    };
}
