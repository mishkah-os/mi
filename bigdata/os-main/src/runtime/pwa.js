import path from 'path';
import { readFile } from 'fs/promises';
import logger from '../logger.js';
import { jsonResponse, safeDecode } from '../utils/helpers.js';

// Content types for static files
const CONTENT_TYPES = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.webp': 'image/webp'
};

const STATIC_CACHE_HEADERS = {
    'cache-control': 'public, max-age=3600, must-revalidate'
};

export function createPwaHandler({
    ensureModuleStore,
    STATIC_DIR
}) {

    async function serveStaticAsset(req, res, url) {
        if (!STATIC_DIR) return false;
        if (req.method !== 'GET' && req.method !== 'HEAD') return false;
        let pathname = url.pathname;
        if (!pathname || pathname === '/') pathname = '/index.html';
        const decoded = decodeURIComponent(pathname);
        const normalized = path.normalize(decoded).replace(/^[/\\]+/, '');
        const absolutePath = path.join(STATIC_DIR, normalized);
        if (!absolutePath.startsWith(STATIC_DIR)) return false;
        try {
            const data = await readFile(absolutePath);
            const ext = path.extname(absolutePath).toLowerCase();

            // No cache for JS and CSS files (temporary for development)
            const noCacheExts = ['.js', '.mjs', '.css'];
            const shouldNoCache = noCacheExts.includes(ext);

            const headers = {
                'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
                ...(shouldNoCache
                    ? { 'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'pragma': 'no-cache', 'expires': '0' }
                    : STATIC_CACHE_HEADERS
                ),
                'access-control-allow-origin': '*',
                'access-control-allow-headers': '*',
                'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
            };
            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
                res.end();
            } else {
                res.end(data);
            }
            return true;
        } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'EISDIR') {
                return false;
            }
            logger.warn({ err: error, pathname: decoded }, 'Failed to serve static asset');
            jsonResponse(res, 500, { error: 'static-asset-error' });
            return true;
        }
    }

    function normalizePwaIcons(settings = {}) {
        const rawIcons = Array.isArray(settings.pwa_icons) ? settings.pwa_icons : [];
        const icons = [];
        for (const entry of rawIcons) {
            if (!entry) continue;
            const src = entry.src || entry.url || entry.href;
            if (!src) continue;
            icons.push({
                src,
                sizes: entry.sizes || entry.size || null,
                type: entry.type || 'image/png',
                purpose: entry.purpose || 'any'
            });
        }
        if (!icons.length) {
            icons.push({
                src: '/static/lib/mishkah-icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
            });
        }
        return icons;
    }

    async function buildModulePwaPayload(branchId, moduleId) {
        try {
            const store = await ensureModuleStore(branchId, moduleId);
            const safeList = (table) => {
                try {
                    return store.listTable(table);
                } catch (_err) {
                    return [];
                }
            };
            const settings = safeList('app_settings')[0];
            if (!settings) {
                return null;
            }
            const slides = safeList('hero_slides').sort((a, b) => {
                const ap = Number.isFinite(a?.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
                const bp = Number.isFinite(b?.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
                return ap - bp;
            });
            const themeColor = settings.theme_color || '#0f172a';
            const backgroundColor = settings.background_color || '#05070f';
            const lang = (settings.lang || 'ar').toLowerCase();
            const dir = lang.startsWith('ar') ? 'rtl' : 'ltr';
            const brandName = settings.brand_name || 'Mishkah Broker';
            const shortName = brandName.length > 14 ? `${brandName.slice(0, 14)}…` : brandName;
            const startUrl =
                settings.pwa_start_url || `/projects/brocker/index.html?branch=${encodeURIComponent(branchId)}`;
            const scope = settings.pwa_scope || '/projects/brocker/';
            const icons = normalizePwaIcons(settings);
            const screenshots = slides.slice(0, 4).map((slide, index) => ({
                src: slide.media_url,
                sizes: slide.media_type === 'video' ? '1280x720' : '1080x720',
                type: slide.media_type === 'video' ? 'video/mp4' : 'image/jpeg',
                label: slide.title || `slide-${index + 1}`
            }));
            const manifest = {
                id: `${branchId}-${moduleId}-pwa`,
                name: brandName,
                short_name: shortName,
                description: settings.tagline || settings.hero_subtitle || 'منصة وسطاء العقارات',
                start_url: startUrl,
                scope,
                display: 'standalone',
                background_color: backgroundColor,
                theme_color: themeColor,
                lang,
                dir,
                categories: ['business', 'productivity', 'real estate'],
                orientation: 'portrait',
                display_override: ['standalone', 'fullscreen'],
                prefer_related_applications: false,
                icons,
                screenshots,
                shortcuts: [
                    {
                        name: 'آخر العروض',
                        url: `${scope}?branch=${encodeURIComponent(branchId)}&view=home`,
                        description: 'انتقل مباشرةً لنتائج البحث',
                        icons: icons.slice(0, 1)
                    },
                    {
                        name: 'طلبات العملاء',
                        url: `${scope}?branch=${encodeURIComponent(branchId)}&view=dashboard`,
                        description: 'افتح لوحة التحكم لمتابعة الطلبات',
                        icons: icons.slice(0, 1)
                    }
                ]
            };
            return {
                branchId,
                moduleId,
                manifest,
                settings,
                heroSlides: slides
            };
        } catch (error) {
            logger.warn({ err: error, branchId, moduleId }, 'Failed to build PWA payload');
            return null;
        }
    }

    async function handlePwaApi(req, res, url) {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 4) {
            jsonResponse(res, 400, { error: 'invalid-pwa-path' });
            return;
        }
        const branchId = safeDecode(segments[2]);
        const moduleId = safeDecode(segments[3]);
        const tail = (segments[4] || '').toLowerCase();
        const payload = await buildModulePwaPayload(branchId, moduleId);
        if (!payload) {
            jsonResponse(res, 404, { error: 'pwa-config-missing', branchId, moduleId });
            return;
        }
        if (tail === 'manifest' || tail === 'manifest.json') {
            const body = JSON.stringify(payload.manifest, null, 2);
            res.writeHead(200, {
                'content-type': 'application/manifest+json; charset=utf-8',
                'cache-control': 'no-store',
                'access-control-allow-origin': '*',
                'access-control-allow-headers': '*',
                'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
            });
            res.end(body);
            return;
        }
        jsonResponse(res, 200, payload);
    }

    return {
        serveStaticAsset,
        normalizePwaIcons,
        buildModulePwaPayload,
        handlePwaApi,
        CONTENT_TYPES
    };
}
