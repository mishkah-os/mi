// CLI tool to sync all audit tables
import knex from 'knex';
import knexConfig from '../../knexfile.js';
import { SchemaToKnexAdapter } from './schema-to-knex.js';
import { AuditManager } from './audit-manager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function syncAuditTables() {
    console.log('🏥 Syncing Clinic Audit Tables...\n');

    const env = process.env.NODE_ENV || 'development';
    const config = knexConfig[env];
    const db = knex(config);

    try {
        // Test connection
        await db.raw('SELECT 1+1 as result');
        console.log('✅ Database connected\n');

        // Load schema
        const schemaPath = path.join(__dirname, '../../data/schemas/clinic_schema.json');
        const schema = new SchemaToKnexAdapter(schemaPath);

        // Initialize audit manager
        const auditMgr = new AuditManager(db, schema);

        // Sync all audit tables
        await auditMgr.syncAllAuditTables();

    } catch (error) {
        console.error('\n❌ Sync failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

// Run
syncAuditTables().catch(console.error);
