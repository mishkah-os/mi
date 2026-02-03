import path from 'path';
import { mkdirSync, unlinkSync, existsSync } from 'fs';

import Database from 'better-sqlite3';
import { loadAllSchemas } from './schema-loader.js';
import { validateSchema } from './schema-validator.js';
import { migrateSchema, createIndexes } from './schema-migrator.js';
import { logSchemaValidation, createMigrationReport, logDML } from './schema-logger.js';

const databaseCache = new Map();

export const DEFAULT_TABLES = new Set([
  'order_header',
  'order_line',
  'order_payment',
  'pos_shift',
  'order_schedule',
  'order_schedule_line',
  'order_schedule_tables',
  'order_schedule_payment',
  'job_order_header',
  'job_order_detail',
  'customer_profiles',
  'customer_addresses',
  'delivery_drivers',
  // Clinic Module Tables
  'clinic_contracts_header',
  'clinic_contracts_lines',
  'clinic_invoices_header',
  'clinic_invoices_lines',
  'clinic_payments',
  'clinic_contract_schedule_preferences'
  // 🔧 NOTE: job_order_* tables may exist from older schema versions without
  // branch_id/module_id. We migrate them on startup if needed.
]);

function normalizeKey(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function normalizeContext(context = {}) {
  const branchId = normalizeKey(context.branchId);
  const moduleId = normalizeKey(context.moduleId);
  if (!branchId || !moduleId) {
    return { branchId: null, moduleId: null };
  }
  return { branchId, moduleId };
}

function normalizeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') {
    const localized = value.ar || value.en;
    if (typeof localized === 'string') return localized;
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizePayload(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function resolveDatabasePath(options = {}) {
  if (options.path) return options.path;
  const rootDir = options.rootDir || process.cwd();
  const filename = options.filename || process.env.HYBRID_SQLITE_FILENAME || 'hybrid-store.sqlite';
  const baseDir = options.baseDir || process.env.HYBRID_SQLITE_DIR || path.join(rootDir, 'data');
  const branchId = normalizeKey(options.branchId);
  const moduleId = normalizeKey(options.moduleId);
  if (branchId && moduleId) {
    return path.join(baseDir, 'branches', branchId, 'modules', moduleId, 'sqlite', filename);
  }
  return path.join(baseDir, filename);
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

function openDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function getTableColumns(db, tableName) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return new Set(rows.map((row) => row.name));
  } catch (err) {
    return new Set();
  }
}

function migrateLegacyJobOrderTable(db, tableName, createSql, columnDefaults) {
  const columns = getTableColumns(db, tableName);
  if (columns.size === 0) return;
  if (columns.has('branch_id') && columns.has('module_id')) return;

  const legacyTable = `${tableName}_legacy_${Date.now()}`;
  const targetColumns = Object.keys(columnDefaults);
  const selectColumns = targetColumns.map((column) => {
    if (columns.has(column)) {
      return column;
    }
    const fallback = columnDefaults[column];
    return `${fallback} AS ${column}`;
  });

  const migrate = db.transaction(() => {
    db.exec(`ALTER TABLE ${tableName} RENAME TO ${legacyTable}`);
    db.exec(createSql);
    db.exec(`
      INSERT INTO ${tableName} (${targetColumns.join(', ')})
      SELECT ${selectColumns.join(', ')} FROM ${legacyTable}
    `);
    db.exec(`DROP TABLE ${legacyTable}`);
  });

  migrate();
}

function createModuleTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_header (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      shift_id TEXT,
      status TEXT,
      stage TEXT,
      payment_state TEXT,
      created_at TEXT,
      updated_at TEXT,
      version INTEGER DEFAULT 1,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS order_header_branch_shift_idx ON order_header (branch_id, module_id, shift_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_header_updated_idx ON order_header (branch_id, module_id, updated_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_line (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      item_id TEXT,
      status TEXT,
      stage TEXT,
      created_at TEXT,
      updated_at TEXT,
      version INTEGER DEFAULT 1,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

  // Add item_id column if it doesn't exist (migration)
  try {
    db.exec('ALTER TABLE order_line ADD COLUMN item_id TEXT');
    console.log('✅ Added item_id column to order_line table');
  } catch (err) {
    // Column already exists, ignore
  }

  // Order Schedule
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_schedule (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      order_type TEXT,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER,
      ends_at TEXT,
      status TEXT,
      customer_address_id TEXT,
      payload TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_schedule_line (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      schedule_id TEXT NOT NULL,
      item_id TEXT,
      item_name TEXT,
      quantity REAL,
      unit_price REAL,
      line_total REAL,
      notes TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_schedule_tables (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      schedule_id TEXT NOT NULL,
      table_id TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_schedule_payment (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      schedule_id TEXT NOT NULL,
      method_id TEXT NOT NULL,
      amount REAL,
      payload TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

  // Add payload column if it doesn't exist (migration)
  try {
    db.exec('ALTER TABLE order_schedule_payment ADD COLUMN payload TEXT');
    console.log('✅ Added payload column to order_schedule_payment table');
  } catch (err) {
    // Column already exists, ignore
  }

  // Customer Profiles
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_profiles (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      email TEXT,
      preferred_language TEXT,
      created_at TEXT,
      updated_at TEXT,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS customer_profiles_phone_idx ON customer_profiles (branch_id, module_id, phone)');
  db.exec('CREATE INDEX IF NOT EXISTS customer_profiles_name_idx ON customer_profiles (branch_id, module_id, name)');

  // Customer Addresses
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_addresses (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      area_id TEXT,
      label TEXT,
      is_primary INTEGER DEFAULT 0,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx ON customer_addresses (branch_id, module_id, customer_id)');

  // Delivery Drivers
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_drivers (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      vehicle_id TEXT,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS delivery_drivers_phone_idx ON delivery_drivers (branch_id, module_id, phone)');

  // Job Order (KDS)
  const jobOrderHeaderSql = `
    CREATE TABLE IF NOT EXISTS job_order_header (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      job_order_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_type TEXT,
      status TEXT,
      stage TEXT,
      priority INTEGER,
      scheduled_at TEXT,
      scheduled_duration INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `;
  db.exec(jobOrderHeaderSql);
  migrateLegacyJobOrderTable(db, 'job_order_header', jobOrderHeaderSql, {
    branch_id: "'legacy'",
    module_id: "'legacy'",
    id: "job_order_id",
    job_order_id: "job_order_id",
    order_id: "order_id",
    order_type: "order_type_id",
    status: "status",
    stage: "progress_state",
    priority: "0",
    scheduled_at: "NULL",
    scheduled_duration: "0",
    notes: "notes",
    created_at: "created_at",
    updated_at: "updated_at",
    payload: "meta"
  });

  const jobOrderDetailSql = `
    CREATE TABLE IF NOT EXISTS job_order_detail (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      job_order_id TEXT NOT NULL,
      order_line_id TEXT,
      item_id TEXT,
      item_name TEXT,
      quantity REAL,
      status TEXT,
      station_id TEXT,
      created_at TEXT NOT NULL,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `;
  db.exec(jobOrderDetailSql);
  migrateLegacyJobOrderTable(db, 'job_order_detail', jobOrderDetailSql, {
    branch_id: "'legacy'",
    module_id: "'legacy'",
    id: "id",
    job_order_id: "''",
    order_line_id: "''",
    item_id: "''",
    item_name: "''",
    quantity: "0",
    status: "''",
    station_id: "''",
    created_at: "CURRENT_TIMESTAMP",
    payload: "NULL"
  });

  db.exec('CREATE INDEX IF NOT EXISTS order_line_order_idx ON order_line (branch_id, module_id, order_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_line_item_idx ON order_line (branch_id, module_id, item_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_line_updated_idx ON order_line (branch_id, module_id, updated_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_payment (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      method TEXT,
      captured_at TEXT,
      amount REAL,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS order_payment_order_idx ON order_payment (branch_id, module_id, order_id)');
  db.exec('CREATE INDEX IF NOT EXISTS order_payment_captured_idx ON order_payment (branch_id, module_id, captured_at DESC)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pos_shift (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      pos_id TEXT,
      status TEXT,
      is_closed INTEGER DEFAULT 0,
      opened_at TEXT,
      closed_at TEXT,
      updated_at TEXT,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec(
    'CREATE INDEX IF NOT EXISTS pos_shift_branch_pos_idx ON pos_shift (branch_id, module_id, pos_id, is_closed, opened_at)'
  );
  db.exec('CREATE INDEX IF NOT EXISTS pos_shift_opened_idx ON pos_shift (branch_id, module_id, opened_at DESC)');

  // Clinic Contracts Header
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_contracts_header (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      contract_date TEXT,
      contract_status TEXT,
      patient TEXT,
      total_amount REAL,
      paid_amount REAL,
      begin_date TEXT,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS clinic_contracts_header_date_idx ON clinic_contracts_header (branch_id, module_id, contract_date DESC)');

  // Clinic Contracts Lines
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_contracts_lines (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      contract TEXT,
      service TEXT,
      sessions_count REAL,
      line_total REAL,
      begin_date TEXT,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS clinic_contracts_lines_contract_idx ON clinic_contracts_lines (branch_id, module_id, contract)');

  // Clinic Invoices Header
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_invoices_header (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      invoice_no TEXT,
      invoice_date TEXT,
      contract TEXT,
      booking TEXT,
      amount_total REAL,
      amount_paid REAL,
      payment_status TEXT,
      begin_date TEXT,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS clinic_invoices_header_date_idx ON clinic_invoices_header (branch_id, module_id, invoice_date DESC)');

  // Clinic Invoices Lines
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_invoices_lines (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      invoice TEXT,
      service TEXT,
      qty REAL,
      unit_price REAL,
      line_total REAL,
      begin_date TEXT,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

  // Clinic Payments
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_payments (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      invoice TEXT,
      amount REAL,
      method TEXT,
      payment_date TEXT,
      begin_date TEXT,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS clinic_payments_invoice_idx ON clinic_payments (branch_id, module_id, invoice)');

  // Clinic Contract Schedule Preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinic_contract_schedule_preferences (
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      id TEXT NOT NULL,
      company_id TEXT,
      contract TEXT,
      contract_line TEXT,
      executing_doctor TEXT,
      begin_date TEXT,
      payload TEXT,
      PRIMARY KEY (branch_id, module_id, id)
    );
  `);

}

function createSystemTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recaptcha_challenge (
      token TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS recaptcha_created_idx ON recaptcha_challenge (created_at)');

  // Failed Posts table for C++ Engine retry logic
  db.exec(`
    CREATE TABLE IF NOT EXISTS failed_posts (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      last_retry_at TEXT,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS failed_posts_status_idx ON failed_posts (status, created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS failed_posts_table_idx ON failed_posts (table_name, status)');
}

/**
 * Validate and migrate schemas based on definition.json files
 */
function validateAndMigrateSchemas(db, options = {}) {
  const enableAutoMigration = options.enableAutoMigration !== false; // default to true

  if (!enableAutoMigration) {
    console.log('⏭️  Schema auto-migration is disabled.');
    return;
  }

  console.log('\n🔍 Starting schema validation and migration...\n');

  try {
    // Load all schema definitions from branches
    const schemas = loadAllSchemas(options.rootDir);

    if (schemas.length === 0) {
      console.log('ℹ️  No schema definitions found.');
      return;
    }

    console.log(`📋 Found ${schemas.length} schema definition(s):\n`);

    const allMigrations = [];

    const targetBranch = normalizeKey(options.branchId);
    const targetModule = normalizeKey(options.moduleId);

    for (const { branchId, moduleId, schema, filePath } of schemas) {
      if (targetBranch && targetModule) {
        if (normalizeKey(branchId) !== targetBranch || normalizeKey(moduleId) !== targetModule) {
          continue;
        }
      }
      console.log(`\n📦 Processing: ${branchId}/${moduleId}`);
      console.log(`   Schema file: ${filePath}`);

      // Validate schema
      const validationResults = validateSchema(db, schema);

      // Log validation results
      logSchemaValidation(branchId, moduleId, 'all_tables', validationResults.tables);

      console.log(`   Tables: ${validationResults.summary.totalTables} total, ` +
        `${validationResults.summary.validTables} valid, ` +
        `${validationResults.summary.invalidTables} need migration`);

      if (validationResults.summary.totalIssues > 0) {
        console.log(`   Issues found: ${validationResults.summary.totalIssues}`);

        // Perform migrations
        const migrations = migrateSchema(db, schema, validationResults, branchId, moduleId);

        // Create indexes
        for (const table of schema.tables || []) {
          if (table.indexes && table.indexes.length > 0) {
            const tableName = table.sqlName || table.name;
            const indexResults = createIndexes(db, tableName, table.indexes, branchId, moduleId);
            console.log(`   Created ${indexResults.filter(r => r.success).length} index(es) for ${tableName}`);
          }
        }

        allMigrations.push({
          branchId,
          moduleId,
          migrations,
          validationResults
        });
      } else {
        console.log(`   ✓ All tables are valid, no migration needed.`);
      }
    }

    // Create consolidated migration report
    if (allMigrations.length > 0) {
      for (const { branchId, moduleId, migrations } of allMigrations) {
        if (migrations.length > 0) {
          createMigrationReport(branchId, moduleId, migrations);
        }
      }
      console.log(`\n✅ Schema migration completed. Check logs for details.\n`);
    } else {
      console.log(`\n✅ All schemas are up to date.\n`);
    }
  } catch (error) {
    console.error('❌ Error during schema validation/migration:', error.message);
    console.error(error.stack);
  }
}

function getDbKey(options = {}) {
  const normalized = normalizeContext(options);
  if (normalized.branchId && normalized.moduleId) {
    return `${normalized.branchId}::${normalized.moduleId}`;
  }
  return 'global';
}

function ensureDatabaseCache(dbKey) {
  if (!databaseCache.has(dbKey)) {
    databaseCache.set(dbKey, { db: null, statements: new Map() });
  }
  return databaseCache.get(dbKey);
}

export function initializeSqlite(options = {}) {
  const dbKey = getDbKey(options);
  const cached = ensureDatabaseCache(dbKey);
  if (cached.db) return cached.db;
  const dbPath = resolveDatabasePath(options);
  ensureDirectory(dbPath);
  const db = openDatabase(dbPath);
  cached.db = db;

  const normalized = normalizeContext(options);
  if (normalized.branchId && normalized.moduleId) {
    createModuleTables(db);
    validateAndMigrateSchemas(db, { ...options, branchId: normalized.branchId, moduleId: normalized.moduleId });
  } else {
    createSystemTables(db);
  }

  return db;
}

function getDatabaseInstance(options = {}) {
  const dbKey = getDbKey(options);
  const cached = ensureDatabaseCache(dbKey);
  if (!cached.db) {
    return initializeSqlite(options);
  }
  return cached.db;
}

function buildHeaderRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_header record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_header record requires branchId and moduleId');
  }
  const status = record.status || record.statusId || record.metadata?.status || null;
  const stage = record.fulfillmentStage || record.stage || null;
  const paymentState = record.paymentState || record.payment_state || null;
  const createdAt = record.createdAt || record.created_at || null;
  const updatedAt = record.updatedAt || record.updated_at || record.savedAt || record.saved_at || createdAt;
  const shiftId = record.shiftId || record.shift_id || record.metadata?.shiftId || null;
  const version = Number.isFinite(Number(record.version)) ? Math.trunc(Number(record.version)) : 1;
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    shift_id: shiftId ? String(shiftId) : null,
    status: status ? String(status) : null,
    stage: stage ? String(stage) : null,
    payment_state: paymentState ? String(paymentState) : null,
    created_at: createdAt || null,
    updated_at: updatedAt || createdAt || null,
    version,
    payload: JSON.stringify(record)
  };
}

function buildLineRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_line record requires an id');
  }
  const orderId = record.orderId || record.order_id;
  if (!orderId) {
    throw new Error('order_line record requires an orderId');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_line record requires branchId and moduleId');
  }
  const status = record.status || record.statusId || null;
  const stage = record.stage || record.fulfillmentStage || null;
  const createdAt = record.createdAt || record.created_at || null;
  const updatedAt = record.updatedAt || record.updated_at || createdAt;
  const version = Number.isFinite(Number(record.version)) ? Math.trunc(Number(record.version)) : 1;

  // Extract item_id from all variants (camelCase, snake_case, PascalCase)
  let itemId = record.itemId || record.item_id || record.Item_Id || null;

  // If itemId is an object, extract the id or stringify it
  if (itemId && typeof itemId === 'object' && !Array.isArray(itemId)) {
    // Try to extract the id field from the object first
    itemId = itemId.id || JSON.stringify(itemId);
  }

  // 🔍 DEBUG: Log when item_id is null (but allow save)
  if (!itemId) {
    console.warn('[SQLite][buildLineRow] ⚠️ item_id is NULL - saving anyway for debugging', {
      recordId: record.id,
      orderId,
      recordKeys: Object.keys(record),
      itemId_field: record.itemId,
      item_id_field: record.item_id,
      hasItemId: 'itemId' in record,
      hasItem_id: 'item_id' in record
    });
  }

  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    order_id: String(orderId),
    item_id: itemId ? String(itemId) : null,
    status: status ? String(status) : null,
    stage: stage ? String(stage) : null,
    created_at: createdAt || null,
    updated_at: updatedAt || createdAt || null,
    version,
    payload: JSON.stringify(record)
  };
}

function buildPaymentRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_payment record requires an id');
  }
  const orderId = record.orderId || record.order_id;
  if (!orderId) {
    throw new Error('order_payment record requires an orderId');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_payment record requires branchId and moduleId');
  }
  const method =
    record.paymentMethodId ||
    record.method ||
    record.methodId ||
    (record.metadata && record.metadata.method) ||
    null;
  const amountValue = Number(record.amount);
  const amount = Number.isFinite(amountValue) ? amountValue : null;
  const capturedAt = record.capturedAt || record.captured_at || record.processedAt || null;
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    order_id: String(orderId),
    method: method ? String(method) : null,
    captured_at: capturedAt || null,
    amount,
    payload: JSON.stringify(record)
  };
}

function buildShiftRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('pos_shift record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('pos_shift record requires branchId and moduleId');
  }
  const posId =
    record.posId ||
    record.pos_id ||
    record.pos?.id ||
    record.terminalId ||
    record.terminal_id ||
    record.metadata?.posId ||
    null;
  const status = record.status || record.state || record.shiftStatus || null;
  const openedAt = record.openedAt || record.opened_at || record.startedAt || record.started_at || null;
  const closedAt = record.closedAt || record.closed_at || record.endedAt || record.ended_at || null;
  const updatedAt =
    record.updatedAt ||
    record.updated_at ||
    record.savedAt ||
    record.saved_at ||
    closedAt ||
    openedAt ||
    null;

  let closedFlag = null;
  if (record.isClosed !== undefined) closedFlag = record.isClosed;
  else if (record.is_closed !== undefined) closedFlag = record.is_closed;
  else if (record.closed !== undefined) closedFlag = record.closed;
  else if (record.shiftStatus) closedFlag = String(record.shiftStatus).toLowerCase() === 'closed';
  else if (status) closedFlag = String(status).toLowerCase() === 'closed';

  const isClosed = closedFlag ? 1 : 0;

  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    pos_id: posId ? String(posId) : null,
    status: status ? String(status) : null,
    is_closed: isClosed,
    opened_at: openedAt || null,
    closed_at: closedAt || null,
    updated_at: updatedAt || null,
    payload: JSON.stringify(record)
  };
}

function buildScheduleRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_schedule record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_schedule record requires branchId and moduleId');
  }
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    customer_id: String(record.customerId || record.customer_id || ''),
    order_type: record.orderType || record.order_type || record.type || 'dine_in',
    scheduled_at: record.scheduledAt || record.scheduled_at || new Date().toISOString(),
    duration_minutes: Number(record.duration || record.duration_minutes || 60),
    ends_at: record.endsAt || record.ends_at || null,
    status: record.status || 'pending',
    customer_address_id: record.customerAddressId || record.customer_address_id || null,
    payload: normalizePayload(record.payload ?? record),
    notes: normalizeText(record.notes, ''),
    created_at: record.createdAt || record.created_at || new Date().toISOString(),
    updated_at: record.updatedAt || record.updated_at || new Date().toISOString()
  };
}

function buildScheduleLineRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_schedule_line record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_schedule_line record requires branchId and moduleId');
  }

  // ✅ CRITICAL FIX: Extract quantity without defaulting to 1
  // Previous bug: || 1 was overwriting actual quantity values
  const qty = Number(record.quantity || record.qty || 0);

  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    schedule_id: String(record.scheduleId || record.schedule_id),
    item_id: record.itemId || record.item_id || null,
    item_name: normalizeText(record.itemName || record.item_name || record.name, ''),
    quantity: qty,  // Use extracted qty without default
    unit_price: Number(record.unitPrice || record.unit_price || record.price || 0),
    line_total: Number(record.lineTotal || record.line_total || 0),
    notes: normalizeText(record.notes, ''),
    created_at: record.createdAt || record.created_at || new Date().toISOString()
  };
}

function buildScheduleTablesRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_schedule_tables record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_schedule_tables record requires branchId and moduleId');
  }
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    schedule_id: String(record.scheduleId || record.schedule_id),
    table_id: String(record.tableId || record.table_id)
  };
}

function buildSchedulePaymentRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('order_schedule_payment record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('order_schedule_payment record requires branchId and moduleId');
  }
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    schedule_id: String(record.scheduleId || record.schedule_id),
    method_id: String(record.methodId || record.method_id),
    amount: Number(record.amount || 0),
    payload: record.payload || JSON.stringify(record),
    created_at: record.createdAt || record.created_at || new Date().toISOString()
  };
}

function buildJobOrderHeaderRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('job_order_header record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('job_order_header record requires branchId and moduleId');
  }
  let payloadSource = record.payload;
  if (payloadSource && typeof payloadSource === 'object') {
    const hasPayloadKeys = Array.isArray(payloadSource) ? payloadSource.length > 0 : Object.keys(payloadSource).length > 0;
    if (!hasPayloadKeys) {
      payloadSource = record;
    }
  } else if (payloadSource === undefined || payloadSource === null || payloadSource === '') {
    payloadSource = record;
  }
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    job_order_id: String(record.jobOrderId || record.job_order_id || record.id),
    order_id: normalizeText(record.orderId || record.order_id || ''),
    order_type: normalizeText(record.orderType || record.order_type || record.serviceMode || record.orderTypeId || ''),
    status: normalizeText(record.status || ''),
    stage: normalizeText(record.stage || record.fulfillmentStage || ''),
    priority: Number(record.priority || 0),
    scheduled_at: record.scheduledAt || record.scheduled_at || null,
    scheduled_duration: Number(record.scheduledDuration || record.scheduled_duration || 0),
    notes: normalizeText(record.notes || ''),
    created_at: record.createdAt || record.created_at || new Date().toISOString(),
    updated_at: record.updatedAt || record.updated_at || new Date().toISOString(),
    payload: normalizePayload(payloadSource)
  };
}

function buildJobOrderDetailRow(record = {}, context = {}) {
  if (!record || record.id == null) {
    throw new Error('job_order_detail record requires an id');
  }
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('job_order_detail record requires branchId and moduleId');
  }
  let payloadSource = record.payload;
  if (payloadSource && typeof payloadSource === 'object') {
    const hasPayloadKeys = Array.isArray(payloadSource) ? payloadSource.length > 0 : Object.keys(payloadSource).length > 0;
    if (!hasPayloadKeys) {
      payloadSource = record;
    }
  } else if (payloadSource === undefined || payloadSource === null || payloadSource === '') {
    payloadSource = record;
  }
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    job_order_id: normalizeText(record.jobOrderId || record.job_order_id || ''),
    order_line_id: normalizeText(record.orderLineId || record.order_line_id || ''),
    item_id: normalizeText(record.itemId || record.item_id || ''),
    item_name: normalizeText(record.itemName || record.item_name || record.itemNameAr || record.itemNameEn || ''),
    quantity: Number(record.quantity || record.qty || 0),
    status: normalizeText(record.status || ''),
    station_id: normalizeText(record.stationId || record.station_id || ''),
    created_at: record.createdAt || record.created_at || new Date().toISOString(),
    payload: normalizePayload(payloadSource)
  };
}


function buildClinicContractHeaderRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('clinic_contracts_header requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    company_id: normalizeText(record.company_id || record.companyId, ''),
    contract_date: record.contract_date || record.contractDate || null,
    contract_status: normalizeText(record.contract_status || record.status, 'draft'),
    patient: normalizeText(record.patient, ''),
    total_amount: Number(record.total_amount || 0),
    paid_amount: Number(record.paid_amount || 0),
    begin_date: record.begin_date || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildClinicContractLineRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('clinic_contracts_lines requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    company_id: normalizeText(record.company_id, ''),
    contract: normalizeText(record.contract || record.contract_id, ''),
    service: normalizeText(record.service || record.service_id, ''),
    sessions_count: Number(record.sessions_count || 0),
    line_total: Number(record.line_total || record.amount || 0),
    begin_date: record.begin_date || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildClinicInvoiceHeaderRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('clinic_invoices_header requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    company_id: normalizeText(record.company_id, ''),
    invoice_no: normalizeText(record.invoice_no, ''),
    invoice_date: record.invoice_date || new Date().toISOString(),
    contract: normalizeText(record.contract, ''),
    booking: normalizeText(record.booking, ''),
    amount_total: Number(record.amount_total || 0),
    amount_paid: Number(record.amount_paid || 0),
    payment_status: normalizeText(record.payment_status, 'pending'),
    begin_date: record.begin_date || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildClinicInvoiceLineRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('clinic_invoices_lines requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    company_id: normalizeText(record.company_id, ''),
    invoice: normalizeText(record.invoice, ''),
    service: normalizeText(record.service, ''),
    qty: Number(record.qty || 1),
    unit_price: Number(record.unit_price || 0),
    line_total: Number(record.line_total || 0),
    begin_date: record.begin_date || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildClinicPaymentRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('clinic_payments requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    company_id: normalizeText(record.company_id, ''),
    invoice: normalizeText(record.invoice, ''),
    amount: Number(record.amount || 0),
    method: normalizeText(record.method, ''),
    payment_date: record.payment_date || record.created_at || new Date().toISOString(),
    begin_date: record.begin_date || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildClinicContractSchedulePreferenceRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('clinic_contract_schedule_preferences requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id),
    company_id: normalizeText(record.company_id, ''),
    contract: normalizeText(record.contract, ''),
    contract_line: normalizeText(record.contract_line, ''),
    executing_doctor: normalizeText(record.executing_doctor, ''),
    begin_date: record.begin_date || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildCustomerProfileRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('customer_profiles requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id || record.customer_id || record.customerId),
    name: normalizeText(record.name || record.customer_name || record.customerName, ''),
    phone: normalizeText(record.phone, ''),
    email: normalizeText(record.email, ''),
    preferred_language: normalizeText(record.preferred_language || record.preferredLanguage, ''),
    created_at: record.created_at || record.createdAt || new Date().toISOString(),
    updated_at: record.updated_at || record.updatedAt || new Date().toISOString(),
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildCustomerAddressRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('customer_addresses requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id || record.address_id || record.addressId),
    customer_id: normalizeText(record.customer_id || record.customerId, ''),
    area_id: normalizeText(record.area_id || record.areaId, ''),
    label: normalizeText(record.label, ''),
    is_primary: record.is_primary === true || record.isPrimary === true ? 1 : 0,
    payload: normalizePayload(record.payload ?? record)
  };
}

function buildDeliveryDriverRow(record = {}, context = {}) {
  if (!record || record.id == null) throw new Error('delivery_drivers requires id');
  const normalizedContext = normalizeContext(context);
  return {
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId,
    id: String(record.id || record.driver_id || record.driverId),
    name: normalizeText(record.name || record.driver_name || record.driverName, ''),
    phone: normalizeText(record.phone, ''),
    is_active: record.is_active === false || record.isActive === false ? 0 : 1,
    vehicle_id: normalizeText(record.vehicle_id || record.vehicleId, ''),
    payload: normalizePayload(record.payload ?? record)
  };
}

function getBuilder(tableName) {
  switch (tableName) {
    case 'order_header':
      return buildHeaderRow;
    case 'order_line':
      return buildLineRow;
    case 'order_payment':
      return buildPaymentRow;
    case 'pos_shift':
      return buildShiftRow;
    case 'order_schedule':
      return buildScheduleRow;
    case 'order_schedule_line':
      return buildScheduleLineRow;
    case 'order_schedule_tables':
      return buildScheduleTablesRow;
    case 'order_schedule_payment':
      return buildSchedulePaymentRow;
    case 'job_order_header':
      return buildJobOrderHeaderRow;
    case 'job_order_detail':
      return buildJobOrderDetailRow;
    case 'clinic_contracts_header': return buildClinicContractHeaderRow;
    case 'clinic_contracts_lines': return buildClinicContractLineRow;
    case 'clinic_invoices_header': return buildClinicInvoiceHeaderRow;
    case 'clinic_invoices_lines': return buildClinicInvoiceLineRow;
    case 'clinic_payments': return buildClinicPaymentRow;
    case 'clinic_contract_schedule_preferences': return buildClinicContractSchedulePreferenceRow;
    case 'customer_profiles': return buildCustomerProfileRow;
    case 'customer_addresses': return buildCustomerAddressRow;
    case 'delivery_drivers': return buildDeliveryDriverRow;
    default:
      return null;
  }
}

function getStatements(tableName, context = {}) {
  const dbKey = getDbKey(context);
  const cached = ensureDatabaseCache(dbKey);
  if (cached.statements.has(tableName)) {
    return cached.statements.get(tableName);
  }
  const db = getDatabaseInstance(context);
  let statements = null;
  switch (tableName) {
    case 'order_header':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_header (branch_id, module_id, id, shift_id, status, stage, payment_state, created_at, updated_at, version, payload)
          VALUES (@branch_id, @module_id, @id, @shift_id, @status, @stage, @payment_state, @created_at, @updated_at, @version, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            shift_id = excluded.shift_id,
            status = excluded.status,
            stage = excluded.stage,
            payment_state = excluded.payment_state,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            version = excluded.version,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM order_header WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY updated_at DESC'
        )
      };
      break;
    case 'order_line':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_line (branch_id, module_id, id, order_id, item_id, status, stage, created_at, updated_at, version, payload)
          VALUES (@branch_id, @module_id, @id, @order_id, @item_id, @status, @stage, @created_at, @updated_at, @version, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            order_id = excluded.order_id,
            item_id = COALESCE(excluded.item_id, order_line.item_id),
            status = excluded.status,
            stage = excluded.stage,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            version = excluded.version,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_line WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_line WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT item_id, payload FROM order_line WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY updated_at DESC'
        )
      };
      break;
    case 'order_payment':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_payment (branch_id, module_id, id, order_id, method, captured_at, amount, payload)
          VALUES (@branch_id, @module_id, @id, @order_id, @method, @captured_at, @amount, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            order_id = excluded.order_id,
            method = excluded.method,
            captured_at = excluded.captured_at,
            amount = excluded.amount,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_payment WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_payment WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM order_payment WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY captured_at DESC'
        )
      };
      break;
    case 'pos_shift':
      statements = {
        upsert: db.prepare(`
          INSERT INTO pos_shift (branch_id, module_id, id, pos_id, status, is_closed, opened_at, closed_at, updated_at, payload)
          VALUES (@branch_id, @module_id, @id, @pos_id, @status, @is_closed, @opened_at, @closed_at, @updated_at, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            pos_id = excluded.pos_id,
            status = excluded.status,
            is_closed = excluded.is_closed,
            opened_at = excluded.opened_at,
            closed_at = excluded.closed_at,
            updated_at = excluded.updated_at,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM pos_shift WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM pos_shift WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM pos_shift WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE AND is_closed = 0 ORDER BY opened_at DESC, updated_at DESC'
        )
      };
      break;
    case 'order_schedule':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_schedule (branch_id, module_id, id, customer_id, order_type, scheduled_at, duration_minutes, ends_at, status, customer_address_id, payload, notes, created_at, updated_at)
          VALUES (@branch_id, @module_id, @id, @customer_id, @order_type, @scheduled_at, @duration_minutes, @ends_at, @status, @customer_address_id, @payload, @notes, @created_at, @updated_at)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            customer_id = excluded.customer_id,
            order_type = excluded.order_type,
            scheduled_at = excluded.scheduled_at,
            duration_minutes = excluded.duration_minutes,
            ends_at = excluded.ends_at,
            status = excluded.status,
            customer_address_id = excluded.customer_address_id,
            payload = excluded.payload,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        `),
        remove: db.prepare(
          'DELETE FROM order_schedule WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_schedule WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT * FROM order_schedule WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY scheduled_at DESC'
        )
      };
      break;
    case 'order_schedule_line':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_schedule_line (branch_id, module_id, id, schedule_id, item_id, item_name, quantity, unit_price, line_total, notes, created_at)
          VALUES (@branch_id, @module_id, @id, @schedule_id, @item_id, @item_name, @quantity, @unit_price, @line_total, @notes, @created_at)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            schedule_id = excluded.schedule_id,
            item_id = excluded.item_id,
            item_name = excluded.item_name,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            line_total = excluded.line_total,
            notes = excluded.notes
        `),
        remove: db.prepare(
          'DELETE FROM order_schedule_line WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_schedule_line WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT * FROM order_schedule_line WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY created_at DESC'
        )
      };
      break;
    case 'order_schedule_tables':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_schedule_tables (branch_id, module_id, id, schedule_id, table_id)
          VALUES (@branch_id, @module_id, @id, @schedule_id, @table_id)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            schedule_id = excluded.schedule_id,
            table_id = excluded.table_id
        `),
        remove: db.prepare(
          'DELETE FROM order_schedule_tables WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_schedule_tables WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT * FROM order_schedule_tables WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE'
        )
      };
      break;
    case 'order_schedule_payment':
      statements = {
        upsert: db.prepare(`
          INSERT INTO order_schedule_payment (branch_id, module_id, id, schedule_id, method_id, amount, payload, created_at)
          VALUES (@branch_id, @module_id, @id, @schedule_id, @method_id, @amount, @payload, @created_at)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            schedule_id = excluded.schedule_id,
            method_id = excluded.method_id,
            amount = excluded.amount,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM order_schedule_payment WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM order_schedule_payment WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT * FROM order_schedule_payment WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY created_at DESC'
        )
      };
      break;
    case 'job_order_header':
      statements = {
        upsert: db.prepare(`
          INSERT INTO job_order_header (branch_id, module_id, id, job_order_id, order_id, order_type, status, stage, priority, scheduled_at, scheduled_duration, notes, created_at, updated_at, payload)
          VALUES (@branch_id, @module_id, @id, @job_order_id, @order_id, @order_type, @status, @stage, @priority, @scheduled_at, @scheduled_duration, @notes, @created_at, @updated_at, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            job_order_id = excluded.job_order_id,
            order_id = excluded.order_id,
            order_type = excluded.order_type,
            status = excluded.status,
            stage = excluded.stage,
            priority = excluded.priority,
            scheduled_at = excluded.scheduled_at,
            scheduled_duration = excluded.scheduled_duration,
            notes = excluded.notes,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM job_order_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM job_order_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM job_order_header WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY created_at DESC'
        )
      };
      break;
    case 'job_order_detail':
      statements = {
        upsert: db.prepare(`
          INSERT INTO job_order_detail (branch_id, module_id, id, job_order_id, order_line_id, item_id, item_name, quantity, status, station_id, created_at, payload)
          VALUES (@branch_id, @module_id, @id, @job_order_id, @order_line_id, @item_id, @item_name, @quantity, @status, @station_id, @created_at, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            job_order_id = excluded.job_order_id,
            order_line_id = excluded.order_line_id,
            item_id = excluded.item_id,
            item_name = excluded.item_name,
            quantity = excluded.quantity,
            status = excluded.status,
            station_id = excluded.station_id,
            created_at = excluded.created_at,
            payload = excluded.payload
        `),
        remove: db.prepare(
          'DELETE FROM job_order_detail WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'
        ),
        truncate: db.prepare(
          'DELETE FROM job_order_detail WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'
        ),
        load: db.prepare(
          'SELECT payload FROM job_order_detail WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY created_at DESC'
        )
      };
      break;
    case 'clinic_contracts_header':
      statements = {
        upsert: db.prepare(`
          INSERT INTO clinic_contracts_header (branch_id, module_id, id, company_id, contract_date, contract_status, patient, total_amount, paid_amount, begin_date, payload)
          VALUES (@branch_id, @module_id, @id, @company_id, @contract_date, @contract_status, @patient, @total_amount, @paid_amount, @begin_date, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            company_id = excluded.company_id,
            contract_date = excluded.contract_date,
            contract_status = excluded.contract_status,
            patient = excluded.patient,
            total_amount = excluded.total_amount,
            paid_amount = excluded.paid_amount,
            begin_date = excluded.begin_date,
            payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM clinic_contracts_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM clinic_contracts_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM clinic_contracts_header WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY contract_date DESC')
      };
      break;
    case 'clinic_contracts_lines':
      statements = {
        upsert: db.prepare(`
          INSERT INTO clinic_contracts_lines (branch_id, module_id, id, company_id, contract, service, sessions_count, line_total, begin_date, payload)
          VALUES (@branch_id, @module_id, @id, @company_id, @contract, @service, @sessions_count, @line_total, @begin_date, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
             company_id = excluded.company_id,
             contract = excluded.contract,
             service = excluded.service,
             sessions_count = excluded.sessions_count,
             line_total = excluded.line_total,
             begin_date = excluded.begin_date,
             payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM clinic_contracts_lines WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM clinic_contracts_lines WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM clinic_contracts_lines WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY begin_date DESC')
      };
      break;
    case 'clinic_invoices_header':
      statements = {
        upsert: db.prepare(`
          INSERT INTO clinic_invoices_header (branch_id, module_id, id, company_id, invoice_no, invoice_date, contract, booking, amount_total, amount_paid, payment_status, begin_date, payload)
          VALUES (@branch_id, @module_id, @id, @company_id, @invoice_no, @invoice_date, @contract, @booking, @amount_total, @amount_paid, @payment_status, @begin_date, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            company_id = excluded.company_id,
            invoice_no = excluded.invoice_no,
            invoice_date = excluded.invoice_date,
            contract = excluded.contract,
            booking = excluded.booking,
            amount_total = excluded.amount_total,
            amount_paid = excluded.amount_paid,
            payment_status = excluded.payment_status,
            begin_date = excluded.begin_date,
            payload = excluded.payload
         `),
        remove: db.prepare('DELETE FROM clinic_invoices_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM clinic_invoices_header WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM clinic_invoices_header WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY invoice_date DESC')
      };
      break;
    case 'clinic_invoices_lines':
      statements = {
        upsert: db.prepare(`
          INSERT INTO clinic_invoices_lines (branch_id, module_id, id, company_id, invoice, service, qty, unit_price, line_total, begin_date, payload)
          VALUES (@branch_id, @module_id, @id, @company_id, @invoice, @service, @qty, @unit_price, @line_total, @begin_date, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
             company_id = excluded.company_id,
             invoice = excluded.invoice,
             service = excluded.service,
             qty = excluded.qty,
             unit_price = excluded.unit_price,
             line_total = excluded.line_total,
             begin_date = excluded.begin_date,
             payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM clinic_invoices_lines WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM clinic_invoices_lines WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM clinic_invoices_lines WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY begin_date DESC')
      };
      break;
    case 'clinic_payments':
      statements = {
        upsert: db.prepare(`
          INSERT INTO clinic_payments (branch_id, module_id, id, company_id, invoice, amount, method, payment_date, begin_date, payload)
          VALUES (@branch_id, @module_id, @id, @company_id, @invoice, @amount, @method, @payment_date, @begin_date, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            company_id = excluded.company_id,
            invoice = excluded.invoice,
            amount = excluded.amount,
            method = excluded.method,
            payment_date = excluded.payment_date,
            begin_date = excluded.begin_date,
            payload = excluded.payload
         `),
        remove: db.prepare('DELETE FROM clinic_payments WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM clinic_payments WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM clinic_payments WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY payment_date DESC')
      };
      break;
    case 'clinic_contract_schedule_preferences':
      statements = {
        upsert: db.prepare(`
          INSERT INTO clinic_contract_schedule_preferences (branch_id, module_id, id, company_id, contract, contract_line, executing_doctor, begin_date, payload)
          VALUES (@branch_id, @module_id, @id, @company_id, @contract, @contract_line, @executing_doctor, @begin_date, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            company_id = excluded.company_id,
            contract = excluded.contract,
            contract_line = excluded.contract_line,
            executing_doctor = excluded.executing_doctor,
            begin_date = excluded.begin_date,
            payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM clinic_contract_schedule_preferences WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM clinic_contract_schedule_preferences WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM clinic_contract_schedule_preferences WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY begin_date DESC')
      };
      break;
    case 'customer_profiles':
      statements = {
        upsert: db.prepare(`
          INSERT INTO customer_profiles (branch_id, module_id, id, name, phone, email, preferred_language, created_at, updated_at, payload)
          VALUES (@branch_id, @module_id, @id, @name, @phone, @email, @preferred_language, @created_at, @updated_at, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            name = excluded.name,
            phone = excluded.phone,
            email = excluded.email,
            preferred_language = excluded.preferred_language,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM customer_profiles WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM customer_profiles WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM customer_profiles WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY updated_at DESC')
      };
      break;
    case 'customer_addresses':
      statements = {
        upsert: db.prepare(`
          INSERT INTO customer_addresses (branch_id, module_id, id, customer_id, area_id, label, is_primary, payload)
          VALUES (@branch_id, @module_id, @id, @customer_id, @area_id, @label, @is_primary, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            customer_id = excluded.customer_id,
            area_id = excluded.area_id,
            label = excluded.label,
            is_primary = excluded.is_primary,
            payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM customer_addresses WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM customer_addresses WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM customer_addresses WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY id ASC')
      };
      break;
    case 'delivery_drivers':
      statements = {
        upsert: db.prepare(`
          INSERT INTO delivery_drivers (branch_id, module_id, id, name, phone, is_active, vehicle_id, payload)
          VALUES (@branch_id, @module_id, @id, @name, @phone, @is_active, @vehicle_id, @payload)
          ON CONFLICT(branch_id, module_id, id) DO UPDATE SET
            name = excluded.name,
            phone = excluded.phone,
            is_active = excluded.is_active,
            vehicle_id = excluded.vehicle_id,
            payload = excluded.payload
        `),
        remove: db.prepare('DELETE FROM delivery_drivers WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE AND id = @id'),
        truncate: db.prepare('DELETE FROM delivery_drivers WHERE branch_id = @branch_id COLLATE NOCASE AND module_id = @module_id COLLATE NOCASE'),
        load: db.prepare('SELECT payload FROM delivery_drivers WHERE branch_id = ? COLLATE NOCASE AND module_id = ? COLLATE NOCASE ORDER BY id ASC')
      };
      break;
    default:
      statements = null;
  }
  if (statements) {
    cached.statements.set(tableName, statements);
  }
  return statements;
}

export function isManagedTable(tableName) {
  return DEFAULT_TABLES.has(tableName);
}

export function persistRecord(tableName, record, context = {}) {
  if (!isManagedTable(tableName)) return false;
  const builder = getBuilder(tableName);
  const statements = getStatements(tableName, context);
  if (!builder || !statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) {
    throw new Error('persistRecord requires branchId and moduleId');
  }

  try {
    const row = builder(record, normalizedContext);
    statements.upsert.run(row);

    // Log successful DML operation (only in verbose mode to avoid too many logs)
    if (process.env.SQLITE_VERBOSE_DML === 'true') {
      // const { logDML } = require('./schema-logger.js');
      logDML(normalizedContext.branchId, normalizedContext.moduleId, 'UPSERT', tableName, 'success', {
        recordId: record.id
      });
    }

    return true;
  } catch (error) {
    // Log failed DML operation
    // const { logDML } = require('./schema-logger.js');
    logDML(normalizedContext.branchId, normalizedContext.moduleId, 'UPSERT', tableName, 'failed', {
      recordId: record.id,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
}

export function deleteRecord(tableName, key, context = {}) {
  if (!isManagedTable(tableName)) return false;
  const statements = getStatements(tableName, context);
  if (!statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;

  try {
    statements.remove.run({
      branch_id: normalizedContext.branchId,
      module_id: normalizedContext.moduleId,
      id: String(key)
    });

    // Log successful DML operation (only in verbose mode)
    if (process.env.SQLITE_VERBOSE_DML === 'true') {
      // const { logDML } = require('./schema-logger.js');
      logDML(normalizedContext.branchId, normalizedContext.moduleId, 'DELETE', tableName, 'success', {
        recordId: key
      });
    }

    return true;
  } catch (error) {
    // Log failed DML operation
    // const { logDML } = require('./schema-logger.js');
    logDML(normalizedContext.branchId, normalizedContext.moduleId, 'DELETE', tableName, 'failed', {
      recordId: key,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
}

export function truncateTable(tableName, context = {}) {
  if (!isManagedTable(tableName)) return false;
  const statements = getStatements(tableName, context);
  if (!statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;
  statements.truncate.run({
    branch_id: normalizedContext.branchId,
    module_id: normalizedContext.moduleId
  });
  return true;
}

export function loadTableRecords(tableName, context = {}) {
  if (!isManagedTable(tableName)) return [];
  const statements = getStatements(tableName, context);
  if (!statements) return [];
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return [];
  const rows = statements.load.all(normalizedContext.branchId, normalizedContext.moduleId);
  const records = [];
  for (const row of rows) {
    if (!row) continue;
    const hasPayload = typeof row.payload === 'string';
    if (hasPayload) {
      try {
        const parsed = JSON.parse(row.payload);
        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(row)) {
            if (key === 'payload') continue;
            if (parsed[key] === undefined) {
              parsed[key] = value;
            }
          }
          // For order_line, merge item_id from column into the record
          if (tableName === 'order_line' && row.item_id != null && row.item_id !== '') {
            parsed.itemId = row.item_id;
            parsed.item_id = row.item_id;
          }
          records.push(parsed);
        }
      } catch (_error) {
        // ignore malformed rows, but continue processing the rest
      }
      continue;
    }

    // Tables without payload, keep raw row
    records.push(row);
  }
  return records;
}

export function replaceTableRecords(tableName, records = [], context = {}) {
  if (!isManagedTable(tableName)) return false;
  const builder = getBuilder(tableName);
  const statements = getStatements(tableName, context);
  if (!builder || !statements) return false;
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext.branchId || !normalizedContext.moduleId) return false;
  const db = getDatabaseInstance(context);
  const tx = db.transaction((rows) => {
    statements.truncate.run({
      branch_id: normalizedContext.branchId,
      module_id: normalizedContext.moduleId
    });
    for (const record of rows) {
      try {
        const row = builder(record, normalizedContext);
        statements.upsert.run(row);
      } catch (error) {
        console.warn('[SQLite] Skipping invalid record during replaceTableRecords', {
          tableName,
          error: error.message
        });
      }
    }
  });
  tx(records);
  return true;
}

export function withTransaction(fn, context = {}) {
  const db = getDatabaseInstance(context);
  const tx = db.transaction(fn);
  return (...args) => tx(...args);
}

export function getDatabase(context = {}) {
  return getDatabaseInstance(context);
}

export function persistRecaptchaChallenge(token, code, createdAt) {
  if (!token || !code || !Number.isFinite(createdAt)) return;
  const db = getDatabaseInstance();
  const stmt = db.prepare(
    'INSERT INTO recaptcha_challenge (token, code, created_at) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET code=excluded.code, created_at=excluded.created_at'
  );
  stmt.run(token, code, Math.trunc(createdAt));
}

export function loadRecaptchaChallenge(token) {
  if (!token) return null;
  const db = getDatabaseInstance();
  const stmt = db.prepare('SELECT token, code, created_at AS createdAt FROM recaptcha_challenge WHERE token = ?');
  const row = stmt.get(token);
  if (!row) return null;
  return { token: row.token, code: row.code, createdAt: Number(row.createdAt) };
}

export function deleteRecaptchaChallenge(token) {
  if (!token) return 0;
  const db = getDatabaseInstance();
  const stmt = db.prepare('DELETE FROM recaptcha_challenge WHERE token = ?');
  const result = stmt.run(token);
  return result.changes || 0;
}

export function pruneRecaptchaChallengeStore(ttlMs, now = Date.now()) {
  const db = getDatabaseInstance();
  const cutoff = Math.trunc(now - Math.max(0, Number(ttlMs) || 0));
  const stmt = db.prepare('DELETE FROM recaptcha_challenge WHERE created_at < ?');
  const result = stmt.run(cutoff);
  return result.changes || 0;
}
export function resetDatabase(options = {}) {
  const dbKey = getDbKey(options);
  const cached = databaseCache.get(dbKey);
  if (cached?.db) {
    try {
      cached.db.close();
    } catch (err) {
      console.error('Error closing database during reset:', err);
    }
  }
  databaseCache.delete(dbKey);

  const dbPath = resolveDatabasePath(options);
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
      console.log('🗑️  Database file deleted:', dbPath);
    } catch (err) {
      console.error('Error deleting database file:', err);
      throw err;
    }
  }

  return initializeSqlite(options);
}
