
(async function () {
  //console.log = function () { }
  const M = Mishkah;
  const UI = M.UI;
  const U = M.utils;
  const D = M.DSL;
  const Schema = M.schema;

  // Polyfill generic Checkbox if missing
  if (!UI.Checkbox) {
    UI.Checkbox = (props) => {
      const { checked, gkey, children, ...rest } = props || {};
      const input = D.Inputs.Input({
        attrs: {
          type: 'checkbox',
          checked: checked ? 'checked' : undefined,
          gkey: gkey,
          class: tw`form-checkbox h-5 w-5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer`,
          ...rest
        }
      });
      if (children) return D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [input, ...[].concat(children)]);
      return input;
    };
  }
  const MODULE_ENTRY = (typeof window !== 'undefined'
    && window.__POS_MODULE_ENTRY__
    && typeof window.__POS_MODULE_ENTRY__ === 'object')
    ? window.__POS_MODULE_ENTRY__
    : null;

  // Initialize POS_CONFIG globally for dynamic modules (like schedule-module.js)
  // strict mode: do not fallback to defaults if globals are missing.
  if (typeof window !== 'undefined') {
    window.POS_CONFIG = window.POS_CONFIG || {};
    window.POS_CONFIG.branchId = window.POS_CONFIG.branchId || window.__POS_BRANCH_ID__ || (MODULE_ENTRY && MODULE_ENTRY.branchId) || localStorage.getItem('pos_branch_id') || 'dar';
    window.POS_CONFIG.moduleId = window.POS_CONFIG.moduleId || window.__POS_MODULE_ID__ || (MODULE_ENTRY && MODULE_ENTRY.id) || localStorage.getItem('pos_module_id') || 'pos';
  }
  const { tw, token } = U.twcss;
  const BASE_PALETTE = U.twcss?.PALETTE || {};

  // SINGLE SOURCE OF TRUTH FOR COMPANY NAME
  const getCompanyName = () => {
    if (typeof window === 'undefined' || !window.localStorage || !window.localStorage.mishkah_user) return 'Mishkah POS';
    try {
      const u = JSON.parse(window.localStorage.mishkah_user);
      if (u.compName) return u.compName;
      // Fallback logic
      const br = String(u.brname || '').toLowerCase();
      if (br === 'remal') return 'G-Remal Hotel';
      if (br === 'dar') return 'قرية درويش للمندي';
      return 'Mishkah POS';
    } catch (e) { return 'Mishkah POS'; }
  };
  const COMPANY_NAME = getCompanyName();

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
    return JSON.parse(JSON.stringify(value));
  };

  /**
   * Shared handler for saving scheduled orders
   * Used by both quick-save (when in reservation mode) and dedicated schedule save button
   */
  const handleScheduleSave = async (e, ctx) => {
    try {
      const state = ctx.getState();
      const order = state.data.order || {};
      const { scheduledAt, duration } = state.ui.reservation || {};

      // 1. Validation
      if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
        console.error('[POS] Invalid schedule time');
        UI.pushToast(ctx, { title: 'Invalid Time', message: 'Reservation time must be in the future', icon: '⚠️' });
        return;
      }

      if (!order?.customerId) {
        console.error('[POS] Customer required');
        UI.pushToast(ctx, { title: 'Customer Required', message: 'Please select a customer to reserve', icon: '👤' });
        return;
      }

      if (!order?.lines || order.lines.length === 0) {
        console.error('[POS] Empty order');
        UI.pushToast(ctx, { title: 'Empty Order', message: 'Cannot save empty order', icon: '⚠️' });
        return;
      }

      // 2. Prepare payload for backend
      // Get branch ID dynamics
      const branchId = state.data.branch?.id || window.__POS_BRANCH_ID__ || 'default';
      const moduleId = state.data.module?.id || 'pos';

      // Safe payment extraction
      const getPayments = (order, allPayments) => {
        if (typeof getActivePaymentEntries === 'function') {
          return getActivePaymentEntries(order, allPayments);
        }
        // Fallback if function not hoisted/available
        const entries = [];
        const rawMap = order.payments || {};
        Object.entries(rawMap).forEach(([methodId, amount]) => {
          if (amount > 0) entries.push({ methodId, amount });
        });
        return entries;
      };

      const paymentEntries = getPayments(order, state.data.payments);

      // Extract shift ID from active shift
      const activeShift = state.data.shift;
      const shiftId = activeShift?.id || null;

      const payload = {
        customerId: order.customerId,
        customerAddressId: order.customerAddressId || null,
        shiftId: shiftId,
        orderType: order.type || 'dine_in',
        scheduledAt: new Date(scheduledAt).toISOString(),
        duration: duration || 60,
        tableIds: order.tableIds || [],
        lines: order.lines.map(line => ({
          itemId: line.itemId || line.id,
          name: line.name,
          qty: line.qty || line.quantity,
          price: line.unitPrice || line.price,
          notes: line.notes || ''
        })),
        totals: order.totals || {},
        discount: order.discount || null,
        payments: paymentEntries.map(p => ({
          methodId: p.method_id || p.methodId || p.id,
          amount: p.amount
        })),
        notes: (order.notes || []).map(n => n.message).join(' • ')
      };

      // Client-side Validation
      if ((order.type || payload.orderType) === 'dine_in' && (!payload.tableIds || payload.tableIds.length === 0)) {
        const t = getTexts(state);
        UI.pushToast(ctx, {
          title: t.toast.validation_error || 'Validation Error',
          message: t.pos?.reservations?.tables_required || 'يجب اختيار الطاولة لنوع الطلب محلي (Tables required for dine_in)',
          icon: '⚠️'
        });
        ctx.setState(s => ({ ...s, ui: { ...s.ui, saving: false } }));
        return;
      }

      // 3. Call backend API
      // ✅ FIX: Check if this is an UPDATE (existing schedule) or CREATE (new schedule)
      const rawScheduleId = order.id;
      const canUpdate = rawScheduleId && !String(rawScheduleId).startsWith('draft-') && order.isPersisted;
      const method = canUpdate ? 'PUT' : 'POST';
      const url = canUpdate
        ? `/api/branches/${branchId}/modules/${moduleId}/schedule/${rawScheduleId}`
        : `/api/branches/${branchId}/modules/${moduleId}/schedule`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save schedule');
      }

      // 4. Success handling
      const t = getTexts(state);
      UI.pushToast(ctx, {
        title: t.pos?.reservations?.saved_title || 'Schedule Saved',
        message: t.pos?.reservations?.saved_message || `Reservation confirmed for ${order.customerName || 'Customer'}`,
        icon: '✅'
      });

      // Reset state and CLOSE MODAL
      ctx.setState(s => ({
        ...s,
        ui: {
          ...s.ui,
          reservation: {
            ...s.ui.reservation, // keep config
            enabled: false,      // Close reservation mode/modal
            scheduledAt: null
          },
          modals: {
            ...s.ui.modals,
            reservation: false // Ensure explicit modal close if applicable
          },
          saving: false
        },
        data: {
          ...s.data,
          order: { ...s.data.order, lines: [], payments: [], totals: {}, discount: null }, // Clear order
          payments: null
        }
      }));

      // Refresh schedules if module is loaded
      if (window.ScheduleModule && typeof window.ScheduleModule.openReservationsModal === 'function') {
        // Optionally re-open the list to show the new reservation, or just refresh in background
        // window.ScheduleModule.openReservationsModal(); 
      }
      if (window.ScheduleModule?.refreshSchedulesList) {
        window.ScheduleModule.refreshSchedulesList();
      }

    } catch (err) {
      console.error('[POS] Reservation Save Failed', err);
      // Translate known errors
      let msg = String(err.message || err);
      const t = getTexts(ctx.getState());

      if (msg.includes('Tables required')) {
        msg = t.pos?.reservations?.tables_required || 'يجب اختيار الطاولة (Tables required)';
      }

      UI.pushToast(ctx, { title: t.toast?.save_failed || 'Save Failed', message: msg, icon: '🛑' });

      // Ensure saving spinner stops
      ctx.setState(s => ({ ...s, ui: { ...s.ui, saving: false } }));
    }
  };

  // [Legacy KDS Bridge removed to prevent duplicate declaration]

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
    orderHeader: {
      canonical: 'order_header',
      aliases: []
    },
    orderLine: {
      canonical: 'order_line',
      aliases: []
    },
    orderPayment: {
      canonical: 'order_payment',
      aliases: []
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
    posShift: { canonical: 'pos_shift', aliases: ['shifts', 'shift_header', 'shiftHeaders'] },
    jobOrderHeader: {
      canonical: 'job_order_header',
      aliases: []
    },
    jobOrderDetail: {
      canonical: 'job_order_detail',
      aliases: []
    },
    jobOrderDetailModifier: {
      canonical: 'job_order_detail_modifier',
      aliases: []
    },
    jobOrderStatusHistory: {
      canonical: 'job_order_status_history',
      aliases: []
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
  const EMPLOYEE_KEYS = ['sys_users', 'users', 'employees', 'staff', 'pos_employees', 'pos_staff', 'employee_profiles', 'employee_profile', 'employeeProfile', 'employees_list', 'employeesList', 'cashiers'];
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
  if (typeof window !== 'undefined' && window.__POS_SESSION__ && window.__POS_SESSION__.userId) {
    if (!MOCK_BASE.user) MOCK_BASE.user = {};
    const s = window.__POS_SESSION__;
    MOCK_BASE.user.id = s.userId;
    MOCK_BASE.user.name = s.userName || s.userEmail || 'User';
    MOCK_BASE.user.role = 'cashier';
    MOCK_BASE.user.email = s.userEmail;
    MOCK_BASE.user.allowedDiscountRate = s.allowedDiscountRate || 0;
  }
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
  let POS_SCHEMA_SOURCE = { tables: [] };
  let POS_SCHEMA_REGISTRY = new Schema.Registry({ tables: [] });
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
  const DEFAULT_BRANCH_CHANNEL = 'branch-main';
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
  const DEFAULT_FALLBACK_PIN = '1122';
  const SHIFT_PIN_FALLBACK_RAW = typeof SHIFT_SETTINGS.pin === 'string' && SHIFT_SETTINGS.pin.trim()
    ? SHIFT_SETTINGS.pin
    : (typeof SHIFT_SETTINGS.default_pin === 'string' && SHIFT_SETTINGS.default_pin.trim()
      ? SHIFT_SETTINGS.default_pin
      : DEFAULT_FALLBACK_PIN);
  const SHIFT_PIN_FALLBACK = normalizePinValue(SHIFT_PIN_FALLBACK_RAW);
  let SHIFT_PIN_LENGTH = Number(SHIFT_SETTINGS.pin_length || SHIFT_SETTINGS.pinLength || (SHIFT_PIN_FALLBACK ? SHIFT_PIN_FALLBACK.length : 0)) || (SHIFT_PIN_FALLBACK ? SHIFT_PIN_FALLBACK.length : 4);
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
        total_before_vat: 'المبلغ قبل الضريبة', vat_14: 'ضريبة 14%', vat_included_note: 'جميع الأسعار شاملة 14% ضريبة',
        cart_empty: 'لم يتم إضافة أصناف بعد', choose_items: 'اختر صنفًا من القائمة لإضافته إلى الطلب.', tables: 'الطاولات',
        select_table: 'اختر طاولة لإسناد الطلب', table_status: 'حالة الطاولة', table_available: 'متاحة', table_occupied: 'مشغولة',
        table_reserved: 'محجوزة', table_maintenance: 'صيانة', payments: 'المدفوعات', split_payments: 'تقسيم الدفعات', recorded_payments: 'الدفعات المسجلة', paid: 'المدفوع',
        remaining: 'المتبقي', open_payments: 'تسجيل دفعة', open_reports: 'فتح التقارير', reports: 'التقارير', orders_count: 'عدد الطلبات',
        shift_open: 'فتح وردية', shift_close: 'إغلاق الوردية', shift_summary: 'ملخص الوردية', shift_open_prompt: 'أدخل الرقم السري لفتح الوردية',
        shift_cash_start: 'رصيد أول المدة', shift_cash_end: 'رصيد آخر المدة', shift_total_sales: 'إجمالي المبيعات',
        shift_total_dine_in: 'إجمالي طلبات الصالة', shift_total_takeaway: 'إجمالي طلبات التيك أواي', shift_total_delivery: 'إجمالي طلبات التوصيل',
        shift_payments: 'تحصيلات الوردية', shift_history: 'سجل الورديات', shift_history_empty: 'لا يوجد سجل ورديات بعد',
        shift_close_confirm: 'إنهاء وإغلاق الوردية', shift_close_title: 'تأكيد إغلاق الوردية', shift_close_warning: 'سيتم إغلاق الوردية ولا يمكن التراجع. يرجى مراجعة التقرير قبل المتابعة.',
        shift_print_report: 'طباعة تقرير الوردية', shift_report_title: 'تقرير الوردية',
        shift_current: 'الوردية الحالية', shift_select_history: 'اختيار وردية سابقة',
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
        total_before_vat: 'Total before VAT', vat_14: 'VAT 14%', vat_included_note: 'All prices include 14% VAT',
        cart_empty: 'No items added yet', choose_items: 'Pick an item from the menu to start the order.', tables: 'Tables',
        select_table: 'Select a table for this order', table_status: 'Table status', table_available: 'Available', table_occupied: 'Occupied',
        table_reserved: 'Reserved', table_maintenance: 'Maintenance', payments: 'Payments', split_payments: 'Split payments', recorded_payments: 'Recorded payments', paid: 'Paid',
        remaining: 'Remaining', open_payments: 'Add payment', open_reports: 'Open reports', reports: 'Reports', orders_count: 'Orders',
        shift_open: 'Open shift', shift_close: 'Close shift', shift_summary: 'Shift summary', shift_open_prompt: 'Enter the PIN to open the shift',
        shift_cash_start: 'Opening cash', shift_cash_end: 'Closing cash', shift_total_sales: 'Total sales',
        shift_total_dine_in: 'Dine-in total', shift_total_takeaway: 'Takeaway total', shift_total_delivery: 'Delivery total',
        shift_payments: 'Shift payments', shift_history: 'Shift history', shift_history_empty: 'No shift history yet',
        shift_close_confirm: 'Finish and close shift', shift_close_title: 'Confirm closing shift', shift_close_warning: 'The shift will be closed and cannot be reopened. Review the report before proceeding.',
        shift_print_report: 'Print shift report', shift_report_title: 'Shift report',
        shift_current: 'Active shift', shift_select_history: 'Select a previous shift',
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
    const safeDb = db || {};
    const lang = safeDb.env?.lang || 'ar';
    const staticTexts = TEXTS[lang] || TEXTS.ar;

    // Dynamic overlay from database
    const dynamicTexts = {};
    const uiTexts = safeDb.ui_texts || {};

    // Check if ui_texts is array (Mishkah Store) or object
    if (Array.isArray(uiTexts)) {
      uiTexts.forEach(entry => {
        if (entry.key && entry.text) {
          dynamicTexts[entry.key] = localize(entry.text, lang);
        }
      });
    } else if (typeof uiTexts === 'object') {
      // Support object format if processed
      Object.entries(uiTexts).forEach(([key, val]) => {
        dynamicTexts[key] = typeof val === 'object' ? localize(val, lang) : val;
      });
    }

    // Deep merge or shallow merge? UI keys are top level in dynamicTexts usually?
    // Actually our TEXTS structure is nested (TEXTS.ar.ui.xxx).
    // But dynamicTexts might be flat keys like "order_type_now".
    // We need to inject them into the returned object.

    const combined = { ...staticTexts, ui: { ...staticTexts.ui } };

    // Inject dynamic keys into 'ui' namespace if they match standard pattern or just top level?
    // The user used `t.ui.order_type_now`. So we must put them in `ui`.
    Object.keys(dynamicTexts).forEach(key => {
      combined.ui[key] = dynamicTexts[key];
    });

    return combined;
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
  function roundTo(value, decimals = 2) {
    const factor = 10 ** Math.max(0, Number(decimals) || 0);
    return Math.round((Number(value) || 0) * factor) / factor;
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
    const serviceRate = 0;
    const service = subtotalAfterDiscount * serviceRate;
    const vatBase = subtotalAfterDiscount + service;
    const vat = 0;
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
          if (entry.message) return String(entry.message).trim();
          if (entry.text) return String(entry.text).trim();
          if (entry.note) return String(entry.note).trim();
          if (entry.content) return String(entry.content).trim();
          try {
            const str = JSON.stringify(entry);
            if (str && str !== '{}' && str !== '[object Object]') return str;
          } catch (e) { }
        }
        return '';
      })
      .filter(Boolean)
      .join(separator);
  }
  function normalizeQtyInput(input, maxDecimals = 3) {
    if (input === undefined || input === null) return null;
    const raw = String(input).trim().replace(',', '.');
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    return roundTo(numeric, maxDecimals);
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
        if (!order || (order.shiftId || order.shift_id) !== shiftId) {
          if (order)
            return;
        }
        const total = round(order?.totals?.due || order?.totalDue || order?.total_due || order?.total || 0);
        const typeKey = normalizeOrderTypeId(order?.type || order?.header?.type_id || order?.orderTypeId || order?.order_type_id || 'dine_in');
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

  function buildShiftReportPayload(db, shift) {
    if (!shift) return null;
    const lang = db.env?.lang;
    const allOrders = [
      ...(Array.isArray(db.data.ordersHistory) ? db.data.ordersHistory : []),
      ...(Array.isArray(db.data.ordersQueue) ? db.data.ordersQueue : [])
    ];
    const filteredOrders = allOrders.filter(order => order.shiftId === shift.id);
    const report = summarizeShiftOrders(filteredOrders, shift);
    const totalsByType = report.totalsByType || {};
    const paymentsByMethod = report.paymentsByMethod || {};
    const countsByType = report.countsByType || {};
    const dineInTotal = round(totalsByType.dine_in || 0);
    const takeawayTotal = round(totalsByType.takeaway || 0);
    const deliveryTotal = round(totalsByType.delivery || 0);
    const totalSales = report.totalSales != null
      ? round(report.totalSales)
      : round(dineInTotal + takeawayTotal + deliveryTotal);
    const openingFloat = round(shift.openingFloat || 0);
    const cashCollected = round(paymentsByMethod.cash || 0);
    const closingCash = shift.closingCash != null ? round(shift.closingCash) : round(openingFloat + cashCollected);
    const openedLabel = shift.openedAt
      ? formatDateTime(shift.openedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';
    const closedLabel = shift.closedAt
      ? formatDateTime(shift.closedAt, lang, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';
    const ordersCount = report.ordersCount != null ? report.ordersCount : (Array.isArray(shift.orders) ? shift.orders.length : 0);
    return {
      shift,
      report,
      totalsByType,
      paymentsByMethod,
      countsByType,
      totalSales,
      openingFloat,
      cashCollected,
      closingCash,
      openedLabel,
      closedLabel,
      ordersCount
    };
  }

  function resolveShiftById(db, shiftId) {
    const shiftState = db.data.shift || {};
    if (shiftState.current && shiftState.current.id === shiftId) return shiftState.current;
    const history = Array.isArray(shiftState.history) ? shiftState.history : [];
    return history.find(item => item.id === shiftId) || shiftState.current || null;
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
      console.warn('[POS] Invalid kitchenSection, defaulting to expo', { item, kitchenSource });
    }
    const statusId = overrides?.statusId || overrides?.status || 'draft';
    const baseLine = {
      id: uniqueId,
      itemId: itemId,
      item_id: itemId,
      Item_Id: itemId,
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
      isPersisted: overrides?.isPersisted ?? false,
      createdAt: overrides?.createdAt || now,
      updatedAt: overrides?.updatedAt || now
    };
    return applyLinePricing(baseLine);
  }
  function isLineLockedForEdit(order, line) {
    if (!line) return true;
    if (line.locked) return true;
    if (line.status && line.status !== 'draft') return true;
    if (order?.isPersisted && order?.lockLineEdits && line.isPersisted !== false) return true;
    return false;
  }
  function updateScheduleStatusInStores(scheduleId, status) {
    if (!scheduleId) return;
    const payload = { id: scheduleId, status, updated_at: new Date().toISOString() };
    const mainStore = (typeof window !== 'undefined') ? window.__MISHKAH_LAST_STORE__ : null;
    const posStore = (typeof window !== 'undefined') ? window.__POS_DB__ : null;
    if (mainStore && typeof mainStore.update === 'function') {
      mainStore.update('order_schedule', payload).catch(() => { });
    }
    if (posStore && typeof posStore.update === 'function') {
      posStore.update('order_schedule', payload).catch(() => { });
    }
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
  function getPrintSizePreset(size) {
    const sizePresets = {
      thermal_80: { width: '72mm', maxWidth: '72mm', padding: '18px 16px', fontSize: '13px', heading: '20px', meta: '12px', total: '16px', bodyBg: '#f4f7fb', border: '1px solid #dbeafe', radius: '20px', shadow: '0 18px 40px rgba(15,23,42,0.12)', page: '@page { size: 80mm auto; margin:4mm; }', bodyPadding: '18px' },
      receipt_15: { width: '150mm', maxWidth: '150mm', padding: '24px 20px', fontSize: '13px', heading: '22px', meta: '13px', total: '18px', bodyBg: '#f5f8ff', border: '1px dashed #cbd5f5', radius: '28px', shadow: '0 22px 50px rgba(15,23,42,0.14)', page: '@page { size: 150mm auto; margin:6mm; }', bodyPadding: '24px' },
      a5: { width: '100%', maxWidth: '720px', padding: '28px 32px', fontSize: '15px', heading: '26px', meta: '15px', total: '20px', bodyBg: '#f8fafc', border: '1px solid #dbe4f3', radius: '32px', shadow: '0 26px 64px rgba(15,23,42,0.18)', page: '@page { size: A5 landscape; margin:12mm; }', bodyPadding: '36px' },
      a4: { width: '100%', maxWidth: '860px', padding: '32px 40px', fontSize: '16px', heading: '28px', meta: '16px', total: '22px', bodyBg: '#ffffff', border: '1px solid #d0dae8', radius: '36px', shadow: '0 30px 70px rgba(15,23,42,0.2)', page: '@page { size: A4 portrait; margin:18mm; }', bodyPadding: '48px' }
    };
    return sizePresets[size] || sizePresets.thermal_80;
  }

  function renderPrintableHTML(db, docType, size) {
    const t = getTexts(db);
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
    const vatRate = 0.14;
    const totalWithVat = Number(due) || 0;
    const totalBeforeVat = totalWithVat ? round(totalWithVat / (1 + vatRate)) : 0;
    const vatAmount = totalWithVat ? round(totalWithVat - totalBeforeVat) : 0;
    const totalsRows = [
      { label: t.ui.subtotal, value: order.totals?.subtotal || 0 },
      order.totals?.service ? { label: t.ui.service, value: order.totals.service } : null,
      { label: t.ui.total_before_vat, value: totalBeforeVat },
      { label: t.ui.vat_14, value: vatAmount },
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
    const [firstTotalRow, ...otherTotalRows] = totalsRows;
    const renderTotalRow = (row) => {
      const price = formatCurrencyValue(db, row.value);
      return `<div class="row"><span>${escapeHTML(row.label)}</span><span>${price}</span></div>`;
    };
    const totalsHtml = [
      firstTotalRow ? renderTotalRow(firstTotalRow) : '',
      `<div class="row note"><span>${escapeHTML(t.ui.vat_included_note)}</span><span></span></div>`,
      ...otherTotalRows.map(renderTotalRow)
    ].filter(Boolean).join('');
    const paymentsHtml = payments.map(entry => {
      const method = methodsMap.get(entry.method);
      const label = method ? `${escapeHTML(localize(method.label, lang))}` : escapeHTML(entry.method || '');
      const price = formatCurrencyValue(db, entry.amount);
      return `<div class="row"><span>${label}</span><span>${price}</span></div>`;
    }).join('');
    const preset = getPrintSizePreset(size);
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
    const vatNoteRow = `<div class="row note"><span>${escapeHTML(t.ui.vat_included_note || '')}</span><span></span></div>`;
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
                <h1>${escapeHTML((() => {
      if (typeof window === 'undefined' || !window.localStorage || !window.localStorage.mishkah_user) return 'Mishkah Restaurant';
      try {
        const u = JSON.parse(window.localStorage.mishkah_user);
        if (u.compName) return u.compName;
        const br = String(u.brname || '').toLowerCase();
        if (br === 'remal') return 'G-Remal Hotel';
        if (br === 'dar') return 'قرية درويش للمندي';
        return 'Mishkah Restaurant';
      } catch (e) { return 'Mishkah Restaurant'; }
    })())}</h1>
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
                ${vatNoteRow}
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

  function renderShiftReportHTML(db, payload, size) {
    if (!payload) return '';
    const t = getTexts(db);
    const lang = db.env.lang;
    const dirAttr = db.env.dir || (lang === 'ar' ? 'rtl' : 'ltr');
    const preset = getPrintSizePreset(size);
    const { shift, totalsByType, countsByType, paymentsByMethod, totalSales, openingFloat, cashCollected, closingCash, openedLabel, closedLabel, ordersCount } = payload;
    const paymentMethods = Array.isArray(db.data.payments?.methods) && db.data.payments.methods.length
      ? db.data.payments.methods
      : PAYMENT_METHODS;
    const paymentRows = paymentMethods.map(method => {
      const amount = round(paymentsByMethod[method.id] || 0);
      const label = `${method.icon || '💳'} ${escapeHTML(localize(method.label, lang))}`;
      return `<div class="row"><span>${label}</span><span>${formatCurrencyValue(db, amount)}</span></div>`;
    });
    Object.keys(paymentsByMethod).forEach(key => {
      if (paymentMethods.some(method => method.id === key)) return;
      const amount = round(paymentsByMethod[key] || 0);
      paymentRows.push(`<div class="row"><span>${escapeHTML(key)}</span><span>${formatCurrencyValue(db, amount)}</span></div>`);
    });
    const typeRows = ORDER_TYPES.map(type => {
      const amount = round(totalsByType[type.id] || 0);
      const count = countsByType[type.id] || 0;
      const label = escapeHTML(localize(type.label, lang));
      return `<div class="row"><span>${label}${count ? ` (${count})` : ''}</span><span>${formatCurrencyValue(db, amount)}</span></div>`;
    });
    const metaRows = [
      `${escapeHTML(t.ui.shift)}: ${escapeHTML(shift.id || '—')}`,
      `POS: ${escapeHTML(shift.posLabel || POS_INFO.label || '—')}`,
      `${escapeHTML(t.ui.cashier)}: ${escapeHTML(shift.cashierName || '—')}`,
      `${escapeHTML(t.ui.shift_orders_count)}: ${ordersCount}`,
      `${escapeHTML(openedLabel)} → ${escapeHTML(closedLabel)}`
    ].map(val => `<p class="meta">${val}</p>`).join('');
    const html = `<!DOCTYPE html>
        <html lang="${lang}" dir="${dirAttr}">
        <head>
            <meta charset="utf-8"/>
            <title>${escapeHTML(t.ui.shift_report_title || t.ui.shift_summary)}</title>
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
            .receipt .row span:last-child { font-weight:600; }
            .receipt .separator { height:1px; background:#e2e8f0; margin:16px 0; }
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
                <h1>${escapeHTML(t.ui.shift_report_title || t.ui.shift_summary)}</h1>
                <p class="meta">${escapeHTML(t.ui.print_header_address)}: 12 Nile Street</p>
                <p class="meta">${escapeHTML(t.ui.print_header_phone)}: 0100000000</p>
            </header>
            <section>
                ${metaRows}
            </section>
            <div class="separator"></div>
            <section class="rows">
                ${typeRows.join('')}
            </section>
            <div class="separator"></div>
            <section class="rows totals">
                <div class="row"><span>${escapeHTML(t.ui.shift_cash_start)}</span><span>${formatCurrencyValue(db, openingFloat)}</span></div>
                <div class="row"><span>${escapeHTML(t.ui.shift_cash_collected)}</span><span>${formatCurrencyValue(db, cashCollected)}</span></div>
                <div class="row"><span>${escapeHTML(t.ui.shift_cash_end)}</span><span>${formatCurrencyValue(db, closingCash)}</span></div>
                <strong><span>${escapeHTML(t.ui.shift_total_sales)}</span><span>${formatCurrencyValue(db, totalSales)}</span></strong>
            </section>
            <div class="separator"></div>
            <section class="rows">
                ${paymentRows.join('')}
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
    const SHIFT_STORE = 'pos_shift';
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
      base.id = base.id || base.shift_id || base.shiftId || null;
      base.shift_id = base.id;
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
      const shifts = await listShifts({ posId, limit: 50 });
      return shifts.find(s => s.status === 'open' && !s.isClosed) || null;
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
        closedAt: record.closedAt || null,
        status: record.status || (record.isClosed ? 'closed' : 'open')
      };
      await ensureReady();
      await db.put(SHIFT_STORE, payload);
      return normalizeShiftRecord(payload);
    }
    async function openShiftRecord(record) {
      if (!record || !record.posId) throw new Error('Shift payload requires posId');
      const active = await getActiveShift(record.posId);
      if (active) return active;
      return writeShift({ ...record, isClosed: false, closedAt: null, status: 'open' });
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
        isClosed: true,
        status: 'closed'
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
        type: raw.type || raw.orderTypeId || raw.order_type_id || raw.orderType || raw.order_type || metadata.orderType || metadata.orderTypeId || 'dine_in',
        status: raw.status || raw.statusId || raw.status_id || 'open',
        fulfillmentStage: raw.fulfillmentStage || raw.stage || raw.stageId || raw.stage_id || 'new',
        paymentState:
          raw.paymentState || raw.payment_state || raw.paymentStateId || raw.payment_state_id || 'unpaid',
        shiftId: raw.shiftId || raw.shift_id || metadata.shiftId || metadata.shift_id || null
      };
      base.createdAt = toTimestamp(raw.createdAt || raw.created_at || raw.openedAt || raw.opened_at || base.createdAt);
      base.updatedAt = toTimestamp(raw.updatedAt || raw.updated_at || base.updatedAt || base.createdAt);
      base.savedAt = toTimestamp(raw.savedAt || raw.saved_at || base.savedAt || base.updatedAt);
      base.stage = base.fulfillmentStage;
      base.stageId = base.fulfillmentStage;
      base.statusId = base.status;
      base.payment_state = base.paymentState;
      base.paymentStateId = base.paymentState;
      const tableIdsSource = raw.tableIds || raw.table_ids || raw.tableId || metadata.tableIds || metadata.table_ids;
      base.tableIds = Array.isArray(tableIdsSource)
        ? tableIdsSource.slice()
        : (tableIdsSource ? [tableIdsSource] : []);
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
      if (!order.shiftId || !String(order.shiftId).trim()) {
        try {
          let currentShift = null;
          if (typeof getActiveShift === 'function') {
            const result = getActiveShift();
            currentShift = (result && typeof result.then === 'function') ? await result : result;
          }
          if (!currentShift && window.__MISHKAH_LAST_STORE__) {
            const posData = window.__MISHKAH_LAST_STORE__.state?.modules?.pos;
            const shifts = posData?.tables?.pos_shift || [];
            let userId = null;
            try {
              const raw = window.localStorage?.getItem('mishkah_user');
              if (raw) {
                const parsed = JSON.parse(raw);
                userId = parsed?.userID || null;
              }
            } catch (_err) { }
            const openShifts = Array.isArray(shifts)
              ? shifts.filter(s => !s?.closedAt && s?.isClosed !== true && String(s?.status || '').toLowerCase() === 'open' && (
                userId && s.metadata?.userID === userId
              ))
              : [];
            currentShift = openShifts.sort((a, b) => {
              const av = new Date(a.updatedAt || a.openedAt || 0).getTime();
              const bv = new Date(b.updatedAt || b.openedAt || 0).getTime();
              return bv - av;
            })[0] || null;
          }
          if (currentShift && currentShift.id) {
            console.warn(`[POS][saveOrder] ⚠️ Auto-recovered missing shiftId for order ${order.id || 'new'}: ${currentShift.id}`);
            order.shiftId = currentShift.id;
            if (!order.metadata) order.metadata = {};
            order.metadata.shiftId = currentShift.id;
          }
        } catch (err) {
          console.error('[POS][saveOrder] ⚠️ Failed to auto-recover shiftId:', err);
        }
      }
      if (!order || !order.shiftId || !String(order.shiftId).trim()) {
        console.error('[POS][saveOrder] ❌ Order rejected: Missing or empty shiftId', {
          orderId: order?.id,
          shiftId: order?.shiftId,
          shiftIdType: typeof order?.shiftId
        });
        throw new Error('Order requires a valid shiftId (cannot be empty)');
      }
      const endpoint = window.basedomain + `/api/branches/${encodeURIComponent(BRANCH_ID)}/modules/${encodeURIComponent(MODULE_ID)}/orders`;
      const outgoing = { ...order };

      // Extract ERP user data from localStorage
      let erpUserData = null;
      try {
        const userDataStr = localStorage.getItem('mishkah_user');
        if (userDataStr) {
          erpUserData = JSON.parse(userDataStr);
          console.log('[POS][saveOrder] ✅ Extracted ERP user data:', {
            userID: erpUserData.userID,
            userName: erpUserData.userName,
            brname: erpUserData.brname
          });
        } else {
          console.warn('[POS][saveOrder] ⚠️ localStorage.mishkah_user is empty');
        }
      } catch (err) {
        console.error('[POS][saveOrder] ❌ Failed to parse mishkah_user from localStorage:', err);
      }

      // Extract current shift data from app state
      let currentShift = null;
      if (window.__MISHKAH_LAST_APP__ && window.__MISHKAH_LAST_APP__.state) {
        currentShift = window.__MISHKAH_LAST_APP__.state.data?.shift?.current;
        if (currentShift) {
          console.log('[POS][saveOrder] ✅ Extracted shift data:', {
            id: currentShift.id,
            openedAt: currentShift.openedAt
          });
        } else {
          console.warn('[POS][saveOrder] ⚠️ No current shift found in app state');
        }
      }

      // Initialize metadata if not present
      if (!outgoing.metadata) {
        outgoing.metadata = {};
      }

      // Add shift data to metadata
      if (currentShift && currentShift.id && currentShift.openedAt) {
        outgoing.metadata.shiftData = {
          id: currentShift.id,
          openedAt: currentShift.openedAt
        };
        console.log('[POS][saveOrder] ✅ Added shift data to order metadata');
      } else {
        console.warn('[POS][saveOrder] ⚠️ Shift data incomplete, not added to metadata');
      }

      // Add ERP user data to metadata
      if (erpUserData && erpUserData.userID) {
        outgoing.metadata.erpUser = {
          userID: erpUserData.userID,
          compid: erpUserData.compid,
          branch_id: erpUserData.branch_id,
          userName: erpUserData.userName,
          userEmail: erpUserData.userEmail,
          brname: erpUserData.brname,
          pin_code: erpUserData.pin_code
        };
        console.log('[POS][saveOrder] ✅ Added ERP user data to order metadata');
      } else {
        console.warn('[POS][saveOrder] ⚠️ ERP user data incomplete, not added to metadata');
      }

      const expectedVersion = Number(order?.expectedVersion);
      const currentVersion = Number(order?.version);
      if (Number.isFinite(expectedVersion) && expectedVersion > 0) {
        outgoing.version = expectedVersion;
      } else if (Number.isFinite(currentVersion) && currentVersion > 0) {
        outgoing.version = currentVersion;
      }
      let sanitizedOrder;
      try {
        sanitizedOrder = JSON.parse(JSON.stringify({ order: outgoing }));
      } catch (sanitizeError) {
        console.error('[POS][saveOrder] ❌ Failed to sanitize order payload:', sanitizeError);
        console.error('[POS][saveOrder] Problematic order:', outgoing);
        throw new Error(`Order contains non-serializable data: ${sanitizeError.message}`);
      }
      const payload = await postJson(endpoint, sanitizedOrder);
      const responseOrder = payload?.order || payload?.frameData?.order || payload?.frameData?.data?.order || null;
      if (responseOrder) {
        const normalized = normalizePersistedOrder(responseOrder);
        if (payload?.orderId && normalized && payload.orderId !== normalized.id) {
          normalized.id = payload.orderId;
          normalized.fullId = normalized.fullId || payload.orderId;
        }
        if (payload?.orderId) {
          normalized.persistedId = payload.orderId;
        } else if (responseOrder?.id) {
          normalized.persistedId = responseOrder.id;
        }
        return normalized;
      }
      if (payload?.orderId) {
        const normalized = normalizePersistedOrder({ ...order, id: payload.orderId, fullId: payload.orderId });
        if (normalized) normalized.persistedId = payload.orderId;
        return normalized || { ...order, id: payload.orderId, fullId: payload.orderId, persistedId: payload.orderId };
      }
      return order;
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
      insert: writeShift,
      openShiftRecord,
      closeShiftRecord,
      nextInvoiceNumber,
      peekInvoiceCounter,
      resetAll,
      supportsTempOrders: false
    };
  }
  const resolveShiftTableName = () => POS_TABLE_HANDLES?.posShift || POS_TABLE_HANDLES?.pos_shift || 'pos_shift';
  const updateShiftRemote = async (record) => {
    if (!record || !record.id) return null;

    const branchId = window.__POS_BRANCH_ID__;
    const moduleId = 'pos';
    const baseUrl = window.basedomain || '';
    const url = `${baseUrl}/api/branches/${branchId}/modules/${moduleId}/shift/${record.id}/close`;

    try {
      // Send minimal data - backend only needs the shift ID (in URL)
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Shift close failed: ${response.status}`);
      }

      const result = await response.json();
      return result.shift || record;
    } catch (error) {
      console.error('[POS] Shift close endpoint error:', error);
      // Return null to indicate failure (caller handles gracefully)
      return null;
    }
  };
  function createKDSBridge(url) {
    let socket = null;
    let reconnectTimer = null;
    let messageQueue = [];
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 3000; // 3 seconds

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect(ctx) {
      clearReconnectTimer();
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[KDS] Max reconnection attempts reached');
        return;
      }
      reconnectAttempts++;
      console.warn(`[KDS] Scheduling reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_DELAY}ms`);
      reconnectTimer = setTimeout(() => {

        bridge.connect(ctx);
      }, RECONNECT_DELAY);
    }

    function flushQueue() {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.warn('[KDS] Cannot flush queue - socket not ready');
        return;
      }

      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        try {
          socket.send(JSON.stringify(msg));

        } catch (err) {
          console.error('[KDS] Failed to send queued message:', err);
          messageQueue.unshift(msg); // Put it back
          break;
        }
      }
    }

    const bridge = {
      connect(ctx) {
        const state = ctx.getState();
        const t = getTexts(state);

        clearReconnectTimer();

        if (socket) {
          try { socket.close(); } catch (_) { }
        }

        if (!('WebSocket' in window)) {
          console.error('[KDS] WebSocket not supported');
          UI.pushToast(ctx, { title: t.toast.kdsUnavailable || 'KDS غير متاح', icon: '⚠️' });
          return;
        }

        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            status: {
              ...s.data.status,
              kds: { ...(s.data.status?.kds || {}), state: 'connecting' }
            }
          }
        }));

        try {

          socket = new WebSocket(url);
        } catch (error) {
          console.error('[KDS] Connection failed:', error);
          UI.pushToast(ctx, { title: t.toast.kdsFailed || 'فشل الاتصال بالمطبخ', message: String(error), icon: '🛑' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'offline' } }
            }
          }));
          scheduleReconnect(ctx);
          return;
        }

        socket.onopen = () => {

          reconnectAttempts = 0; // Reset counter on successful connection
          UI.pushToast(ctx, { title: t.toast.kdsConnected || 'تم الاتصال بالمطبخ', icon: '✅' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'online' } }
            }
          }));
          // Flush any queued messages
          flushQueue();
        };

        socket.onclose = (event) => {
          console.warn('[KDS] Connection closed:', event.code, event.reason);
          UI.pushToast(ctx, { title: t.toast.kdsClosed || 'انقطع الاتصال بالمطبخ', icon: 'ℹ️' });
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              status: { ...s.data.status, kds: { ...(s.data.status?.kds || {}), state: 'offline' } }
            }
          }));
          // Auto-reconnect
          scheduleReconnect(ctx);
        };

        socket.onerror = (error) => {
          console.error('[KDS] WebSocket error:', error);
          UI.pushToast(ctx, { title: t.toast.kdsFailed || 'خطأ في الاتصال بالمطبخ', icon: '🛑' });
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
              UI.pushToast(ctx, { title: 'KDS', message: t.toast.kdsPong || 'Pong', icon: '🍳', ttl: 1600 });
            }
          } catch (err) {
            console.error('[KDS] Failed to parse message:', err);
          }
        };
      },

      send(type, data) {
        const message = { type, data, timestamp: Date.now() };

        if (!socket || socket.readyState !== WebSocket.OPEN) {
          console.warn('[KDS] Socket not ready - queueing message:', type);
          messageQueue.push(message);
          // Limit queue size to prevent memory issues
          if (messageQueue.length > 100) {
            console.warn('[KDS] Queue too large, dropping oldest message');
            messageQueue.shift();
          }
          return false;
        }

        try {
          socket.send(JSON.stringify(message));

          return true;
        } catch (err) {
          console.error('[KDS] Failed to send message:', err);
          messageQueue.push(message);
          return false;
        }
      },

      disconnect() {
        clearReconnectTimer();
        if (socket) {
          try {
            socket.close();
          } catch (_) { }
          socket = null;
        }
        messageQueue = [];
        reconnectAttempts = 0;
      }
    };

    return bridge;
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
  function extractOrderNumberPrefix(fullOrderNumber) {
    if (!fullOrderNumber || typeof fullOrderNumber !== 'string') return '';
    const str = fullOrderNumber.trim();
    const parts = str.split('-');
    if (parts.length <= 2) return str;
    const thirdPart = parts[2];
    if (thirdPart && thirdPart.length >= 8 && /^[0-9a-f]+$/i.test(thirdPart)) {
      return `${parts[0]}-${parts[1]}`;
    }
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
    const branchId = (typeof ACTIVE_BRANCH_ID !== 'undefined' && ACTIVE_BRANCH_ID)
      ? ACTIVE_BRANCH_ID
      : (state?.data?.branch?.id || (typeof window !== 'undefined' ? window.__POS_BRANCH_ID__ : null) || 'dar');
    const moduleId = MODULE_ID || 'pos';
    const tableLabel = deriveTableLabel(order, state);
    const customerName = order.customerName || order.customer?.name || '';
    const linesRaw = Array.isArray(order.lines) ? order.lines : [];
    const lines = linesRaw.filter(Boolean);
    if (!lines.length) return null;

    const store = typeof window !== 'undefined' && window.__POS_DB__ ? window.__POS_DB__ : null;
    let alreadySentLineIds = new Set();

    if (typeof window !== 'undefined' && window.database && Array.isArray(window.database.job_order_header) && Array.isArray(window.database.job_order_detail)) {
      try {
        const existingJobHeaders = window.database.job_order_header.filter(h => {
          const headerOrderId = h.orderId || h.order_id;
          return headerOrderId === order.id;
        });

        for (const jobHeader of existingJobHeaders) {
          const jobOrderId = jobHeader.id;
          const existingJobDetails = window.database.job_order_detail.filter(d => {
            const detailJobId = d.jobOrderId || d.job_order_id;
            return detailJobId === jobOrderId;
          });

          existingJobDetails.forEach(detail => {
            const lineId = detail.orderLineId || detail.order_line_id;
            if (lineId) {
              alreadySentLineIds.add(String(lineId));
            }
          });
        }

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
    const linesToSendToKitchen = lines.filter((line, index) => {
      const lineIndex = index + 1;
      const primaryLineId = toIdentifier(line.id, line.uid, line.storageId);
      const fallbackLineId = `${order.id}-line-${lineIndex}`;
      if (!line.id && !line.uid && !line.storageId) {
        console.warn('⚠️ [LINE ID MISSING] line.id is not set - using lineIndex fallback (UNSTABLE!):', {
          lineIndex,
          fallbackLineId,
          itemName: line.name,
          warning: 'This line may be RE-MANUFACTURED if order is modified!'
        });
      }
      const baseLineId = toIdentifier(line.id, line.uid, line.storageId, fallbackLineId) || fallbackLineId;
      const alreadySent = alreadySentLineIds.has(baseLineId);

      if (alreadySent) {

      }
      return !alreadySent;
    });
    const isReopenedOrder = alreadySentLineIds.size > 0 && linesToSendToKitchen.length < lines.length;

    if (!linesToSendToKitchen.length) {
      return null;
    }
    const kitchenSections = Array.isArray(state.data?.kitchenSections) ? state.data.kitchenSections : [];
    const sectionMap = new Map(kitchenSections.map(section => [section.id, section]));
    const jobsMap = new Map();
    const jobDetails = [];
    const jobModifiers = [];
    const historyEntries = [];
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
    const batchId = `BATCH-${order.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    if (isReopenedOrder) {

    }
    const linesByStation = new Map();
    linesToSendToKitchen.forEach((line, index) => {
      const lineIndex = index + 1;
      const kitchenSectionSource = line.kitchenSection || line.kitchenSectionId || line.kitchen_section_id || line.kitchen_section;
      const resolvedStation = toIdentifier(kitchenSectionSource);
      let stationId = resolvedStation;
      if (!stationId) {
        const categoryId = line.categoryId || line.category_id || line.menuCategoryId || line.menu_category_id;
        if (categoryId) {
          stationId = resolveStationForCategory(categoryId);
        }
      }
      stationId = stationId || 'general';
      if (!resolvedStation || resolvedStation === 'expo' || stationId === 'general') {

      }
      if (!linesByStation.has(stationId)) {
        linesByStation.set(stationId, []);
      }
      linesByStation.get(stationId).push({ line, lineIndex });
    });
    linesByStation.forEach((linesGroup, stationId) => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const jobId = `${order.id}-${stationId}-${timestamp}-${random}`;
      const section = sectionMap.get(stationId) || {};
      const stationCode = section.code || (stationId ? String(stationId).toUpperCase() : 'KDS');
      const fullOrderNumber = order.orderNumber || order.invoiceId || order.id;
      const displayOrderNumber = extractOrderNumberPrefix(fullOrderNumber);
      const job = {
        id: jobId,
        jobOrderId: jobId,
        job_order_id: jobId,
        branchId,
        branch_id: branchId,
        moduleId,
        module_id: moduleId,
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
        batchId,
        meta: { orderSource: 'pos', kdsTab: stationId },
        createdAt: createdIso,
        updatedAt: updatedIso
      };
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
        const detail = {
          id: detailId,
          jobOrderId: jobId,
          job_order_id: jobId,
          branchId,
          branch_id: branchId,
          moduleId,
          module_id: moduleId,
          orderLineId: baseLineId,
          order_line_id: baseLineId,
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

        if (line.notes) {

        }
        jobDetails.push(detail);
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
      jobsMap.set(jobId, job);
    });
    const headers = Array.from(jobsMap.values());
    if (!headers.length) return null;

    const summaryOrderNumber = extractOrderNumberPrefix(order.orderNumber || order.invoiceId || order.id);
    const orderSummary = {
      orderId: order.id,
      orderNumber: summaryOrderNumber,
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
    const isReopenedOrderForHeader = isReopenedOrder;
    const orderHeader = {
      id: order.id,
      type: serviceMode,
      orderNumber: order.orderNumber || order.invoiceId || order.id,
      orderTypeId: serviceMode,
      serviceMode,
      shiftId: order.shiftId || order.shift_id || order.metadata?.shiftId || null,
      shift_id: order.shiftId || order.shift_id || order.metadata?.shiftId || null,
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
      notes: notesToText(order.notes, '; '),
      version: order.version || order.currentVersion || 1,
      metadata: {
        ...(order.metadata || {}),
        serviceMode,
        orderType: serviceMode,
        orderTypeId: serviceMode
      },
      createdAt: createdIso,
      updatedAt: updatedIso
    };

    if (isReopenedOrderForHeader) {
    } else {
    }
    const linesToInclude = isReopenedOrderForHeader
      ? lines.filter(line => !line.isPersisted)
      : lines;
    const orderLines = linesToInclude.map((line, index) => {
      const lineIndex = index + 1;
      const itemId = toIdentifier(line.itemId, line.productId, line.menuItemId, line.sku, `${order.id}-line-${lineIndex}`);
      const itemName = line.name || line.displayName || line.label || itemId;
      const kitchenSectionSource = line.kitchenSection || line.kitchenSectionId || line.kitchen_section_id || line.kitchen_section;
      const resolvedStation = toIdentifier(kitchenSectionSource) || 'expo';
      const qtyValue = Number(line.qty ?? line.quantity);
      const priceValue = Number(line.price ?? line.unitPrice ?? line.unit_price);
      return {
        id: line.id || `${order.id}-line-${lineIndex}`,
        orderId: order.id,
        itemId,
        name: itemName,
        qty: Number.isFinite(qtyValue) ? qtyValue : 1,
        quantity: Number.isFinite(qtyValue) ? qtyValue : 1,
        price: Number.isFinite(priceValue) ? priceValue : 0,
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

    }
    const result = {
      order: orderSummary,
      order_header: [orderHeader],
      order_line: orderLines,
      job_order_header: headers,
      job_order_detail: jobDetails,
      job_order_detail_modifier: jobModifiers,
      job_order_status_history: historyEntries,
      master: masterSnapshot,
      deliveries: deliveriesSnapshot,
      handoff: handoffSnapshot,
      drivers: masterSnapshot.drivers,
      meta: { channel: masterSnapshot.channel, branch: BRANCH_CHANNEL, posId: POS_INFO.id, emittedAt: new Date().toISOString() },
      isReopenedOrder: isReopenedOrderForHeader
    };

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
      console.warn('[Mishkah][POS][KDS] WebSocket adapter is unavailable; disabling sync.');
    }
    if (!endpoint) {
      console.warn('[Mishkah][POS][KDS] No KDS endpoint configured; sync bridge is inactive.');
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
          const payload = envelope.payload || {};
          if (payload && typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.insert === 'function') {
            const store = window.__POS_DB__;
            const headers = payload.job_order_header || [];
            const details = payload.job_order_detail || [];
            const modifiers = payload.job_order_detail_modifier || [];
            const statusHistory = payload.job_order_status_history || [];
            console.warn('[POS][KDS][Fallback] WebSocket unavailable - job_orders will NOT persist! Consider HTTP POST:', {
              headers: headers.length,
              details: details.length,
              modifiers: modifiers.length,
              statusHistory: statusHistory.length
            });
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
      console.warn('[Mishkah][POS][KDS] Sync connection closed.', { code: event?.code, reason: event?.reason });
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
          try { handlers.onOrders(resolved || {}, meta); } catch (handlerErr) { console.warn('[Mishkah][POS][KDS] onOrders handler failed.', handlerErr); }
        }
        if (msg.topic === topicJobs && typeof handlers.onJobUpdate === 'function') {
          try { handlers.onJobUpdate(resolved || {}, meta); } catch (handlerErr) { console.warn('[Mishkah][POS][KDS] onJobUpdate handler failed.', handlerErr); }
        }
        if (msg.topic === topicDelivery && typeof handlers.onDeliveryUpdate === 'function') {
          try { handlers.onDeliveryUpdate(resolved || {}, meta); } catch (handlerErr) { console.warn('[Mishkah][POS][KDS] onDeliveryUpdate handler failed.', handlerErr); }
        }
        if (msg.topic === topicHandoff && typeof handlers.onHandoffUpdate === 'function') {
          try { handlers.onHandoffUpdate(resolved || {}, meta); } catch (handlerErr) { console.warn('[Mishkah][POS][KDS] onHandoffUpdate handler failed.', handlerErr); }
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
          console.warn('[Mishkah][POS][KDS] Skipped publishing order payload — serialization failed.', { orderId: orderPayload?.id });
          return null;
        }
        const payload = envelope.payload || {};
        if (payload && typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.insert === 'function') {
          const store = window.__POS_DB__;
          const headers = payload.job_order_header || [];
          const details = payload.job_order_detail || [];
          const modifiers = payload.job_order_detail_modifier || [];
          const statusHistory = payload.job_order_status_history || [];

          headers.forEach((header, index) => {
            try {
              store.insert('job_order_header', header);
            } catch (err) {
              console.error(`❌ [POS][KDS] Failed to insert job_order_header ${index + 1}:`, err, header);
              console.error('[POS][KDS] Error details:', err.stack);
            }
          });
          details.forEach(detail => {
            try {
              store.insert('job_order_detail', detail);
            } catch (err) {
              console.warn('[POS][KDS] Failed to insert job_order_detail:', err);
            }
          });
          modifiers.forEach(modifier => {
            try {
              store.insert('job_order_detail_modifier', modifier);
            } catch (err) {
              console.warn('[POS][KDS] Failed to insert job_order_detail_modifier:', err);
            }
          });
          statusHistory.forEach(history => {
            try {
              store.insert('job_order_status_history', history);
            } catch (err) {
              console.warn('[POS][KDS] Failed to insert job_order_status_history:', err);
            }
          });
        }
        sendEnvelope({ type: 'publish', topic: topicOrders, data: envelope.payload });
        pushLocal('orders:payload', { payload: envelope.payload }, { channel: envelope.channel, publishedAt: envelope.publishedAt });
        return envelope.payload;
      },
      publishJobUpdate(update) {
        if (!update || !update.jobId) {
          console.warn('[Mishkah][POS][KDS] Ignored job update with missing jobId.', update);
          return;
        }
        sendEnvelope({ type: 'publish', topic: topicJobs, data: update });
        pushLocal('job:update', { jobId: update.jobId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
      },
      publishDeliveryUpdate(update) {
        if (!update || !update.orderId) {
          console.warn('[Mishkah][POS][KDS] Ignored delivery update with missing orderId.', update);
          return;
        }
        sendEnvelope({ type: 'publish', topic: topicDelivery, data: update });
        pushLocal('delivery:update', { orderId: update.orderId, payload: update.payload || {} }, typeof update.meta === 'object' ? update.meta : {});
      },
      publishHandoffUpdate(update) {
        if (!update || !update.orderId) {
          console.warn('[Mishkah][POS][KDS] Ignored handoff update with missing orderId.', update);
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
  const realtimeSchedules = {
    store: (typeof window !== 'undefined' && window.__POS_DB__ && typeof window.__POS_DB__.watch === 'function')
      ? window.__POS_DB__
      : null,
    installed: false,
    pending: false,
    ready: false,
    schedules: new Map(),
    lines: new Map(),
    tables: new Map(),
    payments: new Map(),
    snapshot: { schedules: [], active: [], lines: [], tables: [], payments: [] },
    unsubscribes: [],
    debugLogged: { schedules: false, lines: false, tables: false, payments: false }
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

      } else {

      }
    } catch (error) {

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
    let rawShiftId = row.shiftId ?? row.shift_id;
    if (rawShiftId == null || !String(rawShiftId).trim()) {
      const metaObj = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || row.meta || {});
      rawShiftId = metaObj.shiftId || metaObj.shift_id;
    }
    let rawShiftIdString = String(rawShiftId || '').trim();
    if (rawShiftIdString) {
      normalized.shiftId = rawShiftIdString;
    } else {
      const storeState = (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.state);
      let currentShift = (typeof posState !== 'undefined' && posState?.data?.shift?.current)
        ? posState.data.shift.current
        : (storeState?.data?.shift?.current);
      const shiftHistory = storeState?.data?.shift?.history || [];
      let recoveredShift = null;
      if (currentShift && currentShift.id) {
        recoveredShift = currentShift;
        console.warn(`[sanitizeOrderHeaderRow] Order ${normalized.id} missing shiftId, assigning current shift: ${currentShift.id}`);
      }
      else if (shiftHistory.length > 0) {
        const sortedHistory = [...shiftHistory].sort((a, b) => {
          const aTime = a.closedAt || a.openedAt || 0;
          const bTime = b.closedAt || b.openedAt || 0;
          return bTime - aTime;
        });
        recoveredShift = sortedHistory[0];
        console.warn(`[sanitizeOrderHeaderRow] Order ${normalized.id} missing shiftId, assigning most recent shift from history: ${recoveredShift.id}`);
      }
      if (recoveredShift && recoveredShift.id) {
        normalized.shiftId = String(recoveredShift.id);
      } else {
        console.error(`[sanitizeOrderHeaderRow] Order ${normalized.id} has no shiftId and no shifts available in state!`);
        normalized.shiftId = rawShiftId != null ? String(rawShiftId) : '';
      }
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
    if (!Array.isArray(normalized.tableIds) || normalized.tableIds.length === 0) {
      if (Array.isArray(row.table_ids)) {
        normalized.tableIds = row.table_ids.slice();
      } else if (typeof row.table_ids === 'string') {
        const parsed = parseJSONSafe(row.table_ids, null);
        if (Array.isArray(parsed)) normalized.tableIds = parsed;
      } else if (Array.isArray(row.tableIds)) {
        normalized.tableIds = row.tableIds.slice();
      } else if (row.tableId != null) {
        normalized.tableIds = [row.tableId];
      } else if (row.table_id != null) {
        normalized.tableIds = [row.table_id];
      } else if (Array.isArray(normalized.metadata?.tableIds)) {
        normalized.tableIds = normalized.metadata.tableIds.slice();
      } else {
        normalized.tableIds = [];
      }
    }
    if (normalized.notes == null && row.notes_json) {
      const parsedNotes = parseJSONSafe(row.notes_json, null);
      if (Array.isArray(parsedNotes)) normalized.notes = parsedNotes;
    }
    if (!normalized.type && (row.orderTypeId || row.order_type_id || row.type_id)) {
      normalized.type = row.orderTypeId || row.order_type_id || row.type_id || 'dine_in';
    }
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
    let metadataSource = row.metadata || row.meta || row.lineMetadata || row.line_metadata || null;
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
    if (!rawItemId && id && typeof id === 'string') {
      const match = id.match(/^ln-([0-9a-fA-F-]+)-[a-z0-9-]+$/);
      if (match && match[1]) {
        rawItemId = match[1];

      }
    }
    const finalRawItemId = (rawItemId != null && typeof rawItemId === 'object' && rawItemId.value != null)
      ? rawItemId.value
      : rawItemId;
    const rawItemIdString = finalRawItemId != null && String(finalRawItemId).trim() !== '' && String(finalRawItemId).trim().toLowerCase() !== 'null' && String(finalRawItemId).trim().toLowerCase() !== 'undefined'
      ? String(finalRawItemId).trim()
      : null;
    const itemId = rawItemIdString;
    if (!itemId) {
      console.warn('[Mishkah][POS] Dropping realtime order line - missing itemId', {
        id,
        orderId,
        rawItemId,
        availableFields: Object.keys(row),
        metadata_field: row.metadata,
        meta_field: row.meta,
        parsedMetadata: metadata,
        sampleRow: row
      });
      return null;
    }
    normalized.itemId = itemId;
    normalized.item_id = itemId;
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
    const nameCandidate = metadata.name || metadata.itemName || raw.name || raw.item_name;
    const itemNameAr = metadata.itemNameAr || metadata.item_name_ar || raw.item_name_ar;
    const itemNameEn = metadata.itemNameEn || metadata.item_name_en || raw.item_name_en;
    let finalName = nameCandidate;
    if (!finalName && (itemNameAr || itemNameEn)) {
      finalName = { ar: itemNameAr || itemNameEn || '', en: itemNameEn || itemNameAr || '' };
    }
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
      const bucket = isOrderCompletedForSnapshot(order) ? history : active;
      bucket.push(cloneOrderSnapshot(order));
    });
    active.forEach((entry) => {
      entry.dirty = false;
      entry.isPersisted = true;
      if (Array.isArray(entry.lines)) {
        entry.lines = entry.lines.map(line => ({
          ...line,
          isPersisted: true
        }));
      }
    });
    history.forEach((entry, idx) => {
      entry.seq = idx + 1;
      entry.dirty = false;
      entry.isPersisted = true;
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
  function resetPosShiftState(store, options = {}) {
    const {
      validation,
      clearOrders = false,
      keepHistory = false,
      showPin = true,
      allowClearOpenShift = false
    } = options;
    if (!store || typeof store.setState !== 'function') return;
    store.setState(s => {
      const modules = s.modules || {};
      const posModule = modules.pos || {};
      const posState = posModule.state || {};
      const data = posState.data || {};
      const currentShift = data.shift?.current;
      const hasOpenShift = currentShift && !currentShift.isClosed;
      const ui = posState.ui || {};
      if (hasOpenShift && !allowClearOpenShift) {
        const nextData = {
          ...data,
          shift: {
            ...(data.shift || {}),
            current: currentShift,
            history: keepHistory ? (data.shift?.history || []) : (data.shift?.history || []),
            validation
          },
          user: {
            ...(data.user || {}),
            shift: currentShift.id || data.user?.shift || '—',
            shiftNo: currentShift.id || data.user?.shiftNo || '—'
          },
          status: {
            ...(data.status || {})
          }
        };
        const nextUi = {
          ...ui,
          shift: {
            ...(ui.shift || {}),
            ...(showPin ? { showPin: true, pin: '' } : {})
          }
        };
        return {
          ...s,
          modules: {
            ...modules,
            pos: {
              ...posModule,
              state: {
                ...posState,
                data: nextData,
                ui: nextUi
              }
            }
          }
        };
      }
      const nextData = {
        ...data,
        shift: {
          ...(data.shift || {}),
          current: null,
          history: keepHistory ? (data.shift?.history || []) : [],
          validation
        },
        user: {
          ...(data.user || {}),
          shift: '—',
          shiftNo: '—'
        },
        status: {
          ...(data.status || {})
        }
      };
      if (clearOrders) {
        nextData.order = null;
        nextData.ordersQueue = [];
        nextData.ordersHistory = [];
      }
      const nextUi = {
        ...ui,
        shift: {
          ...(ui.shift || {}),
          ...(showPin ? { showPin: true, pin: '' } : {})
        }
      };
      return {
        ...s,
        modules: {
          ...modules,
          pos: {
            ...posModule,
            state: {
              ...posState,
              data: nextData,
              ui: nextUi
            }
          }
        }
      };
    });
  }
  function enforceShiftGuard(prevData, nextData) {
    const allowClear = (typeof window !== 'undefined' && window.__POS_ALLOW_SHIFT_CLEAR__);
    if (allowClear) return nextData;
    const prevShift = prevData?.shift?.current;
    if (prevShift && !prevShift.isClosed) {
      const nextShift = nextData?.shift?.current;
      if (!nextShift) {
        const preservedShift = prevShift;
        const guarded = {
          ...nextData,
          shift: {
            ...(nextData.shift || {}),
            current: preservedShift,
            validation: nextData.shift?.validation || prevData.shift?.validation
          }
        };
        guarded.user = {
          ...(nextData.user || {}),
          shift: preservedShift.id || nextData.user?.shift || '—',
          shiftNo: preservedShift.id || nextData.user?.shiftNo || '—'
        };
        if (nextData.order) {
          guarded.order = {
            ...(nextData.order || {}),
            shiftId: preservedShift.id || nextData.order?.shiftId || null
          };
        }
        return guarded;
      }
    }
    return nextData;
  }
  function applyShiftGuardToStore(store) {
    if (!store || typeof store.setState !== 'function') return;
    if (store.__shiftGuardApplied) return;
    const originalSetState = store.setState.bind(store);
    store.setState = (updater) => {
      const wrapped = (prev) => {
        const next = (typeof updater === 'function')
          ? updater(prev)
          : { ...prev, ...(updater || {}) };
        const prevPos = prev?.modules?.pos?.state;
        const nextPos = next?.modules?.pos?.state;
        if (prevPos && nextPos) {
          const guardedData = enforceShiftGuard(prevPos.data || {}, nextPos.data || {});
          if (guardedData !== nextPos.data) {
            return {
              ...next,
              modules: {
                ...(next.modules || {}),
                pos: {
                  ...(next.modules?.pos || {}),
                  state: {
                    ...nextPos,
                    data: guardedData
                  }
                }
              }
            };
          }
        }
        return next;
      };
      return originalSetState(wrapped);
    };
    store.__shiftGuardApplied = true;
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
    if (realtimeOrders.installed) return;
    if (!realtimeOrders.store) return;
    const store = realtimeOrders.store;
    const registeredObjects = Object.keys(store.config?.objects || {});
    const headerTableName = 'order_header';
    const lineTableName = 'order_line';
    const paymentTableName = 'order_payment';
    if (typeof store.register === 'function') {
      if (!registeredObjects.includes(headerTableName)) {
        try {
          store.register(headerTableName, { table: 'order_header' });
        } catch (err) {
          console.warn('[POS][installRealtimeOrderWatchers] Failed to register', headerTableName, err);
        }
      }
      if (!registeredObjects.includes(lineTableName)) {
        try {
          store.register(lineTableName, { table: 'order_line' });
        } catch (err) {
          console.warn('[POS][installRealtimeOrderWatchers] Failed to register', lineTableName, err);
        }
      }
      if (!registeredObjects.includes(paymentTableName)) {
        try {
          store.register(paymentTableName, { table: 'order_payment' });
        } catch (err) {
          console.warn('[POS][installRealtimeOrderWatchers] Failed to register', paymentTableName, err);
        }
      }
    }

    const fetchInitialData = async () => {
      try {
        // OPTIMIZATION: Use window.database directly (already fetched via pos-simple-loader)
        const snapshot = { tables: window.database || {} };
        const fetchedTables = snapshot.tables || {};
        const shiftTable = Array.isArray(fetchedTables.pos_shift) ? fetchedTables.pos_shift : (Array.isArray(fetchedTables.posShift) ? fetchedTables.posShift : []);
        if (Array.isArray(shiftTable) && shiftTable.length > 0) {
          const activeShift = shiftTable.find(s => s.status === 'open' && !s.isClosed) || shiftTable[0];
          if (activeShift) {
            const validation = { state: 'valid', reason: 'smart-fetch', lastCheckedAt: Date.now() };
            if (posState && posState.data) {
              posState.data.shift = { ...(posState.data.shift || {}), current: activeShift, validation };
            }
            if (appRef && typeof appRef.setState === 'function') {
              appRef.setState(prev => ({
                ...prev,
                data: {
                  ...(prev.data || {}),
                  shift: {
                    ...(prev.data?.shift || {}),
                    current: activeShift,
                    validation
                  }
                }
              }));
            }
          }
          if (window.__POS_DB__ && typeof window.__POS_DB__.insert === 'function') {
            const shiftTableName = (typeof POS_TABLE_HANDLES !== 'undefined' && POS_TABLE_HANDLES.pos_shift) ? POS_TABLE_HANDLES.pos_shift : 'pos_shift';
            for (const shift of shiftTable) {
              try { await window.__POS_DB__.insert(shiftTableName, shift); } catch (e) { }
            }
          }
        }
        const headerRows = Array.isArray(fetchedTables.order_header) ? fetchedTables.order_header : [];
        const headersMap = new Map();
        headerRows.forEach(row => {
          const normalized = sanitizeOrderHeaderRow(row);
          if (!normalized) return;
          const id = String(normalized.id);
          headersMap.set(id, normalized);
        });
        realtimeOrders.headers = headersMap;
        const autoLocks = [];
        const rawTables = Array.isArray(fetchedTables.pos_table) ? fetchedTables.pos_table : (Array.isArray(fetchedTables.posTable) ? fetchedTables.posTable : []);
        for (const order of headersMap.values()) {
          const type = String(order.type || '').toLowerCase();
          if (type !== 'dine_in' && type !== 'dine-in') continue;
          const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
          const totalDue = Number(totals?.due || 0);
          const paidAmount = round((Array.isArray(order.payments) ? order.payments : []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
          const isFullyPaid = totalDue > 0 && paidAmount >= totalDue;
          let isAllLinesCompleted = false;
          try {
            const storeState = window.__POS_DB__?.store?.state;
            if (storeState) {
              const allLines = storeState.modules?.pos?.tables?.order_line || [];
              const orderLines = allLines.filter(item => String(item.orderId) === String(order.id));
              if (orderLines.length > 0) {
                isAllLinesCompleted = orderLines.every(line => line.statusId === 'completed');
              } else {
                isAllLinesCompleted = (order.lines || []).length === 0;
              }
            }
          } catch (err) {
            isAllLinesCompleted = false;
          }
          const isOrderCompleted = isAllLinesCompleted && isFullyPaid;
          if (isOrderCompleted) {
            continue;
          }
          const tids = Array.isArray(order.tableIds) ? order.tableIds :
            (order.tableId ? [order.tableId] :
              (Array.isArray(order.metadata?.tableIds) ? order.metadata.tableIds : []));
          if (Array.isArray(tids)) {
            tids.forEach(tid => {
              if (!tid) return;
              const search = String(tid).trim();
              let canonicalId = tid;
              if (rawTables.length > 0) {
                const found = rawTables.find(t => {
                  const v = String(t.id || '').trim();
                  if (v === search) return true;
                  if (v.replace(/^T0+/, 'T') === search.replace(/^T0+/, 'T')) return true;
                  if (!isNaN(v) && !isNaN(search) && Number(v) === Number(search)) return true;
                  if (String(t.code || '').trim() === search) return true;
                  if (String(t.label || '').trim() === search) return true;
                  return false;
                });
                if (found) canonicalId = found.id;
              }
              autoLocks.push({
                id: `auto-lock-${order.id}-${canonicalId}`,
                tableId: canonicalId,
                orderId: order.id,
                active: true,
                lockedAt: order.createdAt || Date.now(),
                lockedBy: order.openedBy || 'system',
                source: 'smart-fetch-auto'
              });
            });
          }
        }
        if (posState && posState.data) {
          posState.data.tableLocks = autoLocks;
        }
        if (appRef && typeof appRef.setState === 'function') {
          appRef.setState(prev => ({
            ...prev,
            data: { ...(prev.data || {}), tableLocks: autoLocks }
          }));
        }
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
        const reservationRows = Array.isArray(fetchedTables.reservations) ? fetchedTables.reservations : [];
        if (posState && posState.data) {
          posState.data.reservations = reservationRows;
        }
        if (appRef && typeof appRef.setState === 'function') {
          appRef.setState(prev => ({
            ...prev,
            data: { ...(prev.data || {}), reservations: reservationRows }
          }));
        }
      } catch (err) {
        console.error('❌ [POS][SmartFetch] CRITICAL FAILURE:', err);
        console.warn('[POS][installRealtimeOrderWatchers] Smart Fetch failed:', err.message);
        realtimeOrders.headers = new Map();
        realtimeOrders.lines = new Map();
        realtimeOrders.payments = new Map();
        scheduleRealtimeSnapshot();
      }
    };
    await fetchInitialData();
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

      scheduleRealtimeSnapshot();
    });
    const shiftTableName = POS_TABLE_HANDLES.pos_shift || 'pos_shift';
    const unsubShifts = store.watch(shiftTableName, async (rows) => {
      const globalStore = (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__);
      if (globalStore) applyShiftGuardToStore(globalStore);
      const state = globalStore?.state?.modules?.pos?.state;
      const globalTables = globalStore?.state?.modules?.pos?.tables || {};
      const globalShifts = Array.isArray(globalTables.pos_shift)
        ? globalTables.pos_shift
        : (Array.isArray(globalTables.posShift) ? globalTables.posShift : []);
      const effectiveRows = (Array.isArray(rows) && rows.length) ? rows : (globalShifts.length ? globalShifts : rows);
      const hasRemoteShift = Array.isArray(effectiveRows) && effectiveRows.length > 0;
      const now = Date.now();
      const memoryShift = state?.data?.shift?.current;
      const hasOrders = (state?.data?.ordersQueue?.length || 0) > 0 ||
        (state?.data?.ordersHistory?.length || 0) > 0 ||
        (state?.data?.order?.lines?.length || 0) > 0;
      const posDB = window.__POS_DB__;
      const localShifts = posDB && typeof posDB.listShifts === 'function'
        ? await posDB.listShifts({ posId: POS_INFO.id, limit: 50 })
        : [];
      let cookieShift = null;
      let source = 'none';
      const sessionUser = (typeof window !== 'undefined') ? window.__POS_SESSION__ : null;
      const currentUserId = sessionUser?.userId;
      if (localShifts.length > 0) {
        if (currentUserId) {
          cookieShift = localShifts.find(s => s.status === 'open' && !s.isClosed && s.cashierId === currentUserId);
          // if (!cookieShift) 
        } else {
          cookieShift = localShifts.find(s => s.status === 'open' && !s.isClosed) || localShifts[0];
        }
        if (cookieShift) source = 'simple-store';
      }
      if (!cookieShift && typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = localStorage.getItem('mishkah-pos-shift');
          if (raw) {
            const parsed = JSON.parse(raw);
            const candidate = parsed.current || parsed;
            if (!currentUserId || !candidate.cashierId || candidate.cashierId === currentUserId) {
              cookieShift = candidate;
              source = 'localStorage';
            } else {
            }
          }
        } catch (e) { }
      }
      if (!cookieShift && Array.isArray(globalShifts) && globalShifts.length) {
        if (currentUserId) {
          cookieShift = globalShifts.find(s => s.status === 'open' && !s.isClosed && s.cashierId === currentUserId);
        }
        if (!cookieShift) {
          cookieShift = globalShifts.find(s => s.status === 'open' && !s.isClosed) || globalShifts[0];
        }
        if (cookieShift) source = 'global-store';
      }
      if (!cookieShift && memoryShift && (memoryShift.pendingConfirmation || memoryShift.confirmedViaWebSocket)) {
        if (!currentUserId || memoryShift.cashierId === currentUserId) {
          cookieShift = memoryShift;
          source = 'memory-pending';
        }
      }
      if ((!cookieShift || !cookieShift.id) && !hasRemoteShift && memoryShift && !globalShifts.length) {
        console.warn('🧨 [POS][WATCH][pos_shift] Memory shift present but no storage/back-end shift - forcing reset');
        const validation = { state: 'invalid', reason: 'backend-empty', lastCheckedAt: now };
        const localUserId = (() => {
          try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            const raw = window.localStorage.getItem('mishkah_user');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed?.userID || parsed?.userId || null;
          } catch (_) {
            return null;
          }
        })();
        if (typeof store?.insert === 'function') {
          try {
            const revivedShift = SHIFT_TABLE.createRecord({
              ...memoryShift,
              id: memoryShift.id,
              posId: memoryShift.posId || POS_INFO.id,
              openedAt: memoryShift.openedAt || now,
              updatedAt: toIsoString(now),
              status: 'open',
              isClosed: false,
              userId: localUserId || memoryShift.cashierId || memoryShift.employeeId || null,
              user_id: localUserId || memoryShift.cashierId || memoryShift.employeeId || null,
              userr_insert: localUserId || memoryShift.cashierId || memoryShift.employeeId || null
            });
            await store.insert(shiftTableName, revivedShift);
            UI.pushToast(ctx, {
              title: 'تم إنشاء الوردية تلقائيا',
              message: 'تمت إعادة تسجيل الوردية في الباك',
              icon: '✅'
            });
          } catch (err) {
            console.warn('[POS][WATCH][pos_shift] Auto-create shift failed:', err);
          }
        }
        if (globalStore?.setState) {
          const keepValidation = { state: 'checking', reason: 'backend-empty', lastCheckedAt: now };
          globalStore.setState(s => ({
            ...s,
            modules: {
              ...(s.modules || {}),
              pos: {
                ...(s.modules?.pos || {}),
                state: {
                  ...(s.modules?.pos?.state || {}),
                  data: {
                    ...(s.modules?.pos?.state?.data || {}),
                    shift: {
                      ...(s.modules?.pos?.state?.data?.shift || {}),
                      current: memoryShift,
                      validation: keepValidation
                    },
                    status: {
                      ...(s.modules?.pos?.state?.data?.status || {}),
                      shiftValidation: keepValidation
                    }
                  }
                }
              }
            }
          }));
        }
        return;
      }
      if (cookieShift?.pendingConfirmation && !cookieShift.confirmedViaWebSocket) {
        const confirmedShift = (effectiveRows || []).find(row =>
          String(row.id || row.shiftId || row.shift_id) === String(cookieShift.id)
        );
        if (confirmedShift) {
          if (globalStore?.setState) {
            const validation = { state: 'valid', reason: 'websocket-confirmation', lastCheckedAt: now };
            globalStore.setState(s => ({
              ...s,
              modules: {
                ...(s.modules || {}),
                pos: {
                  ...(s.modules?.pos || {}),
                  state: {
                    ...(s.modules?.pos?.state || {}),
                    data: {
                      ...(s.modules?.pos?.state?.data || {}),
                      shift: {
                        ...(s.modules?.pos?.state?.data?.shift || {}),
                        current: {
                          ...confirmedShift,
                          pendingConfirmation: false,
                          confirmedViaWebSocket: true,
                          validationStatus: 'valid'
                        },
                        validation,
                        history: [
                          ...(s.modules?.pos?.state?.data?.shift?.history || []),
                          confirmedShift
                        ]
                      },
                      status: {
                        ...(s.modules?.pos?.state?.data?.status || {}),
                        shiftValidation: validation
                      }
                    }
                  }
                }
              }
            }));
          }
          const posDB = window.__POS_DB__;
          if (posDB && typeof posDB.insert === 'function') {
            try {
              const table = POS_TABLE_HANDLES?.posShift || POS_TABLE_HANDLES?.pos_shift || 'pos_shift';
              await posDB.insert(table, confirmedShift);
            } catch (e) {
              console.error('[POS][WATCH][pos_shift] Failed to save confirmed shift to IndexedDB:', e);
            }
          } else {
            console.warn('[POS][WATCH][pos_shift] posDB not available for IndexedDB save');
          }
          UI.pushToast(ctx, {
            title: '✅ تم فتح الوردية بنجاح',
            icon: '✅'
          });
          return;
        }
      }
      if (!cookieShift || !cookieShift.id) {
        const validation = { state: hasRemoteShift ? 'checking' : 'idle', reason: hasRemoteShift ? 'remote-only' : 'no-shift', lastCheckedAt: now };
        if (globalStore?.setState) {
          globalStore.setState(s => ({
            ...s,
            modules: {
              ...(s.modules || {}),
              pos: {
                ...(s.modules?.pos || {}),
                state: {
                  ...(s.modules?.pos?.state || {}),
                  data: {
                    ...(s.modules?.pos?.state?.data || {}),
                    shift: {
                      ...(s.modules?.pos?.state?.data?.shift || {}),
                      current: s.modules?.pos?.state?.data?.shift?.current || memoryShift || null,
                      validation
                    },
                    status: {
                      ...(s.modules?.pos?.state?.data?.status || {}),
                      shiftValidation: validation
                    }
                  }
                }
              }
            }
          }));
        }
        return;
      }
      const shiftExists = (effectiveRows || []).some(row => String(row.id || row.shiftId || row.shift_id) === String(cookieShift.id));
      if (!shiftExists) {
        console.error('❌ [POS][WATCH][pos_shift] Cookie shift does NOT exist in backend!', {
          cookieShiftId: cookieShift.id,
          backendShifts: (effectiveRows || []).map(r => r.id || r.shiftId || r.shift_id)
        });

        const graceWindowMs = 30000;
        const graceKey = String(cookieShift.id || memoryShift?.id || '');
        const graceStore = (typeof window !== 'undefined')
          ? (window.__POS_SHIFT_GRACE__ = window.__POS_SHIFT_GRACE__ || {})
          : {};
        const graceRecord = graceKey ? graceStore[graceKey] : null;
        const graceStart = graceRecord?.startedAt || now;
        const withinGrace = (now - graceStart) < graceWindowMs;
        const candidateShift = memoryShift || cookieShift;
        if (candidateShift && !candidateShift.isClosed && typeof store?.insert === 'function' && graceKey && !graceRecord?.autoCreated) {
          const localUserId = (() => {
            try {
              if (typeof window === 'undefined' || !window.localStorage) return null;
              const raw = window.localStorage.getItem('mishkah_user');
              if (!raw) return null;
              const parsed = JSON.parse(raw);
              return parsed?.userID || parsed?.userId || null;
            } catch (_) {
              return null;
            }
          })();
          try {
            const revivedShift = SHIFT_TABLE.createRecord({
              ...candidateShift,
              id: candidateShift.id || cookieShift.id,
              posId: candidateShift.posId || POS_INFO.id,
              openedAt: candidateShift.openedAt || now,
              updatedAt: toIsoString(now),
              status: 'open',
              isClosed: false,
              userId: localUserId || candidateShift.cashierId || candidateShift.employeeId || null,
              user_id: localUserId || candidateShift.cashierId || candidateShift.employeeId || null,
              userr_insert: localUserId || candidateShift.cashierId || candidateShift.employeeId || null
            });
            graceStore[graceKey] = { startedAt: graceStart, notified: graceRecord?.notified || false, autoCreated: true };
            await store.insert(shiftTableName, revivedShift);
            UI.pushToast(ctx, {
              title: 'تم إنشاء الوردية تلقائيا',
              message: 'تمت إعادة تسجيل الوردية في الباك',
              icon: '✅'
            });
            return;
          } catch (err) {
            console.warn('[POS][WATCH][pos_shift] Auto-create shift failed:', err);
          }
        }
        if (withinGrace && memoryShift && !memoryShift.isClosed) {
          if (graceKey && !graceRecord) {
            graceStore[graceKey] = { startedAt: now, notified: false };
          }
          if (graceKey && graceStore[graceKey] && !graceStore[graceKey].notified) {
            graceStore[graceKey].notified = true;
            UI.pushToast(ctx, {
              title: 'جاري التحقق من الوردية',
              message: 'لم يتم تأكيد الوردية بعد من السيرفر، سنحاول مرة أخرى',
              icon: '⏳'
            });
          }
          const validation = { state: 'checking', reason: 'backend-missing-grace', lastCheckedAt: now };
          if (typeof globalStore?.setState === 'function') {
            globalStore.setState(s => ({
              ...s,
              modules: {
                ...(s.modules || {}),
                pos: {
                  ...(s.modules?.pos || {}),
                  state: {
                    ...(s.modules?.pos?.state || {}),
                    data: {
                      ...(s.modules?.pos?.state?.data || {}),
                      shift: {
                        ...(s.modules?.pos?.state?.data?.shift || {}),
                        current: s.modules?.pos?.state?.data?.shift?.current || memoryShift,
                        validation
                      },
                      status: {
                        ...(s.modules?.pos?.state?.data?.status || {}),
                        shiftValidation: validation
                      }
                    }
                  }
                }
              }
            }));
          }
          return;
        }
        if (graceKey && graceStore[graceKey]) {
          delete graceStore[graceKey];
        }

        if (globalShifts.length) {
          const validation = { state: 'valid', reason: 'global-store', lastCheckedAt: now };
          if (typeof globalStore?.setState === 'function') {
            globalStore.setState(s => ({
              ...s,
              modules: {
                ...(s.modules || {}),
                pos: {
                  ...(s.modules?.pos || {}),
                  state: {
                    ...(s.modules?.pos?.state || {}),
                    data: {
                      ...(s.modules?.pos?.state?.data || {}),
                      shift: {
                        ...(s.modules?.pos?.state?.data?.shift || {}),
                        current: s.modules?.pos?.state?.data?.shift?.current || cookieShift,
                        validation
                      }
                    }
                  }
                }
              }
            }));
          }
          return;
        }

        const keepValidation = { state: 'checking', reason: 'backend-missing', lastCheckedAt: now };
        if (globalStore?.setState) {
          globalStore.setState(s => ({
            ...s,
            modules: {
              ...(s.modules || {}),
              pos: {
                ...(s.modules?.pos || {}),
                state: {
                  ...(s.modules?.pos?.state || {}),
                  data: {
                    ...(s.modules?.pos?.state?.data || {}),
                    shift: {
                      ...(s.modules?.pos?.state?.data?.shift || {}),
                      current: s.modules?.pos?.state?.data?.shift?.current || candidateShift || cookieShift,
                      validation: keepValidation
                    },
                    status: {
                      ...(s.modules?.pos?.state?.data?.status || {}),
                      shiftValidation: keepValidation
                    }
                  }
                }
              }
            }
          }));
        }
        console.warn('⚠️ [POS][WATCH][pos_shift] Shift missing - preserved in UI and re-sent to backend');
      } else {
        const validation = { state: 'valid', reason: 'backend-confirmed', lastCheckedAt: now };
        if (typeof globalStore?.setState === 'function') {
          globalStore.setState(s => ({
            ...s,
            modules: {
              ...(s.modules || {}),
              pos: {
                ...(s.modules?.pos || {}),
                state: {
                  ...(s.modules?.pos?.state || {}),
                  data: {
                    ...(s.modules?.pos?.state?.data || {}),
                    shift: {
                      ...(s.modules?.pos?.state?.data?.shift || {}),
                      current: s.modules?.pos?.state?.data?.shift?.current || cookieShift,
                      validation
                    }
                  }
                }
              }
            }
          }));
        }
      }
    });
    realtimeOrders.unsubscribes = [unsubHeaders, unsubLines, unsubPayments, unsubShifts].filter(Boolean);
    realtimeOrders.installed = true;
  }
  function updateRealtimeJobOrdersSnapshot() {
  }
  function scheduleRealtimeJobOrdersSnapshot() {
    if (realtimeJobOrders.pending) return;
    realtimeJobOrders.pending = true;
    Promise.resolve().then(() => {
      realtimeJobOrders.pending = false;
    });
  }
  function installRealtimeJobOrderWatchers() {
    if (realtimeJobOrders.installed) return;
    if (!realtimeJobOrders.store) return;
    const store = realtimeJobOrders.store;
    const jobHeaderTable = POS_TABLE_HANDLES.job_order_header || 'job_order_header';
    const jobDetailTable = POS_TABLE_HANDLES.job_order_detail || 'job_order_detail';
    const jobModifierTable = POS_TABLE_HANDLES.job_order_detail_modifier || 'job_order_detail_modifier';
    const jobStatusTable = POS_TABLE_HANDLES.job_order_status_history || 'job_order_status_history';
    const expoTicketTable = POS_TABLE_HANDLES.expo_pass_ticket || 'expo_pass_ticket';

    const unsubHeaders = store.watch(jobHeaderTable, (rows) => {
      logIndexedDbSample(realtimeJobOrders.debugLogged, 'job_order_header', rows, sanitizeJobOrderHeaderRow);
      realtimeJobOrders.headers.clear();
      (rows || []).forEach(row => {
        const normalized = sanitizeJobOrderHeaderRow(row);
        if (!normalized) return;
        realtimeJobOrders.headers.set(String(normalized.id), normalized);
      });
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubBatches = store.watch('job_order_batch', (rows) => {
      if (!realtimeJobOrders.batches) realtimeJobOrders.batches = new Map();
      realtimeJobOrders.batches.clear();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        realtimeJobOrders.batches.set(String(row.id), row);
      });
      scheduleRealtimeJobOrdersSnapshot();
    });
    const unsubDetails = store.watch(jobDetailTable, (rows) => {
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
  async function installRealtimeTableWatchers() {
    if (realtimeTables.installed) return;
    if (!realtimeTables.store) return;
    const store = realtimeTables.store;
    const diningTableName = 'dining_tables';
    const tableLockName = 'table_lock';
    const registeredObjects = Object.keys(store.config?.objects || {});
    if (typeof store.register === 'function') {
      if (!registeredObjects.includes(diningTableName)) {
        try {
          store.register(diningTableName, { table: 'dining_tables' });
        } catch (err) {
          console.warn('[POS][installRealtimeTableWatchers] Failed to register', diningTableName, err);
        }
      }
      if (!registeredObjects.includes(tableLockName)) {
        try {
          store.register(tableLockName, { table: 'table_lock' });
        } catch (err) {
          console.warn('[POS][installRealtimeTableWatchers] Failed to register', tableLockName, err);
        }
      }
    }
    const fetchInitialData = async () => {
      try {
        // OPTIMIZATION: Use window.database directly (already fetched via pos-simple-loader)
        const snapshot = { tables: window.database || {} };
        const fetchedTables = snapshot.tables || {};
        const tableRows = Array.isArray(fetchedTables.dining_tables) ? fetchedTables.dining_tables : [];
        const tablesMap = new Map();
        tableRows.forEach(row => {
          const normalized = sanitizeDiningTableRow(row);
          if (!normalized) return;
          const id = String(normalized.id);
          tablesMap.set(id, normalized);
        });
        realtimeTables.tables = tablesMap;
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
        applyRealtimeTablesToState();
      } catch (err) {
        console.warn('[POS][installRealtimeTableWatchers] Smart Fetch failed:', err.message);
        realtimeTables.tables = new Map();
        realtimeTables.snapshot = { tables: [], tableLocks: [] };
        applyRealtimeTablesToState();
      }
    };
    await fetchInitialData();
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

      applyRealtimeTablesToState();
    });
    realtimeTables.unsubscribes = [unsubTables, unsubLocks].filter(Boolean);

    // [SCHEDULES] - Add watcher for order_schedule
    const scheduleTableName = 'order_schedule';
    if (typeof store.register === 'function') {
      try { store.register(scheduleTableName, { table: scheduleTableName }); } catch (err) { }
    }

    // Initialize schedules map
    if (!realtimeTables.schedules) realtimeTables.schedules = new Map();

    const unsubSchedules = store.watch(scheduleTableName, (rows) => {
      const scheduleMap = new Map();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        // Basic sanitization
        const normalized = {
          ...row,
          id: String(row.id),
          scheduledAt: row.scheduled_at || row.scheduledAt,
          tableIds: row.table_ids || row.tableIds || [],
          status: row.status || 'pending',
          payload: typeof row.payload === 'string' ? tryParseJson(row.payload) : (row.payload || {})
        };
        scheduleMap.set(normalized.id, normalized);
      });
      realtimeTables.schedules = scheduleMap;

      applyRealtimeTablesToState();
    });
    realtimeTables.unsubscribes.push(unsubSchedules);

    realtimeTables.installed = true;
  }
  function computeTableLocksFromOrders() {
    const lockMap = new Map();
    const allOrders = Array.from(realtimeOrders.headers.values());
    if (allOrders.length > 0) {
      const sample = allOrders[0];

    }
    const activeOrders = allOrders.filter(order => {
      const status = (order.status || order.statusId || '').toLowerCase();
      const isActive = status === 'open' || status === 'active' || status === 'pending';
      return isActive;
    });
    activeOrders.forEach(order => {
      const tableIds = Array.isArray(order.tableIds) ? order.tableIds : [];
      tableIds.forEach(tableId => {
        const lockId = `lock-${tableId}-${order.id}`;
        if (!lockMap.has(lockId)) {
          const lock = {
            id: lockId,
            tableId: String(tableId),
            orderId: order.id,
            active: true,
            lockedAt: order.openedAt || order.createdAt || Date.now(),
            source: 'computed-from-orders'
          };
          lockMap.set(lockId, lock);
        }
      });
    });
    const locks = Array.from(lockMap.values());
    return locks;
  }
  function applyRealtimeTablesToState() {
    if (!posState || !posState.data) return;
    const tablesClone = Array.from(realtimeTables.tables.values()).map(t => ({ ...t }));
    const tableLocks = computeTableLocksFromOrders();
    const schedules = realtimeTables.schedules ? Array.from(realtimeTables.schedules.values()) : [];
    const nextData = {
      ...posState.data,
      tables: tablesClone,
      tableLocks,
      order_schedule: schedules // Expose schedules to state
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
            tableLocks: tableLocks.map(l => ({ ...l })),
            order_schedule: schedules.map(s => ({ ...s })) // Add schedules for real-time updates
          }
        };
      });
    }
  }

  function installRealtimeSchedulesWatch(store) {
    if (!store || typeof store.watch !== 'function') {
      console.warn('[POS][realtimeSchedules] Store not available for watch');
      return;
    }
    if (realtimeSchedules.installed) {

      return;
    }

    // Watch order_schedule
    const scheduleTableName = 'order_schedule';
    if (typeof store.register === 'function') {
      try { store.register(scheduleTableName, { table: scheduleTableName }); } catch (err) { }
    }

    const unsubSchedules = store.watch(scheduleTableName, (rows) => {
      const scheduleMap = new Map();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        const normalized = {
          ...row,
          id: String(row.id),
          scheduledAt: row.scheduled_at || row.scheduledAt,
          tableIds: row.table_ids || row.tableIds || [],
          status: row.status || 'pending',
          payload: typeof row.payload === 'string' ? tryParseJson(row.payload) : (row.payload || {})
        };
        scheduleMap.set(normalized.id, normalized);
      });
      realtimeSchedules.schedules = scheduleMap;

      updateRealtimeSchedulesSnapshot();
    });

    // Watch order_schedule_line
    const scheduleLinesTable = 'order_schedule_line';
    if (typeof store.register === 'function') {
      try { store.register(scheduleLinesTable, { table: scheduleLinesTable }); } catch (err) { }
    }

    const unsubScheduleLines = store.watch(scheduleLinesTable, (rows) => {
      const linesMap = new Map();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        linesMap.set(String(row.id), { ...row });
      });
      realtimeSchedules.lines = linesMap;

      updateRealtimeSchedulesSnapshot();
    });

    // Watch order_schedule_tables
    const scheduleTablesTable = 'order_schedule_tables';
    if (typeof store.register === 'function') {
      try { store.register(scheduleTablesTable, { table: scheduleTablesTable }); } catch (err) { }
    }

    const unsubScheduleTables = store.watch(scheduleTablesTable, (rows) => {
      const tablesMap = new Map();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        tablesMap.set(String(row.id), { ...row });
      });
      realtimeSchedules.tables = tablesMap;

      updateRealtimeSchedulesSnapshot();
    });

    // Watch order_schedule_payment
    const schedulePaymentsTable = 'order_schedule_payment';
    if (typeof store.register === 'function') {
      try { store.register(schedulePaymentsTable, { table: schedulePaymentsTable }); } catch (err) { }
    }

    const unsubSchedulePayments = store.watch(schedulePaymentsTable, (rows) => {
      const paymentsMap = new Map();
      (rows || []).forEach(row => {
        if (!row || !row.id) return;
        paymentsMap.set(String(row.id), { ...row });
      });
      realtimeSchedules.payments = paymentsMap;

      updateRealtimeSchedulesSnapshot();
    });

    realtimeSchedules.unsubscribes = [unsubSchedules, unsubScheduleLines, unsubScheduleTables, unsubSchedulePayments].filter(Boolean);
    realtimeSchedules.installed = true;
    realtimeSchedules.ready = true;

  }

  function updateRealtimeSchedulesSnapshot() {
    const schedules = Array.from(realtimeSchedules.schedules.values());
    const active = schedules.filter(s => s.status !== 'cancelled' && s.status !== 'converted');
    const lines = Array.from(realtimeSchedules.lines.values());
    const tables = Array.from(realtimeSchedules.tables.values());
    const payments = Array.from(realtimeSchedules.payments.values());

    realtimeSchedules.snapshot = {
      schedules,
      active,
      lines,
      tables,
      payments
    };

    // Push to UI state
    if (posState && posState.data) {
      posState.data.order_schedule = schedules.map(s => ({ ...s }));
      posState.data.order_schedule_line = lines.map(l => ({ ...l }));
      posState.data.order_schedule_tables = tables.map(t => ({ ...t }));
      posState.data.order_schedule_payment = payments.map(p => ({ ...p }));
    }

    if (appRef && typeof appRef.setState === 'function') {
      appRef.setState(prev => {
        const prevData = prev.data || {};
        return {
          ...prev,
          data: {
            ...prevData,
            order_schedule: schedules.map(s => ({ ...s })),
            order_schedule_line: lines.map(l => ({ ...l })),
            order_schedule_tables: tables.map(t => ({ ...t })),
            order_schedule_payment: payments.map(p => ({ ...p }))
          }
        };
      });
    }
  }

  function getRealtimeSchedulesSnapshot() {
    return {
      ...realtimeSchedules.snapshot,
      ready: realtimeSchedules.ready
    };
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
  function applyKdsOrderSnapshotNow(payload = {}, meta = {}) {
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
          console.warn('[Mishkah][POS] temp order watcher failed', err);
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
    // 🛡️ FRONTEND CLEANUP: Removed "silly" API sequence request as per user instruction.
    // The backend now handles sequence generation and auto-repair/collision detection.
    // We fall back to standard offline-friendly ID generation here.

    if (!ACTIVE_BRANCH_ID) {
      throw new Error('Branch id is required for invoice allocation');
    }

    // Default offline ID generation
    const prefix = (POS_INFO && POS_INFO.prefix) || 'POS';
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    // We intentionally do NOT call the sequence API here anymore.
    // The backend's savePosOrder or saveSchedule will unify the sequence.
    return `${prefix}-${timestamp}-${random}`;
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

  } else {

  }
  const kdsToken = MOCK_BASE?.kds?.token || null;
  if (!kdsToken) {

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
  const kdsSyncHandlers = {
    onOrders: handleKdsOrderPayload,
    onJobUpdate: handleKdsJobUpdate,
    onDeliveryUpdate: handleKdsDeliveryUpdate,
    onHandoffUpdate: handleKdsHandoffUpdate
  };
  const kdsSync = null;
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
        if (enriched.isPersisted === true) {
          return { ...enriched, isPersisted: true };
        }
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

    // ✅ CRITICAL FIX: Draft orders (new orders) should NEVER be locked
    // Ghost error occurred when starting new order after saving old one
    if (order.id && String(order.id).startsWith('draft-')) return false;

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
      console.warn('[POS] Skipping line without item id', raw);
      return null;
    }
    const itemId = String(rawItemId);
    const menuItem = menuIndex?.get(String(itemId));
    const qty = Math.max(1, Number(raw.qty || raw.quantity) || 1);
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
      item_id: itemId,
      Item_Id: itemId,
      name: menuItem ? menuItem.name : cloneName(raw.name),
      description: menuItem ? menuItem.description : cloneName(raw.description),
      qty,
      price: round(price),
      basePrice: round(basePrice),
      total: round(total),
      status: statusId,
      stage: stageId,
      kitchenSection,
      kitchenSectionId: kitchenSection,
      kitchen_section_id: kitchenSection,
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
    return [];
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
  const sessionUser = (typeof window !== 'undefined' && window.__POS_SESSION__) || {};
  const sessionPinCode = normalizePinValue(sessionUser.pinCode);
  const defaultCashier = employees.find(emp => emp.role === 'cashier') || employees[0] || {
    id: sessionUser.userId || 'cashier-guest',
    name: sessionUser.userName || 'كاشير',
    role: 'cashier',
    pin: sessionPinCode || normalizePinValue(SHIFT_PIN_FALLBACK || '1122'),
    allowedDiscountRate: 0
  };
  if (sessionUser.userId && sessionPinCode && !employees.find(emp => emp.id === sessionUser.userId)) {
    employees.unshift({
      id: sessionUser.userId,
      name: sessionUser.userName || sessionUser.userEmail || 'كاشير',
      role: 'cashier',
      pin: sessionPinCode,
      allowedDiscountRate: 0,
      isSessionUser: true
    });
  }
  const cashier = defaultCashier;
  if (typeof window !== 'undefined' && window.console) {
    console.group('[Mishkah][POS] 🚀 INITIAL DATA LOAD - COMPLETE STRUCTURE');
    console.table(employees.map(emp => ({ id: emp.id, name: emp.name, role: emp.role, pin: emp.pin, fallback: emp.isFallback || false })));
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
      console.warn('[Mishkah][POS] temp order load failed', error);
    }
  }
  function getScheduleDataFromStore(scheduleId) {
    const storeTables = (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables) || {};
    const schedules = storeTables.order_schedule || [];
    const lines = storeTables.order_schedule_line || [];
    const payments = storeTables.order_schedule_payment || [];
    const links = storeTables.order_schedule_tables || [];
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;
    const payload = typeof schedule.payload === 'string' ? tryParseJson(schedule.payload) : (schedule.payload || {});
    const scheduleLines = lines.filter(line => line.scheduleId === scheduleId || line.schedule_id === scheduleId);
    const schedulePayments = payments.filter(pmt => pmt.scheduleId === scheduleId || pmt.schedule_id === scheduleId);
    const scheduleLinks = links.filter(link => link.scheduleId === scheduleId || link.schedule_id === scheduleId);
    return { schedule, payload, scheduleLines, schedulePayments, scheduleLinks };
  }

  function buildDraftOrderFromSchedule(scheduleId) {
    const data = getScheduleDataFromStore(scheduleId);
    if (!data) return null;
    const { schedule, payload, scheduleLines, schedulePayments, scheduleLinks } = data;
    const orderLines = scheduleLines.length
      ? scheduleLines.map(line => {
        const parsedName = typeof line.item_name === 'string'
          ? (line.item_name.startsWith('{') || line.item_name.startsWith('"')
            ? tryParseJson(line.item_name) || line.item_name
            : line.item_name)
          : line.item_name;
        return {
          id: line.id,
          itemId: line.itemId || line.item_id,
          name: parsedName || line.itemName,
          qty: line.quantity,
          quantity: line.quantity,
          unitPrice: line.unitPrice || line.unit_price,
          price: line.unitPrice || line.unit_price,
          total: line.lineTotal || line.line_total || (line.quantity * (line.unitPrice || line.unit_price)),
          notes: line.notes || '',
          status: 'draft',
          stage: 'new'
        };
      })
      : (payload.lines || []);
    const paymentsSplit = schedulePayments.map(pmt => ({
      id: pmt.id || `pm-${Date.now()}`,
      method: pmt.methodId || pmt.method_id || 'cash',
      amount: round(Number(pmt.amount) || 0)
    })).filter(entry => entry.amount > 0);
    const tableIds = scheduleLinks.map(link => link.tableId || link.table_id).filter(Boolean);
    const orderType = schedule.order_type || schedule.type || payload.orderType || 'dine_in';
    return {
      id: createDraftOrderId(),
      type: orderType,
      status: 'open',
      isPersisted: false,
      customerId: schedule.customerId || schedule.customer_id,
      customerAddressId: schedule.customerAddressId || schedule.customer_address_id,
      lines: orderLines,
      totals: payload.totals || {},
      discount: payload.discount || null,
      payments: paymentsSplit,
      tableIds: tableIds.length ? tableIds : (payload.tableIds || []),
      metadata: {
        ...(payload.metadata || {}),
        sourceScheduleId: schedule.id,
        scheduledAt: schedule.scheduled_at || schedule.scheduledAt || null,
        duration: schedule.duration_minutes || schedule.duration || 60
      }
    };
  }
  async function convertScheduleToOrder(ctx, scheduleId, options = {}) {
    const state = ctx.getState();
    const t = getTexts(state);
    const draft = buildDraftOrderFromSchedule(scheduleId);
    if (!draft) {
      UI.pushToast(ctx, { title: 'تعذر فتح الحجز', message: 'الحجز غير موجود', icon: '🛑' });
      return null;
    }
    const currentShift = state.data.shift?.current;
    if (!currentShift || !currentShift.id) {
      UI.pushToast(ctx, { title: t.toast.shift_required || 'يجب فتح الوردية قبل التأكيد', icon: '🔒' });
      ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showPin: true, pin: '' } } }));
      return null;
    }
    const totals = draft.totals || calculateTotals(draft.lines || [], state.data.settings || {}, draft.type || 'dine_in', { orderDiscount: draft.discount });
    const hasPaid = Array.isArray(draft.payments) && draft.payments.some(entry => Number(entry.amount || 0) > 0);
    const paymentState = hasPaid ? 'partial' : 'unpaid';
    const orderPayload = {
      ...draft,
      id: createDraftOrderId(),
      status: 'open',
      fulfillmentStage: 'new',
      paymentState,
      shiftId: currentShift.id,
      scheduleId,
      sourceScheduleId: null,
      isPersisted: false,
      totals,
      metadata: {
        ...(draft.metadata || {}),
        scheduleId,
        sourceScheduleId: scheduleId,
        isSchedule: false,
        scheduleStatus: 'converted'
      }
    };
    if (!posDB || !posDB.available || typeof posDB.saveOrder !== 'function') {
      throw new Error('Order save not available');
    }
    const saved = await posDB.saveOrder(orderPayload);
    const orderId = saved?.persistedId || saved?.id;
    if (!orderId) {
      throw new Error('فشل إنشاء الطلب من الحجز');
    }
    try {
      const branchId = state.data.branch?.id || window.__POS_BRANCH_ID__ || 'default';
      const moduleId = state.data.module?.id || 'pos';
      await fetch(
        `/api/branches/${branchId}/modules/${moduleId}/schedule/${scheduleId}/confirm`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, statusOnly: true }) }
      );
    } catch (statusError) {
      console.warn('[POS] Failed to update schedule status after confirm', statusError);
    }
    updateScheduleStatusInStores(scheduleId, 'converted');
    return { orderId, orderPayload };
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
  const initialShiftValidation = {
    state: 'idle',
    reason: 'no-shift',
    lastCheckedAt: null
  };
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
        initialShiftValidation.state = 'checking';
        initialShiftValidation.reason = 'idb-hydration';
        initialShiftValidation.lastCheckedAt = Date.now();
      }
      const listed = await posDB.listShifts({ posId: POS_INFO.id, limit: 50 });
      shiftHistoryFromDb = Array.isArray(listed) && listed.length
        ? listed.filter(shift => !activeShift || shift.id !== activeShift.id)
        : shiftHistoryFromDb;
    } catch (error) {
      console.warn('[Mishkah][POS] shift hydration failed', error);
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
        id: cashier.id || sessionUser.userId || 'cashier-guest',
        name: cashier.name || cashier.full_name || sessionUser.userName || 'كاشير',
        role: cashier.role || 'cashier',
        allowedDiscountRate: typeof cashier.allowedDiscountRate === 'number' ? cashier.allowedDiscountRate : 0,
        shift: activeShift?.id || '—',
        shiftNo: activeShift ? activeShift.id : '#103'
      },
      status: {
        indexeddb: { state: posDB.available ? 'idle' : 'offline', lastSync: null },
        kds: { state: 'idle', endpoint: DEFAULT_KDS_ENDPOINT },
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
        current: activeShift ? { ...activeShift } : null,
        history: shiftHistoryFromDb,
        validation: initialShiftValidation,
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
      reservations: { filter: 'today', status: 'pending', editing: null, form: null },
      print: { docType: 'customer', size: 'thermal_80', showPreview: false, showAdvanced: false, managePrinters: false, newPrinterName: '' },
      orders: { tab: 'all', search: '', sort: { field: 'updatedAt', direction: 'desc' } },
      shift: { showPin: false, pin: '', openingFloat: SHIFT_OPEN_FLOAT_DEFAULT, showSummary: false, viewShiftId: null, activeTab: 'summary', confirmClose: false },
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
    if (debugEmployees.length) {
      console.table(debugEmployees);
    } else {
    }
    console.groupEnd();
  }
  fetchPosSchemaFromBackend().finally(() => {
    if (window.__POS_DB__ && typeof window.__POS_DB__.watch === 'function') {
      realtimeOrders.store = window.__POS_DB__;
      realtimeJobOrders.store = window.__POS_DB__;
      realtimeTables.store = window.__POS_DB__;
    } else {
      console.warn('⚠️ [POS V2] window.__POS_DB__ not available or missing watch function');
    }
    installRealtimeOrderWatchers();
    installRealtimeJobOrderWatchers();
    installRealtimeTableWatchers();
    if (realtimeSchedules.store) {
      installRealtimeSchedulesWatch(realtimeSchedules.store);
    }
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
      const getMishkahUserId = () => {
        if (typeof window === 'undefined') return null;
        try {
          const raw = window.localStorage?.getItem('mishkah_user');
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.userID || null;
        } catch (_err) {
          return null;
        }
      };
      const getStoreShifts = () => {
        if (typeof window === 'undefined') return [];
        return window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables?.pos_shift || [];
      };
      const isShiftOpen = (shift) => {
        if (!shift) return false;
        if (shift.isClosed === true) return false;
        if (shift.closedAt) return false;
        const status = String(shift.status || '').toLowerCase();
        return status === 'open' || status === '';
      };
      const matchShiftUser = (shift, userId) => {
        if (!userId) return false;
        return shift.metadata?.userID === userId;
      };
      const pickLatestShift = (list) => {
        const sorted = list.slice().sort((a, b) => {
          const av = new Date(a.updatedAt || a.openedAt || 0).getTime();
          const bv = new Date(b.updatedAt || b.openedAt || 0).getTime();
          return bv - av;
        });
        return sorted[0] || null;
      };

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
      const currentUserId = getMishkahUserId();
      shiftListRaw = getStoreShifts().filter(shift => matchShiftUser(shift, currentUserId));
      if (Array.isArray(shiftListRaw) && shiftListRaw.length) {
        const openForUser = shiftListRaw.filter(shift => isShiftOpen(shift));
        activeShiftRaw = pickLatestShift(openForUser);
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
        const filteredSummarySource = summarySource.filter(order => order.shiftId === sanitizedActive.id);
        const activeSummary = summarizeShiftOrders(filteredSummarySource, sanitizedActive);
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
      const previousValidation = previousData?.shift?.validation || { state: 'idle', reason: 'no-shift', lastCheckedAt: null };
      const validationStamp = Date.now();
      const nextValidation = currentShift
        ? { state: previousValidation.state === 'valid' ? 'valid' : 'checking', reason: 'idb-hydration', lastCheckedAt: validationStamp }
        : { state: 'idle', reason: 'no-shift', lastCheckedAt: validationStamp };
      const nextData = {
        ...previousData,
        shift: {
          ...(previousData.shift || {}),
          current: currentShift,
          history,
          validation: nextValidation
        },
        user: {
          ...(previousData.user || {}),
          shift: currentShift?.id || '—',
          shiftNo: currentShift?.id || '—'
        },
        order: {
          ...(previousData.order || {}),
          shiftId: currentShift?.id || null
        },
        status: {
          ...(previousData.status || {}),
          indexeddb: { state: posDB.available ? 'online' : 'offline', lastSync: Date.now() },
          shiftValidation: nextValidation
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
      console.warn('[Mishkah][POS] refreshPersistentSnapshot failed', error);
      return null;
    }
  }
  function getOrderTypeConfig(type) {
    return ORDER_TYPES.find(o => o.id === type) || ORDER_TYPES[0];
  }
  function normalizeSaveMode(value, orderType) {
    const base = (value || '').toString().toLowerCase();
    switch (base) {
      case 'save-only':
      case 'draft':
      case 'save-draft':
      case 'save':
        return 'save';
      case 'finalize-print':
      case 'finish-print':
        return 'finalize-print';
      case 'finalize':
      case 'finish':
        return 'finalize';
      case 'save-print':
        return orderType === 'dine_in' ? 'save' : 'finalize-print';
      default:
        return base || 'save';
    }
  }
  async function postModuleTableRecord(tableName, record) {
    if (!window?.basedomain) return null;
    if (!ACTIVE_BRANCH_ID || !MODULE_ID || !tableName) return null;
    const endpoint = `${window.basedomain}/api/v1/crud/${encodeURIComponent(tableName)}?branch=${encodeURIComponent(ACTIVE_BRANCH_ID)}&module=${encodeURIComponent(MODULE_ID)}`;
    const payload = { ...(record && typeof record === 'object' ? record : {}) };
    if (!payload.branchId && !payload.branch_id) {
      payload.branchId = ACTIVE_BRANCH_ID;
      payload.branch_id = ACTIVE_BRANCH_ID;
    }
    if (!payload.moduleId && !payload.module_id) {
      payload.moduleId = MODULE_ID;
      payload.module_id = MODULE_ID;
    }
    if (payload.job_order_id && !payload.jobOrderId) payload.jobOrderId = payload.job_order_id;
    if (payload.jobOrderId && !payload.job_order_id) payload.job_order_id = payload.jobOrderId;
    if (payload.order_id && !payload.orderId) payload.orderId = payload.order_id;
    if (payload.orderId && !payload.order_id) payload.order_id = payload.orderId;
    if (!payload.id && (payload.jobOrderId || payload.job_order_id)) {
      payload.id = payload.jobOrderId || payload.job_order_id;
    }
    const requiredIdentifiers = {
      job_order_header: ['jobOrderId', 'orderId'],
      job_order_detail: ['jobOrderId'],
      job_order_status_history: ['jobOrderId'],
      job_order_batch: ['orderId']
    };
    const required = requiredIdentifiers[tableName];
    if (required) {
      const missing = required.filter((key) => payload[key] == null || payload[key] === '');
      if (missing.length) {
        console.warn(`[POS] REST ${tableName} missing identifiers`, {
          id: payload.id,
          jobOrderId: payload.jobOrderId,
          orderId: payload.orderId,
          missing
        });
      }
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ record: payload })
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.warn(`[POS] REST ${tableName} failed`, {
          status: response.status,
          statusText: response.statusText,
          body: text
        });
        throw new Error(text || `Request failed (${response.status})`);
      }
      try {
        return await response.json();
      } catch (parseErr) {
        console.warn(`[POS] REST ${tableName} response not JSON`, parseErr);
        return {};
      }
    } catch (err) {
      console.warn(`[POS] REST fallback failed for ${tableName}:`, err);
      return null;
    }
  }
  async function persistOrderFlow(ctx, rawMode, options = {}) {
    // 🛡️ CRITICAL: Prevent concurrent save attempts (stronger than time-based debouncing)
    if (typeof window !== 'undefined') {
      if (window.__ORDER_SAVE_IN_PROGRESS__) {
        console.warn('🛡️ [CONCURRENT BLOCK] Save already in progress - rejecting duplicate attempt');
        UI.pushToast(ctx, {
          title: 'جاري الحفظ...',
          subtitle: 'يرجى الانتظار',
          icon: '⏳'
        });
        return { status: 'blocked', reason: 'save-in-progress' };
      }

      window.__ORDER_SAVE_IN_PROGRESS__ = true;

    }

    let state = null;
    let t = null;
    try {
      state = ctx.getState();
      t = getTexts(state);

      const retryCount = options.retryCount || 0;
      const MAX_RETRIES = 3;
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
        return { status: 'error', reason: 'shift-required' };
      }
      if (!currentShift || !currentShift.id) {
        console.error('[Mishkah][POS] Active shift missing ID', currentShift);
        const db = ctx.getState();
        if (db.data.shift?.current?.id) {
          currentShift.id = db.data.shift.current.id;
          console.warn('⚠️ [persistOrderFlow] Recovered shift ID from db.data');
        } else {
          UI.pushToast(ctx, { title: t.toast.shift_error || 'خطأ في بيانات الوردية', icon: '⚠️' });
          return { status: 'error', reason: 'shift-id-missing' };
        }
      }
      let order = state.data.order || {};
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

      const lines = order.lines || [];
      const validLines = lines.filter(line => !line.cancelled && !line.voided);
      if (!validLines.length) {
        console.error('❌ [POS V2] BLOCKED: Cannot save empty order - no valid lines!');
        UI.pushToast(ctx, {
          title: t.toast.empty_order || 'لا يمكن حفظ طلب فارغ',
          subtitle: 'يجب إضافة صنف واحد على الأقل',
          icon: '⚠️'
        });
        return { status: 'error', reason: 'empty-order' };
      }
      if (order.isPersisted && !order.dirty && rawMode === 'draft') {
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
      const requiresPayment = (mode === 'finalize' || mode === 'finalize-print');
      const openPrint = mode === 'finalize-print';
      const assignedTables = Array.isArray(order.tableIds) ? order.tableIds.filter(Boolean) : [];
      if (orderType === 'dine_in' && assignedTables.length === 0) {
        UI.pushToast(ctx, { title: t.toast.order_table_required || t.ui.select_table, icon: '⚠️' });
        return { status: 'error', reason: 'table-required' };
      }
      if (orderType === 'delivery') {
        const stateOrder = state.data.order || {};
        const customerId = stateOrder.customerId || stateOrder.customer?.id || order.customerId || order.customer?.id || null;
        const addressId = order.customerAddressId || null;
        if (!customerId || !addressId) {
          console.warn('❌ [persistOrderFlow] BLOCKED: Delivery order missing customer/address', {
            type: orderType,
            customerId,
            addressId,
            stateCustomer: stateOrder.customer,
            orderCustomer: order.customer
          });
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
            console.warn('[Mishkah][POS] Failed to fetch order after conflict', fetchError);
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
      if (order.isPersisted) {

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
        if (orderType === 'dine_in') {
          const currentLines = order.lines || [];
          const newLinesOnly = currentLines.filter(line => {
            const isNew = !line.isPersisted ||
              (line.id && (line.id.startsWith('ln-') || line.id.startsWith('temp-')));
            return isNew;
          });

          if (newLinesOnly.length === 0 && !finalize) {
            console.warn('[POS V2] ⚠️ No new lines to save for persisted dine_in order');
            UI.pushToast(ctx, {
              title: t.toast.no_new_lines || 'لا توجد أصناف جديدة',
              subtitle: 'لم يتم إضافة أصناف جديدة للطلب',
              icon: 'ℹ️'
            });
            return { status: 'no-changes', reason: 'no-new-lines' };
          }
          order = {
            ...order,
            lines: newLinesOnly
          };
        }
      }
      const now = Date.now();
      let missingItemLine = null;
      let missingKitchenLine = null;
      let safeLines = (order.lines || []).map(line => {

        const sanitizedLine = normalizeOrderLine(line, { orderId: order.id, createdAt: now, updatedAt: now });

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
            console.warn('[Mishkah][POS] Line missing kitchenSection, using expo', {
              lineId: line.id,
              itemId: sanitizedLine?.itemId,
              name: line.name
            });
            missingKitchenLine = line;
          }
        }
        return {
          ...sanitizedLine,
          locked: true,
          status: sanitizedLine?.status || 'draft',
          statusId: sanitizedLine?.statusId || sanitizedLine?.status || 'draft',
          status_id: sanitizedLine?.status_id || sanitizedLine?.statusId || sanitizedLine?.status || 'draft',
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
        console.warn('[Mishkah][POS] Continuing save with expo as default kitchen section');
      }
      if (!safeLines.length) {
        console.error('[Mishkah][POS] Cannot save order with no lines');
        UI.pushToast(ctx, { title: t.toast.order_empty || 'لا يمكن حفظ طلب فارغ', icon: '⚠️' });
        return { status: 'error', reason: 'order-empty' };
      }
      const totals = calculateTotals(safeLines, state.data.settings || {}, orderType, { orderDiscount: order.discount });
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
      const existingPaymentIds = new Set(
        (order.isPersisted && Array.isArray(order.payments))
          ? order.payments.map(pay => pay.id).filter(Boolean)
          : []
      );
      const newPaymentsOnly = paymentSplit.filter(pay => !existingPaymentIds.has(pay.id));
      const allPayments = order.isPersisted
        ? [...(order.payments || []), ...newPaymentsOnly]
        : paymentSplit;

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
            paymentDraft: { ...(s.ui?.paymentDraft || {}), amount: '', method: s.data.payments?.activeMethod || 'cash' },
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
      let finalOrderId = previousOrderId;
      const isDraftId = previousOrderId && String(previousOrderId).startsWith('draft-');
      const needsNewId = !previousOrderId || previousOrderId === '' || previousOrderId === 'undefined' || isDraftId;
      if (needsNewId) {

        try {
          finalOrderId = await allocateInvoiceId();

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

      }
      const idChanged = previousOrderId !== finalOrderId;
      const primaryTableId = assignedTables.length ? assignedTables[0] : (order.tableId || null);
      const isUpdateCandidate = order.isPersisted || (!isDraftId && previousOrderId && currentVersion > 0);
      const outgoingVersion = (idChanged || isDraftId)
        ? 1
        : (isUpdateCandidate && Number.isFinite(currentVersion) && currentVersion > 0
          ? Math.trunc(currentVersion) + 1
          : 1);

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
        shift_id: currentShift.id,
        fullId: finalOrderId,
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
        tableIds: assignedTables,
        table_ids: assignedTables,
        serviceMode: orderType,
        version: outgoingVersion,
        currentVersion: outgoingVersion,
        expectedVersion: outgoingVersion,
        paymentsLocked: finalize ? true : isPaymentsLocked(order),
        allowAdditions,
        lockLineEdits: finalize ? true : (order.lockLineEdits !== undefined ? order.lockLineEdits : false),
        customerId: state.data.order?.customerId || order.customerId || null,
        customer_id: state.data.order?.customerId || order.customerId || null,
        customerAddressId: state.data.order?.customerAddressId || order.customerAddressId || null,
        customer_address_id: state.data.order?.customerAddressId || order.customerAddressId || null,
        customerName: state.data.order?.customerName || order.customerName || '',
        customer_name: state.data.order?.customerName || order.customerName || '',
        customerPhone: state.data.order?.customerPhone || order.customerPhone || '',
        customer_phone: state.data.order?.customerPhone || order.customerPhone || '',
        customerAddress: state.data.order?.customerAddress || order.customerAddress || '',
        customer_address: state.data.order?.customerAddress || order.customerAddress || '',
        customerAreaId: state.data.order?.customerAreaId || order.customerAreaId || null,
        customer_area_id: state.data.order?.customerAreaId || order.customerAreaId || null,
        metadata: {
          ...(order.metadata || {}),
          orderType,
          orderTypeId: orderType,
          serviceMode: orderType,
          tableIds: assignedTables,
          notes: orderNotes,
          notes_json: JSON.stringify(orderNotes),
          // 🛡️ URGENT: Redundant Customer Data (User Request to prevent "Lost IDs")
          customer: {
            id: state.data.order?.customerId || order.customerId || null,
            name: state.data.order?.customerName || order.customerName || '',
            phone: state.data.order?.customerPhone || order.customerPhone || '',
            addressId: state.data.order?.customerAddressId || order.customerAddressId || null,
            address: state.data.order?.customerAddress || order.customerAddress || '',
            areaId: state.data.order?.customerAreaId || order.customerAreaId || null
          },
          // Mirror for delivery context if needed
          delivery: {
            customerId: state.data.order?.customerId || order.customerId || null,
            addressId: state.data.order?.customerAddressId || order.customerAddressId || null,
            driverId: state.data.order?.driverId || order.driverId || null
          }
        }
      };

      if (finalize) {
        orderPayload.finalizedAt = now;
        orderPayload.finishedAt = now;
      }
      if (Number.isFinite(outgoingVersion)) {
        orderPayload.metadata = { ...(orderPayload.metadata || {}) };
        orderPayload.metadata.version = Math.trunc(outgoingVersion);
      }

      const persistableOrder = { ...orderPayload };
      delete persistableOrder.dirty;

      let savedOrder = null;
      let saveOrderSuccess = false;
      try {
        savedOrder = await posDB.saveOrder(persistableOrder);
        saveOrderSuccess = true;

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
          console.warn('[Mishkah][POS] 409 VERSION CONFLICT detected', {
            isDraftId,
            previousOrderId,
            finalOrderId,
            idChanged,
            willRefresh: !isDraftId && !idChanged
          });
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
            return await persistOrderFlow(ctx, rawMode, { ...options, retryCount: (options.retryCount || 0) + 1 });
          }
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
      const persistedId = savedOrder?.persistedId || savedOrder?.id || savedOrder?.fullId || null;
      if (persistedId) {
        if (savedOrder && savedOrder.id !== persistedId) {
          savedOrder.id = persistedId;
          savedOrder.fullId = savedOrder.fullId || persistedId;
        }
        if (persistedId !== orderPayload.id) {
          orderPayload.id = persistedId;
          orderPayload.fullId = orderPayload.fullId || persistedId;
        }
      }
      if (posDB.available && typeof posDB.deleteTempOrder === 'function') {
        try { await posDB.deleteTempOrder(orderPayload.id); } catch (_tempErr) { }
        if (idChanged && previousOrderId) {
          try { await posDB.deleteTempOrder(previousOrderId); } catch (_tempErr) { }
        }
      }
      const store = window.__POS_DB__;
      const kdsOrderPayload = savedOrder && typeof savedOrder === 'object'
        ? mergePreferRemote(orderPayload, savedOrder)
        : orderPayload;
      if (persistedId && kdsOrderPayload?.id !== persistedId) {
        kdsOrderPayload.id = persistedId;
        kdsOrderPayload.fullId = kdsOrderPayload.fullId || persistedId;
      }
      const retryWithBackoff = async (operation, operationName, maxRetries = 3, allowRetryOnTimeout = true) => {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await operation();
            if (attempt > 0) {
            }
            return { success: true, result };
          } catch (err) {
            lastError = err;
            const isTimeout = err?.message?.includes('timed out');
            const isInsertOperation = operationName.toUpperCase().startsWith('INSERT');
            if (isTimeout && isInsertOperation) {
              console.warn(`⚠️ [POS V2] ${operationName} timed out - NOT retrying (INSERT operations are not idempotent)`);
              break;
            }
            if (isTimeout && allowRetryOnTimeout && attempt < maxRetries) {
              const delayMs = Math.pow(2, attempt) * 1000;
              console.warn(`⏱️ [POS V2] ${operationName} timed out (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`);
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
        const effectiveOrderId = kdsOrderPayload?.id || orderPayload.id;
        const isDraftKdsId = effectiveOrderId && String(effectiveOrderId).startsWith('draft-');
        if (!effectiveOrderId || isDraftKdsId) {
          console.warn('[POS V2] ⚠️ Skipping KDS payload: order id not persisted yet.', {
            effectiveOrderId,
            isDraftKdsId,
            savedOrderId: savedOrder?.id,
            persistedId
          });
        }
        const kdsPayload = (!effectiveOrderId || isDraftKdsId)
          ? null
          : await serializeOrderForKDS(kdsOrderPayload, state);

        if (kdsPayload && kdsPayload.job_order_header) {

          const isPersistedOrder = order.isPersisted === true;
          const hasOnlyNewItems = kdsPayload?.isReopenedOrder || false;
          const firstJob = kdsPayload?.job_order_header?.[0];
          if (firstJob && firstJob.batchId) {
            const batchId = firstJob.batchId;
            const batchJobs = kdsPayload.job_order_header.filter(j => j.batchId === batchId);
            const batchType = isPersistedOrder ? 'addition' : 'initial';
            const batchRecord = {
              id: batchId,
              orderId: kdsOrderPayload.id || orderPayload.id,
              orderNumber: kdsOrderPayload.orderNumber || kdsOrderPayload.number || orderPayload.orderNumber || orderPayload.number || 'N/A',
              status: 'queued',
              version: 1,
              totalJobs: batchJobs.length,
              readyJobs: 0,
              batchType: batchType,
              assembledAt: null,
              servedAt: null,
              notes: null,
              meta: {
                createdBy: 'posv2',
                orderType: kdsOrderPayload.orderTypeId || kdsOrderPayload.type || orderPayload.orderTypeId || orderPayload.type || 'dine_in',
                tableLabel: kdsOrderPayload.tableLabel || orderPayload.tableLabel || null
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            kdsPayload.job_order_batch = [batchRecord];
          }
          if (kdsPayload.order_header && kdsPayload.order_header.length > 0) {

          }
          const existingOrderHeaders = window.database?.order_header || [];
          const existingOrderHeader = existingOrderHeaders.find(h => String(h.id) === String(order.id));
          const forceRestFallback = !(store && store.connected === true);
          if (forceRestFallback) {
            console.warn('[POS] Store not connected; forcing REST fallback for KDS inserts.');
          }
          Promise.all([
            ...(hasOnlyNewItems ? [] : (kdsPayload?.order_header || []).map(orderHeader => {
              if (isPersistedOrder && typeof store.update === 'function') {
                const currentVersion = existingOrderHeader?.version || order.version || order.currentVersion || 1;
                const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;
                if (!Number.isFinite(nextVersion) || nextVersion < 1) {
                  console.error('❌ [POS V2] FATAL: Cannot update order_header without valid version!', {
                    orderId: orderHeader.id,
                    currentVersion,
                    nextVersion,
                    existingOrderHeader: !!existingOrderHeader,
                    fallbackToInsert: false
                  });
                  return Promise.resolve({
                    success: false,
                    error: new Error(`Missing valid version for update (currentVersion: ${currentVersion})`)
                  });
                }
                const updatePayload = {
                  ...orderHeader,
                  version: nextVersion
                };

                return retryWithBackoff(
                  () => store.update('order_header', updatePayload),
                  `UPDATE order_header: ${orderHeader.id} (v${currentVersion}→v${nextVersion})`
                );
              } else {

                return retryWithBackoff(
                  () => store.insert('order_header', orderHeader, { silent: false }),
                  `INSERT order_header: ${orderHeader.id}`
                );
              }
            })),
            ...(kdsPayload?.order_line || []).map(orderLine =>
              retryWithBackoff(
                () => store.insert('order_line', orderLine, { silent: false }),
                `INSERT order_line: ${orderLine.id}`
              )
            ),
            ...(kdsPayload?.job_order_batch || []).map(async batch => {

              const result = await retryWithBackoff(
                () => store.insert('job_order_batch', batch, { silent: false }),
                `INSERT job_order_batch: ${batch.id}`
              );
              if (!result.success || forceRestFallback) {
                const fallback = await postModuleTableRecord('job_order_batch', batch);
                if (fallback) return { success: true, fallback: 'rest' };
              }
              return result;
            }),
            ...(kdsPayload?.job_order_header || []).map(async jobHeader => {

              const result = await retryWithBackoff(
                () => store.insert('job_order_header', jobHeader, { silent: false }),
                `INSERT job_order_header: ${jobHeader.id}`
              );
              if (!result.success || forceRestFallback) {
                const fallback = await postModuleTableRecord('job_order_header', jobHeader);
                if (fallback) return { success: true, fallback: 'rest' };
              }
              return result;
            }),
            ...(kdsPayload?.job_order_detail || []).map(async jobDetail => {
              const orderLineId = jobDetail.orderLineId || jobDetail.order_line_id;

              if (typeof window !== 'undefined' && window.database && Array.isArray(window.database.job_order_detail)) {
                try {
                  const existing = window.database.job_order_detail.filter(detail => {
                    const detailLineId = detail.orderLineId || detail.order_line_id;
                    return detailLineId === orderLineId;
                  });

                  if (existing.length > 0) {
                    console.warn(`⚠️⚠️⚠️ [DUPLICATE PREVENTION ACTIVE] Blocked duplicate insert!`, {
                      orderLineId,
                      existingDetailIds: existing.map(d => d.id),
                      attemptedDetailId: jobDetail.id,
                      itemName: jobDetail.itemNameAr || jobDetail.itemNameEn,
                      action: 'SKIPPED - NOT INSERTED'
                    });
                    return { success: true, skipped: true, reason: 'already_exists' };
                  }
                } catch (checkErr) {
                  console.error(`❌ [INSERT CHECK] Check failed for ${orderLineId}:`, checkErr);
                }
              } else {
                console.warn(`⚠️ [INSERT CHECK] window.database not available - cannot check duplicates`);
              }
              const result = await retryWithBackoff(
                () => store.insert('job_order_detail', jobDetail, { silent: false }),
                `INSERT job_order_detail: ${jobDetail.id}`
              );
              if (!result.success || forceRestFallback) {
                const fallback = await postModuleTableRecord('job_order_detail', jobDetail);
                if (fallback) return { success: true, fallback: 'rest' };
              }
              return result;
            }),
            ...(kdsPayload?.job_order_detail_modifier || []).map(async modifier => {
              const result = await retryWithBackoff(
                () => store.insert('job_order_detail_modifier', modifier, { silent: false }),
                `INSERT job_order_detail_modifier: ${modifier.id}`
              );
              if (!result.success || forceRestFallback) {
                const fallback = await postModuleTableRecord('job_order_detail_modifier', modifier);
                if (fallback) return { success: true, fallback: 'rest' };
              }
              return result;
            }),
            ...(kdsPayload?.job_order_status_history || []).map(async history => {
              const result = await retryWithBackoff(
                () => store.insert('job_order_status_history', history, { silent: false }),
                `INSERT job_order_status_history: ${history.id}`
              );
              if (!result.success || forceRestFallback) {
                const fallback = await postModuleTableRecord('job_order_status_history', history);
                if (fallback) return { success: true, fallback: 'rest' };
              }
              return result;
            })
          ]).then(results => {
            const successCount = results.filter(r => r?.success).length;
            const failureCount = results.filter(r => !r?.success).length;
            const totalCount = results.length;
            if (failureCount === 0) {

              if (typeof kdsBridge !== 'undefined' && kdsPayload) {
                // Send the entire payload or just a signal. Usually sending the payload is safer for stateless KDS.
                kdsBridge.send('job_order', kdsPayload);
                emitLocalKdsMessage({ type: 'orders:payload', payload: kdsPayload, meta: { channel: BRANCH_CHANNEL } });
              }
            } else {
              console.warn(`⚠️ [POS V2] KDS operations completed: ${successCount}/${totalCount} succeeded, ${failureCount} failed`);
              console.warn('⚠️ [POS V2] Some data may not appear in KDS - check errors above');
            }
          }).catch(err => {
            console.error('[POS V2] ❌ Unexpected error in KDS operations:', err);
          });
        } else {
          console.warn('[POS V2] ⚠️ No job_order payload generated');
        }
        if (newPaymentsOnly.length > 0) {
          const nowIso = new Date(now).toISOString();
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
              .then()
              .catch(paymentError => {
                console.error('[POS V2] ❌ Failed to save payment:', paymentError);
              });
          })).then(() => {
          }).catch(err => {
            console.error('[POS V2] ❌ Some payments failed:', err);
          });
        } else {
        }
        const serviceMode = orderPayload.type || orderPayload.serviceMode || 'dine_in';
        if (serviceMode === 'dine_in') {
          const totalsDue = calculateTotals(orderPayload.lines || [], settings, serviceMode, { orderDiscount: orderPayload.discount });
          const totalDue = Number(totalsDue?.due || 0);
          const allPayments = [...(orderPayload.payments || []), ...newPaymentsOnly];
          const totalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

          if (totalDue > 0 && totalPaid >= totalDue) {
            const existingOrderHeaders = window.database?.order_header || [];
            const existingOrderHeader = existingOrderHeaders.find(h => String(h.id) === String(orderPayload.id));
            if (existingOrderHeader && typeof store.update === 'function') {
              const currentVersion = existingOrderHeader.version || 1;
              const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;
              const nowIso = new Date().toISOString();
              if (!Number.isFinite(nextVersion) || nextVersion < 1) {
                console.error('❌ [POS V2] FATAL: Cannot close order_header without valid version!', {
                  orderId: orderPayload.id,
                  currentVersion,
                  nextVersion
                });
              } else {
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
        console.warn('[POS V2] ⚠️ mishkah-store not available');
      }
      posDB.markSync().catch(err => console.error('[POS V2] markSync failed:', err));

      const remoteResolved = savedOrder && typeof savedOrder === 'object'
        ? mergePreferRemote(orderPayload, savedOrder)
        : orderPayload;

      if (remoteResolved && (!remoteResolved.tableIds || remoteResolved.tableIds.length === 0)) {
        if (Array.isArray(orderPayload.tableIds) && orderPayload.tableIds.length > 0) {
          remoteResolved.tableIds = orderPayload.tableIds.slice();
          if (!remoteResolved.tableId && orderPayload.tableIds.length > 0) {
            remoteResolved.tableId = orderPayload.tableIds[0];
          }
        }
      } else {
      }
      if (remoteResolved && (!remoteResolved.notes || remoteResolved.notes.length === 0)) {
        if (Array.isArray(orderPayload.notes) && orderPayload.notes.length > 0) {
          console.warn('⚠️⚠️ [NOTES FIX] Backend missing notes - restoring from orderPayload:', orderPayload.notes);
          remoteResolved.notes = orderPayload.notes.slice();
        } else if (orderPayload.metadata?.notes && Array.isArray(orderPayload.metadata.notes) && orderPayload.metadata.notes.length > 0) {
          console.warn('⚠️⚠️ [NOTES FIX] Restoring notes from metadata:', orderPayload.metadata.notes);
          remoteResolved.notes = orderPayload.metadata.notes.slice();
        }
      } else {
      }
      const kdsPublishPayload = {
        ...(remoteResolved && typeof remoteResolved === 'object' ? remoteResolved : orderPayload),
        id: persistedId || savedOrder?.id || finalOrderId || remoteResolved?.id || orderPayload.id
      };

      const tableIdsBackup = Array.isArray(remoteResolved.tableIds) ? remoteResolved.tableIds.slice() : [];
      const tableIdBackup = remoteResolved.tableId || (tableIdsBackup.length > 0 ? tableIdsBackup[0] : null);
      const notesBackup = Array.isArray(remoteResolved.notes) ? remoteResolved.notes.map(n => ({ ...n })) : [];
      const normalizedOrderForState = enrichOrderWithMenu({
        ...remoteResolved,
        allowAdditions,
        lockLineEdits: finalize ? true : (remoteResolved.lockLineEdits ?? order.lockLineEdits)
      });
      if ((!normalizedOrderForState.tableIds || normalizedOrderForState.tableIds.length === 0) && tableIdsBackup.length > 0) {
        console.warn('⚠️⚠️⚠️ [TABLE RESTORE] enrichOrderWithMenu lost tableIds! Restoring:', tableIdsBackup);
        normalizedOrderForState.tableIds = tableIdsBackup;
        normalizedOrderForState.tableId = tableIdBackup;
      }
      if ((!normalizedOrderForState.notes || normalizedOrderForState.notes.length === 0) && notesBackup.length > 0) {
        console.warn('⚠️⚠️⚠️ [NOTES RESTORE] enrichOrderWithMenu lost notes! Restoring:', notesBackup);
        normalizedOrderForState.notes = notesBackup;
      }
      const postSaveState = ctx.getState();

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
      if ((!syncedOrderForState.tableIds || syncedOrderForState.tableIds.length === 0) && tableIdsBackup.length > 0) {
        console.error('❌❌❌ [TABLE RESTORE] syncOrderVersionMetadata lost tableIds! Restoring:', tableIdsBackup);
        syncedOrderForState.tableIds = tableIdsBackup;
        syncedOrderForState.tableId = tableIdBackup;
      }
      if ((!syncedOrderForState.notes || syncedOrderForState.notes.length === 0) && notesBackup.length > 0) {
        console.error('❌❌❌ [NOTES RESTORE] syncOrderVersionMetadata lost notes! Restoring:', notesBackup);
        syncedOrderForState.notes = notesBackup;
      }
      if (Array.isArray(syncedOrderForState.lines)) {
        syncedOrderForState.lines = syncedOrderForState.lines.map(line => ({
          ...line,
          isPersisted: true
        }));
      }
      syncedOrderForState.isPersisted = true;
      syncedOrderForState.dirty = false;

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
          nextUi.print = { ...(uiBase.print || {}), docType: data.print?.docType || 'customer', size: data.print?.size || 'thermal_80', ticketSnapshot: orderPayload };
        }

        const updatedOrdersQueue = latestOrders.slice();
        const queueIndex = updatedOrdersQueue.findIndex(ord => ord.id === syncedOrderForState.id);
        if (queueIndex >= 0) {

          updatedOrdersQueue[queueIndex] = { ...syncedOrderForState };
        } else if (!finalize) {
          updatedOrdersQueue.push({ ...syncedOrderForState });
        }
        let tableLockUpdates = idChanged
          ? (data.tableLocks || []).map(lock => lock.orderId === previousOrderId ? { ...lock, orderId: orderPayload.id } : lock)
          : (data.tableLocks || []);
        if (finalize && assignedTables.length > 0) {

          tableLockUpdates = tableLockUpdates.map(lock =>
            lock.orderId === orderPayload.id
              ? { ...lock, active: false }
              : lock
          );
          if (window.__POS_DB__ && typeof window.__POS_DB__.update === 'function') {
            const store = window.__POS_DB__;
            const tableLocksInDatabase = (typeof window !== 'undefined' && window.database && Array.isArray(window.database.table_lock))
              ? window.database.table_lock
              : [];
            tableLockUpdates.forEach(lock => {
              if (lock.orderId === orderPayload.id && !lock.active) {
                const existingLock = tableLocksInDatabase.find(l => String(l.id) === String(lock.id));
                const currentVersion = existingLock?.version || lock.version || 1;
                const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;
                if (!Number.isFinite(nextVersion) || nextVersion < 1) {
                  console.error('[POS V2] ❌ Cannot update table_lock without valid version!', {
                    lockId: lock.id,
                    currentVersion,
                    nextVersion
                  });
                  return;
                }
                const updatePayload = {
                  ...lock,
                  version: nextVersion
                };
                store.update('table_lock', updatePayload).catch(err => {
                  console.warn('[POS V2] Failed to update table_lock in backend:', err);
                });

              }
            });
          }

        }
        const updatedData = {
          ...data,
          tableLocks: tableLockUpdates,
          ordersQueue: updatedOrdersQueue,
          ordersHistory: history,
          shift: { ...(data.shift || {}), current: nextShift },
          status: {
            ...data.status,
            indexeddb: { state: 'online', lastSync: now }
          }
        };
        const shouldCreateNewOrder = true;
        if (shouldCreateNewOrder) {
          const newOrderId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          updatedData.order = {
            id: newOrderId,
            status: 'open',
            fulfillmentStage: 'new',
            paymentState: 'unpaid',
            type: orderType,
            tableIds: orderType === 'dine_in' ? [] : [],
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

        }
        return {
          ...s,
          data: updatedData,
          ui: nextUi
        };
      });
      // KDS Sync Hook: Publish order to KDS after successful persistence
      if (kdsSync && typeof kdsSync.publishOrder === 'function') {
        kdsSync.publishOrder(kdsPublishPayload, {
          retryCount: 0,
          source: 'persistOrderFlow'
        }).catch(err => console.error('⚠️ [POS][KDS] Failed to publish order:', err));
      }
      await refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
      const toastKey = finalize ? 'order_finalized' : 'order_saved';
      UI.pushToast(ctx, { title: t.toast[toastKey], icon: finalize ? '✅' : '💾' });
      return { status: 'saved', mode };
    } catch (error) {
      const errorTitle = t?.toast?.indexeddb_error || 'IndexedDB Error';
      UI.pushToast(ctx, { title: errorTitle, message: String(error), icon: '🛑' });
      ctx.setState(s => ({
        ...s,
        data: {
          ...(s.data || {}),
          status: { ...(s.data?.status || {}), indexeddb: { state: 'error', lastError: error } }
        }
      }));
      return { status: 'error', reason: 'indexeddb-error', error };
    } finally {
      // 🛡️ CRITICAL: Always release save lock
      if (typeof window !== 'undefined') {
        window.__ORDER_SAVE_IN_PROGRESS__ = false;

      }
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
  // [Removed OrderModeSwitch and ScheduleToolbar - Using checkbox approach instead]

  function Header(db) {
    const t = getTexts(db);
    const session = (typeof window !== 'undefined') ? window.__POS_SESSION__ : null;
    const user = (session && session.userName)
      ? { ...db.data.user, name: session.userName, id: session.userId }
      : db.data.user;
    const orderType = getOrderTypeConfig(db.data.order.type);
    const mode = db.ui.orderMode || 'now';

    // 🛡️ Urgent Reservation Alert
    const reservations = db.data.order_schedule || db.data.reservations || [];
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const urgentCount = reservations.filter(res => {
      // 1. Status Check: Must be 'booked' or 'pending' (not confirmed/cancelled)
      const status = (res.status || 'booked').toLowerCase();
      if (['cancelled', 'completed', 'converted', 'no-show', 'confirmed'].includes(status)) return false;

      // 2. Time Check: Scheduled within the next hour (or slightly past due but relevant)
      const scheduledAt = new Date(res.scheduledAt || res.scheduled_at || 0).getTime();
      if (!scheduledAt) return false;
      const dueIn = scheduledAt - now;

      // Alert if: Overdue by < 30min OR Due within 60min
      return dueIn > -30 * 60 * 1000 && dueIn < oneHour;
    }).length;

    const reservationButton = UI.Button({
      attrs: { gkey: 'pos:reservations:open', title: t.ui.reservations, class: tw`relative` }, // 🛡️ Relative for badge
      variant: 'ghost',
      size: 'md'
    }, [
      D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['📅']),
      urgentCount > 0
        ? D.Text.Span({
          attrs: { class: tw`absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm animate-pulse` }
        }, [String(urgentCount)])
        : null
    ]);

    const mainToolbar = UI.Toolbar({
      left: [
        D.Text.Span({ attrs: { class: tw`text-2xl font-black tracking-tight` } }, [
          (() => {
            if (typeof window === 'undefined' || !window.localStorage || !window.localStorage.mishkah_user) return 'Mishkah POS';
            try {
              const u = JSON.parse(window.localStorage.mishkah_user);
              if (u.compName) return u.compName;
              const br = String(u.brname || '').toLowerCase();
              if (br === 'remal') return 'G-Remal Hotel';
              if (br === 'dar') return 'قرية درويش للمندي';
              return 'Mishkah POS';
            } catch (e) { return 'Mishkah POS'; }
          })()
        ])
      ],
      right: [
        UI.Button({ attrs: { gkey: 'pos:settings:open', title: t.ui.settings_center }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['⚙️'])]),
        ShiftControls(db),
        ThemeSwitch(db),
        LangSwitch(db),
        UI.Button({ attrs: { gkey: 'pos:tables:open', title: t.ui.tables }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['🪑'])]),
        reservationButton,
        UI.Button({ attrs: { gkey: 'pos:orders:open', title: t.ui.orders_queue }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['🧾'])]),
        UI.Badge({ attrs: { gkey: 'pos:cashier:name' }, text: `${t.ui.cashier}: ${user.name}`, leading: '👤', variant: 'badge/ghost' }),
        UI.Button({ attrs: { gkey: 'pos:session:logout', title: 'Logout' }, variant: 'ghost', size: 'md' }, [D.Text.Span({ attrs: { class: tw`text-xl sm:text-2xl` } }, ['🚪'])])
      ]
    });

    return D.Containers.Div({ attrs: { class: tw`flex flex-col z-50 relative sticky top-0 bg-[var(--background)]` } }, [
      mainToolbar
    ]);
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

    const isLocked = isLineLockedForEdit(order, line);
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
        D.Text.Span({ attrs: { class: tw`text-sm font-bold px-2` } }, [`x${Number(line.qty || line.quantity || 1)}`]),
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
    // Schedule Mode Logic
    if (db.ui.orderMode === 'schedule') {
      const conflicts = new Set(db.data.scheduleConflicts || []);
      const currentSelection = new Set(db.data.order?.tableIds || []);
      return tables.map(table => {
        const isConflicted = conflicts.has(table.id);
        const isSelected = currentSelection.has(table.id);
        return {
          ...table,
          state: 'active', // Always active for selection unless maintenance?
          lockState: isConflicted ? 'multi' : (isSelected ? 'single' : 'free'),
          activeLocks: [],
          orderLocks: [],
          reservationLocks: [],
          reservationRefs: [],
          isCurrentOrder: isSelected, // Treat as current order for visual highlight
          isConflicted // Propagate for UI if needed
        };
      });
    }

    function parseTableIds(value) {
      if (Array.isArray(value)) return value.filter(Boolean).map(String);
      if (typeof value === 'string' && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
        } catch (_err) { }
      }
      return value ? [String(value)] : [];
    }

    function getBusyDineInTablesWithOrder() {
      const storeTables = (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables) || {};
      const orders = storeTables.order_header || db.data.order_header || [];
      const scheduleTables = storeTables.order_schedule_tables || db.data.order_schedule_tables || [];
      const schedules = storeTables.order_schedule || db.data.order_schedule || [];

      const now = Date.now();
      const beforeMs = 30 * 60 * 1000;
      const afterMs = 30 * 60 * 1000;

      const map = new Map();
      const scheduleById = new Map();
      const orderById = new Map();

      const ensure = (tableId) => {
        const key = String(tableId);
        if (!map.has(key)) map.set(key, { tableId: key, orderIds: [], scheduleIds: [] });
        return map.get(key);
      };

      const addSchedule = (tableId, scheduleId) => {
        if (!tableId || !scheduleId) return;
        const row = ensure(tableId);
        if (!row.scheduleIds.includes(scheduleId)) row.scheduleIds.push(scheduleId);
      };

      const addOrder = (tableId, orderId) => {
        if (!tableId || !orderId) return;
        const row = ensure(tableId);
        if (!row.orderIds.includes(orderId)) row.orderIds.push(orderId);
      };

      (schedules || []).forEach(s => {
        const id = s.id || s.uuid;
        if (!id) return;
        scheduleById.set(String(id), s);
      });

      (orders || []).forEach(o => {
        if (!o || !o.id) return;
        orderById.set(String(o.id), o);
      });

      (scheduleTables || []).forEach(link => {
        if (!link) return;
        const scheduleId = link.schedule_id || link.scheduleId;
        const tableId = link.table_id || link.tableId;
        if (!scheduleId || !tableId) return;
        const sch = scheduleById.get(String(scheduleId));
        if (!sch) return;
        const status = String(sch.status || '').toLowerCase();
        if (status === 'cancelled' || status === 'completed' || status === 'converted' || status === 'no_show') return;
        const orderType = sch.order_type || sch.type || sch.payload?.orderType;
        if (orderType && orderType !== 'dine_in') return;

        const t0 = Date.parse(sch.scheduled_at || sch.scheduledAt || '');
        if (!Number.isFinite(t0)) return;
        const duration = Number(sch.duration_minutes || sch.duration || 60) || 60;
        const start = t0 - beforeMs;
        const end = t0 + (duration * 60 * 1000) + afterMs;
        if (now < start || now > end) return;

        addSchedule(tableId, String(scheduleId));
      });

      (orders || []).forEach(o => {
        if (!o || !o.id) return;
        const type = o.order_type || o.orderTypeId || o.type || o.orderType;
        if (type !== 'dine_in') return;
        const status = String(o.status || o.statusId || '').toLowerCase();
        if (status && status !== 'open' && status !== 'active' && status !== 'pending') return;

        const tableIds = parseTableIds(o.table_ids || o.tableIds || (o.metadata && o.metadata.tableIds) || o.tableId);
        tableIds.forEach(tid => addOrder(tid, String(o.id)));
      });

      const busyTables = Array.from(map.values()).sort((a, b) => a.tableId.localeCompare(b.tableId));
      return { busyTables, scheduleById, orderById };
    }

    const locks = (db.data.tableLocks || []).filter(lock => lock.active !== false);
    const reservations = db.data.reservations || [];
    const currentOrderId = db.data.order?.id;

    const busySnapshot = getBusyDineInTablesWithOrder();
    const effectiveLocksMap = new Map();
    locks.forEach(lock => {
      if (!lock || !lock.id) return;
      effectiveLocksMap.set(String(lock.id), lock);
    });
    busySnapshot.busyTables.forEach(row => {
      row.scheduleIds.forEach(scheduleId => {
        const lockId = `res-lock-${scheduleId}-${row.tableId}`;
        if (effectiveLocksMap.has(lockId)) return;
        const sch = busySnapshot.scheduleById.get(scheduleId);
        const lockedAt = sch ? new Date(sch.scheduledAt || sch.scheduled_at).getTime() : Date.now();
        effectiveLocksMap.set(lockId, {
          id: lockId,
          tableId: String(row.tableId),
          reservationId: scheduleId,
          active: true,
          lockedBy: 'reservation',
          lockedAt,
          source: 'schedule'
        });
      });
      row.orderIds.forEach(orderId => {
        const lockId = `lock-${row.tableId}-${orderId}`;
        if (effectiveLocksMap.has(lockId)) return;
        const ord = busySnapshot.orderById.get(orderId);
        const lockedAt = ord ? (ord.openedAt || ord.createdAt || Date.now()) : Date.now();
        effectiveLocksMap.set(lockId, {
          id: lockId,
          tableId: String(row.tableId),
          orderId: orderId,
          active: true,
          lockedAt,
          source: 'computed-from-orders'
        });
      });
    });
    const effectiveLocks = Array.from(effectiveLocksMap.values());

    const effectiveReservations = [
      ...reservations,
      ...busySnapshot.busyTables.flatMap(row => row.scheduleIds.map(scheduleId => {
        const sch = busySnapshot.scheduleById.get(scheduleId) || {};
        return {
          id: scheduleId,
          customerName: sch.customerName || sch.payload?.customer?.name || 'Customer',
          phone: sch.phone || sch.payload?.customer?.phone || '',
          partySize: sch.partySize || sch.payload?.guests || 0,
          scheduledAt: new Date(sch.scheduledAt || sch.scheduled_at || Date.now()).getTime(),
          status: sch.status,
          tableIds: [row.tableId]
        };
      }))
    ];

    return tables.map(table => {
      const activeLocks = effectiveLocks.filter(lock => lock.tableId === table.id);
      const orderLocks = activeLocks.filter(lock => lock.orderId);
      const reservationLocks = activeLocks.filter(lock => lock.reservationId);
      const lockState = table.state !== 'active'
        ? table.state
        : activeLocks.length === 0
          ? 'free'
          : activeLocks.length === 1
            ? 'single'
            : 'multi';
      const reservationRefs = reservationLocks.map(lock => effectiveReservations.find(res => res.id === lock.reservationId)).filter(Boolean);
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

    const isSchedule = db.ui.orderMode === 'schedule';
    // Always show payments button - backend handles scheduled vs immediate
    const mainAction = UI.Button({
      attrs: {
        gkey: 'pos:payments:open',
        class: tw`w-full flex items-center justify-center gap-2`
      },
      variant: 'soft',
      size: 'sm'
    }, [
      D.Text.Span({ attrs: { class: tw`text-lg` } }, ['💳']),
      D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.open_payments])
    ]);

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

        // Reservation Controls

        mainAction,
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
    const lockOrderType = false;
    const lockReservationToggle = order.isPersisted && !order.metadata?.isSchedule && !order.sourceScheduleId && !String(order.id || '').startsWith('SCH-');
    const serviceSegments = ORDER_TYPES.map(type => ({
      id: type.id,
      label: `${type.icon} ${localize(type.label, db.env.lang)}`,
      attrs: {
        gkey: 'pos:order:type',
        'data-order-type': type.id,
        disabled: lockOrderType ? true : undefined
      }
    }));
    const orderTypeDisplay = lockOrderType
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
                D.Containers.Div({ attrs: { class: tw`mb-2` } }, [
                  UI.Select({
                    attrs: {
                      class: tw`w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm font-medium`,
                      gkey: 'pos:reservation:toggle',
                      onchange: 'event.target.gkey = "pos:reservation:toggle";',
                      disabled: lockReservationToggle ? 'disabled' : undefined
                    },
                    options: [
                      { value: 'now', label: t.ui.order_type_now || '⚡ أوردرات فورية', selected: !db.ui.reservation?.enabled },
                      { value: 'schedule', label: t.ui.order_type_schedule || '📅 حجز أوردرات', selected: !!db.ui.reservation?.enabled }
                    ]
                  }),
                  // Optional: Show date picker strictly if scheduled
                  db.ui.reservation?.enabled ? D.Containers.Div({ attrs: { class: tw`mt-2 animate-in slide-in-from-top-1` } }, [
                    UI.DateTimePicker({
                      value: db.ui.reservation?.scheduledAt || '',
                      gkey: 'pos:reservation:date',
                      placeholder: 'YYYY-MM-DD HH:mm',
                      attrs: {
                        class: tw`w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm`
                      }
                    })
                  ]) : null
                ]),
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
    const validLines = (order.lines || []).filter(line => {
      const notCancelled = !line.cancelled && !line.voided;
      const hasQuantity = Number(line.qty || line.quantity || 0) > 0;
      return notCancelled && hasQuantity;
    });
    const hasValidLines = validLines.length > 0;
    const typeConfig = getOrderTypeConfig(orderType);
    const allowsSave = typeConfig.allows_save !== false;
    const saveDisabled = false;
    const finishDisabled = false;
    const isScheduleConverted = order.metadata?.scheduleStatus === 'converted';
    const canShowSave = !isFinalized && !deliveredStage && hasValidLines && allowsSave && !isScheduleConverted;
    const canShowFinish = !isFinalized && (!isDelivery || !deliveredStage) && hasValidLines && !isScheduleConverted;
    const finishMode = isTakeaway ? 'finalize-print' : 'finalize';
    const finishLabel = isTakeaway ? t.ui.finish_and_print : t.ui.finish_order;
    const showPrintButton = order.isPersisted && order.id && !order.id.startsWith('draft-');

    // ✅ Reservation mode detection
    const isReservationMode = db.ui?.reservation?.enabled === true;
    const existingScheduleId = isReservationMode
      ? (order.sourceScheduleId || (order.id && !String(order.id).startsWith('draft-') && order.isPersisted ? order.id : null))
      : null;

    // ✅ Dynamic save label
    const saveLabel = isReservationMode
      ? (t.pos?.reservations?.save_button || '💾 حفظ الحجز')
      : t.ui.save_order;

    const primaryActions = [];
    primaryActions.push(UI.Button({ attrs: { key: 'pos-action-new', gkey: 'pos:order:new', class: tw`min-w-[120px] flex items-center justify-center gap-2` }, variant: 'ghost', size: 'md' }, [
      D.Text.Span({ attrs: { class: tw`text-lg` } }, ['🆕']),
      D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.new_order])
    ]));

    // Reservations Button

    if (canShowSave) {
      const saveAttrs = {
        key: 'pos-action-save',
        gkey: 'pos:order:save',
        'data-save-mode': 'save',
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

    // ✅ Reservation Print Button (only show if editing existing schedule)
    if (isReservationMode && existingScheduleId) {
      primaryActions.push(UI.Button({
        attrs: {
          key: 'pos-action-reservation-print',
          gkey: 'pos:reservation:print',
          'data-id': existingScheduleId,
          class: tw`min-w-[150px] flex items-center justify-center gap-2`
        },
        variant: 'outline',
        size: 'md'
      }, [
        D.Text.Span({ attrs: { class: tw`text-lg` } }, ['🖨️']),
        D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.ui.print || 'طباعة'])
      ]));
    }

    // ✅ Reservation Confirm Button (convert to actual order)
    if (isReservationMode && existingScheduleId) {
      primaryActions.push(UI.Button({
        attrs: {
          key: 'pos-action-reservation-confirm',
          gkey: 'pos:reservation:confirm',
          'data-id': existingScheduleId,
          class: tw`min-w-[180px] flex items-center justify-center gap-2`
        },
        variant: 'primary',
        size: 'md'
      }, [
        D.Text.Span({ attrs: { class: tw`text-lg` } }, ['✅']),
        D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [t.pos?.reservations?.confirm_button || 'تأكيد الحجز'])
      ]));
    }

    // Standard Flow - Keep payment button for both immediate and scheduled orders
    // The backend will handle saving to order_payment vs order_schedule_payment
    if (canShowFinish && !isReservationMode) {  // ✅ Hide finish button in reservation mode
      const finishAttrs = {
        key: 'pos-action-finish',
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
    if (showPrintButton && !isReservationMode) {  // ✅ Hide normal print button in reservation mode
      primaryActions.push(UI.Button({ attrs: { key: 'pos-action-print', gkey: 'pos:order:print', class: tw`min-w-[150px] flex items-center justify-center gap-2` }, variant: 'soft', size: 'md' }, [
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
      const lockBadges = [];
      runtime.orderLocks.slice(0, 2).forEach(lock => {
        if (!lock || !lock.orderId) return;
        lockBadges.push(D.Button({
          attrs: {
            gkey: 'pos:orders:open-order',
            'data-order-id': lock.orderId,
            'data-prevent-select': 'true',
            class: tw`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-transparent text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]`
          }
        }, [String(lock.orderId)]));
      });
      runtime.reservationRefs.slice(0, 2).forEach(res => {
        if (!res || !res.id) return;
        lockBadges.push(D.Button({
          attrs: {
            gkey: 'pos:reservations:open',
            'data-id': res.id,
            'data-prevent-select': 'true',
            class: tw`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-transparent text-[var(--muted-foreground)] border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]`
          }
        }, [String(res.id)]));
      });
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
        lockBadges.length
          ? D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-1 text-xs` } }, lockBadges)
          : (runtime.note
            ? D.Text.Span({ attrs: { class: tw`text-sm opacity-75` } }, [`📝 ${runtime.note}`])
            : null)
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
                UI.Button({ attrs: { gkey: 'pos:orders:open-order', 'data-order-id': order.id }, variant: 'ghost', size: 'sm' }, ['👁️']),
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
              D.Text.Strong({}, [`${res.id} • ${res.customerName || ''}`]),
              D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [`${formatDateTime(res.scheduledAt, lang, { hour: '2-digit', minute: '2-digit' })} • ${res.partySize} ${t.ui.guests}`])
            ],
            trailing: [
              UI.Button({ attrs: { gkey: 'pos:reservations:open', 'data-id': res.id }, variant: 'ghost', size: 'sm' }, ['👁️']),
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
    const vatRate = 0.14;
    const totalWithVat = Number(due) || 0;
    const totalBeforeVat = totalWithVat ? round(totalWithVat / (1 + vatRate)) : 0;
    const vatAmount = totalWithVat ? round(totalWithVat - totalBeforeVat) : 0;
    const totalsRows = [
      { label: t.ui.subtotal, value: subtotal },
      order.totals?.service ? { label: t.ui.service, value: order.totals.service } : null,
      { label: t.ui.total_before_vat, value: totalBeforeVat },
      { label: t.ui.vat_14, value: vatAmount },
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
    const vatNoteRow = D.Text.Span({ attrs: { class: tw`${previewPreset.meta} text-neutral-500` } }, [t.ui.vat_included_note]);
    const previewOrderId = getDisplayOrderId(order, t);
    const previewReceipt = D.Containers.Div({ attrs: { class: previewContainerClass, 'data-print-preview': 'receipt' } }, [
      D.Containers.Div({ attrs: { class: tw`space-y-1 text-center` } }, [
        D.Text.Strong({ attrs: { class: previewHeadingClass } }, [COMPANY_NAME]),
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
        totalsRows[0] ? D.Containers.Div({ attrs: { class: previewTotalsRowClass } }, [
          D.Text.Span({}, [totalsRows[0].label]),
          UI.PriceText({ amount: totalsRows[0].value, currency: getCurrency(db), locale: getLocale(db) })
        ]) : null,
        vatNoteRow,
        ...totalsRows.slice(1).map(row => D.Containers.Div({ attrs: { class: previewTotalsRowClass } }, [
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

    // Data Sources - Prioritize global store (posModule) as primary source (User Requested)
    // ✅ CRITICAL FIX: PREFER __MISHKAH_LAST_STORE__ over __POS_DB__
    const globalState = (typeof window !== 'undefined') ? window.__MISHKAH_LAST_STORE__?.state : null;
    const posModule = globalState?.modules?.pos;

    // ✅ CRITICAL FIX: Direct access to posModule tables (Accuracy priority)
    // We prioritize posModule over realtimeSchedules or db.data
    let rawSchedules = posModule?.tables?.order_schedule;
    let rawLinks = posModule?.tables?.order_schedule_tables;
    let rawScheduleLines = posModule?.tables?.order_schedule_line;
    let rawSchedulePayments = posModule?.tables?.order_schedule_payment;

    if (rawSchedules) {

    } else if (realtimeSchedules.ready) {

      const snapshot = getRealtimeSchedulesSnapshot();
      rawSchedules = snapshot.schedules || [];
      rawLinks = snapshot.tables || [];
      rawScheduleLines = snapshot.lines || [];
      rawSchedulePayments = snapshot.payments || [];
    } else {

      rawSchedules = db.data.order_schedule || db.data.reservations || [];
      rawLinks = db.data.order_schedule_tables || [];
      rawScheduleLines = db.data.order_schedule_line || [];
      rawSchedulePayments = db.data.order_schedule_payment || [];
    }

    // Fallback for undefined arrays
    rawSchedules = rawSchedules || [];
    rawLinks = rawLinks || [];
    rawScheduleLines = rawScheduleLines || [];
    rawSchedulePayments = rawSchedulePayments || [];

    // ✅ CRITICAL FIX: Deduplicate schedules by ID, preferring ones WITH customer data
    const scheduleMap = new Map();
    rawSchedules.forEach(sch => {
      if (!sch || !sch.id) return;

      const existing = scheduleMap.get(sch.id);
      if (!existing) {
        scheduleMap.set(sch.id, sch);
      } else {
        const hasCustomerData = sch.customer_id || sch.customerId || sch.payload?.customer?.name;
        const existingHasCustomerData = existing.customer_id || existing.customerId || existing.payload?.customer?.name;

        if (hasCustomerData && !existingHasCustomerData) {
          scheduleMap.set(sch.id, sch);
        }
      }
    });

    const uniqueSchedules = Array.from(scheduleMap.values());

    // 🔍 DEBUG: Log unique schedules to check customer data

    const tables = db.data.tables || [];

    // ✅ CRITICAL FIX: Fetch customer profiles from global store (posModule)
    // User proved data exists in __MISHKAH_LAST_STORE__
    const customerProfiles = posModule?.tables?.customer_profiles || db.data.customer_profiles || [];
    const addresses = db.data.customer_addresses || [];

    // UI State for Selection
    const selection = db.ui.reservations?.selection || [];
    const isMultiMode = selection.length > 0;

    // Join logic - use uniqueSchedules instead of rawSchedules
    const lang = db.env.lang;
    const reservations = uniqueSchedules.filter(s => s.status !== 'cancelled').map(sch => {
      // Find linked tables
      const links = rawLinks.filter(l => l.schedule_id === sch.id);
      const tableIds = links.map(l => l.table_id);
      const linkedTables = tableIds.map(tid => tables.find(tb => tb.id === tid)).filter(Boolean);

      // Resolve Customer Name (use customerProfiles from global store)
      // ✅ CRITICAL FIX: Check sch.customer_id as well
      const customerId = sch.customerId || sch.customer_id || sch.payload?.customer?.id;
      const customer = customerProfiles.find(c => c.id === customerId);

      const resolvedName = customer?.name || sch.customer_name || sch.payload?.customer?.name || 'Unknown';

      // Resolve Customer Phone
      const resolvedPhone = customer?.phone || (customer?.phones && customer.phones[0]) || sch.customer_phone || sch.payload?.customer?.phone || '';

      // Resolve Address
      const addressId = sch.customerAddressId || sch.payload?.customerAddressId;
      const address = addressId ? addresses.find(a => a.id === addressId) : null;
      const resolvedAddress = address ? (address.label || address.street || address.areaId || 'Address Found') : '';

      const schedulePayments = rawSchedulePayments.filter(p => p.scheduleId === sch.id || p.schedule_id === sch.id);
      const paidAmount = round(schedulePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
      const totalAmount = sch.payload?.totals?.due || 0;
      const remainingAmount = Math.max(0, round(Number(totalAmount) - paidAmount));
      const orderType = sch.order_type || sch.type || sch.payload?.orderType || sch.payload?.order_type || 'dine_in';
      const orderTypeLabel = localize(getOrderTypeConfig(orderType).label, lang);

      return {
        ...sch,
        customerName: resolvedName,
        phone: resolvedPhone,
        address: resolvedAddress, // Pass address for display
        partySize: sch.payload?.guests || sch.partySize || 0,
        scheduledAt: new Date(sch.scheduled_at || sch.scheduledAt).getTime(),
        holdUntil: sch.hold_until ? new Date(sch.hold_until).getTime() : null,
        tableIds,
        tableNames: linkedTables.map(tb => tb.name || tb.id).join(', '),
        status: sch.status || 'pending',
        id: sch.id,
        itemsCount: sch.payload?.lines?.length || 0,
        totalAmount,
        paidAmount,
        remainingAmount,
        orderType,
        orderTypeLabel
      };
    });

    const uiState = db.ui.reservations || {};
    const statusFilter = uiState.status || 'all';
    const rangeFilter = uiState.filter || 'today';
    const searchTerm = (uiState.search || '').trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    function inRange(res) {
      if (rangeFilter === 'today') return res.scheduledAt >= startOfToday && res.scheduledAt < endOfToday;
      if (rangeFilter === 'upcoming') return res.scheduledAt >= endOfToday;
      if (rangeFilter === 'past') return res.scheduledAt < startOfToday;
      return true;
    }

    function matchesSearch(res) {
      if (!searchTerm) return true;
      const name = (res.customerName || '').toLowerCase();
      const phone = (res.phone || '').toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm);
    }

    const filtered = reservations
      .filter(res => statusFilter === 'all' ? true : res.status === statusFilter)
      .filter(inRange)
      .filter(matchesSearch)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);

    const rangeItems = [
      { id: 'today', label: t.ui.reservations_manage || 'Today' },
      { id: 'upcoming', label: '⏭️ Upcoming' },
      { id: 'all', label: t.ui.reservations_filter_all || 'All' }
    ].map(item => ({ ...item, attrs: { gkey: 'pos:reservations:range', 'data-reservation-range': item.id } }));

    const statusItems = [
      { id: 'all', label: t.ui.reservations_filter_all },
      { id: 'pending', label: '⏳ Pending' },
      { id: 'confirmed', label: '✅ Confirmed' },
      { id: 'converted', label: '🧾 Converted' },
      { id: 'cancelled', label: '🚫 Cancelled' }
    ].map(item => ({ ...item, attrs: { gkey: 'pos:reservations:status', 'data-reservation-status': item.id } }));

    // Alert Logic
    const urgentCount = filtered.filter(r => r.status === 'pending' && (r.scheduledAt - Date.now() < 3600000) && (r.scheduledAt > Date.now())).length;
    const alertBanner = urgentCount > 0
      ? D.Containers.Div({ attrs: { class: tw`bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 mb-4` } }, [
        D.Text.Strong({}, ['⚠️ Action Required: ']),
        `${urgentCount} reservations starting within 1 hour need confirmation!`
      ])
      : null;

    const listCards = filtered.length ? filtered.map(res => {
      const isSelected = selection.includes(res.id);
      const isUrgent = res.status === 'pending' && (res.scheduledAt - Date.now() < 3600000) && (res.scheduledAt > Date.now());

      return UI.Card({
        title: UI.HStack({ attrs: { class: tw`items-center gap-3` } }, [
          res.status === 'pending' ? UI.Checkbox({
            checked: isSelected,
            gkey: 'pos:reservations:select',
            'data-id': res.id
          }) : null,
          D.Text.Span({}, [(res.payload?.sequenceNumber || res.id || 'Unknown') + ' - ' + res.customerName])
        ]),
        description: `${formatDateTime(res.scheduledAt, lang, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })} • ${res.phone || ''}`,
        content: D.Containers.Div({ attrs: { class: tw`space-y-2 text-sm` } }, [
          UI.Badge({ text: res.orderTypeLabel, variant: 'badge/ghost' }),
          res.tableNames ? UI.Badge({ text: `Tables: ${res.tableNames}`, variant: 'badge/ghost' }) : null,
          D.Containers.Div({ attrs: { class: tw`flex justify-between text-xs ${token('muted')}` } }, [
            D.Text.Span({}, [`Items: ${res.itemsCount}`]),
            D.Text.Span({}, [`Total: ${res.totalAmount}`])
          ]),
          D.Containers.Div({ attrs: { class: tw`flex justify-between text-xs ${token('muted')}` } }, [
            D.Text.Span({}, [`Paid: ${res.paidAmount || 0}`]),
            D.Text.Span({}, [`Remaining: ${res.remainingAmount || 0}`])
          ]),
          isUrgent ? D.Containers.Div({ attrs: { class: tw`text-amber-600 font-bold text-xs flex items-center gap-1` } }, ['⏰ Starts in < 1h']) : null
        ].filter(Boolean)),
        footer: UI.HStack({ attrs: { class: tw`flex-wrap gap-2 justify-end` } }, [
          UI.Badge({ text: res.status, variant: res.status === 'confirmed' ? 'badge/solid' : 'badge/ghost' }),
          UI.Button({ attrs: { gkey: 'pos:reservations:open', 'data-id': res.id }, variant: 'ghost', size: 'sm' }, ['👁️ Open'])
          //, res.status === 'pending' ? UI.Button({ attrs: { gkey: 'pos:reservations:confirm', 'data-id': res.id }, variant: 'solid', size: 'sm' }, ['✅ Confirm']) : null
        ])
      });
    }) : [UI.EmptyState({ icon: '📅', title: 'Schedule Dashboard', description: 'No scheduled orders found.' })];

    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.reservations || 'full',
      sizeKey: 'reservations',
      title: 'Scheduling Dashboard',
      description: 'Manage upcoming orders & reservations',
      content: D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
        alertBanner,
        UI.HStack({ attrs: { class: tw`justify-between items-center` } }, [
          UI.Segmented({ items: rangeItems, activeId: rangeFilter }),
          isMultiMode
            ? UI.Button({ attrs: { gkey: 'pos:reservations:multiconfirm' }, variant: 'solid', size: 'sm' }, [`Confirm Selected (${selection.length})`])
            : null
        ].filter(Boolean)),
        UI.ChipGroup({ items: statusItems, activeId: statusFilter }),
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: t.ui.search_customer || 'Search by name or phone...',
            value: searchTerm,
            class: tw`w-full px-4 py-2 border rounded-md`,
            gkey: 'pos:reservations:search'
          }
        }),
        D.Containers.Div({ attrs: { class: tw`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-auto pr-1` } }, listCards)
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
    const paymentsSource = (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables?.order_payment)
      ? window.__MISHKAH_LAST_STORE__.state.modules.pos.tables.order_payment
      : [];
    const paymentsIndex = new Map();
    paymentsSource.forEach(entry => {
      if (!entry || !entry.orderId) return;
      const current = paymentsIndex.get(entry.orderId) || 0;
      paymentsIndex.set(entry.orderId, current + (Number(entry.amount) || 0));
    });
    const getPaidAmountForOrder = (order) => {
      const inline = Array.isArray(order.payments) ? order.payments : [];
      if (inline.length) {
        return round(inline.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
      }
      return round(paymentsIndex.get(order.id) || 0);
    };
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
    const filterShift = ordersState.filterShift !== false;
    const isOrderCompleted = (order) => {
      const statusId = order.statusId || order.status || 'open';
      const isNotOpen = String(statusId) !== 'open';
      const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
      const totalDue = Number(totals?.due || 0);
      const paidAmount = getPaidAmountForOrder(order);
      const isFullyPaid = totalDue > 0 && paidAmount >= totalDue;

      // Safer access to order_line via global store
      const posModule = window.__POS_DB__?.store?.state?.modules?.pos;
      const orderLines = posModule?.tables?.order_line || [];
      var order_linearr = orderLines.filter(item => item.orderId === order.id);

      const isAllCompleted = order_linearr?.length > 0 && order_linearr.every(line => line.statusId === 'completed');
      return isAllCompleted && isFullyPaid;
    };
    const matchesTab = (order) => {
      if (filterShift) {
        const currentShiftId = db.data.shift?.current?.id;
        if (currentShiftId && order.shiftId !== currentShiftId) return false;
      }
      if (activeTab === 'completed') {
        return isOrderCompleted(order);
      }
      if (activeTab === 'all') {
        return !isOrderCompleted(order);
      }
      const typeId = order.type || order.orderType || 'dine_in';
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
          const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
          return Number(totals?.due || 0);
        }
        case 'customerName':
          return order.customerName || order.customer_name || '';
        case 'customerPhone':
          return order.customerPhone || order.customer_phone || '';
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
      { id: 'customerName', label: t.ui.customer_name, sortable: true },
      { id: 'customerPhone', label: t.ui.customer_phones, sortable: false },
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
      const totals = calculateTotals(order.lines || [], settings, order.type || 'dine_in', { orderDiscount: order.discount });
      const totalDue = Number(totals?.due || 0);
      const paidAmount = getPaidAmountForOrder(order);
      const remainingAmount = Math.max(0, round(totalDue - paidAmount));
      const tableIdsSource = order.tableIds || order.table_ids || order.tableId || order.table_id;
      let orderTableIds = Array.isArray(tableIdsSource)
        ? tableIdsSource
        : (tableIdsSource ? [tableIdsSource] : []);
      const headerTableIds = ((window.__POS_DB__?.store?.state?.modules?.pos?.tables?.order_header) || []).find(h => h.id === order.id)?.metadata?.tableIds || [];
      orderTableIds = headerTableIds;
      if (order.type === 'dine_in' && (!orderTableIds || orderTableIds.length === 0)) {
        console.warn('⚠️ [ORDERS REPORT] Dine-in order missing tableIds!', {
          orderId: order.id,
          'order.tableIds': order.tableIds,
          'order.tableId': order.tableId,
          'order.table_ids': order.table_ids,
          'order.table_id': order.table_id
        });
      }
      const tableNames = orderTableIds
        .map(id => {
          let table = tablesIndex.get(id);
          if (!table) {
            const allTables = db.data.tables || [];
            table = allTables.find(t => {
              const search = String(id || '').trim();
              const isMatch = (val) => {
                const v = String(val || '').trim();
                if (v === search) return true;
                if (v.replace(/^T0+/, 'T') === search.replace(/^T0+/, 'T')) return true;
                if (!isNaN(v) && !isNaN(search) && Number(v) === Number(search)) return true;
                return false;
              };
              return isMatch(t.id) || isMatch(t.code) || isMatch(t.label) || isMatch(t.posNumber);
            });
            if (!table) {
              console.warn('[ORDERS REPORT] Table lookup failed:', id);
            }
          }
          const name = table?.name || table?.label || id;
          if (!table && id) {
            console.warn('⚠️ [ORDERS REPORT] Table not found in tablesIndex:', {
              tableId: id,
              orderId: order.id,
              availableTables: Array.from(tablesIndex.keys())
            });
          }
          return name;
        })
        .filter(Boolean)
        .join(', ');
      const updatedStamp = order.updatedAt || order.createdAt;

      const customerName = (() => {
        if (order.customerName) return order.customerName;
        if (order.metadata?.customer?.name) return order.metadata.customer.name; // 🛡️ URGENT: Redundancy fallback
        if (order.customerId && typeof window !== 'undefined') {
          const store = window.__MISHKAH_LAST_STORE__;
          // Try to find in loaded customers first (faster)
          const loaded = db.data.customers || [];
          const inLoaded = loaded.find(c => c.id === order.customerId);
          if (inLoaded) return inLoaded.name;

          // Fallback to raw store
          const profiles = store?.state?.modules?.pos?.tables?.customer_profiles || [];
          const found = profiles.find(p => p.id === order.customerId);
          if (found) return found.name;
        }
        return '—';
      })();

      const customerPhone = (() => {
        if (order.customerPhone) return order.customerPhone;
        if (order.customer_phone) return order.customer_phone; // snake_case fallback
        if (order.metadata?.customer?.phone) return order.metadata.customer.phone; // 🛡️ URGENT: Redundancy fallback
        if (order.customerId && typeof window !== 'undefined') {
          const store = window.__MISHKAH_LAST_STORE__;
          // Try to find in loaded customers first
          const loaded = db.data.customers || [];
          const inLoaded = loaded.find(c => c.id === order.customerId);
          if (inLoaded) {
            if (Array.isArray(inLoaded.phones) && inLoaded.phones.length > 0) return inLoaded.phones[0];
            if (inLoaded.phone) return inLoaded.phone;
          }

          // Fallback to raw store
          const profiles = store?.state?.modules?.pos?.tables?.customer_profiles || [];
          const found = profiles.find(p => p.id === order.customerId);
          if (found) {
            if (Array.isArray(found.phones) && found.phones.length > 0) return found.phones[0];
            if (found.phone) return found.phone;
          }
        }
        return '—';
      })();

      return D.Tables.Tr({ attrs: { key: order.id, class: tw`bg-[var(--surface-1)]` } }, [
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm font-semibold` } }, [order.id]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [localize(typeConfig.label, db.env.lang)]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.Badge({ text: localize(stageMeta?.name || { ar: order.fulfillmentStage, en: order.fulfillmentStage }, db.env.lang), variant: 'badge/ghost' })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [UI.Badge({ text: localize(statusMeta?.name || { ar: order.status, en: order.status }, db.env.lang), variant: 'badge/ghost' })]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [localize(paymentMeta?.name || { ar: order.paymentState || '', en: order.paymentState || '' }, db.env.lang)]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [tableNames || '—']),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [customerName]),
        D.Tables.Td({ attrs: { class: tw`px-3 py-2 text-sm` } }, [customerPhone]),
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
        UI.HStack({ attrs: { class: tw`justify-between items-center gap-4` } }, [
          D.Containers.Div({ attrs: { class: tw`flex-1` } }, [
            UI.Tabs({ items: tabItems, activeId: activeTab, gkey: 'pos:orders:tab' })
          ]),
          UI.Button({
            attrs: { gkey: 'pos:orders:toggle-shift', class: tw`gap-2` },
            variant: ordersState.filterShift !== false ? 'secondary' : 'ghost',
            size: 'sm'
          }, [
            ordersState.filterShift !== false ? '✅' : '⬜',
            (db.env.lang === 'ar' ? 'ورديتي فقط' : 'My Shift Only')
          ])
        ]),
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
    const lang = db.env.lang || 'ar';
    let database = typeof window !== 'undefined' ? (window.database || {}) : {};
    const store = window.__POS_DB__;
    if (store && store.store?.state?.modules?.pos?.tables) {
      const storeState = store.store.state.modules.pos.tables;
      const storeHeaderCount = (storeState.job_order_header || []).length;
      const windowHeaderCount = (database.job_order_header || []).length;
      const storeDetailCount = (storeState.job_order_detail || []).length;
      const windowDetailCount = (database.job_order_detail || []).length;
      if (storeHeaderCount > windowHeaderCount || storeDetailCount > windowDetailCount) {
        database = {
          ...database,
          job_order_header: storeState.job_order_header || database.job_order_header || [],
          job_order_detail: storeState.job_order_detail || database.job_order_detail || [],
          job_order_detail_modifier: storeState.job_order_detail_modifier || database.job_order_detail_modifier || [],
          kitchen_sections: storeState.kitchen_sections || database.kitchen_sections || []
        };
      }
    }
    const translateJobStatus = (status) => {
      if (!status) return '';
      const key = `job_status_${status}`;
      return t.ui[key] || status;
    };
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
    const allHeaders = database.job_order_header || [];
    const headersRaw = allHeaders.filter(header => String(header.orderId || header.order_id) === String(orderId));
    const headers = headersRaw.map(normalizeHeader);
    const allDetails = database.job_order_detail || [];
    const details = allDetails.map(normalizeDetail);
    if (headers.length > 0) {

    }
    if (allDetails.length > 0) {

    }
    const detailMap = new Map();
    details.forEach(detail => {
      if (!detail || !detail.jobOrderId) return;
      const list = detailMap.get(detail.jobOrderId) || [];
      list.push(detail);
      detailMap.set(detail.jobOrderId, list);
    });
    const globalStore = typeof window !== 'undefined' ? window.__MISHKAH_LAST_STORE__ : null;
    const menuItemsRaw = [
      ...(Array.isArray(globalStore?.state?.modules?.pos?.tables?.menu_items) ? globalStore.state.modules.pos.tables.menu_items : []),
      ...(Array.isArray(db.data.menu?.items) ? db.data.menu.items : [])
    ];
    const menuItemsIndex = new Map();
    menuItemsRaw.forEach(item => {
      if (!item || !item.id) return;
      const key = String(item.id);
      if (!menuItemsIndex.has(key)) menuItemsIndex.set(key, item);
    });
    const kitchenSections = database.kitchen_sections || [];
    const stationsIndex = new Map(kitchenSections.map(section => [section.id, section]));
    const sectionIndex = new Map((Array.isArray(db.data.kitchenSections) ? db.data.kitchenSections : []).map(section => [section.id, section]));
    const findOrder = () => {
      const candidates = [db.data.order, ...(db.data.ordersQueue || []), ...(db.data.ordersHistory || [])];
      return candidates.find(entry => entry && String(entry.id) === String(orderId)) || null;
    };
    const orderRecord = findOrder();
    const orderLineIndex = new Map();
    if (orderRecord && Array.isArray(orderRecord.lines)) {
      orderRecord.lines.forEach(line => {
        const key = line.itemId || line.item_id;
        if (!key) return;
        if (!orderLineIndex.has(String(key))) orderLineIndex.set(String(key), line);
      });
    }
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
      const rawStatus = header.status || header.progressState || 'queued';
      const statusLabel = translateJobStatus(rawStatus);
      const progress = `${Number(header.completedItems || 0)} / ${Number(header.totalItems || header.jobs?.length || 0)}`;
      const itemRows = (detailMap.get(header.id) || []).map(detail => {
        const fallbackFromMenu = (() => {
          const itemId = detail.itemId || detail.itemCode;
          const menuItem = itemId ? menuItemsIndex.get(String(itemId)) : null;
          if (!menuItem) return '';
          if (lang === 'ar') {
            return menuItem.nameAr || menuItem.item_name?.ar || menuItem.nameEn || menuItem.item_name?.en || '';
          }
          return menuItem.nameEn || menuItem.item_name?.en || menuItem.nameAr || menuItem.item_name?.ar || '';
        })();
        const fallbackFromOrder = (() => {
          const itemId = detail.itemId || detail.itemCode;
          const line = itemId ? orderLineIndex.get(String(itemId)) : null;
          if (!line) return '';
          const lineName = line.name || line.item_name || line.itemName;
          if (!lineName) return '';
          if (typeof lineName === 'string') return lineName;
          return lang === 'ar' ? (lineName.ar || lineName.en || '') : (lineName.en || lineName.ar || '');
        })();
        const itemLabel = lang === 'ar'
          ? (detail.itemNameAr || detail.itemNameEn || fallbackFromOrder || fallbackFromMenu || detail.itemCode || detail.id)
          : (detail.itemNameEn || detail.itemNameAr || fallbackFromOrder || fallbackFromMenu || detail.itemCode || detail.id);
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
      closeGkey: 'pos:order:jobs:details:close',
      actions: [UI.Button({ attrs: { gkey: 'pos:order:jobs:details:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
    });
  }
  function activateOrder(ctx, order, options = {}) {
    if (!order) return;
    const isDraftOrder = order.id && String(order.id).startsWith('draft-');

    const typeConfig = getOrderTypeConfig(order.type || 'dine_in');
    const orderIsPersisted = isDraftOrder ? false : (order.isPersisted !== undefined ? order.isPersisted : true);
    let safeOrder = {
      ...order,
      lines: Array.isArray(order.lines)
        ? order.lines.map(line => ({
          ...line,
          isPersisted: orderIsPersisted ? true : line.isPersisted
        }))
        : [],
      notes: Array.isArray(order.notes) ? order.notes.map(note => ({ ...note })) : [],
      payments: Array.isArray(order.payments) ? order.payments.map(pay => ({ ...pay })) : [],
      dirty: false,
      discount: normalizeDiscount(order.discount),
      id: order.id,
      type: order.type || order.orderType || order.order_type || order.orderTypeId || order.order_type_id || 'dine_in',
      isPersisted: orderIsPersisted,
      tableIds: Array.isArray(order.tableIds) ? order.tableIds.slice() :
        (order.tableId ? [order.tableId] :
          (Array.isArray(order.metadata?.tableIds) ? order.metadata.tableIds.slice() : [])),
      tableId: order.tableId || (Array.isArray(order.tableIds) && order.tableIds.length ? order.tableIds[0] :
        (Array.isArray(order.metadata?.tableIds) ? order.metadata.tableIds[0] : null)),
      customerId: order.customerId || order.customer?.id || order.customer_id || null,
      customerAddressId: order.customerAddressId || order.customer_address_id || order.customer?.addressId || order.customer?.addresses?.[0]?.id || null,
      customerName: order.customerName || order.customer_name || order.customer?.name || '',
      customerPhone: order.customerPhone || order.customer_phone || order.customer?.phones?.[0] || order.customer?.phone || '',
      customerAddress: order.customerAddress || order.customer_address || order.customer?.addresses?.[0]?.line || order.customer?.addresses?.[0]?.title || '',
      customerAreaId: order.customerAreaId || order.customer_area_id || order.customer?.addresses?.[0]?.areaId || order.customer?.addresses?.[0]?.area_id || null,
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

    safeOrder = enrichOrderWithMenu(safeOrder);

    ctx.setState(s => {
      const data = s.data || {};
      const modals = { ...(s.ui?.modals || {}) };
      if (options.closeOrdersModal) modals.orders = false;
      const orderNavState = { ...(s.ui?.orderNav || {}) };
      if (options.hideOrderNavPad !== false) orderNavState.showPad = false;
      if (options.resetOrderNavValue) orderNavState.value = '';
      const paymentsSplit = safeOrder.isPersisted ? [] : (safeOrder.payments || []);
      const nextPayments = {
        ...(data.payments || {}),
        split: paymentsSplit
      };
      if (!Array.isArray(nextPayments.methods) || !nextPayments.methods.length) {
        nextPayments.methods = clonePaymentMethods(PAYMENT_METHODS);
      }

      const totals = calculateTotals(safeOrder.lines || [], data.settings || {}, safeOrder.type || 'dine_in', { orderDiscount: safeOrder.discount });

      const paymentEntries = getActivePaymentEntries({ ...safeOrder, totals }, nextPayments);
      const paymentSnapshot = summarizePayments(totals, paymentEntries);

      return {
        ...s,
        data: {
          ...data,
          order: {
            ...safeOrder,
            totals,
            paymentState: paymentSnapshot.state,
            type: safeOrder.type,
            allowAdditions: safeOrder.allowAdditions !== undefined ? safeOrder.allowAdditions : !!typeConfig.allowsLineAdditions,
            lockLineEdits: safeOrder.lockLineEdits !== undefined ? safeOrder.lockLineEdits : true,
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
  async function openOrderById(ctx, orderId, options = {}) {
    if (!orderId) return false;
    const state = ctx.getState();
    const t = getTexts(state);

    let order = (state.data.ordersQueue || []).find(ord => ord && ord.id === orderId);
    if (!order) {
      const currentOrder = state.data.order;
      if (currentOrder && currentOrder.id === orderId) {
        order = currentOrder;
      }
    }
    if (!order && posDB.available) {
      try {
        order = await posDB.getOrder(orderId);
      } catch (error) {
        console.error('❌ [open-order HANDLER] Failed to fetch order:', error);
        UI.pushToast(ctx, { title: t.toast.orders_failed, message: String(error), icon: '🛑' });
      }
    }
    if (!order) {
      try {
        const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
        const posTables = store?.modules?.pos?.tables || {};
        const headers = posTables.order_header || [];
        const headerRow = headers.find(h => (h.id || h.order_id || h.orderId) === orderId);
        if (headerRow) {
          const header = sanitizeOrderHeaderRow(headerRow);
          const type = normalizeOrderTypeId(header.orderTypeId || header.order_type_id || header.type || header.orderType || 'dine_in');
          const status = normalizeStatusId(header.statusId || header.status_id || header.status || 'open');
          const stage = normalizeStageId(header.stageId || header.stage_id || header.fulfillmentStage || header.stage || 'new');
          const paymentState = normalizePaymentStateId(header.paymentStateId || header.payment_state_id || header.paymentState || 'unpaid');
          const lineRows = (posTables.order_line || []).filter(l => (l.orderId || l.order_id) === orderId);
          const paymentRows = (posTables.order_payment || []).filter(p => (p.orderId || p.order_id) === orderId);
          const lineContext = { orderId, stageId: stage, createdAt: header.openedAt || header.createdAt, updatedAt: header.updatedAt || header.openedAt };
          const lines = lineRows.map(row => {
            const normalized = sanitizeOrderLineRow(row);
            if (!normalized) return null;
            const line = normalizeOrderLine(normalized, lineContext);
            if (!line) return null;
            return { ...line, isPersisted: true };
          }).filter(Boolean);
          const payments = paymentRows.map(row => {
            const normalized = sanitizeOrderPaymentRow(row);
            if (!normalized) return null;
            return {
              id: normalized.id,
              method: normalized.methodId || normalized.method_id || normalized.method || 'cash',
              amount: round(Number(normalized.amount || 0))
            };
          }).filter(Boolean);
          order = {
            id: header.id,
            type,
            status,
            fulfillmentStage: stage,
            paymentState,
            tableIds: Array.isArray(header.tableIds) ? header.tableIds.slice() : [],
            notes: Array.isArray(header.notes) ? header.notes : [],
            lines,
            payments,
            discount: normalizeDiscount(header.discount),
            totals: {
              subtotal: Number(header.subtotal || 0),
              service: Number(header.service || header.serviceAmount || 0),
              vat: Number(header.tax || header.taxAmount || 0),
              discount: Number(header.discountAmount || 0),
              deliveryFee: Number(header.deliveryFee || 0),
              due: Number(header.totalDue || header.total_due || 0)
            },
            customerId: header.customerId || header.customer_id || null,
            customerAddressId: header.customerAddressId || header.customer_address_id || null,
            openedAt: header.openedAt || header.opened_at || header.createdAt || Date.now(),
            updatedAt: header.updatedAt || header.updated_at || Date.now(),
            savedAt: header.updatedAt || header.updated_at || Date.now(),
            shiftId: header.shiftId || header.shift_id || null,
            metadata: header.metadata || {},
            isPersisted: true
          };
        }
      } catch (error) {
        console.warn('⚠️ [open-order HANDLER] Failed to load order from store:', error);
      }
    }
    if (!order) {
      console.error('❌ [open-order HANDLER] Order not found!');
      return false;
    }

    try {
      const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
      const posTables = store?.modules?.pos?.tables || {};
      const rawLines = posTables.order_line || [];
      const rawPayments = posTables.order_payment || [];

      const lines = rawLines.filter(l => (l.orderId || l.order_id) === orderId);
      if (lines.length) {
        order = {
          ...order,
          lines: lines.map(l => {
            const qty = Number(l.qty || l.quantity || 1);
            const price = Number(l.unitPrice || l.unit_price || l.price || 0);
            const total = Number(l.lineTotal || l.line_total || (qty * price) || 0);
            return {
              ...l,
              qty,
              price,
              total
            };
          })
        };
      } else if (!order.lines || order.lines.length === 0) {
        console.warn('⚠️ [open-order] No lines found in store for order:', orderId);
      }

      const payments = rawPayments.filter(p => (p.orderId || p.order_id) === orderId);
      if (payments.length) {
        order = {
          ...order,
          payments: payments.map(p => ({
            id: p.id,
            method: p.methodId || p.method_id || p.method || 'cash',
            amount: Number(p.amount || 0)
          }))
        };
      }
    } catch (err) {
      console.warn('⚠️ [open-order] Failed to refresh lines from store:', err);
    }

    if (order.lines && order.lines.length > 0) {
      const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
      order.lines = order.lines.map(l => {
        let qty = Number(l.qty || l.quantity || 1);
        let total = Number(l.total || l.lineTotal || l.line_total || 0);
        let price = Number(l.price || l.unitPrice || l.unit_price || 0);
        if (!price && total > 0) {
          price = total / qty;
        }
        if (!price) {
          const menuItems = store?.modules?.pos?.tables?.menu_items || [];
          const item = menuItems.find(i => i.id === l.itemId || i.id === l.item_id);
          if (item) {
            price = Number(item.basePrice || item.pricing?.base || 0);
          }
        }
        if (!total && price > 0) {
          total = qty * price;
        }
        return { ...l, qty, price, total };
      });
    }

    activateOrder(ctx, order, { closeOrdersModal: options.closeOrdersModal !== false, resetOrderNavValue: true });
    ctx.setState(s => ({
      ...s,
      ui: {
        ...(s.ui || {}),
        modals: { ...(s.ui?.modals || {}), tables: false },
        reservation: { ...(s.ui?.reservation || {}), enabled: false, scheduledAt: null },
        orderMode: undefined
      }
    }));
    return true;
  }
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    // 🧾 URGENT FIX: Show Order Summary before Payment
    const orderSummarySection = D.Containers.Div({ attrs: { class: tw`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-3 space-y-2` } }, [
      D.Text.Strong({ attrs: { class: tw`text-sm flex items-center gap-2` } }, ['🧾', t.ui.order_summary || 'ملخص الطلب']),
      D.Containers.Div({ attrs: { class: tw`text-xs space-y-1 max-h-[120px] overflow-y-auto` } }, (order.lines || []).map(line =>
        D.Containers.Div({ attrs: { class: tw`flex justify-between items-center` } }, [
          D.Text.Span({}, [`${line.qty}x ${localize(line.name, db.env.lang)}`]),
          D.Text.Span({ attrs: { class: tw`font-mono` } }, [formatCurrencyValue(db, line.total)])
        ])
      ))
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
      header: D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2 flex-row-reverse` } }, [
        D.Containers.Div({ attrs: { class: tw`space-y-1 text-end` } }, [
          D.Text.Strong({}, [t.ui.payments]),
          D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [t.ui.split_payments])
        ]),
        UI.Button({ attrs: { gkey: 'pos:payments:close' }, variant: 'ghost', size: 'md', class: tw`bg-red-50 hover:bg-red-100 text-red-600` }, [D.Text.Span({ attrs: { class: tw`text-xl font-bold` } }, ['✕'])])
      ]),
      content: D.Containers.Div({ attrs: { class: tw`flex flex-col flex-1 min-h-0 pt-2` } }, [
        // Scrollable Top Section
        D.Containers.Div({ attrs: { class: tw`flex-1 overflow-y-auto space-y-3 pr-1 pb-2` } }, [
          remainingAmountSection,
          paymentsListSection,
          orderSummarySection,
          UI.ChipGroup({
            attrs: { class: tw`text-base sm:text-lg border-2 border-[var(--accent)]/20 rounded-lg p-2` },
            items: methods.map(method => ({
              id: method.id,
              label: `${method.icon} ${localize(method.label, db.env.lang)}`,
              attrs: {
                gkey: 'pos:payments:method',
                'data-method-id': method.id,
                class: tw`ring-2 ring-transparent data-[active=true]:bg-[var(--primary)] data-[active=true]:text-[var(--primary-foreground)] data-[active=true]:ring-[var(--primary)] data-[active=true]:scale-105 transition-all shadow-sm`
              }
            })),
            activeId: db.data.payments?.activeMethod || null
          })
        ].filter(Boolean)),

        // Fixed Bottom Section (Numpad)
        D.Containers.Div({ attrs: { class: tw`shrink-0 pt-3 border-t border-[var(--border)]` } }, [
          UI.NumpadDecimal({
            attrs: { class: tw`w-full` },
            value: db.ui.paymentDraft?.amount || '',
            placeholder: t.ui.amount,
            gkey: 'pos:payments:amount',
            confirmLabel: t.ui.capture_payment,
            confirmAttrs: { gkey: 'pos:payments:capture', variant: 'solid', size: 'md', class: tw`w-full` }
          })
        ])
      ])
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
        UI.Input({
          attrs: {
            value: inputValue,
            gkey: 'pos:discount:input',
            inputmode: 'decimal',
            placeholder: discountType === 'percent' ? '0%' : formatCurrencyValue(db, 0)
          }
        }),
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
  function LineQtyModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.lineQty) return null;
    const draft = db.ui.lineQty || {};
    const lineId = draft.lineId;
    const order = db.data.order || {};
    const line = (order.lines || []).find(entry => entry.id === lineId);
    if (!line) {
      return UI.Modal({
        open: true,
        size: 'sm',
        title: t.ui.qty || t.ui.quantity || 'الكمية',
        description: t.toast.order_nav_not_found,
        closeGkey: 'pos:line-qty:close',
        actions: [UI.Button({ attrs: { gkey: 'pos:line-qty:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
      });
    }
    const currentQty = draft.value ?? String(line.qty ?? 1);
    return UI.Modal({
      open: true,
      size: 'sm',
      title: t.ui.qty || t.ui.quantity || 'الكمية',
      description: localize(line.name, db.env.lang),
      closeGkey: 'pos:line-qty:close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        UI.Input({
          attrs: {
            value: currentQty,
            gkey: 'pos:line-qty:input',
            inputmode: 'decimal',
            placeholder: t.toast.set_qty || 'أدخل الكمية'
          }
        }),
        D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [t.ui.qty_decimal_hint || 'يسمح حتى 3 أرقام عشرية (مثال: 0.25)']),
        UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: currentQty,
          placeholder: t.toast.set_qty || 'أدخل الكمية',
          gkey: 'pos:line-qty:input',
          allowDecimal: true,
          confirmLabel: t.ui.apply || 'تطبيق',
          confirmAttrs: { gkey: 'pos:line-qty:apply', variant: 'solid', size: 'md', class: tw`w-full` }
        })
      ]),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:line-qty:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }
  function getNoteModalSettings(db) {
    return {
      size: db.ui?.modalSizes?.notes || 'xl',
      rows: Number(db.ui?.noteRows) || 10
    };
  }
  function OrderNoteModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.orderNote) return null;
    const order = db.data.order || {};
    const existingNotes = notesToText(order.notes, '\n');
    const draft = db.ui.orderNoteDraft || {};
    const value = draft.value || '';
    const settings = getNoteModalSettings(db);
    const existingPreview = existingNotes
      ? D.Containers.Div({ attrs: { class: tw`rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted-foreground)] whitespace-pre-line` } }, [
        D.Text.Strong({ attrs: { class: tw`block text-[11px] text-[var(--muted-foreground)] mb-1` } }, [t.ui.notes || 'الملاحظات الحالية']),
        D.Text.Span({}, [existingNotes])
      ])
      : null;
    return UI.Modal({
      open: true,
      size: settings.size,
      title: t.ui.notes || 'الملاحظات',
      description: t.toast.add_note || 'أدخل الملاحظات',
      closeGkey: 'pos:order-note:close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        UI.Textarea({
          attrs: {
            value,
            gkey: 'pos:order-note:input',
            rows: settings.rows,
            placeholder: t.toast.add_note || 'أدخل الملاحظات'
          }
        }),
        existingPreview
      ].filter(Boolean)),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:order-note:apply', class: tw`w-full` }, variant: 'solid', size: 'sm' }, [t.ui.save || 'حفظ']),
        UI.Button({ attrs: { gkey: 'pos:order-note:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
    });
  }
  function LineNoteModal(db) {
    const t = getTexts(db);
    if (!db.ui.modals.lineNote) return null;
    const draft = db.ui.lineNoteDraft || {};
    const lineId = draft.lineId;
    const order = db.data.order || {};
    const line = (order.lines || []).find(entry => entry.id === lineId);
    const settings = getNoteModalSettings(db);
    if (!line) {
      return UI.Modal({
        open: true,
        size: settings.size,
        title: t.ui.notes || 'الملاحظات',
        description: t.toast.order_nav_not_found,
        closeGkey: 'pos:line-note:close',
        actions: [UI.Button({ attrs: { gkey: 'pos:line-note:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
      });
    }
    const existingNotes = notesToText(line.notes, '\n');
    const value = draft.value || '';
    const existingPreview = existingNotes
      ? D.Containers.Div({ attrs: { class: tw`rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--muted-foreground)] whitespace-pre-line` } }, [
        D.Text.Strong({ attrs: { class: tw`block text-[11px] text-[var(--muted-foreground)] mb-1` } }, [t.ui.notes || 'الملاحظات الحالية']),
        D.Text.Span({}, [existingNotes])
      ])
      : null;
    return UI.Modal({
      open: true,
      size: settings.size,
      title: t.ui.notes || 'الملاحظات',
      description: localize(line.name, db.env.lang),
      closeGkey: 'pos:line-note:close',
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        UI.Textarea({
          attrs: {
            value,
            gkey: 'pos:line-note:input',
            rows: settings.rows,
            placeholder: t.toast.add_note || 'أدخل الملاحظات'
          }
        }),
        existingPreview
      ].filter(Boolean)),
      actions: [
        UI.Button({ attrs: { gkey: 'pos:line-note:apply', class: tw`w-full` }, variant: 'solid', size: 'sm' }, [t.ui.save || 'حفظ']),
        UI.Button({ attrs: { gkey: 'pos:line-note:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
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
        UI.Input({
          attrs: {
            value: value,
            gkey: 'pos:line-discount:input',
            inputmode: 'decimal',
            placeholder: type === 'percent' ? '0%' : formatCurrencyValue(db, 0)
          }
        }),
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
    const keypadValue = db.ui?.customer?.keypad || '';
    const showPhonePad = db.ui?.customer?.showPhonePad === true; // 🛡️ Default: HIDDEN
    const customers = Array.isArray(db.data.customers) ? db.data.customers : [];
    const normalizedSearch = searchValue.trim().toLowerCase();
    const filteredCustomers = normalizedSearch
      ? customers.filter(customer => {
        const nameMatch = (customer.name || '').toLowerCase().includes(normalizedSearch);
        const phoneMatch = (customer.phones || []).some(phone => String(phone).includes(normalizedSearch));
        return nameMatch || phoneMatch;
      })
      : customers;
    const displayLimit = db.ui?.customer?.displayLimit || (normalizedSearch ? 50 : 5);
    const displayedCustomers = filteredCustomers.slice(0, displayLimit);
    const hasMore = filteredCustomers.length > displayLimit;
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

    const customerList = displayedCustomers.length
      ? UI.List({
        children: [
          ...displayedCustomers.map(customer => UI.ListItem({
            leading: '👤',
            content: [
              D.Text.Strong({ attrs: { class: tw`text-sm` } }, [customer.name]),
              D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [(Array.isArray(customer.phones) ? customer.phones : (customer.phone ? [customer.phone] : [])).join(' • ')])
            ],
            trailing: customer.addresses?.length ? UI.Badge({ text: String(customer.addresses.length), variant: 'badge/ghost' }) : null,
            attrs: {
              gkey: 'pos:customer:select',
              'data-customer-id': customer.id,
              class: tw`${customer.id === selectedCustomerId ? 'border-[var(--primary)] bg-[color-mix(in oklab,var(--primary) 10%, var(--surface-1))]' : ''}`
            }
          })),
          hasMore ? UI.Button({
            attrs: { gkey: 'pos:customer:load-more', class: tw`w-full mt-2` },
            variant: 'ghost',
            size: 'sm'
          }, [`⚫️ تحميل المزيد (${filteredCustomers.length - displayLimit} متبقي)`]) : null
        ].filter(Boolean)
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
          D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2` } }, [
            D.Text.Span({ attrs: { class: tw`text-sm flex-1` } }, [
              `${t.ui.customer_phones}: ${customerUI.showPhones ? selectedCustomer.phones.join(' • ') : '••••••••'}`
            ]),
            UI.Button({
              attrs: { gkey: 'pos:customer:toggle-phones', class: tw`h-7 rounded-full px-2 text-xs` },
              variant: 'ghost',
              size: 'sm'
            }, [customerUI.showPhones ? '👁️' : '👁️‍🗨️'])
          ]),
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
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Text.Span({ attrs: { class: tw`text-sm ${token('muted')} flex-1` } }, [t.ui.customer_keypad || 'لوحة الأرقام']),
          UI.Button({ attrs: { gkey: 'pos:customer:phone-pad:toggle' }, variant: 'ghost', size: 'sm' }, [showPhonePad ? '🔼' : '🔽']) // 🛡️ Fixed: 🔽 when hidden, 🔼 when shown
        ]),
        showPhonePad ? UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: keypadValue,
          placeholder: t.ui.customer_keypad,
          gkey: 'pos:customer:keypad',
          allowDecimal: false,
          confirmLabel: t.ui.customer_search,
          confirmAttrs: { gkey: 'pos:customer:keypad:confirm', variant: 'solid', size: 'sm', class: tw`w-full` }
        }) : null,
        customerList
      ])
    });
    const formState = customerUI.form || createEmptyCustomerForm();
    const formPhones = Array.isArray(formState.phones) && formState.phones.length ? formState.phones : [''];
    const formAddresses = Array.isArray(formState.addresses) && formState.addresses.length ? formState.addresses : [{ ...createEmptyCustomerForm().addresses[0], title: t.ui.customer_address_home || 'المنزل' }];
    const phoneFields = D.Containers.Div({ attrs: { class: tw`space-y-2` } }, formPhones.map((phone, index) => UI.HStack({ attrs: { class: tw`items-center gap-2` } }, [
      UI.Input({ attrs: { value: phone, placeholder: t.ui.customer_phone, gkey: 'pos:customer:form:phone', 'data-index': index, inputmode: 'tel' } }),
      formPhones.length > 1 ? UI.Button({ attrs: { gkey: 'pos:customer:form:phone:remove', 'data-index': index, class: tw`h-9 rounded-full px-3 text-xs` }, variant: 'ghost', size: 'sm' }, ['✕']) : null
    ].filter(Boolean))));
    const addressFields = D.Containers.Div({ attrs: { class: tw`space-y-3` } }, formAddresses.map((address, index) => UI.Card({
      variant: 'card/soft-2',
      content: D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        UI.Field({ label: t.ui.customer_address_title, control: UI.Input({ attrs: { value: address.title || 'المنزل', gkey: 'pos:customer:form:address:title', 'data-index': index, placeholder: t.ui.customer_address_title } }) }),
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
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Text.Span({ attrs: { class: tw`text-sm ${token('muted')} flex-1` } }, [t.ui.customer_keypad || 'لوحة الأرقام']),
          UI.Button({ attrs: { gkey: 'pos:customer:phone-pad:toggle' }, variant: 'ghost', size: 'sm' }, [showPhonePad ? '🔼' : '🔽']) // 🛡️ Fixed: 🔽 when hidden, 🔼 when shown
        ]),
        showPhonePad ? UI.NumpadDecimal({
          attrs: { class: tw`w-full` },
          value: keypadValue,
          placeholder: t.ui.customer_keypad,
          gkey: 'pos:customer:keypad',
          allowDecimal: false,
          confirmLabel: t.ui.customer_add_phone,
          confirmAttrs: { gkey: 'pos:customer:form:keypad:confirm', variant: 'solid', size: 'sm', class: tw`w-full` }
        }) : null,
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
        closeGkey: 'pos:shift:summary:close',
        title: t.ui.shift_summary,
        description: t.ui.shift_history_empty,
        content: UI.EmptyState({ icon: '🧾', title: t.ui.shift_history_empty, description: '' }),
        actions: [UI.Button({ attrs: { gkey: 'pos:shift:summary:close', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])]
      });
    }
    const lang = db.env.lang;
    const allOrders = [
      ...(Array.isArray(db.data.ordersHistory) ? db.data.ordersHistory : []),
      ...(Array.isArray(db.data.ordersQueue) ? db.data.ordersQueue : [])
    ];
    const filteredOrders = allOrders.filter(order => order.shiftId === shift.id);
    const report = summarizeShiftOrders(filteredOrders, shift);
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
      viewingCurrent ? UI.Button({ attrs: { gkey: 'pos:shift:summary:print', 'data-shift-id': shift.id, class: tw`w-full` }, variant: 'soft', size: 'sm' }, [t.ui.shift_print_report || t.ui.print]) : null,
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
  function ShiftCloseConfirmModal(db) {
    const shiftUI = db.ui.shift || {};
    if (!shiftUI.confirmClose) return null;
    const t = getTexts(db);
    const current = db.data.shift?.current;
    if (!current) {
      return UI.Modal({
        open: true,
        size: db.ui?.modalSizes?.['shift-close'] || 'sm',
        sizeKey: 'shift-close',
        closeGkey: 'pos:shift:close:cancel',
        title: t.ui.shift_close_title || t.ui.shift_close,
        description: t.ui.shift_history_empty,
        actions: [
          UI.Button({ attrs: { gkey: 'pos:shift:close:cancel', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
        ]
      });
    }
    const payload = buildShiftReportPayload(db, current);
    const totalsByType = payload?.totalsByType || {};
    const paymentsByMethod = payload?.paymentsByMethod || {};
    const totalSales = payload?.totalSales || 0;
    const openingFloat = payload?.openingFloat || 0;
    const cashCollected = payload?.cashCollected || 0;
    const closingCash = payload?.closingCash || 0;
    const ordersCount = payload?.ordersCount || 0;
    const lang = db.env.lang;
    const paymentMethods = Array.isArray(db.data.payments?.methods) && db.data.payments.methods.length ? db.data.payments.methods : PAYMENT_METHODS;
    const paymentRows = paymentMethods.map(method => {
      const amount = round(paymentsByMethod[method.id] || 0);
      return UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Text.Span({}, [`${method.icon || '💳'} ${localize(method.label, lang)}`]),
        UI.PriceText({ amount, currency: getCurrency(db), locale: getLocale(db) })
      ]);
    });
    const totalsRows = ORDER_TYPES.map(type => {
      const amount = round(totalsByType[type.id] || 0);
      const count = payload?.countsByType?.[type.id] || 0;
      return UI.HStack({ attrs: { class: tw`${token('split')} text-sm` } }, [
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Text.Span({}, [localize(type.label, lang)]),
          count ? UI.Badge({ text: String(count), variant: 'badge/ghost', attrs: { class: tw`text-[0.65rem]` } }) : null
        ].filter(Boolean)),
        UI.PriceText({ amount, currency: getCurrency(db), locale: getLocale(db) })
      ]);
    });
    const totalsCard = UI.Card({
      variant: 'card/soft-1',
      title: t.ui.shift_total_sales,
      content: D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        ...totalsRows,
        UI.Divider(),
        UI.HStack({ attrs: { class: tw`${token('split')} text-base font-semibold` } }, [D.Text.Span({}, [t.ui.shift_total_sales]), UI.PriceText({ amount: totalSales, currency: getCurrency(db), locale: getLocale(db) })])
      ])
    });
    const paymentsCard = UI.Card({
      variant: 'card/soft-2',
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
    const metaCard = UI.Card({
      variant: 'card/soft-2',
      content: D.Containers.Div({ attrs: { class: tw`space-y-2 text-xs ${token('muted')}` } }, [
        D.Text.Span({}, [`POS: ${current.posLabel || POS_INFO.label}`]),
        D.Text.Span({}, [`${t.ui.shift}: ${current.id}`]),
        D.Text.Span({}, [`${t.ui.cashier}: ${current.cashierName || '—'}`]),
        D.Text.Span({}, [`${t.ui.shift_orders_count}: ${ordersCount}`])
      ])
    });
    const content = D.Containers.Div({ attrs: { class: tw`space-y-4` } }, [
      UI.EmptyState({ icon: '⚠️', title: t.ui.shift_close_title || t.ui.shift_close, description: t.ui.shift_close_warning || '' }),
      totalsCard,
      paymentsCard,
      cashCard,
      metaCard
    ]);
    return UI.Modal({
      open: true,
      size: db.ui?.modalSizes?.['shift-close'] || 'lg',
      sizeKey: 'shift-close',
      closeGkey: 'pos:shift:close:cancel',
      title: t.ui.shift_close_title || t.ui.shift_close,
      description: t.ui.shift_close_warning || '',
      content,
      actions: [
        UI.Button({ attrs: { gkey: 'pos:shift:summary:print', 'data-shift-id': current.id, class: tw`w-full` }, variant: 'soft', size: 'sm' }, [t.ui.shift_print_report || t.ui.print]),
        UI.Button({ attrs: { gkey: 'pos:shift:close:confirm', class: tw`w-full` }, variant: 'solid', size: 'sm' }, [t.ui.shift_close_confirm]),
        UI.Button({ attrs: { gkey: 'pos:shift:close:cancel', class: tw`w-full` }, variant: 'ghost', size: 'sm' }, [t.ui.close])
      ]
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
        ShiftCloseConfirmModal(db),
        TablesModal(db),
        ReservationsModal(db),
        // SchedulesModal from external module
        (window.ScheduleModule && typeof window.ScheduleModule.SchedulesModal === 'function')
          ? window.ScheduleModule.SchedulesModal(db)
          : null,
        PrintModal(db),
        OrderNoteModal(db),
        LineNoteModal(db),
        LineModifiersModal(db),
        LineDiscountModal(db),
        LineQtyModal(db),
        ReturnsModal(db),
        DiscountOrderModal(db),
        PaymentsSheet(db),
        OrdersQueueModal(db),
        OrdersJobStatusModal(db),
        db.ui?.toasts ? UI.ToastHost({ toasts: db.ui.toasts }) : null
      ].filter(Boolean)
    });
  });
  function installRealtimeCustomerWatchers() {
    // 🛡️ User Request: Ensure we use the proper "simple-store" watch system, 
    // but ALSO ensure we don't start empty using the global store as bootstrap.

    // 1. Initial Hydration (Bootstrap)
    let cachedProfiles = [];
    let cachedAddresses = [];
    let hydrationAttempts = 0;

    const hydrateFromGlobalStore = () => {
      try {
        const globalStore = window.__MISHKAH_LAST_STORE__;
        if (globalStore?.state?.modules?.pos?.tables) {
          const rawProfiles = globalStore.state.modules.pos.tables.customer_profiles || globalStore.state.modules.pos.tables.customer_profile || [];
          const rawAddresses = globalStore.state.modules.pos.tables.customer_addresses || globalStore.state.modules.pos.tables.customer_address || [];

          if (rawProfiles.length > 0 || rawAddresses.length > 0) {
            cachedProfiles = rawProfiles;
            cachedAddresses = rawAddresses;
            return true; // Success
          }
        }
      } catch (e) {
        console.warn('[POS] Customer hydration warning:', e);
      }
      return false; // Failed or empty
    };

    const updateState = () => {
      // 🛡️ Deduplicate profiles by ID
      const uniqueProfiles = [];
      const seenIds = new Set();
      (cachedProfiles || []).forEach(p => {
        if (p && p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          uniqueProfiles.push(p);
        }
      });

      // Join profiles and addresses
      const joined = uniqueProfiles.map(p => ({
        ...p,
        addresses: cachedAddresses.filter(a => a.customerId === p.id || a.customer_id === p.id)
      }));

      // Sort by recency (optional, but good for "Top 5") - usually ID is timestamp-ish or sequential
      // joined.sort((a, b) => String(b.id).localeCompare(String(a.id))); 

      if (appRef && typeof appRef.setState === 'function') {
        appRef.setState(prev => ({
          ...prev,
          data: { ...(prev.data || {}), customers: joined }
        }));
      } else {
        posState.data.customers = joined;
      }
    };

    // Attempt 1: Immediate
    if (hydrateFromGlobalStore()) {
      updateState();
    } else {
      // Attempt 2-10: Polling (Race Condition Fix)
      const interval = setInterval(() => {
        hydrationAttempts++;
        if (hydrateFromGlobalStore()) {
          updateState();
          clearInterval(interval);
        } else if (hydrationAttempts > 10) {
          console.warn('[POS] Gave up waiting for global store hydration (customers).');
          clearInterval(interval);
        }
      }, 500);
    }

    // 🛡️ Expose updateState globally for manual refresh after save
    if (typeof window !== 'undefined') {
      window.__installRealtimeCustomerWatchers_updateState = updateState;
    }

    if (!posDB.available || typeof posDB.watch !== 'function') return;

    // 2. Install Realtime Watchers
    posDB.watch('customer_profiles', (list) => {
      if (Array.isArray(list)) {
        cachedProfiles = list;
        updateState();
      }
    });

    posDB.watch('customer_addresses', (list) => {
      if (Array.isArray(list)) {
        cachedAddresses = list;
        updateState();
      }
    });
  }

  const app = M.app.createApp(posState, {});
  appRef = app;
  if (appRef && typeof appRef.setState === 'function' && !appRef.__shiftGuardApplied) {
    const originalSetState = appRef.setState.bind(appRef);
    appRef.setState = (updater) => {
      const wrapped = (prev) => {
        const next = (typeof updater === 'function')
          ? updater(prev)
          : { ...prev, ...(updater || {}) };
        const guardedData = enforceShiftGuard(prev?.data || {}, next?.data || {});
        if (guardedData !== next?.data) {
          return { ...next, data: guardedData };
        }
        return next;
      };
      return originalSetState(wrapped);
    };
    appRef.__shiftGuardApplied = true;
  }
  if (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__) {
    applyShiftGuardToStore(window.__MISHKAH_LAST_STORE__);
  }

  if (kdsBridge && typeof kdsBridge.connect === 'function') {
    try { kdsBridge.connect(app); } catch (err) { console.warn('[KDS] Auto-connect failed', err); }
  }

  // Install Watchers immediately (no timeout)
  installRealtimeCustomerWatchers();

  // 🛡️ Context Menu & Text Selection re-enabled by user request
  // if (typeof window !== 'undefined') {
  //   window.addEventListener('contextmenu', (e) => {
  //     // Allow context menu only on inputs or specifically allowed elements
  //     if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('[data-allow-context]')) return;
  //     e.preventDefault();
  //   }, { passive: false });

  //   // Add global style for user-select: none
  //   const style = document.createElement('style');
  //   style.innerHTML = `
  //   * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  //   input, textarea { -webkit-user-select: text; user-select: text; }
  // `;
  //   document.head.appendChild(style);
  // }

  flushPendingKdsMessages();
  if (pendingRemoteResult) {
    flushRemoteUpdate();
  }
  const POS_DEV_TOOLS = {
    async resetIndexedDB() {
      if (!posDB.available || typeof posDB.resetAll !== 'function') {

        return false;
      }
      await posDB.resetAll();
      invoiceSequence = 0;
      await refreshPersistentSnapshot({ focusCurrent: false, syncOrders: true });

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
        ui: {
          ...(s.ui || {}),
          modalOpen: false,
          modals: current,
          jobStatus: null,
          shift: { ...(s.ui?.shift || {}), showSummary: false, showPin: false, confirmClose: false }
        }
      };
    });
    return true;
  }
  async function finalizeShiftClose(ctx) {
    const state = ctx.getState();
    const t = getTexts(state);
    const currentShift = state.data.shift?.current;
    if (!currentShift) {
      ctx.setState(s => ({
        ...s,
        ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: false, confirmClose: false } }
      }));
      return;
    }
    const localUserId = (() => {
      try {
        const raw = window.localStorage?.getItem('mishkah_user');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.userID || null;
      } catch (_err) {
        return null;
      }
    })();
    if (localUserId && currentShift?.metadata?.userID !== localUserId) {
      UI.pushToast(ctx, { title: t.ui.shift_open, message: 'لا يمكن إغلاق وردية مستخدم آخر', icon: '🔒' });
      ctx.setState(s => ({
        ...s,
        ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: false, confirmClose: false, showPin: true, pin: '' } }
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
    const allOrders = [
      ...(Array.isArray(state.data.ordersHistory) ? state.data.ordersHistory : []),
      ...(Array.isArray(state.data.ordersQueue) ? state.data.ordersQueue : [])
    ];
    const summary = summarizeShiftOrders(allOrders, sanitizedCurrent);
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
      // If remote close succeeded, use the returned data
      if (remoteClosed) {
        closedShift = { ...closedShift, ...remoteClosed };
      } else {
        // Remote close failed but we continue with local data
        console.warn('[Mishkah][POS] remote shift close failed, continuing with local data');
      }
    } catch (err) {
      console.warn('[Mishkah][POS] remote shift close failed', err);
    }
    if (posDB.available) {
      try {
        // Delete the shift from IndexedDB instead of updating it
        // This prevents it from reappearing after refreshPersistentSnapshot
        await posDB.deleteRecord('pos_shift', currentShift.id);
        console.log('[Mishkah][POS] Closed shift deleted from IndexedDB:', currentShift.id);
      } catch (error) {
        console.warn('[Mishkah][POS] Failed to delete shift from IndexedDB', error);
        // Continue anyway - the shift is closed on the server
      }
    }
    const normalizedClosed = SHIFT_TABLE.createRecord({
      ...closedShift,
      totalsByType: closedShift.totalsByType || summary.totalsByType,
      paymentsByMethod: closedShift.paymentsByMethod || paymentsByMethod,
      countsByType: closedShift.countsByType || summary.countsByType,
      orders: Array.isArray(closedShift.orders) ? closedShift.orders : summary.orders
    });
    if (typeof window !== 'undefined') {
      window.__POS_ALLOW_SHIFT_CLEAR__ = true;
    }
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
      ui: {
        ...(s.ui || {}),
        shift: { ...(s.ui?.shift || {}), showSummary: true, confirmClose: false, viewShiftId: normalizedClosed.id }
      }
    }));
    if (typeof window !== 'undefined') {
      setTimeout(() => { window.__POS_ALLOW_SHIFT_CLEAR__ = false; }, 0);
    }
    await refreshPersistentSnapshot({ focusCurrent: false, syncOrders: true });
    UI.pushToast(ctx, { title: t.toast.shift_close_success, icon: '✅' });
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
            try { preferencesStore.set('modalSizes', next); } catch (err) { console.warn('[Mishkah][POS] modal size persist failed', err); }
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
            try { preferencesStore.set('themePrefs', prefs); } catch (err) { console.warn('[Mishkah][POS] theme prefs persist failed', err); }
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
            try { preferencesStore.set('themePrefs', prefs); } catch (err) { console.warn('[Mishkah][POS] theme prefs persist failed', err); }
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
            try { preferencesStore.set('themePrefs', prefs); } catch (err) { console.warn('[Mishkah][POS] theme prefs persist failed', err); }
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
          const canMergeAny = !isPersisted;
          const idx = canMergeAny
            ? lines.findIndex(line => String(line.itemId) === String(item.id))
            : lines.findIndex(line => !line.isPersisted && (!line.status || line.status === 'draft') && String(line.itemId) === String(item.id));
          if (idx >= 0) {
            const existing = lines[idx];
            lines[idx] = updateLineWithPricing(existing, { qty: (existing.qty || 0) + 1, updatedAt: Date.now() });
          } else {
            lines.push(createOrderLine(item, 1, { kitchenSection: item.kitchenSection, isPersisted: false }));
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
                dirty: true,
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
          if (isLineLockedForEdit(order, line)) {
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
          if (isLineLockedForEdit(order, target)) {
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
        if (current && isLineLockedForEdit(state.data.order, current)) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), lineQty: true },
            lineQty: { lineId, value: current ? String(current.qty) : '' }
          }
        }));
      }
    },
    'pos.line-qty.input': {
      on: ['input', 'change'],
      gkeys: ['pos:line-qty:input'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            lineQty: { ...(s.ui?.lineQty || {}), value }
          }
        }));
      }
    },
    'pos.line-qty.apply': {
      on: ['click'],
      gkeys: ['pos:line-qty:apply'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const draft = state.ui.lineQty || {};
        const lineId = draft.lineId;
        const order = state.data.order || {};
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        if (isLineLockedForEdit(order, line)) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const qtyValue = normalizeQtyInput(draft.value, 3);
        if (!qtyValue || qtyValue <= 0) {
          UI.pushToast(ctx, { title: t.toast.set_qty || 'قيمة غير صحيحة', icon: '⚠️' });
          return;
        }
        const qty = Math.max(0.001, qtyValue);
        const now = Date.now();
        ctx.setState(s => {
          const data = s.data || {};
          const nextOrder = data.order || {};
          const lines = (nextOrder.lines || []).map(item => {
            if (item.id !== lineId) return item;
            return updateLineWithPricing(item, { qty, updatedAt: now });
          });
          const totals = calculateTotals(lines, data.settings || {}, nextOrder.type, { orderDiscount: nextOrder.discount });
          const paymentEntries = getActivePaymentEntries({ ...nextOrder, lines, totals }, data.payments);
          const paymentSnapshot = summarizePayments(totals, paymentEntries);
          return {
            ...s,
            data: {
              ...data,
              order: { ...nextOrder, lines, totals, paymentState: paymentSnapshot.state, updatedAt: now, dirty: true }
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), lineQty: false },
              lineQty: null
            }
          };
        });
      }
    },
    'pos.line-qty.close': {
      on: ['click'],
      gkeys: ['pos:line-qty:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), lineQty: false },
            lineQty: null
          }
        }));
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
        if (isLineLockedForEdit(order, line)) {
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
        if (isLineLockedForEdit(order, line)) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), lineNote: true },
            lineNoteDraft: { lineId, value: '' }
          }
        }));
      }
    },
    'pos.order-note.input': {
      on: ['input', 'change'],
      gkeys: ['pos:order-note:input'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            orderNoteDraft: { ...(s.ui?.orderNoteDraft || {}), value }
          }
        }));
      }
    },
    'pos.order-note.apply': {
      on: ['click'],
      gkeys: ['pos:order-note:apply'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const value = (state.ui?.orderNoteDraft?.value || '').trim();
        if (!value) {
          ctx.setState(s => ({
            ...s,
            ui: { ...(s.ui || {}), modals: { ...(s.ui?.modals || {}), orderNote: false }, orderNoteDraft: null }
          }));
          return;
        }
        const now = Date.now();
        const user = state.data.user || {};
        const noteEntry = {
          id: `note-${now.toString(36)}`,
          message: value,
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
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), orderNote: false },
              orderNoteDraft: null
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.notes_updated, icon: '📝' });
      }
    },
    'pos.order-note.close': {
      on: ['click'],
      gkeys: ['pos:order-note:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), orderNote: false },
            orderNoteDraft: null
          }
        }));
      }
    },
    'pos.line-note.input': {
      on: ['input', 'change'],
      gkeys: ['pos:line-note:input'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            lineNoteDraft: { ...(s.ui?.lineNoteDraft || {}), value }
          }
        }));
      }
    },
    'pos.line-note.apply': {
      on: ['click'],
      gkeys: ['pos:line-note:apply'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        const draft = state.ui?.lineNoteDraft || {};
        const lineId = draft.lineId;
        const order = state.data.order || {};
        const line = (order.lines || []).find(entry => entry.id === lineId);
        if (!line) {
          UI.pushToast(ctx, { title: t.toast.order_nav_not_found, icon: '❓' });
          return;
        }
        if (isLineLockedForEdit(order, line)) {
          UI.pushToast(ctx, { title: t.toast.line_locked, icon: '🔒' });
          return;
        }
        const value = (draft.value || '').trim();
        const now = Date.now();
        const user = state.data.user || {};
        const noteEntry = value
          ? {
            id: `note-${now.toString(36)}`,
            message: value,
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
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), lineNote: false },
              lineNoteDraft: null
            }
          };
        });
        UI.pushToast(ctx, { title: t.toast.notes_updated, icon: '📝' });
      }
    },
    'pos.line-note.close': {
      on: ['click'],
      gkeys: ['pos:line-note:close'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), lineNote: false },
            lineNoteDraft: null
          }
        }));
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
        if (isLineLockedForEdit(order, line)) {
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
        const modId = btn.getAttribute('data-mod-id');
        const modType = btn.getAttribute('data-mod-type');
        const lineId = btn.getAttribute('data-line-id');
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
        if (isLineLockedForEdit(order, line)) {
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
              pendingAction: null,
              reservation: {
                ...(s.ui?.reservation || {}),
                enabled: false,
                scheduledAt: null,
                duration: null
              }
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
              value: ''
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
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), orderNote: true },
            orderNoteDraft: { value: '' }
          }
        }));
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
        if (IS_SAVING_ORDER) {
          console.warn('⚠️ [POS SAVE] Save already in progress - BLOCKING duplicate save attempt');
          return;
        }
        const state = ctx.getState();
        const t = getTexts(state);
        const order = state.data.order || {};
        const lines = order.lines || [];
        const validLines = lines.filter(line => {
          const notCancelled = !line.cancelled && !line.voided;
          const hasQuantity = Number(line.qty || line.quantity || 0) > 0;
          return notCancelled && hasQuantity;
        });

        if (!validLines.length) {
          console.error('❌ [POS SAVE] BLOCKED: Cannot save empty order - no valid lines!');
          UI.pushToast(ctx, {
            title: t.toast.empty_order || 'لا يمكن حفظ طلب فارغ',
            subtitle: 'يجب إضافة صنف واحد على الأقل',
            icon: '⚠️'
          });
          return;
        }
        const totals = order.totals || calculateTotals(validLines, state.data.settings || {}, order.type || 'dine_in', { orderDiscount: order.discount });
        if (totals.due <= 0 && !order.isPersisted) {
          console.error('❌ [POS SAVE] BLOCKED: Cannot save order with zero or negative total!');
          UI.pushToast(ctx, {
            title: t.toast.order_zero_total || 'لا يمكن حفظ طلب بقيمة صفرية',
            subtitle: 'تأكد من أن جميع الأصناف لها أسعار صحيحة',
            icon: '⚠️'
          });
          return;
        }
        const isReservationMode = state.ui?.reservation?.enabled === true;
        const isScheduleOrder = order.metadata?.isSchedule || order.sourceScheduleId || String(order.id || '').startsWith('SCH-');
        const isScheduleConverted = order.metadata?.scheduleStatus === 'converted';
        if (isScheduleConverted) {
          UI.pushToast(ctx, { title: t.pos?.reservations?.converted_locked || 'حجز محول', message: 'لا يمكن حفظ أو تعديل هذا الحجز', icon: '🔒' });
          return;
        }
        if (isScheduleOrder && !state.ui?.reservation?.enabled) {
          ctx.setState(s => ({
            ...s,
            ui: {
              ...(s.ui || {}),
              reservation: {
                ...(s.ui?.reservation || {}),
                enabled: true,
                scheduledAt: order.metadata?.scheduledAt || order.scheduledAt || s.ui?.reservation?.scheduledAt || null
              }
            }
          }));
          UI.pushToast(ctx, { title: t.pos?.reservations?.save_required || 'هذا حجز مجدول', message: 'يرجى حفظ الحجز من وضع الحجز', icon: '📅' });
          return;
        }
        const trigger = e.target.closest('[data-save-mode]');
        const mode = trigger?.getAttribute('data-save-mode') || 'save';
        IS_SAVING_ORDER = true;
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), saving: true }
        }));
        // Get branch ID dynamics
        const branchId = state.data.branch?.id || window.__POS_BRANCH_ID__ || 'default';
        const moduleId = state.data.module?.id || 'pos';

        try {
          // Check if this is a scheduled order
          if (isReservationMode || isScheduleOrder) {

            // Call schedule save handler logic directly
            await handleScheduleSave(e, ctx);
          } else {
            // Normal order flow
            const result = await persistOrderFlow(ctx, mode);
          }
        } catch (error) {
          console.error('❌ [POS SAVE] Save failed:', error);
          throw error;
        } finally {
          IS_SAVING_ORDER = false;
          ctx.setState(s => ({
            ...s,
            ui: { ...(s.ui || {}), saving: false }
          }));
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
        const sessionUser = (typeof window !== 'undefined' && window.__POS_SESSION__) || {};
        const sessionPinCode = normalizePinValue(sessionUser.pinCode);
        console.group('[POS] 🔐 AUTHENTICATION CHECK');
        const employees = [];
        if (sessionUser.userId) {
          employees.push({
            id: sessionUser.userId,
            name: sessionUser.userName || sessionUser.userEmail || 'Session User',
            role: 'cashier',
            pin: sessionPinCode,
            allowedDiscountRate: 0,
            isSessionUser: true
          });
        }
        const fallbackPins = new Set();
        const registerFallbackPin = (pinValue) => {
          const normalized = normalizePinValue(pinValue);
          if (normalized) fallbackPins.add(normalized);
        };
        registerFallbackPin(sessionPinCode);
        registerFallbackPin(SHIFT_PIN_FALLBACK);
        const remoteSource = state.data?.remotes?.posDatabase || {};
        const remoteShiftSettings = resolveShiftSettings(remoteSource);
        const localSeedSource = state.data || {};
        const localShiftSettings = resolveShiftSettings(localSeedSource);
        registerFallbackPin(remoteShiftSettings?.pin);
        registerFallbackPin(remoteShiftSettings?.default_pin);
        registerFallbackPin(localShiftSettings?.pin);
        registerFallbackPin(state.data?.shift?.config?.fallbackPin);
        const matchedEmployee = employees.find(emp => emp.pin === normalizedPin);
        if (typeof window !== 'undefined' && window.console) {
          const debugEmployees = employees.map(emp => ({ id: emp.id, name: emp.name, role: emp.role, pin: emp.pin, fallback: emp.isFallback || false }));
          console.group('[Mishkah][POS] 🔐 SHIFT PIN VALIDATION - DETAILED DEBUGGING');
          console.table(debugEmployees);
          console.table(debugEmployees);
          if (!matchedEmployee) {
            console.warn('❌ NO EMPLOYEE MATCHED THE PIN!');
            employees.forEach((emp, i) => {
              const match = emp.pin === normalizedPin;
            });
          } else {
          }
          console.groupEnd();
        }
        let effectiveEmployee = matchedEmployee;
        if (!effectiveEmployee && fallbackPins.has(normalizedPin)) {
          effectiveEmployee = matchedEmployee || employees.find(emp => (emp.isFallback || false) && emp.pin === normalizedPin);
          if (!effectiveEmployee) {
            const fallbackUser = state.data.user || {};
            effectiveEmployee = {
              id: sessionUser.userId || fallbackUser.id || 'cashier-guest',
              name: sessionUser.userName || sessionUser.userEmail || fallbackUser.name || 'كاشير',
              role: fallbackUser.role || 'cashier',
              allowedDiscountRate: fallbackUser.allowedDiscountRate ?? 0,
              pin: normalizedPin,
              isFallback: true,
              isSessionUser: !!sessionUser.userId
            };
          }
        }
        if (!effectiveEmployee) {
          UI.pushToast(ctx, { title: t.toast.shift_pin_invalid, icon: '⚠️' });
          return;
        }
        const localUserProfile = (() => {
          try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            const raw = window.localStorage.getItem('mishkah_user');
            if (!raw) return null;
            return JSON.parse(raw);
          } catch (_) {
            return null;
          }
        })();
        const localUserId = localUserProfile?.userID || null;
        if (!localUserId) {
          UI.pushToast(ctx, { title: t.ui.shift_open, message: 'لا يمكن فتح وردية بدون userID صالح', icon: '⚠️' });
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
          const finalCashierId = localUserId;
          const finalCashierName = localUserProfile?.userName || localUserProfile?.userEmail || effectiveEmployee.name;
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
            cashierId: finalCashierId,
            cashierName: finalCashierName,
            employeeId: finalCashierId,
            userId: localUserId || finalCashierId,
            user_id: localUserId || finalCashierId,
            userr_insert: localUserId || finalCashierId,
            cashierRole: effectiveEmployee.role,
            status: 'open',
            closingCash: null,
            isClosed: false,
            createdAt: toIsoString(now),
            updatedAt: toIsoString(now),
            version: 1,
            metadata: {
              userID: localUserId,
              userName: localUserProfile?.userName || '',
              userEmail: localUserProfile?.userEmail || '',
              brname: localUserProfile?.brname || localUserProfile?.branchName || '',
              compid: localUserProfile?.compid || localUserProfile?.companyId || '',
              branch_id: localUserProfile?.branch_id || localUserProfile?.branchId || ''
            }
          };
          const validatedShift = SHIFT_TABLE.createRecord(baseShiftInput);
          const mainStore = window.__MISHKAH_LAST_STORE__;
          if (!mainStore || typeof mainStore.insert !== 'function') {
            console.error('❌ [POS] Mishkah store not available');
            UI.pushToast(ctx, { title: t.toast.shift_creation_failed || 'فشل فتح الوردية', icon: '🛑' });
            return;
          }
          const ack = await mainStore.insert('pos_shift', validatedShift);
          if (!ack || ack.error) {
            console.error('❌ [POS] Backend rejected shift creation:', ack?.error);
            UI.pushToast(ctx, { title: t.toast.shift_creation_failed || 'فشل فتح الوردية', icon: '🛑' });
            return;
          }
          persistedShift = {
            ...validatedShift,
            pendingConfirmation: false,
            confirmedViaWebSocket: true
          };
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              const storageKey = 'mishkah-pos-shift';
              window.localStorage.setItem(storageKey, JSON.stringify(persistedShift));
            } catch (e) {
              console.warn('[POS] Failed to save shift to localStorage:', e);
            }
          }
        } catch (error) {
          console.warn('[Mishkah][POS] shift open failed', error);
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
        const isAlreadyConfirmed = persistedShift.confirmedViaWebSocket || false;
        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            shift: {
              history: Array.isArray(s.data?.shift?.history) ? s.data.shift.history : [],
              current: {
                ...normalizedShift,
                pendingConfirmation: !isAlreadyConfirmed,
                confirmedViaWebSocket: isAlreadyConfirmed,
                createdAt: now
              },
              validation: {
                state: isAlreadyConfirmed ? 'valid' : 'checking',
                reason: isAlreadyConfirmed ? 'ack-confirmation' : 'awaiting-websocket-confirmation',
                lastCheckedAt: now
              }
            }
          },
          ui: {
            ...s.ui,
            shift: {
              showPin: false,
              pin: '',
              openingFloat: 0
            }
          }
        }));
        if (isAlreadyConfirmed) {
          UI.pushToast(ctx, {
            title: '✅ تم فتح الوردية بنجاح',
            message: `مرحباً ${effectiveEmployee.name}`,
            icon: '✅'
          });
        } else {
          UI.pushToast(ctx, {
            title: '⏳ جاري تأكيد الوردية...',
            message: 'في انتظار تأكيد الخادم',
            icon: '⏳'
          });
        }
        setTimeout(() => {
          const currentState = ctx.getState();
          const currentShift = currentState?.data?.shift?.current;
          if (currentShift?.id === normalizedShift.id && currentShift.pendingConfirmation && !currentShift.confirmedViaWebSocket) {
            console.warn('❌ [POS] Shift not confirmed by WebSocket within 10s - ROLLING BACK');
            const mainStore = window.__MISHKAH_LAST_STORE__;
            if (mainStore && typeof mainStore.insert === 'function') {
              mainStore.insert('pos_shift', {
                ...currentShift,
                pendingConfirmation: false,
                confirmedViaWebSocket: false,
                updatedAt: toIsoString(Date.now())
              }).then(() => {
                UI.pushToast(ctx, {
                  title: 'تمت محاولة تأكيد الوردية',
                  message: 'تمت إعادة إرسال الوردية للخادم',
                  icon: '✅'
                });
              }).catch(err => {
                console.warn('[POS] Failed to re-send shift to backend:', err);
              });
            }
            ctx.setState(s => ({
              ...s,
              data: {
                ...s.data,
                shift: {
                  ...s.data?.shift,
                  current: {
                    ...s.data?.shift?.current,
                    pendingConfirmation: true,
                    confirmedViaWebSocket: false,
                    validationStatus: 'checking'
                  },
                  validation: { state: 'checking', reason: 'websocket-timeout', lastCheckedAt: Date.now() }
                },
                status: {
                  ...(s.data?.status || {}),
                  shiftValidation: { state: 'checking', reason: 'websocket-timeout', lastCheckedAt: Date.now() }
                }
              }
            }));
            UI.pushToast(ctx, {
              title: 'تأخر تأكيد الوردية',
              message: 'سيتم الإبقاء عليها دون حذف',
              icon: '⏳'
            });
          }
        }, 10000);
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
        const preState = ctx.getState();
        const preScanShift = preState.data.shift?.current;
        const localUserId = (() => {
          try {
            const raw = window.localStorage?.getItem('mishkah_user');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed?.userID || null;
          } catch (_err) {
            return null;
          }
        })();
        await refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
        if (preScanShift?.pendingConfirmation) {
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              shift: {
                ...(s.data.shift || {}),
                current: (localUserId && preScanShift?.metadata?.userID !== localUserId) ? null : preScanShift
              }
            }
          }));
        }
        const state = ctx.getState();
        let current = state.data.shift?.current;
        const history = state.data.shift?.history || [];
        if (!current && preScanShift && preScanShift.status === 'open' && !preScanShift.isClosed && (!localUserId || preScanShift?.metadata?.userID === localUserId)) {
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              shift: { ...(s.data.shift || {}), current: preScanShift },
              user: { ...(s.data.user || {}), shift: preScanShift.id || s.data.user?.shift || '—', shiftNo: preScanShift.id || s.data.user?.shiftNo || '—' },
              order: { ...(s.data.order || {}), shiftId: preScanShift.id || null }
            }
          }));
          current = preScanShift;
        }
        if (!current) {
          ctx.setState(s => ({
            ...s,
            ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: false, showPin: true, pin: '' } }
          }));
          UI.pushToast(ctx, { title: t.ui.shift_open, message: t.ui.shift_open_prompt, icon: '🔓' });
          return;
        }
        const defaultId = current?.id || (history.length ? history[history.length - 1].id : null);
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), showSummary: true, viewShiftId: s.ui?.shift?.viewShiftId || defaultId, activeTab: 'summary' } }
        }));
      }
    },
    'pos.shift.summary.print': {
      on: ['click'],
      gkeys: ['pos:shift:summary:print'],
      handler: (e, ctx) => {
        if (typeof window === 'undefined') return;
        const state = ctx.getState();
        const t = getTexts(state);
        const btn = e.target.closest('[data-shift-id]');
        const shiftId = btn?.getAttribute('data-shift-id') || state.ui?.shift?.viewShiftId;
        const shift = resolveShiftById(state, shiftId);
        const payload = buildShiftReportPayload(state, shift);
        if (!payload) {
          UI.pushToast(ctx, { title: t.ui.shift_history_empty, icon: '⚠️' });
          return;
        }
        const size = state.data.print?.size || 'a4';
        const html = renderShiftReportHTML(state, payload, size);
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
          console.error('Shift report print failed', err);
        }
        UI.pushToast(ctx, { title: t.toast.browser_print_opened, icon: '🖨️' });
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
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), confirmClose: true } }
        }));
      }
    },
    'pos.shift.close.confirm': {
      on: ['click'],
      gkeys: ['pos:shift:close:confirm'],
      handler: async (e, ctx) => {
        await finalizeShiftClose(ctx);
      }
    },
    'pos.shift.close.cancel': {
      on: ['click'],
      gkeys: ['pos:shift:close:cancel'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), shift: { ...(s.ui?.shift || {}), confirmClose: false } }
        }));
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
                displayLimit: undefined, // Reset limit to default
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
                keypad: '',
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
    'pos.customer.load-more': {
      on: ['click'],
      gkeys: ['pos:customer:load-more'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), customer: { ...(s.ui?.customer || {}), displayLimit: (s.ui?.customer?.displayLimit || 50) + 50 } }
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

        // 🛡️ CRITICAL: Auto-select first address if none selected
        const finalAddress = address || (customer.addresses && customer.addresses.length > 0 ? customer.addresses[0] : null);
        const finalAddressId = finalAddress?.id || null;

        if (state.data.order?.type === 'delivery' && !finalAddress) {
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
                customerAddressId: finalAddressId,
                customerName: customer.name,
                customerPhone: customer.phones?.[0] || customer.phone || '',
                customerAddress: finalAddress?.street || finalAddress?.line || finalAddress?.label || '',
                customerAreaId: finalAddress?.area_id || finalAddress?.areaId || null
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
    'pos.customer.toggle-phones': {
      on: ['click'],
      gkeys: ['pos:customer:toggle-phones'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            customer: {
              ...(s.ui?.customer || {}),
              showPhones: !(s.ui?.customer?.showPhones || false)
            }
          }
        }));
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
    'pos.customer.phone-pad.toggle': {
      on: ['click'],
      gkeys: ['pos:customer:phone-pad:toggle'],
      handler: (e, ctx) => {
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), customer: { ...(s.ui?.customer || {}), showPhonePad: !(s.ui?.customer?.showPhonePad !== false) } }
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
          addresses.push({ id: null, title: 'المنزل', areaId: CAIRO_DISTRICTS[0]?.id || '', line: '', notes: '' });
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
      handler: async (e, ctx) => {
        // 🛡️ Debounce: Prevent duplicate saves
        const btn = e.target.closest('[gkey="pos:customer:save"]');
        if (btn && btn.hasAttribute('data-saving')) return;
        if (btn) btn.setAttribute('data-saving', 'true');
        const state = ctx.getState();
        const t = getTexts(state);
        const form = state.ui?.customer?.form || createEmptyCustomerForm();
        const name = (form.name || '').trim();
        const phones = (form.phones || []).map(phone => String(phone || '').trim()).filter(Boolean);

        // 🛡️ Validation
        if (!name || !phones.length) {
          UI.pushToast(ctx, { title: t.toast.customer_form_invalid, icon: '⚠️' });
          if (btn) btn.removeAttribute('data-saving');
          return;
        }

        // 🛡️ CRITICAL: Require at least one address
        const rawAddresses = form.addresses || [];
        if (!rawAddresses.length) {
          UI.pushToast(ctx, { title: 'يجب إضافة عنوان واحد على الأقل', icon: '⚠️' });
          if (btn) btn.removeAttribute('data-saving');
          return;
        }

        const addresses = rawAddresses.map((address, idx) => ({
          id: address.id || `ADDR-${Date.now().toString(36)}-${idx}`,
          title: address.title || 'المنزل', // 🛡️ Default to "Home"
          areaId: address.areaId || CAIRO_DISTRICTS[0]?.id || '',
          line: address.line || '',
          notes: address.notes || ''
        }));

        // 🛡️ CRITICAL: Detect if this is a new customer or existing
        const isNewCustomer = !form.id || !form.createdAt;
        const customerId = isNewCustomer ? `CUST-${Date.now().toString(36).toUpperCase()}` : form.id;

        const mainStore = window.__MISHKAH_LAST_STORE__;

        if (!mainStore || typeof mainStore.insert !== 'function') {
          console.error('❌ [POS] Mishkah store not available');
          UI.pushToast(ctx, { title: t.toast.customer_save_failed || 'فشل حفظ العميل', icon: '🛑' });
          if (btn) btn.removeAttribute('data-saving');
          return;
        }

        try {
          const now = Date.now();

          // 1. Prepare Profile Payload
          const profilePayload = {
            id: customerId,
            name,
            phones: phones,
            phone: phones[0] || null,
            updatedAt: now,
            createdAt: isNewCustomer ? now : form.createdAt
          };

          // 2. Prepare Address Payloads
          const addressPayloads = addresses.map(addr => ({
            id: addr.id,
            customer_id: customerId,
            label: addr.title,
            area_id: addr.areaId,
            street: addr.line,
            notes: addr.notes,
            is_primary: false,
            updatedAt: now
          }));
          if (addressPayloads.length > 0) addressPayloads[0].is_primary = true;

          // 3. Save Profile (INSERT for new, UPDATE for existing)
          let ack;
          if (isNewCustomer) {

            ack = await mainStore.insert('customer_profiles', profilePayload);
          } else {

            ack = await mainStore.update('customer_profiles', profilePayload);
          }

          if (ack && ack.error) {
            throw new Error(ack.error);
          }

          // 4. Save Addresses (Always INSERT - addresses are ephemeral per edit)
          for (const addr of addressPayloads) {
            try {
              const addrAck = await mainStore.insert('customer_addresses', addr);
              if (addrAck && addrAck.error) {
                console.error('❌ [POS] Address insert failed:', addrAck.error, addr);
              } else {

              }
            } catch (addrError) {
              console.error('❌ [POS] Address save exception:', addrError, addr);
            }
          }

          // 5. Update Order Context if necessary
          ctx.setState(s => {
            const currentOrder = s.data.order || {};
            let nextOrder = currentOrder;

            if (currentOrder.customerId && currentOrder.customerId === customerId) {
              const attachedAddress = addressPayloads.find(a => a.id === currentOrder.customerAddressId) || addressPayloads[0] || null;
              nextOrder = {
                ...currentOrder,
                customerName: profilePayload.name,
                customerPhone: profilePayload.phone || '',
                customerAddressId: attachedAddress?.id || null,
                customerAddress: attachedAddress?.street || attachedAddress?.label || '',
                customerAreaId: attachedAddress?.area_id || null
              };
            }

            return {
              ...s,
              data: { ...(s.data || {}), order: nextOrder },
              ui: {
                ...(s.ui || {}),
                customer: {
                  ...(s.ui?.customer || {}),
                  mode: 'search',
                  form: createEmptyCustomerForm(),
                  keypad: '',
                  selectedCustomerId: customerId,
                  selectedAddressId: nextOrder.customerAddressId || addressPayloads[0]?.id || null
                }
              }
            };
          });

          UI.pushToast(ctx, { title: t.toast.customer_saved, icon: '💾' });

          // 🛡️ Force UI refresh (trigger watcher emit)
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.__installRealtimeCustomerWatchers_updateState) {
              window.__installRealtimeCustomerWatchers_updateState();
            }
          }, 300);

        } catch (error) {
          console.error('❌ [POS] Customer save error:', error);
          UI.pushToast(ctx, { title: t.toast.customer_save_failed || 'فشل حفظ العميل', icon: '🛑' });
        } finally {
          // 🛡️ Release debounce lock
          const btn = e.target.closest('[gkey="pos:customer:save"]');
          if (btn) btn.removeAttribute('data-saving');
        }
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
          ...s,
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
    'pos.reservation.toggle': {
      on: ['change'],
      gkeys: ['pos:reservation:toggle'],
      handler: (e, ctx) => {
        const value = e.target.value;
        const enabled = value === 'schedule';
        const now = new Date();
        // Default to one hour from now if not set
        const nextHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            reservation: {
              ...(s.ui?.reservation || {}),
              enabled,
              scheduledAt: enabled ? (s.ui?.reservation?.scheduledAt || nextHour) : null
            }
          }
        }));
      }
    },
    'pos.reservation.date': {
      on: ['change', 'input'],
      gkeys: ['pos:reservation:date'],
      handler: (e, ctx) => {
        const value = e.target.value;
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            reservation: {
              ...(s.ui?.reservation || {}),
              scheduledAt: value
            }
          }
        }));
      }
    },
    // REMOVED: Duplicate handler consolidated below at line ~14962
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
    'pos.reservations.search': {
      on: ['input'],
      gkeys: ['pos:reservations:search'],
      handler: (e, ctx) => {
        const search = e.target?.value || '';
        ctx.setState(s => ({
          ...s,
          ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), search } }
        }));
      }
    },
    'pos.reservations.refresh': {
      on: ['click'],
      gkeys: ['pos:reservations:refresh'],
      handler: (e, ctx) => {
        // Force refresh from global store
        const store = (typeof window !== 'undefined') && (window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state);
        const posModule = store?.modules?.pos;
        const freshSchedules = posModule?.tables?.order_schedule || [];
        const freshLinks = posModule?.tables?.order_schedule_tables || [];

        ctx.setState(s => ({
          ...s,
          data: {
            ...s.data,
            order_schedule: freshSchedules.map(sch => ({ ...sch })),
            order_schedule_tables: freshLinks.map(link => ({ ...link }))
          }
        }));

        const state = ctx.getState();
        const t = getTexts(state);
        UI.pushToast(ctx, {
          title: t.toast?.reservations_refreshed || 'تم التحديث',
          message: `${freshSchedules.length} تم تحميل`,
          icon: '🔄'
        });
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
          const payload = {
            id: reservationId,
            customerName: form.customerName,
            phone: form.phone,
            partySize: form.partySize,
            scheduledAt: form.scheduledAt || Date.now(),
            holdUntil: form.holdUntil || null,
            tableIds: form.tableIds.slice(),
            status: form.status || 'booked',
            note: form.note || '',
            createdAt: form.createdAt || Date.now(),
            version: 1
          };
          if (typeof window !== 'undefined' && window.appRef) {
            applyModuleMutation(
              state.data.branch.id,
              state.data.modules.pos.id,
              'reservations',
              'module:save',
              payload
            ).catch(err => {
              console.error('Failed to persist reservation:', err);
            });
          }
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
    'pos.schedules.open-order': {
      on: ['click'],
      gkeys: ['pos:schedules:open-order'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-schedule-id]');
        if (!btn) return;
        const scheduleId = btn.getAttribute('data-schedule-id');
        if (!scheduleId) return;

        const state = ctx.getState();
        const t = getTexts(state);

        // 1. Resolve Schedule Data (Prioritize Store)
        let schedule = null;

        // Try Store first
        const store = window.__MISHKAH_LAST_STORE__?.state;
        const posModule = store?.modules?.pos;
        if (posModule?.tables?.order_schedule) {
          schedule = posModule.tables.order_schedule.find(s => s.id === scheduleId);
        }

        // Fallback to local state
        if (!schedule) {
          schedule = (state.data.order_schedule || state.data.reservations || []).find(res => res.id === scheduleId) || null;
        }

        if (!schedule) {
          console.error('[POS] Schedule not found for id:', scheduleId);
          UI.pushToast(ctx, { title: 'تعذر فتح الحجز', message: 'الحجز غير موجود', icon: '🛑' });
          return;
        }

        // 2. Map to Order Object (Unified Structure)
        const payload = typeof schedule.payload === 'string'
          ? JSON.parse(schedule.payload || '{}')
          : (schedule.payload || {});

        const rawLines = Array.isArray(schedule.lines) && schedule.lines.length
          ? schedule.lines
          : (payload.lines || []);

        const rawPayments = posModule?.tables?.order_schedule_payment || [];
        const relatedPayments = rawPayments.filter(p => p.scheduleId === schedule.id || p.schedule_id === schedule.id);

        const lines = rawLines.map((line, index) => {
          const quantity = Number(line.quantity ?? line.qty ?? 1);
          const unitPrice = Number(line.unitPrice ?? line.unit_price ?? line.price ?? 0);
          const name = line.itemName || line.item_name || line.name || '';

          // Parse notes if string
          let notes = line.notes;
          if (typeof notes === 'string') {
            try { notes = JSON.parse(notes); } catch (e) { notes = [notes]; }
          }
          if (!Array.isArray(notes)) notes = notes ? [String(notes)] : [];

          return {
            id: line.id || line.line_id || `${scheduleId}-LINE-${index + 1}`,
            itemId: line.itemId || line.item_id,
            name,
            qty: quantity,
            quantity,
            price: unitPrice,
            unitPrice,
            notes,
            // Preserve line total if exists, or activateOrder will recalc
            lineTotal: line.lineTotal || line.line_total
          };
        });

        const order = {
          id: schedule.id,
          sourceScheduleId: schedule.id,
          type: schedule.order_type || schedule.type || 'takeaway',
          status: 'open',
          tableIds: Array.isArray(schedule.tableIds) ? schedule.tableIds : (payload.tableIds || []),
          lines,
          payments: relatedPayments.map(p => ({
            methodId: p.methodId || p.method_id,
            amount: Number(p.amount || 0),
            isPersisted: true
          })),
          customerId: schedule.customerId || schedule.customer_id,
          metadata: {
            ...(schedule.metadata || {}),
            scheduledAt: schedule.scheduledAt || schedule.scheduled_at,
            duration: schedule.duration || schedule.duration_minutes,
            isSchedule: true
          }
        };

        activateOrder(ctx, order, {
          closeOrdersModal: false,
          resetOrderNavValue: true
        });

        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            orderMode: 'schedule',
            modals: {
              ...(s.ui?.modals || {}),
              schedules: false,
              reservations: false,
              tables: false
            }
          }
        }));

        UI.pushToast(ctx, { title: 'تم فتح الحجز', icon: '✅' });
      }
    },
    'pos.schedules.filter': {
      on: ['click'],
      gkeys: ['pos:schedules:filter'],
      handler: (e, ctx) => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        const status = btn.getAttribute('data-status') || 'pending';

        // Use setState pattern instead of imperative ScheduleModule.setFilter
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            schedules: { ...(s.ui?.schedules || {}), filter: status }
          }
        }));
      }
    },
    'pos.schedules.confirm': {
      on: ['click'],
      gkeys: ['pos:schedules:confirm'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-schedule-id]');
        if (!btn) return;
        const scheduleId = btn.getAttribute('data-schedule-id');
        if (!scheduleId) return;

        const state = ctx.getState();
        const t = getTexts(state);

        try {
          // Call API to confirm schedule
          if (window.ScheduleModule?.confirmSchedule) {
            await window.ScheduleModule.confirmSchedule(scheduleId);
          }

          // Reload schedules
          const schedules = window.ScheduleModule?.loadSchedules
            ? await window.ScheduleModule.loadSchedules({ status: 'all' })
            : [];

          ctx.setState(s => ({
            ...s,
            data: { ...(s.data || {}), schedules }
          }));

          UI.pushToast(ctx, {
            title: t.toast?.schedule_confirmed || 'تم تأكيد الحجز',
            icon: '✅'
          });
        } catch (err) {
          console.error('[POS] Failed to confirm schedule:', err);
          UI.pushToast(ctx, {
            title: t.toast?.schedule_confirm_failed || 'فشل تأكيد الحجز',
            message: String(err),
            icon: '🛑'
          });
        }
      }
    },
    'pos.schedules.close': {
      on: ['click'],
      gkeys: ['pos:schedules:close'],
      handler: (e) => {
        e.preventDefault();
        e.stopPropagation();
        const modal = document.querySelector('#reservations-modal');
        if (modal) modal.remove();
      }
    },
    'pos.reservations.convert': {
      on: ['click'],
      gkeys: ['pos:reservations:convert'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-reservation-id]');
        if (!btn) return;
        const resId = btn.getAttribute('data-reservation-id');
        const t = getTexts(ctx.getState());
        try {
          const result = await convertScheduleToOrder(ctx, resId);
          if (!result || !result.orderId) return;
          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              order_schedule: (s.data.order_schedule || []).map(res => res.id === resId ? { ...res, status: 'converted' } : res),
              reservations: (s.data.reservations || []).map(res => res.id === resId ? { ...res, status: 'converted' } : res)
            },
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), reservations: false }
            }
          }));
          UI.pushToast(ctx, { title: t.toast?.reservation_confirmed || 'Order Converted', icon: '✅' });
        } catch (err) {
          UI.pushToast(ctx, { title: 'Conversion Failed', message: String(err), icon: '🛑' });
        }
      }
    },
    'pos.reservations.select': {
      on: ['change'],
      gkeys: ['pos:reservations:select'],
      handler: (e, ctx) => {
        const id = e.target.getAttribute('data-id');
        const checked = e.target.checked;
        ctx.setState(s => {
          const current = s.ui?.reservations?.selection || [];
          const newSelection = checked ? [...current, id] : current.filter(i => i !== id);
          return { ...s, ui: { ...s.ui, reservations: { ...s.ui.reservations, selection: newSelection } } };
        });
      }
    },
    'pos.reservations.confirm': {
      on: ['click'],
      gkeys: ['pos:reservations:confirm'],
      handler: async (e, ctx) => {
        const id = e.target.getAttribute('data-id');
        if (!id) return;

        ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), saving: true } }));
        try {
          const t = getTexts(ctx.getState());
          const result = await convertScheduleToOrder(ctx, id);
          if (!result || !result.orderId) return;
          ctx.setState(s => ({
            ...s,
            data: {
              ...(s.data || {}),
              order_schedule: (s.data.order_schedule || []).map(res => res.id === id ? { ...res, status: 'converted' } : res),
              reservations: (s.data.reservations || []).map(res => res.id === id ? { ...res, status: 'converted' } : res)
            },
            ui: { ...(s.ui || {}), saving: false, modals: { ...(s.ui?.modals || {}), reservations: false, tables: false }, reservation: { enabled: false, scheduledAt: null } }
          }));
          UI.pushToast(ctx, { title: t.toast?.reservation_confirmed || 'Reservation Confirmed', icon: '✅' });
        } catch (err) {
          console.error(err);
          UI.pushToast(ctx, { title: 'Confirmation Failed', message: String(err), icon: '🛑' });
        } finally {
          ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), saving: false } }));
        }
      }
    },
    'pos.reservations.multiconfirm': {
      on: ['click'],
      gkeys: ['pos:reservations:multiconfirm'],
      handler: async (e, ctx) => {
        const selection = ctx.getState().ui?.reservations?.selection || [];
        if (!selection.length) return;

        ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), saving: true } }));
        try {
          for (const id of selection) {
            const result = await convertScheduleToOrder(ctx, id);
            if (!result || !result.orderId) {
              throw new Error('Batch Confirmation Failed');
            }
          }
          ctx.setState(s => ({
            ...s,
            data: {
              ...(s.data || {}),
              order_schedule: (s.data.order_schedule || []).map(res => selection.includes(res.id) ? { ...res, status: 'converted' } : res),
              reservations: (s.data.reservations || []).map(res => selection.includes(res.id) ? { ...res, status: 'converted' } : res)
            },
            ui: { ...(s.ui || {}), reservations: { ...(s.ui?.reservations || {}), selection: [] } }
          }));
          UI.pushToast(ctx, { title: `Confirmed ${selection.length} Reservations`, icon: '✅' });
        } catch (err) {
          console.error(err);
          UI.pushToast(ctx, { title: 'Batch Confirmation Failed', message: String(err), icon: '🛑' });
        } finally {
          ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), saving: false } }));
        }
      }
    },
    'pos.reservations.cancel': {
      on: ['click'],
      gkeys: ['pos:reservations:cancel'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-reservation-id]') || e.target.closest('[data-id]');
        if (!btn) return;
        const resId = btn.getAttribute('data-reservation-id') || btn.getAttribute('data-id');

        if (posDB && posDB.db) {
          await posDB.db.table('order_schedule').update(resId, { status: 'cancelled' });
        }
        UI.pushToast(ctx, { title: 'Schedule Cancelled', icon: '🚫' });
      }
    },
    'pos.reservations.open': {
      on: ['click'],
      gkeys: ['pos:reservations:open'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-id]');
        const scheduleId = btn?.getAttribute('data-id')
          || ctx.getState().data?.order?.sourceScheduleId
          || (ctx.getState().data?.order?.metadata?.isSchedule ? ctx.getState().data?.order?.id : null);

        // If data-id is present, open the specific schedule for viewing/editing
        if (scheduleId) {
          const state = ctx.getState();
          const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
          const posModule = store?.modules?.pos;
          const rawSchedules = posModule?.tables?.order_schedule || [];
          const rawScheduleLines = posModule?.tables?.order_schedule_line || [];
          const rawSchedulePayments = posModule?.tables?.order_schedule_payment || [];
          const rawScheduleTables = posModule?.tables?.order_schedule_tables || [];
          const schedule = rawSchedules.find(s => s.id === scheduleId);

          if (!schedule) {
            UI.pushToast(ctx, { title: 'Schedule Not Found', icon: '⚠️' });
            return;
          }

          // Parse payload to get order details
          const payload = typeof schedule.payload === 'string' ? JSON.parse(schedule.payload || '{}') : (schedule.payload || {});
          const scheduleType = schedule.order_type || schedule.type || payload.type || 'dine_in';
          const scheduledAt = schedule.scheduledAt || schedule.scheduled_at || payload.scheduledAt || null;
          const duration = schedule.duration || schedule.duration_minutes || payload.duration || 60;

          // Fetch lines from order_schedule_line table
          const scheduleLines = rawScheduleLines.filter(line => line.scheduleId === scheduleId || line.schedule_id === scheduleId);

          // Map schedule lines to order lines format
          const orderLines = scheduleLines.length > 0
            ? scheduleLines.map(line => {
              // ✅ CRITICAL FIX: item_name in DB is a STRING, not an object
              const parsedName = typeof line.item_name === 'string'
                ? (line.item_name.startsWith('{') || line.item_name.startsWith('"')
                  ? JSON.parse(line.item_name)
                  : line.item_name)
                : line.item_name;

              return {
                id: line.id,
                itemId: line.itemId || line.item_id,
                name: parsedName || line.itemName,
                qty: line.quantity,
                quantity: line.quantity,
                unitPrice: line.unitPrice || line.unit_price,
                price: line.unitPrice || line.unit_price,
                total: line.lineTotal || line.line_total || (line.quantity * (line.unitPrice || line.unit_price)),
                notes: line.notes || '',
                status: 'draft',
                stage: 'new'
              };
            })
            : (payload.lines || []); // Fallback to payload if no lines in table

          // Fetch payments from order_schedule_payment table
          const schedulePayments = rawSchedulePayments.filter(pmt => pmt.scheduleId === scheduleId || pmt.schedule_id === scheduleId);

          // Convert payments array to payment map (methodId -> amount)
          const paymentsMap = {};
          schedulePayments.forEach(pmt => {
            const methodId = pmt.methodId || pmt.method_id;
            const amount = pmt.amount || 0;
            if (methodId) {
              paymentsMap[methodId] = (paymentsMap[methodId] || 0) + amount;
            }
          });
          const paymentsSplit = schedulePayments.map(pmt => ({
            id: pmt.id || `pm-${Date.now()}`,
            method: pmt.methodId || pmt.method_id || 'cash',
            amount: round(Number(pmt.amount) || 0)
          })).filter(entry => entry.amount > 0);

          const scheduleTableIds = rawScheduleTables
            .filter(link => link.scheduleId === scheduleId || link.schedule_id === scheduleId)
            .map(link => link.tableId || link.table_id)
            .filter(Boolean);

          // Load the schedule into the order state for viewing/editing
          const scheduleStatus = schedule.status || payload.status || 'pending';
          const isPendingSchedule = scheduleStatus === 'pending';

          ctx.setState(s => ({
            ...s,
            data: {
              ...s.data,
              order: {
                id: schedule.id,  // ✅ Keep schedule ID for UPDATE
                isPersisted: true,
                customerId: schedule.customerId || schedule.customer_id,
                customerAddressId: schedule.customerAddressId || schedule.customer_address_id,
                type: scheduleType,
                sourceScheduleId: isPendingSchedule ? schedule.id : null,
                lines: orderLines,
                totals: payload.totals || {},
                discount: payload.discount || null,
                payments: paymentsSplit,
                notes: [],
                tableIds: scheduleTableIds.length ? scheduleTableIds : (payload.tableIds || []),
                lockLineEdits: !isPendingSchedule,
                metadata: {
                  ...(payload.metadata || {}),
                  isSchedule: isPendingSchedule,
                  scheduleStatus: scheduleStatus,
                  scheduledAt: scheduledAt,
                  duration: duration
                }
              },
              payments: {
                ...(s.data.payments || {}),
                split: paymentsSplit
              }
            },
            ui: {
              ...s.ui,
              reservation: {
                enabled: isPendingSchedule,                 // ✅ Only pending can edit/confirm
                scheduledAt: isPendingSchedule ? scheduledAt : null,
                duration: isPendingSchedule ? duration : null
              },
              modals: { ...(s.ui?.modals || {}), reservations: false, tables: false }, // Close reservations + tables modal
            }
          }));

          UI.pushToast(ctx, { title: 'Schedule Loaded', icon: '👁️' });
          return;
        }

        // Otherwise, open the reservations modal (existing logic below)
        const state = ctx.getState();
        const t = getTexts(state);

        // Load schedules from Store (Watch/WebSockets) fallback
        try {
          const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
          const posModule = store?.modules?.pos;

          // Fallback to local state if global store not ready
          const rawSchedules = posModule?.tables?.order_schedule || [];
          // If we have local schedule data from watcher, prefer that? No, merge or use what's available.

          if (rawSchedules.length > 0) {
            const rawPayments = posModule?.tables?.order_schedule_payment || [];
            const rawLinks = posModule?.tables?.order_schedule_tables || []; // Fetch table links
            const rawProfiles = posModule?.tables?.customer_profiles || []; // Fetch customer profiles
            const rawAddresses = posModule?.tables?.customer_addresses || []; // Fetch customer addresses

            const schedules = rawSchedules.map(s => {
              const payload = typeof s.payload === 'string' ? JSON.parse(s.payload || '{}') : (s.payload || {});
              const payments = rawPayments.filter(p => p.scheduleId === s.id || p.schedule_id === s.id);
              return {
                ...s,
                payload,
                lines: payload.lines || [],
                payments
              };
            });
            ctx.setState(s => ({
              ...s,
              data: {
                ...(s.data || {}),
                order_schedule: schedules, // Populate order_schedule directly
                order_schedule_tables: rawLinks, // Populate table links
                customer_profiles: rawProfiles, // Populate customer profiles for lookup
                customer_addresses: rawAddresses // Populate addresses for lookup
              },
              ui: {
                ...(s.ui || {}),
                modals: { ...(s.ui?.modals || {}), reservations: true },
                reservations: { ...(s.ui?.reservations || {}), selection: [], status: (s.ui?.reservations?.status || 'pending') }
              }
            }));
            UI.pushToast(ctx, { title: 'تم تحديث الحجوزات', icon: '📥' });
            return;
          }
        } catch (e) { console.warn('Manual fetch failed', e); }

        // Default open
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            modals: { ...(s.ui?.modals || {}), reservations: true },
            reservations: { ...(s.ui?.reservations || {}), selection: [], status: (s.ui?.reservations?.status || 'pending') }
          }
        }));
      }
    },
    'pos.orders.open': {
      on: ['click'],
      gkeys: ['pos:orders:open'],
      handler: (e, ctx) => {
        const state = ctx.getState();
        const t = getTexts(state);
        // 🛡️ User Request: Default to 'all' and disable shift filter to show all orders
        const defaultOrdersUi = { tab: 'all', search: '', sort: { field: 'updatedAt', direction: 'desc' }, filterShift: false };

        // 🛡️ User Request: Use global store directly instead of stale realtimeOrders
        try {
          const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
          const tables = store?.modules?.pos?.tables || {};
          const headers = tables.order_header || [];

          if (headers.length > 0) {
            const rawLines = tables.order_line || [];
            const rawPayments = tables.order_payment || [];

            // Map keys helper
            const getVal = (obj, ...keys) => {
              if (!obj) return undefined;
              for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
              return undefined;
            };

            const mappedOrders = headers
              .map(h => {
                const orderId = getVal(h, 'id');
                // 🛡️ Mapping Fix: Use loose equality just in case, or ensure types match
                const lines = rawLines.filter(l => getVal(l, 'order_id', 'orderId') == orderId);
                const paymentsRaw = rawPayments.filter(p => getVal(p, 'order_id', 'orderId') == orderId);

                // Map Payment Split (methodId -> amount)
                const paymentsMap = {};
                let paymentsSum = 0;
                paymentsRaw.forEach(p => {
                  const mid = getVal(p, 'method_id', 'methodId');
                  const amt = Number(getVal(p, 'amount') || 0);
                  if (mid) paymentsMap[mid] = (paymentsMap[mid] || 0) + amt;
                  paymentsSum += amt;
                });

                // Extract table IDs from metadata if not at top level
                const meta = h.metadata || {};
                const tableIds = getVal(h, 'tableIds', 'table_ids') || meta.tableIds || [];

                // Totals reconstruction
                const headerTotalDue = Number(getVal(h, 'totalDue', 'total_due', 'total') || 0);
                const headerPaid = Number(getVal(h, 'totalPaid', 'total_paid') || 0);
                const totals = h.totals || {
                  total: headerTotalDue,
                  subtotal: Number(getVal(h, 'subtotal') || 0),
                  tax: Number(getVal(h, 'tax') || 0),
                  discount: Number(getVal(h, 'discount') || 0),
                  paid: Math.max(headerPaid, paymentsSum)
                };

                // Completion detection mirrors realtimeOrders snapshot
                const statusId = String(getVal(h, 'status', 'statusId', 'status_id') || '').toLowerCase();
                const isCancelled = statusId === 'cancelled' || statusId === 'void' || statusId === 'deleted';
                const totalDue = Number(totals.total || 0);
                const totalPaid = Number(totals.paid || 0);
                const isFullyPaid = totalDue > 0 && totalPaid >= totalDue;
                const isAllCompleted = lines.length > 0 && lines.every(line => {
                  const lineStatus = String(getVal(line, 'status', 'statusId', 'status_id') || '').toLowerCase();
                  return lineStatus === 'completed';
                });
                const isCompleted = !isCancelled && isAllCompleted && isFullyPaid;

                // Lines Count Fallback
                const linesCount = lines.length || Number(meta.linesCount) || 0;

                return {
                  ...h,
                  id: orderId,
                  type: getVal(h, 'type', 'orderTypeId', 'order_type') || 'dine_in',
                  status: getVal(h, 'status', 'statusId') || 'open',
                  lines: lines,
                  linesCount: linesCount, // Ensure UI has this if needed
                  payments: paymentsMap,
                  totals: totals,
                  customerId: getVal(h, 'customerId', 'customer_id'),
                  customerAddressId: getVal(h, 'customerAddressId', 'customer_address_id'),
                  tableIds: Array.isArray(tableIds) ? tableIds : [],
                  openedAt: getVal(h, 'openedAt', 'opened_at') || new Date().toISOString(),
                  isCompleted
                };
              })
              .filter(order => !order.isCompleted);

            ctx.setState(s => ({
              ...s,
              data: { ...(s.data || {}), ordersQueue: mappedOrders },
              ui: { ...(s.ui || {}), orders: defaultOrdersUi, modals: { ...(s.ui?.modals || {}), orders: true } }
            }));

            UI.pushToast(ctx, { title: t.toast.orders_loaded, icon: '📥' });
            return;
          }
        } catch (err) {
          console.error('[POS] Failed to load orders from global store:', err);
        }

        // Fallback or empty
        UI.pushToast(ctx, { title: 'Loaded (Store Empty/Error)', icon: '⚠️' });
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), ordersQueue: [] },
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
    // ✅ Confirm Reservation (convert to draft order)
    'pos.reservation.confirm': {
      on: ['click'],
      gkeys: ['pos:reservation:confirm'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-id]');
        const scheduleId = btn?.getAttribute('data-id')
          || ctx.getState().data?.order?.sourceScheduleId
          || (ctx.getState().data?.order?.metadata?.isSchedule ? ctx.getState().data?.order?.id : null);

        if (!scheduleId) {
          UI.pushToast(ctx, { title: 'خطأ', message: 'لم يتم العثور على رقم الحجز', icon: '⚠️' });
          return;
        }

        const t = getTexts(ctx.getState());

        try {
          const result = await convertScheduleToOrder(ctx, scheduleId);
          if (!result || !result.orderId) return;
          const { orderId } = result;

          let opened = false;
          for (let i = 0; i < 3; i++) {
            opened = await openOrderById(ctx, orderId, { closeOrdersModal: true });
            if (opened) break;
            await sleep(250 * (i + 1));
          }
          if (!opened) {
            UI.pushToast(ctx, { title: 'تم إنشاء الطلب', message: `رقم الطلب: ${orderId}`, icon: '✅' });
          }

          ctx.setState(s => ({
            ...s,
            ui: {
              ...(s.ui || {}),
              modals: { ...(s.ui?.modals || {}), reservations: false, tables: false },
              reservation: { enabled: false, scheduledAt: null }
            },
            data: {
              ...(s.data || {}),
              order_schedule: (s.data.order_schedule || []).map(res => res.id === scheduleId ? { ...res, status: 'converted' } : res),
              reservations: (s.data.reservations || []).map(res => res.id === scheduleId ? { ...res, status: 'converted' } : res)
            }
          }));
          UI.pushToast(ctx, { title: '✅ تم تأكيد الحجز', icon: '✅' });
        } catch (error) {
          console.error('[POS] Reservation Confirm Failed', error);
          UI.pushToast(ctx, {
            title: t.toast?.save_failed || 'فشل التأكيد',
            message: String(error),
            icon: '❌'
          });
        }
      }
    },
    // ✅ Print Reservation Receipt
    'pos.reservation.print': {
      on: ['click'],
      gkeys: ['pos:reservation:print'],
      handler: async (e, ctx) => {
        const btn = e.target.closest('[data-id]');
        const scheduleId = btn?.getAttribute('data-id');

        if (!scheduleId) {
          UI.pushToast(ctx, { title: 'خطأ', message: 'لم يتم العثور على رقم الحجز', icon: '⚠️' });
          return;
        }

        // TODO: Implement actual print logic - for now just show success
        UI.pushToast(ctx, {
          title: '🖨️ طباعة الحجز',
          message: `جاري طباعة الحجز: ${scheduleId}`,
          icon: '🖨️'
        });

        // Trigger print via existing print handler if available
        // The print logic can be similar to normal order print but with reservation-specific format
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
        // Same logic as 'open' but simplified
        const state = ctx.getState();
        const t = getTexts(state);
        // Copy Paste Logic from 'open' handler proper
        try {
          const store = window.__MISHKAH_LAST_STORE__?.state || window.__POS_DB__?.store?.state;
          const tables = store?.modules?.pos?.tables || {};
          const headers = tables.order_header || [];

          if (headers.length > 0) {
            const rawLines = tables.order_line || [];
            const rawPayments = tables.order_payment || [];
            const getVal = (obj, ...keys) => {
              if (!obj) return undefined;
              for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
              return undefined;
            };

            const mappedOrders = headers
              .filter(h => getVal(h, 'status', 'statusId') === 'open')
              .map(h => {
                const orderId = getVal(h, 'id');
                const lines = rawLines.filter(l => getVal(l, 'order_id', 'orderId') == orderId);
                const paymentsRaw = rawPayments.filter(p => getVal(p, 'order_id', 'orderId') == orderId);
                const paymentsMap = {};
                paymentsRaw.forEach(p => {
                  const mid = getVal(p, 'method_id', 'methodId');
                  const amt = Number(getVal(p, 'amount') || 0);
                  if (mid) paymentsMap[mid] = (paymentsMap[mid] || 0) + amt;
                });
                const meta = h.metadata || {};
                const tableIds = getVal(h, 'tableIds', 'table_ids') || meta.tableIds || [];
                const totals = h.totals || {
                  total: Number(getVal(h, 'totalDue', 'total_due') || 0),
                  subtotal: Number(getVal(h, 'subtotal') || 0),
                  tax: Number(getVal(h, 'tax') || 0),
                  discount: Number(getVal(h, 'discount') || 0),
                  paid: Number(getVal(h, 'totalPaid', 'total_paid') || 0)
                };

                return {
                  ...h,
                  id: orderId,
                  type: getVal(h, 'type', 'orderTypeId', 'order_type') || 'dine_in',
                  status: getVal(h, 'status', 'statusId') || 'open',
                  lines: lines,
                  linesCount: lines.length || Number(meta.linesCount) || 0,
                  payments: paymentsMap,
                  totals: totals,
                  customerId: getVal(h, 'customerId', 'customer_id'),
                  customerAddressId: getVal(h, 'customerAddressId', 'customer_address_id'),
                  tableIds: Array.isArray(tableIds) ? tableIds : [],
                  openedAt: getVal(h, 'openedAt', 'opened_at') || new Date().toISOString()
                };
              });

            ctx.setState(s => ({
              ...s,
              data: { ...(s.data || {}), ordersQueue: mappedOrders }
            }));
            UI.pushToast(ctx, { title: t.toast.orders_loaded, icon: '📥' });
            return;
          }
        } catch (e) {
          console.error(e);
        }
        UI.pushToast(ctx, { title: t.toast.orders_failed, icon: '🛑' });
      }
    },
    'pos.orders.toggle-shift': {
      on: ['click'],
      gkeys: ['pos:orders:toggle-shift'],
      handler: (e, ctx) => {
        ctx.setState(s => {
          const current = s.ui?.orders?.filterShift !== false;
          return {
            ...s,
            ui: { ...(s.ui || {}), orders: { ...(s.ui?.orders || {}), filterShift: !current }, modals: { ...(s.ui?.modals || {}), orders: true } }
          };
        });
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
        await openOrderById(ctx, orderId, { closeOrdersModal: true });
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
        if (runtime.reservationLocks && runtime.reservationLocks.length > 0) {
          const res = runtime.reservationRefs[0];
          const time = res ? formatDateTime(res.scheduledAt, state.env.lang, { hour: '2-digit', minute: '2-digit' }) : '';
          UI.pushToast(ctx, {
            title: t.ui.table_reserved || 'Table Reserved',
            message: `${t.ui.reserved_at || 'Reserved at'} ${time}`,
            icon: '📅'
          });
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
        const state = ctx.getState();
        let autoAmount = '';
        if (method !== 'cash') {
          const order = state.data.order || {};
          const totals = order.totals || {};
          const currentSplit = state.data.payments?.split || [];
          const paymentSnapshot = summarizePayments(totals, currentSplit);
          if (paymentSnapshot.remaining > 0) {
            autoAmount = String(paymentSnapshot.remaining);
          }
        }
        ctx.setState(s => ({
          ...s,
          data: { ...(s.data || {}), payments: { ...(s.data.payments || {}), activeMethod: method } },
          ui: { ...(s.ui || {}), paymentDraft: { ...(s.ui?.paymentDraft || {}), method, amount: autoAmount } }
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

        // Scheduled orders can capture payments directly without prompts.

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
                dirty: true
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
    'pos.reservation.toggle': {
      on: ['change'],
      gkeys: ['pos:reservation:toggle'],
      handler: (e, ctx) => {
        const val = e.target.value;
        const isSchedule = val === 'schedule';
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            reservation: {
              ...(s.ui?.reservation || {}),
              enabled: isSchedule,
              scheduledAt: isSchedule ? (s.ui?.reservation?.scheduledAt || Date.now() + 3600000) : null
            }
          }
        }));
      }
    },
    'pos.reservation.date': {
      on: ['input', 'change'],
      gkeys: ['pos:reservation:date'],
      handler: (e, ctx) => {
        const raw = e.target.value;
        if (!raw) return;
        const ts = new Date(raw).getTime();
        ctx.setState(s => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            reservation: { ...(s.ui?.reservation || {}), scheduledAt: ts }
          }
        }));
      }
    },

    'pos.schedule.save': {
      on: ['click'],
      gkeys: ['pos:schedule:save'],
      handler: handleScheduleSave
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
  (async () => {
    try {
      await refreshPersistentSnapshot({ focusCurrent: true, syncOrders: true });
    } catch (err) {
      console.warn('[POS] Initial snapshot refresh failed:', err);
    }
  })();
})();
