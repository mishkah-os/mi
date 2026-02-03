(function (global) {
    'use strict';

    var M = global.Mishkah;
    if (!M || !M.DSL) {
        console.error('[Universal UI] Mishkah DSL is required.');
        return;
    }

    var D = M.DSL;

    // ============================================================================
    // UNIVERSAL COMPONENTS - STRICT MISHKAH DSL
    // ============================================================================

    function AppLayout(sidebar, header, content) {
        return D.Div({
            attrs: { class: 'flex min-h-screen bg-[var(--background)] text-[var(--foreground)]' }
        }, [
            sidebar,
            D.Div({ attrs: { class: 'flex-1 flex flex-col min-w-0' } }, [
                header,
                D.Main({ attrs: { class: 'flex-1 p-6 overflow-y-auto' } }, [
                    content
                ])
            ])
        ]);
    }

    function Sidebar(props) {
        var items = props.items || [];
        var activeId = props.activeId;
        var onSelectKey = props.onSelectKey || 'crud:select-table';

        return D.Aside({
            attrs: { class: 'w-72 bg-[var(--card)] border-e border-[var(--border)] flex flex-col p-4 gap-2 h-screen' }
        }, [
            D.Div({ attrs: { class: 'flex items-center gap-3 px-2 py-4 mb-4 border-b border-[var(--border)]' } }, [
                D.Div({ attrs: { class: 'w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-white font-bold' } }, ['U']),
                D.Span({ attrs: { class: 'font-bold text-lg' } }, ['Universal CRUD'])
            ]),

            D.Div({ attrs: { class: 'text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider px-2' } }, ['Tables']),

            D.Nav({ attrs: { class: 'flex-1 overflow-y-auto space-y-1' } }, items.map(function (item) {
                var isActive = item.id === activeId;
                return D.Button({
                    attrs: {
                        type: 'button',
                        gkey: onSelectKey,
                        'data-table': item.id,
                        class: [
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                            isActive
                                ? 'bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-[var(--primary)] font-semibold'
                                : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-1)] hover:text-[var(--foreground)]'
                        ].join(' ')
                    }
                }, [
                    D.Span({}, [item.label || item.id])
                ]);
            }))
        ]);
    }

    function Header(props) {
        var title = props.title || 'Dashboard';
        var actions = props.actions || [];

        return D.Header({
            attrs: { class: 'h-16 flex items-center justify-between px-6 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur top-0 z-10 sticky' }
        }, [
            D.H1({ attrs: { class: 'text-xl font-bold' } }, [title]),
            D.Div({ attrs: { class: 'flex items-center gap-2' } }, actions)
        ]);
    }

    function Button(props) {
        var variant = props.variant || 'primary'; // primary, ghost, outline, danger
        var size = props.size || 'md'; // sm, md, lg
        var icon = props.icon;
        var label = props.label;
        var key = props.key;
        var attrs = props.attrs || {};

        var classes = [
            'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus:ring-2 focus:ring-offset-1',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
            variant === 'primary' ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]' :
                variant === 'ghost' ? 'bg-transparent hover:bg-[var(--muted)] text-[var(--foreground)]' :
                    variant === 'danger' ? 'bg-[var(--danger)] text-white hover:opacity-90' :
                        'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-1)]'
        ].join(' ');

        return D.Button({
            attrs: Object.assign({ type: 'button', gkey: key, class: classes }, attrs)
        }, [
            icon ? D.Span({}, [icon]) : null,
            label ? D.Span({}, [label]) : null
        ].filter(Boolean));
    }

    function Badge(text, color) {
        var bg = color === 'primary' ? 'bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]';
        return D.Span({
            attrs: { class: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + bg }
        }, [text]);
    }

    function AutoComplete(props) {
        var value = props.value || '';
        var placeholder = props.placeholder || '';
        var items = props.items || [];
        var open = !!props.open;
        var loading = !!props.loading;
        var onInputKey = props.onInputKey;
        var onSelectKey = props.onSelectKey;
        var actions = props.actions || [];
        var emptyText = props.emptyText || 'No results';
        var label = props.label || '';

        return D.Div({ attrs: { class: 'space-y-2' } }, [
            label ? D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)]' } }, [label]) : null,
            D.Div({ attrs: { class: 'relative' } }, [
                D.Input({
                    attrs: {
                        type: 'text',
                        value: value,
                        gkey: onInputKey,
                        placeholder: placeholder,
                        class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent'
                    }
                }),
                open ? D.Div({
                    attrs: { class: 'absolute z-20 mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg overflow-hidden' }
                }, [
                    loading ? D.Div({ attrs: { class: 'px-3 py-3 text-sm text-[var(--muted-foreground)]' } }, ['Loading...']) :
                        (items.length ? D.Ul({ attrs: { class: 'max-h-64 overflow-y-auto' } }, items.map(function (item) {
                            return D.Li({
                                attrs: {
                                    class: 'px-3 py-2 text-sm hover:bg-[var(--surface-1)] cursor-pointer',
                                    gkey: onSelectKey,
                                    'data-id': item.id,
                                    'data-label': item.label || ''
                                }
                            }, [item.label || item.id]);
                        })) : D.Div({ attrs: { class: 'px-3 py-3 text-sm text-[var(--muted-foreground)]' } }, [emptyText]))
                ]) : null
            ].filter(Boolean)),
            actions.length ? D.Div({ attrs: { class: 'flex items-center gap-2' } }, actions.map(function (action) {
                return Button({
                    key: action.key,
                    label: action.label,
                    icon: action.icon,
                    variant: action.variant || 'outline',
                    size: action.size || 'sm',
                    attrs: action.attrs || {}
                });
            })) : null
        ].filter(Boolean));
    }

    function resolveDisplayName(record, lang) {
        if (!record || typeof record !== 'object') return '';

        // Step 1: Try requested language translation first
        var i18n = record.i18n || {};
        var langEntry = (i18n.lang && i18n.lang[lang]) || i18n[lang] || null;

        if (langEntry) {
            var localName = langEntry.display_name || langEntry.name || langEntry.label || langEntry.title;
            if (localName) return localName;
        }

        // Step 2: Try direct base properties (usually English or base name)
        var direct = record.display_name || record.name || record.label || record.title || record.code;
        if (direct) return direct;

        // Step 3: Fallback to English if requested lang wasn't English
        var fallbackLang = 'en';
        if (lang !== fallbackLang) {
            var fallbackEntry = (i18n.lang && i18n.lang[fallbackLang]) || i18n[fallbackLang] || null;
            if (fallbackEntry) {
                var fbName = fallbackEntry.display_name || fallbackEntry.name || fallbackEntry.label || fallbackEntry.title;
                if (fbName) return fbName;
            }
        }

        // Step 4: Last resort - try ANY available language
        if (i18n.lang) {
            var langKeys = Object.keys(i18n.lang);
            for (var i = 0; i < langKeys.length; i++) {
                var anyEntry = i18n.lang[langKeys[i]];
                if (anyEntry) {
                    var anyName = anyEntry.display_name || anyEntry.name || anyEntry.label || anyEntry.title;
                    if (anyName) return anyName;
                }
            }
        }

        // Step 5: Never return ID - return empty string instead
        return '';
    }


    function resolveFkTarget(schemaInfo, tableName, fieldName) {
        if (!schemaInfo || !tableName || !fieldName) return null;
        var map = schemaInfo.tableMap || {};
        var def = map[tableName] || {};
        var fks = def.fkReferences || [];
        var match = fks.find(function (fk) { return fk && (fk.columnName === fieldName || fk.name === fieldName); });
        return match ? match.targetTable : null;
    }

    function resolveFkDisplay(value, targetTable, referenceData, lang) {
        if (!targetTable || !referenceData) return '';
        var refRows = referenceData[targetTable] || [];
        var id = value && typeof value === 'object' ? (value.id || value.Id || value.uuid || value.uid) : value;
        if (!id) return '';
        var match = refRows.find(function (row) {
            var rowId = row && (row.id || row.Id || row.uuid || row.uid);
            return String(rowId) === String(id);
        });
        if (!match) return '';
        return resolveDisplayName(match, lang);
    }

    function Table(props) {
        var columns = props.columns || [];
        var data = props.data || [];
        var onRowClick = props.onRowClick;
        var activeId = props.activeId;
        var rowKey = props.rowKey;
        var actions = props.actions || [];
        var visibleKeys = Array.isArray(props.visibleKeys) ? props.visibleKeys : null;
        var schemaInfo = props.schemaInfo || null;
        var referenceData = props.referenceData || null;
        var tableName = props.tableName || null;
        var lang = props.lang || 'ar';

        function getColumnKey(col) {
            if (typeof col === 'string') return col;
            return col && col.key ? col.key : '';
        }

        function getColumnLabel(col) {
            if (typeof col === 'string') return col;
            return (col && (col.label || col.key)) ? (col.label || col.key) : '';
        }

        if (visibleKeys && visibleKeys.length) {
            columns = columns.filter(function (col) {
                var key = getColumnKey(col);
                return key && visibleKeys.indexOf(key) !== -1;
            });
        }

        if (!data.length) {
            return D.Div({ attrs: { class: 'flex flex-col items-center justify-center p-12 text-[var(--muted-foreground)] border-2 border-dashed border-[var(--border)] rounded-xl' } }, [
                D.Div({ attrs: { class: 'text-4xl mb-2' } }, ['📭']),
                D.Div({}, ['No data available'])
            ]);
        }

        return D.Div({
            attrs: { class: 'w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm' }
        }, [
            D.Div({ attrs: { class: 'overflow-x-auto' } }, [
                D.Table({ attrs: { class: 'w-full text-center text-sm' } }, [
                    D.Thead({ attrs: { class: 'bg-[var(--surface-1)] border-b border-[var(--border)]' } }, [
                        D.Tr({}, columns.concat(actions.length ? [{ key: '__actions' }] : []).map(function (col) {
                            if (col.key === '__actions') {
                                return D.Th({ attrs: { class: 'px-4 py-3 font-semibold text-[var(--muted-foreground)] text-center' } }, ['⋯']);
                            }
                            return D.Th({ attrs: { class: 'px-4 py-3 font-semibold text-[var(--muted-foreground)] text-center' } }, [getColumnLabel(col)]);
                        }))
                    ]),
                    D.Tbody({ attrs: { class: 'divide-y divide-[var(--border)]' } }, data.map(function (row) {
                        var rowId = row && (row.id || row.Id || row.uuid || row.uid);
                        var rowAttrs = {
                            class: 'group hover:bg-[var(--muted)]/50 transition-colors' +
                                (rowId && rowId === activeId ? ' bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]' : '') +
                                (rowKey ? ' cursor-pointer' : ''),
                        };

                        if (rowKey && rowId) {
                            rowAttrs.gkey = rowKey;
                            rowAttrs['data-record-id'] = rowId;
                        }

                        // Add context menu support
                        if (props.contextMenuKey && rowId) {
                            rowAttrs['data-context-menu-key'] = props.contextMenuKey;
                        }

                        if (props.tableName) {
                            rowAttrs['data-table'] = props.tableName;
                        }

                        return D.Tr({ attrs: rowAttrs }, columns.concat(actions.length ? [{ key: '__actions' }] : []).map(function (col) {
                            if (col.key === '__actions') {
                                return D.Td({ attrs: { class: 'px-4 py-3' } }, [
                                    D.Div({ attrs: { class: 'flex items-center justify-center gap-1' } }, actions.map(function (action) {
                                        var actionAttrs = Object.assign({}, action.attrs || {});
                                        actionAttrs['data-record-id'] = rowId;
                                        if (props.tableName && !actionAttrs['data-table']) {
                                            actionAttrs['data-table'] = props.tableName;
                                        }
                                        return Button({
                                            key: action.key,
                                            label: action.label,
                                            icon: action.icon,
                                            variant: action.variant || 'ghost',
                                            size: action.size || 'sm',
                                            attrs: actionAttrs
                                        });
                                    }))
                                ]);
                            }
                            var key = getColumnKey(col);
                            var val = row[key];
                            var fkTarget = resolveFkTarget(schemaInfo, tableName, key);
                            var display = '';
                            var useBadge = false;

                            if (val && typeof val === 'object') {
                                display = resolveDisplayName(val, lang);
                                useBadge = !!display;
                            } else if (fkTarget) {
                                display = resolveFkDisplay(val, fkTarget, referenceData, lang);
                                useBadge = !!display;
                            }

                            if (useBadge) {
                                return D.Td({ attrs: { class: 'px-4 py-3' } }, [
                                    Badge(display, 'primary')
                                ]);
                            }

                            return D.Td({ attrs: { class: 'px-4 py-3 text-[var(--foreground)]' } }, [
                                String(val !== null && val !== undefined && val !== '' ? val : '—')
                            ]);
                        }));
                    }))
                ])
            ])
        ]);
    }

    function FormInput(props) {
        var label = props.label;
        var name = props.name;
        var value = props.value;
        var type = props.type || 'text';
        var placeholder = props.placeholder || '';
        var key = props.key;
        var attrs = props.attrs || {};

        var inputAttrs = {
            name: name,
            value: value || '',
            type: type,
            placeholder: placeholder,
            class: 'flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all'
        };

        if (attrs && typeof attrs === 'object') {
            Object.keys(attrs).forEach(function (k) {
                if (attrs[k] !== undefined && attrs[k] !== null) {
                    inputAttrs[k] = attrs[k];
                }
            });
        }

        if (key) {
            inputAttrs.gkey = key;
        }

        return D.Div({ attrs: { class: 'flex flex-col gap-1.5' } }, [
            label ? D.Label({ attrs: { class: 'text-sm font-medium text-[var(--foreground)]' } }, [label]) : null,
            D.Input({ attrs: inputAttrs })
        ].filter(Boolean));
    }

    // Export
    global.UniversalComp = {
        AppLayout: AppLayout,
        Sidebar: Sidebar,
        Header: Header,
        Button: Button,
        Table: Table,
        FormInput: FormInput,
        Badge: Badge,
        AutoComplete: AutoComplete
    };

})(window);
