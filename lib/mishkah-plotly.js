// mishkah-plotly.js — Plotly.js Bridge (Smart Integration)
(function (w) {
    'use strict';

    const M = w.Mishkah, U = M.utils, h = M.DSL;

    /* ===================== Plotly.js Bridge & Components ===================== */
    const PlotlyBridge = (() => {
        const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
        const parseSafe = U.JSON && typeof U.JSON.parseSafe === 'function' ? U.JSON.parseSafe : (value => {
            try { return JSON.parse(value); } catch (_err) { return null; }
        });
        const clone = U.JSON && typeof U.JSON.clone === 'function' ? U.JSON.clone : (value => {
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return null; }
        });
        const stableStringify = U.JSON && typeof U.JSON.stableStringify === 'function'
            ? U.JSON.stableStringify
            : (value => {
                try { return JSON.stringify(value); } catch (_err) { return ''; }
            });

        const registry = new WeakMap();
        const scheduled = new Set();
        const scriptPromises = new Map();
        let cdnUrl = 'https://cdn.plot.ly/plotly-2.29.1.min.js';
        let fallbackUrl = './vendor/plotly.min.js';
        let libraryPromise = null;

        function sanitizeValue(value, path) {
            if (value == null) return value;
            const type = typeof value;
            if (type === 'function') {
                return null; // Remove functions
            }
            if (type !== 'object') {
                return value;
            }
            if (value instanceof Date) {
                return new Date(value.getTime());
            }
            if (Array.isArray(value)) {
                return value.map((item, index) => sanitizeValue(item, (path || []).concat(index)));
            }
            const out = {};
            Object.keys(value).forEach((key) => {
                out[key] = sanitizeValue(value[key], (path || []).concat(key));
            });
            return out;
        }

        function loadScript(url) {
            if (!url || typeof document === 'undefined') {
                return Promise.reject(new Error('EMPTY_PLOTLY_SOURCE'));
            }
            const trimmed = String(url).trim();
            if (!trimmed) {
                return Promise.reject(new Error('EMPTY_PLOTLY_SOURCE'));
            }
            if (globalObj.Plotly && typeof globalObj.Plotly === 'object') {
                return Promise.resolve(globalObj.Plotly);
            }
            if (scriptPromises.has(trimmed)) {
                return scriptPromises.get(trimmed);
            }
            const promise = new Promise((resolve, reject) => {
                try {
                    const script = document.createElement('script');
                    script.src = trimmed;
                    script.async = true;
                    script.setAttribute('data-plotly-bridge', trimmed);
                    script.onload = () => resolve(globalObj.Plotly || null);
                    script.onerror = (err) => reject(err || new Error('PLOTLY_SCRIPT_ERROR'));
                    document.head.appendChild(script);
                } catch (err) {
                    reject(err);
                }
            });
            const managed = promise.then(
                (value) => value,
                (error) => {
                    scriptPromises.delete(trimmed);
                    throw error;
                }
            );
            scriptPromises.set(trimmed, managed);
            return managed;
        }

        function tryLoadLibrary() {
            if (globalObj.Plotly && typeof globalObj.Plotly === 'object') {
                return Promise.resolve(globalObj.Plotly);
            }
            const sources = [cdnUrl].filter(Boolean);
            if (fallbackUrl && fallbackUrl !== cdnUrl) {
                sources.push(fallbackUrl);
            }
            let attempt = Promise.reject(new Error('UNINITIALIZED_PLOTLY_LOAD'));
            sources.forEach((source) => {
                attempt = attempt.catch(() => loadScript(source).then((lib) => {
                    if (lib && typeof lib === 'object') {
                        return lib;
                    }
                    if (globalObj.Plotly && typeof globalObj.Plotly === 'object') {
                        return globalObj.Plotly;
                    }
                    return Promise.reject(new Error('PLOTLY_GLOBAL_UNAVAILABLE'));
                }));
            });
            return attempt;
        }

        function ensureLibrary() {
            if (globalObj.Plotly && typeof globalObj.Plotly === 'object') {
                return Promise.resolve(globalObj.Plotly);
            }
            if (!libraryPromise) {
                libraryPromise = tryLoadLibrary().catch((err) => {
                    if (M.Auditor && typeof M.Auditor.warn === 'function') {
                        M.Auditor.warn('W-PLOTLY', 'تعذر تحميل مكتبة Plotly.js', { error: String(err) });
                    }
                    libraryPromise = null;
                    return null;
                });
            }
            return libraryPromise.then((lib) => {
                if (lib && typeof lib === 'object') {
                    return lib;
                }
                if (globalObj.Plotly && typeof globalObj.Plotly === 'object') {
                    return globalObj.Plotly;
                }
                return null;
            });
        }

        function encodePayload(payload) {
            return stableStringify(payload || {});
        }

        function buildPayload(type, data, layout, config) {
            const safeData = Array.isArray(data) ? sanitizeValue(data, ['data']) : [sanitizeValue(data, ['data'])];

            // Default layout with theme integration
            const defaultLayout = {
                autosize: true,
                margin: { l: 50, r: 50, t: 50, b: 50 },
                paper_bgcolor: 'var(--card)',
                plot_bgcolor: 'var(--card)',
                font: {
                    color: 'var(--foreground)',
                    family: 'var(--font-sans, system-ui)'
                },
                scene: type === 'scatter3d' ? {
                    xaxis: { gridcolor: 'var(--border)', color: 'var(--muted-foreground)' },
                    yaxis: { gridcolor: 'var(--border)', color: 'var(--muted-foreground)' },
                    zaxis: { gridcolor: 'var(--border)', color: 'var(--muted-foreground)' }
                } : undefined
            };

            const safeLayout = (layout && typeof layout === 'object') ? sanitizeValue(layout, ['layout']) : {};
            const merged = Object.assign({}, defaultLayout, safeLayout);

            const defaultConfig = {
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                modeBarButtonsToRemove: ['lasso2d', 'select2d']
            };

            const safeConfig = (config && typeof config === 'object') ? sanitizeValue(config, ['config']) : {};
            const finalConfig = Object.assign({}, defaultConfig, safeConfig);

            return { data: safeData, layout: merged, config: finalConfig };
        }

        function instantiate(node, signature, payload, PlotlyLib) {
            console.log('[PLOTLY-INSTANTIATE] Creating/updating plot');

            if (!node || !PlotlyLib) {
                console.error('[PLOTLY-INSTANTIATE] Missing node or PlotlyLib!');
                return null;
            }

            const current = registry.get(node);
            console.log('[PLOTLY-INSTANTIATE] Current registry:', current ? 'EXISTS' : 'NULL');

            // If signature matches, no update needed
            if (current && current.signature === signature) {
                console.log('[PLOTLY-INSTANTIATE] Signature matches, skipping update');
                return current.instance;
            }

            // Use Plotly.react for smart updates (creates or updates)
            try {
                console.log('[PLOTLY-INSTANTIATE] Calling Plotly.react...');
                PlotlyLib.react(node, payload.data, payload.layout, payload.config);
                registry.set(node, { instance: true, signature });
                console.log('[PLOTLY-INSTANTIATE] ✓ Plot rendered successfully');
                return true;
            } catch (err) {
                console.error('[PLOTLY-INSTANTIATE] ✗ Failed to render plot:', err);
                if (M.Auditor && typeof M.Auditor.error === 'function') {
                    M.Auditor.error('E-PLOTLY', 'فشل إنشاء الرسم البياني', { error: String(err) });
                }
                return null;
            }
        }

        function hydrateNow(root) {
            if (typeof document === 'undefined') return;
            const scope = (!root || root === document) ? document : root;
            const nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-m-plotly]') : [];
            if (!nodes.length) return;

            ensureLibrary().then((PlotlyLib) => {
                if (!PlotlyLib) return;
                nodes.forEach((node) => {
                    const raw = node.getAttribute('data-m-plotly');
                    if (!raw) return;
                    const payload = parseSafe(raw, null);
                    if (!payload) return;
                    instantiate(node, raw, payload, PlotlyLib);
                });
            });
        }

        function scheduleHydrate(root, attempt = 0) {
            if (typeof window === 'undefined') return;
            const key = root || document;
            if (scheduled.has(key)) return;
            scheduled.add(key);

            const run = () => {
                scheduled.delete(key);
                const scope = (!root || root === document) ? document : root;
                const nodes = scope && scope.querySelectorAll ? scope.querySelectorAll('[data-m-plotly]') : [];
                if (!nodes || nodes.length === 0) {
                    if (attempt < 4) {
                        scheduleHydrate(root, attempt + 1);
                    }
                    return;
                }
                hydrateNow(root || document);
            };

            if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(run);
            } else {
                setTimeout(run, 16);
            }
        }

        function bindApp(app, mount) {
            if (!app || typeof document === 'undefined') return null;
            const resolveRoot = () => {
                if (typeof mount === 'string') {
                    return document.querySelector(mount) || document;
                }
                return mount || document;
            };
            const target = resolveRoot();

            scheduleHydrate(target);

            const original = app.rebuild;
            app.rebuild = function patchedRebuild() {
                const result = original.apply(app, arguments);
                const root = resolveRoot();
                scheduleHydrate(root);
                return result;
            };

            return {
                unbind() {
                    app.rebuild = original;
                }
            };
        }

        function setCDN(url) {
            if (typeof url === 'string' && url.trim()) {
                cdnUrl = url.trim();
                libraryPromise = null;
            }
        }

        function setFallback(url) {
            if (typeof url === 'string' && url.trim()) {
                fallbackUrl = url.trim();
                libraryPromise = null;
            }
        }

        return { buildPayload, encodePayload, hydrate: scheduleHydrate, bindApp, ensureLibrary, setCDN, setFallback };
    })();

    // Export to Mishkah.UI
    if (M && M.UI) {
        M.UI.Plotly = PlotlyBridge;
        console.log('✅ Mishkah Plotly Bridge loaded');
    }

})(typeof window !== 'undefined' ? window : this);
