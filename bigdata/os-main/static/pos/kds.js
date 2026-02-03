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
        "ar": "تحت التجهيز",
        "en": "In Progress"
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
        "draft": {
          "ar": "مسودة",
          "en": "Draft"
        },
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
        "preparing": {
          "ar": "جاري التحضير",
          "en": "Preparing"
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
        "served": {
          "ar": "مُقدّم",
          "en": "Served"
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
      "paymentTitle": {
        "ar": "تسوية التحصيل",
        "en": "Payment Settlement"
      },
      "paymentDescription": {
        "ar": "اختر وسيلة الدفع لتسجيل التحصيل",
        "en": "Select payment method to record settlement"
      },
      "paymentConfirm": {
        "ar": "تأكيد التسوية",
        "en": "Confirm Settlement"
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
    const master = payload.master || {};
    // ✅ Flat structure: read job order tables directly from payload root
    const headers = Array.isArray(payload.job_order_header) ? payload.job_order_header : [];
    const details = Array.isArray(payload.job_order_detail) ? payload.job_order_detail : [];
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
    if(typeof console === 'undefined' || 1==1) return;
    try{
      if(typeof console.groupCollapsed === 'function'){
        console.groupCollapsed(label);
        if(details && typeof details === 'object'){
          Object.keys(details).forEach(key=>{
            //console.log(`${key}:`, details[key]);
          });
        } else {
          //console.log(details);
        }
        console.groupEnd();
      } else {
        //console.log(label, details);
      }
    } catch(_err){
      try{ //console.log(label, details);
      // 
      } catch(__err){ /* ignore */ }
    }
  };

  let lastWatcherSnapshot = null;
  let lastStateSnapshot = null;

  // ✅ Build orders from order_header + order_line (for static tabs: prep, expo, handoff)
  const buildOrdersFromHeaders = (db)=>{
    const orderHeaders = Array.isArray(db?.data?.orderHeaders) ? db.data.orderHeaders : [];
    const orderLines = Array.isArray(db?.data?.orderLines) ? db.data.orderLines : [];
    const jobOrderDetails = Array.isArray(db?.data?.jobOrderDetails) ? db.data.jobOrderDetails : [];
    const handoff = db?.data?.handoff || {};
    const stationMap = db?.data?.stationMap || {};
    const menuIndex = db?.data?.menuIndex || {};

    // Removed verbose logging - only log status changes for assembled/served orders

    // ✅ Create lookup map: orderId:itemId -> job_order_detail for derived status
    const jobStatusMap = new Map();
    jobOrderDetails.forEach(detail => {
      // Extract orderId from jobOrderId format: "DAR-001001-{stationId}"
      // stationId is UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (5 dash-separated parts)
      let orderId = detail.orderId || detail.order_id;
      if (!orderId) {
        const jobId = String(detail.jobOrderId || detail.job_order_id || '');
        // Split and remove last 5 parts (UUID)
        // Example: "DAR-001001-1e7a48ec-425a-4268-81db-c8f3fd4d432e"
        // → ["DAR", "001001", "1e7a48ec", "425a", "4268", "81db", "c8f3fd4d432e"]
        // → Remove last 5 → ["DAR", "001001"] → "DAR-001001"
        const parts = jobId.split('-');
        if (parts.length >= 6) {
          orderId = parts.slice(0, -5).join('-');
        } else {
          orderId = jobId; // Fallback if format is unexpected
        }
      }

      const itemId = detail.itemId || detail.item_id;
      if (orderId && itemId) {
        const key = `${orderId}:${itemId}`;
        jobStatusMap.set(key, detail);
      }
    });

    // Removed verbose logging for jobStatusMap

    // Group lines by orderId
    const linesByOrder = new Map();
    orderLines.forEach(line => {
      if (!line || !line.orderId) return;
      const orderId = String(line.orderId);
      if (!linesByOrder.has(orderId)) {
        linesByOrder.set(orderId, []);
      }
      linesByOrder.get(orderId).push(line);
    });

    return orderHeaders.map(header => {
      const orderId = String(header.id);
      const lines = linesByOrder.get(orderId) || [];

      const orderKey = normalizeOrderKey(orderId);
      let record = (orderKey && (handoff[orderKey] || handoff[orderId])) || {};

      // Build detail rows from order_line
      const detailRows = lines.map(line => {
        const station = stationMap[line.kitchenSectionId || line.kitchen_section_id] || {};
        const stationLabelAr = station.nameAr || line.kitchenSectionId || 'غير محدد';
        const stationLabelEn = station.nameEn || line.kitchenSectionId || 'Unassigned';
        const menuItem = line.itemId ? menuIndex[String(line.itemId)] : null;

        // ✅ Derived status: check if job_order_detail for this item is ready
        const lookupKey = `${orderId}:${line.itemId}`;
        const jobDetail = jobStatusMap.get(lookupKey);
        const derivedStatus = jobDetail?.status || line.status || 'draft';

        // Removed verbose logging for derived status

        return {
          detail: {
            id: line.id,
            itemId: line.itemId,
            itemNameAr: line.name || menuItem?.nameAr || line.itemId || stationLabelAr,
            itemNameEn: line.name || menuItem?.nameEn || line.itemId || stationLabelEn,
            quantity: Number(line.qty) || 1,
            status: derivedStatus,  // ✅ Use derived status from job_order_detail
            prepNotes: (() => {
              // ✅ FIXED: Handle notes properly to avoid [object object]
              const notes = line.notes;
              if(!notes) return '';
              if(Array.isArray(notes)) return notes.filter(Boolean).map(n => {
                if(typeof n === 'string') return n;
                if(typeof n === 'object'){
                  if(n.message) return String(n.message);
                  if(n.text) return String(n.text);
                  if(n.note) return String(n.note);
                  if(n.content) return String(n.content);
                }
                return '';
              }).filter(Boolean).join('; ');
              if(typeof notes === 'string') return notes;
              return '';
            })(),
            modifiers: []
          },
          stationLabelAr,
          stationLabelEn
        };
      });

      // ✅ Calculate totals using derived status
      const totalItems = lines.reduce((sum, line) => sum + (Number(line.qty) || 1), 0);
      const readyItems = lines.filter(line => {
        const lookupKey = `${orderId}:${line.itemId}`;
        const jobDetail = jobStatusMap.get(lookupKey);
        const derivedStatus = jobDetail?.status || line.status || 'draft';
        return derivedStatus === 'ready' || derivedStatus === 'completed';
      }).reduce((sum, line) => sum + (Number(line.qty) || 1), 0);
      const pendingItems = totalItems - readyItems;

      // ✅ Calculate handoff status based on derived item statuses
      // Priority:
      // 1. order_header.statusId (database source of truth) - even if empty
      // 2. calculated from items - derived from job_order_detail
      // 3. handoff record (only for final stages) - UI actions
      let status;

      // Get statusId from header (check existence, not truthiness - empty string is valid!)
      const headerStatusId = (header.statusId !== null && header.statusId !== undefined)
        ? String(header.statusId).toLowerCase()
        : null;
      const recordStatus = record.status ? String(record.status).toLowerCase() : null;

      // If header has statusId in database (even if empty), prioritize it over stale handoff records
      if (headerStatusId !== null && headerStatusId !== 'null' && headerStatusId !== 'undefined') {
        // Empty string = new order -> calculate from items (ignore stale handoff record!)
        if (headerStatusId === '') {
          status = (totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending';
        }
        // Has value -> use it directly (database is source of truth)
        else {
          status = headerStatusId;
        }
      }
      // No header status in database -> fall back to handoff record (only final stages)
      else if (['assembled', 'served', 'delivered'].includes(recordStatus)) {
        status = recordStatus;
      }
      // Default -> calculate from items
      else {
        status = (totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending';
      }

      // Removed verbose logging for order status

      // ✅ Extract order header notes
      const headerNotes = (() => {
        const notes = header.notes;
        if(!notes) return '';
        if(Array.isArray(notes)) return notes.filter(Boolean).map(n => {
          if(typeof n === 'string') return n;
          if(typeof n === 'object'){
            if(n.message) return String(n.message);
            if(n.text) return String(n.text);
            if(n.note) return String(n.note);
            if(n.content) return String(n.content);
          }
          return '';
        }).filter(Boolean).join(' • ');
        if(typeof notes === 'string') return notes;
        return '';
      })();

      return {
        orderId,
        orderNumber: header.orderNumber || header.id,
        // ✅ Read serviceMode from metadata (where it actually exists in database)
        serviceMode: header.metadata?.serviceMode || header.metadata?.orderType || header.orderTypeId || header.serviceMode || header.type || 'dine_in',
        tableLabel: header.tableLabel || null,
        customerName: header.customerName || null,
        notes: headerNotes,  // ✅ Add order header notes
        handoffStatus: status,
        handoffRecord: record,
        totalItems,
        readyItems,
        pendingItems,
        detailRows,
        createdAt: header.createdAt,
        updatedAt: header.updatedAt
      };
    });
  };

  // ✅ NEW: Build orders from job_order_header for Expo/Handoff tabs
  // This replaces buildOrdersFromHeaders() to use job_order_header as single source of truth
  const buildOrdersFromJobHeaders = (db) => {

   // console.log(db);
    
    const jobHeaders = Array.isArray(db?.data?.jobHeaders) ? db.data.jobHeaders : [];
    const jobDetails = Array.isArray(db?.data?.jobOrderDetails) ? db.data.jobOrderDetails : [];
    let batches = Array.isArray(db?.data?.batches) ? db.data.batches : [];  // ✅ NEW: Get batches
    if (!batches.length && typeof window !== 'undefined') {
      const fallbackBatches = window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables?.job_order_batch;
      if (Array.isArray(fallbackBatches) && fallbackBatches.length) {
        batches = fallbackBatches;
      }
    }
    // ✅ CRITICAL FIX: Merge handoff from BOTH localStorage AND state
    // In WebSocket mode, state.data.handoff may not have assembled status yet
    // But localStorage (persistedHandoff) always has the latest status
    const handoff = {
      ...clonePersistedHandoff(),  // From localStorage (always up-to-date)
      ...(db?.data?.handoff || {})  // From state (may be stale in WebSocket mode)
    };
    const stationMap = db?.data?.stationMap || {};
    const menuIndex = db?.data?.menuIndex || {};

    if (!jobHeaders.length) {
      const fallbackHeaders = Array.isArray(db?.data?.orderHeaders) ? db.data.orderHeaders : [];
      const fallbackLines = Array.isArray(db?.data?.orderLines) ? db.data.orderLines : [];
      if (fallbackHeaders.length || fallbackLines.length) {
        return buildOrdersFromHeaders(db);
      }
    }

    // ✅ CRITICAL: Filter out DELIVERED/SETTLED batches (batch-based filtering!)
    // Batch status is one-way: queued → ready → assembled → served → delivered
    // Once delivered/settled, batch should NEVER appear again
    const batchMap = {};
    const batchByOrderId = {};
    batches.forEach(batch => {
      if (!batch) return;
      if (batch.id) batchMap[batch.id] = batch;
      const batchOrderId = batch.orderId || batch.order_id;
      if (batchOrderId && batch.id) {
        batchByOrderId[String(batchOrderId)] = batch.id;
      }
    });

    // ✅ CRITICAL: Filter jobHeaders based on batch.status (batch-based filtering!)
    // Only HIDE jobs that belong to DELIVERED/SETTLED batches
    // Show everything else (including jobs without batch for backwards compatibility)
    const activeJobHeaders = jobHeaders.filter(header => {
      const orderId = header.orderId || header.order_id || header.orderID;
      const derivedBatchId = header.batchId || header.batch_id || (orderId ? batchByOrderId[String(orderId)] : null);
//  console.log(jobHeaders); لا يحتوي batchId 
     // console.log(window.database.job_order_header); لا يحتوي batchId
  //   console.log(window.__POS_DB__.store.state.modules.pos.tables.job_order_header) //يحتوي على بيانات batchId
      // ✅ If no batchId → show job (backwards compatible, safety)
      if (!derivedBatchId || derivedBatchId === 'no-batch') return true;

      // ✅ Check if batch exists
      const batch = batchMap[derivedBatchId];

      // ✅ If batch is missing, keep the job visible (backwards compatible)
      if (!batch) return true;

      // ✅ If batch exists → check status
      const status = batch.status;

      if (status === 'settled') {
        return false;
      }

      return status !== 'settled';
    });

    // ✅ Group job_order_header by batchId ONLY (for static tabs)
    // All jobs from same save operation → one ticket
    const jobsByBatch = new Map();
    activeJobHeaders.forEach(header => {
      const orderId = header.orderId || header.order_id || header.orderID || header.orderId;
      const derivedBatchId = header.batchId || header.batch_id || (orderId ? batchByOrderId[String(orderId)] : null);
      const batchKey = derivedBatchId && derivedBatchId !== 'no-batch'
        ? derivedBatchId
        : (orderId ? `order-${orderId}` : null);
      if (!batchKey) return;

      if (!jobsByBatch.has(batchKey)) {
        jobsByBatch.set(batchKey, []);
      }
      jobsByBatch.get(batchKey).push(header);
    });

    // ✅ Build orders from grouped job_order_header (by batchId only)
    const orders = [];
    jobsByBatch.forEach((headers, batchId) => {
      // Use first header for order-level info
      const firstHeader = headers[0];
      const orderId = firstHeader.orderId || firstHeader.order_id || firstHeader.orderID || firstHeader.id;
      const resolvedBatchId = (batchId && batchId.startsWith('order-') && orderId)
        ? (batchByOrderId[String(orderId)] || batchId)
        : batchId;
      const orderKey = normalizeOrderKey(orderId);
      let record = (orderKey && (handoff[orderKey] || handoff[orderId])) || {};

      let totalItems = 0;
      let readyItems = 0;
      const detailRows = [];
      const jobs = [];

      // ✅ Process each job_order_header
      headers.forEach(header => {
        const jobOrderId = header.id;
        const stationId = header.stationId || header.station_id;
        const station = stationMap[stationId] || {};

        // Get details for this job
        const details = jobDetails.filter(d => {
          const detailJobId = d.jobOrderId || d.job_order_id;
          return detailJobId === jobOrderId;
        });

        // Build job object
        const job = {
          id: jobOrderId,
          stationId: stationId,
          status: header.status || 'queued',
          progressState: header.progressState || header.progress_state,
          details: details.map(detail => {
            const itemId = detail.itemId || detail.item_id;
            const menuItem = menuIndex[itemId];
            const quantity = Number(detail.quantity) || 1;
            const itemStatus = detail.status || 'queued';

            totalItems += quantity;
            if (itemStatus === 'ready' || itemStatus === 'completed') {
              readyItems += quantity;
            }

            const detailObj = {
              id: detail.id,
              itemId: itemId,
              itemNameAr: detail.itemNameAr || detail.item_name_ar ||
                         menuItem?.item_name?.ar || menuItem?.nameAr || itemId,
              itemNameEn: detail.itemNameEn || detail.item_name_en ||
                         menuItem?.item_name?.en || menuItem?.nameEn || itemId,
              quantity: quantity,
              status: itemStatus,
              prepNotes: detail.prepNotes || detail.prep_notes || detail.notes || '',
              modifiers: []
            };

            // Add to detailRows for display
            const stationLabelAr = station.nameAr || stationId || 'غير محدد';
            const stationLabelEn = station.nameEn || stationId || 'Unassigned';
            detailRows.push({
              detail: detailObj,
              stationLabelAr,
              stationLabelEn
            });

            return detailObj;
          })
        };

        jobs.push(job);
      });

      const pendingItems = totalItems - readyItems;

      // ✅ Get batch record for this order ticket
      const batch = batchMap[resolvedBatchId];

      // ✅ CRITICAL: Calculate handoff status from batch.status (NOT handoff[orderId]!)
      // Each batch has independent status - NEVER merge batches by orderId
      // batch.status: queued → ready → assembled → served → delivered (one-way only)
      let status = 'pending';  // default

      if (batch && batch.status) {
        // ✅ Use batch.status directly - this is the SINGLE SOURCE OF TRUTH!
        status = batch.status;
      } else if (record && record.status) {
        // ✅ If no batch exists, honor persisted handoff status
        status = record.status;
      } else {
        // ✅ Fallback: calculate from items (for backwards compatibility or if batch not found)
        status = (totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending';
      }

      // ✅ CRITICAL FIX: Use batch.createdAt for timer accuracy
      // Timer should start from batch creation time, not job creation time
      // This ensures timer always starts from zero for new additions
      const batchCreatedAt = batch ? (batch.createdAt || batch.created_at) : null;
      const fallbackCreatedAt = firstHeader.createdAt || firstHeader.created_at;
      const finalCreatedAt = batchCreatedAt || fallbackCreatedAt;

      // ✅ CRITICAL FIX: Keep FULL orderId for database operations!
      // Extract short ID ONLY for display purposes
      const shortOrderId = extractBaseOrderId(orderId);

      orders.push({
        orderId,  // ✅ FULL ID for database lookups/updates
        shortOrderId,  // ✅ Short ID for display only (e.g., "DAR-001001")
        batchId: resolvedBatchId,  // ✅ Track which batch this order ticket represents
        batchType: batch ? (batch.batchType || batch.batch_type || 'initial') : 'initial',  // ✅ Track batch type
        orderNumber: firstHeader.orderNumber || firstHeader.order_number || shortOrderId,
        serviceMode: firstHeader.serviceMode || firstHeader.service_mode || 'dine_in',
        tableLabel: firstHeader.tableLabel || firstHeader.table_label || null,
        customerName: firstHeader.customerName || firstHeader.customer_name || null,
        notes: firstHeader.notes || '',
        handoffStatus: status,
        handoffRecord: record,
        totalItems,
        readyItems,
        pendingItems,
        detailRows,
        jobs,
        jobCount: headers.length,  // ✅ Number of jobs (stations) in this batch
        createdAt: finalCreatedAt,  // ✅ Use batch.createdAt (more accurate)
        updatedAt: firstHeader.updatedAt || firstHeader.updated_at,
        createdMs: parseTime(finalCreatedAt)  // ✅ Parse batch.createdAt
      });
    });

    return orders;
  };

  /**
   * ✅ Build batch cards with progress tracking
   * Shows each batch as a card with:
   * - Batch header (order number, table, status)
   * - Progress bar (readyJobs / totalJobs)
   * - List of jobs grouped by station
   *
   * @param {Object} db - Database snapshot with batches, headers, details
   * @returns {Array} Array of batch card objects
   */
  const buildBatchCards = (db) => {
    const batches = Array.isArray(db?.data?.batches) ? db.data.batches : [];
    const jobHeaders = Array.isArray(db?.data?.jobHeaders) ? db.data.jobHeaders : [];
    const jobDetails = Array.isArray(db?.data?.jobOrderDetails) ? db.data.jobOrderDetails : [];
    const stationMap = db?.data?.stationMap || {};
    const menuIndex = db?.data?.menuIndex || {};

    if (batches.length === 0) {
      // Fallback: if no batches, return empty (or could use buildOrdersFromJobHeaders)
      return [];
    }

    const batchCards = batches.map(batch => {
      const batchId = batch.id;

      // Get all jobs for this batch
      const batchJobs = jobHeaders.filter(h =>
        String(h.batchId || h.batch_id) === String(batchId)
      );

      // Compute batch status from jobs
      const batchInfo = computeBatchStatus(batchJobs);

      // Build job details
      const jobs = batchJobs.map(header => {
        const jobOrderId = header.id;
        const stationId = header.stationId || header.station_id;
        const station = stationMap[stationId] || {};

        // Get details for this job
        const details = jobDetails.filter(d => {
          const detailJobId = d.jobOrderId || d.job_order_id;
          return detailJobId === jobOrderId;
        });

        return {
          id: jobOrderId,
          stationId: stationId,
          stationNameAr: station.nameAr || stationId || 'غير محدد',
          stationNameEn: station.nameEn || stationId || 'Unassigned',
          status: header.status || 'queued',
          progressState: header.progressState || header.progress_state,
          itemCount: details.length,
          details: details.map(detail => {
            const itemId = detail.itemId || detail.item_id;
            const menuItem = menuIndex[itemId];

            return {
              id: detail.id,
              itemId: itemId,
              itemNameAr: detail.itemNameAr || detail.item_name_ar ||
                         menuItem?.item_name?.ar || menuItem?.nameAr || itemId,
              itemNameEn: detail.itemNameEn || detail.item_name_en ||
                         menuItem?.item_name?.en || menuItem?.nameEn || itemId,
              quantity: Number(detail.quantity) || 1,
              status: detail.status || 'queued',
              prepNotes: detail.prepNotes || detail.prep_notes || detail.notes || ''
            };
          })
        };
      });

      // Build batch card
      return {
        batchId: batchId,
        orderId: batch.orderId,
        orderNumber: batch.orderNumber,
        batchType: batch.batchType,  // 'initial' or 'addition'

        // Batch status (computed from jobs)
        status: batchInfo.status,
        progress: batchInfo.progress,
        totalJobs: batchInfo.totalJobs,
        readyJobs: batchInfo.readyJobs,
        cookingJobs: batchInfo.cookingJobs,
        queuedJobs: batchInfo.queuedJobs,

        // Display info
        tableLabel: batch.meta?.tableLabel || null,
        serviceMode: batch.meta?.orderType || 'dine_in',

        // Timestamps
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        assembledAt: batch.assembledAt,
        servedAt: batch.servedAt,

        // Jobs list
        jobs: jobs,

        // Helper for UI
        progressPercent: batchInfo.progress,
        statusLabel: getStatusLabel(batchInfo.status),
        statusColor: getStatusColor(batchInfo.status)
      };
    });

    // Sort by creation time (newest first)
    return batchCards.sort((a, b) => {
      const aTime = parseTime(a.createdAt) || 0;
      const bTime = parseTime(b.createdAt) || 0;
      return bTime - aTime;
    });
  };

  /**
   * ✅ Get status label in Arabic/English
   */
  const getStatusLabel = (status) => {
    const labels = {
      'queued': { ar: 'قيد الانتظار', en: 'Queued' },
      'cooking': { ar: 'جاري التجهيز', en: 'Cooking' },
      'ready': { ar: 'جاهز', en: 'Ready' },
      'assembled': { ar: 'تم التجميع', en: 'Assembled' },
      'served': { ar: 'تم التسليم', en: 'Served' }
    };
    return labels[status] || { ar: status, en: status };
  };

  /**
   * ✅ Get status color for UI
   */
  const getStatusColor = (status) => {
    const colors = {
      'queued': '#9CA3AF',      // Gray
      'cooking': '#F59E0B',     // Amber
      'ready': '#10B981',       // Green
      'assembled': '#3B82F6',   // Blue
      'served': '#6B7280'       // Gray (done)
    };
    return colors[status] || '#9CA3AF';
  };

  /**
   * ✅ Render progress bar component
   * Returns HTML string for progress bar
   *
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} color - Bar color (hex)
   * @param {string} label - Label text (e.g., "2/3")
   * @returns {string} HTML string
   */
  const renderProgressBar = (progress, color, label) => {
    const progressPercent = Math.max(0, Math.min(100, progress || 0));
    const barWidth = `${progressPercent}%`;

    return `
      <div class="batch-progress-container" style="width: 100%; background: #E5E7EB; border-radius: 8px; overflow: hidden; height: 24px; position: relative;">
        <div class="batch-progress-bar" style="
          width: ${barWidth};
          height: 100%;
          background: ${color};
          transition: width 0.3s ease;
          border-radius: 8px;
        "></div>
        <div class="batch-progress-label" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 12px;
          font-weight: 600;
          color: #1F2937;
        ">
          ${label}
        </div>
      </div>
    `;
  };

  /**
   * ✅ Render batch card component
   * Returns HTML string for a batch card
   *
   * @param {Object} batchCard - Batch card data from buildBatchCards()
   * @param {string} lang - Language ('ar' or 'en')
   * @returns {string} HTML string
   */
  const renderBatchCard = (batchCard, lang = 'ar') => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const statusLabel = lang === 'ar' ? batchCard.statusLabel.ar : batchCard.statusLabel.en;
    const progressLabel = `${batchCard.readyJobs}/${batchCard.totalJobs}`;

    // Build jobs list HTML
    const jobsHtml = batchCard.jobs.map(job => {
      const stationName = lang === 'ar' ? job.stationNameAr : job.stationNameEn;
      const statusIcon = job.status === 'in_progress' ? '🔥' :
                        job.status === 'ready' ? '✅' : '⏳';

      const itemsHtml = job.details.map(detail => {
        const itemName = lang === 'ar' ? detail.itemNameAr : detail.itemNameEn;
        return `
          <div style="padding: 4px 0; font-size: 14px;">
            <span>${itemName}</span>
            <span style="color: #6B7280;"> × ${detail.quantity}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="batch-job" style="
          padding: 12px;
          background: #F9FAFB;
          border-radius: 8px;
          margin-bottom: 8px;
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #111827;">
              ${statusIcon} ${stationName}
            </span>
            <span style="font-size: 12px; color: #6B7280;">
              ${job.itemCount} ${lang === 'ar' ? 'أصناف' : 'items'}
            </span>
          </div>
          ${itemsHtml}
        </div>
      `;
    }).join('');

    const batchTypeLabel = batchCard.batchType === 'addition'
      ? (lang === 'ar' ? '(زيادة)' : '(Addition)')
      : '';

    return `
      <div class="batch-card" style="
        background: white;
        border: 2px solid ${batchCard.statusColor};
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      " dir="${dir}">
        <!-- Header -->
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #E5E7EB;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">
              📦 ${batchCard.orderNumber} ${batchTypeLabel}
            </h3>
            <span style="
              background: ${batchCard.statusColor};
              color: white;
              padding: 4px 12px;
              border-radius: 16px;
              font-size: 12px;
              font-weight: 600;
            ">
              ${statusLabel}
            </span>
          </div>
          ${batchCard.tableLabel ? `
            <div style="margin-top: 4px; font-size: 14px; color: #6B7280;">
              ${batchCard.tableLabel}
            </div>
          ` : ''}
        </div>

        <!-- Progress Bar -->
        <div style="margin-bottom: 16px;">
          ${renderProgressBar(batchCard.progressPercent, batchCard.statusColor, progressLabel)}
        </div>

        <!-- Jobs List -->
        <div class="batch-jobs-list">
          ${jobsHtml}
        </div>
      </div>
    `;
  };

  // ✅ Build orders from job_orders (for dynamic kitchen section tabs)
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
    // ✅ NEW: Use job_order_header as single source of truth
    const snapshot = buildOrdersFromJobHeaders(db)
      .filter(order=>{
        if(!order) return false;
        const status = order.handoffStatus;
        // ✅ Show in expo: ALL orders (pending + ready) EXCEPT assembled/served/delivered/settled
        // Orders appear here immediately when created
        // Orders stay until "تم التجميع" is pressed → 'assembled'
        // This shows ALL active orders being prepared across all sections
        return status !== 'assembled' && status !== 'served' && status !== 'delivered' && status !== 'settled';
      });
    const orderMap = new Map();
    snapshot.forEach(order=>{
      // ✅ CRITICAL FIX: Use batchId as key instead of orderId!
      // Multiple batches can have same orderId (initial + additions)
      // Using orderId would merge different batches into one card!
      const key = order.batchId || normalizeOrderKey(order.orderId || order.id);
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

  const getHandoffOrders = (db)=> {
    const deliveriesState = db.data?.deliveries || {};
    const settlements = deliveriesState.settlements || {};
    return buildOrdersFromJobHeaders(db)
      .filter(order=>{
        if(!order) return false;
        const status = order.handoffStatus;
        if(status !== 'assembled') return false;
        const serviceMode = (order.serviceMode || 'dine_in').toLowerCase();
        return serviceMode !== 'delivery';
      })
      .filter(order=>{
        const settlement = settlements[order.batchId];
        if(settlement && settlement.status === 'settled') return false;
        return true;
      });
  };

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
    // Support both canonical names and aliases
    const headers = Array.isArray(jobOrders.job_order_header) ? jobOrders.job_order_header
                  : Array.isArray(jobOrders.headers) ? jobOrders.headers : [];
    const details = Array.isArray(jobOrders.job_order_detail) ? jobOrders.job_order_detail
                  : Array.isArray(jobOrders.details) ? jobOrders.details : [];
    const modifiers = Array.isArray(jobOrders.job_order_detail_modifier) ? jobOrders.job_order_detail_modifier
                    : Array.isArray(jobOrders.modifiers) ? jobOrders.modifiers : [];
    const history = Array.isArray(jobOrders.job_order_status_history) ? jobOrders.job_order_status_history
                  : Array.isArray(jobOrders.statusHistory) ? jobOrders.statusHistory : [];

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

    // ✅ Dynamic tabs: Each job_order_header is SEPARATE (NO batch grouping)
    return headers.map(header=>{
      const cloned = { ...header };

      // Each job gets its own details/history
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

      cloned.createdMs = parseTime(cloned.createdAt || cloned.created_at);
      cloned.acceptedMs = parseTime(cloned.acceptedAt || cloned.accepted_at);

      // ✅ CRITICAL FIX: Don't use startedAt if status is 'queued' or 'awaiting'
      // This fixes old job_order_header that had startedAt=createdAt by mistake
      const currentStatus = String(cloned.status || '').toLowerCase();
      const currentProgressState = String(cloned.progressState || cloned.progress_state || '').toLowerCase();
      const isQueued = currentStatus === 'queued' || currentProgressState === 'awaiting';

      if (isQueued) {
        // ✅ If queued, clear startedAt/readyAt/completedAt (should not exist yet)
        cloned.startedAt = null;
        cloned.startMs = null;
        cloned.readyAt = null;
        cloned.readyMs = null;
        cloned.completedAt = null;
        cloned.completedMs = null;
      } else {
        // ✅ Try both camelCase and snake_case
        cloned.startMs = parseTime(cloned.startedAt || cloned.started_at);
        cloned.readyMs = parseTime(cloned.readyAt || cloned.ready_at);
        cloned.completedMs = parseTime(cloned.completedAt || cloned.completed_at);

        // ✅ Normalize startedAt to always use camelCase
        if(!cloned.startedAt && cloned.started_at) {
          cloned.startedAt = cloned.started_at;
        }
      }

      cloned.updatedMs = parseTime(cloned.updatedAt || cloned.updated_at);
      cloned.dueMs = parseTime(cloned.dueAt || cloned.due_at);

      // ✅ If header status is NOT in_progress/ready/completed but ANY detail is in_progress,
      // calculate startMs and update header status from first in_progress detail
      // This ensures timer works even after page reload
      // ✅ Reuse currentStatus from above (line 1760)
      const shouldCheckDetails = currentStatus !== 'in_progress' &&
                                currentStatus !== 'ready' &&
                                currentStatus !== 'completed';

      if(shouldCheckDetails) {
        const inProgressDetails = cloned.details.filter(d => {
          const detailStatus = String(d.status || '').toLowerCase();
          return detailStatus === 'in_progress';
        });

        if(inProgressDetails.length > 0) {
          // Find earliest start time from in_progress details
          // Try multiple property names: startAt, startedAt, start_at, started_at
          const startTimes = inProgressDetails
            .map(d => d.startAt || d.startedAt || d.start_at || d.started_at)
            .filter(Boolean)
            .sort();

          const earliestStartAt = startTimes[0];
          if(earliestStartAt) {
            const calculatedStartMs = parseTime(earliestStartAt);
            if(calculatedStartMs) {
              cloned.status = 'in_progress';
              cloned.progressState = 'cooking';
              cloned.startedAt = earliestStartAt;
              cloned.startMs = calculatedStartMs;
            }
          }
        }
      }

      return cloned;
    });
  };

  const indexJobs = (jobsList)=>{
    // ✅ Filter out jobs without details (these are incomplete/stale jobs)
    const validJobs = Array.isArray(jobsList)
      ? jobsList.filter(job => {
          const hasDetails = Array.isArray(job.details) && job.details.length > 0;
          return hasDetails;
        })
      : [];

    // ✅ CRITICAL FIX: DON'T filter by progressState='completed' here!
    // Jobs with progressState='completed' should STAY visible in Assembly/Handoff
    // until the order is assembled/served. Each view (dynamic tabs, expo, handoff)
    // will apply its own filtering based on needs.
    // Dynamic station tabs will filter out completed jobs in their own render logic.
    const activeJobs = validJobs;

    const list = activeJobs.slice();
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

  const buildStations = (database, kdsSource, masterSource={})=>{    const explicitStations = Array.isArray(kdsSource?.stations) && kdsSource.stations.length
      ? kdsSource.stations.map(station=> ({ ...station }))
      : [];
    if(explicitStations.length) {      return explicitStations;
    }

    const masterStations = Array.isArray(masterSource?.stations) && masterSource.stations.length
      ? masterSource.stations.map(station=> ({ ...station }))
      : [];
    if(masterStations.length) {      return masterStations;
    }

    const sectionSource = (Array.isArray(database?.kitchen_sections) && database.kitchen_sections.length)
      ? database.kitchen_sections
      : (Array.isArray(masterSource?.kitchenSections) ? masterSource.kitchenSections : []);
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
      if(idx === 0){      }
      return station;
    });    return result;
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
        nameAr: item.item_name?.ar || item.nameAr || item.itemNameAr || item.name?.ar || item.name || '',
        nameEn: item.item_name?.en || item.nameEn || item.itemNameEn || item.name?.en || item.name || '',
        description: item.description || item.itemDescription || '',
        price: Number(item.price) || 0
      };
      if(code){
        index[String(code)] = index[id];
      }
    });
    return index;
  };

  // ✅ Helper function to get all completed order IDs (to hide from stations)
  const getCompletedOrderIds = (db)=>{
    const completedOrderIds = new Set();

    // 1. Get orders that are assembled/served/delivered from order_header
    const completedOrders = buildOrdersFromJobHeaders(db)
      .filter(order=> {
        const status = order.handoffStatus;
        return status === 'assembled' || status === 'served' || status === 'delivered';
      });

    // 2. Get settled delivery orders
    const deliveriesState = db.data.deliveries || {};
    const settlements = deliveriesState.settlements || {};

    const settledDeliveryOrders = buildOrdersFromJobHeaders(db)
      .filter(order=> {
        const isDelivery = (order.serviceMode || 'dine_in').toLowerCase() === 'delivery';
        if(!isDelivery) return false;

        // ✅ BATCH-BASED: كل order card يمثل batch واحد
        const settlement = settlements[order.batchId];
        const isSettled = settlement && settlement.status === 'settled';

        return isSettled;
      });

    // Add all completed order IDs with normalization
    [...completedOrders, ...settledDeliveryOrders].forEach(order => {
      const rawId = order.orderId || order.id;
      if (!rawId) return;

      const normalizedId = normalizeOrderKey(rawId);
      if (normalizedId) {
        completedOrderIds.add(normalizedId);
      }
      completedOrderIds.add(String(rawId));
    });

    return completedOrderIds;
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

    // ✅ Get all completed order IDs (assembled/served/delivered/settled)
    const completedOrderIds = getCompletedOrderIds(db);

    if(!locked){
      // ✅ Count orders that are NOT completed (same logic as renderPrepPanel)
      const prepOrders = buildOrdersFromJobHeaders(db).filter(order=> {
        const status = order.handoffStatus;
        return status !== 'assembled' && status !== 'served' && status !== 'delivered';
      });

      // ✅ Also exclude settled delivery orders
      const deliveriesState = db.data.deliveries || {};
      const settlements = deliveriesState.settlements || {};
      const prepCount = prepOrders.filter(order=> {
        const status = order.handoffStatus;
      return status !== 'assembled' && status !== 'served' && status !== 'delivered' && status !== 'settled';
      }).length;

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

      // ✅ Count unique orders (not jobs) in this station
      // Exclude orders that are assembled/served/delivered/settled
      const activeJobs = (jobs.byStation[station.id] || [])
        .filter(job=> job.status !== 'ready' && job.status !== 'completed')
        .filter(job=> {
          const normalizedJobOrderId = normalizeOrderKey(job.orderId);
          const stringJobOrderId = String(job.orderId);
          return !completedOrderIds.has(normalizedJobOrderId) && !completedOrderIds.has(stringJobOrderId);
        });

      // Group jobs by orderId to count unique orders
      const uniqueOrderIds = new Set(activeJobs.map(job => job.orderId));
      const tabCount = isExpoStation ? getExpoOrders(db).length : uniqueOrderIds.size;
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
    // ✅ Show orders that are assembled and ready for delivery
    // Status: assembled (جاهز للتوصيل)
    return buildOrdersFromJobHeaders(db)
      .filter(order=>{
        if(!order) return false;
        if(order.handoffStatus !== 'assembled') return false;
        if((order.serviceMode || 'dine_in').toLowerCase() !== 'delivery') return false;
        return true;
      })
      .map(order=> ({
        ...order,
        // ✅ BATCH-BASED: كل order card يمثل batch واحد
        assignment: assignments[order.batchId] || null,
        settlement: settlements[order.batchId] || null
      }))
      .filter(order=>{
        const settlement = order.settlement;
        if(settlement && settlement.status === 'settled') return false;
        return true;
      });
  };

  const getPendingDeliveryOrders = (db)=>{
    const deliveriesState = db.data.deliveries || {};
    const assignments = deliveriesState.assignments || {};
    const settlements = deliveriesState.settlements || {};
    // ✅ Show orders that have been delivered but not yet settled
    // Status: delivered (تم التوصيل - في انتظار التسوية)
    return buildOrdersFromJobHeaders(db)
      .filter(order=>{
        if(!order) return false;
        if((order.serviceMode || 'dine_in').toLowerCase() !== 'delivery') return false;
        // Show orders with status='delivered' (delivered but not settled)
        if(order.handoffStatus !== 'delivered') return false;
        return true;
      })
      .map(order=> ({
        ...order,
        // ✅ BATCH-BASED: كل order card يمثل batch واحد
        assignment: assignments[order.batchId] || null,
        settlement: settlements[order.batchId] || null
      }))
      .filter(order=>{
        // Hide settled orders
        const settlement = order.settlement;
        if(settlement && settlement.status === 'settled') return false;
        return true;
      });
  };

  const createBadge = (text, className)=> D.Text.Span({ attrs:{ class: cx(tw`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold`, className) } }, [text]);

  const renderEmpty = (message)=> D.Containers.Div({ attrs:{ class: tw`flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-slate-800/60 bg-slate-900/60 text-center text-slate-300` }}, [
    D.Text.Span({ attrs:{ class: tw`text-3xl` }}, ['🍽️']),
    D.Text.P({ attrs:{ class: tw`max-w-md text-sm leading-relaxed text-slate-400` }}, [message])
  ]);

  const renderHeader = (db, t)=>{
    // ✅ Calculate stats from orders (not job_orders)
    // Only count active orders (not assembled/served/delivered/settled)
    const allOrders = buildOrdersFromJobHeaders(db);
    const activeOrders = allOrders.filter(order => {
      const status = order.handoffStatus;
      return status !== 'assembled' && status !== 'served' && status !== 'delivered' && status !== 'settled';
    });

    const stats = {
      total: activeOrders.length,  // Count active orders
      pending: activeOrders.filter(o => o.handoffStatus === 'pending').length,
      ready: activeOrders.filter(o => o.handoffStatus === 'ready').length,
      expedite: 0,  // TODO: Add expedite flag to orders
      alerts: 0     // TODO: Add alerts flag to orders
    };

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
    const statusLabel = t.labels.jobStatus[detail.status] || detail.status || 'draft';
    // ✅ Fixed: Use optional chaining to prevent "undefined" from showing
    const stationText = lang === 'ar' ? (t.labels?.station?.ar || 'المحطة') : (t.labels?.station?.en || 'Station');
    // ✅ Only show station label if it's a valid non-empty string AND stationText is valid
    const hasValidStationLabel = stationLabel && typeof stationLabel === 'string' && stationLabel !== 'undefined' && stationLabel.trim().length > 0;
    const hasValidStationText = stationText && stationText !== 'undefined';
    return D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.Strong({ attrs:{ class: tw`text-base font-semibold leading-tight text-slate-100 sm:text-lg` }}, [`${detail.quantity}× ${lang === 'ar' ? (detail.itemNameAr || detail.itemNameEn || detail.itemId) : (detail.itemNameEn || detail.itemNameAr || detail.itemId)}`]),
        createBadge(statusLabel, STATUS_CLASS[detail.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      (hasValidStationLabel && hasValidStationText) ? createBadge(`${stationText}: ${stationLabel}`, tw`border-slate-600/40 bg-slate-800/70 text-slate-100`) : null,
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
      job.details && job.details.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, job.details.map(detail=> renderDetailRow(detail, t, lang, null))) : null,
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
    // ✅ Use job_order_header for static "prep/all" tab
    // Show ALL orders except those assembled/served/delivered/settled
    const allOrders = buildOrdersFromJobHeaders(db);

    const orders = allOrders.filter(order=> {
      const status = order.handoffStatus;
      // ✅ Show: pending (preparing), ready (waiting for assembly)
      // ❌ Hide: assembled, served, delivered (moved to handoff/done)
    //  //console.log(" ❌ Hide : order",order);
      if(status === 'assembled' || status === 'served' || status === 'delivered' || status =='settled') return false;

      // ✅ Also hide settled delivery orders (BATCH-BASED)
      if((order.serviceMode || 'dine_in').toLowerCase() === 'delivery') {
        const deliveriesState = db.data.deliveries || {};
        const settlements = deliveriesState.settlements || {};
        // ✅ كل order card يمثل batch واحد
        const settlement = settlements[order.batchId];
        if(settlement && settlement.status === 'settled') return false;
      }

      return true;
    });

    if(!orders.length) return renderEmpty(t.empty.prep);
    const stationMap = db.data.stationMap || {};
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=> {
      // ✅ Extract batch serial from batchId (for debugging)
      const batchSerial = order.batchId ? order.batchId.split('-').pop() : 'N/A';
      return D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber}`]),
          D.Text.P({ attrs:{ class: tw`text-xs text-amber-400 font-mono` }}, [`Batch: ${batchSerial} (${order.batchType || 'initial'})`])
        ]),
        createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${t.labels.serviceMode[order.serviceMode] || order.serviceMode}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`)
      ]),
      order.tableLabel ? createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`) : null,
      order.customerName ? D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [`${t.labels.customer}: ${order.customerName}`]) : null,
      order.notes ? D.Text.P({ attrs:{ class: tw`text-sm text-amber-200` }}, [`🧾 ${order.notes}`]) : null,  // ✅ Display order header notes
      // ✅ Display all order lines grouped by kitchen section
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, (order.detailRows || []).map(row=> {
        const stationLabel = lang === 'ar' ? row.stationLabelAr : row.stationLabelEn;
        return renderDetailRow(row.detail, t, lang, stationLabel);
      }))
    ].filter(Boolean));
    }));
  };

  const renderStationPanel = (db, stationId, t, lang, now)=>{
    // ✅ Use shared helper to get all completed order IDs
    const completedOrderIds = getCompletedOrderIds(db);

    const allJobsForStation = db.data.jobs.byStation[stationId] || [];

    const jobs = allJobsForStation
      // Hide jobs that are already ready/completed
      .filter(job=> {
        // ✅ Filter by status OR progressState
        const isCompleted = job.status === 'ready' ||
                           job.status === 'completed' ||
                           job.progressState === 'completed';

        return !isCompleted;
      })
      // Hide jobs whose order is assembled/served/delivered or settled (for delivery orders)
      .filter(job=> {
        // Try both raw and normalized order IDs
        const rawJobOrderId = job.orderId;
        const normalizedJobOrderId = normalizeOrderKey(rawJobOrderId);
        const stringJobOrderId = String(rawJobOrderId);

        const shouldHide = completedOrderIds.has(normalizedJobOrderId) ||
                          completedOrderIds.has(stringJobOrderId);

        return !shouldHide;
      });

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
      const actionSection = highlight && order.batchId
        ? D.Forms.Button({
            attrs:{
              type:'button',
              gkey:'kds:handoff:assembled',
              'data-batch-id': order.batchId,
              'data-order-id': order.orderId,
              class: tw`w-full rounded-full border border-emerald-300/70 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-50 shadow-lg shadow-emerald-900/30 hover:bg-emerald-500/30`
            }
          }, [t.actions.handoffComplete])
        : createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`);
      return D.Containers.Article({ attrs:{ class: cardClass }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber || order.shortOrderId || order.orderId}`]),
          createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
        order.notes ? D.Text.P({ attrs:{ class: tw`text-sm text-amber-200` }}, [`🧾 ${order.notes}`]) : null,  // ✅ Display order header notes
        D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
          D.Text.Span(null, [`${t.stats.ready}: ${order.readyItems || 0} / ${order.totalItems || 0}`]),
          D.Text.Span(null, [`${t.labels.timer}: ${formatDuration(elapsed)}`])
        ]),
        order.detailRows && order.detailRows.length
          ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
              const stationLabel = (lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn) || null;
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
    const isPendingSettlement = options.focusSettlement || statusKey === 'delivered';

    // ✅ حساب المبلغ المدفوع والمتبقي
    const totalAmount = order.totalAmount || order.total || order.totalDue || 0;
    const paidAmount = order.totalPaid || 0;
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    return D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber}`]),
        createBadge(statusLabel, DELIVERY_STATUS_CLASS[statusKey] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      order.handoffStatus ? createBadge(t.labels.handoffStatus[order.handoffStatus] || order.handoffStatus, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`) : null,
      order.tableLabel ? D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [`${t.labels.table}: ${order.tableLabel}`]) : null,

      // ✅ بيانات السائق (دائمًا ظاهرة)
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-sm text-slate-300` }}, [
        D.Text.Span(null, [`${t.labels.driver}: ${driverName}`]),
        D.Text.Span(null, [`${t.labels.driverPhone}: ${driverPhone}`]),
        assignment?.vehicleId ? D.Text.Span(null, [`🚗 ${assignment.vehicleId}`]) : null
      ].filter(Boolean)),

      // ✅ عرض المبلغ المحصل في معلقات الدليفري
      isPendingSettlement && totalAmount > 0
        ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-amber-700/60 bg-amber-900/20 p-3 text-sm` }}, [
            D.Containers.Div({ attrs:{ class: tw`flex items-center justify-between` }}, [
              D.Text.Span({ attrs:{ class: tw`text-slate-300` }}, [lang === 'ar' ? 'الإجمالي' : 'Total']),
              D.Text.Strong({ attrs:{ class: tw`text-lg text-amber-400` }}, [`${totalAmount.toFixed(2)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`])
            ]),
            paidAmount > 0
              ? D.Containers.Div({ attrs:{ class: tw`flex items-center justify-between` }}, [
                  D.Text.Span({ attrs:{ class: tw`text-slate-300` }}, [lang === 'ar' ? 'المحصل' : 'Paid']),
                  D.Text.Strong({ attrs:{ class: tw`text-emerald-400` }}, [`${paidAmount.toFixed(2)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`])
                ])
              : null,
            remainingAmount > 0
              ? D.Containers.Div({ attrs:{ class: tw`flex items-center justify-between` }}, [
                  D.Text.Span({ attrs:{ class: tw`text-slate-300` }}, [lang === 'ar' ? 'المتبقي' : 'Remaining']),
                  D.Text.Strong({ attrs:{ class: tw`text-red-400` }}, [`${remainingAmount.toFixed(2)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`])
                ])
              : null
          ].filter(Boolean))
        : null,

      // ✅ عرض الأصناف (detailRows)
      order.detailRows && order.detailRows.length
        ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
            const stationLabel = (lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn) || null;
            return renderDetailRow(entry.detail, t, lang, stationLabel);
          }))
        : null,

      // ❌ إخفاء jobs badges في delivery stage (غير مفيد - يعرض UUIDs)
      // في delivery stage، جميع المحطات انتهت بالفعل، المهم معلومات التوصيل فقط

      // ✅ الأزرار: إخفاء زر تعيين السائق في معلقات الدليفري
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2 pt-2` }}, [
        // ❌ إخفاء زر تعيين السائق في معلقات الدليفري
        !isPendingSettlement
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:assign', 'data-batch-id':order.batchId, 'data-order-id':order.shortOrderId, class: tw`flex-1 rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20` }}, [t.actions.assignDriver])
          : null,
        statusKey !== 'delivered' && statusKey !== 'settled' && !isPendingSettlement
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:complete', 'data-batch-id':order.batchId, 'data-order-id':order.shortOrderId, class: tw`flex-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20` }}, [t.actions.delivered])
          : null,
        isPendingSettlement
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:settle', 'data-batch-id':order.batchId, 'data-order-id':order.shortOrderId, class: tw`flex-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20` }}, [t.actions.settle])
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

      const actionButton = isAssembled && order.batchId
        ? D.Forms.Button({
            attrs:{
              type:'button',
              gkey:'kds:handoff:served',
              'data-batch-id': order.batchId,
              'data-order-id': order.orderId,
              class: tw`w-full rounded-full border border-sky-400/70 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30`
            }
          }, [t.actions.handoffServe])
        : null;

      return D.Containers.Article({ attrs:{ class: cardClass }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber || order.shortOrderId || order.orderId}`]),
          createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
        order.notes ? D.Text.P({ attrs:{ class: tw`text-sm text-amber-200` }}, [`🧾 ${order.notes}`]) : null,  // ✅ Display order header notes
        D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
          D.Text.Span(null, [`${t.stats.ready}: ${order.readyItems || 0} / ${order.totalItems || 0}`]),
          D.Text.Span(null, [`${t.labels.timer}: ${formatClock(order.handoffRecord?.assembledAt || order.createdAt, lang)}`])
        ]),
        order.detailRows && order.detailRows.length
          ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
              const stationLabel = (lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn) || null;
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
    const batchId = assignment.batchId;  // ✅ BATCH-BASED
    const orderId = assignment.orderId;  // For display only
    const drivers = Array.isArray(db.data.drivers) ? db.data.drivers : [];

    const order = (db.data.jobs.orders || []).find(o=> o.orderId === orderId);
    const subtitle = order ? `${t.labels.order} ${order.orderNumber}` : '';

    const driversList = drivers.length > 0
      ? drivers.map(driver=> D.Forms.Button({ attrs:{
          type:'button',
          gkey:'kds:delivery:select-driver',
          'data-batch-id': batchId,  // ✅ BATCH-BASED
          'data-driver-id': String(driver.id),
          class: tw`flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-start text-sm text-slate-100 hover:border-sky-400/60 hover:bg-sky-500/10`
        }}, [
          D.Containers.Div({ attrs:{ class: tw`flex flex-col` }}, [
            D.Text.Strong({ attrs:{ class: tw`text-sm` }}, [driver.name || driver.id]),
            driver.phone ? D.Text.Span({ attrs:{ class: tw`text-xs text-slate-300` }}, [driver.phone]) : null
          ].filter(Boolean)),
          D.Text.Span({ attrs:{ class: tw`text-base` }}, ['🚚'])
        ]))
      : [D.Text.P({ attrs:{ class: tw`text-center text-sm text-slate-400 py-8` }}, [
          lang === 'ar' ? 'لا يوجد سائقين متاحين' : 'No drivers available'
        ])];

    return UI.Modal({
      open,
      title: t.modal.driverTitle,
      description: subtitle || t.modal.driverDescription,
      content: D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-3` }}, [
        D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [t.modal.driverDescription]),
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, driversList),
        // ✅ زر لإضافة سائق جديد
        D.Forms.Button({ attrs:{
          type:'button',
          gkey:'kds:driver:manage',
          class: tw`mt-2 flex items-center justify-center gap-2 rounded-xl border border-emerald-600/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20`
        }}, [
          D.Text.Span({ attrs:{ class: tw`text-base` }}, ['➕']),
          D.Text.Span(null, [lang === 'ar' ? 'إدارة السائقين' : 'Manage Drivers'])
        ])
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

  const PaymentModal = (db, t, lang)=>{
    const open = db.ui?.modals?.payment || false;
    if(!open) return null;

    const settlement = db.ui?.paymentSettlement || {};
    const batchId = settlement.batchId;  // ✅ BATCH-BASED
    const orderId = settlement.orderId;  // For display only
    const orderAmount = settlement.amount || 0;

    // ✅ قراءة وسائل الدفع من posPayload
    const paymentMethods = Array.isArray(db.data.paymentMethods) ? db.data.paymentMethods : [];

    const order = buildOrdersFromJobHeaders(db).find(o => o.orderId === orderId || o.id === orderId);
    const subtitle = order ? `${t.labels.order} ${order.orderNumber || orderId}` : '';

    const methodsList = paymentMethods.filter(m => m.isActive !== false).length > 0
      ? paymentMethods
          .filter(m => m.isActive !== false)
          .map(method=> {
            const icon = method.icon || '💵';
            const nameAr = method.name?.ar || method.nameAr || method.id;
            const nameEn = method.name?.en || method.nameEn || method.id;
            const displayName = lang === 'ar' ? nameAr : nameEn;

            return D.Forms.Button({ attrs:{
              type:'button',
              gkey:'kds:payment:select',
              'data-batch-id': batchId,  // ✅ BATCH-BASED
              'data-payment-method-id': String(method.id),
              'data-payment-type': method.type || 'cash',
              class: tw`flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-start text-sm text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10`
            }}, [
              D.Containers.Div({ attrs:{ class: tw`flex items-center gap-3` }}, [
                D.Text.Span({ attrs:{ class: tw`text-2xl` }}, [icon]),
                D.Containers.Div({ attrs:{ class: tw`flex flex-col` }}, [
                  D.Text.Strong({ attrs:{ class: tw`text-sm` }}, [displayName]),
                  method.type ? D.Text.Span({ attrs:{ class: tw`text-xs text-slate-300` }}, [method.type]) : null
                ].filter(Boolean))
              ]),
              D.Text.Span({ attrs:{ class: tw`text-emerald-400` }}, ['✓'])
            ]);
          })
      : [D.Text.P({ attrs:{ class: tw`text-center text-sm text-slate-400 py-8` }}, [
          lang === 'ar' ? 'لا توجد وسائل دفع متاحة' : 'No payment methods available'
        ])];

    return UI.Modal({
      open,
      title: t.modal.paymentTitle,
      description: subtitle || t.modal.paymentDescription,
      content: D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-3` }}, [
        D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [t.modal.paymentDescription]),
        orderAmount > 0 ? D.Containers.Div({ attrs:{ class: tw`rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3` }}, [
          D.Text.P({ attrs:{ class: tw`text-xs text-slate-400` }}, [lang === 'ar' ? 'المبلغ المستحق' : 'Amount Due']),
          D.Text.Strong({ attrs:{ class: tw`text-lg text-emerald-400` }}, [`${orderAmount.toFixed(2)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`])
        ]) : null,
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, methodsList)
      ].filter(Boolean)),
      actions:[
        {
          label: t.modal.close,
          gkey:'ui:modal:close',
          variant:'secondary'
        }
      ]
    });
  };

  // ✅ CRUD Modal for Driver Management
  const DriverCRUDModal = (db, t, lang)=>{
    const open = db.ui?.modals?.crudDriver || false;
    if(!open) return null;

    // Get store instance
    const store = window.__POS_DB__;
    if (!store || !window.MishkahCRUD) {
      console.error('[KDS][CRUD] Store or MishkahCRUD not available');
      return null;
    }

    // Create CRUD instance (singleton pattern)
    if (!window.__driverCRUD__) {
      try {
        window.__driverCRUD__ = window.MishkahCRUD.createCRUD({
          table: 'delivery_drivers',
          store: store,
          displayField: 'name',
          lang: lang,
          fields: [
            {
              name: 'name',
              type: 'text',
              labelAr: 'الاسم',
              labelEn: 'Name',
              required: true
            },
            {
              name: 'phone',
              type: 'phone',
              labelAr: 'الهاتف',
              labelEn: 'Phone'
            },
            {
              name: 'vehicleId',
              type: 'text',
              labelAr: 'رقم المركبة',
              labelEn: 'Vehicle ID'
            },
            {
              name: 'isActive',
              type: 'checkbox',
              labelAr: 'نشط',
              labelEn: 'Active',
              defaultValue: true
            }
          ]
        });
        // Initial load
        window.__driverCRUD__.loadRecords();
      } catch (err) {
        console.error('[KDS][CRUD] Failed to create CRUD:', err);
        return null;
      }
    }

    const crud = window.__driverCRUD__;
    const crudUI = window.MishkahCRUD.renderCRUD(crud, D, tw, { lang });

    return UI.Modal({
      open,
      title: lang === 'ar' ? 'إدارة السائقين' : 'Manage Drivers',
      description: lang === 'ar' ? 'إضافة وتعديل وحذف السائقين' : 'Add, edit, and delete drivers',
      size: 'large',
      content: crudUI,
      actions:[
        {
          label: t.modal.close,
          gkey:'kds:crud:close',
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
      overlays:[ DriverModal(db, t, lang), PaymentModal(db, t, lang), DriverCRUDModal(db, t, lang) ].filter(Boolean)
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
  const getLastStoreTables = () => {
    const tables = (typeof window !== 'undefined' && window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables)
      ? window.__MISHKAH_LAST_STORE__.state.modules.pos.tables
      : {};
    const pick = (key) => (Array.isArray(tables[key]) ? tables[key] : []);
    return {
      job_order_header: pick('job_order_header'),
      job_order_detail: pick('job_order_detail'),
      job_order_detail_modifier: pick('job_order_detail_modifier'),
      job_order_status_history: pick('job_order_status_history'),
      job_order_batch: pick('job_order_batch'),
      order_header: pick('order_header'),
      order_line: pick('order_line')
    };
  };
  const lastStoreTables = getLastStoreTables();
  // ✅ Read job order tables from flat structure (database, kdsSource, or last store)
  const rawJobOrderHeaders = cloneDeep(
    database.job_order_header
    || kdsSource.jobOrders?.job_order_header
    || kdsSource.jobOrders?.headers
    || lastStoreTables.job_order_header
    || []
  );

  // ✅ CRITICAL FIX: Filter out stale job_order_header entries
  // Only keep job_order_header from last 24 hours to prevent old batches from accumulating
  const now = Date.now();
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

  const filteredJobOrderHeaders = rawJobOrderHeaders.filter(header => {
    // Keep if created recently (within last 24 hours)
    const createdAt = typeof header.createdAt === 'number' ? header.createdAt
      : typeof header.createdAt === 'string' ? new Date(header.createdAt).getTime()
      : 0;

    const updatedAt = typeof header.updatedAt === 'number' ? header.updatedAt
      : typeof header.updatedAt === 'string' ? new Date(header.updatedAt).getTime()
      : 0;

    const latestTime = Math.max(createdAt, updatedAt);

    // Keep if recent OR if status is not completed
    const isRecent = latestTime >= twentyFourHoursAgo;
    const isNotCompleted = header.status !== 'completed';

    return isRecent || isNotCompleted;
  });

  //console.log('🧹 [KDS INIT] Filtered job_order_header:', {
  //  total: rawJobOrderHeaders.length,
 //   filtered: filteredJobOrderHeaders.length,
  //  removed: rawJobOrderHeaders.length - filteredJobOrderHeaders.length
 // });

  const rawJobOrders = {
    job_order_header: filteredJobOrderHeaders,
    job_order_detail: cloneDeep(
      database.job_order_detail
      || kdsSource.jobOrders?.job_order_detail
      || kdsSource.jobOrders?.details
      || lastStoreTables.job_order_detail
      || []
    ),
    job_order_detail_modifier: cloneDeep(
      database.job_order_detail_modifier
      || kdsSource.jobOrders?.job_order_detail_modifier
      || kdsSource.jobOrders?.modifiers
      || lastStoreTables.job_order_detail_modifier
      || []
    ),
    job_order_status_history: cloneDeep(
      database.job_order_status_history
      || kdsSource.jobOrders?.job_order_status_history
      || kdsSource.jobOrders?.statusHistory
      || lastStoreTables.job_order_status_history
      || []
    )
  };
  const jobRecords = buildJobRecords(rawJobOrders);
  const jobsIndexed = indexJobs(jobRecords);
  const expoSource = Array.isArray(database.expo_pass_ticket) ? database.expo_pass_ticket.map(ticket=>({ ...ticket }))
                   : Array.isArray(kdsSource.jobOrders?.expoPassTickets) ? kdsSource.jobOrders.expoPassTickets.map(ticket=>({ ...ticket }))
                   : [];
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
      // ✅ CRITICAL FIX: Initialize job_order tables from window.database
      jobHeaders: Array.isArray(database?.job_order_header) ? database.job_order_header : [],
      jobOrderDetails: Array.isArray(database?.job_order_detail) ? database.job_order_detail : [],
      batches: Array.isArray(database?.job_order_batch) ? database.job_order_batch : [],
      orderHeaders: Array.isArray(database?.order_header) ? database.order_header : [],
      orderLines: Array.isArray(database?.order_line) ? database.order_line : [],
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
      modals:{ driver:false, crudDriver:false },
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
    // ✅ Use canonical table names consistently
    const getArray = (obj, canonicalKey, ...aliasKeys) => {
      if (Array.isArray(obj[canonicalKey])) return obj[canonicalKey];
      for (const alias of aliasKeys) {
        if (Array.isArray(obj[alias])) return obj[alias];
      }
      return [];
    };
    return {
      job_order_header: mergeList(
        getArray(current, 'job_order_header', 'headers'),
        getArray(patch, 'job_order_header', 'headers')
      ),
      job_order_detail: mergeList(
        getArray(current, 'job_order_detail', 'details'),
        getArray(patch, 'job_order_detail', 'details')
      ),
      job_order_detail_modifier: mergeList(
        getArray(current, 'job_order_detail_modifier', 'modifiers'),
        getArray(patch, 'job_order_detail_modifier', 'modifiers')
      ),
      job_order_status_history: mergeList(
        getArray(current, 'job_order_status_history', 'statusHistory'),
        getArray(patch, 'job_order_status_history', 'statusHistory')
      )
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

      // ✅ CRITICAL FIX: Also update state.data.jobHeaders so renderKdsApp() sees the change!
      // Without this, the job won't disappear from the screen when marked as completed
      const existingJobHeaders = Array.isArray(baseNext.data?.jobHeaders) ? baseNext.data.jobHeaders : [];
      const jobHeadersNext = existingJobHeaders.map(header => {
        if (String(header.id) !== String(jobId)) return header;

        // ✅ Apply the same patch to jobHeader
        const updatedHeader = { ...header, ...patch };
        if(patch.startedAt){
          updatedHeader.startedAt = patch.startedAt;
          updatedHeader.started_at = patch.startedAt;  // Both formats
        }
        if(patch.readyAt){
          updatedHeader.readyAt = patch.readyAt;
          updatedHeader.ready_at = patch.readyAt;
        }
        if(patch.completedAt){
          updatedHeader.completedAt = patch.completedAt;
          updatedHeader.completed_at = patch.completedAt;
        }
        if(patch.updatedAt){
          updatedHeader.updatedAt = patch.updatedAt;
          updatedHeader.updated_at = patch.updatedAt;
        }
        return updatedHeader;
      });

      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          jobHeaders: jobHeadersNext,  // ✅ Update jobHeaders!
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
    // ✅ Extract job order tables from flat payload structure
    const incomingJobOrders = {
      job_order_header: Array.isArray(payload.job_order_header) ? payload.job_order_header : [],
      job_order_detail: Array.isArray(payload.job_order_detail) ? payload.job_order_detail : [],
      job_order_detail_modifier: Array.isArray(payload.job_order_detail_modifier) ? payload.job_order_detail_modifier : [],
      job_order_status_history: Array.isArray(payload.job_order_status_history) ? payload.job_order_status_history : []
    };
    const incomingJobBatches = Array.isArray(payload.job_order_batch) ? payload.job_order_batch : [];

    // ✅ Extract order_header and order_line for static tabs
    const incomingOrderHeaders = Array.isArray(payload.order_header) ? payload.order_header : [];
    const incomingOrderLines = Array.isArray(payload.order_line) ? payload.order_line : [];

    // Skip if no data at all
    const hasJobOrders = incomingJobOrders.job_order_header.length > 0 || incomingJobOrders.job_order_detail.length > 0;
    const hasOrderData = incomingOrderHeaders.length > 0 || incomingOrderLines.length > 0;
    if(!hasJobOrders && !hasOrderData) return;

    // ✅ Persist incoming job orders into the store (if missing) so updates can target them
    if (store && typeof store.insert === 'function') {
      const dbHeaders = window.database?.job_order_header || [];
      const dbDetails = window.database?.job_order_detail || [];
      const dbModifiers = window.database?.job_order_detail_modifier || [];
      const dbHistory = window.database?.job_order_status_history || [];
      const dbBatches = window.database?.job_order_batch || [];

      incomingJobBatches.forEach(batch => {
        if (!batch || batch.id == null) return;
        if (dbBatches.find(b => String(b.id) === String(batch.id))) return;
        try { store.insert('job_order_batch', batch, { silent: false }); } catch (_err) {}
      });

      incomingJobOrders.job_order_header.forEach(header => {
        if (!header || header.id == null) return;
        if (dbHeaders.find(h => String(h.id) === String(header.id))) return;
        try { store.insert('job_order_header', header, { silent: false }); } catch (_err) {}
      });

      incomingJobOrders.job_order_detail.forEach(detail => {
        if (!detail || detail.id == null) return;
        if (dbDetails.find(d => String(d.id) === String(detail.id))) return;
        try { store.insert('job_order_detail', detail, { silent: false }); } catch (_err) {}
      });

      incomingJobOrders.job_order_detail_modifier.forEach(mod => {
        if (!mod || mod.id == null) return;
        if (dbModifiers.find(m => String(m.id) === String(mod.id))) return;
        try { store.insert('job_order_detail_modifier', mod, { silent: false }); } catch (_err) {}
      });

      incomingJobOrders.job_order_status_history.forEach(history => {
        if (!history || history.id == null) return;
        if (dbHistory.find(h => String(h.id) === String(history.id))) return;
        try { store.insert('job_order_status_history', history, { silent: false }); } catch (_err) {}
      });
    }

    appInstance.setState(state=>{
      // ✅ CRITICAL FIX: REPLACE jobOrders instead of merging
      // Problem: watch sends ALL rows from IndexedDB (old + new), not just changes
      // Merging with state.data.jobOrders causes accumulation → old batches reappear!
      // Solution: Use incoming payload directly (like POS v2 clears batches before adding)
      const mergedOrders = incomingJobOrders;  // Replace, don't merge!
      const jobRecordsNext = buildJobRecords(mergedOrders);
      const jobsIndexedNext = indexJobs(jobRecordsNext);
      const expoSourcePatch = Array.isArray(payload.expo_pass_ticket) ? payload.expo_pass_ticket
                            : Array.isArray(payload.expoPassTickets) ? payload.expoPassTickets
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

      // ✅ Handle payment methods - READ FROM WATCHER FIRST
      let paymentMethodsNext = state.data.paymentMethods;
      // 1️⃣ Read from watcher first (highest priority)
      if(Array.isArray(watcherState.paymentMethods) && watcherState.paymentMethods.length > 0){
        const existing = Array.isArray(state.data.paymentMethods) ? state.data.paymentMethods : [];
        const map = new Map(existing.map(pm=> [String(pm.id), pm]));
        watcherState.paymentMethods.forEach(pm=>{
          if(pm && pm.id != null) map.set(String(pm.id), pm);
        });
        paymentMethodsNext = Array.from(map.values());
      }
      // 2️⃣ Fallback to payload if watcher is empty
      else if(Array.isArray(payload.payment_methods)){
        paymentMethodsNext = payload.payment_methods;
      } else if(Array.isArray(payload.settings?.payment_methods)){
        paymentMethodsNext = payload.settings.payment_methods;
      } else if(Array.isArray(payload.master?.payment_methods)){
        paymentMethodsNext = payload.master.payment_methods;
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
      if(!stationsExplicitlyProvided && kitchenSectionsNext.length){        stationsNext = kitchenSectionsNext.map((section, idx)=>{
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
          if(idx === 0){          }
          return result;
        });      }
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
      // ✅ Merge order_header and order_line for static tabs
      const existingOrderHeaders = Array.isArray(state.data.orderHeaders) ? state.data.orderHeaders : [];
      const existingOrderLines = Array.isArray(state.data.orderLines) ? state.data.orderLines : [];

      const orderHeadersMap = new Map(existingOrderHeaders.map(h => [String(h.id), h]));
      incomingOrderHeaders.forEach(header => {
        if (header && header.id) {
          const existing = orderHeadersMap.get(String(header.id));
          // ✅ Smart merge: Keep local updates if they're newer (prevent watcher from overwriting)
          // Priority: version number > timestamp
          if (!existing) {
            // New header from database
            orderHeadersMap.set(String(header.id), header);
          } else {
            const existingVersion = existing.version || 1;
            const incomingVersion = header.version || 1;

            // Compare versions first (more reliable than timestamp)
            if (incomingVersion > existingVersion) {
              // Incoming is newer version
              orderHeadersMap.set(String(header.id), header);
            } else if (incomingVersion < existingVersion) {
              // Keep existing (local optimistic update that hasn't synced yet)
            } else {
              // Same version - fallback to timestamp comparison
              const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
              const incomingTime = header.updatedAt ? new Date(header.updatedAt).getTime() : 0;

              if (incomingTime >= existingTime) {
                orderHeadersMap.set(String(header.id), header);
              }
            }
          }
        }
      });
      const orderHeadersNext = Array.from(orderHeadersMap.values());

      const orderLinesMap = new Map(existingOrderLines.map(l => [String(l.id), l]));
      incomingOrderLines.forEach(line => {
        if (line && line.id) {
          const existing = orderLinesMap.get(String(line.id));
          // ✅ Smart merge for order_line (also versioned)
          if (!existing) {
            orderLinesMap.set(String(line.id), line);
          } else {
            const existingVersion = existing.version || 1;
            const incomingVersion = line.version || 1;

            if (incomingVersion > existingVersion) {
              orderLinesMap.set(String(line.id), line);
            } else if (incomingVersion < existingVersion) {
              // Keep local optimistic update
            } else {
              // Same version - use incoming (fresher from database)
              orderLinesMap.set(String(line.id), line);
            }
          }
        }
      });
      const orderLinesNext = Array.from(orderLinesMap.values());

      // ✅ CRITICAL FIX: REPLACE batches from payload (don't merge with old state!)
      // Problem: Merging with state.data.batches causes old batches to reappear in WebSocket mode
      // Reason: Watcher already sends ALL active batches from IndexedDB (line 6670: watcherState.batches = rows)
      // POS v2 does clear() before adding new (posv2.js:4576)
      // Solution: Just use payload batches directly (they already contain all active batches)
      const batchesFinal = Array.isArray(payload.job_order_batch) ? payload.job_order_batch : [];

      const nextState = {
        ...state,
        data:{
          ...state.data,
          orderHeaders: orderHeadersNext,      // ✅ For static tabs (legacy)
          orderLines: orderLinesNext,          // ✅ For static tabs (legacy)
          jobHeaders: mergedOrders.job_order_header || [],        // ✅ NEW: For Expo/Handoff tabs
          jobOrderDetails: mergedOrders.job_order_detail || [],   // ✅ For derived status
          batches: batchesFinal,               // ✅ FIXED: Replace instead of merge (prevents old batches reappearing)
          jobOrders: mergedOrders,
          jobs: jobsIndexedNext,
          expoSource: expoSourceNext,
          expoTickets: expoTicketsNext,
          deliveries: deliveriesNext,
          drivers: driversNext,
          paymentMethods: paymentMethodsNext,  // ✅ Add payment methods from watcher
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
      //  console.groupCollapsed(`[Mishkah][KDS] Interactive nodes snapshot (${snapshot.length})`);
        if(typeof console.table === 'function') console.table(snapshot);
        else //console.log(snapshot);
        console.groupEnd();
      } else {
       // //console.log(`[Mishkah][KDS] Interactive nodes snapshot (${snapshot.length})`, snapshot);
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
       // console.groupCollapsed(`[Mishkah][KDS] Orders registry snapshot (${snapshot.length})`);
       // snapshot.forEach(entry=> console.log(entry));
      //  console.groupEnd();
      } else {
        //console.log(`[Mishkah][KDS] Orders registry snapshot (${snapshot.length})`, snapshot);
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
    // ✅ Expose app.getState() for debugging
    dev.getState = ()=> (typeof app.getState === 'function' ? app.getState() : null);
    dev.app = app;  // ✅ Expose entire app for debugging
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
        // ✅ Persist status change to server
        persistJobOrderStatusChange(jobId, { status:'in_progress', progressState:'cooking', startedAt: nowIso, updatedAt: nowIso }, {
          actorId: 'kds',
          actorName: 'KDS',
          actorRole: 'kds',
          reason: 'job-started'
        });
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
        emitSync({ type:'job:update', jobId, payload:{ status:'ready', progressState:'completed', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso } });
        if(syncClient){
          syncClient.publishJobUpdate({ jobId, payload:{ status:'ready', progressState:'completed', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso } });
        }
        // ✅ Persist status change to server
        persistJobOrderStatusChange(jobId, { status:'ready', progressState:'completed', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso }, {
          actorId: 'kds',
          actorName: 'KDS',
          actorRole: 'kds',
          reason: 'job-completed'
        });
      }
    },
    'kds.handoff.assembled':{
      on:['click'],
      gkeys:['kds:handoff:assembled'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-batch-id]');
        if(!btn) return;

        const batchId = btn.getAttribute('data-batch-id');
        const orderId = btn.getAttribute('data-order-id');
        const nowIso = new Date().toISOString();
        console.log('[KDS][handoff:assembled] Click', {
          batchId,
          orderId,
          hasStore: !!store,
          hasSyncClient: !!syncClient,
          hasState: !!ctx?.getState
        });

        if(!batchId) {
          console.warn('[KDS][handoff:assembled] Missing batchId on button', { orderId });
          return;
        }

        const state = ctx.getState();
        let batches = Array.isArray(state?.data?.batches) ? state.data.batches : [];
        if (!batches.length && typeof window !== 'undefined') {
          const fallbackBatches = window.__MISHKAH_LAST_STORE__?.state?.modules?.pos?.tables?.job_order_batch;
          if (Array.isArray(fallbackBatches) && fallbackBatches.length) {
            batches = fallbackBatches;
          }
        }
        let resolvedBatchId = batchId;
        if (resolvedBatchId && resolvedBatchId.startsWith('order-') && orderId) {
          const match = batches.find((b) => String(b.orderId || b.order_id) === String(orderId));
          if (match?.id) {
            resolvedBatchId = match.id;
          }
          console.log('[KDS][handoff:assembled] Resolved batchId from orderId', {
            orderId,
            originalBatchId: batchId,
            resolvedBatchId,
            localBatchCount: batches.length
          });
        }
        if (resolvedBatchId && resolvedBatchId.startsWith('order-')) {
          console.warn('[KDS][handoff:assembled] BatchId resolution failed, continuing without batch update', {
            orderId,
            batchId: resolvedBatchId,
            localBatchCount: batches.length
          });
          resolvedBatchId = null;
        }
        const headerCount = Array.isArray(state?.data?.jobHeaders) ? state.data.jobHeaders.length : 0;
        console.log('[KDS][handoff:assembled] State snapshot', {
          headerCount,
          batchId: resolvedBatchId
        });

        if (resolvedBatchId && store) {
          (async () => {
            let batchExists = false;
            try {
              const existingBatch = await store.read('job_order_batch', resolvedBatchId);
              batchExists = !!existingBatch;
            } catch (err) {
               console.error(err);
            }

            console.log('[KDS][handoff:assembled] Batch read', { batchId: resolvedBatchId, batchExists });
            if (!batchExists) return;
            const batchPayload = {
              id: resolvedBatchId,
              orderId: orderId,
              order_id: orderId,
              status: 'assembled',
              assembledAt: nowIso,
              assembled_at: nowIso,
              updatedAt: nowIso,
              updated_at: nowIso,
              batchType: 'initial',
              batch_type: 'initial'
            };
            const result = await retryWithBackoff(
              () => store.update('job_order_batch', batchPayload),
              `Update batch to assembled`,
              4
            );
            console.log('[KDS][handoff:assembled] Batch update result', {
              batchId: resolvedBatchId,
              success: result?.success,
              error: result?.error
            });
            if (!result.success) {
              return;
            }
            watcherState.batches = (watcherState.batches || []).map(b => {
              if (String(b.id) === String(resolvedBatchId)) {
                return {
                  ...b,
                  status: 'assembled',
                  assembledAt: nowIso,
                  assembled_at: nowIso,
                  updatedAt: nowIso,
                  updated_at: nowIso
                };
              }
              return b;
            });
            updateFromWatchers();
            checkAndUpdateOrderHeaderStatus(orderId, 'assembled', nowIso);
          })();
        } else if (!store) {
          console.warn('[KDS][handoff:assembled] Store missing, skipping batch update');
        }

        const jobHeaders = state.data?.jobHeaders || [];
        const jobsToComplete = jobHeaders.filter(header => {
          const headerBatchId = header.batchId || header.batch_id;
          if (resolvedBatchId && headerBatchId) return headerBatchId === resolvedBatchId;
          const headerOrderId = header.orderId || header.order_id;
          return headerOrderId && orderId && String(headerOrderId) === String(orderId);
        });
        console.log('[KDS][handoff:assembled] Jobs to complete', {
          batchId: resolvedBatchId,
          count: jobsToComplete.length
        });

        jobsToComplete.forEach(header => {
          const jobId = header.id;
          persistJobOrderStatusChange(jobId, {
            status: 'completed',
            progressState: 'completed',
            completedAt: nowIso,
            updatedAt: nowIso
          }, {});
        });

        const handoffRecord = { status:'assembled', assembledAt: nowIso, updatedAt: nowIso };
        recordPersistedHandoff(orderId, cloneDeep(handoffRecord));

        emitSync({ type:'handoff:update', orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });
        if(syncClient && typeof syncClient.publishHandoffUpdate === 'function'){
          syncClient.publishHandoffUpdate({ orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });
        }
        console.log('[KDS][handoff:assembled] Completed', { batchId: resolvedBatchId, orderId });
      }
    },
    'kds.handoff.served':{
      on:['click'],
      gkeys:['kds:handoff:served'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-batch-id]');
        if(!btn) return;

        const batchId = btn.getAttribute('data-batch-id');
        const orderId = btn.getAttribute('data-order-id');

        if(!batchId) return;
        const nowIso = new Date().toISOString();

        const state = ctx.getState();

        if (batchId && store) {
          (async () => {
            let batchExists = false;
            try {
              const existingBatch = await store.read('job_order_batch', batchId);
              batchExists = !!existingBatch;
            } catch (err) {
            }

            if (!batchExists) return;
            const batchPayload = {
              id: batchId,
              orderId: orderId,
              order_id: orderId,
              status: 'served',
              servedAt: nowIso,
              served_at: nowIso,
              updatedAt: nowIso,
              updated_at: nowIso,
              batchType: 'initial',
              batch_type: 'initial'
            };
            const result = await retryWithBackoff(
              () => store.update('job_order_batch', batchPayload),
              `Update batch to served`,
              4
            );
            if (!result.success) {
              return;
            }
            watcherState.batches = (watcherState.batches || []).map(b => {
              if (String(b.id) === String(batchId)) {
                return {
                  ...b,
                  status: 'served',
                  servedAt: nowIso,
                  served_at: nowIso,
                  updatedAt: nowIso,
                  updated_at: nowIso
                };
              }
              return b;
            });

            updateFromWatchers();
            checkAndUpdateOrderHeaderStatus(orderId, 'served', nowIso);
          })();
        }

        // ✅ Update job_order_header for THIS BATCH ONLY (mark completed)
        const jobHeaders = state.data?.jobHeaders || [];
        const jobsToComplete = jobHeaders.filter(header => {
          const headerBatchId = header.batchId || header.batch_id;
          return headerBatchId === batchId;  // ✅ Match by batchId, not orderId!
        });

        jobsToComplete.forEach(header => {
          const jobId = header.id;
          persistJobOrderStatusChange(jobId, {
            status: 'completed',
            progressState: 'completed',
            completedAt: nowIso,
            updatedAt: nowIso
          }, {});
        });

        // ✅ Persist handoff to localStorage (watch will update state)
        const handoffRecord = { status:'served', servedAt: nowIso, updatedAt: nowIso };
        recordPersistedHandoff(orderId, cloneDeep(handoffRecord));

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
        const btn = event?.target && event.target.closest('[data-batch-id]');
        if(!btn) return;
        const batchId = btn.getAttribute('data-batch-id');
        const orderId = btn.getAttribute('data-order-id');  // For reference
        if(!batchId) return;
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:true,
            modals:{ ...(state.ui?.modals || {}), driver:true },
            deliveryAssignment:{ batchId, orderId }  // ✅ BATCH-BASED
          }
        }));
      }
    },
    'kds.delivery.selectDriver':{
      on:['click'],
      gkeys:['kds:delivery:select-driver'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-batch-id][data-driver-id]');
        if(!btn) return;
        const batchId = btn.getAttribute('data-batch-id');
        const driverId = btn.getAttribute('data-driver-id');
        if(!batchId || !driverId) return;
        const nowIso = new Date().toISOString();
        let assignmentPayload = null;
        let orderId = null;  // For sync only
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const assignments = { ...(deliveries.assignments || {}) };
          const driver = (state.data.drivers || []).find(d=> String(d.id) === driverId) || {};
          // ✅ BATCH-BASED: Store assignment by batchId
          orderId = state.ui?.deliveryAssignment?.orderId || null;  // Get from modal state
          assignments[batchId] = {
            ...(assignments[batchId] || {}),
            batchId,
            orderId,  // Keep for reference
            driverId,
            driverName: driver.name || driverId,
            driverPhone: driver.phone || '',
            vehicleId: driver.vehicle_id || driver.vehicleId || '',
            status: 'assigned',
            assignedAt: assignments[batchId]?.assignedAt || nowIso
          };
          assignmentPayload = assignments[batchId];
          emitSync({ type:'delivery:update', batchId, orderId, payload:{ assignment: assignments[batchId] } });
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
          syncClient.publishDeliveryUpdate({ batchId, orderId, payload:{ assignment: assignmentPayload } });
        }
        // ✅ Persist to database (BATCH-BASED)
        if (assignmentPayload) {
          persistDeliveryAssignment(batchId, assignmentPayload);
        }
      }
    },
    'kds.delivery.complete':{
      on:['click'],
      gkeys:['kds:delivery:complete'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-batch-id]');
        if(!btn) return;

        // ✅ CRITICAL: Get batchId from button, not orderId!
        // Each order card represents ONE batch, so update ONLY that batch
        const batchId = btn.getAttribute('data-batch-id');
        const orderId = btn.getAttribute('data-order-id');  // Fallback for backwards compatibility

        if(!batchId && !orderId) return;
        const nowIso = new Date().toISOString();

        // ✅ CRITICAL: Update ONLY the specific batch (not all batches for this order!)
        const state = ctx.getState();

        // ✅ Update batch status using watcherState → store.update pattern
        const updateBatchStatus = async (bId) => {
          if (!store || typeof store.update !== 'function') {
            console.warn('[KDS][delivery:complete] ⚠️ Store not available for batch update');
            return;
          }

          try {
            // ✅ CRITICAL: Read from watcherState (NOT store.read!)
            // watcherState has latest data from WebSocket watchers
            // store.read() calls REST API which may be slow/stale
            const batches = watcherState.batches || [];
            const currentBatch = batches.find(b => String(b.id) === String(bId));

            if (!currentBatch) {
              console.warn('[KDS][delivery:complete] ⚠️ Batch not found in watcherState:', bId);
              console.log('[KDS][delivery:complete] Available batches:', batches.map(b => b.id));
              return;
            }

            console.log('[KDS][delivery:complete] 📦 Updating batch:', bId, 'from', currentBatch.status, '→ delivered');

            // ✅ CRITICAL: Get current version for optimistic concurrency control
            const currentVersion = currentBatch.version || 1;
            const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

            // ✅ Update via store (triggers backend update + watch update)
            const updatePayload = {
              id: bId,
              status: 'delivered',
              deliveredAt: nowIso,
              delivered_at: nowIso,
              updatedAt: nowIso,
              updated_at: nowIso,
              version: nextVersion  // ✅ Include version for concurrency control
            };

            console.log('[KDS][delivery:complete] Update payload:', updatePayload, '(v' + currentVersion + ' → v' + nextVersion + ')');

            await store.update('job_order_batch', updatePayload);

            console.log('[KDS][delivery:complete] ✅ Batch status updated to delivered:', bId);

            // ✅ Optimistic update to watcherState (immediate UI update)
            const batchIndex = batches.findIndex(b => String(b.id) === String(bId));
            if (batchIndex >= 0) {
              watcherState.batches[batchIndex] = {
                ...batches[batchIndex],
                status: 'delivered',
                deliveredAt: nowIso,
                delivered_at: nowIso,
                updatedAt: nowIso,
                updated_at: nowIso,
                version: nextVersion  // ✅ Update version in watcherState too
              };
              console.log('[KDS][delivery:complete] ✅ Optimistic update applied to watcherState (v' + nextVersion + ')');
            }
          } catch (err) {
            console.error('[KDS][delivery:complete] ❌ Failed to update batch status:', err);
          }
        };

        // ✅ CRITICAL FIX: Wait for batch update before checking order header status
        // This ensures watcherState.batches is updated before checkAndUpdateOrderHeaderStatus runs
        (async () => {
          if (batchId) {
            // ✅ NEW WAY: Update specific batch by batchId
            await updateBatchStatus(batchId);
          } else {
            // ❌ OLD WAY (backwards compatibility): Update all served/assembled batches for orderId
            const batches = state.data.batches || [];
            const servedBatches = batches.filter(batch => {
              const batchOrderId = batch.orderId || batch.order_id;
              const batchStatus = batch.status;
              return batchOrderId === orderId &&
                     (batchStatus === 'served' || batchStatus === 'assembled');
            });

            for (const batch of servedBatches) {
              await updateBatchStatus(batch.id);
            }
          }

          // ✅ Persist delivery assignment (BATCH-BASED)
          const assignment = {
            batchId: batchId,  // ✅ استخدام batchId بدلاً من orderId
            orderId: orderId,  // ✅ الاحتفاظ بـ orderId للمرجعية فقط
            status: 'delivered',
            deliveredAt: nowIso,
            updatedAt: nowIso
          };
          persistDeliveryAssignment(batchId, assignment);  // ✅ استخدام batchId

          emitSync({ type:'delivery:update', batchId, orderId, payload:{ assignment } });
          if(syncClient){
            syncClient.publishDeliveryUpdate({ batchId, orderId, payload:{ assignment } });
          }

          // ✅ Update order_header.status based on ALL batches for this order
          // MUST run AFTER batch update completes to ensure watcherState is synced
          checkAndUpdateOrderHeaderStatus(orderId, 'delivered', nowIso);
        })();
      }
    },
    'kds.delivery.settle':{
      on:['click'],
      gkeys:['kds:delivery:settle'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-batch-id]');
        if(!btn) return;
        const batchId = btn.getAttribute('data-batch-id');
        const orderId = btn.getAttribute('data-order-id');
        if(!batchId) return;
        const order = (ctx.getState().data.orderHeaders || []).find(h => {
          const headerOrderId = String(h.orderId || h.order_id || h.id);
          const baseOrderId = extractBaseOrderId(headerOrderId);
          return headerOrderId === orderId || baseOrderId === orderId || String(h.id) === orderId;
        });
        const orderAmount = computeOrderDueForKds(window.database || {}, orderId);
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen: true,
            modals: { ...(state.ui?.modals || {}), payment: true },
            paymentSettlement: { batchId, orderId, amount: orderAmount }
          }
        }));
      }
    },
    'kds.payment.select':{
      on:['click'],
      gkeys:['kds:payment:select'],
      handler:async (event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-payment-method-id]');
        if(!btn) return;
        const batchId = btn.getAttribute('data-batch-id');
        const paymentMethodId = btn.getAttribute('data-payment-method-id');
        const paymentType = btn.getAttribute('data-payment-type') || 'cash';
        if(!batchId || !paymentMethodId) return;

        const nowIso = new Date().toISOString();
        const orderId = ctx.getState().ui?.paymentSettlement?.orderId || null;  // Get from modal state

        // ✅ Get order amount
        const order = (ctx.getState().data.orderHeaders || []).find(h => {
          const headerId = String(h.id || h.orderId || h.order_id);
          return headerId === orderId || extractBaseOrderId(headerId) === orderId;
        });
        const orderAmount = computeOrderDueForKds(window.database || {}, orderId);

        // ✅ 1. Create order_payment record
        const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const paymentRecord = {
          id: paymentId,
          orderId: orderId,
          paymentMethodId: paymentMethodId,
          amount: orderAmount,
          capturedAt: nowIso,
          shiftId: order?.shiftId || 'current-shift',  // TODO: Get actual shift ID
          reference: null
        };

        // ✅ 2. Update settlement status (BATCH-BASED)
        let settlementPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const settlements = { ...(deliveries.settlements || {}) };
          // ✅ BATCH-BASED: Store settlement by batchId
          settlements[batchId] = {
            ...(settlements[batchId] || {}),
            batchId,
            orderId,  // Keep for reference
            status:'settled',
            settledAt: nowIso,
            paymentMethodId: paymentMethodId,
            paymentType: paymentType
          };
          settlementPayload = settlements[batchId];

          emitSync({ type:'delivery:update', batchId, orderId, payload:{ settlement: settlements[batchId] } });

          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments: { ...(deliveries.assignments || {}) }, settlements }
            },
            ui:{
              ...(state.ui || {}),
              modalOpen: false,
              modals: { ...(state.ui?.modals || {}), payment: false },
              paymentSettlement: null
            }
          };
        });

        // ✅ 3. Publish to sync
        if(syncClient && settlementPayload){
          syncClient.publishDeliveryUpdate({ batchId, orderId, payload:{ settlement: settlementPayload } });
        }

        // ✅ 4. Persist payment record to database
        if(store && typeof store.insert === 'function'){
          try{
            await store.insert('order_payment', paymentRecord);
          }catch(err){
            console.error('[KDS][payment] Failed to insert payment:', err);
          }
        }

        if(store && typeof store.update === 'function'){
          const batchUpdate = { id: batchId, status: 'settled', settledAt: nowIso, settled_at: nowIso, updatedAt: nowIso, updated_at: nowIso };
          try{
            await Promise.race([
              store.update('job_order_batch', batchUpdate),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Update timeout')), 10000))
            ]);
          }catch(e){
          }
        }

        // ✅ 5. Update order_header status to 'settled' based on ALL batches
        checkAndUpdateOrderHeaderStatus(orderId, 'settled', nowIso);
      }
    },
    'kds.driver.manage':{
      on:['click'],
      gkeys:['kds:driver:manage'],
      handler:(event, ctx)=>{
        event?.preventDefault();
        // Open CRUD modal for delivery_drivers management
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen: true,
            modals: { ...(state.ui?.modals || {}), driver: false, crudDriver: true },
            deliveryAssignment: null
          }
        }));
      }
    },
    'ui.modal.close':{
      on:['click'],
      gkeys:['ui:modal:close'],
      handler:(event, ctx)=>{
        event?.preventDefault();
        // ✅ Close ALL modals
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:false,
            modals:{ driver:false, payment:false, crudDriver:false },  // ✅ Close all modals
            deliveryAssignment:null,
            paymentSettlement:null
          }
        }));
      }
    },
    'kds.crud.close':{
      on:['click'],
      gkeys:['kds:crud:close'],
      handler:(event, ctx)=>{
        event?.preventDefault();
        // Close CRUD modal
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:false,
            modals:{ ...(state.ui?.modals || {}), crudDriver:false }
          }
        }));
      }
    },
    'ui.modal.escape':{
      on:['keydown'],
      gkeys:['escape'],
      handler:(event, ctx)=>{
        // ✅ ESC key closes modals
        if(event?.key !== 'Escape') return;
        const state = ctx.getState();
        if(!state.ui?.modalOpen) return;

        event?.preventDefault();
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:false,
            modals:{ driver:false, payment:false, crudDriver:false },  // ✅ Close all modals
            deliveryAssignment:null,
            paymentSettlement:null
          }
        }));
      }
    }
  };

  const watcherUnsubscribers = [];
  // ✅ Use pos-db (mishkah-store) for reading and writing
  let store = typeof window !== 'undefined' && window.__POS_DB__ ? window.__POS_DB__ : null;

  const watcherState = {
    status: 'idle',
    posPayload: database,
    headers: [],           // job_order_header
    lines: [],             // job_order_detail
    batches: [],           // ✅ job_order_batch
    orderHeaders: [],      // ✅ order_header for static tabs
    orderLines: [],        // ✅ order_line for static tabs
    deliveries: []
  };

  /**
   * ✅ Compute batch status dynamically from job_order_header records
   *
   * Batch Lifecycle:
   * - queued: لم يبدأ أي job بعد
   * - cooking: بدأ job واحد أو أكثر (in_progress)
   * - ready: كل jobs جاهزة (ready/completed)
   * - assembled: تم التجميع في Expo
   * - served: تم التسليم للعميل
   *
   * @param {Array} jobHeaders - All job_order_header records for this batch
   * @returns {Object} { status, totalJobs, readyJobs, cookingJobs, queuedJobs, progress }
   */
  const computeBatchStatus = (jobHeaders) => {
    if (!Array.isArray(jobHeaders) || jobHeaders.length === 0) {
      return { status: 'unknown', totalJobs: 0, readyJobs: 0, cookingJobs: 0, queuedJobs: 0, progress: 0 };
    }

    const totalJobs = jobHeaders.length;
    let readyJobs = 0;
    let cookingJobs = 0;
    let queuedJobs = 0;

    // Count jobs by status
    jobHeaders.forEach(job => {
      const status = String(job.status || '').toLowerCase();
      if (status === 'ready' || status === 'completed') {
        readyJobs++;
      } else if (status === 'in_progress') {
        cookingJobs++;
      } else if (status === 'queued' || status === 'pending') {
        queuedJobs++;
      }
    });

    // ✅ Determine batch status
    let batchStatus = 'queued';

    if (readyJobs === totalJobs) {
      // كل الـ jobs جاهزة
      batchStatus = 'ready';
    } else if (cookingJobs > 0 || readyJobs > 0) {
      // بعض الـ jobs بدأت
      batchStatus = 'cooking';
    }

    return {
      status: batchStatus,
      totalJobs,
      readyJobs,
      cookingJobs,
      queuedJobs,
      progress: totalJobs > 0 ? Math.round((readyJobs / totalJobs) * 100) : 0
    };
  };

  /**
   * ✅ Helper: Check if ALL batches for an order have reached target status
   * If yes, update order_header.handoffStatus as summary
   *
   * @param {string} orderId - The order ID
   * @param {string} targetStatus - The target status ('assembled', 'served', etc.)
   * @param {string} timestamp - ISO timestamp
   */
  const checkAndUpdateOrderHeaderStatus = (orderId, targetStatus, timestamp) => {
    // ✅ CRITICAL FIX: Read from window.database (NOT watcherState!)
    // watcherState.batches may be stale/empty after watcher updates
    // window.database.job_order_batch is always up-to-date from watchers
    const allBatches = (window.database && Array.isArray(window.database.job_order_batch))
      ? window.database.job_order_batch
      : [];

    // ✅ CRITICAL: Match by prefix (startsWith) instead of exact match
    // orderId can be SHORT (DAR-001001) or FULL (DAR-001001-uuid)
    // batch.orderId is usually SHORT (DAR-001001)
    // We check if one starts with the other (bidirectional check)
    const orderIdStr = String(orderId);

    const orderBatches = allBatches.filter(b => {
      const batchOrderId = String(b.orderId || b.order_id || '');
      if (!batchOrderId) return false;

      // Match if orderId starts with batchOrderId OR batchOrderId starts with orderId
      const match = orderIdStr.startsWith(batchOrderId) || batchOrderId.startsWith(orderIdStr);
      return match;
    });

    console.log('[KDS][checkAndUpdateOrderHeaderStatus] Checking batches for order:', orderId, {
      orderIdStr,
      totalBatches: allBatches.length,
      orderBatches: orderBatches.length,
      targetStatus,
      batchStatuses: orderBatches.map(b => ({
        id: b.id,
        status: b.status,
        orderId: b.orderId || b.order_id
      }))
    });

    if (orderBatches.length === 0) {
      console.warn(`[KDS][checkAndUpdateOrderHeaderStatus] ⚠️ No batches found for order: ${orderId}`);
      console.warn('[KDS][checkAndUpdateOrderHeaderStatus] Available batch orderIds:', allBatches.map(b => b.orderId || b.order_id));
      return;
    }

    // Check if ALL batches for this order have reached targetStatus
    const allBatchesReady = orderBatches.every(b => b.status === targetStatus);

    if (allBatchesReady) {
      console.warn(`[KDS][checkAndUpdateOrderHeaderStatus] ✅ All batches ${targetStatus}, updating order_header:`, orderId);

      // ✅ CRITICAL FIX: Match by prefix for order_header lookup too
      // order_header.id is usually SHORT (DAR-001001)
      // orderId might be FULL (DAR-001001-uuid)
      const orderIdStr = String(orderId);

      // ✅ CRITICAL FIX: Read from window.database (NOT watcherState!)
      const allOrderHeaders = (window.database && Array.isArray(window.database.order_header))
        ? window.database.order_header
        : [];

      const orderHeader = allOrderHeaders.find(h => {
        const headerId = String(h.id || '');
        // Match if orderId starts with headerId OR headerId starts with orderId
        return orderIdStr.startsWith(headerId) || headerId.startsWith(orderIdStr);
      });

      if (orderHeader) {
        persistOrderHeaderStatus(orderHeader.id, targetStatus, timestamp);
      } else {
        console.warn(`[KDS][checkAndUpdateOrderHeaderStatus] ⚠️ order_header not found for:`, orderId);
        console.warn('[KDS][checkAndUpdateOrderHeaderStatus] Available orderHeader IDs:', allOrderHeaders.map(h => h.id));
      }
    } else {
      console.warn(`[KDS][checkAndUpdateOrderHeaderStatus] ⏳ Not all batches ${targetStatus} yet:`, {
        orderId,
        totalBatches: orderBatches.length,
        readyBatches: orderBatches.filter(b => b.status === targetStatus).length,
        batchStatuses: orderBatches.map(b => ({ id: b.id, status: b.status }))
      });
    }
  };

  // ✅ Helper: Retry logic with exponential backoff (same as posv2.js)
  const retryWithBackoff = async (operation, operationName, maxRetries = 3) => {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          //console.log(`✅ [KDS] ${operationName} succeeded on retry ${attempt}`);
        }
        return { success: true, result };
      } catch (err) {
        lastError = err;
        const isTimeout = err?.message?.includes('timed out') || err?.message?.includes('timeout');

        if (isTimeout && attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          console.warn(`⏱️ [KDS] ${operationName} timed out (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          break;
        }
      }
    }
    console.error(`❌ [KDS] ${operationName} failed after ${maxRetries + 1} attempts:`, lastError);
    return { success: false, error: lastError };
  };

  // ✅ Helper function to persist job order status changes to server
  const persistJobOrderStatusChange = async (jobId, statusPayload, actorInfo = {}) => {
    // ✅ CRITICAL FIX: Use store.update() with WebSocket for INSTANT real-time broadcast!
    // This is much better than REST API because:
    // 1. WebSocket broadcasts changes to all KDS instances immediately
    // 2. Faster than HTTP requests
    // 3. With retry logic, timeouts are handled gracefully

    //console.log('[KDS][persistJobOrderStatusChange] Starting status change via WebSocket:', {
     // jobId,
    //  status: statusPayload.status,
    //  progressState: statusPayload.progressState
   // });

    try {
      if (!store || typeof store.update !== 'function') {
        console.error('[KDS][persistJobOrderStatusChange] ❌ Store not available!');
        return;
      }
      const buildFallbackHeader = () => {
        const databaseHeaders = window.database?.job_order_header || [];
        const existingHeader = databaseHeaders.find(h => String(h.id) === String(jobId));
        if (existingHeader) return existingHeader;
        const watcherHeader = (watcherState.headers || []).find(h => String(h.id) === String(jobId));
        if (watcherHeader) return watcherHeader;
        const state = (typeof app?.getState === 'function') ? app.getState() : null;
        const jobsList = state?.data?.jobs?.list || [];
        const job = jobsList.find(j => String(j.id || j.jobOrderId) === String(jobId));
        if (!job) return null;
        return {
          id: job.id || job.jobOrderId || jobId,
          orderId: job.orderId || null,
          orderNumber: job.orderNumber || job.orderId || jobId,
          orderTypeId: job.orderTypeId || job.serviceMode || 'dine_in',
          serviceMode: job.serviceMode || job.orderTypeId || 'dine_in',
          stationId: job.stationId || null,
          stationCode: job.stationCode || job.stationId || null,
          status: job.status || 'queued',
          progressState: job.progressState || job.progress_state || 'awaiting',
          totalItems: Number(job.totalItems) || 0,
          completedItems: Number(job.completedItems) || 0,
          remainingItems: Number(job.remainingItems) || 0,
          tableLabel: job.tableLabel || null,
          customerName: job.customerName || null,
          dueAt: job.dueAt || null,
          acceptedAt: job.acceptedAt || job.createdAt || null,
          startedAt: job.startedAt || job.startAt || null,
          readyAt: job.readyAt || null,
          completedAt: job.completedAt || null,
          expoAt: job.expoAt || null,
          batchId: job.batchId || job.batch_id || null,
          meta: job.meta || { source: 'kds-fallback' },
          createdAt: job.createdAt || null,
          updatedAt: job.updatedAt || null
        };
      };

      // ✅ STEP 1: Update job_order_header via WebSocket
      const headerPayload = {
        id: jobId,  // ✅ CRITICAL: must include id for update
        status: statusPayload.status,
        progressState: statusPayload.progressState,
        progress_state: statusPayload.progressState,  // snake_case
        updatedAt: statusPayload.updatedAt || new Date().toISOString(),
        updated_at: statusPayload.updatedAt || new Date().toISOString()
      };

      // ✅ Add timestamp fields if present (needed for timer!)
      if (statusPayload.startedAt) {
        headerPayload.startedAt = statusPayload.startedAt;
        headerPayload.started_at = statusPayload.startedAt;
      }
      if (statusPayload.readyAt) {
        headerPayload.readyAt = statusPayload.readyAt;
        headerPayload.ready_at = statusPayload.readyAt;
      }
      if (statusPayload.completedAt) {
        headerPayload.completedAt = statusPayload.completedAt;
        headerPayload.completed_at = statusPayload.completedAt;
      }

      // ✅ CRITICAL FIX: Sanitize payload to prevent JSON parsing errors
      // Remove any non-serializable data (functions, undefined, circular refs, etc.)
      let sanitizedPayload;
      try {
        // This will strip out any problematic fields that can't be serialized
        sanitizedPayload = JSON.parse(JSON.stringify(headerPayload));
        //console.log('[KDS][persistJobOrderStatusChange] ✅ Payload sanitized successfully');
      } catch (sanitizeError) {
        console.error('[KDS][persistJobOrderStatusChange] ❌ Failed to sanitize payload:', sanitizeError);
        console.error('[KDS][persistJobOrderStatusChange] Original payload:', headerPayload);
        throw new Error(`Payload contains non-serializable data: ${sanitizeError.message}`);
      }

      //console.log('[KDS][persistJobOrderStatusChange] 📤 Updating job_order_header via WebSocket:', jobId, sanitizedPayload);

      // ✅ Update with retry logic (job_order_header is NOT versioned - no version needed)
      const headerResult = await retryWithBackoff(
        () => store.update('job_order_header', sanitizedPayload),
        `UPDATE job_order_header: ${jobId}`
      );

      // ✅ If update failed, try INSERT fallback (record may not exist due to previous timeout)
      if (!headerResult.success) {
        console.warn('[KDS][persistJobOrderStatusChange] ⚠️ UPDATE failed, attempting INSERT fallback...');

        const fallbackHeader = buildFallbackHeader();
        if (fallbackHeader) {
          const insertPayload = JSON.parse(JSON.stringify({
            ...fallbackHeader,
            ...sanitizedPayload
          }));

          const insertResult = await retryWithBackoff(
            () => store.insert('job_order_header', insertPayload, { silent: false }),
            `INSERT job_order_header: ${jobId}`
          );

          if (!insertResult.success) {
            throw new Error(`Failed to INSERT job_order_header after UPDATE failed: ${insertResult.error?.message}`);
          }

          //console.log('[KDS][persistJobOrderStatusChange] ✅ job_order_header inserted successfully (fallback)');
        } else {
          throw new Error(`Failed to update job_order_header and no fallback record available in state`);
        }
      } else {
        //console.log('[KDS][persistJobOrderStatusChange] ✅ job_order_header updated successfully');
      }

      // ✅ STEP 2: Update all job_order_detail for this job (in parallel)
      const allJobDetails = watcherState.lines || [];
      const jobDetails = allJobDetails.filter(detail =>
        String(detail.jobOrderId || detail.job_order_id) === jobId
      );

      //console.log('[KDS][persistJobOrderStatusChange] Updating job_order_detail:', {
    //    jobId,
      //  detailsCount: jobDetails.length,
     //   detailIds: jobDetails.map(d => d.id)
    //  });

      const detailPayload = {
        status: statusPayload.status,
        updatedAt: statusPayload.updatedAt || new Date().toISOString(),
        updated_at: statusPayload.updatedAt || new Date().toISOString()
      };

      // ✅ Add startAt if this is the first time starting
      if (statusPayload.status === 'in_progress' && statusPayload.startedAt) {
        detailPayload.startAt = statusPayload.startedAt;
        detailPayload.start_at = statusPayload.startedAt;
      }

      // ✅ Update all details in parallel via WebSocket (faster + broadcasts instantly!)
      const detailUpdatePromises = jobDetails.map(async (detail) => {
        // ✅ Sanitize detail payload
        const detailUpdatePayload = JSON.parse(JSON.stringify({
          id: detail.id,  // ✅ CRITICAL: must include id
          ...detailPayload
        }));

        // ✅ Update with retry logic (job_order_detail is NOT versioned)
        const result = await retryWithBackoff(
          () => store.update('job_order_detail', detailUpdatePayload),
          `UPDATE job_order_detail: ${detail.id}`
        );

        // ✅ If update failed, try INSERT fallback
        if (!result.success) {
          console.warn(`[KDS][persistJobOrderStatusChange] ⚠️ UPDATE failed for detail ${detail.id}, attempting INSERT fallback...`);

          const insertPayload = JSON.parse(JSON.stringify({
            ...detail,
            ...detailPayload
          }));

          const insertResult = await retryWithBackoff(
            () => store.insert('job_order_detail', insertPayload, { silent: false }),
            `INSERT job_order_detail: ${detail.id}`
          );

          if (!insertResult.success) {
            console.error(`[KDS][persistJobOrderStatusChange] ❌ Failed to update job_order_detail ${detail.id}:`, insertResult.error);
            return { success: false, id: detail.id, error: insertResult.error };
          }

          //console.log(`[KDS][persistJobOrderStatusChange] ✅ job_order_detail inserted (fallback): ${detail.id}`);
        } else {
          //console.log(`[KDS][persistJobOrderStatusChange] ✅ job_order_detail updated: ${detail.id}`);
        }

        return { success: true, id: detail.id };
      });

      const detailResults = await Promise.all(detailUpdatePromises);
      const successCount = detailResults.filter(r => r.success).length;

      //console.log('[KDS][persistJobOrderStatusChange] job_order_detail updates completed:', {
     //   total: detailResults.length,
    //    success: successCount,
    //    failed: detailResults.length - successCount
   //   });

      // ✅ STEP 3: Update order_line (only for items in this job)
      const baseOrderId = extractBaseOrderId(jobId);

      if (baseOrderId && statusPayload.status) {
        const jobItemIds = jobDetails.map(detail =>
          String(detail.itemId || detail.item_id || '')
        ).filter(id => id);

        const orderLines = watcherState.orderLines || [];
        const matchingLines = orderLines.filter(line => {
          const lineOrderId = String(line.orderId || line.order_id || '');
          const lineItemId = String(line.itemId || line.item_id || '');
          // ✅ Match both full ID and short ID (order_line.orderId can be either)
          const lineBaseOrderId = extractBaseOrderId(lineOrderId);
          const matchesOrder = lineOrderId === baseOrderId || lineBaseOrderId === baseOrderId;
          return matchesOrder && jobItemIds.includes(lineItemId);
        });

        //console.log('[KDS][persistJobOrderStatusChange] Updating order_line:', {
       //   baseOrderId,
       //   matchingLines: matchingLines.length,
       //   lineIds: matchingLines.map(l => l.id)
      //  });

        // ✅ Update all matching lines in parallel via WebSocket
        // ⚠️ order_line is VERSIONED table - must include version!
        const lineUpdatePromises = matchingLines.map(async (line) => {
          // ✅ Calculate version (order_line IS versioned!)
          const currentVersion = line.version || 1;
          const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

          if (!Number.isFinite(nextVersion) || nextVersion < 1) {
            console.error(`❌ [KDS] Cannot update order_line without valid version!`, {
              lineId: line.id,
              currentVersion,
              nextVersion
            });
            return { success: false, id: line.id, error: new Error('Invalid version') };
          }

          const lineUpdatePayload = {
            id: line.id,
            statusId: statusPayload.status,
            status: statusPayload.status,
            status_id: statusPayload.status,
            version: nextVersion,  // ✅ CRITICAL: order_line needs version!
            updatedAt: statusPayload.updatedAt || new Date().toISOString(),
            updated_at: statusPayload.updatedAt || new Date().toISOString()
          };

          const result = await retryWithBackoff(
            () => store.update('order_line', lineUpdatePayload),
            `UPDATE order_line: ${line.id} (v${currentVersion}→v${nextVersion})`
          );

          if (!result.success) {
            console.error(`[KDS][persistJobOrderStatusChange] ❌ Failed to update order_line ${line.id}:`, result.error);
            return { success: false, id: line.id, error: result.error };
          }

          //console.log(`[KDS][persistJobOrderStatusChange] ✅ order_line updated: ${line.id} (v${nextVersion})`);
          return { success: true, id: line.id };
        });

        await Promise.all(lineUpdatePromises);

        // ✅ STEP 4: Check if ALL order_lines ready, then update order_header
        const orderAllLines = orderLines.filter(line => {
          const lineOrderId = String(line.orderId || line.order_id || '');
          // ✅ Match both full ID and short ID
          const lineBaseOrderId = extractBaseOrderId(lineOrderId);
          return lineOrderId === baseOrderId || lineBaseOrderId === baseOrderId;
        });
        const allLinesReady = orderAllLines.every(line => {
          const lineStatus = String(line.status || line.statusId || '');
          //console.log("lineStatus",lineStatus);
          return lineStatus === 'ready' || lineStatus === 'served' || lineStatus === 'completed';
        });

        if (allLinesReady && orderAllLines.length > 0) {
          //console.log('[KDS][persistJobOrderStatusChange] All lines ready, updating order_header via WebSocket:', baseOrderId);

          // ✅ Find order_header to get current version (order_header IS versioned!)
          const orderHeaders = watcherState.orderHeaders || [];
          const orderHeader = orderHeaders.find(h => {
            // ✅ CRITICAL FIX: Search by id (primary key) first!
            // order_header.id might be "DAR-001001" (the actual PK)
            // while orderId might be undefined or different
            const headerId = String(h.id || '');
            const headerOrderId = String(h.orderId || h.order_id || '');
            const extractedBaseOrderId = extractBaseOrderId(headerOrderId);
            return headerId === baseOrderId || headerOrderId === baseOrderId || extractedBaseOrderId === baseOrderId;
          });

          if (orderHeader) {
            const currentVersion = orderHeader.version || 1;
            const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

            if (Number.isFinite(nextVersion) && nextVersion >= 1) {
              const orderHeaderUpdate = {
                id: orderHeader.id,  // ✅ CRITICAL FIX: Use orderHeader.id (real UUID) not baseOrderId (short ID)!
                status: 'ready',
                statusId: 'ready',
                status_id: 'ready',
                version: nextVersion,  // ✅ CRITICAL: order_header needs version!
                updatedAt: statusPayload.updatedAt || new Date().toISOString(),
                updated_at: statusPayload.updatedAt || new Date().toISOString()
              };

              await retryWithBackoff(
                () => store.update('order_header', orderHeaderUpdate),
                `UPDATE order_header: ${baseOrderId} (v${currentVersion}→v${nextVersion})`
              );

              //console.log(`[KDS][persistJobOrderStatusChange] ✅ order_header updated to ready: ${baseOrderId} (v${nextVersion})`);
            } else {
              console.error(`❌ [KDS] Cannot update order_header without valid version!`, {
                orderId: baseOrderId,
                currentVersion,
                nextVersion
              });
            }
          } else {
            console.warn(`[KDS][persistJobOrderStatusChange] ⚠️ order_header not found for: ${baseOrderId}`);
          }

          //console.log('[KDS][persistJobOrderStatusChange] ✅ order_header updated to ready');
        }
      }

      //console.log('[KDS][persistJobOrderStatusChange] ✅ All updates completed successfully');

      // ✅ STEP 5: Update local watcherState for immediate UI update
      watcherState.headers = (watcherState.headers || []).map(h => {
        if (String(h.id) === String(jobId)) {
          return {
            ...h,
            status: statusPayload.status,
            progressState: statusPayload.progressState,
            progress_state: statusPayload.progressState,
            startedAt: statusPayload.startedAt || h.startedAt,
            started_at: statusPayload.startedAt || h.started_at,
            readyAt: statusPayload.readyAt || h.readyAt,
            ready_at: statusPayload.readyAt || h.ready_at,
            completedAt: statusPayload.completedAt || h.completedAt,
            completed_at: statusPayload.completedAt || h.completed_at,
            updatedAt: statusPayload.updatedAt || new Date().toISOString(),
            updated_at: statusPayload.updatedAt || new Date().toISOString()
          };
        }
        return h;
      });

      // ✅ Update watcherState.lines immediately
      watcherState.lines = (watcherState.lines || []).map(detail => {
        const detailJobId = String(detail.jobOrderId || detail.job_order_id);
        if (detailJobId === String(jobId)) {
          return {
            ...detail,
            status: statusPayload.status,
            startAt: statusPayload.startedAt || detail.startAt,
            start_at: statusPayload.startedAt || detail.start_at,
            updatedAt: statusPayload.updatedAt || new Date().toISOString(),
            updated_at: statusPayload.updatedAt || new Date().toISOString()
          };
        }
        return detail;
      });

      // ✅ STEP 6: Update job_order_batch status dynamically
      // Extract batchId from the updated job
      const updatedJob = watcherState.headers.find(h => String(h.id) === String(jobId));
      const batchId = updatedJob ? (updatedJob.batchId || updatedJob.batch_id) : null;

      if (batchId) {
        // Get current batch record
        const currentBatch = (watcherState.batches || []).find(b =>
          String(b.id) === String(batchId)
        );
        const currentBatchStatus = currentBatch?.status;

        // ✅ CRITICAL: Don't override batch.status if already in handoff phase!
        // batch.status progression: queued → ready → assembled → served → delivered
        // Once in handoff (assembled/served/delivered), status is managed by handoff handlers
        // DON'T check timestamps - they can be stale from failed updates!
        const isLocked = ['assembled', 'served', 'delivered', 'settled'].includes(currentBatchStatus);

        if (isLocked) {
          //console.log('[KDS][persistJobOrderStatusChange] ⚠️ Batch status is locked (already assembled/served/delivered):', {
          //  batchId,
         //   currentStatus: currentBatchStatus,
          //  skippingUpdate: true
        //  });
          // Don't update batch.status - keep it as is
        } else {
          // Batch is still in cooking phase - update status based on jobs
          const batchJobs = watcherState.headers.filter(h =>
            String(h.batchId || h.batch_id) === String(batchId)
          );

          // Compute batch status
          const batchInfo = computeBatchStatus(batchJobs);

          //console.log('[KDS][persistJobOrderStatusChange] Batch status computed:', {
          //  batchId,
          //  status: batchInfo.status,
          //  progress: `${batchInfo.readyJobs}/${batchInfo.totalJobs}`,
         //   progressPercent: batchInfo.progress
         // });

          // ✅ Update batch via store.update (triggers watch!)
          try {
            if (store && typeof store.update === 'function') {
              await store.update('job_order_batch', {
                id: batchId,
                status: batchInfo.status,
                readyJobs: batchInfo.readyJobs,
                ready_jobs: batchInfo.readyJobs,
                updatedAt: statusPayload.updatedAt || new Date().toISOString(),
                updated_at: statusPayload.updatedAt || new Date().toISOString()
              });

              //console.log('[KDS][persistJobOrderStatusChange] ✅ Batch status updated via store.update:', batchInfo.status);
            } else {
              console.warn('[KDS][persistJobOrderStatusChange] ⚠️ Store not available, skipping batch update');
            }
          } catch (batchError) {
            console.error('[KDS][persistJobOrderStatusChange] ❌ Failed to update batch:', batchError);
          }
        }
      }

      // ✅ Trigger re-render
      updateFromWatchers();

    } catch (error) {
      console.error('[KDS][persistJobOrderStatusChange] ❌ Failed to persist status change:', error);
      throw error;  // Re-throw to let caller handle
    }
  };

  // ✅ Helper function to persist order_header status changes with retry logic
  // Uses watcherState THEN store.update() for immediate consistency
  const persistOrderHeaderStatus = async (orderId, status, timestamp, retryCount = 0) => {
    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000]; // Exponential backoff: 2s, 4s, 8s

    if (!store || typeof store.update !== 'function') {
      console.warn('[KDS][persistOrderHeaderStatus] ⚠️ Store not available - changes will be lost on refresh!');
      return;
    }

    try {
      // ✅ CRITICAL FIX: Extract short order ID for order_header lookup
      // orderId might be FULL job_order_header.id (long) but order_header.id is SHORT
      // Example: "DAR-001001-uuid-timestamp" → "DAR-001001"
      const shortOrderId = extractBaseOrderId(orderId);

      // ✅ CRITICAL FIX: Read from window.database (NOT watcherState!)
      // window.database.order_header is always up-to-date from watchers
      // watcherState.orderHeaders may be stale between watcher updates
      const allOrderHeaders = (window.database && Array.isArray(window.database.order_header))
        ? window.database.order_header
        : [];

      const currentHeader = allOrderHeaders.find(h => String(h.id) === String(shortOrderId));

      if (!currentHeader) {
        console.warn('[KDS][persistOrderHeaderStatus] ⚠️ order_header not found in window.database:', shortOrderId, '(original:', orderId, ')');
        return;
      }

      // ✅ STEP 2: Get FRESH version from window.database (always latest!)
      // This prevents version conflicts caused by stale watcherState data
      const currentVersion = currentHeader.version || 1;
      const nextVersion = Number.isFinite(currentVersion) ? Math.trunc(currentVersion) + 1 : 2;

      console.log('[KDS][persistOrderHeaderStatus] Version info:', {
        orderId: shortOrderId,
        currentVersion,
        nextVersion,
        currentStatus: currentHeader.status,
        targetStatus: status
      });

      // ✅ CRITICAL VALIDATION: Ensure version exists
      if (!Number.isFinite(nextVersion) || nextVersion < 1) {
        console.error('❌ [KDS] FATAL: Cannot update order_header without valid version!', {
          orderId,
          currentVersion,
          nextVersion
        });
        return;
      }

      // ✅ STEP 3: Create update payload with ONLY changed fields (not the whole record!)
      const headerUpdate = {
        id: currentHeader.id,
        status: status,
        statusId: status,
        status_id: status,
        version: nextVersion,
        updatedAt: timestamp || new Date().toISOString(),
        updated_at: timestamp || new Date().toISOString()
      };

      // ✅ CRITICAL FIX: Update fulfillmentStage based on order type and action
      const serviceMode = currentHeader.type || currentHeader.serviceMode || currentHeader.orderTypeId || currentHeader.order_type_id || 'dine_in';

      if (status === 'assembled') {
        headerUpdate.fulfillmentStage = 'ready';
        headerUpdate.fulfillment_stage = 'ready';
        const allPayments = (window.database && Array.isArray(window.database.order_payment)) ? window.database.order_payment : [];
        const paidSum = allPayments.filter(p => String(p.orderId || p.order_id) === String(shortOrderId)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const totalDue = Number(currentHeader.total_due || currentHeader.totalDue || currentHeader.amount || 0);
        if (serviceMode === 'dine_in' && totalDue > 0 && paidSum >= totalDue) {
          headerUpdate.fulfillmentStage = 'closed';
          headerUpdate.fulfillment_stage = 'closed';
          headerUpdate.status = 'closed';
        }
      } else if (status === 'served') {
        // ✅ Only takeaway orders are closed when served from KDS
        if (serviceMode === 'takeaway') {
          headerUpdate.fulfillmentStage = 'closed';
          headerUpdate.fulfillment_stage = 'closed';
        } else {
          headerUpdate.fulfillmentStage = 'delivered';
          headerUpdate.fulfillment_stage = 'delivered';
        }
      } else if (status === 'delivered') {
        // ✅ When delivery is marked as delivered, move to pending_settlement
        if (serviceMode === 'delivery') {
          headerUpdate.fulfillmentStage = 'pending_settlement';
          headerUpdate.fulfillment_stage = 'pending_settlement';
        } else {
          headerUpdate.fulfillmentStage = 'delivered';
          headerUpdate.fulfillment_stage = 'delivered';
        }
      }

      // ✅ STEP 4: Update with proper version
      await Promise.race([
        store.update('order_header', headerUpdate),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Update timeout after 10s')), 10000))
      ]);

      // ✅ STEP 5: Update window.database for immediate UI update (optimistic update)
      // Don't update watcherState - it will be refreshed by watcher automatically
      if (window.database && Array.isArray(window.database.order_header)) {
        window.database.order_header = window.database.order_header.map(header => {
          // ✅ CRITICAL: Match using shortOrderId since order_header.id is SHORT
          if (String(header.id) === String(shortOrderId)) {
            return {
              ...header,
              statusId: status,
              status: status,
              status_id: status,
              version: nextVersion,
              fulfillmentStage: headerUpdate.fulfillmentStage,
              fulfillment_stage: headerUpdate.fulfillment_stage,
              updatedAt: headerUpdate.updatedAt,
              updated_at: headerUpdate.updated_at
            };
          }
          return header;
        });
        console.log('[KDS][persistOrderHeaderStatus] ✅ Optimistic update applied to window.database');
      }

      // ✅ Broadcast the change to other KDS instances
      if (syncClient && typeof syncClient.publishHandoffUpdate === 'function') {
        syncClient.publishHandoffUpdate({
          orderId,
          payload: { status, updatedAt: timestamp }
        });
      }

    } catch (error) {
      const isTimeout = error?.message?.includes('timeout') || error?.message?.includes('timed out');
      const isVersionConflict = error?.code === 'VERSION_CONFLICT';

      console.error('[KDS][persistOrderHeaderStatus] ❌ Failed (attempt ' + (retryCount + 1) + '):', {
        error: error.message,
        isTimeout,
        isVersionConflict,
        orderId
      });

      // ✅ Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = retryDelays[retryCount];
        setTimeout(() => {
          persistOrderHeaderStatus(orderId, status, timestamp, retryCount + 1);
        }, delay);
      } else {
        // ❌ All retries failed
        console.error('[KDS][persistOrderHeaderStatus] ❌ All retries failed:', orderId);
      }
    }
  };

  // ✅ Helper function to persist delivery assignment to database (BATCH-BASED)
  const persistDeliveryAssignment = async (batchId, assignment, retryCount = 0) => {
    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000];

    if (!store || typeof store.insert !== 'function' || typeof store.update !== 'function') {
      console.warn('[KDS][persistDeliveryAssignment] ⚠️ Store not available');
      return;
    }

    try {
      // ✅ Prepare delivery record (BATCH-BASED)
      // Each batch has independent delivery assignment
      const deliveryRecord = {
        id: batchId,  // ✅ PRIMARY KEY: batchId (not orderId!)
        batchId: batchId,  // ✅ batch_id for reference
        batch_id: batchId,
        orderId: assignment.orderId,  // ✅ Keep orderId for reference only
        order_id: assignment.orderId,
        driverId: assignment.driverId,
        driver_id: assignment.driverId,
        driverName: assignment.driverName,
        driver_name: assignment.driverName,
        driverPhone: assignment.driverPhone || '',
        driver_phone: assignment.driverPhone || '',
        vehicleId: assignment.vehicleId || '',
        vehicle_id: assignment.vehicleId || '',
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        assigned_at: assignment.assignedAt,
        deliveredAt: assignment.deliveredAt || null,
        delivered_at: assignment.deliveredAt || null,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // ✅ Try insert first, if it fails (duplicate), try update
      try {
        await Promise.race([
          store.insert('delivery_driver', deliveryRecord),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Insert timeout after 10s')), 10000))
        ]);
      } catch (insertError) {
        // If insert failed (likely duplicate), try update
        // ℹ️ NOTE: delivery_driver is NOT a versioned table (per MISHKAH_STORE_UPDATE_GUIDE.md)
        // Only order_header and order_line require version field
        // However, we still include version field for compatibility with backend
        //console.log('[KDS][persistDeliveryAssignment] Insert failed, trying update:', insertError.message);

        const updateRecord = {
          ...deliveryRecord
          // ℹ️ delivery_driver is NOT versioned - version field not required
        };

        await Promise.race([
          store.update('delivery_driver', updateRecord),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Update timeout after 10s')), 10000))
        ]);

        //console.log('[KDS][persistDeliveryAssignment] ✅ Update successful');
      }

    } catch (error) {
      console.error('[KDS][persistDeliveryAssignment] ❌ Failed (attempt ' + (retryCount + 1) + '):', error);

      if (retryCount < maxRetries) {
        const delay = retryDelays[retryCount];
        setTimeout(() => {
          persistDeliveryAssignment(batchId, assignment, retryCount + 1);
        }, delay);
      } else {
        console.error('[KDS][persistDeliveryAssignment] ❌ All retries failed for batch:', batchId);
      }
    }
  };

  const ensureArray = (value) => (Array.isArray(value) ? value : []);

  const computeOrderDueForKds = (db, orderId) => {
    const headers = ensureArray(db?.order_header);
    const target = headers.find(h => {
      const hid = String(h.orderId || h.order_id || h.id || '');
      const base = extractBaseOrderId(hid);
      return hid === orderId || base === orderId || String(h.id) === orderId;
    }) || {};
    const totals = typeof target.totals === 'object' ? target.totals : (typeof target.metadata === 'object' ? target.metadata : {});
    const candidates = [
      totals?.due,
      target?.total_due,
      target?.totalDue,
      target?.total,
      target?.total_amount,
      target?.grand_total,
      target?.amount_due,
      target?.net_total
    ];
    let due = 0;
    for(let i=0;i<candidates.length;i++){
      const n = Number(candidates[i]);
      if(Number.isFinite(n) && n > 0){ due = n; break; }
    }
    if(!(Number.isFinite(due) && due > 0)){
      const lines = ensureArray(db?.order_line).filter(l => {
        const lid = String(l.orderId || l.order_id || '');
        const base = extractBaseOrderId(lid);
        return lid === orderId || base === orderId;
      });
      let subtotal = 0;
      for(let i=0;i<lines.length;i++){
        const line = lines[i];
        const qty = Number(line.quantity ?? line.qty ?? 1) || 1;
        const unitPrice = Number(line.unitPrice ?? line.unit_price ?? line.price ?? 0) || 0;
        const lt = Number(line.total ?? 0);
        const total = (Number.isFinite(lt) && lt > 0) ? lt : unitPrice * qty;
        subtotal += total;
      }
      due = subtotal;
    }
    return Math.max(0, Number(due) || 0);
  };
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

    // Try colon separator first (old format: "DAR-001003:uuid")
    const colonIndex = id.indexOf(':');
    if (colonIndex > 0) return id.slice(0, colonIndex);

    // ✅ Try to find UUID pattern (new format: "DAR-001003-uuid-timestamp-random")
    // UUID format: 8-4-4-4-12 characters (36 chars total with dashes)
    // jobId format: "DAR-001001-1e7a48ec-425a-4268-81db-c8f3fd4d432e-1763200716204-9juc46"
    // We want to extract everything BEFORE the first UUID
    const uuidRegex = /^(.*?)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = id.match(uuidRegex);
    if (match) {
      return match[1];  // Returns "DAR-001001"
    }

    // Fallback: return full ID
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
    upsert(payload?.delivery_drivers);  // ✅ Read from delivery_drivers
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
    const posPayload = watcherState.posPayload || {};    // ✅ Read master data from watcherState instead of posPayload
    const kitchenSectionsFromWatcher = ensureArray(watcherState.kitchenSections);
    const menuItemsFromWatcher = ensureArray(watcherState.menuItems);
    const categorySectionsFromWatcher = ensureArray(watcherState.categorySections);
    const stations = kitchenSectionsFromWatcher.length > 0
      ? kitchenSectionsFromWatcher.map(section => ({
          id: section.id,
          code: section.code || section.id,
          nameAr: section.section_name?.ar || section.nameAr || '',
          nameEn: section.section_name?.en || section.nameEn || '',
          stationType: section.stationType || 'prep',
          isExpo: section.isExpo || false,
          themeColor: section.themeColor || null,
          sequence: section.sortOrder || 0
        }))
      : buildStations(posPayload, posPayload?.kds || {}, posPayload?.master || {});

    const stationMap = toStationMap(stations);
    const kitchenSections = kitchenSectionsFromWatcher.length > 0
      ? kitchenSectionsFromWatcher
      : normalizeKitchenSections(posPayload?.kitchen_sections);
    const stationCategoryRoutes = categorySectionsFromWatcher.length > 0
      ? categorySectionsFromWatcher.map(route => ({
          id: route.id,
          categoryId: route.categoryId || route.category_id,
          stationId: route.sectionId || route.section_id || route.stationId || route.station_id,
          priority: route.priority || 0,
          isActive: route.isActive !== false,
          createdAt: route.createdAt,
          updatedAt: route.updatedAt
        }))
      : normalizeCategoryRoutes(posPayload?.category_sections);

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
    const items = menuItemsFromWatcher.length > 0
      ? menuItemsFromWatcher.map(item => ({
          id: item.id,
          itemId: item.id,
          code: item.sku || item.code,
          nameAr: item.item_name?.ar || item.nameAr || '',
          nameEn: item.item_name?.en || item.nameEn || '',
          categoryId: item.categoryId || item.category_id,
          sectionId: item.kitchenSectionId || item.kitchen_section_id,
          price: item.pricing?.base || item.basePrice || 0,
          meta: { media: item.media || {} }
        }))
      : deriveMenuItems(posPayload);    const itemById = new Map();
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
    });    const getItemById = (value) => {
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

    // ✅ Read drivers from watcher first (like kitchenSections and menuItems)
    const driversFromWatcher = ensureArray(watcherState.drivers);
    const drivers = driversFromWatcher.length > 0
      ? driversFromWatcher.map(driver => ({
          id: driver.id,
          code: driver.code || driver.id,
          name: driver.name || driver.id,
          phone: driver.phone || '',
          vehicleId: driver.vehicleId || driver.vehicle_id || '',
          isActive: driver.isActive !== false
        }))
      : deriveDrivers(posPayload);
    const driverIndex = new Map(drivers.map((driver) => [driver.id, driver]));

    // ✅ Read payment methods from watcher first (like kitchenSections and menuItems)
    const paymentMethodsFromWatcher = ensureArray(watcherState.paymentMethods);
    const paymentMethods = paymentMethodsFromWatcher.length > 0
      ? paymentMethodsFromWatcher
      : Array.isArray(posPayload?.payment_methods)
        ? posPayload.payment_methods
        : Array.isArray(posPayload?.settings?.payment_methods)
          ? posPayload.settings.payment_methods
          : [];

    // ✅ Create a map from jobOrderId to stationId from job_order_header
    const jobOrderStationMap = new Map();
    ensureArray(watcherState.headers).forEach((header) => {
      const jobOrderId = canonicalId(
        header?.id ||
          header?.jobOrderId ||
          header?.job_order_id ||
          header?.orderJobId ||
          header?.job_id
      );
      const stationId = canonicalId(
        header?.stationId ||
          header?.station_id ||
          header?.kitchenSectionId ||
          header?.kitchen_section_id
      );
      if (jobOrderId && stationId) {
        jobOrderStationMap.set(jobOrderId, stationId);
      }
    });
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
      );      if (!jobOrderId) return;
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
        {};      const resolvedItemId =
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
      // ✅ Get stationId from job_order_header first (most reliable source)
      let sectionId =
        jobOrderStationMap.get(jobOrderId) ||
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
        null;      if (!sectionId) {
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
        // ✅ CRITICAL FIX: Read status and progressState from order.header
        // This prevents status from being reset when adding new items
        const headerStatus = order.header?.status || 'queued';
        const headerProgressState = order.header?.progressState || order.header?.progress_state;

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
          status: headerStatus,  // ✅ Read from header, not hardcoded
          progressState: headerProgressState,  // ✅ Read from header
          totalItems: 0,
          completedItems: 0,
          remainingItems: 0,
          createdAt: order.openedAt,
          acceptedAt: order.openedAt,
          dueAt: order.dueAt,
          readyAt: order.header?.readyAt || order.header?.ready_at || null,
          completedAt: order.header?.completedAt || order.header?.completed_at || null,
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
      const finalItemNameAr =
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
          job.stationCode;
      const finalItemNameEn =
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
          job.stationCode;      job.details.push({
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
        itemNameAr: finalItemNameAr,
        itemNameEn: finalItemNameEn,
        prepNotes: (() => {
          // ✅ FIXED: Handle notes properly to avoid [object object]
          const notes = line?.notes || line?.prepNotes || metadata?.prepNotes || metadata?.notes;
          if(!notes) return '';
          if(Array.isArray(notes)) return notes.filter(Boolean).map(n => {
            if(typeof n === 'string') return n;
            if(typeof n === 'object'){
              if(n.message) return String(n.message);
              if(n.text) return String(n.text);
              if(n.note) return String(n.note);
              if(n.content) return String(n.content);
            }
            return '';
          }).filter(Boolean).join(' • ');
          if(typeof notes === 'string') return notes;
          if(typeof notes === 'object'){
            if(notes.message) return String(notes.message);
            if(notes.text) return String(notes.text);
            if(notes.note) return String(notes.note);
            if(notes.content) return String(notes.content);
          }
          return '';
        })()
      });
    });
    orders.forEach((order) => {
      order.jobs.forEach((job) => {
        job.remainingItems = Math.max(0, job.totalItems - job.completedItems);
        // ✅ CRITICAL FIX: Read status from job object (which comes from watcherState.headers)
        // Don't recalculate it, otherwise we'll overwrite the status we just updated!
        const status = job.status || (
          job.totalItems > 0 && job.completedItems >= job.totalItems
            ? 'ready'
            : job.completedItems > 0
            ? 'in_progress'
            : 'queued'
        );
        const progressState = job.progressState || (
          status === 'ready' ? 'completed' : status === 'in_progress' ? 'cooking' : 'awaiting'
        );
        jobHeaders.push({
          id:  job.id,
          jobOrderId:  job.id,
          orderId: job.orderId,
          orderNumber: job.orderNumber,
          batchId: order.header?.batchId || order.header?.batch_id || null,
          batch_id: order.header?.batch_id || order.header?.batchId || null,
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

    const lastStoreTables = getLastStoreTables();
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

    // ✅ FIX: Don't rely on posPayload (it's null since pos_database is deprecated)
    // Use watcherState.channel (set from sync messages) or default to BRANCH_CHANNEL
    const channelSource = watcherState.channel || BRANCH_CHANNEL;
    const channel = normalizeChannelName(channelSource, BRANCH_CHANNEL);
    watcherState.channel = channel;

    // ✅ Build order_header and order_line from watcherState for static tabs
    const orderHeaders = ensureArray(watcherState.orderHeaders).length
      ? ensureArray(watcherState.orderHeaders)
      : ensureArray(lastStoreTables.order_header);
    const orderLines = ensureArray(watcherState.orderLines).length
      ? ensureArray(watcherState.orderLines)
      : ensureArray(lastStoreTables.order_line);

    // ✅ Flat structure: job order tables at root level (consistent with POS)
    const payload = {
      order_header: orderHeaders,           // ✅ For static tabs
      order_line: orderLines,               // ✅ For static tabs
      job_order_header: (ensureArray(jobHeaders).length ? jobHeaders : ensureArray(lastStoreTables.job_order_header)),
      job_order_detail: (ensureArray(jobDetails).length ? jobDetails : ensureArray(lastStoreTables.job_order_detail)),
      job_order_detail_modifier: [],
      job_order_status_history: ensureArray(lastStoreTables.job_order_status_history),
      job_order_batch: (ensureArray(watcherState.batches).length ? ensureArray(watcherState.batches) : ensureArray(lastStoreTables.job_order_batch)),  // ✅ NEW: Add batches for timer accuracy
      expo_pass_ticket: [],  // ✅ FIX: Empty since posPayload is null
      master: {
        stations,
        stationCategoryRoutes,
        kitchenSections,
        categorySections,
        categories,
        items,
        drivers,
        metadata: {},  // ✅ FIX: Empty since posPayload is null
        sync: { channel },
        channel
      },
      deliveries,
      handoff,
      drivers,
      meta: {},  // ✅ FIX: Empty since posPayload is null
      branch: {}  // ✅ FIX: Empty since posPayload is null
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
        orderHeaders: ensureArray(watcherState.orderHeaders).length,  // ✅
        orderLines: ensureArray(watcherState.orderLines).length,      // ✅
        deliveries: ensureArray(watcherState.deliveries).length
      },
      payload: payloadSummary
    };
    const label = `[Mishkah][KDS][Watcher] payload → headers:${counts.headers ?? 0} details:${counts.details ?? 0} sections:${counts.kitchenSections ?? counts.stations ?? 0}`;
    logDebugGroup(label, lastWatcherSnapshot);
    return payload;
  };

  const updateFromWatchers = () => {
    //console.log('🔄 [KDS] updateFromWatchers() CALLED');

    const payload = buildWatcherPayload();

    //console.log('📦 [KDS] Built payload:', {
     // orderHeaderCount: payload?.order_header?.length || 0,
     // orderLineCount: payload?.order_line?.length || 0,
   //   jobHeaderCount: payload?.job_order_header?.length || 0,
    //  jobDetailCount: payload?.job_order_detail?.length || 0,
   //   batchCount: payload?.job_order_batch?.length || 0
   // });

    // ✅ Check flat structure for both static tabs (order_header/order_line) and dynamic tabs (job_order_*)
    const hasData = payload && (
      (Array.isArray(payload.order_header) && payload.order_header.length > 0) ||
      (Array.isArray(payload.order_line) && payload.order_line.length > 0) ||
      (Array.isArray(payload.job_order_header) && payload.job_order_header.length > 0) ||
      (Array.isArray(payload.job_order_detail) && payload.job_order_detail.length > 0)
    );

    //console.log('✅ [KDS] hasData check:', hasData);

    if (!hasData) {
      //console.log('⚠️ [KDS] No data to display, skipping applyRemoteOrder');
      return;
    }

    //console.log('📤 [KDS] Calling applyRemoteOrder with payload');
    applyRemoteOrder(app, payload, { channel: watcherState.channel || BRANCH_CHANNEL });
    // ✅ FIX: Don't use posPayload (it's null) - use initialState instead
    const lang = initialState.env.lang || 'ar';
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
            ...(state.data.meta || {})
            // ✅ FIX: Don't merge posPayload (it's null)
          },
          branch: payload.branch || state.data.branch || {}
        }
      };
    });
    if (typeof window !== 'undefined') {
      // ✅ CRITICAL FIX: Use payload from watchers, NOT pos_database.payload (which is deprecated)
      // payload contains: job_order_header, job_order_detail, job_order_batch, order_header, order_line
      window.database = payload;
      window.watcherState = watcherState;  // ✅ For debugging
      window.MishkahBranchChannel = watcherState.channel || BRANCH_CHANNEL;
      window.MishkahKdsChannel = window.MishkahBranchChannel;
    }
  };

  // ✅ KDS uses mishkah-store (pos-db) for reading and writing
  if (store && typeof store.watch === 'function') {
    // Register tables needed by KDS
    const registeredObjects = (store.config && typeof store.config.objects === 'object')
      ? Object.keys(store.config.objects)
      : [];

    const tablesToRegister = [
      { name: 'job_order_header', table: 'job_order_header' },
      { name: 'job_order_detail', table: 'job_order_detail' },
      { name: 'job_order_batch', table: 'job_order_batch' },    // ✅ CRITICAL: Register batches table
      { name: 'order_header', table: 'order_header' },
      { name: 'order_line', table: 'order_line' },
      { name: 'order_delivery', table: 'order_delivery' },
      { name: 'delivery_drivers', table: 'delivery_drivers' },  // ✅ Fixed: plural
      { name: 'payment_methods', table: 'payment_methods' },    // ✅ Added
      { name: 'order_payment', table: 'order_payment' },
      { name: 'pos_database', table: 'pos_database' },
      // ✅ Register master data tables directly from REST API
      { name: 'kitchen_sections', table: 'kitchen_sections' },
      { name: 'menu_items', table: 'menu_items' },
      { name: 'category_sections', table: 'category_sections' }
    ];

    if (typeof store.register === 'function') {
      tablesToRegister.forEach(({ name, table }) => {
        if (!registeredObjects.includes(name)) {
          try {
            store.register(name, { table });
          } catch (err) {
            console.warn('[KDS] Failed to register table', name, err);
          }
        } else {
        }
      });
    }

    // SMART STORE: الـ store بقى ذكي ويعرف يجيب البيانات الأولية تلقائياً من REST API
    // لما الـ cache يكون فاضي عند أول watch() call
    // مش محتاجين نعمل fetch يدوي بعد كده! 🎉
    const setupWatchers = () => {
      //console.log('🎬 [KDS] setupWatchers() CALLED - Installing all watchers now!');

      // ✅ DEBUG: Log registered tables to verify job_order_header exists
      //console.log('🔍🔍🔍 [KDS] Store configuration:', {
     //   configObjects: Object.keys(store.config?.objects || {}),
      //  hasJobOrderHeader: store.config?.objects?.hasOwnProperty('job_order_header'),
       // connected: store?.connected || 'unknown',
      //  totalWatchers: watcherUnsubscribers.length
    //  });

      watcherUnsubscribers.push(
        store.status((status) => {
          watcherState.status =
            typeof status === 'string' ? status : status?.status || 'idle';
          updateFromWatchers();
        })
      );

      // ✅ REMOVED: pos_database watcher (table is deprecated, payload is always null)
      // watcherState.posPayload is no longer used - all data comes from individual table watchers

      watcherUnsubscribers.push(
        store.watch('job_order_header', (rows) => {
          //console.log('🔔🔔🔔 [KDS] job_order_header WATCHER triggered!', {
         //   rowsCount: rows?.length || 0,
       //     storeConnected: store?.connected || 'unknown',
        //    timestamp: new Date().toISOString()
       //   });
          // ✅ CRITICAL FIX: DON'T filter by progressState='completed'!
          // Jobs that finished cooking (progressState='completed') should STAY visible
          // in Expo/Handoff until ORDER is delivered (assembled/served)
          // Filtering happens at UI layer based on order.handoffStatus
          const allHeaders = ensureArray(rows);
          watcherState.headers = allHeaders;  // Keep ALL jobs
          //console.log('✅ [KDS] Updated watcherState.headers:', allHeaders.length, 'jobs');

          updateFromWatchers();
        })
      );

      watcherUnsubscribers.push(
        store.watch('job_order_detail', (rows) => {
          //console.log('📋 [KDS] job_order_detail WATCHER triggered!', {
          //  rowsCount: rows?.length || 0,
          //  sampleIds: rows?.slice(0, 3).map(r => r.id) || [],
           // timestamp: new Date().toISOString()
         // });
          // ✅ CRITICAL FIX: Keep ALL details, don't filter by job completion
          // Details should stay visible in Expo/Handoff even after cooking is done
          const allDetails = ensureArray(rows);
          watcherState.lines = allDetails;  // Keep ALL details
          //console.log('✅ [KDS] Updated watcherState.lines:', allDetails.length, 'details');
          updateFromWatchers();
        })
      );

      // ✅ Watch job_order_batch for batch workflow
      watcherUnsubscribers.push(
        store.watch('job_order_batch', (rows) => {
          //console.log('📦 [KDS] job_order_batch WATCHER triggered!', {
         //   rowsCount: rows?.length || 0,
         //   timestamp: new Date().toISOString()
       //   });
          watcherState.batches = ensureArray(rows);
          updateFromWatchers();
        })
      );

      // ✅ Watch order_header for static tabs
      watcherUnsubscribers.push(
        store.watch('order_header', (rows) => {
          //console.log('📄 [KDS] order_header WATCHER triggered!', {
         //   rowsCount: rows?.length || 0,
         //   sampleIds: rows?.slice(0, 3).map(r => r.id) || [],
         //   timestamp: new Date().toISOString()
          //});
          watcherState.orderHeaders = ensureArray(rows);
          //console.log('✅ [KDS] Updated watcherState.orderHeaders:', watcherState.orderHeaders.length, 'orders');
          updateFromWatchers();
        })
      );

      // ✅ Watch order_line for static tabs
      watcherUnsubscribers.push(
        store.watch('order_line', (rows) => {
          //console.log('📝 [KDS] order_line WATCHER triggered!', {
         //   rowsCount: rows?.length || 0,
         //   sampleIds: rows?.slice(0, 3).map(r => r.id) || [],
          //  timestamp: new Date().toISOString()
         // });
          watcherState.orderLines = ensureArray(rows);
          //console.log('✅ [KDS] Updated watcherState.orderLines:', watcherState.orderLines.length, 'lines');
          updateFromWatchers();
        })
      );

      watcherUnsubscribers.push(
        store.watch('order_delivery', (rows) => {
          watcherState.deliveries = ensureArray(rows);          updateFromWatchers();
        })
      );

      // ✅ Watch master data tables directly
      watcherUnsubscribers.push(
        store.watch('kitchen_sections', (rows) => {
          watcherState.kitchenSections = ensureArray(rows);          updateFromWatchers();
        })
      );

      watcherUnsubscribers.push(
        store.watch('menu_items', (rows) => {
          watcherState.menuItems = ensureArray(rows);          updateFromWatchers();
        })
      );

      watcherUnsubscribers.push(
        store.watch('category_sections', (rows) => {
          watcherState.categorySections = ensureArray(rows);          updateFromWatchers();
        })
      );

      watcherUnsubscribers.push(
        store.watch('delivery_drivers', (rows) => {
          watcherState.drivers = ensureArray(rows);          updateFromWatchers();
        })
      );

      watcherUnsubscribers.push(
        store.watch('payment_methods', (rows) => {
          watcherState.paymentMethods = ensureArray(rows);          updateFromWatchers();
        })
      );

      // ✅ Watch order_payment to auto-close delivery orders when fully paid
      watcherUnsubscribers.push(
        store.watch('order_payment', (rows) => {
          const payments = ensureArray(rows);
          //console.log('[KDS] order_payment updated:', { count: payments.length });

          // ✅ Group payments by orderId
          const paymentsByOrder = new Map();
          payments.forEach(payment => {
            const orderId = payment.orderId || payment.order_id;
            if (!orderId) return;
            if (!paymentsByOrder.has(orderId)) {
              paymentsByOrder.set(orderId, []);
            }
            paymentsByOrder.get(orderId).push(payment);
          });

          // ✅ Check each order with payments
          paymentsByOrder.forEach((orderPayments, orderId) => {
            // Find order_header
            const orderHeaders = watcherState.orderHeaders || [];
            const orderHeader = orderHeaders.find(h => String(h.id || h.orderId) === String(orderId));

            if (!orderHeader) return;

            const serviceMode = orderHeader.type || orderHeader.serviceMode || orderHeader.orderTypeId;
            const fulfillmentStage = orderHeader.fulfillmentStage || orderHeader.fulfillment_stage;
            if (fulfillmentStage === 'closed') return;
            const totalPaid = orderPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const totalDue = Number(orderHeader.total_due || orderHeader.totalDue || orderHeader.amount || 0);

            //console.log('[KDS] Delivery order payment check:', {
           //   orderId,
          //    totalPaid,
            //  totalDue,
           //   isFullyPaid: totalPaid >= totalDue
         //   });

            if (totalDue > 0 && totalPaid >= totalDue) {
              const nowIso = new Date().toISOString();
              if (serviceMode === 'delivery') {
                persistOrderHeaderStatus(orderId, 'closed', nowIso);
                watcherState.orderHeaders = orderHeaders.map(h => {
                  if (String(h.id || h.orderId) === String(orderId)) {
                    return { ...h, fulfillmentStage: 'closed', updatedAt: nowIso };
                  }
                  return h;
                });
                updateFromWatchers();
              } else if (serviceMode === 'dine_in' && (fulfillmentStage === 'ready' || fulfillmentStage === 'delivered')) {
                persistOrderHeaderStatus(orderId, 'closed', nowIso);
                watcherState.orderHeaders = orderHeaders.map(h => {
                  if (String(h.id || h.orderId) === String(orderId)) {
                    return { ...h, fulfillmentStage: 'closed', updatedAt: nowIso };
                  }
                  return h;
                });
                updateFromWatchers();
              }
            }
          });
        })
      );
    };

    // إعداد الـ watchers - الـ Smart Store هيجيب البيانات تلقائياً!
    setupWatchers();
  } else if (!store || typeof store.watch !== 'function') {
    console.warn(
      '[Mishkah][KDS] POS dataset store unavailable. Live updates are disabled.'
    );
    
    const checkStoreReady = () => {
      if (window.__POS_DB__) {
        store = window.__POS_DB__;
        if (store && typeof store.watch === 'function') {
          // تسجيل الجداول المطلوبة للـ KDS في الـ store (delayed)
          const registeredObjects = (store.config && Array.isArray(store.config.objects))
            ? Object.keys(store.config.objects)
            : [];

          const tablesToRegister = [
            { name: 'job_order_header', table: 'job_order_header' },
            { name: 'job_order_detail', table: 'job_order_detail' },
            { name: 'order_header', table: 'order_header' },
            { name: 'order_line', table: 'order_line' },
            { name: 'order_delivery', table: 'order_delivery' },
            { name: 'delivery_drivers', table: 'delivery_drivers' },  // ✅ Fixed: plural
            { name: 'payment_methods', table: 'payment_methods' },    // ✅ Added
            { name: 'order_payment', table: 'order_payment' },
            { name: 'pos_database', table: 'pos_database' },
            // ✅ Register master data tables directly from REST API
            { name: 'kitchen_sections', table: 'kitchen_sections' },
            { name: 'menu_items', table: 'menu_items' },
            { name: 'category_sections', table: 'category_sections' }
          ];

          if (typeof store.register === 'function') {
            tablesToRegister.forEach(({ name, table }) => {
              if (!registeredObjects.includes(name)) {
                try {
                  store.register(name, { table });
                } catch (err) {
                  console.warn('[KDS] Failed to register table (delayed)', name, err);
                }
              } else {
              }
            });
          }

          // SMART STORE: الـ store بقى ذكي ويجيب البيانات تلقائياً عند أول watch()!
          // مش محتاجين نعمل fetch يدوي بعد كده 🎉

          watcherUnsubscribers.push(
            store.status((status) => {
              watcherState.status =
                typeof status === 'string' ? status : status?.status || 'idle';
              updateFromWatchers();
            })
          );
          // ✅ REMOVED: pos_database watcher (table is deprecated, payload is always null)
          // watcherState.posPayload is no longer used - all data comes from individual table watchers
          watcherUnsubscribers.push(
            store.watch('job_order_header', (rows) => {
              // ✅ Filter out completed job_order_header to prevent showing old items
              const allHeaders = ensureArray(rows);
              const activeHeaders = allHeaders.filter(header => {
                const progressState = header?.progressState || header?.progress_state;
                return progressState !== 'completed';
              });
              watcherState.headers = activeHeaders;

              // ✅ Build map of completed jobOrderIds for filtering job_order_detail
              watcherState.completedJobOrderIds = new Set();
              allHeaders.forEach(header => {
                const progressState = header?.progressState || header?.progress_state;
                if (progressState === 'completed') {
                  const jobOrderId = header?.id || header?.jobOrderId || header?.job_order_id;
                  if (jobOrderId) {
                    watcherState.completedJobOrderIds.add(jobOrderId);
                  }
                }
              });

              updateFromWatchers();
            })
          );
          watcherUnsubscribers.push(
            store.watch('job_order_detail', (rows) => {
              // ✅ Filter out details belonging to completed job_order_header
              const allDetails = ensureArray(rows);
              const activeDetails = allDetails.filter(detail => {
                const jobOrderId = detail?.jobOrderId || detail?.job_order_id;
                return !watcherState.completedJobOrderIds || !watcherState.completedJobOrderIds.has(jobOrderId);
              });
              watcherState.lines = activeDetails;
              updateFromWatchers();
            })
          );
          // ✅ CRITICAL: Watch job_order_batch for batch workflow
          watcherUnsubscribers.push(
            store.watch('job_order_batch', (rows) => {
              watcherState.batches = ensureArray(rows);
              updateFromWatchers();
            })
          );
          // ✅ Watch order_header for static tabs
          watcherUnsubscribers.push(
            store.watch('order_header', (rows) => {
              watcherState.orderHeaders = ensureArray(rows);              updateFromWatchers();
            })
          );
          // ✅ Watch order_line for static tabs
          watcherUnsubscribers.push(
            store.watch('order_line', (rows) => {
              watcherState.orderLines = ensureArray(rows);              updateFromWatchers();
            })
          );
          watcherUnsubscribers.push(
            store.watch('order_delivery', (rows) => {
              watcherState.deliveries = ensureArray(rows);              updateFromWatchers();
            })
          );

          // ✅ Watch master data tables directly (delayed)
          watcherUnsubscribers.push(
            store.watch('kitchen_sections', (rows) => {
              watcherState.kitchenSections = ensureArray(rows);              updateFromWatchers();
            })
          );

          watcherUnsubscribers.push(
            store.watch('menu_items', (rows) => {
              watcherState.menuItems = ensureArray(rows);              updateFromWatchers();
            })
          );

          watcherUnsubscribers.push(
            store.watch('category_sections', (rows) => {
              watcherState.categorySections = ensureArray(rows);              updateFromWatchers();
            })
          );

          watcherUnsubscribers.push(
            store.watch('delivery_drivers', (rows) => {
              watcherState.drivers = ensureArray(rows);              updateFromWatchers();
            })
          );

          watcherUnsubscribers.push(
            store.watch('payment_methods', (rows) => {
              watcherState.paymentMethods = ensureArray(rows);              updateFromWatchers();
            })
          );
        }
      } else {
        setTimeout(checkStoreReady, 100);
      }
    };
    
    setTimeout(checkStoreReady, 100);
  }

  // ✅ Cleanup handled above in stopPolling() on beforeunload
  // Old store unsubscribe code no longer needed

  updateFromWatchers();

  app.setOrders(Object.assign({}, UI.orders || {}, auto.orders || {}, kdsOrders));
  logKdsOrdersRegistry();
  app.mount('#app');
  scheduleInteractiveSnapshot();
  setupKdsDevtools();

  // ✅ ESC key closes modals (document-level listener)
  if(typeof document !== 'undefined'){
    document.addEventListener('keydown', (event) => {
      if(event?.key === 'Escape'){
        const state = app.getState();
        if(state.ui?.modalOpen){
          event.preventDefault();
          app.setState(state=>({
            ...state,
            ui:{
              ...(state.ui || {}),
              modalOpen:false,
              modals:{ driver:false, payment:false },
              deliveryAssignment:null,
              paymentSettlement:null
            }
          }));
        }
      }
    });
  }

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
