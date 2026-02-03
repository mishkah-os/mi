/**
 * Configuration Module
 * Centralized configuration for the server
 * Contains: environment variables, paths, constants, policy loaders
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ DIRECTORY & PATH CONFIGURATION ============

export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const HOST = process.env.HOST || '0.0.0.0';
export const PORT = Number(process.env.PORT) || 3200;
export const DEV_MODE = String(process.env.WS2_DEV_MODE || process.env.NODE_ENV || '').toLowerCase() === 'development';
export const SERVER_ID = process.env.SERVER_ID || `ws-${Date.now().toString(36)}`;

export const BRANCHES_DIR = process.env.BRANCHES_DIR || path.join(ROOT_DIR, 'data', 'branches');
export const STATIC_DIR = path.join(ROOT_DIR, 'static');
export const UPLOADS_DIR = path.join(STATIC_DIR, 'uploads');
export const UPLOADS_URL_PREFIX = '/uploads';

export const DEFAULT_SCHEMA_PATH = path.join(ROOT_DIR, 'data', 'schemas', 'pos_schema.json');

const ENV_SCHEMA_PATH = process.env.WS_SCHEMA_PATH
    ? path.isAbsolute(process.env.WS_SCHEMA_PATH)
        ? process.env.WS_SCHEMA_PATH
        : path.join(ROOT_DIR, process.env.WS_SCHEMA_PATH)
    : null;

export const SCHEMA_PATH = ENV_SCHEMA_PATH || DEFAULT_SCHEMA_PATH;

export const MODULES_CONFIG_PATH = process.env.MODULES_CONFIG_PATH || path.join(ROOT_DIR, 'data', 'modules.json');
export const SEQUENCE_RULES_PATH = process.env.SEQUENCE_RULES_PATH
    ? path.isAbsolute(process.env.SEQUENCE_RULES_PATH)
        ? process.env.SEQUENCE_RULES_PATH
        : path.join(ROOT_DIR, process.env.SEQUENCE_RULES_PATH)
    : path.join(ROOT_DIR, 'data', 'sequence-rules.json');

export const SECRET_FIELDS_PATH = path.join(ROOT_DIR, 'data', 'security', 'secret_fields.json');
export const BRANCH_DOMAINS_CONFIG_PATH = path.join(ROOT_DIR, 'data', 'branches.domain-config.json');
export const HISTORY_DIR = process.env.HISTORY_DIR || path.join(ROOT_DIR, 'data', 'history');

// ============ FEATURE FLAGS ============

export const GLOBAL_AUTH_ENABLED = !['0', 'false', 'no', 'off'].includes(
    String(process.env.ENABLE_AUTH_LAYER || '0').toLowerCase()
);

export const METRICS_ENABLED = !['0', 'false', 'no', 'off'].includes(
    String(process.env.WS2_METRICS || process.env.WS2_ENABLE_METRICS || '1').toLowerCase()
);

export const PROM_EXPORTER_PREFERRED = METRICS_ENABLED && !['0', 'false', 'no', 'off'].includes(
    String(process.env.WS2_PROMETHEUS_DISABLED || process.env.WS2_DISABLE_PROMETHEUS || '').toLowerCase()
);

export const EVENT_ARCHIVER_DISABLED = ['1', 'true', 'yes'].includes(
    String(process.env.WS2_EVENT_ARCHIVE_DISABLED || process.env.EVENT_ARCHIVE_DISABLED || '').toLowerCase()
);

// ============ LIMITS & CONSTRAINTS ============

export const MAX_UPLOAD_FILES = Number(process.env.UPLOAD_MAX_FILES || 5);
export const MAX_UPLOAD_FILE_SIZE = Number(process.env.UPLOAD_MAX_FILE_SIZE || 10 * 1024 * 1024); // 10MB

export const RECAPTCHA_LENGTH = Number(process.env.RECAPTCHA_LENGTH || 6);
export const RECAPTCHA_TTL_MS = Number(process.env.RECAPTCHA_TTL_MS || 5 * 60 * 1000);

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const HYBRID_CACHE_TTL_MS = Math.max(250, Number(process.env.HYBRID_CACHE_TTL_MS) || 1500);

export const EVENT_ARCHIVE_INTERVAL_MS = Math.max(
    60000,
    Number(process.env.WS2_EVENT_ARCHIVE_INTERVAL_MS || process.env.EVENT_ARCHIVE_INTERVAL_MS) || 5 * 60 * 1000
);

// ============ DATABASE CONFIGURATION ============

export const EVENTS_PG_URL =
    process.env.WS2_EVENTS_PG_URL ||
    process.env.EVENTS_PG_URL ||
    process.env.WS2_PG_URL ||
    process.env.DATABASE_URL ||
    null;

// ============ DEFAULT VALUES ============

export const DEFAULT_BRANCH_ID = process.env.DEFAULT_BRANCH_ID || 'pt';
export const DEFAULT_MODULE_ID = process.env.DEFAULT_MODULE_ID || 'clinic';
export const UNIVERSAL_CRUD_BRANCH = process.env.UNIVERSAL_CRUD_BRANCH || 'clinic';

export const DEFAULT_TRANSACTION_TABLES = ['order_header', 'order_line', 'order_payment', 'pos_shift'];

// ============ RESEED CONFIGURATION ============

export const RESEED_PASSPHRASE = String(
    process.env.WS2_RESEED_PASSPHRASE || process.env.RESEED_PASSPHRASE || ''
).trim();

export const ACCEPTED_RESEED_CODES = new Set(RESEED_PASSPHRASE ? [RESEED_PASSPHRASE] : []);

// ============ CONTENT TYPES ============

export const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

// ============ CACHE HEADERS ============

export const STATIC_CACHE_HEADERS = DEV_MODE
    ? {
        'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        pragma: 'no-cache',
        expires: '0'
    }
    : {
        'cache-control': 'public, max-age=86400'
    };

// ============ POLICY LOADERS ============

/**
 * Load security policy from secret_fields.json
 * @returns {Object} Security policy with secretFields and lockedTables
 */
export function loadSecurityPolicy() {
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

/**
 * Load branch domain configuration
 * @returns {Object} Branch domains mapping
 */
export function loadBranchDomainsConfig() {
    try {
        const payload = readFileSync(BRANCH_DOMAINS_CONFIG_PATH, 'utf8');
        return JSON.parse(payload);
    } catch (_err) {
        return {};
    }
}

// ============ INITIALIZED CONSTANTS ============

export const SECURITY_POLICY = loadSecurityPolicy();

export const SECRET_FIELD_MAP = new Map();
Object.entries(SECURITY_POLICY.secretFields || {}).forEach(([table, fields]) => {
    if (!table) return;
    if (!Array.isArray(fields) || !fields.length) return;
    SECRET_FIELD_MAP.set(String(table).toLowerCase(), new Set(fields.map((field) => String(field))));
});

export const LOCKED_TABLE_SET = new Set(
    Array.isArray(SECURITY_POLICY.lockedTables)
        ? SECURITY_POLICY.lockedTables.map((name) => String(name).toLowerCase())
        : []
);

export const BRANCH_DOMAINS = loadBranchDomainsConfig();

// ============ METRICS STATE ============

export const metricsState = {
    enabled: METRICS_ENABLED,
    prom: { client: null, register: null, counters: {}, histograms: {} },
    ws: { broadcasts: 0, frames: 0, serializations: 0, cacheHits: 0, payloadBytes: 0 },
    ajax: { requests: 0, totalDurationMs: 0 },
    http: { requests: 0 }
};

// Export all as default for convenience
export default {
    ROOT_DIR,
    HOST,
    PORT,
    DEV_MODE,
    SERVER_ID,
    BRANCHES_DIR,
    STATIC_DIR,
    UPLOADS_DIR,
    SCHEMA_PATH,
    MODULES_CONFIG_PATH,
    SECRET_FIELDS_PATH,
    BRANCH_DOMAINS_CONFIG_PATH,
    GLOBAL_AUTH_ENABLED,
    METRICS_ENABLED,
    MAX_UPLOAD_FILES,
    MAX_UPLOAD_FILE_SIZE,
    SESSION_TTL_MS,
    DEFAULT_BRANCH_ID,
    DEFAULT_MODULE_ID,
    CONTENT_TYPES,
    STATIC_CACHE_HEADERS,
    SECURITY_POLICY,
    SECRET_FIELD_MAP,
    LOCKED_TABLE_SET,
    BRANCH_DOMAINS,
    metricsState
};
