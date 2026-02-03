import logger from '../logger.js';
import { deepClone, nowIso } from '../utils.js';
import { appendEvent as appendModuleEvent, updateEventMeta } from '../eventStore.js';
import config from '../config/index.js';
import { persistRecord, deleteRecord, isManagedTable } from '../database/sqlite-ops.js';
import { refreshDisplayNameCache } from './display-name-cache.js';

const { SERVER_ID } = config;

export function createModuleEventHandler({
    ensureModuleStore,
    persistModuleStore,
    getModuleEventStoreContext,
    sanitizeRecordForClient,
    sanitizeModuleSnapshot,
    sendToClient,
    broadcastToBranch,
    broadcastTableNotice,
    sequenceManager,
    schemaManager
}) {
    const draftOrderIdPattern = /^[A-Z0-9]+-\d{13,}-\d{3}$/i;
    const isDraftOrderId = (value) => typeof value === 'string' && draftOrderIdPattern.test(value);
    const hasShiftId = (record) => {
        if (!record || typeof record !== 'object') return false;
        return !!(record.shiftId || record.shift_id || record.metadata?.shiftId || record.metadata?.shift_id);
    };
    const draftBlockedTables = new Set([
        'order_header',
        'order_line',
        'order_payment',
        'order_status_log',
        'order_line_status_log'
    ]);

    async function handleModuleEvent(branchId, moduleId, payload = {}, client = null, options = {}) {
        const action = typeof payload.action === 'string' ? payload.action : 'module:insert';
        const tableName = payload.table || payload.tableName || payload.targetTable;
        if (!tableName) throw new Error('Missing table name for module event');
        let recordPayload = payload.record || payload.data || {};
        if (action !== 'module:delete') {
            const normalizedTable = String(tableName).toLowerCase();
            const orderId = recordPayload?.orderId || recordPayload?.order_id || recordPayload?.id;
            if (draftBlockedTables.has(normalizedTable) && isDraftOrderId(orderId)) {
                throw new Error('draft-order-id-not-allowed');
            }
            if (normalizedTable === 'order_header' && !hasShiftId(recordPayload)) {
                throw new Error('order-header-missing-shift');
            }
        }
        if (['module:insert', 'module:merge', 'module:save'].includes(action)) {
            try {
                recordPayload = await sequenceManager.applyAutoSequences(branchId, moduleId, tableName, recordPayload);
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId, table: tableName }, 'Failed to apply sequence manager to record payload');
            }
        }
        const store = await ensureModuleStore(branchId, moduleId);
        const contextInfo = {
            clientId: client?.id || null,
            userId: payload.userId || null,
            source: options.source || payload.source || null
        };

        let effectiveAction = action;
        let recordResult = null;
        let removedRecord = null;
        let saveResult = null;

        switch (action) {
            case 'module:insert': {
                recordResult = store.insert(tableName, recordPayload, contextInfo);
                break;
            }
            case 'module:merge': {
                recordResult = store.merge(tableName, recordPayload, contextInfo);
                break;
            }
            case 'module:save': {
                saveResult = store.save(tableName, recordPayload, contextInfo);
                recordResult = saveResult.record;
                effectiveAction = saveResult.created ? 'module:insert' : 'module:merge';
                break;
            }
            case 'module:delete': {
                const removal = store.remove(tableName, recordPayload, contextInfo);
                removedRecord = removal?.record || null;
                effectiveAction = 'module:delete';
                break;
            }
            default:
                throw new Error(`Unsupported module action: ${action}`);
        }

        await persistModuleStore(store);

        // ✅ CRITICAL: Persist managed tables (pos_shift, order_header, etc.) to SQLite
        if (isManagedTable(tableName)) {
            const sqliteContext = { branchId, moduleId };
            try {
                if (effectiveAction === 'module:delete') {
                    const keyToDelete = removedRecord?.id || recordPayload?.id;
                    if (keyToDelete) {
                        deleteRecord(tableName, keyToDelete, sqliteContext);
                        logger.debug({ branchId, moduleId, table: tableName, id: keyToDelete }, 'Deleted record from SQLite');
                    }
                } else if (recordResult) {
                    persistRecord(tableName, recordResult, sqliteContext);
                    logger.debug({ branchId, moduleId, table: tableName, id: recordResult.id }, 'Persisted record to SQLite');
                }
            } catch (sqliteError) {
                logger.warn({ err: sqliteError, branchId, moduleId, table: tableName }, 'Failed to persist to SQLite');
            }
        }

        const timestamp = nowIso();
        const baseMeta = {
            serverId: SERVER_ID,
            branchId,
            moduleId,
            table: tableName,
            timestamp
        };
        if (contextInfo.source) {
            baseMeta.source = contextInfo.source;
        }
        if (payload.meta && typeof payload.meta === 'object') {
            baseMeta.clientMeta = deepClone(payload.meta);
        }

        const recordRef = store.getRecordReference(tableName, recordResult || removedRecord || recordPayload);
        if (recordRef?.key) {
            baseMeta.recordKey = recordRef.key;
        }
        if (recordRef?.id !== undefined) {
            baseMeta.recordId = recordRef.id;
        }

        if (schemaManager) {
            try {
                const smart = await schemaManager.getOrLoadSmartSchema(moduleId);
                const normalizedTable = String(tableName || '').toLowerCase();
                let baseTable = normalizedTable;
                let baseRecordId = recordRef?.id || recordResult?.id || removedRecord?.id || recordPayload?.id || null;
                let skipSelf = effectiveAction === 'module:delete';

                if (normalizedTable.endsWith('_lang')) {
                    baseTable = normalizedTable.replace(/_lang$/i, '');
                    const fkColumn = `${baseTable}_id`;
                    baseRecordId = recordResult?.[fkColumn] || removedRecord?.[fkColumn] || recordPayload?.[fkColumn] || baseRecordId;
                    skipSelf = false;
                }

                if (baseTable && baseRecordId) {
                    await refreshDisplayNameCache({
                        store,
                        smartSchema: smart,
                        tableName: baseTable,
                        recordId: baseRecordId,
                        logger,
                        skipSelf
                    });
                }
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId, table: tableName }, 'Failed to refresh display name cache');
            }
        }

        const eventContext = getModuleEventStoreContext(branchId, moduleId);
        const recordForLog = effectiveAction === 'module:delete' ? removedRecord : recordResult;
        const recordForClient =
            effectiveAction === 'module:delete'
                ? sanitizeRecordForClient(tableName, removedRecord)
                : sanitizeRecordForClient(tableName, recordResult);
        const removedRecordForClient = sanitizeRecordForClient(tableName, removedRecord);
        const logEntry = await appendModuleEvent(eventContext, {
            id: payload.eventId || payload.id || null,
            action: effectiveAction,
            branchId,
            moduleId,
            table: tableName,
            record: recordForLog,
            meta: { ...baseMeta, recordRef },
            publishState: payload.publishState
        });
        await updateEventMeta(eventContext, { lastAckId: logEntry.id });

        const enrichedMeta = { ...baseMeta, eventId: logEntry.id, sequence: logEntry.sequence, recordRef };
        const entry = {
            id: recordRef?.id || recordRef?.key || logEntry.id,
            table: tableName,
            action: effectiveAction,
            recordRef,
            meta: enrichedMeta,
            created: saveResult ? saveResult.created : effectiveAction === 'module:insert',
            deleted: effectiveAction === 'module:delete'
        };
        if ((options.includeRecord === true || payload.includeRecord === true) && recordForClient) {
            entry.record = recordForClient;
        }

        const notice = {
            action: effectiveAction,
            recordRef,
            eventId: logEntry.id,
            sequence: logEntry.sequence,
            version: store.version,
            timestamp,
            created: entry.created === true,
            deleted: entry.deleted === true,
            meta: enrichedMeta
        };

        const ack = {
            type: 'server:ack',
            action: effectiveAction,
            branchId,
            moduleId,
            version: store.version,
            table: tableName,
            recordRef,
            eventId: logEntry.id,
            sequence: logEntry.sequence,
            publishState: logEntry.publishState,
            meta: enrichedMeta,
            entry
        };
        if (entry.created !== undefined) ack.created = entry.created;
        if (entry.deleted) ack.deleted = true;

        const event = {
            type: 'server:event',
            action: effectiveAction,
            branchId,
            moduleId,
            version: store.version,
            table: tableName,
            recordRef,
            eventId: logEntry.id,
            sequence: logEntry.sequence,
            publishState: logEntry.publishState,
            meta: enrichedMeta,
            entry,
            notice
        };

        if (options.includeSnapshot || payload.includeSnapshot) {
            event.snapshot = sanitizeModuleSnapshot(store.getSnapshot());
        }

        if (client) {
            sendToClient(client, ack);
        }
        if (options.broadcast !== false) {
            broadcastToBranch(branchId, event);
        }
        await broadcastTableNotice(branchId, moduleId, tableName, notice);

        return {
            ack,
            event,
            logEntry,
            recordRef,
            notice,
            record: recordForClient,
            removed: removedRecordForClient
        };
    }

    return {
        handleModuleEvent
    };
}
