(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M && M.UI;
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Finance Journals] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;
  var HEADERS_TABLE = 'fin_journal_headers';
  var LINES_TABLE = 'fin_journal_lines';

  function getSchemaInfo(appState) {
    return (appState && appState.data && appState.data.schemaInfo) || {};
  }

  function resolveTableLabel(appState, tableName) {
    var info = getSchemaInfo(appState);
    var map = info.tableMap || {};
    var def = map[tableName] || {};
    var lang = (appState && appState.env && appState.env.lang) || 'ar';
    var labels = def.labels || {};
    return labels[lang] || labels.ar || labels.en || def.label || def.name || tableName;
  }

  function buildColumns(appState, tableName, fallbackKeys) {
    var info = getSchemaInfo(appState);
    var map = info.tableMap || {};
    var def = map[tableName] || {};
    var lang = (appState && appState.env && appState.env.lang) || 'ar';
    var smartCols = (def.smart_features && def.smart_features.columns) || [];
    var columns = smartCols
      .filter(function (col) { return col && col.is_table_show !== false; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
      .map(function (col) {
        var labels = col.labels || {};
        return { key: col.name, label: labels[lang] || labels.ar || labels.en || col.label || col.name };
      });

    if (!columns.length && Array.isArray(fallbackKeys)) {
      columns = fallbackKeys.map(function (key) { return { key: key, label: key }; });
    }
    return columns;
  }

  function resolveRowLabel(row) {
    if (!row || typeof row !== 'object') return '';
    return row.display_name || row.name || row.label || row.title || row.code || row.id || '';
  }

  function renderScreen(appState) {
    var state = (appState.data.screens && appState.data.screens.journals) || {};
    var headers = state.headers || [];
    var selectedId = state.selectedId || null;
    var lines = state.lines || [];

    var headerColumns = buildColumns(appState, HEADERS_TABLE, ['display_name']);
    var lineColumns = buildColumns(appState, LINES_TABLE, ['display_name']);

    var headerLabel = resolveTableLabel(appState, HEADERS_TABLE);
    var lineLabel = resolveTableLabel(appState, LINES_TABLE);

    var headerTable = UC.Table({
      columns: headerColumns,
      data: headers,
      rowKey: 'finance:journal-select',
      rowKeyField: 'id'
    });

    var lineTable = UC.Table({
      columns: lineColumns,
      data: lines
    });

    return D.Div({ attrs: { class: 'space-y-4' } }, [
      D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
        D.Div({ attrs: { class: 'text-2xl font-bold' } }, [headerLabel]),
        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
          D.Button({
            attrs: {
              type: 'button',
              gkey: 'finance:journal-create',
              class: 'inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]'
            }
          }, ['➕']),
          D.Button({
            attrs: {
              type: 'button',
              gkey: 'finance:journal-edit',
              'data-record-id': selectedId || '',
              class: 'inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]'
            }
          }, ['✏️'])
        ])
      ]),
      D.Div({ attrs: { class: 'grid lg:grid-cols-3 gap-4' } }, [
        D.Div({ attrs: { class: 'lg:col-span-2 space-y-2' } }, [
          headerTable
        ]),
        D.Div({ attrs: { class: 'lg:col-span-1 space-y-2' } }, [
          D.Div({ attrs: { class: 'text-sm font-semibold text-[var(--muted-foreground)]' } }, [lineLabel]),
          lineTable
        ])
      ])
    ]);
  }

  async function loadScreen(app) {
    var lang = app.getState().env.lang;
    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            journals: Object.assign({}, prev.data.screens.journals || {}, { loading: true })
          })
        })
      });
    });

    try {
      var repo = M.REST.repo(HEADERS_TABLE);
      var response = await repo.search({ lang: lang, limit: 200 });
      var rows = response.data || response || [];

      var selectedId = rows[0] && (rows[0].id || rows[0].Id || rows[0].uuid || rows[0].uid) || null;

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              journals: Object.assign({}, prev.data.screens.journals || {}, {
                loading: false,
                headers: rows,
                selectedId: selectedId
              })
            })
          })
        });
      });

      if (selectedId) {
        await loadLines(app, selectedId);
      }
    } catch (error) {
      console.error('[Finance Journals] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              journals: { loading: false, headers: [], lines: [], selectedId: null }
            })
          })
        });
      });
    }
  }

  async function loadLines(app, headerId) {
    if (!headerId) return;
    var lang = app.getState().env.lang;
    try {
      var repo = M.REST.repo(LINES_TABLE);
      var response = await repo.search({ lang: lang, limit: 500, filters: { journal_header_id: headerId } });
      var rows = response.data || response || [];
      app.setState(function (prev) {
        var screenState = (prev.data.screens && prev.data.screens.journals) || {};
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              journals: Object.assign({}, screenState, { lines: rows })
            })
          })
        });
      });
    } catch (error) {
      console.error('[Finance Journals] Load lines failed', error);
    }
  }

  global.FinanceScreens = global.FinanceScreens || {};
  global.FinanceScreens.journals = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'finance:journal-select': {
        on: ['click'],
        gkeys: ['finance:journal-select'],
        handler: function (ev, ctx) {
          var recordId = ev.target.getAttribute('data-record-id') || ev.target.closest('[data-record-id]').getAttribute('data-record-id');
          if (!recordId) return;
          ctx.setState(function (prev) {
            var screenState = (prev.data.screens && prev.data.screens.journals) || {};
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  journals: Object.assign({}, screenState, { selectedId: recordId })
                })
              })
            });
          });
          loadLines(ctx, recordId);
        }
      },
      'finance:journal-create': {
        on: ['click'],
        gkeys: ['finance:journal-create'],
        handler: async function (_ev, ctx) {
          if (!global.FinanceDashboard || !global.FinanceDashboard.openCreate) return;
          await global.FinanceDashboard.openCreate(ctx, HEADERS_TABLE);
        }
      },
      'finance:journal-edit': {
        on: ['click'],
        gkeys: ['finance:journal-edit'],
        handler: async function (ev, ctx) {
          var recordId = ev.target.getAttribute('data-record-id') || ev.target.closest('[data-record-id]').getAttribute('data-record-id');
          if (!recordId) return;
          if (!global.FinanceDashboard || !global.FinanceDashboard.openEdit) return;
          await global.FinanceDashboard.openEdit(ctx, HEADERS_TABLE, recordId);
        }
      }
    }
  };
})(window);
