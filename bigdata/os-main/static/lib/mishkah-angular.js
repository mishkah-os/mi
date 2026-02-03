/*!
 * mishkah-angular.js — Angular-like Layer for Mishkah
 * Provides: bootstrap, Component (Class-based)
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah'], function (M) { return factory(root, M); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Angular = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
    "use strict";

    // -------------------------------------------------------------------
    // Tiny Template Helper (html``)
    // -------------------------------------------------------------------
    var htmlCounter = 0;
    function html(strings) {
        var values = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            values[_i - 1] = arguments[_i];
        }

        var fns = [];
        var out = '';
        for (var i = 0; i < strings.length; i++) {
            var seg = strings[i];
            out += seg;
            if (i >= values.length) continue;
            var val = values[i];
            var isEventSlot = /on[a-zA-Z]+=["']?$/.test(seg);

            if (typeof val === 'function' && isEventSlot) {
                var marker = '__mk_ang_fn_' + (++htmlCounter) + '__';
                fns.push({ id: marker, fn: val });
                out += marker;
            } else {
                out += typeof val === 'function' ? val() : (val == null ? '' : val);
            }
        }

        return { __mishkah_html: true, html: out, fns: fns };
    }

    function renderTemplate(tpl, ctx, target) {
        var templateHTML = '';
        var fnList = [];

        if (tpl && tpl.__mishkah_html) {
            templateHTML = tpl.html;
            fnList = tpl.fns || [];
        } else {
            templateHTML = tpl == null ? '' : String(tpl);
        }

        if (!target) return;
        target.innerHTML = templateHTML;

        if (!fnList.length) return;

        var all = target.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var attrs = Array.from(el.attributes);
            for (var j = 0; j < attrs.length; j++) {
                var attr = attrs[j];
                for (var k = 0; k < fnList.length; k++) {
                    var entry = fnList[k];
                    if (attr.value === entry.id && attr.name.indexOf('on') === 0) {
                        el.addEventListener(attr.name.substring(2), entry.fn.bind(ctx));
                        el.removeAttribute(attr.name);
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Angular-like Class Wrapper
    // -------------------------------------------------------------------
    function bootstrap(ComponentClass, selector) {

        function AngularComponent(props) {
            // 1. Force Update Hook
            var tick = 0;
            function scheduleRender() {
                if (tick > 0) return;
                tick++;
                Promise.resolve().then(function () {
                    tick = 0;
                    doRender();
                });
            }

            // 2. Create Instance (Once)
            var rawInstance = new ComponentClass();

            var proxy = new Proxy(rawInstance, {
                set: function (target, prop, value) {
                    target[prop] = value;
                    scheduleRender();
                    return true;
                },
                get: function (target, prop) {
                    var value = target[prop];
                    if (typeof value === 'function') return value.bind(proxy);
                    return value;
                }
            });

            if (props) { Object.assign(proxy, props); }

            if (proxy.onInit) proxy.onInit();

            var container = typeof selector === 'string'
                ? document.querySelector(selector)
                : selector;

            function doRender() {
                if (!container) return;
                var template = ComponentClass.template;
                if (!template) {
                    container.innerHTML = '<div>No template defined</div>';
                    return;
                }

                var content = typeof template === 'function'
                    ? template.call(proxy)
                    : template;
                renderTemplate(content, proxy, container);
            }

            doRender();

            // Return teardown
            return function () {
                if (proxy.onDestroy) proxy.onDestroy();
                if (container) container.innerHTML = '';
            };
        }

        // If no selector provided, we assume we just return the component for composition
        if (!selector) return AngularComponent;

        AngularComponent();
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------
    return {
        bootstrap: bootstrap,
        html: html
    };

}));
