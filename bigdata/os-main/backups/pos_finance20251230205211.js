(function (global) {
    const ensureArray =
      (global.PosMiniUtils && typeof global.PosMiniUtils.ensureArray === 'function')
        ? global.PosMiniUtils.ensureArray
        : (value) => (Array.isArray(value) ? value : []);
  
    const localizeText =
      (global.PosMiniUtils && typeof global.PosMiniUtils.localizeText === 'function')
        ? global.PosMiniUtils.localizeText
        : (entry, lang = 'ar') => {
            if (!entry) return '';
            if (typeof entry === 'string') return entry;
            if (typeof entry === 'object') {
              if (lang === 'ar' && entry.ar) return entry.ar;
              if (lang === 'en' && entry.en) return entry.en;
              const first = Object.values(entry).find(
                (value) => typeof value === 'string' && value.trim()
              );
              return first || '';
            }
            return String(entry);
          };
  
    const M = global.Mishkah;
    if (!M || !M.utils || !M.DSL) {
      console.warn('[POS Finance] Mishkah runtime is unavailable.');
      return;
    }
  
    const db = global.__POS_DB__;
    if (!db) {
      console.warn('[POS Finance] POS database is not ready.');
    }
  
    const moduleEntry =
      global.__POS_MODULE_ENTRY__ && typeof global.__POS_MODULE_ENTRY__ === 'object'
        ? global.__POS_MODULE_ENTRY__
        : null;
    const runtimeStatus =
      global.__POS_DATA_STATUS__ && typeof global.__POS_DATA_STATUS__ === 'object'
        ? global.__POS_DATA_STATUS__
        : null;
    const branchHintFromGlobal =
      typeof global.__POS_BRANCH_ID__ === 'string' ? global.__POS_BRANCH_ID__.trim() : '';
    const branchHintFromStatus =
      runtimeStatus && typeof runtimeStatus.branchId === 'string' ? runtimeStatus.branchId.trim() : '';
    const branchParamFromLocation = (() => {
      try {
        const params = new global.URLSearchParams(global.location?.search || '');
        return (params.get('brname') || '').trim();
      } catch (_err) {
        return '';
      }
    })();
    if (runtimeStatus && branchParamFromLocation && !runtimeStatus.branchId) {
      runtimeStatus.branchId = branchParamFromLocation;
    }
    const initialPayload = typeof global.database === 'object' && global.database ? global.database : {};
  
    const TABLE_NAME_GROUPS = {
      dataset: {
        canonical: 'pos_database',
        aliases: ['pos_dataset', 'pos_data', 'dataset']
      },
      orders: {
        canonical: 'order_header',
        aliases: ['orders', 'order_header_live', 'orderHeaders', 'orderHeader']
      },
      lines: {
        canonical: 'order_line',
        aliases: ['order_lines', 'order_line_items', 'orderDetails', 'orderLines']
      },
      payments: {
        canonical: 'order_payment',
        aliases: ['payments', 'order_payments', 'orderPayments', 'paymentTransactions']
      },
      shifts: {
        canonical: 'pos_shift',
        aliases: ['shifts', 'shift_header', 'shiftHeaders']
      },
      items: {
        canonical: 'menu_item',
        aliases: ['items', 'menu_items', 'menuItems', 'menuItem']
      },
      categories: {
        canonical: 'menu_category',
        aliases: ['categories', 'menu_categories', 'menuCategories', 'menuCategory']
      }
    };
  
    const uniqueArray = (values = []) => {
      const list = Array.isArray(values) ? values : [];
      return Array.from(new Set(list.filter((value) => value != null)));
    };
  
    const canonicalizeTableName = (name) => {
      if (name == null) return null;
      const normalized = String(name).trim();
      if (!normalized) return null;
      const lower = normalized.toLowerCase();
      for (const descriptor of Object.values(TABLE_NAME_GROUPS)) {
        const candidates = [descriptor.canonical, ...(descriptor.aliases || [])];
        if (
          candidates.some((candidate) => typeof candidate === 'string' && candidate.toLowerCase() === lower)
        ) {
          return descriptor.canonical;
        }
      }
      return normalized;
    };
  
    const collectModuleTableNames = (entry) => {
      const names = new Set();
      if (!entry || typeof entry !== 'object') return names;
      const push = (value) => {
        if (value == null) return;
        const normalized = String(value).trim();
        if (normalized) names.add(normalized);
      };
      const processTableEntry = (table) => {
        if (!table) return;
        if (typeof table === 'string') {
          push(table);
          return;
        }
        if (typeof table === 'object') {
          push(table.name);
          push(table.table);
          push(table.tableName);
          push(table.sqlName);
          if (Array.isArray(table.aliases)) {
            table.aliases.forEach(push);
          }
          if (Array.isArray(table.synonyms)) {
            table.synonyms.forEach(push);
          }
        }
      };
      ensureArray(entry.tables).forEach(processTableEntry);
      if (entry.schema && typeof entry.schema === 'object') {
        ensureArray(entry.schema.tables).forEach(processTableEntry);
        if (entry.schema.schema && typeof entry.schema.schema === 'object') {
          ensureArray(entry.schema.schema.tables).forEach(processTableEntry);
        }
      }
      return names;
    };
  
    const buildTableHandles = (dbInstance, entry) => {
      const handles = {};
      const moduleNames = collectModuleTableNames(entry);
      const dbObjects =
        dbInstance && dbInstance.config && typeof dbInstance.config.objects === 'object'
          ? { ...dbInstance.config.objects }
          : {};
      const knownNames = new Set(Object.keys(dbObjects));
      const registerAlias = typeof dbInstance?.register === 'function' ? dbInstance.register.bind(dbInstance) : null;
  
      const resolveOptions = (descriptor) => {
        const options = new Set();
        options.add(descriptor.canonical);
        (descriptor.aliases || []).forEach((alias) => {
          if (alias) options.add(String(alias));
        });
        for (const name of moduleNames) {
          if (canonicalizeTableName(name) === descriptor.canonical) {
            options.add(name);
          }
        }
        return Array.from(options);
      };
  
      for (const [key, descriptor] of Object.entries(TABLE_NAME_GROUPS)) {
        const options = resolveOptions(descriptor);
        let alias = null;
        let sourceTable = descriptor.canonical;
  
        const findMatchingOption = () => {
          for (const option of options) {
            if (knownNames.has(option)) {
              return option;
            }
          }
          for (const option of options) {
            const match = Array.from(knownNames).find(
              (candidate) => candidate.toLowerCase() === option.toLowerCase()
            );
            if (match) return match;
          }
          return null;
        };
  
        const matched = findMatchingOption();
        if (matched) {
          alias = matched;
          sourceTable = dbObjects[matched]?.table || matched;
        }
  
        if (!alias && registerAlias) {
          const moduleCandidate = Array.from(moduleNames).find(
            (name) => canonicalizeTableName(name) === descriptor.canonical
          );
          if (moduleCandidate) {
            sourceTable = moduleCandidate;
          }
          try {
            registerAlias(descriptor.canonical, { table: sourceTable });
            alias = descriptor.canonical;
            knownNames.add(descriptor.canonical);
            dbObjects[descriptor.canonical] = { table: sourceTable };
          } catch (error) {
            console.warn('[POS Finance] Failed to register table alias', {
              canonical: descriptor.canonical,
              sourceTable,
              error
            });
            alias = descriptor.canonical;
          }
        } else if (alias && alias !== descriptor.canonical && registerAlias && !knownNames.has(descriptor.canonical)) {
          try {
            registerAlias(descriptor.canonical, { table: sourceTable });
            knownNames.add(descriptor.canonical);
            dbObjects[descriptor.canonical] = { table: sourceTable };
            alias = descriptor.canonical;
          } catch (error) {
            console.warn('[POS Finance] Failed to bind canonical table alias', {
              canonical: descriptor.canonical,
              sourceTable,
              error
            });
          }
        }
  
        if (!alias) {
          alias = descriptor.canonical;
        }
  
        handles[key] = {
          canonical: descriptor.canonical,
          alias,
          sourceTable,
          names: options
        };
      }
  
      return handles;
    };
  
    const tableHandles = buildTableHandles(db, moduleEntry);
  
    const getTableAlias = (key) => {
      const handle = tableHandles[key];
      if (!handle) return key;
      return handle.alias || handle.canonical || key;
    };
  
    const getTableNamesForPayload = (key) => {
      const handle = tableHandles[key];
      if (!handle) return [key];
      const variants = new Set(handle.names || []);
      variants.add(handle.canonical);
      variants.add(handle.alias);
      return Array.from(variants).filter(Boolean);
    };
  
    const extractDatasetArray = (payload = {}, key) => {
      if (!payload || typeof payload !== 'object') return [];
      const candidates = getTableNamesForPayload(key);
      for (const candidate of candidates) {
        if (!candidate) continue;
        const value = payload[candidate];
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
          if (Array.isArray(value.rows)) return value.rows;
          if (Array.isArray(value.records)) return value.records;
          if (Array.isArray(value.list)) return value.list;
          if (Array.isArray(value.data)) return value.data;
        }
      }
      return [];
    };
  
    const listRecords = (key) => {
      if (!db || typeof db.list !== 'function') return [];
      const alias = getTableAlias(key);
      try {
        return ensureArray(db.list(alias));
      } catch (error) {
        console.warn('[POS Finance] Failed to list table records', { key, alias, error });
        return [];
      }
    };
  
    const initialRecords = (key, fallback = []) => {
      const records = listRecords(key);
      if (records.length) return records;
      return ensureArray(fallback);
    };
  
    const resolveBranchId = (candidates = []) => {
      for (const candidate of candidates) {
        if (candidate == null) continue;
        const normalized = String(candidate).trim();
        if (normalized) return normalized;
      }
      return '';
    };
  
    const watchTable = (key, handler) => {
      if (!db || typeof db.watch !== 'function' || typeof handler !== 'function') return null;
      const alias = getTableAlias(key);
      try {
        return db.watch(alias, handler);
      } catch (error) {
        console.warn('[POS Finance] Failed to register table watcher', { key, alias, error });
        return null;
      }
    };
  
    const getAliasForCanonical = (canonical) => {
      if (!canonical) return canonical;
      const normalized = canonicalizeTableName(canonical);
      for (const handle of Object.values(tableHandles)) {
        if (handle.canonical === normalized) {
          return handle.alias || handle.canonical || canonical;
        }
      }
      return canonical;
    };
  
    const CANONICAL_PURGE_TABLES = [
      TABLE_NAME_GROUPS.orders.canonical,
      TABLE_NAME_GROUPS.lines.canonical,
      TABLE_NAME_GROUPS.payments.canonical,
      TABLE_NAME_GROUPS.shifts.canonical,
      // ✅ Add job_order tables for KDS reset
      'job_order_header',
      'job_order_detail',
      'job_order_detail_modifier',
      'job_order_status_history'
    ];
  
    let DEFAULT_PURGE_TABLES = CANONICAL_PURGE_TABLES.slice();
  
    const defaultLang = (initialPayload.settings && initialPayload.settings.lang) || 'ar';
  
    const PREF_KEY = '__POS_FINANCE_PREFS__';
    const supportedLangs = new Set(['ar', 'en']);
  
    const readPreferences = () => {
      if (!global.localStorage) return {};
      try {
        const raw = global.localStorage.getItem(PREF_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (_err) {
        return {};
      }
    };
  
    const writePreferences = (prefs) => {
      if (!global.localStorage) return;
      try {
        global.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      } catch (_err) {
        /* ignore */
      }
    };
  
    const storedPrefs = readPreferences();
    let activeLang = supportedLangs.has(storedPrefs.lang) ? storedPrefs.lang : defaultLang;
    if (!supportedLangs.has(activeLang)) {
      activeLang = 'ar';
    }
    let activeTheme = storedPrefs.theme === 'light' ? 'light' : 'dark';
  
    const persistPreferences = () => {
      writePreferences({ theme: activeTheme, lang: activeLang });
    };
  
    const applyDocumentLang = (lang) => {
      const root = global.document?.documentElement;
      if (!root) return;
      root.lang = lang;
      root.dir = lang === 'en' ? 'ltr' : 'rtl';
    };
  
    const applyDocumentTheme = (theme) => {
      const root = global.document?.documentElement;
      if (!root) return;
      const resolved = theme === 'light' ? 'light' : 'dark';
      root.setAttribute('data-theme', resolved);
      root.style.colorScheme = resolved;
    };
  
    applyDocumentLang(activeLang);
    applyDocumentTheme(activeTheme);
  
    const translateHeadTitle = (lang) => (lang === 'en' ? 'Mishkah POS — Finance Closing' : 'لوحة الإغلاق المالي — Mishkah POS');
  
    const normalizeMap = (entries = [], lang = activeLang) => {
      const map = new Map();
      for (const entry of ensureArray(entries)) {
        if (!entry) continue;
        const id = entry.id || entry.code || entry.value || entry.key;
        if (!id) continue;
        const label =
          localizeText(
            entry.name || entry.status_name || entry.payment_name || entry.type_name || entry.label,
            lang
          ) || entry.label || entry.name || '';
        map.set(String(id), label);
      }
      return map;
    };
  
    const translatePaymentMethods = (methods = [], lang = activeLang) =>
      ensureArray(methods).map((method) => {
        if (!method) return method;
        const label = localizeText(method.name, lang) || method.label || method.name || '';
        return { ...method, label };
      });
  
    let latestPayload = { ...initialPayload };
  
    const localizeFromPayload = (payload = latestPayload, lang = activeLang) => {
      const source = payload && Object.keys(payload).length ? payload : initialPayload;
      const paymentMethodsSource = source.payment_methods || source.paymentMethods || [];
      const statusesSource = source.order_statuses || source.orderStatuses || [];
      const paymentStatesSource = source.order_payment_states || source.orderPaymentStates || [];
      const orderTypesSource = source.order_types || source.orderTypes || [];
      return {
        paymentMethods: translatePaymentMethods(paymentMethodsSource, lang),
        lookups: {
          statuses: normalizeMap(statusesSource, lang),
          payments: normalizeMap(paymentStatesSource, lang),
          types: normalizeMap(orderTypesSource, lang)
        }
      };
    };
  
    const localizedInitial = localizeFromPayload(latestPayload, activeLang);
    let currentPaymentMethods = localizedInitial.paymentMethods;
    let lookups = localizedInitial.lookups;
  
    const fallbackOrders = extractDatasetArray(initialPayload, 'orders');
    const fallbackPayments = extractDatasetArray(initialPayload, 'payments');
    const fallbackLines = extractDatasetArray(initialPayload, 'lines');
    const fallbackShifts = extractDatasetArray(initialPayload, 'shifts');
  
    const initialOrders = initialRecords('orders', fallbackOrders);
    const initialPayments = initialRecords('payments', fallbackPayments);
    const initialLines = initialRecords('lines', fallbackLines);
    const initialShifts = initialRecords('shifts', fallbackShifts);
    let normalizedOrders = [];
  
    const settings = initialPayload.settings || {};
    const branchSync = settings.sync || {};
    const resolvedBranchId =
      resolveBranchId([
        branchParamFromLocation,
        branchHintFromGlobal,
        branchHintFromStatus,
        db?.config?.branchId,
        branchSync.branch_id,
        branchSync.branchId,
        branchSync.id,
        settings.branch_id,
        settings.branchId,
        initialPayload.branch_id,
        initialPayload.branchId
      ]) || 'branch-main';
    const resolvedBranchCode =
      resolveBranchId([
        branchSync.branch_code,
        branchSync.branchCode,
        settings.branch_code,
        settings.branchCode,
        initialPayload.branch_code,
        initialPayload.branchCode,
        resolvedBranchId
      ]) || resolvedBranchId;
    const resolvedBranchSlug =
      resolveBranchId([
        branchSync.branch_slug,
        branchSync.branchSlug,
        settings.branch_slug,
        settings.branchSlug,
        resolvedBranchCode,
        resolvedBranchId
      ]) || resolvedBranchCode;
    const resolvedBranchChannel =
      resolveBranchId([
        branchSync.channel,
        branchSync.branch_channel,
        settings.channel,
        settings.branch_channel,
        resolvedBranchSlug,
        resolvedBranchId
      ]) || resolvedBranchId;
    const branch = {
      id: resolvedBranchId,
      code: resolvedBranchCode,
      slug: resolvedBranchSlug,
      channel: resolvedBranchChannel,
      nameAr:
        (branchSync.branch_name && branchSync.branch_name.ar) ||
        (branchSync.branchName && branchSync.branchName.ar) ||
        settings.branch_name?.ar ||
        settings.branchName?.ar ||
        'الفرع الرئيسي',
      nameEn:
        (branchSync.branch_name && branchSync.branch_name.en) ||
        (branchSync.branchName && branchSync.branchName.en) ||
        settings.branch_name?.en ||
        settings.branchName?.en ||
        'Main Branch'
    };
    if (runtimeStatus) {
      runtimeStatus.branchId = branch.id;
    }
    global.__POS_BRANCH_ID__ = branch.id;
  
    const financeSettings = settings.finance || settings.financial || settings.financials || {};
    const configuredPurgeTables = uniqueArray([
      ...ensureArray(financeSettings.purgeTables),
      ...ensureArray(financeSettings.resetTables),
      ...ensureArray(settings.purgeTables),
      ...ensureArray(settings.resetTables),
      ...ensureArray(initialPayload.purgeTables),
      ...ensureArray(initialPayload.resetTables)
    ])
      .map(canonicalizeTableName)
      .filter(Boolean);
    if (configuredPurgeTables.length) {
      DEFAULT_PURGE_TABLES = Array.from(new Set(configuredPurgeTables));
    }
  
    const currency = settings.currency || { code: 'EGP', symbols: { ar: 'ج.م', en: 'E£' } };
  
    const ensureNumber = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };
  
    const getOrderId = (order) => {
      if (!order || typeof order !== 'object') return null;
      return order.id || order.orderId || order.order_id || null;
    };
  
    const groupByOrderId = (items, resolveId) => {
      const map = new Map();
      for (const item of ensureArray(items)) {
        if (!item) continue;
        const orderId = resolveId(item);
        if (!orderId) continue;
        const key = String(orderId);
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key).push(item);
      }
      return map;
    };
  
    const getLineTotal = (line) => {
      if (!line || typeof line !== 'object') return 0;
      const quantity = ensureNumber(line.quantity ?? line.qty ?? 0);
      const unitPrice = ensureNumber(line.unitPrice ?? line.unit_price ?? line.price ?? 0);
      const total = ensureNumber(
        line.total ?? line.lineTotal ?? line.line_total ?? quantity * unitPrice
      );
      if (total) return total;
      if (quantity && unitPrice) return quantity * unitPrice;
      return 0;
    };
  
    const getPaymentAmount = (payment) => {
      if (!payment || typeof payment !== 'object') return 0;
      return ensureNumber(
        payment.amount ??
          payment.total ??
          payment.value ??
          payment.paidAmount ??
          payment.amount_paid ??
          0
      );
    };
  
    const normalizeOrderFinancials = (order, lines = [], payments = []) => {
      const lineTotal = ensureArray(lines).reduce((sum, line) => sum + getLineTotal(line), 0);
      const paymentsTotal = ensureArray(payments).reduce(
        (sum, payment) => sum + getPaymentAmount(payment),
        0
      );
      const baseSubtotal = ensureNumber(
        order?.subtotal ?? order?.totalBeforeTax ?? order?.total_before_tax ?? order?.totals?.subtotal ?? 0
      );
      const baseDue = ensureNumber(
        order?.totalDue ??
          order?.total_due ??
          order?.total ??
          order?.total_amount ??
          order?.totals?.due ??
          0
      );
      const basePaid = ensureNumber(
        order?.totalPaid ?? order?.total_paid ?? order?.amount_paid ?? order?.totals?.paid ?? 0
      );
      const subtotal = baseSubtotal > 0 ? baseSubtotal : lineTotal;
      const due = baseDue > 0 ? baseDue : subtotal;
      const paid = basePaid > 0 ? basePaid : paymentsTotal;
      return {
        subtotal,
        due,
        paid,
        lineTotal,
        paymentsTotal,
        linesCount: ensureArray(lines).length,
        paymentsCount: ensureArray(payments).length
      };
    };
  
    const enrichOrdersSnapshot = (orders = [], lines = [], payments = []) => {
      const linesByOrder = groupByOrderId(lines, (line) => line?.orderId || line?.order_id);
      const paymentsByOrder = groupByOrderId(
        payments,
        (payment) => payment?.orderId || payment?.order_id
      );
      const normalizedOrders = ensureArray(orders).map((order) => {
        if (!order || typeof order !== 'object') return order;
        const orderId = getOrderId(order);
        const lineBucket = orderId ? linesByOrder.get(String(orderId)) || [] : [];
        const paymentBucket = orderId ? paymentsByOrder.get(String(orderId)) || [] : [];
        const metrics = normalizeOrderFinancials(order, lineBucket, paymentBucket);
        const normalized = { ...order };
        normalized.subtotal = metrics.subtotal;
        normalized.totalDue = metrics.due;
        normalized.totalPaid = metrics.paid;
        normalized.total_due = metrics.due;
        normalized.total_paid = metrics.paid;
        normalized.totals = {
          ...(order.totals || {}),
          subtotal: metrics.subtotal,
          due: metrics.due,
          paid: metrics.paid,
          lines: metrics.linesCount,
          payments: metrics.paymentsTotal
        };
        normalized.linesCount = metrics.linesCount;
        normalized.paymentsCount = metrics.paymentsCount;
        return normalized;
      });
      return { orders: normalizedOrders, linesByOrder, paymentsByOrder };
    };
  
    const initialDataset = enrichOrdersSnapshot(initialOrders, initialLines, initialPayments);
    normalizedOrders = initialDataset.orders;
  
    const translateResetMessage = (type, context = {}) => {
      const lang = context.lang || activeLang;
      switch (type) {
        case 'cancelled':
          return lang === 'en'
            ? 'Order reset cancelled (invalid code).'
            : 'تم إلغاء إعادة ضبط الطلبات (رمز غير صحيح).';
        case 'pending':
          return lang === 'en'
            ? 'Resetting transaction data...'
            : 'جاري إعادة ضبط بيانات الحركات...';
        case 'success': {
          const removed = Number(context.removed ?? 0);
          const base =
            lang === 'en'
              ? `Transactions reset successfully (${removed} records)`
              : `تمت إعادة ضبط بيانات الحركات بنجاح (${removed} سجل)`;
          const tablesSummary = context.tablesSummary ? String(context.tablesSummary).trim() : '';
          if (tablesSummary) {
            const detailsLabel = lang === 'en' ? 'Details:' : 'التفاصيل:';
            return `${base}. ${detailsLabel} ${tablesSummary}.`;
          }
          return `${base}.`;
        }
        case 'failure': {
          const base =
            lang === 'en'
              ? 'Failed to reset order data.'
              : 'تعذر إعادة ضبط بيانات الطلبات.';
          const details = context.details ? String(context.details).trim() : '';
          return details ? `${base} ${details}` : base;
        }
        case 'network':
          return lang === 'en'
            ? 'Unable to reach the reset service.'
            : 'تعذر الاتصال بخادم إعادة الضبط.';
        default:
          return '';
      }
    };
  
    const translateCloseMessage = (type, context = {}) => {
      const lang = context.lang || activeLang;
      switch (type) {
        case 'pending':
          return lang === 'en'
            ? 'Sending closing payload...'
            : 'جاري إرسال بيانات الإغلاق...';
        case 'success':
          return lang === 'en'
            ? 'Closing submitted successfully (demo).'
            : 'تم إرسال الإغلاق بنجاح .';
        case 'failure':
          return lang === 'en'
            ? 'Demo closing submission failed.'
            : 'فشل إرسال الإغلاق .';
        case 'network':
          return lang === 'en'
            ? 'Could not reach the demo closing endpoint.'
            : 'تعذر الوصول إلى نقطة الإغلاق .';
        default:
          return '';
      }
    };
  
    const computePaymentsFromOrders = (orders = []) => {
      const totals = new Map();
      for (const order of ensureArray(orders)) {
        const methodId = order.defaultPaymentMethodId || order.paymentMethodId || order.payment_method_id || null;
        if (!methodId) continue;
        const paid = ensureNumber(order.totalPaid ?? order.total_paid ?? order.totals?.paid ?? 0);
        if (!paid) continue;
        totals.set(String(methodId), ensureNumber(totals.get(String(methodId)) || 0) + paid);
      }
      return totals;
    };
  
    const computePaymentBreakdown = (payments = [], orders = [], methods = []) => {
      const totals = new Map();
      for (const payment of ensureArray(payments)) {
        const methodId = payment.paymentMethodId || payment.methodId || payment.method || payment.payment_method_id;
        const amount = ensureNumber(payment.amount ?? payment.total ?? payment.value ?? payment.paidAmount);
        if (!methodId || !amount) continue;
        const key = String(methodId);
        totals.set(key, ensureNumber(totals.get(key) || 0) + amount);
      }
      if (!totals.size) {
        const fallback = computePaymentsFromOrders(orders);
        for (const [key, value] of fallback.entries()) {
          totals.set(key, ensureNumber(totals.get(key) || 0) + value);
        }
      }
      const list = Array.from(totals.entries()).map(([methodId, amount]) => {
        const info = methods.find((method) => String(method.id || method.code) === methodId) || {};
        return {
          methodId,
          amount,
          label: info.label || info.nameAr || info.name || methodId,
          icon: info.icon || '💳',
          type: info.type || 'other',
          typeLabel: info.type ? localizeText(info.type_name || info.typeLabel || info.type, activeLang) : ''
        };
      });
      list.sort((a, b) => ensureNumber(b.amount) - ensureNumber(a.amount));
      return list;
    };
  
    const computeFinancialSummary = ({ orders, payments, shifts }) => {
      const ordersList = ensureArray(orders).filter(Boolean);
      const summary = {
        totals: {
          totalOrders: ordersList.length,
          subtotal: 0,
          totalDue: 0,
          totalPaid: 0,
          outstanding: 0,
          paidOrders: 0,
          openOrders: 0,
          closedOrders: 0,
          averageOrderValue: 0,
          totalPayments: 0
        },
        paymentBreakdown: [],
        openShifts: [],
        latestShift: null,
        updatedAt: Date.now(),
        currencyCode: currency.code || 'EGP'
      };
  
      const closedStates = new Set(['closed', 'finalized', 'completed']);
      const paidStates = new Set(['paid', 'settled', 'complete']);
  
      for (const order of ordersList) {
        const subtotal = ensureNumber(
          order.subtotal ?? order.totals?.subtotal ?? order.totalBeforeTax ?? order.total_before_tax
        );
        const due = ensureNumber(
          order.totalDue ??
            order.totals?.due ??
            order.total_due ??
            order.total ??
            order.total_amount ??
            subtotal
        );
        const paid = ensureNumber(
          order.totalPaid ?? order.totals?.paid ?? order.total_paid ?? order.amount_paid ?? 0
        );
        summary.totals.subtotal += subtotal;
        summary.totals.totalDue += due;
        summary.totals.totalPaid += paid;
        const outstanding = Math.max(due - paid, 0);
        summary.totals.outstanding += outstanding;
        const statusId = order.statusId || order.status_id;
        if (statusId && closedStates.has(String(statusId))) {
          summary.totals.closedOrders += 1;
        }
        const paymentState = order.paymentStateId || order.payment_state_id;
        const stateKey = paymentState ? String(paymentState) : '';
        const isPaid = paidStates.has(stateKey) || outstanding <= 0;
        if (isPaid) {
          summary.totals.paidOrders += 1;
        } else {
          summary.totals.openOrders += 1;
        }
      }
  
      summary.totals.averageOrderValue = summary.totals.totalOrders
        ? summary.totals.totalDue / summary.totals.totalOrders
        : 0;
  
      summary.paymentBreakdown = computePaymentBreakdown(payments, ordersList, currentPaymentMethods);
      summary.totals.totalPayments = summary.paymentBreakdown.reduce(
        (sum, entry) => sum + ensureNumber(entry.amount),
        0
      );
  
      const openShifts = [];
      let latestShift = null;
      let latestClosedTime = 0;
      for (const shift of shifts) {
        const isClosed = shift.isClosed || shift.status === 'closed';
        if (!isClosed) {
          openShifts.push(shift);
        }
        const closedAt = shift.closedAt || shift.closed_at;
        if (closedAt) {
          const ts = Date.parse(closedAt);
          if (!Number.isNaN(ts) && ts > latestClosedTime) {
            latestClosedTime = ts;
            latestShift = shift;
          }
        }
      }
  
      summary.openShifts = openShifts;
      summary.latestShift = latestShift;
      return summary;
    };
  
    const buildState = ({ orders, payments, lines, shifts, summary, newLookups, lang = activeLang, theme = activeTheme }) => ({
      head: { title: translateHeadTitle(lang) },
      env: { theme, lang, dir: lang === 'en' ? 'ltr' : 'rtl' },
      data: {
        lang,
        branch,
        settings,
        currency,
        paymentMethods: currentPaymentMethods,
        lookups: newLookups || lookups,
        orders,
        orderLines: lines,
        payments,
        shifts,
        summary
      },
      ui: {
        resetStatus: 'idle',
        resetMessage: '',
        closingStatus: 'idle',
        closingMessage: '',
        lastResetAt: null,
        lastResetResponse: null,
        lastClosingResponse: null
      }
    });
  
    const summary = computeFinancialSummary({
      orders: normalizedOrders,
      payments: initialPayments,
      shifts: initialShifts
    });
  
    const initialState = buildState({
      orders: normalizedOrders,
      payments: initialPayments,
      lines: initialLines,
      shifts: initialShifts,
      summary,
      newLookups: lookups,
      lang: activeLang,
      theme: activeTheme
    });
  
    const app = M.app.createApp(initialState, {});
    M.utils.twcss.auto(initialState, app, { pageScaffold: true });
  
    const { FinanceAppView } = global.PosFinanceComponents || {};
    if (typeof FinanceAppView !== 'function') {
      console.warn('[POS Finance] FinanceAppView is not available.');
    } else {
      M.app.setBody(FinanceAppView);
    }
  
    const updateData = () => {
      const orders = listRecords('orders');
      const payments = listRecords('payments');
      const lines = listRecords('lines');
      const shifts = listRecords('shifts');
      const dataset = enrichOrdersSnapshot(orders, lines, payments);
      normalizedOrders = dataset.orders;
      const summary = computeFinancialSummary({
        orders: normalizedOrders,
        payments,
        shifts
      });
      app.setState((state) => ({
        ...state,
        data: {
          ...state.data,
          orders: normalizedOrders,
          orderLines: lines,
          payments,
          shifts,
          summary
        }
      }));
    };
  
    const updateLookupsFromPayload = (payload = {}) => {
      latestPayload = { ...latestPayload, ...payload };
      const localized = localizeFromPayload(latestPayload, activeLang);
      if (localized.paymentMethods?.length) {
        currentPaymentMethods = localized.paymentMethods;
      }
      lookups = localized.lookups;
  
      app.setState((state) => ({
        ...state,
        data: {
          ...state.data,
          paymentMethods: currentPaymentMethods,
          lookups
        }
      }));
    };
  
    const watchers = [];
    if (db) {
      const registerWatcher = (key, handler) => {
        const unsubscribe = watchTable(key, handler);
        if (typeof unsubscribe === 'function') {
          watchers.push(unsubscribe);
        }
      };
      registerWatcher('orders', () => {
        updateData();
      });
      registerWatcher('payments', () => {
        updateData();
      });
      registerWatcher('lines', () => {
        updateData();
      });
      registerWatcher('shifts', () => {
        updateData();
      });
      registerWatcher('dataset', (rows) => {
        if (!rows || !rows.length) return;
        const latest = rows[rows.length - 1];
        if (!latest || !latest.payload) return;
        updateLookupsFromPayload(latest.payload);
      });
    }
  
    const setUiState = (patch) => {
      app.setState((state) => ({
        ...state,
        ui: { ...state.ui, ...patch }
      }));
    };
  
    const setThemePreference = (theme) => {
      const resolved = theme === 'light' ? 'light' : 'dark';
      if (resolved === activeTheme) return;
      activeTheme = resolved;
      applyDocumentTheme(activeTheme);
      persistPreferences();
      app.setState((state) => ({
        ...state,
        env: { ...(state.env || {}), theme: activeTheme }
      }));
    };
  
    const setLanguagePreference = (lang) => {
      const resolved = lang === 'en' ? 'en' : 'ar';
      if (resolved === activeLang) return;
      activeLang = resolved;
      applyDocumentLang(activeLang);
      persistPreferences();
  
      const stateSnapshot = app.getState ? app.getState() : app.state;
      const localized = localizeFromPayload(latestPayload, activeLang);
      if (localized.paymentMethods?.length) {
        currentPaymentMethods = localized.paymentMethods;
      }
      lookups = localized.lookups;
  
      const summaryNext = computeFinancialSummary({
        orders: ensureArray(stateSnapshot?.data?.orders || []),
        payments: ensureArray(stateSnapshot?.data?.payments || []),
        shifts: ensureArray(stateSnapshot?.data?.shifts || [])
      });
  
      app.setState((state) => ({
        ...state,
        head: { title: translateHeadTitle(activeLang) },
        env: {
          ...(state.env || {}),
          theme: activeTheme,
          lang: activeLang,
          dir: activeLang === 'en' ? 'ltr' : 'rtl'
        },
        data: {
          ...state.data,
          lang: activeLang,
          paymentMethods: currentPaymentMethods,
          lookups,
          summary: summaryNext
        }
      }));
    };
  
    const handleResetOrders = async () => {
      const promptMessage = activeLang === 'en' ? 'Enter the reset code' : 'أدخل رمز إعادة ضبط الطلبات';
      const code = global.prompt(promptMessage);
      if (code !== '114477') {
        setUiState({
          resetStatus: 'cancelled',
          resetMessage: translateResetMessage('cancelled'),
          lastResetResponse: null,
          lastResetHistoryEntry: null
        });
        return;
      }
      const state = app.getState ? app.getState() : app.state;
      const branchId = state?.data?.branch?.id || branch.id;
      const payload = {
        branchId,
        moduleId: 'pos',
        tables: DEFAULT_PURGE_TABLES,
        reason: 'finance-reset',
        requestedBy: 'finance-ui',
        resetEvents: true
      };
      setUiState({
        resetStatus: 'pending',
        resetMessage: translateResetMessage('pending'),
        lastResetResponse: null,
        lastResetHistoryEntry: null
      });
      const attemptAt = new Date().toISOString();
      try {
        const response = await fetch( window.basedomain +'/api/manage/purge-live-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const detailMessage = body?.message
            ? activeLang === 'en'
              ? `Reason: ${body.message}`
              : `السبب: ${body.message}`
            : '';
          setUiState({
            resetStatus: 'error',
            resetMessage: translateResetMessage('failure', { details: detailMessage }),
            lastResetAt: attemptAt,
            lastResetResponse: body || { ok: false, status: response.status },
            lastResetHistoryEntry: null
          });
          console.warn('[POS Finance] Reset orders failed', { payload, response: body, status: response.status });
          return;
        }
        const removed = Number(body?.totalRemoved ?? 0);
        const historySummary = body?.historyEntry && typeof body.historyEntry === 'object' ? body.historyEntry : null;
  
        // Clear local data to trigger UI update via watch()
        if (db && typeof db.delete === 'function') {
          const tablesToPurge = Array.isArray(DEFAULT_PURGE_TABLES) ? DEFAULT_PURGE_TABLES : [];
          db.delete(...tablesToPurge);
        }
        const tablesSummary = Array.isArray(historySummary?.tables)
          ? historySummary.tables
              .filter((table) => table && table.name)
              .map((table) => `${table.name}: ${Number(table.count || 0)}`)
              .join(activeLang === 'en' ? ', ' : '، ')
          : '';
        setUiState({
          resetStatus: 'success',
          resetMessage: translateResetMessage('success', { removed, tablesSummary }),
          lastResetAt: attemptAt,
          lastResetResponse: body,
          lastResetHistoryEntry: historySummary
        });
        updateData();
        console.log('[POS Finance] Reset orders completed', { payload, response: body });
      } catch (error) {
        setUiState({
          resetStatus: 'error',
          resetMessage: translateResetMessage('network', { details: error?.message }),
          lastResetAt: attemptAt,
          lastResetResponse: { ok: false, status: 'network-error', error: error?.message },
          lastResetHistoryEntry: null
        });
        console.error('[POS Finance] Reset orders request failed', error);
      }
    };
  
    const handleCloseDay = async () => {
      const state = app.getState ? app.getState() : app.state;
      const ordersData = listRecords('orders');
      const paymentsData = listRecords('payments');
      const linesData = listRecords('lines');
      const shiftsData = listRecords('shifts');
      const normalizedSnapshot = enrichOrdersSnapshot(ordersData, linesData, paymentsData);
  
      const summary = state?.data?.summary || computeFinancialSummary({
        orders: normalizedSnapshot.orders,
        payments: paymentsData,
        shifts: shiftsData
      });
      setUiState({ closingStatus: 'pending', closingMessage: translateCloseMessage('pending') });
      let responsePayload = null;
      try {
        const dataClose = {
          branch: state?.data?.branch || branch,
          summary,
          generatedAt: new Date().toISOString()
        };
        
      let fullobject ={
          orders: ordersData,
          payments: paymentsData,
          lines: linesData,
          shifts: shiftsData,
          state,
          payload: dataClose
        };
        console.log('[POS Finance] Closing payload snapshot',fullobject );
        
        let basebrnamedomain ='';
        let branch_id=''
        let company_id=''
        let user_insert=''
  
        console.log('[POS Finance Diagnostic] branchParamFromLocation:', branchParamFromLocation);

        if(  branchParamFromLocation =="dar")
        {
            basebrnamedomain ='https://darwish.mas.com.eg'
            branch_id='7CA74BDC-7213-4C07-BD30-BB78CEA98EA1';
            company_id='027AE34D-DEF0-40D8-AC9F-2FBCBCEEDCE3';
            user_insert='000FB42C-FD45-4E45-A1EC-343BC4B8208C';
        }else if(branchParamFromLocation =="remal")
        {
  
            basebrnamedomain ='https://gremal.mas.com.eg'
            branch_id='2C58FF2F-8025-43F1-982C-9B9BD202ED67';
            company_id='840D022C-27B4-4C94-96F5-B1B554CA4886';
            user_insert='961B7E8A-35BE-42BD-A1CC-5B83CD8E28C6';
        }

        console.log('[POS Finance Diagnostic] basebrnamedomain set to:', basebrnamedomain);
        if(basebrnamedomain !='')
        {
            const jsonString = JSON.stringify(fullobject).replace(/'/g, "''");
            
            const sqlCommand = `Insert_From_JSON_payments N'${jsonString}', '${branch_id}', '${company_id}', '${user_insert}'`;


          
            let tryfetsh =`      fetch("${basebrnamedomain}/erp/procedq", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
                body: "id=" + encodeURIComponent("Insert_From_JSON_payments N'" + ${ "`" }${JSON.stringify(fullobject).replace(/'/g, "''")}${ "'`"  })
                }).then(response => response.text()) // Proced returns text usually
                .then(data => console.log(data))
                .catch(error => console.error('Error:', error));`
                    
         console.log(tryfetsh)
          
          console.log(`exec Insert_From_JSON_payments N'${ "`" }${JSON.stringify(fullobject).replace(/'/g, "''")}${ "'"}`);
          const response = await fetch(basebrnamedomain+"/erp/procedq", {
          method: 'POST',
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: "id=" + encodeURIComponent(sqlCommand)
        });
        const body = await response.json().catch(() => null);
        responsePayload = {
          ok: response.ok,
          status: response.status,
          body
        };
        setUiState({
          closingStatus: response.ok ? 'success' : 'error',
          closingMessage: response.ok
            ? translateCloseMessage('success')
            : translateCloseMessage('failure'),
          lastClosingResponse: responsePayload
        });
          
        }
  
        
      } catch (error) {
        responsePayload = { ok: false, status: 'network-error', error: error?.message };
        setUiState({
          closingStatus: 'error',
          closingMessage: translateCloseMessage('network', { details: error?.message }),
          lastClosingResponse: responsePayload
        });
      }
      console.log('[POS Finance] Demo closing response', responsePayload);
    };
  
    app.setOrders({
      'finance:theme:set': {
        on: ['click'],
        gkeys: ['finance:theme:set'],
        handler: (event) => {
          const btn = event?.target && event.target.closest('[data-theme]');
          if (!btn) return;
          const theme = btn.getAttribute('data-theme');
          setThemePreference(theme);
        }
      },
      'finance:lang:set': {
        on: ['click'],
        gkeys: ['finance:lang:set'],
        handler: (event) => {
          const btn = event?.target && event.target.closest('[data-lang]');
          if (!btn) return;
          const lang = btn.getAttribute('data-lang');
          setLanguagePreference(lang);
        }
      },
      'finance:reset-orders': {
        on: ['click'],
        gkeys: ['finance:reset-orders'],
        handler: handleResetOrders
      },
      'finance:close-day': {
        on: ['click'],
        gkeys: ['finance:close-day'],
        handler: handleCloseDay
      }
    });
  
    app.mount('#app');
  
    if (typeof global !== 'undefined') {
      global.addEventListener?.('beforeunload', () => {
        for (const unsubscribe of watchers.splice(0)) {
          try {
            if (typeof unsubscribe === 'function') unsubscribe();
          } catch (_err) {
            /* ignore */
          }
        }
      });
    }
  })(typeof window !== 'undefined' ? window : globalThis);
  
