'use strict';

// Wait for all dependencies to load
function initMishkahLab() {
    if (!window.Mishkah || !window.Mishkah.app || !window.Mishkah.UI || !window.Mishkah.UI.CodeMirror || !window.EXAMPLES) {
        setTimeout(initMishkahLab, 50);
        return;
    }
    startApp();
}

function startApp() {
    const M = window.Mishkah;
    const D = M.DSL;
    const MDB = window.MishkahIndexedDB;
    const EXAMPLES = window.EXAMPLES;
    const FRAMEWORKS = window.FRAMEWORKS;

    // Initialize IndexedDB
    const dbAdapter = MDB.createAdapter({
        dbName: 'mishkah-lab',
        version: 1,
        fallback: 'memory'
    });

    // ============================================================
    // 1. i18n Dictionary
    // ============================================================
    const I18N_DICT = {
        'app.title': { ar: 'مختبر مشكاة', en: 'Mishkah Lab' },
        'examples': { ar: 'الأمثلة', en: 'Examples' },
        'frameworks': { ar: 'الأطر', en: 'Frameworks' },
        'readme': { ar: 'الشرح', en: 'README' },
        'code': { ar: 'الكود', en: 'Code' },
        'preview': { ar: 'المعاينة', en: 'Preview' },
        'run': { ar: 'تشغيل', en: 'Run' },
        'reset': { ar: 'استعادة الأصلي', en: 'Reset Code' },
        'add_example': { ar: 'إضافة مثال', en: 'Add Example' },
        'edit_example': { ar: 'تعديل مثال', en: 'Edit Example' },
        'delete_example': { ar: 'حذف مثال', en: 'Delete Example' },
        'download_json': { ar: 'تصدير JSON', en: 'Download JSON' },
        'import_json': { ar: 'استيراد JSON', en: 'Import JSON' },
        'example_title': { ar: 'عنوان المثال', en: 'Example Title' },
        'example_description': { ar: 'الوصف', en: 'Description' },
        'save': { ar: 'حفظ', en: 'Save' },
        'cancel': { ar: 'إلغاء', en: 'Cancel' },
        'confirm_reset': { ar: 'هل أنت متأكد من استعادة الكود الأصلي؟ سيتم فقدان جميع التغييرات.', en: 'Are you sure you want to reset? All changes will be lost.' }
    };

    // ============================================================
    // 2. Initial State
    // ============================================================
    const database = {
        env: {
            theme: localStorage.getItem('theme') || 'dark',
            lang: localStorage.getItem('lang') || 'ar',
            dir: localStorage.getItem('lang') === 'en' ? 'ltr' : 'rtl'
        },
        i18n: {
            dict: I18N_DICT
        },
        activeExample: 'counter',
        activeFramework: 'vanilla',
        code: '', // Will be loaded async
        previewSrc: '',
        showReadme: false,
        activePreviewTab: 'execute', // 'execute' | 'code-wiki' | 'example-info' | 'full-wiki'
        showHistoryModal: false,
        codeHistory: [],
        // Modal State
        showModal: false,
        modalMode: 'add', // 'add' | 'edit'
        modalSize: 'lg',
        modalFrameworks: [],
        modalImplementations: [],
        modalExampleWiki: '',

        // Wiki Data
        wikiArticles: window.codewikidb || [],
        activeWikiId: (window.codewikidb && window.codewikidb[0]?.id) || null,
        wikiPicker: { open: false, targetType: null, targetId: null, search: '' },

        // Persistence State
        examples: [...EXAMPLES], // Start with static, merge dynamic later
        hasUserCode: false // Track if current example has user overrides
    };

    // ============================================================
    // 3. Helper Functions
    // ============================================================

    function t(key, db) {
        return db.i18n?.dict[key]?.[db.env.lang] || key;
    }

    function generatePreview(framework, code) {
        if (framework === 'mishkah-dsl') {
            return `<!DOCTYPE html>
<html>
<head>
    <script src="../lib/mishkah.js" data-ui></script>
    <link rel="stylesheet" href="https://cdn.tailwindcss.com">
</head>
<body>
    <div id="app"></div>
    <script>
        window.addEventListener('load', function() {
            try {
                ${code}
            } catch(e) {
                document.body.innerHTML += '<pre style="color:red">' + e.toString() + '</pre>';
            }
        });
    </script>
</body>
</html>`;
        }
        // For HTMLx, we need to inject the library and render the template
        if (framework === 'mishkah-htmlx') {
            return `<!DOCTYPE html>
<html>
<head>
    <script src="../lib/mishkah.js" data-ui data-htmlx></script>
    <link rel="stylesheet" href="https://cdn.tailwindcss.com">
</head>
<body>
    <div id="app"></div>
    ${code}
    <script>
        window.addEventListener('load', function() {
            // Find the template in the code
            var template = document.querySelector('template#main');
            if (template && window.Mishkah && window.Mishkah.app) {
                Mishkah.app.make({
                    templates: [template],
                    env: { theme: 'dark', lang: 'ar' }
                });
            }
        });
    </script>
</body>
</html>`;
        }
        return code;
    }

    function renderWikiArticle(db, wikiId, options = {}) {
        const articles = db.wikiArticles || window.codewikidb || [];
        const article = articles.find(a => a.id === wikiId);
        const lang = db.env.lang;

        if (!wikiId) {
            return D.Text.P({ attrs: { class: 'p-6 text-center text-sm text-gray-500' } }, [
                lang === 'ar' ? 'لا يوجد معرف ويكي محدد.' : 'No wiki ID provided.'
            ]);
        }

        if (!article) {
            return D.Text.P({ attrs: { class: 'p-6 text-center text-sm text-red-500' } }, [
                lang === 'ar' ? 'المقالة غير موجودة في الويكي.' : 'Wiki article not found.'
            ]);
        }

        const title = article.title?.[lang] || article.title?.en || wikiId;
        const content = article.content?.[lang] || article.content?.en || '';

        const markdown = M.UI?.Markdown
            ? M.UI.Markdown({ content, className: 'prose max-w-none' })
            : D.Containers.RawHtml({ html: content.replace(/\n/g, '<br>') });

        return D.Containers.Div({ attrs: { class: 'p-6 space-y-4' } }, [
            options.hideHeading ? null : D.Text.H3({ attrs: { class: 'text-xl font-semibold' } }, [title]),
            markdown
        ]);
    }

    function getFrameworksForExample(example) {
        if (!example) return [];
        const fromImplementations = Array.isArray(example.implementations)
            ? example.implementations.map(i => i.framework)
            : [];
        const fromCode = example.code ? Object.keys(example.code) : [];
        const fromUser = example.userCode ? Object.keys(example.userCode) : [];
        const unique = Array.from(new Set([...fromImplementations, ...fromCode, ...fromUser]));
        return unique.length ? unique : Object.keys(FRAMEWORKS);
    }

    function pickDefaultFramework(example, activeFramework) {
        const frameworks = getFrameworksForExample(example);
        if (frameworks.includes(activeFramework)) return activeFramework;
        return frameworks[0] || Object.keys(FRAMEWORKS)[0];
    }

    function buildImplementations(example) {
        if (!example) {
            const firstFramework = Object.keys(FRAMEWORKS)[0];
            return [{
                uid: `impl-${Date.now()}`,
                framework: firstFramework,
                code: '',
                wikiId: ''
            }];
        }

        if (Array.isArray(example.implementations) && example.implementations.length) {
            return example.implementations.map((impl, idx) => ({
                uid: `impl-${example.id || 'x'}-${idx}`,
                framework: impl.framework,
                code: impl.code || '',
                wikiId: impl.wikiId || ''
            }));
        }

        const codeEntries = example.code ? Object.entries(example.code) : [];
        if (codeEntries.length === 0) {
            const fallbackFramework = Object.keys(FRAMEWORKS)[0];
            return [{ uid: `impl-${example.id || 'x'}-0`, framework: fallbackFramework, code: '', wikiId: '' }];
        }

        return codeEntries.map(([fw, code], idx) => ({
            uid: `impl-${example.id || 'x'}-${idx}`,
            framework: fw,
            code: typeof code === 'string' ? code : '',
            wikiId: ''
        }));
    }

    // Debounce function for auto-save
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Auto-save with debounce
    const autoSave = debounce(async (exampleId, framework, code, ctx) => {
        if (!exampleId || !framework) return;

        // Save to userCode field in the example
        // Skip if code is invalid or empty
        if (typeof code !== 'string' || code.trim().length === 0) return;

        const saved = await dbAdapter.load('examples');
        const list = Array.isArray(saved?.data) ? saved.data : [];
        const example = list.find(ex => ex.id === exampleId);

        if (example) {
            if (!example.userCode) example.userCode = {};
            example.userCode[framework] = code;
            await dbAdapter.save('examples', list);
        }

        // Update UI to show reset button
        ctx.setState(s => ({ ...s, hasUserCode: true }));
        console.log('Auto-saved code for', exampleId, framework);
        const state = ctx.getState();
        const newHistory = [...state.codeHistory, {
            timestamp: Date.now(),
            code: code,
            framework: framework,
            example: exampleId
        }];
        const trimmedHistory = newHistory.slice(-20); // Keep only last 20
        ctx.setState(s => ({ ...s, codeHistory: trimmedHistory }));

    }, 1000);

    // Initialize database on first load
    async function initializeDatabase() {
        const saved = await dbAdapter.load('examples');

        // If database is empty, initialize with EXAMPLES
        if (!saved || !saved.data || saved.data.length === 0) {
            console.log('🔧 Initializing database for first time...');

            const initialExamples = EXAMPLES.map(ex => ({
                ...ex,
                userCode: { ...ex.code } // Copy code to userCode initially
            }));

            await dbAdapter.save('examples', initialExamples);
            console.log('✅ Database initialized with', initialExamples.length, 'examples');
            return initialExamples;
        }

        return saved.data;
    }

    // Load code (userCode > implementations > fallback)
    async function loadCodeFor(exampleId, framework) {
        const examples = await dbAdapter.load('examples');
        const allExamples = Array.isArray(examples?.data) ? examples.data : [];

        const example = allExamples.find(ex => ex.id === exampleId);
        if (!example) return { code: '', isUser: false };

        // Check userCode first (old structure for backward compatibility)
        const userCode = example.userCode?.[framework];
        if (userCode && userCode.trim().length > 0) {
            return { code: userCode, isUser: true };
        }

        // Fallback to implementations array (new structure)
        if (example.implementations && Array.isArray(example.implementations)) {
            const impl = example.implementations.find(i => i.framework === framework);
            if (impl && impl.code) {
                return { code: impl.code, isUser: false };
            }
        }

        // Fallback to old code object structure (backward compatibility)
        const originalCode = example.code?.[framework];
        return {
            code: typeof originalCode === 'string' ? originalCode : '',
            isUser: false
        };
    }

    // ============================================================
    // 4. Event Handlers
    // ============================================================
    const orders = {
        // ═══════════════════════════════════════════════════════════════
        // المرحلة 2: إضافة Event Handlers (5 handlers)
        // ═══════════════════════════════════════════════════════════════
        // 
        // الخطوات:
        // 1. افتح app.js
        // 2. ابحث عن: 'lang.switch': {
        // 3. اذهب لآخر الhandler (بعد الإغلاق })
        // 4. أضف فاصلة ,
        // 5. الصق الكود التالي قبل }; الأخيرة في const orders
        // ═══════════════════════════════════════════════════════════════

        'code.save_as_standard': {
            on: ['click'],
            gkeys: ['save-standard-btn'],
            handler: async (e, ctx) => {
                const state = ctx.getState();
                const confirmMsg = state.env.lang === 'ar'
                    ? 'هل تريد حفظ الكود الحالي كـ Standard؟ سيتم استبدال الكود الأصلي.'
                    : 'Save current code as Standard? This will replace the original code.';

                if (!confirm(confirmMsg)) return;

                const saved = await dbAdapter.load('examples');
                const list = Array.isArray(saved?.data) ? saved.data : [];
                const example = list.find(ex => ex.id === state.activeExample);

                if (example) {
                    if (example.implementations) {
                        const impl = example.implementations.find(i => i.framework === state.activeFramework);
                        if (impl) impl.code = state.code;
                    } else if (example.code) {
                        example.code[state.activeFramework] = state.code;
                    }

                    if (example.userCode) {
                        delete example.userCode[state.activeFramework];
                    }

                    await dbAdapter.save('examples', list);
                    ctx.setState(s => ({ ...s, hasUserCode: false }));
                    alert(state.env.lang === 'ar' ? 'تم الحفظ!' : 'Saved!');
                }
            }
        },

        'code.history.show': {
            on: ['click'],
            gkeys: ['history-btn'],
            handler: (e, ctx) => {
                ctx.setState(s => ({ ...s, showHistoryModal: true }));
            }
        },

        'code.history.restore': {
            on: ['click'],
            gkeys: ['history-restore-btn'],
            handler: (e, ctx) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const index = parseInt(btn.dataset.index, 10);
                const state = ctx.getState();
                const historyItem = state.codeHistory[index];

                if (historyItem) {
                    ctx.setState(s => ({
                        ...s,
                        code: historyItem.code,
                        showHistoryModal: false,
                        previewSrc: generatePreview(state.activeFramework, historyItem.code)
                    }));

                    window._ignoringCodeMirrorChange = true;

                    if (M.UI.CodeMirror.setValue) {
                        M.UI.CodeMirror.setValue('editor', historyItem.code);
                    }

                    setTimeout(() => {
                        window._ignoringCodeMirrorChange = false;
                    }, 100);
                }
            }
        },

        'code.history.close': {
            on: ['click'],
            gkeys: ['history-close-btn'],
            handler: (e, ctx) => {
                ctx.setState(s => ({ ...s, showHistoryModal: false }));
            }
        },

        'app.reset': {
            on: ['click'],
            gkeys: ['app-reset-btn'],
            handler: async (e, ctx) => {
                const confirmMsg = ctx.getState().env.lang === 'ar'
                    ? 'هل تريد مسح كل البيانات وإعادة التشغيل؟'
                    : 'Clear all data and restart?';

                if (!confirm(confirmMsg)) return;

                await dbAdapter.clear();
                localStorage.clear();
                window.location.reload();
            }
        }
        ,
        'preview.tab.switch': {
            on: ['click'],
            gkeys: ['preview-tab-btn'],
            handler: (e, ctx) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const tab = btn.dataset.tab;
                ctx.setState(s => ({ ...s, activePreviewTab: tab }));
            }
        },
        'wiki.full.select': {
            on: ['input', 'change'],
            gkeys: ['full-wiki-select'],
            handler: (e, ctx) => {
                const value = (e.target.value || '').trim();
                ctx.setState(s => ({ ...s, activeWikiId: value || s.activeWikiId }));
            }
        },
        'wiki.picker.open': {
            on: ['click'],
            gkeys: ['open-wiki-picker'],
            handler: (e, ctx) => {
                const targetType = e.target?.dataset?.targetType;
                const targetId = e.target?.dataset?.targetId || null;
                ctx.setState(s => ({
                    ...s,
                    wikiPicker: {
                        open: true,
                        targetType,
                        targetId,
                        search: ''
                    }
                }));
            }
        },
        'wiki.picker.close': {
            on: ['click'],
            gkeys: ['close-wiki-picker'],
            handler: (e, ctx) => ctx.setState(s => ({
                ...s,
                wikiPicker: { open: false, targetType: null, targetId: null, search: '' }
            }))
        },
        'wiki.picker.search': {
            on: ['input'],
            gkeys: ['wiki-picker-search'],
            handler: (e, ctx) => ctx.setState(s => ({
                ...s,
                wikiPicker: { ...s.wikiPicker, search: e.target.value }
            }))
        },
        'wiki.picker.select': {
            on: ['click'],
            gkeys: ['wiki-picker-select'],
            handler: (e, ctx) => {
                const id = e.target?.closest('[data-article-id]')?.dataset?.articleId;
                if (!id) return;
                const state = ctx.getState();
                const picker = state.wikiPicker || {};

                ctx.setState(s => {
                    const nextState = { ...s };
                    if (picker.targetType === 'example') {
                        nextState.modalExampleWiki = id;
                    } else if (picker.targetType === 'impl') {
                        nextState.modalImplementations = s.modalImplementations.map(impl =>
                            impl.uid === picker.targetId ? { ...impl, wikiId: id } : impl
                        );
                    } else if (picker.targetType === 'full') {
                        nextState.activeWikiId = id;
                    }
                    nextState.wikiPicker = { open: false, targetType: null, targetId: null, search: '' };
                    return nextState;
                });
            }
        },
        'app.init': {
            on: ['init'],
            handler: async (e, ctx) => {
                console.log('🔍 [app.init] Starting 1111111111111...');

                // Check if EXAMPLES is loaded
                console.log('🔍 [app.init] EXAMPLES:', window.EXAMPLES);
                if (!window.EXAMPLES || !Array.isArray(window.EXAMPLES) || window.EXAMPLES.length === 0) {
                    console.error('❌ EXAMPLES not loaded yet!');
                    return;
                }

                // Initialize database if empty
                // Initialize database if empty
                console.log('🔍 [app.init] Loading from IndexedDB...');

                // Try to load first
                let currentData = await dbAdapter.load('examples');
                let allExamples = [];

                if (!currentData || !currentData.data || currentData.data.length === 0) {
                    // Initialize if empty
                    console.log('🔧 Initializing database for first time...');
                    allExamples = await initializeDatabase();
                } else {
                    // Use existing data
                    console.log('🔍 [app.init] Found existing data');
                    allExamples = currentData.data;
                }

                console.log('🔍 [app.init] All examples count:', allExamples.length);

                const state = ctx.getState();
                const { code, isUser } = await loadCodeFor(state.activeExample, state.activeFramework);

                ctx.setState(s => ({
                    ...s,
                    examples: allExamples,
                    code: code,
                    hasUserCode: isUser,
                    previewSrc: generatePreview(state.activeFramework, code)
                }));

                // Force CodeMirror update بدون إطلاق onChange
                window._ignoringCodeMirrorChange = true;
                console.log('🔧 [app.init] Forcing CodeMirror update...');
                console.log('🔧 [app.init] Code:', code.length);
                setTimeout(() => {
                    if (M.UI.CodeMirror.setValue) {
                        M.UI.CodeMirror.setValue('editor', code);
                    }

                    // Force refresh to fix layout
                    setTimeout(() => {
                        if (M.UI.CodeMirror.refresh) {
                            M.UI.CodeMirror.refresh('editor');
                        }
                        window._ignoringCodeMirrorChange = false;
                    }, 100);
                }, 50);

                console.log('✅ [app.init] Completed!');
            }
        },

        'code.change': {
            // Triggered by CodeMirror onChange
            handler: (newCode, ctx) => {
                // تجاهل التغييرات أثناء التبديل بين الـ frameworks
                if (window._ignoringCodeMirrorChange) {
                    console.log('[code.change] Ignoring change during framework switch');
                    return;
                }

                const state = ctx.getState();

                // تجاهل DOM events بشكل صامت - handler مش مفروض يتستدعى من DOM
                if (typeof newCode === 'object' && newCode && newCode.type) {
                    // This is a DOM event, ignore silently
                    return;
                }

                // STRICT CHECK: Reject if not a string
                if (typeof newCode !== 'string') {
                    console.warn('[code.change] Ignored non-string value:', typeof newCode);
                    return;
                }

                console.log('[code.change] newCode length:', newCode.length);

                ctx.setState(s => ({ ...s, code: newCode }));
                autoSave(state.activeExample, state.activeFramework, newCode, ctx);
            }
        },

        'code.reset': {
            on: ['click'],
            gkeys: ['reset-btn'],
            handler: async (e, ctx) => {
                const state = ctx.getState();
                if (!confirm(t('confirm_reset', state))) return;

                // Delete userCode for this framework
                const saved = await dbAdapter.load('examples');
                const list = Array.isArray(saved?.data) ? saved.data : [];
                const example = list.find(ex => ex.id === state.activeExample);

                if (example && example.userCode) {
                    delete example.userCode[state.activeFramework];
                    await dbAdapter.save('examples', list);
                }

                // Reload original
                const { code } = await loadCodeFor(state.activeExample, state.activeFramework);

                ctx.setState(s => ({
                    ...s,
                    code: code,
                    hasUserCode: false,
                    previewSrc: generatePreview(state.activeFramework, code)
                }));

                // Force CodeMirror update بدون إطلاق onChange
                window._ignoringCodeMirrorChange = true;

                if (M.UI.CodeMirror.setValue) {
                    M.UI.CodeMirror.setValue('editor', code);
                }

                setTimeout(() => {
                    window._ignoringCodeMirrorChange = false;
                }, 100);
            }
        },

        'example.add': {
            on: ['click'],
            gkeys: ['add-example-btn'],
            handler: (e, ctx) => {
                const defaults = Object.keys(FRAMEWORKS).slice(0, 1);
                const implementations = defaults.map((fw, idx) => ({
                    uid: `impl-new-${idx}-${Date.now()}`,
                    framework: fw,
                    code: '',
                    wikiId: ''
                }));

                ctx.setState(s => ({
                    ...s,
                    showModal: true,
                    modalMode: 'add',
                    modalFrameworks: defaults,
                    modalImplementations: implementations.length ? implementations : buildImplementations(null),
                    modalExampleWiki: ''
                }));
            }
        },

        'example.edit': {
            on: ['click'],
            gkeys: ['edit-example-btn'],
            handler: (e, ctx) => {
                const currentExample = ctx.getState().examples.find(ex => ex.id === ctx.getState().activeExample);
                const fws = getFrameworksForExample(currentExample);
                ctx.setState(s => ({
                    ...s,
                    showModal: true,
                    modalMode: 'edit',
                    modalFrameworks: fws,
                    modalImplementations: buildImplementations(currentExample),
                    modalExampleWiki: currentExample?.wikiId || ''
                }));
            }
        },

        'modal.add_framework': {
            on: ['click'],
            gkeys: ['add-framework-btn'],
            handler: (e, ctx) => {
                ctx.setState(s => {
                    const list = Array.isArray(s.modalImplementations) ? [...s.modalImplementations] : [];
                    const nextFramework = Object.keys(FRAMEWORKS)[list.length % Object.keys(FRAMEWORKS).length] || 'custom';
                    list.push({
                        uid: `impl-${Date.now()}-${list.length}`,
                        framework: nextFramework,
                        code: '',
                        wikiId: ''
                    });
                    return { ...s, modalImplementations: list };
                });
            }
        },

        'modal.remove_framework': {
            on: ['click'],
            gkeys: ['remove-framework-btn'],
            handler: (e, ctx) => {
                const btn = e.target.closest('[data-impl-uid]');
                if (!btn) return;
                const uid = btn.dataset.implUid;
                ctx.setState(s => {
                    const list = Array.isArray(s.modalImplementations) ? s.modalImplementations.filter(impl => impl.uid !== uid) : [];
                    return { ...s, modalImplementations: list.length ? list : buildImplementations(null) };
                });
            }
        },

        'modal.update_impl_field': {
            on: ['input', 'change'],
            gkeys: ['impl-field'],
            handler: (e, ctx) => {
                const target = e.target;
                const uid = target.dataset.implUid;
                const field = target.dataset.field;
                if (!uid || !field) return;

                ctx.setState(s => {
                    const list = Array.isArray(s.modalImplementations) ? [...s.modalImplementations] : [];
                    const idx = list.findIndex(impl => impl.uid === uid);
                    if (idx === -1) return s;
                    const updated = { ...list[idx], [field]: target.value };
                    list[idx] = updated;
                    return { ...s, modalImplementations: list };
                });
            }
        },

        'modal.close': {
            on: ['click'],
            gkeys: ['ui:modal:close', 'close-modal-btn'], // Support both
            handler: (e, ctx) => {
                ctx.setState(s => ({ ...s, showModal: false }));
            }
        },

        'example.save_form': {
            on: ['click'],
            gkeys: ['save-example-btn'],
            handler: async (e, ctx) => {
                const state = ctx.getState();
                const isEdit = state.modalMode === 'edit';
                const rawImplementations = Array.isArray(state.modalImplementations)
                    ? state.modalImplementations
                    : buildImplementations(null);

                // Collect form data
                const titleAr = document.getElementById('title-ar').value;
                const titleEn = document.getElementById('title-en').value;
                const id = isEdit ? state.activeExample : Date.now().toString();
                const readmeAr = document.getElementById('readme-ar');
                const readmeEn = document.getElementById('readme-en');

                const implementations = rawImplementations.map(impl => {
                    const fwInput = document.getElementById(`impl-fw-${impl.uid}`);
                    const wikiInput = document.getElementById(`impl-wiki-${impl.uid}`);
                    const codeInput = document.getElementById(`impl-code-${impl.uid}`);

                    return {
                        framework: (fwInput?.value || impl.framework || '').trim(),
                        code: codeInput ? codeInput.value : (impl.code || ''),
                        wikiId: (wikiInput?.value || impl.wikiId || '').trim()
                    };
                }).filter(item => item.framework && item.code && item.code.trim().length > 0);
                const codeObj = implementations.reduce((acc, impl) => {
                    acc[impl.framework] = impl.code;
                    return acc;
                }, {});

                const exampleWikiId = (document.getElementById('example-wiki-id')?.value || state.modalExampleWiki || '').trim();

                const newExample = {
                    id: id,
                    title: { ar: titleAr, en: titleEn },
                    description: {
                        ar: document.getElementById('desc-ar').value,
                        en: document.getElementById('desc-en').value
                    },
                    wikiId: exampleWikiId,
                    readme: {
                        ar: readmeAr?.value || '',
                        en: readmeEn?.value || ''
                    },
                    code: codeObj,
                    implementations
                };

                // Save to 'examples' table
                const saved = await dbAdapter.load('examples');
                const list = Array.isArray(saved?.data) ? saved.data : [];
                const existing = list.find(ex => ex.id === id);
                if (existing?.userCode) {
                    newExample.userCode = existing.userCode;
                }

                if (isEdit) {
                    const idx = list.findIndex(ex => ex.id === id);
                    if (idx >= 0) list[idx] = newExample;
                    else list.push(newExample);
                } else {
                    list.push(newExample);
                }

                await dbAdapter.save('examples', list);

                // Reload
                const reloaded = await dbAdapter.load('examples');
                const allExamples = [...EXAMPLES, ...(reloaded?.data || [])];

                const nextFramework = implementations.find(impl => impl.framework === state.activeFramework)
                    ? state.activeFramework
                    : (implementations[0]?.framework || state.activeFramework);
                const nextCode = newExample.code[nextFramework] || '';

                ctx.setState(s => ({
                    ...s,
                    showModal: false,
                    examples: allExamples,
                    activeExample: id,
                    activeFramework: nextFramework,
                    activeWikiId: newExample.wikiId || s.activeWikiId,
                    code: nextCode,
                    previewSrc: generatePreview(nextFramework, nextCode)
                }));

                window._ignoringCodeMirrorChange = true;

                if (M.UI.CodeMirror.setValue) {
                    M.UI.CodeMirror.setValue('editor', nextCode);
                }

                setTimeout(() => {
                    window._ignoringCodeMirrorChange = false;
                }, 100);
            }
        },

        'json.download': {
            on: ['click'],
            gkeys: ['download-json-btn'],
            handler: async (e, ctx) => {
                const saved = await dbAdapter.load('examples');
                // Combine built-ins with saved
                const allData = [...EXAMPLES, ...(saved?.data || [])];

                const jsonData = JSON.stringify(allData, null, 2);
                const blob = new Blob([jsonData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'mishkah-lab-examples.json';
                a.click();
                URL.revokeObjectURL(url);
            }
        },

        'json.import': {
            on: ['click'],
            gkeys: ['import-json-btn'],
            handler: (e, ctx) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        if (!Array.isArray(data)) throw new Error('Invalid JSON format');

                        // Merge imported data with existing
                        const current = await dbAdapter.load('examples');
                        const list = Array.isArray(current?.data) ? current.data : [];

                        data.forEach(item => {
                            const exists = list.findIndex(ex => ex.id === item.id);
                            if (exists >= 0) list[exists] = item;
                            else list.push(item);
                        });

                        await dbAdapter.save('examples', list);

                        const saved = await dbAdapter.load('examples');
                        const allExamples = [...EXAMPLES, ...(saved?.data || [])];
                        ctx.setState(s => ({ ...s, examples: allExamples }));
                        alert('Examples imported successfully!');
                    } catch (err) {
                        console.error(err);
                        alert('Failed to import JSON');
                    }
                };
                input.click();
            }
        },

        'example.switch': {
            on: ['click'],
            gkeys: ['ex-btn'],
            handler: async (e, ctx) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const exampleId = btn.dataset.exampleId;
                const state = ctx.getState();
                const nextExample = state.examples.find(ex => ex.id === exampleId);
                const nextFramework = pickDefaultFramework(nextExample, state.activeFramework);
                const { code, isUser } = await loadCodeFor(exampleId, nextFramework);

                ctx.setState(s => ({
                    ...s,
                    activeExample: exampleId,
                    activeFramework: nextFramework,
                    code: code,
                    hasUserCode: isUser,
                    activeWikiId: nextExample?.wikiId || s.activeWikiId,
                    previewSrc: generatePreview(nextFramework, code),
                    showReadme: false
                }));

                // تفعيل flag لمنع onChange أثناء التحديث
                window._ignoringCodeMirrorChange = true;

                if (M.UI.CodeMirror.setValue) {
                    M.UI.CodeMirror.setValue('editor', code);
                }

                // إلغاء flag بعد 100ms
                setTimeout(() => {
                    window._ignoringCodeMirrorChange = false;
                }, 100);
            }
        },

        'framework.switch': {
            on: ['click'],
            gkeys: ['fw-btn'],
            handler: async (e, ctx) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const framework = btn.dataset.framework;
                const state = ctx.getState();

                const { code, isUser } = await loadCodeFor(state.activeExample, framework);
                const lang = FRAMEWORKS[framework]?.lang || 'html';

                ctx.setState(s => ({
                    ...s,
                    activeFramework: framework,
                    code: code,
                    hasUserCode: isUser,
                    previewSrc: generatePreview(framework, code)
                }));


                // Update CodeMirror بدون إطلاق onChange
                setTimeout(() => {
                    // تفعيل flag لتجاهل onChange
                    window._ignoringCodeMirrorChange = true;
                    window._lastCodeMirrorValue = ''; // Reset tracking

                    if (M.UI.CodeMirror.setValue) {
                        // Ensure code is a string
                        const safeCode = typeof code === 'string' ? code : '';
                        M.UI.CodeMirror.setValue('editor', safeCode);

                        // Update mode
                        const instance = M.UI.CodeMirror.getInstance('editor');
                        if (instance) {
                            instance.setOption('mode', lang === 'html' ? 'htmlmixed' : lang);
                        }
                    }

                    // إلغاء flag بعد 100ms للسماح بالـ onChange الطبيعي
                    setTimeout(() => {
                        if (M.UI.CodeMirror.refresh) {
                            M.UI.CodeMirror.refresh('editor');
                        }
                        window._ignoringCodeMirrorChange = false;
                    }, 100);
                }, 50);
            }
        },

        'code.run': {
            on: ['click'],
            gkeys: ['run-btn'],
            handler: (e, ctx) => {
                const state = ctx.getState();
                // Code is already in state due to onChange
                const preview = generatePreview(state.activeFramework, state.code);
                ctx.setState(s => ({
                    ...s,
                    previewSrc: preview
                }));
            }
        },

        'readme.toggle': {
            on: ['click'],
            gkeys: ['readme-btn'],
            handler: (e, ctx) => {
                ctx.setState(s => ({ ...s, showReadme: !s.showReadme }));
                // Render markdown logic...
                setTimeout(() => {
                    const viewer = document.getElementById('readme-viewer');
                    if (viewer) {
                        const state = ctx.getState();
                        const example = state.examples.find(ex => ex.id === state.activeExample);
                        const readme = example?.readme[state.env.lang] || '';
                        viewer.innerHTML = window.marked?.parse ? window.marked.parse(readme) : `<pre>${readme}</pre>`;
                    }
                }, 100);
            }
        },

        'theme.switch': {
            on: ['click'],
            gkeys: ['theme-btn'],
            handler: (e, ctx) => {
                const state = ctx.getState();
                const newTheme = state.env.theme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                ctx.setState(s => ({
                    ...s,
                    env: { ...s.env, theme: newTheme }
                }));
            }
        },

        'lang.switch': {
            on: ['click'],
            gkeys: ['lang-btn'],
            handler: (e, ctx) => {
                const state = ctx.getState();
                const newLang = state.env.lang === 'ar' ? 'en' : 'ar';
                const newDir = newLang === 'ar' ? 'rtl' : 'ltr';
                document.documentElement.setAttribute('lang', newLang);
                document.documentElement.setAttribute('dir', newDir);
                localStorage.setItem('lang', newLang);
                ctx.setState(s => ({
                    ...s,
                    env: { ...s.env, lang: newLang, dir: newDir }
                }));
            }
        }
    };

    // ============================================================
    // 5. UI Components
    // ============================================================

    function Sidebar(db) {
        return D.Containers.Div({
            attrs: {
                class: 'w-64 flex-shrink-0 overflow-auto',
                style: 'background: var(--card); border-right: 1px solid var(--border); height: 100vh;'
            }
        }, [
            D.Containers.Div({
                attrs: {
                    class: 'p-4',
                    style: 'background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white;'
                }
            }, [
                D.Text.H1({
                    attrs: { class: 'text-2xl font-bold' }
                }, [t('app.title', db)])
            ]),

            D.Containers.Div({
                attrs: { class: 'p-4' }
            }, [
                D.Text.H2({
                    attrs: {
                        class: 'text-sm font-bold mb-2 uppercase',
                        style: 'color: var(--muted-foreground);'
                    }
                }, [t('examples', db)]),
                ...db.examples.map(example => {
                    const isActive = example.id === db.activeExample;
                    return D.Forms.Button({
                        attrs: {
                            'gkey': 'ex-btn',
                            'data-example-id': example.id,
                            class: `w-full text-left px-3 py-2 rounded mb-1 transition-colors ${isActive ? 'font-bold' : ''}`,
                            style: isActive
                                ? 'background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white;'
                                : 'background: var(--muted); color: var(--foreground);'
                        }
                    }, [example.title[db.env.lang]]);
                })
            ]),

            D.Containers.Div({
                attrs: {
                    class: 'mt-auto p-4 border-t',
                    style: 'border-color: var(--border);'
                }
            }, [
                // Example actions
                D.Containers.Div({ attrs: { class: 'mb-3' } }, [
                    M.UI.Button({
                        variant: 'outline',
                        size: 'sm',
                        attrs: { 'gkey': 'add-example-btn', class: 'w-full mb-1' }
                    }, ['➕ ', t('add_example', db)]),
                    M.UI.Button({
                        variant: 'outline',
                        size: 'sm',
                        attrs: { 'gkey': 'edit-example-btn', class: 'w-full mb-1' }
                    }, ['✏️ ', t('edit_example', db)]),
                ]),

                // Import/Export
                D.Containers.Div({ attrs: { class: 'mb-3 flex gap-1' } }, [
                    M.UI.Button({
                        variant: 'ghost',
                        size: 'sm',
                        attrs: { 'gkey': 'download-json-btn', class: 'flex-1' }
                    }, ['⬇️']),
                    M.UI.Button({
                        variant: 'ghost',
                        size: 'sm',
                        attrs: { 'gkey': 'import-json-btn', class: 'flex-1' }
                    }, ['⬆️']),
                ]),

                // Theme & Lang
                D.Containers.Div({ attrs: { class: 'mb-2 flex gap-1' } }, [
                    D.Forms.Button({
                        attrs: {
                            'gkey': 'theme-btn',
                            class: 'flex-1 px-2 py-1 rounded text-sm',
                            style: 'background: var(--muted); color: var(--foreground);'
                        }
                    }, [db.env.theme === 'dark' ? '☀️' : '🌙']),
                    D.Forms.Button({
                        attrs: {
                            'gkey': 'lang-btn',
                            class: 'flex-1 px-2 py-1 rounded text-sm',
                            style: 'background: var(--muted); color: var(--foreground);'
                        }
                    }, [db.env.lang === 'ar' ? 'EN' : 'عر'])
                ]),

                // Reset App
                M.UI.Button({
                    variant: 'destructive',
                    size: 'sm',
                    attrs: { 'gkey': 'app-reset-btn', class: 'w-full' }
                }, ['🔄 Reset All'])
            ])

        ]);
    }
    function Toolbar(db) {
        const isWiki = db.activeView === 'wiki';
        const hasWiki = !!db.activeWikiId;
        const example = db.examples.find(ex => ex.id === db.activeExample);

        return D.Containers.Div({
            attrs: {
                class: 'flex items-center justify-between px-4 py-2 border-b',
                style: 'height: 3.5rem; border-color: var(--border); background: var(--card);'
            }
        }, [D.Containers.Div({ attrs: { class: 'flex items-center gap-1 ml-4' } }, [
            db.hasUserCode ? M.UI.Button({
                variant: 'ghost',
                size: 'sm',
                attrs: {
                    'gkey': 'reset-btn',
                    title: t('reset', db)
                }
            }, ['↩️']) : null,

            M.UI.Button({
                variant: 'ghost',
                size: 'sm',
                attrs: {
                    'gkey': 'save-standard-btn',
                    title: db.env.lang === 'ar' ? 'حفظ كـ Standard' : 'Save as Standard'
                }
            }, ['💾']),

            M.UI.Button({
                variant: 'ghost',
                size: 'sm',
                attrs: {
                    'gkey': 'history-btn',
                    title: db.env.lang === 'ar' ? 'السجل' : 'History'
                }
            }, ['📜'])
        ])
            ,
        // Left: Frameworks & Wiki Toggle
        D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
            ...(() => {
                const exampleFrameworks = getFrameworksForExample(example);
                const list = exampleFrameworks.length ? exampleFrameworks : Object.keys(FRAMEWORKS);
                return list;
            })().map(fwId => {
                const fwData = FRAMEWORKS[fwId] || { name: { en: fwId, ar: fwId }, lang: 'html' };
                const isActive = db.activeFramework === fwId;
                return M.UI.Button({
                    variant: isActive ? 'default' : 'ghost',
                    size: 'sm',
                    attrs: {
                        'gkey': 'fw-btn',
                        'data-framework': fwId,
                        style: isActive
                            ? 'border-bottom: 3px solid var(--primary); font-weight: bold;'
                            : 'border-bottom: 3px solid transparent;'
                    }
                }, [fwData.name[db.env.lang]]);
            })

            // Wiki Toggle

        ]),

        // Right: Actions
        D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
            M.UI.Button({
                variant: 'destructive',
                size: 'sm',
                attrs: {
                    'gkey': 'reset-btn',
                    style: db.hasUserCode ? '' : 'display: none;'
                }
            }, [t('reset', db)]),
            //  M.UI.Button({ variant: 'outline', size: 'sm', attrs: { 'gkey': 'add-example-btn' } }, [t('add_example', db)]),
            //  M.UI.Button({ variant: 'outline', size: 'sm', attrs: { 'gkey': 'edit-example-btn' } }, [t('edit_example', db)]),
            // M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'download-json-btn' } }, ['⬇️']),
            // M.UI.Button({ variant: 'ghost', size: 'sm', attrs: { 'gkey': 'import-json-btn' } }, ['⬆️']),
            //   D.Forms.Button({
            //      attrs: {
            //         'gkey': 'run-btn',
            //        class: 'px-6 py-2 rounded font-bold text-white transition-all',
            //       style: 'background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);'
            //   }
            // }, ['▶ ' + t('run', db)])
        ])
        ]);
    }
    function EditorPane(db) {
        // We use M.UI.CodeMirror with onChange handler
        return D.Containers.Div({
            attrs: {
                class: 'flex-1 overflow-hidden',
                style: 'height: calc(100vh - 3.5rem);'
            }
        }, [
            M.UI.CodeMirror({
                id: 'editor',
                value: typeof db.code === 'string' ? db.code : '',
                lang: FRAMEWORKS[db.activeFramework]?.lang || 'html',
                theme: 'dracula',
                height: '100%',
                onChange: (val) => {
                    // Get value from editor instance if val is undefined
                    if (typeof val !== 'string') {
                        const instance = M.UI.CodeMirror.getInstance('editor');
                        val = instance ? instance.getValue() : '';
                    }

                    // Skip if not a valid string or empty
                    if (typeof val !== 'string' || val.trim().length === 0) return;

                    // Prevent duplicate onChange events with same value
                    if (!window._lastCodeMirrorValue) window._lastCodeMirrorValue = '';
                    if (window._lastCodeMirrorValue === val) return;
                    window._lastCodeMirrorValue = val;

                    const event = new CustomEvent('code-change', { detail: val });
                    document.dispatchEvent(event);
                }
            })
        ]);
    }

    // Global listener for code change to bridge CodeMirror and Mishkah State
    // This is a bit of a hack but works for this context
    if (!window._codeChangeListener) {
        window._codeChangeListener = (e) => {
            // Find the app instance and update it
            // We need access to 'app' instance. 
            // We can expose it globally or use a static reference.
            if (window.MishkahApp) {
                const ctx = {
                    getState: window.MishkahApp.getState,
                    setState: window.MishkahApp.setState
                };
                orders['code.change'].handler(e.detail, ctx);
            }
        };
        document.addEventListener('code-change', window._codeChangeListener);
    }

    function PreviewPane(db) {
        const example = db.examples.find(ex => ex.id === db.activeExample);
        const implementation = example?.implementations?.find(
            impl => impl.framework === db.activeFramework
        );

        // Get wiki IDs
        const codeWikiId = implementation?.wikiId || null;
        const exampleWikiId = example?.wikiId || null;
        const wikiOptions = db.wikiArticles || [];
        const fullWikiId = db.activeWikiId || exampleWikiId || wikiOptions[0]?.id || null;

        return D.Containers.Div({
            attrs: {
                class: 'flex-1 flex flex-col overflow-hidden',
                style: 'height: calc(100vh - 3.5rem); border-left: 1px solid var(--border);'
            }
        }, [
            // Tab Buttons Row
            D.Containers.Div({
                attrs: {
                    class: 'flex items-center gap-1 px-3 py-2 border-b',
                    style: 'background: var(--card); border-color: var(--border);'
                }
            }, [
                // Execute Tab
                M.UI.Button({
                    variant: db.activePreviewTab === 'execute' ? 'default' : 'ghost',
                    size: 'sm',
                    attrs: {
                        gkey: 'preview-tab-btn',
                        'data-tab': 'execute'
                    }
                }, ['▶️ ', db.env.lang === 'ar' ? 'تشغيل' : 'Execute']),

                // Code Wiki Tab (only if wikiId exists)
                codeWikiId ? M.UI.Button({
                    variant: db.activePreviewTab === 'code-wiki' ? 'default' : 'ghost',
                    size: 'sm',
                    attrs: {
                        gkey: 'preview-tab-btn',
                        'data-tab': 'code-wiki'
                    }
                }, ['📖 ', db.env.lang === 'ar' ? 'شرح الكود' : 'Code']) : null,

                // Example Info Tab (only if wikiId exists)
                exampleWikiId ? M.UI.Button({
                    variant: db.activePreviewTab === 'example-info' ? 'default' : 'ghost',
                    size: 'sm',
                    attrs: {
                        gkey: 'preview-tab-btn',
                        'data-tab': 'example-info'
                    }
                }, ['ℹ️ ', db.env.lang === 'ar' ? 'المثال' : 'Info']) : null,

                // Full Wiki Tab
                M.UI.Button({
                    variant: db.activePreviewTab === 'full-wiki' ? 'default' : 'ghost',
                    size: 'sm',
                    attrs: {
                        gkey: 'preview-tab-btn',
                        'data-tab': 'full-wiki'
                    }
                }, ['📚 ', db.env.lang === 'ar' ? 'مكتبة' : 'Wiki'])
            ]),

            // Tab Content
            D.Containers.Div({
                attrs: {
                    class: 'flex-1 overflow-auto',
                    style: 'background: var(--background);'
                }
            }, db.activePreviewTab === 'execute' ? [
                // Execute: iframe
                D.Media.Iframe({
                    attrs: {
                        srcdoc: db.previewSrc,
                        class: 'w-full border-none',
                        style: 'min-height: 100%; height: 100%;',
                        sandbox: 'allow-scripts allow-modals allow-same-origin'
                    }
                })
            ] : db.activePreviewTab === 'code-wiki' ? [
                renderWikiArticle(db, codeWikiId)
            ] : db.activePreviewTab === 'example-info' ? [
                renderWikiArticle(db, exampleWikiId)
            ] : db.activePreviewTab === 'full-wiki' ? [
                D.Containers.Div({ attrs: { class: 'p-4 space-y-3' } }, [
                    D.Containers.RawHtml({
                        html: `<datalist id="full-wiki-options">${(wikiOptions || []).map(a => `<option value="${a.id}">${a.title?.[db.env.lang] || a.title?.en || a.id}</option>`).join('')}</datalist>`
                    }),
                    M.UI.Field({
                        id: 'full-wiki-id',
                        label: db.env.lang === 'ar' ? 'مقالة الويكي' : 'Wiki Article',
                        control: D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                            M.UI.Input({
                                attrs: {
                                    id: 'full-wiki-id',
                                    list: 'full-wiki-options',
                                    value: fullWikiId || '',
                                    placeholder: db.env.lang === 'ar' ? 'اختر مقالة' : 'Choose an article',
                                    gkey: 'full-wiki-select'
                                }
                            }),
                            M.UI.Button({
                                attrs: {
                                    gkey: 'open-wiki-picker',
                                    'data-target-type': 'full'
                                },
                                size: 'icon',
                                variant: 'ghost'
                            }, ['🌳'])
                        ])
                    }),
                    renderWikiArticle(db, fullWikiId, { hideHeading: false })
                ])
            ] : [
                D.Text.P({ attrs: { class: 'p-8 text-center' } }, [
                    db.env.lang === 'ar'
                        ? 'لا يوجد محتوى متاح'
                        : 'No content available'
                ])
            ])
        ]);
    }

    function ExampleModal(db) {
        const isEdit = db.modalMode === 'edit';
        const example = isEdit ? db.examples.find(ex => ex.id === db.activeExample) : null;
        const implementations = Array.isArray(db.modalImplementations) && db.modalImplementations.length
            ? db.modalImplementations
            : buildImplementations(example);
        const frameworksOptions = Object.keys(FRAMEWORKS);
        const wikiOptions = Array.from(new Set((window.codewikidb || []).map(a => a.id))).sort();

        // Helper to get value safely
        const val = (path, lang) => {
            if (!isEdit || !example) return '';
            if (lang) return example[path]?.[lang] || '';
            return example[path] || '';
        };

        const codeVal = (fw) => {
            if (!example) return '';
            if (example.userCode?.[fw]) return example.userCode[fw];
            const impl = example.implementations?.find(i => i.framework === fw);
            if (impl?.code) return impl.code;
            if (example.code?.[fw]) return example.code[fw];
            return '';
        };

        const frameworkFields = implementations.map(impl => {
            const label = FRAMEWORKS[impl.framework]?.name?.[db.env.lang] || impl.framework || 'Framework';
            return D.Containers.Div({
                attrs: { class: 'border rounded-md p-3 space-y-2 bg-[var(--muted)]/30' }
            }, [
                D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                    M.UI.Field({
                        id: `impl-fw-${impl.uid}`,
                        label: db.env.lang === 'ar' ? 'الإطار' : 'Framework',
                        control: M.UI.Input({
                            attrs: {
                                id: `impl-fw-${impl.uid}`,
                                list: 'framework-options',
                                value: impl.framework,
                                'data-impl-uid': impl.uid,
                                'data-field': 'framework',
                                gkey: 'impl-field'
                            }
                        })
                    }),
                    M.UI.Button({
                        attrs: { gkey: 'remove-framework-btn', 'data-impl-uid': impl.uid },
                        variant: 'ghost',
                        size: 'sm'
                    }, ['🗑️'])
                ]),

                M.UI.Field({
                    id: `impl-wiki-${impl.uid}`,
                    label: db.env.lang === 'ar' ? 'معرّف الويكي (اختياري)' : 'Wiki ID (optional)',
                    control: D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                        M.UI.Input({
                            attrs: {
                                id: `impl-wiki-${impl.uid}`,
                                list: 'wiki-id-options',
                                placeholder: 'wiki-article-id',
                                value: impl.wikiId || '',
                                'data-impl-uid': impl.uid,
                                'data-field': 'wikiId',
                                gkey: 'impl-field'
                            }
                        }),
                        M.UI.Button({
                            attrs: {
                                gkey: 'open-wiki-picker',
                                'data-target-type': 'impl',
                                'data-target-id': impl.uid
                            },
                            size: 'icon',
                            variant: 'ghost'
                        }, ['📚'])
                    ])
                }),

                M.UI.Field({
                    id: `impl-code-${impl.uid}`,
                    label: label || (db.env.lang === 'ar' ? 'الكود' : 'Code'),
                    control: M.UI.Textarea({
                        attrs: {
                            id: `impl-code-${impl.uid}`,
                            rows: 6,
                            class: 'font-mono text-xs',
                            style: 'min-height: 220px;',
                            value: impl.code || codeVal(impl.framework)
                        }
                    })
                })
            ]);
        });

        const frameworkOptionsList = D.Containers.RawHtml({
            html: `<datalist id="framework-options">${frameworksOptions.map(fw => {
                const label = FRAMEWORKS[fw]?.name?.[db.env.lang] || fw;
                return `<option value="${fw}">${label}</option>`;
            }).join('')}</datalist>`
        });

        const wikiOptionsList = D.Containers.RawHtml({
            html: `<datalist id="wiki-id-options">${wikiOptions.map(id => `<option value="${id}"></option>`).join('')}</datalist>`
        });

        const formContent = D.Containers.Div({ attrs: { class: 'space-y-4' } }, [
            // Title
            D.Containers.Div({ attrs: { class: 'grid grid-cols-2 gap-4' } }, [
                M.UI.Field({ id: 'title-ar', label: 'العنوان (AR)', control: M.UI.Input({ attrs: { id: 'title-ar', value: val('title', 'ar') } }) }),
                M.UI.Field({ id: 'title-en', label: 'Title (EN)', control: M.UI.Input({ attrs: { id: 'title-en', value: val('title', 'en') } }) }),
            ]),

            // Description
            D.Containers.Div({ attrs: { class: 'grid grid-cols-2 gap-4' } }, [
                M.UI.Field({ id: 'desc-ar', label: 'الوصف (AR)', control: M.UI.Input({ attrs: { id: 'desc-ar', value: val('description', 'ar') } }) }),
                M.UI.Field({ id: 'desc-en', label: 'Description (EN)', control: M.UI.Input({ attrs: { id: 'desc-en', value: val('description', 'en') } }) }),
            ]),

            // Example Wiki
            M.UI.Field({
                id: 'example-wiki-id',
                label: db.env.lang === 'ar' ? 'معرّف ويكي المثال' : 'Example Wiki ID',
                control: D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                    M.UI.Input({
                        attrs: {
                            id: 'example-wiki-id',
                            list: 'wiki-id-options',
                            placeholder: db.env.lang === 'ar' ? 'اربط المقالة هنا' : 'Link a wiki article',
                            value: db.modalExampleWiki || ''
                        }
                    }),
                    M.UI.Button({
                        attrs: {
                            gkey: 'open-wiki-picker',
                            'data-target-type': 'example'
                        },
                        size: 'icon',
                        variant: 'ghost'
                    }, ['📚'])
                ])
            }),

            // Framework sections
            frameworkOptionsList,
            wikiOptionsList,
            D.Containers.Div({ attrs: { class: 'flex justify-between items-center' } }, [
                D.Text.P({ attrs: { class: 'text-sm opacity-75' } }, [db.env.lang === 'ar' ? 'أضف إطاراً جديداً أو عدّل القوائم الحالية. يمكنك حذف أي قسم.' : 'Add or edit framework sections. Remove what you do not need.']),
                M.UI.Button({ attrs: { gkey: 'add-framework-btn' }, variant: 'outline', size: 'sm' }, [db.env.lang === 'ar' ? 'إضافة قسم' : 'Add Section'])
            ]),
            D.Containers.Div({ attrs: { class: 'space-y-3' } }, frameworkFields)
        ]);

        return M.UI.Modal({
            open: db.showModal,
            title: isEdit ? t('edit_example', db) : t('add_example', db),
            size: db.modalSize || 'lg',
            sizeKey: 'example-modal', // Enable resizing
            content: formContent,
            actions: [
                M.UI.Button({ attrs: { gkey: 'ui:modal:close' }, variant: 'ghost' }, [t('cancel', db)]),
                M.UI.Button({ attrs: { gkey: 'save-example-btn' }, variant: 'solid' }, [t('save', db)])
            ]
        });
    }

    function WikiPickerModal(db) {
        const picker = db.wikiPicker || {};
        if (!picker.open) return null;

        const lang = db.env.lang;
        const search = (picker.search || '').toLowerCase();
        const articles = db.wikiArticles || [];

        const buildTree = (items) => {
            const map = {};
            const roots = [];
            items.forEach(item => { map[item.id] = { ...item, children: [] }; });
            items.forEach(item => {
                const node = map[item.id];
                const parentId = Array.isArray(item.parents_ids) && item.parents_ids.length
                    ? item.parents_ids[item.parents_ids.length - 1]
                    : null;
                if (parentId && map[parentId]) {
                    map[parentId].children.push(node);
                } else {
                    roots.push(node);
                }
            });
            return roots;
        };

        const filtered = search
            ? articles.filter(a => {
                const title = (a.title?.[lang] || a.title?.en || '').toLowerCase();
                const kw = (a.keywords || []).join(' ').toLowerCase();
                return title.includes(search) || kw.includes(search) || a.id.toLowerCase().includes(search);
            })
            : null;

        const renderTree = (nodes, depth = 0) => nodes
            .sort((a, b) => (a.sort || 999) - (b.sort || 999))
            .map(node => {
                const hasChildren = node.children && node.children.length;
                return D.Containers.Div({ attrs: { class: 'space-y-1', style: `margin-inline-start:${depth * 1}rem` } }, [
                    D.Containers.Div({
                        attrs: {
                            class: 'flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[var(--accent)] cursor-pointer',
                            'data-article-id': node.id,
                            gkey: 'wiki-picker-select'
                        }
                    }, [
                        D.Text.Span({ attrs: { class: 'opacity-60 text-sm' } }, [hasChildren ? '📂' : '📄']),
                        D.Text.Span({ attrs: { class: 'text-sm font-medium' } }, [node.title?.[lang] || node.title?.en || node.id])
                    ]),
                    hasChildren ? D.Containers.Div({}, renderTree(node.children, depth + 1)) : null
                ]);
            });

        const tree = renderTree(buildTree(articles));

        return M.UI.Modal({
            open: true,
            title: lang === 'ar' ? 'اختيار مقالة ويكي' : 'Pick a wiki article',
            size: 'lg',
            content: D.Containers.Div({ attrs: { class: 'space-y-3' } }, [
                D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                    M.UI.Input({
                        attrs: {
                            placeholder: lang === 'ar' ? 'ابحث بعنوان أو كلمة مفتاحية' : 'Search by title or keyword',
                            value: picker.search || '',
                            gkey: 'wiki-picker-search'
                        }
                    }),
                    M.UI.Button({ attrs: { gkey: 'close-wiki-picker' }, variant: 'ghost', size: 'sm' }, [lang === 'ar' ? 'إغلاق' : 'Close'])
                ]),
                D.Containers.Div({ attrs: { class: 'max-h-[60vh] overflow-y-auto rounded border p-3', style: 'border-color: var(--border); background: var(--card);' } }, [
                    filtered ? filtered.map(item => D.Containers.Div({
                        attrs: {
                            class: 'px-2 py-1 rounded hover:bg-[var(--accent)] cursor-pointer flex items-center gap-2',
                            'data-article-id': item.id,
                            gkey: 'wiki-picker-select'
                        }
                    }, [
                        D.Text.Span({ attrs: { class: 'opacity-60 text-sm' } }, ['🔍']),
                        D.Text.Span({ attrs: { class: 'text-sm font-medium' } }, [item.title?.[lang] || item.title?.en || item.id])
                    ])) : tree
                ])
            ])
        });
    }
    function HistoryModal(db) {
        if (!db.showHistoryModal) return null;

        const formattedHistory = db.codeHistory
            .slice()
            .reverse()
            .map((item, index) => ({
                ...item,
                originalIndex: db.codeHistory.length - 1 - index,
                timeStr: new Date(item.timestamp).toLocaleString(
                    db.env.lang === 'ar' ? 'ar-EG' : 'en-US'
                )
            }));

        const content = D.Containers.Div({ attrs: { class: 'space-y-2' } },
            formattedHistory.length === 0 ? [
                D.Text.P({ attrs: { class: 'text-center py-8' } }, [
                    db.env.lang === 'ar' ? 'لا يوجد سجل' : 'No history'
                ])
            ] : formattedHistory.map(item =>
                D.Containers.Div({
                    attrs: {
                        class: 'p-3 border rounded flex items-center justify-between',
                        style: 'border-color: var(--border);'
                    }
                }, [
                    D.Containers.Div({}, [
                        D.Text.P({ attrs: { class: 'font-medium' } }, [
                            item.example + ' - ' + item.framework
                        ]),
                        D.Text.P({ attrs: { class: 'text-sm opacity-70' } }, [
                            item.timeStr
                        ])
                    ]),
                    M.UI.Button({
                        variant: 'outline',
                        size: 'sm',
                        attrs: {
                            gkey: 'history-restore-btn',
                            'data-index': item.originalIndex
                        }
                    }, [db.env.lang === 'ar' ? 'استرجاع' : 'Restore'])
                ])
            )
        );

        return M.UI.Modal({
            open: true,
            title: db.env.lang === 'ar' ? 'سجل التعديلات' : 'Code History',
            size: 'md',
            content: content,
            actions: [
                M.UI.Button({
                    attrs: { gkey: 'history-close-btn' },
                    variant: 'ghost'
                }, [db.env.lang === 'ar' ? 'إغلاق' : 'Close'])
            ]
        });
    }

    function MainLayout(db) {
        const isWiki = db.activeView === 'wiki';

        return D.Containers.Div({
            attrs: {
                class: 'flex w-screen overflow-hidden',
                style: 'height: 100vh; background: var(--background);'
            }
        }, [
            Sidebar(db),
            D.Containers.Div({
                attrs: { class: 'flex-1 flex flex-col min-w-0' }
            }, [
                Toolbar(db),
                D.Containers.Div({
                    attrs: { class: 'flex-1 flex overflow-hidden' }
                }, isWiki ? [
                    M.UI.WikiViewer({
                        db: db,
                        wikiId: db.activeWikiId,
                        onNavigate: (id) => window.Mishkah.app.setState(s => ({ ...s, activeWikiId: id }))
                    })
                ] : [
                    EditorPane(db),
                    PreviewPane(db)
                ])
            ]),
            // Overlays
            ExampleModal(db),
            HistoryModal(db),
            WikiPickerModal(db)
        ]);
    }

    // ============================================================
    // 6. Mount App
    // ============================================================
    const app = M.app.createApp(database, orders);
    window.MishkahApp = app; // Expose for code listener

    M.app.setBody(MainLayout);
    app.mount('#app');

    // Trigger init to load async data
    if (orders['app.init'] && orders['app.init'].handler) {
        orders['app.init'].handler(null, {
            getState: app.getState,
            setState: app.setState
        });
    }

    console.log('✅ Mishkah Lab started successfully');
}

// Start initialization
// Start initialization after Mishkah Auto-Loader is ready
if (window.MishkahAuto && window.MishkahAuto.whenReady) {
    window.MishkahAuto.whenReady.then(function () {
        initMishkahLab();
    });
} else {
    // Fallback if Auto-Loader is not present
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMishkahLab);
    } else {
        initMishkahLab();
    }
}