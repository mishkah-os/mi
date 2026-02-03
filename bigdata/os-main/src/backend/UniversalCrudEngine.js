// Universal CRUD Engine - The Brain
// Handles all CRUD operations with smart FK hydration and dynamic languages
import crypto from 'crypto';

export class UniversalCrudEngine {
    constructor(knex, schemaAdapter) {
        this.knex = knex;
        this.schema = schemaAdapter;
        this.defaultLang = null; // Cached
    }

    /**
     * Get default language from DB
     */
    async getDefaultLanguage() {
        if (this.defaultLang) return this.defaultLang;

        try {
            const lang = await this.knex('languages')
                .where({ is_default: true, is_active: true })
                .first();

            this.defaultLang = lang?.code || 'ar';
            return this.defaultLang;
        } catch (error) {
            return 'ar'; // Fallback
        }
    }

    /**
     * Search with filters, pagination, and hydration
     */
    async search(tableName, options = {}) {
        const {
            lang = 'ar',
            q = '',
            filters = {},
            page = 1,
            limit = 50
        } = options;

        try {
            // Build query
            let query = this.knex(tableName);

            // Apply filters
            if (filters && Object.keys(filters).length > 0) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== null && value !== undefined) {
                        query = query.where(key, value);
                    }
                });
            }

            // Apply smart search
            if (q && q.trim()) {
                query = await this.applySmartSearch(query, tableName, q.trim(), lang);
            }

            // Count total
            const countQuery = query.clone();
            const total = await countQuery.count('* as count').first();

            // Paginate
            query = query.limit(limit).offset((page - 1) * limit);

            // Execute
            let rows = await query;

            // 🔥 HYDRATE: Attach translations + resolve FKs
            rows = await this.hydrate(tableName, rows, lang);

            return {
                data: rows,
                total: total.count,
                page,
                pages: Math.ceil(total.count / limit)
            };
        } catch (error) {
            console.error(`Search failed for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get single record by ID (fully hydrated with ALL translations)
     */
    async getById(tableName, id, lang = 'ar') {
        try {
            const row = await this.knex(tableName).where({ id }).first();
            if (!row) return null;

            // 1. Hydrate with display name for context lang
            let [hydrated] = await this.hydrate(tableName, [row], lang);

            // 2. Attach ALL translations for edit form
            if (this.schema.isTranslatable(tableName)) {
                const langTable = `${tableName}_lang`;
                const fkColumn = `${tableName}_id`;

                const translations = await this.knex(langTable)
                    .where(fkColumn, id)
                    .select('*');

                hydrated.translations = translations;
            }

            return hydrated;
        } catch (error) {
            console.error(`GetById failed for ${tableName}/${id}:`, error.message);
            throw error;
        }
    }

    /**
     * Save (INSERT or UPDATE) with translation handling
     */
    async save(tableName, dto, userId = 'system') {
        const trx = await this.knex.transaction();

        try {
            const tableDef = this.schema.tables.get(tableName.toLowerCase());
            if (!tableDef) {
                throw new Error(`Table ${tableName} not found in schema`);
            }

            // Extract base fields (non-translation, non-nested objects)
            const baseFields = {};
            tableDef.fields.forEach(f => {
                const value = dto[f.columnName];
                if (value !== undefined && typeof value !== 'object') {
                    baseFields[f.columnName] = value;
                }
            });

            // Check INSERT or UPDATE
            const exists = dto.id && await trx(tableName).where({ id: dto.id }).first();
            const action = exists ? 'UPDATE' : 'INSERT';

            // Generate ID for INSERT
            if (!dto.id) {
                dto.id = crypto.randomUUID();
                baseFields.id = dto.id;
            }

            // Save base record
            if (action === 'INSERT') {
                await trx(tableName).insert(baseFields);
            } else {
                await trx(tableName).where({ id: dto.id }).update(baseFields);
            }

            // Handle translations
            if (dto.translations && this.schema.isTranslatable(tableName)) {
                await this.saveTranslations(trx, tableName, dto.id, dto.translations);
            }

            await trx.commit();

            // Return hydrated result
            return await this.getById(tableName, dto.id, 'ar');

        } catch (error) {
            await trx.rollback();
            console.error(`Save failed for ${tableName}:`, error.message);
            throw error;
        }
    }

    /**
     * Save translations (INSERT/UPDATE/DELETE)
     */
    async saveTranslations(trx, tableName, recordId, translations) {
        const langTable = `${tableName}_lang`;
        const fkColumn = `${tableName}_id`;

        for (const trans of translations) {
            if (trans.id) {
                // Update existing
                await trx(langTable).where({ id: trans.id }).update({
                    lang: trans.lang,
                    ...this.extractTranslationFields(langTable, trans)
                });
            } else {
                // Insert new
                const newTrans = {
                    id: crypto.randomUUID(),
                    [fkColumn]: recordId,
                    lang: trans.lang,
                    ...this.extractTranslationFields(langTable, trans)
                };
                await trx(langTable).insert(newTrans);
            }
        }

        // Delete removed translations
        const keptIds = translations.filter(t => t.id).map(t => t.id);
        if (keptIds.length > 0) {
            await trx(langTable)
                .where(fkColumn, recordId)
                .whereNotIn('id', keptIds)
                .delete();
        } else if (translations.length === 0) {
            // Delete all if no translations provided
            await trx(langTable).where(fkColumn, recordId).delete();
        }
    }

    /**
     * Extract translation fields (name, description, etc.)
     */
    extractTranslationFields(langTable, trans) {
        const fields = {};
        const langTableDef = this.schema.tables.get(langTable.toLowerCase());

        if (langTableDef) {
            langTableDef.fields.forEach(f => {
                if (trans[f.columnName] !== undefined &&
                    !['id', 'lang', 'created_date'].includes(f.columnName) &&
                    !f.columnName.endsWith('_id')) {
                    fields[f.columnName] = trans[f.columnName];
                }
            });
        }

        return fields;
    }

    /**
     * Delete record
     */
    async delete(tableName, id, hardDelete = false) {
        try {
            if (hardDelete) {
                await this.knex(tableName).where({ id }).delete();
            } else {
                // Soft delete
                await this.knex(tableName).where({ id }).update({ is_active: false });
            }
            return true;
        } catch (error) {
            console.error(`Delete failed for ${tableName}/${id}:`, error.message);
            throw error;
        }
    }

    /**
     * 🔥 HYDRATOR: The Core Intelligence
     */
    async hydrate(tableName, rows, lang) {
        if (!rows || rows.length === 0) return rows;

        const tableDef = this.schema.tables.get(tableName.toLowerCase());
        if (!tableDef) return rows;

        // 1. Attach display name from _lang table
        if (this.schema.isTranslatable(tableName)) {
            rows = await this.attachDisplayName(tableName, rows, lang);
        }

        // 2. Resolve all FK fields
        const fkFields = tableDef.fields.filter(f => f.references);

        for (const fkField of fkFields) {
            rows = await this.resolveForeignKey(
                rows,
                fkField.columnName,
                fkField.references.table,
                lang
            );
        }

        return rows;
    }

    /**
     * Attach display name based on language
     */
    async attachDisplayName(tableName, rows, lang) {
        const langTable = `${tableName}_lang`;
        const fkColumn = `${tableName}_id`;
        const ids = rows.map(r => r.id);

        // Fetch translations for requested lang
        let translations = await this.knex(langTable)
            .whereIn(fkColumn, ids)
            .where({ lang })
            .select('*');

        // Fallback to default language if not found
        if (translations.length < ids.length) {
            const defaultLang = await this.getDefaultLanguage();
            if (defaultLang !== lang) {
                const fallbackTrans = await this.knex(langTable)
                    .whereIn(fkColumn, ids)
                    .where({ lang: defaultLang })
                    .select('*');

                // Merge fallback translations
                const existingIds = new Set(translations.map(t => t[fkColumn]));
                fallbackTrans.forEach(t => {
                    if (!existingIds.has(t[fkColumn])) {
                        translations.push(t);
                    }
                });
            }
        }

        // Map translations to rows
        const transMap = new Map();
        translations.forEach(t => {
            transMap.set(t[fkColumn], t);
        });

        return rows.map(row => {
            const trans = transMap.get(row.id);
            if (trans) {
                const displayField = this.schema.getDisplayField(tableName);
                row[displayField] = trans[displayField] || row.id;
            }
            return row;
        });
    }

    /**
     * Resolve FK to {id, name} object
     */
    async resolveForeignKey(rows, fkColumn, targetTable, lang) {
        const fkIds = [...new Set(rows.map(r => r[fkColumn]).filter(Boolean))];
        if (!fkIds.length) return rows;

        // Fetch target records
        let targets = await this.knex(targetTable).whereIn('id', fkIds);

        // Hydrate targets (RECURSIVE!)
        targets = await this.hydrate(targetTable, targets, lang);

        // Build lookup map
        const displayField = this.schema.getDisplayField(targetTable);
        const targetMap = new Map();
        targets.forEach(t => {
            targetMap.set(t.id, {
                id: t.id,
                name: t[displayField] || t.id
            });
        });

        // Inject into rows as object
        const objName = fkColumn.replace(/_id$/i, '');
        return rows.map(row => {
            if (row[fkColumn] && targetMap.has(row[fkColumn])) {
                row[objName] = targetMap.get(row[fkColumn]);
            }
            return row;
        });
    }

    /**
     * Apply smart search across multiple fields
     */
    async applySmartSearch(query, tableName, searchTerm, lang) {
        const tableDef = this.schema.tables.get(tableName.toLowerCase());
        const searchPattern = `%${searchTerm}%`;

        // Get searchable fields from schema or use defaults
        const smartFeatures = tableDef.smart_features;
        let searchFields = [];

        if (smartFeatures?.search_fields) {
            searchFields = smartFeatures.search_fields;
        } else {
            // Default: all nvarchar fields in base table
            searchFields = tableDef.fields
                .filter(f => f.type === 'nvarchar')
                .map(f => f.columnName);
        }

        // Split into base table fields and lang table fields
        const baseFields = searchFields.filter(f => !f.includes('.'));
        const langFields = searchFields.filter(f => f.includes('_lang.'));

        return query.where(function () {
            // Search in base table
            baseFields.forEach((field, idx) => {
                if (idx === 0) {
                    this.where(field, 'like', searchPattern);
                } else {
                    this.orWhere(field, 'like', searchPattern);
                }
            });

            // Search in lang table
            if (langFields.length > 0 && this.schema.isTranslatable(tableName)) {
                const langTable = `${tableName}_lang`;
                const fkColumn = `${tableName}_id`;

                this.orWhereIn('id', function () {
                    this.select(fkColumn)
                        .from(langTable)
                        .where({ lang })
                        .andWhere(function () {
                            langFields.forEach((field, idx) => {
                                const fieldName = field.split('.')[1];
                                if (idx === 0) {
                                    this.where(fieldName, 'like', searchPattern);
                                } else {
                                    this.orWhere(fieldName, 'like', searchPattern);
                                }
                            });
                        });
                });
            }
        });
    }
}
