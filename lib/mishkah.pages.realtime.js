(function (window) {
  'use strict';

  if (!window || !window.Mishkah) {
    return;
  }

  const M = window.Mishkah;
  const D = M.DSL;
  const Templates = M.templates = M.templates || {};
  const U = M.utils = M.utils || {};
  const tw = (U.twcss && U.twcss.tw) || ((s) => s);

  const DEFAULT_SIGNAL_BASE = '/api';
  const DEFAULT_WS_URL = 'ws://localhost:3001';
  const DEFAULT_CONVERSATION = 'conv-demo';

  const runtime = {
    app: null,
    lastCtx: null,
    ws: null,
    wsStatus: 'idle',
    wsReconnect: null,
    peer: null,
    dataChannel: null,
    remoteStream: null,
    localStream: null,
    recorder: null,
    recorderChunks: [],
    mediaTracks: { audio: null, video: null },
    signalQueue: [],
  };

  const topicSnapshots = new Map();

  function clonePayload(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (_err) { /* fallthrough */ }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_err) {
      if (Array.isArray(value)) return value.slice();
      return { ...value };
    }
  }

  function resolveTopicPayload(topic, payload) {
    if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
      const clone = clonePayload(payload);
      if (topic) topicSnapshots.set(topic, clone);
      return clone;
    }
    if (payload.mode === 'snapshot') {
      const snapshot = clonePayload(payload.snapshot);
      if (topic) topicSnapshots.set(topic, snapshot);
      return snapshot;
    }
    if (payload.mode === 'delta') {
      const base = topicSnapshots.has(topic) ? clonePayload(topicSnapshots.get(topic)) : {};
      const working = base && typeof base === 'object' ? base : {};
      const removals = Array.isArray(payload.remove) ? payload.remove : [];
      removals.forEach((key) => {
        if (key != null) delete working[key];
      });
      if (payload.set && typeof payload.set === 'object') {
        Object.keys(payload.set).forEach((key) => {
          working[key] = clonePayload(payload.set[key]);
        });
      }
      if (topic) topicSnapshots.set(topic, working);
      return working;
    }
    const fallback = clonePayload(payload);
    if (topic) topicSnapshots.set(topic, fallback);
    return fallback;
  }

  function normalizeState(state) {
    const rt = state.data?.realtime || {};
    return {
      conversationId: rt.conversationId || DEFAULT_CONVERSATION,
      signalBase: rt.signalBase || DEFAULT_SIGNAL_BASE,
      wsUrl: rt.wsUrl || DEFAULT_WS_URL,
      token: rt.token || null,
      iceServers: rt.iceServers || [],
      turnHint: rt.turnHint || null,
      call: rt.call || { status: 'idle', micEnabled: true, camEnabled: true },
      chat: rt.chat || { transport: 'dc', messages: [], sending: false },
      connection: rt.connection || { ws: 'idle', dc: 'idle' },
      voiceNote: rt.voiceNote || { recording: false, lastError: null },
    };
  }

  function updateState(updater) {
    if (runtime.app) {
      runtime.app.setState(updater);
    } else if (runtime.lastCtx) {
      runtime.lastCtx.setState(updater);
    }
  }

  function encryptText(plaintext) {
    if (!plaintext) {
      return { ciphertext: '', keyId: null };
    }
    return { ciphertext: plaintext, keyId: null };
  }

  function decryptText(ciphertext) {
    return ciphertext;
  }

  function appendChatMessage(message) {
    updateState((state) => {
      const current = state.data?.realtime?.chat?.messages || [];
      const next = current.concat([message]).slice(-200);
      return {
        ...state,
        data: {
          ...state.data,
          realtime: {
            ...(state.data?.realtime || {}),
            chat: {
              ...(state.data?.realtime?.chat || {}),
              messages: next,
            },
          },
        },
      };
    });
  }

  function setConnectionStatus(target, status) {
    updateState((state) => ({
      ...state,
      data: {
        ...state.data,
        realtime: {
          ...(state.data?.realtime || {}),
          connection: {
            ...(state.data?.realtime?.connection || {}),
            [target]: status,
          },
        },
      },
    }));
  }

  function getAuthHeaders(state) {
    if (!state.token) return {};
    return { Authorization: `Bearer ${state.token}` };
  }

  function wsSend(obj) {
    if (!runtime.ws || runtime.ws.readyState !== 1) return;
    runtime.ws.send(JSON.stringify(obj));
  }

  function subscribeTopics(state) {
    const topics = [
      `chat:${state.conversationId}`,
      `rtc:${state.conversationId}`,
    ];
    topics.forEach((topic) => {
      wsSend({ type: 'subscribe', topic });
    });
  }

  function handleSignalMessage(payload, state) {
    if (!payload || payload.topic !== `rtc:${state.conversationId}`) {
      return;
    }
    const data = payload.data || {};
    if (!runtime.peer) {
      runtime.signalQueue.push(data);
      return;
    }
    if (data.kind === 'answer' && data.sdp) {
      runtime.peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp })).catch(() => {
        /* ignore for skeleton */
      });
    } else if (data.kind === 'offer' && data.sdp) {
      // Remote initiated call
      acceptRemoteOffer(data, state).catch(() => {});
    } else if (data.kind === 'ice' && data.candidate) {
      try {
        runtime.peer.addIceCandidate(new RTCIceCandidate({
          candidate: data.candidate,
          sdpMid: data.sdpMid || undefined,
          sdpMLineIndex: data.sdpMLineIndex ?? undefined,
        }));
      } catch (_err) {
        /* ignore */
      }
    }
  }

  function handleChatPublish(payload, state) {
    if (!payload || payload.topic !== `chat:${state.conversationId}`) {
      return;
    }
    appendChatMessage(payload.data || {});
  }

  function setupWebSocket(ctx) {
    runtime.lastCtx = ctx;
    const state = normalizeState(ctx.getState());
    if (!state.wsUrl) {
      return null;
    }
    if (runtime.ws && runtime.ws.readyState <= 1) {
      return runtime.ws;
    }
    try {
      const query = state.token ? (state.wsUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(state.token)}` : '';
      const ws = new window.WebSocket(`${state.wsUrl}${query}`);
      runtime.ws = ws;
      runtime.wsStatus = 'connecting';
      setConnectionStatus('ws', 'connecting');
      ws.onopen = () => {
        runtime.wsStatus = 'connected';
        setConnectionStatus('ws', 'connected');
        if (state.token && !state.wsUrl.includes('token=')) {
          wsSend({ type: 'auth', data: { token: state.token } });
        }
        subscribeTopics(state);
      };
      ws.onclose = () => {
        runtime.wsStatus = 'closed';
        setConnectionStatus('ws', 'closed');
        runtime.ws = null;
      };
      ws.onerror = () => {
        runtime.wsStatus = 'error';
        setConnectionStatus('ws', 'error');
      };
      ws.onmessage = (event) => {
        const message = U.JSON.parseSafe(event.data, null);
        if (!message) return;
        if (message.type === 'publish') {
          message.data = resolveTopicPayload(message.topic, message.data);
          handleSignalMessage(message, state);
          handleChatPublish(message, state);
        } else if (message.type === 'chat:history') {
          const messages = Array.isArray(message.messages) ? message.messages : [];
          messages.forEach(appendChatMessage);
        } else if (message.type === 'ack' && message.event === 'chat:send' && message.message) {
          appendChatMessage(message.message);
        }
      };
      return ws;
    } catch (_err) {
      setConnectionStatus('ws', 'error');
      return null;
    }
  }

  async function postJSON(url, body, headers) {
    return U.Net.post(url, {
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body,
    });
  }

  async function sendOfferToServer(state, offer, candidates) {
    const endpoint = `${state.signalBase.replace(/\/$/, '')}/rtc/${encodeURIComponent(state.conversationId)}/offer`;
    await postJSON(endpoint, {
      sdp: offer.sdp,
      candidates: candidates || [],
      meta: { via: 'client', ts: Date.now() },
    }, getAuthHeaders(state));
  }

  async function sendAnswerToServer(state, answer, candidates) {
    const endpoint = `${state.signalBase.replace(/\/$/, '')}/rtc/${encodeURIComponent(state.conversationId)}/answer`;
    await postJSON(endpoint, {
      sdp: answer.sdp,
      candidates: candidates || [],
      meta: { via: 'client', ts: Date.now() },
    }, getAuthHeaders(state));
  }

  async function sendIceCandidate(state, candidate) {
    if (!candidate) return;
    const endpoint = `${state.signalBase.replace(/\/$/, '')}/rtc/${encodeURIComponent(state.conversationId)}/ice`;
    await postJSON(endpoint, {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      meta: { via: 'client', ts: Date.now() },
    }, getAuthHeaders(state));
  }

  function resetPeerState() {
    if (runtime.dataChannel) {
      runtime.dataChannel.close();
    }
    if (runtime.peer) {
      runtime.peer.close();
    }
    runtime.peer = null;
    runtime.dataChannel = null;
    runtime.remoteStream = null;
    runtime.localStream = null;
    runtime.mediaTracks = { audio: null, video: null };
    setConnectionStatus('dc', 'idle');
  }

  function attachRemoteStream(stream) {
    runtime.remoteStream = stream;
    const video = document.getElementById('realtime-remote-video');
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
    }
  }

  function attachLocalStream(stream) {
    runtime.localStream = stream;
    const video = document.getElementById('realtime-local-video');
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
    }
  }

  function ensureLocalMedia(state) {
    if (runtime.localStream) {
      return runtime.localStream;
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then((stream) => {
        attachLocalStream(stream);
        runtime.mediaTracks.audio = stream.getAudioTracks()[0] || null;
        runtime.mediaTracks.video = stream.getVideoTracks()[0] || null;
        return stream;
      })
      .catch((err) => {
        updateState((s) => ({
          ...s,
          data: {
            ...s.data,
            realtime: {
              ...(s.data?.realtime || {}),
              call: {
                ...(s.data?.realtime?.call || {}),
                lastError: err?.message || 'Media access denied',
              },
            },
          },
        }));
        throw err;
      });
  }

  async function ensurePeerConnection(ctx) {
    runtime.lastCtx = ctx;
    const state = normalizeState(ctx.getState());
    if (runtime.peer) {
      return runtime.peer;
    }
    if (!window.RTCPeerConnection) {
      throw new Error('RTCPeerConnection not supported');
    }
    const peer = new RTCPeerConnection({
      iceServers: state.iceServers,
      iceTransportPolicy: 'relay',
    });
    runtime.peer = peer;
    const dataChannel = peer.createDataChannel('chat', { ordered: true });
    runtime.dataChannel = dataChannel;
    setConnectionStatus('dc', 'connecting');

    dataChannel.onopen = () => {
      setConnectionStatus('dc', 'connected');
    };
    dataChannel.onclose = () => {
      setConnectionStatus('dc', 'closed');
    };
    dataChannel.onerror = () => {
      setConnectionStatus('dc', 'error');
    };
    dataChannel.onmessage = (event) => {
      const payload = U.JSON.parseSafe(event.data, null);
      if (payload && payload.kind === 'chat') {
        appendChatMessage(payload.message);
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendIceCandidate(state, event.candidate).catch(() => {});
      }
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        attachRemoteStream(stream);
      }
    };

    const local = await ensureLocalMedia(state);
    local.getTracks().forEach((track) => peer.addTrack(track, local));

    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await peer.setLocalDescription(offer);
    await sendOfferToServer(state, offer);

    runtime.signalQueue.forEach((signal) => {
      if (signal.kind === 'answer' && signal.sdp) {
        peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp })).catch(() => {});
      }
    });
    runtime.signalQueue = [];
    return peer;
  }

  async function acceptRemoteOffer(signal, state) {
    if (!signal || !signal.sdp) return;
    if (runtime.peer) {
      runtime.peer.close();
    }
    const peer = new RTCPeerConnection({
      iceServers: state.iceServers,
      iceTransportPolicy: 'relay',
    });
    runtime.peer = peer;
    peer.ondatachannel = (event) => {
      runtime.dataChannel = event.channel;
      runtime.dataChannel.onmessage = (ev) => {
        const payload = U.JSON.parseSafe(ev.data, null);
        if (payload && payload.kind === 'chat') {
          appendChatMessage(payload.message);
        }
      };
      runtime.dataChannel.onopen = () => setConnectionStatus('dc', 'connected');
      runtime.dataChannel.onclose = () => setConnectionStatus('dc', 'closed');
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendIceCandidate(state, event.candidate).catch(() => {});
      }
    };
    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) attachRemoteStream(stream);
    };
    const local = await ensureLocalMedia(state);
    local.getTracks().forEach((track) => peer.addTrack(track, local));
    await peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await sendAnswerToServer(state, answer);
  }

  function stopCall() {
    if (runtime.recorder) {
      runtime.recorder.stop();
      runtime.recorder = null;
    }
    if (runtime.localStream) {
      runtime.localStream.getTracks().forEach((track) => track.stop());
    }
    resetPeerState();
    updateState((state) => ({
      ...state,
      data: {
        ...state.data,
        realtime: {
          ...(state.data?.realtime || {}),
          call: {
            ...(state.data?.realtime?.call || {}),
            status: 'idle',
          },
        },
      },
    }));
  }

  async function startCall(ctx) {
    runtime.lastCtx = ctx;
    const state = normalizeState(ctx.getState());
    try {
      await ensurePeerConnection(ctx);
      updateState((s) => ({
        ...s,
        data: {
          ...s.data,
          realtime: {
            ...(s.data?.realtime || {}),
            call: {
              ...(s.data?.realtime?.call || {}),
              status: 'active',
            },
          },
        },
      }));
    } catch (err) {
      updateState((s) => ({
        ...s,
        data: {
          ...s.data,
          realtime: {
            ...(s.data?.realtime || {}),
            call: {
              ...(s.data?.realtime?.call || {}),
              status: 'error',
              lastError: err?.message || 'Call setup failed',
            },
          },
        },
      }));
    }
  }

  function toggleTrack(kind, enabled) {
    const track = kind === 'audio' ? runtime.mediaTracks.audio : runtime.mediaTracks.video;
    if (track) {
      track.enabled = enabled;
    }
  }

  function ensureRecorder(ctx) {
    runtime.lastCtx = ctx;
    if (runtime.recorder) {
      return runtime.recorder;
    }
    const stream = runtime.localStream;
    if (!stream) {
      throw new Error('No local media stream');
    }
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    runtime.recorder = recorder;
    runtime.recorderChunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) {
        runtime.recorderChunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(runtime.recorderChunks, { type: 'audio/webm' });
      runtime.recorderChunks = [];
      updateState((state) => ({
        ...state,
        data: {
          ...state.data,
          realtime: {
            ...(state.data?.realtime || {}),
            voiceNote: {
              ...(state.data?.realtime?.voiceNote || {}),
              draft: blob,
              recording: false,
            },
          },
        },
      }));
    };
    return recorder;
  }

  async function sendVoiceNote(ctx) {
    runtime.lastCtx = ctx;
    const stateRaw = ctx.getState();
    const state = normalizeState(stateRaw);
    const draft = stateRaw.data?.realtime?.voiceNote?.draft;
    if (!draft) {
      return;
    }
    const arrayBuffer = await draft.arrayBuffer();
    const base64 = window.btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const message = encryptText('[voice-note]');
    await postJSON(`${state.signalBase.replace(/\/$/, '')}/conversations/${encodeURIComponent(state.conversationId)}/voice-notes`, {
      ciphertext: message.ciphertext,
      keyId: message.keyId,
      data: base64,
      mimeType: draft.type || 'audio/webm',
      metadata: { client: 'mishkah' },
    }, getAuthHeaders(state));
    updateState((s) => ({
      ...s,
      data: {
        ...s.data,
        realtime: {
          ...(s.data?.realtime || {}),
          voiceNote: {
            ...(s.data?.realtime?.voiceNote || {}),
            draft: null,
          },
        },
      },
    }));
  }

  function chatInputValue(state) {
    return state.ui?.realtime?.chatInput || '';
  }

  function ChatMessagesList(db) {
    const state = db.data?.realtime?.chat || {};
    const messages = state.messages || [];
    return D.Containers.Div({ attrs: { class: tw`flex flex-col gap-2 overflow-y-auto max-h-80 p-2 bg-slate-900/40 rounded-md` } }, [
      D.Lists.Ul({ attrs: { class: tw`space-y-2` } }, messages.map((msg, idx) => (
        D.Lists.Li({ attrs: { class: tw`flex flex-col gap-1 p-2 rounded-md bg-slate-800/70` } }, [
          D.Text.Strong({}, [`#${msg.id || idx + 1}`]),
          D.Text.P({}, [decryptText(msg.ciphertext || '')]),
          msg.metadata && msg.metadata.voiceNote
            ? D.Text.Span({ attrs: { class: tw`text-xs text-amber-300` } }, [`🎤 ${msg.metadata.voiceNote.mimeType || ''}`])
            : null,
        ])
      )))
    ]);
  }

  function ChatComposer(db) {
    const inputId = 'chat-input-box';
    const value = chatInputValue(db);
    return D.Containers.Div({ attrs: { class: tw`flex flex-col gap-2` } }, [
      D.Inputs.Textarea({
        attrs: {
          id: inputId,
          class: tw`w-full rounded-md border border-slate-700 bg-slate-900/60 text-slate-100 p-2 min-h-[4rem]`,
          placeholder: db.env.lang === 'ar' ? 'أكتب رسالة...' : 'Write a message…',
          value,
        },
        events: {
          input: { gkey: 'chat:input' },
        },
      }),
      D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
        D.Forms.Button({ attrs: { class: tw`px-4 py-2 bg-emerald-600 text-white rounded`, 'data-m-gkey': 'chat:send' } }, [
          db.env.lang === 'ar' ? 'إرسال' : 'Send',
        ]),
        D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-slate-700 text-white rounded`, 'data-m-gkey': 'chat:ws:connect' } }, [
          db.env.lang === 'ar' ? 'اتصال WS' : 'Connect WS',
        ]),
        D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-slate-700 text-white rounded`, 'data-m-gkey': 'chat:dc:ensure' } }, [
          db.env.lang === 'ar' ? 'قناة البيانات' : 'Ensure DC',
        ]),
      ]),
    ]);
  }

  function ChatPage(db) {
    const conn = db.data?.realtime?.connection || {};
    return D.Containers.Section({ attrs: { class: tw`space-y-4 p-4` } }, [
      D.Text.H2({}, [db.env.lang === 'ar' ? 'الدردشة' : 'Chat']),
      D.Containers.Div({ attrs: { class: tw`flex items-center gap-4 text-sm text-slate-300` } }, [
        D.Text.Span({}, [`WS: ${conn.ws || 'idle'}`]),
        D.Text.Span({}, [`DC: ${conn.dc || 'idle'}`]),
      ]),
      ChatMessagesList(db),
      ChatComposer(db),
    ]);
  }

  function CallPage(db) {
    const call = db.data?.realtime?.call || {};
    return D.Containers.Section({ attrs: { class: tw`grid gap-4 p-4 md:grid-cols-2` } }, [
      D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
        D.Text.H2({}, [db.env.lang === 'ar' ? 'المكالمة' : 'Call']),
        D.Text.P({}, [call.status === 'active' ? 'Connected' : call.status || 'idle']),
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-emerald-600 text-white rounded`, 'data-m-gkey': 'call:start' } }, [
            db.env.lang === 'ar' ? 'بدء' : 'Start',
          ]),
          D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-rose-600 text-white rounded`, 'data-m-gkey': 'call:end' } }, [
            db.env.lang === 'ar' ? 'إنهاء' : 'End',
          ]),
          D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-slate-700 text-white rounded`, 'data-m-gkey': 'call:toggle-mic' } }, [
            call.micEnabled === false ? (db.env.lang === 'ar' ? 'تشغيل المايك' : 'Unmute') : (db.env.lang === 'ar' ? 'كتم' : 'Mute'),
          ]),
          D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-slate-700 text-white rounded`, 'data-m-gkey': 'call:toggle-cam' } }, [
            call.camEnabled === false ? (db.env.lang === 'ar' ? 'تشغيل الكاميرا' : 'Show Cam') : (db.env.lang === 'ar' ? 'إيقاف الكاميرا' : 'Hide Cam'),
          ]),
        ]),
        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
          D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-amber-600 text-white rounded`, 'data-m-gkey': 'vn:record-toggle' } }, [
            db.data?.realtime?.voiceNote?.recording ? (db.env.lang === 'ar' ? 'إيقاف التسجيل' : 'Stop Rec') : (db.env.lang === 'ar' ? 'تسجيل ملاحظة' : 'Record Note'),
          ]),
          D.Forms.Button({ attrs: { class: tw`px-3 py-2 bg-amber-700 text-white rounded`, 'data-m-gkey': 'vn:send' } }, [
            db.env.lang === 'ar' ? 'إرسال الملاحظة' : 'Send Note',
          ]),
        ]),
      ]),
      D.Containers.Div({ attrs: { class: tw`grid gap-4` } }, [
        D.Media.Video({ attrs: { id: 'realtime-local-video', autoplay: true, muted: true, playsinline: true, class: tw`w-full rounded-lg bg-slate-900 h-48 object-cover` } }),
        D.Media.Video({ attrs: { id: 'realtime-remote-video', autoplay: true, playsinline: true, class: tw`w-full rounded-lg bg-slate-900 h-48 object-cover` } }),
      ]),
    ]);
  }

  const realtimeOrders = {
    'chat:input': {
      on: ['input'],
      gkeys: ['chat:input'],
      handler: (event, ctx) => {
        runtime.lastCtx = ctx;
        const value = event.target?.value || '';
        ctx.setState((state) => ({
          ...state,
          ui: {
            ...(state.ui || {}),
            realtime: {
              ...(state.ui?.realtime || {}),
              chatInput: value,
            },
          },
        }));
      },
    },
    'chat:ws:connect': {
      on: ['click'],
      gkeys: ['chat:ws:connect'],
      handler: (_event, ctx) => {
        setupWebSocket(ctx);
      },
    },
    'chat:dc:ensure': {
      on: ['click'],
      gkeys: ['chat:dc:ensure'],
      handler: (_event, ctx) => {
        ensurePeerConnection(ctx).catch(() => {
          setConnectionStatus('dc', 'error');
        });
      },
    },
    'chat:send': {
      on: ['click'],
      gkeys: ['chat:send'],
      handler: (_event, ctx) => {
        runtime.lastCtx = ctx;
        const state = ctx.getState();
        const rt = normalizeState(state);
        const value = chatInputValue(state);
        if (!value) return;
        const payload = encryptText(value);
        const message = {
          conversationId: rt.conversationId,
          ciphertext: payload.ciphertext,
          keyId: payload.keyId,
          metadata: { via: rt.chat.transport || 'dc', ts: Date.now() },
        };
        if (runtime.dataChannel && runtime.dataChannel.readyState === 'open') {
          runtime.dataChannel.send(JSON.stringify({ kind: 'chat', message }));
          appendChatMessage(message);
        } else {
          setupWebSocket(ctx);
          wsSend({
            type: 'chat:send',
            conversationId: rt.conversationId,
            data: message,
          });
        }
        ctx.setState((s) => ({
          ...s,
          ui: {
            ...(s.ui || {}),
            realtime: {
              ...(s.ui?.realtime || {}),
              chatInput: '',
            },
          },
        }));
      },
    },
    'call:start': {
      on: ['click'],
      gkeys: ['call:start'],
      handler: (_event, ctx) => {
        setupWebSocket(ctx);
        startCall(ctx);
      },
    },
    'call:end': {
      on: ['click'],
      gkeys: ['call:end'],
      handler: () => {
        stopCall();
      },
    },
    'call:toggle-mic': {
      on: ['click'],
      gkeys: ['call:toggle-mic'],
      handler: (_event, ctx) => {
        runtime.lastCtx = ctx;
        ctx.setState((state) => {
          const enabled = !(state.data?.realtime?.call?.micEnabled === false);
          toggleTrack('audio', !enabled);
          return {
            ...state,
            data: {
              ...state.data,
              realtime: {
                ...(state.data?.realtime || {}),
                call: {
                  ...(state.data?.realtime?.call || {}),
                  micEnabled: !enabled,
                },
              },
            },
          };
        });
      },
    },
    'call:toggle-cam': {
      on: ['click'],
      gkeys: ['call:toggle-cam'],
      handler: (_event, ctx) => {
        runtime.lastCtx = ctx;
        ctx.setState((state) => {
          const enabled = !(state.data?.realtime?.call?.camEnabled === false);
          toggleTrack('video', !enabled);
          return {
            ...state,
            data: {
              ...state.data,
              realtime: {
                ...(state.data?.realtime || {}),
                call: {
                  ...(state.data?.realtime?.call || {}),
                  camEnabled: !enabled,
                },
              },
            },
          };
        });
      },
    },
    'vn:record-toggle': {
      on: ['click'],
      gkeys: ['vn:record-toggle'],
      handler: (_event, ctx) => {
        runtime.lastCtx = ctx;
        const state = ctx.getState();
        const recording = state.data?.realtime?.voiceNote?.recording;
        if (recording && runtime.recorder) {
          runtime.recorder.stop();
          return;
        }
        ensureRecorder(ctx);
        if (runtime.recorder) {
          runtime.recorder.start();
          ctx.setState((s) => ({
            ...s,
            data: {
              ...s.data,
              realtime: {
                ...(s.data?.realtime || {}),
                voiceNote: {
                  ...(s.data?.realtime?.voiceNote || {}),
                  recording: true,
                },
              },
            },
          }));
        }
      },
    },
    'vn:send': {
      on: ['click'],
      gkeys: ['vn:send'],
      handler: (_event, ctx) => {
        sendVoiceNote(ctx).catch(() => {
          updateState((s) => ({
            ...s,
            data: {
              ...s.data,
              realtime: {
                ...(s.data?.realtime || {}),
                voiceNote: {
                  ...(s.data?.realtime?.voiceNote || {}),
                  lastError: 'Failed to send voice note',
                },
              },
            },
          }));
        });
      },
    },
  };

  function createRealtimeApp(options) {
    const cfg = options || {};
    const database = {
      template: cfg.template || 'PagesShell',
      theme: cfg.theme || 'dark',
      env: { theme: cfg.theme || 'dark', lang: cfg.lang || 'ar', dir: cfg.lang === 'en' ? 'ltr' : 'rtl' },
      pages: [
        { key: 'chat', icon: '💬', label: { ar: 'دردشة', en: 'Chat' }, dsl: ChatPage },
        { key: 'call', icon: '🎥', label: { ar: 'مكالمة', en: 'Call' }, dsl: CallPage },
      ],
      data: {
        realtime: {
          conversationId: cfg.conversationId || DEFAULT_CONVERSATION,
          signalBase: cfg.signalBase || DEFAULT_SIGNAL_BASE,
          wsUrl: cfg.wsUrl || DEFAULT_WS_URL,
          token: cfg.token || null,
          chat: { messages: [], transport: 'dc' },
          connection: { ws: 'idle', dc: 'idle' },
          call: { status: 'idle', micEnabled: true, camEnabled: true },
          voiceNote: { recording: false, draft: null },
          iceServers: cfg.iceServers || [],
        },
      },
      ui: {
        realtime: { chatInput: '' },
      },
    };

    const app = M.Pages.createV2({
      ...database,
      orders: realtimeOrders,
    });
    runtime.app = app;
    return app;
  }

  M.Realtime = {
    create: createRealtimeApp,
    orders: realtimeOrders,
    encryptText,
    decryptText,
  };
})(typeof window !== 'undefined' ? window : this);
