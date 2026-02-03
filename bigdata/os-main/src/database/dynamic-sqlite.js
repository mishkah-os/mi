import path from 'path';
import { mkdirSync } from 'fs';
import Database from 'better-sqlite3';
import { loadAllSchemas, mapFieldTypeToSqlite } from './schema-loader.js';

/**
 * Dynamic SQLite system - NO hardcoded tables!
 * Reads schema from definition.json and builds everything dynamically
 */

let database = null;
const statementCache = new Map();
const schemaCache = new Map(); // Cache schema definitions by branch/module

// ==================== UTILITY FUNCTIONS ====================

function normalizeKey(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function normalizeContext(context = {}) {
  const branchId = normalizeKey(context.branchId);
  const moduleId = normalizeKey(context.moduleId);
  if (!branchId || !moduleId) {
    return { branchId: null, moduleId: null };
  }
  return { branchId, moduleId };
}

function resolveDatabasePath(options = {}) {
  if (options.path) return options.path;
  const rootDir = options.rootDir || process.cwd();
  const filename = options.filename || process.env.HYBRID_SQLITE_FILENAME || 'hybrid-store.sqlite';
  const baseDir = options.baseDir || process.env.HYBRID_SQLITE_DIR || path.join(rootDir, 'data');
  return path.join(baseDir, filename);
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

function openDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function getDatabaseInstance() {
  if (!database) {
    return initializeSqlite();
  }
  return database;
}

// ==================== SCHEMA LOADING ====================

/**
 * Load schema definition for a specific branch/module
 */
function getSchemaDefinition(branchId, moduleId) {
  const key = `${branchId}:${moduleId}`;

  if (schemaCache.has(key)) {
    return schemaCache.get(key);
  }

  // Load from definition.json
  const schemas = loadAllSchemas();
  const found = schemas.find(s =>
    s.branchId === branchId && s.moduleId === moduleId
  );

  if (found && found.schema) {
    schemaCache.set(key, found.schema);
    return found.schema;
  }

  return null;
}

/**
 * Get table definition from schema
 */
function getTableDefinition(branchId, moduleId, tableName) {
  const schema = getSchemaDefinition(branchId, moduleId);
  if (!schema || !schema.tables) return null;

  return schema.tables.find(t =>
    (t.sqlName || t.name) === tableName
  );
}

/**
 * Get all indexed fields for a table (for fast queries)
 */
function getIndexedFields(tableDef) {
  if (!tableDef || !tableDef.fields) return [];

  const indexed = [];

  for (const field of tableDef.fields) {
    const columnName = field.columnName || field.name;

    // Add commonly indexed fields
    if (field.primaryKey ||
        field.index ||
        field.unique ||
        columnName === 'id' ||
        columnName.endsWith('_id') ||
        columnName === 'status' ||
        columnName === 'stage' ||
        columnName === 'created_at' ||
        columnName === 'updated_at') {

      const sqlType = mapFieldTypeToSqlite(field.type);
      indexed.push({
        name: field.name,
        columnName,
        sqlType,
        nullable: field.nullable !== false,
        primaryKey: field.primaryKey === true
      });
    }
  }

  return indexed;
}

// ==================== DYNAMIC ROW BUILDER ====================

/**
 * Build a row object from a record - FULLY DYNAMIC
 * Works with ANY table based on its schema definition
 */
function buildRow(tableName, record = {}, context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error(`${tableName} requires branchId and moduleId in context`);
  }

  // 🔍 DEBUG: Log full record for order_line
  if (tableName === 'order_line') {
    console.log('[dynamic-sqlite][buildRow] 🔍 FULL RECORD:', {
      recordKeys: Object.keys(record),
      itemId: record.itemId,
      item_id: record.item_id,
      Item_Id: record.Item_Id,
      fullRecord: JSON.stringify(record, null, 2)
    });
  }

  const tableDef = getTableDefinition(
    normalizedContext.branchId,
    normalizedContext.moduleId,
    tableName
  );

  if (!tableDef) {
    throw new Error(`Table definition not found: ${tableName} for ${normalizedContext.branchId}/${normalizedContext.moduleId}`);
  }

  const row = {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    payload: JSON.stringify(record)
  };

  // Extract indexed fields dynamically
  const indexedFields = getIndexedFields(tableDef);

  for (const field of indexedFields) {
    const fieldName = field.name;
    const columnName = field.columnName;

    // 🔍 DEBUG: Log column names for item_id
    if (tableName === 'order_line' && fieldName.toLowerCase().includes('item')) {
      console.log('[dynamic-sqlite][buildRow] 🔍', {
        tableName,
        fieldName,
        columnName,
        recordValue: record[fieldName],
        recordColumnValue: record[columnName]
      });
    }

    // Try to get value from both camelCase and snake_case
    let value = record[fieldName];
    if ((value === undefined || value === null) && columnName !== fieldName) {
      value = record[columnName];
    }

    // Convert to appropriate type
    if (value !== undefined && value !== null && value !== '') {
      // ✅ Safety: If value is an object, convert to JSON string (prevents [object Object])
      if (typeof value === 'object' && !Array.isArray(value)) {
        value = JSON.stringify(value);
      }

      if (field.sqlType === 'INTEGER') {
        value = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : null;
      } else if (field.sqlType === 'REAL') {
        value = Number.isFinite(Number(value)) ? Number(value) : null;
      } else {
        value = String(value);
      }
    } else {
      value = null;
    }

    row[columnName] = value;
  }

  // Add version for versioned tables
  if (record.version !== undefined) {
    row.version = Number.isFinite(Number(record.version)) ? Math.trunc(Number(record.version)) : 1;
  }

  return row;
}

// ==================== DYNAMIC SQL BUILDER ====================

/**
 * Build INSERT/UPDATE statement dynamically for any table
 */
function buildUpsertSQL(tableName, tableDef) {
  const indexedFields = getIndexedFields(tableDef);
  const columns = ['branch_id', 'module_id'];
  const values = ['@branch_id', '@module_id'];
  const updates = [];

  // Build columns and values dynamically
  for (const field of indexedFields) {
    const col = field.columnName;
    columns.push(col);
    values.push(`@${col}`);

    if (!field.primaryKey) {
      updates.push(`${col} = excluded.${col}`);
    }
  }

  // Always include payload and version
  columns.push('payload');
  values.push('@payload');
  updates.push('payload = excluded.payload');

  if (tableDef.fields.some(f => f.name === 'version')) {
    columns.push('version');
    values.push('@version');
    updates.push('version = excluded.version');
  }

  // Find primary key
  const pkFields = indexedFields.filter(f => f.primaryKey);
  const pkColumns = pkFields.length > 0
    ? pkFields.map(f => f.columnName)
    : ['branch_id', 'module_id', 'id'];

  const sql = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${values.join(', ')})
    ON CONFLICT(${pkColumns.join(', ')}) DO UPDATE SET
      ${updates.join(',\n      ')}
  `.trim();

  return sql;
}

/**
 * Build SELECT statement dynamically
 */
function buildLoadSQL(tableName, tableDef) {
  const indexedFields = getIndexedFields(tableDef);
  const selectColumns = indexedFields.map(f => f.columnName);

  // Always include payload
  selectColumns.push('payload');

  const sql = `
    SELECT ${selectColumns.join(', ')}
    FROM ${tableName}
    WHERE branch_id = ? COLLATE NOCASE
      AND module_id = ? COLLATE NOCASE
    ORDER BY updated_at DESC
  `.trim();

  return sql;
}

// ==================== DYNAMIC STATEMENT CACHE ====================

/**
 * Get or create prepared statements for a table - FULLY DYNAMIC
 */
function getStatements(tableName, context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    return null;
  }

  const cacheKey = `${normalizedContext.branchId}:${normalizedContext.moduleId}:${tableName}`;

  if (statementCache.has(cacheKey)) {
    return statementCache.get(cacheKey);
  }

  const tableDef = getTableDefinition(
    normalizedContext.branchId,
    normalizedContext.moduleId,
    tableName
  );

  if (!tableDef) {
    console.warn(`Table definition not found: ${tableName}`);
    return null;
  }

  const db = getDatabaseInstance();

  try {
    const statements = {
      upsert: db.prepare(buildUpsertSQL(tableName, tableDef)),
      remove: db.prepare(`
        DELETE FROM ${tableName}
        WHERE branch_id = @branch_id COLLATE NOCASE
          AND module_id = @module_id COLLATE NOCASE
          AND id = @id
      `),
      truncate: db.prepare(`
        DELETE FROM ${tableName}
        WHERE branch_id = @branch_id COLLATE NOCASE
          AND module_id = @module_id COLLATE NOCASE
      `),
      load: db.prepare(buildLoadSQL(tableName, tableDef))
    };

    statementCache.set(cacheKey, statements);
    return statements;
  } catch (error) {
    console.error(`Failed to create statements for ${tableName}:`, error.message);
    return null;
  }
}

// ==================== TABLE MANAGEMENT ====================

/**
 * Check if a table is managed (exists in schema definition)
 */
export function isManagedTable(tableName, context = {}) {
  const normalizedContext = normalizeContext(context);

  // If no context, check if table exists in ANY schema
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    const allSchemas = loadAllSchemas();
    for (const { schema } of allSchemas) {
      if (schema && schema.tables) {
        const found = schema.tables.find(t =>
          (t.sqlName || t.name) === tableName
        );
        if (found) return true;
      }
    }
    return false;
  }

  // Check specific branch/module
  const tableDef = getTableDefinition(
    normalizedContext.branchId,
    normalizedContext.moduleId,
    tableName
  );

  return tableDef != null;
}

// ==================== CRUD OPERATIONS ====================

export function persistRecord(tableName, record, context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('persistRecord requires branchId and moduleId');
  }

  const statements = getStatements(tableName, normalizedContext);
  if (!statements) {
    throw new Error(`Cannot persist record to ${tableName}: statements not available`);
  }

  try {
    const row = buildRow(tableName, record, normalizedContext);
    statements.upsert.run(row);
    return true;
  } catch (error) {
    console.error(`Failed to persist record to ${tableName}:`, error.message);
    throw error;
  }
}

export function deleteRecord(tableName, key, context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;

  const statements = getStatements(tableName, normalizedContext);
  if (!statements) return false;

  try {
    statements.remove.run({
      branch_id: normalizedContext.branchId,
      module_id: normalizedContext.moduleId,
      id: String(key)
    });
    return true;
  } catch (error) {
    console.error(`Failed to delete record from ${tableName}:`, error.message);
    return false;
  }
}

export function truncateTable(tableName, context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;

  const statements = getStatements(tableName, normalizedContext);
  if (!statements) return false;

  try {
    statements.truncate.run({
      branch_id: normalizedContext.branchId,
      module_id: normalizedContext.moduleId
    });
    return true;
  } catch (error) {
    console.error(`Failed to truncate table ${tableName}:`, error.message);
    return false;
  }
}

export function loadTableRecords(tableName, context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return [];

  const statements = getStatements(tableName, normalizedContext);
  if (!statements) return [];

  const tableDef = getTableDefinition(
    normalizedContext.branchId,
    normalizedContext.moduleId,
    tableName
  );

  if (!tableDef) return [];

  try {
    const rows = statements.load.all(normalizedContext.branchId, normalizedContext.moduleId);
    const records = [];
    const indexedFields = getIndexedFields(tableDef);

    for (const row of rows) {
      if (!row || typeof row.payload !== 'string') continue;

      try {
        const parsed = JSON.parse(row.payload);
        if (parsed && typeof parsed === 'object') {
          // Merge indexed fields from columns back into record
          for (const field of indexedFields) {
            const columnName = field.columnName;
            if (row[columnName] != null && row[columnName] !== '') {
              parsed[field.name] = row[columnName];
              if (columnName !== field.name) {
                parsed[columnName] = row[columnName];
              }
            }
          }

          records.push(parsed);
        }
      } catch (error) {
        // ignore malformed rows
      }
    }

    return records;
  } catch (error) {
    console.error(`Failed to load records from ${tableName}:`, error.message);
    return [];
  }
}

export function replaceTableRecords(tableName, records = [], context = {}) {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;

  const statements = getStatements(tableName, normalizedContext);
  if (!statements) return false;

  const db = getDatabaseInstance();

  try {
    const tx = db.transaction(() => {
      statements.truncate.run({
        branch_id: normalizedContext.branchId,
        module_id: normalizedContext.moduleId
      });

      for (const record of records) {
        const row = buildRow(tableName, record, normalizedContext);
        statements.upsert.run(row);
      }
    });

    tx();
    return true;
  } catch (error) {
    console.error(`Failed to replace records in ${tableName}:`, error.message);
    return false;
  }
}

// ==================== INITIALIZATION ====================

export function initializeSqlite(options = {}) {
  if (database) return database;

  const dbPath = resolveDatabasePath(options);
  ensureDirectory(dbPath);
  database = openDatabase(dbPath);

  // Tables are created dynamically by migration system
  // No hardcoded CREATE TABLE statements!

  return database;
}

export function getDatabase() {
  return getDatabaseInstance();
}

export function withTransaction(fn) {
  const db = getDatabaseInstance();
  const tx = db.transaction(fn);
  return (...args) => tx(...args);
}

export default {
  initializeSqlite,
  getDatabase,
  isManagedTable,
  persistRecord,
  deleteRecord,
  truncateTable,
  loadTableRecords,
  replaceTableRecords,
  withTransaction
};
