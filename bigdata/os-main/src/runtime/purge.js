import { readdir } from 'fs/promises';
import path from 'path';
import logger from '../logger.js';
import { readJsonSafe, writeJson } from './utils.js';
import { createId, nowIso } from '../utils.js';
import { loadEventMeta, updateEventMeta, discardLogFile } from '../eventStore.js';
import config from '../config/index.js';

const { SERVER_ID } = config;

export function createPurgeManager({
    ensureModuleStore,
    persistModuleStore,
    ensureModuleSeed,
    archiveModuleFile,
    getModuleEventStoreContext,
    getModulePurgeHistoryDir,
    broadcastTableNotice,
    broadcastToBranch,
    normalizeTransactionTableList
}) {

    async function clearModuleEventState(branchId, moduleId, tables = [], options = {}) {
        const context = getModuleEventStoreContext(branchId, moduleId);
        let meta = null;
        try {
            meta = await loadEventMeta(context);
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to load event meta before purge');
        }
        const tableSet = new Set();
        if (Array.isArray(tables)) {
            for (const name of tables) {
                if (typeof name !== 'string') continue;
                const trimmed = name.trim();
                if (trimmed) tableSet.add(trimmed);
            }
        }
        const preserveEntries = (source = {}) => {
            const result = {};
            for (const [key, value] of Object.entries(source)) {
                if (tableSet.size && tableSet.has(key)) continue;
                result[key] = value;
            }
            return result;
        };
        const now = nowIso();
        const patch = {
            lastEventId: null,
            lastEventAt: null,
            lastAckId: null,
            totalEvents: 0,
            tableCursors: preserveEntries(meta?.tableCursors),
            lastServedTableIds: preserveEntries(meta?.lastServedTableIds),
            lastClientTableIds: preserveEntries(meta?.lastClientTableIds),
            lastSnapshotMarker: null,
            lastClientSnapshotMarker: null,
            lastClientSyncAt: null,
            liveCreatedAt: now,
            updatedAt: now
        };
        if (options.reason || options.requestedBy) {
            patch.purgeState = {
                at: now,
                reason: options.reason || null,
                requestedBy: options.requestedBy || null,
                tables: Array.from(tableSet)
            };
        }
        try {
            await updateEventMeta(context, patch);
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to update event meta after purge');
            throw error;
        }
        await discardLogFile(context.logPath).catch(() => { });
        await discardLogFile(context.rejectionLogPath).catch(() => { });
        return patch;
    }

    function summarizePurgeHistoryEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const tables = Array.isArray(entry.summary)
            ? entry.summary
            : Array.isArray(entry.tables)
                ? entry.tables.map((table) => ({
                    name: table.name || table.table || null,
                    count: table.count ?? (Array.isArray(table.records) ? table.records.length : 0),
                    sample: table.sample || table.samples || []
                }))
                : [];
        return {
            id: entry.id || null,
            branchId: entry.branchId || null,
            moduleId: entry.moduleId || null,
            createdAt: entry.createdAt || null,
            reason: entry.reason || null,
            requestedBy: entry.requestedBy || null,
            totalRecords: entry.totalRecords ?? tables.reduce((sum, table) => sum + Number(table.count || 0), 0),
            tables
        };
    }

    async function recordPurgeHistoryEntry(store, tableNames = [], options = {}) {
        if (!store) return null;
        const tables = Array.isArray(tableNames) ? tableNames.slice() : [];
        const recognized = [];
        let totalRecords = 0;
        for (const tableName of tables) {
            if (typeof tableName !== 'string') continue;
            const normalized = tableName.trim();
            if (!normalized || !store.tables.includes(normalized)) continue;
            const records = store.listTable(normalized);
            const sample = records.slice(0, 5).map((record) => store.getRecordReference(normalized, record));
            const entry = {
                name: normalized,
                count: records.length,
                records,
                primaryKeyFields: store.resolvePrimaryKeyFields(normalized),
                sample
            };
            totalRecords += records.length;
            recognized.push(entry);
        }
        if (!recognized.length) return null;

        const createdAt = nowIso();
        const id = createId('purge');
        const payload = {
            id,
            type: 'purge',
            branchId: store.branchId,
            moduleId: store.moduleId,
            createdAt,
            reason: options.reason || null,
            requestedBy: options.requestedBy || null,
            clearedTables: tables,
            originalVersion: store.version,
            totalRecords,
            tables: recognized,
            summary: recognized.map((entry) => ({ name: entry.name, count: entry.count, sample: entry.sample }))
        };

        const fileName = `${createdAt.replace(/[:.]/g, '-')}_${id}.json`;
        const filePath = path.join(getModulePurgeHistoryDir(store.branchId, store.moduleId), fileName);
        await writeJson(filePath, payload);
        return { ...summarizePurgeHistoryEntry(payload), filePath };
    }

    async function listPurgeHistorySummaries(branchId, moduleId) {
        const dir = getModulePurgeHistoryDir(branchId, moduleId);
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        const summaries = [];
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
            const filePath = path.join(dir, entry.name);
            const payload = await readJsonSafe(filePath, null);
            if (!payload) continue;
            const summary = summarizePurgeHistoryEntry(payload);
            if (!summary) continue;
            summaries.push(summary);
        }
        summaries.sort((a, b) => {
            const aTime = a?.createdAt ? Date.parse(a.createdAt) : 0;
            const bTime = b?.createdAt ? Date.parse(b.createdAt) : 0;
            return bTime - aTime;
        });
        return summaries;
    }

    async function findPurgeHistoryFile(branchId, moduleId, entryId) {
        if (!entryId) return null;
        const dir = getModulePurgeHistoryDir(branchId, moduleId);
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
            if (entry.name.includes(entryId)) {
                return path.join(dir, entry.name);
            }
        }
        return null;
    }

    async function readPurgeHistoryEntry(branchId, moduleId, entryId) {
        const filePath = await findPurgeHistoryFile(branchId, moduleId, entryId);
        if (!filePath) return null;
        const payload = await readJsonSafe(filePath, null);
        if (!payload) return null;
        return payload;
    }

    async function restorePurgeHistoryEntry(branchId, moduleId, entryId, options = {}) {
        const payload = await readPurgeHistoryEntry(branchId, moduleId, entryId);
        if (!payload) {
            const error = new Error('History entry not found');
            error.code = 'HISTORY_NOT_FOUND';
            throw error;
        }
        const store = await ensureModuleStore(branchId, moduleId);
        const tableMap = new Map();
        for (const tableEntry of payload.tables || []) {
            const tableName = tableEntry?.name || tableEntry?.table;
            if (typeof tableName !== 'string' || !tableName.trim()) continue;
            tableMap.set(tableName.trim(), Array.isArray(tableEntry.records) ? tableEntry.records : []);
        }
        const restoreResult = store.restoreTables(tableMap, { mode: options.mode });
        await persistModuleStore(store);

        const meta = {
            reason: options.reason || 'restore-purge-history',
            requestedBy: options.requestedBy || null,
            historyEntryId: payload.id,
            mode: restoreResult.mode
        };

        if (options.broadcast !== false) {
            for (const entry of restoreResult.restored) {
                if (!entry || !entry.table || entry.skipped) continue;
                try {
                    await broadcastTableNotice(branchId, moduleId, entry.table, {
                        action: 'table:restore',
                        restored: entry.restored,
                        duplicates: entry.duplicates || 0,
                        mode: restoreResult.mode,
                        meta
                    });
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId, table: entry.table }, 'Failed to broadcast restore notice');
                }
            }
            broadcastToBranch(branchId, {
                type: 'server:event',
                action: 'module:restore',
                branchId,
                moduleId,
                version: store.version,
                restored: restoreResult.restored,
                totalRestored: restoreResult.totalRestored,
                meta
            });
        }

        return {
            branchId,
            moduleId,
            entryId: payload.id,
            restored: restoreResult.restored,
            totalRestored: restoreResult.totalRestored,
            changed: restoreResult.changed,
            historyEntry: summarizePurgeHistoryEntry(payload)
        };
    }

    async function purgeModuleLiveData(branchId, moduleId, tableNames = [], options = {}) {
        const store = await ensureModuleStore(branchId, moduleId);
        const tables = Array.isArray(tableNames) ? tableNames.slice() : [];
        const historyEntry = await recordPurgeHistoryEntry(store, tables, {
            reason: options.reason,
            requestedBy: options.requestedBy
        });
        const { cleared, totalRemoved, changed } = store.clearTables(tables);
        await persistModuleStore(store);

        const recognized = cleared.filter((entry) => entry && entry.status !== 'skipped');
        const targetTables = recognized.map((entry) => entry.table).filter(Boolean);
        const noticeMeta = {
            reason: options.reason || 'purge-live-data',
            requestedBy: options.requestedBy || null,
            serverId: SERVER_ID,
            resetEvents: options.resetEvents !== false,
            historyEntryId: historyEntry?.id || null
        };

        if (options.broadcast !== false) {
            for (const entry of recognized) {
                try {
                    await broadcastTableNotice(branchId, moduleId, entry.table, {
                        action: 'table:purge',
                        removed: entry.removed || 0,
                        status: entry.status,
                        meta: noticeMeta
                    });
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId, table: entry.table }, 'Failed to broadcast purge notice');
                }
            }
        }

        let eventMetaPatch = null;
        if (options.resetEvents !== false && targetTables.length) {
            eventMetaPatch = await clearModuleEventState(branchId, moduleId, targetTables, options);
        }

        if (options.broadcast !== false) {
            const eventPayload = {
                type: 'server:event',
                action: 'module:purge',
                branchId,
                moduleId,
                version: store.version,
                tables: cleared,
                totalRemoved,
                meta: {
                    ...noticeMeta,
                    eventMetaReset: Boolean(eventMetaPatch)
                }
            };
            broadcastToBranch(branchId, eventPayload);
        }

        if (changed) {
            logger.info({ branchId, moduleId, tables: cleared, totalRemoved }, 'Purged module transaction tables');
        } else {
            logger.debug({ branchId, moduleId, tables: cleared }, 'No transaction records removed during purge');
        }

        return {
            branchId,
            moduleId,
            version: store.version,
            cleared,
            totalRemoved,
            changed,
            eventMeta: eventMetaPatch,
            historyEntry
        };
    }

    async function resetModule(branchId, moduleId, options = {}) {
        const store = await ensureModuleStore(branchId, moduleId);
        const moduleSeed = await ensureModuleSeed(branchId, moduleId);
        if (!moduleSeed) {
            throw new Error(`missing-seed:${moduleId}`);
        }
        if (typeof store.refreshPersistedTables === 'function') {
            try {
                store.refreshPersistedTables(true);
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId }, 'Failed to refresh persisted tables before reset');
            }
        }

        // Purge live transaction data BEFORE resetting sequences
        const transactionTables = normalizeTransactionTableList(null, { fallbackToDefaults: true });
        logger.info({ branchId, moduleId, tables: transactionTables }, 'Purging transaction tables before reset');

        let purgeHistoryEntry = null;
        try {
            purgeHistoryEntry = await recordPurgeHistoryEntry(store, transactionTables, {
                reason: options.reason || 'module-reset',
                requestedBy: options.requestedBy || null
            });
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to record purge history entry before reset');
        }

        // Clear transaction tables
        const { cleared, totalRemoved } = store.clearTables(transactionTables);
        logger.info({ branchId, moduleId, cleared, totalRemoved }, 'Cleared transaction tables during reset');

        // Broadcast purge event for live data clearance
        if (totalRemoved > 0) {
            broadcastToBranch(branchId, {
                type: 'server:event',
                action: 'module:purge',
                branchId,
                moduleId,
                version: store.version,
                tables: cleared,
                totalRemoved,
                meta: {
                    serverId: SERVER_ID,
                    reason: options.reason || 'module-reset',
                    historyEntryId: purgeHistoryEntry?.id || null,
                    requestedBy: options.requestedBy || null,
                    stage: 'pre-reset'
                }
            });
        }

        // Perform module reset (sequences + apply seed data)
        let historyEntry = null;
        try {
            historyEntry = await recordPurgeHistoryEntry(store, store.tables, {
                reason: options.reason || 'module-reset',
                requestedBy: options.requestedBy || null
            });
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to record reset history entry');
        }
        await archiveModuleFile(branchId, moduleId);
        store.reset();
        if (moduleSeed) {
            store.applySeed(moduleSeed, { reason: 'reset-seed' });
        }
        if (store && typeof store.restoreTables === 'function' && store.persistedTables && store.persistedTables.size) {
            const persistedSnapshot = {};
            for (const tableName of store.persistedTables) {
                const rows = Array.isArray(store.data?.[tableName]) ? store.data[tableName] : [];
                persistedSnapshot[tableName] = rows;
            }
            store.restoreTables(persistedSnapshot, { mode: 'replace' });
        }
        await persistModuleStore(store);
        const snapshot = store.getSnapshot();
        broadcastToBranch(branchId, {
            type: 'server:event',
            action: 'module:reset',
            moduleId,
            branchId,
            version: store.version,
            snapshot,
            record: null,
            meta: {
                serverId: SERVER_ID,
                reason: options.reason || 'module-reset',
                moduleId,
                historyEntryId: historyEntry?.id || null,
                requestedBy: options.requestedBy || null,
                purgedTables: cleared,
                totalPurged: totalRemoved
            }
        });
        return { store, historyEntry, purgeHistoryEntry, totalRemoved };
    }

    return {
        clearModuleEventState,
        summarizePurgeHistoryEntry,
        recordPurgeHistoryEntry,
        listPurgeHistorySummaries,
        findPurgeHistoryFile,
        readPurgeHistoryEntry,
        restorePurgeHistoryEntry,
        purgeModuleLiveData,
        resetModule
    };
}
