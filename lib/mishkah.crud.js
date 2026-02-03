/**
 * Mishkah Dynamic CRUD Library
 *
 * C# style dynamic CRUD inspired by MAS system
 * - getData(): Returns full structure (columns + data)
 * - save(): Sends modified data back
 * - Auto FK handling with {value, id} structure
 *
 * Usage:
 *   const crud = MishkahCRUD({ branchId: 'dar', moduleId: 'pos' });
 *   const result = await crud.getData('menu_item', { top: 10, page: 1 });
 *   // result = { name, columns, data, count, ... }
 *
 *   result.data[0].name = 'New Name';
 *   await crud.save('menu_item', result);
 */

(function(window) {
  'use strict';

  const M = window.Mishkah || {};

  // ==================== HELPERS ====================

  function clone(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch(e) {}
    }
    return JSON.parse(JSON.stringify(obj));
  }

  function generateId(prefix = 'req') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2,8)}`;
  }

  // ==================== FK HELPERS ====================

  /**
   * Parse FK value from JSON string or object
   * MAS system stores FKs as: '{"value": "الشورب", "id": "CF44B6AE..."}'
   */
  function parseFkValue(value) {
    if (!value) return null;

    // Already an object
    if (typeof value === 'object' && value.id !== undefined) {
      return value;
    }

    // JSON string
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && parsed.id !== undefined) {
          return parsed;
        }
      } catch (e) {}
    }

    // Plain ID value
    return { id: value, value: String(value) };
  }

  /**
   * Stringify FK object for saving
   */
  function stringifyFkValue(obj) {
    if (!obj) return null;
    if (typeof obj !== 'object') return String(obj);
    return JSON.stringify({ value: obj.value || obj.name || obj.id, id: obj.id });
  }

  // ==================== SCHEMA HELPERS ====================

  /**
   * Convert schema columns to definition.json style
   */
  function convertColumnsToSchema(columns) {
    if (!Array.isArray(columns)) return [];

    return columns.map(col => ({
      name: col.name,
      columnName: col.name.toLowerCase(),
      type: mapSqlTypeToSchema(col.type),
      nullable: col.is_nullable !== false,
      primaryKey: col.name === 'ID' || col.name.toLowerCase() === 'id',
      index: col.isreferences || false,
      references: col.isreferences ? {
        table: col.ReferencedTable,
        column: col.ReferencedColumnName || 'id'
      } : null,
      label: col.trans_name || col.name,
      length: col.length || null
    }));
  }

  function mapSqlTypeToSchema(sqlType) {
    if (!sqlType) return 'string';
    const lower = sqlType.toLowerCase();
    if (lower.includes('int')) return 'integer';
    if (lower.includes('decimal') || lower.includes('float') || lower.includes('numeric')) return 'number';
    if (lower.includes('date') || lower.includes('time')) return 'datetime';
    if (lower.includes('bit') || lower.includes('bool')) return 'boolean';
    return 'string';
  }

  // ==================== CRUD CLASS ====================

  class MishkahCRUD {
    constructor(options = {}) {
      this.branchId = options.branchId || 'dar';
      this.moduleId = options.moduleId || 'pos';
      this.store = options.store || null; // Optional: use Mishkah Store for realtime
      this.apiBase = options.apiBase || '/api'; // For REST API fallback

      // Cache
      this.schemaCache = new Map(); // tableName -> columns schema
      this.dataCache = new Map();   // tableName -> data

      // ✨ IndexedDB support
      this.useIndexedDB = options.useIndexedDB !== false;
      this.dbVersion = options.dbVersion || 1;
    }

    /**
     * Get data with full structure (C# style)
     *
     * @param {string} tableName - Table name
     * @param {Object} options - Query options
     * @returns {Promise<Object>} - {name, columns, data, count, ...}
     */
    async getData(tableName, options = {}) {
      const {
        top = 100,
        page = 1,
        cols = null,        // Specific columns to fetch
        filter = null,      // Filter conditions
        populate = true     // Auto-populate FKs
      } = options;

      // Use listTable() directly if store is connected
      if (this.store && this.store.connected) {
        return await this._getDataFromListTable(tableName, options);
      }

      throw new Error('Store not connected. Use connect() first.');
    }

    /**
     * Get data via listTable() - Direct snapshot access
     */
    async _getDataFromListTable(tableName, options) {
      if (!this.store) {
        throw new Error('Store not connected. Use connect() first.');
      }

      const records = this.store.listTable(tableName);
      const columns = this._buildColumnsFromRecords(tableName, records);

      return {
        name: tableName,
        columns,
        data: records,
        count: records.length,
        page: options.page || 1,
        top: options.top || records.length
      };
    }

    /**
     * Build columns metadata from schema (if available)
     */
    _buildColumnsFromSchema(tableName, data) {
      // Try to get from cache
      if (this.schemaCache.has(tableName)) {
        return this.schemaCache.get(tableName);
      }

      // Build from data structure
      return this._buildColumnsFromRecords(tableName, data);
    }

    /**
     * Build columns from actual records (infer types)
     */
    _buildColumnsFromRecords(tableName, records) {
      if (!Array.isArray(records) || records.length === 0) {
        return [];
      }

      const sample = records[0];
      const columns = [];
      let id = 1;

      for (const [key, value] of Object.entries(sample)) {
        // Detect FK
        const isFk = typeof value === 'object' && value !== null && value.id !== undefined;

        columns.push({
          id: id++,
          name: key,
          trans_name: this._humanize(key),
          type: this._inferType(value),
          isreferences: isFk,
          is_nullable: value === null || value === undefined,
          ReferencedTable: isFk ? this._guessReferencedTable(key) : null,
          referenced_column_id: isFk ? 1 : 0,
          ReferencedColumnName: isFk ? 'id' : null,
          search_columns: isFk ? 'name' : null,
          all_columns: null,
          length: typeof value === 'string' ? 255 : 0
        });
      }

      this.schemaCache.set(tableName, columns);
      return columns;
    }

    _inferType(value) {
      if (value === null || value === undefined) return 'nvarchar(255)';
      if (typeof value === 'number') {
        return Number.isInteger(value) ? 'int' : 'decimal(18,2)';
      }
      if (typeof value === 'boolean') return 'bit';
      if (value instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
      if (typeof value === 'object' && value.id) return 'nvarchar(60)'; // FK
      return 'nvarchar(255)';
    }

    _guessReferencedTable(fieldName) {
      // itemId -> menu_item
      // categoryId -> category
      // typeId -> type
      const name = fieldName.replace(/Id$/, '').replace(/_id$/, '');
      return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    }

    _humanize(str) {
      return str
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
    }

    /**
     * Save modified data (C# style)
     *
     * @param {string} tableName - Table name
     * @param {Object} payload - {columns, data, name} structure
     * @returns {Promise<Object>} - Save result
     */
    async save(tableName, payload) {
      if (!Array.isArray(payload.data) || payload.data.length === 0) {
        throw new Error('No data to save');
      }

      // Use store if available
      if (this.store && this.store.connected) {
        return await this._saveToStore(tableName, payload);
      }

      throw new Error('Store not connected');
    }

    /**
     * Save via Mishkah Store (batch)
     */
    async _saveToStore(tableName, payload) {
      const results = [];
      const errors = [];

      for (const record of payload.data) {
        try {
          // Normalize FK fields
          const normalized = this._normalizeFksForSave(record, payload.columns);

          // Save via store
          const result = await this.store.save(tableName, normalized);
          results.push(result);
        } catch (error) {
          errors.push({ record, error: error.message });
        }
      }

      return {
        success: errors.length === 0,
        saved: results.length,
        errors: errors.length,
        results,
        errorDetails: errors
      };
    }

    /**
     * Normalize FKs for save: {value, id} -> 'id' or JSON string
     */
    _normalizeFksForSave(record, columns) {
      const normalized = clone(record);

      for (const col of columns) {
        if (!col.isreferences) continue;

        const value = normalized[col.name];
        if (!value) continue;

        // If it's an object {id, value}, extract id
        if (typeof value === 'object' && value.id !== undefined) {
          normalized[col.name] = value.id;
        }
      }

      return normalized;
    }

    /**
     * Connect to Mishkah Store
     */
    async connect(options = {}) {
      if (!window.createStore) {
        throw new Error('Mishkah Store not loaded. Include mishkah.store.js first.');
      }

      this.store = window.createStore({
        branchId: this.branchId,
        moduleId: this.moduleId,
        useIndexedDB: this.useIndexedDB,
        dbVersion: this.dbVersion,
        ...options
      });

      await this.store.connect();
      return this.store;
    }

    /**
     * Enable IndexedDB caching
     * - Loads data from cache on connect (offline support)
     * - Saves snapshots to IndexedDB automatically
     * - Faster reads with persistent local cache
     *
     * @param {Object} options - IndexedDB options
     * @returns {boolean} - Whether IndexedDB is available
     */
    enableIndexedDB(options = {}) {
      if (!window.MishkahIndexedDB) {
        console.warn('[CRUD] IndexedDB module not loaded. Include mishkah-indexeddb.js first.');
        return false;
      }

      this.useIndexedDB = true;
      this.dbVersion = options.version || options.dbVersion || 1;

      // If already connected, update store settings
      if (this.store) {
        if (!this.store.dbAdapter) {
          this.store.dbAdapter = window.MishkahIndexedDB.createAdapter({
            namespace: this.branchId,
            name: `mishkah-store-${this.moduleId}`,
            version: this.dbVersion,
          });
          console.log('[CRUD] IndexedDB enabled');
        }
      }

      return true;
    }

    /**
     * Get available tables for this branch/module
     */
    async getTables() {
      // Try to read from schema
      if (this.store && this.store.tables) {
        return this.store.tables;
      }

      // Fallback: return cached tables
      return Array.from(this.schemaCache.keys());
    }
  }

  // ==================== EXPORTS ====================

  // Export to Mishkah namespace
  M.CRUD = MishkahCRUD;
  M.createCRUD = function(options) {
    return new MishkahCRUD(options);
  };

  window.Mishkah = M;
  window.MishkahCRUD = MishkahCRUD;
  window.createCRUD = M.createCRUD;

})(typeof window !== 'undefined' ? window : global);
