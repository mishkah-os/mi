/**
 * paths.js - Branch and Module Path Resolution
 * 
 * This module handles all path resolution for branches, modules, schemas, seeds, and live data.
 * It uses a factory pattern to allow dependency injection of getModuleConfig.
 */

import path from 'path';
import { readFile, mkdir, access, stat } from 'fs/promises';
import { constants as FS_CONSTANTS } from 'fs';
import { getEventStoreContext } from '../eventStore.js';

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
    try {
        await access(filePath, FS_CONSTANTS.F_OK);
        return true;
    } catch (_err) {
        return false;
    }
}

/**
 * Encode a branch ID for safe filesystem use
 * @param {string} branchId 
 * @returns {string}
 */
export function encodeBranchId(branchId) {
    return encodeURIComponent(branchId);
}

/**
 * Create path resolver functions with injected configuration
 * @param {Object} config - Configuration object
 * @param {string} config.BRANCHES_DIR - Base directory for branches
 * @param {string} config.ROOT_DIR - Root directory
 * @param {Function} config.getModuleConfig - Function to get module configuration
 * @returns {Object} Path resolver functions
 */
export function createPathResolvers({ BRANCHES_DIR, ROOT_DIR, getModuleConfig }) {

    function getBranchDir(branchId) {
        return path.join(BRANCHES_DIR, encodeBranchId(branchId));
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
        const def = getModuleConfig(moduleId);
        const branchDir = getBranchDir(branchId);
        const moduleDir = getBranchModuleDir(branchId, moduleId);
        const livePath = getModuleLivePath(branchId, moduleId);
        const liveDir = getModuleLiveDir(branchId, moduleId);
        const historyDir = path.join(getModuleHistoryDir(branchId, moduleId), 'events');

        // Enhanced validation with complete debug info
        if (!liveDir || typeof liveDir !== 'string' || liveDir.trim() === '') {
            throw new Error(
                `[LIVEDR ERROR] Complete debug info:\n` +
                `Branch: "${branchId}"\n` +
                `Module: "${moduleId}"\n` +
                `BranchDir: "${branchDir}"\n` +
                `ModuleDir: "${moduleDir}"\n` +
                `Config.livePath: "${def?.livePath}"\n` +
                `Resolved livePath: "${livePath}"\n` +
                `Resolved liveDir: "${liveDir}" (len=${liveDir?.length}, type=${typeof liveDir})\n` +
                `HistoryDir: "${historyDir}"`
            );
        }

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

    function getSharedSeedPath(branchId) {
        // "Inside the main folder for each upload before the modules"
        // branches/<branchId>/shared_seeds.json
        return path.join(getBranchDir(branchId), 'shared_seeds.json');
    }

    return {
        getBranchDir,
        getBranchModuleDir,
        getModuleSchemaPath,
        getModuleSchemaFallbackPath,
        resolveBranchSchemaPath,
        readBranchSchema,
        getModuleSeedPath,
        getModuleSeedFallbackPath,
        getSharedSeedPath, // Export new resolver
        getModuleLivePath,
        getModuleLiveDir,
        getModuleFilePath,
        getModuleHistoryDir,
        getModulePurgeHistoryDir,
        getModuleArchivePath,
        getModuleEventStoreContext,
        ensureBranchModuleLayout
    };
}

/**
 * Collect requested modules from search params
 * @param {URLSearchParams} searchParams 
 * @returns {string[]}
 */
export function collectRequestedModules(searchParams) {
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

/**
 * Collect include flags from search params
 * @param {URLSearchParams} searchParams 
 * @returns {Set<string>}
 */
export function collectIncludeFlags(searchParams) {
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
