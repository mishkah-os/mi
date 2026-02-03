// Frontend Session Utilities - Add to posv2.js

// ==============================================
// SESSION MANAGEMENT
// ==============================================

/**
 * Get current user session from server
 * @returns {Promise<Object|null>} Session data or null if not authenticated
 */
async function getUserSession() {
    try {
        const response = await fetch('/api/session/info', {
            credentials: 'include' // Important: sends cookie
        });

        if (response.ok) {
            const session = await response.json();
            return {
                userId: session.userId,
                userName: session.userName,
                userEmail: session.userEmail,
                companyId: session.companyId,
                branchId: session.branchId,
                branchName: session.branchName
            };
        }

        console.warn('No valid session found');
        return null;
    } catch (error) {
        console.error('Failed to get session:', error);
        return null;
    }
}

/**
 * Open a new shift with real user data from session
 * @returns {Promise<Object|null>} Shift object or null on failure
 */
async function openShift() {
    // Get user session first
    const session = await getUserSession();

    if (!session) {
        alert('⚠️ الرجاء تسجيل الدخول أولاً');
        return null;
    }

    // Create shift with real data
    const shift = {
        id: generateShiftId(),
        user_id: session.userId,
        user_name: session.userName,
        company_id: session.companyId,
        branch_id: session.branchId,
        branch_name: session.branchName,
        opened_at: new Date().toISOString(),
        status: 'open',
        opening_balance: 0
    };

    try {
        // Save shift to backend
        const response = await fetch('/api/shifts/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(shift)
        });

        if (response.ok) {
            // Save in localStorage
            localStorage.setItem('currentShift', JSON.stringify(shift));
            localStorage.setItem('userSession', JSON.stringify(session));

            console.log('✅ Shift opened:', shift);
            return shift;
        } else {
            const error = await response.json();
            console.error('❌ Failed to open shift:', error);
            alert('فشل فتح الوردية: ' + (error.message || 'خطأ غير معروف'));
            return null;
        }
    } catch (error) {
        console.error('❌ Network error opening shift:', error);
        alert('خطأ في الاتصال بالسيرفر');
        return null;
    }
}

/**
 * Get current active shift
 * @returns {Object|null} Current shift or null
 */
function getCurrentShift() {
    const shiftData = localStorage.getItem('currentShift');
    return shiftData ? JSON.parse(shiftData) : null;
}

/**
 * Close current shift
 * @returns {Promise<boolean>} Success status
 */
async function closeShift() {
    const shift = getCurrentShift();
    if (!shift) {
        alert('لا توجد وردية مفتوحة');
        return false;
    }

    try {
        const response = await fetch(`/api/shifts/${shift.id}/close`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                closed_at: new Date().toISOString()
            })
        });

        if (response.ok) {
            localStorage.removeItem('currentShift');
            console.log('✅ Shift closed');
            return true;
        }
    } catch (error) {
        console.error('❌ Error closing shift:', error);
    }

    return false;
}

// ==============================================
// INITIALIZATION WITH SESSION CHECK
// ==============================================

(async function initializePOS() {
    console.log('🚀 Initializing POS...');

    // 1. Check session
    const session = await getUserSession();

    if (!session) {
        alert('⚠️ يجب تسجيل الدخول أولاً');
        // Redirect to MVC login or show login modal
        // window.location.href = 'https://your-mvc-site.com/login';
        return;
    }

    console.log('✅ User authenticated:', session.userName);
    console.log('📍 Branch:', session.branchName);

    // 2. Check for active shift
    let currentShift = getCurrentShift();

    if (!currentShift) {
        console.log('📋 No active shift, opening new one...');
        currentShift = await openShift();

        if (!currentShift) {
            alert('❌ فشل فتح الوردية. الرجاء المحاولة مرة أخرى.');
            return;
        }
    } else {
        console.log('✅ Active shift found:', currentShift.id);
    }

    // 3. Initialize POS interface
    console.log('✅ POS Ready');
    displayUserInfo(session);
    displayShiftInfo(currentShift);

    // Continue with normal POS initialization...
})();

// Helper functions
function generateShiftId() {
    return 'shift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function displayUserInfo(session) {
    // Update UI with user info
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
        userInfoEl.innerHTML = `
      <span class="user-name">${session.userName}</span>
      <span class="branch-name">${session.branchName}</span>
    `;
    }
}

function displayShiftInfo(shift) {
    const shiftInfoEl = document.getElementById('shift-info');
    if (shiftInfoEl) {
        const openedTime = new Date(shift.opened_at).toLocaleString('ar-EG');
        shiftInfoEl.innerHTML = `
      <span>وردية: ${shift.id}</span>
      <span>فُتحت: ${openedTime}</span>
    `;
    }
}
