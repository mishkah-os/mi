import logger from '../logger.js';
import { serializeOnce, nowIso, safeJsonParse } from '../utils.js';
import { getActiveFullSyncFlags, serializeFullSyncFlag } from './sync-state.js';
import config from '../config/index.js';

const { SERVER_ID } = config;

export function createWsClientManager({
    clients,
    branchClients,
    ensureBranchModules,
    ensureModuleStore,
    sanitizeModuleSnapshot,
    handleModuleEvent,
    ensureSyncState,
    broadcastSyncUpdate,
    isPubsubFrame,
    handlePubsubFrame,
    unregisterPubsubSubscriptions,
    recordWsSerialization,
    recordWsBroadcast,
    nextBroadcastCycle
}) {

    function registerClient(client) {
        clients.set(client.id, client);
        if (!client.branchId) return;
        if (!branchClients.has(client.branchId)) {
            branchClients.set(client.branchId, new Set());
        }
        branchClients.get(client.branchId).add(client.id);
    }

    function unregisterClient(client) {
        if (!client) return;
        unregisterPubsubSubscriptions(client);
        clients.delete(client.id);
        if (client.branchId && branchClients.has(client.branchId)) {
            const set = branchClients.get(client.branchId);
            set.delete(client.id);
            if (!set.size) branchClients.delete(client.branchId);
        }
    }

    function sendToClient(client, payload, options = {}) {
        if (!client || !client.ws) return false;
        if (client.ws.readyState !== client.ws.OPEN) return false;
        const { cycle = null, channel = 'direct', binary = false } = options;
        try {
            const serialization = serializeOnce(payload, { cycle, binary });
            const data = serialization.data;
            client.ws.send(data);
            recordWsSerialization(channel, serialization);
            return true;
        } catch (error) {
            logger.warn({ err: error, clientId: client.id }, 'Failed to send message to client');
            return false;
        }
    }

    function broadcastToBranch(branchId, payload, exceptClient = null) {
        const set = branchClients.get(branchId);
        if (!set) return;
        const cycle = nextBroadcastCycle();
        let delivered = 0;
        for (const clientId of set) {
            const target = clients.get(clientId);
            if (!target) continue;
            if (exceptClient && target.id === exceptClient.id) continue;
            if (sendToClient(target, payload, { cycle, channel: 'branch' })) {
                delivered += 1;
            }
        }
        recordWsBroadcast('branch', delivered);
    }

    function emitFullSyncDirective(flag, extras = {}) {
        if (!flag) return;
        const payload = {
            type: 'server:directive',
            directive: 'full-sync-flag',
            id: flag.id,
            branchId: flag.branchId,
            moduleId: flag.moduleId,
            enabled: flag.enabled,
            reason: flag.reason || null,
            requestedBy: flag.requestedBy || null,
            updatedAt: flag.updatedAt,
            meta: flag.meta || null,
            ...extras
        };
        if (flag.clearedBy) {
            payload.clearedBy = flag.clearedBy;
        }
        broadcastToBranch(flag.branchId, payload);
    }

    async function sendSnapshot(client, meta = {}) {
        if (!client.branchId) return;
        const modules = await ensureBranchModules(client.branchId);
        const snapshot = {};
        const lang = client.lang || null;
        for (const store of modules) {
            snapshot[store.moduleId] = sanitizeModuleSnapshot(store.getSnapshot({ lang }));
        }
        const activeFlags = getActiveFullSyncFlags(client.branchId);
        const flagPayload = activeFlags.map((entry) => serializeFullSyncFlag(entry));
        const metaPayload = { ...meta, serverId: SERVER_ID, branchId: client.branchId };
        if (lang) {
            metaPayload.lang = lang;
        }
        if (flagPayload.length) {
            metaPayload.fullSyncRequired = true;
            metaPayload.fullSyncFlags = flagPayload;
        }
        sendToClient(client, {
            type: 'server:snapshot',
            branchId: client.branchId,
            modules: snapshot,
            fullSyncFlags: flagPayload,
            meta: metaPayload
        });
    }

    async function handleHello(client, payload) {
        const branchId = typeof payload.branchId === 'string' && payload.branchId.trim() ? payload.branchId.trim() : 'lab:test-pad';
        client.branchId = branchId;
        client.role = typeof payload.role === 'string' ? payload.role : 'unknown';
        if (typeof payload.userId === 'string' && payload.userId.trim()) {
            client.userUuid = payload.userId.trim();
        }
        if (typeof payload.lang === 'string' && payload.lang.trim()) {
            client.lang = payload.lang.trim();
        }
        client.status = 'ready';
        registerClient(client);
        await ensureBranchModules(branchId);
        sendServerLog(client, 'info', 'Client registered', { branchId, role: client.role, lang: client.lang });
        await sendSnapshot(client, { reason: 'initial-sync', requestId: payload.requestId });
    }

    function sendServerLog(client, level, message, context = {}) {
        sendToClient(client, {
            type: 'server:log',
            level,
            message,
            context,
            ts: nowIso(),
            serverId: SERVER_ID
        });
    }

    async function handleMessage(client, raw) {
        let payload = raw;
        if (payload instanceof Buffer) payload = payload.toString('utf8');
        if (typeof payload !== 'string') {
            sendServerLog(client, 'warn', 'Received non-string message');
            return;
        }
        const parsed = safeJsonParse(payload);
        if (!parsed || typeof parsed !== 'object') {
            sendServerLog(client, 'warn', 'Received invalid JSON payload', { preview: payload.slice(0, 80) });
            return;
        }
        if (isPubsubFrame(parsed)) {
            await handlePubsubFrame(client, parsed);
            return;
        }
        switch (parsed.type) {
            case 'client:hello':
                await handleHello(client, parsed);
                break;
            case 'client:request:snapshot':
                await sendSnapshot(client, { reason: 'explicit-request', requestId: parsed.requestId });
                break;
            case 'client:request:history':
                await sendSnapshot(client, { reason: 'history-request', requestId: parsed.requestId });
                break;
            case 'client:publish': {
                if (!client.branchId) {
                    sendServerLog(client, 'error', 'Client attempted publish before hello handshake');
                    return;
                }
                const branchId = client.branchId;
                const moduleId = parsed.moduleId || parsed.module || null;
                if (!moduleId) {
                    sendServerLog(client, 'error', 'Module ID missing in publish payload');
                    return;
                }
                const tableName = parsed.table || parsed.tableName;
                try {
                    await handleModuleEvent(branchId, moduleId, parsed, client, { source: parsed.source || 'ws-client' });

                    // Broadcast sync update after handleModuleEvent
                    const state = await ensureSyncState(branchId, moduleId);
                    await broadcastSyncUpdate(branchId, moduleId, state, {
                        action: parsed.action || 'module:insert',
                        mutationId: parsed.mutationId || parsed.id || null,
                        meta: {
                            table: tableName,
                            source: 'ws-client-insert',
                            clientId: client.id
                        }
                    });
                } catch (error) {
                    logger.warn({ err: error, clientId: client.id, branchId, moduleId, table: tableName }, 'Module event failed');
                    sendServerLog(client, 'error', error.message || 'Module event failed');
                }
                break;
            }
            case 'client:query': {
                if (!client.branchId) {
                    sendServerLog(client, 'error', 'Client attempted query before hello handshake');
                    return;
                }
                const branchId = client.branchId;
                const moduleId = parsed.moduleId || parsed.module || null;
                if (!moduleId) {
                    sendServerLog(client, 'error', 'Module ID missing in query payload');
                    return;
                }
                try {
                    const store = await ensureModuleStore(branchId, moduleId);
                    const tableName = parsed.table || parsed.tableName;
                    const queryType = parsed.queryType || 'list';
                    const populate = parsed.populate !== false;

                    let result = null;

                    if (queryType === 'get') {
                        const id = parsed.id || parsed.recordId;
                        if (!id) {
                            throw new Error('Missing record ID for get query');
                        }
                        result = store.getRecord(tableName, id, { populate });
                    } else {
                        const options = { populate };
                        if (parsed.filter && typeof parsed.filter === 'object') {
                            options.filter = (record) => {
                                for (const [key, value] of Object.entries(parsed.filter)) {
                                    if (record[key] !== value) return false;
                                }
                                return true;
                            };
                        }
                        result = store.queryTable(tableName, options);
                    }

                    client.ws.send(JSON.stringify({
                        type: 'server:query:result',
                        requestId: parsed.requestId,
                        table: tableName,
                        queryType,
                        result,
                        timestamp: nowIso()
                    }));
                } catch (error) {
                    logger.warn({ err: error, clientId: client.id, branchId, moduleId }, 'Query failed');
                    client.ws.send(JSON.stringify({
                        type: 'server:query:error',
                        requestId: parsed.requestId,
                        error: error.message || 'Query failed',
                        timestamp: nowIso()
                    }));
                }
                break;
            }
            default:
                sendServerLog(client, 'warn', 'Unknown message type', { type: parsed.type });
        }
    }

    function getConnectionState(client) {
        return {
            id: client.id,
            branchId: client.branchId,
            role: client.role,
            connectedAt: client.connectedAt,
            attempts: client.attempts,
            state: client.state || 'open'
        };
    }

    return {
        registerClient,
        unregisterClient,
        sendToClient,
        broadcastToBranch,
        emitFullSyncDirective,
        sendSnapshot,
        handleHello,
        sendServerLog,
        handleMessage,
        getConnectionState
    };
}
