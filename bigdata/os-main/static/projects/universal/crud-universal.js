(function (global) {
    'use strict';

    // Direct access is now safe due to synchronous loading
    var M = global.Mishkah;
    var UC = global.UniversalComp;

    if (!M || !M.DSL || !M.app || !UC || !M.REST) {
        console.error('[Universal CRUD] Required libraries missing (Mishkah, DSL, App, UniversalComp, REST)');
        return;
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

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    var initialState = {
        env: {
            theme: 'light',
            lang: 'ar',
            dir: 'rtl'
        },
        data: {
            tables: [],           // List of { id, label }
            activeTable: null,    // Currently selected table name
            records: [],          // Data for active table
            total: 0,
            page: 1,
            loading: false,
            loadingRecord: false,
            searchTerm: '',
            error: null,
            languages: [],
            selectedRecord: null,
            editRecord: null,
            translations: {},
            translationBaseline: {},
            translationRemovals: [],
            newLangCode: '',
            translationFields: [],
            saving: false,
            notifications: []
        }
    };

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

        var branchId = defaults.branchId || prompt('أدخل معرف الفرع المطلوب إعادة تهيئته (مثال: clinic)', defaultBranch);
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
        // Navigate between tables (triggered by clicking sidebar)
        'crud:select-table': {
            on: ['click'],
            gkeys: ['crud:select-table'],
            handler: async function (ev, ctx) {
                var tableName = ev.target.getAttribute('data-table') || ev.target.closest('[data-table]').getAttribute('data-table');
                if (!tableName) return;

                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeTable: tableName,
                            loading: true,
                            error: null,
                            records: [],
                            page: 1
                        })
                    });
                });

                await loadTableData(ctx, tableName);
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

        // Theme Toggle
        'crud:toggle-theme': {
            on: ['click'],
            gkeys: ['crud:toggle-theme'],
            handler: function (_ev, ctx) {
                ctx.setState(function (prev) {
                    var newTheme = prev.env.theme === 'light' ? 'dark' : 'light';
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
                    updateDocumentTheme(prev.env.theme, newLang);
                    var relabeledTables = relabelTables(prev.data.tables, newLang);
                    return Object.assign({}, prev, {
                        env: Object.assign({}, prev.env, { lang: newLang, dir: newDir }),
                        data: Object.assign({}, prev.data, { tables: relabeledTables })
                    });
                });

                var table = ctx.getState().data.activeTable;
                if (table) loadTableData(ctx, table);
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
            on: ['click'],
            gkeys: ['crud:select-record'],
            handler: function (ev, ctx) {
                var recordId = ev.target.getAttribute('data-record-id') || ev.target.closest('[data-record-id]')?.getAttribute('data-record-id');
                var table = ctx.getState().data.activeTable;
                if (recordId && table) {
                    loadRecordDetail(ctx, table, recordId);
                }
            }
        },

        // Update base field
        'crud:update-field': {
            on: ['input'],
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
                        pushNotification(ctx, 'info', 'هذه اللغة مضافة بالفعل');
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
                ctx.setState(function (prev) {
                    var translations = Object.assign({}, prev.data.translations || {});
                    delete translations[lang];
                    var removals = prev.data.translationRemovals || [];
                    if (!removals.includes(lang)) removals = removals.concat([lang]);
                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { translations: translations, translationRemovals: removals }) });
                });
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
            handler: function (_ev, ctx) {
                var state = ctx.getState();
                var fields = ensureTranslationFields(state.data.translationFields, state.data.translations);
                var translations = Object.keys(state.data.translations || {}).length
                    ? Object.assign({}, state.data.translations)
                    : buildEmptyTranslations(state.data.languages, fields);
                ctx.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            selectedRecord: null,
                            editRecord: {},
                            translations: translations,
                            translationFields: fields,
                            translationBaseline: {},
                            translationRemovals: [],
                            newLangCode: ''
                        })
                    });
                });
            }
        }
    };

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

    function getActiveTableLabel(tables, activeId, lang) {
        var match = (tables || []).find(function (t) { return t.id === activeId; });
        if (!match) return activeId;
        var labels = match.labels || {};
        return labels[lang] || labels.ar || labels.en || match.label || activeId;
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

        return {
            record: computeRecordPatch(baselineRecord, record),
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
            var response = await M.REST.languages();
            var langs = response.languages || [];
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, { languages: mergeLanguages(prev.data.languages, langs) })
                });
            });
        } catch (error) {
            console.warn('[Universal CRUD] Failed to load languages', error);
        }
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
            var translationFields = ensureTranslationFields(response.translationFields || [], translations);
            var languages = mergeLanguages(app.getState().data.languages, response.languages || []);
            if (!Object.keys(translations).length && languages.length) {
                translations = buildEmptyTranslations(languages, translationFields);
            }

            app.setState(function (prev) {
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
        try {
            var tablesPayload = await M.REST.system.tables();
            var lang = app.getState().env.lang;
            var uiTables = (Array.isArray(tablesPayload) ? tablesPayload : (tablesPayload.tables || []))
                .filter(function (t) {
                    var name = String(t.name || t.id || '').toLowerCase();
                    return name && !name.endsWith('_lang');
                })
                .map(function (t) {
                    var labels = resolveTableLabels(t);
                    return { id: t.name, labels: labels, label: labels[lang] || labels.ar || labels.en || t.label || t.name };
                });

            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, { tables: uiTables })
                });
            });

            if (uiTables.length > 0) {
                // Trigger first table load
                var firstTable = uiTables[0].id;
                app.setState(function (prev) {
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            activeTable: firstTable,
                            loading: true
                        })
                    });
                });
                await loadTableData(app, firstTable);
            }

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
        var state = app.getState();
        var lang = state.env.lang;
        var search = state.data.searchTerm;

        app.setState(function (prev) {
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                    loading: true,
                    error: null
                })
            });
        });

        try {
            var repo = M.REST.repo(tableName);
            var result = await repo.search({
                lang: lang,
                q: search,
                page: 1,
                limit: 100
            });

            app.setState(function (prev) {
                var nextRecords = result.data || [];
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        records: nextRecords,
                        total: result.count || 0,
                        loading: false,
                        error: null
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

    function updateDocumentTheme(theme, lang) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        document.body.className = theme === 'dark' ? 'dark' : '';
    }

    function renderRecordEditor(db) {
        var data = db.data;
        var env = db.env;
        var record = data.editRecord || {};
        var translations = data.translations || {};
        var languages = data.languages || [];
        var translationFields = ensureTranslationFields(data.translationFields, translations);

        if (data.loadingRecord) {
            return D.Div({ attrs: { class: 'p-4 rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, [
                D.Div({ attrs: { class: 'flex items-center gap-2 text-[var(--muted-foreground)]' } }, [
                    D.Span({ attrs: { class: 'animate-spin h-4 w-4 border-b-2 border-[var(--primary)] rounded-full' } }, []),
                    D.Span({}, [env.lang === 'ar' ? 'جار تحميل السجل...' : 'Loading record...'])
                ])
            ]);
        }

        var baseFields = Object.keys(record || {}).filter(function (key) {
            var value = record[key];
            if (value === null || value === undefined) return false;
            if (typeof value === 'object') return false;
            return !String(key).startsWith('_');
        });

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

        var availableLangOptions = (languages || []).filter(function (lang) {
            var code = lang.code || lang;
            return code && !translations[code];
        });

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
                        icon: '🗑️',
                        variant: 'outline',
                        size: 'sm',
                        attrs: { 'data-lang': code }
                    })
                ])
            ]);
        });

        return D.Div({ attrs: { class: 'space-y-4' } }, [
            D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                D.Div({ attrs: { class: 'text-lg font-semibold' } }, [env.lang === 'ar' ? 'تفاصيل السجل' : 'Record Details']),
                UC.Button({
                    key: 'crud:save-record',
                    label: env.lang === 'ar' ? 'حفظ' : 'Save',
                    icon: data.saving ? '⏳' : '💾',
                    variant: 'primary',
                    attrs: { disabled: data.saving }
                })
            ]),

            D.Div({ attrs: { class: 'space-y-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, [
                D.Div({ attrs: { class: 'font-semibold text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'البيانات الأساسية' : 'Base Data']),
                baseFields.length === 0 ? D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'لا توجد حقول قابلة للتحرير' : 'No editable fields']) : null,
                baseFields.map(function (field) {
                    return UC.FormInput({
                        name: field,
                        value: record[field],
                        key: 'crud:update-field',
                        label: field,
                        attrs: { disabled: field === 'id' }
                    });
                })
            ]),

            D.Div({ attrs: { class: 'space-y-3' } }, [
                D.Div({ attrs: { class: 'font-semibold text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'الترجمات' : 'Translations']),
                D.Div({ attrs: { class: 'flex flex-col gap-2 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)]' } }, [
                    D.Label({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'أضف لغة جديدة' : 'Add translation language']),
                    D.Div({ attrs: { class: 'flex flex-wrap gap-3 items-center' } }, [
                        D.Select({
                            attrs: {
                                class: 'h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm min-w-[160px] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]',
                                gkey: 'crud:update-new-lang-code',
                                value: data.newLangCode || ''
                            }
                        }, [
                            D.Option({ attrs: { value: '' } }, [env.lang === 'ar' ? 'اختر لغة' : 'Choose language']),
                            availableLangOptions.map(function (lang) {
                                var code = lang.code || lang;
                                return D.Option({ attrs: { value: code } }, [lang.label ? lang.label + ' (' + code + ')' : code]);
                            })
                        ]),
                        D.Input({ attrs: {
                            class: 'h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]',
                            placeholder: env.lang === 'ar' ? 'أو اكتب رمز لغة مخصص' : 'or type a custom code',
                            gkey: 'crud:update-new-lang-code',
                            value: data.newLangCode || ''
                        } }),
                        UC.Button({
                            key: 'crud:add-translation-lang',
                            label: env.lang === 'ar' ? 'إضافة لغة' : 'Add language',
                            icon: '➕',
                            variant: 'outline',
                            size: 'sm'
                        })
                    ])
                ]),
                D.Div({ attrs: { class: 'overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, [
                    translationTableRows.length === 0 ? D.Div({ attrs: { class: 'p-4 text-sm text-[var(--muted-foreground)]' } }, [env.lang === 'ar' ? 'لا توجد ترجمات بعد.' : 'No translations yet.']) :
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
            ])
        ]);
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

        return D.Div({ attrs: { class: 'space-y-2' } }, notes.map(function (note) {
            var style = tone[note.type] || tone.info;
            return D.Div({
                attrs: {
                    class: 'flex items-start justify-between gap-3 rounded-md border px-3 py-2 shadow-sm ' + style,
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

    function renderBody(db) {
        var data = db.data;
        var env = db.env;
        var activeLabel = getActiveTableLabel(data.tables, data.activeTable, env.lang) || 'Universal CRUD';

        var sidebar = UC.Sidebar({
            items: data.tables,
            activeId: data.activeTable,
            onSelectKey: 'crud:select-table'
        });

        var header = UC.Header({
            title: activeLabel,
            actions: [
                UC.Button({
                    key: 'crud:toggle-lang',
                    label: env.lang === 'ar' ? 'English' : 'العربية',
                    variant: 'ghost',
                    size: 'sm'
                }),
                UC.Button({
                    key: 'crud:toggle-theme',
                    icon: env.theme === 'light' ? '🌙' : '☀️',
                    variant: 'ghost',
                    size: 'sm'
                }),
                UC.Button({
                    key: 'crud:refresh',
                    icon: '🔄',
                    variant: 'outline',
                    size: 'sm'
                }),
                UC.Button({
                    key: 'crud:reseed',
                    label: env.lang === 'ar' ? 'إعادة تهيئة البيانات' : 'Reseed',
                    icon: '🌱',
                    variant: 'danger',
                    size: 'sm'
                })
            ]
        });

        var content;
        if (data.loading) {
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
            // Auto-detect columns from first record
            // Filter out internal fields
            var first = data.records[0];
            var columns = Object.keys(first).filter(function (k) {
                return !k.startsWith('_') && k !== 'translations' && !k.endsWith('_id');
            });

            var activeId = data.selectedRecord && (data.selectedRecord.id || data.selectedRecord.Id || data.selectedRecord.uuid);

            content = D.Div({ attrs: { class: 'space-y-4' } }, [
                D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
                    D.Div({ attrs: { class: 'w-full md:w-64' } }, [
                        UC.FormInput({
                            name: 'search',
                            value: data.searchTerm,
                            key: 'crud:search',
                            label: env.lang === 'ar' ? 'بحث سريع' : 'Quick Search',
                            placeholder: env.lang === 'ar' ? 'اكتب واضغط Enter للبحث' : 'Type and press Enter to search',
                        })
                    ]),
                    D.Div({ attrs: { class: 'flex items-center gap-2 justify-end' } }, [
                        UC.Button({
                            key: 'crud:create',
                            label: env.lang === 'ar' ? 'سجل جديد' : 'New Record',
                            icon: '➕',
                            variant: 'primary'
                        })
                    ])
                ]),

                D.Div({ attrs: { class: 'grid lg:grid-cols-5 gap-4' } }, [
                    D.Div({ attrs: { class: 'lg:col-span-3 space-y-3' } }, [
                        UC.Table({
                            columns: columns,
                            data: data.records,
                            activeId: activeId,
                            rowKey: 'crud:select-record'
                        })
                    ]),
                    D.Div({ attrs: { class: 'lg:col-span-2' } }, [
                        renderRecordEditor(db)
                    ])
                ])
            ]);
        } else {
            content = UC.Table({ columns: [], data: [] });
        }

        var notifications = renderNotifications(data, env);
        var bodyContent = D.Div({ attrs: { class: 'space-y-4' } }, [notifications, content].filter(Boolean));

        return UC.AppLayout(sidebar, header, bodyContent);
    }

    // ============================================================================
    // BOOTSTRAP
    // ============================================================================

    // Initialize Theme
    updateDocumentTheme(initialState.env.theme, initialState.env.lang);

    // Mishkah Bootstrap - Simple and Direct
    M.app.setBody(renderBody);
    var app = M.app.createApp(initialState, orders);
    app.mount('#app');

    // Expose reseed helper for static button usage
    global.manualReseed = function (opts) {
        return performReseed(app, opts);
    };
    global.UniversalReseed = global.manualReseed;

    // Load Initial Data
    loadTables(app);

})(window);
