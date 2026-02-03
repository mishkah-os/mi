(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M.UI || {};
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Clinic Profiles] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;

  // --- Constants & Config ---
  // --- Helpers ---

  // --- Helpers ---

  function normalizeDate(value) {
    if (!value) return '—';
    try {
      var parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) return value;
      var date = new Date(parsed);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (error) {
      return value;
    }
  }

  function getInitials(name) {
    return (name || '').split(' ').slice(0, 2).map(function (n) { return n[0]; }).join('').toUpperCase();
  }

  function isSystemColumn(name) {
    if (!name) return false;
    var lower = String(name).toLowerCase();
    return ['company', 'company_id', 'branch', 'branch_id', 'user_insert'].indexOf(lower) !== -1;
  }

  // --- Renderers ---

  function renderAvatar(profile, size) {
    var s = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-10 h-10 text-sm';
    var initials = getInitials(profile.display_name || profile.patient_code || '?');
    return D.Div({
      attrs: { class: s + ' rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold shadow-md shrink-0' }
    }, [initials]);
  }

  function getSystemDefaults(ctx) {
    var data = ctx.getState().data || {};
    var defaults = {};
    var defaultContext = data.defaultContext || {};
    var companyId = (data.companyInfo && data.companyInfo.id) || (defaultContext.company && defaultContext.company.id);
    if (companyId) defaults.company_id = companyId;
    if (defaultContext.branch && defaultContext.branch.id) defaults.branch_id = defaultContext.branch.id;
    if (defaultContext.user && defaultContext.user.id) defaults.user_insert = defaultContext.user.id;
    defaults.begin_date = new Date().toISOString();
    return defaults;
  }

  function ensureReferenceDataForTable(app, tableName) {
    var state = app.getState();
    var cache = (state.data.referenceData && state.data.referenceData[tableName]) || null;
    if (cache) return Promise.resolve(cache);

    var schema = (state.data.schemaInfo && state.data.schemaInfo.tableMap && state.data.schemaInfo.tableMap[tableName]) || {};
    var targets = new Set();
    (schema.fkReferences || []).forEach(function (fk) {
      if (fk && fk.targetTable) targets.add(fk.targetTable);
    });

    var fetched = {};
    var lang = state.env.lang;
    return Promise.all(Array.from(targets).map(function (target) {
      return M.REST.repo(target).search({ lang: lang, limit: 200 }).then(function (res) {
        fetched[target] = res.data || res || [];
      }).catch(function (err) {
        console.warn('[Clinic Profiles] Failed to load FK data for', target, err);
        fetched[target] = [];
      });
    })).then(function () {
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            referenceData: Object.assign({}, prev.data.referenceData, (function () {
              var next = {};
              next[tableName] = fetched;
              return next;
            })())
          })
        });
      });
      return fetched;
    });
  }

  async function ensureTableMeta(app, tableName) {
    var state = app.getState();
    var profiles = state.data.screens.profiles || {};
    var cache = profiles.columnsMetaByTable || {};
    if (cache[tableName]) return cache[tableName];
    try {
      var res = await M.REST.repo(tableName).search({ lang: state.env.lang, limit: 1, withMeta: 1 });
      var columnsMeta = res.columnsMeta || [];
      app.setState(function (prev) {
        var sc = prev.data.screens.profiles || {};
        var nextMeta = Object.assign({}, sc.columnsMetaByTable || {});
        nextMeta[tableName] = columnsMeta;
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              profiles: Object.assign({}, sc, { columnsMetaByTable: nextMeta })
            })
          })
        });
      });
      return columnsMeta;
    } catch (err) {
      console.warn('[Clinic Profiles] Failed to load columns meta for', tableName, err);
      return [];
    }
  }

  function resolveSchemaColumns(appState, tableName) {
    var profiles = appState.data.screens.profiles || {};
    var columnsMeta = (profiles.columnsMetaByTable && profiles.columnsMetaByTable[tableName]) || [];
    if (columnsMeta.length) return columnsMeta;
    var schema = (appState.data.schemaInfo && appState.data.schemaInfo.tableMap && appState.data.schemaInfo.tableMap[tableName]) || {};
    var smart = (schema.smart_features && schema.smart_features.columns) || [];
    return smart;
  }

  function resolveTableLabel(appState, tableName) {
    var info = appState.data.schemaInfo || {};
    var map = info.tableMap || {};
    var def = map[tableName] || {};
    var lang = appState.env.lang;
    var labels = def.labels || {};
    return labels[lang] || labels.ar || labels.en || def.label || def.name || tableName;
  }

  function buildSchemaColumns(appState, tableName, visibleGroups, includeKeys, rows) {
    var columnsMeta = resolveSchemaColumns(appState, tableName) || [];
    var lang = appState.env.lang;
    var columns = columnsMeta
      .filter(function (c) {
        if (!c || !c.name) return false;
        if (c.is_table_show === false) return false;
        if (isSystemColumn(c.name)) return false;
        if (Array.isArray(includeKeys) && includeKeys.length && includeKeys.indexOf(c.name) === -1) return false;
        if (visibleGroups && visibleGroups.length) {
          var g = c.group || 'basic';
          if (visibleGroups.indexOf(g) === -1 && c.is_table_show !== true) return false;
        }
        return true;
      })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
      .map(function (c) {
        var lbls = c.labels || {};
        var lbl = lbls[lang] || lbls.ar || lbls.en || c.name;
        return { key: c.name, label: lbl };
      });
    if (columns.length) return columns;
    var sample = (rows && rows[0]) || null;
    if (!sample) return [];
    return Object.keys(sample).filter(function (key) { return key && key.charAt(0) !== '_' && !isSystemColumn(key); }).map(function (key) {
      return { key: key, label: key };
    });
  }

  function resolveRelatedTables(appState, baseTable) {
    var info = appState.data.schemaInfo || {};
    var map = info.tableMap || {};
    var related = [];
    Object.keys(map || {}).forEach(function (name) {
      var def = map[name] || {};
      var fkRefs = def.fkReferences || [];
      var hasRelation = fkRefs.some(function (fk) { return fk && fk.targetTable === baseTable; });
      if (hasRelation) {
        related.push({ name: name, label: resolveTableLabel(appState, name) });
      }
    });
    related.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return related;
  }

  function resolvePatientFkColumns(appState, tableName, baseTable) {
    var info = appState.data.schemaInfo || {};
    var map = info.tableMap || {};
    var def = map[tableName] || {};
    var fkRefs = def.fkReferences || [];
    return fkRefs
      .filter(function (fk) { return fk && fk.targetTable === baseTable; })
      .map(function (fk) { return fk.columnName || fk.name; })
      .filter(Boolean);
  }

  function recordMatchesPatient(record, fkColumns, patientId) {
    if (!record || !patientId || !fkColumns.length) return false;
    return fkColumns.some(function (field) {
      var value = record[field];
      if (value && typeof value === 'object') {
        var id = value.id || value.Id || value.uuid || value.uid;
        return String(id) === String(patientId);
      }
      if (value !== undefined && value !== null) {
        return String(value) === String(patientId);
      }
      var objKey = field.replace(/_id$/, '');
      var obj = record[objKey];
      if (obj && typeof obj === 'object') {
        var objId = obj.id || obj.Id || obj.uuid || obj.uid;
        return String(objId) === String(patientId);
      }
      return false;
    });
  }

  async function openModalForTable(ctx, tableName, form, options) {
    if (!tableName) return;
    await ensureReferenceDataForTable(ctx, tableName);
    await ensureTableMeta(ctx, tableName);
    ctx.setState(function (prev) {
      var sc = prev.data.screens.profiles || {};
      var mode = (options && options.mode) || ((form && (form.id || form.Id)) ? 'edit' : 'create');
      var nextForm = Object.assign({}, form || {});
      if (mode === 'create') {
        var defaults = getSystemDefaults(ctx);
        Object.keys(defaults).forEach(function (key) {
          if (nextForm[key] === undefined || nextForm[key] === null || nextForm[key] === '') {
            nextForm[key] = defaults[key];
          }
        });
      }
      var modal = Object.assign({}, options || {}, {
        open: true,
        table: tableName,
        form: nextForm,
        tab: (options && options.tab) || 'basic',
        mode: mode
      });
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            profiles: Object.assign({}, sc, { modal: modal })
          })
        })
      });
    });
  }

  function renderSchemaModal(appState, lang) {
    var state = appState.data.screens.profiles || {};
    if (!global.ClinicSchemaCrud || !state.modal || !state.modal.open) return null;
    var tableName = state.modal.table;
    var referenceData = (appState.data.referenceData && appState.data.referenceData[tableName]) || {};
    return global.ClinicSchemaCrud.renderModal({
      tableName: tableName,
      schemaInfo: appState.data.schemaInfo,
      columnsMeta: resolveSchemaColumns(appState, tableName),
      referenceData: referenceData,
      lang: lang,
      modal: state.modal,
      gkeys: {
        close: 'profiles:close-modal',
        save: 'profiles:save-modal-record',
        updateField: 'profiles:update-modal-field',
        setTab: 'profiles:set-modal-tab'
      }
    });
  }

  function renderContextMenu(state, lang) {
    var ctxMenu = state.contextMenu;
    if (!ctxMenu || !ctxMenu.visible) return null;

    var menuItems = [
      { key: 'profiles:ctx-edit', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️' },
      { key: 'profiles:ctx-view', label: lang === 'ar' ? 'عرض' : 'View', icon: '👁️' },
      { key: 'profiles:ctx-delete', label: lang === 'ar' ? 'حذف' : 'Delete', icon: '🗑️', danger: true },
      { divider: true },
      { key: 'profiles:ctx-contracts', label: lang === 'ar' ? 'العقود' : 'Contracts', icon: '📑' },
      { key: 'profiles:ctx-bookings', label: lang === 'ar' ? 'الحجوزات' : 'Bookings', icon: '📅' },
      { key: 'profiles:ctx-new-booking', label: lang === 'ar' ? 'حجز جديد' : 'New Booking', icon: '➕' }
    ];

    return D.Div({
      attrs: {
        class: 'fixed bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[200px] z-[200]',
        style: 'left: ' + ctxMenu.x + 'px; top: ' + ctxMenu.y + 'px;',
        gkey: 'profiles:close-context-menu'
      }
    }, menuItems.map(function (item) {
      if (item.divider) {
        return D.Div({ attrs: { class: 'h-px bg-[var(--border)] my-1' } });
      }
      return D.Button({
        attrs: {
          type: 'button',
          gkey: item.key,
          'data-record-id': ctxMenu.recordId,
          class: 'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-[var(--muted)] ' +
            (item.danger ? 'text-red-600 hover:bg-red-50' : 'text-[var(--foreground)]')
        }
      }, [
        D.Span({ attrs: { class: 'text-base' } }, [item.icon]),
        D.Span({}, [item.label])
      ]);
    }));
  }

  function renderContextActions(appState, profile, lang) {
    if (!profile) return null;
    var actions = [
      { key: 'profiles:open-modal', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'outline' },
      { key: 'profiles:view-profile', label: lang === 'ar' ? 'عرض' : 'View', icon: '👁️', variant: 'secondary' },
      { key: 'profiles:to-contracts', label: lang === 'ar' ? 'العقود' : 'Contracts', icon: '📑', variant: 'ghost' },
      { key: 'profiles:to-bookings', label: lang === 'ar' ? 'الحجوزات' : 'Bookings', icon: '📅', variant: 'ghost' },
      { key: 'profiles:new-booking', label: lang === 'ar' ? '+ حجز' : '+ Book', icon: '➕', variant: 'primary', size: 'sm' }
    ];

    var relatedTables = resolveRelatedTables(appState, 'clinic_patients');
    var quickMap = [
      { hint: 'contract', icon: '📑', label: lang === 'ar' ? 'عقد جديد' : 'New Contract' },
      { hint: 'invoice', icon: '🧾', label: lang === 'ar' ? 'فاتورة' : 'Invoice' },
      { hint: 'payment', icon: '💳', label: lang === 'ar' ? 'دفعة' : 'Payment' }
    ];
    quickMap.forEach(function (item) {
      var match = relatedTables.find(function (t) { return String(t.name || '').toLowerCase().indexOf(item.hint) !== -1; });
      if (match) {
        actions.push({
          key: 'profiles:new-related',
          label: item.label,
          icon: item.icon,
          variant: 'outline',
          attrs: { 'data-table': match.name }
        });
      }
    });

    return D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, actions.map(function (action) {
      return UC.Button({
        key: action.key,
        label: action.label,
        icon: action.icon,
        variant: action.variant,
        size: action.size || 'sm',
        attrs: Object.assign({ 'data-profile-id': profile.id }, action.attrs || {})
      });
    }));
  }

  // --- Main Screen Render ---

  function renderRelatedSection(appState, state, lang) {
    var profile = state.selected;
    if (!profile) return null;
    var relatedTables = resolveRelatedTables(appState, 'clinic_patients');
    if (!relatedTables.length) return null;

    var relatedState = state.related || {};
    var activeTable = relatedState.active || (relatedTables[0] && relatedTables[0].name);
    if (!activeTable) return null;

    var recordsByTable = relatedState.recordsByTable || {};
    var loadingByTable = relatedState.loadingByTable || {};
    var rows = recordsByTable[activeTable] || [];
    var patientId = profile.id || profile.Id;
    var fkColumns = resolvePatientFkColumns(appState, activeTable, 'clinic_patients');
    var filtered = rows.filter(function (row) { return recordMatchesPatient(row, fkColumns, patientId); });
    var columns = buildSchemaColumns(appState, activeTable, null, null, filtered);
    var isLoading = !!loadingByTable[activeTable];
    var activeLabel = resolveTableLabel(appState, activeTable);

    return D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4' } }, [
      D.Div({ attrs: { class: 'flex flex-wrap items-center justify-between gap-3' } }, [
        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
          D.Span({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'السجلات المرتبطة' : 'Related Records']),
          D.Span({ attrs: { class: 'font-semibold' } }, [activeLabel])
        ]),
        UC.Button({
          key: 'profiles:new-related',
          label: lang === 'ar' ? 'إضافة' : 'Add',
          icon: '➕',
          variant: 'primary',
          size: 'sm',
          attrs: { 'data-table': activeTable }
        })
      ]),
      D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, relatedTables.map(function (tab) {
        var isActive = tab.name === activeTable;
        return D.Button({
          attrs: {
            type: 'button',
            gkey: 'profiles:select-related',
            'data-table': tab.name,
            class: 'px-3 py-1.5 rounded-full text-xs border ' + (isActive ? 'border-[var(--primary)] text-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]' : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-1)]')
          }
        }, [tab.label]);
      })),
      isLoading
        ? D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...'])
        : UC.Table({
          columns: columns,
          data: filtered,
          rowKey: 'profiles:select-related-record',
          schemaInfo: appState.data.schemaInfo,
          referenceData: (appState.data.referenceData && appState.data.referenceData[activeTable]) || {},
          lang: lang,
          actions: [
            { key: 'profiles:edit-related', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'outline', attrs: { 'data-table': activeTable } },
            { key: 'profiles:view-related', label: lang === 'ar' ? 'عرض' : 'View', icon: '👁️', variant: 'ghost', attrs: { 'data-table': activeTable } }
          ],
          tableName: activeTable
        })
    ]);
  }

  function renderDetailPanel(appState, state, lang) {
    var profile = state.selected;
    if (!profile) {
      return D.Div({ attrs: { class: 'rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-[var(--muted-foreground)]' } }, [
        D.Div({ attrs: { class: 'text-4xl mb-4' } }, ['👤']),
        D.Div({}, [lang === 'ar' ? 'اختر عميلًا لعرض ملفه' : 'Select a client to inspect'])
      ]);
    }

    return D.Div({ attrs: { class: 'space-y-6' } }, [
      // Header Card
      D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm' } }, [
        D.Div({ attrs: { class: 'flex items-start justify-between gap-4' } }, [
          D.Div({ attrs: { class: 'flex items-center gap-4' } }, [
            renderAvatar(profile, 'lg'),
            D.Div({ attrs: { class: 'space-y-1' } }, [
              D.H2({ attrs: { class: 'text-xl font-bold' } }, [profile.display_name || '---']),
              D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [profile.patient_code || '#---'])
            ])
          ]),
          D.Div({}, [
            UC.Badge(profile.status || (profile.is_active ? 'Active' : 'Inactive'), profile.is_active ? 'primary' : 'default')
          ])
        ]),
        D.Div({ attrs: { class: 'mt-6 pt-6 border-t border-[var(--border)]' } }, [
          renderContextActions(appState, profile, lang)
        ])
      ]),

      // Quick Info
      D.Div({ attrs: { class: 'grid grid-cols-2 gap-4' } }, [
        D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [
          D.Div({ attrs: { class: 'text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1' } }, [lang === 'ar' ? 'آخر زيارة' : 'Last Visit']),
          D.Div({ attrs: { class: 'font-medium' } }, [normalizeDate(profile.last_visit_at)])
        ]),
        D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [
          D.Div({ attrs: { class: 'text-xs text-[var(--muted-foreground)] uppercase tracking-wider mb-1' } }, [lang === 'ar' ? 'الموبايل' : 'Mobile']),
          D.Div({ attrs: { class: 'font-medium' } }, [profile.mobile || '---'])
        ])
      ]),
      renderRelatedSection(appState, state, lang)
    ]);
  }

  function renderScreen(appState) {
    var state = appState.data.screens.profiles || {};
    var lang = appState.env.lang;

    // Dynamic Labels
    var tableLabel = resolveTableLabel(appState, 'clinic_patients');

    // Get Groups from Schema
    var info = appState.data.schemaInfo || {};
    var schema = (info.tableMap || {}).clinic_patients || {};
    var groupsDef = (schema.settings && schema.settings.groups) || {};
    var groups = Object.keys(groupsDef).map(function (k) { return Object.assign({ id: k }, groupsDef[k], { labels: groupsDef[k].labels || groupsDef[k].label, label: groupsDef[k].label || groupsDef[k].labels }); }).sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    if (!groups.length) groups = [{ id: 'basic', label: 'basic' }];

    // Dynamic Columns with Group Filtering
    var visibleGroups = state.visibleGroups || ['basic'];
    var columns = buildSchemaColumns(appState, 'clinic_patients', visibleGroups, null, state.list || []);
    var tableActions = [
      { key: 'profiles:action-edit', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'outline' },
      { key: 'profiles:action-view', label: lang === 'ar' ? 'عرض' : 'View', icon: '👁️', variant: 'ghost' },
      { key: 'profiles:action-delete', label: lang === 'ar' ? 'حذف' : 'Delete', icon: '🗑️', variant: 'danger' }
    ];

    return D.Div({ attrs: { class: 'space-y-4 h-full flex flex-col' } }, [
      // Toolbar
      D.Div({ attrs: { class: 'flex flex-col gap-4 bg-[var(--card)] p-4 rounded-xl border border-[var(--border)] shadow-sm' } }, [
        D.Div({ attrs: { class: 'flex md:items-center justify-between gap-4' } }, [
          D.Div({ attrs: { class: 'flex items-center gap-3' } }, [
            D.Div({ attrs: { class: 'p-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]' } }, ['👤']),
            D.Div({}, [
              D.H2({ attrs: { class: 'font-bold' } }, [tableLabel]),
              D.Div({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [state.total + (lang === 'ar' ? ' سجل' : ' records')])
            ])
          ]),
          D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
            UI.SearchBar ? UI.SearchBar({
              value: state.search || '',
              placeholder: lang === 'ar' ? 'بحث...' : 'Search...',
              onInput: 'profiles:update-search'
            }) : UC.FormInput({ name: 'search', value: state.search, placeholder: 'Search...', key: 'profiles:update-search' }),
            UC.Button({ key: 'profiles:new', label: lang === 'ar' ? 'جديد' : 'New', icon: '➕', variant: 'primary' })
          ])
        ]),
        // Group Toggles Section
        D.Div({ attrs: { class: 'flex flex-col gap-3 pt-3 border-t border-[var(--border)]' } }, [
          D.Div({ attrs: { class: 'flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]' } }, [
            D.Span({}, ['👁️']),
            D.Span({}, [lang === 'ar' ? 'عرض مجموعات الأعمدة:' : 'Column Groups:'])
          ]),
          D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, groups.map(function (g) {
            var isActive = visibleGroups.indexOf(g.id) !== -1;
            var lblSource = g.labels || g.label || {};
            var lbl = lang === 'ar' ? (lblSource.ar || lblSource.label || lblSource) : (lblSource.en || lblSource.label || lblSource);
            return D.Button({
              attrs: {
                type: 'button',
                gkey: 'profiles:toggle-group',
                'data-group': g.id,
                class: 'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all border shadow-sm ' +
                  (isActive
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)] shadow-primary/20'
                    : 'bg-[var(--surface-1)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--primary)] hover:shadow-md')
              }
            }, [
              D.Span({ attrs: { class: 'text-base' } }, [g.icon || '•']),
              D.Span({}, [lbl])
            ]);
          }))
        ])
      ]),

      // Content Grid
      D.Div({ attrs: { class: 'flex-1 grid lg:grid-cols-12 gap-6 min-h-0' } }, [
        // List
        D.Div({ attrs: { class: 'lg:col-span-8 flex flex-col min-h-0' } }, [
          UC.Table({
            columns: columns,
            data: state.list || [],
            activeId: state.selectedId,
            rowKey: 'profiles:select',
            schemaInfo: appState.data.schemaInfo,
            referenceData: (appState.data.referenceData && appState.data.referenceData['clinic_patients']) || {},
            lang: lang,
            tableName: 'clinic_patients',
            contextMenuKey: 'profiles:show-context-menu',
            actions: tableActions
          })
        ]),
        // Detail
        D.Div({ attrs: { class: 'lg:col-span-4 flex flex-col min-h-0 overflow-y-auto' } }, [
          renderDetailPanel(appState, state, lang)
        ])
      ]),

      renderContextMenu(state, lang),
      renderSchemaModal(appState, lang)
    ]);
  }

  // --- Logic & Orders ---
  async function loadRelatedTable(app, tableName) {
    if (!tableName) return;
    var state = app.getState();
    var lang = state.env.lang;

    app.setState(function (prev) {
      var sc = prev.data.screens.profiles || {};
      var related = Object.assign({}, sc.related || {});
      var loading = Object.assign({}, related.loadingByTable || {});
      loading[tableName] = true;
      related.loadingByTable = loading;
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            profiles: Object.assign({}, sc, { related: related })
          })
        })
      });
    });

    try {
      await ensureReferenceDataForTable(app, tableName);
      var res = await M.REST.repo(tableName).search({ lang: lang, limit: 200, withMeta: 1 });
      var records = res.data || res || [];
      var columnsMeta = res.columnsMeta || [];
      app.setState(function (prev) {
        var sc = prev.data.screens.profiles || {};
        var related = Object.assign({}, sc.related || {});
        var recordsByTable = Object.assign({}, related.recordsByTable || {});
        recordsByTable[tableName] = records;
        var loading = Object.assign({}, related.loadingByTable || {});
        loading[tableName] = false;
        related.recordsByTable = recordsByTable;
        related.loadingByTable = loading;
        var columnsMetaByTable = Object.assign({}, sc.columnsMetaByTable || {});
        if (columnsMeta.length) columnsMetaByTable[tableName] = columnsMeta;
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              profiles: Object.assign({}, sc, {
                related: related,
                columnsMetaByTable: columnsMetaByTable
              })
            })
          })
        });
      });
    } catch (err) {
      console.error('[Clinic Profiles] Failed to load related table', tableName, err);
      app.setState(function (prev) {
        var sc = prev.data.screens.profiles || {};
        var related = Object.assign({}, sc.related || {});
        var loading = Object.assign({}, related.loadingByTable || {});
        loading[tableName] = false;
        related.loadingByTable = loading;
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              profiles: Object.assign({}, sc, { related: related })
            })
          })
        });
      });
    }
  }

  async function loadScreen(app) {
    var state = app.getState();
    var screenState = state.data.screens.profiles || {};
    var lang = state.env.lang;

    try {
      await ensureReferenceDataForTable(app, 'clinic_patients');
      var repo = M.REST.repo('clinic_patients');
      var result = await repo.search({
        lang: lang,
        q: screenState.search || '',
        page: screenState.page || 1,
        limit: screenState.limit || 20,
        withMeta: 1
      });

      var list = result.data || result || [];
      // Ensure we keep selection if still in list, otherwise select first
      var selected = screenState.selectedId
        ? list.find(function (r) { return (r.id || r.Id) === screenState.selectedId; })
        : (list[0] || null);
      var columnsMeta = result.columnsMeta || [];
      var relatedTables = resolveRelatedTables(state, 'clinic_patients');
      var defaultRelated = (screenState.related && screenState.related.active) || (relatedTables[0] && relatedTables[0].name) || null;

      app.setState(function (prev) {
        var prevProfiles = prev.data.screens.profiles || {};

        // Default visible groups: 'basic' only (user can toggle others)
        var defaultGroups = ['basic'];
        var currentVisible = prevProfiles.visibleGroups || defaultGroups;
        var nextColumns = Object.assign({}, prevProfiles.columnsMetaByTable || {});
        if (columnsMeta.length) nextColumns.clinic_patients = columnsMeta;
        var related = Object.assign({}, prevProfiles.related || {}, { active: defaultRelated });

        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              profiles: Object.assign({}, prevProfiles, {
                loading: false,
                list: list,
                total: result.count || list.length,
                selected: selected,
                selectedId: selected ? (selected.id || selected.Id) : null,
                visibleGroups: currentVisible,
                columnsMetaByTable: nextColumns,
                related: related,
                modal: prevProfiles.modal
              })
            })
          })
        });
      });
      var existingRelated = screenState.related && screenState.related.recordsByTable && screenState.related.recordsByTable[defaultRelated];
      if (defaultRelated && !existingRelated) {
        loadRelatedTable(app, defaultRelated);
      }
    } catch (error) {
      console.error(error);
    }
  }

  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.profiles = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'profiles:update-search': {
        on: ['input'],
        gkeys: ['profiles:update-search'],
        handler: function (ev, ctx) {
          var val = ev.target.value;
          ctx.setState(function (prev) {
            var p = prev.data.screens.profiles || {};
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, p, { search: val }) }) }) });
          });
          loadScreen(ctx); // Debounce ideally
        }
      },
      'profiles:select': {
        on: ['click'],
        gkeys: ['profiles:select'],
        handler: function (ev, ctx) {
          var tr = ev.target.closest('tr');
          if (!tr) return; // FIXED: Null check
          var id = tr.getAttribute('data-record-id');
          if (!id) return;
          ctx.setState(function (prev) {
            var p = prev.data.screens.profiles || {};
            var sel = p.list.find(function (r) { return (r.id || r.Id) == id; });
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, p, { selectedId: id, selected: sel }) }) }) });
          });
        }
      },
      'profiles:new': {
        on: ['click'],
        gkeys: ['profiles:new'],
        handler: async function (_ev, ctx) {
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var p = prev.data.screens.profiles || {};
            var defaults = getSystemDefaults(ctx);
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, p, {
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: defaults,
                      tab: 'basic',
                      readonly: false,
                      mode: 'create'
                    }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:open-modal': {
        on: ['click'],
        gkeys: ['profiles:open-modal'],
        handler: async function (_ev, ctx) {
          var p = ctx.getState().data.screens.profiles;
          if (!p.selected) return;
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            // Clone selected to form
            var form = JSON.parse(JSON.stringify(sc.selected));
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: form,
                      tab: 'basic',
                      readonly: false,
                      mode: 'edit'
                    }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:action-edit': {
        on: ['click'],
        gkeys: ['profiles:action-edit'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var list = sc.list || [];
            var sel = list.find(function (r) { return (r.id || r.Id) == id; });
            if (!sel) return prev;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    selectedId: id,
                    selected: sel,
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: JSON.parse(JSON.stringify(sel)),
                      tab: 'basic',
                      readonly: false,
                      mode: 'edit'
                    }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:action-view': {
        on: ['click'],
        gkeys: ['profiles:action-view'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var list = sc.list || [];
            var sel = list.find(function (r) { return (r.id || r.Id) == id; });
            if (!sel) return prev;
            var form = JSON.parse(JSON.stringify(sel));
            form.readonly = true;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    selectedId: id,
                    selected: sel,
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: form,
                      tab: 'basic',
                      readonly: true,
                      mode: 'view'
                    }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:action-delete': {
        on: ['click'],
        gkeys: ['profiles:action-delete'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          var confirmDelete = (typeof window !== 'undefined' && window.confirm) ? window.confirm('حذف هذا السجل؟') : true;
          if (!confirmDelete) return;
          try {
            var repo = M.REST.repo('clinic_patients');
            await repo.delete(id);
            await loadScreen(ctx);
          } catch (error) {
            console.error(error);
          }
        }
      },
      'profiles:view-profile': {
        on: ['click'],
        gkeys: ['profiles:view-profile'],
        handler: async function (_ev, ctx) {
          var p = ctx.getState().data.screens.profiles;
          if (!p.selected) return;
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var form = JSON.parse(JSON.stringify(sc.selected));
            // Mark as readonly
            form.readonly = true;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: form,
                      tab: 'basic',
                      readonly: true,
                      mode: 'view'
                    }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:print-profile': {
        on: ['click'],
        gkeys: ['profiles:print-profile'],
        handler: function (ev, ctx) {
          alert('Print functionality not connected yet!');
        }
      },
      'profiles:toggle-group': {
        on: ['click'],
        gkeys: ['profiles:toggle-group'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          var grp = btn.getAttribute('data-group');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var vis = sc.visibleGroups || ['basic'];
            var nextVis = [];
            if (vis.indexOf(grp) !== -1) {
              // Toggle off (ensure at least one stays?) - allow hide all for now or keep basic
              nextVis = vis.filter(function (g) { return g !== grp; });
            } else {
              nextVis = vis.concat([grp]);
            }
            if (nextVis.length === 0) nextVis = ['basic']; // Fallback
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { visibleGroups: nextVis }) }) }) });
          });
        }
      },
      'profiles:close-modal': {
        on: ['click'],
        gkeys: ['profiles:close-modal'],
        handler: function (_ev, ctx) {
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var currentModal = sc.modal || {};
            // Preserve form and tab, close modal
            var newState = Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    modal: Object.assign({}, currentModal, { open: false })
                  })
                })
              })
            });
            return newState;
          });
        }
      },
      'profiles:set-modal-tab': {
        on: ['click'],
        gkeys: ['profiles:set-modal-tab'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          if (!btn) return;
          var tab = btn.getAttribute('data-tab');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var m = sc.modal || {};
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { modal: Object.assign({}, m, { tab: tab }) }) }) }) });
          });
        }
      },
      'profiles:update-modal-field': {
        on: ['input', 'change'],
        gkeys: ['profiles:update-modal-field'],
        handler: function (ev, ctx) {
          var f = ev.target.getAttribute('data-field');
          var isCheckbox = ev.target.type === 'checkbox';
          var v = isCheckbox ? ev.target.checked : ev.target.value;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var m = sc.modal || {};
            var form = Object.assign({}, m.form || {});
            form[f] = v;
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { modal: Object.assign({}, m, { form: form }) }) }) }) });
          });
        }
      },
      'profiles:save-modal-record': {
        on: ['click'],
        gkeys: ['profiles:save-modal-record'],
        handler: async function (_ev, ctx) {
          var state = ctx.getState().data.screens.profiles;
          if (!state.modal || !state.modal.form || !state.modal.table) {
            console.error('Save failed: Modal state missing table/form.');
            return;
          }
          var tableName = state.modal.table;
          var form = Object.assign({}, state.modal.form || {});
          var id = form.id || form.Id;
          var repo = M.REST.repo(tableName);
          try {
            var sysDefaults = getSystemDefaults(ctx);
            Object.keys(sysDefaults).forEach(function (k) {
              if (sysDefaults[k] !== undefined && sysDefaults[k] !== null) {
                form[k] = sysDefaults[k];
              }
            });
            if (id && state.modal.mode !== 'create') {
              await repo.update(id, { record: form });
            } else {
              await repo.create({ record: form });
            }
            ctx.setState(function (prev) {
              var sc = prev.data.screens.profiles;
              return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                  screens: Object.assign({}, prev.data.screens, {
                    profiles: Object.assign({}, sc, { modal: { open: false } })
                  })
                })
              });
            });
            if (tableName === 'clinic_patients') {
              loadScreen(ctx);
            } else {
              loadRelatedTable(ctx, tableName);
            }
          } catch (e) {
            console.error(e);
            var lang = ctx.getState().env.lang;
            alert(lang === 'ar' ? 'تعذر حفظ البيانات' : 'Failed to save record');
          }
        }
      },
      'profiles:to-contracts': {
        on: ['click'],
        gkeys: ['profiles:to-contracts'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-profile-id') : null;
          if (!id) return;
          var tables = resolveRelatedTables(ctx.getState(), 'clinic_patients');
          var target = tables.find(function (t) { return String(t.name || '').toLowerCase().indexOf('contract') !== -1; });
          if (!target) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles || {};
            var related = Object.assign({}, sc.related || {}, { active: target.name });
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { related: related }) }) }) });
          });
          loadRelatedTable(ctx, target.name);
        }
      },
      'profiles:to-bookings': {
        on: ['click'],
        gkeys: ['profiles:to-bookings'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-profile-id') : null;
          if (!id) return;
          var tables = resolveRelatedTables(ctx.getState(), 'clinic_patients');
          var target = tables.find(function (t) { return String(t.name || '').toLowerCase().indexOf('booking') !== -1; });
          if (!target) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles || {};
            var related = Object.assign({}, sc.related || {}, { active: target.name });
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { related: related }) }) }) });
          });
          loadRelatedTable(ctx, target.name);
        }
      },
      'profiles:new-booking': {
        on: ['click'],
        gkeys: ['profiles:new-booking'],
        handler: async function (ev, ctx) {
          var p = ctx.getState().data.screens.profiles;
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-profile-id') : null;

          if (!id && !p.selectedId) {
            alert('Please select a profile first');
            return;
          }

          var patientId = id || p.selectedId;
          var tableName = 'clinic_bookings';
          var fkColumns = resolvePatientFkColumns(ctx.getState(), tableName, 'clinic_patients');
          var form = {};
          if (fkColumns.length) form[fkColumns[0]] = patientId;
          await openModalForTable(ctx, tableName, form, { readonly: false, mode: 'create' });
        }
      },
      'profiles:select-related': {
        on: ['click'],
        gkeys: ['profiles:select-related'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          if (!btn) return;
          var tableName = btn.getAttribute('data-table');
          if (!tableName) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles || {};
            var related = Object.assign({}, sc.related || {}, { active: tableName });
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, { related: related })
                })
              })
            });
          });
          loadRelatedTable(ctx, tableName);
        }
      },
      'profiles:new-related': {
        on: ['click'],
        gkeys: ['profiles:new-related'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var tableName = btn ? btn.getAttribute('data-table') : null;
          if (!tableName) return;
          var p = ctx.getState().data.screens.profiles || {};
          var patientId = (p.selected && (p.selected.id || p.selected.Id)) || p.selectedId;
          var form = {};
          if (patientId) {
            var fkColumns = resolvePatientFkColumns(ctx.getState(), tableName, 'clinic_patients');
            if (fkColumns.length) form[fkColumns[0]] = patientId;
          }
          await openModalForTable(ctx, tableName, form, { readonly: false, mode: 'create' });
        }
      },
      'profiles:edit-related': {
        on: ['click'],
        gkeys: ['profiles:edit-related'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var tableName = btn ? btn.getAttribute('data-table') : null;
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!tableName || !id) return;
          var state = ctx.getState().data.screens.profiles || {};
          var related = state.related || {};
          var list = (related.recordsByTable && related.recordsByTable[tableName]) || [];
          var record = list.find(function (r) { return String(r.id || r.Id || r.uuid || r.uid) === String(id); });
          if (!record) return;
          await openModalForTable(ctx, tableName, JSON.parse(JSON.stringify(record)), { readonly: false, mode: 'edit' });
        }
      },
      'profiles:view-related': {
        on: ['click'],
        gkeys: ['profiles:view-related'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var tableName = btn ? btn.getAttribute('data-table') : null;
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!tableName || !id) return;
          var state = ctx.getState().data.screens.profiles || {};
          var related = state.related || {};
          var list = (related.recordsByTable && related.recordsByTable[tableName]) || [];
          var record = list.find(function (r) { return String(r.id || r.Id || r.uuid || r.uid) === String(id); });
          if (!record) return;
          var form = JSON.parse(JSON.stringify(record));
          form.readonly = true;
          await openModalForTable(ctx, tableName, form, { readonly: true, mode: 'view' });
        }
      },
      'profiles:select-related-record': {
        on: ['click'],
        gkeys: ['profiles:select-related-record'],
        handler: async function (ev, ctx) {
          var tr = ev.target.closest('tr');
          if (!tr) return;
          var tableName = tr.getAttribute('data-table');
          var recordId = tr.getAttribute('data-record-id');
          if (!tableName || !recordId) return;
          var state = ctx.getState().data.screens.profiles || {};
          var related = state.related || {};
          var list = (related.recordsByTable && related.recordsByTable[tableName]) || [];
          var record = list.find(function (r) { return String(r.id || r.Id || r.uuid || r.uid) === String(recordId); });
          if (!record) return;
          record.readonly = true;
          await openModalForTable(ctx, tableName, JSON.parse(JSON.stringify(record)), { readonly: true, mode: 'view' });
        }
      },
      // Context Menu Handlers
      'profiles:show-context-menu': {
        on: ['contextmenu'],
        gkeys: ['profiles:show-context-menu'],
        handler: function (ev, ctx) {
          ev.preventDefault();
          var tr = ev.target.closest('tr');
          if (!tr) return;
          var id = tr.getAttribute('data-record-id');
          if (!id) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    contextMenu: { visible: true, x: ev.clientX, y: ev.clientY, recordId: id }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:close-context-menu': {
        on: ['click'],
        gkeys: ['document'],
        handler: function (ev, ctx) {
          var state = ctx.getState().data.screens.profiles;
          if (!state.contextMenu || !state.contextMenu.visible) return;

          // Don't close if clicking inside context menu
          var menu = ev.target.closest('[gkey="profiles:close-context-menu"]');
          if (menu && ev.target.closest('button')) return;

          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, { contextMenu: { visible: false } })
                })
              })
            });
          });
        }
      },
      'profiles:ctx-edit': {
        on: ['click'],
        gkeys: ['profiles:ctx-edit'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var sel = (sc.list || []).find(function (r) { return (r.id || r.Id) == id; });
            if (!sel) return prev;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    selectedId: id,
                    selected: sel,
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: JSON.parse(JSON.stringify(sel)),
                      tab: 'basic',
                      readonly: false,
                      mode: 'edit'
                    },
                    contextMenu: { visible: false }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:ctx-view': {
        on: ['click'],
        gkeys: ['profiles:ctx-view'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          await ensureReferenceDataForTable(ctx, 'clinic_patients');
          await ensureTableMeta(ctx, 'clinic_patients');
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            var sel = (sc.list || []).find(function (r) { return (r.id || r.Id) == id; });
            if (!sel) return prev;
            var form = JSON.parse(JSON.stringify(sel));
            form.readonly = true;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, {
                    selectedId: id,
                    selected: sel,
                    modal: {
                      open: true,
                      table: 'clinic_patients',
                      form: form,
                      tab: 'basic',
                      readonly: true,
                      mode: 'view'
                    },
                    contextMenu: { visible: false }
                  })
                })
              })
            });
          });
        }
      },
      'profiles:ctx-delete': {
        on: ['click'],
        gkeys: ['profiles:ctx-delete'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          var confirmDelete = window.confirm('حذف هذا السجل؟');
          if (!confirmDelete) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, { contextMenu: { visible: false } })
                })
              })
            });
          });
          try {
            await M.REST.repo('clinic_patients').delete(id);
            await loadScreen(ctx);
          } catch (error) {
            console.error(error);
          }
        }
      },
      'profiles:ctx-contracts': {
        on: ['click'],
        gkeys: ['profiles:ctx-contracts'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, { contextMenu: { visible: false } })
                })
              })
            });
          });
          var tables = resolveRelatedTables(ctx.getState(), 'clinic_patients');
          var target = tables.find(function (t) { return String(t.name || '').toLowerCase().indexOf('contract') !== -1; });
          if (!target) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles || {};
            var related = Object.assign({}, sc.related || {}, { active: target.name });
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { related: related }) }) }) });
          });
          loadRelatedTable(ctx, target.name);
        }
      },
      'profiles:ctx-bookings': {
        on: ['click'],
        gkeys: ['profiles:ctx-bookings'],
        handler: function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  profiles: Object.assign({}, sc, { contextMenu: { visible: false } })
                })
              })
            });
          });
          var tables = resolveRelatedTables(ctx.getState(), 'clinic_patients');
          var target = tables.find(function (t) { return String(t.name || '').toLowerCase().indexOf('booking') !== -1; });
          if (!target) return;
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles || {};
            var related = Object.assign({}, sc.related || {}, { active: target.name });
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { related: related }) }) }) });
          });
          loadRelatedTable(ctx, target.name);
        }
      },
      'profiles:ctx-new-booking': {
        on: ['click'],
        gkeys: ['profiles:ctx-new-booking'],
        handler: async function (ev, ctx) {
          var btn = ev.target.closest('button');
          var id = btn ? btn.getAttribute('data-record-id') : null;
          if (!id) return;
          var tableName = 'clinic_bookings';
          var fkColumns = resolvePatientFkColumns(ctx.getState(), tableName, 'clinic_patients');
          var form = {};
          if (fkColumns.length) form[fkColumns[0]] = id;
          await openModalForTable(ctx, tableName, form, { readonly: false, mode: 'create' });
          ctx.setState(function (prev) {
            var sc = prev.data.screens.profiles || {};
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { profiles: Object.assign({}, sc, { contextMenu: { visible: false } }) }) }) });
          });
        }
      }
    }
  };

})(window);
