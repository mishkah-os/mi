import logger from '../logger.js';
import { nowIso, deepClone } from '../utils.js';
import { jsonResponse, normalizeCursorInput } from '../runtime/utils.js';
import { resolveBranchId, listAvailableLanguages, normalizeIdentifier, parseModuleList, resolveLangParam } from '../records.js';
import { safeDecode, readJsonSafe, fileExists } from '../utils/helpers.js';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { getDatabase, isManagedTable, persistRecord, truncateTable, DEFAULT_TABLES } from '../database/sqlite-ops.js';
import { migrateSchema } from '../database/schema-migrator.js';
import { validateSchema } from '../database/schema-validator.js';
import { ClinicBookingService } from './services/ClinicBookingService.js';

/**
 * API Router
 * Routes all HTTP API requests to appropriate handlers
 */
export function createApiRouter({
    syncManager,
    moduleStoreManager,
    purgeManager,
    authEngine,
    moduleEventHandler,
    branchConfigManager,
    deltaEngine,
    posOrderHandler,
    wsClientManager,
    sequenceManager,
    pathResolvers,
    config
}) {
    const { SERVER_ID, BRANCHES_DIR, DEFAULT_MODULE_ID, HOST, PORT, BRANCH_DOMAINS } = config;

    // PERFORMANCE CACHE: Schedule Data
    const scheduleCache = new Map(); // key: `${branchId}:${moduleId}`, value: { version: number, timestamp: number, data: object }

    function getScheduleCacheKey(branchId, moduleId) {
        return `${branchId}:${moduleId}`;
    }

    function invalidateScheduleCache(branchId, moduleId) {
        const key = getScheduleCacheKey(branchId, moduleId);
        scheduleCache.delete(key);
    }

    function getCachedScheduleVersion(branchId, moduleId) {
        const key = getScheduleCacheKey(branchId, moduleId);
        const entry = scheduleCache.get(key);
        // Return version or 0. If no entry, it's virtually 0 (empty/stale)
        return entry ? entry.version : 0;
    }

    async function getCachedScheduleData(branchId, moduleId) {
        const key = getScheduleCacheKey(branchId, moduleId);
        const cached = scheduleCache.get(key);

        // Return cached if valid (e.g., TTL 2 seconds?) 
        // For now, we rely on invalidation. If cached exists, it is valid until invalidated.
        // We add a safety TTL of 5 seconds just in case we miss an invalidation event.
        const now = Date.now();
        if (cached && (now - cached.timestamp < 5000)) {
            return cached.data;
        }

        // Fetch fresh
        const rawDb = getDatabase({ branchId, moduleId });
        if (!rawDb) return null;

        // Use transaction for consistent read if possible, or just sequential
        const schedules = rawDb.prepare('SELECT * FROM order_schedule WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);
        const lines = rawDb.prepare('SELECT * FROM order_schedule_line WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);
        const tables = rawDb.prepare('SELECT * FROM order_schedule_tables WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);
        const payments = rawDb.prepare('SELECT * FROM order_schedule_payment WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);

        const data = {
            schedules: schedules || [],
            lines: lines || [],
            tables: tables || [],
            payments: payments || []
        };

        scheduleCache.set(key, {
            version: now, // Use timestamp as simple versioning
            timestamp: now,
            data
        });

        return data;
    }

    async function readBody(req) {
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

    function buildBranchSnapshot(branchId, sanitizeModuleSnapshot) {
        // Need sanitizeModuleSnapshot to be passed in or available. 
        // It is passed as argument in handleDeepCrudApi, let's reuse logic or pass it down.
        // For listBranchSummaries, we need simpler snapshot.
        const modules = branchConfigManager.getBranchModules(branchId);
        const snapshot = {};
        for (const moduleId of modules) {
            // Retrieve snapshot from store if loaded
            const stores = typeof moduleStoreManager.getModuleStores === 'function'
                ? moduleStoreManager.getModuleStores()
                : moduleStoreManager.moduleStores;
            const key = moduleStoreManager.moduleKey(branchId, moduleId);
            if (stores && typeof stores.has === 'function' && stores.has(key)) {
                snapshot[moduleId] = stores.get(key).getSnapshot();
            }
        }
        return {
            branchId,
            modules: snapshot,
            updatedAt: nowIso(),
            serverId: SERVER_ID
        };
    }

    function buildResetDiagnostics({ url, req, branchId, moduleId, store, purgeResult }) {
        const persistedTables = store?.persistedTables ? Array.from(store.persistedTables) : [];
        const tableCounts = {};
        if (store?.data && typeof store.data === 'object') {
            for (const table of persistedTables) {
                tableCounts[table] = Array.isArray(store.data[table]) ? store.data[table].length : 0;
            }
        }
        return {
            ok: true,
            path: url.pathname,
            method: req.method,
            branchId,
            moduleId,
            purge: {
                totalPurged: purgeResult?.totalRemoved || 0,
                purgedTables: purgeResult?.purgeHistoryEntry?.tables || purgeResult?.historyEntry?.tables || null,
                historyEntryId: purgeResult?.historyEntry?.id || null,
                purgeHistoryEntryId: purgeResult?.purgeHistoryEntry?.id || null
            },
            persistedTables,
            persistedCounts: tableCounts,
            storeMeta: store?.meta || null,
            serverId: SERVER_ID,
            at: nowIso()
        };
    }

    async function syncExternalSeedTables(branchId, moduleId) {
        const startedAt = Date.now();
        const branchConfig = BRANCH_DOMAINS?.[branchId];
        if (!branchConfig?.domain_url) {
            const error = new Error(`No domain config for branch: ${branchId}`);
            error.code = 'branch-config-not-found';
            throw error;
        }

        const syncAction = branchConfig.sync_action || 'pos_database_view';
        const sourceUrl = `${branchConfig.domain_url}/api/v6/${syncAction}`;
        const sourceResponse = await fetch(sourceUrl, {
            method: 'GET',
            headers: { 'X-API-KEY': branchConfig.api_key }
        });

        if (!sourceResponse.ok) {
            const error = new Error(`Source fetch failed with status ${sourceResponse.status}`);
            error.code = 'source-fetch-failed';
            error.status = sourceResponse.status;
            error.sourceUrl = sourceUrl;
            throw error;
        }

        const remotePayload = await sourceResponse.json();
        let remoteTables = null;
        if (remotePayload && typeof remotePayload === 'object' && !Array.isArray(remotePayload)) {
            if (remotePayload.tables && typeof remotePayload.tables === 'object') {
                remoteTables = remotePayload.tables;
            } else if (!Object.prototype.hasOwnProperty.call(remotePayload, 'tables')) {
                remoteTables = remotePayload;
            }
        }

        if (!remoteTables || typeof remoteTables !== 'object') {
            const error = new Error('Source response missing tables payload');
            error.code = 'source-data-invalid';
            error.sourceUrl = sourceUrl;
            throw error;
        }

        // Resolving paths
        const moduleSeedPath = pathResolvers.getModuleSeedPath
            ? pathResolvers.getModuleSeedPath(branchId, moduleId)
            : null;
        if (!moduleSeedPath) {
            const error = new Error('Seed path resolver missing');
            error.code = 'seed-path-missing';
            throw error;
        }

        // New: Resolve Shared Seed Path
        const sharedSeedPath = pathResolvers.getSharedSeedPath
            ? pathResolvers.getSharedSeedPath(branchId)
            : null;

        // Load current seeds
        const currentModuleSeeds = (await readJsonSafe(moduleSeedPath, null)) || {};
        const currentSharedSeeds = sharedSeedPath ? ((await readJsonSafe(sharedSeedPath, null)) || {}) : {};

        // Prepare merge targets
        const mergedModuleTables = currentModuleSeeds.tables && typeof currentModuleSeeds.tables === 'object'
            ? { ...currentModuleSeeds.tables }
            : {};

        const mergedSharedTables = currentSharedSeeds.tables && typeof currentSharedSeeds.tables === 'object'
            ? { ...currentSharedSeeds.tables }
            : {};

        // Defined transforms for POS module
        const TRANSFORMS = {
            tables: {
                'items': 'menu_items',
                'categories': 'menu_categories',
                'companies': 'sys_companies',
                'branches': 'sys_branches',
                'users': 'sys_users',
                'users_groups_relations': 'sys_user_branch_access',
                'users_groups': 'sys_roles'
            },
            fields: {
                'menu_items': (row) => {
                    const mapped = { ...row };
                    if (row.item_name && typeof row.item_name === 'object') {
                        mapped.nameAr = row.item_name.ar || '';
                        mapped.nameEn = row.item_name.en || '';
                    }
                    if (row.item_description && typeof row.item_description === 'object') {
                        mapped.descriptionAr = row.item_description.ar || null;
                        mapped.descriptionEn = row.item_description.en || null;
                    }
                    if (row.pricing && typeof row.pricing === 'object') {
                        mapped.basePrice = Number(row.pricing.base) || 0;
                    }
                    if (row.category_id) mapped.categoryId = row.category_id;
                    if (row.kitchen_section_id) mapped.kitchenSectionId = row.kitchen_section_id;
                    if (row.media && row.media.image) {
                        mapped.image = row.media.image;
                    }
                    return mapped;
                },
                'menu_categories': (row) => {
                    const mapped = { ...row };
                    if (row.category_name && typeof row.category_name === 'object') {
                        mapped.nameAr = row.category_name.ar || '';
                        mapped.nameEn = row.category_name.en || '';
                    }
                    if (row.section_id) mapped.sectionId = row.section_id;
                    return mapped;
                },
                'sys_companies': (row) => {
                    const mapped = {};
                    mapped.id = row.ID;
                    mapped.name = row.Company_name || 'Unofficial';
                    mapped.domain_url = row.URL;
                    mapped.logo_url = row.Logo_url;
                    mapped.is_active = row.active;
                    mapped.created_date = row.Begin_date;
                    mapped.tax_id = null;
                    mapped.commercial_reg = null;

                    if (mergedSharedTables) {
                        if (!mergedSharedTables.sys_companies_lang) mergedSharedTables.sys_companies_lang = [];
                        const langId = `${row.ID}_ar`;
                        const langEntry = {
                            id: langId,
                            ref_id: row.ID,
                            lang_code: 'ar',
                            name: row.Company_name || '',
                            address: ''
                        };
                        const idx = mergedSharedTables.sys_companies_lang.findIndex(x => x.id === langId);
                        if (idx >= 0) mergedSharedTables.sys_companies_lang[idx] = langEntry;
                        else mergedSharedTables.sys_companies_lang.push(langEntry);
                    }
                    return mapped;
                },
                'sys_branches': (row) => {
                    const mapped = {};
                    mapped.id = row.ID;
                    mapped.company_id = row.Company_ID;
                    mapped.code = row.Code;
                    mapped.name = row.Branch_name;
                    mapped.type = 'STORE';
                    mapped.address = row.Address_Details;
                    mapped.is_active = row.active;

                    if (mergedSharedTables) {
                        if (!mergedSharedTables.sys_branches_lang) mergedSharedTables.sys_branches_lang = [];
                        const langId = `${row.ID}_ar`;
                        const langEntry = {
                            id: langId,
                            ref_id: row.ID,
                            lang_code: 'ar',
                            name: row.Branch_name || '',
                            address: row.Address_Details || ''
                        };
                        const idx = mergedSharedTables.sys_branches_lang.findIndex(x => x.id === langId);
                        if (idx >= 0) mergedSharedTables.sys_branches_lang[idx] = langEntry;
                        else mergedSharedTables.sys_branches_lang.push(langEntry);
                    }
                    return mapped;
                },
                'sys_users': (row) => {
                    const mapped = {};
                    mapped.id = row.id || row.ID || row.Id || row.UserId || row.User_ID;
                    mapped.username = row.username || row.UserName || row.Email || row.email;
                    mapped.email = row.email || row.Email;
                    mapped.full_name = row.full_name || [row.First_Name, row.Last_name, row.Family_Name].filter(Boolean).join(' ') || mapped.username;
                    mapped.password_hash = row.password_hash || row.PassWord_Hash;
                    mapped.mobile = row.mobile || row.Phone_number;
                    mapped.license_status = row.license_status || 1;
                    mapped.created_date = row.created_date || row.Begin_date;
                    mapped.last_login = row.last_login || row.Last_login;
                    mapped.default_lang = row.default_lang || 'ar';
                    mapped.default_theme = row.default_theme || 'light';
                    mapped.pin_code = row.pin_code || row.pinCode || row.PinCode || row.pin || row.activation_code || row.Code; // Check multiple potential PIN fields
                    return mapped;
                },
                'sys_roles': (row) => {
                    const mapped = {};
                    mapped.id = row.ID;
                    mapped.name = row.Group_name;
                    mapped.is_superadmin = (row.Group_name === 'Administrators' || row.Group_name === 'webadmin');

                    if (mergedSharedTables) {
                        if (!mergedSharedTables.sys_roles_lang) mergedSharedTables.sys_roles_lang = [];
                        const langId = `${row.ID}_ar`;
                        const langEntry = {
                            id: langId,
                            ref_id: row.ID,
                            lang_code: 'ar',
                            name: row.Group_name || '',
                            description: ''
                        };
                        const idx = mergedSharedTables.sys_roles_lang.findIndex(x => x.id === langId);
                        if (idx >= 0) mergedSharedTables.sys_roles_lang[idx] = langEntry;
                        else mergedSharedTables.sys_roles_lang.push(langEntry);
                    }
                    return mapped;
                },
                'sys_user_branch_access': (row) => {
                    return null;
                }
            }
        };

        const tableResults = [];
        let totalUpdates = 0;
        let totalInserts = 0;
        let totalIgnored = 0;
        let replacedTables = 0;

        for (const [rawTableName, remoteValue] of Object.entries(remoteTables)) {
            const tableName = TRANSFORMS.tables[rawTableName] || rawTableName;

            // Determine target: Shared or Module?
            // "sys_" tables go to shared, others remain in module
            const isShared = tableName.startsWith('sys_');
            const targetTables = isShared ? mergedSharedTables : mergedModuleTables;

            if (Array.isArray(remoteValue)) {
                const localRows = Array.isArray(targetTables[tableName]) ? targetTables[tableName] : [];
                const merged = [...localRows];
                const localById = new Map();

                for (let i = 0; i < localRows.length; i += 1) {
                    const localId = localRows[i]?.id;
                    if (localId !== undefined && localId !== null) {
                        localById.set(String(localId), i);
                    }
                }

                let updates = 0;
                let inserts = 0;
                let ignored = 0;

                const transformer = TRANSFORMS.fields[tableName];

                for (const rawRow of remoteValue) {
                    const remoteId = rawRow?.id ?? rawRow?.ID ?? rawRow?.Id ?? rawRow?.UserId ?? rawRow?.User_ID;
                    if (remoteId === undefined || remoteId === null) {
                        ignored += 1;
                        continue;
                    }

                    const remoteRow = transformer ? transformer(rawRow) : rawRow;
                    if (remoteRow === null) continue; // Skip if transformer returned null

                    const localIndex = localById.get(String(remoteId));
                    if (localIndex !== undefined) {
                        merged[localIndex] = { ...merged[localIndex], ...remoteRow };
                        updates += 1;
                    } else {
                        merged.push({ ...remoteRow });
                        inserts += 1;
                    }
                }

                targetTables[tableName] = merged; // Update the record for writing
                totalUpdates += updates;
                totalInserts += inserts;
                totalIgnored += ignored;
                tableResults.push({
                    table: tableName,
                    target: isShared ? 'shared' : 'module',
                    status: 'updated',
                    stats: {
                        updates,
                        inserts,
                        total: merged.length,
                        preserved: merged.length - updates - inserts,
                        ignored
                    }
                });
            } else if (remoteValue && typeof remoteValue === 'object') {
                targetTables[tableName] = deepClone(remoteValue);
                replacedTables += 1;
                tableResults.push({ table: tableName, target: isShared ? 'shared' : 'module', status: 'replaced', stats: { entries: 1 } });
            } else {
                targetTables[tableName] = remoteValue;
                replacedTables += 1;
                tableResults.push({ table: tableName, target: isShared ? 'shared' : 'module', status: 'replaced', stats: { entries: 1 } });
            }
        }

        const { mkdir, writeFile } = await import('fs/promises');
        const path = await import('path');

        // Write Module Seeds
        await mkdir(path.dirname(moduleSeedPath), { recursive: true });
        const updatedModuleSeeds = {
            ...currentModuleSeeds,
            tables: mergedModuleTables,
            lastExternalSeedSync: {
                time: nowIso(),
                sourceUrl,
                tables: Object.keys(remoteTables).filter(t => !(TRANSFORMS.tables[t] || t).startsWith('sys_')),
                results: tableResults.filter(r => r.target === 'module')
            }
        };
        await writeFile(moduleSeedPath, JSON.stringify(updatedModuleSeeds, null, 2), 'utf8');

        // Write Shared Seeds (if supported)
        if (sharedSeedPath) {
            await mkdir(path.dirname(sharedSeedPath), { recursive: true });
            const updatedSharedSeeds = {
                ...currentSharedSeeds,
                tables: mergedSharedTables,
                lastExternalSeedSync: {
                    time: nowIso(),
                    sourceUrl,
                    tables: Object.keys(remoteTables).filter(t => (TRANSFORMS.tables[t] || t).startsWith('sys_')),
                    results: tableResults.filter(r => r.target === 'shared')
                }
            };
            await writeFile(sharedSeedPath, JSON.stringify(updatedSharedSeeds, null, 2), 'utf8');
        }

        if (moduleStoreManager?.invalidateModuleSeedCache) {
            moduleStoreManager.invalidateModuleSeedCache(branchId, moduleId);
        }

        return {
            seedPath: moduleSeedPath,
            sharedSeedPath: sharedSeedPath || 'N/A',
            sourceUrl,
            results: tableResults,
            tables: Object.keys(remoteTables),
            report: {
                success: true,
                status: 'ok',
                durationMs: Date.now() - startedAt,
                totalTables: Object.keys(remoteTables).length,
                updatedTables: tableResults.filter((item) => item.status === 'updated').length,
                replacedTables,
                updates: totalUpdates,
                inserts: totalInserts,
                ignored: totalIgnored
            }
        };
    }

    function listBranchSummaries() {
        const summaries = [];
        const branches = branchConfigManager.getBranchConfig().branches || {};
        for (const [id, config] of Object.entries(branches)) {
            summaries.push({
                id,
                label: config.label || id,
                modules: config.modules || []
            });
        }
        return summaries;
    }

    async function scaffoldBranchModule(branchId, moduleId, options = {}) {
        // Simplified scaffold using pathResolvers
        const { getBranchModuleDir } = pathResolvers;
        const { mkdir, writeFile } = await import('fs/promises'); // Dynamic import to avoid top-level node deps if not needed
        const path = await import('path');
        const moduleDir = getBranchModuleDir(branchId, moduleId);
        await mkdir(moduleDir, { recursive: true });
        const schemaPath = path.join(moduleDir, 'schema.json');
        if (options.schema) {
            await writeFile(schemaPath, JSON.stringify(options.schema, null, 2), 'utf8');
        } else {
            await writeFile(schemaPath, JSON.stringify({ tables: [] }, null, 2), 'utf8');
        }
    }

    async function ensureBranchDirectory(branchId) {
        const { getBranchDir } = pathResolvers;
        const { mkdir } = await import('fs/promises');
        const path = await import('path');
        await mkdir(path.join(getBranchDir(branchId), 'modules'), { recursive: true });
    }


    function parseSyncRequest(pathname) {
        const segments = pathname.split('/').filter(Boolean);
        if (segments.length < 2 || segments[0] !== 'api') return null;
        if (segments[1] === 'pos-sync') {
            const branchId = safeDecode(segments[2] || 'default');
            const next = (segments[3] || '').toLowerCase();
            const mode = next === 'delta' ? 'delta' : 'snapshot';
            return { branchId, moduleId: 'pos', mode };
        }
        if (segments[1] === 'sync') {
            const branchId = safeDecode(segments[2] || 'default');
            const moduleId = safeDecode(segments[3] || 'pos');
            const next = (segments[4] || '').toLowerCase();
            const mode = next === 'delta' ? 'delta' : 'snapshot';
            return { branchId, moduleId, mode };
        }
        return null;
    }

    async function handleSyncRequest(req, res, url) {
        const descriptor = parseSyncRequest(url.pathname);
        if (!descriptor) {
            jsonResponse(res, 404, { error: 'sync-endpoint-not-found', path: url.pathname });
            return true;
        }
        const { branchId, moduleId, mode = 'snapshot' } = descriptor;

        if (mode === 'delta') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }

            let body = null;
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return true;
            }

            const frameData = body && typeof body === 'object' ? body : {};
            const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const state = await syncManager.ensureSyncState(branchId, moduleId);
            const eventContext = pathResolvers.getModuleEventStoreContext(branchId, moduleId);

            let eventMeta = null;
            try {
                eventMeta = await eventStore.loadEventMeta(eventContext);
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId }, 'Failed to load event meta for delta request');
            }

            const result = deltaEngine.computeDeltaPayload(store, frameData, eventMeta);
            const clientMarker = extractClientSnapshotMarker(frameData);
            const serverMarker = resolveServerSnapshotMarker(state, eventMeta);

            result.requiresFullSync = deltaEngine.validateCursors(
                clientMarker,
                serverMarker,
                eventMeta,
                result.requiresFullSync
            );

            const clientVersionRaw = frameData.version ?? frameData.clientVersion ?? frameData.snapshotVersion;
            const clientVersion = Number(clientVersionRaw);

            const now = nowIso();
            const metaPatch = {
                lastServedTableIds: result.responseLastRefs,
                lastClientTableIds: result.normalizedClientCursorMap,
                lastSnapshotMarker: serverMarker || null,
                lastClientSnapshotMarker: clientMarker || null,
                lastClientSyncAt: now
            };

            await eventStore.updateEventMeta(eventContext, metaPatch).catch((error) => {
                logger.warn({ err: error, branchId, moduleId }, 'Failed to update event meta after delta request');
            });

            const payload = deltaEngine.buildDeltaResponse(
                state,
                result,
                clientVersion,
                clientMarker,
                serverMarker,
                SERVER_ID
            );

            jsonResponse(res, 200, payload);
            return true;
        }

        if (req.method === 'GET') {
            const state = await syncManager.ensureSyncState(branchId, moduleId);

            // OPTIMIZATION: Check ETag (If-None-Match) against version/updatedAt
            // Use a composite key of state version + schedule cache timestamp + last external seed sync
            // For now, we use state.version as primary ETag. 
            // Note: If schedule changes, we should ideally bump a version or tracking ID. 
            // In POS logic, order_schedule is disjoint from main sync state, so we check both.
            // Simplified ETag: `${state.version}-${getScheduleCacheVersion(branchId, moduleId)}`

            const currentScheduleVersion = getCachedScheduleVersion(branchId, moduleId);
            const etag = `W/"${state.version}-${currentScheduleVersion}"`;

            if (req.headers['if-none-match'] === etag) {
                res.writeHead(304, { 'ETag': etag });
                res.end();
                return true;
            }

            // OPTIMIZATION: Shallow copy instead of deepClone
            // We only need to protect the top-level structure and tables map
            const snapshot = { ...state.moduleSnapshot };
            if (snapshot.tables) {
                snapshot.tables = { ...snapshot.tables };
            } else {
                snapshot.tables = {};
            }

            // OPTIMIZATION: Cached Schedule Data
            try {
                const scheduleData = await getCachedScheduleData(branchId, moduleId);
                if (scheduleData) {
                    snapshot.tables.order_schedule = scheduleData.schedules;
                    snapshot.tables.order_schedule_line = scheduleData.lines;
                    snapshot.tables.order_schedule_tables = scheduleData.tables;
                    snapshot.tables.order_schedule_payment = scheduleData.payments;
                }
            } catch (err) {
                logger.warn({ err, branchId, moduleId }, 'Failed to load order_schedule data for sync');
            }

            // Send response with ETag
            res.setHeader('ETag', etag);
            jsonResponse(res, 200, {
                branchId,
                moduleId,
                version: state.version,
                updatedAt: state.updatedAt,
                serverId: SERVER_ID,
                snapshot
            });
            return true;
        }

        if (req.method === 'POST') {
            let body = null;
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return true;
            }

            const frameData = body && typeof body === 'object' ? body : {};
            const snapshot = frameData.snapshot && typeof frameData.snapshot === 'object' ? frameData.snapshot : null;

            let state;
            try {
                state = await syncManager.applySyncSnapshot(branchId, moduleId, snapshot, {
                    origin: 'http',
                    requestId: frameData.requestId || null
                });
            } catch (error) {
                if (error?.code === 'INSERT_ONLY_VIOLATION') {
                    jsonResponse(res, 409, {
                        error: 'insert-only-violation',
                        message: error.message,
                        details: error.details || null
                    });
                    return true;
                }
                logger.warn({ err: error, branchId, moduleId }, 'Failed to apply sync snapshot via HTTP');
                jsonResponse(res, 500, { error: 'sync-snapshot-failed', message: error?.message || 'Failed to apply snapshot.' });
                return true;
            }

            await pubsubManager.broadcastSyncUpdate(branchId, moduleId, state, {
                action: frameData.action,
                mutationId: frameData.mutationId,
                meta: frameData.meta,
                frameData
            });

            jsonResponse(res, 200, {
                status: 'ok',
                branchId,
                moduleId,
                version: state.version,
                updatedAt: state.updatedAt
            });
            return true;
        }

        jsonResponse(res, 405, { error: 'method-not-allowed' });
        return true;
    }

    async function handleSchemaApi(req, res, url) {
        // Handle /api/schema?branch=...&module=...
        if (req.method !== 'GET') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        const branchId = url.searchParams.get('branch') || url.searchParams.get('branchId') || 'default';
        const moduleId = url.searchParams.get('module') || url.searchParams.get('moduleId') || 'pos';

        try {
            await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const schema = await moduleStoreManager.schemaEngine.getOrLoadSmartSchema(branchId, moduleId);
            if (!schema) {
                jsonResponse(res, 404, { error: 'schema-not-found', branchId, moduleId });
                return true;
            }
            jsonResponse(res, 200, schema);
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to serve schema API');
            jsonResponse(res, 500, { error: 'schema-error', message: error.message });
        }
        return true;
    }

    async function handleManageApi(req, res, url) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 3 || segments[0] !== 'api' || segments[1] !== 'manage') {
            return false;
        }
        const resource = segments[2];

        if (resource === 'purge-live-data') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            try {
                const body = await readBody(req);
                const branchId = body.branchId || body.branch;
                const moduleId = body.moduleId || body.module;

                if (!branchId || !moduleId) {
                    jsonResponse(res, 400, { error: 'missing-params' });
                    return true;
                }

                await purgeManager.resetModule(branchId, moduleId, { reason: 'api-purge-request' });
                jsonResponse(res, 200, { success: true, message: 'Module purged' });
            } catch (error) {
                jsonResponse(res, 500, { error: 'purge-failed', message: error.message });
            }
            return true;
        }
        return false;
    }

    async function handleManagementApi(req, res, url, fullSyncFlagManager, resetModule, summarizePurgeHistoryEntry, sanitizeModuleSnapshot) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 2 || segments[0] !== 'api' || segments[1] !== 'manage') {
            return false;
        }
        const resource = segments[2] || '';

        if (resource === 'purge-live-data') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            try {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }
                const branchId = body.branchId || body.branch;
                const moduleId = body.moduleId || body.module;

                if (!branchId || !moduleId) {
                    jsonResponse(res, 400, { error: 'missing-params' });
                    return true;
                }

                await purgeManager.resetModule(branchId, moduleId, { reason: 'api-purge-request' });
                jsonResponse(res, 200, { success: true, message: 'Module purged' });
            } catch (error) {
                jsonResponse(res, 500, { error: 'purge-failed', message: error.message });
            }
            return true;
        }

        const normalizeModules = (input, fallback = ['*']) => {
            const values = [];
            if (Array.isArray(input)) {
                for (const value of input) {
                    if (typeof value === 'string' && value.trim()) {
                        values.push(value.trim());
                    }
                }
            } else if (typeof input === 'string' && input.trim()) {
                values.push(input.trim());
            }
            if (!values.length) return fallback.slice();
            return Array.from(new Set(values));
        };

        if (resource === 'full-sync') {
            if (req.method === 'GET') {
                const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId');
                const moduleParam = url.searchParams.get('module') || url.searchParams.get('moduleId');
                const branchId = branchParam && branchParam.trim() ? branchParam.trim() : null;
                const moduleId = moduleParam && moduleParam.trim() ? moduleParam.trim() : null;
                const flags = fullSyncFlagManager.listFullSyncFlags({ branchId, moduleId }).map((entry) => fullSyncFlagManager.serializeFullSyncFlag(entry));
                jsonResponse(res, 200, { branchId, moduleId, flags });
                return true;
            }

            if (req.method === 'POST' || req.method === 'PATCH') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }

                const branchRaw = body.branchId || body.branch;
                const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }

                const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
                const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
                const modules = normalizeModules(body.modules || body.moduleIds || body.moduleId || body.module, ['*']);
                const enabled = body.enabled !== false && body.status !== 'disable' && body.action !== 'disable';

                const responses = [];
                for (const moduleId of modules) {
                    const normalizedModule = moduleId && moduleId.trim ? moduleId.trim() : '*';
                    let entry;
                    if (enabled) {
                        entry = fullSyncFlagManager.upsertFullSyncFlag(branchId, normalizedModule, {
                            reason,
                            requestedBy,
                            enabled: true,
                            meta: body.meta && typeof body.meta === 'object' ? body.meta : undefined
                        });
                    } else {
                        entry = fullSyncFlagManager.disableFullSyncFlag(branchId, normalizedModule, { requestedBy });
                    }
                    if (entry) {
                        wsClientManager.emitFullSyncDirective(entry, { toggledVia: 'management-api' });
                        responses.push(fullSyncFlagManager.serializeFullSyncFlag(entry));
                    }
                }

                jsonResponse(res, 200, { branchId, flags: responses, enabled });
                return true;
            }

            if (req.method === 'DELETE') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (_error) {
                    body = {};
                }

                const branchParam = body.branchId || body.branch || url.searchParams.get('branch') || url.searchParams.get('branchId');
                const branchId = typeof branchParam === 'string' && branchParam.trim() ? branchParam.trim() : null;
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }

                const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim()
                    ? body.requestedBy.trim()
                    : null;
                const moduleParam = body.moduleId || body.module || body.modules || url.searchParams.get('module') || url.searchParams.get('moduleId');
                const modules = normalizeModules(moduleParam, ['*']);

                const disabled = [];
                for (const moduleId of modules) {
                    const entry = fullSyncFlagManager.disableFullSyncFlag(branchId, moduleId, { requestedBy });
                    if (entry) {
                        wsClientManager.emitFullSyncDirective(entry, { toggledVia: 'management-api' });
                        disabled.push(fullSyncFlagManager.serializeFullSyncFlag(entry));
                    }
                }

                jsonResponse(res, 200, { branchId, flags: disabled, enabled: false });
                return true;
            }

            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        if (resource === 'daily-reset' || resource === 'reset') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }

            let body = {};
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return true;
            }

            const branchRaw = body.branchId || body.branch;
            const branchId = typeof branchRaw === 'string' && branchRaw.trim() ? branchRaw.trim() : null;
            if (!branchId) {
                jsonResponse(res, 400, { error: 'missing-branch-id' });
                return true;
            }

            const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim() : null;
            const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'daily-reset';
            const moduleParam = body.moduleId || body.module || body.modules;
            let modules = normalizeModules(moduleParam, []);

            if (!modules.length) {
                modules = branchConfigManager.getBranchModules(branchId);
            }
            if (!modules.length) {
                jsonResponse(res, 404, { error: 'modules-not-found', branchId });
                return true;
            }

            const flagOnReset = body.flagFullSync !== false;
            const results = [];

            for (const moduleId of modules) {
                try {
                    const { store, historyEntry } = await resetModule(branchId, moduleId, { requestedBy, reason });
                    const summary = {
                        moduleId,
                        version: store.version,
                        resetAt: nowIso(),
                        status: 'ok'
                    };

                    if (historyEntry) {
                        const { filePath, ...historySummary } = historyEntry;
                        summary.historyEntry = historySummary;
                    }

                    if (flagOnReset) {
                        const flag = fullSyncFlagManager.upsertFullSyncFlag(branchId, moduleId, { reason, requestedBy, enabled: true });
                        wsClientManager.emitFullSyncDirective(flag, { toggledVia: 'management-api', reason: 'post-reset' });
                        summary.fullSyncFlag = fullSyncFlagManager.serializeFullSyncFlag(flag);
                    }

                    results.push(summary);
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId }, 'Failed to perform daily reset');
                    results.push({ moduleId, status: 'error', error: error.message });
                }
            }

            jsonResponse(res, 200, { branchId, requestedBy, reason, results });
            return true;
        }

        // Additional management endpoints would go here...
        jsonResponse(res, 404, { error: 'management-endpoint-not-found', path: url.pathname });
        return true;
    }

    async function handleDeepCrudApi(req, res, url, isVersionConflict, versionConflictDetails, sanitizeRecordForClient, sanitizeModuleSnapshot) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 4 || segments[0] !== 'api' || segments[1] !== 'branch') {
            return false;
        }

        const branchParam = segments[2];
        const branchId = branchParam && branchParam.trim() ? branchParam.trim() : null;
        if (!branchId) {
            jsonResponse(res, 400, { error: 'missing-branch-id' });
            return true;
        }

        if (segments.length === 3) {
            jsonResponse(res, 400, { error: 'missing-module-id' });
            return true;
        }

        const moduleParam = segments[3];
        const moduleId = moduleParam && moduleParam.trim() ? moduleParam.trim() : 'pos';

        const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);

        // Read lang from query string
        const lang = url.searchParams.get('lang') || null;
        const snapshot = sanitizeModuleSnapshot(store.getSnapshot({ lang }));

        // Add order_schedule data from SQLite to snapshot
        try {
            const rawDb = getDatabase({ branchId, moduleId });
            if (rawDb) {
                const schedules = rawDb.prepare('SELECT * FROM order_schedule WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);
                const scheduleLines = rawDb.prepare('SELECT * FROM order_schedule_line WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);
                const scheduleTables = rawDb.prepare('SELECT * FROM order_schedule_tables WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);
                const schedulePayments = rawDb.prepare('SELECT * FROM order_schedule_payment WHERE branch_id = ? AND module_id = ?').all(branchId, moduleId);

                if (!snapshot.tables) snapshot.tables = {};
                snapshot.tables.order_schedule = schedules || [];
                snapshot.tables.order_schedule_line = scheduleLines || [];
                snapshot.tables.order_schedule_tables = scheduleTables || [];
                snapshot.tables.order_schedule_payment = schedulePayments || [];
            }
        } catch (err) {
            logger.warn({ err, branchId, moduleId }, 'Failed to load order_schedule data for deep CRUD');
        }

        if (segments.length === 5) {
            if (req.method === 'GET') {
                jsonResponse(res, 200, snapshot);
                return;
            }
            if (req.method === 'POST') {
                try {
                    const body = await readBody(req);
                    jsonResponse(res, 200, { received: body, snapshot });
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                }
                return;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return;
        }

        const tail = segments.slice(5);

        // Handle sequences endpoint
        if (tail.length === 1 && tail[0] === 'sequences') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }

            let body = {};
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }

            const tableName =
                (typeof body.table === 'string' && body.table.trim()) ||
                (typeof body.tableName === 'string' && body.tableName.trim()) ||
                null;
            const fieldName =
                (typeof body.field === 'string' && body.field.trim()) ||
                (typeof body.fieldName === 'string' && body.fieldName.trim()) ||
                null;

            if (!tableName || !fieldName) {
                jsonResponse(res, 400, { error: 'missing-table-or-field' });
                return;
            }

            const wantsPreview = url.searchParams.get('preview') === '1' || body.preview === true;
            try {
                const allocation = wantsPreview
                    ? await sequenceManager.previewNextValue(branchId, moduleId, tableName, fieldName, {
                        record: body.record || null
                    })
                    : await sequenceManager.nextValue(branchId, moduleId, tableName, fieldName, {
                        record: body.record || null,
                        autoCreate: true
                    });

                if (!allocation) {
                    jsonResponse(res, 404, { error: 'sequence-not-configured', table: tableName, field: fieldName });
                    return;
                }

                jsonResponse(res, 200, {
                    branchId,
                    moduleId,
                    table: tableName,
                    field: fieldName,
                    value: allocation.value,
                    id: allocation.formatted,
                    rule: allocation.rule || null,
                    preview: wantsPreview === true
                });
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId, table: tableName, field: fieldName }, 'Failed to allocate sequence');
                jsonResponse(res, 500, { error: 'sequence-allocation-failed', message: error.message });
            }
            return;
        }

        // Handle reset endpoint
        if (tail.length === 1 && tail[0] === 'reset') {
            if (req.method !== 'POST' && req.method !== 'GET') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }

            try {
                let externalSeedSync = null;
                if (moduleId === 'pos') {
                    try {
                        externalSeedSync = await syncExternalSeedTables(branchId, moduleId);
                    } catch (error) {
                        const status = error.code === 'branch-config-not-found' ? 404
                            : error.code === 'source-fetch-failed' ? 502
                                : error.code === 'source-data-invalid' ? 502
                                    : 500;
                        jsonResponse(res, status, {
                            error: error.code || 'external-seed-sync-failed',
                            message: error.message,
                            status: error.status || null,
                            report: {
                                success: false,
                                status: error.code || 'external-seed-sync-failed',
                                sourceUrl: error.sourceUrl || null
                            }
                        });
                        return;
                    }
                }

                const purgeResult = await purgeManager.resetModule(branchId, moduleId, { reason: 'branch-api-reset' });
                const store = purgeResult?.store || null;

                // Reset sequence counter
                const { mkdir: fsMkdir, writeFile: fsWrite } = await import('fs/promises');
                const path = await import('path');

                const branchKey = encodeURIComponent(branchId);
                const stateFilePath = path.join(BRANCHES_DIR, branchKey, 'sequence-state.json');
                const sequenceKey = `${moduleId}:order_header:id`;

                const currentState = {};
                currentState[sequenceKey] = {
                    last: 0,
                    updatedAt: new Date().toISOString()
                };

                await fsMkdir(path.dirname(stateFilePath), { recursive: true });
                await fsWrite(stateFilePath, JSON.stringify(currentState, null, 2), 'utf8');

                if (sequenceManager.branchStateCache) {
                    sequenceManager.branchStateCache.delete(branchId);
                    sequenceManager.branchStateCache.delete('default');
                }

                const snapshot = buildBranchSnapshot(branchId, sanitizeModuleSnapshot);
                const diagnostics = buildResetDiagnostics({
                    url,
                    req,
                    branchId,
                    moduleId,
                    store,
                    purgeResult
                });
                if (externalSeedSync) {
                    diagnostics.externalSeedSync = externalSeedSync;
                }

                jsonResponse(res, 200, {
                    success: true,
                    message: 'Module reset to initial data and sequence counter reset',
                    diagnostics,
                    ...snapshot
                });
            } catch (error) {
                logger.error({ err: error, branchId, moduleId }, 'Failed to reset module');
                jsonResponse(res, 500, { error: 'reset-failed', message: error.message, stack: error.stack });
            }
            return;
        }

        // Handle table CRUD operations
        if (tail.length >= 2 && tail[0] === 'tables') {
            const tableName = tail[1];
            if (!tableName || !tableName.trim()) {
                jsonResponse(res, 400, { error: 'missing-table-name' });
                return;
            }

            // OPTIMIZATION: Check if we need to invalidate schedule cache
            const checkScheduleInvalidation = () => {
                if (['order_schedule', 'order_schedule_line', 'order_schedule_tables', 'order_schedule_payment'].includes(tableName)) {
                    invalidateScheduleCache(branchId, moduleId);
                }
            };

            if (tail.length === 2) {
                // Collection operations
                if (req.method === 'GET') {
                    const rows = store.listTable(tableName);
                    const sanitized = rows.map((row) => sanitizeRecordForClient(tableName, row));
                    jsonResponse(res, 200, sanitized);
                    return;
                }

                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return;
                }

                const requestRecord = body.record || body.data || body;
                const requestMeta = body.meta || {};
                let response;

                try {
                    if (req.method === 'POST') {
                        response = await moduleEventHandler.handleModuleEvent(
                            branchId,
                            moduleId,
                            { action: 'module:insert', table: tableName, record: requestRecord, meta: requestMeta, source: 'rest-crud', includeRecord: true },
                            null,
                            { source: 'rest-crud' }
                        );
                        if (!response || !response.record) {
                            jsonResponse(res, 500, { error: 'insert-failed', message: 'No record returned from insert operation' });
                            return;
                        }
                        checkScheduleInvalidation();
                        jsonResponse(res, 201, response.record);
                        return;
                    }

                    if (req.method === 'PATCH') {
                        response = await moduleEventHandler.handleModuleEvent(
                            branchId,
                            moduleId,
                            { action: 'module:merge', table: tableName, record: requestRecord, meta: requestMeta, source: 'rest-crud', includeRecord: true },
                            null,
                            { source: 'rest-crud' }
                        );
                        if (!response || !response.record) {
                            jsonResponse(res, 500, { error: 'merge-failed', message: 'No record returned from merge operation' });
                            return;
                        }
                        checkScheduleInvalidation();
                        jsonResponse(res, 200, response.record);
                        return;
                    }

                    if (req.method === 'PUT') {
                        response = await moduleEventHandler.handleModuleEvent(
                            branchId,
                            moduleId,
                            { action: 'module:save', table: tableName, record: requestRecord, meta: requestMeta, source: 'rest-crud', includeRecord: true },
                            null,
                            { source: 'rest-crud' }
                        );
                        if (!response || !response.record) {
                            jsonResponse(res, 500, { error: 'save-failed', message: 'No record returned from save operation' });
                            return;
                        }
                        const statusCode = response.entry?.created === true ? 201 : 200;
                        checkScheduleInvalidation();
                        jsonResponse(res, statusCode, response.record);
                        return;
                    }

                    if (req.method === 'DELETE') {
                        const recordInput = requestRecord && typeof requestRecord === 'object' ? requestRecord : body;
                        const recordRef = store.getRecordReference(tableName, recordInput);
                        if (!recordRef || (!recordRef.id && !recordRef.key)) {
                            jsonResponse(res, 400, { error: 'missing-record-key' });
                            return;
                        }

                        response = await moduleEventHandler.handleModuleEvent(
                            branchId,
                            moduleId,
                            { action: 'module:delete', table: tableName, record: recordInput, meta: requestMeta, source: 'rest-crud' },
                            null,
                            { source: 'rest-crud' }
                        );
                        checkScheduleInvalidation();
                        jsonResponse(res, 204, null);
                        return;
                    }
                } catch (error) {
                    if (isVersionConflict(error)) {
                        const details = versionConflictDetails(error);
                        jsonResponse(res, 409, {
                            error: 'version-conflict',
                            message: error.message,
                            ...details
                        });
                        return;
                    }
                    logger.warn({ err: error, branchId, moduleId, table: tableName, method: req.method }, 'CRUD operation failed');
                    jsonResponse(res, 500, { error: 'operation-failed', message: error.message });
                    return;
                }

                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }
        }

        jsonResponse(res, 405, { error: 'method-not-allowed' });
    }

    async function handleLanguagesApi(req, res, url) {
        if (req.method !== 'GET') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        const branchId = resolveBranchId(url);
        const moduleId = url.searchParams.get('module') || DEFAULT_MODULE_ID;

        try {
            const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const languages = listAvailableLanguages(store);
            jsonResponse(res, 200, { languages });
        } catch (error) {
            logger.error({ err: error, branchId, moduleId }, 'Failed to load languages');
            jsonResponse(res, 500, { error: 'failed-to-load-languages' });
        }
        return true;
    }

    async function handleBranchesApi(req, res, url, sanitizeModuleSnapshot) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length === 2) {
            if (req.method === 'GET') {
                jsonResponse(res, 200, { branches: listBranchSummaries() });
                return true;
            }
            if (req.method === 'POST') {
                let body = {};
                try {
                    body = (await readBody(req)) || {};
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }
                const branchId = normalizeIdentifier(body.id || body.branchId || body.name);
                if (!branchId) {
                    jsonResponse(res, 400, { error: 'missing-branch-id' });
                    return true;
                }
                const branchConfig = branchConfigManager.getBranchConfig();
                if (branchConfig.branches?.[branchId]) {
                    jsonResponse(res, 409, { error: 'branch-exists', branchId });
                    return true;
                }
                const modules = parseModuleList(body.modules);
                const modulesConfig = branchConfigManager.getModulesConfig();
                for (const moduleId of modules) {
                    if (!modulesConfig.modules?.[moduleId]) {
                        jsonResponse(res, 400, { error: 'module-not-registered', moduleId });
                        return true;
                    }
                }
                const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : branchId;
                branchConfig.branches = branchConfig.branches || {};
                branchConfig.branches[branchId] = { label, modules };
                await branchConfigManager.persistBranchConfig();
                await ensureBranchDirectory(branchId);
                const schemaOverrides = body.schemas && typeof body.schemas === 'object' ? body.schemas : {};
                for (const moduleId of modules) {
                    const override = schemaOverrides[moduleId];
                    await scaffoldBranchModule(branchId, moduleId, {
                        schema: override && typeof override === 'object' ? override : undefined
                    });
                }
                jsonResponse(res, 201, { branchId, label, modules });
                return true;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        const branchId = sequenceManager.safeDecode ? sequenceManager.safeDecode(segments[2]) : segments[2]; // Fallback if safeDecode not available, need to inject it or import

        if (segments.length === 4 && segments[3] === 'modules') {
            if (req.method === 'GET') {
                jsonResponse(res, 200, { branchId, modules: branchConfigManager.getBranchModules(branchId) });
                return true;
            }
            if (req.method === 'POST') {
                let body = {};
                try {
                    body = (await readBody(req)) || {};
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }
                const moduleId = normalizeIdentifier(body.id || body.moduleId || body.name);
                if (!moduleId) {
                    jsonResponse(res, 400, { error: 'missing-module-id' });
                    return true;
                }
                const modulesConfig = branchConfigManager.getModulesConfig();
                if (!modulesConfig.modules?.[moduleId]) {
                    jsonResponse(res, 404, { error: 'module-not-found', moduleId });
                    return true;
                }
                const existing = new Set(branchConfigManager.getBranchModules(branchId));
                existing.add(moduleId);
                const branchConfig = branchConfigManager.getBranchConfig();
                branchConfig.branches = branchConfig.branches || {};
                const branchEntry = branchConfig.branches[branchId] || { label: branchId, modules: [] };
                branchEntry.modules = Array.from(existing);
                branchConfig.branches[branchId] = branchEntry;
                await branchConfigManager.persistBranchConfig();
                await scaffoldBranchModule(branchId, moduleId, {
                    schema: body.schema && typeof body.schema === 'object' ? body.schema : undefined
                });
                jsonResponse(res, 200, { branchId, modules: branchEntry.modules });
                return true;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        if (segments.length === 3) {
            if (req.method === 'GET') {
                const snapshot = buildBranchSnapshot(branchId, sanitizeModuleSnapshot || (x => x));
                jsonResponse(res, 200, snapshot);
                return true;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        if (segments[3] !== 'modules' || segments.length < 5) {
            jsonResponse(res, 404, { error: 'not-found' });
            return true;
        }

        const moduleId = segments[4];
        const modules = branchConfigManager.getBranchModules(branchId);
        if (!modules.includes(moduleId)) {
            jsonResponse(res, 404, { error: 'module-not-found' });
            return true;
        }

        const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);

        // Read lang from query string (e.g., ?lang=en)
        const lang = url.searchParams.get('lang') || null;
        const snapshot = sanitizeModuleSnapshot ? sanitizeModuleSnapshot(store.getSnapshot({ lang })) : store.getSnapshot({ lang });

        if (segments.length === 5) {
            if (req.method === 'GET') {
                jsonResponse(res, 200, snapshot);
                return true;
            }
            if (req.method === 'POST') {
                try {
                    const body = await readBody(req);
                    jsonResponse(res, 200, { received: body, snapshot });
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                }
                return true;
            }
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        // Pass remaining path handling to deep crud or handle here if small
        if (segments.length === 6 && segments[5] === 'sequences') {
            if (req.method === 'POST') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }

                const tableName =
                    (typeof body.table === 'string' && body.table.trim()) ||
                    (typeof body.tableName === 'string' && body.tableName.trim()) ||
                    null;
                const fieldName =
                    (typeof body.field === 'string' && body.field.trim()) ||
                    (typeof body.fieldName === 'string' && body.fieldName.trim()) ||
                    null;

                if (!tableName || !fieldName) {
                    jsonResponse(res, 400, { error: 'missing-table-or-field' });
                    return true;
                }

                const wantsPreview = url.searchParams.get('preview') === '1' || body.preview === true;
                try {
                    const allocation = wantsPreview
                        ? await sequenceManager.previewNextValue(branchId, moduleId, tableName, fieldName, {
                            record: body.record || null
                        })
                        : await sequenceManager.nextValue(branchId, moduleId, tableName, fieldName, {
                            record: body.record || null,
                            autoCreate: true
                        });

                    if (!allocation) {
                        jsonResponse(res, 404, { error: 'sequence-not-configured', table: tableName, field: fieldName });
                        return true;
                    }

                    jsonResponse(res, 200, {
                        branchId,
                        moduleId,
                        table: tableName,
                        field: fieldName,
                        value: allocation.value,
                        id: allocation.formatted,
                        rule: allocation.rule || null,
                        preview: wantsPreview === true
                    });
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId, table: tableName, field: fieldName }, 'Failed to allocate sequence');
                    jsonResponse(res, 500, { error: 'sequence-allocation-failed', message: error.message });
                }
                return true;
            }

            if (req.method === 'GET') {
                // Check if next or current
                // Url: .../sequences?key=order_number&op=next
                const key = url.searchParams.get('key');
                if (!key) {
                    jsonResponse(res, 400, { error: 'missing-sequence-key' });
                    return true;
                }
                const op = url.searchParams.get('op') || 'current';
                try {
                    let val;
                    if (op === 'next') {
                        val = await sequenceManager.next(branchId, moduleId, key);
                    } else if (op === 'reset') {
                        val = await sequenceManager.reset(branchId, moduleId, key);
                    } else {
                        val = await sequenceManager.current(branchId, moduleId, key);
                    }
                    jsonResponse(res, 200, { key, value: val });
                } catch (err) {
                    jsonResponse(res, 500, { error: 'sequence-error', message: err.message });
                }
                return true;
            }

            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        // Handle reset endpoint
        if (segments.length === 6 && segments[5] === 'reset') {
            if (req.method !== 'POST' && req.method !== 'GET') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }

            try {
                let externalSeedSync = null;
                if (moduleId === 'pos') {
                    try {
                        externalSeedSync = await syncExternalSeedTables(branchId, moduleId);
                    } catch (error) {
                        const status = error.code === 'branch-config-not-found' ? 404
                            : error.code === 'source-fetch-failed' ? 502
                                : error.code === 'source-data-invalid' ? 502
                                    : 500;
                        jsonResponse(res, status, {
                            error: error.code || 'external-seed-sync-failed',
                            message: error.message,
                            status: error.status || null,
                            report: {
                                success: false,
                                status: error.code || 'external-seed-sync-failed',
                                sourceUrl: error.sourceUrl || null
                            }
                        });
                        return true;
                    }
                }

                // Parse mode parameter
                let mode = (url.searchParams.get('mode') || 'migrate').toLowerCase();

                if (req.method === 'POST') {
                    try {
                        // Attempt to read body for mode parameter
                        // Note: readBody consumes the stream, so we must be the final handler
                        const body = await readBody(req);
                        if (body && body.mode) {
                            mode = String(body.mode).toLowerCase();
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                console.log(`[RESET] Triggered for ${branchId}/${moduleId} (mode: ${mode})`);

                if (mode === 'truncate') {
                    // DESTRUCTIVE: Full reset
                    console.log('⚠️  TRUNCATE mode: Dropping all data...');
                    for (const table of DEFAULT_TABLES) {
                        truncateTable(table, { branchId, moduleId });
                    }

                    const purgeResult = await purgeManager.resetModule(branchId, moduleId, { reason: 'branch-api-reset' });
                    const store = purgeResult?.store || null;
                    console.log(`[RESET] Purge complete for ${branchId}/${moduleId}`);

                    // Reset sequence counter (only for truncate)
                    const branchKey = encodeURIComponent(branchId);
                    const stateFilePath = path.join(BRANCHES_DIR, branchKey, 'sequence-state.json');
                    const sequenceKey = `${moduleId}:order_header:id`;

                    const currentState = {};
                    currentState[sequenceKey] = {
                        last: 0,
                        updatedAt: new Date().toISOString()
                    };

                    console.log(`[RESET] Writing sequence state to ${stateFilePath}`);
                    await mkdir(path.dirname(stateFilePath), { recursive: true });
                    await writeFile(stateFilePath, JSON.stringify(currentState, null, 2), 'utf8');

                    if (sequenceManager && sequenceManager.branchStateCache) {
                        console.log(`[RESET] Clearing sequence cache`);
                        sequenceManager.branchStateCache.delete(branchId);
                        sequenceManager.branchStateCache.delete('default');
                    }

                    console.log(`[RESET] taking snapshot`);
                    const refreshedSnapshot = sanitizeModuleSnapshot
                        ? sanitizeModuleSnapshot(store.getSnapshot({ lang }))
                        : store.getSnapshot({ lang });

                    const branchSnapshot = buildBranchSnapshot(branchId, sanitizeModuleSnapshot || (x => x));
                    const diagnostics = buildResetDiagnostics({
                        url,
                        req,
                        branchId,
                        moduleId,
                        store,
                        purgeResult
                    });
                    if (externalSeedSync) {
                        diagnostics.externalSeedSync = externalSeedSync;
                    }

                    console.log(`[RESET] sending response`);
                    jsonResponse(res, 200, {
                        success: true,
                        message: 'Module reset to initial data and sequence counter reset',
                        diagnostics,
                        snapshot: refreshedSnapshot,
                        ...branchSnapshot
                    });
                } else {
                    // SMART MIGRATION
                    console.log('✨ MIGRATE mode: Smart schema migration (preserving data)...');

                    const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
                    const db = getDatabase({ branchId, moduleId });

                    // Load schema definition
                    const schemaPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'schema', 'definition.json');
                    let schemaDefinition = null;

                    if (await fileExists(schemaPath)) {
                        schemaDefinition = await readJsonSafe(schemaPath);
                    } else {
                        // Fallback to default schema path
                        const config = branchConfigManager.getModulesConfig();
                        const fallbackPath = config.modules?.[moduleId]?.schemaFallbackPath;
                        if (fallbackPath) {
                            const resolved = pathResolvers.resolveWorkspacePath(fallbackPath);
                            if (resolved && await fileExists(resolved.absolutePath)) {
                                schemaDefinition = await readJsonSafe(resolved.absolutePath);
                            }
                        }
                    }

                    let migrationStats = null;
                    let migrations = [];

                    if (schemaDefinition && schemaDefinition.tables && db) {
                        // Validate & Migrate
                        const validationResults = validateSchema(db, schemaDefinition, branchId, moduleId);
                        migrations = migrateSchema(db, schemaDefinition, validationResults, branchId, moduleId);

                        // Seed ONLY new tables
                        const seedPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'seeds', 'initial.json');
                        let seededTables = 0;

                        if (await fileExists(seedPath)) {
                            const seedData = await readJsonSafe(seedPath);
                            if (seedData && seedData.tables) {
                                const newTables = migrations
                                    .filter(m => m.action === 'CREATE_TABLE' && m.success)
                                    .map(m => m.tableName);

                                for (const tableName of newTables) {
                                    if (seedData.tables[tableName]) {
                                        const records = seedData.tables[tableName];
                                        if (Array.isArray(records)) {
                                            records.forEach(record => {
                                                store.insert(tableName, record, { silent: true });
                                            });
                                            seededTables++;
                                        }
                                    }
                                }
                                await moduleStoreManager.persistModuleStore(store);
                            }
                        }

                        migrationStats = {
                            mode: 'migrate',
                            migrations: migrations.length,
                            tablesCreated: migrations.filter(m => m.action === 'CREATE_TABLE' && m.success).length,
                            columnsAdded: migrations.filter(m => m.action === 'ADD_COLUMN' && m.success).length,
                            warnings: migrations.filter(m => m.warning).length,
                            seededTables
                        };
                    }

                    const refreshedSnapshot = sanitizeModuleSnapshot
                        ? sanitizeModuleSnapshot(store.getSnapshot({ lang }))
                        : store.getSnapshot({ lang });

                    jsonResponse(res, 200, {
                        success: true,
                        message: 'Smart migration complete',
                        stats: migrationStats,
                        snapshot: refreshedSnapshot
                    });
                }
            } catch (error) {
                console.error('[RESET] FATAL ERROR:', error);
                logger.error({ err: error, branchId, moduleId }, 'Failed to reset module');
                jsonResponse(res, 500, { error: 'reset-failed', message: error.message, stack: error.stack });
            }
            return true;
        }

        // Handle orders endpoint
        if (segments.length === 6 && segments[5] === 'orders') {
            // const branchId = segments[2]; // Already available in scope
            // const moduleId = segments[4]; // Already available in scope

            if (req.method === 'POST') {
                let body = {};
                try {
                    body = await readBody(req);
                } catch (error) {
                    jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                    return true;
                }

                // ==========================================
                // VALIDATION: Shift and ERP User Data
                // ==========================================

                // Extract order from body (could be wrapped or direct)
                const orderPayload = body.order || body;
                const metadata = orderPayload.metadata || {};

                // 1. Validate shift data
                const shiftData = metadata.shiftData;
                if (!shiftData || !shiftData.id || !shiftData.openedAt) {
                    logger.warn({ orderId: orderPayload.id, metadata }, 'Order missing shift data');
                    jsonResponse(res, 400, {
                        error: 'order-missing-shift-data',
                        message: 'Order must include valid shift data (shiftData.id and shiftData.openedAt required)',
                        received: { hasShiftData: !!shiftData, shiftId: shiftData?.id, openedAt: shiftData?.openedAt }
                    });
                    return true;
                }

                // 2. Validate ERP user data
                const erpUser = metadata.erpUser;
                if (!erpUser || !erpUser.userID) {
                    logger.warn({ orderId: orderPayload.id, metadata }, 'Order missing ERP user data');
                    jsonResponse(res, 400, {
                        error: 'order-missing-erp-user',
                        message: 'Order must include ERP user data (erpUser.userID required for custody tracking)',
                        received: { hasErpUser: !!erpUser, userID: erpUser?.userID }
                    });
                    return true;
                }

                // 3. Check if shift exists in pos_shift table, auto-create if not
                try {
                    const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
                    const existingShifts = store.listTable('pos_shift') || [];
                    const shiftExists = existingShifts.find(s =>
                        s.id === shiftData.id ||
                        s.shift_id === shiftData.id
                    );

                    if (!shiftExists) {
                        logger.warn({ shiftId: shiftData.id, erpUser: erpUser.userID }, 'Shift not found in pos_shift table, auto-creating from order metadata');

                        // Create minimal shift record with ERP user metadata
                        const newShift = {
                            id: shiftData.id,
                            shift_id: shiftData.id,
                            pos_id: orderPayload.posId || 'unknown',
                            pos_label: orderPayload.posLabel || 'Unknown Terminal',
                            pos_number: orderPayload.posNumber || 0,
                            employee_id: erpUser.userID,
                            cashier_id: erpUser.userID,
                            cashier_name: erpUser.userName || 'Unknown',
                            cashier_role: 'cashier',
                            opened_at: shiftData.openedAt,
                            status: 'open',
                            is_closed: false,
                            opening_float: 0,
                            total_sales: 0,
                            orders_count: 0,
                            counts_by_type: {},
                            payments_by_method: {},
                            totals_by_type: {},
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            metadata: erpUser // Full ERP user object for custody tracking
                        };

                        try {
                            store.insert('pos_shift', newShift);
                            await moduleStoreManager.persistModuleStore(store);
                            logger.info({
                                shiftId: shiftData.id,
                                employeeId: erpUser.userID,
                                userName: erpUser.userName,
                                brname: erpUser.brname
                            }, 'Shift auto-created successfully with ERP user metadata');
                        } catch (err) {
                            logger.error({ err, shiftId: shiftData.id }, 'Failed to auto-create shift record');
                            jsonResponse(res, 500, {
                                error: 'shift-autocreate-failed',
                                message: 'Failed to create shift record in database',
                                details: err.message
                            });
                            return true;
                        }
                    } else {
                        logger.info({ shiftId: shiftData.id }, 'Shift already exists in pos_shift table');
                    }
                } catch (err) {
                    logger.error({ err, branchId, moduleId }, 'Failed to check/create shift');
                    jsonResponse(res, 500, {
                        error: 'shift-validation-failed',
                        message: 'Failed to validate shift existence',
                        details: err.message
                    });
                    return true;
                }

                // ==========================================
                // PROCEED WITH ORDER CREATION
                // ==========================================
                try {
                    // Frame data structure expected by POS handler
                    const frameData = {
                        order: body.order || body,
                        meta: { source: 'api' }
                    };
                    const result = await posOrderHandler.handlePosOrderCreate(branchId, moduleId, frameData, { clientId: 'api' });
                    jsonResponse(res, 201, result);
                } catch (error) {
                    logger.warn({ err: error, branchId, moduleId }, 'Failed to create order via API');
                    jsonResponse(res, 500, { error: 'order-create-failed', message: error.message });
                }
                return true;
            }

            // GET not fully implemented for /orders list in this refactor pass unless backed by store queries
            // POS usually relies on sync for list. But allowing GET for single order if ID provided
        }

        if (segments.length === 7 && segments[5] === 'orders') {
            // /api/branches/.../modules/.../orders/:orderId
            const orderId = segments[6];
            // Implement GET single order if needed
            // For now return 501 or implemented if store supports get
            const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const refs = store.listTable('order_header');
            const order = refs.find(o => o.id === orderId || o.key === orderId);
            if (order) {
                jsonResponse(res, 200, order);
            } else {
                jsonResponse(res, 404, { error: 'order-not-found' });
            }
            return true;
        }

        // Handle Table Availability checking
        // /api/branches/:branchId/modules/:moduleId/tables/availability
        if (segments.length >= 7 && segments[5] === 'tables' && segments[6] === 'availability') {
            return await handleTableAvailability(req, res, url, branchId, moduleId);
        }

        // Handle Schedule endpoints
        // /api/branches/:branchId/modules/:moduleId/schedule
        if (segments.length >= 6 && segments[5] === 'schedule') {
            return await handleScheduleApi(req, res, url, branchId, moduleId, segments);
        }

        // Handle Shift Close endpoints
        // /api/branches/:branchId/modules/:moduleId/shift/:shiftId/close
        if (segments.length >= 8 && segments[5] === 'shift' && segments[7] === 'close') {
            return await handleShiftCloseApi(req, res, url, branchId, moduleId, segments);
        }

        // For now returning 404 as most logic is covered above or in handleDeepCrudApi
        jsonResponse(res, 404, { error: 'endpoint-not-found-in-branches-api' });
        return true;
    }

    /**
     * Handle /api/branches/:branchId/modules/:moduleId/tables/availability
     * Check table availability for a given time range
     */
    async function handleTableAvailability(req, res, url, branchId, moduleId) {
        try {
            // Get module info
            const modulesConfig = branchConfigManager.getModulesConfig();
            const moduleInfo = modulesConfig.modules?.[moduleId];

            if (!moduleInfo) {
                jsonResponse(res, 404, {
                    success: false,
                    error: 'module-not-found',
                    moduleId
                });
                return true;
            }

            // Get db instance
            const db = await getOrCreateModuleDb(branchId, moduleId);
            if (!db || !db.query) {
                jsonResponse(res, 500, {
                    success: false,
                    error: 'Database connection not available'
                });
                return true;
            }

            // GET /tables/availability?from=...&to=...&tableIds=...
            if (req.method === 'GET') {
                const from = url.searchParams.get('from');
                const to = url.searchParams.get('to');
                const tableIdsParam = url.searchParams.get('tableIds');

                if (!from || !to) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Both from and to parameters are required'
                    });
                    return true;
                }

                const fromDate = new Date(from);
                const toDate = new Date(to);

                if (fromDate >= toDate) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'from must be before to'
                    });
                    return true;
                }

                // Parse table IDs
                const requestedTableIds = tableIdsParam
                    ? tableIdsParam.split(',').map(t => t.trim())
                    : [];

                // Find overlapping schedules
                const query = `
                    SELECT 
                        os.id,
                        os.scheduled_at,
                        os.ends_at,
                        ost.table_id
                    FROM order_schedule os
                    INNER JOIN order_schedule_tables ost ON os.id = ost.schedule_id
                    WHERE os.status = 'pending'
                    AND os.branch_id = ? AND os.module_id = ?
                    AND (
                        (os.scheduled_at <= ? AND os.ends_at >= ?)
                        OR (os.scheduled_at >= ? AND os.scheduled_at < ?)
                        OR (os.ends_at > ? AND os.ends_at <= ?)
                    )
                `;

                const overlappingSchedules = await db.query(query, [
                    branchId, moduleId,
                    toDate.toISOString(),
                    fromDate.toISOString(),
                    fromDate.toISOString(),
                    toDate.toISOString(),
                    fromDate.toISOString(),
                    toDate.toISOString()
                ]);

                // Group by table
                const unavailableTables = new Map();
                for (const schedule of overlappingSchedules) {
                    if (!unavailableTables.has(schedule.table_id)) {
                        unavailableTables.set(schedule.table_id, []);
                    }
                    unavailableTables.get(schedule.table_id).push({
                        scheduleId: schedule.id,
                        from: schedule.scheduled_at,
                        to: schedule.ends_at
                    });
                }

                // Check requested tables
                const tableAvailability = requestedTableIds.map(tableId => ({
                    tableId,
                    available: !unavailableTables.has(tableId),
                    conflicts: unavailableTables.get(tableId) || []
                }));

                jsonResponse(res, 200, {
                    success: true,
                    from: fromDate.toISOString(),
                    to: toDate.toISOString(),
                    tables: tableAvailability,
                    allAvailable: tableAvailability.every(t => t.available)
                });
                return true;
            }

            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;

        } catch (error) {
            logger.error({ err: error, branchId, moduleId }, 'Table availability check error');
            jsonResponse(res, 500, {
                success: false,
                error: 'Failed to check table availability',
                details: error.message
            });
            return true;
        }
    }

    /**
     * Handle /api/branches/:branchId/modules/:moduleId/schedule
     * Scheduled orders management
     */
    async function handleScheduleApi(req, res, url, branchId, moduleId, segments) {
        try {
            // Get module info
            const modulesConfig = branchConfigManager.getModulesConfig();
            const moduleInfo = modulesConfig.modules?.[moduleId];

            if (!moduleInfo) {
                jsonResponse(res, 404, {
                    success: false,
                    error: 'module-not-found',
                    moduleId
                });
                return true;
            }

            // Get db instance
            const db = await getOrCreateModuleDb(branchId, moduleId);
            if (!db || !db.query) {
                jsonResponse(res, 500, {
                    success: false,
                    error: 'Database connection not available'
                });
                return true;
            }

            // POST /api/branches/:branchId/modules/:moduleId/schedule - Create
            if (req.method === 'POST' && segments.length === 6) {
                const body = await readBody(req);
                const {
                    customerId,
                    orderType = 'dine_in',
                    scheduledAt,
                    duration = 60,
                    tableIds = [],
                    lines = [],
                    totals = {},
                    discount = null,
                    payments = [],
                    addressId = null,
                    notes = ''
                } = body;

                // Validation
                if (!customerId) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Customer ID is required for scheduled orders'
                    });
                    return true;
                }

                if (!scheduledAt) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Scheduled time is required'
                    });
                    return true;
                }

                // Validate and parse scheduled date
                const scheduledDate = new Date(scheduledAt);
                if (scheduledDate <= new Date()) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Scheduled time must be in the future'
                    });
                    return true;
                }

                // Optional: warn if dine-in without tables (but don't block)
                if (orderType === 'dine_in' && tableIds.length === 0) {
                    logger.warn({ customerId, orderType }, 'Dine-in reservation created without table assignment');
                }

                if (lines.length === 0) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Order must contain at least one item'
                    });
                    return true;
                }

                // Generate schedule ID using sequence manager
                let scheduleId;
                let sequenceNumber;
                try {
                    const allocation = await sequenceManager.nextValue(branchId, moduleId, 'order_schedule', 'id', {
                        autoCreate: true
                    });
                    scheduleId = allocation.formatted; // e.g., "DAR-SCH-1001"
                    sequenceNumber = allocation.value; // e.g., 1001
                } catch (err) {
                    logger.warn({ err, branchId, moduleId }, 'Failed to allocate schedule sequence, using fallback');
                    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
                    scheduleId = `SCH-${branchId.toUpperCase()}-${random}`;
                    sequenceNumber = null;
                }

                // Calculate end time
                const endsAt = new Date(scheduledDate.getTime() + (duration * 60 * 1000));

                // Prepare payload
                const payload = {
                    lines,
                    totals,
                    discount
                };

                // Create schedule record
                const scheduleRecord = {
                    id: scheduleId,
                    customer_id: customerId,
                    order_type: orderType,
                    scheduled_at: scheduledDate.toISOString(),
                    duration_minutes: duration,
                    ends_at: endsAt.toISOString(),
                    status: 'pending',
                    customer_address_id: addressId || null,
                    payload: JSON.stringify({ lines, totals, discount }),
                    notes: notes || '',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                const diagnosticLogs = [];

                try {
                    // Use persistRecord - same mechanism as orders
                    diagnosticLogs.push({ step: 'insert_schedule', table: 'order_schedule', id: scheduleId, status: 'attempting' });

                    persistRecord('order_schedule', scheduleRecord, { branchId, moduleId });

                    diagnosticLogs.push({ step: 'insert_schedule', table: 'order_schedule', id: scheduleId, status: 'success' });
                } catch (err) {
                    diagnosticLogs.push({ step: 'insert_schedule', table: 'order_schedule', id: scheduleId, status: 'failed', error: err.message });
                    throw err;
                }

                // Insert lines using persistRecord - same as orders
                for (const line of lines) {
                    const lineId = `${scheduleId}-LINE-${Math.random().toString(36).substr(2, 9)}`;
                    try {
                        diagnosticLogs.push({ step: 'insert_line', table: 'order_schedule_line', id: lineId, itemId: line.itemId, status: 'attempting' });

                        persistRecord('order_schedule_line', {
                            branch_id: branchId,
                            module_id: moduleId,
                            id: lineId,
                            schedule_id: scheduleId,
                            item_id: line.itemId || line.id,
                            item_name: JSON.stringify(line.name),
                            quantity: line.qty != null ? line.qty : (line.quantity || 1),
                            unit_price: line.unitPrice || line.price,
                            line_total: (line.qty || line.quantity) * (line.unitPrice || line.price),
                            notes: line.notes || null,
                            created_at: new Date().toISOString()
                        }, { branchId, moduleId });

                        diagnosticLogs.push({ step: 'insert_line', table: 'order_schedule_line', id: lineId, status: 'success' });
                    } catch (err) {
                        diagnosticLogs.push({ step: 'insert_line', table: 'order_schedule_line', id: lineId, status: 'failed', error: err.message });
                    }
                } // Close the loop

                // Save table associations using persistRecord
                if (tableIds.length > 0) {
                    for (const tableId of tableIds) {
                        const linkId = `${scheduleId}-TBL-${tableId}`;
                        try {
                            diagnosticLogs.push({ step: 'insert_table_link', table: 'order_schedule_tables', id: linkId, tableId, status: 'attempting' });

                            persistRecord('order_schedule_tables', {
                                id: linkId,
                                schedule_id: scheduleId,
                                table_id: tableId
                            }, { branchId, moduleId });

                            diagnosticLogs.push({ step: 'insert_table_link', table: 'order_schedule_tables', id: linkId, status: 'success' });
                        } catch (err) {
                            diagnosticLogs.push({ step: 'insert_table_link', table: 'order_schedule_tables', id: linkId, status: 'failed', error: err.message });
                        }
                    }
                }

                // Save payments using persistRecord
                if (payments.length > 0) {
                    for (const payment of payments) {
                        const payId = `${scheduleId}-PAY-${Math.random().toString(36).substr(2, 9)}`;
                        try {
                            diagnosticLogs.push({ step: 'insert_payment', table: 'order_schedule_payment', id: payId, amount: payment.amount, status: 'attempting' });

                            persistRecord('order_schedule_payment', {
                                id: payId,
                                schedule_id: scheduleId,
                                method_id: payment.methodId,
                                amount: payment.amount,
                                created_at: new Date().toISOString()
                            }, { branchId, moduleId });

                            diagnosticLogs.push({ step: 'insert_payment', table: 'order_schedule_payment', id: payId, status: 'success' });
                        } catch (err) {
                            diagnosticLogs.push({ step: 'insert_payment', table: 'order_schedule_payment', id: payId, status: 'failed', error: err.message });
                        }
                    }
                }

                invalidateScheduleCache(branchId, moduleId);

                jsonResponse(res, 200, {
                    success: true,
                    scheduleId,
                    message: 'Scheduled order created successfully',
                    diagnostics: diagnosticLogs,
                    recordsCreated: {
                        schedule: 1,
                        lines: lines.length,
                        tables: tableIds.length,
                        payments: payments.length
                    }
                });
                return true;
            }

            // GET /api/branches/:branchId/modules/:moduleId/schedule - List
            if (req.method === 'GET' && segments.length === 6) {
                const status = url.searchParams.get('status');
                const from = url.searchParams.get('from');
                const to = url.searchParams.get('to');

                // OPTIMIZATION: ETag support
                const currentScheduleVersion = getCachedScheduleVersion(branchId, moduleId);
                // Create ETag based on version AND filters (filters affect the response body)
                // We must include filters in the ETag because the same version can yield different results for different filters.
                const filterKey = `${status || 'all'}-${from || 'any'}-${to || 'any'}`;
                const etag = `W/"${currentScheduleVersion}-${btoa(filterKey)}"`;

                if (req.headers['if-none-match'] === etag) {
                    res.writeHead(304, { 'ETag': etag });
                    res.end();
                    return true;
                }

                let query = 'SELECT * FROM order_schedule WHERE branch_id = ? AND module_id = ?';
                const params = [branchId, moduleId];

                if (status) {
                    query += ' AND status = ?';
                    params.push(status);
                }

                if (from) {
                    query += ' AND scheduled_at >= ?';
                    params.push(new Date(from).toISOString());
                }

                if (to) {
                    query += ' AND scheduled_at <= ?';
                    params.push(new Date(to).toISOString());
                }

                query += ' ORDER BY scheduled_at ASC';

                logger.info({ branchId, moduleId, query, params }, 'Fetching schedules from database');
                const schedules = await db.query(query, params);
                logger.info({ scheduleCount: schedules.length, scheduleIds: schedules.map(s => s.id) }, 'Schedules query result');

                // Enrich with related data
                const enrichedSchedules = await Promise.all(
                    schedules.map(async (schedule) => {
                        const tables = await db.query(
                            'SELECT table_id FROM order_schedule_tables WHERE schedule_id = ?',
                            [schedule.id]
                        );

                        const payments = await db.query(
                            'SELECT method_id, amount, created_at FROM order_schedule_payment WHERE schedule_id = ?',
                            [schedule.id]
                        );

                        const lines = await db.query(
                            'SELECT * FROM order_line WHERE orderId = ? ORDER BY createdAt',
                            [schedule.id]
                        );

                        const customer = await db.get(
                            'SELECT customer_name, phone FROM customer_profiles WHERE customer_id = ?',
                            [schedule.customer_id]
                        );

                        const payload = schedule.payload ? JSON.parse(schedule.payload) : {};

                        return {
                            ...schedule,
                            tableIds: tables.map(t => t.table_id),
                            payments,
                            lines, // Add lines from dedicated table
                            customerName: customer?.customer_name,
                            customerPhone: customer?.phone,
                            payload: { ...payload, lines } // Include in payload for backward compatibility
                        };
                    })
                );

                logger.info({ enrichedCount: enrichedSchedules.length, branchId, moduleId }, 'Returning enriched schedules');

                res.setHeader('ETag', etag);
                jsonResponse(res, 200, {
                    success: true,
                    schedules: enrichedSchedules
                });
                return true;
            }

            // POST /api/branches/:branchId/modules/:moduleId/schedule/:id/confirm - Confirm
            if (req.method === 'POST' && segments.length === 8 && segments[7] === 'confirm') {
                const scheduleId = segments[6];
                let body = {};
                try {
                    body = await readBody(req);
                } catch (_err) {
                    body = {};
                }

                const schedule = await db.get('SELECT * FROM order_schedule WHERE id = ? AND branch_id = ? AND module_id = ?', [scheduleId, branchId, moduleId]);

                if (!schedule) {
                    jsonResponse(res, 404, {
                        success: false,
                        error: 'Schedule not found'
                    });
                    return true;
                }

                if (schedule.status === 'converted') {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Schedule already confirmed'
                    });
                    return true;
                }

                // Parse payload for totals/discount
                const payload = JSON.parse(schedule.payload || '{}');
                const { totals = {}, discount = null } = payload;

                // Status-only confirmation (order already created via /orders)
                if (body && body.orderId) {
                    const now = new Date().toISOString();
                    await db.update('order_schedule', scheduleId, {
                        status: 'converted',
                        updated_at: now,
                        payload: JSON.stringify({
                            ...payload,
                            convertedOrderId: body.orderId,
                            convertedAt: now
                        })
                    });
                    jsonResponse(res, 200, {
                        success: true,
                        orderId: body.orderId,
                        scheduledAt: schedule.scheduled_at,
                        message: 'Schedule marked converted'
                    });
                    return true;
                }

                // Fetch lines from order_schedule_line
                const lines = await db.query(
                    'SELECT * FROM order_schedule_line WHERE schedule_id = ? ORDER BY created_at',
                    [scheduleId]
                );

                // Fetch related data
                const tables = await db.query(
                    'SELECT table_id FROM order_schedule_tables WHERE schedule_id = ?',
                    [scheduleId]
                );
                const tableIds = tables.map(t => t.table_id);

                const payments = await db.query(
                    'SELECT * FROM order_schedule_payment WHERE schedule_id = ?',
                    [scheduleId]
                );

                // Fetch active shift (required for POS order save)
                const activeShift = await db.get(
                    'SELECT id FROM pos_shift WHERE branch_id = ? AND module_id = ? AND status = "open" ORDER BY created_at DESC LIMIT 1',
                    [branchId, moduleId]
                );
                let shiftId = activeShift ? activeShift.id : null;
                if (!shiftId) {
                    const lastShift = await db.get(
                        'SELECT id FROM pos_shift WHERE branch_id = ? AND module_id = ? ORDER BY created_at DESC LIMIT 1',
                        [branchId, moduleId]
                    );
                    shiftId = lastShift ? lastShift.id : null;
                }
                if (!shiftId) {
                    jsonResponse(res, 400, { success: false, error: 'No active shift found for schedule confirmation' });
                    return true;
                }

                const now = new Date().toISOString();
                const paidAmount = payments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
                const dueAmount = Number(totals.due || 0);
                const paymentState = paidAmount >= dueAmount && dueAmount > 0
                    ? 'paid'
                    : paidAmount > 0
                        ? 'partial'
                        : 'unpaid';

                const scheduleLines = lines.length ? lines : (Array.isArray(payload.lines) ? payload.lines : []);
                const resolvedLines = scheduleLines.map((line) => {
                    const quantity = Number(line.qty != null ? line.qty : (line.quantity || 0));
                    const unitPrice = Number(line.unit_price ?? line.unitPrice ?? line.price ?? 0);
                    const lineTotal = Number(line.line_total ?? line.lineTotal ?? (quantity * unitPrice));
                    return {
                        id: line.id,
                        itemId: line.item_id || line.itemId,
                        item_id: line.item_id || line.itemId,
                        name: line.item_name || line.itemName || line.name || null,
                        qty: quantity,
                        quantity: quantity,
                        unitPrice: unitPrice,
                        unit_price: unitPrice,
                        total: lineTotal,
                        notes: line.notes || '',
                        kitchenSection: line.kitchen_section_id || line.kitchenSectionId || line.station_id || null,
                        kitchen_section_id: line.kitchen_section_id || line.kitchenSectionId || line.station_id || null,
                        status: 'draft',
                        stage: 'new'
                    };
                });

                if (!resolvedLines.length) {
                    jsonResponse(res, 400, { success: false, error: 'Schedule has no lines to convert' });
                    return true;
                }

                const orderPayload = {
                    id: `draft-${Date.now()}`,
                    shiftId,
                    type: schedule.order_type || 'dine_in',
                    status: 'open',
                    fulfillmentStage: 'new',
                    paymentState,
                    tableIds,
                    notes: schedule.notes ? [schedule.notes] : [],
                    totals,
                    discount,
                    payments: payments.map(entry => ({
                        method: entry.method_id,
                        amount: Number(entry.amount || 0)
                    })),
                    customerId: schedule.customer_id,
                    customerAddressId: schedule.customer_address_id || null,
                    scheduledAt: schedule.scheduled_at,
                    scheduledDuration: schedule.duration_minutes,
                    metadata: {
                        sourceScheduleId: scheduleId,
                        isSchedule: true,
                        scheduledAt: schedule.scheduled_at,
                        duration: schedule.duration_minutes
                    },
                    lines: resolvedLines
                };

                const frameData = { order: orderPayload, meta: { source: 'schedule:confirm' } };
                const saveResult = await posOrderHandler.handlePosOrderCreate(branchId, moduleId, frameData, { clientId: 'schedule-confirm' });
                const orderId = saveResult?.frameData?.order?.id;
                if (!orderId) {
                    jsonResponse(res, 500, { success: false, error: 'Order creation failed during schedule confirm' });
                    return true;
                }

                // ✅ CRITICAL: Create job_order for KDS
                const jobOrderId = `JOB-${orderId}`;
                const scheduledTime = new Date(schedule.scheduled_at).toLocaleTimeString('ar-SA', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const jobOrderHeader = {
                    job_order_id: jobOrderId,
                    order_id: orderId,
                    order_type: schedule.order_type,
                    status: 'pending',
                    stage: 'new',
                    priority: 1,
                    created_at: now,
                    updated_at: now,
                    // CRITICAL: Add scheduled info for KDS display
                    scheduled_at: schedule.scheduled_at,
                    scheduled_duration: schedule.duration_minutes,
                    notes: `[حجز] مطلوب تجهيزه للساعة ${scheduledTime}`
                };

                await db.insert('job_order_header', jobOrderHeader);

                // Create job_order_detail entries for each line
                const ackLines = saveResult?.frameData?.order?.lines || [];
                for (let i = 0; i < ackLines.length; i++) {
                    const line = ackLines[i];
                    const jobDetailId = `${jobOrderId}-DETAIL-${i + 1}`;

                    await db.insert('job_order_detail', {
                        id: jobDetailId,
                        job_order_id: jobOrderId,
                        order_line_id: line.id,
                        item_id: line.item_id || line.itemId,
                        item_name: line.name || line.item_name || line.itemId,
                        quantity: line.qty != null ? line.qty : (line.quantity || 1),
                        status: 'pending',
                        station_id: line.kitchen_section_id || line.kitchenSection || 'default',
                        created_at: now
                    });
                }

                // Update schedule status
                await db.update('order_schedule', scheduleId, {
                    status: 'converted',
                    updated_at: now,
                    payload: JSON.stringify({
                        ...payload,
                        convertedOrderId: orderId,
                        convertedAt: now,
                        jobOrderId: jobOrderId
                    })
                });

                logger.info({
                    scheduleId,
                    orderId,
                    jobOrderId,
                    scheduledAt: schedule.scheduled_at
                }, 'Schedule confirmed and job_order created');

                invalidateScheduleCache(branchId, moduleId);

                jsonResponse(res, 200, {
                    success: true,
                    orderId,
                    jobOrderId,
                    scheduledAt: schedule.scheduled_at,
                    message: 'Schedule confirmed and converted to order with job_order for KDS'
                });
                return true;
            }

            // PUT /api/branches/:branchId/modules/:moduleId/schedule/:id - Update pending schedule
            if (req.method === 'PUT' && segments.length === 7) {
                const scheduleId = segments[6];

                // Fetch existing schedule
                const existingSchedule = await db.get('SELECT * FROM order_schedule WHERE id = ? AND branch_id = ? AND module_id = ?', [scheduleId, branchId, moduleId]);

                if (!existingSchedule) {
                    jsonResponse(res, 404, {
                        success: false,
                        error: 'Schedule not found'
                    });
                    return true;
                }

                // Only allow editing if status is 'pending'
                if (existingSchedule.status !== 'pending') {
                    jsonResponse(res, 400, {
                        success: false,
                        error: `Cannot edit schedule with status: ${existingSchedule.status}. Only pending schedules can be edited.`
                    });
                    return true;
                }

                // Parse request body
                const body = await readBody(req);
                const {
                    customerId,
                    orderType,
                    scheduledAt,
                    duration,
                    tableIds = [],
                    lines = [],
                    totals = {},
                    discount = null,
                    payments = [],
                    addressId = null,
                    notes = ''
                } = body;

                // Validation
                if (!customerId) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Customer is required'
                    });
                    return true;
                }

                if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Scheduled time must be in the future'
                    });
                    return true;
                }

                if (orderType === 'dine_in' && (!tableIds || tableIds.length === 0)) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'At least one table is required for dine-in orders'
                    });
                    return true;
                }

                if (!lines || lines.length === 0) {
                    jsonResponse(res, 400, {
                        success: false,
                        error: 'Order must contain at least one item'
                    });
                    return true;
                }

                // Calculate end time
                const scheduledDate = new Date(scheduledAt);
                const endsAt = new Date(scheduledDate.getTime() + (duration || 60) * 60000).toISOString();

                // Update order_schedule
                const now = new Date().toISOString();
                await db.update('order_schedule', scheduleId, {
                    customer_id: customerId,
                    order_type: orderType || 'dine_in',
                    scheduled_at: scheduledAt,
                    ends_at: endsAt,
                    duration_minutes: duration || 60,
                    customer_address_id: addressId || null,
                    notes: notes,
                    updated_at: now,
                    payload: JSON.stringify({ totals, discount }) // Only totals/discount
                });

                // Update lines - delete old, insert new
                await db.query('DELETE FROM order_schedule_line WHERE schedule_id = ?', [scheduleId]);
                for (const line of lines) {
                    await db.insert('order_schedule_line', {
                        id: `${scheduleId}-LINE-${Math.random().toString(36).substr(2, 9)}`,
                        schedule_id: scheduleId,
                        item_id: line.itemId || line.id,
                        item_name: line.name,
                        quantity: line.qty != null ? line.qty : (line.quantity || 1),
                        unit_price: line.unitPrice || line.price,
                        line_total: (line.qty || line.quantity) * (line.unitPrice || line.price),
                        notes: line.notes || null,
                        created_at: now
                    });
                }

                // Update tables - delete old, insert new
                await db.query('DELETE FROM order_schedule_tables WHERE schedule_id = ?', [scheduleId]);
                for (const tableId of tableIds) {
                    await db.insert('order_schedule_tables', {
                        id: `${scheduleId}-TBL-${tableId}`,
                        schedule_id: scheduleId,
                        table_id: tableId
                    });
                }

                // Update payments - delete old, insert new
                await db.query('DELETE FROM order_schedule_payment WHERE schedule_id = ?', [scheduleId]);
                for (const payment of payments) {
                    await db.insert('order_schedule_payment', {
                        id: `${scheduleId}-PAY-${Math.random().toString(36).substr(2, 9)}`,
                        schedule_id: scheduleId,
                        method_id: payment.methodId,
                        amount: payment.amount,
                        created_at: now
                    });
                }

                logger.info({ scheduleId }, 'Schedule updated successfully');

                invalidateScheduleCache(branchId, moduleId);

                jsonResponse(res, 200, {
                    success: true,
                    scheduleId,
                    message: 'Schedule updated successfully'
                });
                return true;
            }

            // DELETE /api/branches/:branchId/modules/:moduleId/schedule/:id - Cancel
            if (req.method === 'DELETE' && segments.length === 7) {
                const scheduleId = segments[6];

                const schedule = await db.get('SELECT * FROM order_schedule WHERE id = ? AND branch_id = ? AND module_id = ?', [scheduleId, branchId, moduleId]);

                if (!schedule) {
                    jsonResponse(res, 404, {
                        success: false,
                        error: 'Schedule not found'
                    });
                    return true;
                }

                await db.update('order_schedule', scheduleId, {
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                });

                invalidateScheduleCache(branchId, moduleId);

                jsonResponse(res, 200, {
                    success: true,
                    message: 'Schedule cancelled successfully'
                });
                return true;
            }

            jsonResponse(res, 404, { error: 'schedule-endpoint-not-found' });
            return true;

        } catch (error) {
            logger.error({ err: error, branchId, moduleId }, 'Schedule API error');
            jsonResponse(res, 500, {
                success: false,
                error: 'Internal server error',
                details: error.message
            });
            return true;
        }
    }

    /**
     * Handle POST /api/branches/:branchId/modules/:moduleId/shift/:shiftId/close
     * Dedicated endpoint for closing POS shifts
     */
    async function handleShiftCloseApi(req, res, url, branchId, moduleId, segments) {
        // Match: /api/branches/:branchId/modules/:moduleId/shift/:shiftId/close
        // segments: ['api', 'branches', branchId, 'modules', moduleId, 'shift', shiftId, 'close']
        if (segments.length === 8 && segments[5] === 'shift' && segments[7] === 'close') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }

            const shiftId = safeDecode(segments[6]);

            try {
                const body = await readBody(req);
                if (!body) {
                    jsonResponse(res, 400, { error: 'missing-body' });
                    return true;
                }

                // Get database connection
                const db = await getOrCreateModuleDb(branchId, moduleId);
                if (!db) {
                    jsonResponse(res, 500, { error: 'database-not-available' });
                    return true;
                }

                // Fetch existing shift - column name is 'id' not 'shift_id'
                const existingShift = await db.get(
                    'SELECT * FROM pos_shift WHERE id = ? AND branch_id = ? AND module_id = ?',
                    [shiftId, branchId, moduleId]
                );

                if (!existingShift) {
                    jsonResponse(res, 404, { error: 'shift-not-found', shiftId });
                    return true;
                }

                // Prevent closing already closed shifts
                if (existingShift.status === 'closed' || existingShift.is_closed === 1) {
                    jsonResponse(res, 400, {
                        error: 'shift-already-closed',
                        message: 'This shift is already closed'
                    });
                    return true;
                }

                // Simple update: only closed_at and is_closed
                const now = new Date().toISOString();
                const sql = `UPDATE pos_shift SET closed_at = ?, is_closed = 1 WHERE id = ? AND branch_id = ? AND module_id = ?`;

                const rawDb = getDatabase({ branchId, moduleId });
                rawDb.prepare(sql).run([now, shiftId, branchId, moduleId]);

                // Fetch updated shift
                const updatedShift = await db.get(
                    'SELECT * FROM pos_shift WHERE id = ?',
                    [shiftId]
                );

                logger.info({ branchId, moduleId, shiftId }, 'Shift closed successfully');

                jsonResponse(res, 200, {
                    success: true,
                    shift: updatedShift
                });
                return true;
            } catch (error) {
                logger.error({ err: error, branchId, moduleId, shiftId }, 'Shift close API error');
                jsonResponse(res, 500, {
                    error: 'shift-close-failed',
                    message: error.message
                });
                return true;
            }
        }

        return false;
    }

    /**
     * Handle /api/session - Returns current session data
     */
    async function handleSessionApi(req, res, sessionData) {
        // sessionData is passed from the main server after validating the session cookie
        if (!sessionData) {
            jsonResponse(res, 401, { error: 'no-session', message: 'No active session found' });
            return true;
        }

        // Return sanitized session data (without sensitive info)
        jsonResponse(res, 200, {
            userId: sessionData.userId,
            userName: sessionData.userName,
            userEmail: sessionData.userEmail,
            branchId: sessionData.branchId,
            branchName: sessionData.branchName,
            companyId: sessionData.companyId,
            pinCode: sessionData.pinCode
        });
        return true;
    }



    async function handleRpcApi(req, res, url) {
        // Handle /api/rpc/batch-dataset
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 3 || segments[0] !== 'api' || segments[1] !== 'rpc') {
            jsonResponse(res, 404, { error: 'endpoint-not-found' });
            return true;
        }

        const method = segments[2];

        if (method === 'clinic-generate-slots') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            const body = await readBody(req);
            const { doctorId, startDate, endDate, daysOfWeek, sessionDuration, branchId } = body;

            try {
                // Get the module store for clinic
                // Note: ensureModuleStore signature is (branchId, moduleId)
                const clinicStore = await moduleStoreManager.ensureModuleStore('pt', 'clinic');

                // Instantiate the service
                const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);

                // Calculate days ahead from start to end date
                const start = new Date(startDate);
                const end = new Date(endDate);
                const daysAhead = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

                // Call the instance method
                const slotCount = await bookingService.generateSlotsForDoctor(doctorId, startDate, daysAhead);

                // Fetch the generated slots to return them
                // Fetch the generated slots to return them
                const rawSlots = clinicStore.listTable('clinic_slots_inventory') || [];
                const slots = rawSlots.filter(slot =>
                    (slot.doctor === doctorId || slot.doctor?.id === doctorId) &&
                    (slot.is_booked == 0 || slot.is_booked === false) &&
                    (slot.slot_status === 'available')
                );

                // Filter and format slots based on criteria
                const filteredSlots = slots
                    .filter(slot => {
                        const slotDate = new Date(slot.slot_date);
                        if (slotDate < start || slotDate > end) return false;

                        // If daysOfWeek specified (weekly pattern), filter by day
                        if (daysOfWeek && daysOfWeek.length > 0) {
                            const dayOfWeek = slotDate.getDay();
                            return daysOfWeek.includes(dayOfWeek);
                        }

                        return true;
                    })
                    .map(slot => ({
                        slotId: slot.id,
                        date: slot.slot_date,
                        dayOfWeek: new Date(slot.slot_date).getDay(),
                        timeStart: slot.slot_time_start?.slice(0, 5) || '00:00',
                        slotId: slot.id,
                        slotDate: slot.slot_date,
                        slotStart: slot.slot_time_start,
                        slotEnd: slot.slot_time_end,
                        label: `${slot.slot_time_start.slice(0, 5)} - ${slot.slot_time_end.slice(0, 5)}`
                    }));

                jsonResponse(res, 200, { success: true, count: slotCount, slots: filteredSlots });
                return true;

            } catch (err) {
                logger.error({ err, method }, 'RPC Error');
                jsonResponse(res, 500, { success: false, error: err.message });
                return true;
            }
        }

        if (method === 'clinic-analyze-schedule') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            const body = await readBody(req);
            const { doctorId, startDate, sessionsCount, daysOfWeek, preferredTime } = body;

            try {
                const clinicStore = await moduleStoreManager.ensureModuleStore('pt', 'clinic');
                const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);

                const result = await bookingService.analyzeSchedule(doctorId, startDate, sessionsCount, daysOfWeek, preferredTime);
                jsonResponse(res, 200, result);
                return true;
            } catch (err) {
                logger.error({ err, method }, 'RPC analyze Error');
                jsonResponse(res, 500, { success: false, error: err.message });
                return true;
            }
        }

        if (method === 'clinic-confirm-contract') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            const body = await readBody(req);

            try {
                const branchId = resolveBranchId(url) || 'pt';
                const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, 'clinic');
                const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);

                // Pass user context if available (from session?)
                // For now, we rely on body.user passed from frontend or default to system
                const result = await bookingService.confirmContract(body);

                // CRITICAL: Persist changes to disk to survive server restarts
                await moduleStoreManager.persistModuleStore(clinicStore);

                jsonResponse(res, 200, result);
                return true;
            } catch (err) {
                logger.error({ err, method }, 'RPC confirm-contract Error');
                jsonResponse(res, 500, { success: false, error: err.message });
                return true;
            }
        }

        if (method === 'clinic-get-booking-calendar') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            const body = await readBody(req);

            try {
                const branchId = body.branchId || 'pt';
                const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, 'clinic');
                const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);

                const result = await bookingService.getBookingCalendar(body);
                jsonResponse(res, 200, result);
                return true;
            } catch (err) {
                logger.error({ err, method }, 'RPC get-booking-calendar Error');
                jsonResponse(res, 500, { success: false, error: err.message });
                return true;
            }
        }

        if (method === 'clinic-get-timeline-bookings') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            const body = await readBody(req);

            try {
                const branchId = body.branchId || 'pt';
                const { date, doctorId } = body;
                const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, 'clinic');

                // Fetch doctors
                const allDoctors = clinicStore.listTable('clinic_doctors') || [];
                let targetDoctors = doctorId && doctorId !== 'all'
                    ? allDoctors.filter(d => d.id === doctorId || d.Id === doctorId)
                    : allDoctors.filter(d => d.is_active == 1 || d.is_active === true);

                // Fetch Users for Doctor Names
                const allUsers = clinicStore.listTable('users') || [];
                const userMap = {};
                const getId = (val) => {
                    if (!val) return null;
                    if (typeof val === 'object') return val.id || val.Id || val.uuid || val.uid || null;
                    return val;
                };
                allUsers.forEach(u => {
                    const ids = [u.id, u.Id, u.uuid, u.uid].filter(Boolean);
                    ids.forEach(id => { userMap[String(id)] = u; });
                });

                // Fetch all bookings for this date
                const allBookings = clinicStore.listTable('clinic_bookings') || [];
                const allSlots = clinicStore.listTable('clinic_slots_inventory') || [];
                const bookingCountBySlot = {};
                allBookings.forEach(b => {
                    const slotId = typeof b.slot === 'object' ? b.slot.id : b.slot;
                    if (!slotId) return;
                    bookingCountBySlot[slotId] = (bookingCountBySlot[slotId] || 0) + 1;
                });

                // Build lookup map: slotId -> slot details
                const slotMap = {};
                allSlots.forEach(s => {
                    slotMap[s.id] = s;
                });

                // Fetch patients for name lookup
                const allPatients = clinicStore.listTable('clinic_patients') || [];
                const patientMap = {};
                allPatients.forEach(p => {
                    patientMap[p.id] = p;
                });

                // Process each doctor
                const doctors = targetDoctors.map(doctor => {
                    // Resolve Doctor Name from User link
                    let doctorName = doctor.full_name || doctor.name || doctor.nameEn || doctor.nameAr || doctor.name_en || doctor.name_ar;
                    const doctorUserId = getId(doctor.user_id || doctor.user || doctor.userId);
                    if (doctorUserId && userMap[String(doctorUserId)]) {
                        const u = userMap[String(doctorUserId)];
                        doctorName = u.full_name || u.name || u.display_name || doctorName;
                    }
                    if (!doctorName) doctorName = 'Doctor'; // Fallback

                    const doctorBookings = allBookings.filter(booking => {
                        if (!booking.slot) return false;
                        const slotId = typeof booking.slot === 'object' ? booking.slot.id : booking.slot;
                        const slot = slotMap[slotId];
                        if (!slot) return false;

                        // Check if slot belongs to this doctor and this date
                        const slotDoctorId = typeof slot.doctor === 'object' ? slot.doctor.id : slot.doctor;
                        return slotDoctorId === doctor.id && slot.slot_date === date;
                    });

                    const bookings = doctorBookings.map(booking => {
                        const slotId = typeof booking.slot === 'object' ? booking.slot.id : booking.slot;
                        const slot = slotMap[slotId];
                        const patientId = typeof booking.patient === 'object' ? booking.patient.id : booking.patient;
                        const patient = patientMap[patientId];

                        return {
                            id: booking.id, // Booking ID (UUID)
                            seq: booking.order_seq || booking.booking_seq || null, // Booking Number (Sequence)
                            patientName: patient ? (patient.name || patient.nameEn || patient.nameAr || patient.full_name || 'Patient') : 'Unknown',
                            startTime: slot ? slot.slot_time_start.slice(0, 5) : '00:00',
                            endTime: slot ? slot.slot_time_end.slice(0, 5) : '00:00',
                            status: booking.booking_status || booking.status || 'Booked',
                            service: 'Consultation' // TODO: resolve from contract_line if available
                        };
                    });

                    // Filter slots for this doctor and date
                    const doctorSlots = allSlots.filter(s => {
                        const sDocId = typeof s.doctor === 'object' ? s.doctor.id : s.doctor;
                        return sDocId === doctor.id && s.slot_date === date;
                    }).map(s => {
                        const cap = Number(s.capacity || 1);
                        const booked = (s.booked_count === undefined || s.booked_count === null)
                            ? Number(bookingCountBySlot[s.id] || 0)
                            : Number(s.booked_count || 0);
                        let status = 'empty';
                        if (s.slot_status === 'Blocked' || s.is_active === 0) status = 'blocked';
                        else if (booked >= cap) status = 'full';
                        else if (booked > 0) status = 'partial';
                        else status = 'empty';

                        return {
                            id: s.id,
                            startTime: s.slot_time_start.slice(0, 5),
                            endTime: s.slot_time_end.slice(0, 5),
                            capacity: cap,
                            booked: booked,
                            remaining: Math.max(0, cap - booked),
                            status: status
                        };
                    });

                    return {
                        id: doctor.id,
                        name: doctorName,
                        bookings: bookings,
                        slots: doctorSlots
                    };
                });

                jsonResponse(res, 200, { success: true, doctors });
                return true;
            } catch (err) {
                console.error('Timeline Error:', err);
                jsonResponse(res, 500, { error: err.message });
                return true;
            }
        }

        if (method === 'clinic-get-booking-details') {
            if (req.method !== 'POST') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return true;
            }
            const body = await readBody(req);
            const bookingId = body.id;
            if (!bookingId) {
                jsonResponse(res, 400, { error: 'missing-id' });
                return true;
            }

            try {
                const branchId = body.branchId || 'pt';
                const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, 'clinic');
                const h = new Hydrator(await schemaManager.getOrLoadSmartSchema('clinic'), clinicStore);

                const booking = findRecordUsingValue(clinicStore, 'clinic_bookings', bookingId);
                if (!booking) {
                    jsonResponse(res, 404, { error: 'booking-not-found' });
                    return true;
                }

                const hydrated = (await h.hydrate('clinic_bookings', [booking.record], 'ar', 'en'))[0];

                // Fetch related data
                // 1. Patient
                let patient = null;
                if (hydrated.patient && hydrated.patient.id) {
                    const pRec = findRecordUsingValue(clinicStore, 'clinic_patients', hydrated.patient.id);
                    if (pRec) {
                        patient = (await h.hydrate('clinic_patients', [pRec.record], 'ar', 'en'))[0];
                    }
                }

                // 2. Doctor
                let doctor = null;
                // Try from slot if not on booking
                let doctorId = null;
                if (hydrated.slot && hydrated.slot.doctor) {
                    doctorId = typeof hydrated.slot.doctor === 'object' ? hydrated.slot.doctor.id : hydrated.slot.doctor;
                }
                if (doctorId) {
                    const dRec = findRecordUsingValue(clinicStore, 'clinic_doctors', doctorId);
                    if (dRec) {
                        // Manual hydration for doctor name via User
                        const doc = dRec.record;
                        let docName = doc.name || doc.full_name;
                        if (doc.user_id) {
                            const uRec = findRecordUsingValue(clinicStore, 'users', doc.user_id);
                            if (uRec) {
                                docName = uRec.record.full_name || uRec.record.name || docName;
                            }
                        }
                        doctor = { ...doc, name: docName };
                    }
                }

                jsonResponse(res, 200, {
                    success: true,
                    data: {
                        booking: hydrated,
                        patient,
                        doctor
                    }
                });
                return true;

            } catch (err) {
                console.error('Booking Details Error:', err);
                jsonResponse(res, 500, { error: err.message });
                return true;
            }
        }

    if (method === 'clinic-create-request') {
        if (req.method !== 'POST') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }
        const body = await readBody(req);
        // Ensure context
        const userContext = { serverId: SERVER_ID, companyId: 'default', branchId: 'default' }; // Simplified for now, should come from session
        try {
            // We need to resolve company/branch from session normally, but for now we trust body or use defaults
            // Actually sessionData is not passed to handleRpcApi in current signature?
            // handleRpcApi(req, res, url)
            // I might need to access session.

            // For now, assume single tenant or provided in body
            const result = await ClinicBookingService.createBookingRequest(moduleStoreManager, body);
            jsonResponse(res, 200, { success: true, result });
        } catch (err) {
            logger.error({ err, method }, 'RPC Error');
            jsonResponse(res, 500, { success: false, error: err.message });
        }
        return true;
    }

    if (method === 'batch-dataset') {
        if (req.method !== 'POST') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }

        let body = {};
        try {
            body = await readBody(req);
        } catch (error) {
            jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
            return true;
        }

        const { branchId, moduleId, requests } = body;

        if (!branchId || !moduleId || !requests || typeof requests !== 'object') {
            jsonResponse(res, 400, { error: 'missing-params', message: 'branchId, moduleId and requests object are required' });
            return true;
        }

        console.log('[BATCH] Request received:', { branchId, moduleId, tableCount: Object.keys(requests).length });

        try {
            // Revert to using ModuleStore now that schema is fixed
            // Pass dependencies correctly
            const store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);

            console.log('[BATCH] Store retrieved:', {
                branchId: store.branchId,
                moduleId: store.moduleId,
                version: store.version,
                tablesCount: store.tables ? store.tables.length : 0,
                dataKeys: Object.keys(store.data || {}),
                tables: store.tables ? store.tables.slice(0, 5) : []
            });

            const results = {};

            for (const [key, config] of Object.entries(requests)) {
                const tableName = config.table || key;
                const query = config.query || {};
                console.log(`[BATCH] Processing table "${tableName}" (key: "${key}")`);

                let rows = [];
                try {
                    rows = store.listTable(tableName);
                    console.log(`[BATCH] Retrieved ${rows ? rows.length : 0} rows from "${tableName}"`);

                    // Apply translations if lang is requested
                    const lang = query.lang || 'ar';
                    if (rows && rows.length > 0 && typeof store.decorateWithTranslations === 'function') {
                        rows = store.decorateWithTranslations(rows, tableName, lang);
                        console.log(`[BATCH] Applied ${lang} translations to "${tableName}"`);
                    }
                } catch (err) {
                    logger.warn({ err, branchId, moduleId, table: tableName }, 'Batch fetch failed for table');
                    console.error(`[BATCH] ERROR fetching "${tableName}":`, err.message);
                    rows = [];
                }

                // Simple filtering if q is present (search)
                if (query.q) {
                    const q = String(query.q).toLowerCase();
                    rows = rows.filter(r => {
                        return Object.values(r).some(v => String(v).toLowerCase().includes(q));
                    });
                }

                // Apply limit if present
                if (query.limit && Number.isFinite(query.limit)) {
                    rows = rows.slice(0, query.limit);
                }

                results[key] = {
                    data: rows,
                    count: rows.length,
                    status: 'ok'
                };
            }

            console.log('[BATCH] Completed. Results summary:', Object.fromEntries(
                Object.entries(results).map(([k, v]) => [k, { count: v.count, status: v.status }])
            ));

            jsonResponse(res, 200, { success: true, results });
        } catch (error) {
            console.error('[BATCH] Fatal error:', error.message, error.stack);
            logger.error({ err: error, branchId, moduleId }, 'Batch dataset request failed');
            jsonResponse(res, 500, { error: 'batch-failed', message: error.message });
        }
        return true;
    }

    if (method === 'clinic-get-availability-grid') {
        if (req.method !== 'POST') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }
        const body = await readBody(req);
        const { doctorId, startDate, days = 10, branchId = 'pt', moduleId = 'clinic' } = body;

        try {
            const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);

            // Get booking calendar with ALL slots (available + booked + blocked)
            const result = await bookingService.getBookingCalendar({ doctorId, startDate, daysCount: days });
            jsonResponse(res, 200, result);
            return true;
        } catch (err) {
            logger.error({ err, method }, 'RPC availability grid error');
            jsonResponse(res, 500, { success: false, error: err.message });
            return true;
        }
    }

    if (method === 'clinic-confirm-contract') {
        if (req.method !== 'POST') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }
        const body = await readBody(req);
        const branchId = body.branchId || body.branch_id || 'pt';
        const moduleId = body.moduleId || body.module_id || 'clinic';

        try {
            const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);

            // Call confirmContract
            const result = await bookingService.confirmContract(body);
            jsonResponse(res, 200, result);
            return true;
        } catch (err) {
            logger.error({ err, method }, 'RPC confirm contract error');
            // Format error message for frontend
            jsonResponse(res, 500, { success: false, error: err.message });
            return true;
        }
    }

    if (method === 'clinic-move-booking') {
        if (req.method !== 'POST') {
            jsonResponse(res, 405, { error: 'method-not-allowed' });
            return true;
        }
        const body = await readBody(req);
        const branchId = body.branchId || body.branch_id || 'pt';
        const moduleId = body.moduleId || body.module_id || 'clinic';

        try {
            const clinicStore = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
            const bookingService = new ClinicBookingService(clinicStore, clinicStore.db);
            const result = await bookingService.moveBooking(body);
            jsonResponse(res, 200, result);
            return true;
        } catch (err) {
            logger.error({ err, method }, 'RPC move booking error');
            jsonResponse(res, 500, { success: false, error: err.message });
            return true;
        }
    }

    jsonResponse(res, 404, { error: 'rpc-method-not-found' });
    return true;
}

async function getOrCreateModuleDb(branchId, moduleId) {
    const rawDb = getDatabase({ branchId, moduleId });
    if (!rawDb) return null;

    return {
        query: async (sql, params = []) => {
            return rawDb.prepare(sql).all(params);
        },
        get: async (sql, params = []) => {
            return rawDb.prepare(sql).get(params);
        },
        insert: async (table, record) => {
            const context = { branchId, moduleId };

            try {
                if (isManagedTable(table)) {
                    if (table === 'order_header' && !record.id && record.order_id) {
                        record.id = record.order_id;
                    }
                    logger.info({ table, recordId: record.id, branchId, moduleId }, 'Inserting into managed table');
                    const result = persistRecord(table, record, context);
                    logger.info({ table, recordId: record.id }, 'Managed table insert successful');
                    return result;
                }

                const finalRecord = { ...record, branch_id: branchId, module_id: moduleId };
                const keys = Object.keys(finalRecord);
                const cols = keys.join(', ');
                const placeholders = keys.map(() => '?').join(', ');
                const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`;

                logger.info({ table, recordId: record.id, branchId, moduleId, sql }, 'Executing SQLite insert');
                const result = rawDb.prepare(sql).run(Object.values(finalRecord));

                if (result.changes === 0) {
                    logger.warn({ table, recordId: record.id }, 'Insert returned 0 changes');
                } else {
                    logger.info({ table, recordId: record.id, changes: result.changes, lastID: result.lastInsertRowid }, 'SQLite insert successful');
                }

                return finalRecord;
            } catch (error) {
                logger.error({ err: error, table, recordId: record.id, branchId, moduleId }, 'Database insert failed');
                throw error;
            }
        },
        update: async (table, id, data) => {
            const keys = Object.keys(data);
            if (keys.length === 0) return;
            const sets = keys.map(k => `${k} = ?`).join(', ');
            const sql = `UPDATE ${table} SET ${sets} WHERE id = ? AND branch_id = ? AND module_id = ?`;
            return rawDb.prepare(sql).run([...Object.values(data), id, branchId, moduleId]);
        }
    };
}

return {
    handleSyncRequest,
    handleManagementApi,
    handleDeepCrudApi,
    handleLanguagesApi,
    handleBranchesApi,
    handleSessionApi,
    handleShiftCloseApi,
    handleRpcApi,
    readBody,
    buildBranchSnapshot
};
}
