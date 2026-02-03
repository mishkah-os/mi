/*! mishkah-react.js - Full React Compatibility Layer v2.0
 * Mishkah Framework - React API Implementation
 * Features: useState, useEffect, useMemo, useRef, useCallback,
 *           useReducer, useContext, createContext, forwardRef, memo, createPortal
 * Date: 2025-12-05
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
    // Internal State Management
    // ===================================================================

    var componentStateStore = {};
    var effectQueue = [];
    var layoutEffectQueue = [];
    var currentRenderingComponent = null;
    var currentHookIndex = 0;
    var componentRenderIndex = 0;
    var rootComponentRef = null;
    var rootContainerRef = null;
    var gkeyCounter = 0;
    var renderScheduled = false;
    var batchingUpdates = false;
    var pendingUpdates = [];

    // Context registry
    var contextRegistry = new Map();
    var contextIdCounter = 0;

    // Portal registry
    var portalRegistry = [];

    // Memoized components cache
    var memoCache = new WeakMap();

    var debugEnabled = false;

    // ===================================================================
    // Debug Utilities
    // ===================================================================

    function debugLog() {
        if (!debugEnabled) return;
        try {
            var args = Array.prototype.slice.call(arguments);
            console.log.apply(console, ['[Mishkah.React]'].concat(args));
        } catch (_) { }
    }

    function warnOnce(key, message) {
        if (!warnOnce._warned) warnOnce._warned = {};
        if (!warnOnce._warned[key]) {
            console.warn('[Mishkah.React] ' + message);
            warnOnce._warned[key] = true;
        }
    }

    // ===================================================================
    // Shallow Comparison Utility
    // ===================================================================

    function shallowEqual(objA, objB) {
        if (objA === objB) return true;
        if (typeof objA !== 'object' || objA === null ||
            typeof objB !== 'object' || objB === null) {
            return false;
        }
        var keysA = Object.keys(objA);
        var keysB = Object.keys(objB);
        if (keysA.length !== keysB.length) return false;
        for (var i = 0; i < keysA.length; i++) {
            var key = keysA[i];
            if (!objB.hasOwnProperty(key) || objA[key] !== objB[key]) {
                return false;
            }
        }
        return true;
    }

    // ===================================================================
    // Context API
    // ===================================================================

    /**
     * Creates a Context object for sharing values across components.
     * @param {*} defaultValue - The default value for the context
     * @returns {Object} Context object with Provider and Consumer
     */
    function createContext(defaultValue) {
        var contextId = '__MishkahContext_' + (++contextIdCounter) + '__';

        var context = {
            _id: contextId,
            _defaultValue: defaultValue,
            _currentValue: defaultValue,
            Provider: null,
            Consumer: null
        };

        // Provider component
        context.Provider = function ContextProvider(props) {
            var value = props.value !== undefined ? props.value : defaultValue;

            // Store in registry for useContext to read
            contextRegistry.set(contextId, value);

            // Render children
            var children = props.children;
            if (Array.isArray(children)) {
                return createElement(Fragment, null, children);
            }
            return children || null;
        };
        context.Provider.displayName = 'Context.Provider';
        context.Provider._contextId = contextId;

        // Consumer component (for class components or render props pattern)
        context.Consumer = function ContextConsumer(props) {
            var value = contextRegistry.has(contextId)
                ? contextRegistry.get(contextId)
                : defaultValue;

            if (typeof props.children === 'function') {
                return props.children(value);
            }
            warnOnce('consumer-children', 'Context.Consumer requires a function as children');
            return null;
        };
        context.Consumer.displayName = 'Context.Consumer';
        context.Consumer._contextId = contextId;

        // Store reference to default value
        context._defaultValue = defaultValue;

        return context;
    }

    /**
     * Hook to consume a Context value.
     * @param {Object} Context - The context object created by createContext
     * @returns {*} The current context value
     */
    function useContext(Context) {
        if (!Context || !Context._id) {
            throw new Error('useContext requires a valid Context object created by createContext');
        }

        // Read from registry (set by Provider)
        if (contextRegistry.has(Context._id)) {
            return contextRegistry.get(Context._id);
        }

        // Fallback to default value
        return Context._defaultValue;
    }

    // ===================================================================
    // useReducer Hook
    // ===================================================================

    /**
     * Alternative to useState for complex state logic.
     * @param {Function} reducer - (state, action) => newState
     * @param {*} initialArg - Initial state or argument for init function
     * @param {Function} [init] - Optional lazy initialization function
     * @returns {Array} [state, dispatch]
     */
    function useReducer(reducer, initialArg, init) {
        if (!currentRenderingComponent) {
            throw new Error('useReducer must be called inside a component');
        }

        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;

        if (!componentStateStore[compId]) {
            componentStateStore[compId] = [];
        }

        var hook = componentStateStore[compId][hookIdx];

        // Initialize state on first render
        if (!hook) {
            var initialState = init !== undefined ? init(initialArg) : initialArg;
            hook = componentStateStore[compId][hookIdx] = {
                state: initialState,
                reducer: reducer,
                dispatch: null
            };

            // Create dispatch function (stable reference)
            hook.dispatch = function dispatch(action) {
                var currentHook = componentStateStore[compId][hookIdx];
                var newState = currentHook.reducer(currentHook.state, action);

                // Only trigger re-render if state actually changed
                if (newState !== currentHook.state) {
                    currentHook.state = newState;
                    scheduleRender();
                }
            };
        }

        // Update reducer reference (in case it changed)
        hook.reducer = reducer;

        return [hook.state, hook.dispatch];
    }

    // ===================================================================
    // forwardRef Implementation
    // ===================================================================

    /**
     * Allows components to forward refs to child elements.
     * @param {Function} render - Component that receives (props, ref)
     * @returns {Object} ForwardRef component
     */
    function forwardRef(render) {
        if (typeof render !== 'function') {
            throw new Error('forwardRef requires a render function');
        }

        var ForwardRefComponent = function (props) {
            var ref = props.ref || null;
            // Create new props without ref
            var propsWithoutRef = {};
            for (var key in props) {
                if (key !== 'ref' && props.hasOwnProperty(key)) {
                    propsWithoutRef[key] = props[key];
                }
            }
            return render(propsWithoutRef, ref);
        };

        ForwardRefComponent.displayName = render.displayName || render.name || 'ForwardRef';
        ForwardRefComponent.$$typeof = Symbol.for('react.forward_ref');
        ForwardRefComponent._render = render;

        return ForwardRefComponent;
    }

    /**
     * Hook to expose imperative methods to parent via ref.
     * @param {Object} ref - The ref from forwardRef
     * @param {Function} createHandle - Function returning methods to expose
     * @param {Array} deps - Dependencies array
     */
    function useImperativeHandle(ref, createHandle, deps) {
        if (!currentRenderingComponent) {
            throw new Error('useImperativeHandle must be called inside a component');
        }

        // Use useEffect-like behavior to set the handle
        useEffect(function () {
            if (ref) {
                var handle = createHandle();
                if (typeof ref === 'function') {
                    ref(handle);
                } else if (ref && typeof ref === 'object') {
                    ref.current = handle;
                }
            }

            return function () {
                if (ref) {
                    if (typeof ref === 'function') {
                        ref(null);
                    } else if (ref && typeof ref === 'object') {
                        ref.current = null;
                    }
                }
            };
        }, deps);
    }

    // ===================================================================
    // React.memo Implementation
    // ===================================================================

    /**
     * Memoizes a component to prevent unnecessary re-renders.
     * @param {Function} Component - The component to memoize
     * @param {Function} [areEqual] - Custom comparison function (prevProps, nextProps) => boolean
     * @returns {Function} Memoized component
     */
    function memo(Component, areEqual) {
        if (typeof Component !== 'function') {
            throw new Error('memo requires a component function');
        }

        var compare = areEqual || shallowEqual;

        var MemoizedComponent = function (props) {
            var compId = currentRenderingComponent;
            var hookIdx = currentHookIndex++;

            if (!componentStateStore[compId]) {
                componentStateStore[compId] = [];
            }

            var hook = componentStateStore[compId][hookIdx];

            if (!hook) {
                // First render
                hook = componentStateStore[compId][hookIdx] = {
                    prevProps: props,
                    prevResult: null,
                    initialized: false
                };
            }

            // Check if props changed
            var shouldUpdate = !hook.initialized || !compare(hook.prevProps, props);

            if (shouldUpdate) {
                debugLog('memo: re-rendering', Component.displayName || Component.name);
                hook.prevProps = props;
                hook.prevResult = Component(props);
                hook.initialized = true;
            } else {
                debugLog('memo: using cached result for', Component.displayName || Component.name);
            }

            return hook.prevResult;
        };

        MemoizedComponent.displayName = 'Memo(' + (Component.displayName || Component.name || 'Component') + ')';
        MemoizedComponent.$$typeof = Symbol.for('react.memo');
        MemoizedComponent._innerComponent = Component;

        return MemoizedComponent;
    }

    // ===================================================================
    // createPortal Implementation
    // ===================================================================

    /**
     * Renders children into a different DOM node.
     * @param {*} children - The React elements to render
     * @param {HTMLElement} container - The DOM element to render into
     * @param {string} [key] - Optional key for the portal
     * @returns {Object} Portal object
     */
    function createPortal(children, container, key) {
        if (!container || !container.nodeType) {
            throw new Error('createPortal requires a valid DOM element as container');
        }

        var portal = {
            $$typeof: Symbol.for('react.portal'),
            key: key != null ? String(key) : null,
            children: children,
            containerInfo: container,
            _container: container
        };

        // Register portal for rendering
        portalRegistry.push(portal);

        return portal;
    }

    /**
     * Internal: Render all registered portals
     */
    function renderPortals() {
        portalRegistry.forEach(function (portal) {
            if (portal.children && portal._container) {
                try {
                    var dom = renderVNode(portal.children);
                    if (dom) {
                        portal._container.innerHTML = '';
                        portal._container.appendChild(dom);
                    }
                } catch (err) {
                    console.error('Portal render error:', err);
                }
            }
        });
        // Clear for next render cycle
        portalRegistry = [];
    }

    // ===================================================================
    // useLayoutEffect Hook
    // ===================================================================

    /**
     * Like useEffect but fires synchronously after DOM mutations.
     * @param {Function} callback - Effect callback
     * @param {Array} deps - Dependencies
     */
    function useLayoutEffect(callback, deps) {
        if (!currentRenderingComponent) {
            throw new Error('useLayoutEffect must be called inside a component');
        }

        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;

        if (!componentStateStore[compId]) {
            componentStateStore[compId] = [];
        }

        var hook = componentStateStore[compId][hookIdx];
        if (!hook) {
            hook = componentStateStore[compId][hookIdx] = { deps: null, cleanup: null };
        }

        var depsChanged = !hook.deps || !deps ||
            hook.deps.length !== deps.length ||
            hook.deps.some(function (dep, i) { return dep !== deps[i]; });

        if (depsChanged) {
            layoutEffectQueue.push(function () {
                if (hook.cleanup) hook.cleanup();
                hook.cleanup = callback();
            });
            hook.deps = deps ? deps.slice() : null;
        }
    }

    // ===================================================================
    // useDebugValue Hook
    // ===================================================================

    /**
     * Displays a label in React DevTools (no-op in production).
     * @param {*} value - Value to display
     * @param {Function} [format] - Optional formatting function
     */
    function useDebugValue(value, format) {
        if (debugEnabled) {
            var displayValue = format ? format(value) : value;
            debugLog('useDebugValue:', displayValue);
        }
    }

    // ===================================================================
    // Core Hooks (Enhanced)
    // ===================================================================

    function createElement(type, props) {
        var children = [];
        for (var i = 2; i < arguments.length; i++) children.push(arguments[i]);

        var flatChildren = [];
        function flatten(arr) {
            for (var j = 0; j < arr.length; j++) {
                if (Array.isArray(arr[j])) flatten(arr[j]);
                else if (arr[j] != null && arr[j] !== false && arr[j] !== true) flatChildren.push(arr[j]);
            }
        }
        flatten(children);

        // Handle Portal
        if (type && type.$$typeof === Symbol.for('react.portal')) {
            return type;
        }

        if (typeof type === 'function') {
            var cp = props || {};
            cp.children = flatChildren.length === 1 ? flatChildren[0] : flatChildren;

            var compId = (type.displayName || type.name || 'Component') + ':' + componentRenderIndex;
            componentRenderIndex += 1;

            var prevComponent = currentRenderingComponent;
            var prevHookIndex = currentHookIndex;

            currentRenderingComponent = compId;
            currentHookIndex = 0;

            var result;
            try {
                result = type(cp);
            } catch (err) {
                console.error('Component render error:', type.displayName || type.name, err);
                result = null;
            }

            debugLog('rendered component', compId, 'hookCount', currentHookIndex, 'result', result);

            currentRenderingComponent = prevComponent;
            currentHookIndex = prevHookIndex;

            return result;
        }

        var mishkahProps = { attrs: {} };
        var hasEvents = false;
        var eventHandlers = {};

        if (props) {
            for (var key in props) {
                if (!props.hasOwnProperty(key)) continue;
                var value = props[key];

                // Handle ref
                if (key === 'ref') {
                    mishkahProps._ref = value;
                    continue;
                }

                // Handle key
                if (key === 'key') {
                    mishkahProps.key = value;
                    continue;
                }

                // Handle dangerouslySetInnerHTML
                if (key === 'dangerouslySetInnerHTML') {
                    if (value && value.__html != null) {
                        mishkahProps.attrs._innerHTML = value.__html;
                    }
                    continue;
                }

                if (key.indexOf('on') === 0 && typeof value === 'function') {
                    // Extract event name (onClick -> click)
                    var eventName = key.substring(2).toLowerCase();
                    eventHandlers[eventName] = value;
                    hasEvents = true;
                } else if (key === 'className') {
                    mishkahProps.attrs['class'] = value;
                } else if (key === 'htmlFor') {
                    mishkahProps.attrs['for'] = value;
                } else if (key === 'style' && typeof value === 'object') {
                    // Convert style object to string or keep as object
                    mishkahProps.attrs.style = value;
                } else {
                    mishkahProps.attrs[key] = value;
                }
            }
        }

        // If has events, add gkey and register in global scope
        if (hasEvents) {
            var gkey = 'react:event:' + (gkeyCounter++);
            mishkahProps.attrs['gkey'] = gkey;

            // Store handlers for later attachment
            if (!mishkahProps._reactEvents) mishkahProps._reactEvents = {};
            for (var evName in eventHandlers) {
                mishkahProps._reactEvents[evName] = eventHandlers[evName];
            }
        }

        var vnode = M.h(type, 'Auto', mishkahProps, flatChildren);

        // Attach events and ref after VDOM creation
        if (hasEvents && mishkahProps._reactEvents) {
            vnode._reactEvents = mishkahProps._reactEvents;
        }
        if (mishkahProps._ref) {
            vnode._ref = mishkahProps._ref;
        }

        return vnode;
    }

    function Fragment(props) {
        return (props && props.children) || [];
    }

    function useState(initialValue) {
        if (!currentRenderingComponent) throw new Error('useState must be called inside a component');
        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;
        if (!componentStateStore[compId]) componentStateStore[compId] = [];

        if (componentStateStore[compId][hookIdx] === undefined) {
            // Support lazy initialization
            var initial = typeof initialValue === 'function' ? initialValue() : initialValue;
            componentStateStore[compId][hookIdx] = initial;
        }

        var value = componentStateStore[compId][hookIdx];

        // Create stable setter reference
        var setter = (function (cId, hIdx) {
            return function setValue(newValue) {
                var current = componentStateStore[cId][hIdx];
                var next = typeof newValue === 'function' ? newValue(current) : newValue;
                if (next !== current) {
                    componentStateStore[cId][hIdx] = next;
                    scheduleRender();
                }
            };
        })(compId, hookIdx);

        return [value, setter];
    }

    function useEffect(callback, deps) {
        if (!currentRenderingComponent) throw new Error('useEffect must be called inside a component');
        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;
        if (!componentStateStore[compId]) componentStateStore[compId] = [];
        var hook = componentStateStore[compId][hookIdx];
        if (!hook) hook = componentStateStore[compId][hookIdx] = { deps: null, cleanup: null };

        var depsChanged = !hook.deps || !deps ||
            hook.deps.length !== deps.length ||
            hook.deps.some(function (dep, i) { return dep !== deps[i]; });

        if (depsChanged) {
            effectQueue.push(function () {
                if (hook.cleanup) {
                    try { hook.cleanup(); } catch (e) { console.error('Effect cleanup error:', e); }
                }
                try {
                    hook.cleanup = callback();
                } catch (e) {
                    console.error('Effect error:', e);
                }
            });
            hook.deps = deps ? deps.slice() : null;
        }
    }

    function useMemo(factory, deps) {
        if (!currentRenderingComponent) throw new Error('useMemo must be called inside a component');
        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;
        if (!componentStateStore[compId]) componentStateStore[compId] = [];
        var hook = componentStateStore[compId][hookIdx];
        var depsChanged = !hook || !deps || !hook.deps ||
            hook.deps.length !== deps.length ||
            hook.deps.some(function (dep, i) { return dep !== deps[i]; });

        if (!hook || depsChanged) {
            var value = factory();
            componentStateStore[compId][hookIdx] = { value: value, deps: deps ? deps.slice() : null };
            return value;
        }

        return hook.value;
    }

    function useRef(initialValue) {
        if (!currentRenderingComponent) throw new Error('useRef must be called inside a component');
        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;
        if (!componentStateStore[compId]) componentStateStore[compId] = [];

        if (!componentStateStore[compId][hookIdx]) {
            componentStateStore[compId][hookIdx] = { current: initialValue };
        }

        return componentStateStore[compId][hookIdx];
    }

    function useCallback(fn, deps) {
        return useMemo(function () { return fn; }, deps);
    }

    // ===================================================================
    // Render Functions
    // ===================================================================

    function renderVNode(vnode) {
        if (vnode === null || vnode === undefined || vnode === false || vnode === true) {
            return null;
        }

        if (typeof vnode === 'string' || typeof vnode === 'number') {
            return global.document.createTextNode(String(vnode));
        }

        // Handle Portal
        if (vnode && vnode.$$typeof === Symbol.for('react.portal')) {
            // Portal rendering is deferred
            portalRegistry.push(vnode);
            return global.document.createComment('portal');
        }

        if (Array.isArray(vnode)) {
            var frag = global.document.createDocumentFragment();
            for (var i = 0; i < vnode.length; i++) {
                var childDom = renderVNode(vnode[i]);
                if (childDom) frag.appendChild(childDom);
            }
            return frag;
        }

        var dom = M.VDOM.render(vnode, {});
        attachEvents(dom, vnode);
        attachRef(dom, vnode);
        return dom;
    }

    function attachEvents(dom, vnode) {
        if (vnode && vnode._reactEvents && dom) {
            for (var eventName in vnode._reactEvents) {
                (function (handler, evName) {
                    dom.addEventListener(evName, handler);
                })(vnode._reactEvents[eventName], eventName);
            }
        }

        // Recurse children
        if (vnode && vnode.children && dom && dom.childNodes) {
            for (var i = 0; i < vnode.children.length && i < dom.childNodes.length; i++) {
                attachEvents(dom.childNodes[i], vnode.children[i]);
            }
        }
    }

    function attachRef(dom, vnode) {
        if (vnode && vnode._ref && dom) {
            if (typeof vnode._ref === 'function') {
                vnode._ref(dom);
            } else if (typeof vnode._ref === 'object') {
                vnode._ref.current = dom;
            }
        }

        // Recurse children
        if (vnode && vnode.children && dom && dom.childNodes) {
            for (var i = 0; i < vnode.children.length && i < dom.childNodes.length; i++) {
                attachRef(dom.childNodes[i], vnode.children[i]);
            }
        }
    }

    function renderSafe(Component) {
        try {
            return Component({});
        } catch (err) {
            console.error('Mishkah.React render error:', err);
            return null;
        }
    }

    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;

        // Use microtask for batching
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(function () {
                renderScheduled = false;
                triggerRender();
            });
        } else {
            Promise.resolve().then(function () {
                renderScheduled = false;
                triggerRender();
            });
        }
    }

    function render(Component, container) {
        debugEnabled = !!(global && global.MishkahReactDebug);
        rootComponentRef = Component;
        rootContainerRef = container;
        triggerRender();
    }

    function triggerRender() {
        if (!rootComponentRef || !rootContainerRef) return;

        componentRenderIndex = 0;
        currentRenderingComponent = 'root';
        currentHookIndex = 0;
        effectQueue = [];
        layoutEffectQueue = [];
        portalRegistry = [];

        var vnode = renderSafe(rootComponentRef);
        if (vnode === null) {
            console.error('Mishkah.React: root render produced null vnode.');
            return;
        }

        var dom = null;
        try {
            dom = renderVNode(vnode);
        } catch (err) {
            console.error('Mishkah.React renderVNode error:', err, vnode);
            return;
        }

        if (!dom) {
            console.error('Mishkah.React: renderVNode returned null/undefined DOM for vnode:', vnode);
            return;
        }

        rootContainerRef.innerHTML = '';
        rootContainerRef.appendChild(dom);


        // Run layout effects synchronously
        while (layoutEffectQueue.length) {
            var layoutFn = layoutEffectQueue.shift();
            try { layoutFn(); } catch (e) { console.error('Layout effect error:', e); }
        }

        // Render portals
        renderPortals();

        // Run queued effects after DOM paint
        setTimeout(function () {
            var pending = effectQueue;
            effectQueue = [];
            while (pending.length) {
                var fn = pending.shift();
                try { fn(); } catch (e) { console.error('Effect error:', e); }
            }
        }, 0);
    }

    // ===================================================================
    // Additional React Utilities
    // ===================================================================

    /**
     * Children utilities (simplified)
     */
    var Children = {
        map: function (children, fn) {
            if (children == null) return [];
            var arr = Array.isArray(children) ? children : [children];
            return arr.map(fn);
        },
        forEach: function (children, fn) {
            if (children == null) return;
            var arr = Array.isArray(children) ? children : [children];
            arr.forEach(fn);
        },
        count: function (children) {
            if (children == null) return 0;
            return Array.isArray(children) ? children.length : 1;
        },
        only: function (children) {
            if (Array.isArray(children) && children.length === 1) return children[0];
            if (!Array.isArray(children) && children != null) return children;
            throw new Error('React.Children.only expected to receive a single React element child.');
        },
        toArray: function (children) {
            if (children == null) return [];
            return Array.isArray(children) ? children.slice() : [children];
        }
    };

    /**
     * Check if value is a valid React element
     */
    function isValidElement(object) {
        return (
            typeof object === 'object' &&
            object !== null &&
            (object._type === 'element' || object.tag != null || object.$$typeof != null)
        );
    }

    /**
     * Clone an element with new props
     */
    function cloneElement(element, props) {
        if (!isValidElement(element)) {
            throw new Error('cloneElement requires a valid React element');
        }

        var newProps = {};
        // Copy original props
        if (element.props) {
            for (var key in element.props) {
                newProps[key] = element.props[key];
            }
        }
        // Merge new props
        if (props) {
            for (var key in props) {
                if (key !== 'children') {
                    newProps[key] = props[key];
                }
            }
        }

        // Handle children
        var children = props && props.children != null
            ? props.children
            : (element.props && element.props.children);

        return createElement(element.tag || element.type, newProps, children);
    }

    // ===================================================================
    // MISHKAH INTEGRATION: Design Tokens, Theming, i18n, State, UI
    // ===================================================================

    // -------------------------------------------------------------------
    // Design Tokens
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Contexts
    // -------------------------------------------------------------------
    var ThemeContext = createContext({ theme: 'dark', tokens: tokens, setTheme: function () { } });
    var I18nContext = createContext({ lang: 'ar', dir: 'rtl', dict: {}, t: function (k) { return k; }, setLang: function () { } });
    var DatabaseContext = createContext({ data: {}, env: {}, getState: function () { }, setState: function () { } });


    // -------------------------------------------------------------------
    // Hooks
    // -------------------------------------------------------------------
    function useTheme() {
        return useContext(ThemeContext);
    }

    function useI18n() {
        return useContext(I18nContext);
    }

    function useDatabase() {
        return useContext(DatabaseContext);
    }

    function useDirection() {
        var i18n = useI18n();
        return i18n.dir || 'ltr';
    }

    // Translation function factory
    function createT(dict, lang) {
        return function t(key, fallback) {
            if (!dict || !dict[key]) return fallback || key;
            return dict[key][lang] || dict[key].ar || dict[key].en || fallback || key;
        };
    }

    // -------------------------------------------------------------------
    // initMishkah - Pre-register contexts BEFORE render starts
    // MUST be called before Mishkah.React.render()
    // -------------------------------------------------------------------
    var _globalDatabase = null;
    var STORAGE_KEY = 'mishkah_env';

    // Helper: Load env from localStorage
    function loadEnvFromStorage() {
        try {
            if (typeof localStorage !== 'undefined') {
                var saved = localStorage.getItem(STORAGE_KEY);
                if (saved) return JSON.parse(saved);
            }
        } catch (e) { }
        return null;
    }

    // Helper: Save env to localStorage
    function saveEnvToStorage(env) {
        try {
            if (typeof localStorage !== 'undefined' && env) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    theme: env.theme,
                    lang: env.lang,
                    dir: env.dir
                }));
            }
        } catch (e) { }
    }

    function initMishkah(database) {
        _globalDatabase = database || {};

        // Load persisted env from localStorage (first init only)
        var savedEnv = loadEnvFromStorage();
        if (savedEnv && _globalDatabase.env) {
            // Merge saved values into database
            if (savedEnv.theme) _globalDatabase.env.theme = savedEnv.theme;
            if (savedEnv.lang) _globalDatabase.env.lang = savedEnv.lang;
            if (savedEnv.dir) _globalDatabase.env.dir = savedEnv.dir;
        }

        var env = _globalDatabase.env || {};
        var i18nDict = (_globalDatabase.i18n && _globalDatabase.i18n.dict) || {};
        var theme = env.theme || 'dark';
        var lang = env.lang || 'ar';
        var dir = env.dir || (lang === 'ar' ? 'rtl' : 'ltr');

        // Create translation function
        var t = createT(i18nDict, lang);

        // Pre-register ThemeContext with localStorage save
        contextRegistry.set(ThemeContext._id, {
            theme: theme,
            tokens: tokens,
            setTheme: function (newTheme) {
                if (_globalDatabase.env) {
                    _globalDatabase.env.theme = newTheme;
                    saveEnvToStorage(_globalDatabase.env);
                }
                scheduleRender();
            }
        });

        // Pre-register I18nContext with localStorage save
        contextRegistry.set(I18nContext._id, {
            lang: lang,
            dir: dir,
            dict: i18nDict,
            t: t,
            setLang: function (newLang) {
                if (_globalDatabase.env) {
                    _globalDatabase.env.lang = newLang;
                    _globalDatabase.env.dir = newLang === 'ar' ? 'rtl' : 'ltr';
                    saveEnvToStorage(_globalDatabase.env);
                }
                scheduleRender();
            }
        });

        // Pre-register DatabaseContext
        contextRegistry.set(DatabaseContext._id, {
            data: _globalDatabase.data || {},
            env: env,
            i18n: _globalDatabase.i18n,
            getState: function () { return _globalDatabase; },
            setState: function (updater) {
                if (typeof updater === 'function') {
                    _globalDatabase = updater(_globalDatabase);
                } else {
                    for (var k in updater) _globalDatabase[k] = updater[k];
                }
                if (_globalDatabase.env) saveEnvToStorage(_globalDatabase.env);
                scheduleRender();
            }
        });

        // Apply to document
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.setAttribute('dir', dir);
            document.documentElement.setAttribute('lang', lang);
        }

        return { database: _globalDatabase, t: t };
    }

    // ===================================================================
    // Global Toggle Functions (Mishkah Core Pattern)
    // ===================================================================
    // These work exactly like playground/app.js toggles:
    // 1. Update _globalDatabase
    // 2. Save to localStorage
    // 3. Apply to document
    // 4. Call scheduleRender() to trigger full re-render

    function toggleTheme() {
        if (!_globalDatabase || !_globalDatabase.env) return;
        var currentTheme = _globalDatabase.env.theme || 'dark';
        var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        console.log('🔘 toggleTheme:', currentTheme, '->', newTheme);

        _globalDatabase.env.theme = newTheme;
        saveEnvToStorage(_globalDatabase.env);

        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', newTheme);
        }

        scheduleRender();
    }

    function toggleLang() {
        if (!_globalDatabase || !_globalDatabase.env) return;
        var currentLang = _globalDatabase.env.lang || 'ar';
        var newLang = currentLang === 'ar' ? 'en' : 'ar';
        var newDir = newLang === 'ar' ? 'rtl' : 'ltr';
        console.log('🔘 toggleLang:', currentLang, '->', newLang);

        _globalDatabase.env.lang = newLang;
        _globalDatabase.env.dir = newDir;
        saveEnvToStorage(_globalDatabase.env);

        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('dir', newDir);
            document.documentElement.setAttribute('lang', newLang);
        }

        scheduleRender();
    }


    // MishkahProvider - Main Provider
    // -------------------------------------------------------------------
    function MishkahProvider(props) {
        console.log('🔵 MishkahProvider RENDER START');

        // Use global database if initialized, otherwise use props
        if (!_globalDatabase && props.database) {
            console.log('⚠️ Initializing _globalDatabase from props');
            initMishkah(props.database);
        }

        // Force re-render trigger
        var forceUpdate = useState(0)[1];

        // Get current values from global database
        var db = _globalDatabase || props.database || {};
        var env = db.env || {};
        var i18nDict = (db.i18n && db.i18n.dict) || {};
        var theme = env.theme || 'dark';
        var lang = env.lang || 'ar';
        var dir = env.dir || (lang === 'ar' ? 'rtl' : 'ltr');

        console.log('📊 Current state:', { theme, lang, dir });

        // Translation function
        var t = createT(i18nDict, lang);

        // Theme context value with proper setTheme
        var themeValue = {
            theme: theme,
            tokens: tokens,
            setTheme: function (newTheme) {
                var currentTheme = _globalDatabase && _globalDatabase.env ? _globalDatabase.env.theme : 'dark';
                console.log('🎨 setTheme called:', { current: currentTheme, new: newTheme });
                if (currentTheme === newTheme) {
                    console.log('⚠️ Already', newTheme, '- skipping');
                    return;
                }
                if (_globalDatabase && _globalDatabase.env) {
                    _globalDatabase.env.theme = newTheme;
                    saveEnvToStorage(_globalDatabase.env);
                    console.log('✅ Theme updated');
                }
                console.log('🔄 Calling forceUpdate...');
                forceUpdate(function (n) { return n + 1; });
            }
        };

        // i18n context value with proper setLang
        var i18nValue = {
            lang: lang,
            dir: dir,
            dict: i18nDict,
            t: t,
            setLang: function (newLang) {
                var currentLang = _globalDatabase && _globalDatabase.env ? _globalDatabase.env.lang : 'ar';
                console.log('🌐 setLang called:', { current: currentLang, new: newLang });
                if (currentLang === newLang) {
                    console.log('⚠️ Already', newLang, '- skipping');
                    return;
                }
                console.log('📍 Before:', _globalDatabase.env);
                if (_globalDatabase && _globalDatabase.env) {
                    _globalDatabase.env.lang = newLang;
                    _globalDatabase.env.dir = newLang === 'ar' ? 'rtl' : 'ltr';
                    saveEnvToStorage(_globalDatabase.env);
                    console.log('✅ After:', _globalDatabase.env);
                }
                console.log('🔄 Calling forceUpdate...');
                forceUpdate(function (n) {
                    console.log('🔄 forceUpdate:', n, '->', n + 1);
                    return n + 1;
                });
            }
        };

        // Database context value
        var dbValue = {
            data: db.data || {},
            env: env,
            i18n: db.i18n,
            getState: function () { return _globalDatabase || db; },
            setState: function (updater) {
                if (typeof updater === 'function') {
                    _globalDatabase = updater(_globalDatabase || db);
                } else {
                    for (var k in updater) {
                        if (_globalDatabase) _globalDatabase[k] = updater[k];
                    }
                }
                if (_globalDatabase && _globalDatabase.env) saveEnvToStorage(_globalDatabase.env);
                forceUpdate(function (n) { return n + 1; });
            }
        };

        console.log('📝 Registering contexts with:', {
            theme: themeValue.theme,
            lang: i18nValue.lang,
            dir: i18nValue.dir
        });

        // Update context registrations
        contextRegistry.set(ThemeContext._id, themeValue);
        contextRegistry.set(I18nContext._id, i18nValue);
        contextRegistry.set(DatabaseContext._id, dbValue);

        // Apply theme to document
        useEffect(function () {
            console.log('🎯 useEffect applying to document:', { theme, dir, lang });
            if (typeof document !== 'undefined') {
                document.documentElement.setAttribute('data-theme', theme);
                document.documentElement.setAttribute('dir', dir);
                document.documentElement.setAttribute('lang', lang);
            }
        }, [theme, dir, lang]);

        console.log('🔵 MishkahProvider RENDER END');

        return props.children;
    }


    // -------------------------------------------------------------------
    // UI Components
    // -------------------------------------------------------------------

    // Merge styles helper
    function sx() {
        var result = {};
        for (var i = 0; i < arguments.length; i++) {
            var obj = arguments[i];
            if (obj) for (var k in obj) result[k] = obj[k];
        }
        return result;
    }

    // Card
    function Card(props) {
        var th = useTheme();
        var dir = useDirection();
        var t = th.tokens;

        var cardStyle = {
            borderRadius: t.radius.md,
            border: '1px solid ' + t.colors.border,
            background: t.colors.card,
            color: t.colors.cardForeground,
            boxShadow: t.shadows.md,
            direction: dir
        };

        var headerStyle = { display: 'flex', flexDirection: 'column', gap: '6px', padding: t.spacing.lg };
        var titleStyle = { fontSize: '18px', fontWeight: '600', margin: 0 };
        var descStyle = { fontSize: '14px', color: t.colors.muted, margin: 0 };
        var contentStyle = { padding: '0 ' + t.spacing.lg + ' ' + t.spacing.lg };

        var header = null;
        if (props.title || props.description) {
            header = createElement('div', { style: headerStyle, key: 'h' }, [
                props.title && createElement('h3', { style: titleStyle, key: 't' }, props.title),
                props.description && createElement('p', { style: descStyle, key: 'd' }, props.description)
            ].filter(Boolean));
        }

        var content = props.children ? createElement('div', { style: contentStyle, key: 'c' }, props.children) : null;

        return createElement('section', { style: sx(cardStyle, props.style), className: props.className },
            [header, content].filter(Boolean)
        );
    }

    // Button
    function Button(props) {
        var th = useTheme();
        var t = th.tokens;
        var variant = props.variant || 'soft';

        var baseStyle = {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm,
            padding: t.spacing.sm + ' ' + t.spacing.md,
            borderRadius: t.radius.md, fontSize: '14px', fontWeight: '500',
            border: 'none', cursor: 'pointer', transition: 'all 0.15s ease', outline: 'none'
        };

        var variants = {
            solid: { background: t.colors.primary, color: t.colors.primaryForeground },
            soft: { background: t.colors.accent, color: t.colors.foreground },
            ghost: { background: 'transparent', color: t.colors.foreground },
            destructive: { background: t.colors.destructive, color: '#fff' }
        };

        return createElement('button', {
            style: sx(baseStyle, variants[variant] || variants.soft, props.style),
            className: props.className,
            onClick: props.onClick,
            disabled: props.disabled,
            type: props.type || 'button'
        }, props.children);
    }

    // Input
    function Input(props) {
        var th = useTheme();
        var t = th.tokens;
        var dir = useDirection();

        var style = {
            width: '100%', height: '40px', padding: '8px 12px', fontSize: '14px',
            borderRadius: t.radius.md, border: '1px solid ' + t.colors.input,
            background: t.colors.background, color: t.colors.foreground,
            outline: 'none', direction: dir
        };

        return createElement('input', {
            style: sx(style, props.style),
            type: props.type || 'text',
            placeholder: props.placeholder,
            value: props.value,
            onChange: props.onChange,
            disabled: props.disabled,
            name: props.name, id: props.id
        });
    }

    // HStack
    function HStack(props) {
        var th = useTheme();
        var style = { display: 'flex', alignItems: 'center', gap: th.tokens.spacing.sm, flexWrap: 'wrap' };
        return createElement('div', { style: sx(style, props.style), className: props.className }, props.children);
    }

    // VStack
    function VStack(props) {
        var th = useTheme();
        var style = { display: 'flex', flexDirection: 'column', gap: th.tokens.spacing.sm };
        return createElement('div', { style: sx(style, props.style), className: props.className }, props.children);
    }

    // Divider
    function Divider(props) {
        var th = useTheme();
        var style = { height: '1px', background: th.tokens.colors.border, margin: th.tokens.spacing.sm + ' 0' };
        return createElement('div', { style: sx(style, props.style) });
    }

    // Alert
    function Alert(props) {
        var th = useTheme();
        var type = props.type || 'info';
        var types = {
            info: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', color: '#60a5fa' },
            success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', color: '#34d399' },
            warning: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', color: '#fbbf24' },
            error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#f87171' }
        };
        var s = types[type] || types.info;

        var style = {
            padding: th.tokens.spacing.md, borderRadius: th.tokens.radius.md,
            background: s.bg, border: '1px solid ' + s.border, color: s.color
        };

        return createElement('div', { style: sx(style, props.style), role: 'alert' }, props.children);
    }

    // Badge
    function Badge(props) {
        var th = useTheme();
        var style = {
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '4px 10px', borderRadius: th.tokens.radius.full,
            fontSize: '12px', fontWeight: '500',
            background: th.tokens.colors.accent, color: th.tokens.colors.foreground
        };
        return createElement('span', { style: sx(style, props.style), className: props.className }, props.children);
    }

    // Spinner
    function Spinner(props) {
        var size = props.size || 24;
        var th = useTheme();
        var style = {
            width: size + 'px', height: size + 'px',
            border: '3px solid ' + th.tokens.colors.border,
            borderTopColor: th.tokens.colors.primary,
            borderRadius: '50%',
            animation: 'mishkahSpin 0.8s linear infinite'
        };
        return createElement('div', { style: style });
    }

    // Progress
    function Progress(props) {
        var th = useTheme();
        var value = Math.min(100, Math.max(0, props.value || 0));
        var trackStyle = {
            width: '100%', height: '8px',
            background: th.tokens.colors.border, borderRadius: th.tokens.radius.full, overflow: 'hidden'
        };
        var barStyle = {
            width: value + '%', height: '100%',
            background: th.tokens.colors.primary, borderRadius: th.tokens.radius.full,
            transition: 'width 0.3s ease'
        };
        return createElement('div', { style: sx(trackStyle, props.style) },
            createElement('div', { style: barStyle })
        );
    }

    // Inject CSS animations
    if (typeof document !== 'undefined') {
        var cssId = 'mishkah-react-css';
        if (!document.getElementById(cssId)) {
            var css = document.createElement('style');
            css.id = cssId;
            css.textContent = '@keyframes mishkahSpin { to { transform: rotate(360deg); } }';
            document.head.appendChild(css);
        }
    }

    // UI Components object
    var UI = {
        Card: Card, Button: Button, Input: Input,
        HStack: HStack, VStack: VStack, Divider: Divider,
        Alert: Alert, Badge: Badge, Spinner: Spinner, Progress: Progress
    };

    // Register globals
    if (typeof global !== 'undefined') {
        for (var uiName in UI) {
            if (!global[uiName]) global[uiName] = UI[uiName];
        }
        if (!global.t) {
            global.t = function (key) {
                var ctx = contextRegistry.get(I18nContext._id);
                return ctx && ctx.t ? ctx.t(key) : key;
            };
        }
    }

    // ===================================================================
    // Export API
    // ===================================================================

    var ReactAPI = {
        // Core
        createElement: createElement,
        Fragment: Fragment,
        render: render,
        h: createElement,

        // Hooks - React
        useState: useState,
        useEffect: useEffect,
        useMemo: useMemo,
        useRef: useRef,
        useCallback: useCallback,
        useReducer: useReducer,
        useContext: useContext,
        useLayoutEffect: useLayoutEffect,
        useImperativeHandle: useImperativeHandle,
        useDebugValue: useDebugValue,

        // Hooks - Mishkah
        useTheme: useTheme,
        useI18n: useI18n,
        useDatabase: useDatabase,
        useDirection: useDirection,

        // Context
        createContext: createContext,
        ThemeContext: ThemeContext,
        I18nContext: I18nContext,
        DatabaseContext: DatabaseContext,

        // Mishkah Provider
        MishkahProvider: MishkahProvider,
        initMishkah: initMishkah,

        // Global Toggle Functions (Mishkah Core Pattern)
        toggleTheme: toggleTheme,
        toggleLang: toggleLang,

        // Advanced
        forwardRef: forwardRef,
        memo: memo,
        createPortal: createPortal,

        // Utilities
        Children: Children,
        isValidElement: isValidElement,
        cloneElement: cloneElement,

        // Design System
        tokens: tokens,
        UI: UI,

        // Version info
        version: '3.0.0-mishkah'
    };


    // Create global React/ReactDOM aliases for compatibility
    if (typeof global !== 'undefined') {
        // React alias
        if (!global.React) {
            global.React = ReactAPI;
        }

        // ReactDOM alias
        if (!global.ReactDOM) {
            global.ReactDOM = {
                render: render,
                createPortal: createPortal,
                findDOMNode: function (component) {
                    warnOnce('findDOMNode', 'findDOMNode is deprecated. Use refs instead.');
                    return null;
                },
                unmountComponentAtNode: function (container) {
                    if (container) {
                        container.innerHTML = '';
                    }
                    return true;
                }
            };
        }
    }

    return ReactAPI;
}));
