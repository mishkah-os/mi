/**
 * Mishkah Developer Helper System
 * نظام المساعدة للمطورين في Mishkah
 *
 * الاستخدام:
 *   M.help()                    - عرض التعليمات الرئيسية
 *   M.help.components()         - قائمة بجميع المكونات المتاحة
 *   M.help.component('Modal')   - تفاصيل مكون محدد
 *   M.help.htmlx()             - تعليمات HTMLx
 *   M.help.examples()          - أمثلة شائعة
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(function () {
      return factory(root);
    });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.MishkahHelp = factory(root);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  function ensureMishkah() {
    var host = global || {};
    host.Mishkah = host.Mishkah || {};
    host.M = host.M || host.Mishkah;
    return host.Mishkah;
  }

  var Mishkah = ensureMishkah();

  // نظام المساعدة الرئيسي
  var HelpSystem = {

    // التعليمات الرئيسية
    main: function () {
      console.log('%c🌙 Mishkah Developer Help', 'font-size: 18px; font-weight: bold; color: #4A90E2;');
      console.log('\n📚 الأوامر المتاحة:\n');
      console.log('  M.help()                    - هذه التعليمات');
      console.log('  M.help.components()         - قائمة المكونات');
      console.log('  M.help.component(name)      - تفاصيل مكون');
      console.log('  M.help.htmlx()             - تعليمات HTMLx');
      console.log('  M.help.examples()          - أمثلة شائعة');
      console.log('  M.help.inspect(element)     - فحص عنصر');
      console.log('  M.help.templates()         - قوالب جاهزة');
      console.log('  M.help.naming()            - أنماط التسمية');
      console.log('  M.help.config()            - إعدادات السقالات');
      console.log('  M.help.scaffold()          - حالة التحميل');
      console.log('\n💡 للبدء السريع: M.help.examples()');
    },

    // قائمة المكونات المتاحة
    components: function () {
      console.log('%c📦 المكونات المتاحة', 'font-size: 16px; font-weight: bold;');

      var ui = Mishkah.UI || {};
      var components = Object.keys(ui).filter(function (key) {
        return typeof ui[key] === 'function';
      });

      if (components.length === 0) {
        console.log('⚠️  لم يتم العثور على مكونات. تأكد من تحميل mishkah-ui.js');
        return;
      }

      console.log('\n✅ المكونات المسجلة (' + components.length + '):\n');
      components.forEach(function (name) {
        console.log('  • ' + name + ' → استخدمها: <Modal>, <modal>, <m-modal>');
      });

      console.log('\n💡 للمزيد من التفاصيل: M.help.component("اسم_المكون")');
    },

    // تفاصيل مكون محدد
    component: function (name) {
      if (!name) {
        console.error('❌ يجب تحديد اسم المكون. مثال: M.help.component("Modal")');
        return;
      }

      var ui = Mishkah.UI || {};
      var component = ui[name];

      if (!component) {
        console.error('❌ المكون "' + name + '" غير موجود');
        console.log('💡 للحصول على قائمة المكونات: M.help.components()');
        return;
      }

      console.log('%c📦 ' + name, 'font-size: 16px; font-weight: bold;');
      console.log('\n🎯 طرق الاستخدام:\n');
      console.log('  <!-- JSX-style -->');
      console.log('  <' + name + '>المحتوى</' + name + '>');
      console.log('');
      console.log('  <!-- Vue-style -->');
      console.log('  <' + name.toLowerCase() + '>المحتوى</' + name.toLowerCase() + '>');
      console.log('');
      console.log('  <!-- Web Components style -->');
      console.log('  <m-' + name.toLowerCase() + '>المحتوى</m-' + name.toLowerCase() + '>');
      console.log('');
      console.log('  <!-- Legacy (مدعوم للتوافق) -->');
      console.log('  <comp-' + name + '>المحتوى</comp-' + name + '>');

      console.log('\n💡 المكون:', component);
    },

    // تعليمات HTMLx
    htmlx: function () {
      console.log('%c🎨 HTMLx - دليل سريع', 'font-size: 16px; font-weight: bold;');
      console.log('\n📝 القوالب (Templates):\n');
      console.log('  <template id="my-component">');
      console.log('    <style>');
      console.log('      /* الـ CSS scope تلقائياً بناءً على id */');
      console.log('      .title { color: blue; }');
      console.log('    </style>');
      console.log('    <div class="title">{{data.title}}</div>');
      console.log('  </template>');

      console.log('\n🔗 الربط (Binding):\n');
      console.log('  {{data.value}}                 - عرض قيمة');
      console.log('  <div :class="data.className">  - ربط خاصية (جديد)');
      console.log('  <div data-m-bind="value">      - ربط (قديم)');

      console.log('\n⚡ الأحداث (Events):\n');
      console.log('  <button @click="save">         - معالج حدث (جديد)');
      console.log('  <button data-m-on-click="save"> - معالج (قديم)');
      console.log('  <button onclick="save">        - معالج (HTML)');

      console.log('\n🔄 التكرار والشروط:\n');
      console.log('  <div x-for="item in items">    - تكرار');
      console.log('  <div x-if="condition">         - شرط');
      console.log('  <div x-else-if="other">        - شرط آخر');
      console.log('  <div x-else>                   - else');

      console.log('\n💡 لمزيد من الأمثلة: M.help.examples()');
    },

    // أمثلة شائعة
    examples: function () {
      console.log('%c💡 أمثلة شائعة', 'font-size: 16px; font-weight: bold;');

      console.log('\n1️⃣ مكون بسيط:\n');
      console.log('  <template id="greeting">');
      console.log('    <style>');
      console.log('      .greeting { padding: 1rem; }');
      console.log('    </style>');
      console.log('    <div class="greeting">');
      console.log('      مرحباً {{data.name}}!');
      console.log('    </div>');
      console.log('  </template>');

      console.log('\n2️⃣ قائمة تفاعلية:\n');
      console.log('  <template id="todo-list">');
      console.log('    <ul>');
      console.log('      <li x-for="item in data.items" :key="item.id">');
      console.log('        {{item.text}}');
      console.log('        <button @click="remove(item.id)">حذف</button>');
      console.log('      </li>');
      console.log('    </ul>');
      console.log('  </template>');

      console.log('\n3️⃣ نموذج إدخال:\n');
      console.log('  <template id="user-form">');
      console.log('    <form @submit="handleSubmit">');
      console.log('      <input :value="data.name" @input="updateName" />');
      console.log('      <button type="submit">حفظ</button>');
      console.log('    </form>');
      console.log('  </template>');

      console.log('\n4️⃣ استخدام المكونات (كل الأنماط مدعومة):\n');
      console.log('  <!-- JSX-style -->');
      console.log('  <Modal>محتوى النافذة</Modal>');
      console.log('');
      console.log('  <!-- Vue-style -->');
      console.log('  <modal>محتوى النافذة</modal>');
      console.log('');
      console.log('  <!-- Web Components -->');
      console.log('  <m-modal>محتوى النافذة</m-modal>');

      console.log('\n💡 نسخ الأمثلة: M.help.templates()');
    },

    // فحص عنصر
    inspect: function (element) {
      if (!element) {
        console.error('❌ يجب تمرير عنصر للفحص');
        console.log('💡 مثال: M.help.inspect(document.querySelector("#my-element"))');
        return;
      }

      console.log('%c🔍 فحص العنصر', 'font-size: 16px; font-weight: bold;');
      console.log('\n📊 المعلومات:\n');
      console.log('  Tag:', element.tagName);
      console.log('  ID:', element.id || 'N/A');
      console.log('  Classes:', element.className || 'N/A');
      console.log('  Attributes:', Array.from(element.attributes).map(function (a) {
        return a.name + '="' + a.value + '"';
      }).join(', '));

      // فحص إذا كان العنصر من HTMLx
      if (element.hasAttribute('data-m-key')) {
        console.log('\n✅ عنصر HTMLx:');
        console.log('  Key:', element.getAttribute('data-m-key'));
        console.log('  Namespace:', element.getAttribute('data-m-namespace') || 'N/A');
      }

      console.log('\n💡 العنصر:', element);
    },

    // قوالب جاهزة
    templates: function () {
      console.log('%c📋 قوالب جاهزة', 'font-size: 16px; font-weight: bold;');
      console.log('\n💾 نسخ القالب المطلوب:\n');

      var templates = {
        'basic-component': '<template id="my-component">\n  <style>\n    /* CSS هنا */\n  </style>\n  <div>{{data.message}}</div>\n</template>',
        'list-with-actions': '<template id="item-list">\n  <ul>\n    <li x-for="item in data.items" :key="item.id">\n      {{item.name}}\n      <button @click="edit(item)">تعديل</button>\n      <button @click="delete(item)">حذف</button>\n    </li>\n  </ul>\n</template>',
        'form-with-validation': '<template id="user-form">\n  <form @submit="save">\n    <input :value="data.name" @input="updateName" required />\n    <span x-if="errors.name" class="error">{{errors.name}}</span>\n    <button type="submit">حفظ</button>\n  </form>\n</template>',
        'conditional-content': '<template id="status-display">\n  <div x-if="data.loading">جاري التحميل...</div>\n  <div x-else-if="data.error">خطأ: {{data.error}}</div>\n  <div x-else>{{data.content}}</div>\n</template>'
      };

      Object.keys(templates).forEach(function (name) {
        console.log('📄 ' + name + ':');
        console.log('   Copy to clipboard: copy(M.help.getTemplate("' + name + '"))');
      });

      console.log('\n💡 للحصول على قالب: M.help.getTemplate("اسم_القالب")');
    },

    // الحصول على قالب محدد
    getTemplate: function (name) {
      var templates = {
        'basic-component': '<template id="my-component">\n  <style>\n    /* CSS هنا */\n  </style>\n  <div>{{data.message}}</div>\n</template>',
        'list-with-actions': '<template id="item-list">\n  <ul>\n    <li x-for="item in data.items" :key="item.id">\n      {{item.name}}\n      <button @click="edit(item)">تعديل</button>\n      <button @click="delete(item)">حذف</button>\n    </li>\n  </ul>\n</template>',
        'form-with-validation': '<template id="user-form">\n  <form @submit="save">\n    <input :value="data.name" @input="updateName" required />\n    <span x-if="errors.name" class="error">{{errors.name}}</span>\n    <button type="submit">حفظ</button>\n  </form>\n</template>',
        'conditional-content': '<template id="status-display">\n  <div x-if="data.loading">جاري التحميل...</div>\n  <div x-else-if="data.error">خطأ: {{data.error}}</div>\n  <div x-else>{{data.content}}</div>\n</template>'
      };

      if (!templates[name]) {
        console.error('❌ القالب "' + name + '" غير موجود');
        console.log('💡 القوالب المتاحة:', Object.keys(templates).join(', '));
        return '';
      }

      console.log('✅ تم نسخ القالب "' + name + '"');
      return templates[name];
    },

    // معلومات الإعدادات والسقالات
    config: function () {
      console.log('%c⚙️  إعدادات Mishkah', 'font-size: 16px; font-weight: bold;');

      var scaffold = global.__MISHKAH_SCAFFOLD__;
      if (!scaffold) {
        console.warn('⚠️  نظام السقالات غير نشط. تأكد من تحميل mishkah.scaffold.js');
        return;
      }

      var config = scaffold.config;
      console.log('\n🔧 الوضع الحالي: %c' + config.mode, 'font-weight: bold; color: #E74C3C;');
      console.log('\n📦 المكتبات المحمّلة:');
      console.log('  Core:', config.features.core ? '✅' : '❌');
      console.log('  Utils:', config.features.utils ? '✅' : '❌');
      console.log('  UI:', config.features.ui ? '✅' : '❌');
      console.log('  HTMLx:', config.features.htmlx ? '✅' : '❌');
      console.log('  Store:', config.features.store ? '✅' : '❌');
      console.log('  CRUD:', config.features.crud ? '✅' : '❌');
      console.log('  Pages:', config.features.pages ? '✅' : '❌');

      console.log('\n🔍 الطبقات التشخيصية:');
      console.log('  Div (Rules):', config.diagnostics.div ? '✅' : '❌');
      console.log('  Help:', config.diagnostics.help ? '✅' : '❌');
      console.log('  Performance:', config.diagnostics.performance ? '✅' : '❌');
      console.log('  Security:', config.diagnostics.security ? '✅' : '❌');

      console.log('\n📊 الإحصائيات:');
      console.log('  المحمّل:', scaffold.loaded.length, 'وحدة');
      console.log('  الفاشل:', scaffold.failed.length, 'وحدة');
      console.log('  التوقيت:', scaffold.timestamp);

      console.log('\n💡 لتغيير الإعدادات، استخدم: window.__MISHKAH_CONFIG__');
    },

    // حالة نظام السقالات
    scaffold: function () {
      console.log('%c🏗️  حالة السقالات', 'font-size: 16px; font-weight: bold;');

      var scaffold = global.__MISHKAH_SCAFFOLD__;
      if (!scaffold) {
        console.warn('⚠️  نظام السقالات غير نشط.');
        console.log('\n📝 للتفعيل، أضف إلى صفحتك:');
        console.log('  <script src="/static/lib/mishkah.scaffold.js"></script>');
        return;
      }

      console.log('\n✅ المكتبات المحمّلة بنجاح:\n');
      scaffold.loaded.forEach(function (item) {
        var icon = item.diagnostic ? '🔍' : '📦';
        console.log('  ' + icon + ' ' + item.name + ' (' + item.path + ')');
      });

      if (scaffold.failed.length > 0) {
        console.log('\n❌ فشل التحميل:\n');
        scaffold.failed.forEach(function (f) {
          console.log('  ⚠️  ' + f.item.name + ' - ' + f.error);
        });
      }

      console.log('\n⏰ وقت التحميل:', scaffold.timestamp);
      console.log('\n💡 لعرض الإعدادات: M.help.config()');
    },

    // أنماط التسمية المدعومة
    naming: function () {
      console.log('%c🏷️  أنماط التسمية المدعومة', 'font-size: 16px; font-weight: bold;');
      console.log('\n✅ HTMLx يدعم جميع الأنماط التالية:\n');

      console.log('1️⃣ JSX-style (الأكثر شيوعاً):');
      console.log('   <Modal>المحتوى</Modal>');
      console.log('   <Button>انقر</Button>');
      console.log('   → يبحث في: Mishkah.UI.Modal, Mishkah.UI.Button\n');

      console.log('2️⃣ Vue-style (lowercase):');
      console.log('   <modal>المحتوى</modal>');
      console.log('   <button-group>أزرار</button-group>');
      console.log('   → يحول إلى PascalCase تلقائياً\n');

      console.log('3️⃣ Web Components (kebab-case مع prefix):');
      console.log('   <m-modal>المحتوى</m-modal>');
      console.log('   <m-button>انقر</m-button>');
      console.log('   → يزيل m- ويحول إلى PascalCase\n');

      console.log('4️⃣ Legacy (للتوافق):');
      console.log('   <comp-Modal>المحتوى</comp-Modal>');
      console.log('   → النمط القديم (ما زال مدعوماً)\n');

      console.log('💡 كل الأنماط تعمل بنفس الطريقة - اختر ما يناسبك!');
    }
  };

  // دالة رئيسية تعرض التعليمات
  function help() {
    HelpSystem.main();
  }

  // إضافة الدوال الفرعية
  help.components = HelpSystem.components;
  help.component = HelpSystem.component;
  help.htmlx = HelpSystem.htmlx;
  help.examples = HelpSystem.examples;
  help.inspect = HelpSystem.inspect;
  help.templates = HelpSystem.templates;
  help.getTemplate = HelpSystem.getTemplate;
  help.naming = HelpSystem.naming;
  help.config = HelpSystem.config;
  help.scaffold = HelpSystem.scaffold;

  // تسجيل في Mishkah
  Mishkah.help = help;

  // رسالة ترحيبية عند التحميل
  if (typeof console !== 'undefined' && console.log) {
    console.log('%c🌙 Mishkah Help System loaded!', 'color: #4A90E2; font-weight: bold;');
    console.log('💡 اكتب M.help() للبدء');
  }

  return help;
});
