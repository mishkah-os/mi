
import fs from 'fs';
import path from 'path';

const SCHEMA_PATH = String.raw`d:\git\os\data\schemas\clinic_schema.json`;
const SEED_PATH = String.raw`d:\git\os\data\branches\pt\modules\clinic\seeds\initial.json`;

function reorder() {
    console.log('🔄 Reordering tables to keep translations next to source...');

    // 1. Reorder Schema
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schemaJson = JSON.parse(schemaContent);

    const sortedSchemaTables = [];
    const processedSchemaTables = new Set();
    const schemaTablesMap = new Map();
    schemaJson.schema.tables.forEach(t => schemaTablesMap.set(t.name, t));

    // Sort function logic:
    // Iterate through original order. If we encounter a table, add it.
    // Check if it has a corresponding _lang table. If so, add that immediately after.
    // If we encounter a _lang table that was already added, skip it.

    schemaJson.schema.tables.forEach(table => {
        if (processedSchemaTables.has(table.name)) return;

        // Add current table
        sortedSchemaTables.push(table);
        processedSchemaTables.add(table.name);

        // Check for translation
        const langName = `${table.name}_lang`;
        if (schemaTablesMap.has(langName) && !processedSchemaTables.has(langName)) {
            sortedSchemaTables.push(schemaTablesMap.get(langName));
            processedSchemaTables.add(langName);
        }
    });

    schemaJson.schema.tables = sortedSchemaTables;
    fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schemaJson, null, 4));
    console.log('✅ Schema tables reordered.');

    // 2. Reorder Seeds
    const seedContent = fs.readFileSync(SEED_PATH, 'utf8');
    const seedJson = JSON.parse(seedContent);
    const seedTables = seedJson.tables;

    const newSeedTables = {};
    const processedSeedKeys = new Set();
    const seedKeys = Object.keys(seedTables);

    // Similar logic for seeds (object keys)
    seedKeys.forEach(tableName => {
        if (processedSeedKeys.has(tableName)) return;

        // Check if this is a lang table (ends with _lang)
        // If it is, and we haven't processed its parent, maybe we should wait?
        // Actually, best to iterate and if we find a "Base" table, add it then its lang.
        // But what if the seeds are random?
        // Let's rely on the fact that we want to group them.
        // We can just loop through the keys. If a key is NOT a _lang table, add it, then check for _lang.
        // If a key IS a _lang table, check if we already processed it (via parent). If not, add it (orphan or parent missing?).

        if (tableName.endsWith('_lang')) {
            // It's a lang table. 
            // If we already added it (because we found parent first), skip.
            // If parent doesn't exist or wasn't processed yet, we might validly add it now?
            // Ideally we want Parent -> Lang.
            // So if we hit Lang first, maybe we should find Parent, add Parent, then Lang?
            const parentName = tableName.replace('_lang', '');
            if (seedTables[parentName] && !processedSeedKeys.has(parentName)) {
                newSeedTables[parentName] = seedTables[parentName];
                processedSeedKeys.add(parentName);

                newSeedTables[tableName] = seedTables[tableName];
                processedSeedKeys.add(tableName);
            } else if (!processedSeedKeys.has(tableName)) {
                // Parent already processed or doesn't exist.
                newSeedTables[tableName] = seedTables[tableName];
                processedSeedKeys.add(tableName);
            }
        } else {
            // Not a lang table.
            newSeedTables[tableName] = seedTables[tableName];
            processedSeedKeys.add(tableName);

            const langName = `${tableName}_lang`;
            if (seedTables[langName] && !processedSeedKeys.has(langName)) {
                newSeedTables[langName] = seedTables[langName];
                processedSeedKeys.add(langName);
            }
        }
    });

    seedJson.tables = newSeedTables;
    fs.writeFileSync(SEED_PATH, JSON.stringify(seedJson, null, 4));
    console.log('✅ Seed tables reordered.');
}

reorder();
