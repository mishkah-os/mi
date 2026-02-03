import { Pool } from 'pg';
import { readLogFile, discardLogFile, rotateEventLog, listArchivedLogs } from '../eventStore.js';
import logger from '../logger.js';

let eventArchivePool = null;
let eventArchiveTimer = null;
let eventArchiveTableReady = false;

export function createArchiveService({
    listEventStoreContexts,
    EVENT_ARCHIVER_DISABLED,
    EVENTS_PG_URL,
    EVENT_ARCHIVE_INTERVAL_MS = 60000
}) {

    async function ensureEventArchiveTable(pool) {
        if (eventArchiveTableReady) return;
        await pool.query(`
        CREATE TABLE IF NOT EXISTS ws2_event_journal (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          module_id TEXT NOT NULL,
          table_name TEXT,
          action TEXT NOT NULL,
          record JSONB,
          meta JSONB,
          publish_state JSONB,
          created_at TIMESTAMPTZ NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL,
          sequence BIGINT
        )
      `);
        await pool.query(
            'CREATE INDEX IF NOT EXISTS ws2_event_journal_branch_module_idx ON ws2_event_journal (branch_id, module_id, sequence)'
        );
        eventArchiveTableReady = true;
    }

    async function uploadEventArchive(pool, context, filePath) {
        const entries = await readLogFile(filePath);
        if (!entries.length) {
            await discardLogFile(filePath);
            return;
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const insertSql =
                'INSERT INTO ws2_event_journal (id, branch_id, module_id, table_name, action, record, meta, publish_state, created_at, recorded_at, sequence) ' +
                'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ' +
                'ON CONFLICT (id) DO UPDATE SET meta = EXCLUDED.meta, publish_state = EXCLUDED.publish_state, recorded_at = EXCLUDED.recorded_at';
            for (const entry of entries) {
                await client.query(insertSql, [
                    entry.id,
                    entry.branchId || context.branchId,
                    entry.moduleId || context.moduleId,
                    entry.table || null,
                    entry.action || 'module:insert',
                    entry.record || null,
                    entry.meta || {},
                    entry.publishState || {},
                    entry.createdAt ? new Date(entry.createdAt) : new Date(),
                    entry.recordedAt ? new Date(entry.recordedAt) : new Date(),
                    entry.sequence || null
                ]);
            }
            await client.query('COMMIT');
            await discardLogFile(filePath);
            logger.info(
                { branchId: context.branchId, moduleId: context.moduleId, filePath, events: entries.length },
                'Archived event log batch to PostgreSQL'
            );
        } catch (error) {
            await client.query('ROLLBACK').catch(() => { });
            throw error;
        } finally {
            client.release();
        }
    }

    async function runEventArchiveCycle(pool) {
        const contexts = listEventStoreContexts();
        if (!contexts.length) return;
        await ensureEventArchiveTable(pool);
        for (const context of contexts) {
            try {
                await rotateEventLog(context);
            } catch (error) {
                logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId }, 'Failed to rotate event log');
            }
            const archives = await listArchivedLogs(context);
            for (const filePath of archives) {
                try {
                    await uploadEventArchive(pool, context, filePath);
                } catch (error) {
                    logger.warn({ err: error, branchId: context.branchId, moduleId: context.moduleId, filePath }, 'Failed to archive event log');
                }
            }
        }
    }

    async function startEventArchiveService() {
        if (EVENT_ARCHIVER_DISABLED) {
            logger.info('Event archive service disabled via configuration flag');
            return;
        }
        if (!EVENTS_PG_URL) {
            logger.info('Event archive service disabled: PostgreSQL URL missing');
            return;
        }
        if (!eventArchivePool) {
            eventArchivePool = new Pool({ connectionString: EVENTS_PG_URL });
            eventArchivePool.on('error', (err) => {
                logger.warn({ err }, 'PostgreSQL pool error');
            });
        }
        const runCycle = async () => {
            try {
                await runEventArchiveCycle(eventArchivePool);
            } catch (error) {
                logger.warn({ err: error }, 'Event archive cycle failed');
            }
        };
        await runCycle();
        eventArchiveTimer = setInterval(runCycle, EVENT_ARCHIVE_INTERVAL_MS);
        eventArchiveTimer.unref();
        logger.info({ intervalMs: EVENT_ARCHIVE_INTERVAL_MS }, 'Event archive service started');
    }

    function stopEventArchiveService() {
        if (eventArchiveTimer) {
            clearInterval(eventArchiveTimer);
            eventArchiveTimer = null;
        }
        if (eventArchivePool) {
            eventArchivePool.end().catch(() => { });
            eventArchivePool = null;
        }
        eventArchiveTableReady = false;
    }

    return {
        ensureEventArchiveTable,
        uploadEventArchive,
        runEventArchiveCycle,
        startEventArchiveService,
        stopEventArchiveService
    };
}
