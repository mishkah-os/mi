(function (global) {
  'use strict';

  var M = global.Mishkah;
  var UC = global.UniversalComp;
  var UI = M.UI || {};
  if (!M || !M.DSL || !M.REST || !UC) {
    console.error('[Clinic Home] Missing Mishkah DSL/REST/UniversalComp.');
    return;
  }

  var D = M.DSL;

  function formatDate(value) {
    if (!value || typeof value !== 'string') return value || '';
    var parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return value;
    var date = new Date(parsed);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

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

  function buildRecentBookingRows(list) {
    return (list || []).map(function (row) {
      return Object.assign({}, row, {
        booked_at: formatDateTime(row.booked_at || row.begin_date)
      });
    });
  }

  function getTableLabel(appState, tableName) {
    var info = appState.data.schemaInfo || {};
    var map = info.tableMap || {};
    var def = map[tableName];
    if (!def) return tableName;
    var lang = appState.env.lang;
    var labels = def.labels || {};
    return labels[lang] || labels.ar || labels.en || def.label || def.name;
  }

  function buildSchemaColumns(appState, tableName) {
    var info = appState.data.schemaInfo || {};
    var map = info.tableMap || {};
    var def = map[tableName];
    if (!def) return [{ key: 'id', label: 'ID' }];

    var lang = appState.env.lang;
    var smartCols = (def.smart_features && def.smart_features.columns) || [];
    if (smartCols.length) {
      return smartCols
        .filter(function (c) { return c.is_table_show !== false; })
        .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); })
        .map(function (c) {
          var lbls = c.labels || {};
          var lbl = lbls[lang] || lbls.ar || lbls.en || c.name;
          return { key: c.name, label: lbl };
        });
    }

    var fields = def.fields || [];
    return fields.map(function (f) {
      var lbls = f.labels || {};
      return { key: f.name, label: lbls[lang] || f.label || f.name };
    });
  }

  // ========================================
  // Timeline Calendar Helpers
  // ========================================

  function generateTimeSlots(startHour, endHour) {
    var slots = [];
    for (var h = startHour; h <= endHour; h++) {
      slots.push({
        hour: h,
        label: (h % 12 || 12) + (h < 12 ? ' AM' : ' PM')
      });
    }
    return slots;
  }

  function getBookingColor(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'checked-in') return 'bg-green-500/20 border-green-500/30 text-green-600';
    if (s === 'booked' || s === 'confirmed') return 'bg-blue-500/20 border-blue-500/30 text-blue-600';
    if (s === 'pending') return 'bg-yellow-500/20 border-yellow-500/30 text-yellow-600';
    if (s === 'cancelled') return 'bg-red-500/20 border-red-500/30 text-red-600';
    return 'bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]';
  }

  function getDayLabel(dateStr, lang) {
    var date = new Date(dateStr);
    var dayNames = lang === 'ar'
      ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  }

  function renderTimelineCalendar(appState) {
    var state = appState.data.screens.home || {};
    var timeline = state.timeline || {};
    var lang = appState.env.lang;

    if (!timeline.show) return null;

    var days = timeline.days || [];
    var fromDate = timeline.fromDate || new Date().toISOString().slice(0, 10);
    var toDate = timeline.toDate;
    var isFullScreen = timeline.fullScreen || false;

    var containerClass = isFullScreen
      ? 'fixed inset-0 z-50 bg-[var(--background)] overflow-auto'
      : 'border rounded-lg bg-[var(--card)] shadow-sm border-[var(--border)]';

    var timeSlots = generateTimeSlots(8, 20); // 8 AM - 8 PM

    return D.Div({ attrs: { class: containerClass } }, [
      // Header
      D.Div({ attrs: { class: 'sticky top-0 bg-[var(--card)] border-b border-[var(--border)] z-10 p-4' } }, [
        D.Div({ attrs: { class: 'flex items-center justify-between mb-3' } }, [
          D.Div({ attrs: { class: 'text-xl font-bold flex items-center gap-2 text-[var(--foreground)]' } }, [
            D.Span({}, ['📅']),
            D.Span({}, [lang === 'ar' ? 'جدول المواعيد' : 'Bookings Timeline'])
          ]),
          D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
            UC.Button({
              key: 'home:timeline:toggle-fullscreen',
              icon: isFullScreen ? '⛘' : '⛶',
              variant: 'outline',
              size: 'sm',
              label: isFullScreen ? (lang === 'ar' ? 'خروج' : 'Exit') : (lang === 'ar' ? 'ملء الشاشة' : 'Full Screen')
            }),
            isFullScreen ? UC.Button({
              key: 'home:timeline:close',
              icon: '✕',
              variant: 'ghost',
              size: 'sm'
            }) : null
          ])
        ]),
        // Filters
        D.Div({ attrs: { class: 'flex flex-wrap gap-3' } }, [
          // Date From
          D.Div({ attrs: { class: 'form-control w-48' } }, [
            D.Label({ attrs: { class: 'label label-text text-xs' } }, [lang === 'ar' ? 'من تاريخ' : 'Date From']),
            D.Input({
              attrs: {
                type: 'date',
                class: 'input input-bordered input-sm',
                value: fromDate,
                gkey: 'home:timeline:filter',
                'data-field': 'fromDate'
              }
            })
          ]),
          // Date To
          D.Div({ attrs: { class: 'form-control w-48' } }, [
            D.Label({ attrs: { class: 'label label-text text-xs' } }, [lang === 'ar' ? 'إلى تاريخ' : 'Date To']),
            D.Input({
              attrs: {
                type: 'date',
                class: 'input input-bordered input-sm',
                value: toDate,
                gkey: 'home:timeline:filter',
                'data-field': 'toDate'
              }
            })
          ]),
          // Refresh Button
          UC.Button({
            key: 'home:timeline:refresh',
            icon: '🔄',
            variant: 'outline',
            size: 'sm',
            label: lang === 'ar' ? 'تحديث' : 'Refresh',
            attrs: { class: 'mt-5' }
          })
        ])
      ]),

      // Timeline Content - Grid per Day (VERTICAL REPETITION)
      timeline.loading ?
        D.Div({ attrs: { class: 'p-12 text-center text-gray-500' } }, [lang === 'ar' ? 'جاري التحميل...' : 'Loading...']) :
        !days.length ?
          D.Div({ attrs: { class: 'p-12 text-center text-gray-400' } }, [lang === 'ar' ? 'لا توجد حجوزات' : 'No bookings found']) :
          D.Div({ attrs: { class: 'p-4 space-y-8' } }, days.map(function (day) {
            var doctors = day.doctors || [];
            var dayLabel = getDayLabel(day.date, lang);

            return D.Div({ attrs: { class: 'border-2 rounded-lg p-4 bg-[var(--muted)]/10 border-[var(--border)]' } }, [
              // Day Header
              D.Div({ attrs: { class: 'text-xl font-bold mb-4 pb-3 border-b-4 border-blue-500 text-[var(--foreground)]' } }, [
                dayLabel + ' - ' + day.date
              ]),

              // Grid for this day (Doctors × Hours)
              !doctors.length ?
                D.Div({ attrs: { class: 'text-center py-8 text-gray-400' } }, [
                  lang === 'ar' ? 'لا يوجد أطباء' : 'No doctors'
                ]) :
                D.Div({ attrs: { class: 'overflow-auto' } }, [
                  D.Table({ attrs: { class: 'table table-compact w-full border-collapse' } }, [
                    // Header Row
                    D.Thead({}, [
                      D.Tr({ attrs: { class: 'bg-blue-500/10' } }, [
                        D.Th({ attrs: { class: 'sticky left-0 bg-blue-500/10 z-10 min-w-[150px] border border-[var(--border)] text-[var(--foreground)]' } }, [
                          lang === 'ar' ? 'الطبيب' : 'Doctor'
                        ]),
                        timeSlots.map(function (slot) {
                          return D.Th({ attrs: { class: 'text-center text-xs min-w-[120px] border border-[var(--border)] text-[var(--foreground)]' } }, [slot.label]);
                        })
                      ])
                    ]),
                    // Doctor Rows
                    D.Tbody({}, doctors.map(function (doctor) {
                      var bookings = doctor.bookings || [];
                      return D.Tr({ attrs: { class: 'border border-[var(--border)]' } }, [
                        D.Td({ attrs: { class: 'sticky left-0 bg-[var(--card)] font-semibold border border-[var(--border)]' } }, [
                          D.Div({ attrs: { class: 'flex items-center gap-2 text-[var(--foreground)]' } }, [
                            D.Div({ attrs: { class: 'w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-xs font-bold' } }, [
                              (doctor.name || 'D').charAt(0).toUpperCase()
                            ]),
                            D.Div({}, [doctor.name])
                          ])
                        ]),
                        timeSlots.map(function (slot) {
                          // Find slot definition for this hour
                          var cellSlot = (doctor.slots || []).find(function (s) {
                            return parseInt(s.startTime.split(':')[0], 10) === slot.hour;
                          });

                          // Find bookings in this hour
                          var hourBookings = bookings.filter(function (b) {
                            if (!b.startTime) return false;
                            var bookingHour = parseInt(b.startTime.split(':')[0], 10);
                            return bookingHour === slot.hour;
                          });

                          // Determine cell style based on slot status
                          // Determine cell style based on slot status
                          var cellClass = 'p-1 align-top border border-[var(--border)] min-h-[60px] relative transition-colors duration-200 ';
                          var statusIndicator = null;
                          var statusIndicator = null;

                          if (cellSlot) {
                            if (cellSlot.status === 'full') {
                              cellClass += 'bg-red-600/15 hover:bg-red-600/25';
                              statusIndicator = D.Div({ attrs: { class: 'text-[10px] text-red-700 dark:text-red-200 font-bold mb-1' } }, ['Full (' + cellSlot.capacity + ')']);
                            } else if (cellSlot.status === 'partial') {
                              cellClass += 'bg-amber-400/15 hover:bg-amber-400/25';
                              statusIndicator = D.Div({ attrs: { class: 'text-[10px] text-amber-800 dark:text-amber-200 font-bold mb-1' } }, [
                                (lang === 'ar' ? 'متبقي: ' : 'Left: ') + cellSlot.remaining
                              ]);
                            } else if (cellSlot.status === 'blocked') {
                              cellClass += 'bg-[var(--muted)] opacity-70 cursor-not-allowed';
                              statusIndicator = D.Div({ attrs: { class: 'text-[10px] text-[var(--muted-foreground)] font-bold text-center' } }, ['Blocked']);
                            } else {
                              cellClass += 'bg-emerald-400/10 hover:bg-emerald-400/20'; // Empty available slot
                            }
                          } else {
                            cellClass += 'hover:bg-[var(--muted)]/30'; // No slot defined
                          }

                          return D.Td({ attrs: { class: cellClass, gkey: 'home:timeline:slot-drop', 'data-slot-id': cellSlot ? cellSlot.id : '', 'data-slot-status': cellSlot ? cellSlot.status : '' } }, [
                            statusIndicator,
                            D.Div({ attrs: { class: 'flex flex-col gap-1' } }, hourBookings.map(function (booking) {
                              var colorClass = getBookingColor(booking.status);
                              return D.Div({
                                attrs: {
                                  class: 'px-2 py-1 rounded border text-xs cursor-pointer hover:shadow-md transition-shadow ' + colorClass,
                                  gkey: 'home:timeline:booking',
                                  'data-booking-id': booking.id,
                                  title: booking.patientName + ' - ' + booking.service,
                                  draggable: true
                                }
                              }, [
                                D.Div({ attrs: { class: 'font-semibold truncate' } }, [booking.startTime]),
                                D.Div({ attrs: { class: 'truncate text-[10px]' } }, [booking.patientName])
                              ]);
                            }))
                          ]);
                        })
                      ]);
                    }))
                  ])
                ])
            ]);
          }))
    ]);
  }

  function renderScreen(appState) {
    var state = appState.data.screens.home || {};
    var lang = appState.env.lang;

    var stats = state.stats || { invoices: 0, bookings: 0, users: 0 };
    var recentBookings = buildRecentBookingRows(state.recentBookings || []);

    var lblInvoices = getTableLabel(appState, 'clinic_invoices_header');
    var lblBookings = getTableLabel(appState, 'clinic_bookings');
    var lblUsers = getTableLabel(appState, 'users');

    var bookingColumns = buildSchemaColumns(appState, 'clinic_bookings');

    var timeline = state.timeline || { show: true };

    return D.Div({ attrs: { class: 'space-y-5' } }, [
      D.Div({ attrs: { class: 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between' } }, [
        D.Div({ attrs: { class: 'text-2xl font-bold' } }, [lang === 'ar' ? 'الرئيسية' : 'Home']),
        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
          D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'ملخص سريع للحركة التشغيلية' : 'Operational summary snapshot']),
          UC.Button({
            key: 'home:timeline:toggle',
            icon: '📅',
            variant: timeline.show ? 'primary' : 'outline',
            size: 'sm',
            label: lang === 'ar' ? (timeline.show ? 'إخفاء الجدول' : 'عرض الجدول') : (timeline.show ? 'Hide Calendar' : 'Show Calendar')
          })
        ])
      ]),
      UI && UI.StatCard ? D.Div({ attrs: { class: 'grid grid-cols-1 md:grid-cols-3 gap-3' } }, [
        UI.StatCard({ title: lblInvoices, value: String(stats.invoices || 0) }),
        UI.StatCard({ title: lblBookings, value: String(stats.bookings || 0) }),
        UI.StatCard({ title: lblUsers, value: String(stats.users || 0) })
      ]) : null,

      // Timeline Calendar
      timeline.show ? renderTimelineCalendar(appState) : null,

      D.Div({ attrs: { class: 'grid lg:grid-cols-5 gap-4' } }, [
        D.Div({ attrs: { class: 'lg:col-span-3 space-y-3' } }, [
          UI.Card ? UI.Card({
            title: lang === 'ar' ? 'آخر 10 ' + lblBookings : 'Latest 10 ' + lblBookings,
            content: UC.Table({ columns: bookingColumns, data: recentBookings })
          }) : UC.Table({ columns: bookingColumns, data: recentBookings })
        ]),
        D.Div({ attrs: { class: 'lg:col-span-2 space-y-3' } }, [
          UI.Card ? UI.Card({
            title: lang === 'ar' ? 'اتجاه ' + lblBookings + ' (8 أسابيع)' : lblBookings + ' Trend (8 Weeks)',
            content: D.Div({ attrs: { class: 'h-[180px]' } }, [renderChart(state.chartData)])
          }) : D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4' } }, [renderChart(state.chartData)])
        ])
      ])
    ]);
  }

  function buildWeekBuckets(count) {
    var weeks = [];
    for (var i = count - 1; i >= 0; i--) {
      var start = new Date();
      start.setDate(start.getDate() - i * 7);
      start.setHours(0, 0, 0, 0);
      weeks.push({
        label: formatDate(start.toISOString()),
        start: start,
        end: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
      });
    }
    return weeks;
  }

  function buildChartData(weeks, counts) {
    return {
      labels: weeks.map(function (w) { return w.label; }),
      datasets: [{
        data: counts,
        borderColor: 'var(--primary)',
        backgroundColor: 'rgba(59,130,246,0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 2
      }]
    };
  }

  function renderChart(chartData) {
    if (!chartData || !chartData.datasets || !chartData.datasets.length || !chartData.datasets[0].data) {
      return D.Div({ attrs: { class: 'flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm' } }, ['No data available']);
    }

    if (UI && typeof UI.Chart === 'function') {
      return UI.Chart({
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'var(--border)' } },
            x: { grid: { display: false } }
          }
        },
        attrs: { class: 'w-full h-full' }
      });
    }
    var max = Math.max.apply(null, chartData.datasets[0].data);
    if (!max) max = 1;
    return D.Div({ attrs: { class: 'flex items-end gap-2 h-full pb-2' } }, chartData.datasets[0].data.map(function (val) {
      var pct = (val / max) * 100;
      return D.Div({ attrs: { class: 'flex-1 bg-[var(--primary)] rounded-t', style: 'height:' + pct + '%' } });
    }));
  }

  // ========================================
  // Timeline Data Fetching
  // ========================================

  async function loadTimelineData(app) {
    var state = app.getState();
    var timeline = state.data.screens.home.timeline || {};
    var fromDate = timeline.fromDate || new Date().toISOString().slice(0, 10);
    var toDate = timeline.toDate;

    // Calculate toDate if not set (10 days from fromDate)
    if (!toDate) {
      var to = new Date(fromDate);
      to.setDate(to.getDate() + 10);
      toDate = to.toISOString().slice(0, 10);
    }

    app.setState(function (prev) {
      var home = prev.data.screens.home;
      var tl = Object.assign({}, home.timeline, { loading: true, toDate: toDate });
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            home: Object.assign({}, home, { timeline: tl })
          })
        })
      });
    });

    try {
      // Generate date range
      var current = new Date(fromDate);
      var end = new Date(toDate);
      var days = [];

      while (current <= end) {
        days.push(current.toISOString().slice(0, 10));
        current.setDate(current.getDate() + 1);
      }

      // Fetch bookings for each day
      var dayData = [];

      for (var i = 0; i < days.length; i++) {
        var date = days[i];
        var response = await fetch('/api/rpc/clinic-get-timeline-bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: date, doctorId: 'all' })
        });

        var json = await response.json();

        if (json.success) {
          dayData.push({
            date: date,
            doctors: json.doctors || []
          });
        }
      }

      app.setState(function (prev) {
        var home = prev.data.screens.home;
        var tl = Object.assign({}, home.timeline, {
          loading: false,
          days: dayData
        });
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              home: Object.assign({}, home, { timeline: tl })
            })
          })
        });
      });
    } catch (err) {
      console.error(err);
      app.setState(function (prev) {
        var home = prev.data.screens.home;
        var tl = Object.assign({}, home.timeline, { loading: false });
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              home: Object.assign({}, home, { timeline: tl })
            })
          })
        });
      });
    }
  }

  async function loadScreen(app) {
    var lang = app.getState().env.lang;
    var bookingsRepo = M.REST.repo('clinic_bookings');
    var invoicesRepo = M.REST.repo('clinic_invoices_header');
    var usersRepo = M.REST.repo('users');

    var today = new Date();
    var in10Days = new Date(today);
    in10Days.setDate(in10Days.getDate() + 10);

    app.setState(function (prev) {
      return Object.assign({}, prev, {
        data: Object.assign({}, prev.data, {
          screens: Object.assign({}, prev.data.screens, {
            home: Object.assign({}, prev.data.screens.home || {}, {
              loading: true,
              timeline: {
                show: false,
                loading: false,
                fromDate: today.toISOString().slice(0, 10),
                toDate: in10Days.toISOString().slice(0, 10),
                days: [],
                fullScreen: false
              }
            })
          })
        })
      });
    });

    try {
      var bookingsResult = await bookingsRepo.search({ lang: lang, q: '', page: 1, limit: 200 });
      var invoicesResult = await invoicesRepo.search({ lang: lang, q: '', page: 1, limit: 200 });
      var usersResult = await usersRepo.search({ lang: lang, q: '', page: 1, limit: 1 });

      var bookings = bookingsResult.data || bookingsResult || [];
      var invoices = invoicesResult.data || invoicesResult || [];
      var usersCount = usersResult.count || (usersResult.data ? usersResult.data.length : 0) || 0;

      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      var bookingsMonth = bookings.filter(function (row) {
        var date = Date.parse(row.booked_at || row.begin_date || '');
        return Number.isFinite(date) && date >= monthStart.getTime();
      });
      var invoicesMonth = invoices.filter(function (row) {
        var date = Date.parse(row.invoice_date || row.begin_date || '');
        return Number.isFinite(date) && date >= monthStart.getTime();
      });

      var recentBookings = bookings.slice().sort(function (a, b) {
        var aTime = Date.parse(a.booked_at || a.begin_date || '') || 0;
        var bTime = Date.parse(b.booked_at || b.begin_date || '') || 0;
        return bTime - aTime;
      }).slice(0, 10);

      var weeks = buildWeekBuckets(8);
      var weeklyCounts = weeks.map(function (week) {
        return bookings.filter(function (row) {
          var date = Date.parse(row.booked_at || row.begin_date || '');
          return Number.isFinite(date) && date >= week.start.getTime() && date <= week.end.getTime();
        }).length;
      });

      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              home: Object.assign({}, prev.data.screens.home, {
                loading: false,
                stats: {
                  invoices: invoicesMonth.length,
                  bookings: bookingsMonth.length,
                  users: usersCount
                },
                recentBookings: recentBookings,
                chartData: buildChartData(weeks, weeklyCounts)
              })
            })
          })
        });
      });
    } catch (error) {
      console.error('[Home] Load failed', error);
      app.setState(function (prev) {
        return Object.assign({}, prev, {
          data: Object.assign({}, prev.data, {
            screens: Object.assign({}, prev.data.screens, {
              home: Object.assign({}, prev.data.screens.home || {}, { loading: false, error: error.message })
            })
          })
        });
      });
    }
  }

  global.ClinicScreens = global.ClinicScreens || {};
  global.ClinicScreens.home = {
    load: loadScreen,
    render: renderScreen,
    orders: {
      'home:timeline:toggle': {
        on: ['click'],
        gkeys: ['home:timeline:toggle'],
        handler: async function (_ev, ctx) {
          ctx.setState(function (prev) {
            var home = prev.data.screens.home;
            var tl = Object.assign({}, home.timeline, { show: !home.timeline.show });
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  home: Object.assign({}, home, { timeline: tl })
                })
              })
            });
          });

          var state = ctx.getState();
          if (state.data.screens.home.timeline.show) {
            await loadTimelineData(ctx);
          }
        }
      },
      'home:timeline:filter': {
        on: ['change'],
        gkeys: ['home:timeline:filter'],
        handler: async function (ev, ctx) {
          var field = ev.target.getAttribute('data-field');
          var value = ev.target.value;

          ctx.setState(function (prev) {
            var home = prev.data.screens.home;
            var tl = Object.assign({}, home.timeline);
            tl[field] = value;
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  home: Object.assign({}, home, { timeline: tl })
                })
              })
            });
          });

          await loadTimelineData(ctx);
        }
      },
      'home:timeline:refresh': {
        on: ['click'],
        gkeys: ['home:timeline:refresh'],
        handler: async function (_ev, ctx) {
          await loadTimelineData(ctx);
        }
      },
      'home:timeline:toggle-fullscreen': {
        on: ['click'],
        gkeys: ['home:timeline:toggle-fullscreen'],
        handler: function (_ev, ctx) {
          ctx.setState(function (prev) {
            var home = prev.data.screens.home;
            var tl = Object.assign({}, home.timeline, { fullScreen: !home.timeline.fullScreen });
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  home: Object.assign({}, home, { timeline: tl })
                })
              })
            });
          });
        }
      },
      'home:timeline:close': {
        on: ['click'],
        gkeys: ['home:timeline:close'],
        handler: function (_ev, ctx) {
          ctx.setState(function (prev) {
            var home = prev.data.screens.home;
            var tl = Object.assign({}, home.timeline, { show: false, fullScreen: false });
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  home: Object.assign({}, home, { timeline: tl })
                })
              })
            });
          });
        }
      },
      'home:timeline:booking': {
        on: ['click', 'dragstart'],
        gkeys: ['home:timeline:booking'],
        handler: function (ev, ctx) {
          var bookingId = ev.target.closest('[data-booking-id]').getAttribute('data-booking-id');
          if (!bookingId) return;
          if (ev.type === 'dragstart') {
            if (ev.dataTransfer) {
              ev.dataTransfer.setData('text/plain', bookingId);
            }
            ctx.setState(function (prev) {
              var home = prev.data.screens.home || {};
              var tl = Object.assign({}, home.timeline || {}, { draggingBookingId: bookingId });
              return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                  screens: Object.assign({}, prev.data.screens, {
                    home: Object.assign({}, home, { timeline: tl })
                  })
                })
              });
            });
            return;
          }
          alert('Booking Details: ' + bookingId + '\n(Full modal coming soon)');
        }
      },
      'home:timeline:slot-drop': {
        on: ['dragover', 'drop'],
        gkeys: ['home:timeline:slot-drop'],
        handler: async function (ev, ctx) {
          if (ev.type === 'dragover') {
            ev.preventDefault();
            return;
          }
          ev.preventDefault();
          var slotId = ev.currentTarget && ev.currentTarget.getAttribute('data-slot-id');
          if (!slotId) return;
          var slotStatus = ev.currentTarget.getAttribute('data-slot-status');
          if (slotStatus === 'full' || slotStatus === 'blocked') {
            alert('Slot is not available');
            return;
          }
          var bookingId = null;
          if (ev.dataTransfer) {
            bookingId = ev.dataTransfer.getData('text/plain');
          }
          if (!bookingId) {
            var state = ctx.getState();
            bookingId = state.data.screens.home.timeline && state.data.screens.home.timeline.draggingBookingId;
          }
          if (!bookingId) return;
          try {
            var res = await fetch('/api/rpc/clinic-move-booking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: bookingId, targetSlotId: slotId, branchId: 'pt' })
            });
            var json = await res.json();
            if (!json.success) throw new Error(json.error || 'move-failed');
            await loadTimelineData(ctx);
          } catch (e) {
            console.error(e);
            alert('Move failed');
          }
        }
      }
    }
  };
})(window);
