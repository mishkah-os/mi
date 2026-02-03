/**
 * runtime/pos-engine.js
 * POS Order Processing and Synchronization Engine
 */

import crypto from 'crypto';
import { deepClone, createId, nowIso } from '../utils.js';
import { ensureArray } from '../records.js';
import logger from '../logger.js';
import {
    mergePosPayload, normalizeIncomingOrder, buildAckOrder
} from './pos-normalization.js';
import {
    toIsoTimestamp, snapshotsEqual
} from './sync-state.js';

export function createPosEngine({
    ensureModuleStore,
    handleModuleEvent,
    ensureSyncState,
    applySyncSnapshot,
    sequenceManager
}) {

    // ✅ CLAUDE FIX: Global map to track in-flight save operations
    const SAVE_IN_PROGRESS = new Map();

    async function applyModuleMutation(branchId, moduleId, table, action, record, options = {}) {
        return handleModuleEvent(
            branchId,
            moduleId,
            { action, table, record, source: options.source || 'pos-order-api', includeRecord: true },
            null,
            { source: options.source || 'pos-order-api', includeSnapshot: false }
        );
    }

    async function auditAndRepairSequence(branchId, moduleId, store, tableName, fieldName) {
        try {
            console.log('🔧 [SEQUENCE REPAIR] Starting audit for:', { branchId, moduleId, tableName, fieldName });

            const formatDateTag = (date, format) => {
                const yyyy = String(date.getFullYear());
                const yy = yyyy.slice(-2);
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const fmt = (typeof format === 'string' && format.trim()) ? format.trim() : 'YYYYMMDD';
                return fmt
                    .replace(/YYYY/g, yyyy)
                    .replace(/YY/g, yy)
                    .replace(/MM/g, mm)
                    .replace(/DD/g, dd);
            };

            const extractSequenceFromId = (rule, id) => {
                if (!rule || !id) return null;
                const prefix = rule.prefix || '';
                const delimiter = rule.delimiter === '' ? '' : (rule.delimiter || '-');
                const includeDate = !!(rule.dateFormat || rule.date_format) && rule.includeDate !== false;
                const datePosition = rule.datePosition || rule.datePlacement || 'prefix';

                if (!delimiter) {
                    let rest = String(id);
                    if (prefix && rest.startsWith(prefix)) {
                        rest = rest.slice(prefix.length);
                    } else if (prefix) {
                        return null;
                    }
                    if (includeDate) {
                        const tag = formatDateTag(new Date(), rule.dateFormat || rule.date_format);
                        if (rest.startsWith(tag)) {
                            rest = rest.slice(tag.length);
                        }
                    }
                    const numeric = Number.parseInt(rest, 10);
                    return Number.isFinite(numeric) ? numeric : null;
                }

                const parts = String(id).split(delimiter).filter(Boolean);
                if (!parts.length) return null;
                if (prefix && parts[0] !== prefix) return null;

                let seqPart = parts[parts.length - 1];
                if (includeDate) {
                    if (datePosition === 'suffix') {
                        seqPart = parts[parts.length - 2] || '';
                    } else {
                        seqPart = parts[parts.length - 1];
                    }
                }
                const numeric = Number.parseInt(seqPart, 10);
                return Number.isFinite(numeric) ? numeric : null;
            };

            const rules = await sequenceManager.getRulesForTable(branchId, moduleId, tableName);
            const rule = rules?.[fieldName] || null;
            const resetPolicy = rule?.reset || rule?.resetEvery || rule?.period || rule?.scope || null;
            const dateTag = rule?.dateFormat || rule?.date_format
                ? formatDateTag(new Date(), rule.dateFormat || rule.date_format)
                : null;

            const records = store.listTable(tableName) || [];
            let maxSequence = 0;

            // Scan for max invoiceSequence in metadata (primary source for POS sequences)
            records.forEach(record => {
                const seqMeta = Number(record?.metadata?.invoiceSequence);
                const seqDirect = Number(record?.invoiceSequence || record?.invoice_sequence);
                let seq = Number.isFinite(seqMeta) ? seqMeta : (Number.isFinite(seqDirect) ? seqDirect : null);

                if (!Number.isFinite(seq)) {
                    seq = extractSequenceFromId(rule, record?.id || record?.orderId || record?.order_id);
                }

                if (!Number.isFinite(seq)) return;

                if (String(resetPolicy).toLowerCase() === 'daily' && dateTag) {
                    const id = String(record?.id || '');
                    if (!id.includes(dateTag)) return;
                }

                if (seq > maxSequence) {
                    maxSequence = seq;
                }
            });

            console.log('🔧 [SEQUENCE REPAIR] Max sequence found in DB:', maxSequence);

            if (maxSequence > 0) {
                const seqKey = sequenceManager.buildSequenceKey(moduleId, tableName, fieldName);
                if (seqKey) {
                    const state = await sequenceManager.ensureBranchState(branchId);
                    const stateKey = (String(resetPolicy).toLowerCase() === 'daily' && dateTag)
                        ? `${seqKey}::${dateTag}`
                        : seqKey;
                    const currentVal = state.values.get(stateKey)?.last || 0;

                    if (maxSequence > currentVal) {
                        console.log('🔧 [SEQUENCE REPAIR] Updating sequence manager state:', {
                            seqKey: stateKey,
                            currentVal,
                            newVal: maxSequence
                        });

                        state.values.set(stateKey, {
                            last: maxSequence,
                            updatedAt: new Date().toISOString()
                        });
                        await sequenceManager.persistBranchState(branchId, state);
                        console.log('✅ [SEQUENCE REPAIR] Sequence repaired successfully =>', maxSequence);
                    } else {
                        console.log('✨ [SEQUENCE REPAIR] Sequence is already ahead or equal (no repair needed):', currentVal);
                    }
                }
            }
        } catch (err) {
            console.error('❌ [SEQUENCE REPAIR] Failed to repair sequence:', err);
        }
    }

    function normalizePaymentRecord(orderId, shiftId, payment, fallbackTimestamp) {
        if (!payment) return null;
        const id = payment.id || createId(`pay-${orderId}`);
        const amount = Number(payment.amount);
        const timestamp = payment.capturedAt || payment.captured_at || fallbackTimestamp || nowIso();
        const paymentMethodId = payment.paymentMethodId || payment.method || payment.methodId || payment.id || 'cash';
        return {
            id,
            orderId,
            shiftId,
            paymentMethodId,
            amount: Number.isFinite(amount) ? amount : 0,
            capturedAt: timestamp,
            reference: payment.reference || payment.ref || null
        };
    }

    async function syncOrderLines(branchId, moduleId, store, orderId, lines, options = {}) {
        const existing = store
            .listTable('order_line')
            .filter((entry) => entry && entry.orderId === orderId);
        const retained = new Set();
        const results = [];
        for (const line of lines) {
            if (!line) continue;
            const payload = { ...line, orderId };
            const result = await applyModuleMutation(branchId, moduleId, 'order_line', 'module:save', payload, options);
            if (result?.record?.id) {
                retained.add(result.record.id);
                results.push({ record: result.record, source: payload });
            }
        }
        for (const entry of existing) {
            if (!entry || !entry.id) continue;
            if (retained.has(entry.id)) continue;
            await applyModuleMutation(branchId, moduleId, 'order_line', 'module:delete', { id: entry.id, orderId }, options);
        }
        return results;
    }

    async function syncOrderPayments(branchId, moduleId, store, orderId, payments, shiftId, options = {}) {
        const existing = store
            .listTable('order_payment')
            .filter((entry) => entry && entry.orderId === orderId);
        const retained = new Set();
        const results = [];
        const now = nowIso();
        for (const payment of payments) {
            const record = normalizePaymentRecord(orderId, shiftId, payment, now);
            if (!record) continue;
            const result = await applyModuleMutation(branchId, moduleId, 'order_payment', 'module:save', record, options);
            if (result?.record?.id) {
                retained.add(result.record.id);
                results.push(result.record);
            }
        }
        for (const entry of existing) {
            if (!entry || !entry.id) continue;
            if (retained.has(entry.id)) continue;
            await applyModuleMutation(branchId, moduleId, 'order_payment', 'module:delete', { id: entry.id, orderId }, options);
        }
        return results;
    }

    async function syncOrderStatusLogs(branchId, moduleId, store, orderId, statusLogs, options = {}) {
        const existing = store
            .listTable('order_status_log')
            .filter((entry) => entry && entry.orderId === orderId);
        const retained = new Set();
        for (const log of statusLogs) {
            if (!log) continue;
            const payload = { ...log, orderId };
            const result = await applyModuleMutation(branchId, moduleId, 'order_status_log', 'module:save', payload, options);
            if (result?.record?.id) retained.add(result.record.id);
        }
        for (const entry of existing) {
            if (!entry || !entry.id) continue;
            if (retained.has(entry.id)) continue;
            await applyModuleMutation(branchId, moduleId, 'order_status_log', 'module:delete', { id: entry.id, orderId }, options);
        }
    }

    async function syncOrderLineStatusLogs(branchId, moduleId, store, orderId, lineResults, options = {}) {
        const existing = store
            .listTable('order_line_status_log')
            .filter((entry) => entry && entry.orderId === orderId);
        const retained = new Set();
        for (const { record, source } of lineResults) {
            if (!record || !record.id) continue;
            const logs = ensureArray(source?.statusLogs);
            for (const log of logs) {
                if (!log) continue;
                const payload = { ...log, orderId, lineId: record.id };
                const result = await applyModuleMutation(
                    branchId,
                    moduleId,
                    'order_line_status_log',
                    'module:save',
                    payload,
                    options
                );
                if (result?.record?.id) retained.add(result.record.id);
            }
        }
        for (const entry of existing) {
            if (!entry || !entry.id) continue;
            if (retained.has(entry.id)) continue;
            await applyModuleMutation(branchId, moduleId, 'order_line_status_log', 'module:delete', { id: entry.id, orderId }, options);
        }
    }

    function generateJobOrderRecords(store, header, lines) {
        if (!header || !header.id) return null;
        if (!Array.isArray(lines) || lines.length === 0) return null;

        const orderId = header.id;
        const orderNumber = header.metadata?.invoiceSequence || header.id;
        const serviceMode = header.type || 'dine_in';
        const createdAt = header.createdAt || Date.now();
        const updatedAt = header.updatedAt || createdAt;

        const batchId = `BATCH-${orderId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const kitchenSections = store.listTable('kitchen_sections') || [];
        const sectionMap = new Map();
        kitchenSections.forEach(section => {
            if (section && section.id) {
                sectionMap.set(section.id, section);
            }
        });

        const menuItems = store.listTable('menu_items') || [];
        const itemMap = new Map();
        menuItems.forEach(item => {
            if (item && item.id) {
                itemMap.set(item.id, item);
            }
        });

        const extractLocalizedString = (value, lang, fallback = '') => {
            if (!value) return fallback;
            if (typeof value === 'string') return value;
            if (typeof value === 'object') {
                if (lang === 'ar') return value.ar || value.en || fallback;
                return value.en || value.ar || fallback;
            }
            return fallback;
        };

        const jobsMap = new Map();
        const jobDetails = [];
        const jobModifiers = [];
        const historyEntries = [];

        lines.forEach((line, index) => {
            if (!line) return;

            const lineIndex = index + 1;
            const stationId = line.kitchenSectionId || line.kitchen_section_id || line.kitchenSection || 'expo';
            const jobId = `${orderId}-${stationId}`;

            const section = sectionMap.get(stationId);

            let sectionName = section?.section_name;
            if (!sectionName && section) {
                sectionName = {
                    ar: section.nameAr || section.name_ar || '',
                    en: section.nameEn || section.name_en || ''
                };
            }

            const stationCode = section?.code || section?.stationCode || section?.station_code ||
                extractLocalizedString(sectionName, 'en', String(stationId).substring(0, 8).toUpperCase());

            const existing = jobsMap.get(jobId) || {
                id: jobId,
                orderId,
                orderNumber,
                posRevision: `${orderId}@${updatedAt}`,
                orderTypeId: serviceMode,
                serviceMode,
                stationId,
                stationCode,
                status: 'queued',
                progressState: 'awaiting',
                totalItems: 0,
                completedItems: 0,
                remainingItems: 0,
                hasAlerts: false,
                isExpedite: false,
                tableLabel: null,
                customerName: header.customerName || null,
                dueAt: header.dueAt || null,
                acceptedAt: null,
                startedAt: null,
                readyAt: null,
                completedAt: null,
                expoAt: null,
                syncChecksum: `${orderId}-${stationId}`,
                notes: Array.isArray(line.notes) ? line.notes.join('; ') : '',
                batchId,
                meta: { orderSource: 'pos', kdsTab: stationId },
                createdAt,
                updatedAt
            };

            // ✅ CRITICAL FIX: Extract quantity correctly, similar to normalization
            const quantity = Number(line.qty != null ? line.qty : (line.quantity != null ? line.quantity : 1));
            existing.totalItems += quantity;
            existing.remainingItems += quantity;
            jobsMap.set(jobId, existing);

            const baseLineId = line.id || `${orderId}-line-${lineIndex}`;
            const detailId = `${jobId}-detail-${baseLineId}`;
            const itemId = line.itemId || line.item_id || baseLineId;

            const menuItem = itemMap.get(itemId);
            const itemName = menuItem?.item_name || menuItem?.name || line.name;
            const itemSku = menuItem?.sku || line.sku || null;
            const categoryId = menuItem?.categoryId || menuItem?.category_id || '';

            const itemNameAr = extractLocalizedString(itemName, 'ar', `عنصر ${lineIndex}`);
            const itemNameEn = extractLocalizedString(itemName, 'en', `Item ${lineIndex}`);

            const detail = {
                id: detailId,
                jobOrderId: jobId,
                itemId,
                itemCode: itemId,
                itemSku,
                categoryId,
                quantity,
                status: 'queued',
                startAt: null,
                finishAt: null,
                createdAt,
                updatedAt,
                itemNameAr,
                itemNameEn,
                prepNotes: Array.isArray(line.notes) ? line.notes.join('; ') : '',
                stationId,
                kitchenSectionId: stationId
            };
            jobDetails.push(detail);

            historyEntries.push({
                id: `HIS-${jobId}-${baseLineId}`,
                jobOrderId: jobId,
                status: 'queued',
                actorId: 'pos',
                actorName: 'POS',
                actorRole: 'pos',
                changedAt: createdAt,
                meta: { source: 'pos', lineId: line.id || baseLineId }
            });
        });

        const headers = Array.from(jobsMap.values());

        return {
            headers,
            details: jobDetails,
            modifiers: jobModifiers,
            history: historyEntries
        };
    }

    async function syncJobOrders(branchId, moduleId, store, orderId, header, lines, options = {}) {
        // Disabled logic maintained for history/reference as per original code
        const existingHeaders = store.listTable('job_order_header').filter(h => h.orderId === orderId);
        logger.info({
            orderId,
            existingJobHeaders: existingHeaders.length,
            sampleIds: existingHeaders.slice(0, 3).map(h => ({ id: h.id, stationId: h.stationId }))
        }, '⚠️ [syncJobOrders] Called but DISABLED - existing job_order_header count');

        return;
    }

    async function savePosOrder(branchId, moduleId, orderPayload, options = {}) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔥 [CLAUDE BACKEND FIX] savePosOrder CALLED');
        console.log('═══════════════════════════════════════════════════════');

        if (!orderPayload || typeof orderPayload !== 'object') {
            throw new Error('Order payload is required');
        }

        const baseOrder = deepClone(orderPayload);

        // ✅ DEFENSIVE: Unwrap if payload is { order: { ... } }
        if (baseOrder.order && typeof baseOrder.order === 'object' && !baseOrder.id && baseOrder.order.id) {
            console.log('⚠️ [POS-ENGINE] Detected wrapped order payload, unwrapping...');
            Object.assign(baseOrder, baseOrder.order);
            delete baseOrder.order;
        }

        console.log('📦 [POS-ENGINE] Processing Order:', {
            id: baseOrder.id,
            shiftId: baseOrder.shiftId || baseOrder.shift_id,
            keys: Object.keys(baseOrder)
        });

        if (baseOrder.id) {
            const store = await ensureModuleStore(branchId, moduleId);
            const existingOrder = store.listTable('order_header').find(h => h.id === baseOrder.id);

            if (existingOrder) {
                console.log('⚠️ [CLAUDE BACKEND FIX] Order already exists in store:', {
                    orderId: baseOrder.id,
                    existingVersion: existingOrder.version,
                    incomingVersion: baseOrder.version,
                    existingStatus: existingOrder.status,
                    incomingStatus: baseOrder.status,
                    existingLinesCount: store.listTable('order_line').filter(l => l.orderId === baseOrder.id).length
                });

                if (baseOrder.version && existingOrder.version === baseOrder.version) {
                    const existingLinesCount = store.listTable('order_line').filter(l => l.orderId === baseOrder.id).length;
                    const incomingLinesCount = baseOrder.lines?.length || 0;

                    console.log('🔍 [DUPLICATE CHECK]:', {
                        existingLinesCount,
                        incomingLinesCount,
                        hasMoreLines: incomingLinesCount > existingLinesCount
                    });

                    if (incomingLinesCount > existingLinesCount) {
                        console.log('✅ [CLAUDE BACKEND FIX] ALLOWING save - adding new items to order');
                    } else {
                        console.error('❌ [CLAUDE BACKEND FIX] DUPLICATE SAVE BLOCKED - Same version, same or fewer lines!');

                        // ✅ AUTO-REPAIR SEQUENCE ON DUPLICATE
                        await auditAndRepairSequence(branchId, moduleId, store, 'order_header', 'id');

                        throw new Error('DUPLICATE_SAVE_DETECTED: Order with same ID and version already exists');
                    }
                }
            }
        }

        const requestKey = baseOrder.id || `temp-${Date.now()}`;
        if (SAVE_IN_PROGRESS.has(requestKey)) {
            console.error('❌ [CLAUDE BACKEND FIX] DUPLICATE SAVE BLOCKED - Already saving!', { requestKey });
            throw new Error('DUPLICATE_SAVE_IN_PROGRESS: This order is currently being saved');
        }

        SAVE_IN_PROGRESS.set(requestKey, Date.now());
        console.log('🔒 [CLAUDE BACKEND FIX] Save lock acquired:', requestKey);

        try {
            const isDraftId = baseOrder.id && (
                String(baseOrder.id).startsWith('draft-') ||
                String(baseOrder.id).match(/^[A-Z0-9]+-\d{13,}-\d{3}$/i)
            );
            const originalDraftId = isDraftId ? baseOrder.id : null;

            if (!baseOrder.id || isDraftId) {
                console.log('═══════════════════════════════════════════════════════');
                console.log('🔢 [CLAUDE BACKEND FIX] ALLOCATING SEQUENCE (NEW ORDER)');
                console.log('═══════════════════════════════════════════════════════');


                // ✅ RETRY LOGIC: Try up to 3 times with auto-repair on collision
                let retryCount = 0;
                const MAX_RETRIES = 3;
                let allocationSuccess = false;

                // ✅ CRITICAL FIX: Run audit BEFORE first allocation to ensure counter is correct
                const store = await ensureModuleStore(branchId, moduleId);
                await auditAndRepairSequence(branchId, moduleId, store, 'order_header', 'id');

                while (retryCount < MAX_RETRIES && !allocationSuccess) {
                    try {
                        const allocation = await sequenceManager.nextValue(branchId, moduleId, 'order_header', 'id', { record: baseOrder });
                        if (allocation?.formatted) {
                            const oldId = baseOrder.id;
                            const proposedId = allocation.formatted;

                            // Check for collision BEFORE accepting the ID
                            const duplicateCheck = store.listTable('order_header').find(h => h.id === proposedId);

                            if (duplicateCheck) {
                                console.error('🚨 [SEQUENCE COLLISION DETECTED] ID already exists:', {
                                    allocatedId: proposedId,
                                    retryCount,
                                    existingOrder: {
                                        id: duplicateCheck.id,
                                        version: duplicateCheck.version,
                                        status: duplicateCheck.status,
                                        createdAt: duplicateCheck.createdAt
                                    }
                                });

                                // Auto-repair sequence and retry
                                console.log('🔧 [AUTO-REPAIR] Running sequence audit...');
                                await auditAndRepairSequence(branchId, moduleId, store, 'order_header', 'id');
                                retryCount++;

                                if (retryCount >= MAX_RETRIES) {
                                    throw new Error(`SEQUENCE_COLLISION: Allocated ID ${proposedId} already exists in store! (Failed after ${MAX_RETRIES} retries)`);
                                }

                                console.log(`🔄 [RETRY ${retryCount}/${MAX_RETRIES}] Attempting sequence allocation again...`);
                                continue; // Retry
                            }

                            // ✅ No collision - accept the ID
                            baseOrder.id = proposedId;
                            if (!baseOrder.metadata || typeof baseOrder.metadata !== 'object') baseOrder.metadata = {};
                            baseOrder.metadata.invoiceSequence = allocation.value;
                            baseOrder.metadata.sequenceRule = allocation.rule || null;

                            if (isDraftId && !baseOrder.uniqueId && !baseOrder.unique_id) {
                                const fallbackId = createId ? createId() : Math.random().toString(36).substring(2, 15);
                                baseOrder.uniqueId = crypto.randomUUID ? crypto.randomUUID() : `urn:uuid:${fallbackId}`;
                            }

                            console.log('✅ [SEQUENCE ALLOCATED SUCCESSFULLY]:', {
                                oldId: isDraftId ? oldId : 'none',
                                newId: baseOrder.id,
                                sequence: allocation.value,
                                uniqueId: baseOrder.uniqueId,
                                retries: retryCount
                            });

                            allocationSuccess = true;
                        }
                    } catch (err) {
                        if (retryCount >= MAX_RETRIES - 1) {
                            throw err; // Re-throw on last retry
                        }
                        console.error(`❌ [RETRY ${retryCount + 1}/${MAX_RETRIES}] Sequence allocation failed:`, err.message);
                        retryCount++;
                    }
                }

                if (!allocationSuccess) {
                    throw new Error('SEQUENCE_ALLOCATION_FAILED: Unable to allocate sequence after retries');
                }
            } else {
                console.log('♻️ [CLAUDE BACKEND FIX] Using existing ID (update):', baseOrder.id);
            }
            const actorId = options.actorId || baseOrder.updatedBy || baseOrder.closedBy || baseOrder.openedBy || null;
            const normalized = normalizeIncomingOrder(baseOrder, { actorId });

            if (!normalized.lines || normalized.lines.length === 0) {
                console.error('❌ [CLAUDE BACKEND FIX] EMPTY ORDER BLOCKED - No order lines!');
                throw new Error('EMPTY_ORDER_NOT_ALLOWED: Order must have at least one order_line');
            }
            console.log('✅ [CLAUDE BACKEND FIX] Order validation passed:', {
                orderId: normalized.header.id,
                linesCount: normalized.lines.length
            });
            const headerResult = await applyModuleMutation(
                branchId,
                moduleId,
                'order_header',
                'module:save',
                normalized.header,
                { source: options.source || 'pos-order-api' }
            );
            const store = await ensureModuleStore(branchId, moduleId);
            const orderId = headerResult?.record?.id || normalized.header.id;
            const lineResults = await syncOrderLines(
                branchId,
                moduleId,
                store,
                orderId,
                normalized.lines,
                { source: options.source || 'pos-order-api' }
            );
            await syncOrderPayments(
                branchId,
                moduleId,
                store,
                orderId,
                normalized.header.payments || [],
                normalized.header.shiftId,
                { source: options.source || 'pos-order-api' }
            );
            await syncOrderStatusLogs(
                branchId,
                moduleId,
                store,
                orderId,
                normalized.statusLogs,
                { source: options.source || 'pos-order-api' }
            );
            await syncOrderLineStatusLogs(
                branchId,
                moduleId,
                store,
                orderId,
                lineResults,
                { source: options.source || 'pos-order-api' }
            );

            await syncJobOrders(
                branchId,
                moduleId,
                store,
                orderId,
                normalized.header,
                normalized.lines,
                { source: options.source || 'pos-order-api' }
            );

            if (originalDraftId && originalDraftId !== orderId) {
                const purgeTables = [
                    'order_line_status_log',
                    'order_status_log',
                    'order_payment',
                    'order_line',
                    'order_header'
                ];
                for (const tableName of purgeTables) {
                    const entries = store.listTable(tableName).filter(entry => {
                        if (!entry) return false;
                        if (tableName === 'order_header') return entry.id === originalDraftId;
                        return entry.orderId === originalDraftId;
                    });
                    for (const entry of entries) {
                        try {
                            await applyModuleMutation(branchId, moduleId, tableName, 'module:delete', {
                                id: entry.id,
                                orderId: originalDraftId
                            }, { source: options.source || 'pos-order-api' });
                        } catch (err) {
                            logger.warn({ err, branchId, moduleId, table: tableName, orderId: originalDraftId }, 'Failed to purge draft order artifacts');
                        }
                    }
                }
            }

            console.log('✅ [CLAUDE BACKEND FIX] Save completed successfully:', orderId);
            return { orderId, normalized, header: headerResult?.record };
        } finally {
            SAVE_IN_PROGRESS.delete(requestKey);
            console.log('🔓 [CLAUDE BACKEND FIX] Save lock released:', requestKey);
        }
    }

    function buildPosOrderSnapshot(store, orderId) {
        const header = store.listTable('order_header').find((entry) => entry && entry.id === orderId);
        if (!header) return null;
        const lines = store
            .listTable('order_line')
            .filter((entry) => entry && entry.orderId === orderId)
            .map((entry) => ({ ...entry }));
        const payments = store
            .listTable('order_payment')
            .filter((entry) => entry && entry.orderId === orderId)
            .map((entry) => ({ ...entry }));
        const statusLogs = store
            .listTable('order_status_log')
            .filter((entry) => entry && entry.orderId === orderId)
            .map((entry) => ({ ...entry }));
        const lineStatusLogs = store
            .listTable('order_line_status_log')
            .filter((entry) => entry && entry.orderId === orderId)
            .map((entry) => ({ ...entry }));

        const lineStatusMap = new Map();
        for (const log of lineStatusLogs) {
            const key = log.lineId || log.line_id;
            if (!key) continue;
            if (!lineStatusMap.has(key)) lineStatusMap.set(key, []);
            lineStatusMap.get(key).push(log);
        }
        const linesWithStatus = lines.map((entry) => ({
            ...entry,
            statusLogs: lineStatusMap.get(entry.id) || []
        }));

        return {
            ...header,
            lines: linesWithStatus,
            payments,
            statusLogs
        };
    }

    async function fetchPosOrderSnapshot(branchId, moduleId, orderId) {
        const store = await ensureModuleStore(branchId, moduleId);
        return buildPosOrderSnapshot(store, orderId);
    }

    async function applyPosOrderCreate(branchId, moduleId, frameData, context = {}) {
        const order = frameData.order;
        if (!order || !order.id) {
            return { state: await ensureSyncState(branchId, moduleId), order: null, existing: false };
        }
        const baseState = await ensureSyncState(branchId, moduleId);
        const currentRows = Array.isArray(baseState?.moduleSnapshot?.tables?.pos_database)
            ? baseState.moduleSnapshot.tables.pos_database
            : [];
        const latestRecord = currentRows.length ? currentRows[currentRows.length - 1] : null;
        const currentPayload = latestRecord && typeof latestRecord.payload === 'object' ? latestRecord.payload : {};
        const currentStores = currentPayload.stores && typeof currentPayload.stores === 'object' ? currentPayload.stores : {};
        const orderId = String(order.id);
        const existingOrder = Array.isArray(currentStores.orders)
            ? currentStores.orders.find((entry) => entry && entry.id === orderId)
            : null;

        let normalized;
        try {
            normalized = normalizeIncomingOrder(order, { userId: context.userUuid || frameData.meta?.userId || null });
        } catch (error) {
            throw new Error(error.message || 'Failed to normalize POS order payload.');
        }

        const persistedAt = normalized.header.savedAt || normalized.header.updatedAt || Date.now();
        const syncEntry = {
            ts: persistedAt,
            type: 'order:create',
            orderId: normalized.header.id,
            shiftId: normalized.header.shiftId,
            userId: context.userUuid || frameData.meta?.userId || null,
            source: context.clientId || 'ws2'
        };

        const snapshotPatch = {
            payload: {
                stores: {
                    orders: [normalized.header],
                    orderLines: normalized.lines,
                    orderNotes: normalized.notes,
                    orderStatusLogs: normalized.statusLogs,
                    syncLog: [syncEntry]
                },
                meta: {
                    lastOrderId: normalized.header.id,
                    lastOrderSavedAt: new Date(persistedAt).toISOString()
                }
            },
            meta: {
                lastOrderId: normalized.header.id,
                lastOrderSavedAt: new Date(persistedAt).toISOString()
            }
        };

        const nextState = await applySyncSnapshot(branchId, moduleId, snapshotPatch, {
            ...context,
            branchId,
            moduleId,
            orderId: normalized.header.id,
            action: 'create-order'
        });

        return {
            state: nextState,
            order: buildAckOrder(normalized),
            existing: !!existingOrder
        };
    }

    function normalizePosSnapshot(store, incomingSnapshot) {
        if (!incomingSnapshot || typeof incomingSnapshot !== 'object' || Array.isArray(incomingSnapshot)) return null;
        if (!store.tables.includes('pos_database')) return null;

        let dataset = null;
        if (incomingSnapshot.stores && typeof incomingSnapshot.stores === 'object' && !Array.isArray(incomingSnapshot.stores)) {
            dataset = incomingSnapshot;
        } else if (incomingSnapshot.payload && typeof incomingSnapshot.payload === 'object' && !Array.isArray(incomingSnapshot.payload)) {
            dataset = incomingSnapshot.payload;
        } else if (
            (incomingSnapshot.settings && typeof incomingSnapshot.settings === 'object') ||
            Array.isArray(incomingSnapshot.orders) ||
            (incomingSnapshot.meta && typeof incomingSnapshot.meta === 'object')
        ) {
            dataset = incomingSnapshot;
        }

        if (!dataset) return null;

        const currentSnapshot = store.getSnapshot();
        const existingRows = Array.isArray(currentSnapshot.tables?.pos_database)
            ? currentSnapshot.tables.pos_database.map((row) => deepClone(row))
            : [];
        const previousRecord = existingRows.length ? existingRows[existingRows.length - 1] : null;
        const previousPayload = previousRecord && typeof previousRecord.payload === 'object' && previousRecord.payload ? previousRecord.payload : {};
        const mergedPayload = mergePosPayload(previousPayload, dataset);

        if (previousRecord && snapshotsEqual(previousRecord.payload, mergedPayload)) {
            return currentSnapshot;
        }

        const nowTs = nowIso();
        const meta = dataset.meta && typeof dataset.meta === 'object' ? dataset.meta : {};
        const baseId = previousRecord?.id || meta.snapshotId || meta.id || meta.exportId || incomingSnapshot.id || null;
        const recordId = baseId ? String(baseId) : createId(`${store.moduleId}-live`);
        const createdAt = previousRecord?.createdAt || toIsoTimestamp(meta.exportedAt, nowTs) || nowTs;
        const record = {
            id: recordId,
            branchId: store.branchId,
            payload: deepClone(mergedPayload),
            createdAt,
            updatedAt: nowTs
        };

        const versionCandidates = [];
        const datasetVersion = Number(dataset.version);
        if (Number.isFinite(datasetVersion)) {
            versionCandidates.push(datasetVersion);
        }
        const incomingVersion = Number(incomingSnapshot.version);
        if (Number.isFinite(incomingVersion)) {
            versionCandidates.push(incomingVersion);
        }
        if (Number.isFinite(Number(currentSnapshot.version))) {
            versionCandidates.push(Number(currentSnapshot.version));
        }
        const version = versionCandidates.length
            ? Math.max(...versionCandidates)
            : Number.isFinite(Number(currentSnapshot.version))
                ? Number(currentSnapshot.version)
                : 1;

        const nextMeta = currentSnapshot.meta && typeof currentSnapshot.meta === 'object' && !Array.isArray(currentSnapshot.meta) ? deepClone(currentSnapshot.meta) : {};
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
            Object.assign(nextMeta, deepClone(meta));
        }
        nextMeta.lastUpdatedAt = nowTs;
        nextMeta.lastCentralSyncAt = nowTs;
        if (Number.isFinite(datasetVersion)) {
            nextMeta.centralVersion = datasetVersion;
        } else if (Number.isFinite(incomingVersion)) {
            nextMeta.centralVersion = incomingVersion;
        }

        return {
            moduleId: store.moduleId,
            branchId: store.branchId,
            version,
            tables: { pos_database: [record] },
            meta: nextMeta
        };
    }

    return {
        savePosOrder,
        fetchPosOrderSnapshot,
        applyPosOrderCreate,
        normalizePosSnapshot,
        applyModuleMutation,
        generateJobOrderRecords, // Exporting for completeness but main usage is local? No it's local. Wait, server logic used it? Line 613 used it.
        // syncJobOrders is local or exported? It's used by savePosOrder.
    };
}
