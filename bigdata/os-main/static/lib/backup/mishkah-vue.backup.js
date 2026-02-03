!function (root, factory) { if (typeof define === 'function' && define.amd) { define(['mishkah'], function (M) { return factory(root, M) }) } else if (typeof module === 'object' && module.exports) { module.exports = factory(root, require('mishkah')) } else { root.Mishkah = root.Mishkah || {}; root.Mishkah.Vue = factory(root, root.Mishkah) } }(typeof window !== 'undefined' ? window : this, function (global, M) {
    'use strict';
    var targetMap = new WeakMap;
    var activeEffect = null;
    var shouldTrack = false;
    function track(target, key) { if (!shouldTrack || activeEffect === undefined) return; var depsMap = targetMap.get(target); if (!depsMap) { targetMap.set(target, depsMap = new Map) } var dep = depsMap.get(key); if (!dep) { depsMap.set(key, dep = new Set) } if (!dep.has(activeEffect)) { dep.add(activeEffect); activeEffect.deps.push(dep) } }
    function trigger(target, key) { var depsMap = targetMap.get(target); if (!depsMap) return; var effects = new Set; var deps = depsMap.get(key); if (deps) { deps.forEach(function (effect) { if (effect !== activeEffect) { effects.add(effect) } }) } effects.forEach(function (effect) { if (effect.scheduler) { effect.scheduler() } else { effect.run() } }) }
    function effect(fn, options) { var _effect = new ReactiveEffect(fn); if (options) { Object.assign(_effect, options) } if (!options || !options.lazy) { _effect.run() } var runner = _effect.run.bind(_effect); runner.effect = _effect; return runner }
    var ReactiveEffect = function (fn, scheduler) { this.deps = []; this.fn = fn; this.scheduler = scheduler; this.active = true }; ReactiveEffect.prototype.run = function () { if (!this.active) { return this.fn() } if (!effectStack.includes(this)) { try { effectStack.push(this); activeEffect = this; shouldTrack = true; return this.fn() } finally { effectStack.pop(); activeEffect = effectStack[effectStack.length - 1]; shouldTrack = effectStack.length > 0 } } }; ReactiveEffect.prototype.stop = function () { if (this.active) { cleanupEffect(this); if (this.onStop) { this.onStop() } this.active = false } };
    function cleanupEffect(effect) { effect.deps.forEach(function (dep) { dep.delete(effect) }); effect.deps.length = 0 }
    var effectStack = [];
    function reactive(raw) { if (raw && raw.__v_isReactive) { return raw } return new Proxy(raw, { get: function (target, key, receiver) { if (key === '__v_isReactive') return true; var res = Reflect.get(target, key, receiver); track(target, key); if (res != null && typeof res === 'object') { return reactive(res) } return res }, set: function (target, key, value, receiver) { var oldValue = target[key]; var res = Reflect.set(target, key, value, receiver); if (value !== oldValue) { trigger(target, key) } return res } }) }
    function ref(value) { return new RefImpl(value) }
    var RefImpl = function (value) { this._rawValue = value; this._value = convert(value); this.__v_isRef = true; this.dep = new Set }; Object.defineProperty(RefImpl.prototype, "value", { get: function () { trackRefValue(this); return this._value }, set: function (newVal) { if (newVal !== this._rawValue) { this._rawValue = newVal; this._value = convert(newVal); triggerRefValue(this) } }, enumerable: true, configurable: true });
    function convert(val) { return val != null && typeof val === 'object' ? reactive(val) : val }
    function trackRefValue(ref) { if (shouldTrack && activeEffect) { if (!ref.dep) { ref.dep = new Set } if (!ref.dep.has(activeEffect)) { ref.dep.add(activeEffect); activeEffect.deps.push(ref.dep) } } }
    function triggerRefValue(ref) { if (ref.dep) { var effects = new Set(ref.dep); effects.forEach(function (effect) { if (effect !== activeEffect) { if (effect.scheduler) { effect.scheduler() } else { effect.run() } } }) } }
    function computed(getter) { var _value; var _dirty = true; var _effect = new ReactiveEffect(getter, function () { if (!_dirty) { _dirty = true; triggerRefValue(cRef) } }); var cRef = { __v_isRef: true, get value() { if (_dirty) { _value = _effect.run(); _dirty = false } trackRefValue(cRef); return _value } }; return cRef }
    var queue = []; var isFlushing = false; var resolvedPromise = Promise.resolve();
    function queueJob(job) { if (!queue.includes(job)) { queue.push(job); queueFlush() } }
    function queueFlush() { if (!isFlushing) { isFlushing = true; resolvedPromise.then(flushJobs) } }
    function flushJobs() { try { for (var i = 0; i < queue.length; i++) { var job = queue[i]; if (job && job.active !== false) { job() } } } finally { isFlushing = false; queue.length = 0 } }
    function nextTick(fn) { return fn ? resolvedPromise.then(fn) : resolvedPromise }
    var currentInstance = null;
    function createComponentInstance(vnode) { var instance = { vnode: vnode, type: vnode.type, setupState: {}, isMounted: false, subTree: null, update: null, effects: [], provides: Object.create(null), ctx: {} }; instance.ctx._ = instance; return instance }
    function setupComponent(instance) { var setup = instance.type.setup; if (setup) { currentInstance = instance; var setupResult = setup(instance.type.props || {}, { emit: function () { } }); currentInstance = null; handleSetupResult(instance, setupResult) } else { finishComponentSetup(instance) } }
    function handleSetupResult(instance, setupResult) { if (typeof setupResult === 'function') { instance.render = setupResult } else if (typeof setupResult === 'object') { instance.setupState = setupResult } finishComponentSetup(instance) }
    function finishComponentSetup(instance) { if (!instance.render) { instance.render = instance.type.render || instance.type.template } }
    function mountComponent(vnode, container, anchor) { var instance = vnode.component = createComponentInstance(vnode); setupComponent(instance); setupRenderEffect(instance, vnode, container) }
    function attachEvents(vnode) {
        if (!vnode) return;
        if (vnode._vueEvents && vnode._dom) {
            for (var ev in vnode._vueEvents) {
                // Remove old listener if needed? For now just add (simple)
                // Real implementation might need to handle updates properly
                vnode._dom.addEventListener(ev, vnode._vueEvents[ev]);
            }
        }
        if (vnode.children) {
            for (var i = 0; i < vnode.children.length; i++) {
                attachEvents(vnode.children[i]);
            }
        }
    }
    function setupRenderEffect(instance, initialVNode, container) { instance.update = effect(function componentEffect() { if (!instance.isMounted) { var subTree = instance.subTree = renderComponentRoot(instance); M.VDOM.patch(container, subTree, null, {}, {}, ""); attachEvents(subTree); initialVNode.el = subTree.el ? subTree.el : container.firstChild; instance.isMounted = true; if (instance.mounted) { instance.mounted.forEach(function (hook) { hook() }) } } else { var nextTree = renderComponentRoot(instance); var prevTree = instance.subTree; instance.subTree = nextTree; var el = prevTree.el; M.VDOM.patch(el ? el.parentNode : container, nextTree, prevTree, {}, {}, ""); attachEvents(nextTree); instance.vnode.el = nextTree.el } }, { scheduler: function () { queueJob(instance.update) } }) }
    function renderComponentRoot(instance) { var render = instance.render; if (!render) return null; var proxy = new Proxy(instance.setupState, { get: function (target, key) { if (key in target) return target[key]; if (key in instance.ctx) return instance.ctx[key]; return undefined }, set: function (target, key, value) { if (key in target) { target[key] = value; return true } return false } }); return render.call(proxy, proxy) }
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
                cfg.attrs.gkey = 'vue:' + (++gkeyCounter);
            }
            var vnode = M.h(type, 'Vue', cfg, children != null ? children : []);
            vnode._vueEvents = events;
            return vnode;
        }
        return { tag: type, type: type, props: props || {}, children: children || [], category: 'Vue', key: props ? props.key : null }
    }
    function createApp(rootComponent) { return { mount: function (selector) { var container = typeof selector === 'string' ? document.querySelector(selector) : selector; var vnode = { tag: rootComponent, type: rootComponent, props: {}, children: [], category: 'Vue', appContext: {} }; mountComponent(vnode, container) } } }
    function inject(key, defaultValue) { if (currentInstance) { if (key in currentInstance.provides) { return currentInstance.provides[key] } else if (currentInstance.parent) { return currentInstance.parent.provides[key] } } return defaultValue }
    function provide(key, value) { if (currentInstance) { currentInstance.provides[key] = value } }
    function onMounted(fn) { if (currentInstance) { if (!currentInstance.mounted) currentInstance.mounted = []; currentInstance.mounted.push(fn) } }
    function onUnmounted(fn) { if (currentInstance) { if (!currentInstance.unmounted) currentInstance.unmounted = []; currentInstance.unmounted.push(fn) } }
    function onUpdated(fn) { if (currentInstance) { if (!currentInstance.updated) currentInstance.updated = []; currentInstance.updated.push(fn) } }
    function useDatabase() { var db = global.Mishkah ? global.Mishkah.Database : null; var dbRef = ref(db); return { data: dbRef, get: function (path) { var parts = path.split('.'); var val = dbRef.value; for (var i = 0; i < parts.length; i++) { val = val ? val[parts[i]] : null } return val }, set: function (path, value) { var parts = path.split('.'); var obj = dbRef.value; for (var i = 0; i < parts.length - 1; i++) { obj = obj[parts[i]] } obj[parts[parts.length - 1]] = value; triggerRefValue(dbRef) } } }
    function useI18n() { var i18nState = reactive({ lang: 'ar', dir: 'rtl', t: function (k) { return k } }); if (global.Mishkah && global.Mishkah.Database && global.Mishkah.Database.env) { i18nState.lang = global.Mishkah.Database.env.lang; i18nState.dir = global.Mishkah.Database.env.dir } return i18nState }
    function useTheme() { var themeState = reactive({ current: 'dark', tokens: {} }); if (global.Mishkah && global.Mishkah.Database && global.Mishkah.Database.env) { themeState.current = global.Mishkah.Database.env.theme } return themeState }
    return { createApp: createApp, h: h, ref: ref, reactive: reactive, computed: computed, watchEffect: effect, watch: function (src, cb) { var getter = typeof src === 'function' ? src : function () { return src.value }; var oldVal; effect(function () { var newVal = getter(); if (oldVal !== undefined && newVal !== oldVal) { cb(newVal, oldVal) } oldVal = newVal }) }, provide: provide, inject: inject, onMounted: onMounted, onUnmounted: onUnmounted, onUpdated: onUpdated, nextTick: nextTick, useDatabase: useDatabase, useI18n: useI18n, useTheme: useTheme, version: '3.1.0-standalone' }
})