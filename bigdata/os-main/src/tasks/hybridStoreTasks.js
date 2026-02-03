import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

import SchemaEngine from '../schema/engine.js';
import HybridStore from '../hybridStore.js';
import { initializeSqlite, replaceTableRecords } from '../db/sqlite.js';
import { nowIso, createId, deepClone } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BRANCHES_DIR = path.join(DATA_DIR, 'branches');
const MODULES_CONFIG_PATH = path.join(DATA_DIR, 'modules.json');
const PERSISTED_TABLES = ['order_header', 'order_line', 'order_payment', 'pos_shift'];

initializeSqlite({ rootDir: ROOT_DIR });

function encodeBranchId(branchId) {
  return encodeURIComponent(branchId);
}

function getBranchDir(branchId) {
  return path.join(BRANCHES_DIR, encodeBranchId(branchId));
}

function getBranchModuleDir(branchId, moduleId) {
  return path.join(getBranchDir(branchId), 'modules', moduleId);
}

function getModuleLivePath(moduleDef, branchId, moduleId) {
  const relative = moduleDef.livePath || path.join('live', 'data.json');
  return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

async function listBranchIds(filterBranch) {
  if (filterBranch) return [filterBranch];
  const entries = await readdir(BRANCHES_DIR, { withFileTypes: true }).catch(() => []);
  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      ids.push(decodeURIComponent(entry.name));
    } catch (_err) {
      ids.push(entry.name);
    }
  }
  return ids;
}

async function listModuleIds(branchId, filterModule) {
  if (filterModule) return [filterModule];
  const modulesDir = path.join(getBranchDir(branchId), 'modules');
  const entries = await readdir(modulesDir, { withFileTypes: true }).catch(() => []);
  const ids = [];
  for (const entry of entries) {
    if (entry.isDirectory()) ids.push(entry.name);
  }
  return ids.length ? ids : ['pos'];
}

async function loadModulesConfig() {
  const config = (await readJsonSafe(MODULES_CONFIG_PATH, { modules: {} })) || { modules: {} };
  return config.modules || {};
}

async function migrateBranchModule(branchId, moduleId, moduleDef, { dryRun = false } = {}) {
  const livePath = getModuleLivePath(moduleDef, branchId, moduleId);
  const snapshot = await readJsonSafe(livePath, null);
  if (!snapshot || typeof snapshot !== 'object') {
    return { branchId, moduleId, status: 'missing-snapshot' };
  }
  const tables = snapshot.tables || {};
  const migrated = [];
  for (const tableName of PERSISTED_TABLES) {
    const rows = Array.isArray(tables[tableName]) ? tables[tableName].map((row) => deepClone(row)) : [];
    if (!rows.length) {
      migrated.push({ table: tableName, count: 0, status: 'empty' });
      continue;
    }
    if (dryRun) {
      migrated.push({ table: tableName, count: rows.length, status: 'dry-run' });
      continue;
    }
    replaceTableRecords(tableName, rows, { branchId, moduleId });
    migrated.push({ table: tableName, count: rows.length, status: 'migrated' });
  }
  return { branchId, moduleId, status: 'ok', migrated };
}

async function runMigration(options = {}) {
  const modules = await loadModulesConfig();
  const results = [];
  const branches = await listBranchIds(options.branch);
  for (const branchId of branches) {
    const moduleIds = await listModuleIds(branchId, options.module);
    for (const moduleId of moduleIds) {
      const def = modules[moduleId];
      if (!def) {
        results.push({ branchId, moduleId, status: 'unknown-module' });
        continue;
      }
      const result = await migrateBranchModule(branchId, moduleId, def, { dryRun: options.dryRun });
      results.push(result);
    }
  }
  for (const entry of results) {
    if (entry.status === 'ok') {
      console.log(`✔ Migrated ${entry.branchId}/${entry.moduleId}`);
      for (const detail of entry.migrated) {
        console.log(`  ↳ ${detail.table}: ${detail.count} rows (${detail.status})`);
      }
    } else {
      console.log(`⚠ ${entry.branchId}/${entry.moduleId}: ${entry.status}`);
    }
  }
  return results;
}

function buildLoadTestOrder(counter, shiftId) {
  const id = `lt-${counter}`;
  const timestamp = nowIso();
  return {
    id,
    shiftId,
    type: 'dine_in',
    status: 'open',
    fulfillmentStage: 'new',
    paymentState: 'unpaid',
    createdAt: timestamp,
    updatedAt: timestamp,
    savedAt: timestamp,
    totals: {},
    metadata: { shiftId },
    lines: [
      {
        id: `${id}-ln1`,
        orderId: id,
        name: 'Load Test Item',
        qty: 1,
        price: 10,
        total: 10,
        status: 'open',
        stage: 'new',
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    payments: [
      {
        id: `${id}-pm1`,
        orderId: id,
        paymentMethodId: 'cash',
        amount: 10,
        capturedAt: timestamp
      }
    ]
  };
}

async function prepareSchemaEngine(schemaEngine, moduleDef) {
  const schemaPaths = new Set();
  if (moduleDef.schemaFallbackPath) {
    schemaPaths.add(
      path.isAbsolute(moduleDef.schemaFallbackPath)
        ? moduleDef.schemaFallbackPath
        : path.join(ROOT_DIR, moduleDef.schemaFallbackPath)
    );
  }
  if (moduleDef.schemaPath) {
    schemaPaths.add(path.join(ROOT_DIR, moduleDef.schemaPath));
  }
  for (const schemaPath of schemaPaths) {
    await schemaEngine.loadFromFile(schemaPath).catch(() => {});
  }
}

async function runLoadTest(options = {}) {
  const modules = await loadModulesConfig();
  const moduleId = options.module || 'pos';
  const moduleDef = modules[moduleId];
  if (!moduleDef) {
    throw new Error(`Module "${moduleId}" not found in configuration.`);
  }
  const branchId = options.branch || 'loadtest';
  const iterations = Math.max(1, Number(options.iterations) || 250);
  const cacheTtlMs = Number.isFinite(Number(options.cacheTtl)) ? Number(options.cacheTtl) : 250;
  const schemaEngine = new SchemaEngine();
  await prepareSchemaEngine(schemaEngine, moduleDef);

  const seed = { version: 1, tables: {}, meta: { counter: 0, labCounter: 0, lastUpdatedAt: nowIso() } };
  const store = new HybridStore(schemaEngine, branchId, moduleId, moduleDef, seed, null, {
    cacheTtlMs
  });
  store.clearTables(PERSISTED_TABLES);

  const shiftId = options.shift || `shift-${createId('hy')}`;
  let writes = 0;
  const start = performance.now();
  for (let idx = 1; idx <= iterations; idx += 1) {
    const order = buildLoadTestOrder(idx, shiftId);
    store.insert('order_header', order);
    writes += 1;
    for (const line of order.lines) {
      store.save('order_line', line);
      writes += 1;
    }
    for (const payment of order.payments) {
      store.save('order_payment', payment);
      writes += 1;
    }
    if (idx % 25 === 0) {
      store.listTable('order_header');
      store.listTable('order_line');
      store.listTable('order_payment');
    }
    if (idx % 10 === 0) {
      store.remove('order_header', { id: order.id });
      for (const line of order.lines) {
        store.remove('order_line', { id: line.id });
      }
      for (const payment of order.payments) {
        store.remove('order_payment', { id: payment.id });
      }
    }
  }
  const durationMs = performance.now() - start;
  const throughput = writes / (durationMs / 1000);
  console.log(
    `✔ Load test complete: ${writes} write operations across ${iterations} orders in ${durationMs.toFixed(2)}ms (${throughput.toFixed(
      2
    )} ops/sec)`
  );
  console.log(`   Cache hits observed: ${store.cacheHits}`);
  return { writes, iterations, durationMs, throughput, cacheHits: store.cacheHits };
}

function parseOptions(argv = []) {
  const options = {};
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[idx + 1];
    switch (key) {
      case 'branch':
        options.branch = next;
        idx += 1;
        break;
      case 'module':
        options.module = next;
        idx += 1;
        break;
      case 'iterations':
        options.iterations = next;
        idx += 1;
        break;
      case 'cache-ttl':
        options.cacheTtl = next;
        idx += 1;
        break;
      case 'shift':
        options.shift = next;
        idx += 1;
        break;
      case 'dry-run':
        options.dryRun = true;
        break;
      default:
        break;
    }
  }
  return options;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === 'migrate') {
    await runMigration(options);
    return;
  }
  if (command === 'loadtest') {
    await runLoadTest(options);
    return;
  }
  console.log('Usage: node src/tasks/hybridStoreTasks.js <migrate|loadtest> [--branch <id>] [--module <id>] [--iterations <n>]');
}

if (import.meta.url === `file://${__filename}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
