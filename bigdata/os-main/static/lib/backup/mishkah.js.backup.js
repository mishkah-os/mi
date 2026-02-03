(function (global) {
    'use strict';

    if (global.MishkahAuto && global.MishkahAuto.__version) {
        return;
    }

    var doc = global.document;
    if (!doc) return;

    // --- 1. Configuration & Environment ---

    var currentScript = doc.currentScript;
    if (!currentScript) {
        var scripts = doc.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i -= 1) {
            var candidate = scripts[i];
            if (!candidate || !candidate.src) continue;
            if (candidate.src.indexOf('mishkah.js') !== -1) {
                currentScript = candidate;
                break;
            }
        }
    }

    var baseUrl = '';
    if (currentScript && currentScript.src) {
        var src = currentScript.src;
        var queryIndex = src.indexOf('?');
        if (queryIndex !== -1) src = src.slice(0, queryIndex);
        baseUrl = src.replace(/[^\/]*$/, '');
    }
    global.__MISHKAH_BASE__ = baseUrl;

    function parseDatasetFlag(value, fallback) {
        if (value == null || value === '') return fallback;
        var normalized = String(value).toLowerCase();
        if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
        if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
        return fallback;
    }

    function parseDatasetValue(name, fallback) {
        if (!currentScript) return fallback;
        var data = currentScript.dataset || {};
        if (!Object.prototype.hasOwnProperty.call(data, name)) return fallback;
        var value = data[name];
        if (value == null) return fallback;
        var trimmed = String(value).trim();
        if (!trimmed) return fallback;
        return trimmed;
    }

    var userConfig = global.MishkahAutoConfig || {};
    var autoFlag = parseDatasetFlag(parseDatasetValue('auto', null), undefined);
    var autoEnabled = (typeof autoFlag === 'boolean') ? autoFlag
        : (typeof userConfig.auto === 'boolean' ? userConfig.auto : true);

    // --- 2. Resource Definitions ---

    function joinBase(path, fallback) {
        if (path && /^(https?:)?\/\//i.test(path)) return path;
        if (path && path.charAt(0) === '/') return path;
        return (baseUrl || fallback || '') + (path || '');
    }

    var paths = userConfig.paths || {};

    var RESOURCES = {
        // Core
        'utils': {
            id: 'mishkah-utils',
            src: joinBase(paths.utils || 'mishkah-utils.js'),
            test: function () { return global.Mishkah && global.Mishkah.utils; }
        },
        'core': {
            id: 'mishkah-core',
            src: joinBase(paths.core || 'mishkah.core.js'),
            test: function () { return global.Mishkah && global.Mishkah.app; }
        },
        'ui': {
            id: 'mishkah-ui',
            src: joinBase(paths.ui || 'mishkah-ui.js'),
            test: function () { return global.Mishkah && global.Mishkah.UI; }
        },
        // Dependencies
        'acorn': {
            id: 'mishkah-acorn',
            src: joinBase(paths.acorn || 'https://cdn.jsdelivr.net/npm/acorn@8.15.0/dist/acorn.min.js'),
            test: function () { return !!global.acorn; }
        },
        'acorn-walk': {
            id: 'mishkah-acorn-walk',
            src: joinBase(paths.acornWalk || 'https://cdn.jsdelivr.net/npm/acorn-walk@8.3.4/dist/walk.min.js'),
            test: function () { return !!(global.acornWalk || (global.acorn && global.acorn.walk)); },
            onLoad: function () {
                if (!global.acornWalk && global.acorn && global.acorn.walk) {
                    global.acornWalk = global.acorn.walk;
                }
            }
        },
        // Features
        'htmlx': {
            id: 'mishkah-htmlx',
            src: joinBase(paths.htmlx || 'mishkah-htmlx.js'),
            test: function () {
                return global.Mishkah && (global.Mishkah.HTMLxAgent || (global.Mishkah.HTMLx && global.Mishkah.HTMLx.Agent));
            }
        },
        'store': {
            id: 'mishkah-store',
            src: joinBase(paths.store || 'mishkah.store.js'),
            test: function () { return typeof global.createStore === 'function'; }
        },
        'simple-store': {
            id: 'mishkah-simple-store',
            src: joinBase(paths.simpleStore || 'mishkah.simple-store.js'),
            test: function () { return typeof global.createSimpleStore === 'function'; }
        },
        'devtools': {
            id: 'mishkah-devtools',
            src: joinBase(paths.devtools || 'mishkah.div.js'),
            test: function () {
                return global.Mishkah && global.Mishkah.Devtools && global.Mishkah.Devtools.Judgment;
            }
        },
        // External Libraries
        'chartjs': {
            id: 'lib-chartjs',
            src: (userConfig.chart && userConfig.chart.cdn) ? joinBase(userConfig.chart.cdn) : 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js',
            test: function () { return !!global.Chart; }
        },
        'plotly': {
            id: 'lib-plotly',
            src: 'https://cdn.plot.ly/plotly-2.27.0.min.js',
            test: function () { return !!global.Plotly; }
        }
    };

    // --- 3. Loader Logic ---

    function ensureScript(entry) {
        if (!entry || !entry.src) return Promise.resolve(false);
        if (entry.test && entry.test()) {
            if (typeof entry.onLoad === 'function') {
                try { entry.onLoad(); }
                catch (err) { setTimeout(function () { throw err; }, 0); }
            }
            return Promise.resolve(true);
        }
        return new Promise(function (resolve, reject) {
            var existing = entry.id ? doc.getElementById(entry.id) : null;
            if (existing) {
                var readyAttr = existing.getAttribute('data-ready');
                if (readyAttr === '1') {
                    if (typeof entry.onLoad === 'function') {
                        try { entry.onLoad(); }
                        catch (err) { setTimeout(function () { throw err; }, 0); }
                    }
                    resolve(true);
                    return;
                }
                existing.addEventListener('load', function () {
                    if (typeof entry.onLoad === 'function') {
                        try { entry.onLoad(); }
                        catch (err) { setTimeout(function () { throw err; }, 0); }
                    }
                    resolve(true);
                }, { once: true });
                existing.addEventListener('error', function (event) { reject(new Error('Failed to load script ' + entry.src)); }, { once: true });
                return;
            }
            var script = doc.createElement('script');
            if (entry.id) script.id = entry.id;
            script.src = entry.src;
            script.async = false;
            script.setAttribute('data-mishkah-auto', '1');
            script.addEventListener('load', function () {
                script.setAttribute('data-ready', '1');
                if (typeof entry.onLoad === 'function') {
                    try { entry.onLoad(); }
                    catch (err) { setTimeout(function () { throw err; }, 0); }
                }
                resolve(true);
            }, { once: true });
            script.addEventListener('error', function (event) {
                reject(new Error('Failed to load script ' + entry.src));
            }, { once: true });
            doc.head.appendChild(script);
        });
    }

    function loadSequential(list, index) {
        if (index === void 0) index = 0;
        if (!list || index >= list.length) return Promise.resolve(true);
        return ensureScript(list[index]).then(function () {
            return loadSequential(list, index + 1);
        });
    }

    // --- 4. Scaffolding & Auto-Init ---

    function detectRequirements() {
        var reqs = new Set();

        // Always needed
        reqs.add('utils');
        reqs.add('core');

        // Check HTML attributes
        var html = doc.documentElement;

        // HTMLx
        if (html.hasAttribute('data-htmlx')) {
            reqs.add('acorn');
            reqs.add('acorn-walk');
            reqs.add('htmlx');
        }

        // UI / Components
        if (html.hasAttribute('data-ui') || doc.querySelector('theme-switcher, lang-switcher, [data-ui]')) {
            reqs.add('ui');
        }

        // Stores
        if (html.hasAttribute('data-stores') || parseDatasetValue('stores')) {
            reqs.add('store');
            reqs.add('simple-store');
        }

        // Devtools
        if (html.hasAttribute('data-devtools') || parseDatasetValue('devtools')) {
            reqs.add('devtools');
        }

        // External Libs
        if (html.hasAttribute('data-chartjs') || doc.querySelector('[data-chart-type], canvas[data-m-chart]')) {
            reqs.add('chartjs');
        }
        if (html.hasAttribute('data-plotly')) {
            reqs.add('plotly');
        }

        return Array.from(reqs).map(function (k) { return RESOURCES[k]; }).filter(Boolean);
    }

    function autoInit() {
        if (!autoEnabled) return;

        var queue = detectRequirements();

        loadSequential(queue).then(function () {
            // Check if we should run M.app.make()
            var M = global.Mishkah;
            if (!M || !M.app || typeof M.app.make !== 'function') return;

            var htmlxAttr = doc.documentElement.getAttribute('data-htmlx');
            var hasTemplate = !!doc.querySelector('template[id]');

            if (htmlxAttr || hasTemplate) {
                var appResult = M.app.make();

                // Handle Promise or direct return to bind UI extensions
                Promise.resolve(appResult).then(function (app) {
                    if (M.UI && M.UI.ChartBridge) {
                        if (typeof M.UI.ChartBridge.bindApp === 'function') {
                            M.UI.ChartBridge.bindApp(app);
                        }
                        if (typeof M.UI.ChartBridge.hydrate === 'function') {
                            M.UI.ChartBridge.hydrate();
                        }
                    }
                });
            }

            // Initialize Custom Elements if UI is present
            if (M.UI) {
                defineCustomElements(M);
            }

        }).catch(function (err) {
            console.error('[MishkahAuto] Failed to scaffold:', err);
        });
    }

    // --- 5. Custom Elements (Web Components) ---

    function defineCustomElements(M) {
        if (!global.customElements) return;

        class ThemeSwitcher extends HTMLElement {
            connectedCallback() {
                this.render();
            }
            render() {
                const currentTheme = doc.documentElement.getAttribute('data-theme') || 'dark';

                // Use Mishkah UI tokens
                const btnClass = M.utils.twcss.token('btn') + ' ' + M.utils.twcss.token('btn/ghost') + ' ' + M.utils.twcss.token('btn/icon');

                this.innerHTML = '';
                const btn = doc.createElement('button');
                btn.className = btnClass;
                btn.innerHTML = currentTheme === 'dark' ? '🌙' : '🌞';
                btn.onclick = () => {
                    const newTheme = doc.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                    doc.documentElement.setAttribute('data-theme', newTheme);
                    btn.innerHTML = newTheme === 'dark' ? '🌙' : '🌞';

                    if (M.utils && M.utils.twcss && M.utils.twcss.setTheme) {
                        M.utils.twcss.setTheme(newTheme);
                    }
                };
                this.appendChild(btn);
            }
        }

        class LangSwitcher extends HTMLElement {
            connectedCallback() {
                this.render();
            }
            render() {
                const langs = (this.getAttribute('langs') || 'ar,en').split(',');
                const currentLang = doc.documentElement.getAttribute('lang') || 'ar';

                const wrapperClass = 'inline-flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--surface-1)]/80 p-1 shadow-inner';
                const btnBaseClass = 'inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors';
                const activeClass = 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm';
                const inactiveClass = 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]';

                const tw = M.utils.twcss.tw;

                const container = doc.createElement('div');
                container.className = tw(wrapperClass);

                langs.forEach(lang => {
                    const btn = doc.createElement('button');
                    const isActive = lang === currentLang;
                    btn.className = tw(btnBaseClass + ' ' + (isActive ? activeClass : inactiveClass));
                    btn.textContent = lang.toUpperCase();
                    btn.onclick = () => {
                        const newLang = lang;
                        const dir = newLang === 'ar' ? 'rtl' : 'ltr';
                        doc.documentElement.setAttribute('lang', newLang);
                        doc.documentElement.setAttribute('dir', dir);

                        this.render();

                        if (M.utils && M.utils.twcss && M.utils.twcss.setDir) {
                            M.utils.twcss.setDir(dir);
                        }
                    };
                    container.appendChild(btn);
                });

                this.innerHTML = '';
                this.appendChild(container);
            }
        }

        if (!customElements.get('theme-switcher')) customElements.define('theme-switcher', ThemeSwitcher);
        if (!customElements.get('lang-switcher')) customElements.define('lang-switcher', LangSwitcher);
    }

    // --- 6. Boot ---

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }

    // Export for manual usage
    global.MishkahAuto = {
        __version: '2.0.0',
        init: autoInit
    };

})(this);
