// Smart Audit Manager - Auto-creates and syncs audit tables
import crypto from 'crypto';

export class AuditManager {
    constructor(knex, schemaAdapter) {
        this.knex = knex;
        this.schema = schemaAdapter;

        // Exclusion list (very small!)
        this.exclusions = new Set([
            '_schema_metadata',  // Our own metadata table
            'sqlite_sequence'    // SQLite internal
            // That's it! Everything else gets audited.
        ]);
    }

    /**
     * Check if table should be audited
     * Rule: AUDIT EVERYTHING except exclusions
     */
    shouldAudit(tableName) {
        // Skip if in exclusion list
        if (this.exclusions.has(tableName)) return false;

        // Skip if already an audit table
        if (tableName.endsWith('_log')) return false;

        // Skip if system table (starts with _)
        if (tableName.startsWith('_')) return false;

        // Everything else: AUDIT IT!
        return true;
    }

    /**
     * Initialize metadata table
     */
    async initializeMetadata() {
        const exists = await this.knex.schema.hasTable('_schema_metadata');

        if (!exists) {
            await this.knex.schema.createTable('_schema_metadata', (t) => {
                t.string('table_name').primary();
                t.string('schema_fingerprint', 32);
                t.datetime('last_sync_at');
                t.datetime('created_at').defaultTo(this.knex.fn.now());
            });

            console.log('✅ Created _schema_metadata table');
        }
    }

    /**
     * Get schema fingerprint (MD5 hash of structure)
     */
    async getSchemaFingerprint(tableName) {
        try {
            // Get table structure
            const columns = await this.knex.raw(`PRAGMA table_info(${tableName})`);

            if (!columns || columns.length === 0) {
                return null;
            }

            // Create fingerprint from column definitions
            const fingerprint = columns
                .map(col => `${col.name}:${col.type}:${col.notnull}:${col.pk}`)
                .sort()
                .join('|');

            return crypto.createHash('md5').update(fingerprint).digest('hex');
        } catch (error) {
            console.error(`Failed to get fingerprint for ${tableName}:`, error.message);
            return null;
        }
    }

    /**
     * Detect if schema changed
     */
    async detectSchemaChange(tableName) {
        const currentFingerprint = await this.getSchemaFingerprint(tableName);

        if (!currentFingerprint) return false;

        const metadata = await this.knex('_schema_metadata')
            .where({ table_name: tableName })
            .first();

        // First time seeing this table
        if (!metadata) return true;

        // Compare fingerprints
        return metadata.schema_fingerprint !== currentFingerprint;
    }

    /**
     * Archive old audit table with timestamp
     */
    async archiveOldAudit(tableName) {
        const oldAudit = `${tableName}_audit_log`;

        const exists = await this.knex.schema.hasTable(oldAudit);
        if (!exists) return null;

        // Generate timestamp: YYYYMMDD
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const archived = `${tableName}_audit_${timestamp}_log`;

        // Check if archived name already exists (multiple changes same day)
        let finalName = archived;
        let counter = 1;
        while (await this.knex.schema.hasTable(finalName)) {
            finalName = `${tableName}_audit_${timestamp}_${counter}_log`;
            counter++;
        }

        // Rename old audit table
        await this.knex.schema.renameTable(oldAudit, finalName);

        console.log(`📦 Archived: ${oldAudit} → ${finalName}`);
        return finalName;
    }

    /**
     * Create audit table (mirrors main table + audit metadata)
     */
    async createAuditTable(tableName) {
        const auditTableName = `${tableName}_audit_log`;
        const tableDef = this.schema.tables.get(tableName.toLowerCase());

        if (!tableDef) {
            console.warn(`⚠️  No schema definition for ${tableName}, skipping audit`);
            return false;
        }

        console.log(`🔨 Creating audit table: ${auditTableName}`);

        await this.knex.schema.createTable(auditTableName, (t) => {
            // Mirror all columns from main table (all nullable in audit)
            for (const field of tableDef.fields) {
                const knexType = this.schema.mapFieldType(field);
                let column;

                if (knexType === 'string' && field.maxLength) {
                    column = t[knexType](field.columnName, field.maxLength);
                } else if (knexType === 'decimal' && field.precision) {
                    column = t.decimal(field.columnName, field.precision, field.scale || 2);
                } else {
                    column = t[knexType](field.columnName);
                }

                // All audit columns are nullable
                column.nullable();
            }

            // Add audit metadata columns
            t.increments('_audit_id').primary();
            t.string('_audit_action', 10).notNullable(); // INSERT, UPDATE, DELETE
            t.string('_audit_user', 100);
            t.datetime('_audit_timestamp').defaultTo(this.knex.fn.now());
            t.integer('_audit_version');

            // Indexes for performance
            if (tableDef.fields.some(f => f.columnName === 'id')) {
                t.index('id', `idx_${tableName}_audit_id`);
            }
            t.index('_audit_timestamp', `idx_${tableName}_audit_ts`);
            t.index('_audit_action', `idx_${tableName}_audit_action`);
        });

        console.log(`✅ Audit table created: ${auditTableName}`);
        return true;
    }

    /**
     * Ensure audit table exists and is synced
     */
    async ensureAuditTable(tableName) {
        if (!this.shouldAudit(tableName)) return false;

        // 1. Initialize metadata table if needed
        await this.initializeMetadata();

        // 2. Check if schema changed
        const schemaChanged = await this.detectSchemaChange(tableName);

        if (schemaChanged) {
            const auditExists = await this.knex.schema.hasTable(`${tableName}_audit_log`);

            if (auditExists) {
                console.log(`🔄 Schema changed for ${tableName}, archiving old audit...`);
                await this.archiveOldAudit(tableName);
            }
        }

        // 3. Create/recreate audit table
        const auditTableName = `${tableName}_audit_log`;
        const exists = await this.knex.schema.hasTable(auditTableName);

        if (!exists || schemaChanged) {
            // Drop if exists (already archived above)
            if (exists) {
                await this.knex.schema.dropTable(auditTableName);
            }

            await this.createAuditTable(tableName);
        }

        // 4. Update metadata
        await this.updateSchemaMetadata(tableName);

        return true;
    }

    /**
     * Update schema metadata
     */
    async updateSchemaMetadata(tableName) {
        const fingerprint = await this.getSchemaFingerprint(tableName);

        if (!fingerprint) return;

        await this.knex('_schema_metadata')
            .insert({
                table_name: tableName,
                schema_fingerprint: fingerprint,
                last_sync_at: new Date().toISOString()
            })
            .onConflict('table_name')
            .merge();
    }

    /**
     * Record audit entry
     */
    async recordAudit(tableName, action, record, userId = 'system') {
        if (!this.shouldAudit(tableName)) return false;

        const auditTableName = `${tableName}_audit_log`;

        try {
            // Ensure audit table exists
            await this.ensureAuditTable(tableName);

            // Insert audit record
            await this.knex(auditTableName).insert({
                ...record,
                _audit_action: action,
                _audit_user: userId,
                _audit_timestamp: new Date().toISOString(),
                _audit_version: record.version || null
            });

            return true;
        } catch (error) {
            console.error(`❌ Failed to record audit for ${tableName}:`, error.message);
            // Don't throw - audit failure shouldn't break main operation
            return false;
        }
    }

    /**
     * Sync all audit tables (run on startup or migration)
     */
    async syncAllAuditTables() {
        console.log('\n🔄 Syncing all audit tables...\n');

        const tables = this.schema.getAllTables();
        let synced = 0;
        let skipped = 0;

        for (const tableName of tables) {
            if (this.shouldAudit(tableName)) {
                try {
                    await this.ensureAuditTable(tableName);
                    synced++;
                } catch (error) {
                    console.error(`❌ Failed to sync audit for ${tableName}:`, error.message);
                }
            } else {
                skipped++;
            }
        }

        console.log(`\n✅ Audit sync complete: ${synced} tables synced, ${skipped} skipped\n`);
    }
}
