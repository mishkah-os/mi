(function (global) {
    'use strict';

    var M = global.Mishkah || {};
    global.Mishkah = M;

    var API_BASE = '/api/v1';
    var DEFAULT_BRANCH = global.MISHKAH_BRANCH || global.BRANCH_ID || 'pt';

    function withBranch(endpoint, options) {
        var branch = (options && options.branch) || DEFAULT_BRANCH;
        if (!branch) return endpoint;

        // Avoid duplicating branch param
        if (endpoint.indexOf('branch=') !== -1) return endpoint;

        var separator = endpoint.indexOf('?') === -1 ? '?' : '&';
        return endpoint + separator + 'branch=' + encodeURIComponent(branch);
    }

    function buildQuery(params) {
        if (!params || typeof params !== 'object') return '';
        var entries = Object.entries(params).filter(function (pair) {
            return pair[1] !== undefined && pair[1] !== null;
        });
        if (!entries.length) return '';
        var query = entries.map(function (pair) {
            return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
        }).join('&');
        return query ? ('?' + query) : '';
    }

    var REST = {
        request: async function (endpoint, method, data, options) {
            options = options || {};
            var headers = Object.assign({
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }, options.headers || {});

            var config = {
                method: method,
                headers: headers
            };

            if (data) {
                config.body = JSON.stringify(data);
            }

            var url = API_BASE + withBranch(endpoint, options);

            try {
                var response = await fetch(url, config);

                if (!response.ok) {
                    var errorData = await response.json().catch(function () { return {}; });
                    throw new Error(errorData.message || ('HTTP ' + response.status));
                }

                return await response.json();
            } catch (error) {
                throw error;
            }
        },

        get: function (url, opts) { return this.request(url, 'GET', null, opts); },
        post: function (url, data, opts) { return this.request(url, 'POST', data, opts); },
        put: function (url, data, opts) { return this.request(url, 'PUT', data, opts); },
        del: function (url, opts) { return this.request(url, 'DELETE', null, opts); },

        repo: function (tableName) {
            var root = '/crud/' + tableName;

            return {
                search: function (params) {
                    var body = Object.assign({}, params || {});
                    var queryParams = {};
                    if (body.q !== undefined) {
                        queryParams.q = body.q;
                    }
                    if (body.withMeta !== undefined) {
                        queryParams.withMeta = body.withMeta;
                    }
                    var qs = buildQuery(queryParams);
                    return REST.post(root + '/search' + qs, body);
                },
                get: function (id, params) {
                    var qs = buildQuery(params);
                    return REST.get(root + '/' + id + qs);
                },
                create: function (data, params) {
                    var qs = buildQuery(params);
                    return REST.post(root + qs, data);
                },
                update: function (id, data, params) {
                    var qs = buildQuery(params);
                    return REST.put(root + '/' + id + qs, data);
                },
                delete: function (id, params) {
                    var qs = buildQuery(params);
                    return REST.del(root + '/' + id + qs);
                }
            };
        },

        system: {
            tables: function () {
                return REST.get('/crud/tables');
            }
        },

        languages: function () {
            return REST.get('/languages');
        },

        rpc: async function (methodName, data, options) {
            options = options || {};
            var headers = Object.assign({
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }, options.headers || {});

            var config = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data || {})
            };

            // RPC Router expects /api/rpc/:method
            // We reuse withBranch logic but apply it manually
            var endpoint = '/api/rpc/' + methodName;
            var branch = (options && options.branch) || DEFAULT_BRANCH;

            // Re-implement withBranch logic locally or expose it?
            // It's private in this closure. let's just implement simple logic.
            if (branch && endpoint.indexOf('branch=') === -1) {
                var separator = endpoint.indexOf('?') === -1 ? '?' : '&';
                endpoint = endpoint + separator + 'branch=' + encodeURIComponent(branch);
            }

            try {
                var response = await fetch(endpoint, config);

                if (!response.ok) {
                    var errorData = await response.json().catch(function () { return {}; });
                    throw new Error(errorData.error || errorData.message || ('HTTP ' + response.status));
                }

                return await response.json();
            } catch (error) {
                throw error;
            }
        }
    };

    M.REST = REST;

})(window);
