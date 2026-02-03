/**
 * SQL Query Builder for Mishkah Store
 *
 * Provides secure, parameterized SQL query building with:
 * - Table/column whitelisting (SQL injection prevention)
 * - Query optimization
 * - Support for WHERE, ORDER BY, LIMIT, OFFSET
 * - Future: JOIN, GROUP BY, HAVING support
 *
 * @module queryBuilder
 */

import { getDatabase } from './database/sqlite-ops.js';
import logger from './logger.js';

// Whitelist of queryable tables (security)
const QUERYABLE_TABLES = new Set([
  'order_header',
  'order_line',
  'order_payment',
  'pos_shift',
  'menu_item',
  'menu_category',
  'menu_modifier',
  'kitchen_section',
  'employee',
  'payment_method',
  'order_status',
  'order_stage',
  'order_payment_state',
  'order_line_status',
  'table_lock',
  'reservation',
  'audit_event'
]);

// Whitelist of allowed columns per table
const ALLOWED_COLUMNS = {
  order_header: [
    'id', 'invoice_number', 'shift_id', 'status', 'stage', 'payment_state',
    'total', 'subtotal', 'tax', 'discount', 'tip', 'created_at', 'updated_at',
    'version', 'branch_id', 'module_id', 'customer_name', 'table_number',
    'order_type', 'notes'
  ],
  order_line: [
    'id', 'order_id', 'item_id', 'quantity', 'status', 'stage', 'price',
    'subtotal', 'tax', 'discount', 'created_at', 'updated_at', 'version',
    'branch_id', 'module_id', 'notes', 'station_id'
  ],
  order_payment: [
    'id', 'order_id', 'method', 'amount', 'captured_at', 'status',
    'branch_id', 'module_id', 'created_at', 'updated_at'
  ],
  pos_shift: [
    'id', 'pos_id', 'status', 'is_closed', 'opened_at', 'closed_at',
    'updated_at', 'branch_id', 'module_id', 'opening_balance',
    'closing_balance', 'expected_cash', 'actual_cash'
  ],
  menu_item: ['*'], // Allow all columns for master data
  menu_category: ['*'],
  menu_modifier: ['*'],
  kitchen_section: ['*'],
  employee: ['*'],
  payment_method: ['*'],
  order_status: ['*'],
  order_stage: ['*'],
  order_payment_state: ['*'],
  order_line_status: ['*'],
  table_lock: ['*'],
  reservation: ['*'],
  audit_event: ['*']
};

// Allowed operators for WHERE clause
const ALLOWED_OPERATORS = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  'LIKE': 'LIKE',
  'NOT LIKE': 'NOT LIKE',
  'IN': 'IN',
  'NOT IN': 'NOT IN',
  'IS NULL': 'IS NULL',
  'IS NOT NULL': 'IS NOT NULL',
  'BETWEEN': 'BETWEEN'
};

/**
 * Query Builder class
 */
export class QueryBuilder {
  constructor(context = {}) {
    this.branchId = context.branchId;
    this.moduleId = context.moduleId;
    this.tableName = null;
    this.selectFields = [];
    this.whereConditions = [];
    this.orderByFields = [];
    this.limitValue = null;
    this.offsetValue = null;
    this.params = [];
    this.errors = [];
  }

  /**
   * Set table name
   * @param {string} name - Table name
   * @returns {QueryBuilder} - Chainable
   */
  table(name) {
    if (!name || typeof name !== 'string') {
      this.errors.push('Table name must be a non-empty string');
      return this;
    }

    const normalized = String(name).trim().toLowerCase();
    if (!QUERYABLE_TABLES.has(normalized)) {
      this.errors.push(`Table "${name}" is not queryable. Allowed tables: ${Array.from(QUERYABLE_TABLES).join(', ')}`);
      return this;
    }

    this.tableName = normalized;
    return this;
  }

  /**
   * Set SELECT fields
   * @param {Array<string>} fields - Column names (or ['*'] for all)
   * @returns {QueryBuilder} - Chainable
   */
  select(fields) {
    if (!fields || !Array.isArray(fields)) {
      this.errors.push('SELECT fields must be an array');
      return this;
    }

    if (!this.tableName) {
      this.errors.push('Must call table() before select()');
      return this;
    }

    const allowedFields = ALLOWED_COLUMNS[this.tableName] || [];
    const allowAll = allowedFields.includes('*');

    for (const field of fields) {
      if (field === '*') {
        this.selectFields = ['*'];
        return this;
      }

      if (!allowAll && !allowedFields.includes(field)) {
        this.errors.push(`Column "${field}" not allowed for table "${this.tableName}"`);
        continue;
      }

      this.selectFields.push(field);
    }

    return this;
  }

  /**
   * Add WHERE conditions
   * @param {Object} conditions - { field: value } or { field: { operator, value } }
   * @returns {QueryBuilder} - Chainable
   */
  where(conditions) {
    if (!conditions || typeof conditions !== 'object') {
      this.errors.push('WHERE conditions must be an object');
      return this;
    }

    if (!this.tableName) {
      this.errors.push('Must call table() before where()');
      return this;
    }

    const allowedFields = ALLOWED_COLUMNS[this.tableName] || [];
    const allowAll = allowedFields.includes('*');

    for (const [field, value] of Object.entries(conditions)) {
      if (!allowAll && !allowedFields.includes(field)) {
        this.errors.push(`Column "${field}" not allowed in WHERE clause`);
        continue;
      }

      // Handle complex operators: { field: { operator: '>', value: 100 } }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const { operator, value: operandValue } = value;
        const op = (operator || '=').toUpperCase();

        if (!ALLOWED_OPERATORS[op]) {
          this.errors.push(`Operator "${op}" not allowed`);
          continue;
        }

        if (op === 'IS NULL' || op === 'IS NOT NULL') {
          this.whereConditions.push(`${field} ${op}`);
        } else if (op === 'BETWEEN') {
          if (!Array.isArray(operandValue) || operandValue.length !== 2) {
            this.errors.push('BETWEEN operator requires array of 2 values');
            continue;
          }
          this.whereConditions.push(`${field} BETWEEN ? AND ?`);
          this.params.push(operandValue[0], operandValue[1]);
        } else if (op === 'IN' || op === 'NOT IN') {
          if (!Array.isArray(operandValue) || operandValue.length === 0) {
            this.errors.push(`${op} operator requires non-empty array`);
            continue;
          }
          const placeholders = operandValue.map(() => '?').join(',');
          this.whereConditions.push(`${field} ${op} (${placeholders})`);
          this.params.push(...operandValue);
        } else {
          this.whereConditions.push(`${field} ${op} ?`);
          this.params.push(operandValue);
        }
        continue;
      }

      // Simple equality: { field: value }
      if (Array.isArray(value)) {
        // Array = IN clause
        if (value.length === 0) {
          this.errors.push(`Empty array for field "${field}"`);
          continue;
        }
        const placeholders = value.map(() => '?').join(',');
        this.whereConditions.push(`${field} IN (${placeholders})`);
        this.params.push(...value);
      } else if (value === null) {
        this.whereConditions.push(`${field} IS NULL`);
      } else {
        this.whereConditions.push(`${field} = ?`);
        this.params.push(value);
      }
    }

    return this;
  }

  /**
   * Add ORDER BY clause
   * @param {Array<Object>} fields - [{ field, direction }]
   * @returns {QueryBuilder} - Chainable
   */
  orderBy(fields) {
    if (!fields || !Array.isArray(fields)) {
      this.errors.push('ORDER BY fields must be an array');
      return this;
    }

    if (!this.tableName) {
      this.errors.push('Must call table() before orderBy()');
      return this;
    }

    const allowedFields = ALLOWED_COLUMNS[this.tableName] || [];
    const allowAll = allowedFields.includes('*');

    for (const item of fields) {
      if (!item || typeof item !== 'object') {
        this.errors.push('ORDER BY item must be an object');
        continue;
      }

      const { field, direction = 'ASC' } = item;

      if (!allowAll && !allowedFields.includes(field)) {
        this.errors.push(`Column "${field}" not allowed in ORDER BY`);
        continue;
      }

      const dir = String(direction).toUpperCase();
      if (dir !== 'ASC' && dir !== 'DESC') {
        this.errors.push(`Invalid direction "${direction}" (must be ASC or DESC)`);
        continue;
      }

      this.orderByFields.push(`${field} ${dir}`);
    }

    return this;
  }

  /**
   * Set LIMIT
   * @param {number} value - Max rows to return
   * @returns {QueryBuilder} - Chainable
   */
  limit(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      this.errors.push('LIMIT must be a non-negative number');
      return this;
    }

    // Max 1000 rows for safety
    this.limitValue = Math.min(Math.floor(num), 1000);
    return this;
  }

  /**
   * Set OFFSET
   * @param {number} value - Rows to skip
   * @returns {QueryBuilder} - Chainable
   */
  offset(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      this.errors.push('OFFSET must be a non-negative number');
      return this;
    }

    this.offsetValue = Math.floor(num);
    return this;
  }

  /**
   * Build SQL query string
   * @returns {{ sql: string, params: Array }} - Query and parameters
   */
  build() {
    if (this.errors.length > 0) {
      throw new Error(`Query validation failed: ${this.errors.join('; ')}`);
    }

    if (!this.tableName) {
      throw new Error('Table name is required');
    }

    // SELECT clause
    const selectClause = this.selectFields.length > 0
      ? `SELECT ${this.selectFields.join(', ')}`
      : 'SELECT *';

    // FROM clause
    const fromClause = `FROM ${this.tableName}`;

    // WHERE clause (always include branch_id and module_id if provided)
    const baseWhere = [];
    const baseParams = [];

    if (this.branchId) {
      baseWhere.push('branch_id = ? COLLATE NOCASE');
      baseParams.push(this.branchId);
    }

    if (this.moduleId) {
      baseWhere.push('module_id = ? COLLATE NOCASE');
      baseParams.push(this.moduleId);
    }

    const allWhere = [...baseWhere, ...this.whereConditions];
    const whereClause = allWhere.length > 0
      ? `WHERE ${allWhere.join(' AND ')}`
      : '';

    // ORDER BY clause
    const orderClause = this.orderByFields.length > 0
      ? `ORDER BY ${this.orderByFields.join(', ')}`
      : '';

    // LIMIT clause
    const limitClause = this.limitValue !== null
      ? `LIMIT ${this.limitValue}`
      : '';

    // OFFSET clause
    const offsetClause = this.offsetValue !== null
      ? `OFFSET ${this.offsetValue}`
      : '';

    // Combine all clauses
    const sql = [
      selectClause,
      fromClause,
      whereClause,
      orderClause,
      limitClause,
      offsetClause
    ].filter(Boolean).join('\n');

    return {
      sql,
      params: [...baseParams, ...this.params]
    };
  }

  /**
   * Execute query and return results
   * @returns {{ table: string, rows: Array, meta: Object }} - Query results
   */
  execute() {
    const { sql, params } = this.build();
    const db = getDatabase({ branchId: this.branchId, moduleId: this.moduleId });

    const startTime = Date.now();

    try {
      // Execute query
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);

      // Measure query time
      const queryTime = Date.now() - startTime;

      // Log slow queries (>100ms)
      if (queryTime > 100) {
        logger.warn({
          table: this.tableName,
          queryTime,
          rowCount: rows.length,
          sql: sql.substring(0, 200), // First 200 chars
        }, 'Slow query detected');
      }

      // Parse JSON payload column if exists
      const parsedRows = rows.map(row => {
        if (row.payload && typeof row.payload === 'string') {
          try {
            return JSON.parse(row.payload);
          } catch (err) {
            logger.warn({ err, rowId: row.id }, 'Failed to parse payload');
            return row;
          }
        }
        return row;
      });

      return {
        table: this.tableName,
        rows: parsedRows,
        meta: {
          count: parsedRows.length,
          queryTime,
          hasMore: this.limitValue !== null && parsedRows.length === this.limitValue,
          sql: sql.substring(0, 200) // Include truncated SQL for debugging
        }
      };
    } catch (error) {
      logger.error({ err: error, sql, params }, 'Query execution failed');
      throw error;
    }
  }
}

/**
 * Factory function to create QueryBuilder
 * @param {Object} context - { branchId, moduleId }
 * @returns {QueryBuilder} - New query builder instance
 */
export function createQuery(context) {
  return new QueryBuilder(context);
}

/**
 * Execute raw SQL query (for admin/debugging only)
 * WARNING: Use with caution - no SQL injection protection
 *
 * @param {string} sql - Raw SQL query
 * @param {Array} params - Query parameters
 * @param {Object} context - { branchId, moduleId }
 * @returns {{ rows: Array, meta: Object }} - Query results
 */
export function executeRawQuery(sql, params = [], context = {}) {
  const db = getDatabase(context);
  const startTime = Date.now();

  try {
    // Basic SQL injection check (block dangerous keywords)
    const normalized = sql.toLowerCase();
    const dangerous = ['drop', 'delete', 'truncate', 'insert', 'update', 'alter', 'create'];
    for (const keyword of dangerous) {
      if (normalized.includes(keyword)) {
        throw new Error(`Raw query contains dangerous keyword: ${keyword}`);
      }
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    const queryTime = Date.now() - startTime;

    logger.info({
      sql: sql.substring(0, 200),
      rowCount: rows.length,
      queryTime,
      branchId: context.branchId,
      moduleId: context.moduleId
    }, 'Raw query executed');

    return {
      rows,
      meta: {
        count: rows.length,
        queryTime,
        sql: sql.substring(0, 200)
      }
    };
  } catch (error) {
    logger.error({ err: error, sql, params }, 'Raw query execution failed');
    throw error;
  }
}

/**
 * Get database schema information
 * @returns {{ tables: Array<Object> }} - Schema metadata
 */
export function getDatabaseSchema(context = {}) {
  const db = getDatabase(context);

  try {
    const tablesQuery = db.prepare(`
      SELECT name, type, sql, tbl_name AS tableName
      FROM sqlite_master
      WHERE type IN ('table', 'view')
      ORDER BY name
    `);
    const tables = tablesQuery.all();

    const schema = tables.map(table => {
      const safeName = String(table.name).replace(/'/g, "''");
      let columns = [];
      let indexes = [];

      try {
        const columnsQuery = db.prepare(`PRAGMA table_info('${safeName}')`);
        columns = columnsQuery.all();
      } catch (error) {
        columns = [];
      }

      try {
        const indexesQuery = db.prepare(`PRAGMA index_list('${safeName}')`);
        indexes = indexesQuery.all();
      } catch (error) {
        indexes = [];
      }

      return {
        name: table.name,
        type: table.type,
        tableName: table.tableName,
        createStatement: table.sql,
        columns: columns.map(col => ({
          id: col.cid,
          name: col.name,
          type: col.type,
          notNull: Boolean(col.notnull),
          defaultValue: col.dflt_value,
          primaryKey: Boolean(col.pk)
        })),
        indexes: indexes.map(idx => ({
          name: idx.name,
          unique: Boolean(idx.unique),
          origin: idx.origin,
          partial: Boolean(idx.partial)
        }))
      };
    });

    const triggersQuery = db.prepare(`
      SELECT name, tbl_name AS tableName, sql, type
      FROM sqlite_master
      WHERE type = 'trigger'
      ORDER BY name
    `);
    const triggers = triggersQuery.all().map(trigger => ({
      name: trigger.name,
      tableName: trigger.tableName,
      type: trigger.type,
      createStatement: trigger.sql
    }));

    const rawIndexesQuery = db.prepare(`
      SELECT name, tbl_name AS tableName, sql, type
      FROM sqlite_master
      WHERE type = 'index' AND sql IS NOT NULL
      ORDER BY name
    `);
    const rawIndexes = rawIndexesQuery.all().map(index => ({
      name: index.name,
      tableName: index.tableName,
      type: index.type,
      createStatement: index.sql
    }));

    const columnsByTable = {};
    schema.forEach(entry => {
      columnsByTable[entry.name] = entry.columns;
    });

    return {
      tables: schema,
      triggers,
      indexes: rawIndexes,
      functions: [],
      procedures: [],
      columnsByTable
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get database schema');
    throw error;
  }
}
