import logger from '../logger.js';
import { jsonResponse, readBody, nowIso } from '../utils/helpers.js';
import {
    listFullSyncFlags, serializeFullSyncFlag, upsertFullSyncFlag, disableFullSyncFlag
} from '../runtime/sync-state.js';

export function createManagementApi({
    getBranchModules,
    resetModule,
    purgeModuleLiveData,
    summarizePurgeHistoryEntry,
    listPurgeHistorySummaries,
    readPurgeHistoryEntry,
    restorePurgeHistoryEntry,
    normalizeTransactionTableList,
    emitFullSyncDirective,
    ACCEPTED_RESEED_CODES
}) {
    function normalizeModules(input, fallback = ['*']) {
        const values = [];
        if (Array.isArray(input)) {
            for (const value of input) {
                if (typeof value === 'string' && value.trim()) {
                    values.push(value.trim());
                }
            }
        } else if (typeof input === 'string' && input.trim()) {
            values.push(input.trim());
        }
        if (!values.length) return fallback.slice();
        return Array.from(new Set(values));
    }

    async function handleManagementApi(req, res, url) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 2 || segments[0] !== 'api' || segments[1] !== 'manage') {
            return false;
        }
        const resource = segments[2] || '';

        if (resource === 'full-sync') {
            if (req.method === 'GET') {
                const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId');
                const moduleParam = url.searchParams.get('module') || url.searchParams.get('moduleId');
                const branchId = branchParam && branchParam.trim() ? branchParam.trim() : null;
                const moduleId = moduleParam && moduleParam.trim() ? moduleParam.trim() : null;
                const flags = listFullSyncFlags({ branchId, moduleId }).map((entry) => serializeFullSyncFlag(entry));
                jsonResponse(res, 200, { branchId, moduleId, flags });
                return true;
            }

            if (req.method === 'POST' || req.method === 'PATCH') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }
                const branchRaw = body.branchId || body.branch;
                const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }
                const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
                const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
                const modules = normalizeModules(body.modules || body.moduleIds || body.moduleId || body.module, ['*']);
                const enabled = body.enabled !== false && body.status !== 'disable' && body.action !== 'disable';
                const responses = [];
                for (const moduleId of modules) {
                    const normalizedModule = moduleId && moduleId.trim ? moduleId.trim() : '*';
                    let entry;
                    if (enabled) {
                        entry = upsertFullSyncFlag(branchId, normalizedModule, {
                            reason,
                            requestedBy,
                            enabled: true,
                            meta: body.meta && typeof body.meta === 'object' ? body.meta : undefined
                        });
                    } else {
                        entry = disableFullSyncFlag(branchId, normalizedModule, { requestedBy });
                    }
                    if (entry) {
                        emitFullSyncDirective(entry, { toggledVia: 'management-api' });
                        responses.push(serializeFullSyncFlag(entry));
                    }
                }
                jsonResponse(res, 200, { branchId, flags: responses, enabled });
                return true;
            }

            if (req.method === 'DELETE') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (_error) {
                    body = {};
                }
                const branchParam = body.branchId || body.branch || url.searchParams.get('branch') || url.searchParams.get('branchId');
                const branchId = typeof branchParam === 'string' && branchParam.trim() ? branchParam.trim() : null;
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }
                const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim()
                    ? body.requestedBy.trim()
                    : null;
                const moduleParam = body.moduleId || body.module || body.modules || url.searchParams.get('module') || url.searchParams.get('moduleId');
                const modules = normalizeModules(moduleParam, ['*']);
                const disabled = [];
                for (const moduleId of modules) {
                    const entry = disableFullSyncFlag(branchId, moduleId, { requestedBy });
                    if (entry) {
                        emitFullSyncDirective(entry, { toggledVia: 'management-api' });
                        disabled.push(serializeFullSyncFlag(entry));
                    }
                }
                jsonResponse(res, 200, { branchId, flags: disabled, enabled: false });
                return true;
            }

            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        if (resource === 'daily-reset' || resource === 'reset') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            let body = {};
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return true;
            }
            const branchRaw = body.branchId || body.branch;
            const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
            if (!branchId) {
                jsonResponse(res, 400, { error: 'missing-branch-id' });
                return true;
            }
            const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
            const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'daily-reset';
            const moduleParam = body.moduleId || body.module || body.modules;
            let modules = normalizeModules(moduleParam, []);
            if (!modules.length) {
                modules = getBranchModules(branchId);
            }
            if (!modules.length) {
                jsonResponse(res, 404, { error: 'modules-not-found', branchId });
                return true;
            }
            const flagOnReset = body.flagFullSync !== false;
            const results = [];
            for (const moduleId of modules) {
                try {
                    const { store, historyEntry } = await resetModule(branchId, moduleId, { requestedBy, reason });
                    const summary = {
                        moduleId,
                        version: store.version,
                        resetAt: nowIso(),
                        status: 'ok'
                    };
                    if (historyEntry) {
                        const { filePath, ...historySummary } = historyEntry;
                        summary.historyEntry = historySummary;
                    }
                    if (flagOnReset) {
                        const flag = upsertFullSyncFlag(branchId, moduleId, { reason, requestedBy, enabled: true });
                        emitFullSyncDirective(flag, { toggledVia: 'management-api', reason: 'post-reset' });
                        summary.fullSyncFlag = serializeFullSyncFlag(flag);
                    }
                    results.push(summary);
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId }, 'Failed to perform daily reset');
                    results.push({ moduleId, status: 'error', error: error.message });
                }
            }
            jsonResponse(res, 200, { branchId, requestedBy, reason, results });
            return true;
        }

        if (resource === 'reseed' || resource === 'seed-reset' || resource === 'reset-seed') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            let body = {};
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return true;
            }

            const passRaw = body.passcode;
            const passcode = typeof passRaw === 'string' && passRaw.trim() ? passRaw.trim() : null;
            const confirmation = body.confirm ?? body.confirmation ?? body.confirmed ?? null;
            const confirmed =
                confirmation === true ||
                confirmation === 1 ||
                (typeof confirmation === 'string' && ['yes', 'y', 'true', '1'].includes(confirmation.toLowerCase()));

            if (!ACCEPTED_RESEED_CODES.size) {
                jsonResponse(res, 503, { error: 'reseed-disabled', message: 'Reseed passphrase is not configured.' });
                return true;
            }

            if (!passcode || !ACCEPTED_RESEED_CODES.has(passcode)) {
                jsonResponse(res, 403, { error: 'invalid-passcode', message: 'Reseed requires the confirmation code.' });
                return true;
            }

            if (!confirmed) {
                jsonResponse(res, 400, {
                    error: 'confirmation-required',
                    message: 'Set confirm=true to rebuild all tables from seed.'
                });
                return true;
            }

            const branchRaw = body.branchId || body.branch;
            const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
            if (!branchId) {
                jsonResponse(res, 400, { error: 'missing-branch-id' });
                return true;
            }

            const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
            const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'manual-reseed';
            const moduleParam = body.moduleId || body.module || body.modules;
            let modules = normalizeModules(moduleParam, []);
            if (!modules.length) {
                modules = getBranchModules(branchId);
            }
            if (!modules.length) {
                jsonResponse(res, 404, { error: 'modules-not-found', branchId });
                return true;
            }

            const results = [];
            for (const moduleId of modules) {
                try {
                    const { store, historyEntry, purgeHistoryEntry, totalRemoved } = await resetModule(branchId, moduleId, {
                        requestedBy,
                        reason
                    });
                    const summary = {
                        moduleId,
                        version: store.version,
                        resetAt: nowIso(),
                        status: 'ok',
                        purgedTables: purgeHistoryEntry?.tables || purgeHistoryEntry?.summary || [],
                        totalRemoved
                    };
                    if (historyEntry) {
                        const { filePath, ...historySummary } = historyEntry;
                        summary.historyEntry = historySummary;
                    }
                    results.push(summary);
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId }, 'Failed to reseed module');
                    results.push({ moduleId, status: 'error', error: error.message });
                }
            }

            jsonResponse(res, 200, {
                branchId,
                requestedBy,
                reason,
                confirmation: 'ok',
                results
            });
            return true;
        }

        if (resource === 'purge-live-data' || resource === 'purge-transactions' || resource === 'reset-live') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            let body = {};
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return true;
            }
            const branchRaw = body.branchId || body.branch;
            const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
            if (!branchId) {
                jsonResponse(res, 400, { error: 'missing-branch-id' });
                return true;
            }
            const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
            const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'purge-live-data';
            const moduleRaw = body.moduleId || body.module || body.targetModule;
            const moduleId = typeof moduleRaw === 'string' && moduleRaw.trim() ? moduleRaw.trim() : 'pos';
            const tablesInput =
                body.tables ??
                body.table ??
                body.tableNames ??
                body.targetTables ??
                body.transactionTables ??
                body.purgeTables ??
                null;
            const hasExplicitTables =
                Object.prototype.hasOwnProperty.call(body, 'tables') ||
                Object.prototype.hasOwnProperty.call(body, 'table') ||
                Object.prototype.hasOwnProperty.call(body, 'tableNames') ||
                Object.prototype.hasOwnProperty.call(body, 'targetTables') ||
                Object.prototype.hasOwnProperty.call(body, 'transactionTables') ||
                Object.prototype.hasOwnProperty.call(body, 'purgeTables');
            const tables = normalizeTransactionTableList(tablesInput, { fallbackToDefaults: !hasExplicitTables });
            if (!tables.length) {
                jsonResponse(res, 400, { error: 'no-tables-resolved', message: 'No tables matched the purge criteria.' });
                return true;
            }
            const resetEvents = body.resetEvents !== false;
            const broadcast = body.broadcast !== false;
            let result;
            try {
                result = await purgeModuleLiveData(branchId, moduleId, tables, {
                    requestedBy,
                    reason,
                    resetEvents,
                    broadcast
                });
            } catch (error) {
                const status = error?.code === 'MODULE_STORE_NOT_FOUND' ? 404 : 500;
                logger.warn({ err: error, branchId, moduleId }, 'Failed to purge module live data');
                jsonResponse(res, status, { error: 'purge-failed', message: error.message });
                return true;
            }
            jsonResponse(res, 200, {
                status: 'ok',
                branchId,
                moduleId,
                requestedBy,
                reason,
                resetEvents,
                broadcast,
                version: result.version,
                totalRemoved: result.totalRemoved,
                changed: result.changed,
                tables: result.cleared,
                eventMeta: result.eventMeta,
                historyEntry: result.historyEntry ? summarizePurgeHistoryEntry(result.historyEntry) : null
            });
            return true;
        }

        if (resource === 'purge-history') {
            if (req.method === 'GET') {
                const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId');
                const moduleParam =
                    url.searchParams.get('module') ||
                    url.searchParams.get('moduleId') ||
                    url.searchParams.get('targetModule') ||
                    'pos';
                const entryId = url.searchParams.get('entryId') || url.searchParams.get('id') || null;
                const branchId = branchParam && branchParam.trim() ? branchParam.trim() : null;
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }
                const moduleId = moduleParam && moduleParam.trim() ? moduleParam.trim() : 'pos';
                try {
                    if (entryId) {
                        const entry = await readPurgeHistoryEntry(branchId, moduleId, entryId);
                        if (!entry) {
                            jsonResponse(res, 404, { error: 'history-entry-not-found', entryId });
                            return true;
                        }
                        jsonResponse(res, 200, {
                            branchId,
                            moduleId,
                            entryId,
                            entry,
                            summary: summarizePurgeHistoryEntry(entry)
                        });
                        return true;
                    }
                    const entries = await listPurgeHistorySummaries(branchId, moduleId);
                    jsonResponse(res, 200, { branchId, moduleId, entries });
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId }, 'Failed to list purge history entries');
                    jsonResponse(res, 500, { error: 'history-unavailable', message: error.message });
                }
                return true;
            }

            if (req.method === 'POST') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }
                const branchRaw = body.branchId || body.branch;
                const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }
                const moduleRaw = body.moduleId || body.module || body.targetModule;
                const moduleId = typeof moduleRaw === 'string' && moduleRaw.trim() ? moduleRaw.trim() : 'pos';
                const entryId =
                    body.entryId ||
                    body.id ||
                    body.historyId ||
                    body.historyEntryId ||
                    null;
                if (!entryId) {
                    jsonResponse(res, 400, { error: 'missing-entry-id' });
                    return true;
                }
                const mode = body.mode === 'replace' ? 'replace' : 'append';
                const broadcast = body.broadcast !== false;
                const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
                const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'restore-purge-history';
                try {
                    const result = await restorePurgeHistoryEntry(branchId, moduleId, entryId, {
                        mode,
                        broadcast,
                        requestedBy,
                        reason
                    });
                    jsonResponse(res, 200, { ...result, mode });
                } catch (error) {
                    const status = error?.code === 'HISTORY_NOT_FOUND' ? 404 : 500;
                    logger.warn({ err: error, branchId, moduleId, entryId }, 'Failed to restore purge history entry');
                    jsonResponse(res, status, { error: 'history-restore-failed', message: error.message, entryId });
                }
                return true;
            }

            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        jsonResponse(res, 404, { error: 'management-endpoint-not-found', path: url.pathname });
        return true;
    }

    return {
        handleManagementApi
    };
}
