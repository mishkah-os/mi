/**
 * Session Manager Module
 * Handles user session storage, validation, and cleanup
 */

import { createId } from '../utils.js';
import { SESSION_TTL_MS } from '../config/index.js';
import logger from '../logger.js';

// ============ SESSION STORAGE ============

/**
 * In-memory session storage
 * Key: session token (string)
 * Value: { userId, companyId, branchId, userName, userEmail, branchName, pinCode, createdAt, expiresAt }
 */
export const SESSIONS = new Map();

// ============ SESSION UTILITIES ============

/**
 * Create a new session
 * @param {Object} userData - User data from token
 * @returns {string} Session token
 */
export function createSession(userData) {
    const sessionToken = createId('sess');

    // Base session object with all user data
    const sessionData = {
        ...userData, // Spread all incoming data (dynamic fields like comp_logo, branch_full_name, etc.)

        // Ensure standard keys exist (normalization)
        userId: userData.userID || userData.userId,
        companyId: userData.compid || userData.companyId,
        compName: userData.compName || userData.Company_name,
        companyLogo: userData.comp_logo || userData.Company_logo,
        branchId: userData.branch_id || userData.branchId,
        userName: userData.userName,
        userEmail: userData.userEmail,
        branchName: userData.brname || userData.branchName || userData.Branch_name,
        branchFullName: userData.branch_full_name || userData.Branch_Full_name,
        pinCode: userData.pin_code || userData.pinCode,

        // System fields
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS
    };

    SESSIONS.set(sessionToken, sessionData);

    logger.info({
        userId: userData.userID || userData.userId,
        userName: userData.userName,
        branchName: userData.brname || userData.branchName
    }, 'Session created');

    return sessionToken;
}

/**
 * Get session by token
 * @param {string} token - Session token
 * @returns {Object|null} Session data or null if not found/expired
 */
export function getSession(token) {
    if (!token || !SESSIONS.has(token)) {
        return null;
    }

    const session = SESSIONS.get(token);

    // Check expiry
    if (session.expiresAt < Date.now()) {
        SESSIONS.delete(token);
        logger.debug({ token }, 'Session expired and removed');
        return null;
    }

    return session;
}

/**
 * Validate session token
 * @param {string} token - Session token
 * @returns {boolean} True if session is valid
 */
export function isValidSession(token) {
    return getSession(token) !== null;
}

/**
 * Delete session
 * @param {string} token - Session token
 * @returns {boolean} True if session was deleted
 */
export function deleteSession(token) {
    if (!token) return false;

    const existed = SESSIONS.has(token);
    SESSIONS.delete(token);

    if (existed) {
        logger.info({ token }, 'Session deleted');
    }

    return existed;
}

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions removed
 */
export function cleanupExpiredSessions() {
    const now = Date.now();
    let removed = 0;

    for (const [token, session] of SESSIONS.entries()) {
        if (session.expiresAt < now) {
            SESSIONS.delete(token);
            removed++;
        }
    }

    if (removed > 0) {
        logger.debug({ removed }, 'Cleaned up expired sessions');
    }

    return removed;
}

/**
 * Get session count
 * @returns {number} Number of active sessions
 */
export function getSessionCount() {
    return SESSIONS.size;
}

/**
 * Get all active sessions (admin only)
 * @returns {Array} Array of session objects with tokens
 */
export function getAllSessions() {
    const sessions = [];
    for (const [token, session] of SESSIONS.entries()) {
        sessions.push({ token, ...session });
    }
    return sessions;
}

// ============ SESSION CLEANUP INTERVAL ============

// Cleanup expired sessions every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
    cleanupExpiredSessions();
}, CLEANUP_INTERVAL);

logger.info({ interval: CLEANUP_INTERVAL }, 'Session cleanup interval started');

// Export all functions
export default {
    SESSIONS,
    createSession,
    getSession,
    isValidSession,
    deleteSession,
    cleanupExpiredSessions,
    getSessionCount,
    getAllSessions
};
