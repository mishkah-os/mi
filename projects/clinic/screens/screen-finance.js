(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var Printer = global.ClinicPrint;
  var UI = M.UI || {};
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Clinic Finance] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return '0';
    var num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildInvoiceColumns(lang) {
    return [
      { key: 'display_name', label: lang === 'ar' ? 'الفاتورة' : 'Invoice' },
      { key: 'invoice_no', label: lang === 'ar' ? 'رقم' : 'No' },
      { key: 'total_amount', label: lang === 'ar' ? 'الإجمالي' : 'Total' },
      { key: 'status', label: lang === 'ar' ? 'الحالة' : 'Status' }
    ];
  }

  function buildPaymentColumns(lang) {
    return [
      { key: 'display_name', label: lang === 'ar' ? 'الدفعة' : 'Payment' },
      { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' },
      { key: 'method', label: lang === 'ar' ? 'الطريقة' : 'Method' }
    ];
  }

  function normalizeInvoices(list) {
    return (list || []).map(function (row) {
      return Object.assign({}, row, {
        total_amount: formatMoney(row.total_amount || row.total || row.amount || 0)
      });
    });
  }

  function computeTotals(invoices, payments) {
    var total = 0;
    var paid = 0;
    (invoices || []).forEach(function (row) {
      total += Number(row.total_amount || row.total || row.amount || 0) || 0;
    });
    (payments || []).forEach(function (row) {
      paid += Number(row.amount || 0) || 0;
    });
    return { total: total, paid: paid, balance: total - paid };
  }

  function renderSummary(totals, lang) {
    return D.Div({ attrs: { class: 'grid grid-cols-1 md:grid-cols-3 gap-3' } }, [
      D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [
        D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'إجمالي الفواتير' : 'Invoices Total']),
        D.Div({ attrs: { class: 'text-xl font-semibold' } }, [formatMoney(totals.total)])
      ]),
      D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [
        D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'المدفوع' : 'Paid']),
        D.Div({ attrs: { class: 'text-xl font-semibold' } }, [formatMoney(totals.paid)])
      ]),
      D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [
        D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'الرصيد' : 'Balance']),
        D.Div({ attrs: { class: 'text-xl font-semibold' } }, [formatMoney(totals.balance)])
      ])
    ]);
  }

  function renderScreen(appState) {
    var state = appState.data.screens.finance || {};
    var lang = appState.env.lang;
    var invoices = normalizeInvoices(state.invoices || []);
    var payments = state.payments || [];
    var totals = computeTotals(invoices, payments);

    return D.Div({ attrs: { class: 'space-y-5' } }, [
      D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
        D.Div({ attrs: { class: 'text-2xl font-bold' } }, [lang === 'ar' ? 'المالية' : 'Finance']),
        D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, [
          UI.Button ? UI.Button({ attrs: { gkey: 'finance:refresh' }, variant: 'ghost', size: 'sm' }, [D.Span({}, ['🔄']), D.Span({}, [lang === 'ar' ? 'تحديث' : 'Refresh'])]) :
            UC.Button({ key: 'finance:refresh', label: lang === 'ar' ? 'تحديث' : 'Refresh', icon: '🔄', variant: 'outline', size: 'sm' })
        ])
      ]),
      UI && UI.Card ? UI.Card({ title: lang === 'ar' ? 'ملخص النقدية' : 'Cash Summary', content: renderSummary(totals, lang) }) : renderSummary(totals, lang),
      D.Div({ attrs: { class: 'grid lg:grid-cols-5 gap-4' } }, [
        D.Div({ attrs: { class: 'lg:col-span-3 space-y-3' } }, [
          UI.Card ? UI.Card({
            title: lang === 'ar' ? 'الفواتير' : 'Invoices',
            content: UC.Table({ columns: buildInvoiceColumns(lang), data: invoices, rowKey: 'finance:select-invoice' })
          }) : D.Div({ attrs: { class: 'font-semibold' } }, [lang === 'ar' ? 'الفواتير' : 'Invoices']),
          UI.Card ? null : UC.Table({ columns: buildInvoiceColumns(lang), data: invoices, rowKey: 'finance:select-invoice' })
        ]),
        D.Div({ attrs: { class: 'lg:col-span-2 space-y-3' } }, [
          UI.Card ? UI.Card({
            title: lang === 'ar' ? 'المدفوعات' : 'Payments',
            content: UC.Table({ columns: buildPaymentColumns(lang), data: payments })
          }) : D.Div({ attrs: { class: 'font-semibold' } }, [lang === 'ar' ? 'المدفوعات' : 'Payments']),
          UI.Card ? null : UC.Table({ columns: buildPaymentColumns(lang), data: payments })
        ])
      ])
    ]);
  }

  async function loadScreen(app) {
    var state = app.getState();
    var screenState = state.data.screens.finance || {};
    var lang = state.env.lang;

    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            finance: Object.assign({}, screenState, { loading: true })
          })
        })
      });
    });

    try {
      var invoicesRepo = M.REST.repo('clinic_invoices_header');
      var paymentsRepo = M.REST.repo('clinic_payments');
      var invoicesResult = await invoicesRepo.search({ lang: lang, q: '', page: 1, limit: 20 });
      var paymentsResult = await paymentsRepo.search({ lang: lang, q: '', page: 1, limit: 20 });

      var invoices = invoicesResult.data || invoicesResult || [];
      var payments = paymentsResult.data || paymentsResult || [];

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              finance: Object.assign({}, screenState, {
                loading: false,
                invoices: invoices,
                payments: payments
              })
            })
          })
        });
      });
    } catch (error) {
      console.error('[Finance] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              finance: Object.assign({}, screenState, { loading: false, error: error.message })
            })
          })
        });
      });
    }
  }

  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.finance = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'finance:refresh': {
        on: ['click'],
        gkeys: ['finance:refresh'],
        handler: function (_ev, ctx) {
          loadScreen(ctx);
        }
      },
      'finance:select-invoice': {
        on: ['click'],
        gkeys: ['finance:select-invoice'],
        handler: function (_ev, _ctx) {
          if (!Printer || !Printer.printHtml) return;
        }
      }
    }
  };
})(window);
