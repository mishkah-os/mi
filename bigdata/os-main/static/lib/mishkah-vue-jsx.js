!function (global) {
    'use strict';

    var TOKEN_TYPES = {
        JSX_OPEN: 'JSX_OPEN',
        JSX_CLOSE: 'JSX_CLOSE',
        JSX_SELF_CLOSE: 'JSX_SELF_CLOSE',
        JSX_TAG_END: 'JSX_TAG_END',
        JSX_ATTR: 'JSX_ATTR',
        JSX_SPREAD: 'JSX_SPREAD',
        JSX_TEXT: 'JSX_TEXT',
        JSX_EXPR: 'JSX_EXPR',
        JS_CODE: 'JS_CODE'
    };

    function tokenize(code) {
        var tokens = [];
        var i = 0;
        var len = code.length;
        var inJSX = false;
        var depth = 0;
        while (i < len) {
            var char = code[i];
            if (char === '<' && !inString(code, i)) {
                var peek = code[i + 1];
                if (peek === '/') {
                    var closeMatch = code.substring(i).match(/^<\/([a-zA-Z][\w.-]*)\s*>/);
                    if (closeMatch) {
                        tokens.push({ type: TOKEN_TYPES.JSX_CLOSE, value: closeMatch[1], pos: i });
                        i += closeMatch[0].length;
                        depth--;
                        if (depth === 0) inJSX = false;
                        continue
                    }
                }
                var openMatch = code.substring(i).match(/^<([a-zA-Z][\w.-]*)/);
                if (openMatch) {
                    tokens.push({ type: TOKEN_TYPES.JSX_OPEN, value: openMatch[1], pos: i });
                    i += openMatch[0].length;
                    inJSX = true;
                    depth++;
                    i = parseAttributes(code, i, tokens);
                    continue
                }
            }
            if (inJSX && depth > 0) {
                if (char === '{') {
                    var end = findBalance(code, i);
                    tokens.push({ type: TOKEN_TYPES.JSX_EXPR, value: code.substring(i + 1, end), pos: i });
                    i = end + 1;
                    continue
                }
                var textStart = i;
                while (i < len && code[i] !== '<' && code[i] !== '{') { i++ }
                if (i > textStart) {
                    var text = code.substring(textStart, i);
                    if (text.trim()) {
                        tokens.push({ type: TOKEN_TYPES.JSX_TEXT, value: text, pos: textStart })
                    }
                    continue
                }
            }
            var jsStart = i;
            while (i < len && code[i] !== '<') {
                if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
                    i = skipString(code, i)
                } else {
                    i++
                }
            }
            if (i > jsStart) {
                tokens.push({ type: TOKEN_TYPES.JS_CODE, value: code.substring(jsStart, i), pos: jsStart })
            }
        }
        return tokens
    }

    function parseAttributes(code, start, tokens) {
        var i = start;
        while (i < code.length) {
            if (/\s/.test(code[i])) { i++; continue }
            if (code[i] === '/' && code[i + 1] === '>') {
                tokens.push({ type: TOKEN_TYPES.JSX_SELF_CLOSE, value: '/>', pos: i });
                return i + 2
            }
            if (code[i] === '>') {
                tokens.push({ type: TOKEN_TYPES.JSX_TAG_END, value: '>', pos: i });
                return i + 1
            }
            var attrMatch = code.substring(i).match(/^([a-zA-Z][\w-]*)\s*=\s*/);
            if (attrMatch) {
                var name = attrMatch[1];
                i += attrMatch[0].length;
                var val;
                if (code[i] === '{') {
                    var end = findBalance(code, i);
                    val = { type: 'expr', value: code.substring(i + 1, end) };
                    i = end + 1
                } else if (code[i] === '"' || code[i] === "'") {
                    var sEnd = skipString(code, i);
                    val = { type: 'string', value: code.substring(i + 1, sEnd) };
                    i = sEnd + 1
                }
                tokens.push({ type: TOKEN_TYPES.JSX_ATTR, name: name, value: val, pos: i });
                continue
            }
            i++
        }
        return i
    }

    function findBalance(code, start) {
        var depth = 1;
        var i = start + 1;
        while (i < code.length && depth > 0) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') depth--;
            i++
        }
        return i - 1
    }

    function skipString(code, start) {
        var q = code[start];
        var i = start + 1;
        while (i < code.length) {
            if (code[i] === q && code[i - 1] !== '\\') return i;
            i++
        }
        return i
    }

    function inString(code, pos) { return false }

    function transform(code) {
        var i = 0;
        var out = '';
        while (i < code.length) {
            if (code[i] === '<' && !inString(code, i)) {
                if (/[a-z]/i.test(code[i + 1])) {
                    var res = parseJSX(code, i);
                    out += res.code;
                    i = res.next;
                    continue
                }
            }
            out += code[i];
            i++
        }
        return out
    }

    function parseJSX(code, start) {
        var i = start + 1;
        var tagMatch = code.substring(i).match(/^([a-zA-Z][\w.-]*)/);
        var tagName = tagMatch[1];
        i += tagMatch[0].length;
        var props = [];
        var directives = {};

        while (i < code.length) {
            if (code[i] === '>') { i++; break }
            if (code[i] === '/' && code[i + 1] === '>') {
                i += 2;
                return generateNode(tagName, props, directives, [], i);
            }
            // Allow @, :, . in attribute names
            var attr = code.substring(i).match(/^([@a-zA-Z:.][\w-.:]*)/);
            if (attr) {
                var name = attr[1];
                i += name.length;
                var val = 'true';
                if (code[i] === '=') {
                    i++;
                    if (code[i] === '{') {
                        var end = findBalance(code, i);
                        val = transform(code.substring(i + 1, end));
                        i = end + 1
                    } else if (code[i] === '"' || code[i] === "'") {
                        var sEnd = skipString(code, i);
                        val = JSON.stringify(code.substring(i + 1, sEnd));
                        i = sEnd + 1
                    }
                }

                // DIRECTIVE HANDLING
                if (name === 'v-if') {
                    directives.if = val;
                } else if (name === 'v-for') {
                    directives.for = val;
                } else if (name.indexOf('v-model') === 0) {
                    directives.model = { ref: val, modifiers: name.split('.').slice(1) };
                } else if (name.startsWith('@') || name.startsWith('v-on:') || (name.startsWith('on') && name.indexOf('.') > 0)) {
                    var rawEvent = "";
                    if (name.startsWith('@')) rawEvent = name.slice(1);
                    else if (name.startsWith('v-on:')) rawEvent = name.slice(5);
                    else rawEvent = name.slice(2);

                    var parts = rawEvent.split('.');
                    var eventName = parts[0];
                    // eventName from 'Click' -> 'Click'.

                    var modifiers = parts.slice(1);

                    var propName = 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
                    var handler = val;

                    if (modifiers.length > 0) {
                        var checks = "";
                        if (modifiers.includes('prevent')) checks += "$event.preventDefault();";
                        if (modifiers.includes('stop')) checks += "$event.stopPropagation();";
                        // Wrap
                        handler = "($event) => {" + checks + " return (" + val + ")($event)}";
                    }
                    props.push(propName + ':' + handler);
                } else {
                    props.push("'" + name + "':" + val);
                }
                continue
            }
            i++
        }
        var children = [];
        while (i < code.length) {
            if (code.substring(i).match(new RegExp('^<\\/' + tagName + '\\s*>'))) {
                i = code.indexOf('>', i) + 1;
                break
            }
            if (code[i] === '<' && /[a-z]/i.test(code[i + 1])) {
                var child = parseJSX(code, i);
                children.push(child.code);
                i = child.next;
                continue
            }
            if (code[i] === '{') {
                var end = findBalance(code, i);
                children.push(transform(code.substring(i + 1, end)));
                i = end + 1;
                continue
            }
            var textEnd = i;
            while (textEnd < code.length && code[textEnd] !== '<' && code[textEnd] !== '{') textEnd++;
            var text = code.substring(i, textEnd);
            if (text.trim()) {
                children.push(JSON.stringify(text))
            }
            i = textEnd
        }
        return generateNode(tagName, props, directives, children, i);
    }

    function generateNode(tagName, props, directives, children, nextPos) {
        if (directives.model) {
            var ref = directives.model.ref;
            var mods = directives.model.modifiers || [];

            props.push("value:" + ref);

            var assign = ref + " = $event.target.value";
            if (mods.includes('number')) {
                assign = ref + " = parseFloat($event.target.value)";
            }
            // For simple case, assume ref is assignable. 
            // In setup(), const x = ref() -> v-model={x} implies x.value.
            // But strict Vue JSX expects v-model={x} to be passed x directly?
            // Wait, if x is a Ref object, 'x = val' replaces the ref!
            // Correct usage: v-model={x.value}.
            // But standard Vue v-model on Ref unwraps automatically in template.
            // In JSX, user likely writes v-model={this.foo}.
            // We'll trust the user provides an assignable expression for now.
            // Improvement: Check if ref is likely a Ref object? Hard at compile time.
            props.push("onInput:($event) => { " + assign + " }");
        }

        var tagArg = (tagName[0] === tagName[0].toUpperCase() && tagName[0] !== tagName[0].toLowerCase())
            ? tagName
            : "'" + tagName + "'";

        var code = "Mishkah.Vue.h(" + tagArg + ", " + formatProps(props) + ", [" + children.join(',') + "])";

        if (directives.if) {
            // v-if ternary wrapper
            code = "(" + directives.if + ") ? " + code + " : null";
        }

        if (directives.for) {
            // v-for handling
            var raw = directives.for.trim();
            if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
                raw = raw.slice(1, -1);
            }

            // Syntax: "item in items" or "(item, index) in items"
            var parts = raw.split(/\s+(?:in|of)\s+/);
            if (parts.length === 2) {
                var lhs = parts[0].trim();
                var rhs = parts[1].trim();
                // cleanup parens
                if (lhs.startsWith('(') && lhs.endsWith(')')) {
                    lhs = lhs.slice(1, -1);
                }
                code = "Mishkah.Vue.renderList(" + rhs + ", (" + lhs + ") => " + code + ")";
            }
        }

        return { code: code, next: nextPos };
    }

    function formatProps(props) {
        if (!props.length) return '{}';
        return '{' + props.join(',') + '}'
    }

    function processScripts() {
        var scripts = document.querySelectorAll('script[type="text/mishkah-vue"]');
        scripts.forEach(function (s) {
            if (s.processed) return;
            s.processed = true;
            var js = transform(s.innerHTML);
            var ns = document.createElement('script');
            ns.textContent = js;
            document.body.appendChild(ns)
        })
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processScripts)
    } else {
        processScripts()
    }

    global.MishkahVueJSX = { transform: transform }
}(this);
