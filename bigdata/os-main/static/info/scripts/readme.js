 (function (window) {
   const M = window.Mishkah = window.Mishkah || {};

   let arREADME = ` بسم الله نبدأ.

# مشكاة

*إطار عمل النور والنظام*

*بنية برمجية (Software Architecture) ذات 7 أركان مستوحاة من أفضل الممارسات البرمجية*

| Build Status | Version | License |
| :---: | :---: | :---: |
| [![CI](https://github.com/USER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/ci.yml) | [![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](https://github.com/USER/REPO/releases/tag/v1.0.0) | [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) |


-----

> **إلى من تاه في أودية \`React\` و \`Angular\`...**
>
> نعلم أنك قد سئمت. سئمت من فوضى \`React\` التي تجعلك تجمع جيشًا من المكتبات المتناحرة لتبني كوخًا، وسئمت من بيروقراطية \`Angular\` التي تجبرك على استصدار ثلاثة تصاريح لتضع حجرًا واحدًا.
>
> لقد بُنيت هذه الأطر لتدير فوضى جيوش المبرمجين في الشركات الضخمة، فكانت النتيجة إما فوضى مُدارة أو نظام مُعقّد. لكن "مشكاة" تطرح سؤالًا جذريًا: **لماذا ندير الفوضى، بينما يمكننا منعها من الأساس؟**
>
> "مشكاة" ليست طريقًا ثالثًا، بل هي عودة إلى الصراط المستقيم. هي منظومة متكاملة مبنية على سنن إلهية ثابتة، هدفها تمكينك من بناء أنظمة مضيئة كنور الله الذي ضرب به المثل.

-----

## الأركان المعمارية السبعة لنظام "مشكاة"

### 1\. مركزية الحالة (State Centralization): العقل المدبر للنظام

**المبدأ:** في أي نظام معقد، الفوضى تبدأ عندما تتعدد مصادر القرار. لهذا، تفرض "مشكاة" مبدأ **المركزية المطلقة للحالة**. كل معلومة يحتاجها تطبيقك، من هوية المستخدم ولغة الواجهة، إلى محتوى المقالات وبيانات النماذج، يجب أن توجد في مكان واحد فقط: كائن \`database\`. هذا الكائن ليس مجرد مخزن بيانات، بل هو **النموذج الكامل لعالم التطبيق (World Model)** في أي لحظة زمنية.

**لماذا هذا المبدأ صارم؟** لأن الحالة الموزعة (مثل \`useState\` المنتشر في مكونات React) تخلق كابوسًا من الأسئلة: أي حالة هي الصحيحة الآن؟ لماذا لم يتم تحديث هذا المكون مع ذاك؟ تتبع الأخطاء يصبح عملية تنقيب مضنية.

في "مشكاة"، واجهة المستخدم هي انعكاس بصري مباشر وصادق للحقيقة الموجودة في \`database\`. لا مجال للكذب أو عدم التزامن. هذا يفتح الباب لتقنيات متقدمة مثل **التصحيح عبر السفر الزمني (Time-Travel Debugging)**، حيث يمكن تسجيل سلسلة من الحالات والتنقل بينها لفهم كيف تطور النظام.

#### التطبيق التقني:

تصبح عمليات التحديث شفافة ويمكن التنبؤ بها. كل تغيير هو مجرد دالة تأخذ الحالة القديمة وتعيد الحالة الجديدة.

\`\`\`javascript
// \`database\`: هو العقل الذي يحتوي على كل حقائق النظام.
const database = {
  env: { theme: 'dark', lang: 'ar' },
  user: { name: 'زائر', loggedIn: false, visits: 1 },
  cart: { items: [], total: 0 }
};

// أي مكون هو مجرد قارئ أمين لهذه الحقائق.
function Navbar(db) {
  const userName = db.user.name;
  const cartCount = db.cart.items.length;
  // ... يعرض واجهة مبنية على هذه البيانات
}

// التغييرات لا تحدث عشوائيًا، بل عبر "أوامر" مركزية ومنظمة.
// تخيل أن هذا الأمر يتم استدعاؤه عند تسجيل الدخول.
function handleLogin(currentUser) {
  // لا نعدل الحالة مباشرة، بل نصف التغيير المطلوب.
  // إطار العمل يتولى تحديث الـ \`database\` وإعادة التصيير.
  app.setState(currentState => {
    return {
      ...currentState, // ننسخ الحالة القديمة
      user: { // ونحدث فقط الجزء الخاص بالمستخدم
        ...currentUser,
        loggedIn: true,
        visits: currentState.user.visits + 1
      }
    };
  });
}
\`\`\`

بهذه الطريقة، يصبح تدفق البيانات في التطبيق واضحًا وسهل التتبع كنهر يجري في مسار واحد.

-----

### 2\. لغة تعريفية مُحكَمة (A Constrained DSL): عقد بَنّاء وآمن

**المبدأ:** لغات القوالب التقليدية (مثل JSX) تمنح حرية خطيرة، فهي تسمح بخلط منطق العرض مع منطق العمل والوصول للبيانات في مكان واحد، مما ينتج عنه مكونات هجينة ومعقدة. "مشكاة" تقدم بديلاً: **لغة تعريفية خاصة (DSL) تعمل كعقد صارم**.

هذا العقد يفرض **فصلًا قاطعًا بين بنية المكون (\`attributes\`) وسلوكه (\`events\`)**. أنت لا تكتب خليطًا من HTML و JavaScript، بل تصف بنية واجهتك باستخدام مفردات محددة وواضحة تمنعك من ارتكاب الأخطاء. يتم ربط السلوك (ماذا يحدث عند النقر) بشكل غير مباشر عبر مفاتيح (\`gkeys\`)، مما يبقي منطق العمل مركزيًا ومنظمًا في ملف \`orders\`.

#### التطبيق التقني:

لاحظ كيف تفصل اللغة بين "شكل" الزر و"وظيفة" الزر.

\`\`\`javascript
const D = Mishkah.DSL;

// 1. تعريف الشكل (في ملف المكون)
// هذا الكود يصف "ما هو" الزر، ولا علاقة له بما "يفعله".
function CloseButton() {
  return D.Forms.Button({
    attrs: {
      class: 'btn btn-danger',
      'aria-label': 'إغلاق',
      'data-m-gkey': 'ui:window-close' // مفتاح يربط الزر بوظيفته
    }
  }, ['X']);
}

// 2. تعريف الوظيفة (في ملف الأوامر \`orders.js\`)
// هذا الكود يصف "ماذا يحدث" عندما يُستدعى المفتاح \`ui:window-close\`.
const orders = {
  'ui.window.close': { // لاحظ كيف يطابق المفتاح \`gkey\` مع تعديل بسيط
    on: ['click'],
    gkeys: ['ui:window-close'],
    handler: (event, context) => {
      // منطق إغلاق النافذة يكتب هنا
      console.log('Window is closing...');
      // يمكنه أيضًا تحديث الحالة
      context.setState(s => ({ ...s, windowOpen: false }));
    }
  }
};
\`\`\`

هذا الفصل ليس خيارًا، بل هو إجبار يضمن أن مكوناتك تبقى بسيطة، قابلة لإعادة الاستخدام، وسهلة الاختبار.

-----

### 3\. التصنيف الوظيفي للذرات (Functional Atom Classification): وحدات بناء ذكية

**المبدأ:** التعامل المباشر مع وسوم HTML يشبه التعامل مع الطوب والأسمنت الخام. إنه ممكن، لكنه عرضة للأخطاء. "مشكاة" تقدم **"ذرات" (\`Atoms\`)**: وهي أغلفة ذكية حول وسوم HTML، مصنفة في فئات وظيفية (\`Forms\`, \`Text\`, \`Containers\`, \`Media\`).

كل ذرة ليست مجرد اسم بديل للوسم، بل هي **وحدة بنائية تفهم سياقها وقواعدها**. الذرة \`D.Forms.Textarea\` تعرف أنها تتطلب خاصية \`value\` وليس \`text\`. الذرة \`D.Media.Image\` يمكن برمجتها لرفض الإنشاء إذا لم يتم تزويدها بخاصية \`alt\` الضرورية لإمكانية الوصول. هذا يحول عملية البناء من عمل يدوي معرض للخطأ إلى عملية تركيب **وحدات ذكية وآمنة**.

#### التطبيق التقني:

الذرات تفرض أفضل الممارسات وتحميك من الأخطاء البديهية.

\`\`\`javascript
const D = Mishkah.DSL;

// مثال 1: ذرة الصورة تفرض إمكانية الوصول
// هذا الكود قد يفشل في الإنشاء إذا لم توفر \`alt\` (حسب الإعدادات)
const profilePicture = D.Media.Image({
  attrs: {
    src: '/path/to/image.jpg',
    alt: 'صورة المستخدم عبد الله' // خاصية إجبارية
  }
});

// مثال 2: ذرة الرابط تحمي من الثغرات الأمنية
// هذه الذرة تضيف تلقائيًا \`rel="noopener noreferrer"\` عند استخدام \`target="_blank"\`
const externalLink = D.Text.A({
  attrs: {
    href: 'https://example.com',
    target: '_blank'
  }
}, ['رابط خارجي آمن']);
\`\`\`

-----

### 4\. مكتبة مكونات قابلة للتركيب (Composable Component Library): تسريع وتوحيد البناء

**المبدأ:** إذا كانت "الذرات" هي الطوب، فإن **مكونات \`mishkah-ui\`** هي الجدران والأعمدة الجاهزة. فبدلاً من بناء "بطاقة" (\`Card\`) في كل مرة من ذرات \`div\` و \`h2\` و \`p\`، تستخدم \`UI.Card\` الذي يغلف كل هذا التعقيد ويوفر واجهة بسيطة.

هذه المكتبة تضمن **الاتساق البصري والوظيفي** عبر التطبيق بأكمله، وتطبق أفضل الممارسات في إمكانية الوصول والأداء بشكل مدمج. إنها تجسيد حقيقي لمبدأ **"لا تكرر نفسك" (DRY)**.

#### التطبيق التقني:

بناء واجهات معقدة يصبح عملية تجميع سريعة وممتعة.

\`\`\`javascript
const UI = Mishkah.UI;
const D = Mishkah.DSL;

// بناء مربع حوار (Dialog) معقد بسطرين
// هذا المكون يعالج تلقائيًا أمورًا مثل:
// - إدارة التركيز (Focus Trapping) داخل الحوار
// - إغلاق الحوار عند الضغط على زر Escape
// - السمات البصرية المتوافقة مع النظام
const confirmationDialog = UI.Dialog({
  trigger: UI.Button({}, ['حذف العنصر']),
  title: 'تأكيد الحذف',
  description: 'هل أنت متأكد من رغبتك في حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.',
  footer: D.Containers.Div({ class: 'hstack' }, [
    UI.Button({ variant: 'secondary' }, ['إلغاء']),
    UI.Button({ variant: 'danger' }, ['نعم، احذف'])
  ])
});
\`\`\`

-----

### 5\. بيئة عالمية متكاملة (Integrated Global Environment): جاهزية فطرية للعالمية

**المبدأ:** الميزات العالمية مثل تعدد اللغات والسمات ليست رفاهية، بل هي جزء من بنية التطبيق الأساسية. في "مشكاة"، هذه الميزات ليست مكتبات يتم تركيبها لاحقًا، بل هي **خصائص فطرية في النواة**، تُدار مباشرة من \`database\`.

  * **التدويل (i18n):** تغيير قيمة \`database.env.lang\` هو كل ما يلزم لترجمة الواجهة بالكامل.
  * **السمات (Theming):** تغيير \`database.env.theme\` يغير تلقائيًا كل الألوان والأنماط في التطبيق.
  * **اتجاه النص (RTL/LTR):** يتغير تلقائيًا مع اللغة، مما يضمن تجربة مستخدم أصيلة.

#### التطبيق التقني:

تصبح إدارة هذه الميزات جزءًا طبيعيًا من إدارة الحالة.

\`\`\`javascript
// 1. الحالة تعرف كل شيء
const database = {
  env: { theme: 'light', lang: 'en', dir: 'ltr' },
  i18n: {
    // قواميس الترجمة
    en: { greeting: 'Hello' },
    ar: { greeting: 'مرحباً' }
  }
  // ... باقي الحالة
};

// 2. المكون يستخدم الترجمة
function Greeting(db) {
  const message = db.i18n[db.env.lang]?.greeting || 'Welcome';
  return D.Text.H1({}, [message]);
}

// 3. أمر بسيط يغير اللغة والاتجاه
const orders = {
  'lang.switchToArabic': {
    on: ['click'], gkeys: ['lang-ar-btn'],
    handler: (e, ctx) => {
      ctx.setState(s => ({
        ...s,
        env: { ...s.env, lang: 'ar', dir: 'rtl' }
      }));
    }
  }
};
\`\`\`

-----

### 6\. أدوات مساعدة معيارية (Standardized Utilities): صندوق أدوات موحد

**المبدأ:** لضمان الاتساق ومنع فوضى الاعتماديات، توفر "مشكاة" مكتبة أدوات مساعدة (\`Mishkah.utils\`) تغطي المهام الشائعة. فبدلاً من أن يستخدم كل مطور مكتبته المفضلة للتعامل مع \`localStorage\` أو \`fetch\`، توفر "مشكاة" واجهة موحدة.

هذا يقلل من حجم التطبيق، ويوحد طريقة كتابة الكود، ويجعل الصيانة أسهل بكثير.

#### التطبيق التقني:

التعامل مع واجهات المتصفح يصبح منظمًا وموحدًا.

\`\`\`javascript
const U = Mishkah.utils;

const orders = {
  'user.fetchProfile': {
    // ...
    handler: async (e, ctx) => {
      try {
        // استخدام الأداة الموحدة للشبكة بدلاً من fetch مباشرة
        const userProfile = await U.Net.get('/api/user/profile');
        ctx.setState(s => ({ ...s, user: userProfile }));

        // استخدام الأداة الموحدة للتخزين المحلي
        U.Storage.local.set('user-profile', userProfile, { ttl: 3600 });
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    }
  }
};
\`\`\`
بسم الله. لقد وصلت إلى النقطة التي يتمايز فيها الفكر المعماري الأصيل عن التقليد. إن صياغة هذا الركن السابع ليست مجرد توثيق، بل هي إعلان عن ميثاق هندسي يضع القوة والمسؤولية في يد الخالق الواعي.

إليك صياغة البند السابع بلغة هندسية وعلمية، كما طلبت، لتكون منارة توضح الفلسفة وترد على الشبهات.

-----

### **7. الاستجابة الفطرية والتحكم الواعي (Reactive by Default, Mastery on Demand)**

**المبدأ:** الأصل في الخلق أن الجسد يعبر عن حال روحه بلا استئذان ولا تأخير. لذلك أصبحت "مشكاة" **تفاعلية بالفطرة**: ما إن تستدعي \`setState()\` حتى يتكفّل الإطار بمزامنة الـ VDOM والـ DOM آليًا في الإطار التالي، دون انتظار أمر صريح. إنها عودة إلى السليقة: "مَا كَانَ لِأَهْلِ ٱلۡمَدِينَةِ وَمَنۡ حَوۡلَهُمۡ مِّنَ ٱلۡأَعۡرَابِ أَن يَتَخَلَّفُواْ عَن رَّسُولِ ٱللَّهِ وَلَا يَرۡغَبُواْ بِأَنفُسِهِمۡ عَن نَّفۡسِهِ"؛ كذلك واجهة التطبيق لا تتخلف عن حالة روحها (database)، بل تلحق بها طاعةً معروفة.

**ما الذي تغير في النواة؟**

* \`setState()\` أصبح يشعل التحديث تلقائيًا. لا حاجة لنداء إضافي كي ينعكس التغيير؛ التزامن يحدث بالجدولة الذكية نفسها التي كانت تقود \`rebuild()\` سابقًا.
* تمت إضافة ثلاث أدوات سيادية للتحكم المتقدم:
  * \`freeze()\` / \`unfreeze()\` لتجميد النبض وجمع عدة تحديثات في دفعة واحدة.
  * \`flush(opts)\` لفرض إعادة البناء حالًا مع نفس خيارات \`rebuild\` التاريخية (\`keepScroll\`, \`except\`, \`buildOnly\`) وأيضًا خيار \`force\` عند الحاجة.
  * عدّادات مراقبة مثل \`isFrozen()\` و\`isDirty()\` لمن يريد رؤية الحالة الدقيقة للنواة.
* أصبح \`rebuild()\` واجهة توافق تستدعي \`flush()\` تحت الغطاء. الاستدعاءات القديمة تظل تعمل بلا كسر، لكنها الآن زائدة عن الحاجة في السيناريوهات الاعتيادية.

**القوة الاحتياطية: التحكم الجراحي متى طلبتَه.** التزامن الفطري لا يعني فقدان القوة، بل يضعها في موضعها الصحيح: عند الطلب. عندما تحتاج إلى توجيه النواة بدقة جراحية، تظل خيارات \`flush()\` (و\`rebuild()\` بوصفه بوابة توافق) متاحة بكل ما فيها من تركيز (\`buildOnly\`)، واستثناء (\`except\`)، وحفظ للتمرير (\`keepScroll\`). بل أصبح بمقدورك المزج بين هذه الخيارات وبين عمق التجميد، لتتحكم باللحظة التي ينطلق فيها النور.

\`\`\`javascript
// التفاعل الفطري: لا حاجة لنداء إضافي
ctx.setState(s => ({ ...s, counter: s.counter + 1 }));

// دفعة متقنة: تجميد ثم إطلاق تحديث واحد
ctx.batch(ctx => {
  ctx.setState(s => ({ ...s, loading: true }));
  ctx.setState(s => ({ ...s, data: fetchFreshData() }));
}); // unfreeze() يحدث تلقائيًا داخل batch

// تحكم جراحي عند الطلب
ctx.flush({
  keepScroll: ['#list'],
  except: ['#chart'],
  buildOnly: ['#list']
});

// التوافق محفوظ: rebuild ما زال يعمل كاختصار لـ flush
ctx.rebuild({ except: ['#legacy-widget'] });
\`\`\`

#### **الرؤية المستقبلية: طاعة معروفة وقوة محفوظة**

بجعل الاستجابة تلقائية، رفعنا سقف اليقين: كل مناداة لـ \`setState()\` تُترجم إلى واقع بلا جهد إضافي، بينما بقيت بوابة القوة لمن يطلبها. عندما يصرّح المطوّر بـ \`flush()\` أو \`freeze()\`، فهو يمارس سلطة واعية على نظام مطيع. هكذا نجمع بين نور الطاعة الفطرية وذكاء الحوكمة الدقيقة، لنحافظ على التزام الواجهة بروحها، ونمنحك مفاتيح السيطرة حين ترغب في جراحة دقيقة أو بروتوكولات تدقيق متقدمة.
-----

الآن بعد تكلمنا عن أركان نواة مشكاة السبعة

نتكلم عن أركان نظام الحماية و الأمان و التقييم الثلاثي المتكون من ثلاثة كيانات أساسية

### \. ثلاثية الحوكمة (The Governance Triad): جهاز المناعة للنظام

**المبدأ:** لضمان بقاء النظام صحيًا ومتينًا على المدى الطويل، توفر "مشكاة" نظام حوكمة آلي متكامل من ثلاثة أجزاء، يعمل كجهاز مناعة للتطبيق.

  * **أ. الحارس (Guardian): الدفاع الوقائي:**
    يعمل كجدار ناري يمنع الأخطاء والثغرات الأمنية **قبل وقوعها**. يفرض قوانين صارمة على مستوى الـ VDOM، مثل منع الوسوم الخطيرة أو فرض خصائص أمان معينة. إنه يمثل **الوقاية** خير من العلاج.

  * **ب. الرقيب (Auditor): المراقبة والتشخيص:**
    يعمل كطبيب يسجل كل الأعراض والسلوكيات في التطبيق. يراقب أداء المكونات، ويلتزم بأفضل الممارسات، ويسجل أي انحراف عن المعايير في سجل دقيق، مع إعطاء تقييم كمي (درجة من -7 إلى +7) لكل حدث. إنه يمثل **التشخيص** الدقيق للمشاكل.

  * **ج. أدوات المطور (DevTools): الحكم والعلاج:**
    تعمل كهيئة قضائية تحلل سجلات "الرقيب" وتصدر أحكامًا آلية. المكونات ذات السجل الممتاز تتم ترقيتها، بينما المكونات ذات السجل السيء يتم عزلها ووضعها في قائمة المراجعة الإجبارية. إنه يمثل **العلاج** المبني على بيانات.

#### التطبيق التقني (مُجمّع):

\`\`\`javascript
// 1. الحارس يمنع خطأً أمنيًا بشكل استباقي
// لن يتم تصيير هذا الرابط أبدًا لأنه يخالف قواعد الأمان
const maliciousLink = D.Text.A({ attrs: { href: 'javascript:alert("XSS")' } });

// 2. الرقيب يسجل مخالفة لجودة تجربة المستخدم
function CountrySelector(db) {
  if (db.countries.length > 50) {
    // سيتم تسجيل درجة "-3" في سجل هذا المكون
    Mishkah.Auditor.grade('-3', 'CountrySelector', 'Too many options in dropdown');
  }
  // ...
}

// 3. أدوات المطور تصدر حكمًا بناءً على البيانات المتراكمة
// بعد فترة، قد يظهر هذا التقرير في وحدة التحكم:
// | component       | verdict   | score | notes                              |
// |-----------------|-----------|-------|------------------------------------|
// | 'CountrySelector' | HELL      | -65   | Consistent UX violations           |
\`\`\`

`;

 let enREADME = `

-----

# Mishkah

*Framework of Light and Order*

*A 7-Pillar Software Architecture Inspired by First Principles*



| Build Status | Version | License |
| :---: | :---: | :---: |
| [![CI](https://github.com/USER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/ci.yml) | [![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](https://github.com/USER/REPO/releases/tag/v1.0.0) | [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) |

-----

> **To those lost in the valleys of \`React\` and \`Angular\`...**
>
> We know you're tired. Tired of the chaos of \`React\`, which requires an army of warring libraries just to build a simple hut. Tired of the bureaucracy of \`Angular\`, which demands three permits just to lay a single brick.
>
> Those frameworks were built to manage the chaos of massive teams in huge corporations. The result was either managed chaos or managed complexity. But Mishkah asks a radical question: **Why manage chaos when you can prevent it from ever taking root?**
>
> Mishkah isn't a third way; it is a return to the straight path. It is a complete, integrated system built on immutable, foundational principles, designed to empower you to build applications as luminous as the light in the parable.

## The 7 Architectural Pillars of Mishkah

-----

### 1\. State Centralization: The Single Source of Truth

**Principle:** In any complex system, chaos begins when there are multiple sources of truth. Mishkah, therefore, enforces the principle of **absolute state centralization**. Every piece of information your application needs—from user identity and UI language to article content and form data—must exist in one and only one place: the \`database\` object. This object is not merely a data store; it is the **complete World Model** of your application at any given moment.

**Why is this principle so strict?** Because distributed state (like the proliferation of \`useState\` in React components) creates a nightmare of questions: Which state is the correct one now? Why didn't this component update with that one? Debugging becomes a painful archeological dig.

In Mishkah, the UI is a direct, honest, and visual reflection of the truth held in the \`database\`. There is no room for lies or desynchronization. This unlocks advanced capabilities like **Time-Travel Debugging**, where a series of states can be recorded and traversed to understand precisely how the system evolved.

#### Technical Implementation:

State updates become transparent and predictable. Every change is merely a function that takes the old state and returns the new state.

\`\`\`javascript
// The \`database\` is the mind that contains all system facts.
const database = {
  env: { theme: 'dark', lang: 'en' },
  user: { name: 'Guest', loggedIn: false, visits: 1 },
  cart: { items: [], total: 0 }
};

// Any component is just a faithful reader of these facts.
function Navbar(db) {
  const userName = db.user.name;
  const cartCount = db.cart.items.length;
  // ...renders a UI based on this data
}

// Changes don't happen randomly, but through centralized, organized "orders".
// Imagine this order is called upon login.
function handleLogin(currentUser) {
  // We don't mutate the state directly; we describe the desired change.
  // The framework handles updating the \`database\` and re-rendering.
  app.setState(currentState => {
    return {
      ...currentState, // Copy the old state
      user: {          // And update only the user slice
        ...currentUser,
        loggedIn: true,
        visits: currentState.user.visits + 1
      }
    };
  });
}
\`\`\`

With this approach, the data flow in your application becomes as clear and easy to follow as a river in a single channel.

-----

### 2\. A Constrained DSL: A Secure and Constructive Contract

**Principle:** Traditional template languages (like JSX) grant a dangerous amount of freedom. They allow you to mix display logic, business logic, and data access in one place, resulting in hybrid, complex components. Mishkah offers an alternative: a **Domain-Specific Language (DSL) that acts as a strict contract**.

This contract enforces a **clean separation between a component's structure (\`attributes\`) and its behavior (\`events\`)**. You don't write a mix of HTML and JavaScript; you describe your UI's structure using a specific and clear vocabulary that prevents you from making mistakes. Behavior (what happens on click) is linked indirectly via keys (\`gkeys\`), keeping the business logic centralized and organized in the \`orders\` file.

#### Technical Implementation:

Notice how the language separates the "form" of the button from its "function."

\`\`\`javascript
const D = Mishkah.DSL;

// 1. Define the Form (in the component file)
// This code describes "what" the button is, not what it "does".
function CloseButton() {
  return D.Forms.Button({
    attrs: {
      class: 'btn btn-danger',
      'aria-label': 'Close',
      'data-m-gkey': 'ui:window-close' // A key that links the button to its function
    }
  }, ['X']);
}

// 2. Define the Function (in the \`orders.js\` file)
// This code describes "what happens" when the 'ui:window-close' key is invoked.
const orders = {
  'ui.window.close': { // Note how the key matches the gkey with a minor change
    on: ['click'],
    gkeys: ['ui:window-close'],
    handler: (event, context) => {
      // The logic for closing the window is written here
      console.log('Window is closing...');
      // It can also update the state
      context.setState(s => ({ ...s, windowOpen: false }));
    }
  }
};
\`\`\`

This separation isn't a choice; it's an enforcement that guarantees your components remain simple, reusable, and easy to test.

-----

### 3\. Functional Atom Classification: Intelligent Building Blocks

**Principle:** Interacting directly with HTML tags is like working with raw bricks and mortar. It's possible, but it's prone to error. Mishkah introduces **"Atoms"**: intelligent wrappers around HTML tags, classified into functional categories (\`Forms\`, \`Text\`, \`Containers\`, \`Media\`).

Each Atom is not just an alias for a tag; it is a **building block that understands its context and rules**. The \`D.Forms.Textarea\` Atom knows it requires a \`value\` property, not \`text\`. The \`D.Media.Image\` Atom can be programmed to refuse creation if it's not provided with an \`alt\` property, which is essential for accessibility. This transforms development from an error-prone manual process into an assembly of **smart, safe units**.

#### Technical Implementation:

Atoms enforce best practices and protect you from common mistakes.

\`\`\`javascript
const D = Mishkah.DSL;

// Example 1: The Image atom enforces accessibility
// This code may fail to build if \`alt\` is not provided (depending on settings)
const profilePicture = D.Media.Image({
  attrs: {
    src: '/path/to/image.jpg',
    alt: 'User profile picture of Abdullah' // Mandatory property
  }
});

// Example 2: The Anchor atom protects against security vulnerabilities
// This atom automatically adds \`rel="noopener noreferrer"\` when \`target="_blank"\` is used
const externalLink = D.Text.A({
  attrs: {
    href: 'https://example.com',
    target: '_blank'
  }
}, ['A Safe External Link']);
\`\`\`

-----

### 4\. Composable Component Library: Accelerate and Unify Development

**Principle:** If Atoms are the bricks, then **\`mishkah-ui\` components** are the prefabricated walls and columns. Instead of building a \`Card\` every time from \`div\`, \`h2\`, and \`p\` Atoms, you use \`UI.Card\`, which encapsulates all that complexity behind a simple interface.

This library ensures **visual and functional consistency** across the entire application and implements accessibility and performance best practices by default. It is a true embodiment of the **"Don't Repeat Yourself" (DRY)** principle.

#### Technical Implementation:

Building complex interfaces becomes a fast and enjoyable assembly process.

\`\`\`javascript
const UI = Mishkah.UI;
const D = Mishkah.DSL;

// Build a complex Dialog with two lines of code
// This component automatically handles things like:
// - Focus Trapping within the dialog
// - Closing the dialog on 'Escape' key press
// - System-compatible visual themes
const confirmationDialog = UI.Dialog({
  trigger: UI.Button({}, ['Delete Item']),
  title: 'Confirm Deletion',
  description: 'Are you sure you want to delete this item? This action cannot be undone.',
  footer: D.Containers.Div({ class: 'hstack' }, [
    UI.Button({ variant: 'secondary' }, ['Cancel']),
    UI.Button({ variant: 'danger' }, ['Yes, Delete'])
  ])
});
\`\`\`

-----

### 5\. Integrated Global Environment: Natively Global-Ready

**Principle:** Global features like multi-language support and theming are not afterthoughts; they are part of the application's core architecture. In Mishkah, these features are not libraries to be installed later, but **innate properties of the kernel**, managed directly from the \`database\`.

  * **Internationalization (i18n):** Changing \`database.env.lang\` is all it takes to translate the entire UI.
  * **Theming:** Changing \`database.env.theme\` automatically alters all colors and styles in the application.
  * **Text Direction (RTL/LTR):** Changes automatically with the language, ensuring an authentic user experience.

#### Technical Implementation:

Managing these features becomes a natural part of state management.

\`\`\`javascript
// 1. The state knows everything
const database = {
  env: { theme: 'light', lang: 'en', dir: 'ltr' },
  i18n: {
    // Translation dictionaries
    en: { greeting: 'Hello' },
    ar: { greeting: 'مرحباً' }
  }
  // ...rest of state
};

// 2. The component uses the translation
function Greeting(db) {
  const message = db.i18n[db.env.lang]?.greeting || 'Welcome';
  return D.Text.H1({}, [message]);
}

// 3. A simple order changes the language and direction
const orders = {
  'lang.switchToArabic': {
    on: ['click'], gkeys: ['lang-ar-btn'],
    handler: (e, ctx) => {
      ctx.setState(s => ({
        ...s,
        env: { ...s.env, lang: 'ar', dir: 'rtl' }
      }));
    }
  }
};
\`\`\`

-----

### 6\. Standardized Utilities: A Unified Toolbox

**Principle:** To ensure consistency and prevent dependency chaos, Mishkah provides a utility library (\`Mishkah.utils\`) covering common tasks. Instead of each developer using their favorite library for \`localStorage\` or \`fetch\`, Mishkah offers a unified interface.

This reduces the application's bundle size, standardizes coding patterns, and makes maintenance significantly easier.

#### Technical Implementation:

Interacting with browser APIs becomes organized and uniform.

\`\`\`javascript
const U = Mishkah.utils;

const orders = {
  'user.fetchProfile': {
    // ...
    handler: async (e, ctx) => {
      try {
        // Use the unified network utility instead of fetch directly
        const userProfile = await U.Net.get('/api/user/profile');
        ctx.setState(s => ({ ...s, user: userProfile }));

        // Use the unified storage utility
        U.Storage.local.set('user-profile', userProfile, { ttl: 3600 });
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    }
  }
};
\`\`\`

-----

### **7. Native Reactivity & Conscious Control (Reactive by Default, Mastery on Demand)**

**Principle:** The natural order is for the body to mirror the state of its soul without hesitation. Mishkah now embraces that fitrah: \`setState()\` automatically schedules a render in the next frame. No extra incantations, no hidden toggles—just truthful synchronization between database and DOM.

> "But never let the people of Madinah or the nomads around them stay behind the Messenger of Allah or prefer their own lives over his." The interface, likewise, no longer lags behind its living state; it follows with a known obedience.

**What changed inside the core?**

* \`setState()\` is now reactive by default. The same smart scheduler that powered \`rebuild()\` now runs automatically.
* Three advanced governance tools ship with the new kernel:
  * \`freeze()\` / \`unfreeze()\` to hold updates, batch mutations, and release one decisive flush.
  * \`flush(opts)\` for immediate renders with the legacy knobs you already know (\`keepScroll\`, \`except\`, \`buildOnly\`) plus an optional \`force\` override.
  * Diagnostic probes like \`isFrozen()\` and \`isDirty()\` for those who need precise insight into the render queue.
* \`rebuild()\` lives on as a compatibility façade over \`flush()\`. Legacy code keeps working untouched, even though the extra call is no longer required.

**Reserved power, on demand.** Automatic reactivity does not dilute control—it places it exactly where it belongs: at your explicit request. When you need surgical targeting, \`flush()\` (or \`rebuild()\`) still honours focus, exclusion, and scroll preservation, and you can blend these with freeze depths to choreograph the perfect release of light.

\`\`\`javascript
// Fitrah in action: no manual rebuild needed
ctx.setState(s => ({ ...s, counter: s.counter + 1 }));

// Graceful batching: freeze, mutate, release once
ctx.batch(ctx => {
  ctx.setState(s => ({ ...s, loading: true }));
  ctx.setState(s => ({ ...s, data: fetchFreshData() }));
});

// Surgical override when demanded
ctx.flush({
  keepScroll: ['#list'],
  except: ['#chart'],
  buildOnly: ['#list']
});

// Backwards compatibility: rebuild still works
ctx.rebuild({ except: ['#legacy-widget'] });
\`\`\`

#### **Future Vision: Obedience by Default, Authority by Choice**

By making reactivity native, we lifted the floor: every \`setState()\` now lands in the UI without extra ceremony. Yet the ceiling of control remains, safeguarded behind deliberate invocations of \`flush()\`, \`freeze()\`, and their kin. You gain instant clarity for everyday flows, and you keep the governance gateway for audits, sandboxing, and mission-critical choreography.
-----
Now that we've discussed the seven pillars of the Mishkat nucleus,

let's talk about the rules of protection, security, and the triple assessment made up of three creatures in the stage.

-----


### \. The Governance Triad: The System's Immune System

**Principle:** To ensure the system remains healthy and robust over the long term, Mishkah provides an integrated, three-part automated governance system that acts as the application's immune system.

  * **A. The Guardian: Proactive Defense:**
    Acts as a firewall that prevents errors and security vulnerabilities **before they happen**. It enforces strict rules at the VDOM level, such as blocking dangerous tags or enforcing specific security attributes. It embodies **prevention** over cure.

  * **B. The Auditor: Monitoring and Diagnosis:**
    Acts as a doctor that logs all symptoms and behaviors in the application. It monitors component performance, adheres to best practices, and records any deviation from standards in a detailed log, assigning a quantitative score (-7 to +7) to each event. It represents precise **diagnosis** of problems.

  * **C. The DevTools: Judgment and Treatment:**
    Acts as a judicial body that analyzes the Auditor's logs and issues automated verdicts. Components with excellent records are promoted, while those with poor records are isolated and placed on a mandatory review list. It represents data-driven **treatment**.

#### Technical Implementation (Aggregated):

\`\`\`javascript
// 1. The Guardian proactively prevents a security error
// This link will never be rendered because it violates security rules
const maliciousLink = D.Text.A({ attrs: { href: 'javascript:alert("XSS")' } });

// 2. The Auditor logs a UX quality violation
function CountrySelector(db) {
  if (db.countries.length > 50) {
    // A score of "-3" will be logged for this component's record
    Mishkah.Auditor.grade('-3', 'CountrySelector', 'Too many options in dropdown');
  }
  // ...
}

// 3. The DevTools issues a verdict based on accumulated data
// After some time, this report might appear in the console:
// | component       | verdict   | score | notes                      |
// |-----------------|-----------|-------|----------------------------|
// | 'CountrySelector' | HELL      | -65   | Consistent UX violations   |
\`\`\`
`;



let ar_README_BASE =`

# دستور "مشكاة": ميثاق النور والنظام

﴿اللَّهُ نُورُ السَّمَاوَاتِ وَالْأَرْضِ ۚ مَثَلُ نُورِهِ كَمِشْكَاةٍ فِيهَا مِصْبَاحٌ ۖ الْمِصْبَاحُ فِي زُجَاجَةٍ ۖ الزُّجَاجَةُ كَأَنَّهَا كَوْكَبٌ دُرِّيٌّ يُوقَدُ مِن شَجَرَةٍ مُّبَارَكَةٍ زَيْتُونَةٍ لَّا شَرْقِيَّةٍ وَلَا غَرْبِيَّةٍ يَكَادُ زَيْتُهَا يُضِيءُ وَلَوْ لَمْ تَمْسَسْهُ نَارٌ ۚ نُّورٌ عَلَىٰ نُورٍ ۗ يَهْدِي اللَّهُ لِنُورِهِ مَن يَشَاءُ ۚ وَيَضْرِبُ اللَّهُ الْأَمْثَالَ لِلنَّاسِ ۗ وَاللَّهُ بِكُلِّ شَيْءٍ عَلِيمٌ﴾ (النور: 35)

| Build Status | Version | License |
| :---: | :---: | :---: |
| [](https://github.com/USER/REPO/actions/workflows/ci.yml) | [](https://github.com/USER/REPO/releases/tag/v1.0.0) | [](https://www.google.com/search?q=./LICENSE) |

-----

> **إلى من تاه في أودية البرمجيات الحديثة...**
>
> لقد بُنيت أطر العمل المعاصرة لتدير فوضى جيوش المبرمجين في الشركات الضخمة، فكانت النتيجة إما فوضى مُدارة أو نظام مُعقّد. لكن "مشكاة" لا تأتي كطريق ثالث، بل هي **عودة إلى الصراط المستقيم** في الهندسة. هي دعوة للتوقف عن إدارة الفوضى، والبدء ببناء **النظام** الذي يمنعها من الأساس، مستلهمين ذلك من سنن الله التي لا تتبدل، والتي بها قام الكون.

-----

## أركان النواة السبعة: تجليات السُنَن الإلهية في الكود

إن بناء أي نظام متين، سواء كان كونًا أو تطبيقًا، لا يقوم على العشوائية، بل على قوانين وأركان ثابتة. هذه هي أركان "مشكاة" السبعة التي تجعل من بناء البرمجيات عملاً منضبطًا كنظام الكواكب.

### 1\. توحيد مصدر الحقيقة (The One Source of Truth): لا إله إلا هو

**المبدأ الإيماني:** أعظم أصل في رسالة كل الأنبياء هو التوحيد. ﴿لَوْ كَانَ فِيهِمَا آلِهَةٌ إِلَّا اللَّهُ لَفَسَدَتَا﴾. إن وجود مصادر متعددة للحقيقة والسلطة يؤدي حتمًا إلى الفساد والتنازع. وكما أن للكون إله واحد، يجب أن يكون لتطبيقك مصدر حقيقة واحد لا ينازعه في ملكه منازع.

**التجلي الهندسي:** أي محاولة لخلق حالة (\`state\`) متفرقة في المكونات هي "شرك برمجي" يؤدي إلى فوضى لا يمكن السيطرة عليها. "مشكاة" تفرض أن يكون كائن \`database\` هو المصدر الأوحد والأوحد للحقيقة. الواجهة الرسومية ليست إلا انعكاسًا صادقًا وأمينًا لما في هذا المصدر. هذا المبدأ الصارم يمنحك يقينًا مطلقًا وقدرة على فهم تدفق البيانات كنهر يجري في مسار واحد معلوم.

#### التطبيق العملي:

\`\`\`javascript
// \`database\`: هو تجسيد مبدأ التوحيد. كل حقائق النظام هنا ولا مكان آخر.
const database = {
  env: { theme: 'dark', lang: 'ar' },
  user: { name: 'عبد الله', loggedIn: true },
};

// أي مكون هو عبدٌ مطيع يقرأ من هذا المصدر، لا يخلق حقيقة من عنده.
function Navbar(db) {
  const userName = db.user.name;
  return D.Text.Span({}, [\`مرحباً يا \${userName}\`]);
}

// التغيير لا يحدث إلا بأمر مركزي (Order)، يصف التحول من حالة إلى أخرى.
function handleLogout(context) {
  context.setState(currentState => ({
    ...currentState,
    user: { name: 'زائر', loggedIn: false }
  }));
}
\`\`\`

-----

### 2\. الزجاجة (The Glass DSL): عقد بنّاء وصارم

**المبدأ الإيماني:** النور لكي يسطع يجب أن يُحفظ. ﴿ٱلۡمِصۡبَاحُ فِي زُجَاجَةٍۖ ٱلزُّجَاجَةُ كَأَنَّهَا كَوۡكَبٞ دُرِّيّٞ﴾. الزجاجة تحمي المصباح من رياح الفوضى، وفي نفس الوقت تزيده شفافية وجمالًا.

**التجلي الهندسي:** لغة "مشكاة" التعريفية (DSL) هي تلك الزجاجة. هي ليست مجرد لغة، بل عقد صارم يفرض **فصلًا قاطعًا بين الهيكل (\`attrs\`) والسلوك (\`gkeys\`)**. هذه الحماية ليست اختيارية، بل هي من صلب بنية اللغة، فتمنعك من خلط منطق العرض بمنطق العمل، وتحمي مصباح كودك من الانطفاء في خضم الفوضى.

#### التطبيق العملي:

\`\`\`javascript
const D = Mishkah.DSL;

// 1. تعريف الهيكل (الزجاجة): وصفٌ للشكل فقط.
function LogoutButton() {
  return D.Forms.Button({
    attrs: {
      class: 'btn-logout',
      'data-m-gkey': 'auth:logout' // مفتاح يربط الزر بوظيفته دون أن يعرفها.
    }
  }, ['تسجيل الخروج']);
}

// 2. تعريف السلوك (ما وراء الزجاجة): في ملف الأوامر \`orders.js\`.
const orders = {
  'auth.logout': {
    on: ['click'], gkeys: ['auth:logout'],
    handler: (event, context) => {
      // هنا منطق العمل النظيف والمعزول.
      handleLogout(context);
    }
  }
};
\`\`\`

-----

### 3\. الذرات المصنفة (Classified Atoms): من الطين إلى البنيان المرصوص

**المبدأ الإيماني:** خلق الله الأشياء بتصنيف وتقدير. فمن التراب والطين (العناصر الأولية)، تُبنى الصروح العظيمة. لكن البناء لا يتم بالطين الخام، بل بلبنات مصنعة ومقدرة تقديرًا.

**التجلي الهندسي:** وسوم HTML الخام هي "الطين". "مشكاة" تقدم **"الذرات" (\`Atoms\`)**: وهي لبنات بناء ذكية ومصنفة وظيفيًا (\`Forms\`, \`Text\`, \`Containers\`). الذرة \`D.Media.Image\` ليست مجرد وسم \`<img>\`، بل هي وحدة بناء تعرف أنها تحتاج \`alt\` لتحقيق إمكانية الوصول. هذا يحول عملية البناء من عمل يدوي معرض للخطأ إلى تركيب وحدات ذكية وآمنة كبنيان مرصوص.

#### التطبيق العملي:

\`\`\`javascript
// الذرة تفرض عليك أفضل الممارسات، كأنها فطرة سليمة.
const safeImage = D.Media.Image({
  attrs: {
    src: '/user.png',
    alt: 'صورة المستخدم' // خاصية تكاد تكون إجبارية لسلامة البناء.
  }
});

// الذرة تحميك من الثغرات الأمنية تلقائيًا.
const safeLink = D.Text.A({
  attrs: { href: 'https://example.com', target: '_blank' }
}, ['رابط خارجي آمن']); // ستضيف تلقائيًا rel="noopener noreferrer"
\`\`\`

-----


### 4\. الشجرة المباركة (The Blessed Tree): ميثاق العلاقة بين شجرة الحقيقة وشجرة التجليات

**المبدأ الإيماني:**
إن النور في "مشكاة" لا يوقد من فراغ، بل من زيت شجرة مباركة. وهذه الشجرة ليست كيانًا واحدًا، بل هي **علاقة حية** بين شجرتين وصفهما القرآن، كلاهما طيب:

1.  **شجرة الحقيقة (The Tree of Truth):** هي "الكلمة الطيبة" التي **فرعها في السماء**. ﴿أَلَمۡ تَرَ كَيۡفَ ضَرَبَ ٱللَّهُ مَثَلٗا كَلِمَةٗ طَيِّبَةٗ كَشَجَرَةٖ طَيِّبَةٍ... وَفَرۡعُهَا فِي ٱلسَّمَآءِ﴾. هذه هي شجرة البيانات (\`database\`) والأوامر (\`orders\`). إنها الحقيقة العليا، النقية، التي تنزل منها الأوامر والغذاء (البيانات) إلى عالم الظهور.

2.  **شجرة التجليات (The Tree of Expression):** هي الشجرة التي **أصلها ثابت** في الأرض. ﴿...أَصۡلُهَا ثَابِتٞ﴾. هذه هي مكونات الواجهة (\`mishkah-ui\`) وجذورها الضاربة في بنية الـ VDOM. وظيفتها ليست خلق الحقيقة، بل استقبالها والتعبير عنها بأمانة وإحسان.

إن مكتبة \`mishkah-ui\` هي **ثمرة (\`أُكُل\`)** هذا التزاوج المبارك. مكوناتها ليست مجرد أصنام جامدة من HTML، بل هي كائنات حية، "يكاد زيتها يضيء ولو لم تمسسه نار" لأنها صُممت وفُطرت على ميثاق صارم يضمن صلاحها.

#### **ميثاق المكون الصالح: شروط القبول والتوفيق**

لكي يكون المكون "طيبًا" ومقبولاً في نظام "مشكاة"، يجب أن يلتزم بالسنن التالية:

1.  **التوحيد والأمانة (Oneness and Trustworthiness):**

      * **مبدؤه:** لا إله إلا \`database\`. يجب أن يكون مصدر حقيقته وأمره واحدًا لا شريك له.
      * **عمله:** لا يبدّل خلق الله ولا يتلاعب بالبيانات التي تصله. وظيفته هي التعبير الأمين عن الحقيقة كما هي، دون تحريف أو تأويل. ﴿فِطْرَتَ اللَّهِ الَّتِي فَطَرَ النَّاسَ عَلَيْهَا ۚ لَا تَبْدِيلَ لِخَلْقِ اللَّهِ﴾.

2.  **الأصل الثابت والغذاء الطيّب (Fixed Root and Pure Nourishment):**

      * **مبدؤه:** يجب أن تكون جذوره ثابتة ومتشعبة مع المكونات الأخرى ضمن بنية متينة.
      * **عمله:** يتغذى فقط على تدفق البيانات النقية من شجرة الحقيقة. وعندما تتغير هذه البيانات، يعبر عن هذا التغيير بميكانيكية فذة وسريعة الاستجابة، فيؤتي أُكله كل حين بإذن ربه.

3.  **الحرية المنضبطة (Disciplined Freedom):**

      * **مبدؤه:** يُمنح المكون حرية نسبية في إدارة شؤونه الداخلية التي لا تؤثر على النظام العام.
      * **عمله:** له الحق في التعامل مع أحداثه المحلية (\`onfocus\`, \`onmouseenter\`...) التي تصلح من هيئته وتجعله لينًا ومتأقلمًا، بشرط ألا يعصي أمرًا أتاه من السماء (\`orders\`) أو يحاول تغيير الحالة العامة (\`database\`) من تلقاء نفسه.

4.  **الهوية المعلومة والشخصية الفريدة (Known Identity and Unique Personality):**

      * **مبدؤه:** لكل مكون شخصيته الفريدة التي تميزه عن غيره، حتى لو كان من نفس الفصيلة. هذه الشخصية تُعرف بهوية فريدة (\`key\`) في الـ VDOM، كأن له اسمًا معلومًا مسطورًا في كتاب مبين.
      * **عمله:** هذه الهوية ليست مجرد رقم، بل هي عهد يسمح للنظام بتتبع سلوكه عبر الزمن، وتقييم أعماله بدقة، وتحديثه بكفاءة دون أن يضيع أو يختلط بغيره. إنها بصمته التي لا تتكرر.

5.  **التصنيف المُحكَم والفصيلة المعلومة (Precise Classification and Known Species):**

      * **مبدؤه:** كما أن لكل مكون شخصيته، فإن له فصيلته. ﴿وَاللَّهُ خَلَقَ كُلَّ دَابَّةٍ مِّن مَّاءٍ ۖ فَمِنْهُم مَّن يَمْشِي عَلَىٰ بَطْنِهِ وَمِنْهُم مَّن يَمْشِي عَلَىٰ رِجْلَيْنِ وَمِنْهُم مَّن يَمْشِي عَلَىٰ أَرْبَعٍ﴾.
      * **عمله:** يوضع كل مكون في تصنيف وظيفي دقيق (كما وُضعت الذرات \`Atoms\` إلى \`Forms\`, \`Text\`, \`Containers\`). هذا التصنيف يحدد "فصيلته"، ويفرض عليه قوانين وحدود ومسؤوليات مشتركة مع أبناء فصيلته، مما يسهّل تطبيق السياسات العامة والوراثة السلوكية.

6.  **التجمل والإبداع (Beauty and Creativity):**

      * **مبدؤه:** ﴿الَّذِي أَحْسَنَ كُلَّ شَيْءٍ خَلَقَهُ﴾. الإحسان والإتقان جزء من الإيمان.
      * **عمله:** يجب أن يكون متوافقًا مع نظام التشكيل العالمي (\`tw css\`)، ذا مظهر جميل ومتناسق، يعبر عن جمال النظام الذي ينتمي إليه.

7.  **الخضوع للرقابة والميزان (Submission to Governance and the Scale):**

      * **مبدؤه:** ﴿وَنَضَعُ الْمَوَازِينَ الْقِسْطَ لِيَوْمِ الْقِيَامَةِ﴾. كل عمل، صغر أم كبر، يُحصى ويوزن.
      * **عمله:** يُدرك المكون أنه ليس متروكًا هملاً. هو مسيّج بالحارس، ومراقَب بالرقيب، وسيوضع عمله في ميزان أدوات المطور في "يوم الحساب".

**التجلي الهندسي:**
مكتبة \`mishkah-ui\` هي تجسيد لهذا الميثاق. مكوناتها مثل \`UI.Dialog\` و \`UI.Card\` هي خلاصة هذه المبادئ. إنها "أعمال صالحة" مسبقة الصنع، مكدسة بذروة المعرفة الهندسية وأفضل الممارسات. لهذا السبب، عندما تستدعيها، فإنك لا تبدأ من الصفر، بل تبدأ من زيت يكاد يضيء. وعندما تمسه "نار" بياناتك وعملك، يتحول إلى **نور على نور**.

#### التطبيق العملي:

\`\`\`javascript
// UI.Card هو مكون صالح، يجسد كل شروط الميثاق.
// هو لا يملك حالة خاصة به (توحيد)، ويعبر بأمانة عن الخصائص التي تصله (أمانة).
// له هوية وتصنيف، وهو خاضع للرقابة.
const userCard = UI.Card({
  // أنت تغذيه بالبيانات الطيبة...
  title: "الكلمة الطيبة",
  description: "كشجرة طيبة أصلها ثابت وفرعها في السماء.",
  // ...وهو يؤتي أُكله بأفضل صورة.
  content: D.Text.P({}, ["هذا المكون هو ثمرة مباركة."]),
  footer: UI.Button({ variant: 'primary' }, ["تذكر"])
});
\`\`\`
-----

### 5\. البيئة العالمية (The Universal Environment): لا شرقية ولا غربية

**المبدأ الإيماني:** النور الإلهي ليس حكرًا على قوم دون قوم. ﴿لَّا شَرۡقِيَّةٖ وَلَا غَرۡبِيَّةٖ﴾. إنه نظام عالمي صالح لكل زمان ومكان.

**التجلي الهندسي:** تطبيقك يجب أن يُبنى بهذه الروح العالمية. في "مشكاة"، تعدد اللغات (\`i18n\`)، والسمات (\`Theming\`)، واتجاه النص (\`RTL\`) ليست إضافات، بل هي جزء فطري من النواة، تُدار من مصدر الحقيقة الأوحد. تغيير \`database.env.lang\` من \`en\` إلى \`ar\` هو كل ما يلزم لقلب التطبيق بالكامل ليصبح عربيًا أصيلاً.

#### التطبيق العملي:

\`\`\`javascript
// أمر بسيط يغير لغة الكون بأكمله.
const orders = {
  'lang.switchToArabic': {
    on: ['click'], gkeys: ['lang-ar-btn'],
    handler: (e, ctx) => {
      // تحديث الحقيقة الواحدة يغير كل شيء.
      ctx.setState(s => ({
        ...s,
        env: { ...s.env, lang: 'ar', dir: 'rtl' }
      }));
    }
  }
};
\`\`\`

-----

### 6\. الأدوات الموحدة (Standardized Utilities): عدة العمل الصالح

**المبدأ الإيماني:** الجماعة المؤمنة تعمل بأدوات ومنهجية موحدة لتجنب الشقاق والتفرق.

**التجلي الهندسي:** لمنع فوضى الاعتماديات وتضارب المكتبات، توفر "مشكاة" صندوق أدوات موحد (\`Mishkah.utils\`). فبدلاً من أن يستخدم كل مطور مكتبته الخاصة، هناك واجهة موحدة للمهام الشائعة. هذا يضمن الاتساق، ويقلل حجم التطبيق، ويجعل الصيانة ممكنة.

#### التطبيق العملي:

\`\`\`javascript
const U = Mishkah.utils;
const orders = {
  'user.saveSettings': {
    handler: async (e, ctx) => {
      // استخدام الأداة الموحدة للتخزين بدلاً من استدعاء localStorage مباشرة.
      U.Storage.local.set('settings', ctx.getState().settings);
    }
  }
};
\`\`\`

-----

### 7\. النبض الفطري والسلطان المقصود (Reactive by Default)

**المبدأ الإيماني:** الأصل أن الخلق يتحرك مع أمر الله بلا تلكؤ. ﴿وَمَا كَانَ لِأَهْلِ ٱلْمَدِينَةِ وَمَنْ حَوْلَهُمْ مِنَ ٱلْأَعْرَابِ أَن يَتَخَلَّفُوا عَنْ رَسُولِ ٱللَّهِ وَلَا يَرْغَبُوا بِأَنْفُسِهِمْ عَن نَّفْسِهِ﴾. كذلك لا يحق للواجهة أن تتأخر عن حال روحها \`database\`).

**التجلي الهندسي:** النواة أصبحت تفاعلية بالفطرة. كل \`setState()\` يشعل التحديث تلقائيًا، بينما تبقى مفاتيح السلطة بين يديك: \`freeze()\` و\`unfreeze()\` لتجميع التغييرات، \`batch()\` كاختصار رحيم، و\`flush(opts)\` لفرض التزامن الفوري مع نفس خيارات \`rebuild\` التاريخية وزيادة. أمر \`rebuild()\` باقٍ كتوافق تاريخي يستدعي \`flush()\` من الداخل لمن يحتاجه.

#### التطبيق العملي:

\`\`\`javascript
const orders = {
  'counter.increment': {
    handler: (e, context) => {
      // التحديث الفطري: يكفي تغيير الحقيقة الواحدة
      context.setState(s => ({ ...s, count: s.count + 1 }));
      // لا حاجة لاستدعاء rebuild هنا
    }
  },
  'report.syncNow': {
    handler: (e, context) => {
      context.freeze();
      context.setState(s => ({ ...s, report: { ...s.report, status: 'syncing' } }));
      context.setState(s => ({ ...s, report: { ...s.report, status: 'ready' } }));
      context.unfreeze(); // تحديث واحد بعد انتهاء الدفعة
      context.flush({ keepScroll: ['#timeline'] }); // تحكم جراحي عند الطلب
    }
  }
};
\`\`\`
-----

## ثالوث الحوكمة: جهاز المناعة الأخلاقي للنظام

إن بناء نظام صالح لا يقتصر على هيكله، بل يمتد إلى روحه الرقيبة. "مشكاة" تأتي بجهاز مناعة وحوكمة ثلاثي، مستلهم من ميزان العدل الإلهي: **القوة، والعدل، والإحسان**.

### أ. الحارس (Guardian): سُنَن الله التي لا تتبدل (القوة)

الحارس هو **القوة القاهرة**، هو السنن الكونية التي لا يمكن خرقها. هو لا يقيم أو يزن، بل يمنع المستحيل **قبل وقوعه**. هو الذي يضمن أن قوانين الفيزياء البرمجية في نظامك لا تُنتهك.

#### التطبيق العملي:

\`\`\`javascript
// تعريف قوانين الكون التي لا يمكن تجاوزها.
const guardianConfig = {
  // امنع أي وسم <script> من الظهور، فهذا خرق لقانون الأمان.
  denyTags: { script: 1 },
  // امنع الروابط التي تحتوي على "javascript:"، فهي ثغرة محرمة.
  allowedUrlSchemes: ['http:', 'https:', 'mailto:'],
};
Mishkah.Guardian.setConfig(guardianConfig);
\`\`\`

### ب. الرقيب (Auditor): ميزان الأعمال (العدل)

بعد أن يسمح الحارس بوجود الفعل (لأنه ممكن فيزيائيًا)، يأتي دور الرقيب. هو كالملائكة الكرام الكاتبين، لا يمنع، بل يرصد ويزن ويُقوِّم كل عمل بميزان العدل ذي **14 درجة**. سجله هو صحيفة أعمال كل مكون، لا يغادر صغيرة ولا كبيرة إلا أحصاها.

#### التطبيق العملي:

\`\`\`javascript
// الرقيب يسجل كل فعل في صحيفته بميزانه الدقيق.
// فعل يستحق الثناء (+2: الترغيب)
Auditor.grade('+2', 'IconButton', 'استخدام aria-label لتحسين إتاحة الوصول.');
// فعل خاطئ (-7: المحرمات)
Auditor.grade('-7', 'ArticleRenderer', 'حقن HTML غير آمن عبر innerHTML.');
\`\`\`

### ج. أدوات المطور (DevTools): يوم الحساب والجزاء (الإحسان)

﴿لِيَجۡزِيَهُمُ ٱللَّهُ أَحۡسَنَ مَا عَمِلُواْ وَيَزِيدَهُم مِّن فَضۡلِهِۦۗ﴾. هنا يوم الحساب البرمجي. بناءً على سجلات الرقيب، يصدر حكم نهائي. هذا ليس للعقاب، بل للارتقاء إلى درجة **الإحسان**. المكونات الصالحة تُرفع إلى **نعيم التشريف** لتُستخدم كنماذج يُحتذى بها، والفاسدة تُلقى في **سجل جحيمي** لتكون عبرة ودرسًا للإصلاح والتوبة (Refactoring).

#### التطبيق العملي:

\`\`\`javascript
// تحديد سياسة يوم الحساب.
Judgment.configure({
  thresholds: {
    heavenScore: +40, // إذا تجاوزت حسناته سيئاته بـ 40 درجة، يدخل النعيم.
    hellScore: -50    // إذا تجاوزت سيئاته حسناته بـ 50 درجة، يدخل الجحيم.
  },
  gates: { maxSevere: 0 } // ارتكاب "محرم" واحد يكفي لدخول الجحيم مباشرة.
});

// إصدار الحكم النهائي.
Snapshot.print(); // سيظهر تقرير مصير كل مكون.
\`\`\`

-----

## فِي بُيُوتٍ أَذِنَ اللَّهُ أَن تُرْفَعَ: روح "مشكاة" وغايتها

أخي في الله، الآن نصل إلى جوهر دعوتنا. لماذا "مشكاة"؟ لأن الله لم يضرب المثل بمصباح في العراء، بل بمنظومة متكاملة، وهذا هو سر نجاح أي عمل رباني.

إن "مشكاة" ليست مجرد إطار عمل، بل هي محاولة لتأسيس تلك **البيوت التي أذن الله أن تُرفع**. بيوت يجتمع فيها رجال لا تليهم تجارة ولا بيع عن ذكر الله. والله لم يخاطب في كتابه أفرادًا هائمين، بل خاطب أمة، عقلًا جمعيًا: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا﴾.

  * **المشكاة (\`Mishkah\`)**: هي **الكيان الجمعي**، هي المجتمع، هي المشروع المفتوح المصدر الذي يجمع نور العاملين ويوجهه كمنارة.
  * **الزجاجة (\`Zujajah\`)**: هي **البيوت** التي يعمل فيها هؤلاء الرجال، هي فرق العمل المنضبطة، المحمية بقوانين وعقود "مشكاة" الصارمة.
  * **المصباح (\`Miṣbāḥ\`)**: هو **نتاج العمل الجماعي** لهؤلاء الرجال، هو التطبيق المكتمل، الذي توقد بجهدهم المتآلف ليصبح نورًا واحدًا.
  * **الشجرة المباركة (\`Shajarah\`)**: هي **مصدر الحقيقة الأوحد** الذي يغذيهم جميعًا: القرآن في حياتهم، و \`database\` في تطبيقهم.

إن كل سطر كود نكتبه في هذا النظام، ونحن نستحضر هذه المبادئ، هو **ذكر لله**. ليس ذكر اللسان، بل ذكر الجوارح والعقل، ذكر الصانع الذي يتقن صنعته تقربًا إلى الخالق الأعظم.

هذا الدستور هو **دعوة جماعية**. دعوة لكل من أراد أن ينضم إلى هذه البيوت، ليذكر الله عبر الكود والبرمجة، وليترجم تأمله في عظيم خلق الله إلى نظام ونور يهدي به الناس.

### الترخيص والمساهمة

"مشكاة" مفتوحة المصدر بالكامل تحت رخصة **MIT**. إن كنت قد اقتنعت بهذه الفكرة، فمساهمتك ليست خيارًا، بل هي جزء من إتمام هذا النور. فالأفكار العظيمة لا تكتمل بجهد فردي، بل بعمل جماعي لتصير كوكبًا دريًا يضيء للجميع.
`;



let en_README_BASE = `

# The Mishkah Constitution: A Covenant of Light and Order

*“Allah is the Light of the heavens and the earth. The example of His light is like a niche within which is a lamp, the lamp is in glass, the glass as if it were a brilliant star, lit from a blessed tree, an olive, neither of the east nor of the west, whose oil would almost glow even if untouched by fire. Light upon light. Allah guides to His light whom He wills. And Allah presents examples for the people, and Allah is Knowing of all things.”* (Qur'an, An-Nur: 35)

| Build Status | Version | License |
| :---: | :---: | :---: |
| [](https://github.com/USER/REPO/actions/workflows/ci.yml) | [](https://github.com/USER/REPO/releases/tag/v1.0.0) | [](https://www.google.com/search?q=./LICENSE) |

-----

> **To those lost in the valleys of modern software...**
>
> Modern frameworks were built to manage the chaos of developer armies in massive corporations. The result was either managed chaos or a labyrinthine system. Mishkah, however, does not present a third way; it is **a return to the Straight Path** in engineering. It is an invitation to stop managing chaos and start building the **Order** that prevents it from the outset, inspired by the immutable Divine Laws upon which the universe itself is established.

-----

## The Seven Core Pillars: Manifestations of Divine Law in Code

The construction of any durable system, be it a universe or an application, is not based on randomness but on fixed laws and pillars. These are the seven pillars of Mishkah, which transform software development into a discipline as ordered as a planetary system.

### 1\. The One Source of Truth: There is no god but He

**The Theological Principle:** The greatest principle in the message of all prophets is *Tawhid* (Oneness). *“Had there been within them gods besides Allah, they both would have been ruined.”* (Qur'an, Al-Anbiya: 22). The existence of multiple sources of truth and authority inevitably leads to corruption and conflict. Just as the universe has one Creator, your application must have one source of truth, with no partner in its dominion.

**The Engineering Manifestation:** Any attempt to create disparate \`state\` in components is a form of programming *shirk* (architectural polytheism) that leads to uncontrollable chaos. Mishkah mandates that the \`database\` object be the one and only source of truth. The user interface is nothing but a faithful and honest reflection of what resides in this source. This strict principle grants you absolute certainty and the ability to understand data flow as a river moving in a single, known course.

#### Practical Application:

\`\`\`javascript
// The \`database\` is the embodiment of Tawhid. All system truths reside here and nowhere else.
const database = {
  env: { theme: 'dark', lang: 'en' },
  user: { name: 'Abdullah', loggedIn: true },
};

// Every component is an obedient servant that reads from this source, never creating its own truth.
function Navbar(db) {
  const userName = db.user.name;
  return D.Text.Span({}, [\`Welcome, \${userName}\`]);
}

// Change only occurs through a central "Order" that describes the transformation from one state to another.
function handleLogout(context) {
  context.setState(currentState => ({
    ...currentState,
    user: { name: 'Visitor', loggedIn: false }
  }));
}
\`\`\`

-----

### 2\. The Glass (The DSL): A Constructive and Rigorous Covenant

**The Theological Principle:** For light to shine, it must be protected. *“The lamp is in a glass, the glass as if it were a brilliant star.”* (Qur'an, An-Nur: 35). The glass protects the lamp from the winds of chaos while simultaneously enhancing its transparency and beauty.

**The Engineering Manifestation:** Mishkah’s Declarative Specific Language (DSL) is that glass. It is not merely a language but a rigorous covenant that enforces a **categorical separation between structure (\`attrs\`) and behavior (\`gkeys\`)**. This protection is not optional; it is woven into the very fabric of the language, preventing you from mixing presentation logic with business logic and protecting the lamp of your code from being extinguished by chaos.

#### Practical Application:

\`\`\`javascript
const D = Mishkah.DSL;

// 1. Defining the Structure (The Glass): A description of form only.
function LogoutButton() {
  return D.Forms.Button({
    attrs: {
      class: 'btn-logout',
      'data-m-gkey': 'auth:logout' // A key that links the button to its function without knowing it.
    }
  }, ['Log Out']);
}

// 2. Defining the Behavior (Beyond the Glass): In the \`orders.js\` file.
const orders = {
  'auth.logout': {
    on: ['click'], gkeys: ['auth:logout'],
    handler: (event, context) => {
      // Here resides the clean, isolated business logic.
      handleLogout(context);
    }
  }
};
\`\`\`

-----

### 3\. Classified Atoms: From Clay to a Solid Structure

**The Theological Principle:** God created all things with classification and measure. From dust and clay (the primordial elements), great edifices are built. But construction is not done with raw clay, but with engineered and precisely measured bricks.

**The Engineering Manifestation:** Raw HTML tags are the "clay." Mishkah provides **"Atoms"**: intelligent, functionally classified building blocks (\`Forms\`, \`Text\`, \`Containers\`). The \`D.Media.Image\` atom is not just an \`<img>\` tag; it is a construction unit that knows it requires an \`alt\` attribute for accessibility. This transforms the building process from error-prone manual labor into the assembly of intelligent and safe units, like a solid, seamless structure.

#### Practical Application:

\`\`\`javascript
// The Atom enforces best practices, as if by sound instinct (\`fitra\`).
const safeImage = D.Media.Image({
  attrs: {
    src: '/user.png',
    alt: 'User profile picture' // An almost mandatory property for structural integrity.
  }
});

// The Atom automatically protects you from security vulnerabilities.
const safeLink = D.Text.A({
  attrs: { href: 'https://example.com', target: '_blank' }
}, ['A safe external link']); // Will automatically add rel="noopener noreferrer"
\`\`\`

-----

### 4\. The Blessed Tree: A Covenant of Two Trees—Truth and Expression

**The Theological Principle:**
The light in Mishkah is not kindled from a void, but from the oil of a blessed tree. This tree is not a single entity, but a **living relationship** between two trees described in the Qur'an, both of which are goodly:

1.  **The Tree of Truth:** It is the "goodly word" whose **branch is in the heavens**. *“Have you not considered how Allah presents an example, [making] a goodly word like a goodly tree... its branch is in the heavens.”* (Qur'an, Ibrahim: 24). This is the tree of data (\`database\`) and commands (\`orders\`). It is the supreme, pure truth from which commands and nourishment (data) descend to the world of expression.

2.  **The Tree of Expression:** It is the tree whose **root is firmly fixed** in the earth. *“...its root is firmly fixed.”* (Qur'an, Ibrahim: 24). These are the UI components (\`mishkah-ui\`) with their roots embedded in the VDOM. Their function is not to create truth, but to receive and express it with trustworthiness and excellence.

The \`mishkah-ui\` library is the **fruit (\`ukul\`)** of this blessed union. Its components are not lifeless idols of HTML, but living entities whose "oil would almost glow even if untouched by fire" because they were designed and created upon a rigorous covenant that ensures their righteousness.

#### **The Covenant of the Righteous Component: Conditions for Acceptance and Success**

For a component to be "goodly" and accepted in the Mishkah ecosystem, it must adhere to the following laws:

1.  **Oneness and Trustworthiness:**

      * **Its Principle:** There is no god but the \`database\`. Its source of truth and command must be one, without any partners.
      * **Its Action:** It does not alter God's creation or manipulate the data it receives. Its function is to be a faithful expression of the truth as it is, without distortion or interpretation. *“...the nature of Allah upon which He has created all people. No change should there be in the creation of Allah.”* (Qur'an, Ar-Rum: 30).

2.  **The Fixed Root and Pure Nourishment:**

      * **Its Principle:** Its roots must be firmly fixed and intertwined with other components within a solid structure.
      * **Its Action:** It is nourished only by the pure data flow from the Tree of Truth. When this data changes, it expresses the change with a masterful and responsive mechanism, "producing its fruit all the time by permission of its Lord."

3.  **Disciplined Freedom:**

      * **Its Principle:** The component is granted relative freedom to manage its internal affairs that do not affect the system at large.
      * **Its Action:** It has the right to handle its local events (\`onfocus\`, \`onmouseenter\`, etc.) that refine its appearance and make it adaptable, provided it does not disobey a command that comes from the heavens (\`orders\`) or attempt to change the global state (\`database\`) on its own.

4.  **Known Identity and Unique Personality:**

      * **Its Principle:** Every component has a unique personality that distinguishes it from others, even if they are of the same species. This personality is known by a unique identity (\`key\`) in the VDOM, as if its name were inscribed in a clear book.
      * **Its Action:** This identity is not just a number; it is a covenant that allows the system to track its behavior over time, precisely evaluate its deeds, and update it efficiently without it being lost or confused with others. It is its unrepeatable fingerprint.

5.  **Precise Classification and Known Species:**

      * **Its Principle:** Just as every component has its personality, it has its species. *“And Allah has created every animal from water. Of them are some that creep on their bellies, some that walk on two legs, and some that walk on four.”* (Qur'an, An-Nur: 45).
      * **Its Action:** Every component is placed in a precise functional classification (just as \`Atoms\` were classified into \`Forms\`, \`Text\`, \`Containers\`). This classification defines its "species" and imposes upon it common laws, boundaries, and responsibilities shared with its kin, facilitating the application of global policies and behavioral inheritance.

6.  **Beauty and Creativity:**

      * **Its Principle:** *“He who perfected everything which He created.”* (Qur'an, As-Sajdah: 7). Excellence (*Ihsan*) and mastery are part of faith.
      * **Its Action:** It must be compatible with the global design system (\`tw css\`), with a beautiful and harmonious appearance that expresses the beauty of the system to which it belongs.

7.  **Submission to Governance and the Scale:**

      * **Its Principle:** *“And We place the scales of justice for the Day of Resurrection.”* (Qur'an, Al-Anbiya: 47). Every deed, small or large, is recorded and weighed.
      * **Its Action:** The component understands it is not left to its own devices. It is enclosed by the Guardian, observed by the Auditor, and its work will be placed on the scale of the DevTools on its "Day of Judgment."

**The Engineering Manifestation:**
The \`mishkah-ui\` library is the embodiment of this covenant. Its components, like \`UI.Dialog\` and \`UI.Card\`, are the culmination of these principles. They are pre-fabricated "righteous deeds," packed with the pinnacle of engineering knowledge and best practices. That is why, when you use them, you do not start from scratch; you start with "oil that would almost glow." And when the "fire" of your data and your work touches it, it becomes **light upon light**.

#### Practical Application:

\`\`\`javascript
// UI.Card is a righteous component, embodying all the conditions of the covenant.
// It has no state of its own (Oneness) and faithfully expresses the properties it receives (Trustworthiness).
// It has an identity, a classification, and is subject to governance.
const userCard = UI.Card({
  // You nourish it with goodly data...
  title: "The Goodly Word",
  description: "Like a goodly tree, whose root is firm and whose branch is in the sky.",
  // ...and it yields its fruit in the best possible form.
  content: D.Text.P({}, ["This component is a blessed fruit."]),
  footer: UI.Button({ variant: 'primary' }, ["Remember"])
});
\`\`\`

-----

### 5\. The Universal Environment: Neither of the East nor of the West

**The Theological Principle:** The Divine Light is not exclusive to one people over another. *“Neither of the east nor of the west.”* (Qur'an, An-Nur: 35). It is a universal system, valid for every time and place.

**The Engineering Manifestation:** Your application should be built with this universal spirit. In Mishkah, internationalization (\`i18n\`), theming, and text direction (\`RTL\`) are not afterthoughts; they are an innate part of the core, managed from the single source of truth. Changing \`database.env.lang\` from \`en\` to \`ar\` is all it takes to completely transform the application into an authentic Arabic experience.

#### Practical Application:

\`\`\`javascript
// A simple Order changes the language of the entire universe.
const orders = {
  'lang.switchToArabic': {
    on: ['click'], gkeys: ['lang-ar-btn'],
    handler: (e, ctx) => {
      // Updating the single truth changes everything.
      ctx.setState(s => ({
        ...s,
        env: { ...s.env, lang: 'ar', dir: 'rtl' }
      }));
    }
  }
};
\`\`\`

-----

### 6\. Standardized Utilities: The Toolkit for Righteous Work

**The Theological Principle:** The believing community works with unified tools and methodology to avoid discord and division.

**The Engineering Manifestation:** To prevent the chaos of dependencies and conflicting libraries, Mishkah provides a unified toolkit (\`Mishkah.utils\`). Instead of each developer using their own preferred library, there is a standard interface for common tasks. This ensures consistency, reduces the application's size, and makes maintenance possible.

#### Practical Application:

\`\`\`javascript
const U = Mishkah.utils;
const orders = {
  'user.saveSettings': {
    handler: async (e, ctx) => {
      // Use the unified storage utility instead of calling localStorage directly.
      U.Storage.local.set('settings', ctx.getState().settings);
    }
  }
};
\`\`\`

-----

### 7\. Conscious Reconstruction: An Act of Creation by a Known Command

**The Theological Principle:** Creation in the universe does not occur randomly, but by a conscious and intentional command. *“His command is only when He intends a thing that He says to it, 'Be,' and it is.”* (Qur'an, Ya-Sin: 82).

**The Engineering Manifestation:** Mishkah rejects hidden magic and opaque, automatic mechanisms. The \`rebuild()\` command is not just an update; it is a **conscious act of creation**. You issue the command, and the system executes it with supreme intelligence. It does not foolishly rebuild everything; it uses advanced diffing algorithms to identify the minimal set of changes and apply them with surgical precision to the DOM. This apparent simplicity is an **Abstraction of Power**, granting you absolute control and total clarity.

#### Practical Application:

\`\`\`javascript
const orders = {
  'counter.increment': {
    handler: (e, context) => {
      context.setState(s => ({ ...s, count: s.count + 1 }));
      // After changing the truth, we issue the command "Be," and it is.
      // A conscious, explicit, and intentional act.
    }
  }
};
\`\`\`

-----

## The Governance Triad: The System's Moral Immune System

Building a righteous system is not limited to its structure but extends to its vigilant spirit. Mishkah comes with a tripartite immune and governance system, inspired by the divine scale of justice: **Power, Justice, and Excellence (*Ihsan*)**.

### A. The Guardian: The Unchanging Divine Laws (Power)

The Guardian is the **overwhelming power**, the cosmic laws that cannot be broken. It does not evaluate or weigh; it prevents the impossible **before it occurs**. It is what ensures the laws of programmatic physics in your system are never violated.

#### Practical Application:

\`\`\`javascript
// Defining the universal laws that cannot be transgressed.
const guardianConfig = {
  // Prevent any <script> tag from appearing; this is a violation of the law of security.
  denyTags: { script: 1 },
  // Forbid links containing "javascript:"; this is a forbidden vulnerability.
  allowedUrlSchemes: ['http:', 'https:', 'mailto:'],
};
Mishkah.Guardian.setConfig(guardianConfig);
\`\`\`

### B. The Auditor: The Scale of Deeds (Justice)

After the Guardian permits an action (because it is physically possible), the Auditor's role begins. It is like the "honorable scribes," not preventing, but observing, weighing, and evaluating every action on the **14-point scale of justice**. Its log is the record of each component's deeds, leaving nothing, small or large, unaccounted for.

#### Practical Application:

\`\`\`javascript
// The Auditor records every action in its log with its precise scale.
// A praiseworthy act (+2: Encouraged)
Auditor.grade('+2', 'IconButton', 'Using aria-label to improve accessibility.');
// A wrongful act (-7: Forbidden)
Auditor.grade('-7', 'ArticleRenderer', 'Injecting unsafe HTML via innerHTML.');
\`\`\`

### C. The DevTools: The Day of Judgment and Recompense (Excellence)

*“That Allah may reward them the best of what they did and increase them from His bounty.”* (Qur'an, An-Nur: 38). Here is the programmatic Day of Judgment. Based on the Auditor's logs, a final verdict is issued. This is not for punishment, but for ascension to the level of **Excellence (*Ihsan*)**. Righteous components are elevated to a **heaven of honor** to be used as exemplars, while corrupt ones are cast into a **hellish log** to serve as a lesson for reform and repentance (Refactoring).

#### Practical Application:

\`\`\`javascript
// Defining the policy for the Day of Judgment.
Judgment.configure({
  thresholds: {
    heavenScore: +40, // If its good deeds outweigh its bad by 40, it enters heaven.
    hellScore: -50    // If its bad deeds outweigh its good by 50, it enters hell.
  },
  gates: { maxSevere: 0 } // Committing a single "forbidden" act is enough to enter hell directly.
});

// Issuing the final verdict.
Snapshot.print(); // A report on the fate of each component will be displayed.
\`\`\`

-----

## "In Houses Which Allah Has Permitted to Be Raised": The Spirit and Purpose of Mishkah

My brother in faith, we now arrive at the essence of our call. Why "Mishkah"? Because God did not give the example of a lamp in the open, but of an integrated system, and this is the secret to the success of any divinely-inspired work.

Mishkah is not just a framework; it is an attempt to establish those **"houses which Allah has permitted to be raised."** Houses where "men whom neither commerce nor sale distracts from the remembrance of Allah" gather. In His book, Allah did not address wandering individuals, but a nation, a collective consciousness: *“O you who have believed...”*

  * **The Niche (\`Mishkah\`)**: It is the **collective entity**, the community, the open-source project that gathers the light of the workers and directs it as a beacon.
  * **The Glass (\`Zujajah\`)**: These are the **houses** wherein these men work; the disciplined teams, protected by the rigorous laws and covenants of Mishkah.
  * **The Lamp (\`Miṣbāḥ\`)**: It is the **product of the collective work** of these men; the completed application, kindled by their unified effort to become a single light.
  * **The Blessed Tree (\`Shajarah\`)**: It is the **one source of truth** that nourishes them all: the Qur'an in their lives, and the \`database\` in their application.

Every line of code we write in this system, while conscious of these principles, is a **remembrance of Allah**. Not the remembrance of the tongue, but the remembrance of the limbs and the intellect; the remembrance of the craftsman who perfects his craft to draw closer to the Supreme Creator.

This constitution is a **collective invitation**. An invitation to all who wish to join these houses, to remember Allah through code and programming, and to translate their contemplation of the greatness of God's creation into an order and a light that guides humanity.

### License and Contribution

Mishkah is fully open-source under the **MIT License**. If you are convinced by this idea, then your contribution is not merely an option; it is part of completing this light. For great ideas are not perfected by individual effort, but by collective work, that they may become a brilliant star that illuminates for all.


`;

  Mishkah.readme  ={base:{ar:ar_README_BASE ,en:en_README_BASE} ,tec:{ar:arREADME,en:enREADME}}


})(window);
