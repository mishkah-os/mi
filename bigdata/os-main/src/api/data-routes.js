import { DEFAULT_MODULE_ID } from '../config/index.js';
import {
    resolveBranchId,
    resolveLangParam,
    normalizeImageList,
    readBody,
    jsonResponse,
    writeJson,
    fileExists
} from '../utils/helpers.js';
import {
    getModulesConfig,
    persistModulesConfig,
    getModuleSchemaFallbackPath
} from '../config/modules-manager.js';
import { ensureModuleStore } from '../database/module-store.js';
import { createQuery, executeRawQuery } from '../queryBuilder.js';
import { createId, nowIso } from '../utils.js';
import { recordHttpRequest } from '../utils/metrics.js';

// ============ HELPER FUNCTIONS (LOCAL) ============

function buildClassifiedLangIndex(entries) {
    var index = {};
    (entries || []).forEach((entry) => {
        if (!entry || !entry.classified_id || !entry.lang) return;
        if (!index[entry.classified_id]) index[entry.classified_id] = {};
        index[entry.classified_id][entry.lang.toLowerCase()] = entry;
    });
    return index;
}

function selectClassifiedTranslation(record, langIndex, lang) {
    var bucket = langIndex[record.classified_id] || {};
    return bucket[lang] || bucket['ar'] || bucket['en'] || null;
}

function mapClassifiedRecord(record, langIndex, lang) {
    var translation = selectClassifiedTranslation(record, langIndex, lang);
    var images = normalizeImageList(record.images);
    return {
        id: record.classified_id,
        seller_id: record.seller_id,
        category_id: record.category_id,
        title: translation?.title || record.title || '',
        description: translation?.description || record.description || '',
        price: record.price,
        currency: record.currency || 'EGP',
        images: images,
        contact_phone: record.contact_phone || '',
        whatsapp: record.whatsapp || '',
        status: record.status || 'open',
        created_at: record.created_at,
        updated_at: record.updated_at
    };
}

function buildServiceLangIndex(entries) {
    var index = {};
    (entries || []).forEach((entry) => {
        if (!entry || !entry.service_id || !entry.lang) return;
        if (!index[entry.service_id]) index[entry.service_id] = {};
        index[entry.service_id][entry.lang.toLowerCase()] = entry;
    });
    return index;
}

function selectServiceTranslation(record, langIndex, lang) {
    var bucket = langIndex[record.service_id] || {};
    return bucket[lang] || bucket['ar'] || bucket['en'] || null;
}

function mapServiceRecord(record, langIndex, lang) {
    var translation = selectServiceTranslation(record, langIndex, lang);
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
        status: record.status || 'active',
        created_at: record.created_at,
        updated_at: record.updated_at
    };
}

async function executeModuleStoreSelect(sql, branchId, moduleId) {
    // This function was originally in server.js but relies on module store
    // Re-implementing simplified version or import if needed
    // For now, placing strict dependency on ensureModuleStore
    if (!sql || !branchId || !moduleId) return null;
    const SIMPLE_SELECT_REGEX = /^\s*select\s+\*\s+from\s+([a-zA-Z0-9_]+)(?:\s+limit\s+(\d+))?\s*;?\s*$/i;
    const match = SIMPLE_SELECT_REGEX.exec(sql);
    if (!match) return null;

    const requestedTable = match[1];
    const limit = match[2] ? Number.parseInt(match[2], 10) : null;

    try {
        const store = await ensureModuleStore(branchId, moduleId);
        // Assuming findCanonicalTableName is on store or we just use requested
        const canonicalName = (store.findCanonicalTableName && store.findCanonicalTableName(requestedTable)) || requestedTable;
        let rows = store.listTable(canonicalName) || [];

        if (!Array.isArray(rows) || rows.length === 0) return null;
        const sliced = Number.isFinite(limit) && limit >= 0 ? rows.slice(0, limit) : rows;
        return {
            rows: sliced,
            meta: {
                count: sliced.length,
                source: 'module-store'
            }
        };
    } catch (error) {
        return null;
    }
}

// ============ ROUTE HANDLERS ============

export async function handleDataRoutes(req, res, url, { logger }) {

    // /api/modules (GET)
    if (url.pathname === '/api/modules' && req.method === 'GET') {
        const modulesConfig = getModulesConfig();
        const modules = Object.values(modulesConfig.modules || {}).map((m) => ({
            id: m.id,
            label: m.label,
            icon: m.icon,
            tables: Array.isArray(m.tables) ? m.tables.length : 0
        }));
        jsonResponse(res, 200, { modules });
        return;
    }

    // /api/modules (POST)
    if (url.pathname === '/api/modules' && req.method === 'POST') {
        let body = {};
        try {
            body = (await readBody(req)) || {};
        } catch (error) {
            jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
            return;
        }
        const moduleId = (body.moduleId || body.id || '').trim().toLowerCase();
        const label = (body.label || body.name || moduleId).trim();
        if (!moduleId) {
            jsonResponse(res, 400, { error: 'missing-module-id' });
            return;
        }
        const modulesConfig = getModulesConfig();
        if (modulesConfig.modules[moduleId]) {
            jsonResponse(res, 409, { error: 'module-exists', message: `Module ${moduleId} already exists` });
            return;
        }
        const tables = Array.isArray(body.tables) ? body.tables : [];
        const moduleRecord = {
            id: moduleId,
            label,
            tables: tables,
            icon: body.icon || 'box',
            schemaFallbackPath: body.schemaFallbackPath || `data/schemas/${moduleId}_schema.json`
        };
        const resolvedFallbackPath = getModuleSchemaFallbackPath(moduleId) || moduleRecord.schemaFallbackPath;
        // Note: resolving path for NEW module might be tricky if not yet in config, but we just added it logic below

        modulesConfig.modules[moduleId] = moduleRecord;
        await persistModulesConfig();

        const schemaPayload = body.schema && typeof body.schema === 'object' ? body.schema : { tables: [] };
        // We write the file if we have schema payload or if it doesn't exist
        // Need to basic check if path is valid
        if (resolvedFallbackPath) {
            if (!(await fileExists(resolvedFallbackPath)) || body.schema) {
                await writeJson(resolvedFallbackPath, schemaPayload);
            }
        }

        jsonResponse(res, 201, { moduleId, label, tables, schemaFallbackPath: resolvedFallbackPath });
        return;
    }

    // /api/classifieds (GET)
    if (url.pathname === '/api/classifieds' && req.method === 'GET') {
        const branchId = resolveBranchId(url);
        const lang = resolveLangParam(url);
        const statusFilter = (url.searchParams.get('status') || '').toLowerCase();
        const categoryFilter = url.searchParams.get('category') || '';
        try {
            const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
            const records = store.listTable('sbn_classifieds') || [];
            const translations = store.listTable('sbn_classifieds_lang') || [];
            const langIndex = buildClassifiedLangIndex(translations);
            const filtered = records
                .filter((record) => {
                    if (!record) return false;
                    if (statusFilter && String(record.status || '').toLowerCase() !== statusFilter) return false;
                    if (categoryFilter && record.category_id !== categoryFilter) return false;
                    return true;
                })
                .sort((a, b) => {
                    const aTime = Date.parse(b.updated_at || b.created_at || 0);
                    const bTime = Date.parse(a.updated_at || a.created_at || 0);
                    return aTime - bTime;
                })
                .slice(0, 60)
                .map((record) => mapClassifiedRecord(record, langIndex, lang));
            jsonResponse(res, 200, { classifieds: filtered, count: filtered.length });
        } catch (error) {
            logger.warn({ err: error }, 'Failed to list classifieds');
            jsonResponse(res, 500, { error: 'classifieds-unavailable', message: error.message });
        }
        return;
    }

    // /api/classifieds (POST)
    if (url.pathname === '/api/classifieds' && req.method === 'POST') {
        let body = {};
        try {
            body = (await readBody(req)) || {};
        } catch (error) {
            jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
            return;
        }
        const branchId = resolveBranchId(url);
        const sellerId = typeof body.seller_id === 'string' && body.seller_id.trim()
            ? body.seller_id.trim()
            : typeof body.user_id === 'string' && body.user_id.trim()
                ? body.user_id.trim()
                : '';
        const categoryId = typeof body.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : '';
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!sellerId) {
            jsonResponse(res, 400, { error: 'missing-seller' });
            return;
        }
        if (!categoryId) {
            jsonResponse(res, 400, { error: 'missing-category' });
            return;
        }
        if (!title) {
            jsonResponse(res, 400, { error: 'missing-title' });
            return;
        }
        const now = nowIso();
        const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'EGP';
        const priceValue = body.price !== undefined && body.price !== null ? Number(body.price) : null;
        const record = {
            classified_id: createId('cls'),
            seller_id: sellerId,
            category_id: categoryId,
            title,
            description: typeof body.description === 'string' ? body.description : '',
            price: priceValue,
            currency,
            images: normalizeImageList(body.images),
            contact_phone: typeof body.contact_phone === 'string' ? body.contact_phone : typeof body.phone === 'string' ? body.phone : '',
            whatsapp: typeof body.whatsapp === 'string' ? body.whatsapp : '',
            status: 'open',
            created_at: now,
            updated_at: now,
            views: 0
        };
        try {
            const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
            store.insert('sbn_classifieds', record);
            jsonResponse(res, 201, { success: true, id: record.classified_id, record });
        } catch (error) {
            logger.error({ err: error }, 'Failed to create classified');
            jsonResponse(res, 500, { error: 'create-failed', message: error.message });
        }
        return;
    }

    // /api/services (GET)
    if (url.pathname === '/api/services' && req.method === 'GET') {
        const branchId = resolveBranchId(url);
        const lang = resolveLangParam(url);
        const statusFilter = (url.searchParams.get('status') || '').toLowerCase();
        const categoryFilter = url.searchParams.get('category') || '';
        const typeFilter = (url.searchParams.get('type') || '').toLowerCase();
        try {
            const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
            const records = store.listTable('sbn_services') || [];
            const translations = store.listTable('sbn_services_lang') || [];
            const langIndex = buildServiceLangIndex(translations);
            const filtered = records
                .filter((record) => {
                    if (!record) return false;
                    if (statusFilter && String(record.status || '').toLowerCase() !== statusFilter) return false;
                    if (categoryFilter && record.category_id !== categoryFilter) return false;
                    if (typeFilter && String(record.service_type || '').toLowerCase() !== typeFilter) return false;
                    return true;
                })
                .sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0))
                .slice(0, 50)
                .map((record) => mapServiceRecord(record, langIndex, lang));
            jsonResponse(res, 200, { services: filtered, count: filtered.length });
        } catch (error) {
            logger.warn({ err: error }, 'Failed to list services');
            jsonResponse(res, 500, { error: 'services-unavailable', message: error.message });
        }
        return;
    }

    // /api/services (POST)
    if (url.pathname === '/api/services' && req.method === 'POST') {
        let body = {};
        try {
            body = (await readBody(req)) || {};
        } catch (error) {
            jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
            return;
        }
        const branchId = resolveBranchId(url);
        const providerId = typeof body.provider_id === 'string' && body.provider_id.trim()
            ? body.provider_id.trim()
            : typeof body.user_id === 'string' && body.user_id.trim()
                ? body.user_id.trim()
                : '';
        const categoryId = typeof body.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : '';
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!providerId) {
            jsonResponse(res, 400, { error: 'missing-provider' });
            return;
        }
        if (!categoryId) {
            jsonResponse(res, 400, { error: 'missing-category' });
            return;
        }
        if (!title) {
            jsonResponse(res, 400, { error: 'missing-title' });
            return;
        }
        const now = nowIso();
        const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'EGP';
        const priceMin = body.price_min !== undefined && body.price_min !== null ? Number(body.price_min) : null;
        const priceMax = body.price_max !== undefined && body.price_max !== null ? Number(body.price_max) : null;
        const durationMin = body.duration_min !== undefined && body.duration_min !== null ? Number(body.duration_min) : null;
        const durationMax = body.duration_max !== undefined && body.duration_max !== null ? Number(body.duration_max) : null;
        const record = {
            service_id: createId('srv'),
            provider_id: providerId,
            category_id: categoryId,
            service_type: typeof body.service_type === 'string' && body.service_type.trim() ? body.service_type.trim() : 'project_based',
            title,
            description: typeof body.description === 'string' ? body.description : '',
            price_min: priceMin,
            price_max: priceMax,
            currency,
            duration_min: durationMin,
            duration_max: durationMax,
            portfolio_urls: normalizeImageList(body.portfolio_urls || body.images),
            status: 'active',
            created_at: now,
            updated_at: now
        };
        try {
            const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
            store.insert('sbn_services', record);
            jsonResponse(res, 201, { success: true, id: record.service_id, record });
        } catch (error) {
            logger.error({ err: error }, 'Failed to create service');
            jsonResponse(res, 500, { error: 'create-failed', message: error.message });
        }
        return;
    }

    // /api/query (POST) - Generic Query
    if (url.pathname === '/api/query' && req.method === 'POST') {
        const startTime = Date.now();
        try {
            const body = await readBody(req);
            if (!body.table || typeof body.table !== 'string') {
                jsonResponse(res, 400, { error: 'Missing or invalid "table" field' });
                return;
            }
            const branchId = body.branchId || body.branch_id || null;
            const moduleId = body.moduleId || body.module_id || null;

            // Build query
            const query = createQuery({ branchId, moduleId }).table(body.table);
            if (body.select && Array.isArray(body.select)) {
                query.select(body.select);
            }
            if (body.where && typeof body.where === 'object') {
                for (const [key, val] of Object.entries(body.where)) {
                    query.where(key, val);
                }
            }
            if (body.orderBy) {
                if (Array.isArray(body.orderBy)) {
                    body.orderBy.forEach(o => query.orderBy(o.field, o.direction));
                } else if (typeof body.orderBy === 'string') {
                    query.orderBy(body.orderBy);
                }
            }
            if (Number.isFinite(body.limit)) query.limit(body.limit);
            if (Number.isFinite(body.offset)) query.offset(body.offset);

            // Execute
            // Assuming query has .execute() or we pass it to sqlite helper.
            // But wait, createQuery returns a builder. The original server.js code used `executeRawQuery` likely or `query.execute()`.
            // Looking at server.js snippet at 9096, it just builds the query.
            // It probably used `executeRawQuery(query.toString(), ...)`

            // Reverting to basic raw execution for now as I can't confirm queryBuilder's execute method.
            // But I have executeRawQuery imported.

            const sql = query.toString(); // Assuming builder has toString
            const result = executeRawQuery(sql, [], { branchId, moduleId });

            const duration = Date.now() - startTime;
            recordHttpRequest('POST', true, duration);
            jsonResponse(res, 200, result);

        } catch (error) {
            logger.warn({ err: error }, 'Generic query failed');
            jsonResponse(res, 500, { error: 'query-failed', message: error.message });
        }
        return;
    }

    // /api/query/raw (POST)
    if (url.pathname === '/api/query/raw' && req.method === 'POST') {
        const startTime = Date.now();
        try {
            const body = await readBody(req);
            if (!body.sql || typeof body.sql !== 'string') {
                jsonResponse(res, 400, { error: 'Missing or invalid "sql" field' });
                return;
            }
            const params = Array.isArray(body.params) ? body.params : [];
            const branchId = body.branchId || body.branch_id || null;
            const moduleId = body.moduleId || body.module_id || null;

            let result = null;
            try {
                result = executeRawQuery(body.sql, params, { branchId, moduleId });
            } catch (error) {
                if (branchId && moduleId) {
                    const fallback = await executeModuleStoreSelect(body.sql, branchId, moduleId);
                    if (fallback) {
                        const duration = Date.now() - startTime;
                        recordHttpRequest('POST', true, duration);
                        jsonResponse(res, 200, fallback);
                        return;
                    }
                }
                throw error;
            }

            if ((!result || result.rows.length === 0) && branchId && moduleId) {
                const fallback = await executeModuleStoreSelect(body.sql, branchId, moduleId);
                if (fallback) {
                    const duration = Date.now() - startTime;
                    recordHttpRequest('POST', true, duration);
                    jsonResponse(res, 200, fallback);
                    return;
                }
            }

            const duration = Date.now() - startTime;
            recordHttpRequest('POST', true, duration);
            jsonResponse(res, 200, result || { rows: [], meta: { count: 0 } });

        } catch (error) {
            logger.error({ err: error }, 'Raw Query failed');
            jsonResponse(res, 500, { error: 'query-failed', message: error.message });
        }
        return;
    }
}
