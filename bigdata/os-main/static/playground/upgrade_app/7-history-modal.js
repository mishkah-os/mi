/**
 * المرحلة 7: إضافة HistoryModal Component
 * 
 * التعليمات - جزء 1 (إضافة الComponent):
 * =======================================
 * 1. افتح app.js
 * 2. ابحث عن: function ExampleModal(db) {
 * 3. قبل هذه الfunction (قبل سطر function ExampleModal)
 * 4. أضف الكود التالي:
 */

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

/**
 * التعليمات - جزء 2 (إضافة Modal للLayout):
 * =========================================
 * 1. في نفس الملف app.js
 * 2. ابحث عن: function MainLayout(db) {
 * 3. ابحث عن السطر: ExampleModal(db)
 * 4. بعده مباشرة، أضف فاصلة , ثم سطر جديد
 * 5. اكتب: HistoryModal(db)
 * 
 * النتيجة ستكون:
 * ]),
 * // Overlays
 * ExampleModal(db),
 * HistoryModal(db)
 * ]);
 */
