import Hydrator from '../backend/hydrator.js';

const INDEX_CACHE = new WeakMap();

function normalizeTableName(name) {
    return String(name || '').trim().toLowerCase();
}

function listCacheLanguages(store) {
    const langs = new Set();
    try {
        if (store && Array.isArray(store.tables)) {
            if (store.tables.includes('languages')) {
                (store.listTable('languages') || []).forEach((row) => {
                    if (row && row.code) langs.add(String(row.code).toLowerCase());
                });
            }
            store.tables.forEach((table) => {
                if (!table || !String(table).endsWith('_lang')) return;
                (store.listTable(table) || []).forEach((row) => {
                    if (row && row.lang) langs.add(String(row.lang).toLowerCase());
                });
            });
        }
    } catch (_err) {
        // ignore and fallback
    }
    if (!langs.size) {
        langs.add('ar');
        langs.add('en');
    }
    return Array.from(langs);
}

function extractDisplayFields(tableName, smartSchema) {
    const fields = new Set();
    const rule = smartSchema.getDisplayRule(tableName);
    if (rule) {
        const parts = Array.isArray(rule) ? rule : (Array.isArray(rule.parts) ? rule.parts : []);
        parts.forEach((part) => {
            if (!part || typeof part === 'string') return;
            if (typeof part !== 'object') return;
            const type = String(part.type || 'field').toLowerCase();
            if (type === 'text') return;
            const fieldName = part.name || part.field;
            if (fieldName) fields.add(String(fieldName));
        });
        return fields;
    }

    const displayField = smartSchema.getDisplayField(tableName);
    if (displayField) fields.add(String(displayField));
    ['name', 'title', 'label', 'display_name', 'full_name', 'code', 'number'].forEach((name) => fields.add(name));
    return fields;
}

function getDisplayRuleIndex(smartSchema) {
    if (INDEX_CACHE.has(smartSchema)) return INDEX_CACHE.get(smartSchema);

    const reverseDeps = new Map();
    for (const [tableName] of smartSchema.tables.entries()) {
        const displayFields = extractDisplayFields(tableName, smartSchema);
        displayFields.forEach((fieldName) => {
            const target = smartSchema.getReferenceTarget(tableName, fieldName);
            if (!target) return;
            const targetKey = normalizeTableName(target);
            if (!reverseDeps.has(targetKey)) reverseDeps.set(targetKey, []);
            reverseDeps.get(targetKey).push({
                table: normalizeTableName(tableName),
                field: String(fieldName)
            });
        });
    }

    const index = { reverseDeps };
    INDEX_CACHE.set(smartSchema, index);
    return index;
}

function findTranslationRow(store, baseTable, recordId, lang) {
    if (!store || !baseTable || !recordId || !lang) return null;
    const langTable = `${baseTable}_lang`;
    if (!Array.isArray(store.tables) || !store.tables.includes(langTable)) return null;
    const fkColumn = `${baseTable}_id`;
    const normalizedLang = String(lang).toLowerCase();
    return (store.listTable(langTable) || []).find((row) => {
        if (!row) return false;
        const rowLang = row.lang ? String(row.lang).toLowerCase() : '';
        return rowLang === normalizedLang && String(row[fkColumn]) === String(recordId);
    }) || null;
}

function updateDisplayNameInTranslations(store, baseTable, recordId, lang, displayName) {
    const row = findTranslationRow(store, baseTable, recordId, lang);
    if (!row) return false;
    const nextValue = displayName == null ? '' : String(displayName);
    if (row.display_name === nextValue) return false;
    store.updateRecord(`${baseTable}_lang`, { id: row.id, display_name: nextValue });
    return true;
}

function listDependentRecords(store, tableName, field, recordId) {
    const rows = store.listTable(tableName) || [];
    return rows.filter((row) => row && String(row[field]) === String(recordId));
}

export async function refreshDisplayNameCache({
    store,
    smartSchema,
    tableName,
    recordId,
    logger,
    languages,
    visited,
    skipSelf
}) {
    if (!store || !smartSchema || !tableName || !recordId) return;
    const normalizedTable = normalizeTableName(tableName);
    const visitKey = `${normalizedTable}:${recordId}`;
    const visitedSet = visited || new Set();
    if (visitedSet.has(visitKey)) return;
    visitedSet.add(visitKey);

    const langs = Array.isArray(languages) && languages.length ? languages : listCacheLanguages(store);
    const fallbackLang = langs.includes('ar') ? 'ar' : (langs[0] || 'ar');

    let changed = false;
    if (!skipSelf) {
        const hydrator = new Hydrator(smartSchema, store);
        for (const lang of langs) {
            const displayName = hydrator.resolveDisplayName(normalizedTable, recordId, {
                lang,
                fallbackLang,
                ignoreCachedDisplay: true,
                ignoreNameCache: true
            });
            const updated = updateDisplayNameInTranslations(store, normalizedTable, recordId, lang, displayName);
            if (updated) changed = true;
        }
    }

    const depsIndex = getDisplayRuleIndex(smartSchema);
    const dependents = depsIndex.reverseDeps.get(normalizedTable) || [];
    if (!dependents.length) return;

    dependents.forEach((dep) => {
        const rows = listDependentRecords(store, dep.table, dep.field, recordId);
        rows.forEach((row) => {
            if (!row || !row.id) return;
            refreshDisplayNameCache({
                store,
                smartSchema,
                tableName: dep.table,
                recordId: row.id,
                logger,
                languages: langs,
                visited: visitedSet
            });
        });
    });
}
