(function (global) {
    'use strict';

    global.WikiApp = global.WikiApp || {};

    const DB_NAME = 'mishkah-wiki-db';
    const STORE_NAME = 'articles';
    const DB_VERSION = 1;

    // ============================================================
    // i18n Dictionary
    // ============================================================
    const I18N_DICT = {
        'wiki.title': { ar: 'ويكي مشكاة', en: 'Mishkah Wiki' },
        'wiki.new_article': { ar: 'مقالة جديدة', en: 'New Article' },
        'wiki.edit': { ar: 'تعديل', en: 'Edit' },
        'wiki.save': { ar: 'حفظ', en: 'Save' },
        'wiki.cancel': { ar: 'إلغاء', en: 'Cancel' },
        'wiki.delete': { ar: 'حذف', en: 'Delete' },
        'wiki.export': { ar: 'تصدير', en: 'Export' },
        'wiki.import': { ar: 'استيراد', en: 'Import' },
        'wiki.search': { ar: 'بحث...', en: 'Search...' },
        'wiki.no_results': { ar: 'لا توجد نتائج', en: 'No results found' },
        'wiki.no_article': { ar: 'لم يتم اختيار مقالة', en: 'No article selected' },
        'wiki.select_article': { ar: 'اختر مقالة من القائمة', en: 'Select an article from the sidebar' },
        'wiki.related': { ar: 'مقالات ذات صلة', en: 'Related Articles' },
        'wiki.last_updated': { ar: 'آخر تحديث:', en: 'Last updated:' },
        'wiki.confirm_delete': { ar: 'هل أنت متأكد؟', en: 'Are you sure?' },
        'wiki.reset': { ar: 'إعادة تعيين', en: 'Reset Data' },
        'wiki.refresh': { ar: 'تحديث', en: 'Refresh' }
    };

    // ============================================================
    // Database Service
    // ============================================================
    const WikiService = {
        db: null,
        adapter: null,

        async init() {
            const M = global.Mishkah;
            if (!M || !M.utils || !M.utils.IndexedDBX) {
                throw new Error('Mishkah IndexedDBX not loaded');
            }

            const factory = M.utils.MishkahIndexedDB || window.MishkahIndexedDB;
            if (factory && factory.createAdapter) {
                this.adapter = factory.createAdapter({
                    name: DB_NAME,
                    storeName: STORE_NAME,
                    version: DB_VERSION
                });
            } else {
                console.warn('WikiService: Adapter factory not found');
                return;
            }

            await this.adapter.ready;

            try {
                const keys = await this.adapter.keys();
                const articleKeys = keys.filter(k => k.startsWith('article:'));
                if (articleKeys.length === 0 && window.codewikidb && Array.isArray(window.codewikidb)) {
                    console.log('[WikiService] Seeding database...');
                    await this.seed(window.codewikidb);
                }
            } catch (e) {
                console.warn('[WikiService] Error seeding:', e);
            }
            return this;
        },

        async getAll() {
            if (!this.adapter) return [];
            try {
                const keys = await this.adapter.keys();
                const articleKeys = keys.filter(k => k.startsWith('article:'));
                const articles = [];
                for (const key of articleKeys) {
                    const record = await this.adapter.load(key);
                    if (record && record.data) {
                        articles.push(record.data);
                    }
                }
                return articles;
            } catch (e) {
                console.error('[WikiService] getAll failed', e);
                return [];
            }
        },

        async save(article, user = 'System') {
            if (!this.adapter) return null;
            const now = Date.now();
            const newRecord = { ...article, updatedAt: now };
            if (!newRecord.history) newRecord.history = [];
            await this.adapter.save(`article:${article.id}`, newRecord);
            return newRecord;
        },

        async delete(id) {
            if (!this.adapter) return;
            await this.adapter.clear(`article:${id}`);
        },

        async seed(data) {
            for (const item of data) {
                await this.save(item, 'System Init');
            }
        },

        async importJSON(jsonString) {
            const data = JSON.parse(jsonString);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                if (item.id && item.title) await this.save(item, 'Import');
            }
        },

        async exportJSON() {
            const articles = await this.getAll();
            return JSON.stringify(articles, null, 2);
        }
    };

    // ============================================================
    // App Controller
    // ============================================================
    global.WikiApp.start = function (rootSelector) {
        const waitForMishkah = (retries = 0) => {
            const M = global.Mishkah;
            const factory = (M && M.utils && M.utils.MishkahIndexedDB) || window.MishkahIndexedDB;

            if (M && M.utils && M.utils.IndexedDBX && M.UI && M.DSL && factory && M.UI.WikiLayout) {
                initApp(rootSelector);
            } else {
                if (retries > 50) {
                    console.error('[WikiApp] Timeout waiting for dependencies');
                    document.querySelector(rootSelector).innerHTML = '<div style="color:red;padding:20px;">Failed to load. Please refresh.</div>';
                    return;
                }
                setTimeout(() => waitForMishkah(retries + 1), 100);
            }
        };
        waitForMishkah();
    };

    async function initApp(rootSelector) {
        const M = global.Mishkah;
        const U = M.utils;

        console.log('[WikiApp] Initializing...');

        try {
            await WikiService.init();
        } catch (e) {
            console.error('[WikiApp] DB Init failed:', e);
        }

        // Initial Data
        const initialArticles = await WikiService.getAll();

        // Parse URL Parameters
        const params = new URLSearchParams(window.location.search);
        const urlWikiId = params.get('wiki');
        const urlLang = params.get('lang');
        const urlTheme = params.get('theme');

        // Load History
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('wiki_history') || '[]');
        } catch (e) { console.warn('Failed to load history', e); }

        // Determine initial article ID
        let initialActiveId = null;
        if (urlWikiId) {
            initialActiveId = urlWikiId;
        } else if (history.length > 0) {
            initialActiveId = history[history.length - 1];
        } else if (initialArticles.length > 0) {
            initialActiveId = initialArticles[0].id;
        }

        const storedLang = urlLang || localStorage.getItem('wiki_lang') || 'en';
        const storedTheme = urlTheme || localStorage.getItem('wiki_theme') || 'light';

        const initialState = {
            env: {
                theme: storedTheme,
                lang: storedLang,
                dir: storedLang === 'ar' ? 'rtl' : 'ltr'
            },
            i18n: {
                dict: I18N_DICT
            },
            articles: initialArticles,
            activeId: initialActiveId,
            viewMode: 'view',
            searchQuery: '',
            sidebarOpen: true,
            expandedNodes: new Set(),
            _formData: {},
            editorDraft: null,
            showEditorModal: false,
            loading: false
        };

        // Apply theme
        document.documentElement.setAttribute('data-theme', storedTheme);
        document.documentElement.className = storedTheme;

        let appInstance = null;

        const parseJsonSafe = (value, fallback) => {
            try {
                const parsed = JSON.parse(value);
                return parsed ?? fallback;
            } catch (e) {
                return fallback;
            }
        };

        const buildArticleFromForm = (formData, activeId) => {
            const toArray = (value) => {
                if (Array.isArray(value)) return value.filter(Boolean);
                return (value || '').split(',').map(v => v.trim()).filter(Boolean);
            };

            const safe = formData || {};
            const id = (safe.id || activeId || `wiki-${Date.now()}`).trim();

            const words = Array.isArray(safe.words)
                ? safe.words
                    .filter(w => w && w.term && w.target)
                    .map(w => ({ [w.term.trim()]: w.target.trim() }))
                : parseJsonSafe(safe.words || '[]', []);

            const siblings = Array.isArray(safe.siblings)
                ? safe.siblings
                    .filter(s => s && s.id)
                    .map(s => ({ id: s.id.trim(), title: { en: s.title_en || '', ar: s.title_ar || '' } }))
                : parseJsonSafe(safe.siblings || '[]', []);

            return {
                id,
                title: {
                    en: safe.title_en || '',
                    ar: safe.title_ar || ''
                },
                content: {
                    en: safe.content_en || '',
                    ar: safe.content_ar || ''
                },
                keywords: toArray(safe.keywords),
                parents_ids: toArray(safe.parents_ids || safe.parent_ids),
                words,
                siblings,
                sort: Number(safe.sort || 0)
            };
        };

        const actions = {
            setLang: (l) => {
                console.log('[WikiApp] Setting language:', l);
                localStorage.setItem('wiki_lang', l);
                appInstance.setState(s => ({
                    ...s,
                    env: { ...s.env, lang: l, dir: l === 'ar' ? 'rtl' : 'ltr' }
                }));
            },
            setTheme: (t) => {
                console.log('[WikiApp] Setting theme:', t);
                localStorage.setItem('wiki_theme', t);
                document.documentElement.setAttribute('data-theme', t);
                document.documentElement.className = t;
                appInstance.setState(s => ({
                    ...s,
                    env: { ...s.env, theme: t }
                }));
            },
            navigate: (id) => {
                // Save to history
                try {
                    const h = JSON.parse(localStorage.getItem('wiki_history') || '[]');
                    if (h[h.length - 1] !== id) {
                        h.push(id);
                        if (h.length > 50) h.shift();
                        localStorage.setItem('wiki_history', JSON.stringify(h));
                    }
                } catch (e) { }

                appInstance.setState(s => {
                    const next = { ...s, activeId: id, viewMode: 'view' };
                    if (window.innerWidth < 768) next.sidebarOpen = false;
                    return next;
                });
            },
            toggleSidebar: () => {
                console.log('[Wiki] Toggling sidebar');
                appInstance.setState(s => {
                    console.log('[Wiki] Current sidebarOpen:', s.sidebarOpen, '-> New:', !s.sidebarOpen);
                    return { ...s, sidebarOpen: !s.sidebarOpen };
                });
            },
            toggleNode: (id) => appInstance.setState(s => {
                const next = new Set(s.expandedNodes);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return { ...s, expandedNodes: next };
            }),
            expandAll: () => appInstance.setState(s => {
                // Get all IDs that have children
                const allParentIds = new Set();
                s.articles.forEach(article => {
                    if (article.parents_ids && article.parents_ids.length > 0) {
                        article.parents_ids.forEach(parentId => allParentIds.add(parentId));
                    }
                });
                return { ...s, expandedNodes: allParentIds };
            }),
            collapseAll: () => appInstance.setState(s => ({ ...s, expandedNodes: new Set() })),
            edit: async (id) => {
                console.log('[WikiApp] Entering edit mode for ID:', id);

                if (!id) {
                    console.warn('[WikiApp] No active article ID provided for edit');
                    return;
                }

                try {
                    // Load fresh data from IndexedDB (Source of Truth)
                    let article = null;
                    if (WikiService.adapter) {
                        console.log('[WikiApp] Fetching fresh data from DB for:', id);
                        const record = await WikiService.adapter.load(`article:${id}`);
                        if (record && record.data) {
                            article = record.data;
                        }
                    }

                    if (!article) {
                        console.error('[WikiApp] Article not found in DB for edit:', id);
                        return;
                    }

                    // Pre-fill form data with FRESH DB values
                    const formData = {
                        id: article.id,
                        title_en: article.title.en || '',
                        title_ar: article.title.ar || '',
                        content_en: article.content.en || '',
                        content_ar: article.content.ar || '',
                        keywords: article.keywords || [],
                        parents_ids: article.parents_ids || [],
                        words: (article.words || []).map(w => {
                            const key = Object.keys(w || {})[0];
                            return { term: key || '', target: key ? w[key] : '' };
                        }),
                        siblings: (article.siblings || []).map(s => ({ id: s.id || '', title_en: s.title?.en || '', title_ar: s.title?.ar || '' })),
                        sort: article.sort || 0
                    };

                    console.log('[WikiApp] Pre-filled form data from DB:', formData);
                    appInstance.setState(s => ({
                        ...s,
                        viewMode: 'view',
                        activeId: id,
                        _formData: formData,
                        editorDraft: formData,
                        showEditorModal: true
                    }));

                } catch (e) {
                    console.error('[WikiApp] Error loading article for edit:', e);
                }
            },
            cancelEdit: () => appInstance.setState(s => ({ ...s, viewMode: 'view', _formData: {}, editorDraft: null, showEditorModal: false })),
            saveArticle: async (article, user = 'User') => {
                const state = appInstance.getState();
                const source = article || buildArticleFromForm(state.editorDraft || state._formData, state.activeId);
                if (!source.id) {
                    alert('Please set an article ID');
                    return;
                }

                await WikiService.save(source, user);
                const articles = await WikiService.getAll();
                appInstance.setState(s => ({ ...s, articles, viewMode: 'view', activeId: source.id, _formData: {}, editorDraft: null, showEditorModal: false }));
            },
            createArticle: () => appInstance.setState(s => ({
                ...s,
                activeId: null,
                viewMode: 'view',
                editorDraft: {
                    id: '',
                    title_en: '',
                    title_ar: '',
                    content_en: '',
                    content_ar: '',
                    keywords: [],
                    parents_ids: [],
                    words: [],
                    siblings: [],
                    sort: 0
                },
                showEditorModal: true
            })),
            deleteArticle: async (id) => {
                if (!confirm('Are you sure?')) return;
                await WikiService.delete(id);
                const articles = await WikiService.getAll();
                appInstance.setState(s => ({
                    ...s,
                    articles,
                    activeId: articles.length > 0 ? articles[0].id : null,
                    viewMode: 'view'
                }));
            },
            importData: async (file) => {
                const text = await file.text();
                await WikiService.importJSON(text);
                const articles = await WikiService.getAll();
                appInstance.setState(s => ({ ...s, articles }));
            },
            exportData: async () => {
                const json = await WikiService.exportJSON();
                U.IO.download(json, `wiki-backup-${Date.now()}.json`, 'application/json');
            }, resetData: async () => {
                if (!confirm('سيتم دمج البيانات الحالية مع البيانات الأصلية (Cloud/Seed). هل أنت متأكد؟')) return;

                appInstance.setState(s => ({ ...s, loading: true }));

                try {
                    // 1. Backup current DB to Map (to prevent duplicates and allow updates)
                    const currentArticles = await WikiService.getAll();
                    const mergedMap = new Map();

                    // Add current articles to map
                    currentArticles.forEach(a => mergedMap.set(a.id, a));

                    // 2. Get Cloud/Seed Data
                    const cloudData = window.codewikidb || []; // Assuming window.codewikidb is your source

                    // 3. Merge: Update existing IDs and Add new ones
                    cloudData.forEach(cloudArticle => {
                        // This will overwrite if ID exists (Update), or add if it doesn't (New)
                        // If you want to keep local changes for existing IDs, check if mergedMap.has(cloudArticle.id) first.
                        // But usually "Reset/Update" implies taking the source of truth for those IDs.
                        // Here we overwrite with cloud data for these IDs as requested "Update existing".
                        mergedMap.set(cloudArticle.id, cloudArticle);
                    });

                    // 4. Save all merged articles back to DB
                    // We don't clear the DB, so "Old ones" not in cloudData remain untouched in DB 
                    // (unless we explicitly want to save the Map content which we do).
                    // Since WikiService.save updates by ID, we just iterate and save.

                    const finalArticles = Array.from(mergedMap.values());

                    // Optional: Clear DB first if you want to ensure *only* the merged list exists 
                    // (cleaner but "leaves old ones" implies we just want to ensure the map content is there).
                    // If we don't clear, and just save, it's safer.

                    for (const article of finalArticles) {
                        await WikiService.save(article, 'System Merge');
                    }

                    // 5. Refresh State
                    const updatedArticles = await WikiService.getAll();
                    appInstance.setState(s => ({
                        ...s,
                        articles: updatedArticles,
                        loading: false,
                        activeId: updatedArticles.length > 0 ? updatedArticles[0].id : null,
                        viewMode: 'view'
                    }));

                    alert('تم تحديث البيانات ودمجها بنجاح!');

                } catch (e) {
                    console.error('Reset failed:', e);
                    appInstance.setState(s => ({ ...s, loading: false }));
                    alert('حدث خطأ أثناء التحديث.');
                }
            },

            refreshData: async () => {
                appInstance.setState(s => ({ ...s, loading: true }));
                const articles = await WikiService.getAll();
                appInstance.setState(s => ({ ...s, articles, loading: false }));
            },
            search: (q) => appInstance.setState(s => ({ ...s, searchQuery: q }))
        };

        M.app.setBody((state) => {
            if (M.UI && M.UI.WikiLayout) {
                return M.UI.WikiLayout({ state, actions });
            }
            return M.DSL.h('div', {}, ['Loading...']);
        });

        // Wiki Orders (Event Handlers)
        const orders = {
            'wiki:data:reset': {
                on: ['click'],
                gkeys: ['wiki:data:reset'],
                handler: (e, ctx) => actions.resetData()
            },
            'wiki:data:refresh': {
                on: ['click'],
                gkeys: ['wiki:data:refresh'],
                handler: (e, ctx) => actions.refreshData()
            },
            'wiki:sidebar:toggle': {
                on: ['click'],
                gkeys: ['wiki:sidebar:toggle'],
                handler: (e, ctx) => actions.toggleSidebar()
            },
            'wiki:sidebar:close': {
                on: ['click'],
                gkeys: ['wiki:sidebar:close'],
                handler: (e, ctx) => actions.toggleSidebar()
            },
            'wiki:theme:toggle': {
                on: ['click'],
                gkeys: ['wiki:theme:toggle'],
                handler: (e, ctx) => actions.setTheme(ctx.getState().env.theme === 'dark' ? 'light' : 'dark')
            },
            'wiki:lang:toggle': {
                on: ['click'],
                gkeys: ['wiki:lang:toggle'],
                handler: (e, ctx) => actions.setLang(ctx.getState().env.lang === 'ar' ? 'en' : 'ar')
            },
            'wiki:article:navigate': {
                on: ['click'],
                gkeys: ['wiki:article:navigate'],
                handler: (e, ctx) => {
                    const id = e.target.closest('[data-article-id]')?.getAttribute('data-article-id');
                    if (id) actions.navigate(id);
                }
            },
            'wiki:form:input': {
                on: ['input', 'change'],
                gkeys: ['wiki:form:input'],
                handler: (e, ctx) => {
                    const field = e.target.getAttribute('data-field');
                    const value = e.target.value;
                    if (!field) return;
                    ctx.setState(s => ({
                        ...s,
                        _formData: { ...s._formData, [field]: value },
                        editorDraft: { ...(s.editorDraft || {}), [field]: value }
                    }));
                }
            },
            'wiki:form:list-add': {
                on: ['click'],
                gkeys: ['wiki:form:list-add'],
                handler: (e, ctx) => {
                    const field = e.target.getAttribute('data-field');
                    if (!field) return;
                    const input = e.target.closest('div')?.querySelector('input');
                    const typed = input ? (input.value || '').trim() : '';
                    ctx.setState(s => {
                        const draft = { ...(s.editorDraft || {}) };
                        const list = Array.isArray(draft[field]) ? draft[field].slice() : [];
                        if (field === 'words' || field === 'siblings') {
                            list.push({});
                        } else if (typed) {
                            list.push(typed);
                        } else {
                            list.push('');
                        }
                        draft[field] = list;
                        return { ...s, editorDraft: draft };
                    });
                    if (input) input.value = '';
                }
            },
            'wiki:form:list-remove': {
                on: ['click'],
                gkeys: ['wiki:form:list-remove'],
                handler: (e, ctx) => {
                    const field = e.target.getAttribute('data-field');
                    const idx = parseInt(e.target.getAttribute('data-index'), 10);
                    if (!field || isNaN(idx)) return;
                    ctx.setState(s => {
                        const draft = { ...(s.editorDraft || {}) };
                        const list = Array.isArray(draft[field]) ? draft[field].slice() : [];
                        list.splice(idx, 1);
                        draft[field] = list;
                        return { ...s, editorDraft: draft };
                    });
                }
            },
            'wiki:form:list-update': {
                on: ['input', 'change'],
                gkeys: ['wiki:form:list-update'],
                handler: (e, ctx) => {
                    const field = e.target.getAttribute('data-field');
                    const idx = parseInt(e.target.getAttribute('data-index'), 10);
                    const prop = e.target.getAttribute('data-prop');
                    if (!field || isNaN(idx)) return;
                    ctx.setState(s => {
                        const draft = { ...(s.editorDraft || {}) };
                        const list = Array.isArray(draft[field]) ? draft[field].slice() : [];
                        if (prop) {
                            const current = { ...(list[idx] || {}) };
                            current[prop] = e.target.value;
                            list[idx] = current;
                        } else {
                            list[idx] = e.target.value;
                        }
                        draft[field] = list;
                        return { ...s, editorDraft: draft };
                    });
                }
            },
            'wiki:node:toggle': {
                on: ['click'],
                gkeys: ['wiki:node:toggle'],
                handler: (e, ctx) => {
                    const id = e.target.closest('[data-node-id]')?.getAttribute('data-node-id');
                    if (id) actions.toggleNode(id);
                }
            },
            'wiki:tree:expand-all': {
                on: ['click'],
                gkeys: ['wiki:tree:expand-all'],
                handler: (e, ctx) => actions.expandAll()
            },
            'wiki:tree:collapse-all': {
                on: ['click'],
                gkeys: ['wiki:tree:collapse-all'],
                handler: (e, ctx) => actions.collapseAll()
            },
            'wiki:article:new': {
                on: ['click'],
                gkeys: ['wiki:article:new'],
                handler: (e, ctx) => actions.createArticle()
            }, 'wiki:article:edit': {
                on: ['click'],
                gkeys: ['wiki:article:edit'],
                handler: (e, ctx) => actions.edit(ctx.getState().activeId)
            },
            'wiki:search': {
                on: ['input'],
                gkeys: ['wiki:search'],
                handler: (e, ctx) => actions.search(e.target.value)
            },
            'wiki:data:export': {
                on: ['click'],
                gkeys: ['wiki:data:export'],
                handler: (e, ctx) => actions.exportData()
            },
            'wiki:data:import': {
                on: ['change'],
                gkeys: ['wiki:data:import'],
                handler: (e, ctx) => {
                    if (e.target.files && e.target.files[0]) {
                        actions.importData(e.target.files[0]);
                    }
                }
            },
            'wiki:link:click': {
                on: ['click'],
                gkeys: ['wiki:link:click'],
                handler: (e, ctx) => {
                    const link = e.target.closest('[data-wiki-link]');
                    if (link) {
                        e.preventDefault();
                        const targetId = link.getAttribute('data-wiki-link');
                        actions.navigate(targetId);
                    }
                }
            },
            'wiki:article:save': {
                on: ['click'],
                gkeys: ['wiki:article:save'],
                handler: () => actions.saveArticle(null, 'User')
            },
            'wiki:article:cancel': {
                on: ['click'],
                gkeys: ['wiki:article:cancel'],
                handler: (e, ctx) => actions.cancelEdit()
            },
            'wiki:article:delete': {
                on: ['click'],
                gkeys: ['wiki:article:delete'],
                handler: (e, ctx) => {
                    const state = ctx.getState();
                    if (state.activeId && confirm(state.env.lang === 'ar' ? 'هل أنت متأكد؟' : 'Are you sure?')) {
                        actions.deleteArticle(state.activeId);
                    }
                }
            }
        };

        appInstance = M.app.createApp(initialState, orders);
        appInstance.mount(rootSelector);
    }

})(window);
