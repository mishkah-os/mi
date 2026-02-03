/**
 * Utility Helper Functions
 * Extracted from server.js for better modularity
 * Contains: sanitization, normalization, file operations,  data manipulation helpers
 */

import { DEFAULT_BRANCH_ID } from '../config/index.js';

// ============ URL & RECORD UTILITIES ============

export function resolveBranchId(url) {
    return url.searchParams.get('branch') || DEFAULT_BRANCH_ID;
}

// ============ TABLE & SECURITY UTILITIES ============

export function normalizeTableName(tableName) {
    if (typeof tableName !== 'string') return '';
    return tableName.trim().toLowerCase();
}

export function sanitizeRecordForClient(tableName, record, secretFieldMap, lockedTableSet) {
    if (!record || typeof record !== 'object') return record;

    const normalizedName = normalizeTableName(tableName);
    if (lockedTableSet && lockedTableSet.has(normalizedName)) {
        return null;
    }

    const secretSet = secretFieldMap ? secretFieldMap.get(normalizedName) : null;
    if (!secretSet || secretSet.size === 0) {
        return { ...record };
    }

    const sanitized = {};
    for (const key of Object.keys(record)) {
        if (secretSet.has(String(key))) continue;
        sanitized[key] = record[key];
    }
    return sanitized;
}

export function sanitizeTableRows(tableName, rows, secretFieldMap, lockedTableSet) {
    const normalizedName = normalizeTableName(tableName);
    if (lockedTableSet && lockedTableSet.has(normalizedName)) {
        return [];
    }
    if (!Array.isArray(rows)) return rows;
    return rows
        .map((row) => sanitizeRecordForClient(tableName, row, secretFieldMap, lockedTableSet))
        .filter((row) => row && typeof row === 'object');
}

export function sanitizeTablesPayload(tables, secretFieldMap, lockedTableSet) {
    if (!tables || typeof tables !== 'object') return tables;
    const filtered = {};
    for (const [tableName, rows] of Object.entries(tables)) {
        filtered[tableName] = sanitizeTableRows(tableName, rows, secretFieldMap, lockedTableSet);
    }
    return filtered;
}

export function sanitizeModuleSnapshot(snapshot, secretFieldMap, lockedTableSet) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const tables = sanitizeTablesPayload(snapshot.tables || {}, secretFieldMap, lockedTableSet);
    return {
        ...snapshot,
        tables
    };
}

// ============ STRING & DATA NORMALIZATION ============

export function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch (_err) {
        return value;
    }
}

export function normalizeIdentifier(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function normalizeLangCode(code, fallback = 'ar') {
    if (!code || typeof code !== 'string') return fallback;
    return code.trim().toLowerCase() || fallback;
}

// ============ TRANSLATION UTILITIES ============

export function extractTranslationFields(record, fkColumn) {
    const fields = {};
    for (const [key, value] of Object.entries(record || {})) {
        const normalized = String(key || '').toLowerCase();
        if (normalized === 'id' || normalized === fkColumn.toLowerCase() || normalized === 'lang') continue;
        if (normalized === 'created_date' || normalized === 'modified_date') continue;
        if (normalized.endsWith('_id') && normalized !== fkColumn.toLowerCase()) continue;
        fields[key] = value;
    }
    return fields;
}

export function buildTranslationBundle(store, tableName, recordId) {
    const langTable = `${tableName}_lang`;
    if (!store.tables || !store.tables.includes(langTable)) {
        return { translations: {}, fields: [] };
    }

    const fkColumn = `${tableName}_id`;
    const translations = {};
    const fields = new Set();
    const records = (store.listTable(langTable) || []).filter((row) => row[fkColumn] === recordId);

    for (const row of records) {
        const lang = normalizeLangCode(row.lang);
        const payload = extractTranslationFields(row, fkColumn);
        Object.keys(payload).forEach((key) => fields.add(key));
        translations[lang] = payload;
    }

    return { translations, fields: Array.from(fields) };
}

export function normalizeTranslationPayload(input = {}, opts = {}) {
    const strategy = input.__strategy || input.__mode || opts.defaultStrategy || 'merge';
    const upsert = {};
    const remove = [];

    if (Array.isArray(input.__delete)) {
        input.__delete.forEach((code) => {
            const normalized = normalizeLangCode(code);
            if (normalized) remove.push(normalized);
        });
    }

    for (const [lang, payload] of Object.entries(input || {})) {
        if (lang.startsWith('__')) continue;
        const normalizedLang = normalizeLangCode(lang);
        if (!normalizedLang) continue;

        if (payload === null || payload === undefined) {
            remove.push(normalizedLang);
            continue;
        }

        if (typeof payload !== 'object') continue;

        const filtered = {};
        for (const [field, value] of Object.entries(payload)) {
            if (value !== undefined) {
                filtered[field] = value;
            }
        }

        if (Object.keys(filtered).length > 0) {
            upsert[normalizedLang] = filtered;
        }
    }

    return { strategy, upsert, remove };
}

// ============ IMAGE & MEDIA UTILITIES ============

export function normalizeImageList(value) {
    if (!value) return '[]';
    let arr = [];
    if (Array.isArray(value)) {
        arr = value;
    } else if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            arr = Array.isArray(parsed) ? parsed : value.split(',').map((part) => part.trim());
        } catch (_err) {
            arr = value.split(',').map((part) => part.trim());
        }
    }
    const sanitized = arr
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .slice(0, 12);
    return JSON.stringify(sanitized);
}

export function parseImageList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const arr = JSON.parse(value);
            return Array.isArray(arr) ? arr : [];
        } catch (_err) {
            return [];
        }
    }
    return [];
}

// ============ FILTER & QUERY UTILITIES ============

export function normalizeFilterClauses(filterInput) {
    if (!filterInput) return [];
    if (Array.isArray(filterInput)) {
        return filterInput.filter((entry) => entry && typeof entry === 'object');
    }
    if (typeof filterInput === 'object') {
        return [filterInput];
    }
    return [];
}

export function normalizeOperator(value) {
    if (!value || typeof value !== 'string') return '=';
    return value.trim().toLowerCase();
}

export function evaluateFilterCondition(fieldValue, clause) {
    if (clause && typeof clause === 'object' && clause.operator !== undefined) {
        const operator = normalizeOperator(clause.operator);
        const expected = clause.value;
        switch (operator) {
            case '=':
            case 'eq':
                return fieldValue === expected;
            case '!=':
            case '<>':
            case 'ne':
                return fieldValue !== expected;
            case '>':
            case 'gt':
                return Number(fieldValue) > Number(expected);
            case '>=':
            case 'gte':
                return Number(fieldValue) >= Number(expected);
            case '<':
            case 'lt':
                return Number(fieldValue) < Number(expected);
            case '<=':
            case 'lte':
                return Number(fieldValue) <= Number(expected);
            case 'in': {
                const list = Array.isArray(expected) ? expected : [expected];
                return list.some((entry) => entry === fieldValue);
            }
            case 'not in':
            case 'nin': {
                const list = Array.isArray(expected) ? expected : [expected];
                return !list.some((entry) => entry === fieldValue);
            }
            case 'like': {
                if (typeof fieldValue !== 'string' || typeof expected !== 'string') return false;
                const regex = new RegExp(expected.replace(/[%_]/g, '.*'), 'i');
                return regex.test(fieldValue);
            }
            default:
                return false;
        }
    }
    return fieldValue === clause;
}

export function applyModuleFilters(rows, filterInput) {
    const clauses = normalizeFilterClauses(filterInput);
    if (!clauses.length) return rows;
    return rows.filter((row) =>
        clauses.every((clause) =>
            Object.entries(clause).every(([field, condition]) => evaluateFilterCondition(row?.[field], condition))
        )
    );
}

export function applyModuleOrdering(rows, orderInput) {
    if (!orderInput) return rows;
    const descriptors = Array.isArray(orderInput) ? orderInput : [orderInput];
    const normalized = descriptors
        .map((entry) => {
            if (typeof entry === 'string') {
                return { field: entry, direction: 'asc' };
            }
            if (Array.isArray(entry) && entry.length) {
                return { field: entry[0], direction: entry[1] || 'asc' };
            }
            if (entry && typeof entry === 'object' && entry.field) {
                return { field: entry.field, direction: entry.direction || entry.dir || 'asc' };
            }
            return null;
        })
        .filter((item) => item && item.field);
    if (!normalized.length) return rows;
    const copy = rows.slice();
    copy.sort((a, b) => {
        for (const descriptor of normalized) {
            const direction = String(descriptor.direction || 'asc').toLowerCase() === 'desc' ? -1 : 1;
            const av = a?.[descriptor.field];
            const bv = b?.[descriptor.field];
            if (av == null && bv == null) continue;
            if (av == null) return 1 * direction;
            if (bv == null) return -1 * direction;
            if (av === bv) continue;
            if (typeof av === 'number' && typeof bv === 'number') {
                return av > bv ? direction : -direction;
            }
            const aStr = String(av).toLowerCase();
            const bStr = String(bv).toLowerCase();
            if (aStr === bStr) continue;
            return aStr > bStr ? direction : -direction;
        }
        return 0;
    });
    return copy;
}

// ============ ARRAY & COLLECTION UTILITIES ============

export function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
}

export function parseModuleList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
        return Array.from(new Set(input.map((item) => normalizeIdentifier(item)).filter(Boolean)));
    }
    if (typeof value === 'string') {
        return parseModuleList(
            input
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
        );
    }
    return [];
}

// ============ PATH UTILITIES ============

export function encodeBranchId(branchId) {
    return encodeURIComponent(branchId);
}

export function parseCookies(header) {
    if (typeof header !== 'string' || !header.trim()) return {};
    const entries = header.split(';');
    const cookies = {};
    for (const rawEntry of entries) {
        const entry = rawEntry.trim();
        if (!entry) continue;
        const idx = entry.indexOf('=');
        if (idx <= 0) continue;
        const name = entry.slice(0, idx).trim();
        if (!name) continue;
        const rawValue = entry.slice(idx + 1).trim();
        cookies[name] = safeDecode(rawValue);
    }
    return cookies;
}

// ============ TIMESTAMP & DATE UTILITIES ============

export function resolveTimestampInput(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) return numeric;
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

export function resolveExpiryDate(input) {
    if (input && typeof input === 'string' && input.trim()) return input;
    const days = Number(process.env.CLASSIFIEDS_DEFAULT_EXPIRY_DAYS || 30);
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return future.toISOString();
}

// ============ JSON UTILITIES ============

export async function readJsonSafe(filePath, fallback = null) {
    try {
        const { readFile } = await import('fs/promises');
        const raw = await readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === 'ENOENT') return fallback;
        return fallback;
    }
}

export async function writeJson(filePath, payload) {
    const { writeFile, mkdir } = await import('fs/promises');
    const path = await import('path');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function fileExists(filePath) {
    try {
        const { access, constants } = await import('fs/promises');
        await access(filePath, constants.F_OK);
        return true;
    } catch (_err) {
        return false;
    }
}

// ============ HTTP UTILITIES ============

export function jsonResponse(res, status, payload) {
    res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    });
    res.end(JSON.stringify(payload, null, 2));
}

export async function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => {
            if (!data) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}
