import { deepClone } from '../utils.js';

/**
 * SmartSchema: The Brain of the Universal CRUD.
 * 
 * Responsibilities:
 * 1. Parse raw JSON schema.
 * 2. Auto-discover "Translatable Tables" (Convention: TableName + "_lang").
 * 3. Auto-discover "Display Fields" (First NVARCHAR in _lang table).
 * 4. Index Foreign Keys for "Smart Hydration".
 */
class SmartSchema {
    constructor(rawSchema) {
        this.raw = rawSchema || { tables: [] };
        this.schema = this.raw.schema || this.raw.Schema || this.raw; // preserve original root schema for consumers
        this.modules = Array.isArray(this.schema?.modules) ? this.schema.modules : [];
        this.tables = new Map(); // Name -> TableDef
        this.fks = new Map(); // "Table.Field" -> TargetTable
        this.translations = new Map(); // BaseTable -> LangTableDef
        this.tableTypes = [];
        this.tableMeta = new Map();
        this.tableSmart = new Map();

        this.init();
    }

    init() {
        if (!this.schema || !Array.isArray(this.schema.tables)) return;

        // Optional table types registry
        if (Array.isArray(this.schema.table_types)) {
            this.tableTypes = this.schema.table_types;
        }

        // Optional table meta registry (icons/types)
        if (this.schema.tables_meta && typeof this.schema.tables_meta === 'object') {
            for (const [tableName, meta] of Object.entries(this.schema.tables_meta)) {
                this.tableMeta.set(tableName.toLowerCase(), meta || {});
            }
        }

        // 1. First Pass: Index all tables
        for (const table of this.schema.tables) {
            this.tables.set(table.name.toLowerCase(), table);
        }

        // 2. Second Pass: Discover Relationships & Intelligence
        for (const table of this.schema.tables) {
            this.processTable(table);
        }
    }

    processTable(table) {
        const tableName = table.name.toLowerCase();

        // A. Check for Translation Companion (Convention: *_lang)
        if (tableName.endsWith('_lang')) {
            const baseName = tableName.slice(0, -5); // Remove _lang
            if (this.tables.has(baseName)) {

                // [AUTO-INJECT] System Field: display_name
                // Prevents UI from showing it in Create/Edit forms by default
                const hasDisplayName = table.fields.some(f => f.name === 'display_name');
                if (!hasDisplayName) {
                    table.fields.push({
                        name: 'display_name',
                        columnName: 'display_name',
                        type: 'nvarchar',
                        nullable: true,
                        maxLength: 250,
                        is_edit_show: false, // Hidden!
                        is_table_show: false,
                        is_searchable: true
                    });
                }

                this.linkTranslation(baseName, tableName);
            }
            return;
        }

        // B. Track smart_features for later lookups
        if (table.smart_features && typeof table.smart_features === 'object') {
            this.tableSmart.set(tableName, deepClone(table.smart_features));
        }

        // C. Process Fields for Smart Features
        if (Array.isArray(table.fields)) {
            for (const field of table.fields) {
                this.processField(table, field);
            }
        }
    }

    linkTranslation(baseName, langTableName) {
        const langTable = this.tables.get(langTableName);
        const baseTable = this.tables.get(baseName);

        // Validation: Base table must exist
        if (!baseTable) {
            console.warn(`[SmartSchema] Translation table "${langTableName}" found but base table "${baseName}" is missing. Skipping.`);
            return;
        }

        if (!langTable || !Array.isArray(langTable.fields)) {
            console.warn(`[SmartSchema] Invalid lang table structure for "${langTableName}". Skipping.`);
            return;
        }

        // 1. Identify Display Field (First NVARCHAR that isn't ID, Code, Language, or Ref)
        let displayField = 'name'; // Default
        const candidate = langTable.fields.find(f => {
            if (!f || !f.columnName || !f.type) return false;
            const lower = f.columnName.toLowerCase();
            return f.type === 'nvarchar' &&
                !['id', 'lang', 'language', 'code', 'created_date', 'modified_date', baseName + '_id'].includes(lower);
        });

        if (candidate) {
            displayField = candidate.columnName;
        }

        // 2. Store Metadata
        this.translations.set(baseName, {
            langTable: langTableName,
            displayField: displayField,
            fields: langTable.fields.map(f => f.columnName)
        });

        // 3. Mark Base Table as Translatable (in-memory augmentation)
        baseTable.smart = baseTable.smart || {};
        baseTable.smart.isTranslatable = true;
        baseTable.smart.translationTable = langTableName;
        baseTable.smart.displayField = displayField;

        // 4. Ensure base table has NO display_name column when translation exists
        if (Array.isArray(baseTable.fields)) {
            baseTable.fields = baseTable.fields.filter((field) => {
                const name = String(field?.columnName || field?.name || '').toLowerCase();
                return name !== 'display_name';
            });
        }
    }

    processField(table, field) {
        // Check for FK references
        if (field.references && field.references.table) {
            const targetTable = field.references.table.toLowerCase();

            // Index this FK for fast lookup
            const key = `${table.name.toLowerCase()}.${field.columnName.toLowerCase()}`;
            this.fks.set(key, targetTable);

            // Augment Field with Smart Widgets if target is translatable
            // (This logic happens effectively at runtime lookup, but we can flag it here)
            // We assume ALL references to master tables deserve Smart Selects unless opted out
            if (!field.ui_widget) {
                // We do NOT modify the raw schema permanently on disk here, just in memory usage
                // field.ui_widget = 'smart-select'; 
            }
        }
    }

    /**
     * Returns the definition of the Translation Table for a given entity.
     */
    getTranslationConfig(tableName) {
        return this.translations.get(tableName.toLowerCase());
    }

    /**
     * Returns the target table name for a specific FK field.
     */
    getReferenceTarget(tableName, fieldName) {
        return this.fks.get(`${tableName.toLowerCase()}.${fieldName.toLowerCase()}`);
    }

    isTranslatable(tableName) {
        return this.translations.has(tableName.toLowerCase());
    }

    getDisplayField(tableName) {
        const config = this.translations.get(tableName.toLowerCase());
        return config ? config.displayField : 'name'; // Fallback
    }

    getSmartFeatures(tableName) {
        return this.tableSmart.get(tableName.toLowerCase()) || {};
    }

    getDisplayRule(tableName) {
        const smart = this.getSmartFeatures(tableName);
        return smart.display_rule || smart.displayRule || null;
    }



    getColumnsMeta(tableName) {
        const smart = this.getSmartFeatures(tableName);
        return smart.columns || smart.columns_meta || smart.columnsMeta || null;
    }

    getDisplayFkPriority(tableName) {
        const smart = this.getSmartFeatures(tableName);
        return smart.display_fk_priority || smart.displayFkPriority || null;
    }

    getTableType(tableName) {
        const meta = this.tableMeta.get(tableName.toLowerCase());
        return meta && meta.type;
    }

    getTableIcon(tableName) {
        const meta = this.tableMeta.get(tableName.toLowerCase());
        return meta && meta.icon;
    }
}

export default SmartSchema;
