(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M && M.UI;
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Finance Home] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;

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

  function resolveModuleLabel(appState) {
    var info = getSchemaInfo(appState);
    var modules = info.modules || [];
    var lang = (appState && appState.env && appState.env.lang) || 'ar';
    var root = modules.find(function (mod) { return mod && !mod.parent_id; }) || modules[0];
    if (!root) return 'finance';
    var labels = root.labels || {};
    return labels[lang] || labels.ar || labels.en || root.label || root.id || 'finance';
  }

  function selectSummaryTables(appState) {
    var info = getSchemaInfo(appState);
    var tables = info.tables || [];
    var usable = tables.filter(function (table) {
      if (!table || !table.name) return false;
      if (String(table.name).endsWith('_lang')) return false;
      var moduleId = table.smart_features && table.smart_features.module_id;
      if (!moduleId) return false;
      return String(moduleId).indexOf('financial') === 0;
    });
    return usable.slice(0, 4).map(function (table) { return table.name; });
  }

  function formatTotal(total) {
    if (total === null || total === undefined) return '0';
    if (typeof total === 'number') return total.toLocaleString('en-US');
    return String(total);
  }

  function renderScreen(appState) {
    var state = (appState.data.screens && appState.data.screens.home) || {};
    var summaries = state.summaries || [];

    return D.Div({ attrs: { class: 'space-y-5' } }, [
      D.Div({ attrs: { class: 'flex flex-col gap-2' } }, [
        D.Div({ attrs: { class: 'text-2xl font-bold' } }, [resolveModuleLabel(appState)])
      ]),
      D.Div({ attrs: { class: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3' } }, summaries.map(function (entry) {
        if (UI && UI.StatCard) {
          return UI.StatCard({
            title: entry.label,
            value: formatTotal(entry.total)
          });
        }
        return D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [
          D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [entry.label]),
          D.Div({ attrs: { class: 'text-xl font-semibold mt-2' } }, [formatTotal(entry.total)])
        ]);
      }))
    ]);
  }

  async function loadScreen(app) {
    var state = app.getState();
    var lang = state.env.lang;
    var tables = selectSummaryTables(state);

    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            home: Object.assign({}, prev.data.screens.home || {}, { loading: true })
          })
        })
      });
    });

    try {
      var summaries = await Promise.all(tables.map(async function (tableName) {
        var repo = M.REST.repo(tableName);
        var result = await repo.search({ lang: lang, limit: 1 });
        var total = typeof result.total === 'number' ? result.total :
          (typeof result.count === 'number' ? result.count :
            (Array.isArray(result.data) ? result.data.length : Array.isArray(result) ? result.length : 0));
        return {
          table: tableName,
          label: resolveTableLabel(state, tableName),
          total: total
        };
      }));

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              home: { loading: false, summaries: summaries }
            })
          })
        });
      });
    } catch (error) {
      console.error('[Finance Home] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              home: { loading: false, summaries: [] }
            })
          })
        });
      });
    }
  }

  global.FinanceScreens = global.FinanceScreens || {};
  global.FinanceScreens.home = {
    load: loadScreen,
    render: renderScreen,
    orders: {}
  };
})(window);
