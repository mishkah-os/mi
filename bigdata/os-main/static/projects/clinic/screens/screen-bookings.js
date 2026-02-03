(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M.UI || {};
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Clinic Bookings] Missing Mishkah DSL/REST/UniversalComp.');
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

  function resolveStatusColor(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'booked') return 'primary'; // Blue
    if (s === 'checked-in') return 'success'; // We don't have success in Badge, assuming primary or looking at UC implementation. 
    // UC.Badge only has 'primary' or default (muted). 
    // I might need to inject my own classes if I want Green.
    // UC.Badge implementation: var bg = color === 'primary' ? ... : ...;
    // It seems rigid. I'll use 'primary' for Booked, and maybe just use a customized Span for others if I want different colors.
    return 'primary';
  }

  function StatusBadge(status) {
    // Custom green badge for Checked-In
    var s = String(status || '').toLowerCase();
    var className = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ";

    if (s === 'checked-in') {
      className += "bg-green-100 text-green-800 border border-green-200";
    } else if (s === 'completed') {
      className += "bg-gray-100 text-gray-800 border border-gray-200";
    } else if (s === 'booked') {
      className += "bg-blue-100 text-blue-800 border border-blue-200";
    } else if (s === 'cancelled') {
      className += "bg-red-100 text-red-800 border border-red-200";
    } else {
      className += "bg-gray-100 text-gray-800";
    }

    return D.Span({ attrs: { class: className } }, [status || '—']);
  }

  function buildBookingColumns(lang) {
    return [
      { key: 'display_name', label: lang === 'ar' ? 'الحجز' : 'Booking' },
      {
        key: 'booking_status',
        label: lang === 'ar' ? 'الحالة' : 'Status',
        render: function (row) {
          return StatusBadge(row.booking_status);
        }
      },
      { key: 'booked_at', label: lang === 'ar' ? 'وقت الحجز' : 'Booked At' },
      { key: 'visit_ticket', label: lang === 'ar' ? 'الزيارة' : 'Visit' },
      { key: 'slot', label: lang === 'ar' ? 'الموعد' : 'Slot' },
      {
        key: 'actions',
        label: lang === 'ar' ? 'إجراءات' : 'Actions',
        render: function (row) {
          var s = String(row.booking_status || '').toLowerCase();
          var btns = [];

          if (s === 'booked') {
            btns.push(UC.Button({
              label: lang === 'ar' ? 'تسجيل وصول' : 'Check In',
              icon: '📥',
              size: 'sm',
              variant: 'primary',
              key: 'bookings:checkin',
              attrs: { 'data-record-id': row.id, class: 'bg-green-600 hover:bg-green-700 text-white' } // Override for Green button
            }));
          }

          if (s === 'checked-in') {
            btns.push(UC.Button({
              label: lang === 'ar' ? 'إنهاء' : 'Check Out',
              icon: '📤',
              size: 'sm',
              variant: 'outline',
              key: 'bookings:checkout',
              attrs: { 'data-record-id': row.id }
            }));
          }

          return D.Div({ attrs: { class: 'flex items-center gap-2' } }, btns);
        }
      }
    ];
  }

  function normalizeBookings(list) {
    return (list || []).map(function (row) {
      return Object.assign({}, row, {
        booked_at: formatDateTime(row.booked_at)
      });
    });
  }

  function renderCalendarModal(appState) {
    var state = appState.data.screens.bookings || {};
    var modal = state.calendarModal;
    var lang = appState.env.lang;

    if (!modal || !modal.open) return null;

    var doctors = appState.data.referenceData ? (appState.data.referenceData.clinic_doctors || []) : [];
    // If doctors not loaded, we might need to rely on what's available or show error
    // Assuming global referenceData is available.

    // Filters Bar
    var filters = D.Div({ attrs: { class: 'flex flex-wrap gap-4 p-4 bg-gray-50 border-b items-end' } }, [
      // Doctor Select
      D.Div({ attrs: { class: 'form-control w-64' } }, [
        D.Label({ attrs: { class: 'label' } }, [D.Span({ attrs: { class: 'label-text' } }, [lang === 'ar' ? 'الطبيب' : 'Doctor'])]),
        D.Select({
          attrs: { class: 'select select-bordered select-sm w-full', 'data-field': 'doctorId', gkey: 'bookings:cal:update' }
        }, [
          D.Option({ attrs: { value: '', disabled: true, selected: !modal.doctorId } }, [lang === 'ar' ? 'اختر الطبيب' : 'Select Doctor']),
          doctors.map(function (d) {
            return D.Option({ attrs: { value: d.id, selected: String(d.id) === String(modal.doctorId) } }, [d.name || d.nameEn || d.nameAr || 'Doc']);
          })
        ])
      ]),
      // Days Slider
      D.Div({ attrs: { class: 'form-control w-48' } }, [
        D.Label({ attrs: { class: 'label' } }, [
          D.Span({ attrs: { class: 'label-text' } }, [lang === 'ar' ? 'المدة (أيام): ' : 'Days Range: ']),
          D.Span({ attrs: { class: 'label-text-alt font-bold' } }, [String(modal.days || 10)])
        ]),
        D.Input({
          attrs: { type: 'range', min: '1', max: '30', step: '1', class: 'range range-xs range-primary', 'data-field': 'days', value: modal.days || 10, gkey: 'bookings:cal:update' }
        })
      ]),
      // Navigation
      D.Div({ attrs: { class: 'flex items-center gap-1 mb-1' } }, [
        UC.Button({ key: 'bookings:cal:navigate', attrs: { 'data-dir': '-1' }, icon: '⬅️', variant: 'outline', size: 'sm' }),
        D.Div({ attrs: { class: 'px-2 font-mono bg-white border rounded py-1 text-sm' } }, [modal.startDate]),
        UC.Button({ key: 'bookings:cal:navigate', attrs: { 'data-dir': '1' }, icon: '➡️', variant: 'outline', size: 'sm' }),
      ])
    ]);

    // Grid Renderer
    var content;
    if (modal.loading) {
      content = D.Div({ attrs: { class: 'p-12 text-center text-gray-500' } }, [lang === 'ar' ? 'جاري التحميل...' : 'Loading Calendar...']);
    } else if (!modal.doctorId) {
      content = D.Div({ attrs: { class: 'p-12 text-center text-gray-400' } }, [lang === 'ar' ? 'يرجى اختيار الطبيب لعرض الجدول' : 'Please select a doctor to view schedule']);
    } else {
      content = D.Div({ attrs: { class: 'p-4 overflow-auto', style: 'max-height: 70vh' } }, [
        D.Div({
          attrs: {
            class: 'grid gap-2',
            style: 'grid-template-columns: repeat(7, minmax(0, 1fr));' // Fixed 7 columns
          }
        }, (modal.grid || []).map(function (day) {
          var isWeekend = day.dayName === 'Friday'; // Example
          return D.Div({ attrs: { class: 'border rounded p-2 bg-gray-50 min-h-[150px] flex flex-col gap-2 ' + (isWeekend ? 'bg-gray-100' : '') } }, [
            D.Div({ attrs: { class: 'text-center font-bold border-b pb-1 mb-1 text-sm' } }, [
              D.Div({}, [day.dayName]),
              D.Div({ attrs: { class: 'text-xs text-gray-500' } }, [day.date])
            ]),
            D.Div({ attrs: { class: 'flex flex-col gap-1' } }, (day.slots || []).map(function (slot) {
              // Find booking info
              // We overlay bookings from 'modal.bookings' matching slotId
              var booking = (modal.bookings || []).find(function (b) { return b.slot === slot.slotId });
              var isBooked = booking || slot.status === 'booked';

              var className = "text-xs p-1 rounded border text-center truncate ";
              if (isBooked) className += "bg-red-100 border-red-200 text-red-800";
              else if (slot.status === 'blocked') className += "bg-gray-200 text-gray-400";
              else className += "bg-green-50 border-green-200 text-green-700 hover:bg-green-100";

              return D.Div({ attrs: { class: className, title: isBooked ? (booking ? booking.customerName : 'Booked') : 'Available' } }, [
                D.Div({ attrs: { class: 'font-mono font-bold' } }, [slot.time]),
                booking ? D.Div({ attrs: { class: 'text-[10px] whitespace-normal leading-tight' } }, [booking.customerName || 'Patient']) : null
              ]);
            }))
          ])
        }))
      ])
    }

    return UI.Modal({
      open: true,
      title: lang === 'ar' ? 'جدول المواعيد (للقراءة فقط)' : 'Booking Calendar (Read-Only)',
      size: 'full',
      closeGkey: 'bookings:cal:close',
      content: D.Div({ attrs: { class: 'flex flex-col h-full' } }, [
        filters,
        content
      ])
    });
  }

  async function fetchCalendarData(ctx) {
    var state = ctx.getState();
    var modal = state.data.screens.bookings.calendarModal;
    if (!modal.doctorId) return;

    try {
      // 1. Get Availability Grid
      var gridRes = await fetch('/api/rpc/clinic-get-booking-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: modal.doctorId,
          startDate: modal.startDate,
          daysCount: modal.days || 10,
          branchId: 'pt' // TODO: dynamic
        })
      });
      var gridJson = await gridRes.json();
      var days = gridJson.calendar || [];

      // 2. Fetch Actual Bookings to Overlay Patient Names
      // We need bookings for this doctor in this range
      var endDate = new Date(modal.startDate);
      endDate.setDate(endDate.getDate() + (modal.days || 10));

      // Using repo search - assume repo is clinic_bookings
      // We might need a custom RPC if repo search doesn't support date range easily or if we want better performance
      // But standard search usually supports standard fields. 
      // Let's assume we can filter client side if needed or use 'q'.
      // For now, let's fetch 'all' bookings for this doctor? No, too heavy.
      // Let's try to specific query if the store supports it.
      // Fallback: The grid RPC *should* ideally return booking info.
      // Since I can't easily change the RPC in this "frontend-only" step (tool limit), 
      // I'll try to use the repo directly if possible.
      var repo = M.REST.repo('clinic_bookings');
      // We assume we can get a list. 
      // NOTE: In a real app we'd add 'doctor_id' filter. 
      // Here we rely on fetching recent bookings.
      var bookingRes = await repo.search({ limit: 1000, lang: state.env.lang });
      var allBookings = bookingRes.data || bookingRes || [];

      // Filter client side (inefficient but works for prototype)
      var relevantBookings = allBookings.filter(function (b) {
        // Match doctor? The booking normally has 'doctor' or 'slot' that links to doctor.
        // We might need to dereference slot -> doctor.
        // If booking has date, we filter by date.
        return b.slot; // We just need to map slot-ids.
      });

      // Better: Map booking list (Patient Name) to Slot IDs
      var bookingMap = relevantBookings.map(function (b) {
        return {
          slot: typeof b.slot === 'object' ? b.slot.id : b.slot,
          customerName: b.patient ? (b.patient.name || b.patient.nameEn || b.patient.nameAr || b.patient.full_name) : (b.customer_name || 'Patient')
        };
      });

      // Update State
      ctx.setState(function (prev) {
        var sc = prev.data.screens.bookings;
        var m = Object.assign({}, sc.calendarModal, {
          loading: false,
          grid: days,
          bookings: bookingMap
        });
        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { bookings: Object.assign({}, sc, { calendarModal: m }) }) }) });
      });

    } catch (err) {
      console.error(err);
      // Error State
      ctx.setState(function (prev) {
        var sc = prev.data.screens.bookings;
        var m = Object.assign({}, sc.calendarModal, { loading: false, grid: [] });
        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { bookings: Object.assign({}, sc, { calendarModal: m }) }) }) });
      });
    }
  }

  function renderSummary(selected, lang) {
    if (!selected) {
      return D.Div({ attrs: { class: 'rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]' } }, [
        lang === 'ar' ? 'اختر حجزًا لعرض تفاصيله.' : 'Select a booking to view details.'
      ]);
    }

    return D.Div({ attrs: { class: 'space-y-3' } }, [
      D.Div({ attrs: { class: 'text-lg font-semibold' } }, [selected.display_name || '—']),
      D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
        D.Span({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'الحالة: ' : 'Status: ']),
        StatusBadge(selected.booking_status)
      ]),
      D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [
        (lang === 'ar' ? 'وقت الحجز: ' : 'Booked at: ') + (formatDateTime(selected.booked_at) || '—')
      ])
    ]);
  }

  function renderScreen(appState) {
    var state = appState.data.screens.bookings || {};
    var lang = appState.env.lang;
    var columns = buildBookingColumns(lang);
    var rows = normalizeBookings(state.list || []);
    var totalCount = state.total || rows.length;
    var checkedInCount = rows.filter(function (r) { return String(r.booking_status || '').toLowerCase() === 'checked-in'; }).length;
    var bookedCount = rows.filter(function (r) { return String(r.booking_status || '').toLowerCase() === 'booked'; }).length;

    return D.Div({ attrs: { class: 'space-y-5' } },

      [
        D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
          D.Div({ attrs: { class: 'text-2xl font-bold' } }, [lang === 'ar' ? 'الحجوزات' : 'Bookings']),
          D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, [
            UI.SearchBar ? UI.SearchBar({
              value: state.search || '',
              placeholder: lang === 'ar' ? 'اسم العميل أو الموعد' : 'Patient or slot',
              attrs: { class: 'w-full md:w-[260px]' },
              onInput: 'bookings:update-search'
            }) : UC.FormInput({
              name: 'bookings-search',
              value: state.search || '',
              key: 'bookings:update-search',
              label: lang === 'ar' ? 'بحث' : 'Search',
              placeholder: lang === 'ar' ? 'اسم العميل أو الموعد' : 'Patient or slot'
            }),
            UI.Button ? UI.Button({ attrs: { gkey: 'bookings:refresh' }, variant: 'ghost', size: 'sm' }, [D.Span({}, ['🔄']), D.Span({}, [lang === 'ar' ? 'تحديث' : 'Refresh'])]) :
              UC.Button({ key: 'bookings:refresh', label: lang === 'ar' ? 'تحديث' : 'Refresh', icon: '🔄', variant: 'outline', size: 'sm' }),
            // Calendar Toggle
            UC.Button({
              key: 'bookings:open-calendar',
              label: lang === 'ar' ? 'عرض التقويم' : 'Calendar View',
              icon: '📅',
              variant: 'primary',
              size: 'sm'
            })
          ])
        ]),
        UI && UI.StatCard ? D.Div({ attrs: { class: 'grid grid-cols-1 md:grid-cols-3 gap-3' } }, [
          UI.StatCard({ title: lang === 'ar' ? 'إجمالي الحجوزات' : 'Total Bookings', value: String(totalCount) }),
          UI.StatCard({ title: lang === 'ar' ? 'تم الوصول' : 'Checked-In', value: String(checkedInCount) }),
          UI.StatCard({ title: lang === 'ar' ? 'قيد الانتظار' : 'Pending', value: String(bookedCount) })
        ]) : null,
        D.Div({ attrs: { class: 'grid lg:grid-cols-5 gap-4' } }, [
          D.Div({ attrs: { class: 'lg:col-span-3 space-y-3' } }, [
            UI.Card ? UI.Card({
              title: lang === 'ar' ? 'قائمة الحجوزات' : 'Bookings List',
              content: UC.Table({ columns: columns, data: rows, activeId: state.selectedId, rowKey: 'bookings:select', lang: lang })
            }) : UC.Table({ columns: columns, data: rows, activeId: state.selectedId, rowKey: 'bookings:select', lang: lang })
          ]),
          D.Div({ attrs: { class: 'lg:col-span-2 space-y-4' } }, [
            UI.Card ? UI.Card({ title: lang === 'ar' ? 'تفاصيل الحجز' : 'Booking Details', content: renderSummary(state.selected, lang) }) : renderSummary(state.selected, lang),
            UI.Card ? UI.Card({
              title: lang === 'ar' ? 'لوحة الزمن' : 'Timeline',
              content: D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [
                lang === 'ar'
                  ? 'قريبا: لوحة خط الزمن للمواعيد وإعادة الجدولة.'
                  : 'Coming soon: timeline and reschedule actions.'
              ])
            }) : D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-foreground)]' } }, [
              lang === 'ar'
                ? 'قريبا: لوحة خط الزمن للمواعيد وإعادة الجدولة.'
                : 'Coming soon: timeline and reschedule actions.'
            ])
          ])
        ])
        , renderCalendarModal(appState)
      ]);


  }

  async function loadScreen(app) {
    var state = app.getState();
    var screenState = state.data.screens.bookings || {};
    var lang = state.env.lang;

    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            bookings: Object.assign({}, screenState, { loading: true })
          })
        })
      });
    });

    try {
      var repo = M.REST.repo('clinic_bookings');
      var result = await repo.search({
        lang: lang,
        q: screenState.search || '',
        page: screenState.page || 1,
        limit: screenState.limit || 20
      });
      var list = result.data || result || [];
      var selected = list[0] || null;
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              bookings: Object.assign({}, screenState, {
                loading: false,
                list: list,
                total: result.count || list.length,
                selected: selected,
                selectedId: selected ? (selected.id || selected.Id || selected.uuid) : null
              })
            })
          })
        });
      });
    } catch (error) {
      console.error('[Bookings] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              bookings: Object.assign({}, screenState, { loading: false, error: error.message })
            })
          })
        });
      });
    }
  }

  async function updateStatus(ctx, id, newStatus) {
    if (!id) return;
    try {
      var repo = M.REST.repo('clinic_bookings');
      await repo.save({ id: id, booking_status: newStatus });
      // Refresh
      loadScreen(ctx);
    } catch (e) {
      console.error('[Bookings] Status update failed', e);
    }
  }

  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.bookings = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'bookings:refresh': {
        on: ['click'],
        gkeys: ['bookings:refresh'],
        handler: function (_ev, ctx) {
          loadScreen(ctx);
        }
      },
      'bookings:update-search': {
        on: ['input', 'change'],
        gkeys: ['bookings:update-search'],
        handler: function (ev, ctx) {
          var value = ev && ev.target ? ev.target.value : '';
          ctx.setState(function (prev) {
            var current = prev.data.screens.bookings || {};
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  bookings: Object.assign({}, current, { search: value })
                })
              })
            });
          });
        }
      },
      'bookings:select': {
        on: ['click'],
        gkeys: ['bookings:select'],
        handler: function (ev, ctx) {
          var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
          var holder = target && target.closest ? target.closest('[data-record-id]') : null;
          // Ignore if clicked on a button
          if (target && target.closest && target.closest('button')) return;

          var id = (holder && holder.getAttribute('data-record-id')) || (target && target.getAttribute ? target.getAttribute('data-record-id') : null);
          if (!id) return;
          ctx.setState(function (prev) {
            var current = prev.data.screens.bookings || {};
            var list = current.list || [];
            var selected = list.find(function (row) { return String(row.id || row.Id || row.uuid) === String(id); }) || null;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  bookings: Object.assign({}, current, { selected: selected, selectedId: id })
                })
              })
            });
          });
        }
      },
      'bookings:checkin': {
        on: ['click'],
        gkeys: ['bookings:checkin'],
        handler: function (ev, ctx) {
          var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
          var id = target ? target.getAttribute('data-record-id') : null;
          updateStatus(ctx, id, 'Checked-In');
          ev.stopPropagation(); // specific check
        }
      },
      'bookings:checkout': {
        on: ['click'],
        gkeys: ['bookings:checkout'],
        handler: function (ev, ctx) {
          var target = ev && (ev.target || ev.currentTarget) ? (ev.target || ev.currentTarget) : null;
          var id = target ? target.getAttribute('data-record-id') : null;
          updateStatus(ctx, id, 'Completed');
          ev.stopPropagation();
        }
      },
      'bookings:open-calendar': {
        on: ['click'],
        gkeys: ['bookings:open-calendar'],
        handler: function (ev, ctx) {
          ctx.setState(function (prev) {
            var screen = prev.data.screens.bookings || {};
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  bookings: Object.assign({}, screen, {
                    calendarModal: {
                      open: true,
                      loading: false,
                      days: 10,
                      startDate: new Date().toISOString().slice(0, 10),
                      doctorId: null,
                      stationId: null,
                      grid: [],
                      bookings: []
                    }
                  })
                })
              })
            });
          });
        }
      },
      'bookings:cal:close': {
        on: ['click'],
        gkeys: ['bookings:cal:close'],
        handler: function (_ev, ctx) {
          ctx.setState(function (prev) {
            var screen = prev.data.screens.bookings || {};
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  bookings: Object.assign({}, screen, {
                    calendarModal: Object.assign({}, screen.calendarModal || {}, { open: false })
                  })
                })
              })
            });
          });
        }
      },
      'bookings:cal:update': {
        on: ['change', 'input'],
        gkeys: ['bookings:cal:update'],
        handler: function (ev, ctx) {
          var field = ev.target.getAttribute('data-field');
          var value = ev.target.value;

          // If days slider
          if (field === 'days') value = Number(value);

          ctx.setState(function (prev) {
            var screen = prev.data.screens.bookings || {};
            var modal = Object.assign({}, screen.calendarModal || {});

            modal[field] = value;

            // Auto refresh if vital fields change
            var shouldRefresh = (field === 'doctorId' || field === 'days' || field === 'stationId' || field === 'startDate');
            if (shouldRefresh) modal.loading = true;

            // Optimistic update
            var nextScreen = Object.assign({}, screen, { calendarModal: modal });

            // Defer fetch
            if (shouldRefresh && modal.doctorId) {
              setTimeout(function () {
                fetchCalendarData(ctx);
              }, 100);
            }

            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, { bookings: nextScreen })
              })
            });
          });
        }
      },
      'bookings:cal:navigate': {
        on: ['click'],
        gkeys: ['bookings:cal:navigate'],
        handler: function (ev, ctx) {
          var dir = Number(ev.target.getAttribute('data-dir') || 0);
          if (!dir) return;

          ctx.setState(function (prev) {
            var screen = prev.data.screens.bookings || {};
            var modal = Object.assign({}, screen.calendarModal || {});
            var current = new Date(modal.startDate);
            current.setDate(current.getDate() + (dir * 7)); // Jump week
            modal.startDate = current.toISOString().slice(0, 10);
            modal.loading = true;

            setTimeout(function () { fetchCalendarData(ctx); }, 50);

            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, { bookings: Object.assign({}, screen, { calendarModal: modal }) })
              })
            });
          });
        }
      }
    }
  };
})(window);
