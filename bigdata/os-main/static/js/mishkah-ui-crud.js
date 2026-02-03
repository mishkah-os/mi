/**
 * mishkah-ui-crud.js
 *
 * Generic CRUD (Create, Read, Update, Delete) component for Mishkah UI
 * Works with mishkah-store for data persistence
 *
 * @version 1.0.0
 * @author Mishkah POS System
 */

((window) => {
  'use strict';

  // Default configuration
  const DEFAULT_CONFIG = {
    table: null,                    // Required: table name in mishkah-store
    store: null,                    // Required: mishkah-store instance
    idField: 'id',                  // Primary key field name
    displayField: 'name',           // Field to display as title
    fields: [],                     // Array of field definitions
    lang: 'ar',                     // Language: 'ar' or 'en'
    rtl: true,                      // Right-to-left layout
    allowCreate: true,              // Allow creating new records
    allowEdit: true,                // Allow editing records
    allowDelete: true,              // Allow deleting records
    searchable: true,               // Enable search
    confirmDelete: true,            // Confirm before delete
    onSave: null,                   // Callback after save
    onDelete: null,                 // Callback after delete
    onError: null                   // Callback on error
  };

  /**
   * Field types supported
   */
  const FIELD_TYPES = {
    TEXT: 'text',
    NUMBER: 'number',
    EMAIL: 'email',
    PHONE: 'phone',
    TEXTAREA: 'textarea',
    SELECT: 'select',
    CHECKBOX: 'checkbox',
    DATE: 'date',
    DATETIME: 'datetime'
  };

  /**
   * Generate unique ID
   */
  const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * Normalize ID for comparison
   */
  const normalizeId = (value) => {
    if (!value) return null;
    const str = String(value).trim();
    return str || null;
  };

  /**
   * Create CRUD component
   * @param {Object} config - Configuration object
   * @returns {Object} CRUD component instance
   */
  const createCRUD = (config) => {
    // Merge config with defaults
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Validate required config
    if (!cfg.table) {
      throw new Error('[CRUD] table name is required');
    }
    if (!cfg.store || typeof cfg.store.list !== 'function') {
      throw new Error('[CRUD] valid mishkah-store instance is required');
    }

    // State
    let state = {
      mode: 'list',           // 'list' | 'create' | 'edit'
      records: [],            // All records from store
      editingRecord: null,    // Currently editing record
      searchQuery: '',        // Search query
      loading: false,         // Loading state
      error: null             // Error message
    };

    // Subscribers
    const subscribers = new Set();

    /**
     * Notify subscribers of state change
     */
    const notify = () => {
      subscribers.forEach(fn => fn(state));
    };

    /**
     * Subscribe to state changes
     */
    const subscribe = (fn) => {
      subscribers.add(fn);
      // Unsubscribe function
      return () => subscribers.delete(fn);
    };

    /**
     * Update state
     */
    const setState = (updates) => {
      state = { ...state, ...updates };
      notify();
    };

    /**
     * Load records from store
     */
    const loadRecords = async () => {
      setState({ loading: true, error: null });
      try {
        console.log('[CRUD] loadRecords started for table:', cfg.table);
        const records = await cfg.store.list(cfg.table);
        console.log('[CRUD] loadRecords received:', {
          table: cfg.table,
          count: records?.length || 0,
          sample: records?.slice(0, 2)
        });

        setState({
          records: Array.isArray(records) ? records : [],
          loading: false
        });
      } catch (err) {
        console.error('[CRUD] Failed to load records:', err);
        setState({
          loading: false,
          error: cfg.lang === 'ar' ? 'فشل تحميل البيانات' : 'Failed to load data'
        });
        if (cfg.onError) cfg.onError(err);
      }
    };

    /**
     * Create new record
     */
    const createRecord = async (data) => {
      setState({ loading: true, error: null });
      try {
        const record = {
          ...data,
          [cfg.idField]: data[cfg.idField] || generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await cfg.store.insert(cfg.table, record);

        setState({
          loading: false,
          mode: 'list'
        });

        await loadRecords();

        if (cfg.onSave) cfg.onSave(record);

        return record;
      } catch (err) {
        console.error('[CRUD] Failed to create record:', err);
        setState({
          loading: false,
          error: cfg.lang === 'ar' ? 'فشل حفظ البيانات' : 'Failed to save data'
        });
        if (cfg.onError) cfg.onError(err);
        throw err;
      }
    };

    /**
     * Update existing record
     */
    const updateRecord = async (id, data) => {
      setState({ loading: true, error: null });
      try {
        const existing = state.records.find(r =>
          normalizeId(r[cfg.idField]) === normalizeId(id)
        );

        if (!existing) {
          throw new Error('Record not found');
        }

        const record = {
          ...existing,
          ...data,
          [cfg.idField]: id,
          updatedAt: new Date().toISOString()
        };

        // Handle versioned tables
        if (existing.version) {
          record.version = existing.version + 1;
        }

        await cfg.store.update(cfg.table, record);

        setState({
          loading: false,
          mode: 'list',
          editingRecord: null
        });

        await loadRecords();

        if (cfg.onSave) cfg.onSave(record);

        return record;
      } catch (err) {
        console.error('[CRUD] Failed to update record:', err);
        setState({
          loading: false,
          error: cfg.lang === 'ar' ? 'فشل تحديث البيانات' : 'Failed to update data'
        });
        if (cfg.onError) cfg.onError(err);
        throw err;
      }
    };

    /**
     * Delete record
     */
    const deleteRecord = async (id) => {
      if (cfg.confirmDelete) {
        const confirmed = confirm(
          cfg.lang === 'ar'
            ? 'هل أنت متأكد من حذف هذا السجل؟'
            : 'Are you sure you want to delete this record?'
        );
        if (!confirmed) return;
      }

      setState({ loading: true, error: null });
      try {
        await cfg.store.delete(cfg.table, id);

        setState({ loading: false });
        await loadRecords();

        if (cfg.onDelete) cfg.onDelete(id);
      } catch (err) {
        console.error('[CRUD] Failed to delete record:', err);
        setState({
          loading: false,
          error: cfg.lang === 'ar' ? 'فشل حذف السجل' : 'Failed to delete record'
        });
        if (cfg.onError) cfg.onError(err);
        throw err;
      }
    };

    /**
     * Switch to create mode
     */
    const startCreate = () => {
      console.log('[CRUD] startCreate called');
      setState({ mode: 'create', editingRecord: null });
    };

    /**
     * Switch to edit mode
     */
    const startEdit = (id) => {
      console.log('[CRUD] startEdit called for id:', id);
      const record = state.records.find(r =>
        normalizeId(r[cfg.idField]) === normalizeId(id)
      );
      console.log('[CRUD] startEdit found record:', record);
      if (record) {
        setState({ mode: 'edit', editingRecord: record });
      }
    };

    /**
     * Cancel create/edit
     */
    const cancel = () => {
      setState({ mode: 'list', editingRecord: null, error: null });
    };

    /**
     * Set search query
     */
    const setSearchQuery = (query) => {
      setState({ searchQuery: query });
    };

    /**
     * Get filtered records based on search
     */
    const getFilteredRecords = () => {
      if (!cfg.searchable || !state.searchQuery) {
        return state.records;
      }

      const query = state.searchQuery.toLowerCase();
      return state.records.filter(record => {
        // Search in all text fields
        return cfg.fields.some(field => {
          const value = record[field.name];
          if (typeof value === 'string') {
            return value.toLowerCase().includes(query);
          }
          return false;
        });
      });
    };

    // Initialize: load records
    loadRecords();

    // Public API
    return {
      getState: () => state,
      subscribe,
      loadRecords,
      createRecord,
      updateRecord,
      deleteRecord,
      startCreate,
      startEdit,
      cancel,
      setSearchQuery,
      getFilteredRecords
    };
  };

  /**
   * Render CRUD UI
   * @param {Object} crud - CRUD instance
   * @param {Object} D - Mishkah DOM builder
   * @param {Function} tw - Tailwind class builder
   * @param {Object} app - Mishkah app instance (for re-rendering)
   * @returns {VNode} Virtual DOM node
   */
  const renderCRUD = (crud, D, tw, config, app) => {
    const state = crud.getState();
    const cfg = { ...DEFAULT_CONFIG, ...config };

    console.log('[CRUD] renderCRUD called with state:', {
      mode: state.mode,
      recordsCount: state.records?.length || 0,
      loading: state.loading,
      editingRecord: state.editingRecord
    });
    // ✅ Subscribe to state changes and trigger app re-render
    if (app && typeof app.setState === 'function' && !crud._mishkahSubscribed) {
      crud.subscribe(() => {
        // Trigger Mishkah app re-render
        app.setState(s => ({ ...s, _crudTrigger: Date.now() }));
      });
      crud._mishkahSubscribed = true;
    }

    // Translations
    const t = {
      ar: {
        create: 'إضافة جديد',
        edit: 'تعديل',
        delete: 'حذف',
        save: 'حفظ',
        cancel: 'إلغاء',
        search: 'بحث...',
        noRecords: 'لا توجد سجلات',
        loading: 'جاري التحميل...',
        required: 'مطلوب'
      },
      en: {
        create: 'Create New',
        edit: 'Edit',
        delete: 'Delete',
        save: 'Save',
        cancel: 'Cancel',
        search: 'Search...',
        noRecords: 'No records found',
        loading: 'Loading...',
        required: 'Required'
      }
    };

    const lang = cfg.lang === 'ar' ? t.ar : t.en;

    /**
     * Render field input
     */
    const renderField = (field, value = '') => {
      const fieldId = `field-${field.name}`;
      const label = cfg.lang === 'ar'
        ? (field.labelAr || field.label || field.name)
        : (field.labelEn || field.label || field.name);

      const required = field.required ? ' *' : '';

      // Base input classes
      const inputClass = tw`w-full px-3 py-2 rounded-lg border border-slate-700/60 bg-slate-900/70 text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/60`;

      let input;
      switch (field.type) {
        case FIELD_TYPES.TEXTAREA:
          input = D.Forms.Textarea({
            attrs: {
              id: fieldId,
              name: field.name,
              placeholder: field.placeholder || label,
              required: field.required,
              rows: field.rows || 3,
              class: inputClass
            }
          }, [value]);
          break;

        case FIELD_TYPES.SELECT:
          input = D.Forms.Select({
            attrs: {
              id: fieldId,
              name: field.name,
              required: field.required,
              class: inputClass
            }
          }, [
            ...(field.options || []).map(opt =>
              D.Option({
                attrs: {
                  value: opt.value,
                  selected: value === opt.value
                }
              }, [opt.label])
            )
          ]);
          break;

        case FIELD_TYPES.CHECKBOX:
          input = D.Inputs.Input({
            attrs: {
              type: 'checkbox',
              id: fieldId,
              name: field.name,
              checked: !!value,
              class: tw`w-4 h-4 rounded border-slate-700/60 bg-slate-900/70 text-sky-500 focus:ring-sky-400/60`
            }
          });
          break;

        default:
          input = D.Inputs.Input({
            attrs: {
              type: field.type || 'text',
              id: fieldId,
              name: field.name,
              value: value || '',
              placeholder: field.placeholder || label,
              required: field.required,
              class: inputClass
            }
          });
      }

      return D.Containers.Div({ attrs: { class: tw`flex flex-col gap-1` } }, [
        D.Forms.Label({
          attrs: {
            for: fieldId,
            class: tw`text-sm font-medium text-slate-200`
          }
        }, [label + required]),
        input
      ]);
    };

    /**
     * Render form (create or edit)
     */
    const renderForm = () => {
      const isEdit = state.mode === 'edit';
      const record = state.editingRecord || {};

      const handleSubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {};

        cfg.fields.forEach(field => {
          if (field.type === FIELD_TYPES.CHECKBOX) {
            data[field.name] = formData.get(field.name) === 'on';
          } else {
            data[field.name] = formData.get(field.name);
          }
        });

        if (isEdit) {
          crud.updateRecord(record[cfg.idField], data);
        } else {
          crud.createRecord(data);
        }
      };

      return D.Containers.Div({ attrs: { class: tw`flex flex-col gap-4` } }, [
        // Header
        D.Containers.Div({ attrs: { class: tw`flex items-center justify-between` } }, [
          D.Text.H2({ attrs: { class: tw`text-xl font-bold text-slate-100` } }, [
            isEdit ? lang.edit : lang.create
          ]),
          D.Forms.Button({
            attrs: {
              type: 'button',
              onclick: () => crud.cancel(),
              class: tw`px-3 py-1 text-sm text-slate-300 hover:text-slate-100`
            }
          }, ['✕'])
        ]),

        // Error message
        state.error ? D.Containers.Div({
          attrs: { class: tw`px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm` }
        }, [state.error]) : null,

        // Form
        D.Forms.Form({
          attrs: {
            onsubmit: handleSubmit,
            class: tw`flex flex-col gap-4`
          }
        }, [
          // Fields
          ...cfg.fields.map(field =>
            renderField(field, record[field.name])
          ),

          // Actions
          D.Containers.Div({ attrs: { class: tw`flex gap-2 justify-end mt-2` } }, [
            D.Forms.Button({
              attrs: {
                type: 'button',
                onclick: () => crud.cancel(),
                class: tw`px-4 py-2 rounded-lg border border-slate-700/60 bg-slate-800/70 text-slate-200 hover:bg-slate-700/70`
              }
            }, [lang.cancel]),
            D.Forms.Button({
              attrs: {
                type: 'submit',
                disabled: state.loading,
                class: tw`px-4 py-2 rounded-lg border border-emerald-600/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50`
              }
            }, [state.loading ? lang.loading : lang.save])
          ])
        ])
      ].filter(Boolean));
    };

    /**
     * Render list view
     */
    const renderList = () => {
      const records = crud.getFilteredRecords();

      // ✅ Table view using CSS Grid (Mishkah doesn't have D.Elements.Table)
      const renderTable = () => {
        if (records.length === 0) {
          return D.Containers.Div({
            attrs: { class: tw`py-12 text-center text-slate-400` }
          }, [lang.noRecords]);
        }

        // Get visible fields (exclude checkbox, show first 4 fields)
        const visibleFields = cfg.fields
          .filter(f => f.type !== FIELD_TYPES.CHECKBOX)
          .slice(0, 4);

        return D.Containers.Div({ attrs: { class: tw`overflow-x-auto border border-slate-700/60 rounded-lg` } }, [
          // Table header
          D.Containers.Div({
            attrs: {
              class: tw`grid gap-2 px-4 py-3 bg-slate-900/70 border-b border-slate-700/60 font-semibold text-xs uppercase text-slate-300`,
              style: `grid-template-columns: repeat(${visibleFields.length}, 1fr) 120px;`
            }
          }, [
            ...visibleFields.map(field => {
              const label = cfg.lang === 'ar'
                ? (field.labelAr || field.label || field.name)
                : (field.labelEn || field.label || field.name);
              return D.Text.Span({ attrs: { class: tw`text-start` } }, [label]);
            }),
            D.Text.Span({ attrs: { class: tw`text-center` } }, [lang.edit])
          ]),

          // Table body
          D.Containers.Div(null, records.map(record => {
            return D.Containers.Div({
              attrs: {
                class: tw`grid gap-2 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/30 text-sm`,
                style: `grid-template-columns: repeat(${visibleFields.length}, 1fr) 120px;`
              }
            }, [
              ...visibleFields.map(field => {
                const value = record[field.name];
                const displayValue = value || '-';
                return D.Text.Span({
                  attrs: { class: tw`text-slate-200 truncate` }
                }, [String(displayValue)]);
              }),
              D.Containers.Div({ attrs: { class: tw`flex gap-2 justify-center` } }, [
                D.Forms.Button({
                  attrs: {
                    type: 'button',
                    onclick: () => crud.startEdit(record[cfg.idField]),
                    class: tw`px-2 py-1 text-xs rounded border border-sky-600/60 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20`
                  }
                }, [lang.edit]),
                cfg.allowDelete ? D.Forms.Button({
                  attrs: {
                    type: 'button',
                    onclick: () => crud.deleteRecord(record[cfg.idField]),
                    class: tw`px-2 py-1 text-xs rounded border border-red-600/60 bg-red-500/10 text-red-100 hover:bg-red-500/20`
                  }
                }, [lang.delete]) : null
              ].filter(Boolean))
            ]);
          }))
        ]);
      };

      return D.Containers.Div({ attrs: { class: tw`flex flex-col gap-4` } }, [
        // Header with search and create button
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-3` } }, [
          // Search
          cfg.searchable ? D.Inputs.Input({
            attrs: {
              type: 'text',
              placeholder: lang.search,
              value: state.searchQuery,
              oninput: (e) => crud.setSearchQuery(e.target.value),
              class: tw`flex-1 px-3 py-2 rounded-lg border border-slate-700/60 bg-slate-900/70 text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400/60`
            }
          }) : null,

          // Create button
          cfg.allowCreate ? D.Forms.Button({
            attrs: {
              type: 'button',
              onclick: () => crud.startCreate(),
              class: tw`px-4 py-2 rounded-lg border border-emerald-600/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 flex items-center gap-2`
            }
          }, [
            D.Text.Span({ attrs: { class: tw`text-lg` } }, ['➕']),
            D.Text.Span(null, [lang.create])
          ]) : null
        ].filter(Boolean)),

        // Error message
        state.error ? D.Containers.Div({
          attrs: { class: tw`px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm` }
        }, [state.error]) : null,

        // ✅ Table view
        state.loading
          ? D.Text.P({ attrs: { class: tw`text-center text-slate-400 py-8` } }, [lang.loading])
          : renderTable()
      ].filter(Boolean));
    };

    // Main render
    return D.Containers.Div({
      attrs: {
        class: tw`w-full p-4`,
        dir: cfg.rtl ? 'rtl' : 'ltr'
      }
    }, [
      state.mode === 'list' ? renderList() : renderForm()
    ]);
  };

  // Export to window
  window.MishkahCRUD = {
    createCRUD,
    renderCRUD,
    FIELD_TYPES
  };

  console.log('[MishkahCRUD] Component loaded successfully');

})(window);
