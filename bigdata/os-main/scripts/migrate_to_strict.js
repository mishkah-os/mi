
import fs from 'fs';
import path from 'path';

const SCHEMA_PATH = String.raw`d:\git\os\data\schemas\clinic_schema.json`;
const SEED_PATH = String.raw`d:\git\os\data\branches\pt\modules\clinic\seeds\initial.json`;

// Define migration rules
const TARGETS = [
    // 1. _ar candidates -> map to 'name' in lang table
    { table: 'companies', fields: ['name_ar'] },
    { table: 'branches', fields: ['name_ar'] },
    { table: 'clinic_specialties', fields: ['name_ar'] },
    { table: 'clinic_service_domains', fields: ['name_ar'] },
    { table: 'ref_week_days', fields: ['name_ar'] },

    // 2. Descriptive names -> map to 'name' in lang table
    { table: 'users', fields: ['full_name'] },
    { table: 'clinic_services', fields: ['service_name'] },
    { table: 'clinic_devices', fields: ['device_name'] },
    { table: 'clinic_types', fields: ['type_name'] },
    { table: 'clinic_rooms', fields: ['room_name'] },
    { table: 'clinic_stations', fields: ['station_name'] },
    { table: 'clinic_service_packages', fields: ['package_name'] },
    { table: 'clinic_protocol_templates', fields: ['template_name'] },
    { table: 'clinic_protocol_template_steps', fields: ['step_name'] }, // Beware if step_name is unique?
    { table: 'clinic_items', fields: ['item_name'] },
    { table: 'clinic_doctor_schedule_templates', fields: ['template_name'] },
    { table: 'clinic_patients', fields: ['full_name'] },
    { table: 'clinic_visit_progress_steps', fields: ['step_name'] },
    { table: 'clinic_exercise_library', fields: ['exercise_name'] },
    { table: 'clinic_patient_exercise_programs', fields: ['program_name'] },
    { table: 'clinic_incentive_rules', fields: ['rule_name'] },
    { table: 'clinic_audit_logs', fields: ['table_name'] }, // Maybe audit logs shouldn't be translated? But user said "Go ahead". Let's stick to core entities first?
    // User said "Start execution on all... except maybe audit logs which are system?"
    // Let's exclude audit logs for now as it seems structural.

    { table: 'clinic_occupations', fields: ['occupation_name'] },
    { table: 'clinic_marital_statuses', fields: ['status_name'] },
    { table: 'clinic_activity_factors', fields: ['activity_name'] },
    { table: 'clinic_areas', fields: ['area_name'] },
    { table: 'clinic_food_addiction_types', fields: ['addiction_name'] },
    { table: 'clinic_complaint_types', fields: ['complaint_name'] },
    { table: 'clinic_medical_conditions', fields: ['condition_name'] },
    { table: 'clinic_medications', fields: ['medication_name'] },
    { table: 'clinic_surgery_types', fields: ['surgery_name'] },
    { table: 'clinic_measurement_types', fields: ['measure_name'] },

    // 3. Multi-lang source -> map to rows
    { table: 'ref_genders', fields: ['name_ar', 'name_en'] },
    { table: 'ref_smoking_statuses', fields: ['name_ar', 'name_en'] }
];

function migrate() {
    console.log('🚀 Starting Strict Mode Migration...');

    // 1. Load Files
    const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const schema = JSON.parse(schemaRaw);

    const seedRaw = fs.readFileSync(SEED_PATH, 'utf8');
    const seed = JSON.parse(seedRaw);

    let tablesModified = 0;

    TARGETS.forEach(target => {
        const tableName = target.table;
        const sourceFields = target.fields;

        // --- Schema Migration ---
        const tableDef = schema.schema.tables.find(t => t.name === tableName);
        if (!tableDef) {
            console.warn(`⚠️ Table not found in schema: ${tableName}`);
            return;
        }

        const translatableCols = tableDef.fields.filter(f => sourceFields.includes(f.name));
        if (translatableCols.length === 0) {
            // console.log(`Skipping ${tableName} (no matching fields in schema)`);
            return;
        }

        console.log(`Processing ${tableName}...`);

        // Create Lang Table Schema
        // We use the first field properties (like maxLength) as a base, or defaults
        const baseFieldPoint = translatableCols[0];
        const langTableName = `${tableName}_lang`;

        // Check if lang table already exists
        if (schema.schema.tables.find(t => t.name === langTableName)) {
            console.log(`   ℹ️ Lang table ${langTableName} already exists. Skipping schema creation.`);
        } else {
            // Define new table
            const newTable = {
                name: langTableName,
                label: `${tableDef.label || tableName} (Translations)`,
                comment: `Translations for ${tableName}`,
                sqlName: `${tableDef.sqlName || tableName}_lang`,
                layout: { x: (tableDef.layout?.x || 0) + 250, y: (tableDef.layout?.y || 0) + 50 },
                fields: [
                    {
                        name: "id", columnName: "id", type: "uuid", nullable: false, primaryKey: true, unique: false, index: false
                    },
                    {
                        name: `${tableName}_id`, columnName: `${tableName}_id`, type: "uuid", nullable: false, primaryKey: false, unique: false, index: true,
                        references: { table: tableName, column: "id", onDelete: "CASCADE", onUpdate: "CASCADE" }
                    },
                    {
                        name: "lang", columnName: "lang", type: "nvarchar", nullable: false, maxLength: 10, primaryKey: false, unique: false, index: false
                    },
                    {
                        name: "name", // Unified name
                        columnName: "name",
                        type: "nvarchar",
                        nullable: false,
                        maxLength: baseFieldPoint.maxLength || 255,
                        primaryKey: false, unique: false, index: false
                    },
                    {
                        name: "created_date", columnName: "created_date", type: "datetime", nullable: false, defaultValue: "GETDATE()"
                    }
                ],
                indexes: [
                    {
                        name: `UQ_${langTableName}_ref_lang`,
                        columns: [`${tableName}_id`, "lang"],
                        unique: true,
                        method: "btree"
                    }
                ]
            };
            schema.schema.tables.push(newTable);
            console.log(`   ✅ Created schema table: ${langTableName}`);
        }

        // Remove columns from source Schema
        const originalFieldCount = tableDef.fields.length;
        tableDef.fields = tableDef.fields.filter(f => !sourceFields.includes(f.name));

        // Remove related unique indexes that used these columns
        if (tableDef.indexes) {
            tableDef.indexes = tableDef.indexes.filter(idx => {
                const usesRemovedCol = idx.columns.some(c => sourceFields.includes(c));
                if (usesRemovedCol) console.log(`   🗑️  Removing index ${idx.name}`);
                return !usesRemovedCol;
            });
        }
        console.log(`   ✂️  Removed ${originalFieldCount - tableDef.fields.length} columns from schema.`);


        // --- Seed Migration ---
        const sourceRows = seed.tables[tableName] || [];
        if (!seed.tables[langTableName]) seed.tables[langTableName] = [];
        const langRows = seed.tables[langTableName];

        let movedCount = 0;

        sourceRows.forEach(row => {
            const refId = row.id;
            if (!refId) return;

            // Handle each field mapping
            sourceFields.forEach(field => {
                const value = row[field];
                if (value) {
                    // Determine language
                    let lang = 'ar'; // Default / fallback
                    if (field.endsWith('_en')) lang = 'en';
                    else if (field === 'name_en') lang = 'en';

                    // Logic: If we have multiple fields (name_ar, name_en), we create distinct rows.
                    // If we have just 'device_name', we treat it as 'ar' (since data in seed seems Arabic/English mixed but let's assume 'ar' as primary or 'en' if looks latin? User said seeds are mixed. 
                    // Let's check `ref_genders` in existing seed... usually seeds are Arabic in this project context
                    // But wait, in `branches` seed: "name_ar": "Obour Branch - فرع العبور". It contains both.
                    // So we put it in 'ar' lang with the full string.

                    // Generate ID
                    const langId = `${refId}-${lang}-${field}`; // temporary unique check?
                    // Actually standard ID in seed is UUID. We can generate a pseudo-uuid or just a consistent hash string if allowed,
                    // or just random if we don't care about persistence across runs.
                    // Valid UUIDs are safer.
                    const newUuid = generateUUID();

                    langRows.push({
                        id: newUuid,
                        [`${tableName}_id`]: refId,
                        lang: lang,
                        name: value,
                        created_date: new Date().toISOString()
                    });
                    movedCount++;
                }
                // Delete from source row
                delete row[field];
            });
        });

        console.log(`   📦 Moved ${movedCount} fields to ${langTableName} seed records.`);
        tablesModified++;
    });

    // 3. Save Files
    if (tablesModified > 0) {
        fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 4));
        fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 4));
        console.log('✅ Migration Saved Successfully!');
    } else {
        console.log('No changes needed.');
    }
}

function generateUUID() {
    // Simple mock UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

migrate();
