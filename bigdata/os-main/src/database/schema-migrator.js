import { tableExists, getActualTableSchema } from './schema-validator.js';
import { logDDL, logMigration } from './schema-logger.js';
import { mapFieldTypeToSqlite } from './schema-loader.js';

/**
 * Schema migrator for automatic ALTER operations
 * NEVER uses DROP to avoid data loss
 */

/**
 * Create a new table based on schema definition
 */
export function createTable(db, tableName, columns, branchId, moduleId) {
  try {
    const columnDefs = columns.map(col => {
      let def = `${col.columnName} ${col.sqlType}`;

      if (col.primaryKey) {
        def += ' PRIMARY KEY';
      }

      if (!col.nullable && !col.primaryKey) {
        def += ' NOT NULL';
      }

      if (col.unique && !col.primaryKey) {
        def += ' UNIQUE';
      }

      if (col.defaultValue !== undefined) {
        const defaultVal = typeof col.defaultValue === 'string'
          ? `'${col.defaultValue}'`
          : col.defaultValue;
        def += ` DEFAULT ${defaultVal}`;
      }

      return def;
    });

    const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columnDefs.join(',\n  ')}\n)`;

    db.exec(sql);

    logDDL(branchId, moduleId, 'CREATE_TABLE', sql, 'success', {
      tableName,
      columnCount: columns.length
    });

    logMigration(branchId, moduleId, 'CREATE_TABLE', `Created table ${tableName}`, 'success', {
      tableName,
      sql
    });

    return { success: true, sql };
  } catch (error) {
    logDDL(branchId, moduleId, 'CREATE_TABLE', `CREATE TABLE ${tableName}`, 'failed', {
      tableName,
      error: error.message
    });

    logMigration(branchId, moduleId, 'CREATE_TABLE', `Failed to create table ${tableName}`, 'failed', {
      tableName,
      error: error.message
    });

    return { success: false, error: error.message };
  }
}

/**
 * Add a missing column to an existing table
 */
export function addColumn(db, tableName, column, branchId, moduleId) {
  try {
    let columnDef = `${column.columnName} ${column.sqlType}`;

    // For ALTER TABLE ADD COLUMN, we can't add PRIMARY KEY constraint
    // We can only add NOT NULL if there's a default value
    if (!column.nullable && column.defaultValue !== undefined) {
      columnDef += ' NOT NULL';
    }

    if (column.defaultValue !== undefined) {
      const defaultVal = typeof column.defaultValue === 'string'
        ? `'${column.defaultValue}'`
        : String(column.defaultValue);
      columnDef += ` DEFAULT ${defaultVal}`;
    } else if (!column.nullable) {
      // If column is NOT NULL but no default value, we need to provide a default
      // based on the type to avoid errors
      const typeDefaults = {
        TEXT: "''",
        INTEGER: '0',
        REAL: '0.0',
        BLOB: "X''"
      };
      const defaultVal = typeDefaults[column.sqlType] || "''";
      columnDef += ` DEFAULT ${defaultVal}`;
    }

    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`;

    db.exec(sql);

    logDDL(branchId, moduleId, 'ADD_COLUMN', sql, 'success', {
      tableName,
      columnName: column.columnName,
      columnType: column.sqlType
    });

    logMigration(branchId, moduleId, 'ADD_COLUMN', `Added column ${column.columnName} to ${tableName}`, 'success', {
      tableName,
      columnName: column.columnName,
      sql
    });

    return { success: true, sql };
  } catch (error) {
    logDDL(branchId, moduleId, 'ADD_COLUMN', `ALTER TABLE ${tableName} ADD COLUMN ${column.columnName}`, 'failed', {
      tableName,
      columnName: column.columnName,
      error: error.message
    });

    logMigration(branchId, moduleId, 'ADD_COLUMN', `Failed to add column ${column.columnName} to ${tableName}`, 'failed', {
      tableName,
      columnName: column.columnName,
      error: error.message
    });

    return { success: false, error: error.message };
  }
}

/**
 * Modify a column type (requires table reconstruction in SQLite)
 * This is complex and risky - we'll log a warning instead
 */
export function modifyColumnType(db, tableName, columnName, newType, branchId, moduleId) {
  // SQLite doesn't support ALTER COLUMN directly
  // We would need to:
  // 1. Create new table with correct schema
  // 2. Copy data (with type conversion)
  // 3. Drop old table
  // 4. Rename new table
  //
  // This is risky and could cause data loss, so we'll just log a warning

  logMigration(branchId, moduleId, 'MODIFY_COLUMN_TYPE',
    `Column ${columnName} in ${tableName} has type mismatch. Manual migration required.`,
    'warning', {
      tableName,
      columnName,
      newType,
      action: 'REQUIRES_MANUAL_MIGRATION',
      reason: 'SQLite does not support ALTER COLUMN TYPE directly. Table reconstruction required.'
    });

  console.warn(`⚠️  Type mismatch detected for ${tableName}.${columnName}`);
  console.warn(`   Expected type: ${newType}`);
  console.warn(`   This requires manual migration. See migration logs for details.`);

  return {
    success: false,
    warning: true,
    requiresManualMigration: true,
    message: 'Type change requires manual migration'
  };
}

/**
 * Migrate a single table based on validation results
 */
export function migrateTable(db, tableName, validation, expectedColumns, branchId, moduleId) {
  const migrations = [];

  // If table doesn't exist, create it
  if (!validation.exists) {
    const result = createTable(db, tableName, expectedColumns, branchId, moduleId);
    migrations.push({
      action: 'CREATE_TABLE',
      tableName,
      ...result
    });
    return migrations;
  }

  // Add missing columns
  for (const missing of validation.missingColumns) {
    const column = expectedColumns.find(col =>
      col.columnName.toLowerCase() === missing.columnName.toLowerCase()
    );

    if (column) {
      const result = addColumn(db, tableName, column, branchId, moduleId);
      migrations.push({
        action: 'ADD_COLUMN',
        tableName,
        columnName: column.columnName,
        ...result
      });
    }
  }

  // Handle type mismatches
  for (const mismatch of validation.typeMismatches) {
    if (mismatch.type === 'TYPE_MISMATCH') {
      const result = modifyColumnType(
        db,
        tableName,
        mismatch.columnName,
        mismatch.expected,
        branchId,
        moduleId
      );
      migrations.push({
        action: 'MODIFY_COLUMN_TYPE',
        tableName,
        columnName: mismatch.columnName,
        ...result
      });
    }
  }

  return migrations;
}

/**
 * Migrate all tables in a schema
 */
export function migrateSchema(db, schemaDefinition, validationResults, branchId, moduleId) {
  const allMigrations = [];

  console.log(`\n🔄 Starting schema migration for ${branchId}/${moduleId}...`);

  for (const tableValidation of validationResults.tables) {
    const tableName = tableValidation.tableName;

    // Find the table definition
    const tableDef = schemaDefinition.tables.find(t =>
      (t.sqlName || t.name) === tableName
    );

    if (!tableDef) {
      continue;
    }

    // Convert field definitions to column definitions
    const expectedColumns = [];
    for (const field of tableDef.fields || []) {
      const columnName = field.columnName || field.name;
      const sqlType = mapFieldTypeToSqlite(field.type);

      expectedColumns.push({
        columnName,
        sqlType,
        nullable: field.nullable !== false,
        primaryKey: field.primaryKey === true,
        unique: field.unique === true,
        defaultValue: field.defaultValue
      });
    }

    // Perform migrations for this table
    const tableMigrations = migrateTable(
      db,
      tableName,
      tableValidation,
      expectedColumns,
      branchId,
      moduleId
    );

    allMigrations.push(...tableMigrations);

    if (tableMigrations.length > 0) {
      console.log(`  ✓ Migrated table: ${tableName} (${tableMigrations.length} operations)`);
    }
  }

  console.log(`✓ Migration completed. Total operations: ${allMigrations.length}\n`);

  return allMigrations;
}

/**
 * Create indexes based on schema definition
 */
export function createIndexes(db, tableName, indexes, branchId, moduleId) {
  const results = [];

  for (const index of indexes) {
    try {
      const indexName = index.name || `idx_${tableName}_${index.columns.join('_')}`;
      const uniqueStr = index.unique ? 'UNIQUE' : '';
      const columnsStr = index.columns.join(', ');

      const sql = `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnsStr})`;

      db.exec(sql);

      logDDL(branchId, moduleId, 'CREATE_INDEX', sql, 'success', {
        tableName,
        indexName,
        columns: index.columns
      });

      results.push({ success: true, indexName, sql });
    } catch (error) {
      logDDL(branchId, moduleId, 'CREATE_INDEX', `CREATE INDEX on ${tableName}`, 'failed', {
        tableName,
        indexName: index.name,
        error: error.message
      });

      results.push({ success: false, indexName: index.name, error: error.message });
    }
  }

  return results;
}

export default {
  createTable,
  addColumn,
  modifyColumnType,
  migrateTable,
  migrateSchema,
  createIndexes
};
