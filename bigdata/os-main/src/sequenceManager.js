import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

import { deepClone, nowIso } from './utils.js';

function normalizeModuleId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'pos';
}

function normalizeTableName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizeFieldName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function toBranchKey(branchId) {
  if (!branchId) return 'default';
  try {
    return encodeURIComponent(branchId);
  } catch (_err) {
    return branchId;
  }
}

function loadJsonSafe(content, fallback = {}) {
  if (typeof content !== 'string') return fallback;
  try {
    return JSON.parse(content);
  } catch (_err) {
    return fallback;
  }
}

function padNumber(value, width = 0, padChar = '0') {
  const text = String(value ?? '');
  if (!width) return text;
  const filler = (typeof padChar === 'string' && padChar.length ? padChar[0] : '0') || '0';
  return text.padStart(width, filler);
}

function formatDateTag(date, format) {
  if (!date) return null;
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const fmt = (typeof format === 'string' && format.trim()) ? format.trim() : 'YYYYMMDD';
  return fmt
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g, yy)
    .replace(/MM/g, mm)
    .replace(/DD/g, dd);
}

function resolveDateTag(rule, context = {}) {
  const dateFormat = rule?.dateFormat || rule?.date_format;
  if (!dateFormat) return null;
  const now = context.now instanceof Date ? context.now : new Date();
  return formatDateTag(now, dateFormat);
}

function formatSequence(rule, numericValue, options = {}) {
  const delimiter = rule.delimiter === '' ? '' : rule.delimiter || '-';
  const prefix = rule.prefix || '';
  const suffix = rule.suffix || '';
  const padChar = rule.padChar || rule.padWith || '0';
  const width = Number.isFinite(rule.padding) ? Number(rule.padding) : Number(rule.pad) || 0;
  const padded = padNumber(numericValue, width, padChar);
  const dateTag = options.dateTag;
  const includeDate = dateTag && rule.includeDate !== false;
  const datePosition = rule.datePosition || rule.datePlacement || 'prefix';
  const parts = [];
  if (prefix) parts.push(prefix);
  if (includeDate && datePosition !== 'suffix') parts.push(dateTag);
  parts.push(padded);
  if (includeDate && datePosition === 'suffix') parts.push(dateTag);
  if (suffix) parts.push(suffix);
  if (!delimiter) return parts.join('');
  return parts.filter((part) => part !== '').join(delimiter);
}

function normalizeResetPolicy(rule) {
  const raw = rule?.reset || rule?.resetEvery || rule?.period || rule?.scope;
  if (!raw) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  if (text === 'daily' || text === 'day' || text === 'date') return 'daily';
  return text;
}

export default class SequenceManager {
  constructor(options = {}) {
    this.rulesPath = options.rulesPath;
    this.branchesDir = options.branchesDir;
    this.logger = options.logger || console;
    this.rules = null;
    this.tableRuleCache = new Map();
    this.branchStateCache = new Map();
  }

  async loadRules() {
    if (!this.rulesPath) {
      this.rules = { version: 1, defaults: {}, branches: {} };
      return this.rules;
    }
    if (this.rules) return this.rules;
    try {
      const raw = await readFile(this.rulesPath, 'utf8');
      const parsed = loadJsonSafe(raw, {});
      this.rules = {
        version: parsed.version || 1,
        defaults: parsed.defaults || {},
        branches: parsed.branches || {}
      };
    } catch (error) {
      this.logger.warn?.({ err: error, rulesPath: this.rulesPath }, 'Failed to load sequence rules; falling back to defaults');
      this.rules = { version: 1, defaults: {}, branches: {} };
    }
    return this.rules;
  }

  async getRulesForTable(branchId, moduleId, tableName) {
    const normalizedModule = normalizeModuleId(moduleId);
    const normalizedTable = normalizeTableName(tableName);
    if (!normalizedTable) return null;
    const cacheKey = `${branchId || 'default'}::${normalizedModule}::${normalizedTable}`;
    if (this.tableRuleCache.has(cacheKey)) {
      return this.tableRuleCache.get(cacheKey);
    }
    const rules = await this.loadRules();
    const branchRules = (rules.branches?.[branchId] && rules.branches[branchId][normalizedModule]) || null;
    const moduleDefaults = rules.defaults?.[normalizedModule] || null;
    const resolved = deepClone(
      (branchRules && branchRules[normalizedTable]) ||
        (moduleDefaults && moduleDefaults[normalizedTable]) ||
        null
    );
    this.tableRuleCache.set(cacheKey, resolved);
    return resolved;
  }

  async ensureBranchState(branchId) {
    const key = branchId || 'default';
    if (this.branchStateCache.has(key)) {
      return this.branchStateCache.get(key);
    }
    const result = { loaded: false, values: new Map(), path: null };
    if (!this.branchesDir) {
      result.loaded = true;
      this.branchStateCache.set(key, result);
      return result;
    }
    const branchKey = toBranchKey(branchId || 'default');
    const dir = path.join(this.branchesDir, branchKey);
    result.path = path.join(dir, 'sequence-state.json');
    try {
      const raw = await readFile(result.path, 'utf8');
      const parsed = loadJsonSafe(raw, {});
      Object.entries(parsed).forEach(([seqKey, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        const numeric = Number(entry.last);
        if (Number.isFinite(numeric)) {
          result.values.set(seqKey, { last: numeric, updatedAt: entry.updatedAt || null });
        }
      });
      result.loaded = true;
    } catch (_err) {
      result.loaded = true;
    }
    this.branchStateCache.set(key, result);
    return result;
  }

  async persistBranchState(branchId, state) {
    if (!this.branchesDir || !state?.path) return;
    const branchKey = toBranchKey(branchId || 'default');
    const dir = path.dirname(state.path);
    await mkdir(dir, { recursive: true });
    const payload = {};
    for (const [seqKey, entry] of state.values.entries()) {
      payload[seqKey] = { last: entry.last, updatedAt: entry.updatedAt };
    }
    await writeFile(state.path, JSON.stringify(payload, null, 2), 'utf8');
  }

  buildSequenceKey(moduleId, tableName, fieldName) {
    const mod = normalizeModuleId(moduleId);
    const table = normalizeTableName(tableName);
    const field = normalizeFieldName(fieldName);
    if (!table || !field) return null;
    return `${mod}:${table}:${field}`;
  }

  async persistAutoCreatedRule(branchId, moduleId, tableName, fieldName, rule) {
    if (!this.rulesPath) return;

    try {
      const rules = await this.loadRules();
      const normalizedModule = normalizeModuleId(moduleId);
      const normalizedTable = normalizeTableName(tableName);
      const normalizedField = normalizeFieldName(fieldName);

      if (!normalizedTable || !normalizedField) return;

      // Initialize structure if needed
      if (!rules.defaults) rules.defaults = {};
      if (!rules.defaults[normalizedModule]) rules.defaults[normalizedModule] = {};
      if (!rules.defaults[normalizedModule][normalizedTable]) {
        rules.defaults[normalizedModule][normalizedTable] = {};
      }

      // Add the rule if it doesn't exist
      if (!rules.defaults[normalizedModule][normalizedTable][normalizedField]) {
        rules.defaults[normalizedModule][normalizedTable][normalizedField] = rule;

        // Write to file
        await writeFile(this.rulesPath, JSON.stringify(rules, null, 2), 'utf8');

        // Clear cache to force reload
        this.tableRuleCache.clear();
        this.rules = null;

        this.logger.info?.(
          { branchId, moduleId: normalizedModule, table: normalizedTable, field: normalizedField },
          'Auto-created sequence rule persisted to file'
        );
      }
    } catch (error) {
      this.logger.warn?.(
        { err: error, branchId, moduleId, table: tableName, field: fieldName },
        'Failed to persist auto-created sequence rule'
      );
    }
  }

  async nextValue(branchId, moduleId, tableName, fieldName, context = {}) {
    const rules = await this.getRulesForTable(branchId, moduleId, tableName);
    let rule = rules?.[fieldName];
    let wasAutoCreated = false;

    // Auto-create default sequence if requested and rule doesn't exist
    if (!rule && context.autoCreate === true) {
      rule = {
        start: 1,
        prefix: '',
        suffix: '',
        delimiter: '',
        padding: 0
      };
      wasAutoCreated = true;
    }

    if (!rule) {
      return null;
    }
    const seqKey = this.buildSequenceKey(moduleId, tableName, fieldName);
    if (!seqKey) return null;
    const resetPolicy = normalizeResetPolicy(rule);
    const dateTag = resolveDateTag(rule, context);
    const dateKey = resetPolicy === 'daily'
      ? (dateTag || formatDateTag(context.now instanceof Date ? context.now : new Date(), 'YYYYMMDD'))
      : null;
    const stateKey = dateKey ? `${seqKey}::${dateKey}` : seqKey;
    const state = await this.ensureBranchState(branchId);
    const record = state.values.get(stateKey) || { last: Number(rule.start) ? Number(rule.start) - 1 : 0, updatedAt: null };
    const startValue = Number(rule.start);
    const base = Number.isFinite(startValue) ? startValue : 1;
    let nextNumeric = record.last + 1;
    if (!record.last && record.last !== 0) {
      nextNumeric = base;
    } else if (record.last < base - 1) {
      nextNumeric = base;
    }
    record.last = nextNumeric;
    record.updatedAt = nowIso();
    state.values.set(stateKey, record);
    await this.persistBranchState(branchId, state);
    const formatted = formatSequence(rule, nextNumeric, { dateTag });

    // Persist auto-created rule to file
    if (wasAutoCreated) {
      await this.persistAutoCreatedRule(branchId, moduleId, tableName, fieldName, rule);
    }

    return { value: nextNumeric, formatted, rule, context };
  }

  async previewNextValue(branchId, moduleId, tableName, fieldName, context = {}) {
    const rules = await this.getRulesForTable(branchId, moduleId, tableName);
    const rule = rules?.[fieldName];
    if (!rule) return null;

    const seqKey = this.buildSequenceKey(moduleId, tableName, fieldName);
    if (!seqKey) return null;
    const resetPolicy = normalizeResetPolicy(rule);
    const dateTag = resolveDateTag(rule, context);
    const dateKey = resetPolicy === 'daily'
      ? (dateTag || formatDateTag(context.now instanceof Date ? context.now : new Date(), 'YYYYMMDD'))
      : null;
    const stateKey = dateKey ? `${seqKey}::${dateKey}` : seqKey;

    const state = await this.ensureBranchState(branchId);
    const record = state.values.get(stateKey) || { last: Number(rule.start) ? Number(rule.start) - 1 : 0 };
    const startValue = Number(rule.start);
    const base = Number.isFinite(startValue) ? startValue : 1;
    let nextNumeric = record.last + 1;
    if (!record.last && record.last !== 0) {
      nextNumeric = base;
    } else if (record.last < base - 1) {
      nextNumeric = base;
    }

    const formatted = formatSequence(rule, nextNumeric, { dateTag });
    return { value: nextNumeric, formatted, rule, context };
  }

  async applyAutoSequences(branchId, moduleId, tableName, record) {
    const rules = await this.getRulesForTable(branchId, moduleId, tableName);
    if (!rules) return record;
    const nextRecord = { ...(record || {}) };
    for (const [fieldName, rule] of Object.entries(rules)) {
      if (!rule || typeof rule !== 'object') continue;
      if (nextRecord[fieldName] !== undefined && nextRecord[fieldName] !== null && nextRecord[fieldName] !== '') {
        continue;
      }
      const allocation = await this.nextValue(branchId, moduleId, tableName, fieldName, { record: nextRecord });
      if (!allocation) continue;
      nextRecord[fieldName] = allocation.formatted;
      if (rule.counterField && nextRecord[rule.counterField] === undefined) {
        nextRecord[rule.counterField] = allocation.value;
      }
    }
    return nextRecord;
  }
}
