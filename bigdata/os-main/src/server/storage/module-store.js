import path from 'path';
import { readFile, writeFile, access, mkdir, readdir, rename, rm, stat } from 'fs/promises';
import { constants as FS_CONSTANTS } from 'fs';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import config from '../../config/index.js';
import logger from '../../logger.js';
import { getEventStoreContext, rotateEventLog, listArchivedLogs, readLogFile, discardLogFile } from '../../eventStore.js';
import { nowIso, deepClone } from '../../utils.js';
import SchemaEngine from '../../schema/engine.js';
import HybridStore from '../../hybridStore.js';
import * as helpers from '../../utils/helpers.js';
import {
    initModulesConfig,
    getModulesConfig,
    getBranchConfig,
    persistModulesConfig as saveModulesConfig,
    persistBranchConfig as saveBranchConfig
} from '../../config/modules-manager.js';

const {
    ROOT_DIR, BRANCHES_DIR, MODULES_CONFIG_PATH = path.join(ROOT_DIR, 'data', 'modules.json'), BRANCHES_CONFIG_PATH = path.join(ROOT_DIR, 'data', 'branches.config.json'),
    DEFAULT_SCHEMA_PATH = path.join(ROOT_DIR, 'data', 'schemas', 'pos_schema.json'), HYBRID_CACHE_TTL_MS, EVENT_ARCHIVE_INTERVAL_MS, EVENTS_PG_URL,
    EVENT_ARCHIVER_DISABLED, DEFAULT_BRANCH_ID, SECRET_FIELD_MAP, LOCKED_TABLE_SET, SERVER_ID
} = config;

const ENV_SCHEMA_PATH = process.env.WS_SCHEMA_PATH
    ? path.isAbsolute(process.env.WS_SCHEMA_PATH)
        ? process.env.WS_SCHEMA_PATH
        : path.join(ROOT_DIR, process.env.WS_SCHEMA_PATH)
    : null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaEngine = new SchemaEngine();
const schemaPaths = new Set([path.resolve(DEFAULT_SCHEMA_PATH)]);
if (ENV_SCHEMA_PATH) {
    schemaPaths.add(path.resolve(ENV_SCHEMA_PATH));
}
for (const schemaPath of schemaPaths) {
    try {
        await schemaEngine.loadFromFile(schemaPath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            logger.warn({ schemaPath }, 'Schema file missing, skipping preload');
            continue;
        }
        throw error;
    }
}

async function readJsonSafe(filePath, fallback = null) {
    try {
        const raw = await readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        logger.warn({ err: error, filePath }, 'Failed to read JSON file');
        return fallback;
    }
}

async function writeJson(filePath, payload) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function fileExists(filePath) {
    try {
        await access(filePath, FS_CONSTANTS.F_OK);
        return true;
    } catch (_err) {
        return false;
    }
}

async function describeFile(filePath) {
    if (!filePath) {
        return { exists: false, mtimeMs: null };
    }
    try {
        const stats = await stat(filePath);
        if (stats.isFile()) {
            return { exists: true, mtimeMs: stats.mtimeMs };
        }
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return { exists: false, mtimeMs: null };
        }
        throw error;
    }
    return { exists: false, mtimeMs: null };
}

const safeDecode = helpers.safeDecode;

// Initialize configuration from manager (includes hydration)
await initModulesConfig();

const modulesConfig = getModulesConfig();
const branchConfig = getBranchConfig();

async function persistModulesConfig() {
    await saveModulesConfig();
}

async function persistBranchConfig() {
    await saveBranchConfig();
}

function getBranchDir(branchId) {
    return path.join(BRANCHES_DIR, encodeURIComponent(branchId));
}

function getBranchModuleDir(branchId, moduleId) {
    return path.join(getBranchDir(branchId), 'modules', moduleId);
}

function getModuleSchemaPath(branchId, moduleId) {
    const def = getModuleConfig(moduleId);
    const relative = def.schemaPath || path.join('schema', 'definition.json');
    return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModuleSchemaFallbackPath(moduleId) {
    const def = getModuleConfig(moduleId);
    if (!def.schemaFallbackPath) return null;
    return path.isAbsolute(def.schemaFallbackPath)
        ? def.schemaFallbackPath
        : path.join(ROOT_DIR, def.schemaFallbackPath);
}

async function resolveBranchSchemaPath(branchId, moduleId) {
    const moduleDir = getBranchModuleDir(branchId, moduleId);
    const schemaJson = path.join(moduleDir, 'schema.json');
    if (await fileExists(schemaJson)) {
        return schemaJson;
    }
    const legacyDefinition = path.join(moduleDir, 'schema', 'definition.json');
    if (await fileExists(legacyDefinition)) {
        return legacyDefinition;
    }
    return null;
}

async function readBranchSchema(branchId, moduleId) {
    const schemaPath = await resolveBranchSchemaPath(branchId, moduleId);
    if (!schemaPath) {
        throw Object.assign(new Error('Schema not found'), { code: 'ENOENT' });
    }
    const payload = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(payload);
    return { schema, path: schemaPath };
}

function getModuleSeedPath(branchId, moduleId) {
    const def = getModuleConfig(moduleId);
    const relative = def.seedPath || path.join('seeds', 'initial.json');
    return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModuleSeedFallbackPath(moduleId) {
    const def = getModuleConfig(moduleId);
    if (!def.seedFallbackPath) return null;
    return path.isAbsolute(def.seedFallbackPath)
        ? def.seedFallbackPath
        : path.join(ROOT_DIR, def.seedFallbackPath);
}

function getModuleLivePath(branchId, moduleId) {
    const def = getModuleConfig(moduleId);
    const relative = (def && def.livePath) || path.join('live', 'data.json');
    return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModuleLiveDir(branchId, moduleId) {
    return path.dirname(getModuleLivePath(branchId, moduleId));
}

function getModuleFilePath(branchId, moduleId) {
    return getModuleLivePath(branchId, moduleId);
}

function getModuleHistoryDir(branchId, moduleId) {
    const def = getModuleConfig(moduleId);
    const relative = def.historyPath || 'history';
    return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

function getModulePurgeHistoryDir(branchId, moduleId) {
    return path.join(getModuleHistoryDir(branchId, moduleId), 'purge');
}

function getModuleArchivePath(branchId, moduleId, timestamp) {
    const historyDir = getModuleHistoryDir(branchId, moduleId);
    return path.join(historyDir, `${timestamp}.json`);
}

function getModuleEventStoreContext(branchId, moduleId) {
    const liveDir = getModuleLiveDir(branchId, moduleId);
    const historyDir = path.join(getModuleHistoryDir(branchId, moduleId), 'events');
    return getEventStoreContext({ branchId, moduleId, liveDir, historyDir });
}

async function ensureBranchModuleLayout(branchId, moduleId) {
    const moduleDir = getBranchModuleDir(branchId, moduleId);
    await mkdir(moduleDir, { recursive: true });
    await mkdir(path.dirname(getModuleLivePath(branchId, moduleId)), { recursive: true });
    await mkdir(getModuleHistoryDir(branchId, moduleId), { recursive: true });
    await mkdir(path.join(getModuleHistoryDir(branchId, moduleId), 'events'), { recursive: true });
    await mkdir(getModulePurgeHistoryDir(branchId, moduleId), { recursive: true });
}

// Local hydration functions removed as they are now handled by modules-manager.js
// Access them via modulesConfig which is fully hydrated.

async function ensureBranchDirectory(branchId) {
    await mkdir(path.join(getBranchDir(branchId), 'modules'), { recursive: true });
}

async function scaffoldBranchModule(branchId, moduleId, options = {}) {
    await ensureBranchDirectory(branchId);
    const moduleDir = getBranchModuleDir(branchId, moduleId);
    await mkdir(moduleDir, { recursive: true });
    const schemaPath = path.join(moduleDir, 'schema.json');
    if (options.schema) {
        await writeJson(schemaPath, options.schema);
        return;
    }
    if (!(await fileExists(schemaPath))) {
        await writeJson(schemaPath, { tables: [] });
    }
}

const moduleStores = new Map(); // key => `${branchId}::${moduleId}`
const moduleSchemaCache = new Map(); // key => `${branchId}::${moduleId}`
const moduleSeedCache = new Map();

function getModuleConfig(moduleId) {
    const def = modulesConfig.modules?.[moduleId];
    if (!def) {
        throw new Error(`Module "${moduleId}" not defined in modules.json`);
    }
    // Note: tables may be empty initially if loaded dynamically from schema
    // The hydration process will populate them from schemaFallbackPath
    return def;
}

async function ensureModuleSchema(branchId, moduleId) {
    const cacheKey = `${branchId}::${moduleId}`;
    const cached = moduleSchemaCache.get(cacheKey);

    const loadSchema = async (filePath, source, mtimeMs) => {
        await schemaEngine.loadFromFile(filePath);
        const moduleDefinition = getModuleConfig(moduleId);
        for (const tableName of moduleDefinition.tables || []) {
            try {
                schemaEngine.getTable(tableName);
            } catch (error) {
                if (error?.message?.includes('Unknown table')) {
                    throw new Error(
                        `Schema for module "${moduleId}" is missing required table "${tableName}" for branch "${branchId}"`
                    );
                }
                throw error;
            }
        }
        moduleSchemaCache.set(cacheKey, { source, mtimeMs, validated: true });
    };

    const fallbackPath = getModuleSchemaFallbackPath(moduleId);
    const fallbackDescriptor = await describeFile(fallbackPath);
    if (fallbackDescriptor.exists) {
        if (cached?.source === 'central' && cached?.validated && cached?.mtimeMs === fallbackDescriptor.mtimeMs) {
            return;
        }
        await loadSchema(fallbackPath, 'central', fallbackDescriptor.mtimeMs);
        return;
    }

    throw new Error(`Central schema for module "${moduleId}" not found`);
}

async function ensureModuleSeed(branchId, moduleId) {
    const cacheKey = `${branchId}::${moduleId}`;
    const cached = moduleSeedCache.get(cacheKey);

    const readSeed = async (filePath, source, mtimeMs) => {
        const payload = await readJsonSafe(filePath, null);
        const normalized = payload && typeof payload === 'object' ? payload : null;
        moduleSeedCache.set(cacheKey, { source, mtimeMs, seed: normalized });
        return normalized;
    };

    const branchPath = getModuleSeedPath(branchId, moduleId);
    const branchDescriptor = await describeFile(branchPath);
    if (branchDescriptor.exists) {
        if (cached?.source === 'branch' && cached?.mtimeMs === branchDescriptor.mtimeMs) {
            return cached.seed ?? null;
        }
        return readSeed(branchPath, 'branch', branchDescriptor.mtimeMs);
    }

    const fallbackPath = getModuleSeedFallbackPath(moduleId);
    const fallbackDescriptor = await describeFile(fallbackPath);
    if (fallbackDescriptor.exists) {
        if (cached?.source === 'central' && cached?.mtimeMs === fallbackDescriptor.mtimeMs) {
            return cached.seed ?? null;
        }
        return readSeed(fallbackPath, 'central', fallbackDescriptor.mtimeMs);
    }

    moduleSeedCache.set(cacheKey, { source: 'missing', mtimeMs: null, seed: null });
    return null;
}

function moduleKey(branchId, moduleId) {
    return `${branchId}::${moduleId}`;
}

async function persistModuleStore(store) {
    const filePath = getModuleFilePath(store.branchId, store.moduleId);
    store.meta = store.meta || {};
    const totalCount = Object.values(store.data || {}).reduce((acc, value) => {
        if (Array.isArray(value)) return acc + value.length;
        return acc;
    }, 0);
    store.meta.counter = totalCount;
    if ('labCounter' in store.meta) {
        store.meta.labCounter = totalCount;
    }
    const payload = store.toJSON();
    await writeJson(filePath, payload);
    logger.debug({ branchId: store.branchId, moduleId: store.moduleId, version: store.version }, 'Persisted module store');
}

async function archiveModuleFile(branchId, moduleId) {
    const filePath = getModuleFilePath(branchId, moduleId);
    if (!(await fileExists(filePath))) return null;
    const timestamp = nowIso().replace(/[:.]/g, '-');
    const target = getModuleArchivePath(branchId, moduleId, timestamp);
    await mkdir(path.dirname(target), { recursive: true });
    try {
        await rename(filePath, target);
    } catch (error) {
        if (error?.code !== 'EXDEV') throw error;
        const snapshot = await readJsonSafe(filePath);
        await writeJson(target, snapshot);
        await rm(filePath, { force: true }).catch(() => { });
    }
    return target;
}

async function ensureModuleStore(branchId, moduleId) {
    const key = moduleKey(branchId, moduleId);
    if (moduleStores.has(key)) {
        return moduleStores.get(key);
    }
    await ensureBranchModuleLayout(branchId, moduleId);
    await ensureModuleSchema(branchId, moduleId);
    const moduleSeed = await ensureModuleSeed(branchId, moduleId);
    const moduleDefinition = getModuleConfig(moduleId);
    const filePath = getModuleFilePath(branchId, moduleId);
    const existing = await readJsonSafe(filePath, null);
    let seed = {};
    if (existing && typeof existing === 'object') {
        seed = {
            version: existing.version || 1,
            meta: existing.meta || {},
            tables: existing.tables || {}
        };
    }
    const store = new HybridStore(schemaEngine, branchId, moduleId, moduleDefinition, seed, moduleSeed, {
        cacheTtlMs: HYBRID_CACHE_TTL_MS
    });
    moduleStores.set(key, store);
    if (!existing) {
        await persistModuleStore(store);
    }
    return store;
}

const SIMPLE_SELECT_REGEX = /^\s*select\s+\*\s+from\s+([a-zA-Z0-9_]+)(?:\s+limit\s+(\d+))?\s*;?\s*$/i;

async function executeModuleStoreSelect(sql, branchId, moduleId) {
    if (!sql || !branchId || !moduleId) {
        return null;
    }
    const match = SIMPLE_SELECT_REGEX.exec(sql);
    if (!match) {
        return null;
    }
    const requestedTable = match[1];
    const limit = match[2] ? Number.parseInt(match[2], 10) : null;
    if (!requestedTable) {
        return null;
    }

    try {
        const store = await ensureModuleStore(branchId, moduleId);
        const canonicalName =
            (typeof store.findCanonicalTableName === 'function' && store.findCanonicalTableName(requestedTable)) || requestedTable;
        let rows = [];
        try {
            rows = store.listTable(canonicalName);
        } catch (_error) {
            return null;
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            return null;
        }
        const sliced = Number.isFinite(limit) && limit >= 0 ? rows.slice(0, limit) : rows;
        return {
            rows: sliced,
            meta: {
                count: sliced.length,
                source: 'module-store',
                branchId,
                moduleId
            }
        };
    } catch (error) {
        logger.warn({ err: error, branchId, moduleId, sql }, 'Module-store SQL fallback failed');
        return null;
    }
}

function getBranchModules(branchId) {
    if (branchConfig.branches && branchConfig.branches[branchId] && Array.isArray(branchConfig.branches[branchId].modules)) {
        return branchConfig.branches[branchId].modules.slice();
    }
    for (const pattern of branchConfig.patterns || []) {
        if (!pattern.match || !Array.isArray(pattern.modules)) continue;
        const regex = new RegExp(pattern.match);
        if (regex.test(branchId)) {
            return pattern.modules.slice();
        }
    }
    return Array.isArray(branchConfig.defaults) ? branchConfig.defaults.slice() : [];
}

async function ensureBranchModules(branchId) {
    const modules = getBranchModules(branchId);
    const stores = [];
    for (const moduleId of modules) {
        try {
            const store = await ensureModuleStore(branchId, moduleId);
            stores.push(store);
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to ensure module store');
        }
    }
    return stores;
}

async function hydrateModulesFromDisk() {
    const branchDirs = await readdir(BRANCHES_DIR, { withFileTypes: true }).catch(() => []);
    for (const dirEntry of branchDirs) {
        if (!dirEntry.isDirectory()) continue;
        const branchId = safeDecode(dirEntry.name);
        const modulesDir = path.join(getBranchDir(branchId), 'modules');
        const moduleEntries = await readdir(modulesDir, { withFileTypes: true }).catch(() => []);
        for (const entry of moduleEntries) {
            if (!entry.isDirectory()) continue;
            const moduleId = safeDecode(entry.name);
            if (!modulesConfig.modules?.[moduleId]) {
                logger.warn({ branchId, moduleId }, 'Skipping module not present in modules config');
                continue;
            }
            try {
                await ensureModuleStore(branchId, moduleId);
                logger.info({ branchId, moduleId }, 'Hydrated module from disk');
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId }, 'Failed to hydrate module from disk');
            }
        }
    }
}

async function buildBranchSnapshot(branchId) {
    const modules = getBranchModules(branchId);
    await Promise.all(
        modules.map((moduleId) =>
            ensureModuleStore(branchId, moduleId).catch((error) => {
                logger.warn({ err: error, branchId, moduleId }, 'Failed to ensure module during snapshot');
                return null;
            })
        )
    );
    const snapshot = {};
    for (const moduleId of modules) {
        const key = moduleKey(branchId, moduleId);
        if (moduleStores.has(key)) {
            const moduleSnapshot = moduleStores.get(key).getSnapshot();
            snapshot[moduleId] = helpers.sanitizeModuleSnapshot(moduleSnapshot, SECRET_FIELD_MAP, LOCKED_TABLE_SET);
        }
    }
    return {
        branchId,
        modules: snapshot,
        updatedAt: nowIso(),
        serverId: SERVER_ID
    };
}

function listBranchSummaries() {
    const summaries = new Map();
    if (branchConfig.branches) {
        for (const [branchId, entry] of Object.entries(branchConfig.branches)) {
            const modules = Array.isArray(entry.modules)
                ? entry.modules.map((moduleId) => ({ moduleId, version: null, meta: {} }))
                : [];
            summaries.set(branchId, {
                id: branchId,
                label: entry.label || branchId,
                modules
            });
        }
    }
    for (const [key, store] of moduleStores.entries()) {
        const [branchId, moduleId] = key.split('::');
        if (!summaries.has(branchId)) {
            summaries.set(branchId, { id: branchId, label: branchId, modules: [] });
        }
        const entry = summaries.get(branchId);
        const existing = entry.modules.find((item) => item.moduleId === moduleId);
        const meta = { moduleId, version: store.version, meta: deepClone(store.meta || {}) };
        if (existing) {
            Object.assign(existing, meta);
        } else {
            entry.modules.push(meta);
        }
    }
    return Array.from(summaries.values());
}

let eventArchivePool = null;
let eventArchiveTimer = null;
let eventArchiveTableReady = false;

function listEventStoreContexts() {
    const contexts = [];
    for (const key of moduleStores.keys()) {
        const [branchId, moduleId] = key.split('::');
        contexts.push(getModuleEventStoreContext(branchId, moduleId));
    }
    return contexts;
}

async function ensureEventArchiveTable(pool) {
    if (eventArchiveTableReady) return;
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ws2_event_journal (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      table_name TEXT,
      action TEXT NOT NULL,
      record JSONB,
      meta JSONB,
      publish_state JSONB,
      created_at TIMESTAMPTZ NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL,
      sequence BIGINT
    )
  `);
    await pool.query(
        'CREATE INDEX IF NOT EXISTS ws2_event_journal_branch_module_idx ON ws2_event_journal (branch_id, module_id, sequence)'
    );
    eventArchiveTableReady = true;
}

async function uploadEventArchive(pool, context, filePath) {
    const entries = await readLogFile(filePath);
    if (!entries.length) {
        await discardLogFile(filePath);
        return;
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const insertSql =
            'INSERT INTO ws2_event_journal (id, branch_id, module_id, table_name, action, record, meta, publish_state, created_at, recorded_at, sequence) ' +
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ' +
            'ON CONFLICT (id) DO UPDATE SET meta = EXCLUDED.meta, publish_state = EXCLUDED.publish_state, recorded_at = EXCLUDED.recorded_at';
        for (const entry of entries) {
            await client.query(insertSql, [
                entry.id,
                entry.branchId || context.branchId,
                entry.moduleId || context.moduleId,
                entry.table || null,
                entry.action || 'module:insert',
                entry.record || null,
                entry.meta || {},
                entry.publishState || {},
                entry.createdAt ? new Date(entry.createdAt) : new Date(),
                entry.recordedAt ? new Date(entry.recordedAt) : new Date(),
                entry.sequence || null
            ]);
        }
        await client.query('COMMIT');
        await discardLogFile(filePath);
        logger.info(
            { branchId: context.branchId, moduleId: context.moduleId, filePath, events: entries.length },
            'Archived event log batch to PostgreSQL'
        );
    } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        throw error;
    } finally {
        client.release();
    }
}

async function runEventArchiveCycle(pool) {
    const contexts = listEventStoreContexts();
    if (!contexts.length) return;
    await ensureEventArchiveTable(pool);
    for (const context of contexts) {
        try {
            await rotateEventLog(context);
        } catch (error) {
            logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId }, 'Failed to rotate event log');
        }
        const archives = await listArchivedLogs(context);
        for (const filePath of archives) {
            try {
                await uploadEventArchive(pool, context, filePath);
            } catch (error) {
                logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId, filePath }, 'Failed to archive event log');
            }
        }
    }
}

async function startEventArchiveService() {
    if (EVENT_ARCHIVER_DISABLED) {
        logger.info('Event archive service disabled via configuration flag');
        return;
    }
    if (!EVENTS_PG_URL) {
        logger.info('Event archive service disabled: PostgreSQL URL missing');
        return;
    }
    if (!eventArchivePool) {
        eventArchivePool = new Pool({ connectionString: EVENTS_PG_URL });
        eventArchivePool.on('error', (err) => {
            logger.warn({ err }, 'PostgreSQL pool error');
        });
    }
    const runCycle = async () => {
        try {
            await runEventArchiveCycle(eventArchivePool);
        } catch (error) {
            logger.warn({ err: error }, 'Event archive cycle failed');
        }
    };
    await runCycle();
    eventArchiveTimer = setInterval(runCycle, EVENT_ARCHIVE_INTERVAL_MS);
    eventArchiveTimer.unref();
    logger.info({ intervalMs: EVENT_ARCHIVE_INTERVAL_MS }, 'Event archive service started');
}

function collectRequestedModules(searchParams) {
    const keys = ['module', 'moduleId', 'modules'];
    const values = new Set();
    for (const key of keys) {
        const rawValues = searchParams.getAll(key);
        for (const raw of rawValues) {
            if (!raw) continue;
            const parts = String(raw)
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
            for (const part of parts) values.add(part);
        }
    }
    return Array.from(values);
}

function collectIncludeFlags(searchParams) {
    const include = new Set();
    const rawIncludes = [
        ...searchParams.getAll('include'),
        ...searchParams.getAll('include[]'),
        ...searchParams.getAll('with')
    ];
    for (const raw of rawIncludes) {
        if (!raw) continue;
        const parts = String(raw)
            .split(',')
            .map((part) => part.trim().toLowerCase())
            .filter(Boolean);
        for (const part of parts) include.add(part);
    }
    if (searchParams.get('seed') === '1' || searchParams.get('seed') === 'true') {
        include.add('seed');
    }
    if (searchParams.get('live') === '1' || searchParams.get('live') === 'true') {
        include.add('live');
    }
    return include;
}

export {
    schemaEngine,
    modulesConfig,
    branchConfig,
    persistModulesConfig,
    persistBranchConfig,
    // hydrateModuleTablesFromSchema, // Removed: handled by modules-manager
    // mergeUniqueTables,             // Removed: handled by modules-manager
    // loadSchemaTablesFromDefinition,// Removed: handled by modules-manager
    ensureBranchDirectory,
    scaffoldBranchModule,
    moduleStores,
    moduleSchemaCache,
    moduleSeedCache,
    getModuleConfig,
    ensureModuleSchema,
    ensureModuleSeed,
    getBranchModules,
    moduleKey,
    persistModuleStore,
    archiveModuleFile,
    ensureModuleStore,
    executeModuleStoreSelect,
    ensureBranchModules,
    hydrateModulesFromDisk,
    buildBranchSnapshot,
    listBranchSummaries,
    startEventArchiveService,
    getBranchDir,
    getBranchModuleDir,
    getModuleSchemaPath,
    getModuleSchemaFallbackPath,
    resolveBranchSchemaPath,
    readBranchSchema,
    getModuleSeedPath,
    getModuleSeedFallbackPath,
    getModuleLivePath,
    getModuleLiveDir,
    getModuleFilePath,
    getModuleHistoryDir,
    getModulePurgeHistoryDir,
    getModuleArchivePath,
    getModuleEventStoreContext,
    collectRequestedModules,
    collectIncludeFlags,
    readJsonSafe,
    writeJson,
    fileExists,
    describeFile
};
