(function (window) {
  'use strict';

  const M = window.Mishkah = window.Mishkah || {};
  const Templates = M.templates = M.templates || {};
  const D = M.DSL;
  const UI = M.UI || {};
  const U = M.utils = M.utils || {};
  const twApi = U.twcss || {};
  const tw = typeof twApi.tw === 'function' ? twApi.tw : (value) => value;
  const cx = typeof twApi.cx === 'function' ? twApi.cx : (...args) => args.filter(Boolean).join(' ');

  const ensureDict = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  const ensureArray = (value) => (Array.isArray(value) ? value : []);

  function ensureMediaList(list) {
    const seen = new Set();
    const out = [];
    ensureArray(list).forEach((value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push(trimmed);
    });
    return out;
  }

  function getPrimaryImage(entry) {
    if (!entry) return null;
    const main = typeof entry.mainImage === 'string' ? entry.mainImage.trim() : '';
    if (main) return main;
    const gallery = ensureMediaList(entry.images);
    return gallery.length ? gallery[0] : null;
  }

  const DEFAULT_LANG_OPTIONS = [
    { code: 'ar', label: { ar: 'العربية', en: 'Arabic' } },
    { code: 'en', label: { ar: 'الإنجليزية', en: 'English' } }
  ];

  const LANGUAGE_DECOR = {
    ar: { emoji: '🕌', short: 'AR' },
    en: { emoji: '🌍', short: 'EN' }
  };

  const THEME_DECOR = {
    'modern-dark': { emoji: '🌌' },
    'modern-light': { emoji: '🌅' },
    'amber-dusk': { emoji: '🌇' },
    'aurora-night': { emoji: '🧭' },
    'sahara-sunrise': { emoji: '🏜️' },
    'emerald-oasis': { emoji: '🌿' },
    'rose-mist': { emoji: '🌸' }
  };

  const MENU_TEXT = {
    langLabel: { ar: 'اللغة', en: 'Language' },
    themeLabel: { ar: 'الثيم الجاهز', en: 'Theme preset' },
    templatesLabel: { ar: 'قوالب العرض', en: 'Display templates' },
    close: { ar: 'إغلاق القائمة', en: 'Close menu' }
  };

  function localizeEntry(entry, lang, fallback) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    const dict = ensureDict(entry);
    return dict[lang] || dict[fallback] || dict.en || dict.ar || Object.values(dict)[0] || '';
  }

  function listTemplateDefs(db) {
    const available = ensureArray(db?.ui?.templates?.available);
    const fallback = typeof M.Pages?.listTemplates === 'function' ? M.Pages.listTemplates() : [];
    return (available.length ? available : fallback)
      .map((entry) => (typeof entry === 'string' ? { id: entry } : entry))
      .filter((entry) => entry && (entry.id || entry.name));
  }

  function renderGlobalSwitchers(db, options) {
    const opts = ensureDict(options);
    const align = opts.align || 'end';
    const direction = opts.direction || 'row';

    const lang = db?.env?.lang || db?.i18n?.lang || 'ar';
    const fallbackLang = lang === 'ar' ? 'en' : 'ar';

    const setTheme = typeof twApi.setTheme === 'function' ? twApi.setTheme : null;
    if (setTheme) {
      const nextThemeMode = db?.env?.theme === 'dark' ? 'dark' : 'light';
      setTheme(nextThemeMode);
    }

    const shell = Templates && Templates.PagesShell;
    if (shell && typeof shell.applyThemeOverrides === 'function') {
      const overrides = ensureDict(db?.data?.themeOverrides);
      shell.applyThemeOverrides(overrides);
    }

    const templateDefs = listTemplateDefs(db);
    const templateOptions = templateDefs.map((tpl, idx) => {
      const id = tpl.id || tpl.name || `tpl-${idx}`;
      const label = localizeEntry(tpl.label, lang, fallbackLang) || tpl.title || id;
      return { value: id, label, emoji: tpl.icon || '🧩' };
    }).filter(Boolean);
    const currentTemplate = db?.env?.template || (templateOptions[0]?.value || 'PagesShell');
    const activeTemplate = templateOptions.find((option) => option.value === currentTemplate) || templateOptions[0] || null;

    const languageSource = ensureArray(db?.data?.languages);
    const languages = (languageSource.length ? languageSource : DEFAULT_LANG_OPTIONS).map((entry, idx) => {
      if (typeof entry === 'string') {
        return { value: entry, label: localizeEntry({ ar: entry, en: entry }, lang, fallbackLang), emoji: '🌐', short: entry.toUpperCase() };
      }
      const base = ensureDict(entry);
      const code = typeof base.code === 'string'
        ? base.code
        : (typeof base.value === 'string' ? base.value : `lang-${idx}`);
      if (!code) return null;
      const label = localizeEntry(base.label, lang, fallbackLang) || code;
      const decor = LANGUAGE_DECOR[code] || {};
      const emoji = decor.emoji || '🌐';
      const short = decor.short || code.toUpperCase();
      return { value: code, label, emoji, short };
    }).filter(Boolean);
    const activeLang = languages.find((entry) => entry.value === lang) || languages[0] || null;

    const themePresets = ensureArray(db?.data?.themePresets);
    let themeOptions = themePresets.map((preset, idx) => {
      const key = typeof preset.key === 'string' ? preset.key : `theme-${idx}`;
      if (!key) return null;
      const label = localizeEntry(preset.label, lang, fallbackLang) || key;
      const mode = preset.mode === 'dark' ? 'dark' : 'light';
      const badge = mode === 'dark' ? (lang === 'ar' ? 'ليل' : 'Dark') : (lang === 'ar' ? 'نهار' : 'Light');
      const decor = THEME_DECOR[key] || {};
      const emoji = decor.emoji || (mode === 'dark' ? '🌙' : '🌞');
      return { value: key, label, emoji, badge, mode };
    }).filter(Boolean);
    if (!themeOptions.length) {
      themeOptions = [
        { value: 'light', label: localizeEntry({ ar: 'ثيم فاتح', en: 'Light theme' }, lang, fallbackLang), emoji: '🌞', badge: lang === 'ar' ? 'نهار' : 'Light', mode: 'light' },
        { value: 'dark', label: localizeEntry({ ar: 'ثيم داكن', en: 'Dark theme' }, lang, fallbackLang), emoji: '🌙', badge: lang === 'ar' ? 'ليل' : 'Dark', mode: 'dark' }
      ];
    }
    const activeThemeKey = db?.data?.activeThemePreset || themeOptions[0]?.value || '';
    const activeTheme = themeOptions.find((option) => option.value === activeThemeKey) || themeOptions[0] || null;

    const uiState = ensureDict(db?.ui);
    const shellUi = ensureDict(uiState.pagesShell);
    const menuState = ensureDict(shellUi.headerMenus);
    const langOpen = !!menuState.langOpen;
    const themeOpen = !!menuState.themeOpen;
    const templateOpen = !!menuState.templateOpen;

    const triggerBaseClass = tw`flex h-9 items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)88%,transparent)] px-3 text-[0.8rem] font-semibold text-[color-mix(in_oklab,var(--foreground)92%,transparent)] shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-26px_rgba(79,70,229,0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_oklab,var(--accent)65%,transparent)] sm:h-11 sm:px-4 sm:text-sm`;
    const triggerActiveClass = tw`border-[color-mix(in_oklab,var(--accent)55%,transparent)] shadow-[0_20px_44px_-26px_rgba(79,70,229,0.55)]`;
    const triggerIconClass = tw`text-lg leading-none sm:text-xl`;
    const triggerLabelClass = tw`text-[0.7rem] font-semibold leading-tight text-[color-mix(in_oklab,var(--foreground)82%,transparent)] sm:text-xs`;
    const triggerMetaClass = tw`text-[0.6rem] uppercase tracking-[0.32em] text-[color-mix(in_oklab,var(--muted-foreground)80%,transparent)] sm:text-[0.65rem]`;
    const panelBaseClass = tw`absolute end-0 z-50 mt-3 w-64 origin-top-right rounded-3xl border border-[color-mix(in_oklab,var(--border)60%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)92%,transparent)] p-3 shadow-[0_28px_64px_-30px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-all duration-200 transform`;
    const panelOpenClass = tw`pointer-events-auto scale-100 opacity-100 translate-y-0`;
    const panelClosedClass = tw`pointer-events-none scale-95 opacity-0 translate-y-1.5`;
    const closeButtonClass = tw`inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--border)60%,transparent)] text-sm font-semibold text-[color-mix(in_oklab,var(--muted-foreground)80%,transparent)] transition hover:bg-[color-mix(in_oklab,var(--surface-2)85%,transparent)] hover:text-[color-mix(in_oklab,var(--foreground)90%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_oklab,var(--accent)60%,transparent)]`;
    const optionBaseClass = tw`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`;
    const optionActiveClass = tw`bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_18px_38px_-22px_rgba(79,70,229,0.55)]`;
    const optionInactiveClass = tw`text-[color-mix(in_oklab,var(--foreground)78%,transparent)] hover:bg-[color-mix(in_oklab,var(--surface-2)85%,transparent)]`;

    const langLabel = localizeEntry(MENU_TEXT.langLabel, lang, fallbackLang) || '';
    const themeLabel = localizeEntry(MENU_TEXT.themeLabel, lang, fallbackLang) || '';
    const templatesLabel = localizeEntry(MENU_TEXT.templatesLabel, lang, fallbackLang) || '';
    const closeLabel = localizeEntry(MENU_TEXT.close, lang, fallbackLang) || '';

    const langMenu = languages.length
      ? D.Containers.Div({
          attrs: {
            class: tw`inline-flex relative lg:static`,
            'data-menu-container': 'lang'
          }
        }, [
          D.Forms.Button({
            attrs: {
              type: 'button',
              class: cx(triggerBaseClass, langOpen ? triggerActiveClass : ''),
              title: langLabel,
              'aria-haspopup': 'listbox',
              'aria-expanded': langOpen ? 'true' : 'false',
              'data-menu-toggle': 'lang',
              gkey: 'ui:header:menuToggle'
            }
          }, [
            D.Text.Span({ attrs: { class: triggerIconClass } }, [activeLang ? activeLang.emoji : '🌐']),
            D.Containers.Div({ attrs: { class: tw`flex flex-col text-start` } }, [
              D.Text.Span({ attrs: { class: triggerLabelClass } }, [activeLang ? activeLang.label : langLabel]),
              D.Text.Span({ attrs: { class: triggerMetaClass } }, [activeLang ? activeLang.short : lang.toUpperCase()])
            ])
          ]),
          D.Containers.Div({
            attrs: {
              class: cx(panelBaseClass, langOpen ? panelOpenClass : panelClosedClass),
              'data-menu-panel': 'lang'
            }
          }, [
            D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2 px-2` } }, [
              D.Text.Span({ attrs: { class: tw`text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[var(--muted-foreground)]` } }, [langLabel]),
              D.Forms.Button({
                attrs: {
                  type: 'button',
                  class: closeButtonClass,
                  gkey: 'ui:header:menuClose',
                  'data-menu-close': 'lang',
                  'aria-label': closeLabel
                }
              }, ['✕'])
            ]),
            D.Containers.Div({ attrs: { class: tw`mt-3 grid gap-1.5` } }, languages.map((option) => D.Forms.Button({
              attrs: {
                type: 'button',
                gkey: 'ui:lang:select',
                'data-lang-select': 'true',
                'data-lang-value': option.value,
                value: option.value,
                class: cx(optionBaseClass, option.value === lang ? optionActiveClass : optionInactiveClass)
              }
            }, [
              D.Text.Span({ attrs: { class: tw`text-lg leading-none` } }, [option.emoji]),
              D.Containers.Div({ attrs: { class: tw`flex flex-col text-start` } }, [
                D.Text.Span({ attrs: { class: tw`font-semibold` } }, [option.label]),
                D.Text.Span({ attrs: { class: triggerMetaClass } }, [option.short])
              ])
            ])))
          ])
        ])
      : null;

    const themeMenu = themeOptions.length
      ? D.Containers.Div({
          attrs: {
            class: tw`inline-flex relative lg:static`,
            'data-menu-container': 'theme'
          }
        }, [
          D.Forms.Button({
            attrs: {
              type: 'button',
              class: cx(triggerBaseClass, themeOpen ? triggerActiveClass : ''),
              title: themeLabel,
              'aria-haspopup': 'listbox',
              'aria-expanded': themeOpen ? 'true' : 'false',
              'data-menu-toggle': 'theme',
              gkey: 'ui:header:menuToggle'
            }
          }, [
            D.Text.Span({ attrs: { class: triggerIconClass } }, [activeTheme ? activeTheme.emoji : '🎨']),
            D.Containers.Div({ attrs: { class: tw`flex flex-col text-start` } }, [
              D.Text.Span({ attrs: { class: triggerLabelClass } }, [activeTheme ? activeTheme.label : themeLabel]),
              activeTheme ? D.Text.Span({ attrs: { class: triggerMetaClass } }, [activeTheme.badge]) : null
            ].filter(Boolean))
          ]),
          D.Containers.Div({
            attrs: {
              class: cx(panelBaseClass, themeOpen ? panelOpenClass : panelClosedClass),
              'data-menu-panel': 'theme'
            }
          }, [
            D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2 px-2` } }, [
              D.Text.Span({ attrs: { class: tw`text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[var(--muted-foreground)]` } }, [themeLabel]),
              D.Forms.Button({
                attrs: {
                  type: 'button',
                  class: closeButtonClass,
                  gkey: 'ui:header:menuClose',
                  'data-menu-close': 'theme',
                  'aria-label': closeLabel
                }
              }, ['✕'])
            ]),
            D.Containers.Div({ attrs: { class: tw`mt-3 grid gap-1.5` } }, themeOptions.map((option) => D.Forms.Button({
              attrs: {
                type: 'button',
                gkey: 'ui:theme:select',
                'data-theme-select': 'true',
                'data-theme-value': option.value,
                value: option.value,
                class: cx(optionBaseClass, option.value === activeThemeKey ? optionActiveClass : optionInactiveClass)
              }
            }, [
              D.Text.Span({ attrs: { class: tw`text-lg leading-none` } }, [option.emoji]),
              D.Containers.Div({ attrs: { class: tw`flex flex-col text-start` } }, [
                D.Text.Span({ attrs: { class: tw`font-semibold` } }, [option.label]),
                D.Text.Span({ attrs: { class: triggerMetaClass } }, [option.badge])
              ])
            ])))
          ])
        ])
      : null;

    const templateMenu = templateOptions.length > 1
      ? D.Containers.Div({
          attrs: {
            class: tw`inline-flex relative lg:static`,
            'data-menu-container': 'template'
          }
        }, [
          D.Forms.Button({
            attrs: {
              type: 'button',
              class: cx(triggerBaseClass, templateOpen ? triggerActiveClass : ''),
              title: templatesLabel,
              'aria-haspopup': 'listbox',
              'aria-expanded': templateOpen ? 'true' : 'false',
              'data-menu-toggle': 'template',
              gkey: 'ui:header:menuToggle'
            }
          }, [
            D.Text.Span({ attrs: { class: triggerIconClass } }, [activeTemplate ? activeTemplate.emoji : '🧩']),
            D.Containers.Div({ attrs: { class: tw`flex flex-col text-start` } }, [
              D.Text.Span({ attrs: { class: triggerLabelClass } }, [activeTemplate ? activeTemplate.label : templatesLabel]),
              D.Text.Span({ attrs: { class: triggerMetaClass } }, [templatesLabel])
            ])
          ]),
          D.Containers.Div({
            attrs: {
              class: cx(panelBaseClass, templateOpen ? panelOpenClass : panelClosedClass),
              'data-menu-panel': 'template'
            }
          }, [
            D.Containers.Div({ attrs: { class: tw`flex items-center justify-between gap-2 px-2` } }, [
              D.Text.Span({ attrs: { class: tw`text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-[var(--muted-foreground)]` } }, [templatesLabel]),
              D.Forms.Button({
                attrs: {
                  type: 'button',
                  class: closeButtonClass,
                  gkey: 'ui:header:menuClose',
                  'data-menu-close': 'template',
                  'aria-label': closeLabel
                }
              }, ['✕'])
            ]),
            D.Containers.Div({ attrs: { class: tw`mt-3 grid gap-1.5` } }, templateOptions.map((option) => D.Forms.Button({
              attrs: {
                type: 'button',
                gkey: 'ui:template:set',
                'data-template': option.value,
                value: option.value,
                class: cx(optionBaseClass, option.value === currentTemplate ? optionActiveClass : optionInactiveClass)
              }
            }, [
              D.Text.Span({ attrs: { class: tw`text-lg leading-none` } }, [option.emoji]),
              D.Containers.Div({ attrs: { class: tw`flex flex-col text-start` } }, [
                D.Text.Span({ attrs: { class: tw`font-semibold` } }, [option.label])
              ])
            ])))
          ])
        ])
      : null;

    const controls = [templateMenu, themeMenu, langMenu].filter(Boolean);
    if (!controls.length) return null;

    const justifyClass = align === 'start'
      ? tw`justify-start`
      : align === 'center'
        ? tw`justify-center`
        : tw`justify-end`;

    const directionClass = direction === 'column' ? tw`flex-col` : tw`flex-row flex-nowrap sm:flex-wrap`;

    return D.Containers.Div({
      attrs: {
        class: cx(tw`flex items-center gap-1.5 overflow-x-auto whitespace-nowrap sm:gap-2`, directionClass, justifyClass)
      }
    }, controls);
  }

  function getPages(db) {
    return ensureArray(db?.data?.pages || db?.pages || []).slice().sort((a, b) => {
      const orderA = Number.isFinite(a?.order) ? a.order : 0;
      const orderB = Number.isFinite(b?.order) ? b.order : 0;
      return orderA - orderB;
    });
  }

  function getClasses(db) {
    return ensureArray(db?.data?.pageClasses || []).slice().sort((a, b) => {
      const orderA = Number.isFinite(a?.sort) ? a.sort : 0;
      const orderB = Number.isFinite(b?.sort) ? b.sort : 0;
      return orderA - orderB;
    });
  }

  function buildClassTree(classList) {
    const map = {};
    const roots = [];
    ensureArray(classList).forEach((entry) => {
      if (!entry || !entry.key) return;
      const node = Object.assign({}, entry, { children: [], pages: [] });
      map[entry.key] = node;
    });
    Object.keys(map).forEach((key) => {
      const node = map[key];
      const parentKey = node.parent || node.parentKey || node.parent_id || null;
      if (parentKey && map[parentKey]) {
        node.parentKey = parentKey;
        map[parentKey].children.push(node);
      } else {
        node.parentKey = null;
        roots.push(node);
      }
    });
    return { roots, map };
  }

  function attachPagesToTree(tree, pages) {
    const list = ensureArray(pages);
    list.forEach((page) => {
      if (!page || !page.key || !page.classKey) return;
      const node = tree.map[page.classKey];
      if (node) {
        node.pages = node.pages || [];
        node.pages.push(page);
      }
    });
  }

  function collectPages(node, includeChildren) {
    if (!node) return [];
    const items = [];
    if (Array.isArray(node.pages)) {
      items.push(...node.pages);
    }
    if (includeChildren && Array.isArray(node.children)) {
      node.children.forEach((child) => {
        items.push(...collectPages(child, true));
      });
    }
    return items;
  }

  function getActivePage(pages, activeKey) {
    if (!Array.isArray(pages) || !pages.length) return null;
    return pages.find((page) => page && page.key === activeKey) || pages[0];
  }

  function callPageComponent(registry, page, db) {
    if (!page) return null;
    if (typeof page.dsl === 'function') {
      return page.dsl(db);
    }
    const compName = page.comp || page.component;
    if (!compName) return null;
    const comp = registry && registry[compName];
    if (typeof comp === 'function') {
      return comp(db, { tw, cx }) || null;
    }
    return null;
  }

  Templates.__pagesHelpers = {
    ensureArray,
    ensureDict,
    ensureMediaList,
    getPrimaryImage,
    getPages,
    getClasses,
    buildClassTree,
    attachPagesToTree,
    collectPages,
    getActivePage,
    callPageComponent,
    tw,
    cx,
    localizeEntry,
    renderGlobalSwitchers
  };
}(typeof window !== 'undefined' ? window : this));
