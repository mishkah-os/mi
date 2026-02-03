/*!
 * mishkah.rulecenter.js — Mishkah RuleCenter (UMD)
 * Centralized rules engine: registration, matching, scoring, evaluation
 * Works with mishkah.core.js contracts (replaces the stub)
 * 2025-10-02
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () { return factory(root, root.Mishkah); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, root.Mishkah);
  } else {
    root.Mishkah = factory(root, root.Mishkah);
  }
}(typeof window !== 'undefined' ? window : this, function (global, existing) {
  "use strict";

  var M = existing || (global.Mishkah = {});

  // -------------------------------------------------------------------
  // Tiny utils
  // -------------------------------------------------------------------
  function isArr(v){ return Array.isArray(v); }
  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
  function toArr(v){ return v == null ? [] : (isArr(v) ? v : [v]); }
  function assign(t){ if(!isObj(t)) t={}; for (var i=1;i<arguments.length;i++){ var s=arguments[i]; if(!isObj(s)) continue; for (var k in s) t[k]=s[k]; } return t; }
  function uniqId(prefix){ return String(prefix||'r')+'-'+Math.random().toString(36).slice(2,8)+'-'+Date.now().toString(36).slice(-4); }

  function str(v){ return v==null ? '' : String(v); }

  // Wildcard / RegExp / exact matching over list of candidates
  function matchAny(patterns, candidates){
    var pats = toArr(patterns), cands = toArr(candidates);
    if (!pats.length) return true;            // no pattern means "match all"
    if (!cands.length) return false;

    for (var i=0;i<pats.length;i++){
      var p = pats[i]; if (p == null) continue;

      // allow function pattern (custom)
      if (typeof p === 'function'){
        try { if (p(cands)) return true; } catch(_) {}
        continue;
      }

      if (p instanceof RegExp){
        for (var j=0;j<cands.length;j++){
          var c = str(cands[j]);
          try { if (p.test(c)) return true; } catch(_){}
        }
        continue;
      }

      // string with * wildcard (prefix/suffix)
      var s = str(p);
      var isPrefix = (s.length && s.charAt(s.length-1) === '*');
      var isSuffix = (s.length && s.charAt(0) === '*');
      if (isPrefix){
        var pref = s.slice(0,-1);
        for (var j2=0;j2<cands.length;j2++){
          if (str(cands[j2]).indexOf(pref) === 0) return true;
        }
        continue;
      }
      if (isSuffix){
        var suf = s.slice(1);
        for (var j3=0;j3<cands.length;j3++){
          var cc = str(cands[j3]);
          if (cc.length>=suf.length && cc.lastIndexOf(suf) === (cc.length - suf.length)) return true;
        }
        continue;
      }
      // exact
      for (var j4=0;j4<cands.length;j4++){ if (str(cands[j4]) === s) return true; }
    }
    return false;
  }

  function intersectAny(a, b){
    var A = toArr(a), B = toArr(b);
    if (!A.length || !B.length) return false;
    var set = new Set();
    for (var i=0;i<A.length;i++) set.add(String(A[i]));
    for (var j=0;j<B.length;j++) if (set.has(String(B[j]))) return true;
    return false;
  }

  // Guarded console via Auditor if available
  function log(type, code, msg, ctx){
    try {
      if (M.Auditor && typeof M.Auditor[type] === 'function') {
        M.Auditor[type](code, msg, ctx);
      } else if (typeof console !== 'undefined' && console[type]) {
        console[type]((code?code+' ':'')+'[RuleCenter] '+msg, ctx||'');
      }
    } catch (_) {}
  }

  // -------------------------------------------------------------------
  // Rule schema (informative)
  // {
  //   id: string (unique)                    // optional: auto if missing
  //   enabled: boolean                       // default true
  //   stage: 'event'|'vnode'|'state'|'afterRender'|'*'|string|string[]
  //   scope: 'guard'|'auditor'|'*'           // informative
  //   type:  'PROHIBITED'|'VIOLATION'|'MAKRUH'|'PREFERENCE'|'MUBAH'
  //   score: number                          // negative for bad, positive for good
  //   priority: number                       // higher runs first
  //   roles: string[]                        // active roles intersection
  //   tags: string[]                         // rule tags (informative / filtering)
  //   action: 'block'|'warn'|'none'          // 'block' => throw on fail
  //   message: string                        // human message
  //   owner: string                          // who added the rule
  //
  //   // matching:
  //   match: {
  //     eventTypes?: string[]|RegExp|function(cands){...}
  //     keys?:      string[]|RegExp|function(cands){...}   // matches keysPath
  //     gkeys?:     string[]|RegExp|function(cands){...}   // matches gkeysPath
  //     roles?:     string[]                               // same as rule.roles (overrides if given)
  //     vnodeTags?: string[]|RegExp                        // vnode.tag
  //     selector?:  string                                 // CSS selector against payload.el or payload.vnode._dom
  //     custom?:    function(payload, ctx){ return true/false }
  //   }
  //
  //   // logic:
  //   predicate: function(payload, ctx){ return true/false },
  // }
  // -------------------------------------------------------------------

  // Internal storage
  var _byId = new Map();     // id -> rule
  var _list = [];            // array sorted by priority (desc) then id

  function _normalizeStage(s) {
    var arr = toArr(s);
    if (!arr.length) return ['*'];
    var out = [];
    for (var i=0;i<arr.length;i++){
      var x = String(arr[i] || '*').toLowerCase().trim();
      out.push(x);
    }
    return out;
  }

  function _normalizeRule(rule) {
    if (!isObj(rule)) return null;
    var r = assign({}, rule);
    if (!r.id) r.id = uniqId('rule');
    r.enabled  = (r.enabled !== false);
    r.priority = (r.priority|0) || 0;
    r.stageArr = _normalizeStage(r.stage || '*');
    r.scope    = r.scope ? String(r.scope).toLowerCase() : '*';
    r.type     = r.type || 'VIOLATION';
    r.score    = (typeof r.score === 'number') ? r.score : 0;
    if (r.match && !isObj(r.match)) r.match = {};
    if (r.roles && !isArr(r.roles)) r.roles = toArr(r.roles);
    return r;
  }

  function _resort(){
    _list = Array.from(_byId.values());
    _list.sort(function(a,b){
      var pa = (a.priority|0), pb = (b.priority|0);
      if (pb !== pa) return pb - pa;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  // Matching helpers per stage
  function _activeRoles(ctx, db){
    var roles = [];
    try {
      if (db && db.guardian && isArr(db.guardian.activeRoles)) roles = db.guardian.activeRoles.slice();
      else if (db && db.guardian && db.guardian.activeRoles) roles = toArr(db.guardian.activeRoles);
    } catch(_) {}
    if (!roles.length) roles = ['*'];
    return roles;
  }

  function _matchRuleToPayload(rule, stage, payload, ctx) {
    if (!rule.enabled) return false;

    // stage filter
    if (rule.stageArr.indexOf('*') === -1 && rule.stageArr.indexOf(stage) === -1) return false;

    // roles filter (either rule.roles or match.roles)
    var rolesCond = (rule.match && rule.match.roles) ? rule.match.roles : rule.roles;
    if (isArr(rolesCond)) {
      var act = _activeRoles(ctx, payload && (payload.db || payload.state && payload.state.db));
      if (!intersectAny(rolesCond, act) && rolesCond.indexOf('*') === -1) return false;
    }

    var m = rule.match || {};

    // selector match if available
    if (m.selector) {
      var el = null;
      if (stage === 'event' && payload && payload.event && payload.event.target && payload.event.target.closest) {
        el = payload.event.target;
      } else if (stage === 'vnode' && payload && payload.vnode && payload.vnode._dom) {
        el = payload.vnode._dom;
      } else if (payload && payload.el) {
        el = payload.el;
      }
      try {
        if (!el || !el.closest || !el.closest(String(m.selector))) return false;
      } catch(_) { return false; }
    }

    // custom match hook
    if (typeof m.custom === 'function') {
      try { if (!m.custom(payload, ctx)) return false; } catch(_){ return false; }
    }

    // Stage-specific matching
    if (stage === 'event') {
      var evType = (payload && payload.type) ? String(payload.type).toLowerCase() : '';
      var keysPath  = (payload && payload.keysPath)  || [];
      var gkeysPath = (payload && payload.gkeysPath) || [];

      if (m.eventTypes && !matchAny(m.eventTypes, [evType])) return false;
      if (m.keys       && !matchAny(m.keys,   keysPath))      return false;
      if (m.gkeys      && !matchAny(m.gkeys,  gkeysPath))     return false;
      return true;
    }

    if (stage === 'vnode') {
      var tag = payload && payload.vnode && payload.vnode.tag;
      if (m.vnodeTags && !matchAny(m.vnodeTags, [tag])) return false;
      return true;
    }

    if (stage === 'state') {
      // no default filters; rely on predicate/custom
      return true;
    }

    if (stage === 'afterrender') {
      // no default filters; rely on predicate/custom
      return true;
    }

    // Generic / unknown stage
    return true;
  }

  function _evalRule(rule, stage, payload, ctx, out) {
    var ok = true, transformed = null;
    try {
      if (typeof rule.predicate === 'function') {
        ok = !!rule.predicate(payload, ctx);
      } else {
        ok = true; // no predicate => pass
      }
    } catch (e) {
      ok = false;
      log('warn', 'W-RULE-PRED', 'rule predicate threw: '+rule.id, { error:String(e && e.message || e) });
    }

    if (!ok) {
      var rec = {
        id: rule.id,
        type: rule.type || 'VIOLATION',
        stage: stage,
        score: (typeof rule.score==='number') ? rule.score : 0,
        action: rule.action || 'warn',
        message: rule.message || ('Rule '+rule.id+' failed'),
        owner: rule.owner || null
      };
      out.failed.push(rec);

      // grading via Auditor (if available)
      try {
        if (M.Auditor && typeof M.Auditor.grade === 'function') {
          // kind: use rule.type as "kind"
          M.Auditor.grade(rule.type || 'VIOLATION', rule.id, rec.message, assign({ stage:stage }, payload||{}));
        } else {
          // fallback log
          if (rec.action === 'block' || rec.type === 'PROHIBITED') log('error','E-RULE', rec.message, rec);
          else log('warn','W-RULE', rec.message, rec);
        }
      } catch(_) {}

      // throw for blockers (so core can stop event/render)
      if (rec.action === 'block' || rec.type === 'PROHIBITED') {
        var err = new Error('[RuleCenter] blocked by rule '+rule.id+': '+rec.message);
        err.__mishkah_rule__ = rec;
        throw err;
      }
    } else {
      // optional positive scoring (preferences/mubah/etc.)
      if (rule.score > 0 && M.Auditor && typeof M.Auditor.grade === 'function') {
        try { M.Auditor.grade(rule.type || 'MUBAH', rule.id, rule.message || 'OK', assign({ stage:stage }, payload||{})); } catch(_){}
      }
    }

    // optional transform channel (consumer modules may use it)
    if (typeof rule.transform === 'function') {
      try { transformed = rule.transform(payload, ctx); } catch(eT){ log('warn','W-RULE-TRANSFORM','transform threw in '+rule.id, { error:String(eT && eT.message || eT) }); }
    }
    return transformed;
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------
  var RuleCenter = {
    add: function(rule){
      var r = _normalizeRule(rule); if (!r) return null;
      _byId.set(r.id, r); _resort();
      log('info','I-RULE-ADD','added rule '+r.id, { stage:r.stageArr, priority:r.priority });
      return r.id;
    },
    addMany: function(rules){
      var ids = [];
      for (var i=0;i<toArr(rules).length;i++){
        var id = this.add(rules[i]); if (id) ids.push(id);
      }
      return ids;
    },
    update: function(id, patch){
      if (!_byId.has(id)) return false;
      var cur = _byId.get(id);
      var next = assign({}, cur, patch||{});
      // re-normalize fields that depend on types
      next.stageArr = _normalizeStage(next.stage || cur.stageArr || '*');
      next.enabled  = (next.enabled !== false);
      next.priority = (next.priority|0) || 0;
      if (next.match && !isObj(next.match)) next.match = {};
      if (next.roles && !isArr(next.roles)) next.roles = toArr(next.roles);
      _byId.set(id, next);
      _resort();
      log('info','I-RULE-UPD','updated rule '+id);
      return true;
    },
    remove: function(id){
      var ok = _byId.delete(id);
      if (ok) { _resort(); log('info','I-RULE-DEL','removed rule '+id); }
      return ok;
    },
    clear: function(){
      _byId.clear(); _resort();
      log('info','I-RULE-CLR','cleared all rules');
    },
    enable: function(id, enabled){
      if (!_byId.has(id)) return false;
      var r = _byId.get(id);
      r.enabled = (enabled !== false);
      _byId.set(id, r);
      log('info','I-RULE-ENA',(r.enabled?'enabled ':'disabled ')+id);
      return true;
    },
    get: function(id){ return _byId.get(id) || null; },
    list: function(filter){
      var arr = _list.slice();
      if (!filter) return arr;
      var st = (filter.stage ? _normalizeStage(filter.stage) : null);
      return arr.filter(function(r){
        if (st && st.indexOf('*')===-1){
          var hit=false;
          for (var i=0;i<st.length;i++) if (r.stageArr.indexOf(st[i])!==-1 || r.stageArr.indexOf('*')!==-1) { hit=true; break; }
          if (!hit) return false;
        }
        if (filter.enabled != null && !!r.enabled !== !!filter.enabled) return false;
        if (filter.scope && str(r.scope)!==str(filter.scope)) return false;
        if (filter.type  && str(r.type)!==str(filter.type))   return false;
        return true;
      });
    },

    /**
     * Evaluate all matching rules for a given stage & payload.
     * Returns: { ok:boolean, failed:[], transformed:any|null }
     * Throws: Error when a rule with action 'block' (or type PROHIBITED) fails.
     */
    evaluate: function(stage, payload, ctx){
      var st = String(stage||'').toLowerCase().trim();
      if (st === 'afterrender') st = 'afterrender'; // normalize
      if (!st) st = '*';

      var out = { ok:true, failed:[], transformed:null };

      var list = _list; // already sorted
      for (var i=0;i<list.length;i++){
        var r = list[i];
        if (!_matchRuleToPayload(r, st, payload||{}, ctx)) continue;
        var transformed = _evalRule(r, st, payload||{}, ctx, out);
        if (transformed != null) out.transformed = transformed;
      }

      // ok is false if any PROHIBITED (or block action) failed
      for (var j=0;j<out.failed.length;j++){
        var f = out.failed[j];
        if (f.action === 'block' || (f.type||'').toUpperCase() === 'PROHIBITED'){
          out.ok = false; break;
        }
      }
      return out;
    },

    /**
     * Attach rules from a database object if present under db.rulebook.rules
     * (idempotent: uses given id or prefixes with "db:" if missing)
     */
    attachFromDatabase: function(db){
      try {
        var rb = db && db.rulebook; if (!rb || !isArr(rb.rules)) return 0;
        var count = 0;
        for (var i=0;i<rb.rules.length;i++){
          var r = assign({}, rb.rules[i]);
          if (!r.id) r.id = 'db:'+uniqId('r');
          if (!_byId.has(r.id)) { this.add(r); count++; }
        }
        if (count>0) log('info','I-RULE-ATTACH','attached '+count+' rule(s) from db.rulebook');
        return count;
      } catch (e) {
        log('warn','W-RULE-ATTACH','attachFromDatabase failed', { error:String(e && e.message || e) });
        return 0;
      }
    },

    /**
     * Seed a couple of safe default rules when empty (optional).
     * These are generic and non-app-specific.
     */
    seedDefaultsIfEmpty: function(){
      if (_list.length) return 0;
      var defaults = [
        {
          id: 'vnode.disallow.script',
          enabled: true,
          stage: 'vnode',
          scope: 'guard',
          type: 'PROHIBITED',
          score: -100,
          priority: 100,
          action: 'block',
          message: 'Disallowed <script> vnode in VDOM',
          match: { vnodeTags: ['script'] },
          predicate: function(){ return false; } // always fail if matched
        },
        {
          id: 'event.click.missing-key.warn',
          enabled: true,
          stage: 'event',
          scope: 'auditor',
          type: 'VIOLATION',
          score: -5,
          priority: 10,
          action: 'warn',
          message: 'Click event fired without any data-m-key in path',
          match: { eventTypes: ['click'] },
          predicate: function(payload){
            var arr = (payload && payload.keysPath) || [];
            return (arr && arr.length > 0); // pass only if keys exist -> no keys => fail -> warn
          }
        }
      ];
      this.addMany(defaults);
      log('info','I-RULE-SEED','seeded default rules (2)');
      return 2;
    }
  };

  // Replace stub on Mishkah (core expects M.RuleCenter.*)
  M.RuleCenter = RuleCenter;

  return M;
}));


/*!
 * mishkah.guardian.js — Mishkah Guardian (UMD)
 * Sanitization + Laws + Preflight integration with RuleCenter
 * Replaces the Guardian stub exposed by mishkah.core.js
 * 2025-10-02
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () { return factory(root, root.Mishkah); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, root.Mishkah);
  } else {
    root.Mishkah = factory(root, root.Mishkah);
  }
}(typeof window !== 'undefined' ? window : this, function (global, existing) {
  "use strict";

  var M = existing || (global.Mishkah = {});

  // -------------------------------------------------------------------
  // Small utils
  // -------------------------------------------------------------------
  function isArr(v){ return Array.isArray(v); }
  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
  function toArr(v){ return v == null ? [] : (isArr(v) ? v : [v]); }
  function assign(t){ if(!isObj(t)) t={}; for (var i=1;i<arguments.length;i++){ var s=arguments[i]; if(!isObj(s)) continue; for (var k in s) t[k]=s[k]; } return t; }
  function str(v){ return v==null ? '' : String(v); }

  // Guarded console via Auditor if available
  function log(type, code, msg, ctx){
    try {
      if (M.Auditor && typeof M.Auditor[type] === 'function') {
        M.Auditor[type](code, msg, ctx);
      } else if (typeof console !== 'undefined' && console[type]) {
        console[type]((code?code+' ':'')+'[Guardian] '+msg, ctx||'');
      }
    } catch (_) {}
  }

  // -------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------
  var _cfg = {
    // Tag policy
    allowTags: null,                 // e.g. ['div','span',...]; null means "use denyTags instead"
    denyTags:  { script:1, style:0 },// disallow <script> by default; <style> allowed unless set to 1
    rename:    {},                   // e.g. { script:'template' }

    // Attribute policy
    denyAttrs: [/^on/i],             // strip inline handlers on*
    allowAttrs: null,                // null => allow anything except denyAttrs, else whitelist
    attributeAliases: { className: 'class' },

    // URL policy
    urlAttrs:  ['href','src','xlink:href','poster'],
    allowedUrlSchemes: ['http:','https:','mailto:','tel:','data:image/'],
    stripJsHref: true,               // remove javascript: urls

    // Roles
    defaultRoles: ['*']              // used when db.guardian.activeRoles is missing
  };

  function setConfig(patch){
    if (!isObj(patch)) return;
    for (var k in patch) _cfg[k] = patch[k];
    log('info','I-G-CFG','guardian config updated', { cfg: _cfg });
  }
  function getConfig(){ return assign({}, _cfg); }

  // -------------------------------------------------------------------
  // Helpers — URL safety & attributes
  // -------------------------------------------------------------------
  function _isUrlAttr(name){
    var n = String(name||'').toLowerCase();
    for (var i=0;i<_cfg.urlAttrs.length;i++){
      if (n === _cfg.urlAttrs[i]) return true;
    }
    return false;
  }
  function _isAllowedUrl(url){
    if (!url) return true; // empty => ok
    var u = String(url).trim();
    // block javascript: and data: except images by default
    var low = u.toLowerCase();
    if (low.indexOf('javascript:') === 0) return false;
    // allowed explicit schemes
    for (var i=0;i<_cfg.allowedUrlSchemes.length;i++){
      var s = _cfg.allowedUrlSchemes[i];
      if (s.charAt(s.length-1) === '/' ) {
        // prefix scheme, e.g. data:image/
        if (low.indexOf(s) === 0) return true;
      } else {
        // exact scheme, e.g. http:
        if (low.indexOf(s) === 0) return true;
      }
    }
    // protocol-relative (//domain) → allow
    if (low.indexOf('//') === 0) return true;
    // relative url (no scheme) → allow
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(low)) return true;
    return false;
  }

  // -------------------------------------------------------------------
  // Built-in sanitization
  // -------------------------------------------------------------------
  function sanitizeTag(vnode){
    if (!vnode || vnode._type !== 'element') return;
    var tag = String(vnode.tag || 'div').toLowerCase();

    if (isArr(_cfg.allowTags) && _cfg.allowTags.length){
      var ok = false;
      for (var i=0;i<_cfg.allowTags.length;i++) if (_cfg.allowTags[i] === tag) { ok = true; break; }
      if (!ok) tag = 'div';
    }
    if (_cfg.denyTags && _cfg.denyTags[tag]){
      if (_cfg.rename && _cfg.rename[tag]) tag = _cfg.rename[tag];
      else tag = 'template';
    }
    vnode.tag = tag;
  }

  function sanitizeAttrs(vnode){
    if (!vnode || vnode._type !== 'element') return;
    var props = vnode.props || {};
    var next  = {};
    var deny  = isArr(_cfg.denyAttrs) ? _cfg.denyAttrs : [];

    // normalize aliases
    if (props.className != null && props['class'] == null) props['class'] = props.className;

    for (var k in props){
      var keep = true;

      // denyAttrs (regex or exact)
      for (var i=0;i<deny.length;i++){
        var pat = deny[i];
        var hit = (pat instanceof RegExp) ? pat.test(k) : (String(k).toLowerCase() === String(pat).toLowerCase());
        if (hit){ keep = false; break; }
      }
      if (!keep) continue;

      // allowAttrs whitelist
      if (isArr(_cfg.allowAttrs) && _cfg.allowAttrs.length){
        var listed = false;
        for (var a=0;a<_cfg.allowAttrs.length;a++) if (_cfg.allowAttrs[a] === k) { listed = true; break; }
        if (!listed) continue;
      }

      // URL cleansing
      if (_isUrlAttr(k) && _cfg.stripJsHref){
        if (!_isAllowedUrl(props[k])) {
          log('warn','W-URL','blocked suspicious URL in '+k, { value: String(props[k]).slice(0,100) });
          continue; // skip this attr
        }
      }

      next[k] = props[k];
    }
    vnode.props = next;
  }

  // -------------------------------------------------------------------
  // Roles & Laws
  // -------------------------------------------------------------------
  function _activeRolesFromDB(db){
    try {
      var roles = db && db.guardian && db.guardian.activeRoles;
      roles = roles ? toArr(roles) : _cfg.defaultRoles.slice();
      if (!roles.length) roles = _cfg.defaultRoles.slice();
      return roles;
    } catch (_) { return _cfg.defaultRoles.slice(); }
  }

  var _guards = []; // { name, fn(vnode, db), priority }
  var _laws   = []; // { name, fn(vnode, db), roles[], priority, action, type }

  function registerGuard(name, fn, priority){
    _guards.push({ name:String(name||'guard'), fn:fn, priority:(priority|0)||0 });
    _guards.sort(function(a,b){ return (b.priority|0) - (a.priority|0); });
    log('info','I-G-GUARD','registered guard '+name, { priority: priority||0 });
  }

  // law options: { roles:[], priority, action:'block'|'warn'|'none', type:'PROHIBITED'|'VIOLATION'|... }
  function registerLaw(name, fn, roles, priority, options){
    var opt = options || {};
    _laws.push({
      name: String(name||'law'),
      fn: fn,
      roles: isArr(roles) ? roles.slice() : toArr(roles),
      priority: (priority|0)||0,
      action: opt.action || 'warn',
      type: opt.type || 'VIOLATION'
    });
    _laws.sort(function(a,b){ return (b.priority|0)-(a.priority|0); });
    log('info','I-G-LAW','registered law '+name, { roles: roles||[], priority: priority||0 });
  }

  // Attach laws from db.guardian.laws: array of functions (vnode, db) => boolean|object|false
  function attachDatabaseLaws(db){
    try {
      var arr = db && db.guardian && db.guardian.laws;
      if (!isArr(arr) || !arr.length) return 0;
      var count = 0;
      for (var i=0;i<arr.length;i++){
        var fn = arr[i];
        if (typeof fn === 'function'){
          registerLaw('db-law-'+(i+1), fn, ['*'], 0, { action:'warn', type:'VIOLATION' });
          count++;
        }
      }
      if (count) log('info','I-G-ATTACH','attached '+count+' db laws');
      return count;
    } catch (e) {
      log('warn','W-G-ATTACH','attachDatabaseLaws failed', { error:String(e && e.message || e) });
      return 0;
    }
  }

  // -------------------------------------------------------------------
  // Preflight integration with RuleCenter
  // -------------------------------------------------------------------
  // You can register full rules directly in RuleCenter, but Guardian offers sugar:
  // registerPreflight(stage, spec):
  //   spec = { id?, priority?, type?, score?, roles?, tags?, action?, message?, match?, predicate(payload,ctx) }
  function registerPreflight(stage, spec){
    if (!M.RuleCenter || !M.RuleCenter.add) {
      log('warn','W-G-PREF','RuleCenter not available; skipping preflight registration', { stage:stage });
      return null;
    }
    var s = assign({}, spec||{});
    s.stage = stage;
    if (!s.id) s.id = 'g-pref-'+String(stage||'any')+'-'+Math.random().toString(36).slice(2,8);
    return M.RuleCenter.add(s);
  }

  function runPreflight(stage, payload, ctx){
    if (!M.RuleCenter || typeof M.RuleCenter.evaluate !== 'function') {
      // If no RuleCenter, do nothing (allow)
      return { ok:true, failed:[], transformed:null };
    }
    var out = M.RuleCenter.evaluate(String(stage||'').toLowerCase(), payload||{}, ctx||null);
    if (!out || out.ok) return out || { ok:true, failed:[], transformed:null };
    // If RuleCenter throws on block, core will catch; here we mirror behavior:
    // In case RuleCenter returned ok=false without throwing (defensive):
    if (out.failed && out.failed.some(function(f){ return (f.action==='block') || String(f.type||'').toUpperCase()==='PROHIBITED'; })) {
      var msg = '[Guardian] preflight blocked on stage '+stage;
      var err = new Error(msg);
      err.__mishkah_preflight__ = out.failed;
      throw err;
    }
    return out;
  }

  // -------------------------------------------------------------------
  // Public checks used by the core during render
  // -------------------------------------------------------------------
  function checkBuiltIn(vnode){
    try { sanitizeTag(vnode); } catch(e){ log('warn','W-G-SAN-TAG','sanitizeTag failed', { error:String(e && e.message || e) }); }
    try { sanitizeAttrs(vnode); } catch(e2){ log('warn','W-G-SAN-ATTR','sanitizeAttrs failed', { error:String(e2 && e2.message || e2) }); }
  }

  function checkUserLaws(vnode, db){
    // 1) Attach db laws once (idempotent per call is okay; duplicates are harmless because we register into _laws)
    attachDatabaseLaws(db);

    // 2) Run guards (plugins) in priority order
    for (var i=0;i<_guards.length;i++){
      var g = _guards[i];
      try {
        var r = g.fn && g.fn(vnode, db);
        if (r === false) {
          // blocked by guard → neutralize vnode
          vnode.tag = 'template'; vnode.props = {}; vnode.children = [];
          log('warn','W-GUARD-BLOCK','guard blocked vnode: '+g.name);
          return;
        }
        if (r && typeof r === 'object'){
          if (r.tag) vnode.tag = String(r.tag);
          if (isObj(r.props)) vnode.props = r.props;
          if (isArr(r.children)) vnode.children = r.children;
        }
      } catch (e) {
        log('warn','W-GUARD','guard failed: '+g.name, { error:String(e && e.message || e) });
      }
    }

    // 3) Run laws with role filtering
    var roles = _activeRolesFromDB(db);
    for (var j=0;j<_laws.length;j++){
      var law = _laws[j];
      // role check
      var allowed = true;
      if (isArr(law.roles) && law.roles.length && law.roles.indexOf('*') === -1){
        allowed = false;
        for (var rr=0; rr<law.roles.length; rr++){
          if (roles.indexOf(law.roles[rr]) !== -1) { allowed = true; break; }
        }
      }
      if (!allowed) continue;

      try {
        var res = typeof law.fn === 'function' ? law.fn(vnode, db) : true;
        if (!res) {
          // violation
          if (M.Auditor && typeof M.Auditor.grade === 'function') {
            M.Auditor.grade(law.type || 'VIOLATION', law.name || 'law', 'Guardian law failed', { roles: roles });
          } else {
            log('warn','W-LAW','law failed: '+(law.name||'law'), { roles: roles });
          }
          if ((law.action||'warn') === 'block' || String(law.type||'').toUpperCase()==='PROHIBITED'){
            vnode.tag = 'template'; vnode.props = {}; vnode.children = [];
            log('error','E-LAW-BLOCK','law blocked vnode: '+(law.name||'law'));
            return;
          }
        } else if (res && typeof res === 'object') {
          if (res.tag) vnode.tag = String(res.tag);
          if (isObj(res.props)) vnode.props = res.props;
          if (isArr(res.children)) vnode.children = res.children;
        }
      } catch (e2) {
        log('warn','W-LAW-THROW','law threw: '+(law.name||'law'), { error:String(e2 && e2.message || e2) });
      }
    }
  }

  // -------------------------------------------------------------------
  // Default extras (DX/safety)
  // -------------------------------------------------------------------
  // 1) Guard plugin: enforce rel=noopener on <a target="_blank">
  registerGuard('link-rel-noopener', function(vnode){
    if (!vnode || vnode._type!=='element' || vnode.tag!=='a') return;
    var p = vnode.props || {};
    if (p.target === '_blank') {
      var cur = String(p.rel || '').toLowerCase();
      if (cur.indexOf('noopener') === -1) p.rel = (cur ? cur+' ' : '') + 'noopener noreferrer';
      vnode.props = p;
    }
  }, 1);

  // 2) Preflight: block <script> at RuleCenter level (if available) — extra safety
  if (M.RuleCenter && typeof M.RuleCenter.add === 'function') {
    registerPreflight('vnode', {
      id: 'guardian.vnode.disallow.script',
      enabled: true,
      priority: 90,
      scope: 'guard',
      type: 'PROHIBITED',
      score: -100,
      action: 'block',
      message: 'Disallowed <script> vnode by Guardian preflight',
      match: { vnodeTags: ['script'] },
      predicate: function(){ return false; } // always fail if matched
    });
  }

  // -------------------------------------------------------------------
  // Export/Replace on Mishkah
  // -------------------------------------------------------------------
  var Guardian = {
    setConfig: setConfig,
    getConfig: getConfig,

    // Sanitization used by core
    checkBuiltIn: checkBuiltIn,

    // User laws / plugins
    checkUserLaws: checkUserLaws,
    registerGuard: registerGuard,
    registerLaw: registerLaw,
    attachDatabaseLaws: attachDatabaseLaws,

    // Preflight (RuleCenter integration)
    registerPreflight: registerPreflight,
    runPreflight: runPreflight
  };

  M.Guardian = Guardian;
  return M;
}));


/*!
 * mishkah.auditor.js — Mishkah Auditor (UMD)
 * دستور "الأدوار بين الحارس والمدقق"
 * ميزان 14 درجة (+7..-7) + موانع قبول الكود (Nullifier)
 * تسجيل منظم + تتبع زمني + IndexedDB اختياري
 * يشمل: listComponents() داخل الـ API
 * 2025-10-02
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () { return factory(root, root.Mishkah); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, root.Mishkah);
  } else {
    root.Mishkah = factory(root, root.Mishkah);
  }
}(typeof window !== 'undefined' ? window : this, function (global, existing) {
  "use strict";

  var M = existing || (global.Mishkah = {});

  // -------------------------------------------------------------------
  // Utils
  // -------------------------------------------------------------------
  function isArr(v){ return Array.isArray(v); }
  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
  function toArr(v){ return v == null ? [] : (isArr(v) ? v : [v]); }
  function assign(t){ if(!isObj(t)) t={}; for (var i=1;i<arguments.length;i++){ var s=arguments[i]; if(!isObj(s)) continue; for (var k in s) t[k]=s[k]; } return t; }
  function str(v){ return v==null ? '' : String(v); }
  function nowMs(){ return (global.performance && typeof performance.now==='function') ? performance.now() : Date.now(); }

  // -------------------------------------------------------------------
  // Ring buffer (tail-of-logs in memory)
  // -------------------------------------------------------------------
  function createRing(cap) {
    var capacity = Math.max(50, (cap|0) || 800);
    var buf = [];
    return {
      push: function (x) { if (buf.length === capacity) buf.shift(); buf.push(x); },
      tail: function (n) { return buf.slice(-(n || capacity)); },
      size: function () { return buf.length; },
      setCapacity: function (c) {
        capacity = Math.max(50, (c | 0) || 50);
        if (buf.length > capacity) buf.splice(0, buf.length - capacity);
      }
    };
  }
  var _ring = createRing(1000);

  // -------------------------------------------------------------------
  // IndexedDB adapter (lightweight, optional)
  // -------------------------------------------------------------------
  var DB = (function(){
    var enabled = true;
    var dbName = 'mishkah-auditor';
    var dbVer  = 2;
    var ready = null;

    function open(){
      return new Promise(function(res, rej){
        if (!enabled || !global.indexedDB) return rej(new Error('indexedDB not available'));
        var req = indexedDB.open(dbName, dbVer);
        req.onupgradeneeded = function(){
          var db = req.result;
          if (!db.objectStoreNames.contains('logs'))       db.createObjectStore('logs',       { autoIncrement: true });
          if (!db.objectStoreNames.contains('metrics'))    db.createObjectStore('metrics',    { autoIncrement: true });
          if (!db.objectStoreNames.contains('grades'))     db.createObjectStore('grades',     { keyPath: 'id' });
          if (!db.objectStoreNames.contains('components')) db.createObjectStore('components', { keyPath: 'id' }); // id = comp:<cid>
        };
        req.onsuccess = function(){ res(req.result); };
        req.onerror   = function(){ rej(req.error || new Error('indexedDB open failed')); };
      });
    }

    function tx(store, mode, fn){
      if (!enabled) return Promise.resolve(false);
      if (!ready) ready = open().catch(function(){ enabled=false; return null; });
      return ready.then(function(db){
        if (!db) return false;
        return new Promise(function(res, rej){
          var t = db.transaction(store, mode);
          var st = t.objectStore(store);
          var out = fn(st);
          t.oncomplete = function(){ res(out); };
          t.onerror = function(){ rej(t.error || new Error('tx failed')); };
          t.onabort = function(){ rej(new Error('tx aborted')); };
        });
      }).catch(function(){ return false; });
    }

    return {
      log: function(rec){ return tx('logs', 'readwrite', function(st){ st.add(rec); }); },
      metric: function(rec){ return tx('metrics', 'readwrite', function(st){ st.add(rec); }); },
      upsertGrade: function(id, patch){
        return tx('grades', 'readwrite', function(st){
          var g = st.get(id);
          g.onsuccess = function(){
            var cur = g.result || { id:id, count:0, score:0, last:0, details:[] };
            var nxt = assign(cur, patch||{});
            if (patch && patch.bump) nxt.count = (cur.count|0) + 1;
            if (patch && typeof patch.addScore==='number') nxt.score = (cur.score|0) + patch.addScore;
            nxt.last = Date.now();
            try {
              if (patch && patch.detail){
                nxt.details = nxt.details || [];
                nxt.details.push(patch.detail);
                if (nxt.details.length > 80) nxt.details.shift();
              }
            } catch(_){}
            st.put(nxt);
          };
        });
      },
      upsertComponent: function(cid, patch){
        return tx('components', 'readwrite', function(st){
          var id = 'comp:'+str(cid);
          var g = st.get(id);
          g.onsuccess = function(){
            var cur = g.result || { id:id, cid:cid, nullified:false, pos:0, neg:0, score:0, last:0, details:[] };
            var nxt = assign(cur, patch||{});
            nxt.last = Date.now();
            try {
              if (patch && patch.detail){
                nxt.details = nxt.details || [];
                nxt.details.push(patch.detail);
                if (nxt.details.length > 80) nxt.details.shift();
              }
            } catch(_){}
            st.put(nxt);
          };
        });
      },
      listComponentIds: function(){
        return tx('components', 'readonly', function(st){
          return new Promise(function(res){
            var out = [];
            var req = st.openCursor();
            req.onsuccess = function(e){
              var cur = e.target.result;
              if (cur){ out.push(cur.value && cur.value.cid ? String(cur.value.cid) : String(cur.key).replace(/^comp:/,'')); cur.continue(); }
              else res(out);
            };
            req.onerror = function(){ res(out); };
          });
        });
      }
    };
  })();

  // -------------------------------------------------------------------
  // Console levels (non-blocking)
  // -------------------------------------------------------------------
  var LEVELS = { debug:10, info:20, warn:30, error:40, silent:99 };
  var _level = LEVELS.info;

  function setLevel(name){ if (LEVELS[name]!=null) _level = LEVELS[name]; }
  function _emit(type, code, msg, ctx){
    var time = Date.now();
    var rec = { time: time, type: type, code: str(code), msg: str(msg), ctx: (ctx||null) };
    _ring.push(rec);
    try { DB.log(rec); } catch(_){}
    var lvl = LEVELS[type]!=null ? LEVELS[type] : LEVELS.info;
    if (lvl >= _level && typeof console !== 'undefined' && console[type]) {
      try { console[type]((rec.code?rec.code+' ':'')+'[Mishkah] '+rec.msg, rec.ctx||''); } catch(_){}
    }
  }

  // -------------------------------------------------------------------
  // The 14-degree scale (+7..-7) + Nullifier
  // -------------------------------------------------------------------
  var TAXONOMY = {
    NEG: {
      "-1": { ar: "تفويت الفضل",       en:"Suboptimal Choice" },
      "-2": { ar: "اللمم",             en:"Trivial Issue" },
      "-3": { ar: "الجُنح",            en:"Minor Deviation" },
      "-4": { ar: "المواعظ",           en:"Code Smell" },
      "-5": { ar: "التحذيرات",         en:"Warning" },
      "-6": { ar: "المنهيات",          en:"Forbidden Pattern" },
      "-7": { ar: "المحرمات",          en:"Critical Violation" },
      "NULLIFIER": { ar:"موانع قبول الكود (الشرك)", en:"Work Nullifier" }
    },
    POS: {
      "1":  { ar: "الخيرية (خير لكم)", en:"Good Practice" },
      "2":  { ar: "الترغيب (قل..)",    en:"Preferred Pattern" },
      "3":  { ar: "الأوامر",          en:"Standard Compliance" },
      "4":  { ar: "الوصايا",          en:"Robust Implementation" },
      "5":  { ar: "الفرائض",          en:"Core Fulfillment" },
      "6":  { ar: "ما كَتَبَ الله",   en:"Critical Requirement" },
      "7":  { ar: "السَّبق بالخيرات", en:"Exceptional Contribution" }
    }
  };

  // Legacy mapping
  var LEGACY_KIND = { PROHIBITED:-7, VIOLATION:-5, MAKRUH:-3, PREFERENCE:+2, MUBAH:0 };
  var AR_KIND     = { "محظورات":-7, "مخالفات":-5, "مكروهات":-3, "تفضيلات":+2, "مباحات":0 };

  function normalizeDegree(kindOrDegree){
    if (kindOrDegree == null) return 0;
    if (typeof kindOrDegree === 'number') {
      var n = (kindOrDegree|0);
      if (n > 7) n = 7; if (n < -7) n = -7; return n;
    }
    var s = String(kindOrDegree).trim();

    // canonical ar/en labels
    for (var k in TAXONOMY.NEG){
      if (k === "NULLIFIER") continue;
      var obj = TAXONOMY.NEG[k];
      if (obj.ar === s || obj.en.toLowerCase() === s.toLowerCase()) return parseInt(k,10);
    }
    for (var p in TAXONOMY.POS){
      var obj2 = TAXONOMY.POS[p];
      if (obj2.ar === s || obj2.en.toLowerCase() === s.toLowerCase()) return parseInt(p,10);
    }
    // nullifier
    if (s === TAXONOMY.NEG.NULLIFIER.ar || s.toLowerCase() === TAXONOMY.NEG.NULLIFIER.en.toLowerCase() || s.toUpperCase() === 'NULLIFIER') {
      return 'NULLIFIER';
    }
    // legacy kinds
    if (LEGACY_KIND[s.toUpperCase()] != null) return LEGACY_KIND[s.toUpperCase()];
    if (AR_KIND[s] != null) return AR_KIND[s];

    return 0;
  }

  // -------------------------------------------------------------------
  // State: global summary + per-component buckets + nullifier
  // -------------------------------------------------------------------
  var _summary = {
    score: 0, pos: 0, neg: 0,
    buckets: { "+1":0,"+2":0,"+3":0,"+4":0,"+5":0,"+6":0,"+7":0, "-1":0,"-2":0,"-3":0,"-4":0,"-5":0,"-6":0,"-7":0 },
    details: [] // capped
  };

  var _components = Object.create(null); // cid -> { score,pos,neg,nullified, details[] }

  function _ensureComp(cid){
    var id = str(cid||'default');
    if (!_components[id]) _components[id] = { score:0, pos:0, neg:0, nullified:false, details:[] };
    return _components[id];
  }

  function _pushDetail(targetArr, detail, cap){
    targetArr.push(detail);
    if (targetArr.length > (cap||200)) targetArr.shift();
  }

  // -------------------------------------------------------------------
  // Public logging
  // -------------------------------------------------------------------
  function debug(code,msg,ctx){ _emit('debug',code,msg,ctx); }
  function info(code,msg,ctx){  _emit('info', code,msg,ctx); }
  function warn(code,msg,ctx){  _emit('warn', code,msg,ctx); }
  function error(code,msg,ctx){ _emit('error',code,msg,ctx); }

  // -------------------------------------------------------------------
  // Nullifier mechanics
  // -------------------------------------------------------------------
  function activateNullifier(componentId, reason, meta){
    var cid = str(componentId||'default');
    var comp = _ensureComp(cid);

    if (!comp.nullified) {
      // remove past positives from summary/component
      if (comp.pos) {
        _summary.score -= comp.pos;
        _summary.pos   -= comp.pos;
        comp.score     -= comp.pos;
        comp.pos        = 0;
      }
      comp.nullified = true;
      var detail = { time: Date.now(), degree: 'NULLIFIER', name: TAXONOMY.NEG.NULLIFIER.ar, component: cid, message: str(reason||'مُبطِل للأعمال'), meta: meta||null };
      _pushDetail(comp.details, detail, 200);
      _pushDetail(_summary.details, assign({ global:true }, detail), 400);
      try { DB.upsertComponent(cid, { nullified:true, detail:detail }); } catch(_){}
      warn('AUD-NULL', 'Activated work nullifier for component "'+cid+'"', assign({ component:cid }, meta||{}));
    }
    return true;
  }

  function isNullified(componentId){
    var comp = _ensureComp(componentId);
    return !!comp.nullified;
  }

  function repent(componentId, note, meta){
    var cid = str(componentId||'default');
    var comp = _ensureComp(cid);
    if (comp.nullified) {
      comp.nullified = false;
      var detail = { time: Date.now(), degree: 'REPENT', name: 'رفع موانع قبول الكود', component: cid, message: str(note||'رفع الحالة بعد الإصلاح'), meta: meta||null };
      _pushDetail(comp.details, detail, 200);
      _pushDetail(_summary.details, assign({ global:true }, detail), 400);
      try { DB.upsertComponent(cid, { nullified:false, detail:detail }); } catch(_){}
      info('AUD-REPENT', 'Nullifier lifted for "'+cid+'"', assign({ component:cid }, meta||{}));
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------
  // Grading (14-degree scale) — non-blocking
  // -------------------------------------------------------------------
  function grade(kindOrDegree, idOrComponent, message, meta){
    var degree = normalizeDegree(kindOrDegree);
    var cid = (meta && (meta.component||meta.comp)) || idOrComponent; // treat second arg as component id
    var componentId = str(cid || 'default');
    var comp = _ensureComp(componentId);

    // special: request nullifier
    if (degree === 'NULLIFIER') return activateNullifier(componentId, message, meta);

    // neutral → ignore
    if (degree === 0) {
      debug('G-0','Neutral grade ignored for "'+componentId+'"', { message: message, meta: meta });
      return 0;
    }

    var positive = degree > 0;
    var value    = degree;

    // nullified → drop positives silently
    if (comp.nullified && positive) {
      warn('G-DROPPED','Positive grade dropped due to nullifier for "'+componentId+'"', { degree: degree, message: message });
      return 0;
    }

    // summary
    _summary.score += value;
    if (positive) _summary.pos += value; else _summary.neg += value;

    var key = (positive?'+':'') + String(degree);
    if (_summary.buckets[key] != null) _summary.buckets[key]++;

    // component
    comp.score += value;
    if (positive) comp.pos += value; else comp.neg += value;

    var name = positive ? (TAXONOMY.POS[String(degree)] && TAXONOMY.POS[String(degree)].ar)
                        : (TAXONOMY.NEG[String(degree)] && TAXONOMY.NEG[String(degree)].ar);
    var detail = {
      time: Date.now(),
      degree: degree,
      name: name || ('درجة '+degree),
      component: componentId,
      message: str(message||''),
      meta: meta || null,
      value: value
    };
    _pushDetail(comp.details, detail, 200);
    _pushDetail(_summary.details, assign({ global:true }, detail), 400);

    // persist
    try {
      DB.upsertGrade( (positive?'POS':'NEG')+':'+componentId, { bump:true, addScore:value, detail:detail });
      DB.upsertComponent(componentId, { score:comp.score, pos:comp.pos, neg:comp.neg, nullified:comp.nullified, detail:detail });
    } catch(_){}

    // console surface
    var lvl = positive ? 'info' : (degree <= -6 ? 'error' : 'warn');
    _emit(lvl, 'G'+(positive?'+':'')+degree, (positive?'حُسْنَة':'مخالفة')+' ('+name+') للعنصر "'+componentId+'": '+(message||''), assign({ degree:degree, component:componentId }, meta||{}));

    return value;
  }

  function getSummary(){
    return {
      score: _summary.score,
      pos: _summary.pos,
      neg: _summary.neg,
      buckets: assign({}, _summary.buckets),
      details: _summary.details.slice()
    };
  }

  function getComponentReport(componentId){
    var comp = _ensureComp(componentId);
    return {
      component: String(componentId||'default'),
      score: comp.score, pos: comp.pos, neg: comp.neg,
      nullified: !!comp.nullified,
      details: comp.details.slice()
    };
  }

  function resetAll(){
    _summary.score = 0; _summary.pos = 0; _summary.neg = 0;
    for (var k in _summary.buckets) _summary.buckets[k] = 0;
    _summary.details.length = 0;
    _components = Object.create(null);
    info('AUD-RESET','Auditor state reset');
  }

  // -------------------------------------------------------------------
  // Timing & SLAs (non-blocking)
  // -------------------------------------------------------------------
  var _timingCfg = {
    thresholds: { event:16, rebuild:33, render:16, ajax:300, route:80, custom:50 },
    bands:      { minor:1.2, major:2.0, severe:4.0 }
  };

  function timingSet(cfg){
    if (!isObj(cfg)) return;
    if (isObj(cfg.thresholds)) _timingCfg.thresholds = assign({}, _timingCfg.thresholds, cfg.thresholds);
    if (isObj(cfg.bands))      _timingCfg.bands      = assign({}, _timingCfg.bands, cfg.bands);
    info('AUD-TCFG','Timing config updated', assign({}, _timingCfg));
  }

  function timingStart(label, meta){
    var t0 = nowMs();
    return function stop(channel){
      var ms = nowMs() - t0;
      timingRecord(channel||'custom', str(label||'measure'), ms, meta||{});
      return ms;
    };
  }

  function _gradeForOverrun(channel, ms, thr){
    if (!thr || thr <= 0) return 0;
    var r = ms / thr;
    if (r >= _timingCfg.bands.severe) return -7;
    if (r >= _timingCfg.bands.major)  return -5;
    if (r >= _timingCfg.bands.minor)  return -3;
    return 0;
  }

  function timingRecord(channel, name, ms, meta){
    var ch  = str(channel||'custom').toLowerCase();
    var nm  = str(name||'');
    var val = +ms || 0;
    var thr = _timingCfg.thresholds[ch];

    var slowDeg = _gradeForOverrun(ch, val, thr);
    var rec = { time: Date.now(), channel: ch, name: nm, ms: val, threshold: thr, over: slowDeg<0, degree: slowDeg, meta: meta||null };
    try { DB.metric(rec); } catch(_){}

    var msg = 'Timing ['+ch+'] '+nm+' = '+val.toFixed(1)+'ms' + (thr?(' (≤'+thr+'ms)'):'');
    _emit(slowDeg<0 ? 'warn':'debug', slowDeg<0 ? 'SLOW-'+ch.toUpperCase() : 'TIM-'+ch.toUpperCase(), msg, meta||{});

    if (slowDeg < 0) {
      var cid = (meta && (meta.component||meta.comp)) || nm;
      grade(slowDeg, cid, 'بطء '+ch+' ('+val.toFixed(1)+'ms)', assign({ ms:val, threshold:thr }, meta||{}));
    }
  }

  // قياس الشبكة (fetch / XHR)
  var _netWrapped = false;
  function wrapNetworkingOnce(){
    if (_netWrapped) return;
    _netWrapped = true;

    // fetch
    if (typeof global.fetch === 'function'){
      var _fetch = global.fetch;
      try {
        global.fetch = function(){
          var args = arguments;
          var url  = (args && args[0]) ? (typeof args[0] === 'string' ? args[0] : (args[0].url || '')) : '';
          var stop = timingStart('fetch:'+url, { url:url });
          return _fetch.apply(this, args).then(function(res){
            var ms = stop('ajax');
            if (!res || !res.ok) {
              grade(-7, url, 'HTTP '+(res && res.status), { url:url, ms:ms });
            }
            return res;
          }).catch(function(err){
            var ms = stop('ajax');
            grade(-7, url, 'fetch error: '+String(err && err.message || err), { url:url, ms:ms });
            throw err;
          });
        };
      } catch(_){}
    }

    // XHR
    if (typeof global.XMLHttpRequest === 'function'){
      try {
        var _XHR = global.XMLHttpRequest;
        function Wrap(){
          var xhr = new _XHR();
          var url = '';
          var stop = null;

          var _open = xhr.open;
          xhr.open = function(method, u){
            url = String(u||''); return _open.apply(xhr, arguments);
          };
          var _send = xhr.send;
          xhr.send = function(){
            stop = timingStart('xhr:'+url, { url:url });
            xhr.addEventListener('loadend', function(){
              var ms = stop('ajax');
              var st = xhr.status|0;
              if (!(st>=200 && st<400)) grade(-7, url, 'XHR '+st, { url:url, ms:ms });
            });
            return _send.apply(xhr, arguments);
          };
          return xhr;
        }
        global.XMLHttpRequest = Wrap;
      } catch(_){}
    }
  }

  // -------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------
  var Auditor = {
    // Config
    setLevel: setLevel,
    config: function(opts){
      if (!isObj(opts)) return;
      if (opts.level) setLevel(opts.level);
      if (opts.ringCapacity) _ring.setCapacity(opts.ringCapacity|0);
      if (opts.timing) timingSet(opts.timing);
    },

    // Logging
    debug: debug, info: info, warn: warn, error: error,
    tail:  function(n){ return _ring.tail(n||300); },

    // Scale + grading
    taxonomy: TAXONOMY,
    normalizeDegree: normalizeDegree,
    grade: grade,                   // (degree|label, componentId, message, meta)
    getSummary: getSummary,
    getComponentReport: getComponentReport,
    resetAll: resetAll,

    // Nullifier
    activateNullifier: activateNullifier,
    isNullified: isNullified,
    repent: repent,

    // Timing
    timing: {
      set: timingSet,
      start: timingStart,
      record: timingRecord,
      wrapNetworkingOnce: wrapNetworkingOnce
    },

    // NEW: قائمة المكوّنات المرصودة
    listComponents: function(){
      // من الذاكرة (الأسرع)
      var ids = Object.keys(_components);
      // إزالة بادئات/حالات خاصة إن لزم
      return ids;
    },

    // (اختياري) قراءة المكوّنات من IndexedDB — مفيدة بعد إعادة تحميل الصفحة
    listComponentsFromDB: function(){
      return DB.listComponentIds().then(function(ids){
        // دمج أي مكوّنات جديدة مع ما في الذاكرة
        var mem = Object.keys(_components);
        var set = new Set([].concat(mem, ids||[]));
        return Array.from(set);
      });
    }
  };

  // Export
  M.Auditor = Auditor;
  return M;
}));

/*!
 * mishkah.devtools.js — DevTools & Judgment (UMD) &Snapshot (UMD)
 * - Ledger: سيء/مقبول للمكوّنات مع الأسباب
 * - Judgment: تجميع تاريخ المكوّن وإصدار حُكم وفق سياسة قابلة للتهيئة نافذة حكم قابلة للتهيئة + Ledger على IndexedDB
 * - Probation: فترات اختبار وإعادة التقييم
 * - Snapshot: لمحة سريعة (قواعد مُفعّلة/معطّلة، أعلى 5 مخالفات، أفضل 5 مرشّحين للحكم)
 * 2025-10-02
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () { return factory(root, root.Mishkah); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, root.Mishkah);
  } else {
    root.Mishkah = factory(root, root.Mishkah);
  }
}(typeof window !== 'undefined' ? window : this, function (global, existing) {
  "use strict";

  var M = existing || (global.Mishkah = {});
  var Auditor = M.Auditor;

  function isObj(v){ return v && typeof v==='object' && !Array.isArray(v); }
  function toArr(v){ return v==null?[]:(Array.isArray(v)?v:[v]); }
  function str(v){ return v==null ? '' : String(v); }
  function now(){ return Date.now(); }

  // -------------------------------------------------------------------
  // IndexedDB: ledger لمخرجات الحكم (HEAVEN/HELL/PURGATORY)
  // -------------------------------------------------------------------
  var DB = (function(){
    var dbName = 'mishkah-auditor';
    var dbVer  = 3;
    var ready  = null;

    function open(){
      return new Promise(function(res, rej){
        if (!global.indexedDB) return rej(new Error('indexedDB not available'));
        var req = indexedDB.open(dbName, dbVer);
        req.onupgradeneeded = function(){
          var db = req.result;
          if (!db.objectStoreNames.contains('logs'))       db.createObjectStore('logs', { autoIncrement:true });
          if (!db.objectStoreNames.contains('metrics'))    db.createObjectStore('metrics', { autoIncrement:true });
          if (!db.objectStoreNames.contains('grades'))     db.createObjectStore('grades', { keyPath:'id' });
          if (!db.objectStoreNames.contains('components')) db.createObjectStore('components', { keyPath:'id' });
          if (!db.objectStoreNames.contains('ledger'))     db.createObjectStore('ledger', { keyPath:'id' }); // id = comp:<id>
        };
        req.onsuccess = function(){ res(req.result); };
        req.onerror   = function(){ rej(req.error || new Error('open failed')); };
      });
    }

    function tx(store, mode, fn){
      if (!ready) ready = open();
      return ready.then(function(db){
        return new Promise(function(res, rej){
          var t = db.transaction(store, mode);
          var st = t.objectStore(store);
          var out = fn(st);
          t.oncomplete = function(){ res(out); };
          t.onerror = function(){ rej(t.error || new Error('tx failed')); };
          t.onabort = function(){ rej(new Error('tx aborted')); };
        });
      });
    }

    function ledgerGet(compId){
      var id = 'comp:'+str(compId);
      return tx('ledger', 'readonly', function(st){
        return new Promise(function(res){
          var r = st.get(id);
          r.onsuccess = function(){ res(r.result || null); };
          r.onerror = function(){ res(null); };
        });
      });
    }
    function ledgerPut(entry){
      var id = entry && entry.id ? entry.id : ('comp:'+str(entry.componentId));
      entry = Object.assign({ id:id, updatedAt: now() }, entry||{});
      return tx('ledger','readwrite', function(st){ st.put(entry); });
    }
    function ledgerList(){
      return tx('ledger','readonly', function(st){
        return new Promise(function(res){
          var out = [];
          var req = st.openCursor();
          req.onsuccess = function(e){
            var cur = e.target.result;
            if (cur) { out.push(cur.value); cur.continue(); }
            else res(out);
          };
          req.onerror = function(){ res(out); };
        });
      });
    }

    return { ledgerGet:ledgerGet, ledgerPut:ledgerPut, ledgerList:ledgerList };
  })();

  // -------------------------------------------------------------------
  // Judgment Policy (قابلة للتهيئة)
  // -------------------------------------------------------------------
  var Policy = {
    window: { days: 14, minEvents: 40 },
    thresholds: { heavenScore: +40, hellScore: -50 },
    gates: { maxSevere: 0, allowNullifier: false },
    probation: { days: 7 }
  };

  function configure(policyPatch){
    if (!isObj(policyPatch)) return;
    if (policyPatch.window)     Policy.window     = Object.assign({}, Policy.window, policyPatch.window);
    if (policyPatch.thresholds) Policy.thresholds = Object.assign({}, Policy.thresholds, policyPatch.thresholds);
    if (policyPatch.gates)      Policy.gates      = Object.assign({}, Policy.gates, policyPatch.gates);
    if (policyPatch.probation)  Policy.probation  = Object.assign({}, Policy.probation, policyPatch.probation);
    try { Auditor && Auditor.info && Auditor.info('DEV-JCFG','Judgment policy updated', Policy); } catch(_){}
  }

  // -------------------------------------------------------------------
  // جمع ملخص مكوّن من Auditor (ضمن نافذة الحكم)
  // -------------------------------------------------------------------
  function _collectComponent(compId){
    var rep = (Auditor && Auditor.getComponentReport) ? Auditor.getComponentReport(compId) : { component:compId, score:0, pos:0, neg:0, nullified:false, details:[] };
    var spanMs = (Policy.window.days|0) * 86400 * 1000;
    var since = now() - spanMs;

    var details = (rep.details || []).filter(function(d){ return (d && d.time && d.time >= since); });
    var counts = {
      total: details.length,
      severe: details.filter(function(d){ return d && (d.degree===-6 || d.degree===-7); }).length,
      positives: details.filter(function(d){ return d && d.degree>0; }).length,
      negatives: details.filter(function(d){ return d && d.degree<0; }).length
    };

    var scoreWin = 0;
    for (var i=0;i<details.length;i++){
      var v = details[i] && details[i].value;
      if (typeof v === 'number') scoreWin += v;
      else if (typeof details[i].degree === 'number') scoreWin += details[i].degree;
    }

    return {
      id: rep.component,
      nullified: !!rep.nullified,
      windowSince: since,
      windowDays: Policy.window.days,
      counts: counts,
      scoreWindow: scoreWin,
      scoreTotal: rep.score|0,
      lastEventAt: details.length ? details[details.length-1].time : 0,
      details: details
    };
  }

  // -------------------------------------------------------------------
  // إصدار الحكم
  // -------------------------------------------------------------------
  function _buildReasons(sum){
    var reasons = [];
    if (sum.nullified) reasons.push({ code:'NULLIFIER_ACTIVE', message:'مُبطلات الأعمال مفعّلة' });
    if (sum.counts.severe > Policy.gates.maxSevere) reasons.push({ code:'SEVERE_EXCESS', message:'تجاوز حد الانتهاكات الشديدة', data:{ severe:sum.counts.severe, max:Policy.gates.maxSevere } });
    if (sum.scoreWindow <= Policy.thresholds.hellScore) reasons.push({ code:'LOW_SCORE', message:'النتيجة ضمن النافذة منخفضة جدًا', data:{ score:sum.scoreWindow, hellScore:Policy.thresholds.hellScore } });
    if (sum.scoreWindow >= Policy.thresholds.heavenScore && sum.counts.severe===0 && (!sum.nullified || Policy.gates.allowNullifier)) {
      reasons.push({ code:'EXCELLENT', message:'أداء متميّز ضمن النافذة' });
    }
    return reasons;
  }

  function judgeOne(componentId, policyPatch){
    if (isObj(policyPatch)) configure(policyPatch);
    var sum = _collectComponent(componentId);
    var eligible = (sum.counts.total >= (Policy.window.minEvents|0));
    var reasons = _buildReasons(sum);

    var verdict = 'PURGATORY';
    var why = [];

    if (!eligible) {
      verdict = 'PURGATORY';
      why.push({ code:'INSUFFICIENT_DATA', message:'بيانات غير كافية', data:{ total:sum.counts.total, need:Policy.window.minEvents } });
    } else {
      var hell = (sum.nullified && !Policy.gates.allowNullifier)
              || (sum.counts.severe > Policy.gates.maxSevere)
              || (sum.scoreWindow <= Policy.thresholds.hellScore);

      var heaven = (sum.scoreWindow >= Policy.thresholds.heavenScore)
                && (sum.counts.severe === 0)
                && (!sum.nullified || Policy.gates.allowNullifier);

      if (hell)     verdict = 'HELL';
      else if (heaven) verdict = 'HEAVEN';
      else            verdict = 'PURGATORY';
    }

    why = reasons.concat(why);

    var entry = {
      id: 'comp:'+str(componentId),
      componentId: str(componentId),
      verdict: verdict,
      decidedAt: now(),
      windowDays: Policy.window.days,
      minEvents: Policy.window.minEvents,
      stats: {
        scoreWindow: sum.scoreWindow,
        scoreTotal: sum.scoreTotal,
        counts: sum.counts,
        nullifier: sum.nullified
      },
      reasons: why
    };

    if (verdict === 'HELL' && Policy.probation && Policy.probation.days>0) {
      entry.probationUntil = now() + (Policy.probation.days * 86400 * 1000);
    }

    return DB.ledgerPut(entry).then(function(){
      try { Auditor && Auditor.info && Auditor.info('DEV-JUDGE','verdict '+verdict+' for "'+componentId+'"', entry); } catch(_){}
      return entry;
    });
  }

  function judgeAll(policyPatch){
    if (isObj(policyPatch)) configure(policyPatch);
    var ids = [];
    try { ids = (Auditor && Auditor.listComponents) ? Auditor.listComponents() : []; } catch(_){}
    if (!ids || !ids.length) return Promise.resolve([]);
    return Promise.all(ids.map(function(id){ return judgeOne(id); }));
  }

  function getLedger(){ return DB.ledgerList(); }
  function getVerdict(componentId){ return DB.ledgerGet(componentId); }
  function startProbation(componentId, days){
    var extra = (days|0) > 0 ? (days|0) : (Policy.probation.days|0) || 7;
    return DB.ledgerGet(componentId).then(function(e){
      var entry = e || { id:'comp:'+str(componentId), componentId:str(componentId) };
      entry.probationUntil = now() + (extra * 86400 * 1000);
      entry.verdict = 'PURGATORY';
      entry.updatedAt = now();
      return DB.ledgerPut(entry);
    });
  }
  function pardon(componentId, note){
    try { Auditor && Auditor.repent && Auditor.repent(componentId, note||'pardon'); } catch(_){}
    return DB.ledgerGet(componentId).then(function(e){
      var entry = e || { id:'comp:'+str(componentId), componentId:str(componentId) };
      entry.verdict = 'PURGATORY';
      entry.reasons = (entry.reasons||[]).concat([{ code:'PARDON', message:str(note||'pardon granted') }]);
      entry.updatedAt = now();
      delete entry.probationUntil;
      return DB.ledgerPut(entry);
    });
  }

  // -------------------------------------------------------------------
  // Snapshot: لمحة سريعة (Rules + Violations + Candidates)
  // -------------------------------------------------------------------
  function _rulesStats(){
    // نحاول قراءة حالة RuleCenter لو متاحة
    var total=0, active=0, disabled=0, note=null;
    try {
      if (M.RuleCenter) {
        if (typeof M.RuleCenter.stats === 'function') {
          var s = M.RuleCenter.stats();
          total   = s.total|0;
          active  = s.active|0;
          disabled= s.disabled|0;
        } else if (typeof M.RuleCenter.list === 'function') {
          var arr = toArr(M.RuleCenter.list());
          total = arr.length;
          for (var i=0;i<arr.length;i++){
            if (arr[i] && arr[i].enabled!==false) active++;
            else disabled++;
          }
        } else if (M.RuleCenter._rules) {
          var rs = toArr(M.RuleCenter._rules);
          total = rs.length;
          for (var j=0;j<rs.length;j++){
            if (rs[j] && rs[j].enabled!==false) active++; else disabled++;
          }
        } else {
          note = 'RuleCenter introspection unavailable';
        }
      } else {
        note = 'RuleCenter not present';
      }
    } catch(e){ note = 'RuleCenter stats error: '+(e&&e.message||e); }
    return { total:total, active:active, disabled:disabled, note:note };
  }

  function _topViolations(since){
    // نقرأ التفاصيل من Auditor summary، ونجمّع السلبيات فقط
    var out = [];
    var map = Object.create(null);
    try {
      var details = (Auditor && Auditor.getSummary) ? (Auditor.getSummary().details||[]) : [];
      for (var i=0;i<details.length;i++){
        var d = details[i];
        if (!d || typeof d.degree!=='number' || d.degree>=0) continue;
        if (since && d.time && d.time < since) continue;
        var key = (d.meta && (d.meta.ruleId||d.meta.id)) || d.name || d.message || 'unknown';
        if (!map[key]) map[key] = { key:key, count:0, degreeSum:0, lastAt:0, samples:[] };
        var bucket = map[key];
        bucket.count++;
        bucket.degreeSum += d.degree;
        if (d.time && d.time>bucket.lastAt) bucket.lastAt = d.time;
        if (bucket.samples.length<3) bucket.samples.push({ comp:d.component, deg:d.degree, msg:d.message });
      }
      out = Object.keys(map).map(function(k){
        var b = map[k];
        return { key:b.key, count:b.count, avgDegree:(b.degreeSum/b.count), lastAt:b.lastAt, samples:b.samples };
      }).sort(function(a,b){
        if (b.count!==a.count) return b.count-a.count;
        return (a.avgDegree - b.avgDegree); // الأشد أولاً (أكثر سالبًا)
      }).slice(0,5);
    } catch(_){}
    return out;
  }

  function _sortVerdicts(entries){
    // ترتيب: HELL (الأدنى scoreWindow) → HEAVEN (الأعلى) → PURGATORY
    var rank = { HELL:0, HEAVEN:1, PURGATORY:2 };
    return entries.sort(function(a,b){
      var ra = rank[a.verdict] != null ? rank[a.verdict] : 9;
      var rb = rank[b.verdict] != null ? rank[b.verdict] : 9;
      if (ra!==rb) return ra-rb;
      // داخل نفس الفئة: HELL تصاعدي scoreWindow / HEAVEN تنازلي / PURGATORY تنازلي total
      if (a.verdict==='HELL' && b.verdict==='HELL') return a.stats.scoreWindow - b.stats.scoreWindow;
      if (a.verdict==='HEAVEN' && b.verdict==='HEAVEN') return b.stats.scoreWindow - a.stats.scoreWindow;
      return (b.stats.counts.total - a.stats.counts.total);
    });
  }

  function _fmtDate(ts){
    try { return new Date(ts).toLocaleString(); } catch(_){ return String(ts||''); }
  }

  function snapshotCompute(opts){
    var spanMs = (Policy.window.days|0) * 86400 * 1000;
    var since = now() - spanMs;
    var rules = _rulesStats();
    var topV  = _topViolations(since);

    // نُشغّل الحكم على كل المكوّنات ونرجّع المرشحين
    return judgeAll(opts && opts.policy).then(function(entries){
      var sorted = _sortVerdicts(toArr(entries));
      var top5   = sorted.slice(0,5).map(function(e){
        return {
          component: e.componentId,
          verdict:   e.verdict,
          score:     e.stats.scoreWindow,
          severe:    e.stats.counts.severe,
          total:     e.stats.counts.total,
          nullifier: !!(e.stats && e.stats.nullifier),
          reasons:   toArr(e.reasons).slice(0,3).map(function(r){ return r && r.code; })
        };
      });

      return {
        windowDays: Policy.window.days,
        rules: rules,
        topViolations: topV,
        candidates: top5
      };
    });
  }

  function snapshotPrint(opts){
    return snapshotCompute(opts).then(function(s){
      try {
        console.groupCollapsed('%c[Mishkah] Snapshot','color:#6366f1;font-weight:bold;');
        console.info('Window (days):', s.windowDays);
        console.info('Rules   => total:', s.rules.total, ' active:', s.rules.active, ' disabled:', s.rules.disabled, s.rules.note?(' • '+s.rules.note):'');
        console.groupCollapsed('Top 5 Violations');
        console.table(s.topViolations.map(function(v){
          return {
            key: v.key,
            count: v.count,
            avgDegree: v.avgDegree.toFixed ? v.avgDegree.toFixed(2) : v.avgDegree,
            lastAt: _fmtDate(v.lastAt),
            sample: (v.samples[0] && (v.samples[0].comp+': '+v.samples[0].deg+' '+(v.samples[0].msg||''))) || ''
          };
        }));
        console.groupEnd();

        console.groupCollapsed('Top 5 Candidates');
        console.table(s.candidates.map(function(c){
          return {
            component: c.component,
            verdict: c.verdict,
            score: c.score,
            severe: c.severe,
            total: c.total,
            nullifier: c.nullifier,
            reasons: (c.reasons||[]).join(',')
          };
        }));
        console.groupEnd();

        console.groupEnd();
      } catch(e){
        console.warn('[Mishkah] Snapshot print failed:', e);
        console.log(s);
      }
      return s;
    });
  }
// --- HMR shim (اختياري وخامل افتراضيًا) ---
var _hmr = {
  enabled: false,
  _handler: null,  // function () => void
  enable: function(){ this.enabled = true; try { console.info('[Mishkah] HMR enabled'); } catch(_){} },
  disable: function(){ this.enabled = false; this._handler = null; },
  setHandler: function(fn){ this._handler = (typeof fn === 'function') ? fn : null; },
  trigger: function(reason){
    if (!this.enabled) return;
    try { console.debug('[Mishkah] HMR trigger:', reason||''); } catch(_){}
    if (this._handler) try { this._handler(reason); } catch(e){ console.warn('[Mishkah] HMR handler error', e); }
  },
  // APIs مألوفة لو عايز توصيل مباشر مع بيئات HMR
  accept: function(cb){ this.setHandler(cb); this.enable(); },
  invalidate: function(){ this.trigger('invalidate'); }
};


  // -------------------------------------------------------------------
  // واجهة DevTools
  // -------------------------------------------------------------------
  var Devtools = M.Devtools || {};
  Devtools.Judgment = {
    configure: configure,
    judgeOne: judgeOne,
    judgeAll: judgeAll,
    getVerdict: function(id){ return DB.ledgerGet(id); },
    getLedger: function(){ return DB.ledgerList(); },
    startProbation: startProbation,
    pardon: pardon,
    policy: Policy
  };
  Devtools.Snapshot = {
    compute: snapshotCompute,
    print: snapshotPrint
  };
  Devtools.HMR = _hmr;

  // ===== Inspectors (App/Store registries) =====
  var StoreInspector = {};
  var AppInspector = {};

  function getStoreRegistry(){
    return global.__MISHKAH_STORE_REGISTRY__ || [];
  }
  function getAppRegistry(){
    return global.__MISHKAH_APP_REGISTRY__ || [];
  }
  function resolveStoreTarget(target){
    var registry = getStoreRegistry();
    if (!registry.length) return null;
    if (target == null) return registry[registry.length - 1];
    if (typeof target === 'number') return registry[target] || null;
    if (typeof target === 'string'){
      for (var i=0;i<registry.length;i++){
        var entry = registry[i];
        if (!entry) continue;
        if (entry.__storeId === target || entry.moduleId === target || entry.role === target){
          return entry;
        }
      }
    }
    if (registry.indexOf(target) !== -1) return target;
    return null;
  }
  function resolveAppTarget(target){
    var registry = getAppRegistry();
    if (!registry.length) return null;
    if (target == null) return registry[registry.length - 1];
    if (typeof target === 'number') return registry[target] || null;
    if (typeof target === 'string'){
      for (var i=0;i<registry.length;i++){
        var entry = registry[i];
        if (!entry) continue;
        if (entry.__appId === target || entry.__appMountTarget === target) return entry;
      }
    }
    if (registry.indexOf(target) !== -1) return target;
    return null;
  }

  StoreInspector.list = function(){
    return getStoreRegistry().map(function(store, index){
      if (!store) return null;
      return {
        index: index,
        id: store.__storeId || ('store#' + (index + 1)),
        branchId: store.branchId,
        moduleId: store.moduleId,
        role: store.role,
        status: store.status
      };
    }).filter(Boolean);
  };
  StoreInspector.state = function(target){
    var store = resolveStoreTarget(target);
    if (!store){
      console.warn('[Mishkah][Inspectors] store not found');
      return null;
    }
    var state = store.getState ? store.getState() : null;
    console.log('[Mishkah][StoreInspector][state]', store.__storeId, state);
    return state;
  };
  StoreInspector.dump = function(tableName, limit, target){
    if (!tableName){
      console.warn('[Mishkah][Inspectors] Provide table name, e.g. MishkahStoreDump(\"sbn_posts\")');
      return [];
    }
    var store = resolveStoreTarget(target);
    if (!store){
      console.warn('[Mishkah][Inspectors] store not found for dump');
      return [];
    }
    var rows = store.listTable ? store.listTable(tableName) : [];
    var sample = Array.isArray(rows) ? rows.slice(0, limit || 10) : rows;
    console.log('[Mishkah][StoreInspector][dump]', store.__storeId, tableName, 'count:', Array.isArray(rows) ? rows.length : 0, 'sample:', sample);
    return sample;
  };

  AppInspector.list = function(){
    return getAppRegistry().map(function(instance, index){
      if (!instance) return null;
      return {
        index: index,
        id: instance.__appId || ('app#' + (index + 1)),
        mounted: !!instance.root,
        mountTarget: instance.__appMountTarget || null
      };
    }).filter(Boolean);
  };
  AppInspector.state = function(target){
    var instance = resolveAppTarget(target);
    if (!instance){
      console.warn('[Mishkah][Inspectors] app instance not found');
      return null;
    }
    var snapshot = instance.getState ? instance.getState() : null;
    console.log('[Mishkah][AppInspector][state]', instance.__appId, snapshot);
    return snapshot;
  };
  AppInspector.instance = function(target){
    var instance = resolveAppTarget(target);
    if (!instance){
      console.warn('[Mishkah][Inspectors] app instance not found');
      return null;
    }
    console.log('[Mishkah][AppInspector][instance]', instance.__appId, instance);
    return instance;
  };

  Devtools.StoreInspector = StoreInspector;
  Devtools.AppInspector = AppInspector;
  global.MishkahStoreDebug = StoreInspector;
  global.MishkahStoreDump = function(tableName, limit, target){
    return StoreInspector.dump(tableName, limit, target);
  };
  global.MishkahAppDebug = AppInspector;

  M.Devtools = Devtools;

  return M;
}));

/*!
ُExample


M.Devtools.Judgment.configure({
  window: { days: 30, minEvents: 100 },
  thresholds: { heavenScore: 80, hellScore: -80 },
  gates: { maxSevere: 0, allowNullifier: false },
  probation: { days: 14 }
});

// حكم مكوّن واحد
M.Devtools.Judgment.judgeOne('HeaderBar#v1').then(console.log);

// حكم جميع المكوّنات المرصودة
M.Devtools.Judgment.judgeAll().then(console.table);

// عرض السجل (Ledger)
M.Devtools.Judgment.getLedger().then(console.log);

// بدء فترة اختبار لمكوّن “في المكونات التالفة”
M.Devtools.Judgment.startProbation('HeaderBar#v1', 10);

// عفو إداري + فرصة جديدة
M.Devtools.Judgment.pardon('HeaderBar#v1', 'تم الإصلاح وإضافة اختبارات');

// اطبع Snapshot في أي وقت:
Mishkah.Devtools.Snapshot.print();

// أو خُذ القيم برمجياً:
Mishkah.Devtools.Snapshot.compute().then(({ rules, topViolations, candidates }) => {
  // اعمل اللي تحبّه — UI/لوحة داخلية إلخ.
});

// طريقة عمل Hot Code
// طريقة التوصيل: لو عندك app من النواة:

Mishkah.Devtools.HMR.setHandler(() => app.rebuild());
Mishkah.Devtools.HMR.enable();
//مع Vite مثلًا:
if (import.meta && import.meta.hot) {
  import.meta.hot.accept(() => {
    Mishkah.Devtools.HMR.trigger('module-updated');
  });
}


 */
 
 /*!
 * mishkah.config.defaults.js — Unified defaults bootstrap (UMD)
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () { return factory(root, root.Mishkah); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, root.Mishkah);
  } else {
    root.Mishkah = factory(root, root.Mishkah);
  }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
  "use strict";
  M = M || (global.Mishkah = {});

  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
  function assign(t){ t=t||{}; for (var i=1;i<arguments.length;i++){ var s=arguments[i]; if(!isObj(s)) continue; for (var k in s) t[k]=s[k]; } return t; }

  // --------- الرؤية الافتراضية تحت db.config.mishkah ----------
  var DEFAULT_CONFIG = {
    guardian: {
      config: {
        allowTags: null,                      // null => اسمح بكل التاجات ماعدا الممنوعة
        denyTags: { script:1, template:0 },   // امنع <script> دائمًا
        denyAttrs: [/^on/i],                  // امنع أي on*
        urlSchemes: {                         // مخططات الروابط المسموحة
          allow: ['http','https','mailto','tel','data','blob'],
          denyJS: true                        // امنع javascript:
        }
      },
      // قوانين عامة (حماية “هيكلية”) — تُنفّذ في طبقة الحارس
      // لو action='block' هيوقف/ينظّف العنصر فورًا
      laws: [
        { id:'a-js-scheme', phase:'vnode', selector:'a', check:'url-scheme-safe', action:'block', priority:10 },
        { id:'no-inline-on', phase:'vnode', attrs:/^on/i, check:'deny-attr', action:'block', priority:9 },
        { id:'img-no-js', phase:'vnode', selector:'img', check:'url-scheme-safe', action:'block', priority:8 }
      ]
    },

    rulecenter: {
      // قواعد مطابقة “ديناميكية” — (لا تمنع المستحيل؛ تقدّر/تحذر/تحجب اختيارياً)
      // when: 'event' | 'vnode' | 'state' | 'afterRender'
      // action: 'grade' | 'warn' | 'block' | 'none'
      defaults: [
        // 1) كثرَة خيارات select → سلوك سيء (مكروه/مخالفة حسب العدد)
        {
          id:'select-too-many',
          when:'vnode', selector:'select',
          test: function(node){ return (node && node.childrenCount) ? node.childrenCount > 20 : false; },
          action:'grade', degree:-3, // الجُنح
          message:'Select به خيارات كثيرة (+20) — استخدم Select مع بحث.'
        },
        // 2) حقن HTML غير موثوق → انتهاك خطير
        {
          id:'unsafe-html',
          when:'vnode',
          selector:'*',
          test: function(node){ return !!(node && node.props && node.props.dangerouslySetInnerHTML); },
          action:'grade', degree:-6, // المنهيات
          message:'حقن HTML غير آمن (dangerouslySetInnerHTML).'
        },
        // 3) غياب مفتاح ترجمة ظاهر في DOM (كود سميل)
        {
          id:'missing-i18n',
          when:'vnode',
          selector:'*',
          test: function(node, db){
            if (!node || !node.props) return false;
            var tkey = node.props.t || node.props['t:title'] || node.props['t:aria-label'];
            if (!tkey) return false;
            // افتراض: توجد دالة i18n t(db,key) في النواة، هنا نتحقق “شكلًا”:
            return false; // اجعلها true إذا عندك وسيط يكشف أن المفتاح رجع نفس key
          },
          action:'grade', degree:-4, // المواعظ
          message:'مفتاح ترجمة غير موجود أو غير مُعرّف.'
        },
        // 4) لوحة مفاتيح: حدث “keydown” ثقيل (زمن > threshold.event)
        {
          id:'heavy-keydown',
          when:'event',
          on:'keydown',
          test: function(evt, ctx, env){ return !!(env && env.timing && env.timing.overEvent); },
          action:'grade', degree:-3,
          message:'معالجة keydown بطيئة.'
        },
        // 5) ممارسة جيدة: استخدام aria-label على أيقونة زر
        {
          id:'aria-on-icon',
          when:'vnode',
          selector:'button',
          test: function(node){
            if (!node || !node.props) return false;
            var txt = (node.props.textContent||'').trim();
            var hasIcon = !!node.props['data-icon'];
            return hasIcon && !txt && !!node.props['aria-label'];
          },
          action:'grade', degree:+2, // الترغيب
          message:'زر أيقونة مزوّد بـ aria-label (إتاحة وصول جيدة).'
        }
      ]
    },

    auditor: {
      level:'info',
      timing: {
        thresholds: { event:16, rebuild:33, render:16, ajax:300, route:80, custom:50 },
        bands:      { minor:1.2, major:2.0, severe:4.0 }
      },
      // أمثلة توثيقية على السُلّم (14 درجة):
      examples: {
        positive: [
          { degree:+4, title:'Robust Implementation', note:'معالجة حالات الحواف + اختبارات وحدة.' },
          { degree:+2, title:'Preferred Pattern',     note:'استخدام aria-label على زر أيقونة.' }
        ],
        negative: [
          { degree:-6, title:'Forbidden Pattern', note:'حقن HTML غير آمن / الوصول لـ innerHTML بدون تعقيم.' },
          { degree:-3, title:'Minor Deviation',  note:'select به +20 خيار بدون بحث.' }
        ],
        nullifier: [
          { trigger:'Untrusted HTML injection', effect:'تفعيل مُبطلات الأعمال — تسقط الحسنات السابقة ولا تُسجّل اللاحقة حتى إصلاح السبب.' }
        ]
      }
    },

    devtools: {
      // سياسة “يوم الحساب” — الحكم المؤجّل المبني على تشغيل حقيقي
      policy: {
        ledger: { keepDays: 90, cap: 5000 },
        judgment: {
          windowDays: 30,      // نافذة التجميع
          probationDays: 7,    // فترة اختبار قبل إعادة التقييم
          heavenScoreMin: +15, // عتبة النعيم
          hellScoreMax:  -20,  // عتبة الجحيم
          requireSamples: 5     // حد أدنى من السجلات لاعتبار الحكم
        }
      }
    }
  };

  // --------- واجهة تطبيق الإعدادات على db وتهيئة الأنظمة ----------
  function applyUnifiedConfig(db){
    db = db || {};
    db.config = db.config || {};
    db.config.mishkah = assign({}, DEFAULT_CONFIG, db.config.mishkah || {});

    var C = db.config.mishkah;

    // Guardian
    if (M.Guardian && C.guardian && C.guardian.config) {
      try { M.Guardian.setConfig(C.guardian.config); } catch(_){}
      // ربط القوانين الافتراضية بالحارس (لو كان يدعم سجل قوانين داخلي)
      if (Array.isArray(C.guardian.laws) && M.Guardian.registerLaw) {
        for (var i=0;i<C.guardian.laws.length;i++){
          var lw = C.guardian.laws[i];
          try { M.Guardian.registerLaw(lw.id || ('law-'+i), function(vnode, db){/* قانون يُنفَّذ داخل الحارس نفسه إن لزم */}, lw.roles||['*'], lw.priority||0); } catch(_){}
        }
      }
    }

    // RuleCenter — سجّل القواعد الافتراضية
    if (M.RuleCenter && Array.isArray(C.rulecenter && C.rulecenter.defaults)) {
      try { M.RuleCenter.registerMany(C.rulecenter.defaults); } catch(_){}
    }

    // Auditor
    if (M.Auditor && C.auditor) {
      try { M.Auditor.config({ level:C.auditor.level, timing:C.auditor.timing }); } catch(_){}
      try { M.Auditor.timing.wrapNetworkingOnce(); } catch(_){}
    }

    // DevTools
    if (M.Devtools && C.devtools && C.devtools.policy) {
      try { M.Devtools.config(C.devtools.policy); } catch(_){}
    }
    return db;
  }

  // تصدير
  M.ConfigDefaults = {
    defaults: DEFAULT_CONFIG,
    apply: applyUnifiedConfig
  };
  return M;
}));
/*!
example

<script src="mishkah.core.js"></script>
<script src="mishkah.rulecenter.js"></script>
<script src="mishkah.guardian.js"></script>
<script src="mishkah.auditor.js"></script>
<script src="mishkah.devtools.js"></script>
<script src="mishkah.config.defaults.js"></script>
<script>
  // db الأولية
  var database = {
    env: { theme:'dark', lang:'ar' },
    config: {
      // لو عندك تخصيصات، احطها هنا — هتندمج مع الافتراضات
      mishkah: {
        auditor: {
          level:'info',
          timing: { thresholds: { ajax: 400 } } // مثال: رفع حدّ AJAX
        }
      }
    }
  };

  // تطبيق الإعدادات الموحدة
  Mishkah.ConfigDefaults.apply(database);

  // ثم كمل تشغيل التطبيق…
  var app = Mishkah.app.createApp(database, orders);
  app.mount('#app');
</script>


 */
