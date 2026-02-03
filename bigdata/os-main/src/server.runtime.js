import { createServer } from 'http';
import crypto from 'crypto';
import { readFile, writeFile, access, mkdir, readdir, rename, rm, stat } from 'fs/promises';
import { readFileSync } from 'fs';
import { constants as FS_CONSTANTS } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Client, Pool } from 'pg';
import { handleMultipartUpload } from './uploads.js';
import { createHttpHandler } from './server/http/http-handler.js';

import config from './config/index.js';
import * as helpers from './utils/helpers.js';
import * as sessionManager from './auth/session-manager.js';
import * as authEndpoints from './auth/endpoints.js';

import logger from './logger.js';
import {
    getEventStoreContext,
    appendEvent as appendModuleEvent,
    loadEventMeta,
    updateEventMeta,
    rotateEventLog,
    listArchivedLogs,
    readLogFile,
    discardLogFile,
    logRejectedMutation
} from './eventStore.js';
import { createId, nowIso, safeJsonParse, deepClone, serializeOnce } from './utils.js';
import SchemaEngine from './schema/engine.js';
import HybridStore from './hybridStore.js';
import { VersionConflictError } from './database/module-store.js';
import SequenceManager from './sequenceManager.js';
import * as schemaRoutes from './api/schema-routes.js';
import * as syncRoutes from './api/sync-routes.js';
import * as scheduleRoutes from './api/schedule-routes.js';
import { createPathResolvers, collectRequestedModules, collectIncludeFlags, fileExists, encodeBranchId } from './runtime/paths.js';
import {
    describeFile, readJsonSafe, writeJson, jsonResponse,
    resolveTimestampInput, normalizeCursorInput, recordMatchesCandidates,
    buildRecordCursor, stringifyCursor, computeInsertOnlyDelta,
    normalizeDeltaRequest, findRecordUsingValue, resolveExistingRecordForConcurrency,
    extractPaymentState, extractRecordUpdatedAt, extractClientSnapshotMarker,
    resolveServerSnapshotMarker, evaluateConcurrencyGuards, isVersionConflict,
    versionConflictDetails, parseCookies, resolveWorkspacePath
} from './runtime/utils.js';
import {
    setupMetrics, recordRequestMetrics, recordAjaxMetrics, recordHttpRequest,
    recordWsBroadcast, recordWsSerialization, getMetrics,
    getPrometheusMetrics, renderMetrics
} from './runtime/metrics.js';
import {
    createSyncStateManagers, isFullSyncFlagActive, enableFullSyncFlag, disableFullSyncFlag,
    getTransTracker, rememberTransRecord, recallTransRecord, normalizeTransId,
    toIsoTimestamp, snapshotsEqual, summarizeTableCounts
} from './runtime/sync-state.js';
import {
    POS_TEMP_STORE, POS_KNOWN_STORES, POS_STORE_KEY_RESOLVERS,
    mergeStoreRows, mergePosStores, extractIncomingPosStores, mergePosPayload,
    ensurePlainObject, toTimestamp, normalizeDiscount,
    normalizeOrderStatusLogEntry, normalizeOrderLineStatusLogEntry,
    normalizeOrderLineRecord, normalizeOrderNoteRecord, normalizeIncomingOrder,
    buildAckOrder
} from './runtime/pos-normalization.js';
import { createPosEngine } from './runtime/pos-engine.js';
import { createCrudApi } from './runtime/crud-api.js';
import { createSchemaManager } from './runtime/schemas.js';
import { createPubsubManager, PUBSUB_TYPES } from './runtime/pubsub.js';
import { createAuthEngine } from './runtime/auth-engine.js';
import { createPurgeManager } from './runtime/purge.js';
import { createWsClientManager } from './runtime/ws-clients.js';
import { createModuleEventHandler } from './runtime/module-events.js';
import { createPwaHandler } from './runtime/pwa.js';
import { createModuleStoreManager } from './runtime/module-store-manager.js';
import { createSyncManager } from './runtime/sync-manager.js';
import { createBranchConfigManager } from './runtime/branch-config-manager.js';
import { createDeltaEngine } from './runtime/delta-engine.js';
import { createPosOrderHandler } from './runtime/pos-order-handler.js';
import { createApiRouter } from './server/api-router.js';
import { issueRecaptchaChallenge, pruneRecaptchaChallenges, verifyRecaptchaChallenge } from './recaptcha.js';
import { initializeSqlite, resetDatabase, persistRecord, getDatabase, truncateTable, DEFAULT_TABLES } from './database/sqlite-ops.js';
import { createQuery, executeRawQuery, getDatabaseSchema } from './queryBuilder.js';
import { attachTranslationsToRows, loadTranslationsPayload } from './backend/i18nLoader.js';
import SmartSchema from './backend/smartSchema.js';
import Hydrator from './backend/hydrator.js';
import {
    applyModuleFilters,
    applyModuleOrdering,
    applyRecordTranslations,
    buildClassifiedLangIndex,
    buildServiceLangIndex,
    buildTranslationBundle,
    ensureArray,
    evaluateFilterCondition,
    extractTranslationFields,
    listAvailableLanguages,
    mapClassifiedRecord,
    mapServiceRecord,
    normalizeFilterClauses,
    normalizeIdentifier,
    normalizeImageList,
    normalizeLangCode,
    normalizeTranslationPayload,
    parseImageList,
    parseModuleList,
    resolveBranchId,
    resolveExpiryDate,
    resolveLangParam,
    selectClassifiedTranslation,
    selectServiceTranslation
} from './records.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
    ROOT_DIR, HOST, PORT, DEV_MODE, SERVER_ID,
    BRANCHES_DIR, STATIC_DIR, UPLOADS_DIR, UPLOADS_URL_PREFIX,
    MAX_UPLOAD_FILES, MAX_UPLOAD_FILE_SIZE,
    SESSION_TTL_MS,
    DEFAULT_BRANCH_ID, DEFAULT_MODULE_ID, UNIVERSAL_CRUD_BRANCH,
    RESEED_PASSPHRASE, ACCEPTED_RESEED_CODES,
    CONTENT_TYPES, STATIC_CACHE_HEADERS,
    SECRET_FIELD_MAP, LOCKED_TABLE_SET, BRANCH_DOMAINS,
    METRICS_ENABLED, PROM_EXPORTER_PREFERRED,
    GLOBAL_AUTH_ENABLED, metricsState
} = config;


const DEFAULT_SCHEMA_PATH = path.join(ROOT_DIR, 'data', 'schemas', 'pos_schema.json');
const ENV_SCHEMA_PATH = process.env.WS_SCHEMA_PATH
    ? path.isAbsolute(process.env.WS_SCHEMA_PATH)
        ? process.env.WS_SCHEMA_PATH
        : path.join(ROOT_DIR, process.env.WS_SCHEMA_PATH)
    : null;
const MODULES_CONFIG_PATH = process.env.MODULES_CONFIG_PATH || path.join(ROOT_DIR, 'data', 'modules.json');
const BRANCHES_CONFIG_PATH = process.env.BRANCHES_CONFIG_PATH || path.join(ROOT_DIR, 'data', 'branches.config.json');
const HISTORY_DIR = process.env.HISTORY_DIR || path.join(ROOT_DIR, 'data', 'history');
const SEQUENCE_RULES_PATH = process.env.SEQUENCE_RULES_PATH
    ? path.isAbsolute(process.env.SEQUENCE_RULES_PATH)
        ? process.env.SEQUENCE_RULES_PATH
        : path.join(ROOT_DIR, process.env.SEQUENCE_RULES_PATH)
    : path.join(ROOT_DIR, 'data', 'sequence-rules.json');
const EVENT_ARCHIVE_INTERVAL_MS = Math.max(60000, Number(process.env.WS2_EVENT_ARCHIVE_INTERVAL_MS || process.env.EVENT_ARCHIVE_INTERVAL_MS) || 5 * 60 * 1000);
const EVENTS_PG_URL = process.env.WS2_EVENTS_PG_URL || process.env.EVENTS_PG_URL || process.env.WS2_PG_URL || process.env.DATABASE_URL || null;
const EVENT_ARCHIVER_DISABLED = ['1', 'true', 'yes'].includes(
    String(process.env.WS2_EVENT_ARCHIVE_DISABLED || process.env.EVENT_ARCHIVE_DISABLED || '').toLowerCase()
);
const HYBRID_CACHE_TTL_MS = Math.max(250, Number(process.env.HYBRID_CACHE_TTL_MS) || 1500);

function loadSecurityPolicy() {
    try {
        const payload = readFileSync(SECRET_FIELDS_PATH, 'utf8');
        const parsed = JSON.parse(payload);
        return {
            secretFields: parsed && typeof parsed === 'object' ? parsed.secretFields || {} : {},
            lockedTables: Array.isArray(parsed?.lockedTables) ? parsed.lockedTables : []
        };
    } catch (_err) {
        return { secretFields: {}, lockedTables: [] };
    }
}

const normalizeTableName = helpers.normalizeTableName;

function isTableLocked(tableName) {
    return LOCKED_TABLE_SET.has(normalizeTableName(tableName));
}

function getSecretFieldSet(tableName) {
    return SECRET_FIELD_MAP.get(normalizeTableName(tableName)) || null;
}

const sanitizeRecordForClient = (tableName, record) =>
    helpers.sanitizeRecordForClient(tableName, record, SECRET_FIELD_MAP, LOCKED_TABLE_SET);

const sanitizeTableRows = (tableName, rows) =>
    helpers.sanitizeTableRows(tableName, rows, SECRET_FIELD_MAP, LOCKED_TABLE_SET);

const sanitizeTablesPayload = (tables) =>
    helpers.sanitizeTablesPayload(tables, SECRET_FIELD_MAP, LOCKED_TABLE_SET);

const sanitizeModuleSnapshot = (snapshot) =>
    helpers.sanitizeModuleSnapshot(snapshot, SECRET_FIELD_MAP, LOCKED_TABLE_SET);

setupMetrics();

const DEFAULT_TRANSACTION_TABLES = config.DEFAULT_TRANSACTION_TABLES;

const sequenceManager = new SequenceManager({
    rulesPath: SEQUENCE_RULES_PATH,
    branchesDir: BRANCHES_DIR,
    logger
});

const safeDecode = helpers.safeDecode;




let broadcastCycle = 0;

function nextBroadcastCycle() {
    broadcastCycle += 1;
    if (broadcastCycle > Number.MAX_SAFE_INTEGER - 1) {
        broadcastCycle = 1;
    }
    return broadcastCycle;
}





const LEGACY_POS_TOPIC_PREFIX = 'pos:sync:';
const SYNC_TOPIC_PREFIX = 'sync::';
// legacy ref if needed
const PUBSUB_TOPICS = new Map();

// Global State Maps
const clients = new Map();
const branchClients = new Map();

// Helper wrappers for circular dependencies
const sendToClient = (client, payload, options) => wsClientManager.sendToClient(client, payload, options);
const broadcastToBranch = (branchId, payload, except) => wsClientManager.broadcastToBranch(branchId, payload, except);
const broadcastTableNotice = (b, m, t, n) => pubsubManager.broadcastTableNotice(b, m, t, n);
const broadcastSyncUpdate = (b, m, s, o) => pubsubManager.broadcastSyncUpdate(b, m, s, o);

// Initialize Phase 2 Managers
// Phase 2 Managers moved to after Phase 3 managers to resolve circular dependencies




function traversePath(source, segments = []) {
    if (!segments.length) return source;
    let current = source;
    for (const segment of segments) {
        if (current == null) return undefined;
        if (Array.isArray(current)) {
            const idx = Number(segment);
            if (!Number.isFinite(idx)) return undefined;
            current = current[idx];
        } else if (typeof current === 'object') {
            current = current[segment];
        } else {
            return undefined;
        }
    }
    return current;
}

async function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => {
            if (!data) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

await mkdir(HISTORY_DIR, { recursive: true });
await mkdir(BRANCHES_DIR, { recursive: true });

initializeSqlite({ rootDir: ROOT_DIR });

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
await mkdir(UPLOADS_DIR, { recursive: true }).catch(() => { });
const modulesConfig = (await readJsonSafe(MODULES_CONFIG_PATH, { modules: {} })) || { modules: {} };
await hydrateModuleTablesFromSchema();
const branchConfig = (await readJsonSafe(BRANCHES_CONFIG_PATH, { branches: {}, patterns: [], defaults: [] })) || { branches: {}, patterns: [], defaults: [] };

// Initialize Phase 3: Branch Config Manager
const branchConfigManager = createBranchConfigManager({
    MODULES_CONFIG_PATH,
    BRANCHES_CONFIG_PATH,
    modulesConfig,
    branchConfig
});

const { getBranchModules, getModuleConfig } = branchConfigManager;

// Initialize path resolvers with dependencies from branch config manager
const pathResolvers = createPathResolvers({
    BRANCHES_DIR,
    ROOT_DIR,
    getModuleConfig
});

pathResolvers.resolveWorkspacePath = resolveWorkspacePath;

async function persistModulesConfig() {
    await writeJson(MODULES_CONFIG_PATH, modulesConfig);
}

async function persistBranchConfig() {
    await writeJson(BRANCHES_CONFIG_PATH, branchConfig);
}

async function hydrateModuleTablesFromSchema() {
    const entries = Object.entries(modulesConfig.modules || {});
    for (const [moduleId, def] of entries) {
        if (!def || typeof def !== 'object') continue;
        const schemaTables = await loadSchemaTablesFromDefinition(moduleId, def);
        if (!schemaTables.length) continue;
        const merged = mergeUniqueTables(def.tables, schemaTables);
        if (merged.length) {
            def.tables = merged;
        }
        if (moduleId === 'clinic') {
            console.log('[DEBUG] Clinic Module Tables loaded:', def.tables);
        }
    }
}

function mergeUniqueTables(listA, listB) {
    const seen = new Set();
    const push = (value) => {
        if (!value) return;
        const normalized = String(value).trim();
        if (!normalized) return;
        if (!seen.has(normalized)) {
            seen.add(normalized);
        }
    };
    (Array.isArray(listA) ? listA : []).forEach(push);
    (Array.isArray(listB) ? listB : []).forEach(push);
    return Array.from(seen);
}

async function loadSchemaTablesFromDefinition(moduleId, def) {
    const fallbackPath = def?.schemaFallbackPath
        ? (path.isAbsolute(def.schemaFallbackPath)
            ? def.schemaFallbackPath
            : path.join(ROOT_DIR, def.schemaFallbackPath))
        : null;
    if (!fallbackPath) return [];
    const payload = await readJsonSafe(fallbackPath, null);
    if (!payload) return [];
    const tables = Array.isArray(payload?.tables)
        ? payload.tables
        : Array.isArray(payload?.schema?.tables)
            ? payload.schema.tables
            : [];
    const names = [];
    tables.forEach((table) => {
        if (!table || typeof table !== 'object') return;
        const name = table.name || table.tableName || table.sqlName || table.id || table.key;
        if (name) {
            names.push(String(name));
        }
    });
    if (!names.length) {
        logger.warn({ moduleId, fallbackPath }, 'Schema fallback contains no tables');
    }
    return names;
}







// Destructure path resolver functions for backward compatibility
const {
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
    ensureBranchModuleLayout
} = pathResolvers;


const moduleStoreManager = createModuleStoreManager({
    schemaEngine,
    pathResolvers,
    modulesConfig,
    branchConfig,
    safeDecode,
    HYBRID_CACHE_TTL_MS,
    getModuleConfig,
    logger
});

const {
    ensureModuleStore,
    persistModuleStore,
    archiveModuleFile,
    ensureModuleSchema,
    ensureModuleSeed,
    ensureBranchModules,
    hydrateModulesFromDisk,
    executeModuleStoreSelect,
    moduleKey,
    moduleStores // Expose for listBranchSummaries
} = moduleStoreManager;

const syncManager = createSyncManager({
    ensureModuleStore,
    persistModuleStore,
    normalizePosSnapshot: null  // Will be provided by POS engine
});

const { ensureSyncState, applySyncSnapshot } = syncManager;

const deltaEngine = createDeltaEngine();

const schemaManager = createSchemaManager({ logger, pathResolvers });
const {
    mergeSchemaDefinitions,
    loadModuleSchemaSnapshot,
    loadModuleSeedSnapshot,
    loadModuleLiveSnapshot,
    recordRejectedMutation,
    getOrLoadSmartSchema
} = schemaManager;

// Module Event Handler (Moved here for dependencies)
const moduleEventHandler = createModuleEventHandler({
    ensureModuleStore,
    persistModuleStore,
    getModuleEventStoreContext,
    sanitizeRecordForClient,
    sanitizeModuleSnapshot,
    sendToClient,
    broadcastToBranch,
    broadcastTableNotice,
    sequenceManager,
    schemaManager
});

const {
    savePosOrder,
    fetchPosOrderSnapshot,
    applyPosOrderCreate,
    normalizePosSnapshot,
    applyModuleMutation,
    generateJobOrderRecords
} = createPosEngine({
    ensureModuleStore,
    handleModuleEvent: (b, m, p, c, o) => moduleEventHandler.handleModuleEvent(b, m, p, c, o),
    ensureSyncState,
    applySyncSnapshot,
    sequenceManager
});

const posEngine = {
    applyPosOrderCreate,
    savePosOrder,
    fetchPosOrderSnapshot,
    ensureSyncState,
    normalizePosSnapshot,
    applyModuleMutation,
    generateJobOrderRecords
};

// Pubsub Manager (Moved here for dependencies)
const pubsubManager = createPubsubManager({
    ensureSyncState,
    applyPosOrderCreate,
    applySyncSnapshot,
    clients,
    sendToClient,
    nextBroadcastCycle,
    recordWsBroadcast: (ch, n) => recordWsBroadcast(ch, n) // imported from metrics
});

// WS Client Manager (Moved here for dependencies)
const wsClientManager = createWsClientManager({
    clients,
    branchClients,
    ensureBranchModules,
    ensureModuleStore,
    sanitizeModuleSnapshot,
    handleModuleEvent: (b, m, p, c, o) => moduleEventHandler.handleModuleEvent(b, m, p, c, o),
    ensureSyncState,
    broadcastSyncUpdate,
    isPubsubFrame: (frame) => pubsubManager.isPubsubFrame(frame),
    handlePubsubFrame: (c, f) => pubsubManager.handlePubsubFrame(c, f),
    unregisterPubsubSubscriptions: (c) => pubsubManager.unregisterPubsubSubscriptions(c),
    recordWsSerialization: (ch, s) => recordWsSerialization(ch, s),
    recordWsBroadcast: (ch, n) => recordWsBroadcast(ch, n),
    nextBroadcastCycle
});

// Auth Engine (Moved here)
const authEngine = createAuthEngine({
    ensureModuleStore,
    persistModuleStore,
    resolveBranchId,
    DEFAULT_MODULE_ID,
    DEFAULT_BRANCH_ID
});

// Purge Manager (Moved here)
const purgeManager = createPurgeManager({
    ensureModuleStore,
    persistModuleStore,
    ensureModuleSeed,
    archiveModuleFile,
    getModuleEventStoreContext,
    getModulePurgeHistoryDir: (b, m) => path.join(HISTORY_DIR, 'purge', `${b}_${m}`), // Simple resolution
    broadcastTableNotice,
    broadcastToBranch,
    normalizeTransactionTableList: (list) => list || DEFAULT_TRANSACTION_TABLES
});

// PWA Handler (Moved here)
const pwaHandler = createPwaHandler({
    ensureModuleStore,
    STATIC_DIR
});
const { handlePwaApi, serveStaticAsset } = pwaHandler;

const handleDemoAuthApi = async (req, res) => {
    jsonResponse(res, 501, { error: 'not-implemented', message: 'deprecated' });
};

const crudApi = createCrudApi({
    ensureModuleStore,
    persistModuleStore,
    schemaManager,
    DEFAULT_MODULE_ID,
    logger
});
const { handleUniversalCrudApi } = crudApi;

const posOrderHandler = createPosOrderHandler({
    posEngine
});

const apiRouter = createApiRouter({
    syncManager,
    moduleStoreManager,
    purgeManager,
    authEngine,
    moduleEventHandler,
    branchConfigManager,
    deltaEngine,
    posOrderHandler,
    wsClientManager,
    sequenceManager,
    posOrderHandler,
    wsClientManager,
    sequenceManager,
    pathResolvers,
    config: {
        SERVER_ID,
        BRANCHES_DIR,
        HOST,
        PORT,
        DEFAULT_MODULE_ID,
        BRANCH_DOMAINS
    }
});

const {
    handleSyncRequest,
    handleManagementApi,
    handleDeepCrudApi,
    handleLanguagesApi,
    handleBranchesApi
} = apiRouter;


await hydrateModulesFromDisk(BRANCHES_DIR);

startEventArchiveService().catch((error) => {
    logger.warn({ err: error }, 'Failed to start event archive service');
});

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




const httpServer = createServer(createHttpHandler({
    logger,
    metricsState,
    recordHttpRequest,
    renderMetrics,
    handleMultipartUpload,
    jsonResponse,
    issueRecaptchaChallenge,
    verifyRecaptchaChallenge,
    handleManagementApi,
    collectRequestedModules,
    collectIncludeFlags,
    modulesConfig,
    loadModuleSchemaSnapshot,
    loadModuleSeedSnapshot,
    loadModuleLiveSnapshot,
    nowIso,
    ensureModuleStore,
    DEFAULT_MODULE_ID,
    resolveBranchId,
    resolveLangParam,
    buildClassifiedLangIndex,
    mapClassifiedRecord,
    normalizeImageList,
    resolveExpiryDate,
    createId,
    fileExists,
    writeJson,
    parseModuleList,
    normalizeIdentifier,
    MAX_UPLOAD_FILES,
    attachTranslationsToRows,
    applyModuleFilters,
    applyModuleOrdering,
    readBody,
    createQuery,
    executeRawQuery,
    executeModuleStoreSelect,
    persistModuleStore,
    truncateTable,
    DEFAULT_TABLES,
    BRANCHES_DIR,
    ACCEPTED_RESEED_CODES,
    getDatabaseSchema,
    serverId: SERVER_ID,
    loadTranslationsPayload,
    buildBranchSnapshot: (branchId) => apiRouter.buildBranchSnapshot(branchId, sanitizeModuleSnapshot),
    handleSyncApi: handleSyncRequest,
    authEndpoints,
    syncRoutes,
    schemaRoutes,
    scheduleRoutes,
    moduleStoreManager,
    handleLanguagesApi,
    handleDemoAuthApi,
    handleUniversalCrudApi,
    handleDeepCrudApi,
    handlePwaApi,
    handleBranchesApi,
    handleRpcApi: apiRouter.handleRpcApi,
    BRANCH_DOMAINS,
    ROOT_DIR,
    buildServiceLangIndex,
    mapServiceRecord,
    posEngine, // Passing posEngine to be used by scheduleRoutes
    resolveWorkspacePath,
    persistModulesConfig,
    readJsonSafe,
    serveStaticAsset,
    getSession: sessionManager.getSession,
    handleSessionApi: (req, res, sessionData) => apiRouter.handleSessionApi(req, res, sessionData)
}));
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
    const clientId = createId('client');
    const cookies = parseCookies(req.headers?.cookie || '');
    const cookieUser = typeof cookies.UserUniid === 'string' && cookies.UserUniid.trim() ? cookies.UserUniid.trim() : null;
    const client = {
        id: clientId,
        ws,
        branchId: null,
        role: 'unknown',
        status: 'connecting',
        connectedAt: nowIso(),
        attempts: 0,
        remoteAddress: req.socket?.remoteAddress,
        protocol: 'unknown',
        pubsubTopics: new Set(),
        userUuid: cookieUser || null,
        cookies
    };
    wsClientManager.registerClient(client);
    logger.info({ clientId, address: client.remoteAddress }, 'Client connected');
    wsClientManager.sendToClient(client, {
        type: 'server:hello',
        serverId: SERVER_ID,
        now: nowIso(),
        defaults: { branchId: 'lab:test-pad' }
    });
    ws.on('message', (message) => {
        wsClientManager.handleMessage(client, message).catch((error) => {
            logger.warn({ err: error, clientId: client.id }, 'Failed to handle message');
        });
    });
    ws.on('close', (code, reason) => {
        wsClientManager.unregisterClient(client);
        logger.info({ clientId, code, reason: reason?.toString() }, 'Client disconnected');
    });
    ws.on('error', (error) => {
        logger.warn({ clientId, err: error }, 'WebSocket error');
    });
});

httpServer.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT, serverId: SERVER_ID }, 'Schema-driven WS server ready');
});
function normalizeJsonArray(value, limit) {
    if (!value) return '[]';
    var arr = [];
    if (Array.isArray(value)) arr = value;
    else if (typeof value === 'string') {
        try {
            var parsed = JSON.parse(value);
            arr = Array.isArray(parsed) ? parsed : value.split(',').map((part) => part.trim());
        } catch (_err) {
            arr = value.split(',').map((part) => part.trim());
        }
    }
    var sanitized = arr
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
    if (typeof limit === 'number') {
        sanitized = sanitized.slice(0, limit);
    }
    return JSON.stringify(sanitized);
}
