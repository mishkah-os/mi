// Initialize Clinic Database with Knex
// Creates all tables from clinic_schema.json
import knex from 'knex';
import knexConfig from '../../knexfile.js';
import { SchemaToKnexAdapter } from './schema-to-knex.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeClinicDB() {
    console.log('\n🏥 Initializing Clinic Database with Knex...\n');

    const env = process.env.NODE_ENV || 'development';
    const config = knexConfig[env];
    const db = knex(config);

    try {
        // Test connection
        await db.raw('SELECT 1+1 as result');
        console.log('✅ Database connection established\n');

        // Load schema
        const schemaPath = path.join(__dirname, '../../data/schemas/clinic_schema.json');
        const adapter = new SchemaToKnexAdapter(schemaPath);

        // Get all tables (ordered: base tables first, then _lang tables)
        const allTables = adapter.getAllTables();
        const baseTables = allTables.filter(t => !t.endsWith('_lang'));
        const langTables = allTables.filter(t => t.endsWith('_lang'));

        console.log(`📋 Found ${baseTables.length} base tables, ${langTables.length} translation tables\n`);

        // Create base tables first
        console.log('Creating base tables...');
        for (const tableName of baseTables) {
            await adapter.createTable(db, tableName);
        }

        // Create translation tables
        console.log('\nCreating translation tables...');
        for (const tableName of langTables) {
            await adapter.createTable(db, tableName);
        }

        // Add foreign keys (after all tables exist)
        console.log('\nAdding foreign key constraints...');
        for (const tableName of [...baseTables, ...langTables]) {
            await adapter.createForeignKeys(db, tableName);
        }

        console.log('\n✅ Clinic database initialized successfully!');
        console.log(`📊 Total tables created: ${baseTables.length + langTables.length}`);

    } catch (error) {
        console.error('\n❌ Database initialization failed:');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

// Run automatically
initializeClinicDB().catch(console.error);
