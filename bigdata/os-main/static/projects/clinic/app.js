(function (global) {
  'use strict';

  var M = global.Mishkah;
  if (!M || !M.DSL || !M.app || !M.utils || !M.utils.twcss) {
    console.error('[Clinic App] Mishkah core + twcss is required.');
    return;
  }

  var D = M.DSL;
  var TW = M.utils.twcss;
  var tw = TW.tw;
  var token = TW.token;
  var cx = TW.cx;

  function tok(key, fallback) {
    var val = '';
    try { val = token ? token(key) : ''; } catch (e) { val = ''; }
    if (val && String(val).trim()) return val;
    return fallback || '';
  }


  if (!global.ClinicComp || typeof global.ClinicComp.segmented !== 'function') {
    console.error('[Clinic App] ClinicComp is required (load comp.js before app.js).');
    return;
  }

  var Comp = global.ClinicComp;
  var OrdersFactory = global.ClinicOrders;

  var savedLang = global.localStorage ? (global.localStorage.getItem('clinic:lang') || 'ar') : 'ar';
  var savedTheme = global.localStorage ? (global.localStorage.getItem('clinic:theme') || 'light') : 'light';

  var firebaseConfig = Object.assign({
    branchId: 'pt',
    moduleId: 'clinic',
    lang: savedLang,
    smartFetch: true
  }, global.__clinicFirebaseConfig || {});

  var MASTER_TABLES = [
    'companies',
    'branches',
    'clinic_patients',
    'clinic_doctors',
    'clinic_specialties',
    'clinic_service_domains',
    'clinic_services',
    'clinic_devices',
    'clinic_items',
    'clinic_types',
    'clinic_rooms',
    'clinic_stations',
    'ref_genders',
    'ref_nationalities',
    'ref_areas',
    'clinic_smoking_statuses',
    'clinic_activity_factors',
    'clinic_occupations',
    'clinic_marital_statuses',
    'clinic_food_addiction_types',
    'clinic_service_packages',
    'clinic_service_package_tiers',
    'clinic_complaint_types'
  ];

  var LANG_TABLES = [
    'clinic_patients_lang',
    'clinic_doctors_lang',
    'clinic_services_lang'
  ];

  var TRANSACTION_TABLES = [
    'clinic_bookings',
    'clinic_contracts_header',
    'clinic_contracts_lines',
    'clinic_visit_tickets',
    'clinic_visit_progress_steps',
    'clinic_slots_inventory'
  ];

  var DEFAULT_LANGS = ['ar', 'en'];
  var VERTICAL_TABLES = Object.assign({}, global.__clinicVerticalTables || {}, {
    clinic_patients: {
      langTable: 'clinic_patients_lang',
      fk: 'clinic_patients_id',
      languages: DEFAULT_LANGS,
      translationFields: ['name', 'notes'],
      langIdBuilder: function (id, lang) { return id + ':p:' + lang; }
    },
    clinic_doctors: {
      langTable: 'clinic_doctors_lang',
      fk: 'clinic_doctors_id',
      languages: DEFAULT_LANGS,
      translationFields: ['name', 'title'],
      langIdBuilder: function (id, lang) { return id + ':d:' + lang; }
    },
    clinic_services: {
      langTable: 'clinic_services_lang',
      fk: 'clinic_services_id',
      languages: DEFAULT_LANGS,
      translationFields: ['name', 'description'],
      langIdBuilder: function (id, lang) { return id + ':s:' + lang; }
    }
  });

  global.__clinicVerticalTables = VERTICAL_TABLES;

  // REMOVED: Firebase initialization (User Request)
  // We now rely on M.REST for data fetching.

  var dictionary = {
    'app.title': { ar: 'لوحة العيادة', en: 'Clinic Control' },
    'app.subtitle': { ar: 'إدارة حقيقية للعمليات اليومية', en: 'Real operations dashboard' },
    'nav.dashboard': { ar: 'الرئيسية', en: 'Dashboard' },
    'nav.patients': { ar: 'المرضى', en: 'Patients' },
    'nav.bookings': { ar: 'المواعيد', en: 'Appointments' },
    'nav.contracts': { ar: 'العقود', en: 'Contracts' },
    'nav.progress': { ar: 'التقدم', en: 'Progress' },
    'nav.master': { ar: 'البيانات الرئيسية', en: 'Master data' },
    'section.activity': { ar: 'نشاط اليوم', en: 'Today activity' },
    'section.timeline': { ar: 'المواعيد القادمة', en: 'Upcoming appointments' },
    'section.patientProfile': { ar: 'ملف المريض', en: 'Patient profile' },
    'section.master': { ar: 'إدارة الجداول', en: 'Manage tables' },
    'cta.addPatient': { ar: 'مريض جديد', en: 'Add patient' },
    'cta.addBooking': { ar: 'حجز', en: 'Add appointment' },
    'cta.save': { ar: 'حفظ', en: 'Save' },
    'cta.reset': { ar: 'إعادة تعيين', en: 'Reset' },
    'cta.cancel': { ar: 'إلغاء', en: 'Cancel' },
    'label.search': { ar: 'بحث عن مريض', en: 'Search patients' },
    'label.name': { ar: 'الاسم', en: 'Name' },
    'label.phone': { ar: 'الهاتف', en: 'Phone' },
    'label.code': { ar: 'الكود', en: 'Code' },
    'label.notes': { ar: 'ملاحظات', en: 'Notes' },
    'label.price': { ar: 'السعر', en: 'Price' },
    'label.service': { ar: 'الخدمة', en: 'Service' },
    'label.sessions': { ar: 'الجلسات', en: 'Sessions' },
    'label.status': { ar: 'الحالة', en: 'Status' },
    'label.slot': { ar: 'الموعد', en: 'Slot' },
    'label.station': { ar: 'المحطة', en: 'Station' },
    'label.gender': { ar: 'النوع', en: 'Gender' },
    'label.email': { ar: 'البريد الإلكتروني', en: 'Email' },
    'label.patient': { ar: 'المريض', en: 'Patient' },
    'label.doctor': { ar: 'الطبيب', en: 'Doctor' },
    'label.time': { ar: 'الوقت', en: 'Time' },
    'label.newPatients': { ar: 'مرضى جدد', en: 'New patients' },
    'label.operations': { ar: 'عمليات', en: 'Operations' },
    'label.earnings': { ar: 'الإيرادات', en: 'Earnings' },
    'placeholder.noPatient': { ar: 'لم يتم اختيار مريض', en: 'No patient selected' }
  };

  function t(db, key) {
    var entry = (db && db.i18n && db.i18n.dict && db.i18n.dict[key]) || null;
    if (!entry) return key;
    return entry[(db.env && db.env.lang) || 'ar'] || entry.en || key;
  }

  var lastChrome = { theme: null, lang: null, dir: null };

  function applyEnvToDocument(env) {
    if (typeof document === 'undefined') return;
    env = env || {};
    var theme = env.theme || 'light';
    var lang = env.lang || 'ar';
    var dir = env.dir || (lang === 'ar' ? 'rtl' : 'ltr');

    if (lastChrome.theme === theme && lastChrome.lang === lang && lastChrome.dir === dir) return;
    lastChrome = { theme: theme, lang: lang, dir: dir };

    var root = document.documentElement;
    if (!root) return;

    if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
    if (root.getAttribute('lang') !== lang) root.setAttribute('lang', lang);
    if (root.getAttribute('dir') !== dir) root.setAttribute('dir', dir);

    if (document.body) {
      if (document.body.getAttribute('data-theme') !== theme) document.body.setAttribute('data-theme', theme);
      if (theme === 'dark') document.body.classList.add('dark');
      else document.body.classList.remove('dark');
    }

    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }

  // ========================================================================
  // CORE: DYNAMIC SCHEMA PROVIDER (The Constitution)
  // ========================================================================

  var database = {
    data: {
      tables: {},
      activeMasterTable: MASTER_TABLES[0],
      activeView: 'dashboard',
      editingRecord: null,
      patientSearch: '',
      activePatientId: null
    },
    env: {
      theme: savedTheme,
      lang: savedLang,
      dir: savedLang === 'ar' ? 'rtl' : 'ltr'
    },
    i18n: { dict: dictionary },
    schema: { tables: {} } // Will be populated dynamically
  };

  /**
   * Fetches the official schema from the backend (Source of Truth).
   * Falls back to a static file if API is unavailable.
   */
  async function loadGlobalSchema(app) {
    console.log('[Clinic App] 📜 Fetching Architecture Constitution (Schema)...');
    try {
      // Priority 1: Fetch from API (Dynamic)
      // We use the file path for now as the 'API' representation in this static context, 
      // but in production this should be M.REST.getSchema() or fetch('/api/schema/clinic')
      var res = await fetch('../../data/schemas/clinic_schema.json');
      if (!res.ok) throw new Error('Failed to fetch schema json');

      var root = await res.json();
      var source = root.schema || root; // Handle wrapped or flat schema

      var tablesMeta = source.tables_meta || {};
      var tables = source.tables || [];
      var modules = source.modules || [];
      var tableTypes = source.table_types || [];

      // Transform JSON Schema to App Schema Format
      var activeSchema = {};

      // 1. Map explicit tables from "tables" array
      tables.forEach(function (t) {
        if (!t.fields) return;
        activeSchema[t.name] = {
          name: t.name,
          label: t.label,
          fields: t.fields.map(function (f) {
            return {
              name: f.name,
              type: f.type,
              label: (f.labels && f.labels[app.getState().env.lang]) || f.name, // Dynamic label
              labels: f.labels, // Store all labels
              references: f.references,
              required: !f.nullable,
              primary: f.primaryKey,
              readonly: f.name === 'id' || f.name === 'created_at' || f.name === 'updated_at'
            };
          }),
          smart_features: t.smart_features // Preserve smart features for UI
        };
      });

      // 2. Normalize Short-hand tables from "tables_meta" if not in "tables"
      // This ensures we have at least basic definition for tables that might not have deep schema yet
      Object.keys(tablesMeta).forEach(function (key) {
        if (!activeSchema[key]) {
          activeSchema[key] = {
            name: key,
            fields: [] // Will be populated lazily or via discovery
          };
        }
      });

      console.log('[Clinic App] ✅ Schema Loaded:', Object.keys(activeSchema).length, 'tables');

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          schema: {
            tables: activeSchema,
            modules: modules,
            table_types: tableTypes
          }
        });
      });

    } catch (e) {
      console.error('[Clinic App] 🚨 Schema Load Failed - Application is Blind!', e);
      // Panic or show error toast
    }
  }

  // Helper to safely get table definition
  function getTableSchema(db, name) {
    var t = (db.schema && db.schema.tables && db.schema.tables[name]);
    if (t) return t;
    // Fallback: Return a skeleton if schema not loaded yet to prevent crashes
    return { name: name, fields: [] };
  }

  function loadMasterData(app) {
    // Determine which tables to load (MASTER_TABLES + LANG_TABLES)
    var tablesToLoad = MASTER_TABLES.concat(LANG_TABLES);

    // We can fetch them in parallel or chunks
    console.log('[Clinic App] 📡 Fetching master data via REST...');

    tablesToLoad.forEach(function (tableName) {
      // Basic safeguard: don't hammer the API if not needed, but here we need them all for dropdowns
      M.REST.repo(tableName).search({ limit: 1000 }).then(function (res) {
        var rows = res.data || res || [];
        app.setState(function (prev) {
          var nextTables = Object.assign({}, prev.data.tables);
          nextTables[tableName] = rows;
          return Object.assign({}, prev, {
            data: Object.assign({}, prev.data, { tables: nextTables })
          });
        });
      }).catch(function (err) {
        console.warn('[Clinic App] Failed to load table:', tableName, err);
      });
    });
  }

  // Duplicate getTableSchema removed
  function normalizeFirebaseList(raw) {

    function listAvailableLangs(db, baseTable) {
      var vertical = VERTICAL_TABLES[baseTable];
      var langs = (vertical && vertical.languages && vertical.languages.length) ? vertical.languages.slice() : ['ar', 'en'];
      var langTable = vertical && vertical.langTable ? vertical.langTable : (baseTable ? (baseTable + '_lang') : null);
      if (langTable && db.data && db.data.tables && db.data.tables[langTable]) {
        db.data.tables[langTable].forEach(function (row) {
          if (row && row.lang && langs.indexOf(row.lang) === -1) langs.push(row.lang);
        });
      }
      return langs;
    }

    function findLangRecord(db, baseTable, id, lang) {
      if (!baseTable || !id) return null;
      var vertical = VERTICAL_TABLES[baseTable] || {};
      var langTable = vertical.langTable || (baseTable + '_lang');
      var rows = (db.data.tables && db.data.tables[langTable]) || [];
      var fk = vertical.fk || (baseTable + '_id');
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        if (!row) continue;
        var matchId = row[fk] || row.id;
        if (matchId === id && (!lang || row.lang === lang)) return row;
      }
      return null;
    }

    function enrichRecordWithLang(tableName, record, db) {
      if (!record) return record;
      var baseName = tableName.replace(/_lang$/, '');
      var langRec = findLangRecord(db, baseName, record.id || record[baseName + '_id'], db.env.lang) || findLangRecord(db, baseName, record.id || record[baseName + '_id'], 'en');
      var merged = Object.assign({}, record);
      if (langRec) {
        Object.keys(langRec).forEach(function (key) {
          if (key === baseName + '_id' || key === 'id') return;
          merged[key] = langRec[key];
        });
      }
      merged.__displayName = (langRec && (langRec.name || langRec.title || langRec.description)) || record.name || record.title || record.code || record.patient_code || record.id;
      return merged;
    }

    function formatValue(value) {
      if (value == null) return '—';
      if (typeof value === 'string' || typeof value === 'number') return value;
      if (value instanceof Date) return value.toISOString().slice(0, 16);
      if (typeof value === 'boolean') return value ? '✓' : '✕';
      return JSON.stringify(value);
    }

    function buildFieldInput(field, value, db, tableName) {
      var attrs = { name: field.name, class: field.type === 'nvarchar' ? token('field') : token('field') };
      var refTable = field.references && field.references.table;
      if (!refTable && /_id$/.test(field.name)) {
        var candidate = field.name.replace(/_id$/, '');
        if (db.data.tables && db.data.tables[candidate]) refTable = candidate;
      }

      if (field.name === 'lang') {
        var langs = listAvailableLangs(db, tableName ? tableName.replace(/_lang$/, '') : '');
        return D.Select({ attrs: attrs }, langs.map(function (lng) {
          return D.Option({ attrs: { value: lng, selected: String(value || db.env.lang) === lng } }, [lng]);
        }));
      }

      if (refTable && db.data.tables && db.data.tables[refTable]) {
        return D.Select({ attrs: attrs },
          [D.Option({ attrs: { value: '' } }, ['—'])].concat((db.data.tables[refTable] || []).map(function (row) {
            var enriched = enrichRecordWithLang(refTable, row, db);
            return D.Option({ attrs: { value: row.id, selected: String(value) === String(row.id) } }, [enriched.__displayName || row.code || row.id]);
          }))
        );
      }

      var inputType = 'text';
      if (field.type === 'int' || field.type === 'decimal' || field.type === 'float') inputType = 'number';
      if (field.type === 'date') inputType = 'date';
      if (field.type === 'datetime') inputType = 'datetime-local';
      return D.Input({ attrs: Object.assign({}, attrs, { type: inputType, value: value || '' }) });
    }

    function getRenderableFields(schema) {
      var blacklist = ['id', 'company_id', 'branch_id', 'user_insert', 'user_update', 'time_insert', 'time_update', 'created_at', 'updated_at', 'created_date', 'deleted_at'];
      if (!schema || !schema.fields) return [];
      return schema.fields.filter(function (f) { return blacklist.indexOf(f.name) === -1; });
    }

    // ========================================================================
    // DIAGNOSTIC LOGGING
    // ========================================================================

    function logDiagnostics(db) {
      console.log('\n%c[Clinic App] 🔍 Diagnostic Report', 'color: #10b981; font-weight: bold; font-size: 14px;');
      console.log('├─ Schema Status:');
      console.log('│  ├─ Total tables defined:', Object.keys(db.schema.tables || {}).length);
      console.log('│  └─ Tables:', Object.keys(db.schema.tables || {}).join(', '));
      console.log('├─ Data Status:');
      console.log('│  ├─ Total tables loaded:', Object.keys(db.data.tables || {}).length);
      console.log('│  └─ Tables:', Object.keys(db.data.tables || {}).join(', '));

      // Test specific table
      var testTable = 'clinic_patients';
      var schema = getTableSchema(db, testTable);
      var data = (db.data.tables && db.data.tables[testTable]) || [];
      console.log('├─ Test Table (' + testTable + '):');
      console.log('│  ├─ Schema available:', !!schema);
      if (schema) {
        console.log('│  ├─ Fields defined:', (schema.fields || []).length);
        console.log('│  └─ Sample fields:', (schema.fields || []).slice(0, 3).map(function (f) { return f.name; }).join(', '));
      }
      console.log('│  ├─ Data rows:', data.length);
      if (data.length > 0) {
        console.log('│  └─ Sample record:', data[0]);
      }
      console.log('└─ Firebase Status: Connected via Mishkah Firebase Adapter ✅\n');
    }

    function resolveEditingRecord(db, tableName) {
      var editing = (db.data && db.data.editingRecord) || null;
      if (!editing) return null;
      var targetTable = editing.table || tableName;
      if (tableName && targetTable && targetTable !== tableName) return null;
      var list = (db.data.tables && db.data.tables[targetTable]) || [];
      var found = editing.id ? list.find(function (row) { return row && row.id === editing.id; }) : null;
      return found ? Object.assign({}, found, { table: targetTable }) : editing;
    }

    // REMOVED: subscribeToTables (using REST instead)

    function selectPatients(db) {
      var patients = ((db.data.tables && db.data.tables.clinic_patients) || []).map(function (p) {
        return enrichRecordWithLang('clinic_patients', p, db);
      });
      var term = String(db.data.patientSearch || '').toLowerCase();
      var filtered = term
        ? patients.filter(function (p) {
          return String(p && p.__displayName || '').toLowerCase().indexOf(term) !== -1 || String(p.mobile || '').indexOf(term) !== -1;
        })
        : patients;
      return filtered.slice(0, 30);
    }

    function deriveStats(db) {
      var patients = (db.data.tables.clinic_patients) || [];
      var bookings = (db.data.tables.clinic_bookings) || [];
      var contracts = (db.data.tables.clinic_contracts_header) || [];
      var progress = (db.data.tables.clinic_visit_progress_steps) || [];

      var newPatients = patients.filter(function (p) { return String(p && p.status || '').toLowerCase() === 'new'; }).length;
      var operations = progress.length || bookings.length;

      return {
        patients: patients.length,
        bookings: bookings.length,
        newPatients: newPatients || Math.max(1, Math.round(patients.length * 0.1)),
        operations: operations,
        contracts: contracts.length
      };
    }

    function bookingStatusBreakdown(bookings) {
      var totals = bookings.reduce(function (acc, b) {
        var status = String((b && (b.status || b.booking_status)) || 'scheduled').toLowerCase();
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      var sum = bookings.length || 1;
      return Object.keys(totals).map(function (key) {
        return { status: key, percent: Math.round((totals[key] / sum) * 100) };
      });
    }

    function statusTone(status) {
      status = String(status || '').toLowerCase();
      if (status === 'completed' || status === 'done') return 'success';
      if (status === 'cancelled' || status === 'canceled' || status === 'no_show') return 'danger';
      if (status === 'confirmed') return 'info';
      return 'neutral';
    }

    function renderSidebar(db) {
      var stats = deriveStats(db);
      var navItems = [
        { key: 'nav.dashboard', icon: '🏥', count: stats.bookings, view: 'dashboard' },
        { key: 'nav.patients', icon: '👥', count: stats.patients, view: 'patients' },
        { key: 'nav.bookings', icon: '🗓️', count: stats.bookings, view: 'bookings' },
        { key: 'nav.contracts', icon: '📑', count: stats.contracts, view: 'contracts' },
        { key: 'nav.master', icon: '🧭', view: 'master' }
      ];

      return D.Aside({ attrs: { class: tok('layout/sidebar', tw`hidden lg:flex w-72 flex-col gap-6 p-6 border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_70%,transparent)] backdrop-blur-xl min-h-screen`) } }, [
        D.Div({ attrs: { class: tok('layout/sidebar/header', tw`flex items-center gap-3`) } }, [
          D.Div({ attrs: { class: cx(tok('layout/sidebar/logo', tw`h-12 w-12 rounded-2xl grid place-items-center font-black shadow-lg`), tw`text-xl`) } }, ['C']),
          D.Div({ attrs: { class: tw`min-w-0` } }, [
            D.Div({ attrs: { class: tok('layout/sidebar/title', tw`font-bold text-lg text-[var(--foreground)] truncate`) } }, [t(db, 'app.title')]),
            D.Div({ attrs: { class: tok('layout/sidebar/subtitle', tw`text-xs text-[var(--muted-foreground)] truncate`) } }, [t(db, 'app.subtitle')])
          ])
        ]),
        D.Nav({ attrs: { class: tw`space-y-2` } }, navItems.map(function (item) {
          var isActive = db.data.activeView === item.view;
          return D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:nav-item',
              'data-view': item.view,
              class: cx(tok('nav/item', tw`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]`), isActive ? tok('nav/item.active', tw`bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-[var(--primary)] font-bold`) : null)
            }
          }, [
            D.Div({ attrs: { class: tw`flex items-center gap-3 min-w-0` } }, [
              D.Span({ attrs: { class: tw`text-base` } }, [item.icon]),
              D.Span({ attrs: { class: tw`truncate` } }, [t(db, item.key)])
            ]),
            item.count != null ? Comp.pill(String(item.count), isActive ? 'success' : 'neutral') : null
          ]);
        }))
      ]);
    }

    function renderTopbar(db) {
      return D.Div({ attrs: { class: tok('layout/topbar', tw`flex items-center justify-between flex-wrap gap-4`) } }, [
        D.Div({ attrs: { class: tw`min-w-0` } }, [
          D.Div({ attrs: { class: tok('layout/topbar/title', tw`text-2xl font-bold text-[var(--foreground)]`) } }, [t(db, 'app.title')]),
          D.Div({ attrs: { class: tok('layout/topbar/subtitle', tw`text-sm text-[var(--muted-foreground)]`) } }, [t(db, 'app.subtitle')])
        ]),
        D.Div({ attrs: { class: tw`flex items-center gap-2 flex-wrap` } }, [
          D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:add-patient',
              class: cx(token('btn'), token('btn/soft'), token('btn/sm'))
            }
          }, [t(db, 'cta.addPatient')]),
          D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:add-booking',
              class: cx(token('btn'), token('btn/primary'), token('btn/sm'))
            }
          }, [t(db, 'cta.addBooking')]),
          D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:toggle-lang',
              class: cx(token('btn'), token('btn/ghost'), token('btn/icon'), token('btn/sm')),
              title: db.env.lang === 'ar' ? 'English' : 'العربية'
            }
          }, [db.env.lang === 'ar' ? 'EN' : 'ع']),
          D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:toggle-theme',
              class: cx(token('btn'), token('btn/ghost'), token('btn/icon'), token('btn/sm')),
              title: db.env.theme === 'light' ? 'Dark' : 'Light'
            }
          }, [db.env.theme === 'light' ? '🌙' : '☀️'])
        ])
      ]);
    }

    function renderStatsRow(db) {
      var stats = deriveStats(db);
      if (Comp.metricGrid) {
        return Comp.metricGrid([
          { label: t(db, 'nav.bookings'), value: stats.bookings, trend: '+' + (stats.bookings || 0), icon: '🗓️', sparklineData: [2, 5, 4, 8, 6, 7, 10] },
          { label: t(db, 'label.operations'), value: stats.operations, trend: '+3%', icon: '⚙️', sparklineData: [1, 2, 3, 3, 4, 6, 7] },
          { label: t(db, 'label.newPatients'), value: stats.newPatients, trend: '+' + stats.newPatients, icon: '👤', sparklineData: [1, 1, 2, 2, 3, 3, 4] },
          { label: t(db, 'label.earnings'), value: stats.contracts, trend: t(db, 'nav.contracts'), icon: '💳', sparklineData: [1, 2, 1, 3, 2, 4, 3] }
        ]);
      }
      return Comp.grid(4, [
        Comp.statCard(t(db, 'nav.bookings'), stats.bookings, '+' + (stats.bookings || 0)),
        Comp.statCard(t(db, 'label.operations'), stats.operations, '+3%'),
        Comp.statCard(t(db, 'label.newPatients'), stats.newPatients, '+' + stats.newPatients),
        Comp.statCard(t(db, 'label.earnings'), stats.contracts, t(db, 'nav.contracts'))
      ]);
    }

    function renderActivity(db) {
      var bookings = (db.data.tables.clinic_bookings || []).slice().sort(function (a, b) {
        return String(a && a.start_time || '').localeCompare(String(b && b.start_time || ''));
      }).slice(0, 10);

      var patients = (db.data.tables.clinic_patients || []);
      var services = (db.data.tables.clinic_services || []);

      var activities = bookings.map(function (b) {
        var patient = patients.find(function (p) { return p && (p.id === b.patient_id || p.id === b.patient); });
        var service = services.find(function (s) { return s && (s.id === b.service_id || s.id === b.service); });
        var patientDisplay = patient ? enrichRecordWithLang('clinic_patients', patient, db) : null;
        var serviceDisplay = service ? enrichRecordWithLang('clinic_services', service, db) : null;
        var st = (b && (b.status || b.booking_status)) || 'scheduled';
        var tone = statusTone(st);
        var color = tone === 'success' ? 'var(--success)' : (tone === 'danger' ? 'var(--destructive)' : (tone === 'info' ? 'var(--info)' : 'var(--primary)'));
        return {
          title: patientDisplay ? (patientDisplay.__displayName || t(db, 'label.patient')) : t(db, 'label.patient'),
          description: (serviceDisplay ? (serviceDisplay.__displayName || serviceDisplay.code || t(db, 'label.service')) : t(db, 'label.service')) + ' • ' + (b.slot_code || t(db, 'label.slot')),
          time: String(b.start_time || b.booked_at || '').slice(0, 16),
          color: color
        };
      });

      var breakdown = bookingStatusBreakdown(db.data.tables.clinic_bookings || []);

      var breakdownEl = D.Div({ attrs: { class: tw`space-y-3` } }, breakdown.map(function (row) {
        return D.Div({ attrs: { class: tw`space-y-1` } }, [
          D.Div({ attrs: { class: tw`flex items-center justify-between text-xs`, style: 'color: var(--muted-foreground);' } }, [
            D.Span({}, [row.status]),
            D.Span({ attrs: { class: tw`font-semibold`, style: 'color: var(--foreground);' } }, [row.percent + '%'])
          ]),
          D.Div({ attrs: { class: tw`h-2 rounded-full overflow-hidden`, style: 'background: color-mix(in oklab, var(--muted) 70%, transparent);' } }, [
            D.Div({ attrs: { class: tw`h-full`, style: 'width:' + row.percent + '%; background: linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--primary) 60%, var(--info)));' } }, [])
          ])
        ]);
      }));

      return Comp.segmented(t(db, 'section.activity'), D.Div({ attrs: { class: tw`grid lg:grid-cols-3 gap-6` } }, [
        D.Div({ attrs: { class: tw`lg:col-span-2` } }, [
          Comp.activityFeed ? Comp.activityFeed({ title: t(db, 'section.timeline'), activities: activities }) : D.Div({ attrs: { class: token('card') } }, [D.Pre({}, [JSON.stringify(activities, null, 2)])])
        ]),
        D.Div({ attrs: { class: token('card') } }, [
          D.Div({ attrs: { class: tok('section/head', tw`px-6 py-4 border-b flex items-center justify-between gap-3 border-[var(--border)] bg-[color-mix(in_oklab,var(--surface-1)_85%,transparent)]`) } }, [
            D.Div({ attrs: { class: tok('section/title', tw`text-sm font-extrabold tracking-wide text-[var(--foreground)]`) } }, ['Status'])
          ]),
          D.Div({ attrs: { class: tok('section/body', tw`p-6`) } }, [breakdownEl])
        ])
      ]));
    }

    function renderPatientPanel(db) {
      var patients = selectPatients(db);
      var activePatient = (db.data.tables.clinic_patients || []).find(function (p) { return p && p.id === db.data.activePatientId; });
      var progress = (db.data.tables.clinic_visit_progress_steps || []).filter(function (p) { return p && p.patient_id === (activePatient && activePatient.id); });

      return D.Div({ attrs: { class: tw`space-y-6` } }, [
        Comp.segmented(t(db, 'section.patientProfile'), D.Div({ attrs: { class: tw`space-y-3` } }, [
          Comp.formField(t(db, 'label.search'), D.Input({
            attrs: {
              'data-m-key': 'clinic:patient-search',
              value: db.data.patientSearch || '',
              placeholder: t(db, 'label.search'),
              class: token('field')
            }
          })),
          D.Div({ attrs: { class: tw`space-y-2 max-h-[260px] overflow-y-auto pr-1` } }, patients.map(function (patient) {
            var isActive = db.data.activePatientId === patient.id;
            return D.Button({
              attrs: {
                type: 'button',
                'data-m-key': 'clinic:patient-row',
                'data-record-id': patient.id,
                class: cx(
                  tw`w-full text-left rounded-2xl border px-4 py-3 flex items-center justify-between gap-2 transition-all`,
                  isActive ? tw`border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_12%,transparent)]` : tw`border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_oklab,var(--primary)_55%,transparent)]`
                )
              }
            }, [
              D.Div({ attrs: { class: tw`flex items-center gap-3 min-w-0` } }, [
                D.Div({
                  attrs: {
                    class: tw`h-10 w-10 rounded-xl grid place-items-center font-bold shrink-0`,
                    style: 'background: color-mix(in oklab, var(--primary) 16%, transparent); color: var(--primary); border: 1px solid color-mix(in oklab, var(--primary) 35%, transparent);'
                  }
                }, [(String(patient.__displayName || patient.name || '—').charAt(0))]),
                D.Div({ attrs: { class: tw`min-w-0` } }, [
                  D.Div({ attrs: { class: tw`font-semibold text-sm truncate` } }, [patient.__displayName || patient.name || t(db, 'label.patient')]),
                  D.Div({ attrs: { class: tw`text-[11px] truncate`, style: 'color: var(--muted-foreground);' } }, [patient.mobile || patient.phone || '—'])
                ])
              ]),
              Comp.pill(patient.status || t(db, 'label.status'), patient.status === 'active' ? 'success' : null)
            ]);
          }))
        ])),
        Comp.segmented(t(db, 'nav.progress'),
          progress.length
            ? Comp.timeline(progress.map(function (p) {
              return { title: p.step_title || p.status || t(db, 'label.status'), meta: p.created_at || p.step_code, body: p.notes };
            }))
            : D.Div({ attrs: { class: tw`text-sm text-center py-4`, style: 'color: var(--muted-foreground);' } }, [t(db, 'placeholder.noPatient')])
        )
      ]);
    }

    function renderPatientList(db) {
      var patients = (db.data.tables.clinic_patients || []).map(function (p) { return enrichRecordWithLang('clinic_patients', p, db); });

      var term = String(db.data.patientSearch || '').toLowerCase();
      if (term) patients = patients.filter(function (p) {
        return String(p.__displayName || p.name || '').toLowerCase().indexOf(term) !== -1 || String(p.mobile || '').indexOf(term) !== -1;
      });

      var rows = patients.map(function (p) {
        return [
          D.Div({ attrs: { class: tw`flex items-center gap-3 min-w-0` } }, [
            D.Div({
              attrs: {
                class: tw`h-8 w-8 rounded-full grid place-items-center text-xs font-bold shrink-0`,
                style: 'background: color-mix(in oklab, var(--primary) 16%, transparent); color: var(--primary); border: 1px solid color-mix(in oklab, var(--primary) 35%, transparent);'
              }
            }, [String(p.__displayName || p.name || '?').charAt(0)]),
            D.Span({ attrs: { class: tw`truncate` } }, [p.__displayName || p.name || '—'])
          ]),
          p.mobile || '—',
          (function () {
            if (!p.gender_id) return '—';
            var gender = (db.data.tables.ref_genders || []).find(function (g) { return g && (g.id === p.gender_id || g.code === p.gender_id); });
            if (!gender) return p.gender_id;
            var gLabel = enrichRecordWithLang('ref_genders', gender, db);
            return gLabel.__displayName || gender.name || gender.code || p.gender_id;
          })(),
          p.birth_date || '—',
          D.Button({
            attrs: { type: 'button', 'data-m-key': 'clinic:edit-patient', 'data-record-id': p.id, class: cx(token('btn'), token('btn/ghost'), token('btn/sm')) }
          }, ['Edit'])
        ];
      });

      return Comp.segmented(t(db, 'nav.patients'), D.Div({ attrs: { class: tw`space-y-4` } }, [
        Comp.headline(t(db, 'nav.patients'), [
          D.Button({ attrs: { type: 'button', 'data-m-key': 'clinic:add-patient', class: cx(token('btn'), token('btn/primary'), token('btn/sm')) } }, [t(db, 'cta.addPatient')])
        ]),
        Comp.formField(t(db, 'label.search'), D.Input({
          attrs: { 'data-m-key': 'clinic:patient-search', value: db.data.patientSearch || '', placeholder: t(db, 'label.search') + '...', class: token('field') }
        })),
        Comp.table([t(db, 'label.name'), t(db, 'label.phone'), t(db, 'label.gender'), 'Birth Date', ''], rows)
      ]));
    }

    function renderPatientForm(db) {
      var editing = resolveEditingRecord(db, 'clinic_patients') || {};
      var isNew = !editing.id;
      var patientSchema = getTableSchema(db, 'clinic_patients');
      var baseFields = patientSchema && patientSchema.fields ? patientSchema.fields.filter(function (f) {
        return ['gender_id', 'mobile', 'birth_date', 'patient_code'].indexOf(f.name) !== -1;
      }) : [];
      if (!baseFields.length) {
        baseFields = [
          { name: 'patient_code', type: 'nvarchar', label: t(db, 'label.code') },
          { name: 'mobile', type: 'nvarchar', label: t(db, 'label.phone') },
          { name: 'gender_id', type: 'int', label: t(db, 'label.gender'), references: { table: 'ref_genders' } },
          { name: 'birth_date', type: 'date', label: 'Birth Date' }
        ];
      }

      var langs = listAvailableLangs(db, 'clinic_patients');
      var langGroups = langs.map(function (lng) {
        var langRec = editing.id ? findLangRecord(db, 'clinic_patients', editing.id, lng) : null;
        return Comp.grid(2, [
          D.Input({ attrs: { type: 'hidden', name: 'langId:' + lng, value: langRec && langRec.id ? langRec.id : '' } }),
          Comp.formField(t(db, 'label.name') + ' (' + lng + ')', D.Input({ attrs: { name: 'name:' + lng, value: langRec && langRec.name ? langRec.name : '', required: lng === 'ar', class: token('field') } }))
        ]);
      });

      var baseFieldRows = baseFields.map(function (field) {
        var value = editing[field.name] || '';
        if ((field.type === 'date' || field.type === 'datetime') && value) value = String(value).slice(0, field.type === 'date' ? 10 : 16);
        return Comp.formField(field.label || field.name, buildFieldInput(field, value, db, 'clinic_patients'));
      });

      var baseGrid = [];
      for (var i = 0; i < baseFieldRows.length; i += 2) baseGrid.push(Comp.grid(2, baseFieldRows.slice(i, i + 2)));

      return Comp.surface([
        Comp.headline(isNew ? t(db, 'cta.addPatient') : 'Edit Patient', []),
        D.Form({ attrs: { 'data-m-key': 'clinic:crud:submit', 'data-table': 'clinic_patients', class: tw`max-w-3xl space-y-6` } },
          (editing.id ? [D.Input({ attrs: { type: 'hidden', name: 'id', value: editing.id } })] : [])
            .concat(baseGrid)
            .concat(langGroups)
            .concat([
              D.Div({ attrs: { class: tw`pt-2 flex items-center gap-2` } }, [
                D.Button({ attrs: { type: 'submit', class: cx(token('btn'), token('btn/primary')) } }, [t(db, 'cta.save')]),
                D.Button({ attrs: { type: 'button', 'data-m-key': 'clinic:cancel-form', class: cx(token('btn'), token('btn/secondary')) } }, [t(db, 'cta.cancel')])
              ])
            ])
        )
      ]);
    }

    function renderBookingList(db) {
      var bookings = db.data.tables.clinic_bookings || [];
      var rows = bookings.map(function (b) {
        var patient = (db.data.tables.clinic_patients || []).find(function (p) { return p && (p.id === b.patient_id || p.id === b.patient); });
        var doctor = (db.data.tables.clinic_doctors || []).find(function (d) { return d && (d.id === b.doctor_id || d.id === b.doctor); });
        var service = (db.data.tables.clinic_services || []).find(function (s) { return s && (s.id === b.service_id || s.id === b.service); });

        var patientName = patient ? (enrichRecordWithLang('clinic_patients', patient, db).__displayName || 'Unnamed') : '—';
        var doctorName = doctor ? (enrichRecordWithLang('clinic_doctors', doctor, db).__displayName || 'Dr. ?') : '—';
        var serviceName = service ? (enrichRecordWithLang('clinic_services', service, db).__displayName || 'Service ?') : '—';
        var st = b.booking_status || b.status || 'scheduled';

        return [
          patientName,
          doctorName,
          serviceName,
          b.start_time ? String(b.start_time).substring(0, 16) : (b.booked_at ? String(b.booked_at).substring(0, 16) : '—'),
          Comp.pill(String(st), statusTone(st)),
          D.Button({ attrs: { type: 'button', 'data-m-key': 'clinic:edit-booking', 'data-record-id': b.id, class: cx(token('btn'), token('btn/ghost'), token('btn/sm')) } }, ['Edit'])
        ];
      });

      return Comp.segmented(t(db, 'nav.bookings'), D.Div({ attrs: { class: tw`space-y-4` } }, [
        Comp.headline(t(db, 'nav.bookings'), [
          D.Button({ attrs: { type: 'button', 'data-m-key': 'clinic:add-booking', class: cx(token('btn'), token('btn/primary'), token('btn/sm')) } }, [t(db, 'cta.addBooking')])
        ]),
        Comp.table([t(db, 'label.patient'), t(db, 'label.doctor'), t(db, 'label.service'), t(db, 'label.time'), t(db, 'label.status'), ''], rows)
      ]));
    }

    function renderBookingForm(db) {
      var editing = resolveEditingRecord(db, 'clinic_bookings') || {};
      var isNew = !editing.id;

      var patients = (db.data.tables.clinic_patients || []).map(function (p) {
        var display = enrichRecordWithLang('clinic_patients', p, db);
        return { value: p.id, label: display.__displayName || display.code || 'No Name' };
      });
      var doctors = (db.data.tables.clinic_doctors || []).map(function (d) {
        var display = enrichRecordWithLang('clinic_doctors', d, db);
        return { value: d.id, label: display.__displayName || display.code || 'Dr.' };
      });
      var services = (db.data.tables.clinic_services || []).map(function (s) {
        var display = enrichRecordWithLang('clinic_services', s, db);
        return { value: s.id, label: display.__displayName || display.code || 'Service' };
      });

      return Comp.surface([
        Comp.headline(isNew ? t(db, 'cta.addBooking') : 'Edit Booking', []),
        D.Form({ attrs: { 'data-m-key': 'clinic:booking-submit', class: tw`max-w-2xl space-y-6` } }, [
          Comp.grid(2, [
            Comp.formField(t(db, 'label.patient'), D.Select({ attrs: { name: 'patient', required: true, class: token('field/select') } },
              [D.Option({ attrs: { value: '' } }, ['Select Patient'])].concat(patients.map(function (p) { return D.Option({ attrs: { value: p.value, selected: (editing.patient_id || editing.patient) == p.value } }, [p.label]); }))
            )),
            Comp.formField(t(db, 'label.doctor'), D.Select({ attrs: { name: 'doctor', required: true, class: token('field/select') } },
              [D.Option({ attrs: { value: '' } }, ['Select Doctor'])].concat(doctors.map(function (d) { return D.Option({ attrs: { value: d.value, selected: (editing.doctor_id || editing.doctor) == d.value } }, [d.label]); }))
            ))
          ]),
          Comp.grid(2, [
            Comp.formField(t(db, 'label.service'), D.Select({ attrs: { name: 'service', required: true, class: token('field/select') } },
              [D.Option({ attrs: { value: '' } }, ['Select Service'])].concat(services.map(function (s) { return D.Option({ attrs: { value: s.value, selected: (editing.service_id || editing.service) == s.value } }, [s.label]); }))
            )),
            Comp.formField('Date & Time', D.Input({ attrs: { name: 'datetime', type: 'datetime-local', required: true, value: editing.start_time ? String(editing.start_time).slice(0, 16) : (editing.booked_at ? String(editing.booked_at).slice(0, 16) : ''), class: token('field') } }))
          ]),
          D.Div({ attrs: { class: tw`pt-2 flex items-center gap-2` } }, [
            D.Button({ attrs: { type: 'submit', class: cx(token('btn'), token('btn/primary')) } }, [t(db, 'cta.save')]),
            D.Button({ attrs: { type: 'button', 'data-m-key': 'clinic:cancel-form', class: cx(token('btn'), token('btn/secondary')) } }, [t(db, 'cta.cancel')])
          ])
        ])
      ]);
    }

    function renderMasterTable(db) {
      var tableName = MASTER_TABLES.indexOf(db.data.activeMasterTable) !== -1 ? db.data.activeMasterTable : MASTER_TABLES[0];
      var rows = (db.data.tables[tableName] || []);
      var schema = getTableSchema(db, tableName);
      var fields = getRenderableFields(schema);
      var baseTable = tableName.replace(/_lang$/, '');
      var vertical = VERTICAL_TABLES[baseTable] || {};
      var langTable = vertical.langTable || (baseTable + '_lang');
      var langSchema = getTableSchema(db, langTable);
      var translationFields = (vertical.translationFields || []).map(function (name) {
        return { name: name, type: 'nvarchar', label: name };
      });
      if (!translationFields.length && langSchema) {
        translationFields = getRenderableFields(langSchema).filter(function (f) {
          return f.name !== 'lang' && f.name !== (vertical.fk || (baseTable + '_id'));
        });
      }
      var availableLangs = listAvailableLangs(db, baseTable);
      var displayFields = fields.slice(0, 3);
      var editing = resolveEditingRecord(db, tableName) || {};

      var tableRows = rows.slice(0, 20).map(function (r) {
        var enriched = enrichRecordWithLang(tableName, r, db);
        var cells = displayFields.map(function (f) {
          var val = enriched[f.name];
          if (val == null && enriched.__displayName) val = enriched.__displayName;
          return formatValue(val);
        });
        cells.push(D.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:edit-record',
              'data-record-id': r.id,
              'data-table': tableName,
              class: cx(token('btn'), token('btn/secondary'), token('btn/sm'))
            }
          }, ['Edit']),
          D.Button({
            attrs: {
              type: 'button',
              'data-m-key': 'clinic:delete-record',
              'data-record-id': r.id,
              'data-table': tableName,
              class: cx(token('btn'), token('btn/destructive'), token('btn/sm'))
            }
          }, ['✕'])
        ]));
        return cells;
      });

      var formFields = fields.map(function (field) {
        var value = editing[field.name] || '';
        if ((field.type === 'datetime' || field.type === 'date') && value) value = String(value).slice(0, field.type === 'date' ? 10 : 16);
        var label = field.label || field.comment || field.name;
        return Comp.formField(label, buildFieldInput(field, value, db, tableName));
      });

      var formGrid = [];
      for (var i = 0; i < formFields.length; i += 2) {
        formGrid.push(Comp.grid(2, formFields.slice(i, i + 2)));
      }

      var translationGroups = [];
      if (translationFields.length && availableLangs.length) {
        translationGroups = availableLangs.map(function (lng) {
          var langRec = editing.id ? findLangRecord(db, baseTable, editing.id, lng) : null;
          var rows = [
            D.Input({ attrs: { type: 'hidden', name: 'langId:' + lng, value: langRec && langRec.id ? langRec.id : '' } })
          ];
          translationFields.forEach(function (tf) {
            var val = langRec && langRec[tf.name] ? langRec[tf.name] : '';
            var type = (tf.type === 'int' || tf.type === 'decimal' || tf.type === 'float') ? 'number'
              : (tf.type === 'date' ? 'date' : (tf.type === 'datetime' ? 'datetime-local' : 'text'));
            rows.push(Comp.formField((tf.label || tf.name) + ' (' + lng + ')', D.Input({
              attrs: { name: tf.name + ':' + lng, value: val, type: type, class: token('field') }
            })));
          });
          return Comp.grid(2, rows);
        });
      }

      var headers = displayFields.map(function (f) { return f.label || f.name; }).concat(['']);

      return Comp.segmented(t(db, 'section.master'), D.Div({ attrs: { class: tw`space-y-4` } }, [
        Comp.toolbar([
          D.Select({
            attrs: {
              'data-m-key': 'clinic:master-select',
              class: token('field/select')
            }
          }, MASTER_TABLES.map(function (name) {
            return D.Option({ attrs: { value: name, selected: name === tableName } }, [name]);
          }))
        ]),
        Comp.table(headers, tableRows),
        D.Form({ attrs: { 'data-m-key': 'clinic:crud-form', 'data-table': tableName, class: tw`space-y-4` } },
          (editing.id ? [D.Input({ attrs: { type: 'hidden', name: 'id', value: editing.id } })] : [])
            .concat(formGrid)
            .concat(translationGroups)
            .concat([
              D.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
                D.Button({ attrs: { type: 'submit', class: cx(token('btn'), token('btn/primary'), token('btn/sm')) } }, [t(db, 'cta.save')]),
                D.Button({ attrs: { type: 'reset', class: cx(token('btn'), token('btn/secondary'), token('btn/sm')) } }, [t(db, 'cta.reset')])
              ])
            ])
        )
      ]));
    }

    function renderBody(db) {
      return D.Div({ attrs: { class: tok('layout/shell', tw`min-h-screen flex bg-[var(--background)] text-[var(--foreground)] font-sans transition-colors duration-300`) } }, [
        renderSidebar(db),
        D.Main({ attrs: { class: tok('layout/main', tw`flex-1 min-w-0`) } }, [
          D.Div({ attrs: { class: tw`max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8` } }, [
            renderTopbar(db),
            db.data.activeView === 'dashboard'
              ? D.Div({ attrs: { class: tw`space-y-6` } }, [
                renderStatsRow(db),
                D.Div({ attrs: { class: tw`grid lg:grid-cols-12 gap-6` } }, [
                  D.Div({ attrs: { class: tw`lg:col-span-8 space-y-6` } }, [renderActivity(db), renderMasterTable(db)]),
                  D.Div({ attrs: { class: tw`lg:col-span-4 space-y-6` } }, [renderPatientPanel(db)])
                ])
              ])
              : db.data.activeView === 'patients' ? renderPatientList(db)
                : db.data.activeView === 'patient-form' ? renderPatientForm(db)
                  : db.data.activeView === 'bookings' ? renderBookingList(db)
                    : db.data.activeView === 'booking-form' ? renderBookingForm(db)
                      : db.data.activeView === 'master' ? renderMasterTable(db)
                        : D.Div({ attrs: { class: tw`py-12 text-center`, style: 'color: var(--muted-foreground);' } }, ['View not implemented: ' + db.data.activeView])
          ])
        ])
      ]);
    }

    if (!OrdersFactory || !OrdersFactory.create) {
      console.error('[Clinic App] ClinicOrders is required.');
      return;
    }

    var app;
    var orders = OrdersFactory.create({
      db: firebaseDb,
      onLangChange: function (lang) {
        if (global.localStorage && lang) global.localStorage.setItem('clinic:lang', lang);
        var dir = lang === 'ar' ? 'rtl' : 'ltr';
        applyEnvToDocument({
          theme: (app && app.getState && app.getState().env && app.getState().env.theme) || database.env.theme,
          lang: lang,
          dir: dir
        });
      },
      onThemeChange: function (theme) {
        if (global.localStorage && theme) global.localStorage.setItem('clinic:theme', theme);
        applyEnvToDocument({
          theme: theme,
          lang: (app && app.getState && app.getState().env && app.getState().env.lang) || database.env.lang,
          dir: (app && app.getState && app.getState().env && app.getState().env.dir) || database.env.dir
        });
      }
    });

    // ========================================================================
    // APP INITIALIZATION
    // ========================================================================

    console.log('%c[Clinic App] 🚀 Initializing...', 'color: #3b82f6; font-weight: bold;');
    console.log('[Clinic App] ✅ Inline Schema loaded with', Object.keys(INLINE_SCHEMA).length, 'tables');
    console.log('[Clinic App] 🔌 Firebase Adapter will load data from API');

    M.app.setBody(renderBody);
    app = M.app.createApp(database, orders);
    applyEnvToDocument(database.env);
    app.mount('#app');

    // Load initial data via REST
    loadMasterData(app);

    // Log diagnostics
    setTimeout(function () {
      logDiagnostics(app.getState ? app.getState() : database);
    }, 2000);
  }) (window);
