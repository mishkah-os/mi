/**
 * المرحلة 6: استبدال PreviewPane بنظام Tabs
 * 
 * التعليمات:
 * 1. افتح app.js
 * 2. ابحث عن: function PreviewPane(db) {
 * 3. احذف الfunction كاملة من البداية لحد النهاية
 *    (من function PreviewPane(db) { لحد آخر })
 * 4. استبدلها بالكود التالي:
 */

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
                wikiId: exampleWikiId || codeWikiId,
                onNavigate: (id) => {
                    // Could track navigation if needed
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
