!function (root, factory) { if (typeof define === 'function' && define.amd) { define(['mishkah'], function (M) { return factory(root, M) }) } else if (typeof module === 'object' && module.exports) { module.exports = factory(root, require('mishkah')) } else { root.Mishkah = root.Mishkah || {}; root.Mishkah.Vue = factory(root, root.Mishkah) } }(typeof window !== 'undefined' ? window : this, function (global, M) {
    'use strict';
    var targetMap = new WeakMap;
    var activeEffect = null;
    var shouldTrack = false;
    function track(target, key) { if (!shouldTrack || activeEffect === undefined) return; var depsMap = targetMap.get(target); if (!depsMap) { targetMap.set(target, depsMap = new Map) } var dep = depsMap.get(key); if (!dep) { depsMap.set(key, dep = new Set) } if (!dep.has(activeEffect)) { dep.add(activeEffect); activeEffect.deps.push(dep) } }
    function trigger(target, key) {
        var depsMap = targetMap.get(target);
        console.log('MishkahVue: trigger', key, depsMap ? 'FoundDeps' : 'NoDeps');
        if (!depsMap) return;
        var effects = new Set;
        var deps = depsMap.get(key);
        if (deps) { deps.forEach(function (effect) { if (effect !== activeEffect) { effects.add(effect) } }) }
        effects.forEach(function (effect) {
            console.log('MishkahVue: running effect', effect);
            if (effect.scheduler) { effect.scheduler() } else { effect.run() }
        })
    }
    function effect(fn, options) { var _effect = new ReactiveEffect(fn); if (options) { Object.assign(_effect, options) } if (!options || !options.lazy) { _effect.run() } var runner = _effect.run.bind(_effect); runner.effect = _effect; return runner }
    var ReactiveEffect = function (fn, scheduler) { this.deps = []; this.fn = fn; this.scheduler = scheduler; this.active = true }; ReactiveEffect.prototype.run = function () { if (!this.active) { return this.fn() } if (!effectStack.includes(this)) { try { effectStack.push(this); activeEffect = this; shouldTrack = true; return this.fn() } finally { effectStack.pop(); activeEffect = effectStack[effectStack.length - 1]; shouldTrack = effectStack.length > 0 } } }; ReactiveEffect.prototype.stop = function () { if (this.active) { cleanupEffect(this); if (this.onStop) { this.onStop() } this.active = false } };
    function cleanupEffect(effect) { effect.deps.forEach(function (dep) { dep.delete(effect) }); effect.deps.length = 0 }
    var effectStack = [];
    var arrayInstrumentations = {};
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(function (key) {
        arrayInstrumentations[key] = function () {
            var args = []; for (var i = 0; i < arguments.length; i++) args[i] = arguments[i];
            var res = Array.prototype[key].apply(this, args);
            trigger(this, 'length'); // Force trigger length
            trigger(this, '0'); // Force trigger generic
            return res;
        }
    });

    function reactive(raw) {
        if (!raw || typeof raw !== 'object') return raw;
        if (raw.__v_isReactive) return raw;
        return new Proxy(raw, {
            get: function (target, key, receiver) {
                if (key === '__v_isReactive') return true;
                if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
                    return arrayInstrumentations[key];
                }
                var res = Reflect.get(target, key, receiver);
                track(target, key);
                if (res != null && typeof res === 'object') { return reactive(res) }
                return res
            },
            set: function (target, key, value, receiver) {
                var oldValue = target[key];
                var res = Reflect.set(target, key, value, receiver);
                if (value !== oldValue || key === 'length') { trigger(target, key) }
                return res
            }
        })
    }
    function ref(value) { return new RefImpl(value) }
    var RefImpl = function (value) { this._rawValue = value; this._value = convert(value); this.__v_isRef = true; this.dep = new Set };
    RefImpl.prototype.toString = function () { trackRefValue(this); return String(this._value); };
    Object.defineProperty(RefImpl.prototype, "value", { get: function () { trackRefValue(this); return this._value }, set: function (newVal) { if (newVal !== this._rawValue) { this._rawValue = newVal; this._value = convert(newVal); triggerRefValue(this) } }, enumerable: true, configurable: true });
    function convert(val) { return val != null && typeof val === 'object' ? reactive(val) : val }
    function trackRefValue(ref) { if (shouldTrack && activeEffect) { if (!ref.dep) { ref.dep = new Set } if (!ref.dep.has(activeEffect)) { ref.dep.add(activeEffect); activeEffect.deps.push(ref.dep) } } }
    function triggerRefValue(ref) { if (ref.dep) { var effects = new Set(ref.dep); effects.forEach(function (effect) { if (effect !== activeEffect) { if (effect.scheduler) { effect.scheduler() } else { effect.run() } } }) } }
    function computed(getter) { var _value; var _dirty = true; var _effect = new ReactiveEffect(getter, function () { if (!_dirty) { _dirty = true; triggerRefValue(cRef) } }); var cRef = { __v_isRef: true, get value() { if (_dirty) { _value = _effect.run(); _dirty = false } trackRefValue(cRef); return _value }, toString: function () { return String(this.value); } }; return cRef }
    var queue = []; var isFlushing = false; var resolvedPromise = Promise.resolve();
    function queueJob(job) { if (!queue.includes(job)) { queue.push(job); queueFlush() } }
    function queueFlush() { if (!isFlushing) { isFlushing = true; resolvedPromise.then(flushJobs) } }
    function flushJobs() { try { for (var i = 0; i < queue.length; i++) { var job = queue[i]; if (job && job.active !== false) { job() } } } finally { isFlushing = false; queue.length = 0 } }
    function nextTick(fn) { return fn ? resolvedPromise.then(fn) : resolvedPromise }
    var currentInstance = null;
    function createComponentInstance(vnode, parent) {
        var provides = parent ? Object.create(parent.provides) : Object.create(null);
        var instance = {
            vnode: vnode,
            type: vnode.type,
            setupState: {},
            isMounted: false,
            subTree: null,
            update: null,
            effects: [],
            provides: provides,
            parent: parent,
            ctx: {}
        };
        instance.ctx._ = instance;
        // Expose $parent
        Object.defineProperty(instance.ctx, '$parent', { get: function () { return parent ? parent.ctx : null } });
        return instance
    }
    function emit(instance, event, args) {
        // Convert 'my-event' to 'onMyEvent'
        var camel = event.replace(/-(\w)/g, function (_, c) { return c ? c.toUpperCase() : '' });
        var handlerName = 'on' + camel.charAt(0).toUpperCase() + camel.slice(1);

        var handler = instance.vnode.props[handlerName];
        if (handler && typeof handler === 'function') {
            handler.apply(null, args);
        }
    }

    function setupComponent(instance) {
        var emitFn = function (event) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) args[_i - 1] = arguments[_i];
            emit(instance, event, args);
        };

        instance.emit = emitFn; // Internal access

        var setup = instance.type.setup;
        if (setup) {
            currentInstance = instance;
            var setupResult = setup(instance.type.props || {}, { emit: emitFn });
            currentInstance = null;
            handleSetupResult(instance, setupResult);
        } else {
            // Options API
            instance.ctx.$emit = emitFn;
            applyOptions(instance);
            finishComponentSetup(instance);
        }
    }

    function applyOptions(instance) {
        var options = instance.type;
        var publicThis = instance.ctx; // Setup context/proxy

        // 0. Before Create
        if (options.beforeCreate) {
            options.beforeCreate.call(publicThis);
        }

        if (!publicThis.$emit && instance.emit) {
            publicThis.$emit = instance.emit;
        }

        // 1. Methods
        if (options.methods) {
            for (var key in options.methods) {
                publicThis[key] = options.methods[key].bind(publicThis);
            }
        }

        // 2. Data
        if (options.data) {
            var data = options.data.call(publicThis);
            if (typeof data === 'object') {
                instance.setupState = reactive(data);
                // Mixin to publicThis
                for (var key in data) {
                    (function (k) {
                        Object.defineProperty(publicThis, k, {
                            configurable: true,
                            enumerable: true,
                            get: function () { return instance.setupState[k]; },
                            set: function (v) { instance.setupState[k] = v; }
                        });
                    })(key);
                }
            }
        } else {
            instance.setupState = reactive({});
        }

        // 3. Computed
        if (options.computed) {
            for (var key in options.computed) {
                var getter = options.computed[key];
                var c = computed(typeof getter === 'function' ? getter.bind(publicThis) : getter.get.bind(publicThis));
                // Expose unwrapped value to `this`
                (function (k, computedRef) {
                    Object.defineProperty(publicThis, k, {
                        configurable: true,
                        enumerable: true,
                        get: function () { return computedRef.value; },
                        set: function (v) { computedRef.value = v; }
                    });
                })(key, c);

                // Add to setupState so template proxy can see it
                instance.setupState[key] = c;
            }
        }

        // 4. Watch
        if (options.watch) {
            for (var key in options.watch) {
                var raw = options.watch[key];
                var handler = raw;
                var deep = false;
                var immediate = false;

                if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
                    handler = raw.handler;
                    deep = raw.deep;
                    immediate = raw.immediate;
                }

                (function (k, h, d, i) {
                    watch(function () {
                        var val = publicThis;
                        var parts = k.split('.');
                        for (var idx = 0; idx < parts.length; idx++) {
                            if (val == null) return undefined;
                            val = val[parts[idx]];
                        }
                        return val;
                    }, function (n, o) {
                        return typeof h === 'function' ? h.call(publicThis, n, o) : publicThis[h](n, o)
                    }, { deep: d, immediate: i });
                })(key, handler, deep, immediate);
            }
        }

        // 5. Provide / Inject (Options API)
        if (options.inject) {
            var injects = options.inject;
            if (Array.isArray(injects)) {
                for (var i = 0; i < injects.length; i++) {
                    var key = injects[i];
                    // define property on publicThis
                    (function (k) {
                        Object.defineProperty(publicThis, k, {
                            get: function () { return inject(k) },
                            enumerable: true
                        });
                    })(key);
                }
            } else {
                // Object syntax check
                for (var key in injects) {
                    var opt = injects[key];
                    var from = typeof opt === 'object' ? opt.from : opt;
                    var def = typeof opt === 'object' ? opt.default : undefined;
                    (function (k, f, d) {
                        var resolved = inject(f || k, d); // Eager resolve
                        Object.defineProperty(publicThis, k, {
                            get: function () { return resolved },
                            enumerable: true
                        });
                    })(key, from, def);
                }
            }
        }
        if (options.provide) {
            var provides = typeof options.provide === 'function' ? options.provide.call(publicThis) : options.provide;
            for (var key in provides) {
                provide(key, provides[key]);
            }
        }

        // 5. Lifecycle
        if (options.beforeMount) {
            instance.beforeMount = instance.beforeMount || [];
            instance.beforeMount.push(options.beforeMount.bind(publicThis));
        }
        if (options.mounted) onMounted(options.mounted.bind(publicThis));
        if (options.updated) onUpdated(options.updated.bind(publicThis));
        if (options.unmounted) onUnmounted(options.unmounted.bind(publicThis));

        // 6. Created
        if (options.created) {
            options.created.call(publicThis);
        }
    }
    function handleSetupResult(instance, setupResult) { if (typeof setupResult === 'function') { instance.render = setupResult } else if (typeof setupResult === 'object') { instance.setupState = setupResult } finishComponentSetup(instance) }
    function finishComponentSetup(instance) { if (!instance.render) { instance.render = instance.type.render || instance.type.template } }
    function mountComponent(vnode, container, anchor) { var instance = vnode.component = createComponentInstance(vnode); setupComponent(instance); setupRenderEffect(instance, vnode, container) }
    // EVENT DELEGATION SYSTEM
    var eventRegistry = new Map(); // gkey -> handlers
    var delegatedEvents = new Set(); // set of event names (click, input, etc.) attached to doc/root

    function registerEvents(gkey, events) {
        eventRegistry.set(gkey, events);
        // Ensure we listen for these event types globally
        for (var ev in events) {
            if (!delegatedEvents.has(ev)) {
                delegatedEvents.add(ev);
                document.addEventListener(ev, globalEventHandler, true); // Capture or Bubble? Usually bubble. Let's use capture for safety or bubble? 
                // React uses bubble for most. Mishkah Core uses bubble.
                // Re-doing: use bubble listener on document is easiest.
                // But wait, existing code might stop propagation. 
                // Let's stick to document level bubble.
            }
        }
    }

    function globalEventHandler(e) {
        var target = e.target;
        while (target) {
            // Mishkah Core uses 'data-m-gkey'
            var gkey = target.getAttribute ? target.getAttribute('data-m-gkey') : null;
            if (gkey) {
                var handlers = eventRegistry.get(gkey);
                // Mishkah allows multiple gkeys split by space/comma?
                // Our generator produces single key 'vue:x'. 
                // But let's be safe and check if we need to split.
                // For now, simpler is better.
                if (handlers && handlers[e.type]) {
                    handlers[e.type](e);
                }
            }
            target = target.parentNode;
            if (target === document) break;
        }
    }

    // Ensure we handle global listeners once. 
    // Optimization: we can just attach common ones, or dynamic.
    // Dynamic is implemented above (add on first use).

    function attachEvents(vnode) {
        // No-op for direct DOM attachment now. 
        // We rely on gkey and global delegation.
        // BUT we need to ensure gkey attribute is actually on the DOM.
        // M.VDOM.patch does set attributes from props/attrs.
        // My h() puts gkey in attrs.gkey, so M.VDOM.h puts it in attrs.
        // patch() should apply it.
    }

    // Updated h function
    var gkeyCounter = 0;
    function h(type, props, children) {
        if (typeof type === 'string') {
            var cfg = { attrs: {} };
            var events = {};
            if (props) {
                for (var k in props) {
                    if (k.indexOf('on') === 0 && typeof props[k] === 'function') {
                        events[k.toLowerCase().substring(2)] = props[k];
                    } else if (k === 'class' || k === 'className') {
                        cfg.attrs['class'] = props[k];
                    } else {
                        cfg.attrs[k] = props[k];
                    }
                }
            }
            if (Object.keys(events).length > 0) {
                var gk = 'vue:' + (++gkeyCounter);
                cfg.attrs.gkey = gk;
                // Register globally
                registerEvents(gk, events);
            }
            // Pass to Core
            var vnode = M.h(type, 'Vue', cfg, children != null ? children : []);
            // vnode._vueEvents = events; // Not needed on vnode anymore for attach, but maybe for cleanup?
            // Cleanup is hard in this simple engine (when element removed, registry leaks).
            // For now, infinite registry (simple).
            return vnode;
        }
        return { tag: type, type: type, props: props || {}, children: children || [], category: 'Vue', key: props ? props.key : null }
    }

    // Proxy Handler with Global Helpers
    var proxyHandler = {
        get: function (target, key, receiver) {
            var val;
            // 1. Setup State
            if (key in target) val = target[key];
            // 2. Context (Methods, etc)
            else if (key in currentInstance.ctx) val = currentInstance.ctx[key]; // currentInstance usage here is risky if not bound? 
            // Wait, proxy is created per instance. receiver is proxy.
            // We need 'instance' in scope. We can't use generic handler easily if we need closure.
            // Revert to inline closure in renderComponentRoot.
            else return undefined;
            return (val && val.__v_isRef) ? val.value : val;
        },
        set: function (target, key, value) {
            if (key in target) {
                var curr = target[key];
                if (curr && curr.__v_isRef && !value.__v_isRef) {
                    curr.value = value; return true
                }
                target[key] = value; return true
            }
            return false
        }
    };

    function renderComponentRoot(instance) {
        var render = instance.render;
        if (!render) return null;

        // Add Global Helpers to Context if not present
        if (!instance.ctx.$t) {
            var i18n = useI18n();
            instance.ctx.$t = i18n.t;
            instance.ctx.$i18n = i18n;
            instance.ctx.$db = useDatabase();
            instance.ctx.$theme = useTheme();
        }

        var proxy = new Proxy(instance.setupState, {
            get: function (target, key) {
                var val;
                // 1. Setup State (Data)
                if (key in target) val = target[key];
                // 2. Context (Methods, $t, $db)
                else if (key in instance.ctx) val = instance.ctx[key];
                else return undefined;
                return (val && val.__v_isRef) ? val.value : val;
            },
            set: function (target, key, value) {
                if (key in target) {
                    var curr = target[key];
                    if (curr && curr.__v_isRef && !value.__v_isRef) {
                        curr.value = value; return true
                    }
                    target[key] = value; return true
                }
                return false
            }
        });
        return render.call(proxy, proxy)
    }

    // Update attachEvents to do nothing (or just recursion if needed logic later)
    // Actually we can remove calls to attachEvents from setupRenderEffect?
    function setRefs(instance, vnode) {
        if (!vnode) return;

        var el = vnode.el || vnode._dom;

        if (vnode.props && vnode.props.ref && el) {
            instance.refs[vnode.props.ref] = el;
        } else if (vnode.attrs && vnode.attrs.ref && el) {
            // Fallback if M.h put it in attrs
            instance.refs[vnode.attrs.ref] = el;
        }

        if (vnode.children && Array.isArray(vnode.children)) {
            for (var i = 0; i < vnode.children.length; i++) {
                setRefs(instance, vnode.children[i]);
            }
        }
    }

    function expandComponentTree(vnode, parentInstance) {
        if (!vnode) return vnode;

        try {
            // Handle Array of children
            if (Array.isArray(vnode)) {
                return vnode.map(function (c) { return expandComponentTree(c, parentInstance) });
            }

            // Resolve String Tags (from vnode.type OR vnode.tag)
            // Mishkah Core vnode uses .tag (lowercased). Vue uses .type.
            var tagToCheck = vnode.type;
            if (typeof tagToCheck !== 'string' && typeof vnode.tag === 'string') {
                tagToCheck = vnode.tag;
            }

            if (typeof tagToCheck === 'string' && parentInstance && parentInstance.type.components) {
                var comps = parentInstance.type.components;
                var found = comps[tagToCheck]; // Direct match

                // Debug: Log only for our suspect
                if (tagToCheck === 'childcomp' || tagToCheck === 'ChildComp') {
                    console.log('MishkahVue: resolving', tagToCheck, 'FoundDirect:', !!found, 'Keys:', Object.keys(comps));
                }

                if (!found) {
                    // Case-insensitive match (kebab or pascal vs lower)
                    var lower = tagToCheck.toLowerCase();
                    for (var key in comps) {
                        if (key.toLowerCase() === lower ||
                            key.replace(/-/g, '').toLowerCase() === lower) {
                            found = comps[key];
                            if (tagToCheck === 'childcomp') console.log('MishkahVue: Found Fuzzy:', key);
                            break;
                        }
                    }
                }

                if (found) {
                    vnode.type = found;
                    // Important: If we switch type to object, we must ensure properties match what createComponentInstance expects.
                    // It uses 'type', 'props', etc.
                    // M.h puts props in vnode.props.
                }
            } else if ((tagToCheck === 'childcomp' || tagToCheck === 'ChildComp')) {
                console.warn('MishkahVue: expand failed preconditions', {
                    tag: tagToCheck,
                    hasParent: !!parentInstance,
                    hasType: parentInstance && !!parentInstance.type,
                    hasComps: parentInstance && parentInstance.type && !!parentInstance.type.components
                });
            }

            // If it's a Component VNode (now resolved)
            if (typeof vnode.type === 'object') {
                var instance = vnode.component;
                if (!instance) {
                    // Pass parentInstance for inheritance
                    instance = vnode.component = createComponentInstance(vnode, parentInstance);
                    // Inherit context/provides if needed?
                    setupComponent(instance);
                }

                var subTree = renderComponentRoot(instance);
                instance.subTree = subTree;

                var expandedTree = expandComponentTree(subTree, instance);

                // FORWARDING COMPONENT PROPS (Ref, Key, Class, Style -> Fallthrough)
                if (expandedTree && typeof expandedTree === 'object') {
                    // Forward Key
                    if (vnode.key != null) expandedTree.key = vnode.key;
                    // Forward Ref (append or overwrite?)
                    if (vnode.props && vnode.props.ref) {
                        // If root also has ref, we might lose one. Vue 3 merges refs? 
                        // For now, Component ref takes precedence for the parent to see it.
                        // Actually, we shouldn't modify expandedTree.props directly if it's shared?
                        // But strictly it's a fresh VNode from render().
                        expandedTree.props = expandedTree.props || {};
                        expandedTree.props.ref = vnode.props.ref;
                    }
                    // Forward ID, Class, Style (Basic Fallthrough)
                    if (vnode.props) {
                        expandedTree.props = expandedTree.props || {};
                        if (vnode.props.id) expandedTree.props.id = vnode.props.id;
                        if (vnode.props.class) {
                            expandedTree.props.class = (expandedTree.props.class || '') + ' ' + vnode.props.class;
                        }
                        // if (vnode.props.style) {
                        //     // Merge styles?
                        // }
                    }
                }

                return expandedTree;
            }

            // If it's an Element VNode
            if (vnode.children && Array.isArray(vnode.children)) {
                for (var i = 0; i < vnode.children.length; i++) {
                    vnode.children[i] = expandComponentTree(vnode.children[i], parentInstance);
                }
            }

            return vnode;
        } catch (e) {
            console.error('MishkahVue: Error expanding component tree', e);
            return null;
        }
    }

    // User wants "delegation", so we registered in h().
    // The DOM attributes 'gkey' are set by M.VDOM.patch.
    // The Global Listener handles it.
    // So setupRenderEffect can just patch.

    function updateSlots(instance, children) {
        // Simple slot support: if children is array -> default slot
        // If children is object -> named slots
        instance.slots = instance.slots || {};
        if (Array.isArray(children)) {
            instance.slots.default = function () { return children };
        } else if (typeof children === 'object' && children !== null) {
            for (var key in children) {
                var val = children[key];
                instance.slots[key] = typeof val === 'function' ? val : function () { return val };
            }
        } else {
            instance.slots.default = function () { return [] };
        }
    }

    function setupComponent(instance) {
        var emitFn = function (event) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) args[_i - 1] = arguments[_i];
            emit(instance, event, args);
        };

        instance.emit = emitFn;
        updateSlots(instance, instance.vnode.children); // Init slots

        var setup = instance.type.setup;
        if (setup) {
            currentInstance = instance;
            // Pass slots to setup context
            var setupResult = setup(instance.type.props || {}, { emit: emitFn, slots: instance.slots });
            currentInstance = null;
            handleSetupResult(instance, setupResult);
        } else {
            // Options API
            instance.ctx.$emit = emitFn;
            instance.ctx.$slots = instance.slots;

            // Set currentInstance so global helpers (onMounted, etc.) work within applyOptions
            currentInstance = instance;
            applyOptions(instance);
            currentInstance = null;

            finishComponentSetup(instance);
        }
    }

    // ... setRefs ...

    function setupRenderEffect(instance, initialVNode, container) {
        instance.update = effect(function componentEffect() {
            try {
                if (!instance.isMounted) {
                    // Before Mount Hook
                    if (instance.beforeMount) {
                        instance.beforeMount.forEach(function (hook) { hook() });
                    }

                    var rawSubTree = renderComponentRoot(instance);
                    // Expand Components recursively
                    var subTree = instance.subTree = expandComponentTree(rawSubTree, instance);

                    M.VDOM.patch(container, subTree, null, {}, {}, "");
                    initialVNode.el = subTree.el || subTree._dom || container.firstChild;

                    // Set Refs after mount
                    instance.refs = {};
                    instance.ctx.$refs = instance.refs;
                    setRefs(instance, subTree);

                    instance.isMounted = true;
                    if (instance.mounted) {
                        instance.mounted.forEach(function (hook) { hook() })
                    }
                } else {
                    // ... update logic
                    var rawNextTree = renderComponentRoot(instance);
                    var nextTree = expandComponentTree(rawNextTree, instance);

                    var prevTree = instance.subTree;
                    instance.subTree = nextTree;
                    var el = prevTree.el;
                    M.VDOM.patch(el ? el.parentNode : container, nextTree, prevTree, {}, {}, "");
                    instance.vnode.el = nextTree.el;

                    // Update Refs & Slots
                    instance.refs = {};
                    instance.ctx.$refs = instance.refs;
                    updateSlots(instance, instance.vnode.children);
                    // Note: instance.vnode should be the *new* vnode passed by parent update, 
                    // but currently setupRenderEffect is self-contained for state updates.
                    // Parent updates (props changing) is a missing piece in this simplified engine:
                    // The parent's patch would need to call `instance.update()` after updating instance.vnode.
                    // For now, this handles local state re-renders (slots don't change locally usually).

                    setRefs(instance, nextTree);

                    if (instance.updated) {
                        instance.updated.forEach(function (hook) { hook() })
                    }
                }
            } catch (e) {
                console.error('MishkahVue: Render Error', e);
            }
        }, { scheduler: function () { queueJob(instance.update) } })
    }

    // Init Global Listeners on First Load?
    // We do it lazily in h().

    function createApp(rootComponent) {
        return {
            mount: function (selector) {
                var container = typeof selector === 'string' ? document.querySelector(selector) : selector;
                var vnode = { tag: rootComponent, type: rootComponent, props: {}, children: [], category: 'Vue', appContext: {} };
                mountComponent(vnode, container)
            }
        }
    }

    function inject(key, defaultValue) { if (currentInstance) { if (key in currentInstance.provides) { return currentInstance.provides[key] } else if (currentInstance.parent) { return currentInstance.parent.provides[key] } } return defaultValue }
    function provide(key, value) { if (currentInstance) { currentInstance.provides[key] = value } }
    function onMounted(fn) { if (currentInstance) { if (!currentInstance.mounted) currentInstance.mounted = []; currentInstance.mounted.push(fn) } }
    function onUnmounted(fn) { if (currentInstance) { if (!currentInstance.unmounted) currentInstance.unmounted = []; currentInstance.unmounted.push(fn) } }
    function onUpdated(fn) { if (currentInstance) { if (!currentInstance.updated) currentInstance.updated = []; currentInstance.updated.push(fn) } }

    // GLOBAL INIT & STATE
    var globalState = reactive({ db: { data: {}, env: { lang: 'ar', dir: 'rtl', theme: 'dark' }, i18n: { dict: {} } }, theme: { tokens: {}, vars: {}, current: 'dark' } });
    console.log('MishkahVue: globalState initialized:', globalState);

    function initMishkah(config) {
        console.log('MishkahVue: initMishkah called with:', config);
        console.log('MishkahVue: globalState inside init:', globalState);
        if (config) {
            if (config.env) Object.assign(globalState.db.env, config.env);
            if (config.i18n) globalState.db.i18n = config.i18n;
            // Merge arbitrary data
            for (var k in config) {
                if (k !== 'env' && k !== 'i18n') globalState.db.data[k] = config[k];
            }
        }
        // Sync with Core if available
        if (global.Mishkah && global.Mishkah.Database) {
            global.Mishkah.Database = globalState.db; // Overwrite or Sync? Best to sync
        }
        updateThemeVariables();
    }
    function useDatabase() { return { data: computed(function () { return globalState.db.data }), get: function (path) { var parts = path.split('.'); var val = globalState.db.data; for (var i = 0; i < parts.length; i++) { val = val ? val[parts[i]] : null } return val }, set: function (path, value) { var parts = path.split('.'); var obj = globalState.db.data; for (var i = 0; i < parts.length - 1; i++) { if (!obj[parts[i]]) obj[parts[i]] = {}; obj = obj[parts[i]] } obj[parts[parts.length - 1]] = value } } }
    function useI18n() {
        var t = function (key) {
            var lang = globalState.db.env.lang || 'en';
            var dict = globalState.db.i18n.dict || {};
            // 1. Try Key-based (User Preference): dict.title.ar
            if (dict[key] && dict[key][lang]) return dict[key][lang];
            // 2. Try Lang-based (Legacy/Provided Data): dict.ar.title
            if (dict[lang] && dict[lang][key]) return dict[lang][key];
            return key;
        };
        return {
            t: t,
            lang: computed(function () { return globalState.db.env.lang }),
            dir: computed(function () { return globalState.db.env.dir }),
            toggleLang: function () {
                var newLang = globalState.db.env.lang === 'ar' ? 'en' : 'ar';
                globalState.db.env.lang = newLang;
                globalState.db.env.dir = newLang === 'ar' ? 'rtl' : 'ltr';
                document.documentElement.lang = newLang;
                document.documentElement.dir = globalState.db.env.dir;
            }
        };
    }
    function useTheme() {
        return {
            theme: computed(function () { return globalState.db.env.theme }),
            tokens: globalState.theme.tokens,
            vars: globalState.theme.vars,
            toggleTheme: function () {
                var newTheme = globalState.db.env.theme === 'dark' ? 'light' : 'dark';
                globalState.db.env.theme = newTheme;
                updateThemeVariables();
            }
        };
    }
    function updateThemeVariables() {
        var isDark = globalState.db.env.theme === 'dark';
        var tokens = {
            colors: {
                background: isDark ? '#0a0a0a' : '#ffffff',
                foreground: isDark ? '#ffffff' : '#000000',
                primary: '#3b82f6',
                secondary: '#6366f1',
                card: isDark ? '#1a1a1a' : '#f3f4f6',
                border: isDark ? '#333333' : '#e5e7eb',
                muted: isDark ? '#888888' : '#6b7280'
            },
            radius: { sm: '4px', md: '8px', lg: '16px', full: '9999px' },
            spacing: { sm: '8px', md: '16px', lg: '24px' }
        };
        globalState.theme.tokens = tokens;
        var vars = {};
        function flatten(obj, prefix) {
            for (var k in obj) {
                if (typeof obj[k] === 'object') { flatten(obj[k], prefix + '-' + k) }
                else { vars[prefix + '-' + k] = obj[k] }
            }
        }
        flatten(tokens, '--color'); // Simplified mapping
        // Fix mapping manually for better control
        vars['--color-background'] = tokens.colors.background;
        vars['--color-foreground'] = tokens.colors.foreground;
        vars['--color-primary'] = tokens.colors.primary;
        vars['--color-card'] = tokens.colors.card;
        vars['--color-border'] = tokens.colors.border;
        vars['--color-muted'] = tokens.colors.muted;

        globalState.theme.vars = vars;

        // Inject into root
        if (typeof document !== 'undefined') {
            var root = document.documentElement;
            for (var v in vars) { root.style.setProperty(v, vars[v]) }
        }
    }
    function html(strings) {
        var values = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            values[_i - 1] = arguments[_i];
        }
        // This is a placeholder for standard tagged template handling
        // In a real scenario, this would need complex parsing or be handled by the transform
        // But since we use mishkah-vue-jsx transformer, this function might just receive processed values
        // For the sake of the complete example which uses html`...`, we might need a runtime parser or the transformer
        // should handle it. Given the transformer 'mishkah-vue-jsx.js' is active, it likely transforms JSX, 
        // but if the user uses html`...` explicitly, that needs a runtime parser.
        // HOWEVER, the user asked for JSX transformer. The complete example uses `html` tagged template.
        // Let's implement a basic one or assume the transformer converts it?
        // Actually the transformer MishkahVueJSX converts <tags>.
        // If the user code has html`...`, that's valid JS, transformer won't touch it unless we tell it.
        // We'll stick to the requested "Mishkah.Vue.html" being available.
        // For now, let's just warn or handle simple string interpolation if used as a cheap way?
        // No, better to stick to h() or JSX. But to support the example:
        return "HTML Tagged Template not fully supported in Standalone Mode yet. Use JSX <script type='text/mishkah-vue'>";
    }

    function renderList(source, renderItem) {
        if (Array.isArray(source)) {
            return source.map(renderItem);
        } else if (typeof source === 'number') {
            var res = [];
            for (var i = 0; i < source; i++) res.push(renderItem(i + 1, i));
            return res;
        } else if (typeof source === 'object') {
            return Object.keys(source).map(function (key, index) {
                return renderItem(source[key], key, index);
            });
        }
        return [];
    }
    function watch(src, cb, options) {
        var getter = typeof src === 'function' ? src : function () { return src.value };
        var oldVal;
        var opts = options || {};

        // Wrap getter for deep tracking
        if (opts.deep) {
            var baseGetter = getter;
            getter = function () {
                var val = baseGetter();
                traverse(val); // Trigger tracking for all nested props
                return val;
            }
        }

        var job = function () {
            // Re-run getter to track and get new value
            var newVal = runner();
            if (newVal !== oldVal || opts.deep) {
                cb(newVal, oldVal);
                oldVal = opts.deep ? JSON.parse(JSON.stringify(newVal)) : newVal;
            }
        };

        var runner = effect(getter, { lazy: true, scheduler: job });

        // Initial Run
        if (opts.immediate) {
            oldVal = runner();
            cb(oldVal, undefined);
            oldVal = opts.deep ? JSON.parse(JSON.stringify(oldVal)) : oldVal;
        } else {
            oldVal = runner();
            oldVal = opts.deep ? JSON.parse(JSON.stringify(oldVal)) : oldVal;
        }
        return runner;
    }

    function traverse(value, seen) {
        if (!typeof value === 'object' || value === null) return value;
        seen = seen || new Set();
        if (seen.has(value)) return value;
        seen.add(value);
        if (Array.isArray(value)) {
            for (var i = 0; i < value.length; i++) traverse(value[i], seen);
        } else {
            for (var key in value) traverse(value[key], seen);
        }
        return value;
    }

    return {
        createApp: createApp,
        h: h,
        ref: ref,
        reactive: reactive,
        computed: computed,
        watchEffect: effect,
        watch: watch,
        provide: function (k, v) {
            console.log('MishkahVue: provide', k, v, currentInstance ? 'HasInstance' : 'NoInstance');
            provide(k, v)
        },
        inject: function (k, d) {
            var res = inject(k, d);
            console.log('MishkahVue: inject', k, res, currentInstance ? 'HasInstance' : 'NoInstance');
            return res;
        },
        renderList: renderList,
        onMounted: onMounted,
        onUnmounted: onUnmounted,
        onUpdated: onUpdated,
        nextTick: nextTick,
        useDatabase: useDatabase,
        useI18n: useI18n,
        useTheme: useTheme,
        initMishkah: initMishkah,
        html: html,
        version: '3.3.0-standalone'
    }
})