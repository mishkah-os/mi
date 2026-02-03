import path from 'path';
import { mkdir, rename, rm, readdir } from 'fs/promises';
import { readJsonSafe, writeJson, fileExists, describeFile, deepClone, nowIso, safeDecode } from './utils.js';
import HybridStore from '../backend/hybridStore.js';
import logger from '../logger.js';

// Global state for module stores and caches
const moduleStores = new Map();
const clients = new Map();
const branchClients = new Map();
const moduleSchemaCache = new Map();
const moduleSeedCache = new Map();

export function createStoreManager({
    BRANCHES_DIR,
    modulesConfig,
    branchConfig,
    schemaEngine,
    pathResolvers,
    SERVER_ID,
    HYBRID_CACHE_TTL_MS = 60000
}) {
    const {
        getBranchDir,
        getModuleSchemaFallbackPath,
        getModuleSeedPath,
        getModuleSeedFallbackPath,
        getModuleFilePath,
        getModuleArchivePath,
        getModuleEventStoreContext,
        ensureBranchModuleLayout
    } = pathResolvers;

    function getModuleConfig(moduleId) {
        const def = modulesConfig.modules?.[moduleId];
        if (!def) {
            throw new Error(`Module "${moduleId}" not defined in modules.json`);
        }
        // Note: tables may be empty initially if loaded dynamically from schema
        // The hydration process will populate them from schemaFallbackPath
        return def;
    }

    function moduleKey(branchId, moduleId) {
        return `${branchId}::${moduleId}`;
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

        // ALWAYS use central schema, skip branch-specific schema
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

        // Try branch-specific seed first, then fallback to central seed
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

    function sanitizeModuleSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return snapshot;
        const sanitized = { ...snapshot };
        // Remove internal fields if present
        delete sanitized._internal;
        return sanitized;
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
                snapshot[moduleId] = sanitizeModuleSnapshot(moduleSnapshot);
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

    function listEventStoreContexts() {
        const contexts = [];
        for (const key of moduleStores.keys()) {
            const [branchId, moduleId] = key.split('::');
            contexts.push(getModuleEventStoreContext(branchId, moduleId));
        }
        return contexts;
    }

    return {
        // Global state accessors
        getModuleStores: () => moduleStores,
        getClients: () => clients,
        getBranchClients: () => branchClients,

        // Core functions
        getModuleConfig,
        moduleKey,
        getBranchModules,
        persistModuleStore,
        archiveModuleFile,
        ensureModuleStore,
        executeModuleStoreSelect,
        ensureBranchModules,
        ensureModuleSchema,
        ensureModuleSeed,
        hydrateModulesFromDisk,
        buildBranchSnapshot,
        listBranchSummaries,
        listEventStoreContexts,
        sanitizeModuleSnapshot
    };
}

// Export global state for direct access if needed
export { moduleStores, clients, branchClients, moduleSchemaCache, moduleSeedCache };
