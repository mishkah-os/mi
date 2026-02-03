(function (window) {
  'use strict';

  const M = window.Mishkah = window.Mishkah || {};
  const Templates = M.templates = M.templates || {};
  const D = M.DSL;
  const UI = M.UI || {};
  const helpers = Templates.__pagesHelpers || {};

  const ensureArray = helpers.ensureArray || ((value) => (Array.isArray(value) ? value : []));
  const ensureDict = helpers.ensureDict || ((value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}));
  const getPages = helpers.getPages || ((db) => ensureArray(db?.data?.pages || db?.pages || []));
  const getClasses = helpers.getClasses || ((db) => ensureArray(db?.data?.pageClasses || []));
  const buildClassTree = helpers.buildClassTree || ((list) => ({ roots: ensureArray(list), map: {} }));
  const attachPagesToTree = helpers.attachPagesToTree || (() => {});
  const collectPages = helpers.collectPages || ((node) => ensureArray(node?.pages));
  const getActivePage = helpers.getActivePage || ((pages, key) => (ensureArray(pages).find((page) => page && page.key === key) || ensureArray(pages)[0] || null));
  const callPageComponent = helpers.callPageComponent || (() => null);
  const tw = helpers.tw || ((value) => value);
  const renderGlobalSwitchers = helpers.renderGlobalSwitchers || (() => null);

  function localizeText(entry, lang, fallback) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    const dict = ensureDict(entry);
    return dict[lang] || dict[fallback] || dict.en || dict.ar || Object.values(dict)[0] || '';
  }

  function PagesTopNavRender(db) {
    const lang = db?.env?.lang || db?.i18n?.lang || 'ar';
    const fallback = lang === 'ar' ? 'en' : 'ar';
    const registry = ensureDict(db?.registry);

    const pages = getPages(db);
    const classes = getClasses(db);
    const classTree = buildClassTree(classes);
    attachPagesToTree(classTree, pages);

    const activeKey = db?.data?.active || (pages[0] && pages[0].key) || null;
    const activePage = getActivePage(pages, activeKey);
    const classSections = [];
    ensureArray(classTree.roots).forEach((node) => {
      const nodePages = collectPages(node, true);
      if (!nodePages.length) return;
      const label = `${node.icon ? `${node.icon} ` : ''}${localizeText(node.label, lang, fallback)}`;
      const desc = localizeText(node.desc, lang, fallback);
      const buttons = nodePages.map((page) => {
        if (!page || !page.key) return null;
        const isActive = page.key === activeKey;
        const text = `${page.icon ? `${page.icon} ` : ''}${localizeText(page.label, lang, fallback)}`;
        return UI.Button({
          attrs: {
            gkey: `pages:go:${page.key}`,
            'data-pagekey': page.key,
            class: tw`w-full justify-start`
          },
          variant: isActive ? 'solid' : 'ghost',
          size: 'sm'
        }, [text]);
      }).filter(Boolean);
      if (!buttons.length) return;
      classSections.push(D.Containers.Section({
        attrs: {
          key: `class-${node.key}`,
          class: tw`space-y-3 rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)95%,transparent)] p-4 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.42)]`
        }
      }, [
        D.Text.H3({ attrs: { class: tw`text-sm font-semibold uppercase tracking-[0.3em] text-[var(--muted-foreground)]` } }, [label]),
        desc ? D.Text.P({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [desc]) : null,
        D.Containers.Div({ attrs: { class: tw`grid gap-2` } }, buttons)
      ].filter(Boolean)));
    });

    const ungrouped = ensureArray(pages).filter((page) => !page?.classKey || !classTree.map?.[page.classKey]);
    if (ungrouped.length) {
      const buttons = ungrouped.map((page) => {
        if (!page || !page.key) return null;
        const isActive = page.key === activeKey;
        const text = `${page.icon ? `${page.icon} ` : ''}${localizeText(page.label, lang, fallback)}`;
        return UI.Button({
          attrs: {
            gkey: `pages:go:${page.key}`,
            'data-pagekey': page.key,
            class: tw`w-full justify-start`
          },
          variant: isActive ? 'solid' : 'ghost',
          size: 'sm'
        }, [text]);
      }).filter(Boolean);
      if (buttons.length) {
        const title = lang === 'ar' ? 'صفحات عامة' : 'General pages';
        classSections.push(D.Containers.Section({
          attrs: {
            key: 'class-ungrouped',
            class: tw`space-y-3 rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)95%,transparent)] p-4 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.42)]`
          }
        }, [
          D.Text.H3({ attrs: { class: tw`text-sm font-semibold uppercase tracking-[0.3em] text-[var(--muted-foreground)]` } }, [title]),
          D.Containers.Div({ attrs: { class: tw`grid gap-2` } }, buttons)
        ]));
      }
    }

    const activeTitle = localizeText(activePage?.label, lang, fallback) || (activePage?.key || '');
    const activeDesc = localizeText(activePage?.desc, lang, fallback);
    const contentBody = callPageComponent(registry, activePage, db) || UI.EmptyState?.({ icon: '📄', title: activeTitle }) || null;

    const navSection = classSections.length
      ? D.Containers.Aside({ attrs: { class: tw`space-y-4` } }, classSections)
      : null;

    const contentSection = D.Containers.Section({
      attrs: {
        class: tw`w-full rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)95%,transparent)] p-6 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.4)]`
      }
    }, [
      D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        D.Text.H2({ attrs: { class: tw`text-2xl font-semibold` } }, [activeTitle]),
        activeDesc ? D.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, [activeDesc]) : null
      ].filter(Boolean)),
      D.Containers.Div({ attrs: { class: tw`mt-4` } }, [contentBody])
    ]);

    const globalControls = renderGlobalSwitchers(db, { align: 'end' });

    const layout = D.Containers.Div({
      attrs: { class: tw`w-full space-y-6` }
    }, [
      globalControls ? D.Containers.Div({ attrs: { class: tw`flex justify-end` } }, [globalControls]) : null,
      D.Containers.Div({
        attrs: { class: tw`grid w-full gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]` }
      }, [
        navSection,
        contentSection
      ].filter(Boolean))
    ].filter(Boolean));

    return D.Containers.Main({
      attrs: { class: tw`w-full px-4 py-6` }
    }, [layout]);
  }

  const BaseShell = Templates.PagesShell;

  const PagesTopNav = {
    meta: {
      icon: '🧭',
      label: { ar: 'قائمة علوية', en: 'Top navigation' },
      title: 'Top navigation shell'
    },
    render: PagesTopNavRender,
    createOrders(database) {
      if (BaseShell && typeof BaseShell.createOrders === 'function') {
        return BaseShell.createOrders(database);
      }
      return {};
    }
  };

  Templates.PagesTopNav = PagesTopNav;
}(typeof window !== 'undefined' ? window : this));
