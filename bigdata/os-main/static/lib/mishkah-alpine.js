/*!
 * mishkah-alpine.js — Lightweight Alpine.js Implementation for Mishkah
 * Features: x-data, x-text, x-html, x-show, x-model, x-bind, x-on (@)
 * Architecture: Proxy-based Reactivity + DOM Walker
 * 2025-12-07 - Fixed Version
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah'], function (M) { return factory(root, M); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Alpine = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
    "use strict";

    // -------------------------------------------------------------------
    // Core Reactivity System
    // -------------------------------------------------------------------
    var activeEffect = null;

    function effect(fn) {
        activeEffect = fn;
        fn();
        activeEffect = null;
    }

    function reactive(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        var subscribers = new Map();

        return new Proxy(obj, {
            get: function (target, prop) {
                if (activeEffect) {
                    if (!subscribers.has(prop)) subscribers.set(prop, new Set());
                    subscribers.get(prop).add(activeEffect);
                }
                return target[prop];
            },
            set: function (target, prop, value) {
                target[prop] = value;
                if (subscribers.has(prop)) {
                    var effectsToRun = new Set(subscribers.get(prop));
                    effectsToRun.forEach(function (eff) { eff(); });
                }
                return true;
            }
        });
    }

    // -------------------------------------------------------------------
    // Evaluator - Uses 'with' statement to properly access proxy
    // -------------------------------------------------------------------
    function evaluate(expression, scope, $event) {
        try {
            // Use 'with' to make scope properties directly accessible
            // This allows 'count++' to actually modify scope.count
            var fn = new Function('$scope', '$event',
                'with($scope) { return (' + expression + '); }'
            );
            return fn(scope, $event);
        } catch (e) {
            console.error('[Mishkah.Alpine] Error evaluating: ' + expression, e);
            return undefined;
        }
    }

    function executeStatement(statement, scope, $event) {
        try {
            // For statements like 'count++' or 'showBox = !showBox'
            var fn = new Function('$scope', '$event',
                'with($scope) { ' + statement + ' }'
            );
            fn(scope, $event);
        } catch (e) {
            console.error('[Mishkah.Alpine] Error executing: ' + statement, e);
        }
    }

    // -------------------------------------------------------------------
    // Directives
    // -------------------------------------------------------------------
    var directives = {
        'x-text': function (el, value, scope) {
            effect(function () {
                el.textContent = evaluate(value, scope);
            });
        },
        'x-html': function (el, value, scope) {
            effect(function () {
                el.innerHTML = evaluate(value, scope);
            });
        },
        'x-show': function (el, value, scope) {
            var initialDisplay = el.style.display === 'none' ? '' : el.style.display;
            effect(function () {
                var show = evaluate(value, scope);
                el.style.display = show ? initialDisplay : 'none';
            });
        },
        'x-model': function (el, value, scope) {
            // Model -> View
            effect(function () {
                var val = evaluate(value, scope);
                if (el.type === 'checkbox') {
                    el.checked = !!val;
                } else if (el.type === 'radio') {
                    el.checked = el.value == val;
                } else {
                    el.value = (val === null || val === undefined) ? '' : val;
                }
            });

            // View -> Model
            var eventName = (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(eventName, function (e) {
                var newVal;
                if (el.type === 'checkbox') newVal = el.checked;
                else if (el.type === 'number') newVal = parseFloat(el.value);
                else newVal = el.value;

                // Execute assignment statement
                executeStatement(value + ' = $val', { $val: newVal, ...scope }, e);
                // Directly set on scope for simple props
                if (value in scope) {
                    scope[value] = newVal;
                }
            });
        },
        'x-bind': function (el, value, scope, arg) {
            var attrName = arg;
            if (!attrName) return;

            effect(function () {
                var evaluated = evaluate(value, scope);
                if (attrName === 'class') {
                    if (typeof evaluated === 'string') {
                        el.className = evaluated;
                    } else if (typeof evaluated === 'object') {
                        Object.keys(evaluated).forEach(function (cls) {
                            if (evaluated[cls]) el.classList.add(cls);
                            else el.classList.remove(cls);
                        });
                    }
                } else {
                    if (evaluated) el.setAttribute(attrName, evaluated);
                    else el.removeAttribute(attrName);
                }
            });
        },
        'x-on': function (el, expression, scope, arg) {
            var eventName = arg;
            el.addEventListener(eventName, function (e) {
                // Execute as statement, not expression
                executeStatement(expression, scope, e);
            });
        }
    };

    // -------------------------------------------------------------------
    // Walker / Initializer
    // -------------------------------------------------------------------
    function walk(el, scope) {
        var newScope = scope;
        if (el.hasAttribute && el.hasAttribute('x-data')) {
            var dataExpr = el.getAttribute('x-data');
            var dataObj = dataExpr ? evaluate(dataExpr, {}) : {};
            newScope = reactive(dataObj);
        }

        // Apply Directives
        if (el.attributes) {
            Array.from(el.attributes).forEach(function (attr) {
                var name = attr.name;
                var value = attr.value;

                if (directives[name]) {
                    directives[name](el, value, newScope);
                }
                else if (name.indexOf('@') === 0) {
                    directives['x-on'](el, value, newScope, name.substring(1));
                }
                else if (name.indexOf(':') === 0) {
                    directives['x-bind'](el, value, newScope, name.substring(1));
                }
                else if (name.indexOf('x-on:') === 0) {
                    directives['x-on'](el, value, newScope, name.substring(5));
                }
                else if (name.indexOf('x-bind:') === 0) {
                    directives['x-bind'](el, value, newScope, name.substring(7));
                }
            });
        }

        // Walk Children
        var child = el.firstElementChild;
        while (child) {
            walk(child, newScope);
            child = child.nextElementSibling;
        }
    }

    function start() {
        var rootEls = document.querySelectorAll('[x-data]');
        rootEls.forEach(function (el) {
            walk(el, {});
        });
    }

    return {
        start: start,
        reactive: reactive
    };

}));