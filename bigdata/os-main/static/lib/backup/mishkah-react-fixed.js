/*! 
 * mishkah-react.js - FIXED VERSION with ES5 compatibility
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

    // Logger
    var DEBUG = true;
    function log() {
        if (DEBUG && console && console.log) {
            console.log.apply(console, ['[Mishkah.React]'].concat(Array.prototype.slice.call(arguments)));
        }
    }

    log('Initializing Mishkah.React...');

    // Test createElement basic functionality
    function createElement(type, props) {
        log('createElement called:', type, props);

        try {
            // Get children from arguments
            var children = [];
            for (var i = 2; i < arguments.length; i++) {
                children.push(arguments[i]);
            }

            log('Children:', children);

            // Flatten children
            var flatChildren = [];
            function flatten(arr) {
                for (var j = 0; j < arr.length; j++) {
                    if (Array.isArray(arr[j])) {
                        flatten(arr[j]);
                    } else if (arr[j] != null && arr[j] !== false && arr[j] !== true) {
                        flatChildren.push(arr[j]);
                    }
                }
            }
            flatten(children);

            log('Flat children:', flatChildren);

            // Check if type exists
            if (!type) {
                throw new Error('createElement: type is required');
            }

            // If type is a function (component), call it
            if (typeof type === 'function') {
                log('Rendering component:', type.name || 'Anonymous');
                var componentProps = {};
                if (props) {
                    for (var key in props) {
                        if (props.hasOwnProperty(key)) {
                            componentProps[key] = props[key];
                        }
                    }
                }
                componentProps.children = flatChildren;

                var result = type(componentProps);
                log('Component result:', result);
                return result;
            }

            // HTML element
            log('Creating HTML element:', type);

            // Use M.h to create VDOM
            if (!M || !M.h) {
                throw new Error('Mishkah.h is not available!');
            }

            var mishkahProps = { attrs: {}, events: {} };

            if (props) {
                for (var key in props) {
                    if (!props.hasOwnProperty(key)) continue;

                    var value = props[key];

                    // Event handler (starts with 'on')
                    if (key.indexOf('on') === 0 && typeof value === 'function') {
                        var eventName = key.substring(2).toLowerCase();
                        mishkahProps.events[eventName] = value;
                    }
                    // className -> class
                    else if (key === 'className') {
                        mishkahProps.attrs['class'] = value;
                    }
                    // Regular attribute
                    else {
                        mishkahProps.attrs[key] = value;
                    }
                }
            }

            log('Mishkah props:', mishkahProps);

            var vnode = M.h(type, 'Auto', mishkahProps, flatChildren);
            log('Created vnode:', vnode);
            return vnode;

        } catch (error) {
            console.error('[Mishkah.React] createElement ERROR:', error);
            console.error('Stack:', error.stack);
            throw error;
        }
    }

    // Fragment component
    function Fragment(props) {
        return (props && props.children) || [];
    }

    // Simple render function
    function render(Component, container) {
        log('render() called');

        try {
            if (!Component) {
                throw new Error('render: Component is required');
            }
            if (!container) {
                throw new Error('render: container is required');
            }

            log('Calling component...');
            var vnode = Component();
            log('Component returned:', vnode);

            if (!M.VDOM || !M.VDOM.render) {
                throw new Error('M.VDOM.render is not available!');
            }

            log('Rendering VDOM...');
            var dom = M.VDOM.render(vnode, {});
            log('DOM created:', dom);

            container.innerHTML = '';
            container.appendChild(dom);
            log('SUCCESS: Rendered to container!');

        } catch (error) {
            console.error('[Mishkah.React] render ERROR:', error);
            console.error('Stack:', error.stack);

            // Show error in UI
            container.innerHTML = '<div style="padding:20px;background:#fee;border:2px solid #f00;color:#f00;font-family:monospace;">' +
                '<h3>Mishkah.React Error</h3>' +
                '<p><strong>Message:</strong> ' + error.message + '</p>' +
                '<pre>' + error.stack + '</pre>' +
                '</div>';

            throw error;
        }
    }

    log('Mishkah.React loaded successfully!');

    // Exports
    return {
        createElement: createElement,
        Fragment: Fragment,
        render: render,
        h: createElement
    };

}));
