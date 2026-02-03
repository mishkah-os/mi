import { stat } from 'fs/promises';
import SmartSchema from '../backend/smartSchema.js';
import { readJsonSafe, describeFile } from './utils.js';
import { deepClone } from '../utils.js';
import { logRejectedMutation } from '../eventStore.js';

const SMART_SCHEMAS = new Map();
const SMART_SCHEMA_MTIME = new Map();

export function createSchemaManager({ logger, pathResolvers }) {

    const {
        getModuleSchemaFallbackPath,
        getModuleSeedPath,
        getModuleSeedFallbackPath,
        getModuleLivePath,
        getModuleEventStoreContext
    } = pathResolvers;

    function mergeSchemaDefinitions(primary, fallback) {
        const base = primary ? deepClone(primary) : null;
        const fall = fallback ? deepClone(fallback) : null;
        if (!base) return fall;
        if (!fall) return base;
        const ensureTables = (target, tables) => {
            if (!tables || !tables.length) return;
            const tableList =
                target.schema && Array.isArray(target.schema.tables)
                    ? target.schema.tables
                    : (target.schema = target.schema || {}, (target.schema.tables = []));
            const sqlMap = new Map();
            tableList.forEach((table) => {
                if (!table || !table.name) return;
                sqlMap.set(String(table.name), true);
            });
            tables.forEach((table) => {
                if (!table || !table.name) return;
                const name = String(table.name);
                if (!sqlMap.has(name)) {
                    tableList.push(deepClone(table));
                    sqlMap.set(name, true);
                }
            });
        };
        ensureTables(base, fall.schema && fall.schema.tables);
        if (!Array.isArray(base.tables) && Array.isArray(fall.tables)) {
            base.tables = deepClone(fall.tables);
        }
        return base;
    }

    async function loadModuleSchemaSnapshot(branchId, moduleId) {
        // ALWAYS use central schema, skip branch-specific schema
        // This ensures consistent schema across all branches
        const fallbackPath = getModuleSchemaFallbackPath(moduleId);
        let schema = null;
        let source = null;

        if (fallbackPath) {
            schema = await readJsonSafe(fallbackPath, null);
            if (schema) source = 'central';
        }

        return { schema, source };
    }

    async function loadModuleSeedSnapshot(branchId, moduleId) {
        const branchPath = getModuleSeedPath(branchId, moduleId);
        const branchDescriptor = await describeFile(branchPath);
        if (branchDescriptor.exists) {
            const seed = await readJsonSafe(branchPath, null);
            if (seed) {
                return { seed, source: 'branch' };
            }
        }

        const fallbackPath = getModuleSeedFallbackPath(moduleId);
        if (fallbackPath) {
            const seed = await readJsonSafe(fallbackPath, null);
            if (seed) {
                return { seed, source: 'central' };
            }
        }

        return { seed: null, source: null };
    }

    async function loadModuleLiveSnapshot(branchId, moduleId) {
        const livePath = getModuleLivePath(branchId, moduleId);
        const live = await readJsonSafe(livePath, null);
        return { live, source: live ? 'branch' : null };
    }

    async function recordRejectedMutation(branchId, moduleId, details = {}) {
        try {
            const context = getModuleEventStoreContext(branchId, moduleId);
            await logRejectedMutation(context, {
                branchId,
                moduleId,
                ...details
            });
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to record rejected mutation');
        }
    }

    async function getOrLoadSmartSchema(moduleId) {
        const schemaPath = getModuleSchemaFallbackPath(moduleId);
        if (!schemaPath) {
            throw new Error(`Schema path not found for module: ${moduleId}`);
        }

        let smart = SMART_SCHEMAS.get(moduleId);
        let shouldReload = false;
        try {
            const stats = await stat(schemaPath);
            const currentMtime = stats.mtimeMs;
            const cachedMtime = SMART_SCHEMA_MTIME.get(moduleId);
            if (!cachedMtime || cachedMtime !== currentMtime) {
                shouldReload = true;
                SMART_SCHEMA_MTIME.set(moduleId, currentMtime);
            }
        } catch (err) {
            // If stat fails, fall back to reload once
            shouldReload = true;
        }

        if (!smart || shouldReload) {
            const rawSchema = await readJsonSafe(schemaPath);
            if (!rawSchema) {
                throw new Error(`Failed to read schema file at: ${schemaPath}`);
            }
            smart = new SmartSchema(rawSchema);
            SMART_SCHEMAS.set(moduleId, smart);
        }

        return smart;
    }

    return {
        mergeSchemaDefinitions,
        loadModuleSchemaSnapshot,
        loadModuleSeedSnapshot,
        loadModuleLiveSnapshot,
        recordRejectedMutation,
        getOrLoadSmartSchema
    };
}
