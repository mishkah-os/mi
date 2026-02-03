/**
 * Mishkah Realtime Simple DSL
 *
 * Tiny layer on top of mishkah.store.js for ultra-minimal usage.
 * Example:
* let createDB = window.createDB;
 *   const db = createDB({
 *     branchId: 'lab:test-pad',
 *     moduleId: 'scratchpad',
 *     objects: {
 *       notes: {
 *         table: 'scratchpad_entry',
 *         toRecord: (value, ctx) => ctx.ensure({
 *           id: ctx.uuid('note'),
 *           clientUuid: ctx.uuid('client'),
 *           note: typeof value === 'string' ? value : value?.note,
 *           payload: {
 *             note: typeof value === 'string' ? value : value?.note,
 *             source: value?.source || 'dsl',
 *             createdAt: ctx.now()
 *           },
 *           createdAt: ctx.now(),
 *           serverAt: ctx.now()
 *         }),
 *         fromRecord: (record) => ({
 *           id: record.id,
 *           note: record.note,
 *           payload: record.payload,
 *           createdAt: record.createdAt,
 *           serverAt: record.serverAt,
 *           clientUuid: record.clientUuid
 *         })
 *       }
 *     }
 *   });
 *   await db.connect();
 *   await db.store('notes', 'hello world');
 *   db.watch('notes', (list) => console.log(list));
 */

(function (window) {

  let createStore = window.createStore;
  const noop = () => { };
  const nowIso = () => new Date().toISOString();
  const enqueueMicrotask =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (fn) => Promise.resolve().then(fn);

  function clone(value) {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (_err) {
        /* fall through */
      }
    }
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeDefinition(name, def, baseContext) {
    const normalized = {
      name,
      table: def?.table || name,
      moduleId: def?.moduleId || baseContext.moduleId,
      idPrefix: def?.idPrefix || def?.prefix || 'rec',
      defaults: clone(def?.defaults) || {},
      meta: def?.meta || {}
    };

    normalized.fromRecord =
      typeof def?.fromRecord === 'function'
        ? def.fromRecord
        : (record) => clone(record);

    normalized.toRecord =
      typeof def?.toRecord === 'function'
        ? def.toRecord
        : (value, ctx) => {
          let record;
          if (value == null) {
            record = {};
          } else if (typeof value === 'object' && !Array.isArray(value)) {
            record = { ...value };
          } else {
            record = { value };
          }
          if (!record.id) record.id = ctx.uuid(normalized.idPrefix);
          if (!record.branchId) record.branchId = ctx.branchId;
          if (!record.createdAt) record.createdAt = ctx.now();
          if (!record.serverAt) record.serverAt = ctx.now();
          return ctx.ensure(record);
        };

    normalized.ensure =
      typeof def?.ensure === 'function'
        ? def.ensure
        : (record) => Object.assign({}, normalized.defaults, record);

    return normalized;
  }

  function createContext(store, config) {
    return {
      branchId: config.branchId,
      moduleId: config.moduleId,
      now: nowIso,
      uuid: (prefix = 'rec') => store.uuid(prefix),
      ensure: (record) => {
        const base = { branchId: config.branchId };
        return { ...base, ...record };
      }
    };
  }

  function createDB(options = {}) {
    const config = {
      branchId: options.branchId || 'lab:test-pad',
      moduleId: options.moduleId || 'pos',
      role: options.role || 'ws2-simple',
      historyLimit: Number.isFinite(options.historyLimit) ? options.historyLimit : 50,
      autoConnect: options.autoConnect !== false,
      logger: options.logger || console,
      lang: options.lang || null,
      // Smart REST bootstrap: disable when the host app performs its own REST seeding
      // Smart REST bootstrap: disable when the host app performs its own REST seeding
      smartFetch: options.smartFetch !== false,
      bootstrapData: options.bootstrapData || null
    };

    const store = createStore({
      branchId: config.branchId,
      moduleId: config.moduleId,
      role: config.role,
      historyLimit: config.historyLimit,
      lang: config.lang,
      autoReconnect: options.autoReconnect !== false,
      logger: config.logger,
      wsUrl: options.wsUrl,
      wsPath: options.wsPath,
      // ✨ IndexedDB support (pass through)
      useIndexedDB: options.useIndexedDB !== false,
      dbVersion: options.dbVersion || 1
    });

    const baseCtx = createContext(store, config);
    const definitions = new Map();
    const tableIndex = new Map();
    const watchers = new Map();
    const statusWatchers = new Set();
    const cache = new Map();

    // Smart Store: REST API fetching state
    let initialFetchTriggered = false;
    let initialFetchInProgress = false;
    let fetchPromise = null;
    const restApiCache = new Map(); // Temporary cache for REST API data

    function indexDefinition(def) {
      const key = `${def.moduleId}::${def.table}`;
      if (!tableIndex.has(key)) {
        tableIndex.set(key, new Set());
      }
      tableIndex.get(key).add(def.name);
    }

    // Smart Store: Fetch initial data from REST API
    const fetchInitialSnapshot = async () => {
      if (fetchPromise) {
        return fetchPromise;
      }

      // OPTIMIZATION: Use bootstrap data if provided to avoid redundant fetch
      if (config.bootstrapData && typeof config.bootstrapData === 'object' && Object.keys(config.bootstrapData).length > 0) {
        config.logger?.info?.('[MishkahSimpleDB] Using bootstrap data, skipping fetch');
        for (const [tableName, rows] of Object.entries(config.bootstrapData)) {
          const dataRows = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : []);
          restApiCache.set(tableName, dataRows);
        }
        // Emit initial data immediately
        initialFetchTriggered = true;
        // We need to ensure we return a resolved promise
        fetchPromise = Promise.resolve(config.bootstrapData);

        // Emit after a microtask to ensure watchers are set up if called synchronously
        enqueueMicrotask(() => emitAll());

        return fetchPromise;
      }

      initialFetchTriggered = true;
      initialFetchInProgress = true;

      fetchPromise = (async function () {
        try {
          // ✅ Include lang parameter for Auto-Flattening translation support
          let apiUrl = window.location.origin.replace(/\/+$/, '') + `/api/branches/${encodeURIComponent(config.branchId)}/modules/${encodeURIComponent(config.moduleId)}`;
          if (config.lang) {
            apiUrl += `?lang=${encodeURIComponent(config.lang)}`;
          }
          const response = await fetch(apiUrl, { cache: 'no-store' });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const snapshot = await response.json();
          const fetchedTables = snapshot.tables || {};

          for (const [tableName, rows] of Object.entries(fetchedTables)) {
            const dataRows = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : []);
            restApiCache.set(tableName, dataRows);
          }

          let emitCount = 0;
          for (const [name, def] of definitions.entries()) {
            if (restApiCache.has(def.table)) {
              const rows = restApiCache.get(def.table) || [];
              const plain = rows.map((row) => def.fromRecord(row, baseCtx));
              cache.set(name, plain);
              emit(name);
              emitCount++;
            }
          }

          return snapshot;
        } catch (error) {
          config.logger?.warn?.(`[MishkahSimpleDB] Smart fetch failed:`, error.message);
          throw error;
        } finally {
          initialFetchInProgress = false;
          fetchPromise = null;
        }
      })();
      return fetchPromise;
    };
    let api = null;

    function register(name, defOptions = {}) {
      const normalized = normalizeDefinition(name, defOptions, config);
      definitions.set(name, normalized);
      indexDefinition(normalized);
      if (!watchers.has(name)) watchers.set(name, new Set());
      cache.set(name, []);
      emit(name);
      return api;
    }

    function emit(name) {
      const def = definitions.get(name);
      if (!def) return;

      // Priority: WebSocket > Smart Fetch cache > REST API cache > empty
      const tables = store.tables(def.moduleId);
      const wsRows = Array.isArray(tables?.[def.table]) ? tables[def.table] : [];

      let plain;
      let source = '';

      if (wsRows.length > 0) {
        // WebSocket has data - use it (highest priority)
        plain = wsRows.map((row) => def.fromRecord(row, baseCtx));
        cache.set(name, plain);
        source = 'WebSocket';
      } else if (cache.has(name) && cache.get(name).length > 0) {
        // WebSocket empty but cache has data from Smart Fetch - use it
        plain = cache.get(name);
        source = 'Smart Fetch cache';
      } else if (restApiCache.has(def.table)) {
        // Fallback to REST API cache (shouldn't happen if Smart Fetch worked)
        const apiRows = restApiCache.get(def.table) || [];
        plain = apiRows.map((row) => def.fromRecord(row, baseCtx));
        cache.set(name, plain);
        source = 'REST API cache';
      } else {
        // No data anywhere
        plain = [];
        cache.set(name, plain);
        source = 'empty';
      }

      const subs = watchers.get(name);
      if (!subs || !subs.size) return;
      for (const handler of Array.from(subs)) {
        try {
          handler(clone(plain), { rows: clone(plain), table: def.table });
        } catch (error) {
          config.logger?.warn?.('[MishkahSimpleDB] watcher failed', error);
        }
      }
    }

    function emitAll() {
      for (const name of definitions.keys()) {
        emit(name);
      }
    }

    function emitStatus(status) {
      for (const handler of Array.from(statusWatchers)) {
        try {
          handler(status);
        } catch (error) {
          config.logger?.warn?.('[MishkahSimpleDB] status listener failed', error);
        }
      }
    }

    if (options.objects && typeof options.objects === 'object') {
      for (const [name, def] of Object.entries(options.objects)) {
        register(name, def);
      }
    }

    store.on('snapshot', () => {
      emitAll();
    });

    store.on('event', (payload) => {
      if (!payload) return;
      const key = `${payload.moduleId || config.moduleId}::${payload.table}`;
      const targets = tableIndex.get(key);
      if (!targets) return;
      for (const name of targets) {
        emit(name);
      }
    });

    store.on('status', (payload) => {
      emitStatus(payload?.status || 'idle');
    });

    api = {
      config,
      store,
      register,
      // Expose registered definitions for introspection
      getRegisteredNames() {
        return Array.from(definitions.keys());
      },
      getDefinition(name) {
        return definitions.get(name);
      },
      async connect() {
        await store.connect();
        return store.ready();
      },
      disconnect() {
        store.disconnect();
      },
      ready() {
        return store.ready();
      },
      status(handler) {
        if (typeof handler !== 'function') return noop;
        statusWatchers.add(handler);
        return () => statusWatchers.delete(handler);
      },
      watch(name, handler, { immediate = true } = {}) {
        if (typeof handler !== 'function') return noop;
        if (!definitions.has(name)) {
          register(name);
        }

        // Smart Store: Trigger fetch on first watch() call
        if (config.smartFetch && !initialFetchTriggered) {
          fetchInitialSnapshot(); // Background fetch
        }

        const set = watchers.get(name) || new Set();
        set.add(handler);
        watchers.set(name, set);
        if (immediate) {
          const current = cache.get(name) || [];
          handler(clone(current), { table: definitions.get(name)?.table || name });
        }
        return () => {
          const target = watchers.get(name);
          if (!target) return;
          target.delete(handler);
          if (!target.size) watchers.delete(name);
        };
      },
      list(name) {
        return clone(cache.get(name) || []);
      },
      async insert(name, value, meta = {}) {
        if (!definitions.has(name)) {
          register(name);
        }
        const def = definitions.get(name);
        const ensureRecord = (record) => {
          const withBranch = baseCtx.ensure(record);
          return def.ensure(withBranch, baseCtx);
        };
        const ctx = {
          ...baseCtx,
          ensure: ensureRecord
        };
        const record = def.toRecord(value, ctx);
        const enriched = ensureRecord(record);
        return store.insert(def.table, enriched, meta);
      },
      async update(name, value, meta = {}) {
        if (!definitions.has(name)) register(name);
        const def = definitions.get(name);
        const ensureRecord = (record) => {
          const withBranch = baseCtx.ensure(record);
          return def.ensure(withBranch, baseCtx);
        };
        const ctx = {
          ...baseCtx,
          ensure: ensureRecord
        };
        const record = def.toRecord(value, ctx);
        const enriched = ensureRecord(record);
        return store.merge(def.table, enriched, meta);
      },
      async delete(name, recordRef, meta = {}) {
        if (!definitions.has(name)) register(name);
        const def = definitions.get(name);
        return store.remove(def.table, recordRef, meta);
      },
      // ✨ Smart Save (Upsert) Support
      async save(name, value, meta = {}) {
        if (!definitions.has(name)) register(name);
        const def = definitions.get(name);

        const ensureRecord = (record) => {
          const withBranch = baseCtx.ensure(record);
          return def.ensure(withBranch, baseCtx);
        };
        const ctx = { ...baseCtx, ensure: ensureRecord };
        const record = def.toRecord(value, ctx);
        const enriched = ensureRecord(record);

        // If no ID, it's definitely an insert
        if (!enriched.id) {
          enriched.id = store.uuid(def.idPrefix || 'rec');
          return store.insert(def.table, enriched, meta);
        }

        // Check local cache for existence
        // Note: This is optimistic based on what we have loaded.
        // For 100% server-side truth, we rely on the server's UPSERT capability path
        // currently mapped to the general /save endpoint or logic.
        const currentList = cache.get(name) || [];
        const exists = currentList.some(r => r.id === enriched.id);

        if (exists) {
          return store.merge(def.table, enriched, meta);
        } else {
          // It might still exist on server but not loaded, but 'insert' usually fails if PK exists
          // OR we can use the 'save' endpoint if the underlying store supports it directly.
          // For now, we try insert, if it fails due to conflict, we merge?
          // Actually, standard Mishkah 'store.save' (if exists) maps to PUT /save aka Upsert.
          if (store.save) {
            return store.save(def.table, enriched, meta);
          }
          // Fallback if no direct save on lower layer: optimistic insert
          return store.insert(def.table, enriched, meta);
        }
      },
      async read(tableName, id, moduleId) {
        return store.read(tableName, id, moduleId);
      },
      async query(tableName, filter, moduleId) {
        return store.query(tableName, filter, moduleId);
      }
    };

    if (config.autoConnect) {
      enqueueMicrotask(() => {
        api.connect().catch((error) => {
          config.logger?.error?.('[MishkahSimpleDB] auto connect failed', error);
        });
      });
    }

    return api;
  }

  function normalizeSchemaTables(schema) {
    if (!schema || typeof schema !== 'object') return [];
    if (Array.isArray(schema.tables) && schema.tables.length) return schema.tables;
    if (schema.schema && Array.isArray(schema.schema.tables)) return schema.schema.tables;
    return [];
  }

  function buildTableIndex(tables = []) {
    const index = new Map();
    for (const table of tables) {
      if (!table || typeof table !== 'object') continue;
      const names = new Set();
      if (table.name) names.add(String(table.name));
      if (table.tableName) names.add(String(table.tableName));
      if (table.sqlName) names.add(String(table.sqlName));
      if (table.id) names.add(String(table.id));
      for (const key of names) {
        if (!index.has(key)) index.set(key, table);
      }
    }
    return index;
  }

  function normalizeAutoEntry(entry) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      return name ? { name, table: name } : null;
    }
    if (entry && typeof entry === 'object') {
      const name =
        entry.name ||
        entry.object ||
        entry.alias ||
        entry.key ||
        entry.table ||
        entry.sqlName ||
        entry.tableName ||
        null;
      if (!name) return null;
      const table =
        entry.table ||
        entry.tableName ||
        entry.sqlName ||
        entry.name ||
        entry.object ||
        name;
      return { name: String(name), table: String(table) };
    }
    return null;
  }

  function createDBAuto(schema, entries = [], options = {}) {
    const tables = normalizeSchemaTables(schema);
    const index = buildTableIndex(tables);
    const selection =
      Array.isArray(entries) && entries.length
        ? entries
        : tables.map((table) => table && table.name).filter(Boolean);

    const objects = { ...(options.objects || {}) };
    for (const raw of selection) {
      const info = normalizeAutoEntry(raw);
      if (!info) continue;
      if (objects[info.name]) continue;
      let tableEntry = index.get(info.table);
      if (!tableEntry && index.has(info.name)) {
        tableEntry = index.get(info.name);
      }
      if (!tableEntry) {
        throw new Error(`[createDBAuto] Table "${info.table}" not found in schema.`);
      }
      const resolvedTableName = tableEntry.name || tableEntry.tableName || tableEntry.sqlName || info.table;
      objects[info.name] = { table: resolvedTableName };
    }

    const config = {
      ...options,
      objects
    };
    return createDB(config);
  }
  window.createDBAuto = createDBAuto;
  window.createDB = createDB;
})(window);

