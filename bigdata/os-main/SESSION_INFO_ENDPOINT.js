// Session Info Endpoint - Add to server.js

// Add this endpoint where other API endpoints are defined (before httpServer.listen)

if (url.pathname === '/api/session/info' && req.method === 'GET') {
    try {
        const cookies = parseCookies(req.headers?.cookie || '');
        const sessionToken = cookies.ws_session;

        if (!sessionToken || !SESSIONS.has(sessionToken)) {
            jsonResponse(res, 401, { error: 'no-session' });
            return;
        }

        const session = SESSIONS.get(sessionToken);

        // Check expiry
        if (session.expiresAt < Date.now()) {
            SESSIONS.delete(sessionToken);
            jsonResponse(res, 401, { error: 'session-expired' });
            return;
        }

        jsonResponse(res, 200, {
            userId: session.userId,
            userName: session.userName,
            userEmail: session.userEmail,
            companyId: session.companyId,
            branchId: session.branchId,
            branchName: session.branchName
        });
    } catch (error) {
        logger.error({ err: error }, 'Session info error');
        jsonResponse(res, 500, { error: 'server-error' });
    }
    return;
}
