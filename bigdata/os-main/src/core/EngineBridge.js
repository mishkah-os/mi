const http = require('http');
const crypto = require('crypto');

/**
 * EngineBridge acting as the transparent proxy between Node.js and C++ Engine.
 * Implements "Smart Routing" and "Draft Cleanup" strategies.
 * 
 * Security Features:
 * - Inter-Service Authentication via Shared Secret
 * - Session Token Validation
 * - Environment-based Configuration
 * - Circuit Breaker Pattern
 */
class EngineBridge {
    constructor() {
        // Environment-based Configuration
        this.engineEnabled = process.env.CPP_ENGINE_ENABLED === 'true';
        this.engineHost = process.env.CPP_ENGINE_HOST || '127.0.0.1';
        this.enginePort = parseInt(process.env.CPP_ENGINE_PORT || '8080');
        this.engineTimeout = parseInt(process.env.CPP_ENGINE_TIMEOUT || '5000');

        // Security
        this.interServiceSecret = process.env.INTER_SERVICE_SECRET || '';
        if (!this.interServiceSecret && this.engineEnabled) {
            console.warn('[Bridge] WARNING: INTER_SERVICE_SECRET not set! C++ communication is INSECURE!');
        }

        // Circuit Breaker
        this.failureCount = 0;
        this.failureThreshold = parseInt(process.env.CPP_ENGINE_FAILURE_THRESHOLD || '5');
        this.recoveryTime = parseInt(process.env.CPP_ENGINE_RECOVERY_TIME || '30000');
        this.circuitOpen = false;
        this.circuitOpenedAt = null;
    }

    /**
     * Check if Circuit Breaker allows requests
     */
    _canMakeRequest() {
        if (!this.engineEnabled) {
            return false;
        }

        if (!this.circuitOpen) {
            return true;
        }

        // Check if recovery time has passed
        if (Date.now() - this.circuitOpenedAt > this.recoveryTime) {
            console.log('[Bridge] Circuit Breaker: Attempting recovery...');
            this.circuitOpen = false;
            this.failureCount = 0;
            return true;
        }

        return false;
    }

    /**
     * Record a failure and potentially open circuit
     */
    _recordFailure() {
        this.failureCount++;
        if (this.failureCount >= this.failureThreshold) {
            this.circuitOpen = true;
            this.circuitOpenedAt = Date.now();
            console.error(`[Bridge] Circuit Breaker OPEN after ${this.failureCount} failures. Recovery in ${this.recoveryTime}ms`);
        }
    }

    /**
     * Record a success and reset failure count
     */
    _recordSuccess() {
        if (this.failureCount > 0) {
            console.log('[Bridge] Request succeeded, resetting failure count');
        }
        this.failureCount = 0;
    }

    /**
     * Public: Query data from the C++ Engine (Read Only)
     * Used for Lists, Search, and Reports to avoid loading large datasets into Node memory.
     */
    static async query(moduleId, table, params, userContext) {
        const bridge = new EngineBridge();

        // Circuit Breaker Check
        if (!bridge._canMakeRequest()) {
            console.error('[Bridge] Circuit Breaker is OPEN, rejecting query request');
            return {
                ok: false,
                error: {
                    code: 'ENGINE_UNAVAILABLE',
                    message: 'Financial Engine is temporarily unavailable. Please try again later.',
                    technical: 'Circuit Breaker is open'
                }
            };
        }

        // Construct the RPC payload
        const body = {
            module: moduleId,
            action: 'query',
            table: table,
            context: {
                user_id: userContext.user_id,
                session_token: userContext.session_token, // ✅ Added
                branch_id: userContext.default_branch_id || userContext.branch_id,
                company_id: userContext.company_id,
                role: userContext.role,
                lang: userContext.default_lang || userContext.lang || 'ar'
            },
            payload: params // { q, page, limit, sort... }
        };

        try {
            const result = await bridge._sendHttpRequest(body);
            bridge._recordSuccess();
            return result;
        } catch (error) {
            bridge._recordFailure();
            console.error('[Bridge] Query Failed:', error);
            return {
                ok: false,
                error: {
                    code: 'ENGINE_QUERY_FAILED',
                    message: 'Failed to fetch data from Financial Engine',
                    technical: error.message
                }
            };
        }
    }

    /**
     * Main entry point for Saving Data.
     * Decides whether to save to Local SQLite (Draft) or C++ Engine (Posted).
     *
     * @param {Object} db - The Node.js SQLite Instance (HybridStore)
     * @param {Object} moduleConfig - Configuration from modules.json
     * @param {String} table - Table Name
     * @param {Object} payload - The Data Record
     * @param {Object} userContext - Current User Session Info
     */
    async routeSave(db, moduleConfig, table, payload, userContext) {
        // 1. Check if Module is Managed by C++
        const isCppManaged = (moduleConfig.engine === 'cpp');

        // 2. Check Record Status & Transactionality
        const status = payload.status || 'DRAFT';
        const isPosted = (status === 'POSTED' || status === 'CONFIRMED' || status === 'APPROVED');

        // 3. New Strategy: "Master Data" Auto-Post
        // If table is NOT listed as 'transactional' in modules.json, we assume it's Master Data (Direct Write).
        const transactionalTables = moduleConfig.transactional_tables || [];
        const isTransactional = transactionalTables.includes(table);

        // Logic:
        // - If Transactional AND Posted -> C++
        // - If Transactional AND Draft -> SQLite
        // - If NOT Transactional (Master Data) -> C++ (Always)

        const shouldGoToCpp = (isCppManaged && (!isTransactional || isPosted));

        if (shouldGoToCpp) {
            console.log(`[Bridge] Routing ${isTransactional ? 'POSTED Transaction' : 'MASTER DATA'} for ${table} to C++ Engine...`);
            return await this._executeOnEngine(moduleConfig.id, 'post', table, payload, userContext, db);
        } else {
            // Default: Save to SQLite (as Draft if Transactional, or Regular if Native)
            // If it is C++ managed but we are here, it MUST be a Draft.
            const targetTable = (isCppManaged) ? `${table}_draft` : table;
            console.log(`[Bridge] Saving to Local SQLite: ${targetTable}`);
            return await db.saveRecord(targetTable, payload);
        }
    }

    /**
     * Internal: Sends data to C++ Engine and handles Draft Cleanup (Archiving)
     */
    async _executeOnEngine(moduleId, action, table, payload, userContext, db) {
        // Circuit Breaker Check
        if (!this._canMakeRequest()) {
            console.error('[Bridge] Circuit Breaker is OPEN, cannot post to C++');

            // Log failed post for retry
            await this._logFailedPost(db, table, payload, 'Circuit Breaker Open');

            return {
                ok: false,
                error: {
                    code: 'ENGINE_UNAVAILABLE',
                    message: 'Financial Engine is temporarily unavailable. Your data has been saved for retry.',
                    technical: 'Circuit Breaker is open'
                }
            };
        }

        const body = {
            module: moduleId,
            action: action, // 'post', 'validate', etc.
            table: table,
            context: {
                user_id: userContext.user_id,
                session_token: userContext.session_token, // ✅ Added for C++ validation
                branch_id: userContext.default_branch_id || userContext.branch_id,
                company_id: userContext.company_id,
                role: userContext.role,
                permissions: userContext.permissions,
                lang: userContext.default_lang || userContext.lang || 'ar'
            },
            payload: payload
        };

        try {
            const result = await this._sendHttpRequest(body);
            this._recordSuccess();

            // CRITICAL: Archiving Strategy with Race Condition Prevention
            if (result.ok) {
                console.log(`[Bridge] Archiving: Checking for race conditions before deletion...`);

                // Race Condition Check: Verify draft wasn't modified during posting
                const draftTable = `${table}_draft`;
                let shouldDelete = true;

                try {
                    const currentDraft = await db.getRecord(draftTable, payload.id).catch(() => null);

                    if (currentDraft) {
                        // Check if draft was modified after we sent it
                        const sentTimestamp = payload.last_update || payload.updated_at || 0;
                        const currentTimestamp = currentDraft.last_update || currentDraft.updated_at || 0;

                        if (currentTimestamp > sentTimestamp) {
                            shouldDelete = false;
                            console.warn(`[Bridge] RACE CONDITION DETECTED: Draft ${payload.id} was modified during posting. Keeping modified version.`);
                        }
                    }
                } catch (checkErr) {
                    console.warn('[Bridge] Could not check for race condition:', checkErr);
                }

                if (shouldDelete) {
                    console.log(`[Bridge] Archiving: Deleting record ${payload.id} from Local SQLite`);

                    try {
                        await db.deleteRecord(draftTable, payload.id);
                        await db.deleteRecord(table, payload.id); // Also clear main table if exists

                        // CRITICAL: Insert Notification for WS Clients
                        if (table !== 'fin_notifications') {
                            const notification = {
                                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                company_id: userContext.company_id,
                                branch_id: userContext.branch_id || userContext.default_branch_id,
                                user_id: userContext.user_id,
                                type: 'ENTITY_POSTED',
                                entity_table: table,
                                entity_id: payload.id,
                                message: `New record posted to ${table}`,
                                is_read: false,
                                created_at: new Date().toISOString()
                            };
                            console.log(`[Bridge] Notification: Sending WS Alert for ${table}/${payload.id}`);
                            await db.insert('fin_notifications', notification);
                        }
                    } catch (cleanupErr) {
                        console.warn(`[Bridge] Warning: Failed to cleanup local record ${payload.id}`, cleanupErr);
                    }
                }
            }

            return result;
        } catch (error) {
            this._recordFailure();
            console.error('[Bridge] Engine Request Failed:', error);

            // Log failed post for retry
            await this._logFailedPost(db, table, payload, error.message);

            return {
                ok: false,
                error: {
                    code: 'ENGINE_UNAVAILABLE',
                    message: 'Financial Engine is offline or busy. Your data has been saved for retry.',
                    technical: error.message
                }
            };
        }
    }

    /**
     * Log failed post attempt for future retry
     */
    async _logFailedPost(db, table, payload, errorMessage) {
        try {
            const failedPost = {
                id: crypto.randomUUID(),
                table: table,
                payload: JSON.stringify(payload),
                error: errorMessage,
                retry_count: 0,
                created_at: new Date().toISOString(),
                status: 'PENDING'
            };
            await db.insert('failed_posts', failedPost);
            console.log(`[Bridge] Logged failed post ${failedPost.id} for future retry`);
        } catch (logErr) {
            console.error('[Bridge] Failed to log failed post:', logErr);
        }
    }

    /**
     * Low-level HTTP Client with Authentication
     */
    _sendHttpRequest(jsonBody) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(jsonBody);
            const requestId = crypto.randomUUID();

            const options = {
                hostname: this.engineHost,
                port: this.enginePort,
                path: '/rpc/execute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length,
                    'X-Service-Auth': this.interServiceSecret, // ✅ Inter-Service Authentication
                    'X-Request-ID': requestId,                 // ✅ Request Tracking
                    'X-Service-Name': 'node-gateway'           // ✅ Service Identification
                },
                timeout: this.engineTimeout
            };

            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(responseData));
                        } catch (e) {
                            reject(new Error('Invalid JSON Response from Engine'));
                        }
                    } else {
                        reject(new Error(`Engine HTTP Error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Engine Timeout (${this.engineTimeout}ms)`));
            });

            req.write(data);
            req.end();
        });
    }
}

module.exports = new EngineBridge();
