import logger from '../logger.js';
import { jsonResponse, readBody, nowIso, deepClone, normalizeIdentifier } from '../utils/helpers.js';
import { safeDecode, normalizeCursorInput, buildRecordCursor } from '../runtime/utils.js';
import { toTimestamp } from '../runtime/pos-normalization.js';
import { isVersionConflict, versionConflictDetails } from '../database/module-store.js';
import { loadEventMeta, updateEventMeta } from '../eventStore.js';
import { ensureArray } from '../backend/query-helpers.js';

export function createBranchesApi({
    branchConfig,
    modulesConfig,
    listBranchSummaries,
    getBranchModules,
    persistBranchConfig,
    ensureBranchDirectory,
    scaffoldBranchModule,
    buildBranchSnapshot,
    ensureModuleStore,
    sanitizeModuleSnapshot,
    resetModule,
    savePosOrder,
    fetchPosOrderSnapshot,
    buildAckOrder,
    handleModuleEvent,
    sequenceManager,
    BRANCHES_DIR,
    traversePath,
    parseModuleList,
    getModuleEventStoreContext,
    ensureSyncState,
    extractClientSnapshotMarker,
    resolveServerSnapshotMarker,
    evaluateConcurrencyGuards
}) {

    async function handleBranchesApi(req, res, url) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length === 2) {
            if (req.method === 'GET') {
                jsonResponse(res, 200, { branches: listBranchSummaries() });
                return;
            }
            if (req.method === 'POST') {
                let body = {};
                try {
                    body = (await readBody(req)) || {};
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return;
                }
                const branchId = normalizeIdentifier(body.id || body.branchId || body.name);
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return;
                }
                if (branchConfig.branches?.[branchId]) {
                    jsonResponse(res, 409, { error: 'branch-exists', branchId });
                    return;
                }
                const modules = parseModuleList(body.modules);
                for (const moduleId of modules) {
                    if (!modulesConfig.modules?.[moduleId]) {
                        jsonResponse(res, 400, { error: 'module-not-registered', moduleId });
                        return;
                    }
                }
                const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : branchId;
                branchConfig.branches = branchConfig.branches || {};
                branchConfig.branches[branchId] = { label, modules };
                await persistBranchConfig();
                await ensureBranchDirectory(branchId);
                const schemaOverrides = body.schemas && typeof body.schemas === 'object' ? body.schemas : {};
                for (const moduleId of modules) {
                    const override = schemaOverrides[moduleId];
                    await scaffoldBranchModule(branchId, moduleId, {
                        schema: override && typeof override === 'object' ? override : undefined
                    });
                }
                jsonResponse(res, 201, { branchId, label, modules });
                return;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        const branchId = safeDecode(segments[2]);

        if (segments.length === 4 && segments[3] === 'modules') {
            if (req.method === 'GET') {
                jsonResponse(res, 200, { branchId, modules: getBranchModules(branchId) });
                return;
            }
            if (req.method === 'POST') {
                let body = {};
                try {
                    body = (await readBody(req)) || {};
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return;
                }
                const moduleId = normalizeIdentifier(body.id || body.moduleId || body.name);
                if (!moduleId) {
                    jsonResponse(res, 400, { error: 'missing-module-id' });
                    return;
                }
                if (!modulesConfig.modules?.[moduleId]) {
                    jsonResponse(res, 404, { error: 'module-not-found', moduleId });
                    return;
                }
                const existing = new Set(getBranchModules(branchId));
                existing.add(moduleId);
                branchConfig.branches = branchConfig.branches || {};
                const branchEntry = branchConfig.branches[branchId] || { label: branchId, modules: [] };
                branchEntry.modules = Array.from(existing);
                branchConfig.branches[branchId] = branchEntry;
                await persistBranchConfig();
                await scaffoldBranchModule(branchId, moduleId, {
                    schema: body.schema && typeof body.schema === 'object' ? body.schema : undefined
                });
                jsonResponse(res, 200, { branchId, modules: branchEntry.modules });
                return;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        if (segments.length === 3) {
            if (req.method === 'GET') {
                const snapshot = await buildBranchSnapshot(branchId);
                jsonResponse(res, 200, snapshot);
                return;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        if (segments[3] !== 'modules' || segments.length < 5) {
            jsonResponse(res, 404, { error: 'not-found' });
            return;
        }

        const moduleId = segments[4];
        const modules = getBranchModules(branchId);
        if (!modules.includes(moduleId)) {
            jsonResponse(res, 404, { error: 'module-not-found' });
            return;
        }

        const store = await ensureModuleStore(branchId, moduleId);

        // Read lang from query string (e.g., ?lang=en)
        const lang = url.searchParams.get('lang') || null;
        const snapshot = sanitizeModuleSnapshot(store.getSnapshot({ lang }));

        if (segments.length === 5) {
            if (req.method === 'GET') {
                jsonResponse(res, 200, snapshot);
                return;
            }
            if (req.method === 'POST') {
                try {
                    const body = await readBody(req);
                    jsonResponse(res, 200, { received: body, snapshot });
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                }
                return;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        const tail = segments.slice(5);

        // Handle sequences endpoint
        if (tail.length === 1 && tail[0] === 'sequences') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }
            let body = {};
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
            const tableName =
                (typeof body.table === 'string' && body.table.trim()) ||
                (typeof body.tableName === 'string' && body.tableName.trim()) ||
                null;
            const fieldName =
                (typeof body.field === 'string' && body.field.trim()) ||
                (typeof body.fieldName === 'string' && body.fieldName.trim()) ||
                null;
            if (!tableName || !fieldName) {
                jsonResponse(res, 400, { error: 'missing-table-or-field' });
                return;
            }
            const wantsPreview = url.searchParams.get('preview') === '1' || body.preview === true;
            try {
                const allocation = wantsPreview
                    ? await sequenceManager.previewNextValue(branchId, moduleId, tableName, fieldName, {
                        record: body.record || null
                    })
                    : await sequenceManager.nextValue(branchId, moduleId, tableName, fieldName, {
                        record: body.record || null,
                        autoCreate: true
                    });
                if (!allocation) {
                    jsonResponse(res, 404, { error: 'sequence-not-configured', table: tableName, field: fieldName });
                    return;
                }
                jsonResponse(res, 200, {
                    branchId,
                    moduleId,
                    table: tableName,
                    field: fieldName,
                    value: allocation.value,
                    id: allocation.formatted,
                    rule: allocation.rule || null,
                    preview: wantsPreview === true
                });
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId, table: tableName, field: fieldName }, 'Failed to allocate sequence');
                jsonResponse(res, 500, { error: 'sequence-allocation-failed', message: error.message });
            }
            return;
        }

        // Handle reset endpoint
        if (tail.length === 1 && tail[0] === 'reset') {
            if (req.method !== 'POST' && req.method !== 'GET') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }

            const diagnostics = {
                startTime: new Date().toISOString(),
                branchId,
                moduleId,
                stages: []
            };

            try {
                // STAGE 1: Validate inputs
                diagnostics.stages.push({ stage: 'validate-inputs', status: 'start', timestamp: new Date().toISOString() });
                if (!branchId || !moduleId) {
                    throw new Error(`Invalid parameters: branchId="${branchId}", moduleId="${moduleId}"`);
                }
                diagnostics.stages.push({ stage: 'validate-inputs', status: 'success', timestamp: new Date().toISOString() });

                logger.info({ branchId, moduleId }, '🔄 [RESET] Starting full module reset');
                console.log('🔄 [RESET] Full module reset for', { branchId, moduleId });

                // STAGE 2: Reset module data
                diagnostics.stages.push({ stage: 'reset-module-data', status: 'start', timestamp: new Date().toISOString() });
                try {
                    await resetModule(branchId, moduleId, { reason: 'branch-api-reset' });
                    diagnostics.stages.push({ stage: 'reset-module-data', status: 'success', timestamp: new Date().toISOString() });
                    logger.info({ branchId, moduleId }, '✅ [RESET] Module data reset to initial state');
                    console.log('✅ [RESET] Module data reset to initial state');
                } catch (err) {
                    diagnostics.stages.push({
                        stage: 'reset-module-data',
                        status: 'failed',
                        error: err.message,
                        stack: err.stack,
                        timestamp: new Date().toISOString()
                    });
                    throw new Error(`[STAGE: reset-module-data] ${err.message}`);
                }

                // STAGE 3: Import file system modules
                diagnostics.stages.push({ stage: 'import-fs-modules', status: 'start', timestamp: new Date().toISOString() });
                let fsRead, fsWrite, fsMkdir, path;
                try {
                    const fsModule = await import('fs/promises');
                    fsRead = fsModule.readFile;
                    fsWrite = fsModule.writeFile;
                    fsMkdir = fsModule.mkdir;
                    path = await import('path');
                    diagnostics.stages.push({ stage: 'import-fs-modules', status: 'success', timestamp: new Date().toISOString() });
                } catch (err) {
                    diagnostics.stages.push({
                        stage: 'import-fs-modules',
                        status: 'failed',
                        error: err.message,
                        stack: err.stack,
                        timestamp: new Date().toISOString()
                    });
                    throw new Error(`[STAGE: import-fs-modules] ${err.message}`);
                }

                // STAGE 4: Calculate sequence file path
                diagnostics.stages.push({ stage: 'calculate-paths', status: 'start', timestamp: new Date().toISOString() });
                let stateFilePath, sequenceKey;
                try {
                    const branchKey = encodeURIComponent(branchId);
                    stateFilePath = path.join(BRANCHES_DIR, branchKey, 'sequence-state.json');
                    sequenceKey = `${moduleId}:order_header:id`;
                    diagnostics.stateFilePath = stateFilePath;
                    diagnostics.sequenceKey = sequenceKey;
                    diagnostics.stages.push({ stage: 'calculate-paths', status: 'success', timestamp: new Date().toISOString() });
                } catch (err) {
                    diagnostics.stages.push({
                        stage: 'calculate-paths',
                        status: 'failed',
                        error: err.message,
                        stack: err.stack,
                        timestamp: new Date().toISOString()
                    });
                    throw new Error(`[STAGE: calculate-paths] ${err.message}`);
                }

                // STAGE 5: Reset sequence counter
                diagnostics.stages.push({ stage: 'reset-sequence-counter', status: 'start', timestamp: new Date().toISOString() });
                try {
                    const currentState = {};
                    currentState[sequenceKey] = {
                        last: 0,
                        updatedAt: new Date().toISOString()
                    };

                    await fsMkdir(path.dirname(stateFilePath), { recursive: true });
                    await fsWrite(stateFilePath, JSON.stringify(currentState, null, 2), 'utf8');
                    diagnostics.stages.push({ stage: 'reset-sequence-counter', status: 'success', timestamp: new Date().toISOString() });
                    logger.info({ branchId, moduleId, stateFilePath }, `✅ [RESET] Sequence counter reset to 0`);
                    console.log(`✅ [RESET] Sequence counter reset to 0`);
                } catch (err) {
                    diagnostics.stages.push({
                        stage: 'reset-sequence-counter',
                        status: 'failed',
                        error: err.message,
                        stack: err.stack,
                        timestamp: new Date().toISOString()
                    });
                    throw new Error(`[STAGE: reset-sequence-counter] ${err.message}`);
                }

                // STAGE 6: Clear sequence cache
                diagnostics.stages.push({ stage: 'clear-sequence-cache', status: 'start', timestamp: new Date().toISOString() });
                try {
                    if (sequenceManager && sequenceManager.branchStateCache) {
                        sequenceManager.branchStateCache.delete(branchId);
                        sequenceManager.branchStateCache.delete('default');
                        diagnostics.cacheCleared = true;
                    } else {
                        diagnostics.cacheCleared = false;
                        diagnostics.cacheWarning = 'sequenceManager.branchStateCache not available';
                    }
                    diagnostics.stages.push({ stage: 'clear-sequence-cache', status: 'success', timestamp: new Date().toISOString() });
                } catch (err) {
                    diagnostics.stages.push({
                        stage: 'clear-sequence-cache',
                        status: 'failed',
                        error: err.message,
                        stack: err.stack,
                        timestamp: new Date().toISOString()
                    });
                    // Non-critical error, log warning but continue
                    logger.warn({ err, branchId, moduleId }, '[RESET] Failed to clear sequence cache (non-critical)');
                }

                // STAGE 7: Build final snapshot
                diagnostics.stages.push({ stage: 'build-snapshot', status: 'start', timestamp: new Date().toISOString() });
                let newSnapshot;
                try {
                    newSnapshot = await buildBranchSnapshot(branchId);
                    diagnostics.stages.push({ stage: 'build-snapshot', status: 'success', timestamp: new Date().toISOString() });
                    logger.info({ branchId, moduleId }, '✅ [RESET] Full reset completed successfully');
                    console.log('✅ [RESET] Full reset completed successfully');
                } catch (err) {
                    diagnostics.stages.push({
                        stage: 'build-snapshot',
                        status: 'failed',
                        error: err.message,
                        stack: err.stack,
                        timestamp: new Date().toISOString()
                    });
                    throw new Error(`[STAGE: build-snapshot] ${err.message}`);
                }

                // Success response
                diagnostics.endTime = new Date().toISOString();
                diagnostics.success = true;
                jsonResponse(res, 200, {
                    success: true,
                    message: 'Module reset to initial data and sequence counter reset',
                    diagnostics,
                    ...newSnapshot
                });

            } catch (error) {
                diagnostics.endTime = new Date().toISOString();
                diagnostics.success = false;
                diagnostics.error = {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                };
                logger.error({
                    err: error,
                    branchId,
                    moduleId,
                    diagnostics
                }, '❌ [RESET] Module reset failed');
                console.error('❌ [RESET] Module reset failed:', error.message);
                console.error('Diagnostics:', JSON.stringify(diagnostics, null, 2));

                jsonResponse(res, 500, {
                    error: 'reset-failed',
                    message: error.message,
                    stack: error.stack,
                    diagnostics
                });
            }
            return;
        }

        // Handle POS orders endpoints
        if (moduleId === 'pos' && tail.length >= 1 && tail[0] === 'orders') {
            // GET /orders - list orders with filtering
            if (tail.length === 1 && req.method === 'GET') {
                const params = url.searchParams;
                const readBoolean = (name, fallback) => {
                    const raw = params.get(name);
                    if (raw == null) return fallback;
                    const normalized = String(raw).trim().toLowerCase();
                    if (["1", "true", "yes", "on"].includes(normalized)) return true;
                    if (["0", "false", "no", "off"].includes(normalized)) return false;
                    return fallback;
                };
                const readList = (name) => {
                    const values = params.getAll(name);
                    const results = [];
                    for (const value of values) {
                        if (typeof value !== 'string') continue;
                        value
                            .split(',')
                            .map((entry) => entry.trim())
                            .filter(Boolean)
                            .forEach((entry) => results.push(entry));
                    }
                    return results;
                };
                const onlyActive = readBoolean('onlyActive', true);
                const includeTokens = new Set(readList('include').map((token) => token.toLowerCase()));
                if (readBoolean('includeLines', false)) includeTokens.add('lines');
                if (readBoolean('includePayments', false)) includeTokens.add('payments');
                if (readBoolean('includeStatusLogs', false)) includeTokens.add('statuslogs');
                if (readBoolean('includeLineStatus', false) || readBoolean('includeLineStatusLogs', false)) {
                    includeTokens.add('linestatuslogs');
                    includeTokens.add('lines');
                }

                const limitParam = Number(params.get('limit') || params.get('take'));
                const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.trunc(limitParam) : null;
                const statusFilters = readList('status').map((entry) => entry.toLowerCase());
                const stageFilters = readList('stage').map((entry) => entry.toLowerCase());
                const typeFilters = readList('type').map((entry) => entry.toLowerCase());
                const shiftFilters = readList('shiftId').map((entry) => entry.toLowerCase());
                const updatedAfterParam = params.get('updatedAfter') || params.get('updated_after');
                const savedAfterParam = params.get('savedAfter') || params.get('saved_after');
                const updatedAfter = updatedAfterParam != null ? toTimestamp(updatedAfterParam, null) : null;
                const savedAfter = savedAfterParam != null ? toTimestamp(savedAfterParam, null) : null;

                const cloneRow = (row) => (row && typeof row === 'object' ? deepClone(row) : row);

                const headers = store.listTable('order_header').map(cloneRow);
                const normalizeToken = (value) => (value == null ? '' : String(value).trim().toLowerCase());

                const retainStatus = (status) => {
                    if (!status) {
                        if (statusFilters.length) {
                            return statusFilters.includes('') || statusFilters.includes('open');
                        }
                        return true;
                    }
                    if (statusFilters.length) {
                        return statusFilters.includes(status);
                    }
                    if (!onlyActive) return true;
                    return !['closed', 'complete', 'completed', 'cancelled', 'void', 'refunded', 'returned'].includes(status);
                };

                const retainStage = (stage) => {
                    if (!stage) return stageFilters.length === 0;
                    if (!stageFilters.length) return true;
                    return stageFilters.includes(stage);
                };

                const retainType = (type) => {
                    if (!type) return typeFilters.length === 0;
                    if (!typeFilters.length) return true;
                    return typeFilters.includes(type);
                };

                const retainShift = (shiftId) => {
                    if (!shiftFilters.length) return true;
                    if (!shiftId) return false;
                    return shiftFilters.includes(String(shiftId).toLowerCase());
                };

                const filtered = headers.filter((order) => {
                    if (!order || typeof order !== 'object') return false;
                    const statusToken =
                        normalizeToken(order.status || order.status_id || order.state) || 'open';
                    if (!retainStatus(statusToken)) return false;
                    const stageToken =
                        normalizeToken(order.fulfillmentStage || order.stage || order.stage_id) || 'new';
                    if (!retainStage(stageToken)) return false;
                    const typeToken =
                        normalizeToken(order.type || order.orderType || order.order_type) || 'dine_in';
                    if (!retainType(typeToken)) return false;
                    const shiftToken = normalizeToken(order.shiftId || order.shift_id);
                    if (!retainShift(shiftToken)) return false;
                    if (updatedAfter != null) {
                        const ts = toTimestamp(order.updatedAt || order.updated_at, null);
                        if (ts == null || ts < updatedAfter) return false;
                    }
                    if (savedAfter != null) {
                        const ts = toTimestamp(order.savedAt || order.saved_at, null);
                        if (ts == null || ts < savedAfter) return false;
                    }
                    return true;
                });

                const includeLines = includeTokens.has('lines');
                const includePayments = includeTokens.has('payments');
                const includeStatusLogs = includeTokens.has('statuslogs');
                const includeLineStatusLogs = includeTokens.has('linestatuslogs');

                const mapByOrderId = (rows, idSelector) => {
                    const map = new Map();
                    for (const row of ensureArray(rows)) {
                        if (!row || typeof row !== 'object') continue;
                        const id = idSelector(row);
                        if (!id) continue;
                        const key = String(id);
                        if (!map.has(key)) map.set(key, []);
                        map.get(key).push(cloneRow(row));
                    }
                    return map;
                };

                const linesByOrder = includeLines
                    ? mapByOrderId(store.listTable('order_line'), (row) => row.orderId || row.order_id)
                    : new Map();
                const paymentsByOrder = includePayments
                    ? mapByOrderId(store.listTable('order_payment'), (row) => row.orderId || row.order_id)
                    : new Map();
                const statusLogsByOrder = includeStatusLogs
                    ? mapByOrderId(store.listTable('order_status_log'), (row) => row.orderId || row.order_id)
                    : new Map();

                const lineStatusRaw = includeLineStatusLogs
                    ? store.listTable('order_line_status_log').map(cloneRow)
                    : [];
                const lineStatusByOrder = new Map();
                if (includeLineStatusLogs) {
                    for (const entry of ensureArray(lineStatusRaw)) {
                        if (!entry || typeof entry !== 'object') continue;
                        const orderId = entry.orderId || entry.order_id;
                        const lineId = entry.lineId || entry.line_id;
                        if (!orderId || !lineId) continue;
                        const orderKey = String(orderId);
                        if (!lineStatusByOrder.has(orderKey)) lineStatusByOrder.set(orderKey, new Map());
                        const linesMap = lineStatusByOrder.get(orderKey);
                        const lineKey = String(lineId);
                        if (!linesMap.has(lineKey)) linesMap.set(lineKey, []);
                        linesMap.get(lineKey).push(cloneRow(entry));
                    }
                }

                const sorted = filtered.slice().sort((a, b) => {
                    const aTs = toTimestamp(a.updatedAt || a.updated_at || a.savedAt || a.saved_at, 0);
                    const bTs = toTimestamp(b.updatedAt || b.updated_at || b.savedAt || b.saved_at, 0);
                    return bTs - aTs;
                });

                const limited = limit ? sorted.slice(0, limit) : sorted;

                const orders = limited.map((order) => {
                    const cloned = cloneRow(order);
                    const orderId = cloned && cloned.id != null ? String(cloned.id) : null;
                    if (includeLines) {
                        const bucket = orderId ? linesByOrder.get(orderId) || [] : [];
                        cloned.lines = bucket.map((line) => {
                            if (!includeLineStatusLogs) return line;
                            const lineId = line && line.id != null ? String(line.id) : null;
                            if (!lineId) return line;
                            const logsMap = orderId ? lineStatusByOrder.get(orderId) : null;
                            const logs = logsMap && logsMap.get(lineId);
                            if (!logs || !logs.length) return line;
                            return { ...line, statusLogs: logs.map((entry) => cloneRow(entry)) };
                        });
                    }
                    if (includePayments) {
                        const bucket = orderId ? paymentsByOrder.get(orderId) || [] : [];
                        cloned.payments = bucket.map(cloneRow);
                    }
                    if (includeStatusLogs) {
                        const bucket = orderId ? statusLogsByOrder.get(orderId) || [] : [];
                        cloned.statusLogs = bucket.map(cloneRow);
                    }
                    return cloned;
                });

                jsonResponse(res, 200, {
                    branchId,
                    moduleId,
                    orders,
                    meta: {
                        count: orders.length,
                        total: filtered.length,
                        onlyActive,
                        include: Array.from(includeTokens.values()),
                        limit
                    }
                });
                return;
            }

            // POST /orders - create order
            if (tail.length === 1 && req.method === 'POST') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return;
                }
                const orderPayload = body.order || body.data || body.record || null;
                if (!orderPayload || typeof orderPayload !== 'object') {
                    jsonResponse(res, 400, { error: 'missing-order-payload' });
                    return;
                }
                try {
                    const result = await savePosOrder(branchId, moduleId, orderPayload, {
                        source: 'pos-order-api',
                        actorId: body.actorId || body.userId || orderPayload.updatedBy || null
                    });
                    const orderSnapshot = await fetchPosOrderSnapshot(branchId, moduleId, result.orderId);
                    jsonResponse(res, 201, {
                        branchId,
                        moduleId,
                        orderId: result.orderId,
                        order: orderSnapshot,
                        normalized: buildAckOrder(result.normalized)
                    });
                } catch (error) {
                    if (isVersionConflict(error)) {
                        logger.info({ err: error, branchId, moduleId, details: versionConflictDetails(error) }, 'POS order persist rejected due to version conflict');
                        jsonResponse(res, 409, {
                            error: 'order-version-conflict',
                            message: error.message,
                            details: versionConflictDetails(error)
                        });
                        return;
                    }
                    logger.warn({ err: error, branchId, moduleId }, 'Failed to persist POS order via API');
                    jsonResponse(res, 500, { error: 'order-persist-failed', message: error.message });
                }
                return;
            }

            // GET /orders/:id - get single order
            if (tail.length === 2 && req.method === 'GET') {
                const orderId = tail[1];
                try {
                    const orderSnapshot = await fetchPosOrderSnapshot(branchId, moduleId, orderId);
                    if (!orderSnapshot) {
                        jsonResponse(res, 404, { error: 'order-not-found', orderId });
                        return;
                    }
                    jsonResponse(res, 200, { branchId, moduleId, orderId, order: orderSnapshot });
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId, orderId }, 'Failed to load order snapshot');
                    jsonResponse(res, 500, { error: 'order-fetch-failed', message: error.message });
                }
                return;
            }
        }

        // Fallback: GET path segments
        if (req.method === 'GET') {
            const value = traversePath(snapshot, tail);
            if (value === undefined) {
                jsonResponse(res, 404, { error: 'path-not-found' });
                return;
            }
            jsonResponse(res, 200, value);
            return;
        }

        jsonResponse(res, 405, { error: 'method-not-allowed' });
    }

    return {
        handleBranchesApi
    };
}
