(function (global) {
  const M = global.Mishkah;
  if (!M || !M.utils || !M.DSL) return;

  const U = M.utils;
  const D = M.DSL;
  const { tw, cx } = U.twcss;

  const TEXT = {
    ar: {
      title: 'لوحة الإغلاق المالي',
      branchUnknown: 'فرع غير معروف',
      controls: {
        theme: 'الثيم',
        light: 'نهاري',
        dark: 'ليلي',
        language: 'اللغة',
        arabic: 'عربي',
        english: 'إنجليزي'
      },
      actions: {
        reset: 'إعادة ضبط الطلبات',
        close: 'تأكيد إغلاق اليوم'
      },
      metrics: {
        totalOrders: 'إجمالي الطلبات',
        averageOrderValue: 'متوسط قيمة الطلب',
        totalDue: 'إجمالي المستحق',
        totalPaid: 'إجمالي المدفوع',
        paidOrders: 'طلبات مدفوعة',
        openOrders: 'طلبات مفتوحة',
        outstanding: 'مبالغ غير محصلة'
      },
      payments: {
        heading: 'توزيع المدفوعات حسب الوسيلة',
        empty: 'لا توجد مدفوعات مسجلة بعد.'
      },
      orders: {
        heading: 'أحدث الطلبات المغلقة',
        empty: 'لا توجد طلبات مغلقة حتى الآن.',
        columns: {
          order: 'الطلب',
          type: 'النوع',
          status: 'الحالة',
          payment: 'الدفع',
          paid: 'المدفوع',
          total: 'الإجمالي',
          opened: 'وقت الفتح'
        },
        showing: (limit, total) => `عرض ${limit} من ${total} طلبًا.`
      },
      shifts: {
        heading: 'الورديات',
        selection: 'اختر الوردية',
        all: 'جميع الورديات',
        lastClosed: 'آخر وردية مغلقة',
        noClosed: 'لا توجد ورديات مغلقة بعد.',
        openEmpty: 'لا توجد ورديات مفتوحة حاليًا.',
        status: 'الحالة',
        approved: 'مُعتمد',
        closed: 'مغلقة',
        open: 'مفتوحة',
        filterLabel: 'تصفية حسب الوردية:',
        userName: 'المستخدم:',
        openedDate: 'تاريخ الفتح:',
        noShifts: 'لا توجد ورديات متاحة'
      },
      orderFilters: {
        heading: 'نوع الطلبات',
        open: 'طلبات مفتوحة',
        openSub: 'غير محصلة',
        closed: 'طلبات مغلقة',
        closedSub: 'مدفوعة بالكامل',
        openNote: 'للاطلاع فقط - لا يمكن إغلاقها',
        closedNote: 'قابلة للإغلاق النهائي'
      },
      shiftTable: {
        userName: 'المستخدم',
        opened: 'تاريخ الفتح',
        completedOrders: 'طلبات مكتملة',
        openOrders: 'طلبات مفتوحة',
        payments: 'التحصيلات',
        total: 'الإجمالي',
        count: 'العدد',
        value: 'القيمة',
        noData: 'لا توجد بيانات',
        empty: 'لا توجد ورديات متاحة',
        total: 'الإجمالي الكلي'
      },
      shiftHeader: {
        allShifts: 'ملخص جميع الورديات',
        specificShift: 'تفاصيل الوردية',
        openCount: 'ورديات مفتوحة',
        user: 'المستخدم',
        email: 'البريد الإلكتروني',
        opened: 'تاريخ الفتح',
        closed: 'تاريخ الغلق',
        status: 'الحالة',
        backToAll: 'عرض الكل'
      },
      status: {
        resetSuccess: 'تم إعادة ضبط الطلبات.',
        resetCancelled: 'تم إلغاء إعادة الضبط.',
        resetPending: 'جاري إعادة ضبط البيانات...',
        resetError: 'تعذر إعادة ضبط البيانات.',
        resetNetwork: 'تعذر الوصول إلى خدمة إعادة الضبط.',
        closingPending: 'جارٍ تنفيذ إغلاق اليوم...',
        closingSuccess: 'تم إرسال الإغلاق بنجاح (تجريبي).',
        closingError: 'فشل إرسال الإغلاق التجريبي.',
        approveSuccess: 'تم اعتماد الوردية بنجاح.',
        approveError: 'فشل اعتماد الوردية.'
      }
    },
    en: {
      title: 'Finance Closing Dashboard',
      branchUnknown: 'Unknown branch',
      controls: {
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        language: 'Language',
        arabic: 'Arabic',
        english: 'English'
      },
      actions: {
        reset: 'Reset Orders',
        close: 'Confirm Day Close'
      },
      metrics: {
        totalOrders: 'Total Orders',
        averageOrderValue: 'Average Order Value',
        totalDue: 'Total Due',
        totalPaid: 'Total Paid',
        paidOrders: 'Paid Orders',
        openOrders: 'Open Orders',
        outstanding: 'Outstanding Amount'
      },
      payments: {
        heading: 'Payments by Method',
        empty: 'No payments recorded yet.'
      },
      orders: {
        heading: 'Latest Closed Orders',
        empty: 'No closed orders yet.',
        columns: {
          order: 'Order',
          type: 'Type',
          status: 'Status',
          payment: 'Payment',
          paid: 'Paid',
          total: 'Total',
          opened: 'Opened At'
        },
        showing: (limit, total) => `Showing ${limit} of ${total} orders.`
      },
      shifts: {
        heading: 'Shifts',
        selection: 'Select Shift',
        all: 'All Shifts',
        lastClosed: 'Latest Closed Shift',
        noClosed: 'No closed shifts yet.',
        openEmpty: 'No open shifts right now.',
        status: 'Status',
        approved: 'Approved',
        closed: 'Closed',
        open: 'Open',
        filterLabel: 'Filter by Shift:',
        userName: 'User:',
        openedDate: 'Opened:',
        noShifts: 'No shifts available'
      },
      orderFilters: {
        heading: 'Order Type',
        open: 'Open Orders',
        openSub: 'Unpaid',
        closed: 'Closed Orders',
        closedSub: 'Fully Paid',
        openNote: 'View only - cannot be closed',
        closedNote: 'Ready for final closure'
      },
      shiftTable: {
        userName: 'User',
        opened: 'Opened At',
        completedOrders: 'Completed Orders',
        openOrders: 'Open Orders',
        payments: 'Payments',
        total: 'Total',
        count: 'Count',
        value: 'Value',
        noData: 'No data',
        empty: 'No shifts available',
        total: 'Grand Total'
      },
      shiftHeader: {
        allShifts: 'All Shifts Summary',
        specificShift: 'Shift Details',
        openCount: 'Open Shifts',
        user: 'User',
        email: 'Email',
        opened: 'Opened At',
        closed: 'Closed At',
        status: 'Status',
        backToAll: 'Show All'
      },
      status: {
        resetSuccess: 'Orders reset successfully.',
        resetCancelled: 'Reset cancelled.',
        resetPending: 'Resetting transaction data...',
        resetError: 'Failed to reset orders.',
        resetNetwork: 'Unable to reach the reset service.',
        closingPending: 'Submitting closing data...',
        closingSuccess: 'Closing submitted successfully (demo).',
        closingError: 'Demo closing submission failed.',
        approveSuccess: 'Shift approved successfully.',
        approveError: 'Failed to approve shift.'
      }
    }
  };

  const getTexts = (lang = 'ar') => TEXT[lang] || TEXT.ar;

  const ensureNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const formatCurrency = (amount, options = {}) => {
    const currency = options.currency || 'EGP';
    const lang = options.lang || 'ar';
    const locale = options.locale || (lang === 'en' ? 'en-US' : 'ar-EG');
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(ensureNumber(amount));
    } catch (_err) {
      return `${ensureNumber(amount).toFixed(2)} ${currency}`;
    }
  };

  const intentPalette = {
    primary: {
      wrapper: tw`bg-sky-500/10 border border-sky-400/30`,
      accent: tw`text-sky-200`
    },
    success: {
      wrapper: tw`bg-emerald-500/10 border border-emerald-400/30`,
      accent: tw`text-emerald-200`
    },
    warning: {
      wrapper: tw`bg-amber-500/10 border border-amber-400/30`,
      accent: tw`text-amber-200`
    },
    danger: {
      wrapper: tw`bg-rose-500/10 border border-rose-500/30`,
      accent: tw`text-rose-200`
    },
    neutral: {
      wrapper: tw`bg-slate-800/60 border border-slate-700/60`,
      accent: tw`text-slate-200`
    }
  };

  const MetricCard = (props = {}, lang = 'ar', currency = 'EGP') => {
    const intent = intentPalette[props.intent || 'neutral'] || intentPalette.neutral;
    const value = props.asCurrency
      ? formatCurrency(props.value, { currency, lang })
      : (props.value == null ? '—' : props.value);
    return D.Containers.Article(
      {
        attrs: {
          class: cx(
            tw`rounded-2xl p-5 shadow-lg shadow-slate-950/40 backdrop-blur-xl transition hover:shadow-slate-900/70`,
            intent.wrapper,
            'finance-card'
          )
        }
      },
      [
        D.Text.Small({ attrs: { class: tw`block text-xs font-semibold tracking-wide text-slate-300` } }, [
          props.label || ''
        ]),
        D.Text.H3({ attrs: { class: cx(tw`mt-3 text-2xl font-black tracking-tight`, intent.accent) } }, [value]),
        props.subLabel
          ? D.Text.Small(
            { attrs: { class: tw`mt-2 block text-xs text-slate-400` } },
            [props.subLabel]
          )
          : null
      ].filter(Boolean)
    );
  };

  const PaymentRow = (entry, lang = 'ar', currency = 'EGP', totalPayments = 0) => {
    const ratio = totalPayments > 0 ? Math.min(100, Math.round((ensureNumber(entry.amount) / totalPayments) * 100)) : 0;
    return D.Containers.Div(
      {
        attrs: {
          class: cx(
            tw`rounded-xl border border-slate-800/70 bg-slate-900/60 p-4 transition hover:border-slate-700 hover:bg-slate-900`,
            'finance-panel',
            'finance-row'
          )
        }
      },
      [
        D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-4` } }, [
          D.Containers.Div({ attrs: { class: tw`flex items-center gap-3` } }, [
            D.Text.Span(
              {
                attrs: {
                  class: tw`flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xl`
                }
              },
              [entry.icon || '💳']
            ),
            D.Containers.Div({}, [
              D.Text.Span({ attrs: { class: tw`text-sm font-semibold text-slate-100` } }, [
                entry.label || entry.methodId || '—'
              ]),
              D.Text.Small({ attrs: { class: tw`text-xs text-slate-400` } }, [entry.typeLabel || entry.type || ''])
            ])
          ]),
          D.Text.Span(
            { attrs: { class: cx(tw`text-base font-bold text-slate-100`, 'finance-positive') } },
            [formatCurrency(entry.amount, { currency, lang })]
          )
        ]),
        D.Containers.Div({ attrs: { class: tw`mt-3 h-1.5 rounded-full bg-slate-800` } }, [
          D.Containers.Div({
            attrs: {
              class: tw`h-full rounded-full bg-sky-500 transition-all`,
              style: `width:${ratio}%`
            }
          })
        ]),
        D.Text.Small({ attrs: { class: tw`mt-2 block text-xs text-slate-500` } }, [
          ratio ? `${ratio}%` : '0%'
        ])
      ]
    );
  };

  const OrdersTable = (orders = [], lookups = {}, lang = 'ar', currency = 'EGP') => {
    const t = getTexts(lang);
    if (!orders.length) {
      return D.Containers.Div(
        {
          attrs: {
            class: cx(
              tw`rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6 text-center text-slate-400`,
              'finance-panel',
              'finance-table'
            )
          }
        },
        [t.orders.empty]
      );
    }
    const limit = 6;
    const rows = orders.slice(0, limit).map((order) => {
      const orderType =
        lookups.types?.get(order.orderTypeId) ||
        lookups.types?.get(order.order_type_id) ||
        lookups.types?.get(order.type) ||
        '';
      const status = lookups.statuses?.get(order.statusId) || lookups.statuses?.get(order.status_id) || '';
      const payment = lookups.payments?.get(order.paymentStateId) || lookups.payments?.get(order.payment_state_id) || '';
      const due = formatCurrency(order.totalDue ?? order.total_due ?? order.totals?.due ?? order.subtotal ?? 0, { currency, lang });
      const paid = formatCurrency(order.totalPaid ?? order.total_paid ?? order.totals?.paid ?? 0, { currency, lang });
      const openedAt = order.openedAt || order.opened_at || order.createdAt || order.created_at;
      const opened = openedAt ? new Date(openedAt).toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG') : '—';
      return D.Tables.Tr({ attrs: { class: tw`border-b border-slate-800/60 last:border-b-0` } }, [
        D.Tables.Td({ attrs: { class: tw`whitespace-nowrap py-3 text-sm text-slate-200` } }, [order.id || '—']),
        D.Tables.Td({ attrs: { class: tw`py-3 text-sm text-slate-300` } }, [orderType || '—']),
        D.Tables.Td({ attrs: { class: tw`py-3 text-sm text-slate-300` } }, [status || '—']),
        D.Tables.Td({ attrs: { class: tw`py-3 text-sm text-slate-300` } }, [payment || '—']),
        D.Tables.Td({ attrs: { class: cx(tw`py-3 text-sm font-semibold text-emerald-300`, 'finance-positive') } }, [paid]),
        D.Tables.Td({ attrs: { class: tw`py-3 text-sm text-slate-200` } }, [due]),
        D.Tables.Td({ attrs: { class: tw`py-3 text-xs text-slate-400` } }, [opened])
      ]);
    });

    return D.Containers.Div(
      {
        attrs: {
          class: cx(
            tw`overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/40`,
            'finance-panel',
            'finance-table'
          )
        }
      },
      [
        D.Tables.Table({ attrs: { class: tw`min-w-full divide-y divide-slate-800/70` } }, [
          D.Tables.Thead({}, [
            D.Tables.Tr({ attrs: { class: tw`bg-slate-900/60` } }, [
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.order
              ]),
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.type
              ]),
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.status
              ]),
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.payment
              ]),
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.paid
              ]),
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.total
              ]),
              D.Tables.Th({ attrs: { class: tw`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400` } }, [
                t.orders.columns.opened
              ])
            ])
          ]),
          D.Tables.Tbody({}, rows)
        ]),
        orders.length > limit
          ? D.Containers.Div(
            {
              attrs: {
                class: cx(
                  tw`border-t border-slate-800/60 bg-slate-900/40 px-4 py-3 text-center text-xs text-slate-400`,
                  'finance-panel'
                )
              }
            },
            [t.orders.showing(limit, orders.length)]
          )
          : null
      ]
    );
  };

  const ShiftHeader = (shiftSummaries = [], selectedShiftId = null, allShifts = [], lang = 'ar') => {
    const t = getTexts(lang);

    // Case 1: No specific shift selected (All Shifts Mode)
    if (!selectedShiftId) {
      const openShiftsCount = allShifts.filter(s => !s.isClosed && s.status !== 'closed' && s.status !== 'approved').length;

      return D.Containers.Div(
        { attrs: { class: tw`mb-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-6` } },
        [
          D.Containers.Div({ attrs: { class: tw`flex items-center justify-between` } }, [
            D.Containers.Div({}, [
              D.Text.H1({ attrs: { class: tw`text-2xl font-bold text-sky-100` } }, [t.shiftHeader.allShifts]),
              D.Text.P({ attrs: { class: tw`mt-1 text-sm text-sky-200/70` } }, [
                `${t.shiftHeader.openCount}: ${openShiftsCount}`
              ])
            ]),
            D.Containers.Div({ attrs: { class: tw`rounded-full bg-sky-500/20 p-3` } }, [
              D.Text.Span({ attrs: { class: tw`text-3xl` } }, ['📊'])
            ])
          ])
        ]
      );
    }

    // Case 2: Specific Shift Selected
    const selectedShiftSummary = shiftSummaries.find(s => s.shiftId === selectedShiftId);
    const shiftData = selectedShiftSummary?.shift || allShifts.find(s => (s.id || s.shift_id) === selectedShiftId);

    if (!shiftData) return null; // Should not happen

    const userName = shiftData.metadata?.userName || shiftData.cashierName || 'Unknown';
    const email = shiftData.metadata?.userEmail || '';
    const openedAt = new Date(shiftData.openedAt || shiftData.opened_at).toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG');
    const closedAt = (shiftData.closedAt || shiftData.closed_at)
      ? new Date(shiftData.closedAt || shiftData.closed_at).toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG')
      : '—';
    const status = shiftData.status === 'approved' ? t.shifts.approved : (shiftData.status === 'closed' ? t.shifts.closed : t.shifts.open);

    return D.Containers.Div(
      { attrs: { class: tw`mb-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6` } },
      [
        D.Containers.Div({ attrs: { class: tw`flex flex-col gap-4 md:flex-row md:items-center md:justify-between` } }, [
          // User Info
          D.Containers.Div({ attrs: { class: tw`flex items-start gap-4` } }, [
            D.Containers.Div({ attrs: { class: tw`flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/20 text-xl` } }, ['👤']),
            D.Containers.Div({}, [
              D.Text.H2({ attrs: { class: tw`text-xl font-bold text-indigo-100` } }, [userName]),
              email && D.Text.P({ attrs: { class: tw`text-xs text-indigo-300` } }, [email]),
              D.Containers.Div({ attrs: { class: tw`mt-2 flex items-center gap-2` } }, [
                D.Text.Span({ attrs: { class: tw`rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-200` } }, [status])
              ])
            ])
          ]),

          // Dates & Actions
          D.Containers.Div({ attrs: { class: tw`flex flex-col items-end gap-2` } }, [
            D.Containers.Div({ attrs: { class: tw`text-right` } }, [
              D.Text.Small({ attrs: { class: tw`block text-[10px] text-slate-400` } }, [t.shiftHeader.opened]),
              D.Text.Span({ attrs: { class: tw`block text-sm text-slate-200` } }, [openedAt])
            ]),
            closedAt !== '—' && D.Containers.Div({ attrs: { class: tw`text-right` } }, [
              D.Text.Small({ attrs: { class: tw`block text-[10px] text-slate-400` } }, [t.shiftHeader.closed]),
              D.Text.Span({ attrs: { class: tw`block text-sm text-slate-200` } }, [closedAt])
            ]),

            // Back Button (to clear filter)
            D.Select({
              attrs: {
                class: tw`mt-2 cursor-pointer text-xs text-sky-400 hover:text-sky-300 hover:underline`,
                value: '', // Reset value
                gkey: 'finance:shift:select-change' // Reuse existing handler with empty value
              },
              events: { change: (e) => e.target.value = '' } // Visual reset only
            }, [
              D.Option({ attrs: { value: '' } }, [t.shiftHeader.backToAll])
            ])
          ])
        ])
      ]
    );
  };

  const ShiftSummaryTable = (shiftSummaries = [], selectedShiftId = null, lang = 'ar', currency = 'EGP') => {
    const t = getTexts(lang);

    if (!shiftSummaries.length) {
      return D.Containers.Div(
        {
          attrs: {
            class: cx(
              tw`rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6 text-center text-slate-400`,
              'finance-panel'
            )
          }
        },
        [t.shiftTable.empty]
      );
    }

    const rows = shiftSummaries.map((summary) => {
      const isTotal = summary.isTotal;
      const isSelected = selectedShiftId === summary.shiftId;
      const { completedOrders, openOrders, paymentBreakdown } = summary;

      // Format date
      const openedDate = summary.openedAt
        ? new Date(summary.openedAt).toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
        : (isTotal ? '' : '—');

      return D.Tables.Tr(
        {
          attrs: {
            class: cx(
              tw`border-b border-slate-800/60 transition-colors`,
              isTotal
                ? tw`bg-slate-800/80 font-bold hover:bg-slate-800/90`
                : (isSelected ? tw`bg-sky-500/10` : tw`hover:bg-slate-800/30`)
            ),
            gkey: !isTotal ? 'finance:shift:select' : undefined,
            'data-shift-id': !isTotal ? summary.shiftId : undefined
          }
        },
        [
          // User Name (or Total Label)
          D.Tables.Td(
            { attrs: { class: cx(tw`py-4 px-4 text-sm font-semibold`, isTotal ? tw`text-sky-300` : tw`text-slate-100`) } },
            [isTotal ? t.shiftTable.total : summary.userName]
          ),

          // Opened Date
          D.Tables.Td(
            { attrs: { class: tw`py-4 px-4 text-xs text-slate-300` } },
            [openedDate]
          ),

          // Completed Orders (Count + Value)
          D.Tables.Td(
            { attrs: { class: tw`py-4 px-4 text-center` } },
            [
              D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
                D.Text.Span(
                  { attrs: { class: tw`block text-lg font-bold text-emerald-300` } },
                  [String(completedOrders.count)]
                ),
                D.Text.Small(
                  { attrs: { class: tw`block text-xs text-emerald-400/70` } },
                  [formatCurrency(completedOrders.paid, { currency, lang })]
                )
              ])
            ]
          ),

          // Open Orders (Count + Value)
          D.Tables.Td(
            { attrs: { class: tw`py-4 px-4 text-center` } },
            [
              D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
                D.Text.Span(
                  { attrs: { class: tw`block text-lg font-bold text-amber-300` } },
                  [String(openOrders.count)]
                ),
                D.Text.Small(
                  { attrs: { class: tw`block text-xs text-amber-400/70` } },
                  [formatCurrency(openOrders.total, { currency, lang })]
                )
              ])
            ]
          ),

          // Payment Breakdown
          D.Tables.Td(
            { attrs: { class: tw`py-4 px-4` } },
            [
              paymentBreakdown.length > 0
                ? D.Containers.Div(
                  { attrs: { class: tw`flex flex-wrap gap-2` } },
                  paymentBreakdown.slice(0, 3).map(payment =>
                    D.Containers.Div(
                      { attrs: { class: tw`flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1` } },
                      [
                        D.Text.Span({ attrs: { class: tw`text-xs` } }, [payment.icon || '💳']),
                        D.Text.Small({ attrs: { class: tw`text-xs text-sky-200` } }, [
                          formatCurrency(payment.amount, { currency, lang })
                        ])
                      ]
                    )
                  )
                )
                : D.Text.Small({ attrs: { class: tw`text-xs text-slate-500` } }, [t.shiftTable.noData])
            ]
          ),

          // Total
          D.Tables.Td(
            { attrs: { class: tw`py-4 px-4 text-right font-bold text-slate-100` } },
            [formatCurrency(summary.totalPayments, { currency, lang })]
          )
        ]
      );
    });

    return D.Containers.Div(
      {
        attrs: {
          class: cx(
            tw`overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/40`,
            'finance-panel',
            'finance-table'
          )
        }
      },
      [
        D.Tables.Table({ attrs: { class: tw`min-w-full divide-y divide-slate-800/70` } }, [
          D.Tables.Thead({}, [
            D.Tables.Tr({ attrs: { class: tw`bg-slate-900/60` } }, [
              D.Tables.Th(
                { attrs: { class: tw`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400` } },
                [t.shiftTable.userName]
              ),
              D.Tables.Th(
                { attrs: { class: tw`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400` } },
                [t.shiftTable.opened]
              ),
              D.Tables.Th(
                { attrs: { class: tw`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400` } },
                [
                  D.Containers.Div({}, [
                    D.Text.Span({ attrs: { class: tw`block` } }, [t.shiftTable.completedOrders]),
                    D.Text.Small({ attrs: { class: tw`text-[10px] font-normal lowercase text-slate-500` } }, [
                      `${t.shiftTable.count} / ${t.shiftTable.value}`
                    ])
                  ])
                ]
              ),
              D.Tables.Th(
                { attrs: { class: tw`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400` } },
                [
                  D.Containers.Div({}, [
                    D.Text.Span({ attrs: { class: tw`block` } }, [t.shiftTable.openOrders]),
                    D.Text.Small({ attrs: { class: tw`text-[10px] font-normal lowercase text-slate-500` } }, [
                      `${t.shiftTable.count} / ${t.shiftTable.value}`
                    ])
                  ])
                ]
              ),
              D.Tables.Th(
                { attrs: { class: tw`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400` } },
                [t.shiftTable.payments]
              ),
              D.Tables.Th(
                { attrs: { class: tw`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400` } },
                [t.shiftTable.total]
              )
            ])
          ]),
          D.Tables.Tbody({}, rows)
        ])
      ]
    );
  };

  const getTextSymbol = (lang) => lang;

  const ShiftSelector = (shifts = [], selectedId = null, lang = 'ar') => {
    const t = getTexts(lang);

    if (!shifts || shifts.length === 0) {
      return D.Containers.Div(
        { attrs: { class: tw`space-y-2` } },
        [
          D.Label(
            { attrs: { class: tw`text-sm font-semibold text-slate-300` } },
            [t.shifts.filterLabel]
          ),
          D.Text.Small(
            { attrs: { class: tw`text-sm text-slate-400` } },
            [t.shifts.noShifts]
          )
        ]
      );
    }

    // Sort shifts by opened_at descending
    const sortedShifts = [...shifts].sort((a, b) => {
      const ta = new Date(a.openedAt || a.opened_at || 0).getTime();
      const tb = new Date(b.openedAt || b.opened_at || 0).getTime();
      return tb - ta;
    });

    const options = [
      // "All Shifts" option
      D.Option({
        attrs: {
          value: '',
          selected: !selectedId || selectedId === ''
        }
      }, [t.shifts.all]),

      // Individual shift options
      ...sortedShifts.map(shift => {
        const shiftId = shift.id || shift.shift_id;
        const userName = shift.metadata?.userName || shift.cashierName || shift.cashier_name || 'Unknown';
        const openedAt = shift.openedAt || shift.opened_at;
        const dateStr = openedAt
          ? new Date(openedAt).toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })
          : '';

        const label = `${userName} - ${dateStr}`;

        return D.Option({
          attrs: {
            value: shiftId,
            selected: selectedId === shiftId,
            'data-user': userName,
            'data-date': dateStr
          }
        }, [label]);
      })
    ];

    return D.Containers.Div(
      { attrs: { class: tw`space-y-2` } },
      [
        D.Label(
          { attrs: { class: tw`text-sm font-semibold text-slate-300` } },
          [t.shifts.filterLabel]
        ),
        D.Select({
          attrs: {
            class: cx(
              tw`w-full rounded-xl border bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 transition`,
              tw`focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30`,
              'finance-control'
            ),
            gkey: 'finance:shift:select-change'
          }
        }, options)
      ]
    );
  };

  const OrderTypeToggle = (selected = 'closed', lang = 'ar') => {
    const t = getTexts(lang);

    const buttonClass = (isActive) => cx(
      tw`flex min-w-0 grow basis-0 flex-col items-center gap-2 rounded-xl border px-4 py-3 text-center transition`,
      isActive
        ? tw`border-sky-500 bg-sky-500/20 shadow-lg shadow-sky-500/10`
        : tw`border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60`,
      'finance-control__btn'
    );

    return D.Containers.Div(
      { attrs: { class: tw`space-y-2` } },
      [
        D.Label(
          { attrs: { class: tw`text-sm font-semibold text-slate-300` } },
          [t.orderFilters.heading]
        ),
        D.Containers.Div(
          { attrs: { class: tw`grid grid-cols-2 gap-3` } },
          [
            // Open Orders Button
            D.Button({
              attrs: {
                type: 'button',
                class: buttonClass(selected === 'open'),
                gkey: 'finance:ordertype:select',
                'data-type': 'open'
              }
            }, [
              D.Text.Span(
                { attrs: { class: tw`text-base font-bold` } },
                [t.orderFilters.open]
              ),
              D.Text.Small(
                { attrs: { class: tw`text-xs text-slate-400` } },
                [t.orderFilters.openSub]
              ),
              D.Text.Small(
                { attrs: { class: tw`mt-1 text-[10px] text-slate-500` } },
                [t.orderFilters.openNote]
              )
            ]),

            // Closed Orders Button
            D.Button({
              attrs: {
                type: 'button',
                class: buttonClass(selected === 'closed'),
                gkey: 'finance:ordertype:select',
                'data-type': 'closed'
              }
            }, [
              D.Text.Span(
                { attrs: { class: tw`text-base font-bold` } },
                [t.orderFilters.closed]
              ),
              D.Text.Small(
                { attrs: { class: tw`text-xs text-slate-400` } },
                [t.orderFilters.closedSub]
              ),
              D.Text.Small(
                { attrs: { class: tw`mt-1 text-[10px] text-slate-500` } },
                [t.orderFilters.closedNote]
              )
            ])
          ]
        )
      ]
    );
  };

  const StatusBanner = (ui = {}, lang = 'ar') => {
    const t = getTexts(lang);
    const banners = [];
    if (ui.resetStatus && ui.resetStatus !== 'idle') {
      const fallback =
        ui.resetStatus === 'success'
          ? t.status.resetSuccess
          : ui.resetStatus === 'cancelled'
            ? t.status.resetCancelled
            : ui.resetStatus === 'pending'
              ? t.status.resetPending
              : ui.resetStatus === 'error'
                ? t.status.resetError
                : '';
      const toneClass =
        ui.resetStatus === 'success'
          ? tw`border-emerald-400/40 bg-emerald-500/10 text-emerald-100`
          : ui.resetStatus === 'pending'
            ? tw`border-sky-400/40 bg-sky-500/10 text-sky-100`
            : tw`border-amber-400/40 bg-amber-500/10 text-amber-100`;
      banners.push(
        D.Containers.Div(
          { attrs: { class: cx(tw`rounded-xl border px-4 py-3 text-sm font-medium shadow`, toneClass, 'finance-status') } },
          [ui.resetMessage || fallback]
        )
      );
    }
    if (ui.closingStatus && ui.closingStatus !== 'idle') {
      const fallback =
        ui.closingStatus === 'success'
          ? t.status.closingSuccess
          : ui.closingStatus === 'pending'
            ? t.status.closingPending
            : t.status.closingError;
      const toneClass =
        ui.closingStatus === 'success'
          ? tw`border-emerald-400/40 bg-emerald-500/10 text-emerald-100`
          : ui.closingStatus === 'error'
            ? tw`border-rose-400/40 bg-rose-500/10 text-rose-100`
            : tw`border-sky-400/40 bg-sky-500/10 text-sky-100`;
      banners.push(
        D.Containers.Div(
          { attrs: { class: cx(tw`rounded-xl border px-4 py-3 text-sm font-medium shadow`, toneClass, 'finance-status') } },
          [ui.closingMessage || fallback]
        )
      );
    }
    if (!banners.length) return null;
    return D.Containers.Div({ attrs: { class: tw`space-y-3` } }, banners);
  };

  const FinanceAppView = (state) => {
    const data = state?.data || {};
    const ui = state?.ui || {};
    const lang = data.lang || state?.env?.lang || 'ar';
    const theme = state?.env?.theme || 'dark';
    const currency = data.currency?.code || data.currencyCode || 'EGP';
    const paymentBreakdown = data.summary?.paymentBreakdown || [];
    const totals = data.summary?.totals || {};
    const totalPayments = ensureNumber(totals.totalPayments || totals.totalPaid);
    const lookups = data.lookups || {};
    const t = getTexts(lang);
    const branchName =
      lang === 'en'
        ? data.branch?.nameEn || data.branch?.name || t.branchUnknown
        : data.branch?.nameAr || data.branch?.name || t.branchUnknown;

    const controlContainerClass = cx(tw`flex items-center gap-2 rounded-full border px-3 py-1`, 'finance-control');
    const controlButtonClass = cx(tw`rounded-full px-3 py-1 text-xs font-semibold transition`, 'finance-control__btn');

    const header = D.Containers.Header(
      { attrs: { class: tw`flex flex-col gap-4 border-b border-slate-800/70 pb-6 md:flex-row md:items-center md:justify-between` } },
      [
        D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
          D.Text.H1({ attrs: { class: tw`text-2xl font-black tracking-tight text-slate-100` } }, [t.title]),
          D.Text.Small({ attrs: { class: tw`text-sm text-slate-400` } }, [branchName])
        ]),
        D.Containers.Div({ attrs: { class: tw`flex flex-wrap items-center gap-3` } }, [
          D.Containers.Div(
            { attrs: { class: controlContainerClass } },
            [
              D.Text.Span({ attrs: { class: tw`text-xs text-slate-400` } }, [t.controls.theme]),
              D.Button({
                attrs: {
                  type: 'button',
                  class: controlButtonClass,
                  gkey: 'finance:theme:set',
                  'data-theme': 'light',
                  'data-active': theme === 'light' ? 'true' : 'false'
                }
              }, [`☀️ ${t.controls.light}`]),
              D.Button({
                attrs: {
                  type: 'button',
                  class: controlButtonClass,
                  gkey: 'finance:theme:set',
                  'data-theme': 'dark',
                  'data-active': theme === 'dark' ? 'true' : 'false'
                }
              }, [`🌙 ${t.controls.dark}`])
            ]
          ),
          D.Containers.Div(
            { attrs: { class: controlContainerClass } },
            [
              D.Text.Span({ attrs: { class: tw`text-xs text-slate-400` } }, [t.controls.language]),
              D.Button({
                attrs: {
                  type: 'button',
                  class: controlButtonClass,
                  gkey: 'finance:lang:set',
                  'data-lang': 'ar',
                  'data-active': lang === 'ar' ? 'true' : 'false'
                }
              }, [t.controls.arabic]),
              D.Button({
                attrs: {
                  type: 'button',
                  class: controlButtonClass,
                  gkey: 'finance:lang:set',
                  'data-lang': 'en',
                  'data-active': lang === 'en' ? 'true' : 'false'
                }
              }, [t.controls.english])
            ]
          ),
          D.Button(
            {
              attrs: {
                type: 'button',
                class: tw`inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/70 hover:bg-amber-500/20`,
                gkey: 'finance:reset-orders'
              }
            },
            [t.actions.reset]
          ),
          // Only show close button for closed orders
          (ui.selectedOrderType !== 'open')
            ? D.Button(
              {
                attrs: {
                  type: 'button',
                  class: tw`inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-500/20`,
                  gkey: 'finance:close-day'
                }
              },
              [t.actions.close]
            )
            : null
        ])
      ]
    );

    const summaryGrid = D.Containers.Div({ attrs: { class: tw`grid gap-4 md:grid-cols-2 xl:grid-cols-4` } }, [
      MetricCard({ label: t.metrics.totalOrders, value: totals.totalOrders || 0, intent: 'primary' }, lang, currency),
      MetricCard({ label: t.metrics.averageOrderValue, value: totals.averageOrderValue || 0, asCurrency: true }, lang, currency),
      MetricCard({ label: t.metrics.totalDue, value: totals.totalDue || 0, asCurrency: true }, lang, currency),
      MetricCard({ label: t.metrics.totalPaid, value: totals.totalPaid || 0, asCurrency: true, intent: 'success' }, lang, currency)
    ]);

    const outstandingGrid = D.Containers.Div({ attrs: { class: tw`grid gap-4 md:grid-cols-3` } }, [
      MetricCard({ label: t.metrics.paidOrders, value: totals.paidOrders || 0, intent: 'success' }, lang, currency),
      MetricCard({ label: t.metrics.openOrders, value: totals.openOrders || 0, intent: 'warning' }, lang, currency),
      MetricCard({ label: t.metrics.outstanding, value: totals.outstanding || 0, asCurrency: true, intent: 'danger' }, lang, currency)
    ]);

    const paymentsSection = D.Containers.Section(
      { attrs: { class: cx(tw`flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/30 p-6`, 'finance-panel') } },
      [
        D.Text.H2({ attrs: { class: tw`text-lg font-semibold text-slate-100` } }, [t.payments.heading]),
        paymentBreakdown.length
          ? D.Containers.Div({ attrs: { class: tw`grid gap-4 md:grid-cols-2` } },
            paymentBreakdown.map((entry) => PaymentRow(entry, lang, currency, totalPayments))
          )
          : D.Text.Small({ attrs: { class: tw`text-sm text-slate-400` } }, [t.payments.empty])
      ]
    );

    const ordersSection = D.Containers.Section(
      { attrs: { class: cx(tw`flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/30 p-6`, 'finance-panel') } },
      [
        D.Text.H2({ attrs: { class: tw`text-lg font-semibold text-slate-100` } }, [t.orders.heading]),
        OrdersTable(data.recentOrders || data.orders || [], lookups, lang, currency)
      ]
    );

    const shiftsSection = D.Containers.Section(
      { attrs: { class: cx(tw`flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/30 p-6`, 'finance-panel') } },
      [
        D.Text.H2({ attrs: { class: tw`text-lg font-semibold text-slate-100` } }, [t.shifts.heading]),
        OrderTypeToggle(ui.selectedOrderType || 'closed', lang),
        ShiftSummaryTable(data.shiftSummaries || [], ui.selectedShiftId, lang, currency)
      ]
    );

    const statusBanner = StatusBanner(ui, lang);

    // Filters Section
    const filtersSection = D.Containers.Section(
      {
        attrs: {
          class: cx(
            tw`flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/30 p-6 md:grid md:grid-cols-2`,
            'finance-panel'
          )
        }
      },
      [
        ShiftSelector(data.shifts || [], ui.selectedShiftId, lang),
        OrderTypeToggle(ui.selectedOrderType || 'closed', lang)
      ]
    );

    return M.UI.AppRoot({
      shell: D.Containers.Div(
        {
          attrs: {
            class: cx(tw`flex min-h-screen w-full flex-col gap-6 bg-slate-950/90 px-6 pb-10 pt-8`, 'finance-shell'),
            'data-theme': theme
          }
        },
        [header, statusBanner, filtersSection, summaryGrid, outstandingGrid, paymentsSection, ordersSection, shiftsSection].filter(Boolean)
      ),
      overlays: []
    });
  };

  global.PosFinanceComponents = {
    MetricCard,
    PaymentRow,
    OrdersTable,
    ShiftSummaryTable,
    ShiftHeader,
    ShiftSelector,
    OrderTypeToggle,
    StatusBanner,
    FinanceAppView,
    formatCurrency
  };
})(typeof window !== 'undefined' ? window : globalThis);
