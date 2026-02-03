import { mapFieldTypeToSqlite } from './schema-loader.js';

/**
 * Schema validator for comparing actual SQLite schema with definition.json
 */

/**
 * Get the actual schema from SQLite database
 */
export function getActualTableSchema(db, tableName) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns;
  } catch (error) {
    console.error(`Error getting schema for table ${tableName}:`, error.message);
    return null;
  }
}

/**
 * Check if a table exists in SQLite database
 */
export function tableExists(db, tableName) {
  try {
    const result = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName);
    return !!result;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error.message);
    return false;
  }
}

/**
 * Normalize SQLite type for comparison
 */
function normalizeSqliteType(sqliteType) {
  const normalized = String(sqliteType).toUpperCase().trim();

  // Handle types with parameters like VARCHAR(255)
  const baseType = normalized.split('(')[0].trim();

  // Map all variations to standard SQLite types
  const typeMap = {
    VARCHAR: 'TEXT',
    CHAR: 'TEXT',
    CHARACTER: 'TEXT',
    NCHAR: 'TEXT',
    NVARCHAR: 'TEXT',
    CLOB: 'TEXT',
    INT: 'INTEGER',
    BIGINT: 'INTEGER',
    SMALLINT: 'INTEGER',
    TINYINT: 'INTEGER',
    MEDIUMINT: 'INTEGER',
    DECIMAL: 'REAL',
    NUMERIC: 'REAL',
    FLOAT: 'REAL',
    DOUBLE: 'REAL'
  };

  return typeMap[baseType] || baseType;
}

/**
 * Compare two column definitions
 */
export function compareColumns(actualColumn, expectedColumn) {
  const differences = [];

  const actualType = normalizeSqliteType(actualColumn.type);
  const expectedType = normalizeSqliteType(expectedColumn.sqlType);

  // Check type mismatch
  if (actualType !== expectedType) {
    differences.push({
      type: 'TYPE_MISMATCH',
      columnName: actualColumn.name,
      actual: actualType,
      expected: expectedType,
      severity: 'HIGH'
    });
  }

  // Check nullable mismatch
  const actualNullable = actualColumn.notnull === 0;
  const expectedNullable = expectedColumn.nullable !== false;

  if (actualNullable !== expectedNullable) {
    differences.push({
      type: 'NULLABLE_MISMATCH',
      columnName: actualColumn.name,
      actual: actualNullable ? 'NULL' : 'NOT NULL',
      expected: expectedNullable ? 'NULL' : 'NOT NULL',
      severity: 'MEDIUM'
    });
  }

  // Check primary key mismatch
  const actualPk = actualColumn.pk === 1;
  const expectedPk = expectedColumn.primaryKey === true;

  if (actualPk !== expectedPk) {
    differences.push({
      type: 'PRIMARY_KEY_MISMATCH',
      columnName: actualColumn.name,
      actual: actualPk,
      expected: expectedPk,
      severity: 'HIGH'
    });
  }

  return differences;
}

/**
 * Validate a table schema against its definition
 */
export function validateTableSchema(db, tableName, expectedColumns) {
  const validation = {
    tableName,
    exists: false,
    differences: [],
    missingColumns: [],
    extraColumns: [],
    typeMismatches: [],
    summary: {
      isValid: true,
      totalIssues: 0,
      highSeverity: 0,
      mediumSeverity: 0,
      lowSeverity: 0
    }
  };

  // Check if table exists
  if (!tableExists(db, tableName)) {
    validation.exists = false;
    validation.summary.isValid = false;
    validation.differences.push({
      type: 'TABLE_MISSING',
      severity: 'HIGH',
      message: `Table ${tableName} does not exist in database`
    });
    validation.summary.totalIssues++;
    validation.summary.highSeverity++;
    return validation;
  }

  validation.exists = true;

  // Get actual schema
  const actualColumns = getActualTableSchema(db, tableName);
  if (!actualColumns) {
    validation.summary.isValid = false;
    return validation;
  }

  // Create maps for easier comparison
  const actualColumnMap = new Map();
  actualColumns.forEach(col => {
    actualColumnMap.set(col.name.toLowerCase(), col);
  });

  const expectedColumnMap = new Map();
  expectedColumns.forEach(col => {
    expectedColumnMap.set(col.columnName.toLowerCase(), col);
  });

  // Check for missing columns (in definition but not in DB)
  for (const [columnName, expectedCol] of expectedColumnMap) {
    if (!actualColumnMap.has(columnName)) {
      validation.missingColumns.push({
        type: 'COLUMN_MISSING',
        columnName: expectedCol.columnName,
        expectedType: expectedCol.sqlType,
        severity: 'HIGH'
      });
      validation.summary.highSeverity++;
      validation.summary.totalIssues++;
      validation.summary.isValid = false;
    }
  }

  // Check for extra columns (in DB but not in definition)
  for (const [columnName, actualCol] of actualColumnMap) {
    if (!expectedColumnMap.has(columnName)) {
      // Skip system columns
      if (columnName === 'branch_id' || columnName === 'module_id' || columnName === 'payload' || columnName === 'version') {
        continue;
      }

      validation.extraColumns.push({
        type: 'COLUMN_EXTRA',
        columnName: actualCol.name,
        actualType: actualCol.type,
        severity: 'LOW'
      });
      validation.summary.lowSeverity++;
      validation.summary.totalIssues++;
    }
  }

  // Compare columns that exist in both
  for (const [columnName, expectedCol] of expectedColumnMap) {
    const actualCol = actualColumnMap.get(columnName);
    if (actualCol) {
      const columnDiffs = compareColumns(actualCol, expectedCol);
      if (columnDiffs.length > 0) {
        validation.differences.push(...columnDiffs);
        validation.typeMismatches.push(...columnDiffs);

        columnDiffs.forEach(diff => {
          if (diff.severity === 'HIGH') {
            validation.summary.highSeverity++;
          } else if (diff.severity === 'MEDIUM') {
            validation.summary.mediumSeverity++;
          } else {
            validation.summary.lowSeverity++;
          }
          validation.summary.totalIssues++;
        });

        validation.summary.isValid = false;
      }
    }
  }

  return validation;
}

/**
 * Validate all tables in a schema
 */
export function validateSchema(db, schemaDefinition) {
  const results = {
    schemaName: schemaDefinition.name,
    tables: [],
    summary: {
      totalTables: 0,
      validTables: 0,
      invalidTables: 0,
      missingTables: 0,
      totalIssues: 0
    }
  };

  for (const table of schemaDefinition.tables || []) {
    const tableName = table.sqlName || table.name;
    const expectedColumns = [];

    // Convert field definitions to column definitions
    for (const field of table.fields || []) {
      const columnName = field.columnName || field.name;
      const sqlType = mapFieldTypeToSqlite(field.type);

      expectedColumns.push({
        columnName,
        sqlType,
        nullable: field.nullable !== false,
        primaryKey: field.primaryKey === true,
        unique: field.unique === true
      });
    }

    const validation = validateTableSchema(db, tableName, expectedColumns);
    results.tables.push(validation);

    results.summary.totalTables++;
    if (!validation.exists) {
      results.summary.missingTables++;
      results.summary.invalidTables++;
    } else if (validation.summary.isValid) {
      results.summary.validTables++;
    } else {
      results.summary.invalidTables++;
    }

    results.summary.totalIssues += validation.summary.totalIssues;
  }

  return results;
}

export default {
  getActualTableSchema,
  tableExists,
  compareColumns,
  validateTableSchema,
  validateSchema
};
