import { randomUUID } from 'crypto';

const SERIALIZE_CACHE = Symbol('ws2:serialize-cache');

const hasStructuredClone = typeof structuredClone === 'function';

export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (hasStructuredClone) {
    try {
      return structuredClone(value);
    } catch (error) {
      // fall through to JSON fallback
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    if (Array.isArray(value)) return value.map((item) => deepClone(item));
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = deepClone(value[key]);
    return copy;
  }
}

export function isPlainObject(value) {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

export function serializeOnce(payload, { cycle = null, binary = false } = {}) {
  const preferBinary = binary === true;

  const createBufferResult = (text, cached) => {
    const buffer = Buffer.from(text);
    return { data: buffer, bytes: buffer.byteLength, cached };
  };

  const createFrozenStringResult = (text, cached) => {
    const frozen = Object.freeze(text);
    return { data: frozen, bytes: Buffer.byteLength(text), cached };
  };

  if (payload === null || payload === undefined) {
    return preferBinary ? createBufferResult('null', false) : createFrozenStringResult('null', false);
  }

  if (preferBinary && Buffer.isBuffer(payload)) {
    return { data: payload, bytes: payload.byteLength, cached: true };
  }

  if (!preferBinary && typeof payload === 'string') {
    return { data: Object.freeze(payload), bytes: Buffer.byteLength(payload), cached: true };
  }

  if (typeof payload !== 'object') {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return preferBinary ? createBufferResult(text, false) : createFrozenStringResult(text, false);
  }

  if (!Object.isExtensible(payload)) {
    const text = JSON.stringify(payload);
    return preferBinary ? createBufferResult(text, false) : createFrozenStringResult(text, false);
  }

  let cache = payload[SERIALIZE_CACHE];
  if (!cache) {
    cache = {};
    Object.defineProperty(payload, SERIALIZE_CACHE, { value: cache, enumerable: false, configurable: false });
  }

  const modeKey = preferBinary ? 'binary' : 'json';
  const existing = cache[modeKey];
  if (existing && (cycle == null || existing.cycle === cycle)) {
    existing.hits += 1;
    return { data: existing.value, bytes: existing.bytes, cached: true };
  }

  const text = JSON.stringify(payload);
  const value = preferBinary ? Buffer.from(text) : Object.freeze(text);
  const entry = {
    value,
    bytes: preferBinary ? value.byteLength : Buffer.byteLength(text),
    cycle: cycle ?? null,
    hits: 0
  };
  cache[modeKey] = entry;
  try {
    Object.freeze(payload);
  } catch (_err) {
    /* ignore freeze failures */
  }
  return { data: entry.value, bytes: entry.bytes, cached: false };
}

function mergeObjects(baseObj, patchObj) {
  const result = {};
  const baseKeys = baseObj ? Object.keys(baseObj) : [];
  for (const key of baseKeys) {
    const baseValue = baseObj[key];
    result[key] = deepClone(baseValue);
  }
  for (const key of Object.keys(patchObj || {})) {
    const patchValue = patchObj[key];
    if (patchValue && typeof patchValue === 'object' && !Array.isArray(patchValue)) {
      result[key] = mergeObjects(baseObj && typeof baseObj === 'object' ? baseObj[key] : undefined, patchValue);
    } else if (Array.isArray(patchValue)) {
      result[key] = patchValue.map((item) => deepClone(item));
    } else {
      result[key] = deepClone(patchValue);
    }
  }
  return result;
}

export function mergeDeep(base, patch) {
  if (patch === undefined) return deepClone(base);
  if (patch === null || typeof patch !== 'object') return deepClone(patch);
  if (Array.isArray(patch)) return patch.map((item) => deepClone(item));
  const baseObj = base && typeof base === 'object' && !Array.isArray(base) ? base : undefined;
  return mergeObjects(baseObj, patch);
}

export function createId(prefix = 'evt') {
  try {
    return `${prefix}-${randomUUID()}`;
  } catch (_err) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeJsonParse(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

export function pickOverlaySettings(source) {
  if (!source || typeof source !== 'object') return {};
  const overlay = {};
  if (source.settings && typeof source.settings === 'object') {
    overlay.settings = overlay.settings || {};
    if (source.settings.sync && typeof source.settings.sync === 'object') {
      overlay.settings.sync = mergeObjects({}, source.settings.sync);
    }
    if (source.settings.pos && typeof source.settings.pos === 'object') {
      overlay.settings.pos = mergeObjects({}, source.settings.pos);
    }
  }
  return overlay;
}
