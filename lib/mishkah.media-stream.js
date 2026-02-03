/**
 * Mishkah Media Stream Kit
 * Unified helper for media upload, preview, and streaming playback.
 *
 * Dependencies: none (optional: Mishkah utils for logging)
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    uploadEndpoint: (global.__MISHKAH_MEDIA_ENDPOINT__ || '/api/uploads'),
    chunkSize: 2 * 1024 * 1024,
    maxConcurrent: 2,
    timeoutMs: 30000,
    accept: ['video/mp4', 'video/webm', 'image/jpeg', 'image/png']
  };

  function merge(base, extra) {
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    for (k in (extra || {})) out[k] = extra[k];
    return out;
  }

  function createLogger(prefix) {
    return {
      info: function () {
        if (global.console && console.info) console.info.apply(console, [prefix].concat([].slice.call(arguments)));
      },
      warn: function () {
        if (global.console && console.warn) console.warn.apply(console, [prefix].concat([].slice.call(arguments)));
      },
      error: function () {
        if (global.console && console.error) console.error.apply(console, [prefix].concat([].slice.call(arguments)));
      }
    };
  }

  function MediaStreamKit(config) {
    this.config = merge(DEFAULTS, config || {});
    this.log = createLogger('[MediaStreamKit]');
  }

  MediaStreamKit.prototype.isSupported = function () {
    return !!(global.MediaSource || global.HTMLMediaElement);
  };

  MediaStreamKit.prototype.ensureFile = function (file) {
    if (!file) throw new Error('media file is required');
    if (this.config.accept && this.config.accept.length && this.config.accept.indexOf(file.type) === -1) {
      throw new Error('unsupported media type: ' + file.type);
    }
    return file;
  };

  MediaStreamKit.prototype.createPreviewURL = function (file) {
    this.ensureFile(file);
    return URL.createObjectURL(file);
  };

  MediaStreamKit.prototype.createVideoElement = function (opts) {
    var video = global.document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    if (opts && opts.loop) video.loop = true;
    if (opts && opts.muted) video.muted = true;
    if (opts && opts.className) video.className = opts.className;
    return video;
  };

  MediaStreamKit.prototype.upload = async function (file, meta) {
    this.ensureFile(file);
    var config = this.config;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, config.timeoutMs);

    var body = new FormData();
    body.append('file', file, file.name || 'media');
    if (meta && typeof meta === 'object') {
      Object.keys(meta).forEach(function (key) {
        body.append(key, meta[key]);
      });
    }

    try {
      var res = await fetch(config.uploadEndpoint, {
        method: 'POST',
        body: body,
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error('upload failed with status ' + res.status);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  MediaStreamKit.prototype.uploadInChunks = async function (file, meta) {
    this.ensureFile(file);
    var config = this.config;
    var total = Math.ceil(file.size / config.chunkSize);
    var responses = [];
    for (var i = 0; i < total; i++) {
      var start = i * config.chunkSize;
      var end = Math.min(file.size, start + config.chunkSize);
      var chunk = file.slice(start, end);
      var payload = new FormData();
      payload.append('file', chunk, file.name || 'media');
      payload.append('chunk_index', String(i));
      payload.append('chunk_total', String(total));
      if (meta && typeof meta === 'object') {
        Object.keys(meta).forEach(function (key) {
          payload.append(key, meta[key]);
        });
      }
      var res = await fetch(config.uploadEndpoint, { method: 'POST', body: payload });
      if (!res.ok) {
        throw new Error('chunk upload failed at ' + i + ' with status ' + res.status);
      }
      responses.push(await res.json());
    }
    return responses;
  };

  MediaStreamKit.prototype.attachSource = function (video, url, type) {
    if (!video) throw new Error('video element required');
    if (!url) throw new Error('media url required');
    if (type) {
      var source = global.document.createElement('source');
      source.src = url;
      source.type = type;
      video.appendChild(source);
    } else {
      video.src = url;
    }
    return video;
  };

  MediaStreamKit.prototype.stream = function (video, url, opts) {
    this.attachSource(video, url, opts && opts.type);
    if (opts && opts.autoplay) {
      video.autoplay = true;
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    }
    return video;
  };

  MediaStreamKit.prototype.buildReel = function (items) {
    return (items || []).map(function (item) {
      return {
        id: item.id,
        title: item.title || item.caption || '',
        mediaUrl: item.media_url || item.mediaUrl,
        mediaType: item.media_type || item.mediaType || 'video/mp4',
        coverUrl: item.cover_url || item.coverUrl || '',
        stats: item.stats || { likes: 0, comments: 0 }
      };
    });
  };

  global.MishkahMedia = {
    create: function (config) {
      return new MediaStreamKit(config);
    },
    MediaStreamKit: MediaStreamKit
  };
})(window);
