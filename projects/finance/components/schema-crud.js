(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M && M.UI;
  var D = M && M.DSL;

  if (!M || !D || !UI || !UC) {
    console.error('[Schema CRUD Modal] Missing Mishkah UI/DSL/UniversalComp.');
    return;
  }

  function resolveGroups(schema, lang) {
    var groups = (schema && schema.settings && schema.settings.groups) || (schema && schema.smart_features && schema.smart_features.settings && schema.smart_features.settings.groups) || {};
    var normalized = Object.keys(groups || {}).map(function (id) {
      var def = groups[id] || {};
      var labels = def.labels || {};
      return {
        id: id,
        order: def.order || 999,
        labels: labels,
        label: labels[lang] || labels.ar || labels.en || id
      };
    });
    if (!normalized.length) {
      normalized.push({ id: 'basic', order: 1, labels: {}, label: 'basic' });
    }
    normalized.sort(function (a, b) { return a.order - b.order; });
    return normalized;
  }

  function resolveColumnsMeta(schema, columnsMeta) {
    if (Array.isArray(columnsMeta) && columnsMeta.length) return columnsMeta;
    var smartCols = (schema && schema.smart_features && schema.smart_features.columns) || [];
    return Array.isArray(smartCols) ? smartCols : [];
  }

  function isSystemColumn(name) {
    if (!name) return false;
    var lower = String(name).toLowerCase();
    return ['company', 'company_id', 'branch', 'branch_id', 'user_insert'].indexOf(lower) !== -1;
  }

  function resolveColumnLabel(col, lang) {
    if (!col) return '';
    var labels = col.labels || {};
    return labels[lang] || labels.ar || labels.en || col.label || col.name || '';
  }

  function resolveOptionLabel(row, lang) {
    if (!row || typeof row !== 'object') return '';
    var direct = row.display_name || row.name || row.label || row.title || row.code;
    if (direct) return direct;
    var i18n = row.i18n || {};
    var langEntry = (i18n.lang && i18n.lang[lang]) || i18n[lang] || null;
    if (langEntry && (langEntry.name || langEntry.label || langEntry.title)) {
      return langEntry.name || langEntry.label || langEntry.title;
    }
    return row.id || row.Id || row.uuid || row.uid || '';
  }

  function resolveFkTarget(schema, fieldName) {
    if (!schema || !fieldName) return null;
    var fkList = schema.fkReferences || [];
    var match = fkList.find(function (fk) { return fk && (fk.columnName === fieldName || fk.name === fieldName); });
    return match ? match.targetTable : null;
  }

  function resolveInputType(col) {
    if (!col) return 'text';
    var component = col.component || '';
    if (component === 'textarea') return 'textarea';
    if (component === 'date') return 'date';
    if (component === 'datetime' || component === 'datetime-local') return 'datetime-local';
    if (component === 'number') return 'number';
    if (component === 'phone') return 'tel';
    if (component === 'email') return 'email';
    if (component === 'checkbox') return 'checkbox';
    var rawType = String(col.type || col.data_type || '').toLowerCase();
    if (rawType === 'boolean' || rawType === 'bool' || rawType === 'bit') return 'checkbox';
    var name = col.name || '';
    if (name.indexOf('date') !== -1) return 'date';
    if (name.indexOf('datetime') !== -1 || name === 'begin_date') return 'datetime-local';
    if (name.indexOf('count') !== -1 || name.indexOf('_kg') !== -1 || name.indexOf('_cm') !== -1 || name.indexOf('_l_') !== -1) return 'number';
    if (name === 'mobile' || name === 'phone') return 'tel';
    if (name === 'email') return 'email';
    return 'text';
  }

  function renderField(col, form, schema, referenceData, lang, gkey, readonly) {
    var fieldName = col.name;
    var label = resolveColumnLabel(col, lang) || fieldName;
    var value = form[fieldName];
    var isFk = col.source === 'fk' || (fieldName && fieldName.endsWith('_id') && fieldName !== 'id');
    var isReadOnly = col.is_read_only || false;
    var inputClass = 'flex h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[var(--muted-foreground)]';
    var labelClass = 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block';
    var inputType = resolveInputType(col);

    if (isFk) {
      var refTableName = resolveFkTarget(schema, fieldName);
      var refData = (referenceData && refTableName && referenceData[refTableName]) || [];
      var currentValue = (value && typeof value === 'object') ? (value.id || value.Id || value.uuid || value.uid) : value;
      var options = refData.map(function (row) {
        var id = row.id || row.Id || row.uuid || row.uid;
        return { id: id, label: resolveOptionLabel(row, lang) || id };
      });
      var disabled = !refTableName || readonly || isReadOnly;
      return D.Div({ attrs: { class: 'flex flex-col' } }, [
        D.Label({ attrs: { class: labelClass } }, [label]),
        D.Select({
          attrs: {
            'data-field': fieldName,
            gkey: gkey,
            class: inputClass + ' appearance-none',
            value: currentValue || '',
            disabled: disabled
          }
        }, [
          D.Option({ attrs: { value: '' } }, ['---']),
          ...options.map(function (opt) {
            return D.Option({ attrs: { value: opt.id, selected: String(currentValue) === String(opt.id) } }, [opt.label]);
          })
        ])
      ]);
    }

    if (inputType === 'textarea') {
      return D.Div({ attrs: { class: 'flex flex-col md:col-span-2' } }, [
        D.Label({ attrs: { class: labelClass } }, [label]),
        D.Textarea({
          attrs: {
            value: value || '',
            'data-field': fieldName,
            gkey: gkey,
            rows: 4,
            readonly: !!readonly || isReadOnly,
            class: inputClass + ' h-auto min-h-[120px]'
          }
        })
      ]);
    }

    if (inputType === 'checkbox') {
      return D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
        D.Input({
          attrs: {
            type: 'checkbox',
            checked: !!value,
            'data-field': fieldName,
            gkey: gkey,
            disabled: !!readonly || isReadOnly,
            class: 'h-4 w-4'
          }
        }),
        D.Label({ attrs: { class: 'text-sm text-[var(--foreground)]' } }, [label])
      ]);
    }

    var displayValue = value;
    if (inputType === 'date' && value) {
      displayValue = String(value).split('T')[0];
    }

    return D.Div({ attrs: { class: 'flex flex-col' } }, [
      D.Label({ attrs: { class: labelClass } }, [label]),
      D.Input({
        attrs: {
          type: inputType,
          value: displayValue || '',
          'data-field': fieldName,
          gkey: gkey,
          readonly: fieldName === 'id' || !!readonly || isReadOnly,
          class: inputClass
        }
      })
    ]);
  }

  function renderModal(opts) {
    var tableName = opts.tableName;
    if (!tableName) return null;
    var schemaInfo = opts.schemaInfo || {};
    var schema = (schemaInfo.tableMap && schemaInfo.tableMap[tableName]) || {};
    var lang = opts.lang || 'ar';
    var modal = opts.modal || {};
    if (!modal.open) return null;
    var form = modal.form || {};
    var columnsMeta = resolveColumnsMeta(schema, opts.columnsMeta || modal.columnsMeta);
    var groups = resolveGroups(schema, lang);
    var activeTab = modal.tab || (groups[0] && groups[0].id) || 'basic';
    var readonly = !!modal.readonly;
    var gkeys = opts.gkeys || {};
    var title = opts.title || (schema.labels && (schema.labels[lang] || schema.labels.ar || schema.labels.en)) || tableName;
    var referenceData = opts.referenceData || {};

    var fields = columnsMeta
      .filter(function (col) { return col && col.name && col.is_edit_show !== false && !isSystemColumn(col.name); })
      .sort(function (a, b) { return (a.sort || 999) - (b.sort || 999); });

    var tabFields = fields.filter(function (col) {
      var group = col.group || (groups[0] && groups[0].id) || 'basic';
      return group === activeTab;
    });

    var tabButtons = groups.map(function (group) {
      var isActive = group.id === activeTab;
      return D.Button({
        attrs: {
          type: 'button',
          gkey: gkeys.setTab,
          'data-tab': group.id,
          class: 'px-3 py-1.5 rounded-full text-xs border ' + (isActive ? 'border-[var(--primary)] text-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]' : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-1)]')
        }
      }, [group.label]);
    });

    var content = D.Div({ attrs: { class: 'space-y-4' } }, [
      D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, tabButtons),
      D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-4' } }, tabFields.map(function (col) {
        return renderField(col, form, schema, referenceData, lang, gkeys.updateField, readonly);
      }))
    ]);

    var actions = [];
    actions.push(UC.Button({ key: gkeys.close, label: lang === 'ar' ? 'إلغاء' : 'Cancel', variant: 'ghost' }));
    if (!readonly) {
      actions.push(UC.Button({ key: gkeys.save, label: lang === 'ar' ? 'حفظ' : 'Save', icon: '💾', variant: 'primary' }));
    }

    return UI.Modal({
      open: true,
      title: title,
      size: opts.size || 'full',
      closeGkey: gkeys.close,
      content: content,
      actions: actions
    });
  }

  global.FinanceSchemaCrud = {
    renderModal: renderModal
  };
})(window);
