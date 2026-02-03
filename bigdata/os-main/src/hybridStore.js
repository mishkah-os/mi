import ModuleStore from './database/module-store.js';
import { deepClone } from './utils.js';
import {
  persistRecord as persistSqlRecord,
  deleteRecord as deleteSqlRecord,
  truncateTable as truncateSqlTable,
  loadTableRecords as loadSqlTable,
  replaceTableRecords as replaceSqlTable,
  isManagedTable
} from './database/sqlite-ops.js';

const DEFAULT_CACHE_TTL_MS = Math.max(250, Number(process.env.HYBRID_CACHE_TTL_MS) || 1500);

function normalizePersistedTables(input, fallbackTables) {
  const values = new Set();
  const source = Array.isArray(input) && input.length ? input : fallbackTables;
  for (const entry of source || []) {
    if (!entry) continue;
    const name = String(entry).trim();
    if (!name || !isManagedTable(name)) continue;
    values.add(name);
  }
  return values;
}

export default class HybridStore extends ModuleStore {
  constructor(schemaEngine, branchId, moduleId, definition = {}, seed = {}, seedData = null, options = {}) {
    super(schemaEngine, branchId, moduleId, definition, seed, seedData);
    this.cacheTtlMs = Number.isFinite(Number(options.cacheTtlMs))
      ? Math.max(100, Math.trunc(Number(options.cacheTtlMs)))
      : DEFAULT_CACHE_TTL_MS;
    this.persistedTables = normalizePersistedTables(options.persistedTables, this.tables);
    this.tableCache = new Map();
    this.cacheHits = 0;

    this.bootstrapPersistedTables();
  }

  bootstrapPersistedTables() {
    if (!this.persistedTables || !this.persistedTables.size) {
      return;
    }
    if (!this.tableCache) {
      this.tableCache = new Map();
    }
    const context = { branchId: this.branchId, moduleId: this.moduleId };
    const now = Date.now();
    for (const tableName of this.persistedTables) {
      const persisted = loadSqlTable(tableName, context);
      if (Array.isArray(persisted) && persisted.length) {
        const normalized = [];
        for (const record of persisted) {
          const clone = deepClone(record);
          this.initializeRecordVersion(tableName, clone);
          normalized.push(clone);
        }
        this.data[tableName] = normalized;
        this.tableCache.set(tableName, {
          expiresAt: now + this.cacheTtlMs,
          size: normalized.length,
          loadedAt: now
        });
        continue;
      }

      const current = Array.isArray(this.data?.[tableName]) ? this.data[tableName].map((entry) => deepClone(entry)) : [];
      if (!current.length) {
        continue;
      }

      replaceSqlTable(tableName, current, context);
      this.tableCache.set(tableName, {
        expiresAt: now + this.cacheTtlMs,
        size: current.length,
        loadedAt: now
      });
    }
  }

  createTableBackup(tableName) {
    if (!Array.isArray(this.data?.[tableName])) {
      return { version: this.version, meta: deepClone(this.meta), rows: [] };
    }
    return {
      version: this.version,
      meta: deepClone(this.meta),
      rows: this.data[tableName].map((entry) => deepClone(entry))
    };
  }

  restoreTableBackup(tableName, snapshot) {
    if (!snapshot) return;
    this.version = snapshot.version;
    this.meta = snapshot.meta;
    this.data[tableName] = snapshot.rows.map((entry) => deepClone(entry));
    if (this.tableCache) {
      this.tableCache.delete(tableName);
    }
  }

  refreshTableIfNeeded(tableName, { force = false } = {}) {
    if (!this.persistedTables || !this.persistedTables.has(tableName)) {
      return { refreshed: false, reason: 'non-persisted' };
    }
    const now = Date.now();
    const entry = this.tableCache ? this.tableCache.get(tableName) : null;
    if (!force && entry && entry.expiresAt > now && Array.isArray(this.data?.[tableName])) {
      this.cacheHits += 1;
      return { refreshed: false, reason: 'cache-hit' };
    }
    const records = loadSqlTable(tableName, { branchId: this.branchId, moduleId: this.moduleId });
    const normalized = [];
    for (const record of records) {
      const clone = deepClone(record);
      this.initializeRecordVersion(tableName, clone);
      normalized.push(clone);
    }
    this.data[tableName] = normalized;
    if (this.tableCache) {
      this.tableCache.set(tableName, { expiresAt: now + this.cacheTtlMs, size: normalized.length, loadedAt: now });
    }
    return { refreshed: true, reason: force ? 'forced' : 'expired', size: normalized.length };
  }

  refreshPersistedTables(force = false) {
    const results = [];
    if (!this.persistedTables || typeof this.persistedTables[Symbol.iterator] !== 'function') {
      return results;
    }
    for (const tableName of this.persistedTables) {
      results.push(this.refreshTableIfNeeded(tableName, { force }));
    }
    return results;
  }

  invalidateCache(tableName) {
    if (!this.persistedTables || !this.persistedTables.has(tableName)) return;
    if (!this.tableCache) return; // Cache not initialized yet (during super() constructor call)
    this.tableCache.delete(tableName);
  }

  listTable(tableName) {
    this.refreshTableIfNeeded(tableName);
    return super.listTable(tableName);
  }

  getSnapshot(options = {}) {
    this.refreshPersistedTables();
    const snapshot = super.getSnapshot(options);
    // 🔍 DEBUG: Log job_order counts in snapshot
    if (snapshot.tables) {
      const jobOrderCounts = {
        job_order_header: (snapshot.tables.job_order_header || []).length,
        job_order_detail: (snapshot.tables.job_order_detail || []).length
      };
      if (jobOrderCounts.job_order_header > 0 || jobOrderCounts.job_order_detail > 0) {
        console.log('[HybridStore][getSnapshot] job_order tables:', jobOrderCounts);
      }
    }
    return snapshot;
  }

  toJSON() {
    this.refreshPersistedTables();
    return super.toJSON();
  }

  applySeed(seed, context = {}) {
    super.applySeed(seed, context);
    if (!this.persistedTables || typeof this.persistedTables[Symbol.iterator] !== 'function') {
      this.persistedTables = normalizePersistedTables(null, this.tables);
    }
    for (const tableName of this.persistedTables) {
      const records = Array.isArray(this.data?.[tableName]) ? this.data[tableName].map((entry) => deepClone(entry)) : [];
      if (!records.length) continue;
      replaceSqlTable(tableName, records, { branchId: this.branchId, moduleId: this.moduleId });
      this.invalidateCache(tableName);
    }
  }

  reset() {
    super.reset();
    if (this.persistedTables && typeof this.persistedTables[Symbol.iterator] === 'function') {
      for (const tableName of this.persistedTables) {
        truncateSqlTable(tableName, { branchId: this.branchId, moduleId: this.moduleId });
        this.invalidateCache(tableName);
      }
    }
  }

  insert(tableName, record = {}, context = {}) {
    const backup = this.createTableBackup(tableName);
    this.refreshTableIfNeeded(tableName);
    try {
      const created = super.insert(tableName, record, context);
      this.writeThrough(tableName, created);
      // 🔍 DEBUG: Log job_order inserts
      if (tableName.startsWith('job_order_')) {
        const count = (this.data[tableName] || []).length;
        console.log(`[HybridStore][insert] ${tableName}: now has ${count} records (inserted id: ${created.id})`);
      }
      return created;
    } catch (error) {
      this.restoreTableBackup(tableName, backup);
      throw error;
    }
  }

  merge(tableName, patch = {}, context = {}) {
    const backup = this.createTableBackup(tableName);
    this.refreshTableIfNeeded(tableName);
    try {
      const updated = super.merge(tableName, patch, context);
      this.writeThrough(tableName, updated);
      return updated;
    } catch (error) {
      this.restoreTableBackup(tableName, backup);
      throw error;
    }
  }

  save(tableName, record = {}, context = {}) {
    const backup = this.createTableBackup(tableName);
    this.refreshTableIfNeeded(tableName);
    try {
      const result = super.save(tableName, record, context);
      this.writeThrough(tableName, result.record);
      return result;
    } catch (error) {
      this.restoreTableBackup(tableName, backup);
      throw error;
    }
  }

  remove(tableName, criteria = {}, context = {}) {
    const backup = this.createTableBackup(tableName);
    this.refreshTableIfNeeded(tableName);
    try {
      const removal = super.remove(tableName, criteria, context);
      this.deleteThrough(tableName, removal?.record);
      return removal;
    } catch (error) {
      this.restoreTableBackup(tableName, backup);
      throw error;
    }
  }

  clearTables(tableNames = []) {
    if (Array.isArray(tableNames) && tableNames.length) {
      const refreshTargets = new Set();
      for (const entry of tableNames) {
        if (entry === undefined || entry === null) continue;
        const name = String(entry).trim();
        if (!name || refreshTargets.has(name)) continue;
        refreshTargets.add(name);
        if (!this.tables.includes(name)) continue;
        if (this.persistedTables.has(name)) {
          this.refreshTableIfNeeded(name, { force: true });
        }
      }
    }
    const result = super.clearTables(tableNames);
    if (result && Array.isArray(result.cleared)) {
      for (const entry of result.cleared) {
        if (!entry || entry.skipped) continue;
        this.deleteThrough(entry.table);
      }
    }
    return result;
  }

  restoreTables(tableRecords = {}, options = {}) {
    const result = super.restoreTables(tableRecords, options);
    if (result && Array.isArray(result.restored)) {
      for (const entry of result.restored) {
        if (!entry || entry.skipped) continue;
        const tableName = entry.table;
        if (!this.persistedTables.has(tableName)) continue;
        const records = Array.isArray(this.data?.[tableName]) ? this.data[tableName].map((row) => deepClone(row)) : [];
        replaceSqlTable(tableName, records, { branchId: this.branchId, moduleId: this.moduleId });
        this.invalidateCache(tableName);
      }
    }
    return result;
  }

  writeThrough(tableName, record) {
    if (!record || !this.persistedTables.has(tableName)) {
      return;
    }
    persistSqlRecord(tableName, record, { branchId: this.branchId, moduleId: this.moduleId });
    this.invalidateCache(tableName);
  }

  deleteThrough(tableName, record = null) {
    if (!this.persistedTables.has(tableName)) {
      return;
    }
    if (record && record.id !== undefined && record.id !== null) {
      deleteSqlRecord(tableName, record.id, { branchId: this.branchId, moduleId: this.moduleId });
    } else {
      truncateSqlTable(tableName, { branchId: this.branchId, moduleId: this.moduleId });
    }
    this.invalidateCache(tableName);
  }
}
