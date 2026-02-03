// حل سريع: استخدام reload للثيم واللغة
// استبدل setEnvLanguage و setEnvTheme بهذا الكود:

function setEnvLanguage(ctx, lang) {
  if (!ctx) return;
  var nextLang = lang || 'ar';
  var dir = resolveDir(nextLang);

  // حفظ في localStorage
  var nextEnv = Object.assign({}, activeEnv(), { lang: nextLang, dir: dir });
  persistPrefs(nextEnv);

  // إعادة تحميل الصفحة
  window.location.reload();
}

function setEnvTheme(ctx, theme) {
  if (!ctx) return;
  var nextTheme = theme === 'light' ? 'light' : 'dark';

  // حفظ في localStorage
  var nextEnv = Object.assign({}, activeEnv(), { theme: nextTheme });
  persistPrefs(nextEnv);

  // إعادة تحميل الصفحة
  window.location.reload();
}
