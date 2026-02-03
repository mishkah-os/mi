(function (w) {
    'use strict';

    // Ensure Dependencies
    if (!w.createDB) {
        console.error('[MishkahFirebase] Critical: mishkah.simple-store.js not loaded.');
        return;
    }

    class MishkahFirebaseAdapter {
        constructor() {
            this.config = {
                apiBase: '/api',
                branchId: null,
                moduleId: null
            };
            this.db = null;
            this.schemaRegistry = null;
            this._ready = false;
            this._onReadyCallbacks = [];
        }

        /**
         * Initialize the connection to Mishkah Store
         * @param {Object} config { branchId, moduleId, schema? }
         */
        async init(config) {
            this.config = { ...this.config, ...config };

            // Use createDBAuto if schema is provided, else createDB
            // This handles the WebSocket + IndexedDB connection standard
            if (config.schema) {
                this.db = w.createDBAuto(config.schema, [], {
                    branchId: config.branchId,
                    moduleId: config.moduleId,
                    autoConnect: true,
                    smartFetch: true // Use standard REST fetch for initial seed
                });
            } else {
                this.db = w.createDB({
                    branchId: config.branchId,
                    moduleId: config.moduleId,
                    autoConnect: true,
                    smartFetch: true
                });
            }

            // Wait for connection
            await this.db.connect();
            this._ready = true;
            this._onReadyCallbacks.forEach(cb => cb());
            console.log('[MishkahFirebase] Connected via Mishkah Store');
            return this;
        }

        /**
         * Load schema from standard API endpoint and re-init DB
         */
        async loadSchema(moduleName) {
            // In the standard pattern, we might fetch schema JSON then init the DB
            // Or rely on the smartFetch of createDB to get data. 
            // If strict validation is needed, we fetch schema first.

            // For this implementation, we assume loadSchema fetches the JSON 
            // then upgrades the DB instance to "Auto" mode with definitions.

            try {
                // Using the standard convention:
                const branchId = this.db?.config?.branchId || this.config.branchId || 'default';
                const url = `${this.config.apiBase}/schema?branch=${branchId}&module=${moduleName}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Schema fetch failed');
                const data = await res.json();
                const schema = data.schema || data;

                // Re-initialize DB with schema awareness
                this.db = w.createDBAuto(schema, [], {
                    branchId: branchId,
                    moduleId: moduleName,
                    autoConnect: true
                });
                await this.db.connect();
                return schema;
            } catch (e) {
                console.error('[MishkahFirebase] Schema load error:', e);
                throw e;
            }
        }

        /**
         * Firebase-like Collection Reference
         * @param {string} collectionPath (tableName)
         */
        collection(collectionPath) {
            if (!this.db) throw new Error('MishkahFirebase not initialized');

            const tableName = collectionPath;

            return {
                // snapshot listener (realtime)
                onSnapshot: (callback) => {
                    // db.watch returns an unsubscribe function
                    return this.db.watch(tableName, (rows) => {
                        callback(rows);
                    });
                },

                // One-time fetch (from local cache/store)
                get: async () => {
                    return this.db.list(tableName);
                },

                // Add Record
                add: async (data, meta) => {
                    // In Mishkah Store, insert returns the result
                    // If ID is not present, it is auto-generated
                    return this.db.insert(tableName, data, meta);
                },

                // Helper for specific doc operations
                doc: (id) => {
                    return {
                        update: async (updates) => {
                            // In Mishkah Store, update merges by ID usually, 
                            // ensuring the ID is present
                            return this.db.update(tableName, { ...updates, id });
                        },
                        delete: async () => {
                            return this.db.delete(tableName, { id });
                        },
                        get: async () => {
                            // Basic find in local list
                            const list = this.db.list(tableName);
                            return list.find(r => r.id === id);
                        },
                        // Firebase set() = upsert behavior
                        // Server decides insert vs update based on ID existence
                        set: async (data, options) => {
                            // Always use save() - server handles the logic
                            return this.db.save(tableName, { ...data, id });
                        }
                    };
                }
            };
        }
    }

    w.MishkahFirebase = new MishkahFirebaseAdapter();

})(window);
