(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M && M.UI;
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Finance Accounts] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;
  var TABLE_NAME = 'fin_chart_of_accounts';

  function getSchemaInfo(appState) {
    return (appState && appState.data && appState.data.schemaInfo) || {};
  }

  function resolveTableLabel(appState) {
    var info = getSchemaInfo(appState);
    var map = info.tableMap || {};
    var def = map[TABLE_NAME] || {};
    var lang = (appState && appState.env && appState.env.lang) || 'ar';
    var labels = def.labels || {};
    return labels[lang] || labels.ar || labels.en || def.label || def.name || TABLE_NAME;
  }

  function resolveRecordLabel(record) {
    if (!record) return '';
    return record.display_name || record.name || record.label || record.title || record.code || record.id || '';
  }

  function buildTree(records) {
    var map = new Map();
    (records || []).forEach(function (row) {
      if (!row) return;
      var id = row.id || row.Id || row.uuid || row.uid;
      if (!id) return;
      map.set(String(id), Object.assign({}, row, { __children: [] }));
    });

    var roots = [];
    map.forEach(function (node) {
      var parentId = node.parent_id || node.parentId || null;
      if (parentId && map.has(String(parentId))) {
        map.get(String(parentId)).__children.push(node);
      } else {
        roots.push(node);
      }
    });

    function sortNode(list) {
      list.sort(function (a, b) {
        var ac = a.code || '';
        var bc = b.code || '';
        if (ac !== bc) return String(ac).localeCompare(String(bc));
        return String(resolveRecordLabel(a)).localeCompare(String(resolveRecordLabel(b)));
      });
      list.forEach(function (node) {
        if (node.__children && node.__children.length) sortNode(node.__children);
      });
    }

    sortNode(roots);
    return roots;
  }

  function renderTree(nodes, selectedId) {
    if (!nodes || !nodes.length) return null;
    return D.Ul({ attrs: { class: 'space-y-2' } }, nodes.map(function (node) {
      var nodeId = node.id || node.Id || node.uuid || node.uid;
      var isSelected = selectedId && String(nodeId) === String(selectedId);
      var label = resolveRecordLabel(node);
      var children = node.__children || [];
      return D.Li({ attrs: { class: 'space-y-2' } }, [
        D.Button({
          attrs: {
            type: 'button',
            gkey: 'finance:coa-select',
            'data-record-id': nodeId,
            class: 'w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ' +
              (isSelected ? 'border-[var(--primary)] text-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]' : 'border-[var(--border)] hover:bg-[var(--muted)]')
          }
        }, [
          D.Span({ attrs: { class: 'font-medium' } }, [label]),
          node.code ? D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [String(node.code)]) : null
        ]),
        children.length ? D.Div({ attrs: { class: 'pl-4 border-l border-[var(--border)]' } }, [renderTree(children, selectedId)]) : null
      ]);
    }));
  }

  function renderScreen(appState) {
    var state = (appState.data.screens && appState.data.screens.accounts) || {};
    var selectedId = state.selectedId || null;
    var label = resolveTableLabel(appState);

    var actions = D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
      D.Button({
        attrs: {
          type: 'button',
          gkey: 'finance:coa-create',
          class: 'inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]'
        }
      }, ['➕']),
      D.Button({
        attrs: {
          type: 'button',
          gkey: 'finance:coa-edit',
          'data-record-id': selectedId || '',
          class: 'inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]'
        }
      }, ['✏️'])
    ]);

    return D.Div({ attrs: { class: 'space-y-4' } }, [
      D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
        D.Div({ attrs: { class: 'text-2xl font-bold' } }, [label]),
        actions
      ]),
      state.loading ? D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, ['...']) : null,
      renderTree(state.tree || [], selectedId)
    ]);
  }

  async function loadScreen(app) {
    var lang = app.getState().env.lang;
    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            accounts: Object.assign({}, prev.data.screens.accounts || {}, { loading: true })
          })
        })
      });
    });

    try {
      var repo = M.REST.repo(TABLE_NAME);
      var response = await repo.search({ lang: lang, limit: 2000 });
      var rows = response.data || response || [];
      var tree = buildTree(rows);

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              accounts: Object.assign({}, prev.data.screens.accounts || {}, {
                loading: false,
                records: rows,
                tree: tree
              })
            })
          })
        });
      });
    } catch (error) {
      console.error('[Finance Accounts] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              accounts: { loading: false, records: [], tree: [] }
            })
          })
        });
      });
    }
  }

  global.FinanceScreens = global.FinanceScreens || {};
  global.FinanceScreens.accounts = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'finance:coa-select': {
        on: ['click'],
        gkeys: ['finance:coa-select'],
        handler: function (ev, ctx) {
          var recordId = ev.target.getAttribute('data-record-id') || ev.target.closest('[data-record-id]').getAttribute('data-record-id');
          if (!recordId) return;
          ctx.setState(function (prev) {
            var screenState = (prev.data.screens && prev.data.screens.accounts) || {};
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  accounts: Object.assign({}, screenState, { selectedId: recordId })
                })
              })
            });
          });
        }
      },
      'finance:coa-create': {
        on: ['click'],
        gkeys: ['finance:coa-create'],
        handler: async function (_ev, ctx) {
          if (!global.FinanceDashboard || !global.FinanceDashboard.openCreate) return;
          await global.FinanceDashboard.openCreate(ctx, TABLE_NAME);
        }
      },
      'finance:coa-edit': {
        on: ['click'],
        gkeys: ['finance:coa-edit'],
        handler: async function (ev, ctx) {
          var recordId = ev.target.getAttribute('data-record-id') || ev.target.closest('[data-record-id]').getAttribute('data-record-id');
          if (!recordId) return;
          if (!global.FinanceDashboard || !global.FinanceDashboard.openEdit) return;
          await global.FinanceDashboard.openEdit(ctx, TABLE_NAME, recordId);
        }
      }
    }
  };
})(window);
