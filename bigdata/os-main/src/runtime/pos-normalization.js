/**
 * runtime/pos-normalization.js
 * POS data normalization and merging logic
 */

import { deepClone, createId } from '../utils.js';

export const POS_TEMP_STORE = 'order_temp';
export const POS_KNOWN_STORES = [
    'orders',
    'orderLines',
    'orderNotes',
    'orderStatusLogs',
    'shifts',
    'posMeta',
    'syncLog',
    POS_TEMP_STORE
];

export const POS_STORE_KEY_SET = new Set(POS_KNOWN_STORES);
export const POS_STORE_KEY_RESOLVERS = {
    orders: (row) => (row && row.id != null ? String(row.id) : null),
    orderLines: (row) => {
        if (!row || typeof row !== 'object') return null;
        if (row.uid != null) return String(row.uid);
        if (row.orderId != null && row.id != null) return `${row.orderId}::${row.id}`;
        return null;
    },
    orderNotes: (row) => (row && row.id != null ? String(row.id) : null),
    orderStatusLogs: (row) => (row && row.id != null ? String(row.id) : null),
    shifts: (row) => (row && row.id != null ? String(row.id) : null),
    posMeta: (row) => (row && row.id != null ? String(row.id) : null),
    syncLog: (row) => {
        if (!row || typeof row !== 'object') return null;
        if (row.ts != null) return String(row.ts);
        if (row.id != null) return String(row.id);
        return null;
    }
};

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function ensurePlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...value };
}

export function toTimestamp(value, fallback = Date.now()) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function mergeStoreRows(existingRows = [], incomingRows = [], storeName) {
    const keyResolver = POS_STORE_KEY_RESOLVERS[storeName] || ((row) => (row && row.id != null ? String(row.id) : null));
    const keyed = new Map();
    const fallback = new Map();
    const register = (rawRow, preferIncoming) => {
        if (!rawRow || typeof rawRow !== 'object') return;
        const row = deepClone(rawRow);
        const key = keyResolver(row);
        if (key) {
            if (preferIncoming || !keyed.has(key)) {
                keyed.set(key, row);
            }
            return;
        }
        let serialized = null;
        try {
            serialized = JSON.stringify(row);
        } catch (_err) {
            serialized = null;
        }
        const fallbackKey = serialized || `row:${fallback.size + keyed.size}`;
        if (preferIncoming || !fallback.has(fallbackKey)) {
            fallback.set(fallbackKey, row);
        }
    };
    existingRows.forEach((row) => register(row, false));
    incomingRows.forEach((row) => register(row, true));
    return [...keyed.values(), ...fallback.values()];
}

export function mergePosStores(existingStores, incomingStores) {
    const existing = isPlainObject(existingStores) ? existingStores : {};
    const incoming = isPlainObject(incomingStores) ? incomingStores : {};
    const merged = {};
    const names = new Set([...Object.keys(existing), ...Object.keys(incoming), ...POS_KNOWN_STORES]);
    names.delete(POS_TEMP_STORE);
    for (const name of names) {
        const currentRows = Array.isArray(existing[name]) ? existing[name] : [];
        if (!Object.prototype.hasOwnProperty.call(incoming, name)) {
            merged[name] = currentRows.map((row) => deepClone(row));
            continue;
        }
        const incomingRows = Array.isArray(incoming[name]) ? incoming[name] : [];
        merged[name] = mergeStoreRows(currentRows, incomingRows, name);
    }
    merged[POS_TEMP_STORE] = [];
    return merged;
}

export function extractIncomingPosStores(payload) {
    const stores = {};
    if (!isPlainObject(payload)) return stores;
    const explicitStores = isPlainObject(payload.stores) ? payload.stores : {};
    for (const name of POS_KNOWN_STORES) {
        const explicitValue = explicitStores[name];
        if (Array.isArray(explicitValue)) {
            stores[name] = explicitValue;
            continue;
        }
        const rootValue = payload[name];
        if (Array.isArray(rootValue)) {
            stores[name] = rootValue;
        }
    }
    return stores;
}

export function mergePosPayload(existingPayload, incomingPayload) {
    const base = isPlainObject(existingPayload) ? deepClone(existingPayload) : {};
    const incoming = isPlainObject(incomingPayload) ? deepClone(incomingPayload) : {};

    for (const [key, value] of Object.entries(incoming)) {
        if (key === 'stores' || POS_STORE_KEY_SET.has(key)) continue;
        if (Array.isArray(value)) {
            base[key] = value.map((entry) => deepClone(entry));
        } else if (isPlainObject(value)) {
            const currentValue = base[key];
            base[key] = isPlainObject(currentValue)
                ? { ...deepClone(currentValue), ...value }
                : value;
        } else {
            base[key] = value;
        }
    }

    const incomingStores = extractIncomingPosStores(incomingPayload);
    const mergedStores = mergePosStores(existingPayload?.stores, incomingStores);
    base.stores = mergedStores;

    for (const name of POS_KNOWN_STORES) {
        if (name === POS_TEMP_STORE) continue;
        if (Object.prototype.hasOwnProperty.call(base, name)) {
            delete base[name];
        }
    }

    return base;
}

export function normalizeDiscount(discount) {
    if (!discount || typeof discount !== 'object') return null;
    const type = discount.type === 'percent' ? 'percent' : discount.type === 'amount' ? 'amount' : null;
    if (!type) return null;
    const value = Number(discount.value);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (type === 'percent') {
        return { type, value: Math.min(100, Math.max(0, value)) };
    }
    return { type, value: Math.max(0, value) };
}

export function normalizeOrderStatusLogEntry(entry, context) {
    if (!entry || !context || !context.orderId) return null;
    const changedAt = toTimestamp(
        entry.changed_at || entry.changedAt || entry.at || entry.timestamp,
        context.updatedAt
    );
    const statusId = entry.status_id || entry.statusId || entry.status || context.statusId || 'open';
    const stageId = entry.stage_id || entry.stageId || entry.stage || context.stageId || null;
    const paymentStateId =
        entry.payment_state_id || entry.paymentStateId || entry.paymentState || context.paymentStateId || null;
    const actorId = entry.actor_id || entry.actorId || entry.userId || entry.changedBy || context.actorId || null;
    const source = entry.source || entry.channel || entry.origin || null;
    const reason = entry.reason || entry.note || null;
    const metadata = ensurePlainObject(entry.metadata || entry.meta);
    const id = entry.id || `${context.orderId}::status::${changedAt}`;
    return {
        id,
        orderId: context.orderId,
        status: statusId,
        stage: stageId || undefined,
        paymentState: paymentStateId || undefined,
        actorId: actorId || undefined,
        source: source || undefined,
        reason: reason || undefined,
        metadata,
        changedAt
    };
}

export function normalizeOrderLineStatusLogEntry(entry, context) {
    if (!entry || !context || !context.orderId || !context.lineId) return null;
    const changedAt = toTimestamp(
        entry.changed_at || entry.changedAt || entry.at || entry.timestamp,
        context.updatedAt
    );
    const statusId = entry.status_id || entry.statusId || entry.status || context.statusId || 'draft';
    const stationId =
        entry.station_id ||
        entry.stationId ||
        entry.section_id ||
        entry.sectionId ||
        entry.kitchen_section_id ||
        entry.kitchenSectionId ||
        context.kitchenSection ||
        null;
    const actorId = entry.actor_id || entry.actorId || entry.userId || entry.changedBy || context.actorId || null;
    const source = entry.source || entry.channel || entry.origin || null;
    const reason = entry.reason || entry.note || null;
    const metadata = ensurePlainObject(entry.metadata || entry.meta);
    const id = entry.id || `${context.lineId}::status::${changedAt}`;
    return {
        id,
        orderId: context.orderId,
        orderLineId: context.lineId,
        status: statusId,
        stationId: stationId || undefined,
        actorId: actorId || undefined,
        source: source || undefined,
        reason: reason || undefined,
        metadata,
        changedAt
    };
}

export function normalizeOrderLineRecord(orderId, line, defaults) {
    if (!line) return null;
    const baseItemKey =
        line.itemId ||
        line.item_id ||
        line.menuItemId ||
        line.menu_item_id ||
        line.productId ||
        line.product_id ||
        createId('ln');
    const uid = line.uid || line.storageId || `${orderId}::${line.id || baseItemKey}`;
    const id = line.id || line.lineId || line.line_id || `${orderId}::${baseItemKey}`;
    const versionValue = Number(line.version);
    // ✅ CRITICAL FIX: Extract qty from 'qty' OR 'quantity'
    // User reported frontend might not send 'qty'
    const qty = Number(line.qty != null ? line.qty : line.quantity);
    const unitPriceRaw = line.unitPrice ?? line.unit_price ?? line.price;
    const price = Number(unitPriceRaw);
    const total = Number(line.total);
    const baseStatus =
        line.status || line.statusId || line.status_id || defaults.status || 'draft';
    const stage = line.stage || line.stageId || line.stage_id || defaults.stage || 'new';
    const kitchenSection =
        line.kitchenSection ||
        line.kitchen_section ||
        line.stationId ||
        line.station_id ||
        line.sectionId ||
        line.section_id ||
        null;
    const createdAt = toTimestamp(line.createdAt, defaults.createdAt);
    const updatedAt = toTimestamp(line.updatedAt, defaults.updatedAt);
    const logContext = {
        orderId,
        lineId: id,
        statusId: baseStatus,
        kitchenSection,
        actorId: defaults.actorId || null,
        updatedAt
    };
    const statusLogs = [];
    const seen = new Set();
    const statusSources = [
        line.statusLogs,
        line.status_logs,
        line.statusHistory,
        line.status_history,
        line.events
    ];
    statusSources.forEach((source) => {
        if (!Array.isArray(source)) return;
        source.forEach((entry) => {
            const normalized = normalizeOrderLineStatusLogEntry(entry, logContext);
            if (normalized && normalized.id && !seen.has(normalized.id)) {
                seen.add(normalized.id);
                statusLogs.push(normalized);
            }
        });
    });
    if (!statusLogs.length) {
        const fallback = normalizeOrderLineStatusLogEntry(
            {
                status: baseStatus,
                stationId: kitchenSection,
                changedAt: updatedAt,
                actorId: logContext.actorId
            },
            logContext
        );
        if (fallback) statusLogs.push(fallback);
    }
    statusLogs.sort((a, b) => (a.changedAt || 0) - (b.changedAt || 0));
    const latest = statusLogs[statusLogs.length - 1] || {};
    const resolvedStatus = latest.status || baseStatus;
    const itemId =
        line.itemId ||
        line.item_id ||
        line.Item_Id ||
        line.menuItemId ||
        line.menu_item_id ||
        line.productId ||
        line.product_id ||
        null;

    if (!itemId) {
        console.error('[Server][normalizeOrderLineRecord] ❌ item_id is NULL!', {
            lineId: line.id,
            orderId,
            lineKeys: Object.keys(line),
            itemId: line.itemId,
            item_id: line.item_id,
            menuItemId: line.menuItemId,
            fullLine: JSON.stringify(line, null, 2)
        });
    }

    const normalizeName = (value) => {
        if (typeof value === 'string') return value || null;
        if (value && typeof value === 'object') {
            return value.ar || value.en || value.name || value.label || null;
        }
        return null;
    };

    const record = {
        uid,
        id,
        orderId,
        itemId,
        item_id: itemId,
        name:
            normalizeName(line.name) ||
            normalizeName(line.itemName) ||
            line.item_name ||
            line.item_label ||
            line.label ||
            null,
        description:
            normalizeName(line.description) ||
            normalizeName(line.itemDescription) ||
            line.item_description ||
            line.lineDescription ||
            line.line_description ||
            null,
        qty: Number.isFinite(qty) ? qty : 0,
        quantity: Number.isFinite(qty) ? qty : 0, // ✅ CRITICAL FIX: Add quantity alias for backend compatibility
        price: Number.isFinite(price) ? price : 0,
        unitPrice: Number.isFinite(price) ? price : 0,
        unit_price: Number.isFinite(price) ? price : 0,
        total: Number.isFinite(total) ? total : (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0),
        status: resolvedStatus,
        stage,
        kitchenSection,
        kitchenSectionId: kitchenSection,
        kitchen_section_id: kitchenSection,
        locked: line.locked !== undefined ? !!line.locked : !!defaults.lockLineEdits,
        notes: Array.isArray(line.notes) ? line.notes.slice() : line.notes ? [line.notes] : [],
        discount: normalizeDiscount(line.discount),
        createdAt,
        updatedAt,
        statusLogs
    };
    if (line.metadata && typeof line.metadata === 'object') {
        record.metadata = { ...line.metadata };
    }
    if (Number.isFinite(versionValue) && versionValue > 0) {
        record.version = Math.trunc(versionValue);
    } else {
        record.version = 1;
    }
    return record;
}

export function normalizeOrderNoteRecord(orderId, note, fallbackAuthor, fallbackTimestamp) {
    if (!note) return null;
    const message =
        typeof note === 'string'
            ? note.trim()
            : typeof note === 'object'
                ? (note.message || note.text || '').trim()
                : '';
    if (!message) return null;
    const createdAt = toTimestamp(note.createdAt || note.created_at, fallbackTimestamp);
    return {
        id: note.id || createId(`note-${orderId}`),
        orderId,
        message,
        authorId: note.authorId || note.author_id || fallbackAuthor || 'pos',
        authorName: note.authorName || note.author_name || '',
        createdAt
    };
}

export function normalizeIncomingOrder(order, options = {}) {
    if (!order || !order.id) {
        throw new Error('POS order payload requires an id.');
    }

    // ✅ CRITICAL FIX: Extract and validate shiftId (reject empty strings!)
    const shiftId = (order.shiftId || order.shift_id || order.metadata?.shiftId || '').trim();

    if (!shiftId || shiftId.length === 0) {
        console.error('❌ [POS-NORM] Missing or empty shiftId in order payload:', {
            id: order.id,
            shiftId: order.shiftId,
            shift_id: order.shift_id,
            metaShiftId: order.metadata?.shiftId,
            keys: Object.keys(order),
            metaKeys: order.metadata ? Object.keys(order.metadata) : []
        });
        throw new Error(
            `POS order payload requires a valid non-empty shiftId. ` +
            `Received: "${shiftId}". Available keys: ${Object.keys(order).join(', ')}`
        );
    }
    const now = Date.now();
    const orderId = String(order.id);
    const createdAt = toTimestamp(order.createdAt, now);
    const updatedAt = toTimestamp(order.updatedAt, createdAt);
    const savedAt = toTimestamp(order.savedAt, updatedAt);
    const type = order.type || order.orderType || order.orderTypeId || order.order_type_id || 'dine_in';
    const status = order.status || order.statusId || order.status_id || 'open';
    const stage =
        order.fulfillmentStage || order.stage || order.stageId || order.stage_id || 'new';
    const paymentState =
        order.paymentState || order.payment_state || order.paymentStateId || order.payment_state_id || 'unpaid';
    const discount = normalizeDiscount(order.discount);
    const rawPayments = Array.isArray(order.payments) ? order.payments : [];
    const payments = rawPayments.map((entry, idx) => ({
        id: entry.id || `pm-${orderId}-${idx + 1}`,
        method: entry.method || entry.id || entry.type || 'cash',
        amount: Number(entry.amount) || 0
    }));
    const headerVersion = Number(order.version);
    const metadata = ensurePlainObject(order.metadata);
    metadata.version = metadata.version || 2;
    metadata.linesCount = Array.isArray(order.lines) ? order.lines.length : metadata.linesCount || 0;
    metadata.notesCount = Array.isArray(order.notes) ? order.notes.length : metadata.notesCount || 0;
    metadata.posId = order.posId || metadata.posId || null;
    metadata.posLabel = order.posLabel || metadata.posLabel || null;
    const posNumberNumeric = Number(order.posNumber ?? metadata.posNumber);
    const posNumber = Number.isFinite(posNumberNumeric) ? posNumberNumeric : null;
    if (discount) metadata.discount = discount;
    if (posNumber !== null) metadata.posNumber = posNumber;
    const actorId =
        order.updatedBy || order.actorId || order.authorId || options.userId || metadata.actorId || order.userId || 'pos';

    // ✅ Extract tableIds from both order.tableIds and order.metadata.tableIds
    const extractedTableIds = Array.isArray(order.tableIds)
        ? order.tableIds
        : (Array.isArray(metadata.tableIds) ? metadata.tableIds : []);

    const orderTypeId = order.orderTypeId || order.order_type_id || type;
    const statusId = order.statusId || order.status_id || status;
    const stageId = order.stageId || order.stage_id || stage;
    const paymentStateId = order.paymentStateId || order.payment_state_id || paymentState;
    const tableId = order.tableId || order.table_id || (extractedTableIds.length ? extractedTableIds[0] : null);

    const header = {
        id: orderId,
        type,
        status,
        fulfillmentStage: stage,
        paymentState,
        orderTypeId,
        statusId,
        stageId,
        paymentStateId,
        tableIds: extractedTableIds.slice(),
        tableId,
        guests: Number.isFinite(Number(order.guests)) ? Number(order.guests) : 0,
        totals: ensurePlainObject(order.totals),
        discount,
        createdAt,
        updatedAt,
        savedAt,
        allowAdditions: order.allowAdditions !== undefined ? !!order.allowAdditions : true,
        lockLineEdits: order.lockLineEdits !== undefined ? !!order.lockLineEdits : true,
        isPersisted: true,
        dirty: false,
        origin: order.origin || 'pos',
        shiftId,
        posId: order.posId || metadata.posId || null,
        posLabel: order.posLabel || metadata.posLabel || null,
        posNumber,
        metadata,
        payments: payments.map((entry) => ({ ...entry })),
        customerId: order.customerId || null,
        customerAddressId: order.customerAddressId || null,
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        customerAddress: order.customerAddress || '',
        customerAreaId: order.customerAreaId || null
    };
    if (Number.isFinite(headerVersion) && headerVersion > 0) {
        header.version = Math.trunc(headerVersion);
    }
    if (order.finalizedAt) header.finalizedAt = toTimestamp(order.finalizedAt, savedAt);
    if (order.finishedAt) header.finishedAt = toTimestamp(order.finishedAt, savedAt);

    const lineDefaults = {
        orderId,
        status,
        stage,
        lockLineEdits: header.lockLineEdits,
        createdAt,
        updatedAt,
        actorId
    };

    const lines = Array.isArray(order.lines)
        ? order.lines.map((line) => normalizeOrderLineRecord(orderId, line, lineDefaults)).filter(Boolean)
        : [];
    const notes = Array.isArray(order.notes)
        ? order.notes.map((note) => normalizeOrderNoteRecord(orderId, note, actorId, updatedAt)).filter(Boolean)
        : [];

    const statusLogSources = [
        order.statusLogs,
        order.status_logs,
        order.statusHistory,
        order.status_history,
        order.events
    ];

    const statusLogs = [];
    const seenStatus = new Set();
    statusLogSources.forEach((source) => {
        if (!Array.isArray(source)) return;
        source.forEach((entry) => {
            const normalized = normalizeOrderStatusLogEntry(entry, {
                orderId,
                statusId: status,
                stageId: stage,
                paymentStateId: paymentState,
                actorId,
                updatedAt
            });
            if (normalized && normalized.id && !seenStatus.has(normalized.id)) {
                seenStatus.add(normalized.id);
                statusLogs.push(normalized);
            }
        });
    });
    if (!statusLogs.length) {
        const fallback = normalizeOrderStatusLogEntry(
            { status, stage, paymentState, changedAt: updatedAt, actorId },
            {
                orderId,
                statusId: status,
                stageId: stage,
                paymentStateId: paymentState,
                actorId,
                updatedAt
            }
        );
        if (fallback) statusLogs.push(fallback);
    }
    statusLogs.sort((a, b) => (a.changedAt || 0) - (b.changedAt || 0));

    header.metadata.linesCount = lines.length;
    header.metadata.notesCount = notes.length;

    return { header, lines, notes, statusLogs };
}

export function buildAckOrder(normalized) {
    if (!normalized || !normalized.header) return null;
    return {
        ...deepClone(normalized.header),
        lines: normalized.lines.map((line) => deepClone(line)),
        notes: normalized.notes.map((note) => deepClone(note)),
        statusLogs: normalized.statusLogs.map((log) => deepClone(log))
    };
}
