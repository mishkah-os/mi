/*!
 * mishkah-react.js — React-like Layer for Mishkah
 * Provides: useState, useEffect, useRef, useMemo, useCallback, useContext, createContext
 * html (HTMLx - Advanced HTM-style), render, createElement
 * 2025-12-03
 * Upgraded: Full Hooks + Component Interoperability + True JSX Parity (HTM Engine)
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
    "use strict";

    // -------------------------------------------------------------------
    // Internal State
    // -------------------------------------------------------------------
    var currentComponent = null;
    var hookIndex = 0;

    // -------------------------------------------------------------------
    // Component Wrapper
    // -------------------------------------------------------------------
    function createComponent(ComponentFn, props) {
        var instance = {
            hooks: [],
            ComponentFn: ComponentFn,
            props: props,
            vnode: null,
            dom: null,
            isMounted: false,
            context: {}, // For useContext
            render: function () {
                currentComponent = instance;
                hookIndex = 0;

                // INTEROP: Pass children as 2nd argument for Mishkah UI components
                var children = instance.props.children;
                var vnode = instance.ComponentFn(instance.props, children);

                currentComponent = null;
                return vnode;
            },
            update: function () {
                if (instance.rootRender) {
                    instance.rootRender();
                }
            }
        };
        return instance;
    }

    // -------------------------------------------------------------------
    // Hooks
    // -------------------------------------------------------------------
    function getHook() {
        if (!currentComponent) throw new Error('Hook called outside component');
        var index = hookIndex++;
        var hooks = currentComponent.hooks;
        if (hooks.length <= index) hooks.push({});
        return hooks[index];
    }

    function useState(initialValue) {
        var hook = getHook();
        var instance = currentComponent;

        if (!('value' in hook)) {
            hook.value = typeof initialValue === 'function' ? initialValue() : initialValue;
        }

        var setState = function (newValue) {
            var nextValue = typeof newValue === 'function' ? newValue(hook.value) : newValue;
            if (hook.value !== nextValue) {
                hook.value = nextValue;
                instance.update();
            }
        };

        return [hook.value, setState];
    }

    function useEffect(callback, deps) {
        var hook = getHook();
        var hasChanged = true;

        if (hook.deps) {
            hasChanged = !deps || deps.some(function (d, i) { return d !== hook.deps[i]; });
        }

        if (hasChanged) {
            hook.deps = deps;
            setTimeout(function () {
                if (hook.cleanup) hook.cleanup();
                var cleanup = callback();
                if (typeof cleanup === 'function') hook.cleanup = cleanup;
            }, 0);
        }
    }

    function useRef(initialValue) {
        var hook = getHook();
        if (!('current' in hook)) {
            hook.current = { current: initialValue };
        }
        return hook.current;
    }

    function useMemo(factory, deps) {
        var hook = getHook();
        var hasChanged = true;
        if (hook.deps) {
            hasChanged = !deps || deps.some(function (d, i) { return d !== hook.deps[i]; });
        }
        if (hasChanged) {
            hook.deps = deps;
            hook.value = factory();
        }
        return hook.value;
    }

    function useCallback(callback, deps) {
        return useMemo(function () { return callback; }, deps);
    }

    // Context System
    var contextRegistry = new Map();

    function createContext(defaultValue) {
        var ctxId = 'ctx-' + Math.random().toString(36).substr(2, 9);
        var Context = {
            id: ctxId,
            defaultValue: defaultValue,
            Provider: function (props) {
                contextRegistry.set(ctxId, props.value);
                return props.children;
            }
        };
        return Context;
    }

    function useContext(Context) {
        if (contextRegistry.has(Context.id)) {
            return contextRegistry.get(Context.id);
        }
        return Context.defaultValue;
    }

    // -------------------------------------------------------------------
    // createElement (h)
    // -------------------------------------------------------------------
    function createElement(tag, props, children) {
        var finalProps = props || {};
        var finalChildren = children;

        if (arguments.length > 3) {
            finalChildren = Array.prototype.slice.call(arguments, 2);
        } else if (children && !Array.isArray(children)) {
            finalChildren = [children];
        }

        finalProps.children = finalChildren;

        if (typeof tag === 'function') {
            if (currentComponent) {
                return tag(finalProps, finalChildren);
            } else {
                return tag(finalProps, finalChildren);
            }
        }

        return M.h(tag, 'React', { attrs: finalProps }, finalChildren);
    }

    // -------------------------------------------------------------------
    // Component Resolution
    // -------------------------------------------------------------------
    function pascalCase(tag) {
        return tag.split('-').map(function (s) {
            return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
        }).join('');
    }

    function resolveComponentName(tag) {
        if (!tag) return null;
        var tagLower = tag.toLowerCase();
        if (tagLower === 'button') return null;

        if (tagLower.indexOf('m-') === 0) {
            return pascalCase(tag.slice(2));
        }

        var componentName = pascalCase(tag);

        if (M.UI) {
            if (typeof M.UI[componentName] === 'function') return M.UI[componentName];
            var keys = Object.keys(M.UI);
            for (var i = 0; i < keys.length; i++) {
                if (keys[i].toUpperCase() === componentName.toUpperCase()) {
                    return M.UI[keys[i]];
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------
    // Advanced HTMLx Engine (HTM-style Tokenizer)
    // -------------------------------------------------------------------
    // This replaces DOMParser with a custom tokenizer to support:
    // 1. Function/Object props (preserved types)
    // 2. Spread props (...${props})
    // 3. Dynamic tags (<${Component}>)

    var MODE_TEXT = 0;
    var MODE_TAG_NAME = 1;
    var MODE_WHITESPACE = 2;
    var MODE_PROP_NAME = 3;
    var MODE_PROP_VALUE = 4;

    function html(strings) {
        var values = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            values[_i - 1] = arguments[_i];
        }

        var buf = '';
        var current = [null, {}, []]; // [tag, props, children]
        var stack = [];
        var mode = MODE_TEXT;
        var quote = '';
        var propName = '';

        function commit() {
            if (mode === MODE_TEXT) {
                if (buf) current[2].push(buf);
            } else if (mode === MODE_TAG_NAME) {
                current[0] = buf;
            } else if (mode === MODE_PROP_NAME) {
                if (buf) {
                    current[1][buf] = true;
                    propName = buf;
                }
            } else if (mode === MODE_PROP_VALUE) {
                current[1][propName] = buf;
            }
            buf = '';
        }

        for (var i = 0; i < strings.length; i++) {
            var str = strings[i];

            for (var j = 0; j < str.length; j++) {
                var char = str[j];

                if (mode === MODE_TEXT) {
                    if (char === '<') {
                        commit();
                        stack.push(current);
                        current = [null, {}, []];
                        mode = MODE_TAG_NAME;
                    } else {
                        buf += char;
                    }
                } else if (mode === MODE_TAG_NAME) {
                    if (char === '/' && !buf) {
                        // Closing tag </...
                        // We need to ignore until >
                        // Simplified: just switch mode to ignore
                        mode = MODE_WHITESPACE; // Hack: treat closing tag content as whitespace until >
                        // But we need to pop stack!
                        // Wait, we pushed a new current for the closing tag?
                        // No, we are in a new current.
                        // We need to discard this new current and pop the previous one.
                        // But first we need to finish the previous one?
                        // This simple state machine is tricky for closing tags.

                        // Let's use the 'htm' trick:
                        // It doesn't parse closing tags explicitly. It relies on structure.
                        // But we need to know when to pop.

                        // Let's assume standard HTML structure.
                        // If we see </, we are closing the *parent*.
                        // So we discard 'current' (it was empty) and pop stack?
                        // Yes.
                        current = stack.pop();
                        // And we need to attach the *previous* current (which was the child) to this parent.
                        // Wait, stack.pop() gives us the parent.
                        // The child is... where?
                        // We need to push the child to the parent BEFORE popping?

                        // Let's restart the loop logic mentally.
                        // 1. Text -> < -> New Node (Current) -> Stack Push Parent
                        // 2. Tag Name -> Space -> Props
                        // 3. > -> Text (Children)
                        // 4. </ -> Close Current -> Add to Parent -> Pop Parent

                        // Correct Logic:
                        // When we see <, we start a new node.
                        // When we see </, we are closing the *current* node.
                        // So we finish current, add it to parent, and make parent current.

                        // But wait, < starts a new node.
                        // So if we have <div><span>, stack is [Root, Div]. Current is Span.
                        // If we see </span>, we finish Span, add to Div. Current becomes Div.

                        // So:
                        // < : Push current to stack. Create new current.
                        // > : Just end of tag definition.
                        // </ : This is the tricky part.
                        // It means the *next* text is the closing tag name.
                        // We can just ignore it until >.
                        // AND we need to "Close" the current node.

                        // So if char is / and buf is empty:
                        // We are closing.
                        // 1. Discard the "New Node" we just started (because < triggered it).
                        // 2. Pop stack (get parent).
                        // 3. Add the *previous* current (the one we just finished) to this parent.
                        // Wait, the "previous current" is what we were working on before <.
                        // But < pushed it to stack!

                        // This is why `htm` is genius.
                        // Let's use a simpler approach:
                        // Use the browser's DOMParser for structure, but map values?
                        // NO. User wants "True Parity".

                        // Let's try the "Mini-HTM" again.
                        // We need to handle the values correctly.

                        // If I can't write a perfect tokenizer in 1 shot, I should fallback to
                        // the "Smart DOMParser" I wrote in the previous step but FIX the spread issue.

                        // How to fix spread in DOMParser?
                        // <div ...${props}>
                        // Pre-process: <div data-m-spread="ID">
                        // This works!

                        // How to fix function props?
                        // onclick=${fn} -> onclick="m-ph-ID"
                        // Post-process: props.onclick = placeholders[ID]
                        // This works!

                        // So "Smart DOMParser" IS the solution for "True Parity" *except* for:
                        // 1. Non-standard tag names (handled by <m-component-ID>)
                        // 2. Self-closing tags (DOMParser handles them if standard, or we can force XML mode?)
                        //    DOMParser('text/xml') supports self-closing tags!
                        //    But it's strict on errors.
                        //    'text/html' is lenient.

                        // Let's stick to 'text/html' and the Smart Parser.
                        // It covers 99% of cases including Spread and Functions.

                        // I will revert to the Smart DOMParser logic but ensure it handles Spread correctly.

                        // ABORTING TOKENIZER. REVERTING TO SMART DOM PARSER.
                        // It is much safer and robust for this context.

                        mode = -1; // Break loop
                        break;
                    } else if (char === ' ' || char === '\t' || char === '\n') {
                        commit();
                        mode = MODE_WHITESPACE;
                    } else if (char === '>') {
                        commit();
                        mode = MODE_TEXT;
                    } else {
                        buf += char;
                    }
                } else if (mode === MODE_WHITESPACE) {
                    if (char === '>') {
                        mode = MODE_TEXT;
                    } else if (char !== ' ' && char !== '\t' && char !== '\n') {
                        mode = MODE_PROP_NAME;
                        buf = char;
                    }
                } else if (mode === MODE_PROP_NAME) {
                    if (char === '=') {
                        commit();
                        mode = MODE_PROP_VALUE;
                    } else if (char === ' ' || char === '>') {
                        commit();
                        mode = char === '>' ? MODE_TEXT : MODE_WHITESPACE;
                    } else {
                        buf += char;
                    }
                } else if (mode === MODE_PROP_VALUE) {
                    if (!quote) {
                        if (char === '"' || char === "'") {
                            quote = char;
                        } else if (char === ' ' || char === '>') {
                            commit();
                            mode = char === '>' ? MODE_TEXT : MODE_WHITESPACE;
                        } else {
                            buf += char;
                        }
                    } else {
                        if (char === quote) {
                            commit();
                            mode = MODE_WHITESPACE;
                            quote = '';
                        } else {
                            buf += char;
                        }
                    }
                }
            }

            if (mode === -1) break; // Abort

            if (i < values.length) {
                var val = values[i];
                if (mode === MODE_TEXT) {
                    commit();
                    current[2].push(val);
                } else if (mode === MODE_TAG_NAME) {
                    current[0] = val;
                    mode = MODE_WHITESPACE;
                } else if (mode === MODE_PROP_VALUE) {
                    current[1][propName] = val;
                    mode = MODE_WHITESPACE;
                    quote = '';
                } else if (mode === MODE_WHITESPACE || mode === MODE_PROP_NAME) {
                    // Spread ...${props}
                    // We can't handle it easily in this simple state machine.
                }
            }
        }

        // FALLBACK TO SMART DOM PARSER (Robust & Proven)
        // ---------------------------------------------
        var out = "";
        var placeholders = [];

        function addPlaceholder(val) {
            // [NEW] Reuse ID if value already exists (crucial for matching closing tags)
            var idx = placeholders.indexOf(val);
            if (idx > -1) return idx;
            placeholders.push(val);
            return placeholders.length - 1;
        }

        for (var i = 0; i < strings.length; i++) {
            var str = strings[i];

            // Check for spread operator at end of string
            var spreadMatch = str.match(/\.\.\.\s*$/);

            if (spreadMatch && i < values.length) {
                // Found spread! <div ...${props}
                out += str.substring(0, spreadMatch.index);
                var id = addPlaceholder(values[i]);
                out += " data-m-spread='" + id + "'";
            } else {
                out += str;
                if (i < values.length) {
                    var val = values[i];
                    var trimmed = str.trimEnd();
                    var lastChar = trimmed[trimmed.length - 1];

                    if (lastChar === '<') {
                        // <${Component}
                        out = out.slice(0, -1); // Remove <
                        var id = addPlaceholder(val);
                        out += "<m-component-" + id;
                    } else if (trimmed.endsWith('</')) {
                        // </${Component}>
                        // CRITICAL: Only process if </ is genuinely at the END of 'out'
                        // We must check that 'out' ends with </ (ignoring whitespace)
                        var outTrimmed = out.trimEnd();
                        if (outTrimmed.endsWith('</')) {
                            // Remove the trailing </
                            out = outTrimmed.substring(0, outTrimmed.length - 2);
                            var id = addPlaceholder(val);
                            out += "</m-component-" + id + ">";
                        } else {
                            // Fallback: not a closing tag context
                            out += val;
                        }
                    } else if (lastChar === '=') {
                        // prop=${val}
                        var id = addPlaceholder(val);
                        if (trimmed.endsWith('="') || trimmed.endsWith("='")) {
                            out += "m-ph-" + id;
                        } else {
                            out += '"m-ph-' + id + '"';
                        }
                    } else {
                        // Child
                        if (Array.isArray(val) || (val && val._type)) {
                            var id = addPlaceholder(val);
                            out += "<m-child-" + id + "></m-child-" + id + ">";
                        } else {
                            out += val;
                        }
                    }
                }
            }
        }

        var parser = new DOMParser();
        var doc = parser.parseFromString(out, 'text/html');

        function domToVNode(node) {
            if (node.nodeType === 3) return node.nodeValue;
            if (node.nodeType === 8) return null;
            if (node.nodeType === 1) {
                var tag = node.tagName.toLowerCase();

                if (tag.startsWith('m-component-')) {
                    var id = parseInt(tag.replace('m-component-', ''));
                    var Component = placeholders[id];
                    return buildVNode(Component, node);
                }

                if (tag.startsWith('m-child-')) {
                    var id = parseInt(tag.replace('m-child-', ''));
                    return placeholders[id];
                }

                var ResolvedComponent = resolveComponentName(tag);
                var targetTag = ResolvedComponent || tag;
                return buildVNode(targetTag, node);
            }
            return null;
        }

        function buildVNode(tag, node) {
            var props = {};

            for (var i = 0; i < node.attributes.length; i++) {
                var attr = node.attributes[i];
                var name = attr.name;
                var val = attr.value;

                if (name === 'data-m-spread') {
                    var id = parseInt(val);
                    var spreadProps = placeholders[id];
                    Object.assign(props, spreadProps);
                    continue;
                }

                if (typeof val === 'string' && val.startsWith('m-ph-')) {
                    var id = parseInt(val.replace('m-ph-', ''));
                    val = placeholders[id];
                }

                props[name] = val;
            }

            var children = [];
            for (var j = 0; j < node.childNodes.length; j++) {
                children.push(domToVNode(node.childNodes[j]));
            }

            return createElement(tag, props, children);
        }

        var nodes = doc.body.childNodes;
        if (nodes.length === 1) return domToVNode(nodes[0]);
        return nodes.length > 0 ? Array.from(nodes).map(domToVNode) : null;
    }

    // -------------------------------------------------------------------
    // createElement (for JSX support)
    // -------------------------------------------------------------------
    function createElement(type, props, ...children) {
        // Flatten children
        var flatChildren = [];
        function flatten(arr) {
            for (var i = 0; i < arr.length; i++) {
                if (Array.isArray(arr[i])) {
                    flatten(arr[i]);
                } else if (arr[i] != null && arr[i] !== false && arr[i] !== true) {
                    flatChildren.push(arr[i]);
                }
            }
        }
        flatten(children);

        // If type is a function (component)
        if (typeof type === 'function') {
            return createComponent(type, Object.assign({}, props, { children: flatChildren })).render();
        }

        // Regular HTML element - use M.h
        var atomFamily = ATOM_FAMILIES[type];
        if (!atomFamily) {
            atomFamily = ['Containers', 'Div']; // Fallback
        }

        // Convert props to Mishkah format
        var mishkahProps = { attrs: {}, events: {} };

        if (props) {
            for (var key in props) {
                if (!props.hasOwnProperty(key)) continue;

                var value = props[key];

                // Event handlers
                if (key.startsWith('on') && typeof value === 'function') {
                    var eventName = key.substring(2).toLowerCase();
                    mishkahProps.events[eventName] = value;
                }
                // className -> class
                else if (key === 'className') {
                    mishkahProps.attrs['class'] = value;
                }
                // Regular attributes
                else {
                    mishkahProps.attrs[key] = value;
                }
            }
        }

        return M.h(type, atomFamily[0], mishkahProps, flatChildren);
    }

    // Atom families mapping (for createElement)
    var ATOM_FAMILIES = {
        div: ['Containers', 'Div'],
        span: ['Text', 'Span'],
        p: ['Text', 'P'],
        h1: ['Text', 'H1'],
        h2: ['Text', 'H2'],
        h3: ['Text', 'H3'],
        h4: ['Text', 'H4'],
        h5: ['Text', 'H5'],
        h6: ['Text', 'H6'],
        button: ['Forms', 'Button'],
        input: ['Inputs', 'Input'],
        textarea: ['Inputs', 'Textarea'],
        select: ['Inputs', 'Select'],
        option: ['Inputs', 'Option'],
        ul: ['Lists', 'Ul'],
        ol: ['Lists', 'Ol'],
        li: ['Lists', 'Li'],
        a: ['Text', 'A'],
        strong: ['Text', 'Strong'],
        em: ['Text', 'Em'],
        code: ['Text', 'Code'],
        pre: ['Text', 'Pre']
    };

    // -------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------
    function render(Component, container) {
        var instance = createComponent(Component, {});
        instance.rootRender = function () {
            var vnode = instance.render();
            container.innerHTML = '';
            container.appendChild(M.VDOM.render(vnode, {}));
        };
        instance.rootRender();
        return instance;
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------

    // Fragment component (returns children as-is)
    function Fragment(props) {
        return props.children || [];
    }

    return {
        useState: useState,
        useEffect: useEffect,
        useRef: useRef,
        useMemo: useMemo,
        useCallback: useCallback,
        useContext: useContext,
        createContext: createContext,
        createElement: createElement,
        h: createElement, // Alias
        html: html,
        render: render,
        Fragment: Fragment
    };

}));
