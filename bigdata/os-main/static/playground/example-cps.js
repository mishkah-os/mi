(function () {
  'use strict';

  // ============================================================
  // EXAMPLES Data - Combined Examples
  // ============================================================

  window.EXAMPLES.push({
    "id": "cps-challenge",
    "title": {
      "en": "CPS Challenge",
      "ar": "تحدي النقرات"
    },
    "description": {
      "en": "Test your clicking speed! A game to measure Clicks Per Second.",
      "ar": "اختبر سرعتك في النقر! لعبة لقياس عدد النقرات في الثانية."
    },
    "readme": {
      "en": "# CPS Challenge (Clicks Per Second)\n\n## Overview\nA fun mini-game to test how fast you can click in a given time.\n\n## Features\n- ⏱️ **Timer**: Set your challenge duration.\n- 👆 **Clicker**: Smash the button!\n- 🏆 **Score**: Calculates your CPS automatically.\n- 🚫 **Anti-Cheat**: Button disabled when not running.",
      "ar": "# تحدي النقرات (CPS)\n\n## نظرة عامة\nلعبة ممتعة لاختبار سرعة النقر لديك في وقت محدد.\n\n## المميزات\n- ⏱️ **المؤقت**: حدد مدة التحدي.\n- 👆 **الزر**: اضغط بأقصى سرعة!\n- 🏆 **النتيجة**: يحسب معدل النقرات في الثانية تلقائياً.\n- 🚫 **منع الغش**: الزر معطل عندما لا يكون التحدي نشطاً."
    }, wikiId: 'cps-challenge-basics',
    "implementations": [
      {
        "framework": "mishkah-dsl",
        "wikiId": "mishkah-dsl-cps-challenge",
        "code": "// ==========================================\n// ⚡ تحدي النقرات (CPS Counter) - Mishkah DSL\n// ==========================================\n\n// 1. الحالة (State)\nconst database = {\n  countdown: 0,\n  clicks: 0,\n  isRunning: false,\n  countdownInput: 10,\n  cps: null,\n  totalTime: 0\n};\n\n// 2. الأوامر (Orders)\nconst orders = {\n  'start.challenge': {\n    on: ['click'],\n    gkeys: ['start-btn'],\n    handler: (e, ctx) => {\n      const inputEl = document.querySelector('[data-m-gkey=\"time-input\"]');\n      const val = inputEl ? parseInt(inputEl.value) : 10;\n      \n      ctx.setState(s => ({\n        ...s,\n        countdown: val,\n        totalTime: val,\n        clicks: 0,\n        isRunning: true,\n        cps: null\n      }));\n\n      const interval = setInterval(() => {\n        ctx.setState(s => {\n          if (s.countdown <= 1) {\n            clearInterval(interval);\n            return { ...s, countdown: 0, isRunning: false };\n          }\n          return { ...s, countdown: s.countdown - 1 };\n        });\n      }, 1000);\n    }\n  },\n\n  'register.click': {\n    on: ['click'],\n    gkeys: ['click-btn'],\n    handler: (e, ctx) => {\n      ctx.setState(s => {\n        if (s.isRunning && s.countdown > 0) {\n          return { ...s, clicks: s.clicks + 1 };\n        }\n        return s;\n      });\n    }\n  },\n\n  'reset.challenge': {\n    on: ['click'],\n    gkeys: ['reset-btn'],\n    handler: (e, ctx) => {\n      ctx.setState(s => {\n        let cpsValue = null;\n        if (s.clicks > 0 && s.totalTime > 0) {\n          const timeUsed = s.totalTime - s.countdown;\n          cpsValue = timeUsed > 0 ? (s.clicks / timeUsed).toFixed(2) : 0;\n        }\n        return {\n          ...s,\n          countdown: 0,\n          clicks: 0,\n          isRunning: false,\n          cps: cpsValue,\n          totalTime: 0\n        };\n      });\n    }\n  },\n  \n  'input.change': {\n    on: ['input'],\n    gkeys: ['time-input'],\n    handler: (e, ctx) => {\n       const val = parseInt(e.target.value) || 0;\n       ctx.setState(s => ({...s, countdownInput: val}));\n    }\n  }\n};\n\n// 3. الواجهة (UI)\nfunction App(db) {\n  const D = Mishkah.DSL;\n  \n  const cardStyle = \"background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px; margin: 2rem auto; font-family: 'Segoe UI', sans-serif; text-align: center;\";\n  const titleStyle = \"color: #4f46e5; font-size: 2rem; margin-bottom: 0.5rem; font-weight: bold;\";\n  const statBoxStyle = \"background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;\";\n  const btnStyle = \"padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: bold; cursor: pointer; color: white; transition: transform 0.2s;\";\n  const inputStyle = \"padding: 0.5rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; width: 100px; text-align: center; font-size: 1.2rem; margin-left: 0.5rem;\";\n\n  return D.Containers.Div({ attrs: { style: cardStyle } }, [\n    \n    D.Text.H1({ attrs: { style: titleStyle } }, ['⚡ تحدي النقرات']),\n    D.Text.P({ attrs: { style: \"color: #6b7280; margin-bottom: 2rem;\" } }, ['اختبر سرعتك في النقر!']),\n\n    D.Containers.Div({ attrs: { style: \"display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;\" } }, [\n      D.Containers.Div({ attrs: { style: statBoxStyle } }, [\n        D.Text.P({ attrs: { style: \"color: #6b7280; font-size: 0.9rem;\" } }, ['⏱️ الوقت المتبقي']),\n        D.Text.H2({ attrs: { style: `font-size: 2.5rem; margin: 0.5rem 0; color: ${db.countdown <= 3 && db.countdown > 0 ? '#ef4444' : '#10b981'};` } }, [String(db.countdown)])\n      ]),\n      D.Containers.Div({ attrs: { style: statBoxStyle } }, [\n        D.Text.P({ attrs: { style: \"color: #6b7280; font-size: 0.9rem;\" } }, ['👆 النقرات']),\n        D.Text.H2({ attrs: { style: \"font-size: 2.5rem; margin: 0.5rem 0; color: #4f46e5;\" } }, [String(db.clicks)])\n      ])\n    ]),\n\n    D.Containers.Div({ attrs: { style: \"margin: 2rem 0;\" } }, [\n      D.Forms.Label({}, ['⏰ المدة (ثواني): ']),\n      D.Inputs.Input({\n        attrs: {\n          type: 'number',\n          value: String(db.countdownInput),\n          'data-m-gkey': 'time-input',\n          style: inputStyle,\n          disabled: db.isRunning\n        }\n      })\n    ]),\n\n    D.Containers.Div({ attrs: { style: \"display: grid; gap: 1rem;\" } }, [\n      D.Forms.Button({\n        attrs: {\n          'data-m-gkey': 'start-btn',\n          style: `${btnStyle} background: ${db.isRunning ? '#9ca3af' : '#10b981'}; width: 100%;`,\n          disabled: db.isRunning\n        }\n      }, ['🚀 ابدأ التحدي']),\n\n      D.Forms.Button({\n        attrs: {\n          'data-m-gkey': 'click-btn',\n          style: `${btnStyle} background: ${!db.isRunning ? '#9ca3af' : '#3b82f6'}; width: 100%; transform: scale(${db.isRunning ? 1 : 0.98});`,\n          disabled: !db.isRunning\n        }\n      }, ['👆 اضغط هنا بسرعة!']),\n\n      D.Forms.Button({\n        attrs: {\n          'data-m-gkey': 'reset-btn',\n          style: `${btnStyle} background: #ef4444; width: 100%;`\n        }\n      }, ['🔄 إعادة تعيين'])\n    ]),\n\n    db.cps !== null ? D.Containers.Div({ \n      attrs: { style: \"margin-top: 2rem; padding: 1rem; border: 2px solid #f59e0b; border-radius: 1rem; background: #fffbeb; animation: fadeIn 0.5s;\" } \n    }, [\n      D.Text.H3({ attrs: { style: \"color: #b45309; margin: 0;\" } }, ['🏆 النتيجة النهائية']),\n      D.Text.H1({ attrs: { style: \"color: #d97706; font-size: 3rem; margin: 0.5rem 0;\" } }, [String(db.cps)]),\n      D.Text.P({ attrs: { style: \"color: #b45309;\" } }, ['نقرة / ثانية'])\n    ]) : null\n\n  ]);\n}\n\nconst app = Mishkah.app.createApp(database, orders);\nMishkah.app.setBody(App);\napp.mount('#app');"
      },
      {
        "framework": "vanilla",
        "wikiId": "vanilla-cps-challenge",
        "code": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>Vanilla JS CPS</title>\n  <style>\n    body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; min-height: 100vh; background: #f0f0f0; margin: 0; }\n    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px; width: 100%; text-align: center; margin: 2rem; }\n    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }\n    .stat-box { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; }\n    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: bold; cursor: pointer; color: white; width: 100%; margin-bottom: 0.5rem; }\n    .btn-start { background: #10b981; }\n    .btn-click { background: #3b82f6; }\n    .btn-reset { background: #ef4444; }\n    .btn:disabled { background: #9ca3af; cursor: not-allowed; }\n  </style>\n</head>\n<body>\n  <div class=\"card\">\n    <h1 style=\"color: #4f46e5;\">⚡ CPS Challenge</h1>\n    <div class=\"stats\">\n      <div class=\"stat-box\">\n        <p>Time</p>\n        <h2 id=\"time\" style=\"font-size: 2.5rem; margin: 0.5rem 0;\">10</h2>\n      </div>\n      <div class=\"stat-box\">\n        <p>Clicks</p>\n        <h2 id=\"clicks\" style=\"font-size: 2.5rem; margin: 0.5rem 0; color: #4f46e5;\">0</h2>\n      </div>\n    </div>\n    <div style=\"margin: 1rem 0;\">\n      <label>Duration: <input type=\"number\" id=\"duration\" value=\"10\" style=\"padding: 0.5rem; width: 60px;\"></label>\n    </div>\n    <button id=\"startBtn\" class=\"btn btn-start\">🚀 Start</button>\n    <button id=\"clickBtn\" class=\"btn btn-click\" disabled>👆 Click Me!</button>\n    <button id=\"resetBtn\" class=\"btn btn-reset\">🔄 Reset</button>\n    <div id=\"result\" style=\"display: none; margin-top: 1rem; padding: 1rem; background: #fffbeb; border-radius: 0.5rem;\">\n      <h3>Score</h3>\n      <h1 id=\"cps\" style=\"color: #d97706;\">0</h1>\n      <p>CPS</p>\n    </div>\n  </div>\n  <script>\n    let clicks = 0;\n    let timeLeft = 0;\n    let isRunning = false;\n    let interval;\n    let totalTime = 10;\n\n    const timeEl = document.getElementById('time');\n    const clicksEl = document.getElementById('clicks');\n    const startBtn = document.getElementById('startBtn');\n    const clickBtn = document.getElementById('clickBtn');\n    const resetBtn = document.getElementById('resetBtn');\n    const durationInput = document.getElementById('duration');\n    const resultEl = document.getElementById('result');\n    const cpsEl = document.getElementById('cps');\n\n    startBtn.onclick = () => {\n      totalTime = parseInt(durationInput.value) || 10;\n      timeLeft = totalTime;\n      clicks = 0;\n      isRunning = true;\n      \n      timeEl.textContent = timeLeft;\n      clicksEl.textContent = clicks;\n      resultEl.style.display = 'none';\n      \n      startBtn.disabled = true;\n      clickBtn.disabled = false;\n      durationInput.disabled = true;\n\n      interval = setInterval(() => {\n        timeLeft--;\n        timeEl.textContent = timeLeft;\n        if (timeLeft <= 0) {\n          endGame();\n        }\n      }, 1000);\n    };\n\n    clickBtn.onclick = () => {\n      if (isRunning) {\n        clicks++;\n        clicksEl.textContent = clicks;\n      }\n    };\n\n    resetBtn.onclick = () => {\n      clearInterval(interval);\n      isRunning = false;\n      timeLeft = 0;\n      clicks = 0;\n      timeEl.textContent = 0;\n      clicksEl.textContent = 0;\n      startBtn.disabled = false;\n      clickBtn.disabled = true;\n      durationInput.disabled = false;\n      resultEl.style.display = 'none';\n    };\n\n    function endGame() {\n      clearInterval(interval);\n      isRunning = false;\n      clickBtn.disabled = true;\n      startBtn.disabled = false;\n      durationInput.disabled = false;\n      \n      const cps = (clicks / totalTime).toFixed(2);\n      cpsEl.textContent = cps;\n      resultEl.style.display = 'block';\n    }\n  </script>\n</body>\n</html>"
      },
      {
        "framework": "jquery",
        "wikiId": "jquery-cps-challenge",
        "code": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>jQuery CPS</title>\n  <script src=\"https://code.jquery.com/jquery-3.6.0.min.js\"></script>\n  <style>\n    body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; min-height: 100vh; background: #f0f0f0; margin: 0; }\n    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px; width: 100%; text-align: center; margin: 2rem; }\n    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }\n    .stat-box { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; }\n    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: bold; cursor: pointer; color: white; width: 100%; margin-bottom: 0.5rem; }\n    .btn-start { background: #10b981; }\n    .btn-click { background: #3b82f6; }\n    .btn-reset { background: #ef4444; }\n    .btn:disabled { background: #9ca3af; cursor: not-allowed; }\n  </style>\n</head>\n<body>\n  <div class=\"card\">\n    <h1 style=\"color: #4f46e5;\">⚡ jQuery CPS</h1>\n    <div class=\"stats\">\n      <div class=\"stat-box\">\n        <p>Time</p>\n        <h2 id=\"time\">10</h2>\n      </div>\n      <div class=\"stat-box\">\n        <p>Clicks</p>\n        <h2 id=\"clicks\" style=\"color: #4f46e5;\">0</h2>\n      </div>\n    </div>\n    <div style=\"margin: 1rem 0;\">\n      <label>Duration: <input type=\"number\" id=\"duration\" value=\"10\" style=\"padding: 0.5rem; width: 60px;\"></label>\n    </div>\n    <button id=\"startBtn\" class=\"btn btn-start\">🚀 Start</button>\n    <button id=\"clickBtn\" class=\"btn btn-click\" disabled>👆 Click Me!</button>\n    <button id=\"resetBtn\" class=\"btn btn-reset\">🔄 Reset</button>\n    <div id=\"result\" style=\"display: none; margin-top: 1rem; padding: 1rem; background: #fffbeb; border-radius: 0.5rem;\">\n      <h3>Score</h3>\n      <h1 id=\"cps\" style=\"color: #d97706;\">0</h1>\n    </div>\n  </div>\n  <script>\n    $(document).ready(function() {\n      let clicks = 0;\n      let timeLeft = 0;\n      let isRunning = false;\n      let interval;\n      let totalTime = 10;\n\n      $('#startBtn').click(function() {\n        totalTime = parseInt($('#duration').val()) || 10;\n        timeLeft = totalTime;\n        clicks = 0;\n        isRunning = true;\n        \n        $('#time').text(timeLeft);\n        $('#clicks').text(clicks);\n        $('#result').hide();\n        \n        $(this).prop('disabled', true);\n        $('#clickBtn').prop('disabled', false);\n        $('#duration').prop('disabled', true);\n\n        interval = setInterval(() => {\n          timeLeft--;\n          $('#time').text(timeLeft);\n          if (timeLeft <= 0) {\n            clearInterval(interval);\n            isRunning = false;\n            $('#clickBtn').prop('disabled', true);\n            $('#startBtn').prop('disabled', false);\n            $('#duration').prop('disabled', false);\n            \n            const cps = (clicks / totalTime).toFixed(2);\n            $('#cps').text(cps);\n            $('#result').show();\n          }\n        }, 1000);\n      });\n\n      $('#clickBtn').click(function() {\n        if (isRunning) {\n          clicks++;\n          $('#clicks').text(clicks);\n        }\n      });\n\n      $('#resetBtn').click(function() {\n        clearInterval(interval);\n        isRunning = false;\n        clicks = 0;\n        $('#time').text(0);\n        $('#clicks').text(0);\n        $('#startBtn').prop('disabled', false);\n        $('#clickBtn').prop('disabled', true);\n        $('#duration').prop('disabled', false);\n        $('#result').hide();\n      });\n    });\n  </script>\n</body>\n</html>"
      },
      {
        "framework": "vue",
        "wikiId": "vue-cps-challenge",
        "code": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>Vue CPS</title>\n  <script src=\"https://unpkg.com/vue@3/dist/vue.global.js\"></script>\n  <style>\n    body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; min-height: 100vh; background: #f0f0f0; margin: 0; }\n    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px; width: 100%; text-align: center; margin: 2rem; }\n    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }\n    .stat-box { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; }\n    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: bold; cursor: pointer; color: white; width: 100%; margin-bottom: 0.5rem; }\n    .btn-start { background: #10b981; }\n    .btn-click { background: #3b82f6; }\n    .btn-reset { background: #ef4444; }\n    .btn:disabled { background: #9ca3af; cursor: not-allowed; }\n  </style>\n</head>\n<body>\n  <div id=\"app\">\n    <div class=\"card\">\n      <h1 style=\"color: #42b983;\">⚡ Vue CPS</h1>\n      <div class=\"stats\">\n        <div class=\"stat-box\">\n          <p>Time</p>\n          <h2 style=\"font-size: 2.5rem; margin: 0.5rem 0;\">{{ timeLeft }}</h2>\n        </div>\n        <div class=\"stat-box\">\n          <p>Clicks</p>\n          <h2 style=\"font-size: 2.5rem; margin: 0.5rem 0; color: #42b983;\">{{ clicks }}</h2>\n        </div>\n      </div>\n      <div style=\"margin: 1rem 0;\">\n        <label>Duration: <input type=\"number\" v-model=\"duration\" :disabled=\"isRunning\" style=\"padding: 0.5rem; width: 60px;\"></label>\n      </div>\n      <button @click=\"start\" :disabled=\"isRunning\" class=\"btn btn-start\">🚀 Start</button>\n      <button @click=\"click\" :disabled=\"!isRunning\" class=\"btn btn-click\">👆 Click Me!</button>\n      <button @click=\"reset\" class=\"btn btn-reset\">🔄 Reset</button>\n      <div v-if=\"cps !== null\" style=\"margin-top: 1rem; padding: 1rem; background: #fffbeb; border-radius: 0.5rem;\">\n        <h3>Score</h3>\n        <h1 style=\"color: #d97706;\">{{ cps }}</h1>\n      </div>\n    </div>\n  </div>\n  <script>\n    const { createApp, ref } = Vue;\n    createApp({\n      setup() {\n        const clicks = ref(0);\n        const timeLeft = ref(10);\n        const duration = ref(10);\n        const isRunning = ref(false);\n        const cps = ref(null);\n        let interval;\n\n        const start = () => {\n          clicks.value = 0;\n          timeLeft.value = duration.value;\n          isRunning.value = true;\n          cps.value = null;\n          \n          interval = setInterval(() => {\n            timeLeft.value--;\n            if (timeLeft.value <= 0) {\n              clearInterval(interval);\n              isRunning.value = false;\n              cps.value = (clicks.value / duration.value).toFixed(2);\n            }\n          }, 1000);\n        };\n\n        const click = () => {\n          if (isRunning.value) clicks.value++;\n        };\n\n        const reset = () => {\n          clearInterval(interval);\n          isRunning.value = false;\n          clicks.value = 0;\n          timeLeft.value = 0;\n          cps.value = null;\n        };\n\n        return { clicks, timeLeft, duration, isRunning, cps, start, click, reset };\n      }\n    }).mount('#app');\n  </script>\n</body>\n</html>"
      },
      {
        "framework": "react",
        "wikiId": "react-cps-challenge",
        "code": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>React CPS</title>\n  <script src=\"https://unpkg.com/react@18/umd/react.development.js\"></script>\n  <script src=\"https://unpkg.com/react-dom@18/umd/react-dom.development.js\"></script>\n  <script src=\"https://unpkg.com/@babel/standalone/babel.min.js\"></script>\n  <style>\n    body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; min-height: 100vh; background: #f0f0f0; margin: 0; }\n    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px; width: 100%; text-align: center; margin: 2rem; }\n    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }\n    .stat-box { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; }\n    .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: bold; cursor: pointer; color: white; width: 100%; margin-bottom: 0.5rem; }\n    .btn-start { background: #10b981; }\n    .btn-click { background: #3b82f6; }\n    .btn-reset { background: #ef4444; }\n    .btn:disabled { background: #9ca3af; cursor: not-allowed; }\n  </style>\n</head>\n<body>\n  <div id=\"root\"></div>\n  <script type=\"text/babel\">\n    function App() {\n      const [clicks, setClicks] = React.useState(0);\n      const [timeLeft, setTimeLeft] = React.useState(10);\n      const [duration, setDuration] = React.useState(10);\n      const [isRunning, setIsRunning] = React.useState(false);\n      const [cps, setCps] = React.useState(null);\n      const intervalRef = React.useRef(null);\n\n      const start = () => {\n        setClicks(0);\n        setTimeLeft(duration);\n        setIsRunning(true);\n        setCps(null);\n        \n        intervalRef.current = setInterval(() => {\n          setTimeLeft(prev => {\n            if (prev <= 1) {\n              clearInterval(intervalRef.current);\n              setIsRunning(false);\n              setCps((clicks / duration).toFixed(2)); // Note: clicks here is stale, logic simplified for demo\n              return 0;\n            }\n            return prev - 1;\n          });\n        }, 1000);\n      };\n      \n      // Fix for stale closure in interval\n      React.useEffect(() => {\n        if (!isRunning && clicks > 0 && timeLeft === 0) {\n           setCps((clicks / duration).toFixed(2));\n        }\n      }, [isRunning, timeLeft]);\n\n      const click = () => {\n        if (isRunning) setClicks(c => c + 1);\n      };\n\n      const reset = () => {\n        clearInterval(intervalRef.current);\n        setIsRunning(false);\n        setClicks(0);\n        setTimeLeft(0);\n        setCps(null);\n      };\n\n      return (\n        <div className=\"card\">\n          <h1 style={{color: '#61dafb'}}>⚡ React CPS</h1>\n          <div className=\"stats\">\n            <div className=\"stat-box\">\n              <p>Time</p>\n              <h2 style={{fontSize: '2.5rem', margin: '0.5rem 0'}}>{timeLeft}</h2>\n            </div>\n            <div className=\"stat-box\">\n              <p>Clicks</p>\n              <h2 style={{fontSize: '2.5rem', margin: '0.5rem 0', color: '#61dafb'}}>{clicks}</h2>\n            </div>\n          </div>\n          <div style={{margin: '1rem 0'}}>\n            <label>Duration: <input type=\"number\" value={duration} onChange={e => setDuration(Number(e.target.value))} disabled={isRunning} style={{padding: '0.5rem', width: '60px'}} /></label>\n          </div>\n          <button onClick={start} disabled={isRunning} className=\"btn btn-start\">🚀 Start</button>\n          <button onClick={click} disabled={!isRunning} className=\"btn btn-click\">👆 Click Me!</button>\n          <button onClick={reset} className=\"btn btn-reset\">🔄 Reset</button>\n          {cps !== null && (\n            <div style={{marginTop: '1rem', padding: '1rem', background: '#fffbeb', borderRadius: '0.5rem'}}>\n              <h3>Score</h3>\n              <h1 style={{color: '#d97706'}}>{cps}</h1>\n            </div>\n          )}\n        </div>\n      );\n    }\n    const root = ReactDOM.createRoot(document.getElementById('root'));\n    root.render(<App />);\n  </script>\n</body>\n</html>"
      },
      {
        "framework": "mishkah-htmlx",
        "wikiId": "mishkah-htmlx-cps-challenge",
        "code": `<!DOCTYPE html>
<html lang="ar" dir="rtl" data-htmlx="main" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>Mishkah HTMLx CPS Challenge</title>
  <!-- Load Mishkah -->
  <script src="../lib/mishkah.js" data-htmlx data-ui></script>
  <!-- Load Tailwind -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: ['class', '[data-theme="dark"]'],
      theme: {
        extend: {
          colors: {
            primary: '#4f46e5',
            secondary: '#10b981',
            accent: '#f59e0b',
            background: 'var(--background)',
            card: 'var(--card)',
            text: 'var(--foreground)'
          }
        }
      }
    }
  </script>
  <style>
    :root {
      --background: #f3f4f6;
      --card: #ffffff;
      --foreground: #1f2937;
    }
    [data-theme="dark"] {
      --background: #111827;
      --card: #1f2937;
      --foreground: #f9fafb;
    }
    body {
      background-color: var(--background);
      color: var(--foreground);
      transition: background-color 0.3s, color 0.3s;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <template id="main">
    <!-- 1. State Definition -->
    <script type="application/json" data-m-path="env">
      {"theme":"dark", "lang":"ar", "dir":"rtl"}
    </script>

    <script type="application/json" data-m-path="data">
      {"clicks": 0, "time": 10, "duration": 10, "running": false, "cps": null}
    </script>

    <script type="application/json" data-m-path="i18n.dict">
      {
        "title": {"ar": "⚡ تحدي النقرات", "en": "⚡ CPS Challenge"},
        "time": {"ar": "الزمن", "en": "Time"},
        "clicks": {"ar": "النقرات", "en": "Clicks"},
        "start": {"ar": "🚀 ابدأ", "en": "🚀 Start"},
        "click_me": {"ar": "👆 اضغط!", "en": "👆 Click!"},
        "reset": {"ar": "🔄 إعادة", "en": "🔄 Reset"},
        "score": {"ar": "النتيجة", "en": "Score"},
        "cps_unit": {"ar": "نقرة/ثانية", "en": "CPS"}
      }
    </script>

    <!-- 2. UI Structure -->
    <div class="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300">
      
      <!-- Toolbar -->
      <div class="absolute top-4 right-4 flex gap-2">
        <button onclick="toggleTheme(event, ctx)" class="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition shadow-sm">
          {state.env.theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button onclick="toggleLang(event, ctx)" class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold transition shadow-sm">
          {state.env.lang === 'ar' ? 'EN' : 'عربي'}
        </button>
      </div>

      <!-- Game Card -->
      <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md text-center border border-gray-200 dark:border-gray-700">
        
        <h1 class="text-4xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
          {t('title')}
        </h1>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-4 mb-8">
          <div class="bg-gray-100 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400 uppercase font-bold">{t('time')}</p>
            <h2 class="text-4xl font-mono font-bold text-gray-800 dark:text-white mt-1">
              {state.data.time}
            </h2>
          </div>
          <div class="bg-gray-100 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400 uppercase font-bold">{t('clicks')}</p>
            <h2 class="text-4xl font-mono font-bold text-primary mt-1">
              {state.data.clicks}
            </h2>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex flex-col gap-3">
          <!-- Start Button -->
          <button 
            onclick="startGame(event, ctx)" 
            class="w-full py-3 rounded-xl font-bold text-white text-lg shadow-lg transform transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            :disabled="state.data.running">
            {t('start')}
          </button>

          <!-- Click Button -->
          <button 
            onclick="registerClick(event, ctx)" 
            class="w-full py-4 rounded-xl font-bold text-white text-2xl shadow-lg transform transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            :disabled="!state.data.running">
            {t('click_me')}
          </button>

          <!-- Reset Button -->
          <button 
            onclick="resetGame(event, ctx)" 
            class="w-full py-2 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            {t('reset')}
          </button>
        </div>

        <!-- Result -->
        <div data-m-if="state.data.cps" class="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl animate-bounce">
          <h3 class="text-yellow-800 dark:text-yellow-200 font-bold">{t('score')}</h3>
          <p class="text-3xl font-black text-yellow-600 dark:text-yellow-400">
            {state.data.cps} <span class="text-sm font-normal">{t('cps_unit')}</span>
          </p>
        </div>

      </div>
    </div>

    <!-- 3. Logic -->
    <script>
      // --- Game Logic ---
      function startGame(e, ctx) {
        // Reset State
        ctx.setState(s => ({
          ...s, 
          data: { ...s.data, running: true, clicks: 0, time: s.data.duration, cps: null }
        }));

        // Start Timer
        const timerId = setInterval(() => {
          ctx.setState(s => {
            const newTime = s.data.time - 1;
            
            if (newTime <= 0) {
              clearInterval(timerId);
              const score = (s.data.clicks / s.data.duration).toFixed(2);
              return {
                ...s,
                data: { ...s.data, running: false, time: 0, cps: score }
              };
            }
            
            return { ...s, data: { ...s.data, time: newTime } };
          });
        }, 1000);
        
        // Store timer ID globally to clear it on reset
        window._cpsTimer = timerId;
      }

      function registerClick(e, ctx) {
        ctx.setState(s => {
          if (s.data.running) {
            s.data.clicks++;
          }
          return s;
        });
      }

      function resetGame(e, ctx) {
        if (window._cpsTimer) clearInterval(window._cpsTimer);
        ctx.setState(s => ({
          ...s,
          data: { ...s.data, running: false, clicks: 0, time: s.data.duration, cps: null }
        }));
      }

      // --- System Logic ---
      function toggleTheme(e, ctx) {
        ctx.setState(s => {
          const newTheme = s.env.theme === 'dark' ? 'light' : 'dark';
          s.env.theme = newTheme;
          document.documentElement.setAttribute('data-theme', newTheme);
          return s;
        });
      }

      function toggleLang(e, ctx) {
        ctx.setState(s => {
          const newLang = s.env.lang === 'ar' ? 'en' : 'ar';
          s.env.lang = newLang;
          s.env.dir = newLang === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = newLang;
          document.documentElement.dir = s.env.dir;
          return s;
        });
      }
    </script>
  </template>
</body>
</html>`
      }
    ]
  })

  // Framework mapping
  window.FRAMEWORKS = {
    vanilla: { name: { en: 'Vanilla JS', ar: 'JavaScript النقي' }, lang: 'html' },
    jquery: { name: { en: 'jQuery', ar: 'jQuery' }, lang: 'html' },
    vue: { name: { en: 'Vue.js', ar: 'Vue.js' }, lang: 'html' },
    react: { name: { en: 'React', ar: 'React' }, lang: 'jsx' },
    angular: { name: { en: 'Angular', ar: 'Angular' }, lang: 'html' },
    svelte: { name: { en: 'Svelte', ar: 'Svelte' }, lang: 'html' },
    solid: { name: { en: 'SolidJS', ar: 'SolidJS' }, lang: 'jsx' },
    alpine: { name: { en: 'Alpine.js', ar: 'Alpine.js' }, lang: 'html' },
    preact: { name: { en: 'Preact', ar: 'Preact' }, lang: 'jsx' },
    lit: { name: { en: 'Lit', ar: 'Lit' }, lang: 'javascript' },
    qwik: { name: { en: 'Qwik', ar: 'Qwik' }, lang: 'jsx' },
    ember: { name: { en: 'Ember.js', ar: 'Ember.js' }, lang: 'html' },
    backbone: { name: { en: 'Backbone.js', ar: 'Backbone.js' }, lang: 'javascript' },
    mithril: { name: { en: 'Mithril', ar: 'Mithril' }, lang: 'javascript' },
    stimulus: { name: { en: 'Stimulus', ar: 'Stimulus' }, lang: 'javascript' },
    aurelia: { name: { en: 'Aurelia', ar: 'Aurelia' }, lang: 'javascript' },
    dojo: { name: { en: 'Dojo', ar: 'Dojo' }, lang: 'javascript' },
    astro: { name: { en: 'Astro Islands', ar: 'Astro' }, lang: 'html' },
    inertia: { name: { en: 'Inertia.js', ar: 'Inertia.js' }, lang: 'javascript' },
    'mishkah-dsl': { name: { en: 'Mishkah DSL', ar: 'Mishkah DSL' }, lang: 'javascript' },
    'mishkah-htmlx': { name: { en: 'Mishkah HTMLx', ar: 'Mishkah HTMLx' }, lang: 'html' }
  };

  console.log('✅ Examples loaded:', window.EXAMPLES.length, 'examples');
})();
