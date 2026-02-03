import { deepClone, nowIso } from '../utils.js';
import { populateRecordFks, populateRecordsFks } from '../schema/fk-resolver.js';

const VERSIONED_TABLES = new Set(['order_header', 'order_line']);

export class VersionConflictError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'VersionConflictError';
    this.code = 'VERSION_CONFLICT';
    this.table = options.table || null;
    this.key = options.key || null;
    this.expectedVersion = options.expectedVersion ?? null;
    this.currentVersion = options.currentVersion ?? null;
    this.reason = options.reason || null;
    if (options.details && typeof options.details === 'object') {
      this.details = options.details;
    }
  }
}

export default class ModuleStore {
  constructor(schemaEngine, branchId, moduleId, definition = {}, seed = {}, seedData = null) {
    this.schemaEngine = schemaEngine;
    this.branchId = branchId;
    this.moduleId = moduleId;
    this.definition = definition || {};
    this.tables = Array.isArray(definition.tables) ? definition.tables.slice() : [];
    this.versionedTables = new Set();
    for (const tableName of this.tables) {
      const normalized = typeof tableName === 'string' ? tableName.toLowerCase() : null;
      if (normalized && VERSIONED_TABLES.has(normalized)) {
        this.versionedTables.add(normalized);
      }
    }
    this.version = Number(seed.version || 1);
    this.meta = deepClone(seed.meta || {});
    if (!this.meta.lastUpdatedAt) this.meta.lastUpdatedAt = nowIso();
    if (typeof this.meta.counter !== 'number') this.meta.counter = 0;
    if (typeof this.meta.labCounter !== 'number') this.meta.labCounter = this.meta.counter;
    this.primaryKeyCache = new Map();
    // ✅ NEW: I18n Cache to eliminate O(n*m) loops
    this.i18nCache = new Map();
    this.seedData = seedData ? deepClone(seedData) : null;

    const seedTables = seed.tables || {};
    this.data = schemaEngine.createModuleDataset(this.tables);
    for (const tableName of this.tables) {
      // CRITICAL FIX: Use findSeedDataForTable to handle plural/singular and alias mappings
      // This ensures seeds with 'kitchen_sections' are correctly loaded into 'kitchen_section' table
      const seedValue = this.findSeedDataForTable(seedTables, tableName);
      const records = Array.isArray(seedValue) ? seedValue.map((entry) => deepClone(entry)) : [];
      this.data[tableName] = records;
      for (const record of this.data[tableName]) {
        this.initializeRecordVersion(tableName, record);
      }
    }

    if (this.seedData) {
      this.applySeed(this.seedData, { reason: 'initial-seed' });
    }
  }

  // ... (keeping existing methods until decorateWithTranslations) ...

  /**
   * Invalidates i18n cache for a specific table
   * @param {string} tableName - The table that was modified
   */
  invalidateI18nCache(tableName) {
    if (!tableName) return;

    // Case 1: Modified _lang table (e.g., clinic_doctors_lang) -> Invalidate clinic_doctors
    if (tableName.endsWith('_lang')) {
      const baseTable = tableName.replace('_lang', '');
      // Clear all language caches for the base table
      for (const key of this.i18nCache.keys()) {
        if (key.startsWith(baseTable + ':')) {
          this.i18nCache.delete(key);
        }
      }
      return;
    }

    // Case 2: Modified main table (e.g., clinic_doctors) -> Invalidate its cache
    // (In case records are removed/added, though mostly affects decoration if IDs change)
    for (const key of this.i18nCache.keys()) {
      if (key.startsWith(tableName + ':')) {
        this.i18nCache.delete(key);
      }
    }
  }

  /**
   * Decorate records with translations from {tableName}_lang table
   * @param {Array} records - Records to decorate
   * @param {string} tableName - Table name
   * @param {string} lang - Language code (e.g., 'en', 'ar')
   * @returns {Array} Decorated records
   */
  decorateWithTranslations(records, tableName, lang) {
    if (!lang || !Array.isArray(records) || !records.length) {
      return records;
    }

    const langTableName = `${tableName}_lang`;
    const langTable = this.data[langTableName];

    // If no translation table exists, return original records
    if (!Array.isArray(langTable) || !langTable.length) {
      return records;
    }

    // ✅ CHECK CACHE FIRST
    const cacheKey = `${tableName}:${lang}`;
    let translationsMap = this.i18nCache.get(cacheKey);

    if (!translationsMap) {
      // 🚀 CACHE MISS: Build map (One time cost per session/invalidation)
      translationsMap = new Map();
      const fkField = `${tableName}_id`; // e.g. clinic_services_id

      for (const langRecord of langTable) {
        // Strict check on lang to avoid cross-contamination
        if (langRecord.lang !== lang) continue;

        const recordId = langRecord[fkField];
        if (!recordId) continue;

        if (!translationsMap.has(recordId)) {
          translationsMap.set(recordId, {});
        }

        const translations = translationsMap.get(recordId);
        // Copy all text fields from lang record (except id, lang, fk)
        for (const key in langRecord) {
          if (key === 'id' || key === 'lang' || key === fkField) continue;
          if (langRecord[key] !== null && langRecord[key] !== undefined) {
            translations[key] = langRecord[key];
          }
        }
      }

      // Store in cache
      this.i18nCache.set(cacheKey, translationsMap);
    }

    // ✅ FAST MERGE (O(n) dictionary lookup)
    return records.map(record => {
      const translations = translationsMap.get(record.id);
      if (!translations) return record; // No change needed

      // Return new object only if translations exist
      return Object.assign({}, record, translations);
    });
  }

  getSnapshot(options = {}) {
    const lang = options.lang || null;
    const tables = deepClone(this.data);

    const buildUiLabelDictionary = () => {
      const dictionary = {};
      const labelTables = ['sbn_ui_labels', 'ui_labels'];

      const normalizeLang = (value) => {
        if (!value || typeof value !== 'string') return '';
        const normalized = value.trim().toLowerCase();
        return normalized || '';
      };

      const normalizeRow = (row) => {
        if (!row || typeof row !== 'object') return null;
        const key = row.label_key || row.labelKey || row.key;
        const langCode = normalizeLang(row.lang || row.lang_code || row.language || row.locale);
        const text = row.text || row.translation || row.value || row.label_text;
        if (!key || !langCode || typeof text !== 'string') return null;
        const normalizedKey = String(key).trim();
        if (!normalizedKey) return null;
        return { key: normalizedKey, lang: langCode, text };
      };

      const register = (row) => {
        const normalized = normalizeRow(row);
        if (!normalized) return;
        if (!dictionary[normalized.key]) dictionary[normalized.key] = {};

        const targets = [normalized.lang];
        if (normalized.lang.indexOf('-') !== -1) {
          const base = normalized.lang.split('-')[0];
          if (base && targets.indexOf(base) === -1) targets.push(base);
        }

        targets.forEach((locale) => {
          if (locale && !dictionary[normalized.key][locale]) {
            dictionary[normalized.key][locale] = normalized.text;
          }
        });
      };

      labelTables.forEach((tableName) => {
        const rows = Array.isArray(tables[tableName]) ? tables[tableName] : [];
        rows.forEach(register);
      });

      return dictionary;
    };

    // Apply translations if lang is specified
    if (lang) {
      for (const tableName in tables) {
        const records = tables[tableName];
        if (Array.isArray(records)) {
          tables[tableName] = this.decorateWithTranslations(records, tableName, lang);
        }
      }
    }

    return {
      moduleId: this.moduleId,
      branchId: this.branchId,
      version: this.version,
      tables,
      i18n: buildUiLabelDictionary(),
      meta: deepClone(this.meta)
    };
  }

  listTable(tableName) {
    const canonical = this.ensureTable(tableName);
    return this.data[canonical].map((entry) => deepClone(entry));
  }

  insert(tableName, record = {}, context = {}) {
    const canonical = this.ensureTable(tableName);
    const enrichedContext = { branchId: this.branchId, ...context };
    const created = this.schemaEngine.createRecord(canonical, record, enrichedContext);
    this.initializeRecordVersion(canonical, created);
    this.data[canonical].push(created);
    this.version += 1;
    this.touchMeta({ increment: 1 });
    // ✅ Invalidate cache on insert
    this.invalidateI18nCache(canonical);
    return deepClone(created);
  }

  ensureTable(tableName) {
    if (!tableName) throw new Error('Table name is required.');
    const normalized = String(tableName).toLowerCase();
    if (!this.tables.includes(normalized)) {
      // Warn but allow dynamic access to prevent crashes
      // console.warn(`[ModuleStore] Accessing unregistered table: "${tableName}"`);
      if (!this.data[normalized]) {
        this.data[normalized] = [];
      }
    }
    return normalized;
  }

  isVersionedTable(tableName) {
    if (!tableName) return false;
    return this.versionedTables.has(tableName.toLowerCase());
  }

  initializeRecordVersion(tableName, record) {
    if (!record || typeof record !== 'object') return;
    if (this.isVersionedTable(tableName)) {
      if (record.version === undefined || record.version === null) {
        record.version = 1;
      }
    }
  }

  resolveNextVersion(tableName, current, patch, key) {
    // Basic optimistic locking logic could go here
    // For now, we just return null to let updateRecord increment module version
    // If specific record versioning is needed:
    if (this.isVersionedTable(tableName)) {
      const currentVer = Number(current.version) || 1;
      return currentVer + 1;
    }
    return null;
  }

  normalizeVersionInput(version) {
    const v = Number(version);
    return Number.isFinite(v) ? v : null;
  }

  resolvePrimaryKeyFields(tableName) {
    if (this.primaryKeyCache.has(tableName)) {
      return this.primaryKeyCache.get(tableName);
    }
    let fields = [];
    try {
      const table = this.schemaEngine.getTable(tableName);
      fields = Array.isArray(table?.fields)
        ? table.fields.filter((field) => field && field.primaryKey).map((field) => field.name)
        : [];
      if (!fields.length) {
        const hasId = Array.isArray(table?.fields) && table.fields.find((field) => field && field.name === 'id');
        if (hasId) {
          fields = ['id'];
        }
      }
      if (!fields.length && Array.isArray(table?.fields) && table.fields.length) {
        fields = [table.fields[0].name];
      }
    } catch (_err) {
      fields = ['id'];
    }
    if (!fields.length) {
      fields = ['id'];
    }
    this.primaryKeyCache.set(tableName, fields);
    return fields;
  }

  resolveRecordKey(tableName, input = {}, { require = false } = {}) {
    const fields = this.resolvePrimaryKeyFields(tableName);
    const primary = {};
    for (const name of fields) {
      const value = input?.[name];
      if (value === undefined || value === null || value === '') {
        if (require) {
          throw new Error(`Missing primary key field "${name}" for table "${tableName}"`);
        }
        return { key: null, fields, primary };
      }
      primary[name] = value;
    }
    const key = fields.map((name) => String(primary[name])).join('::');
    return { key, fields, primary };
  }

  findRecordIndex(tableName, key) {
    if (!key) return -1;
    const rows = Array.isArray(this.data[tableName]) ? this.data[tableName] : [];
    for (let idx = 0; idx < rows.length; idx += 1) {
      const candidateKey = this.resolveRecordKey(tableName, rows[idx], { require: false }).key;
      if (candidateKey === key) {
        return idx;
      }
    }
    return -1;
  }

  touchMeta(options = {}) {
    const increment = Number(options.increment) || 0;
    this.meta.lastUpdatedAt = nowIso();
    if (increment) {
      this.meta.counter = (this.meta.counter || 0) + increment;
    }
    if (options.recount === true) {
      const total = Object.values(this.data || {}).reduce((acc, value) => {
        if (Array.isArray(value)) return acc + value.length;
        return acc;
      }, 0);
      this.meta.counter = total;
      if ('labCounter' in this.meta) {
        this.meta.labCounter = total;
      }
    } else if (increment && 'labCounter' in this.meta) {
      this.meta.labCounter = (this.meta.labCounter || 0) + increment;
    }
  }

  updateRecord(tableName, patch = {}, context = {}) {
    if (!patch || typeof patch !== 'object') {
      throw new Error('Update payload must be an object.');
    }
    const canonical = this.ensureTable(tableName);
    const { key } = this.resolveRecordKey(canonical, patch, { require: true });
    const index = this.findRecordIndex(canonical, key);
    if (index < 0) {
      throw new Error(`Record not found in table "${tableName}".`);
    }
    const tableDef = this.schemaEngine.getTable(canonical);
    const current = this.data[canonical][index];
    const nextVersion = this.resolveNextVersion(canonical, current, patch, key);
    const next = { ...current };
    for (const field of tableDef.fields || []) {
      const fieldName = field.name;
      if (!Object.prototype.hasOwnProperty.call(patch, fieldName)) continue;
      const value = patch[fieldName];
      if (value === undefined) continue;
      next[fieldName] = this.schemaEngine.coerceValue(field, value);
    }
    const hasUpdatedAt = Array.isArray(tableDef.fields) && tableDef.fields.some((field) => field.name === 'updatedAt');
    if (hasUpdatedAt && !Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) {
      next.updatedAt = nowIso();
    }
    if (nextVersion !== null) {
      next.version = nextVersion;
    }
    this.data[canonical][index] = next;
    this.version += 1;
    this.touchMeta();
    // ✅ Invalidate cache on update
    this.invalidateI18nCache(canonical);
    return deepClone(next);
  }

  merge(tableName, patch = {}, context = {}) {
    return this.updateRecord(tableName, patch, context);
  }

  save(tableName, record = {}, context = {}) {
    const { key } = this.resolveRecordKey(tableName, record, { require: false });
    if (!key) {
      const created = this.insert(tableName, record, context);
      return { record: created, created: true };
    }
    const index = this.findRecordIndex(tableName, key);

    // CRITICAL FIX: Support UPSERT for versioned tables only when explicitly allowed.
    // Default behavior should enforce optimistic concurrency by validating the incoming version.
    // Set context.allowVersion1Upsert = true to enable replace semantics for legacy callers.
    if (index >= 0 && this.isVersionedTable(tableName) && context?.allowVersion1Upsert === true) {
      const incomingVersion = this.normalizeVersionInput(record?.version);
      const currentRecord = this.data[tableName][index];
      const currentVersion = this.normalizeVersionInput(currentRecord?.version) || 1;

      if (incomingVersion === 1) {
        const enrichedContext = { branchId: this.branchId, ...context };
        const replaced = this.schemaEngine.createRecord(tableName, record, enrichedContext);
        this.initializeRecordVersion(tableName, replaced);
        this.data[tableName][index] = replaced;
        this.version += 1;
        this.touchMeta();
        console.log(`[ModuleStore] UPSERT: Replaced ${tableName} record (key=${key}, oldVersion=${currentVersion}, newVersion=1)`);
        // ✅ Invalidate cache on save/upsert
        this.invalidateI18nCache(tableName);
        return { record: deepClone(replaced), created: false, replaced: true };
      }
    }

    if (index < 0) {
      const created = this.insert(tableName, record, context);
      return { record: created, created: true };
    }
    const updated = this.updateRecord(tableName, record, context);
    return { record: updated, created: false };
  }

  remove(tableName, criteria = {}, context = {}) {
    const canonical = this.ensureTable(tableName);
    const { key } = this.resolveRecordKey(canonical, criteria, { require: true });
    const index = this.findRecordIndex(canonical, key);
    if (index < 0) {
      throw new Error(`Record not found in table "${tableName}".`);
    }
    const [removed] = this.data[canonical].splice(index, 1);
    this.version += 1;
    this.touchMeta({ recount: true });
    // ✅ Invalidate cache on remove
    this.invalidateI18nCache(canonical);
    return { record: deepClone(removed), context };
  }

  clearTables(tableNames = []) {
    const normalized = [];
    const seen = new Set();
    if (Array.isArray(tableNames)) {
      for (const entry of tableNames) {
        if (entry === undefined || entry === null) continue;
        const name = String(entry).trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        normalized.push(name);
      }
    }
    if (!normalized.length) {
      return { cleared: [], totalRemoved: 0, changed: false };
    }

    const cleared = [];
    let changed = false;
    let totalRemoved = 0;

    for (const tableName of normalized) {
      if (!this.tables.includes(tableName)) {
        cleared.push({ table: tableName, status: 'skipped', reason: 'table-not-registered' });
        continue;
      }
      const target = Array.isArray(this.data[tableName]) ? this.data[tableName] : [];
      const removed = target.length;
      if (!Array.isArray(this.data[tableName])) {
        this.data[tableName] = [];
      } else if (removed) {
        target.splice(0, target.length);
      }
      if (!removed) {
        cleared.push({ table: tableName, status: 'empty', removed: 0 });
        continue;
      }
      totalRemoved += removed;
      changed = true;
      cleared.push({ table: tableName, status: 'cleared', removed });
      // ✅ Invalidate cache on clear
      this.invalidateI18nCache(tableName);
    }

    if (changed) {
      this.version += 1;
      this.touchMeta({ recount: true });
    }

    return { cleared, totalRemoved, changed };
  }

  restoreTables(tableRecords = {}, options = {}) {
    if (!tableRecords || typeof tableRecords !== 'object') {
      return { restored: [], totalRestored: 0, changed: false, mode: options.mode || 'append' };
    }
    const mode = options.mode === 'replace' ? 'replace' : 'append';
    const restored = [];
    let totalRestored = 0;
    let changed = false;

    const entries = Array.isArray(tableRecords)
      ? tableRecords
      : Object.entries(tableRecords).map(([table, records]) => ({ table, records }));

    for (const entry of entries) {
      const tableName = entry?.table || entry?.name;
      if (typeof tableName !== 'string' || !tableName.trim()) continue;
      const normalizedName = tableName.trim();
      if (!this.tables.includes(normalizedName)) {
        restored.push({ table: normalizedName, restored: 0, skipped: true, reason: 'table-not-registered', mode });
        continue;
      }
      const incoming = Array.isArray(entry?.records) ? entry.records : [];
      const target = Array.isArray(this.data[normalizedName]) ? this.data[normalizedName] : (this.data[normalizedName] = []);
      const result = { table: normalizedName, mode, restored: 0, duplicates: 0, skipped: false };

      if (mode === 'replace') {
        const clones = [];
        for (const record of incoming) {
          if (!record || typeof record !== 'object') continue;
          clones.push(deepClone(record));
        }
        for (const record of clones) {
          this.initializeRecordVersion(normalizedName, record);
        }
        result.restored = clones.length;
        totalRestored += clones.length;
        if (clones.length || target.length) {
          target.splice(0, target.length, ...clones);
          changed = changed || Boolean(clones.length || target.length);
        }
        restored.push(result);
        // ✅ Invalidate cache on restore (replace mode)
        this.invalidateI18nCache(normalizedName);
        continue;
      }

      const existingKeys = new Set();
      for (const row of target) {
        const { key } = this.resolveRecordKey(normalizedName, row, { require: false });
        if (key) existingKeys.add(key);
      }

      for (const record of incoming) {
        if (!record || typeof record !== 'object') continue;
        const clone = deepClone(record);
        this.initializeRecordVersion(normalizedName, clone);
        const { key } = this.resolveRecordKey(normalizedName, clone, { require: false });
        if (key && existingKeys.has(key)) {
          result.duplicates += 1;
          continue;
        }
        if (key) existingKeys.add(key);
        target.push(clone);
        result.restored += 1;
      }
      if (result.restored) {
        totalRestored += result.restored;
        changed = true;
        // ✅ Invalidate cache on restore (append mode)
        this.invalidateI18nCache(normalizedName);
      }
      restored.push(result);
    }

    if (changed) {
      this.version += 1;
      this.touchMeta({ recount: true });
    }

    return { restored, totalRestored, changed, mode };
  }

  getRecordReference(tableName, record = {}) {
    const { key, fields, primary } = this.resolveRecordKey(tableName, record, { require: false });
    const ref = {
      table: tableName,
      key,
      primaryKey: { ...primary }
    };
    if (record && record.id !== undefined) {
      ref.id = record.id;
    }
    if (record && record.uuid !== undefined) {
      ref.uuid = record.uuid;
    }
    if (record && record.uid !== undefined) {
      ref.uid = record.uid;
    }
    if (!key && fields && fields.length === 1) {
      const fieldName = fields[0];
      if (record && record[fieldName] !== undefined) {
        ref.key = String(record[fieldName]);
      }
    }
    return ref;
  }

  replaceTablesFromSnapshot(snapshot = {}, context = {}) {
    if (!snapshot || typeof snapshot !== 'object') return this.getSnapshot();
    const tables = snapshot.tables && typeof snapshot.tables === 'object' ? snapshot.tables : {};
    for (const tableName of this.tables) {
      const incomingRows = Array.isArray(tables[tableName]) ? tables[tableName] : [];
      let tableDefinition = null;
      try {
        tableDefinition = this.schemaEngine.getTable(tableName);
      } catch (_err) {
        tableDefinition = null;
      }
      const primaryFields = Array.isArray(tableDefinition?.fields)
        ? tableDefinition.fields.filter((field) => field && field.primaryKey).map((field) => field.name)
        : [];
      const buildKey = (record) => {
        if (!primaryFields.length || !record || typeof record !== 'object') return null;
        const parts = [];
        for (const fieldName of primaryFields) {
          const value = record[fieldName];
          if (value === undefined || value === null) {
            return null;
          }
          parts.push(String(value));
        }
        return parts.join('::');
      };
      const keyed = new Map();
      const fallback = new Map();
      for (const rawRow of incomingRows) {
        if (!rawRow || typeof rawRow !== 'object') continue;
        const row = deepClone(rawRow);
        const key = buildKey(row);
        if (key) {
          keyed.set(key, row);
          continue;
        }
        let serialized = null;
        try {
          serialized = JSON.stringify(row);
        } catch (_err) {
          serialized = null;
        }
        const fallbackKey = serialized || `row:${fallback.size + keyed.size}`;
        fallback.set(fallbackKey, row);
      }
      const mergedRows = [...keyed.values(), ...fallback.values()];
      for (const row of mergedRows) {
        this.initializeRecordVersion(tableName, row);
      }
      this.data[tableName] = mergedRows;
    }
    const total = Object.values(this.data).reduce((acc, value) => {
      if (Array.isArray(value)) return acc + value.length;
      return acc;
    }, 0);
    const providedVersion = Number(snapshot.version);
    this.version = Number.isFinite(providedVersion) ? providedVersion : this.version + 1;
    const incomingMeta = snapshot.meta && typeof snapshot.meta === 'object' ? deepClone(snapshot.meta) : {};
    const nextMeta = { ...deepClone(this.meta || {}), ...incomingMeta };
    nextMeta.branchId = this.branchId;
    nextMeta.moduleId = this.moduleId;
    nextMeta.lastUpdatedAt = nowIso();
    nextMeta.counter = total;
    if ('labCounter' in nextMeta) {
      nextMeta.labCounter = total;
    } else if (typeof nextMeta.labCounter !== 'number') {
      nextMeta.labCounter = total;
    }
    this.meta = nextMeta;
    return this.getSnapshot();
  }

  reset() {
    this.version = 1;
    this.meta = {
      counter: 0,
      labCounter: 0,
      lastUpdatedAt: nowIso()
    };
    const dataset = this.schemaEngine.createModuleDataset(this.tables);
    this.data = dataset;
    // NOTE: Seed application is now handled by the caller (e.g., resetModule())
    // This allows the caller to use fresh seed data instead of constructor seed
  }

  /**
   * Helper function to find seed data for a table by trying multiple name variations
   * @param {Object} seedTables - The tables object from seed data
   * @param {string} schemaTableName - The canonical table name from schema
   * @returns {*} The seed value if found, undefined otherwise
   */
  findSeedDataForTable(seedTables, schemaTableName) {
    // Try exact match first
    if (seedTables.hasOwnProperty(schemaTableName)) {
      return seedTables[schemaTableName];
    }

    // Generate possible variations
    const variations = new Set();

    // Add plural form (e.g., menu_item -> menu_items)
    variations.add(schemaTableName + 's');

    // Add camelCase variants
    const parts = schemaTableName.split('_');
    if (parts.length > 1) {
      // camelCase singular (e.g., menu_item -> menuItem)
      const camelSingular = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      variations.add(camelSingular);
      // camelCase plural (e.g., menu_item -> menuItems)
      variations.add(camelSingular + 's');
      // PascalCase variants
      const pascalSingular = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      variations.add(pascalSingular);
      variations.add(pascalSingular + 's');
    }

    // Known alias mappings (seed name -> schema name)
    const aliasMap = {
      'items': 'menu_item',
      'drivers': 'delivery_driver',
      'employees': 'employee',
      'categories': 'menu_category',
      'add_ons': 'menu_modifier',
      'removals': 'menu_modifier',
      'stores': 'pos_database',
      'auditEvents': 'audit_event',
      'tableLocks': 'table_lock',
      'reservations': 'reservation',
      'payment_methods': 'payment_method',
      'kitchen_sections': 'kitchen_section',
      'menu_categories': 'menu_category',
      'menu_items': 'menu_item',
      'category_sections': 'category_section',
      'order_types': 'order_type',
      'order_statuses': 'order_status',
      'order_payment_states': 'order_payment_state',
      'order_stages': 'order_stage',
      'order_line_statuses': 'order_line_status'
    };

    // Find reverse mappings (if current table is a target, check for its aliases)
    for (const [alias, target] of Object.entries(aliasMap)) {
      if (target === schemaTableName && seedTables.hasOwnProperty(alias)) {
        return seedTables[alias];
      }
    }

    // Try each variation
    for (const variant of variations) {
      if (seedTables.hasOwnProperty(variant)) {
        return seedTables[variant];
      }
    }

    return undefined;
  }

  applySeed(seed, context = {}) {
    if (!seed || typeof seed !== 'object') return;
    const tables = seed.tables || {};
    let applied = false;
    for (const tableName of this.tables) {
      // Try to find seed data using multiple name variations
      const seedValue = this.findSeedDataForTable(tables, tableName);

      // Support both array format and object format
      let rows = [];
      if (Array.isArray(seedValue)) {
        rows = seedValue;
      } else if (seedValue && typeof seedValue === 'object') {
        // Single object (e.g., settings)
        rows = [seedValue];
      }

      if (!rows.length) continue;
      const target = this.data[tableName];
      if (target.length) continue;

      rows.forEach((row) => {
        // IMPORTANT: Merge original seed data with schema-created record
        // This preserves nested structures like pricing.base, media.image, item_name
        const schemaRecord = this.schemaEngine.createRecord(tableName, row, { branchId: this.branchId, ...context });
        this.initializeRecordVersion(tableName, schemaRecord);

        // Merge: schema fields + original seed fields
        // Original seed data takes precedence for nested objects
        const mergedRecord = {
          ...schemaRecord,
          ...row,  // Keep original nested structures
          // But preserve schema-generated fields
          id: schemaRecord.id || row.id,
          branchId: schemaRecord.branchId,
          createdAt: schemaRecord.createdAt,
          updatedAt: schemaRecord.updatedAt
        };

        target.push(mergedRecord);
        this.meta.counter = (this.meta.counter || 0) + 1;
        this.meta.labCounter = this.meta.counter;
      });
      applied = true;
    }
    if (applied) {
      this.meta.lastUpdatedAt = nowIso();
    }
  }

  /**
   * يقرأ record واحد من الجدول بناءً على الـ primary key
   * مع دعم FK population تلقائياً
   *
   * @param {string} tableName - اسم الجدول
   * @param {string|Object} idOrCriteria - الـ id أو criteria للبحث
   * @param {Object} options - خيارات (populate: true/false)
   * @returns {Object|null} - الـ record أو null إذا لم يوجد
   */
  getRecord(tableName, idOrCriteria, options = {}) {
    const canonical = this.ensureTable(tableName);

    // إذا كان id بسيط، نحوله إلى criteria
    const criteria = typeof idOrCriteria === 'string' || typeof idOrCriteria === 'number'
      ? { id: idOrCriteria }
      : idOrCriteria;

    // نبحث عن الـ record
    const { key } = this.resolveRecordKey(canonical, criteria, { require: false });
    if (!key) {
      return null;
    }

    const index = this.findRecordIndex(canonical, key);
    if (index < 0) {
      return null;
    }

    const record = deepClone(this.data[canonical][index]);

    // FK population إذا مطلوب (default: true)
    const populate = options.populate !== false;
    if (populate) {
      return populateRecordFks(this.schemaEngine, this, canonical, record, options);
    }

    return record;
  }

  /**
   * يقرأ جميع records من جدول مع دعم FK population
   *
   * @param {string} tableName - اسم الجدول
   * @param {Object} options - خيارات (populate: true/false, filter: function)
   * @returns {Array} - مصفوفة من الـ records
   */
  queryTable(tableName, options = {}) {
    const canonical = this.ensureTable(tableName);

    // نقرأ جميع الـ records
    let records = this.data[canonical].map((entry) => deepClone(entry));

    // تطبيق filter إذا موجود
    if (typeof options.filter === 'function') {
      records = records.filter(options.filter);
    }

    // FK population إذا مطلوب (default: true)
    const populate = options.populate !== false;
    if (populate) {
      return populateRecordsFks(this.schemaEngine, this, canonical, records, options);
    }

    return records;
  }

  toJSON() {
    return {
      moduleId: this.moduleId,
      branchId: this.branchId,
      version: this.version,
      tables: deepClone(this.data),
      meta: deepClone(this.meta),
      savedAt: nowIso()
    };
  }
}
