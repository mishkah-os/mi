import logger from '../logger.js';
import { nowIso, deepClone } from '../utils.js';
import { summarizeTableCounts } from './sync-state.js';
import { logRejectedMutation as recordRejectedMutation } from '../eventStore.js';

/**
 * Sync Manager
 * Handles sync state and snapshot operations
 */
export function createSyncManager({ ensureModuleStore, persistModuleStore, normalizePosSnapshot }) {
    const SYNC_STATES = new Map();

    function syncStateKey(branchId, moduleId) {
        return `${branchId}::${moduleId}`;
    }

    function normalizeIncomingSnapshot(store, incomingSnapshot) {
        if (!incomingSnapshot || typeof incomingSnapshot !== 'object') {
            return null;
        }

        if (!incomingSnapshot.tables || typeof incomingSnapshot.tables !== 'object') {
            const currentSnapshot = store.getSnapshot();
            const currentTables =
                currentSnapshot && typeof currentSnapshot === 'object' && typeof currentSnapshot.tables === 'object'
                    ? currentSnapshot.tables
                    : {};
            const normalized = {
                version: incomingSnapshot.version ?? currentSnapshot?.version ?? 1,
                meta: { ...currentSnapshot?.meta, ...incomingSnapshot.meta },
                tables: {}
            };
            for (const tableName of store.tables) {
                const rows = Array.isArray(currentTables?.[tableName]) ? currentTables[tableName].map((row) => deepClone(row)) : [];
                normalized.tables[tableName] = rows;
            }
            return normalized;
        }

        if (!Array.isArray(store.tables)) {
            return incomingSnapshot;
        }

        const incomingTables = incomingSnapshot.tables;
        const allTablesPresent = store.tables.every((tableName) => tableName in incomingTables);
        if (allTablesPresent) {
            return incomingSnapshot;
        }

        const currentSnapshot = store.getSnapshot();
        const normalized = {
            version: incomingSnapshot.version ?? currentSnapshot?.version ?? 1,
            meta: { ...currentSnapshot?.meta, ...incomingSnapshot.meta },
            tables: {}
        };
        const currentTables =
            currentSnapshot && typeof currentSnapshot === 'object' && typeof currentSnapshot.tables === 'object'
                ? currentSnapshot.tables
                : {};
        for (const tableName of store.tables) {
            let rows;
            if (Array.isArray(incomingSnapshot.tables?.[tableName])) {
                rows = incomingSnapshot.tables[tableName].map((row) => deepClone(row));
            } else if (Array.isArray(currentTables?.[tableName])) {
                rows = currentTables[tableName].map((row) => deepClone(row));
            } else {
                rows = [];
            }
            normalized.tables[tableName] = rows;
        }
        return normalized;
    }

    const posSnapshotNormalizer = normalizePosSnapshot
        ? (store, incomingSnapshot) => {
            const normalized = normalizeIncomingSnapshot(store, incomingSnapshot);
            const posSnapshot = normalizePosSnapshot(store, normalized);
            return posSnapshot || normalized;
        }
        : normalizeIncomingSnapshot;

    function ensureInsertOnlySnapshot(store, incomingSnapshot) {
        const currentSnapshot = store.getSnapshot();
        const currentVersion = Number(currentSnapshot?.version) || 0;
        const incomingVersion = Number(incomingSnapshot?.version);
        if (Number.isFinite(incomingVersion) && incomingVersion < currentVersion) {
            return {
                ok: false,
                reason: 'version-regression',
                currentVersion,
                incomingVersion
            };
        }

        const requiredTables = Array.isArray(store.tables) ? store.tables : [];
        const incomingTables = incomingSnapshot.tables && typeof incomingSnapshot.tables === 'object' ? incomingSnapshot.tables : {};

        for (const tableName of requiredTables) {
            if (!(tableName in incomingTables)) {
                const currentRows = Array.isArray(currentSnapshot.tables?.[tableName]) ? currentSnapshot.tables[tableName] : [];
                return {
                    ok: false,
                    reason: 'missing-table',
                    tableName,
                    currentCount: currentRows.length
                };
            }

            const incomingRows = incomingTables[tableName];
            if (!Array.isArray(incomingRows)) {
                return {
                    ok: false,
                    reason: 'invalid-table-format',
                    tableName
                };
            }

            let tableDefinition = null;
            try {
                tableDefinition = store.schemaEngine.getTable(tableName);
            } catch (_err) {
                tableDefinition = null;
            }

            const primaryFields = Array.isArray(tableDefinition?.fields)
                ? tableDefinition.fields.filter((field) => field && field.primaryKey).map((field) => field.name)
                : [];

            if (primaryFields.length) {
                const seenKeys = new Set();
                for (let idx = 0; idx < incomingRows.length; idx += 1) {
                    const row = incomingRows[idx];
                    if (!row || typeof row !== 'object') {
                        continue;
                    }
                    const parts = [];
                    let valid = true;
                    for (const fieldName of primaryFields) {
                        const value = row[fieldName];
                        if (value === undefined || value === null) {
                            valid = false;
                            break;
                        }
                        parts.push(String(value));
                    }
                    if (!valid) {
                        return {
                            ok: false,
                            reason: 'missing-primary-key',
                            tableName,
                            index: idx
                        };
                    }
                    const key = parts.join('::');
                    if (seenKeys.has(key)) {
                        return {
                            ok: false,
                            reason: 'duplicate-primary-key',
                            tableName,
                            key
                        };
                    }
                    seenKeys.add(key);
                }
            }
        }

        return { ok: true };
    }

    function createInsertOnlyViolation(details) {
        const error = new Error('Incoming snapshot violates insert-only policy.');
        error.code = 'INSERT_ONLY_VIOLATION';
        error.details = details;
        return error;
    }

    async function applySyncSnapshot(branchId, moduleId, snapshot = {}, context = {}) {
        const key = syncStateKey(branchId, moduleId);
        let moduleSnapshot = snapshot && typeof snapshot === 'object' ? deepClone(snapshot) : null;
        try {
            if (moduleSnapshot) {
                const store = await ensureModuleStore(branchId, moduleId);
                moduleSnapshot = posSnapshotNormalizer(store, moduleSnapshot);
                const validation = ensureInsertOnlySnapshot(store, moduleSnapshot);
                if (!validation.ok) {
                    throw createInsertOnlyViolation({ ...validation, branchId, moduleId });
                }
                moduleSnapshot = store.replaceTablesFromSnapshot(moduleSnapshot, { ...context, branchId, moduleId });
                await persistModuleStore(store);
            }
        } catch (error) {
            if (error?.code === 'INSERT_ONLY_VIOLATION') {
                const counts = { before: summarizeTableCounts(SYNC_STATES.get(key)?.moduleSnapshot || {}), after: summarizeTableCounts(moduleSnapshot || {}) };
                logger.warn({ branchId, moduleId, violation: error.details, counts }, 'Rejected destructive sync snapshot');
                // CRITICAL FIX: recordRejectedMutation expects event store context (with liveDir), not branchId/moduleId
                // We don't have getModuleEventStoreContext here, so skip logging or handle differently
                // For now, log warning instead of throwing error from eventStore
                logger.warn({ branchId, moduleId, error: error.details }, 'Skipping event log for rejected mutation - no event store context available');
                throw error;
            }
            logger.warn({ err: error, branchId, moduleId }, 'Failed to persist sync snapshot');
            moduleSnapshot = null;
        }
        if (!moduleSnapshot) {
            const fallback = await ensureSyncState(branchId, moduleId);
            moduleSnapshot = fallback.moduleSnapshot;
        }
        const nextState = {
            branchId,
            moduleId,
            version: Number(moduleSnapshot?.version) || (SYNC_STATES.get(key)?.version || 1),
            moduleSnapshot,
            updatedAt: moduleSnapshot?.meta?.lastUpdatedAt || nowIso()
        };
        SYNC_STATES.set(key, nextState);
        return nextState;
    }

    async function ensureSyncState(branchId, moduleId) {
        const key = syncStateKey(branchId, moduleId);
        if (SYNC_STATES.has(key)) {
            return SYNC_STATES.get(key);
        }
        const store = await ensureModuleStore(branchId, moduleId);
        const moduleSnapshot = store.getSnapshot();
        const state = {
            branchId,
            moduleId,
            version: Number(moduleSnapshot?.version) || 1,
            moduleSnapshot,
            updatedAt: moduleSnapshot?.meta?.lastUpdatedAt || nowIso()
        };
        SYNC_STATES.set(key, state);
        return state;
    }

    function getSyncStates() {
        return SYNC_STATES;
    }

    return {
        ensureSyncState,
        applySyncSnapshot,
        normalizeIncomingSnapshot: posSnapshotNormalizer,
        ensureInsertOnlySnapshot,
        createInsertOnlyViolation,
        syncStateKey,
        getSyncStates
    };
}
