import { readJsonSafe, writeJson } from './utils.js';
import { resolveBranchId as baseResolveBranchId } from '../records.js';

/**
 * Branch Config Manager
 * Manages branch and module configurations
 */
export function createBranchConfigManager({ MODULES_CONFIG_PATH, BRANCHES_CONFIG_PATH, modulesConfig, branchConfig }) {
    function getModuleConfig(moduleId) {
        const def = modulesConfig.modules?.[moduleId];
        if (!def) {
            throw new Error(`Module "${moduleId}" not defined in modules.json`);
        }
        // Note: tables may be empty initially if loaded dynamically from schema
        // The hydration process will populate them from schemaFallbackPath
        return def;
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

    async function loadSchemaTablesFromDefinition(moduleId, def, ROOT_DIR, path, logger) {
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
        if (!names.length && logger) {
            logger.warn({ moduleId, fallbackPath }, 'Schema fallback contains no tables');
        }
        return names;
    }

    function resolveBranchId(host, subdomain) {
        return baseResolveBranchId(host, subdomain);
    }

    function getModulesConfig() {
        return modulesConfig;
    }

    function getBranchConfig() {
        return branchConfig;
    }

    return {
        getModuleConfig,
        getBranchModules,
        persistModulesConfig,
        persistBranchConfig,
        hydrateModuleTablesFromSchema,
        resolveBranchId,
        mergeUniqueTables,
        loadSchemaTablesFromDefinition,
        getModulesConfig,
        getBranchConfig
    };
}
