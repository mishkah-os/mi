/*!
 * mishkah-svelte.js — Svelte 5 (Runes) Layer for Mishkah
 * Provides: mount, state, derived, effect, html
 * 2025-12-07 - Fixed Version (DOM Morphing)
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah'], function (M) { return factory(root, M); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Svelte = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
    "use strict";

    // -------------------------------------------------------------------
    // Dependency Graph (Fine-grained reactivity)
    // -------------------------------------------------------------------
    var bucket = new WeakMap();
    var activeEffect = null;
    var effectStack = [];

    function track(target, key) {
        if (!activeEffect) return;
        var depsMap = bucket.get(target);
        if (!depsMap) {
            depsMap = new Map();
            bucket.set(target, depsMap);
        }
        var dep = depsMap.get(key);
        if (!dep) {
            dep = new Set();
            depsMap.set(key, dep);
        }
        dep.add(activeEffect);
    }

    function trigger(target, key) {
        var depsMap = bucket.get(target);
        if (!depsMap) return;
        var dep = depsMap.get(key);
        if (!dep) return;

        var effectsToRun = new Set(dep);
        effectsToRun.forEach(function (effectFn) { effectFn(); });
    }

    function effect(fn) {
        var runner = function () {
            activeEffect = runner;
            effectStack.push(runner);
            try { fn(); } finally {
                effectStack.pop();
                activeEffect = effectStack[effectStack.length - 1] || null;
            }
        };
        runner();
        return runner;
    }

    // -------------------------------------------------------------------
    // State / Derived (Svelte 5 Runes)
    // -------------------------------------------------------------------
    var proxyCache = new WeakMap();

    function createProxy(target) {
        if (typeof target !== 'object' || target === null) return target;
        if (proxyCache.has(target)) return proxyCache.get(target);

        var proxy = new Proxy(target, {
            get: function (obj, prop) {
                track(obj, prop);
                return createProxy(obj[prop]);
            },
            set: function (obj, prop, value) {
                if (obj[prop] !== value) {
                    obj[prop] = value;
                    trigger(obj, prop);
                }
                return true;
            }
        });
        proxyCache.set(target, proxy);
        return proxy;
    }

    function state(initialValue) {
        return createProxy(initialValue);
    }

    function derived(fn) {
        var cache;
        var recompute = function () { cache = fn(); };
        effect(recompute);
        return {
            get value() { return cache; }
        };
    }

    // -------------------------------------------------------------------
    // HTML Template (Tagged Literal)
    // -------------------------------------------------------------------
    var fnCache = new Map();
    var fnIdCounter = 0;

    function getStableId(fn) {
        if (!fnCache.has(fn)) {
            fnCache.set(fn, '__mk_fn_' + (++fnIdCounter) + '__');
        }
        return fnCache.get(fn);
    }

    function html(strings) {
        var values = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            values[_i - 1] = arguments[_i];
        }
        var fns = [];
        var out = '';

        function append(val) {
            if (val && val.__mishkah_html) {
                out += val.html;
                fns = fns.concat(val.fns || []);
                return;
            }
            if (Array.isArray(val)) {
                val.forEach(function (v) { append(v); });
                return;
            }
            out += (val == null ? '' : val);
        }

        for (var i = 0; i < strings.length; i++) {
            var seg = strings[i];
            out += seg;
            if (i >= values.length) continue;
            var val = values[i];

            var isEventSlot = /on[a-zA-Z]+=[\"']?$/.test(seg);

            if (isEventSlot && typeof val === 'function') {
                var marker = getStableId(val);
                fns.push({ type: 'event', id: marker, fn: val });
                out += marker;
            } else {
                append(typeof val === 'function' ? val() : val);
            }
        }

        return { __mishkah_html: true, html: out, fns: fns };
    }

    // -------------------------------------------------------------------
    // Morph / Diff (Lightweight DOM Patching)
    // -------------------------------------------------------------------
    function morph(fromNode, toNode) {
        if (fromNode.isEqualNode(toNode)) return;

        // If node types differ, replace
        if (fromNode.nodeType !== toNode.nodeType || fromNode.tagName !== toNode.tagName) {
            fromNode.parentNode.replaceChild(toNode.cloneNode(true), fromNode);
            return;
        }

        // Text Node
        if (fromNode.nodeType === 3) {
            if (fromNode.nodeValue !== toNode.nodeValue) {
                fromNode.nodeValue = toNode.nodeValue;
            }
            return;
        }

        // Element Node
        var fromEl = fromNode;
        var toEl = toNode;

        // Sync Attributes
        updateAttributes(fromEl, toEl);

        // Sync Children
        var fromChildren = Array.from(fromEl.childNodes);
        var toChildren = Array.from(toEl.childNodes);

        for (var i = 0; i < toChildren.length; i++) {
            if (i < fromChildren.length) {
                morph(fromChildren[i], toChildren[i]);
            } else {
                fromEl.appendChild(toChildren[i].cloneNode(true));
            }
        }
        // Remove excess
        while (fromChildren.length > toChildren.length) {
            fromEl.removeChild(fromChildren.pop());
        }
    }

    function updateAttributes(fromEl, toEl) {
        var fromAttrs = Array.from(fromEl.attributes);
        var toAttrs = Array.from(toEl.attributes);

        // Remove old
        fromAttrs.forEach(function (attr) {
            if (!toEl.hasAttribute(attr.name)) {
                fromEl.removeAttribute(attr.name);
            }
        });

        // Add/Update new
        toAttrs.forEach(function (attr) {
            if (fromEl.getAttribute(attr.name) !== attr.value) {
                fromEl.setAttribute(attr.name, attr.value);
            }
        });

        // Input Value Special Handling (Preserve Focus)
        if (fromEl.tagName === 'INPUT' || fromEl.tagName === 'TEXTAREA') {
            if (fromEl.value !== toEl.value) {
                // Only update if different and not currently focused (or forcing update)
                // But generally we DO want to update value if state changed.
                // The key is that modifying 'value' prop doesn't kill focus.
                fromEl.value = toEl.value;
            }
        }
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------
    function renderTemplate(tpl, ctx, target) {
        var templateHTML = '';
        var registry = [];

        if (tpl && tpl.__mishkah_html) {
            templateHTML = tpl.html;
            registry = tpl.fns || [];
        } else {
            templateHTML = tpl == null ? '' : String(tpl);
        }

        if (!target) return;

        // Create Virtual DOM for diffing
        var temp = document.createElement(target.tagName);
        temp.innerHTML = templateHTML;

        // Morph target children to match temp children
        var targetChildren = Array.from(target.childNodes);
        var tempChildren = Array.from(temp.childNodes);

        for (var i = 0; i < tempChildren.length; i++) {
            if (i < targetChildren.length) {
                morph(targetChildren[i], tempChildren[i]);
            } else {
                target.appendChild(tempChildren[i].cloneNode(true));
            }
        }
        // Remove excess
        while (target.childNodes.length > tempChildren.length) {
            target.removeChild(target.lastChild);
        }

        // Bind Events (Smartly)
        if (!registry.length) return;
        var events = registry.filter(function (r) { return r.type === 'event'; });

        if (events.length) {
            var all = target.querySelectorAll('*');
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                var attrs = Array.from(el.attributes);
                for (var j = 0; j < attrs.length; j++) {
                    var attr = attrs[j];
                    for (var k = 0; k < events.length; k++) {
                        var entry = events[k];
                        if (attr.value === entry.id && attr.name.indexOf('on') === 0) {
                            var eventName = attr.name.substring(2);
                            // Avoid rebinding if same handler
                            if (el['__mk_handler_' + eventName] !== entry.fn) {
                                if (el['__mk_handler_' + eventName]) {
                                    el.removeEventListener(eventName, el['__mk_bound_' + eventName]);
                                }
                                var boundFn = entry.fn.bind(ctx);
                                el.addEventListener(eventName, boundFn);
                                el['__mk_handler_' + eventName] = entry.fn;
                                el['__mk_bound_' + eventName] = boundFn;
                            }
                            el.removeAttribute(attr.name);
                        }
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Mount
    // -------------------------------------------------------------------
    function mount(ComponentFn, target) {
        var container = typeof target === 'string' ? document.querySelector(target) : target;
        if (!container) return;

        var renderFn = ComponentFn();

        if (typeof renderFn !== 'function') {
            console.error('[Mishkah.Svelte] Component must return a render function');
            return;
        }

        effect(function render() {
            var output = renderFn();
            renderTemplate(output, {}, container);
        });
    }

    return {
        state: state,
        derived: derived,
        effect: effect,
        mount: mount,
        html: html
    };

}));
