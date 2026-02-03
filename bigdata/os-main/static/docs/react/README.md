# Mishkah React Compatibility Layer ⚛️

> **"Write React, Run Mishkah."**

Mishkah provides a full compatibility layer that allows you to write standard React code (components, hooks, JSX) while running on the robust Mishkah VDOM architecture.

---

## 📦 Core Libraries

To use React style, you need to include the following core libraries in your specific order:

```html
<!-- 1. The Core VDOM -->
<script src="/static/lib/mishkah.core.js"></script>

<!-- 2. React Compatibility Layer (Hooks, Context, etc.) -->
<script src="/static/lib/mishkah-react.js"></script>

<!-- 3. JSX Runtime Compiler (Optional: for browser-side JSX) -->
<script src="/static/lib/mishkah-jsx.js"></script>
```

---

## 🛠️ API Reference

Mishkah exports the standard React namespace at `Mishkah.React`. You can alias it globally for convenience:

```javascript
const React = Mishkah.React;
const { useState, useEffect } = React;
```

### Supported APIs
Mishkah supports 99% of the daily-use React API:

#### 1. Hooks
- `useState(initial)`
- `useEffect(cb, deps)`
- `useLayoutEffect(cb, deps)`
- `useCallback(fn, deps)`
- `useMemo(fn, deps)`
- `useRef(initial)`
- `useReducer(reducer, initial)`
- `useContext(Context)`
- `useImperativeHandle(ref, cb)`
- `useDebugValue(value)`

#### 2. Components
- **Functional Components**: Supported fully.
- **Fragments**: `<></>` or `React.Fragment`.
- **Portals**: `createPortal(child, container)`.
- **Memo**: `React.memo(Component)`.
- **ForwardRef**: `React.forwardRef(render)`.
- **Context**: `createContext(default)`.

---

## 💻 Writing Code (JSX Style)

You can write pure React code. Mishkah's `createElement` intelligently maps React props to Mishkah's strict structure internally.

### Example: Counter Component

```javascript
function Counter({ name }) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    console.log(`Updated ${name}: ${count}`);
  }, [count]);

  return (
    <div className="card p-4">
      <h3>{name} Counter</h3>
      <p className="text-xl my-2">Value: {count}</p>
      
      <div className="flex gap-2">
        <button 
          className="btn btn-primary"
          onClick={() => setCount(c => c + 1)}
        >
          Increment (+)
        </button>
        
        <button 
          className="btn btn-soft"
          onClick={() => setCount(0)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// Rendering
const root = document.getElementById('app');
M.VDOM.render(
  <Counter name="Demo" />, 
  root
);
```

### 🧠 How it Works Internally

When you call `createElement` (or compile JSX):

1. **Props Mapping**:
   - `className` ➡️ `attrs.class`
   - `htmlFor` ➡️ `attrs.for`
   - `style` (object) ➡️ `attrs.style`
   - All other data props ➡️ `attrs.*`

2. **Event Handling**:
   - `onClick`, `onChange`... ➡️ **Auto-generated gkey** (`react:event:123`)
   - The handler is attached internally after the DOM node is created.
   - You don't need to manage `gkey` manually in this mode.

---

## 🌐 Browser-Side JSX (Prototyping)

For rapid prototyping without a build step (Webpack/Vite), you can use `mishkah-jsx.js`.

1. Add `type="text/jsx"` to your script tag.
2. The `Mishkah` runtime will automatically compile and execute it.

```html
<script type="text/jsx">
  function App() {
    return <h1>Hello from Runtime JSX!</h1>;
  }
  
  M.React.render(<App />, document.body);
</script>
```

> **Warning**: Browser-side transformation is slower than pre-compiled code. Use a build step for production.

---

## ⚡ Performance & Philosophy

Even though you are writing React syntax, you are benefiting from Mishkah's engine:
- **No Virtual DOM Overhead**: Mishkah's implementation of Hooks is lean.
- **Direct Patching**: Updates are batched and scheduled efficiently.
- **Interoperability**: You can mix React components inside standard Mishkah explicit DSL components seamlessly (they are all just VNodes!).
