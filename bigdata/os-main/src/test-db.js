const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Mock Config Path
const configPath = path.resolve(__dirname, '../core_config/tenants.secure.json');

async function testConnection() {
    console.log('1. Reading Config from:', configPath);
    const raw = fs.readFileSync(configPath, 'utf8');
    const conf = JSON.parse(raw);
    const dbConfig = conf.tenants['demo_clinic'].db_config;

    console.log('2. Connecting to DB:', {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.name
    });

    const client = new Client({
        user: dbConfig.user,
        host: dbConfig.host,
        database: dbConfig.name,
        password: 'T4A3u2690iBD4N2G0n4V230za', // Using the known password
        port: dbConfig.port,
    });

    try {
        await client.connect();
        console.log('3. Connected! executing query...');

        // Use a safe system query to avoid "table not found" errors
        const res = await client.query('SELECT version(), current_user, current_database()');

        console.log('4. Success! DB Info:', res.rows[0]);
        await client.end();
        console.log('5. Connection Closed.');
    } catch (err) {
        console.error('X. Connection Failed:', err.message);
    }
}

testConnection();
