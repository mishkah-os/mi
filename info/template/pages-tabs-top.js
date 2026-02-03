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
  const getActivePage = helpers.getActivePage || ((pages, key) => (ensureArray(pages).find((page) => page && page.key === key) || ensureArray(pages)[0] || null));
  const collectPages = helpers.collectPages || ((node) => ensureArray(node?.pages));
  const callPageComponent = helpers.callPageComponent || (() => null);
  const tw = helpers.tw || ((value) => value);
  const renderGlobalSwitchers = helpers.renderGlobalSwitchers || (() => null);

  function localizeText(entry, lang, fallback) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    const dict = ensureDict(entry);
    return dict[lang] || dict[fallback] || dict.en || dict.ar || Object.values(dict)[0] || '';
  }

  function buildTabItems(pages, lang, fallback, activeKey) {
    return ensureArray(pages).map((page) => {
      const label = `${page.icon ? `${page.icon} ` : ''}${localizeText(page.label, lang, fallback)}`;
      return {
        id: page.key,
        label,
        active: page.key === activeKey
      };
    });
  }

  function dedupePages(list, fallbackList) {
    const seen = new Set();
    const deduped = [];
    ensureArray(list).forEach((page) => {
      if (!page) return;
      const key = page.key;
      if (key && seen.has(key)) return;
      if (key) {
        seen.add(key);
      }
      deduped.push(page);
    });
    if (deduped.length) {
      return deduped;
    }
    return ensureArray(fallbackList);
  }

  function shouldScopeTabsToClass(db, variantKey) {
    const scopeConfig = db?.data?.tabsScope;
    const normalize = (value) => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value !== 'string') {
        return false;
      }
      const lowered = value.trim().toLowerCase();
      return lowered === 'class' || lowered === 'section';
    };

    if (scopeConfig == null) {
      return false;
    }

    if (typeof scopeConfig === 'boolean' || typeof scopeConfig === 'string') {
      return normalize(scopeConfig);
    }

    const scopeDict = ensureDict(scopeConfig);
    const specific = scopeDict[variantKey];
    if (specific != null) {
      return normalize(specific);
    }
    if (scopeDict.all != null) {
      return normalize(scopeDict.all);
    }
    if (scopeDict.default != null) {
      return normalize(scopeDict.default);
    }
    return false;
  }

  function PagesTabsTopRender(db) {
    const lang = db?.env?.lang || db?.i18n?.lang || 'ar';
    const fallback = lang === 'ar' ? 'en' : 'ar';
    const registry = ensureDict(db?.registry);

    const pages = getPages(db);
    const classes = getClasses(db);
    const classTree = buildClassTree(classes);
    attachPagesToTree(classTree, pages);

    const activeKey = db?.data?.active || (pages[0] && pages[0].key) || null;
    const activePage = getActivePage(pages, activeKey);
    const activeTitle = localizeText(activePage?.label, lang, fallback) || (activePage?.key || '');
    const activeDesc = localizeText(activePage?.desc, lang, fallback);

    const classNode = activePage?.classKey ? classTree.map?.[activePage.classKey] : null;
    const useClassScope = shouldScopeTabsToClass(db, 'top');
    const classPages = useClassScope && classNode ? collectPages(classNode, true) : [];
    const tabSource = dedupePages(useClassScope ? classPages : pages, pages);
    const tabItems = buildTabItems(tabSource, lang, fallback, activeKey);

    const navButtons = tabItems.map((item) => UI.Button({
      attrs: {
        gkey: `pages:go:${item.id}`,
        'data-pagekey': item.id,
        class: tw`rounded-full`
      },
      variant: item.active ? 'solid' : 'ghost',
      size: 'sm'
    }, [item.label]));

    const activeBody = callPageComponent(registry, activePage, db) || UI.EmptyState?.({ icon: '📄', title: activeTitle }) || null;

    const tabsStripe = D.Containers.Div({
      attrs: { class: tw`flex w-full flex-wrap items-center justify-center gap-2 rounded-3xl border border-[color-mix(in_oklab,var(--border)50%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)95%,transparent)] p-3 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.4)]` }
    }, navButtons);

    const contentCard = D.Containers.Section({
      attrs: { class: tw`w-full space-y-4 rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)96%,transparent)] p-6 shadow-[0_26px_56px_-30px_rgba(15,23,42,0.48)]` }
    }, [
      D.Containers.Div({ attrs: { class: tw`space-y-2 text-center` } }, [
        D.Text.H1({ attrs: { class: tw`text-3xl font-semibold` } }, [activeTitle]),
        activeDesc ? D.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, [activeDesc]) : null
      ].filter(Boolean)),
      D.Containers.Div({ attrs: { class: tw`mt-4` } }, [activeBody])
    ]);

    const globalControls = renderGlobalSwitchers(db, { align: 'end' });

    const layout = D.Containers.Div({
      attrs: { class: tw`w-full space-y-5` }
    }, [
      globalControls ? D.Containers.Div({ attrs: { class: tw`flex justify-end` } }, [globalControls]) : null,
      tabsStripe,
      contentCard
    ].filter(Boolean));

    return D.Containers.Main({
      attrs: { class: tw`w-full px-4 py-6` }
    }, [layout]);
  }

  const BaseShell = Templates.PagesShell;

  const PagesTabsTop = {
    meta: {
      icon: '🗂️',
      label: { ar: 'تبويبات علوية', en: 'Top tabs' },
      title: 'Top tabs shell'
    },
    render: PagesTabsTopRender,
    createOrders(database) {
      if (BaseShell && typeof BaseShell.createOrders === 'function') {
        return BaseShell.createOrders(database);
      }
      return {};
    }
  };

  Templates.PagesTabsTop = PagesTabsTop;
}(typeof window !== 'undefined' ? window : this));
