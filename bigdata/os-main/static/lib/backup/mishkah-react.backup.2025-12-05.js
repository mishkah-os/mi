/*! mishkah-react.js */
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

    var componentStateStore = {};
    var effectQueue = [];
    var currentRenderingComponent = null;
    var currentHookIndex = 0;
    var componentRenderIndex = 0;
    var rootComponentRef = null;
    var rootContainerRef = null;
    var gkeyCounter = 0;

    var debugEnabled = false;

    function debugLog() {
        if (!debugEnabled) return;
        try {
            var args = Array.prototype.slice.call(arguments);
            console.log.apply(console, ['[Mishkah.React]'].concat(args));
        } catch (_) { }
    }

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

        if (typeof type === 'function') {
            var cp = props || {};
            cp.children = flatChildren;

            var compId = (type.displayName || type.name || 'Component') + ':' + componentRenderIndex;
            componentRenderIndex += 1;

            var prevComponent = currentRenderingComponent;
            var prevHookIndex = currentHookIndex;

            currentRenderingComponent = compId;
            currentHookIndex = 0;

            var result = type(cp);

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
                
                if (key.indexOf('on') === 0 && typeof value === 'function') {
                    // Extract event name (onClick -> click)
                    var eventName = key.substring(2).toLowerCase();
                    eventHandlers[eventName] = value;
                    hasEvents = true;
                } else if (key === 'className') {
                    mishkahProps.attrs['class'] = value;
                } else {
                    mishkahProps.attrs[key] = value;
                }
            }
        }

        // If has events, add gkey and register in global scope
        if (hasEvents) {
            var gkey = 'react:event:' + (gkeyCounter++);
            mishkahProps.attrs['gkey'] = gkey;
            
            // Add event listeners directly to DOM element after render
            // Store handlers for later attachment
            if (!mishkahProps._reactEvents) mishkahProps._reactEvents = {};
            for (var evName in eventHandlers) {
                mishkahProps._reactEvents[evName] = eventHandlers[evName];
            }
        }

        var vnode = M.h(type, 'Auto', mishkahProps, flatChildren);
        
        // Attach events after VDOM creation
        if (hasEvents && mishkahProps._reactEvents) {
            vnode._reactEvents = mishkahProps._reactEvents;
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
        if (componentStateStore[compId][hookIdx] === undefined) componentStateStore[compId][hookIdx] = initialValue;
        var value = componentStateStore[compId][hookIdx];
        var setValue = function(newValue) {
            componentStateStore[compId][hookIdx] = typeof newValue === 'function' ? newValue(componentStateStore[compId][hookIdx]) : newValue;
            triggerRender();
        };
        return [value, setValue];
    }

    function useEffect(callback, deps) {
        if (!currentRenderingComponent) throw new Error('useEffect must be called inside a component');
        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;
        if (!componentStateStore[compId]) componentStateStore[compId] = [];
        var hook = componentStateStore[compId][hookIdx];
        if (!hook) hook = componentStateStore[compId][hookIdx] = { deps: deps, cleanup: null };
        var depsChanged = !hook.deps || !deps || hook.deps.length !== deps.length || hook.deps.some(function(dep, i) { return dep !== deps[i]; });
        if (depsChanged) {
            effectQueue.push(function() {
                if (hook.cleanup) hook.cleanup();
                hook.cleanup = callback();
            });
            hook.deps = deps;
        }
    }

    function useMemo(factory, deps) {
        if (!currentRenderingComponent) throw new Error('useMemo must be called inside a component');
        var compId = currentRenderingComponent;
        var hookIdx = currentHookIndex++;
        if (!componentStateStore[compId]) componentStateStore[compId] = [];
        var hook = componentStateStore[compId][hookIdx];
        var depsChanged = !hook || !deps || !hook.deps || hook.deps.length !== deps.length || hook.deps.some(function(dep, i) { return dep !== deps[i]; });

        if (!hook || depsChanged) {
            var value = factory();
            componentStateStore[compId][hookIdx] = { value: value, deps: deps };
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
        var memoized = useMemo(function() { return fn; }, deps);
        return memoized;
    }

    // Render VNODE (or array of VNODEs) and attach events
    function renderVNode(vnode) {
        if (vnode === null || vnode === undefined || vnode === false || vnode === true) {
            return null;
        }

        if (typeof vnode === 'string' || typeof vnode === 'number') {
            return global.document.createTextNode(String(vnode));
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
        return dom;
    }

    // Recursively attach events to DOM
    function attachEvents(dom, vnode) {
        if (vnode && vnode._reactEvents && dom) {
            for (var eventName in vnode._reactEvents) {
                (function(handler, evName) {
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

    function renderSafe(Component) {
        try {
            return Component({});
        } catch (err) {
            console.error('Mishkah.React render error:', err);
            return null;
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

        // Run queued effects after DOM paint
        setTimeout(function() {
            var pending = effectQueue;
            effectQueue = [];
            while (pending.length) {
                var fn = pending.shift();
                try { fn(); } catch (e) { console.error('Effect error:', e); }
            }
        }, 0);
    }

    return {
        createElement: createElement,
        Fragment: Fragment,
        render: render,
        h: createElement,
        useState: useState,
        useEffect: useEffect,
        useMemo: useMemo,
        useRef: useRef,
        useCallback: useCallback
    };
}));
