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
        activePreviewTab: 'result', // 'result' | 'code-wiki' | 'example-wiki'
        showHistoryModal: false,
        codeHistory: [],
        // Modal State
        showModal: false,
        modalMode: 'add', // 'add' | 'edit'
        modalSize: 'lg',

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

                    if (M.UI.CodeMirror.setValue) {
                        M.UI.CodeMirror.setValue('editor', historyItem.code);
                    }
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
        'app.init': {
            on: ['init'],
            handler: async (e, ctx) => {
                console.log('🔍 [app.init] Starting...');

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

                // Force CodeMirror update
                setTimeout(() => {
                    if (M.UI.CodeMirror.setValue) {
                        M.UI.CodeMirror.setValue('editor', code);
                    }
                }, 50);

                console.log('✅ [app.init] Completed!');
            }
        },

        'code.change': {
            // Triggered by CodeMirror onChange
            handler: (newCode, ctx) => {
                const state = ctx.getState();

                // STRICT CHECK: Reject if it's an event object or not a string
                if (typeof newCode === 'object') {
                    console.warn('[code.change] Ignored event object:', newCode);
                    return;
                }

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

                // Force CodeMirror update
                if (M.UI.CodeMirror.setValue) {
                    M.UI.CodeMirror.setValue('editor', code);
                }
            }
        },

        'example.add': {
            on: ['click'],
            gkeys: ['add-example-btn'],
            handler: (e, ctx) => {
                ctx.setState(s => ({ ...s, showModal: true, modalMode: 'add' }));
            }
        },

        'example.edit': {
            on: ['click'],
            gkeys: ['edit-example-btn'],
            handler: (e, ctx) => {
                ctx.setState(s => ({ ...s, showModal: true, modalMode: 'edit' }));
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

                // Collect form data
                const titleAr = document.getElementById('title-ar').value;
                const titleEn = document.getElementById('title-en').value;
                const id = isEdit ? state.activeExample : Date.now().toString();

                const newExample = {
                    id: id,
                    title: { ar: titleAr, en: titleEn },
                    description: {
                        ar: document.getElementById('desc-ar').value,
                        en: document.getElementById('desc-en').value
                    },
                    readme: {
                        ar: document.getElementById('readme-ar').value,
                        en: document.getElementById('readme-en').value
                    },
                    code: {
                        vanilla: document.getElementById('code-vanilla').value,
                        jquery: document.getElementById('code-jquery').value,
                        vue: document.getElementById('code-vue').value,
                        react: document.getElementById('code-react').value,
                        'mishkah-dsl': document.getElementById('code-mishkah-dsl').value,
                        'mishkah-htmlx': document.getElementById('code-mishkah-htmlx').value
                    }
                };

                // Save to 'examples' table
                const saved = await dbAdapter.load('examples');
                const list = Array.isArray(saved?.data) ? saved.data : [];

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

                ctx.setState(s => ({
                    ...s,
                    showModal: false,
                    examples: allExamples,
                    activeExample: id,
                    code: newExample.code[s.activeFramework],
                    previewSrc: generatePreview(s.activeFramework, newExample.code[s.activeFramework])
                }));

                if (M.UI.CodeMirror.setValue) {
                    M.UI.CodeMirror.setValue('editor', newExample.code[state.activeFramework]);
                }
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

                const { code, isUser } = await loadCodeFor(exampleId, state.activeFramework);

                ctx.setState(s => ({
                    ...s,
                    activeExample: exampleId,
                    code: code,
                    hasUserCode: isUser,
                    previewSrc: generatePreview(state.activeFramework, code),
                    showReadme: false
                }));

                if (M.UI.CodeMirror.setValue) {
                    M.UI.CodeMirror.setValue('editor', code);
                }
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

                // Update CodeMirror
                setTimeout(() => {
                    // Reset last value tracking to allow onChange for new framework
                    window._lastCodeMirrorValue = '';

                    if (M.UI.CodeMirror.setValue) {
                        // Ensure code is a string
                        const safeCode = typeof code === 'string' ? code : '';
                        M.UI.CodeMirror.setValue('editor', safeCode);
                        // We might need to update mode too, but M.UI.CodeMirror handles it if we re-render or use instance
                        const instance = M.UI.CodeMirror.getInstance('editor');
                        if (instance) {
                            instance.setOption('mode', lang === 'html' ? 'htmlmixed' : lang);
                        }
                    }
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
            ...Object.keys(FRAMEWORKS).map(fwId => {
                const fwData = FRAMEWORKS[fwId];
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
                class: 'flex-1 overflow-auto',
                style: 'height: calc(100vh - 3.5rem);'
            }
        }, [
            M.UI.CodeMirror({
                id: 'editor',
                value: typeof db.code === 'string' ? db.code : '',
                lang: FRAMEWORKS[db.activeFramework]?.lang || 'html',
                theme: 'dracula',
                height: '100%',
                style: 'height: -webkit-fill-available;',
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
                    style: 'background: white;'
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
            ] : db.activePreviewTab === 'code-wiki' && codeWikiId && M.UI.WikiMini ? [
                // Code Wiki (WikiMini)
                M.UI.WikiMini({
                    wikiId: codeWikiId,
                    lang: db.env.lang
                })
            ] : db.activePreviewTab === 'example-info' && exampleWikiId && M.UI.WikiMini ? [
                // Example Info (WikiMini)
                M.UI.WikiMini({
                    wikiId: exampleWikiId,
                    lang: db.env.lang
                })
            ] : db.activePreviewTab === 'full-wiki' && M.UI.WikiViewer ? [
                // Full Wiki (WikiViewer)
                M.UI.WikiViewer({
                    db: db,
                    wikiId: db.activeWikiId || exampleWikiId, // Fallback to example wiki if no active wiki
                    onNavigate: (id) => {
                        // We need to update state to change the active wiki article
                        // This requires access to the app instance or a way to dispatch
                        if (window.MishkahApp) {
                            window.MishkahApp.setState(s => ({ ...s, activeWikiId: id }));
                        }
                    }
                })
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
        const example = db.examples.find(ex => ex.id === db.activeExample);

        // Helper to get value safely
        const val = (path, lang) => {
            if (!isEdit || !example) return '';
            if (lang) return example[path]?.[lang] || '';
            return example[path] || '';
        };

        const codeVal = (fw) => {
            if (!isEdit || !example) return '';
            return example.code?.[fw] || '';
        };

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
                M.UI.Field({ id: 'code-vanilla', label: 'Vanilla JS', control: M.UI.Textarea({ attrs: { id: 'code-vanilla', rows: 3, class: 'font-mono text-xs', style: 'min-height: 200px;', value: codeVal('vanilla') } }) }),
                M.UI.Field({ id: 'code-jquery', label: 'jQuery', control: M.UI.Textarea({ attrs: { id: 'code-jquery', rows: 3, class: 'font-mono text-xs', style: 'min-height: 200px;', value: codeVal('jquery') } }) }),
                M.UI.Field({ id: 'code-vue', label: 'Vue.js', control: M.UI.Textarea({ attrs: { id: 'code-vue', rows: 3, class: 'font-mono text-xs', style: 'min-height: 200px;', value: codeVal('vue') } }) }),
                M.UI.Field({ id: 'code-react', label: 'React', control: M.UI.Textarea({ attrs: { id: 'code-react', rows: 3, class: 'font-mono text-xs', style: 'min-height: 200px;', value: codeVal('react') } }) }),
                M.UI.Field({ id: 'code-mishkah-dsl', label: 'Mishkah DSL', control: M.UI.Textarea({ attrs: { id: 'code-mishkah-dsl', rows: 3, class: 'font-mono text-xs', style: 'min-height: 200px;', value: codeVal('mishkah-dsl') } }) }),
                M.UI.Field({ id: 'code-mishkah-htmlx', label: 'Mishkah HTMLx', control: M.UI.Textarea({ attrs: { id: 'code-mishkah-htmlx', rows: 3, class: 'font-mono text-xs', style: 'min-height: 200px;', value: codeVal('mishkah-htmlx') } }) }),
            ])
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
            ExampleModal(db)
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