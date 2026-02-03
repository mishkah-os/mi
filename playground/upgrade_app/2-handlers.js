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
