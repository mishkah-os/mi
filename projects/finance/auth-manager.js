/**
 * AuthManager
 * Handles token parsing, auto-login, and remote user syncing.
 */
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.config = null;
    }

    /**
     * Initialize with domain config
     */
    async init() {
        try {
            // Load domain config to find remote server details
            const response = await fetch('/data/branches.domain-config.json');
            this.branchConfig = await response.json();
        } catch (e) {
            console.error('Failed to load branch config', e);
        }
    }

    /**
     * Check for session based on URL token or previously stored session
     */
    async checkSession() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (token) {
            return this.handleTokenLogin(token);
        }

        // Check localStorage fallback
        const storedUser = localStorage.getItem('mishkah_user');
        if (storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
                console.log('Restored session for:', this.currentUser.username);
                return true;
            } catch (e) {
                console.warn('Invalid stored session');
                localStorage.removeItem('mishkah_user');
            }
        }

        return false;
    }

    /**
     * Log out the current user
     */
    async logout() {
        this.currentUser = null;
        localStorage.removeItem('mishkah_user');
        localStorage.removeItem('mishkah_token');
        window.location.reload();
    }

    /**
     * Handle login via token
     * NOTE: In a real scenario, we should decrypt this given the key in ws_token.cs
     * keeping it simple for now as per instructions (validating structure).
     */
    async handleTokenLogin(token) {
        console.log('Attempting token login...');
        try {
            // Assume token is a base64-encoded JSON payload containing user data
            const decoded = atob(token);
            const userData = JSON.parse(decoded);
            this.currentUser = userData;
            // Store token and user data in localStorage for future sessions
            localStorage.setItem('mishkah_token', token);
            localStorage.setItem('mishkah_user', JSON.stringify(userData));
            console.log('Token login successful for:', userData.username || userData.name);
            return true;
        } catch (e) {
            console.warn('Token login failed, fallback to manual login', e);
            return false;
        }
    }

    /**
     * Trigger a remote sync to get users from the configured source
     */
    async syncRemoteUsers(branchKey) {
        if (!this.branchConfig || !this.branchConfig[branchKey]) {
            console.error('Branch config not found for key:', branchKey);
            return false;
        }

        const config = this.branchConfig[branchKey];
        const remoteUrl = config.domain_url;
        const apiKey = config.api_key;
        // const syncAction = config.sync_action;

        console.log(`Syncing users from ${remoteUrl}...`);

        try {
            // We'll assume a standard API endpoint exists on that domain for dumping users
            // This is a hypothetical endpoint based on the request description
            const response = await fetch(`${remoteUrl}/api/security/users?api_key=${apiKey}`);

            if (!response.ok) throw new Error('Remote fetch failed');

            const remoteUsers = await response.json();

            // Save to local Mishkah DB (IndexedDB/PouchDB wrapper)
            // Accessing the 'security' module db
            if (window.Mishkah && window.Mishkah.Database) {
                // Upsert users
                // This assumes we have a way to write to 'sys_users' via the frontend lib
                // Or we just store them in localStorage for this disconnected client
                localStorage.setItem('cached_sys_users', JSON.stringify(remoteUsers));
                console.log(`Synced ${remoteUsers.length} users.`);
                return true;
            }

        } catch (e) {
            console.error('Sync failed', e);
            alert('Sync failed: ' + e.message);
        }
        return false;
    }
}

// Export instance
window.AuthManager = new AuthManager();
