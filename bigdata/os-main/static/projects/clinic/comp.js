(function (global) {
  'use strict';

  var M = global.Mishkah;
  if (!M || !M.DSL) {
    console.error('[Clinic UI] Mishkah DSL is required.');
    return;
  }

  var D = M.DSL;
  var UI = M.UI || {};

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  }

  // ============================================================================
  // STAT CARD - Professional with Sparkline
  // ============================================================================

  function statCardPro(config) {
    var label = config.label || '';
    var value = config.value || 0;
    var trend = config.trend;
    var trendLabel = config.trendLabel || '';
    var icon = config.icon || '📊';
    var sparklineData = config.sparklineData || [];

    var trendElement = null;
    if (trend != null) {
      var trendIcon = trend > 0 ? '↗' : (trend < 0 ? '↘' : '→');
      var trendColorVar = trend > 0 ? 'var(--success)' : (trend < 0 ? 'var(--error)' : 'var(--muted-fg)');
      var trendText = (trend > 0 ? '+' : '') + trend + '%';

      trendElement = D.Div({
        attrs: {
          class: 'flex items-center gap-1.5',
          style: 'color: ' + trendColorVar + ';'
        }
      }, [
        D.Span({ attrs: { class: 'text-lg font-bold' } }, [trendIcon]),
        D.Span({ attrs: { class: 'text-sm font-bold' } }, [trendText]),
        trendLabel ? D.Span({
          attrs: {
            class: 'text-xs',
            style: 'color: var(--muted-fg);'
          }
        }, [trendLabel]) : null
      ]);
    }

    // Mini sparkline chart if data provided
    var chartElement = null;
    if (sparklineData && sparklineData.length > 0 && UI.Chart) {
      var chartData = {
        labels: sparklineData.map(function () { return ''; }),
        datasets: [{
          data: sparklineData,
          borderColor: 'var(--primary)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      };

      var chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      };

      chartElement = D.Div({
        attrs: {
          class: 'mt-4',
          style: 'height: 60px;'
        }
      }, [
        UI.Chart.Line({
          data: chartData,
          options: chartOptions,
          height: 60
        })
      ]);
    }

    return D.Div({
      attrs: {
        class: 'group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:shadow-lg',
        style: 'background-color: var(--card); border-color: var(--border); box-shadow: var(--shadow);'
      }
    }, [
      // Content
      D.Div({ attrs: { class: 'relative z-10 space-y-4' } }, [
        // Header
        D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
          D.Div({ attrs: { class: 'flex items-center gap-3' } }, [
            D.Div({
              attrs: {
                class: 'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                style: 'background-color: var(--muted);'
              }
            }, [icon]),
            D.Span({
              attrs: {
                class: 'text-sm font-semibold uppercase tracking-wide',
                style: 'color: var(--muted-fg);'
              }
            }, [label])
          ]),
          trendElement
        ]),

        // Value
        D.Div({
          attrs: {
            class: 'text-4xl font-bold tracking-tight',
            style: 'color: var(--foreground);'
          }
        }, [formatNumber(value)]),

        // Sparkline
        chartElement
      ].filter(Boolean))
    ]);
  }

  // ============================================================================
  // METRIC GRID
  // ============================================================================

  function metricGrid(metrics) {
    if (!metrics || !metrics.length) return null;

    return D.Div({
      attrs: {
        class: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'
      }
    }, metrics.map(function (metric) {
      return statCardPro(metric);
    }));
  }

  // ============================================================================
  // ACTIVITY FEED
  // ============================================================================

  function activityFeed(config) {
    var title = config.title || 'Recent Activity';
    var activities = config.activities || [];
    var showAll = config.showAll;

    return D.Div({
      attrs: {
        class: 'rounded-2xl border p-6 space-y-6',
        style: 'background-color: var(--card); border-color: var(--border); box-shadow: var(--shadow);'
      }
    }, [
      // Header
      D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
        D.H3({
          attrs: {
            class: 'text-lg font-bold',
            style: 'color: var(--foreground);'
          }
        }, [title]),
        showAll ? D.Button({
          attrs: {
            'data-m-key': showAll.gkey,
            class: 'text-sm font-semibold hover:underline',
            style: 'color: var(--primary);'
          }
        }, ['View All →']) : null
      ]),

      // Activity list
      D.Div({ attrs: { class: 'space-y-4' } }, activities.map(function (activity, idx) {
        var isLast = idx === activities.length - 1;

        return D.Div({
          attrs: {
            class: 'relative flex gap-4 group',
            style: !isLast ? 'padding-bottom: 1rem; border-bottom: 1px solid var(--border);' : ''
          }
        }, [
          // Timeline dot
          D.Div({ attrs: { class: 'relative flex flex-col items-center' } }, [
            D.Div({
              attrs: {
                class: 'w-2 h-2 rounded-full group-hover:scale-150 transition-transform',
                style: 'background-color: ' + (activity.color || 'var(--primary)') + ';'
              }
            }, []),
            !isLast ? D.Div({
              attrs: {
                class: 'w-px flex-1 mt-2',
                style: 'background-color: var(--border);'
              }
            }, []) : null
          ]),

          // Content
          D.Div({ attrs: { class: 'flex-1 space-y-1' } }, [
            D.Div({
              attrs: {
                class: 'text-sm font-medium',
                style: 'color: var(--foreground);'
              }
            }, [activity.title]),
            activity.description ? D.Div({
              attrs: {
                class: 'text-sm',
                style: 'color: var(--muted-fg);'
              }
            }, [activity.description]) : null,
            activity.time ? D.Div({
              attrs: {
                class: 'text-xs',
                style: 'color: var(--muted-fg);'
              }
            }, [activity.time]) : null
          ])
        ]);
      }))
    ]);
  }

  // ============================================================================
  // DATA TABLE
  // ============================================================================

  function dataTable(config) {
    var headers = config.headers || [];
    var rows = config.rows || [];
    var title = config.title;
    var actions = config.actions || [];
    var emptyMessage = config.emptyMessage || 'No data available';

    return D.Div({
      attrs: {
        class: 'rounded-2xl border overflow-hidden',
        style: 'background-color: var(--card); border-color: var(--border); box-shadow: var(--shadow);'
      }
    }, [
      // Header
      title ? D.Div({
        attrs: {
          class: 'px-6 py-4 border-b flex items-center justify-between',
          style: 'border-color: var(--border); background-color: var(--muted);'
        }
      }, [
        D.H3({
          attrs: {
            class: 'text-lg font-bold',
            style: 'color: var(--foreground);'
          }
        }, [title]),
        actions.length ? D.Div({ attrs: { class: 'flex items-center gap-2' } }, actions) : null
      ]) : null,

      // Table
      rows.length === 0 ?
        D.Div({
          attrs: {
            class: 'px-6 py-12 text-center',
            style: 'color: var(--muted-fg);'
          }
        }, [
          D.Div({ attrs: { class: 'text-4xl mb-3' } }, ['📋']),
          D.Div({ attrs: { class: 'text-sm' } }, [emptyMessage])
        ]) :
        D.Div({ attrs: { class: 'overflow-x-auto' } }, [
          D.Table({ attrs: { class: 'w-full border-collapse' } }, [
            D.Thead({}, [
              D.Tr({}, headers.map(function (header) {
                return D.Th({
                  attrs: {
                    class: 'px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider',
                    style: 'background-color: var(--muted); color: var(--muted-fg); border-bottom: 1px solid var(--border);'
                  }
                }, [header.label || header]);
              }))
            ]),
            D.Tbody({}, rows.map(function (row, rowIdx) {
              return D.Tr({
                attrs: {
                  class: 'group transition-colors',
                  style: (rowIdx < rows.length - 1 ? 'border-bottom: 1px solid var(--border);' : '') + ' background-color: var(--card);'
                }
              }, row.cells.map(function (cell) {
                return D.Td({
                  attrs: {
                    class: 'px-6 py-4 text-sm',
                    style: 'color: var(--muted-fg);'
                  }
                }, [cell]);
              }));
            }))
          ])
        ])
    ].filter(Boolean));
  }

  // ============================================================================
  // CHART CARD
  // ============================================================================

  function chartCard(config) {
    var title = config.title || 'Chart';
    var description = config.description;
    var chartType = config.chartType || 'line';
    var chartData = config.chartData || { labels: [], datasets: [] };
    var chartOptions = config.chartOptions || {};
    var height = config.height || 300;
    var actions = config.actions || [];

    if (!UI.Chart) {
      return D.Div({
        attrs: {
          class: 'rounded-2xl border p-6',
          style: 'background-color: var(--card); border-color: var(--border);'
        }
      }, [
        D.Div({ attrs: { class: 'text-center py-12', style: 'color: var(--muted-fg);' } }, [
          'Chart library not loaded'
        ])
      ]);
    }

    return D.Div({
      attrs: {
        class: 'rounded-2xl border overflow-hidden',
        style: 'background-color: var(--card); border-color: var(--border); box-shadow: var(--shadow);'
      }
    }, [
      // Header
      D.Div({
        attrs: {
          class: 'px-6 py-4 border-b flex items-start justify-between',
          style: 'border-color: var(--border); background-color: var(--muted);'
        }
      }, [
        D.Div({ attrs: { class: 'space-y-1' } }, [
          D.H3({
            attrs: {
              class: 'text-lg font-bold',
              style: 'color: var(--foreground);'
            }
          }, [title]),
          description ? D.P({
            attrs: {
              class: 'text-sm',
              style: 'color: var(--muted-fg);'
            }
          }, [description]) : null
        ]),
        actions.length ? D.Div({ attrs: { class: 'flex items-center gap-2' } }, actions) : null
      ]),

      // Chart
      D.Div({
        attrs: {
          class: 'p-6',
          style: 'height: ' + height + 'px;'
        }
      }, [
        UI.Chart.Canvas({
          type: chartType,
          data: chartData,
          options: chartOptions,
          height: height - 48
        })
      ])
    ]);
  }

  // ============================================================================
  // PILL COMPONENT
  // ============================================================================

  function pill(text, tone) {
    var colors = {
      success: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--success)' },
      warn: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: 'var(--warning)' },
      danger: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--error)' },
      info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: 'var(--info)' },
      neutral: { bg: 'var(--muted)', border: 'var(--border)', text: 'var(--muted-fg)' }
    };

    var colorScheme = colors[tone] || colors.neutral;

    return D.Span({
      attrs: {
        class: 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm border',
        style: 'background-color: ' + colorScheme.bg + '; border-color: ' + colorScheme.border + '; color: ' + colorScheme.text + ';'
      }
    }, [text]);
  }

  // ============================================================================
  // SIMPLE LEGACY COMPONENTS
  // ============================================================================

  function headline(title, actions) {
    return D.Div({
      attrs: {
        class: 'flex flex-wrap items-center justify-between gap-4 pb-6',
        style: 'border-bottom: 2px solid var(--border);'
      }
    }, [
      D.Div({ attrs: { class: 'flex items-center gap-4' } }, [
        D.Div({
          attrs: {
            class: 'relative h-14 w-14 rounded-2xl text-white grid place-items-center text-2xl font-bold shadow-xl',
            style: 'background: linear-gradient(135deg, var(--primary), var(--primary-hover)); box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);'
          }
        }, ['🏥']),
        D.Div({ attrs: { class: 'space-y-1' } }, [
          D.H1({
            attrs: {
              class: 'text-3xl font-bold tracking-tight',
              style: 'color: var(--foreground);'
            }
          }, [title]),
          D.P({
            attrs: {
              class: 'text-sm',
              style: 'color: var(--muted-fg);'
            }
          }, ['Professional Clinic Management'])
        ])
      ]),
      D.Div({ attrs: { class: 'flex items-center gap-3' } }, actions || [])
    ]);
  }

  function statCard(label, value, hint) {
    return statCardPro({ label: label, value: value, trend: hint });
  }

  function segmented(title, content, actions) {
    return D.Section({
      attrs: {
        class: 'rounded-2xl border p-6 shadow-sm backdrop-blur-xl space-y-5',
        style: 'background-color: var(--card); border-color: var(--border);'
      }
    }, [
      D.Div({ attrs: { class: 'flex items-center justify-between gap-3 flex-wrap' } }, [
        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
          D.Div({
            attrs: {
              class: 'h-5 w-1.5 rounded-full',
              style: 'background-color: var(--primary);'
            }
          }, []),
          D.H2({
            attrs: {
              class: 'font-bold text-xl',
              style: 'color: var(--foreground);'
            }
          }, [title])
        ]),
        actions ? D.Div({ attrs: { class: 'flex items-center gap-2' } }, actions) : null
      ]),
      content
    ]);
  }

  function grid(columns, children) {
    return D.Div({
      attrs: { class: 'grid gap-6 md:grid-cols-' + columns + ' grid-cols-1' }
    }, children);
  }

  function table(headers, rows) {
    return dataTable({
      headers: headers.map(function (h) { return { label: h }; }),
      rows: rows.map(function (r) { return { cells: r }; })
    });
  }

  function toolbar(items) {
    return D.Div({
      attrs: {
        class: 'flex flex-wrap items-center gap-3 p-2 rounded-xl border',
        style: 'background-color: var(--muted); border-color: var(--border);'
      }
    }, items);
  }

  function surface(children) {
    return D.Div({
      attrs: {
        class: 'rounded-3xl border p-8 shadow-lg space-y-6 backdrop-blur-2xl',
        style: 'background: linear-gradient(to bottom right, var(--card), var(--muted)); border-color: var(--border); box-shadow: var(--shadow-lg);'
      }
    }, children);
  }

  function formField(label, inputNode, hint) {
    return D.Div({ attrs: { class: 'flex flex-col gap-2' } }, [
      D.Label({
        attrs: {
          class: 'text-sm font-semibold',
          style: 'color: var(--foreground);'
        }
      }, [label]),
      inputNode,
      hint ? D.Span({
        attrs: {
          class: 'text-xs',
          style: 'color: var(--muted-fg);'
        }
      }, [hint]) : null
    ]);
  }

  function timeline(items) {
    return D.Ul({ attrs: { class: 'space-y-0 relative' } }, [
      D.Div({
        attrs: {
          class: 'absolute top-2 bottom-2 left-[19px] w-px',
          style: 'background-color: var(--border);'
        }
      }, [])
    ].concat(items.map(function (item) {
      return D.Li({ attrs: { class: 'relative pl-10 py-3 group' } }, [
        D.Span({
          attrs: {
            class: 'absolute left-3 top-4 h-4 w-4 rounded-full border-2 group-hover:scale-110 transition-all z-10',
            style: 'border-color: var(--card); background-color: var(--primary);'
          }
        }, []),
        D.Div({ attrs: { class: 'flex flex-col gap-1' } }, [
          D.Span({
            attrs: {
              class: 'text-sm font-semibold',
              style: 'color: var(--foreground);'
            }
          }, [item.title || '...']),
          item.meta ? D.Span({
            attrs: {
              class: 'text-xs font-mono',
              style: 'color: var(--muted-fg);'
            }
          }, [item.meta]) : null,
          item.body ? D.Span({
            attrs: {
              class: 'text-xs',
              style: 'color: var(--muted-fg);'
            }
          }, [item.body]) : null
        ])
      ]);
    })));
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  global.ClinicComp = {
    // Premium Components
    statCardPro: statCardPro,
    metricGrid: metricGrid,
    activityFeed: activityFeed,
    dataTable: dataTable,
    chartCard: chartCard,

    // Basic Components
    pill: pill,
    headline: headline,
    statCard: statCard,
    segmented: segmented,
    grid: grid,
    table: table,
    toolbar: toolbar,
    surface: surface,
    formField: formField,
    timeline: timeline,

    // Utilities
    formatNumber: formatNumber
  };
})(window);
