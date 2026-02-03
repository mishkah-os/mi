// [RESTORED] KDS Bridge & WebSocket Logic
const kdsBridge = (() => {
    let socket = null;
    let isConnected = false;
    let reconnectTimer = null;
    let pendingMessages = [];
    const MAX_RETRIES = 5;
    let retryCount = 0;

    const connect = (ctx) => {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/kds`;

        console.log('🔌 [KDS] Connecting to:', wsUrl);

        try {
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('✅ [KDS] Connected');
                isConnected = true;
                retryCount = 0;
                if (ctx) UI.pushToast(ctx, { title: 'تم الاتصال بشاشة المطبخ', icon: '🟢' });
                flushPendingKdsMessages();
            };

            socket.onclose = () => {
                console.log('❌ [KDS] Disconnected');
                isConnected = false;
                socket = null;
                if (retryCount < MAX_RETRIES) {
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
                    retryCount++;
                    console.log(`🔄 [KDS] Reconnecting in ${delay}ms...`);
                    reconnectTimer = setTimeout(() => connect(ctx), delay);
                }
            };

            socket.onerror = (err) => {
                console.error('⚠️ [KDS] Error:', err);
            };

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    console.log('📩 [KDS] Received:', msg);
                } catch (e) {
                    console.error('⚠️ [KDS] Invalid message:', event.data);
                }
            };

        } catch (err) {
            console.error('❌ [KDS] Connection failed:', err);
        }
    };

    const send = (type, payload) => {
        const message = { type, payload, timestamp: Date.now() };
        if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify(message));
                console.log('📤 [KDS] Sent:', type);
            } catch (err) {
                console.error('❌ [KDS] Send failed:', err);
                pendingMessages.push(message);
            }
        } else {
            console.log('queue [KDS] Queued:', type);
            pendingMessages.push(message);
            connect();
        }
    };

    const flushPendingKdsMessages = () => {
        if (!pendingMessages.length) return;
        console.log(`🚀 [KDS] Flushing ${pendingMessages.length} pending messages...`);
        const queue = [...pendingMessages];
        pendingMessages = [];
        queue.forEach(msg => send(msg.type, msg.payload));
    };

    return {
        connect,
        send,
        get isConnected() { return isConnected; }
    };
})();

// Expose global flush function for usage in persistOrderFlow
const flushPendingKdsMessages = () => {
    // Only flush if bridge has pending items, logic handled inside bridge but exposes trigger
    // Actually, let's just use kdsBridge.send directly in persistOrderFlow
};
