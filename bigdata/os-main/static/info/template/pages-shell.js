(function (window) {
  'use strict';

  const M = window.Mishkah = window.Mishkah || {};
  const Templates = M.templates = M.templates || {};
  const D = M.DSL;
  const UI = M.UI;
  const U = M.utils = M.utils || {};
  const { tw, cx } = U.twcss;

  const ensureArray = (value) => (Array.isArray(value) ? value.slice() : []);
  const ensureDict = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

  const helpers = { tw, cx };

  const DEFAULT_THEME_LAB_TEXT = {
    button: { ar: 'تخصيص الثيم', en: 'Theme designer' },
    title: { ar: 'معمل ألوان الواجهة', en: 'Interface theme lab' },
    description: {
      ar: 'عدّل متغيرات CSS الأساسية للثيم مباشرة وشاهد النتيجة فورًا.',
      en: 'Tweak the key CSS variables of the theme and preview the result instantly.'
    },
    apply: { ar: 'تطبيق', en: 'Apply' },
    reset: { ar: 'إعادة ضبط', en: 'Reset' }
  };

  const DEFAULT_THEME_VARS = [
    { key: '--background', type: 'color', fallback: '#f5f7ff', label: { ar: 'لون الخلفية', en: 'Background' } },
    { key: '--foreground', type: 'color', fallback: '#0f172a', label: { ar: 'لون النص', en: 'Foreground' } },
    { key: '--primary', type: 'color', fallback: '#6366f1', label: { ar: 'اللون الرئيسي', en: 'Primary' } },
    { key: '--primary-foreground', type: 'color', fallback: '#ffffff', label: { ar: 'نص اللون الرئيسي', en: 'Primary text' } },
    { key: '--accent', type: 'color', fallback: '#38bdf8', label: { ar: 'اللون المساند', en: 'Accent' } },
    { key: '--accent-foreground', type: 'color', fallback: '#022c4b', label: { ar: 'نص اللون المساند', en: 'Accent text' } },
    { key: '--muted', type: 'color', fallback: '#94a3b8', label: { ar: 'لون خافت', en: 'Muted' } },
    { key: '--border', type: 'color', fallback: '#cbd5f5', label: { ar: 'لون الحدود', en: 'Border' } }
  ];

  const THEME_VAR_DEFAULTS = DEFAULT_THEME_VARS.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});

  let appliedThemeOverrides = {};

  function callComponent(registry, name, db) {
    if (!name) return null;
    const comp = registry && registry[name];
    if (typeof comp === 'function') {
      return comp(db, helpers) || null;
    }
    return null;
  }

  function getLangInfo(db) {
    const lang = (db.env && db.env.lang) || (db.i18n && db.i18n.lang) || 'ar';
    const fallback = lang === 'ar' ? 'en' : 'ar';
    return { lang, fallback };
  }

  function localizeText(entry, fallbackText, info) {
    if (!entry) return fallbackText;
    if (typeof entry === 'string') return entry;
    const langValue = entry[info.lang];
    if (langValue) return langValue;
    const fallbackValue = entry[info.fallback];
    if (fallbackValue) return fallbackValue;
    if (entry.ar) return entry.ar;
    if (entry.en) return entry.en;
    const keys = Object.keys(entry);
    return keys.length ? entry[keys[0]] : fallbackText;
  }

  function normalizeColor(value, fallback) {
    const source = (value || fallback || '').toString().trim();
    if (!source) return '';
    const hexMatch = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[0];
      if (hex.length === 4) {
        return '#' + hex.slice(1).split('').map((ch) => ch + ch).join('');
      }
      return hex.toLowerCase();
    }
    if (/^rgb/i.test(source)) {
      const nums = source.match(/[-]?[\d\.]+/g) || [];
      if (nums.length >= 3) {
        const [r, g, b] = nums.slice(0, 3).map((n) => {
          const v = Math.max(0, Math.min(255, Math.round(Number(n))));
          return v.toString(16).padStart(2, '0');
        });
        return `#${r}${g}${b}`;
      }
    }
    if (/^hsl/i.test(source)) {
      const parts = source.match(/[-]?[\d\.]+/g) || [];
      if (parts.length >= 3) {
        const hRaw = Number(parts[0]);
        const sRaw = Number(parts[1]);
        const lRaw = Number(parts[2]);
        const h = ((hRaw % 360) + 360) % 360;
        const s = sRaw > 1 ? sRaw / 100 : sRaw;
        const l = lRaw > 1 ? lRaw / 100 : lRaw;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r = 0;
        let g = 0;
        let b = 0;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
    }
    return source;
  }

  function readDocumentColor(key, fallback) {
    if (typeof window === 'undefined' || !window.getComputedStyle) {
      return normalizeColor(fallback, fallback);
    }
    const root = window.document && window.document.documentElement;
    if (!root) {
      return normalizeColor(fallback, fallback);
    }
    const computed = window.getComputedStyle(root).getPropertyValue(key) || '';
    return normalizeColor(computed, fallback);
  }

  function mergeThemeVarConfig(inputList) {
    const list = Array.isArray(inputList) && inputList.length ? inputList : DEFAULT_THEME_VARS;
    return list.map((item) => {
      const src = ensureDict(item);
      const base = THEME_VAR_DEFAULTS[src.key] || {};
      const key = typeof src.key === 'string' ? src.key : base.key;
      if (!key) return null;
      const type = src.type || base.type || 'color';
      const fallback = src.fallback || base.fallback || '#000000';
      const label = src.label || base.label || { ar: key, en: key };
      const attrs = ensureDict(src.attrs);
      const inputType = src.inputType || src.type || base.inputType || (type === 'color' ? 'color' : 'text');
      return { key, type, fallback, label, attrs, inputType };
    }).filter(Boolean);
  }

  function getThemeLabConfig(db) {
    const dataConfig = ensureDict((db.data && db.data.themeLab) || db.themeLab);
    const textOverrides = ensureDict(dataConfig.text);
    const vars = mergeThemeVarConfig(dataConfig.vars);
    return {
      enabled: dataConfig.enabled !== false,
      text: {
        button: textOverrides.button || DEFAULT_THEME_LAB_TEXT.button,
        title: textOverrides.title || DEFAULT_THEME_LAB_TEXT.title,
        description: textOverrides.description || DEFAULT_THEME_LAB_TEXT.description,
        apply: textOverrides.apply || DEFAULT_THEME_LAB_TEXT.apply,
        reset: textOverrides.reset || DEFAULT_THEME_LAB_TEXT.reset
      },
      vars
    };
  }

  function getThemeLabState(db) {
    const shell = ensureDict(ensureDict(db.ui).pagesShell);
    const themeLab = ensureDict(shell.themeLab);
    return {
      open: !!themeLab.open,
      draft: ensureDict(themeLab.draft)
    };
  }

  function getThemeOverrides(db) {
    return ensureDict((db.data && db.data.themeOverrides) || db.themeOverrides);
  }

  function applyThemeOverrides(overrides) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root || !root.style) return;
    const style = root.style;
    const next = ensureDict(overrides);
    Object.keys(appliedThemeOverrides).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        style.removeProperty(key);
      }
    });
    Object.keys(next).forEach((key) => {
      const value = next[key];
      if (value == null || value === '') {
        style.removeProperty(key);
      } else {
        style.setProperty(key, value);
      }
    });
    appliedThemeOverrides = Object.assign({}, next);
  }

  function ensureOverridesApplied(db) {
    const overrides = getThemeOverrides(db);
    if (Object.keys(overrides).length) {
      applyThemeOverrides(overrides);
    }
  }

  function getNavState(db) {
    const ui = ensureDict(db.ui);
    const shell = ensureDict(ui.pagesShell);
    const nav = ensureDict(shell.nav);
    return nav;
  }

  function renderNavButton(page, activeKey, orientation, langInfo) {
    const key = page.key;
    const label = page.label || {};
    const icon = page.icon || '';
    const isActive = key === activeKey;
    const isMobileInline = orientation === 'mobile-inline';
    const isMobileOverlay = orientation === 'mobile-overlay';
    const baseClasses = isMobileInline
      ? tw`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition` + ' flex items-center gap-2'
      : isMobileOverlay
        ? tw`w-full justify-between rounded-2xl px-4 py-3 text-base font-semibold transition` + ' flex items-center gap-3'
        : tw`w-full justify-start rounded-xl px-4 py-3 font-semibold text-sm transition` + ' flex items-center gap-3';
    const activeClasses = isMobileInline || isMobileOverlay
      ? tw`bg-[var(--primary)] text-[var(--primary-foreground)] shadow`
      : tw`bg-[color-mix(in_oklab,var(--primary)75%,transparent)] text-[var(--primary-foreground)] shadow`;
    const inactiveClasses = isMobileInline
      ? tw`bg-[color-mix(in_oklab,var(--surface-1)80%,transparent)] text-[var(--foreground)]`
      : isMobileOverlay
        ? tw`bg-[color-mix(in_oklab,var(--surface-1)92%,transparent)] text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--primary)15%,transparent)]`
        : tw`bg-[color-mix(in_oklab,var(--surface-1)85%,transparent)] text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--primary)12%,transparent)]`;
    const localizedSource = typeof label.title === 'object' ? label.title : label;
    const fallbackLabel = typeof label.title === 'string'
      ? label.title
      : label.ar || label.en || key;
    const buttonLabel = localizeText(localizedSource, fallbackLabel || key, langInfo);

    return UI.Button({
      attrs: {
        gkey: `pages:go:${key}`,
        'data-pagekey': key,
        class: cx(baseClasses, isActive ? activeClasses : inactiveClasses)
      },
      variant: 'ghost',
      size: isMobileOverlay ? 'md' : (isMobileInline ? 'sm' : 'md')
    }, [icon ? `${icon} ${buttonLabel}` : buttonLabel]);
  }

  function renderNavigation(db, pages, activeKey) {
    const langInfo = getLangInfo(db);
    const navState = getNavState(db);
    const mobileOpen = !!navState.mobileOpen;
    const closeLabel = langInfo.lang === 'ar' ? 'إغلاق القائمة' : 'Close menu';
    const menuTitle = langInfo.lang === 'ar' ? 'قائمة الصفحات' : 'Pages menu';

    const toggleButton = null;

    const mobileList = pages.map((page) => D.Lists.Li({ attrs: { key: `m-${page.key}` } }, [
      renderNavButton(page, activeKey, 'mobile-overlay', langInfo)
    ]));

    const mobilePanel = mobileOpen
      ? D.Containers.Div({
        attrs: {
          class: tw`md:hidden fixed inset-x-3 top-24 z-40 space-y-3 rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)94%,transparent)] p-4 shadow-xl backdrop-blur`
        }
      }, [
        D.Containers.Div({
          attrs: { class: tw`flex items-center justify-between` }
        }, [
          D.Text.Strong({ attrs: { class: tw`text-base` } }, [menuTitle]),
          UI.Button({
            attrs: {
              gkey: 'pages:nav:close',
              class: tw`inline-flex items-center gap-2 rounded-full bg-gradient-to-l from-[var(--primary)] to-[color-mix(in_oklab,var(--accent)65%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] shadow-[0_16px_36px_-24px_rgba(79,70,229,0.55)]`
            },
            variant: 'ghost',
            size: 'sm'
          }, ['✕', closeLabel])
        ]),
        D.Lists.Ul({ attrs: { class: tw`grid gap-2` } }, mobileList)
      ])
      : null;

    const mobileNav = D.Containers.Div({ attrs: { class: tw`md:hidden` } }, [mobilePanel, toggleButton]);

    const mobileOverlay = mobileOpen
      ? D.Containers.Div({
        attrs: {
          class: tw`md:hidden fixed inset-0 z-30 bg-[rgba(15,23,42,0.45)] backdrop-blur-sm`,
          gkey: 'pages:nav:close'
        }
      })
      : null;

    const actionBar = (() => {
      const navLabel = langInfo.lang === 'ar' ? 'القائمة' : 'Menu';
      const topLabel = langInfo.lang === 'ar' ? 'أعلى' : 'Top';
      const searchLabel = langInfo.lang === 'ar' ? 'بحث' : 'Search';
      const closeShortLabel = langInfo.lang === 'ar' ? 'إغلاق' : 'Close';

      const navAction = UI.Button({
        attrs: {
          gkey: 'pages:nav:toggle',
          class: tw`flex flex-1 items-center justify-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--surface-1)96%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[color-mix(in_oklab,var(--primary)18%,transparent)]`,
          'aria-label': mobileOpen ? closeLabel : navLabel
        },
        variant: 'ghost',
        size: 'sm'
      }, [mobileOpen ? '✕' : '📑', mobileOpen ? closeShortLabel : navLabel]);

      const toTopAction = UI.Button({
        attrs: {
          gkey: 'pages:mobile:scrollTop',
          class: tw`flex flex-1 items-center justify-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--surface-1)96%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[color-mix(in_oklab,var(--primary)18%,transparent)]`,
          'aria-label': topLabel
        },
        variant: 'ghost',
        size: 'sm'
      }, ['⬆️', topLabel]);

      const searchAction = UI.Button({
        attrs: {
          gkey: 'pages:mobile:search',
          class: tw`flex flex-1 items-center justify-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--surface-1)96%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[color-mix(in_oklab,var(--primary)18%,transparent)]`,
          'aria-label': searchLabel
        },
        variant: 'ghost',
        size: 'sm'
      }, ['🔍', searchLabel]);

      return D.Containers.Div({
        attrs: {
          class: tw`md:hidden pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),0px)]`,
          'aria-hidden': 'false'
        }
      }, [
        D.Containers.Div({
          attrs: {
            class: tw`pointer-events-auto mx-3 flex w-full max-w-md items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)92%,transparent)] px-3 py-2 shadow-[0_-8px_32px_-18px_rgba(15,23,42,0.45)] backdrop-blur`
          }
        }, [navAction, toTopAction, searchAction])
      ]);
    })();

    const sideNav = D.Containers.Aside({
      attrs: {
        class: tw`hidden md:flex md:w-[240px] md:flex-col md:border-s md:border-[color-mix(in_oklab,var(--border)60%,transparent)] md:pe-4`
      }
    }, [
      D.Containers.Nav({
        attrs: {
          class: tw`sticky top-24 flex flex-col gap-2`
        }
      }, pages.map((page) => renderNavButton(page, activeKey, 'desktop', langInfo)))
    ]);

    return { mobileNav, mobileOverlay, mobileActions: actionBar, sideNav };
  }

  function renderPage(db, registry, pages, activeKey) {
    const activePage = pages.find((page) => page && page.key === activeKey) || pages[0];
    if (!activePage) {
      return D.Containers.Section({ attrs: { class: tw`p-6` } }, [
        UI.EmptyState({
          icon: '📄',
          title: 'No page',
          message: 'لم يتم تعريف أي صفحة في القالب.'
        })
      ]);
    }

    const body = activePage.dsl && typeof activePage.dsl === 'function'
      ? activePage.dsl(db, helpers)
      : callComponent(registry, activePage.comp, db);

    return D.Containers.Section({
      attrs: {
        class: tw`flex-1`,
        'data-pagekey': activePage.key
      }
    }, [body].filter(Boolean));
  }

  function renderThemeLabButton(db, config, langInfo) {
    if (!config.enabled) return null;
    const state = getThemeLabState(db);
    const label = localizeText(config.text.button, 'Theme designer', langInfo);
    const buttonClasses = cx(
      tw`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition`,
      tw`bg-[color-mix(in_oklab,var(--surface-1)88%,transparent)] text-[var(--foreground)] hover:bg-[color-mix(in_oklab,var(--primary)15%,transparent)]`,
      state.open ? tw`bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm` : ''
    );

    return UI.Button({
      attrs: {
        gkey: 'pages:theme:lab:open',
        'data-theme-lab': 'open',
        class: buttonClasses
      },
      variant: 'ghost',
      size: 'sm'
    }, [`🎨 ${label}`]);
  }

  function renderThemeLabModal(db, config, langInfo) {
    if (!config.enabled) return null;
    const state = getThemeLabState(db);
    const overrides = getThemeOverrides(db);
    const varList = config.vars;
    const inputs = varList.map((item) => {
      const key = item.key;
      const type = item.type;
      const label = localizeText(item.label, key, langInfo);
      const draftValue = state.draft[key];
      const storedValue = overrides[key];
      let value = draftValue != null ? draftValue : (storedValue != null ? storedValue : null);
      if (value == null) {
        value = type === 'color' ? readDocumentColor(key, item.fallback) : (item.fallback || '');
      }
      if (type === 'color') {
        value = normalizeColor(value, item.fallback) || normalizeColor(item.fallback, '#000000') || '#000000';
      }
      const attrs = Object.assign({
        gkey: 'pages:theme:lab:change',
        'data-css-var': key,
        'data-css-type': type,
        value: value
      }, item.attrs || {});
      if (!attrs.type) {
        attrs.type = item.inputType || (type === 'color' ? 'color' : 'text');
      }
      return UI.Field({
        label,
        control: UI.Input({ attrs })
      });
    });

    const grid = D.Containers.Div({
      attrs: { class: tw`grid gap-4 sm:grid-cols-2` }
    }, inputs);

    const title = localizeText(config.text.title, 'Theme lab', langInfo);
    const description = localizeText(config.text.description, '', langInfo);
    const applyLabel = localizeText(config.text.apply, 'Apply', langInfo);
    const resetLabel = localizeText(config.text.reset, 'Reset', langInfo);

    const actions = [
      UI.Button({
        attrs: { gkey: 'pages:theme:lab:reset', class: tw`w-full sm:w-auto` },
        variant: 'ghost',
        size: 'sm'
      }, [`↺ ${resetLabel}`]),
      UI.Button({
        attrs: { gkey: 'pages:theme:lab:apply', class: tw`w-full sm:w-auto` },
        variant: 'solid',
        size: 'sm'
      }, [`✅ ${applyLabel}`])
    ];

    return UI.Modal({
      open: state.open,
      title,
      description,
      content: D.Containers.Div({ attrs: { class: tw`space-y-5` } }, [grid]),
      actions,
      size: 'md',
      closeGkey: 'pages:theme:lab:close'
    });
  }

  function shouldRenderThemeLabButton(db) {
    const ui = ensureDict(db.ui);
    const shell = ensureDict(ui.pagesShell);
    const themeLabUi = ensureDict(shell.themeLab);
    if (Object.prototype.hasOwnProperty.call(themeLabUi, 'showButton')) {
      return themeLabUi.showButton !== false;
    }
    return true;
  }

  function sanitizeOverrides(raw, config) {
    const list = config.vars;
    const allowedKeys = new Set(list.map((item) => item.key));
    const cleaned = {};
    Object.keys(raw || {}).forEach((key) => {
      if (!allowedKeys.has(key)) return;
      const meta = list.find((item) => item.key === key) || {};
      const type = meta.type;
      const fallback = meta.fallback;
      const value = raw[key];
      if (value == null || value === '') return;
      cleaned[key] = type === 'color' ? normalizeColor(value, fallback) : String(value);
    });
    return cleaned;
  }

  function createThemeLabOrders() {
    return {
      'pages.theme.lab.open': {
        on: ['click'],
        gkeys: ['pages:theme:lab:open'],
        handler: (event, context) => {
          const state = context.getState();
          const config = getThemeLabConfig(state);
          const overrides = getThemeOverrides(state);
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevTheme = ensureDict(prevShell.themeLab);
            const draft = Object.keys(prevTheme.draft || {}).length ? prevTheme.draft : overrides;
            return Object.assign({}, prev, {
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  themeLab: Object.assign({}, prevTheme, {
                    open: true,
                    draft: Object.assign({}, draft)
                  })
                })
              })
            });
          });
        }
      },
      'pages.theme.lab.close': {
        on: ['click'],
        gkeys: ['pages:theme:lab:close'],
        handler: (_event, context) => {
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevTheme = ensureDict(prevShell.themeLab);
            if (!prevTheme.open) return prev;
            return Object.assign({}, prev, {
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  themeLab: Object.assign({}, prevTheme, { open: false })
                })
              })
            });
          });
        }
      },
      'pages.theme.lab.change': {
        on: ['input', 'change'],
        gkeys: ['pages:theme:lab:change'],
        handler: (event, context) => {
          const target = event.target && event.target.closest ? event.target.closest('[data-css-var]') : null;
          if (!target) return;
          const key = target.getAttribute('data-css-var');
          if (!key) return;
          const type = target.getAttribute('data-css-type') || 'text';
          const raw = typeof target.value === 'string' ? target.value : target.getAttribute('value') || '';
          const value = type === 'color' ? normalizeColor(raw, raw) : raw;
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevTheme = ensureDict(prevShell.themeLab);
            const prevDraft = ensureDict(prevTheme.draft);
            const nextDraft = Object.assign({}, prevDraft);
            nextDraft[key] = value;
            return Object.assign({}, prev, {
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  themeLab: Object.assign({}, prevTheme, {
                    draft: nextDraft
                  })
                })
              })
            });
          });
        }
      },
      'pages.theme.lab.apply': {
        on: ['click'],
        gkeys: ['pages:theme:lab:apply'],
        handler: (_event, context) => {
          const state = context.getState();
          const config = getThemeLabConfig(state);
          const draft = ensureDict(getThemeLabState(state).draft);
          const cleaned = sanitizeOverrides(draft, config);
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevTheme = ensureDict(prevShell.themeLab);
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data || {}, { themeOverrides: cleaned }),
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  themeLab: Object.assign({}, prevTheme, {
                    draft: Object.assign({}, cleaned)
                  })
                })
              })
            });
          });
          applyThemeOverrides(cleaned);
        }
      },
      'pages.theme.lab.reset': {
        on: ['click'],
        gkeys: ['pages:theme:lab:reset'],
        handler: (_event, context) => {
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevTheme = ensureDict(prevShell.themeLab);
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data || {}, { themeOverrides: {} }),
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  themeLab: Object.assign({}, prevTheme, {
                    draft: {}
                  })
                })
              })
            });
          });
          applyThemeOverrides({});
        }
      }
    };
  }

  function createNavUiOrders() {
    return {
      'pages.nav.toggle': {
        on: ['click'],
        gkeys: ['pages:nav:toggle'],
        handler: (_event, context) => {
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevNav = ensureDict(prevShell.nav);
            const prevMenus = ensureDict(prevShell.headerMenus);
            const mobileOpen = !!prevNav.mobileOpen;
            return Object.assign({}, prev, {
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  nav: Object.assign({}, prevNav, { mobileOpen: !mobileOpen }),
                  headerMenus: Object.assign({}, prevMenus, { mobileSettingsOpen: false })
                })
              })
            });
          });
        }
      },
      'pages.nav.close': {
        on: ['click'],
        gkeys: ['pages:nav:close'],
        handler: (_event, context) => {
          context.setState((prev) => {
            const prevUi = ensureDict(prev.ui);
            const prevShell = ensureDict(prevUi.pagesShell);
            const prevNav = ensureDict(prevShell.nav);
            const prevMenus = ensureDict(prevShell.headerMenus);
            if (!prevNav.mobileOpen) return prev;
            return Object.assign({}, prev, {
              ui: Object.assign({}, prevUi, {
                pagesShell: Object.assign({}, prevShell, {
                  nav: Object.assign({}, prevNav, { mobileOpen: false }),
                  headerMenus: Object.assign({}, prevMenus, { mobileSettingsOpen: false })
                })
              })
            });
          });
        }
      },
      'pages.mobile.scrollTop': {
        on: ['click'],
        gkeys: ['pages:mobile:scrollTop'],
        handler: () => {
          if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      },
      'pages.mobile.search': {
        on: ['click'],
        gkeys: ['pages:mobile:search'],
        handler: () => {
          if (typeof document === 'undefined') return;
          const field = document.querySelector('[data-search-field="query"]');
          if (!field) return;
          if (typeof field.focus === 'function') {
            try {
              field.focus({ preventScroll: false });
            } catch (_err) {
              field.focus();
            }
          }
          if (typeof field.scrollIntoView === 'function') {
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    };
  }

  const PagesShell = {
    render(db) {
      const registry = db.registry || (db.data && db.data.registry) || {};
      const slots = db.slots || (db.data && db.data.slots) || {};
      const pages = ensureArray((db.data && db.data.pages) || db.pages).sort((a, b) => {
        const aOrder = typeof a.order === 'number' ? a.order : 0;
        const bOrder = typeof b.order === 'number' ? b.order : 0;
        return aOrder - bOrder;
      });
      const activeKey = (db.data && db.data.active) || (pages[0] && pages[0].key) || null;

      const langInfo = getLangInfo(db);
      const themeConfig = getThemeLabConfig(db);
      ensureOverridesApplied(db);

      const headerNode = callComponent(registry, slots.header, db);
      const footerNode = callComponent(registry, slots.footer, db);

      const { mobileNav, mobileOverlay, mobileActions, sideNav } = renderNavigation(db, pages, activeKey);
      const pageNode = renderPage(db, registry, pages, activeKey);
      const themeLabButton = renderThemeLabButton(db, themeConfig, langInfo);
      const customThemeLab = callComponent(registry, slots.themeLab, db);
      const themeLabModal = customThemeLab != null
        ? customThemeLab
        : renderThemeLabModal(db, themeConfig, langInfo);
      const showThemeButton = shouldRenderThemeLabButton(db);

      return D.Containers.Div({
        attrs: {
          class: tw`min-h-screen bg-[color-mix(in_oklab,var(--background)96%,transparent)] text-[var(--foreground)]`
        }
      }, [
        mobileOverlay,
        headerNode ? D.Containers.Header({ attrs: { class: tw`shadow-sm` } }, [headerNode]) : null,
        mobileNav,
        D.Containers.Main({
          attrs: {
            class: tw`flex-1` + ' ' + tw`px-2 pb-24 sm:px-6 lg:px-8`
          }
        }, [
          D.Containers.Div({
            attrs: {
              class: tw`mx-auto flex w-full max-w-6xl flex-col gap-3 sm:gap-6 md:flex-row`
            }
          }, [
            sideNav,
            D.Containers.Section({
              attrs: {
                class: tw`flex-1`
              }
            }, [
              D.Containers.Div({
                attrs: {
                  class: tw`rounded-2xl border border-[color-mix(in_oklab,var(--border)50%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)90%,transparent)] p-3 sm:rounded-3xl sm:p-6 lg:p-8 shadow-sm space-y-4 sm:space-y-6`
                }
              }, [
                showThemeButton && themeLabButton ? D.Containers.Div({ attrs: { class: tw`flex justify-end` } }, [themeLabButton]) : null,
                pageNode
              ].filter(Boolean))
            ])
          ])
        ]),
        footerNode ? D.Containers.Footer({ attrs: { class: tw`mt-auto border-t border-[color-mix(in_oklab,var(--border)50%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)92%,transparent)]` } }, [footerNode]) : null,
        mobileActions,
        themeLabModal
      ].filter(Boolean));
    },

    createNavOrders(pages) {
      const list = ensureArray(pages);
      return list.reduce((acc, page) => {
        if (!page || !page.key) return acc;
        const key = page.key;
        acc[`pages.go.${key}`] = {
          on: ['click'],
          gkeys: [`pages:go:${key}`],
          handler: (_event, context) => {
            context.setState((prev) => {
              const prevUi = ensureDict(prev.ui);
              const prevShell = ensureDict(prevUi.pagesShell);
              const prevNav = ensureDict(prevShell.nav);
              const nextPreview = { activeKey: key, infoOpen: false, fullscreen: false };
              return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, { active: key }),
                ui: Object.assign({}, prevUi, {
                  pagesShell: Object.assign({}, prevShell, {
                    nav: Object.assign({}, prevNav, { mobileOpen: false }),
                    projectPreview: nextPreview
                  })
                })
              });
            });
          }
        };
        return acc;
      }, {});
    },

    createOrders(database) {
      const pages = ensureArray((database && database.data && database.data.pages) || database.pages);
      const navOrders = this.createNavOrders(pages);
      const themeOrders = createThemeLabOrders();
      const navUiOrders = createNavUiOrders();
      return Object.assign({}, navOrders, themeOrders, navUiOrders);
    }
  };

  PagesShell.applyThemeOverrides = applyThemeOverrides;
  PagesShell.sanitizeThemeOverrides = sanitizeOverrides;

  Templates.PagesShell = PagesShell;
})(typeof window !== 'undefined' ? window : this);

