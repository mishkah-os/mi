(function (global) {
  'use strict';

  if (!global) return;

  const root = global.Mishkah = global.Mishkah || {};
  const utils = root.utils || {};
  const IndexedDBX = utils.IndexedDBX || null;
  const hasIndexedDB = typeof global.indexedDB !== 'undefined' && global.indexedDB !== null && !!IndexedDBX;
  const hasStructuredClone = typeof global.structuredClone === 'function';
  const memoryStores = new Map();

  const toObject = (value) => {
    if (value && typeof value === 'object') return value;
    return {};
  };

  const firstDefined = (...values) => {
    for (const value of values) {
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const parseTimestamp = (value) => {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) {
      const ts = value.getTime();
      return Number.isFinite(ts) ? ts : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 1e12) return Math.round(value);
      if (value > 1e9) return Math.round(value * 1000);
      if (value < 1e3 && value > -1e3) return Math.round(value * 1000);
      return Math.round(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) return parseTimestamp(numeric);
      }
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return null;
  };

  const cloneValue = (value) => {
    if (value === null || value === undefined) return value;
    if (hasStructuredClone) {
      try { return global.structuredClone(value); } catch (_err) { }
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_err) { }
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach((key) => { out[key] = cloneValue(value[key]); });
      return out;
    }
    return value;
  };

  const normalizeMetadata = (raw, previous = {}) => {
    const base = { ...previous };
    const pick = (...paths) => {
      for (const path of paths) {
        if (path === undefined) continue;
        return path;
      }
      return undefined;
    };
    const lastIdCandidate = pick(
      firstDefined(raw?.lastId, raw?.last_id),
      firstDefined(raw?.cursorId, raw?.cursor_id),
      firstDefined(raw?.lastEventId, raw?.last_event_id),
      firstDefined(raw?.cursor?.id, raw?.cursor?.lastId, raw?.cursor?.last_id),
      firstDefined(raw?.meta?.lastId, raw?.meta?.last_id),
      firstDefined(raw?.metadata?.lastId, raw?.metadata?.last_id)
    );
    if (lastIdCandidate !== undefined) {
      base.lastId = lastIdCandidate === null ? null : String(lastIdCandidate);
    }
    const lastSyncCandidate = pick(
      firstDefined(raw?.lastSyncAt, raw?.last_sync_at, raw?.lastSyncedAt, raw?.last_synced_at),
      firstDefined(raw?.syncedAt, raw?.synced_at),
      firstDefined(raw?.updatedAt, raw?.updated_at),
      firstDefined(raw?.ts, raw?.timestamp),
      firstDefined(raw?.cursor?.syncedAt, raw?.cursor?.synced_at, raw?.cursor?.updatedAt, raw?.cursor?.updated_at),
      firstDefined(raw?.meta?.lastSyncAt, raw?.meta?.last_sync_at, raw?.meta?.updatedAt, raw?.meta?.updated_at),
      firstDefined(raw?.metadata?.lastSyncAt, raw?.metadata?.last_sync_at, raw?.metadata?.updatedAt, raw?.metadata?.updated_at)
    );
    if (lastSyncCandidate !== undefined) {
      const parsed = parseTimestamp(lastSyncCandidate);
      if (parsed !== null) base.lastSyncAt = parsed;
    }
    const schemaCandidate = pick(
      firstDefined(raw?.schemaVersion, raw?.schema_version, raw?.snapshotVersion),
      firstDefined(raw?.version),
      firstDefined(raw?.meta?.schemaVersion, raw?.meta?.schema_version, raw?.meta?.version),
      firstDefined(raw?.metadata?.schemaVersion, raw?.metadata?.schema_version, raw?.metadata?.version)
    );
    if (schemaCandidate !== undefined) {
      base.schemaVersion = schemaCandidate === null ? null : String(schemaCandidate);
    }
    const requiresFullSyncCandidate = pick(
      firstDefined(raw?.requiresFullSync, raw?.requires_full_sync, raw?.fullSync, raw?.full_sync),
      firstDefined(raw?.fullReset, raw?.full_reset, raw?.requiresReset, raw?.requires_reset),
      firstDefined(raw?.meta?.requiresFullSync, raw?.meta?.requires_full_sync),
      firstDefined(raw?.metadata?.requiresFullSync, raw?.metadata?.requires_full_sync)
    );
    if (requiresFullSyncCandidate !== undefined) {
      base.requiresFullSync = !!requiresFullSyncCandidate;
    }
    const hashCandidate = pick(
      firstDefined(raw?.serverHash, raw?.checksum, raw?.hash),
      firstDefined(raw?.meta?.serverHash, raw?.meta?.hash),
      firstDefined(raw?.metadata?.serverHash, raw?.metadata?.hash)
    );
    if (hashCandidate !== undefined) {
      base.serverHash = hashCandidate === null ? null : String(hashCandidate);
    }
    const sourceCandidate = pick(
      firstDefined(raw?.source, raw?.origin),
      firstDefined(raw?.meta?.source),
      firstDefined(raw?.metadata?.source)
    );
    if (sourceCandidate !== undefined) {
      base.source = sourceCandidate === null ? null : String(sourceCandidate);
    }
    const updatedCandidate = pick(
      firstDefined(raw?.updatedAt, raw?.updated_at),
      firstDefined(raw?.meta?.updatedAt, raw?.meta?.updated_at),
      firstDefined(raw?.metadata?.updatedAt, raw?.metadata?.updated_at)
    );
    const resolvedUpdated = parseTimestamp(updatedCandidate);
    const resolvedNow = Date.now();
    base.updatedAt = resolvedUpdated !== null ? resolvedUpdated : resolvedNow;
    if (base.lastSyncAt === undefined || base.lastSyncAt === null) {
      base.lastSyncAt = base.updatedAt;
    }
    return base;
  };

  const ensureMemoryStore = (name) => {
    if (!memoryStores.has(name)) memoryStores.set(name, new Map());
    return memoryStores.get(name);
  };

  function createAdapter(options = {}) {
    const namespace = options.namespace || 'default';
    const dbName = options.name || 'mishkah-sync';
    const storeName = options.storeName || 'tables';
    const version = options.version || 1;
    const memoryStore = ensureMemoryStore(`${dbName}::${namespace}`);

    // Resolve IndexedDBX lazily
    const IndexedDBX = global.Mishkah?.utils?.IndexedDBX;
    const hasIndexedDB = typeof global.indexedDB !== 'undefined' && global.indexedDB !== null && !!IndexedDBX;

    const driver = hasIndexedDB ? new IndexedDBX({
      name: dbName,
      version,
      schema: { stores: { [storeName]: { keyPath: 'id' } } },
      autoBumpVersion: true,
      broadcast: false
    }) : null;

    const ready = driver
      ? driver.open().then(() => driver.ensureSchema()).then(() => true).catch((error) => {
        console.warn('[Mishkah][IndexedDB] Failed to open database', { name: dbName, error });
        return false;
      })
      : Promise.resolve(false);

    const toKey = (table) => `${namespace}:${table}`;

    const getRecord = async (key) => {
      await ready.catch(() => { });
      if (driver && driver.db) {
        try {
          const stored = await driver.get(storeName, key);
          return stored || null;
        } catch (error) {
          console.warn('[Mishkah][IndexedDB] Read failed', { key, error });
          return null;
        }
      }
      if (memoryStore.has(key)) return cloneValue(memoryStore.get(key));
      return null;
    };

    const putRecord = async (record) => {
      await ready.catch(() => { });
      if (driver && driver.db) {
        try {
          await driver.put(storeName, record);
        } catch (error) {
          console.warn('[Mishkah][IndexedDB] Write failed', { table: record?.table, error });
        }
      } else {
        memoryStore.set(record.id, cloneValue(record));
      }
      return record;
    };

    const removeRecord = async (key) => {
      await ready.catch(() => { });
      if (driver && driver.db) {
        try { await driver.delete(storeName, key); }
        catch (error) { console.warn('[Mishkah][IndexedDB] Delete failed', { key, error }); }
      }
      memoryStore.delete(key);
    };

    const save = async (table, data, options = {}) => {
      if (!table) throw new Error('table name is required');
      await ready.catch(() => { });
      const key = toKey(table);
      const existing = await getRecord(key);
      const previousMeta = existing?.meta || {};
      const incomingMeta = normalizeMetadata(options.metadata || {}, previousMeta);
      let requiresReset = !!options.forceReset;
      if (incomingMeta.requiresFullSync) requiresReset = true;
      if (!requiresReset && incomingMeta.schemaVersion !== undefined && previousMeta.schemaVersion !== undefined && incomingMeta.schemaVersion !== previousMeta.schemaVersion) {
        requiresReset = true;
      }
      if (requiresReset) await removeRecord(key);
      const finalMeta = options.mergeMetadata === false
        ? { ...incomingMeta, requiresFullSync: false }
        : { ...previousMeta, ...incomingMeta, requiresFullSync: false };
      if (finalMeta.lastSyncAt === undefined || finalMeta.lastSyncAt === null) {
        finalMeta.lastSyncAt = Date.now();
      }
      finalMeta.updatedAt = Date.now();
      const payload = {
        id: key,
        namespace,
        table,
        data: data === undefined ? null : cloneValue(data),
        meta: finalMeta,
        checksum: options.checksum || null,
        updatedAt: finalMeta.updatedAt
      };
      await putRecord(payload);
      return payload;
    };

    const load = async (table) => {
      const key = toKey(table);
      const record = await getRecord(key);
      if (!record) return null;
      return {
        data: cloneValue(record.data),
        meta: record.meta ? { ...record.meta } : {},
        checksum: record.checksum || null,
        updatedAt: record.updatedAt || null
      };
    };

    const updateMetadata = async (table, metadata) => {
      const record = await getRecord(toKey(table));
      const currentData = record ? record.data : null;
      return save(table, currentData, { metadata, mergeMetadata: true });
    };

    const mutate = async (table, mutator, options = {}) => {
      if (typeof mutator !== 'function') return false;
      const key = toKey(table);
      const record = await getRecord(key);
      if (!record) return false;
      const draft = cloneValue(record.data);
      const result = await mutator(draft, { meta: record.meta ? { ...record.meta } : {} });
      if (result === undefined || result === false) return false;
      await save(table, result, {
        metadata: options.metadata || record.meta || {},
        mergeMetadata: options.mergeMetadata !== false,
        forceReset: !!options.forceReset,
        checksum: options.checksum || record.checksum || null
      });
      return true;
    };

    const clear = async (table) => {
      await removeRecord(toKey(table));
      return true;
    };

    const purge = async (tables, options = {}) => {
      const list = Array.isArray(tables) ? tables : [tables];
      await Promise.all(list.map((table) => mutate(table, (current) => {
        if (options.resetValue !== undefined) return options.resetValue;
        if (Array.isArray(current)) return [];
        if (current && typeof current === 'object') return {};
        return null;
      }, {
        metadata: { ...(options.metadata || {}), source: options.source || 'purge', updatedAt: Date.now() },
        mergeMetadata: true
      })));
      return true;
    };

    return {
      ready,
      load,
      save,
      updateMetadata,
      mutate,
      clear,
      purge,
      keys: async () => {
        await ready.catch(() => { });
        let rawKeys = [];
        if (driver && driver.db) {
          try { rawKeys = await driver.getAllKeys(storeName); }
          catch (error) { console.warn('[Mishkah][IndexedDB] Keys failed', { error }); }
        } else {
          rawKeys = Array.from(memoryStore.keys());
        }
        const prefix = namespace + ':';
        return rawKeys.filter(k => typeof k === 'string' && k.startsWith(prefix)).map(k => k.slice(prefix.length));
      },
      getMetadata: async (table) => {
        const record = await getRecord(toKey(table));
        return record && record.meta ? { ...record.meta } : null;
      },
      destroy: async () => {
        if (driver) {
          try { await driver.destroy(); } catch (error) { console.warn('[Mishkah][IndexedDB] Destroy failed', error); }
        }
        memoryStore.clear();
        return true;
      }
    };
  }

  const api = {
    createAdapter,
    parseTimestamp,
    normalizeMetadata
  };

  global.MishkahIndexedDB = Object.assign({}, global.MishkahIndexedDB || {}, api);

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global));
