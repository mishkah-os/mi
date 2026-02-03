import logger from '../logger.js';
import { nowIso } from '../utils.js';
import { buildAckOrder } from './pos-normalization.js';

/**
 * POS Order Handler
 * Handles POS-specific order processing
 */
export function createPosOrderHandler({ posEngine }) {
    const isDraftOrderId = (value) => {
        if (!value) return true;
        const text = String(value);
        return text.startsWith('draft-') || /^[A-Z0-9]+-\d{13,}-\d{3}$/i.test(text);
    };

    async function handlePosOrderCreate(branchId, moduleId, frameData, context = {}) {
        if (!frameData.order || typeof frameData.order !== 'object') {
            throw new Error('Missing or invalid order in frameData');
        }

        try {
            let result;
            // Check if we need to allocate an ID (new order)
            const needsIdAllocation = isDraftOrderId(frameData.order.id);

            if (needsIdAllocation && typeof posEngine.savePosOrder === 'function') {
                // Use robust savePosOrder logic which handles Sequence ID allocation
                const saveResult = await posEngine.savePosOrder(branchId, moduleId, frameData.order, {
                    source: 'api:pos-order',
                    actorId: context.userUuid || context.clientId || 'api',
                    ...context
                });

                // Construct ACK order from normalized data
                const orderAck = buildAckOrder(saveResult.normalized);

                // Try to get sync state if available, but don't fail if not
                let nextState = null;
                if (typeof posEngine.ensureSyncState === 'function') {
                    try {
                        nextState = await posEngine.ensureSyncState(branchId, moduleId);
                    } catch (err) {
                        logger.warn({ err, branchId, moduleId }, 'Failed to fetch sync state after save');
                    }
                }

                result = {
                    state: nextState,
                    order: orderAck,
                    existing: false
                };
            } else {
                // CRITICAL FIX: Use savePosOrder for existing orders too
                // This avoids applySyncSnapshot and handles updates via module events
                const saveResult = await posEngine.savePosOrder(branchId, moduleId, frameData.order, {
                    source: 'api:pos-order-update',
                    actorId: context.userUuid || context.clientId || 'api',
                    ...context
                });

                const orderAck = buildAckOrder(saveResult.normalized);

                let nextState = null;
                if (typeof posEngine.ensureSyncState === 'function') {
                    try {
                        nextState = await posEngine.ensureSyncState(branchId, moduleId);
                    } catch (err) {
                        logger.warn({ err, branchId, moduleId }, 'Failed to fetch sync state after update');
                    }
                }

                result = {
                    state: nextState,
                    order: orderAck,
                    existing: true
                };
            }

            // CRITICAL CHECK: Ensure we have a valid result order
            if (!result || !result.order) {
                throw new Error('Order creation failed: No order returned. Ensure ID is provided or ID allocation is enabled.');
            }

            const enrichedFrameData = {
                ...frameData,
                order: result.order,
                meta: {
                    ...(frameData.meta && typeof frameData.meta === 'object' ? frameData.meta : {}),
                    persisted: true,
                    persistedAt: result.order.savedAt || result.order.updatedAt || Date.now(),
                    persistedAtIso: new Date(
                        result.order.savedAt || result.order.updatedAt || Date.now()
                    ).toISOString(),
                    branchId,
                    moduleId,
                    existing: result.existing
                }
            };

            if (result.existing) {
                enrichedFrameData.existing = true;
            }

            return {
                success: true,
                state: result.state,
                frameData: enrichedFrameData,
                existing: result.existing || false
            };
        } catch (error) {
            logger.warn(
                { err: error, branchId, moduleId, orderId: frameData.order?.id },
                'Failed to process POS order'
            );
            throw error;
        }
    }

    function validatePosOrder(order) {
        if (!order || typeof order !== 'object') {
            return { valid: false, error: 'Order must be an object' };
        }
        if (!order.id) {
            return { valid: false, error: 'Order must have an id' };
        }
        return { valid: true };
    }

    return {
        handlePosOrderCreate,
        validatePosOrder
    };
}
