(function (global) {
  'use strict';

  var OrdersFactory = {};

  OrdersFactory.create = function (deps) {
    var db = deps && deps.db;
    var onLangChange = deps && deps.onLangChange;
    var onThemeChange = deps && deps.onThemeChange;
    var VERTICAL_TABLES = (global.__clinicVerticalTables) || {};

    function findRecord(state, table, id) {
      if (!state || !state.data || !state.data.tables) return null;
      var list = state.data.tables[table] || [];
      for (var i = 0; i < list.length; i += 1) {
        if (list[i] && list[i].id === id) return list[i];
      }
      return null;
    }

    function toggleLang(ctx) {
      var nextLang;
      ctx.setState(function (prev) {
        var lang = prev.env.lang === 'ar' ? 'en' : 'ar';
        nextLang = lang;
        var next = Object.assign({}, prev, {
          env: Object.assign({}, prev.env, {
            lang: lang,
            dir: lang === 'ar' ? 'rtl' : 'ltr'
          })
        });
        return next;
      });
      if (typeof onLangChange === 'function') onLangChange(nextLang);
    }

    function toggleTheme(ctx) {
      var currentState = ctx.getState();
      var nextTheme;
      ctx.setState(function (prev) {
        nextTheme = prev.env.theme === 'dark' ? 'light' : 'dark';
        var next = Object.assign({}, prev, { env: Object.assign({}, prev.env, { theme: nextTheme }) });
        return next;
      });
      if (typeof onThemeChange === 'function') onThemeChange(nextTheme);
    }

    function nextVersion(state, table, id) {
      if (!state || !state.data || !state.data.tables || !state.data.tables[table]) return 1;
      var list = state.data.tables[table];
      for (var i = 0; i < list.length; i += 1) {
        if (!list[i]) continue;
        if ((id && list[i].id === id) || (!id && list[i].id)) {
          return (list[i].__ver || 0) + 1;
        }
      }
      return 1;
    }

    function resolveLangRecordId(baseId, lang, config) {
      if (!baseId) return null;
      if (config && typeof config.langIdBuilder === 'function') return config.langIdBuilder(baseId, lang);
      return baseId + '_' + lang;
    }

    function buildVerticalPayload(table, formData, state) {
      var baseTable = table.replace(/_lang$/, '');
      var config = VERTICAL_TABLES[baseTable];
      var basePayload = {};
      var translationsByLang = {};
      var langIds = {};

      formData.forEach(function (value, key) {
        if (value === '' || value == null) return;
        if (String(key).indexOf('langId:') === 0) {
          var lId = String(key).split(':')[1];
          langIds[lId] = value;
          return;
        }

        if (String(key).indexOf(':') > -1) {
          var parts = String(key).split(':');
          var fieldName = parts[0];
          var lng = parts[1];
          if (!translationsByLang[lng]) translationsByLang[lng] = {};
          translationsByLang[lng][fieldName] = value;
          return;
        }

        basePayload[key] = value;
      });

      var editing = (state && state.data && state.data.editingRecord) || null;
      if (editing && editing.id && !basePayload.id) basePayload.id = editing.id;

      return {
        baseTable: baseTable,
        langTable: (config && config.langTable) || (baseTable + '_lang'),
        basePayload: basePayload,
        translationsByLang: translationsByLang,
        langIds: langIds,
        config: config
      };
    }

    function upsertWithVersion(table, payload, state) {
      var record = Object.assign({}, payload || {});
      if (!record.id) {
        record.id = table + '_' + Math.random().toString(36).substr(2, 9);
      }
      record.__ver = nextVersion(state, table, record.id);
      return upsertRecord(table, record).then(function () { return record; });
    }

    function upsertVerticalRecord(table, payload, formData, state) {
      var parsed = buildVerticalPayload(table, formData, state);
      var basePayload = Object.assign({}, parsed.basePayload);

      return upsertWithVersion(parsed.baseTable, basePayload, state).then(function (savedBase) {
        var savedId = (savedBase && savedBase.id) || basePayload.id;
        if (!parsed.config || !parsed.translationsByLang || !savedId) return [];
        var tasks = [];
        var langs = Object.keys(parsed.translationsByLang);
        for (var i = 0; i < langs.length; i += 1) {
          var lng = langs[i];
          var langPayload = Object.assign({}, parsed.translationsByLang[lng], {
            lang: lng
          });
          langPayload[(parsed.config.fk || (parsed.baseTable + '_id'))] = savedId;
          langPayload.id = parsed.langIds[lng] || resolveLangRecordId(savedId, lng, parsed.config);
          tasks.push(upsertWithVersion(parsed.langTable, langPayload, state));
        }
        return Promise.all(tasks);
      });
    }

    function upsertRecord(table, payload) {
      if (!db) return Promise.resolve(payload);
      var record = Object.assign({}, payload || {});
      var tableRef = db.ref(table);
      if (record && record.id) {
        return tableRef.child(record.id).update(record).then(function () { return record; });
      }

      return tableRef.push(record).then(function (ref) {
        var newId = ref && ref.key ? ref.key : record.id;
        record.id = record.id || newId;
        if (record.id) {
          return tableRef.child(record.id).update(Object.assign({}, record, { id: record.id })).then(function () { return record; });
        }
        return record;
      });
    }

    return {
      'clinic:nav-item': {
        on: ['click'],
        keys: ['clinic:nav-item'],
        handler: function (event, ctx) {
          if (!event || !event.target) return;
          var target = event.target.closest('[data-view]');
          if (target) {
            var view = target.getAttribute('data-view');
            ctx.setState(function (prev) {
              return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: view }) });
            });
          }
        }
      },
      'clinic:cancel-form': {
        on: ['click'],
        keys: ['clinic:cancel-form'],
        handler: function (_event, ctx) {
          var view = ctx.getState().data.activeView;
          var fallback = view === 'booking-form' ? 'bookings' : (view === 'patient-form' ? 'patients' : 'dashboard');
          ctx.setState(function (prev) {
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: fallback, editingRecord: null }) });
          });
        }
      },
      'clinic:add-booking': {
        on: ['click'],
        keys: ['clinic:add-booking'],
        handler: function (_event, ctx) {
          ctx.setState(function (prev) {
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: 'booking-form', editingRecord: null }) });
          });
        }
      },
      'clinic:add-patient': {
        on: ['click'],
        keys: ['clinic:add-patient'],
        handler: function (_event, ctx) {
          ctx.setState(function (prev) {
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: 'patient-form', editingRecord: null }) });
          });
        }
      },
      'clinic:edit-booking': {
        on: ['click'],
        keys: ['clinic:edit-booking'],
        handler: function (event, ctx) {
          if (!event || !event.target) return;
          var target = event.target.closest('[data-record-id]');
          if (!target) return;
          var id = target.getAttribute('data-record-id');
          ctx.setState(function (prev) {
            var found = findRecord(prev, 'clinic_bookings', id);
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: 'booking-form', editingRecord: Object.assign({ id: id, table: 'clinic_bookings' }, found || {}) }) });
          });
        }
      },
      'clinic:booking-submit': {
        on: ['submit'],
        keys: ['clinic:booking-submit'],
        handler: function (event, ctx) {
          event.preventDefault();
          var form = event.target;
          var formData = new FormData(form);
          var patientId = formData.get('patient');
          var doctorId = formData.get('doctor');
          var serviceId = formData.get('service');
          var datetime = formData.get('datetime');

          if (!patientId || !doctorId || !serviceId || !datetime) return;

          var timestamp = new Date(datetime).getTime();
          var slotId = 'slot_' + Math.random().toString(36).substr(2, 9);
          var ticketId = 'ticket_' + Math.random().toString(36).substr(2, 9);
          var bookingId = 'bk_' + Math.random().toString(36).substr(2, 9);

          // 1. Create Slot
          // Note: Duration and station should be dynamic in future. Defaulting to 30 mins and generic station.
          var slot = {
            id: slotId,
            start_time: new Date(timestamp).toISOString(),
            end_time: new Date(timestamp + 30 * 60000).toISOString(),
            doctor_id: doctorId,
            status: 'reserved',
            station_id: 'station_001',
            created_at: new Date().toISOString()
          };

          // 2. Create Ticket (Contract is null for ad-hoc)
          var ticket = {
            id: ticketId,
            contract: null, // Nullable as per schema update
            patient_id: patientId,
            service_id: serviceId,
            company_id: 'comp_default',
            branch_id: 'pt',
            created_at: new Date().toISOString(),
            user_insert: 'user_current'
          };

          // 3. Create Booking
          var booking = {
            id: bookingId,
            slot_id: slotId,
            ticket_id: ticketId,
            patient_id: patientId,
            doctor_id: doctorId,
            service_id: serviceId,
            booked_at: new Date().toISOString(),
            booking_status: 'scheduled'
          };

          Promise.all([
            upsertRecord('clinic_slots_inventory', slot),
            upsertRecord('clinic_visit_tickets', ticket),
            upsertRecord('clinic_bookings', booking)
          ]).then(function () {
            ctx.setState(function (prev) {
              return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: 'bookings', editingRecord: null }) });
            });
          }).catch(function (err) {
            console.error('Booking creation failed', err);
          });
        }
      },
      'clinic:toggle-theme': {
        on: ['click'],
        keys: ['clinic:toggle-theme'],
        handler: function (_event, ctx) { toggleTheme(ctx); }
      },
      'clinic:toggle-lang': {
        on: ['click'],
        keys: ['clinic:toggle-lang'],
        handler: function (_event, ctx) { toggleLang(ctx); }
      },
      'clinic:select-table': {
        on: ['change'],
        keys: ['clinic:master-select'],
        handler: function (event, ctx) {
          var table = event && event.target ? event.target.value : '';
          ctx.setState(function (prev) {
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, { activeMasterTable: table, editingRecord: null })
            });
          });
        }
      },
      'clinic:edit-record': {
        on: ['click'],
        keys: ['clinic:edit-record'],
        handler: function (event, ctx) {
          if (!event || !event.target) return;
          var target = event.target.closest('[data-record-id][data-table]');
          if (!target) return;
          var id = target.getAttribute('data-record-id');
          var table = target.getAttribute('data-table');
          ctx.setState(function (prev) {
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, { editingRecord: Object.assign({ id: id, table: table }, findRecord(prev, table, id) || {}) })
            });
          });
        }
      },
      'clinic:delete-record': {
        on: ['click'],
        keys: ['clinic:delete-record'],
        handler: function (event, ctx) {
          if (!event || !event.target) return;
          var target = event.target.closest('[data-record-id][data-table]');
          if (!target || !db) return;
          var id = target.getAttribute('data-record-id');
          var table = target.getAttribute('data-table');
          db.ref(table + '/' + id).remove().catch(function (err) { console.warn('[Clinic UI] delete failed', err); });
        }
      },
      'clinic:crud:submit': {
        on: ['submit'],
        keys: ['clinic:crud-form', 'clinic:crud:submit'],
        handler: function (event, ctx) {
          event.preventDefault();
          var form = event.target;
          var table = form.getAttribute('data-table');
          var formData = new FormData(form);
          var state = ctx.getState();
          var baseTable = table.replace(/_lang$/, '');
          var isVertical = !!VERTICAL_TABLES[baseTable];

          var action = isVertical
            ? upsertVerticalRecord(baseTable, {}, formData, state)
            : upsertWithVersion(table, (function (fd) {
              var p = {};
              fd.forEach(function (value, key) { if (value !== '' && value != null) p[key] = value; });
              var editing = (state.data || {}).editingRecord;
              if (editing && editing.id && !p.id) p.id = editing.id;
              return p;
            })(formData), state);

          Promise.resolve(action).then(function () {
            ctx.setState(function (prev) {
              return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, { editingRecord: null })
              });
            });
            if (typeof form.reset === 'function') form.reset();
          }).catch(function (err) {
            console.warn('[Clinic UI] save failed', err);
          });
        }
      },
      'clinic:search-patient': {
        on: ['input'],
        keys: ['clinic:patient-search'],
        handler: function (event, ctx) {
          var term = event && event.target ? event.target.value : '';
          ctx.setState(function (prev) {
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, { patientSearch: term })
            });
          });
        }
      },
      'clinic:focus-patient': {
        on: ['click'],
        keys: ['clinic:patient-row'],
        handler: function (event, ctx) {
          if (!event || !event.target) return;
          var target = event.target.closest('[data-record-id]');
          if (!target) return;
          var id = target.getAttribute('data-record-id');
          var key = target.getAttribute('data-m-key');
          if (key === 'clinic:edit-patient') {
            // Handle switch to edit form for patient
            ctx.setState(function (prev) {
              return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: 'patient-form', editingRecord: Object.assign({ id: id, table: 'clinic_patients' }, findRecord(prev, 'clinic_patients', id) || {}) }) });
            });
            return;
          }

          if (!id) return;
          ctx.setState(function (prev) {
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activePatientId: id }) });
          });
        }
      },
      'clinic:edit-patient': {
        on: ['click'],
        keys: ['clinic:edit-patient'],
        handler: function (event, ctx) {
          if (!event || !event.target) return;
          var target = event.target.closest('[data-record-id]');
          if (!target) return;
          var id = target.getAttribute('data-record-id');
          ctx.setState(function (prev) {
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { activeView: 'patient-form', editingRecord: Object.assign({ id: id, table: 'clinic_patients' }, findRecord(prev, 'clinic_patients', id) || {}) }) });
          });
        }
      }
    };
  };

  global.ClinicOrders = OrdersFactory;
})(window);
