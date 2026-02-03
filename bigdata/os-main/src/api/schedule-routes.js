/**
 * Schedule Routes - Scheduled Orders API Endpoints
 * Handles creation, listing, confirmation, and cancellation of scheduled orders
 */

import { createId, safeJsonParse } from '../utils.js';
import { getDatabase } from '../database/sqlite-ops.js';

function normalizeText(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'object') {
        const localized = value.ar || value.en;
        if (typeof localized === 'string') return localized;
        return JSON.stringify(value);
    }
    return String(value);
}

function normalizeNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function loadSchedulesFromSqlite(branchId, moduleId, { status, from, to } = {}) {
    const db = getDatabase({ branchId, moduleId });
    const params = [branchId, moduleId];
    let query = 'SELECT * FROM order_schedule WHERE branch_id = ? AND module_id = ?';

    if (status) {
        query += ' AND status = ?';
        params.push(status);
    }
    if (from) {
        query += ' AND scheduled_at >= ?';
        params.push(from);
    }
    if (to) {
        query += ' AND scheduled_at <= ?';
        params.push(to);
    }
    query += ' ORDER BY scheduled_at ASC';

    const schedules = db.prepare(query).all(...params);
    return schedules.map((schedule) => {
        const scheduleId = schedule.id;
        const scheduleTables = db
            .prepare('SELECT table_id FROM order_schedule_tables WHERE schedule_id = ?')
            .all(scheduleId);
        const paymentRecords = db
            .prepare('SELECT method_id, amount, created_at FROM order_schedule_payment WHERE schedule_id = ?')
            .all(scheduleId);
        const scheduleLines = db
            .prepare('SELECT * FROM order_schedule_line WHERE schedule_id = ? ORDER BY created_at')
            .all(scheduleId);

        let customer = null;
        try {
            customer = db
                .prepare('SELECT * FROM customer_profiles WHERE customer_id = ?')
                .get(schedule.customer_id);
        } catch (_err) {
            // ignore missing table
        }

        const payload = schedule.payload ? safeJsonParse(schedule.payload) || {} : {};
        return {
            ...schedule,
            tableIds: scheduleTables.map((t) => t.table_id),
            payments: paymentRecords.map((p) => ({
                method_id: p.method_id,
                amount: p.amount,
                created_at: p.created_at
            })),
            lines: scheduleLines.length ? scheduleLines : (payload.lines || []),
            customerName: customer?.customer_name,
            customerPhone: customer?.phone,
            payload
        };
    });
}

export async function handleScheduleApi(req, res, url, deps) {
    const { logger, jsonResponse, readBody, moduleStoreManager } = deps;
    const parts = url.pathname.split('/').filter(Boolean);
    // Expected modules: api/branches/:branchId/modules/:moduleId/schedule...
    // parts[0]=api, parts[1]=branches, parts[2]=branchId, parts[3]=modules, parts[4]=moduleId, parts[5]=schedule

    if (parts.length < 6 || parts[5] !== 'schedule') {
        return false;
    }

    const branchId = parts[2];
    const moduleId = parts[4];
    const scheduleId = parts[6]; // Optional
    const action = parts[7]; // Optional (e.g., 'confirm')

    let store;
    try {
        store = await moduleStoreManager.ensureModuleStore(branchId, moduleId);
    } catch (error) {
        logger.warn({ branchId, moduleId, error: error.message }, 'Failed to load schedule module store');
        jsonResponse(res, 500, {
            success: false,
            error: 'Module Load Failed',
            message: `Could not load module "${moduleId}" for branch "${branchId}". invalid module config.`,
            details: error.message
        });
        return true;
    }

    if (!store) {
        jsonResponse(res, 404, {
            success: false,
            error: 'Module not found',
            message: 'Store initialization returned null'
        });
        return true;
    }

    try {
        // LIST
        if (req.method === 'GET' && !scheduleId) {
            const status = url.searchParams.get('status');
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');

            const allSchedules = store.listTable('order_schedule');
            let filteredSchedules = allSchedules;

            if (status) {
                filteredSchedules = filteredSchedules.filter(s => s.status === status);
            }

            if (from) {
                const fromDate = new Date(from);
                filteredSchedules = filteredSchedules.filter(s => {
                    const scheduledAt = s.scheduledAt || s.scheduled_at;
                    return scheduledAt && new Date(scheduledAt) >= fromDate;
                });
            }

            if (to) {
                const toDate = new Date(to);
                filteredSchedules = filteredSchedules.filter(s => {
                    const scheduledAt = s.scheduledAt || s.scheduled_at;
                    return scheduledAt && new Date(scheduledAt) <= toDate;
                });
            }

            // Sort ASC
            filteredSchedules.sort((a, b) => {
                const aDate = a.scheduledAt || a.scheduled_at;
                const bDate = b.scheduledAt || b.scheduled_at;
                return new Date(aDate || 0) - new Date(bDate || 0);
            });

            // Fetch related data
            const enrichedSchedules = filteredSchedules.map((schedule) => {
                const scheduleTables = store.listTable('order_schedule_tables').filter(t => (t.scheduleId || t.schedule_id) === schedule.id);
                const paymentRecords = store.listTable('order_schedule_payment').filter(p => (p.scheduleId || p.schedule_id) === schedule.id);
                const scheduleLines = store.listTable('order_schedule_line').filter(l => (l.scheduleId || l.schedule_id) === schedule.id);

                // For customer, we might need to access a shared store or same store if customer_profiles is in it
                // Assuming customer_profiles is in the same module or we skip detail lookup for now to be safe
                // Or better: try to find it in the current store
                let customer = null;
                try {
                    const customers = store.listTable('customer_profiles');
                    customer = customers.find(c => c.customer_id === schedule.customer_id);
                } catch (e) {
                    // Ignore if table missing
                }

                const parsedPayload =
                    typeof schedule.payload === 'string'
                        ? safeJsonParse(schedule.payload) || {}
                        : (schedule.payload || {});
                const resolvedLines = scheduleLines.length ? scheduleLines : (parsedPayload.lines || []);

                return {
                    ...schedule,
                    tableIds: scheduleTables.map(t => t.tableId || t.table_id),
                    payments: paymentRecords.map(p => ({
                        method_id: p.methodId || p.method_id,
                        amount: p.amount,
                        created_at: p.createdAt || p.created_at
                    })),
                    lines: resolvedLines,
                    customerName: customer?.customer_name,
                    customerPhone: customer?.phone,
                    payload: parsedPayload
                };
            });

            const fallbackSchedules = !enrichedSchedules.length
                ? loadSchedulesFromSqlite(branchId, moduleId, { status, from, to })
                : null;
            const schedules = fallbackSchedules && fallbackSchedules.length ? fallbackSchedules : enrichedSchedules;

            jsonResponse(res, 200, {
                success: true,
                schedules
            });
            return true;
        }

        // CREATE
        if (req.method === 'POST' && !scheduleId) {
            let body;
            try {
                body = await readBody(req);
            } catch (e) {
                jsonResponse(res, 400, { success: false, error: 'Invalid JSON' });
                return true;
            }

            const {
                customerId,
                orderType = 'dine_in',
                scheduledAt,
                duration = 60,
                tableIds = [],
                lines = [],
                totals = {},
                discount = null,
                payments = [],
                notes = ''
            } = body;

            // Validation
            if (!customerId) {
                jsonResponse(res, 400, { success: false, error: 'Customer ID is required' });
                return true;
            }
            if (!scheduledAt) {
                jsonResponse(res, 400, { success: false, error: 'Scheduled time is required' });
                return true;
            }

            const scheduledDate = new Date(scheduledAt);
            // Allow past mainly for dev/testing, or handle policy later

            if (orderType === 'dine_in' && tableIds.length === 0) {
                jsonResponse(res, 400, { success: false, error: 'Tables required for dine_in' });
                return true;
            }
            if (lines.length === 0) {
                jsonResponse(res, 400, { success: false, error: 'Order must contain items' });
                return true;
            }

            const random = Math.random().toString(36).substr(2, 6).toUpperCase();
            const newScheduleId = `SCH-${branchId.toUpperCase()}-${random}`;
            const endsAt = new Date(scheduledDate.getTime() + (duration * 60 * 1000));
            const normalizedLines = lines.map((line) => {
                const quantity = normalizeNumber(line.quantity ?? line.qty, 1);
                const unitPrice = normalizeNumber(line.unitPrice ?? line.unit_price ?? line.price, 0);
                return {
                    itemId: line.itemId || line.item_id || null,
                    itemName: normalizeText(line.itemName || line.item_name || line.name, ''),
                    quantity,
                    unitPrice,
                    lineTotal: normalizeNumber(line.lineTotal ?? line.line_total, quantity * unitPrice),
                    notes: normalizeText(line.notes, '')
                };
            });
            // 1. Generate Sequence Number
            let sequenceNumber = null;
            let formattedId = null;

            if (deps.sequenceManager) {
                try {
                    // Try to allocate a persistent human-readable ID
                    // Using 'order_schedule' table and 'id' field as defined in sequence-rules.json
                    const allocation = await deps.sequenceManager.nextValue(branchId, moduleId, 'order_schedule', 'id');
                    if (allocation) {
                        sequenceNumber = allocation.value;
                        formattedId = allocation.formatted; // e.g., DAR-SCH-1001
                    }
                } catch (seqErr) {
                    logger.warn({ err: seqErr, branchId, moduleId }, 'Failed to generate schedule sequence');
                    // Fallback to random if sequence generation fails
                }
            }

            // Use the formatted ID if available, otherwise fallback to the random ID
            // User requested "readable serial number" to be the main identifier if possible
            const finalScheduleId = formattedId || newScheduleId;

            // 2. Prepare Payload
            const payload = {
                lines: normalizedLines,
                totals,
                discount,
                sequenceNumber, // Persist sequence number raw value
                uuid: newScheduleId // Keep the random UUID in metadata as requested ("uuid in background")
            };

            const scheduleRecord = {
                id: finalScheduleId,
                branch_id: branchId,
                module_id: moduleId,
                customer_id: customerId,
                order_type: orderType,
                scheduled_at: scheduledDate.toISOString(),
                duration_minutes: duration,
                ends_at: endsAt.toISOString(),
                status: 'pending',
                payload: JSON.stringify(payload),
                notes: normalizeText(notes, ''),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 4. Save Header using Event System (Ensures Persistence + Sync + WebSocket)
            const headerResult = await deps.posEngine.applyModuleMutation(
                branchId,
                moduleId,
                'order_schedule',
                'module:save',
                scheduleRecord,
                { source: 'api:schedule' }
            );

            // Update newScheduleId reference for child records to use the Final ID
            const parentId = finalScheduleId;

            // 5. Save Tables
            if (tableIds.length > 0) {
                for (const tableId of tableIds) {
                    await deps.posEngine.applyModuleMutation(
                        branchId,
                        moduleId,
                        'order_schedule_tables',
                        'module:save',
                        {
                            id: `${parentId}-TBL-${tableId}`,
                            branch_id: branchId,
                            module_id: moduleId,
                            schedule_id: parentId,
                            table_id: tableId
                        },
                        { source: 'api:schedule' }
                    );
                }
            }

            // 6. Save Lines
            for (const line of normalizedLines) {
                const lineId = `${parentId}-LN-${createId('line')}`;
                await deps.posEngine.applyModuleMutation(
                    branchId,
                    moduleId,
                    'order_schedule_line',
                    'module:save',
                    {
                        id: lineId,
                        schedule_id: parentId,
                        item_id: line.itemId,
                        item_name: line.itemName,
                        quantity: line.quantity,
                        unit_price: line.unitPrice,
                        line_total: line.lineTotal,
                        notes: line.notes,
                        created_at: new Date().toISOString()
                    },
                    { source: 'api:schedule' }
                );
            }

            // 7. Save Payments
            if (payments.length > 0) {
                for (const payment of payments) {
                    await deps.posEngine.applyModuleMutation(
                        branchId,
                        moduleId,
                        'order_schedule_payment',
                        'module:save',
                        {
                            id: `${parentId}-PAY-${Math.random().toString(36).substr(2, 9)}`,
                            branch_id: branchId,
                            module_id: moduleId,
                            schedule_id: parentId,
                            method_id: payment.methodId,
                            amount: normalizeNumber(payment.amount, 0),
                            created_at: new Date().toISOString()
                        },
                        { source: 'api:schedule' }
                    );
                }
            }

            deps.jsonResponse(res, 200, {
                success: true,
                scheduleId: parentId,
                message: 'Scheduled order created'
            });
            return true;
        }

        // CONFIRM
        if (req.method === 'POST' && scheduleId && action === 'confirm') {
            const schedules = store.listTable('order_schedule');
            const schedule = schedules.find(s => s.id === scheduleId);

            if (!schedule) {
                jsonResponse(res, 404, { success: false, error: 'Schedule not found' });
                return true;
            }
            if (schedule.status === 'converted') {
                jsonResponse(res, 400, { success: false, error: 'Already confirmed' });
                return true;
            }

            const payload =
                typeof schedule.payload === 'string'
                    ? safeJsonParse(schedule.payload) || {}
                    : (schedule.payload || {});
            const { lines = [], totals = {}, discount = null } = payload;

            const scheduleTables = store.listTable('order_schedule_tables').filter(t => (t.scheduleId || t.schedule_id) === scheduleId);
            const tableIdList = scheduleTables.map(t => t.tableId || t.table_id);

            const schedulePayments = store.listTable('order_schedule_payment').filter(p => (p.scheduleId || p.schedule_id) === scheduleId);
            const scheduleLines = store.listTable('order_schedule_line').filter(l => (l.scheduleId || l.schedule_id) === scheduleId);
            const resolvedLines = scheduleLines.length ? scheduleLines : lines;

            // Generate Order ID
            const orderSeq = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
            const orderId = `${branchId.toUpperCase()}-${orderSeq}`;
            const now = new Date().toISOString();

            const orderHeader = {
                order_id: orderId, // Assuming order_header uses order_id or id, adjust based on schema
                id: orderId,       // Fallback
                customer_id: schedule.customerId || schedule.customer_id,
                order_type: schedule.type || schedule.order_type,
                status: 'open',
                fulfillment_stage: 'new',
                table_ids: JSON.stringify(tableIdList),
                notes: schedule.notes,
                subtotal: totals.subtotal || 0,
                tax_amount: totals.vat || 0,
                service_amount: totals.service || 0,
                discount_amount: totals.discount || 0,
                total_due: totals.due || 0,
                created_at: now,
                updated_at: now,
                source_schedule_id: scheduleId
            };

            store.insert('order_header', orderHeader);

            for (let i = 0; i < resolvedLines.length; i++) {
                const line = resolvedLines[i];
                const quantity = normalizeNumber(line.quantity ?? line.qty, 1);
                const unitPrice = normalizeNumber(line.unitPrice ?? line.unit_price ?? line.price, 0);
                const total = normalizeNumber(line.lineTotal ?? line.line_total, quantity * unitPrice);
                store.insert('order_line', {
                    id: `${orderId}-LINE-${i + 1}`,
                    orderId,
                    itemId: line.itemId || line.item_id,
                    quantity,
                    unitPrice,
                    total,
                    notes: normalizeText(line.notes, '')
                });
            }

            for (const payment of schedulePayments) {
                store.insert('order_payment', {
                    id: `${orderId}-PAY-${Math.random().toString(36).substr(2, 9)}`,
                    orderId,
                    paymentMethodId: payment.methodId || payment.method_id,
                    amount: normalizeNumber(payment.amount, 0),
                    capturedAt: payment.createdAt || payment.created_at
                });
            }

            // Update schedule status
            store.updateRecord('order_schedule', {
                id: scheduleId, // Key for update
                status: 'converted',
                updated_at: now,
                payload: JSON.stringify({
                    ...payload,
                    convertedOrderId: orderId,
                    convertedAt: now
                })
            });

            jsonResponse(res, 200, {
                success: true,
                orderId,
                message: 'Schedule confirmed and converted'
            });
            return true;
        }

        // DELETE
        if (req.method === 'DELETE' && scheduleId) {
            const schedules = store.listTable('order_schedule');
            const schedule = schedules.find(s => s.id === scheduleId);

            if (!schedule) {
                jsonResponse(res, 404, { success: false, error: 'Schedule not found' });
                return true;
            }

            store.updateRecord('order_schedule', {
                id: scheduleId,
                status: 'cancelled',
                updated_at: new Date().toISOString()
            });

            jsonResponse(res, 200, { success: true, message: 'Schedule cancelled' });
            return true;
        }

    } catch (error) {
        logger.error({ err: error, url: url.pathname }, 'Schedule API Error');
        jsonResponse(res, 500, {
            success: false,
            error: 'Internal Server Error',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
        return true;
    }

    return false;
}
