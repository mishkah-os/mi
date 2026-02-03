import logger from '../logger.js';
import { deepClone, isPlainObject, nowIso } from '../utils.js';
import {
    parseSyncTopic, getSyncTopics, getActiveFullSyncFlags, serializeFullSyncFlag,
    transHistoryKey, rememberTransRecord, recallTransRecord, normalizeTransId,
    TRANS_MUTATION_HISTORY_LIMIT
} from './sync-state.js';
import { logRejectedMutation as recordRejectedMutation } from '../eventStore.js';
import config from '../config/index.js';

const { SERVER_ID, DEFAULT_TRANSACTION_TABLES } = config;

// Topic prefixes
const TABLE_TOPIC_PREFIX = 'table:';
const GLOBAL_TABLE_TOPIC_PREFIX = 'global:table:';

// PubSub state
const PUBSUB_TOPICS = new Map();
const PUBSUB_TYPES = new Set(['auth', 'subscribe', 'publish', 'ping', 'pong']);

// Transaction table aliases
const TRANSACTION_TABLE_ALIAS_ENTRIES = [
    ['order_header', 'order_header'],
    ['orders', 'order_header'],
    ['order', 'order_header'],
    ['order_headers', 'order_header'],
    ['orderheader', 'order_header'],
    ['order_line', 'order_line'],
    ['order_lines', 'order_line'],
    ['orders_lines', 'order_line'],
    ['orderline', 'order_line'],
    ['orderlines', 'order_line'],
    ['line_items', 'order_line'],
    ['payments', 'order_payment'],
    ['payment', 'order_payment'],
    ['order_payments', 'order_payment'],
    ['pos_payments', 'order_payment'],
    ['pos_payment', 'order_payment'],
    ['pos_shift', 'pos_shift'],
    ['pos_shifts', 'pos_shift'],
    ['shifts', 'pos_shift'],
    ['shift', 'pos_shift']
];

export function createPubsubManager({
    ensureSyncState,
    applyPosOrderCreate,
    applySyncSnapshot,
    clients,
    sendToClient,
    nextBroadcastCycle,
    recordWsBroadcast
}) {
    function normalizeTableIdentifier(value) {
        if (value == null) return '';
        return String(value)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    const TRANSACTION_TABLE_ALIAS_MAP = new Map(
        TRANSACTION_TABLE_ALIAS_ENTRIES.map(([alias, target]) => [normalizeTableIdentifier(alias), target])
    );

    function resolveTransactionTableName(input) {
        if (input === undefined || input === null) return null;
        const normalized = normalizeTableIdentifier(input);
        if (!normalized) return null;
        if (TRANSACTION_TABLE_ALIAS_MAP.has(normalized)) {
            return TRANSACTION_TABLE_ALIAS_MAP.get(normalized);
        }
        return String(input).trim();
    }

    function normalizeTransactionTableList(input, { fallbackToDefaults = true } = {}) {
        const values = [];
        const seen = new Set();
        let includeDefaults = false;
        let sawExplicit = false;

        const addValue = (raw) => {
            if (raw === undefined || raw === null) return;
            const trimmed = String(raw).trim();
            if (!trimmed) return;
            sawExplicit = true;
            if (trimmed === '*') {
                includeDefaults = true;
                return;
            }
            const resolved = resolveTransactionTableName(trimmed);
            if (!resolved) return;
            const name = String(resolved).trim();
            if (!name || seen.has(name)) return;
            seen.add(name);
            values.push(name);
        };

        if (Array.isArray(input)) {
            for (const entry of input) addValue(entry);
        } else if (typeof input === 'string') {
            input
                .split(/[,;\s]+/)
                .map((part) => part.trim())
                .filter(Boolean)
                .forEach((part) => addValue(part));
        } else if (input && typeof input === 'object') {
            for (const value of Object.values(input)) addValue(value);
        }

        if (!sawExplicit && fallbackToDefaults) {
            includeDefaults = true;
        }

        if (includeDefaults || (values.length === 0 && fallbackToDefaults)) {
            for (const table of DEFAULT_TRANSACTION_TABLES) {
                if (!seen.has(table)) {
                    seen.add(table);
                    values.push(table);
                }
            }
        }

        return values;
    }

    function deepEqual(a, b) {
        if (a === b) return true;
        if (a === null || b === null) return a === b;
        if (typeof a !== typeof b) return false;
        if (Array.isArray(a)) {
            if (!Array.isArray(b) || a.length !== b.length) return false;
            for (let idx = 0; idx < a.length; idx += 1) {
                if (!deepEqual(a[idx], b[idx])) return false;
            }
            return true;
        }
        if (typeof a === 'object') {
            const aKeys = Object.keys(a);
            const bKeys = Object.keys(b || {});
            if (aKeys.length !== bKeys.length) return false;
            for (const key of aKeys) {
                if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
                if (!deepEqual(a[key], b[key])) return false;
            }
            return true;
        }
        return false;
    }

    function buildSnapshotEnvelope(state) {
        if (state === undefined) {
            return { mode: 'snapshot', snapshot: null };
        }
        if (!isPlainObject(state)) {
            return { mode: 'snapshot', snapshot: deepClone(state) };
        }
        return { mode: 'snapshot', snapshot: deepClone(state) };
    }

    function buildDeltaEnvelope(previous, next) {
        if (!isPlainObject(previous) || !isPlainObject(next)) {
            return buildSnapshotEnvelope(next);
        }
        const set = {};
        const remove = [];
        let changed = false;
        for (const [key, value] of Object.entries(next)) {
            if (!deepEqual(previous[key], value)) {
                set[key] = deepClone(value);
                changed = true;
            }
        }
        for (const key of Object.keys(previous)) {
            if (!Object.prototype.hasOwnProperty.call(next, key)) {
                remove.push(key);
                changed = true;
            }
        }
        if (!changed) return null;
        const envelope = { mode: 'delta', set };
        if (remove.length) envelope.remove = remove;
        return envelope;
    }

    function buildSyncPublishData(state, overrides = {}) {
        const snapshot = overrides.snapshot ? deepClone(overrides.snapshot) : deepClone(state.moduleSnapshot);
        const baseFrame = overrides.frameData && typeof overrides.frameData === 'object' ? deepClone(overrides.frameData) : {};
        const version = Number.isFinite(overrides.version) ? Number(overrides.version) : Number(state.version) || 1;
        const meta = {
            branchId: state.branchId,
            moduleId: state.moduleId,
            serverId: SERVER_ID,
            version,
            updatedAt: overrides.updatedAt || state.updatedAt,
            ...(baseFrame.meta || {}),
            ...(overrides.meta || {})
        };
        const activeFlags = getActiveFullSyncFlags(state.branchId, state.moduleId);
        if (activeFlags.length) {
            meta.fullSyncRequired = true;
            meta.fullSyncFlags = activeFlags.map((entry) => serializeFullSyncFlag(entry));
        }
        const payload = {
            action: overrides.action || baseFrame.action || 'snapshot',
            branchId: state.branchId,
            moduleId: state.moduleId,
            version,
            snapshot,
            mutationId: overrides.mutationId || baseFrame.mutationId || null,
            meta
        };
        delete baseFrame.action;
        delete baseFrame.snapshot;
        delete baseFrame.version;
        delete baseFrame.mutationId;
        delete baseFrame.meta;
        Object.assign(payload, baseFrame);
        return payload;
    }

    async function loadTopicBootstrap(topic) {
        const descriptor = parseSyncTopic(topic);
        if (!descriptor) {
            return null;
        }
        try {
            const state = await ensureSyncState(descriptor.branchId, descriptor.moduleId);
            const payload = buildSyncPublishData(state, { meta: { reason: 'bootstrap' } });
            return deepClone(payload);
        } catch (error) {
            logger.warn({ err: error, topic, descriptor }, 'Failed to generate pubsub bootstrap payload');
            return null;
        }
    }

    async function ensurePubsubTopic(topic) {
        if (!PUBSUB_TOPICS.has(topic)) {
            PUBSUB_TOPICS.set(topic, { subscribers: new Set(), lastData: null });
        }
        const record = PUBSUB_TOPICS.get(topic);
        if (record.lastData === undefined || record.lastData === null) {
            const bootstrap = await loadTopicBootstrap(topic);
            if (bootstrap) {
                record.lastData = bootstrap;
            }
        }
        return record;
    }

    async function registerPubsubSubscriber(topic, client) {
        const record = await ensurePubsubTopic(topic);
        record.subscribers.add(client.id);
        if (!client.pubsubTopics) {
            client.pubsubTopics = new Set();
        }
        client.pubsubTopics.add(topic);
        if (record.lastData === undefined || record.lastData === null) {
            const bootstrap = await loadTopicBootstrap(topic);
            if (bootstrap) {
                record.lastData = bootstrap;
            } else {
                logger.debug({ topic }, 'No bootstrap payload available for pubsub subscription');
            }
        }
        return record;
    }

    function unregisterPubsubSubscriptions(client) {
        if (!client || !client.pubsubTopics) return;
        for (const topic of client.pubsubTopics) {
            const record = PUBSUB_TOPICS.get(topic);
            if (record) {
                record.subscribers.delete(client.id);
                if (!record.subscribers.size) {
                    PUBSUB_TOPICS.delete(topic);
                }
            }
        }
        client.pubsubTopics.clear();
    }

    async function broadcastPubsub(topic, data) {
        const record = await ensurePubsubTopic(topic);
        const envelope = record.lastData ? buildDeltaEnvelope(record.lastData, data) : buildSnapshotEnvelope(data);
        if (!envelope) {
            return;
        }
        record.lastData = deepClone(data);
        const frame = { type: 'publish', topic, data: envelope };
        const cycle = nextBroadcastCycle();
        let delivered = 0;
        for (const clientId of record.subscribers) {
            const target = clients.get(clientId);
            if (!target) continue;
            if (sendToClient(target, frame, { cycle, channel: 'pubsub' })) {
                delivered += 1;
            }
        }
        recordWsBroadcast('pubsub', delivered);
    }

    function isPubsubFrame(payload) {
        if (!payload || typeof payload !== 'object') return false;
        return PUBSUB_TYPES.has(payload.type);
    }

    function getTableNoticeTopics(branchId, moduleId, tableName) {
        const safeBranch = branchId || 'default';
        const safeModule = moduleId || 'pos';
        const safeTable = tableName || 'default';
        return [
            `${TABLE_TOPIC_PREFIX}${safeBranch}::${safeModule}::${safeTable}`,
            `${TABLE_TOPIC_PREFIX}${safeBranch}::${safeTable}`,
            `${GLOBAL_TABLE_TOPIC_PREFIX}${safeTable}`
        ];
    }

    function resolveBranchTopicSuffixFromTable(tableName) {
        const normalized = normalizeTableIdentifier(tableName);
        if (!normalized) return null;
        if (['orders', 'order', 'order_headers', 'orderheaders', 'job_orders', 'joborders'].includes(normalized)) {
            return 'pos:kds:orders';
        }
        if (['jobs', 'kds_jobs', 'kdsjobs', 'job_queue', 'jobqueue'].includes(normalized)) {
            return 'kds:jobs:updates';
        }
        if (['payments', 'payment_records', 'paymentrecords', 'order_payments', 'pos_payments', 'pospayments'].includes(normalized)) {
            return 'pos:payments';
        }
        return null;
    }

    function resolveBranchTopicsFromFrame(frame = {}, payload = {}) {
        const topics = new Set();
        if (!frame || typeof frame !== 'object') frame = {};
        const orderCandidates = [frame.order, frame.orders, frame.jobOrders];
        if (orderCandidates.some((value) => value && (Array.isArray(value) || typeof value === 'object'))) {
            topics.add('pos:kds:orders');
        }
        if (frame.orderId || frame.orderID) {
            topics.add('pos:kds:orders');
        }
        if (frame.jobId || frame.job || frame.jobs || frame.jobOrders) {
            topics.add('kds:jobs:updates');
        }
        if (frame.payment || frame.payments || frame.paymentId || frame.paymentID) {
            topics.add('pos:payments');
        }
        const tableCandidates = [
            frame.table, frame.tableName, frame.targetTable,
            frame.meta?.table, frame.meta?.tableName,
            payload?.meta?.table, payload?.table
        ];
        for (const candidate of tableCandidates) {
            const suffix = resolveBranchTopicSuffixFromTable(candidate);
            if (suffix) topics.add(suffix);
        }
        return topics;
    }

    function buildBranchDeltaDetail(branchId, payload = {}, frame = {}) {
        const detail = {
            type: 'branch:delta',
            branchId,
            moduleId: payload?.moduleId || frame?.moduleId || 'pos',
            action: payload?.action || frame?.action || 'update',
            version: payload?.version || null,
            mutationId: payload?.mutationId || frame?.mutationId || null
        };
        if (frame?.orderId || frame?.order_id) {
            detail.orderId = frame.orderId || frame.order_id;
        }
        if (frame?.order && typeof frame.order === 'object' && frame.order.id !== undefined) {
            detail.orderId = frame.order.id;
        }
        if (frame?.jobId || frame?.job_id) {
            detail.jobId = frame.jobId || frame.job_id;
        }
        if (frame?.paymentId || frame?.payment_id) {
            detail.paymentId = frame.paymentId || frame.payment_id;
        }
        if (payload?.meta && typeof payload.meta === 'object') {
            detail.meta = deepClone(payload.meta);
        } else if (frame?.meta && typeof frame.meta === 'object') {
            detail.meta = deepClone(frame.meta);
        }
        return detail;
    }

    async function broadcastBranchTopics(branchId, suffixes, detail = {}) {
        if (!suffixes || !suffixes.size) return;
        const safeBranch = branchId || 'default';
        for (const suffix of suffixes) {
            if (!suffix) continue;
            const topic = `${safeBranch}:${suffix}`;
            const payload = {
                ...deepClone(detail),
                branchId: safeBranch,
                topic: suffix,
                publishedAt: nowIso()
            };
            await broadcastPubsub(topic, payload);
        }
    }

    function getAllTableNames(tableName) {
        if (!tableName) return [tableName];
        const name = String(tableName).toLowerCase();
        const aliasGroups = {
            'order_header': ['order_header', 'orders', 'orderHeader'],
            'order_line': ['order_line', 'order_lines', 'orderLine'],
            'order_payment': ['order_payment', 'order_payments', 'payments', 'orderPayment'],
            'order_delivery': ['order_delivery', 'deliveries', 'order_deliveries', 'orderDelivery'],
            'job_order_batch': ['job_order_batch', 'job_order_batches', 'batches', 'jobOrderBatch'],
            'job_order_header': ['job_order_header', 'job_orders', 'job_order_headers', 'jobOrderHeader'],
            'job_order_detail': ['job_order_detail', 'job_order_details', 'jobOrderDetail'],
            'job_order_detail_modifier': ['job_order_detail_modifier', 'jobOrderDetailModifier'],
            'job_order_status_history': ['job_order_status_history', 'jobOrderStatusHistory']
        };
        let canonical = name;
        for (const [canonicalName, aliases] of Object.entries(aliasGroups)) {
            if (aliases.some(alias => alias.toLowerCase() === name)) {
                canonical = canonicalName;
                break;
            }
        }
        return aliasGroups[canonical] || [tableName];
    }

    async function broadcastTableNotice(branchId, moduleId, tableName, notice = {}) {
        const allTableNames = getAllTableNames(tableName);
        for (const tableNameVariant of allTableNames) {
            const payload = {
                type: 'table:update',
                branchId,
                moduleId,
                table: tableNameVariant,
                ...deepClone(notice)
            };
            const topics = getTableNoticeTopics(branchId, moduleId, tableNameVariant);
            for (const topic of topics) {
                await broadcastPubsub(topic, payload);
            }
        }
        const branchSuffix = resolveBranchTopicSuffixFromTable(tableName);
        if (branchSuffix) {
            const detail = {
                type: 'branch:table-notice',
                table: normalizeTableIdentifier(tableName),
                moduleId,
                action: notice.action || 'table:update',
                eventId: notice.eventId || null,
                sequence: notice.sequence || null,
                recordRef: notice.recordRef || null
            };
            if (notice.meta && typeof notice.meta === 'object') {
                detail.meta = deepClone(notice.meta);
            }
            await broadcastBranchTopics(branchId, new Set([branchSuffix]), detail);
        }
        return { type: 'table:update', branchId, moduleId, table: tableName };
    }

    async function broadcastSyncUpdate(branchId, moduleId, state, options = {}) {
        const payload = buildSyncPublishData(state, options);
        const topics = getSyncTopics(branchId, moduleId);
        for (const topic of topics) {
            await broadcastPubsub(topic, payload);
        }
        const frameData = options.frameData && typeof options.frameData === 'object' ? options.frameData : {};
        const branchTopics = resolveBranchTopicsFromFrame(frameData, payload);
        if (branchTopics.size) {
            const detail = buildBranchDeltaDetail(branchId, payload, frameData);
            await broadcastBranchTopics(branchId, branchTopics, detail);
        }
        return payload;
    }

    async function handlePubsubFrame(client, frame) {
        if (!client) return;
        client.protocol = 'pubsub';
        switch (frame.type) {
            case 'ping':
                sendToClient(client, { type: 'pong' });
                return;
            case 'pong':
                return;
            case 'auth':
                client.authenticated = true;
                sendToClient(client, { type: 'ack', event: 'auth' });
                return;
            case 'subscribe': {
                const topic = typeof frame.topic === 'string' ? frame.topic.trim() : '';
                if (!topic) {
                    sendToClient(client, { type: 'error', code: 'invalid-topic', message: 'Subscription topic required.' });
                    return;
                }
                const record = await registerPubsubSubscriber(topic, client);
                sendToClient(client, { type: 'ack', event: 'subscribe', topic });
                if (record.lastData !== undefined && record.lastData !== null) {
                    const snapshotEnvelope = buildSnapshotEnvelope(record.lastData);
                    sendToClient(
                        client,
                        { type: 'publish', topic, data: snapshotEnvelope },
                        { cycle: nextBroadcastCycle(), channel: 'pubsub' }
                    );
                }
                return;
            }
            case 'publish': {
                const topic = typeof frame.topic === 'string' ? frame.topic.trim() : '';
                if (!topic) return;
                const descriptor = parseSyncTopic(topic);
                const frameData = frame.data && typeof frame.data === 'object' ? frame.data : {};
                const userFromFrame = typeof frameData.userId === 'string' && frameData.userId.trim()
                    ? frameData.userId.trim()
                    : null;
                if (userFromFrame) client.userUuid = userFromFrame;
                const transId = normalizeTransId(frameData.trans_id || frameData.transId || frameData.mutationId || null);
                if (descriptor) {
                    const trackerKey = transHistoryKey(descriptor.branchId, descriptor.moduleId);
                    if (!transId) {
                        sendToClient(client, {
                            type: 'error',
                            code: 'missing-trans-id',
                            message: 'Publish frames must include a trans_id.',
                            topic
                        });
                        return;
                    }
                    const duplicate = recallTransRecord(trackerKey, transId);
                    if (duplicate && duplicate.payload) {
                        // Handle duplicate transaction
                        const cached = duplicate.payload;
                        const ackPayload = deepClone(cached);
                        const requestedMutationId = typeof frameData.mutationId === 'string' && frameData.mutationId.trim()
                            ? frameData.mutationId.trim()
                            : null;
                        const previousMutationId = cached && typeof cached === 'object' && cached.mutationId
                            ? cached.mutationId
                            : duplicate.lastAckMutationId || null;
                        if (ackPayload && typeof ackPayload === 'object') {
                            if (requestedMutationId) {
                                ackPayload.mutationId = requestedMutationId;
                            }
                            const baseMeta = ackPayload.meta && typeof ackPayload.meta === 'object'
                                ? { ...ackPayload.meta }
                                : {};
                            const duplicateMeta = {
                                ...baseMeta,
                                duplicateTrans: true,
                                transId,
                                previousMutationId: previousMutationId || null,
                                ackedMutationId: requestedMutationId || previousMutationId || null
                            };
                            if (frameData.meta && typeof frameData.meta === 'object') {
                                ackPayload.meta = { ...duplicateMeta, ...frameData.meta };
                            } else {
                                ackPayload.meta = duplicateMeta;
                            }
                        }
                        if (requestedMutationId) {
                            if (!duplicate.mutationIds) duplicate.mutationIds = new Set();
                            if (!duplicate.mutationIds.has(requestedMutationId)) {
                                duplicate.mutationIds.add(requestedMutationId);
                                if (duplicate.mutationIds.size > TRANS_MUTATION_HISTORY_LIMIT) {
                                    const trimmed = Array.from(duplicate.mutationIds).slice(-TRANS_MUTATION_HISTORY_LIMIT);
                                    duplicate.mutationIds = new Set(trimmed);
                                }
                            }
                            duplicate.lastAckMutationId = requestedMutationId;
                        }
                        logger.info({
                            clientId: client.id,
                            branchId: descriptor.branchId,
                            moduleId: descriptor.moduleId,
                            transId,
                            requestedMutationId,
                            previousMutationId
                        }, 'Duplicate trans_id acknowledged without reapplying payload.');
                        await recordRejectedMutation(descriptor.branchId, descriptor.moduleId, {
                            reason: 'duplicate-trans-id',
                            source: 'ws-publish',
                            transId,
                            mutationId: requestedMutationId || previousMutationId || null,
                            meta: {
                                previousMutationId: previousMutationId || null,
                                clientId: client.id,
                                topic,
                                duplicateTrans: true
                            },
                            payload: frameData
                        });
                        sendToClient(client, { type: 'publish', topic, data: ackPayload });
                        return;
                    }
                    let state = await ensureSyncState(descriptor.branchId, descriptor.moduleId);
                    if (
                        descriptor.moduleId === 'pos' &&
                        frameData.action === 'create-order' &&
                        frameData.order &&
                        typeof frameData.order === 'object'
                    ) {
                        try {
                            const result = await applyPosOrderCreate(descriptor.branchId, descriptor.moduleId, frameData, {
                                clientId: client.id,
                                userUuid: client.userUuid || userFromFrame || null,
                                transId,
                                meta: frameData.meta || {}
                            });
                            state = result.state;
                            if (result.order) {
                                frameData.order = result.order;
                                frameData.meta = {
                                    ...(frameData.meta && typeof frameData.meta === 'object' ? frameData.meta : {}),
                                    persisted: true,
                                    persistedAt: result.order.savedAt || result.order.updatedAt || Date.now(),
                                    persistedAtIso: new Date(
                                        result.order.savedAt || result.order.updatedAt || Date.now()
                                    ).toISOString(),
                                    branchId: descriptor.branchId,
                                    moduleId: descriptor.moduleId,
                                    existing: result.existing
                                };
                                if (result.existing) {
                                    frameData.existing = true;
                                    await recordRejectedMutation(descriptor.branchId, descriptor.moduleId, {
                                        reason: 'duplicate-order',
                                        source: 'ws-pos-order',
                                        transId,
                                        mutationId: frameData.mutationId || null,
                                        meta: {
                                            orderId: result.order.id,
                                            clientId: client.id,
                                            existing: true,
                                            topic
                                        },
                                        payload: frameData
                                    });
                                }
                            }
                        } catch (error) {
                            logger.warn(
                                { err: error, branchId: descriptor.branchId, moduleId: descriptor.moduleId, orderId: frameData.order?.id },
                                'Failed to persist POS order from publish frame'
                            );
                            sendToClient(client, {
                                type: 'error',
                                code: 'order-persist-failed',
                                message: error?.message || 'Failed to persist order on server.'
                            });
                            return;
                        }
                    }
                    if (frameData.snapshot && typeof frameData.snapshot === 'object') {
                        try {
                            state = await applySyncSnapshot(descriptor.branchId, descriptor.moduleId, frameData.snapshot, {
                                origin: 'ws',
                                clientId: client.id,
                                userUuid: client.userUuid || userFromFrame || null,
                                transId
                            });
                        } catch (error) {
                            if (error?.code === 'INSERT_ONLY_VIOLATION') {
                                sendToClient(client, {
                                    type: 'error',
                                    code: 'insert-only-violation',
                                    message: error.message,
                                    details: error.details || null
                                });
                                return;
                            }
                            logger.warn({ err: error, branchId: descriptor.branchId, moduleId: descriptor.moduleId }, 'Failed to apply sync snapshot from WS');
                            sendToClient(client, {
                                type: 'error',
                                code: 'sync-snapshot-failed',
                                message: error?.message || 'Failed to apply snapshot.'
                            });
                            return;
                        }
                    }
                    const published = await broadcastSyncUpdate(descriptor.branchId, descriptor.moduleId, state, {
                        action: frameData.action,
                        mutationId: frameData.mutationId,
                        meta: frameData.meta,
                        frameData
                    });
                    rememberTransRecord(trackerKey, transId, published);
                } else {
                    await broadcastPubsub(topic, frameData);
                }
                return;
            }
            default: {
                const message = frame.type ? `Unsupported frame type "${frame.type}"` : 'Unsupported frame type';
                sendToClient(client, { type: 'error', code: 'unsupported-frame', message });
            }
        }
    }

    return {
        // Topic management
        loadTopicBootstrap,
        ensurePubsubTopic,
        registerPubsubSubscriber,
        unregisterPubsubSubscriptions,

        // Broadcasting
        broadcastPubsub,
        broadcastSyncUpdate,
        broadcastBranchTopics,
        broadcastTableNotice,

        // Data building
        buildSyncPublishData,
        buildSnapshotEnvelope,
        buildDeltaEnvelope,
        buildBranchDeltaDetail,

        // Table utilities
        normalizeTableIdentifier,
        normalizeTransactionTableList,
        resolveTransactionTableName,
        getTableNoticeTopics,
        resolveBranchTopicSuffixFromTable,
        resolveBranchTopicsFromFrame,
        getAllTableNames,

        // Frame handling
        isPubsubFrame,
        handlePubsubFrame,

        // Utilities
        deepEqual,

        // State access
        getPubsubTopics: () => PUBSUB_TOPICS
    };
}

export { PUBSUB_TYPES };
