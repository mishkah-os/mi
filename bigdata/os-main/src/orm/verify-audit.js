// Quick verification script
import knex from 'knex';
import knexConfig from '../../knexfile.js';

const db = knex(knexConfig.development);

try {
    // Get all audit tables
    const tables = await db.raw(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name LIKE '%audit_log'
    ORDER BY name
    LIMIT 10
  `);

    console.log('\n📋 Sample Audit Tables:');
    tables.forEach(t => console.log(`  - ${t.name}`));

    // Check companies_audit_log structure
    console.log('\n🔍 companies_audit_log structure:');
    const columns = await db.raw(`PRAGMA table_info(companies_audit_log)`);
    columns.forEach(col => {
        console.log(`  ${col.name.padEnd(25)} ${col.type.padEnd(15)} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
    });

    // Check metadata
    console.log('\n📊 Schema Metadata:');
    const metadata = await db('_schema_metadata').select('*').limit(5);
    console.table(metadata);

} catch (error) {
    console.error('Error:', error.message);
} finally {
    await db.destroy();
}
