/**
 * Mishkah Firebase Adapter
 *
 * A compatibility layer that allows writing data using Firebase syntax
 * while strictly enforcing Mishkah's relational schema and "Separation of Powers".
 *
 * usage:
 *   firebase.initializeApp({ branchId: '...', moduleId: '...' });
 *   const db = firebase.database();
 *   db.ref('users').push({ name: 'Ali' });
 */
(function (global) {
    'use strict';

    // Ensure dependencies
    const MishkahSimpleDB = global.createDB || (global.Mishkah && global.Mishkah.createDB);
    if (!MishkahSimpleDB) {
        console.warn('[Mishkah Firebase] Mishkah Simple Store (createDB) not found. Adapter slightly crippled.');
    }

    // =========================================================================
    // 1. Core Classes
    // =========================================================================

    class DataSnapshot {
        constructor(key, value, exists) {
            this._key = key;
            this._value = value;
            this._exists = exists;
        }

        val() {
            return this._value;
        }

        exists() {
            return this._exists;
        }

        get key() {
            return this._key;
        }

        forEach(callback) {
            if (!this._value || typeof this._value !== 'object') return false;

            // Handle Arrays (List of records from 'table' ref)
            if (Array.isArray(this._value)) {
                for (let i = 0; i < this._value.length; i++) {
                    const item = this._value[i];
                    // Use ID or index as key
                    const itemKey = item.id || item.key || String(i);
                    const canceled = callback(new DataSnapshot(itemKey, item, true));
                    if (canceled === true) return true;
                }
                return false;
            }

            // Handle Objects (Single record fields)
            const keys = Object.keys(this._value);
            for (const key of keys) {
                const canceled = callback(new DataSnapshot(key, this._value[key], true));
                if (canceled === true) return true;
            }
            return false;
        }
    }

    class DatabaseReference {
        constructor(db, path) {
            this.db = db;
            this.path = path || '';
            this.parts = this.path.split('/').filter(Boolean);
            this.tableName = this.parts[0] || null;
            this.recordId = this.parts[1] || null;
            this.fieldName = this.parts[2] || null;
        }

        // --- Navigation ---

        child(path) {
            const newPath = this.path ? `${this.path}/${path}` : path;
            return new DatabaseReference(this.db, newPath);
        }

        get key() {
            return this.parts[this.parts.length - 1] || null;
        }

        get parent() {
            if (!this.parts.length) return null;
            const parentPath = this.parts.slice(0, -1).join('/');
            return new DatabaseReference(this.db, parentPath);
        }

        get root() {
            return new DatabaseReference(this.db, '');
        }

        // --- Query Builders ---

        orderByChild(childKey) {
            return new DatabaseQuery(this.db, this.path, { orderBy: { type: 'child', key: childKey } });
        }

        orderByKey() {
            return new DatabaseQuery(this.db, this.path, { orderBy: { type: 'key' } });
        }

        orderByValue() {
            return new DatabaseQuery(this.db, this.path, { orderBy: { type: 'value' } });
        }

        equalTo(value) {
            return new DatabaseQuery(this.db, this.path, { equalTo: value });
        }

        startAt(value) {
            return new DatabaseQuery(this.db, this.path, { startAt: value });
        }

        endAt(value) {
            return new DatabaseQuery(this.db, this.path, { endAt: value });
        }

        limitToFirst(count) {
            return new DatabaseQuery(this.db, this.path, { limitToFirst: count });
        }

        limitToLast(count) {
            return new DatabaseQuery(this.db, this.path, { limitToLast: count });
        }

        // --- Strict Validation ---

        _validateWrite(operation) {
            if (!this.tableName) throw new Error(`[Mishkah Firebase] ${operation} failed: No table specified.`);
            // Strict Mode: Block deep path writes (depth > 3) to prevent schema pollution
            // table/id/field/subfield -> Blocked, unless we implement JSON field patching logic later.
            if (this.parts.length > 3) {
                throw new Error(`[Mishkah Firebase] ${operation} rejected: Path too deep (${this.path}). Mishkah allows max depth of 3 (Table -> Record -> Field).`);
            }
        }

        // --- WRITE Operations ---

        async set(value) {
            this._validateWrite('set');
            await this.db._waitForConnection();

            // Case 1: ref('table').set(...) -> DANGEROUS / BLOCKED
            // We don't want to overwrite an entire table.
            if (this.parts.length === 1) {
                throw new Error(`[Mishkah Firebase] set() on table root '${this.tableName}' is blocked for safety. Use push() to add records.`);
            }

            // Case 2: ref('table/id').set(record) -> Update or Insert Record
            if (this.parts.length === 2 && this.recordId) {
                // We treat .set() on a record ID as an UPSERT via merge strategy
                // This preserves other fields not mentioned (unlike strict Firebase set which replaces)
                // To strictly replace, we'd need a different Store API. Using merge is safer for now.
                const payload = { ...value, id: this.recordId };
                return this.db._store.update(this.tableName, payload);
            }

            // Case 3: ref('table/id/field').set(value) -> Patch single field
            if (this.parts.length === 3 && this.recordId && this.fieldName) {
                const payload = { id: this.recordId, [this.fieldName]: value };
                return this.db._store.update(this.tableName, payload);
            }
        }

        async update(values) {
            this._validateWrite('update');
            await this.db._waitForConnection();

            // Case 1: ref('table/id').update({ field: val })
            if (this.parts.length === 2 && this.recordId) {
                const payload = { ...values, id: this.recordId };
                return this.db._store.update(this.tableName, payload);
            }

            // Case 2: ref('table').update({ id1: val1, id2: val2 }) -> Multi-record update
            if (this.parts.length === 1) {
                const promises = Object.entries(values).map(([key, val]) => {
                    return this.db._store.update(this.tableName, { ...val, id: key });
                });
                return Promise.all(promises);
            }

            throw new Error(`[Mishkah Firebase] update() called on unsupported path: ${this.path}`);
        }

        async push(value) {
            this._validateWrite('push');
            await this.db._waitForConnection();

            // Case 1: ref('table').push(record) -> Insert new record
            if (this.parts.length === 1) {
                // Generate ID via Store
                const result = await this.db._store.insert(this.tableName, value);
                // Firebase push returns a 'ThenableReference' which works as a promise + reference
                // We'll mimic the basic need: return a ref to the new ID
                const newId = result.record?.id || result.id || 'unknown'; // Mishkah store returns { record: ... } or just ack
                const newRef = this.child(newId);
                // Attach promise behavior to ref (simplified)
                newRef.then = (cb) => Promise.resolve(newRef).then(cb);
                return newRef;
            }

            throw new Error(`[Mishkah Firebase] push() only allowed on Table Level (e.g. ref('users')).`);
        }

        async remove() {
            this._validateWrite('remove');
            await this.db._waitForConnection();

            // Case 1: ref('table/id').remove() -> Delete record
            if (this.parts.length === 2 && this.recordId) {
                return this.db._store.delete(this.tableName, { id: this.recordId });
            }

            throw new Error(`[Mishkah Firebase] remove() only allowed on Record Level (e.g. ref('users/123')).`);
        }

        // --- READ Operations ---

        on(eventType, callback, cancelCallback) {
            if (eventType !== 'value') {
                console.warn(`[Mishkah Firebase] Event type '${eventType}' not fully supported. Using 'value'.`);
            }

            const listenerId = this.db._registerListener(eventType, this.path, callback, cancelCallback);

            const unsubscribe = this.db._store.watch(this.tableName, (rows) => {
                let val = rows;
                let exists = Array.isArray(rows) ? rows.length > 0 : !!rows;

                if (this.recordId) {
                    const record = Array.isArray(rows)
                        ? rows.find(r => String(r.id) === String(this.recordId))
                        : rows;
                    val = record || null;
                    exists = !!record;

                    if (this.fieldName && record) {
                        val = record[this.fieldName];
                        exists = val !== undefined;
                    }
                }

                const snapshot = new DataSnapshot(this.path.split('/').pop(), val, exists);
                try {
                    callback(snapshot);
                } catch (err) {
                    if (typeof cancelCallback === 'function') cancelCallback(err);
                }
            });

            this.db._bindUnsubscribe(listenerId, unsubscribe);
            return unsubscribe;
        }

        once(eventType) {
            return new Promise((resolve, reject) => {
                const unsub = this.on(eventType, (snapshot) => {
                    unsub();
                    resolve(snapshot);
                }, reject);
            });
        }

        get() {
            return this.once('value');
        }

        off(eventType, callback) {
            this.db._unregisterListener(eventType, this.path, callback);
        }
    }

    class DatabaseQuery extends DatabaseReference {
        constructor(db, path, query = {}) {
            super(db, path);
            this.query = query;
        }

        _clone(next) {
            const merged = Object.assign({}, this.query, next);
            return new DatabaseQuery(this.db, this.path, merged);
        }

        orderByChild(childKey) { return this._clone({ orderBy: { type: 'child', key: childKey } }); }
        orderByKey() { return this._clone({ orderBy: { type: 'key' } }); }
        orderByValue() { return this._clone({ orderBy: { type: 'value' } }); }
        equalTo(value) { return this._clone({ equalTo: value }); }
        startAt(value) { return this._clone({ startAt: value }); }
        endAt(value) { return this._clone({ endAt: value }); }
        limitToFirst(count) { return this._clone({ limitToFirst: count }); }
        limitToLast(count) { return this._clone({ limitToLast: count }); }

        _applyQuery(rows) {
            let list = Array.isArray(rows) ? rows.slice() : [];
            const q = this.query;

            if (q.orderBy) {
                const { type, key } = q.orderBy;
                list.sort((a, b) => {
                    if (type === 'key') return String(a.id || a.key || '').localeCompare(String(b.id || b.key || ''));
                    if (type === 'value') return String(a).localeCompare(String(b));
                    const av = a ? a[key] : undefined;
                    const bv = b ? b[key] : undefined;
                    return String(av || '').localeCompare(String(bv || ''));
                });
            }

            if (q.startAt !== undefined) {
                list = list.filter(item => {
                    const value = this._valueForQuery(item);
                    return value >= q.startAt;
                });
            }

            if (q.endAt !== undefined) {
                list = list.filter(item => {
                    const value = this._valueForQuery(item);
                    return value <= q.endAt;
                });
            }

            if (q.equalTo !== undefined) {
                list = list.filter(item => this._valueForQuery(item) === q.equalTo);
            }

            if (q.limitToFirst !== undefined) {
                list = list.slice(0, q.limitToFirst);
            }

            if (q.limitToLast !== undefined) {
                list = list.slice(Math.max(list.length - q.limitToLast, 0));
            }

            return list;
        }

        _valueForQuery(item) {
            if (!this.query.orderBy || this.query.orderBy.type === 'value') return item;
            if (this.query.orderBy.type === 'key') return item && (item.id || item.key);
            return item && item[this.query.orderBy.key];
        }

        on(eventType, callback, cancelCallback) {
            if (!this.tableName) return () => {};

            if (eventType !== 'value') {
                console.warn(`[Mishkah Firebase] Event type '${eventType}' not fully supported. Using 'value'.`);
            }

            const listenerId = this.db._registerListener(eventType, this.path, callback, cancelCallback, this.query);

            const unsubscribe = this.db._store.watch(this.tableName, (rows) => {
                const filtered = this._applyQuery(rows || []);
                const snapshot = new DataSnapshot(this.path.split('/').pop(), filtered, filtered.length > 0);
                try {
                    callback(snapshot);
                } catch (err) {
                    if (typeof cancelCallback === 'function') cancelCallback(err);
                }
            });

            this.db._bindUnsubscribe(listenerId, unsubscribe);
            return unsubscribe;
        }

        once(eventType) {
            return new Promise((resolve, reject) => {
                const unsub = this.on(eventType, (snapshot) => {
                    unsub();
                    resolve(snapshot);
                }, reject);
            });
        }

        get() {
            return this.once('value');
        }
    }

    class Database {
        constructor(config) {
            this.config = config;
            // Initialize Mishkah Simple Store
            // We disable autoConnect so we can wait for connection
            this._store = global.createDB({
                branchId: config.branchId,
                moduleId: config.moduleId,
                lang: config.lang, // Enables Auto-Flattening in Simple Store
                autoConnect: false, // We handle connection
                smartFetch: config.smartFetch !== false,
                useIndexedDB: true
            });
            console.log('[Mishkah Firebase] Database initialized for', config.branchId, '/', config.moduleId);

            this._connected = false;
            this._connectPromise = this._store.connect().then(() => {
                this._connected = true;
                console.log('[Mishkah Firebase] Connected.');
            }).catch(err => {
                console.error('[Mishkah Firebase] Connection failed:', err);
            });

            this._listenerRegistry = {};
        }

        // Helper to ensure connection is ready before writes
        async _waitForConnection() {
            if (this._connected) return;
            if (this._connectPromise) {
                try {
                    await this._connectPromise;
                } catch (e) {
                    // Ignore error here, let the operation fail naturally if socket is dead
                }
            }
        }

        ref(path) {
            return new DatabaseReference(this, path);
        }

        _listenerKey(eventType, path, callback, query) {
            const cbId = callback ? (callback.__mid || (callback.__mid = Math.random().toString(36).slice(2))) : 'all';
            const queryKey = query ? JSON.stringify(query) : 'plain';
            return `${eventType || 'value'}::${path || ''}::${cbId}::${queryKey}`;
        }

        _registerListener(eventType, path, callback, cancelCallback, query) {
            const key = this._listenerKey(eventType, path, callback, query);
            this._listenerRegistry[key] = { callback, cancelCallback };
            return key;
        }

        _bindUnsubscribe(listenerId, unsubscribe) {
            if (listenerId && this._listenerRegistry[listenerId]) {
                this._listenerRegistry[listenerId].unsubscribe = unsubscribe;
            }
        }

        _unregisterListener(eventType, path, callback) {
            const keys = Object.keys(this._listenerRegistry);
            keys.forEach((key) => {
                const entry = this._listenerRegistry[key];
                const matchesPath = path ? key.indexOf(`::${path}::`) !== -1 : true;
                const matchesEvent = eventType ? key.startsWith(`${eventType}::`) : true;
                const matchesCb = callback ? entry.callback === callback : true;

                if (matchesPath && matchesEvent && matchesCb) {
                    if (typeof entry.unsubscribe === 'function') {
                        try { entry.unsubscribe(); } catch (err) { console.warn('[Mishkah Firebase] off() unsubscribe failed', err); }
                    }
                    delete this._listenerRegistry[key];
                }
            });
        }
    }

    // =========================================================================
    // 2. Main App Instance
    // =========================================================================

    const firebase = {
        _dbInstance: null,

        initializeApp: function (config) {
            if (this._dbInstance) {
                console.warn('[Mishkah Firebase] App already initialized. Ignoring.');
                return;
            }
            this._dbInstance = new Database(config);
        },

        database: function () {
            if (!this._dbInstance) {
                throw new Error('[Mishkah Firebase] Must call initializeApp() first.');
            }
            return this._dbInstance;
        }
    };

    // Expose globally
    global.firebase = firebase;

})(window);
