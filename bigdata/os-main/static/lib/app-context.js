(function (w) {
    'use strict';

    const M = w.MishkahFirebase;
    // Dependency: relies on MishkahFirebase for signals if we want reactivity, 
    // or we can implement simple state here. Let's use MF's signal if available, else fallback.

    const createSignal = M && M.signal ? M.signal : (val) => {
        let v = val;
        const listeners = new Set();
        return [
            () => v,
            (n) => { v = n; listeners.forEach(cb => cb(n)); }
        ];
    };

    class AppContext {
        constructor() {
            // Load saved prefs
            const savedLang = localStorage.getItem('mishkah_lang') || 'en';
            const savedTheme = localStorage.getItem('mishkah_theme') || 'light';

            this._lang = createSignal(savedLang);
            this._theme = createSignal(savedTheme);

            this.lang = this._lang[0];
            this.setLang = this._lang[1];
            this.theme = this._theme[0];
            this.setTheme = this._theme[1];

            // Initial apply
            this._applyTheme(savedTheme);
            this._applyLang(savedLang);
        }

        toggleTheme() {
            const newTheme = this.lang() === 'light' ? 'dark' : 'light';
            // Wait, bug above: this.lang() check is wrong for theme.
            const current = this.theme();
            const next = current === 'light' ? 'dark' : 'light';
            this.setTheme(next);
            localStorage.setItem('mishkah_theme', next);
            this._applyTheme(next);
        }

        changeLanguage(code) {
            if (code !== 'ar' && code !== 'en') return;
            this.setLang(code);
            localStorage.setItem('mishkah_lang', code);
            this._applyLang(code);
        }

        _applyTheme(theme) {
            const root = document.documentElement;
            if (theme === 'dark') {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        }

        _applyLang(lang) {
            const dir = lang === 'ar' ? 'rtl' : 'ltr';
            document.documentElement.dir = dir;
            document.documentElement.lang = lang;
        }
    }

    w.AppContext = new AppContext();

})(window);
