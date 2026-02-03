/**
 * Scheduled Orders Module - Mishkah DSL Version
 * Fully compliant with Mishkah Golden Path architecture
 * This module exports pure functions that return DSL trees
 */

(function () {
    const M = typeof Mishkah !== 'undefined' ? Mishkah : null;
    if (!M) {
        console.error('[ScheduleModule] Mishkah is not available');
        return;
    }

    const D = M.DSL;
    const UI = M.UI;
    const U = M.utils;
    const { tw, token } = U.twcss || {};

    // Helper to get translations
    const getTexts = (db) => {
        const lang = db?.env?.lang || 'ar';
        const dict = db?.i18n?.dict || {};
        const t = (key, fallback = key) => {
            const entry = dict[key];
            if (!entry) return fallback;
            return entry[lang] || entry.en || entry.ar || fallback;
        };

        // Build text object from database
        return {
            title: t('pos:reservations:title', 'إدارة الحجوزات'),
            subtitle: t('pos:reservations:subtitle', 'عرض وإدارة الطلبات المجدولة'),
            empty: t('pos:reservations:empty', 'لا توجد حجوزات'),
            emptyDesc: t('pos:reservations:empty_desc', 'لا توجد حجوزات تطابق الفلتر الحالي'),
            close: t('ui:close', 'إغلاق'),
            filter: {
                pending: t('pos:filter:pending', 'قيد الانتظار'),
                converted: t('pos:filter:completed', 'مكتملة'),
                cancelled: t('pos:filter:cancelled', 'ملغية'),
                all: t('pos:filter:all', 'الكل')
            },
            label: {
                items: t('pos:label:items', 'الأصناف'),
                total: t('pos:label:total', 'الإجمالي'),
                tables: t('pos:label:tables', 'الطاولات'),
                duration: t('pos:unit:min', 'دقيقة')
            },
            action: {
                edit: t('pos:action:edit', 'تعديل/فتح'),
                confirm: t('pos:action:confirm', 'تأكيد'),
                print: t('pos:action:print', 'طباعة')
            },
            status: {
                pending: t('pos:status:pending', 'قيد الانتظار'),
                completed: t('pos:status:completed', 'مكتمل'),
                cancelled: t('pos:status:cancelled', 'ملغي')
            }
        };
    };

    /**
     * Main Modal Component (Pure DSL Function)
     * @param {Object} db - The database (state) object
     * @returns {DSLNode|null} - Modal DSL tree or null if not open
     */
    function SchedulesModal(db) {
        // Check if modal should be open
        if (!db?.ui?.modals?.schedules) return null;

        const t = getTexts(db);
        const schedulesState = db.ui?.schedules || { filter: 'pending', search: '' };
        const allSchedules = db.data?.schedules || [];
        const lang = db.env?.lang || 'ar';

        // Filter schedules based on UI state
        const filtered = allSchedules.filter(s => {
            if (schedulesState.filter !== 'all' && s.status !== schedulesState.filter) return false;

            // Search logic
            if (schedulesState.search) {
                const searchLower = schedulesState.search.toLowerCase();
                const customerName = (s.customerName || s.customer_name || '').toLowerCase();
                const customerPhone = (s.customerPhone || s.customer_phone || '').toLowerCase();
                const scheduleId = (s.id || '').toLowerCase();

                return customerName.includes(searchLower) ||
                    customerPhone.includes(searchLower) ||
                    scheduleId.includes(searchLower);
            }
            return true;
        });

        // Filter configuration
        const filters = [
            { key: 'pending', label: t.filter.pending, icon: '⏳' },
            { key: 'converted', label: t.filter.converted, icon: '✅' },
            { key: 'cancelled', label: t.filter.cancelled, icon: '❌' },
            { key: 'all', label: t.filter.all, icon: '📋' }
        ];

        // Build filter buttons
        const filterButtons = filters.map(f =>
            UI.Button({
                attrs: {
                    gkey: 'pos:schedules:filter',
                    'data-status': f.key,
                    class: tw`flex-1 ${schedulesState.filter === f.key ? 'ring-2 ring-primary bg-primary/10' : ''}`
                },
                variant: schedulesState.filter === f.key ? 'secondary' : 'ghost',
                size: 'sm'
            }, [
                D.Text.Span({ attrs: { class: tw`mr-2` } }, [f.icon]),
                f.label,
                D.Containers.Div({
                    attrs: { class: tw`ml-2 px-2 py-0.5 text-xs rounded-full bg-surface-2` }
                }, [
                    // Count schedules for this filter
                    allSchedules.filter(s => f.key === 'all' || s.status === f.key).length
                ])
            ])
        );

        // Search Input
        const searchInput = UI.Input({
            label: '',
            placeholder: 'بحث باسم العميل أو رقم الهاتف...',
            value: schedulesState.search,
            attrs: {
                gkey: 'pos:schedules:search', // Handler needed in posv3.js
                class: tw`w-full max-w-md`
            },
            icon: '🔍' // if supported, or standard input
        });

        // Render schedule cards
        const scheduleCards = filtered.length > 0
            ? filtered.map(schedule => renderScheduleCard(schedule, t, lang))
            : [renderEmptyState(t)];

        // Main modal content
        return UI.Modal({
            open: true,
            size: 'full', // Full screen as requested
            title: t.title,
            description: t.subtitle,
            title: t.title,
            description: t.subtitle,
            // Schedule cards grid
            content: D.Containers.Div({
                attrs: { class: tw`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto` }
            }, scheduleCards),
            actions: [
                UI.Button({
                    attrs: { gkey: 'ui:modal:close', class: tw`w-full` },
                    variant: 'ghost',
                    size: 'sm'
                }, [t.close])
            ]
        });
    }

    /**
     * Render a single schedule card
     */
    function renderScheduleCard(schedule, t, lang) {
        const payload = schedule.payload || {};
        const lines = Array.isArray(schedule.lines) && schedule.lines.length
            ? schedule.lines
            : (payload.lines || []);
        const totals = payload.totals || schedule.totals || {};
        const sequenceNum = payload.sequenceNumber
            ? `#${payload.sequenceNumber}`
            : schedule.id.substring(0, 8);

        const scheduledDate = new Date(schedule.scheduled_at || schedule.scheduledAt);
        const date = scheduledDate.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US');
        const time = scheduledDate.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const isPending = schedule.status === 'pending';
        const statusLabel = isPending
            ? t.status.pending
            : schedule.status === 'converted'
                ? t.status.completed
                : t.status.cancelled;

        // Status badge color classes (using CSS variables)
        const statusClass = `status-${schedule.status}`;

        return D.Containers.Div({
            attrs: {
                class: tw`bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden group border border-gray-200 dark:border-gray-700 transition-all hover:border-blue-500 hover:shadow-lg`
            }
        }, [
            // Header
            D.Containers.Div({ attrs: { class: tw`flex justify-between items-start` } }, [
                D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
                    D.Text.Span({
                        attrs: { class: tw`bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-mono px-2 py-1 rounded` }
                    }, [sequenceNum]),
                    UI.Badge({
                        text: statusLabel,
                        variant: isPending ? 'badge/outline' : schedule.status === 'converted' ? 'badge/solid' : 'badge/ghost'
                    })
                ]),
                D.Text.Span({
                    attrs: { class: tw`text-xs text-gray-500 dark:text-gray-400 font-medium` }
                }, [
                    `${schedule.duration_minutes || 60} ${t.label.duration} ⏱️`
                ])
            ]),

            // Body
            D.Containers.Div({ attrs: { class: tw`flex-1` } }, [

                D.Helpers.Divider(),

                // Info Grid
                D.Containers.Div({ attrs: { class: tw`grid grid-cols-2 gap-2 text-sm` } }, [
                    // Date
                    D.Containers.Div({ attrs: { class: tw`flex items-center gap-1` } }, [
                        D.Text.Span({}, ['📅']),
                        D.Text.Span({}, [formatDate(schedule.scheduledAt || schedule.scheduled_at, lang)])
                    ]),
                    // Time
                    D.Containers.Div({ attrs: { class: tw`flex items-center gap-1` } }, [
                        D.Text.Span({}, ['🕒']),
                        D.Text.Span({}, [formatTime(schedule.scheduledAt || schedule.scheduled_at, lang)])
                    ]),
                    // Items Count
                    D.Containers.Div({ attrs: { class: tw`flex items-center gap-1` } }, [
                        D.Text.Span({}, ['📦']),
                        D.Text.Span({}, [`${schedule.itemsCount || 0} ${t.label.items}`])
                    ]),
                    // Tables
                    (schedule.tableIds || []).length ?
                        D.Containers.Div({ attrs: { class: tw`flex items-center gap-1 col-span-2` } }, [
                            D.Text.Span({}, ['🪑']),
                            D.Text.Span({}, [`${t.label.tables}: ${(schedule.tableIds || []).join(', ')}`])
                        ]) : null
                ]), // End of Grid

                // Actions
                D.Containers.Div({ attrs: { class: tw`grid grid-cols-2 gap-2 mt-2` } }, [
                    isPending ? [
                        UI.Button({
                            attrs: {
                                gkey: 'pos:schedules:open-order',
                                'data-schedule-id': schedule.id,
                                class: tw`col-span-1`
                            },
                            variant: 'ghost',
                            size: 'sm'
                        }, ['✏️ ', t.action.edit]),
                        UI.Button({
                            attrs: {
                                gkey: 'pos:schedules:confirm',
                                'data-schedule-id': schedule.id,
                                class: tw`col-span-1`
                            },
                            variant: 'solid',
                            size: 'sm'
                        }, ['✅ ', t.action.confirm])
                    ] : [
                        UI.Button({
                            attrs: { class: tw`col-span-2` },
                            variant: 'ghost',
                            size: 'sm'
                        }, ['🖨️ ', t.action.print])
                    ]
                ].flat())
            ])
        ]);
    }

    /**
     * Render empty state
     */
    function renderEmptyState(t) {
        return D.Containers.Div({
            attrs: { class: tw`col-span-full flex flex-col items-center justify-center py-20 text-gray-400` }
        }, [
            D.Text.Span({ attrs: { class: tw`text-6xl mb-4 opacity-50` } }, ['📅']),
            D.Text.H3({ attrs: { class: tw`text-xl font-medium text-gray-600 dark:text-gray-300` } }, [t.empty]),
            D.Text.P({ attrs: { class: tw`text-sm` } }, [t.emptyDesc])
        ]);
    }

    // Export to global scope for use in posv3.js
    if (typeof window !== 'undefined') {
        window.ScheduleModule = {
            SchedulesModal,
            // Keep API methods for backend communication
            async loadSchedules(filters = {}) {
                const branchId = window.POS_CONFIG?.branchId || localStorage.getItem('pos_branch_id') || 'dar';
                const moduleId = window.POS_CONFIG?.moduleId || localStorage.getItem('pos_module_id') || 'pos';

                const params = new URLSearchParams();
                if (filters.status && filters.status !== 'all') params.append('status', filters.status);

                const response = await fetch(`/api/branches/${branchId}/modules/${moduleId}/schedule?${params}`);
                if (!response.ok) throw new Error('Failed to load schedules');

                const result = await response.json();
                return result.schedules || [];
            },

            async confirmSchedule(scheduleId) {
                const branchId = window.POS_CONFIG?.branchId || localStorage.getItem('pos_branch_id') || 'dar';
                const moduleId = window.POS_CONFIG?.moduleId || localStorage.getItem('pos_module_id') || 'pos';

                const response = await fetch(`/api/branches/${branchId}/modules/${moduleId}/schedule/${scheduleId}/confirm`, {
                    method: 'POST'
                });
                if (!response.ok) throw new Error('Failed to confirm schedule');
                return await response.json();
            }
        };

        console.log('✅ ScheduleModule (DSL Version) initialized');
    }
})();
