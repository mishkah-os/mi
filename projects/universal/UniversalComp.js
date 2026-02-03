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

    function Table(props) {
        var columns = props.columns || [];
        var data = props.data || [];
        var onRowClick = props.onRowClick;
        var activeId = props.activeId;
        var rowKey = props.rowKey;

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
                D.Table({ attrs: { class: 'w-full text-left text-sm' } }, [
                    D.Thead({ attrs: { class: 'bg-[var(--surface-1)] border-b border-[var(--border)]' } }, [
                        D.Tr({}, columns.map(function (col) {
                            return D.Th({ attrs: { class: 'px-4 py-3 font-semibold text-[var(--muted-foreground)]' } }, [col]);
                        }))
                    ]),
                    D.Tbody({ attrs: { class: 'divide-y divide-[var(--border)]' } }, data.map(function (row) {
                        var rowId = row && (row.id || row.Id || row.uuid || row.uid);
                        var rowAttrs = {
                            class: 'group hover:bg-[var(--muted)]/50 transition-colors' + (rowId && rowId === activeId ? ' bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]' : ''),
                        };

                        if (rowKey && rowId) {
                            rowAttrs.gkey = rowKey;
                            rowAttrs['data-record-id'] = rowId;
                        }

                        return D.Tr({ attrs: rowAttrs }, columns.map(function (col) {
                            var val = row[col];

                            // Smart rendering for Objects (FKs)
                            if (val && typeof val === 'object' && val.name) {
                                return D.Td({ attrs: { class: 'px-4 py-3' } }, [
                                    Badge(val.name, 'primary')
                                ]);
                            }

                            return D.Td({ attrs: { class: 'px-4 py-3 text-[var(--foreground)]' } }, [
                                String(val !== null && val !== undefined ? val : '—')
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

        var inputAttrs = {
            name: name,
            value: value || '',
            type: type,
            placeholder: placeholder,
            class: 'flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all'
        };

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
        Badge: Badge
    };

})(window);
