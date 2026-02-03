(function (global) {
    'use strict';

    var M = global.Mishkah;
    var UC = global.UniversalComp;
    var UI = M.UI || {};
    var D = M.DSL;

    if (!M || !M.DSL || !M.app || !UC || !M.REST) {
        console.error('[SchemaCrud] Required libraries missing (Mishkah, DSL, App, UniversalComp, REST)');
        return;
    }

    // ============================================================================
    // SCHEMA HELPERS (Migrated from dashboard.js)
    // ============================================================================

    function isLikelyUuid(val) {
        return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(val);
    }

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

    function normalizeTableMeta(table, schemaInfo) {
        var moduleId = table.module_id || null;
        var settings = table.settings || {};
        var icon = (settings.icon) || table.icon || '📄';
        var type = moduleId || table.type || 'settings';
        return { type: type, module_id: moduleId, icon: icon, settings: settings };
    }

    function getFkDefs(schemaInfo, tableName) {
        if (!schemaInfo || !tableName) return [];
        var tableMap = schemaInfo.tableMap || {};
        var tableDef = tableMap[tableName] || tableMap[String(tableName).toLowerCase()];
        if (!tableDef || !tableDef.fkReferences) return [];
        return tableDef.fkReferences.map(function (ref) {
            return { name: ref.columnName, target: ref.targetTable };
        });
    }

    function collectFkDefs(schemaInfo, tableName, records) {
        if (!tableName) return [];
        return getFkDefs(schemaInfo, tableName);
    }

    function displayNameForRecord(record, tableName, schemaInfo, lang) {
        if (!record) return '';
        if (record.display_name && !isLikelyUuid(record.display_name)) return record.display_name;
        if (record.name && !isLikelyUuid(record.name)) return record.name;
        if (record.label && !isLikelyUuid(record.label)) return record.label;
        if (record.title && !isLikelyUuid(record.title)) return record.title;

        if (record.i18n) {
            var preferred = [lang, 'ar', 'en'].filter(Boolean);
            var langEntry = null;
            if (record.i18n.lang) {
                preferred.some(function (code) {
                    if (record.i18n.lang[code]) { langEntry = record.i18n.lang[code]; return true; }
                    return false;
                });
            }
            if (!langEntry) {
                preferred.some(function (code) {
                    if (record.i18n[code]) { langEntry = record.i18n[code]; return true; }
                    return false;
                });
            }
            if (langEntry) {
                if (langEntry.name) return langEntry.name;
                if (langEntry.label) return langEntry.label;
                if (langEntry.title) return langEntry.title;
            }
        }
        if (record.code && !isLikelyUuid(record.code)) return record.code;
        return record.id || record.Id || record.uuid || '';
    }

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

    function getTableGroups(tableName, schemaInfo, lang) {
        var tableMap = (schemaInfo && schemaInfo.tableMap) || {};
        var tableDef = tableMap[tableName] || tableMap[String(tableName).toLowerCase()];
        var defaultGroup = { id: 'basic', label: (lang === 'ar' ? 'البيانات الأساسية' : 'Basic Info') };

        if (!tableDef || !tableDef.settings || !tableDef.settings.groups) {
            return [defaultGroup];
        }

        var definedGroups = tableDef.settings.groups || [];
        if (!Array.isArray(definedGroups)) return [defaultGroup];

        return definedGroups.map(function (g) {
            return {
                id: g.id,
                label: (g.labels && (g.labels[lang] || g.labels.ar || g.labels.en)) || g.label || g.id
            };
        });
    }

    function enrichColumnsWithSchema(columnsMeta, schemaInfo, tableName) {
        if (!schemaInfo || !tableName) return columnsMeta;
        var tableMap = schemaInfo.tableMap || {};
        var tableDef = tableMap[tableName];
        if (!tableDef) return columnsMeta;

        // Merge schema-level column definitions if available
        // For now, simplify to just returning meta as is, but this is hook point
        return columnsMeta;
    }

    function resolveColumnLabel(col, lang) {
        var labels = col.labels || {};
        return labels[lang] || labels.ar || labels.en || humanizeTableName(col.name);
    }

    function resolveDefaultExpr(expr) {
        if (!expr || typeof expr !== 'string') return null;
        var normalized = expr.trim();
        if (!normalized) return null;
        if (normalized === 'now' || normalized === 'now()') return new Date().toISOString();
        if (normalized === 'today' || normalized === 'today()') return new Date().toISOString();
        if (normalized.indexOf('localStorage:') === 0) {
            var key = normalized.replace('localStorage:', '');
            try { return global.localStorage ? global.localStorage.getItem(key) : null; } catch (_err) { return null; }
        }
        return null;
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

    function buildSystemDefaults(userContext, columnsMeta) {
        // userContext: { company: {id}, branch: {id}, user: {id} }
        var defaults = {};
        var colNames = new Set((columnsMeta || []).map(function (c) { return c && c.name; }).filter(Boolean));
        var ctx = userContext || {};
        function has(name) { return colNames.has(name); }
        if (has('company_id') && ctx.company && ctx.company.id) defaults.company_id = ctx.company.id;
        if (has('branch_id') && ctx.branch && ctx.branch.id) defaults.branch_id = ctx.branch.id;
        if (has('user_insert') && ctx.user && ctx.user.id) defaults.user_insert = ctx.user.id;
        return defaults;
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

    function buildEmptyTranslations(languages, fields) {
        var translations = {};
        (languages || []).forEach(function (lang) {
            var code = lang.code || lang;
            var entry = {};
            (fields || []).forEach(function (f) { entry[f] = ''; });
            translations[code] = entry;
        });
        return translations;
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
        // payload.__strategy = baseline && Object.keys(baseline).length ? 'merge' : 'replace';
        // payload.__events = events;
        return payload;
    }

    function buildLangPayload(translationPayload) {
        var langPayload = {};
        Object.keys(translationPayload || {}).forEach(function (key) {
            if (!key || String(key).startsWith('__')) return;
            var entry = translationPayload[key];
            if (!entry || typeof entry !== 'object') return;
            langPayload[key] = entry;
        });
        return Object.keys(langPayload).length ? langPayload : null;
    }

    function getSequenceFieldSet(tableName, columnsMeta, schemaInfo) {
        var names = new Set();
        normalizeColumnsMeta(columnsMeta || []).forEach(function (col) {
            if (!col || !col.name) return;
            if (col.sequence || (col.default_expr && String(col.default_expr).startsWith('sequence:'))) {
                names.add(col.name);
            }
        });
        if (schemaInfo && tableName) {
            var tableDef = (schemaInfo.tableMap && (schemaInfo.tableMap[tableName] || schemaInfo.tableMap[String(tableName).toLowerCase()])) || null;
            var settings = tableDef && tableDef.settings;
            var sequences = settings && settings.sequences;
            if (sequences && typeof sequences === 'object') {
                Object.keys(sequences).forEach(function (key) {
                    if (key) names.add(key);
                });
            }
        }
        return names;
    }

    function buildSavePayload(config) {
        // config: { form, baseline, translations, translationBaseline, translationFields, meta, table, schemaInfo }
        var record = config.form || {};
        var baselineRecord = config.baseline || null;
        var translationPayload = computeTranslationPayload(
            config.translations,
            config.translationBaseline,
            [], // removals not yet tracked in simple modal
            config.translationFields
        );

        var patch = computeRecordPatch(baselineRecord, record);

        // Filter out sequence fields on CREATE
        if (!baselineRecord && config.meta) {
            var sequenceFields = getSequenceFieldSet(config.table, config.meta, config.schemaInfo);
            sequenceFields.forEach(function (name) {
                delete patch[name];
            });
        }

        var langPayload = buildLangPayload(translationPayload);
        return Object.assign({}, patch, langPayload ? { _lang: langPayload } : null);
    }

    function prepareCreateState(app, tableName, columnsMeta) {
        // ... (existing implementation)
        var state = app.getState();
        var normalizedMeta = normalizeColumnsMeta(columnsMeta || state.data.columnsMeta || []);

        // 1. Translations
        var fields = ensureTranslationFields([], {});
        var transCols = normalizedMeta.filter(function (c) { return c.source === 'lang'; }).map(function (c) { return c.name; });
        if (transCols.length) fields = transCols;

        var languages = state.data.languages || [{ code: 'en' }, { code: 'ar' }];
        var translations = buildEmptyTranslations(languages, fields);

        // 2. Defaults
        var draft = applyDefaultsFromColumnsMeta({}, normalizedMeta);

        // 3. System Defaults
        var userCtx = {
            company: state.data.companyInfo,
            branch: state.data.branchInfo,
            user: state.data.userInfo
        };
        if (!userCtx.company && state.data.session) userCtx.company = state.data.session.company;

        var sysDefaults = buildSystemDefaults(userCtx, normalizedMeta);
        Object.keys(sysDefaults).forEach(function (key) {
            if (draft[key] === undefined || draft[key] === null || draft[key] === '') {
                draft[key] = sysDefaults[key];
            }
        });

        var groups = getTableGroups(tableName, state.data.schemaInfo, state.env.lang);
        var defaultTab = (groups[0] && groups[0].id) || 'basic';

        return {
            form: draft,
            translations: translations,
            translationFields: fields,
            activeTab: defaultTab,
            languages: languages
        };
    }

    // ============================================================================
    // ORDERS / LOGIC
    // ============================================================================

    // Namespaced handlers to avoid collisions
    var orders = {
        'crud:generic:save': {
            on: ['click'],
            gkeys: ['crud:generic:save'],
            handler: async function (ev, ctx) {
                // Implementation pending
                console.log('Generic Save Triggered');
            }
        },
        'crud:generic:update': {
            on: ['input', 'change'],
            gkeys: ['crud:generic:update'],
            handler: function (ev, ctx) {
                // Implementation pending
            }
        }
    };

    // ============================================================================
    // RENDER HELPERS
    // ============================================================================

    function detectInputHeuristics(col) {
        var heuristics = { type: 'text', isTextarea: false };
        if (!col) return heuristics;

        var name = col.name || '';
        var dbType = (col.type || '').toLowerCase();

        if (dbType === 'text' || dbType === 'longtext' || dbType === 'mediumtext' || (col.settings && col.settings.input === 'textarea')) {
            heuristics.isTextarea = true;
            return heuristics;
        }

        if (dbType.includes('date') || name.endsWith('_at') || name.endsWith('_date') || name === 'dob') {
            heuristics.type = 'date';
            // Simple fallback for cleanup
            if (dbType.includes('time') || name.endsWith('_at')) { }
            return heuristics;
        }

        if (dbType.includes('int') || dbType === 'number' || dbType === 'decimal' || dbType === 'float') {
            heuristics.type = 'number';
            return heuristics;
        }

        return heuristics;
    }

    function renderField(field, value, error, context) {
        console.log('[renderField] Called for:', field.name, 'value:', value, 'context:', context);

        // context: { form, handleChange, handleBlur, fkOptions, lang, readOnly }
        var heuristics = detectInputHeuristics(field);
        var lang = context.lang || 'en';
        var label = resolveColumnLabel(field, lang);
        var readOnly = context.readOnly || false;

        if (!field || !field.name) {
            console.log('[renderField] SKIP - no field or name');
            return null;
        }
        var commonAttrs = {
            name: field.name,
            value: value || '',
            'data-field': field.name,
            disabled: readOnly,
            class: error ? 'border-red-500' : '',
            autocomplete: 'off'
        };
        var gkeyUpdate = 'crud:generic:update';

        // 1. Foreign Keys
        if (field.source === 'fk' || (field.name.endsWith('_id') && !heuristics.isTextarea)) {
            var target = field.target || (field.settings && field.settings.target);
            // If we have options loaded
            var refKey = field.name;
            // Often fkOptions are keyed by column name
            var options = (context.fkOptions && context.fkOptions[refKey]) || [];

            var control = D.Select({
                attrs: Object.assign({}, commonAttrs, { gkey: gkeyUpdate }),
            }, [
                D.Option({ attrs: { value: '' } }, ['-- ' + (context.lang === 'ar' ? 'اختر' : 'Select') + ' --']),
                options.map(function (opt) {
                    return D.Option({ attrs: { value: opt.value, selected: String(opt.value) === String(value) } }, [opt.label]);
                })
            ]);

            // Add (+) button if configured
            var wrapper;
            if (context.onAdd && field.settings && field.settings.no_quick_add !== true) {
                // Check if target table is valid for quick add (basic heuristic)
                var canAdd = true;
                if (canAdd) {
                    wrapper = D.Div({ class: 'flex gap-2' }, [
                        D.Div({ class: 'flex-1' }, [control]),
                        D.Button({
                            attrs: {
                                class: 'px-3 py-1 bg-green-50 text-green-600 border border-green-200 rounded hover:bg-green-100',
                                gkey: context.onAdd,
                                'data-table': field.target || (field.settings && field.settings.target),
                                'data-field': field.name,
                                title: context.lang === 'ar' ? 'إضافة جديد' : 'Add New'
                            }
                        }, ['+'])
                    ]);
                }
            }

            return UI.Field({
                label: label,
                error: error,
                control: wrapper || control
            });
        }

        // 2. Boolean
        if (field.component === 'boolean' || field.component === 'checkbox' || field.name.startsWith('is_')) {
            return D.Label({ class: 'flex items-center gap-2 cursor-pointer mt-6' }, [
                D.Input({
                    attrs: Object.assign({}, commonAttrs, { type: 'checkbox', checked: !!value, gkey: 'crud:generic:toggle' })
                }),
                D.Span({}, [label])
            ]);
        }

        // 3. Date/Time
        if (heuristics.type === 'date' || heuristics.type === 'time') {
            return UI.Field({
                label: label,
                error: error,
                control: D.Input({ attrs: Object.assign({}, commonAttrs, { type: heuristics.type, gkey: gkeyUpdate }) })
            });
        }

        // 4. Textarea
        if (heuristics.isTextarea) {
            return UI.Field({
                label: label,
                error: error,
                control: D.Textarea({
                    attrs: Object.assign({}, commonAttrs, { rows: 3, gkey: gkeyUpdate })
                }, [value || ''])
            });
        }

        // 5. Default Text
        var result = UI.Field({
            label: label,
            error: error,
            control: D.Input({ attrs: Object.assign({}, commonAttrs, { type: heuristics.type, gkey: gkeyUpdate }) })
        });
        console.log('[renderField] Returning for', field.name, ':', result);
        return result;
    }

    // ============================================================================
    // COMPONENTS
    // ============================================================================

    // DUPLICATE renderModal REMOVED - using the new version below at line ~842

    function renderManager(app, config) {
        // config: { 
        //   table, records, meta, loading, page, limit, total, searchTerm, labels,
        //   onSearch, onAdd, onRefresh, onPagePrev, onPageNext, onEdit, onCopy
        // }
        var state = (app && typeof app.getState === 'function') ? app.getState() : app;
        var lang = state.env.lang;
        var labels = config.labels || resolveTableLabels({ name: config.table, labels: {} });
        var tableLabel = labels[lang] || labels.ar || labels.en || config.table;

        // 1. Header
        var header = D.Div({ class: 'flex items-center justify-between p-4 border-b bg-white' }, [
            D.h2({ class: 'text-xl font-bold flex items-center gap-2' }, [
                D.Span({ class: 'text-2xl' }, [config.icon || '📄']),
                D.Span({}, [tableLabel])
            ]),
            D.Button({
                attrs: {
                    class: 'px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 flex items-center gap-2',
                    gkey: config.onAdd || 'crud:generic:add'
                }
            }, [
                D.Span({ class: 'text-lg' }, ['+']),
                D.Span({}, [lang === 'ar' ? 'إضافة جديد' : 'Add New'])
            ])
        ]);

        // 2. Toolbar (Search + Filters)
        var toolbar = D.Div({ class: 'flex items-center gap-4 p-4 bg-gray-50 border-b' }, [
            D.Div({ class: 'relative flex-1 max-w-md' }, [
                D.Input({
                    attrs: {
                        type: 'text',
                        placeholder: lang === 'ar' ? 'بحث...' : 'Search...',
                        value: config.searchTerm || '',
                        class: 'w-full pl-10 pr-4 py-2 rounded border focus:ring-2 focus:ring-primary focus:outline-none',
                        gkey: config.onSearch || 'crud:generic:search'
                    }
                }),
                D.Span({ class: 'absolute left-3 top-2.5 text-gray-400' }, ['🔍'])
            ]),
            D.Button({
                attrs: { class: 'p-2 rounded hover:bg-gray-200 text-gray-600', gkey: config.onRefresh || 'crud:generic:refresh', title: 'Refresh' }
            }, ['🔄'])
        ]);

        // 3. Data Grid
        var columns = normalizeColumnsMeta(config.meta || []).filter(function (c) { return c.is_visible !== false; });
        var thead = D.thead({ class: 'bg-gray-100' }, [
            D.tr({}, columns.map(function (col) {
                return D.th({ class: 'px-4 py-3 text-start font-medium text-gray-600 border-b' }, [resolveColumnLabel(col, lang)]);
            }).concat([D.th({ class: 'px-4 py-3 border-b w-24' }, [''])]))
        ]);

        var rows = config.loading ?
            [D.tr({}, [D.td({ attrs: { colspan: columns.length + 1, class: 'p-8 text-center text-gray-500' } }, [UI.Spinner()])])] :
            (config.records && config.records.length ? config.records.map(function (row) {
                return D.tr({ class: 'hover:bg-gray-50 border-b transition-colors' }, columns.map(function (col) {
                    var val = row[col.name];
                    if (typeof val === 'object' && val) val = displayNameForRecord(val, null, null, lang) || val.name || val.id;
                    return D.td({ class: 'px-4 py-3 text-gray-700' }, [String(val || '-')]);
                }).concat([
                    D.td({ class: 'px-4 py-3 flex justify-end gap-2' }, [
                        D.Button({
                            attrs: {
                                class: 'p-1 hover:bg-blue-50 text-blue-600 rounded',
                                gkey: config.onEdit || 'crud:generic:edit',
                                'data-id': row.id || row.Id || row.uuid
                            }
                        }, ['✏️']),
                        D.Button({
                            attrs: {
                                class: 'p-1 hover:bg-gray-100 text-gray-400 rounded',
                                gkey: config.onCopy || 'crud:generic:copy-id',
                                'data-id': row.id || row.Id || row.uuid
                            }
                        }, ['🆔'])
                    ])
                ]));
            }) : [D.tr({}, [D.td({ attrs: { colspan: columns.length + 1, class: 'p-8 text-center text-gray-500' } }, [lang === 'ar' ? 'لا توجد بيانات' : 'No records found'])])]);

        var table = D.Div({ class: 'flex-1 overflow-auto' }, [
            D.table({ class: 'w-full text-sm' }, [thead, D.tbody({}, rows)])
        ]);

        // 4. Pagination
        var totalPages = Math.ceil((config.total || 0) / (config.limit || 20));
        var pagination = D.Div({ class: 'flex items-center justify-between p-4 border-t bg-gray-50 text-sm' }, [
            D.Div({ class: 'text-gray-500' }, [
                lang === 'ar' ? `إجمالي: ${config.total}` : `Total: ${config.total}`
            ]),
            D.Div({ class: 'flex items-center gap-2' }, [
                D.Button({ attrs: { class: 'p-1 rounded hover:bg-gray-200', disabled: config.page <= 1, gkey: config.onPagePrev || 'crud:generic:page-prev' } }, ['◀']),
                D.Span({}, [` ${config.page} / ${totalPages || 1} `]),
                D.Button({ attrs: { class: 'p-1 rounded hover:bg-gray-200', disabled: config.page >= totalPages, gkey: config.onPageNext || 'crud:generic:page-next' } }, ['▶'])
            ])
        ]);

        return D.Div({ class: 'flex flex-col h-full bg-white rounded shadow-lg overflow-hidden' }, [
            header,
            toolbar,
            table,
            pagination
        ]);
    }

    // ============================================================================
    // EXPORT
    // ============================================================================

    // ============================================================================
    // ADVANCED HELPERS
    // ============================================================================

    function buildFkOptions(records, activeRecord, fkDefs, schemaInfo, lang, refCache) {
        var options = {};
        var baseCache = refCache || {};

        // 1. Load from Cache
        Object.keys(baseCache || {}).forEach(function (field) {
            var list = baseCache[field];
            if (!Array.isArray(list)) return; // Safety check

            list.forEach(function (entry) {
                if (!entry || !entry.value) return;
                var arr = options[field] || (options[field] = []);
                if (!arr.some(function (opt) { return opt.value === String(entry.value); })) {
                    arr.push({ value: String(entry.value), label: entry.label || entry.value });
                }
            });
        });

        // 2. Scan records for embedded objects (e.g. { area_id: 1, area: { id: 1, name: '...' } })
        var fkTargetMap = {};
        (fkDefs || []).forEach(function (fk) {
            if (fk && fk.name) {
                fkTargetMap[fk.name] = fk.target;
            }
        });

        function addOption(field, obj, id) {
            if (!id) return;
            if (typeof id === 'object') {
                id = id.id || id.Id || id.uuid || id.uid || null;
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
            label = label || (lang === 'ar' ? 'غير مسمى' : 'Unnamed') + ' (' + idValue.substring(0, 4) + ')';
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
        if (activeRecord) scanRow(activeRecord);

        return options;
    }

    // ============================================================================
    // EXPORTED COMPONENTS
    // ============================================================================

    function renderModal(app, config) {
        // config: { 
        //   open: bool, 
        //   table: string, 
        //   form: object,    // The record being edited 
        //   meta: array,     // Columns metadata
        //   groups: array,   // Field groups (optional)
        //   fkReferenceCache: obj,  // Raw FK cache (preferred over hardcoded fkOptions)
        //   fkOptions: obj,  // Pre-built options (fallback)
        //   translations: obj, // { en: { name: '...' }, ar: { ... } }
        //   translationFields: array, // ['name', 'display_name']
        //   languages: array, // [{ code: 'en', label: 'English' }, ...]
        //   errors: object,  // Validation errors
        //   tab: string,     // Active tab ID
        //   loading: bool, 
        //   title: string,
        //   readonly: bool,
        //   records: array   // Context records to scan for FKs
        // }
        var state = (app && typeof app.getState === 'function') ? app.getState() : app;
        if (!config.open) return null;

        var lang = state.env.lang;
        var dir = state.env.dir;

        // 1. Prepare FK Options
        var fkDefs = collectFkDefs(state.data.schemaInfo, config.table);
        var builtFkOptions = buildFkOptions(
            config.records || [],
            config.form,
            fkDefs,
            state.data.schemaInfo,
            lang,
            config.fkReferenceCache || state.data.fkReferenceCache || {}
        );
        // Merge with statically passed options
        var finalFkOptions = Object.assign({}, builtFkOptions, config.fkOptions || {});

        // 2. Prepare Meta & Groups
        var rawMeta = config.meta || [];
        var columns = normalizeColumnsMeta(rawMeta);
        console.log('[SchemaCrud.renderModal] columns after normalize:', columns.length);

        var groups = config.groups;
        if (!groups || !groups.length) {
            groups = getTableGroups(config.table, state.data.schemaInfo, lang);
        }
        console.log('[SchemaCrud.renderModal] groups:', groups);

        // Group columns
        var groupedCols = {};
        columns.forEach(function (col) {
            // Skip only if EXPLICITLY set to false (not just falsy)
            if (col.is_edit_show === false) return;
            if (String(col.name || '').toLowerCase() === 'display_name') return;
            if (col.source === 'lang' || col.name === 'translations' || col.name === 'i18n') return;
            var gid = col.group || (groups[0] && groups[0].id) || 'basic';
            if (!groupedCols[gid]) groupedCols[gid] = [];
            groupedCols[gid].push(col);
        });
        console.log('[SchemaCrud.renderModal] groupedCols:', groupedCols);

        // 3. Render Tabs
        var activeTab = config.tab || (groups[0] && groups[0].id) || 'basic';
        // Ensure active tab exists
        if (!groups.find(function (g) { return g.id === activeTab; })) activeTab = groups[0].id;
        console.log('[SchemaCrud.renderModal] activeTab:', activeTab);

        var tabsNav = D.Div({ class: 'flex border-b mb-4 overflow-x-auto' }, groups.map(function (g) {
            var isActive = g.id === activeTab;
            return D.Button({
                attrs: {
                    class: 'px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ' +
                        (isActive ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'),
                    gkey: 'crud:generic:tab',
                    'data-tab': g.id
                }
            }, [g.label]);
        }));

        // 4. Render Active Tab Content
        var activeFields = groupedCols[activeTab] || [];
        console.log('[SchemaCrud.renderModal] activeFields for tab', activeTab, ':', activeFields.length);
        var contentBlocks = [];

        // 4a. Translations (Only on first tab)
        if (activeTab === (groups[0] && groups[0].id) && config.translationFields && config.translationFields.length) {
            var transRows = (config.languages || [{ code: 'en' }, { code: 'ar' }]).map(function (l) {
                var code = l.code || l;
                var lLabel = l.label || code.toUpperCase();
                var rowTrans = (config.translations && config.translations[code]) || {};

                return D.tr({ class: 'border-b last:border-0' }, [
                    D.td({ class: 'p-2 w-32 bg-gray-50 text-xs font-bold text-gray-500 uppercase align-top' }, [
                        D.Div({ class: 'flex items-center gap-1' }, [
                            D.Span({}, [lLabel]),
                        ])
                    ]),
                    D.td({ class: 'p-2' }, [
                        D.Div({ class: 'space-y-2' }, config.translationFields.map(function (tf) {
                            return D.Div({ class: 'flex items-center gap-2' }, [
                                D.Label({ class: 'w-24 text-xs text-gray-400' }, [resolveColumnLabel({ name: tf, labels: {} }, lang)]),
                                D.Input({
                                    attrs: {
                                        class: 'flex-1 h-8 rounded border border-gray-200 px-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none',
                                        name: tf,
                                        'data-lang': code,
                                        value: rowTrans[tf] || '',
                                        gkey: 'crud:generic:update-translation',
                                        autocomplete: 'off'
                                    }
                                })
                            ]);
                        }))
                    ])
                ]);
            });

            contentBlocks.push(D.Div({ class: 'mb-6 border rounded-lg overflow-hidden' }, [
                D.table({ class: 'w-full text-sm' }, [
                    D.tbody({}, transRows)
                ])
            ]));
        }

        // 4b. Fields Grid
        console.log('[SchemaCrud.renderModal] Rendering', activeFields.length, 'fields. config.form:', config.form);

        var fieldsGrid = D.Div({ class: 'grid grid-cols-1 md:grid-cols-2 gap-4' }, activeFields.map(function (col) {
            var fieldValue = config.form ? config.form[col.name] : undefined;
            return renderField(col, fieldValue, config.errors && config.errors[col.name], {
                lang: lang,
                fkOptions: finalFkOptions,
                readOnly: config.loading || config.readonly,
                onAdd: config.onAddFk
            });
        }));
        contentBlocks.push(fieldsGrid);

        // 5. Footer Actions
        var footer = D.Div({ class: 'flex justify-end gap-2 mt-6 pt-4 border-t' }, [
            D.Button({
                attrs: {
                    class: 'px-4 py-2 rounded border hover:bg-gray-50',
                    gkey: 'crud:generic:close'
                }
            }, [lang === 'ar' ? 'إلغاء' : 'Cancel']),

            !config.readonly ? D.Button({
                attrs: {
                    class: 'px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2',
                    disabled: config.loading,
                    gkey: 'crud:generic:save'
                }
            }, [
                config.loading ? UI.Spinner({ class: 'w-4 h-4' }) : null,
                D.Span({}, [lang === 'ar' ? 'حفظ' : 'Save'])
            ]) : null
        ]);

        var modalContent = D.Div({ class: 'p-0' }, [
            tabsNav,
            D.Div({ class: 'space-y-4' }, contentBlocks),
            footer
        ]);

        return UI.Modal({
            open: true,
            title: config.title || (config.form && config.form.id ? (lang === 'ar' ? 'تعديل سجل' : 'Edit Record') : (lang === 'ar' ? 'إضافة جديد' : 'New Record')),
            size: 'lg',
            hideFooter: true, // We render our own footer
            closeGkey: 'crud:generic:close',
            content: modalContent
        });
    }

    global.ClinicSchemaCrud = {
        helpers: {
            normalizeTableMeta: normalizeTableMeta,
            normalizeColumnsMeta: normalizeColumnsMeta,
            collectFkDefs: collectFkDefs,
            displayNameForRecord: displayNameForRecord,
            getTableGroups: getTableGroups,
            resolveColumnLabel: resolveColumnLabel,
            detectInputHeuristics: detectInputHeuristics,
            buildFkOptions: buildFkOptions,
            prepareCreateState: prepareCreateState,
            ensureTranslationFields: ensureTranslationFields,
            applyDefaultsFromColumnsMeta: applyDefaultsFromColumnsMeta,
            buildSystemDefaults: buildSystemDefaults,
            buildEmptyTranslations: buildEmptyTranslations,
            buildSavePayload: buildSavePayload,
            cloneObject: cloneObject
        },
        renderModal: renderModal,
        renderManager: renderManager,
        orders: orders
    };

    console.log('[SchemaCrud] Library loaded v7 - Fixed visibility filter');

})(window);
