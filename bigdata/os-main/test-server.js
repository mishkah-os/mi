// Standalone Test Server for Clinic + Knex ORM
// Completely isolated from main POS server
import express from 'express';
import cors from 'cors';
import knex from 'knex';
import knexConfig from './knexfile.js';
import { SchemaManager } from './src/orm/schema-manager.js';
import { UniversalCrudEngine } from './src/backend/UniversalCrudEngine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.TEST_PORT || 3001; // Different port!

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('static')); // Serve static files

// Initialize Knex
const env = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[env]);

// Initialize Schema Manager (Single Source of Truth)
const schemaPath = path.join(__dirname, 'data/schemas/clinic_schema.json');
const seedPath = path.join(__dirname, 'data/branches/pt/modules/clinic/seeds/initial.json');
const schemaMgr = new SchemaManager(db, schemaPath);

// Initialize Universal CRUD Engine
const crudEngine = new UniversalCrudEngine(db, schemaMgr.schema);

console.log('🏥 Clinic Test Server Starting...\n');

// Test connection
try {
    await db.raw('SELECT 1+1 as result');
    console.log('✅ Database connected\n');
} catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
}

// 🔥 Auto-sync database with schema (schema-driven!)
try {
    await schemaMgr.syncDatabase();

    // Load seeds if database is empty
    const hasData = await db('companies').count('* as count').first();
    if (!hasData || hasData.count === 0) {
        console.log('📦 Empty database detected, loading real seeds...\n');
        await schemaMgr.loadSeeds(seedPath);
    }
} catch (error) {
    console.error('❌ Schema sync failed:', error.message);
    process.exit(1);
}

// ==================== REST API ====================

// POST /api/v1/crud/:table/search - Universal search
app.post('/api/v1/crud/:table/search', async (req, res) => {
    const { table } = req.params;
    const { lang = 'ar', q, filters, page = 1, limit = 50 } = req.body;

    try {
        console.log(`🔍 POST /api/v1/crud/${table}/search`);

        const result = await crudEngine.search(table, {
            lang,
            q,
            filters,
            page,
            limit
        });

        console.log(`✅ Returned ${result.data.length} records\n`);
        res.json(result);

    } catch (error) {
        console.error(`❌ Search failed for ${table}:`, error.message);
        res.status(500).json({ error: 'search-failed', message: error.message });
    }
});

// GET /api/v1/crud/match/:table - Legacy support (redirects to search)
app.get('/api/v1/crud/match/:table', async (req, res) => {
    const { table } = req.params;
    const { lang = 'ar', q } = req.query;

    try {
        const result = await crudEngine.search(table, {
            lang,
            q,
            page: 1,
            limit: 100
        });

        res.json(result.data);
    } catch (error) {
        console.error(`❌ Error:`, error.message);
        res.status(500).json({ error: 'fetch-failed', message: error.message });
    }
});

// GET /api/v1/crud/:table/:id - Get single record
app.get('/api/v1/crud/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    const { lang = 'ar' } = req.query;

    try {
        console.log(`📄 GET /api/v1/crud/${table}/${id}`);

        const record = await crudEngine.getById(table, id, lang);

        if (!record) {
            return res.status(404).json({ error: 'record-not-found', id });
        }

        res.json(record);

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'fetch-failed', message: error.message });
    }
});

// POST /api/v1/crud/:table - Create/Update record
app.post('/api/v1/crud/:table', async (req, res) => {
    const { table } = req.params;
    const dto = req.body;
    const userId = req.headers['x-user-id'] || 'system';

    try {
        console.log(`💾 POST /api/v1/crud/${table}`);

        const result = await crudEngine.save(table, dto, userId);

        console.log(`✅ Saved: ${result.id}\n`);
        res.status(dto.id ? 200 : 201).json(result);

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'save-failed', message: error.message });
    }
});

// DELETE /api/v1/crud/:table/:id - Delete record
app.delete('/api/v1/crud/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    const { hard = false } = req.query;

    try {
        console.log(`🗑️  DELETE /api/v1/crud/${table}/${id}`);

        await crudEngine.delete(table, id, hard === 'true');

        console.log(`✅ Deleted: ${id}\n`);
        res.json({ success: true });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'delete-failed', message: error.message });
    }
});

// GET /api/v1/languages - Get active languages
app.get('/api/v1/languages', async (req, res) => {
    try {
        const languages = await db('languages')
            .where({ is_active: true })
            .orderBy('is_default', 'desc')
            .select('*');

        res.json(languages);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'fetch-failed', message: error.message });
    }
});

// ==================== Helper Functions ====================

async function attachTranslations(tableName, rows, lang) {
    if (!rows.length) return rows;

    const langTable = `${tableName}_lang`;
    const hasLangTable = await db.schema.hasTable(langTable);
    if (!hasLangTable) return rows;

    const ids = rows.map(r => r.id);
    const translations = await db(langTable)
        .whereIn(`${tableName}_id`, ids)
        .where({ lang });

    // Merge translations into rows
    const translationsMap = new Map();
    translations.forEach(t => {
        translationsMap.set(t[`${tableName}_id`], t);
    });

    return rows.map(row => {
        const trans = translationsMap.get(row.id);
        if (trans) {
            const displayField = schemaMgr.schema.getDisplayField(tableName);
            row[displayField] = trans[displayField] || row[displayField];
        }
        return row;
    });
}

async function hydrateForeignKeys(tableName, rows, lang) {
    if (!rows.length) return rows;

    const tableDef = schemaMgr.schema.tables.get(tableName.toLowerCase());
    if (!tableDef) return rows;

    const fkFields = tableDef.fields.filter(f => f.references);
    if (!fkFields.length) return rows;

    // Collect all FKs
    for (const field of fkFields) {
        const targetTable = field.references.table;
        const ids = [...new Set(rows.map(r => r[field.columnName]).filter(Boolean))];

        if (!ids.length) continue;

        // Fetch target records
        let targets = await db(targetTable).whereIn('id', ids).select('*');

        // Attach translations to targets
        if (schemaMgr.schema.isTranslatable(targetTable)) {
            targets = await attachTranslations(targetTable, targets, lang);
        }

        // Build lookup map
        const displayField = schemaMgr.schema.getDisplayField(targetTable);
        const targetMap = new Map();
        targets.forEach(t => {
            targetMap.set(t.id, {
                id: t.id,
                name: t[displayField] || t.id
            });
        });

        // Inject into rows
        for (const row of rows) {
            const fkValue = row[field.columnName];
            if (fkValue && targetMap.has(fkValue)) {
                const objName = field.columnName.replace(/_id$/i, '');
                row[objName] = targetMap.get(fkValue);
            }
        }
    }

    return rows;
}

// ==================== Start Server ====================

app.listen(PORT, () => {
    console.log(`\n🚀 Clinic Test Server running on http://localhost:${PORT}`);
    console.log(`📋 CRUD UI: http://localhost:${PORT}/crud-knex.html`);
    console.log(`🔌 API Base: http://localhost:${PORT}/api/v1/crud\n`);
    console.log('Press Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    await db.destroy();
    process.exit(0);
});
