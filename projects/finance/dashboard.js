(function (global) {
    'use strict';

    var M = global.Mishkah;
    var UC = global.UniversalComp;
    var UI = M.UI || {};

    if (!M || !M.DSL || !M.app || !UC || !M.REST) {
        console.error('[Finance Dashboard] Required libraries missing (Mishkah, DSL, App, UniversalComp, REST)');
        return;
    }

    async function loadFkReferenceOptions(app, tableName, schemaInfo, lang) {
        var fkDefs = collectFkDefs(schemaInfo, tableName, []);
        var options = {};

        for (var i = 0; i < fkDefs.length; i++) {
            var fk = fkDefs[i];
            if (!fk || !fk.target) continue;
            try {
                var repo = M.REST.repo(fk.target);
                var res = await repo.search({ lang: lang, limit: 200 });
                var rows = res.data || res || [];
                rows.forEach(function (row) {
                    if (!row) return;
                    var id = row.id || row.Id || row.uuid || row.uid;
                    if (!id) return;
                    var label = displayNameForRecord(row, fk.target, schemaInfo, lang) || id;
                    var list = options[fk.name] || (options[fk.name] = []);
                    if (!list.some(function (opt) { return opt.value === String(id); })) {
                        list.push({ value: String(id), label: label || String(id) });
                    }
                });
            } catch (err) {
                console.warn('[FK Options] failed to load reference data for', fk.target, err);
            }
        }
        return options;
    }

    var D = M.DSL;

    function pushNotification(app, type, message) {
        if (!app || !message) return;
        var entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: type || 'info',
            message: message
        };
        app.setState(function (prev) {
            var current = (prev.data.notifications || []).slice(-4);
            var next = current.concat([entry]);
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { notifications: next }) });
        });
    }

    function dismissNotification(app, id) {
        if (!app || !id) return;
        app.setState(function (prev) {
            var filtered = (prev.data.notifications || []).filter(function (note) { return note.id !== id; });
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { notifications: filtered }) });
        });
    }

    var DEFAULT_TABLE_TYPES = [
        { id: 'settings', labels: { ar: 'الإعدادات', en: 'Settings' }, icon: '⚙️' },
        { id: 'operations', labels: { ar: 'الحركات', en: 'Operations' }, icon: '📋' },
        { id: 'reports', labels: { ar: 'التقارير', en: 'Reports' }, icon: '📊' },
        { id: 'logs', labels: { ar: 'السجلات', en: 'Logs' }, icon: '📜' }
    ];

    function mergeTableTypes(primary, fallback) {
        var seen = new Set();
        var output = [];

        function add(list) {
            (list || []).forEach(function (item) {
                if (!item || !item.id || seen.has(item.id)) return;
                seen.add(item.id);
                output.push(item);
            });
        }

        add(primary);
        add(fallback);
        add(DEFAULT_TABLE_TYPES);
        return output.length ? output : DEFAULT_TABLE_TYPES;
    }

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    var STORAGE_KEYS = {
        theme: 'finance_crud_theme',
        lang: 'finance_crud_lang',
        tablePrefs: 'finance_crud_table_prefs_v2'
    };

    function loadPreference(key, fallback) {
        try {
            var value = global.localStorage ? global.localStorage.getItem(key) : null;
            return value || fallback;
        } catch (_err) {
            return fallback;
        }
    }

    function loadJsonPreference(key, fallback) {
        var raw = loadPreference(key, null);
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch (_err) {
            return fallback;
        }
    }

    function savePreference(key, value) {
        try {
            if (!global.localStorage) return;
            if (value === null || value === undefined) {
                global.localStorage.removeItem(key);
                return;
            }
            global.localStorage.setItem(key, String(value));
        } catch (_err) { }
    }

    function persistTablePrefs(prefs) {
        savePreference(STORAGE_KEYS.tablePrefs, JSON.stringify(prefs || {}));
    }

    function loadTablePrefs() {
        var prefs = loadJsonPreference(STORAGE_KEYS.tablePrefs, {});
        return prefs && typeof prefs === 'object' ? prefs : {};
    }

    function mergeTablePref(allPrefs, tableName, patch) {
        var nextPrefs = Object.assign({}, allPrefs || {});
        var current = nextPrefs[tableName] || {};
        nextPrefs[tableName] = Object.assign({}, current, patch);
        persistTablePrefs(nextPrefs);
        return nextPrefs;
    }

    var preferredLang = loadPreference(STORAGE_KEYS.lang, 'ar');
    var preferredTheme = loadPreference(STORAGE_KEYS.theme, 'light');
    var demoAuthKey = null;
    try {
        demoAuthKey = global.__financeAuthKey || (global.localStorage ? global.localStorage.getItem('finance:auth_api_key') : null) || null;
    } catch (_err) {
        demoAuthKey = null;
    }

    var initialTablePrefs = loadTablePrefs();

    function baseFkQuickModalState() {
        return {
            open: false,
            target: null,
            field: null,
            mode: null,
            record: {},
            search: '',
            options: [],
            columnsMeta: [],
            translations: {},
            translationFields: [],
            languages: [],
            fkOptions: {},
            loading: false,
            records: []
        };
    }

    // Read dashboard configuration
    var dashboardConfig = global.DASHBOARD_CONFIG || {};
    var configModuleId = dashboardConfig.moduleId || global.MODULE_ID || 'finance';
    var configBranch = dashboardConfig.branch || global.MISHKAH_BRANCH || 'pt';

    var initialState = {
        config: {
            moduleId: configModuleId,
            branch: configBranch
        },

        env: {
            theme: preferredTheme,
            lang: preferredLang,
            dir: preferredLang === 'ar' ? 'rtl' : 'ltr'
        },

        data: {
            tables: [],
            modules: [],
            schemaInfo: null,
            fkCache: {},
            referenceData: {},
            fkReferenceCache: {},
            columnPreferences: initialTablePrefs,
            columnVisibility: {},
            tableSort: {},
            activeGroupByTable: {},
            activeTable: null,
            records: [],
            total: 0,
            page: 1,
            loading: false,
            loadingRecord: false,
            searchTerm: '',
            error: null,
            languages: [],
            columnsOrder: null,
            columnsMeta: null,
            companyInfo: null,
            activeScreen: 'home',
            screens: {
                home: { loading: false, stats: {}, recentBookings: [], chartData: null },
                accounts: { loading: false, page: 1, limit: 20, search: '', list: [], total: 0, selected: null, selectedId: null },
                journals: { loading: false, page: 1, limit: 20, search: '', list: [], total: 0, selected: null, selectedId: null },
                reports: { loading: false, page: 1, limit: 20, search: '', list: [], total: 0, selected: null, selectedId: null },
            },
            sidebarSearch: '',
            selectedRecord: null,
            editRecord: null,
            translations: {},
            translationBaseline: {},
            translationRemovals: [],
            newLangCode: '',
            translationFields: [],
            saving: false,
            notifications: [],
            tableTypes: [],
            moduleOpen: {},
            defaultContext: {},
            authRequired: false,
            authContext: null,
            authOptions: { loading: false, companies: [], branches: [], users: [] },
            fkQuickModal: baseFkQuickModalState(),
            sidebarCollapsed: false,
            breadcrumbs: [],
            openContextRow: null,
            showInfoModal: false,
            showFormModal: false,
            formMode: 'create',
            activeFormTab: null,
            columnFilterOpen: false,
            columnFilterQuery: '',
            childCrudStack: [],
            authForm: {
                company_id: '',
                branch_id: '',
                user_insert: '',
                password: ''
            }
        }
    };

    // ============================================================================
    // SCHEMA HELPERS
    // ============================================================================

    // Note: Schema is built from API /crud/tables response, not static JSON

    function normalizeTableMeta(table, schemaInfo) {
        // Schema-first approach: use module_id and settings from schema
        var moduleId = table.module_id || null;
        var settings = table.settings || {};

        // Use schema icon from settings, fallback to table.icon
        var icon = (settings.icon) || table.icon || '📄';

        // Use schema module_id as type, fallback to old type for backward compatibility
        var type = moduleId || table.type || 'settings';

        return {
            type: type,
            module_id: moduleId,
            icon: icon,
            settings: settings
        };
    }

    function getFkDefs(schemaInfo, tableName) {
        if (!schemaInfo || !tableName) return [];

        // Read FK references from schema (provided by /crud/tables API)
        var tableMap = schemaInfo.tableMap || {};
        var tableDef = tableMap[tableName] || tableMap[String(tableName).toLowerCase()];

        if (!tableDef || !tableDef.fkReferences) {

            return [];
        }

        var fkDefs = tableDef.fkReferences.map(function (ref) {
            return { name: ref.columnName, target: ref.targetTable };
        });

        return fkDefs;
    }

    function collectFkDefs(schemaInfo, tableName, records) {
        if (!tableName) return [];
        // Simply return schema-defined FKs - no heuristics, no guessing
        var defs = getFkDefs(schemaInfo, tableName);

        return defs;
    }

    function displayNameForRecord(record, tableName, schemaInfo, lang) {
        if (!record) return '';

        // 1. Prioritize common display names directly on the record.
        if (record.display_name && !isLikelyUuid(record.display_name)) return record.display_name;
        if (record.name && !isLikelyUuid(record.name)) return record.name;
        if (record.label && !isLikelyUuid(record.label)) return record.label;
        if (record.title && !isLikelyUuid(record.title)) return record.title;

        // 2. Check for i18n translations - support both backend structures
        if (record.i18n) {
            var preferred = [lang, 'ar', 'en'].filter(Boolean);
            var langEntry = null;

            // New backend structure: i18n.lang[langCode]
            if (record.i18n.lang) {
                preferred.some(function (code) {
                    if (record.i18n.lang[code]) {
                        langEntry = record.i18n.lang[code];
                        return true;
                    }
                    return false;
                });
            }
            // Legacy structure: i18n[langCode]
            if (!langEntry) {
                preferred.some(function (code) {
                    if (record.i18n[code]) {
                        langEntry = record.i18n[code];
                        return true;
                    }
                    return false;
                });
            }

            if (langEntry) {
                if (langEntry.name) return langEntry.name;
                if (langEntry.label) return langEntry.label;
                if (langEntry.title) return langEntry.title;
            }
        }

        // 3. Fallback to other potential fields, like 'code'.
        if (record.code && !isLikelyUuid(record.code)) return record.code;

        // 4. As a last resort, show ID.
        return record.id || record.Id || record.uuid || '';
    }

    async function ensureFkObjects(app, tableName, records) {
        var schemaInfo = app.getState().data.schemaInfo;
        var lang = app.getState().env.lang;
        var fkCache = Object.assign({}, app.getState().data.fkCache || {});
        var fkDefs = collectFkDefs(schemaInfo, tableName, records);

        async function hydrateTarget(targetTable, ids) {
            if (!ids.length) return;

            var repo = M.REST.repo(targetTable);
            var cacheForTable = fkCache[targetTable] || {};
            var fetches = ids.map(async function (id) {
                if (cacheForTable[id]) {

                    return;
                }
                try {

                    var res = await repo.get(id, { lang: lang });

                    var rec = res.record || res;
                    var displayName = displayNameForRecord(rec, targetTable, schemaInfo, lang);

                    cacheForTable[id] = { id: rec.id || id, name: displayName };
                } catch (_err) {
                    console.error('[FK Debug] → Failed to fetch', targetTable + '/' + id, ':', _err);
                    cacheForTable[id] = { id: id, name: id };
                }
            });
            await Promise.all(fetches);
            fkCache[targetTable] = cacheForTable;

        }

        var missingIdsByTable = {};
        (fkDefs || []).forEach(function (fk) {
            (records || []).forEach(function (row) {
                var value = row[fk.name];
                if (!value) return;
                if (typeof value === 'object') {
                    var normalized = {
                        id: value.id || value.Id || value.uuid || value.uid || value,
                        name: value.name || value.label || displayNameForRecord(value, fk.target, schemaInfo, lang)
                    };
                    if (fk.name.endsWith('_id')) {
                        row[fk.name.replace(/_id$/, '')] = normalized;
                        row[fk.name] = normalized.id || row[fk.name];
                    } else {
                        row[fk.name] = normalized;
                    }
                    return;
                }
                var cached = fkCache[fk.target] && fkCache[fk.target][value];
                if (cached) {
                    if (fk.name.endsWith('_id')) {
                        row[fk.name.replace(/_id$/, '')] = cached;
                    } else {
                        row[fk.name] = cached;
                    }
                    return;
                }
                if (!missingIdsByTable[fk.target]) {
                    missingIdsByTable[fk.target] = new Set();
                }
                missingIdsByTable[fk.target].add(value);
            });
        });

        var missingTasks = Object.keys(missingIdsByTable).map(function (targetTable) {
            return hydrateTarget(targetTable, Array.from(missingIdsByTable[targetTable]));
        });

        if (missingTasks.length) {
            await Promise.all(missingTasks);
            (fkDefs || []).forEach(function (fk) {
                (records || []).forEach(function (row) {
                    var value = row[fk.name];
                    if (!value) return;
                    if (typeof value === 'object') return;
                    var cached = fkCache[fk.target] && fkCache[fk.target][value];
                    if (cached) {
                        if (fk.name.endsWith('_id')) {
                            row[fk.name.replace(/_id$/, '')] = cached;
                        } else {
                            row[fk.name] = cached;
                        }
                    }
                });
            });
        }

        app.setState(function (prev) {
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkCache: fkCache }) });
        });

        return records;
    }

    // ============================================================================
    // LOGIC (ORDERS)
    // ============================================================================

    async function performReseed(ctx, opts) {
        var defaults = opts || {};
        var passcode = defaults.passcode || prompt('أدخل كلمة مرور إعادة التهيئة (Passcode)', '');
        if (!passcode) return null;

        var defaultBranch = defaults.branchId;
        if (!defaultBranch) {
            try {
                var currentUrl = new URL(global.location.href);
                defaultBranch = currentUrl.searchParams.get('branch') || '';
            } catch (_err) {
                defaultBranch = '';
            }
        }

        var branchId = defaults.branchId || prompt('أدخل معرف الفرع المطلوب إعادة تهيئته (مثال: finance)', defaultBranch);
        if (!branchId) return null;

        var confirmed = confirm('سيتم إعادة بناء الجداول من الـ Seeds للفرع: ' + branchId + '. هل تريد المتابعة؟');
        if (!confirmed) return null;

        try {
            var response = await fetch('/api/manage/reseed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    passcode: passcode,
                    confirm: true,
                    branchId: branchId,
                    requestedBy: 'crud-universal',
                    reason: 'manual-seed-reset'
                })
            });

            var payload = await response.json().catch(function () { return {}; });
            if (!response.ok) {
                var errMsg = payload && (payload.message || payload.error) ? (payload.message || payload.error) : response.statusText;
                throw new Error(errMsg || 'unknown-error');
            }

            if (ctx) {
                await loadTables(ctx);
            }

            pushNotification(ctx, 'success', 'تمت إعادة التهيئة بنجاح. عدد الوحدات التي أعيد بناؤها: ' + ((payload.results || []).length || 0));
            return payload;
        } catch (error) {
            console.error('[Universal CRUD] Reseed failed', error);
            pushNotification(ctx, 'error', 'فشل إعادة التهيئة: ' + error.message);
            return null;
        }
    }

    var orders = {
        'auth:update-field': {
            on: ['input', 'change'],
            gkeys: ['auth:update-field'],
            handler: function (ev, ctx) {
                var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
                if (!target) return;
                var name = target.getAttribute('name') || target.getAttribute('data-field');
                if (!name) return;
                var value = target.value || '';
                ctx.setState(function (prev) {
                    var form = Object.assign({}, prev.data.authForm || {});
                    form[name] = value;
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { authForm: form }) });
                });
            }
        },
        'auth:submit': {
            on: ['click'],
            gkeys: ['auth:submit'],
            handler: async function (_ev, ctx) {
                var form = ctx.getState().data.authForm || {};
                var companyId = String(form.company_id || '').trim();
                var branchId = String(form.branch_id || '').trim();
                var userId = String(form.user_insert || '').trim();
                var password = String(form.password || '');
                if (!companyId || !branchId || !userId || !password) {
                    alert('Please provide company_id, branch_id, user_insert, and password');
                    return;
                }
                try {
                    var res = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-api-key': demoAuthKey || 'demo-auth-key'
                        },
                        body: JSON.stringify({
                            company_id: companyId,
                            branch_id: branchId,
                            user_id: userId,
                            password: password
                        })
                    });
                    var payload = await res.json().catch(function () { return {}; });
                    if (!res.ok || !payload || payload.ok !== true) {
                        var msg = payload && (payload.message || payload.error) ? (payload.message || payload.error) : 'auth-failed';
                        alert(msg);
                        return;
                    }
                    setCookie('company_id', companyId, 30);
                    setCookie('branch_id', branchId, 30);
                    setCookie('user_insert', userId, 30);
                    await loadContextInfo(ctx);
                    loadTables(ctx);
                } catch (error) {
                    console.error('[Auth] Login failed', error);
                    alert('auth-failed');
                }
            }
        },
        // Navigate between tables (triggered by clicking sidebar)
        'crud:select-table': {
            on: ['click'],
            gkeys: ['crud:select-table'],
            handler: async function (ev, ctx) {
                var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
                var holder = target && target.closest ? target.closest('[data-table]') : null;
                var tableName = (holder && holder.getAttribute('data-table')) || (target && target.getAttribute ? target.getAttribute('data-table') : null);
                if (!tableName) return;

                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeScreen: 'settings',
                            activeTable: tableName,
                            loading: true,
                            error: null,
                            records: [],
                            page: 1,
                            showFormModal: false,
                            showInfoModal: false,
                            openContextRow: null,
                            columnFilterOpen: false,
                            childCrudStack: []
                        })
                    });
                });

                await loadTableData(ctx, tableName);
            }
        },

        // Pagination
        'crud:page-next': {
            on: ['click'], gkeys: ['crud:page-next'],
            handler: function (ev, ctx) {
                var state = ctx.getState().data;
                if (state.total && state.page * state.limit < state.total) {
                    ctx.setState(function (p) { return Object.assign({}, p, { data: Object.assign({}, p.data, { page: p.data.page + 1 }) }) });
                    loadTableData(ctx, state.activeTable);
                }
            }
        },
        'crud:page-prev': {
            on: ['click'], gkeys: ['crud:page-prev'],
            handler: function (ev, ctx) {
                var state = ctx.getState().data;
                if (state.page > 1) {
                    ctx.setState(function (p) { return Object.assign({}, p, { data: Object.assign({}, p.data, { page: p.data.page - 1 }) }) });
                    loadTableData(ctx, state.activeTable);
                }
            }
        },
        'crud:page-first': {
            on: ['click'], gkeys: ['crud:page-first'],
            handler: function (ev, ctx) {
                var state = ctx.getState().data;
                if (state.page > 1) {
                    ctx.setState(function (p) { return Object.assign({}, p, { data: Object.assign({}, p.data, { page: 1 }) }) });
                    loadTableData(ctx, state.activeTable);
                }
            }
        },
        'crud:page-last': {
            on: ['click'], gkeys: ['crud:page-last'],
            handler: function (ev, ctx) {
                var state = ctx.getState().data;
                var totalPages = Math.ceil((state.total || 0) / state.limit);
                if (state.page < totalPages) {
                    ctx.setState(function (p) { return Object.assign({}, p, { data: Object.assign({}, p.data, { page: totalPages }) }) });
                    loadTableData(ctx, state.activeTable);
                }
            }
        },
        'crud:set-limit': {
            on: ['change'], gkeys: ['crud:set-limit'],
            handler: function (ev, ctx) {
                var val = parseInt(ev.target.value, 10);
                if (val >= 0) { // Allow 0
                    localStorage.setItem('crud_limit', val);
                    ctx.setState(function (p) { return Object.assign({}, p, { data: Object.assign({}, p.data, { page: 1, limit: val }) }) });
                    loadTableData(ctx, ctx.getState().data.activeTable);
                }
            }
        },

        // Global Search
        'crud:search': {
            on: ['input', 'keyup'],
            gkeys: ['crud:search'],
            handler: function (ev, ctx) {
                var term = ev.target.value;
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, { searchTerm: term })
                    });
                });

                if (ctx.getState().data.activeTable && ev.key === 'Enter') {
                    loadTableData(ctx, ctx.getState().data.activeTable);
                }
            }
        },

        // Refresh Data
        'crud:refresh': {
            on: ['click'],
            gkeys: ['crud:refresh'],
            handler: function (_ev, ctx) {
                var table = ctx.getState().data.activeTable;
                if (table) loadTableData(ctx, table);
            }
        },

        // Expand/Collapse module groups
        'crud:toggle-module': {
            on: ['click'],
            gkeys: ['crud:toggle-module'],
            handler: function (ev, ctx) {
                var moduleId = ev.target.getAttribute('data-module') || ev.target.closest('[data-module]')?.getAttribute('data-module');
                if (!moduleId) return;
                ctx.setState(function (prev) {
                    var open = Object.assign({}, prev.data.moduleOpen);
                    open[moduleId] = !open[moduleId];
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { moduleOpen: open }) });
                });
            }
        },

        // Copy selected record ID
        'crud:copy-id': {
            on: ['click'],
            gkeys: ['crud:copy-id'],
            handler: function (ev, ctx) {
                var id = ev.target.getAttribute('data-id') || ev.target.closest('[data-id]')?.getAttribute('data-id');
                if (!id || !navigator.clipboard) return;
                navigator.clipboard.writeText(id).then(function () {
                    pushNotification(ctx, 'success', ctx.getState().env.lang === 'ar' ? 'تم نسخ المعرف' : 'ID copied');
                }).catch(function () { });
            }
        },

        // Theme Toggle
        'crud:toggle-theme': {
            on: ['click'],
            gkeys: ['crud:toggle-theme'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    var newTheme = prev.env.theme === 'light' ? 'dark' : 'light';
                    savePreference(STORAGE_KEYS.theme, newTheme);
                    updateDocumentTheme(newTheme, prev.env.lang);
                    return Object.assign({}, prev, {
                        env: Object.assign({}, prev.env, { theme: newTheme })
                    });
                });
            }
        },

        // Lang Toggle
        'crud:toggle-lang': {
            on: ['click'],
            gkeys: ['crud:toggle-lang'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    var newLang = prev.env.lang === 'ar' ? 'en' : 'ar';
                    var newDir = newLang === 'ar' ? 'rtl' : 'ltr';
                    savePreference(STORAGE_KEYS.lang, newLang);
                    updateDocumentTheme(prev.env.theme, newLang);
                    var relabeledTables = relabelTables(prev.data.tables, newLang);
                    var rebuiltModules = buildModules(relabeledTables, prev.data.tableTypes || DEFAULT_TABLE_TYPES);
                    return Object.assign({}, prev, {
                        env: Object.assign({}, prev.env, { lang: newLang, dir: newDir }),
                        data: Object.assign({}, prev.data, { tables: relabeledTables, modules: rebuiltModules })
                    });
                });

                loadContextInfo(ctx);
                var table = ctx.getState().data.activeTable;
                if (table) loadTableData(ctx, table);
            }
        },

        // Back to dashboard (hide grids when a table is active)
        'crud:go-home': {
            on: ['click'],
            gkeys: ['crud:go-home'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeScreen: 'home',
                            activeTable: null,
                            records: [],
                            selectedRecord: null,
                            editRecord: null,
                            breadcrumbs: [],
                            childCrudStack: []
                        })
                    });
                });
            }
        },

        // Reseed tables from backend seeds
        'crud:reseed': {
            on: ['click'],
            gkeys: ['crud:reseed'],
            handler: function (_ev, ctx) {
                performReseed(ctx);
            }
        },

        // Switch between operational screens
        'crud:switch-screen': {
            on: ['click'],
            gkeys: ['crud:switch-screen'],
            handler: function (ev, ctx) {
                var target = ev && ev.target ? ev.target : null;
                var screen = target ? target.getAttribute('data-screen') : null;
                if (!screen && target && target.closest) {
                    var holder = target.closest('[data-screen]');
                    screen = holder ? holder.getAttribute('data-screen') : null;
                }
                if (!screen) return;
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeScreen: screen,
                            activeTable: null,
                            records: [],
                            selectedRecord: null,
                            editRecord: null,
                            breadcrumbs: []
                        })
                    });
                });
                loadActiveScreen(ctx, screen);
            }
        },
        'crud:update-sidebar-search': {
            on: ['input', 'change'],
            gkeys: ['crud:update-sidebar-search'],
            handler: function (ev, ctx) {
                var value = ev && ev.target ? ev.target.value : '';
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, { sidebarSearch: value })
                    });
                });
            }
        },

        // Dismiss notification toast
        'crud:dismiss-notification': {
            on: ['click'],
            gkeys: ['crud:dismiss-notification'],
            handler: function (ev, ctx) {
                var id = ev.target.getAttribute('data-id') || ev.target.closest('[data-id]')?.getAttribute('data-id');
                if (id) dismissNotification(ctx, id);
            }
        },

        // Select record for editing
        'crud:select-record': {
            on: ['click', 'dblclick'],
            gkeys: ['crud:select-record'],
            handler: function (ev, ctx) {
                var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
                if (target && target.closest && target.closest('[data-m-gkey~="crud:open-context"]')) return;
                if (target && target.closest && target.closest('[data-context-menu="true"]')) return;
                var holder = target && target.closest ? target.closest('[data-record-id]') : null;
                var recordId = (holder && holder.getAttribute('data-record-id')) || (target && target.getAttribute ? target.getAttribute('data-record-id') : null);
                var table = ctx.getState().data.activeTable;
                if (!recordId || !table) return;
                recordId = String(recordId);

                console.debug('[CRUD] select-record', {
                    table: table,
                    id: recordId,
                    event: ev.type,
                    target: target && target.tagName
                });

                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { openContextRow: null }) });
                });

                loadRecordDetail(ctx, table, recordId);
            }
        },

        // Change active table group (columns grouping)
        'crud:set-group-tab': {
            on: ['click'],
            gkeys: ['crud:set-group-tab'],
            handler: function (ev, ctx) {
                var group = ev.target.getAttribute('data-group');
                var table = ctx.getState().data.activeTable;
                if (!group || !table) return;
                ctx.setState(function (prev) {
                    var columnsMeta = normalizeColumnsMeta(prev.data.columnsMeta || []);
                    var groups = getTableGroups(table, prev.data.schemaInfo, prev.env.lang);
                    var selectedGroups = Object.assign({}, getSelectedGroups(prev, table, groups));
                    selectedGroups[group] = !selectedGroups[group];
                    // Ensure at least one group stays visible
                    if (!Object.values(selectedGroups).some(function (v) { return v; })) {
                        selectedGroups[group] = true;
                    }
                    var pref = getTablePref(prev, table);
                    var visibility = computeColumnVisibility(columnsMeta, selectedGroups, pref.overrides || {});
                    var activeGroups = Object.assign({}, prev.data.activeGroupByTable || {});
                    activeGroups[table] = Object.keys(selectedGroups).find(function (k) { return selectedGroups[k]; }) || group;
                    var visibilityMap = Object.assign({}, prev.data.columnVisibility || {});
                    visibilityMap[table] = visibility;
                    var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, table, {
                        group: activeGroups[table],
                        groupVisibility: selectedGroups,
                        overrides: pref.overrides || {},
                        sort: pref.sort || null
                    });
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeGroupByTable: activeGroups,
                            columnVisibility: visibilityMap,
                            columnPreferences: nextPrefs
                        })
                    });
                });
            }
        },

        // Toggle column filter dropdown
        'crud:toggle-column-filter': {
            on: ['click'],
            gkeys: ['crud:toggle-column-filter'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { columnFilterOpen: !prev.data.columnFilterOpen }) });
                });
            }
        },

        // Toggle column visibility
        'crud:toggle-column-visibility': {
            on: ['change'],
            gkeys: ['crud:toggle-column-visibility'],
            handler: function (ev, ctx) {
                var column = ev.target.getAttribute('data-column');
                var checked = ev.target.checked;
                var table = ctx.getState().data.activeTable;
                if (!column || !table) return;
                if (column === 'id' || column === '__display' || column === 'display_name') {
                    return;
                }
                ctx.setState(function (prev) {
                    var pref = getTablePref(prev, table);
                    var overrides = Object.assign({}, pref.overrides || {});
                    overrides[column] = checked;
                    var columnsMeta = normalizeColumnsMeta(prev.data.columnsMeta || []);
                    var groups = getTableGroups(table, prev.data.schemaInfo, prev.env.lang);
                    var selectedGroups = getSelectedGroups(prev, table, groups);
                    var visibility = computeColumnVisibility(columnsMeta, selectedGroups, overrides);
                    var visibilityMap = Object.assign({}, prev.data.columnVisibility || {});
                    visibilityMap[table] = visibility;
                    var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, table, Object.assign({}, pref, { overrides: overrides, groupVisibility: selectedGroups }));
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            columnPreferences: nextPrefs,
                            columnVisibility: visibilityMap
                        })
                    });
                });
            }
        },

        // Column filter: select/unselect all filtered
        'crud:columns-toggle-all': {
            on: ['change'],
            gkeys: ['crud:columns-toggle-all'],
            handler: function (ev, ctx) {
                var checked = ev.target.checked;
                var table = ctx.getState().data.activeTable;
                if (!table) return;
                ctx.setState(function (prev) {
                    var candidates = filterColumnsByQuery(deriveFilterableColumns(prev), prev.data.columnFilterQuery, prev.env.lang);
                    var applied = applyBulkColumnToggle(prev, table, candidates, checked);
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            columnPreferences: applied.nextPrefs,
                            columnVisibility: applied.visibilityMap
                        })
                    });
                });
            }
        },

        // Column filter: explicit select all
        'crud:columns-select-all': {
            on: ['click'],
            gkeys: ['crud:columns-select-all'],
            handler: function (_ev, ctx) {
                var table = ctx.getState().data.activeTable;
                if (!table) return;
                ctx.setState(function (prev) {
                    var candidates = filterColumnsByQuery(deriveFilterableColumns(prev), prev.data.columnFilterQuery, prev.env.lang);
                    var applied = applyBulkColumnToggle(prev, table, candidates, true);
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            columnPreferences: applied.nextPrefs,
                            columnVisibility: applied.visibilityMap
                        })
                    });
                });
            }
        },

        // Column filter: explicit unselect all
        'crud:columns-unselect-all': {
            on: ['click'],
            gkeys: ['crud:columns-unselect-all'],
            handler: function (_ev, ctx) {
                var table = ctx.getState().data.activeTable;
                if (!table) return;
                ctx.setState(function (prev) {
                    var candidates = filterColumnsByQuery(deriveFilterableColumns(prev), prev.data.columnFilterQuery, prev.env.lang);
                    var applied = applyBulkColumnToggle(prev, table, candidates, false);
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            columnPreferences: applied.nextPrefs,
                            columnVisibility: applied.visibilityMap
                        })
                    });
                });
            }
        },

        // Column filter search
        'crud:update-column-filter-query': {
            on: ['input'],
            gkeys: ['crud:update-column-filter-query'],
            handler: function (ev, ctx) {
                var value = ev.target.value || '';
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { columnFilterQuery: value }) });
                });
            }
        },

        // Reset column overrides to default of active group
        'crud:reset-columns': {
            on: ['click'],
            gkeys: ['crud:reset-columns'],
            handler: function (_ev, ctx) {
                var state = ctx.getState();
                var table = state.data.activeTable;
                if (!table) return;
                ctx.setState(function (prev) {
                    var group = prev.data.activeGroupByTable ? prev.data.activeGroupByTable[table] : getPrimaryGroupForTable(table, prev.data.schemaInfo);
                    var columnsMeta = normalizeColumnsMeta(prev.data.columnsMeta || []);
                    var visibility = buildDefaultColumnVisibility(columnsMeta, group);
                    var visibilityMap = Object.assign({}, prev.data.columnVisibility || {});
                    visibilityMap[table] = visibility;
                    var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, table, { group: group, overrides: {} });
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            columnVisibility: visibilityMap,
                            columnPreferences: nextPrefs
                        })
                    });
                });
            }
        },

        // Sort by column
        'crud:sort-column': {
            on: ['click'],
            gkeys: ['crud:sort-column'],
            handler: function (ev, ctx) {
                var key = ev.target.getAttribute('data-column');
                var table = ctx.getState().data.activeTable;
                if (!key || !table) return;
                ctx.setState(function (prev) {
                    var current = (prev.data.tableSort || {})[table] || {};
                    var nextSort;
                    if (current.key === key) {
                        if (current.dir === 'asc') nextSort = { key: key, dir: 'desc' };
                        else if (current.dir === 'desc') nextSort = null;
                        else nextSort = { key: key, dir: 'asc' };
                    } else {
                        nextSort = { key: key, dir: 'asc' };
                    }
                    var sortMap = Object.assign({}, prev.data.tableSort || {});
                    sortMap[table] = nextSort;
                    var pref = getTablePref(prev, table);
                    var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, table, Object.assign({}, pref, { sort: nextSort }));
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            tableSort: sortMap,
                            columnPreferences: nextPrefs
                        })
                    });
                });
            }
        },

        // Sync horizontal scroll between top tracker and table body
        'crud:sync-scroll': {
            on: ['scroll'],
            gkeys: ['crud:sync-scroll'],
            handler: function (ev, _ctx) {
                var node = ev && ev.target ? ev.target : null;
                if (!node || !global.document) return;
                var targetId = node.getAttribute('data-target') || node.getAttribute('data-peer');
                if (!targetId) return;
                var peer = global.document.getElementById(targetId);
                if (!peer || peer === node) return;
                if (node.__syncing) return;
                node.__syncing = true;
                peer.__syncing = true;
                peer.scrollLeft = node.scrollLeft;
                setTimeout(function () {
                    node.__syncing = false;
                    peer.__syncing = false;
                }, 0);
            }
        },

        // Context menu toggler (right-click support)
        'crud:row-context': {
            on: ['contextmenu'],
            gkeys: ['crud:row-context'],
            handler: function (ev, ctx) {
                ev.preventDefault(); // Prevent default browser context menu
                var tr = ev.target.closest('tr');
                if (!tr) return;
                var recordId = tr.getAttribute('data-record-id');
                if (!recordId) return;
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            openContextRow: recordId,
                            contextMenuX: ev.clientX,
                            contextMenuY: ev.clientY
                        })
                    });
                });
            }
        },

        // Context menu toggler
        'crud:open-context': {
            on: ['click'],
            gkeys: ['crud:open-context'],
            handler: function (ev, ctx) {
                var recordId = extractRecordId(ev);
                if (!recordId) return;
                ctx.setState(function (prev) {
                    var nextId = prev.data.openContextRow === recordId ? null : recordId;
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { openContextRow: nextId }) });
                });
            }
        },

        // Open info modal
        'crud:open-info-modal': {
            on: ['click'],
            gkeys: ['crud:open-info-modal'],
            handler: async function (ev, ctx) {
                var recordId = extractRecordId(ev);
                var trigger = ev.target.closest('[data-record-id]') || ev.target;
                var contextTable = trigger && trigger.getAttribute('data-table');
                var table = contextTable || ctx.getState().data.activeTable;
                if (!recordId || !table) return;
                await loadRecordDetail(ctx, table, recordId);
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { showInfoModal: true, openContextRow: null }) });
                });
            }
        },

        // Print record (opens info then triggers print)
        'crud:print-record': {
            on: ['click'],
            gkeys: ['crud:print-record'],
            handler: async function (ev, ctx) {
                var recordId = extractRecordId(ev);
                var trigger = ev.target.closest('[data-record-id]') || ev.target;
                var contextTable = trigger && trigger.getAttribute('data-table');
                var table = contextTable || ctx.getState().data.activeTable;
                if (!recordId || !table) return;

                // Ensure record is fully loaded (with translations and FKs)
                await loadRecordDetail(ctx, table, recordId);

                // Trigger isolated print
                printRecordIsolated(ctx, table, recordId);
            }
        },

        // Open child table modal (context navigation)
        'crud:open-child-table': {
            on: ['click'],
            gkeys: ['crud:open-child-table'],
            handler: function (ev, ctx) {
                var childTable = ev.target.getAttribute('data-child-table');
                var parentField = ev.target.getAttribute('data-parent-field');
                var parentId = ev.target.getAttribute('data-parent-id');
                var parentTable = ev.target.getAttribute('data-parent-table');
                var stackIndexAttr = ev.target.getAttribute('data-child-stack-index');
                var stackIndex = stackIndexAttr ? parseInt(stackIndexAttr, 10) : null;
                if (!childTable || !parentField || parentId === null || parentId === undefined) return;
                var state = ctx.getState();
                var parentRecord = null;
                var resolvedParentTable = parentTable || state.data.activeTable;
                if (stackIndex !== null && !Number.isNaN(stackIndex)) {
                    var stack = state.data.childCrudStack || [];
                    var entry = stack[stackIndex];
                    resolvedParentTable = entry && entry.table ? entry.table : resolvedParentTable;
                    var stackRecords = entry && entry.records ? entry.records : [];
                    parentRecord = stackRecords.find(function (row) { return matchRowId(row, parentId); }) || parentRecord;
                }
                if (!parentRecord) {
                    var records = state.data.records || [];
                    parentRecord = records.find(function (row) { return matchRowId(row, parentId); }) || state.data.selectedRecord;
                }
                var parentLabel = displayNameForRecord(parentRecord, resolvedParentTable, state.data.schemaInfo, state.env.lang) || parentId;
                var insertIndex = (state.data.childCrudStack || []).length;
                ctx.setState(function (prev) {
                    var stack = (prev.data.childCrudStack || []).slice();
                    stack.push({
                        table: childTable,
                        parentField: parentField,
                        parentId: parentId,
                        parentLabel: parentLabel,
                        parentTable: resolvedParentTable,
                        loading: false,
                        records: [],
                        columnsMeta: [],
                        search: '',
                        error: null,
                        total: 0
                    });
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { childCrudStack: stack, openContextRow: null }) });
                });
                loadChildTableData(ctx, insertIndex);
            }
        },

        'crud:close-child-modal': {
            on: ['click'],
            gkeys: ['crud:close-child-modal'],
            handler: function (ev, ctx) {
                var idxRaw = ev.target.getAttribute('data-child-index');
                var state = ctx.getState();
                var stack = state.data.childCrudStack || [];
                if (!stack.length) return;
                var idx = idxRaw ? parseInt(idxRaw, 10) : stack.length - 1;
                if (Number.isNaN(idx) || idx < 0) idx = stack.length - 1;
                ctx.setState(function (prev) {
                    var nextStack = (prev.data.childCrudStack || []).slice(0, idx);
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { childCrudStack: nextStack }) });
                });
            }
        },

        'crud:update-child-search': {
            on: ['input'],
            gkeys: ['crud:update-child-search'],
            handler: function (ev, ctx) {
                var idx = parseInt(ev.target.getAttribute('data-child-index'), 10);
                if (Number.isNaN(idx)) return;
                setChildStackAt(ctx, idx, { search: ev.target.value || '' });
            }
        },

        'crud:reload-child-modal': {
            on: ['click'],
            gkeys: ['crud:reload-child-modal'],
            handler: function (ev, ctx) {
                var idx = parseInt(ev.target.getAttribute('data-child-index'), 10);
                if (Number.isNaN(idx)) return;
                loadChildTableData(ctx, idx);
            }
        },

        // Open edit modal from context menu
        'crud:open-edit-modal': {
            on: ['click'],
            gkeys: ['crud:open-edit-modal'],
            handler: async function (ev, ctx) {
                var recordId = extractRecordId(ev);
                var trigger = ev.target.closest('[data-record-id]') || ev.target;
                var contextTable = trigger && trigger.getAttribute('data-table');
                var table = contextTable || ctx.getState().data.activeTable;
                if (!recordId || !table) return;
                await loadRecordDetail(ctx, table, recordId);
                ctx.setState(function (prev) {
                    var groups = getTableGroups(table, prev.data.schemaInfo, prev.env.lang);
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            formMode: 'edit',
                            showFormModal: true,
                            openContextRow: null,
                            activeFormTab: prev.data.activeFormTab || (groups[0] && groups[0].id) || 'basic'
                        })
                    });
                });
            }
        },

        // Close any modal
        'crud:close-modal': {
            on: ['click'],
            gkeys: ['crud:close-modal'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { showFormModal: false, showInfoModal: false, openContextRow: null }) });
                });
            }
        },

        // Delete record
        'crud:delete-record': {
            on: ['click'],
            gkeys: ['crud:delete-record'],
            handler: async function (ev, ctx) {
                var recordId = extractRecordId(ev);
                var trigger = ev.target.closest('[data-record-id]') || ev.target;
                var contextTable = trigger && trigger.getAttribute('data-table');
                var table = contextTable || ctx.getState().data.activeTable;
                if (!recordId || !table) return;
                var confirmDelete = global.confirm ? global.confirm(ctx.getState().env.lang === 'ar' ? 'هل تريد حذف السجل؟' : 'Delete this record?') : true;
                if (!confirmDelete) return;
                try {
                    var repo = M.REST.repo(table);
                    await repo.delete(recordId, { lang: ctx.getState().env.lang });
                    ctx.setState(function (prev) {
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { openContextRow: null, showInfoModal: false }) });
                    });
                    // Only reload the main table if we deleted something from it
                    if (table === ctx.getState().data.activeTable) {
                        await loadTableData(ctx, table);
                    }
                } catch (error) {
                    console.error('[Universal CRUD] Delete failed', error);
                    pushNotification(ctx, 'error', 'تعذّر حذف السجل: ' + error.message);
                }
            }
        },

        // Switch form tab (groups or translations)
        'crud:switch-form-tab': {
            on: ['click'],
            gkeys: ['crud:switch-form-tab'],
            handler: function (ev, ctx) {
                var tab = ev.target.getAttribute('data-tab');
                if (!tab) return;
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeFormTab: tab }) });
                });
            }
        },

        // Update base field
        'crud:update-field': {
            on: ['input', 'change'],
            gkeys: ['crud:update-field'],
            handler: function (ev, ctx) {
                var field = ev.target.getAttribute('name');
                var value = ev.target.value;
                ctx.setState(function (prev) {
                    var nextRecord = Object.assign({}, prev.data.editRecord || {});
                    nextRecord[field] = value;
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { editRecord: nextRecord }) });
                });
            }
        },

        // Update translation field
        'crud:update-translation': {
            on: ['input'],
            gkeys: ['crud:update-translation'],
            handler: function (ev, ctx) {
                var lang = ev.target.getAttribute('data-lang');
                var field = ev.target.getAttribute('name');
                var value = ev.target.value;
                if (!lang || !field) return;
                ctx.setState(function (prev) {
                    var translations = Object.assign({}, prev.data.translations || {});
                    var langEntry = Object.assign({}, translations[lang] || {});
                    langEntry[field] = value;
                    translations[lang] = langEntry;
                    var removals = (prev.data.translationRemovals || []).filter(function (code) { return code !== lang; });
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            translations: translations,
                            translationRemovals: removals
                        })
                    });
                });
            }
        },

        // Select language code for addition
        'crud:update-new-lang-code': {
            on: ['input', 'change'],
            gkeys: ['crud:update-new-lang-code'],
            handler: function (ev, ctx) {
                var value = (ev.target.value || '').trim();
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { newLangCode: value }) });
                });
            }
        },

        // Add translation language dynamically
        'crud:add-translation-lang': {
            on: ['click'],
            gkeys: ['crud:add-translation-lang'],
            handler: function (_ev, ctx) {
                var state = ctx.getState();
                var code = (state.data.newLangCode || '').trim().toLowerCase();
                if (!code) {
                    pushNotification(ctx, 'warning', 'اختر رمز لغة لإضافته (مثال: en أو fr)');
                    return;
                }

                ctx.setState(function (prev) {
                    var translations = Object.assign({}, prev.data.translations || {});
                    var normalized = code;
                    if (translations[normalized]) {
                        // Alert for duplicate
                        if (global.alert) global.alert(state.env.lang === 'ar' ? 'لا يمكن تكرار إضافة لغة مرتين: ' + normalized : 'Cannot add duplicate language: ' + normalized);
                        pushNotification(ctx, 'warning', state.env.lang === 'ar' ? 'هذه اللغة مضافة بالفعل' : 'Language already added');
                        return prev;
                    }

                    var fields = ensureTranslationFields(prev.data.translationFields, translations);
                    translations[normalized] = translations[normalized] || buildEmptyTranslations([{ code: normalized }], fields)[normalized];
                    var removals = (prev.data.translationRemovals || []).filter(function (lang) { return lang !== normalized; });

                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            translations: translations,
                            translationFields: fields,
                            newLangCode: '',
                            translationRemovals: removals
                        })
                    });
                });
            }
        },

        // Remove translation entry
        'crud:remove-translation-lang': {
            on: ['click'],
            gkeys: ['crud:remove-translation-lang'],
            handler: function (ev, ctx) {
                var lang = ev.target.getAttribute('data-lang');
                if (!lang) return;
                var confirmed = global.confirm ? global.confirm(ctx.getState().env.lang === 'ar' ? 'حذف ترجمة اللغة المحددة؟' : 'Remove this translation?') : true;
                if (!confirmed) return;
                ctx.setState(function (prev) {
                    var translations = Object.assign({}, prev.data.translations || {});
                    delete translations[lang];
                    var removals = prev.data.translationRemovals || [];
                    if (!removals.includes(lang)) removals = removals.concat([lang]);
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { translations: translations, translationRemovals: removals }) });
                });
                pushNotification(ctx, 'info', ctx.getState().env.lang === 'ar' ? 'تم حذف الترجمة' : 'Translation removed');
            }
        },

        // Save record (create/update)
        'crud:save-record': {
            on: ['click'],
            gkeys: ['crud:save-record'],
            handler: async function (_ev, ctx) {
                var state = ctx.getState();
                var table = state.data.activeTable;
                if (!table) return;

                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { saving: true }) });
                });

                try {
                    var repo = M.REST.repo(table);
                    var payload = buildSavePayload(state.data);
                    var recordId = payload.record && (payload.record.id || payload.record.Id || payload.record.uuid);
                    var response;
                    if (recordId) {
                        response = await repo.update(recordId, payload, { lang: state.env.lang });
                    } else {
                        response = await repo.create(payload, { lang: state.env.lang });
                    }
                    var record = response.record || response;
                    await loadTableData(ctx, table);
                    await loadRecordDetail(ctx, table, record.id || recordId);
                    ctx.setState(function (prev) {
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { showFormModal: false, formMode: 'edit' }) });
                    });
                } catch (error) {
                    console.error('[Universal CRUD] Save failed', error);
                    pushNotification(ctx, 'error', 'لم يتم حفظ السجل: ' + error.message);
                } finally {
                    ctx.setState(function (prev) {
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { saving: false }) });
                    });
                }
            }
        },

        // New record draft
        'crud:create': {
            on: ['click'],
            gkeys: ['crud:create'],
            handler: async function (_ev, ctx) {
                var state = ctx.getState();
                var columnsMeta = normalizeColumnsMeta(state.data.columnsMeta || []);
                var fields = ensureTranslationFields(state.data.translationFields, {});
                var translations = buildEmptyTranslations(state.data.languages, fields);
                var draft = applyDefaultsFromColumnsMeta({}, columnsMeta);
                var sysDefaults = buildSystemDefaults(state.data, columnsMeta);
                Object.keys(sysDefaults).forEach(function (key) {
                    if (draft[key] === undefined || draft[key] === null || draft[key] === '') {
                        draft[key] = sysDefaults[key];
                    }
                });
                ctx.setState(function (prev) {
                    var groups = getTableGroups(prev.data.activeTable, prev.data.schemaInfo, prev.env.lang);
                    var defaultTab = (groups[0] && groups[0].id) || 'basic';
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            selectedRecord: null,
                            editRecord: draft,
                            translations: translations,
                            translationFields: fields,
                            translationBaseline: {},
                            translationRemovals: [],
                            newLangCode: '',
                            showFormModal: true,
                            showInfoModal: false,
                            openContextRow: null,
                            formMode: 'create',
                            activeFormTab: defaultTab
                        })
                    });
                });
                await refreshSequenceHints(ctx, state.data.activeTable);
            }
        },

        // Open FK advanced search
        'crud:open-fk-search': {
            on: ['click'],
            gkeys: ['crud:open-fk-search'],
            handler: async function (ev, ctx) {
                var field = ev.target.getAttribute('data-field');
                var target = ev.target.getAttribute('data-target');
                if (!field) return;
                var state = ctx.getState();
                var fkDefs = collectFkDefs(state.data.schemaInfo, state.data.activeTable, state.data.records);
                var def = fkDefs.find(function (fk) { return fk.name === field; });
                var resolvedTarget = target || (def && def.target) || null;
                if (!resolvedTarget) {
                    pushNotification(ctx, 'warning', state.env.lang === 'ar' ? 'لا يوجد جدول مرتبط لهذا الحقل' : 'No linked table for this field');
                    return;
                }
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            fkQuickModal: Object.assign(baseFkQuickModalState(), {
                                open: true,
                                field: field,
                                target: resolvedTarget,
                                mode: 'search',
                                loading: true
                            })
                        })
                    });
                });
                try {
                    var repo = M.REST.repo(resolvedTarget);
                    var res = await repo.search({ lang: state.env.lang, q: '', limit: 50, withMeta: 1 });
                    var rows = mergeDisplayRows(res.data || res || [], state.env.lang);
                    var columnsMeta = normalizeColumnsMeta(res.columnsMeta || []);
                    var opts = rows
                        .map(function (row) {
                            var id = row && (row.id || row.Id || row.uuid || row.uid);
                            if (!id) return null;
                            return { value: String(id), label: displayNameForRecord(row, resolvedTarget, state.data.schemaInfo, state.env.lang) || id };
                        })
                        .filter(Boolean);
                    ctx.setState(function (prev) {
                        var quick = Object.assign({}, prev.data.fkQuickModal || {});
                        quick.loading = false;
                        quick.options = opts;
                        quick.columnsMeta = columnsMeta;
                        quick.records = rows;
                        quick.field = field;
                        quick.target = resolvedTarget;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: quick }) });
                    });
                } catch (err) {
                    console.error('[FK Quick Search] failed', err);
                    pushNotification(ctx, 'error', err.message || 'تعذر تحميل نتائج البحث');
                    ctx.setState(function (prev) { return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: baseFkQuickModalState() }) }); });
                }
            }
        },

        // Open FK quick add
        'crud:open-fk-quick-add': {
            on: ['click'],
            gkeys: ['crud:open-fk-quick-add'],
            handler: async function (ev, ctx) {
                var field = ev.target.getAttribute('data-field');
                var target = ev.target.getAttribute('data-target');
                if (!field) return;
                var state = ctx.getState();
                var fkDefs = collectFkDefs(state.data.schemaInfo, state.data.activeTable, state.data.records);
                var def = fkDefs.find(function (fk) { return fk.name === field; });
                var resolvedTarget = target || (def && def.target) || null;
                if (!resolvedTarget) {
                    pushNotification(ctx, 'warning', state.env.lang === 'ar' ? 'لا يوجد جدول مرتبط لهذا الحقل' : 'No linked table for this field');
                    return;
                }
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            fkQuickModal: Object.assign(baseFkQuickModalState(), {
                                open: true,
                                field: field,
                                target: resolvedTarget,
                                mode: 'add',
                                loading: true
                            })
                        })
                    });
                });
                try {
                    var repo = M.REST.repo(resolvedTarget);
                    var res = await repo.search({ lang: state.env.lang, q: '', limit: 1, withMeta: 1 });
                    var columnsMeta = normalizeColumnsMeta(res.columnsMeta || []);
                    var translationFields = columnsMeta.filter(function (col) { return col && col.source === 'lang'; }).map(function (col) { return col.name; });
                    var languages = mergeLanguages(state.data.languages, res.languages || []);
                    var translations = buildEmptyTranslations(languages, translationFields);
                    var defaults = applyDefaultsFromColumnsMeta({}, columnsMeta);
                    var sysDefaults = buildSystemDefaults(state.data, columnsMeta);
                    var record = Object.assign({}, defaults, sysDefaults);
                    var fkOptions = await loadFkReferenceOptions(ctx, resolvedTarget, state.data.schemaInfo, state.env.lang);
                    ctx.setState(function (prev) {
                        var quick = Object.assign({}, prev.data.fkQuickModal || {});
                        quick.loading = false;
                        quick.field = field;
                        quick.target = resolvedTarget;
                        quick.mode = 'add';
                        quick.columnsMeta = columnsMeta;
                        quick.translationFields = translationFields;
                        quick.translations = translations;
                        quick.languages = languages;
                        quick.record = record;
                        quick.fkOptions = fkOptions;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: quick }) });
                    });
                } catch (err) {
                    console.error('[FK Quick Add] bootstrap failed', err);
                    pushNotification(ctx, 'error', err.message || 'تعذر تجهيز نافذة الإضافة السريعة');
                    ctx.setState(function (prev) { return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: baseFkQuickModalState() }) }); });
                }
            }
        },

        'crud:close-fk-quick-modal': {
            on: ['click'],
            gkeys: ['crud:close-fk-quick-modal'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: baseFkQuickModalState() }) });
                });
            }
        },

        'crud:update-fk-quick-search': {
            on: ['input'],
            gkeys: ['crud:update-fk-quick-search'],
            handler: async function (ev, ctx) {
                var val = ev.target.value || '';
                var state = ctx.getState();
                var quick = state.data.fkQuickModal || {};
                if (!quick.target) return;
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: Object.assign({}, quick, { search: val, loading: true }) }) });
                });
                try {
                    var repo = M.REST.repo(quick.target);
                    var res = await repo.search({ lang: state.env.lang, q: val, limit: 50, withMeta: 1 });
                    var rows = mergeDisplayRows(res.data || res || [], state.env.lang);
                    var columnsMeta = normalizeColumnsMeta(res.columnsMeta || []);
                    var opts = rows.map(function (row) {
                        var id = row && (row.id || row.Id || row.uuid || row.uid);
                        if (!id) return null;
                        return { value: String(id), label: displayNameForRecord(row, quick.target, state.data.schemaInfo, state.env.lang) || id };
                    }).filter(Boolean);
                    ctx.setState(function (prev) {
                        var next = Object.assign({}, prev.data.fkQuickModal || {});
                        next.search = val;
                        next.loading = false;
                        next.options = opts;
                        next.columnsMeta = columnsMeta;
                        next.records = rows;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: next }) });
                    });
                } catch (err) {
                    console.error('[FK Quick Search] search failed', err);
                    pushNotification(ctx, 'error', err.message || 'تعذر جلب نتائج البحث');
                    ctx.setState(function (prev) {
                        var next = Object.assign({}, prev.data.fkQuickModal || {});
                        next.loading = false;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: next }) });
                    });
                }
            }
        },

        'crud:update-fk-quick-field': {
            on: ['input', 'change'],
            gkeys: ['crud:update-fk-quick-field'],
            handler: function (ev, ctx) {
                var field = ev.target.getAttribute('data-field') || ev.target.getAttribute('name');
                var val = ev.target.value;
                if (!field) return;
                ctx.setState(function (prev) {
                    var quick = prev.data.fkQuickModal || {};
                    var rec = Object.assign({}, quick.record || {});
                    rec[field] = val;
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: Object.assign({}, quick, { record: rec }) }) });
                });
            }
        },

        'crud:update-fk-quick-translation': {
            on: ['input'],
            gkeys: ['crud:update-fk-quick-translation'],
            handler: function (ev, ctx) {
                var field = ev.target.getAttribute('name');
                var lang = ev.target.getAttribute('data-lang');
                var val = ev.target.value;
                if (!field || !lang) return;
                ctx.setState(function (prev) {
                    var quick = prev.data.fkQuickModal || {};
                    var translations = Object.assign({}, quick.translations || {});
                    var langEntry = Object.assign({}, translations[lang] || {});
                    langEntry[field] = val;
                    translations[lang] = langEntry;
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { fkQuickModal: Object.assign({}, quick, { translations: translations }) }) });
                });
            }
        },

        'crud:select-fk-quick-option': {
            on: ['click'],
            gkeys: ['crud:select-fk-quick-option'],
            handler: function (ev, ctx) {
                var value = ev.target.getAttribute('data-value');
                var label = ev.target.getAttribute('data-label');
                var field = ev.target.getAttribute('data-field');
                if (!field || value === null) return;
                ctx.setState(function (prev) {
                    var editRecord = Object.assign({}, prev.data.editRecord || {});
                    editRecord[field] = value;
                    var fkCache = Object.assign({}, prev.data.fkReferenceCache || {});
                    var tableCache = Object.assign({}, fkCache[prev.data.activeTable] || {});
                    var list = (tableCache[field] || []).slice();
                    if (!list.some(function (opt) { return opt.value === String(value); })) {
                        list.push({ value: String(value), label: label || value });
                    }
                    tableCache[field] = list;
                    fkCache[prev.data.activeTable] = tableCache;
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            editRecord: editRecord,
                            fkReferenceCache: fkCache,
                            fkQuickModal: baseFkQuickModalState()
                        })
                    });
                });
            }
        },

        'crud:save-fk-quick-add': {
            on: ['click'],
            gkeys: ['crud:save-fk-quick-add'],
            handler: async function (_ev, ctx) {
                var state = ctx.getState();
                var quick = state.data.fkQuickModal || {};
                if (!quick.target || !quick.field) return;
                try {
                    var repo = M.REST.repo(quick.target);
                    var defaults = buildSystemDefaults(state.data, quick.columnsMeta || []);
                    var mergedRecord = Object.assign({}, defaults, quick.record || {});
                    var recordPayload = computeRecordPatch(null, mergedRecord);
                    if (!recordPayload.display_name) {
                        recordPayload.display_name = quick.record && (quick.record.name || quick.record.title || quick.record.label);
                    }
                    var translationsPayload = computeTranslationPayload(quick.translations || {}, {}, [], quick.translationFields || []);
                    var res = await repo.create({ record: recordPayload, translations: translationsPayload }, { lang: state.env.lang });
                    var created = res.record || res;
                    var newId = (created && (created.id || created.Id || created.uuid || created.uid)) || res.id || res;
                    var optionLabel = displayNameForRecord(created, quick.target, state.data.schemaInfo, state.env.lang) || recordPayload.display_name || newId;
                    ctx.setState(function (prev) {
                        var editRecord = Object.assign({}, prev.data.editRecord || {});
                        editRecord[quick.field] = newId;
                        var fkCache = Object.assign({}, prev.data.fkReferenceCache || {});
                        var tableCache = Object.assign({}, fkCache[prev.data.activeTable] || {});
                        var list = (tableCache[quick.field] || []).slice();
                        if (!list.some(function (opt) { return opt.value === String(newId); })) {
                            list.push({ value: String(newId), label: optionLabel });
                        }
                        tableCache[quick.field] = list;
                        fkCache[prev.data.activeTable] = tableCache;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                editRecord: editRecord,
                                fkReferenceCache: fkCache,
                                fkQuickModal: baseFkQuickModalState()
                            })
                        });
                    });
                } catch (err) {
                    console.error('[FK Quick Add] failed', err);
                    pushNotification(ctx, 'error', err.message || 'Failed to create record');
                }
            }
        },

        // Toggle sidebar collapse
        'crud:toggle-sidebar': {
            on: ['click'],
            gkeys: ['crud:toggle-sidebar'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            sidebarCollapsed: !prev.data.sidebarCollapsed
                        })
                    });
                });
            }
        },

        // Navigate to home
        'crud:navigate-home': {
            on: ['click'],
            gkeys: ['crud:navigate-home'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeScreen: 'home',
                            activeTable: null,
                            selectedRecord: null,
                            editRecord: null,
                            records: [],
                            breadcrumbs: []
                        })
                    });
                });
            }
        }
    };

    function printRecordIsolated(ctx, tableName, recordId) {
        var state = ctx.getState();
        var data = state.data;
        var env = state.env;
        var record = data.selectedRecord;
        if (!record) return;

        // 1. Prepare Schema & Groups
        var rawColumnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
        var columnsMeta = enrichColumnsWithSchema(rawColumnsMeta, data.schemaInfo, tableName);
        var groups = getTableGroups(tableName, data.schemaInfo, env.lang);
        var grouped = {};
        columnsMeta.forEach(function (col) {
            if (!col || !col.name || col.is_table_show === false) return;
            var g = col.group || (groups[0] && groups[0].id) || 'basic';
            if (!grouped[g]) grouped[g] = [];
            grouped[g].push(col);
        });

        // 2. Prepare Title
        var tableDef = (data.schemaInfo && data.schemaInfo.tableMap && data.schemaInfo.tableMap[tableName]) || { name: tableName };
        var activeLabels = resolveTableLabels(tableDef);
        var tableDisplayName = activeLabels[env.lang] || activeLabels.ar || activeLabels.en || tableName;
        var pageTitle = tableDisplayName + ' #' + (record.code || record.id);

        // 3. Render Value Helper
        function getDisplayValue(field) {
            var value = record[field];
            if (value === null || value === undefined || value === '') return '—';

            // If value is already an object, extract display name (same as table logic)
            if (typeof value === 'object') {
                return displayNameForRecord(value, tableName, data.schemaInfo, env.lang)
                    || value.display_name || value.name || value.label || value.title || value.code
                    || value.id || value.uuid || '—';
            }

            // Try to find embedded FK object (e.g., record.area for area_id)
            if (field.endsWith('_id')) {
                var fkObjKey = field.replace(/_id$/, '');
                var fkObj = record[fkObjKey];
                if (fkObj && typeof fkObj === 'object') {
                    return displayNameForRecord(fkObj, tableName, data.schemaInfo, env.lang)
                        || fkObj.display_name || fkObj.name || fkObj.label || fkObj.title || fkObj.code
                        || value;
                }
            }

            return String(value);
        }

        // 4. Build HTML
        var sectionsHtml = groups.map(function (group) {
            var fields = grouped[group.id] || [];
            if (!fields.length) return '';
            var gridHtml = fields.map(function (col) {
                var label = resolveColumnLabel(col, env.lang);
                var val = getDisplayValue(col.name);
                return `<div class="field-box"><div class="field-label">${label}</div><div class="field-value">${val}</div></div>`;
            }).join('');
            return `<div class="section"><div class="section-title">${group.label}</div><div class="section-grid">${gridHtml}</div></div>`;
        }).join('');

        var dir = env.lang === 'ar' ? 'rtl' : 'ltr';
        var font = env.lang === 'ar' ? "'Tajawal', sans-serif" : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        var dateStr = new Date().toLocaleString(env.lang === 'ar' ? 'ar-EG' : 'en-US');

        var html = `<!DOCTYPE html><html dir="${dir}" lang="${env.lang}"><head><meta charset="UTF-8"><title>${pageTitle}</title>
            <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
            <style>
                body{font-family:${font};padding:40px;color:#1f2937;background:#fff;margin:0;font-size:14px}
                @media print{body{padding:0}}
                .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:24px;border-bottom:2px solid #e5e7eb;margin-bottom:32px}
                .header h1{margin:0;font-size:24px;font-weight:800;color:#111}
                .meta{text-align:${dir === 'rtl' ? 'left' : 'right'};font-size:12px;color:#6b7280;line-height:1.5}
                .section{margin-bottom:28px;page-break-inside:avoid}
                .section-title{font-size:14px;font-weight:700;color:#374151;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #f3f4f6;padding-bottom:6px}
                .section-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
                @media (max-width:600px){.section-grid{grid-template-columns:1fr}}
                .field-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px}
                .field-label{font-size:11px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;font-weight:500}
                .field-value{font-size:14px;font-weight:600;color:#111;word-break:break-word}
                .footer{margin-top:50px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af}
            </style>
            </head><body>
            <div class="header"><div><h1>${tableDisplayName}</h1><div style="font-size:13px;color:#6b7280;margin-top:4px">#${record.code || record.id}</div></div>
            <div class="meta">${env.lang === 'ar' ? 'تاريخ الطباعة' : 'Printed On'}<br><strong>${dateStr}</strong></div></div>
            ${sectionsHtml}
            <div class="footer">${env.lang === 'ar' ? 'تم استخراج هذا المستند من النظام الآلي' : 'Generated by System'}</div>
            <script>window.onload=function(){setTimeout(function(){window.print();},500)}<\/script></body></html>`;

        var win = window.open('about:blank', '_blank', 'height=800,width=900,menubar=no,toolbar=no,location=no,status=no,titlebar=no');
        if (win) {
            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();
        } else {
            console.error('Popup blocked');
            alert(env.lang === 'ar' ? 'تم حظر النافذة للطباعة' : 'Popup blocked');
        }
    }

    // ============================================================================
    // API HELPERS
    // ============================================================================

    function isArabicText(text) {
        return /[\u0600-\u06FF]/.test(String(text || ''));
    }

    function humanizeTableName(name) {
        if (!name) return '';
        return String(name)
            .replace(/_/g, ' ')
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function resolveTableLabels(table) {
        var translations = table && table.translations ? table.translations : {};
        var labels = Object.assign({}, translations.label || translations.name || {});

        var rawLabel = table.label || '';
        var arabicLabel = table.label_ar || (isArabicText(rawLabel) ? rawLabel : null);
        var englishLabel = table.label_en || (!isArabicText(rawLabel) && rawLabel ? rawLabel : null);

        if (!arabicLabel) {
            arabicLabel = rawLabel || humanizeTableName(table.name);
        }

        if (!englishLabel) {
            englishLabel = humanizeTableName(table.name) || rawLabel;
        }

        labels.ar = labels.ar || arabicLabel;
        labels.en = labels.en || englishLabel;
        return labels;
    }

    function relabelTables(tables, lang) {
        return (tables || []).map(function (t) {
            var labels = t.labels || resolveTableLabels(t);
            var labelForLang = labels[lang] || labels.ar || labels.en || t.label || t.id;
            return Object.assign({}, t, { labels: labels, label: labelForLang });
        });
    }

    function classifyModule(tableName) {
        var name = String(tableName || '').toLowerCase();
        if (!name.startsWith('fin_') && name !== 'ui_labels') return 'financial_operations';

        var settingsHints = ['currency', 'tax', 'account', 'type', 'entity', 'cost', 'dimension', 'period', 'year', 'analytic'];
        var operationsHints = ['journal', 'cheque', 'bank', 'statement', 'budget', 'invoice', 'payment'];
        var reportHints = ['report', 'layout'];
        var logHints = ['history', 'audit', 'log'];

        if (name === 'ui_labels') return 'system';
        if (settingsHints.some(function (hint) { return name.indexOf(hint) !== -1; })) return 'financial_settings';
        if (reportHints.some(function (hint) { return name.indexOf(hint) !== -1; })) return 'financial_analytic';
        if (logHints.some(function (hint) { return name.indexOf(hint) !== -1; })) return 'financial_operations';
        if (operationsHints.some(function (hint) { return name.indexOf(hint) !== -1; })) return 'financial_operations';
        return 'financial_operations';
    }

    function buildModulesFromSchema(schemaModules, tables, lang) {
        if (!schemaModules || !schemaModules.length) return [];

        // Build module tree structure
        var moduleMap = {};
        var rootModules = [];

        // First pass: create all module objects
        schemaModules.forEach(function (moduleDef) {
            var module = {
                id: moduleDef.id,
                label: (moduleDef.labels && moduleDef.labels[lang]) || moduleDef.labels.en || moduleDef.id,
                labels: moduleDef.labels || {},
                icon: moduleDef.icon || '📁',
                order: moduleDef.order || 99,
                parent_id: moduleDef.parent_id,
                children: [],
                tables: []
            };
            moduleMap[moduleDef.id] = module;
        });

        // Second pass: build tree structure
        Object.keys(moduleMap).forEach(function (id) {
            var module = moduleMap[id];
            if (module.parent_id && moduleMap[module.parent_id]) {
                moduleMap[module.parent_id].children.push(module);
            } else {
                rootModules.push(module);
            }
        });

        // Third pass: assign tables to their modules
        tables.forEach(function (table) {
            if (table.module_id && moduleMap[table.module_id]) {
                moduleMap[table.module_id].tables.push(table);
            }
        });

        // Sort modules and children by order
        function sortModules(modules) {
            modules.sort(function (a, b) { return a.order - b.order; });
            modules.forEach(function (module) {
                if (module.children && module.children.length) {
                    sortModules(module.children);
                }
                if (module.tables && module.tables.length) {
                    module.tables.sort(function (a, b) {
                        return (a.label || '').localeCompare(b.label || '');
                    });
                }
            });
        }

        sortModules(rootModules);
        return rootModules;
    }

    function buildModules(tables, tableTypes) {
        var grouped = {};
        var known = new Set((tableTypes || DEFAULT_TABLE_TYPES).map(function (m) { return m.id; }));
        (tableTypes || DEFAULT_TABLE_TYPES).forEach(function (m) {
            grouped[m.id] = { id: m.id, labels: m.labels || {}, icon: m.icon, tables: [] };
        });
        (tables || []).forEach(function (t) {
            var preferred = t.type && known.has(t.type) ? t.type : null;
            var moduleId = preferred || classifyModule(t.id || t.name);
            if (!known.has(moduleId)) {
                moduleId = 'operations';
            }
            if (!grouped[moduleId]) {
                grouped[moduleId] = { id: moduleId, labels: { ar: moduleId, en: moduleId }, tables: [] };
            }
            grouped[moduleId].tables.push(t);
        });
        return Object.values(grouped).filter(function (m) { return m.tables.length; });
    }

    function computeBreadcrumbs(modules, activeTable, lang) {
        var homeLabel = lang === 'ar' ? 'الرئيسية' : 'Home';
        var crumbs = [{ id: 'home', label: homeLabel, icon: '🏠' }];
        var moduleMatch = (modules || []).find(function (m) {
            return (m.tables || []).some(function (t) { return t.id === activeTable; });
        });
        if (moduleMatch) {
            crumbs.push({
                id: moduleMatch.id,
                label: moduleMatch.labels[lang] || moduleMatch.labels.ar || moduleMatch.labels.en || moduleMatch.id,
                icon: moduleMatch.icon || '📁'
            });
            var tableMatch = (moduleMatch.tables || []).find(function (t) { return t.id === activeTable; });
            if (tableMatch) {
                crumbs.push({
                    id: tableMatch.id,
                    label: tableMatch.labels[lang] || tableMatch.labels.ar || tableMatch.labels.en || tableMatch.label || tableMatch.id,
                    icon: tableMatch.icon || '🗂️'
                });
            }
        }
        return crumbs;
    }

    function findChildRelations(schemaInfo, parentTable) {
        if (!schemaInfo || !schemaInfo.tableMap || !parentTable) return [];
        var relations = [];
        Object.keys(schemaInfo.tableMap || {}).forEach(function (key) {
            var tbl = schemaInfo.tableMap[key];
            if (!tbl || !tbl.fkReferences) return;
            (tbl.fkReferences || []).forEach(function (ref) {
                if (!ref || ref.targetTable !== parentTable) return;
                var name = tbl.name || tbl.id || key;
                if (!name) return;
                relations.push({
                    table: name,
                    column: ref.columnName,
                    labels: resolveTableLabels(tbl),
                    icon: (tbl.settings && tbl.settings.icon) || tbl.icon || '🗂️'
                });
            });
        });
        var seen = new Set();
        return relations.filter(function (rel) {
            var key = rel.table + '|' + rel.column;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function getActiveTableLabel(tables, activeId, lang) {
        var match = (tables || []).find(function (t) { return t.id === activeId; });
        if (!match) return activeId;
        var labels = match.labels || {};
        return labels[lang] || labels.ar || labels.en || match.label || activeId;
    }

    function extractRecordId(ev) {
        if (!ev || !ev.target) return null;
        if (ev.target.getAttribute && ev.target.getAttribute('data-record-id')) {
            return String(ev.target.getAttribute('data-record-id'));
        }
        var holder = ev.target.closest ? ev.target.closest('[data-record-id]') : null;
        return holder && holder.getAttribute ? String(holder.getAttribute('data-record-id')) : null;
    }

    function ensureTranslationFields(fields, translations) {
        if (fields && fields.length) return fields;
        var keys = new Set();
        Object.values(translations || {}).forEach(function (entry) {
            Object.keys(entry || {}).forEach(function (key) { keys.add(key); });
        });
        if (keys.size === 0) {
            ['name', 'title', 'description'].forEach(function (fallback) { keys.add(fallback); });
        }
        return Array.from(keys);
    }

    function normalizeDateInputValue(value) {
        if (!value) return '';
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString().slice(0, 10);
        }
        if (typeof value === 'string') {
            var isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
            if (isoMatch) return isoMatch[1];
            var parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
                return new Date(parsed).toISOString().slice(0, 10);
            }
        }
        return '';
    }

    function resolveTranslationEntry(record, preferredLangs) {
        if (!record) return null;
        var langs = Array.isArray(preferredLangs) ? preferredLangs.filter(Boolean) : [];
        var i18n = record.i18n || {};
        var langTable = i18n.lang && typeof i18n.lang === 'object' ? i18n.lang : null;

        if (langTable) {
            for (var i = 0; i < langs.length; i++) {
                var key = langs[i];
                if (langTable[key]) return langTable[key];
            }
            var keys = Object.keys(langTable);
            if (keys.length) return langTable[keys[0]];
        }

        for (var j = 0; j < langs.length; j++) {
            var legacyKey = langs[j];
            if (i18n[legacyKey]) return i18n[legacyKey];
        }

        var legacyKeys = Object.keys(i18n).filter(function (k) { return k !== 'lang'; });
        if (legacyKeys.length) return i18n[legacyKeys[0]];
        return null;
    }

    function mergeDisplayRows(records, lang) {
        var preferredLangs = [lang, 'ar', 'en'];
        return (records || []).map(function (row) {
            var merged = Object.assign({}, row);
            var translation = resolveTranslationEntry(row, preferredLangs);
            if (translation && typeof translation === 'object') {
                Object.keys(translation).forEach(function (key) {
                    if (merged[key] === null || merged[key] === undefined || merged[key] === '') {
                        merged[key] = translation[key];
                    }
                });
                merged.__translation = translation;
            }
            return merged;
        });
    }

    function isTranslationKeyAllowed(key) {
        if (!key) return false;
        var lower = String(key).toLowerCase();
        if (lower === 'name' || lower === 'title' || lower === 'label' || lower === 'description' || lower === 'display_name' || lower === 'full_name') {
            return true;
        }
        if (lower.endsWith('_id')) return false;
        if (lower.indexOf('date') >= 0) return false;
        if (lower === 'id' || lower === 'lang' || lower === 'is_active' || lower === 'is_default' || lower === 'company_id' || lower === 'branch_id') {
            return false;
        }
        return true;
    }

    function collectTranslationKeys(records, lang) {
        var preferredLangs = [lang, 'ar', 'en'];
        var keys = new Set();
        (records || []).forEach(function (row) {
            var translation = resolveTranslationEntry(row, preferredLangs);
            Object.keys(translation || {}).forEach(function (key) {
                if (isTranslationKeyAllowed(key)) {
                    keys.add(key);
                }
            });
        });
        if (!keys.size) {
            ['name', 'title', 'label'].forEach(function (fallback) { keys.add(fallback); });
        }
        return Array.from(keys);
    }

    function detectInputHeuristics(col) {
        var name = (col && col.name) || '';
        var lower = name.toLowerCase();
        var component = col && col.component;
        var isDate = lower.indexOf('date') !== -1 || component === 'date';
        var isTime = lower.indexOf('time') !== -1 || component === 'time';
        var isTextarea = component === 'textarea' || ['notes', 'address_text', 'chief_complaint'].indexOf(name) !== -1;
        var type = 'text';
        if (isDate) type = 'date';
        else if (isTime) type = 'time';
        else if (lower.indexOf('mobile') !== -1 || lower.indexOf('phone') !== -1) type = 'tel';
        else if (lower.indexOf('count') !== -1 || lower.indexOf('weight') !== -1) type = 'number';
        return { type: type, isTextarea: isTextarea };
    }

    function buildDateInputField(label, name, value, attrs) {
        var fieldAttrs = Object.assign({ type: 'date', name: name }, attrs || {});
        fieldAttrs.value = normalizeDateInputValue(value);
        return UI.Field({
            label: label,
            control: UI.Input({ attrs: fieldAttrs })
        });
    }

    // Column metadata standard keys (backend contract):
    // name, sort, is_table_show, is_edit_show, is_searchable, source, labels, component, default_value, default_expr, events
    // Example:
    // { name: 'patient', sort: 30, is_table_show: true, is_edit_show: true, is_searchable: true, source: 'fk',
    //   labels: { ar: 'المريض', en: 'Patient' }, component: null, default_value: null, default_expr: 'today', events: null }
    function normalizeColumnsMeta(columnsMeta) {
        if (!Array.isArray(columnsMeta)) return [];
        return columnsMeta
            .filter(function (entry) { return entry && entry.name; })
            .slice()
            .sort(function (a, b) {
                var aSort = Number.isFinite(a.sort) ? a.sort : 0;
                var bSort = Number.isFinite(b.sort) ? b.sort : 0;
                return aSort - bSort;
            });
    }

    function enrichColumnsWithSchema(columnsMeta, schemaInfo, tableName) {
        if (!Array.isArray(columnsMeta) || !schemaInfo || !schemaInfo.tableMap) return columnsMeta;
        var tableSchema = schemaInfo.tableMap[tableName];
        if (!tableSchema) return columnsMeta;

        var schemaColumns = {};
        (tableSchema.columns || []).forEach(function (col) { schemaColumns[col.name] = col; });

        if (tableSchema.smart_features && tableSchema.smart_features.columns) {
            tableSchema.smart_features.columns.forEach(function (col) {
                if (schemaColumns[col.name]) {
                    Object.assign(schemaColumns[col.name], col);
                } else {
                    schemaColumns[col.name] = col;
                }
            });
        }

        return columnsMeta.map(function (col) {
            var schemaCol = schemaColumns[col.name];
            if (schemaCol) {
                if (schemaCol.references && schemaCol.references.table) {
                    col.fk_target = schemaCol.references.table;
                }
                if (schemaCol.is_read_only) col.is_read_only = true;
            }
            return col;
        });
    }

    function resolveColumnLabel(columnMeta, lang) {
        if (!columnMeta) return '';
        var labels = columnMeta.labels || {};
        return labels[lang] || labels.ar || labels.en || columnMeta.name || '';
    }

    function resolveFieldLabel(fieldName, columnsMeta, lang) {
        if (!fieldName) return '';
        if (!Array.isArray(columnsMeta)) return fieldName;
        var match = columnsMeta.find(function (col) { return col && col.name === fieldName; });
        return match ? resolveColumnLabel(match, lang) : fieldName;
    }

    function getPrimaryGroupForTable(tableName, schemaInfo) {
        var tableDef = schemaInfo && schemaInfo.tableMap ? schemaInfo.tableMap[tableName] : null;
        var groups = (tableDef && tableDef.settings && tableDef.settings.groups) || {};
        var ordered = Object.keys(groups).map(function (id) {
            var def = groups[id] || {};
            return { id: id, order: def.order || 999 };
        }).sort(function (a, b) { return a.order - b.order; });
        return ordered.length ? ordered[0].id : 'basic';
    }

    function getTableGroups(tableName, schemaInfo, lang) {
        var tableDef = schemaInfo && schemaInfo.tableMap ? schemaInfo.tableMap[tableName] : null;
        var groups = (tableDef && tableDef.settings && tableDef.settings.groups) || {};
        var normalized = Object.keys(groups).map(function (id) {
            var def = groups[id] || {};
            var labels = def.labels || {};
            return {
                id: id,
                order: def.order || 999,
                labels: labels,
                label: labels[lang] || labels.ar || labels.en || id,
                is_show: def.is_show
            };
        });

        if (!normalized.length) {
            normalized.push({
                id: 'basic',
                order: 1,
                labels: { ar: 'البيانات الأساسية', en: 'Basic' },
                label: lang === 'ar' ? 'البيانات الأساسية' : 'Basic'
            });
        }

        normalized.sort(function (a, b) { return a.order - b.order; });
        return normalized;
    }

    function buildDefaultGroupSelection(groups) {
        var selection = {};
        var hasAny = false;
        (groups || []).forEach(function (g, idx) {
            var show = g && g.is_show !== false;
            if (!g || g.is_show === true) show = true;
            if (idx === 0 && g && g.is_show == null) show = true;
            selection[g.id] = !!show;
            if (show) hasAny = true;
        });
        if (!hasAny && groups && groups[0]) selection[groups[0].id] = true;
        return selection;
    }

    function computeColumnVisibility(columnsMeta, selectedGroups, overrides) {
        var selected = selectedGroups || {};
        var visibility = {};
        (columnsMeta || []).forEach(function (col) {
            if (!col || !col.name) return;
            var name = col.name;
            if (name === 'id') { visibility[name] = false; return; }
            var groupId = col.group || null;
            var groupVisible = groupId ? !!selected[groupId] : true;
            var baseShow = col.is_table_show !== false && groupVisible;
            visibility[name] = baseShow;
        });
        Object.keys(overrides || {}).forEach(function (key) {
            if (selected && Object.values(selected).some(Boolean) === false) {
                visibility[key] = false;
            } else if (visibility.hasOwnProperty(key)) {
                visibility[key] = !!overrides[key] && (visibility[key] !== false);
            } else {
                visibility[key] = !!overrides[key];
            }
        });
        return visibility;
    }

    function filterColumnsByQuery(columns, query, lang) {
        var normalized = String(query || '').toLowerCase();
        return (columns || []).filter(function (col) {
            if (!col || !col.name) return false;
            if (col.name === 'id' || col.name === '__display' || col.name === 'display_name' || col.name === '__actions') return false;
            if (!normalized) return true;
            var lbl = resolveColumnLabel(col, lang || 'ar');
            return col.name.toLowerCase().indexOf(normalized) !== -1 || lbl.toLowerCase().indexOf(normalized) !== -1;
        });
    }

    function applyBulkColumnToggle(prev, table, columns, value) {
        var columnsMeta = normalizeColumnsMeta(prev.data.columnsMeta || []);
        var pref = getTablePref(prev, table);
        var overrides = Object.assign({}, pref.overrides || {});
        (columns || []).forEach(function (col) { overrides[col.name] = value; });
        var groups = getTableGroups(table, prev.data.schemaInfo, prev.env.lang);
        var selectedGroups = getSelectedGroups(prev, table, groups);
        var visibility = columnsMeta.length
            ? computeColumnVisibility(columnsMeta, selectedGroups, overrides)
            : Object.assign({}, (prev.data.columnVisibility && prev.data.columnVisibility[table]) || {});

        if (!columnsMeta.length) {
            (columns || []).forEach(function (col) { visibility[col.name] = value; });
        }

        var visibilityMap = Object.assign({}, prev.data.columnVisibility || {});
        visibilityMap[table] = visibility;
        var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, table, Object.assign({}, pref, { overrides: overrides, groupVisibility: selectedGroups }));
        return { visibilityMap: visibilityMap, nextPrefs: nextPrefs };
    }

    function deriveFilterableColumns(state) {
        if (!state || !state.data) return [];
        var data = state.data;
        var columnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
        var records = Array.isArray(data.records) ? data.records : [];
        var availableKeys = new Set();
        records.slice(0, 10).forEach(function (row) {
            Object.keys(row || {}).forEach(function (k) { availableKeys.add(k); });
        });
        availableKeys.add('__display');
        var displayKey = getDisplayColumnKey(columnsMeta, availableKeys);

        if (columnsMeta.length) {
            var list = columnsMeta.slice();
            var hasDisplayKey = list.some(function (col) { return col && col.name === displayKey; });
            if (!hasDisplayKey) {
                list = list.concat([{ name: displayKey, labels: { ar: 'الاسم', en: 'Name' } }]);
            }
            return list;
        }

        var keys = Array.from(new Set([displayKey].concat(Array.from(availableKeys))));
        return keys.filter(function (name) {
            if (!name) return false;
            if (name === 'id' || name === '__actions') return false;
            return !isHiddenColumn(name);
        }).map(function (name) { return { name: name, labels: {} }; });
    }

    function filterColumnsByQuery(columns, query, lang) {
        var normalized = String(query || '').toLowerCase();
        return (columns || []).filter(function (col) {
            if (!col || !col.name) return false;
            if (col.name === 'id' || col.name === '__display' || col.name === 'display_name' || col.name === '__actions') return false;
            if (!normalized) return true;
            var lbl = resolveColumnLabel(col, lang || 'ar');
            return col.name.toLowerCase().indexOf(normalized) !== -1 || lbl.toLowerCase().indexOf(normalized) !== -1;
        });
    }

    function applyBulkColumnToggle(prev, table, columns, value) {
        var columnsMeta = normalizeColumnsMeta(prev.data.columnsMeta || []);
        var pref = getTablePref(prev, table);
        var overrides = Object.assign({}, pref.overrides || {});
        (columns || []).forEach(function (col) { overrides[col.name] = value; });
        var activeGroup = getActiveGroupForState(prev, table);
        var visibility = columnsMeta.length
            ? computeColumnVisibility(columnsMeta, activeGroup, overrides)
            : Object.assign({}, (prev.data.columnVisibility && prev.data.columnVisibility[table]) || {});

        if (!columnsMeta.length) {
            (columns || []).forEach(function (col) { visibility[col.name] = value; });
        }

        var visibilityMap = Object.assign({}, prev.data.columnVisibility || {});
        visibilityMap[table] = visibility;
        var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, table, Object.assign({}, pref, { overrides: overrides }));
        return { visibilityMap: visibilityMap, nextPrefs: nextPrefs };
    }

    function deriveFilterableColumns(state) {
        if (!state || !state.data) return [];
        var data = state.data;
        var columnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
        var records = Array.isArray(data.records) ? data.records : [];
        var availableKeys = new Set();
        records.slice(0, 10).forEach(function (row) {
            Object.keys(row || {}).forEach(function (k) { availableKeys.add(k); });
        });
        availableKeys.add('__display');
        var displayKey = getDisplayColumnKey(columnsMeta, availableKeys);

        if (columnsMeta.length) {
            var list = columnsMeta.slice();
            var hasDisplayKey = list.some(function (col) { return col && col.name === displayKey; });
            if (!hasDisplayKey) {
                list = list.concat([{ name: displayKey, labels: { ar: 'الاسم', en: 'Name' } }]);
            }
            return list;
        }

        var keys = Array.from(new Set([displayKey].concat(Array.from(availableKeys))));
        return keys.filter(function (name) {
            if (!name) return false;
            if (name === 'id' || name === '__actions') return false;
            return !isHiddenColumn(name);
        }).map(function (name) { return { name: name, labels: {} }; });
    }

    function getTablePref(state, tableName) {
        var prefs = state && state.data ? state.data.columnPreferences : null;
        return prefs && prefs[tableName] ? prefs[tableName] : {};
    }

    function getActiveGroupForState(state, tableName) {
        if (!state || !tableName) return null;
        var pref = getTablePref(state, tableName);
        var selected = pref.groupVisibility || null;
        if (selected) {
            var first = Object.keys(selected).find(function (key) { return selected[key]; });
            if (first) return first;
        }
        return getPrimaryGroupForTable(tableName, state.data ? state.data.schemaInfo : null);
    }

    function sortRows(rows, sortState) {
        if (!Array.isArray(rows) || !rows.length) return rows || [];
        if (!sortState || !sortState.key || !sortState.dir) return rows;
        var key = sortState.key;
        var dir = sortState.dir === 'desc' ? -1 : 1;
        return rows.slice().sort(function (a, b) {
            var av = a[key];
            var bv = b[key];
            if (av === undefined || av === null) return 1;
            if (bv === undefined || bv === null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') {
                return (av - bv) * dir;
            }
            return String(av).localeCompare(String(bv)) * dir;
        });
    }

    function getDisplayColumnKey(columnsMeta, availableKeys) {
        if (availableKeys.has('__display')) return '__display';
        if (availableKeys.has('display_name')) return 'display_name';
        if (availableKeys.has('name')) return 'name';
        if (availableKeys.has('title')) return 'title';
        if (availableKeys.has('label')) return 'label';
        return '__display';
    }

    function getSelectedGroups(state, tableName, groups) {
        var pref = getTablePref(state, tableName);
        if (pref.groupVisibility) return pref.groupVisibility;
        return buildDefaultGroupSelection(groups || []);
    }

    function buildColumnsForTable(db, displayRows) {
        var data = db.data;
        var env = db.env;
        var tableName = data.activeTable;
        var firstRow = displayRows[0] || {};
        var availableKeys = new Set(Object.keys(firstRow));
        availableKeys.add('__display');
        var columnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
        var groups = getTableGroups(tableName, data.schemaInfo, env.lang);
        var selectedGroups = getSelectedGroups(db, tableName, groups);
        var pref = getTablePref(db, tableName);
        var visibility = (data.columnVisibility || {})[tableName];
        if (!visibility) {
            if (columnsMeta.length) {
                visibility = computeColumnVisibility(columnsMeta, selectedGroups, pref.overrides || {});
            } else {
                visibility = {};
                Array.from(availableKeys).forEach(function (k) { visibility[k] = true; });
            }
        }

        var columns;
        var displayKey = getDisplayColumnKey(columnsMeta, availableKeys);
        visibility[displayKey] = true;

        var allowedCols;
        if (columnsMeta.length) {
            allowedCols = columnsMeta.filter(function (col) {
                if (!col || !col.name) return false;
                if (col.name === 'id') return false;
                if (!availableKeys.has(col.name) && col.name !== displayKey) return false;
                if (col.group && selectedGroups[col.group] === false) return false;
                return visibility[col.name] !== false;
            }).map(function (col) { return { key: col.name, label: resolveColumnLabel(col, env.lang), group: col.group }; });
        } else if (data.columnsOrder && data.columnsOrder.length) {
            allowedCols = data.columnsOrder.filter(function (key) {
                if (key === 'id') return false;
                return availableKeys.has(key) && visibility[key] !== false;
            }).map(function (key) { return { key: key, label: key }; });
        } else {
            allowedCols = Array.from(availableKeys).filter(function (key) {
                if (key === 'id') return false;
                if (key === displayKey) return false;
                if (key === 'display_name') return false;
                return visibility[key] !== false && !isHiddenColumn(key);
            }).map(function (key) { return { key: key, label: key }; });
        }

        var hiddenCount = columnsMeta.length ? columnsMeta.filter(function (col) {
            if (!col || !col.name) return false;
            if (col.name === 'id') return false;
            if (col.group && selectedGroups[col.group] === false) return true;
            return visibility[col.name] === false;
        }).length : 0;

        var columnSet = [];
        columnSet.push({ key: displayKey, label: env.lang === 'ar' ? 'الاسم' : 'Name', isDisplay: true });
        allowedCols.forEach(function (col) {
            if (col.key === displayKey) return;
            columnSet.push(col);
        });

        columns = columnSet;
        columns.push({ key: '__actions', label: env.lang === 'ar' ? 'إجراءات' : 'Actions' });

        return { columns: columns, hiddenCount: hiddenCount, visibility: visibility };
    }

    function resolveDefaultExpr(expr) {
        if (!expr || typeof expr !== 'string') return null;
        var normalized = expr.trim();
        if (!normalized) return null;
        if (normalized === 'now' || normalized === 'now()') return new Date().toISOString();
        if (normalized === 'today' || normalized === 'today()') return new Date().toISOString();
        if (normalized.indexOf('localStorage:') === 0) {
            var key = normalized.replace('localStorage:', '');
            try {
                return global.localStorage ? global.localStorage.getItem(key) : null;
            } catch (_err) {
                return null;
            }
        }
        if (normalized.indexOf('cookie:') === 0) {
            var cookieKey = normalized.replace('cookie:', '');
            var cookieValue = readCookie(cookieKey);
            return cookieValue || null;
        }
        return null;
    }

    function readCookie(name) {
        if (!name || !global.document || !global.document.cookie) return null;
        var parts = global.document.cookie.split(';');
        for (var i = 0; i < parts.length; i++) {
            var chunk = parts[i].trim();
            if (!chunk) continue;
            var eq = chunk.indexOf('=');
            if (eq === -1) continue;
            var key = chunk.slice(0, eq).trim();
            if (key === name) return decodeURIComponent(chunk.slice(eq + 1));
        }
        return null;
    }

    function setCookie(name, value, days) {
        if (!name || typeof document === 'undefined') return;
        var maxAge = Number.isFinite(days) ? days * 86400 : 2592000;
        var encoded = encodeURIComponent(value || '');
        document.cookie = name + '=' + encoded + ';path=/;max-age=' + maxAge;
    }

    function getAuthContextFromCookies() {
        var companyId = readCookie('company_id') || readCookie('company');
        var branchId = readCookie('branch_id') || readCookie('branch');
        var userId = readCookie('user_insert') || readCookie('user') || readCookie('UserUniid');
        return {
            companyId: companyId || null,
            branchId: branchId || null,
            userId: userId || null
        };
    }

    async function loadAuthOptions(app) {
        if (!app) return;
        var lang = app.getState().env.lang;
        app.setState(function (prev) {
            var options = Object.assign({}, prev.data.authOptions || {});
            options.loading = true;
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { authOptions: options }) });
        });
        try {
            var companies = await M.REST.repo('companies').search({ lang: lang, limit: 200 });
            var branches = await M.REST.repo('branches').search({ lang: lang, limit: 200 });
            var users = await M.REST.repo('users').search({ lang: lang, limit: 200 });
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        authOptions: {
                            loading: false,
                            companies: companies.data || companies || [],
                            branches: branches.data || branches || [],
                            users: users.data || users || []
                        }
                    })
                });
            });
        } catch (error) {
            console.warn('[Auth] Failed to load auth options', error);
            app.setState(function (prev) {
                var options = Object.assign({}, prev.data.authOptions || {});
                options.loading = false;
                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { authOptions: options }) });
            });
        }
    }

    function applyDefaultsFromColumnsMeta(record, columnsMeta) {
        var output = Object.assign({}, record || {});
        (columnsMeta || []).forEach(function (col) {
            if (!col || !col.name) return;
            if (output[col.name] !== undefined && output[col.name] !== null && output[col.name] !== '') return;
            if (col.default_value !== null && col.default_value !== undefined) {
                output[col.name] = col.default_value;
                return;
            }
            if (col.default_expr) {
                var value = resolveDefaultExpr(col.default_expr);
                if (value !== null && value !== undefined && value !== '') {
                    output[col.name] = value;
                }
            }
        });
        return output;
    }

    function buildSystemDefaults(dataState, columnsMeta) {
        var defaults = {};
        var colNames = new Set((columnsMeta || []).map(function (c) { return c && c.name; }).filter(Boolean));
        var ctx = dataState && dataState.defaultContext ? dataState.defaultContext : {};
        function has(name) { return colNames.has(name); }
        if (has('company_id') && ctx.company && ctx.company.id) defaults.company_id = ctx.company.id;
        if (has('branch_id') && ctx.branch && ctx.branch.id) defaults.branch_id = ctx.branch.id;
        if (has('user_insert') && ctx.user && ctx.user.id) defaults.user_insert = ctx.user.id;
        return defaults;
    }

    function formatDateTimeValue(value) {
        if (typeof value !== 'string') return null;
        var parsed = Date.parse(value);
        if (!Number.isFinite(parsed)) return null;
        var date = new Date(parsed);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    function formatRowForDisplay(row) {
        var output = Object.assign({}, row);
        var preservedIds = {};
        ['id', 'Id', 'uuid', 'uid'].forEach(function (key) {
            if (row && row[key]) {
                preservedIds[key] = row[key];
            }
        });
        Object.keys(output).forEach(function (key) {
            if (!key) return;
            var lower = String(key).toLowerCase();
            if (lower.indexOf('date') === -1 && lower.indexOf('time') === -1 && !lower.endsWith('_at')) return;
            var formatted = formatDateTimeValue(output[key]);
            if (formatted) {
                output[key] = formatted;
            }
        });
        Object.keys(output).forEach(function (key) {
            var value = output[key];
            if (typeof value !== 'string') return;
            if (!isLikelyUuid(value)) return;
            output[key] = '';
        });
        Object.keys(preservedIds).forEach(function (key) {
            output[key] = preservedIds[key];
        });
        return output;
    }

    function isLikelyUuid(value) {
        if (!value || typeof value !== 'string') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
    }

    function isHiddenColumn(key) {
        if (!key) return true;
        var lower = String(key).toLowerCase();
        if (lower.startsWith('_')) return true;
        if (['id', 'company_id', 'company', 'branch_id', 'branch', 'user_insert', 'translations', 'i18n', '__translation'].includes(lower)) {
            return true;
        }
        if (isSystemFieldName(lower)) return true;
        if (lower.endsWith('_id')) return true;
        return false;
    }

    function isSystemFieldName(key) {
        if (!key) return false;
        var lower = String(key).toLowerCase();
        return ['begin_date', 'created_date', 'user_insert', 'last_update', 'last_update_date'].includes(lower);
    }

    function filterRecordsByTerm(records, term, lang, columnsMeta) {
        if (!term) return records || [];
        var normalized = String(term || '').trim().toLowerCase();
        if (!normalized) return records || [];
        var merged = mergeDisplayRows(records || [], lang);
        var searchableKeys = null;
        if (Array.isArray(columnsMeta) && columnsMeta.length) {
            searchableKeys = columnsMeta
                .filter(function (col) { return col && col.name && col.is_searchable !== false; })
                .map(function (col) { return col.name; });
        }
        return merged.filter(function (row) {
            var keys = searchableKeys || Object.keys(row || {});
            return keys.some(function (key) {
                if (key.startsWith('_') || key === 'i18n' || key === 'translations' || key === '__translation') return false;
                var value = row[key];
                if (value && typeof value === 'object') {
                    if (typeof value.name === 'string' && value.name.toLowerCase().includes(normalized)) return true;
                    if (typeof value.label === 'string' && value.label.toLowerCase().includes(normalized)) return true;
                    return false;
                }
                if (typeof value === 'string' && value.toLowerCase().includes(normalized)) return true;
                if (typeof value === 'number' && String(value).includes(normalized)) return true;
                return false;
            });
        });
    }

    function matchRowId(row, id) {
        if (!row) return false;
        var rowId = row.id || row.Id || row.uuid || row.uid;
        if (rowId === undefined || rowId === null) return false;
        return String(rowId) === String(id);
    }

    function filterChildRecordsByParent(records, parentField, parentId) {
        if (!parentField || parentId === undefined || parentId === null) return records || [];
        var targetId = String(parentId);
        return (records || []).filter(function (row) {
            var value = row[parentField];
            if (value === undefined || value === null) return false;
            if (typeof value === 'object') {
                var nestedId = value.id || value.Id || value.uuid || value.uid;
                return nestedId && String(nestedId) === targetId;
            }
            return String(value) === targetId;
        });
    }

    function buildFkOptions(records, activeRecord, fkDefs, schemaInfo, lang, refCache) {
        var options = {};
        var baseCache = refCache || {};
        Object.keys(baseCache || {}).forEach(function (field) {
            var list = baseCache[field] || [];
            list.forEach(function (entry) {
                if (!entry || !entry.value) return;
                var arr = options[field] || (options[field] = []);
                if (!arr.some(function (opt) { return opt.value === String(entry.value); })) {
                    arr.push({ value: String(entry.value), label: entry.label || entry.value });
                }
            });
        });
        var fkTargetMap = {};
        (fkDefs || []).forEach(function (fk) {
            if (fk && fk.name) {
                fkTargetMap[fk.name] = fk.target;
            }
        });

        function addOption(field, obj, id) {
            if (!id) return;
            if (typeof id === 'object') {
                console.warn('[FK Debug] Option ID is object for field:', field, id);
                id = id.id || id.Id || id.uuid || id.uid || null;
            }
            if (!id) {
                console.warn('[FK Debug] Missing option ID for field:', field, obj);
            }
            if (!id) return;
            var list = options[field] || (options[field] = []);
            var idValue = String(id);
            if (list.some(function (opt) { return opt.value === idValue; })) return;
            var label = null;
            if (obj) {
                var target = fkTargetMap[field];
                label = displayNameForRecord(obj, target, schemaInfo, lang) || obj.name || obj.label;
            }
            if (label && isLikelyUuid(label)) {
                label = null;
            }
            label = label || (lang === 'ar' ? 'غير مسمى' : 'Unnamed');
            list.push({ value: idValue, label: label });
        }

        function scanRow(row) {
            if (!row || typeof row !== 'object') return;
            Object.keys(row).forEach(function (key) {
                if (key === 'company_id') return;
                if (!key.endsWith('_id')) return;
                var id = row[key];
                var obj = row[key.replace(/_id$/, '')];
                addOption(key, obj, id);
            });

            (fkDefs || []).forEach(function (fk) {
                var rawValue = row[fk.name];
                var objValue = row[fk.name] && typeof row[fk.name] === 'object' ? row[fk.name] : row[fk.name && fk.name.replace(/_id$/, '')];
                if (!objValue && row[fk.name + '_id']) {
                    rawValue = row[fk.name + '_id'];
                }
                var idVal = rawValue && typeof rawValue === 'object' ? (rawValue.id || rawValue.Id || rawValue.uuid || rawValue.uid) : rawValue;
                addOption(fk.name, objValue || rawValue, idVal);
            });
        }

        (records || []).forEach(scanRow);
        scanRow(activeRecord);

        return options;
    }

    function cloneObject(obj) {
        return JSON.parse(JSON.stringify(obj || {}));
    }

    function computeRecordPatch(original, edited) {
        if (!original) return Object.assign({}, edited);
        var patch = {};
        Object.keys(edited || {}).forEach(function (key) {
            var value = edited[key];
            if (value && typeof value === 'object') return;
            if (String(key).startsWith('_')) return;
            if (value !== original[key]) {
                patch[key] = value;
            }
        });
        if (edited && edited.id && !patch.id) {
            patch.id = edited.id;
        }
        return patch;
    }

    function computeTranslationPayload(current, baseline, removals, translationFields) {
        var payload = {};
        var base = baseline || {};
        var currentMap = current || {};
        var deleteSet = new Set((removals || []).map(function (lang) { return String(lang || '').toLowerCase(); }).filter(Boolean));
        var events = [];

        Object.keys(base).forEach(function (lang) {
            if (!currentMap[lang]) deleteSet.add(lang);
        });

        var fields = new Set(translationFields || []);
        Object.values(currentMap).forEach(function (entry) {
            Object.keys(entry || {}).forEach(function (k) { fields.add(k); });
        });

        Object.keys(currentMap).forEach(function (lang) {
            var currentEntry = currentMap[lang] || {};
            var baseEntry = base[lang] || {};
            var diff = {};
            fields.forEach(function (field) {
                if (currentEntry[field] !== baseEntry[field]) {
                    diff[field] = currentEntry[field];
                }
            });
            if (Object.keys(diff).length) {
                payload[lang] = diff;
                events.push({
                    lang: lang,
                    action: base[lang] ? 'update' : 'insert',
                    fields: Object.keys(diff)
                });
            }
        });

        var deletions = Array.from(deleteSet);
        payload.__delete = deletions;
        deletions.forEach(function (lang) {
            events.push({ lang: lang, action: 'delete' });
        });
        payload.__strategy = baseline && Object.keys(baseline).length ? 'merge' : 'replace';
        payload.__events = events;
        return payload;
    }

    function buildSavePayload(dataState) {
        var record = dataState.editRecord || {};
        var baselineRecord = dataState.selectedRecord || null;
        var translationPayload = computeTranslationPayload(
            dataState.translations,
            dataState.translationBaseline,
            dataState.translationRemovals,
            dataState.translationFields
        );

        var patch = computeRecordPatch(baselineRecord, record);

        // Filter out sequence fields on CREATE to let backend generate them
        if (!baselineRecord && dataState.columnsMeta) {
            (normalizeColumnsMeta(dataState.columnsMeta)).forEach(function (col) {
                if (col.default_expr && String(col.default_expr).startsWith('sequence:')) {
                    delete patch[col.name];
                }
            });
        }

        return {
            record: patch,
            translations: translationPayload
        };
    }

    function mergeLanguages(existing, incoming) {
        var map = new Map();
        (existing || []).forEach(function (lang) {
            if (lang && lang.code) map.set(lang.code, lang);
        });
        (incoming || []).forEach(function (lang) {
            if (!lang || !lang.code) return;
            var prev = map.get(lang.code) || {};
            map.set(lang.code, Object.assign({}, prev, lang));
        });
        return Array.from(map.values());
    }

    async function loadLanguages(app) {
        try {
            var repo = M.REST.repo('languages');
            var response = await repo.search({ limit: 100 });
            var rows = response.data || response || [];

            var formatted = rows.map(function (l) {
                return {
                    code: l.code,
                    label: l.display_name || l.name || l.code,
                    dir: l.direction || 'ltr'
                };
            });

            if (formatted.length === 0) {
                formatted = [
                    { code: 'ar', label: 'العربية', dir: 'rtl' },
                    { code: 'en', label: 'English', dir: 'ltr' }
                ];
            }

            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        systemLanguages: formatted,
                        languages: mergeLanguages(prev.data.languages, formatted)
                    })
                });
            });
        } catch (error) {
            console.warn('[Universal CRUD] Failed to load languages', error);
            // Fallback
            var fallback = [
                { code: 'ar', label: 'العربية', dir: 'rtl' },
                { code: 'en', label: 'English', dir: 'ltr' }
            ];
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        systemLanguages: fallback,
                        languages: mergeLanguages(prev.data.languages, fallback)
                    })
                });
            });
        }
    }

    async function loadContextInfo(app) {
        var lang = app.getState().env.lang;
        var cookieContext = getAuthContextFromCookies();
        var missing = [];
        if (!cookieContext.companyId) missing.push('company_id');
        if (!cookieContext.branchId) missing.push('branch_id');
        if (!cookieContext.userId) missing.push('user_insert');

        if (missing.length) {
            app.setState(function (prev) {
                var nextForm = Object.assign({}, prev.data.authForm || {});
                if (cookieContext.companyId) nextForm.company_id = cookieContext.companyId;
                if (cookieContext.branchId) nextForm.branch_id = cookieContext.branchId;
                if (cookieContext.userId) nextForm.user_insert = cookieContext.userId;
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        authRequired: true,
                        authContext: { missing: missing },
                        companyInfo: null,
                        defaultContext: {},
                        authForm: nextForm
                    })
                });
            });
            await loadAuthOptions(app);
            return;
        }

        async function fetchById(table, id) {
            if (!id) return null;
            try {
                var repo = M.REST.repo(table);
                var res = await repo.get(id, { lang: lang });
                var rec = res && (res.record || res);
                if (!rec) return { id: id, name: id, record: null };
                var displayName = displayNameForRecord(rec, table, app.getState().data.schemaInfo, lang) || rec.name || rec.code || id;
                if (!displayName || isLikelyUuid(displayName) || String(displayName) === String(id)) {
                    var translations = res && res.translations ? res.translations : null;
                    if (translations) {
                        var preferred = [lang, 'ar', 'en'].filter(Boolean);
                        for (var i = 0; i < preferred.length; i += 1) {
                            var entry = translations[preferred[i]];
                            if (!entry) continue;
                            var candidate = entry.name || entry.label || entry.title;
                            if (candidate) {
                                displayName = candidate;
                                break;
                            }
                        }
                    }
                }
                return {
                    id: rec.id || rec.Id || rec.uuid || rec.uid,
                    name: displayName || id,
                    record: rec
                };
            } catch (_err) {
                return { id: id, name: id, record: null };
            }
        }

        var company = await fetchById('companies', cookieContext.companyId);
        var branch = await fetchById('branches', cookieContext.branchId);
        var user = await fetchById('users', cookieContext.userId);

        app.setState(function (prev) {
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                    companyInfo: company,
                    defaultContext: {
                        company: company,
                        branch: branch,
                        user: user
                    },
                    authRequired: false,
                    authContext: null
                })
            });
        });
    }

    function getBranchId(state) {
        return state && state.data && state.data.defaultContext && state.data.defaultContext.branch
            ? state.data.defaultContext.branch.id
            : null;
    }

    function getSequenceColumns(columnsMeta) {
        return normalizeColumnsMeta(columnsMeta || []).filter(function (col) {
            return col && col.name && col.sequence;
        });
    }

    async function fetchSequencePreview(branchId, moduleId, tableName, fieldName) {
        if (!tableName || !fieldName) return null;
        var safeBranch = branchId || 'default';
        var safeModule = moduleId || 'finance';
        var url = '/api/v1/branches/' + encodeURIComponent(safeBranch) + '/modules/' + encodeURIComponent(safeModule) + '/sequences?preview=1';
        try {
            var res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ table: tableName, field: fieldName, preview: true })
            });
            if (!res.ok) return null;
            var payload = await res.json();
            return payload && (payload.id || payload.formatted || payload.value || null);
        } catch (err) {
            console.warn('[Sequence Preview] Failed to fetch preview for', tableName, fieldName, err);
            return null;
        }
    }

    async function refreshSequenceHints(app, tableName) {
        if (!app || !tableName) return;
        var state = app.getState();
        var columnsMeta = normalizeColumnsMeta(state.data.columnsMeta || []);
        var sequenceColumns = getSequenceColumns(columnsMeta);
        if (!sequenceColumns.length) return;
        var branchId = getBranchId(state);
        var moduleId = state.config ? state.config.moduleId : 'finance';
        for (var i = 0; i < sequenceColumns.length; i++) {
            var col = sequenceColumns[i];
            var preview = await fetchSequencePreview(branchId, moduleId, tableName, col.name);
            if (!preview) continue;
            app.setState(function (prev) {
                var map = Object.assign({}, prev.data.sequenceHints || {});
                var tableMap = Object.assign({}, map[tableName] || {});
                tableMap[col.name] = preview;
                map[tableName] = tableMap;
                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { sequenceHints: map }) });
            });
        }
    }

    function resolveSchemaTableLabel(appState, tableName) {
        var info = appState.data && appState.data.schemaInfo || {};
        var map = info.tableMap || {};
        var def = map[tableName] || {};
        var lang = appState.env && appState.env.lang || 'ar';
        var labels = def.labels || {};
        return labels[lang] || labels.ar || labels.en || def.label || def.name || tableName;
    }

    function resolveSchemaTableIcon(appState, tableName) {
        var info = appState.data && appState.data.schemaInfo || {};
        var map = info.tableMap || {};
        var def = map[tableName] || {};
        return (def.smart_features && def.smart_features.settings && def.smart_features.settings.icon) || '🗂️';
    }

    function resolveModuleLabelById(appState, moduleId) {
        var info = appState.data && appState.data.schemaInfo || {};
        var modules = info.modules || [];
        var lang = appState.env && appState.env.lang || 'ar';
        var match = modules.find(function (mod) { return mod && mod.id === moduleId; }) || null;
        if (!match) return moduleId || '';
        var labels = match.labels || {};
        return labels[lang] || labels.ar || labels.en || match.label || match.id || moduleId;
    }

    function resolveRootModuleLabel(appState) {
        var info = appState.data && appState.data.schemaInfo || {};
        var modules = info.modules || [];
        var lang = appState.env && appState.env.lang || 'ar';
        var root = modules.find(function (mod) { return mod && !mod.parent_id; }) || modules[0];
        if (!root) return 'finance';
        var labels = root.labels || {};
        return labels[lang] || labels.ar || labels.en || root.label || root.id || 'finance';
    }

    function getDynamicTabs(appState) {
        var screenMap = {
            accounts: 'fin_chart_of_accounts',
            journals: 'fin_journal_headers'
        };

        var tabs = [{ id: 'home', label: resolveRootModuleLabel(appState), icon: '🏠' }];

        if (global.FinanceScreens) {
            Object.keys(global.FinanceScreens).forEach(function (key) {
                if (key === 'home') return;
                var tableName = screenMap[key];
                tabs.push({
                    id: key,
                    label: tableName ? resolveSchemaTableLabel(appState, tableName) : key,
                    icon: tableName ? resolveSchemaTableIcon(appState, tableName) : '🗂️'
                });
            });
        }

        tabs.push({
            id: 'settings',
            label: resolveModuleLabelById(appState, 'financial_settings') || 'settings',
            icon: '🧰'
        });

        return tabs;
    }

    function renderScreenTabs(activeScreen, lang, appState) {
        var tabs = getDynamicTabs(appState);
        if (UI && UI.Segmented) {
            return UI.Segmented({
                items: tabs.map(function (tab) {
                    return {
                        id: tab.id,
                        label: (tab.icon || '•') + ' ' + tab.label,
                        gkey: 'crud:switch-screen',
                        attrs: { 'data-screen': tab.id }
                    };
                }),
                activeId: activeScreen,
                attrs: { class: 'w-full flex flex-wrap gap-2 bg-[var(--surface-1)]' }
            });
        }
        return D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, tabs.map(function (tab) {
            var isActive = tab.id === activeScreen;
            return D.Button({
                attrs: {
                    type: 'button',
                    gkey: 'crud:switch-screen',
                    'data-screen': tab.id,
                    class: 'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border ' +
                        (isActive ? 'border-[var(--primary)] text-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]' : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]')
                }
            }, [
                D.Span({}, [tab.icon || '•']),
                D.Span({}, [tab.label])
            ]);
        }));
    }

    function loadActiveScreen(app, screenId) {
        if (!screenId || screenId === 'settings') return;
        if (!global.FinanceScreens || !global.FinanceScreens[screenId]) return;
        var screen = global.FinanceScreens[screenId];
        if (screen && typeof screen.load === 'function') {
            screen.load(app);
        }
    }

    function renderActiveScreen(appState) {
        var screenId = appState.data.activeScreen;
        var env = appState.env;
        if (screenId === 'settings') return null;

        var screensState = appState.data.screens || {};
        var screenState = screensState[screenId] || {};

        if (screenState.loading) {
            return D.Div({ attrs: { class: 'flex flex-col items-center justify-center h-64 space-y-4' } }, [
                D.Div({ attrs: { class: 'animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--primary)]' } }, []),
                D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)] animate-pulse' } }, [
                    env.lang === 'ar' ? 'جارٍ تحميل الشاشة...' : 'Loading screen...'
                ])
            ]);
        }

        if (!global.FinanceScreens || !global.FinanceScreens[screenId]) {
            return D.Div({ attrs: { class: 'rounded-xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]' } }, [
                appState.env.lang === 'ar' ? 'هذه الشاشة قيد التحضير.' : 'This screen is coming soon.'
            ]);
        }
        return global.FinanceScreens[screenId].render(appState);
    }

    function buildEmptyTranslations(languages, fields) {
        var translations = {};
        (languages || []).forEach(function (lang) {
            var langCode = lang.code || lang.id || lang;
            if (!langCode) return;
            var entry = {};
            (fields || []).forEach(function (field) { entry[field] = ''; });
            translations[langCode] = entry;
        });
        return translations;
    }

    async function loadRecordDetail(app, tableName, recordId) {
        if (!tableName || !recordId) return;
        app.setState(function (prev) {
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, { loadingRecord: true })
            });
        });

        try {
            var repo = M.REST.repo(tableName);
            var response = await repo.get(recordId, { lang: app.getState().env.lang, include: 'translations' });
            var record = response.record || response;
            var translations = response.translations || {};
            var columnsMeta = Array.isArray(response.columnsMeta) ? response.columnsMeta : null;
            await ensureFkObjects(app, tableName, [record]);
            var translationFields = ensureTranslationFields(response.translationFields || [], translations);
            var languages = mergeLanguages(app.getState().data.languages, response.languages || []);
            if (!Object.keys(translations).length && languages.length) {
                translations = buildEmptyTranslations(languages, translationFields);
            }

            app.setState(function (prev) {
                var groups = getTableGroups(tableName, prev.data.schemaInfo, app.getState().env.lang);
                var defaultFormTab = prev.data.activeFormTab;
                var groupIds = groups.map(function (g) { return g.id; });
                if (!defaultFormTab || groupIds.indexOf(defaultFormTab) === -1) {
                    defaultFormTab = (groups[0] && groups[0].id) || 'basic';
                }
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        selectedRecord: record,
                        editRecord: Object.assign({}, record),
                        translations: translations,
                        translationBaseline: cloneObject(translations),
                        translationRemovals: [],
                        newLangCode: '',
                        translationFields: translationFields,
                        languages: languages,
                        columnsMeta: columnsMeta || prev.data.columnsMeta,
                        formMode: 'edit',
                        activeFormTab: defaultFormTab,
                        recordTable: tableName,
                        loadingRecord: false,
                        error: null
                    })
                });
            });
        } catch (error) {
            console.error('[Universal CRUD] Failed to load record detail', error);
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        loadingRecord: false,
                        error: 'تعذّر تحميل تفاصيل السجل: ' + error.message
                    })
                });
            });
        }
    }

    async function loadTables(app) {
        loadLanguages(app);
        loadContextInfo(app);

        try {
            // Fetch System Tables (backend is the source of truth)
            var payload = await M.REST.system.tables();
            var lang = app.getState().env.lang;
            var rawTables = Array.isArray(payload) ? payload : (payload.tables || []);
            var tableTypes = (payload && payload.tableTypes) || [];
            var modulesPayload = (payload && payload.modules) || [];

            // Build schemaInfo directly from backend payload
            var tableMap = {};
            var fkMap = {};

            rawTables.forEach(function (tbl) {
                var merged = Object.assign({}, tbl);

                tableMap[merged.name || merged.id] = merged;
                fkMap[merged.name || merged.id] = [];
            });

            var schemaInfo = {
                tableMap: tableMap,
                fkMap: fkMap,
                tableTypes: tableTypes,
                modules: modulesPayload,
                meta: {}
            };

            app.setState(function (prev) {
                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { schemaInfo: schemaInfo }) });
            });

            var uiTables = rawTables
                .filter(function (t) {
                    var name = String(t.name || t.id || '').toLowerCase();
                    if (!name || name.endsWith('_lang')) return false;
                    return name.indexOf('fin_') === 0 || name === 'ui_labels';
                })
                .map(function (t) {
                    var tableDef = schemaInfo && schemaInfo.tableMap ? (schemaInfo.tableMap[t.name] || schemaInfo.tableMap[(t.name || '').toLowerCase()]) : null;
                    var labels = resolveTableLabels(Object.assign({}, tableDef || {}, t));
                    var meta = normalizeTableMeta(t, schemaInfo);
                    var icon = meta.icon || t.icon || (labels.ar ? labels.ar.charAt(0) : (t.name || 'T').charAt(0));
                    return {
                        id: t.name,
                        labels: labels,
                        label: labels[lang] || labels.ar || labels.en || t.label || t.name,
                        icon: icon,
                        type: meta.type,
                        module_id: meta.module_id,
                        settings: meta.settings
                    };
                });

            // Smart Fallback: Intelligent table-to-module mapping
            uiTables.forEach(function (t) {
                // Skip if already has a VALID and SPECIFIC module_id
                // We allow overriding 'operations', 'settings', 'system', 'financial' if a better match is found
                var isGeneric = ['operations', 'settings', 'system', 'financial', 'logs', 'reports'].indexOf(t.module_id) !== -1;

                if (t.module_id && !isGeneric && schemaInfo.modules.find(function (m) { return m.id === t.module_id; })) {
                    return;
                }

                var name = (t.id || '').toLowerCase();
                var newModuleId = null;

                // Pattern-based inference
                if (name.includes('currency') || name.includes('account') || name.includes('type') || name.includes('entity') || name.includes('dimension')) {
                    newModuleId = 'financial_settings';
                } else if (name.includes('journal') || name.includes('cheque') || name.includes('bank') || name.includes('statement') || name.includes('budget')) {
                    newModuleId = 'financial_operations';
                } else if (name.includes('report') || name.includes('layout')) {
                    newModuleId = 'financial_analytic';
                } else if (name.includes('audit') || name.includes('log') || name.includes('history')) {
                    newModuleId = 'system';
                } else if (name.includes('ui_') || name.includes('label')) {
                    newModuleId = 'system';
                } else if (name.includes('company') || name.includes('branch')) {
                    newModuleId = 'financial_settings';
                }
                // Type-based fallback
                else if (t.type === 'operations') newModuleId = 'financial_operations';
                else if (t.type === 'reports') newModuleId = 'financial_analytic';
                else if (t.type === 'logs') newModuleId = 'system';
                else if (t.type === 'settings') newModuleId = 'financial_settings';
                else newModuleId = 'system'; // Ultimate fallback

                t.module_id = newModuleId;
            });

            // Use schema modules if available, otherwise build from tableTypes
            var modules = modulesPayload && modulesPayload.length > 0
                ? buildModulesFromSchema(modulesPayload, uiTables, lang)
                : buildModules(uiTables, tableTypes);

            var openState = {};
            modules.forEach(function (m) { openState[m.id] = true; });

            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        tables: uiTables,
                        modules: modules,
                        tableTypes: tableTypes,
                        moduleOpen: openState,
                        activeTable: null,
                        records: [],
                        selectedRecord: null,
                        editRecord: null
                    })
                });
            });

        } catch (e) {
            console.error('Failed to load tables', e);
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        loading: false,
                        error: 'تعذّر تحميل الجداول. تأكد من تشغيل الخادم ثم أعد المحاولة.'
                    })
                });
            });
        }
    }

    async function loadTableData(app, tableName) {
        if (!tableName) return;
        var state = app.getState();
        var lang = state.env.lang;
        var search = state.data.searchTerm;
        var schemaInfo = state.data.schemaInfo;

        // Optimization: Don't re-download meta if we already have it for this table
        var isSameTable = state.data.activeTable === tableName;
        var hasMeta = isSameTable && Array.isArray(state.data.columnsMeta) && state.data.columnsMeta.length;
        var withMeta = hasMeta ? 0 : 1;
        // Limit Priority: LocalStorage > Schema > Default (50)
        var savedLimit = localStorage.getItem('crud_limit');
        var schemaDef = schemaInfo.tableMap[tableName] || {};
        var schemaLimit = (schemaDef.smart_features && schemaDef.smart_features.default_limit);

        var limit;
        if (savedLimit !== null && savedLimit !== undefined && savedLimit !== '') {
            limit = parseInt(savedLimit, 10);
        } else {
            limit = (schemaLimit !== undefined && schemaLimit !== null) ? schemaLimit : 50;
        }
        if (limit === 0) limit = 100000; // 0 means Show All

        var page = isSameTable ? (state.data.page || 1) : 1;

        app.setState(function (prev) {
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                    loading: true,
                    error: null,
                    page: page,
                    limit: limit
                })
            });
        });

        try {
            var repo = M.REST.repo(tableName);
            var result = await repo.search({
                lang: lang,
                q: '',
                page: page,
                limit: limit,
                withMeta: withMeta
            });

            var hydratedRecords = await ensureFkObjects(app, tableName, result.data || []);
            // Use new meta if available, otherwise reuse existing
            var columnsMeta = Array.isArray(result.columnsMeta) ? result.columnsMeta : (hasMeta ? state.data.columnsMeta : []);

            var primaryGroup = getPrimaryGroupForTable(tableName, schemaInfo);
            var tablePrefs = state.data.columnPreferences || {};
            var prefForTable = tablePrefs[tableName] || {};
            var columnOverrides = prefForTable.overrides || {};
            var sortPref = prefForTable.sort || null;
            var groups = getTableGroups(tableName, schemaInfo, lang);
            var selectedGroups = prefForTable.groupVisibility || buildDefaultGroupSelection(groups);
            var activeGroup = getActiveGroupForState(state, tableName) || primaryGroup;
            var columnVisibility = computeColumnVisibility(columnsMeta || [], selectedGroups, columnOverrides);

            var fkReferenceOptions = await loadFkReferenceOptions(app, tableName, schemaInfo, lang);
            var filteredRecords = search ? filterRecordsByTerm(hydratedRecords, search, lang, columnsMeta) : hydratedRecords;

            app.setState(function (prev) {
                var nextRecords = filteredRecords;
                var crumbs = computeBreadcrumbs(prev.data.modules, tableName, lang);
                var nextPrefs = mergeTablePref(prev.data.columnPreferences || {}, tableName, {
                    group: activeGroup,
                    groupVisibility: selectedGroups,
                    overrides: columnOverrides,
                    sort: sortPref
                });
                var visibilityMap = Object.assign({}, prev.data.columnVisibility || {});
                visibilityMap[tableName] = columnVisibility;
                var sortMap = Object.assign({}, prev.data.tableSort || {});
                sortMap[tableName] = sortPref;
                var activeGroups = Object.assign({}, prev.data.activeGroupByTable || {});
                activeGroups[tableName] = activeGroup;
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        records: nextRecords,
                        total: result.total || result.count || 0, // Try both total and count
                        columnsOrder: Array.isArray(result.columnsOrder) ? result.columnsOrder : null,
                        columnsMeta: columnsMeta,
                        columnPreferences: nextPrefs,
                        columnVisibility: visibilityMap,
                        tableSort: sortMap,
                        activeGroupByTable: activeGroups,
                        fkReferenceCache: Object.assign({}, prev.data.fkReferenceCache, (function () {
                            var cache = {};
                            cache[tableName] = fkReferenceOptions;
                            return cache;
                        })()),
                        loading: false,
                        error: null,
                        breadcrumbs: crumbs,
                        columnFilterOpen: false
                    })
                });
            });

            var selected = app.getState().data.selectedRecord;
            var selectedId = selected && (selected.id || selected.Id || selected.uuid);
            var fallbackRecord = (result.data || [])[0];
            var fallbackId = fallbackRecord && (fallbackRecord.id || fallbackRecord.Id || fallbackRecord.uuid);

            if (fallbackId && fallbackId !== selectedId) {
                await loadRecordDetail(app, tableName, fallbackId);
            }
        } catch (e) {
            console.error('Failed to load data', e);
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        loading: false,
                        error: 'تعذّر جلب البيانات لهذه الجدول. تحقق من الاتصال أو من صحة الـ API.'
                    })
                });
            });
        }
    }

    function setChildStackAt(app, index, patch) {
        app.setState(function (prev) {
            var stack = (prev.data.childCrudStack || []).slice();
            var current = Object.assign({}, stack[index] || {});
            stack[index] = Object.assign({}, current, patch);
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { childCrudStack: stack }) });
        });
    }

    async function loadChildTableData(app, stackIndex) {
        var state = app.getState();
        var stack = state.data.childCrudStack || [];
        var item = stack[stackIndex];
        if (!item || !item.table) return;
        var lang = state.env.lang;

        setChildStackAt(app, stackIndex, { loading: true, error: null });

        try {
            var repo = M.REST.repo(item.table);
            var res = await repo.search({ lang: lang, q: '', limit: 200, withMeta: 1 });
            var rows = res.data || res || [];
            rows = await ensureFkObjects(app, item.table, rows);
            var filtered = filterChildRecordsByParent(rows, item.parentField, item.parentId);
            var columnsMeta = Array.isArray(res.columnsMeta) ? res.columnsMeta : [];
            setChildStackAt(app, stackIndex, {
                loading: false,
                records: filtered,
                columnsMeta: columnsMeta,
                total: filtered.length
            });
        } catch (err) {
            console.error('[Child CRUD] Failed to load child table', err);
            setChildStackAt(app, stackIndex, {
                loading: false,
                error: err.message || 'تعذر تحميل البيانات المرتبطة'
            });
        }
    }

    function updateDocumentTheme(theme, lang) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        document.body.className = theme === 'dark' ? 'dark' : '';
        savePreference(STORAGE_KEYS.theme, theme);
        savePreference(STORAGE_KEYS.lang, lang);
    }

    function renderRecordEditor(db) {
        var data = db.data;
        var env = db.env;
        var record = data.editRecord || {};
        var translations = data.translations || {};
        var languages = data.languages || [];
        var activeTable = data.recordTable || data.activeTable;
        var translationFields = ensureTranslationFields(data.translationFields, translations);
        var fkDefs = collectFkDefs(data.schemaInfo, activeTable, data.records);
        var fkOptions = buildFkOptions(
            data.records,
            record,
            fkDefs,
            data.schemaInfo,
            env.lang,
            (data.fkReferenceCache && data.fkReferenceCache[activeTable]) || {}
        );

        if (data.loadingRecord) {
            return D.Div({ attrs: { class: 'p-4 rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, [
                D.Div({ attrs: { class: 'flex items-center gap-2 text-[var(--muted-foreground)]' } }, [
                    D.Span({ attrs: { class: 'animate-spin h-4 w-4 border-b-2 border-[var(--primary)] rounded-full' } }, []),
                    D.Span({}, [env.lang === 'ar' ? 'جار تحميل السجل...' : 'Loading record...'])
                ])
            ]);
        }

        var columnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
        var fkFieldNames = new Set((fkDefs || []).map(function (fk) { return fk.name; }));
        var groups = getTableGroups(activeTable, data.schemaInfo, env.lang);
        var activeTab = data.activeFormTab || (groups[0] && groups[0].id) || 'basic';
        var formTabs = groups;

        var editableColumns = columnsMeta.filter(function (col) {
            return col && col.name && col.is_edit_show !== false && col.source !== 'lang' && !isSystemFieldName(col.name);
        });
        var groupedColumns = {};
        editableColumns.forEach(function (col) {
            var groupId = col.group || (groups[0] && groups[0].id) || 'basic';
            if (!groupedColumns[groupId]) groupedColumns[groupId] = [];
            groupedColumns[groupId].push(col);
        });

        function renderFieldControl(col) {
            var field = col.name;
            var fieldLabel = resolveFieldLabel(field, columnsMeta, env.lang);
            var options = fkOptions[field] || [];
            var sequenceHint = ((data.sequenceHints || {})[activeTable] || {})[field];
            var isSequenceField = !!col.sequence || (col.default_expr && String(col.default_expr).startsWith('sequence:'));
            var isReadonly = col.readonly === true || col.is_read_only === true || field === 'id' || (isSequenceField && data.formMode === 'create');

            var computedPlaceholder = undefined;
            if (isSequenceField && data.formMode === 'create') {
                computedPlaceholder = sequenceHint
                    ? (env.lang === 'ar'
                        ? 'تلقائي (التالي: ' + sequenceHint + ')'
                        : 'Auto (Next: ' + sequenceHint + ')')
                    : (env.lang === 'ar' ? 'تلقائي' : 'Auto-generated');
            } else if (sequenceHint) {
                computedPlaceholder = sequenceHint;
            }
            if (options.length) {
                var selectedVal = record[field];
                if (selectedVal && typeof selectedVal === 'object') { selectedVal = selectedVal.id; }
                var normalizedSelected = selectedVal === null || selectedVal === undefined ? '' : String(selectedVal);
                var fkDef = fkDefs.find(function (fk) { return fk.name === field; }) || {};
                return D.Div({ attrs: { class: 'flex flex-col gap-1.5', key: 'field-' + field } }, [
                    D.Label({ attrs: { class: 'text-sm font-medium text-[var(--foreground)]' } }, [fieldLabel]),
                    D.Select({
                        attrs: {
                            name: field,
                            value: normalizedSelected,
                            gkey: 'crud:update-field',
                            class: 'flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all'
                        }
                    }, [
                        D.Option({ attrs: { value: '' } }, [env.lang === 'ar' ? 'اختر قيمة' : 'Select value']),
                        options.map(function (opt) {
                            var isSelected = opt.value === normalizedSelected;
                            return D.Option({
                                attrs: {
                                    value: opt.value,
                                    selected: isSelected ? 'selected' : undefined
                                }
                            }, [opt.label]);
                        })
                    ]),
                    D.Div({ attrs: { class: 'flex gap-2 flex-wrap' } }, [
                        UC.Button({
                            key: 'crud:open-fk-search',
                            icon: '🔎',
                            label: env.lang === 'ar' ? 'بحث' : 'Search',
                            size: 'xs',
                            variant: 'ghost',
                            attrs: { 'data-field': field, 'data-target': fkDef.target, 'data-options-key': field }
                        }),
                        UC.Button({
                            key: 'crud:open-fk-quick-add',
                            icon: '✨',
                            label: env.lang === 'ar' ? 'إدراج' : 'Add',
                            size: 'xs',
                            variant: 'outline',
                            attrs: { 'data-field': field, 'data-target': fkDef.target }
                        })
                    ])
                ]);
            }

            var heur = detectInputHeuristics(col);
            var baseAttrs = { name: field, gkey: 'crud:update-field', disabled: field === 'id' };
            if (heur.type === 'date') {
                return D.Div({ attrs: { class: 'flex flex-col gap-1.5', key: 'field-' + field } }, [
                    buildDateInputField(fieldLabel, field, record[field], baseAttrs)
                ]);
            }
            return D.Div({ attrs: { class: 'flex flex-col gap-1.5', key: 'field-' + field } }, [
                heur.isTextarea
                    ? D.Div({ attrs: { class: 'flex flex-col gap-1.5' } }, [
                        D.Label({ attrs: { class: 'text-sm font-medium text-[var(--foreground)]' } }, [fieldLabel]),
                        D.Textarea({
                            attrs: Object.assign({}, baseAttrs, {
                                value: record[field] || '',
                                class: 'flex w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all min-h-[96px]'
                            })
                        })
                    ])
                    : UC.FormInput({
                        name: field,
                        value: record[field],
                        key: 'crud:update-field',
                        label: fieldLabel,
                        attrs: Object.assign({}, baseAttrs, { type: heur.type })
                    })
            ]);
        }

        var translationCodes = Object.keys(translations || {});
        if (!translationCodes.length && (languages || []).length) {
            translationCodes = (languages || []).map(function (lang) { return lang.code || lang; }).filter(Boolean);
        }

        var orderedLangs = [];
        (languages || []).forEach(function (lang) {
            var code = lang.code || lang;
            if (translationCodes.includes(code)) {
                orderedLangs.push(lang);
            }
        });
        translationCodes.forEach(function (code) {
            if (!orderedLangs.some(function (lang) { return (lang.code || lang) === code; })) {
                orderedLangs.push({ code: code });
            }
        });

        function renderTranslationsInline() {
            var translationTableRows = orderedLangs.map(function (lang) {
                var code = lang.code || lang;
                var langTranslations = translations[code] || {};
                return D.Tr({ attrs: { class: 'border-b last:border-0 border-[var(--border)]' } }, [
                    D.Td({ attrs: { class: 'whitespace-nowrap text-sm font-semibold px-3 py-2 align-top' } }, [
                        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                            D.Span({}, [code.toUpperCase()]),
                            lang && lang.label ? D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, ['(' + lang.label + ')']) : null,
                            lang.direction === 'rtl' ? D.Span({ attrs: { class: 'text-[10px] text-[var(--muted-foreground)] border px-1 rounded' } }, ['RTL']) : null
                        ])
                    ]),
                    translationFields.map(function (field) {
                        return D.Td({ attrs: { class: 'px-3 py-2 align-top' } }, [
                            D.Input({
                                attrs: {
                                    class: 'w-full h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]',
                                    name: field,
                                    'data-lang': code,
                                    value: langTranslations[field] || '',
                                    gkey: 'crud:update-translation'
                                }
                            })
                        ]);
                    }),
                    D.Td({ attrs: { class: 'px-3 py-2 align-top text-right' } }, [
                        UC.Button({
                            key: 'crud:remove-translation-lang',
                            label: env.lang === 'ar' ? 'حذف' : 'Remove',
                            variant: 'ghost',
                            size: 'xs',
                            attrs: { 'data-lang': code, gkey: 'crud:remove-translation-lang' }
                        })
                    ])
                ]);
            });

            return D.Div({ attrs: { class: 'space-y-3' } }, [
                D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                    D.Div({ attrs: { class: 'flex items-center gap-2 text-sm font-semibold' } }, [
                        D.Span({}, [env.lang === 'ar' ? 'الترجمات' : 'Translations'])
                    ]),
                    D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                        D.Select({
                            attrs: {
                                class: 'h-9 w-40 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]',
                                name: 'new-lang-code',
                                gkey: 'crud:update-new-lang-code'
                            }
                        }, [
                            D.Option({ attrs: { value: '', disabled: true, selected: !data.newLangCode } }, [env.lang === 'ar' ? 'اختر لغة...' : 'Select language...'])
                        ].concat((data.systemLanguages || []).filter(function (l) {
                            return !(data.translations && data.translations[l.code]); // Filter out existing
                        }).map(function (l) {
                            return D.Option({ attrs: { value: l.code, selected: data.newLangCode === l.code } }, [l.label]);
                        }))),
                        UC.Button({ key: 'crud:add-translation-lang', label: env.lang === 'ar' ? 'إضافة' : 'Add', variant: 'outline', size: 'sm' })
                    ])
                ]),
                D.Div({ attrs: { class: 'overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, [
                    translationTableRows.length === 0 ? D.Div({ attrs: { class: 'p-3 text-sm text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'لا توجد ترجمات بعد.' : 'No translations yet.']) :
                        D.Table({ attrs: { class: 'w-full text-sm' } }, [
                            D.Thead({ attrs: { class: 'bg-[var(--surface-1)]' } }, [
                                D.Tr({}, [
                                    D.Th({ attrs: { class: 'px-3 py-2 text-left' } }, [env.lang === 'ar' ? 'اللغة' : 'Language']),
                                    translationFields.map(function (field) {
                                        return D.Th({ attrs: { class: 'px-3 py-2 text-left capitalize' } }, [field]);
                                    }),
                                    D.Th({ attrs: { class: 'px-3 py-2 text-left' } }, [env.lang === 'ar' ? 'إزالة' : 'Remove'])
                                ])
                            ]),
                            D.Tbody({}, translationTableRows)
                        ])
                ])
            ]);
        }

        function renderGroupTab(groupId) {
            var fields = groupedColumns[groupId] || [];
            var blocks = [];

            if (groupId === (groups[0] && groups[0].id)) {
                blocks.push(renderTranslationsInline());
            }

            if (!fields.length) {
                var fallbackFields = Object.keys(record || {}).filter(function (key) {
                    var value = record[key];
                    if (value === null || value === undefined) return false;
                    if (typeof value === 'object' && !fkFieldNames.has(key)) return false;
                    if (key === 'id' || key === 'company_id' || key === 'company') return false;
                    return !String(key).startsWith('_');
                });
                if (!fallbackFields.length) {
                    blocks.push(D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'لا توجد حقول قابلة للتحرير' : 'No editable fields']));
                } else {
                    blocks.push(D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-3' } }, fallbackFields.map(function (field) {
                        var pseudoCol = { name: field };
                        return renderFieldControl(pseudoCol);
                    })));
                }
            } else {
                blocks.push(D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-3' } }, fields.map(renderFieldControl)));
            }

            return D.Div({ attrs: { class: 'space-y-4' } }, blocks);
        }

        function renderFkQuickModal() {
            var quick = data.fkQuickModal || {};
            if (!quick.open) return null;
            var isAdd = quick.mode === 'add';

            function renderQuickValue(row, key) {
                if (!row) return '—';
                var value = row[key];
                if (key === '__display') {
                    return displayNameForRecord(row, quick.target, data.schemaInfo, env.lang) || value || row.display_name || row.name || '—';
                }
                if (value === null || value === undefined || value === '') return '—';
                if (typeof value === 'object') {
                    return value.display_name || value.name || value.label || value.title || value.code || value.id || '—';
                }
                return String(value);
            }

            function renderSearchResults() {
                if (quick.loading) {
                    return D.Div({ attrs: { class: 'flex items-center gap-2 text-sm text-[var(--muted-foreground)]' } }, [
                        D.Span({ attrs: { class: 'h-4 w-4 border-b-2 border-[var(--primary)] rounded-full animate-spin inline-block' } }, []),
                        D.Span({}, [env.lang === 'ar' ? 'جارٍ تحميل النتائج...' : 'Loading results...'])
                    ]);
                }

                var rows = quick.records || [];
                if (!rows.length) {
                    return D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg p-4' } }, [
                        env.lang === 'ar' ? 'لا توجد بيانات للعرض' : 'No records to display'
                    ]);
                }

                var columnsMeta = normalizeColumnsMeta(quick.columnsMeta || []);
                var availableKeys = new Set();
                rows.slice(0, 5).forEach(function (row) {
                    Object.keys(row || {}).forEach(function (key) { availableKeys.add(key); });
                });
                availableKeys.add('__display');
                var displayKey = getDisplayColumnKey(columnsMeta, availableKeys);
                var baseColumns = columnsMeta.length
                    ? columnsMeta.filter(function (col) {
                        if (!col || !col.name) return false;
                        if (col.name === 'id' || col.name === displayKey) return false;
                        if (isHiddenColumn(col.name)) return false;
                        return col.is_table_show !== false;
                    })
                    : Array.from(availableKeys).filter(function (key) {
                        if (!key || key === 'id' || key === displayKey) return false;
                        return !isHiddenColumn(key);
                    }).map(function (name) { return { name: name, labels: {} }; });

                var selectedColumns = [{ name: displayKey, label: env.lang === 'ar' ? 'الاسم' : 'Name' }];
                baseColumns.slice(0, 3).forEach(function (col) {
                    selectedColumns.push({
                        name: col.name,
                        label: resolveColumnLabel(col, env.lang) || col.name
                    });
                });

                var tableHead = D.Tr({}, selectedColumns.concat([{ name: '__actions' }]).map(function (col) {
                    if (col.name === '__actions') {
                        return D.Th({ attrs: { class: 'px-3 py-2 text-right' } }, [env.lang === 'ar' ? 'اختيار' : 'Select']);
                    }
                    return D.Th({ attrs: { class: 'px-3 py-2 text-right text-xs font-semibold text-[var(--muted-foreground)]' } }, [col.label]);
                }));

                var tableRows = rows.map(function (row) {
                    var id = row && (row.id || row.Id || row.uuid || row.uid);
                    return D.Tr({ attrs: { class: 'border-b border-[var(--border)] last:border-0' } }, selectedColumns.concat([{ name: '__actions' }]).map(function (col) {
                        if (col.name === '__actions') {
                            return D.Td({ attrs: { class: 'px-3 py-2 text-left' } }, [
                                UC.Button({
                                    key: 'crud:select-fk-quick-option',
                                    icon: '✅',
                                    label: env.lang === 'ar' ? 'تعيين' : 'Set',
                                    size: 'xs',
                                    variant: 'outline',
                                    attrs: { 'data-value': id, 'data-label': displayNameForRecord(row, quick.target, data.schemaInfo, env.lang) || id, 'data-field': quick.field }
                                })
                            ]);
                        }
                        return D.Td({ attrs: { class: 'px-3 py-2 text-right text-sm' } }, [renderQuickValue(row, col.name)]);
                    }));
                });

                return D.Div({ attrs: { class: 'space-y-3' } }, [
                    UI.SearchBar({
                        value: quick.search || '',
                        placeholder: env.lang === 'ar' ? 'ابحث في السجلات المرتبطة' : 'Search related records',
                        onInput: 'crud:update-fk-quick-search',
                        attrs: { 'data-field': quick.field }
                    }),
                    D.Div({ attrs: { class: 'overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, [
                        D.Table({ attrs: { class: 'w-full text-sm' } }, [
                            D.Thead({ attrs: { class: 'bg-[var(--surface-1)]' } }, [tableHead]),
                            D.Tbody({}, tableRows)
                        ])
                    ])
                ]);
            }

            function renderQuickAddFields() {
                if (quick.loading) {
                    return D.Div({ attrs: { class: 'flex items-center gap-2 text-sm text-[var(--muted-foreground)]' } }, [
                        D.Span({ attrs: { class: 'h-4 w-4 border-b-2 border-[var(--primary)] rounded-full animate-spin inline-block' } }, []),
                        D.Span({}, [env.lang === 'ar' ? 'جارٍ تجهيز نموذج الإدخال...' : 'Preparing insert form...'])
                    ]);
                }
                var columnsMeta = normalizeColumnsMeta(quick.columnsMeta || []);
                var fkDefs = collectFkDefs(data.schemaInfo, quick.target, []);
                var fkOptions = quick.fkOptions || {};
                var editableColumns = columnsMeta.filter(function (col) {
                    return col && col.name && col.name !== 'id' && col.is_edit_show !== false && col.source !== 'lang';
                });

                function renderQuickField(col) {
                    var field = col.name;
                    var fieldLabel = resolveColumnLabel(col, env.lang);
                    var options = fkOptions[field] || [];
                    var baseAttrs = { 'data-field': field, name: field, gkey: 'crud:update-fk-quick-field' };

                    if (options.length) {
                        var selectedVal = quick.record && quick.record[field];
                        if (selectedVal && typeof selectedVal === 'object') { selectedVal = selectedVal.id; }
                        var normalizedSelected = selectedVal === null || selectedVal === undefined ? '' : String(selectedVal);
                        var fkDef = fkDefs.find(function (fk) { return fk.name === field; }) || {};
                        return D.Div({ attrs: { class: 'flex flex-col gap-1.5' } }, [
                            D.Label({ attrs: { class: 'text-sm font-medium text-[var(--foreground)]' } }, [fieldLabel]),
                            D.Select({
                                attrs: Object.assign({}, baseAttrs, {
                                    value: normalizedSelected,
                                    class: 'flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all'
                                })
                            }, [
                                D.Option({ attrs: { value: '' } }, [env.lang === 'ar' ? 'اختر قيمة' : 'Select value']),
                                options.map(function (opt) { return D.Option({ attrs: { value: opt.value, selected: opt.value === normalizedSelected ? 'selected' : undefined } }, [opt.label]); })
                            ]),
                            D.Div({ attrs: { class: 'flex gap-2 flex-wrap' } }, [
                                UC.Button({
                                    key: 'crud:open-fk-search',
                                    icon: '🔎',
                                    label: env.lang === 'ar' ? 'بحث' : 'Search',
                                    size: 'xs',
                                    variant: 'ghost',
                                    attrs: { 'data-field': field, 'data-target': fkDef.target, 'data-options-key': field }
                                }),
                                UC.Button({
                                    key: 'crud:open-fk-quick-add',
                                    icon: '✨',
                                    label: env.lang === 'ar' ? 'إدراج' : 'Add',
                                    size: 'xs',
                                    variant: 'outline',
                                    attrs: { 'data-field': field, 'data-target': fkDef.target }
                                })
                            ])
                        ]);
                    }

                    var heur = detectInputHeuristics(col);
                    if (heur.type === 'date') {
                        return buildDateInputField(fieldLabel, field, quick.record && quick.record[field], baseAttrs);
                    }
                    if (heur.isTextarea) {
                        return D.Div({ attrs: { class: 'flex flex-col gap-1.5' } }, [
                            D.Label({ attrs: { class: 'text-sm font-medium text-[var(--foreground)]' } }, [fieldLabel]),
                            D.Textarea({
                                attrs: Object.assign({}, baseAttrs, {
                                    value: quick.record && quick.record[field] || '',
                                    class: 'flex w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all min-h-[96px]'
                                })
                            })
                        ]);
                    }
                    return UC.FormInput({
                        name: field,
                        value: quick.record && quick.record[field],
                        key: 'crud:update-fk-quick-field',
                        label: fieldLabel,
                        attrs: Object.assign({}, baseAttrs, { type: heur.type })
                    });
                }

                var translationsFields = quick.translationFields || [];
                var langs = (quick.languages && quick.languages.length) ? quick.languages : data.languages || [];
                if (!langs.length && quick.translations) {
                    langs = Object.keys(quick.translations).map(function (code) { return { code: code }; });
                }

                var translationSection = translationsFields.length ? D.Div({ attrs: { class: 'space-y-2' } }, [
                    D.Div({ attrs: { class: 'text-sm font-semibold text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'حقول الترجمة' : 'Translations']),
                    D.Div({ attrs: { class: 'space-y-3' } }, langs.map(function (lang) {
                        var code = lang.code || lang.id || lang;
                        var langEntry = (quick.translations && quick.translations[code]) || {};
                        return D.Div({ attrs: { class: 'grid gap-3', style: 'grid-template-columns: repeat(' + Math.max(1, translationsFields.length) + ', minmax(0,1fr));' } }, translationsFields.map(function (field) {
                            return UC.FormInput({
                                name: field,
                                value: langEntry[field] || '',
                                key: 'crud:update-fk-quick-translation',
                                label: (lang.label ? lang.label + ' • ' : '') + field,
                                attrs: { 'data-lang': code, 'data-field': field, gkey: 'crud:update-fk-quick-translation' }
                            });
                        }));
                    }))
                ]) : null;

                return D.Div({ attrs: { class: 'space-y-4' } }, [
                    D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [
                        env.lang === 'ar' ? 'إدراج كامل من دون مغادرة الشاشة الحالية.' : 'Full insert without leaving the current screen.'
                    ]),
                    editableColumns.length
                        ? D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-3' } }, editableColumns.map(renderQuickField))
                        : D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'لا توجد حقول للإدخال.' : 'No editable fields.']),
                    translationSection,
                    D.Div({ attrs: { class: 'flex items-center justify-end gap-2' } }, [
                        UC.Button({ key: 'crud:close-fk-quick-modal', label: env.lang === 'ar' ? 'إلغاء' : 'Cancel', variant: 'ghost' }),
                        UC.Button({ key: 'crud:save-fk-quick-add', label: env.lang === 'ar' ? 'حفظ' : 'Save', icon: '💾', variant: 'primary' })
                    ])
                ]);
            }

            var modalTitle = isAdd ? (env.lang === 'ar' ? 'إدراج مرتبط' : 'Quick linked insert') : (env.lang === 'ar' ? 'بحث متقدم' : 'Advanced search');
            return D.Div({
                attrs: {
                    class: 'fixed inset-0 z-50 flex items-center justify-center bg-black/50'
                }
            }, [
                D.Div({
                    attrs: { class: 'bg-[var(--card)] text-[var(--foreground)] rounded-xl shadow-xl w-full max-w-5xl p-6 space-y-4 border border-[var(--border)]' }
                }, [
                    D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                        D.Div({ attrs: { class: 'flex items-center gap-2 text-lg font-semibold' } }, [
                            D.Span({}, [isAdd ? '✨' : '🔎']),
                            D.Span({}, [modalTitle]),
                            quick.target ? UI.Badge({ text: quick.target, variant: 'badge/ghost' }) : null
                        ]),
                        UC.Button({ key: 'crud:close-fk-quick-modal', label: '×', variant: 'ghost' })
                    ]),
                    isAdd ? renderQuickAddFields() : renderSearchResults()
                ])
            ]);
        }

        var tabButtons = formTabs.map(function (tab) {
            var isActive = tab.id === activeTab;
            return D.Button({
                attrs: {
                    type: 'button',
                    gkey: 'crud:switch-form-tab',
                    'data-tab': tab.id,
                    class: 'px-3 py-1.5 rounded-full text-sm border ' + (isActive ? 'border-[var(--primary)] text-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]' : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-1)]')
                }
            }, [tab.label]);
        });

        var activeContent = renderGroupTab(activeTab);

        return D.Div({ attrs: { class: 'space-y-4' } }, [
            D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                D.Div({ attrs: { class: 'flex flex-col' } }, [
                    D.Div({ attrs: { class: 'text-lg font-semibold' } }, [data.formMode === 'create' ? (env.lang === 'ar' ? 'إنشاء سجل جديد' : 'Create record') : (env.lang === 'ar' ? 'تعديل السجل' : 'Edit record')]),
                    record.id ? D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [String(record.id)]) : null
                ]),
                D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                    UC.Button({
                        key: 'crud:close-modal',
                        label: env.lang === 'ar' ? 'إلغاء' : 'Cancel',
                        variant: 'ghost',
                        attrs: { gkey: 'crud:close-modal' }
                    }),
                    UC.Button({
                        key: 'crud:save-record',
                        label: env.lang === 'ar' ? 'حفظ' : 'Save',
                        icon: data.saving ? '⏳' : '💾',
                        variant: 'primary',
                        attrs: { disabled: data.saving, gkey: 'crud:save-record' }
                    })
                ])
            ]),

            D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, tabButtons),

            D.Div({ attrs: { class: 'p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] space-y-3' } }, [
                activeContent
            ]),
            renderFkQuickModal()
        ]);
    }

    function renderFormModal(db) {
        var title = db.data.formMode === 'create'
            ? (db.env.lang === 'ar' ? 'إضافة سجل جديد' : 'Add new record')
            : (db.env.lang === 'ar' ? 'تعديل السجل' : 'Edit record');
        return UI.Modal({
            open: !!db.data.showFormModal,
            title: title,
            size: 'full',
            closeGkey: 'crud:close-modal',
            content: renderRecordEditor(db)
        });
    }

    function renderRecordInfoModal(db) {
        var data = db.data;
        var env = db.env;
        if (!data.showInfoModal || !data.selectedRecord) return null;
        var record = data.selectedRecord;
        var activeTable = data.recordTable || data.activeTable;
        var rawColumnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
        var columnsMeta = enrichColumnsWithSchema(rawColumnsMeta, data.schemaInfo, activeTable);
        var groups = getTableGroups(activeTable, data.schemaInfo, env.lang);
        var grouped = {};
        columnsMeta.forEach(function (col) {
            if (!col || !col.name || col.is_table_show === false) return;
            var g = col.group || (groups[0] && groups[0].id) || 'basic';
            if (!grouped[g]) grouped[g] = [];
            grouped[g].push(col);
        });

        function renderValue(field) {
            var value = record[field];
            if (value === null || value === undefined || value === '') return '—';

            // If value is already an object, extract display name (same as table logic)
            if (typeof value === 'object') {
                return displayNameForRecord(value, activeTable, data.schemaInfo, env.lang)
                    || value.display_name || value.name || value.label || value.title || value.code
                    || value.id || value.uuid || '—';
            }

            // Try to find embedded FK object (e.g., record.area for area_id)
            if (field.endsWith('_id')) {
                var fkObjKey = field.replace(/_id$/, '');
                var fkObj = record[fkObjKey];
                if (fkObj && typeof fkObj === 'object') {
                    return displayNameForRecord(fkObj, activeTable, data.schemaInfo, env.lang)
                        || fkObj.display_name || fkObj.name || fkObj.label || fkObj.title || fkObj.code
                        || value;
                }
            }

            return String(value);
        }

        var sections = groups.map(function (group) {
            var fields = grouped[group.id] || [];
            if (!fields.length) return null;
            return D.Div({ attrs: { class: 'space-y-2' } }, [
                D.Div({ attrs: { class: 'text-sm font-semibold text-[var(--muted-foreground)]' } }, [group.label]),
                D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-3' } }, fields.map(function (col) {
                    return D.Div({ attrs: { class: 'border border-[var(--border)] rounded-lg p-3 bg-[var(--surface-1)]' } }, [
                        D.Div({ attrs: { class: 'text-xs uppercase tracking-wide text-[var(--muted-foreground)]' } }, [resolveColumnLabel(col, env.lang)]),
                        D.Div({ attrs: { class: 'font-semibold text-[var(--foreground)]' } }, [renderValue(col.name)])
                    ]);
                }))
            ]);
        }).filter(Boolean);

        if (!sections.length) {
            var fallbackFields = Object.keys(record || {}).filter(function (key) {
                return !String(key || '').startsWith('_') && key !== 'company_id' && key !== 'company';
            });
            sections.push(D.Div({ attrs: { class: 'space-y-2' } }, [
                D.Div({ attrs: { class: 'text-sm font-semibold text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'تفاصيل' : 'Details']),
                D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-3' } }, fallbackFields.map(function (field) {
                    return D.Div({ attrs: { class: 'border border-[var(--border)] rounded-lg p-3 bg-[var(--surface-1)]' } }, [
                        D.Div({ attrs: { class: 'text-xs uppercase tracking-wide text-[var(--muted-foreground)]' } }, [field]),
                        D.Div({ attrs: { class: 'font-semibold text-[var(--foreground)] break-words' } }, [renderValue(field)])
                    ]);
                }))
            ]));
        }

        var recordId = record.id || record.Id || record.uuid || record.uid;

        // Dynamic Title Resolution
        var tableDef = (data.schemaInfo && data.schemaInfo.tableMap && data.schemaInfo.tableMap[activeTable]) || { name: activeTable };
        var activeLabels = resolveTableLabels(tableDef);
        var tableDisplayName = activeLabels[env.lang] || activeLabels.ar || activeLabels.en || activeTable;
        var modalTitle = tableDisplayName + ' : ' + (record.display_name || record.name || record.code || recordId);

        return UI.Modal({
            open: !!data.showInfoModal,
            title: modalTitle,
            size: 'xl',
            closeGkey: 'crud:close-modal',
            content: D.Div({ attrs: { class: 'space-y-4' } }, sections),
            actions: [
                UC.Button({ key: 'crud:print-record', label: env.lang === 'ar' ? 'طباعة' : 'Print', icon: '🖨️', variant: 'outline', attrs: { 'data-record-id': recordId, 'data-table': activeTable } }),
                UC.Button({ key: 'crud:open-edit-modal', label: env.lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'primary', attrs: { 'data-record-id': recordId, 'data-table': activeTable } }),
                UC.Button({ key: 'crud:delete-record', label: env.lang === 'ar' ? 'حذف' : 'Delete', icon: '🗑️', variant: 'danger', attrs: { 'data-record-id': recordId, 'data-table': activeTable } }),
                UC.Button({ key: 'crud:close-modal', label: env.lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })
            ]
        });
    }

    function buildChildColumnsForModal(item, env, schemaInfo) {
        var rows = item.records || [];
        var firstRow = rows[0] || {};
        var availableKeys = new Set(Object.keys(firstRow || {}));
        availableKeys.add('__display');
        var columnsMeta = normalizeColumnsMeta(item.columnsMeta || []);
        var displayKey = getDisplayColumnKey(columnsMeta, availableKeys);
        var columns = [{ key: displayKey, label: env.lang === 'ar' ? 'الاسم' : 'Name', isDisplay: true }];

        var baseColumns = [];
        if (columnsMeta.length) {
            baseColumns = columnsMeta.filter(function (col) {
                if (!col || !col.name) return false;
                if (col.name === 'id' || col.name === displayKey || col.name === 'display_name') return false;
                if (col.is_table_show === false) return false;
                if (!availableKeys.has(col.name)) return false;
                return !isHiddenColumn(col.name);
            }).map(function (col) { return { key: col.name, label: resolveColumnLabel(col, env.lang) }; });
        } else {
            baseColumns = Array.from(availableKeys).filter(function (key) {
                if (key === 'id' || key === displayKey || key === 'display_name') return false;
                return !isHiddenColumn(key);
            }).map(function (key) { return { key: key, label: key }; });
        }

        baseColumns.slice(0, 4).forEach(function (col) { columns.push(col); });
        columns.push({ key: '__child_actions', label: env.lang === 'ar' ? 'روابط' : 'Relations' });

        return { columns: columns, displayKey: displayKey };
    }

    function renderChildCrudModals(db) {
        var stack = db.data.childCrudStack || [];
        if (!stack.length) return null;
        var env = db.env;
        var schemaInfo = db.data.schemaInfo;

        return stack.map(function (item, idx) {
            var titleLabels = resolveTableLabels(schemaInfo && schemaInfo.tableMap ? schemaInfo.tableMap[item.table] : { name: item.table });
            var modalTitle = (titleLabels[env.lang] || titleLabels.ar || titleLabels.en || item.table) + (item.parentLabel ? ' ↦ ' + item.parentLabel : '');
            var relations = findChildRelations(schemaInfo, item.table);
            var workingRows = item.search ? filterRecordsByTerm(item.records, item.search, env.lang, item.columnsMeta) : (item.records || []);
            var mergedRows = mergeDisplayRows(workingRows, env.lang).map(formatRowForDisplay);
            var columnsInfo = buildChildColumnsForModal(item, env, schemaInfo);

            function renderValue(row, key) {
                if (key === columnsInfo.displayKey || key === '__display') {
                    return displayNameForRecord(row, item.table, schemaInfo, env.lang) || row.name || row.label || row.title || row.code || '—';
                }
                var value = row[key];
                if (value === null || value === undefined || value === '') return '—';
                if (typeof value === 'object') {
                    return value.display_name || value.name || value.label || value.title || value.code || value.id || '—';
                }
                return String(value);
            }

            var rows = mergedRows.length ? mergedRows.map(function (row, rowIdx) {
                var rowId = String(row.id || row.Id || row.uuid || row.uid || rowIdx);
                return D.Tr({ attrs: { class: 'border-b last:border-0 border-[var(--border)]' } }, columnsInfo.columns.map(function (col) {
                    if (col.key === '__child_actions') {
                        if (!relations.length) {
                            return D.Td({ attrs: { class: 'px-2 py-2 text-xs text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'لا توجد روابط' : 'No relations']);
                        }
                        return D.Td({ attrs: { class: 'px-2 py-2' } }, [
                            D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, relations.map(function (rel) {
                                var label = rel.labels && (rel.labels[env.lang] || rel.labels.ar || rel.labels.en) || rel.table;
                                return UC.Button({
                                    key: 'open-child-' + rel.table + '-' + rowId,
                                    icon: rel.icon || '🗂️',
                                    label: label,
                                    size: 'xs',
                                    variant: 'ghost',
                                    attrs: {
                                        gkey: 'crud:open-child-table',
                                        'data-child-table': rel.table,
                                        'data-parent-field': rel.column,
                                        'data-parent-id': rowId,
                                        'data-parent-table': item.table,
                                        'data-child-stack-index': idx
                                    }
                                });
                            }))
                        ]);
                    }
                    return D.Td({ attrs: { class: 'px-2 py-2 text-sm' } }, [renderValue(row, col.key)]);
                }));
            }) : [
                D.Tr({}, [
                    D.Td({ attrs: { class: 'px-3 py-4 text-sm text-[var(--muted-foreground)]', colSpan: columnsInfo.columns.length } }, [
                        item.loading ? (env.lang === 'ar' ? 'جارٍ تحميل السجلات...' : 'Loading records...') :
                            (env.lang === 'ar' ? 'لا توجد سجلات مرتبطة' : 'No related records yet')
                    ])
                ])
            ];

            var headerBadges = D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, [
                item.parentLabel ? UI.Badge({ text: env.lang === 'ar' ? 'الأصل: ' + item.parentLabel : 'Parent: ' + item.parentLabel, variant: 'badge/ghost' }) : null,
                UI.Badge({ text: env.lang === 'ar' ? 'مفتاح الربط: ' + item.parentField : 'Join key: ' + item.parentField, variant: 'badge/outline' })
            ].filter(Boolean));

            var content = D.Div({ attrs: { class: 'space-y-3' } }, [
                headerBadges,
                D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, [
                    UC.FormInput({
                        name: 'child-search-' + idx,
                        value: item.search || '',
                        key: 'crud:update-child-search',
                        label: env.lang === 'ar' ? 'بحث سريع' : 'Quick search',
                        placeholder: env.lang === 'ar' ? 'ابحث في السجلات المرتبطة' : 'Search related records',
                        attrs: { 'data-child-index': idx }
                    }),
                    UC.Button({
                        key: 'refresh-child-' + idx,
                        label: env.lang === 'ar' ? 'تحديث' : 'Refresh',
                        icon: '🔄',
                        variant: 'outline',
                        size: 'sm',
                        attrs: { 'data-child-index': idx, gkey: 'crud:reload-child-modal' }
                    })
                ]),
                item.error ? D.Div({ attrs: { class: 'p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm' } }, [item.error]) : null,
                D.Div({ attrs: { class: 'overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)]' } }, [
                    D.Table({ attrs: { class: 'w-full text-sm' } }, [
                        D.Thead({ attrs: { class: 'bg-[var(--surface-1)]' } }, [
                            D.Tr({}, columnsInfo.columns.map(function (col) {
                                return D.Th({ attrs: { class: 'px-2 py-2 text-right text-xs text-[var(--muted-foreground)]' } }, [col.label]);
                            }))
                        ]),
                        D.Tbody({}, rows)
                    ])
                ])
            ].filter(Boolean));

            return UI.Modal({
                open: true,
                title: modalTitle,
                size: 'full',
                closeGkey: 'crud:close-child-modal',
                content: content,
                actions: [
                    UC.Button({ key: 'crud:close-child-modal', label: env.lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost', attrs: { 'data-child-index': idx } })
                ]
            });
        });
    }

    // ============================================================================
    // RENDERER (The View)
    // ============================================================================

    function renderNotifications(data, env) {
        var notes = data.notifications || [];
        if (!notes.length) return null;

        var tone = {
            success: 'border-green-300 bg-green-50 text-green-900',
            error: 'border-rose-300 bg-rose-50 text-rose-900',
            warning: 'border-amber-300 bg-amber-50 text-amber-900',
            info: 'border-blue-300 bg-blue-50 text-blue-900'
        };

        // Use fixed positioning and high z-index to overlay above modals
        return D.Div({
            attrs: {
                class: 'fixed top-4 right-4 z-[200] w-80 space-y-2 pointer-events-none'
            }
        }, notes.map(function (note) {
            var style = tone[note.type] || tone.info;
            return D.Div({
                attrs: {
                    class: 'flex items-start justify-between gap-3 rounded-md border px-3 py-2 shadow-xl pointer-events-auto ' + style,
                    'data-id': note.id
                }
            }, [
                D.Div({ attrs: { class: 'text-sm leading-6' } }, [note.message]),
                UC.Button({
                    key: 'crud:dismiss-notification',
                    icon: '✕',
                    size: 'sm',
                    variant: 'ghost',
                    attrs: { 'data-id': note.id, 'aria-label': env.lang === 'ar' ? 'إغلاق' : 'Close' }
                })
            ]);
        }));
    }

    function renderBreadcrumbs(db) {
        var crumbs = db.data.breadcrumbs || [];
        if (!crumbs.length) return null;

        return D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]' } }, crumbs.map(function (crumb, idx) {
            var last = idx === crumbs.length - 1;
            return D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                D.Span({ attrs: { class: 'flex items-center gap-1 ' + (last ? 'text-[var(--foreground)] font-semibold' : '') } }, [
                    crumb.icon ? D.Span({}, [crumb.icon]) : null,
                    D.Span({}, [crumb.label])
                ].filter(Boolean)),
                last ? null : D.Span({}, ['›'])
            ]);
        }));
    }

    function renderTablesGrid(modules, activeTable, lang) {
        if (!modules || !modules.length) return null;
        return D.Div({ attrs: { class: 'grid lg:grid-cols-2 xl:grid-cols-3 gap-4' } }, modules.map(function (module) {
            var label = module.labels[lang] || module.labels.ar || module.labels.en || module.id;
            var sections = [];
            var directTables = module.tables || [];
            if (directTables.length) {
                sections.push({ label: label, icon: module.icon, tables: directTables });
            }
            (module.children || []).forEach(function (child) {
                if (child && child.tables && child.tables.length) {
                    var childLabel = child.labels[lang] || child.labels.ar || child.labels.en || child.id;
                    sections.push({ label: childLabel, icon: child.icon, tables: child.tables });
                }
            });
            if (!sections.length) return null;

            return D.Div({ attrs: { class: 'border border-[var(--border)] rounded-2xl bg-[var(--card)] p-4 space-y-4 shadow-sm' } }, [
                D.Div({ attrs: { class: 'flex items-center gap-3 text-[var(--foreground)] font-bold text-lg' } }, [
                    D.Span({ attrs: { class: 'text-3xl' } }, [module.icon || '📁']),
                    D.Span({}, [label])
                ]),
                sections.map(function (section) {
                    return D.Div({ attrs: { class: 'space-y-2' } }, [
                        D.Div({ attrs: { class: 'flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]' } }, [
                            D.Span({}, [section.icon || '🗂️']),
                            D.Span({}, [section.label])
                        ]),
                        D.Div({ attrs: { class: 'grid grid-cols-2 gap-2' } }, section.tables.map(function (table) {
                            var tLabel = table.labels[lang] || table.labels.ar || table.labels.en || table.label || table.id;
                            var isActive = table.id === activeTable;
                            return D.Button({
                                attrs: {
                                    type: 'button',
                                    gkey: 'crud:select-table',
                                    'data-table': table.id,
                                    class: 'flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-3 text-sm ' + (isActive ? 'bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-[var(--primary)]' : 'hover:bg-[var(--surface-1)] text-[var(--foreground)]')
                                }
                            }, [
                                D.Span({}, [table.icon || '🗂️']),
                                D.Span({ attrs: { class: 'truncate' } }, [tLabel])
                            ]);
                        }))
                    ]);
                })
            ]);
        }).filter(Boolean));
    }

    function renderSidebar(db) {
        var data = db.data;
        var env = db.env;
        var modules = data.modules || [];
        var isCollapsed = data.sidebarCollapsed;
        var sidebarWidth = isCollapsed ? 'w-20' : 'w-80';
        var companyName = data.companyInfo && data.companyInfo.name ? data.companyInfo.name : null;
        var searchTerm = String(data.sidebarSearch || '').trim().toLowerCase();
        var screenTabs = getDynamicTabs(db);

        function matches(text) {
            if (!searchTerm) return true;
            return String(text || '').toLowerCase().indexOf(searchTerm) !== -1;
        }

        // Recursive function to render module and its children
        function renderModule(module, depth) {
            if (isCollapsed) return null; // Hide modules when collapsed

            depth = depth || 0;
            var label = module.labels[env.lang] || module.labels.ar || module.labels.en || module.id;
            var open = data.moduleOpen[module.id] !== false;
            var paddingClass = depth > 0 ? 'ml-' + (depth * 2) : '';

            var hasChildren = module.children && module.children.length > 0;
            var tables = (module.tables || []).filter(function (item) {
                var itemLabel = item.labels[env.lang] || item.labels.ar || item.labels.en || item.label || item.id;
                return matches(itemLabel);
            });
            var hasTables = tables.length > 0;
            var visibleChildren = (module.children || []).map(function (child) {
                return renderModule(child, depth + 1);
            }).filter(Boolean);

            // If no content (tables or children), hide the module unless specifically searching for it
            if (!hasTables && !visibleChildren.length) {
                if (!searchTerm) return null;
                if (!matches(label)) return null;
            }

            return D.Div({ attrs: { class: 'border border-[var(--border)] rounded-lg overflow-hidden mb-2 shadow-sm ' + paddingClass } }, [
                D.Button({
                    attrs: {
                        type: 'button',
                        gkey: 'crud:toggle-module',
                        'data-module': module.id,
                        class: 'w-full flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-[var(--surface-1)] to-[var(--card)] text-sm font-semibold text-[var(--foreground)] hover:from-[var(--surface-2)] hover:to-[var(--surface-1)] transition-all'
                    }
                }, [
                    D.Div({ attrs: { class: 'flex items-center gap-3' } }, [
                        D.Span({ attrs: { class: 'text-2xl' } }, [module.icon || '📁']),
                        D.Span({ attrs: { class: 'font-bold' } }, [label]),
                        hasTables ? D.Span({ attrs: { class: 'text-xs bg-[var(--primary)] text-white px-2 py-0.5 rounded-full font-normal' } }, [tables.length]) : null
                    ].filter(Boolean)),
                    D.Span({ attrs: { class: 'text-lg text-[var(--muted-foreground)]' } }, [open ? '▾' : '▸'])
                ]),
                open ? D.Div({ attrs: { class: 'flex flex-col bg-[var(--card)]' } }, [
                    // Render tables if any
                    hasTables ? tables.map(function (item) {
                        var isActive = item.id === data.activeTable;
                        var itemLabel = item.labels[env.lang] || item.labels.ar || item.labels.en || item.label || item.id;
                        return D.Button({
                            attrs: {
                                type: 'button',
                                gkey: 'crud:select-table',
                                'data-table': item.id,
                                class: [
                                    'w-full flex items-center gap-3 px-4 py-3 text-sm transition-all border-t border-[var(--border)]',
                                    isActive
                                        ? 'bg-[var(--primary)] text-white font-semibold shadow-md'
                                        : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-1)] hover:text-[var(--foreground)] hover:translate-x-1'
                                ].join(' ')
                            }
                        }, [
                            D.Span({ attrs: { class: 'text-xl flex-shrink-0' } }, [item.icon || '🗂️']),
                            D.Span({ attrs: { class: 'flex-1 text-start truncate' } }, [itemLabel]),
                            isActive ? D.Span({ attrs: { class: 'text-lg' } }, ['●']) : null
                        ].filter(Boolean));
                    }) : null,
                    // Render children modules recursively
                    hasChildren ? D.Div({ attrs: { class: 'px-3 py-3 space-y-2 bg-[var(--surface-0)]' } }, visibleChildren) : null
                ].filter(Boolean)) : null
            ]);
        }

        var brandName = companyName || resolveRootModuleLabel(db);

        return D.Aside({
            attrs: {
                class: sidebarWidth + ' bg-gradient-to-b from-[var(--card)] to-[var(--surface-1)] border-e border-[var(--border)] flex flex-col h-screen shadow-xl transition-all duration-300 relative'
            }
        }, [
            // Header with branding
            D.Div({
                attrs: {
                    class: 'flex items-center justify-between gap-3 p-4 border-b border-[var(--border)] bg-gradient-to-r from-[var(--primary)] to-[color-mix(in_oklab,var(--primary)_80%,#8b5cf6)] cursor-pointer',
                    gkey: 'crud:navigate-home',
                    title: env.lang === 'ar' ? 'الصفحة الرئيسية' : 'Home'
                }
            }, [
                D.Div({ attrs: { class: 'flex items-center gap-3 flex-1' } }, [
                    D.Div({
                        attrs: {
                            class: 'w-12 h-12 rounded-xl bg-white flex items-center justify-center text-[var(--primary)] font-bold text-xl shadow-lg'
                        }
                    }, ['FN']),
                    !isCollapsed ? D.Div({}, [
                        D.Div({ attrs: { class: 'font-bold text-lg text-white' } }, [brandName]),
                        D.Div({ attrs: { class: 'text-white/80 text-xs' } }, [resolveModuleLabelById(db, 'financial_operations') || ''])
                    ]) : null
                ].filter(Boolean)),
                !isCollapsed ? D.Button({
                    attrs: {
                        type: 'button',
                        gkey: 'crud:toggle-sidebar',
                        class: 'text-white/80 hover:text-white text-lg transition-colors',
                        title: env.lang === 'ar' ? 'طي القائمة' : 'Collapse'
                    }
                }, ['◀']) : null
            ]),

            // Collapsed expand button
            isCollapsed ? D.Button({
                attrs: {
                    type: 'button',
                    gkey: 'crud:toggle-sidebar',
                    class: 'absolute top-4 -right-3 w-6 h-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs shadow-lg hover:scale-110 transition-transform z-50',
                    title: env.lang === 'ar' ? 'توسيع القائمة' : 'Expand'
                }
            }, ['▶']) : null,

            !isCollapsed ? D.Div({ attrs: { class: 'px-4 pt-4' } }, [
                UI.SearchBar ? UI.SearchBar({
                    value: data.sidebarSearch || '',
                    placeholder: env.lang === 'ar' ? 'بحث في الشاشات والإعدادات' : 'Search screens & settings',
                    onInput: 'crud:update-sidebar-search',
                    attrs: { class: 'w-full' }
                }) : UC.FormInput({
                    name: 'sidebar-search',
                    value: data.sidebarSearch || '',
                    key: 'crud:update-sidebar-search',
                    label: env.lang === 'ar' ? 'بحث' : 'Search',
                    placeholder: env.lang === 'ar' ? 'اكتب للبحث' : 'Type to search'
                })
            ]) : null,

            !isCollapsed ? D.Div({ attrs: { class: 'px-4 pt-4 pb-2' } }, [
                D.Div({ attrs: { class: 'text-xs uppercase tracking-wider text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'الشاشات الرئيسية' : 'Main Screens'])
            ]) : null,

            !isCollapsed ? D.Div({ attrs: { class: 'px-4 space-y-2' } }, screenTabs.filter(function (tab) {
                return tab.id !== 'settings' && matches(tab.label);
            }).map(function (tab) {
                var isActive = data.activeScreen === tab.id;
                return D.Button({
                    attrs: {
                        type: 'button',
                        gkey: 'crud:switch-screen',
                        'data-screen': tab.id,
                        class: 'w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all ' +
                            (isActive ? 'border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-1)]')
                    }
                }, [
                    D.Span({ attrs: { class: 'text-xl' } }, [tab.icon || '•']),
                    D.Span({ attrs: { class: 'font-semibold' } }, [tab.label])
                ]);
            })) : null,

            // Modules navigation
            isCollapsed ?
                // Collapsed icons only
                D.Div({ attrs: { class: 'flex-1 overflow-y-auto py-4 px-2 space-y-4' } }, [
                    D.Div({ attrs: { class: 'space-y-2' } }, screenTabs.filter(function (tab) {
                        return tab.id !== 'settings';
                    }).map(function (tab) {
                        var isActive = data.activeScreen === tab.id;
                        return D.Button({
                            attrs: {
                                type: 'button',
                                gkey: 'crud:switch-screen',
                                'data-screen': tab.id,
                                class: 'w-full flex items-center justify-center text-2xl py-2 rounded-lg transition-all ' +
                                    (isActive ? 'bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[var(--primary)]' : 'hover:bg-[var(--surface-1)]'),
                                title: tab.label
                            }
                        }, [tab.icon || '•']);
                    })),
                    D.Div({ attrs: { class: 'space-y-2' } }, modules.map(function (module) {
                        return D.Button({
                            attrs: {
                                type: 'button',
                                gkey: 'crud:toggle-module',
                                'data-module': module.id,
                                class: 'w-full flex items-center justify-center text-3xl py-3 rounded-lg hover:bg-[var(--surface-1)] transition-all',
                                title: (module.labels[env.lang] || module.labels.ar || module.labels.en || module.id)
                            }
                        }, [module.icon || '📁']);
                    }))
                ])
                :
                // Full sidebar
                D.Div({ attrs: { class: 'flex-1 overflow-y-auto p-4 space-y-3' } }, [
                    D.Div({ attrs: { class: 'text-xs uppercase tracking-wider text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'إعدادات النظام' : 'System Settings']),
                    modules.map(function (module) {
                        return renderModule(module, 0);
                    }).filter(Boolean)
                ]),

            // Footer
            !isCollapsed ? D.Div({
                attrs: {
                    class: 'border-t border-[var(--border)] p-4 bg-[var(--surface-0)]'
                }
            }, [
                D.Div({ attrs: { class: 'text-xs text-[var(--muted-foreground)] text-center' } }, [
                    '© 2025 ' + (brandName || 'Finance')
                ])
            ]) : null
        ]);
    }

    function renderQuickActions(db) {
        var tabs = getDynamicTabs(db).filter(function (tab) { return tab.id !== 'home' && tab.id !== 'settings'; });
        if (!tabs.length) return null;

        return D.Div({ attrs: { class: 'grid md:grid-cols-3 gap-3' } }, tabs.map(function (tab) {
            return D.Button({
                attrs: {
                    type: 'button',
                    class: 'rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm hover:shadow-md transition-all text-left',
                    gkey: 'crud:switch-screen',
                    'data-screen': tab.id
                }
            }, [
                D.Div({ attrs: { class: 'text-2xl mb-2' } }, [tab.icon || '🗂️']),
                D.Div({ attrs: { class: 'font-semibold text-lg mb-1' } }, [tab.label])
            ]);
        }));
    }

    function renderBody(db) {
        var data = db.data;
        var env = db.env;
        var dynamicTabs = getDynamicTabs(db);
        var activeLabel = getActiveTableLabel(data.tables, data.activeTable, env.lang) || resolveRootModuleLabel(db);
        if (data.activeScreen && data.activeScreen !== 'settings') {
            var screenMatch = dynamicTabs.find(function (tab) { return tab.id === data.activeScreen; });
            if (screenMatch) activeLabel = (screenMatch.icon ? screenMatch.icon + ' ' : '') + screenMatch.label;
        }

        var sidebar = renderSidebar(db);

        var headerActions = [];
        if (data.activeTable) {
            headerActions.push(UC.Button({
                key: 'crud:go-home',
                icon: '🏠',
                label: env.lang === 'ar' ? 'الرئيسية' : 'Home',
                variant: 'ghost',
                size: 'sm',
                attrs: { key: 'header-go-home' }
            }));
        }
        headerActions = headerActions.concat([
            UC.Button({
                key: 'crud:toggle-lang',
                icon: '🌐',
                label: env.lang === 'ar' ? 'English' : 'العربية',
                variant: 'ghost',
                size: 'sm',
                attrs: { key: 'header-toggle-lang' }
            }),
            UC.Button({
                key: 'crud:toggle-theme',
                icon: env.theme === 'light' ? '🌙' : '☀️',
                label: env.theme === 'light' ? (env.lang === 'ar' ? 'داكن' : 'Dark') : (env.lang === 'ar' ? 'فاتح' : 'Light'),
                variant: 'ghost',
                size: 'sm',
                attrs: { key: 'header-toggle-theme' }
            }),
            UC.Button({
                key: 'crud:refresh',
                icon: '🔄',
                variant: 'outline',
                size: 'sm',
                attrs: { key: 'header-refresh' }
            }),
            UC.Button({
                key: 'crud:reseed',
                label: env.lang === 'ar' ? 'إعادة تهيئة البيانات' : 'Reseed',
                icon: '🌱',
                variant: 'danger',
                size: 'sm',
                attrs: { key: 'header-reseed' }
            })
        ]);

        var header = UC.Header({
            title: activeLabel,
            actions: headerActions
        });

        if (data.authRequired) {
            var missing = (data.authContext && data.authContext.missing) || [];
            var missingLabel = missing.length ? missing.join(', ') : '';
            var form = data.authForm || {};
            var options = data.authOptions || {};
            var isLoading = options.loading;

            function getId(row) {
                return row && (row.id || row.Id || row.uuid || row.uid);
            }

            function labelFor(row, tableName) {
                return displayNameForRecord(row, tableName, data.schemaInfo, env.lang) || row.display_name || row.name || row.code || getId(row);
            }

            function buildOptions(rows, tableName) {
                return (rows || []).map(function (row) {
                    return { id: getId(row), label: labelFor(row, tableName) };
                }).filter(function (opt) { return opt.id; });
            }

            var companyOptions = buildOptions(options.companies, 'companies');
            var branchOptions = buildOptions((options.branches || []).filter(function (row) {
                var companyId = form.company_id;
                if (!companyId) return true;
                var rowCompany = row && (row.company_id || (row.company && row.company.id));
                return String(rowCompany || '') === String(companyId);
            }), 'branches');
            var userOptions = buildOptions(options.users, 'users');

            function renderSelect(label, name, value, items) {
                return D.Div({ attrs: { class: 'space-y-1' } }, [
                    D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)]' } }, [label]),
                    D.Select({
                        attrs: {
                            name: name,
                            gkey: 'auth:update-field',
                            class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:ring-2 focus:ring-[var(--primary)]',
                            value: value || ''
                        }
                    }, [
                        D.Option({ attrs: { value: '' } }, ['---']),
                        ...items.map(function (opt) {
                            return D.Option({ attrs: { value: opt.id, selected: String(value) === String(opt.id) } }, [opt.label]);
                        })
                    ])
                ]);
            }

            var gateContent = D.Div({ attrs: { class: 'rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl space-y-6 max-w-xl w-full' } }, [
                D.Div({ attrs: { class: 'space-y-2' } }, [
                    D.Div({ attrs: { class: 'text-xl font-semibold' } }, [env.lang === 'ar' ? 'تسجيل الدخول' : 'Sign in']),
                    D.P({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [
                        env.lang === 'ar'
                            ? 'اختر الشركة والفرع والمستخدم ثم أدخل كلمة المرور.'
                            : 'Select company, branch, and user then enter the password.'
                    ])
                ]),
                missingLabel ? D.P({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [
                    env.lang === 'ar' ? ('الكوكيز المفقودة: ' + missingLabel) : ('Missing cookies: ' + missingLabel)
                ]) : null,
                isLoading ? D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...']) : D.Div({ attrs: { class: 'grid gap-4' } }, [
                    renderSelect(env.lang === 'ar' ? 'الشركة' : 'Company', 'company_id', form.company_id, companyOptions),
                    renderSelect(env.lang === 'ar' ? 'الفرع' : 'Branch', 'branch_id', form.branch_id, branchOptions),
                    renderSelect(env.lang === 'ar' ? 'المستخدم' : 'User', 'user_insert', form.user_insert, userOptions),
                    D.Div({ attrs: { class: 'space-y-1' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'كلمة المرور' : 'Password']),
                        D.Input({
                            attrs: {
                                type: 'password',
                                name: 'password',
                                gkey: 'auth:update-field',
                                value: form.password || '',
                                class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:ring-2 focus:ring-[var(--primary)]'
                            }
                        })
                    ])
                ]),
                D.Div({ attrs: { class: 'flex items-center gap-2 justify-end' } }, [
                    UC.Button({ key: 'auth:submit', label: env.lang === 'ar' ? 'دخول' : 'Sign in', variant: 'primary' }),
                    UC.Button({ key: 'crud:refresh', label: env.lang === 'ar' ? 'تحديث' : 'Refresh', variant: 'ghost' })
                ])
            ].filter(Boolean));

            return D.Div({ attrs: { class: 'min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-6' } }, [gateContent]);
        }

        var content;
        var screenTabs = renderScreenTabs(data.activeScreen, env.lang, db);
        var customScreen = renderActiveScreen(db);

        if (data.activeScreen && data.activeScreen !== 'settings') {
            content = customScreen;
        } else if (!data.activeTable) {
            content = D.Div({ attrs: { class: 'space-y-5' } }, [
                renderQuickActions(db),
                D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                    D.Div({ attrs: { class: 'text-xl font-bold flex items-center gap-2' } }, [
                        D.Span({}, ['🗂️']),
                        D.Span({}, [env.lang === 'ar' ? 'اختر شاشة إعدادات للعمل عليها' : 'Pick a settings screen to start'])
                    ]),
                    UC.Button({
                        key: 'crud:refresh',
                        icon: '🔄',
                        variant: 'outline',
                        size: 'sm'
                    })
                ]),
                renderTablesGrid(data.modules, data.activeTable, env.lang)
            ]);
        } else if (data.loading) {
            content = D.Div({ attrs: { class: 'flex items-center justify-center h-64' } }, [
                D.Div({ attrs: { class: 'animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]' } }, [])
            ]);
        } else if (data.error) {
            content = D.Div({ attrs: { class: 'p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-3' } }, [
                D.Span({ attrs: { class: 'text-lg' } }, ['⚠️']),
                D.Div({ attrs: { class: 'space-y-2' } }, [
                    D.Div({ attrs: { class: 'font-semibold' } }, ['حدث خطأ أثناء تحميل البيانات.']),
                    D.P({ attrs: { class: 'text-sm leading-relaxed' } }, [data.error]),
                    D.Div({ attrs: { class: 'flex gap-2' } }, [
                        UC.Button({ key: 'crud:refresh', label: 'إعادة المحاولة', variant: 'primary', size: 'sm' })
                    ])
                ])
            ]);
        } else if (data.records.length > 0) {
            var displayRows = mergeDisplayRows(data.records, env.lang);
            var sortState = (data.tableSort || {})[data.activeTable];
            var sortedRows = sortRows(displayRows, sortState);
            var displayRowsForTable = sortedRows.map(formatRowForDisplay);
            var columnsInfo = buildColumnsForTable(db, displayRowsForTable);
            var columns = columnsInfo.columns;
            var activeId = data.selectedRecord && String(data.selectedRecord.id || data.selectedRecord.Id || data.selectedRecord.uuid);
            var groupsForTable = getTableGroups(data.activeTable, data.schemaInfo, env.lang);
            var activeGroup = getActiveGroupForState(db, data.activeTable);
            var columnFilterOpen = data.columnFilterOpen;
            var columnsMeta = normalizeColumnsMeta(data.columnsMeta || []);
            var displayKeyForFilter = columnsInfo.columns.length ? columnsInfo.columns[0].key : '__display';
            var allColumnsForFilter = columnsMeta.length
                ? columnsMeta.concat([{ name: displayKeyForFilter, labels: { ar: 'الاسم', en: 'Name' } }])
                : Array.from(new Set([displayKeyForFilter].concat(displayRowsForTable.reduce(function (acc, row) {
                    Object.keys(row || {}).forEach(function (k) { if (!isHiddenColumn(k)) acc.push(k); });
                    return acc;
                }, [])))).map(function (name) { return { name: name, labels: {} }; });
            var childRelations = findChildRelations(data.schemaInfo, data.activeTable);

            function renderCellValue(row, key) {
                if (key === '__display') {
                    return displayNameForRecord(row, data.activeTable, data.schemaInfo, env.lang) || row.name || row.label || row.title || row.code || '—';
                }
                var value = row[key];
                if (value === null || value === undefined || value === '') {
                    return D.Span({ attrs: { class: 'text-[var(--muted-foreground)]' } }, ['—']);
                }
                if (typeof value === 'object') {
                    return value.display_name || value.name || value.label || value.title || value.code || value.id || value.uuid || '';
                }
                return String(value);
            }

            var groupTabs = D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, groupsForTable.map(function (group) {
                var selectedGroups = getSelectedGroups(db, data.activeTable, groupsForTable);
                var isActive = !!selectedGroups[group.id];
                return D.Button({
                    attrs: {
                        type: 'button',
                        gkey: 'crud:set-group-tab',
                        'data-group': group.id,
                        class: 'px-3 py-1.5 rounded-full text-sm border ' + (isActive ? 'border-[var(--primary)] text-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_12%,transparent)]' : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-1)]')
                    }
                }, [group.label]);
            }));

            var columnFilterQuery = String(data.columnFilterQuery || '');
            var filteredColumnsForPanel = allColumnsForFilter.filter(function (col) {
                if (!col || !col.name || col.name === 'id') return false;
                if (!columnFilterQuery) return true;
                var lbl = resolveColumnLabel(col, env.lang);
                return col.name.toLowerCase().indexOf(columnFilterQuery.toLowerCase()) !== -1 ||
                    lbl.toLowerCase().indexOf(columnFilterQuery.toLowerCase()) !== -1;
            });
            var allFilteredChecked = filteredColumnsForPanel.length > 0 && filteredColumnsForPanel.every(function (col) {
                return columnsInfo.visibility[col.name] !== false;
            });
            var filterPanel = columnFilterOpen ? D.Div({ attrs: { class: 'absolute right-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg p-3 z-40 space-y-2' } }, [
                D.Div({ attrs: { class: 'flex items-center justify-between gap-2' } }, [
                    D.Div({ attrs: { class: 'text-sm font-semibold' } }, [env.lang === 'ar' ? 'الأعمدة' : 'Columns']),
                    D.Div({ attrs: { class: 'flex items-center gap-1' } }, [
                        UC.Button({ key: 'crud:columns-select-all', label: env.lang === 'ar' ? 'تحديد الكل' : 'Select all', size: 'xs', variant: 'outline' }),
                        UC.Button({ key: 'crud:columns-unselect-all', label: env.lang === 'ar' ? 'إلغاء التحديد' : 'Unselect all', size: 'xs', variant: 'ghost' }),
                        UC.Button({ key: 'crud:reset-columns', label: env.lang === 'ar' ? 'إعادة الضبط' : 'Reset', size: 'xs', variant: 'ghost' })
                    ])
                ]),
                D.Div({ attrs: { class: 'flex items-center justify-between gap-2' } }, [
                    D.Label({ attrs: { class: 'flex items-center gap-1 text-xs' } }, [
                        D.Input({
                            attrs: {
                                type: 'checkbox',
                                checked: allFilteredChecked,
                                gkey: 'crud:columns-toggle-all',
                                class: 'rounded border-[var(--border)]'
                            }
                        }),
                        D.Span({}, [env.lang === 'ar' ? 'تحديد المرشّح' : 'Toggle filtered'])
                    ]),
                    UC.FormInput({
                        name: 'column-filter',
                        value: columnFilterQuery,
                        key: 'crud:update-column-filter-query',
                        placeholder: env.lang === 'ar' ? 'بحث...' : 'Search...',
                        attrs: { class: 'h-9 text-sm' }
                    })
                ]),
                D.Div({ attrs: { class: 'max-h-64 overflow-y-auto space-y-2 pr-1' } }, filteredColumnsForPanel.map(function (col) {
                    var checked = columnsInfo.visibility[col.name] !== false;
                    return D.Label({ attrs: { class: 'flex items-center gap-2 text-sm' } }, [
                        D.Input({
                            attrs: {
                                type: 'checkbox',
                                checked: !!checked,
                                'data-column': col.name,
                                gkey: 'crud:toggle-column-visibility',
                                class: 'rounded border-[var(--border)]'
                            }
                        }),
                        D.Span({}, [resolveColumnLabel(col, env.lang)])
                    ]);
                }))
            ]) : null;

            var tableRows = displayRowsForTable.map(function (row, idx) {
                var rowId = String(row.id || row.Id || row.uuid || row.uid || idx);
                var isActiveRow = rowId === activeId;
                var isContextOpen = data.openContextRow === rowId;
                return D.Tr({
                    attrs: {
                        class: 'relative border-b last:border-b-0 border-[var(--border)] ' + (isActiveRow ? 'bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]' : ''),
                        'data-record-id': rowId,
                        gkey: 'crud:row-context',
                        style: 'cursor: context-menu;'
                    }
                }, columns.map(function (col) {
                    if (col.key === '__actions') {
                        return D.Td({ attrs: { class: 'px-3 py-2 text-right' } }, [
                            D.Div({ attrs: { class: 'relative inline-block' } }, [
                                UC.Button({
                                    key: 'crud:open-context',
                                    icon: '⋯',
                                    variant: 'ghost',
                                    size: 'sm',
                                    attrs: { 'data-record-id': rowId, gkey: 'crud:open-context' }
                                }),
                                isContextOpen ? D.Div({
                                    attrs: {
                                        class: 'fixed w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl z-[200] overflow-hidden',
                                        style: 'left: ' + (data.contextMenuX || 0) + 'px; top: ' + (data.contextMenuY || 0) + 'px;',
                                        'data-context-menu': 'true'
                                    }
                                }, [
                                    D.Div({ attrs: { class: 'flex flex-col py-1' } }, [
                                        // System Actions Group
                                        D.Div({ attrs: { class: 'px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider bg-[var(--surface-1)]/50' } }, [
                                            env.lang === 'ar' ? 'إجراءات النظام' : 'System Actions'
                                        ]),
                                        D.Button({ attrs: { gkey: 'crud:open-info-modal', 'data-record-id': rowId, 'data-table': data.activeTable, class: 'px-3 py-2 text-left hover:bg-[var(--surface-1)] flex items-center gap-3 transition-colors' } }, [
                                            D.Span({ attrs: { class: 'text-base' } }, ['👁️']),
                                            D.Span({}, [env.lang === 'ar' ? 'عرض التفاصيل' : 'View info'])
                                        ]),
                                        D.Button({ attrs: { gkey: 'crud:open-edit-modal', 'data-record-id': rowId, 'data-table': data.activeTable, class: 'px-3 py-2 text-left hover:bg-[var(--surface-1)] flex items-center gap-3 transition-colors' } }, [
                                            D.Span({ attrs: { class: 'text-base' } }, ['✏️']),
                                            D.Span({}, [env.lang === 'ar' ? 'تعديل' : 'Edit'])
                                        ]),
                                        D.Button({ attrs: { gkey: 'crud:print-record', 'data-record-id': rowId, 'data-table': data.activeTable, class: 'px-3 py-2 text-left hover:bg-[var(--surface-1)] flex items-center gap-3 transition-colors' } }, [
                                            D.Span({ attrs: { class: 'text-base' } }, ['🖨️']),
                                            D.Span({}, [env.lang === 'ar' ? 'طباعة' : 'Print'])
                                        ]),
                                        D.Div({ attrs: { class: 'h-px bg-[var(--border)] my-1' } }),
                                        D.Button({ attrs: { gkey: 'crud:delete-record', 'data-record-id': rowId, 'data-table': data.activeTable, class: 'px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors' } }, [
                                            D.Span({ attrs: { class: 'text-base' } }, ['🗑️']),
                                            D.Span({}, [env.lang === 'ar' ? 'حذف' : 'Delete'])
                                        ]),

                                        // Related Records Section (Dynamic)
                                        (function () {
                                            var related = [];
                                            var tableMap = (data.schemaInfo && data.schemaInfo.tableMap) || {};
                                            Object.keys(tableMap).forEach(function (k) {
                                                var t = tableMap[k];
                                                if (!t || !t.fkReferences) return;
                                                t.fkReferences.forEach(function (fk) {
                                                    if (fk.targetTable === data.activeTable) {
                                                        var lbls = t.labels || {};
                                                        var label = lbls[env.lang] || lbls.ar || lbls.en || t.name;
                                                        related.push({ table: t.name, label: label, icon: t.icon || '🔗' });
                                                    }
                                                });
                                            });

                                            if (!related.length) return null;

                                            return [
                                                D.Div({ attrs: { class: 'h-px bg-[var(--border)] my-1' } }),
                                                D.Div({ attrs: { class: 'px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider bg-[var(--surface-1)]/50' } }, [
                                                    env.lang === 'ar' ? 'سجلات مرتبطة' : 'Related Records'
                                                ]),
                                                related.map(function (r) {
                                                    return D.Button({
                                                        attrs: {
                                                            gkey: 'crud:select-table', // Reuse select table for now, maybe add filter later
                                                            'data-table': r.table,
                                                            'data-filter-field': 'parent_id', // Conceptual
                                                            'data-filter-value': rowId,
                                                            class: 'px-3 py-2 text-left hover:bg-[var(--surface-1)] flex items-center gap-3 transition-colors'
                                                        }
                                                    }, [
                                                        D.Span({ attrs: { class: 'text-base' } }, [r.icon]),
                                                        D.Span({}, [r.label])
                                                    ]);
                                                })
                                            ];
                                        })()
                                    ])
                                ]) : null
                            ])
                        ]);
                    }

                    var cellValue = renderCellValue(row, col.key);
                    return D.Td({
                        attrs: {
                            class: 'px-3 py-2 text-sm cursor-pointer',
                            'data-record-id': rowId,
                            gkey: 'crud:select-record'
                        }
                    }, [cellValue]);
                }));
            });

            var headerRow = D.Tr({}, columns.map(function (col) {
                if (col.key === '__actions') {
                    return D.Th({ attrs: { class: 'px-3 py-2 text-right text-sm text-[var(--muted-foreground)]' } }, ['⋯']);
                }
                var isSorted = sortState && sortState.key === col.key;
                var sortIcon = isSorted ? (sortState.dir === 'desc' ? '↓' : '↑') : '';
                return D.Th({
                    attrs: {
                        class: 'px-3 py-2 text-left text-sm text-[var(--muted-foreground)] cursor-pointer select-none',
                        gkey: 'crud:sort-column',
                        'data-column': col.key
                    }
                }, [
                    D.Span({}, [col.label]),
                    sortIcon ? D.Span({ attrs: { class: 'ml-1 text-xs' } }, [sortIcon]) : null
                ]);
            }));

            content = D.Div({ attrs: { class: 'space-y-5' } }, [
                renderQuickActions(db),
                D.Div({ attrs: { class: 'flex flex-col gap-3' } }, [
                    D.Div({ attrs: { class: 'flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3' } }, [
                        D.Div({ attrs: { class: 'flex flex-wrap items-center gap-3' } }, [
                            groupTabs,
                            D.Div({ attrs: { class: 'relative' } }, [
                                UC.Button({
                                    key: 'crud:toggle-column-filter',
                                    label: env.lang === 'ar' ? 'إظهار/إخفاء الأعمدة' : 'Show/Hide columns',
                                    icon: '🧰',
                                    variant: 'outline',
                                    size: 'sm'
                                }),
                                filterPanel
                            ]),
                            columnsInfo.hiddenCount ? D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [
                                (env.lang === 'ar' ? 'أعمدة مخفية: ' : 'Hidden columns: ') + columnsInfo.hiddenCount
                            ]) : null
                        ]),
                        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                            UC.FormInput({
                                name: 'search',
                                value: data.searchTerm,
                                key: 'crud:search',
                                label: env.lang === 'ar' ? 'بحث سريع' : 'Quick Search',
                                placeholder: env.lang === 'ar' ? 'اكتب واضغط Enter للبحث' : 'Type and press Enter to search',
                            }),
                            UC.Button({
                                key: 'crud:create',
                                label: env.lang === 'ar' ? 'سجل جديد' : 'New Record',
                                icon: '➕',
                                variant: 'primary',
                                attrs: { gkey: 'crud:create' }
                            })
                        ])
                    ])
                ]),
                (function () {
                    var scrollId = 'crud-table-scroll';
                    var topScrollId = 'crud-table-scroll-top';
                    var scrollWidth = Math.max(columns.length * 220, 960);
                    return D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm relative space-y-1' } }, [
                        D.Div({
                            attrs: {
                                id: topScrollId,
                                class: 'overflow-x-auto h-3',
                                gkey: 'crud:sync-scroll',
                                'data-target': scrollId
                            }
                        }, [
                            D.Div({ attrs: { style: 'width:' + scrollWidth + 'px;height:1px;' } }, [])
                        ]),
                        D.Div({ attrs: { id: scrollId, class: 'overflow-auto max-h-[65vh] min-h-[320px]', 'data-peer': topScrollId, gkey: 'crud:sync-scroll' } }, [
                            D.Table({ attrs: { class: 'w-full text-sm', style: 'min-width:' + scrollWidth + 'px;' } }, [
                                D.Thead({ attrs: { class: 'bg-[var(--surface-1)] sticky top-0 z-10' } }, [headerRow]),
                                D.Tbody({}, tableRows)
                            ])
                        ])
                    ]);
                })(),
                renderPaginationControl(db)
            ]);
        } else {
            content = D.Div({ attrs: { class: 'space-y-4' } }, [renderQuickActions(db), UC.Table({ columns: [], data: [] })]);
        }

        var notifications = renderNotifications(data, env);
        var breadcrumbs = renderBreadcrumbs(db);
        var overlays = [renderFormModal(db), renderRecordInfoModal(db), renderChildCrudModals(db)].filter(Boolean);
        var bodyContent = D.Div({ attrs: { class: 'space-y-4' } }, [notifications, screenTabs, breadcrumbs, content].concat(overlays).filter(Boolean));

        return UC.AppLayout(sidebar, header, bodyContent);
    }

    // ============================================================================
    // BOOTSTRAP
    // ============================================================================

    function renderPaginationControl(db) {
        var data = db.data;
        var env = db.env;
        var total = data.total || 0;
        var limit = data.limit || 50;
        var page = data.page || 1;
        var isAll = limit >= 100000;

        if (total === 0) {
            return D.Div({ attrs: { class: "flex items-center justify-center p-4 text-sm text-[var(--muted-foreground)] border-t border-[var(--border)] mt-2 bg-[var(--surface-1)] rounded-b-xl" } }, [
                D.Span({}, [env.lang === 'ar' ? 'لا توجد سجلات' : 'No records found'])
            ]);
        }

        var totalPages = Math.ceil(total / limit);
        if (isAll || (totalPages <= 1 && total <= limit)) {
            return D.Div({ attrs: { class: "flex items-center justify-end p-2 text-xs text-[var(--muted-foreground)]" } }, [
                D.Span({}, [env.lang === 'ar' ? 'العدد الكلي: ' + total : 'Total: ' + total])
            ]);
        }

        var start = (page - 1) * limit + 1;
        var end = Math.min(page * limit, total);

        return D.Div({ attrs: { class: "flex items-center justify-between p-2 border-t border-[var(--border)] mt-2 bg-[var(--surface-1)] rounded-b-xl" } }, [
            D.Div({ attrs: { class: "flex items-center gap-2 text-sm text-[var(--muted-foreground)]" } }, [
                D.Span({}, [
                    env.lang === 'ar'
                        ? 'عرض ' + start + ' - ' + end + ' من ' + total
                        : 'Showing ' + start + ' - ' + end + ' of ' + total
                ])
            ]),
            D.Div({ attrs: { class: "flex items-center gap-1" } }, [
                UC.Button({ key: 'crud:page-first', label: '«', variant: 'ghost', size: 'sm', attrs: { disabled: page <= 1, gkey: 'crud:page-first' } }),
                UC.Button({ key: 'crud:page-prev', label: '‹', variant: 'ghost', size: 'sm', attrs: { disabled: page <= 1, gkey: 'crud:page-prev' } }),
                D.Span({ attrs: { class: "px-2 text-sm font-medium" } }, [page + ' / ' + totalPages]),
                UC.Button({ key: 'crud:page-next', label: '›', variant: 'ghost', size: 'sm', attrs: { disabled: page >= totalPages, gkey: 'crud:page-next' } }),
                UC.Button({ key: 'crud:page-last', label: '»', variant: 'ghost', size: 'sm', attrs: { disabled: page >= totalPages, gkey: 'crud:page-last' } }),

                D.Select({
                    attrs: {
                        class: "ml-2 h-8 text-xs rounded border border-[var(--border)] bg-[var(--card)] px-2 outline-none focus:border-[var(--primary)]",
                        gkey: "crud:set-limit"
                    }
                }, [10, 20, 50, 100, 0].map(function (l) {
                    var val = l === 0 ? 100000 : l;
                    var label = l === 0 ? (env.lang === 'ar' ? 'الكل' : 'All') : l;
                    var isSel = (isAll && l === 0) || (!isAll && limit == l);
                    return D.Option({ attrs: { value: l, selected: isSel } }, [label]);
                }))
            ])
        ]);
    }

    function collectScreenOrders() {
        var output = {};
        if (!global.FinanceScreens) return output;
        Object.keys(global.FinanceScreens).forEach(function (key) {
            var screen = global.FinanceScreens[key];
            if (!screen || !screen.orders) return;
            Object.assign(output, screen.orders);
        });
        return output;
    }

    global.FinanceDashboard = {
        ensureTable: async function (ctx, tableName) {
            if (!ctx || !tableName) return;
            await loadTableData(ctx, tableName);
        },
        openEdit: async function (ctx, tableName, recordId) {
            if (!ctx || !tableName || !recordId) return;
            await loadTableData(ctx, tableName);
            await loadRecordDetail(ctx, tableName, recordId);
            ctx.setState(function (prev) {
                var groups = getTableGroups(tableName, prev.data.schemaInfo, prev.env.lang);
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        activeTable: tableName,
                        formMode: 'edit',
                        showFormModal: true,
                        openContextRow: null,
                        activeFormTab: prev.data.activeFormTab || (groups[0] && groups[0].id) || 'basic'
                    })
                });
            });
        },
        openCreate: async function (ctx, tableName) {
            if (!ctx || !tableName) return;
            await loadTableData(ctx, tableName);
            var state = ctx.getState();
            var columnsMeta = normalizeColumnsMeta(state.data.columnsMeta || []);
            var fields = ensureTranslationFields(state.data.translationFields, {});
            var translations = buildEmptyTranslations(state.data.languages, fields);
            var draft = applyDefaultsFromColumnsMeta({}, columnsMeta);
            var sysDefaults = buildSystemDefaults(state.data, columnsMeta);
            Object.keys(sysDefaults).forEach(function (key) {
                if (draft[key] === undefined || draft[key] === null || draft[key] === '') {
                    draft[key] = sysDefaults[key];
                }
            });

            ctx.setState(function (prev) {
                var groups = getTableGroups(tableName, prev.data.schemaInfo, prev.env.lang);
                var defaultTab = (groups[0] && groups[0].id) || 'basic';
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        activeTable: tableName,
                        selectedRecord: null,
                        editRecord: draft,
                        translations: translations,
                        translationFields: fields,
                        translationBaseline: {},
                        translationRemovals: [],
                        newLangCode: '',
                        showFormModal: true,
                        showInfoModal: false,
                        openContextRow: null,
                        formMode: 'create',
                        activeFormTab: defaultTab
                    })
                });
            });

            await refreshSequenceHints(ctx, tableName);
        }
    };

    // Initialize Theme
    updateDocumentTheme(initialState.env.theme, initialState.env.lang);

    // AUTH GUARD: Check if user is authenticated
    (function checkAuth() {
        var token = null;
        try {
            token = global.localStorage ? global.localStorage.getItem('mishkah_token') : null;
        } catch (_err) {
            token = null;
        }

        // If no token and not already on login page, redirect
        if (!token && !window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
            return;
        }

        // If token exists, add it to REST headers for all future requests
        if (token && M.REST && M.REST.request) {
            var originalRequest = M.REST.request;
            M.REST.request = function (endpoint, method, data, options) {
                options = options || {};
                options.headers = options.headers || {};
                options.headers['Authorization'] = 'Bearer ' + token;
                return originalRequest.call(this, endpoint, method, data, options);
            };
        }
    })();

    // Mishkah Bootstrap - Simple and Direct
    M.app.setBody(renderBody);
    var app = M.app.createApp(initialState, Object.assign({}, orders, collectScreenOrders()));
    app.mount('#app');

    // Expose reseed helper for static button usage
    global.manualReseed = function (opts) {
        return performReseed(app, opts);
    };
    global.UniversalReseed = global.manualReseed;

    // Load Initial Data
    loadTables(app);
    loadActiveScreen(app, initialState.data.activeScreen);

})(window);
