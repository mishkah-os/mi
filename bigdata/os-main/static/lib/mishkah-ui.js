// mishkah-ui.js — Modern UI (tokens + components + working events)
(function (w) {
  'use strict';

  const M = w.Mishkah, U = M.utils, h = M.DSL;
  const { tw, token, def, cx } = U.twcss;

  /* ===================== Tokens (Design System) ===================== */
  def({
    // base & layout
    'surface': 'bg-[var(--background)] text-[var(--foreground)]',
    'hstack': 'flex items-center gap-2',
    'vstack': 'flex flex-col gap-2',
    'divider': 'h-px bg-[var(--border)]',
    'ring-base': 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
    'scrollarea': 'overflow-y-auto overscroll-contain [scrollbar-gutter:stable] pr-2',
    'split': 'flex items-center justify-between gap-2',
    'muted': 'text-[var(--muted-foreground)]',

    // buttons
    'btn': 'inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-colors ring-base disabled:opacity-50 disabled:pointer-events-none',
    'btn/sm': 'h-9  px-3',
    'btn/md': 'h-10 px-3',
    'btn/lg': 'h-11 px-5',
    'btn/solid': 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in oklab,var(--primary) 90%, black)]',
    'btn/soft': 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[color-mix(in oklab,var(--secondary) 85%, black)]',
    'btn/ghost': 'hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
    'btn/link': 'text-[var(--primary)] underline underline-offset-4 hover:underline',
    'btn/destructive': 'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[color-mix(in oklab,var(--destructive) 88%, black)]',
    'btn/icon': 'w-10 h-10 p-0 aspect-square',
    'btn/with-icon': 'gap-2',

    // badges & chips
    'badge': 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-[var(--accent)] text-[var(--accent-foreground)]',
    'badge/ghost': 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-transparent text-[var(--muted-foreground)] border border-[var(--border)]',
    'chip': 'inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-sm transition-colors cursor-pointer bg-[var(--surface-1)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
    'chip/active': 'bg-[var(--primary)] text-[var(--foreground)] font-semibold shadow-[var(--shadow)] border border-[color-mix(in oklab,var(--primary) 65%, transparent)] dark:text-[var(--primary-foreground)]',
    'pill': 'inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--muted-foreground)]',

    // card / panels
    'card': 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[var(--shadow)]',
    'card/soft-1': 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] text-[var(--card-foreground)] shadow-[var(--shadow)]',
    'card/soft-2': 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--card-foreground)] shadow-[var(--shadow)]',
    'card/header': 'flex flex-col space-y-1.5 p-6',
    'card/content': 'p-6 pt-0',
    'card/footer': 'flex items-center p-6 pt-0',
    'card/title': 'text-lg font-semibold leading-none tracking-tight',
    'card/desc': 'text-sm text-[var(--muted-foreground)]',

    // bars
    'toolbar': 'sticky top-0 z-[520] flex h-14 w-full shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in oklab,var(--background) 84%, transparent)]/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in oklab,var(--background) 82%, transparent)]/75',
    'toolbar/section': 'flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    'toolbar/section-end': 'flex shrink-0 items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    'toolbar/group': 'flex shrink-0 items-center gap-2 rounded-full border border-[color-mix(in oklab,var(--border) 70%, transparent)] bg-[color-mix(in oklab,var(--surface-1) 90%, transparent)] px-3 py-1.5 shadow-sm backdrop-blur-sm',
    'toolbar/group-label': 'text-[10px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in oklab,var(--muted-foreground) 92%, var(--foreground)/35%)]',
    'footerbar': 'flex shrink-0 items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]',

    // inputs
    'input': 'flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none',
    'label': 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',

    // overlay
    'modal-root': 'fixed inset-0 z-50 grid place-items-center px-4 py-8 sm:py-12 overflow-y-auto',
    'backdrop': 'absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto',
    'modal-card': 'relative z-10 max-h-[92vh] flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[0_24px_48px_-16px_rgba(15,23,42,0.45)] pointer-events-auto',
    'modal/sm': 'w-[min(420px,92vw)]',
    'modal/md': 'w-[min(640px,94vw)]',
    'modal/lg': 'w-[min(820px,96vw)]',
    'modal/xl': 'w-[min(980px,96vw)]',
    'modal/full': 'w-[100vw] max-h-[94vh]',
    'modal/header': 'flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--card)] px-6 pt-6 pb-4 backdrop-blur-sm',
    'modal/body': 'flex-1 overflow-y-auto bg-[var(--card)] px-6 py-5',
    'modal/footer': 'flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--card)] px-6 py-4 sm:flex-row',

    // numpad
    'numpad/root': 'flex flex-col gap-4',
    'numpad/display': 'rounded-[var(--radius)] border-2 border-[color-mix(in oklab,var(--primary) 45%, transparent)] bg-[color-mix(in oklab,var(--card) 88%, var(--primary)/10%)] px-6 py-6 text-center text-3xl font-semibold tracking-[0.08em] leading-tight text-[var(--foreground)] shadow-[0_22px_48px_-24px_rgba(15,23,42,0.65)] transition-all',
    'numpad/grid': 'grid grid-cols-3 gap-3',
    'numpad/key': 'inline-flex h-20 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-2xl font-semibold text-[var(--foreground)] shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] transition-transform duration-150 ease-out hover:-translate-y-1 hover:shadow-[0_26px_48px_-20px_rgba(15,23,42,0.55)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] select-none',
    'numpad/key-disabled': 'inline-flex h-20 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-2xl font-semibold text-[var(--muted-foreground)] opacity-60',
    'numpad/actions': 'flex items-center gap-3',
    'numpad/utility': 'inline-flex h-16 flex-1 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-lg font-semibold text-[var(--foreground)] shadow-[0_18px_36px_-22px_rgba(15,23,42,0.55)] transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_26px_48px_-18px_rgba(15,23,42,0.55)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] select-none',
    'numpad/confirm': 'rounded-2xl shadow-[0_24px_54px_-22px_rgba(59,130,246,0.65)] hover:-translate-y-0.5 active:translate-y-0',

    // tabs
    'tabs/row': 'flex items-center gap-2 flex-wrap',
    'tabs/btn': 'px-3 py-1.5 rounded-full hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
    'tabs/btn-active': 'bg-[var(--primary)] text-[var(--foreground)] font-semibold shadow-[var(--shadow)] dark:text-[var(--primary-foreground)]',

    // drawer
    'drawer/side': 'fixed inset-y-0 w-[280px] border-s bg-[var(--card)] text-[var(--card-foreground)] shadow-[var(--shadow)]',
    'drawer/body': 'p-4 h-full flex flex-col gap-2',

    // list
    'list': 'flex flex-col gap-2',
    'list/item': 'flex items-start gap-3 rounded-[var(--radius)] border border-transparent bg-[var(--surface-1)] px-3 py-2 transition hover:border-[var(--border)]',
    'list/item-leading': 'flex items-center justify-center rounded-[var(--radius)] bg-[var(--surface-2)] text-xl w-10 h-10',
    'list/item-content': 'flex flex-col gap-1 text-sm',
    'list/item-trailing': 'ms-auto flex items-center gap-2 text-sm',

    // empty state
    'empty': 'flex flex-col items-center justify-center gap-2 text-center py-12 text-[var(--muted-foreground)]',

    // support
    'badge/status': 'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full',
    'status/online': 'bg-emerald-500/15 text-emerald-500',
    'status/offline': 'bg-rose-500/15 text-rose-400',
    'status/idle': 'bg-amber-500/15 text-amber-500',
    'stat/card': 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-3',
    'stat/value': 'text-2xl font-semibold text-[var(--primary)]',
    'scroll-panel': 'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] flex flex-col overflow-hidden',
    'scroll-panel/head': 'px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2',
    'scroll-panel/body': 'flex-1 min-h-0',
    'scroll-panel/footer': 'px-4 py-3 border-t border-[var(--border)]',

    // toast
    'toast/host': 'fixed inset-x-0 bottom-4 z-[60] px-3 pointer-events-none',
    'toast/col': 'flex flex-col gap-2 max-w-[560px] mx-auto pointer-events-none',
    'toast/item': 'p-3 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[var(--shadow)] pointer-events-auto'
  });

  /* ===================== Helpers ===================== */
  function withClass(attrs, add) { const a = Object.assign({}, attrs || {}); a.class = tw(cx(add, a.class || '')); return a }

  /* ===================== Components ===================== */
  const UI = M.UI = M.UI || {};

  /* ===================== Chart.js Bridge & Components ===================== */
  const ChartBridge = (() => {
    const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
    const parseSafe = U.JSON && typeof U.JSON.parseSafe === 'function' ? U.JSON.parseSafe : (value => {
      try { return JSON.parse(value); } catch (_err) { return null; }
    });
    const clone = U.JSON && typeof U.JSON.clone === 'function' ? U.JSON.clone : (value => {
      try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return null; }
    });
    const stableStringify = U.JSON && typeof U.JSON.stableStringify === 'function'
      ? U.JSON.stableStringify
      : (value => {
        try { return JSON.stringify(value); } catch (_err) { return ''; }
      });
    const deepMerge = U.Data && typeof U.Data.deepMerge === 'function'
      ? U.Data.deepMerge
      : ((target, source) => {
        const base = Object.assign({}, target || {});
        if (!source || typeof source !== 'object') return base;
        Object.keys(source).forEach((key) => {
          const next = source[key];
          if (next && typeof next === 'object' && !Array.isArray(next)) {
            base[key] = deepMerge(base[key], next);
          } else {
            base[key] = next;
          }
        });
        return base;
      });
    const registry = new WeakMap();
    const scheduled = new Set();
    const scriptPromises = new Map();
    let cdnUrl = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js';
    let fallbackUrl = './vendor/chart.umd.min.js';
    let libraryPromise = null;

    const warnedPaths = new Set();

    function warnNonSerializable(path, kind) {
      if (!path) return;
      const key = Array.isArray(path) ? path.join('.') : String(path);
      if (warnedPaths.has(key)) return;
      warnedPaths.add(key);
      if (M.Auditor && typeof M.Auditor.warn === 'function') {
        M.Auditor.warn('W-CHART-SERIAL', 'تم تجاهل قيمة غير قابلة للنسخ ضمن إعدادات Chart.js', {
          path: key,
          kind: kind || typeof kind
        });
      }
    }

    function sanitizeValue(value, path) {
      if (value == null) return value;
      const type = typeof value;
      if (type === 'function') {
        warnNonSerializable(path, 'function');
        return null;
      }
      if (type !== 'object') {
        return value;
      }
      if (value instanceof Date) {
        return new Date(value.getTime());
      }
      if (Array.isArray(value)) {
        return value.map((item, index) => sanitizeValue(item, (path || []).concat(index)));
      }
      const out = {};
      Object.keys(value).forEach((key) => {
        out[key] = sanitizeValue(value[key], (path || []).concat(key));
      });
      return out;
    }

    const formatterResolvers = {
      percent: (descriptor) => {
        const digits = Number.isFinite(descriptor?.digits) ? descriptor.digits : 0;
        const suffix = typeof descriptor?.suffix === 'string' ? descriptor.suffix : '%';
        const scale = Number.isFinite(descriptor?.scale) ? descriptor.scale : 1;
        return (value) => {
          const numeric = typeof value === 'number' ? value : parseFloat(value);
          if (Number.isFinite(numeric)) {
            const scaled = numeric * scale;
            const formatted = Number.isFinite(digits) ? scaled.toFixed(digits) : String(scaled);
            return `${formatted}${suffix}`;
          }
          return `${value}${suffix}`;
        };
      },
      currency: (descriptor) => {
        const currency = typeof descriptor?.currency === 'string' ? descriptor.currency : 'USD';
        const locale = typeof descriptor?.locale === 'string' ? descriptor.locale : undefined;
        const digits = Number.isFinite(descriptor?.digits) ? descriptor.digits : 0;
        const formatter = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: digits,
          maximumFractionDigits: digits
        });
        return (value) => {
          const numeric = typeof value === 'number' ? value : parseFloat(value);
          if (Number.isFinite(numeric)) {
            return formatter.format(numeric);
          }
          return formatter.format(0);
        };
      },
      compact: (descriptor) => {
        const locale = typeof descriptor?.locale === 'string' ? descriptor.locale : undefined;
        const digits = Number.isFinite(descriptor?.digits) ? descriptor.digits : 1;
        const formatter = new Intl.NumberFormat(locale, {
          notation: 'compact',
          maximumFractionDigits: digits
        });
        return (value) => {
          const numeric = typeof value === 'number' ? value : parseFloat(value);
          if (Number.isFinite(numeric)) {
            return formatter.format(numeric);
          }
          return formatter.format(0);
        };
      }
    };

    function isFormatterDescriptor(value) {
      return value && typeof value === 'object' && !Array.isArray(value) && typeof value.__chartFormatter === 'string';
    }

    function resolveFormatter(descriptor) {
      const resolver = formatterResolvers[descriptor?.__chartFormatter];
      if (typeof resolver === 'function') {
        return resolver(descriptor);
      }
      return null;
    }

    function reviveScriptables(target) {
      if (!target) return target;
      if (Array.isArray(target)) {
        for (let i = 0; i < target.length; i += 1) {
          target[i] = reviveScriptables(target[i]);
        }
        return target;
      }
      if (typeof target !== 'object') {
        return target;
      }
      if (isFormatterDescriptor(target)) {
        const fn = resolveFormatter(target);
        return fn || target;
      }
      Object.keys(target).forEach((key) => {
        const value = target[key];
        if ((key === 'callback' || key === 'formatter' || key === 'generateLabel' || key === 'label') && isFormatterDescriptor(value)) {
          const fn = resolveFormatter(value);
          if (fn) {
            target[key] = fn;
            return;
          }
        }
        target[key] = reviveScriptables(value);
      });
      return target;
    }

    function loadScript(url) {
      if (!url || typeof document === 'undefined') {
        return Promise.reject(new Error('EMPTY_CHART_SOURCE'));
      }
      const trimmed = String(url).trim();
      if (!trimmed) {
        return Promise.reject(new Error('EMPTY_CHART_SOURCE'));
      }
      if (globalObj.Chart && typeof globalObj.Chart === 'function') {
        return Promise.resolve(globalObj.Chart);
      }
      if (scriptPromises.has(trimmed)) {
        return scriptPromises.get(trimmed);
      }
      const promise = new Promise((resolve, reject) => {
        try {
          const script = document.createElement('script');
          script.src = trimmed;
          script.async = true;
          script.setAttribute('data-chart-bridge', trimmed);
          script.onload = () => resolve(globalObj.Chart || null);
          script.onerror = (err) => reject(err || new Error('CHART_SCRIPT_ERROR'));
          document.head.appendChild(script);
        } catch (err) {
          reject(err);
        }
      });
      const managed = promise.then(
        (value) => value,
        (error) => {
          scriptPromises.delete(trimmed);
          throw error;
        }
      );
      scriptPromises.set(trimmed, managed);
      return managed;
    }

    function tryLoadLibrary() {
      if (globalObj.Chart && typeof globalObj.Chart === 'function') {
        return Promise.resolve(globalObj.Chart);
      }
      const sources = [cdnUrl].filter(Boolean);
      if (fallbackUrl && fallbackUrl !== cdnUrl) {
        sources.push(fallbackUrl);
      }
      let attempt = Promise.reject(new Error('UNINITIALIZED_CHART_LOAD'));
      sources.forEach((source) => {
        attempt = attempt.catch(() => loadScript(source).then((lib) => {
          if (lib && typeof lib === 'function') {
            return lib;
          }
          if (globalObj.Chart && typeof globalObj.Chart === 'function') {
            return globalObj.Chart;
          }
          return Promise.reject(new Error('CHART_GLOBAL_UNAVAILABLE'));
        }));
      });
      return attempt;
    }

    function ensureLibrary() {
      if (globalObj.Chart && typeof globalObj.Chart === 'function') {
        return Promise.resolve(globalObj.Chart);
      }
      if (!libraryPromise) {
        libraryPromise = tryLoadLibrary().catch((err) => {
          if (M.Auditor && typeof M.Auditor.warn === 'function') {
            M.Auditor.warn('W-CHART', 'تعذر تحميل مكتبة Chart.js', { error: String(err) });
          }
          libraryPromise = null;
          return null;
        });
      }
      return libraryPromise.then((lib) => {
        if (lib && typeof lib === 'function') {
          return lib;
        }
        if (globalObj.Chart && typeof globalObj.Chart === 'function') {
          return globalObj.Chart;
        }
        return null;
      });
    }

    function encodePayload(payload) {
      return stableStringify(payload || {});
    }

    function buildPayload(type, data, options) {
      const safeData = (data && typeof data === 'object') ? sanitizeValue(data, ['data']) : { labels: [], datasets: [] };
      if (!Array.isArray(safeData.datasets)) safeData.datasets = [];
      const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              boxWidth: 12,
              boxHeight: 12
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(71,85,105,0.75)' }
          },
          y: {
            grid: { color: 'rgba(148,163,184,0.18)' },
            ticks: { color: 'rgba(71,85,105,0.75)', beginAtZero: true }
          }
        },
        elements: {
          line: { borderWidth: 2, tension: 0.4 },
          point: { radius: 3, hoverRadius: 6 }
        }
      };
      const safeOptions = (options && typeof options === 'object') ? sanitizeValue(options, ['options']) : {};
      const merged = deepMerge(baseOptions, safeOptions);
      return { type, data: safeData, options: merged };
    }

    function instantiate(node, signature, payload, ChartLib) {
      console.log('[INSTANTIATE] ========== Chart instantiate START ==========');
      console.log('[INSTANTIATE] Node:', node);
      console.log('[INSTANTIATE] Signature:', signature.substring(0, 100) + '...');
      console.log('[INSTANTIATE] Payload type:', payload.type);

      if (!node || !ChartLib) {
        console.error('[INSTANTIATE] Missing node or ChartLib!');
        return null;
      }
      const ctx = node.getContext ? node.getContext('2d') : null;
      if (!ctx) {
        console.error('[INSTANTIATE] Failed to get 2d context!');
        return null;
      }
      const current = registry.get(node);
      console.log('[INSTANTIATE] Current registry entry:', current ? 'EXISTS' : 'NULL');

      // If signature matches exactly, return existing instance (no changes needed)
      if (current && current.signature === signature) {
        console.log('[INSTANTIATE] Signature matches, returning existing instance');
        return current.instance;
      }

      // If chart exists but signature differs, try to UPDATE instead of recreating
      if (current && current.instance && typeof current.instance.update === 'function') {
        const existingType = current.instance.config && current.instance.config.type;
        const newType = payload.type;
        console.log('[INSTANTIATE] Found existing chart, type:', existingType, '→', newType);

        // Only update if chart type is the same (can't change type without recreating)
        if (existingType === newType) {
          try {
            console.log('[INSTANTIATE] Updating existing chart...');
            // Update chart data and options using Chart.js update API
            const newData = clone(payload.data);
            const newOptions = clone(payload.options);
            reviveScriptables(newData);
            reviveScriptables(newOptions);

            // Update data (labels and datasets)
            if (newData.labels) {
              current.instance.data.labels = newData.labels;
              console.log('[INSTANTIATE] Updated labels:', newData.labels.length, 'items');
            }
            if (Array.isArray(newData.datasets)) {
              current.instance.data.datasets = newData.datasets;
              console.log('[INSTANTIATE] Updated datasets:', newData.datasets.length, 'datasets');
            }

            // Update options (merge with existing)
            if (newOptions && typeof newOptions === 'object') {
              Object.assign(current.instance.options, newOptions);
              console.log('[INSTANTIATE] Updated options');
            }

            // Trigger Chart.js update with animation
            console.log('[INSTANTIATE] Calling chart.update("active")...');
            current.instance.update('active');
            console.log('[INSTANTIATE] chart.update() completed');

            // Update signature in registry
            registry.set(node, { instance: current.instance, signature });
            console.log('[INSTANTIATE] ✓ Chart updated successfully');

            return current.instance;
          } catch (updateErr) {
            // If update fails, fall through to destroy and recreate
            console.error('[INSTANTIATE] Update failed:', updateErr);
            if (M.Auditor && typeof M.Auditor.warn === 'function') {
              M.Auditor.warn('W-CHART', 'فشل تحديث الرسم البياني، سيتم إعادة الإنشاء', { error: String(updateErr) });
            }
          }
        } else {
          console.log('[INSTANTIATE] Chart type changed, will recreate');
        }

        // Chart type changed or update failed - destroy and recreate
        console.log('[INSTANTIATE] Destroying old chart...');
        try { current.instance.destroy(); } catch (_err) { console.error('[INSTANTIATE] Destroy error:', _err); }
      }

      // Create new chart instance
      try {
        console.log('[INSTANTIATE] Creating NEW chart instance...');
        const config = {
          type: payload.type,
          data: clone(payload.data),
          options: clone(payload.options)
        };
        reviveScriptables(config.data);
        reviveScriptables(config.options);
        const chart = new ChartLib(ctx, config);
        registry.set(node, { instance: chart, signature });
        console.log('[INSTANTIATE] ✓ New chart created successfully');
        console.log('[INSTANTIATE] ========== Chart instantiate END ==========');
        return chart;
      } catch (err) {
        console.error('[INSTANTIATE] ✗ Failed to create chart:', err);
        if (M.Auditor && typeof M.Auditor.error === 'function') {
          M.Auditor.error('E-CHART', 'فشل إنشاء الرسم البياني', { error: String(err) });
        }
        return null;
      }
    }

    function hydrateNow(root) {
      if (typeof document === 'undefined') return;
      const scope = (!root || root === document) ? document : root;
      const nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-m-chart]') : [];
      if (!nodes.length) return;
      ensureLibrary().then((ChartLib) => {
        if (!ChartLib) return;
        nodes.forEach((node) => {
          const raw = node.getAttribute('data-m-chart');
          if (!raw) return;
          const payload = parseSafe(raw, null);
          if (!payload || !payload.type) return;
          instantiate(node, raw, payload, ChartLib);
        });
      });
    }

    function scheduleHydrate(root, attempt = 0) {
      if (typeof window === 'undefined') return;
      const key = root || document;
      if (scheduled.has(key)) return;
      scheduled.add(key);
      const run = () => {
        scheduled.delete(key);
        const scope = (!root || root === document) ? document : root;
        const nodes = scope && scope.querySelectorAll ? scope.querySelectorAll('[data-m-chart]') : [];
        if (!nodes || nodes.length === 0) {
          if (attempt < 4) {
            scheduleHydrate(root, attempt + 1);
          }
          return;
        }
        hydrateNow(root || document);
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(run);
      } else {
        setTimeout(run, 16);
      }
    }

    function bindApp(app, mount) {
      if (!app || typeof document === 'undefined') return null;
      const resolveRoot = () => {
        if (typeof mount === 'string') {
          return document.querySelector(mount) || document;
        }
        return mount || document;
      };
      const target = resolveRoot();

      let observer = null;
      function watchForCharts(root) {
        if (typeof MutationObserver === 'undefined') return;
        if (observer || !root || root === document) return;
        if (root.querySelector && root.querySelector('[data-m-chart]')) return;
        observer = new MutationObserver(() => {
          if (!root.querySelector('[data-m-chart]')) return;
          if (observer) {
            observer.disconnect();
            observer = null;
          }
          scheduleHydrate(root);
        });
        observer.observe(root, { childList: true, subtree: true });
      }

      scheduleHydrate(target);
      watchForCharts(target);

      const original = app.rebuild;
      app.rebuild = function patchedRebuild() {
        const result = original.apply(app, arguments);
        const root = resolveRoot();
        scheduleHydrate(root);
        watchForCharts(root);
        return result;
      };
      return {
        unbind() {
          app.rebuild = original;
          if (observer) {
            observer.disconnect();
            observer = null;
          }
        }
      };
    }

    function setCDN(url) {
      if (typeof url === 'string' && url.trim()) {
        cdnUrl = url.trim();
        libraryPromise = null;
      }
    }

    function setFallback(url) {
      if (typeof url === 'string' && url.trim()) {
        fallbackUrl = url.trim();
        libraryPromise = null;
      }
    }

    const formatters = {
      percent: (digits = 0, options = {}) => ({ __chartFormatter: 'percent', digits, suffix: typeof options.suffix === 'string' ? options.suffix : '%', scale: Number.isFinite(options.scale) ? options.scale : 1 }),
      currency: (currency = 'USD', options = {}) => ({ __chartFormatter: 'currency', currency, locale: options.locale, digits: Number.isFinite(options.digits) ? options.digits : 0 }),
      compact: (digits = 1, options = {}) => ({ __chartFormatter: 'compact', digits, locale: options.locale })
    };

    return { buildPayload, encodePayload, hydrate: scheduleHydrate, bindApp, ensureLibrary, setCDN, setFallback, formatters };
  })();

  function ChartCanvas({ type = 'line', data, options, attrs = {}, height = 320, description, id }) {
    const payload = ChartBridge.buildPayload(type, data, options);
    const baseClass = cx('mishkah-chart-canvas', tw`block w-full`);
    const canvasAttrs = withClass(attrs, baseClass);
    canvasAttrs['data-m-chart'] = ChartBridge.encodePayload(payload);
    canvasAttrs['data-chart-type'] = type;
    if (description && !('aria-label' in canvasAttrs)) {
      canvasAttrs['aria-label'] = description;
    }
    if (id && !('id' in canvasAttrs)) {
      canvasAttrs.id = id;
    }
    const style = canvasAttrs.style ? String(canvasAttrs.style) + ';' : '';
    if (height != null && height !== false) {
      if (!('height' in canvasAttrs)) canvasAttrs.height = height;
      canvasAttrs.style = `${style}min-height:${height}px;`; // keep intrinsic height
    } else if (style) {
      canvasAttrs.style = style;
    }
    if (!('role' in canvasAttrs)) {
      canvasAttrs.role = 'img';
    }
    return h.Embedded.Canvas({ attrs: canvasAttrs });
  }

  function createChartFactory(defaultType) {
    return (config = {}) => ChartCanvas(Object.assign({ type: defaultType }, config));
  }

  const ChartAPI = Object.assign({
    Canvas: ChartCanvas,
    factory: createChartFactory,
    Line: createChartFactory('line'),
    Bar: createChartFactory('bar'),
    Doughnut: createChartFactory('doughnut'),
    Pie: createChartFactory('pie'),
    Radar: createChartFactory('radar'),
    PolarArea: createChartFactory('polarArea')
  }, ChartBridge);

  ChartAPI.formatters = Object.assign({}, ChartBridge.formatters);

  UI.Chart = ChartAPI;
  UI.Charts = ChartAPI;


  UI.AppRoot = ({ shell, overlays }) =>
    h.Containers.Div({ attrs: { class: tw`${token('surface')} flex h-screen min-h-screen flex-col overflow-hidden` } }, [shell, ...(overlays || [])]);

  UI.Toolbar = ({ left = [], right = [] }) => {
    const leftContent = Array.isArray(left) ? left.filter(Boolean) : [];
    const rightContent = Array.isArray(right) ? right.filter(Boolean) : [];
    return h.Containers.Header({ attrs: { class: tw`${token('toolbar')}`, style: '--toolbar-height:3.5rem;' } }, [
      h.Containers.Div({ attrs: { class: tw`${token('toolbar/section')}` } }, leftContent),
      h.Containers.Div({ attrs: { class: tw`${token('toolbar/section-end')}` } }, rightContent),
    ]);
  };

  UI.ToolbarGroup = ({ attrs = {}, label }, children = []) => {
    const content = [];
    if (label) {
      content.push(h.Text.Span({ attrs: { class: tw`${token('toolbar/group-label')} mb-1` } }, [label]));
    }
    const bodyChildren = (Array.isArray(children) ? children : [children]).filter(Boolean);
    if (bodyChildren.length) {
      content.push(h.Containers.Div({ attrs: { class: tw`${token('hstack')} flex-nowrap` } }, bodyChildren));
    }
    return h.Containers.Div({ attrs: withClass(attrs, cx('m-toolbar-group', token('toolbar/group'))) }, content);
  };

  UI.Footerbar = ({ left = [], right = [] }) =>
    h.Containers.Footer({ attrs: { class: tw`${token('footerbar')}` } }, [
      h.Containers.Div({ attrs: { class: tw`${token('hstack')}` } }, left),
      h.Containers.Div({ attrs: { class: tw`${token('hstack')}` } }, right),
    ]);

  UI.HStack = ({ attrs }, ch) => h.Containers.Div({ attrs: withClass(attrs, token('hstack')) }, ch || []);
  UI.VStack = ({ attrs }, ch) => h.Containers.Div({ attrs: withClass(attrs, token('vstack')) }, ch || []);
  UI.Divider = () => h.Containers.Div({ attrs: { class: tw`${token('divider')}` } });

  UI.Button = ({ attrs = {}, variant = 'soft', size = 'md' }, children) =>
    h.Forms.Button({ attrs: withClass(attrs, cx(token('btn'), token(`btn/${variant}`), token(`btn/${size}`))) }, children || []);

  UI.Switcher = ({ attrs = {}, value, options = [] }) => {
    const rootAttrs = Object.assign({}, attrs);
    rootAttrs.class = rootAttrs.class ? `${rootAttrs.class} ui-switcher` : 'ui-switcher';
    const items = (options || []).map((opt, idx) => {
      if (!opt) return null;
      const active = opt.value === value;
      const optAttrs = Object.assign({ key: opt.key || `switch-opt-${idx}` }, opt.attrs || {});
      if (opt.gkey) optAttrs.gkey = opt.gkey;
      if (opt.value != null) optAttrs['data-value'] = opt.value;
      if (opt.title) optAttrs.title = opt.title;
      const baseClass = optAttrs.class ? String(optAttrs.class) : '';
      optAttrs.class = `${baseClass} ${active ? 'active' : ''}`.trim();
      optAttrs.type = optAttrs.type || 'button';
      return h.Forms.Button({ attrs: optAttrs }, [opt.label != null ? opt.label : String(opt.value ?? '')]);
    }).filter(Boolean);
    return h.Containers.Div({ attrs: rootAttrs }, items);
  };

  UI.ThemeToggleIcon = ({ theme = 'light', attrs = {} }) => {
    const isDark = theme === 'dark';
    const icon = isDark ? '🌙' : '🌞';
    const title = isDark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي';
    const buttonAttrs = Object.assign({}, attrs, {
      gkey: attrs.gkey || 'ui:theme-toggle',
      title,
      'aria-pressed': isDark ? 'true' : 'false',
      class: cx(token('btn/icon'), 'text-lg', isDark && 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm')
    });
    buttonAttrs.type = buttonAttrs.type || 'button';
    return UI.Button({ attrs: buttonAttrs, variant: 'ghost', size: 'sm' }, [icon]);
  };

  UI.LanguageSwitch = ({ lang = 'ar', attrs = {} }) => {
    const isAr = lang === 'ar';
    const isEn = lang === 'en';
    const rootAttrs = Object.assign({}, attrs);
    const baseClass = 'inline-flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--surface-1)]/80 p-1 shadow-inner';
    rootAttrs.class = rootAttrs.class ? tw(cx(baseClass, rootAttrs.class)) : tw(baseClass);
    const makeAttrs = (active, value) => ({
      type: 'button',
      gkey: value === 'ar' ? 'ui:lang-ar' : 'ui:lang-en',
      title: value === 'ar' ? 'العربية' : 'English',
      'aria-pressed': active ? 'true' : 'false',
      class: tw(cx(
        'inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
        active
          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
      ))
    });
    const arButton = h.Forms.Button({ attrs: makeAttrs(isAr, 'ar') }, ['AR']);
    const enButton = h.Forms.Button({ attrs: makeAttrs(isEn, 'en') }, ['EN']);
    return h.Containers.Div({ attrs: rootAttrs }, [arButton, enButton]);
  };

  UI.SegmentedSwitch = ({ attrs = {}, value, options = [] }) => {
    const rootAttrs = Object.assign({}, attrs);
    rootAttrs.class = rootAttrs.class ? `${rootAttrs.class} segmented-switch` : 'segmented-switch';
    const buttons = (options || []).map((opt, idx) => {
      if (!opt) return null;
      const active = opt.value === value;
      const btnAttrs = Object.assign({ type: 'button', key: opt.key || `segment-${idx}` }, opt.attrs || {});
      if (!('type' in btnAttrs)) btnAttrs.type = 'button';
      if (opt.gkey && !('gkey' in btnAttrs)) btnAttrs.gkey = opt.gkey;
      if (opt.value != null) btnAttrs['data-value'] = opt.value;
      if (opt.title && !('title' in btnAttrs)) btnAttrs.title = opt.title;
      btnAttrs['aria-pressed'] = active ? 'true' : 'false';
      const baseClass = btnAttrs.class ? `${btnAttrs.class} ` : '';
      btnAttrs.class = `${baseClass}segmented-switch__option${active ? ' is-active' : ''}`;
      return h.Forms.Button({ attrs: btnAttrs }, [opt.label != null ? opt.label : String(opt.value ?? '')]);
    }).filter(Boolean);
    return h.Containers.Div({ attrs: rootAttrs }, buttons);
  };

  /* ===================== Date/Time Pickers (Custom UI Wrapper) ===================== */
  /* ===================== Custom Date/Time Picker Logic ===================== */
  /* ===================== Custom Date/Time Picker Logic ===================== */
  const DateTimePickerLogic = {
    pad: n => String(n).padStart(2, '0'),
    formatValue(val, type) {
      if (!val) return '';
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return '';
      const Y = d.getFullYear();
      const M = DateTimePickerLogic.pad(d.getMonth() + 1);
      const D = DateTimePickerLogic.pad(d.getDate());
      const h = DateTimePickerLogic.pad(d.getHours());
      const m = DateTimePickerLogic.pad(d.getMinutes());
      if (type === 'date') return `${Y}-${M}-${D}`;
      if (type === 'time') return `${h}:${m}`;
      return `${Y}-${M}-${D}T${h}:${m}`; // ISO for value
    },
    formatDisplay(val, type) {
      if (!val) return '';
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return '';
      const Y = d.getFullYear();
      const M = DateTimePickerLogic.pad(d.getMonth() + 1);
      const D = DateTimePickerLogic.pad(d.getDate());
      const H = d.getHours();
      const m = DateTimePickerLogic.pad(d.getMinutes());

      const h12 = H % 12 || 12;
      const ampm = H < 12 ? 'AM' : 'PM';

      if (type === 'date') return `${Y}-${M}-${D}`;
      if (type === 'time') return `${h12}:${m} ${ampm}`;
      return `${Y}-${M}-${D} ${h12}:${m} ${ampm}`;
    },
    parseFromInput(str, type) {
      if (!str) return null;
      // Simple heuristic parsing
      const datePart = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      const timePart = str.match(/(\d{1,2}):(\d{1,2})\s?(AM|PM|am|pm)?/i);

      const now = new Date();
      let Y = now.getFullYear(), M = now.getMonth(), D = now.getDate();
      let h = 0, m = 0;

      if (datePart) {
        Y = parseInt(datePart[1]);
        M = parseInt(datePart[2]) - 1;
        D = parseInt(datePart[3]);
      }

      if (timePart) {
        h = parseInt(timePart[1]);
        m = parseInt(timePart[2]);
        const mer = timePart[3] ? timePart[3].toUpperCase() : null;
        if (mer === 'PM' && h < 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
      }

      const d = new Date(Y, M, D, h, m);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  };
  M.UI.DateTimePickerLogic = DateTimePickerLogic; // Expose for manual parsing usage

  UI.CalendarView = ({ year, month, selectedDate, onSelect, onMonthChange }) => {
    const d = new Date(year, month, 1);
    const startDay = d.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonthName = monthNames[month] || '';

    const header = h.Containers.Div({ attrs: { class: tw`flex items-center justify-between py-2 px-1` } }, [
      h.Forms.Button({
        attrs: { type: 'button', class: tw`${token('btn/ghost')} p-1 h-8 w-8 rounded-full data-[gkey]:bg-transparent`, onclick: `M.UI.CalendarActions.prevMonth(this)` },
      }, [h.Text.Span({}, ['◀'])]),
      h.Text.Span({ attrs: { class: tw`font-semibold text-sm` } }, [`${currentMonthName} ${year}`]),
      h.Forms.Button({
        attrs: { type: 'button', class: tw`${token('btn/ghost')} p-1 h-8 w-8 rounded-full` },
        attrs: { type: 'button', class: tw`${token('btn/ghost')} p-1 h-8 w-8 rounded-full`, onclick: `M.UI.CalendarActions.nextMonth(this)` }
      }, [h.Text.Span({}, ['▶'])])
    ]);

    // Grid construction
    const cells = [];
    // Padding
    for (let i = 0; i < startDay; i++) {
      cells.push(h.Containers.Div({ attrs: { class: tw`text-center text-xs opacity-20 py-2` } }, [String(prevMonthDays - startDay + i + 1)]));
    }
    // Days
    const now = new Date();
    const isToday = (day) => now.getDate() === day && now.getMonth() === month && now.getFullYear() === year;
    const isSelected = (day) => selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

    for (let i = 1; i <= daysInMonth; i++) {
      const selected = isSelected(i);
      const today = isToday(i);
      const cls = tw(cx(
        'flex items-center justify-center w-8 h-8 rounded-full text-sm cursor-pointer transition-all mx-auto select-none',
        selected ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-bold shadow-md' : 'hover:bg-[var(--surface-2)]',
        today && !selected ? 'ring-2 ring-[var(--primary)] ring-inset' : ''
      ));
      cells.push(h.Containers.Div({
        attrs: { class: tw`py-1`, onclick: `M.UI.CalendarActions.selectDay(this, ${year}, ${month}, ${i})` }
      }, [
        h.Containers.Div({ attrs: { class: cls } }, [String(i)])
      ]));
    }

    const grid = h.Containers.Div({ attrs: { class: tw`grid grid-cols-7 gap-y-1` } }, [
      ...['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => h.Containers.Div({ attrs: { class: tw`text-center text-[0.65rem] uppercase font-bold text-[var(--muted-foreground)] py-1` } }, [d])),
      ...cells
    ]);

    return h.Containers.Div({ attrs: { class: tw`select-none` } }, [header, grid]);
  };

  UI.TimeView = ({ hour, minute }) => {
    // Convert 24h to 12h for display
    const h12 = hour % 12 || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';

    const timeInputClass = tw`w-16 h-12 text-center text-3xl font-mono rounded-[var(--radius)] border-[var(--border)] bg-[var(--surface-1)]`;
    const stepBtnClass = tw`w-full rounded border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] hover:bg-[var(--surface-3)]`;

    return h.Containers.Div({ attrs: { class: tw`flex items-center justify-center gap-3 py-4` } }, [
      h.Containers.Div({ attrs: { class: tw`flex flex-col items-center gap-1` } }, [
        h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass, onclick: `M.UI.TimeActions.incrementHour12()` } }, ['▲']),
        h.Inputs.Input({
          attrs: {
            type: 'text',
            inputmode: 'numeric',
            pattern: '[0-9]*',
            value: String(h12),
            class: timeInputClass
          },
          events: { change: (e) => M.UI.TimeActions.setHour12(e.target) }
        }),
        h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass, onclick: `M.UI.TimeActions.decrementHour12()` } }, ['▼'])
      ]),
      h.Text.Span({ attrs: { class: tw`text-3xl font-bold opacity-50` } }, [':']),
      h.Containers.Div({ attrs: { class: tw`flex flex-col items-center gap-1` } }, [
        h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass, onclick: `M.UI.TimeActions.incrementMinute()` } }, ['▲']),
        h.Inputs.Input({
          attrs: {
            type: 'text',
            inputmode: 'numeric',
            pattern: '[0-9]*',
            value: DateTimePickerLogic.pad(minute),
            class: timeInputClass
          },
          events: { change: (e) => M.UI.TimeActions.setMinute(e.target) }
        }),
        h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass, onclick: `M.UI.TimeActions.decrementMinute()` } }, ['▼'])
      ]),
      h.Containers.Div({ attrs: { class: tw`flex flex-col gap-1 ml-2` } }, [
        h.Forms.Button({
          attrs: {
            type: 'button',
            class: tw`px-2 py-1 text-xs rounded border border-[var(--border)] font-bold ${ampm === 'AM' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--surface-2)]'}`
          },
          events: { click: () => M.UI.TimeActions.toggleAmPm() }
        }, ['AM']),
        h.Forms.Button({
          attrs: {
            type: 'button',
            class: tw`px-2 py-1 text-xs rounded border border-[var(--border)] font-bold ${ampm === 'PM' ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--surface-2)]'}`
          },
          events: { click: () => M.UI.TimeActions.toggleAmPm() }
        }, ['PM'])
      ])
    ]);
  };

  // Helper for Global Actions
  // M.UI already initialized at top
  M.UI.PickerState = {
    activeId: null,
    tempValue: null,
    viewDate: new Date(),
    mode: 'date' // date, time, datetime
  };

  M.UI.CalendarActions = {
    prevMonth: (btn) => {
      const s = M.UI.PickerState;
      s.viewDate.setMonth(s.viewDate.getMonth() - 1);
      M.UI.updatePickerModal();
    },
    nextMonth: (btn) => {
      const s = M.UI.PickerState;
      s.viewDate.setMonth(s.viewDate.getMonth() + 1);
      M.UI.updatePickerModal();
    },
    selectDay: (btn, y, m, d) => {
      const s = M.UI.PickerState;
      // Keep time if exists
      const oldH = s.tempValue ? s.tempValue.getHours() : 0;
      const oldM = s.tempValue ? s.tempValue.getMinutes() : 0;
      s.tempValue = new Date(y, m, d, oldH, oldM);
      s.viewDate = new Date(y, m, 1);
      M.UI.updatePickerModal();
    }
  };
  M.UI.TimeActions = {
    setHour12: (inp) => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      let h12 = parseInt(inp.value) || 12;
      h12 = Math.max(1, Math.min(12, h12));

      let currentH = s.tempValue.getHours();
      let isPM = currentH >= 12;

      if (h12 === 12) {
        s.tempValue.setHours(isPM ? 12 : 0);
      } else {
        s.tempValue.setHours(isPM ? h12 + 12 : h12);
      }
      M.UI.updatePickerModal();
    },
    setMinute: (inp) => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      let v = parseInt(inp.value) || 0;
      v = Math.max(0, Math.min(59, v));
      s.tempValue.setMinutes(v);
      M.UI.updatePickerModal();
    },
    incrementHour12: () => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      const currentH = s.tempValue.getHours();
      const isPM = currentH >= 12;
      const h12 = currentH % 12 || 12;
      const next = h12 === 12 ? 1 : h12 + 1;
      const adjusted = next === 12 ? (isPM ? 12 : 0) : (isPM ? next + 12 : next);
      s.tempValue.setHours(adjusted);
      M.UI.updatePickerModal();
    },
    decrementHour12: () => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      const currentH = s.tempValue.getHours();
      const isPM = currentH >= 12;
      const h12 = currentH % 12 || 12;
      const next = h12 === 1 ? 12 : h12 - 1;
      const adjusted = next === 12 ? (isPM ? 12 : 0) : (isPM ? next + 12 : next);
      s.tempValue.setHours(adjusted);
      M.UI.updatePickerModal();
    },
    incrementMinute: () => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      const current = s.tempValue.getMinutes();
      const next = (current + 1) % 60;
      s.tempValue.setMinutes(next);
      M.UI.updatePickerModal();
    },
    decrementMinute: () => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      const current = s.tempValue.getMinutes();
      const next = (current - 1 + 60) % 60;
      s.tempValue.setMinutes(next);
      M.UI.updatePickerModal();
    },
    toggleAmPm: () => {
      const s = M.UI.PickerState;
      if (!s.tempValue) s.tempValue = new Date();
      let h = s.tempValue.getHours();
      if (h >= 12) {
        s.tempValue.setHours(h - 12);
      } else {
        s.tempValue.setHours(h + 12);
      }
      M.UI.updatePickerModal();
    }
  };

  M.UI.updatePickerModal = () => {
    const s = M.UI.PickerState;
    const modalContent = document.getElementById('mishkah-picker-content');
    if (!modalContent) return;

    // Define calendar variables
    const vDate = s.viewDate;
    const year = vDate.getFullYear();
    const month = vDate.getMonth();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonthName = monthNames[month];

    // 2. Time View (if time or datetime)
    if (s.mode !== 'date') {
      const H = s.tempValue ? s.tempValue.getHours() : 12;
      const mVal = s.tempValue ? DateTimePickerLogic.pad(s.tempValue.getMinutes()) : '00';
      const h12 = H % 12 || 12;
      const isPm = H >= 12;

      const timeInputClass = tw`w-16 h-12 text-center text-3xl font-mono rounded-[var(--radius)] border-[var(--border)] bg-[var(--surface-1)]`;
      const stepBtnClass = tw`w-full rounded border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] hover:bg-[var(--surface-3)]`;
      const timeContent = h.Containers.Div({ attrs: { class: tw`border-t border-[var(--border)] pt-4 mt-2` } }, [
        h.Containers.Div({ attrs: { class: tw`flex items-center justify-center gap-3` } }, [
          h.Containers.Div({ attrs: { class: tw`flex flex-col items-center gap-1` } }, [
            h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass }, events: { click: () => M.UI.TimeActions.incrementHour12() } }, ['▲']),
            h.Inputs.Input({
              attrs: {
                type: 'text',
                inputmode: 'numeric',
                pattern: '[0-9]*',
                value: String(h12),
                class: timeInputClass
              },
              events: {
                change: (e) => M.UI.TimeActions.setHour12(e.target)
              }
            }),
            h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass }, events: { click: () => M.UI.TimeActions.decrementHour12() } }, ['▼'])
          ]),
          h.Text.Span({ attrs: { class: tw`text-3xl font-bold opacity-50` } }, [':']),
          h.Containers.Div({ attrs: { class: tw`flex flex-col items-center gap-1` } }, [
            h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass }, events: { click: () => M.UI.TimeActions.incrementMinute() } }, ['▲']),
            h.Inputs.Input({
              attrs: {
                type: 'text',
                inputmode: 'numeric',
                pattern: '[0-9]*',
                value: String(mVal),
                class: timeInputClass
              },
              events: {
                change: (e) => M.UI.TimeActions.setMinute(e.target)
              }
            }),
            h.Forms.Button({ attrs: { type: 'button', class: stepBtnClass }, events: { click: () => M.UI.TimeActions.decrementMinute() } }, ['▼'])
          ]),
          h.Containers.Div({ attrs: { class: tw`flex flex-col gap-1 ml-2` } }, [
            h.Forms.Button({
              attrs: {
                type: 'button',
                class: tw`px-2 py-1 text-xs rounded border border-[var(--border)] font-bold ${!isPm ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--surface-2)]'}`
              },
              events: {
                click: () => M.UI.TimeActions.toggleAmPm()
              }
            }, ['AM']),
            h.Forms.Button({
              attrs: {
                type: 'button',
                class: tw`px-2 py-1 text-xs rounded border border-[var(--border)] font-bold ${isPm ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--surface-2)]'}`
              },
              events: {
                click: () => M.UI.TimeActions.toggleAmPm()
              }
            }, ['PM'])
          ])
        ])
      ]);

      const calendarContent = h.Containers.Div({ attrs: {} }, [
        h.Containers.Div({ attrs: { class: tw`flex items-center justify-between py-2 px-1 mb-2` } }, [
          h.Forms.Button({
            attrs: { type: 'button', class: tw`${token('btn/ghost')} p-1 h-8 w-8 rounded-full` },
            events: { click: (e) => M.UI.CalendarActions.prevMonth(e.target) }
          }, [h.Text.Span({}, ['◀'])]),
          h.Text.Span({ attrs: { class: tw`font-semibold text-sm` } }, [`${currentMonthName} ${year}`]),
          h.Forms.Button({
            attrs: { type: 'button', class: tw`${token('btn/ghost')} p-1 h-8 w-8 rounded-full` },
            events: { click: (e) => M.UI.CalendarActions.nextMonth(e.target) }
          }, [h.Text.Span({}, ['▶'])])
        ]),
        h.Containers.Div({ attrs: { class: tw`grid grid-cols-7 gap-y-1 mb-4 select-none` } }, [
          ...['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d =>
            h.Containers.Div({ attrs: { class: tw`text-center text-[0.65rem] uppercase font-bold text-[var(--muted-foreground)] py-1` } }, [d])
          ),
          ...(() => {
            const d = new Date(year, month, 1);
            const startDay = d.getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const prevMonthDays = new Date(year, month, 0).getDate();
            const cells = [];

            for (let i = 0; i < startDay; i++) {
              cells.push(h.Containers.Div({ attrs: { class: tw`text-center text-xs opacity-20 py-2` } }, [String(prevMonthDays - startDay + i + 1)]));
            }

            const now = new Date();
            const isToday = (day) => now.getDate() === day && now.getMonth() === month && now.getFullYear() === year;
            const isSelected = (day) => s.tempValue && s.tempValue.getDate() === day && s.tempValue.getMonth() === month && s.tempValue.getFullYear() === year;

            for (let i = 1; i <= daysInMonth; i++) {
              const selected = isSelected(i);
              const today = isToday(i);
              let cls = 'flex items-center justify-center w-8 h-8 rounded-full text-sm cursor-pointer transition-all mx-auto ';
              if (selected) cls += 'bg-[var(--primary)] text-[var(--primary-foreground)] font-bold shadow-md';
              else cls += 'hover:bg-[var(--surface-2)]';
              if (today && !selected) cls += ' ring-2 ring-[var(--primary)] ring-inset';

              cells.push(h.Containers.Div({
                attrs: { class: tw`py-1` },
                events: {
                  click: () => M.UI.CalendarActions.selectDay(null, year, month, i)
                }
              }, [
                h.Containers.Div({ attrs: { class: tw`${cls}` } }, [String(i)])
              ]));
            }
            return cells;
          })()
        ])
      ]);

      // Clear and append DSL nodes
      modalContent.innerHTML = '';
      const vNode = h.Containers.Div({}, [calendarContent, timeContent]);

      // Render VDOM to DOM using Mishkah core render
      // Mishkah.VDOM.render(vnode, db, parentPath) returns a DOM element
      if (typeof Mishkah !== 'undefined' && Mishkah.VDOM && Mishkah.VDOM.render) {
        const rendered = Mishkah.VDOM.render(vNode, {}, '');
        modalContent.appendChild(rendered);
      } else {
        console.error("[DateTimePicker] Mishkah.VDOM.render not found");
      }
    }
  };

  UI.openDateTimePicker = (options) => {
    console.log('🔧 openDateTimePicker called', options);

    // Create a modal container if not exists
    let modal = document.getElementById('mishkah-picker-modal');
    if (!modal) {
      console.log('📦 Creating new modal element');
      modal = document.createElement('div');
      modal.id = 'mishkah-picker-modal';
      modal.setAttribute('dir', 'ltr');
      modal.className = `fixed inset-0 z-[9999] grid place-items-center px-4 py-12 hidden`;
      modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="mishkah-picker-backdrop"></div>
            <div class="relative z-10 w-[min(360px,94vw)] bg-[var(--card)] text-[var(--card-foreground)] rounded-[var(--radius)] shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-[var(--border)] font-semibold text-center bg-[var(--surface-1)]" id="mishkah-picker-title">Select</div>
                <div class="p-4 overflow-y-auto max-h-[60vh]" id="mishkah-picker-content"></div>
                <div class="p-3 border-t border-[var(--border)] bg-[var(--surface-1)] flex gap-2">
                    <button type="button" class="flex-1 px-3 py-2 rounded-[var(--radius)] hover:bg-[var(--surface-2)] text-sm font-medium" id="mishkah-picker-cancel">Cancel</button>
                    <button type="button" class="flex-1 px-3 py-2 rounded-[var(--radius)] bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-bold shadow" id="mishkah-picker-confirm">Confirm</button>
                </div>
            </div>
         `;
      document.body.appendChild(modal);

      // Add event listeners to modal buttons
      document.getElementById('mishkah-picker-backdrop')?.addEventListener('click', () => M.UI.closeDateTimePicker());
      document.getElementById('mishkah-picker-cancel')?.addEventListener('click', () => M.UI.closeDateTimePicker());
      document.getElementById('mishkah-picker-confirm')?.addEventListener('click', () => M.UI.confirmDateTimePicker());
      console.log('✅ Modal element created and appended to body');
    }

    modal.setAttribute('dir', 'ltr');

    // Setup State
    M.UI.PickerState.activeId = options.inputId;
    M.UI.PickerState.mode = options.type || 'date';
    const initialVal = options.value ? new Date(options.value) : new Date();
    M.UI.PickerState.tempValue = Number.isNaN(initialVal.getTime()) ? new Date() : initialVal;
    M.UI.PickerState.viewDate = new Date(M.UI.PickerState.tempValue);
    M.UI.PickerState.callback = options.onConfirm;

    // Update Title
    document.getElementById('mishkah-picker-title').innerText = options.placeholder || (options.type === 'time' ? 'Select Time' : 'Select Date');

    // Render Content
    M.UI.updatePickerModal();

    // Show
    console.log('👁️ Showing modal - removing hidden class');
    modal.classList.remove('hidden');
    modal.classList.add('animate-in', 'fade-in', 'zoom-in-95', 'duration-200');
    console.log('✨ Modal should now be visible', {
      modalId: modal.id,
      classList: modal.className,
      computed: window.getComputedStyle(modal).display
    });
  };

  // Register global handler for datetime picker trigger button
  // This allows the component to be self-contained
  if (typeof window !== 'undefined' && !window.__DATETIME_PICKER_HANDLER_REGISTERED__) {
    window.__DATETIME_PICKER_HANDLER_REGISTERED__ = true;

    // Add event listener for clicks on datetime picker trigger buttons
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-gkey="ui:datetime-picker:open"]');
      if (target) {
        e.preventDefault();
        e.stopPropagation();

        const inputId = target.getAttribute('data-input-id');
        const type = target.getAttribute('data-picker-type');
        const value = target.getAttribute('data-initial-value');

        if (inputId) {
          M.UI.openDateTimePicker({
            inputId,
            type: type || 'date',
            value: value || '',
            onConfirm: null
          });
        }
      }
    }, true); // Use capture phase to ensure we catch it
  }

  M.UI.closeDateTimePicker = () => {
    const modal = document.getElementById('mishkah-picker-modal');
    if (modal) modal.classList.add('hidden');
  };

  M.UI.confirmDateTimePicker = () => {
    const s = M.UI.PickerState;
    if (s.activeId && s.tempValue) {
      const val = DateTimePickerLogic.formatValue(s.tempValue, s.mode);
      const display = DateTimePickerLogic.formatDisplay(s.tempValue, s.mode);

      const hiddenInput = document.getElementById(s.activeId);
      if (hiddenInput) {
        hiddenInput.value = val;
        hiddenInput.setAttribute('value', val);
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Update visual input if exists
      const visualInput = document.getElementById(`visual-${s.activeId}`);
      if (visualInput) {
        visualInput.value = display;
      }
    }
    M.UI.closeDateTimePicker();
  };

  UI.DataTypeInput = ({ type = 'date', value, onchange, placeholder, attrs = {}, gkey }) => {
    const realInputId = attrs.id || `dt-${type}-${Math.random().toString(36).slice(2, 8)}`;
    const displayVal = DateTimePickerLogic.formatDisplay(value, type);

    // Hidden native input handles the actual value and picker
    const inputAttrs = Object.assign({}, attrs);
    delete inputAttrs.class;
    inputAttrs.id = realInputId;
    inputAttrs.type = 'hidden'; // Changed from actual type to hidden to avoid native behavior interference
    inputAttrs.value = value; // Keep value sync

    if (gkey) inputAttrs.gkey = gkey;
    if (onchange) inputAttrs.onchange = onchange;

    const icon = type === 'time' ? '⏰' : '📅';

    const inputClass = tw(cx(
      token('input'),
      'w-full font-mono text-sm',
      attrs.class || ''
    ));

    const iconButton = h.Forms.Button({
      attrs: {
        type: 'button',
        class: tw`absolute end-0 top-0 bottom-0 px-3 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors`,
        tabindex: '-1'
      },
      events: {
        click: (e) => {
          console.log('📅 DateTimePicker icon clicked!', { realInputId, type, value });
          e.preventDefault();
          e.stopPropagation();
          M.UI.openDateTimePicker({
            inputId: realInputId,
            type: type,
            value: value || '',
            onConfirm: null
          });
        }
      }
    }, [
      h.Text.Span({ attrs: { class: tw`text-lg` } }, [icon])
    ]);

    // We add an actual visible input for typing
    // We bind it's change to update the hidden input and parse values
    const visibleInputAttrs = {
      type: 'text',
      class: inputClass,
      value: displayVal,
      placeholder: placeholder || (type === 'time' ? 'HH:mm' : 'YYYY-MM-DD'),
      id: `visual-${realInputId}`,
      onchange: `(() => {
        const val = event.target.value;
        const dt = M.UI.DateTimePickerLogic.parseFromInput(val);
        const hidden = document.getElementById('${realInputId}');
        if (hidden) {
          if (dt) {
             const fmt = M.UI.DateTimePickerLogic.formatValue(dt, '${type}');
             hidden.value = fmt; 
             hidden.setAttribute('value', fmt);
          } else {
             // If invalid, maybe clear or keep as is? 
             // Logic: if empty string, clear.
             if (!val.trim()) {
                 hidden.value = '';
                 hidden.setAttribute('value', '');
             }
          }
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`
    };

    return h.Containers.Div({ attrs: { class: 'relative w-full' } }, [
      h.Inputs.Input({ attrs: inputAttrs }), // Hidden valid value
      h.Inputs.Input({ attrs: visibleInputAttrs }), // Visible editable
      iconButton
    ]);

  };

  UI.DatePicker = (props) => UI.DataTypeInput({ ...props, type: 'date', placeholder: props.placeholder || 'YYYY-MM-DD' });
  UI.TimePicker = (props) => UI.DataTypeInput({ ...props, type: 'time', placeholder: props.placeholder || 'HH:mm' });
  UI.DateTimePicker = (props) => UI.DataTypeInput({ ...props, type: 'datetime-local', placeholder: props.placeholder || 'YYYY-MM-DD HH:mm' });

  UI.Card = ({ title, description, content, footer, variant = 'card', attrs = {} }) => {
    const root = token(variant) || token('card');
    return h.Containers.Section({ attrs: withClass(attrs, root) }, [
      (title || description) && h.Containers.Div({ attrs: { class: tw`${token('card/header')}` } }, [
        title && h.Text.H3({ attrs: { class: tw`${token('card/title')}` } }, [title]),
        description && h.Text.P({ attrs: { class: tw`${token('card/desc')}` } }, [description])
      ]),
      content && h.Containers.Div({ attrs: { class: tw`${token('card/content')}` } }, [content]),
      footer && h.Containers.Div({ attrs: { class: tw`${token('card/footer')}` } }, [footer]),
    ].filter(Boolean))
  };

  const SWEET_TONES = {
    info: {
      ring: 'shadow-[0_24px_48px_-24px_rgba(59,130,246,0.45)] border-[color-mix(in oklab,var(--border) 55%, transparent)]',
      gradient: 'linear-gradient(145deg, rgba(59,130,246,0.12), rgba(59,130,246,0.05))'
    },
    success: {
      ring: 'shadow-[0_24px_48px_-24px_rgba(16,185,129,0.55)] border-[rgba(16,185,129,0.25)]',
      gradient: 'linear-gradient(145deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))'
    },
    warning: {
      ring: 'shadow-[0_24px_48px_-24px_rgba(234,179,8,0.45)] border-[rgba(234,179,8,0.22)]',
      gradient: 'linear-gradient(145deg, rgba(234,179,8,0.18), rgba(234,179,8,0.08))'
    },
    danger: {
      ring: 'shadow-[0_24px_52px_-24px_rgba(239,68,68,0.55)] border-[rgba(239,68,68,0.28)]',
      gradient: 'linear-gradient(145deg, rgba(239,68,68,0.18), rgba(239,68,68,0.08))'
    }
  };

  UI.SweetNotice = ({
    attrs = {},
    tone = 'info',
    icon,
    title,
    message,
    hint,
    actions = [],
    footer
  }) => {
    const toneMeta = SWEET_TONES[tone] || SWEET_TONES.info;
    const rootAttrs = withClass(attrs, cx(
      'relative overflow-hidden rounded-[var(--radius)] border px-6 py-8 text-center space-y-4 glass-panel sweet-notice-card',
      toneMeta.ring
    ));
    const style = attrs && attrs.style ? String(attrs.style) + ';' : '';
    rootAttrs.style = style + (toneMeta.gradient ? `background:${toneMeta.gradient};` : '');

    const layers = [
      h.Containers.Div({ attrs: { class: tw`pointer-events-none absolute inset-0 opacity-70` } }, [
        h.Containers.Div({ attrs: { class: tw`absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.25),transparent_60%)]` } })
      ])
    ];

    const body = h.Containers.Div({ attrs: { class: tw`relative z-10 flex flex-col items-center gap-3` } }, [
      icon ? h.Text.Span({ attrs: { class: tw`text-4xl` } }, [icon]) : null,
      title ? h.Text.H3({ attrs: { class: tw`text-2xl font-bold tracking-tight` } }, [title]) : null,
      message ? h.Text.P({ attrs: { class: 'game-info-text text-center' } }, [message]) : null,
      hint ? h.Text.P({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [hint]) : null
    ].filter(Boolean));

    const actionRow = actions && actions.length
      ? h.Containers.Div({ attrs: { class: tw`relative z-10 flex flex-wrap items-center justify-center gap-3` } }, actions)
      : null;

    const footnote = footer
      ? h.Text.P({ attrs: { class: tw`relative z-10 text-xs text-[var(--muted-foreground)]` } }, [footer])
      : null;

    const card = h.Containers.Section({ attrs: rootAttrs }, [...layers, body, actionRow, footnote].filter(Boolean));
    return h.Containers.Div({ attrs: { class: 'sweet-notice-overlay' } }, [card]);
  };

  UI.Input = ({ attrs }) => h.Inputs.Input({ attrs: withClass(attrs, token('input')) });
  UI.Textarea = ({ attrs }) => h.Inputs.Textarea({ attrs: withClass(attrs, token('input')) });
  UI.Select = ({ attrs = {}, options = [] }) => {
    const selectAttrs = withClass(attrs, token('input'));
    const hasValue = Object.prototype.hasOwnProperty.call(selectAttrs, 'value') || Object.prototype.hasOwnProperty.call(selectAttrs, 'defaultValue');
    const rawCurrentValue = hasValue
      ? (Object.prototype.hasOwnProperty.call(selectAttrs, 'value') ? selectAttrs.value : selectAttrs.defaultValue)
      : undefined;
    const normalizedCurrentValue = rawCurrentValue == null ? undefined : String(rawCurrentValue);
    return h.Inputs.Select({ attrs: selectAttrs },
      options.map((o, i) => {
        const isPlainObject = !!o && typeof o === 'object' && !Array.isArray(o);
        const optionLabel = isPlainObject && Object.prototype.hasOwnProperty.call(o, 'label')
          ? o.label
          : (o == null ? '' : String(o));
        const optionAttrs = { key: `opt-${i}` };
        if (isPlainObject && o.attrs && typeof o.attrs === 'object') {
          Object.assign(optionAttrs, o.attrs);
        }
        const hasExplicitValue = isPlainObject && Object.prototype.hasOwnProperty.call(o, 'value');
        const rawOptionValue = hasExplicitValue
          ? o.value
          : (Object.prototype.hasOwnProperty.call(optionAttrs, 'value')
            ? optionAttrs.value
            : (isPlainObject && Object.prototype.hasOwnProperty.call(o, 'label') ? o.label : o));
        const normalizedOptionValue = rawOptionValue == null ? undefined : String(rawOptionValue);
        if (Object.prototype.hasOwnProperty.call(optionAttrs, 'value')) {
          if (optionAttrs.value != null) {
            optionAttrs.value = String(optionAttrs.value);
          }
        } else if (normalizedOptionValue !== undefined) {
          optionAttrs.value = normalizedOptionValue;
        }
        if (isPlainObject) {
          if ('disabled' in o && !Object.prototype.hasOwnProperty.call(optionAttrs, 'disabled')) optionAttrs.disabled = !!o.disabled;
          if ('selected' in o && !Object.prototype.hasOwnProperty.call(optionAttrs, 'selected')) optionAttrs.selected = !!o.selected;
        }
        const optionHasSelected = Object.prototype.hasOwnProperty.call(optionAttrs, 'selected');
        if (!optionHasSelected && normalizedCurrentValue !== undefined && normalizedOptionValue !== undefined && normalizedCurrentValue === normalizedOptionValue) {
          optionAttrs.selected = true;
        }
        return h.Inputs.Option({ attrs: optionAttrs }, [optionLabel]);
      })
    );
  };
  UI.Label = ({ attrs, forId, text }) => {
    const a = Object.assign({}, attrs || {}); if (forId) a.for = forId;
    return h.Forms.Label({ attrs: withClass(a, token('label')) }, [text || '']);
  };
  UI.NumpadDecimal = ({ attrs = {}, value = '', placeholder = '0', gkey, confirmLabel = 'OK', confirmAttrs = {}, title, inputAttrs = {}, allowDecimal = true, masked = false, maskChar = '•', maskLength }) => {
    const rootAttrs = withClass(attrs, token('numpad/root'));
    rootAttrs['data-numpad-root'] = 'decimal';
    if (!allowDecimal) rootAttrs['data-numpad-no-decimal'] = 'true';
    const current = value === undefined || value === null ? '' : String(value);
    const placeholderLength = Math.max(maskLength || (current ? current.length : 0) || 0, 4);
    const effectivePlaceholder = masked
      ? (placeholder && placeholder.length ? placeholder : maskChar.repeat(placeholderLength))
      : (placeholder || '0');
    const displayValue = masked
      ? (current ? maskChar.repeat(current.length) : effectivePlaceholder)
      : (current !== '' ? current : effectivePlaceholder);
    const hiddenAttrs = Object.assign({
      type: masked ? 'password' : 'text',
      value: current,
      'data-numpad-input': 'true',
      class: tw`hidden`
    }, inputAttrs || {});
    if (gkey) hiddenAttrs.gkey = gkey;
    const digits = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.'];
    const confirmVariant = confirmAttrs.variant || 'solid';
    const confirmSize = confirmAttrs.size || 'md';
    const confirmButtonAttrs = Object.assign({}, confirmAttrs || {});
    delete confirmButtonAttrs.variant;
    delete confirmButtonAttrs.size;
    if (!('data-numpad-confirm' in confirmButtonAttrs)) confirmButtonAttrs['data-numpad-confirm'] = 'true';
    if (!('gkey' in confirmButtonAttrs)) confirmButtonAttrs.gkey = 'ui:numpad:decimal:confirm';
    confirmButtonAttrs.type = confirmButtonAttrs.type || 'button';
    confirmButtonAttrs.class = tw(cx(
      token('btn'),
      token(`btn/${confirmVariant}`),
      token(`btn/${confirmSize}`),
      'flex-1 h-16 rounded-2xl text-lg font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0',
      token('numpad/confirm'),
      confirmButtonAttrs.class || ''
    ));
    return h.Containers.Div({ attrs: rootAttrs }, [
      h.Inputs.Input({ attrs: hiddenAttrs }),
      title ? h.Text.Span({ attrs: { class: tw`text-sm font-medium` } }, [title]) : null,
      h.Containers.Div({ attrs: { class: tw`${token('numpad/display')}`, 'aria-live': 'polite' } }, [displayValue || effectivePlaceholder || '']),
      h.Containers.Div({ attrs: { class: tw`${token('numpad/grid')}` } },
        digits.map(key => {
          const btnAttrs = { type: 'button', gkey: 'ui:numpad:decimal:key', 'data-numpad-key': key };
          let btnClass = token('numpad/key');
          if (key === '.' && !allowDecimal) {
            btnAttrs.disabled = true;
            btnClass = token('numpad/key-disabled');
          }
          return h.Forms.Button({ attrs: withClass(btnAttrs, btnClass) }, [
            h.Text.Span({}, [key])
          ]);
        })
      ),
      h.Containers.Div({ attrs: { class: tw`${token('numpad/actions')}` } }, [
        h.Forms.Button({ attrs: withClass({ type: 'button', gkey: 'ui:numpad:decimal:clear', 'data-numpad-clear': 'true' }, token('numpad/utility')) }, ['C']),
        h.Forms.Button({ attrs: withClass({ type: 'button', gkey: 'ui:numpad:decimal:backspace', 'data-numpad-backspace': 'true' }, token('numpad/utility')) }, ['⌫']),
        h.Forms.Button({ attrs: confirmButtonAttrs }, [confirmLabel || 'OK'])
      ])
    ].filter(Boolean));
  };
  UI.Field = ({ id, label, control, helper }) =>
    UI.VStack({ attrs: { class: tw`gap-1` } }, [
      label && UI.Label({ forId: id, text: label }),
      control,
      helper && h.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [helper])
    ]);

  UI.Badge = ({ attrs = {}, variant = 'badge', leading, trailing, text }) => {
    const parts = [];
    if (leading) parts.push(h.Text.Span({}, [leading]));
    if (text) parts.push(typeof text === 'string' ? text : text);
    if (trailing) parts.push(h.Text.Span({}, [trailing]));
    return h.Text.Span({ attrs: withClass(attrs, token(variant) || token('badge')) }, parts);
  };

  UI.Chip = ({ label, active = false, attrs = {} }) => {
    const cls = cx(token('chip'), active ? token('chip/active') : '');
    const buttonAttrs = Object.assign({ type: 'button' }, attrs || {});
    if (attrs && Object.prototype.hasOwnProperty.call(attrs, 'gkey')) {
      buttonAttrs.gkey = attrs.gkey;
    }
    return h.Forms.Button({ attrs: withClass(buttonAttrs, cls) }, [label]);
  };

  UI.ChipGroup = ({ items = [], activeId, attrs = {} }) =>
    h.Containers.Div({ attrs: withClass(attrs, tw`flex flex-wrap gap-2`) },
      items.map((it) => {
        const baseAttrs = Object.assign({ 'data-chip-id': it.id }, it.attrs || {});
        if (!('gkey' in baseAttrs) && it.gkey) {
          baseAttrs.gkey = it.gkey;
        }
        return UI.Chip({
          label: it.label,
          active: it.id === activeId,
          attrs: baseAttrs
        });
      })
    );

  UI.ScrollArea = ({ attrs = {}, children = [] }) =>
    h.Containers.Div({ attrs: withClass(attrs, token('scrollarea')) }, children);

  UI.Checkbox = ({ checked, label, gkey, attrs = {}, onchange }) => {
    const rootAttrs = withClass(attrs, 'flex items-center gap-2 cursor-pointer select-none group');
    if (gkey) rootAttrs.gkey = gkey;

    // We use a hidden native checkbox + visual indicator
    const inputAttrs = {
      type: 'checkbox',
      class: 'peer sr-only',
      checked: checked ? 'checked' : undefined,
    };
    if (onchange) inputAttrs.onchange = onchange;

    const indicatorClass = tw(cx(
      'h-5 w-5 rounded border border-[var(--border)] bg-[var(--surface-1)] text-[var(--primary-foreground)] transition-colors',
      'peer-checked:bg-[var(--primary)] peer-checked:border-[var(--primary)]',
      'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] peer-focus-visible:ring-offset-2',
      'flex items-center justify-center'
    ));

    const icon = h.Text.Span({ attrs: { class: 'text-current opacity-0 peer-checked:opacity-100 text-[10px] font-bold' } }, ['✓']);
    // Actually simpler: SVG icon

    return h.Forms.Label({ attrs: rootAttrs }, [
      h.Inputs.Input({ attrs: inputAttrs }),
      h.Containers.Div({ attrs: { class: indicatorClass } }, [
        // Checkmark
        h.Containers.RawHtml({
          html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5"><polyline points="20 6 9 17 4 12"/></svg>',
          sanitize: false
        })
      ]),
      label ? h.Text.Span({ attrs: { class: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70' } }, [label]) : null
    ]);
  };

  UI.SearchBar = ({ value = '', placeholder = '', attrs = {}, gkeySubmit, onInput, leading = '🔍', trailing = [] }) => {
    const inputAttrs = withClass({
      type: 'search',
      placeholder,
      value,
      gkey: onInput
    }, tw`bg-transparent border-0 focus:outline-none focus:ring-0 flex-1 text-sm`);
    const formAttrs = withClass(attrs || {}, tw`flex items-center gap-2 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 shadow-sm`);
    if (gkeySubmit) formAttrs.gkey = gkeySubmit;
    return h.Forms.Form({ attrs: formAttrs }, [
      leading && h.Text.Span({ attrs: { class: tw`text-lg opacity-60` } }, [leading]),
      h.Inputs.Input({ attrs: inputAttrs }),
      ...(trailing || [])
    ]);
  };

  UI.EmptyState = ({ icon = '✨', title, description, actions = [] }) =>
    h.Containers.Div({ attrs: { class: tw`${token('empty')}` } }, [
      icon && h.Text.Span({ attrs: { class: tw`text-4xl` } }, [icon]),
      title && h.Text.H3({ attrs: { class: tw`text-lg font-semibold` } }, [title]),
      description && h.Text.P({ attrs: { class: tw`${token('muted')} max-w-sm` } }, [description]),
      actions && actions.length ? h.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2 justify-center pt-2` } }, actions) : null
    ].filter(Boolean));

  UI.List = ({ attrs = {}, children = [] }) =>
    h.Containers.Div({ attrs: withClass(attrs, token('list')) }, children);

  UI.ListItem = ({ leading, content, trailing, attrs = {} }) =>
    h.Containers.Div({ attrs: withClass(attrs, token('list/item')) }, [
      leading && h.Containers.Div({ attrs: { class: tw`${token('list/item-leading')}` } }, [leading]),
      h.Containers.Div({ attrs: { class: tw`${token('list/item-content')}` } }, toChildren(content)),
      trailing && h.Containers.Div({ attrs: { class: tw`${token('list/item-trailing')}` } }, toChildren(trailing))
    ].filter(Boolean));

  function toChildren(node) {
    if (node == null) return [];
    return Array.isArray(node) ? node : [node];
  }

  UI.QtyStepper = ({ value = 1, gkeyDec, gkeyInc, gkeyEdit, size = 'sm', dataId }) =>
    h.Containers.Div({ attrs: { class: tw`flex items-center gap-1 bg-[var(--surface-2)] rounded-full px-1 py-1` } }, [
      UI.Button({ attrs: { gkey: gkeyDec, 'data-line-id': dataId, class: tw`w-8 h-8` }, size }, ['−']),
      h.Forms.Button({ attrs: { type: 'button', gkey: gkeyEdit, 'data-line-id': dataId, class: tw`min-w-[48px] text-center text-sm font-semibold` } }, [String(value)]),
      UI.Button({ attrs: { gkey: gkeyInc, 'data-line-id': dataId, class: tw`w-8 h-8` }, size }, ['+'])
    ]);

  UI.PriceText = ({ amount = 0, currency, locale }) => {
    let formatted = amount;
    try {
      const opts = currency ? { style: 'currency', currency } : { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 };
      formatted = new Intl.NumberFormat(locale || document.documentElement.lang || 'ar', opts).format(Number(amount) || 0);
    } catch (_) {
      formatted = (Number(amount) || 0).toFixed(2);
      if (currency) formatted += ' ' + currency;
    }
    return h.Text.Span({ attrs: { class: tw`font-semibold` } }, [formatted]);
  };

  UI.Segmented = ({ items = [], activeId, attrs = {} }) =>
    h.Containers.Div({ attrs: withClass(attrs, tw`inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] p-1`) },
      items.map(it => {
        const active = it.id === activeId;
        const segmentAttrs = Object.assign({ 'data-segment-id': it.id }, it.attrs || {});
        if (!('gkey' in segmentAttrs) && it.gkey) {
          segmentAttrs.gkey = it.gkey;
        }
        segmentAttrs.class = tw`${segmentAttrs.class || ''} ${active ? token('chip/active') : ''}`.trim();
        return UI.Button({
          attrs: segmentAttrs,
          variant: active ? 'solid' : 'ghost', size: 'sm'
        }, [it.label]);
      })
    );

  UI.StatCard = ({ title, value, meta, footer }) =>
    h.Containers.Div({ attrs: { class: tw`${token('stat/card')}` } }, [
      title && h.Text.Span({ attrs: { class: tw`text-sm ${token('muted')}` } }, [title]),
      value && h.Text.Span({ attrs: { class: tw`${token('stat/value')}` } }, [value]),
      meta && h.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [meta]),
      footer && h.Containers.Div({ attrs: { class: tw`pt-2 border-t border-dashed border-[var(--border)] mt-2 text-xs flex items-center gap-2` } }, footer)
    ].filter(Boolean));

  UI.Tabs = ({ items = [], activeId, gkey = 'ui:tabs:select' }) => {
    const header = h.Containers.Div({ attrs: { class: tw`${token('tabs/row')}` } }, items.map(it => {
      const active = it.id === activeId;
      return UI.Button({
        attrs: { gkey, 'data-tab-id': it.id, class: tw`${active ? token('tabs/btn-active') : token('tabs/btn')}` },
        variant: 'ghost', size: 'sm'
      }, [it.label]);
    }));
    const panels = items.map(it => {
      const hidden = it.id !== activeId;
      return h.Containers.Section({ attrs: { class: tw`${hidden ? 'hidden' : ''}`, key: `panel-${it.id}` } }, [
        typeof it.content === 'function' ? it.content() : it.content
      ]);
    });
    return UI.VStack({}, [header, ...panels]);
  };

  UI.Drawer = ({ open = false, side = 'start', header, content, closeGkey = 'ui:drawer:close', panelAttrs = {} }) => {
    if (!open) return h.Containers.Div({ attrs: { class: tw`hidden` } });
    const isRTL = (document.documentElement.getAttribute('dir') || 'ltr') === 'rtl';
    const start = isRTL ? 'right-0' : 'left-0';
    const end = isRTL ? 'left-0' : 'right-0';
    const place = side === 'start' ? start : end;
    return h.Containers.Div({ attrs: { class: tw`${token('modal-root')}` } }, [
      h.Containers.Div({ attrs: { class: tw`absolute inset-0`, gkey: closeGkey } }, [
        h.Containers.Div({ attrs: { class: tw`${token('backdrop')}` } })
      ]),
      h.Containers.Aside({ attrs: withClass(panelAttrs, tw`${token('drawer/side')} ${place}`) }, [
        h.Containers.Div({ attrs: { class: tw`${token('drawer/body')}` } }, [header, content])
      ])
    ]);
  };

  UI.Modal = ({ open = false, title, description, content, actions = [], size = 'md', closeGkey = 'ui:modal:close', sizeKey = null, sizeOptions = ['sm', 'md', 'lg', 'xl', 'full'], zIndex = null }) => {
    if (!open) return h.Containers.Div({ attrs: { class: tw`hidden` } });
    const uid = Math.random().toString(36).slice(2, 8);
    const titleId = title ? `modal-${uid}-title` : undefined;
    const descriptionId = description ? `modal-${uid}-desc` : undefined;
    const normalizedSize = typeof size === 'string' && size ? size : 'md';
    const optionList = Array.isArray(sizeOptions) && sizeOptions.length ? sizeOptions : ['sm', 'md', 'lg', 'xl', 'full'];
    const closeBtn = h.Forms.Button({
      attrs: withClass({
        type: 'button',
        gkey: closeGkey,
        'aria-label': 'Close dialog'
      }, cx(token('btn'), token('btn/ghost'), token('btn/icon')))
    }, ['✕']);
    const headerContent = [];
    if (sizeKey) {
      headerContent.push(
        UI.HStack({ attrs: { class: tw`items-center gap-1` } }, optionList.map(opt => {
          const active = opt === normalizedSize;
          return UI.Button({
            attrs: {
              gkey: 'ui:modal:size',
              'data-modal-size-key': sizeKey,
              'data-modal-size': opt,
              class: tw`${active ? 'opacity-100' : 'opacity-70'} text-[0.75rem]`
            },
            variant: active ? 'solid' : 'ghost',
            size: 'xs'
          }, [opt === 'full' ? '⛶' : opt.toUpperCase()]);
        }))
      );
    }
    if (title || description) {
      headerContent.push(
        h.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
          title && h.Text.H3({ attrs: { id: titleId, class: tw`${token('card/title')}` } }, [title]),
          description && h.Text.P({ attrs: { id: descriptionId, class: tw`${token('card/desc')}` } }, [description])
        ].filter(Boolean))
      );
    } else {
      headerContent.push(h.Containers.Div({ attrs: { class: tw`flex-1` } }, []));
    }
    headerContent.push(closeBtn);
    const actionNodes = (actions || []).filter(Boolean);
    const modalAttrs = {
      class: tw`${token('modal-card')} ${token(`modal/${normalizedSize}`) || token('modal/md')}`,
      role: 'dialog',
      'aria-modal': 'true'
    };
    if (titleId) modalAttrs['aria-labelledby'] = titleId;
    if (descriptionId) modalAttrs['aria-describedby'] = descriptionId;
    const rootAttrs = { class: tw`${token('modal-root')}`, role: 'presentation' };
    if (zIndex !== null && zIndex !== undefined) {
      let zValue = '';
      if (typeof zIndex === 'number' && Number.isFinite(zIndex)) {
        zValue = String(zIndex);
      } else if (typeof zIndex === 'string' && zIndex.trim()) {
        const parsed = Number(zIndex);
        zValue = Number.isFinite(parsed) ? String(parsed) : zIndex.trim();
      }
      if (zValue) {
        const existing = rootAttrs.style ? `${rootAttrs.style};` : '';
        rootAttrs.style = `${existing}z-index:${zValue};`;
      }
    }
    return h.Containers.Div({ attrs: rootAttrs }, [
      h.Containers.Div({ attrs: { class: tw`${token('backdrop')}`, gkey: closeGkey } }, []),
      h.Containers.Section({ attrs: modalAttrs }, [
        h.Containers.Div({ attrs: { class: tw`${token('modal/header')}` } }, headerContent.filter(Boolean)),
        content ? h.Containers.Div({ attrs: { class: tw`${token('modal/body')}` } }, [content]) : null,
        actionNodes.length ? h.Containers.Div({ attrs: { class: tw`${token('modal/footer')}` } }, actionNodes) : null
      ].filter(Boolean))
    ]);
  };

  UI.Table = ({ columns = [], rows = [] }) =>
    h.Tables.Table({ attrs: { class: tw`w-full text-sm border-separate [border-spacing:0_8px]` } }, [
      h.Tables.Thead({}, [
        h.Tables.Tr({}, columns.map((c, i) => h.Tables.Th({ attrs: { key: `h-${i}`, class: tw`text-right text-[var(--muted-foreground)] font-medium` } }, [c.label])))
      ]),
      h.Tables.Tbody({}, rows.map((r, ri) => h.Tables.Tr({ attrs: { key: `r-${ri}`, class: tw`bg-[var(--surface-1)] rounded-[var(--radius)] shadow-[var(--shadow)]` } },
        columns.map((c, ci) => h.Tables.Td({ attrs: { key: `c-${ri}-${ci}`, class: tw`px-4 py-2` } }, [String(r[c.key])]))
      )))
    ]);

  UI.ToastHost = ({ toasts = [] }) =>
    h.Containers.Div({ attrs: { class: tw`${token('toast/host')}`, 'aria-live': 'polite', 'aria-atomic': 'true' } }, [
      h.Containers.Div({ attrs: { class: tw`${token('toast/col')}` } }, toasts.map((t) => (
        h.Containers.Div({ attrs: { key: `to-${t.id}`, class: tw`${token('toast/item')}` } }, [
          t.icon && h.Text.Span({}, [t.icon]),
          h.Containers.Div({}, [
            h.Text.Span({ attrs: { class: tw`font-semibold` } }, [t.title || '']),
            t.message && h.Text.P({ attrs: { class: tw`text-[var(--muted-foreground)] text-sm` } }, [t.message])
          ])
        ])
      )))
    ]);
  let _toId = 1;
  UI.pushToast = (ctx, { title, message, icon, ttl = 2800 }) => {
    ctx.setState(s => {
      // Hide all previous toasts when showing a new one
      const list = [{ id: _toId++, title, message, icon }];
      return { ...s, ui: { ...(s.ui || {}), toasts: list } };
    });
    const id = _toId - 1;
    setTimeout(() => {
      const st = ctx.getState();
      const list = (st.ui?.toasts || []).filter(t => t.id !== id);
      ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), toasts: list } }));
    }, ttl);
  };

  UI.AppShell = ({ header, sidebar, content, footer }) =>
    h.Containers.Main({ attrs: { class: tw`min-h-screen` } }, [
      header,
      h.Containers.Div({ attrs: { class: tw`flex` } }, [
        sidebar && h.Containers.Aside({ attrs: { class: tw`hidden md:block w-[260px] border-e` } }, [sidebar]),
        h.Containers.Section({ attrs: { class: tw`flex-1 p-4` } }, [content])
      ]),
      footer
    ]);
  UI.CounterCard = ({ value = 0, gkeyInc, gkeyDec }) =>
    UI.Card({
      content: h.Containers.Div({ attrs: { class: tw`flex items-center justify-center gap-3` } }, [
        UI.Button({ attrs: { gkey: gkeyDec }, variant: 'soft', size: 'sm' }, ['−']),
        h.Text.Span({ attrs: { class: tw`text-xl font-bold` } }, [String(value)]),
        UI.Button({ attrs: { gkey: gkeyInc }, variant: 'soft', size: 'sm' }, ['+']),
      ])
    });


  /* ===================== Built-in Orders (tabs/modal/drawer + routing) ===================== */
  const ORDERS = {
    'ui.tabs.select': {
      on: ['click'], gkeys: ['ui:tabs:select'], handler: (e, ctx) => {
        const btn = e.target && (e.target.closest && e.target.closest('[data-tab-id]'));
        if (!btn) return; const id = btn.getAttribute('data-tab-id');
        ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), activeTab: id } }));
      }
    },
    'ui.modal.open': { on: ['click'], gkeys: ['ui:modal:open'], handler: (e, ctx) => { ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), modalOpen: true } })); } },
    'ui.modal.close': { on: ['click'], gkeys: ['ui:modal:close'], handler: (e, ctx) => { ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), modalOpen: false } })); } },
    'ui.drawer.toggle': { on: ['click'], gkeys: ['ui:drawer:toggle'], handler: (e, ctx) => { const cur = !!ctx.getState().ui?.drawerOpen; ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), drawerOpen: !cur } })); } },
    'ui.drawer.close': { on: ['click'], gkeys: ['ui:drawer:close'], handler: (e, ctx) => { ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), drawerOpen: false } })); } },

    // Routing (Dashboard / Inventory / Sales)
    'route.dashboard': { on: ['click'], gkeys: ['route:dashboard'], handler: (e, ctx) => { ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), route: 'dashboard' } })); } },
    'route.inventory': { on: ['click'], gkeys: ['route:inventory'], handler: (e, ctx) => { ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), route: 'inventory' } })); } },
    'route.sales': { on: ['click'], gkeys: ['route:sales'], handler: (e, ctx) => { ctx.setState(s => ({ ...s, ui: { ...(s.ui || {}), route: 'sales' } })); } }
  };

  const NOOP = () => { };
  const POS_ORDERS = {
    'pos.menu.search': { on: ['input', 'change'], gkeys: ['pos:menu:search'], handler: NOOP },
    'pos.menu.category': { on: ['click'], gkeys: ['pos:menu:category'], handler: NOOP },
    'pos.menu.add': { on: ['click'], gkeys: ['pos:menu:add'], handler: NOOP },
    'pos.menu.favorite': { on: ['click'], gkeys: ['pos:menu:favorite'], handler: NOOP },
    'pos.menu.load-more': { on: ['click'], gkeys: ['pos:menu:load-more'], handler: NOOP },

    'pos.order.line.inc': { on: ['click'], gkeys: ['pos:order:line:inc'], handler: NOOP },
    'pos.order.line.dec': { on: ['click'], gkeys: ['pos:order:line:dec'], handler: NOOP },
    'pos.order.line.qty': { on: ['click'], gkeys: ['pos:order:line:qty'], handler: NOOP },
    'pos.order.line.actions': { on: ['click'], gkeys: ['pos:order:line:actions'], handler: NOOP },
    'pos.order.clear': { on: ['click'], gkeys: ['pos:order:clear'], handler: NOOP },
    'pos.order.discount': { on: ['click'], gkeys: ['pos:order:discount'], handler: NOOP },
    'pos.order.note': { on: ['click'], gkeys: ['pos:order:note'], handler: NOOP },
    'pos.order.save': { on: ['click'], gkeys: ['pos:order:save'], handler: NOOP },
    'pos.order.print': { on: ['click'], gkeys: ['pos:order:print'], handler: NOOP },

    'pos.tables.open': { on: ['click'], gkeys: ['pos:tables:open'], handler: NOOP },
    'pos.tables.select': { on: ['click'], gkeys: ['pos:tables:select'], handler: NOOP },
    'pos.tables.merge': { on: ['click'], gkeys: ['pos:tables:merge'], handler: NOOP },
    'pos.tables.release': { on: ['click'], gkeys: ['pos:tables:release'], handler: NOOP },

    'pos.payments.open': { on: ['click'], gkeys: ['pos:payments:open'], handler: NOOP },
    'pos.payments.method': { on: ['click'], gkeys: ['pos:payments:method'], handler: NOOP },
    'pos.payments.capture': { on: ['click'], gkeys: ['pos:payments:capture'], handler: NOOP },
    'pos.payments.split': { on: ['click'], gkeys: ['pos:payments:split'], handler: NOOP },
    'pos.payments.close': { on: ['click'], gkeys: ['pos:payments:close'], handler: NOOP },

    'pos.returns.open': { on: ['click'], gkeys: ['pos:returns:open'], handler: NOOP },
    'pos.returns.add': { on: ['click'], gkeys: ['pos:returns:add'], handler: NOOP },

    'pos.reports.toggle': { on: ['click'], gkeys: ['pos:reports:toggle'], handler: NOOP },
    'pos.reports.filter': { on: ['change'], gkeys: ['pos:reports:filter'], handler: NOOP },
    'pos.reports.export': { on: ['click'], gkeys: ['pos:reports:export'], handler: NOOP },

    'pos.indexeddb.sync': { on: ['click'], gkeys: ['pos:indexeddb:sync'], handler: NOOP },
    'pos.indexeddb.flush': { on: ['click'], gkeys: ['pos:indexeddb:flush'], handler: NOOP },

    'pos.kds.connect': { on: ['click'], gkeys: ['pos:kds:connect'], handler: NOOP },
    'pos.kds.retry': { on: ['click'], gkeys: ['pos:kds:retry'], handler: NOOP },
    'pos.kds.preview': { on: ['click'], gkeys: ['pos:kds:preview'], handler: NOOP },

    'pos.shift.start': { on: ['click'], gkeys: ['pos:shift:start'], handler: NOOP },
    'pos.shift.end': { on: ['click'], gkeys: ['pos:shift:end'], handler: NOOP },
    'pos.session.logout': { on: ['click'], gkeys: ['pos:session:logout'], handler: NOOP },

    'pos.shortcuts.help': { on: ['click'], gkeys: ['pos:shortcuts:help'], handler: NOOP }
  };

  /* ===================== Generic Switcher Component ===================== */

  UI.Switcher = ({ options = [], activeValue, handlerName, attrs = {} }) => {
    return h.Containers.Div({
      attrs: withClass(attrs, tw`inline-flex items-center gap-1 p-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] shadow-sm`)
    }, options.map(opt => {
      const isActive = opt.value === activeValue;
      // Use standard HTMLx pattern: handler(event, ctx)
      // Pass value via data-attribute
      const clickAction = handlerName
        ? `${handlerName}(event, ctx)`
        : (opt.onClick || '');

      return h.Forms.Button({
        attrs: {
          type: 'button',
          'data-value': opt.value, // Pass value here
          class: cx(
            tw`relative inline-flex items-center justify-center min-w-[3.5rem] px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 cursor-pointer select-none`,
            isActive
              ? tw`bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm`
              : tw`text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-1)]`
          ),
          onclick: clickAction
        }
      }, [opt.label]);
    }));
  };

  /* ===================== Specific Switchers (Wrappers) ===================== */

  // Theme Switcher Wrapper
  // Defaults to calling 'setTheme' function in the global scope
  UI.ThemeSwitcher = ({ handler = 'setTheme', attrs = {}, theme }) => {
    // Read from props first, fallback to DOM
    const currentTheme = theme || document.documentElement.getAttribute('data-theme') || 'light';

    return UI.Switcher({
      attrs,
      activeValue: currentTheme,
      handlerName: handler,
      options: [
        { label: '🌞', value: 'light' },
        { label: '🌙', value: 'dark' }
      ]
    });
  };

  // Language Switcher Wrapper
  // Defaults to calling 'setLang' function in the global scope
  UI.LangSwitcher = ({ handler = 'setLang', attrs = {}, lang }) => {
    // Read from props first, fallback to DOM
    const currentLang = lang || document.documentElement.lang || 'ar';

    return UI.Switcher({
      attrs,
      activeValue: currentLang,
      handlerName: handler,
      options: [
        { label: 'عربي', value: 'ar' },
        { label: 'EN', value: 'en' }
      ]
    });
  };

  // Aliases for compatibility
  UI.ThemeToggleIcon = UI.ThemeSwitcher;
  UI.LanguageSwitch = UI.LangSwitcher;
  UI.ThemeSwitch = UI.ThemeSwitcher;
  UI.LangSwitch = UI.LangSwitcher;

  M.UI = Object.assign(M.UI || {}, UI);
  M.UI.orders = Object.assign({}, ORDERS, POS_ORDERS);
  M.UI.posOrders = POS_ORDERS;

})(window);
//markdown


(function (window) {
  'use strict';
  const M = window.Mishkah = window.Mishkah || {};
  const U = M.utils = M.utils || {};
  const h = M.DSL;
  const tw = U.twcss.tw;

  const headingTags = [null, h.Text.H1, h.Text.H2, h.Text.H3, h.Text.H4, h.Text.H5, h.Text.H6];
  const headingClasses = {
    1: tw`text-2xl sm:text-4xl font-bold tracking-tight`,
    2: tw`text-xl sm:text-3xl font-semibold`,
    3: tw`text-lg font-semibold`,
    4: tw`text-xl font-semibold`,
    5: tw`text-lg font-semibold`,
    6: tw`text-base font-semibold uppercase tracking-[0.2em]`
  };

  const isHeading = line => /^ {0,3}#{1,6}\s+/.test(line);
  const isHr = line => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
  const isFence = line => /^ {0,3}(```|~~~)/.test(line);
  const isBlockquote = line => /^ {0,3}>\s?/.test(line);
  const isListItem = line => /^ {0,3}([\*\+-]|\d+\.)\s+/.test(line);
  const isTableDivider = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line.trim());
  const hasTablePipe = line => /\|/.test(line || '');

  function splitTableRow(row) {
    let trimmed = String(row || '').trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    const cells = [];
    let cur = '';
    let escape = false;
    for (const ch of trimmed) {
      if (escape) { cur += ch; escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '|') { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function parseAlignRow(row) {
    return splitTableRow(row).map(cell => {
      const value = cell.trim();
      const left = value.startsWith(':');
      const right = value.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return 'left';
    });
  }

  function parseInline(text) {
    const str = String(text || '');
    if (!str) return [];
    const pattern = /(!?\[[^\]]*]\([^\)\s]+(?:\s+"[^"]*")?\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^\s][^*]*\*|_[^\s][^_]*_)/g;
    const tokens = [];
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(str)) !== null) {
      const index = match.index;
      if (index > lastIndex) {
        tokens.push({ type: 'text', text: str.slice(lastIndex, index) });
      }
      const token = match[0];
      if (token.startsWith('![')) {
        const m = token.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
        if (m) {
          tokens.push({ type: 'image', alt: m[1] || '', src: m[2], title: m[3] || '' });
        } else {
          tokens.push({ type: 'text', text: token });
        }
      } else if (token.startsWith('[')) {
        const m = token.match(/^\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
        if (m) {
          tokens.push({ type: 'link', href: m[2], title: m[3] || '', children: parseInline(m[1]) });
        } else {
          tokens.push({ type: 'text', text: token });
        }
      } else if (token.startsWith('**') || token.startsWith('__')) {
        tokens.push({ type: 'strong', children: parseInline(token.slice(2, -2)) });
      } else if (token.startsWith('~~')) {
        tokens.push({ type: 'del', children: parseInline(token.slice(2, -2)) });
      } else if (token.startsWith('*') || token.startsWith('_')) {
        tokens.push({ type: 'em', children: parseInline(token.slice(1, -1)) });
      } else if (token.startsWith('`')) {
        tokens.push({ type: 'code', text: token.slice(1, -1) });
      } else {
        tokens.push({ type: 'text', text: token });
      }
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < str.length) {
      tokens.push({ type: 'text', text: str.slice(lastIndex) });
    }
    return tokens;
  }

  function renderInlines(tokens, keyPrefix) {
    return (tokens || []).map((token, idx) => {
      const key = `${keyPrefix}-${idx}`;
      switch (token.type) {
        case 'text':
          if (typeof token.text === 'string') {
            const trimmed = token.text.trim();
            const imagePattern = /^(https?:\/\/[^\s]+\.(?:png|jpe?g|gif|svg|webp))(\?[^\s]*)?$/i;
            if (trimmed && imagePattern.test(trimmed)) {
              const match = trimmed.match(imagePattern);
              const src = match ? match[1] + (match[2] || '') : trimmed;
              return h.Media.Img({ attrs: { key: `${key}-img`, src, alt: '', class: tw`inline-block h-6 align-middle rounded-lg shadow-[0_8px_20px_-12px_rgba(79,70,229,0.55)]` } });
            }
          }
          return token.text;
        case 'strong':
          return h.Text.Strong({ attrs: { key } }, renderInlines(token.children, key));
        case 'em':
          return h.Text.Em({ attrs: { key } }, renderInlines(token.children, key));
        case 'del':
          return h.Text.Del({ attrs: { key } }, renderInlines(token.children, key));
        case 'code':
          return h.Text.Code({ attrs: { key, class: tw`text-sm` } }, [token.text]);
        case 'link':
          return h.Text.A({ attrs: { key, href: token.href, target: '_blank', rel: 'noopener noreferrer', class: tw`underline decoration-dotted underline-offset-4` } }, renderInlines(token.children, key));
        case 'image':
          return h.Media.Img({ attrs: { key, src: token.src, alt: token.alt || '', title: token.title || '', class: tw`rounded-xl shadow-[var(--shadow)] max-w-full` } });
        default:
          return token.text || '';
      }
    });
  }

  function parseBlocks(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (!line || !line.trim()) { i++; continue; }
      if (isFence(line)) {
        const fence = line.match(/^ {0,3}(```|~~~)(.*)$/);
        const lang = fence && fence[2] ? fence[2].trim() : '';
        i++;
        const codeLines = [];
        while (i < lines.length && !isFence(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
        continue;
      }
      if (isHr(line)) {
        blocks.push({ type: 'hr' });
        i++;
        continue;
      }
      if (isHeading(line)) {
        const match = line.match(/^ {0,3}(#{1,6})\s+(.*)$/);
        blocks.push({ type: 'heading', level: match[1].length, text: match[2].trim() });
        i++;
        continue;
      }
      if (isBlockquote(line)) {
        const quoteLines = [];
        while (i < lines.length && isBlockquote(lines[i])) {
          quoteLines.push(lines[i].replace(/^ {0,3}>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'blockquote', blocks: parseBlocks(quoteLines.join('\n')) });
        continue;
      }
      if (hasTablePipe(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
        const header = splitTableRow(line);
        const aligns = parseAlignRow(lines[i + 1]);
        i += 2;
        const rows = [];
        while (i < lines.length && hasTablePipe(lines[i]) && !isTableDivider(lines[i])) {
          if (!lines[i].trim()) { i++; break; }
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        blocks.push({ type: 'table', header, aligns, rows });
        continue;
      }
      if (isListItem(line)) {
        const ordered = /\d+\./.test(line);
        const items = [];
        while (i < lines.length) {
          const current = lines[i];
          if (!isListItem(current)) break;
          const match = current.match(/^ {0,3}([\*\+-]|\d+\.)\s+(.*)$/);
          i++;
          const buffer = [match[2]];
          while (i < lines.length) {
            const next = lines[i];
            if (!next.trim()) { buffer.push(''); i++; continue; }
            if (isListItem(next) || isHeading(next) || isFence(next) || isBlockquote(next) || isHr(next) || (hasTablePipe(next) && isTableDivider(lines[i + 1] || ''))) break;
            buffer.push(next.replace(/^ {1,4}/, ''));
            i++;
          }
          while (buffer.length && buffer[buffer.length - 1] === '') buffer.pop();
          const text = buffer.join('\n');
          const taskMatch = text.match(/^\[([ xX])]\s+([\s\S]*)$/);
          if (taskMatch) {
            items.push({ type: 'task', done: taskMatch[1].toLowerCase() === 'x', blocks: parseBlocks(taskMatch[2]) });
          } else {
            items.push({ type: 'item', blocks: parseBlocks(text) });
          }
        }
        blocks.push({ type: 'list', ordered, items });
        continue;
      }
      const paragraph = [line];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) { i++; break; }
        if (isFence(next) || isHeading(next) || isBlockquote(next) || isListItem(next) || isHr(next) || (hasTablePipe(next) && isTableDivider(lines[i + 1] || ''))) break;
        paragraph.push(next);
        i++;
      }
      blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    }
    return blocks;
  }

  function renderBlocks(blocks, keyPrefix) {
    const out = [];
    (blocks || []).forEach((block, idx) => {
      const key = `${keyPrefix}-${idx}`;
      switch (block.type) {
        case 'heading': {
          const level = Math.max(1, Math.min(6, block.level || 1));
          const Tag = headingTags[level] || h.Text.H3;
          out.push(Tag({ attrs: { class: headingClasses[level] || tw`text-xl font-semibold`, key } }, renderInlines(parseInline(block.text), key)));
          break;
        }
        case 'paragraph': {
          const inlineTokens = parseInline(block.text);
          out.push(h.Text.P({ attrs: { class: tw`leading-8 text-[color-mix(in oklab,var(--foreground) 85%, var(--muted-foreground) 15%)]`, key } }, renderInlines(inlineTokens, key)));
          break;
        }
        case 'blockquote': {
          const children = renderBlocks(block.blocks, `${key}-bq`);
          out.push(h.Text.Blockquote({ attrs: { class: tw`space-y-2`, key } }, children.length ? children : [h.Text.P({}, [''])]));
          break;
        }
        case 'list': {
          const listChildren = (block.items || []).map((item, itemIdx) => {
            const itemKey = `${key}-item-${itemIdx}`;
            let inner = renderBlocks(item.blocks, itemKey);
            if (!inner.length) inner = [''];
            if (item.type === 'task') {
              inner = [h.Containers.Div({ attrs: { class: tw`flex items-start gap-3` } }, [
                h.Inputs.Input({ attrs: { type: 'checkbox', checked: item.done ? 'checked' : undefined, disabled: true, class: tw`mt-1` } }),
                h.Containers.Div({ attrs: { class: tw`space-y-2` } }, inner)
              ])];
            }
            return h.Lists.Li({ attrs: { key: itemKey } }, inner);
          });
          const ListTag = block.ordered ? h.Lists.Ol : h.Lists.Ul;
          out.push(ListTag({ attrs: { class: tw`space-y-2`, key } }, listChildren));
          break;
        }
        case 'code': {
          out.push(h.Text.Pre({ attrs: { class: tw`overflow-auto`, key, 'data-lang': block.lang || undefined } }, [
            h.Text.Code({ attrs: { class: tw`block text-sm leading-7` } }, [block.code || ''])
          ]));
          break;
        }
        case 'table': {
          const align = (block.aligns || []).map(a => {
            if (a === 'center') return 'center';
            if (a === 'right') return 'right';
            return 'start';
          });
          const headerCells = (block.header || []).map((cell, ci) =>
            h.Tables.Th({ attrs: { key: `${key}-h-${ci}`, style: `text-align:${align[ci] || 'start'};` } }, renderInlines(parseInline(cell), `${key}-h-${ci}`))
          );
          const bodyRows = (block.rows || []).map((row, ri) =>
            h.Tables.Tr({ attrs: { key: `${key}-r-${ri}` } }, row.map((cell, ci) =>
              h.Tables.Td({ attrs: { key: `${key}-c-${ri}-${ci}`, style: `text-align:${align[ci] || 'start'};` } }, renderInlines(parseInline(cell), `${key}-c-${ri}-${ci}`))
            ))
          );
          const tableNode = h.Tables.Table({ attrs: { class: tw`min-w-full text-sm`, key: `${key}-table` } }, [
            h.Tables.Thead({}, [h.Tables.Tr({ attrs: { key: `${key}-thead` } }, headerCells)]),
            h.Tables.Tbody({}, bodyRows)
          ]);
          out.push(h.Containers.Div({ attrs: { class: tw`overflow-x-auto`, key: `${key}-wrap` } }, [tableNode]));
          break;
        }
        case 'hr': {
          out.push(h.Containers.Div({ attrs: { class: tw`h-px bg-[color-mix(in oklab,var(--border) 70%, transparent)] my-10`, key } }));
          break;
        }
        default: {
          if (block && block.text) {
            out.push(h.Text.P({ attrs: { key } }, [block.text]));
          }
        }
      }
    });
    return out;
  }

  function joinClass(base, extra) {
    const a = (base || '').trim();
    const b = (extra || '').trim();
    if (a && b) return `${a} ${b}`;
    return a || b || '';
  }

  function MarkdownRenderer(opts) {
    const content = opts && typeof opts.content === 'string' ? opts.content : '';
    const className = joinClass(opts && opts.className, tw`md-prose`);
    if (!content.trim()) {
      return h.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, ['—']);
    }
    const blocks = parseBlocks(content);
    const children = renderBlocks(blocks, 'md');
    return h.Containers.Article({ attrs: { class: className, key: 'markdown-article' } }, children);
  }

  M.UI.Markdown = (opts = {}) => MarkdownRenderer(opts);

  U.UDM = MarkdownRenderer;
})(window);
