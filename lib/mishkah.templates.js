/*
 * Mishkah Templates 2.0 — Ready-to-ship layouts with zero friction
 * -----------------------------------------------------------------
 * يوفر هذا النظام ثلاث تصاميم احترافية (Aurora / Atlas / Zen) يمكن تشغيلها خلال ثوانٍ.
 * يكفي تمرير نسخة copy بسيطة أو حقن أي container عبر sections لتخصيص الصفحة.
 * كل شيء مبني على DSL الرسمية لمشكاة مع أوامر عامة للتحكم في القالب.
 */
(function (window) {
  'use strict';

  const M = window.Mishkah = window.Mishkah || {};
  const U = M.utils = M.utils || {};
  const D = M.DSL;
  const UI = M.UI;
  const { tw, token, cx } = U.twcss;
  const mergeDeep = (U.Data && typeof U.Data.deepMerge === 'function')
    ? U.Data.deepMerge
    : function mergeFallback(target, source) {
        if (!target || typeof target !== 'object') target = {};
        if (!source || typeof source !== 'object') return Object.assign({}, target);
        const out = Object.assign({}, target);
        Object.keys(source).forEach((key) => {
          const val = source[key];
          if (val && typeof val === 'object' && !Array.isArray(val) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
            out[key] = mergeFallback(out[key], val);
          } else {
            out[key] = val;
          }
        });
        return out;
      };
  const cloneNode = (U.JSON && typeof U.JSON.clone === 'function')
    ? (value) => U.JSON.clone(value)
    : (value) => JSON.parse(JSON.stringify(value));

  const isObj = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const toArr = (value) => (Array.isArray(value) ? value.filter(Boolean) : (value == null ? [] : [value]));
  const ensureDict = (value) => (isObj(value) ? value : {});

  const helperBag = { D, UI, tw, token, cx, toArr, ensureDict, clone: cloneNode };

  const DEFAULT_OPTIONS = {
    layout: 'aurora',
    mount: '#app',
    theme: 'light',
    lang: 'ar',
    scaffold: true
  };

  const DEFAULT_COPY = {
    brand: {
      name: 'Mishkah Studio',
      tagline: 'منصة تصميم التطبيقات العربية'
    },
    header: {
      links: [
        { id: 'features', label: 'المميزات' },
        { id: 'workflow', label: 'آلية العمل' },
        { id: 'pricing', label: 'الباقات' }
      ],
      cta: { label: 'اطلب استشارة', gkey: 'templates:cta:header' }
    },
    hero: {
      eyebrow: 'قوالب جاهزة',
      title: 'ابنِ لوحة تحكم فاخرة خلال دقائق',
      description: 'نظام القوالب في مشكاة يمنحك صفحات جاهزة ومرنة مع دعم كامل للثيمات والأوامر.',
      bullets: [
        { id: 'arabic', icon: '🌍', text: 'تصميم متوازن يدعم العربية والإنجليزية بشكل كامل.' },
        { id: 'atoms', icon: '🧱', text: 'كل قسم مبني على الذرات الرسمية لـ Mishkah (DSL).' },
        { id: 'orders', icon: '⚡', text: 'أوامر جاهزة لتبديل الثيم واللغة والتنقل بين الأقسام.' }
      ],
      mediaTitle: 'Plug & Play',
      mediaDescription: 'حقن المكوّنات الخاصة بك في أي منطقة خلال ثوانٍ.',
      primary: { label: 'ابدأ البناء الآن', gkey: 'templates:cta:primary' },
      secondary: { label: 'شاهد جولة سريعة', gkey: 'templates:cta:secondary' }
    },
    stats: [
      { id: 'templates', label: 'قوالب جاهزة', value: '12+' },
      { id: 'components', label: 'مكونات UI جاهزة', value: '80+' },
      { id: 'teams', label: 'فرق تستخدم مشكاة', value: '45' }
    ],
    features: [
      { id: 'dsl', icon: '🧬', title: 'DSL صارم', description: 'نلتزم بالتصنيف الرسمي للذرات لتبقى مشاريعك متسقة وآمنة.' },
      { id: 'theme', icon: '🎨', title: 'ثيمات حية', description: 'مبدلات الثيم واللغة تعمل مباشرة دون أي إعداد إضافي.' },
      { id: 'sections', icon: '🧩', title: 'مناطق قابلة للحقن', description: 'كل جزء من القالب يمكن استبداله بمكوّناتك الخاصة بسهولة.' }
    ],
    timeline: {
      title: 'خارطة التنفيذ',
      subtitle: 'ثلاث خطوات فقط تفصل مشروعك عن الإطلاق.',
      items: [
        { id: 'plan', title: 'اليوم ١ — التخطيط', description: 'تحديد قاعدة البيانات وتوزيع الذرات ومناطق الحقن.' },
        { id: 'build', title: 'اليوم ٢ — البناء', description: 'توليد الواجهات وإسناد الأوامر وربط المصادر.' },
        { id: 'launch', title: 'اليوم ٣ — الإطلاق', description: 'اختبارات الجودة والنشر مع توثيق كامل للمكوّنات.' }
      ]
    },
    cards: [
      { id: 'academy', title: 'أكاديمية مشكاة', description: 'مواد مرئية تشرح بناء التطبيقات خطوة بخطوة.' },
      { id: 'workspace', title: 'Workspace', description: 'مساحات عمل مشتركة للفرق مع مشاركة فورية للحالة.' },
      { id: 'community', title: 'مجتمع المطورين', description: 'قنوات تواصل مباشرة مع خبراء مشكاة ودعم مستمر.' }
    ],
    cta: {
      title: 'جاهز للانطلاق؟',
      description: 'اختر القالب المناسب وخصصه خلال دقائق عبر أوامر Mishkah.',
      primary: { label: 'ابدأ النسخة التجريبية', gkey: 'templates:cta:primary' },
      secondary: { label: 'تحدث مع فريقنا', gkey: 'templates:cta:secondary' }
    },
    footer: {
      text: 'مشكاة — بناء المنتجات يبدأ من هنا.',
      links: [
        { id: 'docs', label: 'التوثيق', href: '#' },
        { id: 'support', label: 'الدعم', href: '#' },
        { id: 'blog', label: 'المدونة', href: '#' }
      ]
    }
  };

  function injectBaseStyles() {
    if (typeof document === 'undefined') return;
    const id = 'mishkah-templates-base';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
.mishkah-template {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  color: var(--foreground);
  background: linear-gradient(155deg, color-mix(in oklab, var(--background) 94%, transparent) 0%, color-mix(in oklab, var(--surface-1) 88%, transparent) 100%);
}
.dark .mishkah-template {
  background: linear-gradient(155deg, color-mix(in oklab, var(--background) 95%, black) 0%, color-mix(in oklab, var(--surface-2) 92%, transparent) 100%);
}
.mishkah-template::before,
.mishkah-template::after {
  content: '';
  position: fixed;
  inset: auto;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0.55;
  z-index: 0;
  filter: blur(0);
}
.mishkah-template-aurora::before { top: -140px; left: -80px; background: radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 70%); }
.mishkah-template-aurora::after { bottom: -180px; right: -60px; background: radial-gradient(circle at bottom right, rgba(16,185,129,0.22), transparent 70%); }
.dark .mishkah-template-aurora::before { background: radial-gradient(circle at top left, rgba(129,140,248,0.35), transparent 70%); }
.dark .mishkah-template-aurora::after { background: radial-gradient(circle at bottom right, rgba(45,212,191,0.28), transparent 70%); }
.mishkah-template-atlas {
  background: radial-gradient(circle at top right, rgba(59,130,246,0.12), transparent 55%), color-mix(in oklab, var(--background) 95%, transparent);
}
.dark .mishkah-template-atlas {
  background: radial-gradient(circle at 15% 25%, rgba(129,140,248,0.25), transparent 65%), color-mix(in oklab, var(--background) 96%, black);
}
.mishkah-template-zen {
  background: linear-gradient(180deg, color-mix(in oklab, var(--background) 96%, transparent) 0%, color-mix(in oklab, var(--surface-1) 86%, transparent) 100%);
}
.mishkah-template .template-glass {
  background: color-mix(in oklab, var(--surface-1) 88%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 55%, transparent);
  box-shadow: 0 32px 80px -42px rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(28px);
}
.dark .mishkah-template .template-glass {
  background: color-mix(in oklab, var(--surface-2) 92%, transparent);
  border-color: color-mix(in oklab, var(--border) 55%, transparent);
  box-shadow: 0 32px 80px -40px rgba(15, 23, 42, 0.55);
}
.template-header { z-index: 2; }
.template-brand-block { display: flex; flex-direction: column; gap: 0.2rem; }
.template-brand-tagline { font-size: 0.72rem; letter-spacing: 0.35em; text-transform: uppercase; color: color-mix(in oklab, var(--muted-foreground) 88%, transparent); }
.template-brand-name { font-size: 1.2rem; font-weight: 700; }
.template-link { position: relative; color: color-mix(in oklab, var(--muted-foreground) 92%, transparent); font-weight: 500; }
.template-link::after { content: ''; position: absolute; inset-inline: 0; bottom: -0.35rem; height: 2px; background: color-mix(in oklab, var(--primary) 82%, transparent); transform: scaleX(0); transform-origin: center; transition: transform 0.25s ease; }
.template-link:hover { color: var(--foreground); }
.template-link:hover::after { transform: scaleX(1); }
.template-hero { overflow: hidden; }
.template-hero__title { font-size: clamp(2.2rem, 4vw, 3.2rem); font-weight: 800; line-height: 1.1; }
.template-hero__desc { font-size: 1.05rem; color: color-mix(in oklab, var(--muted-foreground) 88%, transparent); max-width: 52ch; }
.mishkah-template-zen .template-hero__desc { margin-inline: auto; }
.template-hero-bullets { display: grid; gap: 0.75rem; padding: 0; margin: 0; list-style: none; }
.template-bullet { display: flex; align-items: center; gap: 0.75rem; font-size: 0.95rem; color: color-mix(in oklab, var(--foreground) 92%, transparent); }
.template-bullet__icon { width: 2.25rem; height: 2.25rem; display: grid; place-items: center; border-radius: 1rem; background: color-mix(in oklab, var(--accent) 85%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--border) 60%, transparent); }
.template-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.template-hero-visual { position: relative; border-radius: 1.75rem; padding: 2.5rem; background: linear-gradient(150deg, rgba(59,130,246,0.22), rgba(16,185,129,0.18)); color: rgba(15,23,42,0.92); overflow: hidden; box-shadow: 0 26px 70px -40px rgba(37,99,235,0.55); }
.dark .template-hero-visual { color: rgba(226,232,240,0.95); }
.template-hero-visual::after { content: ''; position: absolute; inset: 18% 18% auto; height: 200%; border-radius: 999px; background: radial-gradient(circle, rgba(255,255,255,0.45), transparent 65%); opacity: 0.45; }
.template-hero-visual__label { font-size: 0.82rem; letter-spacing: 0.35em; text-transform: uppercase; display: block; margin-bottom: 0.8rem; color: rgba(15,23,42,0.65); }
.dark .template-hero-visual__label { color: rgba(226,232,240,0.7); }
.template-hero-visual__title { font-size: 1.8rem; font-weight: 700; }
.template-hero-visual__desc { font-size: 0.95rem; margin-top: 0.5rem; max-width: 26ch; }
.mishkah-template-zen .template-hero { text-align: center; }
.mishkah-template-zen .template-actions { justify-content: center; }
.template-stats .template-stat-grid { display: grid; gap: 1.5rem; }
@media (min-width: 768px) { .template-stats .template-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.template-stat { display: flex; flex-direction: column; gap: 0.35rem; }
.template-stat__value { font-size: 1.8rem; font-weight: 700; color: var(--primary); }
.template-stat__label { font-size: 0.9rem; color: color-mix(in oklab, var(--muted-foreground) 90%, transparent); }
.template-feature-card { position: relative; overflow: hidden; }
.template-feature-card .feature-icon { font-size: 1.4rem; }
.template-timeline { display: flex; flex-direction: column; gap: 1.1rem; margin: 0; padding: 0; list-style: none; }
.template-timeline__item { display: flex; gap: 1rem; align-items: flex-start; padding: 0.75rem 0; }
.template-timeline__marker { width: 2.5rem; height: 2.5rem; border-radius: 999px; display: grid; place-items: center; background: color-mix(in oklab, var(--accent) 88%, transparent); font-weight: 600; }
.template-timeline__title { font-weight: 600; margin-bottom: 0.25rem; }
.template-timeline__desc { font-size: 0.9rem; color: color-mix(in oklab, var(--muted-foreground) 92%, transparent); }
.template-cards-grid { display: grid; gap: 1.1rem; }
@media (min-width: 768px) { .template-cards-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.template-cta { text-align: start; }
.mishkah-template-zen .template-cta { text-align: center; }
.template-cta__title { font-size: 1.5rem; font-weight: 700; }
.template-cta__desc { color: color-mix(in oklab, var(--muted-foreground) 90%, transparent); margin: 0.75rem 0 1.25rem; }
.template-footer { display: flex; flex-direction: column; gap: 1rem; border-top: 1px solid color-mix(in oklab, var(--border) 55%, transparent); padding-top: 1.5rem; margin-top: 3rem; }
.mishkah-template-zen .template-footer { align-items: center; }
.template-footer__links { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; }
.template-footer__link { color: color-mix(in oklab, var(--muted-foreground) 92%, transparent); font-size: 0.95rem; }
.template-footer__link:hover { color: var(--foreground); }
.mishkah-dashboard {
  position: relative;
  min-height: 100vh;
  background: linear-gradient(160deg, color-mix(in oklab, var(--background) 94%, transparent) 0%, color-mix(in oklab, var(--surface-1) 88%, transparent) 100%);
}
.dark .mishkah-dashboard {
  background: linear-gradient(160deg, color-mix(in oklab, var(--background) 92%, black) 0%, color-mix(in oklab, var(--surface-2) 90%, transparent) 100%);
}
.mishkah-dashboard::before {
  content: '';
  position: fixed;
  inset: auto;
  width: 520px;
  height: 520px;
  top: -220px;
  right: -140px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(79,70,229,0.15), transparent 70%);
  opacity: 0.55;
  pointer-events: none;
  z-index: 0;
}
.dashboard-stat-grid { display: grid; gap: 1rem; }
@media (min-width: 768px) { .dashboard-stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.dashboard-secondary-grid { display: grid; gap: 1rem; }
.dashboard-secondary-grid > * { height: 100%; }
.mishkah-dashboard-card {
  border-radius: 24px;
  background: color-mix(in oklab, var(--surface-1) 90%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 55%, transparent);
  box-shadow: 0 28px 68px -38px rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(26px);
}
.dark .mishkah-dashboard-card {
  background: color-mix(in oklab, var(--surface-2) 92%, transparent);
  border-color: color-mix(in oklab, var(--border) 58%, transparent);
  box-shadow: 0 32px 70px -36px rgba(15, 23, 42, 0.6);
}
.mishkah-chart-canvas {
  background: color-mix(in oklab, var(--surface-1) 92%, transparent);
  border-radius: 1.25rem;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 48px -32px rgba(15,23,42,0.45);
}
.dark .mishkah-chart-canvas {
  background: color-mix(in oklab, var(--surface-2) 94%, transparent);
  box-shadow: inset 0 1px 0 rgba(15,23,42,0.35), 0 24px 56px -34px rgba(15,23,42,0.65);
}
.mishkah-mobile {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1.25rem;
  background: radial-gradient(circle at 10% 20%, rgba(59,130,246,0.16), transparent 60%), linear-gradient(180deg, color-mix(in oklab, var(--background) 95%, transparent) 0%, color-mix(in oklab, var(--surface-1) 86%, transparent) 100%);
}
.dark .mishkah-mobile {
  background: radial-gradient(circle at 15% 15%, rgba(129,140,248,0.25), transparent 65%), linear-gradient(185deg, color-mix(in oklab, var(--background) 92%, black) 0%, color-mix(in oklab, var(--surface-2) 90%, transparent) 100%);
}
.mishkah-mobile-shell {
  position: relative;
  width: min(420px, 100%);
  border-radius: 2.5rem;
  padding: 1.5rem;
  border: 1px solid color-mix(in oklab, var(--border) 58%, transparent);
  background: color-mix(in oklab, var(--surface-1) 92%, transparent);
  box-shadow: 0 28px 60px -34px rgba(15, 23, 42, 0.45);
  overflow: hidden;
  color: color-mix(in oklab, var(--foreground) 94%, transparent);
}
.dark .mishkah-mobile-shell {
  background: color-mix(in oklab, var(--surface-2) 94%, transparent);
  border-color: color-mix(in oklab, var(--border) 60%, transparent);
  box-shadow: 0 34px 70px -36px rgba(15, 23, 42, 0.7);
  color: color-mix(in oklab, var(--foreground) 98%, transparent);
}
.mishkah-mobile-shell::before {
  content: '';
  position: absolute;
  inset: -45% -40% auto;
  height: 140%;
  background: radial-gradient(circle, rgba(59,130,246,0.18), transparent 68%);
  opacity: 0.45;
}
.mishkah-mobile-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.mobile-balance-card {
  border-radius: 1.5rem;
  padding: 1.25rem;
  background: linear-gradient(160deg, rgba(59,130,246,0.18), rgba(37,99,235,0.12));
  color: rgba(15,23,42,0.92);
  box-shadow: 0 24px 56px -32px rgba(37, 99, 235, 0.45);
}
.dark .mobile-balance-card {
  background: linear-gradient(160deg, rgba(129,140,248,0.35), rgba(14,116,144,0.22));
  color: rgba(226,232,240,0.95);
  box-shadow: 0 28px 64px -34px rgba(15,23,42,0.7);
}
.mobile-status-bar { display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; color: color-mix(in oklab, var(--foreground) 88%, transparent); }
.mobile-quick-actions { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 0.75rem; }
.mobile-action-btn {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: center;
  justify-content: center;
  padding: 0.9rem;
  border-radius: 1.25rem;
  background: color-mix(in oklab, var(--surface-2) 90%, transparent);
  box-shadow: 0 18px 40px -30px rgba(15, 23, 42, 0.4);
  color: color-mix(in oklab, var(--foreground) 90%, transparent);
}
.dark .mobile-action-btn {
  background: color-mix(in oklab, var(--surface-2) 94%, transparent);
  box-shadow: 0 22px 44px -32px rgba(15, 23, 42, 0.6);
  color: color-mix(in oklab, var(--foreground) 96%, transparent);
}
.mobile-highlight-card {
  border-radius: 1.25rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border: 1px solid color-mix(in oklab, var(--border) 58%, transparent);
  background: color-mix(in oklab, var(--surface-1) 94%, transparent);
  color: color-mix(in oklab, var(--foreground) 92%, transparent);
}
.dark .mobile-highlight-card {
  background: color-mix(in oklab, var(--surface-2) 95%, transparent);
  border-color: color-mix(in oklab, var(--border) 60%, transparent);
  color: color-mix(in oklab, var(--foreground) 98%, transparent);
}
.mobile-transaction {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid color-mix(in oklab, var(--border) 55%, transparent);
}
.mobile-transaction:last-child { border-bottom: none; }
.mobile-page-tabs { display: flex; justify-content: center; }
.mobile-page-tabs .ui-switcher { width: 100%; }
.mobile-menu-toggle { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: 9999px; background: color-mix(in oklab, var(--surface-2) 92%, transparent); box-shadow: 0 12px 26px -18px rgba(15,23,42,0.55); }
.dark .mobile-menu-toggle { background: color-mix(in oklab, var(--surface-2) 96%, transparent); box-shadow: 0 14px 30px -18px rgba(15,23,42,0.7); }
.mobile-menu-header { display: flex; align-items: center; gap: 0.85rem; padding-bottom: 0.5rem; border-bottom: 1px solid color-mix(in oklab, var(--border) 55%, transparent); }
.mobile-menu-body { display: flex; flex-direction: column; gap: 1.25rem; padding-top: 0.75rem; }
.mobile-menu-items { display: flex; flex-direction: column; gap: 0.5rem; }
.mobile-menu-item { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.95rem; border-radius: 1rem; background: color-mix(in oklab, var(--surface-1) 94%, transparent); border: 1px solid transparent; transition: background 0.2s ease, border 0.2s ease; color: color-mix(in oklab, var(--foreground) 92%, transparent); }
.mobile-menu-item .item-label { display: flex; align-items: center; gap: 0.75rem; font-weight: 500; }
.mobile-menu-item .item-icon { display: inline-flex; width: 2.1rem; height: 2.1rem; border-radius: 9999px; align-items: center; justify-content: center; background: color-mix(in oklab, var(--surface-2) 90%, transparent); }
.mobile-menu-item.is-active { border-color: color-mix(in oklab, var(--primary) 55%, transparent); background: color-mix(in oklab, var(--primary) 18%, transparent); color: color-mix(in oklab, var(--primary) 95%, var(--foreground)); }
.dark .mobile-menu-item { background: color-mix(in oklab, var(--surface-2) 96%, transparent); color: color-mix(in oklab, var(--foreground) 96%, transparent); }
.mobile-menu-preferences { display: flex; flex-direction: column; gap: 0.5rem; }
.mobile-menu-pref { display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; border-radius: 0.9rem; background: color-mix(in oklab, var(--surface-1) 94%, transparent); color: color-mix(in oklab, var(--foreground) 92%, transparent); }
.dark .mobile-menu-pref { background: color-mix(in oklab, var(--surface-2) 96%, transparent); color: color-mix(in oklab, var(--foreground) 98%, transparent); }
.mobile-menu-footer { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed color-mix(in oklab, var(--border) 50%, transparent); }
.mobile-bottom-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; padding-top: 1.25rem; }
.mobile-bottom-nav button { display: flex; flex-direction: column; gap: 0.2rem; align-items: center; justify-content: center; padding: 0.65rem 0.5rem; border-radius: 1rem; background: color-mix(in oklab, var(--surface-1) 94%, transparent); border: 1px solid transparent; font-size: 0.75rem; color: color-mix(in oklab, var(--foreground) 90%, transparent); }
.mobile-bottom-nav button .icon { font-size: 1.1rem; }
.mobile-bottom-nav button.is-active { border-color: color-mix(in oklab, var(--primary) 55%, transparent); background: color-mix(in oklab, var(--primary) 20%, transparent); color: color-mix(in oklab, var(--primary) 90%, var(--foreground)); }
.dark .mobile-bottom-nav button { background: color-mix(in oklab, var(--surface-2) 95%, transparent); color: color-mix(in oklab, var(--foreground) 96%, transparent); }
.template-atlas-sidebar { background: color-mix(in oklab, var(--surface-2) 92%, transparent); backdrop-filter: blur(28px); border-inline-end: 1px solid color-mix(in oklab, var(--border) 55%, transparent); }
.dark .template-atlas-sidebar { background: color-mix(in oklab, var(--surface-2) 96%, transparent); }
.template-atlas-sidebar .template-timeline__item { border-bottom: 1px solid color-mix(in oklab, var(--border) 50%, transparent); padding-bottom: 1.25rem; }
.template-atlas-sidebar .template-timeline__item:last-child { border-bottom: none; }
.template-sidebar__subtitle { color: color-mix(in oklab, var(--muted-foreground) 92%, transparent); font-size: 0.92rem; }
.template-card-highlight { position: relative; overflow: hidden; }
.template-card-highlight::after { content: ''; position: absolute; inset: 30% -30% auto; height: 120%; border-radius: 999px; background: radial-gradient(circle, rgba(59,130,246,0.25), transparent 70%); opacity: 0.45; }
.template-theme-toggle { font-size: 1.1rem; }
@media (max-width: 768px) {
  .template-header { padding-inline: 1.1rem; border-radius: 1.5rem; }
  .template-hero__desc { max-width: none; }
}
`;
    document.head.appendChild(style);
  }

  const DefaultSections = {
    header: (ctx) => {
      const { D, UI, tw, cx, ensureDict, toArr } = ctx.helpers;
      const headerCopy = ensureDict(ctx.copy.header);
      const brand = ensureDict(ctx.copy.brand);
      const navLinks = toArr(headerCopy.links);
      const action = ensureDict(headerCopy.cta);

      const nav = navLinks.length ? D.Containers.Nav({ attrs: { class: tw`hidden items-center gap-4 text-sm md:flex` } },
        navLinks.map((link, idx) => D.Text.A({
          attrs: {
            key: `nav-${link.id || idx}`,
            href: link.href || '#',
            class: 'template-link',
            gkey: link.gkey || 'templates:nav:link',
            'data-link-id': link.id ? String(link.id) : `link-${idx}`,
            'data-href': link.href || '#'
          }
        }, [link.label || `Link ${idx + 1}`]))
      ) : null;

      const actions = D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
        UI.Button({ attrs: { gkey: 'ui:theme-toggle', class: 'template-theme-toggle' }, variant: 'ghost', size: 'sm' }, ['🌓']),
        action.label ? UI.Button({ attrs: { gkey: action.gkey || 'templates:cta:primary' }, variant: 'solid', size: 'sm' }, [action.label]) : null,
        navLinks.length ? UI.Button({ attrs: { class: tw`md:hidden`, gkey: 'templates:sidebar:toggle' }, variant: 'ghost', size: 'sm' }, ['☰']) : null
      ].filter(Boolean));

      return D.Containers.Header({ attrs: { class: cx('template-glass template-header', tw`flex items-center justify-between gap-6 rounded-full px-5 py-3`) } }, [
        D.Containers.Div({ attrs: { class: 'template-brand-block' } }, [
          brand.tagline ? D.Text.Span({ attrs: { class: 'template-brand-tagline' } }, [brand.tagline]) : null,
          D.Text.Strong({ attrs: { class: 'template-brand-name' } }, [brand.name || 'Mishkah Studio'])
        ].filter(Boolean)),
        nav,
        actions
      ].filter(Boolean));
    },

    hero: (ctx) => {
      const { D, UI, tw, cx, ensureDict, toArr } = ctx.helpers;
      const hero = ensureDict(ctx.copy.hero);
      const bullets = toArr(hero.bullets);
      const primary = ensureDict(hero.primary);
      const secondary = ensureDict(hero.secondary);

      const bulletList = bullets.length
        ? D.Lists.Ul({ attrs: { class: 'template-hero-bullets' } }, bullets.map((item, idx) => D.Lists.Li({
            attrs: { key: `hero-bullet-${item.id || idx}`, class: 'template-bullet' }
          }, [
            item.icon ? D.Text.Span({ attrs: { class: 'template-bullet__icon' } }, [item.icon]) : null,
            item.text ? D.Text.Span({ attrs: { class: 'template-bullet__text' } }, [item.text]) : null
          ].filter(Boolean)))
        ) : null;

      const actions = (primary.label || secondary.label)
        ? D.Containers.Div({ attrs: { class: 'template-actions' } }, [
            primary.label ? UI.Button({ attrs: { gkey: primary.gkey || 'templates:cta:primary' }, variant: 'solid', size: 'md' }, [primary.label]) : null,
            secondary.label ? UI.Button({ attrs: { gkey: secondary.gkey || 'templates:cta:secondary' }, variant: 'ghost', size: 'md' }, [secondary.label]) : null
          ].filter(Boolean))
        : null;

      const visual = D.Containers.Div({ attrs: { class: 'template-hero-visual' } }, [
        D.Text.Span({ attrs: { class: 'template-hero-visual__label' } }, ['Live Preview']),
        D.Text.Strong({ attrs: { class: 'template-hero-visual__title' } }, [hero.mediaTitle || 'Plug & Play']),
        hero.mediaDescription ? D.Text.P({ attrs: { class: 'template-hero-visual__desc' } }, [hero.mediaDescription]) : null
      ].filter(Boolean));

      return D.Containers.Section({ attrs: { class: cx('template-glass template-hero', tw`grid gap-10 rounded-[32px] border px-8 py-10 lg:grid-cols-[1.6fr_1fr]`) } }, [
        D.Containers.Div({ attrs: { class: tw`space-y-6 text-start` } }, [
          hero.eyebrow ? UI.Badge({ variant: 'badge/ghost', text: hero.eyebrow }) : null,
          hero.title ? D.Text.H1({ attrs: { class: 'template-hero__title' } }, [hero.title]) : null,
          hero.description ? D.Text.P({ attrs: { class: 'template-hero__desc' } }, [hero.description]) : null,
          bulletList,
          actions
        ].filter(Boolean)),
        visual
      ]);
    },

    stats: (ctx) => {
      const { D, cx, tw, toArr } = ctx.helpers;
      const stats = toArr(ctx.copy.stats);
      if (!stats.length) return null;
      const cards = stats.map((stat, idx) => D.Containers.Div({
        attrs: { key: `stat-${stat.id || idx}`, class: 'template-stat' }
      }, [
        stat.value ? D.Text.Span({ attrs: { class: 'template-stat__value' } }, [stat.value]) : null,
        stat.label ? D.Text.Span({ attrs: { class: 'template-stat__label' } }, [stat.label]) : null
      ].filter(Boolean)));

      return D.Containers.Section({ attrs: { class: cx('template-glass template-stats', tw`rounded-[28px] border px-6 py-6`) } }, [
        D.Containers.Div({ attrs: { class: 'template-stat-grid' } }, cards)
      ]);
    },

    main: (ctx) => {
      const { UI, tw, cx, toArr, ensureDict } = ctx.helpers;
      const features = toArr(ctx.copy.features);
      if (!features.length) return null;
      const cards = features.map((feature, idx) => {
        const item = ensureDict(feature);
        const icon = item.icon ? D.Text.Span({ attrs: { class: 'feature-icon' } }, [item.icon]) : null;
        const content = icon ? D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [icon]) : null;
        return UI.Card({
          attrs: { key: `feature-${item.id || idx}`, class: cx('template-card-highlight template-feature-card', tw`h-full`) },
          title: item.title,
          description: item.description,
          content
        });
      });
      return D.Containers.Section({ attrs: { class: cx('template-glass template-main', tw`rounded-[28px] border px-6 py-8`) } }, [
        D.Containers.Div({ attrs: { class: tw`grid gap-6 md:grid-cols-2` } }, cards)
      ]);
    },

    sidebar: (ctx) => {
      const { D, UI, tw, cx, ensureDict, toArr } = ctx.helpers;
      const timeline = ensureDict(ctx.copy.timeline);
      const items = toArr(timeline.items);
      if (!items.length) return null;
      const list = items.map((item, idx) => D.Lists.Li({
        attrs: { key: `timeline-${item.id || idx}`, class: 'template-timeline__item' }
      }, [
        D.Containers.Div({ attrs: { class: 'template-timeline__marker' } }, [String(idx + 1).padStart(2, '0')]),
        D.Containers.Div({}, [
          item.title ? D.Text.Span({ attrs: { class: 'template-timeline__title' } }, [item.title]) : null,
          item.description ? D.Text.Span({ attrs: { class: 'template-timeline__desc' } }, [item.description]) : null
        ].filter(Boolean))
      ]));

      return D.Containers.Section({ attrs: { class: cx('template-glass template-sidebar', tw`rounded-[28px] border px-6 py-8 space-y-6`) } }, [
        timeline.title ? D.Text.H3({}, [timeline.title]) : null,
        timeline.subtitle ? D.Text.P({ attrs: { class: 'template-sidebar__subtitle' } }, [timeline.subtitle]) : null,
        D.Lists.Ol({ attrs: { class: 'template-timeline' } }, list)
      ].filter(Boolean));
    },

    cards: (ctx) => {
      const { UI, tw, cx, toArr, ensureDict } = ctx.helpers;
      const cards = toArr(ctx.copy.cards);
      if (!cards.length) return null;
      const list = cards.map((card, idx) => {
        const item = ensureDict(card);
        return UI.Card({
          attrs: { key: `card-${item.id || idx}`, class: cx('template-feature-card', tw`h-full`) },
          title: item.title,
          description: item.description
        });
      });
      return D.Containers.Section({ attrs: { class: cx('template-glass template-cards', tw`rounded-[28px] border px-6 py-8`) } }, [
        D.Containers.Div({ attrs: { class: 'template-cards-grid' } }, list)
      ]);
    },

    cta: (ctx) => {
      const { D, UI, tw, cx, ensureDict } = ctx.helpers;
      const cta = ensureDict(ctx.copy.cta);
      if (!cta.title && !cta.description) return null;
      const primary = ensureDict(cta.primary);
      const secondary = ensureDict(cta.secondary);
      const actions = (primary.label || secondary.label)
        ? D.Containers.Div({ attrs: { class: 'template-actions' } }, [
            primary.label ? UI.Button({ attrs: { gkey: primary.gkey || 'templates:cta:primary' }, variant: 'solid', size: 'md' }, [primary.label]) : null,
            secondary.label ? UI.Button({ attrs: { gkey: secondary.gkey || 'templates:cta:secondary' }, variant: 'ghost', size: 'md' }, [secondary.label]) : null
          ].filter(Boolean))
        : null;
      return D.Containers.Section({ attrs: { class: cx('template-glass template-cta', tw`rounded-[28px] border px-6 py-8`) } }, [
        cta.title ? D.Text.H2({ attrs: { class: 'template-cta__title' } }, [cta.title]) : null,
        cta.description ? D.Text.P({ attrs: { class: 'template-cta__desc' } }, [cta.description]) : null,
        actions
      ].filter(Boolean));
    },

    footer: (ctx) => {
      const { D, tw, toArr, ensureDict } = ctx.helpers;
      const footer = ensureDict(ctx.copy.footer);
      const links = toArr(footer.links);
      const nav = links.length
        ? D.Containers.Nav({ attrs: { class: 'template-footer__links' } },
            links.map((link, idx) => D.Text.A({
              attrs: {
                key: `footer-${link.id || idx}`,
                href: link.href || '#',
                class: 'template-footer__link',
                gkey: link.gkey || 'templates:nav:link',
                'data-link-id': link.id ? String(link.id) : `footer-${idx}`,
                'data-href': link.href || '#'
              }
            }, [link.label || `Link ${idx + 1}`]))
          )
        : null;

      return D.Containers.Div({ attrs: { class: 'template-footer' } }, [
        footer.text ? D.Text.Span({ attrs: { class: tw`text-sm` } }, [footer.text]) : null,
        nav
      ].filter(Boolean));
    }
  };

  const DEFAULT_DASHBOARD_COPY = {
    brand: {
      name: 'Mishkah Analytics',
      subtitle: 'تقرير الأداء الأسبوعي',
      initials: 'MA'
    },
    filters: {
      activeRange: '7d',
      searchPlaceholder: 'ابحث في لوحة التحكم',
      user: 'ليلى أحمد',
      ranges: [
        { id: '24h', label: 'آخر ٢٤ ساعة' },
        { id: '7d', label: 'آخر ٧ أيام' },
        { id: '30d', label: 'آخر ٣٠ يوم' }
      ],
      primaryAction: { label: 'تصدير التقرير', gkey: 'dashboard:export' }
    },
    stats: [
      { id: 'visits', title: 'الزيارات', value: '38,240', meta: '+14% عن الأسبوع الماضي' },
      { id: 'signups', title: 'التسجيلات الجديدة', value: '1,204', meta: '+6% نمو' },
      { id: 'conversion', title: 'نسبة التحويل', value: '4.2%', meta: '+0.8 نقطة' },
      { id: 'retention', title: 'الاحتفاظ', value: '86%', meta: 'ثابت' }
    ],
    charts: {
      performance: {
        title: 'أداء القنوات الرقمية',
        subtitle: 'النمو الأسبوعي للزيارات والتحويلات',
        height: 320,
        data: {
          labels: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
          datasets: [
            {
              label: 'الزيارات',
              data: [180, 240, 265, 310, 332, 360, 384],
              fill: true,
              backgroundColor: 'rgba(59,130,246,0.18)',
              borderColor: 'rgba(59,130,246,1)',
              pointBackgroundColor: 'rgba(59,130,246,1)'
            },
            {
              label: 'التسجيلات',
              data: [48, 62, 70, 82, 88, 94, 108],
              fill: false,
              borderColor: 'rgba(16,185,129,1)',
              backgroundColor: 'rgba(16,185,129,0.24)',
              pointBackgroundColor: 'rgba(16,185,129,1)'
            }
          ]
        },
        options: {
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { suggestedMax: 400 } }
        }
      },
      conversion: {
        title: 'معدل التحويل لكل قناة',
        subtitle: 'مقارنة بين الحملات الأساسية',
        height: 220,
        data: {
          labels: ['البريد', 'الإعلانات', 'الشركاء', 'التواصل'],
          datasets: [
            {
              label: 'تسجيلات',
              data: [85, 64, 48, 38],
              backgroundColor: [
                'rgba(56,189,248,0.78)',
                'rgba(129,140,248,0.85)',
                'rgba(16,185,129,0.82)',
                'rgba(251,191,36,0.82)'
              ],
              borderRadius: 14
            }
          ]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 20 } } }
        }
      },
      breakdown: {
        title: 'توزيع الأجهزة',
        subtitle: 'نسبة المستخدمين بحسب الجهاز',
        height: 220,
        data: {
          labels: ['الهاتف', 'الحاسوب', 'الأجهزة اللوحية'],
          datasets: [
            {
              data: [54, 34, 12],
              backgroundColor: ['#6366F1', '#10B981', '#F59E0B'],
              borderWidth: 0
            }
          ]
        },
        options: {
          plugins: { legend: { position: 'right' } }
        }
      }
    },
    table: {
      title: 'أفضل القنوات',
      subtitle: 'أداء الحملات خلال الفترة المختارة',
      columns: [
        { key: 'channel', label: 'القناة' },
        { key: 'sessions', label: 'الزيارات' },
        { key: 'signups', label: 'التسجيلات' },
        { key: 'rate', label: 'التحويل' }
      ],
      rows: [
        { channel: 'البريد الإلكتروني', sessions: '12,350', signups: '640', rate: '5.2%' },
        { channel: 'الإعلانات المدفوعة', sessions: '9,180', signups: '420', rate: '4.6%' },
        { channel: 'الشركاء', sessions: '6,420', signups: '318', rate: '5.0%' },
        { channel: 'وسائل التواصل', sessions: '5,760', signups: '226', rate: '3.9%' }
      ],
      action: { label: 'عرض جميع القنوات', gkey: 'dashboard:table:action' }
    },
    activity: {
      title: 'المهام السريعة',
      subtitle: 'تابع أهم المهام للفريق',
      items: [
        { id: 'campaign', icon: '🎯', title: 'إطلاق حملة رمضان', status: 'جاهز للنشر', due: 'اليوم' },
        { id: 'ux', icon: '🧪', title: 'مراجعة تجربة الدفع', status: 'قيد التنفيذ', due: 'غدًا' },
        { id: 'report', icon: '📈', title: 'تقرير أسبوعي للإدارة', status: 'قيد المراجعة', due: 'الخميس' }
      ]
    }
  };

  const DASHBOARD_DEFAULT_OPTIONS = {
    layout: 'command',
    mount: '#app',
    theme: 'light',
    lang: 'ar',
    scaffold: true
  };

  const DashboardSections = {
    topbar: (ctx) => {
      const { D, UI, tw, cx, ensureDict, toArr, token } = ctx.helpers;
      const brand = ensureDict(ctx.copy.brand);
      const filters = ensureDict(ctx.copy.filters);
      const ranges = toArr(filters.ranges);
      const activeRange = ctx.db?.ui?.activeRange || filters.activeRange || (ranges[0] && (ranges[0].id || ranges[0].value));

      const initials = brand.initials || (brand.name ? brand.name.slice(0, 2).toUpperCase() : 'MS');
      const badge = D.Containers.Div({ attrs: { class: tw`grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in oklab,var(--primary) 90%, transparent)] text-lg font-semibold text-[var(--primary)] shadow-sm` } }, [
        brand.icon ? D.Text.Span({}, [brand.icon]) : D.Text.Span({}, [initials])
      ]);

      const brandBlock = D.Containers.Div({ attrs: { class: tw`flex flex-col gap-0.5` } }, [
        D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [brand.name || 'Mishkah Analytics']),
        brand.subtitle ? D.Text.Span({ attrs: { class: tw`text-xs ${token('muted')}` } }, [brand.subtitle]) : null
      ].filter(Boolean));

      const left = D.Containers.Div({ attrs: { class: tw`flex items-center gap-3` } }, [badge, brandBlock]);

      const rangeSelector = ranges.length
        ? UI.Segmented({
            items: ranges.map((range, idx) => ({
              id: range.id || range.value || `range-${idx}`,
              label: range.label || range.title || `Range ${idx + 1}`,
              gkey: range.gkey || 'dashboard:filters:range',
              attrs: { 'data-range-id': range.id || range.value || `range-${idx}` }
            })),
            activeId: activeRange,
            attrs: { class: tw`hidden md:flex bg-[color-mix(in oklab,var(--surface-2) 88%, transparent)]` }
          })
        : null;

      const controls = [
        filters.searchPlaceholder
          ? UI.SearchBar({
              placeholder: filters.searchPlaceholder,
              attrs: { class: tw`hidden lg:flex w-[260px]` },
              onInput: filters.searchGkey || 'dashboard:search'
            })
          : null,
        rangeSelector,
        filters.user ? UI.Badge({ variant: 'badge/ghost', text: filters.user, attrs: { class: tw`hidden sm:inline-flex` } }) : null,
        filters.primaryAction && filters.primaryAction.label
          ? UI.Button({ attrs: { gkey: filters.primaryAction.gkey || 'dashboard:export' }, variant: 'solid', size: 'sm' }, [filters.primaryAction.label])
          : null
      ].filter(Boolean);

      const right = D.Containers.Div({ attrs: { class: tw`flex flex-wrap items-center justify-end gap-2` } }, controls);

      return UI.Toolbar({ left: [left], right: [right] });
    },

    stats: (ctx) => {
      const { D, UI, tw, cx, toArr, ensureDict } = ctx.helpers;
      const stats = toArr(ctx.copy.stats);
      if (!stats.length) return null;
      const cards = stats.map((entry, idx) => {
        const item = ensureDict(entry);
        return UI.StatCard({
          title: item.title || item.label || `المؤشر ${idx + 1}`,
          value: item.value || '0',
          meta: item.meta || item.hint
        });
      });
      return D.Containers.Section({ attrs: { class: cx('mishkah-dashboard-card', tw`p-4 md:p-6`) } }, [
        D.Containers.Div({ attrs: { class: 'dashboard-stat-grid' } }, cards)
      ]);
    },

    primaryChart: (ctx) => {
      const { D, UI, tw, ensureDict, cx } = ctx.helpers;
      const perf = ensureDict(ctx.copy.charts && ctx.copy.charts.performance);
      if (!Object.keys(perf).length) return null;
      const height = perf.height || 320;
      const chart = UI.Chart.Line({
        data: perf.data,
        options: perf.options,
        height,
        attrs: { 'data-chart-key': 'dashboard:performance' },
        description: perf.title
      });
      const header = D.Containers.Div({ attrs: { class: tw`space-y-1` } }, [
        perf.title ? D.Text.H3({ attrs: { class: tw`text-base font-semibold` } }, [perf.title]) : null,
        perf.subtitle ? D.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, [perf.subtitle]) : null
      ].filter(Boolean));
      const bodyAttrs = { class: tw`flex-1`, style: `min-height:${height}px;` };
      return D.Containers.Section({ attrs: { class: cx('mishkah-dashboard-card', tw`flex h-full flex-col gap-4 p-6`) } }, [
        header,
        D.Containers.Div({ attrs: bodyAttrs }, [chart])
      ]);
    },

    secondaryCharts: (ctx) => {
      const { D, UI, tw, ensureDict, cx } = ctx.helpers;
      const conversion = ensureDict(ctx.copy.charts && ctx.copy.charts.conversion);
      const breakdown = ensureDict(ctx.copy.charts && ctx.copy.charts.breakdown);
      const cards = [];

      if (Object.keys(conversion).length) {
        const height = conversion.height || 220;
        const chart = UI.Chart.Bar({
          data: conversion.data,
          options: conversion.options,
          height,
          attrs: { 'data-chart-key': 'dashboard:conversion' },
          description: conversion.title
        });
        cards.push(D.Containers.Section({ attrs: { class: cx('mishkah-dashboard-card', tw`flex flex-col gap-4 p-6`) } }, [
          conversion.title ? D.Text.H3({ attrs: { class: tw`text-base font-semibold` } }, [conversion.title]) : null,
          conversion.subtitle ? D.Text.P({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [conversion.subtitle]) : null,
          D.Containers.Div({ attrs: { class: tw`flex-1`, style: `min-height:${height}px;` } }, [chart])
        ].filter(Boolean)));
      }

      if (Object.keys(breakdown).length) {
        const height = breakdown.height || 220;
        const chart = UI.Chart.Doughnut({
          data: breakdown.data,
          options: breakdown.options,
          height,
          attrs: { 'data-chart-key': 'dashboard:breakdown' },
          description: breakdown.title
        });
        cards.push(D.Containers.Section({ attrs: { class: cx('mishkah-dashboard-card', tw`flex flex-col gap-4 p-6`) } }, [
          breakdown.title ? D.Text.H3({ attrs: { class: tw`text-base font-semibold` } }, [breakdown.title]) : null,
          breakdown.subtitle ? D.Text.P({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [breakdown.subtitle]) : null,
          D.Containers.Div({ attrs: { class: tw`flex-1 items-center justify-center`, style: `min-height:${height}px; display:flex;` } }, [chart])
        ].filter(Boolean)));
      }

      if (!cards.length) return null;
      return D.Containers.Div({ attrs: { class: 'dashboard-secondary-grid' } }, cards);
    },

    table: (ctx) => {
      const { D, UI, tw, cx, ensureDict, toArr } = ctx.helpers;
      const table = ensureDict(ctx.copy.table);
      const columns = toArr(table.columns);
      const rows = toArr(table.rows);
      if (!columns.length || !rows.length) return null;
      const footerAction = ensureDict(table.action);
      const tableNode = D.Containers.Div({ attrs: { class: tw`overflow-x-auto` } }, [
        UI.Table({ columns, rows })
      ]);
      const footer = footerAction.label
        ? D.Containers.Div({ attrs: { class: tw`flex justify-end` } }, [
            UI.Button({ attrs: { gkey: footerAction.gkey || 'dashboard:table:action' }, variant: 'ghost', size: 'sm' }, [footerAction.label])
          ])
        : null;
      return D.Containers.Section({ attrs: { class: cx('mishkah-dashboard-card', tw`flex h-full flex-col gap-4 p-6`) } }, [
        table.title ? D.Text.H3({ attrs: { class: tw`text-base font-semibold` } }, [table.title]) : null,
        table.subtitle ? D.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, [table.subtitle]) : null,
        tableNode,
        footer
      ].filter(Boolean));
    },

    activity: (ctx) => {
      const { D, UI, tw, ensureDict, toArr } = ctx.helpers;
      const activity = ensureDict(ctx.copy.activity);
      const items = toArr(activity.items);
      if (!items.length) return null;
      const listItems = items.map((entry, idx) => {
        const item = ensureDict(entry);
        const leading = item.icon ? D.Text.Span({ attrs: { class: tw`text-lg` } }, [item.icon]) : null;
        const content = [
          item.title ? D.Text.Span({ attrs: { class: tw`text-sm font-semibold` } }, [item.title]) : null,
          item.status ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [item.status]) : null
        ].filter(Boolean);
        const trailing = item.due ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [item.due]) : null;
        return UI.ListItem({
          leading,
          content,
          trailing,
          attrs: { key: `activity-${item.id || idx}` }
        });
      });
      return D.Containers.Section({ attrs: { class: cx('mishkah-dashboard-card', tw`flex h-full flex-col gap-4 p-6`) } }, [
        activity.title ? D.Text.H3({ attrs: { class: tw`text-base font-semibold` } }, [activity.title]) : null,
        activity.subtitle ? D.Text.P({ attrs: { class: tw`text-sm text-[var(--muted-foreground)]` } }, [activity.subtitle]) : null,
        UI.List({ children: listItems })
      ].filter(Boolean));
    }
  };

  function LayoutDashboardCommand(ctx) {
    const { D, tw, cx } = ctx.helpers;
    const topbar = ctx.render('topbar');
    const stats = ctx.render('stats');
    const primary = ctx.render('primaryChart');
    const secondary = ctx.render('secondaryCharts');
    const table = ctx.render('table');
    const activity = ctx.render('activity');

    return D.Containers.Div({ attrs: { class: cx('mishkah-dashboard', tw`flex min-h-screen flex-col`) } }, [
      D.Containers.Main({ attrs: { class: tw`relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 lg:px-10` } }, [
        topbar,
        stats,
        D.Containers.Div({ attrs: { class: tw`grid gap-6 lg:grid-cols-[2fr_1fr]` } }, [primary, secondary].filter(Boolean)),
        D.Containers.Div({ attrs: { class: tw`grid gap-6 lg:grid-cols-[2fr_1fr]` } }, [table, activity].filter(Boolean))
      ].filter(Boolean))
    ]);
  }

  const DashboardLayouts = { command: LayoutDashboardCommand };

  const DEFAULT_MOBILE_COPY = {
    statusBar: { time: '9:41', connectivity: '5G', battery: '🔋 82%' },
    header: { greeting: 'مرحبًا، سارة', subtitle: 'الرصيد المتاح', avatar: '🪄' },
    balance: {
      amount: '24,800 ر.س',
      change: '+12% هذا الأسبوع',
      caption: 'آخر تحديث منذ دقيقة',
      chart: {
        type: 'line',
        height: 140,
        data: {
          labels: ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز'],
          datasets: [
            {
              label: 'الرصيد',
              data: [18, 19, 21, 19, 22, 24, 25],
              fill: true,
              borderColor: 'rgba(129,140,248,1)',
              backgroundColor: 'rgba(129,140,248,0.24)',
              pointRadius: 0
            }
          ]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      }
    },
    quickActions: [
      { id: 'transfer', label: 'تحويل', icon: '↗️' },
      { id: 'bill', label: 'دفع فاتورة', icon: '💡' },
      { id: 'topup', label: 'شحن', icon: '➕' }
    ],
    highlights: [
      { id: 'budget', title: 'الموازنة الشهرية', value: '68% مستهلك', meta: '2,450 ر.س متبقي' },
      { id: 'savings', title: 'المدخرات الذكية', value: '8,200 ر.س', meta: '+450 ر.س هذا الشهر' }
    ],
    transactions: {
      title: 'الحركات الأخيرة',
      items: [
        { id: 'uber', name: 'رحلة أوبر', time: 'اليوم • 09:24', amount: '-34 ر.س', type: 'out' },
        { id: 'salary', name: 'إيداع راتب', time: 'أمس • 18:10', amount: '+8,500 ر.س', type: 'in' },
        { id: 'market', name: 'سوبرماركت', time: 'أمس • 13:45', amount: '-240 ر.س', type: 'out' }
      ],
      action: { label: 'عرض الكل', gkey: 'mobile:transactions:all' }
    },
    pages: [
      {
        id: 'overview',
        label: 'الرئيسية',
        statusBar: { time: '9:41', connectivity: '5G', battery: '🔋 82%' },
        header: { greeting: 'مرحبًا، سارة', subtitle: 'الرصيد المتاح', avatar: '🪄', pageTitle: 'الحسابات' },
        balance: {
          amount: '24,800 ر.س',
          change: '+12% هذا الأسبوع',
          caption: 'آخر تحديث منذ دقيقة',
          chart: {
            type: 'line',
            height: 140,
            data: {
              labels: ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز'],
              datasets: [
                {
                  label: 'الرصيد',
                  data: [18, 19, 21, 19, 22, 24, 25],
                  fill: true,
                  borderColor: 'rgba(129,140,248,1)',
                  backgroundColor: 'rgba(129,140,248,0.24)',
                  pointRadius: 0
                }
              ]
            },
            options: {
              plugins: { legend: { display: false } },
              scales: { x: { display: false }, y: { display: false } }
            }
          }
        },
        quickActions: [
          { id: 'transfer', label: 'تحويل', icon: '↗️' },
          { id: 'bill', label: 'دفع فاتورة', icon: '💡' },
          { id: 'topup', label: 'شحن', icon: '➕' }
        ],
        highlights: [
          { id: 'budget', title: 'الموازنة الشهرية', value: '68% مستهلك', meta: '2,450 ر.س متبقي' },
          { id: 'savings', title: 'المدخرات الذكية', value: '8,200 ر.س', meta: '+450 ر.س هذا الشهر' }
        ],
        transactions: {
          title: 'الحركات الأخيرة',
          items: [
            { id: 'uber', name: 'رحلة أوبر', time: 'اليوم • 09:24', amount: '-34 ر.س', type: 'out' },
            { id: 'salary', name: 'إيداع راتب', time: 'أمس • 18:10', amount: '+8,500 ر.س', type: 'in' },
            { id: 'market', name: 'سوبرماركت', time: 'أمس • 13:45', amount: '-240 ر.س', type: 'out' }
          ],
          action: { label: 'عرض الكل', gkey: 'mobile:transactions:all' }
        }
      },
      {
        id: 'cards',
        label: 'البطاقات',
        header: { greeting: 'بطاقاتك', subtitle: 'الإدارة الذكية للبطاقات', avatar: '💳', pageTitle: 'إدارة البطاقات' },
        quickActions: [
          { id: 'freeze', label: 'إيقاف بطاقة', icon: '🛑' },
          { id: 'limit', label: 'تعديل حدود', icon: '🎯' },
          { id: 'new', label: 'إصدار جديدة', icon: '✨' }
        ],
        highlights: [
          { id: 'visa', title: 'بطاقة Visa', value: '12,500 ر.س حد متاح', meta: 'آخر عملية أمس' },
          { id: 'digital', title: 'البطاقة الرقمية', value: '4,300 ر.س حد متاح', meta: 'تم استخدامها 3 مرات هذا الأسبوع' }
        ],
        transactions: {
          title: 'استخدام البطاقات',
          items: [
            { id: 'flight', name: 'حجز طيران', time: 'اليوم • 07:10', amount: '-1,240 ر.س', type: 'out' },
            { id: 'refund', name: 'استرداد متجر', time: 'أمس • 19:40', amount: '+320 ر.س', type: 'in' },
            { id: 'subscription', name: 'اشتراك منصّة', time: 'أمس • 11:05', amount: '-45 ر.س', type: 'out' }
          ],
          action: { label: 'إدارة البطاقات', gkey: 'mobile:cards:manage' }
        }
      },
      {
        id: 'insights',
        label: 'التحليلات',
        header: { greeting: 'رؤى مالية', subtitle: 'اتجاهات الإنفاق والادخار', avatar: '📊', pageTitle: 'لوحة التحليلات' },
        balance: {
          amount: '5,820 ر.س',
          change: 'معدل ادخار 22%',
          caption: 'ميزانية شهر رجب',
          chart: {
            type: 'bar',
            height: 140,
            data: {
              labels: ['مواصلات', 'مطاعم', 'تسوق', 'سفر'],
              datasets: [
                {
                  label: 'الإنفاق',
                  data: [620, 540, 460, 380],
                  borderRadius: 16,
                  backgroundColor: ['rgba(56,189,248,0.75)', 'rgba(249,115,22,0.75)', 'rgba(129,140,248,0.78)', 'rgba(16,185,129,0.78)']
                }
              ]
            },
            options: {
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } }
            }
          }
        },
        highlights: [
          { id: 'trend', title: 'اتجاه الإنفاق', value: '−8% مقارنة بالشهر الماضي', meta: 'حافظ على المسار الحالي' },
          { id: 'goal', title: 'الادخار السنوي', value: 'تم تحقيق 62%', meta: 'تبقّى 4 أشهر على الهدف' }
        ],
        transactions: {
          title: 'التذكيرات القادمة',
          items: [
            { id: 'rent', name: 'دفعة إيجار', time: 'بعد 3 أيام', amount: '-4,200 ر.س', type: 'out' },
            { id: 'investment', name: 'استثمار دوري', time: 'بعد أسبوع', amount: '-1,000 ر.س', type: 'out' },
            { id: 'bonus', name: 'عائد أرباح', time: 'الشهر المقبل', amount: '+2,400 ر.س', type: 'in' }
          ],
          action: { label: 'إدارة التذكيرات', gkey: 'mobile:insights:reminders' }
        }
      }
    ],
    sideMenu: {
      profile: { name: 'سارة العنزي', email: 'sara@mishkah.app', avatar: '🪄', badge: 'Premium' },
      items: [
        { id: 'overview', icon: '🏠', label: 'الرئيسية' },
        { id: 'cards', icon: '💳', label: 'البطاقات' },
        { id: 'insights', icon: '📊', label: 'التحليلات' }
      ],
      preferences: [
        { id: 'theme', icon: '🌓', label: 'تبديل الثيم', gkey: 'ui:theme-toggle' },
        { id: 'lang-ar', icon: '🇸🇦', label: 'العربية', gkey: 'ui:lang-ar' },
        { id: 'lang-en', icon: '🇬🇧', label: 'English', gkey: 'ui:lang-en' }
      ],
      footer: { label: 'تسجيل الخروج', gkey: 'mobile:menu:logout' }
    },
    bottomNav: {
      items: [
        { id: 'overview', label: 'الرئيسية', icon: '🏠' },
        { id: 'cards', label: 'البطاقات', icon: '💳' },
        { id: 'insights', label: 'رؤى', icon: '📈' }
      ]
    }
  };

  const MOBILE_DEFAULT_OPTIONS = {
    layout: 'neo',
    mount: '#app',
    theme: 'light',
    lang: 'ar',
    scaffold: true
  };

  const mobilePageKey = (page, fallback) => page?.id || page?.value || page?.slug || page?.code || fallback;

  function getMobilePages(copy) {
    return toArr(copy.pages).map((entry) => ensureDict(entry)).filter((entry) => Object.keys(entry).length);
  }

  function getActiveMobilePage(ctx) {
    const pages = getMobilePages(ctx.copy);
    if (!pages.length) return null;
    const active = ctx.db?.ui?.activePage;
    if (active) {
      const found = pages.find((page, index) => mobilePageKey(page, `page-${index}`) === active);
      if (found) return found;
    }
    return pages[0];
  }

  function resolveActivePageId(ctx) {
    const pages = getMobilePages(ctx.copy);
    if (!pages.length) return null;
    const fallback = mobilePageKey(pages[0], 'page-0');
    const active = ctx.db?.ui?.activePage;
    if (active && pages.some((page, index) => mobilePageKey(page, `page-${index}`) === active)) {
      return active;
    }
    return fallback;
  }

  function pickPageDict(ctx, key) {
    const fallback = ensureDict(ctx.copy[key]);
    const page = getActiveMobilePage(ctx);
    if (!page) return fallback;
    const override = ensureDict(page[key]);
    if (!Object.keys(override).length) return fallback;
    return mergeDeep(fallback, override);
  }

  function pickPageArray(ctx, key) {
    const page = getActiveMobilePage(ctx);
    const override = page ? toArr(page[key]) : [];
    if (override.length) return override;
    return toArr(ctx.copy[key]);
  }

  const MobileSections = {
    status: (ctx) => {
      const { D } = ctx.helpers;
      const status = pickPageDict(ctx, 'statusBar');
      return D.Containers.Div({ attrs: { class: 'mobile-status-bar' } }, [
        D.Text.Span({}, [status.time || '9:41']),
        D.Text.Span({}, [status.connectivity || '5G']),
        D.Text.Span({}, [status.battery || '🔋'])
      ]);
    },

    header: (ctx) => {
      const { D, tw } = ctx.helpers;
      const header = pickPageDict(ctx, 'header');
      const showMenu = getMobilePages(ctx.copy).length > 1 || (toArr(ctx.copy.sideMenu?.items).length > 0);
      const left = D.Containers.Div({ attrs: { class: tw`flex flex-col gap-1` } }, [
        header.greeting ? D.Text.H3({ attrs: { class: tw`text-lg font-semibold` } }, [header.greeting]) : null,
        header.subtitle ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [header.subtitle]) : null,
        header.pageTitle ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [header.pageTitle]) : null
      ].filter(Boolean));
      const actions = [];
      if (showMenu) {
        actions.push(D.Forms.Button({
          attrs: {
            class: 'mobile-menu-toggle',
            type: 'button',
            gkey: 'mobile:menu:open',
            'aria-label': 'Open menu'
          }
        }, ['☰']));
      }
      if (header.avatar) {
        actions.push(D.Containers.Div({ attrs: { class: tw`grid h-10 w-10 place-items-center rounded-full bg-[color-mix(in oklab,var(--primary) 90%, transparent)] text-lg shadow-sm` } }, [header.avatar]));
      }
      return D.Containers.Div({ attrs: { class: tw`flex items-center justify-between` } }, [
        left,
        actions.length ? D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, actions) : null
      ].filter(Boolean));
    },

    balance: (ctx) => {
      const { D, UI, tw } = ctx.helpers;
      const balance = pickPageDict(ctx, 'balance');
      const chartCfg = ensureDict(balance.chart);
      const chartHeight = chartCfg.height || 140;
      const chart = chartCfg.data
        ? UI.Chart.factory(chartCfg.type || 'line')({
            data: chartCfg.data,
            options: chartCfg.options,
            height: chartHeight,
            attrs: { 'data-chart-key': 'mobile:balance' },
            description: 'منحنى الرصيد'
          })
        : null;
      return D.Containers.Div({ attrs: { class: tw`mobile-balance-card flex flex-col gap-4` } }, [
        D.Containers.Div({ attrs: { class: tw`flex flex-col gap-1` } }, [
          balance.caption ? D.Text.Span({ attrs: { class: tw`text-xs text-white/70` } }, [balance.caption]) : null,
          balance.amount ? D.Text.H3({ attrs: { class: tw`text-2xl font-bold` } }, [balance.amount]) : null,
          balance.change ? D.Text.Span({ attrs: { class: tw`text-xs` } }, [balance.change]) : null
        ].filter(Boolean)),
        chart ? D.Containers.Div({ attrs: { class: tw`flex-1`, style: `min-height:${chartHeight}px;` } }, [chart]) : null
      ].filter(Boolean));
    },

    quickActions: (ctx) => {
      const { D, ensureDict, toArr, tw, cx } = ctx.helpers;
      const actions = pickPageArray(ctx, 'quickActions');
      if (!actions.length) return null;
      const active = ctx.db?.ui?.activeAction;
      const buttons = actions.map((entry, idx) => {
        const action = ensureDict(entry);
        const id = action.id || `action-${idx}`;
        const isActive = active ? active === id : idx === 0;
        const btnAttrs = {
          class: cx('mobile-action-btn', isActive && 'ring-2 ring-[color-mix(in oklab,var(--primary) 65%, transparent)]'),
          type: 'button',
          gkey: action.gkey || 'mobile:actions:select',
          'data-action-id': id
        };
        return D.Forms.Button({ attrs: btnAttrs }, [
          action.icon ? D.Text.Span({ attrs: { class: tw`text-xl` } }, [action.icon]) : null,
          action.label ? D.Text.Span({ attrs: { class: tw`text-xs font-medium` } }, [action.label]) : null
        ].filter(Boolean));
      });
      return D.Containers.Div({ attrs: { class: 'mobile-quick-actions' } }, buttons);
    },

    highlights: (ctx) => {
      const { D, ensureDict, toArr, tw } = ctx.helpers;
      const highlights = pickPageArray(ctx, 'highlights');
      if (!highlights.length) return null;
      const cards = highlights.map((entry, idx) => {
        const item = ensureDict(entry);
        return D.Containers.Div({ attrs: { key: `highlight-${item.id || idx}`, class: 'mobile-highlight-card' } }, [
          item.title ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [item.title]) : null,
          item.value ? D.Text.Strong({ attrs: { class: tw`text-lg font-semibold` } }, [item.value]) : null,
          item.meta ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [item.meta]) : null
        ].filter(Boolean));
      });
      return D.Containers.Div({ attrs: { class: tw`grid gap-3 sm:grid-cols-2` } }, cards);
    },

    transactions: (ctx) => {
      const { D, UI, ensureDict, toArr, tw } = ctx.helpers;
      const section = pickPageDict(ctx, 'transactions');
      const rows = toArr(section.items);
      if (!rows.length) return null;
      const entries = rows.map((entry, idx) => {
        const item = ensureDict(entry);
        const amountClass = item.type === 'in' ? tw`text-emerald-500 font-semibold` : tw`text-rose-500 font-semibold`;
        return D.Containers.Div({ attrs: { class: 'mobile-transaction', key: `txn-${item.id || idx}` } }, [
          D.Containers.Div({ attrs: { class: tw`flex flex-col gap-0.5` } }, [
            item.name ? D.Text.Span({ attrs: { class: tw`text-sm font-medium` } }, [item.name]) : null,
            item.time ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [item.time]) : null
          ].filter(Boolean)),
          item.amount ? D.Text.Span({ attrs: { class: amountClass } }, [item.amount]) : null
        ].filter(Boolean));
      });
      const footer = ensureDict(section.action);
      const footerNode = footer.label
        ? UI.Button({ attrs: { gkey: footer.gkey || 'mobile:transactions:all' }, variant: 'ghost', size: 'sm' }, [footer.label])
        : null;
      return D.Containers.Section({ attrs: { class: tw`flex flex-col gap-2` } }, [
        section.title ? D.Text.H3({ attrs: { class: tw`text-base font-semibold` } }, [section.title]) : null,
        ...entries,
          footerNode ? D.Containers.Div({ attrs: { class: tw`pt-1` } }, [footerNode]) : null
      ].filter(Boolean));
    },

    pageTabs: (ctx) => {
      const { D, UI, tw } = ctx.helpers;
      const pages = getMobilePages(ctx.copy);
      if (!pages.length) return null;
      const active = resolveActivePageId(ctx);
      const items = pages.map((page, index) => {
        const id = mobilePageKey(page, `page-${index}`);
        return {
          id,
          label: page.label || page.title || `صفحة ${index + 1}`,
          gkey: 'mobile:page:select'
        };
      });
      return D.Containers.Div({ attrs: { class: 'mobile-page-tabs' } }, [
        UI.Segmented({ items, activeId: active, attrs: { class: tw`w-full justify-between` } })
      ]);
    },

    sideMenu: (ctx) => {
      const { D, UI, ensureDict, toArr, tw, cx } = ctx.helpers;
      const menu = ensureDict(ctx.copy.sideMenu);
      const items = toArr(menu.items);
      const preferences = toArr(menu.preferences);
      const footer = ensureDict(menu.footer);
      const open = !!(ctx.db && ctx.db.ui && ctx.db.ui.sideMenuOpen);
      if (!open && !items.length && !preferences.length && !footer.label) {
        return D.Containers.Div({ attrs: { class: tw`hidden` } });
      }
      const profile = ensureDict(menu.profile);
      const activePage = resolveActivePageId(ctx);
      const header = D.Containers.Div({ attrs: { class: 'mobile-menu-header' } }, [
        profile.avatar ? D.Containers.Div({ attrs: { class: tw`grid h-12 w-12 place-items-center rounded-full bg-[color-mix(in oklab,var(--primary) 90%, transparent)] text-xl shadow-sm` } }, [profile.avatar]) : null,
        D.Containers.Div({ attrs: { class: tw`flex flex-col` } }, [
          profile.name ? D.Text.Strong({ attrs: { class: tw`text-sm` } }, [profile.name]) : null,
          profile.email ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [profile.email]) : null,
          profile.badge ? UI.Badge({ text: profile.badge, variant: 'badge/ghost', attrs: { class: tw`text-[0.65rem]` } }) : null
        ].filter(Boolean))
      ].filter(Boolean));

      const nav = items.length
        ? D.Containers.Div({ attrs: { class: 'mobile-menu-items' } }, items.map((entry, index) => {
            const item = ensureDict(entry);
            const id = mobilePageKey(item, `page-${index}`);
            const active = id === activePage;
            return D.Forms.Button({
              attrs: {
                type: 'button',
                class: cx('mobile-menu-item', active && 'is-active'),
                gkey: 'mobile:page:select',
                'data-page-id': id
              }
            }, [
              D.Containers.Div({ attrs: { class: 'item-label' } }, [
                item.icon ? D.Containers.Div({ attrs: { class: 'item-icon' } }, [item.icon]) : null,
                item.label ? D.Text.Span({}, [item.label]) : null
              ].filter(Boolean)),
              active ? D.Text.Span({ attrs: { class: tw`text-xs` } }, ['›']) : null
            ].filter(Boolean));
          }))
        : null;

      const pref = preferences.length
        ? D.Containers.Div({ attrs: { class: 'mobile-menu-preferences' } }, preferences.map((entry, index) => {
            const prefItem = ensureDict(entry);
            return D.Forms.Button({
              attrs: {
                type: 'button',
                class: 'mobile-menu-pref',
                gkey: prefItem.gkey || `mobile:pref:${index}`
              }
            }, [
              D.Containers.Div({ attrs: { class: tw`flex items-center gap-2 text-sm` } }, [
                prefItem.icon ? D.Text.Span({}, [prefItem.icon]) : null,
                prefItem.label ? D.Text.Span({}, [prefItem.label]) : null
              ].filter(Boolean)),
              prefItem.action ? D.Text.Span({ attrs: { class: tw`text-xs text-[var(--muted-foreground)]` } }, [prefItem.action]) : null
            ].filter(Boolean));
          }))
        : null;

      const footerNode = footer.label
        ? D.Containers.Div({ attrs: { class: 'mobile-menu-footer' } }, [
            UI.Button({ attrs: { gkey: footer.gkey || 'mobile:menu:logout' }, variant: 'ghost', size: 'sm' }, [footer.label])
          ])
        : null;

      const body = D.Containers.Div({ attrs: { class: 'mobile-menu-body' } }, [nav, pref, footerNode].filter(Boolean));

      return UI.Drawer({
        open,
        side: menu.side || 'start',
        closeGkey: 'mobile:menu:close',
        header,
        content: body
      });
    },

    bottomNav: (ctx) => {
      const { D, ensureDict, toArr, tw, cx } = ctx.helpers;
      const config = ensureDict(ctx.copy.bottomNav);
      const items = toArr(config.items);
      if (!items.length) return null;
      const active = resolveActivePageId(ctx);
      const buttons = items.map((entry, index) => {
        const item = ensureDict(entry);
        const id = mobilePageKey(item, `page-${index}`);
        const activeClass = id === active ? 'is-active' : '';
        return D.Forms.Button({
          attrs: {
            type: 'button',
            class: cx(activeClass),
            gkey: 'mobile:page:select',
            'data-page-id': id
          }
        }, [
          item.icon ? D.Text.Span({ attrs: { class: 'icon' } }, [item.icon]) : null,
          item.label ? D.Text.Span({ attrs: { class: tw`text-[0.7rem]` } }, [item.label]) : null
        ].filter(Boolean));
      });
      return D.Containers.Div({ attrs: { class: 'mobile-bottom-nav' } }, buttons);
    }
  };

  function LayoutMobileNeo(ctx) {
    const { D, tw, cx } = ctx.helpers;
    const status = ctx.render('status');
    const header = ctx.render('header');
    const pageTabs = ctx.render('pageTabs');
    const balance = ctx.render('balance');
    const quick = ctx.render('quickActions');
    const highlights = ctx.render('highlights');
    const transactions = ctx.render('transactions');
    const bottomNav = ctx.render('bottomNav');
    const sideMenu = ctx.render('sideMenu');

    return D.Containers.Div({ attrs: { class: cx('mishkah-mobile', tw`w-full`) } }, [
      D.Containers.Div({ attrs: { class: 'mishkah-mobile-shell' } }, [
        D.Containers.Div({ attrs: { class: 'mishkah-mobile-content' } }, [
          status,
          header,
          pageTabs,
          balance,
          quick,
          highlights,
          transactions,
          bottomNav
        ].filter(Boolean))
      ]),
      sideMenu
    ]);
  }

  const MobileLayouts = { neo: LayoutMobileNeo };

  function LayoutAurora(ctx) {
    const { D, tw, cx } = ctx.helpers;
    const header = ctx.render('header');
    const hero = ctx.render('hero');
    const stats = ctx.render('stats');
    const main = ctx.render('main');
    const cards = ctx.render('cards');
    const sidebar = ctx.render('sidebar');
    const cta = ctx.render('cta');
    const footer = ctx.render('footer');

    const leftColumn = [stats, main, cards, cta].filter(Boolean);
    const rightColumn = sidebar ? [sidebar] : [];

    const grid = (leftColumn.length || rightColumn.length)
      ? D.Containers.Div({ attrs: { class: tw`grid gap-6 lg:grid-cols-[2fr_1fr]` } }, [
          leftColumn.length ? D.Containers.Div({ attrs: { class: tw`space-y-6` } }, leftColumn) : null,
          rightColumn.length ? D.Containers.Div({ attrs: { class: tw`space-y-6` } }, rightColumn) : null
        ].filter(Boolean))
      : null;

    return D.Containers.Div({ attrs: { class: cx('mishkah-template mishkah-template-aurora', tw`flex min-h-screen flex-col`) } }, [
      D.Containers.Main({ attrs: { class: tw`relative z-[1] mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 lg:px-10` } }, [
        header,
        hero,
        grid
      ].filter(Boolean)),
      footer ? D.Containers.Footer({ attrs: { class: tw`relative z-[1] mx-auto w-full max-w-6xl px-6 pb-10 lg:px-10` } }, [footer]) : null
    ].filter(Boolean));
  }

  function LayoutAtlas(ctx) {
    const { D, UI, tw, cx } = ctx.helpers;
    const header = ctx.render('header');
    const hero = ctx.render('hero');
    const stats = ctx.render('stats');
    const main = ctx.render('main');
    const cards = ctx.render('cards');
    const cta = ctx.render('cta');
    const footer = ctx.render('footer');
    const sidebarContent = ctx.render('sidebar');

    const columnMain = [header, hero, stats, main, cards, cta].filter(Boolean);
    const isSidebarOpen = !!(ctx.db.ui && ctx.db.ui.sidebarOpen);

    const overlay = sidebarContent && isSidebarOpen
      ? D.Containers.Div({ attrs: { class: tw`fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden`, gkey: 'templates:sidebar:close' } })
      : null;

    const sidebarPanel = sidebarContent
      ? D.Containers.Aside({ attrs: { class: cx('template-atlas-sidebar', tw`fixed inset-y-0 start-0 z-40 w-[84vw] max-w-sm overflow-y-auto px-6 py-10 transition-transform duration-300 ease-out`, isSidebarOpen ? tw`translate-x-0` : tw`-translate-x-full`, tw`lg:static lg:z-auto lg:h-[calc(100vh-8rem)] lg:w-[320px] lg:translate-x-0 lg:overflow-y-visible lg:rounded-[32px]`) } }, [
          D.Containers.Div({ attrs: { class: tw`space-y-6` } }, [
            D.Containers.Div({ attrs: { class: tw`flex items-center justify-between lg:hidden` } }, [
              D.Text.Strong({ attrs: { class: tw`text-base` } }, [ctx.copy.brand && ctx.copy.brand.name ? ctx.copy.brand.name : 'القائمة']),
              UI.Button({ attrs: { gkey: 'templates:sidebar:close' }, variant: 'ghost', size: 'sm' }, ['✕'])
            ]),
            sidebarContent
          ].filter(Boolean))
        ])
      : null;

    const content = D.Containers.Main({ attrs: { class: tw`relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12 lg:ms-[340px] lg:px-16` } }, columnMain);
    const footerNode = footer ? D.Containers.Footer({ attrs: { class: tw`relative z-10 mx-auto w-full max-w-5xl px-6 pb-10 lg:ms-[340px] lg:px-16` } }, [footer]) : null;

    return D.Containers.Div({ attrs: { class: cx('mishkah-template mishkah-template-atlas', tw`relative flex min-h-screen flex-col`) } }, [
      overlay,
      sidebarPanel,
      content,
      footerNode
    ].filter(Boolean));
  }

  function LayoutZen(ctx) {
    const { D, tw, cx } = ctx.helpers;
    const header = ctx.render('header');
    const hero = ctx.render('hero');
    const stats = ctx.render('stats');
    const cards = ctx.render('cards');
    const main = ctx.render('main');
    const cta = ctx.render('cta');
    const footer = ctx.render('footer');

    return D.Containers.Div({ attrs: { class: cx('mishkah-template mishkah-template-zen', tw`flex min-h-screen flex-col`) } }, [
      D.Containers.Main({ attrs: { class: tw`relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-14 text-center` } }, [
        header ? D.Containers.Div({ attrs: { class: tw`mx-auto max-w-3xl` } }, [header]) : null,
        hero,
        stats ? D.Containers.Div({ attrs: { class: tw`mx-auto max-w-3xl` } }, [stats]) : null,
        cards,
        main,
        cta
      ].filter(Boolean)),
      footer ? D.Containers.Footer({ attrs: { class: tw`relative z-10 mx-auto w-full max-w-4xl px-6 pb-12 text-center` } }, [footer]) : null
    ].filter(Boolean));
  }

  const Layouts = {
    aurora: LayoutAurora,
    atlas: LayoutAtlas,
    zen: LayoutZen
  };

  function dispatchTemplateEvent(type, detail) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(new CustomEvent('mishkah:template', { detail: { type, payload: detail || {} } }));
    } catch (_) { /* ignore */ }
  }

  const TemplateOrders = {
    'templates.sidebar.toggle': {
      on: ['click'], gkeys: ['templates:sidebar:toggle'],
      handler: (_event, ctx) => {
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), sidebarOpen: !state.ui?.sidebarOpen }
        }));
      }
    },
    'templates.sidebar.close': {
      on: ['click'], gkeys: ['templates:sidebar:close'],
      handler: (_event, ctx) => {
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), sidebarOpen: false }
        }));
      }
    },
    'templates.nav.link': {
      on: ['click'], gkeys: ['templates:nav:link'],
      handler: (event) => {
        const el = event.target.closest('[data-link-id]');
        if (!el) return;
        dispatchTemplateEvent('nav:link', {
          id: el.getAttribute('data-link-id') || '',
          href: el.getAttribute('data-href') || ''
        });
      }
    },
    'templates.cta.primary': {
      on: ['click'], gkeys: ['templates:cta:primary'],
      handler: (event) => {
        const target = event.target.closest('[data-link-id]');
        dispatchTemplateEvent('cta:primary', target ? {
          id: target.getAttribute('data-link-id') || ''
        } : {});
      }
    },
    'templates.cta.secondary': {
      on: ['click'], gkeys: ['templates:cta:secondary'],
      handler: (event) => {
        const target = event.target.closest('[data-link-id]');
        dispatchTemplateEvent('cta:secondary', target ? {
          id: target.getAttribute('data-link-id') || ''
        } : {});
      }
    }
  };

  const DashboardOrders = {
    'dashboard.filters.range': {
      on: ['click'], gkeys: ['dashboard:filters:range'],
      handler: (event, ctx) => {
        const target = event.target.closest('[data-range-id]');
        if (!target) return;
        const id = target.getAttribute('data-range-id');
        if (!id) return;
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), activeRange: id }
        }));
        dispatchTemplateEvent('dashboard:filters:range', { id });
      }
    },
    'dashboard.search': {
      on: ['input', 'change'], gkeys: ['dashboard:search'],
      handler: (event) => {
        const value = event && event.target ? event.target.value : '';
        dispatchTemplateEvent('dashboard:search', { value });
      }
    },
    'dashboard.table.action': {
      on: ['click'], gkeys: ['dashboard:table:action'],
      handler: () => {
        dispatchTemplateEvent('dashboard:table:action', {});
      }
    },
    'dashboard.export': {
      on: ['click'], gkeys: ['dashboard:export'],
      handler: () => {
        dispatchTemplateEvent('dashboard:export', {});
      }
    }
  };

  const MobileOrders = {
    'mobile.actions.select': {
      on: ['click'], gkeys: ['mobile:actions:select'],
      handler: (event, ctx) => {
        const btn = event.target.closest('[data-action-id]');
        if (!btn) return;
        const id = btn.getAttribute('data-action-id');
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), activeAction: id }
        }));
        dispatchTemplateEvent('mobile:actions:select', { id });
      }
    },
    'mobile.transactions.all': {
      on: ['click'], gkeys: ['mobile:transactions:all'],
      handler: () => {
        dispatchTemplateEvent('mobile:transactions:all', {});
      }
    },
    'mobile.menu.open': {
      on: ['click'], gkeys: ['mobile:menu:open'],
      handler: (_event, ctx) => {
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), sideMenuOpen: true }
        }));
        dispatchTemplateEvent('mobile:menu:open', {});
      }
    },
    'mobile.menu.close': {
      on: ['click'], gkeys: ['mobile:menu:close'],
      handler: (_event, ctx) => {
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), sideMenuOpen: false }
        }));
        dispatchTemplateEvent('mobile:menu:close', {});
      }
    },
    'mobile.page.select': {
      on: ['click'], gkeys: ['mobile:page:select'],
      handler: (event, ctx) => {
        const target = event.target.closest('[data-page-id]');
        if (!target) return;
        const id = target.getAttribute('data-page-id');
        if (!id) return;
        ctx.setState((state) => ({
          ...state,
          ui: { ...(state.ui || {}), activePage: id, sideMenuOpen: false, activeAction: null }
        }));
        dispatchTemplateEvent('mobile:page:select', { id });
      }
    },
    'mobile.menu.logout': {
      on: ['click'], gkeys: ['mobile:menu:logout'],
      handler: () => {
        dispatchTemplateEvent('mobile:menu:logout', {});
      }
    }
  };

  function toFactory(entry) {
    if (typeof entry === 'function') return entry;
    if (entry == null) return () => null;
    if (Array.isArray(entry)) {
      const clone = entry.slice();
      return () => D.Containers.Div({}, clone.map((item) => (isObj(item) ? cloneNode(item) : D.Text.Span({}, [String(item)]))));
    }
    if (typeof entry === 'string' || typeof entry === 'number') {
      const text = String(entry);
      return () => D.Text.P({}, [text]);
    }
    if (isObj(entry)) {
      const snapshot = cloneNode(entry);
      return () => cloneNode(snapshot);
    }
    return () => null;
  }

  function normalizeSectionsWith(baseSections, overrides) {
    const defaults = {};
    const normalized = {};
    const source = ensureDict(baseSections);
    Object.keys(source).forEach((key) => {
      const fn = toFactory(source[key]);
      defaults[key] = fn;
      normalized[key] = fn;
    });
    const custom = ensureDict(overrides);
    Object.keys(custom).forEach((key) => {
      normalized[key] = toFactory(custom[key]);
    });
    return { normalized, defaults };
  }

  function normalizeSections(overrides) {
    return normalizeSectionsWith(DefaultSections, overrides);
  }

  function resolveLayout(name) {
    const key = String(name || 'aurora').toLowerCase();
    return { key, render: Layouts[key] || Layouts.aurora };
  }

  function resolveDashboardLayout(name) {
    const key = String(name || 'command').toLowerCase();
    return { key, render: DashboardLayouts[key] || DashboardLayouts.command };
  }

  function resolveMobileLayout(name) {
    const key = String(name || 'neo').toLowerCase();
    return { key, render: MobileLayouts[key] || MobileLayouts.neo };
  }

  function buildDefaultDB(cfg) {
    const lang = cfg.lang || 'ar';
    const theme = cfg.theme || 'light';
    const dir = cfg.dir || (lang === 'ar' ? 'rtl' : 'ltr');
    return {
      head: { title: cfg.title || 'Mishkah Template' },
      env: { theme, lang, dir },
      i18n: { lang, fallback: 'en', dict: {} },
      data: {},
      ui: { sidebarOpen: false }
    };
  }

  function buildDashboardDB(cfg, copy) {
    const base = buildDefaultDB(cfg);
    const ui = Object.assign({}, base.ui || {});
    const filters = ensureDict(copy.filters);
    const ranges = Array.isArray(filters.ranges) ? filters.ranges : [];
    ui.activeRange = ui.activeRange || filters.activeRange || (ranges[0] && (ranges[0].id || ranges[0].value)) || '7d';
    base.ui = ui;
    return base;
  }

  function buildMobileDB(cfg, copy) {
    const base = buildDefaultDB(cfg);
    const ui = Object.assign({}, base.ui || {});
    const pages = Array.isArray(copy.pages) ? copy.pages.filter(Boolean) : [];
    if (pages.length) {
      const firstId = mobilePageKey(ensureDict(pages[0]), 'page-0');
      ui.activePage = ui.activePage || firstId;
      const resolved = pages.find((page, index) => mobilePageKey(ensureDict(page), `page-${index}`) === ui.activePage) || ensureDict(pages[0]);
      const actions = Array.isArray(resolved.quickActions) ? resolved.quickActions.filter(Boolean) : [];
      if (!ui.activeAction && actions.length) {
        const firstAction = ensureDict(actions[0]);
        ui.activeAction = firstAction.id || `action-0`;
      }
    } else {
      const actions = Array.isArray(copy.quickActions) ? copy.quickActions.filter(Boolean) : [];
      if (!ui.activeAction && actions.length) {
        const firstAction = ensureDict(actions[0]);
        ui.activeAction = firstAction.id || 'action-0';
      }
    }
    if (typeof ui.sideMenuOpen !== 'boolean') {
      ui.sideMenuOpen = false;
    }
    base.ui = ui;
    return base;
  }

  function buildRenderer(cfg, copy, sections, defaults) {
    const { key, render: layout } = resolveLayout(cfg.layout);
    return function TemplateBody(db) {
      const context = {
        db,
        cfg,
        copy,
        layout: key,
        sections,
        defaults,
        helpers: helperBag,
        render: null
      };
      context.render = function renderSlot(name, fallback) {
        const factory = sections[name];
        let node = null;
        if (typeof factory === 'function') {
          node = factory(context);
        }
        if (!node && typeof fallback === 'function') {
          return fallback(context);
        }
        return node || null;
      };
      return layout(context);
    };
  }

  function buildDashboardRenderer(cfg, copy, sections, defaults) {
    const { key, render } = resolveDashboardLayout(cfg.layout);
    return function DashboardBody(db) {
      const context = {
        db,
        cfg,
        copy,
        layout: key,
        sections,
        defaults,
        helpers: helperBag,
        render: null
      };
      context.render = function renderSlot(name, fallback) {
        const factory = sections[name];
        let node = null;
        if (typeof factory === 'function') node = factory(context);
        if (!node && typeof fallback === 'function') {
          return fallback(context);
        }
        return node || null;
      };
      return render(context);
    };
  }

  function buildMobileRenderer(cfg, copy, sections, defaults) {
    const { key, render } = resolveMobileLayout(cfg.layout);
    return function MobileBody(db) {
      const context = {
        db,
        cfg,
        copy,
        layout: key,
        sections,
        defaults,
        helpers: helperBag,
        render: null
      };
      context.render = function renderSlot(name, fallback) {
        const factory = sections[name];
        let node = null;
        if (typeof factory === 'function') node = factory(context);
        if (!node && typeof fallback === 'function') {
          return fallback(context);
        }
        return node || null;
      };
      return render(context);
    };
  }

  function createTemplateApp(options) {
    const cfg = Object.assign({}, DEFAULT_OPTIONS, ensureDict(options));
    const copy = mergeDeep(DEFAULT_COPY, ensureDict(cfg.copy));
    const { normalized: sections, defaults } = normalizeSections(cfg.sections);
    const renderer = buildRenderer(cfg, copy, sections, defaults);
    injectBaseStyles();

    const database = isObj(cfg.database)
      ? mergeDeep(buildDefaultDB(cfg), cfg.database)
      : buildDefaultDB(cfg);

    M.app.setBody(renderer);
    const orders = Object.assign({}, TemplateOrders, ensureDict(cfg.orders));
    const app = M.app.createApp(database, orders);
    const auto = U.twcss.auto(database, app, { pageScaffold: cfg.scaffold !== false, fonts: cfg.fonts });
    app.setOrders(Object.assign({}, UI.orders, auto.orders, orders));
    app.mount(cfg.mount || '#app');
    if (UI.Chart && typeof UI.Chart.bindApp === 'function') {
      UI.Chart.bindApp(app, cfg.mount || '#app');
    }
    return app;
  }

  function AppPage(config) {
    const cfg = Object.assign({}, DEFAULT_OPTIONS, ensureDict(config));
    const copy = mergeDeep(DEFAULT_COPY, ensureDict(cfg.copy));
    const { normalized: sections, defaults } = normalizeSections(cfg.sections);
    injectBaseStyles();
    return buildRenderer(cfg, copy, sections, defaults);
  }

  function createDashboardApp(options) {
    const cfg = Object.assign({}, DASHBOARD_DEFAULT_OPTIONS, ensureDict(options));
    const copy = mergeDeep(DEFAULT_DASHBOARD_COPY, ensureDict(cfg.copy));
    const { normalized: sections, defaults } = normalizeSectionsWith(DashboardSections, cfg.sections);
    const renderer = buildDashboardRenderer(cfg, copy, sections, defaults);
    injectBaseStyles();

    const database = isObj(cfg.database)
      ? mergeDeep(buildDashboardDB(cfg, copy), cfg.database)
      : buildDashboardDB(cfg, copy);

    M.app.setBody(renderer);
    const orders = Object.assign({}, DashboardOrders, ensureDict(cfg.orders));
    const app = M.app.createApp(database, orders);
    const auto = U.twcss.auto(database, app, { pageScaffold: cfg.scaffold !== false, fonts: cfg.fonts });
    app.setOrders(Object.assign({}, UI.orders, auto.orders, orders));
    app.mount(cfg.mount || '#app');
    if (UI.Chart && typeof UI.Chart.bindApp === 'function') {
      UI.Chart.bindApp(app, cfg.mount || '#app');
    }
    return app;
  }

  function createMobileApp(options) {
    const cfg = Object.assign({}, MOBILE_DEFAULT_OPTIONS, ensureDict(options));
    const copy = mergeDeep(DEFAULT_MOBILE_COPY, ensureDict(cfg.copy));
    const { normalized: sections, defaults } = normalizeSectionsWith(MobileSections, cfg.sections);
    const renderer = buildMobileRenderer(cfg, copy, sections, defaults);
    injectBaseStyles();

    const database = isObj(cfg.database)
      ? mergeDeep(buildMobileDB(cfg, copy), cfg.database)
      : buildMobileDB(cfg, copy);

    M.app.setBody(renderer);
    const orders = Object.assign({}, MobileOrders, ensureDict(cfg.orders));
    const app = M.app.createApp(database, orders);
    const auto = U.twcss.auto(database, app, { pageScaffold: cfg.scaffold !== false, fonts: cfg.fonts });
    app.setOrders(Object.assign({}, UI.orders, auto.orders, orders));
    app.mount(cfg.mount || '#app');
    if (UI.Chart && typeof UI.Chart.bindApp === 'function') {
      UI.Chart.bindApp(app, cfg.mount || '#app');
    }
    return app;
  }

  function DashboardPage(config) {
    const cfg = Object.assign({}, DASHBOARD_DEFAULT_OPTIONS, ensureDict(config));
    const copy = mergeDeep(DEFAULT_DASHBOARD_COPY, ensureDict(cfg.copy));
    const { normalized: sections, defaults } = normalizeSectionsWith(DashboardSections, cfg.sections);
    injectBaseStyles();
    return buildDashboardRenderer(cfg, copy, sections, defaults);
  }

  function MobilePage(config) {
    const cfg = Object.assign({}, MOBILE_DEFAULT_OPTIONS, ensureDict(config));
    const copy = mergeDeep(DEFAULT_MOBILE_COPY, ensureDict(cfg.copy));
    const { normalized: sections, defaults } = normalizeSectionsWith(MobileSections, cfg.sections);
    injectBaseStyles();
    return buildMobileRenderer(cfg, copy, sections, defaults);
  }

  injectBaseStyles();

  const DashboardAPI = {
    defaults: DEFAULT_DASHBOARD_COPY,
    sections: DashboardSections,
    orders: DashboardOrders,
    create: createDashboardApp,
    AppPage: DashboardPage,
    buildDB: (cfg, copy) => buildDashboardDB(cfg || {}, copy || DEFAULT_DASHBOARD_COPY)
  };

  const MobileAPI = {
    defaults: DEFAULT_MOBILE_COPY,
    sections: MobileSections,
    orders: MobileOrders,
    create: createMobileApp,
    AppPage: MobilePage,
    buildDB: (cfg, copy) => buildMobileDB(cfg || {}, copy || DEFAULT_MOBILE_COPY)
  };

  const prevCatalog = (M.Templates && M.Templates.catalog) || {};

  M.Templates = Object.assign(M.Templates || {}, {
    layouts: Layouts,
    sections: DefaultSections,
    orders: TemplateOrders,
    defaultCopy: DEFAULT_COPY,
    create: createTemplateApp,
    bootstrap: createTemplateApp,
    AppPage,
    buildDB: buildDefaultDB,
    dashboard: DashboardAPI,
    mobile: MobileAPI,
    catalog: Object.assign({}, prevCatalog, {
      marketing: {
        create: createTemplateApp,
        AppPage,
        defaults: DEFAULT_COPY,
        sections: DefaultSections,
        orders: TemplateOrders
      },
      dashboard: DashboardAPI,
      mobile: MobileAPI
    })
  });

})(typeof window !== 'undefined' ? window : this);
