// Schema to Knex Adapter - Auto-generates tables from clinic_schema.json
import { readFileSync } from 'fs';

export class SchemaToKnexAdapter {
    constructor(schemaPath) {
        const raw = readFileSync(schemaPath, 'utf-8');
        const schemaRoot = JSON.parse(raw);

        // Handle nested structure: { schema: { tables: [...] } }
        this.schema = schemaRoot.schema || schemaRoot;
        this.tables = new Map();

        // Parse schema
        for (const table of this.schema.tables || []) {
            this.tables.set(table.name.toLowerCase(), table);
        }
    }

    /**
     * Get all table names (excluding _lang tables for CRUD UI)
     */
    getAllTables(includeLang = false) {
        const tables = Array.from(this.tables.keys());

        if (includeLang) {
            return tables;
        }

        // Filter out _lang tables and system tables for CRUD UI
        return tables.filter(name => {
            if (name.endsWith('_lang')) return false;
            if (name.startsWith('_')) return false;
            return true;
        });
    }

    /**
     * Map clinic schema field type to Knex column type
     */
    mapFieldType(field) {
        const typeMap = {
            'int': 'integer',
            'bigint': 'bigInteger',
            'nvarchar': 'string',
            'text': 'text',
            'datetime': 'datetime',
            'date': 'date',
            'boolean': 'boolean',
            'decimal': 'decimal',
            'float': 'float',
            'uuid': 'uuid',
            'json': 'json',
            'bit': 'boolean'
        };

        return typeMap[field.type?.toLowerCase()] || 'string';
    }

    /**
     * Generate CREATE TABLE via Knex schema builder
     */
    async createTable(knex, tableName) {
        const table = this.tables.get(tableName.toLowerCase());
        if (!table) {
            throw new Error(`Table ${tableName} not found in schema`);
        }

        const exists = await knex.schema.hasTable(tableName);
        if (exists) {
            console.log(`⏭️  Table ${tableName} already exists`);
            return;
        }

        console.log(`🔨 Creating table: ${tableName}`);

        await knex.schema.createTable(tableName, (t) => {
            for (const field of table.fields) {
                this.addColumn(t, field, tableName);
            }

            // Composite primary key
            const pkFields = table.fields.filter(f => f.primaryKey);
            if (pkFields.length > 1) {
                t.primary(pkFields.map(f => f.columnName));
            }

            // Indexes
            if (table.indexes) {
                for (const idx of table.indexes) {
                    if (idx.unique) {
                        t.unique(idx.columns, { indexName: idx.name });
                    } else {
                        t.index(idx.columns, idx.name);
                    }
                }
            }
        });

        console.log(`✅ Created: ${tableName}`);
    }

    addColumn(tableBuilder, field, tableName) {
        const knexType = this.mapFieldType(field);
        let column;

        // Create column
        if (knexType === 'string' && field.maxLength) {
            column = tableBuilder[knexType](field.columnName, field.maxLength);
        } else if (knexType === 'decimal' && field.precision) {
            column = tableBuilder.decimal(field.columnName, field.precision, field.scale || 2);
        } else {
            column = tableBuilder[knexType](field.columnName);
        }

        // Constraints
        if (field.primaryKey && !this.hasCompositePK(tableName)) {
            column.primary();
        }

        if (field.nullable === false) {
            column.notNullable();
        }

        if (field.unique === true) {
            column.unique();
        }

        if (field.defaultValue !== undefined) {
            column.defaultTo(field.defaultValue);
        }

        if (field.index === true && !field.primaryKey) {
            column.index();
        }

        return column;
    }

    hasCompositePK(tableName) {
        const table = this.tables.get(tableName.toLowerCase());
        const pkFields = table?.fields?.filter(f => f.primaryKey) || [];
        return pkFields.length > 1;
    }

    /**
     * Add foreign keys (after all tables created)
     */
    async createForeignKeys(knex, tableName) {
        const table = this.tables.get(tableName.toLowerCase());
        if (!table) return;

        const fkFields = table.fields.filter(f => f.references);
        if (!fkFields.length) return;

        console.log(`🔗 Adding FKs for: ${tableName}`);

        await knex.schema.alterTable(tableName, (t) => {
            for (const field of fkFields) {
                const constraintName = `fk_${tableName}_${field.columnName}`;

                t.foreign(field.columnName, constraintName)
                    .references('id')
                    .inTable(field.references.table)
                    .onDelete(field.references.onDelete || 'CASCADE')
                    .onUpdate(field.references.onUpdate || 'CASCADE');
            }
        });

        console.log(`✅ FKs added: ${tableName}`);
    }

    /**
     * Check if table is translatable (has _lang companion)
     */
    isTranslatable(tableName) {
        return this.tables.has(`${tableName}_lang`);
    }

    /**
     * Get display field from _lang table
     */
    getDisplayField(tableName) {
        if (!this.isTranslatable(tableName)) return 'name';

        const langTable = this.tables.get(`${tableName}_lang`);
        if (!langTable) return 'name';

        const displayField = langTable.fields.find(f => {
            if (!f || !f.columnName || !f.type) return false;
            const lower = f.columnName.toLowerCase();
            return f.type === 'nvarchar' &&
                !['id', 'lang', 'language', 'code', 'created_date', 'modified_date', `${tableName}_id`].includes(lower);
        });

        return displayField ? displayField.columnName : 'name';
    }

    /**
     * Get all table names (for bulk creation)
     */
    getAllTables() {
        return Array.from(this.tables.keys());
    }
}
