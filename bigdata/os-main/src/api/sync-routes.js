import path from 'path';
import { writeFile } from 'fs/promises';
import { fileExists, readBody, readJsonSafe } from '../utils/helpers.js';

function parseTableList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input.map((entry) => String(entry).trim()).filter(Boolean);
    }
    return String(input)
        .split(/[,;\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export async function handleTableSync(req, res, url, { logger, jsonResponse, BRANCH_DOMAINS, BRANCHES_DIR, ensureModuleStore, persistModuleStore }) {
    try {
        const pathParts = url.pathname.split('/').filter(Boolean);
        const branchId = pathParts[2];
        const moduleId = pathParts[4];
        const tableName = pathParts[6];

        const requestedTables = new Set();
        if (tableName) {
            requestedTables.add(String(tableName).trim());
        }
        parseTableList(url.searchParams.get('tables') || url.searchParams.get('table'))
            .forEach((name) => requestedTables.add(name));

        if (req.method === 'POST') {
            try {
                const body = await readBody(req);
                parseTableList(body?.tables || body?.table).forEach((name) => requestedTables.add(name));
            } catch (error) {
                jsonResponse(res, 400, { error: 'invalid-json', message: error.message });
                return;
            }
        }

        const tableList = Array.from(requestedTables).filter(Boolean);
        if (!tableList.length) {
            jsonResponse(res, 400, { error: 'missing-table-name' });
            return;
        }

        logger.info({ branchId, moduleId, tables: tableList }, 'Starting table sync');

        const branchConfig = BRANCH_DOMAINS[branchId];
        if (!branchConfig) {
            jsonResponse(res, 404, {
                error: 'branch-config-not-found',
                branchId,
                message: `No configuration found for branch: ${branchId}`
            });
            return;
        }

        // Fetch remote data
        const sourceUrl = `${branchConfig.domain_url}/api/v6/pos_database_view`;
        const sourceResponse = await fetch(sourceUrl, {
            method: 'GET',
            headers: { 'X-API-KEY': branchConfig.api_key }
        });

        if (!sourceResponse.ok) {
            jsonResponse(res, 502, {
                error: 'source-fetch-failed',
                status: sourceResponse.status,
                message: 'Failed to fetch data from source system'
            });
            return;
        }

        const remoteData = await sourceResponse.json();
        const remoteTables = remoteData.tables && typeof remoteData.tables === 'object' ? remoteData.tables : null;
        if (!remoteTables) {
            jsonResponse(res, 502, {
                error: 'source-data-invalid',
                message: 'Source response missing tables payload'
            });
            return;
        }

        // Load current seeds
        const seedPath = path.join(BRANCHES_DIR, branchId, 'modules', moduleId, 'seeds', 'initial.json');
        let currentSeeds = { tables: {} };
        if (await fileExists(seedPath)) {
            currentSeeds = await readJsonSafe(seedPath);
        }

        const mergedTables = { ...(currentSeeds.tables || {}) };
        const tableResults = [];
        const updatedTables = {};

        for (const name of tableList) {
            const remoteRows = remoteTables[name];
            if (!Array.isArray(remoteRows)) {
                tableResults.push({ table: name, status: 'missing-source' });
                continue;
            }

            const localRows = Array.isArray(mergedTables[name]) ? mergedTables[name] : [];
            const merged = [...localRows];
            const localById = new Map();

            for (let i = 0; i < localRows.length; i++) {
                if (localRows[i]?.id) {
                    localById.set(localRows[i].id, i);
                }
            }

            let updates = 0;
            let inserts = 0;

            for (const remoteRow of remoteRows) {
                if (!remoteRow?.id) continue;

                const localIndex = localById.get(remoteRow.id);
                if (localIndex !== undefined) {
                    merged[localIndex] = { ...remoteRow };
                    updates++;
                } else {
                    merged.push({ ...remoteRow });
                    inserts++;
                }
            }

            mergedTables[name] = merged;
            updatedTables[name] = merged;
            tableResults.push({
                table: name,
                status: 'updated',
                stats: { updates, inserts, total: merged.length, preserved: merged.length - updates - inserts }
            });
        }

        if (!Object.keys(updatedTables).length) {
            jsonResponse(res, 404, {
                error: 'table-not-found-in-source',
                message: 'Requested tables not found in source data',
                results: tableResults
            });
            return;
        }

        // Update seeds file
        const updatedSeeds = {
            ...currentSeeds,
            tables: mergedTables,
            lastTableSync: {
                tables: tableList,
                time: new Date().toISOString(),
                results: tableResults
            }
        };

        await writeFile(seedPath, JSON.stringify(updatedSeeds, null, 2), 'utf8');
        logger.info({ seedPath }, 'Updated seeds file with merged data');

        const updatedTableNames = Object.keys(updatedTables);
        if (updatedTableNames.length) {
            const store = await ensureModuleStore(branchId, moduleId);
            const replacement = {};
            for (const name of updatedTableNames) {
                const rows = updatedTables[name];
                const normalized = [];
                for (const row of rows) {
                    if (!row || typeof row !== 'object') continue;
                    const schemaRecord = store.schemaEngine?.createRecord
                        ? store.schemaEngine.createRecord(name, row, { branchId: store.branchId, moduleId: store.moduleId })
                        : { ...row };
                    const mergedRecord = {
                        ...schemaRecord,
                        ...row,
                        id: schemaRecord.id || row.id,
                        branchId: schemaRecord.branchId || store.branchId,
                        createdAt: schemaRecord.createdAt || row.createdAt,
                        updatedAt: schemaRecord.updatedAt || row.updatedAt
                    };
                    store.initializeRecordVersion(name, mergedRecord);
                    normalized.push(mergedRecord);
                }
                replacement[name] = normalized;
            }
            store.restoreTables(replacement, { mode: 'replace' });
            await persistModuleStore(store);
        }

        logger.info({ branchId, moduleId, tables: tableList }, 'Table sync completed');

        jsonResponse(res, 200, {
            success: true,
            message: 'Table sync completed',
            results: tableResults
        });
        return;

    } catch (error) {
        logger.error({ err: error }, 'Table sync failed');
        jsonResponse(res, 500, {
            error: 'sync-failed',
            message: error.message
        });
        return;
    }
}
