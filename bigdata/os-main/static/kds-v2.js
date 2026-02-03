(async function() {
  'use strict';

  // ==================== State ====================
  const state = {
    connected: false,
    activeTab: 'all',
    sections: [],
    menuItems: [],
    jobHeaders: [],
    jobDetails: [],
    jobs: new Map(),
    lang: 'ar',
    posPayload: {}
  };

  // ==================== Helpers ====================
  function formatTime(ms) {
    if (!ms) return '00:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getTimeSinceCreated(createdAt) {
    if (!createdAt) return 0;
    const created = new Date(createdAt).getTime();
    return Date.now() - created;
  }

  function getTimeClass(ms) {
    if (ms > 20 * 60 * 1000) return 'danger';  // > 20 minutes
    if (ms > 10 * 60 * 1000) return 'warning'; // > 10 minutes
    return '';
  }

  const ensureArray = (value) => (Array.isArray(value) ? value : []);

  // ==================== Database Setup ====================
  console.log('[KDS v2] Waiting for database...');

  // Wait for window.__POS_DB__ to be available
  const waitForStore = () => {
    return new Promise((resolve) => {
      if (window.__POS_DB__) {
        resolve(window.__POS_DB__);
      } else {
        const checkInterval = setInterval(() => {
          if (window.__POS_DB__) {
            clearInterval(checkInterval);
            resolve(window.__POS_DB__);
          }
        }, 100);
      }
    });
  };

  const store = await waitForStore();
  console.log('[KDS v2] Store is ready:', store);

  // Make store accessible from console for debugging
  window.POS_DB = {
    store: {
      state: {
        modules: {
          pos: {
            tables: {}
          }
        }
      }
    }
  };

  // ==================== Data Watchers ====================

  // Watch pos_database for master data (menu_items, kitchen_sections, etc.)
  store.watch('pos_database', (rows) => {
    const latest = Array.isArray(rows) && rows.length ? rows[rows.length - 1] : null;
    const payload = (latest && latest.payload) || {};

    console.log('[KDS v2] pos_database updated:', {
      hasPayload: !!payload,
      keys: payload ? Object.keys(payload) : []
    });

    state.posPayload = payload;

    // Extract menu_items from payload
    const menuItems = ensureArray(
      payload.menu_items ||
      payload.menuItems ||
      payload.master?.menu_items ||
      payload.master?.menuItems
    );

    // Extract kitchen_sections from payload
    const kitchenSections = ensureArray(
      payload.kitchen_sections ||
      payload.kitchenSections ||
      payload.master?.kitchen_sections ||
      payload.master?.kitchenSections ||
      payload.master?.stations
    );

    console.log('[KDS v2] Extracted from payload:', {
      menuItems: menuItems.length,
      kitchenSections: kitchenSections.length,
      menuSample: menuItems[0],
      sectionSample: kitchenSections[0]
    });

    state.menuItems = menuItems;
    state.sections = kitchenSections;

    renderTabs();
    processOrders();
  });

  // Watch job order headers
  store.watch('job_order_header', (rows) => {
    const headers = ensureArray(rows);
    console.log('[KDS v2] job_order_header updated:', {
      count: headers.length,
      sample: headers[0]
    });
    state.jobHeaders = headers;
    window.POS_DB.store.state.modules.pos.tables.job_order_header = headers;
    processOrders();
  });

  // Watch job order details
  store.watch('job_order_detail', (rows) => {
    const details = ensureArray(rows);
    console.log('[KDS v2] job_order_detail updated:', {
      count: details.length,
      sample: details[0]
    });
    state.jobDetails = details;
    window.POS_DB.store.state.modules.pos.tables.job_order_detail = details;
    processOrders();
  });

  // Watch connection status
  store.status((status) => {
    console.log('[KDS v2] Connection status:', status);
    state.connected = status === 'connected';
    updateConnectionStatus();
  });

  // ==================== Order Processing ====================
  function processOrders() {
    if (!state.jobHeaders || !state.jobDetails) {
      console.log('[KDS v2] processOrders: Waiting for data...', {
        hasJobHeaders: !!state.jobHeaders,
        hasJobDetails: !!state.jobDetails
      });
      return;
    }

    console.log('[KDS v2] Processing orders:', {
      jobHeaders: state.jobHeaders.length,
      jobDetails: state.jobDetails.length,
      menuItems: state.menuItems.length,
      sections: state.sections.length
    });

    // Clear jobs
    state.jobs.clear();

    // Create index for menu items for fast lookup
    const itemsIndex = {};
    (state.menuItems || []).forEach(item => {
      const itemId = item.id || item.itemId || item.menuItemId;
      if (itemId) {
        itemsIndex[itemId] = item;
      }
    });

    console.log('[KDS v2] Menu items index:', {
      total: Object.keys(itemsIndex).length,
      sampleKeys: Object.keys(itemsIndex).slice(0, 5),
      sampleItem: Object.values(itemsIndex)[0]
    });

    // Process job_order_header and job_order_detail
    state.jobHeaders.forEach(header => {
      const jobOrderId = header.id;
      const orderId = header.orderId || header.order_id;
      const sectionId = header.stationId || header.station_id || header.sectionId;

      if (!jobOrderId || !sectionId) {
        console.log('[KDS v2] Skipping header - missing id or sectionId:', header);
        return;
      }

      // Skip if status is completed or ready (based on progressState)
      const progressState = header.progressState || header.progress_state;
      if (progressState === 'completed') {
        console.log('[KDS v2] Skipping completed job:', jobOrderId);
        return;
      }

      // Find all details for this job
      const jobItems = state.jobDetails.filter(detail => {
        const detailJobId = detail.jobOrderId || detail.job_order_id;
        return detailJobId === jobOrderId;
      });

      if (jobItems.length === 0) {
        console.log('[KDS v2] No items found for job:', jobOrderId);
        return;
      }

      // Create job
      const job = {
        id: jobOrderId,
        orderId: orderId,
        orderNumber: header.orderNumber || header.order_number || orderId,
        sectionId: sectionId,
        serviceMode: header.serviceMode || header.service_mode || 'dine_in',
        tableLabel: header.tableLabel || header.table_label || '',
        customerName: header.customerName || header.customer_name || '',
        status: header.status || 'queued',
        progressState: progressState,
        createdAt: header.createdAt || header.created_at || header.acceptedAt || header.accepted_at,
        items: [],
        totalItems: 0,
        completedItems: 0
      };

      // Add items to job
      jobItems.forEach(detail => {
        const itemId = detail.itemId || detail.item_id;
        const menuItem = itemsIndex[itemId];

        // Use names from detail or menu_item
        const nameAr = detail.itemNameAr || detail.item_name_ar ||
                       menuItem?.item_name?.ar || menuItem?.nameAr || menuItem?.name_ar || itemId;
        const nameEn = detail.itemNameEn || detail.item_name_en ||
                       menuItem?.item_name?.en || menuItem?.nameEn || menuItem?.name_en || itemId;

        const itemStatus = detail.status || 'queued';
        const quantity = detail.quantity || 1;

        job.items.push({
          id: detail.id,
          itemId: itemId,
          nameAr: nameAr,
          nameEn: nameEn,
          quantity: quantity,
          notes: detail.prepNotes || detail.prep_notes || detail.notes || '',
          status: itemStatus
        });

        job.totalItems += quantity;
        if (itemStatus === 'ready' || itemStatus === 'completed' || itemStatus === 'done') {
          job.completedItems += quantity;
        }
      });

      // Update job status based on items
      if (job.completedItems >= job.totalItems && job.totalItems > 0) {
        job.status = 'ready';
      } else if (job.completedItems > 0) {
        job.status = 'cooking';
      } else if (job.status !== 'cooking' && job.status !== 'ready') {
        job.status = 'queued';
      }

      state.jobs.set(jobOrderId, job);
    });

    console.log('[KDS v2] Processed jobs:', {
      total: state.jobs.size,
      jobs: Array.from(state.jobs.values()).map(j => ({
        id: j.id,
        orderId: j.orderId,
        status: j.status,
        progressState: j.progressState,
        items: j.items.length
      }))
    });

    renderTabs();
    renderOrders();
  }

  // ==================== UI Rendering ====================

  function updateConnectionStatus() {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (state.connected) {
      indicator.classList.add('connected');
      text.textContent = 'متصل';
    } else {
      indicator.classList.remove('connected');
      text.textContent = 'غير متصل';
    }
  }

  function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    const tabs = [
      { id: 'all', nameAr: 'الكل', count: state.jobs.size }
    ];

    // Add section tabs
    state.sections.forEach(section => {
      const sectionId = section.id || section.sectionId || section.stationId;
      const count = Array.from(state.jobs.values())
        .filter(job => job.sectionId === sectionId && job.status !== 'ready')
        .length;

      tabs.push({
        id: sectionId,
        nameAr: section.nameAr || section.name_ar || section.section_name?.ar ||
                section.nameEn || section.name_en || section.section_name?.en ||
                sectionId,
        count: count
      });
    });

    container.innerHTML = tabs.map(tab => `
      <button
        class="tab ${state.activeTab === tab.id ? 'active' : ''}"
        onclick="window.switchTab('${tab.id}')"
      >
        ${tab.count > 0 ? `<span class="tab-badge">${tab.count}</span>` : ''}
        ${tab.nameAr}
      </button>
    `).join('');
  }

  function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    // Filter jobs based on active tab
    let filteredJobs = Array.from(state.jobs.values());

    if (state.activeTab !== 'all') {
      filteredJobs = filteredJobs.filter(job => job.sectionId === state.activeTab);
    }

    // Filter out completed jobs
    filteredJobs = filteredJobs.filter(job => job.status !== 'completed');

    // Sort by created time
    filteredJobs.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    if (filteredJobs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🍽️</div>
          <div class="empty-state-text">لا توجد طلبات حالياً</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredJobs.map(job => renderOrderCard(job)).join('');
  }

  function renderOrderCard(job) {
    const timeSince = getTimeSinceCreated(job.createdAt);
    const timeClass = getTimeClass(timeSince);
    const section = state.sections.find(s => {
      const sId = s.id || s.sectionId || s.stationId;
      return sId === job.sectionId;
    });
    const sectionName = section ?
      (section.nameAr || section.name_ar || section.section_name?.ar ||
       section.nameEn || section.name_en || section.section_name?.en) :
      job.sectionId;

    return `
      <div class="order-card ${timeSince > 20 * 60 * 1000 ? 'urgent' : ''}">
        <div class="order-header">
          <div>
            <div class="order-number">${job.orderNumber}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              ${sectionName}
            </div>
          </div>
          <div class="order-time ${timeClass}">
            ⏱️ ${formatTime(timeSince)}
          </div>
        </div>

        <div class="order-items">
          ${job.items.map(item => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${state.lang === 'ar' ? item.nameAr : item.nameEn}
                </div>
                <div class="item-quantity">× ${item.quantity}</div>
              </div>
              ${item.notes ? `<div class="item-notes">📝 ${item.notes}</div>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          ${renderActionButtons(job)}
        </div>
      </div>
    `;
  }

  function renderActionButtons(job) {
    if (job.status === 'queued') {
      return `
        <button class="btn btn-start" onclick="window.startJob('${job.id}')">
          🔥 بدء التجهيز
        </button>
      `;
    }

    if (job.status === 'cooking') {
      return `
        <button class="btn btn-ready" onclick="window.markJobReady('${job.id}')">
          ✅ تم التجهيز
        </button>
      `;
    }

    if (job.status === 'ready') {
      return `
        <button class="btn btn-bump" onclick="window.bumpJob('${job.id}')">
          📦 تم التجميع
        </button>
      `;
    }

    return '';
  }

  // ==================== Actions ====================

  window.switchTab = function(tabId) {
    state.activeTab = tabId;
    renderTabs();
    renderOrders();
  };

  window.startJob = async function(jobId) {
    console.log('[KDS v2] Starting job:', jobId);
    const job = state.jobs.get(jobId);
    if (!job) return;

    // Update job header status
    try {
      await store.update('job_order_header', {
        id: jobId,
        status: 'cooking',
        startedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[KDS v2] Error updating job header:', err);
    }

    // Update all items in this job to 'cooking' status
    for (const item of job.items) {
      try {
        await store.update('job_order_detail', {
          id: item.id,
          status: 'cooking',
          startAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('[KDS v2] Error updating detail:', err);
      }
    }
  };

  window.markJobReady = async function(jobId) {
    console.log('[KDS v2] Marking job ready:', jobId);
    const job = state.jobs.get(jobId);
    if (!job) return;

    // Update job header status
    try {
      await store.update('job_order_header', {
        id: jobId,
        status: 'ready',
        readyAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[KDS v2] Error updating job header:', err);
    }

    // Update all items in this job to 'ready' status
    for (const item of job.items) {
      try {
        await store.update('job_order_detail', {
          id: item.id,
          status: 'ready',
          finishAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('[KDS v2] Error updating detail:', err);
      }
    }
  };

  window.bumpJob = async function(jobId) {
    console.log('[KDS v2] Bumping job:', jobId);
    const job = state.jobs.get(jobId);
    if (!job) return;

    // Update job header status
    try {
      await store.update('job_order_header', {
        id: jobId,
        status: 'completed',
        progressState: 'completed',
        completedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[KDS v2] Error updating job header:', err);
    }

    // Update all items in this job to 'completed' status
    for (const item of job.items) {
      try {
        await store.update('job_order_detail', {
          id: item.id,
          status: 'completed'
        });
      } catch (err) {
        console.error('[KDS v2] Error updating detail:', err);
      }
    }
  };

  // ==================== Initialize ====================

  // Auto-refresh timer
  setInterval(() => {
    renderOrders();
  }, 1000);

  console.log('[KDS v2] Initialization complete');
})();
