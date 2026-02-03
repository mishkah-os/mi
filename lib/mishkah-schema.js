(function (window) {
  'use strict';

  const root = window.Mishkah = window.Mishkah || {};
  const U = root.utils || {};

  class SchemaError extends Error {
    constructor(message, detail) {
      super(message);
      this.name = 'SchemaError';
      if (detail) this.detail = detail;
    }
  }

  const TYPE_CONFIG = {
    string: {
      sql: (field) => field.maxLength ? `varchar(${field.maxLength})` : 'varchar(255)',
      normalize(value) { return value == null ? value : String(value); }
    },
    varchar: {
      sql: (field) => field.maxLength ? `varchar(${field.maxLength})` : 'varchar(255)',
      normalize(value) { return value == null ? value : String(value); }
    },
    nvarchar: {
      sql: (field) => field.maxLength ? `nvarchar(${field.maxLength})` : 'nvarchar(255)',
      normalize(value) { return value == null ? value : String(value); }
    },
    char: {
      sql: (field) => field.maxLength ? `char(${field.maxLength})` : 'char(255)',
      normalize(value) { return value == null ? value : String(value); }
    },
    nchar: {
      sql: (field) => field.maxLength ? `nchar(${field.maxLength})` : 'nchar(255)',
      normalize(value) { return value == null ? value : String(value); }
    },
    text: { sql: () => 'text', normalize(value) { return value == null ? value : String(value); } },
    integer: {
      sql: () => 'integer',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number.parseInt(value, 10);
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be an integer');
        return parsed;
      }
    },
    int: {
      sql: () => 'integer',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number.parseInt(value, 10);
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be an integer');
        return parsed;
      }
    },
    bigint: {
      sql: () => 'bigint',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number.parseInt(value, 10);
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be an integer');
        return parsed;
      }
    },
    smallint: {
      sql: () => 'smallint',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number.parseInt(value, 10);
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be an integer');
        return parsed;
      }
    },
    tinyint: {
      sql: () => 'smallint',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number.parseInt(value, 10);
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be an integer');
        return parsed;
      }
    },
    number: {
      sql: (field) => field.precision ? `numeric(${field.precision}${field.scale != null ? `,${field.scale}` : ''})` : 'numeric',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number(value);
        const parsed = Number(value);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be numeric');
        return parsed;
      }
    },
    decimal: {
      sql: (field) => field.precision ? `numeric(${field.precision}${field.scale != null ? `,${field.scale}` : ''})` : 'numeric',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number(value);
        const parsed = Number(value);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be numeric');
        return parsed;
      }
    },
    float: {
      sql: () => 'double precision',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : Number(value);
        const parsed = Number(value);
        if (Number.isNaN(parsed)) throw new SchemaError('Value must be numeric');
        return parsed;
      }
    },
    boolean: {
      sql: () => 'boolean',
      normalize(value) {
        if (value === '' || value == null) return value == null ? null : false;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        const normalized = String(value).toLowerCase();
        if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
        throw new SchemaError('Value must be boolean');
      }
    },
    date: {
      sql: () => 'date',
      normalize(value) {
        if (!value) return value == null ? null : null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new SchemaError('Invalid date value');
        return date.toISOString().slice(0, 10);
      }
    },
    time: {
      sql: () => 'time without time zone',
      normalize(value) {
        if (!value) return value == null ? null : null;
        // Simple validation for HH:mm:ss format or similar
        const str = String(value);
        if (/^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) return str;
        // Try parsing as date to extract time
        const date = new Date(`1970-01-01T${str}Z`);
        if (!Number.isNaN(date.getTime())) return date.toISOString().slice(11, 19);
        return str; // Fallback
      }
    },
    datetime: {
      sql: () => 'timestamp without time zone',
      normalize(value) {
        if (!value) return value == null ? null : null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new SchemaError('Invalid datetime value');
        return date.toISOString();
      }
    },
    timestamp: {
      sql: () => 'timestamp with time zone',
      normalize(value) {
        if (!value) return value == null ? null : null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new SchemaError('Invalid timestamp value');
        return date.toISOString();
      }
    },
    bit: {
      sql: (field) => field.maxLength ? `bit(${field.maxLength})` : 'bit',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : '0';
        const str = String(value);
        if (/^[01]+$/.test(str)) return str;
        if (['true', 'yes', 'on'].includes(str.toLowerCase())) return '1';
        if (['false', 'no', 'off'].includes(str.toLowerCase())) return '0';
        return '0'; // Default fallback
      }
    },
    json: {
      sql: () => 'jsonb',
      normalize(value) {
        if (value == null) return null;
        if (typeof value === 'string') { try { return JSON.parse(value); } catch (_) { throw new SchemaError('Invalid JSON'); } }
        return value;
      }
    },
    uuid: {
      sql: () => 'uuid',
      normalize(value) {
        if (value == null || value === '') return value == null ? null : String(value);
        const str = String(value);
        const pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
        if (!pattern.test(str)) throw new SchemaError('Value must be a UUID');
        return str.toLowerCase();
      }
    }
  };

  function toSnakeCase(value) {
    if (!value) return value;
    return String(value)
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[-\s]+/g, '_')
      .toLowerCase();
  }

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function ensureArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  class FieldDefinition {
    constructor(config) {
      if (!config || !config.name) throw new SchemaError('Field requires a name');
      this.name = String(config.name);
      this.columnName = config.columnName ? String(config.columnName) : toSnakeCase(this.name);
      this.type = config.type || 'string';
      this.nullable = config.nullable !== false;
      this.defaultValue = config.defaultValue;
      this.maxLength = config.maxLength;
      this.precision = config.precision;
      this.scale = config.scale;
      this.primaryKey = !!config.primaryKey;
      this.unique = !!config.unique;
      this.index = !!config.index;
      this.enum = Array.isArray(config.enum) ? config.enum.slice() : null;
      this.references = config.references ? {
        table: config.references.table,
        column: config.references.column || toSnakeCase(config.references.field || 'id'),
        onDelete: config.references.onDelete || config.references.on_delete || 'NO ACTION',
        onUpdate: config.references.onUpdate || config.references.on_update || 'NO ACTION'
      } : null;
      this.comment = config.comment || '';
      this.notes = config.notes || '';
      if (!TYPE_CONFIG[this.type]) throw new SchemaError(`Unsupported field type: ${this.type}`);
    }

    copy(overrides) {
      return new FieldDefinition(Object.assign({}, this.toJSON(), overrides || {}));
    }

    applyDefault() {
      if (typeof this.defaultValue === 'function') {
        return this.defaultValue();
      }
      if (this.defaultValue != null) return clone(this.defaultValue);
      if (this.nullable) return null;
      switch (this.type) {
        case 'integer':
        case 'number':
        case 'decimal':
        case 'float':
          return 0;
        case 'boolean':
          return false;
        case 'json':
          return {};
        default:
          return '';
      }
    }

    normalize(value, { allowNull = true } = {}) {
      let current = value;
      if (current == null || current === '') {
        if (!allowNull && !this.nullable) return this.applyDefault();
        if (this.nullable) return null;
        if (this.defaultValue !== undefined) return this.applyDefault();
        throw new SchemaError(`Field "${this.name}" is required`);
      }
      const handler = TYPE_CONFIG[this.type];
      if (!handler) return current;
      const normalized = handler.normalize.call(this, current);
      if (this.enum && normalized != null && !this.enum.includes(normalized)) {
        throw new SchemaError(`Field "${this.name}" must be one of: ${this.enum.join(', ')}`);
      }
      return normalized;
    }

    sqlType() {
      const handler = TYPE_CONFIG[this.type];
      if (!handler) return 'text';
      return typeof handler.sql === 'function' ? handler.sql(this) : handler.sql;
    }

    columnSQL() {
      const parts = [`"${this.columnName}"`, this.sqlType()];
      if (!this.nullable) parts.push('NOT NULL');
      if (this.unique && !this.primaryKey) parts.push('UNIQUE');
      if (this.defaultValue != null && typeof this.defaultValue !== 'function') {
        const val = this.defaultValue;
        if (typeof val === 'string' && /^\w+\(.*\)$/.test(val)) {
          parts.push(`DEFAULT ${val}`);
        } else if (typeof val === 'string') {
          parts.push(`DEFAULT '${val.replace(/'/g, "''")}'`);
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          parts.push(`DEFAULT ${val}`);
        } else if (val === null) {
          parts.push('DEFAULT NULL');
        }
      }
      return parts.join(' ');
    }

    toJSON() {
      const json = {
        name: this.name,
        columnName: this.columnName,
        type: this.type,
        nullable: this.nullable,
        defaultValue: this.defaultValue,
        maxLength: this.maxLength,
        precision: this.precision,
        scale: this.scale,
        primaryKey: this.primaryKey,
        unique: this.unique,
        index: this.index,
        comment: this.comment,
        notes: this.notes
      };
      if (this.enum) json.enum = this.enum.slice();
      if (this.references) {
        json.references = {
          table: this.references.table,
          column: this.references.column,
          onDelete: this.references.onDelete,
          onUpdate: this.references.onUpdate
        };
      }
      return json;
    }
  }

  class TableDefinition {
    constructor(config) {
      if (!config || !config.name) throw new SchemaError('Table requires a name');
      this.name = String(config.name);
      this.label = config.label || this.name;
      this.comment = config.comment || '';
      this.sqlName = config.sqlName || toSnakeCase(this.name);
      this.layout = Object.assign({ x: 0, y: 0 }, config.layout || {});
      this.classCode = config.classCode || config.class || '';
      const fields = ensureArray(config.fields).map(field => field instanceof FieldDefinition ? field : new FieldDefinition(field));
      this.fields = fields;
      this.indexes = ensureArray(config.indexes).map(idx => Object.assign({}, idx));
      this.ensurePrimaryKey();
    }

    ensurePrimaryKey() {
      const primary = this.fields.filter(field => field.primaryKey);
      if (primary.length === 0 && this.fields.length) {
        this.fields[0] = this.fields[0].copy({ primaryKey: true, nullable: false });
      }
    }

    setLayout(layout) {
      if (!layout) return;
      if (typeof layout.x === 'number') this.layout.x = layout.x;
      if (typeof layout.y === 'number') this.layout.y = layout.y;
    }

    getField(name) {
      return this.fields.find(field => field.name === name) || null;
    }

    addField(config) {
      const field = config instanceof FieldDefinition ? config : new FieldDefinition(config);
      if (this.getField(field.name)) throw new SchemaError(`Field ${field.name} already exists in ${this.name}`);
      this.fields.push(field);
      return field;
    }

    updateField(name, patch) {
      const field = this.getField(name);
      if (!field) throw new SchemaError(`Field ${name} not found in ${this.name}`);
      const idx = this.fields.indexOf(field);
      const updated = field.copy(patch);
      this.fields[idx] = updated;
      return updated;
    }

    removeField(name) {
      const idx = this.fields.findIndex(field => field.name === name);
      if (idx === -1) return false;
      this.fields.splice(idx, 1);
      return true;
    }

    createRecord(data) {
      const record = {};
      for (const field of this.fields) {
        const value = data && (data[field.name] !== undefined ? data[field.name] : data[field.columnName]);
        record[field.name] = field.normalize(value, { allowNull: field.nullable });
      }
      return record;
    }

    updateRecord(current, patch) {
      if (!current || typeof current !== 'object') throw new SchemaError('Current record must be provided for update');
      const next = Object.assign({}, current);
      for (const field of this.fields) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, field.name)) {
          next[field.name] = field.normalize(patch[field.name], { allowNull: field.nullable });
        }
      }
      return next;
    }

    primaryColumns() {
      return this.fields.filter(field => field.primaryKey);
    }

    references() {
      return this.fields.filter(field => field.references);
    }

    toJSON() {
      return {
        name: this.name,
        label: this.label,
        comment: this.comment,
        sqlName: this.sqlName,
        layout: Object.assign({}, this.layout),
        classCode: this.classCode || '',
        fields: this.fields.map(field => field.toJSON()),
        indexes: this.indexes.map(idx => Object.assign({}, idx))
      };
    }

    toSQL(options) {
      const opts = options || {};
      const schemaName = opts.schemaName ? String(opts.schemaName) : null;
      const qualifiedName = schemaName ? `"${schemaName}"."${this.sqlName}"` : `"${this.sqlName}"`;
      const lines = this.fields.map(field => `  ${field.columnSQL()}`);
      const primary = this.primaryColumns();
      if (primary.length) {
        const cols = primary.map(field => `"${field.columnName}"`).join(', ');
        lines.push(`  PRIMARY KEY (${cols})`);
      }
      for (const field of this.references()) {
        const ref = field.references;
        lines.push(`  FOREIGN KEY ("${field.columnName}") REFERENCES "${ref.table}" ("${ref.column}") ON DELETE ${ref.onDelete} ON UPDATE ${ref.onUpdate}`);
      }
      const statement = [`CREATE TABLE IF NOT EXISTS ${qualifiedName} (`, lines.join(',\n'), ');'];
      if (this.comment) {
        statement.push(`COMMENT ON TABLE ${qualifiedName} IS '${this.comment.replace(/'/g, "''")}';`);
      }
      for (const field of this.fields) {
        if (field.comment) {
          const columnRef = `${qualifiedName}."${field.columnName}"`;
          statement.push(`COMMENT ON COLUMN ${columnRef} IS '${field.comment.replace(/'/g, "''")}';`);
        }
      }
      return statement.join('\n');
    }

    indexStatements(options) {
      const opts = options || {};
      const schemaName = opts.schemaName ? String(opts.schemaName) : null;
      const qualifiedTable = schemaName ? `"${schemaName}"."${this.sqlName}"` : `"${this.sqlName}"`;
      const statements = [];
      for (const index of this.indexes) {
        if (!index || !index.columns || !index.columns.length) continue;
        const name = index.name || `${this.sqlName}_${index.columns.join('_')}_idx`;
        const cols = index.columns.map(col => `"${col}"`).join(', ');
        const method = index.method ? ` USING ${index.method}` : '';
        const unique = index.unique ? 'UNIQUE ' : '';
        const where = index.where ? ` WHERE ${index.where}` : '';
        statements.push(`CREATE ${unique}INDEX IF NOT EXISTS "${name}" ON ${qualifiedTable}${method} (${cols})${where};`);
      }
      return statements;
    }
  }

  class SchemaRegistry {
    constructor(config) {
      this.tables = new Map();
      if (config && Array.isArray(config.tables)) {
        config.tables.forEach(table => this.register(table instanceof TableDefinition ? table : new TableDefinition(table)));
      }
    }

    register(table) {
      const instance = table instanceof TableDefinition ? table : new TableDefinition(table);
      this.tables.set(instance.name, instance);
      return instance;
    }

    unregister(name) {
      this.tables.delete(name);
    }

    get(name) {
      return this.tables.get(name) || null;
    }

    list() {
      return Array.from(this.tables.values());
    }

    createRecord(tableName, data) {
      const table = this.get(tableName);
      if (!table) throw new SchemaError(`Unknown table: ${tableName}`);
      return table.createRecord(data || {});
    }

    updateRecord(tableName, current, patch) {
      const table = this.get(tableName);
      if (!table) throw new SchemaError(`Unknown table: ${tableName}`);
      return table.updateRecord(current, patch || {});
    }

    toJSON() {
      return { tables: this.list().map(table => table.toJSON()) };
    }

    generateSQL(options) {
      const opts = options || {};
      const includeIndexes = opts.includeIndexes !== false;
      const statements = [];
      const sorted = this.topologicallySorted();
      sorted.forEach(table => { statements.push(table.toSQL(opts)); });
      if (includeIndexes) {
        sorted.forEach(table => {
          const indexes = table.indexStatements(opts);
          indexes.forEach(stmt => statements.push(stmt));
        });
      }
      return statements.filter(Boolean).join('\n\n');
    }

    topologicallySorted() {
      const tables = this.list();
      const visited = new Set();
      const visiting = new Set();
      const sorted = [];
      const visit = (table) => {
        if (visited.has(table.name)) return;
        if (visiting.has(table.name)) return;
        visiting.add(table.name);
        table.references().forEach(field => {
          const refTable = this.get(field.references.table);
          if (refTable) visit(refTable);
        });
        visiting.delete(table.name);
        visited.add(table.name);
        sorted.push(table);
      };
      tables.forEach(table => visit(table));
      return sorted;
    }

    static fromJSON(json) {
      return new SchemaRegistry(json || {});
    }
  }

  function defineTable(config) {
    return new TableDefinition(config || {});
  }

  const Schema = {
    Error: SchemaError,
    Field: FieldDefinition,
    Table: TableDefinition,
    Registry: SchemaRegistry,
    defineTable,
    utils: { toSnakeCase, clone }
  };

  root.schema = Schema;
})(typeof window !== 'undefined' ? window : this);
