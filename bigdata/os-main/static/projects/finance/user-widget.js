/**
 * User Logout Handler and Info Widget for Finance Dashboard
 * Insert this at the end of dashboard.js (before the IIFE closing)
 */

// Add Logout Order
// Add Logout Order
// Add Logout Order
window.orders = window.orders || {};
window.orders['auth:logout'] = {
    on: ['click'],
    gkeys: ['auth:logout'],
    handler: async function (_ev, ctx) {
        if (window.AuthManager) {
            await window.AuthManager.logout();
        } else {
            // Fallback
            try {
                if (global.localStorage) {
                    global.localStorage.removeItem('mishkah_token');
                    global.localStorage.removeItem('mishkah_user');
                }
            } catch (_err) { }
            window.location.href = 'login.html';
        }
    }
};

// Helper: Get Current User
function getCurrentUser() {
    if (window.AuthManager && window.AuthManager.currentUser) {
        return window.AuthManager.currentUser;
    }
    // Fallback
    try {
        var userJson = global.localStorage ? global.localStorage.getItem('mishkah_user') : null;
        if (!userJson) return null;
        return JSON.parse(userJson);
    } catch (_err) {
        return null;
    }
}

// User Info Widget Component
function renderUserInfo(state) {
    var user = getCurrentUser();
    if (!user) return null;

    var username = user.username || user.name || user.display_name || 'مستخدم';
    var role = user.role || '';
    var roleLabel = role === 'admin' ? ' (مدير)' : role === 'manager' ? ' (مشرف)' : '';

    // Create widget container
    var widget = document.createElement('div');
    widget.className = 'user-info-widget';

    // User icon
    var icon = document.createElement('span');
    icon.className = 'user-icon';
    icon.textContent = '👤';
    widget.appendChild(icon);

    // Username with role
    var nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = username + roleLabel;
    widget.appendChild(nameSpan);

    // Logout button
    var logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn-logout';
    logoutBtn.setAttribute('gkey', 'auth:logout');
    logoutBtn.title = 'تسجيل الخروج';
    logoutBtn.textContent = '🚪';
    widget.appendChild(logoutBtn);

    return widget;
}

// CSS Styles for User Widget (add to dash.css or inject)
var userInfoStyles = `
.user-info-widget {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(255,255,255,0.1);
    border-radius: 20px;
    margin-left: 16px;
    font-size: 14px;
}
.user-icon {
    font-size: 18px;
}
.user-name {
    color: #333;
    font-weight: 600;
}
[data-theme="dark"] .user-name {
    color: #fff;
}
.btn-logout {
    background: rgba(255,77,77,0.1);
    border: 1px solid rgba(255,77,77,0.3);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
}
.btn-logout:hover {
    background: rgba(255,77,77,0.2);
    transform: scale(1.1);
}
`;

// Inject styles
try {
    var styleEl = document.createElement('style');
    styleEl.textContent = userInfoStyles;
    document.head.appendChild(styleEl);
} catch (_err) { }

// Render user widget
window.renderUserWidget = function () {
    const container = document.getElementById('user-widget');
    if (!container) return;
    const widget = renderUserInfo();
    if (widget) {
        container.innerHTML = '';
        container.appendChild(widget);
    }
};
