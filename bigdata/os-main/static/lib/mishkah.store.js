/**
 * Mishkah Realtime Store SDK
 *
 * Lightweight DSL for front-end clients to interact with the WS2 gateway.
 * Wraps the websocket protocol (client:hello, client:publish, server:snapshot, server:event...)
 * and maintains a local projection of module tables for quick reads.
 *
 * Usage:
 *   let   createStore =window.createStore;
 *   const store = createStore({ branchId: 'lab:test-pad', moduleId: 'scratchpad' });
 *   await store.connect();
 *   await store.insert('scratchpad_entry', { content: 'Hello' });
 *   const snapshot = store.snapshot();
 */
(function (window) {
  window.basedomain = 'https://ws.mas.com.eg';

  const DEFAULT_WS_PATH = '/ws';
  const DEFAULT_ROLE = 'pos-sdk';
  const DEFAULT_HISTORY_LIMIT = 100;
  const STORE_REGISTRY = window.__MISHKAH_STORE_REGISTRY__ = window.__MISHKAH_STORE_REGISTRY__ || [];
  let STORE_COUNTER = window.__MISHKAH_STORE_COUNTER__ || 0;

  function registerStoreInstance(store) {
    if (!store) return;
    STORE_COUNTER += 1;
    window.__MISHKAH_STORE_COUNTER__ = STORE_COUNTER;
    if (!store.__storeId) {
      store.__storeId = (store.moduleId || 'module') + '#' + STORE_COUNTER;
    }
    STORE_REGISTRY.push(store);
    window.__MISHKAH_LAST_STORE__ = store;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (_err) {
        // fall through
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_err) {
      if (Array.isArray(value)) return value.map(clone);
      const out = {};
      for (const key of Object.keys(value)) out[key] = clone(value[key]);
      return out;
    }
  }

  function resolveWsUrl(options = {}) {
    if (options.wsUrl) return options.wsUrl;
    const path = options.wsPath || DEFAULT_WS_PATH;
    const base = (typeof window !== 'undefined' && window.basedomain) || null;
    if (base) {
      const origin = String(base).trim().replace(/\/+$/, '');
      const hasWsProto = /^wss?:\/\//i.test(origin);
      const hasHttpProto = /^https?:\/\//i.test(origin);
      if (hasWsProto) return `${origin}${path}`;
      if (hasHttpProto) {
        const secure = /^https:\/\//i.test(origin);
        const host = origin.replace(/^https?:\/\//i, '');
        return `${secure ? 'wss://' : 'ws://'}${host}${path}`;
      }
      return `wss://${origin}${path}`;
    }
    if (typeof window !== 'undefined' && window.location) {
      const { location } = window;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = location.host;
      // If running on localhost or 127.0.0.1, use that. Otherwise specific logic.
      // However, user requested ws.mas.com.eg as default.
      // If window.location exists, we usually respect origin.
      // But for the fallback at the end:
    }
    return `wss://ws.mas.com.eg${path}`;
  }

  function generateId(prefix = 'req') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function matchRecordAgainstRef(candidate, ref) {
    if (!candidate || !ref) return false;
    const normalizedCandidate = {
      id: candidate.id !== undefined ? String(candidate.id) : null,
      key: candidate.key !== undefined ? String(candidate.key) : null
    };
    if (ref.id !== undefined && normalizedCandidate.id === String(ref.id)) return true;
    if (ref.key !== undefined && (normalizedCandidate.key === String(ref.key) || normalizedCandidate.id === String(ref.key))) {
      return true;
    }
    if (ref.recordKey && normalizedCandidate.id === String(ref.recordKey)) return true;
    if (ref.primaryKey && typeof ref.primaryKey === 'object') {
      return Object.entries(ref.primaryKey).every(([field, value]) => {
        if (candidate[field] === undefined || candidate[field] === null) return false;
        return String(candidate[field]) === String(value);
      });
    }
    if (ref.primary && typeof ref.primary === 'object') {
      return Object.entries(ref.primary).every(([field, value]) => {
        if (candidate[field] === undefined || candidate[field] === null) return false;
        return String(candidate[field]) === String(value);
      });
    }
    return false;
  }

  class EventEmitter {
    constructor() {
      this.listeners = new Map();
    }

    on(type, handler) {
      if (typeof handler !== 'function') return () => { };
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      const set = this.listeners.get(type);
      set.add(handler);
      return () => set.delete(handler);
    }

    emit(type, payload) {
      const set = this.listeners.get(type);
      if (!set || !set.size) return;
      for (const handler of Array.from(set)) {
        try {
          handler(payload);
        } catch (error) {
          console.warn('[Mishkah][Store] listener failed', error);
        }
      }
    }
  }

  class MishkahRealtimeStore extends EventEmitter {
    constructor(options = {}) {
      super();
      this.branchId = options.branchId || 'lab:test-pad';
      this.moduleId = options.moduleId || 'pos';
      this.role = options.role || DEFAULT_ROLE;
      this.historyLimit = Number.isFinite(options.historyLimit) ? options.historyLimit : DEFAULT_HISTORY_LIMIT;
      this.lang = options.lang || null;
      this.autoReconnect = options.autoReconnect !== false;
      this.logger = options.logger || console;
      this.wsUrl = resolveWsUrl(options);
      this.ws = null;
      this.status = 'idle';
      this.state = { branchId: this.branchId, modules: {}, meta: {} };
      this.pendingRequests = new Map();
      this.pendingSnapshotResolvers = [];
      this.reconnectDelay = 1000;
      this.maxReconnectDelay = 15000;
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
      this.lastHello = null;
      this.messageLog = [];

      // ✨ IndexedDB support
      this.useIndexedDB = options.useIndexedDB !== false;
      this.dbAdapter = null;
      if (this.useIndexedDB && window.MishkahIndexedDB) {
        this.logger.info?.('[Mishkah][Store] IndexedDB adapter enabled');
        this.dbAdapter = window.MishkahIndexedDB.createAdapter({
          namespace: this.branchId,
          name: `mishkah-store-${this.moduleId}`,
          version: options.dbVersion || 1,
        });
      }
      this.__storeId = options.debugId || (this.moduleId || 'module') + '#' + (STORE_REGISTRY.length + 1);
    }

    async connect() {
      if (this.ws && (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING)) {
        return this.ready();
      }
      this.status = 'connecting';
      this.emit('status', { status: this.status });
      this.logger.info?.('[Mishkah][Store] connecting to', this.wsUrl);

      // ✨ Load from IndexedDB cache before connecting
      if (this.dbAdapter) {
        const loadedFromCache = await this.#loadFromCache();
        if (loadedFromCache) {
          this.logger.info?.('[Mishkah][Store] state loaded from cache');
          this.emit('state:change', { reason: 'cache-load', state: clone(this.state) });
          this.emit('cache:hit', { state: clone(this.state) });
        }
      }

      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => this.#handleOpen());
      this.ws.addEventListener('message', (event) => {
        this.#handleMessage(event.data);
      });
      this.ws.addEventListener('close', (event) => {
        this.logger.warn?.('[Mishkah][Store] connection closed', event.code, event.reason);
        this.status = 'closed';
        this.emit('status', { status: this.status, code: event.code, reason: event.reason });
        if (this.autoReconnect) {
          this.#scheduleReconnect();
        }
      });
      this.ws.addEventListener('error', (error) => {
        this.logger.error?.('[Mishkah][Store] websocket error', error);
        this.emit('error', { type: 'ws-error', error });
      });
      this.readyPromise = new Promise((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });
      return this.readyPromise;
    }

    disconnect() {
      this.autoReconnect = false;
      if (this.ws) {
        try {
          this.ws.close();
        } catch (_err) {
          // ignore
        }
      }
      this.status = 'closed';
      this.emit('status', { status: this.status });
    }

    get connected() {
      return this.status === 'open' || this.status === 'ready';
    }

    ready() {
      if (this.readyPromise) return this.readyPromise;
      return Promise.resolve(this.state);
    }

    snapshot(moduleId = this.moduleId) {
      const moduleState = this.state.modules[moduleId];
      return moduleState ? clone(moduleState) : null;
    }

    tables(moduleId = this.moduleId) {
      const snap = this.snapshot(moduleId);
      return snap ? clone(snap.tables) : {};
    }

    listTable(tableName, moduleId = this.moduleId) {
      const allTables = this.tables(moduleId);
      return allTables && allTables[tableName] ? clone(allTables[tableName]) : [];
    }

    async read(tableName, id, moduleId = this.moduleId) {
      if (!tableName) {
        throw new Error('Table name is required');
      }
      if (id === undefined || id === null) {
        throw new Error('Record ID is required');
      }

      const tableData = this.listTable(tableName, moduleId);
      if (!tableData || !Array.isArray(tableData)) {
        return null;
      }

      // Find record by id or key
      const record = tableData.find(r => {
        if (r.id !== undefined && String(r.id) === String(id)) return true;
        if (r.key !== undefined && String(r.key) === String(id)) return true;
        return false;
      });

      return record ? clone(record) : null;
    }

    async query(tableName, filter, moduleId = this.moduleId) {
      if (!tableName) {
        throw new Error('Table name is required');
      }

      const tableData = this.listTable(tableName, moduleId);
      if (!tableData || !Array.isArray(tableData)) {
        return [];
      }

      // If no filter provided, return all records
      if (!filter) {
        return clone(tableData);
      }

      // If filter is a function, use it to filter records
      if (typeof filter === 'function') {
        const filtered = tableData.filter(filter);
        return clone(filtered);
      }

      // If filter is an object, match properties
      if (typeof filter === 'object') {
        const filtered = tableData.filter(record => {
          return Object.entries(filter).every(([key, value]) => {
            if (record[key] === undefined) return false;
            return String(record[key]) === String(value);
          });
        });
        return clone(filtered);
      }

      throw new Error('Filter must be a function or an object');
    }

    getState() {
      return clone(this.state);
    }

    async insert(table, record, meta = {}) {
      return this.#publish('module:insert', table, record, meta);
    }

    async merge(table, record, meta = {}) {
      return this.#publish('module:merge', table, record, meta);
    }

    async save(table, record, meta = {}) {
      return this.#publish('module:save', table, record, meta);
    }

    async remove(table, recordRef, meta = {}) {
      return this.#publish('module:delete', table, recordRef, meta);
    }

    async update(table, record, meta = {}) {
      // ✅ CRITICAL VALIDATION: Prevent update without version for versioned tables
      // Only order_header and order_line use version-based optimistic locking
      const versionedTables = ['order_header', 'order_line'];
      const isVersionedTable = versionedTables.includes(table);

      if (isVersionedTable) {
        if (!record.version || typeof record.version !== 'number') {
          const errorMsg = `❌ [Mishkah Store] CRITICAL ERROR: Cannot update "${table}" without version field!\n\n` +
            `The "${table}" table uses optimistic locking and REQUIRES a version field.\n\n` +
            `How to fix:\n` +
            `1. Read current record to get its current version\n` +
            `2. Calculate nextVersion = currentVersion + 1\n` +
            `3. Include version: nextVersion in your update payload\n\n` +
            `Example:\n` +
            `  const current = state.order_header.find(h => h.id === orderId);\n` +
            `  const nextVersion = (current.version || 1) + 1;\n` +
            `  await store.update('${table}', { id: ..., version: nextVersion, ... });\n\n` +
            `See docs/MISHKAH_STORE_UPDATE_GUIDE.md for more details.`;

          console.error(errorMsg);
          throw new Error(`Update rejected: "${table}" requires version field (current value: ${record.version})`);
        }

        // ✅ Log version for debugging
        this.logger.info?.(`[Mishkah][Store] Updating ${table} with version ${record.version}`, { id: record.id });
      }

      return this.#publish('module:update', table, record, meta);
    }

    requestSnapshot() {
      this.#queueMessage({
        type: 'client:request:snapshot',
        branchId: this.branchId,
        moduleId: this.moduleId,
        requestId: generateId('snapshot')
      });
      return new Promise((resolve) => {
        this.pendingSnapshotResolvers.push(resolve);
      });
    }

    uuid(prefix = 'rec') {
      return generateId(prefix);
    }

    logHistory(limit = 50) {
      return this.messageLog.slice(-limit).map((entry) => clone(entry));
    }

    #handleOpen() {
      this.logger.info?.('[Mishkah][Store] socket open');
      this.status = 'open';
      this.emit('status', { status: this.status });
      this.#sendHello();
    }

    #sendHello() {
      const hello = {
        type: 'client:hello',
        branchId: this.branchId,
        role: this.role,
        historyLimit: this.historyLimit,
        requestSnapshot: true,
        requestHistory: false,
        requestId: generateId('hello')
      };
      if (this.lang) {
        hello.lang = this.lang;
      }
      this.lastHello = hello;
      this.#queueMessage(hello);
    }

    #handleMessage(raw) {
      let payload = raw;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (error) {
          this.logger.warn?.('[Mishkah][Store] failed to parse message', raw.slice(0, 120), error);
          this.emit('error', { type: 'parse-error', raw, error });
          return;
        }
      }
      this.messageLog.push({ ts: nowIso(), payload });
      if (this.messageLog.length > 500) this.messageLog.shift();
      const type = payload?.type;
      switch (type) {
        case 'server:hello':
          this.emit('hello', payload);
          break;
        case 'server:log':
          this.logger.info?.('[Mishkah][Store][Log]', payload.message, payload.context || {});
          this.emit('log', payload);
          break;
        case 'server:snapshot':
          this.#applySnapshot(payload);
          this.emit('snapshot', clone(this.state));

          // ✨ Cache snapshot to IndexedDB
          if (this.dbAdapter && this.state.modules[this.moduleId]) {
            this.#cacheModuleState(
              this.moduleId,
              this.state.modules[this.moduleId],
              payload.meta || {}
            );
          }

          if (this.readyResolve) {
            this.readyResolve(this.state);
            this.readyResolve = null;
            this.readyReject = null;
          }
          if (this.pendingSnapshotResolvers.length) {
            for (const resolve of this.pendingSnapshotResolvers.splice(0)) {
              resolve(clone(this.state));
            }
          }
          break;
        case 'server:event':
          this.#applyEvent(payload);
          this.emit('event', payload);
          break;
        case 'server:ack':
          this.#handleAck(payload);
          this.emit('ack', payload);
          break;
        case 'server:directive':
          this.emit('directive', payload);
          break;
        default:
          this.logger.debug?.('[Mishkah][Store] unhandled message', payload);
      }
    }

    #handleAck(ack) {
      const requestId = ack?.meta?.clientMeta?.requestId || ack?.meta?.clientMeta?.requestID;
      if (requestId && this.pendingRequests.has(requestId)) {
        const { resolve } = this.pendingRequests.get(requestId);
        this.pendingRequests.delete(requestId);
        resolve(ack);
      }
    }

    #applySnapshot(message) {
      const snapshot = message.modules || {};
      const nextState = { branchId: message.branchId || this.branchId, modules: {}, meta: {} };
      for (const [moduleId, moduleSnapshot] of Object.entries(snapshot)) {
        nextState.modules[moduleId] = clone(moduleSnapshot);
      }
      nextState.meta.snapshotMeta = message.meta || {};
      this.state = nextState;
      this.emit('state:change', { reason: 'snapshot', state: clone(this.state) });
    }

    #applyEvent(event) {
      const moduleId = event.moduleId || this.moduleId;
      const tableName = event.table;
      if (!tableName) return;
      if (!this.state.modules[moduleId]) {
        this.state.modules[moduleId] = { moduleId, version: 0, tables: {}, meta: {} };
      }
      const moduleState = this.state.modules[moduleId];
      if (!moduleState.tables) moduleState.tables = {};
      if (!Array.isArray(moduleState.tables[tableName])) {
        moduleState.tables[tableName] = [];
      }
      const tableData = moduleState.tables[tableName];
      const recordRef = event.recordRef || event.meta?.recordRef || event.entry?.recordRef || null;
      const action = event.action || event.entry?.action;
      const nextRecord = event.entry?.record || event.record || null;
      const key = recordRef?.key || recordRef?.id || recordRef?.recordKey || null;

      const findIndex = () => {
        if (!recordRef) return -1;
        for (let idx = 0; idx < tableData.length; idx += 1) {
          const candidate = tableData[idx];
          if (matchRecordAgainstRef(candidate, recordRef)) return idx;
          if (key && candidate.id !== undefined && String(candidate.id) === String(key)) return idx;
        }
        return -1;
      };

      if (action === 'module:delete') {
        const index = findIndex();
        if (index >= 0) {
          tableData.splice(index, 1);
        }
      } else if (nextRecord) {
        const index = findIndex();
        const hydratedRecord = clone(nextRecord);
        if (recordRef?.id !== undefined && hydratedRecord.id === undefined) {
          hydratedRecord.id = recordRef.id;
        }
        if (recordRef?.key && hydratedRecord.key === undefined) {
          hydratedRecord.key = recordRef.key;
        }
        if (index >= 0) {
          if (action === 'module:merge') {
            tableData[index] = { ...tableData[index], ...hydratedRecord };
          } else {
            tableData[index] = hydratedRecord;
          }
        } else {
          tableData.push(hydratedRecord);
        }
      }

      moduleState.version = event.version || moduleState.version || 0;
      moduleState.lastEvent = {
        id: event.eventId,
        action,
        table: tableName,
        sequence: event.sequence,
        receivedAt: nowIso()
      };
      this.emit('state:change', {
        reason: 'event',
        moduleId,
        table: tableName,
        state: clone(this.state.modules[moduleId])
      });
    }

    async #publish(action, table, record, meta) {
      if (!table) throw new Error('Table name is required');
      if (!record || typeof record !== 'object') throw new Error('Record object is required');
      const requestId = generateId('req');
      const payload = {
        type: 'client:publish',
        branchId: this.branchId,
        moduleId: this.moduleId,
        table,
        action,
        record,
        meta: { ...(meta || {}), requestId },
        includeRecord: true,
        requestId
      };
      const ackPromise = new Promise((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject, sentAt: Date.now() });
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error(`Request timed out (${requestId})`));
          }
        }, 15000);
      });
      this.#queueMessage(payload);
      return ackPromise;
    }

    #queueMessage(payload) {
      const data = JSON.stringify(payload);
      if (!this.ws) throw new Error('Socket not initialised');
      if (this.ws.readyState === this.ws.OPEN) {
        this.ws.send(data);
        return;
      }
      const pollSend = () => {
        if (!this.ws) return;
        if (this.ws.readyState === this.ws.OPEN) {
          this.ws.send(data);
        } else if (this.ws.readyState === this.ws.CONNECTING) {
          setTimeout(pollSend, 100);
        } else {
          this.logger.warn?.('[Mishkah][Store] dropping payload, socket closed', payload);
        }
      };
      setTimeout(pollSend, 100);
    }

    #scheduleReconnect() {
      if (!this.autoReconnect) return;
      const delay = Math.min(this.reconnectDelay, this.maxReconnectDelay);
      this.logger.info?.('[Mishkah][Store] reconnecting in', delay, 'ms');
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
        this.connect().catch((error) => {
          this.logger.error?.('[Mishkah][Store] reconnect failed', error);
        });
      }, delay);
    }

    // ==================== IndexedDB Cache Methods ====================

    async #loadFromCache() {
      if (!this.dbAdapter) return false;
      try {
        const cachedModule = await this.dbAdapter.load(this.moduleId);
        if (cachedModule && cachedModule.data) {
          if (!this.state.modules) this.state.modules = {};
          this.state.modules[this.moduleId] = clone(cachedModule.data);
          if (cachedModule.meta) {
            if (!this.state.meta) this.state.meta = {};
            this.state.meta[this.moduleId] = clone(cachedModule.meta);
          }
          this.emit('cache', { status: 'loaded', moduleId: this.moduleId });
          return true;
        }
      } catch (error) {
        this.logger.error?.('[Mishkah][Store] failed to load from cache', error);
      }
      return false;
    }

    async #cacheModuleState(moduleId, moduleData, meta = {}) {
      if (!this.dbAdapter) return;
      try {
        await this.dbAdapter.save(moduleId, moduleData, { metadata: meta, mergeMetadata: true });
        this.emit('cache', { status: 'saved', moduleId });
      } catch (error) {
        this.logger.error?.('[Mishkah][Store] failed to save to cache', error);
      }
    }
  }

  function createStore(options) {
    var store = new MishkahRealtimeStore(options);
    registerStoreInstance(store);
    return store;
  }
  window.MishkahRealtimeStore = MishkahRealtimeStore;
  window.createStore = createStore;

})(window);
