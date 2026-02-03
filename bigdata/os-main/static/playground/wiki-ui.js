(function () {
    'use strict';

    function waitForDSL() {
        if (!window.Mishkah || !window.Mishkah.DSL || !window.Mishkah.utils) {
            setTimeout(waitForDSL, 50);
            return;
        }

        window.M = window.Mishkah;
        window.M.UI = window.M.UI || {};
        const D = window.Mishkah.DSL;
        const U = window.Mishkah.utils;
        const { tw, token } = U.twcss || { tw: (s) => s, token: (s) => s };

        console.log('🔵 wiki-ui.js loaded, starting component definitions...');

        // Helper: Get translation
        function t(key, db) {
            return db?.i18n?.dict[key]?.[db?.env?.lang] || key;
        }

        // Helper: Render markdown to HTML - exactly like mishkah-ui.js
        function renderMarkdown(content) {
            if (!content) return '';
            if (window.marked && window.marked.parse) {
                return window.marked.parse(content);
            }
            return content.replace(/\n/g, '<br>');
        }
        // RawHtml is now available in Core via D.Containers.RawHtml

        // ============================================================
        // WikiLayout
        // ============================================================
        window.M.UI.WikiLayout = function ({ state, actions }) {
            console.log('[WikiUI] Rendering WikiLayout, activeId:', state.activeId);
            const isMobile = window.innerWidth < 768;
            const showSidebar = state.sidebarOpen;
            const dir = state.env.dir;

            return D.Containers.Div({
                attrs: {
                    class: tw`flex h-screen w-full overflow-hidden`,
                    dir: dir,
                    style: 'background-color: var(--background); color: var(--foreground);'
                }
            }, [
                // Mobile Overlay
                D.Containers.Div({
                    attrs: {
                        gkey: 'wiki:sidebar:close',
                        class: tw`fixed inset-0 bg-black/50 z-40`,
                        style: `display: ${(isMobile && showSidebar) ? 'block' : 'none'}`
                    }
                }),

                // Sidebar
                D.Containers.Div({
                    attrs: {
                        class: tw`${isMobile ? 'fixed' : 'relative'} w-64 h-full bg-[var(--card)] border-${dir === 'rtl' ? 'l' : 'r'} border-[var(--border)] z-50 transition-transform duration-300`,
                        style: `transform: ${showSidebar ? 'translateX(0)' : (dir === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)')}`
                    }
                }, [
                    window.M.UI.WikiSidebar({ state, actions, isMobile })
                ]),

                // Main Content
                D.Containers.Div({
                    attrs: {
                        class: tw`flex-1 flex flex-col h-full overflow-hidden`
                    }
                }, [
                    window.M.UI.WikiHeader({ state, actions, isMobile }),
                    D.Containers.Div({
                        attrs: {
                            class: tw`flex-1 overflow-y-auto p-8`
                        }
                    }, [
                        D.Containers.Div({}, [window.M.UI.WikiViewer({ state, actions })]),
                        window.M.UI.WikiEditorModal({ state, actions })
                    ])
                ])
            ]);
        };

        // ============================================================
        // WikiHeader
        // ============================================================
        window.M.UI.WikiHeader = function ({ state, actions, isMobile }) {
            return D.Containers.Div({
                attrs: {
                    class: tw`flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--card)]`
                }
            }, [
                // Left
                D.Containers.Div({
                    attrs: { class: tw`flex items-center gap-4` }
                }, [
                    // Mobile menu button
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:sidebar:toggle',
                            class: tw`${token('btn/ghost')} text-2xl px-2`,
                            style: `display: ${isMobile ? 'flex' : 'none'}; align-items: center; justify-content: center;`
                        }
                    }, ['☰']),
                    D.Text.Span({ attrs: { class: tw`text-2xl` } }, ['📚']),
                    D.Text.H1({
                        attrs: { class: tw`text-xl font-bold bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] bg-clip-text text-transparent` }
                    }, [t('wiki.title', state)])
                ]),

                // Right
                D.Containers.Div({
                    attrs: { class: tw`flex items-center gap-2` }
                }, [
                    // Refresh button
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:data:refresh',
                            class: tw`${token('btn/ghost')} ${token('btn/sm')} text-lg px-2`,
                            title: t('wiki.refresh', state)
                        }
                    }, ['🔄']),

                    // Reset button
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:data:reset',
                            class: tw`${token('btn/ghost')} ${token('btn/sm')} text-lg px-2`,
                            title: t('wiki.reset', state)
                        }
                    }, ['⚠️']),

                    // Language toggle
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:lang:toggle',
                            class: tw`${token('btn/ghost')} ${token('btn/sm')} text-sm px-3 py-1.5`
                        }
                    }, [state.env.lang === 'ar' ? 'EN' : 'عربي']),

                    // Theme toggle - simple toggle button
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:theme:toggle',
                            class: tw`${token('btn/ghost')} text-xl px-2`,
                            style: 'min-width: 2.5rem; display: flex; align-items: center; justify-content: center;'
                        }
                    }, [state.env.theme === 'dark' ? '☀️' : '🌙'])
                ])
            ]);
        };

        // ============================================================
        // WikiSidebar
        // ============================================================
        window.M.UI.WikiSidebar = function ({ state, actions, isMobile }) {
            const lang = state.env.lang;
            const articles = state.articles;
            const expanded = state.expandedNodes || new Set();

            function buildTree(items) {
                const map = {};
                const roots = [];
                items.forEach(item => {
                    map[item.id] = { ...item, children: [] };
                });
                items.forEach(item => {
                    const node = map[item.id];
                    if (item.parents_ids && item.parents_ids.length > 0) {
                        const parentId = item.parents_ids[item.parents_ids.length - 1];
                        if (map[parentId]) {
                            map[parentId].children.push(node);
                        } else {
                            roots.push(node);
                        }
                    } else {
                        roots.push(node);
                    }
                });
                return roots;
            }

            function renderTree(nodes, depth = 0) {
                return nodes.sort((a, b) => (a.sort || 999) - (b.sort || 999)).map(node => {
                    const hasChildren = node.children && node.children.length > 0;
                    const isExpanded = expanded.has(node.id);
                    const isActive = state.activeId === node.id;
                    const title = node.title[lang] || node.title['en'];

                    return D.Containers.Div({
                        attrs: { style: `margin-left: ${depth * 1}rem` }
                    }, [
                        D.Containers.Div({
                            attrs: {
                                class: tw`flex items-center gap-1 px-2 py-1.5 my-0.5 rounded-md transition-all cursor-pointer ${isActive ? 'bg-[var(--secondary)] text-[var(--secondary-foreground)] font-semibold' : 'hover:bg-[var(--accent)]'}`
                            }
                        }, [
                            // Expand/collapse - always render but hide if no children
                            D.Forms.Button({
                                attrs: {
                                    gkey: 'wiki:node:toggle',
                                    'data-node-id': node.id,
                                    class: tw`w-5 h-5 flex items-center justify-center border-0 bg-transparent cursor-pointer text-xs p-0`,
                                    style: `display: ${hasChildren ? 'flex' : 'none'}`
                                }
                            }, [isExpanded ? '▼' : '▶']),

                            // Spacer when no children
                            D.Containers.Div({
                                attrs: {
                                    class: tw`w-5`,
                                    style: `display: ${hasChildren ? 'none' : 'block'}`
                                }
                            }),

                            D.Containers.Div({
                                attrs: {
                                    gkey: 'wiki:article:navigate',
                                    'data-article-id': node.id,
                                    class: tw`flex items-center gap-2 flex-1 cursor-pointer`
                                }
                            }, [
                                D.Text.Span({ attrs: { class: tw`text-base opacity-70` } }, [hasChildren ? '📁' : '📄']),
                                D.Text.Span({ attrs: { class: tw`text-sm` } }, [title])
                            ])
                        ]),

                        // Children container - always render but hide if not expanded
                        D.Containers.Div({
                            attrs: {
                                class: tw`border-l-2 border-[var(--border)] ml-2 pl-1`,
                                style: `display: ${(hasChildren && isExpanded) ? 'block' : 'none'}`
                            }
                        }, hasChildren ? renderTree(node.children, depth + 1) : [])
                    ]);
                });
            }

            const tree = buildTree(articles);

            return D.Containers.Div({
                attrs: { class: tw`w-full h-full flex flex-col` }
            }, [
                // Header
                D.Containers.Div({
                    attrs: { class: tw`p-4 border-b border-[var(--border)]` }
                }, [
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:article:new',
                            class: tw`w-full ${token('btn/solid')} ${token('btn/md')} flex items-center justify-center gap-2 mb-3`
                        }
                    }, [
                        D.Text.Span({ attrs: { class: tw`text-xl` } }, ['+']),
                        D.Text.Span({}, [t('wiki.new_article', state)])
                    ]),
                    D.Containers.Div({
                        attrs: { class: tw`flex gap-2 mb-3` }
                    }, [
                        D.Forms.Button({
                            attrs: {
                                gkey: 'wiki:tree:expand-all',
                                class: tw`flex-1 ${token('btn/ghost')} ${token('btn/sm')} text-xs`
                            }
                        }, [t('wiki.expand_all', state)]),
                        D.Forms.Button({
                            attrs: {
                                gkey: 'wiki:tree:collapse-all',
                                class: tw`flex-1 ${token('btn/ghost')} ${token('btn/sm')} text-xs`
                            }
                        }, [t('wiki.collapse_all', state)])
                    ]),
                    window.M.UI.Input({
                        attrs: {
                            type: 'text',
                            placeholder: t('wiki.search', state),
                            gkey: 'wiki:search',
                            class: tw`${token('input')} w-full`,
                            value: state.searchQuery
                        }
                    })
                ]),

                // Tree
                D.Containers.Div({
                    attrs: { class: tw`flex-1 overflow-y-auto p-2` }
                }, [
                    state.searchQuery
                        ? D.Containers.Div({},
                            articles
                                .filter(a => (a.title[lang] || '').toLowerCase().includes(state.searchQuery.toLowerCase()))
                                .map(a => D.Forms.Button({
                                    attrs: {
                                        gkey: 'wiki:article:navigate',
                                        'data-article-id': a.id,
                                        class: tw`w-full text-left px-2 py-1.5 rounded-md bg-transparent border-0 cursor-pointer text-sm hover:bg-[var(--accent)]`
                                    }
                                }, [a.title[lang] || a.title['en']]))
                        )
                        : D.Containers.Div({}, renderTree(tree))
                ]),

                // Footer
                D.Containers.Div({
                    attrs: { class: tw`p-4 border-t border-[var(--border)] flex gap-2` }
                }, [
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:data:export',
                            class: tw`flex-1 ${token('btn/ghost')} ${token('btn/sm')} text-xs`
                        }
                    }, [t('wiki.export', state)]),
                    D.Forms.Label({
                        attrs: { class: tw`flex-1 ${token('btn/ghost')} ${token('btn/sm')} text-xs text-center cursor-pointer` }
                    }, [
                        t('wiki.import', state),
                        window.M.UI.Input({
                            attrs: {
                                type: 'file',
                                accept: '.json',
                                gkey: 'wiki:data:import',
                                class: tw`hidden`
                            }
                        })
                    ])
                ])
            ]);
        };

        console.log('✅ WikiSidebar defined:', typeof window.M.UI.WikiSidebar);

        // ============================================================
        // WikiViewer
        // ============================================================
        window.M.UI.WikiViewer = function ({ state, actions }) {
            console.log('🚨🚨🚨 [WikiUI] WikiViewer ENTERED AT 09:51! state:', !!state, 'articles:', state?.articles?.length);

            try {
                const article = state.articles.find(a => a.id === state.activeId);
                const lang = state.env.lang;

                console.log('[WikiUI] WikiViewer - activeId:', state.activeId, 'article found:', !!article);

                if (!article) {
                    return D.Containers.Div({
                        attrs: {
                            class: tw`flex flex-col items-center justify-center h-full ${token('muted')}`
                        }
                    }, [
                        D.Text.Span({ attrs: { class: tw`text-6xl opacity-20 mb-4` } }, ['📚']),
                        D.Text.H3({ attrs: { class: tw`text-2xl font-semibold mb-2` } }, [t('wiki.no_article', state)]),
                        D.Text.P({ attrs: { class: tw`opacity-70` } }, [t('wiki.select_article', state)])
                    ]);
                }

                const title = article.title[lang] || article.title['en'];
                let content = article.content[lang] || article.content['en'] || '';
                const siblings = article.siblings || [];

                console.log('[WikiUI] Rendering article:', article.id, 'title:', title);

                // Smart Linking: Process BEFORE markdown rendering
                // Convert smart link words to special markdown that will be handled by click events
                if (article.words && Array.isArray(article.words)) {
                    article.words.forEach(wordObj => {
                        const word = Object.keys(wordObj)[0];
                        const targetId = wordObj[word];
                        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
                        // Mark words with special syntax that will become clickable after render
                        content = content.replace(regex, `**[$1](#wiki:${targetId})**`);
                    });
                }

                return D.Containers.Div({
                    attrs: { class: tw`max-w-3xl mx-auto w-full` }
                }, [
                    // Header
                    D.Containers.Div({
                        attrs: { class: tw`flex justify-between items-start gap-8 mb-8 pb-6 border-b-2 border-[var(--border)]` }
                    }, [
                        D.Containers.Div({ attrs: { class: tw`flex-1` } }, [
                            D.Text.H1({
                                attrs: { class: tw`text-4xl font-bold mb-4 leading-tight` }
                            }, [title]),
                            D.Text.P({
                                attrs: { class: tw`text-sm ${token('muted')}` }
                            }, [
                                t('wiki.last_updated', state) + ' ',
                                article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : '-'
                            ])
                        ]),
                        D.Containers.Div({ attrs: { class: tw`flex items-center gap-2` } }, [
                            D.Forms.Button({
                                attrs: {
                                    gkey: 'wiki:article:edit',
                                    class: tw`${token('btn/soft')} ${token('btn/md')} flex items-center gap-2`
                                }
                            }, [
                                D.Text.Span({}, ['✏️']),
                                D.Text.Span({}, [t('wiki.edit', state)])
                            ]),
                            D.Forms.Button({
                                attrs: {
                                    gkey: 'wiki:article:delete',
                                    class: tw`${token('btn/destructive')} ${token('btn/md')} flex items-center gap-2`
                                }
                            }, [
                                D.Text.Span({}, ['🗑️']),
                                D.Text.Span({}, [t('wiki.delete', state)])
                            ])
                        ])
                    ]),

                    // Content - using M.UI.Markdown (the magic solution!)
                    D.Containers.Div({
                        attrs: {
                            gkey: 'wiki:link:click',
                            class: tw`wiki-content mb-12`,
                            style: `direction: ${lang === 'ar' ? 'rtl' : 'ltr'}`
                        }
                    }, [
                        M.UI.Markdown({
                            content: content,
                            className: tw`prose prose-lg max-w-none`
                        })
                    ]),

                    // Related - always render but hide if empty
                    D.Containers.Div({
                        attrs: {
                            class: tw`mt-12 pt-8 border-t border-[var(--border)]`,
                            style: `display: ${(siblings && siblings.length > 0) ? 'block' : 'none'}`
                        }
                    }, [
                        D.Text.H3({
                            attrs: { class: tw`text-xl font-semibold mb-4` }
                        }, ['📎 ' + t('wiki.related', state)]),
                        D.Containers.Div({
                            attrs: { class: tw`flex flex-col gap-3` }
                        }, siblings.map(sib =>
                            D.Forms.Button({
                                attrs: {
                                    gkey: 'wiki:article:navigate',
                                    'data-article-id': sib.id,
                                    class: tw`${token('list/item')} cursor-pointer text-left`
                                }
                            }, [
                                D.Text.Span({ attrs: { class: tw`${token('muted')}` } }, ['→']),
                                D.Text.Span({ attrs: { class: tw`ml-2` } }, [sib.title[lang] || sib.title['en']])
                            ])
                        ))
                    ])
                ]);
            } catch (error) {
                console.error('[WikiUI] WikiViewer error:', error);
                return D.Containers.Div({
                    attrs: { class: tw`p-8 text-red-500` }
                }, ['Error rendering article: ' + error.message]);
            }
        };

        console.log('✅ WikiViewer defined:', typeof window.M.UI.WikiViewer);

        // ============================================================
        // WikiEditor
        // ============================================================
        window.M.UI.WikiEditor = function ({ state, actions }) {
            const lang = state.env.lang;
            const draft = state.editorDraft || {
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
            };
            const isNew = !draft.id;

            const FormField = (label, child) => D.Containers.Div({
                attrs: { class: tw`mb-6` }
            }, [
                D.Forms.Label({ attrs: { class: tw`${token('label')} block mb-2` } }, [label]),
                child
            ]);

            const renderChips = (items, field, placeholder) => D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
                D.Containers.Div({ attrs: { class: tw`flex flex-wrap gap-2` } },
                    (items || []).map((val, idx) => D.Containers.Div({
                        attrs: { class: tw`flex items-center gap-1 px-2 py-1 rounded bg-[var(--secondary)]` }
                    }, [
                        D.Text.Span({ attrs: { class: tw`text-sm` } }, [val || '']),
                        D.Forms.Button({
                            attrs: { gkey: 'wiki:form:list-remove', 'data-field': field, 'data-index': idx, class: tw`text-xs` },
                            class: tw`${token('btn/ghost')} ${token('btn/sm')}`
                        }, ['✖'])
                    ]))
                ),
                D.Containers.Div({ attrs: { class: tw`flex gap-2` } }, [
                    window.M.UI.Input({
                        attrs: {
                            class: tw`${token('input')} w-full`,
                            placeholder,
                            value: ''
                        }
                    }),
                    D.Forms.Button({
                        attrs: {
                            gkey: 'wiki:form:list-add',
                            'data-field': field
                        },
                        class: tw`${token('btn/solid')} ${token('btn/sm')}`
                    }, ['+'])
                ])
            ]);

            const renderWordRows = (items, field) => D.Containers.Div({ attrs: { class: tw`space-y-2` } }, [
                (items || []).map((row, idx) => D.Containers.Div({
                    attrs: { class: tw`grid grid-cols-5 gap-2 items-center` }
                }, [
                    window.M.UI.Input({ attrs: { class: tw`col-span-2 ${token('input')}` , value: row.term || '', 'data-field': field, 'data-index': idx, 'data-prop': 'term', gkey: 'wiki:form:list-update' } }),
                    window.M.UI.Input({ attrs: { class: tw`col-span-2 ${token('input')}` , value: row.target || '', 'data-field': field, 'data-index': idx, 'data-prop': 'target', gkey: 'wiki:form:list-update' } }),
                    D.Forms.Button({ attrs: { gkey: 'wiki:form:list-remove', 'data-field': field, 'data-index': idx }, class: tw`${token('btn/destructive')} ${token('btn/sm')}` }, ['✖'])
                ])),
                D.Forms.Button({ attrs: { gkey: 'wiki:form:list-add', 'data-field': field }, class: tw`${token('btn/outline')} ${token('btn/sm')}` }, [lang === 'ar' ? 'إضافة كلمة' : 'Add word'])
            ]);

            const renderSiblingRows = (items, field) => D.Containers.Div({ attrs: { class: tw`space-y-3` } }, [
                (items || []).map((row, idx) => D.Containers.Div({ attrs: { class: tw`grid grid-cols-7 gap-2 items-center` } }, [
                    window.M.UI.Input({ attrs: { class: tw`${token('input')} col-span-2`, value: row.id || '', 'data-field': field, 'data-index': idx, 'data-prop': 'id', gkey: 'wiki:form:list-update' } }),
                    window.M.UI.Input({ attrs: { class: tw`${token('input')} col-span-2`, value: row.title_en || '', 'data-field': field, 'data-index': idx, 'data-prop': 'title_en', gkey: 'wiki:form:list-update' } }),
                    window.M.UI.Input({ attrs: { class: tw`${token('input')} col-span-2`, dir: 'rtl', value: row.title_ar || '', 'data-field': field, 'data-index': idx, 'data-prop': 'title_ar', gkey: 'wiki:form:list-update' } }),
                    D.Forms.Button({ attrs: { gkey: 'wiki:form:list-remove', 'data-field': field, 'data-index': idx }, class: tw`${token('btn/destructive')} ${token('btn/sm')}` }, ['✖'])
                ])),
                D.Forms.Button({ attrs: { gkey: 'wiki:form:list-add', 'data-field': field }, class: tw`${token('btn/outline')} ${token('btn/sm')}` }, [lang === 'ar' ? 'إضافة علاقة' : 'Add related'])
            ]);

            return D.Containers.Div({ attrs: { class: tw`max-w-5xl mx-auto space-y-6` } }, [
                D.Text.H2({ attrs: { class: tw`text-3xl font-bold` } }, [isNew ? '➕ ' + t('wiki.new_article', state) : '✏️ ' + t('wiki.edit', state)]),

                FormField('Article ID', window.M.UI.Input({
                    attrs: {
                        class: tw`${token('input')} w-full`,
                        placeholder: 'unique-article-id',
                        value: draft.id,
                        disabled: !isNew,
                        gkey: 'wiki:form:input',
                        'data-field': 'id'
                    }
                })),

                D.Containers.Div({ attrs: { class: tw`grid grid-cols-2 gap-4` } }, [
                    FormField('Title (English)', window.M.UI.Input({ attrs: { class: tw`${token('input')} w-full`, value: draft.title_en || '', 'data-field': 'title_en', gkey: 'wiki:form:input' } })),
                    FormField('العنوان (عربي)', window.M.UI.Input({ attrs: { class: tw`${token('input')} w-full`, dir: 'rtl', value: draft.title_ar || '', 'data-field': 'title_ar', gkey: 'wiki:form:input' } }))
                ]),

                D.Containers.Div({ attrs: { class: tw`grid grid-cols-2 gap-4` } }, [
                    FormField('Content (English - Markdown)', window.M.UI.Textarea({ attrs: { class: tw`${token('input')} w-full font-mono text-sm min-h-[260px]`, value: draft.content_en || '', 'data-field': 'content_en', gkey: 'wiki:form:input' } })),
                    FormField('المحتوى (عربي - Markdown)', window.M.UI.Textarea({ attrs: { class: tw`${token('input')} w-full font-mono text-sm min-h-[260px]`, dir: 'rtl', value: draft.content_ar || '', 'data-field': 'content_ar', gkey: 'wiki:form:input' } }))
                ]),

                FormField(lang === 'ar' ? 'كلمات مفتاحية' : 'Keywords', renderChips(draft.keywords || [], 'keywords', lang === 'ar' ? 'أدخل كلمة وأضفها' : 'Type keyword then add')),
                FormField(lang === 'ar' ? 'المسار الأب' : 'Parent IDs', renderChips(draft.parents_ids || [], 'parents_ids', lang === 'ar' ? 'id الأب' : 'parent id')),
                FormField(lang === 'ar' ? 'روابط الكلمات داخل النص' : 'Smart links', renderWordRows(draft.words || [], 'words')),
                FormField(lang === 'ar' ? 'مقالات مرتبطة' : 'Related articles', renderSiblingRows(draft.siblings || [], 'siblings')),
                FormField(lang === 'ar' ? 'الترتيب' : 'Sort order', window.M.UI.Input({ attrs: { type: 'number', class: tw`${token('input')} w-full max-w-xs`, value: draft.sort || 0, 'data-field': 'sort', gkey: 'wiki:form:input' } })),

                D.Containers.Div({ attrs: { class: tw`flex items-center gap-3` } }, [
                    D.Forms.Button({ attrs: { gkey: 'wiki:article:save', class: tw`${token('btn/solid')} ${token('btn/lg')}` } }, ['💾 ' + t('wiki.save', state)]),
                    D.Forms.Button({ attrs: { gkey: 'wiki:article:cancel', class: tw`${token('btn/ghost')} ${token('btn/lg')}` } }, [t('wiki.cancel', state)]),
                    D.Forms.Button({ attrs: { gkey: 'wiki:article:delete', class: tw`${token('btn/destructive')} ${token('btn/lg')}`, style: `display:${isNew ? 'none' : 'inline-flex'}` } }, ['🗑️ ' + t('wiki.delete', state)])
                ])
            ]);
        };

        window.M.UI.WikiEditorModal = function ({ state, actions }) {
            if (!state.showEditorModal) return null;
            return M.UI.Modal({
                open: state.showEditorModal,
                size: 'xl',
                title: state.env.lang === 'ar' ? 'إدارة مقالات الويكي' : 'Manage wiki article',
                content: window.M.UI.WikiEditor({ state, actions }),
                actions: []
            });
        };

        // Styles - Enhanced dark mode
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            /* Enhanced Dark Mode Colors */
            [data-theme="dark"] {
                --background: hsl(222, 20%, 11%);
                --foreground: hsl(210, 20%, 98%);
                --card: hsl(222, 20%, 14%);
                --card-foreground: hsl(210, 20%, 98%);
                --popover: hsl(222, 20%, 14%);
                --popover-foreground: hsl(210, 20%, 98%);
                --primary: hsl(210, 100%, 60%);
                --primary-foreground: hsl(222, 47%, 11%);
                --secondary: hsl(217, 19%, 22%);
                --secondary-foreground: hsl(210, 20%, 98%);
                --muted: hsl(217, 19%, 18%);
                --muted-foreground: hsl(215, 16%, 65%);
                --accent: hsl(217, 19%, 22%);
                --accent-foreground: hsl(210, 20%, 98%);
                --destructive: hsl(0, 63%, 50%);
                --destructive-foreground: hsl(210, 20%, 98%);
                --border: hsl(217, 19%, 22%);
                --input: hsl(217, 19%, 22%);
                --ring: hsl(210, 100%, 60%);
                --surface-1: hsl(217, 19%, 18%);
            }
            
            /* Enhanced Light Mode */
            [data-theme="light"] {
                --background: hsl(0, 0%, 100%);
                --foreground: hsl(222, 47%, 11%);
                --card: hsl(0, 0%, 100%);
                --card-foreground: hsl(222, 47%, 11%);
                --primary: hsl(221, 83%, 53%);
                --primary-foreground: hsl(210, 40%, 98%);
                --secondary: hsl(210, 40%, 96%);
                --secondary-foreground: hsl(222, 47%, 11%);
                --muted: hsl(210, 40%, 96%);
                --muted-foreground: hsl(215, 16%, 47%);
                --accent: hsl(210, 40%, 96%);
                --accent-foreground: hsl(222, 47%, 11%);
                --destructive: hsl(0, 84%, 60%);
                --destructive-foreground: hsl(210, 40%, 98%);
                --border: hsl(214, 32%, 91%);
                --input: hsl(214, 32%, 91%);
                --ring: hsl(221, 83%, 53%);
                --surface-1: hsl(210, 40%, 98%);
            }
            
            .wiki-link {
                color: var(--primary);
                text-decoration: none;
                font-weight: 500;
                cursor: pointer;
                border-bottom: 1px dashed var(--primary);
                transition: all 0.2s;
            }
            }
            .wiki-link:hover {
                text-decoration: underline;
                opacity: 0.8;
            }
            .wiki-markdown-content {
                line-height: 1.8;
                color: var(--foreground);
            }
            .wiki-markdown-content h1, .wiki-markdown-content h2, .wiki-markdown-content h3 {
                margin-top: 2rem;
                margin-bottom: 1rem;
                font-weight: 700;
                color: var(--foreground);
            }
            .wiki-markdown-content p {
                margin-bottom: 1rem;
            }
            .wiki-markdown-content code {
                background: var(--surface-1);
                padding: 0.2em 0.4em;
                border-radius: 0.25rem;
                font-size: 0.9em;
                color: var(--foreground);
            }
            .wiki-markdown-content pre {
                background: var(--surface-1);
                padding: 1rem;
                border-radius: 0.5rem;
                overflow-x: auto;
                margin: 1rem 0;
            }
            .wiki-markdown-content pre code {
                background: transparent;
                padding: 0;
            }
        `;
        document.head.appendChild(styleTag);

        console.log('✅ Mishkah Wiki UI loaded - clean solution with M.UI.Markdown');
    }

    waitForDSL();
})();
