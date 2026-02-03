import { DEFAULT_MODULE_ID } from '../config/index.js';
import {
    resolveBranchId,
    applyModuleFilters,
    applyModuleOrdering,
    readBody,
    jsonResponse
} from '../utils/helpers.js';
import { ensureModuleStore } from '../database/module-store.js';
import { attachTranslationsToRows } from '../backend/i18nLoader.js';

export async function handleModuleQuery(req, res, url, { logger }) {
    if (url.pathname === '/api/query/module' && req.method === 'POST') {
        const startTime = Date.now();
        let body = {};
        try {
            body = (await readBody(req)) || {};
        } catch (error) {
            jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
            return;
        }
        const branchId = body.branchId || body.branch_id || resolveBranchId(url);
        const moduleId = body.moduleId || body.module_id || DEFAULT_MODULE_ID;
        const tableName = body.table || body.tableName || body.targetTable || null;
        if (!tableName) {
            jsonResponse(res, 400, { error: 'missing-table' });
            return;
        }
        try {
            const store = await ensureModuleStore(branchId, moduleId);
            if (!store.tables.includes(tableName)) {
                jsonResponse(res, 404, { error: 'table-not-found', branchId, moduleId, table: tableName });
                return;
            }
            let rows = store.listTable(tableName) || [];
            rows = applyModuleFilters(rows, body.where || body.filter);
            rows = applyModuleOrdering(rows, body.orderBy || body.sortBy);
            const offset = Number(body.offset);
            const limit = Number(body.limit);
            if (Number.isFinite(offset) && offset > 0) {
                rows = rows.slice(offset);
            }
            let limited = rows;
            if (Number.isFinite(limit) && limit >= 0) {
                limited = rows.slice(0, limit);
            }
            const lang = body.lang || body.locale || null;
            const fallbackLang = body.fallbackLang || body.fallback || 'ar';
            const localized = attachTranslationsToRows(store, tableName, limited, {
                lang,
                fallbackLang
            });
            const duration = Date.now() - startTime;
            jsonResponse(res, 200, {
                branchId,
                moduleId,
                table: tableName,
                count: localized.length,
                rows: localized,
                meta: {
                    queryTime: duration,
                    limit: Number.isFinite(limit) ? limit : null,
                    offset: Number.isFinite(offset) ? offset : null,
                    lang: lang || null,
                    fallbackLang
                }
            });
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId, table: tableName }, 'Module query failed');
            jsonResponse(res, 500, { error: 'module-query-failed', message: error.message });
        }
        return;
    }
}
