import {
    computeInsertOnlyDelta,
    normalizeCursorInput,
    buildRecordCursor,
    stringifyCursor,
    extractClientSnapshotMarker,
    resolveServerSnapshotMarker
} from './utils.js';

/**
 * Delta Engine
 * Computes deltas and manages cursors for incremental sync
 */
export function createDeltaEngine() {
    function normalizeDeltaRequest(frameData, store) {
        const directTables = frameData.tables;
        let tableNames = [];

        if (Array.isArray(directTables)) {
            tableNames = directTables.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim());
        } else if (typeof directTables === 'string' && directTables.trim()) {
            tableNames = [directTables.trim()];
        } else if (directTables && typeof directTables === 'object') {
            tableNames = Object.keys(directTables).filter((name) => typeof name === 'string' && name.trim());
        }

        if (!tableNames.length) {
            tableNames = Array.isArray(store.tables) ? store.tables.slice() : [];
        }

        const tableMap = {};
        const normalizedClientCursorMap = {};

        for (const tableName of tableNames) {
            const clientCursor =
                typeof directTables === 'object' && directTables[tableName]
                    ?directTables[tableName]
                    : null;

            tableMap[tableName] = clientCursor;

            const normalized = normalizeCursorInput(clientCursor).object;
            if (normalized) {
                normalizedClientCursorMap[tableName] = normalized;
            }
        }

        return { tableNames, tableMap, normalizedClientCursorMap };
    }

    function computeDeltaPayload(store, clientRequest, eventMeta = null) {
        const { tableNames, tableMap, normalizedClientCursorMap } = normalizeDeltaRequest(clientRequest, store);

        const deltaPayload = {};
        const stats = {};
        const responseLastRefs = {};
        const responseLastIds = {};
        const cursorMisses = [];
        let requiresFullSync = tableNames.length === 0;

        for (const tableName of tableNames) {
            if (!store.tables.includes(tableName)) continue;

            const tableResult = computeInsertOnlyDelta(store, tableName, tableMap[tableName]);
            deltaPayload[tableName] = tableResult.rows;
            stats[tableName] = {
                total: tableResult.total,
                returned: tableResult.rows.length,
                cursorMatched: tableResult.matched === true
            };

            if (tableResult.requiresFullSync) {
                requiresFullSync = true;
                cursorMisses.push(tableName);
            }

            if (!normalizedClientCursorMap[tableName]) {
                const normalizedInput = normalizeCursorInput(tableMap[tableName]).object;
                if (normalizedInput) {
                    normalizedClientCursorMap[tableName] = normalizedInput;
                }
            }

            responseLastRefs[tableName] = tableResult.lastCursor || null;
            responseLastIds[tableName] = stringifyCursor(tableResult.lastCursor);
        }

        return {
            deltaPayload,
            stats,
            responseLastRefs,
            responseLastIds,
            cursorMisses,
            requiresFullSync,
            normalizedClientCursorMap
        };
    }

    function validateCursors(clientSnapshotMarker, serverSnapshotMarker, eventMeta, requiresFullSync) {
        let needsFullSync = requiresFullSync;

        if (clientSnapshotMarker && serverSnapshotMarker && clientSnapshotMarker !== serverSnapshotMarker) {
            needsFullSync = true;
        }

        if (eventMeta && typeof eventMeta.lastClosedDate === 'string' && clientSnapshotMarker) {
            const lastClosed = eventMeta.lastClosedDate.trim();
            if (lastClosed && clientSnapshotMarker < lastClosed) {
                needsFullSync = true;
            }
        }

        return needsFullSync;
    }

    function buildDeltaResponse(state, result, clientVersion, clientSnapshotMarker, serverSnapshotMarker, SERVER_ID) {
        const payload = {
            branchId: state.branchId,
            moduleId: state.moduleId,
            version: state.version,
            updatedAt: state.updatedAt,
            serverId: SERVER_ID,
            snapshotMarker: serverSnapshotMarker || null,
            requiresFullSync: result.requiresFullSync,
            cursorMisses: result.cursorMisses,
            lastTableIds: result.responseLastIds,
            lastTableRefs: result.responseLastRefs,
            deltas: result.deltaPayload,
            stats: result.stats
        };

        if (Number.isFinite(clientVersion)) {
            payload.clientVersion = clientVersion;
        }
        if (clientSnapshotMarker) {
            payload.clientSnapshotMarker = clientSnapshotMarker;
        }

        return payload;
    }

    return {
        normalizeDeltaRequest,
        computeDeltaPayload,
        validateCursors,
        buildDeltaResponse
    };
}
