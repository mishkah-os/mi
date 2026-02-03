(function (window) {
    window.codewikidb = [
        {
            id: 'frontend-core',
            title: { en: 'Cross-Framework Core', ar: 'الأساسيات المشتركة بين الأطر' },
            keywords: ['frontend', 'spa', 'framework', 'architecture'],
            content: {
                en: 'Modern single-page applications share core ideas: components to isolate UI, a reactive render loop to keep the DOM in sync with state, client-side routing, build tooling, and testing/performance practices. Understanding these shared blocks makes it easier to move between React, Vue, Angular, and other frameworks.',
                ar: 'تتشابه تطبيقات الواجهة الواحدة في أفكار أساسية: مكونات لعزل الواجهة، حلقة عرض تفاعلية تُبقي DOM متزامناً مع الحالة، توجيه على المتصفح، أدوات بناء، واختبارات وتحسين أداء. فهم هذه اللبنات يسهل الانتقال بين React وVue وAngular وغيرها.'
            },
            words: [
                { 'components': 'component-model' },
                { 'routing': 'routing' }
            ],
            parents_ids: [],
            siblings: [],
            sort: 0
        },
        {
            id: 'vue',
            title: { en: 'Vue.js', ar: 'فيو' },
            keywords: ['vue', 'composition api', 'reactivity'],
            content: {
                en: 'Vue blends a templating-first experience with a powerful reactivity core. Templates stay declarative while Composition API (setup, ref, computed) keeps logic organized and testable. Single File Components bundle template, script, and style for tidy delivery.',
                ar: 'تجمع Vue بين قوالب سهلة القراءة ونواة تفاعلية قوية. تبقى القوالب تصريحـية بينما ينظم Composition API (setup وref وcomputed) المنطق بشكل قابل للاختبار. ملفات المكونات الفردية تجمع القالب والسكريبت والتنسيق في حزمة مرتبة.'
            },
            words: [
                { 'Composition API': 'vue-composition' },
                { 'reactivity': 'reactivity' }
            ],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 2
        },
        {
            id: 'angular',
            title: { en: 'Angular', ar: 'أنجولار' },
            keywords: ['angular', 'components', 'modules'],
            content: {
                en: 'Angular is a batteries-included framework: dependency injection, RxJS-powered async flows, forms, routing, and a CLI for scaffolding. Components declare inputs/outputs, templates use structural directives like *ngFor, and services hold shared logic.',
                ar: 'أنجولار إطار متكامل يوفر الحقن الاعتمادي، تدفقات RxJS، النماذج، التوجيه، وأداة CLI للتوليد. تعلن المكونات عن المدخلات والمخرجات، وتستخدم القوالب توجيهات بنيوية مثل *ngFor، بينما تحتفظ الخدمات بالمنطق المشترك.'
            },
            words: [
                { 'RxJS': 'rxjs' },
                { 'components': 'component-model' }
            ],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 3
        },
        {
            id: 'svelte',
            title: { en: 'Svelte', ar: 'سفيلت' },
            keywords: ['svelte', 'compiler'],
            content: {
                en: 'Svelte shifts work to compile time: state assignments trigger updates, and the compiler outputs tiny DOM instructions. Stores provide shared state, while transitions and animations are first-class for polished UI without heavy runtime.',
                ar: 'ينقل Svelte العمل إلى وقت الترجمة؛ تؤدي إسنادات الحالة إلى تحديثات، ويولد المترجم تعليمات DOM صغيرة. توفر المتاجر حالة مشتركة، وتعد الانتقالات والحركات جزءاً أساسياً لواجهة مصقولة دون تشغيلية ثقيلة.'
            },
            words: [{ 'stores': 'state' }],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 4
        },
        {
            id: 'jquery-library',
            title: { en: 'jQuery', ar: 'جي كويري' },
            keywords: ['jquery', 'dom', 'events'],
            content: {
                en: 'jQuery simplifies DOM traversal, event handling, and AJAX with a compact API. It remains useful for quick scripting, legacy codebases, and progressive enhancement where shipping a full SPA stack is unnecessary.',
                ar: 'تُبسط jQuery التنقل في DOM ومعالجة الأحداث وطلبات AJAX عبر واجهة مضغوطة. ما زالت مفيدة للسكربتات السريعة، والمشاريع القديمة، والتحسين التدريجي عندما لا تكون حزمة SPA كاملة ضرورية.'
            },
            words: [{ 'DOM': 'dom' }],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 5
        },
        {
            id: 'react',
            title: { en: 'React', ar: 'رياكت' },
            keywords: ['react', 'jsx', 'component', 'library', 'ui'],
            content: {
                en: 'React is a component-first UI library. Each component owns its state, receives data through props, renders declaratively with JSX, and re-renders when inputs change. Data flows down, events flow up, creating predictable composition for scalable apps.',
                ar: 'React مكتبة واجهات تعتمد على المكونات. كل مكون يمتلك حالته، ويستقبل البيانات عبر الخصائص (props)، ويعرض بوضوح باستخدام JSX، ويُعاد العرض عند تغيّر المدخلات. البيانات تنساب للأسفل والأحداث تصعد للأعلى مما يحقق تركيباً متوقعاً لتطبيقات قابلة للتوسع.'
            },
            words: [
                { 'JavaScript': 'javascript' },
                { 'components': 'react-component' },
                { 'library': 'library' }
            ],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 1
        },
        {
            id: 'react-jsx',
            title: { en: 'JSX & Rendering', ar: 'JSX وآلية العرض' },
            keywords: ['jsx', 'virtual dom', 'render'],
            content: {
                en: 'JSX is syntax sugar that turns into React.createElement calls. React builds a virtual tree, diffs it against the previous render, and commits minimal DOM updates. Pure render functions and stable keys keep the diff predictable.',
                ar: 'JSX عبارة عن صياغة تختصر استدعاء React.createElement. يبني React شجرة افتراضية ويقارنها بالعرض السابق ثم يطبق أقل التعديلات على DOM. دوال عرض نقية ومفاتيح مستقرة تجعل المقارنة متوقعة.'
            },
            words: [
                { 'JSX': 'jsx' },
                { 'Virtual DOM': 'virtual-dom' },
                { 'key': 'react-key' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 2
        },
        {
            id: 'react-component',
            title: { en: 'Components', ar: 'المكونات' },
            keywords: ['component', 'functional component', 'props'],
            content: {
                en: 'React components are plain functions that receive props and return JSX. Keep them small and focused, derive UI from props and state, and avoid side effects in render. Composition (passing children, slots, or render props) is favored over inheritance.',
                ar: 'مكونات React هي دوال عادية تستقبل props وتعيد JSX. اجعلها صغيرة ومحددة الهدف، واشتق الواجهة من الخصائص والحالة، وتجنب الآثار الجانبية داخل العرض. يفضل التركيب (تمرير children أو render props) على الوراثة.'
            },
            words: [
                { 'props': 'props' },
                { 'children': 'react-children' }
            ],
            parents_ids: ['react'],
            siblings: [
                { id: 'react-jsx', title: { en: 'JSX', ar: 'JSX' } }
            ],
            sort: 3
        },
        {
            id: 'react-data-flow',
            title: { en: 'Data Flow', ar: 'تدفق البيانات' },
            keywords: ['one-way data flow', 'events', 'lifting state'],
            content: {
                en: 'React enforces one-way data flow: parents own state and pass values + callbacks down. When child interactions need to update shared state, lift the state to the nearest common parent or move it to Context/reducer. This keeps reasoning simple and avoids implicit shared mutation.',
                ar: 'يفرض React تدفق بيانات باتجاه واحد: المكون الأب يمتلك الحالة ويمرر القيم والاستدعاءات للأسفل. عند حاجة المكونات الأبناء لتحديث حالة مشتركة يتم رفع الحالة لأقرب أب مشترك أو نقلها إلى Context/مخفض (reducer). هذا يبقي التفكير بسيطاً ويمنع تعديلاً ضمنياً للحالة.'
            },
            words: [
                { 'lifting state': 'lifting-state' },
                { 'callbacks': 'callback' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 4
        },
        {
            id: 'react-state',
            title: { en: 'State & Props', ar: 'الحالة والخصائص' },
            keywords: ['state', 'props', 'derived state'],
            content: {
                en: 'Props are read-only inputs; state is local, mutable through setState-like APIs. Prefer deriving state from props instead of duplicating it, store the minimal source of truth, and compute the rest on render. Keep state close to where it is used.',
                ar: 'الخصائص (props) مدخلات للقراءة فقط، أما الحالة فهي محلية وتُعدَّل عبر setState أو الخطافات. يفضل اشتقاق الحالة من props بدلاً من تكرارها، والاحتفاظ بأقل مصدر موثوق، وحساب الباقي أثناء العرض. ضع الحالة بالقرب من مكان استخدامها.'
            },
            words: [
                { 'props': 'props' },
                { 'state': 'state' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 5
        },
        {
            id: 'react-hooks',
            title: { en: 'Hooks', ar: 'الخطافات (Hooks)' },
            keywords: ['hook', 'hooks', 'functional component'],
            content: {
                en: 'Hooks connect function components to React features: state hooks (useState, useReducer), effect hooks (useEffect, useLayoutEffect), context hooks (useContext), refs (useRef), and performance hooks (useMemo, useCallback). They must run at the top level and never inside conditions so React can preserve call order.',
                ar: 'الخطافات تصل مكونات الدوال بميزات React: خطافات الحالة (useState وuseReducer)، خطافات التأثير (useEffect وuseLayoutEffect)، خطافات السياق (useContext)، المراجع (useRef)، وخطافات الأداء (useMemo وuseCallback). يجب أن تُستدعى في المستوى الأعلى دون شروط ليحافظ React على ترتيبها.'
            },
            words: [
                { 'React': 'react' },
                { 'state': 'state' },
                { 'lifecycle': 'lifecycle' }
            ],
            parents_ids: ['react'],
            siblings: [
                { id: 'react-component', title: { en: 'Components', ar: 'المكونات' } }
            ],
            sort: 6
        },
        {
            id: 'react-usestate',
            title: { en: 'useState', ar: 'useState' },
            keywords: ['useState', 'state', 'hook'],
            content: {
                en: 'useState adds local state to a function component. It returns the current value and a setter. The setter can take a function updater to avoid stale closures. Batch updates are asynchronous; derive the next state from the previous value when multiple updates might occur.',
                ar: 'useState يضيف حالة محلية لمكون وظيفي. يعيد القيمة الحالية ودالة تحديث. يمكن أن تستقبل دالة التحديث دالة تحسب الحالة الجديدة لتجنب الإحالات القديمة. تُجمع التحديثات بشكل غير متزامن؛ اشتق الحالة التالية من القيمة السابقة عند احتمال تعدد التحديثات.'
            },
            words: [
                { 'React': 'react' },
                { 'Hook': 'react-hooks' },
                { 'function components': 'react-component' }
            ],
            parents_ids: ['react', 'react-hooks'],
            siblings: [
                { id: 'react-useeffect', title: { en: 'useEffect', ar: 'useEffect' } },
                { id: 'react-usereducer', title: { en: 'useReducer', ar: 'useReducer' } }
            ],
            sort: 7
        },
        {
            id: 'react-usereducer',
            title: { en: 'useReducer', ar: 'useReducer' },
            keywords: ['useReducer', 'state machine', 'reducer'],
            content: {
                en: 'useReducer manages complex or branching state transitions with a reducer function and dispatch actions. It keeps event handling predictable, mirrors Redux patterns, and pairs well with Context to share global state without prop drilling.',
                ar: 'useReducer يدير انتقالات حالة معقدة أو متفرعة عبر دالة reducer وإرسال أفعال dispatch. يجعل معالجة الأحداث متوقعة، ويشبه أنماط Redux، ويتكامل جيداً مع Context لمشاركة الحالة دون تمرير خصائص عميق.'
            },
            words: [
                { 'reducer': 'reducer' },
                { 'dispatch': 'dispatch' }
            ],
            parents_ids: ['react', 'react-hooks'],
            siblings: [
                { id: 'react-usestate', title: { en: 'useState', ar: 'useState' } }
            ],
            sort: 8
        },
        {
            id: 'react-useeffect',
            title: { en: 'useEffect', ar: 'useEffect' },
            keywords: ['useEffect', 'effect', 'lifecycle'],
            content: {
                en: 'useEffect runs after render to sync components with external systems: fetching data, subscribing, manipulating DOM. Dependency arrays control when it runs. Return a cleanup function to unsubscribe or reset on unmount or dependency change, similar to componentDidMount/DidUpdate/WillUnmount combined.',
                ar: 'useEffect يعمل بعد العرض لمزامنة المكونات مع الأنظمة الخارجية: جلب بيانات، اشتراك، تعديل DOM. يتحكم مصفوفة التبعيات في وقت التنفيذ. تعيد دالة تنظيف لإلغاء الاشتراك أو إعادة التهيئة عند إزالة المكون أو تغير التبعيات، بشكل يشبه componentDidMount/DidUpdate/WillUnmount معاً.'
            },
            words: [
                { 'React': 'react' },
                { 'Hook': 'react-hooks' },
                { 'side effects': 'side-effects' }
            ],
            parents_ids: ['react', 'react-hooks'],
            siblings: [
                { id: 'react-usestate', title: { en: 'useState', ar: 'useState' } }
            ],
            sort: 9
        },
        {
            id: 'react-usememo',
            title: { en: 'useMemo & useCallback', ar: 'useMemo وuseCallback' },
            keywords: ['useMemo', 'useCallback', 'performance'],
            content: {
                en: 'useMemo caches expensive derived values based on dependencies, while useCallback caches function identities to prevent needless re-renders when passed to memoized children. Use them sparingly; prioritize measuring before optimizing.',
                ar: 'useMemo يخزن نتائج حساب مكلف بناءً على التبعيات، بينما useCallback يخزن هوية الدوال لمنع إعادة العرض غير الضرورية عند تمريرها لأبناء مذكرين. استخدمهما بحذر وركز على القياس قبل التحسين.'
            },
            words: [
                { 'memoization': 'memoization' },
                { 're-render': 'rerender' }
            ],
            parents_ids: ['react', 'react-hooks'],
            siblings: [],
            sort: 10
        },
        {
            id: 'react-useref',
            title: { en: 'useRef', ar: 'useRef' },
            keywords: ['useRef', 'refs', 'dom'],
            content: {
                en: 'useRef stores a mutable value that persists across renders without triggering re-render. Common uses: hold DOM node references, keep timers, store previous values, or cache imperative handles when integrating with non-React code.',
                ar: 'useRef يخزن قيمة قابلة للتغيير تبقى عبر عمليات العرض دون إعادة العرض. الاستخدامات الشائعة: الاحتفاظ بمراجع لعناصر DOM، حفظ المؤقتات، تخزين القيم السابقة، أو تخزين مقابض أمرية عند التكامل مع كود غير React.'
            },
            words: [
                { 'ref': 'ref' },
                { 'DOM': 'dom' }
            ],
            parents_ids: ['react', 'react-hooks'],
            siblings: [],
            sort: 11
        },
        {
            id: 'react-context',
            title: { en: 'Context', ar: 'السياق (Context)' },
            keywords: ['context', 'provider', 'consumer'],
            content: {
                en: 'Context lets you share values (theme, auth, locale, data stores) without prop drilling. Wrap a Provider high in the tree and read with useContext. Pair with reducers for predictable updates and memoized selectors to avoid re-render storms.',
                ar: 'السياق يسمح بمشاركة قيم مثل النمط أو المصادقة أو اللغة أو مخازن البيانات بدون تمرير خصائص عميق. ضع Provider في أعلى الشجرة واقرأ القيم عبر useContext. اجمعه مع reducers لتحديثات متوقعة ومع محددات مذكرّة لتجنب موجات إعادة العرض.'
            },
            words: [
                { 'Provider': 'provider' },
                { 'prop drilling': 'prop-drilling' }
            ],
            parents_ids: ['react'],
            siblings: [
                { id: 'react-data-flow', title: { en: 'Data Flow', ar: 'تدفق البيانات' } }
            ],
            sort: 12
        },
        {
            id: 'react-custom-hooks',
            title: { en: 'Custom Hooks', ar: 'الخطافات المخصصة' },
            keywords: ['custom hook', 'reuse', 'abstraction'],
            content: {
                en: 'Custom hooks encapsulate reusable stateful logic. They are plain functions that call other hooks and expose a focused API. Examples: useFetch for data loading, useToggle for boolean state, useForm for validation. Keep them composable and pure; any DOM work stays in the consuming component.',
                ar: 'الخطافات المخصصة تغلف منطقاً حالياً قابلاً لإعادة الاستخدام. هي دوال عادية تستدعي خطافات أخرى وتعرض واجهة مركزة. أمثلة: useFetch لجلب البيانات، useToggle للحالات المنطقية، useForm للتحقق. اجعلها قابلة للتركيب ونقية؛ أي تعامل مع DOM يبقى في المكون المستهلك.'
            },
            words: [
                { 'reuse': 'reuse' },
                { 'abstraction': 'abstraction' }
            ],
            parents_ids: ['react', 'react-hooks'],
            siblings: [],
            sort: 13
        },
        {
            id: 'react-routing',
            title: { en: 'Routing', ar: 'التوجيه' },
            keywords: ['react router', 'spa routing', 'navigation'],
            content: {
                en: 'Client-side routing keeps a SPA in sync with the URL. React Router uses components like BrowserRouter, Routes, and Link to map paths to screens. Nested routes mirror UI hierarchy. Keep data loading co-located with routes for better code splitting.',
                ar: 'التوجيه على المتصفح يحافظ على تزامن تطبيق الصفحة الواحدة مع عنوان URL. يستخدم React Router مكونات مثل BrowserRouter وRoutes وLink لربط المسارات بالشاشات. المسارات المتداخلة تعكس هيكل الواجهة. اجعل جلب البيانات ملازماً للمسار لتحسين تقسيم الكود.'
            },
            words: [
                { 'Router': 'router' },
                { 'Link': 'link' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 14
        },
        {
            id: 'react-forms',
            title: { en: 'Forms', ar: 'النماذج' },
            keywords: ['forms', 'controlled', 'uncontrolled'],
            content: {
                en: 'Controlled components bind input value to state and update on change handlers, enabling validation and formatting. Uncontrolled components use refs to read values on submit. Choose controlled for dynamic feedback, uncontrolled for lightweight forms or third-party widgets.',
                ar: 'المكونات المضبوطة تربط قيمة الحقل بالحالة وتحدّث عبر معالجات التغيير، ما يتيح التحقق والتنسيق. المكونات غير المضبوطة تستخدم refs لقراءة القيم عند الإرسال. اختر المضبوطة للتفاعلات الحية، وغير المضبوطة للنماذج الخفيفة أو عناصر الأطراف الثالثة.'
            },
            words: [
                { 'validation': 'validation' },
                { 'input': 'input' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 15
        },
        {
            id: 'react-testing',
            title: { en: 'Testing', ar: 'الاختبارات' },
            keywords: ['testing', 'jest', 'react testing library'],
            content: {
                en: 'Use Jest for unit tests and React Testing Library for DOM-focused tests. Test behaviors, not implementation details: render components, interact via user events, and assert on accessible queries. Mock network calls but keep components close to real usage.',
                ar: 'استخدم Jest للاختبارات الوحدوية وReact Testing Library لاختبارات DOM. اختبر السلوكيات لا التفاصيل الداخلية: اعرض المكونات، تفاعل بأحداث المستخدم، وتحقق عبر استعلامات إمكانية الوصول. استخدم محاكاة للاتصالات الشبكية مع الحفاظ على استخدام حقيقي للمكونات.'
            },
            words: [
                { 'Jest': 'jest' },
                { 'RTL': 'rtl' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 16
        },
        {
            id: 'react-performance',
            title: { en: 'Performance', ar: 'الأداء' },
            keywords: ['performance', 'memo', 'suspense'],
            content: {
                en: 'Optimize React by keeping components pure, splitting bundles with lazy/Suspense, memoizing components that receive stable props, and avoiding unnecessary renders with keys and list virtualization. Measure with React DevTools profiler before tuning.',
                ar: 'حسّن أداء React بجعل المكونات نقية، وتقسيم الحزم باستخدام lazy/Suspense، وتذكير المكونات ذات الخصائص الثابتة، وتجنب إعادة العرض غير الضرورية بالمفاتيح وتخيل القوائم. قم بالقياس عبر React DevTools قبل الضبط.'
            },
            words: [
                { 'memo': 'memo' },
                { 'lazy': 'lazy' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 17
        },
        {
            id: 'react-integration',
            title: { en: 'Integration & Real Apps', ar: 'التكامل وبناء التطبيقات الواقعية' },
            keywords: ['api', 'state management', 'tooling'],
            content: {
                en: 'Real projects combine React with data fetching (REST/GraphQL), global state (Context, Redux Toolkit, Zustand), routing, forms, and testing. Tooling such as Vite or Next.js handles bundling, SSR, and code splitting. Establish folder conventions (components/, hooks/, services/) to keep the project maintainable.',
                ar: 'المشروعات الواقعية تجمع React مع جلب البيانات (REST/GraphQL)، وإدارة الحالة العامة (Context أو Redux Toolkit أو Zustand)، والتوجيه، والنماذج، والاختبارات. أدوات مثل Vite أو Next.js تتولى التجميع والعرض المسبق وتقسيم الكود. ضع أعرافاً للمجلدات (components/، hooks/، services/) للحفاظ على قابلية الصيانة.'
            },
            words: [
                { 'REST': 'rest' },
                { 'GraphQL': 'graphql' },
                { 'Redux': 'redux' }
            ],
            parents_ids: ['react'],
            siblings: [],
            sort: 18
        },
        {
            id: 'vue',
            title: { en: 'Vue.js', ar: 'Vue.js' },
            keywords: ['vue', 'template', 'directive', 'framework'],
            content: {
                en: 'Vue is a progressive framework with a templating syntax, reactive data system, and single-file components (SFCs). Options API organizes code by option sections; Composition API organizes by logical features using setup() and composables.',
                ar: 'Vue إطار عمل تقدمي بتركيب قوالب، نظام بيانات تفاعلي، ومكونات ذات ملف واحد (SFC). ينظم Options API الكود حسب الخيارات، بينما ينظم Composition API الكود حسب الميزات عبر setup() وcomposables.'
            },
            words: [
                { 'reactivity': 'reactivity' },
                { 'template': 'template' }
            ],
            parents_ids: ['frontend-core'],
            siblings: [
                { id: 'react', title: { en: 'React', ar: 'رياكت' } },
                { id: 'angular', title: { en: 'Angular', ar: 'Angular' } }
            ],
            sort: 19
        },
        {
            id: 'vue-composition',
            title: { en: 'Vue Composition API', ar: 'Composition API في Vue' },
            keywords: ['composition api', 'ref', 'reactive'],
            content: {
                en: 'The Composition API uses reactive primitives like ref and reactive, exposes lifecycle hooks (onMounted, onUnmounted), and lets you extract logic into composables similar to React custom hooks. Templates consume values directly with automatic unwrapping.',
                ar: 'Composition API يستخدم بدائيات تفاعلية مثل ref وreactive، ويعرض خطافات دورة الحياة (onMounted وonUnmounted)، ويسمح باستخراج المنطق في composables شبيهة بخطافات React المخصصة. تستهلك القوالب القيم مباشرة مع فك تلقائي.'
            },
            words: [
                { 'ref': 'ref' },
                { 'composable': 'composable' }
            ],
            parents_ids: ['vue'],
            siblings: [],
            sort: 20
        },
        {
            id: 'angular',
            title: { en: 'Angular', ar: 'Angular' },
            keywords: ['angular', 'di', 'rxjs', 'spa'],
            content: {
                en: 'Angular is a batteries-included framework with TypeScript-first tooling, dependency injection, templates, RxJS for reactive streams, and a CLI for scaffolding. Features like modules, components, services, and pipes enforce clear layering.',
                ar: 'Angular إطار متكامل يعتمد على TypeScript، يوفر حقن تبعية، قوالب، RxJS للتدفقات التفاعلية، وواجهة أوامر لتوليد الأكواد. مكونات مثل الوحدات (Modules) والخدمات (Services) والأنابيب (Pipes) تفرض طبقات واضحة.'
            },
            words: [
                { 'TypeScript': 'typescript' },
                { 'RxJS': 'rxjs' }
            ],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 21
        },
        {
            id: 'frameworks-comparison',
            title: { en: 'Framework Landscape', ar: 'مشهد الأطر' },
            keywords: ['comparison', 'react vs vue', 'spa frameworks'],
            content: {
                en: 'React focuses on a flexible view layer with hooks; Vue offers convention-ready templates and reactivity; Angular provides a full platform with DI and RxJS. Choose based on team skills, ecosystem needs, and project scale. All follow component-based architecture and can power production-ready apps.',
                ar: 'يركز React على طبقة العرض المرنة مع الخطافات؛ يقدم Vue قوالب جاهزة واتساقاً في التفاعلية؛ يوفر Angular منصة كاملة بحقن تبعية وRxJS. اختر بناءً على مهارات الفريق واحتياجات المنظومة وحجم المشروع. جميعها تعتمد على مكونات ويمكنها تشغيل تطبيقات جاهزة للإنتاج.'
            },
            words: [
                { 'React': 'react' },
                { 'Vue': 'vue' },
                { 'Angular': 'angular' }
            ],
            parents_ids: ['frontend-core'],
            siblings: [],
            sort: 22
        },
        {
            id: 'jquery',
            title: { en: 'jQuery', ar: 'jQuery' },
            keywords: ['jquery', '$', 'selector', 'dom'],
            content: {
                en: 'jQuery is a classic utility library that simplifies DOM selection, traversal, and AJAX. It is less common for modern SPA structure but still useful for legacy integrations and rapid scripting.',
                ar: 'jQuery مكتبة قديمة تسهل اختيار ومعالجة DOM وعمليات AJAX. تقل الحاجة إليها في هياكل SPA الحديثة لكنها مفيدة للتكامل مع الأنظمة القديمة والبرمجة السريعة.'
            },
            words: [
                { 'JavaScript': 'javascript' },
                { 'HTML': 'html' }
            ],
            parents_ids: [],
            siblings: [
                { id: 'react', title: { en: 'React', ar: 'رياكت' } },
                { id: 'vue', title: { en: 'Vue.js', ar: 'Vue.js' } }
            ],
            sort: 23
        }
    ];
})(window);
