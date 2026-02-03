/**
 * Mishkah Admin Dashboard
 * Three-tab interface for backend management:
 * 1. JSON Viewer - Live data from /api/branches/:branch/modules/:module
 * 2. CRUD Manager - Table management with Mishkah DSL
 * 3. SQL Execute Tool - SQL query interface with schema tree
 */

(async function () {
  'use strict';

  // Get Mishkah utilities
  const M = window.Mishkah;
  const D = M.DSL;
  const U = M.utils;

  // Get URL parameters
  const params = new URLSearchParams(window.location.search);
  const DEFAULT_BRANCH = params.get('branch') || params.get('branchId') || 'dar';
  const DEFAULT_MODULE = params.get('module') || params.get('moduleId') || 'pos';
  const SAVED_LANG = localStorage.getItem('admin-lang') || 'ar';

  // =================================================================
  // Global Database (Single Source of Truth)
  // =================================================================
  window.database = {
    env: {
      theme: localStorage.getItem('admin-theme') || 'dark',
      lang: SAVED_LANG,
      dir: SAVED_LANG === 'ar' ? 'rtl' : 'ltr'
    },
    config: {
      branchId: DEFAULT_BRANCH,
      moduleId: DEFAULT_MODULE
    },
    state: {
      activeTab: 'json-viewer',
      loading: false,
      error: null
    },
    jsonViewer: {
      data: null,
      lastUpdated: null,
      autoRefresh: false
    },
    crudManager: {
      selectedTable: null,
      tableData: [],
      schema: null
    },
    sqlExecute: {
      schema: null,
      query: 'SELECT * FROM order_header LIMIT 10',
      results: null,
      error: null,
      queryTime: null
    }
  };

  // =================================================================
  // i18n Helpers
  // =================================================================
  const I18N_CONFIG = { fallbackLang: 'ar' };
  const TRANSLATION_CACHE = new Map();
  const LOCAL_TRANSLATIONS = {
    'ui.actions.refresh': { en: '🔄 Refresh', ar: '🔄 تحديث' },
    'ui.actions.theme.light': { en: '🌞 Light', ar: '🌞 فاتح' },
    'ui.actions.theme.dark': { en: '🌙 Dark', ar: '🌙 داكن' },
    'ui.lang.label': { en: 'Language', ar: 'اللغة' },
    'ui.tabs.json.label': { en: '📊 JSON Viewer', ar: '📊 عارض JSON' },
    'ui.tabs.json.desc': { en: 'Live data explorer', ar: 'استعراض البيانات الحية' },
    'ui.tabs.crud.label': { en: '🗂️ CRUD Manager', ar: '🗂️ إدارة الجداول' },
    'ui.tabs.crud.desc': { en: 'Table management', ar: 'إدارة الجداول' },
    'ui.tabs.sql.label': { en: '⚡ SQL Execute', ar: '⚡ تنفيذ SQL' },
    'ui.tabs.sql.desc': { en: 'Query interface', ar: 'واجهة الاستعلام' },
    'ui.json.title': { en: 'JSON Viewer — Live Data', ar: 'عارض JSON — بيانات مباشرة' },
    'ui.json.branchPlaceholder': { en: 'Branch ID', ar: 'معرف الفرع' },
    'ui.json.modulePlaceholder': { en: 'Module ID', ar: 'معرف الوحدة' },
    'ui.json.load': { en: 'Load Data', ar: 'تحميل البيانات' },
    'ui.json.lastUpdated': { en: 'Last updated', ar: 'آخر تحديث' },
    'ui.json.loading': { en: 'Loading data', ar: 'جاري تحميل البيانات' },
    'ui.json.error': { en: 'Error', ar: 'خطأ' },
    'ui.json.empty': { en: 'Click "Load Data" to fetch live data', ar: 'اضغط "تحميل البيانات" لجلب البيانات المباشرة' },
    'ui.crud.title': { en: 'CRUD Manager — Table Management', ar: 'إدارة CRUD — إدارة الجداول' },
    'ui.crud.select': { en: 'Select Table...', ar: 'اختر الجدول...' },
    'ui.crud.load': { en: 'Load Table', ar: 'تحميل الجدول' },
    'ui.crud.loading': { en: 'Loading table data', ar: 'جاري تحميل بيانات الجدول' },
    'ui.crud.empty': { en: 'Select a table and click "Load Table"', ar: 'اختر جدولاً واضغط "تحميل الجدول"' },
    'ui.sql.title': { en: 'SQL Execute — Query Interface', ar: 'تنفيذ SQL — واجهة الاستعلام' },
    'ui.sql.schema': { en: 'Database Schema', ar: 'مخطط قاعدة البيانات' },
    'ui.sql.execute': { en: '▶️ Execute Query', ar: '▶️ تنفيذ الاستعلام' },
    'ui.sql.executedIn': { en: 'Executed in', ar: 'تم التنفيذ خلال' },
    'ui.sql.loading': { en: 'Executing query', ar: 'جاري تنفيذ الاستعلام' },
    'ui.sql.error': { en: 'Error:', ar: 'خطأ:' },
    'ui.sql.noRows': { en: 'No rows returned', ar: 'لا توجد صفوف' },
    'ui.sql.empty': { en: 'Write your SQL query and click "Execute"', ar: 'اكتب استعلام SQL واضغط "تنفيذ"' }
  };

  function normalizeLangCode(lang) {
    if (!lang || typeof lang !== 'string') return I18N_CONFIG.fallbackLang;
    const normalized = lang.trim().toLowerCase();
    return normalized || I18N_CONFIG.fallbackLang;
  }

  function flattenTranslations(translations = {}) {
    const map = new Map();
    Object.entries(translations).forEach(([table, records]) => {
      Object.entries(records || {}).forEach(([recordId, fields]) => {
        Object.entries(fields || {}).forEach(([field, value]) => {
          if (value === undefined || value === null) return;
          const key = `${table}.${recordId}.${field}`;
          map.set(key, value);
        });
      });
    });
    return map;
  }

  function buildLocalTranslations(lang) {
    const map = new Map();
    Object.entries(LOCAL_TRANSLATIONS).forEach(([key, entry]) => {
      const value = entry[lang] || entry[I18N_CONFIG.fallbackLang];
      if (value) map.set(key, value);
    });
    return map;
  }

  async function fetchTranslations(lang) {
    const branchId = window.database.config.branchId;
    const moduleId = window.database.config.moduleId;
    const url = `/api/store/i18n?branch=${encodeURIComponent(branchId)}&module=${encodeURIComponent(moduleId)}&lang=${lang}&fallback=${I18N_CONFIG.fallbackLang}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return flattenTranslations(payload.translations || {});
    } catch (error) {
      console.warn('[i18n] Failed to fetch remote translations:', error);
      return new Map();
    }
  }

  async function primeTranslations(lang) {
    const normalized = normalizeLangCode(lang);
    const cached = TRANSLATION_CACHE.get(normalized);
    if (cached?.status === 'ready') return cached.map;
    if (cached?.status === 'pending') return cached.promise;

    const promise = (async () => {
      const remote = await fetchTranslations(normalized);
      const local = buildLocalTranslations(normalized);
      const merged = new Map([...remote.entries(), ...local.entries()]);
      TRANSLATION_CACHE.set(normalized, { status: 'ready', map: merged, fetchedAt: Date.now() });
      return merged;
    })();

    TRANSLATION_CACHE.set(normalized, { status: 'pending', promise });
    return promise;
  }

  function invalidateTranslations() {
    TRANSLATION_CACHE.clear();
  }

  function trans(key, lang = window.database.env.lang) {
    const normalized = normalizeLangCode(lang);
    const current = TRANSLATION_CACHE.get(normalized)?.map;
    const fallback = TRANSLATION_CACHE.get(I18N_CONFIG.fallbackLang)?.map;
    if (current?.has(key)) return current.get(key);
    if (fallback?.has(key)) return fallback.get(key);
    return key;
  }

  // =================================================================
  // Utility Functions
  // =================================================================

  /**
   * Fetch JSON from API
   */
  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Format JSON with syntax highlighting
   */
  function formatJson(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    const nextSpaces = '  '.repeat(indent + 1);

    if (obj === null) {
      return `<span class="json-null">null</span>`;
    }

    if (typeof obj === 'boolean') {
      return `<span class="json-boolean">${obj}</span>`;
    }

    if (typeof obj === 'number') {
      return `<span class="json-number">${obj}</span>`;
    }

    if (typeof obj === 'string') {
      return `<span class="json-string">"${obj}"</span>`;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      const items = obj.map(item => `${nextSpaces}${formatJson(item, indent + 1)}`).join(',\n');
      return `[\n${items}\n${spaces}]`;
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      const items = keys.map(key => {
        const value = formatJson(obj[key], indent + 1);
        return `${nextSpaces}<span class="json-key">"${key}"</span>: ${value}`;
      }).join(',\n');
      return `{\n${items}\n${spaces}}`;
    }

    return String(obj);
  }

  // =================================================================
  // API Functions
  // =================================================================

  /**
   * Load live data from branch/module endpoint
   */
  async function loadLiveData() {
    const { branchId, moduleId } = window.database.config;
    const url = `/api/branches/${branchId}/modules/${moduleId}`;
    const data = await fetchJson(url);
    return data;
  }

  /**
   * Load database schema
   */
  async function loadDatabaseSchema() {
    return fetchJson('/api/schema/database');
  }

  /**
   * Execute SQL query
   */
  async function executeQuery(query) {
    const { branchId, moduleId } = window.database.config;
    return fetchJson('/api/query/raw', {
      method: 'POST',
      body: JSON.stringify({ sql: query, branchId, moduleId })
    });
  }

  /**
   * Load table data using Query API
   */
  async function loadTableData(tableName, limit = 100) {
    const { branchId, moduleId } = window.database.config;
    return fetchJson('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        table: tableName,
        branchId,
        moduleId,
        limit
      })
    });
  }

  // =================================================================
  // Components
  // =================================================================

  /**
   * Header Component
   */
  function Header(db) {
    const { branchId, moduleId } = db.config;
    const { theme, lang } = db.env;
    const themeLabel = theme === 'dark' ? trans('ui.actions.theme.light', lang) : trans('ui.actions.theme.dark', lang);

    return D.Containers.Header({ attrs: { class: 'admin-header' } }, [
      D.Containers.Div({}, [
        D.Text.H1({}, ['Mishkah Admin Dashboard']),
        D.Text.Small({ attrs: { style: 'color: var(--admin-muted); margin-right: 1rem;' } }, [
          `Branch: ${branchId} | Module: ${moduleId}`
        ])
      ]),
      D.Containers.Div({ attrs: { class: 'controls' } }, [
        D.Forms.Button({
          attrs: {
            class: 'btn',
            'data-m-gkey': 'toggle-theme'
          }
        }, [themeLabel]),
        D.Forms.Select({
          attrs: {
            'data-m-gkey': 'env-lang-select',
            value: lang,
            class: 'btn'
          }
        }, [
          D.Option({ attrs: { value: 'ar', selected: lang === 'ar' } }, ['العربية']),
          D.Option({ attrs: { value: 'en', selected: lang === 'en' } }, ['English'])
        ]),
        D.Forms.Button({
          attrs: {
            class: 'btn btn-primary',
            'data-m-gkey': 'refresh-data'
          }
        }, [trans('ui.actions.refresh', lang)])
      ])
    ]);
  }

  /**
   * Tabs Sidebar Component
   */
  function TabsSidebar(db) {
    const { activeTab } = db.state;
    const { lang } = db.env;

    const tabs = [
      { id: 'json-viewer', label: trans('ui.tabs.json.label', lang), desc: trans('ui.tabs.json.desc', lang) },
      { id: 'crud-manager', label: trans('ui.tabs.crud.label', lang), desc: trans('ui.tabs.crud.desc', lang) },
      { id: 'sql-execute', label: trans('ui.tabs.sql.label', lang), desc: trans('ui.tabs.sql.desc', lang) }
    ];

    return D.Containers.Aside({ attrs: { class: 'admin-tabs' } }, tabs.map(tab =>
      D.Containers.Div({
        attrs: {
          class: `admin-tab ${activeTab === tab.id ? 'active' : ''}`,
          'data-m-gkey': `switch-tab:${tab.id}`
        }
      }, [
        D.Text.Div({ attrs: { style: 'font-weight: 600;' } }, [tab.label]),
        D.Text.Small({ attrs: { style: 'font-size: 0.75rem; opacity: 0.7;' } }, [tab.desc])
      ])
    ));
  }

  /**
   * JSON Viewer Tab Component
   */
  function JsonViewerTab(db) {
    const { data, lastUpdated } = db.jsonViewer;
    const { loading, error } = db.state;
    const { lang } = db.env;

    return D.Containers.Div({ attrs: { class: 'admin-panel' } }, [
      D.Text.H2({}, [trans('ui.json.title', lang)]),

      // Controls
      D.Containers.Div({ attrs: { class: 'input-group' } }, [
        D.Forms.Input({
          attrs: {
            type: 'text',
            placeholder: trans('ui.json.branchPlaceholder', lang),
            value: db.config.branchId,
            'data-m-gkey': 'json-branch-input'
          }
        }),
        D.Forms.Input({
          attrs: {
            type: 'text',
            placeholder: trans('ui.json.modulePlaceholder', lang),
            value: db.config.moduleId,
            'data-m-gkey': 'json-module-input'
          }
        }),
        D.Forms.Button({
          attrs: {
            class: 'btn btn-primary',
            'data-m-gkey': 'json-load-data'
          }
        }, [trans('ui.json.load', lang)])
      ]),

      // Status
      lastUpdated ? D.Text.P({ attrs: { style: 'color: var(--admin-muted); margin-bottom: 1rem; font-size: 0.875rem;' } }, [
        `${trans('ui.json.lastUpdated', lang)}: ${new Date(lastUpdated).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}`
      ]) : null,

      // Content
      loading
        ? D.Containers.Div({ attrs: { class: 'loading' } }, [trans('ui.json.loading', lang)])
        : error
          ? D.Containers.Div({ attrs: { style: 'color: var(--admin-danger); padding: 2rem;' } }, [
            D.Text.Strong({}, [`${trans('ui.json.error', lang)}: `]),
            error
          ])
          : data
            ? D.Containers.Pre({
              attrs: {
                class: 'json-viewer',
                style: 'flex: 1; overflow: auto;'
              }
            }, [
              D.Containers.Code({ attrs: { class: 'json-tree' } }, [
                { __html: formatJson(data) }
              ])
            ])
            : D.Containers.Div({ attrs: { style: 'text-align: center; padding: 3rem; color: var(--admin-muted);' } }, [
              trans('ui.json.empty', lang)
            ])
    ]);
  }

  /**
   * CRUD Manager Tab Component
   */
  function CrudManagerTab(db) {
    const { selectedTable, tableData, schema } = db.crudManager;
    const { loading, error } = db.state;
    const { lang } = db.env;

    const tables = schema?.tables?.map(t => t.name) || [];

    return D.Containers.Div({ attrs: { class: 'admin-panel' } }, [
      D.Text.H2({}, [trans('ui.crud.title', lang)]),

      // Table selection
      D.Containers.Div({ attrs: { class: 'input-group' } }, [
        D.Forms.Select({
          attrs: {
            'data-m-gkey': 'crud-table-select'
          }
        }, [
          D.Option({ attrs: { value: '' } }, [trans('ui.crud.select', lang)]),
          ...tables.map(table =>
            D.Option({
              attrs: {
                value: table,
                selected: table === selectedTable
              }
            }, [table])
          )
        ]),
        D.Forms.Button({
          attrs: {
            class: 'btn btn-primary',
            'data-m-gkey': 'crud-load-table'
          }
        }, [trans('ui.crud.load', lang)])
      ]),

      // Table data
      loading
        ? D.Containers.Div({ attrs: { class: 'loading' } }, [trans('ui.crud.loading', lang)])
        : error
          ? D.Containers.Div({ attrs: { style: 'color: var(--admin-danger); padding: 2rem;' } }, [error])
          : tableData.length > 0
            ? D.Containers.Div({ attrs: { style: 'overflow: auto; flex: 1;' } }, [
              D.Containers.Table({ attrs: { class: 'crud-table' } }, [
                D.Containers.Thead({}, [
                  D.Containers.Tr({}, [
                    ...Object.keys(tableData[0] || {}).map(key =>
                      D.Containers.Th({}, [key])
                    )
                  ])
                ]),
                D.Containers.Tbody({},
                  tableData.slice(0, 100).map(row =>
                    D.Containers.Tr({}, [
                      ...Object.values(row).map(value =>
                        D.Containers.Td({}, [
                          typeof value === 'object'
                            ? JSON.stringify(value).substring(0, 50) + '...'
                            : String(value).substring(0, 50)
                        ])
                      )
                    ])
                  )
                )
              ])
            ])
            : D.Containers.Div({ attrs: { style: 'text-align: center; padding: 3rem; color: var(--admin-muted);' } }, [
              trans('ui.crud.empty', lang)
            ])
    ]);
  }

  /**
   * SQL Execute Tab Component
   */
  function SqlExecuteTab(db) {
    const { schema, results, error, queryTime } = db.sqlExecute;
    const { loading } = db.state;
    const { lang } = db.env;

    const tables = schema?.tables || [];

    return D.Containers.Div({ attrs: { class: 'admin-panel' } }, [
      D.Text.H2({}, [trans('ui.sql.title', lang)]),

      D.Containers.Div({ attrs: { class: 'sql-execute-layout' } }, [
        // Sidebar with schema tree
        D.Containers.Div({ attrs: { class: 'sql-sidebar' } }, [
          D.Text.H3({}, [trans('ui.sql.schema', lang)]),
          D.Containers.Ul({ attrs: { class: 'sql-tree' } }, tables.map(table =>
            D.Containers.Li({
              attrs: {
                class: 'sql-tree-item',
                'data-m-gkey': `sql-table:${table.name}`
              }
            }, [
              `📋 ${table.name} (${table.columns?.length || 0} cols)`
            ])
          ))
        ]),

        // Main area
        D.Containers.Div({ attrs: { class: 'sql-main' } }, [
          // SQL Editor
          D.Containers.Div({ attrs: { class: 'sql-editor-wrapper' } }, [
            D.Containers.Textarea({
              attrs: {
                id: 'sql-editor',
                'data-m-gkey': 'sql-query-input',
                style: 'width: 100%; height: 100%; padding: 1rem; font-family: monospace; font-size: 0.875rem; border: none; resize: none;'
              }
            }, [db.sqlExecute.query || 'SELECT * FROM order_header LIMIT 10'])
          ]),

          // Controls
          D.Containers.Div({ attrs: { style: 'display: flex; gap: 1rem;' } }, [
            D.Forms.Button({
              attrs: {
                class: 'btn btn-primary',
                'data-m-gkey': 'sql-execute-query'
              }
            }, [trans('ui.sql.execute', lang)]),
            queryTime ? D.Text.Span({
              attrs: {
                class: 'status-badge status-success'
              }
            }, [`${trans('ui.sql.executedIn', lang)} ${queryTime}ms`]) : null
          ]),

          // Results
          loading
            ? D.Containers.Div({ attrs: { class: 'loading' } }, [trans('ui.sql.loading', lang)])
            : error
              ? D.Containers.Div({ attrs: { class: 'sql-results', style: 'color: var(--admin-danger);' } }, [
                D.Text.Strong({}, [`${trans('ui.sql.error', lang)} `]),
                error
              ])
              : results
                ? D.Containers.Div({ attrs: { class: 'sql-results', style: 'overflow: auto;' } }, [
                  D.Text.P({ attrs: { style: 'margin-bottom: 1rem; color: var(--admin-muted);' } }, [
                    `Returned ${results.rows?.length || 0} rows`
                  ]),
                  results.rows?.length > 0
                    ? D.Containers.Table({ attrs: { class: 'crud-table' } }, [
                      D.Containers.Thead({}, [
                        D.Containers.Tr({}, [
                          ...Object.keys(results.rows[0] || {}).map(key =>
                            D.Containers.Th({}, [key])
                          )
                        ])
                      ]),
                      D.Containers.Tbody({},
                        results.rows.map(row =>
                          D.Containers.Tr({}, [
                            ...Object.values(row).map(value =>
                              D.Containers.Td({}, [
                                typeof value === 'object'
                                  ? JSON.stringify(value).substring(0, 100) + '...'
                                  : String(value).substring(0, 100)
                              ])
                            )
                          ])
                        )
                      )
                    ])
                    : D.Text.P({}, [trans('ui.sql.noRows', lang)])
                ])
                : D.Containers.Div({ attrs: { style: 'text-align: center; padding: 3rem; color: var(--admin-muted);' } }, [
                  trans('ui.sql.empty', lang)
                ])
        ])
      ])
    ]);
  }

  /**
   * Main App Component
   */
  function AppBody(db) {
    const { activeTab } = db.state;

    const tabContent = activeTab === 'json-viewer'
      ? JsonViewerTab(db)
      : activeTab === 'crud-manager'
        ? CrudManagerTab(db)
        : SqlExecuteTab(db);

    return D.Containers.Div({}, [
      Header(db),
      D.Containers.Main({ attrs: { class: 'admin-main' } }, [
        TabsSidebar(db),
        D.Containers.Div({ attrs: { class: 'admin-content' } }, [tabContent])
      ])
    ]);
  }

  // =================================================================
  // Event Handlers (Orders)
  // =================================================================

  const orders = {
    'env.changeLang': {
      on: ['change'],
      gkeys: ['env-lang-select'],
      handler: async (e, ctx) => {
        const selectedLang = normalizeLangCode(e.target.value || I18N_CONFIG.fallbackLang);
        invalidateTranslations();
        await primeTranslations(selectedLang);
        ctx.setState((db) => ({
          ...db,
          env: { ...db.env, lang: selectedLang, dir: selectedLang === 'ar' ? 'rtl' : 'ltr' }
        }));
        document.documentElement.setAttribute('dir', selectedLang === 'ar' ? 'rtl' : 'ltr');
        localStorage.setItem('admin-lang', selectedLang);
      }
    },

    'toggle.theme': {
      on: ['click'],
      gkeys: ['toggle-theme'],
      handler: (e, ctx) => {
        const currentTheme = ctx.database.env.theme;
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        ctx.setState(db => ({
          ...db,
          env: { ...db.env, theme: newTheme }
        }));
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('admin-theme', newTheme);
      }
    },

    'refresh.data': {
      on: ['click'],
      gkeys: ['refresh-data'],
      handler: async (e, ctx) => {
        const { activeTab } = ctx.database.state;
        if (activeTab === 'json-viewer') {
          await orders['json.loadData'].handler(e, ctx);
        } else if (activeTab === 'crud-manager') {
          await orders['crud.loadTable'].handler(e, ctx);
        }
      }
    },

    'switch.tab': {
      on: ['click'],
      gkeys: ['switch-tab:json-viewer', 'switch-tab:crud-manager', 'switch-tab:sql-execute'],
      handler: (e, ctx) => {
        const gkey = e.currentTarget.getAttribute('data-m-gkey');
        const tabId = gkey.split(':')[1];
        ctx.setState(db => ({
          ...db,
          state: { ...db.state, activeTab: tabId }
        }));
      }
    },

    'json.loadData': {
      on: ['click'],
      gkeys: ['json-load-data'],
      handler: async (e, ctx) => {
        ctx.setState(db => ({
          ...db,
          state: { ...db.state, loading: true, error: null }
        }));

        try {
          const data = await loadLiveData();
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            jsonViewer: {
              ...db.jsonViewer,
              data,
              lastUpdated: new Date().toISOString()
            }
          }));
        } catch (error) {
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false, error: error.message }
          }));
        }
      }
    },

    'crud.loadTable': {
      on: ['click'],
      gkeys: ['crud-load-table'],
      handler: async (e, ctx) => {
        const { selectedTable } = ctx.database.crudManager;
        if (!selectedTable) return;

        ctx.setState(db => ({
          ...db,
          state: { ...db.state, loading: true, error: null }
        }));

        try {
          const result = await loadTableData(selectedTable);
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            crudManager: {
              ...db.crudManager,
              tableData: result.rows || []
            }
          }));
        } catch (error) {
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false, error: error.message }
          }));
        }
      }
    },

    'crud.selectTable': {
      on: ['change'],
      gkeys: ['crud-table-select'],
      handler: (e, ctx) => {
        const tableName = e.target.value;
        ctx.setState(db => ({
          ...db,
          crudManager: {
            ...db.crudManager,
            selectedTable: tableName,
            tableData: []
          }
        }));
      }
    },

    'sql.executeQuery': {
      on: ['click'],
      gkeys: ['sql-execute-query'],
      handler: async (e, ctx) => {
        const query = ctx.database.sqlExecute.query;
        if (!query) return;

        ctx.setState(db => ({
          ...db,
          state: { ...db.state, loading: true },
          sqlExecute: { ...db.sqlExecute, error: null, results: null }
        }));

        const startTime = Date.now();

        try {
          const result = await executeQuery(query);
          const duration = Date.now() - startTime;

          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            sqlExecute: {
              ...db.sqlExecute,
              results: result,
              queryTime: duration
            }
          }));
        } catch (error) {
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            sqlExecute: {
              ...db.sqlExecute,
              error: error.message,
              queryTime: null
            }
          }));
        }
      }
    },

    'sql.updateQuery': {
      on: ['input', 'change'],
      gkeys: ['sql-query-input'],
      handler: (e, ctx) => {
        const query = e.target.value;
        ctx.setState(db => ({
          ...db,
          sqlExecute: { ...db.sqlExecute, query }
        }));
      }
    }
  };

  // =================================================================
  // Initialize App
  // =================================================================

  // Load initial data
  (async () => {
    try {
      await primeTranslations(I18N_CONFIG.fallbackLang);
      await primeTranslations(window.database.env.lang);

      // Load database schema for CRUD and SQL tabs
      const schema = await loadDatabaseSchema();
      window.database.crudManager.schema = schema;
      window.database.sqlExecute.schema = schema;

      // Set initial theme
      document.documentElement.setAttribute('data-theme', window.database.env.theme);
      document.documentElement.setAttribute('dir', window.database.env.dir);

      // Initialize Mishkah app
      M.app({
        id: 'admin-dashboard',
        root: '#app',
        database: window.database,
        body: AppBody,
        orders,
        onError: (error) => {
          console.error('[Mishkah] App error:', error);
        }
      });
    } catch (error) {
      console.error('[Admin Dashboard] Initialization failed:', error);
      document.getElementById('app').innerHTML = `
        <div style="
          display: grid;
          place-items: center;
          height: 100vh;
          color: var(--admin-danger);
          font-size: 1.25rem;
        ">
          ❌ Failed to initialize dashboard: ${error.message}
        </div>
      `;
    }
  })();

})();
