(function(){
  const M = window.Mishkah;
  if(!M || !M.utils || !M.DSL) return;

  const UI = M.UI || {};
  const U = M.utils;
  const D = M.DSL;
  const { tw, cx } = U.twcss;

  const hasStructuredClone = typeof structuredClone === 'function';
  const JSONX = U.JSON || {};
  const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const cloneDeep = (value)=>{
    if(value == null) return value;
    if(JSONX && typeof JSONX.clone === 'function') return JSONX.clone(value);
    if(hasStructuredClone){
      try{ return structuredClone(value); } catch(_err){}
    }
    try{ return JSON.parse(JSON.stringify(value)); } catch(_err){
      if(Array.isArray(value)) return value.map(entry=> cloneDeep(entry));
      if(isPlainObject(value)) return Object.keys(value).reduce((acc,key)=>{ acc[key] = cloneDeep(value[key]); return acc; }, {});
      return value;
    }
  };

  const HANDOFF_STORAGE_KEY = 'mishkah:kds:handoff:v1';
  const resolveStorage = ()=>{
    if(typeof window === 'undefined') return null;
    const storage = window.localStorage || null;
    if(!storage) return null;
    try{
      const probeKey = '__kds_storage_probe__';
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      return storage;
    } catch(_err){
      return null;
    }
  };
  const handoffStorage = resolveStorage();
  const normalizeOrderKey = (value)=>{
    if(value == null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  };
  const shouldPersistHandoff = (record)=>{
    if(!record || typeof record !== 'object') return false;
    const status = record.status ? String(record.status).toLowerCase() : '';
    return status === 'assembled' || status === 'served';
  };
  const parsePersistedHandoff = ()=>{
    if(!handoffStorage) return {};
    try{
      const raw = handoffStorage.getItem(HANDOFF_STORAGE_KEY);
      if(!raw) return {};
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== 'object') return {};
      return Object.keys(parsed).reduce((acc, key)=>{
        const entry = parsed[key];
        if(entry && typeof entry === 'object'){
          acc[key] = { ...entry };
        }
        return acc;
      }, {});
    } catch(_err){
      return {};
    }
  };
  const persistedHandoff = parsePersistedHandoff();
  const writePersistedHandoff = ()=>{
    if(!handoffStorage) return;
    try{
      handoffStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(persistedHandoff));
    } catch(_err){ /* ignore persistence errors */ }
  };
  const recordPersistedHandoff = (orderId, record)=>{
    const key = normalizeOrderKey(orderId);
    if(!key) return;
    if(record && shouldPersistHandoff(record)){
      persistedHandoff[key] = { ...record };
    } else if(persistedHandoff[key]){
      delete persistedHandoff[key];
    }
    writePersistedHandoff();
  };
  const clonePersistedHandoff = ()=> Object.keys(persistedHandoff).reduce((acc, key)=>{
    acc[key] = cloneDeep(persistedHandoff[key]);
    return acc;
  }, {});
  const resolveHandoffTimestamp = (record)=>{
    if(!record || typeof record !== 'object') return 0;
    const candidates = [record.updatedAt, record.servedAt, record.assembledAt];
    for(const value of candidates){
      const ms = value ? Date.parse(value) : NaN;
      if(Number.isFinite(ms)) return ms;
    }
    return 0;
  };
  const applyExpoStatusForOrder = (source, orderId, patch={})=>{
    if(!Array.isArray(source)) return source;
    const key = normalizeOrderKey(orderId);
    if(!key) return source;
    let changed = false;
    const next = source.map(ticket=>{
      if(!ticket || typeof ticket !== 'object') return ticket;
      const ticketKey = normalizeOrderKey(ticket.orderId || ticket.order_id || ticket.orderID);
      if(ticketKey && ticketKey === key){
        changed = true;
        return { ...ticket, ...patch };
      }
      return ticket;
    });
    return changed ? next : source;
  };
  const syncExpoSourceWithHandoff = (source, handoffMap)=>{
    if(!Array.isArray(source)) return source;
    if(!handoffMap || typeof handoffMap !== 'object') return source;
    let changed = false;
    const next = source.map(ticket=>{
      if(!ticket || typeof ticket !== 'object') return ticket;
      const ticketKey = normalizeOrderKey(ticket.orderId || ticket.order_id || ticket.orderID);
      if(!ticketKey) return ticket;
      const record = handoffMap[ticketKey];
      if(!record || typeof record !== 'object') return ticket;
      const status = record.status;
      if(status && status !== ticket.status){
        changed = true;
        const patch = { status };
        if(record.updatedAt) patch.updatedAt = record.updatedAt;
        if(record.assembledAt) patch.assembledAt = record.assembledAt;
        if(record.servedAt) patch.servedAt = record.servedAt;
        return { ...ticket, ...patch };
      }
      return ticket;
    });
    return changed ? next : source;
  };

  const normalizeChannelName = (value, fallback='default')=>{
    const base = value == null ? '' : String(value).trim();
    const raw = base || fallback || 'default';
    return raw.replace(/[^A-Za-z0-9:_-]+/g, '-').toLowerCase();
  };

  const safeText = (value)=> (value == null ? '' : String(value).trim());

  const resolveOrderNumber = (rawNumber, fallbackId)=>{
    const raw = safeText(rawNumber);
    const fallback = safeText(fallbackId);
    if(!raw) return fallback || raw;
    const numeric = /^#?\d+$/.test(raw);
    if(!fallback) return raw;
    if(raw === fallback) return raw;
    const fallbackHasLetters = /[A-Za-z]/.test(fallback);
    const fallbackHasSymbol = /[-_]/.test(fallback);
    if(numeric && (fallbackHasLetters || fallbackHasSymbol)) return fallback;
    if(numeric && fallback.length > raw.replace(/^#/, '').length) return fallback;
    return raw;
  };

  const TEXT_DICT = {
    "title": {
      "ar": " شاشة المطبخ",
      "en": "Mishkah — Kitchen display"
    },
    "subtitle": {
      "ar": "إدارة التحضير والتسليم لحظيًا",
      "en": "Live preparation and dispatch management"
    },
    "status": {
      "online": {
        "ar": "🟢 متصل",
        "en": "🟢 Online"
      },
      "offline": {
        "ar": "🔴 غير متصل",
        "en": "🔴 Offline"
      },
      "syncing": {
        "ar": "🔄 مزامنة",
        "en": "🔄 Syncing"
      }
    },
    "stats": {
      "total": {
        "ar": "إجمالي الأوامر",
        "en": "Total jobs"
      },
      "expedite": {
        "ar": "أوامر عاجلة",
        "en": "Expedite"
      },
      "alerts": {
        "ar": "تنبيهات",
        "en": "Alerts"
      },
      "ready": {
        "ar": "جاهز",
        "en": "Ready"
      },
      "pending": {
        "ar": "قيد التحضير",
        "en": "In progress"
      }
    },
    "tabs": {
      "prep": {
        "ar": "كل الأقسام",
        "en": "All stations"
      },
      "expo": {
        "ar": "شاشة التجميع",
        "en": "Expeditor"
      },
      "handoff": {
        "ar": "شاشة التسليم",
        "en": "Service handoff"
      },
      "delivery": {
        "ar": "تسليم الدليفري",
        "en": "Delivery handoff"
      },
      "pendingDelivery": {
        "ar": "معلقات الدليفري",
        "en": "Delivery settlements"
      }
    },
    "empty": {
      "prep": {
        "ar": "لا توجد طلبات محفوظة بعد.",
        "en": "No orders have been saved yet."
      },
      "station": {
        "ar": "لا توجد أوامر لهذا القسم حاليًا.",
        "en": "No active tickets for this station."
      },
      "expo": {
        "ar": "لا توجد تذاكر تجميع حالية.",
        "en": "No expo tickets at the moment."
      },
      "handoff": {
        "ar": "لا توجد طلبات جاهزة للتسليم الآن.",
        "en": "No orders awaiting handoff right now."
      },
      "delivery": {
        "ar": "لا توجد طلبات دليفري حالية.",
        "en": "No delivery orders right now."
      },
      "pending": {
        "ar": "لا توجد طلبات دليفري معلقة للتحصيل.",
        "en": "No outstanding delivery settlements."
      }
    },
    "actions": {
      "start": {
        "ar": "بدء التجهيز",
        "en": "Start prep"
      },
      "finish": {
        "ar": "تم التجهيز",
        "en": "Mark ready"
      },
      "assignDriver": {
        "ar": "تعيين السائق",
        "en": "Assign driver"
      },
      "delivered": {
        "ar": "تم التسليم",
        "en": "Delivered"
      },
      "handoffComplete": {
        "ar": "تم التجميع",
        "en": "Mark assembled"
      },
      "handoffServe": {
        "ar": "تم التسليم",
        "en": "Mark served"
      },
      "settle": {
        "ar": "تسوية التحصيل",
        "en": "Settle payment"
      }
    },
    "labels": {
      "order": {
        "ar": "طلب",
        "en": "Order"
      },
      "table": {
        "ar": "طاولة",
        "en": "Table"
      },
      "customer": {
        "ar": "عميل",
        "en": "Guest"
      },
      "station": {
        "ar": "المحطة",
        "en": "Station"
      },
      "due": {
        "ar": "الاستحقاق",
        "en": "Due at"
      },
      "timer": {
        "ar": "المدة",
        "en": "Duration"
      },
      "driver": {
        "ar": "السائق",
        "en": "Driver"
      },
      "driverPhone": {
        "ar": "رقم السائق",
        "en": "Driver phone"
      },
      "notAssigned": {
        "ar": "لم يتم التعيين بعد",
        "en": "Not assigned yet"
      },
      "handoffStatus": {
        "pending": {
          "ar": "قيد التحضير",
          "en": "In progress"
        },
        "ready": {
          "ar": "جاهز للتجميع",
          "en": "Ready to assemble"
        },
        "assembled": {
          "ar": "جاهز للتسليم",
          "en": "Ready for handoff"
        },
        "served": {
          "ar": "تم التسليم",
          "en": "Completed"
        }
      },
      "serviceMode": {
        "dine_in": {
          "ar": "صالة",
          "en": "Dine-in"
        },
        "delivery": {
          "ar": "دليفري",
          "en": "Delivery"
        },
        "takeaway": {
          "ar": "تيك أواي",
          "en": "Takeaway"
        },
        "drive_thru": {
          "ar": "درايف ثرو",
          "en": "Drive-thru"
        },
        "pickup": {
          "ar": "استلام",
          "en": "Pickup"
        }
      },
      "jobStatus": {
        "queued": {
          "ar": "بانتظار",
          "en": "Queued"
        },
        "awaiting": {
          "ar": "بانتظار",
          "en": "Awaiting"
        },
        "accepted": {
          "ar": "تم القبول",
          "en": "Accepted"
        },
        "in_progress": {
          "ar": "قيد التحضير",
          "en": "Preparing"
        },
        "cooking": {
          "ar": "قيد التحضير",
          "en": "Preparing"
        },
        "ready": {
          "ar": "جاهز",
          "en": "Ready"
        },
        "completed": {
          "ar": "مكتمل",
          "en": "Completed"
        },
        "cancelled": {
          "ar": "ملغي",
          "en": "Cancelled"
        },
        "paused": {
          "ar": "متوقف",
          "en": "Paused"
        }
      },
      "deliveryStatus": {
        "pending": {
          "ar": "بانتظار التسليم",
          "en": "Pending dispatch"
        },
        "assigned": {
          "ar": "تم تعيين السائق",
          "en": "Driver assigned"
        },
        "onRoute": {
          "ar": "في الطريق",
          "en": "On the way"
        },
        "delivered": {
          "ar": "تم التسليم",
          "en": "Delivered"
        },
        "settled": {
          "ar": "تم التحصيل",
          "en": "Settled"
        }
      },
      "expoReady": {
        "ar": "جاهز للتسليم",
        "en": "Ready to handoff"
      },
      "expoPending": {
        "ar": "بانتظار الأقسام",
        "en": "Waiting for stations"
      }
    },
    "modal": {
      "driverTitle": {
        "ar": "اختر السائق المناسب",
        "en": "Select a driver"
      },
      "driverDescription": {
        "ar": "حدد السائق المسؤول عن الطلب، وسيتم إعلام نقطة البيع فورًا.",
        "en": "Choose who will handle the delivery. POS will be notified instantly."
      },
      "close": {
        "ar": "إغلاق",
        "en": "Close"
      }
    },
    "controls": {
      "theme": {
        "ar": "المظهر",
        "en": "Theme"
      },
      "light": {
        "ar": "نهاري",
        "en": "Light"
      },
      "dark": {
        "ar": "ليلي",
        "en": "Dark"
      },
      "language": {
        "ar": "اللغة",
        "en": "Language"
      },
      "arabic": {
        "ar": "عربي",
        "en": "Arabic"
      },
      "english": {
        "ar": "إنجليزي",
        "en": "English"
      }
    }
  };

  const flattenTextDict = (node, prefix=[])=>{
    const flat = {};
    Object.keys(node).forEach(key=>{
      const value = node[key];
      const path = prefix.concat(key);
      if(value && typeof value === 'object' && !Array.isArray(value) && !('ar' in value || 'en' in value)){
        Object.assign(flat, flattenTextDict(value, path));
      } else {
        flat[path.join('.')] = value;
      }
    });
    return flat;
  };

  const inflateTexts = (node, resolver, prefix=[])=>{
    if(node && typeof node === 'object' && !Array.isArray(node)){
      if('ar' in node || 'en' in node){
        const key = prefix.join('.');
        return resolver(key);
      }
      const out = {};
      Object.keys(node).forEach(key=>{
        out[key] = inflateTexts(node[key], resolver, prefix.concat(key));
      });
      return out;
    }
    return node;
  };

  const TEXT_FLAT = flattenTextDict(TEXT_DICT);

  const getTexts = (db)=>{
    const langContext = { env:{ lang: db?.env?.lang }, i18n:{ dict: TEXT_FLAT, fallback:'ar' } };
    const { TL } = U.lang.makeLangLookup(langContext);
    return inflateTexts(TEXT_DICT, TL, []);
  };

  const STATUS_PRIORITY = { ready:4, completed:4, in_progress:3, cooking:3, accepted:2, queued:1, awaiting:1, paused:0, cancelled:-1 };
  const STATUS_CLASS = {
    queued: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    awaiting: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    accepted: tw`border-sky-300/40 bg-sky-400/10 text-sky-100`,
    in_progress: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    cooking: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    ready: tw`border-emerald-300/50 bg-emerald-500/10 text-emerald-50`,
    completed: tw`border-emerald-400/60 bg-emerald-500/20 text-emerald-50`,
    paused: tw`border-slate-400/50 bg-slate-500/10 text-slate-200`,
    cancelled: tw`border-rose-400/60 bg-rose-500/15 text-rose-100`
  };

  const DELIVERY_STATUS_CLASS = {
    pending: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    assigned: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    onRoute: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    delivered: tw`border-emerald-300/50 bg-emerald-500/10 text-emerald-50`,
    settled: tw`border-emerald-400/60 bg-emerald-500/20 text-emerald-50`
  };

  const HANDOFF_STATUS_CLASS = {
    pending: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    ready: tw`border-emerald-300/60 bg-emerald-500/15 text-emerald-50`,
    assembled: tw`border-sky-300/50 bg-sky-500/15 text-sky-50`,
    served: tw`border-slate-500/40 bg-slate-800/70 text-slate-100`
  };

  const SERVICE_ICONS = { dine_in:'🍽️', delivery:'🚚', takeaway:'🧾', pickup:'🛍️', drive_thru:'🚗' };
  const SERVICE_MODE_FALLBACK = 'dine_in';

  const SERVICE_ALIASES = {
    dine_in: [
      'dine',
      'dine in',
      'dine-in',
      'dine_in',
      'eat in',
      'eat-in',
      'eat_in',
      'hall',
      'inhouse',
      'in-house',
      'in house',
      'inside',
      'internal',
      'restaurant',
      'table',
      'صالة',
      'صاله',
      'داخل',
      'داخلي',
      'جلسة',
      'مجلس'
    ],
    delivery: [
      'delivery',
      'deliver',
      'del',
      'deliv',
      'delevery',
      'dilivery',
      'courier',
      'express',
      'خارجي',
      'التوصيل',
      'توصيل',
      'خارجية',
      'دليفري',
      'ديليفري',
      'ديلفري',
      'ديليفري'
    ],
    takeaway: [
      'takeaway',
      'take away',
      'take-away',
      'take_away',
      'carryout',
      'carry out',
      'carry-out',
      'counter',
      'walk in',
      'walk-in',
      'walkin',
      'سفري',
      'سفريه',
      'تيك',
      'تيك اوي',
      'تيك أوي',
      'تيكاوي',
      'تيك-اوي'
    ],
    pickup: [
      'pickup',
      'pick up',
      'pick-up',
      'collection',
      'collect',
      'self pickup',
      'self-pickup',
      'self_pickup',
      'استلام',
      'استلام ذاتي',
      'استلام شخصي',
      'استلم'
    ],
    drive_thru: [
      'drive',
      'drive thru',
      'drive-thru',
      'drive_thru',
      'drive through',
      'car',
      'سيارة',
      'سياره',
      'درايف'
    ]
  };

  const normalizeServiceToken = (value) => {
    const text = safeText(value);
    if (!text) return '';
    return text
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[()]/g, ' ')
      .replace(/[_-]+/g, ' ')
      .replace(/[^A-Za-z0-9\u0600-\u06FF]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  const SERVICE_ALIAS_LOOKUP = new Map();
  Object.keys(SERVICE_ALIASES).forEach((service) => {
    const aliases = SERVICE_ALIASES[service] || [];
    const tokens = new Set();
    tokens.add(service);
    aliases.forEach((alias) => tokens.add(alias));
    tokens.forEach((token) => {
      const normalized = normalizeServiceToken(token);
      if (!normalized) return;
      SERVICE_ALIAS_LOOKUP.set(normalized, service);
      const collapsed = normalized.replace(/\s+/g, '');
      if (collapsed) SERVICE_ALIAS_LOOKUP.set(collapsed, service);
    });
  });

  const detectServiceModeFromValue = (value) => {
    if (!value && value !== 0) return '';
    if (Array.isArray(value)) {
      for (const entry of value) {
        const detected = detectServiceModeFromValue(entry);
        if (detected) return detected;
      }
      return '';
    }
    if (typeof value === 'object') {
      if (!value) return '';
      const fields = [
        value.serviceMode,
        value.service_mode,
        value.orderType,
        value.order_type,
        value.orderTypeId,
        value.order_type_id,
        value.orderTypeCode,
        value.order_type_code,
        value.orderTypeName,
        value.order_type_name,
        value.type,
        value.typeName,
        value.type_name,
        value.slug,
        value.code,
        value.value,
        value.name,
        value.label,
        value.title,
        value.text,
        value.nameAr,
        value.nameAR,
        value.name_ar,
        value.nameEn,
        value.nameEN,
        value.name_en,
        value.labelAr,
        value.labelAR,
        value.label_ar,
        value.labelEn,
        value.labelEN,
        value.label_en,
        value.type_name?.ar,
        value.type_name?.en,
        value.name?.ar,
        value.name?.en,
        value.label?.ar,
        value.label?.en
      ];
      for (const field of fields) {
        const detected = detectServiceModeFromValue(field);
        if (detected) return detected;
      }
      return '';
    }
    const normalized = normalizeServiceToken(value);
    if (!normalized) return '';
    if (SERVICE_ALIAS_LOOKUP.has(normalized)) {
      return SERVICE_ALIAS_LOOKUP.get(normalized);
    }
    const collapsed = normalized.replace(/\s+/g, '');
    if (SERVICE_ALIAS_LOOKUP.has(collapsed)) {
      return SERVICE_ALIAS_LOOKUP.get(collapsed);
    }
    return '';
  };

  const registerServiceLookup = (lookup, key, service) => {
    if (!lookup || !service) return;
    const raw = safeText(key);
    if (!raw) return;
    const lowered = raw.toLowerCase();
    if (lowered) lookup.set(lowered, service);
    const collapsedId = lowered.replace(/\s+/g, '');
    if (collapsedId) lookup.set(collapsedId, service);
    const normalized = normalizeServiceToken(raw);
    if (normalized) {
      lookup.set(normalized, service);
      const collapsed = normalized.replace(/\s+/g, '');
      if (collapsed) lookup.set(collapsed, service);
    }
  };

  const buildOrderTypeMapLookup = (payload) => {
    const lookup = new Map();
    const sources = [
      payload?.orderTypeMap,
      payload?.order_type_map,
      payload?.orderTypesMap,
      payload?.order_types_map,
      payload?.orderTypeLookup,
      payload?.order_type_lookup,
      payload?.meta?.orderTypeMap,
      payload?.meta?.order_type_map,
      payload?.meta?.orderTypeLookup,
      payload?.meta?.order_type_lookup,
      payload?.settings?.orderTypeMap,
      payload?.settings?.order_type_map,
      payload?.settings?.orderTypeLookup,
      payload?.settings?.order_type_lookup,
      payload?.kds?.orderTypeMap,
      payload?.kds?.order_type_map,
      payload?.kds?.orderTypeLookup,
      payload?.kds?.order_type_lookup,
      payload?.master?.orderTypeMap,
      payload?.master?.order_type_map,
      payload?.master?.orderTypeLookup,
      payload?.master?.order_type_lookup
    ];
    sources.forEach((source) => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach((entry) => {
          if (!entry) return;
          if (Array.isArray(entry) && entry.length >= 2) {
            const service = detectServiceModeFromValue(entry[1]);
            if (service) registerServiceLookup(lookup, entry[0], service);
          } else if (typeof entry === 'object') {
            const key = entry.key || entry.id || entry.code || entry.value;
            const value =
              entry.serviceMode ||
              entry.service_mode ||
              entry.value ||
              entry.type ||
              entry.slug ||
              entry.code ||
              entry.name ||
              entry.label;
            const service = detectServiceModeFromValue(value);
            if (service) registerServiceLookup(lookup, key, service);
          }
        });
      } else if (typeof source === 'object') {
        Object.entries(source).forEach(([key, value]) => {
          const service = detectServiceModeFromValue(value);
          if (service) registerServiceLookup(lookup, key, service);
        });
      }
    });
    return lookup;
  };

  const buildOrderTypeTypeLookup = (payload, mapLookup) => {
    const lookup = new Map();
    const types = ensureArray(
      payload?.order_types || payload?.orderTypes || payload?.master?.orderTypes
    );
    types.forEach((type) => {
      if (!type) return;
      const candidates = new Set();
      [
        type.id,
        type.orderTypeId,
        type.order_type_id,
        type.orderTypeCode,
        type.order_type_code,
        type.code,
        type.slug,
        type.type,
        type.value,
        type.name,
        type.label,
        type.type_name?.ar,
        type.type_name?.en,
        type.name?.ar,
        type.name?.en,
        type.label?.ar,
        type.label?.en
      ].forEach((field) => {
        const text = safeText(field);
        if (text) candidates.add(text);
      });
      let resolved = '';
      for (const candidate of candidates) {
        resolved = resolved || detectServiceModeFromValue(candidate);
        if (resolved) break;
      }
      if (!resolved) {
        resolved = detectServiceModeFromValue(type);
      }
      if (!resolved) {
        for (const candidate of candidates) {
          const mapMatch = (key) => mapLookup.get(key) || '';
          const lowered = safeText(candidate).toLowerCase();
          resolved = mapMatch(lowered);
          if (!resolved) {
            const collapsed = lowered.replace(/\s+/g, '');
            resolved = mapMatch(collapsed);
          }
          if (!resolved) {
            const normalized = normalizeServiceToken(candidate);
            resolved = mapMatch(normalized);
            if (!resolved) {
              const collapsedNorm = normalized.replace(/\s+/g, '');
              resolved = mapMatch(collapsedNorm);
            }
          }
          if (resolved) break;
        }
      }
      const service = resolved || SERVICE_MODE_FALLBACK;
      candidates.forEach((candidate) => {
        registerServiceLookup(lookup, candidate, service);
      });
    });
    return lookup;
  };

  let lastServiceLookupPayload = null;
  let lastServiceLookup = null;
  const getOrderTypeLookups = (payload) => {
    if (payload && payload === lastServiceLookupPayload && lastServiceLookup) {
      return lastServiceLookup;
    }
    const mapLookup = buildOrderTypeMapLookup(payload || {});
    const typeLookup = buildOrderTypeTypeLookup(payload || {}, mapLookup);
    lastServiceLookupPayload = payload;
    lastServiceLookup = { mapLookup, typeLookup };
    return lastServiceLookup;
  };

  const lookupServiceCandidate = (lookup, candidate) => {
    if (!lookup) return '';
    const text = safeText(candidate);
    if (!text) return '';
    const lowered = text.toLowerCase();
    if (lookup.has(lowered)) return lookup.get(lowered);
    const collapsedId = lowered.replace(/\s+/g, '');
    if (lookup.has(collapsedId)) return lookup.get(collapsedId);
    const normalized = normalizeServiceToken(text);
    if (lookup.has(normalized)) return lookup.get(normalized);
    const collapsed = normalized.replace(/\s+/g, '');
    if (lookup.has(collapsed)) return lookup.get(collapsed);
    return '';
  };

  const parseTime = (value)=>{
    if(!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  };

  const formatClock = (value, lang)=>{
    const ms = typeof value === 'number' ? value : parseTime(value);
    if(!ms) return '—';
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    return new Date(ms).toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
  };

  const formatDuration = (elapsedMs)=>{
    if(!elapsedMs || elapsedMs < 0) return '00:00';
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (value)=> value < 10 ? `0${value}` : String(value);
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const sum = (list, selector)=> list.reduce((acc, item)=> acc + (Number(selector(item)) || 0), 0);

  const ensureQuantity = (value)=>{
    const num = Number(value);
    if(Number.isFinite(num) && num > 0) return num;
    return 1;
  };

  const previewList = (value, limit = 5)=> Array.isArray(value) ? value.slice(0, limit) : [];
  const mapSectionPreview = (section = {})=>{
    const id = section.id || section.stationId || section.sectionId || null;
    return {
      id,
      code: section.code || section.stationCode || (id ? String(id).toUpperCase() : null),
      nameAr: section.nameAr || section.section_name?.ar || section.name?.ar || section.nameAr || section.name || '',
      nameEn: section.nameEn || section.section_name?.en || section.name?.en || section.nameEn || section.name || '',
      stationType: section.stationType || (section.isExpo || section.is_expo ? 'expo' : 'prep')
    };
  };
  const mapRoutePreview = (route = {})=>({
    id: route.id || route.routeId || null,
    categoryId: route.categoryId || route.category_id || null,
    sectionId: route.stationId || route.station_id || route.sectionId || null,
    priority: route.priority ?? null,
    isActive: route.isActive ?? route.active ?? null
  });
  const mapMenuItemPreview = (item = {})=>({
    id: item.id || item.itemId || item.menuItemId || null,
    code: item.code || item.itemCode || item.menuItemCode || null,
    nameAr: item.nameAr || item.itemNameAr || item.item_name_ar || item.name?.ar || '',
    nameEn: item.nameEn || item.itemNameEn || item.item_name_en || item.name?.en || '',
    sectionId: item.kitchenSectionId || item.sectionId || item.stationId || null,
    categoryId: item.categoryId || item.menuCategoryId || null
  });
  const mapJobHeaderPreview = (header = {})=>({
    id: header.id || header.jobOrderId || null,
    orderId: header.orderId || header.order_id || null,
    stationId: header.stationId || header.sectionId || null,
    stationCode: header.stationCode || header.station_code || null,
    status: header.status || '',
    totalItems: header.totalItems || 0,
    completedItems: header.completedItems || 0
  });
  const mapDetailPreview = (detail = {})=>({
    id: detail.id || detail.detailId || null,
    jobOrderId: detail.jobOrderId || detail.job_id || null,
    itemId: detail.itemId || detail.menuItemId || null,
    itemCode: detail.itemCode || detail.code || null,
    quantity: detail.quantity || 0,
    status: detail.status || '',
    itemNameAr: detail.itemNameAr || detail.nameAr || detail.item_name_ar || '',
    itemNameEn: detail.itemNameEn || detail.nameEn || detail.item_name_en || ''
  });
  const mapDriverPreview = (driver = {})=>({
    id: driver.id || driver.driverId || driver.code || null,
    name: driver.name || driver.driverName || driver.fullName || driver.displayName || '',
    phone: driver.phone || driver.driverPhone || driver.mobile || ''
  });

  const summarizeJobPayload = (payload = {})=>{
    const jobOrders = payload.jobOrders || {};
    const master = payload.master || {};
    const headers = Array.isArray(jobOrders.headers) ? jobOrders.headers : [];
    const details = Array.isArray(jobOrders.details) ? jobOrders.details : [];
    const stations = Array.isArray(master.stations) ? master.stations : [];
    const kitchenSections = Array.isArray(master.kitchenSections) ? master.kitchenSections : [];
    const stationCategoryRoutes = Array.isArray(master.stationCategoryRoutes) ? master.stationCategoryRoutes : [];
    const menuItems = Array.isArray(master.menu_items) ? master.menu_items : [];
    const menuCategories = Array.isArray(master.menu_categories) ? master.menu_categories : [];
    const drivers = Array.isArray(payload.drivers)
      ? payload.drivers
      : (Array.isArray(master.drivers) ? master.drivers : []);
    return {
      counts:{
        headers: headers.length,
        details: details.length,
        stations: stations.length,
        kitchenSections: kitchenSections.length,
        stationCategoryRoutes: stationCategoryRoutes.length,
        menuItems: menuItems.length,
        menuCategories: menuCategories.length,
        drivers: drivers.length
      },
      samples:{
        headers: previewList(headers, 5).map(mapJobHeaderPreview),
        details: previewList(details, 5).map(mapDetailPreview),
        stations: previewList(stations, 5).map(mapSectionPreview),
        kitchenSections: previewList(kitchenSections, 5).map(mapSectionPreview),
        stationCategoryRoutes: previewList(stationCategoryRoutes, 5).map(mapRoutePreview),
        menuItems: previewList(menuItems, 5).map(mapMenuItemPreview),
        drivers: previewList(drivers, 5).map(mapDriverPreview)
      }
    };
  };

  const summarizeAppStateSnapshot = (state)=>{
    if(!state || typeof state !== 'object') return null;
    const data = state.data || {};
    const jobsList = Array.isArray(data.jobs?.list)
      ? data.jobs.list
      : (Array.isArray(data.jobs) ? data.jobs : []);
    const byStation = data.jobs && data.jobs.byStation ? data.jobs.byStation : {};
    const stations = Array.isArray(data.stations) ? data.stations : [];
    const kitchenSections = Array.isArray(data.kitchenSections) ? data.kitchenSections : [];
    const stationCategoryRoutes = Array.isArray(data.stationCategoryRoutes) ? data.stationCategoryRoutes : [];
    const categorySections = Array.isArray(data.categorySections) ? data.categorySections : [];
    const menuItems = Array.isArray(data.menu?.items) ? data.menu.items : [];
    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    const deliveries = data.deliveries || {};
    const assignmentKeys = deliveries.assignments ? Object.keys(deliveries.assignments) : [];
    const settlementKeys = deliveries.settlements ? Object.keys(deliveries.settlements) : [];
    const jobsByStation = Object.keys(byStation).map((stationId)=>({
      stationId,
      jobCount: Array.isArray(byStation[stationId]) ? byStation[stationId].length : 0
    }));
    return {
      filters:{
        activeTab: data.filters?.activeTab || null,
        lockedSection: data.filters?.lockedSection || null
      },
      counts:{
        jobs: jobsList.length,
        stations: stations.length,
        kitchenSections: kitchenSections.length,
        stationCategoryRoutes: stationCategoryRoutes.length,
        categorySections: categorySections.length,
        menuItems: menuItems.length,
        drivers: drivers.length,
        deliveryAssignments: assignmentKeys.length,
        deliverySettlements: settlementKeys.length
      },
      stations: previewList(stations, 5).map(mapSectionPreview),
      kitchenSections: previewList(kitchenSections, 5).map(mapSectionPreview),
      stationCategoryRoutes: previewList(stationCategoryRoutes, 5).map(mapRoutePreview),
      categorySections: previewList(categorySections, 5).map(mapRoutePreview),
      menuItems: previewList(menuItems, 5).map(mapMenuItemPreview),
      drivers: previewList(drivers, 5).map(mapDriverPreview),
      jobsByStation: previewList(jobsByStation, 10),
      jobs: previewList(jobsList, 5).map(job=>({
        id: job.id || job.jobOrderId || null,
        orderId: job.orderId || null,
        stationId: job.stationId || job.sectionId || null,
        stationCode: job.stationCode || null,
        status: job.status || '',
        totalItems: job.totalItems || 0,
        completedItems: job.completedItems || 0,
        details: previewList(job.details, 3).map(mapDetailPreview)
      }))
    };
  };

  const logDebugGroup = (label, details)=>{
    if(typeof console === 'undefined') return;
    try{
      if(typeof console.groupCollapsed === 'function'){
        console.groupCollapsed(label);
        if(details && typeof details === 'object'){
          Object.keys(details).forEach(key=>{
            console.log(`${key}:`, details[key]);
          });
        } else {
          console.log(details);
        }
        console.groupEnd();
      } else {
        console.log(label, details);
      }
    } catch(_err){
      try{ console.log(label, details); } catch(__err){ /* ignore */ }
    }
  };

  let lastWatcherSnapshot = null;
  let lastStateSnapshot = null;

  const computeOrdersSnapshot = (db)=>{
    const orders = Array.isArray(db?.data?.jobs?.orders) ? db.data.jobs.orders : [];
    const handoff = db?.data?.handoff || {};
    const stationMap = db?.data?.stationMap || {};
    const menuIndex = db?.data?.menuIndex || {};
    return orders.map(order=>{
      const orderKey = normalizeOrderKey(order.orderId || order.id);
      let record = (orderKey && (handoff[orderKey] || handoff[order.orderId] || handoff[order.id])) || {};
      const recordStatus = record.status ? String(record.status).toLowerCase() : '';
      if(orderKey && (recordStatus === 'assembled' || recordStatus === 'served')){
        const orderTimeCandidates = [order.updatedAt, order.completedAt, order.readyAt, order.acceptedAt, order.createdAt];
        const orderTimestamp = orderTimeCandidates.reduce((acc, value)=>{
          const ms = parseTime(value);
          return ms && ms > acc ? ms : acc;
        }, 0);
        const recordTimestamp = resolveHandoffTimestamp(record);
        if(!recordTimestamp || (orderTimestamp && orderTimestamp > recordTimestamp)){
          recordPersistedHandoff(orderKey, null);
          record = {};
        }
      }
      let totalItems = 0;
      let readyItems = 0;
      let pendingItems = 0;
      const detailRows = [];
      const jobs = Array.isArray(order.jobs) ? order.jobs : [];
      jobs.forEach(job=>{
        const jobDetails = Array.isArray(job.details) ? job.details : [];
        const station = stationMap[job.stationId] || {};
        const stationLabelAr = station.nameAr || job.stationCode || job.stationId;
        const stationLabelEn = station.nameEn || job.stationCode || job.stationId;
        if(jobDetails.length){
          jobDetails.forEach(detail=>{
            const quantity = ensureQuantity(detail.quantity);
            const menuItem = detail.itemId ? menuIndex[String(detail.itemId)] : null;
            const detailClone = {
              ...detail,
              quantity,
              itemNameAr: detail.itemNameAr || menuItem?.nameAr || detail.itemId || stationLabelAr,
              itemNameEn: detail.itemNameEn || menuItem?.nameEn || detail.itemId || stationLabelEn
            };
            totalItems += quantity;
            if(detailClone.status === 'ready' || detailClone.status === 'completed'){
              readyItems += quantity;
            } else {
              pendingItems += quantity;
            }
            detailRows.push({ detail: detailClone, stationLabelAr, stationLabelEn });
          });
        } else {
          const quantity = ensureQuantity(job.totalItems || job.completedItems || 1);
          const fallbackDetail = {
            id: `${job.id}-fallback`,
            itemNameAr: stationLabelAr,
            itemNameEn: stationLabelEn,
            status: job.status,
            quantity,
            prepNotes: job.notes || '',
            modifiers: []
          };
          if(job.status === 'ready' || job.status === 'completed'){
            readyItems += quantity;
          } else {
            pendingItems += quantity;
          }
          totalItems += quantity;
          detailRows.push({ detail: fallbackDetail, stationLabelAr, stationLabelEn });
        }
      });
      if(totalItems === 0){
        totalItems = jobs.reduce((acc, job)=> acc + (Number(job.totalItems) || (Array.isArray(job.details) ? job.details.reduce((dAcc, detail)=> dAcc + ensureQuantity(detail.quantity), 0) : 0)), 0);
        readyItems = jobs.reduce((acc, job)=> acc + (Number(job.completedItems) || 0), 0);
        pendingItems = Math.max(0, totalItems - readyItems);
      }
      let status = record.status;
      if(status === 'assembled' || status === 'served'){
        if(pendingItems > 0){
          status = 'pending';
        } else if(readyItems < totalItems){
          status = 'pending';
        }
      } else {
        status = (totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending';
      }
      return { ...order, handoffStatus: status, handoffRecord: record, readyItems, totalItems, pendingItems, detailRows };
    });
  };

  const buildExpoFallbackOrder = (ticket, db)=>{
    if(!ticket || typeof ticket !== 'object') return null;
    const stationMap = db?.data?.stationMap || {};
    const menuIndex = db?.data?.menuIndex || {};
    const jobs = Array.isArray(ticket.jobs) ? ticket.jobs : [];
    let totalItems = 0;
    let readyItems = 0;
    const detailRows = [];

    jobs.forEach(job=>{
      if(!job || typeof job !== 'object') return;
      const station = stationMap[job.stationId] || {};
      const stationLabelAr = station.nameAr || job.stationCode || job.stationId;
      const stationLabelEn = station.nameEn || job.stationCode || job.stationId;
      const jobDetails = Array.isArray(job.details) ? job.details : [];
      if(jobDetails.length){
        jobDetails.forEach(detail=>{
          if(!detail || typeof detail !== 'object') return;
          const quantity = ensureQuantity(detail.quantity);
          const menuItem = detail.itemId ? menuIndex[String(detail.itemId)] : null;
          const detailClone = {
            ...detail,
            quantity,
            itemNameAr: detail.itemNameAr || menuItem?.nameAr || detail.itemId || stationLabelAr,
            itemNameEn: detail.itemNameEn || menuItem?.nameEn || detail.itemId || stationLabelEn
          };
          totalItems += quantity;
          if(detailClone.status === 'ready' || detailClone.status === 'completed'){
            readyItems += quantity;
          }
          detailRows.push({ detail: detailClone, stationLabelAr, stationLabelEn });
        });
      } else {
        const quantity = ensureQuantity(job.totalItems || job.completedItems || 1);
        const fallbackDetail = {
          id: `${job.id || 'job'}-fallback`,
          itemNameAr: stationLabelAr,
          itemNameEn: stationLabelEn,
          status: job.status,
          quantity,
          prepNotes: job.notes || '',
          modifiers: []
        };
        if(job.status === 'ready' || job.status === 'completed'){
          readyItems += quantity;
        }
        totalItems += quantity;
        detailRows.push({ detail: fallbackDetail, stationLabelAr, stationLabelEn });
      }
    });

    if(totalItems === 0){
      totalItems = Number(ticket.totalItems) || 0;
      readyItems = Number(ticket.readyItems) || 0;
    }
    const pendingItems = Math.max(0, totalItems - readyItems);
    const normalizeStatus = (value)=> value == null ? '' : String(value).toLowerCase();
    const ticketStatus = normalizeStatus(ticket.status);
    const orderId = ticket.orderId || ticket.order_id || ticket.orderID || ticket.id;
    const orderKey = normalizeOrderKey(orderId);
    const handoffMap = db?.data?.handoff || {};
    const persistedRecord = orderKey
      ? cloneDeep(
          handoffMap[orderKey]
          || handoffMap[ticket.orderId]
          || handoffMap[ticket.order_id]
          || handoffMap[ticket.orderID]
          || handoffMap[ticket.id]
        )
      : null;
    const persistedStatus = normalizeStatus(persistedRecord?.status);
    const baseStatus = ticketStatus === 'served'
      ? 'served'
      : ((totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending');
    let status = baseStatus;

    // Check if persisted status is still valid by comparing timestamps
    if(persistedStatus === 'served' || persistedStatus === 'assembled'){
      const ticketTimeCandidates = [ticket.updatedAt, ticket.updated_at, ticket.completedAt, ticket.readyAt, ticket.acceptedAt, ticket.createdAt];
      const ticketTimestamp = ticketTimeCandidates.reduce((acc, value)=>{
        const ms = parseTime(value);
        return ms && ms > acc ? ms : acc;
      }, 0);
      const recordTimestamp = resolveHandoffTimestamp(persistedRecord);
      // Only use persisted status if it's newer than the ticket data
      if(recordTimestamp && ticketTimestamp && ticketTimestamp <= recordTimestamp){
        status = persistedStatus;
      }
    } else if(persistedStatus === 'ready'){
      status = (totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending';
    } else if(persistedStatus === 'pending'){
      status = 'pending';
    }

    const createdAt = ticket.createdAt || ticket.acceptedAt || ticket.updatedAt || null;
    const createdMs = parseTime(createdAt);
    const orderNumber = resolveOrderNumber(ticket.orderNumber || ticket.order_number, orderId);
    const serviceModeSource = ticket.serviceMode || ticket.service_mode || ticket.orderType || ticket.order_type || 'dine_in';
    const serviceMode = String(serviceModeSource || 'dine_in').toLowerCase();
    const handoffRecord = persistedRecord
      ? { ...persistedRecord, status }
      : {
          status,
          updatedAt: ticket.updatedAt || ticket.updated_at || createdAt || null,
          assembledAt: ticket.assembledAt || ticket.assembled_at || null,
          servedAt: ticket.servedAt || ticket.served_at || null
        };

    return {
      orderId,
      orderNumber: orderNumber || orderId,
      serviceMode,
      tableLabel: ticket.tableLabel || ticket.table || ticket.tableName || ticket.table_name || null,
      customerName: ticket.customerName || ticket.customer || ticket.guestName || null,
      createdAt,
      createdMs,
      jobs,
      readyItems,
      totalItems,
      pendingItems,
      detailRows,
      handoffStatus: status,
      handoffRecord
    };
  };

  const getExpoOrders = (db)=>{
    const snapshot = computeOrdersSnapshot(db)
      .filter(order=>{
        if(!order) return false;
        const status = order.handoffStatus;
        return status !== 'assembled';
      });
    const orderMap = new Map();
    snapshot.forEach(order=>{
      const key = normalizeOrderKey(order.orderId || order.id);
      if(key) orderMap.set(key, order);
    });

    const expoTickets = Array.isArray(db?.data?.expoTickets) ? db.data.expoTickets : [];
    expoTickets.forEach(ticket=>{
      const key = normalizeOrderKey(ticket?.orderId || ticket?.order_id || ticket?.orderID || ticket?.id);
      if(!key || orderMap.has(key)) return;
      const fallbackOrder = buildExpoFallbackOrder(ticket, db);
      if(fallbackOrder) orderMap.set(key, fallbackOrder);
    });

    return Array.from(orderMap.values()).sort((a, b)=>{
      const aCreated = a.createdMs ?? parseTime(a.createdAt) ?? 0;
      const bCreated = b.createdMs ?? parseTime(b.createdAt) ?? 0;
      return aCreated - bCreated;
    });
  };

  const getHandoffOrders = (db)=> computeOrdersSnapshot(db)
    .filter(order=>{
      if(!order) return false;
      const status = order.handoffStatus;
      if(status !== 'assembled') return false;
      const serviceMode = (order.serviceMode || 'dine_in').toLowerCase();
      return serviceMode !== 'delivery';
    });

  const cloneJob = (job)=>({
    ...job,
    details: Array.isArray(job.details) ? job.details.map(detail=>({
      ...detail,
      modifiers: Array.isArray(detail.modifiers) ? detail.modifiers.map(mod=>({ ...mod })) : []
    })) : [],
    history: Array.isArray(job.history) ? job.history.map(entry=>({ ...entry })) : []
  });

  const buildJobRecords = (jobOrders)=>{
    if(!jobOrders) return [];
    const headers = Array.isArray(jobOrders.headers) ? jobOrders.headers : [];
    const details = Array.isArray(jobOrders.details) ? jobOrders.details : [];
    const modifiers = Array.isArray(jobOrders.modifiers) ? jobOrders.modifiers : [];
    const history = Array.isArray(jobOrders.statusHistory) ? jobOrders.statusHistory : [];

    const modifiersByDetail = modifiers.reduce((acc, mod)=>{
      const bucket = acc[mod.detailId] || (acc[mod.detailId] = []);
      bucket.push({ ...mod });
      return acc;
    }, {});

    const detailsByJob = details.reduce((acc, detail)=>{
      const enriched = {
        ...detail,
        modifiers: modifiersByDetail[detail.id] ? modifiersByDetail[detail.id].map(item=>({ ...item })) : []
      };
      const bucket = acc[detail.jobOrderId] || (acc[detail.jobOrderId] = []);
      bucket.push(enriched);
      return acc;
    }, {});

    const historyByJob = history.reduce((acc, record)=>{
      const bucket = acc[record.jobOrderId] || (acc[record.jobOrderId] = []);
      bucket.push({ ...record });
      return acc;
    }, {});

    return headers.map(header=>{
      const cloned = { ...header };
      cloned.details = (detailsByJob[header.id] || []).sort((a, b)=>{
        const aMs = parseTime(a.startAt) || parseTime(a.createdAt) || 0;
        const bMs = parseTime(b.startAt) || parseTime(b.createdAt) || 0;
        return aMs - bMs;
      });
      cloned.history = (historyByJob[header.id] || []).sort((a, b)=>{
        const aMs = parseTime(a.changedAt) || 0;
        const bMs = parseTime(b.changedAt) || 0;
        return aMs - bMs;
      });
      cloned.createdMs = parseTime(cloned.createdAt);
      cloned.acceptedMs = parseTime(cloned.acceptedAt);
      cloned.startMs = parseTime(cloned.startedAt);
      cloned.readyMs = parseTime(cloned.readyAt);
      cloned.completedMs = parseTime(cloned.completedAt);
      cloned.updatedMs = parseTime(cloned.updatedAt);
      cloned.dueMs = parseTime(cloned.dueAt);
      return cloned;
    });
  };

  const indexJobs = (jobsList)=>{
    const list = Array.isArray(jobsList) ? jobsList.slice() : [];
    list.sort((a, b)=>{
      const aKey = a.acceptedMs ?? a.createdMs ?? 0;
      const bKey = b.acceptedMs ?? b.createdMs ?? 0;
      if(aKey === bKey){
        const aPriority = STATUS_PRIORITY[a.status] ?? 0;
        const bPriority = STATUS_PRIORITY[b.status] ?? 0;
        return bPriority - aPriority;
      }
      return aKey - bKey;
    });

    const byStation = {};
    const byService = {};
    const orderMap = new Map();
    const stats = { total:list.length, expedite:0, alerts:0, ready:0, pending:0 };

    list.forEach(job=>{
      const stationId = job.stationId || 'general';
      (byStation[stationId] || (byStation[stationId] = [])).push(job);
      const service = job.serviceMode || job.orderTypeId || 'dine_in';
      (byService[service] || (byService[service] = [])).push(job);
      const orderKey = job.orderId || job.orderNumber || job.id;
      if(!orderMap.has(orderKey)){
        orderMap.set(orderKey, {
          orderId: job.orderId || orderKey,
          orderNumber: job.orderNumber || orderKey,
          serviceMode: service,
          tableLabel: job.tableLabel || null,
          customerName: job.customerName || null,
          createdAt: job.createdAt || job.acceptedAt || job.startedAt,
          createdMs: job.createdMs || job.acceptedMs || job.startMs,
          jobs: []
        });
      }
      orderMap.get(orderKey).jobs.push(job);
      if(job.isExpedite) stats.expedite += 1;
      if(job.hasAlerts) stats.alerts += 1;
      if(job.status === 'ready' || job.status === 'completed') stats.ready += 1; else stats.pending += 1;
    });

    const orders = Array.from(orderMap.values()).map(order=>{
      order.jobs.sort((a, b)=>{
        if(a.stationId === b.stationId) return (a.startMs || a.acceptedMs || 0) - (b.startMs || b.acceptedMs || 0);
        return (a.stationId || '').localeCompare(b.stationId || '');
      });
      return order;
    });
    orders.sort((a, b)=> (a.createdMs || 0) - (b.createdMs || 0));

    return { list, byStation, byService, orders, stats };
  };

  const buildExpoTickets = (expoSource, jobsIndex)=>{
    const source = Array.isArray(expoSource) ? expoSource : [];
    const jobMap = new Map((jobsIndex.list || []).map(job=> [job.id, job]));
    return source.map(ticket=>{
      const jobOrderIds = Array.isArray(ticket.jobOrderIds) ? ticket.jobOrderIds : [];
      const jobs = jobOrderIds.map(id=> jobMap.get(id)).filter(Boolean);
      const readyItems = jobs.length ? sum(jobs, job=> job.completedItems || 0) : (ticket.readyItems || 0);
      const totalItems = jobs.length ? sum(jobs, job=> job.totalItems || (job.details ? job.details.length : 0)) : (ticket.totalItems || 0);
      const status = ticket.status || (totalItems > 0 && readyItems >= totalItems ? 'ready' : 'awaiting');
      return { ...ticket, jobs, readyItems, totalItems, status };
    });
  };

  const buildStations = (database, kdsSource, masterSource={})=>{
    console.log('[KDS][buildStations] Called with:', {
      hasKdsStations: !!(kdsSource?.stations?.length),
      hasMasterStations: !!(masterSource?.stations?.length),
      hasDatabaseKitchenSections: !!(database?.kitchen_sections?.length),
      databaseKitchenSectionsCount: database?.kitchen_sections?.length || 0,
      hasMasterKitchenSections: !!(masterSource?.kitchenSections?.length)
    });
    const explicitStations = Array.isArray(kdsSource?.stations) && kdsSource.stations.length
      ? kdsSource.stations.map(station=> ({ ...station }))
      : [];
    if(explicitStations.length) {
      console.log('[KDS][buildStations] Using explicit stations:', explicitStations.length);
      return explicitStations;
    }

    const masterStations = Array.isArray(masterSource?.stations) && masterSource.stations.length
      ? masterSource.stations.map(station=> ({ ...station }))
      : [];
    if(masterStations.length) {
      console.log('[KDS][buildStations] Using master stations:', masterStations.length);
      return masterStations;
    }

    const sectionSource = (Array.isArray(database?.kitchen_sections) && database.kitchen_sections.length)
      ? database.kitchen_sections
      : (Array.isArray(masterSource?.kitchenSections) ? masterSource.kitchenSections : []);

    console.log('[KDS][buildStations] Using kitchen_sections:', {
      source: database?.kitchen_sections ? 'database.kitchen_sections' : 'masterSource.kitchenSections',
      length: sectionSource.length,
      firstSection: sectionSource[0]
    });

    return sectionSource.map((section, idx)=>{
      const id = section.id || section.section_id || section.sectionId;
      const nameAr = section.section_name?.ar || section.name?.ar || section.nameAr || id;
      const nameEn = section.section_name?.en || section.name?.en || section.nameEn || id;
      const station = {
        id,
        code: id && id.toString ? id.toString().toUpperCase() : id,
        nameAr,
        nameEn,
        stationType: id === 'expo' ? 'expo' : 'prep',
        isExpo: id === 'expo',
        sequence: idx + 1,
        themeColor: null,
        displayConfig: { layout:'grid', columns:2 },
        autoRouteRules: [],
        createdAt: null,
        updatedAt: null
      };
      if(idx === 0){
        console.log('[KDS][buildStations] First built station:', station);
      }
      return station;
    });
    console.log('[KDS][buildStations] Result count:', result.length);
    return result;
  };

  const toStationMap = (list)=> (Array.isArray(list)
    ? list.reduce((acc, station)=>{
        if(station && station.id != null){
          acc[station.id] = station;
        }
        return acc;
      }, {})
    : {});

  const buildMenuIndex = (items)=>{
    const index = {};
    if(!Array.isArray(items)) return index;
    items.forEach(item=>{
      if(!item || item.id == null) return;
      const id = String(item.id);
      const code = item.code || item.itemCode || item.menuItemCode;
      index[id] = {
        id,
        code,
        name: item.name || item.itemName || item.nameAr || item.nameEn || id,
        nameAr: item.nameAr || item.itemNameAr || item.name?.ar || item.name || '',
        nameEn: item.nameEn || item.itemNameEn || item.name?.en || item.name || '',
        description: item.description || item.itemDescription || '',
        price: Number(item.price) || 0
      };
      if(code){
        index[String(code)] = index[id];
      }
    });
    return index;
  };

  const buildTabs = (db, t)=>{
    const tabs = [];
    const toLabelKey = (value)=> (value == null ? '' : String(value).toLowerCase().replace(/\s+/g, ''));
    const labelKeys = new Set();
    const registerLabel = (value)=>{
      const key = toLabelKey(value);
      if(key) labelKeys.add(key);
    };
    const { filters, jobs } = db.data;
    const locked = filters.lockedSection;
    const servedOrderIds = new Set(
      computeOrdersSnapshot(db)
        .filter(order=> order.handoffStatus === 'served')
        .map(order=> order.orderId || order.id)
    );
    if(!locked){
      const prepCount = computeOrdersSnapshot(db).filter(order=> order.handoffStatus !== 'served').length;
      tabs.push({ id:'prep', label:t.tabs.prep, count: prepCount });
      registerLabel(t.tabs.prep);
    }
    let expoIntegrated = false;
    const stationOrder = (db.data.stations || []).slice().sort((a, b)=> (a.sequence || 0) - (b.sequence || 0));
    stationOrder.forEach(station=>{
      if(locked && station.id !== filters.activeTab) return;
      const label = db.env.lang === 'ar'
        ? (station.nameAr || station.nameEn || station.id)
        : (station.nameEn || station.nameAr || station.id);
      const isExpoStation = station.isExpo === true || (String(station.stationType || '').toLowerCase() === 'expo');
      const tabId = isExpoStation ? 'expo' : station.id;
      const activeJobs = (jobs.byStation[station.id] || [])
        .filter(job=> job.status !== 'ready' && job.status !== 'completed')
        .filter(job=> !servedOrderIds.has(job.orderId));
      const tabCount = isExpoStation ? getExpoOrders(db).length : activeJobs.length;
      if(!tabs.some(tab=> tab.id === tabId)){
        tabs.push({
          id: tabId,
          label,
          count: tabCount,
          color: station.themeColor || null
        });
      } else {
        const existingIndex = tabs.findIndex(tab=> tab.id === tabId);
        if(existingIndex >= 0){
          tabs[existingIndex] = {
            ...tabs[existingIndex],
            label,
            count: tabCount,
            color: tabs[existingIndex].color || station.themeColor || null
          };
        }
      }
      if(isExpoStation) expoIntegrated = true;
      registerLabel(label);
      registerLabel(tabId);
      registerLabel(station.code);
    });
    if(!locked){
      const existingIds = new Set(tabs.map(tab=> tab.id));
      const stageTabs = [
        { id:'expo', label:t.tabs.expo, count: getExpoOrders(db).length },
        { id:'handoff', label:t.tabs.handoff, count: getHandoffOrders(db).length },
        { id:'delivery', label:t.tabs.delivery, count: getDeliveryOrders(db).length },
        { id:'delivery-pending', label:t.tabs.pendingDelivery, count: getPendingDeliveryOrders(db).length }
      ];
      stageTabs.forEach(tab=>{
        if(existingIds.has(tab.id)){
          if(tab.id === 'expo' && !expoIntegrated){
            // Allow expo stage tab if we only have a station entry but it wasn't mapped earlier
            existingIds.delete(tab.id);
          } else {
            return;
          }
        }
        const labelKey = toLabelKey(tab.label);
        if(labelKey && labelKeys.has(labelKey)) return;
        if(tab.id === 'expo' && expoIntegrated) return;
        existingIds.add(tab.id);
        tabs.push(tab);
        if(labelKey) labelKeys.add(labelKey);
      });
    }
    const ensureHandoffTab = ()=>{
      const handoffCount = getHandoffOrders(db).length;
      const existingIndex = tabs.findIndex(tab=> tab.id === 'handoff');
      if(existingIndex >= 0){
        const existing = tabs[existingIndex];
        tabs[existingIndex] = {
          ...existing,
          label: existing.label || t.tabs.handoff,
          count: handoffCount
        };
      } else {
        const labelKey = toLabelKey(t.tabs.handoff);
        if(labelKey) labelKeys.add(labelKey);
        tabs.push({ id:'handoff', label:t.tabs.handoff, count: handoffCount });
      }
    };
    ensureHandoffTab();
    return tabs;
  };

  const getDeliveryOrders = (db)=>{
    const deliveriesState = db.data.deliveries || {};
    const assignments = deliveriesState.assignments || {};
    const settlements = deliveriesState.settlements || {};
    return computeOrdersSnapshot(db)
      .filter(order=>{
        if(!order) return false;
        if(order.handoffStatus !== 'assembled') return false;
        return (order.serviceMode || 'dine_in').toLowerCase() === 'delivery';
      })
      .map(order=> ({
        ...order,
        assignment: assignments[order.orderId] || null,
        settlement: settlements[order.orderId] || null
      }));
  };

  const getPendingDeliveryOrders = (db)=>{
    const deliveriesState = db.data.deliveries || {};
    const assignments = deliveriesState.assignments || {};
    const settlements = deliveriesState.settlements || {};
    return computeOrdersSnapshot(db)
      .filter(order=> (order.serviceMode || 'dine_in') === 'delivery' && order.handoffStatus === 'served')
      .map(order=> ({
        ...order,
        assignment: assignments[order.orderId] || null,
        settlement: settlements[order.orderId] || null
      }))
      .filter(order=>{
        const settlement = order.settlement;
        if(!settlement) return true;
        return settlement.status !== 'settled';
      });
  };

  const createBadge = (text, className)=> D.Text.Span({ attrs:{ class: cx(tw`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold`, className) } }, [text]);

  const renderEmpty = (message)=> D.Containers.Div({ attrs:{ class: tw`flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-slate-800/60 bg-slate-900/60 text-center text-slate-300` }}, [
    D.Text.Span({ attrs:{ class: tw`text-3xl` }}, ['🍽️']),
    D.Text.P({ attrs:{ class: tw`max-w-md text-sm leading-relaxed text-slate-400` }}, [message])
  ]);

  const renderHeader = (db, t)=>{
    const stats = db.data.jobs.stats || { total:0, expedite:0, alerts:0, ready:0, pending:0 };
    const lang = db.env.lang || 'ar';
    const theme = db.env.theme || 'dark';
    const now = db.data.now || Date.now();
    const statusState = db.data.sync?.state || 'online';
    const statusLabel = t.status[statusState] || t.status.online;
    const themeButtonClass = (mode)=> cx(
      tw`rounded-full px-2 py-1 text-xs font-semibold transition`,
      theme === mode
        ? tw`border border-sky-400/60 bg-sky-500/20 text-sky-100`
        : tw`border border-transparent text-slate-300 hover:text-slate-100`
    );
    const langButtonClass = (value)=> cx(
      tw`rounded-full px-2 py-1 text-xs font-semibold transition`,
      lang === value
        ? tw`border border-emerald-400/60 bg-emerald-500/20 text-emerald-100`
        : tw`border border-transparent text-slate-300 hover:text-slate-100`
    );
    return D.Containers.Header({ attrs:{ class: tw`px-6 pt-6 pb-4` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-5 rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/40 backdrop-blur` }}, [
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between` }}, [
          D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1` }}, [
            D.Text.H1({ attrs:{ class: tw`text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl` }}, [t.title]),
            D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [t.subtitle])
          ]),
          D.Containers.Div({ attrs:{ class: tw`flex flex-wrap items-center gap-3` }}, [
            createBadge(statusLabel, tw`border-sky-400/40 bg-sky-500/10 text-sky-100`),
            createBadge(formatClock(now, lang), tw`border-slate-500/40 bg-slate-800/60 text-slate-100`),
            createBadge(`${t.stats.total}: ${stats.total}`, tw`border-slate-600/40 bg-slate-800/70 text-slate-100`),
            D.Containers.Div({ attrs:{ class: tw`flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1` }}, [
              D.Text.Span({ attrs:{ class: tw`text-xs text-slate-400` }}, [t.controls.theme]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:theme:set', 'data-theme':'light', class: themeButtonClass('light') }}, [t.controls.light]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:theme:set', 'data-theme':'dark', class: themeButtonClass('dark') }}, [t.controls.dark])
            ]),
            D.Containers.Div({ attrs:{ class: tw`flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1` }}, [
              D.Text.Span({ attrs:{ class: tw`text-xs text-slate-400` }}, [t.controls.language]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:lang:set', 'data-lang':'ar', class: langButtonClass('ar') }}, [t.controls.arabic]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:lang:set', 'data-lang':'en', class: langButtonClass('en') }}, [t.controls.english])
            ])
          ])
        ]),
        D.Containers.Div({ attrs:{ class: tw`grid gap-3 sm:grid-cols-2 xl:grid-cols-4` }}, [
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.expedite]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-sky-200` }}, [String(stats.expedite || 0)])
          ]),
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.alerts]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-amber-200` }}, [String(stats.alerts || 0)])
          ]),
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.ready]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-emerald-200` }}, [String(stats.ready || 0)])
          ]),
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.pending]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-slate-200` }}, [String(stats.pending || 0)])
          ])
        ])
      ])
    ]);
  };

  const renderTabs = (db, t)=>{
    const tabs = buildTabs(db, t);
    const active = db.data.filters.activeTab;
    if(!tabs.length) return null;
    return D.Containers.Nav({ attrs:{ class: tw`mb-3 flex flex-wrap gap-2` }}, [
      ...tabs.map(tab=> D.Forms.Button({
        attrs:{
          type:'button',
          gkey:'kds:tab:switch',
          'data-section-id': tab.id,
          class: cx(
            tw`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition`,
            tab.id === active
              ? tw`border-sky-400/60 bg-sky-500/20 text-sky-50 shadow-lg shadow-sky-900/40`
              : tw`border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100`
          )
        }
      }, [
        D.Text.Span(null, [tab.label]),
        typeof tab.count === 'number' ? D.Text.Span({ attrs:{ class: tw`inline-flex min-w-[1.75rem] justify-center rounded-full bg-slate-800/70 px-1.5 py-0.5 text-xs font-bold text-slate-200` }}, [String(tab.count)]) : null
      ].filter(Boolean)))
    ]);
  };

  const renderJobBadges = (job, t, lang)=>{
    const badges = [];
    const service = job.serviceMode || job.orderTypeId || 'dine_in';
    const serviceLabel = t.labels.serviceMode[service] || service;
    badges.push(createBadge(`${SERVICE_ICONS[service] || '🧾'} ${serviceLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    if(job.tableLabel) badges.push(createBadge(`${t.labels.table} ${job.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    if(job.customerName && !job.tableLabel) badges.push(createBadge(`${t.labels.customer}: ${job.customerName}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    if(job.isExpedite) badges.push(createBadge('⚡ expedite', tw`border-amber-300/50 bg-amber-500/20 text-amber-50`));
    if(job.hasAlerts) badges.push(createBadge('🚨 alert', tw`border-rose-400/60 bg-rose-500/20 text-rose-100`));
    if(job.dueAt) badges.push(createBadge(`${t.labels.due}: ${formatClock(job.dueAt, lang)}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    return badges;
  };

  const renderDetailRow = (detail, t, lang, stationLabel)=>{
    const statusLabel = t.labels.jobStatus[detail.status] || detail.status;
    const stationText = lang === 'ar' ? t.labels.station.ar : t.labels.station.en;
    return D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.Strong({ attrs:{ class: tw`text-base font-semibold leading-tight text-slate-100 sm:text-lg` }}, [`${detail.quantity}× ${lang === 'ar' ? (detail.itemNameAr || detail.itemNameEn || detail.itemId) : (detail.itemNameEn || detail.itemNameAr || detail.itemId)}`]),
        createBadge(statusLabel, STATUS_CLASS[detail.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      stationLabel ? createBadge(`${stationText}: ${stationLabel}`, tw`border-slate-600/40 bg-slate-800/70 text-slate-100`) : null,
      detail.prepNotes ? D.Text.P({ attrs:{ class: tw`text-xs text-slate-300` }}, [`📝 ${detail.prepNotes}`]) : null,
      detail.modifiers && detail.modifiers.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, detail.modifiers.map(mod=>{
        const typeText = mod.modifierType === 'remove'
          ? (lang === 'ar' ? 'بدون' : 'No')
          : mod.modifierType === 'add'
            ? (lang === 'ar' ? 'إضافة' : 'Add')
            : mod.modifierType;
        return D.Text.Span({ attrs:{ class: tw`inline-flex items-center rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-100` }}, [`${typeText}: ${lang === 'ar' ? (mod.nameAr || mod.nameEn) : (mod.nameEn || mod.nameAr)}`]);
      })) : null
    ].filter(Boolean));
  };

  const renderHistory = (job, t, lang)=>{
    if(!job.history || !job.history.length) return null;
    const lastEntries = job.history.slice(-2);
    const heading = lang === 'ar' ? '⏱️ آخر الحالات' : '⏱️ Recent updates';
    return D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
      D.Text.Span({ attrs:{ class: tw`text-xs font-semibold uppercase tracking-wide text-slate-400` }}, [heading]),
      ...lastEntries.map(entry=> D.Text.Span({ attrs:{ class: tw`text-xs text-slate-300` }}, [`${formatClock(entry.changedAt, lang)} · ${t.labels.jobStatus[entry.status] || entry.status}${entry.actorName ? ` — ${entry.actorName}` : ''}`]))
    ]);
  };

  const startJob = (job, nowIso, nowMs)=>{
    if(job.status === 'ready' || job.status === 'completed') return {
      ...job,
      startedAt: job.startedAt || nowIso,
      startMs: job.startMs || nowMs,
      updatedAt: nowIso,
      updatedMs: nowMs
    };
    const details = job.details.map(detail=>{
      if(detail.status === 'ready' || detail.status === 'completed') return detail;
      return {
        ...detail,
        status: 'in_progress',
        startAt: detail.startAt || nowIso,
        updatedAt: nowIso
      };
    });
    const remaining = details.filter(detail=> detail.status !== 'ready' && detail.status !== 'completed').length;
    const completed = details.length - remaining;
    return {
      ...job,
      status: 'in_progress',
      progressState: 'cooking',
      acceptedAt: job.acceptedAt || nowIso,
      acceptedMs: job.acceptedMs || nowMs,
      startedAt: job.startedAt || nowIso,
      startMs: job.startMs || nowMs,
      updatedAt: nowIso,
      updatedMs: nowMs,
      remainingItems: remaining,
      completedItems: completed,
      details,
      history: job.history.concat([{ id:`HIS-${job.id}-${nowMs}`, jobOrderId: job.id, status:'in_progress', actorId:'kds-station', actorName:'KDS Station', actorRole:'station', changedAt: nowIso, meta:{ source:'kds' } }])
    };
  };

  const finishJob = (job, nowIso, nowMs)=>{
    const details = job.details.map(detail=> ({
      ...detail,
      status: 'ready',
      finishAt: detail.finishAt || nowIso,
      updatedAt: nowIso
    }));
    return {
      ...job,
      status: 'ready',
      progressState: 'completed',
      readyAt: job.readyAt || nowIso,
      readyMs: job.readyMs || nowMs,
      completedAt: job.completedAt || nowIso,
      completedMs: job.completedMs || nowMs,
      updatedAt: nowIso,
      updatedMs: nowMs,
      remainingItems: 0,
      completedItems: job.totalItems || details.length,
      details,
      history: job.history.concat([{ id:`HIS-${job.id}-ready-${nowMs}`, jobOrderId: job.id, status:'ready', actorId:'kds-station', actorName:'KDS Station', actorRole:'station', changedAt: nowIso, meta:{ source:'kds' } }])
    };
  };

  const applyJobsUpdate = (state, transform)=>{
    const list = state.data.jobs.list.map(cloneJob);
    const nextList = transform(list) || list;
    const jobs = indexJobs(nextList);
    const expoTickets = buildExpoTickets(state.data.expoSource, jobs);
    return {
      ...state,
      data:{
        ...state.data,
        jobs,
        expoTickets
      }
    };
  };

  const renderJobCard = (job, station, t, lang, now)=>{
    const statusLabel = t.labels.jobStatus[job.status] || job.status;
    const elapsed = job.startMs ? now - job.startMs : 0;
    const duration = job.startMs ? formatDuration(elapsed) : '00:00';
    const stationColor = station?.themeColor || '#38bdf8';
    const headerBadges = renderJobBadges(job, t, lang);
    return D.Containers.Article({ attrs:{ class: tw`relative flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`absolute inset-y-0 end-0 w-1 rounded-e-3xl`, style:`background: ${stationColor}; opacity:0.35;` }}, []),
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${job.orderNumber || job.orderId}`]),
        createBadge(statusLabel, STATUS_CLASS[job.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
      D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
        D.Text.Span(null, [`${t.labels.timer}: ${duration}`]),
        D.Text.Span(null, [`${t.labels.due}: ${formatClock(job.dueAt || job.readyAt || job.completedAt || job.startedAt, lang)}`]),
        D.Text.Span(null, [`${t.stats.pending}: ${job.remainingItems ?? Math.max(0, (job.totalItems || job.details.length) - (job.completedItems || 0))}`]),
        D.Text.Span(null, [`${t.stats.ready}: ${job.completedItems || 0}`])
      ]),
      job.notes ? D.Text.P({ attrs:{ class: tw`text-sm text-amber-200` }}, [`🧾 ${job.notes}`]) : null,
      job.details && job.details.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, job.details.map(detail=> renderDetailRow(detail, t, lang))) : null,
      renderHistory(job, t, lang),
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2 pt-2` }}, [
        job.status !== 'ready' && job.status !== 'completed'
        ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:job:start', 'data-job-id':job.id, class: tw`flex-1 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-900/50 transition hover:bg-sky-400` }}, [t.actions.start])
          : null,
        job.status !== 'ready'
        ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:job:finish', 'data-job-id':job.id, class: tw`flex-1 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20` }}, [t.actions.finish])
          : createBadge(t.labels.jobStatus.ready, STATUS_CLASS.ready)
      ].filter(Boolean))
    ].filter(Boolean));
  };

  const renderPrepPanel = (db, t, lang, now)=>{
    const orders = computeOrdersSnapshot(db).filter(order=> order.handoffStatus !== 'served');
    if(!orders.length) return renderEmpty(t.empty.prep);
    const stationMap = db.data.stationMap || {};
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=> D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber}`]),
        createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${t.labels.serviceMode[order.serviceMode] || order.serviceMode}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`)
      ]),
      order.tableLabel ? createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`) : null,
      order.customerName ? D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [`${t.labels.customer}: ${order.customerName}`]) : null,
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.jobs.map(job=> D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-center justify-between gap-3` }}, [
          D.Text.Span({ attrs:{ class: tw`text-sm font-semibold text-slate-100` }}, [stationMap[job.stationId] ? (lang === 'ar' ? (stationMap[job.stationId].nameAr || stationMap[job.stationId].nameEn) : (stationMap[job.stationId].nameEn || stationMap[job.stationId].nameAr)) : job.stationCode || job.stationId]),
          createBadge(t.labels.jobStatus[job.status] || job.status, STATUS_CLASS[job.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        D.Text.Span({ attrs:{ class: tw`text-xs text-slate-400` }}, [`${t.labels.timer}: ${job.startMs ? formatDuration(now - job.startMs) : '00:00'}`])
      ])))
    ].filter(Boolean))));
  };

  const renderStationPanel = (db, stationId, t, lang, now)=>{
    const servedOrderIds = new Set(
      computeOrdersSnapshot(db)
        .filter(order=> order.handoffStatus === 'served')
        .map(order=> order.orderId || order.id)
    );
    const jobs = (db.data.jobs.byStation[stationId] || [])
      .filter(job=> job.status !== 'ready' && job.status !== 'completed')
      .filter(job=> !servedOrderIds.has(job.orderId));
    const station = db.data.stationMap?.[stationId];
    if(!jobs.length) return renderEmpty(t.empty.station);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, jobs.map(job=> renderJobCard(job, station, t, lang, now)));
  };

  const renderExpoPanel = (db, t, lang, now)=>{
    const orders = getExpoOrders(db);
    if(!orders.length) return renderEmpty(t.empty.expo);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=>{
      const serviceLabel = t.labels.serviceMode[order.serviceMode] || order.serviceMode;
      const statusLabel = t.labels.handoffStatus[order.handoffStatus] || order.handoffStatus;
      const highlight = order.handoffStatus === 'ready';
      const headerBadges = [];
      headerBadges.push(createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${serviceLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      if(order.tableLabel) headerBadges.push(createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      if(order.customerName && !order.tableLabel) headerBadges.push(createBadge(`${t.labels.customer}: ${order.customerName}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      const startedMs = (order.jobs || []).reduce((min, job)=>{
        const candidate = job.startMs || job.acceptedMs || job.createdMs;
        if(candidate && (min === null || candidate < min)) return candidate;
        return min;
      }, null);
      const elapsed = startedMs ? now - startedMs : 0;
      const cardClass = cx(
        tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40`,
        highlight ? tw`border-emerald-300/70 bg-emerald-500/10 text-emerald-50 animate-pulse` : null
      );
      const actionSection = highlight
        ? D.Forms.Button({
            attrs:{
              type:'button',
              gkey:'kds:handoff:assembled',
              'data-order-id': order.orderId,
              class: tw`w-full rounded-full border border-emerald-300/70 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-50 shadow-lg shadow-emerald-900/30 hover:bg-emerald-500/30`
            }
          }, [t.actions.handoffComplete])
        : createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`);
      return D.Containers.Article({ attrs:{ class: cardClass }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber || order.orderId}`]),
          createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
        D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
          D.Text.Span(null, [`${t.stats.ready}: ${order.readyItems || 0} / ${order.totalItems || 0}`]),
          D.Text.Span(null, [`${t.labels.timer}: ${formatDuration(elapsed)}`])
        ]),
        order.detailRows && order.detailRows.length
          ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
              const stationLabel = lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn;
              return renderDetailRow(entry.detail, t, lang, stationLabel);
            }))
          : null,
        actionSection
      ].filter(Boolean));
    }));
  };

  const renderDeliveryCard = (order, t, lang, options={})=>{
    const assignment = order.assignment || null;
    const settlement = order.settlement || null;
    const statusKey = settlement?.status === 'settled' ? 'settled' : (assignment?.status || 'pending');
    const statusLabel = t.labels.deliveryStatus[statusKey] || statusKey;
    const driverName = assignment?.driverName || t.labels.notAssigned;
    const driverPhone = assignment?.driverPhone || '—';
    return D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber}`]),
        createBadge(statusLabel, DELIVERY_STATUS_CLASS[statusKey] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      order.handoffStatus ? createBadge(t.labels.handoffStatus[order.handoffStatus] || order.handoffStatus, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`) : null,
      order.tableLabel ? D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [`${t.labels.table}: ${order.tableLabel}`]) : null,
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-sm text-slate-300` }}, [
        D.Text.Span(null, [`${t.labels.driver}: ${driverName}`]),
        D.Text.Span(null, [`${t.labels.driverPhone}: ${driverPhone}`]),
        assignment?.vehicleId ? D.Text.Span(null, [`🚗 ${assignment.vehicleId}`]) : null
      ].filter(Boolean)),
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, order.jobs.map(job=> createBadge(`${job.stationCode || job.stationId}: ${t.labels.jobStatus[job.status] || job.status}`, STATUS_CLASS[job.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`))),
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2 pt-2` }}, [
        D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:assign', 'data-order-id':order.orderId, class: tw`flex-1 rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20` }}, [t.actions.assignDriver]),
        statusKey !== 'delivered' && statusKey !== 'settled'
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:complete', 'data-order-id':order.orderId, class: tw`flex-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20` }}, [t.actions.delivered])
          : null,
        statusKey === 'delivered' || options.focusSettlement
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:settle', 'data-order-id':order.orderId, class: tw`flex-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20` }}, [t.actions.settle])
          : null
      ].filter(Boolean))
    ].filter(Boolean));
  };

  const renderDeliveryPanel = (db, t, lang)=>{
    const orders = getDeliveryOrders(db);
    if(!orders.length) return renderEmpty(t.empty.delivery);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=> renderDeliveryCard(order, t, lang)));
  };

  const renderHandoffPanel = (db, t, lang)=>{
    const orders = getHandoffOrders(db);
    if(!orders.length) return renderEmpty(t.empty.handoff);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=>{
      const serviceLabel = t.labels.serviceMode[order.serviceMode] || order.serviceMode;
      const statusLabel = t.labels.handoffStatus[order.handoffStatus] || order.handoffStatus;
      const isAssembled = order.handoffStatus === 'assembled';
      const headerBadges = [
        createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${serviceLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`)
      ];
      if(order.tableLabel) headerBadges.push(createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      if(order.customerName && !order.tableLabel) headerBadges.push(createBadge(`${t.labels.customer}: ${order.customerName}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));

      const cardClass = cx(
        tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40`,
        isAssembled ? tw`border-emerald-300/70 bg-emerald-500/10` : null
      );

      const actionButton = isAssembled
        ? D.Forms.Button({
            attrs:{
              type:'button',
              gkey:'kds:handoff:served',
              'data-order-id': order.orderId,
              class: tw`w-full rounded-full border border-sky-400/70 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30`
            }
          }, [t.actions.handoffServe])
        : null;

      return D.Containers.Article({ attrs:{ class: cardClass }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber || order.orderId}`]),
          createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
        D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
          D.Text.Span(null, [`${t.stats.ready}: ${order.readyItems || 0} / ${order.totalItems || 0}`]),
          D.Text.Span(null, [`${t.labels.timer}: ${formatClock(order.handoffRecord?.assembledAt || order.createdAt, lang)}`])
        ]),
        order.detailRows && order.detailRows.length
          ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
              const stationLabel = lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn;
              return renderDetailRow(entry.detail, t, lang, stationLabel);
            }))
          : null,
        actionButton
      ].filter(Boolean));
    }));
  };

  const renderPendingDeliveryPanel = (db, t, lang)=>{
    const orders = getPendingDeliveryOrders(db);
    if(!orders.length) return renderEmpty(t.empty.pending);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2` }}, orders.map(order=> renderDeliveryCard(order, t, lang, { focusSettlement:true })));
  };

  const DriverModal = (db, t, lang)=>{
    const open = db.ui?.modals?.driver || false;
    if(!open) return null;
    const assignment = db.ui?.deliveryAssignment || {};
    const orderId = assignment.orderId;
    const drivers = Array.isArray(db.data.drivers) ? db.data.drivers : [];
    const order = (db.data.jobs.orders || []).find(o=> o.orderId === orderId);
    const subtitle = order ? `${t.labels.order} ${order.orderNumber}` : '';
    return UI.Modal({
      open,
      title: t.modal.driverTitle,
      description: subtitle || t.modal.driverDescription,
      content: D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-3` }}, [
        D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [t.modal.driverDescription]),
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, drivers.map(driver=> D.Forms.Button({ attrs:{
          type:'button',
          gkey:'kds:delivery:select-driver',
          'data-order-id': orderId,
          'data-driver-id': String(driver.id),
          class: tw`flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-start text-sm text-slate-100 hover:border-sky-400/60 hover:bg-sky-500/10`
        }}, [
          D.Containers.Div({ attrs:{ class: tw`flex flex-col` }}, [
            D.Text.Strong({ attrs:{ class: tw`text-sm` }}, [driver.name || driver.id]),
            driver.phone ? D.Text.Span({ attrs:{ class: tw`text-xs text-slate-300` }}, [driver.phone]) : null
          ].filter(Boolean)),
          D.Text.Span({ attrs:{ class: tw`text-base` }}, ['🚚'])
        ])))
      ]),
      actions:[
        {
          label: t.modal.close,
          gkey:'ui:modal:close',
          variant:'secondary'
        }
      ]
    });
  };

  const renderActivePanel = (db, t, lang, now)=>{
    const active = db.data.filters.activeTab;
    if(active === 'prep') return renderPrepPanel(db, t, lang, now);
    if(active === 'expo') return renderExpoPanel(db, t, lang, now);
    if(active === 'handoff') return renderHandoffPanel(db, t, lang);
    if(active === 'delivery') return renderDeliveryPanel(db, t, lang);
    if(active === 'delivery-pending') return renderPendingDeliveryPanel(db, t, lang);
    return renderStationPanel(db, active, t, lang, now);
  };

  const AppView = (db)=>{
    const lang = db.env.lang || 'ar';
    const t = getTexts(db);
    const now = db.data.now || Date.now();
    const theme = db.env.theme || 'dark';
    const shellClass = cx(
      'kds-shell',
      tw`flex min-h-screen w-full flex-col bg-slate-950/95 text-slate-100`,
      theme === 'light' ? tw`bg-slate-100 text-slate-900` : null
    );
    const mainClass = cx(
      'kds-scroll-region',
      tw`flex-1 min-h-0 w-full overflow-y-auto px-6 pb-6 [scrollbar-gutter:stable]`
    );
    return UI.AppRoot({
      shell: D.Containers.Div({ attrs:{ class: shellClass, 'data-theme': theme }}, [
        renderHeader(db, t),
        D.Containers.Main({ attrs:{ class: mainClass }}, [
          db.data.filters.lockedSection ? null : renderTabs(db, t),
          renderActivePanel(db, t, lang, now)
        ].filter(Boolean))
      ]),
      overlays:[ DriverModal(db, t, lang) ].filter(Boolean)
    });
  };

  Mishkah.app.setBody(AppView);

  const database = typeof window !== 'undefined' ? (window.database || {}) : {};
  const kdsSource = database.kds || {};
  const masterSource = typeof kdsSource.master === 'object' && kdsSource.master ? kdsSource.master : {};
  const settings = typeof database.settings === 'object' && database.settings ? database.settings : {};
  const syncSettings = typeof settings.sync === 'object' && settings.sync ? settings.sync : {};
  const branchSettings = typeof settings.branch === 'object' && settings.branch ? settings.branch : {};
  const branchChannelSource = syncSettings.channel
    || syncSettings.branch_channel
    || syncSettings.branchChannel
    || kdsSource?.sync?.channel
    || masterSource?.sync?.channel
    || masterSource?.channel
    || branchSettings.channel
    || branchSettings.branchChannel
    || database.branch?.channel
    || database.branchChannel
    || 'branch-main';
  const BRANCH_CHANNEL = normalizeChannelName(branchChannelSource, 'branch-main');
  if(typeof window !== 'undefined'){
    window.MishkahKdsChannel = BRANCH_CHANNEL;
  }
  const stations = buildStations(database, kdsSource, masterSource);
  console.log('[KDS][Initial] Built stations:', {
    count: stations.length,
    firstStation: stations[0],
    databaseKitchenSections: database?.kitchen_sections?.length || 0
  });
  const stationMap = toStationMap(stations);
  const initialStationRoutes = Array.isArray(kdsSource.stationCategoryRoutes)
    ? kdsSource.stationCategoryRoutes.map(route=> ({ ...route }))
    : (Array.isArray(masterSource?.stationCategoryRoutes)
      ? masterSource.stationCategoryRoutes.map(route=> ({ ...route }))
      : (Array.isArray(database?.station_category_routes)
        ? database.station_category_routes.map(route=> ({ ...route }))
        : []));
  const initialKitchenSections = Array.isArray(kdsSource.kitchenSections)
    ? kdsSource.kitchenSections.map(section=> ({ ...section }))
    : (Array.isArray(masterSource?.kitchenSections)
      ? masterSource.kitchenSections.map(section=> ({ ...section }))
      : (Array.isArray(database?.kitchen_sections)
        ? database.kitchen_sections.map(section=> ({ ...section }))
        : []));
  const initialCategorySections = Array.isArray(kdsSource.categorySections)
    ? kdsSource.categorySections.map(entry=> ({ ...entry }))
    : (Array.isArray(masterSource?.categorySections)
      ? masterSource.categorySections.map(entry=> ({ ...entry }))
      : (Array.isArray(database?.category_sections)
        ? database.category_sections.map(entry=> ({ ...entry }))
        : []));
  const initialMenuCategories = Array.isArray(kdsSource.menu?.categories)
    ? kdsSource.menu.categories.map(category=> ({ ...category }))
    : (Array.isArray(masterSource?.menu_categories)
      ? masterSource.menu_categories.map(category=> ({ ...category }))
      : (Array.isArray(masterSource?.menu?.categories)
        ? masterSource.menu.categories.map(category=> ({ ...category }))
        : (Array.isArray(database?.menu?.categories)
          ? database.menu.categories.map(category=> ({ ...category }))
          : [])));
  const initialMenuItems = Array.isArray(kdsSource.menu?.items)
    ? kdsSource.menu.items.map(item=> ({ ...item }))
    : (Array.isArray(masterSource?.menu_items)
      ? masterSource.menu_items.map(item=> ({ ...item }))
      : (Array.isArray(masterSource?.menu?.items)
        ? masterSource.menu.items.map(item=> ({ ...item }))
        : (Array.isArray(database?.menu?.items)
          ? database.menu.items.map(item=> ({ ...item }))
          : [])));
  const initialMenu = {
    categories: initialMenuCategories,
    items: initialMenuItems
  };
  const initialMenuIndex = buildMenuIndex(initialMenuItems);
  const rawJobOrders = cloneDeep(kdsSource.jobOrders || {});
  const jobRecords = buildJobRecords(rawJobOrders);
  const jobsIndexed = indexJobs(jobRecords);
  const expoSource = Array.isArray(rawJobOrders.expoPassTickets) ? rawJobOrders.expoPassTickets.map(ticket=>({ ...ticket })) : [];
  const expoTickets = buildExpoTickets(expoSource, jobsIndexed);

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sectionParam = urlParams.get('section_id');
  const lockedSection = !!sectionParam;
  const firstStationId = stations.length ? stations[0].id : 'prep';
  const defaultTab = lockedSection ? (stationMap[sectionParam] ? sectionParam : firstStationId) : 'prep';

  const initialState = {
    head:{ title: TEXT_DICT.title.ar },
    env:{ theme:'dark', lang:'ar', dir:'rtl' },
    i18n:{ dict: TEXT_FLAT, fallback:'ar' },
    data:{
      meta:{
        ...(typeof masterSource.metadata === 'object' && masterSource.metadata ? masterSource.metadata : {}),
        ...(typeof kdsSource.metadata === 'object' && kdsSource.metadata ? kdsSource.metadata : {})
      },
      sync:{
        ...(typeof masterSource.sync === 'object' && masterSource.sync ? masterSource.sync : {}),
        ...(typeof kdsSource.sync === 'object' && kdsSource.sync ? kdsSource.sync : {}),
        state:'online',
        lastMessage:null,
        channel: BRANCH_CHANNEL
      },
      stations,
      stationMap,
      jobs: jobsIndexed,
      expoSource,
      expoTickets,
      jobOrders: rawJobOrders,
      stationCategoryRoutes: initialStationRoutes,
      kitchenSections: initialKitchenSections,
      categorySections: initialCategorySections,
      menu: initialMenu,
      menuIndex: initialMenuIndex,
      filters:{ activeTab: defaultTab, lockedSection },
      deliveries:{ assignments:{}, settlements:{} },
      handoff: clonePersistedHandoff(),
      drivers: Array.isArray(database.drivers)
        ? database.drivers.map(driver=>({ ...driver }))
        : (Array.isArray(masterSource?.drivers) ? masterSource.drivers.map(driver=> ({ ...driver })) : []),
      now: Date.now()
    },
    ui:{
      modals:{ driver:false },
      modalOpen:false,
      deliveryAssignment:null
    }
  };

  initialState.data.expoSource = syncExpoSourceWithHandoff(initialState.data.expoSource, initialState.data.handoff);
  initialState.data.expoTickets = buildExpoTickets(initialState.data.expoSource, initialState.data.jobs);

  const app = M.app.createApp(initialState, {});
  const auto = U.twcss.auto(initialState, app, { pageScaffold:true });

  const LOCAL_SYNC_CHANNEL_NAME = 'mishkah-pos-kds-sync';
  const syncInstanceId = `kds-${Math.random().toString(36).slice(2)}`;
  const localSyncChannel = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel(LOCAL_SYNC_CHANNEL_NAME)
    : null;

  const syncClient = null;
  const emitSync = (message={})=>{
    if(!localSyncChannel || !message || typeof message !== 'object' || !message.type) return;
    const nowIso = new Date().toISOString();
    const state = typeof app.getState === 'function' ? app.getState() : initialState;
    const channel = normalizeChannelName(state?.data?.sync?.channel || BRANCH_CHANNEL, BRANCH_CHANNEL);
    const meta = {
      channel,
      publishedAt: nowIso,
      ...(message.meta && typeof message.meta === 'object' ? message.meta : {})
    };
    try{
      localSyncChannel.postMessage({ origin:'kds', source: syncInstanceId, ...message, meta });
    } catch(err){
      console.warn('[Mishkah][KDS] Failed to broadcast sync message.', err);
    }
  };

  const mergeJobOrders = (current={}, patch={})=>{
    const mergeList = (base=[], updates=[], key='id')=>{
      const map = new Map();
      base.forEach(item=>{
        if(!item || item[key] == null) return;
        map.set(String(item[key]), { ...item });
      });
      updates.forEach(item=>{
        if(!item || item[key] == null) return;
        const id = String(item[key]);
        map.set(id, Object.assign({}, map.get(id) || {}, item));
      });
      return Array.from(map.values());
    };
    return {
      headers: mergeList(Array.isArray(current.headers) ? current.headers : [], Array.isArray(patch.headers) ? patch.headers : []),
      details: mergeList(Array.isArray(current.details) ? current.details : [], Array.isArray(patch.details) ? patch.details : []),
      modifiers: mergeList(Array.isArray(current.modifiers) ? current.modifiers : [], Array.isArray(patch.modifiers) ? patch.modifiers : []),
      statusHistory: mergeList(Array.isArray(current.statusHistory) ? current.statusHistory : [], Array.isArray(patch.statusHistory) ? patch.statusHistory : [])
    };
  };

  const applyJobUpdateMessage = (appInstance, data={}, meta={})=>{
    const jobId = data.jobId || data.id;
    const patch = data.payload && typeof data.payload === 'object' ? data.payload : {};
    if(!jobId || !Object.keys(patch).length) return;
    const now = Date.now();
    appInstance.setState(state=>{
      const baseNext = applyJobsUpdate(state, list=> list.map(job=>{
        if(job.id !== jobId) return job;
        const updated = { ...job, ...patch };
        if(patch.startedAt){
          updated.startedAt = patch.startedAt;
          updated.startMs = parseTime(patch.startedAt) || updated.startMs;
        }
        if(patch.readyAt){
          updated.readyAt = patch.readyAt;
          updated.readyMs = parseTime(patch.readyAt) || updated.readyMs;
        }
        if(patch.completedAt){
          updated.completedAt = patch.completedAt;
          updated.completedMs = parseTime(patch.completedAt) || updated.completedMs;
        }
        if(patch.updatedAt){
          updated.updatedAt = patch.updatedAt;
          updated.updatedMs = parseTime(patch.updatedAt) || updated.updatedMs;
        }
        return updated;
      }));
      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          sync
        }
      };
    });
  };

  const applyDeliveryUpdateMessage = (appInstance, data={}, meta={})=>{
    const orderId = data.orderId || data.id;
    const patch = data.payload && typeof data.payload === 'object' ? data.payload : {};
    if(!orderId || !Object.keys(patch).length) return;
    const now = Date.now();
    appInstance.setState(state=>{
      const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
      const assignments = { ...(deliveries.assignments || {}) };
      const settlements = { ...(deliveries.settlements || {}) };
      if(patch.assignment){
        assignments[orderId] = { ...(assignments[orderId] || {}), ...patch.assignment };
      }
      if(patch.settlement){
        settlements[orderId] = { ...(settlements[orderId] || {}), ...patch.settlement };
      }
      const baseNext = {
        ...state,
        data:{
          ...state.data,
          deliveries:{ assignments, settlements }
        }
      };
      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          sync
        }
      };
    });
  };

  const applyHandoffUpdateMessage = (appInstance, data={}, meta={})=>{
    const orderId = data.orderId || data.id;
    const patch = data.payload && typeof data.payload === 'object' ? data.payload : {};
    if(!orderId || !Object.keys(patch).length) return;
    const now = Date.now();
    appInstance.setState(state=>{
      const handoff = state.data.handoff || {};
      const next = { ...handoff, [orderId]: { ...(handoff[orderId] || {}), ...patch } };
      const expoSourceNext = syncExpoSourceWithHandoff(state.data.expoSource, next);
      const expoTicketsNext = buildExpoTickets(expoSourceNext, state.data.jobs);
      const record = next[orderId];
      if(record && shouldPersistHandoff(record)){
        recordPersistedHandoff(orderId, cloneDeep(record));
      } else {
        recordPersistedHandoff(orderId, null);
      }
      const baseNext = {
        ...state,
        data:{
          ...state.data,
          handoff: next,
          expoSource: expoSourceNext,
          expoTickets: expoTicketsNext
        }
      };
      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          sync
        }
      };
    });
  };

  const applyRemoteOrder = (appInstance, payload={}, meta={})=>{
    if(!payload || !payload.jobOrders) return;
    console.log('[KDS][applyRemoteOrder] Received payload:', {
      hasStations: !!payload.master?.stations,
      stationsCount: payload.master?.stations?.length || 0,
      hasKitchenSections: !!payload.master?.kitchenSections,
      kitchenSectionsCount: payload.master?.kitchenSections?.length || 0,
      sampleKitchenSection: payload.master?.kitchenSections?.[0]
    });
    appInstance.setState(state=>{
      console.log('[KDS][applyRemoteOrder] Current state stations:', state.data.stations?.length || 0);
      const mergedOrders = mergeJobOrders(state.data.jobOrders || {}, payload.jobOrders);
      const jobRecordsNext = buildJobRecords(mergedOrders);
      const jobsIndexedNext = indexJobs(jobRecordsNext);
      const expoSourcePatch = Array.isArray(payload.jobOrders?.expoPassTickets)
        ? payload.jobOrders.expoPassTickets.map(ticket=> ({ ...ticket }))
        : state.data.expoSource;
      let expoSourceNext = Array.isArray(expoSourcePatch) ? expoSourcePatch : [];
      let deliveriesNext = state.data.deliveries || { assignments:{}, settlements:{} };
      if(payload.deliveries){
        const assignments = { ...(deliveriesNext.assignments || {}) };
        const settlements = { ...(deliveriesNext.settlements || {}) };
        if(payload.deliveries.assignments){
          Object.keys(payload.deliveries.assignments).forEach(orderId=>{
            assignments[orderId] = { ...(assignments[orderId] || {}), ...payload.deliveries.assignments[orderId] };
          });
        }
        if(payload.deliveries.settlements){
          Object.keys(payload.deliveries.settlements).forEach(orderId=>{
            settlements[orderId] = { ...(settlements[orderId] || {}), ...payload.deliveries.settlements[orderId] };
          });
        }
        deliveriesNext = { assignments, settlements };
      }
      let driversNext = state.data.drivers;
      if(Array.isArray(payload.drivers)){
        const existing = Array.isArray(state.data.drivers) ? state.data.drivers : [];
        const map = new Map(existing.map(driver=> [String(driver.id), driver]));
        payload.drivers.forEach(driver=>{
          if(driver && driver.id != null) map.set(String(driver.id), driver);
        });
        driversNext = Array.from(map.values());
      }
      if(Array.isArray(payload.master?.drivers)){
        const map = new Map((driversNext || []).map(driver=> [String(driver.id ?? driver.code ?? Math.random()), driver]));
        payload.master.drivers.forEach(driver=>{
          if(driver && driver.id != null) map.set(String(driver.id), driver);
        });
        driversNext = Array.from(map.values());
      }
      const existingHandoff = state.data.handoff || {};
      let handoffNext = { ...existingHandoff };
      if(payload.handoff && typeof payload.handoff === 'object'){
        const merged = { ...handoffNext };
        Object.keys(payload.handoff).forEach(orderId=>{
          const existing = handoffNext[orderId] || {};
          const incoming = payload.handoff[orderId] || {};
          const existingStatus = existing.status ? String(existing.status).toLowerCase() : '';
          const preservedStatus = (existingStatus === 'assembled' || existingStatus === 'served')
            ? existing.status
            : incoming.status;
          merged[orderId] = {
            ...existing,
            ...incoming,
            status: preservedStatus
          };
        });
        handoffNext = merged;
      }
      const persistedEntries = Object.entries(persistedHandoff);
      if(persistedEntries.length){
        const merged = { ...handoffNext };
        persistedEntries.forEach(([orderId, record])=>{
          if(!record || typeof record !== 'object') return;
          const key = normalizeOrderKey(orderId);
          if(!key) return;
          const storedStatus = record.status ? String(record.status).toLowerCase() : '';
          if(storedStatus !== 'assembled' && storedStatus !== 'served') return;
          const existing = merged[key] || {};
          const existingStatus = existing.status ? String(existing.status).toLowerCase() : '';
          const storedTime = resolveHandoffTimestamp(record);
          const existingTime = resolveHandoffTimestamp(existing);
          if(existingStatus && existingStatus !== storedStatus && existingTime >= storedTime){
            recordPersistedHandoff(key, cloneDeep(existing));
            return;
          }
          if(!existingStatus || storedTime >= existingTime){
            merged[key] = { ...existing, ...record };
          }
        });
        handoffNext = merged;
      }
      Object.keys(handoffNext).forEach(orderId=>{
        const record = handoffNext[orderId];
        if(record && shouldPersistHandoff(record)){
          recordPersistedHandoff(orderId, cloneDeep(record));
        } else {
          recordPersistedHandoff(orderId, null);
        }
      });
      Object.keys(persistedHandoff).forEach(orderId=>{
        if(handoffNext[orderId]) return;
        recordPersistedHandoff(orderId, null);
      });
      expoSourceNext = syncExpoSourceWithHandoff(expoSourceNext, handoffNext);
      const expoTicketsNext = buildExpoTickets(expoSourceNext, jobsIndexedNext);
      let stationsNext = Array.isArray(state.data.stations)
        ? state.data.stations.map(station=> ({ ...station }))
        : [];
      let stationsExplicitlyProvided = false;
      if(Array.isArray(payload.master?.stations) && payload.master.stations.length){
        stationsNext = payload.master.stations.map(station=> ({ ...station }));
        stationsExplicitlyProvided = true;
      }
      let stationRoutesNext = Array.isArray(state.data.stationCategoryRoutes)
        ? state.data.stationCategoryRoutes.map(route=> ({ ...route }))
        : [];
      if(Array.isArray(payload.master?.stationCategoryRoutes)){
        stationRoutesNext = payload.master.stationCategoryRoutes.map(route=> ({ ...route }));
      }
      let kitchenSectionsNext = Array.isArray(state.data.kitchenSections)
        ? state.data.kitchenSections.map(section=> ({ ...section }))
        : [];
      if(Array.isArray(payload.master?.kitchenSections)){
        kitchenSectionsNext = payload.master.kitchenSections.map(section=> ({ ...section }));
      }
      if(!stationsExplicitlyProvided && kitchenSectionsNext.length){
        console.log('[KDS][applyRemoteOrder] Rebuilding stations from kitchenSections:', {
          kitchenSectionsCount: kitchenSectionsNext.length,
          sampleSection: kitchenSectionsNext[0],
          currentStationsCount: stationsNext.length
        });
        stationsNext = kitchenSectionsNext.map((section, idx)=>{
          const id = section.id || section.section_id || section.sectionId;
          const nameAr = section.section_name?.ar || section.name?.ar || section.nameAr || id;
          const nameEn = section.section_name?.en || section.name?.en || section.nameEn || id;
          const result = {
            id,
            code: id && id.toString ? id.toString().toUpperCase() : id,
            nameAr,
            nameEn,
            stationType: id === 'expo' ? 'expo' : 'prep',
            isExpo: id === 'expo',
            sequence: section.sequence || (idx + 1),
            themeColor: section.themeColor || null,
            displayConfig: section.displayConfig || { layout:'grid', columns:2 },
            autoRouteRules: section.autoRouteRules || [],
            createdAt: section.createdAt || null,
            updatedAt: section.updatedAt || null
          };
          if(idx === 0){
            console.log('[KDS][applyRemoteOrder] First rebuilt station:', result);
          }
          return result;
        });
        console.log('[KDS][applyRemoteOrder] Rebuilt stations count:', stationsNext.length);
      }
      const stationMapNext = toStationMap(stationsNext);
      let categorySectionsNext = Array.isArray(state.data.categorySections)
        ? state.data.categorySections.map(entry=> ({ ...entry }))
        : [];
      if(Array.isArray(payload.master?.categorySections)){
        categorySectionsNext = payload.master.categorySections.map(entry=> ({ ...entry }));
      }
      const baseMenu = state.data.menu || {};
      let menuNext = {
        categories: Array.isArray(baseMenu.categories) ? baseMenu.categories.map(category=> ({ ...category })) : [],
        items: Array.isArray(baseMenu.items) ? baseMenu.items.map(item=> ({ ...item })) : []
      };
      if(Array.isArray(payload.master?.categories)){
        menuNext = { ...menuNext, categories: payload.master.categories.map(category=> ({ ...category })) };
      }
      if(Array.isArray(payload.master?.items)){
        menuNext = { ...menuNext, items: payload.master.items.map(item=> ({ ...item })) };
      }
      const menuIndexNext = buildMenuIndex(menuNext.items);
      let metaNext = { ...(state.data.meta || {}) };
      if(payload.master?.metadata){
        metaNext = { ...metaNext, ...payload.master.metadata };
      }
      if(payload.meta){
        metaNext = { ...metaNext, ...payload.meta };
      }
      let syncNext = { ...(state.data.sync || {}), channel: state.data.sync?.channel || BRANCH_CHANNEL };
      syncNext.lastMessage = Date.now();
      syncNext.state = 'online';
      if(payload.master?.sync){
        syncNext = { ...syncNext, ...payload.master.sync };
      }
      if(payload.master?.channel){
        syncNext.channel = payload.master.channel;
      }
      if(meta && meta.channel){
        syncNext.channel = meta.channel;
      }
      if(!syncNext.channel){
        syncNext.channel = BRANCH_CHANNEL;
      }
      const nextState = {
        ...state,
        data:{
          ...state.data,
          jobOrders: mergedOrders,
          jobs: jobsIndexedNext,
          expoSource: expoSourceNext,
          expoTickets: expoTicketsNext,
          deliveries: deliveriesNext,
          drivers: driversNext,
          handoff: handoffNext,
          stations: stationsNext,
          stationMap: stationMapNext,
          stationCategoryRoutes: stationRoutesNext,
          kitchenSections: kitchenSectionsNext,
          categorySections: categorySectionsNext,
          menu: menuNext,
          menuIndex: menuIndexNext,
          meta: metaNext,
          sync: syncNext
        }
      };
      const payloadSummary = summarizeJobPayload(payload);
      const stateSummary = summarizeAppStateSnapshot(nextState);
      const counts = payloadSummary?.counts || {};
      const label = `[Mishkah][KDS] applyRemoteOrder → headers:${counts.headers ?? 0} details:${counts.details ?? 0} sections:${counts.kitchenSections ?? counts.stations ?? 0}`;
      lastStateSnapshot = {
        context:'applyRemoteOrder',
        appliedAt: new Date().toISOString(),
        channel: syncNext?.channel || null,
        metaChannel: meta?.channel || null,
        payload: payloadSummary,
        state: stateSummary
      };
      logDebugGroup(label, lastStateSnapshot);
      return nextState;
    });
  };

  const handleLocalSyncMessage = (message)=>{
    if(!message || typeof message !== 'object' || !message.type) return;
    if(message.origin === 'kds' && message.source === syncInstanceId) return;
    const meta = message.meta && typeof message.meta === 'object' ? message.meta : {};
    if(message.type === 'orders:payload' && message.payload){
      applyRemoteOrder(app, message.payload, meta);
      return;
    }
    if(message.type === 'job:update' && message.jobId){
      applyJobUpdateMessage(app, { jobId: message.jobId, payload: message.payload || {} }, meta);
      return;
    }
    if(message.type === 'handoff:update' && message.orderId){
      applyHandoffUpdateMessage(app, { orderId: message.orderId, payload: message.payload || {} }, meta);
      return;
    }
    if(message.type === 'delivery:update' && message.orderId){
      applyDeliveryUpdateMessage(app, { orderId: message.orderId, payload: message.payload || {} }, meta);
    }
  };

  if(localSyncChannel){
    localSyncChannel.onmessage = (event)=> handleLocalSyncMessage(event?.data);
    if(typeof window !== 'undefined'){
      window.addEventListener('beforeunload', ()=>{
        try{ localSyncChannel.close(); } catch(_err){}
      });
    }
  }

  const describeInteractiveNode = (node)=>{
    if(!node || node.nodeType !== 1) return null;
    const dataset = {};
    if(node.dataset){
      Object.keys(node.dataset).forEach(key=>{ dataset[key] = node.dataset[key]; });
    }
    const buildPath = ()=>{
      const segments = [];
      let current = node;
      while(current && current.nodeType === 1 && segments.length < 6){
        let segment = current.tagName ? current.tagName.toLowerCase() : '';
        if(current.id){
          segment += `#${current.id}`;
        } else if(current.classList && current.classList.length){
          segment += '.' + Array.from(current.classList).slice(0, 2).join('.');
        }
        segments.push(segment);
        current = current.parentElement;
      }
      return segments.reverse().join(' > ');
    };
    const textContent = (node.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      tag: node.tagName ? node.tagName.toLowerCase() : 'unknown',
      gkey: node.getAttribute && node.getAttribute('data-m-gkey') || '',
      key: node.getAttribute && node.getAttribute('data-m-key') || '',
      classList: node.classList ? Array.from(node.classList) : [],
      dataset,
      path: buildPath(),
      text: textContent.length > 120 ? `${textContent.slice(0, 117)}…` : textContent
    };
  };

  const logKdsInteractiveNodes = ()=>{
    if(typeof document === 'undefined') return [];
    const root = document.querySelector('#app');
    if(!root) return [];
    const nodes = Array.from(root.querySelectorAll('[data-m-gkey]'));
    const snapshot = nodes.map(describeInteractiveNode).filter(Boolean);
    if(typeof console !== 'undefined'){
      if(typeof console.groupCollapsed === 'function'){
        console.groupCollapsed(`[Mishkah][KDS] Interactive nodes snapshot (${snapshot.length})`);
        if(typeof console.table === 'function') console.table(snapshot);
        else console.log(snapshot);
        console.groupEnd();
      } else {
        console.log(`[Mishkah][KDS] Interactive nodes snapshot (${snapshot.length})`, snapshot);
      }
    }
    return snapshot;
  };

  const logKdsOrdersRegistry = ()=>{
    const rawOrders = typeof app.getOrders === 'function' ? app.getOrders() : [];
    const snapshot = rawOrders.map((order, index)=>({
      index,
      name: order?.name || '(anonymous)',
      on: Array.isArray(order?.on) ? order.on.slice() : [],
      gkeys: Array.isArray(order?.gkeys) ? order.gkeys.slice() : [],
      keys: Array.isArray(order?.keys) ? order.keys.slice() : [],
      disabled: !!order?.disabled
    }));
    if(typeof console !== 'undefined'){
      if(typeof console.groupCollapsed === 'function'){
        console.groupCollapsed(`[Mishkah][KDS] Orders registry snapshot (${snapshot.length})`);
        snapshot.forEach(entry=> console.log(entry));
        console.groupEnd();
      } else {
        console.log(`[Mishkah][KDS] Orders registry snapshot (${snapshot.length})`, snapshot);
      }
    }
    return snapshot;
  };

  const scheduleInteractiveSnapshot = ()=>{
    if(typeof document === 'undefined') return;
    const run = ()=>{ logKdsInteractiveNodes(); };
    const invoke = ()=>{
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=> run());
      else setTimeout(run, 0);
    };
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=> invoke(), { once:true });
    } else {
      invoke();
    }
  };

  const setupKdsDevtools = ()=>{
    if(typeof window === 'undefined') return;
    const dev = window.__MishkahKDSDev__ || {};
    const announced = !!dev.__announced;
    dev.logOrders = logKdsOrdersRegistry;
    dev.inspectInteractiveNodes = logKdsInteractiveNodes;
    dev.getOrders = ()=> (typeof app.getOrders === 'function' ? app.getOrders() : []);
    dev.snapshot = ()=>({ orders: logKdsOrdersRegistry(), nodes: logKdsInteractiveNodes() });
    dev.logDomSnapshot = logKdsInteractiveNodes;
    dev.getStateSummary = ()=> lastStateSnapshot;
    dev.logState = ()=>{
      if(lastStateSnapshot){
        logDebugGroup('[Mishkah][KDS] Last state summary', lastStateSnapshot);
      } else if(typeof console !== 'undefined' && typeof console.info === 'function'){
        console.info('[Mishkah KDS] No state snapshot has been captured yet.');
      }
      return lastStateSnapshot;
    };
    dev.getWatcherSummary = ()=> lastWatcherSnapshot;
    dev.logWatcherPayload = ()=>{
      if(lastWatcherSnapshot){
        logDebugGroup('[Mishkah][KDS] Last watcher payload summary', lastWatcherSnapshot);
      } else if(typeof console !== 'undefined' && typeof console.info === 'function'){
        console.info('[Mishkah KDS] No watcher payload snapshot has been captured yet.');
      }
      return lastWatcherSnapshot;
    };
    window.__MishkahKDSDev__ = dev;
    if(!announced){
      if(typeof console !== 'undefined'){
        console.info('%c[Mishkah KDS] Developer helpers ready → use __MishkahKDSDev__.logOrders() and .inspectInteractiveNodes() for diagnostics.', 'color:#38bdf8;font-weight:bold;');
      }
      try{
        Object.defineProperty(dev, '__announced', { value:true, enumerable:false, configurable:true, writable:false });
      } catch(_err){ dev.__announced = true; }
    }
  };

  const kdsOrders = {
    'kds.theme.set':{
      on:['click'],
      gkeys:['kds:theme:set'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-theme]');
        if(!btn) return;
        const theme = btn.getAttribute('data-theme');
        if(!theme) return;
        ctx.setState(state=>({
          ...state,
          env:{ ...(state.env || {}), theme }
        }));
      }
    },
    'kds.lang.set':{
      on:['click'],
      gkeys:['kds:lang:set'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-lang]');
        if(!btn) return;
        const langValue = btn.getAttribute('data-lang');
        if(!langValue) return;
        ctx.setState(state=>({
          ...state,
          env:{ ...(state.env || {}), lang: langValue, dir: langValue === 'ar' ? 'rtl' : 'ltr' }
        }));
      }
    },
    'kds.tab.switch':{
      on:['click'],
      gkeys:['kds:tab:switch'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-section-id]');
        if(!btn) return;
        const sectionId = btn.getAttribute('data-section-id');
        if(!sectionId) return;
        ctx.setState(state=>({
          ...state,
          data:{
            ...state.data,
            filters:{ ...state.data.filters, activeTab: sectionId }
          }
        }));
      }
    },
    'kds.job.start':{
      on:['click'],
      gkeys:['kds:job:start'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-job-id]');
        if(!btn) return;
        const jobId = btn.getAttribute('data-job-id');
        if(!jobId) return;
        const nowIso = new Date().toISOString();
        const nowMs = Date.parse(nowIso);
        ctx.setState(state=> applyJobsUpdate(state, list=> list.map(job=> job.id === jobId ? startJob(job, nowIso, nowMs) : job)));
        emitSync({ type:'job:update', jobId, payload:{ status:'in_progress', progressState:'cooking', startedAt: nowIso, updatedAt: nowIso } });
        if(syncClient){
          syncClient.publishJobUpdate({ jobId, payload:{ status:'in_progress', progressState:'cooking', startedAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.job.finish':{
      on:['click'],
      gkeys:['kds:job:finish'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-job-id]');
        if(!btn) return;
        const jobId = btn.getAttribute('data-job-id');
        if(!jobId) return;
        const nowIso = new Date().toISOString();
        const nowMs = Date.parse(nowIso);
        ctx.setState(state=> applyJobsUpdate(state, list=> list.map(job=> job.id === jobId ? finishJob(job, nowIso, nowMs) : job)));
        emitSync({ type:'job:update', jobId, payload:{ status:'ready', progressState:'completed',status:'finish', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso } });
        if(syncClient){
          syncClient.publishJobUpdate({ jobId, payload:{ status:'ready', progressState:'completed',status:'finish', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.handoff.assembled':{
      on:['click'],
      gkeys:['kds:handoff:assembled'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        ctx.setState(state=>{
          const handoff = state.data.handoff || {};
          const record = { ...(handoff[orderId] || {}), status:'assembled', assembledAt: nowIso, updatedAt: nowIso };
          const next = { ...handoff, [orderId]: record };
          const expoSourceNext = applyExpoStatusForOrder(state.data.expoSource, orderId, { status:'assembled', assembledAt: nowIso, updatedAt: nowIso });
          const expoTicketsNext = buildExpoTickets(expoSourceNext, state.data.jobs);
          recordPersistedHandoff(orderId, cloneDeep(record));
          return {
            ...state,
            data:{
              ...state.data,
              handoff: next,
              expoSource: expoSourceNext,
              expoTickets: expoTicketsNext
            }
          };
        });
        emitSync({ type:'handoff:update', orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });
        if(syncClient && typeof syncClient.publishHandoffUpdate === 'function'){
          syncClient.publishHandoffUpdate({ orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.handoff.served':{
      on:['click'],
      gkeys:['kds:handoff:served'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        ctx.setState(state=>{
          const handoff = state.data.handoff || {};
          const record = { ...(handoff[orderId] || {}), status:'served', servedAt: nowIso, updatedAt: nowIso };
          const next = { ...handoff, [orderId]: record };
          const expoSourceNext = applyExpoStatusForOrder(state.data.expoSource, orderId, { status:'served', servedAt: nowIso, updatedAt: nowIso });
          const expoTicketsNext = buildExpoTickets(expoSourceNext, state.data.jobs);
          recordPersistedHandoff(orderId, cloneDeep(record));
          return {
            ...state,
            data:{
              ...state.data,
              handoff: next,
              expoSource: expoSourceNext,
              expoTickets: expoTicketsNext
            }
          };
        });
        emitSync({ type:'handoff:update', orderId, payload:{ status:'served', servedAt: nowIso, updatedAt: nowIso } });
        if(syncClient && typeof syncClient.publishHandoffUpdate === 'function'){
          syncClient.publishHandoffUpdate({ orderId, payload:{ status:'served', servedAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.delivery.assign':{
      on:['click'],
      gkeys:['kds:delivery:assign'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:true,
            modals:{ ...(state.ui?.modals || {}), driver:true },
            deliveryAssignment:{ orderId }
          }
        }));
      }
    },
    'kds.delivery.selectDriver':{
      on:['click'],
      gkeys:['kds:delivery:select-driver'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id][data-driver-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        const driverId = btn.getAttribute('data-driver-id');
        if(!orderId || !driverId) return;
        const nowIso = new Date().toISOString();
        let assignmentPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const assignments = { ...(deliveries.assignments || {}) };
          const driver = (state.data.drivers || []).find(d=> String(d.id) === driverId) || {};
          assignments[orderId] = {
            ...(assignments[orderId] || {}),
            driverId,
            driverName: driver.name || driverId,
            driverPhone: driver.phone || '',
            vehicleId: driver.vehicle_id || driver.vehicleId || '',
            status: 'assigned',
            assignedAt: assignments[orderId]?.assignedAt || nowIso
          };
          assignmentPayload = assignments[orderId];
          emitSync({ type:'delivery:update', orderId, payload:{ assignment: assignments[orderId] } });
          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments, settlements: { ...(deliveries.settlements || {}) } }
            },
            ui:{
              ...(state.ui || {}),
              modalOpen:false,
              modals:{ ...(state.ui?.modals || {}), driver:false },
              deliveryAssignment:null
            }
          };
        });
        if(syncClient && assignmentPayload){
          syncClient.publishDeliveryUpdate({ orderId, payload:{ assignment: assignmentPayload } });
        }
      }
    },
    'kds.delivery.complete':{
      on:['click'],
      gkeys:['kds:delivery:complete'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        let assignmentPayload = null;
        let settlementPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const assignments = { ...(deliveries.assignments || {}) };
          const settlements = { ...(deliveries.settlements || {}) };
          assignments[orderId] = {
            ...(assignments[orderId] || {}),
            status:'delivered',
            deliveredAt: nowIso
          };
          assignmentPayload = assignments[orderId];
          settlements[orderId] = settlements[orderId] || { status:'pending', updatedAt: nowIso };
          settlementPayload = settlements[orderId];

          // Also update handoff status to 'assembled' for delivery orders (not 'served')
          const handoff = state.data.handoff || {};
          const handoffRecord = { ...(handoff[orderId] || {}), status:'assembled', assembledAt: nowIso, updatedAt: nowIso };
          const nextHandoff = { ...handoff, [orderId]: handoffRecord };
          recordPersistedHandoff(orderId, handoffRecord);

          emitSync({ type:'delivery:update', orderId, payload:{ assignment: assignments[orderId] } });
          emitSync({ type:'handoff:update', orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });

          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments, settlements },
              handoff: nextHandoff
            }
          };
        });
        if(syncClient){
          syncClient.publishDeliveryUpdate({ orderId, payload:{ assignment: assignmentPayload, settlement: settlementPayload } });
        }
      }
    },
    'kds.delivery.settle':{
      on:['click'],
      gkeys:['kds:delivery:settle'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        let settlementPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const settlements = { ...(deliveries.settlements || {}) };
          settlements[orderId] = { ...(settlements[orderId] || {}), status:'settled', settledAt: nowIso };
          settlementPayload = settlements[orderId];
          emitSync({ type:'delivery:update', orderId, payload:{ settlement: settlements[orderId] } });
          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments: { ...(deliveries.assignments || {}) }, settlements }
            }
          };
        });
        if(syncClient && settlementPayload){
          syncClient.publishDeliveryUpdate({ orderId, payload:{ settlement: settlementPayload } });
        }
      }
    },
    'ui.modal.close':{
      on:['click'],
      gkeys:['ui:modal:close'],
      handler:(event, ctx)=>{
        event?.preventDefault();
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:false,
            modals:{ ...(state.ui?.modals || {}), driver:false },
            deliveryAssignment:null
          }
        }));
      }
    }
  };

  const watcherUnsubscribers = [];
  let store = typeof window !== 'undefined' && window.__POS_DB__ ? window.__POS_DB__ : null;

  const watcherState = {
    status: 'idle',
    posPayload: database,
    headers: [],
    lines: [],
    deliveries: []
  };

  const ensureArray = (value) => (Array.isArray(value) ? value : []);
  const normalizeId = (value) => (value == null ? null : String(value));
  const canonicalId = (value) => {
    const id = normalizeId(value);
    if (!id) return null;
    const trimmed = id.trim();
    return trimmed.length ? trimmed : null;
  };
  const canonicalCode = (value) => {
    const code = canonicalId(value);
    return code ? code.toLowerCase() : null;
  };
  const extractOrderLineItemId = (line) => {
    if (!line) return null;
    const rawId = canonicalId(
      line?.orderLineId || line?.order_line_id || line?.id
    );
    if (!rawId) return null;
    const trimmed = rawId.startsWith('ln-') ? rawId.slice(3) : rawId;
    const uuidMatch = trimmed.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (uuidMatch) return uuidMatch[0];
    const hexMatch = trimmed.match(/[0-9a-f]{32}/i);
    if (hexMatch) return hexMatch[0];
    const markerIndex = trimmed.indexOf('-m');
    if (markerIndex > 0) return trimmed.slice(0, markerIndex);
    const dashIndex = trimmed.indexOf('-');
    if (dashIndex > 0) return trimmed.slice(0, dashIndex);
    return trimmed || null;
  };
  const extractBaseOrderId = (value) => {
    const id = canonicalId(value);
    if (!id) return null;
    const colonIndex = id.indexOf(':');
    if (colonIndex > 0) return id.slice(0, colonIndex);
    return id;
  };
  const toNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const normalizeKitchenSections = (sections) =>
    ensureArray(sections).map((section, index) => {
      const id =
        normalizeId(section?.id) ||
        normalizeId(section?.section_id) ||
        normalizeId(section?.sectionId) ||
        `section-${index + 1}`;
      const code =
        section?.code ||
        (id ? id.toString().toUpperCase() : `SEC-${index + 1}`);
      return {
        id,
        code,
        nameAr:
          section?.section_name?.ar ||
          section?.name?.ar ||
          section?.nameAr ||
          section?.name ||
          code,
        nameEn:
          section?.section_name?.en ||
          section?.name?.en ||
          section?.nameEn ||
          section?.name ||
          code,
        description:
          section?.description?.ar ||
          section?.description?.en ||
          section?.description ||
          '',
        stationType:
          section?.stationType ||
          (section?.isExpo || section?.is_expo || id === 'expo'
            ? 'expo'
            : 'prep'),
        isExpo: !!(section?.isExpo || section?.is_expo || id === 'expo'),
        sequence: toNumber(section?.sequence, index + 1),
        themeColor: section?.themeColor || null,
        autoRouteRules: ensureArray(section?.autoRouteRules),
        displayConfig:
          typeof section?.displayConfig === 'object' && section?.displayConfig
            ? { ...section.displayConfig }
            : { layout: 'grid', columns: 2 },
        createdAt: section?.createdAt || null,
        updatedAt: section?.updatedAt || null
      };
    });

  const normalizeCategoryRoutes = (routes) =>
    ensureArray(routes)
      .map((entry, index) => {
        const categoryId =
          normalizeId(entry?.categoryId) ||
          normalizeId(entry?.category_id);
        const stationId =
          normalizeId(entry?.stationId) ||
          normalizeId(entry?.station_id) ||
          normalizeId(entry?.sectionId) ||
          normalizeId(entry?.section_id);
        if (!categoryId || !stationId) return null;
        return {
          id:
            normalizeId(entry?.id) ||
            `route-${index + 1}-${categoryId}-${stationId}`,
          categoryId,
          stationId,
          priority: toNumber(entry?.priority || entry?.sequence, 0),
          isActive: entry?.isActive !== false && entry?.active !== false,
          createdAt: entry?.createdAt || null,
          updatedAt: entry?.updatedAt || null
        };
      })
      .filter(Boolean);

  const deriveMenuCategories = (payload) =>
    ensureArray(payload?.categories).map((entry, index) => ({
      id: normalizeId(entry?.id || entry?.categoryId) || `cat-${index + 1}`,
      nameAr:
        entry?.category_name?.ar ||
        entry?.name?.ar ||
        entry?.nameAr ||
        entry?.titleAr ||
        '',
      nameEn:
        entry?.category_name?.en ||
        entry?.name?.en ||
        entry?.nameEn ||
        entry?.titleEn ||
        '',
      sectionId:
        normalizeId(entry?.section_id || entry?.sectionId) || null,
      sequence: toNumber(entry?.sequence || entry?.displayOrder, index)
    }));

  const mergeMeta = (left = {}, right = {}) => ({
    ...left,
    ...right,
    media: { ...(left?.media || {}), ...(right?.media || {}) }
  });

  const deriveMenuItems = (payload) => {
    const sources = [
      payload?.items,
      payload?.menu_items,
      payload?.menuItems,
      payload?.menu?.items,
      payload?.menu?.menu_items,
      payload?.menu?.menuItems,
      payload?.master?.items,
      payload?.master?.menu_items,
      payload?.master?.menuItems
    ];

    const records = new Map();
    let fallbackIndex = 0;

    const normalizeItem = (entry, id) => {
      const categoryId = normalizeId(entry?.category_id || entry?.categoryId);
      const sectionId =
        normalizeId(
          entry?.kitchen_section_id ||
            entry?.kitchenSectionId ||
            entry?.station_id ||
            entry?.stationId
        ) || null;
      const code =
        entry?.code ||
        entry?.sku ||
        entry?.item_code ||
        entry?.itemCode ||
        id;
      const nameAr =
        entry?.item_name?.ar ||
        entry?.name?.ar ||
        entry?.nameAr ||
        entry?.titleAr ||
        entry?.label?.ar ||
        entry?.labelAr ||
        '';
      const nameEn =
        entry?.item_name?.en ||
        entry?.name?.en ||
        entry?.nameEn ||
        entry?.titleEn ||
        entry?.label?.en ||
        entry?.labelEn ||
        '';
      return {
        id,
        itemId: id,
        categoryId,
        sectionId,
        code,
        nameAr,
        nameEn,
        price: toNumber(entry?.pricing?.base || entry?.price, 0),
        meta: mergeMeta(entry?.meta || {}, { media: entry?.media || {} })
      };
    };

    sources.forEach((source) => {
      ensureArray(source).forEach((entry) => {
        if (!entry) return;
        let id =
          normalizeId(
            entry?.id ||
              entry?.itemId ||
              entry?.item_id ||
              entry?.menu_item_id ||
              entry?.menuItemId
          );
        if (!id) {
          fallbackIndex += 1;
          id = `item-${fallbackIndex}`;
        }
        const normalized = normalizeItem(entry, id);
        if (records.has(id)) {
          const existing = records.get(id);
          records.set(id, {
            ...existing,
            categoryId: existing.categoryId || normalized.categoryId,
            sectionId: existing.sectionId || normalized.sectionId,
            code:
              existing.code && existing.code !== existing.itemId
                ? existing.code
                : normalized.code || existing.code,
            nameAr: existing.nameAr || normalized.nameAr,
            nameEn: existing.nameEn || normalized.nameEn,
            price: existing.price || normalized.price,
            meta: mergeMeta(normalized.meta, existing.meta)
          });
        } else {
          records.set(id, normalized);
        }
      });
    });

    return Array.from(records.values());
  };

  const deriveDrivers = (payload) => {
    const drivers = [];
    const upsert = (source) => {
      ensureArray(source).forEach((driver) => {
        if (!driver) return;
        const id =
          normalizeId(driver?.id) ||
          normalizeId(driver?.driverId) ||
          normalizeId(driver?.code) ||
          normalizeId(driver?.employeeId);
        if (!id) return;
        const record = {
          id,
          code: driver?.code || id,
          name:
            driver?.name ||
            driver?.fullName ||
            driver?.displayName ||
            driver?.employeeName ||
            id,
          phone: driver?.phone || driver?.mobile || driver?.contact || '',
          vehicleId: driver?.vehicleId || driver?.vehicle_id || ''
        };
        const existing = drivers.find((entry) => entry.id === id);
        if (existing) Object.assign(existing, record);
        else drivers.push(record);
      });
    };
    upsert(payload?.drivers);
    upsert(payload?.settings?.drivers);
    upsert(payload?.master?.drivers);
    return drivers;
  };

  const buildStatusLookup = (payload) => {
    const map = new Map();
    ensureArray(payload?.order_line_statuses).forEach((entry) => {
      const id = normalizeId(entry?.id || entry?.statusId);
      if (!id) return;
      const key = (entry?.slug || entry?.code || id).toString().toLowerCase();
      map.set(id.toLowerCase(), key);
      map.set(key, key);
      const nameAr = entry?.status_name?.ar || entry?.name?.ar;
      const nameEn = entry?.status_name?.en || entry?.name?.en;
      if (nameAr) map.set(String(nameAr).toLowerCase(), key);
      if (nameEn) map.set(String(nameEn).toLowerCase(), key);
    });
    return map;
  };

  const resolveLineStatus = (value, lookup) => {
    const raw = normalizeId(value);
    const key = raw ? raw.toLowerCase() : '';
    const resolved = lookup.get(key) || key;
    if (
      ['ready', 'completed', 'done', 'served', 'finished'].includes(resolved)
    )
      return 'ready';
    if (
      ['in_progress', 'preparing', 'cooking', 'progress', 'started'].includes(
        resolved
      )
    )
      return 'in_progress';
    if (['cancelled', 'void', 'rejected'].includes(resolved)) return 'cancelled';
    return 'queued';
  };

  const resolveServiceMode = (entry, payload) => {
    const source = entry || {};
    const { mapLookup, typeLookup } = getOrderTypeLookups(payload || {});
    let immediateService = '';
    const candidates = [];
    const seen = new Set();
    const enqueue = (value) => {
      if (immediateService || (!value && value !== 0)) return;
      const detected = detectServiceModeFromValue(value);
      if (detected) {
        immediateService = detected;
      }
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(enqueue);
        }
        return;
      }
      const text = safeText(value);
      if (!text || seen.has(text)) return;
      seen.add(text);
      candidates.push(text);
    };

    [
      source.serviceMode,
      source.service_mode,
      source.orderType,
      source.order_type,
      source.orderTypeId,
      source.order_type_id,
      source.orderTypeCode,
      source.order_type_code,
      source.orderTypeName,
      source.order_type_name,
      source.orderTypeLabel,
      source.order_type_label,
      source.orderTypeValue,
      source.order_type_value,
      source.orderTypeSlug,
      source.order_type_slug,
      source.type,
      source.typeName,
      source.type_name,
      source.typeId,
      source.type_id,
      source.typeCode,
      source.type_code,
      source.channel,
      source.stationType,
      source.station_type,
      source.service,
      source.serviceType,
      source.service_type,
      source.orderCategory,
      source.order_category,
      source.deliveryMode,
      source.delivery_mode
    ].forEach(enqueue);

    if (source?.metadata && typeof source.metadata === 'object') {
      const meta = source.metadata;
      [
        meta.serviceMode,
        meta.service_mode,
        meta.orderType,
        meta.order_type,
        meta.orderTypeId,
        meta.order_type_id,
        meta.orderTypeCode,
        meta.order_type_code,
        meta.orderTypeName,
        meta.order_type_name,
        meta.type,
        meta.typeName,
        meta.type_name,
        meta.channel
      ].forEach(enqueue);
    }

    if (Array.isArray(source?.tags)) {
      source.tags.forEach(enqueue);
    }

    if (immediateService) return immediateService;

    for (const candidate of candidates) {
      const mapped = lookupServiceCandidate(mapLookup, candidate);
      if (mapped) return mapped;
    }

    for (const candidate of candidates) {
      const typed = lookupServiceCandidate(typeLookup, candidate);
      if (typed) return typed;
    }

    if (immediateService) return immediateService;

    for (const candidate of candidates) {
      const detected = detectServiceModeFromValue(candidate);
      if (detected) return detected;
    }

    return SERVICE_MODE_FALLBACK;
  };

  const resolveTableLabel = (header, payload) => {
    const tableId =
      normalizeId(header?.tableId) ||
      normalizeId(header?.table_id) ||
      normalizeId(header?.tableCode);
    if (!tableId) return '';
    const tables = ensureArray(payload?.tables);
    const match = tables.find(
      (table) =>
        normalizeId(table?.id || table?.tableId || table?.code) === tableId
    );
    return match?.name || match?.label || tableId;
  };

  const resolveCustomerName = (header, payload) => {
    if (header?.customerName) return header.customerName;
    const customerId =
      normalizeId(header?.customerId) || normalizeId(header?.customer_id);
    if (!customerId) return '';
    const customers = ensureArray(
      payload?.customers || payload?.customer_profile || payload?.customerProfiles
    );
    const match = customers.find(
      (entry) => normalizeId(entry?.id || entry?.customerId) === customerId
    );
    return (
      match?.name ||
      match?.fullName ||
      match?.displayName ||
      match?.customerName ||
      ''
    );
  };

  const buildWatcherPayload = () => {
    const posPayload = watcherState.posPayload || {};
    console.log('[KDS][buildWatcherPayload] posPayload kitchen data:', {
      hasKitchenSections: !!posPayload?.kitchen_sections,
      kitchenSectionsCount: posPayload?.kitchen_sections?.length || 0,
      hasKdsStations: !!posPayload?.kds?.stations,
      hasMasterStations: !!posPayload?.master?.stations,
      hasMasterKitchenSections: !!posPayload?.master?.kitchenSections
    });
    const stations = buildStations(
      posPayload,
      posPayload?.kds || {},
      posPayload?.master || {}
    );
    const stationMap = toStationMap(stations);
    const kitchenSections = normalizeKitchenSections(
      posPayload?.kitchen_sections
    );
    console.log('[KDS][buildWatcherPayload] Built data:', {
      stationsCount: stations.length,
      kitchenSectionsCount: kitchenSections.length,
      firstStation: stations[0],
      firstKitchenSection: kitchenSections[0]
    });
    const stationCategoryRoutes = normalizeCategoryRoutes(
      posPayload?.category_sections
    );
    const categorySections = stationCategoryRoutes.map((route) => ({
      id: route.id,
      categoryId: route.categoryId,
      sectionId: route.stationId,
      priority: route.priority,
      isActive: route.isActive,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt
    }));
    const categories = deriveMenuCategories(posPayload);
    const items = deriveMenuItems(posPayload);
    const itemById = new Map();
    const itemByCode = new Map();
    items.forEach((item) => {
      const idKey = canonicalId(item?.id || item?.itemId);
      if (idKey) {
        itemById.set(idKey, item);
        itemById.set(idKey.toLowerCase(), item);
      }
      const codeKey = canonicalCode(item?.code);
      if (codeKey && !itemByCode.has(codeKey)) {
        itemByCode.set(codeKey, item);
      }
    });
    const getItemById = (value) => {
      const key = canonicalId(value);
      if (!key) return null;
      return itemById.get(key) || itemById.get(key.toLowerCase()) || null;
    };
    const getItemByCode = (value) => {
      const key = canonicalCode(value);
      if (!key) return null;
      return itemByCode.get(key) || null;
    };
    const categoryRouteIndex = new Map();
    stationCategoryRoutes.forEach((route) => {
      if (!route?.categoryId || !route?.stationId) return;
      const categoryId = canonicalId(route.categoryId);
      const stationId = canonicalId(route.stationId);
      if (!categoryId || !stationId) return;
      const bucket = categoryRouteIndex.get(categoryId) || [];
      bucket.push({ ...route, categoryId, stationId });
      categoryRouteIndex.set(categoryId, bucket);
      const lowerKey = categoryId.toLowerCase();
      if (!categoryRouteIndex.has(lowerKey)) {
        categoryRouteIndex.set(lowerKey, bucket);
      }
    });
    categoryRouteIndex.forEach((bucket, key) => {
      const sorted = bucket
        .slice()
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));
      const active = sorted.filter((route) => route.isActive !== false);
      categoryRouteIndex.set(key, active.length ? active : sorted);
    });
    const resolveStationForCategory = (categoryId) => {
      const key = canonicalId(categoryId);
      if (!key) return null;
      const bucket =
        categoryRouteIndex.get(key) || categoryRouteIndex.get(key.toLowerCase());
      if (bucket && bucket.length) return bucket[0].stationId;
      return null;
    };
    const statusLookup = buildStatusLookup(posPayload);
    const drivers = deriveDrivers(posPayload);
    const driverIndex = new Map(drivers.map((driver) => [driver.id, driver]));

    const orders = new Map();
    ensureArray(watcherState.headers).forEach((header) => {
      const jobOrderId = canonicalId(
        header?.id ||
          header?.jobOrderId ||
          header?.job_order_id ||
          header?.orderJobId ||
          header?.job_id ||
          header?.orderId ||
          header?.order_id
      );
      if (!jobOrderId) return;
      const displayOrderId =
        canonicalId(header?.orderId || header?.order_id) ||
        extractBaseOrderId(jobOrderId);
      const orderNumber = resolveOrderNumber(
        header?.orderNumber ||
          header?.order_number ||
          header?.posNumber ||
          header?.ticketNumber,
        displayOrderId || jobOrderId
      );
      orders.set(jobOrderId, {
        jobOrderId,
        orderId: displayOrderId || jobOrderId,
        header,
        orderNumber,
        serviceMode: resolveServiceMode(header, posPayload),
        tableLabel: resolveTableLabel(header, posPayload),
        customerName: resolveCustomerName(header, posPayload),
        openedAt: header?.openedAt || header?.createdAt || null,
        dueAt: header?.dueAt || header?.expectedAt || null,
        jobs: new Map()
      });
    });

    const jobDetails = [];
    const jobHeaders = [];

    ensureArray(watcherState.lines).forEach((line) => {
      const jobOrderId = canonicalId(
        line?.jobOrderId ||
          line?.job_order_id ||
          line?.orderId ||
          line?.order_id
      );
      if (!jobOrderId) return;
      if (!orders.has(jobOrderId)) {
        const fallbackDisplayId =
          canonicalId(line?.orderNumber || line?.order_number) ||
          extractBaseOrderId(jobOrderId);
        const derivedService = resolveServiceMode(line, posPayload);
        orders.set(jobOrderId, {
          jobOrderId,
          orderId: fallbackDisplayId || jobOrderId,
          header: {},
          orderNumber: resolveOrderNumber(
            line?.orderNumber || line?.order_number,
            fallbackDisplayId || jobOrderId
          ),
          serviceMode: derivedService || SERVICE_MODE_FALLBACK,
          tableLabel: '',
          customerName: '',
          openedAt: line?.createdAt || null,
          dueAt: null,
          jobs: new Map()
        });
      }
      const order = orders.get(jobOrderId);
      if (!order) return;
      const lineService = resolveServiceMode(line, posPayload);
      if (
        lineService &&
        lineService !== order.serviceMode &&
        (order.serviceMode === SERVICE_MODE_FALLBACK || lineService !== SERVICE_MODE_FALLBACK)
      ) {
        order.serviceMode = lineService;
        order.jobs.forEach((existingJob) => {
          if (existingJob && typeof existingJob === 'object') {
            existingJob.serviceMode = lineService;
          }
        });
      }
      const lineDisplayId =
        canonicalId(line?.orderNumber || line?.order_number) ||
        extractBaseOrderId(jobOrderId);
      if (lineDisplayId && lineDisplayId !== order.orderId) {
        order.orderId = lineDisplayId;
        order.orderNumber = resolveOrderNumber(
          order.orderNumber,
          lineDisplayId
        );
      }
      const metadata =
        line && typeof line.metadata === 'object' && !Array.isArray(line.metadata)
          ? line.metadata
          : {};
      const rawItemId = canonicalId(
        line?.itemId ||
          line?.item_id ||
          line?.menuItemId ||
          line?.menu_item_id
      );
      const metadataItemId = canonicalId(
        metadata?.itemId ||
          metadata?.item_id ||
          metadata?.menuItemId ||
          metadata?.menu_item_id ||
          metadata?.id
      );
      const derivedItemId = extractOrderLineItemId(line);
      const rawItemCode = canonicalId(
        line?.itemCode ||
          line?.item_code ||
          line?.sku ||
          line?.code
      );
      const metadataItemCode = canonicalId(
        metadata?.itemCode ||
          metadata?.item_code ||
          metadata?.sku ||
          metadata?.code
      );
      const item =
        getItemById(rawItemId) ||
        getItemById(metadataItemId) ||
        getItemById(derivedItemId) ||
        getItemByCode(rawItemCode) ||
        getItemByCode(metadataItemCode) ||
        {};
      const resolvedItemId =
        rawItemId ||
        metadataItemId ||
        derivedItemId ||
        canonicalId(item?.id || item?.itemId);
      const resolvedItemCode =
        canonicalId(item?.code || item?.itemCode) ||
        rawItemCode ||
        metadataItemCode;
      const rawCategoryId = canonicalId(
        line?.categoryId ||
          line?.category_id ||
          line?.menuCategoryId ||
          line?.menu_category_id
      );
      const metadataCategoryId = canonicalId(
        metadata?.categoryId ||
          metadata?.category_id ||
          metadata?.menuCategoryId ||
          metadata?.menu_category_id
      );
      const categoryId =
        rawCategoryId || metadataCategoryId || canonicalId(item?.categoryId);
      let sectionId =
        canonicalId(
          line?.kitchenSectionId ||
            line?.kitchen_section_id ||
            line?.sectionId ||
            line?.stationId
        ) ||
        canonicalId(
          metadata?.kitchenSectionId ||
            metadata?.kitchen_section_id ||
            metadata?.sectionId ||
            metadata?.stationId
        ) ||
        canonicalId(item?.sectionId) ||
        null;
      if (!sectionId) {
        sectionId = resolveStationForCategory(categoryId) || 'general';
      }
      const jobItemId = resolvedItemId || derivedItemId;
      const jobOrderRef = order.jobOrderId || jobOrderId;
      let jobId = jobOrderRef;
      if (sectionId && jobId && !jobId.includes(':')) {
        jobId = `${jobId}:${sectionId}`;
      }
      if (!jobId) {
        jobId = sectionId ? `${order.orderId}:${sectionId}` : order.orderId;
      }
      if (!order.jobs.has(jobId)) {
        const station = stationMap[sectionId] || {};
        order.jobs.set(jobId, {
          id: jobId,
          jobOrderId: jobOrderRef || jobId,
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          stationId: sectionId,
          stationCode: station?.code || sectionId,
          serviceMode: order.serviceMode,
          tableLabel: order.tableLabel,
          customerName: order.customerName,
          totalItems: 0,
          completedItems: 0,
          remainingItems: 0,
          createdAt: order.openedAt,
          acceptedAt: order.openedAt,
          dueAt: order.dueAt,
          readyAt: null,
          completedAt: null,
          updatedAt: order.openedAt,
          details: []
        });
      }
      const job = order.jobs.get(jobId);
      job.jobOrderId = job.jobOrderId || jobOrderRef || jobId;
      job.id = job.jobOrderId || jobId;
      job.orderId = order.orderId;
      job.orderNumber = order.orderNumber;
      const station = stationMap[sectionId] || {};
      if (station?.code && job.stationCode !== station.code) {
        job.stationCode = station.code;
      }
      const quantity = ensureQuantity(line?.quantity);
      const status = resolveLineStatus(
        line?.statusId || line?.status_id || line?.status,
        statusLookup
      );
      job.totalItems += quantity;
      if (status === 'ready') job.completedItems += quantity;
      const detailId =
        normalizeId(line?.id) || `${jobId}-detail-${job.details.length + 1}`;
      job.details.push({
        id: detailId,
        jobOrderId: job.jobOrderId || jobId,
        orderLineId: normalizeId(line?.id) || detailId,
        itemId: jobItemId,
        itemCode:
          metadata?.itemCode ||
            metadata?.code ||
          resolvedItemCode ||
          rawItemCode ||
          jobItemId ||
          metadataItemId,
        quantity,
        status,
        itemNameAr:
          metadata?.itemNameAr ||
          metadata?.nameAr ||
          metadata?.itemName ||
          metadata?.name ||
          line?.item_name?.ar ||
          line?.itemNameAr ||
          line?.nameAr ||
          line?.itemName ||
          line?.name ||
          item?.nameAr ||
          item?.name ||
          item?.item_name?.ar ||
          station?.nameAr ||
          job.stationCode,
        itemNameEn:
          metadata?.itemNameEn ||
          metadata?.nameEn ||
          metadata?.itemName ||
          metadata?.name ||
          line?.item_name?.en ||
          line?.itemNameEn ||
          line?.nameEn ||
          line?.itemName ||
          line?.name ||
          item?.nameEn ||
          item?.name ||
          item?.item_name?.en ||
          station?.nameEn ||
          job.stationCode,
        prepNotes: Array.isArray(line?.notes)
          ? line.notes.filter(Boolean).join(' • ')
          :
            line?.notes ||
            line?.prepNotes ||
            metadata?.prepNotes ||
            metadata?.notes ||
            ''
      });
    });

    orders.forEach((order) => {
      order.jobs.forEach((job) => {
        job.remainingItems = Math.max(0, job.totalItems - job.completedItems);
        const status =
          job.totalItems > 0 && job.completedItems >= job.totalItems
            ? 'ready'
            : job.completedItems > 0
            ? 'in_progress'
            : 'queued';
        const progressState =
          status === 'ready' ? 'completed' : status === 'in_progress' ? 'cooking' : 'awaiting';
        jobHeaders.push({
          id: job.jobOrderId || job.id,
          jobOrderId: job.jobOrderId || job.id,
          orderId: job.orderId,
          orderNumber: job.orderNumber,
          stationId: job.stationId,
          stationCode: job.stationCode,
          status,
          progressState,
          totalItems: job.totalItems,
          completedItems: job.completedItems,
          remainingItems: job.remainingItems,
          tableLabel: job.tableLabel,
          customerName: job.customerName,
          serviceMode: job.serviceMode,
          acceptedAt: job.acceptedAt,
          createdAt: job.createdAt,
          readyAt: job.readyAt,
          completedAt: job.completedAt,
          dueAt: job.dueAt,
          updatedAt: new Date().toISOString(),
          meta: { source: 'watcher' }
        });
        job.details.forEach((detail) => {
          jobDetails.push({
            id: detail.id,
            jobOrderId: job.jobOrderId || job.id,
            orderLineId: detail.orderLineId,
            itemId: detail.itemId,
            itemCode: detail.itemCode,
            quantity: detail.quantity,
            status: detail.status,
            itemNameAr: detail.itemNameAr,
            itemNameEn: detail.itemNameEn,
            prepNotes: detail.prepNotes,
            modifiers: []
          });
        });
      });
    });

    const handoff = {};
    const handoffBuckets = new Map();
    orders.forEach((order) => {
      const key = order.orderId || order.jobOrderId;
      if (!key) return;
      const bucket = handoffBuckets.get(key) || [];
      bucket.push(order);
      handoffBuckets.set(key, bucket);
    });
    const handoffTimestamp = new Date().toISOString();
    handoffBuckets.forEach((bucket, key) => {
      const jobs = [];
      bucket.forEach((order) => {
        order.jobs.forEach((job) => {
          jobs.push(job);
        });
      });
      const readyJobs = jobs.filter((job) => job.status === 'ready');
      handoff[key] = {
        status:
          jobs.length && readyJobs.length === jobs.length ? 'ready' : 'pending',
        updatedAt: handoffTimestamp
      };
    });

    const deliveries = { assignments: {}, settlements: {} };
    ensureArray(watcherState.deliveries).forEach((entry) => {
      const orderId =
        normalizeId(entry?.orderId) || normalizeId(entry?.order_id);
      if (!orderId) return;
      const driverId =
        normalizeId(entry?.driverId) || normalizeId(entry?.driver_id);
      const driver = driverIndex.get(driverId) || {};
      deliveries.assignments[orderId] = {
        ...(deliveries.assignments[orderId] || {}),
        driverId,
        driverName: entry?.driverName || driver?.name || driverId || '',
        driverPhone: entry?.driverPhone || driver?.phone || '',
        vehicleId: entry?.vehicleId || driver?.vehicleId || '',
        status: (normalizeId(entry?.status) || 'pending').toLowerCase(),
        assignedAt: entry?.assignedAt || entry?.createdAt || null,
        deliveredAt: entry?.deliveredAt || null,
        updatedAt: entry?.updatedAt || null
      };
    });

    const channelSource =
      posPayload?.settings?.sync?.channel ||
      posPayload?.sync?.channel ||
      posPayload?.branch?.channel ||
      watcherState.channel ||
      BRANCH_CHANNEL;
    const channel = normalizeChannelName(channelSource, BRANCH_CHANNEL);
    watcherState.channel = channel;

    const payload = {
      jobOrders: {
        headers: jobHeaders,
        details: jobDetails,
        modifiers: [],
        statusHistory: [],
        expoPassTickets: ensureArray(
          posPayload?.kds?.expoPassTickets || posPayload?.expo_pass_tickets
        )
      },
      master: {
        stations,
        stationCategoryRoutes,
        kitchenSections,
        categorySections,
        categories,
        items,
        drivers,
        metadata: posPayload?.metadata || posPayload?.settings || {},
        sync: { ...(posPayload?.settings?.sync || {}), channel },
        channel
      },
      deliveries,
      handoff,
      drivers,
      meta: posPayload?.meta || posPayload?.settings || {},
      branch: posPayload?.branch || {}
    };
    const payloadSummary = summarizeJobPayload(payload);
    const counts = payloadSummary?.counts || {};
    lastWatcherSnapshot = {
      source:'watcher',
      generatedAt: new Date().toISOString(),
      status: watcherState.status,
      channel,
      watcher:{
        headers: ensureArray(watcherState.headers).length,
        lines: ensureArray(watcherState.lines).length,
        deliveries: ensureArray(watcherState.deliveries).length
      },
      payload: payloadSummary
    };
    const label = `[Mishkah][KDS][Watcher] payload → headers:${counts.headers ?? 0} details:${counts.details ?? 0} sections:${counts.kitchenSections ?? counts.stations ?? 0}`;
    logDebugGroup(label, lastWatcherSnapshot);
    return payload;
  };

  const updateFromWatchers = () => {
    const payload = buildWatcherPayload();
    if (!payload || !payload.jobOrders) return;
    applyRemoteOrder(app, payload, { channel: watcherState.channel || BRANCH_CHANNEL });
    const posPayload = watcherState.posPayload || {};
    const lang = posPayload?.settings?.lang || initialState.env.lang || 'ar';
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    app.setState((state) => {
      const syncBase = state.data?.sync || {};
      const sync = {
        ...syncBase,
        channel: watcherState.channel || BRANCH_CHANNEL,
        state: watcherState.status,
        lastMessage: Date.now()
      };
      return {
        ...state,
        env: { ...(state.env || {}), lang, dir },
        data: {
          ...state.data,
          sync,
          meta: {
          ...(state.data.meta || {}),
          ...(posPayload?.metadata || {}),
          ...(posPayload?.settings || {})
        },
          branch: payload.branch || state.data.branch || {}
        }
      };
    });
    if (typeof window !== 'undefined') {
      window.database = watcherState.posPayload || {};
      window.MishkahBranchChannel = watcherState.channel || BRANCH_CHANNEL;
      window.MishkahKdsChannel = window.MishkahBranchChannel;
    }
  };

  if (store && typeof store.watch === 'function') {
    watcherUnsubscribers.push(
      store.status((status) => {
        watcherState.status =
          typeof status === 'string' ? status : status?.status || 'idle';
        updateFromWatchers();
      })
    );
    watcherUnsubscribers.push(
      store.watch('pos_database', (rows) => {
        const latest =
          Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
        watcherState.posPayload =
          (latest && latest.payload) || {};
        console.log('[KDS][WATCH][pos_database]', { count:(rows||[]).length, hasPayload:!!(latest&&latest.payload), keys: latest && latest.payload ? Object.keys(latest.payload) : [] });
        updateFromWatchers();
      })
    );
    watcherUnsubscribers.push(
      store.watch('order_header', (rows) => {
        watcherState.headers = ensureArray(rows);
        console.log('[KDS][WATCH][order_header]', { count: watcherState.headers.length, sample: watcherState.headers[0] || null });
        updateFromWatchers();
      })
    );
    watcherUnsubscribers.push(
      store.watch('order_line', (rows) => {
        watcherState.lines = ensureArray(rows);
        console.log('[KDS][WATCH][order_line]', { count: watcherState.lines.length, sample: watcherState.lines[0] || null });
        updateFromWatchers();
      })
    );
    watcherUnsubscribers.push(
      store.watch('order_delivery', (rows) => {
        watcherState.deliveries = ensureArray(rows);
        console.log('[KDS][WATCH][order_delivery]', { count: watcherState.deliveries.length, sample: watcherState.deliveries[0] || null });
        updateFromWatchers();
      })
    );
  } else if (!store || typeof store.watch !== 'function') {
    console.warn(
      '[Mishkah][KDS] POS dataset store unavailable. Live updates are disabled.'
    );
    
    const checkStoreReady = () => {
      if (window.__POS_DB__) {
        store = window.__POS_DB__;
        if (store && typeof store.watch === 'function') {
          watcherUnsubscribers.push(
            store.status((status) => {
              watcherState.status =
                typeof status === 'string' ? status : status?.status || 'idle';
              updateFromWatchers();
            })
          );
          watcherUnsubscribers.push(
            store.watch('pos_database', (rows) => {
              const latest =
                Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
              watcherState.posPayload =
                (latest && latest.payload) || {};
              console.log('[KDS][WATCH][pos_database]', { count:(rows||[]).length, hasPayload:!!(latest&&latest.payload), keys: latest && latest.payload ? Object.keys(latest.payload) : [] });
              updateFromWatchers();
            })
          );
          watcherUnsubscribers.push(
            store.watch('order_header', (rows) => {
              watcherState.headers = ensureArray(rows);
              console.log('[KDS][WATCH][order_header]', { count: watcherState.headers.length, sample: watcherState.headers[0] || null });
              updateFromWatchers();
            })
          );
          watcherUnsubscribers.push(
            store.watch('order_line', (rows) => {
              watcherState.lines = ensureArray(rows);
              console.log('[KDS][WATCH][order_line]', { count: watcherState.lines.length, sample: watcherState.lines[0] || null });
              updateFromWatchers();
            })
          );
          watcherUnsubscribers.push(
            store.watch('order_delivery', (rows) => {
              watcherState.deliveries = ensureArray(rows);
              console.log('[KDS][WATCH][order_delivery]', { count: watcherState.deliveries.length, sample: watcherState.deliveries[0] || null });
              updateFromWatchers();
            })
          );
          console.log('[Mishkah][KDS] POS dataset store now available. Live updates enabled.');
        }
      } else {
        setTimeout(checkStoreReady, 100);
      }
    };
    
    setTimeout(checkStoreReady, 100);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      watcherUnsubscribers.splice(0).forEach((unsub) => {
        try {
          if (typeof unsub === 'function') unsub();
        } catch (_err) {
          /* ignore */
        }
      });
    });
  }

  updateFromWatchers();

  app.setOrders(Object.assign({}, UI.orders || {}, auto.orders || {}, kdsOrders));
  logKdsOrdersRegistry();
  app.mount('#app');
  scheduleInteractiveSnapshot();
  setupKdsDevtools();

  const tick = setInterval(()=>{
    app.setState(state=>({
      ...state,
      data:{
        ...state.data,
        now: Date.now()
      }
    }));
  }, 1000);

  if(typeof window !== 'undefined'){
    window.addEventListener('beforeunload', ()=> clearInterval(tick));
  }
})();
