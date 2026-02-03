
import fs from 'fs';
import path from 'path';

const SCHEMA_PATH = String.raw`d:\git\os\data\schemas\clinic_schema.json`;

function analyze() {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(raw);
    const tables = schema.schema.tables;

    const report = [];

    tables.forEach(table => {
        const candidates = table.fields.filter(f =>
            (f.name.toLowerCase().includes('name') ||
                f.name.toLowerCase().endsWith('_ar') ||
                f.name.toLowerCase().endsWith('_en')) &&
            // Exclude already processed/system fields if obvious
            !f.name.endsWith('id') &&
            f.name !== 'sqlName'
        );

        if (candidates.length > 0) {
            report.push({
                table: table.name,
                candidates: candidates.map(c => ({
                    name: c.name,
                    suggestion: suggestName(c.name)
                }))
            });
        }
    });

    console.log(JSON.stringify(report, null, 2));
}

function suggestName(colName) {
    let base = colName.replace(/_ar$/, '').replace(/_en$/, '');
    return base;
}

analyze();
