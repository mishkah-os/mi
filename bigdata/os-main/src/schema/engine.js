import { readFile } from 'fs/promises';
import { deepClone, createId, nowIso } from '../utils.js';
import { normalizeRecordForSave } from './fk-resolver.js';

function normalizeType(type) {
  if (!type) return 'string';
  const lower = type.toLowerCase();
  if (['char', 'varchar', 'text'].includes(lower)) return 'string';
  if (['integer', 'int', 'smallint', 'bigint'].includes(lower)) return 'integer';
  if (['number', 'numeric', 'decimal', 'float', 'double'].includes(lower)) return 'number';
  if (lower === 'boolean' || lower === 'bool') return 'boolean';
  if (lower === 'json' || lower === 'jsonb' || lower === 'object') return 'json';
  if (lower === 'date') return 'date';
  if (lower === 'time') return 'time';
  if (lower.includes('timestamp') || lower === 'datetime') return 'timestamp';
  return lower;
}

function defaultForType(type, field = {}, context = {}) {
  const normalized = normalizeType(type);
  if (field.defaultValue !== undefined) {
    if (normalized === 'json') return deepClone(field.defaultValue);
    if (normalized === 'number') return Number(field.defaultValue);
    return field.defaultValue;
  }
  switch (normalized) {
    case 'string':
      return field.nullable ? null : '';
    case 'integer':
    case 'number':
      return field.nullable ? null : 0;
    case 'boolean':
      return field.nullable ? null : false;
    case 'json':
      return {};
    case 'timestamp':
      return nowIso();
    case 'date': {
      const now = new Date();
      return now.toISOString().slice(0, 10);
    }
    default:
      return field.nullable ? null : null;
  }
}

export default class SchemaEngine {
  constructor() {
    this.tables = new Map();
  }

  async loadFromFile(filePath) {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    this.registerSchema(parsed);
  }

  registerSchema(schema) {
    if (!schema || typeof schema !== 'object') return;
    const tables = schema?.schema?.tables || [];
    for (const table of tables) {
      if (!table?.name) continue;
      const tableName = String(table.name || '');
      if (tableName.toLowerCase().endsWith('_lang')) {
        if (!Array.isArray(table.fields)) table.fields = [];
        const hasDisplay = table.fields.some((field) => {
          const name = field && (field.name || field.columnName);
          return String(name || '').toLowerCase() === 'display_name';
        });
        if (!hasDisplay) {
          table.fields.push({
            name: 'display_name',
            columnName: 'display_name',
            type: 'nvarchar',
            nullable: true,
            maxLength: 255
          });
        }
      }
      this.tables.set(table.name, table);
    }
  }

  getTable(tableName) {
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    return table;
  }

  listTables() {
    return Array.from(this.tables.keys());
  }

  createModuleDataset(tableNames = []) {
    const dataset = {};
    for (const tableName of tableNames) {
      dataset[tableName] = [];
    }
    return dataset;
  }

  createRecord(tableName, input = {}, context = {}) {
    const table = this.getTable(tableName);

    // ✅ Normalize FK objects: {id, name} → extract id only
    const normalizedInput = normalizeRecordForSave(this, tableName, input);

    const record = {};

    for (const field of table.fields || []) {
      const fieldName = field.name;
      const columnName = field.columnName || field.name;

      // Try to get value from both camelCase (field.name) and snake_case (field.columnName)
      let value = normalizedInput[fieldName];
      if ((value === undefined || value === null || value === '') && columnName !== fieldName) {
        value = normalizedInput[columnName];
      }

      if (value === undefined || value === null || value === '') {
        value = this.generateAutoValue(field, context);
        if (value === undefined) {
          value = defaultForType(field.type, field, context);
        }
      } else {
        value = this.coerceValue(field, value);
      }

      record[fieldName] = value;
    }

    return record;
  }

  generateAutoValue(field, context = {}) {
    const name = field.name;
    const type = normalizeType(field.type);

    if (field.primaryKey) {
      return createId(name || 'rec');
    }

    if (name === 'branchId' && context.branchId) {
      return context.branchId;
    }

    if ((name === 'createdAt' || name === 'updatedAt' || name === 'serverAt' || name.endsWith('At')) && type === 'timestamp') {
      return nowIso();
    }

    if (name === 'clientId' && context.clientId) {
      return context.clientId;
    }

    return undefined;
  }

  coerceValue(field, value) {
    const type = normalizeType(field.type);

    // Debug logging for any field containing "item"
    if (field.name.toLowerCase().includes("item")) {
      console.log('[SchemaEngine][coerceValue] Field:', field.name, 'Type:', type, 'Value:', value);
    }

    if (value === null || value === undefined) return value;
    switch (type) {
      case 'integer':
      case 'number':
        return Number(value);
      case 'boolean':
        return typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
      case 'json':
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch (_err) {
            return {};
          }
        }
        return deepClone(value);
      default:
        return value;
    }
  }
}
