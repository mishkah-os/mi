// Clinic CRUD - Knex Test Client
(function () {
    'use strict';

    const API_BASE = '/api/v1/crud';
    let currentTable = null;
    let currentLang = 'ar';
    let currentData = [];

    // Initialize
    async function init() {
        setupEventListeners();
        await loadAvailableTables();
    }

    function setupEventListeners() {
        // Language switch
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentLang = btn.dataset.lang;
                document.getElementById('currentLang').textContent = currentLang === 'ar' ? 'العربية' : 'English';

                if (currentTable) {
                    loadTableData(currentTable);
                }
            });
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            if (currentTable) {
                loadTableData(currentTable);
            }
        });
    }

    async function loadAvailableTables() {
        try {
            // Hard-coded list for clinic schema (from clinic_schema.json)
            const tables = [
                'languages',
                'companies',
                'companies_lang',
                'branches',
                'branches_lang',
                'users',
                'users_lang',
                'clinic_specialties',
                'clinic_specialties_lang'
            ];

            renderTablesList(tables);
        } catch (error) {
            console.error('Failed to load tables:', error);
            showToast('فشل تحميل قائمة الجداول', 'error');
        }
    }

    function renderTablesList(tables) {
        const container = document.getElementById('tablesList');
        container.innerHTML = '';

        tables.forEach(tableName => {
            const li = document.createElement('li');
            li.className = 'table-item';
            li.textContent = tableName;
            li.addEventListener('click', () => {
                document.querySelectorAll('.table-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
                loadTableData(tableName);
            });
            container.appendChild(li);
        });
    }

    async function loadTableData(tableName) {
        currentTable = tableName;

        // Update UI
        document.getElementById('tableName').textContent = tableName;
        document.getElementById('toolbar').style.display = 'flex';
        document.getElementById('statsGrid').style.display = 'grid';

        // Show loading
        const container = document.getElementById('dataContainer');
        container.innerHTML = '<div class="loading"><div class="spinner"></div><p>جاري التحميل...</p></div>';

        try {
            // Call REST API
            const url = `${API_BASE}/match/${tableName}?lang=${currentLang}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            currentData = Array.isArray(data) ? data : [];

            console.log('Loaded data:', currentData);

            // Update stats
            document.getElementById('recordCount').textContent = currentData.length;

            // Render table
            renderDataTable(currentData);

            showToast(`تم تحميل ${currentData.length} سجل بنجاح`, 'success');
        } catch (error) {
            console.error('Failed to load table:', error);
            container.innerHTML = `
        <div class="loading">
          <p style="color: #ef4444;">❌ خطأ: ${error.message}</p>
          <p style="font-size: 13px; margin-top: 10px;">تأكد من تشغيل السيرفر وتفعيل Knex</p>
        </div>
      `;
            showToast('فشل تحميل البيانات', 'error');
        }
    }

    function renderDataTable(data) {
        const container = document.getElementById('dataContainer');

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="loading"><p>لا توجد بيانات</p></div>';
            return;
        }

        // Get all unique keys
        const allKeys = new Set();
        data.forEach(row => {
            Object.keys(row).forEach(key => allKeys.add(key));
        });

        const keys = Array.from(allKeys);

        // Build table
        let html = '<table class="data-table"><thead><tr>';

        keys.forEach(key => {
            html += `<th>${escapeHtml(key)}</th>`;
        });

        html += '</tr></thead><tbody>';

        data.forEach(row => {
            html += '<tr>';
            keys.forEach(key => {
                const value = row[key];
                html += `<td>${formatValue(key, value)}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function formatValue(key, value) {
        if (value === null || value === undefined) {
            return '<span style="color: #9ca3af;">-</span>';
        }

        // If it's an object (hydrated FK), show it nicely
        if (typeof value === 'object' && value.id) {
            return `<span class="fk-badge">${escapeHtml(value.name || value.id)}</span>`;
        }

        // Boolean
        if (typeof value === 'boolean') {
            return value ? '✅' : '❌';
        }

        return escapeHtml(String(value));
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
