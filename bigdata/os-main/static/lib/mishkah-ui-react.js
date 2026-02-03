/**
 * Mishkah UI React Components
 * Complete UI library integrated with Mishkah React theming system
 */
(function (global, factory) {
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        var M = global.Mishkah = global.Mishkah || {};
        factory(M);
    }
}(typeof window !== 'undefined' ? window : this, function (Mishkah) {
    'use strict';

    var M = Mishkah || (typeof window !== 'undefined' ? window.Mishkah : {});

    // Get React utilities from Mishkah.React
    var R = M.React || {};
    var createElement = R.createElement || R.h;
    var useTheme = R.useTheme;
    var useI18n = R.useI18n;
    var useDirection = R.useDirection;
    var useState = R.useState;

    if (!createElement) {
        console.error('Mishkah.React must be loaded before Mishkah UI React');
        return;
    }

    // ===================================================================
    // Utility Functions
    // ===================================================================

    function sx() {
        var result = {};
        for (var i = 0; i < arguments.length; i++) {
            var obj = arguments[i];
            if (obj) for (var k in obj) result[k] = obj[k];
        }
        return result;
    }

    function cls() {
        var classes = [];
        for (var i = 0; i < arguments.length; i++) {
            var arg = arguments[i];
            if (!arg) continue;
            if (typeof arg === 'string') classes.push(arg);
        }
        return classes.join(' ');
    }

    // ===================================================================
    // Basic Components
    // ===================================================================

    // Button
    function Button(props) {
        var th = useTheme();
        var t = th.tokens;
        var variant = props.variant || 'soft';
        var size = props.size || 'md';

        var baseStyle = {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
            borderRadius: t.radius.md,
            fontWeight: '500',
            border: 'none',
            cursor: props.disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            outline: 'none',
            opacity: props.disabled ? 0.6 : 1
        };

        var sizes = {
            sm: { padding: '6px 12px', fontSize: '13px' },
            md: { padding: t.spacing.sm + ' ' + t.spacing.md, fontSize: '14px' },
            lg: { padding: '12px 24px', fontSize: '16px' }
        };

        var variants = {
            solid: { background: t.colors.primary, color: t.colors.primaryForeground },
            soft: { background: t.colors.accent, color: t.colors.foreground },
            ghost: { background: 'transparent', color: t.colors.foreground },
            destructive: { background: t.colors.destructive, color: '#fff' }
        };

        return createElement('button', {
            style: sx(baseStyle, sizes[size], variants[variant] || variants.soft, props.style),
            className: props.className,
            onClick: props.onClick,
            disabled: props.disabled,
            type: props.type || 'button'
        }, props.children);
    }

    // Input
    function Input(props) {
        var th = useTheme();
        var t = th.tokens;
        var dir = useDirection();

        var style = {
            width: '100%',
            height: '40px',
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: t.radius.md,
            border: '1px solid ' + t.colors.input,
            background: t.colors.background,
            color: t.colors.foreground,
            outline: 'none',
            direction: dir
        };

        return createElement('input', {
            style: sx(style, props.style),
            type: props.type || 'text',
            placeholder: props.placeholder,
            value: props.value,
            onChange: props.onChange,
            disabled: props.disabled,
            name: props.name,
            id: props.id
        });
    }

    // Card
    function Card(props) {
        var th = useTheme();
        var dir = useDirection();
        var t = th.tokens;

        var cardStyle = {
            borderRadius: t.radius.md,
            border: '1px solid ' + t.colors.border,
            background: t.colors.card,
            color: t.colors.cardForeground,
            boxShadow: t.shadows.md,
            direction: dir
        };

        var headerStyle = {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: t.spacing.lg
        };

        var titleStyle = {
            fontSize: '18px',
            fontWeight: '600',
            margin: 0
        };

        var descStyle = {
            fontSize: '14px',
            color: t.colors.muted,
            margin: 0
        };

        var contentStyle = {
            padding: '0 ' + t.spacing.lg + ' ' + t.spacing.lg
        };

        var footerStyle = {
            padding: t.spacing.lg,
            borderTop: '1px solid ' + t.colors.border
        };

        var children = [];

        // Header
        if (props.title || props.description) {
            var headerChildren = [];
            if (props.title) {
                headerChildren.push(createElement('h3', { style: titleStyle, key: 't' }, props.title));
            }
            if (props.description) {
                headerChildren.push(createElement('p', { style: descStyle, key: 'd' }, props.description));
            }
            children.push(createElement('div', { style: headerStyle, key: 'h' }, headerChildren));
        }

        // Content
        if (props.content || props.children) {
            children.push(
                createElement('div', { style: contentStyle, key: 'c' }, props.content || props.children)
            );
        }

        // Footer
        if (props.footer) {
            children.push(createElement('div', { style: footerStyle, key: 'f' }, props.footer));
        }

        return createElement('section', {
            style: sx(cardStyle, props.style),
            className: props.className
        }, children);
    }

    // ===================================================================
    // Layout Components
    // ===================================================================

    // HStack
    function HStack(props) {
        var th = useTheme();
        var style = {
            display: 'flex',
            alignItems: 'center',
            gap: th.tokens.spacing.sm,
            flexWrap: 'wrap'
        };
        return createElement('div', {
            style: sx(style, props.style),
            className: props.className
        }, props.children);
    }

    // VStack
    function VStack(props) {
        var th = useTheme();
        var style = {
            display: 'flex',
            flexDirection: 'column',
            gap: th.tokens.spacing.sm
        };
        return createElement('div', {
            style: sx(style, props.style),
            className: props.className
        }, props.children);
    }

    // Divider
    function Divider(props) {
        var th = useTheme();
        var style = {
            height: '1px',
            background: th.tokens.colors.border,
            margin: th.tokens.spacing.sm + ' 0'
        };
        return createElement('div', {
            style: sx(style, props.style)
        });
    }

    // ===================================================================
    // Feedback Components
    // ===================================================================

    // Alert
    function Alert(props) {
        var th = useTheme();
        var type = props.type || 'info';

        var types = {
            info: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', color: '#60a5fa' },
            success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', color: '#34d399' },
            warning: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', color: '#fbbf24' },
            error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#f87171' }
        };

        var s = types[type] || types.info;

        var style = {
            padding: th.tokens.spacing.md,
            borderRadius: th.tokens.radius.md,
            background: s.bg,
            border: '1px solid ' + s.border,
            color: s.color
        };

        var children = [];
        if (props.title) {
            children.push(createElement('strong', { key: 'title', style: { display: 'block', marginBottom: '4px' } }, props.title));
        }
        if (props.children) {
            children.push(props.children);
        }

        return createElement('div', {
            style: sx(style, props.style),
            role: 'alert'
        }, children.length > 0 ? children : props.children);
    }

    // Badge
    function Badge(props) {
        var th = useTheme();
        var variant = props.variant || 'default';

        var variants = {
            default: { background: th.tokens.colors.accent, color: th.tokens.colors.foreground },
            primary: { background: th.tokens.colors.primary, color: th.tokens.colors.primaryForeground },
            success: { background: '#10b981', color: '#fff' },
            warning: { background: '#f59e0b', color: '#fff' },
            error: { background: th.tokens.colors.destructive, color: '#fff' }
        };

        var style = {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: th.tokens.radius.full,
            fontSize: '12px',
            fontWeight: '500'
        };

        return createElement('span', {
            style: sx(style, variants[variant], props.style),
            className: props.className
        }, props.children);
    }

    // Spinner
    function Spinner(props) {
        var size = props.size || 'md';
        var th = useTheme();

        var sizes = {
            sm: 16,
            md: 24,
            lg: 32
        };

        var sizeValue = sizes[size] || sizes.md;

        var style = {
            width: sizeValue + 'px',
            height: sizeValue + 'px',
            border: '3px solid ' + th.tokens.colors.border,
            borderTopColor: th.tokens.colors.primary,
            borderRadius: '50%',
            animation: 'mishkahSpin 0.8s linear infinite'
        };

        // Inject animation if not exists
        if (typeof document !== 'undefined') {
            var cssId = 'mishkah-ui-spin';
            if (!document.getElementById(cssId)) {
                var css = document.createElement('style');
                css.id = cssId;
                css.textContent = '@keyframes mishkahSpin { to { transform: rotate(360deg); } }';
                document.head.appendChild(css);
            }
        }

        return createElement('div', {
            style: sx(style, props.style),
            className: props.className
        });
    }

    // Progress
    function Progress(props) {
        var th = useTheme();
        var value = Math.min(100, Math.max(0, props.value || 0));

        var trackStyle = {
            width: '100%',
            height: '8px',
            background: th.tokens.colors.border,
            borderRadius: th.tokens.radius.full,
            overflow: 'hidden'
        };

        var barStyle = {
            width: value + '%',
            height: '100%',
            background: th.tokens.colors.primary,
            borderRadius: th.tokens.radius.full,
            transition: 'width 0.3s ease'
        };

        return createElement('div', {
            style: sx(trackStyle, props.style)
        }, [
            createElement('div', { style: barStyle, key: 'bar' })
        ]);
    }

    // ===================================================================
    // Advanced Components
    // ===================================================================

    // Avatar
    function Avatar(props) {
        var th = useTheme();
        var size = props.size || 40;
        var name = props.name || '';
        var src = props.src;

        var initials = name
            .split(' ')
            .map(function (word) { return word[0]; })
            .join('')
            .toUpperCase()
            .slice(0, 2);

        var colors = [
            '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
        ];

        var colorIndex = name.split('').reduce(function (acc, char) {
            return acc + char.charCodeAt(0);
        }, 0) % colors.length;

        var style = {
            width: size + 'px',
            height: size + 'px',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: (size / 2.5) + 'px',
            fontWeight: '600',
            color: '#fff',
            background: src ? 'transparent' : colors[colorIndex],
            backgroundImage: src ? 'url(' + src + ')' : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
        };

        return createElement('div', {
            style: sx(style, props.style),
            className: props.className,
            title: name
        }, src ? null : initials);
    }

    // Skeleton
    function Skeleton(props) {
        var th = useTheme();
        var width = props.width || '100%';
        var height = props.height || '20px';
        var rounded = props.rounded || th.tokens.radius.md;

        var style = {
            width: width,
            height: height,
            borderRadius: rounded,
            background: 'linear-gradient(90deg, ' + th.tokens.colors.border + ' 25%, ' + th.tokens.colors.accent + ' 50%, ' + th.tokens.colors.border + ' 75%)',
            backgroundSize: '200% 100%',
            animation: 'mishkahSkeletonPulse 1.5s ease-in-out infinite'
        };

        // Inject animation
        if (typeof document !== 'undefined') {
            var cssId = 'mishkah-ui-skeleton';
            if (!document.getElementById(cssId)) {
                var css = document.createElement('style');
                css.id = cssId;
                css.textContent = '@keyframes mishkahSkeletonPulse { 0%, 100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }';
                document.head.appendChild(css);
            }
        }

        return createElement('div', {
            style: sx(style, props.style),
            className: props.className
        });
    }

    // SweetNotice
    function SweetNotice(props) {
        var th = useTheme();
        var tone = props.tone || 'info';
        var icon = props.icon;
        var title = props.title;
        var message = props.message;
        var hint = props.hint;
        var actions = props.actions;

        var tones = {
            info: { bg: 'rgba(59,130,246,0.1)', border: '#3b82f6', iconColor: '#3b82f6' },
            success: { bg: 'rgba(16,185,129,0.1)', border: '#10b981', iconColor: '#10b981' },
            warning: { bg: 'rgba(245,158,11,0.1)', border: '#f59e0b', iconColor: '#f59e0b' },
            error: { bg: 'rgba(239,68,68,0.1)', border: '#ef4444', iconColor: '#ef4444' }
        };

        var t = tones[tone] || tones.info;

        var containerStyle = {
            background: t.bg,
            border: '2px solid ' + t.border,
            borderRadius: th.tokens.radius.lg,
            padding: th.tokens.spacing.lg,
            display: 'flex',
            flexDirection: 'column',
            gap: th.tokens.spacing.sm
        };

        var headerStyle = {
            display: 'flex',
            alignItems: 'center',
            gap: th.tokens.spacing.sm
        };

        var iconStyle = {
            fontSize: '24px',
            lineHeight: '1'
        };

        var titleStyle = {
            fontSize: '16px',
            fontWeight: '600',
            margin: 0,
            color: th.tokens.colors.foreground
        };

        var messageStyle = {
            fontSize: '14px',
            color: th.tokens.colors.foreground,
            margin: 0
        };

        var hintStyle = {
            fontSize: '12px',
            color: th.tokens.colors.muted,
            margin: 0
        };

        var actionsStyle = {
            display: 'flex',
            gap: th.tokens.spacing.sm,
            marginTop: th.tokens.spacing.sm
        };

        var children = [];

        // Header with icon and title
        if (icon || title) {
            var headerChildren = [];
            if (icon) {
                headerChildren.push(
                    createElement('span', { style: iconStyle, key: 'icon' }, icon)
                );
            }
            if (title) {
                headerChildren.push(
                    createElement('h4', { style: titleStyle, key: 'title' }, title)
                );
            }
            children.push(
                createElement('div', { style: headerStyle, key: 'header' }, headerChildren)
            );
        }

        // Message
        if (message) {
            children.push(
                createElement('p', { style: messageStyle, key: 'message' }, message)
            );
        }

        // Hint
        if (hint) {
            children.push(
                createElement('p', { style: hintStyle, key: 'hint' }, hint)
            );
        }

        // Actions
        if (actions && actions.length > 0) {
            children.push(
                createElement('div', { style: actionsStyle, key: 'actions' }, actions)
            );
        }

        return createElement('div', {
            style: sx(containerStyle, props.style),
            className: props.className
        }, children);
    }

    // ===================================================================
    // Export UI Components
    // ===================================================================

    var UI = {
        // Basic
        Button: Button,
        Input: Input,
        Card: Card,

        // Layout
        HStack: HStack,
        VStack: VStack,
        Divider: Divider,

        // Feedback
        Alert: Alert,
        Badge: Badge,
        Spinner: Spinner,
        Progress: Progress,

        // Advanced
        Avatar: Avatar,
        Skeleton: Skeleton,
        SweetNotice: SweetNotice
    };

    // Expose via Mishkah.UI
    if (M) {
        M.UI = UI;
    }

    // Also expose globally for convenience
    if (typeof global !== 'undefined') {
        global.MishkahUI = UI;
    }

    return UI;
}));
