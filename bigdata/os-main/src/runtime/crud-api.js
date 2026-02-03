import Hydrator from '../backend/hydrator.js';
import {
    jsonResponse, readBody, resolveBranchId, normalizeIdentifier,
    buildTranslationBundle, normalizeTableName
} from '../utils/helpers.js';
import { findRecordUsingValue, buildRecordCursor, normalizeCursorInput } from './utils.js';
import { refreshDisplayNameCache } from './display-name-cache.js';

export function createCrudApi({
    ensureModuleStore,
    persistModuleStore,
    schemaManager,
    DEFAULT_MODULE_ID,
    logger
}) {

    // Helper: Resolve Lang Param
    function resolveLangParam(url) {
        return url.searchParams.get('lang') || null;
    }

    // Helper: List Available Languages
    function listAvailableLanguages(store) {
        // Basic implementation: check if store has translation tables or just return defaults
        // Logic inferred from standard usage
        return ['ar', 'en'];
    }

    async function handleUniversalCrudApi(req, res, url) {
        // Pattern: /api/v1/crud/:action/:table or /api/v1/crud/:table/:id

        // Clean path: remove prefix
        const pathStr = url.pathname.replace('/api/v1/crud/', '');
        const segments = pathStr.split('/').filter(Boolean);

        // Heuristic:
        // If segment 1 is "match" -> segment 2 is table -> search logic
        // If segment 2 is ID -> segment 1 is table -> get logic

        let action = 'list';
        let tableName = '';
        let id = null;

        if (segments[0] === 'tables') {
            action = 'meta-tables';
        } else if (segments[0] === 'match' && segments[1]) {
            action = 'search';
            tableName = segments[1];
        } else if (segments.length === 2 && segments[1] === 'search') {
            // POST /:table/search
            action = 'search';
            tableName = segments[0];
        } else if (segments.length === 2) {
            tableName = segments[0];
            id = segments[1];
            action = 'get';
        } else if (segments.length === 1) {
            tableName = segments[0];
            action = 'list';
        } else {
            jsonResponse(res, 404, { error: 'invalid-crud-path' });
            return;
        }

        if (req.method === 'POST' && action === 'list') {
            action = 'create';
        }
        if (req.method === 'PUT' && action === 'get') {
            action = 'update';
        }
        if (req.method === 'DELETE' && action === 'get') {
            action = 'delete';
        }

        // Context Resolving
        const branchId = resolveBranchId(url);
        const moduleId = url.searchParams.get('module') || DEFAULT_MODULE_ID;
        // Note: 'clinic' matches the schema name.

        try {
            const store = await ensureModuleStore(branchId, moduleId);

            // 1. Get/Init Smart Schema using Schema Manager
            let smart;
            try {
                smart = await schemaManager.getOrLoadSmartSchema(moduleId);
            } catch (error) {
                jsonResponse(res, 500, { error: 'schema-error', message: error.message, moduleId });
                return;
            }

            // 2. Hydrator
            const hydrator = new Hydrator(smart, store);
            const lang = resolveLangParam(url) || 'ar'; // Default Arabi
            const fallbackLang = url.searchParams.get('fallbackLang') || 'ar';

            // 3. Handlers
            if (req.method === 'GET') {

                if (action === 'meta-tables') {
                    const tableTypes = Array.isArray(smart.tableTypes) ? smart.tableTypes : [];

                    const isArabic = text => /[\u0600-\u06FF]/.test(String(text || ''));
                    const humanize = name => String(name || '')
                        .replace(/_/g, ' ')
                        .trim()
                        .replace(/\s+/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());

                    const classifyModule = (tableName) => {
                        const explicit = smart.getTableType(tableName);
                        if (explicit) return explicit;
                        const name = String(tableName || '').toLowerCase();
                        const settingsKeys = ['company', 'branch', 'clinic', 'department', 'room', 'device', 'item', 'service', 'doctor', 'patient', 'type', 'station', 'tariff', 'package'];
                        if (settingsKeys.some(key => name.includes(key))) return 'settings';
                        if (name.includes('report') || name.includes('history') || name.includes('trail')) return 'reports';
                        if (name.includes('log')) return 'logs';
                        return 'operations';
                    };

                    const resolveLabels = (def) => {
                        const translations = (def && def.translations) ? (def.translations.label || def.translations.name || {}) : {};
                        const labels = Object.assign({}, translations);
                        const raw = def.label || '';
                        const arabic = def.label_ar || (isArabic(raw) ? raw : null) || humanize(def.name);
                        const english = def.label_en || (!isArabic(raw) ? raw : null) || humanize(def.name);
                        labels.ar = labels.ar || arabic;
                        labels.en = labels.en || english;
                        return labels;
                    };

                    const tables = [];
                    for (const [tName, def] of smart.tables.entries()) {
                        const labels = resolveLabels(def);
                        const icon = smart.getTableIcon(tName) || (def.icon) || (labels.ar ? labels.ar.charAt(0) : def.name.charAt(0)).toUpperCase();

                        // Extract FK references from schema
                        const fkReferences = [];
                        if (def.fields && Array.isArray(def.fields)) {
                            def.fields.forEach(field => {
                                if (field.references && field.references.table) {
                                    fkReferences.push({
                                        columnName: field.columnName || field.name,
                                        targetTable: field.references.table
                                    });
                                }
                            });
                        }

                        // Extract module_id and settings from smart_features
                        const smartFeatures = def.smart_features || {};
                        const tableModuleId = smartFeatures.module_id || null;
                        const settings = smartFeatures.settings || null;

                        tables.push({
                            id: def.name,
                            name: def.name,
                            label: labels.ar || def.label || def.name,
                            labels,
                            icon,
                            type: classifyModule(def.name),
                            is_translatable: def.is_translatable,
                            module_id: tableModuleId,
                            settings: settings,
                            fkReferences: fkReferences
                        });
                    }

                    // Extract modules from schema
                    const modules = Array.isArray(smart.schema?.modules) ? smart.schema.modules : [];

                    jsonResponse(res, 200, { tables, tableTypes, modules });
                    return;
                }

                if (action === 'get') {
                    // Find by ID
                    const found = findRecordUsingValue(store, tableName, id);
                    if (!found) {
                        jsonResponse(res, 404, { error: 'record-not-found', id });
                        return;
                    }

                    const hydrated = await hydrator.hydrate(tableName, [found.record], lang, fallbackLang);
                    const translationBundle = buildTranslationBundle(store, tableName, id);
                    const columnsOrder = hydrator.getColumnsOrder(tableName);
                    const columnsMeta = hydrator.getColumnsMeta(tableName);
                    jsonResponse(res, 200, {
                        record: hydrated[0],
                        translations: translationBundle.translations,
                        translationFields: translationBundle.fields,
                        languages: listAvailableLanguages(store),
                        columnsOrder,
                        columnsMeta
                    });
                    return;
                }

                if (action === 'search' || action === 'list') {
                    // Get All
                    const rows = store.listTable(tableName) || [];
                    const columnsOrder = hydrator.getColumnsOrder(tableName);
                    const columnsMeta = hydrator.getColumnsMeta(tableName);

                    // Filter by 'q'
                    const q = url.searchParams.get('q');
                    let filtered = rows;

                    const wantsMeta = url.searchParams.get('withMeta') === '1';

                    if (q && q.trim()) {
                        const term = q.trim().toLowerCase();
                        // Smart Search: Hydrate -> Filter (MVP)
                        const hydratedAll = await hydrator.hydrate(tableName, rows, lang, fallbackLang);

                        filtered = hydratedAll.filter(row => {
                            const searchable = new Set(['display_name']);
                            if (Array.isArray(columnsMeta) && columnsMeta.length) {
                                columnsMeta.forEach((col) => {
                                    if (col && col.name && col.is_searchable !== false) {
                                        searchable.add(col.name);
                                    }
                                });
                            } else {
                                ['name', 'title', 'code', 'phone', 'mobile'].forEach((name) => searchable.add(name));
                            }
                            return Array.from(searchable).some(field => {
                                const val = row[field];
                                if (typeof val === 'string' && val.toLowerCase().includes(term)) return true;
                                if (typeof val === 'number' && String(val).includes(term)) return true;
                                return false;
                            });
                        });
                    } else {
                        filtered = await hydrator.hydrate(tableName, rows, lang, fallbackLang);
                    }

                    // Pagination
                    const total = filtered.length;
                    const page = Number(url.searchParams.get('page')) || 1;
                    const limit = Number(url.searchParams.get('limit')) || 20;
                    const start = (page - 1) * limit;
                    const paginated = filtered.slice(start, start + limit);

                    const response = { data: paginated, count: total, page, limit, columnsOrder, columnsMeta };
                    if (wantsMeta) {
                        response.meta = {
                            total,
                            fetched: paginated.length,
                            source: 'direct-store'
                        };
                    }
                    jsonResponse(res, 200, response);
                    return;
                }
            }

            // Write Operations
            if (req.method === 'POST' && action === 'create') {
                const body = await readBody(req).catch(() => ({}));
                let payload = body;
                if (!payload || typeof payload !== 'object') {
                    jsonResponse(res, 400, { error: 'invalid-payload' });
                    return;
                }

                // Extract _lang if present (optional i18n support)
                const langData = payload._lang && typeof payload._lang === 'object' ? payload._lang : null;
                if (langData) {
                    delete payload._lang; // Remove from base record payload
                }

                // TODO: Apply system fields logic if available (pending Step 12)
                // if (typeof applySystemFields === 'function') {
                //     payload = applySystemFields(payload, { created: true });
                // }

                if (!payload.id) {
                    // Try to generate ID via sequence? Or just createId?
                    // server.runtime.js used createId usually, or relying on store.insert to handle ID check?
                    // store.insert generates ID if missing usually.
                }

                const result = store.insert(tableName, payload, { source: 'universal-crud' });
                const recordId = result.id || result.Id || result.uuid;

                // If _lang was provided, create translation entries
                if (langData && recordId) {
                    const langTable = `${tableName}_lang`;
                    const fkColumn = `${tableName}_id`;

                    // Check if lang table exists
                    if (store.tables && store.tables.includes(langTable)) {
                        for (const [lang, fields] of Object.entries(langData)) {
                            if (fields && typeof fields === 'object') {
                                const langRecord = {
                                    id: result.id ? undefined : null, // Let store.insert generate ID
                                    [fkColumn]: recordId,
                                    lang: lang,
                                    ...fields
                                };
                                try {
                                    store.insert(langTable, langRecord, { source: 'universal-crud:lang' });
                                } catch (err) {
                                    logger.warn({ err, tableName, lang }, 'Failed to insert lang record');
                                }
                            }
                        }
                    }
                }

                await refreshDisplayNameCache({
                    store,
                    smartSchema: smart,
                    tableName,
                    recordId,
                    logger
                });

                await persistModuleStore(store);
                Hydrator.invalidateAll(store);

                const hydrated = await hydrator.hydrate(tableName, [result], lang, fallbackLang);

                const translationBundle = buildTranslationBundle(store, tableName, result.id);
                jsonResponse(res, 201, {
                    record: hydrated[0],
                    translations: translationBundle.translations,
                    translationFields: translationBundle.fields,
                    languages: listAvailableLanguages(store)
                });
                return;
            }

            if (req.method === 'PUT' && action === 'update') {
                const body = await readBody(req).catch(() => ({}));
                const payload = body;
                if (!payload || typeof payload !== 'object') {
                    jsonResponse(res, 400, { error: 'invalid-payload' });
                    return;
                }

                // Extract _lang if present (optional i18n support)
                const langData = payload._lang && typeof payload._lang === 'object' ? payload._lang : null;
                if (langData) {
                    delete payload._lang; // Remove from base record payload
                }

                // Verify existence
                const found = findRecordUsingValue(store, tableName, id);
                if (!found) {
                    jsonResponse(res, 404, { error: 'record-not-found', id });
                    return;
                }

                // Merge payload
                const merged = { ...found.record, ...payload };
                // Ensure ID match
                if (merged.id !== id) merged.id = id;

                // TODO: System fields update
                // if (typeof applySystemFields === 'function') {
                //      merged = applySystemFields(merged, { updated: true });
                // }

                const savedResult = store.save(tableName, merged, { source: 'universal-crud' });
                const savedRecord = savedResult.record;
                const recordId = savedRecord.id || savedRecord.Id || savedRecord.uuid;

                // If _lang was provided, upsert translation entries
                if (langData && recordId) {
                    const langTable = `${tableName}_lang`;
                    const fkColumn = `${tableName}_id`;

                    // Check if lang table exists
                    if (store.tables && store.tables.includes(langTable)) {
                        for (const [lang, fields] of Object.entries(langData)) {
                            if (fields && typeof fields === 'object') {
                                // Try to find existing lang record
                                const existingLangRows = (store.listTable(langTable) || []);
                                const existingLang = existingLangRows.find(row =>
                                    row[fkColumn] === recordId && row.lang === lang
                                );

                                if (existingLang) {
                                    // Update existing
                                    const updatedLang = { ...existingLang, ...fields };
                                    try {
                                        store.save(langTable, updatedLang, { source: 'universal-crud:lang' });
                                    } catch (err) {
                                        logger.warn({ err, tableName, lang }, 'Failed to update lang record');
                                    }
                                } else {
                                    // Insert new
                                    const langRecord = {
                                        [fkColumn]: recordId,
                                        lang: lang,
                                        ...fields
                                    };
                                    try {
                                        store.insert(langTable, langRecord, { source: 'universal-crud:lang' });
                                    } catch (err) {
                                        logger.warn({ err, tableName, lang }, 'Failed to insert lang record');
                                    }
                                }
                            }
                        }
                    }
                }

                await refreshDisplayNameCache({
                    store,
                    smartSchema: smart,
                    tableName,
                    recordId,
                    logger
                });

                await persistModuleStore(store);
                Hydrator.invalidateAll(store);

                const hydrated = await hydrator.hydrate(tableName, [savedRecord], lang, fallbackLang);
                const translationBundle = buildTranslationBundle(store, tableName, savedRecord.id);
                jsonResponse(res, 200, {
                    record: hydrated[0],
                    translations: translationBundle.translations,
                    translationFields: translationBundle.fields,
                    languages: listAvailableLanguages(store)
                });
                return;
            }

            if (req.method === 'DELETE' && action === 'delete') {
                let translationsRemoved = 0;
                const langTable = `${tableName}_lang`;
                const fkColumn = `${tableName}_id`;
                if (store.tables && store.tables.includes(langTable)) {
                    const langRows = (store.listTable(langTable) || []).filter((row) => row[fkColumn] === id);
                    for (const row of langRows) {
                        store.remove(langTable, { id: row.id });
                        translationsRemoved += 1;
                    }
                }

                const removed = store.remove(tableName, { id });

                await refreshDisplayNameCache({
                    store,
                    smartSchema: smart,
                    tableName,
                    recordId: id,
                    logger,
                    skipSelf: true
                });

                await persistModuleStore(store);
                Hydrator.invalidateAll(store);

                jsonResponse(res, 200, {
                    deleted: removed.record || { id },
                    translationsRemoved
                });
                return;
            }

            // POST /search
            if (req.method === 'POST' && action === 'search') {
                const body = await readBody(req).catch(() => ({}));
                const q = body.q || '';
                const page = body.page || 1;
                const limit = body.limit || 100;

                let rows = store.listTable(tableName) || [];

                // Apply search filter
                if (q && q.trim()) {
                    const term = q.trim().toLowerCase();
                    const hydratedAll = await hydrator.hydrate(tableName, rows, lang, fallbackLang);
                    rows = hydratedAll.filter(row => {
                        const columnsMeta = hydrator.getColumnsMeta(tableName);
                        const searchable = new Set(['display_name']);
                        if (Array.isArray(columnsMeta) && columnsMeta.length) {
                            columnsMeta.forEach((col) => {
                                if (col && col.name && col.is_searchable !== false) {
                                    searchable.add(col.name);
                                }
                            });
                        } else {
                            ['name', 'title', 'code', 'phone', 'mobile'].forEach((name) => searchable.add(name));
                        }
                        return Array.from(searchable).some(field => {
                            const val = row[field];
                            if (typeof val === 'string' && val.toLowerCase().includes(term)) return true;
                            if (typeof val === 'number' && String(val).includes(term)) return true;
                            return false;
                        });
                    });
                } else {
                    rows = await hydrator.hydrate(tableName, rows, lang, fallbackLang);
                }

                // Pagination
                const total = rows.length;
                const start = (page - 1) * limit;
                const paginated = rows.slice(start, start + limit);

                const columnsOrder = hydrator.getColumnsOrder(tableName);
                const columnsMeta = hydrator.getColumnsMeta(tableName);
                jsonResponse(res, 200, { data: paginated, count: total, page, limit, columnsOrder, columnsMeta });
                return;
            }
        } catch (error) {
            logger.error({ err: error, branchId, moduleId, tableName }, 'Universal CRUD Error');
            jsonResponse(res, 500, { error: 'universal-crud-error', message: error.message });
            return;
        }
        jsonResponse(res, 405, { error: 'method-not-allowed' });
    }

    return {
        handleUniversalCrudApi
    };
}
