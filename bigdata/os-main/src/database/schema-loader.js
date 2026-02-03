import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

/**
 * Schema loader for reading definition.json files from all branches
 */

/**
 * Find all schema definition files in the data/branches directory
 */
export function findSchemaDefinitions(rootDir = process.cwd()) {
  const branchesDir = path.join(rootDir, 'data', 'branches');
  const schemaFiles = [];

  if (!existsSync(branchesDir)) {
    console.warn(`Branches directory not found: ${branchesDir}`);
    return schemaFiles;
  }

  try {
    const branches = readdirSync(branchesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const branchId of branches) {
      const modulesDir = path.join(branchesDir, branchId, 'modules');

      if (!existsSync(modulesDir)) {
        continue;
      }

      const modules = readdirSync(modulesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const moduleId of modules) {
        const schemaFile = path.join(modulesDir, moduleId, 'schema', 'definition.json');

        if (existsSync(schemaFile)) {
          schemaFiles.push({
            branchId,
            moduleId,
            filePath: schemaFile
          });
        }
      }
    }
  } catch (error) {
    console.error('Error finding schema definitions:', error.message);
  }

  return schemaFiles;
}

/**
 * Load a schema definition file
 */
export function loadSchemaDefinition(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const schema = JSON.parse(content);
    return schema;
  } catch (error) {
    console.error(`Error loading schema from ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Load all schema definitions
 */
export function loadAllSchemas(rootDir = process.cwd()) {
  const schemaFiles = findSchemaDefinitions(rootDir);
  const schemas = [];

  for (const { branchId, moduleId, filePath } of schemaFiles) {
    const schema = loadSchemaDefinition(filePath);

    if (schema && schema.schema && schema.schema.tables) {
      schemas.push({
        branchId,
        moduleId,
        schema: schema.schema,
        filePath
      });
    }
  }

  return schemas;
}

/**
 * Map schema field type to SQLite type
 */
export function mapFieldTypeToSqlite(fieldType) {
  const typeMap = {
    string: 'TEXT',
    integer: 'INTEGER',
    int: 'INTEGER',
    number: 'REAL',
    real: 'REAL',
    float: 'REAL',
    double: 'REAL',
    boolean: 'INTEGER',
    bool: 'INTEGER',
    timestamp: 'TEXT',
    datetime: 'TEXT',
    date: 'TEXT',
    time: 'TEXT',
    json: 'TEXT',
    text: 'TEXT',
    blob: 'BLOB'
  };

  const normalized = String(fieldType).toLowerCase().trim();
  return typeMap[normalized] || 'TEXT';
}

/**
 * Convert schema field definition to SQLite column definition
 */
export function fieldToColumnDefinition(field) {
  const columnName = field.columnName || field.name;
  const sqlType = mapFieldTypeToSqlite(field.type);
  const nullable = field.nullable !== false; // default to nullable unless explicitly false
  const primaryKey = field.primaryKey === true;
  const unique = field.unique === true;

  let definition = `${columnName} ${sqlType}`;

  if (primaryKey) {
    definition += ' PRIMARY KEY';
  }

  if (!nullable && !primaryKey) {
    definition += ' NOT NULL';
  }

  if (unique && !primaryKey) {
    definition += ' UNIQUE';
  }

  if (field.defaultValue !== undefined) {
    const defaultVal = typeof field.defaultValue === 'string'
      ? `'${field.defaultValue}'`
      : field.defaultValue;
    definition += ` DEFAULT ${defaultVal}`;
  }

  return {
    columnName,
    sqlType,
    nullable,
    primaryKey,
    unique,
    definition
  };
}

/**
 * Get table definition from schema
 */
export function getTableDefinition(schemaTable) {
  const tableName = schemaTable.sqlName || schemaTable.name;
  const columns = [];
  const primaryKeys = [];

  for (const field of schemaTable.fields || []) {
    const column = fieldToColumnDefinition(field);
    columns.push(column);

    if (column.primaryKey) {
      primaryKeys.push(column.columnName);
    }
  }

  return {
    tableName,
    columns,
    primaryKeys,
    indexes: schemaTable.indexes || []
  };
}

export default {
  findSchemaDefinitions,
  loadSchemaDefinition,
  loadAllSchemas,
  mapFieldTypeToSqlite,
  fieldToColumnDefinition,
  getTableDefinition
};
