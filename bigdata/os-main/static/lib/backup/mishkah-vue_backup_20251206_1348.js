/*!
 * mishkah-vue.js — Vue 2 (Options API) Layer for Mishkah
 * Provides: createApp, data, methods, mounted, etc.
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah', 'mishkah-react'], function (M, R) { return factory(root, M, R); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'), require('mishkah-react'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Vue = factory(root, root.Mishkah, root.Mishkah.React);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M, R) {
    "use strict";

    // Check dependencies
    if (!R || !R.render) {
        console.error('Mishkah.Vue requires Mishkah.React (mishkah-react.js) to be loaded first.');
        return {};
    }

    // -------------------------------------------------------------------
    // Vue 2 Options API Wrapper
    // -------------------------------------------------------------------
    function createApp(Options) {

        // Convert Options API Object to a Functional Component with Hooks
        function VueComponent(props) {
            // 1. Setup State (data)
            // We use a single state object to mimic Vue's reactive data
            var initialState = typeof Options.data === 'function'
                ? Options.data()
                : (Options.data || {});

            var stateHook = R.useState(initialState);
            var state = stateHook[0];
            var setState = stateHook[1];

            // 2. Create "this" context (Proxy)
            // This allows access to data properties directly (this.count)
            // and methods (this.inc)
            var ctx = {
                $props: props,
                $emit: function (event, payload) { console.log('Emit:', event, payload); } // TODO: Implement emit
            };

            // Bind methods
            if (Options.methods) {
                for (var key in Options.methods) {
                    ctx[key] = Options.methods[key].bind(ctx);
                }
            }

            // Create Proxy to route access to state or ctx
            var proxy = new Proxy(ctx, {
                get: function (target, prop) {
                    if (prop in state) return state[prop];
                    if (prop in target) return target[prop];
                    return undefined;
                },
                set: function (target, prop, value) {
                    if (prop in state) {
                        // Update state immutably to trigger re-render
                        var newState = Object.assign({}, state);
                        newState[prop] = value;
                        setState(newState);
                        return true;
                    }
                    target[prop] = value;
                    return true;
                }
            });

            // Re-bind methods to the Proxy so 'this' works correctly inside them
            if (Options.methods) {
                for (var key in Options.methods) {
                    ctx[key] = Options.methods[key].bind(proxy);
                }
            }

            // 3. Lifecycle Hooks
            R.useEffect(function () {
                if (Options.mounted) Options.mounted.call(proxy);
                return function () {
                    if (Options.unmounted) Options.unmounted.call(proxy);
                };
            }, []); // Empty deps = mounted

            // 4. Render
            if (Options.template) {
                // If template is a function (HTMLx tag result), call it with proxy as 'this'
                // But wait, R.html returns VNodes directly.
                // We need the template to be a function that accepts state/context.
                // In our design: template: (ctx) => html`...` OR we bind `this`

                if (typeof Options.template === 'function') {
                    // If user defined template as: function() { return html`...` }
                    return Options.template.call(proxy);
                }

                // If template is VNode (already evaluated), it won't be reactive!
                // User MUST define template as a function for reactivity.
                console.warn('Mishkah.Vue: template should be a function returning html``');
                return Options.template;
            }

            return M.h('div', 'Vue', {}, ['No template defined']);
        }

        return {
            mount: function (selector) {
                var container = typeof selector === 'string'
                    ? document.querySelector(selector)
                    : selector;
                R.render(VueComponent, container);
            }
        };
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------
    return {
        createApp: createApp,
        html: R.html // Re-export html for convenience
    };

}));
