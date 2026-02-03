/*!
 * mishkah-vue3.js — Vue 3 (Composition API) Layer for Mishkah
 * Provides: createApp, ref, reactive, computed, onMounted
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah', 'mishkah-react'], function (M, R) { return factory(root, M, R); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'), require('mishkah-react'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Vue3 = factory(root, root.Mishkah, root.Mishkah.React);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M, R) {
    "use strict";

    if (!R || !R.render) {
        console.error('Mishkah.Vue3 requires Mishkah.React (mishkah-react.js).');
        return {};
    }

    // -------------------------------------------------------------------
    // Vue 3 Composition API Wrapper
    // -------------------------------------------------------------------

    // 1. ref() -> useState wrapper
    function ref(initialValue) {
        var hook = R.useState({ value: initialValue });
        var state = hook[0];
        var setState = hook[1];

        // Return an object with .value property getter/setter
        return {
            get value() { return state.value; },
            set value(v) { setState({ value: v }); }
        };
    }

    // 2. reactive() -> useState wrapper (deep proxy in real Vue, simple here)
    function reactive(obj) {
        var hook = R.useState(obj);
        var state = hook[0];
        var setState = hook[1];

        return new Proxy(state, {
            get: function (target, prop) { return target[prop]; },
            set: function (target, prop, value) {
                var newState = Object.assign({}, target);
                newState[prop] = value;
                setState(newState);
                return true;
            }
        });
    }

    // 3. onMounted -> useEffect wrapper
    function onMounted(fn) {
        R.useEffect(function () {
            fn();
        }, []);
    }

    // 4. createApp
    function createApp(RootComponent) {
        function Vue3Component(props) {
            // Call setup()
            var setupResult = {};
            if (RootComponent.setup) {
                setupResult = RootComponent.setup(props, { emit: function () { } });
            }

            // Render
            if (RootComponent.template) {
                // Bind setup result to template function
                // Note: In Vue 3, template compiles to render function that takes ctx
                // Here, we expect template to be: (ctx) => html`...`
                return RootComponent.template(setupResult);
            }
            return null;
        }

        return {
            mount: function (selector) {
                var container = typeof selector === 'string' ? document.querySelector(selector) : selector;
                R.render(Vue3Component, container);
            }
        };
    }

    return {
        createApp: createApp,
        ref: ref,
        reactive: reactive,
        onMounted: onMounted,
        html: R.html
    };

}));
