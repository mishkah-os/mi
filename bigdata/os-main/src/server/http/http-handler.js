import path from 'path';
import { rm, readFile } from 'fs/promises';
import { migrateSchema } from '../../database/schema-migrator.js';
import { validateSchema } from '../../database/schema-validator.js';

export function createHttpHandler(deps) {
    const {
        logger,
        metricsState,
        recordHttpRequest,
        renderMetrics,
        handleMultipartUpload,
        jsonResponse,
        issueRecaptchaChallenge,
        verifyRecaptchaChallenge,
        handleManagementApi,
        collectRequestedModules,
        collectIncludeFlags,
        modulesConfig,
        loadModuleSchemaSnapshot,
        loadModuleSeedSnapshot,
        loadModuleLiveSnapshot,
        nowIso,
        ensureModuleStore,
        DEFAULT_MODULE_ID,
        resolveBranchId,
        resolveLangParam,
        buildClassifiedLangIndex,
        mapClassifiedRecord,
        normalizeImageList,
        resolveExpiryDate,
        createId,
        fileExists,
        writeJson,
        parseModuleList,
        normalizeIdentifier,
        MAX_UPLOAD_FILES,
        attachTranslationsToRows,
        applyModuleFilters,
        applyModuleOrdering,
        readBody,
        createQuery,
        executeRawQuery,
        executeModuleStoreSelect,
        persistModuleStore,
        truncateTable,
        DEFAULT_TABLES,
        BRANCHES_DIR,
        ACCEPTED_RESEED_CODES,
        getDatabaseSchema,
        serverId,
        scheduleRoutes,
        moduleStoreManager
    } = deps;

    // Simple cookie parser
    function parseCookie(cookieHeader) {
        const cookies = {};
        if (!cookieHeader) return cookies;
        cookieHeader.split(';').forEach(part => {
            const [key, ...rest] = part.trim().split('=');
            if (key) cookies[key] = rest.join('=');
        });
        return cookies;
    }

    return async function httpHandler(req, res) {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const requestStart = Date.now();
        const isAjax = url.pathname.startsWith('/api/');
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'access-control-allow-origin': '*',
                'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
                'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
                'access-control-max-age': '600'
            });
            res.end();
            return;
        }
        if (metricsState.enabled) {
            res.on('finish', () => {
                const duration = Date.now() - requestStart;
                recordHttpRequest(req.method, isAjax, duration);
            });
        }
        if (req.method === 'GET' && url.pathname === '/metrics') {
            try {
                const body = await renderMetrics();
                res.writeHead(200, {
                    'content-type': 'text/plain; version=0.0.4; charset=utf-8',
                    'cache-control': 'no-store',
                    'access-control-allow-origin': '*',
                    'access-control-allow-headers': '*',
                    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
                });
                res.end(body);
            } catch (error) {
                logger.warn({ err: error }, 'Failed to render metrics response');
                res.writeHead(500, {
                    'content-type': 'application/json',
                    'access-control-allow-origin': '*',
                    'access-control-allow-headers': '*',
                    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
                });
                res.end(JSON.stringify({ error: 'metrics-unavailable' }));
            }
            return;
        }

        if (req.method === 'GET' && url.pathname === '/data/branches.domain-config.json') {
            try {
                const filePath = path.join(deps.ROOT_DIR, 'data', 'branches.domain-config.json');
                if (await deps.fileExists(filePath)) {
                    const content = await readFile(filePath, 'utf8');
                    res.writeHead(200, {
                        'content-type': 'application/json; charset=utf-8',
                        'access-control-allow-origin': '*'
                    });
                    res.end(content);
                    return;
                }
            } catch (error) {
                // fall through to 404
            }
            jsonResponse(res, 404, { error: 'not-found', path: url.pathname });
            return;
        }

        if (url.pathname === '/api/uploads' && req.method === 'POST') {
            const contentType = (req.headers['content-type'] || '').toLowerCase();
            if (!contentType.includes('multipart/form-data')) {
                jsonResponse(res, 415, { error: 'unsupported-media-type', message: 'multipart/form-data required' });
                return;
            }
            try {
                const { files, fields } = await handleMultipartUpload(req);
                if (!files || !files.length) {
                    jsonResponse(res, 400, { error: 'no-files-uploaded' });
                    return;
                }
                const cleanupUploadedFiles = async () => {
                    await Promise.all(
                        files.map((file) =>
                            file && file._localPath ? rm(file._localPath).catch(() => { }) : Promise.resolve()
                        )
                    );
                };
                const metaMode = typeof fields?.media_mode === 'string' ? fields.media_mode.trim().toLowerCase() : '';
                if (metaMode === 'reel') {
                    const duration = Number(fields?.reel_duration);
                    if (!Number.isFinite(duration) || duration > 30.5) {
                        await cleanupUploadedFiles();
                        jsonResponse(res, 400, { error: 'reel-too-long', maxSeconds: 30 });
                        return;
                    }
                }
                const publicFiles = files.map((file) => {
                    const clone = { ...file };
                    delete clone._localPath;
                    return clone;
                });
                jsonResponse(res, 201, {
                    files: publicFiles,
                    count: files.length,
                    maxFiles: MAX_UPLOAD_FILES
                });
            } catch (error) {
                const status =
                    error && error.message === 'files-limit-exceeded'
                        ? 413
                        : error && error.message && error.message.includes('file-too-large')
                            ? 413
                            : 500;
                logger.warn({ err: error }, 'Upload request failed');
                jsonResponse(res, status, { error: 'upload-failed', message: error.message || 'upload failed' });
            }
            return;
        }
        if (await deps.serveStaticAsset(req, res, url)) return;
        if (req.method === 'GET' && url.pathname === '/healthz') {
            jsonResponse(res, 200, { status: 'ok', serverId: serverId, now: nowIso() });
            return;
        }
        if (url.pathname === '/api/recaptcha' && req.method === 'GET') {
            const challenge = issueRecaptchaChallenge();
            jsonResponse(res, 200, challenge);
            return;
        }
        if (url.pathname === '/api/recaptcha/verify' && req.method === 'POST') {
            let body = null;
            try {
                body = await readBody(req);
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
            const token = body && body.token;
            const input = body && body.input;
            const valid = verifyRecaptchaChallenge(token, input);
            jsonResponse(res, valid ? 200 : 401, { valid });
            return;
        }
        if (url.pathname.startsWith('/api/manage')) {
            const handled = await handleManagementApi(req, res, url);
            if (handled) return;
        }
        if (url.pathname === '/api/store/i18n') {
            if (req.method !== 'GET') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }
            const branchId = decodeURIComponent(
                url.searchParams.get('branch') || url.searchParams.get('branchId') || 'aqar'
            );
            const moduleId = decodeURIComponent(
                url.searchParams.get('module') || url.searchParams.get('moduleId') || 'brocker'
            );
            const lang = url.searchParams.get('lang') || url.searchParams.get('locale') || 'ar';
            const fallbackLang = url.searchParams.get('fallback') || url.searchParams.get('fallbackLang') || 'ar';

            try {
                const store = await ensureModuleStore(branchId, moduleId);
                const payload = deps.loadTranslationsPayload(store, { lang, fallbackLang });
                jsonResponse(res, 200, {
                    branchId,
                    moduleId,
                    generatedAt: nowIso(),
                    ...payload
                });
            } catch (error) {
                logger.error({ err: error, branchId, moduleId }, 'Failed to load i18n payload');
                jsonResponse(res, 500, {
                    error: 'i18n-load-failed',
                    message: error.message || 'unable-to-load-translations'
                });
            }
            return;
        }
        if (url.pathname === '/api/schema') {
            if (req.method !== 'GET') {
                jsonResponse(res, 405, { error: 'method-not-allowed' });
                return;
            }
            const branchParam = url.searchParams.get('branch') || url.searchParams.get('branchId') || 'lab:test-pad';
            const branchId = decodeURIComponent(branchParam);
            const requestedModules = collectRequestedModules(url.searchParams);
            const moduleIds = requestedModules.length
                ? requestedModules
                : Object.keys(modulesConfig.modules || {});
            if (!moduleIds.length) {
                jsonResponse(res, 404, { error: 'modules-not-found' });
                return;
            }
            const includeFlags = collectIncludeFlags(url.searchParams);
            const includeSchema = includeFlags.size === 0 || includeFlags.has('schema');
            const includeSeed = includeFlags.has('seed');
            const includeLive = includeFlags.has('live');
            const includeConfig = includeFlags.size === 0 || includeFlags.has('config');
            const payload = { branchId, modules: {} };
            const warnings = [];
            for (const moduleId of moduleIds) {
                const def = modulesConfig.modules?.[moduleId];
                if (!def) {
                    warnings.push({ moduleId, warning: 'module-not-defined' });
                    continue;
                }
                const entry = {
                    moduleId,
                    branchId,
                    label: def.label || null,
                    description: def.description || null,
                    tables: Array.isArray(def.tables) ? def.tables.slice() : []
                };
                if (includeConfig) {
                    entry.config = { ...def };
                }
                if (includeSchema) {
                    const { schema, source } = await loadModuleSchemaSnapshot(branchId, moduleId);
                    entry.schema = schema || null;
                    entry.schemaSource = source;
                    if (!schema) {
                        warnings.push({ moduleId, warning: 'schema-not-found' });
                    }
                }
                if (includeSeed) {
                    const { seed, source } = await loadModuleSeedSnapshot(branchId, moduleId);
                    entry.seed = seed || null;
                    entry.seedSource = source;
                    if (!seed) {
                        warnings.push({ moduleId, warning: 'seed-not-found' });
                    }
                }
                if (includeLive) {
                    const { live, source } = await loadModuleLiveSnapshot(branchId, moduleId);
                    entry.live = live || null;
                    entry.liveSource = source;
                    if (!live) {
                        warnings.push({ moduleId, warning: 'live-not-found' });
                    }
                }
                payload.modules[moduleId] = entry;
            }
            if (warnings.length) {
                payload.warnings = warnings;
            }
            jsonResponse(res, 200, payload);
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/state') {
            const branchParam = url.searchParams.get('branch') || 'lab:test-pad';
            const branchId = decodeURIComponent(branchParam);
            try {
                const snapshot = await deps.buildBranchSnapshot(branchId);
                jsonResponse(res, 200, snapshot);
            } catch (error) {
                logger.warn({ err: error, branchId }, 'Failed to build state response');
                jsonResponse(res, 500, { error: 'state-unavailable', message: error.message });
            }
            return;
        }
        if (url.pathname === '/api/modules' && req.method === 'GET') {
            const modules = Object.entries(modulesConfig.modules || {}).map(([id, def]) => ({
                id,
                label: def.label || id,
                description: def.description || '',
                tables: Array.isArray(def.tables) ? def.tables : []
            }));
            jsonResponse(res, 200, { modules });
            return;
        }
        if (url.pathname === '/api/modules' && req.method === 'POST') {
            let body = {};
            try {
                body = (await readBody(req)) || {};
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
            const moduleId = normalizeIdentifier(body.id || body.moduleId || body.name);
            if (!moduleId) {
                jsonResponse(res, 400, { error: 'missing-module-id' });
                return;
            }
            if (modulesConfig.modules?.[moduleId]) {
                jsonResponse(res, 409, { error: 'module-exists', moduleId });
                return;
            }
            const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : moduleId;
            const description = typeof body.description === 'string' ? body.description : '';
            const tables = parseModuleList(body.tables);
            const defaultSchemaFallbackPath = path.join('data', 'schemas', `${moduleId}.json`);
            const requestedSchemaFallbackPath =
                typeof body.schemaFallbackPath === 'string' && body.schemaFallbackPath.trim()
                    ? body.schemaFallbackPath.trim()
                    : defaultSchemaFallbackPath;
            const schemaPathInfo = deps.resolveWorkspacePath(requestedSchemaFallbackPath);
            if (!schemaPathInfo) {
                jsonResponse(res, 400, { error: 'invalid-schema-fallback-path' });
                return;
            }
            const { relativePath: schemaFallbackPath, absolutePath: resolvedFallbackPath } = schemaPathInfo;
            const seedFallbackPath =
                typeof body.seedFallbackPath === 'string' && body.seedFallbackPath.trim() ? body.seedFallbackPath.trim() : undefined;
            const moduleRecord = {
                label,
                description,
                schemaPath: 'schema/definition.json',
                schemaFallbackPath,
                seedPath: 'seeds/initial.json',
                livePath: 'live/data.json',
                historyPath: 'history',
                tables
            };
            if (seedFallbackPath) {
                moduleRecord.seedFallbackPath = seedFallbackPath;
            }
            modulesConfig.modules[moduleId] = moduleRecord;
            await deps.persistModulesConfig();
            const schemaPayload = body.schema && typeof body.schema === 'object' ? body.schema : { tables: [] };
            if (!(await fileExists(resolvedFallbackPath)) || body.schema) {
                await writeJson(resolvedFallbackPath, schemaPayload);
            }
            jsonResponse(res, 201, { moduleId, label, tables, schemaFallbackPath });
            return;
        }
        if (url.pathname === '/api/classifieds' && req.method === 'GET') {
            const branchId = resolveBranchId(url);
            const lang = resolveLangParam(url);
            const statusFilter = (url.searchParams.get('status') || '').toLowerCase();
            const categoryFilter = url.searchParams.get('category') || '';
            try {
                const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
                const records = store.listTable('sbn_classifieds') || [];
                const translations = store.listTable('sbn_classifieds_lang') || [];
                const langIndex = buildClassifiedLangIndex(translations);
                const filtered = records
                    .filter((record) => {
                        if (!record) return false;
                        if (statusFilter && String(record.status || '').toLowerCase() !== statusFilter) return false;
                        if (categoryFilter && record.category_id !== categoryFilter) return false;
                        return true;
                    })
                    .sort((a, b) => {
                        const aTime = Date.parse(b.updated_at || b.created_at || 0);
                        const bTime = Date.parse(a.updated_at || a.created_at || 0);
                        return aTime - bTime;
                    })
                    .slice(0, 60)
                    .map((record) => mapClassifiedRecord(record, langIndex, lang));
                jsonResponse(res, 200, { classifieds: filtered, count: filtered.length });
            } catch (error) {
                logger.warn({ err: error }, 'Failed to list classifieds');
                jsonResponse(res, 500, { error: 'classifieds-unavailable', message: error.message });
            }
            return;
        }
        if (url.pathname === '/api/classifieds' && req.method === 'POST') {
            let body = {};
            try {
                body = (await readBody(req)) || {};
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
            const branchId = resolveBranchId(url);
            const sellerId = typeof body.seller_id === 'string' && body.seller_id.trim()
                ? body.seller_id.trim()
                : typeof body.user_id === 'string' && body.user_id.trim()
                    ? body.user_id.trim()
                    : '';
            const categoryId = typeof body.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : '';
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (!sellerId) {
                jsonResponse(res, 400, { error: 'missing-seller' });
                return;
            }
            if (!categoryId) {
                jsonResponse(res, 400, { error: 'missing-category' });
                return;
            }
            if (!title) {
                jsonResponse(res, 400, { error: 'missing-title' });
                return;
            }
            const now = nowIso();
            const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'EGP';
            const priceValue = body.price !== undefined && body.price !== null ? Number(body.price) : null;
            const record = {
                classified_id: createId('cls'),
                seller_id: sellerId,
                category_id: categoryId,
                title,
                description: typeof body.description === 'string' ? body.description : '',
                price: priceValue,
                currency,
                images: normalizeImageList(body.images),
                contact_phone: typeof body.contact_phone === 'string' ? body.contact_phone : typeof body.phone === 'string' ? body.phone : '',
                contact_whatsapp:
                    typeof body.contact_whatsapp === 'string'
                        ? body.contact_whatsapp
                        : typeof body.whatsapp === 'string'
                            ? body.whatsapp
                            : '',
                location_city: typeof body.location_city === 'string' ? body.location_city : '',
                location_district: typeof body.location_district === 'string' ? body.location_district : '',
                status: typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'active',
                expires_at: resolveExpiryDate(body.expires_at),
                views_count: 0,
                leads_count: 0,
                created_at: now,
                updated_at: now,
                published_at: now
            };
            try {
                const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
                const created = store.insert('sbn_classifieds', record, { source: 'api:classifieds' });
                const translations = [];
                const providedTranslations =
                    body.translations && typeof body.translations === 'object' ? body.translations : null;
                if (providedTranslations) {
                    for (const [lang, payload] of Object.entries(providedTranslations)) {
                        if (!lang || typeof payload !== 'object') continue;
                        const normalizedLang = lang.trim().toLowerCase();
                        if (!normalizedLang) continue;
                        translations.push({
                            id: createId('cls_lang'),
                            classified_id: created.classified_id,
                            lang: normalizedLang,
                            title: typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : created.title,
                            description:
                                typeof payload?.description === 'string' && payload.description.trim()
                                    ? payload.description
                                    : body.description || '',
                            created_at: now
                        });
                    }
                }
                if (!translations.length) {
                    translations.push({
                        id: createId('cls_lang'),
                        classified_id: created.classified_id,
                        lang: 'ar',
                        title: title,
                        description: typeof body.description === 'string' ? body.description : '',
                        created_at: now
                    });
                }
                translations.forEach((entry) => store.insert('sbn_classifieds_lang', entry, { source: 'api:classifieds' }));
                const langIndex = buildClassifiedLangIndex(translations);
                const response = mapClassifiedRecord(created, langIndex, resolveLangParam(url));
                jsonResponse(res, 201, { classified: response });
            } catch (error) {
                logger.warn({ err: error }, 'Failed to create classified');
                jsonResponse(res, 500, { error: 'classified-create-failed', message: error.message });
            }
            return;
        }
        const classifiedMatch = url.pathname.match(/^\/api\/classifieds\/([^/]+)$/);
        if (classifiedMatch && req.method === 'GET') {
            const branchId = resolveBranchId(url);
            const lang = resolveLangParam(url);
            const classifiedId = decodeURIComponent(classifiedMatch[1]);
            try {
                const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
                const record = (store.listTable('sbn_classifieds') || []).find(
                    (entry) => entry.classified_id === classifiedId
                );
                if (!record) {
                    jsonResponse(res, 404, { error: 'classified-not-found' });
                    return;
                }
                const langIndex = buildClassifiedLangIndex(
                    (store.listTable('sbn_classifieds_lang') || []).filter((entry) => entry.classified_id === classifiedId)
                );
                const response = mapClassifiedRecord(record, langIndex, lang);
                jsonResponse(res, 200, { classified: response });
            } catch (error) {
                logger.warn({ err: error, classifiedId }, 'Failed to fetch classified');
                jsonResponse(res, 500, { error: 'classified-fetch-failed', message: error.message });
            }
            return;
        }
        if (url.pathname === '/api/services' && req.method === 'POST') {
            let body = {};
            try {
                body = (await readBody(req)) || {};
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
            const branchId = resolveBranchId(url);
            const providerId = typeof body.provider_id === 'string' && body.provider_id.trim() ? body.provider_id.trim() : '';
            const categoryId = typeof body.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : '';
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            if (!providerId) {
                jsonResponse(res, 400, { error: 'missing-provider' });
                return;
            }
            if (!categoryId) {
                jsonResponse(res, 400, { error: 'missing-category' });
                return;
            }
            if (!title) {
                jsonResponse(res, 400, { error: 'missing-title' });
                return;
            }
            const now = nowIso();
            const currency = typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'EGP';
            const priceMinValue = body.price_min !== undefined && body.price_min !== null ? Number(body.price_min) : null;
            const priceMaxValue = body.price_max !== undefined && body.price_max !== null ? Number(body.price_max) : null;
            const record = {
                service_id: createId('srv'),
                provider_id: providerId,
                category_id: categoryId,
                title,
                description: typeof body.description === 'string' ? body.description : '',
                price_min: priceMinValue,
                price_max: priceMaxValue,
                currency,
                duration_min: body.duration_min !== undefined && body.duration_min !== null ? Number(body.duration_min) : null,
                duration_max: body.duration_max !== undefined && body.duration_max !== null ? Number(body.duration_max) : null,
                images: normalizeImageList(body.images),
                portfolio_urls: normalizeImageList(body.portfolio_urls),
                video_url: typeof body.video_url === 'string' ? body.video_url : '',
                location_city: typeof body.location_city === 'string' ? body.location_city : '',
                is_remote: !!body.is_remote,
                is_onsite: !!body.is_onsite,
                availability: body.availability || null,
                rating_avg: 0,
                rating_count: 0,
                orders_completed: 0,
                views_count: 0,
                likes_count: 0,
                saves_count: 0,
                status: typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'active',
                featured_until: body.featured_until || null,
                created_at: now,
                updated_at: now,
                published_at: now
            };
            try {
                const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
                const created = store.insert('sbn_services', record, { source: 'api:services' });
                const translations = [];
                const providedTranslations =
                    body.translations && typeof body.translations === 'object' ? body.translations : null;
                if (providedTranslations) {
                    for (const [lang, payload] of Object.entries(providedTranslations)) {
                        if (!lang || typeof payload !== 'object') continue;
                        const normalizedLang = lang.trim().toLowerCase();
                        if (!normalizedLang) continue;
                        translations.push({
                            id: createId('srv_lang'),
                            service_id: created.service_id,
                            lang: normalizedLang,
                            title: typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : created.title,
                            description:
                                typeof payload?.description === 'string' && payload.description.trim()
                                    ? payload.description
                                    : body.description || '',
                            created_at: now
                        });
                    }
                }
                if (!translations.length) {
                    translations.push({
                        id: createId('srv_lang'),
                        service_id: created.service_id,
                        lang: 'ar',
                        title: title,
                        description: typeof body.description === 'string' ? body.description : '',
                        created_at: now
                    });
                }
                translations.forEach((entry) => store.insert('sbn_services_lang', entry, { source: 'api:services' }));
                const langIndex = deps.buildServiceLangIndex(translations);
                const response = deps.mapServiceRecord(created, langIndex, resolveLangParam(url));
                jsonResponse(res, 201, { service: response });
            } catch (error) {
                logger.warn({ err: error }, 'Failed to create service');
                jsonResponse(res, 500, { error: 'service-create-failed', message: error.message });
            }
            return;
        }
        const serviceMatch = url.pathname.match(/^\/api\/services\/([^/]+)$/);
        if (serviceMatch && req.method === 'GET') {
            const branchId = resolveBranchId(url);
            const lang = resolveLangParam(url);
            const serviceId = decodeURIComponent(serviceMatch[1]);
            try {
                const store = await ensureModuleStore(branchId, DEFAULT_MODULE_ID);
                const record = (store.listTable('sbn_services') || []).find((entry) => entry.service_id === serviceId);
                if (!record) {
                    jsonResponse(res, 404, { error: 'service-not-found' });
                    return;
                }
                const langIndex = deps.buildServiceLangIndex(
                    (store.listTable('sbn_services_lang') || []).filter((entry) => entry.service_id === serviceId)
                );
                const response = deps.mapServiceRecord(record, langIndex, lang);
                jsonResponse(res, 200, { service: response });
            } catch (error) {
                logger.warn({ err: error, serviceId }, 'Failed to fetch service');
                jsonResponse(res, 500, { error: 'service-fetch-failed', message: error.message });
            }
            return;
        }
        if (url.pathname.startsWith('/api/pos-sync') || url.pathname.startsWith('/api/sync')) {
            const handled = await deps.handleSyncApi(req, res, url);
            if (handled) return;
        }

        if (url.pathname === '/api/autologin' && req.method === 'GET') {
            await deps.authEndpoints.handleAutoLogin(req, res, url, {
                moduleStoreManager: deps.moduleStoreManager
            });
            return;
        }

        if (url.pathname === '/api/session/info' && req.method === 'GET') {
            deps.authEndpoints.handleSessionInfo(req, res, jsonResponse);
            return;
        }

        if (url.pathname === '/api/session' && req.method === 'GET') {
            // Get session from cookie
            const sessionToken = parseCookie(req.headers.cookie || '')['ws_session'];
            const sessionData = sessionToken ? deps.getSession(sessionToken) : null;
            await deps.handleSessionApi(req, res, sessionData);
            return;
        }

        if (url.pathname.match(/^\/api\/branches\/[^/]+\/modules\/[^/]+\/sync(?:\/[^/]+)?$/) && req.method === 'POST') {
            deps.syncRoutes.handleTableSync(req, res, url, { logger, jsonResponse, BRANCH_DOMAINS: deps.BRANCH_DOMAINS, BRANCHES_DIR, ensureModuleStore, persistModuleStore });
            return;
        }

        if (url.pathname.match(/^\/api\/branches\/[^/]+\/modules\/[^/]+\/schedule/) && scheduleRoutes) {
            const handled = await scheduleRoutes.handleScheduleApi(req, res, url, { logger, jsonResponse, readBody, moduleStoreManager, posEngine: deps.posEngine });
            if (handled) return;
        }

        if (url.pathname === '/api/schemas' && req.method === 'GET') {
            deps.schemaRoutes.handleListSchemas(req, res, { logger, jsonResponse, ROOT_DIR: deps.ROOT_DIR, BRANCHES_DIR });
            return;
        }

        if (url.pathname.startsWith('/api/schemas/') && req.method === 'GET') {
            deps.schemaRoutes.handleGetSchema(req, res, url, { logger, jsonResponse, ROOT_DIR: deps.ROOT_DIR, BRANCHES_DIR });
            return;
        }

        if (url.pathname.startsWith('/api/schemas/') && req.method === 'POST') {
            deps.schemaRoutes.handleSaveSchema(req, res, url, { logger, jsonResponse, ROOT_DIR: deps.ROOT_DIR, BRANCHES_DIR });
            return;
        }

        if (url.pathname === '/api/seeds' && req.method === 'POST') {
            deps.schemaRoutes.handleSaveSeeds(req, res, { logger, jsonResponse, BRANCHES_DIR });
            return;
        }

        if (url.pathname === '/api/v1/languages') {
            await deps.handleLanguagesApi(req, res, url);
            return;
        }

        if (url.pathname.startsWith('/api/v1/auth/')) {
            await deps.handleDemoAuthApi(req, res, url);
            return;
        }

        if (url.pathname.startsWith('/api/v1/crud')) {
            await deps.handleUniversalCrudApi(req, res, url);
            return;
        }

        if (url.pathname.startsWith('/api/v1/deep-crud')) {
            await deps.handleDeepCrudApi(req, res, url);
            return;
        }

        if (url.pathname.startsWith('/api/pwa')) {
            await deps.handlePwaApi(req, res, url);
            return;
        }

        // RPC endpoints (batch-dataset, etc.)
        if (url.pathname.startsWith('/api/rpc')) {
            if (deps.handleRpcApi) {
                const handled = await deps.handleRpcApi(req, res, url);
                if (handled) return;
            }
        }

        if (url.pathname.startsWith('/api/branch/')) {
            const aliasPath = `/api/branches/${url.pathname.slice('/api/branch/'.length)}`.replace(/\/+/g, '/');
            const aliasUrl = new URL(`${aliasPath}${url.search}`, url.origin);
            await deps.handleBranchesApi(req, res, aliasUrl);
            return;
        }
        if (url.pathname.startsWith('/api/v1/branches/')) {
            const aliasPath = `/api/branches/${url.pathname.slice('/api/v1/branches/'.length)}`.replace(/\/+/g, '/');
            const aliasUrl = new URL(`${aliasPath}${url.search}`, url.origin);
            await deps.handleBranchesApi(req, res, aliasUrl);
            return;
        }
        if (url.pathname.startsWith('/api/branches')) {
            await deps.handleBranchesApi(req, res, url);
            return;
        }

        if (url.pathname === '/api/query' && req.method === 'POST') {
            const startTime = Date.now();
            try {
                const body = await readBody(req);

                if (!body.table || typeof body.table !== 'string') {
                    jsonResponse(res, 400, { error: 'Missing or invalid \"table\" field' });
                    return;
                }

                const branchId = body.branchId || body.branch_id || null;
                const moduleId = body.moduleId || body.module_id || null;

                const query = createQuery({ branchId, moduleId }).table(body.table);

                if (body.select && Array.isArray(body.select)) {
                    query.select(body.select);
                }

                if (body.where && typeof body.where === 'object') {
                    query.where(body.where);
                }

                if (body.orderBy && Array.isArray(body.orderBy)) {
                    query.orderBy(body.orderBy);
                }

                if (body.limit !== undefined) {
                    query.limit(body.limit);
                }

                if (body.offset !== undefined) {
                    query.offset(body.offset);
                }

                const result = query.execute();

                const duration = Date.now() - startTime;
                recordHttpRequest('POST', true, duration);

                jsonResponse(res, 200, result);
            } catch (error) {
                logger.error({ err: error, url: url.pathname }, 'Query API error');
                const statusCode = error.message.includes('not queryable') ? 403 : 500;
                jsonResponse(res, statusCode, {
                    error: error.message,
                    type: 'query-error'
                });
            }
            return;
        }

        if (url.pathname === '/api/query/module' && req.method === 'POST') {
            const startTime = Date.now();
            let body = {};
            try {
                body = (await readBody(req)) || {};
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
            const branchId = body.branchId || body.branch_id || resolveBranchId(url);
            const moduleId = body.moduleId || body.module_id || DEFAULT_MODULE_ID;
            const tableName = body.table || body.tableName || body.targetTable || null;
            if (!tableName) {
                jsonResponse(res, 400, { error: 'missing-table' });
                return;
            }
            try {
                const store = await ensureModuleStore(branchId, moduleId);
                if (!store.tables.includes(tableName)) {
                    jsonResponse(res, 404, { error: 'table-not-found', branchId, moduleId, table: tableName });
                    return;
                }
                let rows = store.listTable(tableName) || [];
                rows = applyModuleFilters(rows, body.where || body.filter);
                rows = applyModuleOrdering(rows, body.orderBy || body.sortBy);
                const offset = Number(body.offset);
                const limit = Number(body.limit);
                if (Number.isFinite(offset) && offset > 0) {
                    rows = rows.slice(offset);
                }
                let limited = rows;
                if (Number.isFinite(limit) && limit >= 0) {
                    limited = rows.slice(0, limit);
                }
                const lang = body.lang || body.locale || null;
                const fallbackLang = body.fallbackLang || body.fallback || 'ar';
                const localized = attachTranslationsToRows(store, tableName, limited, {
                    lang,
                    fallbackLang
                });
                const duration = Date.now() - startTime;
                jsonResponse(res, 200, {
                    branchId,
                    moduleId,
                    table: tableName,
                    count: localized.length,
                    rows: localized,
                    meta: {
                        queryTime: duration,
                        limit: Number.isFinite(limit) ? limit : null,
                        offset: Number.isFinite(offset) ? offset : null,
                        lang: lang || null,
                        fallbackLang
                    }
                });
            } catch (error) {
                logger.warn({ err: error, branchId, moduleId, table: tableName }, 'Module query failed');
                jsonResponse(res, 500, { error: 'module-query-failed', message: error.message });
            }
            return;
        }

        if (url.pathname === '/api/query/raw' && req.method === 'POST') {
            const startTime = Date.now();
            try {
                const body = await readBody(req);

                if (!body.sql || typeof body.sql !== 'string') {
                    jsonResponse(res, 400, { error: 'Missing or invalid \"sql\" field' });
                    return;
                }

                const params = Array.isArray(body.params) ? body.params : [];
                const branchId = body.branchId || body.branch_id || null;
                const moduleId = body.moduleId || body.module_id || null;

                let result = null;
                try {
                    result = executeRawQuery(body.sql, params, { branchId, moduleId });
                } catch (error) {
                    if (branchId && moduleId) {
                        const fallback = await executeModuleStoreSelect(body.sql, branchId, moduleId);
                        if (fallback) {
                            const duration = Date.now() - startTime;
                            recordHttpRequest('POST', true, duration);
                            jsonResponse(res, 200, fallback);
                            return;
                        }
                    }
                    throw error;
                }

                if ((!result || result.rows.length === 0) && branchId && moduleId) {
                    const fallback = await executeModuleStoreSelect(body.sql, branchId, moduleId);
                    if (fallback) {
                        const duration = Date.now() - startTime;
                        recordHttpRequest('POST', true, duration);
                        jsonResponse(res, 200, fallback);
                        return;
                    }
                }

                const duration = Date.now() - startTime;
                recordHttpRequest('POST', true, duration);

                jsonResponse(res, 200, result);
            } catch (error) {
                logger.error({ err: error, url: url.pathname }, 'Raw query API error');
                jsonResponse(res, 500, {
                    error: error.message,
                    type: 'raw-query-error'
                });
            }
            return;
        }

        if (url.pathname === '/api/debug/reset' && (req.method === 'POST' || req.method === 'GET')) {
            const authHeader = req.headers['x-reseed-passphrase'] || '';

            if (ACCEPTED_RESEED_CODES.size > 0 && !ACCEPTED_RESEED_CODES.has(authHeader)) {
                const queryPass = url.searchParams.get('pass') || url.searchParams.get('auth');
                if (!queryPass || !ACCEPTED_RESEED_CODES.has(queryPass)) {
                    jsonResponse(res, 403, { error: 'forbidden' });
                    return;
                }
            }

            try {
                let params = {};
                if (req.method === 'POST') {
                    try {
                        params = await readBody(req) || {};
                    } catch (err) {
                    }
                } else {
                    params = Object.fromEntries(url.searchParams);
                }

                const branchId = params.branchId || params.branch_id || deps.DEFAULT_BRANCH_ID;
                const moduleId = params.moduleId || params.module_id || DEFAULT_MODULE_ID;
                const mode = (params.mode || 'migrate').toLowerCase(); // 'migrate' or 'truncate'

                console.log(`🔄 Triggering database reset for ${branchId}/${moduleId} (mode: ${mode})...`);

                if (mode === 'truncate') {
                    // DESTRUCTIVE: Full reset with truncate (old behavior)
                    console.log('⚠️  TRUNCATE mode: Dropping all data...');

                    let sqliteCleared = 0;
                    for (const table of DEFAULT_TABLES) {
                        truncateTable(table, { branchId, moduleId });
                        sqliteCleared++;
                    }
                    console.log(`   - Truncated ${sqliteCleared} SQLite tables for scope`);

                    const store = await ensureModuleStore(branchId, moduleId);
                    store.reset();

                    const seedPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'seeds', 'initial.json');
                    console.log(`🌱 Loading seeds from: ${seedPath}`);

                    let stats = { tables: 0, records: 0, sqliteTablesCaptured: sqliteCleared, mode: 'truncate' };

                    if (await fileExists(seedPath)) {
                        const seedData = await deps.readJsonSafe(seedPath);
                        if (seedData && seedData.tables) {

                            store.applySeed(seedData);

                            for (const [tableName, records] of Object.entries(store.data || {})) {
                                if (Array.isArray(records) && records.length > 0) {
                                    stats.tables++;
                                    stats.records += records.length;
                                }
                            }

                            await persistModuleStore(store);

                            logger.info({ branchId, moduleId, stats }, 'Truncate reset and seed successful');
                            jsonResponse(res, 200, {
                                success: true,
                                message: `Truncate reset complete for ${branchId}/${moduleId}`,
                                stats
                            });
                            return;
                        }
                    }

                    await persistModuleStore(store);

                    logger.warn({ seedPath }, 'Truncate reset complete (no seeds found)');
                    jsonResponse(res, 200, { success: true, message: 'Truncate reset complete (no seeds found)', stats });

                } else {
                    // SMART MIGRATION: Non-destructive schema updates
                    console.log('✨ MIGRATE mode: Smart schema migration (preserving data)...');

                    const store = await ensureModuleStore(branchId, moduleId);

                    // Load schema definition
                    const schemaPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'schema', 'definition.json');
                    let schemaDefinition = null;

                    if (await fileExists(schemaPath)) {
                        schemaDefinition = await deps.readJsonSafe(schemaPath);
                    } else {
                        // Fallback to default schema path
                        const fallbackPath = modulesConfig.modules?.[moduleId]?.schemaFallbackPath;
                        if (fallbackPath) {
                            const resolved = deps.resolveWorkspacePath(fallbackPath);
                            if (resolved && await fileExists(resolved.absolutePath)) {
                                schemaDefinition = await deps.readJsonSafe(resolved.absolutePath);
                            }
                        }
                    }

                    if (!schemaDefinition || !schemaDefinition.tables) {
                        jsonResponse(res, 400, {
                            error: 'schema-not-found',
                            message: `No schema found for ${branchId}/${moduleId}`
                        });
                        return;
                    }

                    // Get database connection for this module
                    const db = deps.getModuleDatabase?.(branchId, moduleId);
                    if (!db) {
                        jsonResponse(res, 500, {
                            error: 'database-not-available',
                            message: 'Cannot access database for migration'
                        });
                        return;
                    }

                    // Validate current schema
                    const validationResults = validateSchema(db, schemaDefinition, branchId, moduleId);

                    // Perform migrations
                    const migrations = migrateSchema(db, schemaDefinition, validationResults, branchId, moduleId);

                    // Load seeds (non-destructive - only for new tables)
                    const seedPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'seeds', 'initial.json');
                    let seededTables = 0;

                    if (await fileExists(seedPath)) {
                        const seedData = await deps.readJsonSafe(seedPath);
                        if (seedData && seedData.tables) {
                            // Only seed tables that are newly created
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
                                        console.log(`   - Seeded ${records.length} records into new table: ${tableName}`);
                                    }
                                }
                            }

                            await persistModuleStore(store);
                        }
                    }

                    const stats = {
                        mode: 'migrate',
                        migrations: migrations.length,
                        tablesCreated: migrations.filter(m => m.action === 'CREATE_TABLE' && m.success).length,
                        columnsAdded: migrations.filter(m => m.action === 'ADD_COLUMN' && m.success).length,
                        warnings: migrations.filter(m => m.warning).length,
                        seededTables
                    };

                    logger.info({ branchId, moduleId, stats }, 'Smart migration successful');
                    jsonResponse(res, 200, {
                        success: true,
                        message: `Smart migration complete for ${branchId}/${moduleId}`,
                        stats,
                        migrations: migrations.map(m => ({
                            action: m.action,
                            table: m.tableName,
                            column: m.columnName,
                            success: m.success,
                            warning: m.warning
                        }))
                    });
                }

            } catch (error) {
                logger.error({ err: error }, 'Reset failed');
                jsonResponse(res, 500, { error: 'reset-failed', message: error.message });
            }
            return;
        }

        if (url.pathname === '/api/schema/database' && req.method === 'GET') {
            try {
                const schema = getDatabaseSchema();
                jsonResponse(res, 200, schema);
            } catch (error) {
                logger.error({ err: error }, 'Schema API error');
                jsonResponse(res, 500, {
                    error: error.message,
                    type: 'schema-error'
                });
            }
            return;
        }

        jsonResponse(res, 404, { error: 'not-found', path: url.pathname });
    };
}
