/*!
 * mishkah-solid.js — SolidJS-like Signals Layer for Mishkah
 * Provides: createSignal, createEffect, createMemo, render, html, Show, For
 * 2025-12-07 - Fine-grained Reactivity Fixed
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah'], function (M) { return factory(root, M); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Solid = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
    "use strict";

    // -------------------------------------------------------------------
    // Signal graph (fine-grained reactivity)
    // -------------------------------------------------------------------
    var activeEffect = null;
    var effectStack = [];

    function createSignal(initialValue) {
        var value = initialValue;
        var subscribers = new Set();

        function getter() {
            if (activeEffect) subscribers.add(activeEffect);
            return value;
        }

        function setter(next) {
            value = (typeof next === 'function') ? next(value) : next;
            subscribers.forEach(function (fn) { fn(); });
        }

        return [getter, setter];
    }

    function createEffect(fn) {
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

    function createMemo(fn) {
        var value;
        var subscribers = new Set();

        createEffect(function () {
            var next = fn();
            if (next !== value) {
                value = next;
                subscribers.forEach(function (sub) { sub(); });
            }
        });

        return function () {
            if (activeEffect) subscribers.add(activeEffect);
            return value;
        };
    }

    // -------------------------------------------------------------------
    // Template helper (HTML + event wiring + Reactive Text)
    // -------------------------------------------------------------------
    var htmlId = 0;

    function html(strings) {
        var values = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            values[_i - 1] = arguments[_i];
        }

        var registry = []; // Stores { type: 'event'|'text', id, fn }
        var out = '';

        function append(val) {
            if (val && val.__mishkah_html) {
                // Nested HTML - flatten it
                out += val.html;
                registry = registry.concat(val.registry || []);
                return;
            }
            if (Array.isArray(val)) {
                val.forEach(function (v) { append(v); });
                return;
            }
            // Static value
            out += (val == null ? '' : val);
        }

        for (var i = 0; i < strings.length; i++) {
            var seg = strings[i];
            out += seg;
            if (i >= values.length) continue;
            var val = values[i];

            // 1. Event Handler: onclick="${fn}"
            var isEventSlot = /on[a-zA-Z]+=[\"']?$/.test(seg);

            if (isEventSlot && typeof val === 'function') {
                var marker = '__mk_ev_' + (++htmlId) + '__';
                registry.push({ type: 'event', id: marker, fn: val });
                out += marker;
            }
            // 2. Reactive Expression: <div>${fn}</div>
            else if (typeof val === 'function') {
                var marker = 'mk-slot-' + (++htmlId);
                // Create a placeholder element
                out += '<m-slot id="' + marker + '" style="display:contents"></m-slot>';
                registry.push({ type: 'text', id: marker, fn: val });
            }
            // 3. Static/Nested Content
            else {
                append(val);
            }
        }

        return { __mishkah_html: true, html: out, registry: registry };
    }

    function renderTemplate(tpl, ctx, target) {
        var templateHTML = '';
        var registry = [];

        if (tpl && tpl.__mishkah_html) {
            templateHTML = tpl.html;
            registry = tpl.registry || [];
        } else {
            templateHTML = tpl == null ? '' : String(tpl);
        }

        if (!target) return;
        target.innerHTML = templateHTML;

        // Process Registry (Events & Reactive Slots)
        if (!registry.length) return;

        // 1. Bind Events
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
                            el.addEventListener(attr.name.substring(2), entry.fn.bind(ctx));
                            el.removeAttribute(attr.name);
                        }
                    }
                }
            }
        }

        // 2. Bind Reactive Text/Content Slots
        var slots = registry.filter(function (r) { return r.type === 'text'; });
        slots.forEach(function (entry) {
            var slotEl = target.querySelector('#' + entry.id);
            if (!slotEl) return;

            // Create Effect for this specific slot
            createEffect(function updateSlot() {
                var content = entry.fn(); // Execute signal/memo

                if (content && content.__mishkah_html) {
                    // Nested Template Update
                    renderTemplate(content, ctx, slotEl);
                } else if (Array.isArray(content)) {
                    // List handling (basic)
                    slotEl.innerHTML = '';
                    content.forEach(function (item) {
                        var wrapper = document.createElement('div');
                        wrapper.style.display = 'contents';
                        slotEl.appendChild(wrapper);
                        if (item && item.__mishkah_html) {
                            renderTemplate(item, ctx, wrapper);
                        } else {
                            wrapper.textContent = String(item);
                        }
                    });
                } else {
                    // Simple Text Update
                    slotEl.textContent = (content == null ? '' : content);
                }
            });
        });
    }

    // -------------------------------------------------------------------
    // Control helpers
    // -------------------------------------------------------------------
    function Show(props) {
        // Return a thunk (function) so html() treats it as reactive
        return function () {
            var condition = typeof props.when === 'function' ? props.when() : props.when;
            return condition ? props.children : (props.fallback || null);
        };
    }

    function For(props) {
        return function () {
            var list = typeof props.each === 'function' ? props.each() : props.each;
            if (!Array.isArray(list)) return [];
            if (typeof props.children === 'function') {
                return list.map(function (item, idx) { return props.children(item, idx); });
            }
            return [];
        };
    }

    // -------------------------------------------------------------------
    // Root renderer
    // -------------------------------------------------------------------
    function render(ComponentFn, target) {
        var container = typeof target === 'string' ? document.querySelector(target) : target;
        if (!container) return;

        // Run Component Once
        // Signals are created now and enclosed in the component scope
        var output = ComponentFn();

        // Initial Render
        // This sets up the DOM and creates effects for all the slots (markers)
        renderTemplate(output, {}, container);
    }

    return {
        createSignal: createSignal,
        createEffect: createEffect,
        createMemo: createMemo,
        render: render,
        html: html,
        Show: Show,
        For: For
    };

}));
