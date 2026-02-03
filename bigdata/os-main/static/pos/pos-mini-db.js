
(async function (window) {
  let createDBAuto = window.createDBAuto;

  const TABLE_ALIAS_GROUPS = {
    // pos_database REMOVED - tables are now direct in window.database
    pos_shift: ['shift_header', 'shiftHeaders', 'shifts', 'pos_shift', 'pos_shifts'],
    // ✅ UNIFIED: Removed aliases for order tables (use canonical names only)
    order_header: [],  // ✅ Removed: ['orders', 'order_headers', 'orderHeader', 'order_header_live', 'pos_order_header']
    order_line: [],    // ✅ Removed: ['order_lines', 'order_line_items', 'orderDetails', 'order_items', 'orderLines']
    order_line_modifier: ['order_line_modifiers', 'orderModifiers', 'order_line_addons'],
    order_line_status_log: ['order_line_status_history', 'line_status_history'],
    order_status_log: ['order_status_history', 'orderStatusHistory'],
    order_payment: [],  // ✅ Removed: ['payments', 'order_payments', 'orderPayments', 'payment_transactions']
    order_delivery: [],  // ✅ Removed: ['order_deliveries', 'deliveries']
    // ✅ UNIFIED: Removed aliases for job_order tables (use canonical names only)
    job_order_header: [],  // ✅ Removed: ['job_orders', 'job_order_headers', 'production_order_header']
    job_order_detail: [],  // ✅ Removed: ['job_order_details', 'jobOrderDetails', 'production_order_detail']
    job_order_detail_modifier: [],  // ✅ Removed: ['job_order_modifiers', 'jobOrderModifiers']
    job_order_status_history: [],  // ✅ Removed: ['job_order_status_log', 'jobStatusHistory']
    expo_pass_ticket: ['expo_pass_tickets', 'expo_tickets', 'expoPassTickets'],
    menu_item: ['menu_items', 'menuItems', 'menuItem', 'items'],
    menu_category: ['menu_categories', 'menuCategories', 'menuCategory', 'categories'],
    kitchen_sections: ['kitchen_section', 'kitchenStations'],  // FIXED: Use plural as canonical (matches seeds)
    dining_table: ['dining_tables', 'restaurant_tables', 'tables'],
    table_lock: ['table_locks', 'locks', 'tableLocks'],
    customer_profile: ['customer_profiles', 'customers', 'customerProfiles'],
    customer_address: ['customer_addresses', 'addresses', 'customerAddresses'],

    order_schedule: ['order_schedules', 'reservations_meta'],
    order_schedule_tables: [],
    audit_event: ['audit_events', 'auditEvents'],
    category_section: ['category_sections', 'categorySections'],
    employee: ['employees', 'staff'],
    order_type: ['order_types', 'orderTypes'],
    order_status: ['order_statuses', 'orderStatuses'],
    order_stage: ['order_stages', 'orderStages'],
    order_payment_state: ['order_payment_states', 'orderPaymentStates'],
    order_line_status: ['order_line_statuses', 'orderLineStatuses'],
    payment_method: ['payment_methods', 'paymentMethods'],
    pos_terminal: ['pos_terminals', 'posTerminals'],
    delivery_driver: ['delivery_drivers', 'deliveryDrivers']
  };

  const DEFAULT_TABLES = [
    // 'pos_database', // REMOVED: Deprecated - data is now directly in tables
    'pos_shift',
    'order_header',
    'order_line',
    'order_payment',
    'order_status_log',
    'order_line_status_log',
    'order_delivery',
    'table_lock',
    'menu_item',
    'menu_category',
    'category_section',
    'kitchen_sections',  // FIXED: Use plural to match seeds
    'dining_table',
    'employee',
    'payment_method',
    'order_type',
    'order_status',
    'order_stage',
    'order_payment_state',
    'order_line_status',
    'pos_terminal',
    'delivery_driver',
    'customer_profile',  // ✅ ADDED: Customer profiles
    'customer_address',  // ✅ ADDED: Customer addresses
    'customer_address',  // ✅ ADDED: Customer addresses
    'order_schedule',
    'order_schedule_tables',
    'order_schedule_payment',  // ✅ ADDED: Payments for reservations
    'audit_event',
    'expo_pass_ticket',
    // ✅ KDS job orders must be persisted to store
    'job_order_header',
    'job_order_detail',
    'job_order_detail_modifier',
    'job_order_status_history',
    'job_order_batch'
  ];

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toTableName(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const name = entry.trim();
      return name.length ? name : null;
    }
    if (typeof entry === 'object') {
      const name =
        entry.name ||
        entry.table ||
        entry.tableName ||
        entry.sqlName ||
        entry.id ||
        null;
      return name ? String(name).trim() : null;
    }
    return null;
  }

  function cloneValue(value) {
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
      if (Array.isArray(value)) return value.map(cloneValue);
      const out = {};
      for (const key of Object.keys(value)) out[key] = cloneValue(value[key]);
      return out;
    }
  }

  function extractRows(source) {
    if (Array.isArray(source)) return source.slice();
    if (!source || typeof source !== 'object') return [];
    if (Array.isArray(source.rows)) return source.rows.slice();
    if (Array.isArray(source.list)) return source.list.slice();
    if (Array.isArray(source.items)) return source.items.slice();
    if (Array.isArray(source.data)) return source.data.slice();
    if (Array.isArray(source.values)) return source.values.slice();
    if (Array.isArray(source.records)) return source.records.slice();
    return [];
  }

  function normalizeSchemaTables(schema, moduleEntry, requiredTables = []) {
    if (!schema || typeof schema !== 'object') return schema;
    const schemaContainer = schema.schema && typeof schema.schema === 'object' ? schema.schema : {};
    const existing = ensureArray(schemaContainer.tables);
    const normalizedMap = new Map();

    for (const entry of existing) {
      if (entry && typeof entry === 'object') {
        const key = toTableName(entry);
        if (key && !normalizedMap.has(key)) {
          normalizedMap.set(key, entry);
        }
        continue;
      }
      const fallbackName = toTableName(entry);
      if (fallbackName && !normalizedMap.has(fallbackName)) {
        normalizedMap.set(fallbackName, { name: fallbackName });
      }
    }

    const registerName = (name) => {
      const key = toTableName(name);
      if (!key || normalizedMap.has(key)) return;
      normalizedMap.set(key, { name: key });
    };

    ensureArray(schema.tables).forEach(registerName);
    ensureArray(moduleEntry?.tables).forEach(registerName);
    ensureArray(requiredTables).forEach(registerName);

    if (!normalizedMap.size) {
      return schema;
    }

    const nextTables = Array.from(normalizedMap.values());
    if (existing.length === nextTables.length && existing.every((entry, idx) => entry === nextTables[idx])) {
      return schema;
    }

    schema.schema = schemaContainer;
    schema.schema.tables = nextTables;
    if (!Array.isArray(schema.tables) || schema.tables !== nextTables) {
      schema.tables = nextTables;
    }
    return schema;
  }

  function buildAliasRegistry(schemaTables = []) {
    const registry = new Map();
    const register = (canonical, alias) => {
      if (!canonical || !alias) return;
      const key = String(alias).trim().toLowerCase();
      if (!key) return;
      registry.set(key, canonical);
    };
    for (const [canonical, aliases] of Object.entries(TABLE_ALIAS_GROUPS)) {
      register(canonical, canonical);
      ensureArray(aliases).forEach((alias) => register(canonical, alias));
    }
    schemaTables.forEach((entry) => {
      const canonical = toTableName(entry);
      if (!canonical) return;
      register(canonical, canonical);
      register(canonical, entry?.table);
      register(canonical, entry?.tableName);
      register(canonical, entry?.sqlName);
      ensureArray(entry?.aliases).forEach((alias) => register(canonical, alias));
      ensureArray(entry?.synonyms).forEach((alias) => register(canonical, alias));
    });
    return registry;
  }

  function canonicalizeTableName(name, registry) {
    if (name == null) return null;
    const text = String(name).trim();
    if (!text) return null;
    const lower = text.toLowerCase();

    // STRICT MODE: Only allow exact matches from official schema names
    // Official canonical table names from schema definition
    const OFFICIAL_CANONICAL_NAMES = new Set([
      'audit_event', 'category_section', 'customer_address', 'customer_profile',
      'delivery_driver', 'dining_table', 'employee', 'expo_pass_ticket',
      'job_order_detail', 'job_order_detail_modifier', 'job_order_header',
      'job_order_status_history', 'kitchen_section', 'menu_category', 'menu_item',
      'menu_item_media', 'menu_item_modifier', 'menu_item_price', 'menu_modifier',
      'order_delivery', 'order_header', 'order_line', 'order_line_modifier',
      'order_line_status', 'order_line_status_log', 'order_payment',
      'order_payment_state', 'order_refund', 'order_return_header',
      'order_return_line', 'order_stage', 'order_status', 'order_status_log',
      'order_type', 'payment_method', 'pos_shift', 'pos_terminal',
      'reservation', 'reservation_table', 'shift_cash_audit',
      'order_schedule', 'order_schedule_tables',
      'shift_payment_summary', 'table_lock'
    ]);

    if (registry.has(lower)) {
      const canonical = registry.get(lower);

      // Only allow if it's an official canonical name from schema
      if (OFFICIAL_CANONICAL_NAMES.has(canonical.toLowerCase())) {
        // Only return if it's an exact match to canonical name
        if (lower === canonical.toLowerCase()) {
          return canonical;
        }
        // Throw error for aliases to force code fixes
        throw new Error(`TABLE_ALIAS_VIOLATION: '${text}' is an alias for '${canonical}'. Use canonical name '${canonical}' instead.`);
      }
    }

    // For unknown tables, throw error to enforce schema compliance
    throw new Error(`INVALID_TABLE_NAME: '${text}' is not a valid table name according to the official schema.`);
  }

  async function fetchJson(url, { cache = 'no-store', skipBasedomain = false } = {}) {
    let finalUrl = url;

    // Auto-detect: never use basedomain for /data/ paths (local static files)
    const isLocalDataFile = url && (url.startsWith('/data/') || url.includes('/data/branches/'));

    if (typeof window !== 'undefined' && !skipBasedomain && !isLocalDataFile) {
      const base = window.basedomain;
      if (base && typeof base === 'string' && url && url.startsWith('/')) {
        const origin = base.replace(/\/+$/, '');
        finalUrl = `${origin}${url}`;
      }
    }
    const response = await fetch(finalUrl, { cache });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${finalUrl}`);
    }
    return response.json();
  }

  async function fetchModuleSchemaRemote(branchId, moduleId) {
    const params = new URLSearchParams({
      branch: branchId,
      module: moduleId
    });
    const payload = await fetchJson(window.basedomain + `/api/schema?${params.toString()}`);
    const moduleEntry = payload?.modules?.[moduleId];
    if (!moduleEntry || !moduleEntry.schema) {
      throw new Error(`Schema for module "${moduleId}" not found in /api/schema response`);
    }
    return { schema: moduleEntry.schema, moduleEntry };
  }

  async function fetchModuleSchemaLocal(branchId, moduleId) {
    // SECURITY: Use REST API instead of direct file access
    // Falls back to /api/schema endpoint for schema definition
    const params = new URLSearchParams({
      branch: branchId,
      module: moduleId
    });
    const payload = await fetchJson(window.basedomain + `/api/schema?${params.toString()}`);
    const moduleEntry = payload?.modules?.[moduleId];
    if (!moduleEntry || !moduleEntry.schema) {
      throw new Error(`Schema for module "${moduleId}" not found in /api/schema response`);
    }
    return { schema: moduleEntry.schema, moduleEntry };
  }

  async function fetchModuleDataset(branchId, moduleId) {
    // SECURITY: Always use REST API instead of static files
    // This prevents direct access to sensitive live/seed data files
    // and allows for future authentication/authorization
    try {
      const apiUrl = window.basedomain + `/api/branches/${encodeURIComponent(branchId)}/modules/${encodeURIComponent(moduleId)}`;
      const snapshot = await fetchJson(apiUrl);
      // The API returns a snapshot with { branchId, moduleId, tables, meta, version }
      return snapshot;
    } catch (error) {
      console.warn(`[fetchModuleDataset] Failed to fetch from REST API: ${error.message}`);
      return null;
    }
  }

  function createOfflineStore({ branchId, moduleId, schema, tables, meta, logger, role = 'pos-mini-offline' }) {
    const schemaTables = Array.isArray(schema?.schema?.tables)
      ? schema.schema.tables
      : Array.isArray(schema?.tables)
        ? schema.tables
        : [];
    const aliasRegistry = buildAliasRegistry(schemaTables);
    const tableData = new Map();
    const rawTables = tables && typeof tables === 'object' ? tables : {};

    // OFFLINE MODE: Use lenient canonicalization that accepts aliases
    const canonicalizeTableNameLenient = (name) => {
      if (name == null) return null;
      const text = String(name).trim();
      if (!text) return null;
      const lower = text.toLowerCase();

      // Try to find canonical name from registry (allows aliases)
      if (aliasRegistry.has(lower)) {
        return aliasRegistry.get(lower);
      }

      // If not in registry, return as-is (lenient mode for offline data)
      return text;
    };

    const pushTable = (key, rows) => {
      const canonical = canonicalizeTableNameLenient(key) || key;
      tableData.set(canonical, ensureArray(rows).map(cloneValue));
    };

    for (const [key, value] of Object.entries(rawTables)) {
      pushTable(key, extractRows(value));
    }

    schemaTables.forEach((entry) => {
      const canonical = toTableName(entry);
      if (!canonical) return;
      if (!tableData.has(canonical)) {
        tableData.set(canonical, []);
      }
    });

    const config = {
      branchId,
      moduleId,
      role,
      historyLimit: 0,
      autoConnect: false,
      logger: logger || console,
      objects: {}
    };

    const definitions = new Map();
    const watchers = new Map();
    const statusWatchers = new Set();
    let status = 'ready';
    let initialFetchTriggered = false;
    let initialFetchInProgress = false;

    const emitStatus = () => {
      for (const handler of Array.from(statusWatchers)) {
        try {
          handler({ status });
        } catch (error) {
          config.logger?.warn?.('[PosMiniDB][offline] status listener failed', error);
        }
      }
    };

    // Smart background fetch: جلب البيانات من REST API دائماً عند بداية الـ store
    const fetchInitialSnapshot = async () => {
      if (initialFetchTriggered || initialFetchInProgress) {
        return; // Already fetching or done
      }

      initialFetchTriggered = true;
      initialFetchInProgress = true;

      try {

        const apiUrl = window.basedomain + `/api/branches/${encodeURIComponent(branchId)}/modules/${encodeURIComponent(moduleId)}`;
        const response = await fetch(apiUrl, { cache: 'no-store' });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const snapshot = await response.json();

        const fetchedTables = snapshot.tables || {};

        // Inject data into cache (OVERWRITE existing data)
        for (const [tableName, rows] of Object.entries(fetchedTables)) {
          const canonical = canonicalizeTableNameLenient(tableName) || tableName;
          const dataRows = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : []);

          // Always update cache with fresh data from server
          tableData.set(canonical, ensureArray(dataRows).map(cloneValue));

          // Need to emit for all definitions that point to this table
          // Find all definitions that map to this table and emit for each
          let emitCount = 0;
          for (const [defName, def] of definitions.entries()) {
            if (def.table === canonical) {

              emit(defName);
              emitCount++;
            }
          }

          // If no definitions found, emit using canonical name directly
          if (emitCount === 0) {

            emit(canonical);
          }
        }

      } catch (error) {
        console.warn(`[PosMiniDB] Smart fetch failed:`, error.message);

      } finally {
        initialFetchInProgress = false;
      }
    };

    const resolveTableName = (name, hint) => {
      const preferred = hint || name;
      // Use lenient canonicalization in offline mode
      const canonical = canonicalizeTableNameLenient(preferred);
      if (canonical && tableData.has(canonical)) return canonical;
      if (canonical && !tableData.has(canonical)) {
        tableData.set(canonical, []);
        return canonical;
      }
      const lower = String(preferred || '').trim().toLowerCase();
      if (lower) {
        for (const key of tableData.keys()) {
          if (key.toLowerCase() === lower) return key;
        }
      }
      const fallback = preferred || name;
      if (!tableData.has(fallback)) tableData.set(fallback, []);
      return fallback;
    };

    const ensureDefinition = (name, options = {}) => {
      if (definitions.has(name)) return definitions.get(name);
      const table = resolveTableName(name, options.table || options.tableName || options.sqlName);
      const def = { name, table };
      definitions.set(name, def);
      config.objects[name] = { table };
      if (!watchers.has(name)) watchers.set(name, new Set());
      return def;
    };

    const emit = (name) => {
      const def = ensureDefinition(name);
      const rows = tableData.get(def.table) || [];
      const payload = rows.map(cloneValue);
      const set = watchers.get(name);
      if (!set || !set.size) {

        return;
      }

      for (const handler of Array.from(set)) {
        try {
          handler(payload.map(cloneValue), { table: def.table });
        } catch (error) {
          config.logger?.warn?.('[PosMiniDB][offline] watcher failed', error);
        }
      }
    };

    const api = {
      config,
      meta: meta || {},
      register(name, options = {}) {
        ensureDefinition(name, options);
        emit(name);
        return api;
      },
      watch(name, handler, { immediate = true } = {}) {
        if (typeof handler !== 'function') return () => { };
        ensureDefinition(name);
        const def = definitions.get(name);
        const set = watchers.get(name);
        set.add(handler);

        // Smart Fetch: جلب البيانات من REST API مرة واحدة عند أول watch()
        if (!initialFetchTriggered) {

          fetchInitialSnapshot(); // Background fetch
        }

        const rows = tableData.get(def.table) || [];

        if (immediate) {

          handler(rows.map(cloneValue), { table: def.table });
        }
        return () => {
          const target = watchers.get(name);
          if (!target) return;
          target.delete(handler);
          if (!target.size) watchers.delete(name);
        };
      },
      status(handler) {
        if (typeof handler !== 'function') return () => { };
        statusWatchers.add(handler);
        handler({ status });
        return () => statusWatchers.delete(handler);
      },
      ready() {
        return Promise.resolve({ status });
      },
      async connect() {
        status = 'ready';
        emitStatus();
        return { status };
      },
      disconnect() {
        status = 'closed';
        emitStatus();
      },
      list(name) {
        ensureDefinition(name);
        const def = definitions.get(name);
        const rows = tableData.get(def.table) || [];
        return rows.map(cloneValue);
      },
      snapshot() {
        const tablesSnapshot = {};
        for (const [key, rows] of tableData.entries()) {
          tablesSnapshot[key] = rows.map(cloneValue);
        }
        return {
          branchId,
          moduleId,
          tables: tablesSnapshot,
          meta: meta || {}
        };
      },
      clear(...names) {
        const tablesToClear = new Set();
        const getCanonical = (name) => {
          if (name == null) return null;
          const text = String(name).trim().toLowerCase();
          return text && aliasRegistry.has(text) ? aliasRegistry.get(text) : name;
        };

        for (const name of names) {
          const canonical = getCanonical(name);
          if (canonical && tableData.has(canonical)) {
            tablesToClear.add(canonical);
          } else {
            config.logger?.warn?.(`[PosMiniDB][offline] clear: unknown table ${name}`);
          }
        }

        for (const table of tablesToClear) {
          tableData.set(table, []);
        }

        for (const [defName, def] of definitions.entries()) {
          if (tablesToClear.has(def.table)) {
            emit(defName);
          }
        }
        return api;
      },
      async getOrder(orderId) {
        if (!orderId) return null;
        const header = api.list('order_header').find(h => h.id === orderId);
        if (!header) return null;
        const lines = api.list('order_line').filter(l => l.orderId === orderId);
        const payments = api.list('order_payment').filter(p => p.orderId === orderId);
        return { ...header, lines, payments };
      },
      // 🔧 FIX: Add insert/save/merge methods for offline mode with HTTP fallback
      // When WebSocket is unavailable, POS falls back to offline store
      // These methods use HTTP POST to send data to backend (fallback for WebSocket)
      async insert(tableName, record, meta = {}) {
        const canonical = canonicalizeTableNameLenient(tableName) || tableName;
        if (!tableData.has(canonical)) {
          tableData.set(canonical, []);
        }
        const rows = tableData.get(canonical);
        const cloned = cloneValue(record);
        rows.push(cloned);

        // Emit to watchers
        for (const [defName, def] of definitions.entries()) {
          if (def.table === canonical) {
            emit(defName);
          }
        }

        // ⚠️ OFFLINE MODE: Data saved locally only, NOT sent to server
        // Use WebSocket (createDBAuto) for real-time sync with backend
        config.logger?.warn?.(`[PosMiniDB][offline] insert('${tableName}'): Local only - NOT sent to server`);
        return cloned;
      },
      async save(tableName, record, meta = {}) {
        const canonical = canonicalizeTableNameLenient(tableName) || tableName;
        if (!tableData.has(canonical)) {
          tableData.set(canonical, []);
        }
        const rows = tableData.get(canonical);
        const id = record.id;
        const existingIndex = rows.findIndex(r => r.id === id);
        const cloned = cloneValue(record);

        if (existingIndex >= 0) {
          rows[existingIndex] = cloned;
        } else {
          rows.push(cloned);
        }

        // Emit to watchers
        for (const [defName, def] of definitions.entries()) {
          if (def.table === canonical) {
            emit(defName);
          }
        }

        config.logger?.warn?.(`[PosMiniDB][offline] save('${tableName}'): Data NOT sent to server (offline mode)`);
        return { record: cloned, created: existingIndex < 0 };
      },
      async merge(tableName, patch, meta = {}) {
        const canonical = canonicalizeTableNameLenient(tableName) || tableName;
        if (!tableData.has(canonical)) {
          config.logger?.error?.(`[PosMiniDB][offline] merge('${tableName}'): Table not found`);
          throw new Error(`Table ${tableName} not found`);
        }
        const rows = tableData.get(canonical);
        const id = patch.id;
        const existingIndex = rows.findIndex(r => r.id === id);

        if (existingIndex < 0) {
          config.logger?.error?.(`[PosMiniDB][offline] merge('${tableName}'): Record ${id} not found`);
          throw new Error(`Record ${id} not found in table ${tableName}`);
        }

        const existing = rows[existingIndex];
        const merged = { ...existing, ...patch };
        rows[existingIndex] = merged;

        // Emit to watchers
        for (const [defName, def] of definitions.entries()) {
          if (def.table === canonical) {
            emit(defName);
          }
        }

        config.logger?.warn?.(`[PosMiniDB][offline] merge('${tableName}'): Data NOT sent to server (offline mode)`);
        return cloneValue(merged);
      },
      async remove(tableName, recordRef, meta = {}) {
        const canonical = canonicalizeTableNameLenient(tableName) || tableName;
        if (!tableData.has(canonical)) {
          config.logger?.error?.(`[PosMiniDB][offline] remove('${tableName}'): Table not found`);
          throw new Error(`Table ${tableName} not found`);
        }
        const rows = tableData.get(canonical);
        const id = typeof recordRef === 'object' ? recordRef.id : recordRef;
        const existingIndex = rows.findIndex(r => r.id === id);

        if (existingIndex < 0) {
          config.logger?.warn?.(`[PosMiniDB][offline] remove('${tableName}'): Record ${id} not found`);
          return { record: null };
        }

        const removed = rows.splice(existingIndex, 1)[0];

        // Emit to watchers
        for (const [defName, def] of definitions.entries()) {
          if (def.table === canonical) {
            emit(defName);
          }
        }

        config.logger?.warn?.(`[PosMiniDB][offline] remove('${tableName}'): Data NOT sent to server (offline mode)`);
        return { record: cloneValue(removed) };
      }
    };

    api.store = api;
    return api;
  }

  function normalizeSchemaPayload(schema, moduleEntry, tables) {
    const normalized = normalizeSchemaTables(schema, moduleEntry, tables);
    const tableEntries = Array.isArray(normalized?.schema?.tables)
      ? normalized.schema.tables
      : [];
    if (!tableEntries.length) {
      const synthesized = tables
        .map((name) => toTableName(name))
        .filter(Boolean)
        .map((name) => ({ name }));
      if (!normalized.schema || typeof normalized.schema !== 'object') {
        normalized.schema = {};
      }
      normalized.schema.tables = synthesized;
      normalized.tables = synthesized;
    } else if (!Array.isArray(normalized.tables) || normalized.tables !== tableEntries) {
      normalized.tables = tableEntries;
    }
    return normalized;
  }

  async function createRemotePosDb({ branchId, moduleId, tables, logger, role, historyLimit, smartFetch }) {
    const { schema, moduleEntry } = await fetchModuleSchemaRemote(branchId, moduleId);
    const normalizedSchema = normalizeSchemaPayload(schema, moduleEntry, tables);
    const db = createDBAuto(normalizedSchema, tables, {
      branchId,
      moduleId,
      historyLimit: historyLimit || 200,
      role: role || 'pos-mini',
      autoReconnect: true,
      logger: logger || console,
      smartFetch
    });
    await db.ready();
    return { db, schema: normalizedSchema, moduleEntry };
  }

  async function createOfflinePosDb({ branchId, moduleId, tables, logger, role, smartFetch }, cause) {
    // NOTE: Despite the name "offline", this still uses REST API for both schema and data
    // This is a fallback when WebSocket connection fails, not truly offline
    // All data is fetched securely via REST API endpoints
    const schemaPayload = await fetchModuleSchemaLocal(branchId, moduleId);
    const normalizedSchema = normalizeSchemaPayload(schemaPayload.schema, schemaPayload.moduleEntry, tables);
    const dataset = await fetchModuleDataset(branchId, moduleId);
    const offlineDb = createOfflineStore({
      branchId,
      moduleId,
      schema: normalizedSchema,
      tables: dataset?.tables || {},
      meta: dataset?.meta || {},
      logger,
      role
    });
    if (cause) {
      offlineDb.remoteError = cause;
    }
    return {
      db: offlineDb,
      schema: normalizedSchema,
      moduleEntry: schemaPayload.moduleEntry
    };
  }

  async function createPosDb(options = {}) {
    const branchId = options.branchId || 'dar';
    const moduleId = options.moduleId || 'pos';
    const tables = options.tables || DEFAULT_TABLES;
    try {
      return await createRemotePosDb({
        branchId,
        moduleId,
        tables,
        logger: options.logger,
        role: options.role,
        historyLimit: options.historyLimit,
        smartFetch: options.smartFetch
      });
    } catch (error) {
      const logger = options.logger || console;
      logger?.warn?.('[PosMiniDB] Falling back to offline dataset', error);
      return await createOfflinePosDb(
        { branchId, moduleId, tables, logger, role: options.role || 'pos-mini-offline', smartFetch: options.smartFetch },
        error
      );
    }
  }

  window.createPosDb = createPosDb;
})(typeof window !== 'undefined' ? window : this);
