(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(function () {
      return factory(root);
    });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.MishkahHTMLx = factory(root);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  function ensureMishkah() {
    var host = global || {};
    host.Mishkah = host.Mishkah || {};
    host.Mishkah.app = host.Mishkah.app || {};
    host.Mishkah.utils = host.Mishkah.utils || {};
    host.Mishkah.DSL = host.Mishkah.DSL || {};
    host.Mishkah.UI = host.Mishkah.UI || {};
    if (!host.M || host.M !== host.Mishkah) {
      host.M = host.Mishkah;
    }
    if (typeof globalThis === 'object' && globalThis && (!globalThis.M || globalThis.M !== host.Mishkah)) {
      globalThis.M = host.Mishkah;
    }
    return host.Mishkah;
  }

  var Mishkah = ensureMishkah();
  var U = Mishkah.utils || {};

  function simpleHash32(str) {
    var source = String(str || '');
    var h = 2166136261;
    for (var i = 0; i < source.length; i += 1) {
      h ^= source.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return ((h >>> 0).toString(16));
  }

  function createHash(input) {
    var str = String(input || '');
    var hash = 0;
    for (var i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    var hex = (hash >>> 0).toString(16);
    return hex.length >= 8 ? hex.slice(-8) : ('0000000' + hex).slice(-8);
  }

  function pascalCase(tag) {
    return tag
      .split('-')
      .map(function (segment) {
        if (!segment) return '';
        return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
      })
      .join('');
  }

  /**
   * Flexible Component Name Resolution
   * حل اسم المكون بشكل مرن يدعم عدة أنماط:
   *
   * JSX-style: <Modal> → Modal
   * Vue-style: <modal> → Modal
   * Web Components: <m-modal> → Modal
   * Legacy: <comp-Modal> → Modal
   *
   * @param {string} tag - اسم الوسم
   * @returns {string|null} - اسم المكون إذا وُجد، null إذا لم يُجد
   */
  function resolveComponentName(tag) {
    if (!tag) return null;

    var tagLower = tag.toLowerCase();
    if (tagLower === 'button') return null;

    // 1. Legacy support: comp-Modal → Modal
    if (tagLower.indexOf('comp-') === 0) {
      return pascalCase(tag.slice(5));
    }

    // 2. Web Components: m-modal → Modal (prefix م يرمز لـ Mishkah)
    if (tagLower.indexOf('m-') === 0) {
      return pascalCase(tag.slice(2));
    }

    // 3. JSX-style: Modal → Modal (already PascalCase)
    // 4. Vue-style: modal → Modal (convert to PascalCase)
    var componentName = pascalCase(tag);

    // تحقق من وجود المكون في Mishkah.UI
    if (Mishkah && Mishkah.UI) {
      // 1. Exact match (e.g. "Button")
      if (typeof Mishkah.UI[componentName] === 'function') {
        return componentName;
      }

      // 2. Case-insensitive search (e.g. "THEMETOGGLEICON" -> "ThemeToggleIcon")
      // هذا يحل مشكلة تحويل المتصفح للأسماء إلى أحرف كبيرة
      var uiKeys = Object.keys(Mishkah.UI);
      var tagUpper = tag.toUpperCase();
      for (var i = 0; i < uiKeys.length; i++) {
        if (uiKeys[i].toUpperCase() === tagUpper) {
          return uiKeys[i];
        }
      }
    }

    return null;
  }

  var ATOM_FAMILIES = {
    div: ['Containers', 'Div'],
    section: ['Containers', 'Section'],
    article: ['Containers', 'Article'],
    header: ['Containers', 'Header'],
    footer: ['Containers', 'Footer'],
    main: ['Containers', 'Main'],
    nav: ['Containers', 'Nav'],
    aside: ['Containers', 'Aside'],
    span: ['Text', 'Span'],
    p: ['Text', 'P'],
    a: ['Text', 'A'],
    strong: ['Text', 'Strong'],
    em: ['Text', 'Em'],
    h1: ['Text', 'H1'],
    h2: ['Text', 'H2'],
    h3: ['Text', 'H3'],
    h4: ['Text', 'H4'],
    h5: ['Text', 'H5'],
    h6: ['Text', 'H6'],
    ul: ['Lists', 'Ul'],
    ol: ['Lists', 'Ol'],
    li: ['Lists', 'Li'],
    dl: ['Lists', 'Dl'],
    dt: ['Lists', 'Dt'],
    dd: ['Lists', 'Dd'],
    form: ['Forms', 'Form'],
    label: ['Forms', 'Label'],
    button: ['Forms', 'Button'],
    fieldset: ['Forms', 'Fieldset'],
    legend: ['Forms', 'Legend'],
    input: ['Inputs', 'Input'],
    textarea: ['Inputs', 'Textarea'],
    select: ['Inputs', 'Select'],
    option: ['Inputs', 'Option'],
    img: ['Media', 'Img'],
    video: ['Media', 'Video'],
    audio: ['Media', 'Audio'],
    picture: ['Media', 'Picture'],
    table: ['Tables', 'Table'],
    thead: ['Tables', 'Thead'],
    tbody: ['Tables', 'Tbody'],
    tr: ['Tables', 'Tr'],
    th: ['Tables', 'Th'],
    td: ['Tables', 'Td'],
    svg: ['SVG', 'Svg'],
    path: ['SVG', 'Path'],
    circle: ['SVG', 'Circle'],
    rect: ['SVG', 'Rect']
  };

  var EVENT_ATTRIBUTES = ['onclick', 'ondblclick', 'oninput', 'onchange', 'onsubmit', 'onfocus', 'onblur', 'onkeydown', 'onkeyup', 'onkeypress'];

  function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  function createNodeKey(namespace, path, hint) {
    var ns = namespace ? String(namespace) : 'ns';
    var basis = ns + '|' + String(path || '') + (hint ? '|' + String(hint) : '');
    return createHash(basis);
  }

  function cloneTemplateContent(template) {
    var fragment = template.content ? template.content.cloneNode(true) : null;
    if (!fragment && template.innerHTML) {
      var temp = (template.ownerDocument || document).createElement('div');
      temp.innerHTML = template.innerHTML;
      fragment = document.createDocumentFragment();
      while (temp.firstChild) fragment.appendChild(temp.firstChild);
    }
    return fragment || document.createDocumentFragment();
  }

  function extractTemplateParts(template) {
    var namespace = template.getAttribute('data-namespace') || template.id || 'ns-' + createHash(template.innerHTML || '');
    var mount = template.getAttribute('data-mount') || null;
    var fragment = cloneTemplateContent(template);
    var styles = '';
    var scripts = [];
    var children = [];

    var child = fragment.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (child.nodeType === 1 && child.tagName.toLowerCase() === 'style' && !styles) {
        styles = child.textContent || '';
        if (child.parentNode) {
          child.parentNode.removeChild(child);
        }
      } else {
        if (child.nodeType === 1 && child.tagName.toLowerCase() === 'script') {
          scripts.push(child.textContent || '');
        }
        children.push(child);
      }
      child = next;
    }

    var cleanFragment = document.createDocumentFragment();
    for (var i = 0; i < children.length; i += 1) {
      cleanFragment.appendChild(children[i]);
    }

    return {
      namespace: namespace,
      mount: mount,
      fragment: cleanFragment,
      styleSource: styles,
      scriptSource: scripts.join('\n')
    };
  }

  function describeTemplate(template) {
    if (!template || typeof template.getAttribute !== 'function') return 'template';
    var ns = template.getAttribute('data-namespace');
    if (ns) return 'template[' + ns + ']';
    var id = template.getAttribute('id');
    if (id) return 'template#' + id;
    return 'template';
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function cloneSerializableValue(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return cloneSerializableValue(item);
      });
    }
    if (isPlainObject(value)) {
      var out = {};
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        out[key] = cloneSerializableValue(value[key]);
      }
      return out;
    }
    return value;
  }

  function parseJsonAttributeValue(raw, contextLabel, attrName) {
    var text = String(raw || '').trim();
    if (!text) return { data: null };
    try {
      var parsed = JSON.parse(text);
      return { data: parsed };
    } catch (error) {
      var message = 'HTMLx: ' + attrName + ' داخل ' + contextLabel + ' ليس JSON صالحًا: ' + error.message;
      console.warn(message);
      return { error: message };
    }
  }

  function parseAjaxDescriptor(scriptEl, templateEl) {
    var contextLabel = describeTemplate(templateEl);
    var descriptor = null;
    var warnings = [];
    if (!scriptEl || typeof scriptEl.getAttribute !== 'function') {
      return { descriptor: null, warnings: warnings };
    }
    var ajaxAttr = scriptEl.getAttribute('data-m-ajax');
    if (ajaxAttr != null) {
      descriptor = descriptor || {};
      var trimmed = String(ajaxAttr).trim();
      if (trimmed && (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[')) {
        var inlineResult = parseJsonAttributeValue(trimmed, contextLabel, 'data-m-ajax');
        if (inlineResult && inlineResult.data && isPlainObject(inlineResult.data)) {
          descriptor.inline = inlineResult.data;
        } else if (inlineResult && inlineResult.data == null) {
          descriptor.inline = {};
        } else if (inlineResult && inlineResult.error) {
          warnings.push(inlineResult.error);
        }
      } else if (trimmed) {
        descriptor.ref = trimmed;
      }
    }
    var mergeAttr = scriptEl.getAttribute('data-m-ajax-merge');
    if (mergeAttr != null) {
      descriptor = descriptor || {};
      var mergeResult = parseJsonAttributeValue(mergeAttr, contextLabel, 'data-m-ajax-merge');
      if (mergeResult && mergeResult.data && isPlainObject(mergeResult.data)) {
        descriptor.overrides = mergeResult.data;
      } else if (mergeResult && mergeResult.data == null) {
        descriptor.overrides = {};
      } else if (mergeResult && mergeResult.error) {
        warnings.push(mergeResult.error);
      }
    }
    var varsAttr = scriptEl.getAttribute('data-m-ajax-vars');
    if (varsAttr != null) {
      descriptor = descriptor || {};
      var varsResult = parseJsonAttributeValue(varsAttr, contextLabel, 'data-m-ajax-vars');
      if (varsResult && varsResult.data && isPlainObject(varsResult.data)) {
        descriptor.vars = varsResult.data;
      } else if (varsResult && varsResult.data == null) {
        descriptor.vars = {};
      } else if (varsResult && varsResult.error) {
        warnings.push(varsResult.error);
      }
    }
    var modeAttr = scriptEl.getAttribute('data-m-ajax-mode');
    if (modeAttr != null) {
      descriptor = descriptor || {};
      descriptor.mode = String(modeAttr).trim().toLowerCase();
    }
    var responseAttr = scriptEl.getAttribute('data-m-ajax-response');
    if (responseAttr != null) {
      descriptor = descriptor || {};
      descriptor.responseType = String(responseAttr).trim();
    }
    var extractAttr = scriptEl.getAttribute('data-m-ajax-extract') || scriptEl.getAttribute('data-m-ajax-path') || scriptEl.getAttribute('data-m-ajax-response-path');
    if (extractAttr != null) {
      descriptor = descriptor || {};
      descriptor.responsePath = String(extractAttr).trim();
    }
    var assignAttr = scriptEl.getAttribute('data-m-ajax-assign');
    if (assignAttr != null) {
      descriptor = descriptor || {};
      descriptor.assign = String(assignAttr).trim();
    }
    if (scriptEl.hasAttribute('data-m-ajax-auto')) {
      descriptor = descriptor || {};
      var autoAttr = scriptEl.getAttribute('data-m-ajax-auto');
      if (autoAttr == null || autoAttr === '') {
        descriptor.auto = false;
      } else {
        descriptor.auto = !(String(autoAttr).trim().toLowerCase() === 'false');
      }
    }
    if (descriptor && descriptor.mode === '') delete descriptor.mode;
    if (descriptor && descriptor.responseType === '') delete descriptor.responseType;
    if (descriptor && descriptor.responsePath === '') delete descriptor.responsePath;
    if (descriptor && descriptor.assign === '') delete descriptor.assign;
    return { descriptor: descriptor, warnings: warnings };
  }

  function parseAjaxMapScript(scriptEl, templateEl) {
    var contextLabel = describeTemplate(templateEl);
    var ownerAttr = scriptEl && typeof scriptEl.getAttribute === 'function'
      ? (scriptEl.getAttribute('data-for') || scriptEl.getAttribute('data-owner') || scriptEl.getAttribute('data-m-owner') || '')
      : '';
    var owner = typeof ownerAttr === 'string' ? ownerAttr.trim() : '';
    var locationLabel = owner ? contextLabel + ' › ' + owner : contextLabel;
    var keyAttr = scriptEl && typeof scriptEl.getAttribute === 'function' ? scriptEl.getAttribute('data-m-ajax-map') : null;
    var explicitKey = keyAttr != null ? String(keyAttr).trim() : '';
    var raw = (scriptEl && (scriptEl.textContent || scriptEl.innerText || '')) || '';
    var text = raw.trim();
    var warnings = [];
    var entries = {};
    if (!text) {
      if (explicitKey) {
        entries[explicitKey] = {};
      }
      return { entries: entries, warnings: warnings, owner: owner || null, source: locationLabel };
    }
    var data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      var message = 'HTMLx: data-m-ajax-map داخل ' + locationLabel + ' ليس JSON صالحًا: ' + error.message;
      console.warn(message);
      warnings.push(message);
      return { entries: entries, warnings: warnings, owner: owner || null, source: locationLabel };
    }
    if (explicitKey) {
      if (!isPlainObject(data)) {
        var singleMessage = 'HTMLx: data-m-ajax-map المفتاح ' + explicitKey + ' داخل ' + locationLabel + ' يجب أن يكون كائن JSON.';
        console.warn(singleMessage);
        warnings.push(singleMessage);
        return { entries: entries, warnings: warnings, owner: owner || null, source: locationLabel };
      }
      entries[explicitKey] = cloneSerializableValue(data);
      return { entries: entries, warnings: warnings, owner: owner || null, source: locationLabel };
    }
    if (!isPlainObject(data)) {
      var typeMessage = 'HTMLx: data-m-ajax-map داخل ' + locationLabel + ' يجب أن يكون كائن JSON.';
      console.warn(typeMessage);
      warnings.push(typeMessage);
      return { entries: entries, warnings: warnings, owner: owner || null, source: locationLabel };
    }
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      var value = data[key];
      if (!isPlainObject(value)) {
        var warn = 'HTMLx: data-m-ajax-map المفتاح ' + key + ' داخل ' + locationLabel + ' يجب أن يكون كائناً.';
        console.warn(warn);
        warnings.push(warn);
        continue;
      }
      entries[key] = cloneSerializableValue(value);
    }
    return { entries: entries, warnings: warnings, owner: owner || null, source: locationLabel };
  }

  function mergeAjaxConfig(base, patch) {
    var result = isPlainObject(base) ? cloneSerializableValue(base) : {};
    if (!patch || typeof patch !== 'object') return result;
    for (var key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      var value = patch[key];
      if (isPlainObject(value)) {
        var current = isPlainObject(result[key]) ? result[key] : {};
        result[key] = mergeAjaxConfig(current, value);
        continue;
      }
      if (Array.isArray(value)) {
        result[key] = value.map(function (item) { return cloneSerializableValue(item); });
        continue;
      }
      result[key] = value;
    }
    return result;
  }

  function splitPathSegments(path) {
    if (!path) return [];
    var normalized = String(path).replace(/\[(\d+)\]/g, '.$1');
    return normalized.split('.').map(function (part) { return part.trim(); }).filter(function (part) { return part.length; });
  }

  function isNumericKey(key) {
    return /^\d+$/.test(key);
  }

  function getBySegments(source, segments) {
    if (!segments || !segments.length) return source;
    var cursor = source;
    for (var i = 0; i < segments.length; i += 1) {
      if (cursor == null) return undefined;
      var key = segments[i];
      if (Array.isArray(cursor) && isNumericKey(key)) {
        cursor = cursor[parseInt(key, 10)];
      } else {
        cursor = cursor[key];
      }
    }
    return cursor;
  }

  function setBySegments(target, segments, value) {
    if (!target || !segments || !segments.length) return;
    var cursor = target;
    for (var i = 0; i < segments.length - 1; i += 1) {
      var key = segments[i];
      var next = cursor[key];
      if (!next || (typeof next !== 'object')) {
        var nextKey = segments[i + 1];
        if (Array.isArray(cursor) && isNumericKey(key)) {
          next = {};
          cursor[parseInt(key, 10)] = next;
        } else if (isNumericKey(nextKey)) {
          next = [];
          cursor[key] = next;
        } else {
          next = {};
          cursor[key] = next;
        }
      }
      cursor = next;
    }
    var lastKey = segments[segments.length - 1];
    if (Array.isArray(cursor) && isNumericKey(lastKey)) {
      cursor[parseInt(lastKey, 10)] = value;
    } else {
      cursor[lastKey] = value;
    }
  }

  function resolvePlaceholderString(str, context) {
    if (typeof str !== 'string') return str;
    var exactMatch = str.match(/^\s*\{\{([^}]+)\}\}\s*$/);
    var resolver = function (token) {
      var path = token.trim();
      if (!path) return '';
      var source = context.db;
      if (path.indexOf('vars.') === 0) {
        source = context.vars;
        path = path.slice(5);
      } else if (path.indexOf('params.') === 0) {
        source = context.params;
        path = path.slice(7);
      } else if (path.indexOf('env.') === 0) {
        source = context.db && context.db.env;
        path = path.slice(4);
      } else if (path.indexOf('data.') === 0) {
        source = context.db && context.db.data;
        path = path.slice(5);
      } else if (path.indexOf('i18n.') === 0) {
        source = context.db && context.db.i18n;
        path = path.slice(5);
      } else if (path.indexOf('head.') === 0) {
        source = context.db && context.db.head;
        path = path.slice(5);
      }
      if (path === '') return source;
      var segments = splitPathSegments(path);
      var resolved = getBySegments(source, segments);
      return resolved == null ? '' : resolved;
    };
    if (exactMatch) {
      return resolver(exactMatch[1]);
    }
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, token) {
      var resolved = resolver(token);
      if (resolved == null) return '';
      if (typeof resolved === 'object') return JSON.stringify(resolved);
      return String(resolved);
    });
  }

  function applyPlaceholders(value, context) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return applyPlaceholders(item, context); });
    }
    if (isPlainObject(value)) {
      var out = {};
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        out[key] = applyPlaceholders(value[key], context);
      }
      return out;
    }
    if (typeof value === 'string') {
      return resolvePlaceholderString(value, context);
    }
    return value;
  }

  function ensureSerializableEnv(value, path, issues, seen) {
    if (!issues) issues = [];
    if (!seen) seen = [];
    if (value == null) return issues;
    if (seen.indexOf(value) !== -1) return issues;
    var type = typeof value;
    if (type === 'function' || type === 'symbol' || type === 'undefined') {
      issues.push(path + ' (' + type + ')');
      return issues;
    }
    if (type === 'object') {
      seen.push(value);
      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i += 1) {
          ensureSerializableEnv(value[i], path + '[' + i + ']', issues, seen);
        }
        return issues;
      }
      if (!isPlainObject(value)) {
        issues.push(path + ' (non-plain object)');
        return issues;
      }
      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        ensureSerializableEnv(value[key], path + '.' + key, issues, seen);
      }
      return issues;
    }
    if (type === 'number' && !isFinite(value)) {
      issues.push(path + ' (non-finite number)');
    }
    return issues;
  }

  function parseEnvScriptElement(scriptEl, templateEl) {
    var contextLabel = describeTemplate(templateEl);
    var raw = (scriptEl && (scriptEl.textContent || scriptEl.innerText || '')) || '';
    var text = raw.trim();
    if (!text) {
      return { data: {} };
    }
    var data = null;
    try {
      data = JSON.parse(text);
    } catch (error) {
      var message = 'HTMLx: data-m-env داخل ' + contextLabel + ' ليس JSON صالحًا: ' + error.message;
      console.warn(message);
      return { error: message };
    }
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      var typeMessage = 'HTMLx: data-m-env داخل ' + contextLabel + ' يجب أن يكون كائن JSON.';
      console.warn(typeMessage);
      return { error: typeMessage };
    }
    var issues = ensureSerializableEnv(data, 'env', []);
    if (issues.length) {
      var issuesMessage = 'HTMLx: data-m-env داخل ' + contextLabel + ' يحتوي على قيم غير مدعومة: ' + issues.join(', ');
      console.warn(issuesMessage);
      return { error: issuesMessage };
    }
    return { data: data };
  }

  function parseDataScriptElement(scriptEl, templateEl) {
    var contextLabel = describeTemplate(templateEl);
    var pathAttr = (scriptEl && scriptEl.getAttribute && scriptEl.getAttribute('data-m-path')) || '';
    var rawPath = String(pathAttr || '').trim();
    if (!rawPath) {
      var missingPathMessage = 'HTMLx: data-m-data داخل ' + contextLabel + ' يتطلب تحديد data-m-path.';
      console.warn(missingPathMessage);
      return { error: missingPathMessage };
    }
    var segments = rawPath.split('.').map(function (part) { return part.trim(); }).filter(function (part) { return part.length; });
    if (!segments.length) {
      var invalidPathMessage = 'HTMLx: data-m-data داخل ' + contextLabel + ' يحتوي مسارًا غير صالح: ' + rawPath;
      console.warn(invalidPathMessage);
      return { error: invalidPathMessage };
    }
    var raw = (scriptEl && (scriptEl.textContent || scriptEl.innerText || '')) || '';
    var text = raw.trim();
    var baseResult = { path: rawPath, segments: segments, data: {}, source: contextLabel };
    if (!text) {
      var emptyAjax = parseAjaxDescriptor(scriptEl, templateEl);
      if (emptyAjax && emptyAjax.descriptor) baseResult.ajax = emptyAjax.descriptor;
      if (emptyAjax && emptyAjax.warnings && emptyAjax.warnings.length) baseResult.warnings = emptyAjax.warnings.slice();
      return baseResult;
    }
    var data = null;
    try {
      data = JSON.parse(text);
    } catch (error) {
      var message = 'HTMLx: data-m-data داخل ' + contextLabel + ' ليس JSON صالحًا: ' + error.message;
      console.warn(message);
      return { error: message };
    }
    if (!isPlainObject(data)) {
      var typeMessage = 'HTMLx: data-m-data داخل ' + contextLabel + ' يجب أن يكون كائن JSON.';
      console.warn(typeMessage);
      return { error: typeMessage };
    }
    var issues = ensureSerializableEnv(data, rawPath, []);
    if (issues.length) {
      var issuesMessage = 'HTMLx: data-m-data داخل ' + contextLabel + ' يحتوي على قيم غير مدعومة: ' + issues.join(', ');
      console.warn(issuesMessage);
      return { error: issuesMessage };
    }
    var ajaxInfo = parseAjaxDescriptor(scriptEl, templateEl);
    var result = {
      path: rawPath,
      segments: segments,
      data: cloneSerializableValue(data),
      source: contextLabel
    };
    if (ajaxInfo && ajaxInfo.descriptor) {
      result.ajax = ajaxInfo.descriptor;
    }
    if (ajaxInfo && ajaxInfo.warnings && ajaxInfo.warnings.length) {
      result.warnings = ajaxInfo.warnings.slice();
    }
    return result;
  }

  function collectDataKeys(value, basePath, seen, duplicates) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var entry = value[i];
        if (isPlainObject(entry)) {
          collectDataKeys(entry, basePath + '[' + i + ']', seen, duplicates);
        }
      }
      return;
    }
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      var full = basePath ? basePath + '.' + key : key;
      if (seen[full]) {
        duplicates.push(full);
      } else {
        seen[full] = true;
      }
      collectDataKeys(value[key], full, seen, duplicates);
    }
  }

  function applyDataFeed(db, feed) {
    if (!feed || !feed.segments || !feed.segments.length) return;
    if (!feed.data || !Object.keys(feed.data).length) return;
    var segments = feed.segments;
    var contextLabel = feed.source || 'template';
    var cursor = db;
    for (var i = 0; i < segments.length - 1; i += 1) {
      var part = segments[i];
      if (!part) continue;
      var next = cursor[part];
      if (next == null) {
        next = {};
        cursor[part] = next;
      } else if (!isPlainObject(next)) {
        console.warn('HTMLx: data-m-data داخل ' + contextLabel + ' تعذّر دمجه لأن ' + segments.slice(0, i + 1).join('.') + ' ليس كائنًا قابلاً للدمج.');
        return;
      }
      cursor = next;
    }
    var finalKey = segments[segments.length - 1];
    if (!finalKey) return;
    var current = cursor[finalKey];
    cursor[finalKey] = mergeEnvTarget(current, feed.data);
  }

  function mergeEnvTarget(target, patch) {
    if (!patch || typeof patch !== 'object') return target;
    if (!isPlainObject(target)) target = {};
    for (var key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      var value = patch[key];
      if (isPlainObject(value)) {
        var base = isPlainObject(target[key]) ? target[key] : {};
        target[key] = mergeEnvTarget(base, value);
        continue;
      }
      if (Array.isArray(value)) {
        target[key] = cloneSerializableValue(value);
        continue;
      }
      target[key] = value;
    }
    return target;
  }

  function scopeCss(namespace, css, domSignature) {
    if (!css) return null;
    var scopeId = namespace + '-' + createHash(css + '|' + domSignature);
    var scoped = css
      .replace(/:host\b/g, '[data-m-scope="' + scopeId + '"]')
      .replace(/(^|\}|,)([^@][^{]*?)(?=\{)/g, function (_, prefix, selector) {
        var sel = selector.trim();
        if (!sel || /^@/.test(sel) || sel.startsWith('from') || sel.startsWith('to')) return prefix + selector;
        if (sel.indexOf('[data-m-scope="' + scopeId + '"]') !== -1) return prefix + selector;
        var scopedSelector = sel
          .split(',')
          .map(function (piece) {
            piece = piece.trim();
            if (!piece) return piece;
            if (piece.startsWith('@')) return piece;
            if (piece.startsWith(':root')) return piece;
            return '[data-m-scope="' + scopeId + '"] ' + piece;
          })
          .join(', ');
        return prefix + ' ' + scopedSelector;
      });
    return {
      id: scopeId,
      content: scoped,
      scopeAttr: scopeId
    };
  }

  function mergeScopeAttr(existing, token) {
    if (!token) return typeof existing === 'string' ? existing : existing || '';
    var raw = '';
    if (Array.isArray(existing)) {
      raw = existing.join(' ');
    } else if (existing != null) {
      raw = String(existing);
    }
    var parts = raw.trim() ? raw.trim().split(/\s+/) : [];
    if (parts.indexOf(token) === -1) parts.push(token);
    return parts.join(' ').trim();
  }

  function __mkTransDynamic(db) {
    var host = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : global || {};
    var M = (host && host.Mishkah) || (this && this.Mishkah) || {};
    var U = (M && M.utils) || {};
    var build = U.lang && typeof U.lang.buildLangTables === 'function'
      ? U.lang.buildLangTables
      : function (dict) {
        var t = {};
        if (!dict || typeof dict !== 'object') return t;
        var keys = Object.keys(dict);
        for (var i = 0; i < keys.length; i += 1) {
          var k = keys[i];
          var row = dict[k];
          if (!row || typeof row !== 'object') continue;
          var Ls = Object.keys(row);
          for (var j = 0; j < Ls.length; j += 1) {
            var L = Ls[j];
            (t[L] || (t[L] = {}))[k] = row[L];
          }
        }
        return t;
      };

    var raw = (db && db.i18n && (db.i18n.dict || db.i18n.strings || db.i18n)) || {};
    var dict = raw && raw.dict ? raw.dict : raw;
    var tables = build(dict);

    function interpolate(text, vars) {
      if (!vars || typeof vars !== 'object') return String(text);
      return String(text).replace(/\{(\w+)\}/g, function (m, k) {
        return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
      });
    }

    return function trans(key, vars) {
      var fb = (db && db.i18n && db.i18n.fallback) || 'en';
      var lang = (db && db.env && db.env.lang) || (db && db.i18n && db.i18n.lang) || fb;
      var v = tables[lang] && tables[lang][key];
      if (v == null || v === '') v = tables[fb] && tables[fb][key];
      if (v == null || v === '') v = key;
      return interpolate(v, vars);
    };
  }

  function resolveAcornModules(host) {
    var env = host || {};
    var acornRef = env.acorn || null;
    var walkRef = env.acornWalk || (acornRef && acornRef.walk) || null;
    var isLocal = typeof location !== 'undefined' && location.protocol === 'file:';

    if (!acornRef && !isLocal && typeof require === 'function') {
      try {
        acornRef = require('acorn');
      } catch (error) {
        acornRef = null;
      }
    }

    if (!walkRef && acornRef && acornRef.walk) {
      walkRef = acornRef.walk;
    }

    if (!walkRef && !isLocal && typeof require === 'function') {
      try {
        var walkModule = require('acorn-walk');
        if (walkModule && typeof walkModule.full === 'function') {
          walkRef = walkModule;
        }
      } catch (error) {
        walkRef = null;
      }
    }

    return { acorn: acornRef, walk: walkRef };
  }

  function createSecureExpressionEvaluator(acornRef, acornWalkRef) {
    var parser = acornRef;
    var walker = acornWalkRef;
    if (!parser || typeof parser.parse !== 'function' || !walker || typeof walker.full !== 'function') {
      var missingMessage = '[Mishkah HTMLx] Secure evaluator requires both acorn and acorn-walk to be loaded.';
      if (typeof console !== 'undefined' && console.error) {
        console.error(missingMessage);
      }
      return function secureEvaluatorUnavailable() {
        throw new Error(missingMessage);
      };
    }

    var FORBIDDEN_PROPS = new Set(['constructor', 'prototype', '__proto__', 'callee']);
    var FORBIDDEN_IDENTIFIERS = new Set(['window', 'document', 'globalThis', 'global', 'self', 'parent', 'top', 'frames']);
    var FORBIDDEN_CALLEES = new Set(['eval', 'Function', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'alert', 'confirm', 'prompt']);
    var ALLOWED_NODE_TYPES = new Set([
      'Program',
      'ExpressionStatement',
      'Literal',
      'Identifier',
      'BinaryExpression',
      'LogicalExpression',
      'UnaryExpression',
      'ConditionalExpression',
      'MemberExpression',
      'CallExpression',
      'ArrayExpression',
      'ObjectExpression',
      'Property',
      'SpreadElement',
      'TemplateLiteral',
      'TemplateElement',
      'ChainExpression'
    ]);
    var ALLOWED_UNARY_OPERATORS = new Set(['+', '-', '!', '~', 'typeof']);

    var SAFE_GLOBALS = (function () {
      var map = Object.create(null);
      map.Math = Math;
      map.Number = Number;
      map.String = String;
      map.Boolean = Boolean;
      map.Array = Array;
      map.Object = Object;
      map.JSON = JSON;
      map.Date = Date;
      map.RegExp = RegExp;
      map.parseInt = parseInt;
      map.parseFloat = parseFloat;
      map.encodeURIComponent = encodeURIComponent;
      map.decodeURIComponent = decodeURIComponent;
      map.isFinite = isFinite;
      map.isNaN = isNaN;
      if (typeof BigInt === 'function') map.BigInt = BigInt;
      if (typeof Intl !== 'undefined') map.Intl = Intl;
      if (typeof Symbol === 'function') map.Symbol = Symbol;
      map.NaN = NaN;
      map.Infinity = Infinity;
      map.undefined = undefined;
      return Object.freeze(map);
    })();

    function unwrapChain(node) {
      var current = node;
      while (current && current.type === 'ChainExpression') {
        current = current.expression;
      }
      return current;
    }

    function getPropertyName(node) {
      if (!node) return null;
      if (!node.computed && node.property && typeof node.property.name === 'string') {
        return node.property.name;
      }
      if (node.computed && node.property && node.property.type === 'Literal') {
        return String(node.property.value);
      }
      return null;
    }

    function ensureAllowedProperty(node) {
      var propertyName = getPropertyName(node);
      if (propertyName == null) {
        throw new Error('Security violation: Computed property access is not allowed.');
      }
      if (FORBIDDEN_PROPS.has(propertyName) || FORBIDDEN_IDENTIFIERS.has(propertyName) || FORBIDDEN_CALLEES.has(propertyName)) {
        throw new Error('Security violation: Access to forbidden property "' + propertyName + '".');
      }
    }

    function validateMemberExpression(node) {
      var target = unwrapChain(node);
      ensureAllowedProperty(target);
      var object = unwrapChain(target.object);
      if (object && object.type === 'Identifier' && FORBIDDEN_IDENTIFIERS.has(object.name)) {
        throw new Error('Security violation: Access to forbidden identifier "' + object.name + '".');
      }
      if (object && object.type === 'ThisExpression') {
        throw new Error('Security violation: Use of "this" is not allowed in expressions.');
      }
      if (object && object.type === 'MemberExpression') {
        validateMemberExpression(object);
      }
      if (object && object.type === 'CallExpression') {
        validateCallExpression(object);
      }
    }

    function validateCallExpression(node) {
      var callee = unwrapChain(node.callee);
      if (callee.type === 'Identifier') {
        if (FORBIDDEN_CALLEES.has(callee.name) || FORBIDDEN_IDENTIFIERS.has(callee.name)) {
          throw new Error('Security violation: Call to forbidden function "' + callee.name + '".');
        }
      } else if (callee.type === 'MemberExpression') {
        validateMemberExpression(callee);
      } else {
        throw new Error('Security violation: Unsupported callee type "' + callee.type + '".');
      }
    }

    function validateAst(ast) {
      walker.full(ast, function (node) {
        if (!ALLOWED_NODE_TYPES.has(node.type)) {
          throw new Error('Security violation: Disallowed node type "' + node.type + '".');
        }
        if (node.type === 'Program') {
          if (!node.body || node.body.length !== 1 || node.body[0].type !== 'ExpressionStatement') {
            throw new Error('Security violation: Only single expressions are allowed.');
          }
        }
        if (node.type === 'Identifier' && FORBIDDEN_IDENTIFIERS.has(node.name)) {
          throw new Error('Security violation: Access to forbidden identifier "' + node.name + '".');
        }
        if (node.type === 'UnaryExpression' && !ALLOWED_UNARY_OPERATORS.has(node.operator)) {
          throw new Error('Security violation: Unary operator "' + node.operator + '" is not allowed.');
        }
        if (node.type === 'MemberExpression') {
          validateMemberExpression(node);
        }
        if (node.type === 'CallExpression') {
          validateCallExpression(node);
        }
        if (node.type === 'Property') {
          if (node.kind !== 'init' || node.method) {
            throw new Error('Security violation: Object methods are not allowed in expressions.');
          }
          if (node.computed) {
            if (!node.key || node.key.type !== 'Literal') {
              throw new Error('Security violation: Computed property keys must be literals.');
            }
            var keyName = String(node.key.value);
            if (FORBIDDEN_PROPS.has(keyName)) {
              throw new Error('Security violation: Access to forbidden property "' + keyName + '".');
            }
          } else if (node.key && node.key.type === 'Identifier' && FORBIDDEN_PROPS.has(node.key.name)) {
            throw new Error('Security violation: Access to forbidden property "' + node.key.name + '".');
          }
        }
        if (node.type === 'ThisExpression') {
          throw new Error('Security violation: Use of "this" is not allowed in expressions.');
        }
      });
    }

    function createScopeProxy(bag) {
      var stateRef = bag && bag.state && typeof bag.state === 'object' ? bag.state : Object.create(null);
      var localsRef = bag && bag.locals && typeof bag.locals === 'object' ? bag.locals : Object.create(null);
      var base = Object.create(null);
      base.state = stateRef;
      base.ctx = bag ? bag.ctx : undefined;
      base.db = bag ? bag.db : undefined;
      base.M = bag ? bag.M : undefined;
      base.UI = bag ? bag.UI : undefined;
      base.D = bag ? bag.D : undefined;
      base.locals = localsRef;
      base.trans = bag ? bag.trans : undefined;
      base.t = bag ? bag.t : undefined;
      base.TL = bag ? bag.TL : undefined;
      Object.freeze(base);

      return new Proxy(base, {
        has: function (target, prop) {
          if (prop === Symbol.unscopables) return false;
          return true;
        },
        get: function (target, prop) {
          if (prop === Symbol.unscopables) return undefined;
          if (typeof prop === 'string') {
            if (FORBIDDEN_PROPS.has(prop) || FORBIDDEN_IDENTIFIERS.has(prop)) {
              return undefined;
            }
            if (Object.prototype.hasOwnProperty.call(localsRef, prop)) {
              return localsRef[prop];
            }
            if (Object.prototype.hasOwnProperty.call(stateRef, prop)) {
              return stateRef[prop];
            }
            if (Object.prototype.hasOwnProperty.call(target, prop)) {
              return target[prop];
            }
            if (Object.prototype.hasOwnProperty.call(SAFE_GLOBALS, prop)) {
              return SAFE_GLOBALS[prop];
            }
          }
          return undefined;
        },
        set: function () {
          throw new Error('Security violation: Assignment is not allowed in HTMLx expressions.');
        },
        defineProperty: function () {
          throw new Error('Security violation: Cannot define properties inside HTMLx expressions.');
        },
        deleteProperty: function () {
          throw new Error('Security violation: Cannot delete properties inside HTMLx expressions.');
        },
        ownKeys: function () {
          var keys = new Set();
          Reflect.ownKeys(localsRef).forEach(function (key) { keys.add(key); });
          Reflect.ownKeys(stateRef).forEach(function (key) { keys.add(key); });
          Reflect.ownKeys(base).forEach(function (key) { keys.add(key); });
          return Array.from(keys);
        },
        getOwnPropertyDescriptor: function (target, prop) {
          if (Object.prototype.hasOwnProperty.call(localsRef, prop)) {
            return { configurable: true, enumerable: true, writable: true, value: localsRef[prop] };
          }
          if (Object.prototype.hasOwnProperty.call(stateRef, prop)) {
            return { configurable: true, enumerable: true, writable: true, value: stateRef[prop] };
          }
          if (Object.prototype.hasOwnProperty.call(target, prop)) {
            return Object.getOwnPropertyDescriptor(target, prop);
          }
          if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(SAFE_GLOBALS, prop)) {
            var value = SAFE_GLOBALS[prop];
            return { configurable: true, enumerable: false, writable: false, value: value };
          }
          return undefined;
        }
      });
    }

    var cache = Object.create(null);

    return function evaluate(code, scope) {
      var source = String(code || '').trim();
      if (!source) return undefined;

      var entry = cache[source];
      if (!entry) {
        var ast;
        try {
          ast = parser.parse(source, { ecmaVersion: 2020, sourceType: 'script' });
        } catch (parseError) {
          console.error('[Mishkah HTMLx] Failed to parse expression:', source, parseError);
          cache[source] = { error: true };
          return undefined;
        }
        try {
          validateAst(ast);
        } catch (validationError) {
          console.error('[Mishkah HTMLx] Blocked unsafe expression:', source, validationError);
          cache[source] = { error: true };
          return undefined;
        }
        var compiled = new Function('scope', 'with (scope) { return (' + source + '); }');
        entry = cache[source] = { fn: compiled };
      }

      if (entry.error) {
        return undefined;
      }

      var dbSource = scope && (scope.db || scope.state) || {};
      var translator = scope && typeof scope.trans === 'function' ? scope.trans : __mkTransDynamic(dbSource);
      var evaluateScope = createScopeProxy({
        state: scope && scope.state,
        ctx: scope && scope.ctx,
        db: scope && scope.db,
        M: scope && scope.M,
        UI: scope && scope.UI,
        D: scope && scope.D,
        locals: scope && scope.locals,
        trans: translator,
        t: scope && typeof scope.t === 'function' ? scope.t : translator,
        TL: scope && typeof scope.TL === 'function' ? scope.TL : translator
      });

      try {
        return entry.fn(evaluateScope);
      } catch (runtimeError) {
        console.error('[Mishkah HTMLx] Expression execution error:', source, runtimeError);
        return undefined;
      }
    };
  }

  var acornRuntime = resolveAcornModules(global);
  var evaluateExpression = createSecureExpressionEvaluator(acornRuntime.acorn, acornRuntime.walk);

  var runtimeScopeSequence = 0;
  var runtimeScopeRegistry = Object.create(null);

  function cloneRuntimeLocals(locals) {
    if (!locals || typeof locals !== 'object') return null;
    var snapshot = {};
    var hasAny = false;
    for (var key in locals) {
      if (!Object.prototype.hasOwnProperty.call(locals, key)) continue;
      snapshot[key] = locals[key];
      hasAny = true;
    }
    return hasAny ? snapshot : null;
  }

  function registerRuntimeLocals(locals) {
    var snapshot = cloneRuntimeLocals(locals);
    if (!snapshot) return null;
    runtimeScopeSequence += 1;
    var id = 'mrt-' + runtimeScopeSequence;
    runtimeScopeRegistry[id] = snapshot;
    return id;
  }

  function resolveRuntimeLocals(target) {
    var node = target;
    while (node) {
      if (node.nodeType && node.nodeType !== 1) {
        node = node.parentElement || null;
        continue;
      }
      if (node && typeof node.getAttribute === 'function') {
        var token = node.getAttribute('data-m-runtime');
        if (token) {
          var parts = token.split(/[\s,]+/);
          for (var i = 0; i < parts.length; i += 1) {
            var key = parts[i];
            if (key && runtimeScopeRegistry[key]) {
              return runtimeScopeRegistry[key];
            }
          }
        }
      }
      node = node && node.parentElement ? node.parentElement : null;
    }
    return null;
  }

  function mergeRuntimeLocals(base, event, ctx) {
    var merged = Object.assign({}, base || {});
    merged.event = event;
    merged.ctx = ctx;
    return merged;
  }

  function parseMustache(value) {
    var text = String(value || '');
    var parts = [];
    var index = 0;
    while (index < text.length) {
      var open = text.indexOf('{', index);
      if (open === -1) {
        parts.push({ type: 'text', value: text.slice(index) });
        break;
      }
      if (open > index) {
        parts.push({ type: 'text', value: text.slice(index, open) });
      }
      var close = text.indexOf('}', open + 1);
      if (close === -1) {
        parts.push({ type: 'text', value: text.slice(open) });
        break;
      }
      var expr = text.slice(open + 1, close).trim();
      parts.push({ type: 'expr', code: expr });
      index = close + 1;
    }
    return parts;
  }

  function splitEventArgs(source) {
    var text = String(source || '');
    if (!text.trim()) return [];
    var args = [];
    var current = '';
    var depth = 0;
    var inSingle = false;
    var inDouble = false;
    var inTemplate = false;
    var templateDepth = 0;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (inSingle) {
        current += ch;
        if (ch === '\\') {
          i += 1;
          if (i < text.length) current += text.charAt(i);
          continue;
        }
        if (ch === '\'') {
          inSingle = false;
        }
        continue;
      }
      if (inDouble) {
        current += ch;
        if (ch === '\\') {
          i += 1;
          if (i < text.length) current += text.charAt(i);
          continue;
        }
        if (ch === '"') {
          inDouble = false;
        }
        continue;
      }
      if (inTemplate) {
        current += ch;
        if (ch === '\\') {
          i += 1;
          if (i < text.length) current += text.charAt(i);
          continue;
        }
        if (ch === '{') {
          if (templateDepth > 0 || (i > 0 && text.charAt(i - 1) === '$')) {
            templateDepth += 1;
          }
          continue;
        }
        if (ch === '}') {
          if (templateDepth > 0) {
            templateDepth -= 1;
            continue;
          }
        }
        if (ch === '`' && templateDepth === 0) {
          inTemplate = false;
        }
        continue;
      }
      if (ch === '\'') {
        inSingle = true;
        current += ch;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        current += ch;
        continue;
      }
      if (ch === '`') {
        inTemplate = true;
        templateDepth = 0;
        current += ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
        current += ch;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        if (depth > 0) depth -= 1;
        current += ch;
        continue;
      }
      if (ch === ',' && depth === 0) {
        if (current.trim()) args.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  function parseEventExpression(raw) {
    if (!raw) return null;
    var trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^return\b/i.test(trimmed)) {
      trimmed = trimmed.replace(/^return\b/i, '').trim();
    }
    if (trimmed.endsWith(';')) {
      trimmed = trimmed.slice(0, -1).trim();
    }
    if (!trimmed) return null;
    var openIndex = trimmed.indexOf('(');
    var closeIndex = trimmed.lastIndexOf(')');
    if (openIndex > 0 && closeIndex > openIndex) {
      var handlerName = trimmed.slice(0, openIndex).trim();
      if (/^[a-zA-Z_$][\w$]*$/.test(handlerName)) {
        var inner = trimmed.slice(openIndex + 1, closeIndex);
        return {
          handler: handlerName,
          args: splitEventArgs(inner),
          inline: false,
          source: trimmed
        };
      }
    }
    return {
      handler: null,
      args: [trimmed],
      inline: true,
      source: trimmed
    };
  }

  function parseXFor(value) {
    if (!value) return null;
    var parts = value.split(' in ');
    if (parts.length !== 2) return null;
    var left = parts[0].split(',');
    var item = left[0].trim();
    var index = left[1] ? left[1].trim() : null;
    var expr = parts[1].trim();
    if (!item || !expr) return null;
    return { item: item, index: index, expr: expr };
  }

  function toDatasetName(name) {
    return 'arg' + name.replace(/[^a-zA-Z0-9]+/g, '_');
  }

  function analyzeNode(node, path, namespace, warnings) {
    if (node.nodeType === 3) {
      var content = node.textContent || '';
      var tokens = parseMustache(content);
      if (tokens.length === 1 && tokens[0].type === 'text') {
        return { type: 'text', value: tokens[0].value, path: path };
      }
      return { type: 'dynamic-text', tokens: tokens, path: path };
    }

    if (node.nodeType !== 1) return null;

    var tag = node.tagName.toLowerCase();
    var originalTag = node.tagName; // احتفظ بالـ tag الأصلي للتحليل
    var nextPath = path.length ? path + '.' + tag : tag;

    if (tag === 'template') return null;
    if (tag === 'style' || tag === 'script') return null;

    var descriptor;

    // محاولة حل اسم المكون بشكل مرن
    var resolvedComponent = resolveComponentName(originalTag);

    if (resolvedComponent) {
      // وُجد مكون في Mishkah.UI
      descriptor = { type: 'component', component: resolvedComponent, attrs: {}, events: [], children: [], path: nextPath };
    } else if (ATOM_FAMILIES[tag]) {
      // عنصر HTML قياسي معروف
      descriptor = { type: 'atom', family: ATOM_FAMILIES[tag][0], atom: ATOM_FAMILIES[tag][1], attrs: {}, events: [], children: [], path: nextPath };
    } else {
      // عنصر غير معروف - تعامل معه كعنصر HTML مخصص
      var isCustomElement = tag.indexOf('-') !== -1;
      if (!isCustomElement) {
        warnings.push('E_ATOM_MISMATCH(' + nextPath + '): عنصر ' + tag + ' غير مصنف في DSL. سيتم تصييره كعنصر خام.');
      } else if (!global.customElements || !global.customElements.get(tag)) {
        warnings.push('W_CUSTOM_ELEMENT(' + nextPath + '): العنصر ' + tag + ' غير مسجل. سيتم التعامل معه كعنصر HTML مخصص.');
      }
      descriptor = { type: 'element', tag: tag, attrs: {}, events: [], children: [], path: nextPath };
    }

    var attrs = node.attributes || [];
    var xIf = null;
    var xFor = null;
    var elseType = null;

    for (var i = 0; i < attrs.length; i += 1) {
      var attr = attrs[i];
      var name = attr.name;
      var value = attr.value;
      if (name === 'x-if') {
        xIf = value;
        continue;
      }
      if (name === 'x-else-if') {
        elseType = 'elseif';
        xIf = value;
        continue;
      }
      if (name === 'x-else') {
        elseType = 'else';
        continue;
      }
      if (name === 'x-for') {
        xFor = parseXFor(value);
        if (!xFor) warnings.push('E_BAD_XFOR(' + nextPath + '): صيغة x-for غير صحيحة.');
        continue;
      }
      if (name === 'x-once') {
        descriptor.xOnce = true;
        continue;
      }
      // دعم @ syntax للأحداث (مثل Vue.js)
      // @click="handler" → x-on:click="handler"
      if (name.charAt(0) === '@') {
        descriptor.events.push({ name: name.slice(1), value: value, owner: descriptor });
        continue;
      }
      if (name.indexOf('x-on:') === 0) {
        descriptor.events.push({ name: name.slice(5), value: value, owner: descriptor });
        continue;
      }
      if (EVENT_ATTRIBUTES.indexOf(name) !== -1) {
        descriptor.events.push({ name: name.slice(2), value: value, owner: descriptor });
        continue;
      }
      if (name.indexOf('data-m-on-') === 0) {
        descriptor.events.push({ name: name.slice(10), value: value, owner: descriptor });
        continue;
      }
      if (name === 'key') {
        var keyExpr = (value || '').trim();
        descriptor.keyExpr = keyExpr || null;
        descriptor.key = keyExpr ? [{ type: 'expr', code: keyExpr }] : null;
        continue;
      }

      // دعم : syntax للربط (مثل Vue.js)
      // :value="data.name" → value="{{data.name}}"
      // :class="className" → class="{{className}}"
      var actualName = name;
      var isDynamicBind = false;
      if (name.charAt(0) === ':') {
        actualName = name.slice(1);
        isDynamicBind = true;
      }

      var tokenized = parseMustache(value);

      // إذا كان : binding، حول القيمة إلى expression
      if (isDynamicBind) {
        // قيمة ديناميكية - حولها إلى mustache token
        descriptor.attrs[actualName] = [{ type: 'expr', code: value }];
      } else if (tokenized.length === 1 && tokenized[0].type === 'text') {
        descriptor.attrs[actualName] = value;
      } else {
        descriptor.attrs[actualName] = tokenized;
      }
    }

    descriptor.xIf = xIf;
    descriptor.xFor = xFor;
    descriptor.elseType = elseType;

    var childNode = node.firstChild;
    var childIndex = 0;
    while (childNode) {
      var analyzed = analyzeNode(childNode, nextPath + '.' + childIndex, namespace, warnings);
      if (analyzed) {
        analyzed.parent = descriptor;
        descriptor.children.push(analyzed);
      }
      childIndex += 1;
      childNode = childNode.nextSibling;
    }

    if (descriptor.xFor) {
      if (!descriptor.attrs['data-m-key']) {
        if (descriptor.keyExpr) {
          descriptor.attrs['data-m-key'] = [{ type: 'expr', code: descriptor.keyExpr }];
        } else if (descriptor.xFor.index) {
          descriptor.attrs['data-m-key'] = [{ type: 'expr', code: descriptor.xFor.index }];
        } else {
          var itemName = descriptor.xFor.item || 'item';
          var fallbackExpr = '(' + itemName + ' && (' + itemName + '.id || ' + itemName + '.key || ' + itemName + ')) || __index';
          descriptor.attrs['data-m-key'] = [{ type: 'expr', code: fallbackExpr }];
        }
      }
    } else if (!descriptor.attrs['data-m-key']) {
      descriptor.attrs['data-m-key'] = createNodeKey(namespace, descriptor.path, descriptor.keyExpr);
    }

    return descriptor;
  }

  function groupConditionals(children) {
    var grouped = [];
    for (var i = 0; i < children.length; i += 1) {
      var node = children[i];
      if (!node || (node.type !== 'atom' && node.type !== 'component' && node.type !== 'element')) {
        grouped.push(node);
        continue;
      }
      if (!node.elseType && !node.xIf) {
        grouped.push(node);
        continue;
      }
      if (node.xIf && !node.elseType) {
        var chain = [{ test: node.xIf, node: node }];
        var j = i + 1;
        while (j < children.length) {
          var sibling = children[j];
          if (!sibling || (sibling.type !== 'atom' && sibling.type !== 'component' && sibling.type !== 'element')) break;
          if (!sibling.elseType) break;
          chain.push({ test: sibling.elseType === 'else' ? null : sibling.xIf, node: sibling });
          i = j;
          j += 1;
          if (sibling.elseType === 'else') break;
        }
        grouped.push({ type: 'if-chain', chain: chain, path: node.path });
      } else if (node.elseType) {
        continue;
      } else {
        grouped.push(node);
      }
    }
    return grouped;
  }

  function compileTextNode(node) {
    if (node.type === 'text') {
      return function () {
        return node.value;
      };
    }
    var parts = node.tokens.map(function (token) {
      if (token.type === 'text') {
        var textValue = token.value;
        return function () {
          return textValue;
        };
      }
      var exprCode = token.code;
      return function (scope) {
        return evaluateExpression(exprCode, scope);
      };
    });
    return function (scope) {
      var buffer = '';
      for (var i = 0; i < parts.length; i += 1) {
        var value = parts[i](scope);
        if (value == null) continue;
        buffer += value;
      }
      return buffer;
    };
  }

  function compileAttrValue(value) {
    if (typeof value === 'string') {
      var literal = value;
      return function () {
        return literal;
      };
    }
    if (Array.isArray(value)) {
      // Optimization: Single expression segment -> return raw value (preserves booleans)
      if (value.length === 1 && value[0].type === 'expr') {
        var singleCode = value[0].code;
        return function (scope) {
          return evaluateExpression(singleCode, scope);
        };
      }
      var segments = value.map(function (token) {
        if (token.type === 'text') {
          var text = token.value;
          return function () {
            return text;
          };
        }
        var code = token.code;
        return function (scope) {
          return evaluateExpression(code, scope);
        };
      });
      return function (scope) {
        var joined = '';
        for (var i = 0; i < segments.length; i += 1) {
          var part = segments[i](scope);
          if (part == null) continue;
          joined += part;
        }
        return joined;
      };
    }
    return function () {
      return value;
    };
  }

  function compileAttrs(attrs) {
    var entries = [];
    for (var name in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, name)) continue;
      entries.push({ name: name, fn: compileAttrValue(attrs[name]) });
    }
    return function (scope) {
      var bag = {};
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i];
        var value = entry.fn(scope);
        if (value == null || value === false) continue;
        bag[entry.name] = value;
      }
      return bag;
    };
  }

  function compileChildren(children, ctx) {
    var compiled = children.map(function (child) {
      return compileNode(child, ctx);
    });
    return function (scope) {
      var rendered = [];
      for (var i = 0; i < compiled.length; i += 1) {
        var out = compiled[i](scope);
        if (Array.isArray(out)) {
          for (var j = 0; j < out.length; j += 1) {
            if (out[j] != null && out[j] !== false) rendered.push(out[j]);
          }
        } else if (out != null && out !== false) {
          rendered.push(out);
        }
      }
      return rendered;
    };
  }

  function createLocalScope(scope, additions) {
    var locals = Object.assign({}, scope.locals || {}, additions || {});
    return {
      state: scope.state,
      db: scope.db,
      ctx: scope.ctx,
      M: scope.M,
      UI: scope.UI,
      D: scope.D,
      locals: locals
    };
  }

  function normalizeScopeTokens(value) {
    if (!value) return [];
    if (typeof value === 'string') {
      return value.split(/\s+/).filter(function (token) { return !!token; });
    }
    if (Array.isArray(value)) {
      var text = '';
      for (var i = 0; i < value.length; i += 1) {
        var part = value[i];
        if (!part) continue;
        if (part.type === 'text') {
          text += part.value;
        } else {
          return [];
        }
      }
      return text.split(/\s+/).filter(function (token) { return !!token; });
    }
    return [String(value)];
  }

  function collectScopeTokensFromAttrs(attrs) {
    if (!attrs) return [];
    var tokens = [];
    var scopeTokens = normalizeScopeTokens(attrs['data-m-scope']);
    for (var i = 0; i < scopeTokens.length; i += 1) {
      var token = scopeTokens[i];
      if (token && token !== 'soft' && tokens.indexOf(token) === -1) tokens.push(token);
    }
    var idTokens = normalizeScopeTokens(attrs.id);
    for (var j = 0; j < idTokens.length; j += 1) {
      var idToken = idTokens[j];
      if (idToken && tokens.indexOf(idToken) === -1) tokens.push(idToken);
    }
    return tokens;
  }

  function collectScopedLocals(tokens, scopedLocalsMap) {
    if (!tokens || !tokens.length || !scopedLocalsMap) return null;
    var merged = {};
    var count = 0;
    for (var i = 0; i < tokens.length; i += 1) {
      var key = tokens[i];
      var source = scopedLocalsMap[key];
      if (!source) continue;
      for (var name in source) {
        if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
        merged[name] = source[name];
        count += 1;
      }
    }
    return count ? merged : null;
  }

  function compileNode(node, ctx) {
    if (!node) return function () { return null; };
    if (node.type === 'text' || node.type === 'dynamic-text') {
      var textFn = compileTextNode(node);
      return function (scope) {
        return textFn(scope);
      };
    }
    if (node.type === 'if-chain') {
      var compiledChain = node.chain.map(function (entry) {
        return { test: entry.test, render: compileNode(entry.node, ctx) };
      });
      return function (scope) {
        for (var i = 0; i < compiledChain.length; i += 1) {
          var branch = compiledChain[i];
          if (branch.test == null || evaluateExpression(branch.test, scope)) {
            return branch.render(scope);
          }
        }
        return null;
      };
    }
    if (node.xFor) {
      var bodyFn = compileNode(Object.assign({}, node, { xFor: null }), ctx);
      var loop = node.xFor;
      return function (scope) {
        var list = evaluateExpression(loop.expr, scope);
        if (!list) return null;
        var normalized = Array.isArray(list) ? list : Object.values(list);
        var fragments = [];
        for (var i = 0; i < normalized.length; i += 1) {
          var value = normalized[i];
          var local = {};
          local[loop.item] = value;
          if (loop.index) local[loop.index] = i;
          local.__index = i;
          var scoped = createLocalScope(scope, local);
          fragments.push(bodyFn(scoped));
        }
        return fragments;
      };
    }

    var renderChildren = compileChildren(groupConditionals(node.children), ctx);
    var resolveAttrs = compileAttrs(node.attrs);
    var resolveKey = node.key ? compileAttrValue(node.key) : null;
    var scopeTokens = collectScopeTokensFromAttrs(node.attrs);
    var localAugment = collectScopedLocals(scopeTokens, ctx && ctx.scopedLocals);
    var hasLocalAugment = localAugment && Object.keys(localAugment).length > 0;

    // x-once: cache support
    var cachedVNode = null;
    var cachedKids = null;
    var cachedAttrs = null;
    var isOnce = node.xOnce === true;

    return function (scope) {
      // x-once: return cached VNode if exists
      if (isOnce && cachedVNode !== null) {
        return cachedVNode;
      }

      var activeScope = hasLocalAugment ? createLocalScope(scope, localAugment) : scope;

      // x-once: use cached attrs or compute once
      var attrs;
      if (isOnce && cachedAttrs !== null) {
        attrs = cachedAttrs;
      } else {
        attrs = resolveAttrs(activeScope) || {};

        // x-once: add data-m-frozen to protect DOM
        if (isOnce) {
          attrs['data-m-frozen'] = 'true';
        }

        if (resolveKey) {
          var keyValue = resolveKey(activeScope);
          if (keyValue != null && keyValue !== '') {
            attrs.key = keyValue;
          }
        }

        if (isOnce) {
          cachedAttrs = attrs;
        }
      }

      // x-once: use cached kids or render once
      var kids;
      if (isOnce && cachedKids !== null) {
        kids = cachedKids;
      } else {
        kids = renderChildren(activeScope);
        if (isOnce) {
          cachedKids = kids;
        }
      }
      if (node.events && node.events.length) {
        var runtimeId = registerRuntimeLocals(activeScope.locals);
        if (runtimeId) {
          if (attrs['data-m-runtime']) {
            attrs['data-m-runtime'] = String(attrs['data-m-runtime']) + ' ' + runtimeId;
          } else {
            attrs['data-m-runtime'] = runtimeId;
          }
        }
      }
      var result;
      if (node.type === 'component') {
        console.log('[HTMLx COMPILE] Component:', node.component);
        console.log('[HTMLx COMPILE] activeScope.UI?', !!activeScope.UI, 'Keys:', activeScope.UI ? Object.keys(activeScope.UI).slice(0, 10) : []);

        var componentFactory = activeScope.UI[node.component];
        console.log('[HTMLx COMPILE] Factory type:', typeof componentFactory);

        if (typeof componentFactory !== 'function') {
          console.warn('[HTMLx COMPILE] ✗ Component not found:', node.component);
          console.warn('[HTMLx COMPILE] Available:', Object.keys(activeScope.UI || {}));
          return null;
        }

        console.log('[HTMLx COMPILE] ✓ Rendering component:', node.component);
        var props = { attrs: attrs };
        if (kids.length === 1) {
          props.content = kids[0];
        } else if (kids.length > 1) {
          props.content = kids;
        }
        var result_component = componentFactory(props);
        console.log('[HTMLx COMPILE] Component rendered:', !!result_component);

        // ✨ الحل: لو في children ولم تستخدم، هويستهم كـ siblings
        if (kids && kids.length > 0) {
          result = [result_component].concat(kids);
        } else {
          result = result_component;
        }
      } else if (node.type === 'element') {
        var hFactory = (activeScope.D && typeof activeScope.D.h === 'function') ? activeScope.D.h
          : (Mishkah && Mishkah.DSL && typeof Mishkah.DSL.h === 'function' ? Mishkah.DSL.h : null);
        if (!hFactory) {
          console.warn('E_ELEMENT_UNSUPPORTED: لا يمكن إنشاء العنصر', node.tag, 'لأن DSL.h غير متوفر.');
          return null;
        }
        if (node.tag === 'button') {
          console.log('DEBUG: compileNode element button kids:', kids.length, kids);
        }
        result = hFactory(node.tag, 'Custom', { attrs: attrs }, kids);
        if (node.tag === 'button') {
          console.log('DEBUG: compileNode element button result children:', result.children.length);
        }
      } else {
        var family = node.family;
        var atom = node.atom;
        var atoms = activeScope.D[family] || {};
        var factory = atoms[atom];
        if (typeof factory !== 'function') {
          console.warn('E_ATOM_MISMATCH: atom', family + '.' + atom, 'غير متوفر في DSL.');
          return null;
        }
        result = factory({ attrs: attrs }, kids);
      }

      // x-once: cache the result for future renders
      if (isOnce) {
        cachedVNode = result;
      }

      return result;
    };
  }

  function parseFunctions(source) {
    var map = Object.create(null);
    if (!source) return map;

    var length = source.length;
    var index = 0;

    function isIdentifierPart(ch) {
      return /[\w$]/.test(ch);
    }

    function skipWhitespace(pos) {
      while (pos < length && /\s/.test(source.charAt(pos))) pos += 1;
      return pos;
    }

    function skipLineComment(pos) {
      while (pos < length && source.charAt(pos) !== '\n') pos += 1;
      return pos;
    }

    function skipBlockComment(pos) {
      var next = pos;
      while (next < length - 1) {
        if (source.charAt(next) === '*' && source.charAt(next + 1) === '/') {
          return next + 2;
        }
        next += 1;
      }
      return length;
    }

    function skipString(pos) {
      var quote = source.charAt(pos);
      pos += 1;
      while (pos < length) {
        var ch = source.charAt(pos);
        if (ch === '\\') {
          pos += 2;
          continue;
        }
        if (ch === quote) {
          return pos + 1;
        }
        pos += 1;
      }
      return length;
    }

    function skipTemplateExpression(pos) {
      var depth = 1;
      while (pos < length && depth > 0) {
        var ch = source.charAt(pos);
        if (ch === '\\') {
          pos += 2;
          continue;
        }
        if (ch === '\'' || ch === '"') {
          pos = skipString(pos);
          continue;
        }
        if (ch === '`') {
          pos = skipTemplate(pos);
          continue;
        }
        if (ch === '/' && source.charAt(pos + 1) === '/') {
          pos = skipLineComment(pos + 2);
          continue;
        }
        if (ch === '/' && source.charAt(pos + 1) === '*') {
          pos = skipBlockComment(pos + 2);
          continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        pos += 1;
      }
      return pos;
    }

    function skipTemplate(pos) {
      pos += 1;
      while (pos < length) {
        var ch = source.charAt(pos);
        if (ch === '\\') {
          pos += 2;
          continue;
        }
        if (ch === '`') {
          return pos + 1;
        }
        if (ch === '$' && source.charAt(pos + 1) === '{') {
          pos = skipTemplateExpression(pos + 2);
          continue;
        }
        pos += 1;
      }
      return length;
    }

    function skipStringsAndComments(pos) {
      var ch = source.charAt(pos);
      if (ch === '\'' || ch === '"') return skipString(pos);
      if (ch === '`') return skipTemplate(pos);
      if (ch === '/' && source.charAt(pos + 1) === '/') return skipLineComment(pos + 2);
      if (ch === '/' && source.charAt(pos + 1) === '*') return skipBlockComment(pos + 2);
      return pos;
    }

    while (index < length) {
      var ch = source.charAt(index);

      if (ch === '\'' || ch === '"' || ch === '`' || (ch === '/' && (source.charAt(index + 1) === '/' || source.charAt(index + 1) === '*'))
      ) {
        index = skipStringsAndComments(index);
        continue;
      }

      if (ch === 'f' && source.slice(index, index + 8) === 'function') {
        var before = source.charAt(index - 1);
        var after = source.charAt(index + 8);
        if ((index === 0 || !isIdentifierPart(before)) && (!after || !isIdentifierPart(after))) {
          var asyncFlag = false;
          var back = index - 1;
          while (back >= 0 && /\s/.test(source.charAt(back))) back -= 1;
          if (back >= 4 && source.slice(back - 4, back + 1) === 'async') {
            var preAsync = source.charAt(back - 5);
            if (!isIdentifierPart(preAsync)) asyncFlag = true;
          }
          var cursor = skipWhitespace(index + 8);
          var nameStart = cursor;
          while (cursor < length && isIdentifierPart(source.charAt(cursor))) cursor += 1;
          if (cursor === nameStart) {
            index += 8;
            continue;
          }
          var name = source.slice(nameStart, cursor);
          cursor = skipWhitespace(cursor);
          if (source.charAt(cursor) !== '(') {
            index = cursor;
            continue;
          }

          var parenStart = cursor;
          var parenDepth = 0;
          while (cursor < length) {
            var pch = source.charAt(cursor);
            if (pch === '\'' || pch === '"' || pch === '`' || (pch === '/' && (source.charAt(cursor + 1) === '/' || source.charAt(cursor + 1) === '*'))
            ) {
              cursor = skipStringsAndComments(cursor);
              continue;
            }
            if (pch === '(') parenDepth += 1;
            if (pch === ')') {
              parenDepth -= 1;
              if (parenDepth === 0) {
                cursor += 1;
                break;
              }
            }
            cursor += 1;
          }

          var args = source.slice(parenStart + 1, cursor - 1);
          cursor = skipWhitespace(cursor);
          if (source.charAt(cursor) !== '{') {
            index = cursor;
            continue;
          }

          var bodyStart = cursor + 1;
          cursor = bodyStart;
          var braceDepth = 1;
          while (cursor < length && braceDepth > 0) {
            var bch = source.charAt(cursor);
            if (bch === '\'' || bch === '"' || bch === '`' || (bch === '/' && (source.charAt(cursor + 1) === '/' || source.charAt(cursor + 1) === '*'))
            ) {
              cursor = skipStringsAndComments(cursor);
              continue;
            }
            if (bch === '{') {
              braceDepth += 1;
            } else if (bch === '}') {
              braceDepth -= 1;
              if (braceDepth === 0) {
                break;
              }
            }
            cursor += 1;
          }

          var bodyEnd = cursor;
          var body = source.slice(bodyStart, bodyEnd);
          map[name] = { args: args, body: body, isAsync: asyncFlag };

          index = cursor + 1;
          continue;
        }
      }

      index += 1;
    }

    return map;
  }

  function splitTopLevelList(src) {
    var text = String(src || '');
    var out = [];
    var buffer = '';
    var levelParen = 0;
    var levelBrace = 0;
    var levelBracket = 0;
    var inString = false;
    var stringChar = '';
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      var prev = i > 0 ? text.charAt(i - 1) : '';
      if (inString) {
        buffer += ch;
        if (ch === stringChar && prev !== '\\') {
          inString = false;
          stringChar = '';
        }
        continue;
      }
      if (ch === '\'' || ch === '"' || ch === '`') {
        inString = true;
        stringChar = ch;
        buffer += ch;
        continue;
      }
      if (ch === '(') {
        levelParen += 1;
        buffer += ch;
        continue;
      }
      if (ch === ')') {
        levelParen -= 1;
        buffer += ch;
        continue;
      }
      if (ch === '{') {
        levelBrace += 1;
        buffer += ch;
        continue;
      }
      if (ch === '}') {
        levelBrace -= 1;
        buffer += ch;
        continue;
      }
      if (ch === '[') {
        levelBracket += 1;
        buffer += ch;
        continue;
      }
      if (ch === ']') {
        levelBracket -= 1;
        buffer += ch;
        continue;
      }
      if (ch === ',' && levelParen === 0 && levelBrace === 0 && levelBracket === 0) {
        var term = buffer.trim();
        if (term) out.push(term);
        buffer = '';
        continue;
      }
      buffer += ch;
    }
    var last = buffer.trim();
    if (last) out.push(last);
    return out;
  }

  function isRegexLiteralStart(prev) {
    if (!prev) return true;
    return /[([{:;,=!?&|+\-*~%^<>]/.test(prev);
  }

  function captureArrayLiteral(source, startIndex) {
    var text = String(source || '');
    var length = text.length;
    var level = 1;
    var inString = false;
    var stringChar = '';
    var inTemplate = false;
    var inRegex = false;
    var inBlockComment = false;
    var inLineComment = false;
    var escape = false;
    var prevNonSpace = '';
    for (var i = startIndex; i < length; i += 1) {
      var ch = text.charAt(i);
      var next = i + 1 < length ? text.charAt(i + 1) : '';

      if (inLineComment) {
        if (ch === '\n' || ch === '\r') {
          inLineComment = false;
          prevNonSpace = '';
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inRegex) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '/') {
          inRegex = false;
        }
        continue;
      }

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if (inTemplate) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '`') {
          inTemplate = false;
        }
        continue;
      }

      if (ch === '\'' || ch === '"') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '`') {
        inTemplate = true;
        continue;
      }

      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }

      if (ch === '/' && isRegexLiteralStart(prevNonSpace)) {
        inRegex = true;
        continue;
      }

      if (ch === '[') {
        level += 1;
        prevNonSpace = '[';
        continue;
      }

      if (ch === ']') {
        level -= 1;
        if (level === 0) {
          return { content: text.slice(startIndex, i), end: i };
        }
        prevNonSpace = ']';
        continue;
      }

      if (!/\s/.test(ch)) {
        prevNonSpace = ch;
      } else if (ch === '\n' || ch === '\r') {
        prevNonSpace = '';
      }
    }
    return null;
  }

  function parseFunctionArrays(source) {
    var locals = Object.create(null);
    if (!source) return locals;
    var re = /(var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g;
    var match;
    while ((match = re.exec(source))) {
      var name = match[2];
      var capture = captureArrayLiteral(source, re.lastIndex);
      if (!capture) {
        continue;
      }
      re.lastIndex = capture.end + 1;
      var inner = capture.content || '';
      var terms = splitTopLevelList(inner);
      var arr = [];
      for (var i = 0; i < terms.length; i += 1) {
        var term = terms[i].trim();
        if (!term) continue;
        if (/^function\b/.test(term)) {
          try {
            var fn = new Function('return (' + term + ')')();
            if (typeof fn === 'function') arr.push(fn);
          } catch (error) {
            console.warn('HTMLx: تجاهل دالة غير صالحة داخل', name, '—', error);
          }
        } else {
          console.warn('HTMLx: عنصر غير مدعوم داخل', name, '→', term.slice(0, 40));
        }
      }
      locals[name] = arr;
    }
    return locals;
  }

  function parseScriptArtifacts(source) {
    return {
      functions: parseFunctions(source),
      locals: parseFunctionArrays(source)
    };
  }

  function isEventAttributeName(name) {
    if (!name) return false;
    var lower = String(name).toLowerCase();
    if (lower.indexOf('on') === 0) return true;
    if (lower === 'x-on') return true;
    if (lower.indexOf('x-on:') === 0) return true;
    if (lower.indexOf('data-m-on') === 0) return true;
    return false;
  }

  function pickHandlerNamesFromAttr(value) {
    var out = [];
    var text = String(value || '');
    var match = text.match(/(^|[\s;])([A-Za-z_$][\w$]*)\s*\(/);
    if (match && match[2]) out.push(match[2]);
    return out;
  }

  function nearestSiblingScripts(element, scriptInfos) {
    if (!element || !scriptInfos || !scriptInfos.length) return [];

    function findInfo(node) {
      for (var i = 0; i < scriptInfos.length; i += 1) {
        if (scriptInfos[i].element === node) return scriptInfos[i];
      }
      return null;
    }

    function collect(direction) {
      var current = element;
      var list = [];
      while (current) {
        current = direction > 0 ? current.nextSibling : current.previousSibling;
        if (!current) break;
        if (current.nodeType === 3) {
          if (/\S/.test(current.nodeValue || '')) break;
          continue;
        }
        if (current.nodeType !== 1) break;
        if (current.tagName && current.tagName.toLowerCase() === 'script') {
          var info = findInfo(current);
          if (info && !info.owner) list.push(info);
          continue;
        }
        break;
      }
      return list;
    }

    var after = collect(1);
    if (after && after.length) return after;
    var before = collect(-1);
    return before || [];
  }

  function attachDynamicScopes(fragment, scriptInfos, bundle) {
    if (!fragment || typeof fragment.querySelectorAll !== 'function') return;
    var elements = fragment.querySelectorAll('*');
    if (!elements || !elements.length) return;
    var autoCounter = 0;

    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i];
      if (!el || el.tagName && el.tagName.toLowerCase() === 'script') continue;
      var explicitScope = el.getAttribute('data-m-scope');
      var explicitId = el.getAttribute('id');
      if (explicitScope || explicitId) continue;

      var attrs = el.attributes || [];
      var needed = [];
      for (var j = 0; j < attrs.length; j += 1) {
        var attr = attrs[j];
        if (!attr || !isEventAttributeName(attr.name)) continue;
        var names = pickHandlerNamesFromAttr(attr.value);
        for (var k = 0; k < names.length; k += 1) {
          if (needed.indexOf(names[k]) === -1) needed.push(names[k]);
        }
      }
      if (!needed.length) continue;

      var siblingScripts = nearestSiblingScripts(el, scriptInfos);
      if (!siblingScripts || !siblingScripts.length) continue;

      var combinedFns = {};
      var combinedLocals = {};
      var matched = false;
      for (var s = 0; s < siblingScripts.length; s += 1) {
        var info = siblingScripts[s];
        if (!info || info.owner) continue;
        var fns = info.fns || {};
        for (var name in fns) {
          if (!Object.prototype.hasOwnProperty.call(fns, name)) continue;
          combinedFns[name] = fns[name];
        }
        var locals = info.locals || {};
        for (var key in locals) {
          if (!Object.prototype.hasOwnProperty.call(locals, key)) continue;
          combinedLocals[key] = locals[key];
        }
      }
      for (var n = 0; n < needed.length; n += 1) {
        if (combinedFns[needed[n]]) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      var scopeId = 'autoS' + (++autoCounter);
      el.setAttribute('data-m-scope', scopeId);
      if (!bundle.scoped[scopeId]) bundle.scoped[scopeId] = { fns: {}, locals: {} };
      Object.assign(bundle.scoped[scopeId].fns, combinedFns);
      Object.assign(bundle.scoped[scopeId].locals, combinedLocals);
    }
  }

  function collectTemplateScriptsWithDynamic(templateEl, fragment) {
    var bundle = { global: { fns: {}, locals: {} }, scoped: {}, env: [], data: [], ajaxMaps: [], warnings: [] };
    if (!fragment) return bundle;

    var scriptInfos = [];
    if (typeof fragment.querySelectorAll === 'function') {
      var scripts = fragment.querySelectorAll('script');
      for (var i = 0; i < scripts.length; i += 1) {
        var scriptEl = scripts[i];
        if (!scriptEl) continue;

        // Handle data-m-path (generic data feed)
        // This replaces explicit data-m-env and data-m-data checks
        if (scriptEl.hasAttribute('data-m-path')) {
          var dataResult = parseDataScriptElement(scriptEl, templateEl);
          if (dataResult && dataResult.data != null) {
            bundle.data.push(dataResult);
            if (dataResult.warnings && dataResult.warnings.length) {
              bundle.warnings = bundle.warnings.concat(dataResult.warnings);
            }
          } else if (dataResult && dataResult.error) {
            bundle.warnings.push(dataResult.error);
          }
          if (scriptEl.parentNode) {
            scriptEl.parentNode.removeChild(scriptEl);
          }
          continue;
        }

        if (scriptEl.hasAttribute('data-m-env')) {
          var envResult = parseEnvScriptElement(scriptEl, templateEl);
          if (envResult && envResult.data && Object.keys(envResult.data).length) {
            bundle.env.push(cloneSerializableValue(envResult.data));
          } else if (envResult && envResult.error) {
            bundle.warnings.push(envResult.error);
          }
          if (scriptEl.parentNode) {
            scriptEl.parentNode.removeChild(scriptEl);
          }
          continue;
        }
        if (scriptEl.hasAttribute('data-m-ajax-map')) {
          var ajaxMap = parseAjaxMapScript(scriptEl, templateEl);
          if (ajaxMap) {
            bundle.ajaxMaps.push({
              entries: ajaxMap.entries || {},
              source: ajaxMap.source || describeTemplate(templateEl),
              owner: ajaxMap.owner || null
            });
            if (ajaxMap.warnings && ajaxMap.warnings.length) {
              bundle.warnings = bundle.warnings.concat(ajaxMap.warnings);
            }
          }
          if (scriptEl.parentNode) {
            scriptEl.parentNode.removeChild(scriptEl);
          }
          continue;
        }
        if (scriptEl.hasAttribute('data-m-data')) {
          var dataResult = parseDataScriptElement(scriptEl, templateEl);
          if (dataResult && dataResult.data != null) {
            bundle.data.push(dataResult);
            if (dataResult.warnings && dataResult.warnings.length) {
              bundle.warnings = bundle.warnings.concat(dataResult.warnings);
            }
          } else if (dataResult && dataResult.error) {
            bundle.warnings.push(dataResult.error);
          }
          if (scriptEl.parentNode) {
            scriptEl.parentNode.removeChild(scriptEl);
          }
          continue;
        }
        var code = scriptEl.textContent || scriptEl.innerText || '';
        var artifacts = parseScriptArtifacts(code);
        var owner = (scriptEl.getAttribute('data-for') || '').trim();
        var info = {
          element: scriptEl,
          owner: owner || null,
          fns: artifacts.functions || {},
          locals: artifacts.locals || {}
        };
        scriptInfos.push(info);
        if (info.owner) {
          if (!bundle.scoped[info.owner]) bundle.scoped[info.owner] = { fns: {}, locals: {} };
          Object.assign(bundle.scoped[info.owner].fns, info.fns);
          Object.assign(bundle.scoped[info.owner].locals, info.locals);
        } else {
          Object.assign(bundle.global.fns, info.fns);
          Object.assign(bundle.global.locals, info.locals);
        }
      }
    }

    attachDynamicScopes(fragment, scriptInfos, bundle);

    if (templateEl && templateEl.ownerDocument) {
      try {
        var doc = templateEl.ownerDocument;
        var wrap = doc.createElement('template');
        wrap.innerHTML = '';
        wrap.content.appendChild(fragment.cloneNode(true));
        templateEl.innerHTML = wrap.innerHTML;
      } catch (err) {
        console.warn('HTMLx: failed to refresh template innerHTML after dynamic scopes:', err);
      }
    }

    return bundle;
  }

  function instantiateFunctionMap(defs) {
    var names = Object.keys(defs || {});
    if (!names.length) return {};
    var body = [];
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      var def = defs[name] || {};
      var args = def.args || '';
      var fnBody = def.body || '';
      var prefix = def.isAsync ? 'async function ' : 'function ';
      body.push(prefix + name + '(' + args + ') {\n' + fnBody + '\n}');
    }
    body.push(
      'return {' +
      names
        .map(function (name) {
          return '\'' + name.replace(/'/g, "\\'") + '\': ' + name;
        })
        .join(', ') +
      '};'
    );
    try {
      return new Function(body.join('\n'))();
    } catch (error) {
      console.warn('HTMLx: فشل بناء دوال السكربت:', error);
      return {};
    }
  }

  function mergeFunctionLocals(base, fns) {
    var merged = Object.assign({}, base || {});
    if (!fns) return merged;
    for (var key in fns) {
      if (!Object.prototype.hasOwnProperty.call(fns, key)) continue;
      merged[key] = fns[key];
    }
    return merged;
  }

  function ContextAdapter(context) {
    return {
      getState: function () {
        return typeof context.getState === 'function' ? context.getState() : context.state || {};
      },
      setState: function (updater) {
        if (typeof context.setState === 'function') {
          context.setState(updater);
          return;
        }
        if (typeof updater === 'function') {
          context.state = updater(context.state);
        } else {
          context.state = updater;
        }
      },
      get: function (path) {
        var state = this.getState();
        if (!path) return state;
        var parts = path.split('.');
        var current = state;
        for (var i = 0; i < parts.length; i += 1) {
          if (current == null) return undefined;
          current = current[parts[i]];
        }
        return current;
      },
      set: function (path, value) {
        if (!path) return;
        var parts = path.split('.');
        this.setState(function (prev) {
          var root = Array.isArray(prev) ? prev.slice() : Object.assign({}, prev || {});
          var ptr = root;
          for (var i = 0; i < parts.length - 1; i += 1) {
            var key = parts[i];
            var next = ptr[key];
            if (Array.isArray(next)) {
              ptr[key] = next.slice();
            } else {
              ptr[key] = Object.assign({}, next || {});
            }
            ptr = ptr[key];
          }
          ptr[parts[parts.length - 1]] = value;
          return root;
        });
      },
      rebuild: function () {
        if (typeof context.rebuild === 'function') context.rebuild();
        if (typeof context.flush === 'function') context.flush();
      },
      scopeNode: context && context.scopeNode ? context.scopeNode : null,
      scopeId: context && context.scopeId ? context.scopeId : null,
      scopeQuery: function (selector) {
        if (!selector) return null;
        if (context && typeof context.scopeQuery === 'function') {
          return context.scopeQuery(selector);
        }
        var base = context && (context.scopeNode || context.root);
        if (base && typeof base.querySelector === 'function') {
          return base.querySelector(selector);
        }
        if (global && global.document && typeof global.document.querySelector === 'function') {
          return global.document.querySelector(selector);
        }
        return null;
      },
      scopeQueryAll: function (selector) {
        if (!selector) return [];
        if (context && typeof context.scopeQueryAll === 'function') {
          return context.scopeQueryAll(selector);
        }
        var base = context && (context.scopeNode || context.root);
        if (base && typeof base.querySelectorAll === 'function') {
          return base.querySelectorAll(selector);
        }
        if (global && global.document && typeof global.document.querySelectorAll === 'function') {
          return global.document.querySelectorAll(selector);
        }
        return [];
      },
      stop: function () {
        if (context && typeof context.stop === 'function') {
          context.stop();
        }
      },
      trans: function (key, vars) {
        try {
          var db = this.getState();
          return __mkTransDynamic(db)(key, vars);
        } catch (_e) {
          return String(key);
        }
      }
    };
  }

  function createWebSocketRuntime() {
    if (typeof Map !== 'function' || typeof WeakMap !== 'function') {
      return {
        attach: function () { },
        detach: function () { },
        handleEmitEvent: function () { }
      };
    }

    var connections = new Map();
    var elementConnections = new WeakMap();
    var subscriptionRegistry = new WeakMap();
    var observer = null;
    var appInstance = null;
    var rootNode = null;

    function logWarn(message) {
      console.warn('HTMLx WS:', message);
    }

    function parseOptions(text, connId) {
      if (text == null) return {};
      var raw = String(text).trim();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('HTMLx WS: المعرّف ' + connId + ' يحتوي m-ws-options غير صالح: ' + error.message);
        return {};
      }
    }

    function resolveRoot(target) {
      if (!global || !global.document) return null;
      if (target && typeof target === 'object' && target.nodeType === 1) return target;
      if (typeof target === 'string') {
        try {
          return global.document.querySelector(target);
        } catch (_err) {
          return null;
        }
      }
      return global.document.querySelector('#app') || global.document.body || null;
    }

    function forEachElement(node, cb) {
      if (!node || node.nodeType !== 1) return;
      var stack = [node];
      while (stack.length) {
        var current = stack.pop();
        try {
          cb(current);
        } catch (_err) { }
        var child = current.lastElementChild;
        while (child) {
          stack.push(child);
          child = child.previousElementSibling;
        }
      }
    }

    function forEachElementReverse(node, cb) {
      if (!node || node.nodeType !== 1) return;
      var stack = [node];
      var list = [];
      while (stack.length) {
        var current = stack.pop();
        list.push(current);
        var child = current.lastElementChild;
        while (child) {
          stack.push(child);
          child = child.previousElementSibling;
        }
      }
      for (var i = list.length - 1; i >= 0; i -= 1) {
        try {
          cb(list[i]);
        } catch (_err) { }
      }
    }

    function cleanupRegistryEntry(connId, element, wrapper) {
      var entry = connections.get(connId);
      if (!entry || !entry.subscriptions) return;
      var arr = entry.subscriptions.get(element);
      if (!arr) return;
      var idx = arr.indexOf(wrapper);
      if (idx !== -1) arr.splice(idx, 1);
      if (!arr.length) entry.subscriptions.delete(element);
    }

    function buildContext(element, connectionElement) {
      var ctxObj = {
        getState: function () {
          if (appInstance && typeof appInstance.getState === 'function') return appInstance.getState();
          return {};
        },
        setState: function (updater) {
          if (appInstance && typeof appInstance.setState === 'function') appInstance.setState(updater);
        },
        flush: function (opts) {
          if (appInstance && typeof appInstance.flush === 'function') appInstance.flush(opts);
        },
        rebuild: function (opts) {
          if (appInstance && typeof appInstance.rebuild === 'function') appInstance.rebuild(opts);
        },
        scopeNode: element,
        scopeId: element ? element.getAttribute('data-m-scope') : null,
        scopeQuery: function (selector) {
          if (!selector) return null;
          if (element && typeof element.querySelector === 'function') return element.querySelector(selector);
          if (connectionElement && typeof connectionElement.querySelector === 'function') return connectionElement.querySelector(selector);
          if (rootNode && typeof rootNode.querySelector === 'function') return rootNode.querySelector(selector);
          if (global && global.document && typeof global.document.querySelector === 'function') return global.document.querySelector(selector);
          return null;
        },
        scopeQueryAll: function (selector) {
          if (!selector) return [];
          if (element && typeof element.querySelectorAll === 'function') return element.querySelectorAll(selector);
          if (connectionElement && typeof connectionElement.querySelectorAll === 'function') return connectionElement.querySelectorAll(selector);
          if (rootNode && typeof rootNode.querySelectorAll === 'function') return rootNode.querySelectorAll(selector);
          if (global && global.document && typeof global.document.querySelectorAll === 'function') return global.document.querySelectorAll(selector);
          return [];
        },
        stop: function () { },
        root: rootNode || (global && global.document ? global.document.body : null)
      };
      return ContextAdapter(ctxObj);
    }

    function registerSubscription(element, topicAttr, connInfo) {
      var topic = topicAttr.name.slice(8);
      if (!topic) return;
      var socket = connInfo.socket;
      if (!socket) {
        logWarn('تعذر إنشاء اشتراك لـ m-ws-on:' + topic + ' بدون اتصال نشط.');
        return;
      }
      var registry = subscriptionRegistry.get(element);
      if (!registry) {
        registry = {};
        subscriptionRegistry.set(element, registry);
      }
      if (registry[topic]) return;

      var entry = connections.get(connInfo.id);
      if (!entry) return;

      var handler = function (payload, raw) {
        var ctx = buildContext(element, connInfo.element);
        var eventObject = {
          type: 'ws-message',
          detail: { payload: payload, topic: topic, connectionId: connInfo.id, raw: raw },
          target: element,
          currentTarget: element,
          preventDefault: function () { },
          stopPropagation: function () { },
          stopImmediatePropagation: function () { }
        };
        var runtimeLocals = resolveRuntimeLocals(element);
        var localsBag = mergeRuntimeLocals(runtimeLocals, eventObject, ctx);
        try {
          evaluateExpression(topicAttr.value, {
            state: ctx.getState(),
            ctx: ctx,
            db: ctx.getState(),
            event: eventObject,
            locals: localsBag,
            payload: payload,
            M: Mishkah,
            UI: Mishkah.UI,
            D: Mishkah.DSL
          });
        } catch (error) {
          console.warn('HTMLx WS: فشل تشغيل m-ws-on:' + topic + ' —', error);
        }
        if (appInstance && typeof appInstance.flush === 'function') {
          try { appInstance.flush(); } catch (_f) { }
        } else if (appInstance && typeof appInstance.rebuild === 'function') {
          try { appInstance.rebuild(); } catch (_r) { }
        }
      };

      var unsubscribeRaw = null;
      try {
        if (typeof socket.subscribe === 'function') {
          unsubscribeRaw = socket.subscribe(topic, handler);
        } else if (typeof socket.on === 'function') {
          socket.on(topic, handler);
          if (typeof socket.off === 'function') {
            unsubscribeRaw = function () { try { socket.off(topic, handler); } catch (_err) { } };
          }
        }
      } catch (error) {
        console.warn('HTMLx WS: فشل الاشتراك في ' + topic + ' —', error);
        return;
      }
      if (typeof unsubscribeRaw !== 'function') return;

      var wrappers = entry.subscriptions.get(element);
      if (!wrappers) {
        wrappers = [];
        entry.subscriptions.set(element, wrappers);
      }

      var wrapper = function () {
        try { unsubscribeRaw(); } catch (_err) { }
        if (registry[topic] === wrapper) {
          delete registry[topic];
        }
        cleanupRegistryEntry(connInfo.id, element, wrapper);
      };

      registry[topic] = wrapper;
      wrappers.push(wrapper);
    }

    function processSubscriptions(element) {
      if (!element || element.nodeType !== 1 || !element.attributes) return;
      var connInfo = null;
      for (var i = 0; i < element.attributes.length; i += 1) {
        var attr = element.attributes[i];
        if (!attr || typeof attr.name !== 'string') continue;
        if (attr.name.indexOf('m-ws-on:') === 0) {
          if (!connInfo) connInfo = findConnectionInfo(element);
          if (connInfo) registerSubscription(element, attr, connInfo);
        }
      }
    }

    function setupConnection(element) {
      if (!element || element.nodeType !== 1) return null;
      var existingId = elementConnections.get(element);
      if (existingId) {
        return connections.get(existingId) || null;
      }
      var connId = (element.getAttribute('m-ws-connect') || '').trim();
      if (!connId) {
        logWarn('عنصر يحمل m-ws-connect بدون معرف صالح.');
        return null;
      }
      var url = (element.getAttribute('m-ws-url') || '').trim();
      if (!url) {
        logWarn('الاتصال ' + connId + ' يحتاج إلى m-ws-url.');
        return null;
      }
      var options = parseOptions(element.getAttribute('m-ws-options'), connId);
      if (!U || typeof U.WebSocketX !== 'function') {
        logWarn('U.WebSocketX غير متوفر لإنشاء الاتصال ' + connId + '.');
        return null;
      }
      if (connections.has(connId)) {
        var previous = connections.get(connId);
        if (previous && previous.element !== element) {
          logWarn('استبدال اتصال WebSocket موجود بالمعرف ' + connId + '.');
          if (previous.element) {
            teardownConnection(previous.element);
          } else {
            if (previous.socket && typeof previous.socket.close === 'function') {
              try { previous.socket.close(); } catch (_err) { }
            }
            connections.delete(connId);
          }
        } else if (previous) {
          elementConnections.set(element, connId);
          return previous;
        }
      }
      var socketInstance;
      try {
        socketInstance = new U.WebSocketX(url, options || {});
      } catch (error) {
        console.warn('HTMLx WS: فشل إنشاء الاتصال ' + connId + ':', error);
        return null;
      }
      if (socketInstance && typeof socketInstance.connect === 'function') {
        try { socketInstance.connect({ waitOpen: false }); } catch (_connectErr) { }
      }
      var entry = { id: connId, element: element, socket: socketInstance, options: options || {}, subscriptions: new Map() };
      connections.set(connId, entry);
      elementConnections.set(element, connId);
      return entry;
    }

    function findConnectionInfo(element) {
      if (!element) return null;
      var current = element;
      while (current) {
        if (current.nodeType === 1 && current.hasAttribute && current.hasAttribute('m-ws-connect')) {
          var connId = elementConnections.get(current);
          if (!connId) {
            connId = (current.getAttribute('m-ws-connect') || '').trim();
          }
          if (!connId) return null;
          var entry = connections.get(connId);
          if (!entry) {
            entry = setupConnection(current);
          }
          if (!entry) return null;
          return { id: connId, element: current, socket: entry.socket };
        }
        current = current.parentNode || null;
      }
      return null;
    }

    function cleanupElement(element) {
      if (!element || element.nodeType !== 1) return;
      var registry = subscriptionRegistry.get(element);
      if (registry) {
        for (var key in registry) {
          if (!Object.prototype.hasOwnProperty.call(registry, key)) continue;
          try { registry[key](); } catch (_err) { }
        }
        subscriptionRegistry.delete(element);
      }
    }

    function teardownConnection(element) {
      if (!element || element.nodeType !== 1) return;
      var connId = elementConnections.get(element) || (element.getAttribute ? (element.getAttribute('m-ws-connect') || '').trim() : '');
      if (!connId) return;
      var entry = connections.get(connId);
      if (entry) {
        if (entry.subscriptions && entry.subscriptions.size) {
          entry.subscriptions.forEach(function (wrappers) {
            if (Array.isArray(wrappers)) {
              for (var i = wrappers.length - 1; i >= 0; i -= 1) {
                try { wrappers[i](); } catch (_err) { }
              }
            }
          });
          entry.subscriptions.clear();
        }
        if (entry.socket && typeof entry.socket.close === 'function') {
          try { entry.socket.close(); } catch (_err) { }
        }
        connections.delete(connId);
      }
      elementConnections.delete(element);
    }

    function handleRemovedElement(element) {
      if (!element || element.nodeType !== 1) return;
      cleanupElement(element);
      if (element.hasAttribute && element.hasAttribute('m-ws-connect')) {
        teardownConnection(element);
      }
    }

    function handleMutations(records) {
      if (!records) return;
      for (var i = 0; i < records.length; i += 1) {
        var record = records[i];
        if (record && record.removedNodes) {
          for (var r = 0; r < record.removedNodes.length; r += 1) {
            forEachElementReverse(record.removedNodes[r], handleRemovedElement);
          }
        }
        if (record && record.addedNodes) {
          for (var a = 0; a < record.addedNodes.length; a += 1) {
            forEachElement(record.addedNodes[a], processElement);
          }
        }
      }
    }

    function processElement(element) {
      if (!element || element.nodeType !== 1) return;
      if (element.hasAttribute && element.hasAttribute('m-ws-connect')) {
        setupConnection(element);
      }
      processSubscriptions(element);
    }

    function detach() {
      if (observer && typeof observer.disconnect === 'function') {
        observer.disconnect();
      }
      observer = null;
      connections.forEach(function (entry) {
        if (!entry) return;
        if (entry.subscriptions && entry.subscriptions.size) {
          entry.subscriptions.forEach(function (wrappers) {
            if (Array.isArray(wrappers)) {
              for (var i = wrappers.length - 1; i >= 0; i -= 1) {
                try { wrappers[i](); } catch (_err) { }
              }
            }
          });
          entry.subscriptions.clear();
        }
        if (entry.socket && typeof entry.socket.close === 'function') {
          try { entry.socket.close(); } catch (_err) { }
        }
      });
      connections.clear();
      elementConnections = new WeakMap();
      subscriptionRegistry = new WeakMap();
      rootNode = null;
      appInstance = null;
    }

    function attach(app, mountTarget) {
      if (!global || !global.document) {
        appInstance = app || null;
        rootNode = null;
        return;
      }
      detach();
      appInstance = app || null;
      rootNode = resolveRoot(mountTarget);
      if (!rootNode) return;
      if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(handleMutations);
        observer.observe(rootNode, { childList: true, subtree: true });
      }
      forEachElement(rootNode, processElement);
    }

    function emitFromElement(element, topic, expr, domEvent, ctxAdapter) {
      if (!expr) return;
      var code = String(expr).trim();
      if (!code) return;
      var connInfo = findConnectionInfo(element);
      if (!connInfo || !connInfo.socket) {
        logWarn('لا يمكن إرسال m-ws-emit:' + topic + ' بدون اتصال.');
        return;
      }
      var runtimeLocals = resolveRuntimeLocals(element);
      var localsBag = mergeRuntimeLocals(runtimeLocals, domEvent, ctxAdapter);
      var payload;
      try {
        payload = evaluateExpression(code, {
          state: ctxAdapter.getState(),
          ctx: ctxAdapter,
          db: ctxAdapter.getState(),
          event: domEvent,
          locals: localsBag,
          M: Mishkah,
          UI: Mishkah.UI,
          D: Mishkah.DSL
        });
      } catch (error) {
        console.warn('HTMLx WS: فشل تقييم m-ws-emit:' + topic + ' —', error);
        return;
      }
      if (payload == null) return;
      try {
        if (typeof connInfo.socket.emit === 'function') {
          connInfo.socket.emit(topic, payload);
        } else if (typeof connInfo.socket.send === 'function') {
          connInfo.socket.send({ type: 'event', topic: topic, payload: payload });
        } else {
          logWarn('الاتصال ' + connInfo.id + ' لا يدعم الإرسال.');
        }
      } catch (error) {
        console.warn('HTMLx WS: فشل إرسال m-ws-emit:' + topic + ' —', error);
      }
    }

    function handleEmitEvent(event, ctxAdapter) {
      if (!event || !ctxAdapter) return;
      var target = event.currentTarget || event.target;
      if (!target || target.nodeType !== 1 || !target.attributes) return;
      for (var i = 0; i < target.attributes.length; i += 1) {
        var attr = target.attributes[i];
        if (!attr || typeof attr.name !== 'string') continue;
        if (attr.name.indexOf('m-ws-emit:') === 0) {
          var topic = attr.name.slice(10);
          if (!topic) continue;
          emitFromElement(target, topic, attr.value, event, ctxAdapter);
        }
      }
    }

    return {
      attach: attach,
      detach: detach,
      handleEmitEvent: handleEmitEvent
    };
  }

  var wsRuntime = createWebSocketRuntime();

  function createOrderKey(namespace, expr) {
    var eventExpr = parseEventExpression(expr);
    if (!eventExpr || !eventExpr.handler || eventExpr.inline) {
      var basis = (namespace ? namespace + '|' : '') + String(expr || '');
      return 'auto:' + createHash(basis);
    }
    if (!namespace) return 'auto:' + eventExpr.handler;
    return namespace + ':' + eventExpr.handler;
  }

  function collectScopeChain(owner) {
    var chain = [];
    var current = owner;
    while (current) {
      var tokens = collectScopeTokensFromAttrs(current.attrs || {});
      for (var i = 0; i < tokens.length; i += 1) {
        var token = tokens[i];
        if (token && chain.indexOf(token) === -1) chain.push(token);
      }
      current = current.parent || null;
    }
    return chain;
  }

  function resolveHandlerArtifacts(handlerName, owner, scriptBundle, runtimeMaps) {
    if (!handlerName) return { def: null, runtime: null };
    var scoped = scriptBundle && scriptBundle.scoped ? scriptBundle.scoped : {};
    var runtimeScoped = runtimeMaps && runtimeMaps.scoped ? runtimeMaps.scoped : {};
    var scopeChain = collectScopeChain(owner);
    for (var i = 0; i < scopeChain.length; i += 1) {
      var scopeId = scopeChain[i];
      var entry = scoped[scopeId];
      if (!entry || !entry.fns || !entry.fns[handlerName]) continue;
      var runtimeFn = runtimeScoped[scopeId] ? runtimeScoped[scopeId][handlerName] : null;
      return { def: entry.fns[handlerName], runtime: runtimeFn };
    }
    var globalDefs = scriptBundle && scriptBundle.global ? scriptBundle.global.fns : null;
    var runtimeGlobal = runtimeMaps && runtimeMaps.global ? runtimeMaps.global : null;
    if (globalDefs && globalDefs[handlerName]) {
      return { def: globalDefs[handlerName], runtime: runtimeGlobal ? runtimeGlobal[handlerName] : null };
    }
    return { def: null, runtime: null };
  }

  function synthesizeOrders(namespace, events, scriptBundle, runtimeMaps, scopeKey) {
    var orders = {};
    events.forEach(function (event) {
      var baseKey = createOrderKey(namespace, event.value);
      var parsed = parseEventExpression(event.value);
      var resolved = parsed && parsed.handler ? resolveHandlerArtifacts(parsed.handler, event.owner, scriptBundle, runtimeMaps) : { def: null, runtime: null };
      var handlerDef = resolved.def;
      var runtimeFn = resolved.runtime;
      var signature = [
        namespace || '',
        event && event.name ? event.name : '',
        event && event.owner && event.owner.path ? event.owner.path : '',
        event && event.value ? event.value : ''
      ].join('|');
      var variantHash = createHash(signature);
      var key = baseKey + '#' + variantHash;
      var gkey = key;
      if (!orders[key]) {
        orders[key] = { on: [event.name], gkeys: [gkey], handler: null };
        if (scopeKey) orders[key].keys = [scopeKey];
        orders[key].alias = baseKey;
      } else {
        if (orders[key].on.indexOf(event.name) === -1) orders[key].on.push(event.name);
        if (orders[key].gkeys.indexOf(gkey) === -1) orders[key].gkeys.push(gkey);
        if (scopeKey) {
          var existingKeys = orders[key].keys || [];
          if (existingKeys.indexOf(scopeKey) === -1) existingKeys.push(scopeKey);
          orders[key].keys = existingKeys;
        }
      }
      orders[key].handler = createOrderHandler(parsed, handlerDef, runtimeFn);
      if (event.owner && !event.owner.attrs['data-m-gkey']) {
        event.owner.attrs['data-m-gkey'] = gkey;
      }
    });
    return orders;
  }

  var AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

  function createOrderHandler(parsed, handlerDef, runtimeFn) {
    var compiledFn = null;
    if (runtimeFn && typeof runtimeFn === 'function') {
      compiledFn = runtimeFn;
    } else if (handlerDef && handlerDef.body != null) {
      var Constructor = handlerDef.isAsync ? AsyncFunction : Function;
      compiledFn = new Constructor(handlerDef.args || '', handlerDef.body);
    }
    return function (event, context) {
      if (event && typeof event.preventDefault === 'function' && event.type === 'submit') {
        event.preventDefault();
      }
      var ctx = ContextAdapter(context);
      if (wsRuntime && typeof wsRuntime.handleEmitEvent === 'function') {
        wsRuntime.handleEmitEvent(event, ctx);
      }
      var runtimeLocals = resolveRuntimeLocals(event && event.target);
      var localsBag = mergeRuntimeLocals(runtimeLocals, event, ctx);
      if (parsed && parsed.inline && parsed.args && parsed.args.length) {
        evaluateExpression(parsed.args[0], {
          state: ctx.getState(),
          ctx: ctx,
          db: ctx.getState(),
          M: Mishkah,
          UI: Mishkah.UI,
          D: Mishkah.DSL,
          locals: localsBag
        });
      } else if (parsed && parsed.handler && compiledFn) {
        var args = [];
        var argList = parsed.args || [];
        for (var i = 0; i < argList.length; i += 1) {
          var arg = argList[i];
          if (arg === 'event') {
            args.push(event);
          } else if (arg === 'ctx') {
            args.push(ctx);
          } else if (arg === 'locals') {
            args.push(localsBag);
          } else {
            args.push(
              evaluateExpression(arg, {
                state: ctx.getState(),
                ctx: ctx,
                db: ctx.getState(),
                M: Mishkah,
                UI: Mishkah.UI,
                D: Mishkah.DSL,
                locals: localsBag
              })
            );
          }
        }
        compiledFn.apply(null, args);
      }
      if (typeof context.flush === 'function') {
        context.flush();
      } else if (typeof context.rebuild === 'function') {
        context.rebuild();
      }
    };
  }

  function collectEvents(node, list) {
    if (!node) return;
    if ((node.type === 'atom' || node.type === 'component' || node.type === 'element') && Array.isArray(node.events)) {
      for (var i = 0; i < node.events.length; i += 1) {
        list.push(node.events[i]);
      }
    }
    if (Array.isArray(node.children)) {
      for (var j = 0; j < node.children.length; j += 1) {
        collectEvents(node.children[j], list);
      }
    }
    if (node.type === 'if-chain') {
      for (var k = 0; k < node.chain.length; k += 1) {
        collectEvents(node.chain[k].node, list);
      }
    }
  }

  function serializeDom(fragment) {
    var div = document.createElement('div');
    div.appendChild(fragment.cloneNode(true));
    return div.innerHTML;
  }

  function compileTemplate(template, options) {
    var parts = extractTemplateParts(template);
    var scriptBundle = collectTemplateScriptsWithDynamic(template, parts.fragment);
    var envPatch = null;
    if (scriptBundle && scriptBundle.env && scriptBundle.env.length) {
      envPatch = {};
      for (var ei = 0; ei < scriptBundle.env.length; ei += 1) {
        mergeEnvTarget(envPatch, scriptBundle.env[ei]);
      }
      if (!Object.keys(envPatch).length) envPatch = null;
    }
    var dataFeeds = null;
    var ajaxDirectives = null;
    if (scriptBundle && scriptBundle.data && scriptBundle.data.length) {
      dataFeeds = scriptBundle.data.map(function (entry) {
        return {
          path: entry.path,
          segments: entry.segments ? entry.segments.slice() : entry.path.split('.'),
          data: cloneSerializableValue(entry.data || {}),
          source: entry.source,
          ajax: entry.ajax ? cloneSerializableValue(entry.ajax) : null
        };
      });
      ajaxDirectives = [];
      for (var df = 0; df < scriptBundle.data.length; df += 1) {
        var dataEntry = scriptBundle.data[df];
        if (!dataEntry || !dataEntry.ajax) continue;
        ajaxDirectives.push({
          path: dataEntry.path,
          segments: dataEntry.segments ? dataEntry.segments.slice() : dataEntry.path.split('.'),
          ajax: cloneSerializableValue(dataEntry.ajax),
          source: dataEntry.source
        });
      }
      if (!ajaxDirectives.length) ajaxDirectives = null;
    }
    var ajaxRegistry = null;
    if (scriptBundle && scriptBundle.ajaxMaps && scriptBundle.ajaxMaps.length) {
      ajaxRegistry = {};
      for (var am = 0; am < scriptBundle.ajaxMaps.length; am += 1) {
        var mapEntry = scriptBundle.ajaxMaps[am];
        if (!mapEntry || !mapEntry.entries) continue;
        for (var key in mapEntry.entries) {
          if (!Object.prototype.hasOwnProperty.call(mapEntry.entries, key)) continue;
          if (ajaxRegistry[key]) {
            warnings.push('HTMLx: data-m-ajax-map تكرار المفتاح \'' + key + '\' داخل ' + (mapEntry.source || describeTemplate(template)) + '.');
            continue;
          }
          ajaxRegistry[key] = {
            config: cloneSerializableValue(mapEntry.entries[key]),
            source: mapEntry.source || describeTemplate(template),
            owner: mapEntry.owner || null
          };
        }
      }
      if (!Object.keys(ajaxRegistry).length) ajaxRegistry = null;
    }
    var tplSource = template.outerHTML || template.innerHTML || '';
    var tplId = 'tpl:' + (U.hash32 ? U.hash32(tplSource) : simpleHash32(tplSource));
    var fenceMode = (options && options.fence) || 'hard';
    var useScope = fenceMode !== 'none';
    var rootEl = null;
    var walker = parts.fragment ? parts.fragment.firstChild : null;
    while (walker) {
      if (walker.nodeType === 1) {
        rootEl = walker;
        break;
      }
      walker = walker.nextSibling;
    }
    if (useScope && rootEl) {
      rootEl.setAttribute('data-m-scope', fenceMode === 'soft' ? 'soft' : '');
      var before = (rootEl.getAttribute('data-m-key') || '').trim();
      var tokens = before ? before.split(/\s+/).filter(Boolean) : [];
      if (tokens.indexOf(tplId) === -1) tokens.push(tplId);
      rootEl.setAttribute('data-m-key', tokens.join(' ').trim());
    }
    var warnings = scriptBundle && scriptBundle.warnings && scriptBundle.warnings.length
      ? scriptBundle.warnings.slice()
      : [];
    var children = [];
    var node = parts.fragment.firstChild;
    var index = 0;
    while (node) {
      var analyzed = analyzeNode(node, String(index), parts.namespace, warnings);
      if (analyzed) children.push(analyzed);
      index += 1;
      node = node.nextSibling;
    }
    var grouped = groupConditionals(children);
    var domSignature = serializeDom(parts.fragment);
    var scopedStyle = scopeCss(parts.namespace, parts.styleSource, domSignature);
    if (scopedStyle) {
      for (var si = 0; si < grouped.length; si += 1) {
        var target = grouped[si];
        if (!target) continue;
        if (target.type === 'atom' || target.type === 'component' || target.type === 'element') {
          target.attrs['data-m-scope'] = mergeScopeAttr(target.attrs['data-m-scope'], scopedStyle.scopeAttr);
          break;
        }
        if (target.type === 'if-chain') {
          for (var ci = 0; ci < target.chain.length; ci += 1) {
            var branchNode = target.chain[ci].node;
            if (branchNode && (branchNode.type === 'atom' || branchNode.type === 'component' || branchNode.type === 'element')) {
              branchNode.attrs['data-m-scope'] = mergeScopeAttr(branchNode.attrs['data-m-scope'], scopedStyle.scopeAttr);
              si = grouped.length;
              break;
            }
          }
        }
      }
    }
    var events = [];
    grouped.forEach(function (entry) {
      collectEvents(entry, events);
    });
    var runtimeGlobal = instantiateFunctionMap(scriptBundle && scriptBundle.global ? scriptBundle.global.fns : {});
    var bootstrapFns = [];
    var initFns = [];
    if (runtimeGlobal && typeof runtimeGlobal.__bootstrap__ === 'function') {
      bootstrapFns.push(runtimeGlobal.__bootstrap__);
      delete runtimeGlobal.__bootstrap__;
    }
    if (runtimeGlobal && typeof runtimeGlobal.__init__ === 'function') {
      initFns.push(runtimeGlobal.__init__);
      delete runtimeGlobal.__init__;
    }
    var scriptLocals = mergeFunctionLocals(
      scriptBundle && scriptBundle.global ? scriptBundle.global.locals : {},
      runtimeGlobal
    );
    var runtimeScoped = {};
    var scopedLocalsMap = {};
    if (scriptBundle && scriptBundle.scoped) {
      for (var scopeId in scriptBundle.scoped) {
        if (!Object.prototype.hasOwnProperty.call(scriptBundle.scoped, scopeId)) continue;
        var scopedEntry = scriptBundle.scoped[scopeId] || {};
        runtimeScoped[scopeId] = instantiateFunctionMap(scopedEntry.fns || {});
        scopedLocalsMap[scopeId] = mergeFunctionLocals(scopedEntry.locals || {}, runtimeScoped[scopeId]);
      }
    }
    var orders = synthesizeOrders(parts.namespace, events, scriptBundle, { global: runtimeGlobal, scoped: runtimeScoped }, useScope ? tplId : null);

    var compileCtx = { scopedLocals: scopedLocalsMap };
    var compiledChildren = grouped.map(function (child) { return compileNode(child, compileCtx); });
    var hasTemplateLocals = scriptLocals && Object.keys(scriptLocals).length > 0;
    var render = function (scope) {
      var activeScope = hasTemplateLocals ? createLocalScope(scope, scriptLocals) : scope;
      var pieces = [];
      for (var i = 0; i < compiledChildren.length; i += 1) {
        var out = compiledChildren[i](activeScope);
        if (Array.isArray(out)) {
          for (var j = 0; j < out.length; j += 1) {
            if (out[j] != null && out[j] !== false) pieces.push(out[j]);
          }
        } else if (out != null && out !== false) {
          pieces.push(out);
        }
      }
      return pieces.length === 1 ? pieces[0] : pieces;
    };

    var databasePatch = null;
    if (scopedStyle) {
      databasePatch = { head: { styles: [scopedStyle] } };
    }

    return {
      namespace: parts.namespace,
      mount: parts.mount,
      render: render,
      orders: orders,
      databasePatch: databasePatch,
      envPatch: envPatch,
      dataFeeds: dataFeeds,
      ajaxRegistry: ajaxRegistry,
      ajaxDirectives: ajaxDirectives,
      bootstrapFns: bootstrapFns,
      initFns: initFns,
      warnings: warnings,
      element: template
    };
  }

  function deriveMounts(compiled, options) {
    var usedMounts = {};
    var defaultMount = '#app';
    var root = (options && options.root) || global.document || null;
    for (var i = 0; i < compiled.length; i += 1) {
      var entry = compiled[i];
      var mount = entry.mount;
      if (mount && root && root.querySelector(mount)) {
        usedMounts[mount] = true;
        entry.mount = mount;
        continue;
      }
      if (root && root.querySelector(defaultMount) && !usedMounts[defaultMount]) {
        entry.mount = defaultMount;
        usedMounts[defaultMount] = true;
        continue;
      }
      if (root) {
        var containerId = 'm-' + entry.namespace;
        var container = root.getElementById(containerId);
        if (!container) {
          container = root.createElement('div');
          container.id = containerId;
          if (entry.element && entry.element.parentNode) {
            entry.element.parentNode.insertBefore(container, entry.element.nextSibling);
          } else {
            root.body && root.body.appendChild(container);
          }
        }
        entry.mount = '#' + containerId;
      } else {
        entry.mount = defaultMount;
      }
      usedMounts[entry.mount] = true;
      if (entry.element) {
        entry.element.setAttribute('data-namespace', entry.namespace);
        entry.element.setAttribute('data-mount', entry.mount);
      }
    }
  }

  function wrapRenderers(compiled) {
    return compiled.map(function (entry) {
      return {
        namespace: entry.namespace,
        mount: entry.mount,
        render: function (scope) {
          var output = entry.render(scope);
          if (Array.isArray(output)) {
            var dsl = scope.D || Mishkah.DSL;
            return dsl.Containers.Div({ attrs: {} }, output);
          }
          return output;
        }
      };
    });
  }

  function createScope(state, app, dsl) {
    return {
      state: state,
      db: state,
      ctx: app,
      M: Mishkah,
      UI: Mishkah.UI || {},
      D: dsl || Mishkah.DSL || {},
      locals: {}
    };
  }

  function mergeOrders(list) {
    var merged = {};
    for (var i = 0; i < list.length; i += 1) {
      var source = list[i] || {};
      for (var key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        merged[key] = source[key];
      }
    }
    return merged;
  }

  function mergeStyles(base, compiled) {
    var styles = Array.isArray(base) ? base.slice() : [];
    var seen = {};
    styles.forEach(function (entry) {
      if (entry && entry.id) seen[entry.id] = true;
    });
    compiled.forEach(function (entry) {
      var patch = (entry.databasePatch && entry.databasePatch.head && entry.databasePatch.head.styles) || [];
      for (var i = 0; i < patch.length; i += 1) {
        var style = patch[i];
        if (!style) continue;
        if (style.id && seen[style.id]) continue;
        if (style.id) seen[style.id] = true;
        styles.push(style);
      }
    });
    return styles;
  }

  function renderAll(compiled, state, app, dsl) {
    var scope = createScope(state, app, dsl);
    var fragments = [];
    var activeDsl = scope.D || dsl || Mishkah.DSL;
    for (var i = 0; i < compiled.length; i += 1) {
      var rendered = compiled[i].render(scope);
      if (rendered == null) continue;
      var wrapped = wrapForMount(compiled[i].mount, scope.D, ensureArray(rendered));
      if (wrapped != null) {
        fragments.push(wrapped);
      }
    }
    if (!fragments.length) {
      return activeDsl.Containers.Div({ attrs: { class: 'p-6 text-center text-slate-500' } }, ['لا يوجد محتوى HTMLx']);
    }
    if (fragments.length === 1) return fragments[0];
    return activeDsl.Containers.Div({ attrs: { class: 'grid gap-10' } }, fragments);
  }

  function wrapForMount(target, D, children) {
    var dsl = D || Mishkah.DSL;
    if (!children || !children.length) return null;
    if (!target || target === '#app') {
      return children.length === 1 ? children[0] : dsl.Containers.Div({ attrs: { class: 'grid gap-10' } }, children);
    }
    var attrs = {};
    if (target.charAt(0) === '#') {
      attrs.id = target.slice(1);
    } else if (target.charAt(0) === '.') {
      attrs.class = target.slice(1);
    } else {
      attrs['data-mount'] = target;
    }
    return dsl.Containers.Div({ attrs: attrs }, children);
  }

  function normalizeDatabaseSection(source) {
    return isPlainObject(source) ? source : {};
  }

  function lifecycleContext(entry, stage) {
    return {
      template: entry || null,
      stage: stage,
      Mishkah: Mishkah,
      global: global
    };
  }

  async function runLifecycle(sequence, payload, stage, extra) {
    if (!sequence || !sequence.length) return;
    for (var i = 0; i < sequence.length; i += 1) {
      var item = sequence[i];
      if (!item || typeof item.fn !== 'function') continue;
      var helpers = lifecycleContext(item.template, stage);
      if (extra) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) {
            helpers[key] = extra[key];
          }
        }
      }
      try {
        var result = item.fn(payload, helpers);
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (error) {
        var label = item.template && item.template.element ? describeTemplate(item.template.element) : 'template';
        console.warn('HTMLx: ' + stage + ' فشل داخل ' + label + ':', error);
      }
    }
  }

  function buildAjaxTaskConfig(task, registry) {
    if (!task || !task.ajax) return null;
    var descriptor = isPlainObject(task.ajax) ? task.ajax : {};
    var config = {};
    if (descriptor.ref) {
      if (!registry || !registry[descriptor.ref]) {
        console.warn('HTMLx: data-m-ajax المرجع \'' + descriptor.ref + '\' غير معرّف داخل ' + (task.source || 'template') + '.');
      } else {
        config = mergeAjaxConfig(config, registry[descriptor.ref].config || {});
      }
    }
    if (descriptor.inline && isPlainObject(descriptor.inline)) {
      config = mergeAjaxConfig(config, descriptor.inline);
    }
    if (descriptor.config && isPlainObject(descriptor.config)) {
      config = mergeAjaxConfig(config, descriptor.config);
    }
    if (descriptor.overrides && isPlainObject(descriptor.overrides)) {
      config = mergeAjaxConfig(config, descriptor.overrides);
    }
    var mode = descriptor.mode || config.mode || 'merge';
    var responseType = descriptor.responseType || config.responseType || null;
    var responsePath = descriptor.responsePath || config.responsePath || config.extract || null;
    var assignPath = descriptor.assign || config.assign || null;
    var fallbackMode = descriptor.fallbackMode || config.fallbackMode || null;
    var auto = descriptor.auto;
    if (auto == null && Object.prototype.hasOwnProperty.call(config, 'auto')) {
      auto = config.auto;
    }
    var localVars = {};
    if (config.vars && typeof config.vars === 'object') {
      localVars = mergeAjaxConfig(localVars, config.vars);
    }
    if (descriptor.vars && typeof descriptor.vars === 'object') {
      localVars = mergeAjaxConfig(localVars, descriptor.vars);
    }
    var request = mergeAjaxConfig({}, config);
    delete request.mode;
    delete request.responseType;
    delete request.responsePath;
    delete request.extract;
    delete request.assign;
    delete request.vars;
    delete request.fallbackMode;
    delete request.auto;
    if (responseType) request.responseType = responseType;
    if (!request.url) {
      return { error: 'missing-url', ref: descriptor.ref || null, source: task.source || null };
    }
    return {
      request: request,
      mode: typeof mode === 'string' ? mode.toLowerCase() : 'merge',
      responsePath: responsePath || null,
      assign: assignPath || null,
      vars: localVars,
      auto: auto,
      fallbackMode: fallbackMode || null,
      ref: descriptor.ref || null,
      source: task.source || null
    };
  }

  async function sendAjaxRequest(request) {
    var url = request && request.url ? String(request.url) : '';
    if (!url) throw new Error('data-m-ajax يتطلب عنوان URL صالحًا.');
    var net = Mishkah.utils && Mishkah.utils.Net && typeof Mishkah.utils.Net.ajax === 'function' ? Mishkah.utils.Net.ajax : null;
    var options = mergeAjaxConfig({}, request);
    delete options.url;
    if (net) {
      return net(url, options);
    }
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API غير متاحة.');
    }
    var query = options.query;
    var fullUrl = url;
    if (query && typeof query === 'object') {
      var usp = new URLSearchParams();
      for (var key in query) {
        if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
        var value = query[key];
        if (value == null) continue;
        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i += 1) {
            usp.append(key, String(value[i]));
          }
        } else {
          usp.append(key, String(value));
        }
      }
      if (usp.toString()) {
        fullUrl = fullUrl + (fullUrl.indexOf('?') === -1 ? '?' : '&') + usp.toString();
      }
    }
    var headers = mergeAjaxConfig({}, options.headers || {});
    var method = (options.method || 'GET').toUpperCase();
    var body = options.body;
    var fetchOptions = { method: method, headers: headers };
    if (options.withCredentials) {
      fetchOptions.credentials = 'include';
    }
    if (body != null) {
      var hasContentType = headers['Content-Type'] || headers['content-type'];
      if (typeof body === 'object' && !(body instanceof Blob) && !(body instanceof FormData) && !Array.isArray(body)) {
        if (!hasContentType) {
          headers['Content-Type'] = 'application/json';
        }
        fetchOptions.body = JSON.stringify(body);
      } else {
        fetchOptions.body = body;
      }
    }
    var responseType = options.responseType || 'json';
    var response = await fetch(fullUrl, fetchOptions);
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' ' + (response.statusText || ''));
    }
    if (responseType === 'json') return response.json();
    if (responseType === 'text') return response.text();
    if (responseType === 'blob') return response.blob();
    if (responseType === 'arrayBuffer') return response.arrayBuffer();
    if (responseType === 'formData') return response.formData();
    var contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.indexOf('application/json') !== -1) return response.json();
    if (contentType.indexOf('text/') !== -1) return response.text();
    return response.blob();
  }

  function applyAjaxResult(db, task, payload, mode, assignPath) {
    if (!task || !task.segments || !task.segments.length) return;
    var segments = task.segments.slice();
    var cursor = db;
    for (var i = 0; i < segments.length - 1; i += 1) {
      var key = segments[i];
      var next = cursor[key];
      if (!next || typeof next !== 'object') {
        next = {};
        cursor[key] = next;
      }
      cursor = next;
    }
    var lastKey = segments[segments.length - 1];
    var current = cursor[lastKey];
    if (assignPath) {
      var assignSegments = splitPathSegments(assignPath);
      var base = isPlainObject(current) ? cloneSerializableValue(current) : {};
      setBySegments(base, assignSegments, payload);
      cursor[lastKey] = base;
      return;
    }
    if (mode === 'append' && Array.isArray(current) && Array.isArray(payload)) {
      cursor[lastKey] = current.concat(payload);
      return;
    }
    if (mode === 'merge' && isPlainObject(payload)) {
      var existing = isPlainObject(current) ? cloneSerializableValue(current) : {};
      cursor[lastKey] = mergeEnvTarget(existing, payload);
      return;
    }
    cursor[lastKey] = payload;
  }

  async function executeAjaxTasks(tasks, registry, db, options) {
    if (!tasks || !tasks.length) return;
    var ajaxOptions = (options && options.ajax) || {};
    var globalVars = ajaxOptions.vars || ajaxOptions.variables || options && options.ajaxVars || {};
    var globalParams = ajaxOptions.params || options && options.ajaxParams || globalVars;
    var globalHeaders = ajaxOptions.headers && typeof ajaxOptions.headers === 'object' ? ajaxOptions.headers : null;
    var globalQuery = ajaxOptions.query && typeof ajaxOptions.query === 'object' ? ajaxOptions.query : null;
    var baseURL = ajaxOptions.baseURL || ajaxOptions.baseUrl || null;
    var activeTasks = [];
    for (var i = 0; i < tasks.length; i += 1) {
      var task = tasks[i];
      if (!task || !task.ajax) continue;
      var config = buildAjaxTaskConfig(task, registry);
      if (!config) continue;
      if (config.error === 'missing-url') {
        console.warn('HTMLx: data-m-ajax بدون عنوان URL داخل ' + (config.source || task.source || 'template') + '.');
        continue;
      }
      if (config.auto === false) {
        continue;
      }
      activeTasks.push({ task: task, config: config });
    }
    if (!activeTasks.length) return;
    await Promise.all(activeTasks.map(function (entry) {
      return (async function () {
        var task = entry.task;
        var config = entry.config;
        var contextVars = mergeAjaxConfig({}, globalVars || {});
        if (config.vars && typeof config.vars === 'object') {
          contextVars = mergeAjaxConfig(contextVars, config.vars);
        }
        var contextParams = mergeAjaxConfig({}, globalParams || {});
        var placeholderContext = { db: db, vars: contextVars, params: contextParams };
        var request = applyPlaceholders(config.request, placeholderContext);
        if (!request || !request.url) {
          console.warn('HTMLx: data-m-ajax بدون عنوان URL صالح داخل ' + (task.source || 'template') + '.');
          return;
        }
        if (baseURL && typeof request.url === 'string' && !/^([a-z]+:)?\/\//i.test(request.url)) {
          request.url = String(baseURL).replace(/\/$/, '') + '/' + String(request.url).replace(/^\//, '');
        }
        if (globalHeaders) {
          request.headers = mergeAjaxConfig(globalHeaders, request.headers || {});
        }
        if (globalQuery) {
          request.query = mergeAjaxConfig(globalQuery, request.query || {});
        }
        var resolvedResponsePath = config.responsePath ? resolvePlaceholderString(String(config.responsePath), placeholderContext) : null;
        var resolvedAssignPath = config.assign ? resolvePlaceholderString(String(config.assign), placeholderContext) : null;
        try {
          var payload = await sendAjaxRequest(request);
          if (resolvedResponsePath) {
            var responseSegments = splitPathSegments(resolvedResponsePath);
            payload = getBySegments(payload, responseSegments);
          }
          if (payload === undefined) return;
          var value = (isPlainObject(payload) || Array.isArray(payload)) ? cloneSerializableValue(payload) : payload;
          applyAjaxResult(db, task, value, config.mode || 'merge', resolvedAssignPath);
        } catch (error) {
          console.warn('HTMLx: فشل طلب data-m-ajax داخل ' + (task.source || 'template') + ':', error);
        }
      })();
    }));
  }

  async function createApp(db, options) {
    if (db == null) db = {};
    if (typeof db !== 'object') {
      throw new Error('Mishkah.app.make يتطلب كائن قاعدة بيانات صالح.');
    }
    var root = (options && options.root) || global.document || null;
    if (!root || !root.querySelectorAll) {
      throw new Error('HTML document context is required.');
    }
    var templates = Array.from(root.querySelectorAll('template'));
    var compiled = templates.map(compileTemplate);
    var ajaxRegistry = {};
    var ajaxDirectives = [];
    for (var ri = 0; ri < compiled.length; ri += 1) {
      var compiledEntry = compiled[ri];
      if (!compiledEntry) continue;
      var templateLabel = compiledEntry.element ? describeTemplate(compiledEntry.element) : (compiledEntry.namespace ? 'template[' + compiledEntry.namespace + ']' : 'template');
      if (compiledEntry.ajaxRegistry) {
        for (var key in compiledEntry.ajaxRegistry) {
          if (!Object.prototype.hasOwnProperty.call(compiledEntry.ajaxRegistry, key)) continue;
          if (ajaxRegistry[key]) {
            console.warn('HTMLx: data-m-ajax-map تكرار المفتاح \'' + key + '\' بين ' + (ajaxRegistry[key].source || 'template') + ' و ' + (compiledEntry.ajaxRegistry[key].source || templateLabel) + '.');
            continue;
          }
          ajaxRegistry[key] = {
            config: cloneSerializableValue(compiledEntry.ajaxRegistry[key].config || {}),
            source: compiledEntry.ajaxRegistry[key].source || templateLabel,
            owner: compiledEntry.ajaxRegistry[key].owner || null
          };
        }
      }
      if (compiledEntry.ajaxDirectives && compiledEntry.ajaxDirectives.length) {
        for (var dj = 0; dj < compiledEntry.ajaxDirectives.length; dj += 1) {
          var directive = compiledEntry.ajaxDirectives[dj];
          if (!directive || !directive.ajax) continue;
          ajaxDirectives.push({
            path: directive.path,
            segments: directive.segments ? directive.segments.slice() : (directive.path ? directive.path.split('.') : []),
            ajax: cloneSerializableValue(directive.ajax),
            source: directive.source || templateLabel
          });
        }
      }
    }
    if (!Object.keys(ajaxRegistry).length) ajaxRegistry = null;
    if (!ajaxDirectives.length) ajaxDirectives = [];
    db = isPlainObject(db) ? db : Object.assign({}, db);
    db.head = normalizeDatabaseSection(db.head);
    db.env = normalizeDatabaseSection(db.env);
    db.i18n = normalizeDatabaseSection(db.i18n);
    db.data = normalizeDatabaseSection(db.data);
    db.templates = Array.isArray(db.templates) ? db.templates.slice() : [];
    var templateEnv = null;
    for (var ci = 0; ci < compiled.length; ci += 1) {
      var entry = compiled[ci];
      if (!entry || !entry.envPatch) continue;
      if (!templateEnv) templateEnv = {};
      mergeEnvTarget(templateEnv, entry.envPatch);
    }
    if (templateEnv && Object.keys(templateEnv).length) {
      var mergedEnv = mergeEnvTarget({}, templateEnv);
      if (db && db.env && typeof db.env === 'object') {
        mergeEnvTarget(mergedEnv, db.env);
      }
      if (db) {
        db.env = mergedEnv;
      }
    }
    var templateDataFeeds = [];
    for (var di = 0; di < compiled.length; di += 1) {
      var dataEntry = compiled[di];
      if (!dataEntry || !dataEntry.dataFeeds || !dataEntry.dataFeeds.length) continue;
      templateDataFeeds = templateDataFeeds.concat(dataEntry.dataFeeds);
    }
    if (templateDataFeeds.length) {
      var seenKeys = {};
      var duplicates = [];
      for (var si = 0; si < templateDataFeeds.length; si += 1) {
        var feed = templateDataFeeds[si];
        if (!feed || !feed.data) continue;
        collectDataKeys(feed.data, feed.path, seenKeys, duplicates);
      }
      if (duplicates.length) {
        console.warn('HTMLx: data-m-data تكرار في المفاتيح التالية: ' + duplicates.join(', '));
      }
      for (var ai = 0; ai < templateDataFeeds.length; ai += 1) {
        applyDataFeed(db, templateDataFeeds[ai]);
      }
    }
    if (ajaxDirectives && ajaxDirectives.length) {
      await executeAjaxTasks(ajaxDirectives, ajaxRegistry, db, options || {});
    }
    var lifecycle = { bootstrap: [], init: [] };
    for (var bi = 0; bi < compiled.length; bi += 1) {
      var compiledEntry = compiled[bi];
      if (!compiledEntry) continue;
      if (compiledEntry.bootstrapFns && compiledEntry.bootstrapFns.length) {
        compiledEntry.bootstrapFns.forEach(function (fn) {
          lifecycle.bootstrap.push({ fn: fn, template: compiledEntry });
        });
      }
      if (compiledEntry.initFns && compiledEntry.initFns.length) {
        compiledEntry.initFns.forEach(function (fn) {
          lifecycle.init.push({ fn: fn, template: compiledEntry });
        });
      }
    }
    await runLifecycle(lifecycle.bootstrap, db, 'bootstrap');
    deriveMounts(compiled, { root: root });
    for (var ti = 0; ti < compiled.length; ti += 1) {
      var tpl = compiled[ti];
      if (!tpl || !tpl.namespace) continue;
      var exists = db.templates.some(function (entry) {
        return entry && entry.id === tpl.namespace;
      });
      if (!exists) {
        db.templates.push({ id: tpl.namespace, mount: tpl.mount });
      }
    }
    var legacyOrders = null;
    if (db && db.orders) {
      legacyOrders = db.orders;
      if (!options || !options.orders) {
        console.warn('HTMLx: تمرير الأوامر عبر db.orders متوقف. استخدم options.orders بدلاً من ذلك.');
      }
    }

    var sanitizedDb = db;
    if (db && Object.prototype.hasOwnProperty.call(db, 'orders')) {
      sanitizedDb = Object.assign({}, db);
      delete sanitizedDb.orders;
    }

    var app = Mishkah.app.createApp(sanitizedDb, {});

    db.head = db.head || {};
    db.head.styles = mergeStyles(db.head.styles, compiled);

    var envResult = null;
    var shouldInitEnv = !(db && db.env && db.env.twcss === false);
    if (shouldInitEnv && Mishkah.utils && Mishkah.utils.twcss && typeof Mishkah.utils.twcss.auto === 'function') {
      try {
        envResult = await Promise.resolve(Mishkah.utils.twcss.auto(db, app, { pageScaffold: true }));
      } catch (error) {
        console.warn('twcss.auto فشل:', error);
        envResult = null;
      }
      if (envResult && envResult.databasePatch && envResult.databasePatch.head && Array.isArray(envResult.databasePatch.head.styles)) {
        db.head.styles = mergeStyles(db.head.styles, [{ databasePatch: envResult.databasePatch }]);
      }
    }

    if (Mishkah.Head && typeof Mishkah.Head.batch === 'function') {
      try {
        Mishkah.Head.batch(db.head);
      } catch (error) {
        console.warn('Mishkah.Head.batch فشل مع head القادم من HTMLx:', error);
      }
    }

    var rendererList = wrapRenderers(compiled);
    Mishkah.app.setBody(function (state, D) {
      return renderAll(rendererList, state, app, D || Mishkah.DSL);
    });

    var generatedOrders = mergeOrders(compiled.map(function (entry) { return entry.orders; }));
    var providedOrders = mergeOrders([
      (options && options.orders) || {},
      legacyOrders || {}
    ]);
    var mergedOrders = mergeOrders([
      generatedOrders,
      providedOrders,
      (envResult && envResult.orders) || {},
      (Mishkah.UI && Mishkah.UI.orders) || {}
    ]);
    app.setOrders(mergedOrders);

    var mountTarget = (options && options.mount) || '#app';
    app.mount(mountTarget);
    if (wsRuntime && typeof wsRuntime.attach === 'function') {
      wsRuntime.attach(app, mountTarget);
    }

    await runLifecycle(lifecycle.init, app, 'init', { app: app });
    var optionInits = ensureArray(options && options.init);
    if (optionInits.length) {
      var optionSequence = optionInits.map(function (fn) {
        return { fn: fn, template: null };
      });
      await runLifecycle(optionSequence, app, 'init', { app: app });
    }

    // Remove template elements from DOM after build is complete
    // Templates are only for storing markup and should be removed after processing
    for (var ri = 0; ri < templates.length; ri += 1) {
      var templateEl = templates[ri];
      if (templateEl && templateEl.parentNode) {
        templateEl.parentNode.removeChild(templateEl);
      }
    }

    return { app: app, compiled: compiled, renderers: rendererList };
  }

  var agent = {
    version: '1.0.0',
    compileTemplate: compileTemplate,
    createApp: createApp,
    ContextAdapter: ContextAdapter,
    make: async function (db, options) {
      var result = await createApp(db, options);
      return result.app;
    }
  };

  agent.__internals = agent.__internals || {};
  agent.__internals.evaluateExpression = function (code, scope) {
    return evaluateExpression(code, scope);
  };

  agent.boot = function (db, options) {
    console.warn('M.HTMLxAgent.boot متوقفة، استخدم make بدلاً منها.');
    return agent.make(db, options);
  };

  Mishkah.HTMLx = Mishkah.HTMLx || {};
  Mishkah.HTMLx.Agent = agent;
  Mishkah.HTMLxAgent = agent;

  Mishkah.app.make = agent.make;

  return agent;
});
