/**
 * runtime/sync-state.js
 * Synchronization state management
 */

import { deepClone, nowIso, createId } from '../utils.js';
import { SERVER_ID } from '../config/index.js';
import logger from '../logger.js';

// State containers
const FULL_SYNC_FLAGS = new Map(); // key => { enabled, reason, requestedBy, updatedAt, meta }
const TRANS_HISTORY = new Map(); // key => { order: [transId], records: Map<transId, { ts, payload, mutationIds, lastAckMutationId }> }
const SYNC_STATES = new Map(); // key => { branchId, moduleId, version, moduleSnapshot, updatedAt }

// Constants
export const TRANS_HISTORY_LIMIT = 50;
export const TRANS_MUTATION_HISTORY_LIMIT = 20;

// -- Helpers --

function fullSyncKey(branchId, moduleId) {
    const safeBranch = branchId || 'default';
    const safeModule = moduleId || '*';
    return `${safeBranch}::${safeModule}`;
}

export function isFullSyncFlagActive(branchId, moduleId = '*') {
    const key = fullSyncKey(branchId, moduleId);
    const flag = FULL_SYNC_FLAGS.get(key);
    return !!(flag && flag.enabled);
}

export function getActiveFullSyncFlags(filter = {}) {
    const active = [];
    for (const flag of FULL_SYNC_FLAGS.values()) {
        if (!flag.enabled) continue;
        if (filter.branchId && flag.branchId !== filter.branchId) continue;
        if (filter.moduleId && flag.moduleId !== filter.moduleId) continue;
        active.push(flag);
    }
    return active;
}

export function serializeFullSyncFlag(flag) {
    if (!flag) return null;
    return {
        branchId: flag.branchId,
        moduleId: flag.moduleId,
        enabled: flag.enabled,
        reason: flag.reason,
        requestedBy: flag.requestedBy,
        updatedAt: flag.updatedAt,
        meta: flag.meta
    };
}

export function enableFullSyncFlag(branchId, moduleId = '*', options = {}) {
    const key = fullSyncKey(branchId, moduleId);
    const now = nowIso();
    const existing = FULL_SYNC_FLAGS.get(key);
    const next = {
        ...(existing || {}),
        branchId: branchId || 'default',
        moduleId: moduleId || '*',
        enabled: options.enabled !== false,
        reason: options.reason || FULL_SYNC_FLAGS.get(key)?.reason || null,
        requestedBy: options.requestedBy || FULL_SYNC_FLAGS.get(key)?.requestedBy || null,
        updatedAt: now
    };
    if (options.meta && typeof options.meta === 'object') {
        next.meta = { ...FULL_SYNC_FLAGS.get(key)?.meta, ...options.meta };
    } else if (FULL_SYNC_FLAGS.get(key)?.meta) {
        next.meta = { ...FULL_SYNC_FLAGS.get(key).meta };
    }
    FULL_SYNC_FLAGS.set(key, next);
    return next;
}

export function disableFullSyncFlag(branchId, moduleId = '*', options = {}) {
    const key = fullSyncKey(branchId, moduleId);
    const existing = FULL_SYNC_FLAGS.get(key);
    if (!existing) return null;
    const next = {
        ...existing,
        enabled: false,
        updatedAt: nowIso(),
        clearedBy: options.requestedBy || options.clearedBy || existing.clearedBy || null
    };
    FULL_SYNC_FLAGS.set(key, next);
    return next;
}

export function parseSyncTopic(topic) {
    if (!topic || !topic.startsWith('sync:')) return null;
    const parts = topic.split(':');
    if (parts.length < 3) return null;
    return { branchId: parts[1], moduleId: parts[2] };
}

export function getSyncTopics(branchId, moduleId) {
    const safeBranch = branchId || 'default';
    const safeModule = moduleId || 'pos';
    return [`sync:${safeBranch}:${safeModule}`];
}

function transHistoryKey(branchId, moduleId) {
    const safeBranch = branchId || 'default';
    const safeModule = moduleId || 'pos';
    return `${safeBranch}::${safeModule}`;
}

export { transHistoryKey };

export function getTransTracker(key) {
    if (!key) return null;
    if (!TRANS_HISTORY.has(key)) {
        TRANS_HISTORY.set(key, { order: [], records: new Map() });
    }
    return TRANS_HISTORY.get(key);
}

export function rememberTransRecord(key, transId, payload) {
    if (!key || !transId || !payload) return null;
    const tracker = getTransTracker(key);
    if (!tracker) return null;
    if (tracker.records.has(transId)) {
        const existing = tracker.records.get(transId);
        if (payload?.mutationId && existing) {
            if (!existing.mutationIds) existing.mutationIds = new Set();
            if (!existing.mutationIds.has(payload.mutationId)) {
                existing.mutationIds.add(payload.mutationId);
                if (existing.mutationIds.size > TRANS_MUTATION_HISTORY_LIMIT) {
                    const trimmed = Array.from(existing.mutationIds).slice(-TRANS_MUTATION_HISTORY_LIMIT);
                    existing.mutationIds = new Set(trimmed);
                }
                existing.lastAckMutationId = payload.mutationId;
            }
        }
        return existing;
    }
    const record = {
        ts: Date.now(),
        payload: deepClone(payload),
        mutationIds: new Set(),
        lastAckMutationId: payload?.mutationId || null
    };
    if (payload?.mutationId) {
        record.mutationIds.add(payload.mutationId);
    }
    tracker.records.set(transId, record);
    tracker.order.push(transId);
    if (tracker.order.length > TRANS_HISTORY_LIMIT) {
        const overflow = tracker.order.splice(0, tracker.order.length - TRANS_HISTORY_LIMIT);
        for (const oldId of overflow) {
            tracker.records.delete(oldId);
        }
    }
    return record;
}

export function recallTransRecord(key, transId) {
    if (!key || !transId) return null;
    const tracker = TRANS_HISTORY.get(key);
    if (!tracker) return null;
    return tracker.records.get(transId) || null;
}

export function normalizeTransId(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return null;
}

export function toIsoTimestamp(value, fallback = nowIso()) {
    if (value == null) return fallback;
    if (typeof value === 'string' && value.trim()) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        const date = new Date(numeric);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
    }
    return fallback;
}

export function snapshotsEqual(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (_err) {
        return false;
    }
}

export function summarizeTableCounts(snapshot = {}) {
    const counts = {};
    const tables = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
    for (const [tableName, rows] of Object.entries(tables)) {
        counts[tableName] = Array.isArray(rows) ? rows.length : 0;
    }
    return counts;
}

function syncStateKey(branchId, moduleId) {
    return `${branchId}::${moduleId}`;
}

// Factory for functions requiring dependencies
export function createSyncStateManagers({ ensureModuleStore }) {

    async function ensureSyncState(branchId, moduleId) {
        const key = syncStateKey(branchId, moduleId);
        if (SYNC_STATES.has(key)) {
            return SYNC_STATES.get(key);
        }
        let moduleSnapshot = null;
        try {
            const store = await ensureModuleStore(branchId, moduleId);
            moduleSnapshot = store.getSnapshot();
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Falling back to empty sync snapshot');
        }
        if (!moduleSnapshot) {
            moduleSnapshot = {
                moduleId,
                branchId,
                version: 1,
                tables: {},
                meta: { lastUpdatedAt: nowIso(), branchId, moduleId, serverId: SERVER_ID }
            };
        }
        const state = {
            branchId,
            moduleId,
            version: Number(moduleSnapshot.version) || 1,
            moduleSnapshot,
            updatedAt: moduleSnapshot.meta?.lastUpdatedAt || nowIso()
        };
        SYNC_STATES.set(key, state);
        return state;
    }

    return {
        ensureSyncState
    };
}

// Export raw state for advanced usage if necessary (e.g. debugging)
export function getSyncState(branchId, moduleId) {
    const key = syncStateKey(branchId, moduleId);
    return SYNC_STATES.get(key) || null;
}

export function updateSyncState(branchId, moduleId, updates = {}) {
    const key = syncStateKey(branchId, moduleId);
    const existing = SYNC_STATES.get(key);
    if (!existing) return null;
    const next = { ...existing, ...updates };
    SYNC_STATES.set(key, next);
    return next;
}
