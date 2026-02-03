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
  const ensureMediaList = helpers.ensureMediaList || ((list) => {
    const seen = new Set();
    const src = Array.isArray(list) ? list : (typeof list === 'string' ? [list] : []);
    const out = [];
    src.forEach((value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push(trimmed);
    });
    return out;
  });
  const toMediaValue = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  };

  function localizeText(entry, lang, fallback) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    const dict = ensureDict(entry);
    return dict[lang] || dict[fallback] || dict.en || dict.ar || Object.values(dict)[0] || '';
  }

  function renderMediaGallery(entry, altText, variant) {
    if (!entry) return null;
    const mainImage = typeof entry.mainImage === 'string' ? entry.mainImage.trim() : '';
    const mainVideo = typeof entry.mainVideo === 'string' ? entry.mainVideo.trim() : '';
    const gallery = ensureMediaList(entry.images).filter((url) => url !== mainImage);
    if (!mainImage && !mainVideo && !gallery.length) return null;

    const mode = variant === 'compact' ? 'compact' : 'default';
    const wrapperClass = mode === 'compact'
      ? tw`mt-3 space-y-3`
      : tw`mt-6 space-y-4`;
    const heroClass = mode === 'compact'
      ? tw`h-40 w-full overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] object-cover shadow-[0_16px_36px_-24px_rgba(15,23,42,0.4)]`
      : tw`h-64 w-full overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] object-cover shadow-[0_24px_52px_-30px_rgba(15,23,42,0.5)]`;
    const videoClass = mode === 'compact'
      ? tw`h-40 w-full overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-black object-cover shadow-[0_16px_36px_-24px_rgba(15,23,42,0.4)]`
      : tw`h-64 w-full overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-black object-cover shadow-[0_24px_52px_-30px_rgba(15,23,42,0.5)]`;
    const gridClass = mode === 'compact'
      ? tw`grid gap-2 sm:grid-cols-2`
      : tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`;
    const imageClass = mode === 'compact'
      ? tw`h-28 w-full overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] object-cover`
      : tw`h-36 w-full overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] object-cover`;

    const blocks = [];
    if (mainImage) {
      blocks.push(D.Media.Img({
        attrs: {
          src: mainImage,
          alt: altText || '',
          class: heroClass
        }
      }));
    }
    if (mainVideo) {
      blocks.push(D.Media.Video({
        attrs: {
          src: mainVideo,
          controls: true,
          playsinline: true,
          class: videoClass
        }
      }));
    }
    if (gallery.length) {
      blocks.push(D.Containers.Div({ attrs: { class: gridClass } }, gallery.map((url, idx) => D.Media.Img({
        attrs: {
          src: url,
          alt: altText ? `${altText} ${idx + 1}` : `Gallery item ${idx + 1}`,
          class: imageClass
        }
      }))));
    }

    return blocks.length ? D.Containers.Div({ attrs: { class: wrapperClass } }, blocks) : null;
  }

  function buildCategoryList(tree, lang, fallback, activeKey) {
    const sections = [];
    ensureArray(tree.roots).forEach((root) => {
      const pages = collectPages(root, true);
      if (!pages.length) return;
      const items = pages.map((page) => ({
        key: page.key,
        label: `${page.icon ? `${page.icon} ` : ''}${localizeText(page.label, lang, fallback)}`,
        active: page.key === activeKey
      }));
      sections.push({
        key: root.key,
        label: `${root.icon ? `${root.icon} ` : ''}${localizeText(root.label, lang, fallback)}`,
        desc: localizeText(root.desc, lang, fallback),
        pages: items,
        mainImage: toMediaValue(root.mainImage),
        images: ensureMediaList(root.images),
        mainVideo: toMediaValue(root.mainVideo)
      });
      ensureArray(root.children).forEach((child) => {
        const childPages = collectPages(child, true);
        if (!childPages.length) return;
        sections.push({
          key: child.key,
          label: `${child.icon ? `${child.icon} ` : ''}${localizeText(child.label, lang, fallback)}`,
          desc: localizeText(child.desc, lang, fallback),
          pages: childPages.map((page) => ({
            key: page.key,
            label: `${page.icon ? `${page.icon} ` : ''}${localizeText(page.label, lang, fallback)}`,
            active: page.key === activeKey
          })),
          mainImage: toMediaValue(child.mainImage),
          images: ensureMediaList(child.images),
          mainVideo: toMediaValue(child.mainVideo)
        });
      });
    });
    return sections;
  }

  function PagesBlogRender(db) {
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
    const contentBody = callPageComponent(registry, activePage, db) || UI.EmptyState?.({ icon: '📄', title: activeTitle }) || null;

    const categories = buildCategoryList(classTree, lang, fallback, activeKey);

    const categoryCards = categories.map((section) => {
      const mediaPreview = renderMediaGallery(section, section.label, 'compact');
      return D.Containers.Section({
        attrs: {
          key: `cat-${section.key}`,
          class: tw`rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)95%,transparent)] p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.4)]`
        }
      }, [
        D.Text.H3({ attrs: { class: tw`text-lg font-semibold` } }, [section.label]),
        section.desc ? D.Text.P({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [section.desc]) : null,
        mediaPreview,
        D.Containers.Div({ attrs: { class: tw`mt-3 space-y-2` } }, section.pages.map((page) => UI.Button({
          attrs: {
            gkey: `pages:go:${page.key}`,
            'data-pagekey': page.key,
            class: tw`w-full justify-start`
          },
          variant: page.active ? 'soft' : 'ghost',
          size: 'sm'
        }, [page.label])))
      ].filter(Boolean));
    });

    const mediaContent = renderMediaGallery(activePage, activeTitle);

    const contentCard = D.Containers.Section({
      attrs: {
        class: tw`w-full rounded-3xl border border-[color-mix(in_oklab,var(--border)55%,transparent)] bg-[color-mix(in_oklab,var(--surface-1)96%,transparent)] p-6 shadow-[0_22px_48px_-28px_rgba(15,23,42,0.45)]`
      }
    }, [
      D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
        D.Text.H1({ attrs: { class: tw`text-3xl font-bold` } }, [activeTitle]),
        activeDesc ? D.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, [activeDesc]) : null
      ].filter(Boolean)),
      mediaContent,
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
        D.Containers.Aside({ attrs: { class: tw`space-y-4` } }, categoryCards),
        contentCard
      ])
    ].filter(Boolean));

    return D.Containers.Main({
      attrs: { class: tw`w-full px-4 py-6` }
    }, [layout]);
  }

  const BaseShell = Templates.PagesShell;

  const PagesBlog = {
    meta: {
      icon: '📰',
      label: { ar: 'قالب مدونة', en: 'Blog layout' },
      title: 'Blog oriented shell'
    },
    render: PagesBlogRender,
    createOrders(database) {
      if (BaseShell && typeof BaseShell.createOrders === 'function') {
        return BaseShell.createOrders(database);
      }
      return {};
    }
  };

  Templates.PagesBlog = PagesBlog;
}(typeof window !== 'undefined' ? window : this));
