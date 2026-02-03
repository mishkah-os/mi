(function () {
  'use strict';

  var global = window;
  var M = global.Mishkah;
  var AppKit = global.AppKit;

  if (!M || !M.DSL || !AppKit) {
    console.error('[Brocker v2] Mishkah core + AppKit are required.');
    return;
  }

  var D = M.DSL;
  var UI = AppKit.UI;
  var Utils = AppKit.Utils;

  var params = new URLSearchParams(global.location.search || '');
  var BRANCH_ID = params.get('branch') || params.get('branchId') || 'aqar';
  var MODULE_ID = params.get('module') || params.get('moduleId') || 'brocker';

  var moduleEntry = global.__BROCKER_MODULE_ENTRY__ || {};
  var db = global.__BROCKER_DB__ || null;

  var PREF_KEY = 'brocker:prefs:v2';
  var PROFILE_KEY = 'brocker:profile:v2';

  function loadJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value || {}));
    } catch (e) {}
  }

  function defaultProfile() {
    return {
      name: '',
      phone: '',
      location: null,
      locationLabel: ''
    };
  }

  var prefs = loadJSON(PREF_KEY) || {};
  var profile = loadJSON(PROFILE_KEY) || defaultProfile();

  var initialLang = prefs.lang || 'ar';
  var initialTheme = prefs.theme || 'dark';
  var initialView = profile && profile.name ? 'home' : 'onboarding';
  var isStandalone = false;
  try {
    isStandalone = (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || !!global.navigator.standalone;
  } catch (e) {}

  function normalizeMediaList(listing) {
    var raw = listing && (listing.media_urls || listing.mediaUrls || listing.images || listing.media);
    if (!raw) return listing && listing.media_url ? [listing.media_url] : [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      var parsed = Utils.safeJSON(raw, null);
      if (Array.isArray(parsed)) return parsed;
      return raw ? [raw] : [];
    }
    return [];
  }

  function createPostFromListing(listing) {
    var mediaUrls = normalizeMediaList(listing);
    return {
      id: listing.id,
      author: listing.broker_name || listing.owner_name || 'Broker',
      caption: listing.headline || listing.title || listing.name || '',
      mediaUrl: listing.primary_media_url || listing.media_url || listing.cover_url,
      mediaUrls: mediaUrls,
      likes: listing.likes_count || 0,
      comments: listing.comments_count || 0,
      date: listing.created_at || ''
    };
  }

  function createReelFromListing(listing) {
    var mediaUrls = normalizeMediaList(listing);
    return {
      id: listing.id,
      title: listing.headline || listing.title || listing.name || 'Reel',
      mediaUrl: listing.primary_media_url || listing.media_url || listing.cover_url,
      coverUrl: listing.primary_media_url || listing.media_url || listing.cover_url,
      mediaUrls: mediaUrls,
      stats: { likes: listing.likes_count || 0, comments: listing.comments_count || 0 }
    };
  }

  function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(Boolean);
  }

  function buildSampleReels(listings) {
    if (listings && listings.length) return listings.slice(0, 6).map(createReelFromListing);
    return [
      { id: 'reel-1', title: 'عرض سريع - ڤيلا حديثة', coverUrl: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=900&q=80', mediaUrl: '', stats: { likes: 86, comments: 12 } },
      { id: 'reel-2', title: 'شقة فندقية بإطلالة بانوراما', coverUrl: 'https://images.unsplash.com/photo-1502005097973-6a7082348e28?auto=format&fit=crop&w=900&q=80', mediaUrl: '', stats: { likes: 129, comments: 19 } },
      { id: 'reel-3', title: 'تاون هاوس - نيو كايرو', coverUrl: 'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=900&q=80', mediaUrl: '', stats: { likes: 64, comments: 8 } }
    ];
  }

  function buildSampleStories() {
    return [
      { id: 'story-1', label: 'العقارات' },
      { id: 'story-2', label: 'Reels' },
      { id: 'story-3', label: 'عروض اليوم' },
      { id: 'story-4', label: 'مطورين' },
      { id: 'story-5', label: 'تقييمات' }
    ];
  }

  function BrandHeader(state) {
    return UI.Header({
      title: state.env.lang === 'ar' ? 'بروكر' : 'Brocker',
      subtitle: state.env.lang === 'ar' ? 'شبكة عقارات اجتماعية' : 'Social real estate network',
      actions: [
        UI.Button({
          class: 'text-sm bg-[var(--mk-surface-2)]',
          gkey: 'pref:toggle-lang'
        }, [state.env.lang === 'ar' ? 'EN' : 'AR']),
        UI.Button({
          class: 'text-sm bg-[var(--mk-surface-2)]',
          gkey: 'pref:toggle-theme'
        }, [state.env.theme === 'dark' ? '☀️' : '🌙'])
      ]
    });
  }

  function OnboardingView(state) {
    return UI.Section({ class: 'space-y-6' }, [
      UI.Card({ class: 'space-y-4' }, [
        D.H2({ attrs: { class: 'text-xl font-bold' } }, [state.env.lang === 'ar' ? 'اشترك خلال ثواني' : 'Instant sign-up'] ),
        D.P({ attrs: { class: 'text-sm text-[var(--mk-muted)] leading-relaxed' } }, [
          state.env.lang === 'ar'
            ? 'ادخل الاسم ورقم الهاتف، واسحب موقعك تلقائياً لنجهز لك تجربة عقارية كاملة.'
            : 'Enter your name and phone, grab your location, and start posting in seconds.'
        ]),
        UI.Input({
          label: state.env.lang === 'ar' ? 'الاسم الكامل' : 'Full Name',
          placeholder: state.env.lang === 'ar' ? 'اكتب اسمك' : 'Your name',
          value: state.data.profile.name,
          class: 'text-base',
          wrapperClass: 'space-y-2',
          key: 'name',
          attrs: {
            'data-field': 'profile.name'
          }
        }),
        UI.Input({
          label: state.env.lang === 'ar' ? 'رقم الهاتف' : 'Phone Number',
          placeholder: state.env.lang === 'ar' ? '01xxxxxxxxx' : '+20',
          value: state.data.profile.phone,
          class: 'text-base',
          wrapperClass: 'space-y-2',
          key: 'phone',
          attrs: {
            'data-field': 'profile.phone'
          }
        }),
        UI.Button({
          class: 'w-full bg-[var(--mk-primary)] text-white',
          gkey: 'location:request'
        }, [state.data.locationLabel ? state.data.locationLabel : (state.env.lang === 'ar' ? 'اسحب اللوكيشن تلقائياً' : 'Fetch location')]),
        UI.Button({
          class: 'w-full bg-[var(--mk-positive)] text-white',
          gkey: 'profile:submit'
        }, [state.env.lang === 'ar' ? 'ابدأ الآن' : 'Start Now'])
      ]),
      UI.Card({}, [
        D.Div({ attrs: { class: 'flex items-center gap-3' } }, [
          D.Div({ attrs: { class: 'text-2xl' } }, ['⚡']),
          D.Div({}, [
            D.H3({ attrs: { class: 'font-semibold' } }, [state.env.lang === 'ar' ? 'Plug & Play' : 'Plug & Play'] ),
            D.P({ attrs: { class: 'text-sm text-[var(--mk-muted)]' } }, [
              state.env.lang === 'ar'
                ? 'هيكل Schema-First جاهز للبناء السريع مع مكونات قابلة لإعادة الاستخدام.'
                : 'Schema-first structure with reusable modules ready for instant apps.'
            ])
          ])
        ])
      ])
    ]);
  }

  function HomeView(state) {
    var posts = normalizeList(state.data.posts || []);
    var listings = normalizeList(state.data.listings || []);
    return D.Div({ attrs: { class: 'space-y-6 pb-6' } }, [
      UI.Section({ title: state.env.lang === 'ar' ? 'ستوريز العقارات' : 'Property stories' }, [
        UI.StoryStrip({ items: buildSampleStories() })
      ]),
      UI.Section({ title: state.env.lang === 'ar' ? 'إعلانات مميزة' : 'Featured listings' }, [
        D.Div({ attrs: { class: 'grid gap-4' } }, listings.slice(0, 4).map(function (listing) {
          return UI.Card({ class: 'space-y-3' }, [
            listing.primary_media_url || listing.cover_url
              ? D.Div({
                attrs: {
                  class: 'h-40 rounded-[var(--mk-radius-md)] bg-cover bg-center',
                  style: 'background-image: url(' + (listing.primary_media_url || listing.cover_url) + ')'
                }
              })
              : null,
            D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
              D.Div({}, [
                D.H3({ attrs: { class: 'font-semibold' } }, [listing.headline || listing.title || listing.name || '']) ,
                D.P({ attrs: { class: 'text-xs text-[var(--mk-muted)]' } }, [listing.region_name || listing.region || ''])
              ]),
              UI.Badge({
                class: 'bg-[var(--mk-primary-weak)] text-[var(--mk-primary)]',
                label: listing.listing_type === 'sale' ? (state.env.lang === 'ar' ? 'للبيع' : 'For Sale') : (state.env.lang === 'ar' ? 'للإيجار' : 'For Rent')
              })
            ]),
            D.Div({ attrs: { class: 'flex items-center justify-between text-sm' } }, [
              D.Span({ attrs: { class: 'font-bold text-[var(--mk-primary)]' } }, [
                listing.price_amount ? Utils.formatNumber(listing.price_amount, state.env.lang === 'ar' ? 'ar-EG' : 'en-US') + ' ' + (listing.currency || 'EGP') : '—'
              ]),
              D.Span({ attrs: { class: 'text-[var(--mk-muted)]' } }, [listing.area || ''])
            ])
          ]);
        }))
      ]),
      UI.Section({ title: state.env.lang === 'ar' ? 'آخر المنشورات' : 'Latest posts' }, [
        D.Div({ attrs: { class: 'grid gap-4' } }, posts.map(function (post) {
          return UI.FeedCard({ post: post });
        }))
      ])
    ]);
  }

  function ReelsView(state) {
    var reels = normalizeList(state.data.reels || []);
    return UI.Section({ title: state.env.lang === 'ar' ? 'ريلز العقارات' : 'Property reels' }, [
      D.Div({ attrs: { class: 'grid gap-4' } }, reels.map(function (reel) {
        return UI.ReelCard({ reel: reel });
      }))
    ]);
  }

  function ComposerView(state) {
    return UI.Section({ title: state.env.lang === 'ar' ? 'أنشئ إعلانك' : 'Create your listing' }, [
      UI.Card({ class: 'space-y-4' }, [
        UI.Input({ label: state.env.lang === 'ar' ? 'عنوان الإعلان' : 'Listing title', placeholder: state.env.lang === 'ar' ? 'مثال: شقة في التجمع الخامس' : 'Ex: Apartment in New Cairo' }),
        UI.Input({ label: state.env.lang === 'ar' ? 'السعر' : 'Price', placeholder: 'EGP 1,000,000' }),
        UI.Input({ label: state.env.lang === 'ar' ? 'الوصف' : 'Description', placeholder: state.env.lang === 'ar' ? 'اكتب التفاصيل' : 'Write details' }),
        UI.Button({ class: 'w-full bg-[var(--mk-primary)] text-white' }, [state.env.lang === 'ar' ? 'نشر الإعلان' : 'Publish'])
      ]),
      UI.Card({ class: 'space-y-3' }, [
        D.H3({ attrs: { class: 'font-semibold' } }, [state.env.lang === 'ar' ? 'أضف ريلز تجريبي' : 'Add a test reel']),
        D.P({ attrs: { class: 'text-sm text-[var(--mk-muted)]' } }, [
          state.env.lang === 'ar'
            ? 'استخدم MediaStreamKit لرفع الفيديو وربطه بالريلز بمجرد توفر خدمة البث.'
            : 'Use MediaStreamKit to upload and bind videos once streaming is enabled.'
        ])
      ])
    ]);
  }

  function ProfileView(state) {
    return UI.Section({ title: state.env.lang === 'ar' ? 'ملفي' : 'Profile' }, [
      UI.Card({ class: 'space-y-3' }, [
        D.Div({ attrs: { class: 'flex items-center gap-4' } }, [
          UI.Avatar({ name: state.data.profile.name || '...' }),
          D.Div({}, [
            D.H3({ attrs: { class: 'font-semibold' } }, [state.data.profile.name || '—'] ),
            D.P({ attrs: { class: 'text-sm text-[var(--mk-muted)]' } }, [state.data.profile.phone || '—'] )
          ])
        ]),
        D.Div({ attrs: { class: 'text-sm text-[var(--mk-muted)]' } }, [state.data.locationLabel || '—'])
      ])
    ]);
  }

  function buildView(state) {
    switch (state.env.view) {
      case 'onboarding':
        return OnboardingView(state);
      case 'reels':
        return ReelsView(state);
      case 'compose':
        return ComposerView(state);
      case 'profile':
        return ProfileView(state);
      default:
        return HomeView(state);
    }
  }

  var app = AppKit.create({
    theme: initialTheme,
    lang: initialLang,
    homeView: initialView,
    mount: '#app',
    env: {
      standalone: isStandalone,
      showInstall: !isStandalone
    },
    data: {
      branchId: BRANCH_ID,
      moduleId: MODULE_ID,
      profile: profile,
      location: profile.location || null,
      locationLabel: profile.locationLabel || '',
      listings: [],
      posts: [],
      reels: [],
      loading: true,
      connected: false
    },
    body: function (state) {
      return UI.Shell({
        header: BrandHeader(state),
        nav: state.env.view === 'onboarding' ? null : UI.TabBar({
          activeId: state.env.view,
          items: [
            { id: 'home', label: state.env.lang === 'ar' ? 'الرئيسية' : 'Home', icon: '🏠', to: 'home' },
            { id: 'reels', label: state.env.lang === 'ar' ? 'ريلز' : 'Reels', icon: '🎬', to: 'reels' },
            { id: 'compose', label: state.env.lang === 'ar' ? 'أضف' : 'Post', icon: '➕', to: 'compose' },
            { id: 'profile', label: state.env.lang === 'ar' ? 'ملفي' : 'Profile', icon: '👤', to: 'profile' }
          ]
        })
      }, [
        state.env.view === 'onboarding'
          ? buildView(state)
          : D.Div({}, [
            UI.InstallBanner({
              visible: !!state.env.showInstall && !state.env.standalone,
              gkey: 'pwa:install',
              closeKey: 'pwa:dismiss',
              title: state.env.lang === 'ar' ? 'ثبت Brocker على الشاشة الرئيسية' : 'Install Brocker',
              subtitle: state.env.lang === 'ar' ? 'تجربة تطبيق حقيقية خلال ثانية.' : 'Get the full app-like experience.'
            }),
            buildView(state)
          ])
      ]);
    },
    orders: {
      'pref:toggle-theme': {
        on: ['click'],
        gkeys: ['pref:toggle-theme'],
        handler: function (e, ctx) {
          ctx.setState(function (prev) {
            var next = Object.assign({}, prev);
            next.env.theme = next.env.theme === 'light' ? 'dark' : 'light';
            saveJSON(PREF_KEY, { lang: next.env.lang, theme: next.env.theme });
            return next;
          });
        }
      },
      'pref:toggle-lang': {
        on: ['click'],
        gkeys: ['pref:toggle-lang'],
        handler: function (e, ctx) {
          ctx.setState(function (prev) {
            var next = Object.assign({}, prev);
            next.env.lang = next.env.lang === 'ar' ? 'en' : 'ar';
            next.env.dir = next.env.lang === 'ar' ? 'rtl' : 'ltr';
            saveJSON(PREF_KEY, { lang: next.env.lang, theme: next.env.theme });
            return next;
          });
          setTimeout(function () {
            global.location.reload();
          }, 50);
        }
      },
      'location:request': {
        on: ['click'],
        gkeys: ['location:request'],
        handler: function (e, ctx) {
          var currentCoords = null;
          AppKit.Location.getCurrent()
            .then(function (pos) {
              currentCoords = pos.coords || null;
              if (!currentCoords) return null;
              return AppKit.Location.resolveLabel(currentCoords, { googleApiKey: global.__BROCKER_GOOGLE_KEY__ });
            })
            .then(function (label) {
              ctx.setState(function (prev) {
                var next = Object.assign({}, prev);
                next.data.location = currentCoords || next.data.location || null;
                next.data.locationLabel = label || next.data.locationLabel;
                return next;
              });
            })
            .catch(function () {
              ctx.setState(function (prev) {
                var next = Object.assign({}, prev);
                next.data.locationLabel = next.data.locationLabel || (next.env.lang === 'ar' ? 'تعذر تحديد الموقع' : 'Location unavailable');
                return next;
              });
            });
        }
      },
      'profile:submit': {
        on: ['click'],
        gkeys: ['profile:submit'],
        handler: function (e, ctx) {
          ctx.setState(function (prev) {
            var next = Object.assign({}, prev);
            if (!next.data.profile.name || !next.data.profile.phone) {
              next.env.toast = next.env.lang === 'ar' ? 'اكمل البيانات المطلوبة' : 'Please complete the form';
              return next;
            }
            var updated = Object.assign({}, next.data.profile, {
              locationLabel: next.data.locationLabel,
              location: next.data.location
            });
            saveJSON(PROFILE_KEY, updated);
            next.data.profile = updated;
            next.env.view = 'home';
            return next;
          });
        }
      },
      'pwa:install': {
        on: ['click'],
        gkeys: ['pwa:install'],
        handler: function (e, ctx) {
          if (!ctx.getState || !ctx.setState) return;
          var promptEvent = ctx.getState().env.installPrompt;
          if (!promptEvent) return;
          AppKit.PWA.promptInstall(promptEvent).then(function () {
            ctx.setState(function (prev) {
              var next = Object.assign({}, prev);
              next.env.installPrompt = null;
              return next;
            });
          });
        }
      },
      'pwa:dismiss': {
        on: ['click'],
        gkeys: ['pwa:dismiss'],
        handler: function (e, ctx) {
          ctx.setState(function (prev) {
            var next = Object.assign({}, prev);
            next.env.showInstall = false;
            return next;
          });
        }
      }
    }
  });

  function attachInputHandlers() {
    var root = global.document.getElementById('app');
    if (!root) return;
    root.addEventListener('input', function (e) {
      var field = e.target.getAttribute('data-field');
      if (!field) return;
      app.setState(function (prev) {
        var next = Object.assign({}, prev);
        if (field === 'profile.name') next.data.profile.name = e.target.value;
        if (field === 'profile.phone') next.data.profile.phone = e.target.value;
        return next;
      });
    });
  }

  function watchTables() {
    if (!db || typeof db.watch !== 'function') return;
    db.watch('listings', function (rows) {
      var listings = normalizeList(rows);
      app.setState(function (prev) {
        var next = Object.assign({}, prev);
        next.data.listings = listings;
        next.data.posts = listings.map(createPostFromListing).slice(0, 6);
        next.data.reels = buildSampleReels(listings);
        next.data.loading = false;
        return next;
      });
    });
    db.status(function (status) {
      app.setState(function (prev) {
        var next = Object.assign({}, prev);
        next.data.connected = status === 'ready' || status === 'connected';
        return next;
      });
    });
  }

  AppKit.PWA.watchInstallPrompt(function (promptEvent) {
    app.setState(function (prev) {
      var next = Object.assign({}, prev);
      next.env.installPrompt = promptEvent;
      if (!next.env.standalone) next.env.showInstall = true;
      return next;
    });
  });

  AppKit.PWA.registerServiceWorker();
  attachInputHandlers();
  watchTables();
})();
