import { appendFile, readFile, writeFile, mkdir, rename, readdir, unlink, stat } from 'fs/promises';
import path from 'path';

import logger from './logger.js';
import { createId, nowIso, deepClone, mergeDeep } from './utils.js';

const EVENT_LOG_BASENAME = 'events.log';
const EVENT_META_BASENAME = 'events.meta.json';
const EVENT_REJECTION_BASENAME = 'events.rejected.log';

function normalizeContext(options = {}) {
  if (!options || !options.liveDir) {
    const stack = new Error().stack;
    throw new Error(
      `Event store context requires liveDir!\n` +
      `Received options: ${JSON.stringify(options, null, 2)}\n` +
      `options.liveDir = "${options?.liveDir}" (type: ${typeof options?.liveDir})\n` +
      `options.branchId = "${options?.branchId}"\n` +
      `options.moduleId = "${options?.moduleId}"\n` +
      `options.historyDir = "${options?.historyDir}"\n` +
      `\nCall stack:\n${stack}`
    );
  }
  const context = {
    branchId: options.branchId || 'default',
    moduleId: options.moduleId || 'default',
    liveDir: options.liveDir,
    historyDir: options.historyDir || path.join(options.liveDir, '..', 'history', 'events')
  };
  context.logPath = options.logPath || path.join(context.liveDir, EVENT_LOG_BASENAME);
  context.metaPath = options.metaPath || path.join(context.liveDir, EVENT_META_BASENAME);
  context.rejectionLogPath = options.rejectionLogPath || path.join(context.liveDir, EVENT_REJECTION_BASENAME);
  context.historyDir = context.historyDir || path.join(context.liveDir, 'history');
  return context;
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function defaultMeta(context) {
  const now = nowIso();
  const day = now.slice(0, 10);
  return {
    branchId: context.branchId,
    moduleId: context.moduleId,
    liveCreatedAt: now,
    currentDay: day,
    lastClosedDate: null,
    lastEventId: null,
    lastEventAt: null,
    lastAckId: null,
    totalEvents: 0,
    updatedAt: now,
    tableCursors: {},
    lastServedTableIds: {},
    lastClientTableIds: {},
    lastSnapshotMarker: null,
    lastClientSnapshotMarker: null,
    lastClientSyncAt: null
  };
}

function toCursorRecord(value) {
  if (!value || typeof value !== 'object') return {};
  const cursor = {};
  if (value.key != null) cursor.key = String(value.key);
  if (value.id != null) cursor.id = String(value.id);
  if (value.uuid != null) cursor.uuid = String(value.uuid);
  if (value.uid != null) cursor.uid = String(value.uid);
  return cursor;
}

function resolveLineCursor(line) {
  if (!line || typeof line !== 'object') return null;
  if (line.meta && typeof line.meta === 'object' && line.meta.recordRef) {
    const cursor = toCursorRecord(line.meta.recordRef);
    if (Object.keys(cursor).length) {
      return cursor;
    }
  }
  const record = line.record && typeof line.record === 'object' ? line.record : null;
  if (!record) return null;
  const direct = toCursorRecord(record);
  if (Object.keys(direct).length) {
    return direct;
  }
  if (record.primaryKey && typeof record.primaryKey === 'object') {
    const primaryCursor = toCursorRecord(record.primaryKey);
    if (Object.keys(primaryCursor).length) {
      return primaryCursor;
    }
  }
  if (record.primary && typeof record.primary === 'object') {
    const primaryCursor = toCursorRecord(record.primary);
    if (Object.keys(primaryCursor).length) {
      return primaryCursor;
    }
  }
  if (record.key != null) {
    return { key: String(record.key) };
  }
  return null;
}

async function loadMeta(context) {
  try {
    const raw = await readFile(context.metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    const base = defaultMeta(context);
    return mergeDeep(base, parsed);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      // File doesn't exist - create new meta
      const meta = defaultMeta(context);
      await writeMeta(context, meta);
      return meta;
    }

    // Handle corrupted JSON files
    if (error?.name === 'SyntaxError' || error?.message?.includes('JSON')) {
      console.error('[eventStore][loadMeta] CORRUPTED FILE DETECTED - Attempting recovery');
      console.error('[eventStore][loadMeta] Error:', error.message);
      console.error('[eventStore][loadMeta] File path:', context.metaPath);

      try {
        const raw = await readFile(context.metaPath, 'utf8');

        // Back up the corrupted file for debugging
        const backupPath = `${context.metaPath}.corrupted.${Date.now()}.bak`;
        await writeFile(backupPath, raw, 'utf8');
        console.error('[eventStore][loadMeta] Corrupted file backed up to:', backupPath);
        console.error('[eventStore][loadMeta] File size:', raw.length, 'bytes');

        // Try to recover by parsing the event log instead
        console.error('[eventStore][loadMeta] Attempting to rebuild meta from event log...');
        const events = await readEventLog(context);

        const meta = defaultMeta(context);
        if (events.length > 0) {
          const lastEvent = events[events.length - 1];
          meta.lastEventId = lastEvent.id;
          meta.lastEventAt = lastEvent.createdAt || lastEvent.recordedAt;
          meta.totalEvents = events.length;
          meta.branchId = lastEvent.branchId || context.branchId;
          meta.moduleId = lastEvent.moduleId || context.moduleId;

          // Rebuild table cursors
          meta.tableCursors = {};
          for (const evt of events) {
            if (evt.table) {
              const cursor = resolveLineCursor(evt);
              if (cursor) {
                meta.tableCursors[evt.table] = {
                  ...cursor,
                  eventId: evt.id,
                  sequence: evt.sequence,
                  updatedAt: evt.recordedAt
                };
              }
            }
          }
          console.error('[eventStore][loadMeta] Recovered meta from', events.length, 'events');
        }

        // Write the recovered meta
        await writeMeta(context, meta);
        console.error('[eventStore][loadMeta] Meta file rebuilt successfully');
        return meta;
      } catch (recoveryErr) {
        console.error('[eventStore][loadMeta] Recovery failed:', recoveryErr.message);
        throw error; // Throw original error
      }
    }

    // Unknown error - rethrow
    throw error;
  }
}

async function writeMeta(context, meta) {
  await ensureDir(path.dirname(context.metaPath));

  // Use atomic write pattern: write to temp file, then rename
  // This prevents corruption from concurrent writes
  const tempPath = `${context.metaPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const content = JSON.stringify(meta, null, 2);

  try {
    await writeFile(tempPath, content, 'utf8');
    // Rename is atomic on most filesystems
    await rename(tempPath, context.metaPath);
  } catch (error) {
    // Clean up temp file if rename failed
    try {
      await unlink(tempPath);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

function normalizePublishState(source, originBranchId, timestamp) {
  const publishState = {};
  if (source && typeof source === 'object') {
    for (const [branchId, value] of Object.entries(source)) {
      if (!branchId) continue;
      if (value && typeof value === 'object') {
        const entry = {
          status: typeof value.status === 'string' ? value.status : 'pending',
          updatedAt: value.updatedAt || timestamp,
          attempts: Number.isFinite(value.attempts) ? value.attempts : 0
        };
        if (value.publishedAt) entry.publishedAt = value.publishedAt;
        publishState[branchId] = entry;
      } else if (typeof value === 'string') {
        publishState[branchId] = { status: value, updatedAt: timestamp, attempts: 0 };
      }
    }
  }
  const own = publishState[originBranchId] || {};
  const nextOwn = {
    status: own.status || 'published',
    updatedAt: timestamp,
    attempts: Number.isFinite(own.attempts) ? own.attempts : 0
  };
  if (nextOwn.status === 'published' && !nextOwn.publishedAt) {
    nextOwn.publishedAt = timestamp;
  }
  publishState[originBranchId] = nextOwn;
  return publishState;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function getEventStoreContext(options) {
  return normalizeContext(options);
}

export async function appendEvent(options, entry) {
  const context = normalizeContext(options);
  await ensureDir(context.liveDir);
  const meta = await loadMeta(context);
  const now = nowIso();
  const id = entry?.id || createId('evt');
  const createdAt = entry?.createdAt || now;
  const action = entry?.action || 'module:insert';
  const table = entry?.table || null;
  const record = entry?.record ? deepClone(entry.record) : null;
  const metaPayload = entry?.meta ? deepClone(entry.meta) : {};
  const branchId = entry?.branchId || context.branchId;
  const moduleId = entry?.moduleId || context.moduleId;
  const publishState = normalizePublishState(entry?.publishState, branchId, now);
  const sequence = Number(meta.totalEvents || 0) + 1;
  const line = {
    id,
    sequence,
    action,
    branchId,
    moduleId,
    table,
    record,
    meta: metaPayload,
    publishState,
    createdAt,
    recordedAt: now
  };
  await appendFile(context.logPath, `${JSON.stringify(line)}\n`, 'utf8');
  const nextMeta = {
    ...meta,
    branchId,
    moduleId,
    lastEventId: id,
    lastEventAt: createdAt,
    totalEvents: sequence,
    updatedAt: now
  };
  if (!meta.liveCreatedAt) {
    nextMeta.liveCreatedAt = now;
  }
  if (!meta.currentDay) {
    nextMeta.currentDay = now.slice(0, 10);
  }
  if (!nextMeta.tableCursors || typeof nextMeta.tableCursors !== 'object') {
    nextMeta.tableCursors = {};
  }
  const cursor = table ? resolveLineCursor(line) : null;
  if (table && cursor) {
    nextMeta.tableCursors = { ...nextMeta.tableCursors, [table]: { ...cursor, eventId: id, sequence, updatedAt: now } };
  }
  await writeMeta(context, nextMeta);
  return line;
}

export async function readEventLog(options) {
  const context = normalizeContext(options);
  try {
    const raw = await readFile(context.logPath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId }, 'Failed to parse event log line');
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadEventMeta(options) {
  const context = normalizeContext(options);
  return loadMeta(context);
}

export async function updateEventMeta(options, patch) {
  const context = normalizeContext(options);
  const meta = await loadMeta(context);
  const next = mergeDeep(meta, patch || {});
  next.updatedAt = nowIso();
  await writeMeta(context, next);
  return next;
}

export async function logRejectedMutation(options, details = {}) {
  const context = normalizeContext(options);
  await ensureDir(context.liveDir);
  const now = nowIso();
  const entry = {
    id: details.id || createId('rej'),
    branchId: details.branchId || context.branchId,
    moduleId: details.moduleId || context.moduleId,
    reason: details.reason || 'rejected-mutation',
    createdAt: details.createdAt || now,
    recordedAt: now,
    source: details.source || null,
    mutationId: details.mutationId || null,
    transId: details.transId || null,
    table: details.table || null,
    meta: details.meta ? deepClone(details.meta) : {},
    payload: details.payload ? deepClone(details.payload) : null
  };
  await appendFile(context.rejectionLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

export async function rotateEventLog(options) {
  const context = normalizeContext(options);
  await ensureDir(context.liveDir);
  const meta = await loadMeta(context);
  const today = new Date().toISOString().slice(0, 10);
  if (meta.currentDay === today) {
    return { rotated: false, meta };
  }
  await ensureDir(context.historyDir);
  const previousDay = meta.currentDay || today;
  const now = nowIso();
  let archivePath = null;
  if (await fileExists(context.logPath)) {
    try {
      const suffix = (meta.lastEventAt || now).replace(/[:.]/g, '-');
      const archiveName = `${previousDay}-${suffix}.log`;
      archivePath = path.join(context.historyDir, archiveName);
      await rename(context.logPath, archivePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      archivePath = null;
    }
  }
  const nextMeta = {
    ...meta,
    lastClosedDate: previousDay,
    currentDay: today,
    liveCreatedAt: now,
    lastEventId: null,
    lastEventAt: null,
    lastAckId: null,
    totalEvents: 0,
    updatedAt: now
  };
  await writeMeta(context, nextMeta);
  return { rotated: Boolean(archivePath), archivePath, meta: nextMeta };
}

export async function listArchivedLogs(options) {
  const context = normalizeContext(options);
  await ensureDir(context.historyDir);
  const entries = await readdir(context.historyDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
    .map((entry) => path.join(context.historyDir, entry.name))
    .sort();
}

export async function readLogFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          logger.warn({ err: error, filePath }, 'Failed to parse archived event line');
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function discardLogFile(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
