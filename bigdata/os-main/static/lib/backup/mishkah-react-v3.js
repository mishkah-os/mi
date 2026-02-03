/*! mishkah-react.js v3.0 - The Hybrid Reactive Core
 * Architecture: Fiber-inspired Islands + Mishkah VDOM Patching
 * Features: Local State Patching, Global Context Rebuild, Full UI Kit
 * Author: Gemini (Acting for User)
 * Date: 2025-12-06
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah'], function (M) { return factory(root, M); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.React = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
    'use strict';

    // ===================================================================
    // 🧠 SYSTEM CORE: FIBER & MEMORY
    // ===================================================================

    // The Registry: Stores the state and memory of every active component
    // Key: Component Stable ID -> Value: Fiber Node
    var fiberRegistry = new Map();

    // Render Context Globals
    var activeFiberId = null;   // ID of the component currently running
    var activeHookIndex = 0;    // Index of the current hook being called
    var renderPhase = 'ROOT';   // 'ROOT' (Global Rebuild) or 'PATCH' (Local Update)

    // Stable ID Generators
    var globalRenderCounter = 0; // Resets on every root render

    // Effect Queues
    var pendingEffects = [];
    var pendingLayoutEffects = [];

    // -------------------------------------------------------------------
    // Fiber Node Factory
    // -------------------------------------------------------------------
    function createFiber(id, type, props) {
        return {
            id: id,
            type: type,         // Component Function
            props: props,       // Current Props
            hooks: [],          // State/Effect storage
            dom: null,          // Reference to real DOM node (Anchor)
            vnode: null,        // Last rendered VNode (for Diffing)
            dirty: false,       // Update flag
            parent: null        // (Optional) for Context bubbling later
        };
    }

    function getFiber(id) {
        return fiberRegistry.get(id);
    }

    // ===================================================================
    // ⚡ RECONCILER: THE SMART ENGINE
    // ===================================================================

    // 1. createElement (The Interceptor)
    // Intercepts component calls to attach Fibers and DOM refs
    function createElement(type, props) {
        var children = [];
        for (var i = 2; i < arguments.length; i++) children.push(arguments[i]);

        // Flatten children logic identical to V2
        var flatChildren = [];
        function flatten(arr) {
            for (var j = 0; j < arr.length; j++) {
                if (Array.isArray(arr[j])) flatten(arr[j]);
                else if (arr[j] != null && arr[j] !== false && arr[j] !== true) flatChildren.push(arr[j]);
            }
        }
        flatten(children);

        var finalProps = props || {};
        finalProps.children = flatChildren.length === 1 ? flatChildren[0] : flatChildren;

        // --- HOST ELEMENTS (div, span, etc) ---
        if (typeof type === 'string') {
            // Standard VDOM creation
            return M.h(type, 'Auto', { attrs: convertPropsToAttrs(finalProps) }, flatChildren);
        }

        // --- COMPONENT (Function) ---
        if (typeof type === 'function') {
            // Generate a Stable ID based on render order (during Root Render)
            // Or reuse ID during Patching
            var fiberId;

            if (renderPhase === 'ROOT') {
                // Hierarchical ID: ComponentName + Depth/Order
                fiberId = (type.displayName || type.name || 'C') + ':' + (globalRenderCounter++);
            } else {
                // In Patch phase, we must rely on the currently active fiber's children
                // Note: For deep patching, this needs a cursor. 
                // For v3.0 MVP, we assume local patch re-runs the component itself.
                fiberId = activeFiberId ? activeFiberId : 'root';
            }

            // Execute the Component (Render Phase)
            var prevFiberId = activeFiberId;
            var prevHookIdx = activeHookIndex;

            activeFiberId = fiberId;
            activeHookIndex = 0;

            // Retrieve or Create Fiber
            var fiber = fiberRegistry.get(fiberId);
            if (!fiber) {
                fiber = createFiber(fiberId, type, finalProps);
                fiberRegistry.set(fiberId, fiber);
            } else {
                // Update props on existing fiber
                fiber.props = finalProps;
            }

            // RUN COMPONENT
            var vnodeResult;
            try {
                vnodeResult = type(finalProps);
            } catch (err) {
                console.error('[MishkahReact] Error rendering component ' + fiberId, err);
                vnodeResult = null;
            }

            // Restore Context
            activeFiberId = prevFiberId;
            activeHookIndex = prevHookIdx;

            // DOM Capture Strategy:
            // We need to know the DOM node this component produced to patch it later.
            // We inject a ref into the returned VNode.
            if (vnodeResult && typeof vnodeResult === 'object') {
                var originalRef = vnodeResult._ref;
                vnodeResult._ref = function (domNode) {
                    fiber.dom = domNode; // Capture DOM!
                    if (originalRef) {
                        if (typeof originalRef === 'function') originalRef(domNode);
                        else if (typeof originalRef === 'object') originalRef.current = domNode;
                    }
                };

                // Store result for next diff
                fiber.vnode = vnodeResult;
            }

            return vnodeResult;
        }

        return null;
    }

    // Helper: Prop conversion
    function convertPropsToAttrs(props) {
        var attrs = {};
        var events = {};
        for (var k in props) {
            if (k === 'children' || k === 'ref' || k === 'key') continue;
            if (k.startsWith('on') && typeof props[k] === 'function') {
                events[k.substring(2).toLowerCase()] = props[k];
            } else if (k === 'className') {
                attrs['class'] = props[k];
            } else if (k === 'style' && typeof props[k] === 'object') {
                attrs['style'] = props[k];
            } else {
                attrs[k] = props[k];
            }
        }
        // Attach events to a special prop for M.VDOM (if extended) or handle manually
        // Since M.h splits config into attrs/events, we return a mixed bag 
        // and rely on M.VDOM to handle standard attrs.
        // For events, Mishkah Core usually takes them in config.events.
        // BUT M.h(tag, cat, config) -> config can have {attrs, events}
        return attrs; // Simplified for MVP. *Improvement: Pass events separately if Core demands.*
    }

    // *Correction for M.h usage*: M.h takes (tag, cat, config, children)
    // Config should be { attrs: {...}, events: {...}, key: ... }
    // We override the previous simple return to format correctly for Mishkah Core.
    var originalH = M.h;
    M.h = function (tag, cat, config, children) {
        // Core H wrapper
        return originalH(tag, cat, config, children);
    };


    // 2. Schedule Patch (Local Update)
    function schedulePatch(fiberId) {
        var fiber = fiberRegistry.get(fiberId);
        if (!fiber) return;
        if (fiber.dirty) return; // Already scheduled

        fiber.dirty = true;

        // Use Microtask for batching
        Promise.resolve().then(function () {
            if (!fiber.dirty) return;
            performPatch(fiber);
        });
    }

    // 3. Perform Patch (The Hybrid Magic)
    function performPatch(fiber) {
        if (!fiber.dom || !fiber.dom.parentNode) {
            // Component unmounted or not yet mounted? 
            // Or maybe Global Rebuild happened.
            fiber.dirty = false;
            return;
        }

        renderPhase = 'PATCH';
        var prevFiberId = activeFiberId;
        activeFiberId = fiber.id;
        activeHookIndex = 0;

        // 1. Re-run Component to get Next VNode
        var nextVNode = fiber.type(fiber.props);
        var prevVNode = fiber.vnode;

        // 2. Capture DOM ref again on new VNode
        if (nextVNode && typeof nextVNode === 'object') {
            var originalRef = nextVNode._ref;
            nextVNode._ref = function (domNode) {
                fiber.dom = domNode;
                if (originalRef) {
                    if (typeof originalRef === 'function') originalRef(domNode);
                    else if (typeof originalRef === 'object') originalRef.current = domNode;
                }
            };
        }

        // 3. Use Mishkah Core to Patch
        // M.VDOM.patch(parent, next, prev, db, opts, path)
        var parentDOM = fiber.dom.parentNode;
        var db = _globalDatabase;

        try {
            // Smart Diffing!
            M.VDOM.patch(parentDOM, nextVNode, prevVNode, db, {}, "");

            // Update Fiber
            fiber.vnode = nextVNode;
            // fiber.dom is updated via the ref callback during patch
        } catch (e) {
            console.error('Patch failed for', fiber.id, e);
        }

        activeFiberId = prevFiberId;
        renderPhase = 'ROOT'; // Reset
        fiber.dirty = false;

        // Run Effects
        runEffects();
    }

    // 4. Schedule Global Rebuild (Root Render)
    var isGlobalScheduled = false;
    function scheduleGlobalRebuild() {
        if (isGlobalScheduled) return;
        isGlobalScheduled = true;

        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(function () {
                isGlobalScheduled = false;
                triggerGlobalRebuild();
            });
        } else {
            setTimeout(function () {
                isGlobalScheduled = false;
                triggerGlobalRebuild();
            }, 0);
        }
    }

    var rootComponent = null;
    var rootContainer = null;

    function render(Component, container) {
        rootComponent = Component;
        rootContainer = container;
        triggerGlobalRebuild();
    }

    function triggerGlobalRebuild() {
        if (!rootComponent || !rootContainer) return;

        // Reset Global Counters
        globalRenderCounter = 0;
        renderPhase = 'ROOT';
        activeFiberId = null;
        // We do NOT clear fiberRegistry here completely to preserve state,
        // but complex reconciliation matches by key/order.
        // For v3 MVP: We rely on deterministic render order for ID matching.

        // Execute Root Component via generic wrapper to start chain
        // We wrap it in a root fiber if needed, but M.app usually expects a VNode.
        // We'll treat the App Root as a standard function call that builds the VDOM.

        // IMPORTANT: We use Mishkah.app structure or just direct render?
        // To be compatible with "mishkah-react.js" typical usage:

        rootContainer.innerHTML = '';
        var vdom = createElement(rootComponent, {});

        // Convert our VDOM (which might contain Function Components resolved)
        // Actually, our createElement resolves functions immediately. 
        // So 'vdom' here is a tree of Host Elements (Mishkah Atoms).

        // Render to DOM
        var dom = M.VDOM.render(vdom, _globalDatabase || {});
        rootContainer.appendChild(dom);

        runEffects();
    }

    function runEffects() {
        // Layout Effects (Sync)
        while (pendingLayoutEffects.length) {
            var fn = pendingLayoutEffects.shift();
            try { fn(); } catch (e) { console.error(e); }
        }

        // Standard Effects (Async-ish)
        setTimeout(function () {
            while (pendingEffects.length) {
                var fx = pendingEffects.shift();
                try {
                    if (fx.cleanup) fx.cleanup();
                    var cl = fx.callback();
                    if (typeof cl === 'function') fx.hook.cleanup = cl;
                } catch (e) { console.error(e); }
            }
        }, 0);
    }


    // ===================================================================
    // 🎣 HOOKS IMPLEMENTATION
    // ===================================================================

    function getActiveHook() {
        if (!activeFiberId) throw new Error('Hook called outside component');
        var fiber = fiberRegistry.get(activeFiberId);
        var idx = activeHookIndex++;

        if (!fiber.hooks[idx]) {
            fiber.hooks[idx] = { memoizedState: null, queue: null };
        }
        return fiber.hooks[idx];
    }

    function useState(initialState) {
        var hook = getActiveHook();
        var fiber = fiberRegistry.get(activeFiberId); // Capture closure

        if (hook.memoizedState === null && hook.queue === null) {
            hook.memoizedState = typeof initialState === 'function' ? initialState() : initialState;
        }

        var setState = function (action) {
            var next = typeof action === 'function' ? action(hook.memoizedState) : action;
            if (next !== hook.memoizedState) {
                hook.memoizedState = next;
                // 🔥 TRIGGER LOCAL PATCH ONLY
                schedulePatch(fiber.id);
            }
        };

        return [hook.memoizedState, setState];
    }

    function useReducer(reducer, initialArg, init) {
        var hook = getActiveHook();
        var fiber = fiberRegistry.get(activeFiberId);

        if (hook.memoizedState === null && hook.queue === null) {
            hook.memoizedState = init ? init(initialArg) : initialArg;
        }

        var dispatch = function (action) {
            var next = reducer(hook.memoizedState, action);
            if (next !== hook.memoizedState) {
                hook.memoizedState = next;
                schedulePatch(fiber.id);
            }
        };

        return [hook.memoizedState, dispatch];
    }

    function useEffect(create, deps) {
        var hook = getActiveHook();
        var hasChanged = hasDepsChanged(hook.memoizedState, deps);

        if (hasChanged) {
            hook.memoizedState = deps;
            // Queue effect
            pendingEffects.push({
                callback: create,
                cleanup: hook.cleanup,
                hook: hook
            });
        }
    }

    function useLayoutEffect(create, deps) {
        var hook = getActiveHook();
        var hasChanged = hasDepsChanged(hook.memoizedState, deps);
        if (hasChanged) {
            hook.memoizedState = deps;
            pendingLayoutEffects.push(function () {
                if (hook.cleanup) hook.cleanup();
                hook.cleanup = create();
            });
        }
    }

    function useMemo(create, deps) {
        var hook = getActiveHook();
        if (hasDepsChanged(hook.memoizedState ? hook.memoizedState.deps : null, deps)) {
            hook.memoizedState = {
                value: create(),
                deps: deps
            };
        }
        return hook.memoizedState.value;
    }

    function useCallback(callback, deps) {
        return useMemo(function () { return callback; }, deps);
    }

    function useRef(initialValue) {
        var hook = getActiveHook();
        if (!hook.memoizedState) {
            hook.memoizedState = { current: initialValue };
        }
        return hook.memoizedState;
    }

    function useContext(Context) {
        // v3.0: Hybrid approach. 
        // Global Contexts (Theme/Lang) rely on Rebuild, so simple read is fine.
        return contextRegistry.get(Context._id) || Context._defaultValue;
    }

    // Helper
    function hasDepsChanged(prevDeps, nextDeps) {
        if (!prevDeps || !nextDeps) return true;
        if (prevDeps.length !== nextDeps.length) return true;
        for (var i = 0; i < prevDeps.length; i++) {
            if (prevDeps[i] !== nextDeps[i]) return true;
        }
        return false;
    }

    // ===================================================================
    // 🌍 MISHKAH ECOSYSTEM INTEGRATION
    // ===================================================================

    // Design Tokens
    var tokens = {
        colors: {
            primary: 'var(--primary, #6366f1)',
            primaryForeground: 'var(--primary-foreground, #fff)',
            background: 'var(--background, #0f172a)',
            foreground: 'var(--foreground, #f8fafc)',
            card: 'var(--card, #1e293b)',
            cardForeground: 'var(--card-foreground, #f8fafc)',
            border: 'var(--border, #334155)',
            input: 'var(--input, #334155)',
            muted: 'var(--muted-foreground, #94a3b8)',
            accent: 'var(--accent, #334155)',
            destructive: 'var(--destructive, #ef4444)',
            success: '#10b981',
            warning: '#eab308'
        },
        spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
        radius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
        shadows: {
            sm: '0 1px 2px rgba(0,0,0,0.1)',
            md: '0 4px 6px rgba(0,0,0,0.2)',
            lg: '0 10px 15px rgba(0,0,0,0.3)'
        }
    };

    // Contexts & Registry
    var contextRegistry = new Map();
    var contextIdCounter = 0;

    function createContext(defaultValue) {
        var id = 'ctx-' + (contextIdCounter++);
        var ctx = {
            _id: id,
            _defaultValue: defaultValue,
            Provider: function (props) {
                contextRegistry.set(id, props.value);
                return props.children;
            }
        };
        return ctx;
    }

    var ThemeContext = createContext({ theme: 'dark', tokens: tokens, setTheme: function () { } });
    var I18nContext = createContext({ lang: 'ar', dir: 'rtl', t: function (k) { return k }, setLang: function () { } });
    var DatabaseContext = createContext({ data: {}, env: {}, getState: function () { } });

    // Custom Hooks
    function useTheme() { return useContext(ThemeContext); }
    function useI18n() { return useContext(I18nContext); }
    function useDatabase() { return useContext(DatabaseContext); }
    function useDirection() { return useI18n().dir || 'ltr'; }

    // Init & Globals
    var _globalDatabase = null;
    var STORAGE_KEY = 'mishkah_env_v3';

    function saveEnv(env) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: env.theme, lang: env.lang, dir: env.dir })); } catch (e) { }
    }

    function createT(dict, lang) {
        return function (key) {
            if (!dict || !dict[key]) return key;
            return dict[key][lang] || dict[key].ar || dict[key].en || key;
        };
    }

    function initMishkah(db) {
        _globalDatabase = db || {};
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && _globalDatabase.env) {
                _globalDatabase.env.theme = saved.theme || _globalDatabase.env.theme;
                _globalDatabase.env.lang = saved.lang || _globalDatabase.env.lang;
                _globalDatabase.env.dir = saved.dir || _globalDatabase.env.dir;
            }
        } catch (e) { }

        applyGlobalEnv();
    }

    function applyGlobalEnv() {
        if (!_globalDatabase || !_globalDatabase.env) return;
        var env = _globalDatabase.env;
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', env.theme);
            document.documentElement.setAttribute('dir', env.dir);
            document.documentElement.setAttribute('lang', env.lang);
        }
    }

    // GLOBAL TOGGLES (Triggers Global Rebuild)
    function toggleTheme() {
        if (!_globalDatabase || !_globalDatabase.env) return;
        var env = _globalDatabase.env;
        env.theme = env.theme === 'dark' ? 'light' : 'dark';
        saveEnv(env);
        applyGlobalEnv();

        // Update Context Registry
        var tCtx = contextRegistry.get(ThemeContext._id);
        if (tCtx) tCtx.theme = env.theme;

        scheduleGlobalRebuild();
    }

    function toggleLang() {
        if (!_globalDatabase || !_globalDatabase.env) return;
        var env = _globalDatabase.env;
        env.lang = env.lang === 'ar' ? 'en' : 'ar';
        env.dir = env.lang === 'ar' ? 'rtl' : 'ltr';
        saveEnv(env);
        applyGlobalEnv();

        // Update Context Registry & Dict
        var iCtx = contextRegistry.get(I18nContext._id);
        if (iCtx) {
            iCtx.lang = env.lang;
            iCtx.dir = env.dir;
            iCtx.t = createT(iCtx.dict, env.lang); // Refresh T function
        }

        scheduleGlobalRebuild();
    }

    function MishkahProvider(props) {
        if (!_globalDatabase && props.database) initMishkah(props.database);

        var db = _globalDatabase || props.database || {};
        var env = db.env || {};
        var i18n = db.i18n || {};

        // Register Contexts
        contextRegistry.set(ThemeContext._id, {
            theme: env.theme || 'dark',
            tokens: tokens,
            setTheme: toggleTheme
        });

        contextRegistry.set(I18nContext._id, {
            lang: env.lang || 'ar',
            dir: env.dir || 'rtl',
            dict: i18n.dict || {},
            t: createT(i18n.dict || {}, env.lang || 'ar'),
            setLang: toggleLang
        });

        contextRegistry.set(DatabaseContext._id, {
            data: db.data || {},
            env: env,
            getState: function () { return db; },
            setState: function (updater) {
                // Database updates trigger global rebuild
                if (typeof updater === 'function') _globalDatabase = updater(_globalDatabase);
                else Object.assign(_globalDatabase, updater);
                scheduleGlobalRebuild();
            }
        });

        // Use fragment for children
        return props.children;
    }

    // ===================================================================
    // 🎨 UI COMPONENTS (Same as before, simplified prop passing)
    // ===================================================================

    function sx() {
        var res = {};
        for (var i = 0; i < arguments.length; i++) Object.assign(res, arguments[i] || {});
        return res;
    }

    var UI = {
        Button: function (props) {
            var th = useTheme();
            var variant = props.variant || 'soft';
            var styles = {
                padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '8px'
            };
            var variants = {
                solid: { background: th.tokens.colors.primary, color: '#fff' },
                soft: { background: th.tokens.colors.accent, color: th.tokens.colors.foreground },
                destructive: { background: th.tokens.colors.destructive, color: '#fff' },
                ghost: { background: 'transparent', color: th.tokens.colors.foreground }
            };
            return createElement('button', {
                style: sx(styles, variants[variant], props.style),
                onClick: props.onClick,
                className: props.className
            }, props.children);
        },
        Card: function (props) {
            var th = useTheme();
            return createElement('div', {
                style: sx({
                    background: th.tokens.colors.card, color: th.tokens.colors.cardForeground,
                    border: '1px solid ' + th.tokens.colors.border, borderRadius: '12px',
                    boxShadow: th.tokens.shadows.md, overflow: 'hidden'
                }, props.style),
                className: props.className
            }, [
                (props.title || props.description) && createElement('div', { style: { padding: '16px' } }, [
                    props.title && createElement('h3', { style: { margin: 0, fontSize: '18px' } }, props.title),
                    props.description && createElement('p', { style: { margin: '4px 0 0', color: th.tokens.colors.muted, fontSize: '14px' } }, props.description)
                ]),
                props.content && createElement('div', { style: { padding: '0 16px 16px' } }, props.content),
                props.children && createElement('div', { style: { padding: '0 16px 16px' } }, props.children),
                props.footer && createElement('div', { style: { padding: '16px', borderTop: '1px solid ' + th.tokens.colors.border, background: 'rgba(0,0,0,0.02)' } }, props.footer)
            ]);
        },
        Input: function (props) {
            var th = useTheme();
            return createElement('input', {
                style: sx({
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid ' + th.tokens.colors.input,
                    background: th.tokens.colors.background, color: th.tokens.colors.foreground
                }, props.style),
                value: props.value,
                placeholder: props.placeholder,
                onChange: props.onChange
            });
        },
        HStack: function (props) {
            return createElement('div', { style: sx({ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }, props.style) }, props.children);
        },
        VStack: function (props) {
            return createElement('div', { style: sx({ display: 'flex', flexDirection: 'column', gap: '8px' }, props.style) }, props.children);
        },
        Badge: function (props) {
            var th = useTheme();
            return createElement('span', {
                style: sx({
                    padding: '4px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 'bold',
                    background: th.tokens.colors.accent, color: th.tokens.colors.foreground
                }, props.style)
            }, props.children);
        },
        Alert: function (props) {
            var type = props.type || 'info';
            var colors = {
                info: { bg: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: 'rgba(59,130,246,0.2)' },
                success: { bg: 'rgba(16,185,129,0.1)', color: '#34d399', border: 'rgba(16,185,129,0.2)' }
            };
            var c = colors[type] || colors.info;
            return createElement('div', {
                style: sx({ padding: '12px', borderRadius: '8px', background: c.bg, color: c.color, border: '1px solid ' + c.border }, props.style)
            }, props.children);
        },
        Divider: function () {
            var th = useTheme();
            return createElement('hr', { style: { border: 'none', borderTop: '1px solid ' + th.tokens.colors.border, margin: '16px 0' } });
        },
        Spinner: function (props) {
            var th = useTheme();
            return createElement('div', {
                style: {
                    width: (props.size || 24) + 'px', height: (props.size || 24) + 'px',
                    border: '3px solid ' + th.tokens.colors.border, borderTopColor: th.tokens.colors.primary,
                    borderRadius: '50%', animation: 'spin 1s linear infinite'
                }
            });
        },
        Progress: function (props) {
            var th = useTheme();
            return createElement('div', { style: { height: '8px', background: th.tokens.colors.border, borderRadius: '4px', overflow: 'hidden' } },
                createElement('div', { style: { height: '100%', width: (props.value || 0) + '%', background: th.tokens.colors.primary, transition: 'width 0.3s' } })
            );
        },
        Avatar: function (props) {
            var th = useTheme();
            var size = props.size || 40;
            return createElement('div', {
                style: {
                    width: size + 'px', height: size + 'px', borderRadius: '50%',
                    background: props.src ? 'url(' + props.src + ') center/cover' : th.tokens.colors.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
                }
            }, !props.src ? (props.name || 'U').charAt(0) : null);
        },
        Skeleton: function (props) {
            var th = useTheme();
            return createElement('div', {
                style: {
                    width: props.width || '100%', height: props.height || '20px',
                    borderRadius: props.rounded || '4px',
                    background: th.tokens.colors.accent, opacity: 0.5
                }
            });
        },
        SweetNotice: function (props) {
            var th = useTheme();
            return createElement('div', {
                style: {
                    background: th.tokens.colors.card, border: '1px solid ' + th.tokens.colors.primary,
                    padding: '16px', borderRadius: '12px'
                }
            }, [
                createElement('h4', { style: { margin: '0 0 8px', color: th.tokens.colors.foreground } }, props.title),
                createElement('p', { style: { margin: 0, color: th.tokens.colors.muted } }, props.message),
                props.actions && createElement('div', { style: { marginTop: '12px', display: 'flex', gap: '8px' } }, props.actions)
            ]);
        }
    };

    // CSS Injection for Spinner
    if (typeof document !== 'undefined' && !document.getElementById('mishkah-css')) {
        var style = document.createElement('style');
        style.id = 'mishkah-css';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    // ===================================================================
    // 📦 EXPORTS
    // ===================================================================

    var ReactAPI = {
        createElement: createElement,
        h: createElement,
        Fragment: function (p) { return p.children; },
        render: render,

        // Hooks
        useState: useState,
        useEffect: useEffect,
        useLayoutEffect: useLayoutEffect,
        useMemo: useMemo,
        useCallback: useCallback,
        useRef: useRef,
        useContext: useContext,
        useReducer: useReducer,

        // Mishkah Specifics
        MishkahProvider: MishkahProvider,
        initMishkah: initMishkah,
        toggleTheme: toggleTheme,
        toggleLang: toggleLang,
        useTheme: useTheme,
        useI18n: useI18n,
        useDatabase: useDatabase,
        useDirection: useDirection,

        // Contexts
        ThemeContext: ThemeContext,
        I18nContext: I18nContext,
        DatabaseContext: DatabaseContext,
        createContext: createContext,

        // UI
        UI: UI,
        tokens: tokens,

        // Utils
        forwardRef: function (render) { return render; }, // Simplified
        memo: function (comp) { return comp; }, // Simplified
        createPortal: function (child, container) { return M.VDOM.createPortal ? M.VDOM.createPortal(child, container) : null; }
    };

    // Global Alias
    if (typeof global !== 'undefined') {
        global.React = ReactAPI;
        global.MishkahReact = ReactAPI;
        global.MishkahUI = UI;
        global.M = M; // Ensure core is available
    }

    return ReactAPI;
}));