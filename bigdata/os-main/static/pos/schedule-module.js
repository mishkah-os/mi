/**
 * Scheduled Orders Frontend Module
 * Completely Redesigned to match POS Orders UI
 */

const ScheduleModule = {
  state: {
    schedules: [],
    loading: false,
    filter: 'pending',
    isModalOpen: false,
    etags: {}, // Map of filter -> etag
    pollTimer: null,
    pollInterval: 30000, // Default slow poll (30s)
    fastPollInterval: 5000, // Active poll (5s)
    slowPollInterval: 30000
  },

  init() {
    console.log('✅ Schedule Module v2 Initialized');
    // Inject styles if needed
    this.injectStyles();
    // Start adaptive polling
    this.startPolling();
  },

  startPolling() {
    if (this.state.pollTimer) clearTimeout(this.state.pollTimer);

    const poll = async () => {
      try {
        // Only poll if modal is open OR if we want background updates (optional)
        // For now, we always poll but vary the interval
        await this.loadSchedules({ status: this.state.filter }, { background: true });

        // If modal is open, re-render if data changed (handled in loadSchedules)
        // If 304, nothing happens

      } catch (err) {
        // console.warn('Poll failed', err);
      } finally {
        const interval = this.state.isModalOpen ? this.state.fastPollInterval : this.state.slowPollInterval;
        this.state.pollTimer = setTimeout(poll, interval);
      }
    };

    // Initial start
    this.state.pollTimer = setTimeout(poll, this.state.slowPollInterval);
  },

  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .schedule-card {
        transition: all 0.2s;
        border: 1px solid var(--border-color, #e5e7eb);
      }
      .schedule-card:hover {
        border-color: var(--primary-color, #3b82f6);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      .schedule-status-badge {
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
      }
      .status-pending { background: #eff6ff; color: #1e40af; }
      .status-converted { background: #ecfdf5; color: #065f46; }
      .status-cancelled { background: #fef2f2; color: #991b1b; }
      
      [data-theme="dark"] .status-pending { background: rgba(30, 64, 175, 0.2); color: #93c5fd; }
      [data-theme="dark"] .status-converted { background: rgba(6, 95, 70, 0.2); color: #6ee7b7; }
      [data-theme="dark"] .status-cancelled { background: rgba(153, 27, 27, 0.2); color: #fca5a5; }
    `;
    document.head.appendChild(style);
  },

  // API Methods
  async loadSchedules(filters = {}, options = {}) {
    const branchId = window.POS_CONFIG?.branchId || window.localStorage.getItem('pos_branch_id') || 'dar';
    const moduleId = window.POS_CONFIG?.moduleId || window.localStorage.getItem('pos_module_id') || 'pos';
    const background = options.background || false;

    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);

    // Generate filter key for ETag lookup
    const filterKey = `${filters.status || 'all'}-any-any`; // match logic in backend
    const currentEtag = this.state.etags[filterKey];

    const headers = {};
    if (currentEtag) {
      headers['If-None-Match'] = currentEtag;
    }

    const response = await fetch(`/api/branches/${branchId}/modules/${moduleId}/schedule?${params}`, {
      headers
    });

    if (response.status === 304) {
      // Not modified
      // console.log('✅ [Schedule] Not modified (304)');
      return this.state.schedules;
    }

    if (!response.ok) throw new Error('Failed to load schedules');

    // Save new ETag
    const newEtag = response.headers.get('ETag');
    if (newEtag) {
      this.state.etags[filterKey] = newEtag;
    }

    const result = await response.json();
    this.state.schedules = result.schedules || [];

    // If modal is open and this was a background poll, re-render
    if (background && this.state.isModalOpen) {
      this.renderModal();
    }

    return this.state.schedules;
  },

  async confirmSchedule(scheduleId) {
    const branchId = window.POS_CONFIG?.branchId || window.localStorage.getItem('pos_branch_id') || 'dar';
    const moduleId = window.POS_CONFIG?.moduleId || window.localStorage.getItem('pos_module_id') || 'pos';
    const response = await fetch(`/api/branches/${branchId}/modules/${moduleId}/schedule/${scheduleId}/confirm`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to confirm schedule');
    return await response.json();
  },

  async saveScheduledOrder(orderData) {
    const branchId = window.POS_CONFIG?.branchId || window.localStorage.getItem('pos_branch_id') || 'dar';
    const moduleId = window.POS_CONFIG?.moduleId || window.localStorage.getItem('pos_module_id') || 'pos';
    const response = await fetch(`/api/branches/${branchId}/modules/${moduleId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    if (!response.ok) throw new Error('Failed to save schedule');
    return await response.json();
  },

  // UI Methods
  t(key, defaultValue) {
    // Try to find translation in global database or use fallback
    if (window.database?.ui_texts) {
      const lang = document.documentElement.lang || 'ar';
      const entry = window.database.ui_texts.find(row => row.key === key);
      return entry?.text?.[lang] || entry?.text?.['en'] || defaultValue;
    }
    return defaultValue;
  },

  async openReservationsModal() {
    this.state.loading = true;
    try {
      this.state.isModalOpen = true;
      // Switch to fast polling immediately
      if (this.state.pollTimer) {
        clearTimeout(this.state.pollTimer);
        this.startPolling(); // restart with new check for isModalOpen
      }

      await this.loadSchedules({ status: this.state.filter });
      this.renderModal();
    } catch (err) {
      console.error(err);
      alert(this.t('error_loading_schedules', 'Error loading schedules'));
    } finally {
      this.state.loading = false;
    }
  },

  renderModal() {
    // Remove existing
    const existing = document.querySelector('#reservations-modal');
    if (existing) {
      // If we are re-rendering, don't remove event listeners brutally unless we re-attach them
      // But the previous implementation removes the node. So we follow that pattern.
      existing.remove();
    }

    const t = (k, d) => this.t(k, d);

    // Filter tabs
    const filters = [
      { key: 'pending', label: t('pos:filter:pending', 'قيد الانتظار'), icon: '⏳' },
      { key: 'converted', label: t('pos:filter:completed', 'مكتملة'), icon: '✅' },
      { key: 'cancelled', label: t('pos:filter:cancelled', 'ملغية'), icon: '❌' },
      { key: 'all', label: t('pos:filter:all', 'الكل'), icon: '📋' }
    ];

    const modalHTML = `
      <div id="reservations-modal" class="modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          
          <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
            <div class="flex items-center gap-3">
              <span class="text-2xl">📅</span>
              <div>
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">${t('pos:reservations:title', 'إدارة الحجوزات')}</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">${t('pos:reservations:subtitle', 'عرض وإدارة الطلبات المجدولة')}</p>
              </div>
            </div>
            <button gkey="pos:schedules:close" onclick="window.ScheduleModule.closeModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
              <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <!-- Filters -->
          <div class="px-6 py-3 border-b border-gray-200 dark:border-gray-800 flex gap-2 overflow-x-auto bg-white dark:bg-gray-900">
            ${filters.map(f => `
              <button gkey="pos:schedules:filter" data-status="${f.key}"
                class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${this.state.filter === f.key
        ? 'bg-blue-600 text-white shadow-md'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }">
                <span>${f.icon}</span>
                <span>${f.label}</span>
                <span class="bg-white/20 px-1.5 rounded text-xs ml-1">
                  ${this.state.schedules.filter(s => f.key === 'all' ? true : s.status === f.key).length}
                </span>
              </button>
            `).join('')}
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/50">
            ${this.state.schedules.length === 0 ? this.renderEmptyState() : `
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${this.state.schedules.map(s => this.renderCard(s)).join('')}
              </div>
            `}
          </div>

        </div>
      </div>
    `;

    const host = document.querySelector('#app') || document.body;
    host.insertAdjacentHTML('beforeend', modalHTML);
  },

  renderEmptyState() {
    const t = (k, d) => this.t(k, d);
    return `
      <div class="flex flex-col items-center justify-center py-20 text-gray-400">
        <span class="text-6xl mb-4 opacity-50">📅</span>
        <h3 class="text-xl font-medium text-gray-600 dark:text-gray-300">${t('pos:reservations:empty', 'لا توجد حجوزات')}</h3>
        <p class="text-sm">${t('pos:reservations:empty_desc', 'لا توجد حجوزات تطابق الفلتر الحالي')}</p>
      </div>
    `;
  },

  renderCard(schedule) {
    const t = (k, d) => this.t(k, d);
    const payload = schedule.payload || {};
    const lines = Array.isArray(schedule.lines) && schedule.lines.length ? schedule.lines : (payload.lines || []);
    const totals = payload.totals || schedule.totals || {};
    const sequenceNum = payload.sequenceNumber ? `#${payload.sequenceNumber}` : schedule.id.substring(0, 8);
    const date = new Date(schedule.scheduled_at).toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-SA' : 'en-US');
    const time = new Date(schedule.scheduled_at).toLocaleTimeString(document.documentElement.lang === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' });

    // Status Logic
    const isPending = schedule.status === 'pending';
    const statusLabel = isPending ? t('pos:status:pending', 'قيد الانتظار')
      : schedule.status === 'converted' ? t('pos:status:completed', 'مكتمل')
        : t('pos:status:cancelled', 'ملغي');
    const statusClass = `status-${schedule.status}`;

    return `
      <div class="schedule-card bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden group">
        
        <!-- Header -->
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2">
            <span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-mono px-2 py-1 rounded">
              ${sequenceNum}
            </span>
            <span class="schedule-status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400 font-medium">
             ${schedule.duration_minutes || 60} ${t('pos:unit:min', 'دقيقة')} ⏱️
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1">
          <h3 class="font-bold text-lg text-gray-900 dark:text-white mb-1">
            ${schedule.customerName || schedule.customer_id}
          </h3>
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-2">
            <span>📆 ${date}</span>
            <span class="w-1 h-1 bg-gray-300 rounded-full"></span>
            <span>⏰ ${time}</span>
          </div>
          
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm space-y-2">
            <div class="flex justify-between">
              <span class="text-gray-500">${t('pos:label:items', 'الأصناف')}</span>
              <span class="font-medium text-gray-900 dark:text-white">${lines.length || 0}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">${t('pos:label:total', 'الإجمالي')}</span>
              <span class="font-bold text-primary-600">${parseFloat(totals.due || 0).toFixed(2)}</span>
            </div>
            ${schedule.tableIds?.length ? `
            <div class="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
              <span class="text-gray-500">${t('pos:label:tables', 'الطاولات')}</span>
              <span class="font-medium text-gray-900 dark:text-white">${schedule.tableIds.join(', ')}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-2 mt-2">
          ${isPending ? `
            <button gkey="pos:schedules:open-order" data-schedule-id="${schedule.id}"
              class="col-span-1 px-3 py-2 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium flex items-center justify-center gap-2">
              <span>✏️</span> ${t('pos:action:edit', 'تعديل/فتح')}
            </button>
            <button gkey="pos:schedules:confirm" data-schedule-id="${schedule.id}"
              class="col-span-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2 shadow-sm shadow-green-600/20">
              <span>✅</span> ${t('pos:action:confirm', 'تأكيد')}
            </button>
          ` : `
            <button class="col-span-2 px-3 py-2 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center justify-center gap-2">
              <span>🖨️</span> ${t('pos:action:print', 'طباعة')}
            </button>
          `}
        </div>

      </div>
    `;
  },

  async setFilter(filter) {
    this.state.filter = filter;
    await this.loadSchedules({ status: filter === 'all' ? undefined : filter });
    this.renderModal();
  },

  getScheduleById(scheduleId) {
    return this.state.schedules.find(s => s.id === scheduleId) || null;
  },

  async editSchedule(scheduleId) {
    const btn = document.querySelector(`[gkey="pos:schedules:open-order"][data-schedule-id="${scheduleId}"]`);
    if (btn) {
      btn.click();
      return;
    }

    console.warn('[ScheduleModule] gkey handler missing for schedule edit:', scheduleId);
  },

  async handleConfirm(scheduleId) {
    try {
      await this.confirmSchedule(scheduleId);
      await this.loadSchedules({ status: this.state.filter });
      this.renderModal(); // Re-render to show updated status
    } catch (err) {
      console.error('Error confirming schedule', err);
    }
  },

  closeModal() {
    this.state.isModalOpen = false;
    const existing = document.querySelector('#reservations-modal');
    if (existing) existing.remove();
    // Reset to slow polling
    if (this.state.pollTimer) {
      clearTimeout(this.state.pollTimer);
      this.startPolling();
    }
  }
};

// Make globally available
window.ScheduleModule = ScheduleModule;
