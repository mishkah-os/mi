import path from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { fileExists, readJsonSafe, readBody } from '../utils/helpers.js';

// Helper to resolve branch schema path (duplicated from server.js logic, should be centralized but keeping logic here for now)
async function resolveBranchSchemaPath(branchId, moduleId, branchesDir) {
    const defaultPath = path.join(branchesDir, branchId, 'modules', moduleId, 'schema.json');
    if (await fileExists(defaultPath)) return defaultPath;

    // Check for definition.json in schema folder
    const defPath = path.join(branchesDir, branchId, 'modules', moduleId, 'schema', 'definition.json');
    if (await fileExists(defPath)) return defPath;

    return null;
}

async function readBranchSchema(branchId, moduleId, branchesDir) {
    const schemaPath = await resolveBranchSchemaPath(branchId, moduleId, branchesDir);
    if (!schemaPath) {
        const error = new Error(`Schema not found for ${branchId}/${moduleId}`);
        error.code = 'ENOENT';
        throw error;
    }
    const content = await readFile(schemaPath, 'utf-8');
    return { path: schemaPath, schema: JSON.parse(content) };
}

export async function handleListSchemas(req, res, { logger, jsonResponse, ROOT_DIR, BRANCHES_DIR }) {
    try {
        const schemas = { global: [], branches: {} };

        // List global schemas
        const schemasDir = path.join(ROOT_DIR, 'data', 'schemas');
        try {
            const files = await readdir(schemasDir);
            schemas.global = files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
        } catch (err) {
            logger.warn({ err }, 'Failed to read global schemas directory');
        }

        // List branch-specific schemas
        try {
            const branches = await readdir(BRANCHES_DIR);
            for (const branchId of branches) {
                const branchPath = path.join(BRANCHES_DIR, branchId, 'modules');
                try {
                    const modules = await readdir(branchPath);
                    for (const moduleId of modules) {
                        try {
                            const resolved = await resolveBranchSchemaPath(branchId, moduleId, BRANCHES_DIR);
                            if (!resolved) continue;
                            if (!schemas.branches[branchId]) {
                                schemas.branches[branchId] = [];
                            }
                            schemas.branches[branchId].push(moduleId);
                        } catch {
                            // Schema doesn't exist
                        }
                    }
                } catch (err) {
                    // Module directory doesn't exist
                }
            }
        } catch (err) {
            logger.warn({ err }, 'Failed to read branches directory');
        }

        jsonResponse(res, 200, schemas);
    } catch (error) {
        logger.error({ err: error }, 'List schemas API error');
        jsonResponse(res, 500, {
            error: error.message,
            type: 'list-schemas-error'
        });
    }
}

export async function handleGetSchema(req, res, url, { logger, jsonResponse, ROOT_DIR, BRANCHES_DIR }) {
    try {
        const parts = url.pathname.split('/').filter(p => p);
        // /api/schemas/global/pos_schema
        // /api/schemas/branch/dar/pos

        let schemaPath;
        let schema;
        if (parts[2] === 'global' && parts[3]) {
            schemaPath = path.join(ROOT_DIR, 'data', 'schemas', `${parts[3]}.json`);
            const schemaData = await readFile(schemaPath, 'utf-8');
            schema = JSON.parse(schemaData);
        } else if (parts[2] === 'branch' && parts[3] && parts[4]) {
            const result = await readBranchSchema(parts[3], parts[4], BRANCHES_DIR);
            schemaPath = result.path;
            schema = result.schema;
        } else {
            jsonResponse(res, 400, {
                error: 'Invalid schema path',
                type: 'invalid-path',
                message: 'Use /api/schemas/global/:name or /api/schemas/branch/:branchId/:moduleId'
            });
            return;
        }

        jsonResponse(res, 200, {
            success: true,
            path: schemaPath,
            schema
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            jsonResponse(res, 404, {
                error: 'Schema not found',
                type: 'schema-not-found'
            });
        } else {
            logger.error({ err: error }, 'Get schema API error');
            jsonResponse(res, 500, {
                error: error.message,
                type: 'get-schema-error'
            });
        }
    }
}

export async function handleSaveSchema(req, res, url, { logger, jsonResponse, ROOT_DIR, BRANCHES_DIR }) {
    try {
        const parts = url.pathname.split('/').filter(p => p);
        const body = await readBody(req);

        if (!body || !body.schema) {
            jsonResponse(res, 400, {
                error: 'Missing schema in request body',
                type: 'invalid-body'
            });
            return;
        }

        let schemaPath;
        if (parts[2] === 'global' && parts[3]) {
            schemaPath = path.join(ROOT_DIR, 'data', 'schemas', `${parts[3]}.json`);
        } else if (parts[2] === 'branch' && parts[3] && parts[4]) {
            const moduleDir = path.join(BRANCHES_DIR, parts[3], 'modules', parts[4]);
            await mkdir(moduleDir, { recursive: true });
            schemaPath = path.join(moduleDir, 'schema.json');
        } else {
            jsonResponse(res, 400, {
                error: 'Invalid schema path',
                type: 'invalid-path',
                message: 'Use /api/schemas/global/:name or /api/schemas/branch/:branchId/:moduleId'
            });
            return;
        }

        // Write schema file
        await writeFile(schemaPath, JSON.stringify(body.schema, null, 2), 'utf-8');

        logger.info({ path: schemaPath }, 'Schema saved successfully');

        jsonResponse(res, 200, {
            success: true,
            path: schemaPath,
            message: 'Schema saved successfully'
        });
    } catch (error) {
        logger.error({ err: error }, 'Save schema API error');
        jsonResponse(res, 500, {
            error: error.message,
            type: 'save-schema-error'
        });
    }
}

export async function handleSaveSeeds(req, res, { logger, jsonResponse, BRANCHES_DIR }) {
    try {
        const body = await readBody(req);

        if (!body || !body.branchId || !body.moduleId || !body.seeds) {
            jsonResponse(res, 400, {
                error: 'Missing required fields: branchId, moduleId, seeds',
                type: 'invalid-body'
            });
            return;
        }

        const { branchId, moduleId, seeds } = body;
        const seedsDir = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'seeds');
        await mkdir(seedsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const seedsFile = path.join(seedsDir, `seeds-${timestamp}.json`);

        await writeFile(seedsFile, JSON.stringify(seeds, null, 2), 'utf-8');

        logger.info({ branchId, moduleId, file: seedsFile }, 'Seeds saved successfully');

        jsonResponse(res, 200, {
            success: true,
            file: seedsFile,
            message: 'Seeds saved successfully',
            tables: Object.keys(seeds),
            recordCount: Object.values(seeds).reduce((sum, records) => sum + records.length, 0)
        });
    } catch (error) {
        logger.error({ err: error }, 'Save seeds API error');
        jsonResponse(res, 500, {
            error: error.message,
            type: 'save-seeds-error'
        });
    }
}
