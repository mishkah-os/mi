/**
 * Authentication Endpoints Module
 * Handles token-based auto-login and session info endpoints
 */

import { parseCookies } from '../utils/helpers.js';
import { BRANCH_DOMAINS, DEFAULT_BRANCH_ID } from '../config/index.js';
import { createSession, getSession, SESSIONS } from './session-manager.js';
import logger from '../logger.js';
import { createId, nowIso } from '../utils.js';

// ============ AUTO-LOGIN ENDPOINT HANDLER ============

/**
 * Handle /api/autologin endpoint
 * Decrypts token via external API, validates, creates session, and redirects
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {URL} url - Parsed URL
 */
export async function handleAutoLogin(req, res, url, deps = {}) {
    try {
        const encToken = url.searchParams.get('enc');
        const redirectUrl = url.searchParams.get('url') || '/';

        if (!encToken) {
            res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<html><body><h1>400 Bad Request</h1><p>Missing encrypted token (enc parameter)</p></body></html>');
            return;
        }

        // Get branch configuration (use first available for now)
        // Get branch configuration
        let branchConfig = BRANCH_DOMAINS[DEFAULT_BRANCH_ID];

        if (!branchConfig) {
            // Fallback to first available
            for (const [branchId, config] of Object.entries(BRANCH_DOMAINS)) {
                branchConfig = config;
                break;
            }
        }

        if (!branchConfig || !branchConfig.domain_url) {
            logger.error('No branch domain configuration found');
            res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<html><body><h1>500 Internal Error</h1><p>Branch configuration missing</p></body></html>');
            return;
        }

        // Decrypt token via external API
        const decryptUrl = `${branchConfig.domain_url}/api/v6/userdatadec?enc=${encodeURIComponent(encToken)}`;
        const decryptResponse = await fetch(decryptUrl, {
            method: 'GET',
            headers: { 'X-API-KEY': branchConfig.api_key }
        });

        if (!decryptResponse.ok) {
            logger.warn({ status: decryptResponse.status }, 'Token decryption failed');
            res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<html><body><h1>401 Unauthorized</h1><p>Invalid or expired token</p></body></html>');
            return;
        }

        const userData = await decryptResponse.json();

        console.log('[AUTOLOGIN] Decrypted userData keys:', Object.keys(userData));
        console.log('[AUTOLOGIN] Decrypted userData:', JSON.stringify(userData, null, 2));

        if (userData.error) {
            logger.warn({ error: userData.error }, 'Token validation failed');
            res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`<html><body><h1>401 Unauthorized</h1><p>${userData.error}</p></body></html>`);
            return;
        }

        // --- HARDCODED FALLBACK (Requested by User) ---
        const brNameChk = String(userData.brname || '').toLowerCase();
        if (brNameChk === 'remal') {
            userData.compName = 'G-Remal Hotel';
        } else if (brNameChk === 'dar') {
            userData.compName = 'قرية درويش للمندي';
        }
        // -----------------------------------------------

        const issuedAtRaw = userData.issuedAt || userData.issued_at || userData.createdAt || userData.created_at || userData.timestamp || userData.ts || userData.generatedAt || userData.generated_at;
        if (issuedAtRaw) {
            let issuedAtMs = Number(issuedAtRaw);
            if (Number.isFinite(issuedAtMs)) {
                if (issuedAtMs < 1e12) issuedAtMs *= 1000;
            } else {
                const parsed = Date.parse(issuedAtRaw);
                if (!Number.isNaN(parsed)) issuedAtMs = parsed;
            }
            if (Number.isFinite(issuedAtMs)) {
                const maxAgeMs = 60 * 60 * 1000;
                if (Date.now() - issuedAtMs > maxAgeMs) {
                    logger.warn({ issuedAtMs }, 'Token expired (beyond 60 minutes)');
                    res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
                    res.end('<html><body><h1>401 Unauthorized</h1><p>Token expired</p></body></html>');
                    return;
                }
            }
        }

        if (deps.moduleStoreManager) {
            const branchId = userData.branch_id || userData.branchId || userData.branch || DEFAULT_BRANCH_ID;
            const sanitizeValue = (value) => {
                if (value === undefined) return undefined;
                if (value === null) return null;
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    return trimmed ? trimmed : null;
                }
                return value;
            };
            try {
                const store = await deps.moduleStoreManager.ensureModuleStore(branchId, 'security');
                const users = store.listTable('sys_users') || [];
                const candidateId = sanitizeValue(userData.userID || userData.userId || userData.id || userData.user_id);
                const candidateEmail = sanitizeValue(userData.userEmail || userData.email);
                const candidateUsername = sanitizeValue(userData.userName || userData.username || candidateEmail);
                const existing = users.find((u) => {
                    if (candidateId && String(u.id) === String(candidateId)) return true;
                    if (candidateEmail && String(u.email || '').toLowerCase() === String(candidateEmail).toLowerCase()) return true;
                    if (candidateUsername && String(u.username || '').toLowerCase() === String(candidateUsername).toLowerCase()) return true;
                    return false;
                });

                const fullName = sanitizeValue(
                    userData.full_name
                    || userData.fullName
                    || [userData.First_Name, userData.Last_name, userData.Family_Name].filter(Boolean).join(' ')
                    || candidateUsername
                ) || 'User';

                const desired = {
                    id: candidateId || createId('user'),
                    username: candidateUsername || `user-${Date.now()}`,
                    full_name: fullName,
                    password_hash: sanitizeValue(userData.password_hash || userData.passwordHash),
                    email: candidateEmail || null,
                    mobile: sanitizeValue(userData.mobile || userData.phone || userData.Phone_number) || null,
                    role_id: sanitizeValue(userData.roleId || userData.role_id) || null,
                    license_status: userData.license_status || 1,
                    default_branch_id: branchId,
                    default_lang: sanitizeValue(userData.default_lang) || 'ar',
                    default_theme: sanitizeValue(userData.default_theme) || 'light',
                    created_date: sanitizeValue(userData.created_date) || nowIso(),
                    last_login: nowIso(),
                    pin_code: sanitizeValue(userData.pin_code || userData.pinCode) || null
                };

                let updatedRecord = null;
                let didChange = false;

                if (existing) {
                    const next = { ...existing };
                    const applyIfDifferent = (field, value) => {
                        if (value === undefined) return;
                        if (next[field] !== value) {
                            next[field] = value;
                            didChange = true;
                        }
                    };
                    applyIfDifferent('username', desired.username);
                    applyIfDifferent('full_name', desired.full_name);
                    applyIfDifferent('email', desired.email);
                    applyIfDifferent('mobile', desired.mobile);
                    applyIfDifferent('role_id', desired.role_id);
                    applyIfDifferent('license_status', desired.license_status);
                    applyIfDifferent('default_branch_id', desired.default_branch_id);
                    applyIfDifferent('default_lang', desired.default_lang);
                    applyIfDifferent('default_theme', desired.default_theme);
                    applyIfDifferent('pin_code', desired.pin_code);
                    applyIfDifferent('last_login', desired.last_login);
                    if (!next.created_date) {
                        applyIfDifferent('created_date', desired.created_date);
                    }
                    if (!next.password_hash && desired.password_hash !== undefined) {
                        applyIfDifferent('password_hash', desired.password_hash);
                    }
                    if (didChange) {
                        updatedRecord = next;
                    }
                } else {
                    updatedRecord = desired;
                    didChange = true;
                }

                if (didChange && updatedRecord) {
                    if (!updatedRecord.password_hash) {
                        updatedRecord.password_hash = 'autologin';
                    }
                    store.save('sys_users', updatedRecord, { source: 'autologin' });
                    await deps.moduleStoreManager.persistModuleStore(store);
                    logger.info({ userId: updatedRecord.id, branchId }, 'Auto-login user upserted into sys_users');
                }
            } catch (error) {
                logger.warn({ err: error }, 'Failed to upsert sys_users during autologin');
            }
        }



        // Normalize userData keys for consistency
        if (!userData.compName && userData.Company_name) {
            userData.compName = userData.Company_name;
        }

        // Create session
        const sessionToken = createSession(userData);
        const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

        // Return HTML that injects user data into localStorage before redirecting
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Redirecting...</title>
</head>
<body>
    <script>
        // Store user data in localStorage for frontend access
        const userData = ${JSON.stringify(userData)};
        localStorage.setItem('mishkah_user', JSON.stringify(userData));
        localStorage.setItem('mishkah_token', '${encToken}');
        
        // Redirect to target page
        window.location.href = '${redirectUrl}';
    </script>
    <p>Redirecting...</p>
</body>
</html>`;

        // Set session cookie and send HTML response
        res.writeHead(200, {
            'Set-Cookie': `ws_session=${sessionToken}; Path=/; HttpOnly; Max-Age=${SESSION_TTL_SECONDS}`,
            'content-type': 'text/html; charset=utf-8'
        });
        res.end(html);

    } catch (error) {
        logger.error({ err: error }, 'Auto-login error');
        res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body><h1>500 Internal Error</h1><p>Login failed</p></body></html>');
    }
}

// ============ SESSION INFO ENDPOINT HANDLER ============

/**
 * Handle /api/session/info endpoint
 * Returns current user session data
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {Function} jsonResponse - JSON response helper
 */
export function handleSessionInfo(req, res, jsonResponse) {
    try {
        const cookies = parseCookies(req.headers?.cookie || '');
        const sessionToken = cookies.ws_session;

        if (!sessionToken || !SESSIONS.has(sessionToken)) {
            jsonResponse(res, 401, { error: 'no-session', message: 'No active session found' });
            return;
        }

        const session = SESSIONS.get(sessionToken);

        // Check expiry
        if (session.expiresAt < Date.now()) {
            SESSIONS.delete(sessionToken);
            jsonResponse(res, 401, { error: 'session-expired', message: 'Session has expired' });
            return;
        }

        // Return session data
        // We spread the whole session object so that new dynamic fields (compName, etc.) are included automatically
        const { password_hash, ...safeSession } = session; // Exclude sensitive fields if any exist in session

        jsonResponse(res, 200, safeSession);
    } catch (error) {
        logger.error({ err: error }, 'Session info error');
        jsonResponse(res, 500, { error: 'server-error', message: error.message });
    }
}

// Export all handlers
export default {
    handleAutoLogin,
    handleSessionInfo
};
