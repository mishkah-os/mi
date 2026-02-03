import { metricsState } from '../config/index.js';
import logger from '../logger.js';

export function recordWsSerialization(channel, { cached = false, bytes = 0 } = {}) {
    if (!metricsState.enabled) return;
    const normalizedChannel = channel || 'direct';
    if (cached) {
        metricsState.ws.cacheHits += 1;
    } else {
        metricsState.ws.serializations += 1;
    }
    if (Number.isFinite(bytes) && bytes > 0) {
        metricsState.ws.payloadBytes += bytes;
    }
    if (metricsState.prom.counters.wsSerializations) {
        metricsState.prom.counters.wsSerializations.inc({
            channel: normalizedChannel,
            result: cached ? 'cache-hit' : 'serialized'
        });
    }
    if (metricsState.prom.counters.wsPayloadBytes && Number.isFinite(bytes) && bytes > 0) {
        metricsState.prom.counters.wsPayloadBytes.inc({ channel: normalizedChannel }, bytes);
    }
}

export function recordWsBroadcast(channel, deliveredCount = 0) {
    if (!metricsState.enabled) return;
    const normalizedChannel = channel || 'unknown';
    metricsState.ws.broadcasts += 1;
    if (Number.isFinite(deliveredCount) && deliveredCount > 0) {
        metricsState.ws.frames += deliveredCount;
    }
    if (metricsState.prom.counters.wsBroadcasts) {
        metricsState.prom.counters.wsBroadcasts.inc({ channel: normalizedChannel }, 1);
    }
    if (metricsState.prom.counters.wsFrames && Number.isFinite(deliveredCount) && deliveredCount > 0) {
        metricsState.prom.counters.wsFrames.inc({ channel: normalizedChannel }, deliveredCount);
    }
}

export function recordHttpRequest(method, isAjax, durationMs = 0) {
    if (!metricsState.enabled) return;
    const normalizedMethod = String(method || 'GET').toUpperCase();
    metricsState.http.requests += 1;
    if (metricsState.prom.counters.httpRequests) {
        metricsState.prom.counters.httpRequests.inc({ kind: isAjax ? 'ajax' : 'http', method: normalizedMethod }, 1);
    }
    if (isAjax) {
        const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
        metricsState.ajax.requests += 1;
        metricsState.ajax.totalDurationMs += duration;
        if (metricsState.prom.histograms.ajaxDuration) {
            metricsState.prom.histograms.ajaxDuration.observe({ method: normalizedMethod }, duration);
        }
    }
}

export async function renderMetrics() {
    if (!metricsState.enabled) {
        return '# HELP ws2_metrics_disabled WS2 metrics disabled\n# TYPE ws2_metrics_disabled gauge\nws2_metrics_disabled 1\n';
    }
    if (metricsState.prom.register && typeof metricsState.prom.register.metrics === 'function') {
        try {
            return await metricsState.prom.register.metrics();
        } catch (error) {
            logger.warn({ err: error }, 'Failed to collect Prometheus metrics; falling back to in-memory snapshot');
        }
    }
    const avgAjax = metricsState.ajax.requests
        ? metricsState.ajax.totalDurationMs / metricsState.ajax.requests
        : 0;
    const lines = [
        '# HELP ws2_ws_broadcast_total Total websocket broadcast payloads',
        '# TYPE ws2_ws_broadcast_total counter',
        `ws2_ws_broadcast_total ${metricsState.ws.broadcasts}`,
        '# HELP ws2_ws_frames_total Total websocket frames delivered',
        '# TYPE ws2_ws_frames_total counter',
        `ws2_ws_frames_total ${metricsState.ws.frames}`,
        '# HELP ws2_ws_serializations_total Total websocket payload serializations',
        '# TYPE ws2_ws_serializations_total counter',
        `ws2_ws_serializations_total ${metricsState.ws.serializations}`,
        '# HELP ws2_ws_serialization_cache_hits_total Total websocket serialization cache hits',
        '# TYPE ws2_ws_serialization_cache_hits_total counter',
        `ws2_ws_serialization_cache_hits_total ${metricsState.ws.cacheHits}`,
        '# HELP ws2_ws_payload_bytes_total Total websocket payload bytes delivered',
        '# TYPE ws2_ws_payload_bytes_total counter',
        `ws2_ws_payload_bytes_total ${metricsState.ws.payloadBytes}`,
        '# HELP ws2_http_requests_total Total HTTP requests handled by WS2',
        '# TYPE ws2_http_requests_total counter',
        `ws2_http_requests_total ${metricsState.http.requests}`,
        '# HELP ws2_ajax_requests_total Total AJAX/REST requests handled by WS2',
        '# TYPE ws2_ajax_requests_total counter',
        `ws2_ajax_requests_total ${metricsState.ajax.requests}`,
        '# HELP ws2_ajax_request_duration_avg_ms Average AJAX/REST duration in milliseconds',
        '# TYPE ws2_ajax_request_duration_avg_ms gauge',
        `ws2_ajax_request_duration_avg_ms ${avgAjax.toFixed(2)}`,
        '# HELP ws2_metrics_timestamp_seconds Timestamp when metrics snapshot generated',
        '# TYPE ws2_metrics_timestamp_seconds gauge',
        `ws2_metrics_timestamp_seconds ${Math.round(Date.now() / 1000)}`
    ];
    return `${lines.join('\n')}\n`;
}
