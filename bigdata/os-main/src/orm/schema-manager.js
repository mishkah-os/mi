// Schema Manager - Single Source of Truth
// Auto-syncs DB with clinic_schema.json
import { SchemaToKnexAdapter } from './schema-to-knex.js';
import { AuditManager } from './audit-manager.js';

export class SchemaManager {
    constructor(knex, schemaPath) {
        this.knex = knex;
        this.schemaPath = schemaPath;
        this.schema = new SchemaToKnexAdapter(schemaPath);
        this.auditMgr = new AuditManager(knex, this.schema);
    }

    /**
     * Auto-sync database with schema
     * Creates missing tables, detects schema changes
     */
    async syncDatabase() {
        console.log('\n🔄 Auto-syncing database with schema...\n');

        const allTables = this.schema.getAllTables();
        const baseTables = allTables.filter(t => !t.endsWith('_lang'));
        const langTables = allTables.filter(t => t.endsWith('_lang'));

        let created = 0;
        let skipped = 0;

        // 1. Create base tables
        console.log('📋 Syncing base tables...');
        for (const tableName of baseTables) {
            const exists = await this.knex.schema.hasTable(tableName);

            if (!exists) {
                await this.schema.createTable(this.knex, tableName);
                created++;
            } else {
                // TODO: Detect schema changes and apply migrations
                skipped++;
            }
        }

        // 2. Create translation tables
        console.log('\n📋 Syncing translation tables...');
        for (const tableName of langTables) {
            const exists = await this.knex.schema.hasTable(tableName);

            if (!exists) {
                await this.schema.createTable(this.knex, tableName);
                created++;
            } else {
                skipped++;
            }
        }

        // 3. Add foreign keys
        console.log('\n🔗 Syncing foreign keys...');
        for (const tableName of [...baseTables, ...langTables]) {
            await this.schema.createForeignKeys(this.knex, tableName);
        }

        console.log(`\n✅ Schema sync complete: ${created} created, ${skipped} existing\n`);
    }

    /**
     * Reset database to clean state
     * Drops all tables (except _schema_metadata)
     */
    async resetDatabase() {
        console.log('\n⚠️  Resetting database to clean state...\n');

        // Get all tables
        const tables = await this.knex.raw(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      AND name != '_schema_metadata'
    `);

        // Drop all tables
        for (const table of tables) {
            console.log(`🗑️  Dropping: ${table.name}`);
            await this.knex.schema.dropTableIfExists(table.name);
        }

        console.log('\n✅ Database reset complete\n');
    }

    /**
   * Load seed data from initial.json (real format)
   */
    async loadSeeds(seedPath) {
        console.log('\n🌱 Loading seed data...\n');

        const fs = await import('fs');

        try {
            // Load the real initial.json file
            const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

            // Structure: { tables: { table_name: [...rows] } }
            const tables = seedData.tables || {};

            for (const [tableName, rows] of Object.entries(tables)) {
                if (!Array.isArray(rows) || rows.length === 0) continue;

                console.log(`📦 Loading ${tableName} (${rows.length} records)...`);

                try {
                    for (const row of rows) {
                        await this.knex(tableName)
                            .insert(row)
                            .onConflict('id')
                            .ignore();
                    }

                    console.log(`  ✅ Loaded ${rows.length} records`);
                } catch (error) {
                    console.error(`  ❌ Failed: ${error.message}`);
                }
            }

            console.log('\n✅ Seeds loaded\n');
        } catch (error) {
            console.error('❌ Seed loading failed:', error.message);
            throw error;
        }
    }

    /**
     * Ensure audit table exists (lazy creation)
     * Called on first UPDATE for a table
     */
    async ensureAuditTable(tableName) {
        return await this.auditMgr.ensureAuditTable(tableName);
    }

    /**
     * Record audit entry
     */
    async recordAudit(tableName, action, record, userId) {
        // Lazy audit table creation
        await this.ensureAuditTable(tableName);
        return await this.auditMgr.recordAudit(tableName, action, record, userId);
    }

    /**
     * Full reset and reseed
     */
    async resetAndReseed(seedsDir) {
        await this.resetDatabase();
        await this.syncDatabase();
        await this.loadSeeds(seedsDir);
    }
}
