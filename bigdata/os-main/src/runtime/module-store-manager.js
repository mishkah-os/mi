import { readdir, mkdir, rename, rm } from 'fs/promises';
import path from 'path';
import HybridStore from '../hybridStore.js';
import logger from '../logger.js';
import { nowIso } from '../utils.js';
import { readJsonSafe, writeJson, describeFile } from './utils.js';
import { fileExists } from './paths.js';

/**
 * Module Store Manager
 * Handles module store lifecycle: creation, persistence, schema/seed management
 */
export function createModuleStoreManager({
    schemaEngine,
    pathResolvers,
    modulesConfig,
    branchConfig,
    safeDecode,
    HYBRID_CACHE_TTL_MS
}) {
    const moduleStores = new Map(); // key => `${branchId}::${moduleId}`
    const moduleSchemaCache = new Map();
    const moduleSeedCache = new Map();

    const {
        getBranchDir,
        getBranchModuleDir,
        getModuleSchemaFallbackPath,
        getModuleSeedPath,
        getModuleSeedFallbackPath,
        getSharedSeedPath, // Added
        getModuleFilePath,
        getModuleArchivePath,
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

    function normalizeTableNames(input) {
        const names = new Set();
        for (const entry of input || []) {
            if (!entry) continue;
            if (typeof entry === 'string') {
                const trimmed = entry.trim();
                if (trimmed) names.add(trimmed);
                continue;
            }
            if (typeof entry === 'object') {
                const candidate = entry.sqlName || entry.name;
                if (candidate) {
                    const trimmed = String(candidate).trim();
                    if (trimmed) names.add(trimmed);
                }
            }
        }
        return Array.from(names);
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

    async function ensureModuleSeed(branchId, moduleId) {
        const cacheKey = `${branchId}::${moduleId}`;
        const cached = moduleSeedCache.get(cacheKey);

        const readSeed = async (filePath, source, mtimeMs) => {
            const payload = await readJsonSafe(filePath, null);
            return payload && typeof payload === 'object' ? { seed: payload, source, mtimeMs } : { seed: null, source, mtimeMs };
        };

        // 1. Resolve Module Seed (Branch or Central)
        // Try branch-specific seed first, then fallback to central seed
        const branchPath = getModuleSeedPath(branchId, moduleId);
        const branchDescriptor = await describeFile(branchPath);

        let moduleSeedResult = { seed: null, source: 'missing', mtimeMs: null };

        if (branchDescriptor.exists) {
            moduleSeedResult = await readSeed(branchPath, 'branch', branchDescriptor.mtimeMs);
        } else {
            const fallbackPath = getModuleSeedFallbackPath(moduleId);
            const fallbackDescriptor = await describeFile(fallbackPath);
            if (fallbackDescriptor.exists) {
                moduleSeedResult = await readSeed(fallbackPath, 'central', fallbackDescriptor.mtimeMs);
            }
        }

        // 2. Resolve Shared Seed (Branch level)
        let sharedSeedResult = { seed: null, source: 'missing', mtimeMs: null };
        if (typeof getSharedSeedPath === 'function') {
            const sharedPath = getSharedSeedPath(branchId);
            const sharedDescriptor = await describeFile(sharedPath);
            if (sharedDescriptor.exists) {
                sharedSeedResult = await readSeed(sharedPath, 'shared', sharedDescriptor.mtimeMs);
            }
        }

        // 3. Cache Check (Composite key check logic is complex, simpler to just re-merge if not exact match)
        // Simplification: We blindly cache the merged result. 
        // Ideal: check if mtimes match cached.mtimeMs (needs composite mtime).
        const compositeMtime = `${moduleSeedResult.mtimeMs || 0}|${sharedSeedResult.mtimeMs || 0}`;
        if (cached && cached.compositeMtime === compositeMtime) {
            return cached.seed;
        }

        // 4. Merge
        const finalSeed = {
            version: moduleSeedResult.seed?.version || 1,
            tables: {
                ...(moduleSeedResult.seed?.tables || {}),
                ...(sharedSeedResult.seed?.tables || {}) // Shared tables overlay module tables (or vice versa? Shared (sys) usually additive)
            }
        };

        if (Object.keys(finalSeed.tables).length === 0 && !moduleSeedResult.seed && !sharedSeedResult.seed) {
            // Nothing found
            moduleSeedCache.set(cacheKey, { compositeMtime, seed: null });
            return null;
        }

        moduleSeedCache.set(cacheKey, { compositeMtime, seed: finalSeed });
        return finalSeed;
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
        let moduleDefinition = getModuleConfig(moduleId);
        if (Array.isArray(moduleDefinition.tables)) {
            moduleDefinition = { ...moduleDefinition, tables: normalizeTableNames(moduleDefinition.tables) };
        }

        // Fix: If module definition has no tables (dynamic loading), load them from schema
        if (!moduleDefinition.tables || !moduleDefinition.tables.length) {
            const schemaPath = getModuleSchemaPath(branchId, moduleId);
            const schemaDef = await readJsonSafe(schemaPath);
            if (schemaDef && (schemaDef.tables || (schemaDef.schema && schemaDef.schema.tables))) {
                // Clone to avoid mutating global cache if it's shared
                moduleDefinition = { ...moduleDefinition };
                moduleDefinition.tables = normalizeTableNames(schemaDef.tables || schemaDef.schema.tables);
            }
        }

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
            cacheTtlMs: HYBRID_CACHE_TTL_MS,
            persistedTables: moduleDefinition.tables // Explicitly pass persisted tables
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

    async function hydrateModulesFromDisk(BRANCHES_DIR) {
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

    function getModuleStores() {
        return moduleStores;
    }

    function invalidateModuleSeedCache(branchId, moduleId) {
        if (!branchId || !moduleId) return;
        const cacheKey = `${branchId}::${moduleId}`;
        moduleSeedCache.delete(cacheKey);
    }

    return {
        // Core functions
        ensureModuleStore,
        persistModuleStore,
        archiveModuleFile,

        // Schema & Seed
        ensureModuleSchema,
        ensureModuleSeed,

        // Branch & Config
        getBranchModules,
        getModuleConfig,

        // Utilities
        ensureBranchModules,
        hydrateModulesFromDisk,
        executeModuleStoreSelect,
        moduleKey,
        invalidateModuleSeedCache,

        // State access
        getModuleStores
    };
}
