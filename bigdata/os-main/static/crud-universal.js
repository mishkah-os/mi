(function (global) {
    'use strict';

    var M = global.Mishkah;
    if (!M || !M.DSL || !M.app) {
        console.error('[CRUD] Mishkah core required');
        return;
    }

    var D = M.DSL;

    // ============================================================================
    // CONFIGURATION & STATE
    // ============================================================================

    var API_BASE = 'http://localhost:3001/api/v1';

    var savedLang = global.localStorage ? (global.localStorage.getItem('crud:lang') || 'ar') : 'ar';
    var savedTheme = global.localStorage ? (global.localStorage.getItem('crud:theme') || 'light') : 'light';

    var dictionary = {
        'app.title': { ar: 'نظام CRUD الشامل', en: 'Universal CRUD System' },
        'nav.tables': { ar: 'الجداول', en: 'Tables' },
        'nav.data': { ar: 'البيانات', en: 'Data' },
        'action.new': { ar: 'إضافة جديد', en: 'Add New' },
        'action.edit': { ar: 'تعديل', en: 'Edit' },
        'action.delete': { ar: 'حذف', en: 'Delete' },
        'action.save': { ar: 'حفظ', en: 'Save' },
        'action.cancel': { ar: 'إلغاء', en: 'Cancel' },
        'label.search': { ar: 'بحث', en: 'Search' },
        'label.loading': { ar: 'جاري التحميل...', en: 'Loading...' },
        'label.noData': { ar: 'لا توجد بيانات', en: 'No data' },
        'label.translations': { ar: 'الترجمات', en: 'Translations' },
        'label.baseData': { ar: 'البيانات الأساسية', en: 'Base Data' }
    };

    var database = {
        data: {
            tables: [],          // Available tables list
            selectedTable: null,
            records: [],          // Current table records
            languages: [],        // Available languages
            editingRecord: null,  // Record being edited
            searchTerm: ''
        },
        env: {
            theme: savedTheme,
            lang: savedLang,
            dir: savedLang === 'ar' ? 'rtl' : 'ltr'
        },
        i18n: { dict: dictionary }
    };

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    function t(db, key) {
        var entry = (db && db.i18n && db.i18n.dict && db.i18n.dict[key]) || null;
        if (!entry) return key;
        return entry[(db.env && db.env.lang) || 'ar'] || entry.en || key;
    }

    function applyTheme(env) {
        if (typeof document === 'undefined') return;
        var theme = env.theme || 'light';
        var lang = env.lang || 'ar';
        var dir = lang === 'ar' ? 'rtl' : 'ltr';

        var root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.setAttribute('lang', lang);
        root.setAttribute('dir', dir);

        if (document.body) {
            document.body.setAttribute('data-theme', theme);
            if (theme === 'dark') document.body.classList.add('dark');
            else document.body.classList.remove('dark');
        }

        if (global.localStorage) {
            global.localStorage.setItem('crud:theme', theme);
            global.localStorage.setItem('crud:lang', lang);
        }
    }

    async function apiRequest(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // ============================================================================
    // DATA FETCHING
    // ============================================================================

    async function fetchTables(app) {
        try {
            // Get schema to list non-lang tables
            const response = await fetch(`${API_BASE.replace('/api/v1', '')}/data/schemas/clinic_schema.json`);
            const schema = await response.json();

            const tables = (schema.schema.tables || [])
                .filter(t => !t.name.endsWith('_lang') && !t.name.startsWith('_'))
                .map(t => ({ name: t.name, label: t.label || t.name }));

            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, tables, selectedTable: tables[0]?.name || null }
            }));

            if (tables[0]) {
                await fetchTableData(app, tables[0].name);
            }
        } catch (error) {
            console.error('Failed to fetch tables:', error);
        }
    }

    async function fetchLanguages(app) {
        try {
            const languages = await apiRequest('/languages');
            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, languages }
            }));
        } catch (error) {
            console.error('Failed to fetch languages:', error);
        }
    }

    async function fetchTableData(app, tableName) {
        try {
            const lang = database.env.lang;
            const result = await apiRequest(`/crud/${tableName}/search`, {
                method: 'POST',
                body: JSON.stringify({
                    lang,
                    q: database.data.searchTerm,
                    page: 1,
                    limit: 100
                })
            });

            app.setState(prev => ({
                ...prev,
                data: {
                    ...prev.data,
                    selectedTable: tableName,
                    records: result.data || []
                }
            }));
        } catch (error) {
            console.error('Failed to fetch table data:', error);
            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, records: [] }
            }));
        }
    }

    async function saveRecord(app, tableName, record) {
        try {
            const result = await apiRequest(`/crud/${tableName}`, {
                method: record.id ? 'PUT' : 'POST',
                headers: {
                    'x-user-id': 'admin'
                },
                body: JSON.stringify(record)
            });

            // Refresh table data
            await fetchTableData(app, tableName);

            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, editingRecord: null }
            }));

            return result;
        } catch (error) {
            console.error('Failed to save record:', error);
            throw error;
        }
    }

    // ============================================================================
    // ORDERS (Event Handlers)
    // ============================================================================

    var orders = {
        'crud:toggle-theme': function (app) {
            app.setState(function (prev) {
                var newTheme = prev.env.theme === 'light' ? 'dark' : 'light';
                var nextEnv = Object.assign({}, prev.env, { theme: newTheme });
                applyTheme(nextEnv);
                return Object.assign({}, prev, { env: nextEnv });
            });
        },

        'crud:toggle-lang': function (app) {
            app.setState(function (prev) {
                var newLang = prev.env.lang === 'ar' ? 'en' : 'ar';
                var nextEnv = Object.assign({}, prev.env, {
                    lang: newLang,
                    dir: newLang === 'ar' ? 'rtl' : 'ltr'
                });
                applyTheme(nextEnv);

                // Refresh data with new language
                if (prev.data.selectedTable) {
                    fetchTableData(app, prev.data.selectedTable);
                }

                return Object.assign({}, prev, { env: nextEnv });
            });
        },

        'crud:select-table': function (app, ev) {
            var tableName = ev.target.getAttribute('data-table');
            if (tableName) {
                fetchTableData(app, tableName);
            }
        },

        'crud:search': function (app, ev) {
            var term = ev.target.value;
            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, searchTerm: term }
            }));

            // Debounced search
            clearTimeout(global._crudSearchTimeout);
            global._crudSearchTimeout = setTimeout(() => {
                if (database.data.selectedTable) {
                    fetchTableData(app, database.data.selectedTable);
                }
            }, 300);
        },

        'crud:new-record': function (app) {
            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, editingRecord: {} }
            }));
        },

        'crud:edit-record': function (app, ev) {
            var recordId = ev.target.closest('[data-record-id]')?.getAttribute('data-record-id');
            var record = database.data.records.find(r => r.id === recordId);

            if (record) {
                app.setState(prev => ({
                    ...prev,
                    data: { ...prev.data, editingRecord: { ...record } }
                }));
            }
        },

        'crud:cancel-edit': function (app) {
            app.setState(prev => ({
                ...prev,
                data: { ...prev.data, editingRecord: null }
            }));
        },

        'crud:save-record': async function (app, ev) {
            ev.preventDefault();

            // TODO: Extract form data and save
            const formData = {}; // Extract from form

            try {
                await saveRecord(app, database.data.selectedTable, formData);
            } catch (error) {
                alert('Failed to save record');
            }
        }
    };

    // ============================================================================
    // VIEW COMPONENTS
    // ============================================================================

    function renderHeader(db) {
        return D.Div({ attrs: { class: 'flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white' } }, [
            D.H1({ attrs: { class: 'text-2xl font-bold' } }, [t(db, 'app.title')]),
            D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                D.Button({
                    attrs: {
                        type: 'button',
                        'data-m-key': 'crud:toggle-lang',
                        class: 'btn btn-ghost btn-sm text-white hover:bg-white/20',
                        title: db.env.lang === 'ar' ? 'English' : 'العربية'
                    }
                }, [db.env.lang === 'ar' ? 'EN' : 'ع']),
                D.Button({
                    attrs: {
                        type: 'button',
                        'data-m-key': 'crud:toggle-theme',
                        class: 'btn btn-ghost btn-icon btn-sm text-white hover:bg-white/20'
                    }
                }, [db.env.theme === 'light' ? '🌙' : '☀️'])
            ])
        ]);
    }

    function renderSidebar(db) {
        return D.Aside({ attrs: { class: 'sidebar w-64 p-4 flex flex-col gap-4 h-screen overflow-y-auto' } }, [
            D.H2({ attrs: { class: 'text-lg font-bold mb-2' } }, [t(db, 'nav.tables')]),
            D.Div({ attrs: { class: 'space-y-1' } },
                (db.data.tables || []).map(table => {
                    const isActive = db.data.selectedTable === table.name;
                    return D.Button({
                        attrs: {
                            type: 'button',
                            'data-m-key': 'crud:select-table',
                            'data-table': table.name,
                            class: `w-full text-start px-3 py-2 rounded-lg transition-colors ${isActive
                                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`
                        }
                    }, [table.label || table.name]);
                })
            )
        ]);
    }

    function renderDataGrid(db) {
        const records = db.data.records || [];

        if (!db.data.selectedTable) {
            return D.Div({ attrs: { class: 'flex items-center justify-center h-full text-gray-500' } }, [
                t(db, 'label.noData')
            ]);
        }

        if (!records.length) {
            return D.Div({ attrs: { class: 'p-8' } }, [
                D.Div({ attrs: { class: 'text-center text-gray-500' } }, [t(db, 'label.noData')])
            ]);
        }

        // Get columns from first record
        const columns = Object.keys(records[0]).filter(k =>
            !k.endsWith('_id') && !k.startsWith('_') && k !== 'id' && k !== 'translations'
        );

        return D.Div({ attrs: { class: 'p-4' } }, [
            D.Div({ attrs: { class: 'flex items-center justify-between mb-4' } }, [
                D.Input({
                    attrs: {
                        type: 'text',
                        'data-m-key': 'crud:search',
                        placeholder: t(db, 'label.search') + '...',
                        value: db.data.searchTerm || '',
                        class: 'field w-64'
                    }
                }),
                D.Button({
                    attrs: {
                        type: 'button',
                        'data-m-key': 'crud:new-record',
                        class: 'btn btn-primary'
                    }
                }, [t(db, 'action.new')])
            ]),
            D.Div({ attrs: { class: 'card overflow-hidden' } }, [
                D.Table({ attrs: { class: 'table' } }, [
                    D.Thead({}, [
                        D.Tr({}, [
                            ...columns.map(col => D.Th({}, [col])),
                            D.Th({}, [])
                        ])
                    ]),
                    D.Tbody({},
                        records.map(record => {
                            return D.Tr({}, [
                                ...columns.map(col => {
                                    const value = record[col];

                                    // FK hydrated object
                                    if (value && typeof value === 'object' && value.name) {
                                        return D.Td({}, [
                                            D.Span({ attrs: { class: 'badge badge-primary' } }, [value.name])
                                        ]);
                                    }

                                    return D.Td({}, [String(value || '—')]);
                                }),
                                D.Td({}, [
                                    D.Button({
                                        attrs: {
                                            type: 'button',
                                            'data-m-key': 'crud:edit-record',
                                            'data-record-id': record.id,
                                            class: 'btn btn-ghost btn-sm'
                                        }
                                    }, [t(db, 'action.edit')])
                                ])
                            ]);
                        })
                    )
                ])
            ])
        ]);
    }

    function renderBody(db) {
        return D.Div({ attrs: { class: 'flex min-h-screen bg-[var(--background)]' } }, [
            renderSidebar(db),
            D.Div({ attrs: { class: 'flex-1 flex flex-col' } }, [
                renderHeader(db),
                D.Main({ attrs: { class: 'flex-1 overflow-auto' } }, [
                    renderDataGrid(db)
                ])
            ])
        ]);
    }

    // ============================================================================
    // APP INITIALIZATION
    // ============================================================================

    applyTheme(database.env);

    M.app.setBody(renderBody);
    var app = M.app.createApp(database, orders);
    app.mount('#app');

    // Load initial data
    Promise.all([
        fetchTables(app),
        fetchLanguages(app)
    ]).catch(err => {
        console.error('Failed to initialize:', err);
    });

})(window);
