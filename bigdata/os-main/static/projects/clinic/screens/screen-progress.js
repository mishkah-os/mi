(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M.UI || {};
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Clinic Progress] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;

  function formatDateTime(value) {
    if (!value || typeof value !== 'string') return value || '';
    var parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    var date = new Date(parsed);
    return date.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  function buildProgressColumns(lang) {
    return [
      { key: 'display_name', label: lang === 'ar' ? 'الزيارة' : 'Visit' },
      { key: 'started_at', label: lang === 'ar' ? 'بداية' : 'Started' },
      { key: 'ended_at', label: lang === 'ar' ? 'نهاية' : 'Ended' },
      { key: 'booking', label: lang === 'ar' ? 'الحجز' : 'Booking' }
    ];
  }

  function buildStepColumns(lang) {
    return [
      { key: 'display_name', label: lang === 'ar' ? 'الخطوة' : 'Step' },
      { key: 'step_type', label: lang === 'ar' ? 'النوع' : 'Type' },
      { key: 'start_time', label: lang === 'ar' ? 'بداية' : 'Start' },
      { key: 'end_time', label: lang === 'ar' ? 'نهاية' : 'End' }
    ];
  }

  function normalizeProgress(list) {
    return (list || []).map(function (row) {
      return Object.assign({}, row, {
        started_at: formatDateTime(row.started_at),
        ended_at: formatDateTime(row.ended_at)
      });
    });
  }

  function normalizeSteps(list) {
    return (list || []).map(function (row) {
      return Object.assign({}, row, {
        start_time: formatDateTime(row.start_time),
        end_time: formatDateTime(row.end_time)
      });
    });
  }

  function renderScreen(appState) {
    var state = appState.data.screens.progress || {};
    var lang = appState.env.lang;
    var rows = normalizeProgress(state.list || []);
    var steps = normalizeSteps(state.steps || []);
    var totalCount = state.total || rows.length;

    return D.Div({ attrs: { class: 'space-y-5' } }, [
      D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
        D.Div({ attrs: { class: 'text-2xl font-bold' } }, [lang === 'ar' ? 'تنفيذ الزيارات' : 'Progress']),
        D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, [
          UI.SearchBar ? UI.SearchBar({
            value: state.search || '',
            placeholder: lang === 'ar' ? 'رقم الزيارة أو الحجز' : 'Visit or booking',
            attrs: { class: 'w-full md:w-[260px]' },
            onInput: 'progress:update-search'
          }) : UC.FormInput({
            name: 'progress-search',
            value: state.search || '',
            key: 'progress:update-search',
            label: lang === 'ar' ? 'بحث' : 'Search',
            placeholder: lang === 'ar' ? 'رقم الزيارة أو الحجز' : 'Visit or booking'
          }),
          UI.Button ? UI.Button({ attrs: { gkey: 'progress:refresh' }, variant: 'ghost', size: 'sm' }, [D.Span({}, ['🔄']), D.Span({}, [lang === 'ar' ? 'تحديث' : 'Refresh'])]) :
            UC.Button({ key: 'progress:refresh', label: lang === 'ar' ? 'تحديث' : 'Refresh', icon: '🔄', variant: 'outline', size: 'sm' })
        ])
      ]),
      UI && UI.StatCard ? D.Div({ attrs: { class: 'grid grid-cols-1 md:grid-cols-3 gap-3' } }, [
        UI.StatCard({ title: lang === 'ar' ? 'الزيارات النشطة' : 'Active Visits', value: String(totalCount) }),
        UI.StatCard({ title: lang === 'ar' ? 'خطوات مكتملة' : 'Steps Done', value: '—' }),
        UI.StatCard({ title: lang === 'ar' ? 'قيد التنفيذ' : 'In Progress', value: '—' })
      ]) : null,
      D.Div({ attrs: { class: 'grid lg:grid-cols-5 gap-4' } }, [
        D.Div({ attrs: { class: 'lg:col-span-3 space-y-3' } }, [
          UI.Card ? UI.Card({
            title: lang === 'ar' ? 'زيارات اليوم' : 'Today Visits',
            content: UC.Table({ columns: buildProgressColumns(lang), data: rows, activeId: state.selectedId, rowKey: 'progress:select' })
          }) : UC.Table({ columns: buildProgressColumns(lang), data: rows, activeId: state.selectedId, rowKey: 'progress:select' })
        ]),
        D.Div({ attrs: { class: 'lg:col-span-2 space-y-3' } }, [
          UI.Card ? UI.Card({
            title: lang === 'ar' ? 'خطوات التنفيذ' : 'Execution Steps',
            content: UC.Table({ columns: buildStepColumns(lang), data: steps })
          }) : D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-2' } }, [
            D.Div({ attrs: { class: 'font-semibold' } }, [lang === 'ar' ? 'خطوات التنفيذ' : 'Steps']),
            UC.Table({ columns: buildStepColumns(lang), data: steps })
          ])
        ])
      ])
    ]);
  }

  async function loadSteps(progressId, lang) {
    if (!progressId) return [];
    var repo = M.REST.repo('clinic_visit_progress_steps');
    var result = await repo.search({ lang: lang, q: '', page: 1, limit: 200 });
    var list = result.data || result || [];
    return list.filter(function (row) {
      return String(row.progress || row.progress_id || '') === String(progressId);
    });
  }

  async function loadScreen(app) {
    var state = app.getState();
    var screenState = state.data.screens.progress || {};
    var lang = state.env.lang;

    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            progress: Object.assign({}, screenState, { loading: true })
          })
        })
      });
    });

    try {
      var repo = M.REST.repo('clinic_visit_progress_header');
      var result = await repo.search({
        lang: lang,
        q: screenState.search || '',
        page: screenState.page || 1,
        limit: screenState.limit || 20
      });
      var list = result.data || result || [];
      var selected = list[0] || null;
      var selectedId = selected ? (selected.id || selected.Id || selected.uuid) : null;
      var steps = selectedId ? await loadSteps(selectedId, lang) : [];

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              progress: Object.assign({}, screenState, {
                loading: false,
                list: list,
                total: result.count || list.length,
                selected: selected,
                selectedId: selectedId,
                steps: steps
              })
            })
          })
        });
      });
    } catch (error) {
      console.error('[Progress] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              progress: Object.assign({}, screenState, { loading: false, error: error.message })
            })
          })
        });
      });
    }
  }

  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.progress = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'progress:refresh': {
        on: ['click'],
        gkeys: ['progress:refresh'],
        handler: function (_ev, ctx) {
          loadScreen(ctx);
        }
      },
      'progress:update-search': {
        on: ['input', 'change'],
        gkeys: ['progress:update-search'],
        handler: function (ev, ctx) {
          var value = ev && ev.target ? ev.target.value : '';
          ctx.setState(function (prev) {
            var current = prev.data.screens.progress || {};
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  progress: Object.assign({}, current, { search: value })
                })
              })
            });
          });
        }
      },
      'progress:select': {
        on: ['click'],
        gkeys: ['progress:select'],
        handler: function (ev, ctx) {
          var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
          var holder = target && target.closest ? target.closest('[data-record-id]') : null;
          var id = (holder && holder.getAttribute('data-record-id')) || (target && target.getAttribute ? target.getAttribute('data-record-id') : null);
          if (!id) return;
          var lang = ctx.getState().env.lang;
          ctx.setState(function (prev) {
            var current = prev.data.screens.progress || {};
            var list = current.list || [];
            var selected = list.find(function (row) { return String(row.id || row.Id || row.uuid) === String(id); }) || null;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  progress: Object.assign({}, current, { selected: selected, selectedId: id, steps: [] })
                })
              })
            });
          });
          loadSteps(id, lang).then(function (steps) {
            ctx.setState(function (prev) {
              var current = prev.data.screens.progress || {};
              return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                  screens: Object.assign({}, prev.data.screens, {
                    progress: Object.assign({}, current, { steps: steps })
                  })
                })
              });
            });
          });
        }
      }
    }
  };
})(window);
