/**
 * runtime/metrics.js
 * Telemetry and metrics management
 */

import logger from '../logger.js';
import config from '../config/index.js';

const { metricsState, PROM_EXPORTER_PREFERRED } = config;

/**
 * Initialize Prometheus metrics if enabled
 */
export async function setupMetrics() {
    if (!PROM_EXPORTER_PREFERRED) return;

    try {
        const prom = await import('prom-client');
        metricsState.prom.client = prom;
        metricsState.prom.register = prom.register;

        if (typeof prom.collectDefaultMetrics === 'function') {
            prom.collectDefaultMetrics();
        }

        metricsState.prom.counters.wsBroadcasts = new prom.Counter({
            name: 'ws2_ws_broadcast_events_total',
            help: 'Total websocket broadcast payloads sent by channel',
            labelNames: ['channel']
        });

        metricsState.prom.counters.wsFrames = new prom.Counter({
            name: 'ws2_ws_frames_delivered_total',
            help: 'Total websocket frames delivered to clients',
            labelNames: ['channel']
        });

        metricsState.prom.counters.wsSerializations = new prom.Counter({
            name: 'ws2_ws_serialization_events_total',
            help: 'Total websocket payload serialization events',
            labelNames: ['channel', 'result']
        });

        metricsState.prom.counters.wsPayloadBytes = new prom.Counter({
            name: 'ws2_ws_payload_bytes_total',
            help: 'Total websocket payload bytes delivered',
            labelNames: ['channel']
        });

        metricsState.prom.counters.httpRequests = new prom.Counter({
            name: 'ws2_http_requests_total',
            help: 'Total HTTP requests processed by the WS2 gateway',
            labelNames: ['kind', 'method']
        });

        metricsState.prom.histograms.ajaxDuration = new prom.Histogram({
            name: 'ws2_ajax_request_duration_ms',
            help: 'Duration of AJAX (REST) requests in milliseconds',
            labelNames: ['method'],
            buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000]
        });

        logger.info('Prometheus metrics initialized');
    } catch (error) {
        logger.info({ err: error }, 'Prometheus exporter disabled; prom-client not available');
        metricsState.prom.client = null;
        metricsState.prom.register = null;
        metricsState.prom.counters = {};
        metricsState.prom.histograms = {};
    }
}

export function recordWsBroadcast(channel, count = 1) {
    if (!metricsState.enabled) return;
    metricsState.ws.broadcasts += count;
    if (metricsState.prom.counters.wsBroadcasts) {
        metricsState.prom.counters.wsBroadcasts.inc({ channel }, count);
    }
}

export function recordWsFrames(channel, count, bytes = 0) {
    if (!metricsState.enabled) return;
    metricsState.ws.frames += count;
    metricsState.ws.payloadBytes += bytes;

    if (metricsState.prom.counters.wsFrames) {
        metricsState.prom.counters.wsFrames.inc({ channel }, count);
    }
    if (metricsState.prom.counters.wsPayloadBytes && bytes > 0) {
        metricsState.prom.counters.wsPayloadBytes.inc({ channel }, bytes);
    }
}

export function recordWsSerialization(channel, { cached = false, bytes = 0 } = {}) {
    if (!metricsState.enabled) return;
    metricsState.ws.serializations += 1;
    if (cached) metricsState.ws.cacheHits += 1;

    if (metricsState.prom.counters.wsSerializations) {
        metricsState.prom.counters.wsSerializations.inc({
            channel: channel || 'unknown',
            result: cached ? 'hit' : 'miss'
        });
    }
}

export function recordRequestMetrics(req) {
    if (!metricsState.enabled) return;
    metricsState.http.requests += 1;
    if (metricsState.prom.counters.httpRequests) {
        const method = req.method || 'UNKNOWN';
        metricsState.prom.counters.httpRequests.inc({ kind: 'http', method });
    }
}

export function recordAjaxMetrics(method, durationMs) {
    if (!metricsState.enabled) return;
    metricsState.ajax.requests += 1;
    metricsState.ajax.totalDurationMs += durationMs;

    if (metricsState.prom.histograms.ajaxDuration) {
        metricsState.prom.histograms.ajaxDuration.observe({ method }, durationMs);
    }
}

export function getMetrics() {
    return {
        enabled: metricsState.enabled,
        ws: { ...metricsState.ws },
        ajax: {
            requests: metricsState.ajax.requests,
            avgDuration: metricsState.ajax.requests ? (metricsState.ajax.totalDurationMs / metricsState.ajax.requests).toFixed(2) : 0
        },
        http: { ...metricsState.http },
        prom: !!metricsState.prom.client
    };
}

export async function getPrometheusMetrics() {
    if (metricsState.prom.register) {
        return metricsState.prom.register.metrics();
    }
    return null;
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
