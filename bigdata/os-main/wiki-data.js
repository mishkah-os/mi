const reactWiki = {
  title: 'React Wiki شجري شامل',
  language: 'ar',
  purpose: 'دليل شجري مترابط يشرح مفاهيم React وكيفية استخدامها عمليًا لبناء مشاريع حقيقية.',
  mentalModel: {
    summary: 'React مكتبة لبناء واجهات تعتمد على مكونات تركز على الحالة وتعيد render عندما تتغير البيانات.',
    pillars: [
      'المكون (Component) كوحدة بناء قابلة لإعادة الاستخدام',
      'التدفق أحادي الاتجاه للبيانات (Unidirectional Data Flow)',
      'الإعلان (Declarative UI) بدلًا من التحديث اليدوي للعناصر',
      'التمايز بين البيانات المحلية والسياق المشترك والمصدر الخارجي للبيانات',
    ],
  },
  nodes: [
    {
      id: 'foundation',
      title: 'الأساسيات',
      summary: 'لبنات React الرئيسية لفهم باقي المفاهيم.',
      children: [
        {
          id: 'jsx',
          title: 'JSX',
          summary: 'صيغة تشبه HTML تترجم إلى استدعاءات React.createElement.',
          keyPoints: [
            'تسمية الصفات بأسماء camelCase مثل className وhtmlFor.',
            'يمكن إدراج تعبيرات JavaScript داخل {}.',
            'كل مكون يُرجع عنصرًا واحدًا جذريًا (Fragment <>...</>).',
          ],
          pitfalls: [
            'عدم إغلاق العناصر الذاتية مثل <img />.',
            'نسيان ربط القوائم بمفتاح فريد key.',
          ],
          demo: 'const title = <h1>مرحبا React</h1>;'
        },
        {
          id: 'components',
          title: 'المكونات',
          summary: 'دوال ترجع JSX. الأفضل استخدام المكونات الدالية (Function Components).',
          keyPoints: [
            'تسمية المكون بحرف كبير ليُعامل كعنصر React.',
            'المكونات نقية: تعتمد على props/state فقط.',
            'تجميع المكونات (Composition) أفضل من الوراثة.',
          ],
          children: [
            {
              id: 'props',
              title: 'Props',
              summary: 'مدخلات المكون، غير قابلة للتعديل داخل المكون.',
              scenarios: [
                'تمرير بيانات القراءة فقط.',
                'تمرير callbacks للأحداث.',
              ],
              snippet: 'function Button({ label, onClick }) { return <button onClick={onClick}>{label}</button>; }'
            },
            {
              id: 'state',
              title: 'State',
              summary: 'بيانات محلية متغيرة تعيد render عند تحديثها.',
              rules: [
                'لا تعدل state مباشرة؛ استخدم setState أو setX.',
                'عند الاعتماد على القيمة السابقة استخدم دالة محدثة: setCount(c => c + 1).',
              ],
              snippet: 'const [count, setCount] = useState(0);'
            },
          ],
        },
        {
          id: 'data-flow',
          title: 'تدفق البيانات',
          summary: 'البيانات تنزل من الآباء للأبناء عبر props، والأحداث تعود للأعلى عبر callbacks.',
          patterns: [
            'Lifting State Up: نقل state للأب المشترك لمنع ازدواجية البيانات.',
            'Controlled Components: إدخال الحقول يديره state.',
            'Prop Drilling: تمرير props كثيرة عبر طبقات؛ يُحل غالبًا بالسياق أو hooks مخصّصة.',
          ],
          snippet: 'onChange في الابن يستدعي setParentState في الأب.'
        },
      ],
    },
    {
      id: 'hooks',
      title: 'Hooks',
      summary: 'دوال تضيف قدرات للمكونات الدالية دون الحاجة لفئات.',
      rules: [
        'يتم استدعاؤها في المستوى الأعلى للمكون، وليس داخل الشروط أو الحلقات.',
        'تبدأ بـ use للحفاظ على التتبع.',
      ],
      children: [
        {
          id: 'state-hooks',
          title: 'Hooks للحالة والتأثير',
          hooks: [
            {
              name: 'useState',
              need: 'حالة محلية بسيطة متغيرة.',
              example: 'const [value, setValue] = useState(initial);'
            },
            {
              name: 'useEffect',
              need: 'تنفيذ تأثير جانبي بعد render مثل جلب بيانات أو تفعيل اشتراك.',
              cleanup: 'إرجاع دالة تنظيف لإلغاء الاشتراك أو إيقاف مؤقت.',
              dependencyRule: 'مرر مصفوفة التبعيات لضبط توقيت التنفيذ.',
              example: 'useEffect(() => { fetchData(); return () => cancel(); }, [id]);'
            },
            {
              name: 'useLayoutEffect',
              need: 'تأثير يعتمد على القياسات ويحتاج التشغيل قبل الرسم للمستخدم.',
              caution: 'استخدمه بحذر لتجنب حظر الرسم.',
            },
            {
              name: 'useInsertionEffect',
              need: 'حقن CSS قبل الرسم (عادةً تستخدمه مكتبات الأنماط).',
            },
          ],
        },
        {
          id: 'ref-hooks',
          title: 'Hooks للمراجع',
          hooks: [
            {
              name: 'useRef',
              need: 'تخزين قيمة قابلة للتغيير لا تُسبب إعادة render أو الوصول لعناصر DOM.',
              example: 'const inputRef = useRef(null);'
            },
            {
              name: 'useImperativeHandle',
              need: 'تعريض واجهة تحكم عند استخدام forwardRef.',
              example: 'useImperativeHandle(ref, () => ({ focus: () => inputRef.current.focus() }));'
            },
            {
              name: 'useId',
              need: 'توليد معرفات مستقرة للنماذج أو aria.',
            },
          ],
        },
        {
          id: 'context-hooks',
          title: 'السياق والمشاركة',
          hooks: [
            {
              name: 'useContext',
              need: 'قراءة قيمة من Context لتجنب Prop Drilling.',
              pattern: 'اجمعه مع useReducer أو useState في موفّر علوي.',
            },
            {
              name: 'useReducer',
              need: 'إدارة حالة معقدة بتدفق ثابت (state, dispatch).',
              example: 'const [state, dispatch] = useReducer(reducer, initialState);',
            },
            {
              name: 'useSyncExternalStore',
              need: 'الاشتراك في مصدر حالة خارجي مع استقرار للأحداث المتزامنة.',
            },
          ],
        },
        {
          id: 'performance-hooks',
          title: 'Hooks للأداء والتحسين',
          hooks: [
            {
              name: 'useMemo',
              need: 'تخزين قيمة مشتقة مكلفة حتى تتغير التبعيات.',
              example: 'const filtered = useMemo(() => items.filter(match), [items, match]);'
            },
            {
              name: 'useCallback',
              need: 'تثبيت دالة لتمريرها كمُدخل لمكونات تعتمد على المراجع.',
              example: 'const handleClick = useCallback(() => save(id), [id]);'
            },
            {
              name: 'useTransition',
              need: 'تعليم تحديثات بأنها غير عاجلة لتحسين تجربة المستخدم.',
            },
            {
              name: 'useDeferredValue',
              need: 'تأجيل قيمة مكلفة أثناء الكتابة ثم تحديثها بسلاسة.',
            },
          ],
        },
        {
          id: 'custom-hooks',
          title: 'Hooks مخصّصة',
          summary: 'تجميع منطق قابل لإعادة الاستخدام مثل جلب البيانات أو التعامل مع النماذج.',
          steps: [
            'ابدأ بـ use لتفعيل قواعد React.',
            'استخدم hooks أخرى داخله لتكوين السلوك.',
            'أرجع القيم والدوال اللازمة فقط لإبقاء الواجهة بسيطة.',
          ],
          example: 'function useFetch(url) { const [data, setData] = useState(null); useEffect(() => fetch(url).then(r => r.json()).then(setData), [url]); return { data }; }'
        },
      ],
    },
    {
      id: 'context-system',
      title: 'السياق وإدارة الحالة المشتركة',
      summary: 'مشاركة البيانات عبر الشجرة بدون تمرير props لكل مستوى.',
      keyPoints: [
        'إنشاء Context عبر createContext.',
        'التغليف بـ <Provider> مع القيمة المراد مشاركتها.',
        'القراءة بـ useContext في الأبناء.',
      ],
      patterns: [
        'Context + useReducer: بديل خفيف لإدارة حالة عالمية.',
        'تقسيم السياق: سياق للقراءة وآخر للأفعال لتقليل إعادة الرسم.',
      ],
      snippet: 'const ThemeContext = createContext(); // <ThemeContext.Provider value={value}>',
    },
    {
      id: 'data-fetching',
      title: 'جلب البيانات والتكامل',
      summary: 'ربط React بواجهات REST أو GraphQL.',
      approaches: [
        'useEffect + fetch: أبسط نهج، تحكم كامل في دورة الحياة.',
        'React Query / SWR: تخزين مؤقت، إعادة محاولة، إدارة حالة التحميل والأخطاء.',
        'Streaming / Suspense: تحميل كسول مع تجزئة.',
      ],
      practicalFlow: [
        'ابدأ بحالة تحميل وخطأ.',
        'نفّذ الجلب داخل useEffect مع إلغاء عند إلغاء التركيب.',
        'خزن البيانات في state ومررها للمكونات الأبناء.',
      ],
    },
    {
      id: 'forms',
      title: 'النماذج والتحكم في المدخلات',
      summary: 'اختيار بين الحقول المحكومة وغير المحكومة حسب السيناريو.',
      options: [
        'Controlled: value وonChange مرتبطة بالـ state.',
        'Uncontrolled: استخدام useRef للوصول للقيمة عند الحاجة.',
        'مكتبات مثل React Hook Form لتقليل إعادة الرسم.',
      ],
      validation: [
        'تحقق فوري عند onChange أو عند الإرسال.',
        'عرض رسائل خطأ ودعم الوصولية عبر aria-describedby.',
      ],
    },
    {
      id: 'routing',
      title: 'التوجيه والتقسيم',
      summary: 'إدارة الصفحات والملاحة غالبًا عبر React Router.',
      concepts: [
        'Routes + Route Elements: مطابقة المسار لعرض مكون.',
        'Navigation: useNavigate للتنقل البرمجي.',
        'Lazy Loading: استخدام React.lazy وSuspense لتقسيم الشفرة.',
      ],
    },
    {
      id: 'performance',
      title: 'الأداء وتجنب إعادة الرسم غير الضرورية',
      summary: 'حافظ على شجرة خفيفة واستفد من المذكرات عند الحاجة فقط.',
      strategies: [
        'تمرير أقل عدد من props متغيرة.',
        'تجزئة الحالة: ضع state في أقرب مستوى يحتاجه.',
        'استخدام React.memo للمكونات التي تعتمد على props مستقرة.',
        'تجنب إنشاء كائنات جديدة داخل render بلا سبب (استخدم useMemo/useCallback).',
      ],
    },
    {
      id: 'testing',
      title: 'الاختبار',
      summary: 'ضمان استقرار السلوك عبر اختبارات الوحدة والتكامل.',
      tools: [
        'Jest: بيئة الاختبار.',
        'React Testing Library: اختبار السلوك من منظور المستخدم.',
      ],
      keySteps: [
        'Render المكون مع الحالة المطلوبة.',
        'محاكاة التفاعلات مثل النقر والكتابة.',
        'التحقق من النتائج المتوقعة على DOM.',
      ],
    },
    {
      id: 'architecture',
      title: 'تصميم مشروع حقيقي',
      summary: 'تجميع المفاهيم لبناء تطبيق متكامل.',
      blueprint: [
        'هيكل المجلدات: src/components, src/hooks, src/context, src/pages.',
        'State Strategy: حالة محلية للمكونات الصغيرة، سياق + Reducer للحالة المشتركة، React Query للبيانات الخارجية.',
        'UI System: مكونات تصميمية قابلة لإعادة الاستخدام (Buttons, Inputs, Layout).',
        'i18n: فصل النصوص في ملفات ترجمة واستخدام مفاتيح.',
        'Build & Tooling: Vite/CRA للتجميع، ESLint + Prettier للاتساق.',
      ],
      deliveryFlow: [
        'تحديد المتطلبات وتجهيز مخطط للصفحات.',
        'بناء المكونات القاعدية ثم الصفحات.',
        'توصيل البيانات عبر fetch/React Query وربط السياقات.',
        'اختبار السيناريوهات الأساسية ونشر التطبيق.',
      ],
    },
  ],
};

module.exports = reactWiki;
