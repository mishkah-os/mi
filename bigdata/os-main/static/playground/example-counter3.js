(function () {
  'use strict';

  // ============================================================
  // EXAMPLES Data - Counter Example with Multiple Frameworks
  // ============================================================

  window.EXAMPLES = [
    {
      id: 'counter',
      title: {
        en: 'Counter Example',
        ar: 'مثال العداد'
      },
      description: {
        en: 'A simple counter application demonstrating state management',
        ar: 'تطبيق عداد بسيط يوضح إدارة الحالة'
      },
      readme: {
        en: `# Counter Example

## Overview
A simple counter application that demonstrates state management across different JavaScript frameworks and Mishkah DSL.

## Features
- ✨ **Increment Button**: Click to increase counter
- 🔄 **State Management**: Demonstrates reactive state updates
- 🎨 **Mishkah Features** (in Mishkah variants):
  - Theme switching (Dark/Light)
  - i18n support (Arabic/English)
  - CSS Variables
  - Event delegation

## Why This Example?
The counter is a classic example because it showcases:
1. DOM manipulation
2. Event handling
3. State management
4. UI reactivity

Perfect for comparing framework approaches!`,
        ar: `# مثال العداد

## نظرة عامة
تطبيق عداد بسيط يوضح إدارة الحالة عبر أطر عمل JavaScript المختلفة و Mishkah DSL.

## المميزات
- ✨ **زر الزيادة**: اضغط لزيادة العداد
- 🔄 **إدارة الحالة**: يوضح تحديثات الحالة التفاعلية
- 🎨 **مميزات مشكاة** (في نسخ مشكاة):
  - تبديل المظهر (داكن/فاتح)
  - دعم i18n (عربي/إنجليزي)
  - متغيرات CSS
  - تفويض الأحداث

## لماذا هذا المثال؟
العداد مثال كلاسيكي لأنه يعرض:
1. معالجة DOM
2. معالجة الأحداث
3. إدارة الحالة
4. تفاعلية واجهة المستخدم

مثالي لمقارنة طرق الأطر المختلفة!`
      }, wikiId: 'counter-basics',
      implementations: [
        {
          framework: 'vanilla'
          , wikiId: 'vanilla-counter'
          ,
          code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vanilla JS Counter</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f0f0f0;
    }
    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin: 0 0 1rem; }
    .count { font-size: 4rem; font-weight: bold; color: #0066cc; margin: 1rem 0; }
    button {
      padding: 0.75rem 2rem;
      font-size: 1.1rem;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #0052a3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Vanilla JS Counter</h1>
    <div class="count" id="count">0</div>
    <button id="btn">Increment</button>
  </div>

  <script>
    let count = 0;
    const display = document.getElementById('count');
    const btn = document.getElementById('btn');

    btn.addEventListener('click', () => {
      count++;
      display.textContent = count;
    });
  </script>
</body>
</html>`},
        {
          framework: 'jquery'
          , wikiId: 'jquery-counter'
          ,
          code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>jQuery Counter</title>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f0f0f0;
    }
    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin: 0 0 1rem; }
    .count { font-size: 4rem; font-weight: bold; color: #0066cc; margin: 1rem 0; }
    button {
      padding: 0.75rem 2rem;
      font-size: 1.1rem;
      background: #0066cc;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #0052a3; }
  </style>
</head>
<body>
  <div class="container">
    <h1>jQuery Counter</h1>
    <div class="count" id="count">0</div>
    <button id="btn">Increment</button>
  </div>

  <script>
    $(document).ready(function() {
      let count = 0;
      $('#btn').click(function() {
        count++;
        $('#count').text(count);
      });
    });
  </script>
</body>
</html>`}
        , {
          framework: 'vue'
          , wikiId: 'vue-counter'
          ,
          code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vue.js Counter</title>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f0f0f0;
    }
    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin: 0 0 1rem; }
    .count { font-size: 4rem; font-weight: bold; color: #42b983; margin: 1rem 0; }
    button {
      padding: 0.75rem 2rem;
      font-size: 1.1rem;
      background: #42b983;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #35495e; }
  </style>
</head>
<body>
  <div id="app">
    <div class="container">
      <h1>Vue.js Counter</h1>
      <div class="count">{{ count }}</div>
      <button @click="increment">Increment</button>
    </div>
  </div>

  <script>
    const { createApp, ref } = Vue;

    createApp({
      setup() {
        const count = ref(0);
        const increment = () => count.value++;
        return { count, increment };
      }
    }).mount('#app');
  </script>
</body>
</html>`},
        {
          framework: 'react'
          , wikiId: 'react-counter'
          ,
          code: `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mishkah React v2.0 Test</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }

        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
            color: #667eea;
            margin-bottom: 30px;
            font-size: 2em;
        }

        .counter {
            text-align: center;
            padding: 40px;
            background: #f8f9fa;
            border-radius: 15px;
            margin: 20px 0;
        }

        .count {
            font-size: 4em;
            font-weight: bold;
            color: #667eea;
            margin: 20px 0;
        }

        button {
            background: #667eea;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin: 5px;
            transition: all 0.3s ease;
        }

        button:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        button:active {
            transform: translateY(0);
        }

        .success {
            background: #10b981;
        }

        .success:hover {
            background: #059669;
        }

        .danger {
            background: #ef4444;
        }

        .danger:hover {
            background: #dc2626;
        }

        .log {
            background: #1f2937;
            color: #10b981;
            padding: 15px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            margin-top: 20px;
        }
    </style>
    <script src="../lib/mishkah.core.js"></script>
    <script src="../lib/mishkah-react.js"></script>
    <script src="../lib/mishkah-jsx.js"></script>
</head>

<body>
    <div class="container">
        <h1>🚀 Mishkah React v2.0 Test</h1>
        <div id="app"></div>
        <div class="log" id="log"></div>
    </div>

    <script type="text/jsx">
        const { useState, useEffect } = Mishkah.React;

        function log(msg) {
            const logEl = document.getElementById('log');
            const time = new Date().toLocaleTimeString();
            logEl.innerHTML += \`[\${time}] \${msg}\n\`;
            logEl.scrollTop = logEl.scrollHeight;
        }

        function Counter() {
            log('🔵 Counter component called');
            
            const [count, setCount] = useState(0);
            
            useEffect(() => {
                log('✅ useEffect: Count changed to ' + count);
            }, [count]);

            function increment() {
                log('➕ Increment clicked');
                setCount(count + 1);
            }

            function decrement() {
                log('➖ Decrement clicked');
                setCount(count - 1);
            }

            function reset() {
                log('🔄 Reset clicked');
                setCount(0);
            }

            return (
                <div className="counter">
                    <h2>Counter Test</h2>
                    <div className="count">{count}</div>
                    <div>
                        <button onClick={increment}>
                            ➕ Increment
                        </button>
                        <button className="danger" onClick={decrement}>
                            ➖ Decrement
                        </button>
                        <button className="success" onClick={reset}>
                            🔄 Reset
                        </button>
                    </div>
                    <p style={{marginTop: '20px', color: '#666'}}>
                        {count === 0 && '👉 Click a button to start!'}
                        {count > 0 && '✅ Positive number'}
                        {count < 0 && '❌ Negative number'}
                    </p>
                </div>
            );
        }

        log('🎬 Starting app...');
        Mishkah.React.render(Counter, document.getElementById('app'));
        log('✨ App rendered successfully!');
    </script>
</body>

</html>`
        },
        {
          framework: 'mishkah-dsl'
          , wikiId: 'mishkah-dsl-counter'
          ,
          code: `// Mishkah DSL Counter with i18n & Theme Support
                // Mishkah DSL Counter - Clean Version
const database = {
        count: 0,
        env: { theme: 'dark', lang: 'ar', dir: 'rtl' },
        i18n: {
          dict: {
            'app.title': { ar: 'عداد مشكاة', en: 'Mishkah Counter' },
            'counter.value': { ar: 'القيمة الحالية', en: 'Current Value' },
            'increment': { ar: 'زيادة', en: 'Increment' },
            'decrement': { ar: 'نقصان', en: 'Decrement' },
            'reset': { ar: 'إعادة تعيين', en: 'Reset' }
          }
        }
      };

      const orders = {
        'counter.increment': {
          on: ['click'],
          gkeys: ['inc'],
          handler: (e, ctx) => ctx.setState(s => ({ ...s, count: s.count + 1 }))
        },
        'counter.decrement': {
          on: ['click'],
          gkeys: ['dec'],
          handler: (e, ctx) => ctx.setState(s => ({ ...s, count: Math.max(0, s.count - 1) }))
        },
        'counter.reset': {
          on: ['click'],
          gkeys: ['reset'],
          handler: (e, ctx) => ctx.setState(s => ({ ...s, count: 0 }))
        }
      };

      function App(db) {
      const D = Mishkah.DSL;
      const t = (key) => db.i18n?.dict[key]?.[db.env.lang] || key;

      return D.Containers.Div({
        attrs: {
          class: 'counter-app',
          style: 'min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%);'
        }
      }, [
        // Animated background orbs
        D.Containers.Div({
          attrs: { class: 'orb orb-1' }
        }),
        D.Containers.Div({
          attrs: { class: 'orb orb-2' }
        }),

        // Main card
        D.Containers.Div({
          attrs: {
            class: 'counter-card',
            style: \`
          position: relative;
          max-width: 500px;
          width: 100%;
          background: rgba(26, 31, 58, 0.8);
          backdrop-filter: blur(20px);
          border: 2px solid rgba(42, 165, 160, 0.3);
          border-radius: 24px;
          padding: 3rem;
          box-shadow: 
            0 20px 60px rgba(42, 165, 160, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        \`
      }
    }, [
      // Corner decorations
      D.Containers.Div({
        attrs: {
          style: 'position: absolute; top: -2px; left: -2px; width: 80px; height: 80px; background: linear-gradient(135deg, rgba(42, 165, 160, 0.6) 0%, transparent 70%); border-radius: 24px 0 40px 0;'
        }
      }),
      D.Containers.Div({
        attrs: {
          style: 'position: absolute; bottom: -2px; right: -2px; width: 80px; height: 80px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.6) 0%, transparent 70%); border-radius: 0 24px 0 24px;'
        }
      }),
      
      // Title
      D.Text.H1({
        attrs: { 
          class: 'counter-title',
          style: 'text-align: center; font-size: 2.5rem; font-weight: 900; margin-bottom: 0.5rem; background: linear-gradient(135deg, #2aa5a0 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;'
        }
      }, [t('app.title')]),
      
      // Counter display
      D.Containers.Div({
        attrs: {
          class: 'counter-display',
          style: \`
            position: relative;
            background: rgba(42, 165, 160, 0.1);
            border: 2px solid rgba(42, 165, 160, 0.3);
            border-radius: 20px;
            padding: 3rem 2rem;
            margin: 2rem 0;
            text-align: center;
          \`
        }
      }, [
        // Glow effect based on count
        D.Containers.Div({
          attrs: {
            class: db.count > 0 ? 'counter-glow active' : 'counter-glow'
          }
        }),
        
        D.Text.Small({
          attrs: {
            style: 'display: block; margin-bottom: 1rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255, 255, 255, 0.5);'
          }
        }, [t('counter.value')]),
        
        D.Containers.Div({
          attrs: { 
            class: 'counter-number',
            style: 'font-size: 6rem; font-weight: 900; background: linear-gradient(135deg, #2aa5a0 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;'
          }
        }, [String(db.count)])
      ]),
      
      // Buttons
      D.Containers.Div({
        attrs: { 
          class: 'counter-buttons',
          style: 'display: flex; gap: 0.75rem;'
        }
      }, [
        D.Forms.Button({
          attrs: { 
            'data-m-gkey': 'inc',
            class: 'btn btn-primary'
          }
        }, ['➕ ' + t('increment')]),
        
        D.Forms.Button({
          attrs: { 
            'data-m-gkey': 'dec',
            class: 'btn btn-secondary'
          }
        }, ['➖ ' + t('decrement')]),
        
        D.Forms.Button({
          attrs: { 
            'data-m-gkey': 'reset',
            class: 'btn btn-reset'
          }
        }, ['🔄 ' + t('reset')])
      ])
    ])
  ]);
}

// CSS Styles (add to <style> in HTML or separate CSS file)
const styles = \`
  @keyframes float {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(30px, -30px); }
  }
  
  @keyframes pulse-glow {
    0%, 100% { opacity: 0; }
    50% { opacity: 0.3; }
  }
  
  .orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
    animation: float 10s ease-in-out infinite;
  }
  
  .orb-1 {
    top: 10%;
    left: 10%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(42, 165, 160, 0.4) 0%, transparent 70%);
  }
  
  .orb-2 {
    bottom: 10%;
    right: 10%;
    width: 350px;
    height: 350px;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%);
    animation-delay: -5s;
    animation-direction: reverse;
  }
  
  .counter-glow {
    position: absolute;
    inset: -30px;
    background: radial-gradient(circle, rgba(42, 165, 160, 0.4) 0%, transparent 70%);
    border-radius: 20px;
    opacity: 0;
    filter: blur(40px);
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
  
  .counter-glow.active {
    opacity: 0.3;
    animation: pulse-glow 2s ease-in-out infinite;
  }
  
  .counter-number {
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  
  .btn {
    flex: 1;
    padding: 1rem;
    font-size: 1rem;
    font-weight: 700;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  
  .btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transform: translateX(-100%);
    transition: transform 0.6s ease;
  }
  
  .btn:hover::before {
    transform: translateX(100%);
  }
  
  .btn-primary {
    background: linear-gradient(135deg, #2aa5a0 0%, #8b5cf6 100%);
    color: white;
    box-shadow: 0 4px 14px rgba(42, 165, 160, 0.4);
  }
  
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(42, 165, 160, 0.6);
  }
  
  .btn-primary:active {
    transform: translateY(0);
  }
  
  .btn-secondary {
    background: rgba(42, 165, 160, 0.2);
    color: #fff;
    border: 2px solid rgba(42, 165, 160, 0.5);
  }
  
  .btn-secondary:hover {
    background: rgba(42, 165, 160, 0.3);
    transform: translateY(-2px);
    border-color: rgba(42, 165, 160, 0.8);
  }
  
  .btn-reset {
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    border: 2px solid rgba(255, 255, 255, 0.2);
    min-width: 120px;
  }
  
  .btn-reset:hover {
    border-color: #ef4444;
    color: #ef4444;
  }
\`;

// Inject styles
// Add styles using Mishkah Head API
Mishkah.Head.style({
    id: 'counter-app-styles',
    content: styles
});

// Initialize
const app = Mishkah.app.createApp(database, orders);
Mishkah.app.setBody(App);
app.mount('#app');
`},
        {
          framework: 'mishkah-htmlx'
          , wikiId: 'mishkah-htmlx-counter'
          ,
          code: `<!DOCTYPE html>
<html lang="ar" dir="rtl" data-htmlx="main" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>Mishkah HTMLx Counter</title>
  <script src="../lib/mishkah.js" data-htmlx data-ui></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--background);
      font-family: system-ui, -apple-system, sans-serif;
    }
    .container {
      text-align: center;
      padding: 3rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      box-shadow: var(--shadow-xl);
    }
    .counter-value {
      font-size: 5rem;
      font-weight: 900;
      background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 2rem 0;
    }
    .btn {
      padding: 0.75rem 2rem;
      font-size: 1.1rem;
      font-weight: 600;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .btn:hover { transform: scale(1.05); }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
      color: white;
    }
    .btn-secondary {
      background: var(--muted);
      color: var(--foreground);
      margin-inline-start: 0.5rem;
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <template id="main">
    <script type="application/json" data-m-path="env">
      {"theme":"dark","lang":"ar","dir":"rtl"}
    </script>

    <script type="application/json" data-m-path="data">
      {"count": 0}
    </script>

    <script type="application/json" data-m-path="i18n.dict">
      {
        "app.title": {"ar":"عداد مشكاة","en":"Mishkah Counter"},
        "increment": {"ar":"زيادة","en":"Increment"},
        "reset": {"ar":"إعادة تعيين","en":"Reset"}
      }
    </script>

    <div class="container">
         <div style="margin-bottom: 1.5rem;margin-top: -1.5rem;">
  <ThemeSwitcher onclick="setTheme(event, ctx)" theme={state.env.theme} />
  <LangSwitcher onclick="setLang(event, ctx)" lang={state.env.lang} style="margin-inline-start: 0.5rem;" />
</div>
      <h1 style="color: var(--foreground); margin: 0 0 1rem;">{t('app.title')}</h1>
      <div class="counter-value">{state.data.count}</div>
      <div>
        <button onclick="increment(event, ctx)" class="btn btn-primary">
          ➕ {t('increment')}
        </button>
        <button onclick="reset(event, ctx)" class="btn btn-secondary">
          🔄 {t('reset')}
        </button>
      </div>
   
    </div>

    <script>
      function increment(e, ctx) {
        ctx.setState(s => {
          s.data.count++;
          return s;
        });
      }
      
      function reset(e, ctx) {
        ctx.setState(s => {
          s.data.count = 0;
          return s;
        });
      }
         function setTheme(e, ctx) {
                const btn = e.target.closest('button');
                if (!btn) return;

                const theme = btn.dataset.value;

                ctx.setState(function (s) {
                    s.env.theme = theme;
                    return s;
                });

                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
            }

            // Language Logic
            function setLang(e, ctx) {
                const btn = e.target.closest('button');
                if (!btn) return;

                const lang = btn.dataset.value;

                ctx.setState(function (s) {
                    s.env.lang = lang;
                    s.env.dir = lang === 'ar' ? 'rtl' : 'ltr';
                    return s;
                });

                document.documentElement.lang = lang;
                document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
                localStorage.setItem('lang', lang);
            }
    </script>
  </template>
</body>
</html>`}
      ]
    }
  ];


})();
