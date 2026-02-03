import path from 'path';
import { readJsonSafe, writeJson, fileExists } from '../utils/helpers.js';
import {
    ROOT_DIR,
    BRANCHES_DIR,
    MODULES_CONFIG_PATH,
    BRANCHES_CONFIG_PATH
} from '../config/index.js';
import logger from '../logger.js';

// State
let modulesConfig = { modules: {} };
let branchConfig = { branches: {}, patterns: [], defaults: [] };

// ============ CONFIGURATION MANAGEMENT ============

export async function initModulesConfig() {
    modulesConfig = (await readJsonSafe(MODULES_CONFIG_PATH, { modules: {} })) || { modules: {} };
    branchConfig = (await readJsonSafe(BRANCHES_CONFIG_PATH, { branches: {}, patterns: [], defaults: [] })) || { branches: {}, patterns: [], defaults: [] };

    // Auto-hydrate
    await hydrateModuleTablesFromSchema();
}

export function getModulesConfig() {
    return modulesConfig;
}

export function getBranchConfig() {
    return branchConfig;
}

export async function persistModulesConfig() {
    await writeJson(MODULES_CONFIG_PATH, modulesConfig);
}

export async function persistBranchConfig() {
    await writeJson(BRANCHES_CONFIG_PATH, branchConfig);
}

export function getModuleConfig(moduleId) {
    const def = modulesConfig.modules?.[moduleId];
    if (!def) {
        throw new Error(`Module "${moduleId}" not defined in modules.json`);
    }
    // Note: tables may be empty initially if loaded dynamically from schema
    // The hydration process will populate them from schemaFallbackPath
    return def;
}

// ============ PATH RESOLUTION ============

export function encodeBranchId(branchId) {
    return encodeURIComponent(branchId);
}

export function getBranchDir(branchId) {
    return path.join(BRANCHES_DIR, encodeBranchId(branchId));
}

export function getBranchModuleDir(branchId, moduleId) {
    return path.join(getBranchDir(branchId), 'modules', moduleId);
}

export function getModuleSchemaPath(branchId, moduleId) {
    const def = getModuleConfig(moduleId);
    const relative = def.schemaPath || path.join('schema', 'definition.json');
    return path.join(getBranchModuleDir(branchId, moduleId), relative);
}

export function getModuleSchemaFallbackPath(moduleId) {
    const def = getModuleConfig(moduleId);
    if (!def.schemaFallbackPath) return null;
    return path.isAbsolute(def.schemaFallbackPath)
        ? def.schemaFallbackPath
        : path.join(ROOT_DIR, def.schemaFallbackPath);
}

export async function resolveBranchSchemaPath(branchId, moduleId) {
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

// ============ SCHEMA HYDRATION ============

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

export function mergeUniqueTables(listA, listB) {
    const seen = new Set();
    const push = (value) => {
        if (!value) return;
        const normalized = String(value).trim();
        if (!normalized) return;
        if (!seen.has(normalized)) {
            seen.add(normalized);
        }
    };
    (listA || []).forEach(push);
    (listB || []).forEach(push);
    return Array.from(seen);
}
