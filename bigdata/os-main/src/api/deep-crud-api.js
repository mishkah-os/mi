import { readFileSync } from 'fs';
import { Client } from 'pg';
import logger from '../logger.js';
import { jsonResponse, readBody } from '../utils/helpers.js';

let CORE_AUTH_CACHE = {
    keys: {},
    plans: {},
    lastUpdated: null
};

export function createDeepCrudApi({
    DEV_MODE = false,
    fetchAuthConfigFromCore
}) {
    // Initialize auth cache on module load
    (async () => {
        try {
            const config = await fetchAuthConfigFromCore();
            CORE_AUTH_CACHE = { ...config, lastUpdated: Date.now() };
            logger.info({ keys: Object.keys(config.keys).length }, 'Gateway Auth Cache Hydrated from Core');
        } catch (err) {
            logger.warn('Failed to hydrate Auth Cache from Core');
        }
    })();

    async function handleDeepCrudApi(req, res, url) {
        // Pattern: /api/v1/deep-crud/:schema/:action

        if (req.method !== 'POST' && req.method !== 'GET') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        // 1. GATEWAY AUTHENTICATION (The Bouncer)
        // Check Authorization Header
        const authHeader = req.headers['authorization'];
        let tenantInfo = null;

        // For Development convenience, if no header, we might allow if DEV_MODE
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const key = authHeader.replace('Bearer ', '').trim();
            // Sync check against cache
            if (CORE_AUTH_CACHE.keys[key]) {
                tenantInfo = CORE_AUTH_CACHE.keys[key];
            }
        }

        // Allow "Internal/Dev" bypass for now to not break existing tests
        const isDevBypass = !authHeader && DEV_MODE;

        if (!tenantInfo && !isDevBypass) {
            jsonResponse(res, 401, { error: 'unauthorized', message: 'Invalid or missing API Key' });
            return;
        }

        const pathStr = url.pathname.replace('/api/v1/deep-crud/', '');
        const segments = pathStr.split('/').filter(Boolean);
        const tableName = segments[0] || 'unknown';
        const action = segments[1] || 'list';

        try {
            let payload = {};
            if (req.method === 'POST') {
                payload = await readBody(req).catch(() => ({}));
            }

            // Attach Tenant Context for C++
            if (tenantInfo) {
                payload._tenant_id = tenantInfo.tenant;
            }

            const engineResponse = await runDeepEngineQuery(tableName, action, payload);
            jsonResponse(res, engineResponse.status || 200, engineResponse.data);

        } catch (error) {
            logger.error({ err: error, tableName, action }, 'Deep CRUD Gateway Error');
            jsonResponse(res, 500, { error: 'deep-engine-error', message: error.message });
        }
    }

    // Mock C++ Engine Client (ZeroMQ Stub)
    // C++ Engine Client (JavaScript Prototype)
    async function runDeepEngineQuery(table, action, payload) {
        // In a real scenario, this function would send a ZeroMQ message to the C++ binary.
        // BUT for this demonstration (Proof of Concept), Node.js will act as the "Engine" 
        // directly connecting to the Postgres DB defined in the tenant config.

        const tenantId = payload._tenant_id || 'demo_clinic';
        // Resolve Tenant Config (In production, C++ has this in memory)
        let dbConfig = null;
        try {
            const raw = readFileSync('core_config/tenants.secure.json', 'utf8');
            const conf = JSON.parse(raw);
            if (conf.tenants[tenantId]) {
                dbConfig = conf.tenants[tenantId].db_config;
            }
        } catch (e) {
            return { status: 500, data: { error: 'config-load-error', message: e.message } };
        }

        if (!dbConfig) {
            return { status: 404, data: { error: 'tenant-db-not-found', tenantId } };
        }

        // 1. Connect to Postgres
        let client = null;
        try {
            client = new Client({
                user: dbConfig.user,
                host: dbConfig.host,
                database: dbConfig.name,
                password: dbConfig.password || process.env.DEEP_ENGINE_DB_PASSWORD,
                port: dbConfig.port,
            });
            await client.connect();

            // 2. Execute Query based on Action
            let resultData = [];
            let queryTime = 0;
            const start = Date.now();

            if (action === 'search' || action === 'list') {
                // Simple SELECT simulation
                const limit = 20;
                // Sanitize table name (basic)
                const safeTable = table.replace(/[^a-z0-9_]/gi, '');
                const query = `SELECT * FROM "${safeTable}" LIMIT $1`;
                const res = await client.query(query, [limit]);
                resultData = res.rows;
            } else {
                return { status: 400, data: { error: 'action-not-supported-in-demo', action } };
            }

            queryTime = Date.now() - start;

            await client.end();

            return {
                status: 200,
                data: {
                    _source: "postgres-direct-connection",
                    _latency_ms: queryTime,
                    table,
                    action,
                    result: resultData,
                    message: `Connected to ${dbConfig.name}@${dbConfig.host}:${dbConfig.port} as ${dbConfig.user}`
                }
            };

        } catch (err) {
            if (client) await client.end().catch(() => 0);
            return {
                status: 500,
                data: {
                    error: 'db-connection-failed',
                    details: err.message,
                    config_used: { host: dbConfig.host, port: dbConfig.port, user: dbConfig.user, db: dbConfig.name }
                }
            };
        }
    }

    function getAuthCache() {
        return CORE_AUTH_CACHE;
    }

    async function refreshAuthCache() {
        try {
            const config = await fetchAuthConfigFromCore();
            CORE_AUTH_CACHE = { ...config, lastUpdated: Date.now() };
            return true;
        } catch (err) {
            logger.warn('Failed to refresh Auth Cache from Core');
            return false;
        }
    }

    return {
        handleDeepCrudApi,
        runDeepEngineQuery,
        getAuthCache,
        refreshAuthCache
    };
}
