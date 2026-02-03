/**
 * runtime/utils.js
 * Shared utility functions for server runtime
 */

import { readFile, writeFile, mkdir, stat, access } from 'fs/promises';
import { constants as FS_CONSTANTS } from 'fs';
import path from 'path';
import { ROOT_DIR } from '../config/index.js';
import logger from '../logger.js';
import { VersionConflictError } from '../database/module-store.js';
import { safeDecode } from '../utils/helpers.js';

export async function describeFile(filePath) {
    if (!filePath) {
        return { exists: false, mtimeMs: null };
    }
    try {
        const stats = await stat(filePath);
        if (stats.isFile()) {
            return { exists: true, mtimeMs: stats.mtimeMs };
        }
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return { exists: false, mtimeMs: null };
        }
        throw error;
    }
    return { exists: false, mtimeMs: null };
}

export async function readJsonSafe(filePath, fallback = null) {
    try {
        const raw = await readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        logger.warn({ err: error, filePath }, 'Failed to read JSON file');
        return fallback;
    }
}

export async function writeJson(filePath, payload) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export function jsonResponse(res, status, payload) {
    if (res.writableEnded || res.destroyed) {
        logger.warn({ status }, 'jsonResponse called after response ended');
        return;
    }
    try {
        res.writeHead(status, {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        });
        res.end(JSON.stringify(payload, null, 2));
    } catch (error) {
        logger.error({ err: error, status }, 'jsonResponse failed');
    }
}

export function resolveTimestampInput(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) return numeric;
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function normalizeCursorInput(value) {
    const payload = {};
    const candidates = new Set();
    const register = (field, raw) => {
        if (raw === undefined || raw === null) return;
        let str;
        if (typeof raw === 'string') {
            str = raw.trim();
        } else if (typeof raw === 'number' && Number.isFinite(raw)) {
            str = String(raw);
        } else if (typeof raw === 'bigint') {
            str = raw.toString();
        } else {
            return;
        }
        if (!str) return;
        candidates.add(str);
        if (field) {
            payload[field] = str;
        }
    };

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const field of ['key', 'id', 'uuid', 'uid']) {
            register(field, value[field]);
        }
        if (value.primaryKey && typeof value.primaryKey === 'object') {
            for (const [field, raw] of Object.entries(value.primaryKey)) {
                register(field, raw);
            }
        }
        if (value.primary && typeof value.primary === 'object') {
            for (const [field, raw] of Object.entries(value.primary)) {
                register(field, raw);
            }
        }
        if (!Object.keys(payload).length && value.value !== undefined) {
            register('key', value.value);
        }
    } else if (value !== undefined && value !== null) {
        register('key', value);
        register('id', value);
    }

    return { candidates, object: Object.keys(payload).length ? payload : null };
}

export function recordMatchesCandidates(ref, candidates) {
    if (!ref || !candidates || !candidates.size) return false;
    for (const candidate of candidates) {
        if (ref.key != null && String(ref.key) === candidate) return true;
        if (ref.id != null && String(ref.id) === candidate) return true;
        if (ref.uuid != null && String(ref.uuid) === candidate) return true;
        if (ref.uid != null && String(ref.uid) === candidate) return true;
        if (ref.primaryKey && typeof ref.primaryKey === 'object') {
            for (const value of Object.values(ref.primaryKey)) {
                if (value != null && String(value) === candidate) {
                    return true;
                }
            }
        }
    }
    return false;
}

export function buildRecordCursor(ref) {
    if (!ref || typeof ref !== 'object') return null;
    const cursor = {};
    if (ref.key != null) cursor.key = String(ref.key);
    if (ref.id != null) cursor.id = String(ref.id);
    if (ref.uuid != null) cursor.uuid = String(ref.uuid);
    if (ref.uid != null) cursor.uid = String(ref.uid);
    if (ref.primaryKey && typeof ref.primaryKey === 'object') {
        const primaryKey = {};
        for (const [field, value] of Object.entries(ref.primaryKey)) {
            if (value !== undefined && value !== null) {
                primaryKey[field] = String(value);
            }
        }
        if (Object.keys(primaryKey).length) {
            cursor.primaryKey = primaryKey;
        }
    }
    return Object.keys(cursor).length ? cursor : null;
}

export function stringifyCursor(ref) {
    if (!ref || typeof ref !== 'object') return null;
    if (ref.key != null && String(ref.key)) return String(ref.key);
    if (ref.id != null && String(ref.id)) return String(ref.id);
    if (ref.uuid != null && String(ref.uuid)) return String(ref.uuid);
    if (ref.uid != null && String(ref.uid)) return String(ref.uid);
    if (ref.primaryKey && typeof ref.primaryKey === 'object') {
        for (const value of Object.values(ref.primaryKey)) {
            if (value != null) {
                const str = String(value);
                if (str) return str;
            }
        }
    }
    return null;
}

export function computeInsertOnlyDelta(store, tableName, lastCursorValue) {
    const rows = Array.isArray(store?.tables) && store.tables.includes(tableName) ? store.listTable(tableName) : [];
    const normalized = normalizeCursorInput(lastCursorValue);
    let startIndex = 0;
    let matched = false;
    if (normalized.candidates.size) {
        for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
            const ref = store.getRecordReference(tableName, rows[idx]);
            if (recordMatchesCandidates(ref, normalized.candidates)) {
                matched = true;
                startIndex = idx + 1;
                break;
            }
        }
    }
    const requiresFullSync = normalized.candidates.size > 0 && !matched && rows.length > 0;
    const deltaRows = rows.slice(startIndex);
    const lastRow = rows.length ? rows[rows.length - 1] : null;
    const lastCursor = lastRow ? buildRecordCursor(store.getRecordReference(tableName, lastRow)) : null;
    return {
        rows: deltaRows,
        total: rows.length,
        lastCursor,
        matched,
        requiresFullSync,
        clientCursor: normalized.object,
        hadCursor: normalized.candidates.size > 0
    };
}

export function normalizeDeltaRequest(frameData, store) {
    const tableMap = {};
    const mapSources = [frameData?.lastTableIds, frameData?.lastIds, frameData?.tableCursors];
    for (const source of mapSources) {
        if (!source || typeof source !== 'object') continue;
        for (const [tableName, value] of Object.entries(source)) {
            if (typeof tableName !== 'string') continue;
            const trimmed = tableName.trim();
            if (!trimmed) continue;
            tableMap[trimmed] = value;
        }
    }
    const requested = new Set();
    const arraySources = [
        frameData?.tables,
        frameData?.tableNames,
        frameData?.requestTables,
        frameData?.includeTables,
        frameData?.tablesRequested
    ];
    for (const source of arraySources) {
        if (!Array.isArray(source)) continue;
        for (const value of source) {
            if (typeof value !== 'string') continue;
            const trimmed = value.trim();
            if (trimmed) requested.add(trimmed);
        }
    }
    Object.keys(tableMap).forEach((name) => requested.add(name));
    const availableTables = Array.isArray(store?.tables) ? store.tables : [];
    let tableNames = Array.from(requested).filter((name) => availableTables.includes(name));
    if (!tableNames.length) {
        tableNames = availableTables.slice();
    }
    const normalizedClientCursorMap = {};
    for (const [table, value] of Object.entries(tableMap)) {
        const normalized = normalizeCursorInput(value).object;
        if (normalized) {
            normalizedClientCursorMap[table] = normalized;
        }
    }
    return { tableNames, tableMap, normalizedClientCursorMap };
}

export function findRecordUsingValue(store, tableName, value) {
    if (!store || !tableName) return null;
    let lookup = value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const hasCursorFields = ['key', 'id', 'uuid', 'uid', 'primaryKey', 'primary'].some(
            (field) => value[field] !== undefined
        );
        if (!hasCursorFields) {
            const ref = store.getRecordReference(tableName, value);
            lookup = ref ? { key: ref.key, id: ref.id, uuid: ref.uuid, uid: ref.uid, primaryKey: ref.primaryKey } : value;
        }
    }
    const normalized = normalizeCursorInput(lookup);
    if (!normalized.candidates.size) return null;
    const rows = store.listTable(tableName);
    for (const row of rows) {
        const ref = store.getRecordReference(tableName, row);
        if (recordMatchesCandidates(ref, normalized.candidates)) {
            return { record: row, ref };
        }
    }
    return null;
}

export function resolveExistingRecordForConcurrency(store, tableName, record, concurrency = {}) {
    const sources = [];
    if (record && typeof record === 'object') {
        sources.push(record);
    }
    if (concurrency && typeof concurrency === 'object') {
        if (concurrency.recordRef) sources.push(concurrency.recordRef);
        if (concurrency.cursor) sources.push(concurrency.cursor);
        if (concurrency.lastKnownId) sources.push(concurrency.lastKnownId);
        if (concurrency.lastCursor) sources.push(concurrency.lastCursor);
        if (concurrency.lookup) sources.push(concurrency.lookup);
    }
    for (const source of sources) {
        const found = findRecordUsingValue(store, tableName, source);
        if (found) return found;
    }
    return null;
}

export function extractPaymentState(record) {
    const queue = [record];
    const visited = new Set();
    while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== 'object') continue;
        if (visited.has(current)) continue;
        visited.add(current);
        const direct =
            current.paymentState ||
            current.payment_state ||
            current.paymentStatus ||
            current.payment_status ||
            current.state ||
            current.payment_state_id ||
            current.paymentStateId;
        if (typeof direct === 'string' && direct.trim()) {
            return direct.trim();
        }
        const nestedKeys = ['header', 'payload', 'meta', 'metadata', 'data', 'info'];
        for (const key of nestedKeys) {
            if (current[key] && typeof current[key] === 'object') {
                queue.push(current[key]);
            }
        }
    }
    return null;
}

export function extractRecordUpdatedAt(record) {
    const queue = [record];
    const visited = new Set();
    while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== 'object') continue;
        if (visited.has(current)) continue;
        visited.add(current);
        const fields = [
            'updatedAt',
            'updated_at',
            'modifyDate',
            'modify_date',
            'savedAt',
            'saved_at',
            'timestamp',
            'ts',
            'lastUpdatedAt',
            'last_updated_at',
            'lastModifiedAt',
            'last_modified_at'
        ];
        for (const field of fields) {
            if (current[field] !== undefined && current[field] !== null) {
                const ts = resolveTimestampInput(current[field]);
                if (ts != null) return ts;
            }
        }
        const nestedKeys = ['meta', 'metadata', 'header', 'payload', 'data', 'info'];
        for (const key of nestedKeys) {
            if (current[key] && typeof current[key] === 'object') {
                queue.push(current[key]);
            }
        }
    }
    return null;
}

export function extractClientSnapshotMarker(frameData = {}) {
    const candidates = [
        frameData.snapshotMarker,
        frameData.snapshot_marker,
        frameData.dayMarker,
        frameData.day_marker,
        frameData.businessDate,
        frameData.business_date,
        frameData.businessDay,
        frameData.snapshotDay
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return null;
}

export function resolveServerSnapshotMarker(syncState, eventMeta = null) {
    if (eventMeta && typeof eventMeta.lastSnapshotMarker === 'string' && eventMeta.lastSnapshotMarker) {
        return eventMeta.lastSnapshotMarker;
    }
    if (eventMeta && typeof eventMeta.currentDay === 'string' && eventMeta.currentDay) {
        return eventMeta.currentDay;
    }
    const snapshotMeta = syncState?.moduleSnapshot?.meta;
    if (snapshotMeta && typeof snapshotMeta === 'object') {
        const snapshotCandidates = [
            snapshotMeta.snapshotMarker,
            snapshotMeta.businessDate,
            snapshotMeta.business_date,
            snapshotMeta.businessDay,
            snapshotMeta.business_day,
            snapshotMeta.currentDay,
            snapshotMeta.day
        ];
        for (const candidate of snapshotCandidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim();
            }
        }
    }
    if (syncState?.updatedAt) {
        return syncState.updatedAt.slice(0, 10);
    }
    return null;
}

export function evaluateConcurrencyGuards(store, tableName, record, concurrency, options = {}) {
    const result = { conflict: null, requiresFullSync: false, existing: null };
    if (!store || !tableName) return result;
    const effectiveConcurrency = concurrency && typeof concurrency === 'object' ? concurrency : {};
    const { serverMarker = null, clientMarker = null } = options;

    const existingInfo = resolveExistingRecordForConcurrency(store, tableName, record, effectiveConcurrency);
    if (existingInfo) {
        result.existing = existingInfo.record;
    }

    const requireExisting = effectiveConcurrency.requireExisting === true || effectiveConcurrency.disallowCreate === true;
    if (!existingInfo && requireExisting) {
        result.conflict = { code: 'record-not-found', message: 'Existing record required but not found.' };
        result.requiresFullSync = true;
        return result;
    }

    if (effectiveConcurrency.requireSnapshotMarker) {
        const expected = String(effectiveConcurrency.requireSnapshotMarker).trim();
        if (expected && serverMarker && expected !== serverMarker) {
            result.conflict = { code: 'snapshot-mismatch', expected, actual: serverMarker };
            result.requiresFullSync = true;
            return result;
        }
    }

    if (
        effectiveConcurrency.enforceSnapshot === true &&
        clientMarker &&
        serverMarker &&
        clientMarker !== serverMarker
    ) {
        result.conflict = { code: 'snapshot-mismatch', expected: clientMarker, actual: serverMarker };
        result.requiresFullSync = true;
        return result;
    }

    if (!existingInfo) {
        return result;
    }

    const currentPaymentState = extractPaymentState(existingInfo.record);
    const expectedPaymentState = effectiveConcurrency.expectedPaymentState || effectiveConcurrency.expectedProperties?.paymentState;
    if (expectedPaymentState && currentPaymentState !== expectedPaymentState) {
        result.conflict = { code: 'state-mismatch', message: 'Payment state mismatch detected.' };
        return result;
    }

    const currentUpdatedAt = extractRecordUpdatedAt(existingInfo.record);
    const expectedUpdatedAt = resolveTimestampInput(
        effectiveConcurrency.lastUpdatedAt || effectiveConcurrency.expectedProperties?.updatedAt
    );
    if (expectedUpdatedAt && currentUpdatedAt && currentUpdatedAt > expectedUpdatedAt) {
        result.conflict = { code: 'stale-update', message: 'Record has been modified since last read.' };
        return result;
    }

    return result;
}

export function isVersionConflict(error) {
    return error instanceof VersionConflictError || (error && error.code === 'VERSION_CONFLICT');
}

export function versionConflictDetails(error) {
    return {
        table: error?.table || null,
        key: error?.key || null,
        expectedVersion: error?.expectedVersion ?? null,
        currentVersion: error?.currentVersion ?? null
    };
}

export function parseCookies(header) {
    if (typeof header !== 'string' || !header.trim()) return {};
    const entries = header.split(';');
    const cookies = {};
    for (const rawEntry of entries) {
        const entry = rawEntry.trim();
        if (!entry) continue;
        const idx = entry.indexOf('=');
        if (idx <= 0) continue;
        const name = entry.slice(0, idx).trim();
        if (!name) continue;
        const rawValue = entry.slice(idx + 1).trim();
        cookies[name] = safeDecode(rawValue);
    }
    return cookies;
}

export function resolveWorkspacePath(requestedPath) {
    if (typeof requestedPath !== 'string') {
        return null;
    }
    const trimmedPath = requestedPath.trim();
    if (!trimmedPath) {
        return null;
    }
    const absolutePath = path.resolve(ROOT_DIR, trimmedPath);
    const workspaceRootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : `${ROOT_DIR}${path.sep}`;
    if (absolutePath !== ROOT_DIR && !absolutePath.startsWith(workspaceRootWithSep)) {
        return null;
    }
    const relativePath = path.relative(ROOT_DIR, absolutePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return null;
    }
    return { absolutePath, relativePath };
}
