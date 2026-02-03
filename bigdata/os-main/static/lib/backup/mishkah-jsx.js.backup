
(function (global) {
    'use strict';

    var M = global.Mishkah || {};
    var React = M.React || {};

    // ===================================================================
    // JSX Tokenizer
    // ===================================================================

    var TOKEN_TYPES = {
        JSX_OPEN: 'JSX_OPEN',           // <div
        JSX_CLOSE: 'JSX_CLOSE',         // </div>
        JSX_SELF_CLOSE: 'JSX_SELF_CLOSE', // />
        JSX_TAG_END: 'JSX_TAG_END',     // >
        JSX_ATTR: 'JSX_ATTR',           // name="value" or name={expr}
        JSX_SPREAD: 'JSX_SPREAD',       // {...props}
        JSX_TEXT: 'JSX_TEXT',           // text content
        JSX_EXPR: 'JSX_EXPR',           // {expression}
        JSX_COMMENT: 'JSX_COMMENT',     // {/* comment */}
        JSX_FRAGMENT: 'JSX_FRAGMENT',   // <> or </>
        JS_CODE: 'JS_CODE'              // JavaScript code
    };

    /**
     * Tokenize JSX into a stream of tokens
     */
    function tokenizeJSX(code) {
        var tokens = [];
        var i = 0;
        var len = code.length;
        var inJSX = false;
        var jsxDepth = 0;

        while (i < len) {
            var char = code[i];

            // Check for JSX start
            if (char === '<' && !inString(code, i)) {
                var peek = code[i + 1];

                // Fragment: <>
                if (peek === '>') {
                    tokens.push({ type: TOKEN_TYPES.JSX_FRAGMENT, value: '<>', pos: i });
                    i += 2;
                    inJSX = true;
                    jsxDepth++;
                    continue;
                }

                // Closing tag: </
                if (peek === '/') {
                    // Check if fragment: </>
                    if (code[i + 2] === '>') {
                        tokens.push({ type: TOKEN_TYPES.JSX_FRAGMENT, value: '</>', pos: i });
                        i += 3;
                        jsxDepth--;
                        if (jsxDepth === 0) inJSX = false;
                        continue;
                    }

                    // Regular closing tag: </TagName>
                    var closeMatch = code.substring(i).match(/^<\/([a-zA-Z][\w.-]*)\s*>/);
                    if (closeMatch) {
                        tokens.push({
                            type: TOKEN_TYPES.JSX_CLOSE,
                            value: closeMatch[1],
                            pos: i
                        });
                        i += closeMatch[0].length;
                        jsxDepth--;
                        if (jsxDepth === 0) inJSX = false;
                        continue;
                    }
                }

                // Opening tag: <TagName
                var openMatch = code.substring(i).match(/^<([a-zA-Z][\w.-]*)/);
                if (openMatch) {
                    tokens.push({
                        type: TOKEN_TYPES.JSX_OPEN,
                        value: openMatch[1],
                        pos: i
                    });
                    i += openMatch[0].length;
                    inJSX = true;
                    jsxDepth++;

                    // Parse attributes
                    i = parseAttributes(code, i, tokens);
                    continue;
                }
            }

            // If inside JSX, parse JSX content
            if (inJSX && jsxDepth > 0) {
                // Check for expression: {expr}
                if (char === '{') {
                    var exprEnd = findMatchingBrace(code, i);
                    var expr = code.substring(i + 1, exprEnd);

                    // Check if comment: {/* */}
                    if (expr.trim().startsWith('/*')) {
                        tokens.push({
                            type: TOKEN_TYPES.JSX_COMMENT,
                            value: expr,
                            pos: i
                        });
                    } else {
                        tokens.push({
                            type: TOKEN_TYPES.JSX_EXPR,
                            value: expr,
                            pos: i
                        });
                    }
                    i = exprEnd + 1;
                    continue;
                }

                // Text content
                var textStart = i;
                while (i < len && code[i] !== '<' && code[i] !== '{') {
                    i++;
                }
                if (i > textStart) {
                    var text = code.substring(textStart, i);
                    if (text.trim()) {
                        tokens.push({
                            type: TOKEN_TYPES.JSX_TEXT,
                            value: text,
                            pos: textStart
                        });
                    }
                    continue;
                }
            }

            // Regular JavaScript code
            var jsStart = i;
            while (i < len && code[i] !== '<') {
                // Skip strings
                if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
                    i = skipString(code, i);
                }
                i++;
            }
            if (i > jsStart) {
                var jsCode = code.substring(jsStart, i);
                if (jsCode.trim()) {
                    tokens.push({
                        type: TOKEN_TYPES.JS_CODE,
                        value: jsCode,
                        pos: jsStart
                    });
                }
            }
        }

        return tokens;
    }

    /**
     * Parse attributes within a JSX tag
     */
    function parseAttributes(code, startPos, tokens) {
        var i = startPos;
        var len = code.length;

        while (i < len) {
            var char = code[i];

            // Skip whitespace
            if (/\s/.test(char)) {
                i++;
                continue;
            }

            // Self-closing: />
            if (char === '/' && code[i + 1] === '>') {
                tokens.push({ type: TOKEN_TYPES.JSX_SELF_CLOSE, value: '/>', pos: i });
                return i + 2;
            }

            // Tag end: >
            if (char === '>') {
                tokens.push({ type: TOKEN_TYPES.JSX_TAG_END, value: '>', pos: i });
                return i + 1;
            }

            // Spread: {...props}
            if (char === '{' && code.substring(i, i + 4).match(/^\{\s*\.\.\./)) {
                var spreadEnd = findMatchingBrace(code, i);
                var spreadExpr = code.substring(i + 1, spreadEnd);
                tokens.push({
                    type: TOKEN_TYPES.JSX_SPREAD,
                    value: spreadExpr.replace(/^\s*\.\.\./, '').trim(),
                    pos: i
                });
                i = spreadEnd + 1;
                continue;
            }

            // Attribute: name="value" or name={expr}
            var attrMatch = code.substring(i).match(/^([a-zA-Z][\w-]*)\s*=\s*/);
            if (attrMatch) {
                var attrName = attrMatch[1];
                i += attrMatch[0].length;

                var attrValue;
                var char = code[i];

                // Value is expression: {expr}
                if (char === '{') {
                    var valueEnd = findMatchingBrace(code, i);
                    attrValue = { type: 'expr', value: code.substring(i + 1, valueEnd) };
                    i = valueEnd + 1;
                }
                // Value is string: "value" or 'value'
                else if (char === '"' || char === "'") {
                    var stringEnd = skipString(code, i);
                    attrValue = { type: 'string', value: code.substring(i + 1, stringEnd) };
                    i = stringEnd + 1;
                }
                // Boolean attribute
                else {
                    attrValue = { type: 'boolean', value: 'true' };
                }

                tokens.push({
                    type: TOKEN_TYPES.JSX_ATTR,
                    name: attrName,
                    value: attrValue,
                    pos: i
                });
                continue;
            }

            // Boolean attribute (no value)
            var boolMatch = code.substring(i).match(/^([a-zA-Z][\w-]*)/);
            if (boolMatch) {
                tokens.push({
                    type: TOKEN_TYPES.JSX_ATTR,
                    name: boolMatch[1],
                    value: { type: 'boolean', value: 'true' },
                    pos: i
                });
                i += boolMatch[0].length;
                continue;
            }

            i++;
        }

        return i;
    }

    /**
     * Find matching closing brace
     */
    function findMatchingBrace(code, start) {
        var depth = 1;
        var i = start + 1;
        var len = code.length;

        while (i < len && depth > 0) {
            var char = code[i];

            // Skip strings (including template literals)
            if (char === '"' || char === "'" || char === '`') {
                var stringEnd = skipString(code, i);
                i = stringEnd + 1;
                continue;
            }

            // Skip comments
            if (char === '/' && code[i + 1] === '/') {
                // Line comment
                while (i < len && code[i] !== '\n') i++;
                continue;
            }
            if (char === '/' && code[i + 1] === '*') {
                // Block comment
                while (i < len - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
                i += 2;
                continue;
            }

            if (char === '{') depth++;
            if (char === '}') depth--;
            i++;
        }

        return i - 1;
    }

    /**
     * Skip over string literal
     */
    function skipString(code, start) {
        var quote = code[start];
        var i = start + 1;
        var len = code.length;

        while (i < len) {
            var char = code[i];

            // Escape sequence
            if (char === '\\') {
                i += 2;
                continue;
            }

            // End of string
            if (char === quote) {
                return i;
            }

            // Template literal interpolation
            if (quote === '`' && char === '$' && code[i + 1] === '{') {
                i = findMatchingBrace(code, i + 1) + 1;
                continue;
            }

            i++;
        }

        return i;
    }

    /**
     * Check if position is inside a string
     */
    function inString(code, pos) {
        var inStr = false;
        var quote = null;

        for (var i = 0; i < pos; i++) {
            var char = code[i];

            if (!inStr && (char === '"' || char === "'" || char === '`')) {
                inStr = true;
                quote = char;
            } else if (inStr && char === quote && code[i - 1] !== '\\') {
                inStr = false;
                quote = null;
            }
        }

        return inStr;
    }

    /**
     * Transform JSX to JavaScript (recursive version)
     */
    function transformJSX(code) {
        var output = '';
        var i = 0;
        var len = code.length;

        while (i < len) {
            var char = code[i];

            // Skip strings
            if (char === '"' || char === "'" || char === '`') {
                var stringEnd = skipString(code, i);
                output += code.substring(i, stringEnd + 1);
                i = stringEnd + 1;
                continue;
            }

            // Skip comments
            if (char === '/' && code[i + 1] === '/') {
                var lineEnd = i;
                while (lineEnd < len && code[lineEnd] !== '\n') lineEnd++;
                output += code.substring(i, lineEnd);
                i = lineEnd;
                continue;
            }
            if (char === '/' && code[i + 1] === '*') {
                var commentEnd = i + 2;
                while (commentEnd < len - 1 && !(code[commentEnd] === '*' && code[commentEnd + 1] === '/')) {
                    commentEnd++;
                }
                output += code.substring(i, commentEnd + 2);
                i = commentEnd + 2;
                continue;
            }

            // Check for JSX
            if (char === '<' && !inString(code, i)) {
                var peek = code[i + 1];

                // Check if it's JSX (not < comparison operator)
                var isJSX = false;

                // <> Fragment
                if (peek === '>') {
                    isJSX = true;
                }
                // </TagName>
                else if (peek === '/' && /[a-zA-Z>]/.test(code[i + 2])) {
                    isJSX = true;
                }
                // <TagName
                else if (/[a-zA-Z]/.test(peek)) {
                    isJSX = true;
                }

                if (isJSX) {
                    var jsxResult = parseAndTransformJSX(code, i);
                    output += jsxResult.code;
                    i = jsxResult.nextIndex;
                    continue;
                }
            }

            // Regular character
            output += char;
            i++;
        }

        return output;
    }

    /**
     * Parse and transform a single JSX element
     */
    function parseAndTransformJSX(code, start) {
        var i = start;
        var len = code.length;

        // Fragment: <>
        if (code[i] === '<' && code[i + 1] === '>') {
            var fragmentResult = parseJSXFragment(code, i);
            return {
                code: generateCode(fragmentResult.node),
                nextIndex: fragmentResult.nextIndex
            };
        }

        // Closing tag (shouldn't happen at top level, but handle it)
        if (code[i] === '<' && code[i + 1] === '/') {
            return { code: '', nextIndex: i };
        }

        // Opening tag: <TagName
        var openMatch = code.substring(i).match(/^<([a-zA-Z][\w.-]*)/);
        if (!openMatch) {
            return { code: '', nextIndex: i + 1 };
        }

        var tagName = openMatch[1];
        i += openMatch[0].length;

        var node = {
            type: 'JSXElement',
            tagName: tagName,
            attributes: [],
            children: [],
            isFragment: false
        };

        // Parse attributes
        while (i < len) {
            // Skip whitespace
            while (i < len && /\s/.test(code[i])) i++;

            var char = code[i];

            // Self-closing: />
            if (char === '/' && code[i + 1] === '>') {
                return {
                    code: generateCode(node),
                    nextIndex: i + 2
                };
            }

            // Tag end: >
            if (char === '>') {
                i++;
                break;
            }

            // Spread: {...props}
            if (char === '{' && code.substring(i, i + 4).match(/^\{\s*\.\.\./)) {
                var spreadEnd = findMatchingBrace(code, i);
                var spreadExpr = code.substring(i + 1, spreadEnd).replace(/^\s*\.\.\./, '').trim();
                // Recursively transform JSX in spread expression
                spreadExpr = transformJSX(spreadExpr);
                node.attributes.push({
                    type: 'spread',
                    value: spreadExpr
                });
                i = spreadEnd + 1;
                continue;
            }

            // Attribute
            var attrMatch = code.substring(i).match(/^([a-zA-Z][\w-]*)\s*=\s*/);
            if (attrMatch) {
                var attrName = attrMatch[1];
                i += attrMatch[0].length;

                var attrValue;

                // Expression: {expr}
                if (code[i] === '{') {
                    var valueEnd = findMatchingBrace(code, i);
                    var expr = code.substring(i + 1, valueEnd);
                    // Recursively transform JSX in expression
                    expr = transformJSX(expr);
                    attrValue = { type: 'expr', value: expr };
                    i = valueEnd + 1;
                }
                // String: "value" or 'value'
                else if (code[i] === '"' || code[i] === "'") {
                    var stringEnd = skipString(code, i);
                    attrValue = { type: 'string', value: code.substring(i + 1, stringEnd) };
                    i = stringEnd + 1;
                }
                // Boolean
                else {
                    attrValue = { type: 'boolean', value: 'true' };
                }

                node.attributes.push({
                    name: attrName,
                    value: attrValue
                });
                continue;
            }

            // Boolean attribute
            var boolMatch = code.substring(i).match(/^([a-zA-Z][\w-]*)/);
            if (boolMatch) {
                node.attributes.push({
                    name: boolMatch[1],
                    value: { type: 'boolean', value: 'true' }
                });
                i += boolMatch[0].length;
                continue;
            }

            i++;
        }

        // Parse children
        while (i < len) {
            // Skip whitespace between tags
            var wsStart = i;
            while (i < len && /\s/.test(code[i])) i++;
            var ws = code.substring(wsStart, i);

            var char = code[i];

            // Closing tag
            var closeMatch = code.substring(i).match(/^<\/([a-zA-Z][\w.-]*)\s*>/);
            if (closeMatch && closeMatch[1] === tagName) {
                return {
                    code: generateCode(node),
                    nextIndex: i + closeMatch[0].length
                };
            }

            // JSX expression: {expr}
            if (char === '{') {
                var exprEnd = findMatchingBrace(code, i);
                var expr = code.substring(i + 1, exprEnd);

                // Check if comment
                if (expr.trim().startsWith('/*')) {
                    // Skip comment
                } else {
                    // Recursively transform JSX in expression
                    expr = transformJSX(expr);
                    node.children.push({ type: 'expression', value: expr });
                }
                i = exprEnd + 1;
                continue;
            }

            // Nested JSX
            if (char === '<') {
                var jsxResult = parseAndTransformJSX(code, i);
                if (jsxResult.code) {
                    node.children.push({ type: 'expression', value: jsxResult.code });
                }
                i = jsxResult.nextIndex;
                continue;
            }

            // Text content
            var textStart = i;
            while (i < len && code[i] !== '<' && code[i] !== '{') {
                i++;
            }
            if (i > textStart) {
                var text = code.substring(textStart, i);
                if (text.trim()) {
                    node.children.push({ type: 'text', value: text });
                }
                continue;
            }

            // Safety: prevent infinite loop
            if (i === textStart && i === wsStart) {
                i++;
            }
        }

        return {
            code: generateCode(node),
            nextIndex: i
        };
    }

    /**
     * Parse JSX fragment <>...</>
     */
    function parseJSXFragment(code, start) {
        var node = {
            type: 'JSXElement',
            tagName: '',
            attributes: [],
            children: [],
            isFragment: true
        };

        var i = start + 2; // Skip <>
        var len = code.length;

        while (i < len) {
            // Check for closing: </>
            if (code.substring(i, i + 3) === '</>') {
                return { node: node, nextIndex: i + 3 };
            }

            // JSX expression
            if (code[i] === '{') {
                var exprEnd = findMatchingBrace(code, i);
                var expr = code.substring(i + 1, exprEnd);
                if (!expr.trim().startsWith('/*')) {
                    expr = transformJSX(expr);
                    node.children.push({ type: 'expression', value: expr });
                }
                i = exprEnd + 1;
                continue;
            }

            // Nested JSX
            if (code[i] === '<') {
                var jsxResult = parseAndTransformJSX(code, i);
                if (jsxResult.code) {
                    node.children.push({ type: 'expression', value: jsxResult.code });
                }
                i = jsxResult.nextIndex;
                continue;
            }

            // Text
            var textStart = i;
            while (i < len && code[i] !== '<' && code[i] !== '{') {
                i++;
            }
            if (i > textStart) {
                var text = code.substring(textStart, i);
                if (text.trim()) {
                    node.children.push({ type: 'text', value: text });
                }
            }
        }

        return { node: node, nextIndex: i };
    }

    /**
     * Generate JavaScript code from JSX AST
     */
    function generateCode(node) {
        if (node.type === 'text') {
            return JSON.stringify(node.value);
        }

        if (node.type === 'expression') {
            return '(' + node.value + ')';
        }

        if (node.type !== 'JSXElement') {
            return '';
        }

        // Fragment: React.createElement(React.Fragment, null, ...children)
        if (node.isFragment) {
            var fragmentChildren = node.children.map(generateCode).join(', ');
            return 'Mishkah.React.createElement(Mishkah.React.Fragment, null, ' + fragmentChildren + ')';
        }

        // Component or element
        var tagName = node.tagName;
        var isComponent = /^[A-Z]/.test(tagName);
        var tag = isComponent ? tagName : JSON.stringify(tagName);

        // Props
        var propsCode;
        var hasSpread = false;
        var regularProps = [];

        // Separate spread props from regular props
        node.attributes.forEach(function (attr) {
            if (attr.type === 'spread') {
                hasSpread = true;
            } else {
                var propCode = JSON.stringify(attr.name) + ': ';
                if (attr.value.type === 'expr') {
                    propCode += '(' + attr.value.value + ')';
                } else if (attr.value.type === 'string') {
                    propCode += JSON.stringify(attr.value.value);
                } else {
                    propCode += attr.value.value;
                }
                regularProps.push(propCode);
            }
        });

        // Generate props code
        if (hasSpread) {
            // Use Object.assign when spread is present
            var assignArgs = [];
            var currentObj = [];

            node.attributes.forEach(function (attr) {
                if (attr.type === 'spread') {
                    // Push current object if any
                    if (currentObj.length > 0) {
                        assignArgs.push('{' + currentObj.join(', ') + '}');
                        currentObj = [];
                    }
                    // Add spread expression
                    assignArgs.push('(' + attr.value + ')');
                } else {
                    // Add to current object
                    var propCode = JSON.stringify(attr.name) + ': ';
                    if (attr.value.type === 'expr') {
                        propCode += '(' + attr.value.value + ')';
                    } else if (attr.value.type === 'string') {
                        propCode += JSON.stringify(attr.value.value);
                    } else {
                        propCode += attr.value.value;
                    }
                    currentObj.push(propCode);
                }
            });

            // Push final object if any
            if (currentObj.length > 0) {
                assignArgs.push('{' + currentObj.join(', ') + '}');
            }

            if (assignArgs.length === 0) {
                propsCode = 'null';
            } else {
                propsCode = 'Object.assign({}, ' + assignArgs.join(', ') + ')';
            }
        } else {
            // No spread, simple object literal
            if (regularProps.length === 0) {
                propsCode = 'null';
            } else {
                propsCode = '{' + regularProps.join(', ') + '}';
            }
        }

        // Children
        var children = node.children.map(generateCode).join(', ');

        return 'Mishkah.React.createElement(' + tag + ', ' + propsCode + (children ? ', ' + children : '') + ')';
    }

    // ===================================================================
    // Script Processor
    // ===================================================================

    /**
     * Process all <script type="text/jsx"> tags
     */
    function processJSXScripts() {
        var scripts = document.querySelectorAll('script[type="text/jsx"]');

        scripts.forEach(function (script) {
            var jsxCode = script.textContent || script.innerText;

            try {
                // Transform JSX to JS
                var jsCode = transformJSX(jsxCode);

                // DEBUG: Log generated code
                console.log('=== Generated JavaScript ===');
                console.log(jsCode);
                console.log('============================');

                // Execute transformed code
                var scriptEl = document.createElement('script');
                scriptEl.textContent = jsCode;
                document.body.appendChild(scriptEl);
            } catch (error) {
                console.error('JSX Parse Error:', error);
                console.error('Original JSX:', jsxCode);
                console.error('Generated JS:', jsCode);
            }
        });
    }

    // ===================================================================
    // Fragment Support
    // ===================================================================

    if (!React.Fragment) {
        React.Fragment = function Fragment(props) {
            return props.children || [];
        };
    }

    // ===================================================================
    // Initialize
    // ===================================================================

    // Auto-process JSX scripts when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processJSXScripts);
    } else {
        processJSXScripts();
    }

    // Expose API
    global.MishkahJSX = {
        transform: transformJSX,
        process: processJSXScripts
    };

})(typeof window !== 'undefined' ? window : this);
