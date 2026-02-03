
(async function () {
  // //console.log('═══════════════════════════════════════════════════════');
  //console.log('🚀🚀🚀 [POS V2] WEBSOCKET VERSION LOADED 🚀🚀🚀');
  // //console.log('═══════════════════════════════════════════════════════');

  const M = Mishkah;
  const UI = M.UI;
  const U = M.utils;
  const D = M.DSL;
  const Schema = M.schema;
  const MODULE_ENTRY = (typeof window !== 'undefined'
    && window.__POS_MODULE_ENTRY__
    && typeof window.__POS_MODULE_ENTRY__ === 'object')
    ? window.__POS_MODULE_ENTRY__
    : null;
  const { tw, token } = U.twcss;
  const BASE_PALETTE = U.twcss?.PALETTE || {};

  // ✅ CLAUDE FIX: Global flag to prevent duplicate saves
  let IS_SAVING_ORDER = false;

  const JSONX = U.JSON || {};
  const hasStructuredClone = typeof structuredClone === 'function';
  const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const normalizePinValue = (value) => {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    return digits.length ? digits : text;
  };
  const toBoolean = (value) => {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true'
        || normalized === '1'
        || normalized === 'yes'
        || normalized === 'y'
        || normalized === 'on';
    }
    return false;
  };
  const normalizeEmployeeRecord = (source, index = 0) => {
    if (!source || typeof source !== 'object') return null;
    const pinSource = source.pin_code || source.pin || source.pinCode;
    const normalizedPin = normalizePinValue(pinSource);
    if (!normalizedPin) return null;
    const idRaw = source.id || source.employee_id || source.employeeId;
    const nameRaw = source.full_name || source.fullName || source.name;
    const roleRaw = source.role || source.position;
    const discountRaw = source.allowed_discount_rate || source.allowedDiscountRate || 0;
    const discountValue = Number.parseFloat(discountRaw);
    // If discount rate is stored as decimal (0.1 for 10%), convert to percentage
    const discountRate = Number.isFinite(discountValue) && discountValue > 0 && discountValue < 1
      ? discountValue * 100
      : (Number.isFinite(discountValue) ? discountValue : 0);
    const normalized = {
      id: (idRaw != null ? String(idRaw).trim() : '') || `emp-${normalizedPin}-${index + 1}`,
      name: (nameRaw != null ? String(nameRaw).trim() : '') || `موظف ${index + 1}`,
      role: (roleRaw != null ? String(roleRaw).trim() : '') || 'staff',
      pin: normalizedPin,
      allowedDiscountRate: discountRate
    };
    if (toBoolean(source.is_fallback || source.isFallback || source.fallback)) {
      normalized.isFallback = true;
    }
    return normalized;
  };
  const normalizeEmployeesList = (list, options = {}) => {
    const dedupeByPin = options.dedupeByPin !== false;
    const entries = Array.isArray(list) ? list : [];
    const normalized = [];
    const seenKeys = new Set();
    entries.forEach((entry, index) => {
      const record = normalizeEmployeeRecord(entry, index);
      if (!record) return;
      const keys = [];
      if (record.id) keys.push(`id:${String(record.id).toLowerCase()}`);
      if (dedupeByPin && record.pin) keys.push(`pin:${record.pin}`);
      if (keys.some(key => seenKeys.has(key))) return;
      keys.forEach(key => seenKeys.add(key));
      normalized.push(record);
    });
    return normalized;
  };
  const toTimestamp = (value) => {
    if (value == null) return Date.now();
    if (typeof value === 'number') return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  };
  const toIsoString = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && value.includes('T')) return value;
    const ts = toTimestamp(value);
    return new Date(ts).toISOString();
  };
  const cloneDeep = (value) => {
    if (value == null) return value;
    if (JSONX && typeof JSONX.clone === 'function') return JSONX.clone(value);
    if (hasStructuredClone) {
      try { return structuredClone(value); } catch (_err) { }
    }
    try { return JSON.parse(JSON.stringify(value)); } catch (_err) {
      if (Array.isArray(value)) return value.slice();
      if (isPlainObject(value)) return { ...value };
      return value;
    }
  };
  const mergePreferRemote = (base, patch) => {
    if (patch === undefined) return cloneDeep(base);
    if (patch === null) return null;
    if (Array.isArray(patch)) return patch.map(entry => cloneDeep(entry));
    if (isPlainObject(patch)) {
      const baseObj = isPlainObject(base) ? base : {};
      const target = cloneDeep(baseObj);
      Object.keys(patch).forEach(key => {
        target[key] = mergePreferRemote(baseObj[key], patch[key]);
      });
      return target;
    }
    return cloneDeep(patch);
  };
  const JSONISH_FIX_KEYS = /([,{]\s*)([A-Za-z0-9_]+)\s*:/g;
  const JSON_PARSE_FAIL = Symbol('json:fail');
  const tryParseJson = (value) => {
    if (typeof value !== 'string') return JSON_PARSE_FAIL;
    if (JSONX && typeof JSONX.parseSafe === 'function') {
      return JSONX.parseSafe(value, JSON_PARSE_FAIL);
    }
    try { return JSON.parse(value); } catch (_err) { return JSON_PARSE_FAIL; }
  };
  const parseMaybeJSONish = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const candidates = [trimmed];
    if (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed.includes(':')) {
      let normalized = trimmed;
      if (!normalized.startsWith('{')) normalized = `{${normalized}`;
      if (!normalized.endsWith('}') && normalized.includes(':')) normalized = `${normalized}}`;
      candidates.push(normalized);
    }
    for (const candidate of candidates) {
      const direct = tryParseJson(candidate);
      if (direct !== JSON_PARSE_FAIL) return direct;
      const first = candidate[0];
      const last = candidate[candidate.length - 1];
      const looksStructured = (first === '{' && last === '}') || (first === '[' && last === ']');
      if (!looksStructured) continue;
      const sanitized = candidate
        .replace(JSONISH_FIX_KEYS, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1');
      const parsed = tryParseJson(sanitized);
      if (parsed !== JSON_PARSE_FAIL) return parsed;
    }
    return value;
  };
  const topicSnapshots = new Map();
  const cloneForTopic = (value) => cloneDeep(value);
  const resolveTopicPayload = (topic, payload) => {
    if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
      const simpleClone = cloneForTopic(payload);
      if (topic) topicSnapshots.set(topic, simpleClone);
      return simpleClone;
    }
    if (payload.mode === 'snapshot') {
      const snapshot = cloneForTopic(payload.snapshot);
      if (topic) topicSnapshots.set(topic, snapshot);
      return snapshot;
    }
    if (payload.mode === 'delta') {
      const base = topic && topicSnapshots.has(topic) ? cloneDeep(topicSnapshots.get(topic)) : {};
      const working = isPlainObject(base) ? base : {};
      const removals = Array.isArray(payload.remove) ? payload.remove : [];
      removals.forEach((key) => { if (key != null) delete working[key]; });
      if (isPlainObject(payload.set)) {
        Object.keys(payload.set).forEach((key) => {
          working[key] = cloneForTopic(payload.set[key]);
        });
      }
      if (topic) topicSnapshots.set(topic, working);
      return working;
    }
    const fallback = cloneForTopic(payload);
    if (topic) topicSnapshots.set(topic, fallback);
    return fallback;
  };
  const ensureLocaleObject = (value, fallback) => {
    const parsed = parseMaybeJSONish(value);
    const locale = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.keys(parsed).forEach(key => {
        const rawKey = key.toLowerCase();
        const normalizedKey = rawKey.startsWith('ar') ? 'ar'
          : rawKey.startsWith('en') ? 'en'
            : rawKey;
        const entryValue = parsed[key];
        if (entryValue == null) return;
        locale[normalizedKey] = typeof entryValue === 'string' ? entryValue : String(entryValue);
      });
    } else if (typeof parsed === 'string' && parsed.trim()) {
      const text = parsed.trim();
      locale.ar = text;
      locale.en = text;
    }
    if (!locale.en && locale.ar) locale.en = locale.ar;
    if (!locale.ar && locale.en) locale.ar = locale.en;
    if (Object.keys(locale).length) return locale;
    if (!fallback) return {};
    const clonedFallback = {};
    Object.keys(fallback).forEach(key => {
      if (fallback[key] == null) return;
      clonedFallback[key] = typeof fallback[key] === 'string' ? fallback[key] : String(fallback[key]);
    });
    if (!clonedFallback.en && clonedFallback.ar) clonedFallback.en = clonedFallback.ar;
    if (!clonedFallback.ar && clonedFallback.en) clonedFallback.ar = clonedFallback.en;
    return clonedFallback;
  };
  const ensurePlainObject = (value) => {
    const parsed = parseMaybeJSONish(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  };
  const pickArray = (...candidates) => {
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length) return candidate.slice();
    }
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate.slice();
    }
    return [];
  };
  const normalizeChannelName = (value, fallback = 'default') => {
    const base = value == null ? '' : String(value).trim();
    const raw = base || fallback || 'default';
    return raw.replace(/[^A-Za-z0-9:_-]+/g, '-').toLowerCase();
  };
  const coerceArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.list)) return value.list;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.values)) return value.values;
    if (Array.isArray(value.records)) return value.records;
    return [];
  };
  const TABLE_ALIAS_GROUPS = {
    dataset: { canonical: 'pos_database', aliases: ['pos_dataset', 'pos_data', 'dataset', 'pos_snapshot'] },
    // ✅ UNIFIED: Removed aliases - use canonical names only
    orderHeader: {
      canonical: 'order_header',
      aliases: []  // ✅ Removed: ['orders','order_headers','orderHeader','order_header_live','pos_order_header','pos_orders']
    },
    orderLine: {
      canonical: 'order_line',
      aliases: []  // ✅ Removed: ['order_lines','order_line_items','orderLineItems','orderDetails','order_items','orderLines']
    },
    orderPayment: {
      canonical: 'order_payment',
      aliases: []  // ✅ Removed: ['order_payments','payments','orderPayments','payment_transactions']
    },
    orderLineModifier: {
      canonical: 'order_line_modifier',
      aliases: ['order_line_modifiers', 'orderModifiers', 'order_line_addons', 'orderLines_modifier', 'orderLines_modifiers']
    },
    orderStatusLog: { canonical: 'order_status_log', aliases: ['order_status_history', 'orderStatusHistory'] },
    orderLineStatusLog: {
      canonical: 'order_line_status_log',
      aliases: ['order_line_status_history', 'line_status_history', 'orderLines_status_log', 'orderLines_status_history']
    },
    posShift: { canonical: 'pos_shift', aliases: ['pos_shifts', 'shifts', 'shift_header', 'shiftHeaders'] },
    // ✅ UNIFIED: Removed aliases - use canonical names only
    jobOrderHeader: {
      canonical: 'job_order_header',
      aliases: []  // ✅ Removed: ['job_orders','job_order_headers','production_orders','production_order_header','jobOrders']
    },
    jobOrderDetail: {
      canonical: 'job_order_detail',
      aliases: []  // ✅ Removed: ['job_order_details','jobOrderDetails','production_order_detail']
    },
    jobOrderDetailModifier: {
      canonical: 'job_order_detail_modifier',
      aliases: []  // ✅ Removed: ['job_order_modifiers','jobOrderModifiers']
    },
    jobOrderStatusHistory: {
      canonical: 'job_order_status_history',
      aliases: []  // ✅ Removed: ['job_order_status_log','jobStatusHistory']
    },
    expoPassTicket: { canonical: 'expo_pass_ticket', aliases: ['expo_pass_tickets', 'expo_tickets', 'expoPassTickets'] },
    kitchenSection: { canonical: 'kitchen_section', aliases: ['kitchen_sections', 'kitchenStations'] },
    diningTable: { canonical: 'dining_tables', aliases: ['tables', 'dining_tables', 'restaurant_tables'] },
    tableLock: { canonical: 'table_lock', aliases: ['table_locks', 'locks', 'tableLocks'] },
    customerProfile: { canonical: 'customer_profile', aliases: ['customer_profiles', 'customers', 'customerProfiles'] },
    customerAddress: { canonical: 'customer_address', aliases: ['customer_addresses', 'addresses', 'customerAddresses'] }
  };
  const canonicalizeTableName = (name) => {
    if (name == null) return null;
    const text = String(name).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const descriptor of Object.values(TABLE_ALIAS_GROUPS)) {
      const candidates = [descriptor.canonical, ...(descriptor.aliases || [])];
      if (candidates.some(candidate => typeof candidate === 'string' && candidate.toLowerCase() === lower)) {
        return descriptor.canonical;
      }
    }
    return text;
  };
  const collectTableNamesFromList = (list) => {
    const names = new Set();
    const push = (value) => {
      if (!value) return;
      const text = String(value).trim();
      if (text) names.add(text);
    };
    const visitEntry = (entry) => {
      if (!entry) return;
      if (typeof entry === 'string') { push(entry); return; }
      if (typeof entry === 'object') {
        push(entry.name);
        push(entry.table);
        push(entry.tableName);
        push(entry.sqlName);
        if (Array.isArray(entry.aliases)) entry.aliases.forEach(push);
        if (Array.isArray(entry.synonyms)) entry.synonyms.forEach(push);
      }
    };
    (Array.isArray(list) ? list : []).forEach(visitEntry);
    return names;
  };
  const collectSchemaTableNames = (schemaSource) => {
    const names = new Set();
    if (!schemaSource || typeof schemaSource !== 'object') return names;
    collectTableNamesFromList(schemaSource.tables).forEach(name => names.add(name));
    if (schemaSource.schema && typeof schemaSource.schema === 'object') {
      collectTableNamesFromList(schemaSource.schema.tables).forEach(name => names.add(name));
      if (schemaSource.schema.schema && typeof schemaSource.schema.schema === 'object') {
        collectTableNamesFromList(schemaSource.schema.schema.tables).forEach(name => names.add(name));
      }
    }
    return names;
  };
  const collectModuleTableNames = (entry) => {
    if (!entry || typeof entry !== 'object') return new Set();
    const names = new Set();
    collectTableNamesFromList(entry.tables).forEach(name => names.add(name));
    if (entry.schema && typeof entry.schema === 'object') {
      collectTableNamesFromList(entry.schema.tables).forEach(name => names.add(name));
      if (entry.schema.schema && typeof entry.schema.schema === 'object') {
        collectTableNamesFromList(entry.schema.schema.tables).forEach(name => names.add(name));
      }
    }
    return names;
  };
  const ensurePosTableAliases = (dbInstance, schemaSource, moduleEntry) => {
    const handles = {};
    if (!dbInstance || typeof dbInstance !== 'object') return handles;
    const register = typeof dbInstance.register === 'function' ? dbInstance.register.bind(dbInstance) : null;
    const configObjects = dbInstance.config && typeof dbInstance.config === 'object'
      ? (dbInstance.config.objects || {})
      : {};
    const knownNames = new Set(Object.keys(configObjects));
    const schemaNames = collectSchemaTableNames(schemaSource || {});
    const moduleNames = collectModuleTableNames(moduleEntry || {});
    const allKnown = new Set([...schemaNames, ...moduleNames]);
    const getOptions = (descriptor) => {
      const options = new Set();
      options.add(descriptor.canonical);
      (descriptor.aliases || []).forEach(alias => { if (alias) options.add(String(alias)); });
      allKnown.forEach(name => {
        if (canonicalizeTableName(name) === descriptor.canonical) options.add(name);
      });
      return Array.from(options);
    };
    const findCaseInsensitive = (options) => {
      for (const option of options) {
        const lower = String(option).toLowerCase();
        const match = Array.from(knownNames).find(candidate => candidate.toLowerCase() === lower);
        if (match) return match;
      }
      return null;
    };
    Object.values(TABLE_ALIAS_GROUPS).forEach(descriptor => {
      const options = getOptions(descriptor);
      let matched = options.find(option => knownNames.has(option)) || findCaseInsensitive(options);
      if (matched && matched !== descriptor.canonical && register && !knownNames.has(descriptor.canonical)) {
        const sourceTable = configObjects[matched]?.table || matched;
        try {
          register(descriptor.canonical, { table: sourceTable });
          knownNames.add(descriptor.canonical);
          matched = descriptor.canonical;
        } catch (_err) {
          // Ignore registration failure and keep using the discovered table name.
        }
      } else if (!matched && register) {
        const fallback = options.find(option => option && option !== descriptor.canonical);
        const sourceTable = fallback || descriptor.canonical;
        try {
          register(descriptor.canonical, { table: sourceTable });
          knownNames.add(descriptor.canonical);
          matched = descriptor.canonical;
        } catch (_err) {
          matched = descriptor.canonical;
        }
      } else if (!matched) {
        matched = descriptor.canonical;
      }
      handles[descriptor.canonical] = matched;
    });
    return handles;
  };
  const EMPLOYEE_KEYS = ['employees', 'staff', 'pos_employees', 'pos_staff', 'employee_profiles', 'employee_profile', 'employeeProfile', 'employees_list', 'employeesList', 'cashiers'];
  const resolveEmployeeList = (source) => {
    if (!source || typeof source !== 'object') return [];
    for (const key of EMPLOYEE_KEYS) {
      const direct = source[key] || source.settings?.[key];
      const arr = coerceArray(direct);
      if (arr.length) return arr;
    }
    const seen = new WeakSet();
    const queue = [];
    if (source && typeof source === 'object') { seen.add(source); queue.push({ value: source, depth: 0 }); }
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (depth > 3) continue;
      if (Array.isArray(value)) {
        const entries = value.filter(item => item && typeof item === 'object');
        if (entries.length && entries.some(item => ('pin' in item) || ('pin_code' in item) || ('pinCode' in item) || ('passcode' in item))) {
          return entries;
        }
        continue;
      }
      if (value && typeof value === 'object') {
        const maybe = value.employees || value.staff || value.cashiers;
        const arr = coerceArray(maybe);
        if (arr.length && arr.some(item => item && typeof item === 'object' && (item.pin != null || item.pin_code != null || item.pinCode != null || item.passcode != null))) {
          return arr;
        }
        Object.values(value).forEach(child => {
          if (child && typeof child === 'object' && !seen.has(child)) {
            seen.add(child);
            queue.push({ value: child, depth: depth + 1 });
          }
        });
      }
    }
    return [];
  };
  const SHIFT_SETTINGS_KEYS = ['shift_settings', 'shiftSettings', 'pos_shift_settings', 'shift_config', 'shiftConfig', 'pos_shift_config', 'shift'];
  const resolveShiftSettings = (source) => {
    const inspect = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const hasPin = candidate.pin != null || candidate.pin_code != null || candidate.pinCode != null || candidate.default_pin != null;
      const hasOpening = candidate.opening_float != null || candidate.openingFloat != null;
      const hasLength = candidate.pin_length != null || candidate.pinLength != null;
      return (hasPin || hasOpening || hasLength) ? candidate : null;
    };
    if (!source || typeof source !== 'object') return {};
    for (const key of SHIFT_SETTINGS_KEYS) {
      const direct = source[key] || source.settings?.[key];
      const resolved = inspect(direct);
      if (resolved) return resolved;
    }
    const seen = new WeakSet();
    const queue = [];
    seen.add(source);
    queue.push({ value: source, depth: 0 });
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (depth > 3) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const resolved = inspect(value);
        if (resolved) return resolved;
        Object.values(value).forEach(child => {
          if (child && typeof child === 'object' && !seen.has(child)) {
            seen.add(child);
            queue.push({ value: child, depth: depth + 1 });
          }
        });
      }
    }
    return {};
  };
  const firstFiniteNumber = (...values) => {
    for (const candidate of values) {
      if (candidate == null) continue;
      const number = Number(candidate);
      if (Number.isFinite(number)) return number;
    }
    return null;
  };
  const DEFAULT_PAYMENT_METHODS_SOURCE = [
    { id: 'cash', icon: '💵', name: { ar: 'نقدي', en: 'Cash' }, type: 'cash' },
    { id: 'card', icon: '💳', name: { ar: 'بطاقة', en: 'Card' }, type: 'card' }
  ];
  const sanitizePaymentMethod = (method = {}) => {
    const fallbackName = method.name || method.label || {};
    const idSource = method.id || method.code || fallbackName?.en || fallbackName?.ar || method.type || 'cash';
    const id = String(idSource || 'cash').trim() || 'cash';
    const label = ensureLocaleObject(method.name || method.label, { ar: id, en: id });
    return {
      ...method,
      id,
      code: method.code || id,
      icon: method.icon || '💳',
      type: method.type || method.payment_type || 'other',
      label,
      name: label
    };
  };
  const derivePaymentMethods = (source) => {
    const list = Array.isArray(source?.payment_methods) && source.payment_methods.length
      ? source.payment_methods
      : DEFAULT_PAYMENT_METHODS_SOURCE;
    return list.map(sanitizePaymentMethod);
  };
  const snapshotRemoteStatus = (status) => ({
    status: status?.status || 'idle',
    error: status?.error ? (status.error.message || String(status.error)) : null,
    startedAt: status?.startedAt || null,
    finishedAt: status?.finishedAt || null,
    keys: Array.isArray(status?.keys) ? status.keys.slice() : []
  });
  const MOCK_BASE = cloneDeep(typeof window !== 'undefined' ? (window.database || {}) : {});
  let MOCK = cloneDeep(MOCK_BASE);
  let PAYMENT_METHODS = derivePaymentMethods(MOCK);
  const initialDataStatus = typeof window !== 'undefined' ? (window.__POS_DATA_STATUS__ || {}) : {};
  const remoteStatus = {
    status: initialDataStatus.status || (Object.keys(MOCK).length ? 'ready' : 'idle'),
    error: initialDataStatus.error || null,
    startedAt: initialDataStatus.startedAt || (Object.keys(MOCK).length ? Date.now() : null),
    finishedAt: initialDataStatus.finishedAt || null,
    keys: Array.isArray(initialDataStatus.keys) && initialDataStatus.keys.length
      ? initialDataStatus.keys.slice()
      : Object.keys(MOCK || {})
  };
  if (remoteStatus.status === 'ready' && !remoteStatus.finishedAt) {
    remoteStatus.finishedAt = remoteStatus.startedAt || Date.now();
  }
  const initialRemoteSnapshot = snapshotRemoteStatus(remoteStatus);
  let appRef = null;
  const settings = MOCK.settings || {};
  const currencyConfig = settings.currency || {};
  const rawPosConfig = settings.pos || settings.pos_info || settings.posInfo || {};
  const fallbackPosId = typeof rawPosConfig.id === 'string' ? rawPosConfig.id
    : typeof rawPosConfig.code === 'string' ? rawPosConfig.code
      : typeof rawPosConfig.prefix === 'string' ? rawPosConfig.prefix
        : 'P001';
  const posId = String(fallbackPosId || 'P001').toUpperCase();
  const posNumberRaw = rawPosConfig.number ?? rawPosConfig.index ?? 1;
  const posNumber = Number.isFinite(Number(posNumberRaw)) ? Number(posNumberRaw) : 1;
  const posLabel = rawPosConfig.label || rawPosConfig.name || `POS ${posNumber}`;
  const posPrefix = rawPosConfig.prefix || posId;
  const POS_INFO = { id: posId, number: posNumber, label: posLabel, prefix: String(posPrefix || posId) };
  const SHIFT_TABLE = Schema.defineTable({
    name: 'pos_shift',
    label: 'POS Shift Session',
    comment: 'Lifecycle of a POS cashier shift bound to orders and payments.',
    fields: [
      { name: 'id', columnName: 'shift_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64, comment: 'Unique shift identifier composed of POS id and encoded timestamp.' },
      { name: 'posId', columnName: 'pos_id', type: 'string', nullable: false, maxLength: 32, comment: 'Terminal identifier hosting the shift.' },
      { name: 'posLabel', columnName: 'pos_label', type: 'string', nullable: false, maxLength: 96, comment: 'Friendly terminal label for reports.' },
      { name: 'posNumber', columnName: 'pos_number', type: 'integer', nullable: false, comment: 'Numeric terminal number for invoice sequencing.' },
      { name: 'openedAt', columnName: 'opened_at', type: 'timestamp', nullable: false, comment: 'Shift opening timestamp.' },
      { name: 'closedAt', columnName: 'closed_at', type: 'timestamp', nullable: true, comment: 'Shift closing timestamp.' },
      { name: 'openingFloat', columnName: 'opening_float', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0, comment: 'Opening cash float captured when the shift starts.' },
      { name: 'closingCash', columnName: 'closing_cash', type: 'decimal', precision: 12, scale: 2, nullable: true, comment: 'Closing cash drawer balance.' },
      { name: 'cashierId', columnName: 'cashier_id', type: 'string', nullable: false, maxLength: 64, comment: 'Employee identifier operating the shift.' },
      { name: 'cashierName', columnName: 'cashier_name', type: 'string', nullable: false, maxLength: 128, comment: 'Display name of the cashier.' },
      { name: 'cashierRole', columnName: 'cashier_role', type: 'string', nullable: false, defaultValue: 'cashier', comment: 'Role assigned to the cashier during the shift.' },
      { name: 'employeeId', columnName: 'employee_id', type: 'string', nullable: false, maxLength: 64, comment: 'Employee id linked to payroll records.' },
      { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'open', comment: 'Shift lifecycle state.' },
      { name: 'isClosed', columnName: 'is_closed', type: 'boolean', nullable: false, defaultValue: false, comment: 'Flag signalling whether the shift is closed.' },
      { name: 'totalsByType', columnName: 'totals_by_type', type: 'json', nullable: false, defaultValue: () => ({}), comment: 'Aggregated sales totals grouped by order type.' },
      { name: 'paymentsByMethod', columnName: 'payments_by_method', type: 'json', nullable: false, defaultValue: () => ({}), comment: 'Aggregated payments grouped by method.' },
      { name: 'countsByType', columnName: 'counts_by_type', type: 'json', nullable: false, defaultValue: () => ({}), comment: 'Order counts grouped by type.' },
      { name: 'ordersCount', columnName: 'orders_count', type: 'integer', nullable: false, defaultValue: 0, comment: 'Number of orders captured during the shift.' },
      { name: 'orders', columnName: 'orders_payload', type: 'json', nullable: false, defaultValue: () => ([]), comment: 'Optional persisted snapshot for audit or offline sync.' },
      { name: 'totalSales', columnName: 'total_sales', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0, comment: 'Total sales amount for the shift.' }
    ],
    indexes: [
      { name: 'idx_pos_shift_pos_status', columns: ['pos_id', 'is_closed', 'opened_at'] },
      { name: 'idx_pos_shift_opened_at', columns: ['opened_at'] }
    ]
  });
  const SHIFT_SCHEMA_REGISTRY = new Schema.Registry({ tables: [SHIFT_TABLE] });
  let POS_SCHEMA_SOURCE = SHIFT_SCHEMA_REGISTRY.toJSON();
  let POS_SCHEMA_REGISTRY = Schema.Registry.fromJSON(POS_SCHEMA_SOURCE);
  const REMOTE_DB = (typeof window !== 'undefined'
    && window.__POS_DB__
    && typeof window.__POS_DB__ === 'object')
    ? window.__POS_DB__
    : null;
  let POS_TABLE_HANDLES = ensurePosTableAliases(REMOTE_DB, POS_SCHEMA_SOURCE, MODULE_ENTRY);

  async function fetchPosSchemaFromBackend() {
    const branchId = typeof window !== 'undefined' ? (window.__POS_BRANCH_ID__ || 'dar') : 'dar';
    const url = window.basedomain + '/api/schema?branch=' + encodeURIComponent(branchId) + '&module=pos';
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const body = await res.json().catch(() => null);
      const schemaJson = body?.schema || body?.data || body;
      if (schemaJson && typeof schemaJson === 'object') {
        POS_SCHEMA_SOURCE = schemaJson;
        POS_SCHEMA_REGISTRY = Schema.Registry.fromJSON(POS_SCHEMA_SOURCE);
        POS_TABLE_HANDLES = ensurePosTableAliases(REMOTE_DB, POS_SCHEMA_SOURCE, MODULE_ENTRY);
        DATASET_PAYLOAD_KEY_CACHE.clear();
      }
    } catch (_err) { }
  }
  const FALLBACK_CURRENCY = 'EGP';
  const normalizeCurrencyCode = (value) => {
    if (typeof value !== 'string') return null;
    const upper = value.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(upper) ? upper : null;
  };
  const currencyCode = normalizeCurrencyCode(currencyConfig.code)
    || normalizeCurrencyCode(currencyConfig.default)
    || FALLBACK_CURRENCY;
  const baseSymbols = typeof currencyConfig.symbols === 'object' && currencyConfig.symbols ? currencyConfig.symbols : {};
  const currencySymbols = {
    ar: currencyConfig.ar || baseSymbols.ar || baseSymbols['ar-EG'] || 'ج.م',
    en: currencyConfig.en || baseSymbols.en || baseSymbols['en-GB'] || 'E£',
    ...baseSymbols
  };
  if (!currencySymbols.en) currencySymbols.en = currencyCode;
  if (!currencySymbols.ar) currencySymbols.ar = currencySymbols.en;
  const currencyDisplayMode = currencyConfig.display || 'symbol';
  const syncSettings = ensurePlainObject(settings.sync);
  const branchSettings = ensurePlainObject(settings.branch);
  const DEFAULT_BRANCH_CHANNEL = 'branch-main'; // غيّر هذه القيمة لتبديل قناة POS وKDS معًا.
  const branchChannelSource = syncSettings.channel
    || syncSettings.branch_channel
    || syncSettings.branchChannel
    || branchSettings.channel
    || branchSettings.branchChannel
    || DEFAULT_BRANCH_CHANNEL;
  const BRANCH_CHANNEL = normalizeChannelName(branchChannelSource, DEFAULT_BRANCH_CHANNEL);
  if (typeof window !== 'undefined') {
    window.MishkahBranchChannel = BRANCH_CHANNEL;
  }

  const ORDER_TYPE_ICON_MAP = { dine_in: '🍽️', delivery: '🚚', takeaway: '🧾', cash: '🧾' };
  const rawOrderTypes = Array.isArray(MOCK.order_types) && MOCK.order_types.length ? MOCK.order_types : [
    { id: 'dine_in', type_name: { ar: 'صالة', en: 'Dine-in' }, allows_save: true, allows_finalize_later: true, allows_line_additions: true, allows_returns: true, workflow: 'multi-step' },
    { id: 'delivery', type_name: { ar: 'دليفري', en: 'Delivery' }, allows_save: false, allows_finalize_later: false, allows_line_additions: false, allows_returns: false, workflow: 'single-step' },
    { id: 'takeaway', type_name: { ar: 'تيك أواي', en: 'Takeaway' }, allows_save: true, allows_finalize_later: false, allows_line_additions: false, allows_returns: false, workflow: 'single-step' }
  ];
  const ORDER_TYPES = rawOrderTypes.map(type => ({
    id: type.id,
    icon: ORDER_TYPE_ICON_MAP[type.id] || '🧾',
    workflow: type.workflow || 'single-step',
    allowsSave: type.id === 'takeaway' ? true : type.allows_save !== false,
    allowsFinalizeLater: !!type.allows_finalize_later,
    allowsLineAdditions: !!type.allows_line_additions,
    allowsReturns: !!type.allows_returns,
    label: {
      ar: type.type_name?.ar || type.id,
      en: type.type_name?.en || type.id
    }
  }));
  const ORDER_TYPE_IDS = new Set(ORDER_TYPES.map(type => type.id));

  const clonePaymentMethods = (methods) => cloneDeep(methods || []);

  const CAIRO_DISTRICTS = [
    { id: 'heliopolis', ar: 'هليوبوليس', en: 'Heliopolis' },
    { id: 'nasr_city', ar: 'مدينة نصر', en: 'Nasr City' },
    { id: 'maadi', ar: 'المعادي', en: 'Maadi' },
    { id: 'zamalek', ar: 'الزمالك', en: 'Zamalek' },
    { id: 'dokki', ar: 'الدقي', en: 'Dokki' },
    { id: 'mohandeseen', ar: 'المهندسين', en: 'Mohandeseen' },
    { id: 'garden_city', ar: 'جاردن سيتي', en: 'Garden City' },
    { id: 'shoubra', ar: 'شبرا', en: 'Shoubra' },
    { id: 'rehab', ar: 'الرحاب', en: 'Al Rehab' },
    { id: 'fifth_settlement', ar: 'التجمع الخامس', en: 'Fifth Settlement' },
    { id: 'october', ar: '٦ أكتوبر', en: '6th of October' }
  ];

  const SHIFT_SETTINGS = resolveShiftSettings(MOCK);
  const SHIFT_PIN_FALLBACK_RAW = typeof SHIFT_SETTINGS.pin === 'string'
    ? SHIFT_SETTINGS.pin
    : (typeof SHIFT_SETTINGS.default_pin === 'string' ? SHIFT_SETTINGS.default_pin : '');
  const SHIFT_PIN_FALLBACK = normalizePinValue(SHIFT_PIN_FALLBACK_RAW);
  let SHIFT_PIN_LENGTH = Number(SHIFT_SETTINGS.pin_length || SHIFT_SETTINGS.pinLength || (SHIFT_PIN_FALLBACK ? SHIFT_PIN_FALLBACK.length : 0)) || (SHIFT_PIN_FALLBACK ? SHIFT_PIN_FALLBACK.length : 0);
  if (!SHIFT_PIN_LENGTH || SHIFT_PIN_LENGTH < 4) {
    const fallbackLength = SHIFT_PIN_FALLBACK ? SHIFT_PIN_FALLBACK.length : 0;
    SHIFT_PIN_LENGTH = fallbackLength > 4 ? fallbackLength : 4;
  }
  const SHIFT_OPEN_FLOAT_DEFAULT = Number(SHIFT_SETTINGS.opening_float ?? SHIFT_SETTINGS.openingFloat ?? 0);

  const TEXTS = {
    ar: {
      ui: {
        shift: 'الوردية', cashier: 'الكاشير', dine_in: 'صالة', delivery: 'توصيل', takeaway: 'تيك أواي', cashier_mode: 'كاشير',
        search: 'ابحث في المنيو', favorites: 'المفضلة', favorites_only: 'المفضلة فقط', categories: 'التصنيفات', load_more: 'عرض المزيد',
        menu_loading: 'جاري تحميل القائمة الحية…', menu_loading_hint: 'نقوم بجلب الأصناف من النظام المركزي. يمكنك الاستمرار بالبيانات الحالية مؤقتًا.',
        menu_load_error: 'تعذر تحديث القائمة الحية، يتم استخدام البيانات المخزنة.', menu_load_error_short: 'تعذر التحديث',
        menu_live_badge: 'القائمة الحية', menu_last_updated: 'آخر تحديث', menu_load_success: 'تم تحديث القائمة بنجاح.',
        indexeddb: 'قاعدة البيانات المحلية', last_sync: 'آخر مزامنة', never_synced: 'لم تتم', sync_now: 'مزامنة الآن',
        subtotal: 'الإجمالي الفرعي', service: 'خدمة', vat: 'ضريبة', discount: 'خصم', delivery_fee: 'رسوم التوصيل', total: 'الإجمالي المستحق',
        cart_empty: 'لم يتم إضافة أصناف بعد', choose_items: 'اختر صنفًا من القائمة لإضافته إلى الطلب.', tables: 'الطاولات',
        select_table: 'اختر طاولة لإسناد الطلب', table_status: 'حالة الطاولة', table_available: 'متاحة', table_occupied: 'مشغولة',
        table_reserved: 'محجوزة', table_maintenance: 'صيانة', payments: 'المدفوعات', split_payments: 'تقسيم الدفعات', recorded_payments: 'الدفعات المسجلة', paid: 'المدفوع',
        remaining: 'المتبقي', open_payments: 'تسجيل دفعة', open_reports: 'فتح التقارير', reports: 'التقارير', orders_count: 'عدد الطلبات',
        shift_open: 'فتح وردية', shift_close: 'إغلاق الوردية', shift_summary: 'ملخص الوردية', shift_open_prompt: 'أدخل الرقم السري لفتح الوردية',
        shift_cash_start: 'رصيد أول المدة', shift_cash_end: 'رصيد آخر المدة', shift_total_sales: 'إجمالي المبيعات',
        shift_total_dine_in: 'إجمالي طلبات الصالة', shift_total_takeaway: 'إجمالي طلبات التيك أواي', shift_total_delivery: 'إجمالي طلبات التوصيل',
        shift_payments: 'تحصيلات الوردية', shift_history: 'سجل الورديات', shift_history_empty: 'لا يوجد سجل ورديات بعد',
        shift_close_confirm: 'إنهاء وإغلاق الوردية', shift_current: 'الوردية الحالية', shift_select_history: 'اختيار وردية سابقة',
        shift_open_button: '🔓 فتح وردية', shift_close_button: '🔒 إغلاق وردية', shift_orders_count: 'عدد الطلبات في الوردية',
        shift_cash_summary: 'ملخص النقدية', shift_cash_collected: 'إجمالي النقدي خلال الوردية',
        settings_center: 'إعدادات الواجهة', settings_theme: 'تخصيص الثيم', settings_light: 'وضع نهاري', settings_dark: 'وضع ليلي',
        settings_colors: 'لوحة الألوان', settings_fonts: 'الخطوط', settings_color_background: 'لون الخلفية', settings_color_foreground: 'لون النص',
        settings_color_primary: 'اللون الرئيسي', settings_color_accent: 'لون التمييز', settings_color_muted: 'لون ثانوي',
        settings_font_base: 'حجم الخط الأساسي', settings_reset: 'إعادة الضبط الافتراضي',
        refunds: 'رد المدفوعات', returns: 'المرتجعات',
        order_nav_label: 'التنقل بين الفواتير', order_nav_open: 'اذهب إلى فاتورة', order_nav_placeholder: 'رقم الفاتورة أو الترتيب',
        order_nav_total: 'إجمالي الفواتير', order_nav_no_history: 'لا توجد فواتير محفوظة بعد',
        customer_center: 'مركز العملاء', customer_search: 'ابحث عن عميل', customer_search_placeholder: 'الاسم أو رقم الهاتف',
        customer_tab_search: 'بحث', customer_tab_create: 'تكويد جديد', customer_new: 'عميل جديد', customer_name: 'اسم العميل',
        customer_phones: 'أرقام الهاتف', customer_add_phone: 'إضافة رقم', customer_remove_phone: 'حذف', customer_addresses: 'عناوين العميل',
        customer_add_address: 'إضافة عنوان', customer_address_title: 'وصف العنوان', customer_address_line: 'تفاصيل العنوان',
        customer_address_notes: 'ملاحظات', customer_area: 'المنطقة السكنية', customer_attach: 'ربط بالطلب', customer_create: 'حفظ العميل',
        customer_no_results: 'لا يوجد عملاء مطابقون', customer_multi_phone_hint: 'يمكنك إضافة أكثر من رقم هاتف',
        customer_multi_address_hint: 'يمكنك إضافة أكثر من عنوان لنفس العميل', customer_keypad: 'لوحة الأرقام',
        customer_select_address: 'اختر العنوان', customer_required_delivery: 'مطلوب لطلبات التوصيل', customer_delivery_required: 'يرجى ربط طلب التوصيل بعميل وعنوان',
        customer_edit_action: 'تعديل البيانات', customer_use_existing: 'اختر من العملاء', customer_form_reset: 'إعادة تعيين',
        customer_edit: 'تعديل العميل', customer_remove_address: 'حذف العنوان',
        avg_ticket: 'متوسط الفاتورة', top_selling: 'الأكثر مبيعًا', sales_today: 'مبيعات اليوم', save_order: 'حفظ الطلب',
        settle_and_print: 'تحصيل وطباعة', finish_order: 'إنهاء الطلب', finish_and_print: 'إنهاء وطباعة', print: 'طباعة فقط', notes: 'ملاحظات', discount_action: 'خصم', clear: 'مسح', new_order: 'طلب جديد',
        balance_due: 'المتبقي غير المسدد', exchange_due: 'باقي الفكة',
        line_modifiers: 'الإضافات والمنزوعات', line_modifiers_title: 'تعديل الإضافات والمنزوعات', line_modifiers_addons: 'الإضافات', line_modifiers_removals: 'المنزوعات', line_modifiers_apply: 'تطبيق التعديلات', line_modifiers_empty: 'لا توجد خيارات متاحة', line_modifiers_free: 'بدون رسوم', line_modifiers_missing: 'السطر غير متاح', line_modifiers_unit: 'السعر للوحدة',
        amount: 'قيمة الدفعة', capture_payment: 'تأكيد الدفع', close: 'إغلاق', apply: 'تطبيق', theme: 'الثيم', light: 'نهاري', dark: 'ليلي', language: 'اللغة',
        discount_amount: 'مبلغ', discount_percent: 'نسبة %', discount_percent_hint: 'أدخل النسبة المئوية', discount_amount_hint: 'أدخل قيمة الخصم', remove_discount: 'إزالة الخصم',
        arabic: 'عربي', english: 'English', service_type: 'نوع الطلب', guests: 'عدد الأفراد', kds: 'نظام المطبخ (KDS)',
        status_online: 'متصل', status_offline: 'غير متصل', status_idle: 'انتظار', order_id: 'طلب', order_id_pending: 'مسودة', last_orders: 'الطلبات الأخيرة',
        connect_kds: 'اتصال', reconnect: 'إعادة الاتصال', print_size: 'مقاس الطباعة', thermal_80: 'حرارية 80مم', a5: 'A5', a4: 'A4',
        tables_manage: 'إدارة الطاولات', tables_assign: 'تخصيص الطاولات', table_lock: 'قفل الطاولة', table_unlock: 'فك القفل',
        table_locked: 'مقفلة', table_sessions: 'طلبات مرتبطة', table_no_sessions: 'لا توجد طلبات', table_add: 'إضافة طاولة',
        table_rename: 'تعديل الاسم', table_delete: 'حذف الطاولة', table_status_change: 'تغيير الحالة', table_status_inactive: 'معطلة',
        table_status_active: 'متاحة', table_status_reserved: 'محجوزة', table_status_maintenance: 'صيانة', table_manage_hint: 'اضغط على أي طاولة للإسناد أو استخدم أدوات الإدارة.',
        table_multi_orders: 'طلبات متعددة', print_profile: 'ملف الطباعة', table_confirm_unlock: 'هل تريد فك قفل الطاولة؟',
        table_confirm_remove: 'هل تريد حذف هذه الطاولة؟', table_confirm_release: 'هل تريد فك ارتباط الطلب بالطاولة؟',
        tables_filter_all: 'الكل', tables_filter_free: 'متاحة', tables_filter_single: 'مقفلة (طلب واحد)', tables_filter_multi: 'مقفلة (متعددة)',
        tables_filter_maintenance: 'صيانة', tables_search_placeholder: 'ابحث باسم أو رقم الطاولة', tables_details: 'تفاصيل الطاولة',
        tables_zone: 'منطقة', tables_capacity: 'سعة', tables_state_active: 'متاحة', tables_state_disactive: 'معطلة',
        tables_state_maintenance: 'صيانة', tables_state_free: 'حرة', tables_state_single: 'طلب واحد', tables_state_multi: 'طلبات متعددة',
        tables_unlock_all: 'فك الجميع', tables_unlock_single: 'فك عن هذا الطلب', tables_assign_to_order: 'إسناد للطلب الحالي',
        tables_remove_from_order: 'إزالة من الطلب الحالي', tables_orders_badge: 'طلبات', tables_reservations_badge: 'حجوزات',
        tables_actions: 'إجراءات الطاولة', tables_longpress_hint: 'اضغط مطولًا لعرض التفاصيل', tables_count_label: 'إجمالي الطاولات',
        reservations: 'الحجوزات', reservations_manage: 'إدارة الحجوزات', reservations_filter_all: 'الكل', reservations_filter_booked: 'محجوز',
        reservations_filter_seated: 'تم الجلوس', reservations_filter_completed: 'منتهٍ', reservations_filter_cancelled: 'ملغي',
        reservations_filter_noshow: 'لم يحضر', reservations_new: 'حجز جديد', reservations_edit: 'تعديل الحجز', reservations_customer: 'اسم العميل',
        reservations_phone: 'الهاتف', reservations_party_size: 'عدد الأفراد', reservations_time: 'وقت الحجز', reservations_hold_until: 'الانتظار حتى',
        reservations_tables: 'الطاولات المرتبطة', reservations_note: 'ملاحظات', reservations_status: 'الحالة',
        reservations_status_booked: 'محجوز', reservations_status_seated: 'تم الجلوس', reservations_status_no_show: 'لم يحضر',
        reservations_status_cancelled: 'ملغي', reservations_status_completed: 'مكتمل', reservations_convert: 'وصل العميل',
        reservations_no_show: 'لم يحضر', reservations_cancel_action: 'إلغاء', reservations_save: 'حفظ الحجز',
        reservations_conflict: 'يوجد تعارض في الوقت المحدد مع طاولة أخرى.', reservations_conflict_maintenance: 'أحد الطاولات في صيانة، يرجى اختيار طاولة مختلفة.',
        reservations_conflict_lock: 'الطاولة مرتبطة بطلب آخر.', reservations_tables_required: 'اختر طاولة واحدة على الأقل',
        reservations_list_empty: 'لا توجد حجوزات في هذا النطاق الزمني.', reservations_hold_label: 'سيتم الاحتفاظ حتى',
        tables_manage_log: 'سجل التعديلات', print_doc_customer: 'إيصال عميل', print_doc_summary: 'ملخص الطلب', print_doc_kitchen: 'إرسال للمطبخ',
        print_preview: 'معاينة', print_preview_expand: 'تكبير المعاينة', print_preview_collapse: 'تصغير المعاينة', print_send: 'إرسال للطابعة', print_save_profile: 'حفظ الإعدادات', print_header_store: 'اسم المتجر',
        print_header_address: 'العنوان', print_header_phone: 'الهاتف', print_footer_thanks: 'شكرًا لزيارتكم!',
        print_footer_policy: 'سياسة الاستبدال خلال 24 ساعة مع الإيصال.', print_footer_feedback: 'شاركنا رأيك',
        print_payments: 'المدفوعات', print_change_due: 'المتبقي للعميل', print_size_label: 'مقاس الطباعة',
        print_printer_default: 'الطابعة الافتراضية', print_printer_inside: 'طابعة الصالة / الداخل', print_printer_outside: 'طابعة التوصيل / الخارج',
        print_printer_placeholder: 'اكتب اسم الطابعة', print_printer_hint: 'يمكنك كتابة اسم الطابعة تمامًا كما يظهر في النظام.',
        print_printers_info: 'لا يستطيع المتصفح مشاركة أسماء الطابعات تلقائيًا بدون حوار الطباعة، لذا اختر الطابعة يدويًا لكل ملف.',
        print_copies: 'عدد النسخ', print_duplicate_inside: 'نسخة للداخل', print_duplicate_outside: 'نسخة للخارج',
        print_auto_send: 'إرسال مباشر للطابعة الحرارية', print_show_preview: 'عرض المعاينة قبل الطباعة',
        print_show_advanced: 'إظهار الإعدادات المتقدمة', print_hide_advanced: 'إخفاء الإعدادات المتقدمة',
        print_manage_printers: 'إدارة الطابعات', print_manage_hide: 'إخفاء إدارة الطابعات', print_manage_title: 'قائمة الطابعات المحفوظة',
        print_manage_add: 'إضافة طابعة', print_manage_placeholder: 'أدخل اسم الطابعة كما يظهر في النظام',
        print_manage_empty: 'لا توجد طابعات محفوظة بعد', print_browser_preview: 'طباعة عبر المتصفح',
        print_printer_select: 'اختر الطابعة للطباعة السريعة', print_printers_manage_hint: 'حدث قائمة الطابعات لتسهيل الوصول السريع.',
        receipt_15: 'رول ‎15 سم‎', export_pdf: 'تصدير PDF',
        orders_queue: 'الطلبات المفتوحة', orders_queue_hint: 'الطلبات المعلقة/المفتوحة', orders_queue_empty: 'لا توجد طلبات في الانتظار.',
        orders_queue_open: 'فتح الطلب', orders_queue_status_open: 'مفتوح', orders_queue_status_held: 'معلّق',
        orders_view_jobs: 'تفاصيل التحضير', orders_jobs_title: 'حالة الطلب في المطبخ', orders_jobs_description: 'عرض حالة الأصناف والمحطات المرتبطة بالطلب.',
        orders_jobs_empty: 'لا توجد بيانات تحضير بعد', orders_jobs_station: 'قسم المطبخ', orders_jobs_status: 'الحالة', orders_jobs_items: 'الأصناف', orders_jobs_updated: 'آخر تحديث',
        // ✅ Job status translations (from KDS)
        job_status_draft: 'مسودة', job_status_queued: 'بانتظار', job_status_awaiting: 'بانتظار', job_status_accepted: 'تم القبول',
        job_status_preparing: 'جاري التحضير', job_status_in_progress: 'قيد التحضير', job_status_cooking: 'قيد التحضير',
        job_status_ready: 'جاهز', job_status_completed: 'مكتمل', job_status_served: 'مُقدّم', job_status_cancelled: 'ملغي', job_status_paused: 'متوقف',
        orders_tab_all: 'كل الطلبات', orders_tab_dine_in: 'طلبات الصالة', orders_tab_delivery: 'طلبات الدليفري', orders_tab_takeaway: 'طلبات التيك أواي',
        orders_stage: 'المرحلة', orders_status: 'الحالة', orders_type: 'نوع الطلب', orders_total: 'الإجمالي', orders_updated: 'آخر تحديث',
        orders_payment: 'حالة الدفع', orders_line_count: 'عدد الأصناف', orders_notes: 'ملاحظات', orders_search_placeholder: 'ابحث برقم الطلب أو الطاولة أو القسم',
        orders_refresh: 'تحديث القائمة', orders_no_results: 'لا توجد طلبات متاحة في هذه القائمة.',
        tables_bulk_activate: 'تفعيل', tables_bulk_maintenance: 'وضع صيانة'
      },
      toast: {
        item_added: 'تمت إضافة الصنف', quantity_updated: 'تم تحديث الكمية', cart_cleared: 'تم مسح الطلب',
        order_saved: 'تم حفظ الطلب', order_finalized: 'تم إنهاء الطلب', sync_complete: 'تم تحديث المزامنة', payment_recorded: 'تم تسجيل الدفعة',
        amount_required: 'من فضلك أدخل قيمة صحيحة', payment_exceeds_limit: 'المبلغ المدفوع أكبر من المسموح. الحد الأقصى: %max%', payment_deleted: 'تم حذف الدفعة', payment_locked: 'لا يمكن حذف الدفعة بعد إنهاء الطلب', indexeddb_missing: 'IndexedDB غير متاحة في هذا المتصفح', order_conflict_refreshed: 'تم تعديل هذا الطلب من جهاز آخر، تم تحديث النسخة الحالية.', order_conflict_blocked: 'تم تحديث هذه الفاتورة من جهاز آخر. يرجى مراجعة التغييرات قبل الحفظ.',
        indexeddb_error: 'فشل حفظ البيانات', print_stub: 'سيتم التكامل مع الطابعة لاحقًا',
        line_missing_item: 'لا يمكن حفظ السطر لأن الصنف غير معروف. يرجى حذف السطر وإعادة إضافته من القائمة.',
        line_missing_kitchen: 'يجب تحديد قسم المطبخ لكل صنف قبل الحفظ. يرجى تحديث الصنف ثم إعادة المحاولة.',
        discount_stub: 'سيتم تفعيل الخصومات لاحقًا', notes_updated: 'تم تحديث الملاحظات', add_note: 'أدخل ملاحظة ترسل للمطبخ',
        set_qty: 'أدخل الكمية الجديدة', line_actions: 'سيتم فتح إجراءات السطر لاحقًا', line_modifiers_applied: 'تم تحديث الإضافات والمنزوعات', confirm_clear: 'هل تريد مسح الطلب الحالي؟',
        order_locked: 'لا يمكن تعديل هذا الطلب بعد حفظه', line_locked: 'لا يمكن تعديل هذا السطر بعد حفظه',
        order_additions_blocked: 'لا يمكن إضافة أصناف جديدة لهذا النوع من الطلبات بعد الحفظ',
        order_stage_locked: 'لا يمكن تعديل الأصناف في هذه المرحلة', orders_loaded: 'تم تحديث قائمة الطلبات',
        orders_failed: 'تعذر تحميل الطلبات',
        customer_saved: 'تم حفظ بيانات العميل', customer_attach_success: 'تم ربط العميل بالطلب',
        customer_missing_selection: 'اختر عميلًا أولًا', customer_missing_address: 'اختر عنوانًا لهذا العميل', customer_form_invalid: 'أكمل الاسم ورقم الهاتف',
        new_order: 'تم إنشاء طلب جديد', order_type_changed: 'تم تغيير نوع الطلب', table_assigned: 'تم اختيار الطاولة',
        order_table_required: 'يرجى اختيار طاولة قبل حفظ طلب الصالة', order_customer_required: 'يرجى ربط طلب التوصيل ببيانات العميل وعنوانه',
        merge_stub: 'قريبًا دمج الطاولات', load_more_stub: 'سيتم تحميل المزيد من الأصناف لاحقًا', indexeddb_syncing: 'جاري المزامنة مع IndexedDB',
        theme_switched: 'تم تغيير الثيم', lang_switched: 'تم تغيير اللغة', logout_stub: 'تم إنهاء الوردية افتراضيًا',
        kdsConnected: 'تم الاتصال بالمطبخ', kdsClosed: 'تم إغلاق الاتصال بالمطبخ', kdsFailed: 'فشل الاتصال بالمطبخ',
        kdsUnavailable: 'متصفحك لا يدعم WebSocket', kdsPong: 'تم استقبال إشارة من المطبخ',
        table_locked_other: 'الطاولة مقفلة لطلب آخر', table_locked_now: 'تم قفل الطاولة على الطلب الحالي',
        table_unlocked: 'تم فك قفل الطاولة', table_updated: 'تم تحديث بيانات الطاولة', table_removed: 'تم حذف الطاولة',
        table_added: 'تم إنشاء طاولة جديدة', table_inactive_assign: 'لا يمكن اختيار طاولة معطلة',
        table_sessions_cleared: 'تم فك ارتباط الطلب بالطاولة', print_size_switched: 'تم تحديث مقاس الطباعة',
        table_type_required: 'يرجى اختيار نوع الطلب طاولة قبل فتح إدارة الطاولات',
        table_invalid_seats: 'رجاء إدخال عدد مقاعد صالح', table_name_required: 'يجب إدخال اسم للطاولة',
        table_has_sessions: 'لا يمكن حذف طاولة عليها طلبات', table_state_updated: 'تم تحديث حالة الطاولة',
        table_unlock_partial: 'تم فك قفل الطاولة للطلب المحدد', reservation_created: 'تم إنشاء الحجز', reservation_updated: 'تم تحديث الحجز',
        reservation_cancelled: 'تم إلغاء الحجز', reservation_converted: 'تم تحويل الحجز إلى طلب', reservation_no_show: 'تم وسم الحجز بعدم الحضور',
        print_profile_saved: 'تم حفظ إعدادات الطباعة', print_sent: 'تم إرسال أمر الطباعة', pdf_exported: 'تم تجهيز نسخة PDF للحفظ',
        printer_added: 'تمت إضافة الطابعة', printer_removed: 'تمت إزالة الطابعة', printer_exists: 'الطابعة موجودة بالفعل',
        printer_name_required: 'يرجى إدخال اسم الطابعة', browser_popup_blocked: 'يرجى السماح بالنوافذ المنبثقة لإتمام التصدير',
        browser_print_opened: 'تم فتح أداة الطباعة في المتصفح', shift_open_success: 'تم فتح الوردية بنجاح',
        shift_close_success: 'تم إغلاق الوردية بنجاح', shift_pin_invalid: 'الرقم السري غير صحيح',
        shift_required: 'يجب فتح الوردية قبل حفظ الطلب', order_nav_not_found: 'لم يتم العثور على فاتورة بهذا الرقم',
        enter_order_discount: 'أدخل قيمة الخصم على الطلب (مثال: 10 أو 5%)',
        enter_line_discount: 'أدخل خصم هذا البند (مثال: 10 أو 5%)',
        discount_applied: 'تم تطبيق الخصم',
        discount_removed: 'تمت إزالة الخصم',
        discount_invalid: 'قيمة خصم غير صالحة',
        discount_limit: 'الحد الأقصى للخصم هو %limit%%'
      }
    },
    en: {
      ui: {
        shift: 'Shift', cashier: 'Cashier', dine_in: 'Dine-in', delivery: 'Delivery', takeaway: 'Takeaway', cashier_mode: 'Counter',
        search: 'Search menu', favorites: 'Favorites', favorites_only: 'Only favorites', categories: 'Categories', load_more: 'Load more',
        menu_loading: 'Loading live menu…', menu_loading_hint: 'Fetching the latest catalog from the central system. You can continue working with local data.',
        menu_load_error: 'Live menu refresh failed, using cached data instead.', menu_load_error_short: 'Update failed',
        menu_live_badge: 'Live menu', menu_last_updated: 'Last updated', menu_load_success: 'Live menu updated.',
        indexeddb: 'Local database', last_sync: 'Last sync', never_synced: 'Never', sync_now: 'Sync now', subtotal: 'Subtotal',
        service: 'Service', vat: 'VAT', discount: 'Discount', delivery_fee: 'Delivery fee', total: 'Amount due',
        cart_empty: 'No items added yet', choose_items: 'Pick an item from the menu to start the order.', tables: 'Tables',
        select_table: 'Select a table for this order', table_status: 'Table status', table_available: 'Available', table_occupied: 'Occupied',
        table_reserved: 'Reserved', table_maintenance: 'Maintenance', payments: 'Payments', split_payments: 'Split payments', recorded_payments: 'Recorded payments', paid: 'Paid',
        remaining: 'Remaining', open_payments: 'Add payment', open_reports: 'Open reports', reports: 'Reports', orders_count: 'Orders',
        shift_open: 'Open shift', shift_close: 'Close shift', shift_summary: 'Shift summary', shift_open_prompt: 'Enter the PIN to open the shift',
        shift_cash_start: 'Opening cash', shift_cash_end: 'Closing cash', shift_total_sales: 'Total sales',
        shift_total_dine_in: 'Dine-in total', shift_total_takeaway: 'Takeaway total', shift_total_delivery: 'Delivery total',
        shift_payments: 'Shift payments', shift_history: 'Shift history', shift_history_empty: 'No shift history yet',
        shift_close_confirm: 'Finish and close shift', shift_current: 'Active shift', shift_select_history: 'Select a previous shift',
        shift_open_button: '🔓 Open shift', shift_close_button: '🔒 Close shift', shift_orders_count: 'Orders this shift',
        shift_cash_summary: 'Cash drawer summary', shift_cash_collected: 'Cash collected',
        settings_center: 'Settings', settings_theme: 'Theme customization', settings_light: 'Light mode', settings_dark: 'Dark mode',
        settings_colors: 'Colors', settings_fonts: 'Typography', settings_color_background: 'Background', settings_color_foreground: 'Foreground',
        settings_color_primary: 'Primary color', settings_color_accent: 'Accent color', settings_color_muted: 'Muted tone',
        settings_font_base: 'Base font size', settings_reset: 'Reset to defaults',
        refunds: 'Refunds', returns: 'Returns',
        order_nav_label: 'Invoice navigator', order_nav_open: 'Go to invoice', order_nav_placeholder: 'Invoice number or index',
        order_nav_total: 'Total invoices', order_nav_no_history: 'No saved invoices yet',
        customer_center: 'Customer hub', customer_search: 'Search customers', customer_search_placeholder: 'Name or phone number',
        customer_tab_search: 'Search', customer_tab_create: 'New customer', customer_new: 'New customer', customer_name: 'Customer name',
        customer_phones: 'Phone numbers', customer_add_phone: 'Add phone', customer_remove_phone: 'Remove', customer_addresses: 'Customer addresses',
        customer_add_address: 'Add address', customer_address_title: 'Address label', customer_address_line: 'Address details',
        customer_address_notes: 'Notes', customer_area: 'Area', customer_attach: 'Link to order', customer_create: 'Save customer',
        customer_no_results: 'No matching customers', customer_multi_phone_hint: 'Store more than one phone per customer',
        customer_multi_address_hint: 'Store multiple delivery addresses per customer', customer_keypad: 'Keypad',
        customer_select_address: 'Select address', customer_required_delivery: 'Required for delivery orders', customer_delivery_required: 'Please link delivery orders to a customer and address',
        customer_edit_action: 'Edit details', customer_use_existing: 'Choose an existing customer', customer_form_reset: 'Reset form',
        customer_edit: 'Edit customer', customer_remove_address: 'Remove address',
        avg_ticket: 'Average ticket', top_selling: 'Top seller', sales_today: 'Sales today', save_order: 'Save order',
        settle_and_print: 'Settle & print', finish_order: 'Finish order', finish_and_print: 'Finish & print', print: 'Print only', notes: 'Notes', discount_action: 'Discount', clear: 'Clear',
        new_order: 'New order', balance_due: 'Outstanding balance', exchange_due: 'Change due', line_modifiers: 'Add-ons & removals', line_modifiers_title: 'Customize add-ons & removals', line_modifiers_addons: 'Add-ons', line_modifiers_removals: 'Removals', line_modifiers_apply: 'Apply changes', line_modifiers_empty: 'No options available', line_modifiers_free: 'No charge', line_modifiers_missing: 'Line is no longer available', line_modifiers_unit: 'Unit price', amount: 'Payment amount', capture_payment: 'Capture payment', close: 'Close', apply: 'Apply', theme: 'Theme',
        discount_amount: 'Amount', discount_percent: 'Percent %', discount_percent_hint: 'Enter percentage', discount_amount_hint: 'Enter discount amount', remove_discount: 'Remove discount',
        light: 'Light', dark: 'Dark', language: 'Language', arabic: 'Arabic', english: 'English', service_type: 'Service type',
        guests: 'Guests', kds: 'Kitchen display', status_online: 'Online', status_offline: 'Offline', status_idle: 'Idle',
        order_id: 'Order', order_id_pending: 'Draft', last_orders: 'Recent orders', connect_kds: 'Connect', reconnect: 'Reconnect', print_size: 'Print size',
        thermal_80: 'Thermal 80mm', a5: 'A5', a4: 'A4', tables_manage: 'Table management', tables_assign: 'Assign tables',
        table_lock: 'Lock table', table_unlock: 'Unlock table', table_locked: 'Locked', table_sessions: 'Linked orders',
        table_no_sessions: 'No orders yet', table_add: 'Add table', table_rename: 'Rename table', table_delete: 'Remove table',
        table_status_change: 'Change status', table_status_inactive: 'Inactive', table_status_active: 'Available',
        table_status_reserved: 'Reserved', table_status_maintenance: 'Maintenance', table_manage_hint: 'Tap a table to assign it or use the tools below.',
        table_multi_orders: 'Multi orders', print_profile: 'Print profile', table_confirm_unlock: 'Unlock this table?',
        table_confirm_remove: 'Remove this table?', table_confirm_release: 'Unlink the order from the table?',
        tables_filter_all: 'All', tables_filter_free: 'Free', tables_filter_single: 'Locked (single)', tables_filter_multi: 'Locked (multi)',
        tables_filter_maintenance: 'Maintenance', tables_search_placeholder: 'Search by table name or number', tables_details: 'Table details',
        tables_zone: 'Zone', tables_capacity: 'Capacity', tables_state_active: 'Active', tables_state_disactive: 'Inactive',
        tables_state_maintenance: 'Maintenance', tables_state_free: 'Free', tables_state_single: 'Single lock', tables_state_multi: 'Multi lock',
        tables_unlock_all: 'Unlock all', tables_unlock_single: 'Unlock current order', tables_assign_to_order: 'Assign to current order',
        tables_remove_from_order: 'Remove from this order', tables_orders_badge: 'Orders', tables_reservations_badge: 'Reservations',
        tables_actions: 'Table actions', tables_longpress_hint: 'Long press to view details', tables_count_label: 'Total tables',
        reservations: 'Reservations', reservations_manage: 'Manage reservations', reservations_filter_all: 'All', reservations_filter_booked: 'Booked',
        reservations_filter_seated: 'Seated', reservations_filter_completed: 'Completed', reservations_filter_cancelled: 'Cancelled',
        reservations_filter_noshow: 'No-show', reservations_new: 'New reservation', reservations_edit: 'Edit reservation', reservations_customer: 'Customer name',
        reservations_phone: 'Phone', reservations_party_size: 'Party size', reservations_time: 'Reservation time', reservations_hold_until: 'Hold until',
        reservations_tables: 'Linked tables', reservations_note: 'Notes', reservations_status: 'Status',
        reservations_status_booked: 'Booked', reservations_status_seated: 'Seated', reservations_status_no_show: 'No-show',
        reservations_status_cancelled: 'Cancelled', reservations_status_completed: 'Completed', reservations_convert: 'Guest arrived',
        reservations_no_show: 'Mark no-show', reservations_cancel_action: 'Cancel', reservations_save: 'Save reservation',
        reservations_conflict: 'Conflict detected with selected tables.', reservations_conflict_maintenance: 'One of the tables is under maintenance.',
        reservations_conflict_lock: 'Table currently locked by another order.', reservations_tables_required: 'Select at least one table',
        reservations_list_empty: 'No reservations for this time range.', reservations_hold_label: 'Hold until',
        tables_manage_log: 'Audit trail', print_doc_customer: 'Customer receipt', print_doc_summary: 'Order summary', print_doc_kitchen: 'Kitchen chit',
        print_preview: 'Preview', print_preview_expand: 'Expand preview', print_preview_collapse: 'Collapse preview', print_send: 'Send to printer', print_save_profile: 'Save settings', print_header_store: 'Store name',
        print_header_address: 'Address', print_header_phone: 'Phone', print_footer_thanks: 'Thanks for visiting!',
        print_footer_policy: 'Exchange within 24h with receipt.', print_footer_feedback: 'Share your feedback',
        print_payments: 'Payments', print_change_due: 'Change due', print_size_label: 'Print size',
        print_printer_default: 'Default printer', print_printer_inside: 'Inside / dining printer', print_printer_outside: 'Delivery / outside printer',
        print_printer_placeholder: 'Type printer name', print_printer_hint: 'Type the printer name exactly as it appears on the system.',
        print_printers_info: 'Browsers only expose printer names through the print dialog. Configure the matching printer manually for each profile.',
        print_copies: 'Copies', print_duplicate_inside: 'Duplicate for inside', print_duplicate_outside: 'Duplicate for outside',
        print_auto_send: 'Auto send to thermal printer', print_show_preview: 'Show preview before printing',
        print_show_advanced: 'Show advanced settings', print_hide_advanced: 'Hide advanced settings',
        print_manage_printers: 'Manage printers', print_manage_hide: 'Hide printer manager', print_manage_title: 'Saved printers',
        print_manage_add: 'Add printer', print_manage_placeholder: 'Enter the printer name exactly as the OS shows it',
        print_manage_empty: 'No saved printers yet', print_browser_preview: 'Browser print dialog',
        print_printer_select: 'Pick the printer for quick printing', print_printers_manage_hint: 'Maintain the printer names you rely on here.',
        receipt_15: '15 cm roll', export_pdf: 'Export PDF',
        orders_queue: 'Open orders', orders_queue_hint: 'Held / open orders in progress', orders_queue_empty: 'No orders waiting.',
        orders_queue_open: 'Open order', orders_queue_status_open: 'Open', orders_queue_status_held: 'Held',
        orders_view_jobs: 'Kitchen status', orders_jobs_title: 'Kitchen production status', orders_jobs_description: 'Review item progress across kitchen stations.',
        orders_jobs_empty: 'No prep data yet', orders_jobs_station: 'Station', orders_jobs_status: 'Status', orders_jobs_items: 'Items', orders_jobs_updated: 'Updated at',
        // ✅ Job status translations (from KDS)
        job_status_draft: 'Draft', job_status_queued: 'Queued', job_status_awaiting: 'Awaiting', job_status_accepted: 'Accepted',
        job_status_preparing: 'Preparing', job_status_in_progress: 'Preparing', job_status_cooking: 'Preparing',
        job_status_ready: 'Ready', job_status_completed: 'Completed', job_status_served: 'Served', job_status_cancelled: 'Cancelled', job_status_paused: 'Paused',
        orders_tab_all: 'All orders', orders_tab_dine_in: 'Dining room', orders_tab_delivery: 'Delivery', orders_tab_takeaway: 'Takeaway',
        orders_stage: 'Stage', orders_status: 'Status', orders_type: 'Order type', orders_total: 'Total due', orders_updated: 'Last update',
        orders_payment: 'Payment state', orders_line_count: 'Line items', orders_notes: 'Notes', orders_search_placeholder: 'Search by order, table or section',
        orders_refresh: 'Refresh list', orders_no_results: 'No orders match the current filters.',
        tables_bulk_activate: 'Activate', tables_bulk_maintenance: 'Mark maintenance'
      },
      toast: {
        item_added: 'Item added to cart', quantity_updated: 'Quantity updated', cart_cleared: 'Cart cleared',
        order_saved: 'Order saved', order_finalized: 'Order finalized', sync_complete: 'Sync completed', payment_recorded: 'Payment recorded',
        amount_required: 'Enter a valid amount', payment_exceeds_limit: 'Payment exceeds allowed limit. Maximum: %max%', payment_deleted: 'Payment deleted', payment_locked: 'Cannot delete payment after order is finalized', indexeddb_missing: 'IndexedDB is not available in this browser', order_conflict_refreshed: 'This order was updated on another device. Your copy has been refreshed.', order_conflict_blocked: 'This ticket has changed on another device. Please review the updates before saving.',
        indexeddb_error: 'Failed to save data', print_stub: 'Printer integration coming soon',
        line_missing_item: 'Cannot save a line without a linked menu item. Remove it and add the item again.',
        line_missing_kitchen: 'Each line must have a kitchen section before saving. Update the item configuration and retry.',
        discount_stub: 'Discount workflow coming soon', notes_updated: 'Notes updated', add_note: 'Add a note for the kitchen',
        set_qty: 'Enter the new quantity', line_actions: 'Line actions coming soon', line_modifiers_applied: 'Line modifiers updated', confirm_clear: 'Clear the current order?',
        order_locked: 'This order is locked after saving', line_locked: 'This line can no longer be modified',
        order_additions_blocked: 'Cannot add new items to this order type after saving',
        order_stage_locked: 'Items cannot be modified at this stage', orders_loaded: 'Orders list refreshed',
        orders_failed: 'Failed to load orders',
        customer_saved: 'Customer saved successfully', customer_attach_success: 'Customer linked to order',
        customer_missing_selection: 'Select a customer first', customer_missing_address: 'Select an address for this customer', customer_form_invalid: 'Please enter name and phone number',
        new_order: 'New order created', order_type_changed: 'Order type changed', table_assigned: 'Table assigned',
        order_table_required: 'Select at least one table before saving dine-in orders', order_customer_required: 'Link delivery orders to a customer profile and address',
        merge_stub: 'Table merge coming soon', load_more_stub: 'Menu pagination coming soon', indexeddb_syncing: 'Syncing with IndexedDB…',
        theme_switched: 'Theme updated', lang_switched: 'Language updated', logout_stub: 'Session ended (stub)',
        kdsConnected: 'Connected to kitchen', kdsClosed: 'Kitchen connection closed', kdsFailed: 'Kitchen connection failed',
        kdsUnavailable: 'WebSocket not supported', kdsPong: 'KDS heartbeat received',
        table_locked_other: 'Table is locked by another order', table_locked_now: 'Table locked for this order',
        table_unlocked: 'Table unlocked', table_updated: 'Table details updated', table_removed: 'Table removed',
        table_added: 'New table added', table_inactive_assign: 'Inactive tables cannot be assigned',
        table_sessions_cleared: 'Order unlinked from table', print_size_switched: 'Print size updated',
        table_type_required: 'Please select the dine-in service type before opening the tables panel',
        table_invalid_seats: 'Please enter a valid seat count', table_name_required: 'Table name is required',
        table_has_sessions: 'Cannot remove a table with linked orders', table_state_updated: 'Table state updated',
        table_unlock_partial: 'Table unlocked for the selected order', reservation_created: 'Reservation created', reservation_updated: 'Reservation updated',
        reservation_cancelled: 'Reservation cancelled', reservation_converted: 'Reservation converted to order', reservation_no_show: 'Reservation marked as no-show',
        print_profile_saved: 'Print profile saved', print_sent: 'Print job sent', pdf_exported: 'PDF export is ready',
        printer_added: 'Printer added', printer_removed: 'Printer removed', printer_exists: 'Printer already exists',
        printer_name_required: 'Please enter a printer name', browser_popup_blocked: 'Allow pop-ups to finish the export',
        browser_print_opened: 'Browser print dialog opened', shift_open_success: 'Shift opened successfully', shift_close_success: 'Shift closed successfully',
        shift_pin_invalid: 'Invalid PIN', shift_required: 'Please open a shift before saving the order', order_nav_not_found: 'No invoice matches that number',
        enter_order_discount: 'Enter order discount (e.g. 10 or 5%)',
        enter_line_discount: 'Enter line discount (e.g. 10 or 5%)',
        discount_applied: 'Discount updated',
        discount_removed: 'Discount cleared',
        discount_invalid: 'Invalid discount value',
        discount_limit: 'Discount cannot exceed %limit%%'
      }
    }
  };

  function getTexts(db) {
    return TEXTS[db.env.lang] || TEXTS.ar;
  }

  function localize(value, lang) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      return value[lang] || value.ar || value.en || Object.values(value)[0] || '';
    }
    return String(value);
  }

  function escapeHTML(value) {
    if (value == null) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;'
    };
    map['"'] = '&quot;';
    map['\''] = '&#39;';
    return String(value).replace(/[&<>"']/g, ch => map[ch]);
  }

  function getCurrency(db) {
    return currencyCode;
  }

  function getCurrencySymbol(db) {
    const lang = db.env?.lang || (db.env && db.env.lang) || document.documentElement.lang || 'ar';
    return currencySymbols[lang] || currencySymbols.en || currencyCode;
  }

  function getLocale(db) {
    return db.env.lang === 'ar' ? 'ar-EG' : 'en-US';
  }

  function formatCurrencyValue(db, amount) {
    try {
      return new Intl.NumberFormat(getLocale(db), { style: 'currency', currency: getCurrency(db) }).format(Number(amount) || 0);
    } catch (_) {
      const numeric = (Number(amount) || 0).toFixed(2);
      return `${numeric} ${getCurrencySymbol(db)}`;
    }
  }

  function round(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function getLineUnitPrice(line) {
    if (!line) return 0;
    const base = Number(line.basePrice != null ? line.basePrice : line.price) || 0;
    const modifiers = Array.isArray(line.modifiers) ? line.modifiers : [];
    const modifierDelta = modifiers.reduce((sum, mod) => sum + (Number(mod.priceChange ?? mod.price_change ?? 0) || 0), 0);
    return round(base + modifierDelta);
  }

  function normalizeDiscount(discount) {
    if (!discount || typeof discount !== 'object') return null;
    const type = discount.type === 'percent' ? 'percent' : (discount.type === 'amount' ? 'amount' : null);
    const rawValue = Number(discount.value);
    const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    if (!type || value <= 0) return null;
    if (type === 'percent') {
      return { type, value: Math.min(100, value) };
    }
    return { type, value };
  }

  function parseDiscountInput(raw, baseAmount, maxPercent) {
    if (raw == null) return { discount: null };
    const text = String(raw).trim();
    if (!text) return { discount: null };
    const normalizedMax = Number.isFinite(maxPercent) && maxPercent > 0 ? maxPercent : null;
    const sanitized = text.replace(',', '.');
    if (sanitized.endsWith('%')) {
      const percentValue = parseFloat(sanitized.slice(0, -1));
      if (!Number.isFinite(percentValue) || percentValue <= 0) return { error: 'invalid' };
      const percent = Math.min(100, Math.max(0, percentValue));
      if (normalizedMax != null && percent > normalizedMax) return { error: 'limit', limit: normalizedMax };
      return { discount: { type: 'percent', value: percent } };
    }
    const amountValue = parseFloat(sanitized);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return { error: 'invalid' };
    if (normalizedMax != null && baseAmount > 0) {
      const percentEquivalent = (amountValue / baseAmount) * 100;
      if (percentEquivalent > normalizedMax + 0.0001) return { error: 'limit', limit: normalizedMax };
    }
    return { discount: { type: 'amount', value: amountValue } };
  }

  function computeLineDiscountAmount(line, grossTotal) {
    if (!line) return 0;
    const discount = normalizeDiscount(line.discount);
    if (!discount) return 0;
    if (discount.type === 'percent') {
      return round(grossTotal * (discount.value / 100));
    }
    return round(Math.min(discount.value, grossTotal));
  }

  function applyLinePricing(line) {
    if (!line) return line;
    const unitPrice = getLineUnitPrice(line);
    const qty = Number(line.qty) || 0;
    const base = Number(line.basePrice != null ? line.basePrice : line.price) || 0;
    const grossTotal = round(unitPrice * qty);
    const discountAmount = computeLineDiscountAmount(line, grossTotal);
    const netTotal = Math.max(0, grossTotal - discountAmount);
    return {
      ...line,
      basePrice: round(base),
      price: unitPrice,
      total: netTotal
    };
  }

  function updateLineWithPricing(line, updates) {
    if (!line) return line;
    return applyLinePricing({ ...line, ...(updates || {}) });
  }

  function calculateTotals(lines, cfg, type, options = {}) {
    let grossSubtotal = 0;
    let netSubtotal = 0;
    let lineDiscountTotal = 0;
    (lines || []).forEach(line => {
      if (!line) return;
      const qty = Number(line.qty) || 0;
      const unit = getLineUnitPrice(line);
      const gross = round(qty * unit);
      const fallbackTotal = Number(line.total);
      const net = Number.isFinite(fallbackTotal) ? fallbackTotal : gross;
      grossSubtotal += gross;
      netSubtotal += net;
      lineDiscountTotal += Math.max(0, gross - net);
    });
    const normalizedOrderDiscount = normalizeDiscount(options.orderDiscount);
    const orderDiscountBase = netSubtotal;
    const orderDiscountAmount = normalizedOrderDiscount
      ? normalizedOrderDiscount.type === 'percent'
        ? round(orderDiscountBase * (normalizedOrderDiscount.value / 100))
        : round(Math.min(normalizedOrderDiscount.value, orderDiscountBase))
      : 0;
    const subtotalAfterDiscount = Math.max(0, netSubtotal - orderDiscountAmount);
    const serviceRate = 0; // Always zero - service charge disabled
    const service = subtotalAfterDiscount * serviceRate;
    const vatBase = subtotalAfterDiscount + service;
    const vat = 0; // Always zero - tax disabled
    const deliveryFee = type === 'delivery' ? (cfg.default_delivery_fee || 0) : 0;
    const discount = lineDiscountTotal + orderDiscountAmount;
    const due = subtotalAfterDiscount + service + vat + deliveryFee;
    return {
      subtotal: round(netSubtotal),
      service: round(service),
      vat: round(vat),
      discount: round(discount),
      deliveryFee: round(deliveryFee),
      due: round(due)
    };
  }

  function getActivePaymentEntries(order, paymentsState) {
    const split = Array.isArray(paymentsState?.split) ? paymentsState.split.filter(entry => entry && Number(entry.amount) > 0) : [];
    if (split.length) return split;
    return Array.isArray(order?.payments) ? order.payments.filter(entry => entry && Number(entry.amount) > 0) : [];
  }

  function summarizePayments(totals, entries) {
    const due = round(Number(totals?.due || 0));
    const paid = round((entries || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
    const remaining = Math.max(0, round(due - paid));
    let state = 'unpaid';
    if (paid > 0 && remaining > 0) state = 'partial';
    if (paid >= due && due > 0) state = 'paid';
    if (due === 0 && paid === 0) state = 'unpaid';
    return { due, paid, remaining, state };
  }

  function notesToText(notes, separator = ' • ') {
    if (!notes) return '';
    const entries = Array.isArray(notes) ? notes : [notes];
    return entries
      .map(entry => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry.trim();
        if (typeof entry === 'object') {
          // Try multiple properties for object notes
          if (entry.message) return String(entry.message).trim();
          if (entry.text) return String(entry.text).trim();
          if (entry.note) return String(entry.note).trim();
          if (entry.content) return String(entry.content).trim();
          // If no known property, try to stringify the object
          try {
            const str = JSON.stringify(entry);
            // Don't return [object Object] or empty objects
            if (str && str !== '{}' && str !== '[object Object]') return str;
          } catch (e) { }
        }
        return '';
      })
      .filter(Boolean)
      .join(separator);
  }

  function normalizeOrderTypeId(value) {
    if (!value) return 'dine_in';
    const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return ORDER_TYPE_IDS.has(normalized) ? normalized : normalized || 'dine_in';
  }

  function summarizeShiftOrders(history, shift) {
    if (!shift) return { totalsByType: {}, paymentsByMethod: {}, totalSales: 0, orders: [], ordersCount: 0, countsByType: {} };
    const shiftId = shift.id;
    const historyList = Array.isArray(history)
      ? history.filter(entry => entry && entry.isPersisted !== false && entry.dirty !== true && entry.status !== 'draft')
      : [];
    const orders = [];
    const totalsAccumulator = {};
    const paymentsAccumulator = {};
    const paymentEntries = [];
    const countsAccumulator = {};
    if (shiftId) {
      historyList.forEach(order => {
        if (!order || order.shiftId !== shiftId) return;
        const total = round(order?.totals?.due || 0);
        const typeKey = normalizeOrderTypeId(order?.type || order?.header?.type_id || 'dine_in');
        totalsAccumulator[typeKey] = round((totalsAccumulator[typeKey] || 0) + total);
        countsAccumulator[typeKey] = (countsAccumulator[typeKey] || 0) + 1;
        const payments = Array.isArray(order?.payments) ? order.payments : [];
        payments.forEach(payment => {
          if (!payment) return;
          const methodKey = String(payment.method || payment.id || 'cash');
          const amount = round(payment.amount || 0);
          paymentsAccumulator[methodKey] = round((paymentsAccumulator[methodKey] || 0) + amount);
          paymentEntries.push({
            id: payment.id || `${order.id}-${methodKey}-${paymentEntries.length + 1}`,
            method: methodKey,
            amount,
            orderId: order.id,
            capturedAt: order.savedAt || order.updatedAt || order.createdAt || Date.now()
          });
        });
        orders.push({
          id: order.id,
          total,
          savedAt: order.savedAt || order.updatedAt || order.createdAt || Date.now(),
          type: typeKey
        });
      });
    }
    if (!orders.length && Array.isArray(shift.orders) && shift.orders.length) {
      shift.orders.forEach((entry, idx) => {
        if (!entry) return;
        if (entry.isPersisted === false || entry.dirty === true || entry.status === 'draft') return;
        if (typeof entry === 'string') {
          const typeKey = 'dine_in';
          countsAccumulator[typeKey] = (countsAccumulator[typeKey] || 0) + 1;
          orders.push({
            id: entry,
            total: 0,
            savedAt: shift.closedAt || shift.openedAt || Date.now(),
            type: typeKey
          });
        } else {
          const typeKey = normalizeOrderTypeId(entry.type || entry.orderType || entry.type_id || 'dine_in');
          const total = round(entry.total || entry.amount || 0);
          totalsAccumulator[typeKey] = round((totalsAccumulator[typeKey] || 0) + total);
          countsAccumulator[typeKey] = (countsAccumulator[typeKey] || 0) + 1;
          orders.push({
            id: entry.id || entry.orderId || `order-${idx + 1}`,
            total,
            savedAt: entry.savedAt || entry.updatedAt || shift.closedAt || shift.openedAt || Date.now(),
            type: typeKey
          });
        }
      });
    }
    const totalsKeys = new Set([
      ...Object.keys(shift.totalsByType || {}),
      ...Object.keys(totalsAccumulator)
    ]);
    const totalsByType = {};
    if (totalsKeys.size === 0) {
      ORDER_TYPES.forEach(type => { totalsByType[type.id] = 0; });
    } else {
      totalsKeys.forEach(key => {
        const typeKey = normalizeOrderTypeId(key);
        const computed = totalsAccumulator[typeKey];
        const fallback = shift.totalsByType?.[typeKey];
        if (computed != null) {
          totalsByType[typeKey] = round(computed);
        } else if (fallback != null) {
          totalsByType[typeKey] = round(fallback);
        }
      });
    }
    const paymentKeys = new Set([
      ...Object.keys(shift.paymentsByMethod || {}),
      ...Object.keys(paymentsAccumulator)
    ]);
    const paymentsByMethod = {};
    paymentKeys.forEach(key => {
      const computed = paymentsAccumulator[key];
      const fallback = shift.paymentsByMethod?.[key];
      if (computed != null) {
        paymentsByMethod[key] = round(computed);
      } else if (fallback != null) {
        paymentsByMethod[key] = round(fallback);
      }
    });
    const countKeys = new Set([
      ...Object.keys(shift.countsByType || {}),
      ...Object.keys(countsAccumulator)
    ]);
    const countsByType = {};
    countKeys.forEach(key => {
      const typeKey = normalizeOrderTypeId(key);
      if (countsAccumulator[typeKey] != null) {
        countsByType[typeKey] = countsAccumulator[typeKey];
      } else if (shift.countsByType && shift.countsByType[typeKey] != null) {
        countsByType[typeKey] = shift.countsByType[typeKey];
      }
    });
    const totalSales = orders.length
      ? round(orders.reduce((sum, entry) => sum + (Number(entry.totals?.due || entry.total) || 0), 0))
      : round(shift.totalSales || 0);
    const ordersCount = orders.length
      ? orders.length
      : (typeof shift.ordersCount === 'number'
        ? shift.ordersCount
        : (Array.isArray(shift.orders) ? shift.orders.length : 0));
    const ordersList = orders.length
      ? orders
      : (Array.isArray(shift.orders)
        ? shift.orders.map(entry => typeof entry === 'object' ? { ...entry } : { id: entry, total: 0, savedAt: shift.closedAt || shift.openedAt || Date.now(), type: 'dine_in' })
        : []);
    return {
      totalsByType,
      paymentsByMethod,
      totalSales,
      orders: ordersList,
      ordersCount,
      countsByType,
      payments: paymentEntries,
      refunds: Array.isArray(shift.refunds) ? shift.refunds.map(item => ({ ...item })) : [],
      returns: Array.isArray(shift.returns) ? shift.returns.map(item => ({ ...item })) : []
    };
  }

  function computeRealtimeReports(db) {
    const history = (Array.isArray(db.data.ordersHistory) ? db.data.ordersHistory : [])
      .filter(order => order && order.isPersisted !== false && order.dirty !== true && order.status !== 'draft');
    const now = Date.now();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const startTs = start.getTime();
    const endTs = startTs + 24 * 60 * 60 * 1000;
    let salesToday = 0;
    let ordersCount = 0;
    const itemCounter = new Map();
    history.forEach(order => {
      if (!order) return;
      const savedAt = order.savedAt || order.updatedAt || order.createdAt;
      if (savedAt == null) return;
      if (savedAt < startTs || savedAt >= endTs) return;
      const amount = Number(order?.totals?.due || order.total || 0);
      if (Number.isFinite(amount)) {
        salesToday += amount;
      }
      ordersCount += 1;
      const lines = Array.isArray(order.lines) ? order.lines : [];
      lines.forEach(line => {
        if (!line) return;
        const key = line.itemId || line.name?.en || line.name?.ar || line.name;
        if (!key) return;
        const qty = Number(line.qty) || 0;
        itemCounter.set(key, (itemCounter.get(key) || 0) + qty);
      });
    });
    let topItemId = null;
    let maxQty = 0;
    itemCounter.forEach((qty, key) => {
      if (qty > maxQty) {
        maxQty = qty;
        topItemId = key;
      }
    });
    const avgTicket = ordersCount ? salesToday / ordersCount : 0;
    return {
      salesToday: round(salesToday),
      ordersCount,
      avgTicket: round(avgTicket),
      topItemId
    };
  }

  function createOrderLine(item, qty, overrides) {
    if (!item || item.id == null || item.id === '') {
      console.error('[POS] Cannot create order line without an item id', item);
      throw new Error('[POS] Cannot create order line without an item id');
    }
    const itemId = String(item.id);
    if (!itemId || itemId === 'null' || itemId === 'undefined') {
      console.error('[POS] Invalid item id', item);
      throw new Error('[POS] Invalid item id');
    }
    const quantity = qty || 1;
    const unitPrice = Number(item.basePrice ?? item.price ?? 0);
    const now = Date.now();
    const uniqueId = overrides?.id || `ln-${itemId}-${now.toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
    const kitchenSource = overrides?.kitchenSection ?? item.kitchenSectionId ?? item.kitchenSection ?? item.kitchen_section ?? item.kitchen_section_id;
    const kitchenSection = kitchenSource != null && kitchenSource !== '' ? String(kitchenSource) : 'expo';
    if (!kitchenSection || kitchenSection === 'null' || kitchenSection === 'undefined') {
      //console.warn('[POS] Invalid kitchenSection, defaulting to expo', { item, kitchenSource });
    }
    const statusId = overrides?.statusId || overrides?.status || 'draft';
    const baseLine = {
      id: uniqueId,
      itemId: itemId,
      item_id: itemId,
      Item_Id: itemId,  // PascalCase for schema!
      name: item.name,
      description: item.description,
      quantity,
      qty: quantity,
      unitPrice,
      unit_price: unitPrice,
      price: unitPrice,
      basePrice: unitPrice,
      total: round(unitPrice * quantity),
      modifiers: overrides?.modifiers || [],
      notes: overrides?.notes || [],
      discount: normalizeDiscount(overrides?.discount),
      statusId,
      status_id: statusId,
      status: statusId,
      stage: overrides?.stage || 'new',
      kitchenSection,
      kitchenSectionId: kitchenSection,
      kitchen_section_id: kitchenSection,
      locked: overrides?.locked || false,
      createdAt: overrides?.createdAt || now,
      updatedAt: overrides?.updatedAt || now
    };
    return applyLinePricing(baseLine);
  }

  function filterMenu(menu, lang) {
    const term = (menu.search || '').trim().toLowerCase();
    const favorites = new Set((menu.favorites || []).map(String));
    return (menu.items || []).filter(item => {
      if (menu.showFavoritesOnly && !favorites.has(String(item.id))) return false;
      const inCategory = menu.category === 'all' || item.category === menu.category;
      if (!inCategory) return false;
      if (!term) return true;
      const name = localize(item.name, lang).toLowerCase();
      const desc = localize(item.description, lang).toLowerCase();
      return name.includes(term) || desc.includes(term);
    });
  }

  function formatSync(ts, lang) {
    if (!ts) return null;
    try {
      const formatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return formatter.format(new Date(ts));
    } catch (_) {
      return new Date(ts).toLocaleTimeString();
    }
  }

  function formatDateTime(ts, lang, options) {
    if (!ts) return '';
    try {
      const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
      const formatter = new Intl.DateTimeFormat(locale, options || { hour: '2-digit', minute: '2-digit' });
      return formatter.format(new Date(ts));
    } catch (_) {
      return new Date(ts).toLocaleString();
    }
  }

  function renderPrintableHTML(db, docType, size) {
    const t = getTexts(db);
    //edit1
    const order = db.ui?.print?.ticketSnapshot || db.data.order || {};

    const lang = db.env.lang;
    const tablesNames = (order.tableIds || []).map(id => {
      const table = (db.data.tables || []).find(tbl => tbl.id === id);
      return table?.name || id;
    });
    const printableOrderId = getDisplayOrderId(order, t);
    const splitState = Array.isArray(db.data.payments?.split) ? db.data.payments.split : [];
    const orderPayments = Array.isArray(order.payments) ? order.payments : [];
    const payments = splitState.length ? splitState : orderPayments;
    const methodsCatalog = (db.data.payments?.methods && db.data.payments.methods.length)
      ? db.data.payments.methods
      : PAYMENT_METHODS;
    const methodsMap = new Map(methodsCatalog.map(method => [method.id, method]));
    const totalPaid = payments.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const due = order.totals?.due || 0;
    const changeDue = Math.max(0, round(totalPaid - due));
    const totalsRows = [
      { label: t.ui.subtotal, value: order.totals?.subtotal || 0 },
      order.totals?.service ? { label: t.ui.service, value: order.totals.service } : null,
      { label: t.ui.vat, value: order.totals?.vat || 0 },
      order.totals?.deliveryFee ? { label: t.ui.delivery_fee, value: order.totals.deliveryFee } : null,
      order.totals?.discount ? { label: t.ui.discount, value: order.totals.discount } : null
    ].filter(Boolean);
    const docLabels = {
      customer: t.ui.print_doc_customer,
      summary: t.ui.print_doc_summary,
      kitchen: t.ui.print_doc_kitchen
    };
    const currentDocLabel = docLabels[docType] || t.ui.print_doc_customer;
    const lineItems = (order.lines || []).map(line => {
      const name = `${escapeHTML(localize(line.name, lang))} × ${Number(line.qty) || 0}`;
      const price = formatCurrencyValue(db, line.total);
      const modifiers = Array.isArray(line.modifiers) ? line.modifiers : [];
      const modifiersHtml = modifiers.map(mod => {
        const delta = Number(mod.priceChange || 0) || 0;
        const priceLabel = delta ? `${delta > 0 ? '+' : '−'} ${formatCurrencyValue(db, Math.abs(delta))}` : escapeHTML(t.ui.line_modifiers_free);
        return `<div class="row sub"><span>${escapeHTML(localize(mod.label, lang))}</span><span>${priceLabel}</span></div>`;
      }).join('');
      const notes = Array.isArray(line.notes) ? line.notes.filter(Boolean).join(' • ') : (line.notes || '');
      const notesHtml = notes ? `<div class="row note"><span>📝 ${escapeHTML(notes)}</span><span></span></div>` : '';
      return `<div class="row"><span>${name}</span><span>${price}</span></div>${modifiersHtml}${notesHtml}`;
    }).join('');
    const totalsHtml = totalsRows.map(row => {
      const price = formatCurrencyValue(db, row.value);
      return `<div class="row"><span>${escapeHTML(row.label)}</span><span>${price}</span></div>`;
    }).join('');
    const paymentsHtml = payments.map(entry => {
      const method = methodsMap.get(entry.method);
      const label = method ? `${escapeHTML(localize(method.label, lang))}` : escapeHTML(entry.method || '');
      const price = formatCurrencyValue(db, entry.amount);
      return `<div class="row"><span>${label}</span><span>${price}</span></div>`;
    }).join('');
    const sizePresets = {
      thermal_80: { width: '72mm', maxWidth: '72mm', padding: '18px 16px', fontSize: '13px', heading: '20px', meta: '12px', total: '16px', bodyBg: '#f4f7fb', border: '1px solid #dbeafe', radius: '20px', shadow: '0 18px 40px rgba(15,23,42,0.12)', page: '@page { size: 80mm auto; margin:4mm; }', bodyPadding: '18px' },
      receipt_15: { width: '150mm', maxWidth: '150mm', padding: '24px 20px', fontSize: '13px', heading: '22px', meta: '13px', total: '18px', bodyBg: '#f5f8ff', border: '1px dashed #cbd5f5', radius: '28px', shadow: '0 22px 50px rgba(15,23,42,0.14)', page: '@page { size: 150mm auto; margin:6mm; }', bodyPadding: '24px' },
      a5: { width: '100%', maxWidth: '720px', padding: '28px 32px', fontSize: '15px', heading: '26px', meta: '15px', total: '20px', bodyBg: '#f8fafc', border: '1px solid #dbe4f3', radius: '32px', shadow: '0 26px 64px rgba(15,23,42,0.18)', page: '@page { size: A5 landscape; margin:12mm; }', bodyPadding: '36px' },
      a4: { width: '100%', maxWidth: '860px', padding: '32px 40px', fontSize: '16px', heading: '28px', meta: '16px', total: '22px', bodyBg: '#ffffff', border: '1px solid #d0dae8', radius: '36px', shadow: '0 30px 70px rgba(15,23,42,0.2)', page: '@page { size: A4 portrait; margin:18mm; }', bodyPadding: '48px' }
    };
    const preset = sizePresets[size] || sizePresets.thermal_80;
    const dirAttr = db.env.dir || (lang === 'ar' ? 'rtl' : 'ltr');
    const tablesLine = tablesNames.length ? `${escapeHTML(t.ui.tables)}: ${escapeHTML(tablesNames.join(', '))}` : '';
    const guestLine = order.type === 'dine_in' && (order.guests || 0) > 0
      ? `${escapeHTML(t.ui.guests)}: ${order.guests}`
      : '';
    const orderMeta = [
      `${escapeHTML(t.ui.order_id)} ${escapeHTML(printableOrderId)}`,
      guestLine,
      tablesLine,
      formatDateTime(order.updatedAt || Date.now(), lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    ].filter(Boolean).map(val => `<p class="meta">${escapeHTML(val)}</p>`).join('');
    const orderNotesText = notesToText(order.notes);
    const orderNotesHtml = orderNotesText
      ? `<div class="row note" style="margin-top:12px;"><span>📝 ${escapeHTML(t.ui.notes)}: ${escapeHTML(orderNotesText)}</span><span></span></div>`
      : '';
    const noItems = `<p class="muted">${escapeHTML(t.ui.cart_empty)}</p>`;
    const changeRow = payments.length ? `<div class="row"><span>${escapeHTML(t.ui.print_change_due)}</span><span>${formatCurrencyValue(db, changeDue)}</span></div>` : '';
    const paidRow = payments.length ? `<div class="row"><span>${escapeHTML(t.ui.paid)}</span><span>${formatCurrencyValue(db, totalPaid)}</span></div>` : '';
    const html = `<!DOCTYPE html>
        <html lang="${lang}" dir="${dirAttr}">
        <head>
            <meta charset="utf-8"/>
            <title>${escapeHTML(currentDocLabel)}</title>
            <style>
            :root { color-scheme: light; font-family: 'Tajawal', 'Cairo', system-ui, sans-serif; }
            ${preset.page || ''}
            body { margin:0; background:${preset.bodyBg || '#f8fafc'}; color:#0f172a; display:flex; justify-content:center; padding:${preset.bodyPadding || '32px'}; direction:${dirAttr}; }
            .receipt { width:${preset.width}; max-width:${preset.maxWidth || preset.width}; padding:${preset.padding}; font-size:${preset.fontSize}; background:#ffffff; border:${preset.border || '1px solid #dbe4f3'}; border-radius:${preset.radius || '24px'}; box-shadow:${preset.shadow || '0 24px 60px rgba(15,23,42,0.16)'}; }
            .receipt header { text-align:center; margin-bottom:16px; }
            .receipt h1 { margin:0; font-size:${preset.heading}; font-weight:700; }
            .receipt .meta { margin:4px 0; color:#64748b; font-size:${preset.meta}; }
            .receipt .rows { margin:16px 0; }
            .receipt .row { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin:8px 0; font-size:${preset.fontSize}; }
            .receipt .row.sub { font-size:${preset.meta}; color:#64748b; padding-inline-start:16px; }
            .receipt .row.note { font-size:${preset.meta}; color:#94a3b8; padding-inline-start:16px; }
            .receipt .row span:last-child { font-weight:600; }
            .receipt .separator { height:1px; background:#e2e8f0; margin:16px 0; }
            .receipt .muted { text-align:center; color:#cbd5f5; margin:24px 0; }
            .receipt .totals strong { display:flex; justify-content:space-between; margin-top:12px; font-size:${preset.total}; }
            footer { margin-top:24px; text-align:center; color:#94a3b8; font-size:${preset.meta}; }
            </style>
            ${"<" + "script>"}
            window.addEventListener('load', function(){
                window.focus();
                setTimeout(function(){ try{ window.print(); } catch(_){} }, 200);
            });
            ${"</" + "script>"}
        </head>
        <body>
            <article class="receipt">
            <header>
                <h1>Mishkah Restaurant</h1>
                <p class="meta">${escapeHTML(t.ui.print_header_address)}: 12 Nile Street</p>
                <p class="meta">${escapeHTML(t.ui.print_header_phone)}: 0100000000</p>
                <p class="meta">${escapeHTML(currentDocLabel)}</p>
            </header>
            <section>
                ${orderMeta}
                ${orderNotesHtml}
            </section>
            <div class="separator"></div>
            <section class="rows">
                ${lineItems || noItems}
            </section>
            <div class="separator"></div>
            <section class="rows totals">
                ${totalsHtml}
                <strong><span>${escapeHTML(t.ui.total)}</span><span>${formatCurrencyValue(db, due)}</span></strong>
                ${paidRow}
                ${changeRow}
                ${paymentsHtml}
            </section>
            <footer>
                <p>${escapeHTML(t.ui.print_footer_thanks)}</p>
                <p>${escapeHTML(t.ui.print_footer_policy)}</p>
                <p>${escapeHTML(t.ui.print_footer_feedback)} • QR</p>
            </footer>
            </article>
        </body>
        </html>`;
    return html;
  }

  function toInputDateTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const pad = (v) => String(v).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const hasIndexedDB = !!((U && (U.IndexedDBX || U.IndexedDB)) && typeof window !== 'undefined' && window.indexedDB);
  let invoiceSequence = 0;
  const ACTIVE_BRANCH_ID = typeof window !== 'undefined' ? (window.__POS_BRANCH_ID__ || null) : null;
  const MODULE_ID = (() => {
    if (typeof window === 'undefined') return 'pos';
    const entry = window.__POS_MODULE_ENTRY__ || {};
    const resolved = entry.moduleId || entry.id || 'pos';
    const text = typeof resolved === 'string' ? resolved.trim() : `${resolved || 'pos'}`;
    return text || 'pos';
  })();

  function createIndexedDBAdapter(name, version) {
    const IndexedDBX = U && (U.IndexedDBX || U.IndexedDB);
    const BRANCH_ID = ACTIVE_BRANCH_ID;
    if (!hasIndexedDB || !IndexedDBX) {
      return {
        available: false,
        async saveOrder() { return false; },
        async saveTempOrder() { return false; },
        async listOrders() { return []; },
        async getOrder() { return null; },
        async getTempOrder() { return null; },
        async listTempOrders() { return []; },
        async deleteTempOrder() { return false; },
        async markSync() { return false; },
        async bootstrap() { return false; },
        async getActiveShift() { return null; },
        async listShifts() { return []; },
        async openShiftRecord(record) { return record || null; },
        async closeShiftRecord() { return null; },
        async nextInvoiceNumber() {
          const id = await allocateInvoiceId();
          const numericValue = Number.isFinite(invoiceSequence) ? invoiceSequence : null;
          return { value: numericValue, id };
        },
        async peekInvoiceCounter() { return 0; },
        async resetAll() { return false; }
      };
    }

    const SHIFT_STORE = 'shifts';
    const META_STORE = 'posMeta';
    const TEMP_STORE = 'order_temp';

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      let text = '';
      let data = null;
      try {
        text = await response.text();
        if (text) {
          data = JSON.parse(text);
        }
      } catch (_err) {
        data = null;
      }
      if (!response.ok) {
        const error = new Error(data?.message || text || `Request failed (${response.status})`);
        error.status = response.status;
        if (data && typeof data === 'object') {
          if (data.error) error.code = data.error;
          if (data.details && typeof data.details === 'object') {
            Object.assign(error, data.details);
            error.details = data.details;
          }
          if (data.order) error.order = data.order;
        }
        throw error;
      }
      if (data !== null) return data;
      return text ? JSON.parse(text) : {};
    }

    async function getJson(url) {
      const response = await fetch(url, { method: 'GET', headers: { 'accept': 'application/json' } });
      if (response.status === 404) return null;
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText || '');
        throw new Error(message || `Request failed (${response.status})`);
      }
      return response.json();
    }

    const db = new IndexedDBX({
      name,
      version: Math.max(1, version | 0) || 1,
      autoBumpVersion: true,
      schema: {
        stores: {
          orders: {
            keyPath: 'id',
            indices: [
              { name: 'by_status', keyPath: 'status' },
              { name: 'by_stage', keyPath: 'fulfillmentStage' },
              { name: 'by_type', keyPath: 'type' }
            ]
          },
          orderLines: { keyPath: 'uid', indices: [{ name: 'by_order', keyPath: 'orderId' }] },
          orderNotes: { keyPath: 'id', indices: [{ name: 'by_order', keyPath: 'orderId' }] },
          orderEvents: { keyPath: 'id', indices: [{ name: 'by_order', keyPath: 'orderId' }] },
          syncLog: { keyPath: 'ts' },
          [SHIFT_STORE]: {
            keyPath: 'id',
            indices: [
              { name: 'by_pos', keyPath: ['posId', 'openedAt'] },
              { name: 'by_pos_status', keyPath: ['posId', 'isClosed'] }
            ]
          },
          [META_STORE]: { keyPath: 'id' },
          [TEMP_STORE]: {
            keyPath: 'id',
            indices: [
              { name: 'by_updated', keyPath: 'updatedAt' }
            ]
          }
        }
      }
    });

    let readyPromise = null;
    const ensureReady = () => {
      if (!readyPromise) {
        readyPromise = (async () => {
          await db.open();
          await db.ensureSchema();
          return db;
        })();
      }
      return readyPromise;
    };

    function normalizeShiftRecord(record) {
      if (!record) return null;
      const base = { ...record };
      base.isClosed = base.isClosed === 1 || base.isClosed === true;
      base.openedAt = base.openedAt || Date.now();
      base.closedAt = base.closedAt || null;
      base.employeeId = base.employeeId || base.cashierId || null;
      if (base.posNumber != null) {
        const numericPos = Number(base.posNumber);
        base.posNumber = Number.isFinite(numericPos) ? numericPos : base.posNumber;
      }
      return base;
    }

    async function getActiveShift(posId) {
      if (!posId) return null;
      await ensureReady();
      const list = await db.byIndex(SHIFT_STORE, 'by_pos_status', { only: [posId, 0] });
      return normalizeShiftRecord(list && list[0] ? list[0] : null);
    }

    async function listShifts({ posId, limit = 50 } = {}) {
      await ensureReady();
      if (!posId) {
        const all = await db.getAll(SHIFT_STORE);
        return all.map(normalizeShiftRecord).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0)).slice(0, limit);
      }
      const rows = await db.byIndex(SHIFT_STORE, 'by_pos', {
        lower: [posId, 0],
        upper: [posId, Number.MAX_SAFE_INTEGER]
      }, 'prev');
      return rows.map(normalizeShiftRecord).slice(0, limit);
    }

    async function writeShift(record) {
      if (!record || !record.id) throw new Error('Shift payload requires id');
      if (!record.posId) throw new Error('Shift payload requires posId');
      const payload = {
        ...record,
        isClosed: record.isClosed ? 1 : 0,
        openedAt: record.openedAt || Date.now(),
        closedAt: record.closedAt || null
      };
      await ensureReady();
      await db.put(SHIFT_STORE, payload);
      return normalizeShiftRecord(payload);
    }

    async function openShiftRecord(record) {
      if (!record || !record.posId) throw new Error('Shift payload requires posId');
      const active = await getActiveShift(record.posId);
      if (active) return active;
      return writeShift({ ...record, isClosed: false, closedAt: null });
    }

    async function closeShiftRecord(id, patch = {}) {
      if (!id) throw new Error('Shift id is required');
      await ensureReady();
      const current = await db.get(SHIFT_STORE, id);
      if (!current) return null;
      const payload = {
        ...current,
        ...patch,
        closedAt: patch.closedAt || Date.now(),
        isClosed: true
      };
      await db.put(SHIFT_STORE, payload);
      return normalizeShiftRecord(payload);
    }

    async function nextInvoiceNumber(posId, prefix) {
      if (!BRANCH_ID) throw new Error('Branch id is required for invoice sequence');
      const payload = await postJson(
        window.basedomain + `/api/branches/${encodeURIComponent(BRANCH_ID)}/modules/${encodeURIComponent(MODULE_ID)}/sequences`,
        {
          table: 'order_header',
          field: 'id',
          record: {
            posId: posId || POS_INFO.id,
            posNumber: Number.isFinite(Number(POS_INFO.number)) ? Number(POS_INFO.number) : null,
            prefix: prefix || POS_INFO.prefix
          }
        }
      );
      if (!payload || !payload.id) {
        throw new Error('Sequence allocation failed');
      }
      const numericValue = Number(payload.value);
      if (Number.isFinite(numericValue)) {
        invoiceSequence = Math.max(invoiceSequence, numericValue);
      }
      return { value: Number.isFinite(numericValue) ? numericValue : null, id: payload.id };
    }

    async function peekInvoiceCounter() {
      return Number.isFinite(invoiceSequence) ? invoiceSequence : 0;
    }

    async function resetAll() {
      try {
        await ensureReady();
      } catch (_) { }
      await db.destroy();
      readyPromise = null;
      return true;
    }

    function hydrateLine(record) {
      const metadata = ensurePlainObject(record.metadata || record.meta || record.payload);
      const rawItemId = record.itemId
        ?? record.item_id
        ?? record.menuItemId
        ?? record.menu_item_id
        ?? record.productId
        ?? record.product_id
        ?? metadata.itemId
        ?? metadata.item_id
        ?? metadata.menuItemId
        ?? metadata.menu_item_id
        ?? metadata.productId
        ?? metadata.product_id
        ?? metadata.itemCode;
      const itemId = rawItemId != null && String(rawItemId).trim() !== '' && String(rawItemId) !== 'null' && String(rawItemId) !== 'undefined'
        ? String(rawItemId).trim()
        : null;
      const menuItem = itemId ? menuIndex?.get(itemId) : null;
      const rawName = record.name
        ?? record.item_name
        ?? record.itemName
        ?? record.item_label
        ?? record.label
        ?? metadata.name
        ?? metadata.itemName
        ?? metadata.item_name
        ?? metadata.item_label
        ?? metadata.label
        ?? null;
      const rawDescription = record.description
        ?? record.item_description
        ?? record.itemDescription
        ?? record.lineDescription
        ?? record.line_description
        ?? metadata.description
        ?? metadata.itemDescription
        ?? metadata.item_description
        ?? metadata.lineDescription
        ?? metadata.line_description
        ?? null;
      const quantity = record.quantity != null ? Number(record.quantity) : (record.qty != null ? Number(record.qty) : 1);
      const unitPriceRaw = Number(record.unitPrice != null ? record.unitPrice
        : record.unit_price != null ? record.unit_price
          : record.price != null ? record.price
            : record.basePrice != null ? record.basePrice
              : menuItem?.price || menuItem?.basePrice || 0);
      const unitPrice = unitPriceRaw > 0 ? unitPriceRaw : ((Number(record.total) > 0 && quantity > 0) ? Number(record.total) / quantity : 0);
      const modifiers = Array.isArray(record.modifiers) ? record.modifiers.map(entry => ({ ...entry })) : [];
      const kitchenSource = record.kitchenSection
        ?? record.kitchenSectionId
        ?? record.kitchen_section_id
        ?? record.stationId
        ?? record.station_id
        ?? record.sectionId
        ?? record.section_id
        ?? metadata.kitchenSectionId
        ?? metadata.sectionId
        ?? metadata.section_id
        ?? metadata.stationId
        ?? metadata.station_id
        ?? menuItem?.kitchenSection;
      const kitchenSection = kitchenSource != null && kitchenSource !== '' ? String(kitchenSource) : 'expo';
      const resolvedName = menuItem ? menuItem.name : cloneName(rawName) || (itemId ? `صنف ${itemId}` : 'صنف غير معروف');
      const resolvedDescription = menuItem ? menuItem.description : cloneName(rawDescription);
      const statusId = record.statusId || record.status_id || record.status || 'draft';
      const baseLine = {
        id: record.id,
        itemId: itemId || null,
        item_id: itemId || null,
        name: resolvedName,
        description: resolvedDescription,
        quantity,
        qty: quantity,
        unitPrice: round(unitPrice),
        unit_price: round(unitPrice),
        price: round(unitPrice),
        basePrice: round(unitPrice),
        modifiers,
        statusId,
        status_id: statusId,
        status: statusId,
        stage: record.stage,
        kitchenSection,
        kitchenSectionId: kitchenSection,
        kitchen_section_id: kitchenSection,
        locked: !!record.locked,
        notes: Array.isArray(record.notes) ? record.notes : [],
        discount: normalizeDiscount(record.discount),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        version: Number.isFinite(Number(record.version)) ? Number(record.version) : 1
      };
      const priced = applyLinePricing(baseLine);
      if (record.total != null && Number.isFinite(Number(record.total))) {
        priced.total = round(record.total);
      }
      return priced;
    }

    async function hydrateOrder(header) {
      await ensureReady();
      const [linesRaw, notesRaw, eventsRaw] = await Promise.all([
        db.byIndex('orderLines', 'by_order', { only: header.id }),
        db.byIndex('orderNotes', 'by_order', { only: header.id }),
        db.byIndex('orderEvents', 'by_order', { only: header.id })
      ]);
      return {
        ...header,
        lines: linesRaw.map(hydrateLine).filter(Boolean),
        notes: notesRaw.map(note => ({
          id: note.id,
          message: note.message,
          authorId: note.authorId,
          authorName: note.authorName,
          createdAt: note.createdAt
        })),
        discount: normalizeDiscount(header.discount),
        dirty: false,
        events: eventsRaw.map(evt => ({ id: evt.id, stage: evt.stage, status: evt.status, at: evt.at, actorId: evt.actorId }))
      };
    }

    function normalizePersistedOrder(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const metadata = { ...ensurePlainObject(raw.metadata || raw.meta) };
      // Rebuild totals from flat fields if totals object is empty
      const rawTotals = ensurePlainObject(raw.totals);
      const hasTotalsObject = rawTotals && Object.keys(rawTotals).length > 0;
      const totals = hasTotalsObject ? { ...rawTotals } : {
        subtotal: round(Number(raw.subtotal || 0)),
        service: round(Number(raw.service_amount || raw.serviceAmount || 0)),
        vat: round(Number(raw.tax_amount || raw.taxAmount || raw.vat || 0)),
        discount: round(Number(raw.discount_amount || raw.discountAmount || 0)),
        deliveryFee: round(Number(raw.delivery_fee || raw.deliveryFee || 0)),
        due: round(Number(raw.total_due || raw.totalDue || raw.total || 0))
      };
      const base = {
        ...raw,
        metadata,
        totals,
        discount: normalizeDiscount(raw.discount),
        // ✅ CRITICAL FIX: Backend sends orderTypeId, not type!
        type: raw.type || raw.orderTypeId || raw.order_type_id || raw.orderType || raw.order_type || metadata.orderType || metadata.orderTypeId || 'dine_in',
        status: raw.status || raw.statusId || raw.status_id || 'open',
        fulfillmentStage: raw.fulfillmentStage || raw.stage || raw.stageId || raw.stage_id || 'new',
        paymentState:
          raw.paymentState || raw.payment_state || raw.paymentStateId || raw.payment_state_id || 'unpaid',
        shiftId: raw.shiftId || raw.shift_id || metadata.shiftId || metadata.shift_id || null
      };
      //console.log(base);
      base.createdAt = toTimestamp(raw.createdAt || raw.created_at || raw.openedAt || raw.opened_at || base.createdAt);
      base.updatedAt = toTimestamp(raw.updatedAt || raw.updated_at || base.updatedAt || base.createdAt);
      base.savedAt = toTimestamp(raw.savedAt || raw.saved_at || base.savedAt || base.updatedAt);
      base.stage = base.fulfillmentStage;
      base.stageId = base.fulfillmentStage;
      base.statusId = base.status;
      base.payment_state = base.paymentState;
      base.paymentStateId = base.paymentState;
      // ✅ Support both tableIds (camelCase) and table_ids (snake_case) from backend
      const tableIdsSource = raw.tableIds || raw.table_ids || raw.tableId || metadata.tableIds || metadata.table_ids;
      base.tableIds = Array.isArray(tableIdsSource)
        ? tableIdsSource.slice()
        : (tableIdsSource ? [tableIdsSource] : []);
      // //console.log(tableIdsSource,"tableIdsSource");
      // //console.log(raw);
      base.guests = Number.isFinite(Number(base.guests)) ? Number(base.guests) : 0;
      base.allowAdditions = base.allowAdditions !== undefined ? !!base.allowAdditions : true;
      base.lockLineEdits = base.lockLineEdits !== undefined ? !!base.lockLineEdits : true;
      if (base.posNumber == null && metadata.posNumber != null) {
        base.posNumber = metadata.posNumber;
      }
      const linesSource = Array.isArray(raw.lines) ? raw.lines : [];
      base.lines = linesSource
        .map(line => {
          if (!line) return null;
          const payload = { ...line, metadata: ensurePlainObject(line.metadata || line.meta || line.payload) };
          return hydrateLine(payload);
        })
        .filter(Boolean);

      const notes = Array.isArray(raw.notes)
        ? raw.notes
          .map(note => {
            if (!note) return null;
            const message =
              typeof note === 'string'
                ? note.trim()
                : typeof note.message === 'string'
                  ? note.message.trim()
                  : typeof note.text === 'string'
                    ? note.text.trim()
                    : '';
            if (!message) return null;
            const createdAt =
              note.createdAt || note.created_at || note.at || note.timestamp || base.updatedAt || Date.now();
            return {
              id:
                note.id ||
                note.noteId ||
                note.note_id ||
                `${base.id || 'order'}::note::${String(createdAt)}`,
              message,
              authorId: note.authorId || note.author_id || note.userId || note.user_id || null,
              authorName: note.authorName || note.author_name || note.userName || '',
              createdAt
            };
          })
          .filter(Boolean)
        : [];
      base.notes = notes;
      const payments = Array.isArray(raw.payments)
        ? raw.payments.map(entry => ({
          ...entry,
          id:
            entry.id ||
            entry.paymentId ||
            entry.payment_id ||
            `${base.id || 'order'}::pm::${Math.random().toString(36).slice(2, 10)}`,
          method: entry.method || entry.methodId || entry.method_id || entry.type || 'cash',
          amount: round(Number(entry.amount) || 0)
        }))
        : [];
      base.payments = payments;
      const mapEvent = (entry) => {
        if (!entry) return null;
        const at = toTimestamp(entry.changedAt || entry.changed_at || entry.at || entry.timestamp || base.updatedAt);
        const stage = entry.stage || entry.stageId || entry.stage_id || base.fulfillmentStage;
        const status = entry.status || entry.statusId || entry.status_id || base.status;
        const paymentState =
          entry.paymentState || entry.payment_state || entry.paymentStateId || entry.payment_state_id || null;
        return {
          id: entry.id || `${base.id || 'order'}::evt::${String(at)}`,
          stage,
          stageId: stage,
          status,
          statusId: status,
          at,
          changedAt: at,
          actorId: entry.actorId || entry.actor_id || entry.userId || entry.user_id || entry.changedBy || null,
          paymentState,
          paymentStateId: paymentState,
          metadata: ensurePlainObject(entry.metadata || entry.meta)
        };
      };
      const eventsPrimary = Array.isArray(raw.statusLogs) ? raw.statusLogs : [];
      const eventsSecondary = Array.isArray(raw.events) ? raw.events : [];
      const seenEvents = new Set();
      const normalizedEvents = [];
      [...eventsPrimary, ...eventsSecondary].forEach(entry => {
        const mapped = mapEvent(entry);
        if (!mapped) return;
        if (mapped.id && seenEvents.has(mapped.id)) return;
        if (mapped.id) seenEvents.add(mapped.id);
        normalizedEvents.push(mapped);
      });
      normalizedEvents.sort((a, b) => (a.at || 0) - (b.at || 0));
      base.events = normalizedEvents.map(event => ({ ...event }));
      base.statusLogs = normalizedEvents.map(event => ({ ...event }));
      metadata.linesCount = base.lines.length;
      metadata.notesCount = base.notes.length;
      base.isPersisted = true;
      base.dirty = false;
      return syncOrderVersionMetadata(base);
    }

    async function saveOrder(order) {
      if (!BRANCH_ID) throw new Error('Branch id is required');
      if (!order || !order.shiftId) {
        throw new Error('Order payload requires an active shift');
      }
      const endpoint = window.basedomain + `/api/branches/${encodeURIComponent(BRANCH_ID)}/modules/${encodeURIComponent(MODULE_ID)}/orders`;
      const outgoing = { ...order };
      const expectedVersion = Number(order?.expectedVersion);
      const currentVersion = Number(order?.version);
      if (Number.isFinite(expectedVersion) && expectedVersion > 0) {
        outgoing.version = expectedVersion;
      } else if (Number.isFinite(currentVersion) && currentVersion > 0) {
        outgoing.version = currentVersion;
      }

      // ✅ CRITICAL FIX: Sanitize payload to prevent JSON serialization errors
      // Remove any non-serializable data (functions, undefined, circular refs, etc.)
      let sanitizedOrder;
      try {
        sanitizedOrder = JSON.parse(JSON.stringify({ order: outgoing }));
      } catch (sanitizeError) {
        console.error('[POS][saveOrder] ❌ Failed to sanitize order payload:', sanitizeError);
        console.error('[POS][saveOrder] Problematic order:', outgoing);
        throw new Error(`Order contains non-serializable data: ${sanitizeError.message}`);
      }

      const payload = await postJson(endpoint, sanitizedOrder);
      return payload?.order ? normalizePersistedOrder(payload.order) : order;
    }
    function sanitizeTempOrder(order) {
      if (!order || !order.id) return null;
      const now = Date.now();
      const type = order.type || 'dine_in';
      const normalizedDiscount = normalizeDiscount(order.discount);
      const normalizedLines = Array.isArray(order.lines)
        ? order.lines.map(line => ({
          ...line,
          discount: normalizeDiscount(line.discount)
        }))
        : [];
      const normalizedNotes = Array.isArray(order.notes)
        ? order.notes.map(note => ({ ...note }))
        : [];
      const normalizedPayments = Array.isArray(order.payments)
        ? order.payments.map(pay => ({ ...pay, amount: Number(pay.amount) || 0 }))
        : [];
      const payload = {
        ...order,
        id: order.id,
        type,
        status: order.status || 'open',
        fulfillmentStage: order.fulfillmentStage || order.stage || 'new',
        paymentState: order.paymentState || 'unpaid',
        tableIds: Array.isArray(order.tableIds) ? order.tableIds.slice() : [],
        guests: Number.isFinite(order.guests) ? Number(order.guests) : 0,
        totals: order.totals && typeof order.totals === 'object' ? { ...order.totals } : {},
        discount: normalizedDiscount,
        notes: normalizedNotes,
        lines: normalizedLines,
        payments: normalizedPayments,
        customerId: order.customerId || null,
        customerAddressId: order.customerAddressId || null,
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        customerAddress: order.customerAddress || '',
        customerAreaId: order.customerAreaId || null,
        createdAt: order.createdAt || now,
        updatedAt: order.updatedAt || now,
        savedAt: order.savedAt || now,
        isPersisted: false,
        dirty: true,
        allowAdditions: order.allowAdditions !== undefined ? !!order.allowAdditions : true,
        lockLineEdits: order.lockLineEdits !== undefined ? !!order.lockLineEdits : false,
        posId: order.posId || order.metadata?.posId || null,
        posLabel: order.posLabel || order.metadata?.posLabel || null,
        posNumber: Number.isFinite(order.posNumber) ? Number(order.posNumber)
          : (Number.isFinite(order.metadata?.posNumber) ? Number(order.metadata.posNumber) : null)
      };
      return {
        id: payload.id,
        payload,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt
      };
    }

    async function saveTempOrder() {
      return false;
    }
    function hydrateTempRecord(record) {
      if (!record) return null;
      const payload = record.payload || record.data || null;
      if (!payload) return null;
      return {
        ...payload,
        id: record.id,
        createdAt: payload.createdAt || record.createdAt || Date.now(),
        updatedAt: payload.updatedAt || record.updatedAt || Date.now(),
        savedAt: payload.savedAt || record.updatedAt || Date.now(),
        isPersisted: false,
        dirty: true
      };
    }

    async function getTempOrder() {
      return null;
    }
    async function listTempOrders() {
      return [];
    }
    async function deleteTempOrder() {
      return false;
    }
    async function listOrders(options = {}) {
      if (!BRANCH_ID) return [];
      const params = new URLSearchParams();
      const includeTokens = new Set();
      const onlyActive = options.onlyActive !== false;
      if (!onlyActive) {
        params.set('onlyActive', 'false');
      }
      if (Number.isFinite(options.limit) && options.limit > 0) {
        params.set('limit', String(Math.trunc(options.limit)));
      }
      const ensureListInput = (value) => {
        if (value == null) return [];
        return Array.isArray(value) ? value : [value];
      };
      const pushListParam = (key, values) => {
        ensureListInput(values).forEach(value => {
          if (value == null) return;
          const text = String(value).trim();
          if (text) {
            params.append(key, text);
          }
        });
      };
      pushListParam('status', ensureListInput(options.statuses ?? options.status));
      pushListParam('stage', ensureListInput(options.stages ?? options.stage));
      pushListParam('type', ensureListInput(options.types ?? options.type));
      pushListParam('shiftId', ensureListInput(options.shiftIds ?? options.shiftId));
      if (options.updatedAfter != null) {
        params.set('updatedAfter', String(options.updatedAfter));
      }
      if (options.savedAfter != null) {
        params.set('savedAfter', String(options.savedAfter));
      }
      const includeList = Array.isArray(options.include) ? options.include : [];
      includeList.forEach(entry => {
        if (entry == null) return;
        const text = String(entry).trim().toLowerCase();
        if (text) includeTokens.add(text);
      });
      const includeLines = options.includeLines !== false;
      const includePayments = options.includePayments !== false;
      const includeStatusLogs = options.includeStatusLogs === true || includeTokens.has('statuslogs');
      const includeLineStatusLogs = options.includeLineStatus === true || options.includeLineStatusLogs === true;
      if (includeLines) includeTokens.add('lines');
      if (includePayments) includeTokens.add('payments');
      if (includeStatusLogs) includeTokens.add('statuslogs');
      if (includeLineStatusLogs) {
        includeTokens.add('linestatuslogs');
        includeTokens.add('lines');
      }
      if (includeTokens.size) {
        params.set('include', Array.from(includeTokens.values()).join(','));
      }
      const query = params.toString();
      const endpoint = window.basedomain + `/api/branches/${encodeURIComponent(BRANCH_ID)}/modules/${encodeURIComponent(MODULE_ID)}/orders${query ? `?${query}` : ''}`;
      const payload = await getJson(endpoint);
      const list = Array.isArray(payload?.orders) ? payload.orders : [];
      return list.map(normalizePersistedOrder).filter(Boolean);
    }
    async function getOrder(orderId) {
      if (!BRANCH_ID || !orderId) return null;
      const url = window.basedomain + `/api/branches/${encodeURIComponent(BRANCH_ID)}/modules/${encodeURIComponent(MODULE_ID)}/orders/${encodeURIComponent(orderId)}`;
      const payload = await getJson(url);
      return payload?.order ? normalizePersistedOrder(payload.order) : null;
    }
    async function markSync() {
      await ensureReady();
      await db.put('syncLog', { ts: Date.now() });
      return true;
    }

    async function bootstrap(initialOrders) {
      if (!Array.isArray(initialOrders) || !initialOrders.length) return false;
      const existing = await listOrders({ onlyActive: false });
      if (existing.length) return false;
      for (const order of initialOrders) {
        try { await saveOrder(order); } catch (_) { }
      }
      return true;
    }

    return {
      available: true,
      saveOrder,
      saveTempOrder,
      listOrders,
      getOrder,
      getTempOrder,
      listTempOrders,
      deleteTempOrder,
      markSync,
      bootstrap,
      getActiveShift,
      listShifts,
      openShiftRecord,
      closeShiftRecord,
      nextInvoiceNumber,
      peekInvoiceCounter,
      resetAll,
      supportsTempOrders: false
    };
  }

  const resolveShiftTableName = () => POS_TABLE_HANDLES?.posShift || POS_TABLE_HANDLES?.pos_shift || 'pos_shift';

  const insertShiftRemote = async (record) => {
    const store = window.__POS_DB__;
    if (!store || typeof store.insert !== 'function') return null;
    const table = resolveShiftTableName();
    const nowIso = toIsoString(record?.openedAt || Date.now());
    const payload = {
      ...record,
      status: record?.status || 'open',
      isClosed: !!record?.isClosed,
      openedAt: nowIso,
      closedAt: record?.closedAt ? toIsoString(record.closedAt) : null,
      createdAt: toIsoString(record?.createdAt || nowIso),
      updatedAt: toIsoString(record?.updatedAt || nowIso),
      version: Number.isFinite(record?.version) ? Math.max(1, Math.trunc(record.version)) : 1
    };
    const inserted = await store.insert(table, payload);
    return inserted || payload;
  };

  const updateShiftRemote = async (record) => {
    const store = window.__POS_DB__;
    if (!store || typeof store.update !== 'function') return null;
    if (!record || !record.id) return null;
    const table = resolveShiftTableName();
    const currentVersion = Number.isFinite(record.version) ? Math.trunc(record.version) : 1;
    const nextVersion = currentVersion + 1;
    const payload = {
      ...record,
      version: nextVersion,
      updatedAt: toIsoString(record.updatedAt || Date.now()),
      closedAt: record.closedAt ? toIsoString(record.closedAt) : null,
      openedAt: toIsoString(record.openedAt || record.createdAt || Date.now())
    };
    const updated = await store.update(table, payload);
    return updated || payload;
  };

  function createKDSBridge(url) {
    let socket = null;
    return {
      connect(ctx) {
        const state = ctx.getState();
        const t = getTexts(state);
        if (socket) {
          try { socket.close(); } catch (_) { }
        }
        if (!('WebSocket' in window)) {
          UI.pushToast(ctx, { title: t.toast.kdsUnavailable, icon: '⚠️' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            status: {
              ...s.data.status,
              kds: { ...(s.data.status?.kds || {}), state: 'idle' }
            }
          }
        }));
        try {
          socket = new WebSocket(url);
        } catch (error) {
          UI.pushToast(ctx, { title: t.toast.kdsFailed, message: String(error), icon: '🛑' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'offline' } }
            }
          }));
          return;
        }
        socket.onopen = () => {
          UI.pushToast(ctx, { title: t.toast.kdsConnected, icon: '✅' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'online' } }
            }
          }));
        };
        socket.onclose = () => {
          UI.pushToast(ctx, { title: t.toast.kdsClosed, icon: 'ℹ️' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'offline' } }
            }
          }));
        };
        socket.onerror = () => {
          UI.pushToast(ctx, { title: t.toast.kdsFailed, icon: '🛑' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'offline' } }
            }
          }));
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.type === 'pong') {
              UI.pushToast(ctx, { title: 'KDS', message: t.toast.kdsPong, icon: '🍳', ttl: 1600 });
            }
          } catch (_) { }
        };
      }
    };
  }

  const ensureList = (U.Data && typeof U.Data.ensureArray === 'function')
    ? U.Data.ensureArray
    : (value) => Array.isArray(value) ? value : value == null ? [] : [value];

  const coalesce = (U.Data && typeof U.Data.coalesce === 'function')
    ? U.Data.coalesce
    : (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
      return null;
    };

  function toIdentifier(...candidates) {
    for (const candidate of candidates) {
      if (candidate == null) continue;
      const str = String(candidate).trim();
      if (str) return str;
    }
    return '';
  }

  function toLocaleObject(ar, en) {
    if (!ar && !en) return null;
    return {
      ar: ar || en || '',
      en: en || ar || ''
    };
  }

  function pickLocalizedText(...candidates) {
    for (const candidate of candidates) {
      if (candidate == null) continue;
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      } else if (typeof candidate === 'object') {
        if (candidate.ar || candidate.en) {
          return {
            ar: candidate.ar || candidate.en || '',
            en: candidate.en || candidate.ar || ''
          };
        }
        if (candidate.name || candidate.label) {
          const nested = pickLocalizedText(candidate.name, candidate.label);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  function localizeValue(value, lang, fallback = '') {
    if (value == null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (lang === 'ar') return value.ar || value.en || fallback;
      return value.en || value.ar || fallback;
    }
    return fallback;
  }

  function normalizeIso(value) {
    if (!value && value !== 0) return new Date().toISOString();
    try {
      const date = typeof value === 'number' ? new Date(value) : new Date(value);
      return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
    } catch (_err) {
      return new Date().toISOString();
    }
  }

  /**
   * Extracts display-friendly order number prefix from full unique ID
   * Example: "DAR-001005-1e7a48ec-425a-4268-81db-c8f3fd4d432e-1763040999484" → "DAR-001005"
   * @param {string} fullOrderNumber - Full unique order ID
   * @returns {string} Display-friendly order number prefix
   */
  function extractOrderNumberPrefix(fullOrderNumber) {
    if (!fullOrderNumber || typeof fullOrderNumber !== 'string') return '';
    const str = fullOrderNumber.trim();

    // Pattern: PREFIX-NUMBER-UUID-UUID-TIMESTAMP
    // We want only: PREFIX-NUMBER
    const parts = str.split('-');

    // If it's a simple number or already short, return as is
    if (parts.length <= 2) return str;

    // Check if 3rd part looks like UUID (hex characters, length >= 8)
    const thirdPart = parts[2];
    if (thirdPart && thirdPart.length >= 8 && /^[0-9a-f]+$/i.test(thirdPart)) {
      // Return only first two parts (PREFIX-NUMBER)
      return `${parts[0]}-${parts[1]}`;
    }

    // Otherwise return as is
    return str;
  }

  function deriveTableLabel(order, state) {
    const tableIds = Array.isArray(order.tableIds) ? order.tableIds : [];
    if (!tableIds.length) return null;
    const tables = Array.isArray(state.data?.tables) ? state.data.tables : [];
    const table = tables.find(tbl => String(tbl.id) === String(tableIds[0]));
    return table ? (table.name || table.label || table.id) : tableIds[0];
  }

  async function serializeOrderForKDS(order, state) {
    if (!order || !order.id) return null;
    const createdIso = normalizeIso(order.createdAt || order.savedAt || Date.now());
    const updatedIso = normalizeIso(order.updatedAt || order.savedAt || Date.now());
    const serviceMode = order.type || 'dine_in';
    const tableLabel = deriveTableLabel(order, state);
    const customerName = order.customerName || order.customer?.name || '';
    const linesRaw = Array.isArray(order.lines) ? order.lines : [];
    const lines = linesRaw.filter(Boolean);
    if (!lines.length) return null;

    // ✅ CRITICAL: Log notes before serialization
    //console.log('📝📝📝 [KDS NOTES] serializeOrderForKDS notes check:', {
    //  orderId: order.id,
    //  'order.notes': order.notes,
    //  'order.notes type': typeof order.notes,
    //  'order.notes isArray': Array.isArray(order.notes),
    //  'order.notes.length': order.notes?.length,
    //  'notesToText result': notesToText(order.notes, '; ')
    //});

    //console.log('🔍 [REOPEN DEBUG] serializeOrderForKDS input:', {
    //  orderId: order.id,
    //  'order.isPersisted': order.isPersisted,
    //  'order.status': order.status,
    //  'order.fulfillmentStage': order.fulfillmentStage,
    //  totalLines: lines.length,
    //  linesIsPersisted: lines.map((l, i) => `[${i}]: ${l.isPersisted}`).join(', ')
    //});

    // ✅ CRITICAL: Check database to see which lines already have job_order_detail
    // Don't rely on isPersisted flag alone - it may be wrong!
    const store = typeof window !== 'undefined' && window.__POS_DB__ ? window.__POS_DB__ : null;
    let alreadySentLineIds = new Set();

    //console.log('🔍 [DATABASE CHECK] Store availability:', {
    //  hasWindow: typeof window !== 'undefined',
    //  hasStore: !!store,
    //  hasQueryMethod: store && typeof store.query === 'function'
    //});

    // ✅ CRITICAL FIX: Use window.database instead of store.query (which doesn't exist!)
    if (typeof window !== 'undefined' && window.database && Array.isArray(window.database.job_order_header) && Array.isArray(window.database.job_order_detail)) {
      try {
        //console.log('🔍 [DATABASE CHECK] Starting query for orderId:', order.id);

        // ✅ STEP 1: Filter job_order_header to get all jobOrderIds for this order
        const existingJobHeaders = window.database.job_order_header.filter(h => {
          const headerOrderId = h.orderId || h.order_id;
          return headerOrderId === order.id;
        });

        //console.log('🔍 [DATABASE CHECK] Found existing job_order_header:', {
        //  orderId: order.id,
        //  count: existingJobHeaders.length,
        //  jobOrderIds: existingJobHeaders.map(h => h.id),
        //  sample: existingJobHeaders.slice(0, 2),
        //  totalInDatabase: window.database.job_order_header.length
        //});

        // ✅ STEP 2: For each jobOrderId, filter job_order_detail
        for (const jobHeader of existingJobHeaders) {
          const jobOrderId = jobHeader.id;
          const existingJobDetails = window.database.job_order_detail.filter(d => {
            const detailJobId = d.jobOrderId || d.job_order_id;
            return detailJobId === jobOrderId;
          });

          //console.log(`🔍 [DATABASE CHECK] Found existing job_order_detail for job ${jobOrderId}:`, {
          //  count: existingJobDetails.length,
          //  details: existingJobDetails.map(d => ({ id: d.id, orderLineId: d.orderLineId || d.order_line_id, itemName: d.itemNameEn }))
          //});

          existingJobDetails.forEach(detail => {
            const lineId = detail.orderLineId || detail.order_line_id;
            if (lineId) {
              alreadySentLineIds.add(String(lineId));
              //console.log(`➕ [DATABASE CHECK] Added lineId to alreadySent set:`, lineId);
            }
          });
        }

        //console.log('🔍 [DATABASE CHECK] Already sent line IDs:', {
        //  orderId: order.id,
        //  alreadySentCount: alreadySentLineIds.size,
        //  lineIds: Array.from(alreadySentLineIds)
        //});
      } catch (err) {
        console.error('❌ [DATABASE CHECK] Failed to check existing job_order_detail:', err);
        console.error('❌ [CRITICAL] This will cause RE-MANUFACTURING of all items!');
      }
    } else {
      console.error('❌ [DATABASE CHECK] window.database not available - cannot check existing job_order_detail');
      console.error('❌ [CRITICAL] This will cause RE-MANUFACTURING of all items!', {
        hasWindow: typeof window !== 'undefined',
        hasStore: !!store,
        hasQueryMethod: store && typeof store.query === 'function'
      });
    }

    // ✅ CRITICAL WARNING: If we couldn't query existing jobs, we're about to duplicate everything!
    if (alreadySentLineIds.size === 0 && order.isPersisted === true) {
      console.error('⚠️⚠️⚠️ [CRITICAL WARNING] Order is persisted but no existing job_order_detail found!');
      console.error('⚠️ This indicates either:');
      console.error('⚠️ 1. Query failed (check errors above)');
      console.error('⚠️ 2. Order was saved without job_orders (data inconsistency)');
      console.error('⚠️ 3. Database is not in sync');
      console.error('⚠️ Proceeding will RE-MANUFACTURE all items!', {
        orderId: order.id,
        isPersisted: order.isPersisted,
        totalLines: lines.length
      });
    }

    // ✅ CRITICAL: Filter out lines that already have job_order_detail
    const linesToSendToKitchen = lines.filter((line, index) => {
      const lineIndex = index + 1;

      // ✅ CRITICAL FIX: Use EXACT SAME logic as baseLineId generation below!
      // This ensures we match what was saved in job_order_detail.orderLineId
      const primaryLineId = toIdentifier(line.id, line.uid, line.storageId);
      const fallbackLineId = `${order.id}-line-${lineIndex}`;

      // ⚠️ CRITICAL WARNING: If line.id is missing, we fall back to lineIndex
      // This is DANGEROUS because lineIndex changes if lines are added/removed/reordered!
      // This will cause RE-MANUFACTURING of items that already have job_orders!
      if (!line.id && !line.uid && !line.storageId) {
        //console.warn('⚠️ [LINE ID MISSING] line.id is not set - using lineIndex fallback (UNSTABLE!):', {
        //  lineIndex,
        //  fallbackLineId,
        //  itemName: line.name,
        //  warning: 'This line may be RE-MANUFACTURED if order is modified!'
        //});
      }

      // ✅ Use same fallback priority as in insert
      const baseLineId = toIdentifier(line.id, line.uid, line.storageId, fallbackLineId) || fallbackLineId;

      // ✅ Check if this exact ID was already sent
      const alreadySent = alreadySentLineIds.has(baseLineId);

      //console.log('🔍 [LINE CHECK]', {
      //  lineIndex,
      //  baseLineId,
      //  primaryLineId,
      //  fallbackLineId,
      //  itemName: line.name,
      //  alreadySent,
      //  'line.isPersisted': line.isPersisted,
      //  'line.id': line.id,
      //  'alreadySentLineIds': Array.from(alreadySentLineIds)
      //});

      if (alreadySent) {
        //console.log('⏭️ [SKIP LINE] Line already sent to kitchen:', {
        //  baseLineId,
        //  itemName: line.name,
        //  reason: 'Found in job_order_detail'
        //});
      }

      return !alreadySent;  // ✅ Only send NEW lines!
    });

    // ✅ Determine if this is a reopened order (has items that were already sent)
    const isReopenedOrder = alreadySentLineIds.size > 0 && linesToSendToKitchen.length < lines.length;

    //console.log('🔍 [REOPEN DEBUG] Lines to send to kitchen:', {
    //  linesToSendCount: linesToSendToKitchen.length,
    //  totalLines: lines.length,
    //  skippedCount: lines.length - linesToSendToKitchen.length,
    //  isReopenedOrder,
    //  filtered: linesToSendToKitchen.map(l => ({ id: l.id, name: l.name }))
    //});

    if (!linesToSendToKitchen.length) {
      //console.log('✅ [KDS] No new lines to send - all items already in kitchen');
      return null;  // No job_order if no new lines
    }

    const kitchenSections = Array.isArray(state.data?.kitchenSections) ? state.data.kitchenSections : [];
    const sectionMap = new Map(kitchenSections.map(section => [section.id, section]));
    const jobsMap = new Map();
    const jobDetails = [];
    const jobModifiers = [];
    const historyEntries = [];

    // ✅ Build category route index for automatic station assignment
    const stationCategoryRoutes = Array.isArray(state.data?.stationCategoryRoutes) ? state.data.stationCategoryRoutes : [];
    const categoryRouteIndex = new Map();
    stationCategoryRoutes.forEach((route) => {
      if (!route?.categoryId || !route?.stationId) return;
      const categoryId = String(route.categoryId || '').toLowerCase().trim();
      const stationId = String(route.stationId || '').toLowerCase().trim();
      if (!categoryId || !stationId) return;
      const bucket = categoryRouteIndex.get(categoryId) || [];
      bucket.push({ ...route, categoryId, stationId });
      categoryRouteIndex.set(categoryId, bucket);
    });
    // Sort by priority and filter active routes
    categoryRouteIndex.forEach((bucket, key) => {
      const sorted = bucket
        .slice()
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));
      const active = sorted.filter((route) => route.isActive !== false);
      categoryRouteIndex.set(key, active.length ? active : sorted);
    });
    const resolveStationForCategory = (categoryId) => {
      if (!categoryId) return null;
      const key = String(categoryId).toLowerCase().trim();
      const bucket = categoryRouteIndex.get(key);
      if (bucket && bucket.length) return bucket[0].stationId;
      return null;
    };

    // ✅ CRITICAL FIX: ALWAYS use Date.now() for batchId
    // This ensures each save creates UNIQUE job_orders
    // Using order.updatedAt would cause overwriting existing job_orders when adding items
    // batchId groups all job_orders created in the same save operation
    const batchId = `BATCH-${order.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    if (isReopenedOrder) {
      //console.log('🔄 [KDS REOPEN] Creating job_order for NEW items only:', {
      //  orderId: order.id,
      //  totalLines: lines.length,
      //  newLines: linesToSendToKitchen.length,
      //  oldPersistedLines: lines.length - linesToSendToKitchen.length
      //});
    }

    // ✅ STEP 1: Group lines by stationId first (CRITICAL for proper 1-to-1 mapping!)
    // This ensures one job_order_header per station, not per line
    const linesByStation = new Map();

    linesToSendToKitchen.forEach((line, index) => {
      const lineIndex = index + 1;
      // ✅ Check all variants of kitchenSection field
      const kitchenSectionSource = line.kitchenSection || line.kitchenSectionId || line.kitchen_section_id || line.kitchen_section;
      const resolvedStation = toIdentifier(kitchenSectionSource);

      // ✅ CRITICAL FIX: If no kitchenSection, try to resolve from categoryId
      let stationId = resolvedStation;
      if (!stationId) {
        const categoryId = line.categoryId || line.category_id || line.menuCategoryId || line.menu_category_id;
        if (categoryId) {
          stationId = resolveStationForCategory(categoryId);
        }
      }
      // Final fallback to 'general' (not 'expo', to avoid mixing all items)
      stationId = stationId || 'general';

      // 🔍 DEBUG: Log kitchen section resolution
      if (!resolvedStation || resolvedStation === 'expo' || stationId === 'general') {
        //console.log('[POS][serializeOrderForKDS] Line kitchen section resolution:', {
        //  lineId: line.id,
        //  itemId: line.itemId,
        //  itemName: line.name,
        //  kitchenSection: line.kitchenSection,
        //  categoryId: line.categoryId || line.category_id,
        //  resolvedStation,
        //  finalStationId: stationId,
        //  method: resolvedStation ? 'explicit' : (stationId !== 'general' ? 'category-route' : 'fallback')
        //});
      }

      // Group lines by station
      if (!linesByStation.has(stationId)) {
        linesByStation.set(stationId, []);
      }
      linesByStation.get(stationId).push({ line, lineIndex });
    });

    // ✅ STEP 2: Create ONE job_order_header per station (not per line!)
    // This fixes the 1-to-1 violation: each order_line gets ONE job_order_detail
    linesByStation.forEach((linesGroup, stationId) => {
      // Create jobId ONCE per station (not per line!)
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const jobId = `${order.id}-${stationId}-${timestamp}-${random}`;

      const section = sectionMap.get(stationId) || {};
      const stationCode = section.code || (stationId ? String(stationId).toUpperCase() : 'KDS');
      const fullOrderNumber = order.orderNumber || order.invoiceId || order.id;
      const displayOrderNumber = extractOrderNumberPrefix(fullOrderNumber);

      // Create job_order_header for this station
      const job = {
        id: jobId,
        orderId: order.id,
        orderNumber: displayOrderNumber,
        posRevision: `${order.id}@${order.updatedAt || Date.now()}`,
        orderTypeId: serviceMode,
        serviceMode,
        stationId,
        stationCode,
        status: 'queued',
        progressState: 'awaiting',
        totalItems: 0,
        completedItems: 0,
        remainingItems: 0,
        hasAlerts: false,
        isExpedite: false,
        tableLabel: tableLabel || null,
        customerName: customerName || null,
        dueAt: order.dueAt ? normalizeIso(order.dueAt) : createdIso,
        acceptedAt: createdIso,
        startedAt: null,
        readyAt: null,
        completedAt: null,
        expoAt: null,
        syncChecksum: `${order.id}-${stationId}`,
        notes: notesToText(order.notes, '; '),
        batchId,  // ✅ For grouping in static tabs (expo/handoff)
        meta: { orderSource: 'pos', kdsTab: stationId },
        createdAt: createdIso,
        updatedAt: updatedIso
      };

      // Add all lines for this station
      linesGroup.forEach(({ line, lineIndex }) => {
        const quantityValue = coalesce(line.qty, line.quantity, line.count, 1);
        let quantity = Number(quantityValue);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          quantity = 1;
        }
        job.totalItems += quantity;
        job.remainingItems += quantity;

        const baseLineId = toIdentifier(line.id, line.uid, line.storageId, `${order.id}-line-${lineIndex}`) || `${order.id}-line-${lineIndex}`;
        const detailId = `${jobId}-detail-${baseLineId}`;
        const itemIdentifier = toIdentifier(line.itemId, line.productId, line.menuItemId, line.sku, baseLineId) || baseLineId;
        const displayIdentifier = itemIdentifier && itemIdentifier !== baseLineId ? itemIdentifier : '';
        const nameSource = pickLocalizedText(
          line.name,
          line.displayName,
          line.label,
          toLocaleObject(line.nameAr, line.nameEn),
          toLocaleObject(line.itemNameAr, line.itemNameEn),
          line.productName,
          line.product?.name,
          line.product?.title,
          line.menuItem?.name,
          line.menuItem?.title,
          line.menuItem?.displayName
        ) || (displayIdentifier ? displayIdentifier : null);
        const fallbackNameAr = displayIdentifier || `عنصر ${lineIndex}`;
        const fallbackNameEn = displayIdentifier || `Item ${lineIndex}`;

        // Create job_order_detail (1-to-1 with order_line!)
        const detail = {
          id: detailId,
          jobOrderId: jobId,
          orderLineId: baseLineId,  // ✅ UNIQUE: Each order_line maps to ONE detail
          order_line_id: baseLineId,  // ✅ Add snake_case variant for compatibility
          itemId: itemIdentifier,
          itemCode: itemIdentifier,
          quantity,
          status: 'queued',
          startAt: null,
          finishAt: null,
          createdAt: createdIso,
          updatedAt: updatedIso,
          itemNameAr: localizeValue(nameSource, 'ar', fallbackNameAr),
          itemNameEn: localizeValue(nameSource, 'en', fallbackNameEn),
          prepNotes: notesToText(line.notes, '; '),
          stationId,
          kitchenSectionId: stationId
        };

        // ✅ CRITICAL DEBUG: Log job_order_detail creation
        //console.log('📝 [JOB_ORDER_DETAIL] Creating detail:', {
        //  detailId,
        //  jobOrderId: jobId,
        //  orderLineId: baseLineId,
        //  originalLineId: line.id,
        //  itemName: localizeValue(nameSource, 'ar', fallbackNameAr)
        //});

        if (line.notes) {
          //console.log('[POS][serializeOrderForKDS] Line notes:', {
          //  lineId: line.id,
          //  rawNotes: line.notes,
          //  convertedPrepNotes: detail.prepNotes,
          //  notesType: typeof line.notes,
          //  isArray: Array.isArray(line.notes)
          //});
        }
        jobDetails.push(detail);

        // Add modifiers
        const modifiers = ensureList(line.modifiers).filter(Boolean);
        modifiers.forEach((mod, idx) => {
          const modIndex = idx + 1;
          const baseModId = toIdentifier(mod.id, mod.uid, `${detailId}-mod-${modIndex}`);
          const modId = baseModId || `${detailId}-mod-${modIndex}`;
          const modDisplayId = baseModId && baseModId !== `${detailId}-mod-${modIndex}` ? baseModId : '';
          const modNameSource = pickLocalizedText(
            mod.name,
            mod.label,
            toLocaleObject(mod.nameAr, mod.nameEn),
            toLocaleObject(mod.labelAr, mod.labelEn),
            mod.productName,
            mod.product?.name,
            mod.item?.name
          ) || (modDisplayId ? modDisplayId : null);
          const modFallbackAr = `إضافة ${modIndex}`;
          const modFallbackEn = `Modifier ${modIndex}`;
          const priceCandidate = coalesce(mod.priceChange, mod.amount, mod.price, 0);
          let priceChange = Number(priceCandidate);
          if (!Number.isFinite(priceChange)) priceChange = 0;
          const modifierType = mod.modifierType || mod.type || (priceChange < 0 ? 'remove' : 'add');
          jobModifiers.push({
            id: modId,
            jobOrderId: jobId,
            detailId,
            nameAr: localizeValue(modNameSource, 'ar', modFallbackAr),
            nameEn: localizeValue(modNameSource, 'en', modFallbackEn),
            modifierType,
            priceChange
          });
        });

        // Add history
        historyEntries.push({
          id: `HIS-${jobId}-${baseLineId}`,
          jobOrderId: jobId,
          status: 'queued',
          actorId: 'pos',
          actorName: 'POS',
          actorRole: 'pos',
          changedAt: createdIso,
          meta: { source: 'pos', lineId: line.id || baseLineId }
        });
      });

      // Save job_order_header for this station
      jobsMap.set(jobId, job);
    });
    const headers = Array.from(jobsMap.values());
    if (!headers.length) return null;

    // ✅ DEBUG: Log job_order_header breakdown by station
    //console.log('📊 [JOB_ORDER CREATION] Created job_order_header breakdown:', {
    //  orderId: order.id,
    //  batchId,
    //  totalJobs: headers.length,
    //  jobsByStation: headers.map(h => ({
    //    jobId: h.id,
    //    stationId: h.stationId,
    //    stationCode: h.stationCode,
    //    totalItems: h.totalItems,
    //    status: h.status
    //  })),
    //  stationsSummary: headers.reduce((acc, h) => {
    //    acc[h.stationId] = (acc[h.stationId] || 0) + 1;
    //    return acc;
    //  }, {})
    //});

    // ✅ Extract display-friendly order number for summary
    const summaryOrderNumber = extractOrderNumberPrefix(order.orderNumber || order.invoiceId || order.id);

    const orderSummary = {
      orderId: order.id,
      orderNumber: summaryOrderNumber,  // ✅ Use display-friendly prefix only
      serviceMode,
      tableLabel: tableLabel || null,
      customerName: customerName || null,
      createdAt: createdIso
    };
    const kdsState = state?.data?.kds || {};
    const masterSnapshot = {
      channel: kdsState.channel || BRANCH_CHANNEL,
      stations: Array.isArray(kdsState.stations) ? kdsState.stations.map(station => ({ ...station })) : [],
      stationCategoryRoutes: Array.isArray(kdsState.stationCategoryRoutes)
        ? kdsState.stationCategoryRoutes.map(route => ({ ...route }))
        : [],
      metadata: { ...(kdsState.metadata || {}) },
      sync: { ...(kdsState.sync || {}), channel: kdsState.channel || BRANCH_CHANNEL },
      drivers: Array.isArray(kdsState.drivers) ? kdsState.drivers.map(driver => ({ ...driver })) : [],
      kitchenSections: Array.isArray(state?.data?.kitchenSections)
        ? state.data.kitchenSections.map(section => ({ ...section }))
        : [],
      categorySections: Array.isArray(state?.data?.categorySections)
        ? state.data.categorySections.map(entry => ({ ...entry }))
        : [],
      categories: Array.isArray(state?.data?.menu?.categories)
        ? state.data.menu.categories.map(category => ({ ...category }))
        : [],
      items: Array.isArray(state?.data?.menu?.items)
        ? state.data.menu.items.map(item => ({ ...item }))
        : []
    };
    const deliveriesSnapshot = {
      assignments: { ...(kdsState.deliveries?.assignments || {}) },
      settlements: { ...(kdsState.deliveries?.settlements || {}) }
    };
    const handoffSnapshot = { ...(kdsState.handoff || {}) };

    // ✅ CRITICAL FIX: Check if this is a reopened order (has new unpersisted lines)
    // ✅ CRITICAL FIX: Must use SAME logic as isReopenedOrder (line 2514) to prevent mismatch!
    // isReopenedOrder checks: hasPersistedLines && hasNewLines (both required!)
    // isReopenedOrderForHeader MUST match to prevent cascade delete
    // Note: isReopenedOrder already calculated above
    const isReopenedOrderForHeader = isReopenedOrder;  // ✅ Use same value!

    // ✅ Build order_header record for static tabs (all sections, expo, handoff)
    const orderHeader = {
      id: order.id,
      type: serviceMode,
      orderNumber: order.orderNumber || order.invoiceId || order.id,
      orderTypeId: serviceMode,
      serviceMode,
      // ✅ CRITICAL FIX: DO NOT change order_header status when adding new items
      // Changing status from 'delivered' to 'open' may cause backend to reset job_orders
      // Only job_orders should be created for new items - order_header stays as-is
      status: order.status || 'open',
      statusId: order.statusId || order.status || 'open',
      fulfillmentStage: order.fulfillmentStage || order.stage || 'new',
      paymentState: order.paymentState || 'unpaid',
      tableIds: Array.isArray(order.tableIds) ? order.tableIds : [],
      tableLabel: tableLabel || null,
      guests: Number.isFinite(order.guests) ? Number(order.guests) : 0,
      totals: order.totals || {},
      discount: order.discount || null,
      customerName: customerName || null,
      customerId: order.customerId || null,
      customerPhone: order.customerPhone || '',
      customerAddress: order.customerAddress || '',
      notes: notesToText(order.notes, '; '),  // ✅ CRITICAL: Add order header notes for KDS display
      version: order.version || order.currentVersion || 1,  // ✅ Version for optimistic concurrency control
      metadata: {  // ✅ Add metadata with serviceMode (KDS reads from here)
        ...(order.metadata || {}),
        serviceMode,
        orderType: serviceMode,
        orderTypeId: serviceMode
      },
      createdAt: createdIso,
      updatedAt: updatedIso
    };

    //console.log('📝 [DEBUG] orderHeader creation in serializeOrderForKDS:', {
    //  orderId: order.id,
    //  inputNotes: order.notes,
    //  inputNotesType: typeof order.notes,
    //  inputNotesLength: Array.isArray(order.notes) ? order.notes.length : (order.notes ? 1 : 0),
    //  convertedNotes: notesToText(order.notes, '; '),
    //  convertedNotesLength: notesToText(order.notes, '; ').length,
    //  isReopened: isReopenedOrderForHeader
    //});

    //console.log('🔄 [KDS REOPEN] isReopenedOrderForHeader check:', {
    //  orderId: order.id,
    //  'order.isPersisted': order.isPersisted,
    //  isReopenedOrder,
    //  isReopenedOrderForHeader,
    //  matched: isReopenedOrder === isReopenedOrderForHeader,
    //  willSkipOrderHeaderUpdate: isReopenedOrderForHeader,
    //  currentStatus: order.status,
    //  currentStage: order.fulfillmentStage,
    //  totalLines: lines.length,
    //  newLinesCount: lines.filter(l => !l.isPersisted).length,
    //  oldLinesCount: lines.filter(l => l.isPersisted).length
    //});

    if (isReopenedOrderForHeader) {
      //console.log('✅ [KDS REOPEN] WILL SKIP order_header update - preventing cascade delete!');
    } else {
      //console.log('⚠️ [KDS REOPEN] WILL UPDATE order_header - may cause cascade delete if order exists!');
    }

    // ✅ CRITICAL: For reopened orders, only include NEW unpersisted lines
    // Old persisted lines already sent to kitchen - don't resend them!
    const linesToInclude = isReopenedOrderForHeader
      ? lines.filter(line => !line.isPersisted)  // Only new lines for reopened orders
      : lines;  // All lines for new orders

    // ✅ Build order_line records for static tabs
    const orderLines = linesToInclude.map((line, index) => {
      const lineIndex = index + 1;
      const itemId = toIdentifier(line.itemId, line.productId, line.menuItemId, line.sku, `${order.id}-line-${lineIndex}`);
      const itemName = line.name || line.displayName || line.label || itemId;
      const kitchenSectionSource = line.kitchenSection || line.kitchenSectionId || line.kitchen_section_id || line.kitchen_section;
      const resolvedStation = toIdentifier(kitchenSectionSource) || 'expo';

      return {
        id: line.id || `${order.id}-line-${lineIndex}`,
        orderId: order.id,
        itemId,
        name: itemName,
        qty: Number(line.qty) || 1,
        price: Number(line.price) || 0,
        total: Number(line.total) || 0,
        status: line.status || 'draft',
        stage: line.stage || 'new',
        kitchenSectionId: resolvedStation,
        kitchen_section_id: resolvedStation,
        notes: Array.isArray(line.notes) ? line.notes : (line.notes ? [line.notes] : []),
        locked: line.locked || false,
        createdAt: createdIso,
        updatedAt: updatedIso
      };
    });

    if (isReopenedOrderForHeader) {
      //console.log('🔄 [KDS REOPEN] Filtered order_line to NEW items only:', {
      //   totalLines: lines.length,
      //   newLines: linesToInclude.length,
      //   oldPersistedLines: lines.length - linesToInclude.length
      // });
    }

    // ✅ Flat structure: job order tables at root level (consistent with REST API)
    const result = {
      order: orderSummary,
      order_header: [orderHeader],  // ✅ For static tabs
      order_line: orderLines,        // ✅ For static tabs
      job_order_header: headers,
      job_order_detail: jobDetails,
      job_order_detail_modifier: jobModifiers,
      job_order_status_history: historyEntries,
      master: masterSnapshot,
      deliveries: deliveriesSnapshot,
      handoff: handoffSnapshot,
      drivers: masterSnapshot.drivers,
      meta: { channel: masterSnapshot.channel, branch: BRANCH_CHANNEL, posId: POS_INFO.id, emittedAt: new Date().toISOString() },
      isReopenedOrder: isReopenedOrderForHeader  // ✅ CRITICAL: Pass flag to indicate reopened order
    };

    //console.log('🎯 [serializeOrderForKDS] RETURNING:', {
    //  orderId: order.id,
    //  job_order_header_count: headers.length,
    //  job_order_detail_count: jobDetails.length,
    //  order_line_count: orderLines.length,
    //  firstJobHeader: headers[0],
    //  firstJobDetail: jobDetails[0]
    // });

    return result;
  }

  const buildOrderEnvelope = async (orderPayload, state) => {
    const payload = await serializeOrderForKDS(orderPayload, state);
    if (!payload) return null;
    const nowIso = new Date().toISOString();
    const baseHandoff = (payload.handoff && typeof payload.handoff === 'object') ? { ...payload.handoff } : {};
    if (orderPayload && orderPayload.id) {
      baseHandoff[orderPayload.id] = {
        ...(baseHandoff[orderPayload.id] || {}),
        status: 'pending',
        updatedAt: nowIso
      };
    }
    payload.handoff = baseHandoff;
    payload.meta = { ...(payload.meta || {}), publishedAt: nowIso };
    const channel = payload.meta?.channel || BRANCH_CHANNEL;

    // ✅ Build snapshot with job_orders ONLY for backend persistence
    // Backend now supports PARTIAL SNAPSHOTS (only updates tables present in snapshot)
    // This prevents erasing master tables and reduces payload size
    // 🔧 FIX: job_order data is at ROOT level, not inside jobOrders property
    const snapshot = {
      job_order_header: payload.job_order_header || [],
      job_order_detail: payload.job_order_detail || [],
      job_order_detail_modifier: payload.job_order_detail_modifier || [],
      job_order_status_history: payload.job_order_status_history || []
    };
    payload.snapshot = snapshot;

    return { payload, channel, publishedAt: nowIso };
  };

  function createKDSSync(options = {}) {
    const WebSocketX = U.WebSocketX || U.WebSocket;
    const endpoint = options.endpoint;
    if (!WebSocketX) {
      //console.warn('[Mishkah][POS][KDS] WebSocket adapter is unavailable; disabling sync.');
    }
    if (!endpoint) {
      //console.warn('[Mishkah][POS][KDS] No KDS endpoint configured; sync bridge is inactive.');
    }
    const requestedChannel = options.channel ? normalizeChannelName(options.channel, BRANCH_CHANNEL) : '';
    const localEmitter = typeof options.localEmitter === 'function'
      ? options.localEmitter
      : (options.localChannel ? (message) => {
        if (!options.localChannel || typeof options.localChannel.postMessage !== 'function') return;
        try { options.localChannel.postMessage({ origin: 'pos', ...message }); } catch (_err) { }
      }
        : () => { });
    const pushLocal = (type, data = {}, metaOverride = {}) => {
      if (typeof localEmitter !== 'function') return;
      const baseMeta = {
        channel: requestedChannel || BRANCH_CHANNEL,
        via: 'pos:local',
        publishedAt: new Date().toISOString()
      };
      const meta = { ...baseMeta, ...metaOverride };
      try { localEmitter({ type, ...data, meta }); } catch (_err) { }
    };
    if (!WebSocketX || !endpoint) {
      return {
        connect: () => { },
        async publishOrder(orderPayload, state) {
          const envelope = await buildOrderEnvelope(orderPayload, state);
          if (!envelope) return null;

          // ⚠️ FALLBACK MODE: No WebSocket - job_orders stored in offline store only
          // Data will NOT persist to backend - consider implementing HTTP POST fallback
          // 🔧 FIX: job_order data is at ROOT level of payload, not inside jobOrders property
          const payload = envelope.payload || {};
          if (payload && typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.insert === 'function') {
            const store = window.__POS_DB__;
            const headers = payload.job_order_header || [];
            const details = payload.job_order_detail || [];
            const modifiers = payload.job_order_detail_modifier || [];
            const statusHistory = payload.job_order_status_history || [];

            //console.warn('[POS][KDS][Fallback] WebSocket unavailable - job_orders will NOT persist! Consider HTTP POST:', {
            //  headers: headers.length,
            //  details: details.length,
            //  modifiers: modifiers.length,
            //  statusHistory: statusHistory.length
            //});

            // ✅ FIX: Insert WITHOUT silent flag so KDS sees updates in real-time!
            headers.forEach(h => { try { store.insert('job_order_header', h); } catch (e) { console.error('[POS][Fallback] Failed to insert job_order_header:', e); } });
            details.forEach(d => { try { store.insert('job_order_detail', d); } catch (e) { console.error('[POS][Fallback] Failed to insert job_order_detail:', e); } });
            modifiers.forEach(m => { try { store.insert('job_order_detail_modifier', m); } catch (e) { console.error('[POS][Fallback] Failed to insert modifier:', e); } });
            statusHistory.forEach(s => { try { store.insert('job_order_status_history', s); } catch (e) { console.error('[POS][Fallback] Failed to insert status history:', e); } });
          }

          pushLocal('orders:payload', { payload: envelope.payload }, { channel: envelope.channel, publishedAt: envelope.publishedAt });
          return envelope.payload;
        },
        publishJobUpdate(update) {
          if (!update || !update.jobId) return;
          pushLocal('job:update', { jobId: update.jobId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
        },
        publishDeliveryUpdate(update) {
          if (!update || !update.orderId) return;
          pushLocal('delivery:update', { orderId: update.orderId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
        },
        publishHandoffUpdate(update) {
          if (!update || !update.orderId) return;
          pushLocal('handoff:update', { orderId: update.orderId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
        }
      };
    }
    const channelName = requestedChannel;
    const topicPrefix = channelName ? `${channelName}:` : '';
    const topicOrders = options.topicOrders || `${topicPrefix}pos:kds:orders`;
    const topicJobs = options.topicJobs || `${topicPrefix}kds:jobs:updates`;
    const topicDelivery = options.topicDelivery || `${topicPrefix}kds:delivery:updates`;
    const topicHandoff = options.topicHandoff || `${topicPrefix}kds:handoff:updates`;
    const handlers = options.handlers || {};
    const token = options.token;
    let socket = null;
    let ready = false;
    let awaitingAuth = false;
    const queue = [];
    const sendEnvelope = (payload) => {
      if (!socket) return;
      if (ready && !awaitingAuth) {
        socket.send(payload);
      } else {
        queue.push(payload);
      }
    };
    const flushQueue = () => {
      if (!ready || awaitingAuth) return;
      while (queue.length) { socket.send(queue.shift()); }
    };
    socket = new WebSocketX(endpoint, {
      autoReconnect: true,
      ping: { interval: 15000, timeout: 7000, send: { type: 'ping' }, expect: 'pong' }
    });
    socket.on('open', () => {
      ready = true;
      console.info('[Mishkah][POS][KDS] Sync connection opened.', { endpoint });
      if (token) {
        awaitingAuth = true;
        socket.send({ type: 'auth', data: { token } });
      } else {
        socket.send({ type: 'subscribe', topic: topicOrders });
        socket.send({ type: 'subscribe', topic: topicJobs });
        socket.send({ type: 'subscribe', topic: topicDelivery });
        socket.send({ type: 'subscribe', topic: topicHandoff });
        flushQueue();
      }
    });
    socket.on('close', (event) => {
      ready = false;
      awaitingAuth = false;
      //console.warn('[Mishkah][POS][KDS] Sync connection closed.', { code: event?.code, reason: event?.reason });
    });
    socket.on('error', (error) => {
      ready = false;
      console.error('[Mishkah][POS][KDS] Sync connection error.', error);
    });
    socket.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ack') {
        if (msg.event === 'auth') {
          awaitingAuth = false;
          socket.send({ type: 'subscribe', topic: topicOrders });
          socket.send({ type: 'subscribe', topic: topicJobs });
          socket.send({ type: 'subscribe', topic: topicDelivery });
          socket.send({ type: 'subscribe', topic: topicHandoff });
          flushQueue();
        } else if (msg.event === 'subscribe') {
          flushQueue();
        }
        return;
      }
      if (msg.type === 'publish') {
        const meta = msg.meta || {};
        const resolved = resolveTopicPayload(msg.topic, msg.data);
        if (msg.topic === topicOrders && typeof handlers.onOrders === 'function') {
          try { handlers.onOrders(resolved || {}, meta); } catch (handlerErr) { //console.warn('[Mishkah][POS][KDS] onOrders handler failed.', handlerErr); 
          }
        }
        if (msg.topic === topicJobs && typeof handlers.onJobUpdate === 'function') {
          try { handlers.onJobUpdate(resolved || {}, meta); } catch (handlerErr) { //console.warn('[Mishkah][POS][KDS] onJobUpdate handler failed.', handlerErr);
          }
        }
        if (msg.topic === topicDelivery && typeof handlers.onDeliveryUpdate === 'function') {
          try { handlers.onDeliveryUpdate(resolved || {}, meta); } catch (handlerErr) { //console.warn('[Mishkah][POS][KDS] onDeliveryUpdate handler failed.', handlerErr); 
          }
        }
        if (msg.topic === topicHandoff && typeof handlers.onHandoffUpdate === 'function') {
          try { handlers.onHandoffUpdate(resolved || {}, meta); } catch (handlerErr) { //console.warn('[Mishkah][POS][KDS] onHandoffUpdate handler failed.', handlerErr); 
          }
        }
        return;
      }
    });
    const connect = () => { try { socket.connect({ waitOpen: false }); } catch (_err) { } };
    return {
      connect,
      async publishOrder(orderPayload, state) {
        const envelope = await buildOrderEnvelope(orderPayload, state);
        if (!envelope) {
          //console.warn('[Mishkah][POS][KDS] Skipped publishing order payload — serialization failed.', { orderId: orderPayload?.id });
          return null;
        }

        // ✅ PERSIST job_orders via WebSocket store - backend persists & broadcasts automatically
        // Using store.insert() WITHOUT silent - backend will:
        // 1. Receive WebSocket event (module:insert)
        // 2. Persist to disk
        // 3. Broadcast to all connected clients (including KDS)
        // No need for separate sendEnvelope!
        // 🔧 FIX: job_order data is at ROOT level of payload, not inside jobOrders property
        const payload = envelope.payload || {};
        if (payload && typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.insert === 'function') {
          const store = window.__POS_DB__;
          const headers = payload.job_order_header || [];
          const details = payload.job_order_detail || [];
          const modifiers = payload.job_order_detail_modifier || [];
          const statusHistory = payload.job_order_status_history || [];

          //console.log('[POS][KDS] Persisting job_orders via WebSocket store:', {
          //  headers: headers.length,
          //  details: details.length,
          //  modifiers: modifiers.length,
          //  statusHistory: statusHistory.length
          //});

          // Insert WITHOUT silent - backend will persist AND broadcast
          //console.log('🚀 [POS][KDS] Sending job_order_header to backend via WebSocket:', {
          //  count: headers.length,
          //  firstHeader: headers[0],
          //  wsConnected: store?.connected || 'unknown'
          //});

          //console.log('🔍🔍🔍 [DEBUG] About to insert job_order_header:', {
          //  headersCount: headers.length,
          //  detailsCount: details.length,
          //  headers: headers.map(h => ({ id: h.id, orderId: h.orderId, orderNumber: h.orderNumber, stationId: h.stationId }))
          //});

          headers.forEach((header, index) => {
            try {
              //console.log(`📤 [POS][KDS] Inserting job_order_header ${index + 1}/${headers.length}:`, header);
              store.insert('job_order_header', header);
              //console.log(`✅ [POS][KDS] Successfully inserted job_order_header ${index + 1}/${headers.length}`);
            } catch (err) {
              console.error(`❌ [POS][KDS] Failed to insert job_order_header ${index + 1}:`, err, header);
              console.error('[POS][KDS] Error details:', err.stack);
            }
          });

          details.forEach(detail => {
            try {
              store.insert('job_order_detail', detail);
            } catch (err) {
              //console.warn('[POS][KDS] Failed to insert job_order_detail:', err);
            }
          });

          modifiers.forEach(modifier => {
            try {
              store.insert('job_order_detail_modifier', modifier);
            } catch (err) {
              //console.warn('[POS][KDS] Failed to insert job_order_detail_modifier:', err);
            }
          });

          statusHistory.forEach(history => {
            try {
              store.insert('job_order_status_history', history);
            } catch (err) {
              //console.warn('[POS][KDS] Failed to insert job_order_status_history:', err);
            }
          });

          //console.log('✅ [POS][KDS] All job_order data sent via WebSocket');
        }

        // Still send envelope for other data (order, master, deliveries, handoff)
        // but job_orders are now handled via store.insert() above
        sendEnvelope({ type: 'publish', topic: topicOrders, data: envelope.payload });
        pushLocal('orders:payload', { payload: envelope.payload }, { channel: envelope.channel, publishedAt: envelope.publishedAt });
        return envelope.payload;
      },
      publishJobUpdate(update) {
        if (!update || !update.jobId) {
          //console.warn('[Mishkah][POS][KDS] Ignored job update with missing jobId.', update);
          return;
        }
        sendEnvelope({ type: 'publish', topic: topicJobs, data: update });
        pushLocal('job:update', { jobId: update.jobId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
      },
      publishDeliveryUpdate(update) {
        if (!update || !update.orderId) {
          //console.warn('[Mishkah][POS][KDS] Ignored delivery update with missing orderId.', update);
          return;
        }
        sendEnvelope({ type: 'publish', topic: topicDelivery, data: update });
        pushLocal('delivery:update', { orderId: update.orderId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
      },
      publishHandoffUpdate(update) {
        if (!update || !update.orderId) {
          //console.warn('[Mishkah][POS][KDS] Ignored handoff update with missing orderId.', update);
          return;
        }
        sendEnvelope({ type: 'publish', topic: topicHandoff, data: update });
        pushLocal('handoff:update', { orderId: update.orderId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
      }
    };
  }

  const posDB = createIndexedDBAdapter('mishkah-pos', 4);

  const realtimeOrders = {
    store: (typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.watch === 'function')
      ? window.__POS_DB__
      : null,
    installed: false,
    pending: false,
    ready: false,
    headers: new Map(),
    lines: new Map(),
    payments: new Map(),
    snapshot: { orders: [], active: [], history: [] },
    unsubscribes: [],
    debugLogged: { headers: false, lines: false, payments: false, dataset: false },
    datasetPrimed: { headers: false, lines: false, payments: false }
  };

  const realtimeJobOrders = {
    store: (typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.watch === 'function')
      ? window.__POS_DB__
      : null,
    installed: false,
    pending: false,
    headers: new Map(),
    details: new Map(),
    modifiers: new Map(),
    statusHistory: new Map(),
    expoPassTickets: new Map(),
    snapshot: { headers: [], details: [], modifiers: [], statusHistory: [], expoPassTickets: [] },
    unsubscribes: [],
    debugLogged: { headers: false, details: false, modifiers: false, status: false, expo: false }
  };

  // ✅ [POS V2] Realtime Tables & Table Locks for Multi-Device Sync
  const realtimeTables = {
    store: (typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.watch === 'function')
      ? window.__POS_DB__
      : null,
    installed: false,
    pending: false,
    tables: new Map(),
    tableLocks: new Map(),
    snapshot: { tables: [], tableLocks: [] },
    unsubscribes: [],
    debugLogged: { tables: false, tableLocks: false }
  };

  function normalizeIdToken(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return normalized || fallback;
  }

  function normalizeStatusId(value) {
    return normalizeIdToken(value, 'open');
  }

  function normalizeStageId(value) {
    return normalizeIdToken(value, 'new');
  }

  function normalizePaymentStateId(value) {
    return normalizeIdToken(value, 'unpaid');
  }

  const parseJSONSafe = (value, fallback) => {
    if (typeof value !== 'string') return fallback;
    try { return JSON.parse(value); } catch (_err) { return fallback; }
  };

  function logIndexedDbSample(debugMap, key, rows, normalize) {
    if (!rows || !rows.length) return;
    if (debugMap[key]) return;
    debugMap[key] = true;
    try {
      const sample = rows[0];
      const normalized = typeof normalize === 'function' ? normalize(sample) : null;
      if (normalized) {
        console.info(`[Mishkah][POS][IndexedDB] ${key} sample`, { raw: sample, normalized });
      } else {
        console.info(`[Mishkah][POS][IndexedDB] ${key} sample`, sample);
      }
    } catch (error) {
      console.info(`[Mishkah][POS][IndexedDB] ${key} sample logging failed`, error);
    }
  }

  function sanitizeOrderHeaderRow(row) {
    if (!row) return null;
    const id = row.id ?? row.order_id ?? row.orderId;
    if (id == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    const orderId = row.orderId ?? row.order_id ?? row.id;
    if (orderId != null) normalized.orderId = String(orderId);
    if (normalized.shiftId == null && (row.shiftId != null || row.shift_id != null)) {
      normalized.shiftId = String(row.shiftId ?? row.shift_id);
    }
    if (normalized.posId == null && (row.posId != null || row.pos_id != null)) {
      normalized.posId = String(row.posId ?? row.pos_id);
    }
    if (normalized.posLabel == null && row.pos_label != null) {
      normalized.posLabel = row.pos_label;
    }
    if (normalized.posNumber == null && row.pos_number != null) {
      normalized.posNumber = row.pos_number;
    }
    if (normalized.metadata == null && row.meta !== undefined) {
      normalized.metadata = ensurePlainObject(row.meta);
    }
    if (typeof normalized.metadata === 'string') {
      normalized.metadata = ensurePlainObject(parseJSONSafe(normalized.metadata, {}));
    }
    // ✅ CRITICAL FIX: Handle tableIds from multiple sources (camelCase, snake_case, singular)
    // Backend may send: tableIds, table_ids, tableId, table_id
    if (!Array.isArray(normalized.tableIds) || normalized.tableIds.length === 0) {
      if (Array.isArray(row.table_ids)) {
        normalized.tableIds = row.table_ids.slice();
      } else if (typeof row.table_ids === 'string') {
        const parsed = parseJSONSafe(row.table_ids, null);
        if (Array.isArray(parsed)) normalized.tableIds = parsed;
      } else if (Array.isArray(row.tableIds)) {
        normalized.tableIds = row.tableIds.slice();
      } else if (row.tableId != null) {
        // Handle singular tableId
        normalized.tableIds = [row.tableId];
      } else if (row.table_id != null) {
        // Handle singular table_id
        normalized.tableIds = [row.table_id];
      } else {
        // Ensure tableIds is always an array
        normalized.tableIds = [];
      }
    }
    if (normalized.notes == null && row.notes_json) {
      const parsedNotes = parseJSONSafe(row.notes_json, null);
      if (Array.isArray(parsedNotes)) normalized.notes = parsedNotes;
    }
    // ✅ CRITICAL FIX: Preserve order type from orderTypeId/order_type_id
    // Backend sends orderTypeId but frontend uses 'type'
    if (!normalized.type && (row.orderTypeId || row.order_type_id || row.type_id)) {
      normalized.type = row.orderTypeId || row.order_type_id || row.type_id || 'dine_in';
    }
    // ✅ Also preserve orderTypeId for reference
    if (!normalized.orderTypeId && (row.orderTypeId || row.order_type_id)) {
      normalized.orderTypeId = row.orderTypeId || row.order_type_id;
    }
    return normalized;
  }

  function sanitizeOrderLineRow(row) {
    if (!row) return null;
    const orderId = row.orderId ?? row.order_id;
    if (orderId == null) return null;
    const id = row.id ?? row.line_id ?? row.orderLines_id ?? `${orderId}-${row.item_id ?? Math.random().toString(16).slice(2, 8)}`;
    const normalized = { ...row };
    normalized.id = String(id);
    normalized.orderId = orderId != null ? String(orderId) : undefined;

    // محاولة قراءة metadata من جميع الأماكن الممكنة
    let metadataSource = row.metadata || row.meta || row.lineMetadata || row.line_metadata || null;

    // إذا كان string، حاول parse كـ JSON
    if (typeof metadataSource === 'string') {
      try {
        metadataSource = JSON.parse(metadataSource);
      } catch (e) {
        metadataSource = null;
      }
    }

    if (normalized.metadata == null && metadataSource) {
      normalized.metadata = ensurePlainObject(metadataSource);
    }
    const metadata = ensurePlainObject(normalized.metadata);
    // البحث عن itemId في جميع الأماكن الممكنة
    let rawItemId = row.itemId
      ?? row.item_id
      ?? row.menu_item_id
      ?? row.menuItemId
      ?? row.product_id
      ?? metadata.itemId
      ?? metadata.item_id
      ?? metadata.menuItemId
      ?? metadata.menu_item_id
      ?? metadata.productId
      ?? metadata.itemCode
      ?? null;

    // إذا لم نجد itemId، حاول استخراجه من id
    // النمط: "ln-{itemId}-{random}"
    if (!rawItemId && id && typeof id === 'string') {
      const match = id.match(/^ln-([0-9a-fA-F-]+)-[a-z0-9-]+$/);
      if (match && match[1]) {
        rawItemId = match[1];
        //console.log('[POS][sanitizeOrderLineRow] Extracted itemId from line id:', {
        //  lineId: id,
        //  extractedItemId: rawItemId
        //});
      }
    }

    const finalRawItemId = (rawItemId != null && typeof rawItemId === 'object' && rawItemId.value != null)
      ? rawItemId.value
      : rawItemId;

    const rawItemIdString = finalRawItemId != null && String(finalRawItemId).trim() !== '' && String(finalRawItemId).trim().toLowerCase() !== 'null' && String(finalRawItemId).trim().toLowerCase() !== 'undefined'
      ? String(finalRawItemId).trim()
      : null;

    // ✅ FIX: Don't parse to int - item_id can be UUID string!
    const itemId = rawItemIdString;

    if (!itemId) {
      //console.warn('[Mishkah][POS] Dropping realtime order line - missing itemId', {
      //  id,
      //  orderId,
      //  rawItemId,
      //  availableFields: Object.keys(row),
      //  metadata_field: row.metadata,
      //  meta_field: row.meta,
      //  parsedMetadata: metadata,
      //  sampleRow: row
      //});
      return null;
    }
    normalized.itemId = itemId;
    normalized.item_id = itemId;
    // ✅ No longer store item_id in metadata - send directly as field
    const quantity = row.quantity != null ? Number(row.quantity) : (row.qty != null ? Number(row.qty) : 1);
    const unitPrice = row.unitPrice != null ? Number(row.unitPrice) : (row.unit_price != null ? Number(row.unit_price) : (row.price != null ? Number(row.price) : 0));
    const total = row.total != null ? Number(row.total) : round(quantity * unitPrice);
    const statusId = row.statusId ?? row.status_id ?? row.status ?? '';
    normalized.quantity = quantity;
    normalized.unitPrice = unitPrice;
    normalized.unit_price = unitPrice;
    normalized.total = total;
    normalized.statusId = statusId;
    normalized.status_id = statusId;
    const sectionSource = row.kitchenSection ?? row.kitchen_section ?? row.kitchenSectionId ?? row.kitchen_section_id ?? metadata.kitchenSectionId ?? metadata.sectionId ?? metadata.stationId;
    const kitchenSection = sectionSource != null && sectionSource !== '' ? String(sectionSource) : 'expo';
    normalized.kitchenSectionId = kitchenSection;
    normalized.kitchen_section_id = kitchenSection;
    // ✅ No longer store kitchenSectionId in metadata - send directly as field
    return normalized;
  }

  function sanitizeOrderPaymentRow(row) {
    if (!row) return null;
    const orderId = row.orderId ?? row.order_id;
    if (orderId == null) return null;
    const normalized = { ...row };
    const id = row.id ?? row.payment_id ?? `${orderId}-payment-${Math.random().toString(16).slice(2, 8)}`;
    normalized.id = String(id);
    normalized.orderId = orderId != null ? String(orderId) : undefined;
    if (normalized.amount == null && row.value != null) {
      normalized.amount = row.value;
    }
    return normalized;
  }

  function sanitizeJobOrderHeaderRow(row) {
    if (!row) return null;
    const id = row.id ?? row.job_order_id;
    if (id == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    const orderId = row.orderId ?? row.order_id;
    if (orderId != null) normalized.orderId = String(orderId);
    if (normalized.metadata == null && (row.meta !== undefined || row.metadata !== undefined)) {
      normalized.metadata = ensurePlainObject(row.meta ?? row.metadata);
    }
    if (typeof normalized.metadata === 'string') {
      normalized.metadata = ensurePlainObject(parseJSONSafe(normalized.metadata, {}));
    }
    normalized.stationId = normalized.stationId ?? row.station_id ?? null;
    normalized.progressState = normalized.progressState ?? row.progress_state ?? normalized.status ?? 'queued';
    normalized.status = normalized.status ?? row.status ?? 'queued';
    const totalItems = Number(row.totalItems ?? row.total_items ?? row.item_count ?? 0) || 0;
    const completedItems = Number(row.completedItems ?? row.completed_items ?? row.completed ?? 0) || 0;
    const remainingItems = row.remainingItems ?? row.remaining_items ?? (totalItems - completedItems);
    normalized.totalItems = totalItems;
    normalized.completedItems = completedItems;
    normalized.remainingItems = Number(remainingItems != null ? remainingItems : 0) || 0;
    if (normalized.tableLabel == null && row.table_label != null) normalized.tableLabel = row.table_label;
    if (normalized.customerName == null && row.customer_name != null) normalized.customerName = row.customer_name;
    normalized.notes = normalized.notes ?? row.notes ?? null;
    if (normalized.meta == null && row.meta != null && typeof row.meta === 'object') {
      normalized.meta = { ...row.meta };
    }
    return normalized;
  }

  function sanitizeJobOrderDetailRow(row) {
    if (!row) return null;
    const id = row.id ?? row.detail_id;
    const jobOrderId = row.jobOrderId ?? row.job_order_id;
    if (id == null || jobOrderId == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    normalized.jobOrderId = String(jobOrderId);
    normalized.quantity = Number(row.quantity ?? row.qty ?? 0) || 0;
    normalized.itemNameAr = normalized.itemNameAr ?? row.item_name_ar ?? '';
    normalized.itemNameEn = normalized.itemNameEn ?? row.item_name_en ?? '';
    if (normalized.meta == null && (row.meta !== undefined || row.metadata !== undefined)) {
      normalized.meta = ensurePlainObject(row.meta ?? row.metadata);
    }
    return normalized;
  }

  function sanitizeJobOrderModifierRow(row) {
    if (!row) return null;
    const id = row.id ?? row.modifier_id;
    const detailId = row.detailId ?? row.detail_id;
    if (id == null || detailId == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    normalized.detailId = String(detailId);
    normalized.quantity = Number(row.quantity ?? row.qty ?? 0) || 0;
    if (normalized.meta == null && (row.meta !== undefined || row.metadata !== undefined)) {
      normalized.meta = ensurePlainObject(row.meta ?? row.metadata);
    }
    return normalized;
  }

  function sanitizeJobOrderHistoryRow(row) {
    if (!row) return null;
    const id = row.id ?? row.history_id;
    const jobOrderId = row.jobOrderId ?? row.job_order_id;
    if (id == null || jobOrderId == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    normalized.jobOrderId = String(jobOrderId);
    if (normalized.meta == null && (row.meta !== undefined || row.metadata !== undefined)) {
      normalized.meta = ensurePlainObject(row.meta ?? row.metadata);
    }
    return normalized;
  }

  function sanitizeExpoPassTicketRow(row) {
    if (!row) return null;
    const id = row.id ?? row.expo_ticket_id;
    if (id == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    const jobIds = row.jobOrderIds ?? row.job_order_ids;
    if (Array.isArray(jobIds)) {
      normalized.jobOrderIds = jobIds.slice();
    } else if (typeof jobIds === 'string') {
      const parsed = parseJSONSafe(jobIds, null);
      if (Array.isArray(parsed)) normalized.jobOrderIds = parsed;
    }
    return normalized;
  }

  function normalizeRealtimeOrderHeader(raw) {
    if (!raw) return null;
    const rawId = raw.id ?? raw.order_id ?? raw.orderId;
    if (rawId == null) return null;
    const metadata = ensurePlainObject(raw.metadata || raw.meta);
    // ✅ CRITICAL FIX: Read tableIds from both camelCase AND snake_case
    // Backend may return table_ids (snake_case) but code was only reading tableIds (camelCase)
    const tableIdsSet = new Set();
    if (raw.tableId || raw.table_id) tableIdsSet.add(String(raw.tableId || raw.table_id));
    if (Array.isArray(raw.tableIds)) raw.tableIds.forEach(id => { if (id != null) tableIdsSet.add(String(id)); });
    if (Array.isArray(raw.table_ids)) raw.table_ids.forEach(id => { if (id != null) tableIdsSet.add(String(id)); });
    const openedAt = toMillis(raw.openedAt || raw.opened_at);
    const updatedAt = toMillis(raw.updatedAt || raw.updated_at || raw.closedAt || raw.closed_at, openedAt);
    const closedAt = raw.closedAt || raw.closed_at ? toMillis(raw.closedAt || raw.closed_at, updatedAt) : null;
    const notesSource = raw.notes ?? metadata.notes ?? metadata.notes_json;
    const normalizedNotesSource = typeof notesSource === 'string'
      ? parseJSONSafe(notesSource, notesSource)
      : notesSource;
    const notes = Array.isArray(normalizedNotesSource)
      ? normalizedNotesSource.map(note => {
        if (!note) return null;
        if (typeof note === 'object') return { ...note };
        const message = String(note);
        if (!message.trim()) return null;
        return { id: `note-${Math.random().toString(16).slice(2, 8)}`, message, createdAt: updatedAt };
      }).filter(Boolean)
      : (typeof normalizedNotesSource === 'string' && normalizedNotesSource.trim()
        ? [{ id: `note-${Math.random().toString(16).slice(2, 8)}`, message: normalizedNotesSource.trim(), createdAt: updatedAt }]
        : []);
    const discountValue = firstFiniteNumber(
      raw.discount,
      raw.discountAmount,
      raw.discount_amount,
      raw.order_discount,
      metadata.discountAmount,
      metadata.discount_amount,
      metadata.discount
    ) || 0;
    const discount = discountValue > 0 ? { type: 'amount', value: round(discountValue) } : null;
    const subtotalValue = firstFiniteNumber(
      raw.subtotal,
      raw.sub_total,
      raw.total_before_tax,
      raw.total_before_vat,
      metadata.subtotal,
      metadata.sub_total,
      metadata.total_before_tax,
      metadata.total_before_vat
    ) || 0;
    const serviceValue = firstFiniteNumber(
      raw.service,
      raw.serviceFee,
      raw.service_amount,
      raw.service_charge,
      raw.serviceCharge,
      metadata.service,
      metadata.serviceFee,
      metadata.service_amount,
      metadata.service_charge
    ) || 0;
    const vatValue = firstFiniteNumber(
      raw.tax,
      raw.vat,
      raw.tax_amount,
      raw.tax_total,
      raw.total_tax,
      metadata.tax,
      metadata.vat,
      metadata.tax_amount,
      metadata.tax_total
    ) || 0;
    const deliveryValue = firstFiniteNumber(
      raw.deliveryFee,
      raw.delivery_fee,
      raw.delivery,
      raw.delivery_amount,
      raw.delivery_total,
      metadata.deliveryFee,
      metadata.delivery_fee,
      metadata.delivery,
      metadata.delivery_amount
    ) || 0;
    const dueValue = firstFiniteNumber(
      raw.totalDue,
      raw.total_due,
      raw.total_amount,
      raw.total,
      raw.grand_total,
      raw.total_due_amount,
      raw.amount_due,
      raw.due_total,
      raw.net_total,
      metadata.due,
      metadata.totalDue,
      metadata.total_due,
      metadata.total,
      metadata.grand_total,
      metadata.amount_due,
      metadata.net_total
    ) || 0;
    const paidAmount = firstFiniteNumber(
      raw.totalPaid,
      raw.total_paid,
      raw.amount_paid,
      raw.total_payment,
      raw.paid_total,
      metadata.totalPaid,
      metadata.total_paid,
      metadata.amount_paid,
      metadata.paid_total
    );
    const totals = {
      subtotal: round(subtotalValue),
      service: round(serviceValue),
      vat: round(vatValue),
      discount: round(discountValue > 0 ? discountValue : 0),
      deliveryFee: round(deliveryValue),
      due: round(dueValue)
    };
    if (Number.isFinite(paidAmount) && paidAmount > 0) {
      totals.paid = round(paidAmount);
    }
    totals.total = totals.due;
    const guests = Number(raw.guests ?? metadata.guests ?? 0) || 0;
    const versionValue = Number(raw.version ?? metadata.version ?? metadata.currentVersion ?? metadata.versionCurrent);
    const header = {
      id: String(rawId),
      shiftId: raw.shiftId || raw.shift_id || metadata.shiftId || null,
      posId: raw.posId || raw.pos_id || metadata.posId || null,
      posLabel: raw.posLabel || metadata.posLabel || null,
      posNumber: Number.isFinite(Number(raw.posNumber)) ? Number(raw.posNumber) : (Number(metadata.posNumber) || null),
      type: normalizeOrderTypeId(raw.orderTypeId || raw.order_type_id || raw.type || metadata.orderType || 'dine_in'),
      status: normalizeStatusId(raw.statusId || raw.status_id || raw.status || metadata.status),
      fulfillmentStage: normalizeStageId(raw.stageId || raw.stage_id || raw.stage || metadata.stage || metadata.fulfillmentStage),
      paymentState: normalizePaymentStateId(raw.paymentStateId || raw.payment_state_id || raw.paymentState || metadata.paymentState),
      tableIds: Array.from(tableIdsSet),
      guests,
      notes,
      totals,
      discount,
      openedAt,
      updatedAt,
      savedAt: closedAt || updatedAt,
      closedAt,
      allowAdditions: metadata.allowAdditions !== undefined ? !!metadata.allowAdditions : true,
      lockLineEdits: metadata.lockLineEdits === true,
      metadata,
      customerId: raw.customerId || raw.customer_id || metadata.customerId || null,
      customerAddressId: raw.customerAddressId || raw.customer_address_id || metadata.customerAddressId || null,
      driverId: raw.driverId || raw.driver_id || metadata.driverId || null,
      openedBy: raw.openedBy || raw.opened_by || metadata.openedBy || null,
      closedBy: raw.closedBy || raw.closed_by || metadata.closedBy || null,
      isPersisted: normalizeStatusId(raw.statusId || raw.status_id || raw.status || metadata.status) !== 'draft',
      dirty: false
    };
    if (Number.isFinite(versionValue) && versionValue > 0) {
      header.version = Math.trunc(versionValue);
      header.currentVersion = Math.trunc(versionValue);
      header.expectedVersion = Math.trunc(versionValue);
    }
    return header;
  }

  // ✅ [POS V2] Sanitize dining_tables row from WebSocket
  function sanitizeDiningTableRow(row) {
    if (!row) return null;
    const id = row.id ?? row.table_id;
    if (id == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    normalized.name = row.name ?? row.table_name ?? `Table ${id}`;
    normalized.capacity = Number(row.capacity ?? row.seats ?? 4) || 4;
    normalized.zone = row.zone ?? row.area ?? '';
    normalized.displayOrder = Number.isFinite(Number(row.displayOrder ?? row.display_order))
      ? Number(row.displayOrder ?? row.display_order)
      : 0;
    normalized.state = row.state ?? row.status ?? 'active';
    normalized.note = row.note ?? row.notes ?? '';
    if (row.version != null) normalized.version = Number(row.version);
    return normalized;
  }

  // ✅ [POS V2] Sanitize table_lock row from WebSocket
  function sanitizeTableLockRow(row) {
    if (!row) return null;
    const id = row.id ?? row.lock_id;
    if (id == null) return null;
    const tableId = row.tableId ?? row.table_id;
    if (tableId == null) return null;
    const normalized = { ...row };
    normalized.id = String(id);
    normalized.tableId = String(tableId);
    normalized.orderId = row.orderId ?? row.order_id ?? null;
    normalized.reservationId = row.reservationId ?? row.reservation_id ?? null;
    normalized.lockedBy = row.lockedBy ?? row.locked_by ?? 'system';
    normalized.lockedAt = toMillis(row.lockedAt ?? row.locked_at);
    normalized.source = row.source ?? 'pos';
    normalized.active = row.active !== false;
    if (row.version != null) normalized.version = Number(row.version);
    return normalized;
  }

  function normalizeRealtimeOrderLine(raw, header) {
    if (!raw || !header) return null;
    const metadata = ensurePlainObject(raw.metadata || raw.meta);
    // Try to get name from multiple sources
    const nameCandidate = metadata.name || metadata.itemName || raw.name || raw.item_name;
    const itemNameAr = metadata.itemNameAr || metadata.item_name_ar || raw.item_name_ar;
    const itemNameEn = metadata.itemNameEn || metadata.item_name_en || raw.item_name_en;
    let finalName = nameCandidate;
    if (!finalName && (itemNameAr || itemNameEn)) {
      finalName = { ar: itemNameAr || itemNameEn || '', en: itemNameEn || itemNameAr || '' };
    }
    // Extract item_id, handling objects properly
    let resolvedItemId = raw.itemId ?? raw.item_id ?? metadata.itemId;
    if (resolvedItemId && typeof resolvedItemId === 'object' && !Array.isArray(resolvedItemId)) {
      resolvedItemId = resolvedItemId.id || resolvedItemId.item_id || null;
    }
    const base = {
      id: raw.id,
      order_id: raw.orderId || raw.order_id || header.id,
      item_id: resolvedItemId,
      qty: raw.quantity ?? raw.qty ?? metadata.qty ?? 1,
      price: raw.unitPrice ?? raw.unit_price ?? metadata.unitPrice,
      total: raw.total ?? metadata.total,
      notes: Array.isArray(raw.notes) ? raw.notes : (raw.notes ? [raw.notes] : []),
      discount: metadata.discount || raw.discount,
      name: finalName,
      description: metadata.description || raw.description,
      stage_id: raw.stageId || raw.stage_id || metadata.stageId || header.fulfillmentStage,
      status_id: raw.statusId || raw.status_id || metadata.statusId || 'draft',
      kitchen_section_id: raw.kitchenSectionId || raw.kitchen_section_id || metadata.kitchenSectionId,
      locked: raw.locked ?? metadata.locked
    };
    const context = {
      orderId: header.id,
      stageId: base.stage_id,
      kitchenSection: base.kitchen_section_id,
      actorId: header.openedBy || header.metadata?.openedBy || 'pos',
      createdAt: header.openedAt,
      updatedAt: header.updatedAt
    };
    return normalizeOrderLine(base, context);
  }

  function normalizeRealtimePayment(raw) {
    if (!raw || !raw.orderId) return null;
    const amount = round(raw.amount ?? raw.value ?? 0);
    const method = raw.paymentMethodId || raw.payment_method_id || raw.methodId || raw.method || 'cash';
    return {
      id: raw.id || `${raw.orderId}-payment-${Math.random().toString(16).slice(2, 8)}`,
      orderId: raw.orderId || raw.order_id,
      shiftId: raw.shiftId || raw.shift_id || null,
      method,
      amount,
      capturedAt: toMillis(raw.capturedAt || raw.captured_at),
      reference: raw.reference || null
    };
  }

  function computeRealtimeLineTotal(line) {
    if (!line || typeof line !== 'object') return 0;
    const quantity = Number(line.qty ?? line.quantity ?? line.count ?? 0) || 0;
    const unitPrice = Number(line.price ?? line.unitPrice ?? line.unit_price ?? 0) || 0;
    const totalValue = Number(line.total ?? line.lineTotal ?? line.line_total ?? 0);
    if (Number.isFinite(totalValue) && totalValue !== 0) {
      return round(totalValue);
    }
    if (quantity && unitPrice) {
      return round(quantity * unitPrice);
    }
    return 0;
  }

  function computeRealtimePaymentAmount(payment) {
    if (!payment || typeof payment !== 'object') return 0;
    const amount = Number(payment.amount ?? payment.total ?? payment.value ?? payment.paidAmount ?? payment.amount_paid ?? 0);
    return Number.isFinite(amount) ? round(amount) : 0;
  }

  function deriveRealtimeOrderFinancials(header, lines = [], payments = []) {
    const safeLines = Array.isArray(lines) ? lines : [];
    const safePayments = Array.isArray(payments) ? payments : [];
    const lineTotal = round(safeLines.reduce((sum, line) => sum + computeRealtimeLineTotal(line), 0));
    const paymentsTotal = round(safePayments.reduce((sum, payment) => sum + computeRealtimePaymentAmount(payment), 0));
    const baseTotals = ensurePlainObject(header.totals);
    let subtotal = firstFiniteNumber(
      baseTotals.subtotal,
      header.subtotal,
      header.totalBeforeTax,
      header.total_before_tax,
      header.totals?.subtotal,
      header.metadata?.subtotal,
      lineTotal
    );
    if (!Number.isFinite(subtotal) || subtotal <= 0) subtotal = lineTotal;
    let due = firstFiniteNumber(
      baseTotals.due,
      header.totalDue,
      header.total_due,
      header.total,
      header.total_amount,
      header.totals?.due,
      header.metadata?.totalDue,
      header.metadata?.total_due,
      subtotal
    );
    if (!Number.isFinite(due) || due <= 0) due = subtotal;
    let paid = firstFiniteNumber(
      baseTotals.paid,
      header.totalPaid,
      header.total_paid,
      header.amount_paid,
      header.totals?.paid,
      header.metadata?.totalPaid,
      header.metadata?.total_paid,
      paymentsTotal
    );
    if (!Number.isFinite(paid) || paid < paymentsTotal) paid = paymentsTotal;
    return {
      subtotal: round(subtotal),
      due: round(due),
      paid: round(paid),
      lineTotal,
      paymentsTotal
    };
  }

  function composeRealtimeOrder(orderId) {
    const rawHeader = realtimeOrders.headers.get(orderId);
    if (!rawHeader) return null;
    const header = normalizeRealtimeOrderHeader(rawHeader);
    if (!header) return null;
    const lineRows = realtimeOrders.lines.get(orderId) || [];
    const paymentRows = realtimeOrders.payments.get(orderId) || [];
    const lines = lineRows.map(row => normalizeRealtimeOrderLine(row, header)).filter(Boolean);
    const payments = paymentRows.map(normalizeRealtimePayment).filter(Boolean);
    const financials = deriveRealtimeOrderFinancials(header, lines, payments);
    const totals = {
      ...header.totals,
      subtotal: financials.subtotal,
      due: financials.due,
      total: financials.due,
      paid: financials.paid,
      remaining: Math.max(0, round(financials.due - financials.paid)),
      lines: lines.length,
      payments: financials.paymentsTotal,
      lineTotal: financials.lineTotal
    };
    let paymentState = header.paymentState || 'unpaid';
    if (totals.due > 0) {
      if (totals.paid >= totals.due) {
        paymentState = 'paid';
      } else if (totals.paid > 0) {
        paymentState = 'partial';
      } else {
        paymentState = 'unpaid';
      }
    }
    const composedOrder = {
      ...header,
      totals,
      subtotal: totals.subtotal,
      totalDue: totals.due,
      total_due: totals.due,
      totalPaid: totals.paid,
      total_paid: totals.paid,
      paymentsTotal: financials.paymentsTotal,
      paymentState,
      payments,
      lines,
      dirty: false,
      isPersisted: header.isPersisted !== false
    };
    const enriched = enrichOrderWithMenu(composedOrder);
    return enriched;
  }

  function cloneOrderSnapshot(order) {
    return cloneDeep(order);
  }

  function updateRealtimeSnapshot() {
    const orders = [];
    realtimeOrders.headers.forEach((_value, key) => {
      const order = composeRealtimeOrder(key);
      if (order) orders.push(order);
    });
    orders.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const isOrderCompletedForSnapshot = (order) => {
      const statusId = order.statusId || order.status || 'open';
      const isNotOpen = String(statusId) !== 'open';
      const totals = order.totals || {};
      const totalDue = Number(totals.due || 0);
      const paidAmount = round((Array.isArray(order.payments) ? order.payments : []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
      const isFullyPaid = totalDue > 0 && paidAmount >= totalDue;
      var order_linearr = window.__POS_DB__.store.state.modules.pos.tables.order_line.filter(item => item.orderId === order.id);

      const isAllCompleted = order_linearr?.every(line => line.statusId === 'completed');

      return isAllCompleted && isFullyPaid;
    };

    const active = [];
    const history = [];
    orders.forEach(order => {
      // ✅ OLD LOGIC (WRONG): const bucket = (order.status === 'closed' || order.status === 'finalized') ? history : active;
      // ✅ NEW LOGIC (CORRECT): Check both delivered AND paid
      const bucket = isOrderCompletedForSnapshot(order) ? history : active;
      bucket.push(cloneOrderSnapshot(order));
    });
    // Mark all orders as persisted
    active.forEach((entry) => {
      entry.dirty = false;
      entry.isPersisted = true;
      // ✅ CRITICAL FIX: Mark all lines as persisted too!
      // Without this, reopened orders can't detect which lines are new vs old
      if (Array.isArray(entry.lines)) {
        entry.lines = entry.lines.map(line => ({
          ...line,
          isPersisted: true  // All lines from database are persisted
        }));
      }
    });
    history.forEach((entry, idx) => {
      entry.seq = idx + 1;
      entry.dirty = false;
      entry.isPersisted = true;
      // ✅ CRITICAL FIX: Mark all lines as persisted too!
      if (Array.isArray(entry.lines)) {
        entry.lines = entry.lines.map(line => ({
          ...line,
          isPersisted: true
        }));
      }
    });
    realtimeOrders.snapshot = {
      orders: orders.map(cloneOrderSnapshot),
      active,
      history
    };
    realtimeOrders.ready = true;
    applyRealtimeOrdersToState();
  }

  function scheduleRealtimeSnapshot() {
    if (realtimeOrders.pending) return;
    realtimeOrders.pending = true;
    Promise.resolve().then(() => {
      realtimeOrders.pending = false;
      updateRealtimeSnapshot();
    });
  }

  function getRealtimeOrdersSnapshot() {
    if (!realtimeOrders.ready) {
      return { orders: [], active: [], history: [] };
    }
    return {
      orders: realtimeOrders.snapshot.orders.map(cloneOrderSnapshot),
      active: realtimeOrders.snapshot.active.map(cloneOrderSnapshot),
      history: realtimeOrders.snapshot.history.map(cloneOrderSnapshot)
    };
  }

  function applyRealtimeOrdersToState() {
    if (!realtimeOrders.ready) return;
    if (!posState || !posState.data) return;
    const historyClone = realtimeOrders.snapshot.history.map(cloneOrderSnapshot);
    const activeClone = realtimeOrders.snapshot.active.map(cloneOrderSnapshot);
    const baseData = posState.data || {};
    const nextData = {
      ...baseData,
      ordersQueue: activeClone,
      ordersHistory: historyClone
    };
    nextData.reports = computeRealtimeReports({ env: posState.env, data: nextData });
    posState.data = nextData;
    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState(prev => {
        const prevData = prev.data || {};
        const mergedData = {
          ...prevData,
          ordersQueue: activeClone.map(cloneOrderSnapshot),
          ordersHistory: historyClone.map(cloneOrderSnapshot)
        };
        mergedData.reports = computeRealtimeReports({ env: prev.env || posState.env, data: mergedData });
        return {
          ...prev,
          data: mergedData
        };
      });
    }
  }

  const DATASET_PAYLOAD_KEY_CACHE = new Map();

  const registerDatasetKeyVariant = (bucket, name) => {
    if (typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    bucket.add(trimmed);
    bucket.add(trimmed.toLowerCase());
    const snakeToCamel = trimmed.replace(/[-_\s]+([A-Za-z0-9])/g, (_match, chr) => chr ? chr.toUpperCase() : '');
    if (snakeToCamel) {
      const lowerCamel = snakeToCamel.charAt(0).toLowerCase() + snakeToCamel.slice(1);
      bucket.add(lowerCamel);
      bucket.add(lowerCamel.charAt(0).toUpperCase() + lowerCamel.slice(1));
    }
  };

  const getDatasetPayloadKeysFor = (canonical) => {
    const normalized = canonicalizeTableName(canonical);
    if (!normalized) return [];
    if (DATASET_PAYLOAD_KEY_CACHE.has(normalized)) {
      return DATASET_PAYLOAD_KEY_CACHE.get(normalized);
    }
    const variants = new Set();
    registerDatasetKeyVariant(variants, normalized);
    const descriptor = Object.values(TABLE_ALIAS_GROUPS).find(entry => entry.canonical === normalized) || null;
    if (descriptor) {
      (descriptor.aliases || []).forEach(alias => registerDatasetKeyVariant(variants, alias));
    }
    if (POS_TABLE_HANDLES && POS_TABLE_HANDLES[normalized]) {
      registerDatasetKeyVariant(variants, POS_TABLE_HANDLES[normalized]);
    }
    const keys = Array.from(variants).filter(Boolean);
    DATASET_PAYLOAD_KEY_CACHE.set(normalized, keys);
    return keys;
  };

  const readDatasetArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseMaybeJSONish(value);
      return Array.isArray(parsed) ? parsed : [];
    }
    return coerceArray(value);
  };

  async function installRealtimeOrderWatchers() {
    //console.log('[POS][installRealtimeOrderWatchers] Starting...', realtimeOrders);
    if (realtimeOrders.installed) return;
    if (!realtimeOrders.store) return;
    const store = realtimeOrders.store;

    // تشخيص: معرفة الجداول المسجلة
    //console.log('[POS][installRealtimeOrderWatchers] POS_TABLE_HANDLES:', POS_TABLE_HANDLES);
    //console.log('[POS][installRealtimeOrderWatchers] store.config:', store.config);
    const registeredObjects = Object.keys(store.config?.objects || {});
    //console.log('[POS][installRealtimeOrderWatchers] Registered objects:', registeredObjects);

    // ✅ UNIFIED: استخدام canonical names فقط (matching Backend)
    const headerTableName = 'order_header';   // ✅ Canonical name
    const lineTableName = 'order_line';       // ✅ Canonical name
    const paymentTableName = 'order_payment'; // ✅ Canonical name

    // تسجيل الجداول إذا لم تكن مسجلة
    if (typeof store.register === 'function') {
      if (!registeredObjects.includes(headerTableName)) {
        //console.log('[POS][installRealtimeOrderWatchers] Registering:', headerTableName);
        try {
          store.register(headerTableName, { table: 'order_header' });
        } catch (err) {
          //console.warn('[POS][installRealtimeOrderWatchers] Failed to register', headerTableName, err);
        }
      }
      if (!registeredObjects.includes(lineTableName)) {
        //console.log('[POS][installRealtimeOrderWatchers] Registering:', lineTableName);
        try {
          store.register(lineTableName, { table: 'order_line' });
        } catch (err) {
          //console.warn('[POS][installRealtimeOrderWatchers] Failed to register', lineTableName, err);
        }
      }
      if (!registeredObjects.includes(paymentTableName)) {
        //console.log('[POS][installRealtimeOrderWatchers] Registering:', paymentTableName);
        try {
          store.register(paymentTableName, { table: 'order_payment' });
        } catch (err) {
          //console.warn('[POS][installRealtimeOrderWatchers] Failed to register', paymentTableName, err);
        }
      }
    }

    //console.log('[POS][installRealtimeOrderWatchers] Using table names:', {
    //  headerTableName,
    //  lineTableName,
    //  paymentTableName
    //});

    // ===== التعبئة الأولية: Smart Fetch من REST API =====
    //console.log('[POS][installRealtimeOrderWatchers] Smart Fetch: Loading initial data from REST API...');

    const fetchInitialData = async () => {
      try {
        const branchId = BRANCH_ID || 'dar';
        const apiUrl = window.basedomain + `/api/branches/${encodeURIComponent(branchId)}/modules/pos`;
        //console.log('[POS][installRealtimeOrderWatchers] Fetching from:', apiUrl);
        const response = await fetch(apiUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const snapshot = await response.json();
        //console.log('[POS][installRealtimeOrderWatchers] Received snapshot with tables:', Object.keys(snapshot.tables || {}));

        // معالجة البيانات المحملة
        const fetchedTables = snapshot.tables || {};

        // معالجة headers
        const headerRows = Array.isArray(fetchedTables.order_header) ? fetchedTables.order_header : [];
        const headersMap = new Map();
        headerRows.forEach(row => {
          const normalized = sanitizeOrderHeaderRow(row);
          if (!normalized) return;
          const id = String(normalized.id);
          headersMap.set(id, normalized);
        });
        realtimeOrders.headers = headersMap;
        //console.log('[POS][installRealtimeOrderWatchers] Loaded', headersMap.size, 'headers from REST API');

        // معالجة lines
        const lineRows = Array.isArray(fetchedTables.order_line) ? fetchedTables.order_line : [];
        const linesMap = new Map();
        lineRows.forEach(row => {
          const normalized = sanitizeOrderLineRow(row);
          if (!normalized || !normalized.orderId) return;
          const orderId = String(normalized.orderId);
          if (!linesMap.has(orderId)) linesMap.set(orderId, []);
          linesMap.get(orderId).push(normalized);
        });
        realtimeOrders.lines = linesMap;
        //console.log('[POS][installRealtimeOrderWatchers] Loaded', linesMap.size, 'line groups from REST API');

        // معالجة payments
        const paymentRows = Array.isArray(fetchedTables.order_payment) ? fetchedTables.order_payment : [];
        const paymentsMap = new Map();
        paymentRows.forEach(row => {
          const normalized = sanitizeOrderPaymentRow(row);
          if (!normalized || !normalized.orderId) return;
          const orderId = String(normalized.orderId);
          if (!paymentsMap.has(orderId)) paymentsMap.set(orderId, []);
          paymentsMap.get(orderId).push(normalized);
        });
        realtimeOrders.payments = paymentsMap;
        //console.log('[POS][installRealtimeOrderWatchers] Loaded', paymentsMap.size, 'payment groups from REST API');

        // تحديث الـ snapshot
        scheduleRealtimeSnapshot();
        //console.log('[POS][installRealtimeOrderWatchers] Smart Fetch: Complete!');
      } catch (err) {
        //console.warn('[POS][installRealtimeOrderWatchers] Smart Fetch failed:', err.message);
        //console.log('[POS][installRealtimeOrderWatchers] Will rely on WebSocket updates only');
        // Initialize with empty maps
        realtimeOrders.headers = new Map();
        realtimeOrders.lines = new Map();
        realtimeOrders.payments = new Map();
        scheduleRealtimeSnapshot();
      }
    };

    // تنفيذ fetch فوراً
    await fetchInitialData();

    // ===== تسجيل Watchers للتحديثات في الوقت الفعلي =====
    //console.log('[POS][installRealtimeOrderWatchers] Registering watchers...');

    const unsubHeaders = store.watch(headerTableName, (rows) => {
      const beforeCount = realtimeOrders.headers.size;
      const incomingIds = new Set();
      (rows || []).forEach(row => {
        const normalized = sanitizeOrderHeaderRow(row);
        if (!normalized) return;
        const id = String(normalized.id);
        incomingIds.add(id);
        realtimeOrders.headers.set(id, normalized);
      });
      const deletedIds = [];
      for (const [id] of Array.from(realtimeOrders.headers.entries())) {
        if (!incomingIds.has(id)) {
          deletedIds.push(id);
          realtimeOrders.headers.delete(id);
        }
      }
      const afterCount = realtimeOrders.headers.size;
      //console.log('[POS][WATCH][order_header]', {
      //  count: (rows || []).length,
      //  before: beforeCount,
      //  incoming: incomingIds.size,
      //  deleted: deletedIds.length,
      //  after: afterCount,
      //  sample: (rows && rows.length ? sanitizeOrderHeaderRow(rows[0]) : null)
      //});
      scheduleRealtimeSnapshot();
    });

    const unsubLines = store.watch(lineTableName, (rows) => {
      const grouped = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeOrderLineRow(row);
        if (!normalized || !normalized.orderId) return;
        const orderId = String(normalized.orderId);
        if (!grouped.has(orderId)) grouped.set(orderId, []);
        grouped.get(orderId).push(normalized);
      });
      realtimeOrders.lines = grouped;
      //console.log('[POS][WATCH][order_line]', {
      //  count: (rows || []).length,
      //  groupedSize: grouped.size,
      //  sample: (rows && rows.length ? sanitizeOrderLineRow(rows[0]) : null)
      //});
      scheduleRealtimeSnapshot();
    });

    const unsubPayments = store.watch(paymentTableName, (rows) => {
      const grouped = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeOrderPaymentRow(row);
        if (!normalized || !normalized.orderId) return;
        const orderId = String(normalized.orderId);
        if (!grouped.has(orderId)) grouped.set(orderId, []);
        grouped.get(orderId).push(normalized);
      });
      realtimeOrders.payments = grouped;
      //console.log('[POS][WATCH][order_payment]', {
      //  count: (rows || []).length,
      //  groupedSize: grouped.size,
      //  sample: (rows && rows.length ? sanitizeOrderPaymentRow(rows[0]) : null)
      //});
      scheduleRealtimeSnapshot();
    });

    realtimeOrders.unsubscribes = [unsubHeaders, unsubLines, unsubPayments].filter(Boolean);
    realtimeOrders.installed = true;
    //console.log('[POS][installRealtimeOrderWatchers] Completed successfully');
  }


  // ❌ REMOVED: updateRealtimeJobOrdersSnapshot
  // No longer needed - posv2.html watchers update window.database directly (same as KDS!)
  function updateRealtimeJobOrdersSnapshot() {
    // Do nothing - deprecated function
    //console.log('⚠️ [updateRealtimeJobOrdersSnapshot] DEPRECATED - use window.database instead');
  }

  function scheduleRealtimeJobOrdersSnapshot() {
    // ✅ NO-OP: posv2.html watchers update window.database directly (lines 162-176)
    // No need to manually update snapshot - real-time broadcasting works automatically!
    // This function is kept for backward compatibility with existing code
    if (realtimeJobOrders.pending) return;
    realtimeJobOrders.pending = true;
    Promise.resolve().then(() => {
      realtimeJobOrders.pending = false;
      // ❌ REMOVED: updateRealtimeJobOrdersSnapshot() - deprecated and breaks real-time!
      // window.database is updated automatically by HTML watchers
    });
  }

  function installRealtimeJobOrderWatchers() {
    if (realtimeJobOrders.installed) return;
    if (!realtimeJobOrders.store) return;
    const store = realtimeJobOrders.store;
    // ✅ [POS V2] Use correct table names matching posv2.html registration
    const jobHeaderTable = POS_TABLE_HANDLES.job_order_header || 'job_order_header';
    const jobDetailTable = POS_TABLE_HANDLES.job_order_detail || 'job_order_detail';
    const jobModifierTable = POS_TABLE_HANDLES.job_order_detail_modifier || 'job_order_detail_modifier';
    const jobStatusTable = POS_TABLE_HANDLES.job_order_status_history || 'job_order_status_history';
    const expoTicketTable = POS_TABLE_HANDLES.expo_pass_ticket || 'expo_pass_ticket';
    //console.log('📋 [POS V2] Installing job order watchers for tables:', {
    //  jobHeaderTable,
    //  jobDetailTable,
    //  jobModifierTable,
    //  jobStatusTable,
    //  expoTicketTable
    //});
    const unsubHeaders = store.watch(jobHeaderTable, (rows) => {
      //console.log('🔍 [job_order_header WATCHER] Received rows:', rows?.length || 0);
      logIndexedDbSample(realtimeJobOrders.debugLogged, 'job_order_header', rows, sanitizeJobOrderHeaderRow);
      realtimeJobOrders.headers.clear();
      (rows || []).forEach(row => {
        const normalized = sanitizeJobOrderHeaderRow(row);
        if (!normalized) return;
        realtimeJobOrders.headers.set(String(normalized.id), normalized);
      });
      //console.log('🔍 [job_order_header WATCHER] Stored in Map:', realtimeJobOrders.headers.size, 'headers');
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubBatches = store.watch('job_order_batch', (rows) => {
      //console.log('📦 [job_order_batch WATCHER] Received rows:', rows?.length || 0);
      if (!realtimeJobOrders.batches) realtimeJobOrders.batches = new Map();
      realtimeJobOrders.batches.clear();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        realtimeJobOrders.batches.set(String(row.id), row);
      });
      //console.log('📦 [job_order_batch WATCHER] Stored in Map:', realtimeJobOrders.batches.size, 'batches');
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubDetails = store.watch(jobDetailTable, (rows) => {
      //console.log('🔍 [job_order_detail WATCHER] Received rows:', rows?.length || 0);
      logIndexedDbSample(realtimeJobOrders.debugLogged, 'job_order_detail', rows, sanitizeJobOrderDetailRow);
      const grouped = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeJobOrderDetailRow(row);
        if (!normalized) return;
        const key = normalized.jobOrderId;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(normalized);
      });
      realtimeJobOrders.details = grouped;
      //console.log('🔍 [job_order_detail WATCHER] Stored in Map:', grouped.size, 'job orders');
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubModifiers = store.watch(jobModifierTable, (rows) => {
      logIndexedDbSample(realtimeJobOrders.debugLogged, 'job_order_detail_modifier', rows, sanitizeJobOrderModifierRow);
      const map = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeJobOrderModifierRow(row);
        if (!normalized) return;
        map.set(normalized.id, normalized);
      });
      realtimeJobOrders.modifiers = map;
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubStatus = store.watch(jobStatusTable, (rows) => {
      logIndexedDbSample(realtimeJobOrders.debugLogged, 'job_order_status_history', rows, sanitizeJobOrderHistoryRow);
      const map = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeJobOrderHistoryRow(row);
        if (!normalized) return;
        map.set(normalized.id, normalized);
      });
      realtimeJobOrders.statusHistory = map;
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubExpo = store.watch(expoTicketTable, (rows) => {
      logIndexedDbSample(realtimeJobOrders.debugLogged, 'expo_pass_ticket', rows, sanitizeExpoPassTicketRow);
      const map = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeExpoPassTicketRow(row);
        if (!normalized) return;
        map.set(normalized.id, normalized);
      });
      realtimeJobOrders.expoPassTickets = map;
      scheduleRealtimeJobOrdersSnapshot();
    });
    realtimeJobOrders.unsubscribes = [unsubHeaders, unsubDetails, unsubModifiers, unsubStatus, unsubExpo].filter(Boolean);
    realtimeJobOrders.installed = true;
  }

  // ✅ [POS V2] Install Realtime Table Watchers for Multi-Device Sync
  async function installRealtimeTableWatchers() {
    //console.log('[POS][installRealtimeTableWatchers] Starting...', realtimeTables);
    if (realtimeTables.installed) return;
    if (!realtimeTables.store) return;
    const store = realtimeTables.store;

    // Register table names (canonical names matching backend)
    const diningTableName = 'dining_tables';
    const tableLockName = 'table_lock';

    const registeredObjects = Object.keys(store.config?.objects || {});
    //console.log('[POS][installRealtimeTableWatchers] Registered objects:', registeredObjects);

    if (typeof store.register === 'function') {
      if (!registeredObjects.includes(diningTableName)) {
        //console.log('[POS][installRealtimeTableWatchers] Registering:', diningTableName);
        try {
          store.register(diningTableName, { table: 'dining_tables' });
        } catch (err) {
          //console.warn('[POS][installRealtimeTableWatchers] Failed to register', diningTableName, err);
        }
      }
      if (!registeredObjects.includes(tableLockName)) {
        //console.log('[POS][installRealtimeTableWatchers] Registering:', tableLockName);
        try {
          store.register(tableLockName, { table: 'table_lock' });
        } catch (err) {
          //console.warn('[POS][installRealtimeTableWatchers] Failed to register', tableLockName, err);
        }
      }
    }

    //console.log('[POS][installRealtimeTableWatchers] Using table names:', { diningTableName, tableLockName });

    // Load initial data from REST API
    const fetchInitialData = async () => {
      try {
        const branchId = BRANCH_ID || 'dar';
        const apiUrl = window.basedomain + `/api/branches/${encodeURIComponent(branchId)}/modules/pos`;
        //console.log('[POS][installRealtimeTableWatchers] Fetching from:', apiUrl);
        const response = await fetch(apiUrl, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const snapshot = await response.json();
        //console.log('[POS][installRealtimeTableWatchers] Received snapshot with tables:', Object.keys(snapshot.tables || {}));

        const fetchedTables = snapshot.tables || {};

        // Process dining_tables
        const tableRows = Array.isArray(fetchedTables.dining_tables) ? fetchedTables.dining_tables : [];
        const tablesMap = new Map();
        tableRows.forEach(row => {
          const normalized = sanitizeDiningTableRow(row);
          if (!normalized) return;
          const id = String(normalized.id);
          tablesMap.set(id, normalized);
        });
        realtimeTables.tables = tablesMap;
        //console.log('[POS][installRealtimeTableWatchers] Loaded', tablesMap.size, 'tables from REST API');

        // Process table_lock
        const lockRows = Array.isArray(fetchedTables.table_lock) ? fetchedTables.table_lock : [];
        const locksArray = [];
        lockRows.forEach(row => {
          const normalized = sanitizeTableLockRow(row);
          if (!normalized) return;
          locksArray.push(normalized);
        });
        realtimeTables.snapshot = {
          tables: Array.from(tablesMap.values()),
          tableLocks: locksArray
        };
        //console.log('[POS][installRealtimeTableWatchers] Loaded', locksArray.length, 'table locks from REST API');

        // Apply to state
        applyRealtimeTablesToState();
        //console.log('[POS][installRealtimeTableWatchers] Initial data loaded successfully');
      } catch (err) {
        //console.warn('[POS][installRealtimeTableWatchers] Smart Fetch failed:', err.message);
        //console.log('[POS][installRealtimeTableWatchers] Will rely on WebSocket updates only');
        realtimeTables.tables = new Map();
        realtimeTables.snapshot = { tables: [], tableLocks: [] };
        applyRealtimeTablesToState();
      }
    };

    await fetchInitialData();

    // Register watchers for real-time updates
    //console.log('[POS][installRealtimeTableWatchers] Registering watchers...');

    const unsubTables = store.watch(diningTableName, (rows) => {
      const beforeCount = realtimeTables.tables.size;
      const tablesMap = new Map();
      (rows || []).forEach(row => {
        const normalized = sanitizeDiningTableRow(row);
        if (!normalized) return;
        const id = String(normalized.id);
        tablesMap.set(id, normalized);
      });
      realtimeTables.tables = tablesMap;
      const afterCount = tablesMap.size;
      //console.log('[POS][WATCH][dining_tables]', {
      //  count: (rows || []).length,
      //  before: beforeCount,
      //  after: afterCount,
      //  sample: (rows && rows.length ? sanitizeDiningTableRow(rows[0]) : null)
      //});
      applyRealtimeTablesToState();
    });

    const unsubLocks = store.watch(tableLockName, (rows) => {
      const locksArray = [];
      (rows || []).forEach(row => {
        const normalized = sanitizeTableLockRow(row);
        if (!normalized) return;
        locksArray.push(normalized);
      });
      realtimeTables.snapshot.tableLocks = locksArray;
      //console.log('[POS][WATCH][table_lock]', {
      //  count: (rows || []).length,
      //  activeLocks: locksArray.filter(lock=> lock.active).length,
      //  sample: (rows && rows.length ? sanitizeTableLockRow(rows[0]) : null)
      //});
      applyRealtimeTablesToState();
    });

    realtimeTables.unsubscribes = [unsubTables, unsubLocks].filter(Boolean);
    realtimeTables.installed = true;
    //console.log('[POS][installRealtimeTableWatchers] Completed successfully');
  }

  function applyRealtimeTablesToState() {
    if (!posState || !posState.data) return;
    const tablesClone = Array.from(realtimeTables.tables.values()).map(t => ({ ...t }));
    const locksClone = (realtimeTables.snapshot.tableLocks || []).map(l => ({ ...l }));
    const baseData = posState.data || {};
    const nextData = {
      ...baseData,
      tables: tablesClone,
      tableLocks: locksClone
    };
    posState.data = nextData;
    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState(prev => {
        const prevData = prev.data || {};
        return {
          ...prev,
          data: {
            ...prevData,
            tables: tablesClone.map(t => ({ ...t })),
            tableLocks: locksClone.map(l => ({ ...l }))
          }
        };
      });
    }
    //console.log('[POS][applyRealtimeTablesToState] Updated state with', tablesClone.length, 'tables and', locksClone.length, 'locks');
  }


  const pendingKdsMessages = [];

  const mergeJobOrderCollections = (current = {}, patch = {}) => {
    const mergeList = (base = [], updates = [], key = 'id') => {
      const map = new Map();
      (Array.isArray(base) ? base : []).forEach(item => {
        if (!item || item[key] == null) return;
        map.set(String(item[key]), { ...item });
      });
      (Array.isArray(updates) ? updates : []).forEach(item => {
        if (!item || item[key] == null) return;
        const id = String(item[key]);
        map.set(id, Object.assign({}, map.get(id) || {}, item));
      });
      return Array.from(map.values());
    };
    return {
      headers: mergeList(current.headers, patch.headers),
      details: mergeList(current.details, patch.details),
      modifiers: mergeList(current.modifiers, patch.modifiers),
      statusHistory: mergeList(current.statusHistory, patch.statusHistory),
      expoPassTickets: mergeList(current.expoPassTickets, patch.expoPassTickets, 'id')
    };
  };

  function mergeHandoffRecord(base, patch) {
    const source = base && typeof base === 'object' ? base : {};
    const target = { ...source };
    let changed = false;
    Object.keys(patch || {}).forEach(key => {
      const value = patch[key];
      if (target[key] !== value) {
        target[key] = value;
        changed = true;
      }
    });
    return { next: target, changed };
  }

  // ❌ REMOVED: applyKdsOrderSnapshotNow
  // No longer needed - we don't use data.kds anymore, read from store.listTable() instead!
  function applyKdsOrderSnapshotNow(payload = {}, meta = {}) {
    // Do nothing - deprecated function
    //console.log('⚠️ [applyKdsOrderSnapshotNow] DEPRECATED - use store.listTable() instead');
    return;
  }

  function applyKdsJobUpdateNow(jobId, payload = {}, meta = {}) {
    const normalizedId = jobId != null ? String(jobId) : '';
    if (!normalizedId) return;
    const patch = {
      headers: [{ id: normalizedId, ...payload }]
    };
    if (Array.isArray(payload.details)) patch.details = payload.details;
    if (Array.isArray(payload.modifiers)) patch.modifiers = payload.modifiers;
    if (Array.isArray(payload.statusHistory)) patch.statusHistory = payload.statusHistory;
    const updater = (state) => {
      const data = state.data || {};
      const currentKds = data.kds || {};
      const merged = mergeJobOrderCollections(currentKds.jobOrders || {}, patch);
      return {
        ...state,
        data: {
          ...data,
          kds: {
            ...currentKds,
            jobOrders: merged,
            lastSyncMeta: { ...(currentKds.lastSyncMeta || {}), ...meta }
          }
        }
      };
    };
    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState(updater);
    } else {
      enqueueKdsMessage({ type: 'job', jobId: normalizedId, payload, meta });
    }
  }

  function applyKdsDeliveryUpdateNow(orderId, payload = {}, meta = {}) {
    const normalizedId = orderId != null ? String(orderId) : '';
    if (!normalizedId) return;
    const updater = (state) => {
      const data = state.data || {};
      const currentKds = data.kds || {};
      const deliveries = currentKds.deliveries || { assignments: {}, settlements: {} };
      const assignments = { ...(deliveries.assignments || {}) };
      const settlements = { ...(deliveries.settlements || {}) };
      if (payload.assignment) {
        assignments[normalizedId] = { ...(assignments[normalizedId] || {}), ...payload.assignment };
      }
      if (payload.settlement) {
        settlements[normalizedId] = { ...(settlements[normalizedId] || {}), ...payload.settlement };
      }
      return {
        ...state,
        data: {
          ...data,
          kds: {
            ...currentKds,
            deliveries: { assignments, settlements },
            lastSyncMeta: { ...(currentKds.lastSyncMeta || {}), ...meta }
          }
        }
      };
    };
    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState(updater);
    } else {
      enqueueKdsMessage({ type: 'delivery', orderId: normalizedId, payload, meta });
    }
  }

  function applyHandoffUpdateNow(orderId, payload = {}, meta = {}) {
    const normalizedId = orderId != null ? String(orderId) : '';
    if (!normalizedId) {
      return;
    }
    const patch = { ...(payload || {}) };
    if (!patch.updatedAt && meta && meta.ts) {
      patch.updatedAt = meta.ts;
    }
    const updateEntry = (entry) => {
      if (!entry || String(entry.id) !== normalizedId) {
        return { value: entry, changed: false };
      }
      const { next: merged, changed: handoffChanged } = mergeHandoffRecord(entry.handoff, patch);
      const statusCandidate = patch.status !== undefined
        ? patch.status
        : (merged.status !== undefined ? merged.status : entry.handoffStatus);
      const updatedAtChanged = patch.updatedAt && patch.updatedAt !== entry.updatedAt;
      let needsUpdate = handoffChanged || updatedAtChanged;
      if (statusCandidate !== undefined && statusCandidate !== entry.handoffStatus) {
        needsUpdate = true;
      }
      if (!needsUpdate) {
        return { value: entry, changed: false };
      }
      const nextEntry = {
        ...entry,
        handoff: merged
      };
      if (statusCandidate !== undefined) {
        nextEntry.handoffStatus = statusCandidate;
      }
      if (patch.updatedAt) {
        nextEntry.updatedAt = patch.updatedAt;
      }
      if (statusCandidate === 'served') {
        if (nextEntry.status !== 'finalized') nextEntry.status = 'finalized';
        nextEntry.fulfillmentStage = 'delivered';
        const finishAt = patch.servedAt || patch.updatedAt;
        if (finishAt) {
          nextEntry.finishedAt = finishAt;
        }
      } else if (statusCandidate === 'assembled' && nextEntry.fulfillmentStage !== 'delivered' && nextEntry.fulfillmentStage !== 'ready') {
        nextEntry.fulfillmentStage = 'ready';
      }
      return { value: nextEntry, changed: true };
    };
    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState((state) => {
        const data = state.data || {};
        const reconcileList = (list) => {
          if (!Array.isArray(list) || !list.length) {
            return { value: list, changed: false };
          }
          let changed = false;
          let hasCandidate = false;
          const nextList = list.map(item => {
            if (item && String(item.id) === normalizedId) {
              hasCandidate = true;
              const result = updateEntry(item);
              if (result.changed) changed = true;
              return result.value;
            }
            return item;
          });
          if (!hasCandidate || !changed) {
            return { value: list, changed: false };
          }
          return { value: nextList, changed: true };
        };
        const { value: queueNext, changed: queueChanged } = reconcileList(data.ordersQueue);
        const { value: historyNext, changed: historyChanged } = reconcileList(data.ordersHistory);
        const currentOrder = data.order && String(data.order.id) === normalizedId
          ? updateEntry(data.order)
          : { value: data.order, changed: false };
        const currentKds = data.kds || {};
        const currentHandoffEntry = currentKds.handoff?.[normalizedId];
        const { next: kdsHandoffEntry, changed: kdsHandoffChanged } = mergeHandoffRecord(currentHandoffEntry, patch);
        if (!queueChanged && !historyChanged && !currentOrder.changed && !kdsHandoffChanged) {
          return state;
        }
        return {
          ...state,
          data: {
            ...data,
            order: currentOrder.value,
            ordersQueue: queueChanged ? queueNext : data.ordersQueue,
            ordersHistory: historyChanged ? historyNext : data.ordersHistory,
            kds: {
              ...currentKds,
              handoff: {
                ...(currentKds.handoff || {}),
                [normalizedId]: kdsHandoffEntry
              }
            }
          }
        };
      });
    }
    if (posDB && posDB.available && typeof posDB.getOrder === 'function' && typeof posDB.saveOrder === 'function') {
      Promise.resolve(posDB.getOrder(normalizedId))
        .then((record) => {
          if (!record) return null;
          const { next: merged, changed: handoffChanged } = mergeHandoffRecord(record.handoff, patch);
          const statusCandidate = patch.status !== undefined
            ? patch.status
            : (merged.status !== undefined ? merged.status : record.handoffStatus);
          let changed = handoffChanged;
          if (statusCandidate !== undefined && statusCandidate !== record.handoffStatus) {
            changed = true;
          }
          const updatedAtChanged = patch.updatedAt && patch.updatedAt !== record.updatedAt;
          if (updatedAtChanged) changed = true;
          if (!changed) {
            return null;
          }
          const nextRecord = {
            ...record,
            handoff: merged
          };
          if (statusCandidate !== undefined) {
            nextRecord.handoffStatus = statusCandidate;
          }
          if (patch.updatedAt) {
            nextRecord.updatedAt = patch.updatedAt;
          }
          if (statusCandidate === 'served') {
            if (nextRecord.status !== 'finalized') nextRecord.status = 'finalized';
            nextRecord.fulfillmentStage = 'delivered';
            const finishAt = patch.servedAt || patch.updatedAt;
            if (finishAt) {
              nextRecord.finishedAt = finishAt;
            }
          } else if (statusCandidate === 'assembled' && nextRecord.fulfillmentStage !== 'delivered' && nextRecord.fulfillmentStage !== 'ready') {
            nextRecord.fulfillmentStage = 'ready';
          }

          // ✅ CRITICAL FIX: Direct update to order_header instead of full saveOrder
          // saveOrder tries to re-manufacture job_order_detail which causes errors!
          // We only need to update the handoff status, not re-save the entire order
          if (store && typeof store.update === 'function') {
            const currentVersion = nextRecord.version || 1;
            const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

            return store.update('order_header', {
              id: nextRecord.id,
              handoffStatus: nextRecord.handoffStatus,
              fulfillmentStage: nextRecord.fulfillmentStage,
              status: nextRecord.status,
              finishedAt: nextRecord.finishedAt,
              version: nextVersion,
              updatedAt: nextRecord.updatedAt || new Date().toISOString()
            });
          } else {
            // Fallback to saveOrder if store not available (shouldn't happen)
            return posDB.saveOrder(nextRecord);
          }
        })
        .catch(err => console.warn('[Mishkah][POS][KDS] Failed to persist handoff update.', err));
    }
  }

  function enqueueKdsMessage(entry) {
    pendingKdsMessages.push(entry);
  }

  function flushPendingKdsMessages() {
    if (!appRef || typeof appRef.setState !== 'function') return;
    if (!pendingKdsMessages.length) return;
    const backlog = pendingKdsMessages.splice(0, pendingKdsMessages.length);
    backlog.forEach(entry => {
      if (entry && entry.type === 'handoff') {
        applyHandoffUpdateNow(entry.orderId, entry.payload, entry.meta);
      } else if (entry && entry.type === 'orders') {
        applyKdsOrderSnapshotNow(entry.payload, entry.meta || {});
      } else if (entry && entry.type === 'job') {
        applyKdsJobUpdateNow(entry.jobId, entry.payload, entry.meta || {});
      } else if (entry && entry.type === 'delivery') {
        applyKdsDeliveryUpdateNow(entry.orderId, entry.payload, entry.meta || {});
      }
    });
  }

  function handleKdsHandoffUpdate(message = {}, meta = {}) {
    const orderId = message.orderId || message.id;
    if (orderId == null) {
      return;
    }
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    if (!appRef || typeof appRef.setState !== 'function') {
      enqueueKdsMessage({ type: 'handoff', orderId: String(orderId), payload, meta });
      return;
    }
    applyHandoffUpdateNow(orderId, payload, meta);
  }

  function handleKdsOrderPayload(message = {}, meta = {}) {
    if (!message || !message.jobOrders) return;
    if (!appRef || typeof appRef.setState !== 'function') {
      enqueueKdsMessage({ type: 'orders', payload: message, meta });
      return;
    }
    applyKdsOrderSnapshotNow(message, meta);
  }

  function handleKdsJobUpdate(message = {}, meta = {}) {
    const jobId = message.jobId || message.id;
    if (!jobId) return;
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    if (!appRef || typeof appRef.setState !== 'function') {
      enqueueKdsMessage({ type: 'job', jobId: String(jobId), payload, meta });
      return;
    }
    applyKdsJobUpdateNow(jobId, payload, meta);
  }

  function handleKdsDeliveryUpdate(message = {}, meta = {}) {
    const orderId = message.orderId || message.id;
    if (!orderId) return;
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    if (!appRef || typeof appRef.setState !== 'function') {
      enqueueKdsMessage({ type: 'delivery', orderId: String(orderId), payload, meta });
      return;
    }
    applyKdsDeliveryUpdateNow(orderId, payload, meta);
  }

  function installTempOrderWatcher() {
    if (!posDB.available || posDB.supportsTempOrders === false) return;
    if (!M || !M.Guardian || typeof M.Guardian.runPreflight !== 'function') return;
    if (M.Guardian.runPreflight.__posTempWatcher) return;
    const originalRunPreflight = M.Guardian.runPreflight.bind(M.Guardian);
    const signatureCache = new Map();

    const computeSignature = (order, paymentsState) => {
      if (!order) return '';
      const totals = order.totals || {};
      const discount = normalizeDiscount(order.discount);
      const resolvedPayments = Array.isArray(paymentsState?.split) && paymentsState.split.length
        ? paymentsState.split
        : (Array.isArray(order.payments) ? order.payments : []);
      const lines = Array.isArray(order.lines)
        ? order.lines.map(line => [
          line.id || line.itemId || '',
          Number(line.qty) || 0,
          Number(line.total) || 0,
          Number(line.updatedAt) || 0
        ].join(':')).join('|')
        : '';
      const payments = resolvedPayments
        .map(pay => [pay.method || pay.id || '', Number(pay.amount) || 0].join(':'))
        .join('|');
      const notes = Array.isArray(order.notes)
        ? order.notes.map(note => note.id || note.message || '').join('|')
        : '';
      const tableIds = Array.isArray(order.tableIds) ? order.tableIds.join(',') : '';
      return [
        order.id || '',
        Number(order.updatedAt) || 0,
        order.status || '',
        order.fulfillmentStage || '',
        order.paymentState || '',
        discount ? `${discount.type}:${discount.value}` : 'null',
        `${Number(totals.subtotal) || 0}:${Number(totals.due) || 0}:${Number(totals.total) || 0}`,
        lines,
        payments,
        notes,
        tableIds,
        Number(order.guests) || 0
      ].join('#');
    };

    const persistTempOrder = (order, paymentsState) => {
      if (!order || !order.id) return;
      const payments = Array.isArray(paymentsState?.split) && paymentsState.split.length
        ? paymentsState.split
        : (Array.isArray(order.payments) ? order.payments : []);
      const payload = { ...order, payments };
      const signature = computeSignature(payload, paymentsState);
      if (signatureCache.get(order.id) === signature) return;
      signatureCache.set(order.id, signature);
      Promise.resolve(posDB.saveTempOrder(payload))
        .catch(err => console.warn('[Mishkah][POS] temp order persist failed', err));
    };

    const cleanupTempOrder = (orderId) => {
      if (!orderId) return;
      signatureCache.delete(orderId);
      Promise.resolve(posDB.deleteTempOrder(orderId))
        .catch(err => console.warn('[Mishkah][POS] temp order cleanup failed', err));
    };

    M.Guardian.runPreflight = function (stage, payload, ctx) {
      if (stage === 'state' && payload && typeof payload === 'object') {
        try {
          const nextState = payload.next || null;
          const prevState = payload.prev || null;
          const nextOrder = nextState?.data?.order || null;
          const prevOrder = prevState?.data?.order || null;
          const paymentsState = nextState?.data?.payments || null;
          const prevPaymentsState = prevState?.data?.payments || null;
          const sameOrder = nextOrder && prevOrder && nextOrder.id && prevOrder.id && nextOrder.id === prevOrder.id;
          let nextSignature = null;
          let prevSignature = null;
          if (nextOrder) {
            nextSignature = computeSignature(nextOrder, paymentsState);
          }
          if (prevOrder) {
            prevSignature = computeSignature(prevOrder, prevPaymentsState);
          }
          const orderMutated = sameOrder && nextSignature !== prevSignature;
          if (orderMutated && nextOrder) {
            if (nextState?.data?.order && typeof nextState.data.order === 'object') {
              nextState.data.order.isPersisted = false;
              nextState.data.order.dirty = true;
              nextState.data.order.savedAt = null;
            }
            if (Array.isArray(nextState?.data?.ordersHistory)) {
              const historyIndex = nextState.data.ordersHistory.findIndex(entry => entry && entry.id === nextOrder.id);
              if (historyIndex >= 0) {
                const updatedHistory = nextState.data.ordersHistory.slice();
                const currentEntry = { ...updatedHistory[historyIndex], isPersisted: false, dirty: true, savedAt: null };
                updatedHistory[historyIndex] = currentEntry;
                nextState.data.ordersHistory = updatedHistory;
              }
            }
          }
          if (prevOrder && prevOrder.id) {
            if (!nextOrder || nextOrder.id !== prevOrder.id || nextOrder.isPersisted) {
              cleanupTempOrder(prevOrder.id);
            }
          }
          if (nextOrder && nextOrder.id) {
            if (nextOrder.isPersisted) {
              cleanupTempOrder(nextOrder.id);
            } else {
              persistTempOrder(nextOrder, paymentsState);
            }
          }
        } catch (err) {
          //console.warn('[Mishkah][POS] temp order watcher failed', err);
        }
      }
      return originalRunPreflight(stage, payload, ctx);
    };
    M.Guardian.runPreflight.__posTempWatcher = true;
  }

  installTempOrderWatcher();
  const preferencesStore = U.Storage && U.Storage.local ? U.Storage.local('mishkah-pos') : null;
  const savedModalSizes = preferencesStore ? (preferencesStore.get('modalSizes', {}) || {}) : {};
  const savedThemePrefs = preferencesStore ? (preferencesStore.get('themePrefs', {}) || {}) : {};

  async function allocateInvoiceId() {
    if (!ACTIVE_BRANCH_ID) {
      throw new Error('Branch id is required for invoice allocation');
    }
    const endpoint = window.basedomain + `/api/branches/${encodeURIComponent(ACTIVE_BRANCH_ID)}/modules/${encodeURIComponent(MODULE_ID)}/sequences`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ table: 'order_header', field: 'id', record: { posId: POS_INFO.id, posNumber: POS_INFO.number } })
    });
    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText || '');
      throw new Error(message || `HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!payload || !payload.id) {
      throw new Error('Sequence allocation failed');
    }
    const numericValue = Number(payload.value);
    if (Number.isFinite(numericValue)) {
      invoiceSequence = Math.max(invoiceSequence, numericValue);
    }
    return payload.id;
  }
  function applyThemePreferenceStyles(prefs) {
    const styleId = 'pos-theme-prefs';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    if (!prefs || (Object.keys(prefs.light || {}).length === 0 && Object.keys(prefs.dark || {}).length === 0)) {
      styleEl.textContent = '';
      return;
    }
    const segments = [];
    const light = prefs.light || {};
    const dark = prefs.dark || {};
    const makeRule = (selector, conf) => {
      const colors = conf.colors || {};
      const fonts = conf.fonts || {};
      const declarations = [];
      Object.entries(colors).forEach(([prop, value]) => { if (value) declarations.push(`${prop}:${value}`); });
      if (fonts.base) declarations.push(`font-size:${fonts.base}`);
      if (declarations.length) segments.push(`${selector}{${declarations.join(';')}}`);
    };
    makeRule(':root', light);
    makeRule(':root.dark', dark);
    styleEl.textContent = segments.join('\n');
  }

  applyThemePreferenceStyles(savedThemePrefs);
  const kdsEndpointSetting = syncSettings.ws_endpoint || syncSettings.wsEndpoint || null;
  const DEFAULT_KDS_ENDPOINT = kdsEndpointSetting || 'wss://ws.mas.com.eg/ws';
  const mockEndpoint = MOCK_BASE?.kds && (MOCK_BASE.kds.endpoint || MOCK_BASE.kds.wsEndpoint);
  const kdsEndpoint = mockEndpoint || DEFAULT_KDS_ENDPOINT;
  if (!mockEndpoint) {
    console.info('[Mishkah][POS] Using default KDS WebSocket endpoint.', { endpoint: kdsEndpoint });
  } else {
    console.info('[Mishkah][POS] Using configured KDS WebSocket endpoint from mock base.', { endpoint: kdsEndpoint });
  }
  const kdsToken = MOCK_BASE?.kds?.token || null;
  if (!kdsToken) {
    console.info('[Mishkah][POS] No KDS auth token provided. Operating without authentication.');
  }
  const kdsBridge = createKDSBridge(kdsEndpoint);
  const LOCAL_SYNC_CHANNEL_NAME = 'mishkah-pos-kds-sync';
  const localKdsChannel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(LOCAL_SYNC_CHANNEL_NAME)
    : null;
  const emitLocalKdsMessage = (message) => {
    if (!localKdsChannel || !message) return;
    try { localKdsChannel.postMessage({ origin: 'pos', ...message }); } catch (_err) { }
  };
  if (localKdsChannel) {
    localKdsChannel.onmessage = (event) => {
      const msg = event?.data;
      if (!msg || !msg.type || msg.origin === 'pos') return;
      const meta = msg.meta || {};
      if (msg.type === 'orders:payload' && msg.payload) {
        handleKdsOrderPayload(msg.payload, meta);
        return;
      }
      if (msg.type === 'job:update' && msg.jobId) {
        handleKdsJobUpdate({ jobId: msg.jobId, payload: msg.payload || {} }, meta);
      }
      if (msg.type === 'delivery:update' && msg.orderId) {
        handleKdsDeliveryUpdate({ orderId: msg.orderId, payload: msg.payload || {} }, meta);
      }
      if (msg.type === 'handoff:update' && msg.orderId) {
        handleKdsHandoffUpdate({ orderId: msg.orderId, payload: msg.payload || {} }, meta);
      }
    };
  }
  // ❌ [POS V2] OLD WebSocket connection DISABLED
  // We now rely 100% on mishkah-store for real-time sync
  // The old direct WebSocket caused duplicate broadcasts
  const kdsSyncHandlers = {
    onOrders: handleKdsOrderPayload,
    onJobUpdate: handleKdsJobUpdate,
    onDeliveryUpdate: handleKdsDeliveryUpdate,
    onHandoffUpdate: handleKdsHandoffUpdate
  };
  // ❌ DISABLED: const kdsSync = createKDSSync({ endpoint: kdsEndpoint, token: kdsToken, handlers: kdsSyncHandlers, channel: BRANCH_CHANNEL, localEmitter: emitLocalKdsMessage });
  // ❌ DISABLED: if(kdsSync && typeof kdsSync.connect === 'function'){ kdsSync.connect(); }
  const kdsSync = null; // ✅ Set to null - mishkah-store handles everything now

  let kitchenSections;
  let categorySections;
  let categories;
  let menuItems;
  let menuIndex;
  let modifiersCatalog;
  let kdsConfig;

  function deriveMenuStructures(source) {
    const dataset = source || {};
    const menuSource = isPlainObject(dataset.menu) ? dataset.menu : null;
    const sectionsRaw = pickArray(dataset.kitchen_sections, menuSource?.kitchen_sections);
    const sections = sectionsRaw.map(section => {
      const name = ensureLocaleObject(section?.section_name, { ar: section?.id || '', en: section?.id || '' });
      const description = ensureLocaleObject(section?.description, {});
      return {
        id: section?.id,
        name,
        description
      };
    });
    const categorySectionsRaw = pickArray(dataset.category_sections, menuSource?.category_sections);
    const sectionMap = new Map(categorySectionsRaw.map(entry => [entry.category_id || entry.categoryId, entry.section_id || entry.sectionId]));
    const rawCategories = pickArray(dataset.menu_categories, menuSource?.categories);
    if (!rawCategories.some(cat => cat && cat.id === 'all')) {
      rawCategories.unshift({ id: 'all', category_name: { ar: 'الكل', en: 'All' }, section_id: 'expo' });
    }
    const normalizedCategories = rawCategories.map(cat => {
      const sectionId = cat?.section_id || sectionMap.get(cat?.id) || null;
      const fallbackLabel = { ar: cat?.id || '', en: cat?.id || '' };
      const label = ensureLocaleObject(cat?.category_name, fallbackLabel);
      return {
        id: cat?.id,
        sectionId,
        label
      };
    });
    const itemsRaw = pickArray(dataset.menu_items, menuSource?.items);
    const items = itemsRaw.map(item => {
      const categoryId = item.category_id || item.category || 'all';
      const pricing = ensurePlainObject(item.pricing);
      const priceSource = pricing.base ?? pricing.price ?? pricing.amount ?? pricing.value ?? item.price;
      const price = round(priceSource);
      const kitchenSection = item.kitchen_section_id || sectionMap.get(categoryId) || 'expo';
      const media = ensurePlainObject(item.media);
      const name = ensureLocaleObject(item.item_name || item.name, { ar: String(item.id || ''), en: String(item.id || '') });
      const description = ensureLocaleObject(item.item_description || item.description, { ar: '', en: '' });
      return {
        id: item.id,
        category: categoryId,
        price,
        image: media.image || media.url || media.path || item.image || '',
        kitchenSection,
        name,
        description
      };
    });
    const index = new Map(items.map(entry => [String(entry.id), entry]));
    const rawModifiers = isPlainObject(dataset.modifiers) && Object.keys(dataset.modifiers || {}).length
      ? dataset.modifiers
      : (menuSource && isPlainObject(menuSource.modifiers) ? menuSource.modifiers : {});
    const normalizeModifierEntry = (entry, fallbackType) => {
      if (!entry) return null;
      const id = entry.id ?? entry.code ?? entry.key;
      if (id == null) return null;
      const priceChange = Number(entry.price_change ?? entry.priceChange ?? entry.amount ?? 0) || 0;
      const label = ensureLocaleObject(entry.name || entry.label, { ar: String(id), en: String(id) });
      return {
        id: String(id),
        type: fallbackType,
        label,
        priceChange: round(priceChange)
      };
    };
    const addOns = (Array.isArray(rawModifiers.add_ons) ? rawModifiers.add_ons : rawModifiers.addOns || [])
      .map(entry => normalizeModifierEntry(entry, 'add_on'))
      .filter(Boolean);
    const removals = (Array.isArray(rawModifiers.removals) ? rawModifiers.removals : rawModifiers.remove || [])
      .map(entry => normalizeModifierEntry(entry, 'removal'))
      .filter(Boolean);
    return {
      kitchenSections: sections,
      categorySections: categorySectionsRaw,
      categories: normalizedCategories,
      menuItems: items,
      menuIndex: index,
      modifiersCatalog: { addOns, removals }
    };
  }

  const normalizeJobOrdersSnapshot = (source = {}) => ({
    headers: Array.isArray(source.headers) ? source.headers.map(entry => ({ ...entry })) : [],
    details: Array.isArray(source.details) ? source.details.map(entry => ({ ...entry })) : [],
    modifiers: Array.isArray(source.modifiers) ? source.modifiers.map(entry => ({ ...entry })) : [],
    statusHistory: Array.isArray(source.statusHistory) ? source.statusHistory.map(entry => ({ ...entry })) : [],
    expoPassTickets: Array.isArray(source.expoPassTickets) ? source.expoPassTickets.map(entry => ({ ...entry })) : []
  });

  const mergeDriversLists = (primary = [], secondary = []) => {
    const map = new Map();
    const append = (list) => {
      list.forEach(driver => {
        if (!driver) return;
        const id = driver.id != null ? String(driver.id) : null;
        if (id) {
          map.set(id, { ...driver });
        } else {
          map.set(`driver-${map.size + 1}`, { ...driver });
        }
      });
    };
    append(Array.isArray(primary) ? primary : []);
    append(Array.isArray(secondary) ? secondary : []);
    return Array.from(map.values());
  };

  function deriveKdsStructures(dataset, menuDerived) {
    const data = dataset || {};
    const kdsSource = ensurePlainObject(data.kds);
    const derivedMenu = menuDerived || deriveMenuStructures(data);
    const sections = Array.isArray(derivedMenu.kitchenSections) ? derivedMenu.kitchenSections : [];
    const stationsRaw = Array.isArray(kdsSource.stations) ? kdsSource.stations : [];
    const stations = stationsRaw.length
      ? stationsRaw.map(station => ({ ...station }))
      : sections.map((section, idx) => ({
        id: section.id,
        code: section.id ? String(section.id).toUpperCase() : `ST-${idx + 1}`,
        nameAr: section.name?.ar || section.id || `Station ${idx + 1}`,
        nameEn: section.name?.en || section.id || `Station ${idx + 1}`,
        stationType: section.id === 'expo' ? 'expo' : 'prep',
        isExpo: section.id === 'expo',
        sequence: idx + 1,
        themeColor: null,
        autoRouteRules: [],
        displayConfig: { layout: 'grid', columns: 2 },
        createdAt: null,
        updatedAt: null
      }));
    const stationRoutesRaw = Array.isArray(kdsSource.stationCategoryRoutes) ? kdsSource.stationCategoryRoutes : [];
    const fallbackRoutes = Array.isArray(data.category_sections)
      ? data.category_sections.map((entry, idx) => ({
        id: entry.id || `route-${idx + 1}`,
        categoryId: entry.category_id || entry.categoryId,
        stationId: entry.section_id || entry.sectionId,
        priority: entry.priority || 1,
        isActive: entry.is_active !== false && entry.isActive !== false,
        createdAt: entry.created_at || entry.createdAt || null,
        updatedAt: entry.updated_at || entry.updatedAt || null
      }))
      : [];
    const stationCategoryRoutes = (stationRoutesRaw.length ? stationRoutesRaw : fallbackRoutes)
      .map(route => ({ ...route }));
    const drivers = mergeDriversLists(data.drivers, kdsSource.drivers);
    const metadata = ensurePlainObject(kdsSource.metadata);
    const sync = ensurePlainObject(kdsSource.sync);
    const channel = normalizeChannelName(
      sync.channel || sync.branch_channel || sync.branchChannel || branchChannelSource || BRANCH_CHANNEL,
      BRANCH_CHANNEL
    );
    return {
      stations,
      stationCategoryRoutes,
      jobOrders: normalizeJobOrdersSnapshot(kdsSource.jobOrders),
      deliveries: { assignments: {}, settlements: {} },
      handoff: {},
      drivers,
      metadata,
      sync: { ...sync, channel },
      channel
    };
  }

  function applyKdsDataset(source, menuDerived) {
    kdsConfig = deriveKdsStructures(source, menuDerived);
    return kdsConfig;
  }

  function cloneKdsDerived() {
    const snapshot = kdsConfig || deriveKdsStructures(MOCK, { kitchenSections, categorySections });
    return {
      stations: Array.isArray(snapshot.stations) ? snapshot.stations.map(station => ({ ...station })) : [],
      stationCategoryRoutes: Array.isArray(snapshot.stationCategoryRoutes)
        ? snapshot.stationCategoryRoutes.map(route => ({ ...route }))
        : [],
      jobOrders: normalizeJobOrdersSnapshot(snapshot.jobOrders),
      deliveries: {
        assignments: { ...(snapshot.deliveries?.assignments || {}) },
        settlements: { ...(snapshot.deliveries?.settlements || {}) }
      },
      handoff: { ...(snapshot.handoff || {}) },
      drivers: Array.isArray(snapshot.drivers) ? snapshot.drivers.map(driver => ({ ...driver })) : [],
      metadata: { ...(snapshot.metadata || {}) },
      sync: { ...(snapshot.sync || {}), channel: snapshot.channel || BRANCH_CHANNEL },
      channel: snapshot.channel || BRANCH_CHANNEL
    };
  }

  function applyMenuDataset(source) {
    const derived = deriveMenuStructures(source);
    kitchenSections = derived.kitchenSections;
    categorySections = derived.categorySections;
    categories = derived.categories;
    menuItems = derived.menuItems;
    menuIndex = derived.menuIndex;
    modifiersCatalog = derived.modifiersCatalog;
    return derived;
  }

  function cloneMenuDerived() {
    return {
      kitchenSections: cloneDeep(kitchenSections),
      categorySections: cloneDeep(categorySections),
      categories: cloneDeep(categories),
      menuItems: cloneDeep(menuItems),
      modifiersCatalog: cloneDeep(modifiersCatalog),
      paymentMethods: clonePaymentMethods(PAYMENT_METHODS),
      kds: cloneKdsDerived()
    };
  }

  const initialMenuDerived = applyMenuDataset(MOCK);
  applyKdsDataset(MOCK, initialMenuDerived);

  let pendingRemoteResult = null;
  const assignRemoteData = (currentData, derivedSnapshot, remoteSnapshot) => {
    const menuState = currentData?.menu || {};
    const paymentsState = currentData?.payments || {};
    const derivedMethods = Array.isArray(derivedSnapshot?.paymentMethods) && derivedSnapshot.paymentMethods.length
      ? clonePaymentMethods(derivedSnapshot.paymentMethods)
      : clonePaymentMethods(PAYMENT_METHODS);
    let activeMethod = paymentsState.activeMethod;
    if (derivedMethods.length) {
      const hasActive = activeMethod && derivedMethods.some(method => method.id === activeMethod);
      activeMethod = hasActive ? activeMethod : derivedMethods[0].id;
    }
    const nextPayments = {
      ...paymentsState,
      methods: derivedMethods,
      activeMethod,
      split: Array.isArray(paymentsState.split) ? paymentsState.split.map(entry => ({ ...entry })) : []
    };
    const currentKds = currentData?.kds || {};
    const derivedKds = derivedSnapshot.kds || cloneKdsDerived();
    const nextKds = {
      ...currentKds,
      stations: Array.isArray(derivedKds.stations) ? derivedKds.stations.map(station => ({ ...station })) : [],
      stationCategoryRoutes: Array.isArray(derivedKds.stationCategoryRoutes)
        ? derivedKds.stationCategoryRoutes.map(route => ({ ...route }))
        : [],
      drivers: Array.isArray(derivedKds.drivers) ? derivedKds.drivers.map(driver => ({ ...driver })) : [],
      metadata: { ...(derivedKds.metadata || {}) },
      sync: { ...(derivedKds.sync || {}) },
      channel: derivedKds.channel || currentKds.channel || BRANCH_CHANNEL
    };
    if (!currentKds.jobOrders) {
      nextKds.jobOrders = normalizeJobOrdersSnapshot(derivedKds.jobOrders);
    }
    if (!currentKds.deliveries) {
      nextKds.deliveries = {
        assignments: { ...(derivedKds.deliveries?.assignments || {}) },
        settlements: { ...(derivedKds.deliveries?.settlements || {}) }
      };
    }
    if (!currentKds.handoff) {
      nextKds.handoff = { ...(derivedKds.handoff || {}) };
    }
    return {
      ...(currentData || {}),
      remotes: {
        ...(currentData?.remotes || {}),
        posDatabase: remoteSnapshot
      },
      kitchenSections: derivedSnapshot.kitchenSections,
      categorySections: derivedSnapshot.categorySections,
      menu: {
        ...menuState,
        categories: derivedSnapshot.categories,
        items: derivedSnapshot.menuItems
      },
      modifiers: derivedSnapshot.modifiersCatalog,
      payments: nextPayments,
      kds: nextKds
    };
  };

  const orderStages = (Array.isArray(MOCK.order_stages) && MOCK.order_stages.length ? MOCK.order_stages : [
    { id: 'new', stage_name: { ar: 'جديد', en: 'New' }, sequence: 1, lock_line_edits: false },
    { id: 'preparing', stage_name: { ar: 'جاري التجهيز', en: 'Preparing' }, sequence: 2, lock_line_edits: true },
    { id: 'prepared', stage_name: { ar: 'تم التجهيز', en: 'Prepared' }, sequence: 3, lock_line_edits: true },
    { id: 'delivering', stage_name: { ar: 'جاري التسليم', en: 'Delivering' }, sequence: 4, lock_line_edits: true },
    { id: 'delivered', stage_name: { ar: 'تم التسليم', en: 'Delivered' }, sequence: 5, lock_line_edits: true },
    { id: 'paid', stage_name: { ar: 'تم الدفع', en: 'Paid' }, sequence: 6, lock_line_edits: true },
    { id: 'closed', stage_name: { ar: 'تم الإغلاق', en: 'Closed' }, sequence: 7, lock_line_edits: true }
  ]).map(stage => ({
    id: stage.id,
    name: { ar: stage.stage_name?.ar || stage.id, en: stage.stage_name?.en || stage.id },
    sequence: typeof stage.sequence === 'number' ? stage.sequence : 0,
    lockLineEdits: stage.lock_line_edits !== undefined ? !!stage.lock_line_edits : true,
    description: stage.description || {}
  }));
  const orderStageMap = new Map(orderStages.map(stage => [stage.id, stage]));

  const orderStatuses = (Array.isArray(MOCK.order_statuses) && MOCK.order_statuses.length ? MOCK.order_statuses : [
    { id: 'open', status_name: { ar: 'مفتوح', en: 'Open' } },
    { id: 'held', status_name: { ar: 'معلّق', en: 'Held' } },
    { id: 'finalized', status_name: { ar: 'منتهي', en: 'Finalized' } },
    { id: 'closed', status_name: { ar: 'مغلق', en: 'Closed' } }
  ]).map(status => ({
    id: status.id,
    name: { ar: status.status_name?.ar || status.id, en: status.status_name?.en || status.id }
  }));
  const orderStatusMap = new Map(orderStatuses.map(status => [status.id, status]));

  const orderPaymentStates = (Array.isArray(MOCK.order_payment_states) && MOCK.order_payment_states.length ? MOCK.order_payment_states : [
    { id: 'unpaid', payment_name: { ar: 'غير مدفوع', en: 'Unpaid' } },
    { id: 'partial', payment_name: { ar: 'مدفوع جزئيًا', en: 'Partially Paid' } },
    { id: 'paid', payment_name: { ar: 'مدفوع', en: 'Paid' } }
  ]).map(state => ({
    id: state.id,
    name: { ar: state.payment_name?.ar || state.id, en: state.payment_name?.en || state.id }
  }));
  const orderPaymentMap = new Map(orderPaymentStates.map(state => [state.id, state]));

  const orderLineStatuses = (Array.isArray(MOCK.orderLines_statuses) && MOCK.orderLines_statuses.length ? MOCK.orderLines_statuses : [
    { id: 'draft', status_name: { ar: 'مسودة', en: 'Draft' } },
    { id: 'queued', status_name: { ar: 'بانتظار التحضير', en: 'Queued' } },
    { id: 'preparing', status_name: { ar: 'جاري التحضير', en: 'Preparing' } },
    { id: 'ready', status_name: { ar: 'جاهز', en: 'Ready' } },
    { id: 'served', status_name: { ar: 'مقدّم', en: 'Served' } }
  ]).map(status => ({
    id: status.id,
    name: { ar: status.status_name?.ar || status.id, en: status.status_name?.en || status.id }
  }));
  const orderLineStatusMap = new Map(orderLineStatuses.map(status => [status.id, status]));

  function toMillis(value, fallback) {
    if (!value && fallback != null) return fallback;
    if (!value) return Date.now();
    if (typeof value === 'number') return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : (fallback != null ? fallback : Date.now());
  }

  function cloneName(value) {
    if (!value) return { ar: '', en: '' };
    if (typeof value === 'string') return { ar: value, en: value };
    return {
      ar: value.ar || value.en || '',
      en: value.en || value.ar || ''
    };
  }

  function syncOrderVersionMetadata(order) {
    if (!order || typeof order !== 'object') return order;
    const next = { ...order };
    const currentVersion = Number(order.currentVersion ?? order.version);
    const expectedVersion = Number(order.expectedVersion);
    if (Number.isFinite(currentVersion) && currentVersion > 0) {
      next.version = Math.trunc(currentVersion);
      if (!Number.isFinite(expectedVersion) || expectedVersion < currentVersion) {
        next.expectedVersion = Math.trunc(currentVersion);
      } else {
        next.expectedVersion = Math.trunc(expectedVersion);
      }
      next.currentVersion = Math.trunc(currentVersion);
    } else if (Number.isFinite(expectedVersion) && expectedVersion > 0) {
      const normalized = Math.trunc(expectedVersion);
      next.version = normalized;
      next.expectedVersion = normalized;
      next.currentVersion = normalized;
    } else {
      if (next.version != null && !Number.isFinite(Number(next.version))) delete next.version;
      if (next.expectedVersion != null && !Number.isFinite(Number(next.expectedVersion))) delete next.expectedVersion;
      if (next.currentVersion != null && !Number.isFinite(Number(next.currentVersion))) delete next.currentVersion;
    }
    return next;
  }

  function enrichOrderLineWithMenu(line) {
    if (!line || typeof line !== 'object') return line;
    return normalizeOrderLine(line, {});
  }

  function enrichOrderWithMenu(order) {
    if (!order || typeof order !== 'object') return order;
    const next = { ...order };
    if (Array.isArray(order.lines)) {
      next.lines = order.lines.map(line => {
        const enriched = enrichOrderLineWithMenu(line);
        // ✅ CRITICAL FIX: Only mark EXISTING lines as persisted, NOT new lines!
        // New lines added to persisted orders should remain unpersisted (undefined or false)
        // so they can be detected as new additions in serializeOrderForKDS
        //
        // Original logic marked ALL lines as isPersisted=true if order.isPersisted=true
        // This broke reopened order detection - new items were marked as persisted!
        //
        // NEW LOGIC: Only mark line as persisted if it ALREADY has isPersisted=true
        // This preserves the line's original persistence state
        if (enriched.isPersisted === true) {
          return { ...enriched, isPersisted: true };
        }
        // ✅ NEW: Keep lines with isPersisted=false or undefined as-is (unpersisted)
        return enriched;
      });
    }
    if (next.paymentsLocked === undefined) {
      next.paymentsLocked = isPaymentsLocked(next);
    }
    return syncOrderVersionMetadata(next);
  }

  function isPaymentsLocked(order) {
    if (!order || typeof order !== 'object') return false;
    if (order.paymentsLocked === true) return true;
    const status = String(order.status || '').toLowerCase();
    const stage = String(order.fulfillmentStage || '').toLowerCase();
    return status === 'finalized' || status === 'closed' || stage === 'delivered' || stage === 'closed';
  }

  function normalizeNote(raw, fallbackAuthor) {
    if (!raw) return null;
    const message = raw.message || raw.text || '';
    if (!message) return null;
    const createdAt = toMillis(raw.created_at || raw.createdAt);
    return {
      id: raw.id || `note-${Math.random().toString(16).slice(2, 8)}`,
      message,
      authorId: raw.author_id || raw.authorId || fallbackAuthor || 'system',
      authorName: raw.author_name || raw.authorName || '',
      createdAt
    };
  }

  function normalizeOrderLine(raw, context) {
    if (!raw) return null;
    const metadata = ensurePlainObject(raw.metadata || raw.meta);
    const rawItemId = raw.item_id || raw.itemId || metadata.itemId || metadata.item_id || metadata.menuItemId || metadata.productId || metadata.itemCode;
    if (rawItemId == null) {
      //console.warn('[POS] Skipping line without item id', raw);
      return null;
    }
    const itemId = String(rawItemId);

    // 🔍 DEBUG: Log itemId extraction
    // //console.log('[POS][normalizeOrderLine] itemId extracted:', {
    //   rawItemId,
    //   itemId,
    //   rawItemIdType: typeof rawItemId,
    //   itemIdType: typeof itemId
    // });

    const menuItem = menuIndex?.get(String(itemId));
    const qty = Math.max(1, Number(raw.qty) || 1);
    const basePrice = raw.base_price != null ? Number(raw.base_price)
      : raw.basePrice != null ? Number(raw.basePrice)
        : raw.price != null ? Number(raw.price)
          : menuItem?.price || 0;
    const price = raw.price != null ? Number(raw.price) : basePrice;
    const total = raw.total != null ? Number(raw.total) : round(price * qty);
    const stageId = raw.stage_id || raw.stageId || context.stageId || 'new';
    const statusId = raw.status_id || raw.statusId || 'draft';
    const notes = Array.isArray(raw.notes) ? raw.notes.map(note => normalizeNote(note, context.actorId)).filter(Boolean) : [];
    const discount = normalizeDiscount(raw.discount);
    const kitchenSectionSource = (
      raw.kitchen_section_id
      || raw.kitchenSectionId
      || metadata.kitchenSectionId
      || metadata.sectionId
      || metadata.stationId
      || menuItem?.kitchenSection
      || context.kitchenSection
      || 'expo'
    );
    const kitchenSection = kitchenSectionSource != null && kitchenSectionSource !== ''
      ? String(kitchenSectionSource)
      : 'expo';
    const baseLine = {
      id: raw.id || `ln-${context.orderId}-${itemId || Math.random().toString(16).slice(2, 8)}`,
      itemId,
      item_id: itemId,  // snake_case
      Item_Id: itemId,  // PascalCase for schema!
      name: menuItem ? menuItem.name : cloneName(raw.name),
      description: menuItem ? menuItem.description : cloneName(raw.description),
      qty,
      price: round(price),
      basePrice: round(basePrice),
      total: round(total),
      status: statusId,
      stage: stageId,
      kitchenSection,
      kitchenSectionId: kitchenSection,  // ✅ camelCase
      kitchen_section_id: kitchenSection,  // ✅ snake_case for schema
      locked: raw.locked !== undefined ? !!raw.locked : (orderStageMap.get(stageId)?.lockLineEdits ?? true),
      notes,
      discount,
      createdAt: toMillis(raw.created_at || raw.createdAt, context.createdAt),
      updatedAt: toMillis(raw.updated_at || raw.updatedAt, context.updatedAt)
    };
    const modifiersSource = Array.isArray(raw.modifiers)
      ? raw.modifiers
      : Array.isArray(metadata.modifiers)
        ? metadata.modifiers
        : [];
    if (modifiersSource.length) {
      baseLine.modifiers = modifiersSource.map(entry => ({
        ...entry,
        priceChange: round(Number(entry.priceChange ?? entry.price_change ?? entry.amount ?? 0) || 0)
      }));
    } else {
      baseLine.modifiers = [];
    }
    const priced = applyLinePricing(baseLine);
    if (raw.total != null && Number.isFinite(Number(raw.total))) {
      priced.total = round(raw.total);
    }
    return priced;
  }

  function aggregateLineReturns(order) {
    const totals = new Map();
    const returns = Array.isArray(order?.returns) ? order.returns : [];
    returns.forEach(entry => {
      if (!entry) return;
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      lines.forEach(line => {
        const lineId = line.lineId || line.id;
        if (!lineId) return;
        const qty = Number(line.quantity ?? line.qty ?? 0) || 0;
        if (qty <= 0) return;
        totals.set(lineId, (totals.get(lineId) || 0) + qty);
      });
    });
    return totals;
  }

  function calculateReturnOptions(order) {
    const lines = Array.isArray(order?.lines) ? order.lines : [];
    const totals = aggregateLineReturns(order);
    return lines
      .map(line => {
        const returned = totals.get(line.id) || 0;
        const maxQty = Math.max(0, round((Number(line.qty) || 0) - returned));
        return { line, remaining: maxQty, returned };
      })
      .filter(entry => entry.remaining > 0);
  }

  function normalizeMockOrder(raw) {
    if (!raw) return null;
    const header = raw.header || {};
    const id = raw.id || header.id || `ORD-${Date.now()}`;
    const createdAt = toMillis(header.created_at || raw.createdAt);
    const updatedAt = toMillis(header.updated_at || raw.updatedAt, createdAt);
    const typeId = header.type_id || header.typeId || raw.type || 'dine_in';
    const stageId = header.stage_id || header.stageId || raw.fulfillmentStage || 'new';
    const statusId = header.status_id || header.statusId || raw.status || 'open';
    const paymentStateId = header.payment_state_id || header.paymentStateId || raw.payment_state || 'unpaid';
    // ✅ CRITICAL FIX: Read tableIds with proper fallbacks
    // Priority: raw.tableIds > raw.table_ids > header.table_ids > header.tableIds > [tableId] > []
    const tableIds = Array.isArray(raw.tableIds) && raw.tableIds.length > 0
      ? raw.tableIds.slice()
      : Array.isArray(raw.table_ids) && raw.table_ids.length > 0
        ? raw.table_ids.slice()
        : Array.isArray(header.table_ids) && header.table_ids.length > 0
          ? header.table_ids.slice()
          : Array.isArray(header.tableIds) && header.tableIds.length > 0
            ? header.tableIds.slice()
            : (raw.tableId || raw.table_id || header.tableId || header.table_id)
              ? [raw.tableId || raw.table_id || header.tableId || header.table_id]
              : [];
    const guests = header.guests || raw.guests || 0;
    const allowAdditions = header.allow_line_additions !== undefined ? !!header.allow_line_additions : (ORDER_TYPES.find(t => t.id === typeId)?.allowsLineAdditions ?? (typeId === 'dine_in'));
    const lockLineEdits = header.locked_line_edits !== undefined ? !!header.locked_line_edits : (orderStageMap.get(stageId)?.lockLineEdits ?? true);
    const lineContext = { orderId: id, stageId, createdAt, updatedAt };
    const lines = Array.isArray(raw.lines) ? raw.lines.map(line => normalizeOrderLine(line, lineContext)).filter(Boolean) : [];
    const discount = normalizeDiscount(raw.discount || header.discount);
    const totals = header.totals || raw.totals || calculateTotals(lines, settings, typeId, { orderDiscount: discount });
    const notes = Array.isArray(raw.notes) ? raw.notes.map(note => normalizeNote(note, raw.author_id || header.author_id)).filter(Boolean) : [];
    const payments = Array.isArray(raw.payments)
      ? raw.payments.map(entry => ({
        id: entry.id || `pm-${Math.random().toString(36).slice(2, 8)}`,
        method: entry.method || entry.method_id || entry.methodId || entry.type || 'cash',
        amount: round(Number(entry.amount) || 0)
      }))
      : [];
    const returns = Array.isArray(raw.returns)
      ? raw.returns.map(ret => ({
        id: ret.id || `ret-${id}-${Math.random().toString(16).slice(2, 8)}`,
        orderId: id,
        shiftId: ret.shiftId || ret.shift_id || header.shift_id || header.shiftId || null,
        createdAt: toMillis(ret.createdAt || ret.created_at || updatedAt, updatedAt),
        total: round(Number(ret.total) || 0),
        lines: Array.isArray(ret.lines) ? ret.lines.map(line => ({
          lineId: line.lineId || line.id,
          quantity: Number(line.quantity ?? line.qty ?? 0) || 0,
          unitPrice: Number(line.unitPrice ?? line.unit_price ?? 0) || 0
        })) : []
      }))
      : [];
    const events = Array.isArray(raw.events) ? raw.events.map(evt => ({
      id: evt.id || `${id}::evt::${toMillis(evt.at)}`,
      stage: evt.stage_id || evt.stageId || stageId,
      status: evt.status_id || evt.statusId || statusId,
      at: toMillis(evt.at, createdAt),
      actorId: evt.actor_id || evt.actorId || 'system'
    })) : [];
    const normalizedTotals = totals && typeof totals === 'object'
      ? totals
      : calculateTotals(lines, settings, typeId, { orderDiscount: discount });
    const versionValue = Number(raw.version ?? header.version ?? raw.header?.version ?? header.metadata?.version);
    const orderResult = {
      id,
      status: statusId,
      fulfillmentStage: stageId,
      paymentState: paymentStateId,
      type: typeId,
      tableIds,
      guests,
      totals: normalizedTotals,
      lines,
      notes,
      discount,
      payments,
      returns,
      events,
      createdAt,
      updatedAt,
      savedAt: updatedAt,
      isPersisted: true,
      dirty: false,
      allowAdditions,
      lockLineEdits,
      origin: 'seed',
      shiftId: raw.shift_id || header.shift_id || raw.shiftId || null,
      customerId: raw.customer_id || raw.customerId || header.customer_id || header.customerId || null,
      customerAddressId: raw.address_id || raw.addressId || header.address_id || header.addressId || null,
      customerName: raw.customer_name || raw.customerName || header.customer_name || header.customerName || '',
      customerPhone: raw.customer_phone || raw.customerPhone || header.customer_phone || header.customerPhone || '',
      customerAddress: raw.customer_address || raw.customerAddress || header.customer_address || header.customerAddress || '',
      customerAreaId: raw.customer_area_id || raw.customerAreaId || header.customer_area_id || header.customerAreaId || null,
      posId: raw.pos_id || header.pos_id || raw.posId || POS_INFO.id,
      posLabel: raw.pos_label || header.pos_label || raw.posLabel || POS_INFO.label,
      posNumber: (() => {
        const rawNumber = raw.pos_number ?? header.pos_number ?? raw.posNumber;
        return Number.isFinite(Number(rawNumber)) ? Number(rawNumber) : POS_INFO.number;
      })()
    };
    if (Number.isFinite(versionValue) && versionValue > 0) {
      orderResult.version = Math.trunc(versionValue);
      orderResult.currentVersion = Math.trunc(versionValue);
      orderResult.expectedVersion = Math.trunc(versionValue);
    }
    return enrichOrderWithMenu(orderResult);
  }

  function normalizeMockShift(raw) {
    if (!raw) return null;
    const id = raw.id || `SHIFT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const openedAt = toMillis(raw.opened_at || raw.openedAt);
    const closedAt = toMillis(raw.closed_at || raw.closedAt);
    const openingFloat = Number(raw.opening_float ?? raw.openingFloat ?? 0);
    const closingCashRaw = Number(raw.closing_cash ?? raw.closingCash ?? 0);
    const totals = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
    const payments = raw.payments && typeof raw.payments === 'object' ? raw.payments : {};
    const posId = raw.pos_id || raw.posId || POS_INFO.id;
    const posLabel = raw.pos_label || raw.posLabel || POS_INFO.label;
    const posNumberRaw = raw.pos_number ?? raw.posNumber;
    const posNumber = Number.isFinite(Number(posNumberRaw)) ? Number(posNumberRaw) : POS_INFO.number;
    const totalsByType = {
      dine_in: round(Number(totals.dine_in) || 0),
      takeaway: round(Number(totals.takeaway) || 0),
      delivery: round(Number(totals.delivery) || 0)
    };
    const paymentsByMethod = PAYMENT_METHODS.reduce((acc, method) => {
      const lookupKeys = [
        method.id,
        method.code,
        typeof method.name === 'string' ? method.name : null,
        typeof method.name?.en === 'string' ? method.name.en : null,
        typeof method.name?.ar === 'string' ? method.name.ar : null,
        typeof method.label === 'string' ? method.label : null,
        typeof method.label?.en === 'string' ? method.label.en : null,
        typeof method.label?.ar === 'string' ? method.label.ar : null
      ].filter(Boolean);
      let value = 0;
      for (const key of lookupKeys) {
        if (key != null && Object.prototype.hasOwnProperty.call(payments, key)) {
          value = payments[key];
          break;
        }
      }
      acc[method.id] = round(Number(value) || 0);
      return acc;
    }, {});
    Object.keys(payments).forEach(key => {
      if (!(key in paymentsByMethod)) {
        paymentsByMethod[key] = round(Number(payments[key]) || 0);
      }
    });
    const totalSales = round((totalsByType.dine_in || 0) + (totalsByType.takeaway || 0) + (totalsByType.delivery || 0));
    return {
      id,
      openedAt,
      closedAt,
      openingFloat: round(openingFloat),
      closingCash: closingCashRaw ? round(closingCashRaw) : null,
      totalsByType,
      paymentsByMethod,
      totalSales,
      orders: Array.isArray(raw.orders) ? raw.orders.slice() : [],
      cashierId: raw.cashier_id || raw.cashierId || '',
      cashierName: raw.cashier_name || raw.cashierName || '',
      status: closedAt ? 'closed' : 'open',
      posId,
      posLabel,
      posNumber,
      isClosed: !!closedAt
    };
  }

  function getDistrictLabel(id, lang) {
    const district = CAIRO_DISTRICTS.find(area => area.id === id);
    if (!district) return id || '';
    return lang === 'ar' ? district.ar : district.en;
  }

  function createEmptyCustomerForm() {
    return {
      id: null,
      name: '',
      phones: [''],
      addresses: [{ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' }]
    };
  }

  function createInitialCustomers() {
    const now = Date.now().toString(36).toUpperCase();
    return [
      {
        id: `CUST-${now}-A`,
        name: 'أحمد خالد',
        phones: ['01000011223', '01234567890'],
        addresses: [
          { id: `ADDR-${now}-1`, title: 'المنزل', areaId: 'nasr_city', line: 'عمارات الشركة، شارع الطيران، مدينة نصر', notes: '' },
          { id: `ADDR-${now}-2`, title: 'العمل', areaId: 'heliopolis', line: 'شارع عمر بن الخطاب، هليوبوليس', notes: 'التسليم عند البوابة' }
        ]
      },
      {
        id: `CUST-${now}-B`,
        name: 'سارة مصطفى',
        phones: ['01055667788'],
        addresses: [
          { id: `ADDR-${now}-3`, title: 'المنزل', areaId: 'maadi', line: 'شارع 9، المعادي الجديدة', notes: 'الطابق الثالث' }
        ]
      },
      {
        id: `CUST-${now}-C`,
        name: 'Mohamed Adel',
        phones: ['01122334455'],
        addresses: [
          { id: `ADDR-${now}-4`, title: 'Home', areaId: 'fifth_settlement', line: 'بيت الوطن، التجمع الخامس', notes: '' }
        ]
      }
    ];
  }

  function findCustomer(customers, id) {
    if (!id) return null;
    return (Array.isArray(customers) ? customers : []).find(customer => customer.id === id) || null;
  }

  function findCustomerAddress(customer, id) {
    if (!customer || !id) return null;
    return (Array.isArray(customer.addresses) ? customer.addresses : []).find(address => address.id === id) || null;
  }

  const seedOrders = Array.isArray(MOCK.orders) ? MOCK.orders.map(normalizeMockOrder).filter(Boolean) : [];
  const rawShifts = Array.isArray(MOCK.shifts) ? MOCK.shifts.map(normalizeMockShift).filter(Boolean) : [];
  const SHIFT_HISTORY_SEED = rawShifts.filter(shift => shift.closedAt || shift.status === 'closed');
  const ordersHistorySeed = seedOrders.map((order, idx) => ({
    ...order,
    seq: idx + 1,
    dirty: false,
    lines: Array.isArray(order.lines) ? order.lines.map(line => ({ ...line })) : [],
    payments: Array.isArray(order.payments) ? order.payments.map(pay => ({ ...pay })) : []
  }));
  const baseTables = Array.isArray(MOCK.tables) ? MOCK.tables : [];
  const tables = baseTables.map((tbl, idx) => ({
    id: tbl.id || `T${idx + 1}`,
    name: tbl.name || `طاولة ${idx + 1}`,
    capacity: tbl.seats || tbl.capacity || 4,
    zone: tbl.zone || '',
    displayOrder: typeof tbl.displayOrder === 'number' ? tbl.displayOrder : idx + 1,
    state: tbl.state || (tbl.status === 'inactive' ? 'disactive' : tbl.status === 'maintenance' ? 'maintenance' : 'active'),
    note: tbl.note || tbl.notes || ''
  }));
  while (tables.length < 20) {
    const nextIndex = tables.length + 1;
    tables.push({
      id: `T${nextIndex}`,
      name: `طاولة ${nextIndex}`,
      capacity: 4,
      zone: '',
      displayOrder: nextIndex,
      state: 'active',
      note: ''
    });
  }
  tables.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const tableLocks = Array.isArray(MOCK.tableLocks) ? MOCK.tableLocks.map(lock => ({
    id: lock.id || `lock-${Math.random().toString(36).slice(2, 8)}`,
    tableId: lock.tableId,
    orderId: lock.orderId || null,
    reservationId: lock.reservationId || null,
    lockedBy: lock.lockedBy || 'system',
    lockedAt: lock.lockedAt ? new Date(lock.lockedAt).getTime() : Date.now(),
    source: lock.source || 'pos',
    active: lock.active !== false
  })) : [];

  const ordersQueue = seedOrders.slice();

  const reservations = Array.isArray(MOCK.reservations) ? MOCK.reservations.map(res => ({
    id: res.id || `res-${Math.random().toString(36).slice(2, 6)}`,
    customerName: res.customerName || '',
    phone: res.phone || '',
    partySize: res.partySize || 2,
    scheduledAt: res.scheduledAt ? new Date(res.scheduledAt).getTime() : Date.now(),
    holdUntil: res.holdUntil ? new Date(res.holdUntil).getTime() : null,
    tableIds: Array.isArray(res.tableIds) ? res.tableIds.slice() : [],
    status: res.status || 'booked',
    note: res.note || '',
    createdAt: res.createdAt ? new Date(res.createdAt).getTime() : Date.now()
  })) : [];

  const auditTrail = Array.isArray(MOCK.auditEvents) ? MOCK.auditEvents.map(evt => ({
    id: evt.id || `audit-${Math.random().toString(36).slice(2, 8)}`,
    userId: evt.userId || 'system',
    action: evt.action || 'unknown',
    refType: evt.refType || 'table',
    refId: evt.refId || '',
    at: evt.at ? new Date(evt.at).getTime() : Date.now(),
    meta: evt.meta || {}
  })) : [];
  const rawEmployees = resolveEmployeeList(MOCK);
  const employees = normalizeEmployeesList(rawEmployees);
  if (SHIFT_PIN_FALLBACK && !employees.some(emp => emp.pin === SHIFT_PIN_FALLBACK)) {
    employees.push({
      id: 'cashier-default',
      name: 'Cashier',
      role: 'cashier',
      pin: SHIFT_PIN_FALLBACK,
      allowedDiscountRate: 0,
      isFallback: true
    });
  }
  const maxEmployeePinLength = employees.reduce((max, emp) => Math.max(max, emp.pin.length), 0);
  if (maxEmployeePinLength) SHIFT_PIN_LENGTH = Math.max(SHIFT_PIN_LENGTH, maxEmployeePinLength);
  const defaultCashier = employees.find(emp => emp.role === 'cashier') || employees[0] || {
    id: 'cashier-guest',
    name: 'أحمد محمود',
    role: 'cashier',
    pin: normalizePinValue(SHIFT_PIN_FALLBACK || '0000'),
    allowedDiscountRate: 0
  };
  const cashier = defaultCashier;

  if (typeof window !== 'undefined' && window.console) {
    console.group('[Mishkah][POS] 🚀 INITIAL DATA LOAD - COMPLETE STRUCTURE');
    // //console.log('═══════════════════════════════════════════════════════════');
    //console.log('📦 MOCK DATA SOURCE (window.database):');
    //console.log('  • Complete MOCK object:', MOCK);
    //console.log('  • Keys in MOCK:', Object.keys(MOCK));
    // //console.log('═══════════════════════════════════════════════════════════');
    //console.log('👥 EMPLOYEES DATA:');
    //console.log('  • rawEmployees (from resolveEmployeeList):', rawEmployees);
    //console.log('  • employees (normalized):', employees);
    //console.log('  • defaultCashier:', defaultCashier);
    //console.log('  • cashier (final):', cashier);
    console.table(employees.map(emp => ({ id: emp.id, name: emp.name, role: emp.role, pin: emp.pin, fallback: emp.isFallback || false })));
    // //console.log('═══════════════════════════════════════════════════════════');
    //console.log('🔑 SHIFT SETTINGS:');
    //console.log('  • SHIFT_SETTINGS:', SHIFT_SETTINGS);
    //console.log('  • SHIFT_PIN_FALLBACK:', SHIFT_PIN_FALLBACK);
    //console.log('  • SHIFT_PIN_LENGTH:', SHIFT_PIN_LENGTH);
    // //console.log('═══════════════════════════════════════════════════════════');
    console.groupEnd();
  }

  function createDraftOrderId() {
    return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function generateOrderId() {
    return createDraftOrderId();
  }

  const initialTotals = calculateTotals([], settings, 'dine_in', {});
  let tempOrderDraft = null;
  if (posDB.available) {
    try {
      const tempOrders = await posDB.listTempOrders();
      if (Array.isArray(tempOrders) && tempOrders.length) {
        tempOrders.sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0));
        tempOrderDraft = tempOrders[0];
      }
    } catch (error) {
      //console.warn('[Mishkah][POS] temp order load failed', error);
    }
  }
  const baseOrderType = tempOrderDraft?.type || 'dine_in';
  const initialOrderId = tempOrderDraft?.id || await generateOrderId();
  const initialOrderLines = tempOrderDraft ? cloneDeep(tempOrderDraft.lines || []) : [];
  const initialOrderNotes = tempOrderDraft ? cloneDeep(tempOrderDraft.notes || []) : [];
  const initialOrderPayments = tempOrderDraft ? cloneDeep(tempOrderDraft.payments || []) : [];
  const initialOrderTables = tempOrderDraft && Array.isArray(tempOrderDraft.tableIds)
    ? tempOrderDraft.tableIds.slice()
    : [];
  const initialOrderDiscount = normalizeDiscount(tempOrderDraft?.discount);
  const draftTotalsSource = tempOrderDraft && tempOrderDraft.totals && typeof tempOrderDraft.totals === 'object'
    ? { ...tempOrderDraft.totals }
    : (tempOrderDraft
      ? calculateTotals(initialOrderLines, settings, baseOrderType, { orderDiscount: initialOrderDiscount })
      : initialTotals);
  const draftPaymentSnapshot = summarizePayments(draftTotalsSource, initialOrderPayments);
  let activeShift = null;
  let shiftHistoryFromDb = SHIFT_HISTORY_SEED.slice();
  if (posDB.available) {
    try {
      activeShift = await posDB.getActiveShift(POS_INFO.id);
      if (activeShift) {
        const seededHistory = ordersHistorySeed || [];
        const summary = summarizeShiftOrders(seededHistory, activeShift);
        activeShift = {
          ...activeShift,
          totalsByType: summary.totalsByType,
          paymentsByMethod: summary.paymentsByMethod,
          totalSales: summary.totalSales,
          countsByType: summary.countsByType,
          ordersCount: summary.ordersCount
        };
      }
      const listed = await posDB.listShifts({ posId: POS_INFO.id, limit: 50 });
      shiftHistoryFromDb = Array.isArray(listed) && listed.length
        ? listed.filter(shift => !activeShift || shift.id !== activeShift.id)
        : shiftHistoryFromDb;
    } catch (error) {
      //console.warn('[Mishkah][POS] shift hydration failed', error);
    }
  }

  const initialKdsSnapshot = cloneKdsDerived();
  const initialTheme = 'dark';

  const posState = {
    head: { title: ' نقطة بيع حية' },
    env: { theme: initialTheme, lang: 'ar', dir: 'rtl' },
    data: {
      settings,
      remotes: { posDatabase: initialRemoteSnapshot },
      themePrefs: savedThemePrefs,
      currency: { code: currencyCode, symbols: currencySymbols, display: currencyDisplayMode },
      pos: POS_INFO,
      user: {
        id: cashier.id || 'cashier-guest',
        name: cashier.name || cashier.full_name || 'أحمد محمود',
        role: cashier.role || 'cashier',
        allowedDiscountRate: typeof cashier.allowedDiscountRate === 'number' ? cashier.allowedDiscountRate : 0,
        shift: activeShift?.id || '—',
        shiftNo: activeShift ? activeShift.id : '#103'
      },
      status: {
        indexeddb: { state: posDB.available ? 'idle' : 'offline', lastSync: null },
        kds: { state: 'idle', endpoint: DEFAULT_KDS_ENDPOINT }
      },
      schema: {
        name: POS_SCHEMA_SOURCE?.name || 'mishkah_pos',
        version: POS_SCHEMA_SOURCE?.version || 1,
        tables: Array.isArray(POS_SCHEMA_SOURCE?.tables) ? POS_SCHEMA_SOURCE.tables : []
      },
      employees,
      menu: {
        search: '',
        category: 'all',
        showFavoritesOnly: false,
        favorites: [],
        categories,
        items: menuItems
      },
      order: {
        id: initialOrderId,
        status: tempOrderDraft?.status || 'open',
        fulfillmentStage: tempOrderDraft?.fulfillmentStage || tempOrderDraft?.stage || 'new',
        paymentState: draftPaymentSnapshot.state || 'unpaid',
        type: baseOrderType,
        tableIds: initialOrderTables,
        guests: Number.isFinite(tempOrderDraft?.guests)
          ? Number(tempOrderDraft.guests)
          : (baseOrderType === 'dine_in' ? 0 : (tempOrderDraft?.guests || 0)),
        lines: initialOrderLines,
        notes: initialOrderNotes,
        discount: initialOrderDiscount,
        totals: draftTotalsSource,
        createdAt: tempOrderDraft?.createdAt || Date.now(),
        updatedAt: tempOrderDraft?.updatedAt || Date.now(),
        allowAdditions: tempOrderDraft?.allowAdditions !== undefined ? !!tempOrderDraft.allowAdditions : true,
        lockLineEdits: tempOrderDraft?.lockLineEdits !== undefined ? !!tempOrderDraft.lockLineEdits : false,
        isPersisted: false,
        origin: tempOrderDraft?.origin || 'pos',
        shiftId: tempOrderDraft?.shiftId || activeShift?.id || null,
        posId: tempOrderDraft?.posId || POS_INFO.id,
        posLabel: tempOrderDraft?.posLabel || POS_INFO.label,
        posNumber: Number.isFinite(Number(tempOrderDraft?.posNumber)) ? Number(tempOrderDraft.posNumber) : POS_INFO.number,
        payments: initialOrderPayments,
        customerId: tempOrderDraft?.customerId || null,
        customerAddressId: tempOrderDraft?.customerAddressId || null,
        customerName: tempOrderDraft?.customerName || '',
        customerPhone: tempOrderDraft?.customerPhone || '',
        customerAddress: tempOrderDraft?.customerAddress || '',
        customerAreaId: tempOrderDraft?.customerAreaId || null,
        dirty: tempOrderDraft ? tempOrderDraft.dirty !== false : false
      },
      orderStages,
      orderStatuses,
      orderPaymentStates,
      orderLineStatuses,
      kitchenSections,
      categorySections,
      tables,
      tableLocks,
      reservations,
      kds: {
        channel: initialKdsSnapshot.channel || BRANCH_CHANNEL,
        stations: Array.isArray(initialKdsSnapshot.stations) ? initialKdsSnapshot.stations : [],
        stationCategoryRoutes: Array.isArray(initialKdsSnapshot.stationCategoryRoutes)
          ? initialKdsSnapshot.stationCategoryRoutes
          : [],
        jobOrders: normalizeJobOrdersSnapshot(initialKdsSnapshot.jobOrders),
        deliveries: {
          assignments: { ...(initialKdsSnapshot.deliveries?.assignments || {}) },
          settlements: { ...(initialKdsSnapshot.deliveries?.settlements || {}) }
        },
        handoff: { ...(initialKdsSnapshot.handoff || {}) },
        drivers: Array.isArray(initialKdsSnapshot.drivers) ? initialKdsSnapshot.drivers : [],
        metadata: { ...(initialKdsSnapshot.metadata || {}) },
        sync: { ...(initialKdsSnapshot.sync || {}), channel: initialKdsSnapshot.channel || BRANCH_CHANNEL }
      },
      ordersQueue,
      auditTrail,
      payments: {
        methods: clonePaymentMethods(PAYMENT_METHODS),
        activeMethod: (initialOrderPayments.length
          ? (initialOrderPayments[initialOrderPayments.length - 1]?.method || initialOrderPayments[0]?.method)
          : (PAYMENT_METHODS[0] && PAYMENT_METHODS[0].id)) || 'cash',
        split: initialOrderPayments
      },
      customers: createInitialCustomers(),
      customerAreas: CAIRO_DISTRICTS,
      modifiers: modifiersCatalog,
      print: {
        size: 'thermal_80',
        docType: 'customer',
        availablePrinters: [
          { id: 'Thermal-80', label: 'Thermal 80mm' },
          { id: 'Kitchen-A5', label: 'Kitchen A5' },
          { id: 'Front-A4', label: 'Front Office A4' }
        ],
        profiles: {
          customer: {
            size: 'thermal_80',
            defaultPrinter: 'Thermal-80',
            insidePrinter: 'Thermal-80',
            outsidePrinter: 'Front-A4',
            autoSend: true,
            preview: false,
            duplicateInside: false,
            duplicateOutside: true,
            copies: 1
          },
          kitchen: {
            size: 'a5',
            defaultPrinter: 'Kitchen-A5',
            insidePrinter: 'Kitchen-A5',
            outsidePrinter: '',
            autoSend: false,
            preview: true,
            duplicateInside: true,
            duplicateOutside: false,
            copies: 1
          }
        }
      },
      reports: { salesToday: 0, ordersCount: 0, avgTicket: 0, topItemId: null },
      ordersHistory: ordersHistorySeed,
      shift: {
        current: activeShift,
        history: shiftHistoryFromDb,
        config: { pinLength: SHIFT_PIN_LENGTH, openingFloat: SHIFT_OPEN_FLOAT_DEFAULT }
      },
      returnSequence: 0
    },
    ui: {
      modals: { tables: false, payments: false, print: false, reservations: false, orders: false, modifiers: false, jobStatus: false, lineDiscount: false, returns: false },
      modalSizes: savedModalSizes,
      drawers: {},
      settings: { open: false, activeTheme: initialTheme },
      paymentDraft: { amount: '' },
      tables: { view: 'assign', filter: 'all', search: '', details: null },
      reservations: { filter: 'today', status: 'all', editing: null, form: null },
      print: { docType: 'customer', size: 'thermal_80', showPreview: false, showAdvanced: false, managePrinters: false, newPrinterName: '' },
      orders: { tab: 'all', search: '', sort: { field: 'updatedAt', direction: 'desc' } },
      shift: { showPin: false, pin: '', openingFloat: SHIFT_OPEN_FLOAT_DEFAULT, showSummary: false, viewShiftId: null, activeTab: 'summary' },
      customer: { open: false, mode: 'search', search: '', keypad: '', selectedCustomerId: null, selectedAddressId: null, form: createEmptyCustomerForm() },
      orderNav: { showPad: false, value: '' },
      lineModifiers: { lineId: null, addOns: [], removals: [] },
      lineDiscount: null,
      returnsDraft: null,
      pendingAction: null,
      jobStatus: null
    }
  };

  if (typeof window !== 'undefined' && window.console) {
    const debugEmployees = Array.isArray(posState.data?.employees)
      ? posState.data.employees.map(emp => ({ id: emp.id, name: emp.name, role: emp.role, pin: emp.pin, fallback: !!emp.isFallback }))
      : [];
    console.groupCollapsed('[Mishkah][POS] bootstrap snapshot');
    //console.log('Shift state', posState.data?.shift || {});
    if (debugEmployees.length) {
      console.table(debugEmployees);
    } else {
      //console.log('No employees available on bootstrap');
    }
    console.groupEnd();
  }

  // Defer installing watchers until after schema fetch attempt
  fetchPosSchemaFromBackend().finally(() => {
    // ✅ [POS V2] Ensure stores are set from window.__POS_DB__ before installing watchers
    if (window.__POS_DB__ && typeof window.__POS_DB__.watch === 'function') {
      realtimeOrders.store = window.__POS_DB__;
      realtimeJobOrders.store = window.__POS_DB__;
      realtimeTables.store = window.__POS_DB__;
      //console.log('✅ [POS V2] Set realtimeOrders.store, realtimeJobOrders.store, and realtimeTables.store from window.__POS_DB__');
    } else {
      //console.warn('⚠️ [POS V2] window.__POS_DB__ not available or missing watch function');
    }

    installRealtimeOrderWatchers();
    installRealtimeJobOrderWatchers();
    installRealtimeTableWatchers();
  });

  function flushRemoteUpdate() {
    if (!pendingRemoteResult) return;
    const { derived, remote } = pendingRemoteResult;
    const nextData = assignRemoteData(posState.data, derived, remote);
    posState.data = nextData;
    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState(prev => ({
        ...prev,
        data: assignRemoteData(prev.data, derived, remote)
      }));
    }
    pendingRemoteResult = null;
  }

  async function refreshPersistentSnapshot(options = {}) {
    const { focusCurrent = false, syncOrders = true } = options;
    try {
      const snapshot = getRealtimeOrdersSnapshot();
      const historyOrders = snapshot.history.map((order, idx) => ({
        ...order,
        dirty: false,
        seq: order.seq || idx + 1,
        payments: Array.isArray(order.payments) ? order.payments.map(payment => ({ ...payment })) : [],
        lines: Array.isArray(order.lines) ? order.lines.map(line => ({ ...line })) : []
      }));
      const summarySource = historyOrders;
      let activeShiftRaw = null;
      let shiftListRaw = [];
      if (posDB.available) {
        const result = await Promise.allSettled([
          posDB.getActiveShift(POS_INFO.id),
          posDB.listShifts({ posId: POS_INFO.id, limit: 100 })
        ]);
        activeShiftRaw = result[0]?.status === 'fulfilled' ? result[0].value : null;
        shiftListRaw = result[1]?.status === 'fulfilled' ? (result[1].value || []) : [];
      }
      let currentShift = null;
      if (activeShiftRaw) {
        const sanitizedActive = SHIFT_TABLE.createRecord({
          ...activeShiftRaw,
          totalsByType: activeShiftRaw.totalsByType || {},
          paymentsByMethod: activeShiftRaw.paymentsByMethod || {},
          countsByType: activeShiftRaw.countsByType || {},
          orders: Array.isArray(activeShiftRaw.orders) ? activeShiftRaw.orders : []
        });
        const activeSummary = summarizeShiftOrders(summarySource, sanitizedActive);
        currentShift = {
          ...sanitizedActive,
          totalsByType: activeSummary.totalsByType,
          paymentsByMethod: activeSummary.paymentsByMethod,
          totalSales: activeSummary.totalSales,
          orders: activeSummary.orders,
          ordersCount: activeSummary.ordersCount,
          countsByType: activeSummary.countsByType,
          payments: activeSummary.payments,
          refunds: activeSummary.refunds,
          returns: activeSummary.returns
        };
      }
      const history = Array.isArray(shiftListRaw) ? shiftListRaw
        .filter(item => !currentShift || item.id !== currentShift.id)
        .map(entry => {
          const sanitized = SHIFT_TABLE.createRecord({
            ...entry,
            totalsByType: entry.totalsByType || {},
            paymentsByMethod: entry.paymentsByMethod || {},
            countsByType: entry.countsByType || {},
            orders: Array.isArray(entry.orders) ? entry.orders : []
          });
          const summary = summarizeShiftOrders(summarySource, sanitized);
          return {
            ...sanitized,
            totalsByType: summary.totalsByType,
            paymentsByMethod: summary.paymentsByMethod,
            totalSales: summary.totalSales,
            orders: summary.orders,
            ordersCount: summary.ordersCount,
            countsByType: summary.countsByType,
            payments: summary.payments,
            refunds: summary.refunds,
            returns: summary.returns
          };
        }) : [];
      const activeOrders = snapshot.active.map(order => ({ ...order }));
      const stateSource = appRef && typeof appRef.getState === 'function'
        ? appRef.getState()
        : posState;
      const previousData = stateSource?.data || {};
      const nextData = {
        ...previousData,
        shift: {
          ...(previousData.shift || {}),
          current: currentShift,
          history
        },
        user: {
          ...(previousData.user || {}),
          shift: currentShift?.id || '—',
          shiftNo: currentShift?.id || previousData.user?.shiftNo || '—'
        },
        order: {
          ...(previousData.order || {}),
          shiftId: currentShift?.id || null
        },
        status: {
          ...(previousData.status || {}),
          indexeddb: { state: posDB.available ? 'online' : 'offline', lastSync: Date.now() }
        }
      };
      if (syncOrders) {
        nextData.ordersQueue = activeOrders;
        nextData.ordersHistory = historyOrders;
        nextData.reports = computeRealtimeReports({ env: stateSource?.env || posState.env, data: nextData });
      }
      const nextUi = {
        ...(stateSource?.ui || {}),
        shift: {
          ...(stateSource?.ui?.shift || {}),
          viewShiftId: focusCurrent && currentShift ? currentShift.id : (stateSource?.ui?.shift?.viewShiftId || currentShift?.id || null)
        }
      };
      posState.data = nextData;
      posState.ui = nextUi;
      if (appRef && typeof appRef.setState === 'function') {
        appRef.setState(prev => ({
          ...prev,
          data: nextData,
          ui: nextUi
        }));
      }
      if (syncOrders) {
        applyRealtimeOrdersToState();
      }
      return { current: currentShift, history, orders: historyOrders };
    } catch (error) {
      //console.warn('[Mishkah][POS] refreshPersistentSnapshot failed', error);
      return null;
    }
  }

  function getOrderTypeConfig(type) {
    return ORDER_TYPES.find(o => o.id === type) || ORDER_TYPES[0];
  }

  function normalizeSaveMode(value, orderType) {
    const base = (value || '').toString().toLowerCase();
    // ✅ CRITICAL: No more "draft" - everything saves to server immediately!
    // "draft" was confusing and not needed - all saves go to backend
    switch (base) {
      case 'save-only':
      case 'draft':
      case 'save-draft':
      case 'save':
        return 'save';  // ✅ Changed from 'draft' to 'save'
      case 'finalize-print':
      case 'finish-print':
        return 'finalize-print';
      case 'finalize':
      case 'finish':
        return 'finalize';
      case 'save-print':
        return orderType === 'dine_in' ? 'save' : 'finalize-print';  // ✅ Changed from 'draft'
      default:
        return base || 'save';  // ✅ Changed from 'draft' to 'save'
    }
  }

  async function persistOrderFlow(ctx, rawMode, options = {}) {
    // //console.log('═══════════════════════════════════════════════════════');
    // //console.log('🔥 [CLAUDE FIX v3] persistOrderFlow STARTED');
    // //console.log('═══════════════════════════════════════════════════════');

    // ✅ NOTE: IS_SAVING_ORDER check is ONLY in button handler (Line 11037-11040)
    // We don't check here because:
    // 1. Button handler sets IS_SAVING_ORDER = true BEFORE calling this function
    // 2. Checking here would block even the first legitimate save attempt
    // 3. Retry calls (options.retryCount > 0) need to bypass the check anyway
    // The button handler's check is sufficient to prevent duplicate saves

    const state = ctx.getState();
    const t = getTexts(state);
    const retryCount = options.retryCount || 0;
    const MAX_RETRIES = 3;

    // Prevent infinite retry loop
    if (retryCount >= MAX_RETRIES) {
      console.error('[Mishkah][POS] persistOrderFlow: Max retries exceeded', { retryCount, maxRetries: MAX_RETRIES });
      UI.pushToast(ctx, {
        title: t.toast.order_save_failed || 'فشل حفظ الطلب',
        message: t.toast.max_retries_exceeded || 'تم تجاوز الحد الأقصى لعدد المحاولات',
        icon: '❌'
      });
      return { status: 'error', reason: 'max-retries-exceeded' };
    }

    if (!posDB.available) {
      UI.pushToast(ctx, { title: t.toast.indexeddb_missing, icon: '⚠️' });
      return { status: 'error', reason: 'indexeddb' };
    }
    const currentShift = state.data.shift?.current;
    if (!currentShift) {
      UI.pushToast(ctx, { title: t.toast.shift_required, icon: '🔒' });
      ctx.setState(s => ({
        ...s,
        ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showPin: true, pin: '' } }
      }));
      return { status: 'error', reason: 'shift' };
    }
    let order = state.data.order || {}; // ✅ Changed from const to let (to allow reassignment for INSERT-ONLY logic)

    // ✅ CRITICAL: منع حفظ أوردر منتهي (finalized) مرة أخرى
    // هذا يمنع المشكلة حيث Backend يقبل header جديد لكن يتجاهل lines موجودة
    const orderStatus = String(order.status || '').toLowerCase();
    const isFinalizedOrder = orderStatus === 'finalized' || orderStatus === 'closed';

    if (isFinalizedOrder && order.isPersisted) {
      console.error('❌ [POS V2] BLOCKED: Cannot save finalized order again!', {
        orderId: order.id,
        status: order.status,
        isPersisted: order.isPersisted
      });
      UI.pushToast(ctx, {
        title: t.toast.order_finalized || 'الطلب منتهي بالفعل',
        subtitle: 'لا يمكن حفظ طلب منتهي مرة أخرى',
        icon: '🔒'
      });
      return { status: 'error', reason: 'order-already-finalized' };
    }

    //console.log('[Mishkah][POS] persistOrderFlow START', {
    //  orderId: order.id,
    //  isPersisted: order.isPersisted,
    //  dirty: order.dirty,
    //  status: order.status,
    //  linesCount: order.lines?.length || 0,
    //  mode: rawMode,
    //  retryCount
    //});

    // ✅ CRITICAL: فحص يوجد سطر واحد على الأقل - هذا يمنع حفظ orders فارغة تماماً
    const lines = order.lines || [];
    const validLines = lines.filter(line => !line.cancelled && !line.voided);

    // //console.log('🔍 [POS V2] EMPTY ORDER CHECK:', {
    //   totalLines: lines.length,
    //   validLines: validLines.length,
    //   isPersisted: order.isPersisted,
    //   orderId: order.id
    // });

    if (!validLines.length) {
      console.error('❌ [POS V2] BLOCKED: Cannot save empty order - no valid lines!');
      UI.pushToast(ctx, {
        title: t.toast.empty_order || 'لا يمكن حفظ طلب فارغ',
        subtitle: 'يجب إضافة صنف واحد على الأقل',
        icon: '⚠️'
      });
      return { status: 'error', reason: 'empty-order' };
    }

    // ✅ فحص: هل يوجد تغييرات؟ (فقط للمسودات)
    if (order.isPersisted && !order.dirty && rawMode === 'draft') {
      //console.log('[POS] No changes detected, skipping save');
      UI.pushToast(ctx, {
        title: t.toast.no_changes || 'لا توجد تغييرات للحفظ',
        icon: 'ℹ️'
      });
      return { status: 'no-changes' };
    }

    const previousOrderId = order.id;
    const orderType = order.type || 'dine_in';
    const mode = normalizeSaveMode(rawMode, orderType);
    const finalize = mode === 'finalize' || mode === 'finalize-print';
    // ✅ FIXED: For takeaway, always require payment (both draft and finalize)
    // For other types, only require payment when finalizing
    const requiresPayment = (orderType === 'takeaway') || (mode === 'finalize' || mode === 'finalize-print');
    const openPrint = mode === 'finalize-print';
    const assignedTables = Array.isArray(order.tableIds) ? order.tableIds.filter(Boolean) : [];
    if (orderType === 'dine_in' && assignedTables.length === 0) {
      UI.pushToast(ctx, { title: t.toast.order_table_required || t.ui.select_table, icon: '⚠️' });
      return { status: 'error', reason: 'table-required' };
    }
    if (orderType === 'delivery') {
      const customerId = order.customerId || order.customer?.id || null;
      const addressId = order.customerAddressId || order.customer?.addressId || null;
      if (!customerId || !addressId) {
        UI.pushToast(ctx, { title: t.toast.order_customer_required || t.ui.customer_required_delivery, icon: '⚠️' });
        return { status: 'error', reason: 'customer-required' };
      }
    }
    const currentVersion = Number(order.currentVersion ?? order.version);
    const expectedVersion = Number(order.expectedVersion ?? (order.isPersisted ? currentVersion : null));
    const applyRemoteOrder = (remoteOrder) => {
      if (!remoteOrder) return false;
      const enriched = enrichOrderWithMenu(remoteOrder);
      const totalsRef = enriched.totals && typeof enriched.totals === 'object'
        ? { ...enriched.totals }
        : calculateTotals(enriched.lines || [], state.data.settings || {}, enriched.type || 'dine_in', { orderDiscount: enriched.discount });
      const paymentsList = Array.isArray(enriched.payments)
        ? enriched.payments.map(entry => ({
          id: entry.id || `pm-${enriched.id}-${Math.random().toString(36).slice(2, 8)}`,
          method: entry.method || entry.id || entry.type || 'cash',
          amount: round(Number(entry.amount) || 0)
        }))
        : [];
      const paymentSnapshot = summarizePayments(totalsRef, paymentsList);
      ctx.setState(s => ({
        ...s,
        data: {
          ...s.data,
          order: {
            ...(s.data.order || {}),
            ...enriched,
            totals: totalsRef,
            paymentState: paymentSnapshot.state,
            paymentsLocked: isPaymentsLocked(enriched),
            allowAdditions: enriched.allowAdditions !== undefined
              ? enriched.allowAdditions
              : (s.data.order?.allowAdditions ?? true)
          },
          payments: {
            ...(s.data.payments || {}),
            split: paymentsList
          }
        }
      }));
      return true;
    };
    const refreshFromRemote = async (remoteOverride = null, toastKey = 'order_conflict_refreshed') => {
      let latest = remoteOverride;
      if (!latest && previousOrderId) {
        try {
          latest = await posDB.getOrder(previousOrderId);
        } catch (fetchError) {
          //console.warn('[Mishkah][POS] Failed to fetch order after conflict', fetchError);
        }
      }
      if (latest) {
        const applied = applyRemoteOrder(latest);
        if (applied && toastKey) {
          UI.pushToast(ctx, { title: t.toast[toastKey] || t.toast.order_conflict_refreshed || toastKey, icon: '🔄' });
        }
        return applied;
      }
      if (toastKey) {
        UI.pushToast(ctx, { title: t.toast[toastKey] || t.toast.order_conflict_refreshed || toastKey, icon: '🔄' });
      }
      return false;
    };
    if (order.isPersisted && Number.isFinite(currentVersion) && Number.isFinite(expectedVersion) && expectedVersion < currentVersion) {
      await refreshFromRemote(null, 'order_conflict_blocked');
      return { status: 'error', reason: 'stale-version' };
    }

    // ✅ 🔥 CRITICAL RULES: INSERT-ONLY ARCHITECTURE
    // 1. منع UPDATE/DELETE للـ lines القديمة
    // 2. منع التعديل على orders منتهية (delivery/takeaway)
    // 3. السماح بإضافة lines جديدة فقط لـ dine_in
    if (order.isPersisted) {
      //console.log('🔥 [POS V2] Persisted order - checking modification rules...', {
      //  orderId: order.id,
      //  orderType,
      //  finalize,
      //  linesCount: (order.lines || []).length
      //});

      // القاعدة #1: delivery/takeaway منتهي = ممنوع أي تعديل
      const alreadyFinalized = order.status === 'finalized' || order.status === 'closed';
      if ((orderType === 'delivery' || orderType === 'takeaway') && alreadyFinalized && finalize) {
        console.error('❌ [POS V2] Cannot modify finalized delivery/takeaway order');
        UI.pushToast(ctx, {
          title: t.toast.cannot_modify_finalized || 'لا يمكن تعديل طلب منتهي',
          subtitle: 'طلبات الدليفري والتيك أواي لا يمكن تعديلها بعد الإنهاء',
          icon: '🔒'
        });
        return { status: 'error', reason: 'order-finalized' };
      }

      // القاعدة #2: dine_in = فقط إضافة lines جديدة (لا UPDATE ولا DELETE)
      if (orderType === 'dine_in') {
        const currentLines = order.lines || [];
        const newLinesOnly = currentLines.filter(line => {
          // سطر جديد: لا يوجد له isPersisted أو id يبدأ بـ ln- أو temp-
          const isNew = !line.isPersisted ||
            (line.id && (line.id.startsWith('ln-') || line.id.startsWith('temp-')));
          return isNew;
        });

        //console.log('[POS V2] 🔍 Lines analysis:', {
        //  total: currentLines.length,
        //  newLines: newLinesOnly.length,
        //  persistedLines: currentLines.length - newLinesOnly.length
        //});

        // ✅ فقط الأسطر الجديدة ستُحفظ
        if (newLinesOnly.length === 0 && !finalize) {
          //console.warn('[POS V2] ⚠️ No new lines to save for persisted dine_in order');
          // ❌ لا نحفظ - لا توجد تغييرات
          UI.pushToast(ctx, {
            title: t.toast.no_new_lines || 'لا توجد أصناف جديدة',
            subtitle: 'لم يتم إضافة أصناف جديدة للطلب',
            icon: 'ℹ️'
          });
          return { status: 'no-changes', reason: 'no-new-lines' };
        }

        // ✅ تحديث order.lines ليحتوي فقط على الأسطر الجديدة للحفظ
        // CRITICAL: هذا سيمنع إرسال lines قديمة للـ backend
        //console.log('[POS V2] ✅ Filtering to new lines only:', newLinesOnly.length);
        order = {
          ...order,
          lines: newLinesOnly  // ← فقط الجديدة!
        };
      }
    }

    const now = Date.now();
    let missingItemLine = null;
    let missingKitchenLine = null;
    let safeLines = (order.lines || []).map(line => {
      //console.log('[POS][persistOrderFlow] 🔍 BEFORE normalize:', {
      //  lineId: line.id,
      //  itemId: line.itemId,
      //  item_id: line.item_id,
      //  allKeys: Object.keys(line)
      //});

      const sanitizedLine = normalizeOrderLine(line, { orderId: order.id, createdAt: now, updatedAt: now });

      //console.log('[POS][persistOrderFlow] 🔍 AFTER normalize:', {
      //  lineId: sanitizedLine?.id,
      //  itemId: sanitizedLine?.itemId,
      //  item_id: sanitizedLine?.item_id,
      //  allKeys: sanitizedLine ? Object.keys(sanitizedLine) : []
      //});

      if (!sanitizedLine || !sanitizedLine.itemId) {
        console.error('[Mishkah][POS] Line missing itemId', {
          lineId: line.id,
          name: line.name,
          qty: line.qty
        });
        if (!missingItemLine) missingItemLine = line;
      }

      const kitchenSection = sanitizedLine?.kitchenSection || 'expo';
      if (!sanitizedLine?.kitchenSection || String(sanitizedLine.kitchenSection).trim() === '') {
        if (!missingKitchenLine) {
          //console.warn('[Mishkah][POS] Line missing kitchenSection, using expo', {
          //  lineId: line.id,
          //  itemId: sanitizedLine?.itemId,
          //  name: line.name
          //});
          missingKitchenLine = line;
        }
      }

      return {
        ...sanitizedLine,
        locked: true,
        status: sanitizedLine?.status || 'draft',
        statusId: sanitizedLine?.statusId || sanitizedLine?.status || 'draft',
        status_id: sanitizedLine?.status_id || sanitizedLine?.statusId || sanitizedLine?.status || 'draft',
        // ✅ FIXED: Convert notes array to text for backend (order_line.notes is TEXT not JSON)
        notes: notesToText(sanitizedLine?.notes, ' • '),
        discount: normalizeDiscount(sanitizedLine?.discount),
        updatedAt: now,
        kitchenSection,
        kitchenSectionId: kitchenSection,
        kitchen_section_id: kitchenSection,
        metadata: {
          ...(sanitizedLine?.metadata || {}),
          itemId: sanitizedLine?.itemId,
          item_id: sanitizedLine?.itemId,
          kitchenSectionId: kitchenSection
        }
      };
    });
    if (missingItemLine) {
      console.error('[Mishkah][POS] Cannot save order - line has invalid or missing itemId', missingItemLine);
      UI.pushToast(ctx, { title: t.toast.line_missing_item || 'لا يمكن حفظ سطر بدون صنف صحيح', icon: '⚠️' });
      return { status: 'error', reason: 'line-missing-item' };
    }
    if (missingKitchenLine) {
      //console.warn('[Mishkah][POS] Continuing save with expo as default kitchen section');
    }
    // Validate that order has lines with non-zero totals
    if (!safeLines.length) {
      console.error('[Mishkah][POS] Cannot save order with no lines');
      UI.pushToast(ctx, { title: t.toast.order_empty || 'لا يمكن حفظ طلب فارغ', icon: '⚠️' });
      return { status: 'error', reason: 'order-empty' };
    }
    const totals = calculateTotals(safeLines, state.data.settings || {}, orderType, { orderDiscount: order.discount });
    //console.log('[Mishkah][POS] Order totals calculated:', { totals, linesCount: safeLines.length });

    // ✅ CRITICAL FIX v3: Prevent saving orders with zero total
    // For NEW orders: block if total is zero
    // For PERSISTED orders: block if we're adding lines with zero total (not just finalizing)
    const isAddingNewLines = order.isPersisted && order.lines && order.lines.length > 0;
    const shouldBlockZeroTotal = totals.due <= 0 && (!order.isPersisted || isAddingNewLines);

    if (shouldBlockZeroTotal) {
      console.error('❌ [CLAUDE FIX v3] BLOCKED: Cannot save order with zero or negative total', {
        totals,
        isPersisted: order.isPersisted,
        isAddingNewLines,
        newLinesCount: order.lines?.length || 0
      });
      UI.pushToast(ctx, {
        title: t.toast.order_zero_total || 'لا يمكن حفظ طلب بقيمة صفرية',
        subtitle: 'تأكد من أن جميع الأصناف لها أسعار صحيحة',
        icon: '⚠️'
      });
      return { status: 'error', reason: 'order-zero-total' };
    }
    const paymentSplit = Array.isArray(state.data.payments?.split) ? state.data.payments.split : [];
    // CRITICAL FIX: Filter out payments that already exist in the persisted order
    // This prevents sending duplicate payments to backend when reopening a saved order
    const existingPaymentIds = new Set(
      (order.isPersisted && Array.isArray(order.payments))
        ? order.payments.map(pay => pay.id).filter(Boolean)
        : []
    );
    const newPaymentsOnly = paymentSplit.filter(pay => !existingPaymentIds.has(pay.id));
    const allPayments = order.isPersisted
      ? [...(order.payments || []), ...newPaymentsOnly]  // Existing + new payments
      : paymentSplit;  // All payments for new orders

    //console.log('[Mishkah][POS] PAYMENTS PROCESSING', {
    //  isPersisted: order.isPersisted,
    //  existingPayments: order.payments?.length || 0,
    //  splitPayments: paymentSplit.length,
    //  newPaymentsOnly: newPaymentsOnly.length,
    //  allPayments: allPayments.length,
    //  existingPaymentIds: Array.from(existingPaymentIds)
    //});

    const normalizedPayments = allPayments.map(entry => ({
      id: entry.id || `pm-${Math.random().toString(36).slice(2, 8)}`,
      method: entry.method || entry.id || state.data.payments?.activeMethod || 'cash',
      amount: round(Number(entry.amount) || 0)
    })).filter(entry => entry.amount > 0);
    const paymentSummary = summarizePayments(totals, normalizedPayments);
    const outstanding = paymentSummary.remaining;
    if (requiresPayment && outstanding > 0 && !options.skipPaymentCheck) {
      ctx.setState(s => ({
        ...s,
        ui: {
          ...(s.ui || {}),
          modals: { ...(s.ui?.modals || {}), payments: true },
          paymentDraft: { ...(s.ui?.paymentDraft || {}), amount: outstanding ? String(outstanding) : '', method: s.data.payments?.activeMethod || 'cash' },
          pendingAction: { type: 'finalize', mode, orderId: order.id, createdAt: now }
        }
      }));
      UI.pushToast(ctx, { title: t.ui.payments, message: t.ui.balance_due, icon: '💳' });
      return { status: 'pending-payment', mode };
    }
    const typeConfig = getOrderTypeConfig(orderType);
    const status = finalize ? 'finalized' : (order.status || 'open');
    const finalizeStage = finalize
      ? (orderType === 'dine_in' ? 'closed' : 'delivered')
      : (order.fulfillmentStage || 'new');
    const allowAdditions = finalize ? false : !!typeConfig.allowsLineAdditions;
    const orderNotes = Array.isArray(order.notes) ? order.notes : (order.notes ? [order.notes] : []);

    // //console.log('📝📝📝 [NOTES CRITICAL] Order notes before save:', {
    //   'order.notes': order.notes,
    //   'order.notes type': typeof order.notes,
    //   'order.notes isArray': Array.isArray(order.notes),
    //   'orderNotes': orderNotes,
    //   'orderNotes.length': orderNotes.length,
    //   'orderNotes[0]': orderNotes[0]
    // });

    let finalOrderId = previousOrderId;
    // Check if current ID is a draft (local-only) ID
    const isDraftId = previousOrderId && String(previousOrderId).startsWith('draft-');

    // //console.log('═══════════════════════════════════════════════════════');
    //console.log('🔍 [CLAUDE FIX v3] INVOICE ID ALLOCATION DECISION');
    // //console.log('═══════════════════════════════════════════════════════');
    // //console.log('[ALLOCATION CHECK] Current state:', {
    //   isPersisted: order.isPersisted,
    //   previousOrderId,
    //   isDraftId,
    //   retryCount,
    //   IS_SAVING_ORDER,
    //   timestamp: new Date().toISOString()
    // });

    // ✅ CRITICAL FIX: Only allocate sequence for truly NEW orders
    // Allocate new ID ONLY if:
    // 1. No previous ID at all, OR
    // 2. Previous ID is empty/undefined, OR
    // 3. Previous ID is a draft (draft-xxx) that needs real invoice ID
    //
    // ❌ DO NOT allocate if order already has real ID (persisted order with additions)
    const needsNewId = !previousOrderId || previousOrderId === '' || previousOrderId === 'undefined' || isDraftId;

    // //console.log('[ALLOCATION CHECK] Decision:', needsNewId ? '🔢 WILL ALLOCATE NEW ID' : '♻️ WILL USE EXISTING ID');

    if (needsNewId) {
      // //console.log('═══════════════════════════════════════════════════════');
      // //console.log('🔢 [CLAUDE FIX v3] ALLOCATING NEW INVOICE ID (sequence call)');
      // //console.log('⚠️  THIS SHOULD ONLY HAPPEN ONCE PER NEW ORDER!');
      // //console.log('═══════════════════════════════════════════════════════');
      //console.log('[Mishkah][POS] 🆕 Allocating NEW invoice ID', {
      //  isPersisted: order.isPersisted,
      //  previousOrderId,
      //  isDraftId,
      //  retryCount,
      //  reason: isDraftId ? 'draft ID needs real invoice ID' : (!order.isPersisted ? 'order not persisted' : 'no valid previous ID'),
      //  stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n') // Log call stack
      //});
      try {
        finalOrderId = await allocateInvoiceId();
        //console.log('✅✅✅ [CLAUDE FIX v3] Invoice ID allocated successfully');
        //console.log('[ALLOCATION SUCCESS] Details:', {
        //  allocatedId: finalOrderId,
        //  previousId: previousOrderId,
        //  retryAttempt: retryCount,
        //  timestamp: new Date().toISOString()
        //});
        // //console.log('═══════════════════════════════════════════════════════');
      } catch (allocError) {
        console.error('❌❌❌ [CLAUDE FIX v3] Invoice allocation FAILED', {
          error: allocError,
          retryCount,
          previousOrderId
        });
        UI.pushToast(ctx, { title: t.toast.indexeddb_error, message: String(allocError), icon: '🛑' });
        return { status: 'error', reason: 'invoice' };
      }
    } else {
      //console.log('♻️♻️♻️ [CLAUDE FIX v3] Using EXISTING order ID:', previousOrderId);
      //console.log('[EXISTING ID] Details:', {
      //   isPersisted: order.isPersisted,
      //   version: order.version,
      //   currentVersion: order.currentVersion,
      //   expectedVersion: order.expectedVersion,
      //   retryCount
      //});
      // //console.log('═══════════════════════════════════════════════════════');
    }
    const idChanged = previousOrderId !== finalOrderId;
    const primaryTableId = assignedTables.length ? assignedTables[0] : (order.tableId || null);
    // CRITICAL: Determine version to send to backend
    // Backend uses optimistic locking: expects version to increment on each save
    // - New order (ID changed or draft): version=1
    // - Updating existing order: version = currentVersion + 1
    const outgoingVersion = (idChanged || isDraftId)
      ? 1  // New order starts at version 1
      : (order.isPersisted && Number.isFinite(currentVersion) && currentVersion > 0
        ? Math.trunc(currentVersion) + 1  // Increment version for updates
        : 1);  // Fallback to version 1
    // //console.log('[Mishkah][POS] VERSION DECISION', {
    //   idChanged,
    //   isDraftId,
    //   isPersisted: order.isPersisted,
    //   expectedVersion,
    //   currentVersion,
    //   outgoingVersion,
    //   incrementReason: (idChanged || isDraftId)
    //     ? 'new order - start at v1'
    //     : (order.isPersisted ? `update existing - increment from v${currentVersion} to v${outgoingVersion}` : 'fallback to v1')
    // });
    // //console.log('🏷️🏷️🏷️ [TABLE CRITICAL] BEFORE creating orderPayload:', {
    //   'order.tableIds': order.tableIds,
    //   'assignedTables': assignedTables,
    //   'primaryTableId': primaryTableId
    // });

    const orderPayload = {
      ...order,
      id: finalOrderId,
      status,
      fulfillmentStage: finalizeStage,
      lines: safeLines,
      notes: orderNotes,
      updatedAt: now,
      savedAt: now,
      totals,
      payments: normalizedPayments,
      discount: normalizeDiscount(order.discount),
      shiftId: currentShift.id,
      posId: order.posId || POS_INFO.id,
      posLabel: order.posLabel || POS_INFO.label,
      posNumber: Number.isFinite(Number(order.posNumber)) ? Number(order.posNumber) : POS_INFO.number,
      isPersisted: true,
      dirty: false,
      paymentState: paymentSummary.state,
      orderTypeId: orderType,
      order_type_id: orderType,
      statusId: status,
      status_id: status,
      stageId: finalizeStage,
      stage_id: finalizeStage,
      paymentStateId: paymentSummary.state,
      payment_state_id: paymentSummary.state,
      subtotal: totals.subtotal,
      discountAmount: totals.discount,
      discount_amount: totals.discount,
      service_amount: totals.service,
      tax_amount: totals.vat,
      delivery_fee: totals.deliveryFee,
      totalDue: totals.due,
      total_due: totals.due,
      total: totals.due,
      totalPaid: paymentSummary.paid,
      total_paid: paymentSummary.paid,
      tableId: primaryTableId,
      table_id: primaryTableId,
      tableIds: assignedTables,  // ✅ CRITICAL FIX: Send full tableIds array to backend
      table_ids: assignedTables,  // ✅ snake_case for backend
      serviceMode: orderType,
      version: outgoingVersion,
      currentVersion: outgoingVersion,
      expectedVersion: outgoingVersion,
      paymentsLocked: finalize ? true : isPaymentsLocked(order),
      allowAdditions,
      lockLineEdits: finalize ? true : (order.lockLineEdits !== undefined ? order.lockLineEdits : false),
      metadata: {
        ...(order.metadata || {}),
        orderType,
        orderTypeId: orderType,
        serviceMode: orderType,
        tableIds: assignedTables,
        notes: orderNotes,  // ✅ Add notes to metadata as backup
        notes_json: JSON.stringify(orderNotes)  // ✅ JSON string version for backend
      }
    };

    // //console.log('🏷️🏷️🏷️ [TABLE CRITICAL] AFTER creating orderPayload:', {
    //   'orderPayload.tableIds': orderPayload.tableIds,
    //   'orderPayload.table_ids': orderPayload.table_ids,
    //   'orderPayload.tableId': orderPayload.tableId,
    //   'orderPayload.metadata.tableIds': orderPayload.metadata.tableIds
    // });

    // //console.log('📝📝📝 [NOTES CRITICAL] orderPayload notes:', {
    //   'orderPayload.notes': orderPayload.notes,
    //   'orderPayload.notes type': typeof orderPayload.notes,
    //   'orderPayload.notes isArray': Array.isArray(orderPayload.notes),
    //   'orderPayload.notes.length': orderPayload.notes?.length,
    //   'orderPayload.metadata.notes': orderPayload.metadata.notes,
    //   'orderPayload.metadata.notes_json': orderPayload.metadata.notes_json
    // });
    if (finalize) {
      orderPayload.finalizedAt = now;
      orderPayload.finishedAt = now;
    }
    if (Number.isFinite(outgoingVersion)) {
      orderPayload.metadata = { ...(orderPayload.metadata || {}) };
      orderPayload.metadata.version = Math.trunc(outgoingVersion);
    }
    try {
      const persistableOrder = { ...orderPayload };
      delete persistableOrder.dirty;
      // //console.log('═══════════════════════════════════════════════════════');
      //console.log('💾 [CLAUDE FIX v2] SENDING ORDER TO REST API (NOT IndexedDB)');
      // //console.log('═══════════════════════════════════════════════════════');
      //console.log('[Mishkah][POS] Saving order to DB:', {
      //  orderId: persistableOrder.id,
      //  totals: persistableOrder.totals,
      //  linesCount: persistableOrder.lines?.length,
      //  firstLine: persistableOrder.lines?.[0],
      //  subtotal: persistableOrder.subtotal,
      //  totalDue: persistableOrder.totalDue
      //});
      let savedOrder = null;
      let saveOrderSuccess = false;
      try {
        //console.log('📡 [POS] Calling posDB.saveOrder...');
        savedOrder = await posDB.saveOrder(persistableOrder);
        saveOrderSuccess = true;
        //console.log('✅ [CLAUDE FIX v2] REST API responded successfully');
        //console.log('[Mishkah][POS] Order saved to DB, returned data:', {
        //  orderId: savedOrder?.id,
        //  totals: savedOrder?.totals,
        //  linesCount: savedOrder?.lines?.length,
        //  firstLine: savedOrder?.lines?.[0],
        //  subtotal: savedOrder?.subtotal,
        //  totalDue: savedOrder?.totalDue
        //});

        // //console.log('📝📝📝 [NOTES CRITICAL] Backend response notes:', {
        //   'savedOrder.notes': savedOrder?.notes,
        //   'savedOrder.notes type': typeof savedOrder?.notes,
        //   'savedOrder.notes isArray': Array.isArray(savedOrder?.notes),
        //   'savedOrder.notes.length': savedOrder?.notes?.length,
        //   'savedOrder.metadata?.notes': savedOrder?.metadata?.notes,
        //   'savedOrder.metadata?.notes_json': savedOrder?.metadata?.notes_json
        // });
      } catch (error) {
        console.error('[Mishkah][POS] Error saving order to backend:', {
          errorMessage: error?.message,
          errorCode: error?.code,
          errorStatus: error?.status,
          orderId: persistableOrder.id,
          isDraftId,
          idChanged,
          outgoingVersion
        });
        if (error && (error.code === 'order-version-conflict' || error.code === 'VERSION_CONFLICT')) {
          //console.warn('[Mishkah][POS] 409 VERSION CONFLICT detected', {
          //  isDraftId,
          //  previousOrderId,
          //  finalOrderId,
          //  idChanged,
          //  willRefresh: !isDraftId && !idChanged
          //});

          // CRITICAL FIX: If converting draft to real order and got conflict,
          // the allocated ID already exists in backend - retry with new ID
          if (isDraftId && idChanged) {
            console.error('[Mishkah][POS] Draft conversion failed: Invoice ID already exists', {
              allocatedId: finalOrderId,
              draftId: previousOrderId,
              suggestion: 'Retrying with new invoice ID'
            });
            UI.pushToast(ctx, {
              title: t.toast.order_id_conflict || 'رقم الفاتورة مستخدم بالفعل',
              message: t.toast.retrying_save || 'جاري إعادة المحاولة برقم جديد...',
              icon: '🔄'
            });
            // Retry the entire save flow - it will allocate a new ID
            return await persistOrderFlow(ctx, rawMode, { ...options, retryCount: (options.retryCount || 0) + 1 });
          }

          // Only try to refresh from remote if this was a real order update (not a draft conversion)
          if (!isDraftId && !idChanged) {
            await refreshFromRemote(error.order || null, 'order_conflict_refreshed');
          } else {
            console.error('[Mishkah][POS] Cannot refresh draft order from remote - this should not happen with proper version=1');
            UI.pushToast(ctx, { title: t.toast.order_save_failed || 'فشل حفظ الطلب', message: error.message, icon: '⚠️' });
          }
          return { status: 'error', reason: 'version-conflict' };
        }
        throw error;
      }

      //console.log('🎯 [DEBUG] After saveOrder - success:', saveOrderSuccess, 'savedOrder:', !!savedOrder);

      if (posDB.available && typeof posDB.deleteTempOrder === 'function') {
        try { await posDB.deleteTempOrder(orderPayload.id); } catch (_tempErr) { }
        if (idChanged && previousOrderId) {
          try { await posDB.deleteTempOrder(previousOrderId); } catch (_tempErr) { }
        }
      }
      // ✅ [POS V2] Save job_order_* tables via mishkah-store
      // posv2.html watchers will update window.database automatically (same as KDS)
      //console.log('🔥 [POS V2] Saving job_order tables...');
      const store = window.__POS_DB__;
      //console.log('🔍 [DEBUG] store available?', !!store, 'insert function?', typeof store?.insert);

      // ✅ CRITICAL FIX: Define retryWithBackoff at function level (not inside if block)
      // This ensures it's available everywhere in persistOrderFlow (including line 7624)
      const retryWithBackoff = async (operation, operationName, maxRetries = 3, allowRetryOnTimeout = true) => {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await operation();
            if (attempt > 0) {
              //console.log(`✅ [POS V2] ${operationName} succeeded on retry ${attempt}`);
            }
            return { success: true, result };
          } catch (err) {
            lastError = err;
            const isTimeout = err?.message?.includes('timed out');
            const isInsertOperation = operationName.toUpperCase().startsWith('INSERT');

            // ✅ CRITICAL: Never retry INSERT on timeout - may cause duplicates!
            if (isTimeout && isInsertOperation) {
              //console.warn(`⚠️ [POS V2] ${operationName} timed out - NOT retrying (INSERT operations are not idempotent)`);
              break;
            }

            if (isTimeout && allowRetryOnTimeout && attempt < maxRetries) {
              const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
              //console.warn(`⏱️ [POS V2] ${operationName} timed out (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
              break;
            }
          }
        }
        console.error(`❌ [POS V2] ${operationName} failed after ${maxRetries + 1} attempts:`, lastError);
        return { success: false, error: lastError };
      };

      if (store && typeof store.insert === 'function') {
        //console.log('✅ [POS V2] store.insert is available, generating KDS payload...');
        // Generate KDS payload
        const kdsPayload = await serializeOrderForKDS(orderPayload, state);

        //console.log('🔍 [DEBUG] serializeOrderForKDS returned:', {
        //  hasPayload: !!kdsPayload,
        //  hasJobHeaders: !!kdsPayload?.job_order_header,
        //  jobHeadersCount: kdsPayload?.job_order_header?.length || 0,
        //  hasJobDetails: !!kdsPayload?.job_order_detail,
        //  jobDetailsCount: kdsPayload?.job_order_detail?.length || 0
        //});

        // ✅ Process KDS payload if available
        if (kdsPayload && kdsPayload.job_order_header) {
          //console.log('[POS V2] Processing KDS/order_header updates:', {
          //  hasKdsPayload: !!kdsPayload,
          //  hasJobHeaders: !!kdsPayload?.job_order_header,
          //  jobHeadersCount: kdsPayload?.job_order_header?.length || 0,
          //  finalize,
          //  orderIsPersisted: order.isPersisted
          //});
          //console.log('[POS V2] job_order_header count:', kdsPayload?.job_order_header?.length || 0);
          //console.log('[POS V2] order_header count:', kdsPayload?.order_header?.length || 0);
          //console.log('[POS V2] order_line count:', kdsPayload?.order_line?.length || 0);

          // ✅ DEBUG: Log store configuration
          //console.log('🔍🔍🔍 [POS V2] Store configuration:', {
          //  configObjects: Object.keys(store.config?.objects || {}),
          //  hasJobOrderHeader: store.config?.objects?.hasOwnProperty('job_order_header'),
          //  connected: store?.connected || 'unknown'
          //});

          // ✅ CRITICAL FIX: Declare isPersistedOrder and hasOnlyNewItems BEFORE using them
          const isPersistedOrder = order.isPersisted === true;
          const hasOnlyNewItems = kdsPayload?.isReopenedOrder || false; // Order has new unpersisted items

          // ✅ CRITICAL: Create job_order_batch record (only if we have job_order_header)
          // Extract batchId from first job_order_header (all jobs in same save share same batchId)
          const firstJob = kdsPayload?.job_order_header?.[0];
          if (firstJob && firstJob.batchId) {
            const batchId = firstJob.batchId;
            const batchJobs = kdsPayload.job_order_header.filter(j => j.batchId === batchId);

            // Determine batch type: initial or addition
            const batchType = isPersistedOrder ? 'addition' : 'initial';

            const batchRecord = {
              id: batchId,
              orderId: orderPayload.id,
              orderNumber: orderPayload.orderNumber || orderPayload.number || 'N/A',
              status: 'queued',  // Initial status
              version: 1,  // ✅ Required for optimistic concurrency control in mishkah-store
              totalJobs: batchJobs.length,
              readyJobs: 0,
              batchType: batchType,
              assembledAt: null,
              servedAt: null,
              notes: null,
              meta: {
                createdBy: 'posv2',
                orderType: orderPayload.orderTypeId || orderPayload.type || 'dine_in',
                tableLabel: orderPayload.tableLabel || null
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            //console.log('📦 [POS V2] Creating job_order_batch:', {
            //    batchId,
            //    totalJobs: batchJobs.length,
            //    batchType,
            //    orderId: orderPayload.id
            //  });

            // Add batch to kdsPayload for saving
            kdsPayload.job_order_batch = [batchRecord];
          }

          // ✅ DEBUG: Log order_header notes BEFORE save
          if (kdsPayload.order_header && kdsPayload.order_header.length > 0) {
            //console.log('📝 [DEBUG] order_header[0] BEFORE save:', {
            //    id: kdsPayload.order_header[0].id,
            //    notes: kdsPayload.order_header[0].notes,
            //    notesType: typeof kdsPayload.order_header[0].notes,
            //    notesLength: kdsPayload.order_header[0].notes?.length,
            //    status: kdsPayload.order_header[0].status,
            //    tableIds: kdsPayload.order_header[0].tableIds,
            //    version: kdsPayload.order_header[0].version
            //  });
          }

          // ✅ CRITICAL FIX: Fire-and-forget - DON'T await job_order saves
          // Print modal opens IMMEDIATELY without waiting for saves
          // This prevents print delays - user sees print dialog instantly

          // ✅ CRITICAL FIX: DO NOT update order_header when adding new items to existing order
          // Updating order_header causes backend to DELETE existing job_orders!
          // Only insert new job_orders for new items - leave order_header untouched

          // ✅ Get existing order_header from window.database to read current version
          const existingOrderHeaders = window.database?.order_header || [];
          const existingOrderHeader = existingOrderHeaders.find(h => String(h.id) === String(order.id));

          // ✅ Execute all operations with retry logic and track results
          Promise.all([
            // ✅ CRITICAL: Only save order_header for NEW orders
            // For existing orders with new items, skip order_header update to preserve job_orders
            ...(hasOnlyNewItems ? [] : (kdsPayload?.order_header || []).map(orderHeader => {
              if (isPersistedOrder && typeof store.update === 'function') {
                // ✅ CRITICAL: Version is REQUIRED for store.update()
                // Read current version from existing record, increment by 1
                const currentVersion = existingOrderHeader?.version || order.version || order.currentVersion || 1;
                const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

                // ✅ CRITICAL VALIDATION: Ensure version exists - update WILL FAIL without it!
                if (!Number.isFinite(nextVersion) || nextVersion < 1) {
                  console.error('❌ [POS V2] FATAL: Cannot update order_header without valid version!', {
                    orderId: orderHeader.id,
                    currentVersion,
                    nextVersion,
                    existingOrderHeader: !!existingOrderHeader,
                    fallbackToInsert: false
                  });
                  // Return failed result - don't attempt update without version
                  return Promise.resolve({
                    success: false,
                    error: new Error(`Missing valid version for update (currentVersion: ${currentVersion})`)
                  });
                }

                const updatePayload = {
                  ...orderHeader,
                  version: nextVersion  // ✅ REQUIRED for update to work!
                };

                //console.log('🔄 [POS V2] UPDATING order_header (persisted order):', orderHeader.id, {
                //    status: orderHeader.status,
                //    stage: orderHeader.fulfillmentStage,
                //    tableIds: orderHeader.tableIds,
                //    notes: updatePayload.notes,  // ✅ DEBUG: Log notes in update payload
                //    notesType: typeof updatePayload.notes,
                //    currentVersion,
                //     nextVersion,
                //     versionValid: true  // ✅ Confirmed version is valid
                //    });
                return retryWithBackoff(
                  () => store.update('order_header', updatePayload),
                  `UPDATE order_header: ${orderHeader.id} (v${currentVersion}→v${nextVersion})`
                );
              } else {
                // console.log('✨ [POS V2] INSERTING order_header (new order):', orderHeader.id, {
                //  status: orderHeader.status,
                //   tableIds: orderHeader.tableIds,
                //  notes: orderHeader.notes,  // ✅ DEBUG: Log notes in insert payload
                //   notesType: typeof orderHeader.notes,
                //    version: orderHeader.version
                //  });
                return retryWithBackoff(
                  () => store.insert('order_header', orderHeader, { silent: false }),
                  `INSERT order_header: ${orderHeader.id}`
                );
              }
            })),
            // ✅ Save order_line (for static KDS tabs)
            // For reopened orders: only insert new lines (filtered in serializeOrderForKDS)
            // For new orders: insert all lines
            ...(kdsPayload?.order_line || []).map(orderLine =>
              retryWithBackoff(
                () => store.insert('order_line', orderLine, { silent: false }),
                `INSERT order_line: ${orderLine.id}`
              )
            ),
            // ✅ Save job_order_batch (CRITICAL: must be saved before job_order_header!)
            ...(kdsPayload?.job_order_batch || []).map(batch => {
              //console.log('📦 [POS V2] INSERTING job_order_batch:', {
              //    batchId: batch.id,
              //    totalJobs: batch.totalJobs,
              //    batchType: batch.batchType
              // });
              return retryWithBackoff(
                () => store.insert('job_order_batch', batch, { silent: false }),
                `INSERT job_order_batch: ${batch.id}`
              );
            }),
            // Save job_order_header (for dynamic station tabs)
            // ✅ CRITICAL: silent: false to broadcast changes to KDS immediately!
            ...(kdsPayload?.job_order_header || []).map(jobHeader => {
              //console.log('🚀🚀🚀 [POS V2] INSERTING job_order_header:', {
              //    id: jobHeader.id,
              //    orderId: jobHeader.orderId,
              //    stationId: jobHeader.stationId,
              //    batchId: jobHeader.batchId,
              //    silent: false,
              //    storeConnected: store?.connected || 'unknown',
              //    timestamp: new Date().toISOString()
              // });
              return retryWithBackoff(
                () => store.insert('job_order_header', jobHeader, { silent: false }),
                `INSERT job_order_header: ${jobHeader.id}`
              );
            }),
            // ✅ CRITICAL: Save job_order_detail with duplicate prevention
            ...(kdsPayload?.job_order_detail || []).map(async jobDetail => {
              // ✅ Check if this orderLineId already exists in job_order_detail
              const orderLineId = jobDetail.orderLineId || jobDetail.order_line_id;

              //console.log('🔍 [INSERT CHECK] Checking for duplicate before insert:', {
              //    orderLineId,
              //    detailId: jobDetail.id,
              //    itemName: jobDetail.itemNameAr || jobDetail.itemNameEn,
              //    storeAvailable: !!store,
              //    databaseAvailable: typeof window !== 'undefined' && !!window.database
              // });

              // ✅ CRITICAL: Check duplicates using window.database (in-memory cache)
              // store.query() doesn't exist - use window.database instead!
              if (typeof window !== 'undefined' && window.database && Array.isArray(window.database.job_order_detail)) {
                try {
                  const existing = window.database.job_order_detail.filter(detail => {
                    const detailLineId = detail.orderLineId || detail.order_line_id;
                    return detailLineId === orderLineId;
                  });

                  //console.log('🔍 [INSERT CHECK] Database result:', {
                  //    orderLineId,
                  //    existingCount: existing.length,
                  //    existingIds: existing.map(d => d.id),
                  //    totalJobDetails: window.database.job_order_detail.length
                  // });

                  if (existing.length > 0) {
                    //console.warn(`⚠️⚠️⚠️ [DUPLICATE PREVENTION ACTIVE] Blocked duplicate insert!`, {
                    //    orderLineId,
                    //    existingDetailIds: existing.map(d => d.id),
                    //    attemptedDetailId: jobDetail.id,
                    //    itemName: jobDetail.itemNameAr || jobDetail.itemNameEn,
                    //    action: 'SKIPPED - NOT INSERTED'
                    // });
                    // Return success without inserting (already exists)
                    return { success: true, skipped: true, reason: 'already_exists' };
                  }
                } catch (checkErr) {
                  console.error(`❌ [INSERT CHECK] Check failed for ${orderLineId}:`, checkErr);
                  // Continue with insert if check fails (data may be stale)
                }
              } else {
                //console.warn(`⚠️ [INSERT CHECK] window.database not available - cannot check duplicates`);
                // Continue with insert (fail-open for availability)
              }

              // No existing record found - safe to insert
              //console.log('✅ [INSERT CHECK] No duplicate found - proceeding with insert:', orderLineId);
              return retryWithBackoff(
                () => store.insert('job_order_detail', jobDetail, { silent: false }),
                `INSERT job_order_detail: ${jobDetail.id}`
              );
            }),
            // Save modifiers
            ...(kdsPayload?.job_order_detail_modifier || []).map(modifier =>
              retryWithBackoff(
                () => store.insert('job_order_detail_modifier', modifier, { silent: false }),
                `INSERT job_order_detail_modifier: ${modifier.id}`
              )
            ),
            // Save status history
            ...(kdsPayload?.job_order_status_history || []).map(history =>
              retryWithBackoff(
                () => store.insert('job_order_status_history', history, { silent: false }),
                `INSERT job_order_status_history: ${history.id}`
              )
            )
          ]).then(results => {
            // ✅ Track success/failure statistics
            const successCount = results.filter(r => r?.success).length;
            const failureCount = results.filter(r => !r?.success).length;
            const totalCount = results.length;

            if (failureCount === 0) {
              //console.log(`✅ [POS V2] All ${totalCount} KDS operations saved successfully!`);
              //console.log('📡 [POS V2] window.database updated - KDS will show notes');
            } else {
              //console.warn(`⚠️ [POS V2] KDS operations completed: ${successCount}/${totalCount} succeeded, ${failureCount} failed`);
              //console.warn('⚠️ [POS V2] Some data may not appear in KDS - check errors above');
            }
          }).catch(err => {
            console.error('[POS V2] ❌ Unexpected error in KDS operations:', err);
          });
          // Don't wait - continue immediately to open print modal

        } else {
          //console.warn('[POS V2] ⚠️ No job_order payload generated');
        }

        // ✅ [POS V2] Save NEW payments via mishkah-store (unified with kds.js)
        // ✅ CRITICAL FIX: Fire-and-forget payments to prevent print delay!
        //console.log('💰 [POS V2] Saving NEW payments...');
        if (newPaymentsOnly.length > 0) {
          //console.log('[POS V2] New payments to save:', newPaymentsOnly.length);
          const nowIso = new Date(now).toISOString();

          // ✅ CRITICAL: Don't await payment saves - fire and forget!
          Promise.all(newPaymentsOnly.map(payment => {
            const paymentRecord = {
              id: payment.id || `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              orderId: finalOrderId,
              paymentMethodId: payment.method || 'cash',
              amount: round(Number(payment.amount) || 0),
              capturedAt: nowIso,
              shiftId: currentShift?.id || 'current-shift',
              reference: payment.reference || null
            };

            return store.insert('order_payment', paymentRecord)
              .then(() => console.log('[POS V2] ✅ Saved payment:', paymentRecord.id, 'amount:', paymentRecord.amount))
              .catch(paymentError => {
                console.error('[POS V2] ❌ Failed to save payment:', paymentError);
                // Don't fail the entire save - payment is non-critical
              });
          })).then(() => {
            //console.log('✅ [POS V2] All payments saved!');
          }).catch(err => {
            console.error('[POS V2] ❌ Some payments failed:', err);
          });
          // Don't wait - continue immediately to print
        } else {
          //console.log('[POS V2] No new payments to save');
        }

        // ✅ CRITICAL FIX: Auto-close dine_in orders when fully paid from POS cashier
        // This is the ONLY place where dine_in orders are closed (not from KDS)
        const serviceMode = orderPayload.type || orderPayload.serviceMode || 'dine_in';
        if (serviceMode === 'dine_in') {
          // Calculate total due and paid
          const totalsDue = calculateTotals(orderPayload.lines || [], settings, serviceMode, { orderDiscount: orderPayload.discount });
          const totalDue = Number(totalsDue?.due || 0);
          const allPayments = [...(orderPayload.payments || []), ...newPaymentsOnly];
          const totalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

          //console.log('[POS V2] Dine-in order payment check:', {
          //   orderId: orderPayload.id,
          //   totalDue,
          //   totalPaid,
          //   isFullyPaid: totalPaid >= totalDue
          // });

          // ✅ If fully paid, close the order
          if (totalDue > 0 && totalPaid >= totalDue) {
            //console.log('[POS V2] ✅ Dine-in order fully paid, closing:', orderPayload.id);

            // Get existing order_header
            const existingOrderHeaders = window.database?.order_header || [];
            const existingOrderHeader = existingOrderHeaders.find(h => String(h.id) === String(orderPayload.id));

            if (existingOrderHeader && typeof store.update === 'function') {
              const currentVersion = existingOrderHeader.version || 1;
              const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;
              const nowIso = new Date().toISOString();

              // ✅ CRITICAL VALIDATION: Ensure version exists - update WILL FAIL without it!
              if (!Number.isFinite(nextVersion) || nextVersion < 1) {
                console.error('❌ [POS V2] FATAL: Cannot close order_header without valid version!', {
                  orderId: orderPayload.id,
                  currentVersion,
                  nextVersion
                });
              } else {
                // Update order_header to closed (with retry logic)
                const updateOperation = async () => {
                  return store.update('order_header', {
                    id: orderPayload.id,
                    fulfillmentStage: 'closed',
                    status: 'closed',
                    version: nextVersion,
                    updatedAt: nowIso
                  });
                };

                retryWithBackoff(updateOperation, `CLOSE order_header: ${orderPayload.id} (v${currentVersion}→v${nextVersion})`)
                  .then(result => {
                    if (result.success) {
                      //console.log('[POS V2] ✅ Dine-in order closed successfully');
                    } else {
                      console.error('[POS V2] ❌ Failed to close dine-in order after retries:', result.error);
                    }
                  })
                  .catch(err => {
                    console.error('[POS V2] ❌ Unexpected error closing dine-in order:', err);
                  });
              }
            }
          }
        }
      } else {
        //console.warn('[POS V2] ⚠️ mishkah-store not available');
      }
      // ✅ CRITICAL FIX: Fire-and-forget markSync to prevent print delay!
      posDB.markSync().catch(err => console.error('[POS V2] markSync failed:', err));

      //console.log('🏷️ [TABLE DEBUG] BEFORE mergePreferRemote:', {
      //    orderPayloadTableIds: orderPayload.tableIds,
      //    savedOrderTableIds: savedOrder?.tableIds,
      //    savedOrderTableId: savedOrder?.tableId,
      //    savedOrderTable_ids: savedOrder?.table_ids
      // });

      //console.log('📝 [NOTES DEBUG] BEFORE mergePreferRemote:', {
      //    orderPayloadNotes: orderPayload.notes,
      //    orderPayloadNotesLength: orderPayload.notes?.length,
      //    savedOrderNotes: savedOrder?.notes,
      //    savedOrderNotesLength: savedOrder?.notes?.length
      // });

      const remoteResolved = savedOrder && typeof savedOrder === 'object'
        ? mergePreferRemote(orderPayload, savedOrder)
        : orderPayload;

      //console.log('🏷️ [TABLE DEBUG] AFTER mergePreferRemote:', {
      //    remoteResolvedTableIds: remoteResolved.tableIds,
      //    remoteResolvedTableId: remoteResolved.tableId,
      //    isArray: Array.isArray(remoteResolved.tableIds),
      //    length: remoteResolved.tableIds?.length
      // });

      //console.log('📝 [NOTES DEBUG] AFTER mergePreferRemote:', {
      //    remoteResolvedNotes: remoteResolved.notes,
      //    remoteResolvedNotesLength: remoteResolved.notes?.length
      // });

      // ✅ CRITICAL FIX: Preserve tableIds from orderPayload if savedOrder doesn't have them
      // Backend may not return tableIds, causing them to disappear after save
      if (remoteResolved && (!remoteResolved.tableIds || remoteResolved.tableIds.length === 0)) {
        if (Array.isArray(orderPayload.tableIds) && orderPayload.tableIds.length > 0) {
          //console.log('⚠️ [TABLE FIX] Backend missing tableIds - restoring from orderPayload:', orderPayload.tableIds);
          remoteResolved.tableIds = orderPayload.tableIds.slice();
          // ✅ Also set tableId (primary table) for compatibility
          if (!remoteResolved.tableId && orderPayload.tableIds.length > 0) {
            remoteResolved.tableId = orderPayload.tableIds[0];
          }
        }
      } else {
        //console.log('✅ [TABLE DEBUG] tableIds preserved after merge:', remoteResolved.tableIds);
      }

      // ✅ CRITICAL FIX: Preserve notes from orderPayload if savedOrder doesn't have them
      // Backend may not return notes, causing them to disappear after save
      if (remoteResolved && (!remoteResolved.notes || remoteResolved.notes.length === 0)) {
        if (Array.isArray(orderPayload.notes) && orderPayload.notes.length > 0) {
          //console.warn('⚠️⚠️ [NOTES FIX] Backend missing notes - restoring from orderPayload:', orderPayload.notes);
          remoteResolved.notes = orderPayload.notes.slice();
        } else if (orderPayload.metadata?.notes && Array.isArray(orderPayload.metadata.notes) && orderPayload.metadata.notes.length > 0) {
          //console.warn('⚠️⚠️ [NOTES FIX] Restoring notes from metadata:', orderPayload.metadata.notes);
          remoteResolved.notes = orderPayload.metadata.notes.slice();
        }
      } else {
        //console.log('✅ [NOTES DEBUG] notes preserved after merge:', remoteResolved.notes);
      }

      //console.log('[Mishkah][POS] Before enrichOrderWithMenu:', {
      //    orderId: remoteResolved.id,
      //    tableIds: remoteResolved.tableIds,
      //    notes: remoteResolved.notes,
      //    notesLength: remoteResolved.notes?.length,
      //    totals: remoteResolved.totals,
      //    linesCount: remoteResolved.lines?.length,
      //    firstLine: remoteResolved.lines?.[0]
      // });

      // ✅ CRITICAL: Store tableIds AND notes BEFORE enrichOrderWithMenu (may lose them)
      const tableIdsBackup = Array.isArray(remoteResolved.tableIds) ? remoteResolved.tableIds.slice() : [];
      const tableIdBackup = remoteResolved.tableId || (tableIdsBackup.length > 0 ? tableIdsBackup[0] : null);
      const notesBackup = Array.isArray(remoteResolved.notes) ? remoteResolved.notes.map(n => ({ ...n })) : [];

      const normalizedOrderForState = enrichOrderWithMenu({
        ...remoteResolved,
        allowAdditions,
        lockLineEdits: finalize ? true : (remoteResolved.lockLineEdits ?? order.lockLineEdits)
      });

      // ✅ RESTORE tableIds after enrichOrderWithMenu if lost
      if ((!normalizedOrderForState.tableIds || normalizedOrderForState.tableIds.length === 0) && tableIdsBackup.length > 0) {
        //console.warn('⚠️⚠️⚠️ [TABLE RESTORE] enrichOrderWithMenu lost tableIds! Restoring:', tableIdsBackup);
        normalizedOrderForState.tableIds = tableIdsBackup;
        normalizedOrderForState.tableId = tableIdBackup;
      }

      // ✅ RESTORE notes after enrichOrderWithMenu if lost
      if ((!normalizedOrderForState.notes || normalizedOrderForState.notes.length === 0) && notesBackup.length > 0) {
        //console.warn('⚠️⚠️⚠️ [NOTES RESTORE] enrichOrderWithMenu lost notes! Restoring:', notesBackup);
        normalizedOrderForState.notes = notesBackup;
      }
      //console.log('[Mishkah][POS] After enrichOrderWithMenu:', {
      //    orderId: normalizedOrderForState.id,
      //    tableIds: normalizedOrderForState.tableIds,  // ✅ CHECK: Did enrichOrderWithMenu preserve tableIds?
      //    tableId: normalizedOrderForState.tableId,
      //    totals: normalizedOrderForState.totals,
      //    linesCount: normalizedOrderForState.lines?.length,
      //    firstLine: normalizedOrderForState.lines?.[0]
      // });
      const mergedTotals = normalizedOrderForState.totals && typeof normalizedOrderForState.totals === 'object'
        ? { ...normalizedOrderForState.totals }
        : calculateTotals(normalizedOrderForState.lines || [], state.data.settings || {}, normalizedOrderForState.type || orderType, { orderDiscount: normalizedOrderForState.discount });
      const mergedPayments = Array.isArray(normalizedOrderForState.payments)
        ? normalizedOrderForState.payments.map(pay => ({ ...pay, amount: round(Number(pay.amount) || 0) }))
        : normalizedPayments;
      const mergedPaymentSnapshot = summarizePayments(mergedTotals, mergedPayments);
      normalizedOrderForState.totals = mergedTotals;
      normalizedOrderForState.payments = mergedPayments;
      normalizedOrderForState.paymentState = mergedPaymentSnapshot.state;
      normalizedOrderForState.paymentsLocked = finalize ? true : isPaymentsLocked(normalizedOrderForState);
      normalizedOrderForState.allowAdditions = allowAdditions;
      normalizedOrderForState.lockLineEdits = finalize ? true : (normalizedOrderForState.lockLineEdits !== undefined ? normalizedOrderForState.lockLineEdits : true);

      const syncedOrderForState = syncOrderVersionMetadata(normalizedOrderForState);

      // ✅ FINAL BACKUP: Ensure tableIds survive to the end
      if ((!syncedOrderForState.tableIds || syncedOrderForState.tableIds.length === 0) && tableIdsBackup.length > 0) {
        console.error('❌❌❌ [TABLE RESTORE] syncOrderVersionMetadata lost tableIds! Restoring:', tableIdsBackup);
        syncedOrderForState.tableIds = tableIdsBackup;
        syncedOrderForState.tableId = tableIdBackup;
      }

      // ✅ FINAL BACKUP: Ensure notes survive to the end
      if ((!syncedOrderForState.notes || syncedOrderForState.notes.length === 0) && notesBackup.length > 0) {
        console.error('❌❌❌ [NOTES RESTORE] syncOrderVersionMetadata lost notes! Restoring:', notesBackup);
        syncedOrderForState.notes = notesBackup;
      }

      // ✅ CRITICAL FIX: Mark ALL lines as persisted after successful save
      // This ensures that when the order is reopened and new items are added,
      // we can detect which items are new (isPersisted=false/undefined) vs old (isPersisted=true)
      if (Array.isArray(syncedOrderForState.lines)) {
        syncedOrderForState.lines = syncedOrderForState.lines.map(line => ({
          ...line,
          isPersisted: true  // ✅ Mark as persisted since it's now saved in backend
        }));
      }
      // ✅ Mark order itself as persisted
      syncedOrderForState.isPersisted = true;
      syncedOrderForState.dirty = false;

      //console.log('[Mishkah][POS] Final order for state (with isPersisted marks):', {
      //    orderId: syncedOrderForState.id,
      //    tableIds: syncedOrderForState.tableIds,  // ✅ FINAL CHECK: tableIds before setState
      //    tableId: syncedOrderForState.tableId,
      //    notes: syncedOrderForState.notes,  // ✅ FINAL CHECK: notes before setState
      //    notesLength: syncedOrderForState.notes?.length,
      //    totals: syncedOrderForState.totals,
      //    linesCount: syncedOrderForState.lines?.length,
      //    firstLine: syncedOrderForState.lines?.[0],
      //    allLinesMarkedPersisted: syncedOrderForState.lines?.every(l => l.isPersisted === true)
      // });
      const latestSnapshot = getRealtimeOrdersSnapshot();
      const latestOrders = latestSnapshot.active.map(order => ({ ...order }));
      ctx.setState(s => {
        const data = s.data || {};
        const history = Array.isArray(data.ordersHistory) ? data.ordersHistory.slice() : [];
        let seqFromDraft = null;
        if (idChanged && previousOrderId) {
          const draftIndex = history.findIndex(entry => entry && entry.id === previousOrderId);
          if (draftIndex >= 0) {
            seqFromDraft = history[draftIndex].seq || draftIndex + 1;
            history.splice(draftIndex, 1);
          }
        }
        const historyIndex = history.findIndex(entry => entry.id === orderPayload.id);
        const seq = historyIndex >= 0
          ? (history[historyIndex].seq || historyIndex + 1)
          : (seqFromDraft || history.length + 1);
        const historyEntry = { ...syncedOrderForState, seq, payments: mergedPayments.map(pay => ({ ...pay })) };
        if (historyIndex >= 0) {
          history[historyIndex] = historyEntry;
        } else {
          history.push(historyEntry);
        }
        let nextShift = data.shift?.current ? { ...data.shift.current } : null;
        if (nextShift) {
          const summary = summarizeShiftOrders(history, { ...nextShift, orders: Array.isArray(nextShift.orders) ? nextShift.orders.slice() : [] });
          nextShift = {
            ...nextShift,
            totalsByType: summary.totalsByType,
            paymentsByMethod: summary.paymentsByMethod,
            totalSales: summary.totalSales,
            orders: summary.orders,
            countsByType: summary.countsByType,
            ordersCount: summary.ordersCount,
            closingCash: round((nextShift.openingFloat || 0) + (summary.paymentsByMethod.cash || 0))
          };
        }
        const uiBase = s.ui || {};
        const modals = { ...(uiBase.modals || {}) };
        if (openPrint) {
          modals.print = true;
        }
        const nextUi = {
          ...uiBase,
          modals,
          paymentDraft: { ...(uiBase.paymentDraft || {}), amount: '' },
          pendingAction: null
        };
        if (openPrint) {
          //edit2 ticketSnapshot: orderPayload
          nextUi.print = { ...(uiBase.print || {}), docType: data.print?.docType || 'customer', size: data.print?.size || 'thermal_80', ticketSnapshot: orderPayload };
        }

        // ✅ CRITICAL FIX: Update ordersQueue with saved order (preserving tableIds)
        // latestOrders from getRealtimeOrdersSnapshot may be stale (watchers haven't run yet)
        // We must manually update the saved order in ordersQueue to preserve tableIds

        //console.log('🏷️ [TABLE DEBUG] latestOrders from getRealtimeOrdersSnapshot:', {
        //    count: latestOrders.length,
        //    orderIds: latestOrders.map(o => o.id),
        //    targetOrderInSnapshot: latestOrders.find(o => o.id === syncedOrderForState.id)?.tableIds
        // });

        const updatedOrdersQueue = latestOrders.slice();
        const queueIndex = updatedOrdersQueue.findIndex(ord => ord.id === syncedOrderForState.id);
        if (queueIndex >= 0) {
          // Update existing order in queue with fresh data (has tableIds!)
          //console.log('🏷️ [TABLE DEBUG] BEFORE update in ordersQueue:', {
          //    oldTableIds: updatedOrdersQueue[queueIndex].tableIds,
          //    newTableIds: syncedOrderForState.tableIds
          //});
          updatedOrdersQueue[queueIndex] = { ...syncedOrderForState };
          //console.log('✅ [TABLE FIX] Updated order in ordersQueue with tableIds:', syncedOrderForState.tableIds);
        } else if (!finalize) {
          // Add new order to queue (not finalized)
          updatedOrdersQueue.push({ ...syncedOrderForState });
          //console.log('✅ [TABLE FIX] Added new order to ordersQueue with tableIds:', syncedOrderForState.tableIds);
        }

        // ✅ [POS V2] Unlock tables when order is finalized (multi-device sync)
        let tableLockUpdates = idChanged
          ? (data.tableLocks || []).map(lock => lock.orderId === previousOrderId ? { ...lock, orderId: orderPayload.id } : lock)
          : (data.tableLocks || []);

        if (finalize && assignedTables.length > 0) {
          //console.log('[POS V2] 🔓 Finalizing order - unlocking tables:', {
          //    orderId: orderPayload.id,
          //    assignedTables,
          //    beforeLocks: tableLockUpdates.length
          //});

          // Deactivate table locks for this order
          tableLockUpdates = tableLockUpdates.map(lock =>
            lock.orderId === orderPayload.id
              ? { ...lock, active: false }
              : lock
          );

          // Update table_lock in backend via WebSocket (for multi-device sync)
          if (window.__POS_DB__ && typeof window.__POS_DB__.update === 'function') {
            const store = window.__POS_DB__;
            const tableLocksInDatabase = (typeof window !== 'undefined' && window.database && Array.isArray(window.database.table_lock))
              ? window.database.table_lock
              : [];

            tableLockUpdates.forEach(lock => {
              if (lock.orderId === orderPayload.id && !lock.active) {
                // ✅ CRITICAL: Get current lock from database to get latest version
                const existingLock = tableLocksInDatabase.find(l => String(l.id) === String(lock.id));
                const currentVersion = existingLock?.version || lock.version || 1;
                const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

                if (!Number.isFinite(nextVersion) || nextVersion < 1) {
                  console.error('[POS V2] ❌ Cannot update table_lock without valid version!', {
                    lockId: lock.id,
                    currentVersion,
                    nextVersion
                  });
                  return;  // Skip this lock - cannot update without version
                }

                const updatePayload = {
                  ...lock,
                  version: nextVersion  // ✅ REQUIRED: version for optimistic locking
                };

                // Update in backend (will broadcast to all devices)
                store.update('table_lock', updatePayload).catch(err => {
                  //console.warn('[POS V2] Failed to update table_lock in backend:', err);
                });
                //console.log('[POS V2] ✅ Released table lock via WebSocket:', {
                //    lockId: lock.id,
                //    tableId: lock.tableId,
                //    orderId: lock.orderId,
                //    version: `v${currentVersion}→v${nextVersion}`
                //});
              }
            });
          }

          //console.log('[POS V2] 🔓 Tables unlocked:', {
          //    orderId: orderPayload.id,
          //    afterLocks: tableLockUpdates.filter(l => l.active).length
          //});
        }

        const updatedData = {
          ...data,
          tableLocks: tableLockUpdates,
          ordersQueue: updatedOrdersQueue,  // ✅ Use updated queue instead of latestOrders
          ordersHistory: history,
          shift: { ...(data.shift || {}), current: nextShift },
          status: {
            ...data.status,
            indexeddb: { state: 'online', lastSync: now }
          }
        };
        // ✅ CRITICAL: After save/finalize, ALWAYS create new blank order
        // Don't leave saved order in cart - prevents duplicate saves
        // User requirement: "أي عملية حفظ أو انهاء يتبعها clear للأوردر وعمل أوردر جديد"
        // ALWAYS create new order regardless of type (dine_in, delivery, takeaway)
        const shouldCreateNewOrder = true;  // ✅ ALWAYS clear after save/finalize!

        if (shouldCreateNewOrder) {
          const newOrderId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          updatedData.order = {
            id: newOrderId,
            status: 'open',
            fulfillmentStage: 'new',
            paymentState: 'unpaid',
            type: orderType,  // Keep same order type
            tableIds: orderType === 'dine_in' ? [] : [],  // Clear tables for new order
            guests: 0,
            lines: [],
            notes: [],
            discount: null,
            totals: calculateTotals([], data.settings || {}, orderType),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            shiftId: currentShift?.id || null,
            isPersisted: false,
            dirty: false,
            allowAdditions: true,
            paymentsLocked: false
          };
          updatedData.payments = { ...(data.payments || {}), split: [] };
          //console.log('✅ [POS] Created new blank order after save (ALL order types cleared):', {
          //    reason: finalize ? 'finalize' : 'save',
          //    newOrderId,
          //    orderType,
          //    openPrint
          //});
        }
        // ✅ No else case - ALWAYS create new order!
        return {
          ...s,
          data: updatedData,
          ui: nextUi
        };
      });
      await refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
      const toastKey = finalize ? 'order_finalized' : 'order_saved';
      UI.pushToast(ctx, { title: t.toast[toastKey], icon: finalize ? '✅' : '💾' });
      return { status: 'saved', mode };
    } catch (error) {
      UI.pushToast(ctx, { title: t.toast.indexeddb_error, message: String(error), icon: '🛑' });
      ctx.setState(s => ({
        ...s,
        data: {
          ...s.data,
          status: {
            ...s.data.status,
            indexeddb: { state: 'offline', lastSync: s.data.status?.indexeddb?.lastSync || null }
          }
        }
      }));
      return { status: 'error', reason: 'persist', error };
    }
  }

  function statusBadge(db, state, label) {
    const t = getTexts(db);
    const tone = state === 'online' ? 'status/online' : state === 'offline' ? 'status/offline' : 'status/idle';
    const stateText = state === 'online' ? t.ui.status_online : state === 'offline' ? t.ui.status_offline : t.ui.status_idle;
    return UI.Badge({
      variant: 'badge/status',
      attrs: { class: tw`${token(tone)} text-xs` },
      leading: state === 'online' ? '●' : state === 'offline' ? '✖' : '…',
      text: `${label} • ${stateText}`
    });
  }

  function ThemeSwitch(db) {
    const t = getTexts(db);
    return UI.Segmented({
      items: [
        { id: 'light', label: `☀️ ${t.ui.light}`, attrs: { gkey: 'pos:theme:toggle', 'data-theme': 'light' } },
        { id: 'dark', label: `🌙 ${t.ui.dark}`, attrs: { gkey: 'pos:theme:toggle', 'data-theme': 'dark' } }
      ],
      activeId: db.env.theme,
      attrs: { class: tw`hidden xl:inline-flex` }
    });
  }

  function LangSwitch(db) {
    const t = getTexts(db);
    return UI.Segmented({
      items: [
        { id: 'ar', label: t.ui.arabic, attrs: { gkey: 'pos:lang:switch', 'data-lang': 'ar' } },
        { id: 'en', label: t.ui.english, attrs: { gkey: 'pos:lang:switch', 'data-lang': 'en' } }
      ],
      activeId: db.env.lang
    });
  }

  function ShiftControls(db) {
    const t = getTexts(db);
    const shiftState = db.data.shift || {};
    const current = shiftState.current;
    const historyCount = Array.isArray(shiftState.history) ? shiftState.history.length : 0;
    if (current) {
      const summaryButton = UI.Button({
        attrs: { gkey: 'pos:shift:summary', class: tw`rounded-full`, title: `${t.ui.shift_current}: ${current.id}` },
        variant: 'soft',
        size: 'sm'
      }, [t.ui.shift_close_button]);
      const idBadge = UI.Badge({
        text: current.id,
        variant: 'badge/ghost',
        attrs: { class: tw`hidden sm:inline-flex text-xs` }
      });
      return UI.HStack({ attrs: { class: tw`items-center gap-2` } }, [summaryButton, idBadge]);
    }
    const openButton = UI.Button({ attrs: { gkey: 'pos:shift:open', class: tw`rounded-full` }, variant: 'solid', size: 'sm' }, [t.ui.shift_open_button]);
    if (historyCount) {
      const historyButton = UI.Button({
        attrs: { gkey: 'pos:shift:summary', class: tw`rounded-full`, title: t.ui.shift_history },
        variant: 'ghost',
        size: 'sm'
      }, [t.ui.shift_history]);
      return UI.HStack({ attrs: { class: tw`items-center gap-2` } }, [openButton, historyButton]);
    }
    return openButton;
  }

  function Header(db) {
    const t = getTexts(db);
    const user = db.data.user;
    const orderType = getOrderTypeConfig(db.data.order.type);
    return UI.Toolbar({
      left: [
        D.Text.Span({ attrs: { class: tw`text-2xl font-black tracking-tight` } }, ['Mishkah POS']),
        UI.Badge({ text: `${orderType.icon} ${localize(orderType.label, db.env.lang)}`, variant: 'badge/ghost', attrs: { class: tw`text-sm` } })
      ],
      right: [
        UI.Button({ attrs: { gkey: 'pos:settings:open', title: t.ui.settings_center }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['⚙️'])]),
        ShiftControls(db),
        ThemeSwitch(db),
        LangSwitch(db),
        UI.Button({ attrs: { gkey: 'pos:tables:open', title: t.ui.tables }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['🪑'])]),
        UI.Button({ attrs: { gkey: 'pos:reservations:open', title: t.ui.reservations }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['📅'])]),
        UI.Button({ attrs: { gkey: 'pos:orders:open', title: t.ui.orders_queue }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['🧾'])]),
        UI.Badge({ text: `${t.ui.cashier}: ${user.name}`, leading: '👤', variant: 'badge/ghost' }),
        UI.Button({ attrs: { gkey: 'pos:session:logout', title: 'Logout' }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['🚪'])])
      ]
    });
  }

  function MenuItemCard(db, item) {
    const lang = db.env.lang;
    const menu = db.data.menu;
    const isFav = (menu.favorites || []).includes(String(item.id));
    return D.Containers.Div({
      attrs: {
        class: tw`relative flex flex-col gap-2 rounded-3xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-[var(--foreground)] transition hover:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]`,
        gkey: 'pos:menu:add',
        'data-item-id': item.id,
        role: 'button',
        tabindex: '0'
      }
    }, [
      UI.Button({
        attrs: {
          gkey: 'pos:menu:favorite',
          'data-item-id': item.id,
          class: tw`absolute top-2 ${db.env.dir === 'rtl' ? 'left-2' : 'right-2'} rounded-full`
        },
        variant: isFav ? 'solid' : 'ghost',
        size: 'sm'
      }, [isFav ? '★' : '☆']),
      D.Containers.Div({ attrs: { class: tw`h-24 overflow-hidden rounded-2xl bg-[var(--surface-2)]` } }, [
        item.image
          ? D.Media.Img({ attrs: { src: item.image, alt: localize(item.name, lang), class: tw`h-full w-full object-cover scale-[1.05]` } })
          : D.Containers.Div({ attrs: { class: tw`grid h-full place-items-center text-3xl` } }, ['🍽️'])
      ]),
      D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
        D.Text.Strong({ attrs: { class: tw`text-sm font-semibold leading-tight` } }, [localize(item.name, lang)]),
        localize(item.description, lang)
          ? D.Text.P({ attrs: { class: tw`text-xs ${token('muted')} line-clamp-2` } }, [localize(item.description, lang)])
          : null
      ].filter(Boolean)),
      D.Containers.Div({ attrs: { class: tw`mt-auto flex items-center justify-between text-sm` } }, [
        UI.PriceText({ amount: item.price, currency: getCurrency(db), locale: getLocale(db) }),
        D.Text.Span({ attrs: { class: tw`text-xl font-semibold text-[var(--primary)]` } }, ['+'])
      ])
    ]);
  }

  function LoadingSpinner(extraAttrs) {
    const extraClass = extraAttrs && extraAttrs.class ? extraAttrs.class : '';
    const attrs = Object.assign({}, extraAttrs || {});
    attrs.class = tw`${extraClass} h-3 w-3 animate-spin rounded-full border-2 border-[color-mix(in_oklab,var(--primary)75%,transparent)] border-t-transparent`;
    attrs['aria-hidden'] = attrs['aria-hidden'] || 'true';
    return D.Containers.Div({ attrs });
  }

  function MenuSkeletonGrid(count) {
    const total = Number.isFinite(count) && count > 0 ? count : 8;
    const cards = Array.from({ length: total }).map((_, idx) => D.Containers.Div({
      attrs: {
        key: `menu-skeleton-${idx}`,
        class: tw`flex animate-pulse flex-col gap-2 rounded-3xl border border-dashed border-[color-mix(in_oklab,var(--border)70%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)94%,transparent)] p-3`
      }
    }, [
      D.Containers.Div({ attrs: { class: tw`h-24 w-full rounded-2xl bg-[color-mix(in_oklab,var(--surface-2)90%,transparent)]` } }),
      D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        D.Containers.Div({ attrs: { class: tw`h-3 w-3/4 rounded-full bg-[color-mix(in_oklab,var(--surface-2)88%,transparent)]` } }),
        D.Containers.Div({ attrs: { class: tw`h-3 w-full rounded-full bg-[color-mix(in_oklab,var(--surface-2)82%,transparent)]` } })
      ]),
      D.Containers.Div({ attrs: { class: tw`mt-auto h-3 w-1/2 rounded-full bg-[color-mix(in_oklab,var(--surface-2)84%,transparent)]` } })
    ]));
    return D.Containers.Div({ attrs: { class: tw`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3` } }, cards);
  }

  function MenuColumn(db) {
    const t = getTexts(db);
    const lang = db.env.lang;
    const menu = db.data.menu;
    const remote = db.data.remotes?.posDatabase || {};
    const remoteStatus = remote.status || 'idle';
    const isLoadingRemote = remoteStatus === 'loading';
    const hasRemoteError = remoteStatus === 'error';
    const remoteUpdatedAt = remote.finishedAt || null;
    const remoteErrorMessage = remote.error || null;
    const filtered = filterMenu(menu, lang);
    const categories = Array.isArray(menu.categories) ? menu.categories : [];
    const seenCategories = new Set();
    const chips = categories.reduce((acc, cat) => {
      if (!cat || !cat.id || seenCategories.has(cat.id)) return acc;
      seenCategories.add(cat.id);
      acc.push({
        id: cat.id,
        label: localize(cat.label, lang),
        attrs: { gkey: 'pos:menu:category', 'data-category-id': cat.id }
      });
      return acc;
    }, []).sort((a, b) => (a.id === 'all' ? -1 : b.id === 'all' ? 1 : 0));
    const remoteStatusText = isLoadingRemote
      ? t.ui.menu_loading_hint
      : hasRemoteError
        ? (remoteErrorMessage ? `${t.ui.menu_load_error}: ${remoteErrorMessage}` : t.ui.menu_load_error)
        : remoteUpdatedAt
          ? `${t.ui.menu_last_updated}: ${formatSync(remoteUpdatedAt, lang) || '—'}`
          : t.ui.menu_load_success;
    const lastSyncLabel = `${t.ui.last_sync}: ${formatSync(db.data.status.indexeddb.lastSync, lang) || t.ui.never_synced}`;
    return D.Containers.Section({ attrs: { class: tw`flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden` } }, [
      UI.Card({
        variant: 'card/soft-1',
        content: D.Containers.Div({ attrs: { class: tw`flex flex-col gap-3` } }, [
          UI.SearchBar({
            value: menu.search,
            placeholder: t.ui.search,
            onInput: 'pos:menu:search',
            trailing: [
              UI.Button({
                attrs: {
                  gkey: 'pos:menu:favorites-only',
                  class: tw`rounded-full ${menu.showFavoritesOnly ? 'bg-[var(--primary)] text-white' : ''}`
                },
                variant: menu.showFavoritesOnly ? 'solid' : 'ghost',
                size: 'sm'
              }, ['⭐'])
            ]
          }),
          UI.ChipGroup({ items: chips, activeId: menu.category })
        ])
      }),
      D.Containers.Section({ attrs: { class: tw`${token('scroll-panel')} flex-1 min-h-0 w-full overflow-hidden` } }, [
        D.Containers.Div({ attrs: { class: tw`${token('scroll-panel/head')} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` } }, [
          D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
            D.Text.Strong({}, [t.ui.categories]),
            isLoadingRemote ? LoadingSpinner({ title: t.ui.menu_loading }) : null,
            hasRemoteError ? UI.Badge({ variant: 'badge/status', attrs: { class: tw`${token('status/offline')} text-xs` } }, [`⚠️ ${t.ui.menu_load_error_short}`]) : null
          ].filter(Boolean)),
          D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
            UI.Button({ attrs: { gkey: 'pos:menu:load-more' }, variant: 'ghost', size: 'sm' }, [t.ui.load_more])
          ])
        ]),
        UI.ScrollArea({
          attrs: { class: tw`${token('scroll-panel/body')} h-full w-full px-3 pb-3`, 'data-menu-scroll': 'true' },
          children: [
            isLoadingRemote
              ? MenuSkeletonGrid(8)
              : filtered.length
                ? D.Containers.Div({ attrs: { class: tw`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3` } }, filtered.map(item => MenuItemCard(db, item)))
                : UI.EmptyState({ icon: '🍽️', title: t.ui.cart_empty, description: t.ui.choose_items })
          ]
        }),
        D.Containers.Div({ attrs: { class: tw`${token('scroll-panel/footer')} flex flex-wrap items-center justify-between gap-3` } }, [
          D.Containers.Div({ attrs: { class: tw`flex flex-wrap items-center gap-2` } }, [
            statusBadge(db, remoteStatus === 'ready' ? 'online' : hasRemoteError ? 'offline' : 'idle', t.ui.menu_live_badge),
            statusBadge(db, db.data.status.indexeddb.state, t.ui.indexeddb)
          ].filter(Boolean)),
          D.Containers.Div({ attrs: { class: tw`flex flex-wrap items-center gap-3` } }, [
            D.Containers.Div({ attrs: { class: tw`text-xs ${token('muted')} flex flex-col sm:flex-row sm:items-center sm:gap-3` } }, [
              D.Text.Span({}, [remoteStatusText]),
              D.Text.Span({}, [lastSyncLabel])
            ]),
            UI.Button({ attrs: { gkey: 'pos:indexeddb:sync' }, variant: 'ghost', size: 'sm' }, [t.ui.sync_now])
          ])
        ])
      ])
    ]);
  }

  function OrderLine(db, line) {
    const t = getTexts(db);
    const lang = db.env.lang;
    const order = db.data.order || {};
    const isLocked = line.locked || (order.isPersisted && order.lockLineEdits) || (line.status && line.status !== 'draft');
    const modifiers = Array.isArray(line.modifiers) ? line.modifiers : [];
    const notes = notesToText(line.notes);
    const discountInfo = normalizeDiscount(line.discount);
    const discountLabel = discountInfo
      ? (discountInfo.type === 'percent'
        ? `${discountInfo.value}%`
        : `− ${formatCurrencyValue(db, discountInfo.value)}`)
      : '';
    const discountRow = discountInfo
      ? D.Text.Span({ attrs: { class: tw`text-[10px] sm:text-xs ${token('muted')}` } }, [`${t.ui.discount_action}: ${discountLabel}`])
      : null;
    const modifiersRow = modifiers.length
      ? D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2 text-[10px] sm:text-xs text-[var(--muted-foreground)]` } }, modifiers.map(mod => {
        const delta = Number(mod.priceChange || mod.price_change || 0) || 0;
        const priceLabel = delta ? `${delta > 0 ? '+' : '−'} ${formatCurrencyValue(db, Math.abs(delta))}` : '';
        return D.Containers.Div({ attrs: { class: tw`rounded-full bg-[color-mix(in oklab,var(--surface-2) 92%, transparent)] px-2 py-1` } }, [
          `${localize(mod.label, lang)}${priceLabel ? ` (${priceLabel})` : ''}`
        ]);
      }))
      : null;
    const notesRow = notes
      ? D.Text.Span({ attrs: { class: tw`text-[10px] sm:text-xs ${token('muted')}` } }, ['📝 ', notes])
      : null;
    const editButtons = isLocked
      ? [
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')} px-2` } }, ['🔒'])
      ]
      : [
        UI.QtyStepper({ value: line.qty, gkeyDec: 'pos:order:line:dec', gkeyInc: 'pos:order:line:inc', gkeyEdit: 'pos:order:line:qty', dataId: line.id }),
        UI.Button({
          attrs: {
            gkey: 'pos:order:line:modifiers',
            'data-line-id': line.id,
            title: t.ui.line_modifiers
          },
          variant: 'ghost',
          size: 'sm'
        }, [D.Text.Span({ attrs: { class: tw`text-lg` } }, ['➕/➖'])]),
        UI.Button({
          attrs: {
            gkey: 'pos:order:line:note',
            'data-line-id': line.id,
            title: t.ui.notes
          },
          variant: 'ghost',
          size: 'sm'
        }, [D.Text.Span({ attrs: { class: tw`text-lg` } }, ['📝'])]),
        UI.Button({
          attrs: {
            gkey: 'pos:order:line:discount',
            'data-line-id': line.id,
            title: t.ui.discount_action
          },
          variant: 'ghost',
          size: 'sm'
        }, [D.Text.Span({ attrs: { class: tw`text-lg` } }, ['٪'])])
      ];
    return UI.ListItem({
      leading: D.Text.Span({ attrs: { class: tw`text-lg` } }, ['🍲']),
      content: [
        D.Text.Strong({}, [localize(line.name, lang)]),
        modifiersRow,
        notesRow,
        discountRow
      ].filter(Boolean),
      trailing: [
        UI.PriceText({ amount: line.total, currency: getCurrency(db), locale: getLocale(db) }),
        ...editButtons
      ]
    });
  }

  function TotalsSection(db) {
    const t = getTexts(db);
    const totals = db.data.order.totals || {};
    const paymentsEntries = getActivePaymentEntries(db.data.order, db.data.payments);
    const paymentSnapshot = summarizePayments(totals, paymentsEntries);
    const totalPaid = paymentSnapshot.paid;
    const remaining = paymentSnapshot.remaining;
    const rows = [
      { label: t.ui.subtotal, value: totals.subtotal },
      { label: t.ui.service, value: totals.service },
      { label: t.ui.vat, value: totals.vat },
      totals.deliveryFee ? { label: t.ui.delivery_fee, value: totals.deliveryFee } : null,
      totals.discount ? { label: t.ui.discount, value: totals.discount } : null
    ].filter(Boolean);
    const summaryRows = [
      paymentsEntries.length ? UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Text.Span({}, [t.ui.paid]),
        UI.PriceText({ amount: totalPaid, currency: getCurrency(db), locale: getLocale(db) })
      ]) : null,
      UI.HStack({ attrs: { class: tw`${token('split')} text-sm font-semibold ${remaining > 0 ? 'text-[var(--accent-foreground)]' : ''}` } }, [
        D.Text.Span({}, [t.ui.balance_due]),
        UI.PriceText({ amount: remaining, currency: getCurrency(db), locale: getLocale(db) })
      ])
    ].filter(Boolean);
    return D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
      ...rows.map(row => UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Text.Span({ attrs: { class: tw`${token('muted')}` } }, [row.label]),
        UI.PriceText({ amount: row.value, currency: getCurrency(db), locale: getLocale(db) })
      ])),
      UI.Divider(),
      UI.HStack({ attrs: { class: tw`${token('split')} text-lg font-semibold` } }, [
        D.Text.Span({}, [t.ui.total]),
        UI.PriceText({ amount: totals.due, currency: getCurrency(db), locale: getLocale(db) })
      ]),
      ...summaryRows
    ]);
  }

  function CartFooter(db) {
    const t = getTexts(db);
    const order = db.data.order || {};
    const orderNotes = notesToText(order.notes);
    const orderNotesSection = orderNotes
      ? D.Containers.Div({ attrs: { class: tw`text-xs ${token('muted')} border-t border-[var(--border)] pt-2 mt-1` } }, [
        D.Text.Span({ attrs: { class: tw`font-semibold` } }, ['📝 ملاحظات الطلب: ']),
        D.Text.Span({}, [orderNotes])
      ])
      : null;
    return D.Containers.Div({ attrs: { class: tw`shrink-0 border-t border-[var(--border)] bg-[color-mix(in oklab,var(--surface-1) 90%, transparent)] px-4 py-3 rounded-[var(--radius)] shadow-[var(--shadow)] flex flex-col gap-3` } }, [
      TotalsSection(db),
      orderNotesSection,
      UI.HStack({ attrs: { class: tw`gap-2` } }, [
        UI.Button({ attrs: { gkey: 'pos:order:discount', class: tw`flex-1` }, variant: 'ghost', size: 'sm' }, [t.ui.discount_action]),
        UI.Button({ attrs: { gkey: 'pos:order:note', class: tw`flex-1` }, variant: 'ghost', size: 'sm' }, [t.ui.notes])
      ])
    ].filter(Boolean));
  }

  function computeTableRuntime(db) {
    const tables = db.data.tables || [];
    const locks = (db.data.tableLocks || []).filter(lock => lock.active !== false);
    const reservations = db.data.reservations || [];
    const currentOrderId = db.data.order?.id;
    return tables.map(table => {
      const activeLocks = locks.filter(lock => lock.tableId === table.id);
      const orderLocks = activeLocks.filter(lock => lock.orderId);
      const reservationLocks = activeLocks.filter(lock => lock.reservationId);
      const lockState = table.state !== 'active'
        ? table.state
        : activeLocks.length === 0
          ? 'free'
          : activeLocks.length === 1
            ? 'single'
            : 'multi';
      const reservationRefs = reservationLocks.map(lock => reservations.find(res => res.id === lock.reservationId)).filter(Boolean);
      return {
        ...table,
        lockState,
        activeLocks,
        orderLocks,
        reservationLocks,
        reservationRefs,
        isCurrentOrder: orderLocks.some(lock => lock.orderId === currentOrderId)
      };
    });
  }

  function computeGuestsForTables(tableIds, tables) {
    if (!Array.isArray(tableIds) || !tableIds.length) return 0;
    const lookup = new Map((tables || []).map(table => [String(table.id), table]));
    return tableIds.reduce((sum, id) => {
      const table = lookup.get(String(id));
      const capacity = Number(table?.capacity);
      return Number.isFinite(capacity) ? sum + Math.max(0, capacity) : sum;
    }, 0);
  }

  function getDisplayOrderId(order, t) {
    if (!order || !order.id) {
      return t?.ui?.order_id_pending || '—';
    }
    const id = String(order.id);
    if (id.startsWith('draft-')) {
      return t?.ui?.order_id_pending || '—';
    }
    return id;
  }

  function tableStateLabel(t, runtime) {
    if (runtime.state === 'disactive') return t.ui.tables_state_disactive;
    if (runtime.state === 'maintenance') return t.ui.tables_state_maintenance;
    if (runtime.lockState === 'free') return t.ui.tables_state_free;
    if (runtime.lockState === 'single') return t.ui.tables_state_single;
    if (runtime.lockState === 'multi') return t.ui.tables_state_multi;
    return t.ui.tables_state_active;
  }

  function tablePalette(runtime) {
    if (runtime.state === 'disactive') return 'border-zinc-700 bg-zinc-800/40 text-zinc-400';
    if (runtime.state === 'maintenance') return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    if (runtime.lockState === 'free') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    if (runtime.lockState === 'single') return 'border-sky-500/40 bg-sky-500/10 text-sky-400';
    if (runtime.lockState === 'multi') return 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400';
    return 'border-[var(--border)] bg-[var(--surface-1)]';
  }

  function PaymentSummary(db) {
    const t = getTexts(db);
    const split = getActivePaymentEntries(db.data.order, db.data.payments);
    const methods = (db.data.payments?.methods && db.data.payments.methods.length)
      ? db.data.payments.methods
      : PAYMENT_METHODS;
    const totals = db.data.order.totals || {};
    const snapshot = summarizePayments(totals, split);
    const totalPaid = snapshot.paid;
    const remaining = snapshot.remaining;
    const change = Math.max(0, round(snapshot.paid - snapshot.due));
    const paymentStateId = db.data.order?.paymentState || 'unpaid';
    const paymentState = db.data.orderPaymentStates?.find(state => state.id === paymentStateId);
    const paymentStateLabel = paymentState ? localize(paymentState.name, db.env.lang) : paymentStateId;
    const paymentsLocked = isPaymentsLocked(db.data.order);
    const returnOptions = db.data.order?.isPersisted
      ? calculateReturnOptions(db.data.order)
      : [];
    const allowReturns = getOrderTypeConfig(db.data.order?.type || 'dine_in').allowsReturns !== false;
    const showReturnButton = allowReturns
      && db.data.order?.isPersisted
      && (db.data.order?.fulfillmentStage && db.data.order.fulfillmentStage !== 'new')
      && returnOptions.length > 0;
    const balanceSummary = remaining > 0 || change > 0
      ? D.Containers.Div({ attrs: { class: tw`space-y-2 rounded-[var(--radius)] bg-[color-mix(in oklab,var(--surface-2) 92%, transparent)] px-3 py-2 text-sm` } }, [
        remaining > 0 ? UI.HStack({ attrs: { class: tw`${token('split')} font-semibold text-[var(--accent-foreground)]` } }, [
          D.Text.Span({}, [t.ui.balance_due]),
          UI.PriceText({ amount: remaining, currency: getCurrency(db), locale: getLocale(db) })
        ]) : null,
        change > 0 ? UI.HStack({ attrs: { class: tw`${token('split')} text-[var(--muted-foreground)]` } }, [
          D.Text.Span({}, [t.ui.exchange_due]),
          UI.PriceText({ amount: change, currency: getCurrency(db), locale: getLocale(db) })
        ]) : null
      ].filter(Boolean))
      : null;
    return UI.Card({
      variant: 'card/soft-1',
      title: t.ui.split_payments,
      content: D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        UI.Badge({ text: paymentStateLabel, variant: 'badge/ghost' }),
        balanceSummary,
        ...split.map(entry => {
          const method = methods.find(m => m.id === entry.method);
          const label = method ? `${method.icon} ${localize(method.label, db.env.lang)}` : entry.method;
          const deleteButton = !paymentsLocked
            ? UI.Button({
              attrs: {
                gkey: 'pos:payments:delete',
                'data-payment-id': entry.id,
                class: tw`h-7 w-7 rounded-full border border-transparent text-xs`
              },
              variant: 'ghost',
              size: 'xs'
            }, ['🗑️'])
            : null;
          return UI.HStack({ attrs: { class: tw`${token('split')} items-center justify-between gap-2 text-sm` } }, [
            D.Text.Span({}, [label]),
            UI.HStack({ attrs: { class: tw`items-center gap-2` } }, [
              UI.PriceText({ amount: entry.amount, currency: getCurrency(db), locale: getLocale(db) }),
              deleteButton
            ].filter(Boolean))
          ]);
        }),
        split.length ? UI.Divider() : null,
        UI.HStack({ attrs: { class: tw`${token('split')} text-sm font-semibold` } }, [
          D.Text.Span({}, [t.ui.paid]),
          UI.PriceText({ amount: totalPaid, currency: getCurrency(db), locale: getLocale(db) })
        ]),
        UI.Button({ attrs: { gkey: 'pos:payments:open', class: tw`w-full flex items-center justify-center gap-2` }, variant: 'soft', size: 'sm' }, [
          D.Text.Span({ attrs: { class: tw`text-lg` } }, ['💳']),
          D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.open_payments])
        ]),
        showReturnButton
          ? UI.Button({ attrs: { gkey: 'pos:returns:open', class: tw`w-full flex items-center justify-center gap-2` }, variant: 'ghost', size: 'sm' }, [
            D.Text.Span({ attrs: { class: tw`text-lg` } }, ['↩️']),
            D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.returns || 'المرتجعات'])
          ])
          : null
      ].filter(Boolean))
    });
  }

  function OrderNavigator(db) {
    const t = getTexts(db);
    const history = Array.isArray(db.data.ordersHistory) ? db.data.ordersHistory : [];
    if (!history.length) return UI.Card({ variant: 'card/soft-1', content: UI.EmptyState({ icon: '🧾', title: t.ui.order_nav_label, description: t.ui.order_nav_no_history }) });
    const currentId = db.data.order?.id;
    const currentIndex = history.findIndex(entry => entry.id === currentId);
    const total = history.length;
    const currentSeq = currentIndex >= 0 ? (history[currentIndex].seq || currentIndex + 1) : null;
    const label = currentSeq ? `#${currentSeq} / ${total}` : `— / ${total}`;
    const disablePrev = currentIndex <= 0;
    const disableNext = currentIndex < 0 || currentIndex >= total - 1;
    const quickActions = UI.HStack({ attrs: { class: tw`items-center justify-between gap-3` } }, [
      D.Text.Strong({ attrs: { class: tw`text-sm` } }, [t.ui.order_nav_label]),
      D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [`${t.ui.order_nav_total}: ${total}`])
    ]);
    const navigatorRow = UI.HStack({ attrs: { class: tw`flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm` } }, [
      UI.Button({ attrs: { gkey: 'pos:order:new', title: t.ui.new_order, class: tw`h-12 w-12 rounded-full text-xl` }, variant: 'soft', size: 'md' }, ['🆕']),
      UI.Button({ attrs: { gkey: 'pos:order:nav:prev', disabled: disablePrev, class: tw`h-12 w-12 rounded-full text-lg` }, variant: 'soft', size: 'md' }, ['⬅️']),
      D.Text.Span({ attrs: { class: tw`text-base font-semibold` } }, [label]),
      UI.Button({ attrs: { gkey: 'pos:order:nav:pad', class: tw`h-12 w-12 rounded-full text-lg` }, variant: 'soft', size: 'md' }, ['🔢']),
      UI.Button({ attrs: { gkey: 'pos:order:nav:next', disabled: disableNext, class: tw`h-12 w-12 rounded-full text-lg` }, variant: 'soft', size: 'md' }, ['➡️']),
      UI.Button({ attrs: { gkey: 'pos:order:clear', title: t.ui.clear, class: tw`h-12 w-12 rounded-full text-xl` }, variant: 'ghost', size: 'md' }, ['🧹'])
    ]);
    const padVisible = !!db.ui.orderNav?.showPad;
    const padValue = db.ui.orderNav?.value || '';
    const pad = padVisible
      ? UI.Card({
        variant: 'card/soft-2',
        title: t.ui.order_nav_open,
        content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
          UI.NumpadDecimal({
            value: padValue,
            placeholder: t.ui.order_nav_placeholder,
            gkey: 'pos:order:nav:input',
            allowDecimal: false,
            confirmLabel: t.ui.order_nav_open,
            confirmAttrs: { gkey: 'pos:order:nav:confirm', variant: 'solid', size: 'sm', class: tw`w-full` }
          }),
          UI.Button({ attrs: { gkey: 'pos:order:nav:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
        ])
      })
      : null;
    return D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [quickActions, navigatorRow, pad].filter(Boolean));
  }

  function OrderCustomerPanel(db) {
    const t = getTexts(db);
    const order = db.data.order || {};
    const customers = db.data.customers || [];
    const customer = findCustomer(customers, order.customerId);
    const address = customer ? findCustomerAddress(customer, order.customerAddressId) : null;
    const phone = (order.customerPhone || (customer?.phones?.[0] || '')).trim();
    const areaLabel = address ? getDistrictLabel(address.areaId, db.env.lang) : (order.customerAreaId ? getDistrictLabel(order.customerAreaId, db.env.lang) : '');
    const summaryParts = [];
    if (address?.title) summaryParts.push(address.title);
    if (areaLabel) summaryParts.push(areaLabel);
    if (address?.line) summaryParts.push(address.line);
    const summary = summaryParts.join(' • ');
    const requiresAddress = order.type === 'delivery';
    const missing = requiresAddress && (!customer || !address);
    const nameLabel = order.customerName || customer?.name || t.ui.customer_new;
    return D.Containers.Div({ attrs: { class: tw`flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[color-mix(in oklab,var(--surface-1) 92%, transparent)] p-3` } }, [
      D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2` } }, [
        D.Text.Strong({ attrs: { class: tw`text-sm` } }, [nameLabel]),
        UI.Button({ attrs: { gkey: 'pos:customer:open', class: tw`h-9 rounded-full px-3 text-sm` }, variant: 'soft', size: 'sm' }, ['👤 ', t.ui.customer_attach])
      ]),
      phone ? D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`📞 ${phone}`]) : null,
      summary ? D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`📍 ${summary}`]) : null,
      missing ? UI.Badge({ text: t.ui.customer_required_delivery, variant: 'badge' }) : null
    ].filter(Boolean));
  }

  function OrderColumn(db) {
    const t = getTexts(db);
    const order = db.data.order;
    const orderNumberLabel = getDisplayOrderId(order, t);
    const assignedTables = (order.tableIds || []).map(tableId => {
      const table = (db.data.tables || []).find(tbl => tbl.id === tableId);
      return { id: tableId, name: table?.name || tableId };
    });
    const serviceSegments = ORDER_TYPES.map(type => ({
      id: type.id,
      label: `${type.icon} ${localize(type.label, db.env.lang)}`,
      attrs: {
        gkey: 'pos:order:type',
        'data-order-type': type.id,
        // ✅ Disable type change for persisted orders
        disabled: order.isPersisted ? true : undefined
      }
    }));

    // ✅ CRITICAL FIX: Show order type as read-only badge for persisted orders
    const orderTypeDisplay = order.isPersisted
      ? D.Containers.Div({ attrs: { class: tw`flex items-center gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-4 py-2` } }, [
        D.Text.Span({ attrs: { class: tw`text-sm` } }, [
          ORDER_TYPES.find(t => t.id === order.type)?.icon || '🍽️',
          ' ',
          localize(ORDER_TYPES.find(t => t.id === order.type)?.label || { ar: 'صالة', en: 'Dine-in' }, db.env.lang)
        ]),
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, ['🔒'])
      ])
      : UI.Segmented({ items: serviceSegments, activeId: order.type });

    return D.Containers.Section({ attrs: { class: tw`flex h-full min-h-0 w-full flex-col overflow-hidden` } }, [
      UI.ScrollArea({
        attrs: { class: tw`flex-1 min-h-0 w-full` },
        children: [
          D.Containers.Div({ attrs: { class: tw`flex flex-col gap-3 pe-1 pb-4` } }, [
            UI.Card({
              variant: 'card/soft-1',
              content: D.Containers.Div({ attrs: { class: tw`flex h-full min-h-0 flex-col gap-3` } }, [
                orderTypeDisplay,
                D.Containers.Div({ attrs: { class: tw`flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm ${token('muted')}` } }, [
                  D.Text.Span({}, [`${t.ui.order_id} ${orderNumberLabel}`]),
                  order.type === 'dine_in'
                    ? D.Containers.Div({ attrs: { class: tw`flex flex-1 flex-wrap items-center gap-2` } }, [
                      assignedTables.length
                        ? D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2` } }, assignedTables.map(table =>
                          UI.Button({
                            attrs: {
                              gkey: 'pos:order:table:remove',
                              'data-table-id': table.id,
                              class: tw`h-8 rounded-full bg-[var(--accent)] px-3 text-xs sm:text-sm flex items-center gap-2`
                            },
                            variant: 'ghost',
                            size: 'sm'
                          }, [`🪑 ${table.name}`, '✕'])
                        ))
                        : D.Text.Span({ attrs: { class: tw`${token('muted')}` } }, [t.ui.select_table]),
                      UI.Button({ attrs: { gkey: 'pos:tables:open', class: tw`h-8 w-8 rounded-full border border-dashed border-[var(--border)]` }, variant: 'ghost', size: 'sm' }, ['＋'])
                    ])
                    : D.Text.Span({}, [localize(getOrderTypeConfig(order.type).label, db.env.lang)]),
                  order.type === 'dine_in' && (order.guests || 0) > 0
                    ? D.Text.Span({}, [`${t.ui.guests}: ${order.guests}`])
                    : null
                ]),
                D.Containers.Div({ attrs: { class: tw`flex-1 min-h-0 w-full` } }, [
                  UI.ScrollArea({
                    attrs: { class: tw`h-full min-h-0 w-full flex-1` },
                    children: [
                      order.lines && order.lines.length
                        ? UI.List({ children: order.lines.filter(line => line && Number(line.total || 0) !== 0).map(line => OrderLine(db, line)) })
                        : UI.EmptyState({ icon: '🧺', title: t.ui.cart_empty, description: t.ui.choose_items })
                    ]
                  })
                ]),
                CartFooter(db)
              ])
            }),
            PaymentSummary(db),
            OrderCustomerPanel(db),
            OrderNavigator(db)
          ])
        ]
      })
    ]);
  }

  function FooterBar(db) {
    const t = getTexts(db);
    const order = db.data.order || {};
    const orderType = order.type || 'dine_in';
    const isTakeaway = orderType === 'takeaway';
    const isDelivery = orderType === 'delivery';
    const isDineIn = orderType === 'dine_in';
    const isFinalized = order.status === 'finalized' || order.status === 'closed';
    const deliveredStage = order.fulfillmentStage === 'delivered' || order.fulfillmentStage === 'closed';
    const paymentEntries = getActivePaymentEntries(order, db.data.payments);
    const paymentSnapshot = summarizePayments(order.totals || {}, paymentEntries);
    const outstanding = paymentSnapshot.remaining || 0;
    // ✅ Check if order has valid lines (prevent saving empty orders)
    const validLines = (order.lines || []).filter(line => {
      const notCancelled = !line.cancelled && !line.voided;
      const hasQuantity = Number(line.qty || line.quantity || 0) > 0;
      return notCancelled && hasQuantity;
    });
    const hasValidLines = validLines.length > 0;
    // ✅ FIXED: For takeaway - HIDE save button completely (one-shot: finalize-print only)
    // Takeaway workflow: Add items → Finish & Print (with auto payment modal) → Done
    // No need for intermediate "save draft" step
    const saveDisabled = isTakeaway && outstanding > 0.0001;
    const finishDisabled = false; // Finish button always enabled - it will open payment modal if needed
    const canShowSave = !isFinalized && !deliveredStage && hasValidLines && !isTakeaway; // ✅ HIDE save in takeaway
    const canShowFinish = !isFinalized && (!isDelivery || !deliveredStage) && hasValidLines; // ✅ Only show if has valid lines
    const finishMode = isTakeaway ? 'finalize-print' : 'finalize';
    const finishLabel = isTakeaway ? t.ui.finish_and_print : t.ui.finish_order;
    const showPrintButton = order.isPersisted && order.id && !order.id.startsWith('draft-'); // ✅ FIXED: Show print for all saved orders with real ID
    const saveLabel = t.ui.save_order;
    const primaryActions = [];
    primaryActions.push(UI.Button({ attrs: { gkey: 'pos:order:new', class: tw`min-w-[120px] flex items-center justify-center gap-2` }, variant: 'ghost', size: 'md' }, [
      D.Text.Span({ attrs: { class: tw`text-lg` } }, ['🆕']),
      D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.new_order])
    ]));
    if (canShowSave) {
      const saveAttrs = {
        gkey: 'pos:order:save',
        'data-save-mode': 'save',  // ✅ Changed from 'draft' - all saves go to server
        class: tw`min-w-[160px] flex items-center justify-center gap-2 ${(saveDisabled || db.ui?.saving) ? 'opacity-50 cursor-not-allowed' : ''}`
      };
      if (saveDisabled || db.ui?.saving) {
        saveAttrs.disabled = 'disabled';
        saveAttrs.title = saveDisabled ? t.ui.balance_due : undefined;
      }
      const saveButton = UI.Button({
        attrs: saveAttrs,
        variant: 'solid',
        size: 'md'
      }, [D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [saveLabel])]);
      primaryActions.push(saveButton);
    }
    if (canShowFinish) {
      const finishAttrs = {
        gkey: 'pos:order:save',
        'data-save-mode': finishMode,
        class: tw`min-w-[180px] flex items-center justify-center gap-2 ${(finishDisabled || db.ui?.saving) ? 'opacity-50 cursor-not-allowed' : ''}`
      };
      if (finishDisabled || db.ui?.saving) {
        finishAttrs.disabled = 'disabled';
        finishAttrs.title = finishDisabled ? t.ui.balance_due : undefined;
      }
      primaryActions.push(UI.Button({
        attrs: finishAttrs,
        variant: 'solid',
        size: 'md'
      }, [D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [finishLabel])]));
    }
    if (showPrintButton) {
      primaryActions.push(UI.Button({ attrs: { gkey: 'pos:order:print', class: tw`min-w-[150px] flex items-center justify-center gap-2` }, variant: 'soft', size: 'md' }, [
        D.Text.Span({ attrs: { class: tw`text-lg` } }, ['🖨️']),
        D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.print])
      ]));
    }
    return UI.Footerbar({
      left: [
        statusBadge(db, db.data.status.kds.state, t.ui.kds),
        statusBadge(db, db.data.status.indexeddb.state, t.ui.indexeddb)
      ],
      right: primaryActions
    });
  }

  function TablesModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.tables) return null;
    const runtimeTables = computeTableRuntime(db);
    const tablesUI = db.ui.tables || {};
    const view = tablesUI.view || 'assign';
    const filter = tablesUI.filter || 'all';
    const searchTerm = (tablesUI.search || '').trim().toLowerCase();

    const counts = runtimeTables.reduce((acc, table) => {
      acc.all += table.state === 'disactive' ? 0 : 1;
      if (table.state === 'maintenance') acc.maintenance += 1;
      if (table.state === 'active') {
        if (table.lockState === 'free') acc.free += 1;
        if (table.lockState === 'single') acc.single += 1;
        if (table.lockState === 'multi') acc.multi += 1;
      }
      return acc;
    }, { all: 0, free: 0, single: 0, multi: 0, maintenance: 0 });

    const filterItems = [
      { id: 'all', label: `${t.ui.tables_filter_all} (${counts.all})` },
      { id: 'free', label: `${t.ui.tables_filter_free} (${counts.free})` },
      { id: 'single', label: `${t.ui.tables_filter_single} (${counts.single})` },
      { id: 'multi', label: `${t.ui.tables_filter_multi} (${counts.multi})` },
      { id: 'maintenance', label: `${t.ui.tables_filter_maintenance} (${counts.maintenance})` }
    ].map(item => ({
      ...item,
      attrs: { gkey: 'pos:tables:filter', 'data-tables-filter': item.id }
    }));

    function createTableCard(runtime) {
      const palette = tablePalette(runtime);
      const stateLabel = tableStateLabel(t, runtime);
      const ordersCount = runtime.orderLocks.length;
      const reservationsCount = runtime.reservationRefs.length;
      const chips = [];
      if (ordersCount) { chips.push(UI.Badge({ text: `${ordersCount} ${t.ui.tables_orders_badge}`, variant: 'badge/ghost' })); }
      if (reservationsCount) { chips.push(UI.Badge({ text: `${reservationsCount} ${t.ui.tables_reservations_badge}`, variant: 'badge/ghost' })); }
      if (runtime.isCurrentOrder) { chips.push(UI.Badge({ text: t.ui.table_locked, variant: 'badge' })); }
      return D.Containers.Div({
        attrs: {
          class: tw`group relative flex min-h-[160px] flex-col justify-between gap-3 rounded-3xl border-2 p-4 transition hover:shadow-[var(--shadow)] ${palette}`,
          gkey: 'pos:tables:card:tap',
          'data-table-id': runtime.id
        }
      }, [
        D.Containers.Div({ attrs: { class: tw`flex items-start justify-between gap-2` } }, [
          D.Containers.Div({ attrs: { class: tw`space-y-1.5` } }, [
            D.Text.Strong({ attrs: { class: tw`text-xl font-semibold` } }, [runtime.name || runtime.id]),
            D.Text.Span({ attrs: { class: tw`text-sm opacity-70` } }, [`${t.ui.tables_zone}: ${runtime.zone || '—'}`]),
            D.Text.Span({ attrs: { class: tw`text-sm opacity-70` } }, [`${t.ui.tables_capacity}: ${runtime.capacity}`]),
            D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [stateLabel])
          ]),
          D.Containers.Div({ attrs: { class: tw`flex flex-col items-end gap-2` } }, [
            chips.length ? D.Containers.Div({ attrs: { class: tw`flex flex-wrap justify-end gap-1` } }, chips) : null,
            UI.Button({ attrs: { gkey: 'pos:tables:details', 'data-table-id': runtime.id, class: tw`rounded-full` }, variant: 'ghost', size: 'sm' }, ['⋯'])
          ].filter(Boolean))
        ]),
        runtime.note
          ? D.Text.Span({ attrs: { class: tw`text-sm opacity-75` } }, [`📝 ${runtime.note}`])
          : D.Text.Span({ attrs: { class: tw`text-sm opacity-60` } }, [t.ui.tables_longpress_hint])
      ]);
    }

    function createDetailsPanel() {
      if (!tablesUI.details) return null;
      const runtime = runtimeTables.find(tbl => tbl.id === tablesUI.details);
      if (!runtime) return null;
      const orderMap = new Map();
      orderMap.set(db.data.order.id, { ...db.data.order });
      (db.data.ordersQueue || []).forEach(ord => orderMap.set(ord.id, ord));
      const lang = db.env.lang;
      const ordersList = runtime.orderLocks.length
        ? UI.List({
          children: runtime.orderLocks.map(lock => {
            const order = orderMap.get(lock.orderId) || { id: lock.orderId, status: 'open' };
            const orderLabel = getDisplayOrderId(order, t);
            return UI.ListItem({
              leading: D.Text.Span({ attrs: { class: tw`text-xl` } }, ['🧾']),
              content: [
                D.Text.Strong({}, [`${t.ui.order_id} ${orderLabel}`]),
                D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [formatDateTime(order.updatedAt || lock.lockedAt, lang, { hour: '2-digit', minute: '2-digit' })])
              ],
              trailing: [
                UI.Button({ attrs: { gkey: 'pos:tables:unlock-order', 'data-table-id': runtime.id, 'data-order-id': order.id }, variant: 'ghost', size: 'sm' }, ['🔓'])
              ]
            });
          })
        })
        : UI.EmptyState({ icon: '🧾', title: t.ui.table_no_sessions, description: t.ui.table_manage_hint });

      const reservationsList = runtime.reservationRefs.length
        ? UI.List({
          children: runtime.reservationRefs.map(res => UI.ListItem({
            leading: D.Text.Span({ attrs: { class: tw`text-xl` } }, ['📅']),
            content: [
              D.Text.Strong({}, [res.customerName || res.id]),
              D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${formatDateTime(res.scheduledAt, lang, { hour: '2-digit', minute: '2-digit' })} • ${res.partySize} ${t.ui.guests}`])
            ],
            trailing: [
              UI.Badge({ text: localize(t.ui[`reservations_status_${res.status}`] || res.status, lang === 'ar' ? 'ar' : 'en'), variant: 'badge/ghost' })
            ]
          }))
        })
        : null;

      return UI.Card({
        title: `${t.ui.tables_details} — ${runtime.name || runtime.id}`,
        description: t.ui.tables_actions,
        content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
          D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-3 text-sm ${token('muted')}` } }, [
            D.Text.Span({}, [`${t.ui.tables_zone}: ${runtime.zone || '—'}`]),
            D.Text.Span({}, [`${t.ui.tables_capacity}: ${runtime.capacity}`]),
            D.Text.Span({}, [tableStateLabel(t, runtime)])
          ]),
          ordersList,
          reservationsList,
          UI.HStack({ attrs: { class: tw`justify-end gap-2` } }, [
            UI.Button({ attrs: { gkey: 'pos:tables:unlock-all', 'data-table-id': runtime.id }, variant: 'ghost', size: 'sm' }, [t.ui.tables_unlock_all]),
            UI.Button({ attrs: { gkey: 'pos:tables:details-close' }, variant: 'ghost', size: 'sm' }, [t.ui.close])
          ])
        ])
      });
    }

    const assignables = runtimeTables
      .filter(table => table.state !== 'disactive')
      .filter(table => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (table.name || '').toLowerCase().includes(term) || (table.id || '').toLowerCase().includes(term) || (table.zone || '').toLowerCase().includes(term);
      })
      .filter(table => {
        if (filter === 'free') return table.state === 'active' && table.lockState === 'free';
        if (filter === 'single') return table.lockState === 'single';
        if (filter === 'multi') return table.lockState === 'multi';
        if (filter === 'maintenance') return table.state === 'maintenance';
        return true;
      });

    const assignView = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
      UI.SearchBar({
        value: tablesUI.search || '',
        placeholder: t.ui.tables_search_placeholder,
        onInput: 'pos:tables:search'
      }),
      UI.ChipGroup({ items: filterItems, activeId: filter }),
      D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2 text-xs ${token('muted')}` } }, [
        D.Text.Span({}, [`${t.ui.tables_count_label}: ${assignables.length}`])
      ]),
      assignables.length
        ? D.Containers.Div({ attrs: { class: tw`grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3` } }, assignables.map(createTableCard))
        : UI.EmptyState({ icon: '🪑', title: t.ui.table_no_sessions, description: t.ui.table_manage_hint }),
      createDetailsPanel()
    ].filter(Boolean));

    const manageRows = runtimeTables
      .slice()
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map(table => UI.ListItem({
        leading: D.Text.Span({ attrs: { class: tw`text-lg` } }, ['🪑']),
        content: [
          D.Text.Strong({}, [table.name || table.id]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${t.ui.tables_zone}: ${table.zone || '—'}`]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${t.ui.tables_capacity}: ${table.capacity}`]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [tableStateLabel(t, table)])
        ],
        trailing: [
          UI.Button({ attrs: { gkey: 'pos:tables:rename', 'data-table-id': table.id, 'data-prevent-select': 'true' }, variant: 'ghost', size: 'sm' }, ['✏️']),
          UI.Button({ attrs: { gkey: 'pos:tables:capacity', 'data-table-id': table.id, 'data-prevent-select': 'true' }, variant: 'ghost', size: 'sm' }, ['👥']),
          UI.Button({ attrs: { gkey: 'pos:tables:zone', 'data-table-id': table.id, 'data-prevent-select': 'true' }, variant: 'ghost', size: 'sm' }, ['📍']),
          UI.Button({ attrs: { gkey: 'pos:tables:state', 'data-table-id': table.id, 'data-prevent-select': 'true' }, variant: 'ghost', size: 'sm' }, ['♻️']),
          UI.Button({ attrs: { gkey: 'pos:tables:remove', 'data-table-id': table.id, 'data-prevent-select': 'true' }, variant: 'ghost', size: 'sm' }, ['🗑️'])
        ],
        attrs: { class: tw`cursor-default` }
      }));

    const auditEntries = (db.data.auditTrail || []).slice().sort((a, b) => b.at - a.at).slice(0, 6).map(entry =>
      UI.ListItem({
        leading: D.Text.Span({ attrs: { class: tw`text-lg` } }, ['📝']),
        content: [
          D.Text.Strong({}, [`${entry.action} → ${entry.refId}`]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [formatDateTime(entry.at, db.env.lang, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })])
        ],
        trailing: [D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [entry.userId])]
      })
    );

    const manageView = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
      UI.HStack({ attrs: { class: tw`justify-between` } }, [
        UI.Button({ attrs: { gkey: 'pos:tables:add' }, variant: 'solid', size: 'sm' }, [`＋ ${t.ui.table_add}`]),
        D.Containers.Div({ attrs: { class: tw`flex gap-2` } }, [
          UI.Button({ attrs: { gkey: 'pos:tables:bulk', 'data-bulk-action': 'activate' }, variant: 'ghost', size: 'sm' }, [t.ui.tables_bulk_activate]),
          UI.Button({ attrs: { gkey: 'pos:tables:bulk', 'data-bulk-action': 'maintenance' }, variant: 'ghost', size: 'sm' }, [t.ui.tables_bulk_maintenance])
        ])
      ]),
      UI.ScrollArea({ attrs: { class: tw`max-h-[40vh] space-y-2` }, children: manageRows }),
      auditEntries.length ? UI.Card({ title: t.ui.tables_manage_log, content: UI.List({ children: auditEntries }) }) : null
    ].filter(Boolean));

    const viewSelector = UI.Segmented({
      items: [
        { id: 'assign', label: t.ui.tables_assign, attrs: { gkey: 'pos:tables:view', 'data-tables-view': 'assign' } },
        { id: 'manage', label: t.ui.tables_manage, attrs: { gkey: 'pos:tables:view', 'data-tables-view': 'manage' } }
      ],
      activeId: view
    });

    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.tables || 'full',
      sizeKey: 'tables',
      title: t.ui.tables,
      description: view === 'assign' ? t.ui.table_manage_hint : t.ui.tables_manage,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        viewSelector,
        view === 'assign' ? assignView : manageView
      ]),
      actions: [
        UI.Button({ attrs: { gkey: 'ui:modal:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function PrintModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.print) return null;
    //edit3   db.ui.print?.ticketSnapshot ||
    const order = db.ui.print?.ticketSnapshot || db.data.order || {};
    const uiPrint = db.ui.print || {};
    const docType = uiPrint.docType || db.data.print?.docType || 'customer';
    const profiles = db.data.print?.profiles || {};
    const profile = profiles[docType] || {};
    const selectedSize = uiPrint.size || profile.size || db.data.print?.size || 'thermal_80';
    const showAdvanced = !!uiPrint.showAdvanced;
    const managePrinters = !!uiPrint.managePrinters;
    const previewExpanded = !!uiPrint.previewExpanded;
    const newPrinterName = uiPrint.newPrinterName || '';
    const tablesNames = (order.tableIds || []).map(id => {
      const table = (db.data.tables || []).find(tbl => tbl.id === id);
      return table?.name || id;
    });
    const lang = db.env.lang;
    const due = order.totals?.due || 0;
    const subtotal = order.totals?.subtotal || 0;
    const payments = db.data.payments.split || [];
    const totalPaid = payments.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const changeDue = Math.max(0, round(totalPaid - due));
    const totalsRows = [
      { label: t.ui.subtotal, value: subtotal },
      order.totals?.service ? { label: t.ui.service, value: order.totals.service } : null,
      { label: t.ui.vat, value: order.totals?.vat || 0 },
      order.totals?.deliveryFee ? { label: t.ui.delivery_fee, value: order.totals.deliveryFee } : null,
      order.totals?.discount ? { label: t.ui.discount, value: order.totals.discount } : null
    ].filter(Boolean);

    const docTypes = [
      { id: 'customer', label: t.ui.print_doc_customer },
      { id: 'summary', label: t.ui.print_doc_summary },
      { id: 'kitchen', label: t.ui.print_doc_kitchen }
    ];

    const sizeOptions = [
      { id: 'thermal_80', label: t.ui.thermal_80 },
      { id: 'receipt_15', label: t.ui.receipt_15 },
      { id: 'a5', label: t.ui.a5 },
      { id: 'a4', label: t.ui.a4 }
    ];

    const sizePresets = {
      thermal_80: { container: 'max-w-[360px] px-5 py-6 text-[13px]', expandedContainer: 'max-w-[460px] px-6 py-7 text-[13px]', heading: 'text-xl', meta: 'text-xs', body: 'text-[13px]', total: 'text-[15px]', frame: 'border border-sky-200' },
      receipt_15: { container: 'max-w-[440px] px-6 py-6 text-[13px]', expandedContainer: 'max-w-[600px] px-8 py-8 text-[14px]', heading: 'text-2xl', meta: 'text-sm', body: 'text-[14px]', total: 'text-[16px]', frame: 'border border-dashed border-sky-200' },
      a5: { container: 'max-w-[640px] px-8 py-7 text-[15px]', expandedContainer: 'max-w-[860px] px-10 py-9 text-[15px]', heading: 'text-2xl', meta: 'text-base', body: 'text-[15px]', total: 'text-[18px]', frame: 'border border-neutral-200' },
      a4: { container: 'max-w-[760px] px-10 py-8 text-[16px]', expandedContainer: 'max-w-[940px] px-12 py-10 text-[16px]', heading: 'text-3xl', meta: 'text-lg', body: 'text-[16px]', total: 'text-[20px]', frame: 'border border-neutral-200' }
    };

    const previewPreset = sizePresets[selectedSize] || sizePresets.thermal_80;

    const previewLineClass = tw`${previewPreset.body} leading-6`;
    const previewLines = (order.lines || []).map(line => {
      const modifiers = Array.isArray(line.modifiers) ? line.modifiers : [];
      const modifierRows = modifiers.map(mod => {
        const delta = Number(mod.priceChange || 0) || 0;
        const priceLabel = delta ? `${delta > 0 ? '+' : '−'} ${formatCurrencyValue(db, Math.abs(delta))}` : t.ui.line_modifiers_free;
        return UI.HStack({ attrs: { class: tw`justify-between ps-6 text-xs text-neutral-500` } }, [
          D.Text.Span({}, [localize(mod.label, lang)]),
          D.Text.Span({}, [priceLabel])
        ]);
      });
      const notes = notesToText(line.notes);
      const notesRow = notes
        ? D.Text.Span({ attrs: { class: tw`block ps-6 text-[11px] text-neutral-400` } }, [`📝 ${notes}`])
        : null;
      return D.Containers.Div({ attrs: { class: previewLineClass } }, [
        UI.HStack({ attrs: { class: tw`justify-between` } }, [
          D.Text.Span({}, [`${localize(line.name, lang)} × ${line.qty}`]),
          UI.PriceText({ amount: line.total, currency: getCurrency(db), locale: getLocale(db) })
        ]),
        ...modifierRows,
        notesRow
      ].filter(Boolean));
    });

    const currentDocLabel = docTypes.find(dt => dt.id === docType)?.label || t.ui.print_doc_customer;
    const paymentsList = payments.length
      ? D.Containers.Div({ attrs: { class: tw`space-y-1 ${previewPreset.body} pt-2` } }, payments.map(pay => {
        const method = (db.data.payments.methods || []).find(m => m.id === pay.method);
        const label = method ? `${method.icon} ${localize(method.label, lang)}` : pay.method;
        return D.Containers.Div({ attrs: { class: tw`flex items-center justify-between` } }, [
          D.Text.Span({}, [label]),
          UI.PriceText({ amount: pay.amount, currency: getCurrency(db), locale: getLocale(db) })
        ]);
      }))
      : null;

    const previewContainerBase = previewExpanded ? (previewPreset.expandedContainer || previewPreset.container) : previewPreset.container;
    const previewContainerClass = tw`mx-auto w-full ${previewContainerBase} ${previewPreset.frame || 'border border-neutral-200'} rounded-3xl bg-white text-neutral-900 shadow-[0_24px_60px_rgba(15,23,42,0.16)] dark:bg-white dark:text-neutral-900 ${previewExpanded ? 'max-w-none' : ''}`;
    const previewHeadingClass = tw`${previewPreset.heading} font-semibold tracking-wide`;
    const previewMetaClass = tw`${previewPreset.meta} text-neutral-500`;
    const previewDetailsClass = tw`space-y-1 ${previewPreset.body} leading-6`;
    const previewTotalsClass = tw`space-y-2 ${previewPreset.body}`;
    const previewTotalsRowClass = tw`flex items-center justify-between ${previewPreset.body}`;
    const previewTotalsTotalClass = tw`flex items-center justify-between ${previewPreset.total} font-semibold`;
    const previewFooterClass = tw`mt-6 space-y-1 text-center ${previewPreset.meta} text-neutral-500`;

    const previewOrderId = getDisplayOrderId(order, t);
    const previewReceipt = D.Containers.Div({ attrs: { class: previewContainerClass, 'data-print-preview': 'receipt' } }, [
      D.Containers.Div({ attrs: { class: tw`space-y-1 text-center` } }, [
        D.Text.Strong({ attrs: { class: previewHeadingClass } }, ['Mishkah Restaurant']),
        D.Text.Span({ attrs: { class: previewMetaClass } }, [`${t.ui.print_header_address}: 12 Nile Street`]),
        D.Text.Span({ attrs: { class: previewMetaClass } }, [`${t.ui.print_header_phone}: 0100000000`])
      ]),
      D.Containers.Div({ attrs: { class: tw`mt-4 h-px bg-neutral-200` } }),
      D.Containers.Div({ attrs: { class: previewDetailsClass } }, [
        D.Text.Span({}, [`${t.ui.order_id} ${previewOrderId}`]),
        (order.type === 'dine_in' && (order.guests || 0) > 0) ? D.Text.Span({}, [`${t.ui.guests}: ${order.guests}`]) : null,
        tablesNames.length ? D.Text.Span({}, [`${t.ui.tables}: ${tablesNames.join(', ')}`]) : null,
        D.Text.Span({}, [formatDateTime(order.updatedAt || Date.now(), lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })])
      ].filter(Boolean)),
      D.Containers.Div({ attrs: { class: tw`mt-4 h-px bg-neutral-200` } }),
      previewLines.length
        ? D.Containers.Div({ attrs: { class: tw`space-y-2` } }, previewLines)
        : D.Text.Span({ attrs: { class: tw`block text-center ${previewPreset.body} text-neutral-400` } }, [t.ui.cart_empty]),
      D.Containers.Div({ attrs: { class: tw`mt-4 h-px bg-neutral-200` } }),
      D.Containers.Div({ attrs: { class: previewTotalsClass } }, [
        ...totalsRows.map(row => D.Containers.Div({ attrs: { class: previewTotalsRowClass } }, [
          D.Text.Span({}, [row.label]),
          UI.PriceText({ amount: row.value, currency: getCurrency(db), locale: getLocale(db) })
        ])),
        D.Containers.Div({ attrs: { class: previewTotalsTotalClass } }, [
          D.Text.Span({}, [t.ui.total]),
          UI.PriceText({ amount: due, currency: getCurrency(db), locale: getLocale(db) })
        ]),
        payments.length ? D.Containers.Div({ attrs: { class: previewTotalsRowClass } }, [
          D.Text.Span({}, [t.ui.paid]),
          UI.PriceText({ amount: totalPaid, currency: getCurrency(db), locale: getLocale(db) })
        ]) : null,
        payments.length ? D.Containers.Div({ attrs: { class: previewTotalsRowClass } }, [
          D.Text.Span({}, [t.ui.print_change_due]),
          UI.PriceText({ amount: changeDue, currency: getCurrency(db), locale: getLocale(db) })
        ]) : null,
        paymentsList
      ].filter(Boolean)),
      D.Containers.Div({ attrs: { class: previewFooterClass } }, [
        D.Text.Span({}, [t.ui.print_footer_thanks]),
        D.Text.Span({}, [t.ui.print_footer_policy]),
        D.Text.Span({}, [`${t.ui.print_footer_feedback} • QR`])
      ])
    ]);

    const availablePrinters = Array.isArray(db.data.print?.availablePrinters) ? db.data.print.availablePrinters : [];
    const printerOptions = [
      { value: '', label: t.ui.print_printer_placeholder },
      ...availablePrinters.map(item => ({ value: item.id, label: item.label || item.id }))
    ];
    const printerSelectField = (fieldKey, labelText, helperText, currentValue) =>
      UI.Field({
        label: labelText,
        helper: helperText,
        control: UI.Select({
          attrs: { value: currentValue || '', gkey: 'pos:print:printer-select', 'data-print-field': fieldKey },
          options: printerOptions
        })
      });

    const printerField = printerSelectField('defaultPrinter', t.ui.print_printer_default, t.ui.print_printer_select, profile.defaultPrinter);

    const manageControls = managePrinters
      ? UI.Card({
        variant: 'card/soft-2',
        title: t.ui.print_manage_title,
        description: t.ui.print_printers_manage_hint,
        content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
          UI.HStack({ attrs: { class: tw`gap-2` } }, [
            UI.Input({ attrs: { value: newPrinterName, placeholder: t.ui.print_manage_placeholder, gkey: 'pos:print:manage-input' } }),
            UI.Button({ attrs: { gkey: 'pos:print:manage-add', class: tw`whitespace-nowrap` }, variant: 'solid', size: 'sm' }, [t.ui.print_manage_add])
          ]),
          availablePrinters.length
            ? UI.List({
              children: availablePrinters.map(item => UI.ListItem({
                content: D.Text.Span({}, [item.label || item.id]),
                trailing: UI.Button({ attrs: { gkey: 'pos:print:manage-remove', 'data-printer-id': item.id }, variant: 'ghost', size: 'sm' }, ['🗑️'])
              }))
            })
            : UI.EmptyState({ icon: '🖨️', title: t.ui.print_manage_empty, description: '' })
        ])
      })
      : null;

    const advancedControls = showAdvanced
      ? D.Containers.Div({ attrs: { class: tw`space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4` } }, [
        UI.Segmented({
          items: sizeOptions.map(opt => ({ id: opt.id, label: opt.label, attrs: { gkey: 'pos:print:size', 'data-print-size': opt.id } })),
          activeId: selectedSize
        }),
        printerSelectField('insidePrinter', t.ui.print_printer_inside, t.ui.print_printer_hint, profile.insidePrinter),
        printerSelectField('outsidePrinter', t.ui.print_printer_outside, t.ui.print_printer_hint, profile.outsidePrinter),
        UI.Field({
          label: t.ui.print_copies,
          control: UI.NumpadDecimal({
            value: profile.copies || 1,
            placeholder: '1',
            gkey: 'pos:print:profile-field',
            inputAttrs: { 'data-print-field': 'copies' },
            allowDecimal: false,
            confirmLabel: t.ui.close,
            confirmAttrs: { variant: 'soft', size: 'sm' }
          })
        }),
        UI.HStack({ attrs: { class: tw`flex-wrap gap-2 text-xs` } }, [
          UI.Button({ attrs: { gkey: 'pos:print:toggle', 'data-print-toggle': 'autoSend', class: tw`${profile.autoSend ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [profile.autoSend ? '✅ ' : '⬜︎ ', t.ui.print_auto_send]),
          UI.Button({ attrs: { gkey: 'pos:print:toggle', 'data-print-toggle': 'preview', class: tw`${profile.preview ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [profile.preview ? '✅ ' : '⬜︎ ', t.ui.print_show_preview]),
          UI.Button({ attrs: { gkey: 'pos:print:toggle', 'data-print-toggle': 'duplicateInside', class: tw`${profile.duplicateInside ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [profile.duplicateInside ? '✅ ' : '⬜︎ ', t.ui.print_duplicate_inside]),
          UI.Button({ attrs: { gkey: 'pos:print:toggle', 'data-print-toggle': 'duplicateOutside', class: tw`${profile.duplicateOutside ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [profile.duplicateOutside ? '✅ ' : '⬜︎ ', t.ui.print_duplicate_outside])
        ]),
        D.Containers.Div({ attrs: { class: tw`flex items-start gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-xs` } }, [
          D.Text.Span({ attrs: { class: tw`text-lg` } }, ['ℹ️']),
          D.Text.Span({ attrs: { class: tw`leading-relaxed` } }, [t.ui.print_printers_info])
        ])
      ])
      : null;

    const previewCardAttrs = previewExpanded ? { class: tw`w-full` } : {};
    const preview = UI.Card({
      variant: 'card/soft-2',
      attrs: previewCardAttrs,
      title: `${t.ui.print_preview} — ${currentDocLabel}`,
      content: previewReceipt
    });

    const toggleRow = UI.HStack({ attrs: { class: tw`flex-wrap gap-2` } }, [
      UI.Button({ attrs: { gkey: 'pos:print:advanced-toggle', class: tw`${showAdvanced ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [showAdvanced ? `⬆️ ${t.ui.print_hide_advanced}` : `⚙️ ${t.ui.print_show_advanced}`]),
      UI.Button({ attrs: { gkey: 'pos:print:manage-toggle', class: tw`${managePrinters ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [managePrinters ? `⬆️ ${t.ui.print_manage_hide}` : `🖨️ ${t.ui.print_manage_printers}`]),
      UI.Button({ attrs: { gkey: 'pos:print:preview-expand', class: tw`${previewExpanded ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : ''}` }, variant: 'ghost', size: 'sm' }, [previewExpanded ? `🗕 ${t.ui.print_preview_collapse}` : `🗗 ${t.ui.print_preview_expand}`])
    ]);

    const modalContent = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
      UI.Segmented({
        items: docTypes.map(dt => ({ id: dt.id, label: dt.label, attrs: { gkey: 'pos:print:doc', 'data-doc-type': dt.id } })),
        activeId: docType
      }),
      printerField,
      toggleRow,
      manageControls,
      advancedControls,
      preview
    ].filter(Boolean));

    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.print || 'xl',
      sizeKey: 'print',
      title: t.ui.print,
      description: t.ui.print_profile,
      content: modalContent,
      actions: [
        UI.Button({ attrs: { gkey: 'pos:print:send', class: tw`w-full` }, variant: 'solid', size: 'sm' }, [t.ui.print_send]),
        UI.Button({ attrs: { gkey: 'pos:print:browser', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.print_browser_preview]),
        UI.Button({ attrs: { gkey: 'pos:order:export', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.export_pdf]),
        UI.Button({ attrs: { gkey: 'pos:print:save', class: tw`w-full` }, variant: 'soft', size: 'sm' }, [t.ui.print_save_profile]),
        UI.Button({ attrs: { gkey: 'ui:modal:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function ReservationsModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.reservations) return null;
    const reservations = db.data.reservations || [];
    const tables = db.data.tables || [];
    const uiState = db.ui.reservations || {};
    const statusFilter = uiState.status || 'all';
    const rangeFilter = uiState.filter || 'today';
    const formState = uiState.form || null;
    const lang = db.env.lang;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    function inRange(res) {
      if (rangeFilter === 'today') return res.scheduledAt >= startOfToday && res.scheduledAt < endOfToday;
      if (rangeFilter === 'upcoming') return res.scheduledAt >= endOfToday;
      if (rangeFilter === 'past') return res.scheduledAt < startOfToday;
      return true;
    }

    const filtered = reservations
      .filter(res => statusFilter === 'all' ? true : res.status === statusFilter)
      .filter(inRange)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);

    const rangeItems = [
      { id: 'today', label: t.ui.reservations_manage },
      { id: 'upcoming', label: '⏭️' },
      { id: 'all', label: t.ui.reservations_filter_all }
    ].map(item => ({ ...item, attrs: { gkey: 'pos:reservations:range', 'data-reservation-range': item.id } }));

    const statusItems = [
      { id: 'all', label: t.ui.reservations_filter_all },
      { id: 'booked', label: t.ui.reservations_filter_booked },
      { id: 'seated', label: t.ui.reservations_filter_seated },
      { id: 'completed', label: t.ui.reservations_filter_completed },
      { id: 'cancelled', label: t.ui.reservations_filter_cancelled },
      { id: 'no-show', label: t.ui.reservations_filter_noshow }
    ].map(item => ({ ...item, attrs: { gkey: 'pos:reservations:status', 'data-reservation-status': item.id } }));

    const formTables = tables.filter(tbl => tbl.state === 'active');
    const selectedTables = new Set(Array.isArray(formState?.tableIds) ? formState.tableIds : []);

    const formCard = formState ? UI.Card({
      title: formState.id ? t.ui.reservations_edit : t.ui.reservations_new,
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        UI.Field({ label: t.ui.reservations_customer, control: UI.Input({ attrs: { value: formState.customerName || '', gkey: 'pos:reservations:form', 'data-field': 'customerName', placeholder: t.ui.reservations_customer } }) }),
        UI.Field({ label: t.ui.reservations_phone, control: UI.Input({ attrs: { value: formState.phone || '', gkey: 'pos:reservations:form', 'data-field': 'phone', placeholder: '010...' } }) }),
        UI.Field({
          label: t.ui.reservations_party_size,
          control: UI.NumpadDecimal({
            value: formState.partySize || 2,
            placeholder: '0',
            gkey: 'pos:reservations:form',
            inputAttrs: { 'data-field': 'partySize' },
            allowDecimal: false,
            confirmLabel: t.ui.close,
            confirmAttrs: { variant: 'soft', size: 'sm' }
          })
        }),
        UI.Field({ label: t.ui.reservations_time, control: UI.Input({ attrs: { type: 'datetime-local', value: toInputDateTime(formState.scheduledAt), gkey: 'pos:reservations:form', 'data-field': 'scheduledAt' } }) }),
        UI.Field({ label: t.ui.reservations_hold_until, control: UI.Input({ attrs: { type: 'datetime-local', value: toInputDateTime(formState.holdUntil), gkey: 'pos:reservations:form', 'data-field': 'holdUntil' } }) }),
        D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
          D.Text.Span({ attrs: { class: tw`text-sm font-medium` } }, [t.ui.reservations_tables]),
          D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2` } }, formTables.map(tbl => UI.Button({
            attrs: {
              gkey: 'pos:reservations:form:table',
              'data-table-id': tbl.id,
              class: tw`rounded-full px-3 py-1 text-sm ${selectedTables.has(tbl.id) ? 'bg-[var(--primary)] text-[var(--foreground)] dark:text-[var(--primary-foreground)]' : 'bg-[var(--surface-2)]'}`
            },
            variant: 'ghost',
            size: 'sm'
          }, [`🪑 ${tbl.name}`])))
        ]),
        UI.Field({ label: t.ui.reservations_note, control: UI.Textarea({ attrs: { value: formState.note || '', rows: '2', gkey: 'pos:reservations:form', 'data-field': 'note' } }) })
      ]),
      footer: UI.HStack({ attrs: { class: tw`gap-2` } }, [
        UI.Button({ attrs: { gkey: 'pos:reservations:save', class: tw`flex-1` }, variant: 'solid', size: 'sm' }, [t.ui.reservations_save]),
        UI.Button({ attrs: { gkey: 'pos:reservations:cancel-edit', class: tw`flex-1` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ])
    }) : null;

    const listCards = filtered.length ? filtered.map(res => {
      const tableBadges = res.tableIds.map(id => {
        const table = tables.find(tbl => tbl.id === id);
        return UI.Badge({ text: table?.name || id, variant: 'badge/ghost' });
      });
      return UI.Card({
        title: `${res.customerName} — ${res.partySize} ${t.ui.guests}`,
        description: `${formatDateTime(res.scheduledAt, lang, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })} • ${res.phone || ''}`,
        content: D.Containers.Div({ attrs: { class: tw`space-y-2 text-sm` } }, [
          tableBadges.length ? D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-1` } }, tableBadges) : null,
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${t.ui.reservations_hold_label}: ${res.holdUntil ? formatDateTime(res.holdUntil, lang, { hour: '2-digit', minute: '2-digit' }) : '—'}`])
        ].filter(Boolean)),
        footer: UI.HStack({ attrs: { class: tw`flex-wrap gap-2` } }, [
          UI.Badge({ text: t.ui[`reservations_status_${res.status}`] || res.status, variant: 'badge/ghost' }),
          UI.Button({ attrs: { gkey: 'pos:reservations:edit', 'data-reservation-id': res.id }, variant: 'ghost', size: 'sm' }, ['✏️']),
          UI.Button({ attrs: { gkey: 'pos:reservations:convert', 'data-reservation-id': res.id }, variant: 'ghost', size: 'sm' }, [t.ui.reservations_convert]),
          UI.Button({ attrs: { gkey: 'pos:reservations:noshow', 'data-reservation-id': res.id }, variant: 'ghost', size: 'sm' }, [t.ui.reservations_no_show]),
          UI.Button({ attrs: { gkey: 'pos:reservations:cancel', 'data-reservation-id': res.id }, variant: 'ghost', size: 'sm' }, [t.ui.reservations_cancel_action])
        ])
      });
    }) : [UI.EmptyState({ icon: '📅', title: t.ui.reservations, description: t.ui.reservations_list_empty })];

    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.reservations || 'full',
      sizeKey: 'reservations',
      title: t.ui.reservations,
      description: t.ui.reservations_manage,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        UI.HStack({ attrs: { class: tw`justify-between` } }, [
          UI.Segmented({ items: rangeItems, activeId: rangeFilter }),
          UI.Button({ attrs: { gkey: 'pos:reservations:new' }, variant: 'solid', size: 'sm' }, [`＋ ${t.ui.reservations_new}`])
        ]),
        UI.ChipGroup({ items: statusItems, activeId: statusFilter }),
        formCard,
        D.Containers.Div({ attrs: { class: tw`space-y-3 max-h-[60vh] overflow-auto pr-1` } }, listCards)
      ].filter(Boolean)),
      actions: [
        UI.Button({ attrs: { gkey: 'ui:modal:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function OrdersQueueModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.orders) return null;
    const tablesIndex = new Map((db.data.tables || []).map(tbl => [tbl.id, tbl]));
    const ordersState = db.ui.orders || { tab: 'all', search: '', sort: { field: 'updatedAt', direction: 'desc' } };
    const activeTab = ordersState.tab || 'all';
    const searchTerm = (ordersState.search || '').trim().toLowerCase();
    const sortState = ordersState.sort || { field: 'updatedAt', direction: 'desc' };
    const mergedOrders = [];
    const seen = new Set();
    const isDraftOrder = (order) => {
      if (!order) return false;
      const statusCandidates = [
        order.status,
        order.statusId,
        order.state,
        order.orderStatus,
        order.lifecycleStatus,
        order.lifecycle_state,
        order.header?.status,
        order.header?.status_id,
        order.header?.statusId,
        order.header?.order_status,
        order.header?.orderStatus,
        order.header?.state,
        order.header?.lifecycle_state,
        order.header?.lifecycleStatus
      ];
      if (statusCandidates.some(value => {
        if (value == null) return false;
        const normalized = String(value).trim().toLowerCase();
        if (!normalized) return false;
        return normalized.includes('draft');
      })) {
        return true;
      }
      const idSource = order.id || order.header?.id || '';
      const idNormalized = String(idSource).trim().toLowerCase();
      if (idNormalized.startsWith('draft')) return true;
      if (order.isDraft === true || order.header?.is_draft === true || order.header?.isDraft === true) return true;
      return false;
    };
    const sourceOrders = (activeTab === 'completed')
      ? (Array.isArray(db.data.ordersHistory) ? db.data.ordersHistory.slice() : [])
      : [db.data.order, ...(db.data.ordersQueue || [])];
    sourceOrders.forEach(order => {
      if (!order || !order.id || seen.has(order.id)) return;
      if (isDraftOrder(order)) return;
      seen.add(order.id);
      mergedOrders.push(order);
    });

    const isOrderCompleted = (order) => {
      const statusId = order.statusId || order.status || 'open';
      const isNotOpen = String(statusId) !== 'open';
      const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
      const totalDue = Number(totals?.due || 0);
      const paidAmount = round((Array.isArray(order.payments) ? order.payments : []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
      const isFullyPaid = totalDue > 0 && paidAmount >= totalDue;

      var order_linearr = window.__POS_DB__.store.state.modules.pos.tables.order_line.filter(item => item.orderId === order.id);

      const isAllCompleted = order_linearr?.every(line => line.statusId === 'completed');

      return isAllCompleted && isFullyPaid;
    };

    const matchesTab = (order) => {
      if (activeTab === 'completed') {
        return isOrderCompleted(order);
      }

      if (activeTab === 'all') {
        // ✅ Hide completed orders from "all" tab
        return !isOrderCompleted(order);
      }

      const typeId = order.type || order.orderType || 'dine_in';
      // ✅ For type-specific tabs, also hide completed orders
      return typeId === activeTab && !isOrderCompleted(order);
    };

    const matchesSearch = (order) => {
      if (!searchTerm) return true;
      const typeLabel = localize(getOrderTypeConfig(order.type || 'dine_in').label, db.env.lang);
      const stageLabel = localize(orderStageMap.get(order.fulfillmentStage)?.name || { ar: order.fulfillmentStage, en: order.fulfillmentStage }, db.env.lang);
      const statusLabel = localize(orderStatusMap.get(order.status)?.name || { ar: order.status, en: order.status }, db.env.lang);
      const tableNames = (order.tableIds || []).map(id => tablesIndex.get(id)?.name || id).join(' ');
      const paymentLabel = localize(orderPaymentMap.get(order.paymentState)?.name || { ar: order.paymentState || '', en: order.paymentState || '' }, db.env.lang);
      const haystack = [order.id, typeLabel, stageLabel, statusLabel, paymentLabel, tableNames].join(' ').toLowerCase();
      return haystack.includes(searchTerm);
    };

    const filtered = mergedOrders.filter(order => matchesTab(order) && matchesSearch(order));

    const getSortValue = (order, field) => {
      switch (field) {
        case 'order': return order.id;
        case 'type': return order.type || 'dine_in';
        case 'stage': return order.fulfillmentStage || 'new';
        case 'status': return order.status || 'open';
        case 'payment': return order.paymentState || 'unpaid';
        case 'tables': return (order.tableIds || []).join(',');
        case 'guests': return order.guests || 0;
        case 'lines': return order.lines ? order.lines.length : 0;
        case 'notes': return order.notes ? order.notes.length : 0;
        case 'total': {
          // Always recalculate totals to ensure current tax/service rates
          const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
          return Number(totals?.due || 0);
        }
        case 'updatedAt':
        default:
          return order.updatedAt || order.createdAt || 0;
      }
    };

    const sorted = filtered.slice().sort((a, b) => {
      const field = sortState.field || 'updatedAt';
      const direction = sortState.direction === 'asc' ? 1 : -1;
      const av = getSortValue(a, field);
      const bv = getSortValue(b, field);
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * direction;
      if (bv == null) return 1 * direction;
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av === bv) return 0;
        return av > bv ? direction : -direction;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as === bs) return 0;
      return as > bs ? direction : -direction;
    });

    const columns = [
      { id: 'order', label: t.ui.order_id, sortable: true },
      { id: 'type', label: t.ui.orders_type, sortable: true },
      { id: 'stage', label: t.ui.orders_stage, sortable: true },
      { id: 'status', label: t.ui.orders_status, sortable: true },
      { id: 'payment', label: t.ui.orders_payment, sortable: true },
      { id: 'tables', label: t.ui.tables, sortable: false },
      { id: 'guests', label: t.ui.guests, sortable: true },
      { id: 'lines', label: t.ui.orders_line_count, sortable: true },
      { id: 'notes', label: t.ui.orders_notes, sortable: true },
      { id: 'total', label: t.ui.orders_total, sortable: true },
      { id: 'paid', label: t.ui.paid, sortable: false },
      { id: 'remaining', label: t.ui.balance_due, sortable: false },
      { id: 'updatedAt', label: t.ui.orders_updated, sortable: true },
      { id: 'actions', label: '', sortable: false }
    ];

    const headerRow = D.Tables.Tr({}, columns.map(col => {
      if (!col.sortable) {
        return D.Tables.Th({ attrs: { class: tw`px-3 py-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]` } }, [col.label]);
      }
      const isActive = (sortState.field || 'updatedAt') === col.id;
      const icon = isActive ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
      return D.Tables.Th({ attrs: { class: tw`px-3 py-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]` } }, [
        UI.Button({ attrs: { gkey: 'pos:orders:sort', 'data-sort-field': col.id, class: tw`flex items-center gap-1 text-xs` }, variant: 'ghost', size: 'sm' }, [col.label, D.Text.Span({ attrs: { class: tw`text-[var(--muted-foreground)]` } }, [icon])])
      ]);
    }));

    const rows = sorted.map(order => {
      const typeConfig = getOrderTypeConfig(order.type || 'dine_in');
      const stageMeta = orderStageMap.get(order.fulfillmentStage) || null;
      const statusMeta = orderStatusMap.get(order.status) || null;
      const paymentMeta = orderPaymentMap.get(order.paymentState) || null;
      // Always recalculate totals to ensure current tax/service rates
      const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
      const totalDue = Number(totals?.due || 0);
      const paidAmount = round((Array.isArray(order.payments) ? order.payments : []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
      const remainingAmount = Math.max(0, round(totalDue - paidAmount));

      // ✅ CRITICAL FIX: Read tableIds from multiple sources (camelCase, snake_case, single tableId)
      const tableIdsSource = order.tableIds || order.table_ids || order.tableId || order.table_id;
      let orderTableIds = Array.isArray(tableIdsSource)
        ? tableIdsSource
        : (tableIdsSource ? [tableIdsSource] : []);
      const headerTableIds = ((window.__POS_DB__?.store?.state?.modules?.pos?.tables?.order_header) || []).find(h => h.id === order.id)?.metadata?.tableIds || [];
      orderTableIds = headerTableIds;
      if (order.type === 'dine_in' && (!orderTableIds || orderTableIds.length === 0)) {
        //console.log(headerTableIds);
        //console.log(order);
        //console.warn('⚠️ [ORDERS REPORT] Dine-in order missing tableIds!', {
        //   orderId: order.id,
        //   'order.tableIds': order.tableIds,
        //  'order.tableId': order.tableId,
        //  'order.table_ids': order.table_ids,
        //  'order.table_id': order.table_id
        //});
      }

      const tableNames = orderTableIds
        .map(id => {
          const table = tablesIndex.get(id);
          const name = table?.name || table?.label || id;
          // ✅ DEBUG: Log if table not found in index
          if (!table && id) {
            //console.warn('⚠️ [ORDERS REPORT] Table not found in tablesIndex:', {
            //    tableId: id,
            //    orderId: order.id,
            //    availableTables: Array.from(tablesIndex.keys())
            //  });
          }
          return name;
        })
        .filter(Boolean)
        .join(', ');
      const updatedStamp = order.updatedAt || order.createdAt;
      return D.Tables.Tr({ attrs: { key: order.id, class: tw`bg-[var(--surface-1)]` } }, [
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm font-semibold` } }, [order.id]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [localize(typeConfig.label, db.env.lang)]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.Badge({ text: localize(stageMeta?.name || { ar: order.fulfillmentStage, en: order.fulfillmentStage }, db.env.lang), variant: 'badge/ghost' })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.Badge({ text: localize(statusMeta?.name || { ar: order.status, en: order.status }, db.env.lang), variant: 'badge/ghost' })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [localize(paymentMeta?.name || { ar: order.paymentState || '', en: order.paymentState || '' }, db.env.lang)]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [tableNames || '—']),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm text-center` } }, [order.type === 'dine_in' && (order.guests || 0) > 0 ? String(order.guests) : '—']),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm text-center` } }, [String(order.lines ? order.lines.length : 0)]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm text-center` } }, [String(order.notes ? order.notes.length : 0)]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.PriceText({ amount: totalDue, currency: getCurrency(db), locale: getLocale(db) })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.PriceText({ amount: paidAmount, currency: getCurrency(db), locale: getLocale(db) })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.PriceText({ amount: remainingAmount, currency: getCurrency(db), locale: getLocale(db) })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-xs ${token('muted')}` } }, [formatDateTime(updatedStamp, db.env.lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || '—']),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2` } }, [
          D.Containers.Div({ attrs: { class: tw`flex items-center justify-end gap-2` } }, [
            UI.Button({ attrs: { gkey: 'pos:orders:view-jobs', 'data-order-id': order.id }, variant: 'ghost', size: 'sm' }, [t.ui.orders_view_jobs]),
            UI.Button({ attrs: { gkey: 'pos:orders:open-order', 'data-order-id': order.id }, variant: 'ghost', size: 'sm' }, [t.ui.orders_queue_open])
          ])
        ])
      ]);
    });

    const table = sorted.length
      ? D.Tables.Table({ attrs: { class: tw`w-full border-separate [border-spacing:0_8px] text-sm` } }, [
        D.Tables.Thead({}, [headerRow]),
        D.Tables.Tbody({}, rows)
      ])
      : UI.EmptyState({ icon: '🧾', title: t.ui.orders_no_results, description: t.ui.orders_queue_hint });

    const tabItems = [
      { id: 'all', label: t.ui.orders_tab_all },
      { id: 'dine_in', label: t.ui.orders_tab_dine_in },
      { id: 'delivery', label: t.ui.orders_tab_delivery },
      { id: 'takeaway', label: t.ui.orders_tab_takeaway },
      { id: 'completed', label: t.ui.orders_tab_completed || (db.env.lang === 'ar' ? 'منتهية' : 'Completed') }
    ];

    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.orders || 'full',
      sizeKey: 'orders',
      title: t.ui.orders_queue,
      description: t.ui.orders_queue_hint,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        UI.Tabs({ items: tabItems, activeId: activeTab, gkey: 'pos:orders:tab' }),
        D.Containers.Div({ attrs: { class: tw`flex flex-col gap-2 md:flex-row md:items-center md:justify-between` } }, [
          UI.Input({ attrs: { type: 'search', value: ordersState.search || '', placeholder: t.ui.orders_search_placeholder, gkey: 'pos:orders:search' } }),
          UI.Button({ attrs: { gkey: 'pos:orders:refresh' }, variant: 'ghost', size: 'sm' }, ['🔄 ', t.ui.orders_refresh])
        ]),
        table
      ].filter(Boolean)),
      actions: [
        UI.Button({ attrs: { gkey: 'ui:modal:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function OrdersJobStatusModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.jobStatus) return null;
    const jobState = db.ui.jobStatus || {};
    const orderId = jobState.orderId;
    if (!orderId) return null;

    //console.log('🔍 [view-jobs MODAL] Opening for orderId:', orderId);

    const lang = db.env.lang || 'ar';

    // ✅ Read from window.database (same as KDS for compatibility!)
    let database = typeof window !== 'undefined' ? (window.database || {}) : {};

    // ✅ ENHANCED: Always merge with store.state to catch freshly saved data
    // (watchers update window.database async, but store.state is immediate)
    const store = window.__POS_DB__;
    if (store && store.store?.state?.modules?.pos?.tables) {
      const storeState = store.store.state.modules.pos.tables;

      // Use store.state if it has MORE data than window.database (fresher)
      const storeHeaderCount = (storeState.job_order_header || []).length;
      const windowHeaderCount = (database.job_order_header || []).length;
      const storeDetailCount = (storeState.job_order_detail || []).length;
      const windowDetailCount = (database.job_order_detail || []).length;

      if (storeHeaderCount > windowHeaderCount || storeDetailCount > windowDetailCount) {
        //console.log('⚡ [view-jobs MODAL] store.state has fresher data - using it!');
        //console.log('   Headers: store='+storeHeaderCount+' vs window='+windowHeaderCount);
        //console.log('   Details: store='+storeDetailCount+' vs window='+windowDetailCount);

        // Use store.state as source of truth (fresher data)
        database = {
          ...database,
          job_order_header: storeState.job_order_header || database.job_order_header || [],
          job_order_detail: storeState.job_order_detail || database.job_order_detail || [],
          job_order_detail_modifier: storeState.job_order_detail_modifier || database.job_order_detail_modifier || [],
          kitchen_sections: storeState.kitchen_sections || database.kitchen_sections || []
        };
      }
    }

    // ✅ Helper function: Translate job status to current language
    const translateJobStatus = (status) => {
      if (!status) return '';
      const key = `job_status_${status}`;
      return t.ui[key] || status;
    };

    // ✅ Helper function: Normalize field names (support both camelCase and snake_case)
    const normalizeHeader = (header) => ({
      ...header,
      orderId: header.orderId || header.order_id,
      orderNumber: header.orderNumber || header.order_number,
      stationId: header.stationId || header.station_id,
      stationCode: header.stationCode || header.station_code,
      status: header.status,
      progressState: header.progressState || header.progress_state,
      totalItems: header.totalItems || header.total_items || 0,
      completedItems: header.completedItems || header.completed_items || 0,
      remainingItems: header.remainingItems || header.remaining_items || 0,
      tableLabel: header.tableLabel || header.table_label,
      customerName: header.customerName || header.customer_name,
      acceptedAt: header.acceptedAt || header.accepted_at,
      startedAt: header.startedAt || header.started_at,
      readyAt: header.readyAt || header.ready_at,
      completedAt: header.completedAt || header.completed_at,
      expoAt: header.expoAt || header.expo_at,
      updatedAt: header.updatedAt || header.updated_at,
      createdAt: header.createdAt || header.created_at
    });

    const normalizeDetail = (detail) => ({
      ...detail,
      jobOrderId: detail.jobOrderId || detail.job_order_id,
      itemId: detail.itemId || detail.item_id || detail.menuItemId || detail.menu_item_id,
      itemCode: detail.itemCode || detail.item_code || detail.code,
      quantity: detail.quantity || 0,
      status: detail.status,
      startAt: detail.startAt || detail.start_at,
      finishAt: detail.finishAt || detail.finish_at,
      itemNameAr: detail.itemNameAr || detail.item_name_ar || detail.nameAr || detail.name_ar || '',
      itemNameEn: detail.itemNameEn || detail.item_name_en || detail.nameEn || detail.name_en || '',
      prepNotes: detail.prepNotes || detail.prep_notes
    });

    // ✅ Read from window.database (same as KDS!)
    const allHeaders = database.job_order_header || [];
    const headersRaw = allHeaders.filter(header => String(header.orderId || header.order_id) === String(orderId));
    const headers = headersRaw.map(normalizeHeader);

    const allDetails = database.job_order_detail || [];
    const details = allDetails.map(normalizeDetail);

    //console.log('🔍 [view-jobs MODAL] window.database.job_order_header:', allHeaders.length);
    //console.log('🔍 [view-jobs MODAL] Filtered for orderId', orderId, ':', headers.length);
    //console.log('🔍 [view-jobs MODAL] window.database.job_order_detail:', allDetails.length);
    if (headers.length > 0) {
      //console.log('🔍 [view-jobs MODAL] Sample header:', {
      //    id: headers[0].id,
      //    status: headers[0].status,
      //    progressState: headers[0].progressState,
      //    acceptedAt: headers[0].acceptedAt,
      //    startedAt: headers[0].startedAt,
      //    readyAt: headers[0].readyAt
      // });
    }
    if (allDetails.length > 0) {
      //console.log('🔍 [view-jobs MODAL] Sample detail statuses:',
      //    allDetails.slice(0, 5).map(d => ({ id: d.id, status: d.status }))
      //);
    }

    const detailMap = new Map();
    details.forEach(detail => {
      if (!detail || !detail.jobOrderId) return;
      const list = detailMap.get(detail.jobOrderId) || [];
      list.push(detail);
      detailMap.set(detail.jobOrderId, list);
    });

    // ✅ Read kitchen_sections from window.database
    const kitchenSections = database.kitchen_sections || [];
    const stationsIndex = new Map(kitchenSections.map(section => [section.id, section]));
    const sectionIndex = new Map((Array.isArray(db.data.kitchenSections) ? db.data.kitchenSections : []).map(section => [section.id, section]));
    const findOrder = () => {
      const candidates = [db.data.order, ...(db.data.ordersQueue || []), ...(db.data.ordersHistory || [])];
      return candidates.find(entry => entry && String(entry.id) === String(orderId)) || null;
    };
    const orderRecord = findOrder();
    const summaryRows = [
      { label: t.ui.order_id, value: orderId },
      orderRecord && orderRecord.type ? { label: t.ui.service_type, value: localize(getOrderTypeConfig(orderRecord.type).label, lang) } : null,
      orderRecord && orderRecord.customerName ? { label: t.ui.customer, value: orderRecord.customerName } : null,
      orderRecord && Array.isArray(orderRecord.tableIds) && orderRecord.tableIds.length
        ? { label: t.ui.tables, value: orderRecord.tableIds.join(', ') }
        : null
    ].filter(Boolean);
    const summaryContent = summaryRows.length
      ? D.Containers.Div({ attrs: { class: tw`grid gap-2 sm:grid-cols-2` } }, summaryRows.map(row =>
        D.Containers.Div({ attrs: { class: tw`flex flex-col rounded border border-[var(--muted)] bg-[var(--surface-2)] px-3 py-2` } }, [
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [row.label]),
          D.Text.Strong({ attrs: { class: tw`text-sm` } }, [row.value])
        ])
      ))
      : null;
    const cards = headers.map(header => {
      const station = stationsIndex.get(header.stationId) || sectionIndex.get(header.stationId) || {};
      const stationLabel = lang === 'ar'
        ? (station.nameAr || station.section_name?.ar || station.name || header.stationId || '—')
        : (station.nameEn || station.section_name?.en || station.name || header.stationId || '—');
      // ✅ Translate status to current language
      const rawStatus = header.status || header.progressState || 'queued';
      const statusLabel = translateJobStatus(rawStatus);
      const progress = `${Number(header.completedItems || 0)} / ${Number(header.totalItems || header.jobs?.length || 0)}`;
      const itemRows = (detailMap.get(header.id) || []).map(detail => {
        const itemLabel = lang === 'ar'
          ? (detail.itemNameAr || detail.itemNameEn || detail.itemCode || detail.id)
          : (detail.itemNameEn || detail.itemNameAr || detail.itemCode || detail.id);
        // ✅ Translate detail status to current language
        const rawDetailStatus = detail.status || 'queued';
        const detailStatus = translateJobStatus(rawDetailStatus);
        return D.Containers.Div({ attrs: { class: tw`flex items-center justify-between rounded bg-[var(--surface-2)] px-3 py-2 text-sm` } }, [
          D.Text.Span({}, [`${itemLabel} × ${Number(detail.quantity || 1)}`]),
          UI.Badge({ text: detailStatus, variant: 'badge/ghost' })
        ]);
      });
      return D.Containers.Div({ attrs: { class: tw`space-y-3 rounded-lg border border-[var(--muted)] bg-[var(--surface-1)] p-4` } }, [
        D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2` } }, [
          D.Text.Strong({}, [stationLabel || header.stationId || '—']),
          UI.Badge({ text: statusLabel, variant: 'badge/outline' })
        ]),
        D.Containers.Div({ attrs: { class: tw`flex items-center justify-between text-xs ${token('muted')}` } }, [
          D.Text.Span({}, [`${t.ui.orders_jobs_items}: ${progress}`]),
          header.updatedAt ? D.Text.Span({}, [`${t.ui.orders_jobs_updated}: ${formatDateTime(new Date(header.updatedAt).getTime(), lang, { hour: '2-digit', minute: '2-digit' })}`]) : null
        ].filter(Boolean)),
        itemRows.length ? D.Containers.Div({ attrs: { class: tw`space-y-2` } }, itemRows) : UI.EmptyState({ icon: '🥘', title: t.ui.orders_jobs_empty })
      ]);
    });
    const content = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
      summaryContent,
      cards.length ? D.Containers.Div({ attrs: { class: tw`space-y-4` } }, cards) : UI.EmptyState({ icon: '🥘', title: t.ui.orders_jobs_empty })
    ].filter(Boolean));
    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.['orders-jobs'] || 'lg',
      sizeKey: 'orders-jobs',
      title: `${t.ui.orders_jobs_title} — ${orderId}`,
      description: t.ui.orders_jobs_description,
      content,
      closeGkey: 'pos:order:jobs:details:close',  // Specific closeGkey for this modal
      actions: [UI.Button({ attrs: { gkey: 'pos:order:jobs:details:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
    });
  }

  function activateOrder(ctx, order, options = {}) {
    if (!order) return;
    // Check if this is a draft (local-only) order
    const isDraftOrder = order.id && String(order.id).startsWith('draft-');
    //console.log('[Mishkah][POS] activateOrder START', {
    //    orderId: order.id,
    //    type: order.type,
    //    isDraftOrder,
    //    isPersisted: order.isPersisted,
    //    tableIds: order.tableIds,
    //    customerId: order.customerId,
    //    totals: order.totals,
    //    version: order.version,
    //    currentVersion: order.currentVersion,
    //    expectedVersion: order.expectedVersion
    // });
    const typeConfig = getOrderTypeConfig(order.type || 'dine_in');
    // IMPORTANT: Preserve ALL critical order data when activating an existing order
    // ✅ CRITICAL FIX: Mark order and all lines as persisted if loading from backend
    const orderIsPersisted = isDraftOrder ? false : (order.isPersisted !== undefined ? order.isPersisted : true);
    let safeOrder = {
      ...order,
      // ✅ CRITICAL: Mark all lines as persisted if this is a persisted order
      // This ensures that when new items are added later, we can detect them (no isPersisted)
      lines: Array.isArray(order.lines)
        ? order.lines.map(line => ({
          ...line,
          isPersisted: orderIsPersisted ? true : line.isPersisted  // ✅ Mark as persisted for saved orders
        }))
        : [],
      notes: Array.isArray(order.notes) ? order.notes.map(note => ({ ...note })) : [],
      payments: Array.isArray(order.payments) ? order.payments.map(pay => ({ ...pay })) : [],
      dirty: false,
      discount: normalizeDiscount(order.discount),
      // Preserve critical fields that MUST NOT be lost when reopening an order
      id: order.id,
      // ✅ CRITICAL FIX: Explicitly preserve order type (delivery, takeaway, dine_in)
      // Without this, reopened orders lose their type and default to dine_in!
      // ✅ ADDED orderTypeId and order_type_id to fix issue where orders fetched from backend have orderTypeId instead of type
      type: order.type || order.orderType || order.order_type || order.orderTypeId || order.order_type_id || 'dine_in',
      // CRITICAL: Draft orders should NOT be marked as persisted (they only exist locally)
      isPersisted: orderIsPersisted,
      tableIds: Array.isArray(order.tableIds) ? order.tableIds.slice() : (order.tableId ? [order.tableId] : []),
      tableId: order.tableId || (Array.isArray(order.tableIds) && order.tableIds.length ? order.tableIds[0] : null),
      customerId: order.customerId || null,
      customerAddressId: order.customerAddressId || null,
      customerName: order.customerName || '',
      customerPhone: order.customerPhone || '',
      customerAddress: order.customerAddress || '',
      customerAreaId: order.customerAreaId || null,
      createdAt: order.createdAt || Date.now(),
      updatedAt: order.updatedAt || Date.now(),
      savedAt: order.savedAt || Date.now(),
      version: order.version || order.currentVersion || 1,
      currentVersion: order.currentVersion || order.version || 1,
      expectedVersion: order.expectedVersion || order.currentVersion || order.version || 1,
      status: order.status || 'open',
      fulfillmentStage: order.fulfillmentStage || order.stage || 'new',
      posId: order.posId || null,
      posLabel: order.posLabel || null,
      posNumber: order.posNumber || null,
      shiftId: order.shiftId || null,
      metadata: order.metadata ? { ...order.metadata } : {}
    };
    //console.log('🔍 [activateOrder] BEFORE enrichment:', {
    //    orderId: safeOrder.id,
    //    type: safeOrder.type,
    //    tableIds: safeOrder.tableIds,
    //    tableId: safeOrder.tableId,
    //    customerId: safeOrder.customerId,
    //    customerName: safeOrder.customerName,
    //    customerPhone: safeOrder.customerPhone,
    //    customerAddress: safeOrder.customerAddress,
    //    linesCount: safeOrder.lines?.length
    // });

    safeOrder = enrichOrderWithMenu(safeOrder);

    //console.log('🔍 [activateOrder] AFTER enrichment:', {
    //    orderId: safeOrder.id,
    //    type: safeOrder.type,
    //    tableIds: safeOrder.tableIds,
    //    tableId: safeOrder.tableId,
    //    customerId: safeOrder.customerId,
    //    customerName: safeOrder.customerName,
    //    customerPhone: safeOrder.customerPhone,
    //    customerAddress: safeOrder.customerAddress,
    //    linesCount: safeOrder.lines?.length
    // });

    //console.log('[Mishkah][POS] activateOrder AFTER enrichment', {
    //    orderId: safeOrder.id,
    //    isDraftOrder,
    //    isPersisted: safeOrder.isPersisted,
    //    tableIds: safeOrder.tableIds,
    //    customerId: safeOrder.customerId,
    //    totals: safeOrder.totals,
    //    version: safeOrder.version,
    //    currentVersion: safeOrder.currentVersion,
    //    expectedVersion: safeOrder.expectedVersion
    // });

    ctx.setState(s => {
      const data = s.data || {};
      const modals = { ...(s.ui?.modals || {}) };
      if (options.closeOrdersModal) modals.orders = false;
      const orderNavState = { ...(s.ui?.orderNav || {}) };
      if (options.hideOrderNavPad !== false) orderNavState.showPad = false;
      if (options.resetOrderNavValue) orderNavState.value = '';
      // CRITICAL FIX: Don't copy old payments to split for persisted orders
      // Old payments should stay in order.payments, not in payments.split
      // This prevents duplicate payment calculations and backend errors
      const paymentsSplit = safeOrder.isPersisted ? [] : (safeOrder.payments || []);
      const nextPayments = {
        ...(data.payments || {}),
        split: paymentsSplit
      };
      if (!Array.isArray(nextPayments.methods) || !nextPayments.methods.length) {
        nextPayments.methods = clonePaymentMethods(PAYMENT_METHODS);
      }
      // Always recalculate totals to ensure current tax/service rates
      //console.log('🔍 [activateOrder] BEFORE calculateTotals:', {
      //    linesCount: safeOrder.lines?.length || 0,
      //    firstLine: safeOrder.lines?.[0],
      //    settings: data.settings,
      //    orderType: safeOrder.type,
      //    orderDiscount: safeOrder.discount
      //});

      const totals = calculateTotals(safeOrder.lines || [], data.settings || {}, safeOrder.type || 'dine_in', { orderDiscount: safeOrder.discount });

      //console.log('🔍 [activateOrder] AFTER calculateTotals:', {
      //    totals,
      //    due: totals.due,
      //    subtotal: totals.subtotal,
      //    vat: totals.vat,
      //    service: totals.service
      //});

      const paymentEntries = getActivePaymentEntries({ ...safeOrder, totals }, nextPayments);
      const paymentSnapshot = summarizePayments(totals, paymentEntries);

      //console.log('🔍 [activateOrder] PAYMENT SNAPSHOT:', {
      //    paymentSnapshot,
      //    due: paymentSnapshot.due,
      //    paid: paymentSnapshot.paid,
      //    remaining: paymentSnapshot.remaining,
      //    state: paymentSnapshot.state
      //});

      //console.log('[Mishkah][POS] activateOrder PAYMENTS STATE', {
      //    isPersisted: safeOrder.isPersisted,
      //    orderPayments: safeOrder.payments?.length || 0,
      //    splitPayments: paymentsSplit.length,
      //    totalPaymentEntries: paymentEntries.length,
      //    paymentSnapshot
      //});
      //console.log('[Mishkah][POS] activateOrder FINAL STATE', {
      //  orderId: safeOrder.id,
      //  type: safeOrder.type,
      //  isDraftOrder,
      // isPersisted: safeOrder.isPersisted,
      //  tableIds: safeOrder.tableIds,
      //  customerId: safeOrder.customerId,
      //  totals,
      //  paymentState: paymentSnapshot.state,
      //   version: safeOrder.version,
      //  currentVersion: safeOrder.currentVersion,
      //  expectedVersion: safeOrder.expectedVersion
      //  });
      return {
        ...s,
        data: {
          ...data,
          order: {
            // ✅ CRITICAL FIX: Don't spread data.order first - it may have wrong type!
            // Instead, use safeOrder first, then only merge specific safe fields from data.order
            ...safeOrder,
            totals,
            paymentState: paymentSnapshot.state,
            // ✅ CRITICAL: Explicitly preserve type from safeOrder (don't let data.order override it!)
            type: safeOrder.type,
            allowAdditions: safeOrder.allowAdditions !== undefined ? safeOrder.allowAdditions : !!typeConfig.allowsLineAdditions,
            lockLineEdits: safeOrder.lockLineEdits !== undefined ? safeOrder.lockLineEdits : true,
            // ✅ CRITICAL FIX: Recalculate paymentsLocked when opening order
            // This ensures delivery/takeaway orders can accept payments when reopened
            paymentsLocked: isPaymentsLocked(safeOrder),
            isPersisted: safeOrder.isPersisted
          },
          payments: nextPayments
        },
        ui: {
          ...(s.ui || {}),
          modals,
          shift: { ...(s.ui?.shift || {}), showPin: false },
          orderNav: orderNavState
        }
      };
    });
  }

  function PaymentsSheet(db) {
    const t = getTexts(db);
    if (!db.ui.modals.payments) return null;
    const methods = (db.data.payments?.methods && db.data.payments.methods.length)
      ? db.data.payments.methods
      : PAYMENT_METHODS;
    const order = db.data.order || {};
    const isOrderFinalized = order.status === 'finalized' || order.isPersisted;
    const currentPayments = Array.isArray(db.data.payments?.split) ? db.data.payments.split : [];
    const totals = order.totals || {};
    const paymentsEntries = getActivePaymentEntries(order, db.data.payments);
    const paymentSnapshot = summarizePayments(totals, paymentsEntries);
    const totalDue = paymentSnapshot.due;
    const totalPaid = paymentSnapshot.paid;
    const remaining = paymentSnapshot.remaining;
    const remainingAmountSection = D.Containers.Div({ attrs: { class: tw`p-4 rounded-[var(--radius)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-white space-y-1 shadow-lg` } }, [
      D.Text.Span({ attrs: { class: tw`text-sm opacity-90` } }, [t.ui.balance_due || 'المتبقي غير المسدد']),
      D.Text.Strong({ attrs: { class: tw`text-3xl font-bold block` } }, [formatCurrencyValue(db, remaining)]),
      D.Containers.Div({ attrs: { class: tw`flex items-center justify-between text-xs opacity-80 pt-2 border-t border-white/20` } }, [
        D.Text.Span({}, [`${t.ui.total || 'الإجمالي'}: ${formatCurrencyValue(db, totalDue)}`]),
        D.Text.Span({}, [`${t.ui.paid || 'مدفوع'}: ${formatCurrencyValue(db, totalPaid)}`])
      ])
    ]);
    const paymentsListSection = currentPayments.length > 0
      ? D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        D.Text.Strong({ attrs: { class: tw`text-sm` } }, [t.ui.recorded_payments || 'الدفعات المسجلة']),
        D.Containers.Div({ attrs: { class: tw`space-y-1` } }, currentPayments.map(pay => {
          const method = methods.find(m => m.id === pay.method) || { id: pay.method, label: { ar: pay.method, en: pay.method }, icon: '💰' };
          return UI.HStack({ attrs: { class: tw`items-center justify-between rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-sm` } }, [
            D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
              D.Text.Span({}, [method.icon]),
              D.Text.Span({}, [localize(method.label, db.env.lang)]),
              D.Text.Span({ attrs: { class: tw`font-semibold` } }, [formatCurrencyValue(db, pay.amount)])
            ]),
            !isOrderFinalized
              ? UI.Button({
                attrs: { gkey: 'pos:payments:delete', 'data-payment-id': pay.id, class: tw`h-7 w-7 p-0` },
                variant: 'ghost',
                size: 'sm'
              }, [D.Text.Span({ attrs: { class: tw`text-red-500` } }, ['🗑️'])])
              : null
          ].filter(Boolean));
        }))
      ])
      : null;
    return UI.Drawer({
      open: true,
      side: 'end',
      closeGkey: 'pos:payments:close',
      panelAttrs: { class: tw`w-[min(420px,92vw)] sm:w-[420px]` },
      header: D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2` } }, [
        D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
          D.Text.Strong({}, [t.ui.payments]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [t.ui.split_payments])
        ]),
        UI.Button({ attrs: { gkey: 'pos:payments:close' }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-lg` } }, ['✕'])])
      ]),
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        remainingAmountSection,
        paymentsListSection,
        UI.ChipGroup({
          attrs: { class: tw`text-base sm:text-lg border-2 border-[var(--accent)]/20 rounded-lg p-2` },
          items: methods.map(method => ({
            id: method.id,
            label: `${method.icon} ${localize(method.label, db.env.lang)}`,
            attrs: { gkey: 'pos:payments:method', 'data-method-id': method.id, class: tw`ring-2 ring-transparent data-[active=true]:ring-[var(--accent)] data-[active=true]:ring-offset-2 data-[active=true]:scale-105 transition-all` }
          })),
          activeId: db.data.payments.activeMethod
        }),
        UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: db.ui.paymentDraft?.amount || '',
          placeholder: t.ui.amount,
          gkey: 'pos:payments:amount',
          confirmLabel: t.ui.capture_payment,
          confirmAttrs: { gkey: 'pos:payments:capture', variant: 'solid', size: 'md', class: tw`w-full` }
        }),
        UI.Button({ attrs: { gkey: 'pos:payments:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ].filter(Boolean))
    });
  }

  function DiscountOrderModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.discountOrder) return null;
    const order = db.data.order || {};
    const lines = order.lines || [];
    const baseTotals = calculateTotals(lines, db.data.settings || {}, order.type || 'dine_in', { orderDiscount: null });
    const baseSubtotal = baseTotals.subtotal || 0;
    const currentDiscount = normalizeDiscount(order.discount);
    const displayValue = currentDiscount
      ? currentDiscount.type === 'percent'
        ? String(currentDiscount.value)
        : String(currentDiscount.value)
      : '';
    const discountType = db.ui.discountDraft?.type || (currentDiscount?.type || 'amount');
    const inputValue = db.ui.discountDraft?.value || displayValue;

    return UI.Modal({
      open: true,
      size: 'sm',
      title: t.ui.discount_action,
      description: t.toast.enter_order_discount || 'أدخل قيمة الخصم',
      closeGkey: 'pos:discount:close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        UI.Segmented({
          items: [
            { id: 'amount', label: t.ui.discount_amount || 'مبلغ', attrs: { gkey: 'pos:discount:type', 'data-type': 'amount' } },
            { id: 'percent', label: t.ui.discount_percent || 'نسبة %', attrs: { gkey: 'pos:discount:type', 'data-type': 'percent' } }
          ],
          activeId: discountType
        }),
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [
          discountType === 'percent'
            ? (t.ui.discount_percent_hint || 'أدخل النسبة المئوية')
            : (t.ui.discount_amount_hint || `الحد الأقصى: ${formatCurrencyValue(db, baseSubtotal)}`)
        ]),
        UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: inputValue,
          placeholder: discountType === 'percent' ? '0%' : formatCurrencyValue(db, 0),
          gkey: 'pos:discount:input',
          confirmLabel: t.ui.apply || 'تطبيق',
          confirmAttrs: { gkey: 'pos:discount:apply', variant: 'solid', size: 'md', class: tw`w-full` }
        })
      ]),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:discount:remove', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.remove_discount || 'إزالة الخصم']),
        UI.Button({ attrs: { gkey: 'pos:discount:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function LineDiscountModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.lineDiscount) return null;
    const draft = db.ui.lineDiscount || {};
    const lineId = draft.lineId;
    const order = db.data.order || {};
    const line = (order.lines || []).find(entry => entry.id === lineId);
    if (!line) {
      return UI.Modal({
        open: true,
        size: 'sm',
        title: t.ui.discount_action,
        description: t.toast.order_nav_not_found,
        closeGkey: 'pos:line-discount:close',
        actions: [UI.Button({ attrs: { gkey: 'pos:line-discount:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
      });
    }
    const lang = db.env.lang;
    const unitPrice = getLineUnitPrice(line);
    const maxAmount = draft.baseAmount != null ? Number(draft.baseAmount) : Math.max(0, round(unitPrice * (Number(line.qty) || 0)));
    const discountInfo = normalizeDiscount(line.discount);
    const type = draft.type || discountInfo?.type || 'amount';
    const value = draft.value ?? (discountInfo ? String(discountInfo.value) : '');
    const hint = type === 'percent'
      ? (t.ui.discount_percent_hint || 'أدخل النسبة المئوية')
      : `${t.ui.discount_amount_hint || 'أدخل قيمة الخصم'} – ≤ ${formatCurrencyValue(db, maxAmount)}`;
    const summaryRows = D.Containers.Div({ attrs: { class: tw`space-y-1 text-xs ${token('muted')}` } }, [
      D.Text.Span({}, [`${localize(line.name, lang)} × ${line.qty}`]),
      D.Text.Span({}, [`${t.ui.total}: ${formatCurrencyValue(db, line.total)}`])
    ]);
    return UI.Modal({
      open: true,
      size: 'sm',
      title: t.ui.discount_action,
      description: localize(line.name, lang),
      closeGkey: 'pos:line-discount:close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        summaryRows,
        UI.Segmented({
          items: [
            { id: 'amount', label: t.ui.discount_amount || 'مبلغ', attrs: { gkey: 'pos:line-discount:type', 'data-type': 'amount' } },
            { id: 'percent', label: t.ui.discount_percent || 'نسبة %', attrs: { gkey: 'pos:line-discount:type', 'data-type': 'percent' } }
          ],
          activeId: type
        }),
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [hint]),
        UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: value,
          placeholder: type === 'percent' ? '0%' : formatCurrencyValue(db, 0),
          gkey: 'pos:line-discount:input',
          confirmLabel: t.ui.discount_action,
          confirmAttrs: { gkey: 'pos:line-discount:apply', variant: 'solid', size: 'md', class: tw`w-full` }
        })
      ]),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:line-discount:clear', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.remove_discount || 'إزالة الخصم']),
        UI.Button({ attrs: { gkey: 'pos:line-discount:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function ReturnsModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.returns) return null;
    const order = db.data.order || {};
    const draft = db.ui.returnsDraft || { options: calculateReturnOptions(order), selections: {} };
    const lang = db.env.lang;
    const options = Array.isArray(draft.options) && draft.options.length ? draft.options : calculateReturnOptions(order);
    const selections = draft.selections || {};
    const previousReturns = Array.isArray(order.returns) ? order.returns : [];
    if (!options.length) {
      return UI.Modal({
        open: true,
        size: 'md',
        title: t.ui.returns || 'المرتجعات',
        description: t.ui.orders_no_results,
        closeGkey: 'pos:returns:close',
        content: UI.EmptyState({ icon: '↩️', title: t.ui.returns || 'المرتجعات', description: t.ui.orders_no_results }),
        actions: [UI.Button({ attrs: { gkey: 'pos:returns:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
      });
    }
    const selectedLines = options.filter(opt => (selections?.[opt.line.id] || 0) > 0);
    const totalAmount = selectedLines.reduce((sum, opt) => {
      const qty = selections?.[opt.line.id] || 0;
      if (qty <= 0) return sum;
      const unit = getLineUnitPrice(opt.line);
      return sum + qty * unit;
    }, 0);
    const hasSelection = totalAmount > 0;
    const optionItems = options.map(opt => {
      const line = opt.line;
      const qtySelected = selections?.[line.id] || 0;
      const checked = qtySelected > 0;
      const unitPrice = getLineUnitPrice(line);
      return UI.Card({
        variant: 'card/soft-2',
        content: D.Containers.Div({ attrs: { class: tw`flex flex-col gap-2` } }, [
          D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2` } }, [
            D.Forms.Label({ attrs: { class: tw`flex items-center gap-2 font-semibold` } }, [
              D.Inputs.Input({ attrs: { type: 'checkbox', checked: checked ? 'checked' : undefined, 'data-line-id': line.id, gkey: 'pos:returns:toggle' } }),
              D.Text.Span({}, [localize(line.name, lang)])
            ]),
            D.Text.Span({ attrs: { class: tw`text-sm ${token('muted')}` } }, [`${formatCurrencyValue(db, unitPrice)} × ${line.qty}`])
          ]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [
            `${t.ui.orders_line_count || 'الكمية'}: ${line.qty} • ${t.ui.returns || 'المرتجعات'}: ${opt.returned} • ${t.ui.balance_due || 'المتبقي'}: ${opt.remaining}`
          ]),
          checked
            ? UI.HStack({ attrs: { class: tw`items-center justify-between gap-3` } }, [
              UI.HStack({ attrs: { class: tw`items-center gap-2` } }, [
                UI.Button({
                  attrs: { gkey: 'pos:returns:qty:dec', 'data-line-id': line.id, disabled: qtySelected <= 1 ? 'disabled' : undefined },
                  variant: 'ghost',
                  size: 'sm'
                }, ['−']),
                D.Text.Strong({}, [String(qtySelected)]),
                UI.Button({
                  attrs: { gkey: 'pos:returns:qty:inc', 'data-line-id': line.id, disabled: qtySelected >= opt.remaining ? 'disabled' : undefined },
                  variant: 'ghost',
                  size: 'sm'
                }, ['＋'])
              ]),
              D.Text.Strong({}, [formatCurrencyValue(db, qtySelected * unitPrice)])
            ])
            : null
        ].filter(Boolean))
      });
    });
    const previousReturnsList = previousReturns.length
      ? UI.Card({
        variant: 'card/soft-1',
        content: D.Containers.Div({ attrs: { class: tw`space-y-2` } }, previousReturns.map(ret => {
          const lines = Array.isArray(ret.lines) ? ret.lines : [];
          const amount = lines.reduce((sum, entry) => {
            const baseLine = (order.lines || []).find(line => line.id === (entry.lineId || entry.id));
            const unit = baseLine ? getLineUnitPrice(baseLine) : 0;
            return sum + unit * (Number(entry.quantity) || 0);
          }, 0);
          return UI.ListItem({
            leading: '↩️',
            content: [
              D.Text.Strong({}, [ret.id || 'RET']),
              D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [formatDateTime(ret.createdAt || ret.savedAt || Date.now(), lang)])
            ],
            trailing: D.Text.Span({}, [formatCurrencyValue(db, amount)])
          });
        }))
      })
      : null;
    return UI.Modal({
      open: true,
      size: 'lg',
      title: t.ui.returns || 'المرتجعات',
      description: order.id ? `${t.ui.order_id || 'طلب'} ${order.id}` : '',
      closeGkey: 'pos:returns:close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [t.ui.orders_line_count || 'اختر الأصناف لإرجاعها']),
        D.Containers.Div({ attrs: { class: tw`space-y-2` } }, optionItems),
        UI.Divider(),
        UI.HStack({ attrs: { class: tw`${token('split')} text-sm font-semibold` } }, [
          D.Text.Span({}, [t.ui.total || 'الإجمالي']),
          UI.PriceText({ amount: round(totalAmount), currency: getCurrency(db), locale: getLocale(db) })
        ]),
        previousReturnsList
      ].filter(Boolean)),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:returns:save', class: tw`w-full`, disabled: hasSelection ? undefined : 'disabled' }, variant: 'solid', size: 'sm' }, [t.ui.save || 'حفظ']),
        UI.Button({ attrs: { gkey: 'pos:returns:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function LineModifiersModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.modifiers) return null;
    const order = db.data.order || {};
    const state = db.ui.lineModifiers || {};
    const lineId = state.lineId;
    const line = (order.lines || []).find(entry => entry.id === lineId);
    const lang = db.env.lang;
    const catalog = db.data.modifiers || { addOns: [], removals: [] };
    const selectedAddOns = new Set((state.addOns || []).map(String));
    const selectedRemovals = new Set((state.removals || []).map(String));
    const mapModifier = (entry) => entry ? { id: String(entry.id), type: entry.type, label: entry.label, priceChange: Number(entry.priceChange ?? entry.price_change ?? 0) } : null;
    const selectedModifiers = [
      ...catalog.addOns.filter(entry => selectedAddOns.has(String(entry.id))).map(mapModifier),
      ...catalog.removals.filter(entry => selectedRemovals.has(String(entry.id))).map(mapModifier)
    ].filter(Boolean);
    const previewLine = line ? applyLinePricing({ ...line, modifiers: selectedModifiers }) : null;

    const buildModifierButtons = (items, type, selected) => {
      if (!items.length) {
        return UI.EmptyState({ icon: 'ℹ️', title: t.ui.line_modifiers_empty });
      }
      return D.Containers.Div({ attrs: { class: tw`grid grid-cols-1 gap-2 sm:grid-cols-2` } }, items.map(item => {
        const active = selected.has(String(item.id));
        const delta = Number(item.priceChange ?? item.price_change ?? 0) || 0;
        const price = delta ? `${delta > 0 ? '+' : '−'} ${formatCurrencyValue(db, Math.abs(delta))}` : t.ui.line_modifiers_free;
        return UI.Button({
          attrs: {
            gkey: 'pos:order:line:modifiers.toggle',
            'data-line-id': lineId,
            'data-mod-type': type,
            'data-mod-id': item.id,
            class: tw`justify-between`
          },
          variant: active ? 'solid' : 'ghost',
          size: 'sm'
        }, [
          D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [localize(item.label, lang)]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [price])
        ]);
      }));
    };

    const addOnsSection = buildModifierButtons(catalog.addOns || [], 'add_on', selectedAddOns);
    const removalsSection = buildModifierButtons(catalog.removals || [], 'removal', selectedRemovals);
    const summaryRows = line && previewLine
      ? D.Containers.Div({ attrs: { class: tw`space-y-2 rounded-[var(--radius)] bg-[color-mix(in oklab,var(--surface-2) 90%, transparent)] px-3 py-2 text-sm` } }, [
        UI.HStack({ attrs: { class: tw`justify-between` } }, [
          D.Text.Span({}, [t.ui.line_modifiers_unit]),
          UI.PriceText({ amount: previewLine.price, currency: getCurrency(db), locale: getLocale(db) })
        ]),
        UI.HStack({ attrs: { class: tw`justify-between` } }, [
          D.Text.Span({}, [t.ui.total]),
          UI.PriceText({ amount: previewLine.total, currency: getCurrency(db), locale: getLocale(db) })
        ])
      ])
      : null;

    const description = line
      ? `${localize(line.name, lang)} × ${line.qty}`
      : t.ui.line_modifiers_missing;

    return UI.Modal({
      open: true,
      title: t.ui.line_modifiers_title,
      description,
      closeGkey: 'pos:order:line:modifiers.close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
          D.Text.Strong({}, [t.ui.line_modifiers_addons]),
          addOnsSection
        ]),
        D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
          D.Text.Strong({}, [t.ui.line_modifiers_removals]),
          removalsSection
        ]),
        summaryRows
      ].filter(Boolean)),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:order:line:modifiers.close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close]),
        line ? UI.Button({ attrs: { gkey: 'pos:order:line:modifiers.apply', 'data-line-id': lineId, class: tw`w-full` }, variant: 'solid', size: 'sm' }, [t.ui.line_modifiers_apply]) : null
      ].filter(Boolean)
    });
  }

  function CustomersModal(db) {
    const t = getTexts(db);
    const customerUI = db.ui.customer || {};
    if (!customerUI.open) return null;
    const mode = customerUI.mode || 'search';
    const searchValue = customerUI.search || '';
    const keypadValue = customerUI.keypad || '';
    const customers = Array.isArray(db.data.customers) ? db.data.customers : [];
    const normalizedSearch = searchValue.trim().toLowerCase();
    const filteredCustomers = normalizedSearch
      ? customers.filter(customer => {
        const nameMatch = (customer.name || '').toLowerCase().includes(normalizedSearch);
        const phoneMatch = (customer.phones || []).some(phone => String(phone).includes(normalizedSearch));
        return nameMatch || phoneMatch;
      })
      : customers;
    let selectedCustomerId = customerUI.selectedCustomerId || db.data.order.customerId || null;
    if (mode === 'search' && selectedCustomerId && !filteredCustomers.some(customer => customer.id === selectedCustomerId)) {
      selectedCustomerId = null;
    }
    const selectedCustomer = selectedCustomerId ? findCustomer(customers, selectedCustomerId) : null;
    let selectedAddressId = customerUI.selectedAddressId || db.data.order.customerAddressId || null;
    if (mode === 'search' && selectedCustomer) {
      if (!selectedAddressId || !(selectedCustomer.addresses || []).some(address => address.id === selectedAddressId)) {
        selectedAddressId = selectedCustomer.addresses?.[0]?.id || selectedAddressId;
      }
    } else if (!selectedCustomer) {
      selectedAddressId = null;
    }
    const selectedAddress = selectedCustomer ? findCustomerAddress(selectedCustomer, selectedAddressId) : null;
    const areaOptions = (db.data.customerAreas || CAIRO_DISTRICTS).map(area => ({ value: area.id, label: db.env.lang === 'ar' ? area.ar : area.en }));
    const tabs = UI.Segmented({
      items: [
        { id: 'search', label: `🔎 ${t.ui.customer_tab_search}`, attrs: { gkey: 'pos:customer:mode', 'data-mode': 'search' } },
        { id: 'create', label: `➕ ${t.ui.customer_tab_create}`, attrs: { gkey: 'pos:customer:mode', 'data-mode': 'create' } }
      ],
      activeId: mode
    });
    const customerList = filteredCustomers.length
      ? UI.List({
        children: filteredCustomers.map(customer => UI.ListItem({
          leading: '👤',
          content: [
            D.Text.Strong({ attrs: { class: tw`text-sm` } }, [customer.name]),
            D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [customer.phones.join(' • ')])
          ],
          trailing: customer.addresses?.length ? UI.Badge({ text: String(customer.addresses.length), variant: 'badge/ghost' }) : null,
          attrs: {
            gkey: 'pos:customer:select',
            'data-customer-id': customer.id,
            class: tw`${customer.id === selectedCustomerId ? 'border-[var(--primary)] bg-[color-mix(in oklab,var(--primary) 10%, var(--surface-1))]' : ''}`
          }
        }))
      })
      : UI.EmptyState({ icon: '🕵️‍♀️', title: t.ui.customer_no_results, description: t.ui.customer_search_placeholder });
    const addressList = selectedCustomer && selectedCustomer.addresses?.length
      ? UI.List({
        children: selectedCustomer.addresses.map(address => UI.ListItem({
          leading: '📍',
          content: [
            D.Text.Strong({ attrs: { class: tw`text-sm` } }, [address.title || t.ui.customer_address_title]),
            D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [
              `${getDistrictLabel(address.areaId, db.env.lang)}${address.line ? ' • ' + address.line : ''}`
            ])
          ],
          trailing: UI.Button({ attrs: { gkey: 'pos:customer:address:select', 'data-address-id': address.id, class: tw`h-8 rounded-full px-3 text-xs` }, variant: 'soft', size: 'sm' }, [address.id === selectedAddressId ? '✅' : t.ui.customer_select_address]),
          attrs: {
            class: tw`${address.id === selectedAddressId ? 'border-[var(--primary)] bg-[color-mix(in oklab,var(--primary) 12%, var(--surface-1))]' : ''}`
          }
        }))
      })
      : UI.EmptyState({ icon: '📭', title: t.ui.customer_addresses, description: t.ui.customer_multi_address_hint });
    const selectedDetails = selectedCustomer
      ? UI.Card({
        variant: 'card/soft-1',
        title: selectedCustomer.name,
        content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
          D.Text.Span({ attrs: { class: tw`text-sm` } }, [`${t.ui.customer_phones}: ${selectedCustomer.phones.join(' • ')}`]),
          addressList,
          D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2` } }, [
            UI.Button({ attrs: { gkey: 'pos:customer:attach', class: tw`flex-1` }, variant: 'solid', size: 'sm' }, ['✅ ', t.ui.customer_attach]),
            UI.Button({ attrs: { gkey: 'pos:customer:edit', class: tw`flex-1` }, variant: 'ghost', size: 'sm' }, ['✏️ ', t.ui.customer_edit_action || t.ui.customer_create])
          ])
        ])
      })
      : UI.EmptyState({ icon: '👤', title: t.ui.customer_use_existing || t.ui.customer_tab_search, description: t.ui.customer_search_placeholder });
    const searchColumn = UI.Card({
      variant: 'card/soft-1',
      title: t.ui.customer_search,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        UI.Input({ attrs: { type: 'search', value: searchValue, placeholder: t.ui.customer_search_placeholder, gkey: 'pos:customer:search' } }),
        UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: keypadValue,
          placeholder: t.ui.customer_keypad,
          gkey: 'pos:customer:keypad',
          allowDecimal: false,
          confirmLabel: t.ui.customer_search,
          confirmAttrs: { gkey: 'pos:customer:keypad:confirm', variant: 'solid', size: 'sm', class: tw`w-full` }
        }),
        customerList
      ])
    });
    const formState = customerUI.form || createEmptyCustomerForm();
    const formPhones = Array.isArray(formState.phones) && formState.phones.length ? formState.phones : [''];
    const formAddresses = Array.isArray(formState.addresses) && formState.addresses.length ? formState.addresses : [createEmptyCustomerForm().addresses[0]];
    const phoneFields = D.Containers.Div({ attrs: { class: tw`space-y-2` } }, formPhones.map((phone, index) => UI.HStack({ attrs: { class: tw`items-center gap-2` } }, [
      UI.Input({ attrs: { value: phone, placeholder: t.ui.customer_phone, gkey: 'pos:customer:form:phone', 'data-index': index, inputmode: 'tel' } }),
      formPhones.length > 1 ? UI.Button({ attrs: { gkey: 'pos:customer:form:phone:remove', 'data-index': index, class: tw`h-9 rounded-full px-3 text-xs` }, variant: 'ghost', size: 'sm' }, ['✕']) : null
    ].filter(Boolean))));
    const addressFields = D.Containers.Div({ attrs: { class: tw`space-y-3` } }, formAddresses.map((address, index) => UI.Card({
      variant: 'card/soft-2',
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        UI.Field({ label: t.ui.customer_address_title, control: UI.Input({ attrs: { value: address.title || '', gkey: 'pos:customer:form:address:title', 'data-index': index, placeholder: t.ui.customer_address_title } }) }),
        UI.Field({ label: t.ui.customer_area, control: UI.Select({ attrs: { value: address.areaId || '', gkey: 'pos:customer:form:address:area', 'data-index': index }, options: areaOptions }) }),
        UI.Field({ label: t.ui.customer_address_line, control: UI.Input({ attrs: { value: address.line || '', gkey: 'pos:customer:form:address:line', 'data-index': index, placeholder: t.ui.customer_address_line } }) }),
        UI.Field({ label: t.ui.customer_address_notes, control: UI.Textarea({ attrs: { value: address.notes || '', gkey: 'pos:customer:form:address:notes', 'data-index': index, rows: 2, placeholder: t.ui.customer_address_notes } }) }),
        formAddresses.length > 1 ? UI.Button({ attrs: { gkey: 'pos:customer:form:address:remove', 'data-index': index, class: tw`w-full` }, variant: 'ghost', size: 'sm' }, ['🗑️ ', t.ui.customer_remove_address]) : null
      ].filter(Boolean))
    })));
    const formColumn = UI.Card({
      variant: 'card/soft-1',
      title: formState.id ? t.ui.customer_edit : t.ui.customer_new,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        UI.Field({ label: t.ui.customer_name, control: UI.Input({ attrs: { value: formState.name || '', gkey: 'pos:customer:form:name', placeholder: t.ui.customer_name } }) }),
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [t.ui.customer_multi_phone_hint]),
        phoneFields,
        UI.Button({ attrs: { gkey: 'pos:customer:form:phone:add', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, ['➕ ', t.ui.customer_add_phone]),
        UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: keypadValue,
          placeholder: t.ui.customer_keypad,
          gkey: 'pos:customer:keypad',
          allowDecimal: false,
          confirmLabel: t.ui.customer_add_phone,
          confirmAttrs: { gkey: 'pos:customer:form:keypad:confirm', variant: 'solid', size: 'sm', class: tw`w-full` }
        }),
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [t.ui.customer_multi_address_hint]),
        addressFields,
        UI.Button({ attrs: { gkey: 'pos:customer:form:address:add', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, ['➕ ', t.ui.customer_add_address]),
        D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2` } }, [
          UI.Button({ attrs: { gkey: 'pos:customer:save', class: tw`flex-1` }, variant: 'solid', size: 'sm' }, ['💾 ', t.ui.customer_create]),
          UI.Button({ attrs: { gkey: 'pos:customer:form:reset', class: tw`flex-1` }, variant: 'ghost', size: 'sm' }, ['↺ ', t.ui.customer_form_reset || t.ui.clear])
        ])
      ])
    });
    const bodyContent = mode === 'search'
      ? D.Containers.Div({ attrs: { class: tw`grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]` } }, [searchColumn, selectedDetails])
      : D.Containers.Div({ attrs: { class: tw`grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]` } }, [formColumn, D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        D.Text.Span({ attrs: { class: tw`text-sm ${token('muted')}` } }, [t.ui.customer_multi_phone_hint]),
        D.Text.Span({ attrs: { class: tw`text-sm ${token('muted')}` } }, [t.ui.customer_multi_address_hint])
      ])]);
    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.customers || 'full',
      sizeKey: 'customers',
      closeGkey: 'pos:customer:close',
      title: t.ui.customer_center,
      description: mode === 'search' ? t.ui.customer_use_existing || t.ui.customer_search : t.ui.customer_new,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [tabs, bodyContent]),
      actions: [UI.Button({ attrs: { gkey: 'pos:customer:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
    });
  }

  function SettingsDrawer(db) {
    const t = getTexts(db);
    const uiSettings = db.ui.settings || {};
    if (!uiSettings.open) return null;
    const activeTheme = uiSettings.activeTheme || db.env.theme || 'dark';
    const themePrefs = db.data.themePrefs || {};
    const currentPrefs = themePrefs[activeTheme] || {};
    const colorPrefs = currentPrefs.colors || {};
    const fontPrefs = currentPrefs.fonts || {};
    const paletteDefaults = (BASE_PALETTE && BASE_PALETTE[activeTheme]) || {};

    const colorFields = [
      { key: '--background', label: t.ui.settings_color_background, fallback: paletteDefaults.background },
      { key: '--foreground', label: t.ui.settings_color_foreground, fallback: paletteDefaults.foreground },
      { key: '--primary', label: t.ui.settings_color_primary, fallback: paletteDefaults.primary },
      { key: '--accent', label: t.ui.settings_color_accent, fallback: paletteDefaults.accent },
      { key: '--muted', label: t.ui.settings_color_muted, fallback: paletteDefaults.muted }
    ];

    const themeTabs = UI.Segmented({
      items: [
        { id: 'light', label: `☀️ ${t.ui.settings_light}`, attrs: { gkey: 'pos:settings:theme', 'data-theme': 'light' } },
        { id: 'dark', label: `🌙 ${t.ui.settings_dark}`, attrs: { gkey: 'pos:settings:theme', 'data-theme': 'dark' } }
      ],
      activeId: activeTheme
    });

    const normalizeColor = (value, fallback) => {
      const source = value || fallback || '#000000';
      if (!source) return '#000000';
      const trimmed = String(source).trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed.length === 4
        ? '#' + trimmed.slice(1).split('').map(ch => ch + ch).join('')
        : trimmed;
      const nums = trimmed.match(/[-]?[\d\.]+/g);
      if (!nums || nums.length < 3) return '#000000';
      if (trimmed.startsWith('rgb')) {
        const [r, g, b] = nums.map(n => Math.max(0, Math.min(255, Math.round(Number(n)))));
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      }
      if (trimmed.startsWith('hsl')) {
        const [hRaw, sRaw, lRaw] = nums.map(Number);
        const h = ((hRaw % 360) + 360) % 360;
        const s = (sRaw > 1 ? sRaw / 100 : sRaw);
        const l = (lRaw > 1 ? lRaw / 100 : lRaw);
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return '#' + toHex(r) + toHex(g) + toHex(b);
      }
      return '#000000';
    };

    const colorControls = D.Containers.Div({ attrs: { class: tw`space-y-3` } }, colorFields.map(field => {
      const value = normalizeColor(colorPrefs[field.key], field.fallback);
      return UI.Field({
        label: field.label,
        control: UI.Input({ attrs: { type: 'color', value, gkey: 'pos:settings:color', 'data-css-var': field.key } })
      });
    }));

    const fontSizeValue = fontPrefs.base || '16px';
    const fontControl = UI.Field({
      label: t.ui.settings_font_base,
      control: UI.Input({ attrs: { type: 'number', min: '12', max: '24', step: '0.5', value: String(parseFloat(fontSizeValue) || 16), gkey: 'pos:settings:font' } })
    });

    const resetButton = UI.Button({
      attrs: { gkey: 'pos:settings:reset', class: tw`w-full` },
      variant: 'ghost',
      size: 'sm'
    }, [`↺ ${t.ui.settings_reset}`]);

    return UI.Drawer({
      open: true,
      side: 'end',
      header: D.Containers.Div({ attrs: { class: tw`flex items-center justify-between` } }, [
        D.Text.Strong({}, [t.ui.settings_center]),
        UI.Button({ attrs: { gkey: 'pos:settings:close' }, variant: 'ghost', size: 'sm' }, ['✕'])
      ]),
      content: D.Containers.Div({ attrs: { class: tw`flex h-full flex-col gap-4` } }, [
        D.Text.Span({ attrs: { class: tw`text-sm ${token('muted')}` } }, [t.ui.settings_theme]),
        themeTabs,
        UI.Divider(),
        D.Text.Strong({ attrs: { class: tw`text-sm` } }, [t.ui.settings_colors]),
        colorControls,
        UI.Divider(),
        D.Text.Strong({ attrs: { class: tw`text-sm` } }, [t.ui.settings_fonts]),
        fontControl,
        resetButton
      ])
    });
  }

  function ShiftPinDialog(db) {
    const shiftUI = db.ui.shift || {};
    if (!shiftUI.showPin) return null;
    const t = getTexts(db);
    const openingFloat = shiftUI.openingFloat ?? db.data.shift?.config?.openingFloat ?? SHIFT_OPEN_FLOAT_DEFAULT;
    const pinLength = db.data.shift?.config?.pinLength || SHIFT_PIN_LENGTH;
    const pinPlaceholder = '•'.repeat(Math.max(pinLength || 0, 4));
    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.['shift-pin'] || 'sm',
      sizeKey: 'shift-pin',
      closeGkey: 'pos:shift:pin:cancel',
      title: t.ui.shift_open,
      description: t.ui.shift_open_prompt,
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        UI.NumpadDecimal({
          value: shiftUI.pin || '',
          placeholder: pinPlaceholder,
          gkey: 'pos:shift:pin',
          allowDecimal: false,
          masked: true,
          maskLength: pinLength,
          confirmLabel: t.ui.shift_open,
          confirmAttrs: { gkey: 'pos:shift:pin:confirm', variant: 'solid', size: 'sm', class: tw`w-full` }
        }),
        UI.Field({
          label: t.ui.shift_cash_start,
          control: UI.Input({ attrs: { type: 'number', step: '0.01', value: String(openingFloat ?? 0), gkey: 'pos:shift:opening-float' } })
        })
      ]),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:shift:pin:cancel', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }

  function ShiftSummaryModal(db) {
    const t = getTexts(db);
    const shiftUI = db.ui.shift || {};
    if (!shiftUI.showSummary) return null;
    const shiftState = db.data.shift || {};
    const history = Array.isArray(shiftState.history) ? shiftState.history : [];
    const current = shiftState.current || null;
    const defaultViewId = shiftUI.viewShiftId || (current ? current.id : (history[history.length - 1]?.id || null));
    let viewingCurrent = false;
    let shift = null;
    if (current && current.id === defaultViewId) {
      shift = current;
      viewingCurrent = true;
    } else {
      shift = history.find(item => item.id === defaultViewId) || (current || history[history.length - 1] || null);
      viewingCurrent = !!(shift && current && shift.id === current.id);
    }
    if (!shift) {
      return UI.Modal({
        open: true,
        size: db.ui?.modalSizes?.['shift-summary'] || 'md',
        sizeKey: 'shift-summary',
        title: t.ui.shift_summary,
        description: t.ui.shift_history_empty,
        actions: [UI.Button({ attrs: { gkey: 'pos:shift:summary:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
      });
    }
    const lang = db.env.lang;
    const report = summarizeShiftOrders(db.data.ordersHistory, shift);
    const totalsByType = report.totalsByType || {};
    const paymentsByMethod = report.paymentsByMethod || {};
    const countsByType = report.countsByType || {};
    const dineInTotal = round(totalsByType.dine_in || 0);
    const takeawayTotal = round(totalsByType.takeaway || 0);
    const deliveryTotal = round(totalsByType.delivery || 0);
    const totalSales = report.totalSales != null ? round(report.totalSales) : round(dineInTotal + takeawayTotal + deliveryTotal);
    const paymentMethods = Array.isArray(db.data.payments?.methods) && db.data.payments.methods.length ? db.data.payments.methods : PAYMENT_METHODS;
    const paymentRows = paymentMethods.map(method => {
      const amount = round(paymentsByMethod[method.id] || 0);
      return UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Text.Span({}, [`${method.icon || '💳'} ${localize(method.label, lang)}`]),
        UI.PriceText({ amount, currency: getCurrency(db), locale: getLocale(db) })
      ]);
    });
    Object.keys(paymentsByMethod).forEach(key => {
      if (paymentMethods.some(method => method.id === key)) return;
      const amount = round(paymentsByMethod[key] || 0);
      paymentRows.push(UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Text.Span({}, [key]),
        UI.PriceText({ amount, currency: getCurrency(db), locale: getLocale(db) })
      ]));
    });
    const openingFloat = round(shift.openingFloat || 0);
    const cashCollected = round(paymentsByMethod.cash || 0);
    const closingCash = shift.closingCash != null ? round(shift.closingCash) : round(openingFloat + cashCollected);
    const ordersCount = report.ordersCount != null ? report.ordersCount : (Array.isArray(shift.orders) ? shift.orders.length : 0);
    const openedLabel = shift.openedAt ? formatDateTime(shift.openedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const closedLabel = shift.closedAt ? formatDateTime(shift.closedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const chipsSection = (() => {
      const items = [];
      if (current) {
        items.push({ id: current.id, label: `${t.ui.shift_current}`, attrs: { gkey: 'pos:shift:view', 'data-shift-id': current.id } });
      }
      history.forEach(item => {
        const label = item.openedAt ? formatDateTime(item.openedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : item.id;
        items.push({ id: item.id, label, attrs: { gkey: 'pos:shift:view', 'data-shift-id': item.id } });
      });
      if (!items.length) return null;
      const labelText = viewingCurrent ? t.ui.shift_current : t.ui.shift_select_history;
      return D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
        D.Text.Span({ attrs: { class: tw`text-sm font-medium` } }, [labelText]),
        UI.ChipGroup({ items, activeId: shift.id })
      ]);
    })();
    const renderTypeRow = (typeId, labelText) => {
      const amount = round(totalsByType[typeId] || 0);
      const count = countsByType[typeId] || 0;
      return UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Text.Span({}, [labelText]),
          count ? UI.Badge({ text: String(count), variant: 'badge/ghost', attrs: { class: tw`text-[0.65rem]` } }) : null
        ].filter(Boolean)),
        UI.PriceText({ amount, currency: getCurrency(db), locale: getLocale(db) })
      ]);
    };
    const baseTypeRows = [
      renderTypeRow('dine_in', t.ui.shift_total_dine_in),
      renderTypeRow('takeaway', t.ui.shift_total_takeaway),
      renderTypeRow('delivery', t.ui.shift_total_delivery)
    ];
    const extraTypeRows = Object.keys(totalsByType)
      .filter(key => !['dine_in', 'takeaway', 'delivery'].includes(key))
      .sort()
      .map(typeId => {
        const config = ORDER_TYPES.find(type => type.id === typeId);
        const label = config ? localize(config.label, lang) : typeId;
        return renderTypeRow(typeId, label);
      });
    const totalsCard = UI.Card({
      variant: 'card/soft-1',
      title: t.ui.shift_total_sales,
      content: D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        ...baseTypeRows,
        ...extraTypeRows,
        UI.Divider(),
        UI.HStack({ attrs: { class: tw`${token('split')} text-base font-semibold` } }, [D.Text.Span({}, [t.ui.shift_total_sales]), UI.PriceText({ amount: totalSales, currency: getCurrency(db), locale: getLocale(db) })])
      ])
    });
    const paymentsCard = UI.Card({
      variant: 'card/soft-1',
      title: t.ui.shift_payments,
      content: D.Containers.Div({ attrs: { class: tw`space-y-2` } }, paymentRows)
    });
    const cashCard = UI.Card({
      variant: 'card/soft-2',
      title: t.ui.shift_cash_summary,
      content: D.Containers.Div({ attrs: { class: tw`space-y-2 text-sm` } }, [
        UI.HStack({ attrs: { class: tw`${token('split')}` } }, [D.Text.Span({}, [t.ui.shift_cash_start]), UI.PriceText({ amount: openingFloat, currency: getCurrency(db), locale: getLocale(db) })]),
        UI.HStack({ attrs: { class: tw`${token('split')}` } }, [D.Text.Span({}, [t.ui.shift_cash_collected]), UI.PriceText({ amount: cashCollected, currency: getCurrency(db), locale: getLocale(db) })]),
        UI.Divider(),
        UI.HStack({ attrs: { class: tw`${token('split')} font-semibold` } }, [D.Text.Span({}, [t.ui.shift_cash_end]), UI.PriceText({ amount: closingCash, currency: getCurrency(db), locale: getLocale(db) })])
      ])
    });
    const metaRow = UI.Card({
      variant: 'card/soft-2',
      content: D.Containers.Div({ attrs: { class: tw`space-y-2 text-xs ${token('muted')}` } }, [
        D.Text.Span({}, [`POS: ${shift.posLabel || POS_INFO.label}`]),
        D.Text.Span({}, [`POS ID: ${shift.posId || POS_INFO.id}`]),
        D.Text.Span({}, [`${t.ui.shift}: ${shift.id}`]),
        D.Text.Span({}, [`${t.ui.cashier}: ${shift.cashierName || '—'}`]),
        D.Text.Span({}, [`${t.ui.shift_orders_count}: ${ordersCount}`]),
        D.Text.Span({}, [`${openedLabel} → ${closedLabel}`])
      ])
    });
    const summaryContent = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
      chipsSection,
      totalsCard,
      paymentsCard,
      cashCard,
      metaRow
    ].filter(Boolean));
    const ordersTable = report.orders?.length
      ? UI.Table({
        columns: [
          { key: 'id', label: t.ui.order_id },
          { key: 'type', label: t.ui.orders_type },
          { key: 'total', label: t.ui.orders_total },
          { key: 'savedAt', label: t.ui.orders_updated }
        ],
        rows: report.orders.map(entry => ({
          id: entry.id,
          type: localize(getOrderTypeConfig(entry.type || 'dine_in').label, lang),
          total: new Intl.NumberFormat(getLocale(db), { style: 'currency', currency: getCurrency(db) }).format(entry.totals?.due || entry.total || 0),
          savedAt: formatDateTime(entry.savedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        }))
      })
      : UI.EmptyState({ icon: '🧾', title: t.ui.orders_no_results, description: t.ui.orders_queue_hint });
    const paymentsTable = report.payments?.length
      ? UI.Table({
        columns: [
          { key: 'orderId', label: t.ui.order_id },
          { key: 'method', label: t.ui.payments },
          { key: 'amount', label: t.ui.amount },
          { key: 'capturedAt', label: t.ui.orders_updated }
        ],
        rows: report.payments.map(entry => ({
          orderId: entry.orderId,
          method: entry.method,
          amount: new Intl.NumberFormat(getLocale(db), { style: 'currency', currency: getCurrency(db) }).format(entry.amount || 0),
          capturedAt: formatDateTime(entry.capturedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        }))
      })
      : UI.EmptyState({ icon: '💳', title: t.ui.payments, description: t.ui.orders_no_results });
    const refundsContent = report.refunds?.length
      ? UI.List({
        children: report.refunds.map(ref => UI.ListItem({
          leading: '↩️',
          content: [
            D.Text.Strong({}, [ref.id || '—']),
            D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${t.ui.order_id}: ${ref.orderId || '—'}`])
          ],
          trailing: D.Text.Span({}, [new Intl.NumberFormat(getLocale(db), { style: 'currency', currency: getCurrency(db) }).format(ref.amount || 0)])
        }))
      })
      : UI.EmptyState({ icon: '↩️', title: t.ui.refunds, description: t.ui.orders_no_results });
    const returnsContent = report.returns?.length
      ? UI.List({
        children: report.returns.map(ret => UI.ListItem({
          leading: '🛒',
          content: [
            D.Text.Strong({}, [ret.id || '—']),
            D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${t.ui.order_id}: ${ret.orderId || '—'}`])
          ],
          trailing: D.Text.Span({}, [new Intl.NumberFormat(getLocale(db), { style: 'currency', currency: getCurrency(db) }).format(ret.amount || 0)])
        }))
      })
      : UI.EmptyState({ icon: '🛒', title: t.ui.returns, description: t.ui.orders_no_results });
    const tabs = UI.Tabs({
      gkey: 'pos:shift:tab',
      items: [
        { id: 'summary', label: t.ui.shift_summary, content: summaryContent },
        { id: 'orders', label: t.ui.orders, content: ordersTable },
        { id: 'payments', label: t.ui.payments, content: paymentsTable },
        { id: 'refunds', label: t.ui.refunds, content: refundsContent },
        { id: 'returns', label: t.ui.returns, content: returnsContent }
      ],
      activeId: shiftUI.activeTab || 'summary'
    });
    const content = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [tabs]);
    const actions = [
      viewingCurrent ? UI.Button({ attrs: { gkey: 'pos:shift:close', class: tw`w-full` }, variant: 'solid', size: 'sm' }, [t.ui.shift_close_confirm]) : null,
      UI.Button({ attrs: { gkey: 'pos:shift:summary:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
    ].filter(Boolean);
    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.['shift-summary'] || 'full',
      sizeKey: 'shift-summary',
      closeGkey: 'pos:shift:summary:close',
      title: t.ui.shift_summary,
      description: viewingCurrent ? t.ui.shift_current : t.ui.shift_history,
      content,
      actions
    });
  }

  Mishkah.app.setBody(function (db) {
    return UI.AppRoot({
      shell: D.Containers.Div({ attrs: { class: tw`pos-shell flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]` } }, [
        Header(db),
        D.Containers.Main({ attrs: { class: tw`flex-1 min-h-0 w-full grid gap-4 px-4 pb-3 pt-3 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)] overflow-hidden` } }, [
          MenuColumn(db),
          OrderColumn(db)
        ]),
        FooterBar(db)
      ]),
      overlays: [
        SettingsDrawer(db),
        CustomersModal(db),
        ShiftPinDialog(db),
        ShiftSummaryModal(db),
        TablesModal(db),
        ReservationsModal(db),
        PrintModal(db),
        LineModifiersModal(db),
        LineDiscountModal(db),
        ReturnsModal(db),
        DiscountOrderModal(db),
        PaymentsSheet(db),
        OrdersQueueModal(db),
        OrdersJobStatusModal(db),
        db.ui?.toasts ? UI.ToastHost({ toasts: db.ui.toasts }) : null
      ].filter(Boolean)
    });
  });

  const app = M.app.createApp(posState, {});
  appRef = app;
  flushPendingKdsMessages();
  if (pendingRemoteResult) {
    flushRemoteUpdate();
  }
  const POS_DEV_TOOLS = {
    async resetIndexedDB() {
      if (!posDB.available || typeof posDB.resetAll !== 'function') {
        console.info('[Mishkah][POS] IndexedDB is not available in this environment.');
        return false;
      }
      await posDB.resetAll();
      invoiceSequence = 0;
      await refreshPersistentSnapshot({ focusCurrent: false, syncOrders: true });
      console.info('[Mishkah][POS] Local IndexedDB cleared.');
      return true;
    },
    async refresh() {
      return refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
    },
    schema: {
      registry: POS_SCHEMA_REGISTRY,
      toJSON() { return POS_SCHEMA_REGISTRY.toJSON(); },
      generateSQL(options) { return POS_SCHEMA_REGISTRY.generateSQL(options || {}); }
    }
  };
  Object.defineProperty(window, '__MishkahPOSDev__', {
    value: POS_DEV_TOOLS,
    configurable: true,
    enumerable: false,
    writable: false
  });
  console.info('%c[Mishkah POS] Developer helpers ready → use __MishkahPOSDev__.resetIndexedDB() to wipe local data.', 'color:#fbbf24;font-weight:bold;');
  const auto = U.twcss.auto(posState, app, { pageScaffold: true });

  function closeActiveModals(ctx) {
    const state = ctx.getState();
    const modalsState = state.ui?.modals || {};
    const anyOpen = Object.values(modalsState).some(Boolean) || !!state.ui?.modalOpen;
    if (!anyOpen) return false;
    ctx.setState(s => {
      const current = { ...(s.ui?.modals || {}) };
      Object.keys(current).forEach(key => {
        current[key] = false;
      });
      return {
        ...s,
        ui: { ...(s.ui || {}), modalOpen: false, modals: current, jobStatus: null }
      };
    });
    return true;
  }

  const posOrders = {
    'ui.modal.close': {
      on: ['click'],
      gkeys: ['ui:modal:close'],
      handler: (e, ctx) => {
        e.preventDefault();
        e.stopPropagation();
        closeActiveModals(ctx);
      }
    },
    'pos.order.jobs.details.close': {
      on: ['click'],
      gkeys: ['pos:order:jobs:details:close'],
      handler: (e, ctx) => {
        e.preventDefault();
        e.stopPropagation();
        // Only close jobStatus modal, keep orders modal open
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), jobStatus: false },
            jobStatus: null
          }
        }));
      }
    },
    'ui.modal.size': {
      on: ['click'],
      gkeys: ['ui:modal:size'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-modal-size-key]');
        if (!btn) return;
        const key = btn.getAttribute('data-modal-size-key');
        const value = btn.getAttribute('data-modal-size');
        if (!key || !value) return;
        ctx.setState(s => {
          const current = s.ui?.modalSizes || {};
          const next = { ...current, [key]: value };
          if (preferencesStore) {
            try { preferencesStore.set('modalSizes', next); } catch (err) {
              //console.warn('[Mishkah][POS] modal size persist failed', err);
            }
          }

          return {
            ...s,
            ui: { ...(s.ui || {}), modalSizes: next }
          };
        });
      }
    },
    'pos.shift.tab': {
      on: ['click'],
      gkeys: ['pos:shift:tab'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-tab-id]');
        if (!btn) return;
        const tabId = btn.getAttribute('data-tab-id');
        if (!tabId) return;
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), activeTab: tabId } }
        }));
      }
    },
    'pos.settings.open': {
      on: ['click'],
      gkeys: ['pos:settings:open'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), settings: { ...(s.ui?.settings || {}), open: true, activeTheme: (s.ui?.settings?.activeTheme || s.env?.theme || 'dark') } }
        }));
      }
    },
    'pos.settings.close': {
      on: ['click'],
      gkeys: ['pos:settings:close', 'ui:drawer:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), settings: { ...(s.ui?.settings || {}), open: false } }
        }));
      }
    },
    'pos.settings.theme': {
      on: ['click'],
      gkeys: ['pos:settings:theme'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-theme]');
        if (!btn) return;
        const theme = btn.getAttribute('data-theme');
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), settings: { ...(s.ui?.settings || {}), activeTheme: theme || 'light', open: true } }
        }));
      }
    },
    'pos.settings.color': {
      on: ['input', 'change'],
      gkeys: ['pos:settings:color'],
      handler: (e, ctx) => {
        const input = e.target;
        const cssVar = input.getAttribute('data-css-var');
        const value = input.value;
        if (!cssVar) return;
        const state = ctx.getState();
        const themeKey = state.ui?.settings?.activeTheme || state.env?.theme || 'dark';
        ctx.setState(s => {
          const prefs = { ...(s.data.themePrefs || {}) };
          const entry = { colors: { ...(prefs[themeKey]?.colors || {}) }, fonts: { ...(prefs[themeKey]?.fonts || {}) } };
          entry.colors[cssVar] = value;
          prefs[themeKey] = entry;
          if (preferencesStore) {
            try { preferencesStore.set('themePrefs', prefs); } catch (err) {
              //console.warn('[Mishkah][POS] theme prefs persist failed', err);
            }
          }
          return { ...s, data: { ...(s.data || {}), themePrefs: prefs } };
        });
        applyThemePreferenceStyles(ctx.getState().data.themePrefs);
      }
    },
    'pos.settings.font': {
      on: ['input', 'change'],
      gkeys: ['pos:settings:font'],
      handler: (e, ctx) => {
        const value = parseFloat(e.target.value);
        if (!Number.isFinite(value)) return;
        const state = ctx.getState();
        const themeKey = state.ui?.settings?.activeTheme || state.env?.theme || 'dark';
        ctx.setState(s => {
          const prefs = { ...(s.data.themePrefs || {}) };
          const entry = { colors: { ...(prefs[themeKey]?.colors || {}) }, fonts: { ...(prefs[themeKey]?.fonts || {}) } };
          entry.fonts.base = `${value}px`;
          prefs[themeKey] = entry;
          if (preferencesStore) {
            try { preferencesStore.set('themePrefs', prefs); } catch (err) {
              //console.warn('[Mishkah][POS] theme prefs persist failed', err);
            }
          }
          return { ...s, data: { ...(s.data || {}), themePrefs: prefs } };
        });
        applyThemePreferenceStyles(ctx.getState().data.themePrefs);
      }
    },
    'pos.settings.reset': {
      on: ['click'],
      gkeys: ['pos:settings:reset'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const themeKey = state.ui?.settings?.activeTheme || state.env?.theme || 'dark';
        ctx.setState(s => {
          const prefs = { ...(s.data.themePrefs || {}) };
          delete prefs[themeKey];
          if (preferencesStore) {
            try { preferencesStore.set('themePrefs', prefs); } catch (err) {
              //console.warn('[Mishkah][POS] theme prefs persist failed', err);
            }
          }
          return { ...s, data: { ...(s.data || {}), themePrefs: prefs } };
        });
        applyThemePreferenceStyles(ctx.getState().data.themePrefs);
      }
    },
    'ui.modal.escape': {
      on: ['keydown'],
      handler: (e, ctx) => {
        if (e.key !== 'Escape') return;
        const closed = closeActiveModals(ctx);
        if (closed) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    },
    'pos.menu.search': {
      on: ['input', 'change'],
      gkeys: ['pos:menu:search'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            menu: { ...(s.data.menu || {}), search: value }
          }
        }));
      }
    },
    'pos.menu.category': {
      on: ['click'],
      gkeys: ['pos:menu:category'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-category-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-category-id') || 'all';
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            menu: { ...(s.data.menu || {}), category: id }
          }
        }));
      }
    },
    'pos.menu:add': {
      on: ['click', 'keydown'],
      gkeys: ['pos:menu:add'],
      handler: (e, ctx) => {
        if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
        const card = e.target.closest('[data-item-id]');
        if (!card) return;
        const itemId = card.getAttribute('data-item-id');
        const state = ctx.getState();
        const item = (state.data.menu.items || []).find(it => String(it.id) === String(itemId));
        if (!item || item.id == null) {
          UI.pushToast(ctx, { title: getTexts(state).toast.menu_load_error_short, icon: '⚠️' });
          return;
        }
        const t = getTexts(state);
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const typeConfig = getOrderTypeConfig(order.type || 'dine_in');
          const isPersisted = !!order.isPersisted;
          const allowAdditions = order.allowAdditions !== undefined ? order.allowAdditions : !!typeConfig.allowsLineAdditions;
          if (isPersisted && !allowAdditions) {
            UI.pushToast(ctx, { title: t.toast.order_additions_blocked, icon: '🚫' });
            return s;
          }
          const lines = (order.lines || []).map(line => ({ ...line }));
          const canMerge = !isPersisted;
          const idx = canMerge ? lines.findIndex(line => String(line.itemId) === String(item.id)) : -1;
          if (idx >= 0) {
            const existing = lines[idx];
            lines[idx] = updateLineWithPricing(existing, { qty: (existing.qty || 0) + 1, updatedAt: Date.now() });
          } else {
            lines.push(createOrderLine(item, 1, { kitchenSection: item.kitchenSection }));
          }
          const totals = calculateTotals(lines, data.settings || {}, order.type, { orderDiscount: order.discount });
          const paymentEntries = getActivePaymentEntries({ ...order, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...order,
                lines,
                totals,
                paymentState: paymentSnapshot.state,
                updatedAt: Date.now(),
                dirty: true,  // Mark as dirty when adding items
                allowAdditions: allowAdditions
              }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.item_added, icon: '✅' });
      }
    },
    'pos.menu.favorite': {
      on: ['click'],
      gkeys: ['pos:menu:favorite'],
      handler: (e, ctx) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = e.target.closest('[data-item-id]');
        if (!btn) return;
        const itemId = String(btn.getAttribute('data-item-id'));
        ctx.setState(s => {
          const menu = s.data.menu || {};
          const favorites = new Set((menu.favorites || []).map(String));
          if (favorites.has(itemId)) favorites.delete(itemId); else favorites.add(itemId);
          return {
            ...s,
            data: {
              ...s.data,
              menu: { ...menu, favorites: Array.from(favorites) }
            }
          };
        });
      }
    },
    'pos.menu.favorites-only': {
      on: ['click'],
      gkeys: ['pos:menu:favorites-only'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            menu: { ...(s.data.menu || {}), showFavoritesOnly: !s.data.menu?.showFavoritesOnly }
          }
        }));
      }
    },
    'pos.menu.load-more': {
      on: ['click'],
      gkeys: ['pos:menu:load-more'],
      handler: (e, ctx) => {
        const scroller = document.querySelector('[data-menu-scroll="true"]');
        if (scroller && typeof scroller.scrollBy === 'function') {
          scroller.scrollBy({ top: scroller.clientHeight || 400, behavior: 'smooth' });
          return;
        }
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.load_more_stub, icon: 'ℹ️' });
      }
    },
    'pos.order.line.inc': {
      on: ['click'],
      gkeys: ['pos:order:line:inc'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const line = (order.lines || []).find(l => l.id === lineId);
          if (!line) {
            return s;
          }
          if (line.locked || (order.isPersisted && order.lockLineEdits) || (line.status && line.status !== 'draft')) {
            UI.pushToast(ctx, { title: getTexts(s).toast.line_locked, icon: '🔒' });
            return s;
          }
          const lines = (order.lines || []).map(l => {
            if (l.id !== lineId) return l;
            return updateLineWithPricing(l, { qty: (l.qty || 0) + 1, updatedAt: Date.now() });
          });
          const totals = calculateTotals(lines, data.settings || {}, order.type, { orderDiscount: order.discount });
          const paymentEntries = getActivePaymentEntries({ ...order, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: { ...order, lines, totals, paymentState: paymentSnapshot.state, updatedAt: Date.now(), dirty: true }
            }
          };
        });
      }
    },
    'pos.order.line.dec': {
      on: ['click'],
      gkeys: ['pos:order:line:dec'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const target = (order.lines || []).find(l => l.id === lineId);
          if (!target) {
            return s;
          }
          if (target.locked || (order.isPersisted && order.lockLineEdits) || (target.status && target.status !== 'draft')) {
            UI.pushToast(ctx, { title: getTexts(s).toast.line_locked, icon: '🔒' });
            return s;
          }
          const lines = [];
          for (const line of (order.lines || [])) {
            if (line.id !== lineId) {
              lines.push(line);
              continue;
            }
            if (line.qty <= 1) continue;
            lines.push(updateLineWithPricing(line, { qty: line.qty - 1, updatedAt: Date.now() }));
          }
          const totals = calculateTotals(lines, data.settings || {}, order.type, { orderDiscount: order.discount });
          const paymentEntries = getActivePaymentEntries({ ...order, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: { ...order, lines, totals, paymentState: paymentSnapshot.state, updatedAt: Date.now(), dirty: true }
            }
          };
        });
      }
    },
    'pos.order.line.qty': {
      on: ['click'],
      gkeys: ['pos:order:line:qty'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const current = (state.data.order.lines || []).find(line => line.id === lineId);
        if (current && (current.locked || (state.data.order.isPersisted && state.data.order.lockLineEdits) || (current.status && current.status !== 'draft'))) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const nextValue = window.prompt(t.toast.set_qty, current ? current.qty : 1);
        if (nextValue == null) return;
        const qty = Math.max(1, parseInt(nextValue, 10) || 1);
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const lines = (order.lines || []).map(line => {
            if (line.id !== lineId) return line;
            return updateLineWithPricing(line, { qty, updatedAt: Date.now() });
          });
          const totals = calculateTotals(lines, data.settings || {}, order.type, { orderDiscount: order.discount });
          const paymentEntries = getActivePaymentEntries({ ...order, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: { ...order, lines, totals, paymentState: paymentSnapshot.state, updatedAt: Date.now(), dirty: true }
            }
          };
        });
      }
    },
    'pos.order.line.modifiers': {
      on: ['click'],
      gkeys: ['pos:order:line:modifiers'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        if (!lineId) return;
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        if (line.locked || (order.isPersisted && order.lockLineEdits) || (line.status && line.status !== 'draft')) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const selectedAddOns = (Array.isArray(line.modifiers) ? line.modifiers : []).filter(mod => mod.type === 'add_on').map(mod => String(mod.id));
        const selectedRemovals = (Array.isArray(line.modifiers) ? line.modifiers : []).filter(mod => mod.type === 'removal').map(mod => String(mod.id));
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), modifiers: true },
            lineModifiers: { lineId, addOns: selectedAddOns, removals: selectedRemovals }
          }
        }));
      }
    },
    'pos.order.line.note': {
      on: ['click'],
      gkeys: ['pos:order:line:note'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        if (line.locked || (order.isPersisted && order.lockLineEdits) || (line.status && line.status !== 'draft')) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const currentNote = notesToText(line.notes);
        const input = window.prompt(t.toast.add_note, currentNote);
        if (input == null) return;
        const trimmed = input.trim();
        const now = Date.now();
        const user = state.data.user || {};
        const noteEntry = trimmed
          ? {
            id: `note-${now.toString(36)}`,
            message: trimmed,
            authorId: user.id || user.role || 'pos',
            authorName: user.name || '',
            createdAt: now
          }
          : null;
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const lines = (nextOrder.lines || []).map(item => {
            if (item.id !== lineId) return item;
            const baseNotes = Array.isArray(item.notes) ? item.notes.filter(Boolean) : [];
            const nextNotes = noteEntry ? baseNotes.concat([noteEntry]) : [];
            return updateLineWithPricing(item, { notes: nextNotes, updatedAt: now });
          });
          const totals = calculateTotals(lines, data.settings || {}, nextOrder.type, { orderDiscount: nextOrder.discount });
          const paymentEntries = getActivePaymentEntries({ ...nextOrder, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...nextOrder,
                lines,
                totals,
                paymentState: paymentSnapshot.state,
                updatedAt: now
              }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.notes_updated, icon: '📝' });
      }
    },
    'pos.order.line.discount': {
      on: ['click'],
      gkeys: ['pos:order:line:discount'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        if (line.locked || (order.isPersisted && order.lockLineEdits) || (line.status && line.status !== 'draft')) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const unitPrice = getLineUnitPrice(line);
        const baseAmount = Math.max(0, round(unitPrice * (Number(line.qty) || 0)));
        const currentDiscount = normalizeDiscount(line.discount);
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), lineDiscount: true },
            lineDiscount: {
              lineId,
              type: currentDiscount?.type || 'amount',
              value: currentDiscount ? String(currentDiscount.value) : '',
              baseAmount,
              allowedRate: Number(state.data.user?.allowedDiscountRate)
            }
          }
        }));
      }
    },
    'pos.order.line.modifiers.toggle': {
      on: ['click'],
      gkeys: ['pos:order:line:modifiers.toggle'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-mod-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        const modId = btn.getAttribute('data-mod-id');
        const modType = btn.getAttribute('data-mod-type');
        if (!lineId || !modId) return;
        ctx.setState(s => {
          const current = s.ui?.lineModifiers || {};
          if (current.lineId !== lineId) {
            return {
              ...s,
              ui: {
                ...(s.ui || {}),
                lineModifiers: { lineId, addOns: modType === 'removal' ? [] : [modId], removals: modType === 'removal' ? [modId] : [] }
              }
            };
          }
          const key = modType === 'removal' ? 'removals' : 'addOns';
          const existing = new Set((current[key] || []).map(String));
          if (existing.has(modId)) existing.delete(modId); else existing.add(modId);
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              lineModifiers: {
                ...current,
                lineId,
                [key]: Array.from(existing)
              }
            }
          };
        });
      }
    },
    'pos.order.line.modifiers.apply': {
      on: ['click'],
      gkeys: ['pos:order:line:modifiers.apply'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn) return;
        const lineId = btn.getAttribute('data-line-id');
        if (!lineId) return;
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        if (line.locked || (order.isPersisted && order.lockLineEdits) || (line.status && line.status !== 'draft')) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const catalog = state.data.modifiers || { addOns: [], removals: [] };
        const draft = state.ui?.lineModifiers || {};
        const addOnIds = new Set((draft.addOns || []).map(String));
        const removalIds = new Set((draft.removals || []).map(String));
        const mapModifier = (entry) => entry ? { id: String(entry.id), type: entry.type, label: entry.label, priceChange: Number(entry.priceChange || 0) } : null;
        const nextModifiers = [
          ...((catalog.addOns || []).filter(entry => addOnIds.has(String(entry.id))).map(mapModifier)),
          ...((catalog.removals || []).filter(entry => removalIds.has(String(entry.id))).map(mapModifier))
        ].filter(Boolean);
        const lines = (order.lines || []).map(item => {
          if (item.id !== lineId) return item;
          return updateLineWithPricing(item, { modifiers: nextModifiers, updatedAt: Date.now() });
        });
        const totals = calculateTotals(lines, state.data.settings || {}, order.type, { orderDiscount: order.discount });
        const paymentEntries = getActivePaymentEntries({ ...order, lines, totals }, state.data.payments);
        const paymentSnapshot = summarizePayments(totals, paymentEntries);
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            order: { ...order, lines, totals, paymentState: paymentSnapshot.state, updatedAt: Date.now() }
          },
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), modifiers: false },
            lineModifiers: { lineId: null, addOns: [], removals: [] }
          }
        }));
        UI.pushToast(ctx, { title: t.toast.line_modifiers_applied, icon: '✨' });
      }
    },
    'pos.order.line.modifiers.close': {
      on: ['click'],
      gkeys: ['pos:order:line:modifiers.close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), modifiers: false },
            lineModifiers: { lineId: null, addOns: [], removals: [] }
          }
        }));
      }
    },
    'pos.order.clear': {
      on: ['click'],
      gkeys: ['pos:order:clear'],
      handler: (e, ctx) => {
        const t = getTexts(ctx.getState());
        if (!window.confirm(t.toast.confirm_clear)) return;
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const totals = calculateTotals([], data.settings || {}, order.type, { orderDiscount: null });
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...order,
                lines: [],
                totals,
                discount: null,
                paymentState: 'unpaid',
                updatedAt: Date.now()
              },
              payments: { ...(data.payments || {}), split: [] }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.cart_cleared, icon: '🧺' });
      }
    },
    'pos.order.new': {
      on: ['click'],
      gkeys: ['pos:order:new'],
      handler: async (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const currentShift = state.data.shift?.current;

        if (!currentShift) {
          UI.pushToast(ctx, { title: t.toast.shift_required || 'يجب فتح الوردية قبل إنشاء طلب جديد', icon: '🔒' });
          ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showPin: true, pin: '' } } }));
          return;
        }

        const newId = await generateOrderId();
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const type = order.type || 'dine_in';
          const typeConfig = getOrderTypeConfig(type);
          const totals = calculateTotals([], data.settings || {}, type, { orderDiscount: null });
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...order,
                id: newId,
                status: 'open',
                fulfillmentStage: 'new',
                paymentState: 'unpaid',
                type,
                lines: [],
                notes: [],
                discount: null,
                totals,
                tableIds: [],
                guests: type === 'dine_in' ? 0 : order.guests || 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                allowAdditions: !!typeConfig.allowsLineAdditions,
                lockLineEdits: false,
                isPersisted: false,
                shiftId: currentShift.id,
                posId: data.pos?.id || POS_INFO.id,
                posLabel: data.pos?.label || POS_INFO.label,
                posNumber: Number.isFinite(Number(data.pos?.number)) ? Number(data.pos.number) : POS_INFO.number,
                payments: [],
                returns: [],
                customerId: null,
                customerAddressId: null,
                customerName: '',
                customerPhone: '',
                customerAddress: '',
                customerAreaId: null,
                dirty: false,
                orderTypeId: type,
                statusId: 'open',
                stageId: 'new',
                paymentStateId: 'unpaid',
                tableId: null,
                subtotal: totals.subtotal || 0,
                discount_amount: totals.discount || 0,
                service_amount: totals.service || 0,
                tax_amount: totals.vat || 0,
                delivery_fee: totals.deliveryFee || 0,
                total: totals.due || 0,
                total_paid: 0,
                total_due: totals.due || 0,
                version: 1,
                currentVersion: 1,
                metadata: {
                  orderType: type,
                  orderTypeId: type,
                  serviceMode: type
                }
              },
              payments: { ...(data.payments || {}), split: [] },
              tableLocks: order.isPersisted
                ? data.tableLocks
                : (data.tableLocks || []).map(lock => lock.orderId === order.id ? { ...lock, active: false } : lock)
            },
            ui: {
              ...(s.ui || {}),
              pendingAction: null
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.new_order, icon: '🆕' });
      }
    },
    'pos.order.discount': {
      on: ['click'],
      gkeys: ['pos:order:discount'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const order = state.data.order || {};
        const currentDiscount = normalizeDiscount(order.discount);
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), discountOrder: true },
            discountDraft: {
              type: currentDiscount?.type || 'amount',
              value: currentDiscount ? String(currentDiscount.value) : ''
            }
          }
        }));
      }
    },
    'pos.discount.type': {
      on: ['click'],
      gkeys: ['pos:discount:type'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-type]');
        if (!btn) return;
        const type = btn.getAttribute('data-type');
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            discountDraft: {
              ...(s.ui?.discountDraft || {}),
              type: type || 'amount',
              value: ''  // Reset value when changing type
            }
          }
        }));
      }
    },
    'pos.discount.input': {
      on: ['input', 'change'],
      gkeys: ['pos:discount:input'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            discountDraft: {
              ...(s.ui?.discountDraft || {}),
              value: value
            }
          }
        }));
      }
    },
    'pos.discount.apply': {
      on: ['click'],
      gkeys: ['pos:discount:apply'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const lines = order.lines || [];
        const baseTotals = calculateTotals(lines, state.data.settings || {}, order.type || 'dine_in', { orderDiscount: null });
        const baseSubtotal = baseTotals.subtotal || 0;
        const allowedRate = Number(state.data.user?.allowedDiscountRate);
        const discountDraft = state.ui.discountDraft || {};
        const type = discountDraft.type || 'amount';
        const valueStr = (discountDraft.value || '').trim();
        if (!valueStr) {
          UI.pushToast(ctx, { title: t.toast.discount_invalid || 'قيمة غير صحيحة', icon: '⚠️' });
          return;
        }
        const input = type === 'percent' ? `${valueStr}%` : valueStr;
        const { discount, error, limit } = parseDiscountInput(input, baseSubtotal, allowedRate);
        if (error === 'invalid') {
          UI.pushToast(ctx, { title: t.toast.discount_invalid, icon: '⚠️' });
          return;
        }
        if (error === 'limit') {
          const message = t.toast.discount_limit.replace('%limit%', String(Math.round((limit + Number.EPSILON) * 100) / 100));
          UI.pushToast(ctx, { title: message, icon: '⚠️' });
          return;
        }
        const now = Date.now();
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const totals = calculateTotals(nextOrder.lines || [], data.settings || {}, nextOrder.type || 'dine_in', { orderDiscount: discount });
          const paymentEntries = getActivePaymentEntries({ ...nextOrder, discount, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...nextOrder,
                discount: normalizeDiscount(discount),
                totals,
                paymentState: paymentSnapshot.state,
                updatedAt: now
              }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), discountOrder: false },
              discountDraft: null
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.discount_applied || 'تم تطبيق الخصم', icon: '✅' });
      }
    },
    'pos.discount.remove': {
      on: ['click'],
      gkeys: ['pos:discount:remove'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const now = Date.now();
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const totals = calculateTotals(nextOrder.lines || [], data.settings || {}, nextOrder.type || 'dine_in', { orderDiscount: null });
          const paymentEntries = getActivePaymentEntries({ ...nextOrder, discount: null, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...nextOrder,
                discount: null,
                totals,
                paymentState: paymentSnapshot.state,
                updatedAt: now
              }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), discountOrder: false },
              discountDraft: null
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.discount_removed || 'تم إزالة الخصم', icon: '♻️' });
      }
    },
    'pos.discount.close': {
      on: ['click'],
      gkeys: ['pos:discount:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), discountOrder: false },
            discountDraft: null
          }
        }));
      }
    },
    'pos.line-discount.type': {
      on: ['click'],
      gkeys: ['pos:line-discount:type'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-type]');
        if (!btn) return;
        const type = btn.getAttribute('data-type') || 'amount';
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            lineDiscount: {
              ...(s.ui?.lineDiscount || {}),
              type,
              value: ''
            }
          }
        }));
      }
    },
    'pos.line-discount.input': {
      on: ['input', 'change'],
      gkeys: ['pos:line-discount:input'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            lineDiscount: {
              ...(s.ui?.lineDiscount || {}),
              value
            }
          }
        }));
      }
    },
    'pos.line-discount.apply': {
      on: ['click'],
      gkeys: ['pos:line-discount:apply'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const draft = state.ui.lineDiscount || {};
        const lineId = draft.lineId;
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          ctx.setState(s => ({
            ...s,
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), lineDiscount: false },
              lineDiscount: null
            }
          }));
          return;
        }
        const type = draft.type || 'amount';
        const valueStr = (draft.value || '').trim();
        if (!valueStr) {
          UI.pushToast(ctx, { title: t.toast.discount_invalid, icon: '⚠️' });
          return;
        }
        const baseAmount = draft.baseAmount != null ? Number(draft.baseAmount) : Math.max(0, round(getLineUnitPrice(line) * (Number(line.qty) || 0)));
        const input = type === 'percent' ? `${valueStr}%` : valueStr;
        const { discount, error, limit } = parseDiscountInput(input, baseAmount, draft.allowedRate);
        if (error === 'invalid') {
          UI.pushToast(ctx, { title: t.toast.discount_invalid, icon: '⚠️' });
          return;
        }
        if (error === 'limit') {
          const message = t.toast.discount_limit.replace('%limit%', String(Math.round((limit + Number.EPSILON) * 100) / 100));
          UI.pushToast(ctx, { title: message, icon: '⚠️' });
          return;
        }
        const now = Date.now();
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const lines = (nextOrder.lines || []).map(item => {
            if (item.id !== lineId) return item;
            return updateLineWithPricing(item, { discount: normalizeDiscount(discount), updatedAt: now });
          });
          const totals = calculateTotals(lines, data.settings || {}, nextOrder.type, { orderDiscount: nextOrder.discount });
          const paymentEntries = getActivePaymentEntries({ ...nextOrder, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...nextOrder,
                lines,
                totals,
                paymentState: paymentSnapshot.state,
                updatedAt: now
              }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), lineDiscount: false },
              lineDiscount: null
            }
          };
        });
        UI.pushToast(ctx, { title: discount ? t.toast.discount_applied : t.toast.discount_removed, icon: discount ? '✅' : '♻️' });
      }
    },
    'pos.line-discount.clear': {
      on: ['click'],
      gkeys: ['pos:line-discount:clear'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const order = state.data.order || {};
        const draft = state.ui.lineDiscount || {};
        const lineId = draft.lineId;
        const now = Date.now();
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const lines = (nextOrder.lines || []).map(item => item.id === lineId ? updateLineWithPricing(item, { discount: null, updatedAt: now }) : item);
          const totals = calculateTotals(lines, data.settings || {}, nextOrder.type, { orderDiscount: nextOrder.discount });
          const paymentEntries = getActivePaymentEntries({ ...nextOrder, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...nextOrder,
                lines,
                totals,
                paymentState: paymentSnapshot.state,
                updatedAt: now
              }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), lineDiscount: false },
              lineDiscount: null
            }
          };
        });
      }
    },
    'pos.line-discount.close': {
      on: ['click'],
      gkeys: ['pos:line-discount:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), lineDiscount: false },
            lineDiscount: null
          }
        }));
      }
    },
    'pos.returns.open': {
      on: ['click'],
      gkeys: ['pos:returns:open'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const order = state.data.order || {};
        const options = calculateReturnOptions(order).map(opt => ({
          line: { ...opt.line },
          remaining: opt.remaining,
          returned: opt.returned
        }));
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), returns: true },
            returnsDraft: {
              orderId: order.id,
              options,
              selections: {}
            }
          }
        }));
      }
    },
    'pos.returns.close': {
      on: ['click'],
      gkeys: ['pos:returns:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), returns: false },
            returnsDraft: null
          }
        }));
      }
    },
    'pos.returns.toggle': {
      on: ['change'],
      gkeys: ['pos:returns:toggle'],
      handler: (e, ctx) => {
        const input = e.target.closest('[data-line-id]');
        if (!input) return;
        const lineId = input.getAttribute('data-line-id');
        const checked = input.checked;
        ctx.setState(s => {
          const draft = s.ui?.returnsDraft || {};
          const selections = { ...(draft.selections || {}) };
          if (checked) {
            selections[lineId] = selections[lineId] && selections[lineId] > 0 ? selections[lineId] : 1;
          } else {
            delete selections[lineId];
          }
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              returnsDraft: {
                ...draft,
                selections
              }
            }
          };
        });
      }
    },
    'pos.returns.qty.inc': {
      on: ['click'],
      gkeys: ['pos:returns:qty:inc'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn || btn.hasAttribute('disabled')) return;
        const lineId = btn.getAttribute('data-line-id');
        ctx.setState(s => {
          const draft = s.ui?.returnsDraft || {};
          const options = draft.options || [];
          const target = options.find(opt => opt.line.id === lineId);
          if (!target) return s;
          const max = target.remaining;
          const selections = { ...(draft.selections || {}) };
          const current = selections[lineId] || 0;
          if (current >= max) return s;
          selections[lineId] = current + 1;
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              returnsDraft: {
                ...draft,
                selections
              }
            }
          };
        });
      }
    },
    'pos.returns.qty.dec': {
      on: ['click'],
      gkeys: ['pos:returns:qty:dec'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-line-id]');
        if (!btn || btn.hasAttribute('disabled')) return;
        const lineId = btn.getAttribute('data-line-id');
        ctx.setState(s => {
          const draft = s.ui?.returnsDraft || {};
          const selections = { ...(draft.selections || {}) };
          const current = selections[lineId] || 0;
          if (current <= 1) {
            selections[lineId] = 1;
            return {
              ...s,
              ui: {
                ...(s.ui || {}),
                returnsDraft: {
                  ...draft,
                  selections
                }
              }
            };
          }
          selections[lineId] = current - 1;
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              returnsDraft: {
                ...draft,
                selections
              }
            }
          };
        });
      }
    },
    'pos.returns.save': {
      on: ['click'],
      gkeys: ['pos:returns:save'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const draft = state.ui.returnsDraft || {};
        const options = draft.options || [];
        const selections = draft.selections || {};
        const lang = state.env.lang;
        const selected = options.filter(opt => (selections[opt.line.id] || 0) > 0);
        if (!selected.length) {
          UI.pushToast(ctx, { title: t.toast.discount_invalid || 'لم يتم اختيار أصناف', icon: '⚠️' });
          return;
        }
        const now = Date.now();
        let totalAmount = 0;
        const lines = selected.map(opt => {
          const qty = Math.min(selections[opt.line.id] || 0, opt.remaining);
          const unit = getLineUnitPrice(opt.line);
          totalAmount += qty * unit;
          return {
            lineId: opt.line.id,
            quantity: qty,
            unitPrice: unit,
            itemName: localize(opt.line.name, lang)
          };
        }).filter(entry => entry.quantity > 0);
        if (!lines.length) {
          UI.pushToast(ctx, { title: t.toast.discount_invalid || 'لم يتم اختيار أصناف', icon: '⚠️' });
          return;
        }
        const branchSeq = (state.data.returnSequence || 0) + 1;
        const orderSeq = (Array.isArray(order.returns) ? order.returns.length : 0) + 1;
        const shiftId = state.data.shift?.current?.id || order.shiftId || null;
        const record = {
          id: `RET-${order.id || 'draft'}-${branchSeq.toString(36).toUpperCase()}`,
          orderId: order.id,
          shiftId,
          createdAt: now,
          total: round(totalAmount),
          lines,
          seq: orderSeq,
          branchSeq
        };
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const returns = Array.isArray(nextOrder.returns) ? nextOrder.returns.slice() : [];
          returns.push(record);
          const ordersHistory = Array.isArray(data.ordersHistory)
            ? data.ordersHistory.map(entry => entry.id === nextOrder.id ? { ...entry, returns: (Array.isArray(entry.returns) ? entry.returns.concat([record]) : [record]) } : entry)
            : data.ordersHistory;
          const currentShift = data.shift?.current;
          let nextShift = currentShift;
          let shiftHistory = data.shift?.history;
          if (currentShift) {
            const shiftReturns = Array.isArray(currentShift.returns) ? currentShift.returns.slice() : [];
            shiftReturns.push({ id: record.id, orderId: record.orderId, amount: record.total, createdAt: record.createdAt });
            nextShift = { ...currentShift, returns: shiftReturns };
            shiftHistory = Array.isArray(data.shift?.history)
              ? data.shift.history.map(entry => entry.id === currentShift.id ? { ...entry, returns: shiftReturns } : entry)
              : data.shift?.history;
          }
          return {
            ...s,
            data: {
              ...data,
              returnSequence: branchSeq,
              order: {
                ...nextOrder,
                returns
              },
              ordersHistory,
              shift: {
                ...(data.shift || {}),
                current: nextShift,
                history: shiftHistory
              }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), returns: false },
              returnsDraft: null
            }
          };
        });
        UI.pushToast(ctx, { title: t.ui.save || 'تم الحفظ', icon: '✅' });
      }
    },
    'pos.order.table.remove': {
      on: ['click'],
      gkeys: ['pos:order:table:remove'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        if (!window.confirm(t.ui.table_confirm_release)) return;
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            order: { ...(s.data.order || {}), tableIds: (s.data.order?.tableIds || []).filter(id => id !== tableId), updatedAt: Date.now() },
            tableLocks: (s.data.tableLocks || []).map(lock => lock.tableId === tableId && lock.orderId === order.id ? { ...lock, active: false } : lock)
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_unlocked, icon: '🔓' });
      }
    },
    'pos.order.note': {
      on: ['click'],
      gkeys: ['pos:order:note'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const note = window.prompt(t.toast.add_note);
        if (note == null) return;
        const trimmed = note.trim();
        if (!trimmed) {
          return;
        }
        const now = Date.now();
        const user = state.data.user || {};
        const noteEntry = {
          id: `note-${now.toString(36)}`,
          message: trimmed,
          authorId: user.id || user.role || 'pos',
          authorName: user.name || '',
          createdAt: now
        };
        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const notes = Array.isArray(order.notes) ? order.notes.concat([noteEntry]) : [noteEntry];
          return {
            ...s,
            data: {
              ...data,
              order: {
                ...order,
                notes,
                updatedAt: now
              }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.notes_updated, icon: '📝' });
      }
    },
    'pos.order.type': {
      on: ['click'],
      gkeys: ['pos:order:type'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-order-type]');
        if (!btn) return;
        const type = btn.getAttribute('data-order-type');
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data?.order || {};

        // ✅ CRITICAL FIX: PREVENT changing order type for persisted orders
        // User requirement: "يمنع أصلا تحويل حالة الأوردر من حالة لحالة"
        if (order.isPersisted) {
          //console.warn('⚠️ [POS] BLOCKED: Cannot change order type for persisted order!', {
          //  orderId: order.id,
          //  currentType: order.type,
          //  attemptedType: type,
          //  isPersisted: order.isPersisted
          //});
          UI.pushToast(ctx, {
            title: t.toast.order_type_locked || 'لا يمكن تغيير نوع الطلب',
            message: 'الطلبات المحفوظة لا يمكن تغيير نوعها',
            icon: '🔒'
          });
          return;
        }

        ctx.setState(s => {
          const data = s.data || {};
          const order = data.order || {};
          const lines = order.lines || [];
          let tablesState = data.tables || [];
          const nextOrder = { ...order, type };
          if (type !== 'dine_in' && order.tableId) {
            const orderId = order.id;
            const tableId = order.tableId;
            tablesState = (tablesState || []).map(tbl => {
              if (tbl.id !== tableId) return tbl;
              const nextSessions = (tbl.sessions || []).filter(id => id !== orderId);
              const wasLockedByOrder = tbl.lockedBy === orderId;
              const nextStatus = nextSessions.length ? tbl.status : (tbl.status === 'occupied' ? 'available' : tbl.status);
              return {
                ...tbl,
                sessions: nextSessions,
                locked: wasLockedByOrder ? false : tbl.locked,
                lockedBy: wasLockedByOrder ? null : tbl.lockedBy,
                status: nextStatus
              };
            });
            nextOrder.tableId = null;
            nextOrder.table = null;
          }
          if (type === 'dine_in' && !nextOrder.tableId) {
            nextOrder.table = null;
          }
          nextOrder.discount = normalizeDiscount(order.discount);
          nextOrder.totals = calculateTotals(lines, data.settings || {}, type, { orderDiscount: nextOrder.discount });
          const paymentEntries = getActivePaymentEntries(nextOrder, data.payments);
          const paymentSnapshot = summarizePayments(nextOrder.totals, paymentEntries);
          nextOrder.paymentState = paymentSnapshot.state;
          nextOrder.guests = type === 'dine_in'
            ? (nextOrder.guests || computeGuestsForTables(nextOrder.tableIds || [], data.tables || []))
            : 0;
          return {
            ...s,
            data: {
              ...data,
              tables: tablesState,
              order: nextOrder
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.order_type_changed, icon: '🔄' });
      }
    },
    'pos.order.save': {
      on: ['click'],
      gkeys: ['pos:order:save'],
      handler: async (e, ctx) => {
        //console.log('🚀 [POS SAVE] Save button clicked');

        // ✅ STRONG protection against duplicate saves
        if (IS_SAVING_ORDER) {
          //console.warn('⚠️ [POS SAVE] Save already in progress - BLOCKING duplicate save attempt');
          return;
        }

        // ✅ PRE-VALIDATION: Check for empty order BEFORE calling persistOrderFlow
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const lines = order.lines || [];
        const validLines = lines.filter(line => {
          const notCancelled = !line.cancelled && !line.voided;
          const hasQuantity = Number(line.qty || line.quantity || 0) > 0;
          return notCancelled && hasQuantity;
        });

        //console.log('🔍 [POS SAVE] Pre-validation check:', {
        //  totalLines: lines.length,
        //  validLines: validLines.length,
        //  orderId: order.id,
        //  isPersisted: order.isPersisted
        //});

        if (!validLines.length) {
          console.error('❌ [POS SAVE] BLOCKED: Cannot save empty order - no valid lines!');
          UI.pushToast(ctx, {
            title: t.toast.empty_order || 'لا يمكن حفظ طلب فارغ',
            subtitle: 'يجب إضافة صنف واحد على الأقل',
            icon: '⚠️'
          });
          return;
        }

        // ✅ Check for zero total
        const totals = order.totals || calculateTotals(validLines, state.data.settings || {}, order.type || 'dine_in', { orderDiscount: order.discount });
        //console.log('🔍 [POS SAVE] Total check:', { due: totals.due, subtotal: totals.subtotal });

        if (totals.due <= 0 && !order.isPersisted) {
          console.error('❌ [POS SAVE] BLOCKED: Cannot save order with zero or negative total!');
          UI.pushToast(ctx, {
            title: t.toast.order_zero_total || 'لا يمكن حفظ طلب بقيمة صفرية',
            subtitle: 'تأكد من أن جميع الأصناف لها أسعار صحيحة',
            icon: '⚠️'
          });
          return;
        }

        const trigger = e.target.closest('[data-save-mode]');
        const mode = trigger?.getAttribute('data-save-mode') || 'save';  // ✅ Changed default from 'draft'

        //console.log('✅ [POS SAVE] Starting save operation', { mode, validLines: validLines.length });

        IS_SAVING_ORDER = true;
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), saving: true }
        }));

        try {
          const result = await persistOrderFlow(ctx, mode);
          //console.log('✅ [POS SAVE] Save completed successfully', result);
        } catch (error) {
          console.error('❌ [POS SAVE] Save failed:', error);
          throw error;
        } finally {
          // ✅ Release save lock immediately
          // No need for delays - save button is hidden in takeaway, and for other types
          // the new blank order created by persistOrderFlow has no lines → no save button shown
          IS_SAVING_ORDER = false;
          ctx.setState(s => ({
            ...s,
            ui: { ...(s.ui || {}), saving: false }
          }));
          //console.log('🔓 [POS SAVE] Save lock released');
        }
      }
    },
    'pos.shift.open': {
      on: ['click'],
      gkeys: ['pos:shift:open'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showPin: true, pin: '', openingFloat: s.ui?.shift?.openingFloat ?? s.data?.shift?.config?.openingFloat ?? SHIFT_OPEN_FLOAT_DEFAULT } }
        }));
      }
    },
    'pos.shift.pin': {
      on: ['input', 'change'],
      gkeys: ['pos:shift:pin'],
      handler: (e, ctx) => {
        const raw = e.target.value || '';
        const state = ctx.getState();
        const maxLength = state.data.shift?.config?.pinLength || SHIFT_PIN_LENGTH;
        const digitsOnly = raw.replace(/\D/g, '');
        const value = maxLength ? digitsOnly.slice(0, maxLength) : digitsOnly;
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), pin: value } }
        }));
      }
    },
    'pos.shift.opening-float': {
      on: ['input', 'change'],
      gkeys: ['pos:shift:opening-float'],
      handler: (e, ctx) => {
        const value = parseFloat(e.target.value);
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), openingFloat: Number.isFinite(value) ? value : 0 } }
        }));
      }
    },
    'pos.shift.pin.confirm': {
      on: ['click'],
      gkeys: ['pos:shift:pin:confirm'],
      handler: async (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const config = state.data.shift?.config || {};
        const rawPin = String(state.ui?.shift?.pin || '').trim();
        const normalizedPin = normalizePinValue(rawPin);
        if (!normalizedPin) {
          UI.pushToast(ctx, { title: t.toast.shift_pin_invalid, icon: '⚠️' });
          return;
        }
        const stateEmployees = Array.isArray(state.data.employees) ? state.data.employees : [];
        const remoteSource = state.data?.remotes?.posDatabase || {};
        const remoteEmployees = normalizeEmployeesList(resolveEmployeeList(remoteSource));
        const employees = normalizeEmployeesList([...remoteEmployees, ...stateEmployees]);
        const remoteShiftSettings = resolveShiftSettings(remoteSource);
        const fallbackPins = new Set();
        const registerFallbackPin = (pinValue) => {
          const normalized = normalizePinValue(pinValue);
          if (normalized) fallbackPins.add(normalized);
        };
        registerFallbackPin(SHIFT_PIN_FALLBACK);
        registerFallbackPin(remoteShiftSettings?.pin);
        registerFallbackPin(remoteShiftSettings?.default_pin);
        registerFallbackPin(remoteShiftSettings?.defaultPin);
        registerFallbackPin(remoteShiftSettings?.fallback_pin);
        registerFallbackPin(remoteShiftSettings?.fallbackPin);
        registerFallbackPin(state.data?.shift?.config?.fallbackPin);
        registerFallbackPin(state.data?.shift?.config?.defaultPin);
        employees.forEach(emp => { if (emp.isFallback) registerFallbackPin(emp.pin); });
        const matchedEmployee = employees.find(emp => emp.pin === normalizedPin);
        if (typeof window !== 'undefined' && window.console) {
          const debugEmployees = employees.map(emp => ({ id: emp.id, name: emp.name, role: emp.role, pin: emp.pin, fallback: emp.isFallback || false }));
          console.group('[Mishkah][POS] 🔐 SHIFT PIN VALIDATION - DETAILED DEBUGGING');
          // //console.log('═══════════════════════════════════════════════════════════');
          //console.log('📌 ENTERED PIN:', { raw: rawPin, normalized: normalizedPin, pinLength: normalizedPin.length });
          // //console.log('═══════════════════════════════════════════════════════════');
          //console.log('📊 DATA SOURCES:');
          //console.log('  • state.data.employees:', stateEmployees);
          //console.log('  • state.data.remotes:', state.data?.remotes);
          //console.log('  • remoteSource (posDatabase):', remoteSource);
          // //console.log('═══════════════════════════════════════════════════════════');
          //console.log('🔍 RESOLVED DATA:');
          //console.log('  • resolveEmployeeList(remoteSource) returned:', resolveEmployeeList(remoteSource));
          //console.log('  • remoteEmployees (normalized):', remoteEmployees);
          //console.log('  • stateEmployees:', stateEmployees);
          //console.log('  • FINAL employees array (combined & normalized):', employees);
          // //console.log('═══════════════════════════════════════════════════════════');
          //console.log('👥 EMPLOYEES TABLE:');
          console.table(debugEmployees);
          // //console.log('═══════════════════════════════════════════════════════════');
          //console.log('🔑 SHIFT SETTINGS:');
          //console.log('  • SHIFT_PIN_FALLBACK (global):', SHIFT_PIN_FALLBACK);
          //console.log('  • remoteShiftSettings:', remoteShiftSettings);
          //console.log('  • state.data.shift.config:', config);
          //console.log('  • Fallback PINs (Set):', Array.from(fallbackPins));
          // //console.log('═══════════════════════════════════════════════════════════');
          //console.log('✅ PIN MATCHING:');
          //console.log('  • Entered PIN (normalized):', normalizedPin);
          //console.log('  • Matched Employee:', matchedEmployee);
          //console.log('  • Is fallback PIN?', fallbackPins.has(normalizedPin));
          if (!matchedEmployee) {
            //console.warn('❌ NO EMPLOYEE MATCHED THE PIN!');
            //console.log('  • PIN comparison details:');
            employees.forEach((emp, i) => {
              const match = emp.pin === normalizedPin;
              //console.log(`    [${i}] ${emp.name} (${emp.id}): pin="${emp.pin}" ${match ? '✅ MATCH' : `❌ (pin type: ${typeof emp.pin}, entered type: ${typeof normalizedPin})`}`);
            });
          } else {
            //console.log('✅ EMPLOYEE MATCHED:', matchedEmployee);
          }
          // //console.log('═══════════════════════════════════════════════════════════');
          console.groupEnd();
        }
        let effectiveEmployee = matchedEmployee;
        if (!effectiveEmployee && fallbackPins.has(normalizedPin)) {
          effectiveEmployee = matchedEmployee || employees.find(emp => (emp.isFallback || false) && emp.pin === normalizedPin);
          if (!effectiveEmployee) {
            const fallbackUser = state.data.user || {};
            effectiveEmployee = {
              id: fallbackUser.id || 'cashier-guest',
              name: fallbackUser.name || 'أحمد محمود',
              role: fallbackUser.role || 'cashier',
              allowedDiscountRate: fallbackUser.allowedDiscountRate ?? 0,
              pin: normalizedPin,
              isFallback: true
            };
          }
        }
        if (!effectiveEmployee) {
          UI.pushToast(ctx, { title: t.toast.shift_pin_invalid, icon: '⚠️' });
          return;
        }
        const now = Date.now();
        const openingFloat = Number(state.ui?.shift?.openingFloat ?? config.openingFloat ?? 0);
        const totalsTemplate = ORDER_TYPES.reduce((acc, type) => { acc[type.id] = 0; return acc; }, {});
        const paymentsTemplate = (state.data.payments?.methods || PAYMENT_METHODS).reduce((acc, method) => {
          acc[method.id] = 0;
          return acc;
        }, {});
        let persistedShift = null;
        try {
          const baseShiftInput = {
            id: `${POS_INFO.id}-S${now.toString(36).toUpperCase()}`,
            posId: POS_INFO.id,
            posLabel: POS_INFO.label,
            posNumber: POS_INFO.number,
            openedAt: now,
            openingFloat: round(openingFloat),
            totalsByType: totalsTemplate,
            paymentsByMethod: paymentsTemplate,
            totalSales: 0,
            orders: [],
            countsByType: {},
            ordersCount: 0,
            cashierId: effectiveEmployee.id,
            cashierName: effectiveEmployee.name,
            employeeId: effectiveEmployee.id,
            cashierRole: effectiveEmployee.role,
            status: 'open',
            closingCash: null,
            isClosed: false,
            createdAt: toIsoString(now),
            updatedAt: toIsoString(now),
            version: 1
          };
          const validatedShift = SHIFT_TABLE.createRecord(baseShiftInput);
          const remoteShift = await insertShiftRemote(validatedShift);
          const mergedShift = remoteShift ? { ...validatedShift, ...remoteShift } : validatedShift;
          persistedShift = posDB.available
            ? await posDB.openShiftRecord(mergedShift)
            : mergedShift;
        } catch (error) {
          //console.warn('[Mishkah][POS] shift open failed', error);
          UI.pushToast(ctx, { title: t.toast.indexeddb_error, icon: '🛑' });
          return;
        }
        if (!persistedShift) {
          UI.pushToast(ctx, { title: t.toast.shift_pin_invalid, icon: '⚠️' });
          return;
        }
        const normalizedShift = SHIFT_TABLE.createRecord({
          ...persistedShift,
          totalsByType: persistedShift.totalsByType || {},
          paymentsByMethod: persistedShift.paymentsByMethod || {},
          countsByType: persistedShift.countsByType || {},
          orders: Array.isArray(persistedShift.orders) ? persistedShift.orders : []
        });
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            user: {
              ...(s.data.user || {}),
              id: effectiveEmployee.id,
              name: effectiveEmployee.name,
              role: effectiveEmployee.role,
              allowedDiscountRate: effectiveEmployee.allowedDiscountRate ?? s.data.user?.allowedDiscountRate,
              shift: normalizedShift.id
            },
            order: { ...(s.data.order || {}), shiftId: normalizedShift.id },
            shift: { ...(s.data.shift || {}), current: normalizedShift }
          },
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showPin: false, pin: '', showSummary: false, viewShiftId: normalizedShift.id } }
        }));
        await refreshPersistentSnapshot({ focusCurrent: true });
        UI.pushToast(ctx, { title: t.toast.shift_open_success, icon: '✅' });
      }
    },
    'pos.shift.pin.cancel': {
      on: ['click'],
      gkeys: ['pos:shift:pin:cancel'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showPin: false, pin: '' } }
        }));
      }
    },
    'pos.shift.summary': {
      on: ['click'],
      gkeys: ['pos:shift:summary'],
      handler: async (e, ctx) => {
        await refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
        const state = ctx.getState();
        const current = state.data.shift?.current;
        const history = state.data.shift?.history || [];
        const defaultId = current?.id || (history.length ? history[history.length - 1].id : null);
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: true, viewShiftId: s.ui?.shift?.viewShiftId || defaultId, activeTab: 'summary' } }
        }));
      }
    },
    'pos.shift.summary.close': {
      on: ['click'],
      gkeys: ['pos:shift:summary:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: false } }
        }));
      }
    },
    'pos.shift.view': {
      on: ['click'],
      gkeys: ['pos:shift:view'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-shift-id]');
        if (!btn) return;
        const shiftId = btn.getAttribute('data-shift-id');
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), viewShiftId: shiftId } }
        }));
      }
    },
    'pos.shift.close': {
      on: ['click'],
      gkeys: ['pos:shift:close'],
      handler: async (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const currentShift = state.data.shift?.current;
        if (!currentShift) {
          ctx.setState(s => ({
            ...s,
            ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: false } }
          }));
          return;
        }
        const sanitizedCurrent = SHIFT_TABLE.createRecord({
          ...currentShift,
          totalsByType: currentShift.totalsByType || {},
          paymentsByMethod: currentShift.paymentsByMethod || {},
          countsByType: currentShift.countsByType || {},
          orders: Array.isArray(currentShift.orders) ? currentShift.orders : []
        });
        const summary = summarizeShiftOrders(state.data.ordersHistory, sanitizedCurrent);
        const paymentsByMethod = summary.paymentsByMethod || {};
        const closingCash = currentShift.closingCash != null ? round(currentShift.closingCash) : round((sanitizedCurrent.openingFloat || 0) + (paymentsByMethod.cash || 0));
        const baseClosed = {
          ...sanitizedCurrent,
          totalsByType: summary.totalsByType,
          paymentsByMethod,
          orders: summary.orders,
          countsByType: summary.countsByType,
          ordersCount: summary.ordersCount,
          totalSales: summary.totalSales,
          closingCash,
          closedAt: Date.now(),
          status: 'closed',
          isClosed: true,
          version: Number.isFinite(currentShift.version) ? Math.trunc(currentShift.version) : 1,
          updatedAt: toIsoString(Date.now())
        };
        let closedShift = baseClosed;
        try {
          const remoteClosed = await updateShiftRemote(baseClosed);
          if (remoteClosed) closedShift = { ...closedShift, ...remoteClosed };
        } catch (err) {
          //console.warn('[Mishkah][POS] remote shift close failed', err);
        }
        if (posDB.available) {
          try {
            closedShift = await posDB.closeShiftRecord(currentShift.id, closedShift);
          } catch (error) {
            //console.warn('[Mishkah][POS] shift close failed', error);
            UI.pushToast(ctx, { title: t.toast.indexeddb_error, icon: '🛑' });
            return;
          }
        }
        const normalizedClosed = SHIFT_TABLE.createRecord({
          ...closedShift,
          totalsByType: closedShift.totalsByType || summary.totalsByType,
          paymentsByMethod: closedShift.paymentsByMethod || paymentsByMethod,
          countsByType: closedShift.countsByType || summary.countsByType,
          orders: Array.isArray(closedShift.orders) ? closedShift.orders : summary.orders
        });
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            user: { ...(s.data.user || {}), shift: '—' },
            order: { ...(s.data.order || {}), shiftId: null },
            shift: {
              ...(s.data.shift || {}),
              current: null,
              history: [...(s.data.shift?.history || []), normalizedClosed]
            }
          },
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: true, viewShiftId: normalizedClosed.id } }
        }));
        await refreshPersistentSnapshot({ focusCurrent: false, syncOrders: true });
        UI.pushToast(ctx, { title: t.toast.shift_close_success, icon: '✅' });
      }
    },
    'pos.customer.open': {
      on: ['click'],
      gkeys: ['pos:customer:open'],
      handler: (e, ctx) => {
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const order = s.data.order || {};
          const customers = Array.isArray(s.data.customers) ? s.data.customers : [];
          const fallbackCustomerId = current.selectedCustomerId || order.customerId || customers[0]?.id || null;
          const fallbackCustomer = findCustomer(customers, fallbackCustomerId);
          const fallbackAddressId = current.selectedAddressId || order.customerAddressId || fallbackCustomer?.addresses?.[0]?.id || null;
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              customer: {
                ...current,
                open: true,
                mode: 'search',
                keypad: '',
                selectedCustomerId: fallbackCustomerId,
                selectedAddressId: fallbackAddressId
              }
            }
          };
        });
      }
    },
    'pos.customer.close': {
      on: ['click'],
      gkeys: ['pos:customer:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), customer: { ...(s.ui?.customer || {}), open: false } }
        }));
      }
    },
    'pos.customer.mode': {
      on: ['click'],
      gkeys: ['pos:customer:mode'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-mode]');
        if (!btn) return;
        const mode = btn.getAttribute('data-mode') || 'search';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          let nextForm = current.form || createEmptyCustomerForm();
          if (mode === 'create' && (!nextForm || typeof nextForm !== 'object')) {
            nextForm = createEmptyCustomerForm();
          }
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              customer: {
                ...current,
                mode,
                keypad: '',
                form: nextForm
              }
            }
          };
        });
      }
    },
    'pos.customer.search': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:search'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const customers = Array.isArray(s.data.customers) ? s.data.customers : [];
          const normalized = value.trim().toLowerCase();
          let selectedId = current.selectedCustomerId || s.data.order?.customerId || null;
          if (normalized) {
            const matches = customers.filter(customer => {
              const name = (customer.name || '').toLowerCase();
              const phoneMatch = (customer.phones || []).some(phone => String(phone).includes(normalized));
              return name.includes(normalized) || phoneMatch;
            }).map(customer => customer.id);
            if (matches.length) {
              if (!matches.includes(selectedId)) {
                selectedId = matches[0];
              }
            } else {
              selectedId = null;
            }
          }
          let selectedAddressId = current.selectedAddressId;
          if (selectedId) {
            const selectedCustomer = findCustomer(customers, selectedId);
            if (!selectedCustomer) {
              selectedAddressId = null;
            } else if (!selectedAddressId || !(selectedCustomer.addresses || []).some(address => address.id === selectedAddressId)) {
              selectedAddressId = selectedCustomer.addresses?.[0]?.id || null;
            }
          } else {
            selectedAddressId = null;
          }
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              customer: {
                ...current,
                search: value,
                selectedCustomerId: selectedId,
                selectedAddressId
              }
            }
          };
        });
      }
    },
    'pos.customer.keypad': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:keypad'],
      handler: (e, ctx) => {
        const digits = (e.target.value || '').replace(/[^0-9+]/g, '');
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), customer: { ...(s.ui?.customer || {}), keypad: digits } }
        }));
      }
    },
    'pos.customer.keypad.confirm': {
      on: ['click'],
      gkeys: ['pos:customer:keypad:confirm'],
      handler: (e, ctx) => {
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const keypad = (current.keypad || '').trim();
          const customers = Array.isArray(s.data.customers) ? s.data.customers : [];
          let selectedId = current.selectedCustomerId || s.data.order?.customerId || null;
          if (keypad) {
            const matches = customers.filter(customer => {
              const name = (customer.name || '').toLowerCase();
              const phoneMatch = (customer.phones || []).some(phone => String(phone).includes(keypad));
              return name.includes(keypad.toLowerCase()) || phoneMatch;
            }).map(customer => customer.id);
            if (matches.length) {
              if (!matches.includes(selectedId)) {
                selectedId = matches[0];
              }
            } else {
              selectedId = null;
            }
          }
          let selectedAddressId = current.selectedAddressId;
          if (selectedId) {
            const selectedCustomer = findCustomer(customers, selectedId);
            if (!selectedCustomer) {
              selectedAddressId = null;
            } else if (!selectedAddressId || !(selectedCustomer.addresses || []).some(address => address.id === selectedAddressId)) {
              selectedAddressId = selectedCustomer.addresses?.[0]?.id || null;
            }
          } else {
            selectedAddressId = null;
          }
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              customer: {
                ...current,
                search: keypad,
                keypad: '',
                selectedCustomerId: selectedId,
                selectedAddressId
              }
            }
          };
        });
      }
    },
    'pos.customer.select': {
      on: ['click'],
      gkeys: ['pos:customer:select'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-customer-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-customer-id');
        ctx.setState(s => {
          const customers = s.data.customers || [];
          const customer = findCustomer(customers, id);
          const firstAddress = customer?.addresses?.[0]?.id || null;
          return {
            ...s,
            ui: {
              ...(s.ui || {}),
              customer: {
                ...(s.ui?.customer || {}),
                selectedCustomerId: id,
                selectedAddressId: firstAddress || s.ui?.customer?.selectedAddressId || null
              }
            }
          };
        });
      }
    },
    'pos.customer.address.select': {
      on: ['click'],
      gkeys: ['pos:customer:address:select'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-address-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-address-id');
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), customer: { ...(s.ui?.customer || {}), selectedAddressId: id } }
        }));
      }
    },
    'pos.customer.attach': {
      on: ['click'],
      gkeys: ['pos:customer:attach'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const customers = state.data.customers || [];
        const customerId = state.ui?.customer?.selectedCustomerId || state.data.order?.customerId;
        const customer = findCustomer(customers, customerId);
        if (!customer) {
          UI.pushToast(ctx, { title: t.toast.customer_missing_selection, icon: '⚠️' });
          return;
        }
        const addressId = state.ui?.customer?.selectedAddressId || state.data.order?.customerAddressId || null;
        const address = addressId ? findCustomerAddress(customer, addressId) : null;
        if (state.data.order?.type === 'delivery' && !address) {
          UI.pushToast(ctx, { title: t.toast.customer_missing_address, icon: '⚠️' });
          return;
        }
        ctx.setState(s => {
          const order = s.data.order || {};
          return {
            ...s,
            data: {
              ...s.data,
              order: {
                ...order,
                customerId: customer.id,
                customerAddressId: address?.id || null,
                customerName: customer.name,
                customerPhone: customer.phones?.[0] || '',
                customerAddress: address?.line || address?.title || '',
                customerAreaId: address?.areaId || null
              }
            },
            ui: {
              ...(s.ui || {}),
              customer: { ...(s.ui?.customer || {}), open: false }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.customer_attach_success, icon: '✅' });
      }
    },
    'pos.customer.edit': {
      on: ['click'],
      gkeys: ['pos:customer:edit'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const customers = state.data.customers || [];
        const customerId = state.ui?.customer?.selectedCustomerId || state.data.order?.customerId;
        const customer = findCustomer(customers, customerId);
        if (!customer) return;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            customer: {
              ...(s.ui?.customer || {}),
              mode: 'create',
              keypad: '',
              form: {
                id: customer.id,
                name: customer.name,
                phones: (customer.phones || []).slice(),
                addresses: (customer.addresses || []).map(address => ({ ...address }))
              }
            }
          }
        }));
      }
    },
    'pos.customer.form.reset': {
      on: ['click'],
      gkeys: ['pos:customer:form:reset'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), customer: { ...(s.ui?.customer || {}), form: createEmptyCustomerForm(), keypad: '' } }
        }));
      }
    },
    'pos.customer.form.name': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:form:name'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          form.name = value;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.phone': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:form:phone'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        const value = (e.target.value || '').replace(/[^0-9+]/g, '');
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const phones = Array.isArray(form.phones) ? form.phones.slice() : [];
          while (phones.length <= index) phones.push('');
          phones[index] = value;
          form.phones = phones;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.phone.add': {
      on: ['click'],
      gkeys: ['pos:customer:form:phone:add'],
      handler: (e, ctx) => {
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const phones = Array.isArray(form.phones) ? form.phones.slice() : [];
          phones.push('');
          form.phones = phones;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.phone.remove': {
      on: ['click'],
      gkeys: ['pos:customer:form:phone:remove'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          let phones = Array.isArray(form.phones) ? form.phones.slice() : [];
          if (phones.length <= 1) return s;
          phones = phones.filter((_, i) => i !== index);
          form.phones = phones.length ? phones : [''];
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.address.add': {
      on: ['click'],
      gkeys: ['pos:customer:form:address:add'],
      handler: (e, ctx) => {
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const addresses = Array.isArray(form.addresses) ? form.addresses.slice() : [];
          addresses.push({ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' });
          form.addresses = addresses;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.address.remove': {
      on: ['click'],
      gkeys: ['pos:customer:form:address:remove'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          let addresses = Array.isArray(form.addresses) ? form.addresses.slice() : [];
          if (addresses.length <= 1) return s;
          addresses = addresses.filter((_, i) => i !== index);
          form.addresses = addresses.length ? addresses : [{ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' }];
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.address:title': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:form:address:title'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        const value = e.target.value || '';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const addresses = Array.isArray(form.addresses) ? form.addresses.slice() : [];
          while (addresses.length <= index) addresses.push({ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' });
          addresses[index] = { ...(addresses[index] || {}), title: value };
          form.addresses = addresses;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.address:area': {
      on: ['change'],
      gkeys: ['pos:customer:form:address:area'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        const value = e.target.value || '';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const addresses = Array.isArray(form.addresses) ? form.addresses.slice() : [];
          while (addresses.length <= index) addresses.push({ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' });
          addresses[index] = { ...(addresses[index] || {}), areaId: value };
          form.addresses = addresses;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.address:line': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:form:address:line'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        const value = e.target.value || '';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const addresses = Array.isArray(form.addresses) ? form.addresses.slice() : [];
          while (addresses.length <= index) addresses.push({ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' });
          addresses[index] = { ...(addresses[index] || {}), line: value };
          form.addresses = addresses;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.address:notes': {
      on: ['input', 'change'],
      gkeys: ['pos:customer:form:address:notes'],
      handler: (e, ctx) => {
        const index = Number(e.target.getAttribute('data-index') || 0);
        const value = e.target.value || '';
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const addresses = Array.isArray(form.addresses) ? form.addresses.slice() : [];
          while (addresses.length <= index) addresses.push({ id: null, title: '', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' });
          addresses[index] = { ...(addresses[index] || {}), notes: value };
          form.addresses = addresses;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form } }
          };
        });
      }
    },
    'pos.customer.form.keypad.confirm': {
      on: ['click'],
      gkeys: ['pos:customer:form:keypad:confirm'],
      handler: (e, ctx) => {
        ctx.setState(s => {
          const current = s.ui?.customer || {};
          const digits = (current.keypad || '').trim();
          if (!digits) return s;
          const form = current.form ? { ...current.form } : createEmptyCustomerForm();
          const phones = Array.isArray(form.phones) ? form.phones.slice() : [];
          if (phones.length && !phones[phones.length - 1]) {
            phones[phones.length - 1] = digits;
          } else {
            phones.push(digits);
          }
          form.phones = phones;
          return {
            ...s,
            ui: { ...(s.ui || {}), customer: { ...current, form, keypad: '' } }
          };
        });
      }
    },
    'pos.customer.save': {
      on: ['click'],
      gkeys: ['pos:customer:save'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const form = state.ui?.customer?.form || createEmptyCustomerForm();
        const name = (form.name || '').trim();
        const phones = (form.phones || []).map(phone => String(phone || '').trim()).filter(Boolean);
        if (!name || !phones.length) {
          UI.pushToast(ctx, { title: t.toast.customer_form_invalid, icon: '⚠️' });
          return;
        }
        const addresses = (form.addresses || []).map((address, idx) => ({
          id: address.id || `ADDR-${Date.now().toString(36)}-${idx}`,
          title: address.title || '',
          areaId: address.areaId || CAIRO_DISTRICTS[0]?.id || '',
          line: address.line || '',
          notes: address.notes || ''
        }));
        const customerId = form.id || `CUST-${Date.now().toString(36).toUpperCase()}`;
        ctx.setState(s => {
          const customers = Array.isArray(s.data.customers) ? s.data.customers.slice() : [];
          const index = customers.findIndex(customer => customer.id === customerId);
          const payload = { id: customerId, name, phones, addresses };
          if (index >= 0) {
            customers[index] = payload;
          } else {
            customers.push(payload);
          }
          const currentOrder = s.data.order || {};
          let nextOrder = currentOrder;
          if (currentOrder.customerId && currentOrder.customerId === payload.id) {
            const attachedAddress = payload.addresses.find(address => address.id === currentOrder.customerAddressId) || payload.addresses[0] || null;
            nextOrder = {
              ...currentOrder,
              customerName: payload.name,
              customerPhone: payload.phones[0] || '',
              customerAddressId: attachedAddress?.id || null,
              customerAddress: attachedAddress?.line || attachedAddress?.title || '',
              customerAreaId: attachedAddress?.areaId || null
            };
          }
          return {
            ...s,
            data: { ...(s.data || {}), customers, order: nextOrder },
            ui: {
              ...(s.ui || {}),
              customer: {
                ...(s.ui?.customer || {}),
                mode: 'search',
                form: createEmptyCustomerForm(),
                keypad: '',
                selectedCustomerId: payload.id,
                selectedAddressId: nextOrder.customerAddressId || payload.addresses?.[0]?.id || null
              }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.customer_saved, icon: '💾' });
      }
    },
    'pos.order.nav.prev': {
      on: ['click'],
      gkeys: ['pos:order:nav:prev'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const history = state.data.ordersHistory || [];
        if (!history.length) return;
        const currentId = state.data.order?.id;
        const index = history.findIndex(entry => entry.id === currentId);
        if (index <= 0) return;
        const target = history[index - 1];
        if (target) activateOrder(ctx, target, { hideOrderNavPad: true, resetOrderNavValue: true });
      }
    },
    'pos.order.nav.next': {
      on: ['click'],
      gkeys: ['pos:order:nav:next'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const history = state.data.ordersHistory || [];
        if (!history.length) return;
        const currentId = state.data.order?.id;
        const index = history.findIndex(entry => entry.id === currentId);
        if (index < 0 || index >= history.length - 1) return;
        const target = history[index + 1];
        if (target) activateOrder(ctx, target, { hideOrderNavPad: true, resetOrderNavValue: true });
      }
    },
    'pos.order.nav.pad': {
      on: ['click'],
      gkeys: ['pos:order:nav:pad'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), orderNav: { ...(s.ui?.orderNav || {}), showPad: true } }
        }));
      }
    },
    'pos.order.nav.close': {
      on: ['click'],
      gkeys: ['pos:order:nav:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), orderNav: { ...(s.ui?.orderNav || {}), showPad: false } }
        }));
      }
    },
    'pos.order.nav.input': {
      on: ['input', 'change'],
      gkeys: ['pos:order:nav:input'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), orderNav: { ...(s.ui?.orderNav || {}), value } }
        }));
      }
    },
    'pos.order.nav.confirm': {
      on: ['click'],
      gkeys: ['pos:order:nav:confirm'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const value = (state.ui?.orderNav?.value || '').trim();
        const history = state.data.ordersHistory || [];
        if (!value) {
          ctx.setState(s => ({
            ...s,
            ui: { ...(s.ui || {}), orderNav: { ...(s.ui?.orderNav || {}), showPad: false } }
          }));
          return;
        }
        const normalized = value.toLowerCase();
        let target = history.find(entry => String(entry.id).toLowerCase() === normalized);
        if (!target && value.includes('-')) {
          const lastSegment = value.split('-').pop();
          const numericPart = parseInt(lastSegment, 10);
          if (!Number.isNaN(numericPart)) {
            target = history.find(entry => {
              const parts = String(entry.id).split('-');
              const entrySegment = parts[parts.length - 1];
              const entryNumber = parseInt(entrySegment, 10);
              return entryNumber === numericPart;
            });
          }
        }
        if (!target) {
          const seq = parseInt(value, 10);
          if (!Number.isNaN(seq)) {
            target = history.find(entry => (entry.seq || history.indexOf(entry) + 1) === seq);
          }
        }
        if (!target) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        activateOrder(ctx, target, { hideOrderNavPad: true, resetOrderNavValue: true });
      }
    },
    'pos.order.print': {
      on: ['click'],
      gkeys: ['pos:order:print'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s, //edit4  ticketSnapshot: null
          ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), print: true }, print: { ...(s.ui?.print || {}), docType: s.data.print?.docType || 'customer', size: s.data.print?.size || 'thermal_80', ticketSnapshot: null } }
        }));
      }
    },
    'pos.order.export': {
      on: ['click'],
      gkeys: ['pos:order:export'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const docType = state.ui?.print?.docType || state.data.print?.docType || 'customer';
        const profile = state.data.print?.profiles?.[docType] || {};
        const size = state.ui?.print?.size || profile.size || state.data.print?.size || 'thermal_80';
        if (typeof window === 'undefined') {
          UI.pushToast(ctx, { title: t.toast.pdf_exported, icon: '📄' });
          return;
        }
        const html = renderPrintableHTML(state, docType, size);
        const popup = window.open('', '_blank', 'width=900,height=1200');
        if (!popup) {
          UI.pushToast(ctx, { title: t.toast.browser_popup_blocked, icon: '⚠️' });
          return;
        }
        try {
          popup.document.open();
          popup.document.write(html);
          popup.document.close();
          if (typeof popup.focus === 'function') popup.focus();
        } catch (err) {
          console.error('PDF export failed', err);
        }
        UI.pushToast(ctx, { title: t.toast.pdf_exported, icon: '📄' });
      }
    },
    'pos.print.size': {
      on: ['click'],
      gkeys: ['pos:print:size'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-print-size]');
        if (!btn) return;
        const size = btn.getAttribute('data-print-size') || 'thermal_80';
        const state = ctx.getState();
        const docType = state.ui?.print?.docType || state.data.print?.docType || 'customer';
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            print: (() => {
              const current = { ...(s.data.print || {}) };
              current.size = size;
              const profiles = { ...(current.profiles || {}) };
              const profile = { ...(profiles[docType] || {}) };
              profile.size = size;
              profiles[docType] = profile;
              current.profiles = profiles;
              return current;
            })()
          },
          ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), size } }
        }));
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.print_size_switched, icon: '🖨️' });
      }
    },
    'pos.print.doc': {
      on: ['click'],
      gkeys: ['pos:print:doc'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-doc-type]');
        if (!btn) return;
        const doc = btn.getAttribute('data-doc-type') || 'customer';
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), print: { ...(s.data.print || {}), docType: doc } },
          ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), docType: doc } }
        }));
      }
    },
    'pos.print.printer-select': {
      on: ['change'],
      gkeys: ['pos:print:printer-select'],
      handler: (e, ctx) => {
        const select = e.target.closest('select');
        if (!select) return;
        const field = select.getAttribute('data-print-field');
        if (!field) return;
        const value = select.value || '';
        const state = ctx.getState();
        const docType = state.ui?.print?.docType || state.data.print?.docType || 'customer';
        ctx.setState(s => {
          const printState = { ...(s.data.print || {}) };
          const profiles = { ...(printState.profiles || {}) };
          const profile = { ...(profiles[docType] || {}) };
          profile[field] = value;
          profiles[docType] = profile;
          printState.profiles = profiles;
          return {
            ...s,
            data: { ...(s.data || {}), print: printState }
          };
        });
      }
    },
    'pos.print.advanced-toggle': {
      on: ['click'],
      gkeys: ['pos:print:advanced-toggle'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), showAdvanced: !s.ui?.print?.showAdvanced } }
        }));
      }
    },
    'pos.print.manage-toggle': {
      on: ['click'],
      gkeys: ['pos:print:manage-toggle'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), managePrinters: !s.ui?.print?.managePrinters } }
        }));
      }
    },
    'pos.print.preview-expand': {
      on: ['click'],
      gkeys: ['pos:print:preview-expand'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), previewExpanded: !s.ui?.print?.previewExpanded } }
        }));
      }
    },
    'pos.print.manage-input': {
      on: ['input', 'change'],
      gkeys: ['pos:print:manage-input'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), newPrinterName: value } }
        }));
      }
    },
    'pos.print.manage-add': {
      on: ['click'],
      gkeys: ['pos:print:manage-add'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const rawName = (state.ui?.print?.newPrinterName || '').trim();
        if (!rawName) {
          UI.pushToast(ctx, { title: t.toast.printer_name_required, icon: '⚠️' });
          return;
        }
        const existing = Array.isArray(state.data.print?.availablePrinters) ? state.data.print.availablePrinters : [];
        const normalized = rawName.toLowerCase();
        if (existing.some(item => (item.label || item.id || '').toLowerCase() === normalized)) {
          UI.pushToast(ctx, { title: t.toast.printer_exists, icon: 'ℹ️' });
          return;
        }
        const sanitizedIdBase = rawName.replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
        let id = sanitizedIdBase ? sanitizedIdBase.slice(0, 64) : `printer-${Date.now()}`;
        if (existing.some(item => item.id === id)) {
          id = `${id}-${Date.now()}`;
        }
        ctx.setState(s => {
          const printers = Array.isArray(s.data.print?.availablePrinters) ? s.data.print.availablePrinters.slice() : [];
          printers.push({ id, label: rawName });
          const printState = { ...(s.data.print || {}), availablePrinters: printers };
          return {
            ...s,
            data: { ...(s.data || {}), print: printState },
            ui: { ...(s.ui || {}), print: { ...(s.ui?.print || {}), newPrinterName: '' } }
          };
        });
        UI.pushToast(ctx, { title: t.toast.printer_added, icon: '🖨️' });
      }
    },
    'pos.print.manage-remove': {
      on: ['click'],
      gkeys: ['pos:print:manage-remove'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-printer-id]');
        if (!btn) return;
        const printerId = btn.getAttribute('data-printer-id');
        ctx.setState(s => {
          const current = { ...(s.data.print || {}) };
          const printers = Array.isArray(current.availablePrinters) ? current.availablePrinters.filter(item => item.id !== printerId) : [];
          const profiles = { ...(current.profiles || {}) };
          Object.keys(profiles).forEach(key => {
            const profile = { ...(profiles[key] || {}) };
            ['defaultPrinter', 'insidePrinter', 'outsidePrinter'].forEach(field => {
              if (profile[field] === printerId) profile[field] = '';
            });
            profiles[key] = profile;
          });
          current.availablePrinters = printers;
          current.profiles = profiles;
          return {
            ...s,
            data: { ...(s.data || {}), print: current }
          };
        });
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.printer_removed, icon: '🗑️' });
      }
    },
    'pos.print.profile-field': {
      on: ['input', 'change'],
      gkeys: ['pos:print:profile-field'],
      handler: (e, ctx) => {
        const field = e.target.getAttribute('data-print-field');
        if (!field) return;
        const rawValue = e.target.value || '';
        const state = ctx.getState();
        const docType = state.ui?.print?.docType || state.data.print?.docType || 'customer';
        ctx.setState(s => {
          const profiles = { ...(s.data.print?.profiles || {}) };
          const profile = { ...(profiles[docType] || {}) };
          if (field === 'copies') {
            const numeric = parseInt(rawValue, 10);
            profile[field] = Math.max(1, Number.isFinite(numeric) ? numeric : 1);
          } else {
            profile[field] = rawValue;
          }
          profiles[docType] = profile;
          return {
            ...s,
            data: { ...(s.data || {}), print: { ...(s.data.print || {}), profiles } }
          };
        });
      }
    },
    'pos.print.toggle': {
      on: ['click'],
      gkeys: ['pos:print:toggle'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-print-toggle]');
        if (!btn) return;
        const key = btn.getAttribute('data-print-toggle');
        const state = ctx.getState();
        const docType = state.ui?.print?.docType || state.data.print?.docType || 'customer';
        ctx.setState(s => {
          const profiles = { ...(s.data.print?.profiles || {}) };
          const profile = { ...(profiles[docType] || {}) };
          profile[key] = !profile[key];
          profiles[docType] = profile;
          return {
            ...s,
            data: { ...(s.data || {}), print: { ...(s.data.print || {}), profiles } }
          };
        });
      }
    },
    'pos.print.save': {
      on: ['click'],
      gkeys: ['pos:print:save'],
      handler: (e, ctx) => {
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.print_profile_saved, icon: '💾' });
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), print: false } }
        }));
      }
    },
    'pos.print.send': {
      on: ['click'],
      gkeys: ['pos:print:send'],
      handler: (e, ctx) => {
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.print_sent, icon: '🖨️' });
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), print: false } }
        }));
      }
    },
    'pos.print.browser': {
      on: ['click'],
      gkeys: ['pos:print:browser'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        if (typeof window === 'undefined') return;
        const docType = state.ui?.print?.docType || state.data.print?.docType || 'customer';
        const profile = state.data.print?.profiles?.[docType] || {};
        const size = state.ui?.print?.size || profile.size || state.data.print?.size || 'thermal_80';
        const html = renderPrintableHTML(state, docType, size);
        const popup = window.open('', '_blank', 'width=960,height=1200');
        if (!popup) {
          UI.pushToast(ctx, { title: t.toast.browser_popup_blocked, icon: '⚠️' });
          return;
        }
        try {
          popup.document.open();
          popup.document.write(html);
          popup.document.close();
          if (typeof popup.focus === 'function') popup.focus();
        } catch (err) {
          console.error('Browser print failed', err);
        }
        UI.pushToast(ctx, { title: t.toast.browser_print_opened, icon: '🖨️' });
      }
    },
    'pos.reservations.open': {
      on: ['click'],
      gkeys: ['pos:reservations:open'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), editing: null, form: null }, modals: { ...(s.ui?.modals || {}), reservations: true } }
        }));
      }
    },
    'pos.reservations.new': {
      on: ['click'],
      gkeys: ['pos:reservations:new'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            reservations: {
              ...(s.ui?.reservations || {}),
              editing: 'new',
              form: { id: null, customerName: '', phone: '', partySize: 2, scheduledAt: Date.now(), holdUntil: Date.now() + 3600000, tableIds: [], note: '' }
            }
          }
        }));
      }
    },
    'pos.reservations.range': {
      on: ['click'],
      gkeys: ['pos:reservations:range'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-reservation-range]');
        if (!btn) return;
        const range = btn.getAttribute('data-reservation-range') || 'today';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), filter: range } }
        }));
      }
    },
    'pos.reservations.status': {
      on: ['click'],
      gkeys: ['pos:reservations:status'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-reservation-status]');
        if (!btn) return;
        const status = btn.getAttribute('data-reservation-status') || 'all';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), status } }
        }));
      }
    },
    'pos.reservations.form': {
      on: ['input', 'change'],
      gkeys: ['pos:reservations:form'],
      handler: (e, ctx) => {
        const field = e.target.getAttribute('data-field');
        if (!field) return;
        const valueRaw = e.target.value;
        ctx.setState(s => {
          const form = { ...(s.ui?.reservations?.form || {}) };
          let value = valueRaw;
          if (field === 'partySize') value = parseInt(valueRaw || '0', 10) || 0;
          if (field === 'scheduledAt' || field === 'holdUntil') value = valueRaw ? new Date(valueRaw).getTime() : null;
          form[field] = value;
          return { ...s, ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), form } } };
        });
      }
    },
    'pos.reservations.form:table': {
      on: ['click'],
      gkeys: ['pos:reservations:form:table'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        ctx.setState(s => {
          const form = { ...(s.ui?.reservations?.form || { tableIds: [] }) };
          const set = new Set(form.tableIds || []);
          if (set.has(tableId)) set.delete(tableId); else set.add(tableId);
          form.tableIds = Array.from(set);
          return { ...s, ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), form } } };
        });
      }
    },
    'pos.reservations.cancel-edit': {
      on: ['click'],
      gkeys: ['pos:reservations:cancel-edit'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), editing: null, form: null } }
        }));
      }
    },
    'pos.reservations.save': {
      on: ['click'],
      gkeys: ['pos:reservations:save'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const form = state.ui?.reservations?.form;
        if (!form) return;
        if (!form.tableIds || !form.tableIds.length) {
          UI.pushToast(ctx, { title: t.toast.table_name_required, message: t.ui.reservations_tables_required, icon: '⚠️' });
          return;
        }
        const tables = state.data.tables || [];
        for (const id of form.tableIds) {
          const table = tables.find(tbl => tbl.id === id);
          if (table && table.state === 'maintenance') {
            UI.pushToast(ctx, { title: t.toast.table_state_updated, message: t.ui.reservations_conflict_maintenance, icon: '🛠️' });
            return;
          }
        }
        const reservations = state.data.reservations || [];
        const windowMs = 90 * 60 * 1000;
        const conflicts = reservations.some(res => {
          if (res.id === form.id) return false;
          if (['cancelled', 'completed', 'no-show'].includes(res.status)) return false;
          if (!res.tableIds?.some(id => form.tableIds.includes(id))) return false;
          return Math.abs((res.scheduledAt || 0) - (form.scheduledAt || Date.now())) < windowMs;
        });
        if (conflicts) {
          UI.pushToast(ctx, { title: t.toast.table_locked_other, message: t.ui.reservations_conflict, icon: '⚠️' });
          return;
        }
        const tableLocks = state.data.tableLocks || [];
        const lockConflict = tableLocks.some(lock => lock.active && form.tableIds.includes(lock.tableId) && lock.orderId && lock.orderId !== state.data.order?.id);
        if (lockConflict) {
          UI.pushToast(ctx, { title: t.toast.table_locked_other, message: t.ui.reservations_conflict_lock, icon: '⚠️' });
          return;
        }
        ctx.setState(s => {
          const reservations = s.data.reservations || [];
          const isEdit = !!form.id;
          const reservationId = form.id || `res-${Date.now().toString(36)}`;
          const payload = { id: reservationId, customerName: form.customerName, phone: form.phone, partySize: form.partySize, scheduledAt: form.scheduledAt || Date.now(), holdUntil: form.holdUntil || null, tableIds: form.tableIds.slice(), status: form.status || 'booked', note: form.note || '', createdAt: form.createdAt || Date.now() };
          const nextReservations = isEdit ? reservations.map(res => res.id === reservationId ? payload : res) : reservations.concat(payload);
          return {
            ...s,
            data: { ...(s.data || {}), reservations: nextReservations },
            ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), editing: null, form: null } }
          };
        });
        UI.pushToast(ctx, { title: form.id ? t.toast.reservation_updated : t.toast.reservation_created, icon: '📅' });
      }
    },
    'pos.reservations.edit': {
      on: ['click'],
      gkeys: ['pos:reservations:edit'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-reservation-id]');
        if (!btn) return;
        const resId = btn.getAttribute('data-reservation-id');
        const state = ctx.getState();
        const reservation = (state.data.reservations || []).find(res => res.id === resId);
        if (!reservation) return;
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), editing: resId, form: { ...reservation } } }
        }));
      }
    },
    'pos.reservations.convert': {
      on: ['click'],
      gkeys: ['pos:reservations:convert'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-reservation-id]');
        if (!btn) return;
        const resId = btn.getAttribute('data-reservation-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const reservation = (state.data.reservations || []).find(res => res.id === resId);
        if (!reservation) return;
        const totals = calculateTotals([], state.data.settings || {}, 'dine_in', { orderDiscount: null });
        const dineInConfig = getOrderTypeConfig('dine_in');
        const newId = await generateOrderId();
        const newOrder = {
          id: newId,
          status: 'open',
          fulfillmentStage: 'new',
          paymentState: 'unpaid',
          type: 'dine_in',
          tableIds: reservation.tableIds.slice(),
          guests: reservation.partySize,
          lines: [],
          notes: [],
          totals,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          allowAdditions: !!dineInConfig.allowsLineAdditions,
          lockLineEdits: false,
          isPersisted: false,
          dirty: false,
          shiftId: state.data.shift?.current?.id || null,
          posId: state.data.pos?.id || POS_INFO.id,
          posLabel: state.data.pos?.label || POS_INFO.label,
          posNumber: Number.isFinite(Number(state.data.pos?.number)) ? Number(state.data.pos.number) : POS_INFO.number
        };
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            ordersQueue: [newOrder, ...(s.data.ordersQueue || [])],
            reservations: (s.data.reservations || []).map(res => res.id === resId ? { ...res, status: 'seated' } : res),
            tableLocks: [...(s.data.tableLocks || []), ...reservation.tableIds.map(id => ({ id: `lock-${Date.now().toString(36)}-${id}`, tableId: id, orderId: newOrder.id, lockedBy: s.data.user?.id || 'pos-user', lockedAt: Date.now(), source: 'reservation-convert', active: true }))]
          }
        }));
        UI.pushToast(ctx, { title: t.toast.reservation_converted, icon: '🍽️' });
      }
    },
    'pos.reservations.noshow': {
      on: ['click'],
      gkeys: ['pos:reservations:noshow'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-reservation-id]');
        if (!btn) return;
        const resId = btn.getAttribute('data-reservation-id');
        const state = ctx.getState();
        const t = getTexts(state);
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), reservations: (s.data.reservations || []).map(res => res.id === resId ? { ...res, status: 'no-show' } : res) }
        }));
        UI.pushToast(ctx, { title: t.toast.reservation_no_show, icon: '⏰' });
      }
    },
    'pos.reservations.cancel': {
      on: ['click'],
      gkeys: ['pos:reservations:cancel'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-reservation-id]');
        if (!btn) return;
        const resId = btn.getAttribute('data-reservation-id');
        const state = ctx.getState();
        const t = getTexts(state);
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), reservations: (s.data.reservations || []).map(res => res.id === resId ? { ...res, status: 'cancelled' } : res) }
        }));
        UI.pushToast(ctx, { title: t.toast.reservation_cancelled, icon: '🚫' });
      }
    },
    'pos.orders.open': {
      on: ['click'],
      gkeys: ['pos:orders:open'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const defaultOrdersUi = { tab: 'all', search: '', sort: { field: 'updatedAt', direction: 'desc' } };
        if (realtimeOrders.ready) {
          const snapshot = getRealtimeOrdersSnapshot();
          ctx.setState(s => ({
            ...s,
            data: { ...(s.data || {}), ordersQueue: snapshot.active.map(order => ({ ...order })) },
            ui: { ...(s.ui || {}), orders: defaultOrdersUi, modals: { ...(s.ui?.modals || {}), orders: true } }
          }));
          UI.pushToast(ctx, { title: t.toast.orders_loaded, icon: '📥' });
          return;
        }
        UI.pushToast(ctx, { title: t.toast.orders_failed, icon: '🛑' });
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), orders: defaultOrdersUi, modals: { ...(s.ui?.modals || {}), orders: true } }
        }));
      }
    },
    'pos.orders.toggle': {
      on: ['click'],
      gkeys: ['pos:orders:toggle'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), orders: false } }
        }));
      }
    },
    'pos.orders.tab': {
      on: ['click'],
      gkeys: ['pos:orders:tab'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-tab-id]');
        if (!btn) return;
        const tabId = btn.getAttribute('data-tab-id');
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), orders: { ...(s.ui?.orders || {}), tab: tabId }, modals: { ...(s.ui?.modals || {}), orders: true } }
        }));
      }
    },
    'pos.orders.search': {
      on: ['input'],
      gkeys: ['pos:orders:search'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), orders: { ...(s.ui?.orders || {}), search: value }, modals: { ...(s.ui?.modals || {}), orders: true } }
        }));
      }
    },
    'pos.orders.sort': {
      on: ['click'],
      gkeys: ['pos:orders:sort'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-sort-field]');
        if (!btn) return;
        const field = btn.getAttribute('data-sort-field') || 'updatedAt';
        ctx.setState(s => {
          const current = (s.ui?.orders?.sort) || { field: 'updatedAt', direction: 'desc' };
          const direction = current.field === field && current.direction === 'desc' ? 'asc' : 'desc';
          return {
            ...s,
            ui: { ...(s.ui || {}), orders: { ...(s.ui?.orders || {}), sort: { field, direction } }, modals: { ...(s.ui?.modals || {}), orders: true } }
          };
        });
      }
    },
    'pos.orders.refresh': {
      on: ['click'],
      gkeys: ['pos:orders:refresh'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        if (!realtimeOrders.ready) {
          UI.pushToast(ctx, { title: t.toast.orders_failed, icon: '🛑' });
          return;
        }
        const snapshot = getRealtimeOrdersSnapshot();
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), ordersQueue: snapshot.active.map(order => ({ ...order })) }
        }));
        UI.pushToast(ctx, { title: t.toast.orders_loaded, icon: '📥' });
      }
    },
    'pos.orders.viewJobs': {
      on: ['click'],
      gkeys: ['pos:orders:view-jobs'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-order-id]');
        if (!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if (!orderId) return;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), jobStatus: true },
            jobStatus: { orderId }
          }
        }));
      }
    },
    'pos.orders.open-order': {
      on: ['click'],
      gkeys: ['pos:orders:open-order'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-order-id]');
        if (!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        const state = ctx.getState();
        const t = getTexts(state);
        let order = null;

        //console.log('🔍 [open-order HANDLER] Clicked - fetching order:', orderId);

        if (posDB.available) {
          try {
            order = await posDB.getOrder(orderId);
            //console.log('🔍 [open-order HANDLER] Order fetched from API:', {
            //  id: order?.id,
            //  type: order?.type,
            //  tableIds: order?.tableIds,
            //  tableId: order?.tableId,
            //  customerId: order?.customerId,
            //  customerName: order?.customerName,
            //  linesCount: order?.lines?.length,
            //  totals: order?.totals,
            //  payments: order?.payments?.length || 0
            //});
          } catch (error) {
            console.error('❌ [open-order HANDLER] Failed to fetch order:', error);
            UI.pushToast(ctx, { title: t.toast.orders_failed, message: String(error), icon: '🛑' });
          }
        }
        if (!order) {
          order = [state.data.order, ...(state.data.ordersQueue || [])].find(ord => ord && ord.id === orderId);
          //console.log('🔍 [open-order HANDLER] Order found in local state:', {
          //  found: !!order,
          //  type: order?.type,
          //  orderType: order?.orderType,
          //  order_type: order?.order_type,
          //  tableIds: order?.tableIds,
          //  isPersisted: order?.isPersisted
          //});
        }
        if (!order) {
          console.error('❌ [open-order HANDLER] Order not found!');
          return;
        }
        //console.log('🔍 [open-order HANDLER] FINAL order before activateOrder:', {
        //  id: order.id,
        //  type: order.type,
        //  orderType: order.orderType,
        //  order_type: order.order_type,
        //  tableIds: order.tableIds,
        //  isPersisted: order.isPersisted
        //});
        activateOrder(ctx, order, { closeOrdersModal: true, resetOrderNavValue: true });
      }
    },
    'pos.tables.open': {
      on: ['click'],
      gkeys: ['pos:tables:open'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const orderType = state?.data?.order?.type;
        if (orderType !== 'dine_in') {
          UI.pushToast(ctx, { title: t.toast.table_type_required, icon: 'ℹ️' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            tables: { view: 'assign', filter: 'all', search: '', details: null },
            modals: { ...(s.ui?.modals || {}), tables: true }
          }
        }));
      }
    },
    'pos.tables.view': {
      on: ['click'],
      gkeys: ['pos:tables:view'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-tables-view]');
        if (!btn) return;
        const view = btn.getAttribute('data-tables-view') || 'assign';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), tables: { ...(s.ui?.tables || {}), view } }
        }));
      }
    },
    'pos.tables.filter': {
      on: ['click'],
      gkeys: ['pos:tables:filter'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-tables-filter]');
        if (!btn) return;
        const filter = btn.getAttribute('data-tables-filter') || 'all';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), tables: { ...(s.ui?.tables || {}), filter } }
        }));
      }
    },
    'pos.tables.search': {
      on: ['input', 'change'],
      gkeys: ['pos:tables:search'],
      handler: (e, ctx) => {
        const value = e.target.value || '';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), tables: { ...(s.ui?.tables || {}), search: value } }
        }));
      }
    },
    'pos.tables.details': {
      on: ['click'],
      gkeys: ['pos:tables:details'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), tables: { ...(s.ui?.tables || {}), details: tableId } }
        }));
      }
    },
    'pos.tables.details-close': {
      on: ['click'],
      gkeys: ['pos:tables:details-close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), tables: { ...(s.ui?.tables || {}), details: null } }
        }));
      }
    },
    'pos.tables.card.tap': {
      on: ['click'],
      gkeys: ['pos:tables:card:tap'],
      handler: (e, ctx) => {
        if (e.target.closest('[data-prevent-select="true"]')) return;
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const runtimeTables = computeTableRuntime(state);
        const runtime = runtimeTables.find(tbl => tbl.id === tableId);
        if (!runtime) return;
        if (runtime.state === 'maintenance') {
          UI.pushToast(ctx, { title: t.toast.table_locked_other, message: t.ui.table_status_maintenance, icon: '🛠️' });
          return;
        }
        if (runtime.state === 'disactive') {
          UI.pushToast(ctx, { title: t.toast.table_inactive_assign, icon: '🚫' });
          return;
        }
        const order = state.data.order || {};
        if (order.type !== 'dine_in') {
          UI.pushToast(ctx, { title: t.toast.table_assigned, message: t.ui.service_type, icon: 'ℹ️' });
          return;
        }
        const currentTables = new Set(order.tableIds || []);
        const isAssigned = currentTables.has(tableId);
        if (isAssigned) {
          if (!window.confirm(t.ui.table_confirm_release)) return;
          ctx.setState(s => {
            const data = s.data || {};
            const currentIds = (data.order?.tableIds || []).filter(id => id !== tableId);
            const guests = computeGuestsForTables(currentIds, data.tables || []);
            return {
              ...s,
              data: {
                ...data,
                tableLocks: (data.tableLocks || []).map(lock => lock.tableId === tableId && lock.orderId === order.id ? { ...lock, active: false } : lock),
                order: { ...(data.order || {}), tableIds: currentIds, guests, updatedAt: Date.now() }
              }
            };
          });
          UI.pushToast(ctx, { title: t.toast.table_unlocked, icon: '🔓' });
          return;
        }
        if (runtime.lockState !== 'free' && !runtime.isCurrentOrder) {
          if (!window.confirm(t.toast.table_locked_other)) return;
        }
        if (currentTables.size && !window.confirm(t.ui.table_multi_orders)) return;
        ctx.setState(s => {
          const data = s.data || {};
          const nextIds = Array.from(new Set([...(data.order?.tableIds || []), tableId]));
          const guests = computeGuestsForTables(nextIds, data.tables || []);
          return {
            ...s,
            data: {
              ...data,
              tableLocks: [...(data.tableLocks || []), { id: `lock-${Date.now().toString(36)}`, tableId, orderId: order.id, lockedBy: data.user?.id || 'pos-user', lockedAt: Date.now(), source: 'pos', active: true }],
              order: { ...(data.order || {}), tableIds: nextIds, guests, updatedAt: Date.now() }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.table_locked_now, icon: '🔒' });
      }
    },
    'pos.tables.unlock-order': {
      on: ['click'],
      gkeys: ['pos:tables:unlock-order'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const orderId = btn.getAttribute('data-order-id');
        const state = ctx.getState();
        const t = getTexts(state);
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tableLocks: (s.data.tableLocks || []).map(lock => lock.tableId === tableId && lock.orderId === orderId ? { ...lock, active: false } : lock)
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_unlock_partial, icon: '🔓' });
      }
    },
    'pos.tables.unlock-all': {
      on: ['click'],
      gkeys: ['pos:tables:unlock-all'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tableLocks: (s.data.tableLocks || []).map(lock => lock.tableId === tableId ? { ...lock, active: false } : lock)
          }
        }));
      }
    },
    'pos.tables.add': {
      on: ['click'],
      gkeys: ['pos:tables:add'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const nextIndex = (state.data.tables || []).length + 1;
        const defaultName = `${t.ui.tables} ${nextIndex}`;
        const name = window.prompt(t.ui.table_add, defaultName);
        if (!name) {
          UI.pushToast(ctx, { title: t.toast.table_name_required, icon: '⚠️' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tables: [...(s.data.tables || []), { id: `T${Date.now().toString(36)}`, name, capacity: 4, zone: '', state: 'active', displayOrder: nextIndex, note: '' }]
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_added, icon: '➕' });
      }
    },
    'pos.tables.rename': {
      on: ['click'],
      gkeys: ['pos:tables:rename'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const table = (state.data.tables || []).find(tbl => tbl.id === tableId);
        if (!table) return;
        const nextName = window.prompt(t.ui.table_rename, table.name || table.id);
        if (!nextName) {
          UI.pushToast(ctx, { title: t.toast.table_name_required, icon: '⚠️' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tables: (s.data.tables || []).map(tbl => tbl.id === tableId ? { ...tbl, name: nextName } : tbl),
            auditTrail: [...(s.data.auditTrail || []), { id: `audit-${Date.now().toString(36)}`, userId: s.data.user?.id || 'pos-user', action: 'table.rename', refType: 'table', refId: tableId, at: Date.now(), meta: { name: nextName } }]
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_updated, icon: '✏️' });
      }
    },
    'pos.tables.capacity': {
      on: ['click'],
      gkeys: ['pos:tables:capacity'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const table = (state.data.tables || []).find(tbl => tbl.id === tableId);
        if (!table) return;
        const input = window.prompt(t.ui.tables_capacity, String(table.capacity || 4));
        if (input == null) return;
        const capacity = parseInt(input, 10);
        if (!Number.isFinite(capacity) || capacity <= 0) {
          UI.pushToast(ctx, { title: t.toast.table_invalid_seats, icon: '⚠️' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tables: (s.data.tables || []).map(tbl => tbl.id === tableId ? { ...tbl, capacity } : tbl)
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_updated, icon: '👥' });
      }
    },
    'pos.tables.zone': {
      on: ['click'],
      gkeys: ['pos:tables:zone'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const table = (state.data.tables || []).find(tbl => tbl.id === tableId);
        if (!table) return;
        const zone = window.prompt('Zone', table.zone || '');
        if (zone == null) return;
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tables: (s.data.tables || []).map(tbl => tbl.id === tableId ? { ...tbl, zone } : tbl)
          }
        }));
      }
    },
    'pos.tables.state': {
      on: ['click'],
      gkeys: ['pos:tables:state'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const orderLocks = (state.data.tableLocks || []).filter(lock => lock.tableId === tableId && lock.active);
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tables: (s.data.tables || []).map(tbl => {
              if (tbl.id !== tableId) return tbl;
              const cycle = ['active', 'maintenance', 'disactive'];
              const currentIndex = cycle.indexOf(tbl.state || 'active');
              const nextState = cycle[(currentIndex + 1) % cycle.length];
              if (nextState !== 'active' && orderLocks.length) {
                return tbl;
              }
              return { ...tbl, state: nextState };
            })
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_state_updated, icon: '♻️' });
      }
    },
    'pos.tables.remove': {
      on: ['click'],
      gkeys: ['pos:tables:remove'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-table-id]');
        if (!btn) return;
        const tableId = btn.getAttribute('data-table-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const locks = (state.data.tableLocks || []).filter(lock => lock.tableId === tableId && lock.active);
        if (locks.length) {
          UI.pushToast(ctx, { title: t.toast.table_has_sessions, icon: '⚠️' });
          return;
        }
        if (!window.confirm(t.ui.table_confirm_remove)) return;
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            tables: (s.data.tables || []).filter(tbl => tbl.id !== tableId)
          }
        }));
        UI.pushToast(ctx, { title: t.toast.table_removed, icon: '🗑️' });
      }
    },
    'pos.tables.bulk': {
      on: ['click'],
      gkeys: ['pos:tables:bulk'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-bulk-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-bulk-action');
        ctx.setState(s => {
          const tables = (s.data.tables || []).map(tbl => {
            if (action === 'activate') return { ...tbl, state: 'active' };
            if (action === 'maintenance') return { ...tbl, state: 'maintenance' };
            return tbl;
          });
          return { ...s, data: { ...(s.data || {}), tables } };
        });
      }
    },
    'ui.numpad.decimal.key': {
      on: ['click'],
      gkeys: ['ui:numpad:decimal:key'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-numpad-key]');
        if (!btn || btn.disabled) return;
        const key = btn.getAttribute('data-numpad-key');
        if (!key) return;
        const container = btn.closest('[data-numpad-root]');
        if (!container) return;
        if (key === '.' && container.hasAttribute('data-numpad-no-decimal')) return;
        const input = container.querySelector('[data-numpad-input]');
        if (!input) return;
        let value = input.value || '';
        if (key === '.' && value.includes('.')) return;
        if (value === '' && key === '.') value = '0.';
        else if (value === '0' && key !== '.') value = key;
        else value = `${value}${key}`;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    'ui.numpad.decimal.clear': {
      on: ['click'],
      gkeys: ['ui:numpad:decimal:clear'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-numpad-clear]');
        if (!btn) return;
        const container = btn.closest('[data-numpad-root]');
        if (!container) return;
        const input = container.querySelector('[data-numpad-input]');
        if (!input) return;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    'ui.numpad.decimal.backspace': {
      on: ['click'],
      gkeys: ['ui:numpad:decimal:backspace'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-numpad-backspace]');
        if (!btn) return;
        const container = btn.closest('[data-numpad-root]');
        if (!container) return;
        const input = container.querySelector('[data-numpad-input]');
        if (!input) return;
        const value = input.value || '';
        input.value = value.length ? value.slice(0, -1) : '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    'ui.numpad.decimal.confirm': {
      on: ['click'],
      gkeys: ['ui:numpad:decimal:confirm'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-numpad-confirm]');
        if (!btn) return;
        const container = btn.closest('[data-numpad-root]');
        if (!container) return;
        const input = container.querySelector('[data-numpad-input]');
        if (input) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    },
    'pos.payments.open': {
      on: ['click'],
      gkeys: ['pos:payments:open'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), payments: true },
            paymentDraft: { amount: '', method: s.data.payments?.activeMethod || 'cash' }
          }
        }));
      }
    },
    'pos.payments.close': {
      on: ['click'],
      gkeys: ['pos:payments:close', 'ui:drawer:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), payments: false } }
        }));
      }
    },
    'pos.payments.method': {
      on: ['click'],
      gkeys: ['pos:payments:method'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-method-id]');
        if (!btn) return;
        const method = btn.getAttribute('data-method-id');
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), payments: { ...(s.data.payments || {}), activeMethod: method } },
          ui: { ...(s.ui || {}), paymentDraft: { ...(s.ui?.paymentDraft || {}), method } }
        }));
      }
    },
    'pos.payments.amount': {
      on: ['input', 'change'],
      gkeys: ['pos:payments:amount'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), paymentDraft: { ...(s.ui?.paymentDraft || {}), amount: value } }
        }));
      }
    },
    'pos.payments.capture': {
      on: ['click'],
      gkeys: ['pos:payments:capture'],
      handler: async (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const amount = parseFloat(state.ui?.paymentDraft?.amount);
        if (!amount || amount <= 0) {
          UI.pushToast(ctx, { title: t.toast.amount_required, icon: '⚠️' });
          return;
        }
        const order = state.data.order || {};
        if (isPaymentsLocked(order)) {
          UI.pushToast(ctx, { title: t.toast.payment_locked || 'لا يمكن حذف الدفعة بعد إنهاء الطلب', icon: '🔒' });
          return;
        }
        const totals = order.totals || {};
        const currentSplit = state.data.payments?.split || [];
        const currentPaid = currentSplit.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        const totalDue = Math.max(0, Number(totals.due) || 0);
        const maxAllowed = totalDue > 0 ? Math.ceil(totalDue / 100) * 100 : 0;
        const projectedPaid = round(currentPaid + amount);
        const exceedsLimit = totalDue === 0 ? amount > 0 : projectedPaid > maxAllowed + 0.0001;
        if (exceedsLimit) {
          const message = (t.toast.payment_exceeds_limit || 'المبلغ المدفوع أكبر من المسموح. الحد الأقصى: %max%').replace('%max%', String(round(maxAllowed)));
          UI.pushToast(ctx, { title: message, icon: '⚠️' });
          return;
        }
        const method = state.data.payments.activeMethod || 'cash';
        const pending = state.ui?.pendingAction;
        let finalizeMode = null;
        let shouldFinalize = false;
        ctx.setState(s => {
          const data = s.data || {};
          const nextSplit = (data.payments?.split || []).concat([{ id: `pm-${Date.now()}`, method, amount: round(amount) }]);
          const order = data.order || {};
          const totals = order.totals || {};
          const paymentSnapshot = summarizePayments(totals, nextSplit);
          if (pending && pending.orderId === order.id && paymentSnapshot.remaining <= 0) {
            shouldFinalize = true;
            finalizeMode = pending.mode || 'finalize';
          }
          return {
            ...s,
            data: {
              ...data,
              payments: {
                ...(data.payments || {}),
                split: nextSplit
              },
              order: {
                ...order,
                paymentState: paymentSnapshot.state,
                dirty: true  // ✅ Mark order as dirty when payment is added
              }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), payments: false },
              paymentDraft: { amount: '', method },
              pendingAction: (pending && pending.orderId === order.id && paymentSnapshot.remaining <= 0) ? null : pending
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.payment_recorded, icon: '💰' });
        if (shouldFinalize && finalizeMode) {

          await persistOrderFlow(ctx, finalizeMode, { skipPaymentCheck: true });
        }
      }
    },
    'pos.payments.delete': {
      on: ['click'],
      gkeys: ['pos:payments:delete'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-payment-id]');
        if (!btn) return;
        const paymentId = btn.getAttribute('data-payment-id');
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        if (isPaymentsLocked(order)) {
          UI.pushToast(ctx, { title: t.toast.payment_locked || 'لا يمكن حذف الدفعة بعد إنهاء الطلب', icon: '🔒' });
          return;
        }
        ctx.setState(s => {
          const data = s.data || {};
          const currentSplit = Array.isArray(data.payments?.split) ? data.payments.split : [];
          const nextSplit = currentSplit.filter(pay => pay.id !== paymentId);
          const order = data.order || {};
          const totals = order.totals || {};
          const paymentSnapshot = summarizePayments(totals, nextSplit);
          return {
            ...s,
            data: {
              ...data,
              payments: {
                ...(data.payments || {}),
                split: nextSplit
              },
              order: {
                ...order,
                paymentState: paymentSnapshot.state
              }
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.payment_deleted || 'تم حذف الدفعة', icon: '🗑️' });
      }
    },
    'pos.payments.split': {
      on: ['click'],
      gkeys: ['pos:payments:split'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), payments: true } }
        }));
      }
    },
    'pos.indexeddb.sync': {
      on: ['click'],
      gkeys: ['pos:indexeddb:sync'],
      handler: async (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        if (!posDB.available) {
          UI.pushToast(ctx, { title: t.toast.indexeddb_missing, icon: '⚠️' });
          return;
        }
        try {
          UI.pushToast(ctx, { title: t.toast.indexeddb_syncing, icon: '🔄' });
          await posDB.markSync();
          const snapshot = getRealtimeOrdersSnapshot();
          const totalOrders = snapshot.orders.length;
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, indexeddb: { state: 'online', lastSync: Date.now() } },
              reports: { ...(s.data.reports || {}), ordersCount: totalOrders }
            }
          }));
          UI.pushToast(ctx, { title: t.toast.sync_complete, icon: '✅' });
        } catch (error) {
          UI.pushToast(ctx, { title: t.toast.indexeddb_error, message: String(error), icon: '🛑' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, indexeddb: { state: 'offline', lastSync: s.data.status?.indexeddb?.lastSync || null } }
            }
          }));
        }
      }
    },
    'pos.kds.connect': {
      on: ['click'],
      gkeys: ['pos:kds:connect'],
      handler: (e, ctx) => {
        kdsBridge.connect(ctx);
      }
    },
    'pos.theme.toggle': {
      on: ['click'],
      gkeys: ['pos:theme:toggle'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-theme]');
        if (!btn) return;
        const theme = btn.getAttribute('data-theme');
        ctx.setState(s => ({
          ...s,
          env: { ...(s.env || {}), theme },
          ui: { ...(s.ui || {}), settings: { ...(s.ui?.settings || {}), activeTheme: theme } }
        }));
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.theme_switched, icon: theme === 'dark' ? '🌙' : '☀️' });
      }
    },
    'pos.lang.switch': {
      on: ['click'],
      gkeys: ['pos:lang:switch'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-lang]');
        if (!btn) return;
        const lang = btn.getAttribute('data-lang');
        ctx.setState(s => ({
          ...s,
          env: { ...(s.env || {}), lang, dir: lang === 'ar' ? 'rtl' : 'ltr' }
        }));
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.lang_switched, icon: '🌐' });
      }
    },
    'pos.session.logout': {
      on: ['click'],
      gkeys: ['pos:session:logout'],
      handler: (e, ctx) => {
        const t = getTexts(ctx.getState());
        UI.pushToast(ctx, { title: t.toast.logout_stub, icon: '👋' });
      }
    }
  };

  app.setOrders(Object.assign({}, UI.orders, auto.orders, posOrders));
  app.mount('#app');
  await refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
})();