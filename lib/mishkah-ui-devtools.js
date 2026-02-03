/*!
 * Mishkah UI DevTools - Developer Components
 * Interactive components for building developer tools and demos
 * 2025-11-29
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], function () { return factory(root, root.Mishkah); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, root.Mishkah);
    } else {
        root.Mishkah = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, existing) {
    'use strict';

    var M = existing || (global.Mishkah = {});
    if (!M.UI) M.UI = {};

    var h = M.h || function () { console.warn('[DevTools] M.h not available'); return null; };

    // ============================================================
    // Helper Functions
    // ============================================================

    function escapeHtml(text) {
        var div = global.document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function syntaxHighlight(code, lang) {
        lang = lang || 'javascript';
        // اساسي syntax highlighting
        var escaped = escapeHtml(code);

        // Keywords
        var keywords = ['function', 'var', 'const', 'let', 'if', 'else', 'for', 'while', 'return', 'class', 'new', 'this', 'true', 'false', 'null', 'undefined'];
        keywords.forEach(function (kw) {
            escaped = escaped.replace(new RegExp('\\b(' + kw + ')\\b', 'g'), '<span class="keyword">$1</span>');
        });

        // Strings
        escaped = escaped.replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="string">$1</span>');

        // Numbers  
        escaped = escaped.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');

        // Comments
        escaped = escaped.replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>');

        return escaped;
    }

    function formatJSON(obj, indent) {
        indent = indent || 2;
        try {
            return JSON.stringify(obj, null, indent);
        } catch (e) {
            return String(obj);
        }
    }

    // ============================================================
    // Components
    // ============================================================

    /**
     * CodeBlock - عرض كود مع syntax highlighting
     * Props: { code, lang, title, copyable }
     */
    function CodeBlock(props, children) {
        props = props || {};
        var code = props.code || (children && children.length ? children[0] : '');
        var lang = props.lang || 'javascript';
        var title = props.title || null;
        var copyable = props.copyable !== false;

        var highlighted = syntaxHighlight(code, lang);

        return h('div', {
            class: 'devtools-code-block',
            style: 'background: var(--surface-1, #1e1e1e); border-radius: 8px; overflow: hidden; margin: 1rem 0;'
        }, [
            title ? h('div', {
                class: 'code-header',
                style: 'padding: 0.5rem 1rem; background: var(--surface-2, #2d2d2d); border-bottom: 1px solid var(--border, #444); display: flex; justify-content: space-between; align-items: center;'
            }, [
                h('span', { style: 'font-size: 0.875rem; color: var(--muted-foreground, #888);' }, title),
                copyable ? h('button', {
                    class: 'copy-btn',
                    style: 'padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--primary, #667eea); color: white; border: none; border-radius: 4px; cursor: pointer;',
                    onclick: function () {
                        if (global.navigator && global.navigator.clipboard) {
                            global.navigator.clipboard.writeText(code);
                        }
                    }
                }, 'Copy') : null
            ]) : null,
            h('pre', {
                class: 'code-content',
                style: 'margin: 0; padding: 1rem; overflow-x: auto; font-family: "Courier New", monospace; font-size: 0.875rem; line-height: 1.5;'
            }, [
                h('code', {
                    class: 'language-' + lang,
                    innerHTML: highlighted
                })
            ])
        ]);
    }

    /**
     * StateInspector - فحص وعرض الـ state
     * Props: { state, path, expanded }
     */
    function StateInspector(props) {
        props = props || {};
        var state = props.state || {};
        var path = props.path || 'state';
        var expanded = props.expanded !== false;

        var json = formatJSON(state, 2);

        return h('div', {
            class: 'devtools-state-inspector',
            style: 'background: var(--card, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 8px; padding: 1rem; margin: 1rem 0;'
        }, [
            h('div', {
                class: 'inspector-header',
                style: 'margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border, #444);'
            }, [
                h('h3', {
                    style: 'margin: 0; font-size: 1rem; color: var(--primary, #667eea);'
                }, '🔍 State Inspector: ' + path)
            ]),
            h('div', {
                class: 'inspector-content',
                style: 'background: var(--surface-1, #1e1e1e); padding: 0.75rem; border-radius: 4px; overflow-x: auto;'
            }, [
                h('pre', {
                    style: 'margin: 0; font-family: "Courier New", monospace; font-size: 0.875rem; color: var(--foreground, #e0e0e0);'
                }, json)
            ])
        ]);
    }

    /**
     * MetricsPanel - لوحة إحصائيات
     * Props: { metrics }
     * metrics: { label, value, unit, color }[]
     */
    function MetricsPanel(props) {
        props = props || {};
        var metrics = props.metrics || [];

        return h('div', {
            class: 'devtools-metrics-panel',
            style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;'
        }, metrics.map(function (metric) {
            return h('div', {
                class: 'metric-card',
                style: 'background: var(--card, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 8px; padding: 1rem; text-align: center;'
            }, [
                h('div', {
                    class: 'metric-label',
                    style: 'font-size: 0.875rem; color: var(--muted-foreground, #888); margin-bottom: 0.5rem;'
                }, metric.label),
                h('div', {
                    class: 'metric-value',
                    style: 'font-size: 2rem; font-weight: bold; color: ' + (metric.color || 'var(--primary, #667eea)') + ';'
                }, metric.value + (metric.unit || ''))
            ]);
        }));
    }

    /**
     * EventTimeline - عرض الأحداث في timeline
     * Props: { events, maxItems }
     * events: { time, type, message, data }[]
     */
    function EventTimeline(props) {
        props = props || {};
        var events = props.events || [];
        var maxItems = props.maxItems || 20;

        var displayEvents = events.slice(-maxItems);

        return h('div', {
            class: 'devtools-event-timeline',
            style: 'background: var(--card, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 8px; padding: 1rem; margin: 1rem 0;'
        }, [
            h('div', {
                class: 'timeline-header',
                style: 'margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border, #444);'
            }, [
                h('h3', {
                    style: 'margin: 0; font-size: 1rem; color: var(--primary, #667eea);'
                }, '⏱️ Event Timeline')
            ]),
            h('div', {
                class: 'timeline-content',
                style: 'max-height: 400px; overflow-y: auto;'
            }, displayEvents.length === 0
                ? h('p', { style: 'color: var(--muted-foreground, #888); text-align: center; padding: 2rem;' }, 'لا توجد أحداث بعد')
                : displayEvents.map(function (event) {
                    return h('div', {
                        class: 'timeline-event',
                        style: 'padding: 0.75rem; margin-bottom: 0.5rem; background: var(--surface-1, #1e1e1e); border-left: 3px solid var(--primary, #667eea); border-radius: 4px;'
                    }, [
                        h('div', {
                            class: 'event-header',
                            style: 'display: flex; justify-content: space-between; margin-bottom: 0.25rem;'
                        }, [
                            h('span', {
                                class: 'event-type',
                                style: 'font-weight: bold; color: var(--primary, #667eea);'
                            }, event.type),
                            h('span', {
                                class: 'event-time',
                                style: 'font-size: 0.75rem; color: var(--muted-foreground, #888);'
                            }, event.time)
                        ]),
                        h('div', {
                            class: 'event-message',
                            style: 'font-size: 0.875rem; color: var(--foreground, #e0e0e0);'
                        }, event.message),
                        event.data ? h('details', {
                            style: 'margin-top: 0.5rem;'
                        }, [
                            h('summary', {
                                style: 'font-size: 0.75rem; color: var(--muted-foreground, #888); cursor: pointer;'
                            }, 'Data'),
                            h('pre', {
                                style: 'margin-top: 0.5rem; padding: 0.5rem; background: var(--surface-2, #2d2d2d); border-radius: 4px; font-size: 0.75rem; overflow-x: auto;'
                            }, formatJSON(event.data, 2))
                        ]) : null
                    ]);
                })
            )
        ]);
    }

    /**
     * LiveExample - container لأمثلة قابلة للتحرير والتشغيل
     * Props: { title, code, preview, editable }
     */
    function LiveExample(props, children) {
        props = props || {};
        var title = props.title || 'Live Example';
        var code = props.code || '';
        var editable = props.editable !== false;

        return h('div', {
            class: 'devtools-live-example',
            style: 'background: var(--card, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 8px; overflow: hidden; margin: 1rem 0;'
        }, [
            h('div', {
                class: 'example-header',
                style: 'padding: 1rem; background: var(--surface-2, #2d2d2d); border-bottom: 1px solid var(--border, #444);'
            }, [
                h('h3', {
                    style: 'margin: 0; font-size: 1.125rem; color: var(--primary, #667eea);'
                }, '🎨 ' + title)
            ]),
            h('div', {
                class: 'example-preview',
                style: 'padding: 1.5rem; background: var(--surface-1, #1e1e1e);'
            }, children),
            code ? CodeBlock({ code: code, lang: 'html', title: 'Source Code', copyable: true }) : null
        ]);
    }

    /**
     * TabPanel - تبويبات
     * Props: { tabs, activeTab }
     * tabs: { id, label, content }[]
     */
    function TabPanel(props) {
        props = props || {};
        var tabs = props.tabs || [];
        var activeTab = props.activeTab || (tabs.length > 0 ? tabs[0].id : null);

        var activeContent = tabs.find(function (t) { return t.id === activeTab; });

        return h('div', {
            class: 'devtools-tab-panel',
            style: 'background: var(--card, #2a2a2a); border: 1px solid var(--border, #444); border-radius: 8px; overflow: hidden; margin: 1rem 0;'
        }, [
            h('div', {
                class: 'tab-headers',
                style: 'display: flex; background: var(--surface-2, #2d2d2d); border-bottom: 1px solid var(--border, #444);'
            }, tabs.map(function (tab) {
                var isActive = tab.id === activeTab;
                return h('button', {
                    class: 'tab-header' + (isActive ? ' active' : ''),
                    style: 'padding: 0.75rem 1.5rem; border: none; background: ' + (isActive ? 'var(--primary, #667eea)' : 'transparent') + '; color: ' + (isActive ? 'white' : 'var(--muted-foreground, #888)') + '; cursor: pointer; transition: all 0.2s;',
                    'data-tab-id': tab.id
                }, tab.label);
            })),
            h('div', {
                class: 'tab-content',
                style: 'padding: 1.5rem;'
            }, activeContent ? activeContent.content : null)
        ]);
    }

    // ============================================================
    // CSS Injection
    // ============================================================

    function injectStyles() {
        if (global.document && !global.document.getElementById('mishkah-devtools-styles')) {
            var style = global.document.createElement('style');
            style.id = 'mishkah-devtools-styles';
            style.textContent = `
        .devtools-code-block .keyword { color: #c678dd; font-weight: bold; }
        .devtools-code-block .string { color: #98c379; }
        .devtools-code-block .number { color: #d19a66; }
        .devtools-code-block .comment { color: #5c6370; font-style: italic; }
        
        .devtools-live-example:hover {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }
        
        .devtools-metrics-panel .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
        }
        
        .devtools-tab-panel .tab-header:hover:not(.active) {
          background: rgba(102, 126, 234, 0.1);
        }
      `;
            global.document.head.appendChild(style);
        }
    }

    // Auto-inject styles when available
    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', injectStyles);
        } else {
            injectStyles();
        }
    }

    // ============================================================
    // Export
    // ============================================================

    M.UI.DevTools = {
        CodeBlock: CodeBlock,
        StateInspector: StateInspector,
        MetricsPanel: MetricsPanel,
        EventTimeline: EventTimeline,
        LiveExample: LiveExample,
        TabPanel: TabPanel,

        // Utilities
        escapeHtml: escapeHtml,
        syntaxHighlight: syntaxHighlight,
        formatJSON: formatJSON
    };

    return M;
}));
