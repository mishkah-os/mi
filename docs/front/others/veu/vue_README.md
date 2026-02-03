# Mishkah Vue Compatibility Layer 🖖

> **"Opinionated Vue, Powered by Mishkah."**

Mishkah provides a powerful compatibility layer that allows you to write **Vue 2 (Options API)** or **Vue 3 (Composition API)** code while running on the robust Mishkah VDOM architecture.

---

## 📦 Core Libraries

To use Vue style, you need to include the following core libraries in your specific order:

```html
<!-- 1. The Core VDOM -->
<script src="/static/lib/mishkah.core.js"></script>

<!-- 2. Vue Compatibility Layer (Reactivity, Watchers, Lifecycle) -->
<script src="/static/lib/mishkah-vue.js"></script>

<!-- 3. Vue-JSX Runtime (Optional: for browser-side templates) -->
<script src="/static/lib/mishkah-vue-jsx.js"></script>
```

---

## 🛠️ API Reference

Mishkah exports the Vue namespace at `Mishkah.Vue`. You can alias it globally:

```javascript
const { createApp, ref, reactive, computed, onMounted } = Mishkah.Vue;
```

### Supported APIs

#### 1. Reactivity (Vue 3 Style)
- `ref(value)`
- `reactive(object)`
- `computed(getter)`
- `watch(source, callback, options)`
- `effect(fn)`

#### 2. Options API (Vue 2 Style)
- **data**: Function returning state.
- **methods**: Functions bound to `this`.
- **computed**: Dependent properties.
- **watch**: Observers.
- **lifecycle**: `mounted`, `created`, `unmounted`, `beforeMount`.
- **provide / inject**: Dependency injection.

#### 3. Composition API (Vue 3 Style)
- **setup(props, context)**: Entry point.
- **Lifecycle Hooks**: `onMounted`, `onUnmounted`, `onUpdated`.

---

## 💻 Writing Code (Dual Style)

You can choose your preferred style. Mishkah supports both in the same app!

### Option 1: The Classic Options API (Vue 2)
Best for rapid migration and simple components.

```javascript
const Counter = {
  template: `
    <div class="card p-4">
      <h3>{{ title }}</h3>
      <p>Count: {{ count }}</p>
      <button @click="increment" class="btn">Increment</button>
    </div>
  `,
  props: {
    title: String
  },
  data() {
    return {
      count: 0
    }
  },
  methods: {
    increment() {
      this.count++;
    }
  },
  mounted() {
    console.log('Component Mounted!');
  }
};

Mishkah.Vue.createApp(Counter).mount('#app');
```

> **Note:** For the template string to work as shown above, you would need a template compiler. Since `mishkah-vue-jsx.js` handles JSX, we recommend writing **Render Functions** or using **Browser-Side JSX** (see below) instead of string templates for maximum performance.

### Option 2: The Modern Composition API (Vue 3)
Best for logic reuse and large features.

```javascript
/* Script Type: text/mishkah-vue */
const { ref, onMounted } = Mishkah.Vue;

const UserProfile = {
  setup() {
    const name = ref('Ali');
    const loading = ref(false);

    function save() {
      loading.value = true;
      setTimeout(() => {
        loading.value = false;
        alert('Saved ' + name.value);
      }, 1000);
    }

    // Direct Return for Template
    return { name, loading, save };
  },
  render(ctx) {
    // You can write Direct DSL here too!
    return D.Div({ class: 'profile' }, [
      D.Input({ 
        value: ctx.name, 
        onInput: (e) => ctx.name = e.target.value 
      }),
      D.Button({ 
        onClick: ctx.save,
        disabled: ctx.loading
      }, ['Save'])
    ]);
  }
};
```

---

## 🌐 Browser-Side JSX & Directives

For the ultimate "Script Tag" experience, use `mishkah-vue-jsx.js`. It supports Vue directives!

```html
<script type="text/mishkah-vue">
  const App = {
    setup() {
      const show = Mishkah.Vue.ref(true);
      const items = Mishkah.Vue.reactive(['Apple', 'Banana']);
      return { show, items };
    },
    render() {
      return (
        <div class="container">
          <button @click={() => this.show = !this.show}>
            Toggle List
          </button>
          
          <ul v-if={this.show}>
            <li v-for="item in this.items">
              {item}
            </li>
          </ul>
        </div>
      )
    }
  }
  
  Mishkah.Vue.createApp(App).mount('#app');
</script>
```

### Supported Directives (JSX)
- **`v-if={condition}`**: Conditional rendering.
- **`v-for="item in items"`**: List rendering.
- **`v-model={ref}`**: Two-way binding.
- **`@click={handler}`** or `v-on:click={handler}`: Event listeners.

---

## 🌍 Mishkah Integration (Superpowers)

Your Vue components get free superpowers from Mishkah Core:

1. **`$t(key)`**: Internationalization is built-in.
   ```javascript
   // In template/render
   D.Span({}, [ this.$t('hello_world') ])
   ```

2. **`$db`**: Access the global Mishkah centralized state.
   ```javascript
   this.$db.get('user.name');
   ```

3. **Global Theme**:
   ```javascript
   const theme = Mishkah.Vue.useTheme();
   theme.toggleTheme(); // Switches Dark/Light automatically everywhere
   ```

---

## ⚡ Performance & Philosophy

Unlike standard Vue, **Mishkah Vue** does not use a virtual DOM differ for every component update in the traditional sense. It leverages Mishkah's **Surgical Patching**:
- Reactivity (`ref`/`reactive`) triggers precise updates.
- The VDOM produced is compatible with the entire Mishkah ecosystem (mix Vue components with React components or DSL atoms!).
