import crypto from 'crypto';
import logger from '../logger.js';
import { jsonResponse, readBody } from '../utils/helpers.js';
import { findRecordUsingValue } from './utils.js';
import Hydrator from '../backend/hydrator.js';

// Auth configuration from environment
const DEMO_AUTH_API_KEY = process.env.DEMO_AUTH_API_KEY || 'demo-auth-key';
const DEMO_AUTH_SECRET = process.env.DEMO_AUTH_SECRET || 'demo-auth-secret';
const DEMO_AUTH_EMERGENCY_PASSWORD = process.env.DEMO_AUTH_EMERGENCY_PASSWORD || 'demo-emergency-override';
const AUTH_FAIL_LIMIT = 5;
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_BLOCK_MS = 15 * 60 * 1000;

// Rate limiting state
const AUTH_FAIL_TRACK = new Map();

// Core Auth Cache (In-Memory)
let CORE_AUTH_CACHE = {
    keys: {},
    plans: {},
    lastUpdated: 0
};

export function createAuthEngine({
    ensureModuleStore,
    persistModuleStore,
    resolveBranchId,
    DEFAULT_MODULE_ID,
    DEFAULT_BRANCH_ID
}) {
    const AUTH_MODULE_ID = 'security';
    const PRIMARY_USER_TABLE = 'sys_users';
    const LEGACY_USER_TABLE = 'users';
    function getAuthClientKey(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.trim()) {
            return forwarded.split(',')[0].trim();
        }
        return req.socket?.remoteAddress || 'unknown';
    }

    function getAuthFailureState(clientKey) {
        const now = Date.now();
        const state = AUTH_FAIL_TRACK.get(clientKey) || { count: 0, firstAt: now, blockedUntil: 0 };
        if (state.firstAt + AUTH_WINDOW_MS < now) {
            state.count = 0;
            state.firstAt = now;
        }
        return state;
    }

    function recordAuthFailure(clientKey) {
        const now = Date.now();
        const state = getAuthFailureState(clientKey);
        state.count += 1;
        if (state.count >= AUTH_FAIL_LIMIT) {
            state.blockedUntil = now + AUTH_BLOCK_MS;
        }
        AUTH_FAIL_TRACK.set(clientKey, state);
        return state;
    }

    function isAuthBlocked(clientKey) {
        const state = AUTH_FAIL_TRACK.get(clientKey);
        if (!state) return false;
        if (state.blockedUntil && state.blockedUntil > Date.now()) return true;
        if (state.blockedUntil && state.blockedUntil <= Date.now()) {
            AUTH_FAIL_TRACK.delete(clientKey);
        }
        return false;
    }

    function validateDemoAuthKey(req, res) {
        const clientKey = getAuthClientKey(req);
        if (isAuthBlocked(clientKey)) {
            jsonResponse(res, 429, { error: 'auth-blocked', message: 'Too many invalid API key attempts.' });
            return false;
        }
        const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
        let value = null;
        if (typeof apiKey === 'string') {
            value = apiKey.startsWith('Bearer ') ? apiKey.slice(7).trim() : apiKey.trim();
        }
        if (!value || value !== DEMO_AUTH_API_KEY) {
            recordAuthFailure(clientKey);
            jsonResponse(res, 403, { error: 'invalid-api-key' });
            return false;
        }
        return true;
    }

    function encryptDemoValue(value) {
        const key = crypto.createHash('sha256').update(DEMO_AUTH_SECRET).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `gcm$${iv.toString('base64')}$${tag.toString('base64')}$${encrypted.toString('base64')}`;
    }

    function decryptDemoValue(payload) {
        if (!payload || typeof payload !== 'string') return null;
        const parts = payload.split('$');
        if (parts.length !== 4 || parts[0] !== 'gcm') return null;
        try {
            const key = crypto.createHash('sha256').update(DEMO_AUTH_SECRET).digest();
            const iv = Buffer.from(parts[1], 'base64');
            const tag = Buffer.from(parts[2], 'base64');
            const data = Buffer.from(parts[3], 'base64');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
            return decrypted.toString('utf8');
        } catch (error) {
            return null;
        }
    }

    function hashDemoPassword(password) {
        const salt = crypto.randomBytes(16);
        const params = { N: 16384, r: 8, p: 1 };
        const derived = crypto.scryptSync(String(password), salt, 64, params);
        return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
    }

    function verifyDemoPassword(password, stored) {
        if (!stored || typeof stored !== 'string') return false;
        const parts = stored.split('$');
        if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
        const N = Number(parts[1]);
        const r = Number(parts[2]);
        const p = Number(parts[3]);
        if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
        try {
            const salt = Buffer.from(parts[4], 'base64');
            const expected = Buffer.from(parts[5], 'base64');
            const derived = crypto.scryptSync(String(password), salt, expected.length, { N, r, p });
            return crypto.timingSafeEqual(derived, expected);
        } catch (error) {
            return false;
        }
    }

    function applySystemFields(recordInput, columnsMeta, mode) {
        if (!recordInput || typeof recordInput !== 'object') return recordInput;
        const nowIso = new Date().toISOString();
        const metaNames = new Set((columnsMeta || []).map((col) => String(col?.name || '').toLowerCase()).filter(Boolean));
        const hasColumn = (name) => metaNames.size === 0 || metaNames.has(name);
        const stripFields = ['begin_date', 'created_date', 'last_update', 'last_update_date'];
        for (const field of stripFields) {
            if (field in recordInput) {
                delete recordInput[field];
            }
        }
        if (mode === 'create') {
            if (hasColumn('begin_date')) recordInput.begin_date = nowIso;
            if (hasColumn('created_date')) recordInput.created_date = nowIso;
        }
        if (mode === 'update') {
            if (hasColumn('last_update')) recordInput.last_update = nowIso;
            if (hasColumn('last_update_date')) recordInput.last_update_date = nowIso;
        }
        return recordInput;
    }

    function resolveUserTable(store) {
        if (store?.tables?.includes(PRIMARY_USER_TABLE)) return PRIMARY_USER_TABLE;
        if (store?.tables?.includes(LEGACY_USER_TABLE)) return LEGACY_USER_TABLE;
        return PRIMARY_USER_TABLE;
    }

    function findUserRecordForAuth(store, userId, username) {
        if (!store) return null;
        const userTable = resolveUserTable(store);
        let userRecord = null;
        if (userId) {
            userRecord = findRecordUsingValue(store, userTable, userId);
        }
        const nameLookup = username || userId;
        if (!userRecord && nameLookup) {
            const normalizedName = String(nameLookup).toLowerCase();
            const usersTable = store.listTable(userTable) || [];
            const directMatch = usersTable.find((row) => {
                const nameValue = row && (row.username || row.email || row.full_name || row.name || row.display_name);
                return nameValue && String(nameValue).toLowerCase() === normalizedName;
            });
            if (directMatch) {
                userRecord = { record: directMatch, ref: store.getRecordReference(userTable, directMatch) };
            }
        }
        return userRecord;
    }

    async function handleDemoAuthApi(req, res, url) {
        if (!validateDemoAuthKey(req, res)) return;
        if (req.method !== 'POST') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        const body = await readBody(req).catch(() => ({}));
        const path = url.pathname.replace('/api/v1/auth/', '');

        if (path === 'encrypt-username') {
            const username = body && body.username;
            if (!username) {
                jsonResponse(res, 400, { error: 'missing-username' });
                return;
            }
            jsonResponse(res, 200, { username_enc: encryptDemoValue(username) });
            return;
        }

        if (path === 'decrypt-username') {
            const payload = body && body.username_enc;
            const value = decryptDemoValue(payload);
            if (!value) {
                jsonResponse(res, 400, { error: 'decrypt-failed' });
                return;
            }
            jsonResponse(res, 200, { username: value });
            return;
        }

        if (path === 'hash-password') {
            const password = body && body.password;
            if (!password) {
                jsonResponse(res, 400, { error: 'missing-password' });
                return;
            }
            jsonResponse(res, 200, {
                password_hash: hashDemoPassword(password),
                password_enc: encryptDemoValue(password)
            });
            return;
        }

        if (path === 'verify-password') {
            const password = body && body.password;
            const hash = body && body.password_hash;
            if (!password || !hash) {
                jsonResponse(res, 400, { error: 'missing-input' });
                return;
            }
            jsonResponse(res, 200, { ok: verifyDemoPassword(password, hash) });
            return;
        }

        if (path === 'decrypt-password') {
            const payload = body && body.password_enc;
            const value = decryptDemoValue(payload);
            if (!value) {
                jsonResponse(res, 400, { error: 'decrypt-failed' });
                return;
            }
            jsonResponse(res, 200, { password: value });
            return;
        }

        if (path === 'users/set-password') {
            const userId = body && (body.user_id || body.userId);
            const password = body && body.password;
            const branchId = body && (body.branch_id || body.branchId || resolveBranchId(url));
            const moduleId = body && (body.module_id || body.moduleId) || AUTH_MODULE_ID;
            if (!userId || !password) {
                jsonResponse(res, 400, { error: 'missing-user-or-password' });
                return;
            }
            const store = await ensureModuleStore(branchId, moduleId);
            const userTable = resolveUserTable(store);
            const userRecord = findRecordUsingValue(store, userTable, userId);
            if (!userRecord) {
                jsonResponse(res, 404, { error: 'user-not-found' });
                return;
            }
            const updated = Object.assign({}, userRecord.record, {
                password_hash: hashDemoPassword(password),
                password_enc: encryptDemoValue(password)
            });
            store.save(userTable, updated, { requestedBy: 'demo-auth' });
            await persistModuleStore(store);
            Hydrator.invalidateAll(store);
            jsonResponse(res, 200, { ok: true, user_id: userId });
            return;
        }

        if (path === 'login') {
            const branchId = body && (body.branch_id || body.branchId || resolveBranchId(url));
            const moduleId = body && (body.module_id || body.moduleId) || AUTH_MODULE_ID;
            const password = body && body.password;
            const userId = body && (body.user_id || body.userId);
            const username = body && body.username;
            if (!branchId || !password || (!userId && !username)) {
                jsonResponse(res, 400, { error: 'missing-credentials' });
                return;
            }
            const store = await ensureModuleStore(branchId, moduleId);
            let userRecord = findUserRecordForAuth(store, userId, username);
            if (!userRecord && branchId !== DEFAULT_BRANCH_ID) {
                const fallbackStore = await ensureModuleStore(DEFAULT_BRANCH_ID, moduleId);
                userRecord = findUserRecordForAuth(fallbackStore, userId, username);
            }
            if (!userRecord) {
                jsonResponse(res, 404, { error: 'user-not-found' });
                return;
            }
            const record = userRecord.record || userRecord;
            const isValid = password === DEMO_AUTH_EMERGENCY_PASSWORD || (record.password_hash
                ? verifyDemoPassword(password, record.password_hash)
                : (record.password_enc ? decryptDemoValue(record.password_enc) === password : false));
            if (!isValid) {
                jsonResponse(res, 401, { error: 'invalid-password' });
                return;
            }
            jsonResponse(res, 200, { ok: true, user_id: record.id || record.Id || record.uuid });
            return;
        }

        jsonResponse(res, 404, { error: 'unknown-auth-endpoint' });
    }

    // Mock C++ Config Fetcher
    async function fetchAuthConfigFromCore() {
        // In production: Send "CMD_GET_AUTH_CONFIG" to C++ via ZeroMQ
        // Here: simulating C++ reading core_config/tenants.secure.json
        return {
            keys: {
                "demo-key-hash-123": { tenant: "demo_clinic", plan: "free", permissions: ["read", "write"] }
            },
            plans: {
                "free": { max_calls: 100 },
                "pro": { max_calls: 10000 }
            }
        };
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
        // Rate limiting
        getAuthClientKey,
        getAuthFailureState,
        recordAuthFailure,
        isAuthBlocked,
        validateDemoAuthKey,

        // Encryption/Hashing
        encryptDemoValue,
        decryptDemoValue,
        hashDemoPassword,
        verifyDemoPassword,

        // User management
        applySystemFields,
        findUserRecordForAuth,

        // API handlers
        handleDemoAuthApi,
        fetchAuthConfigFromCore,

        // Cache
        getAuthCache,
        refreshAuthCache,

        // Constants exposure
        getEmergencyPassword: () => DEMO_AUTH_EMERGENCY_PASSWORD
    };
}
