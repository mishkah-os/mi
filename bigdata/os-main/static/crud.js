/**
 * Mishkah Dynamic CRUD UI Logic
 * Full dynamic testing interface for schema-driven CRUD
 */

(function() {
  'use strict';

  // ==================== STATE ====================

  let crud = null;
  let store = null;
  let currentTable = null;
  let currentData = null;
  let isDirty = false;
  let availableBranches = [];
  let availableModules = [];
  let sqlEditor = null;
  let sqlSchema = null;
  let sqlAutocompleteTokens = [];
  let sqlContextMenu = null;
  let sqlLayoutController = null;
  let sqlResizeSetupDone = false;
  let activePanel = 'crud';
  let chromeResizeFrame = null;
  let chromeObserver = null;

  // ==================== HELPERS ====================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  function showLoading() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p style="margin-top: 16px;">جاري التحميل...</p>
      </div>
    `;
  }

  function showError(error) {
    const content = document.getElementById('contentArea');
    content.innerHTML = `
      <div class="empty-state">
        <h3 style="color: #ef4444;">❌ خطأ</h3>
        <p>${error.message || error}</p>
      </div>
    `;
  }

  function normalizeBranchEntry(branch) {
    if (typeof branch === 'string') {
      return { id: branch, label: branch, modules: [] };
    }

    if (!branch || typeof branch !== 'object') {
      return { id: '', label: '', modules: [] };
    }

    const id = branch.id || branch.branchId || branch.code || branch.name || '';
    const label = branch.name || branch.label || id;
    const modules = Array.isArray(branch.modules)
      ? branch.modules.map(normalizeModuleEntry).filter(Boolean)
      : [];

    return { ...branch, id, label, modules };
  }

  function normalizeModuleEntry(module) {
    if (typeof module === 'string') {
      return { id: module, label: module };
    }

    if (!module || typeof module !== 'object') {
      return null;
    }

    const id = module.moduleId || module.id || module.code || module.name || '';
    const label = module.name || module.label || id;
    if (!id) return null;
    return { ...module, id, label };
  }

  function setActivePanel(panel) {
    if (!panel || activePanel === panel) return;
    activePanel = panel;

    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === panel);
    });

    document.querySelectorAll('.view-panel').forEach(section => {
      section.classList.toggle('active', section.dataset.panel === panel);
    });

    if (panel === 'sqlite') {
      requestAnimationFrame(() => {
        setupSqlResizer();
        if (typeof sqlLayoutController?.clamp === 'function') {
          sqlLayoutController.clamp();
        }
        if (sqlEditor && typeof sqlEditor.refresh === 'function') {
          sqlEditor.refresh();
        }
      });
    }
  }

  function updateChromeHeight() {
    if (chromeResizeFrame) {
      cancelAnimationFrame(chromeResizeFrame);
    }

    chromeResizeFrame = requestAnimationFrame(() => {
      const header = document.querySelector('.header');
      const tabsRow = document.querySelector('.tabs-row');
      const headerHeight = header?.offsetHeight || 0;
      const tabsHeight = tabsRow?.offsetHeight || 0;
      const total = headerHeight + tabsHeight || 120;
      document.documentElement.style.setProperty('--app-chrome-offset', `${total}px`);
    });
  }

  function startChromeWatcher() {
    updateChromeHeight();
    setTimeout(updateChromeHeight, 250);

    if (typeof ResizeObserver !== 'undefined' && !chromeObserver) {
      const header = document.querySelector('.header');
      const tabsRow = document.querySelector('.tabs-row');
      if (header || tabsRow) {
        chromeObserver = new ResizeObserver(() => updateChromeHeight());
        [header, tabsRow].forEach(node => node && chromeObserver.observe(node));
      }
    }

    window.addEventListener('resize', updateChromeHeight);
  }

  function quoteIdentifier(name) {
    if (!name && name !== 0) return '';
    return `"${String(name).replace(/"/g, '""')}"`;
  }

  // ==================== CONNECTION ====================

  async function connect() {
    const branchId = document.getElementById('branchId').value.trim();
    const moduleId = document.getElementById('moduleId').value.trim();
    const btn = document.getElementById('connectBtn');
    const status = document.getElementById('statusIndicator');

    if (!branchId || !moduleId) {
      showToast('يرجى إدخال Branch ID و Module ID', 'error');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = '⏳ جاري الاتصال...';
      status.className = 'status disconnected';

      // Create CRUD instance
      crud = window.createCRUD({ branchId, moduleId });

      // Connect to store
      store = await crud.connect();

      // Update UI
      btn.textContent = '✅ متصل';
      btn.disabled = false;
      status.className = 'status connected';
      status.innerHTML = '<span class="status-dot"></span><span>متصل</span>';

      showToast(`تم الاتصال بنجاح: ${branchId}/${moduleId}`, 'success');

      // Load tables list
      await loadTablesList();

    } catch (error) {
      console.error('Connection error:', error);
      btn.textContent = '🔌 اتصال';
      btn.disabled = false;
      status.className = 'status disconnected';
      status.innerHTML = '<span class="status-dot"></span><span>غير متصل</span>';
      showToast(`فشل الاتصال: ${error.message}`, 'error');
    }
  }

  // ==================== TABLES LIST ====================

  async function loadTablesList() {
    const list = document.getElementById('tablesList');
    list.innerHTML = '<li class="table-item">⏳ جاري التحميل...</li>';

    try {
      // Wait for store to be ready
      await store.ready();

      // Get tables from store snapshot
      const snapshot = store.snapshot();

      if (!snapshot || !snapshot.tables) {
        list.innerHTML = '<li style="padding: 10px; color: #6b7280; font-size: 13px;">لا توجد بيانات بعد</li>';
        return;
      }

      const tables = Object.keys(snapshot.tables || {});

      if (tables.length === 0) {
        list.innerHTML = '<li style="padding: 10px; color: #6b7280; font-size: 13px;">لا توجد جداول</li>';
        return;
      }

      // Render tables
      list.innerHTML = '';
      tables.forEach(tableName => {
        const li = document.createElement('li');
        li.className = 'table-item';
        li.textContent = tableName;
        li.onclick = () => loadTable(tableName);
        list.appendChild(li);
      });

    } catch (error) {
      console.error('Failed to load tables:', error);
      list.innerHTML = '<li style="padding: 10px; color: #ef4444; font-size: 13px;">فشل التحميل</li>';
    }
  }

  // ==================== LOAD TABLE ====================

  async function loadTable(tableName) {
    if (!crud || !store) {
      showToast('غير متصل بالخادم', 'error');
      return;
    }

    // Check if dirty
    if (isDirty) {
      if (!confirm('هناك تغييرات غير محفوظة. هل تريد المتابعة؟')) {
        return;
      }
      isDirty = false;
    }

    currentTable = tableName;

    // Update active state
    document.querySelectorAll('.table-item').forEach(item => {
      item.classList.toggle('active', item.textContent === tableName);
    });

    showLoading();

    try {
      // Get data
      const result = await crud.getData(tableName, {
        top: 100,
        page: 1,
        populate: true
      });

      currentData = result;
      isDirty = false;

      // Render table
      renderTable(result);

    } catch (error) {
      console.error('Failed to load table:', error);
      showError(error);
      showToast(`فشل تحميل الجدول: ${error.message}`, 'error');
    }
  }

  // ==================== RENDER TABLE ====================

  function renderTable(data) {
    const content = document.getElementById('contentArea');

    if (!data || !data.data || data.data.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <h3>${data.name}</h3>
          <p>لا توجد بيانات</p>
        </div>
      `;
      return;
    }

    // Build table HTML
    const columns = data.columns || [];
    const records = data.data || [];

    let html = `
      <div class="toolbar">
        <h2>📊 ${data.name}</h2>
        <div class="actions">
          <button class="btn" onclick="reloadTable()">🔄 تحديث</button>
          <button class="btn" onclick="saveSeeds()" style="background: #f59e0b; color: white; border-color: #f59e0b;">🌱 حفظ البذور</button>
          <button class="btn btn-primary" onclick="addRow()">➕ إضافة صف</button>
          <button class="btn btn-success" onclick="saveChanges()" ${!isDirty ? 'disabled' : ''}>💾 حفظ التغييرات</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
    `;

    // Column headers
    columns.forEach(col => {
      html += `<th>${col.trans_name || col.name}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Data rows
    records.forEach((record, rowIndex) => {
      html += '<tr>';

      columns.forEach(col => {
        const value = record[col.name];
        const cellId = `cell-${rowIndex}-${col.name}`;

        html += '<td>';

        // Read-only ID fields (primary keys)
        if (col.name.toLowerCase() === 'id' || col.primaryKey) {
          html += `
            <input type="text"
              id="${cellId}"
              value="${escapeHtml(String(value || ''))}"
              readonly
              style="background: #f3f4f6; cursor: not-allowed; font-family: monospace; font-size: 12px;">
          `;
        }
        // Foreign Key fields
        else if (col.isreferences) {
          const fkValue = typeof value === 'object' && value !== null ? value.value || value.id : value;
          const fkId = typeof value === 'object' && value !== null ? value.id : value;

          html += `
            <div class="fk-field">
              <input type="text"
                class="fk-value"
                id="${cellId}"
                value="${escapeHtml(fkValue || '')}"
                onchange="markDirty(${rowIndex}, '${col.name}', this.value, true)"
                placeholder="${col.trans_name || col.name}"
                style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
              <span class="fk-badge" style="padding: 4px 10px; background: #dbeafe; color: #1e40af; border-radius: 6px; font-size: 11px; font-weight: 600;">${escapeHtml(String(fkId || ''))}</span>
            </div>
          `;
        }
        // Date fields
        else if (col.type.toLowerCase().includes('date') && !col.type.toLowerCase().includes('time')) {
          const dateValue = value ? new Date(value).toISOString().slice(0, 10) : '';
          html += `
            <input type="date"
              id="${cellId}"
              value="${dateValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }
        // DateTime fields
        else if (col.type.toLowerCase().includes('datetime') || col.type.toLowerCase().includes('timestamp')) {
          const dateValue = value ? new Date(value).toISOString().slice(0, 16) : '';
          html += `
            <input type="datetime-local"
              id="${cellId}"
              value="${dateValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }
        // Time fields
        else if (col.type.toLowerCase().includes('time')) {
          const timeValue = value || '';
          html += `
            <input type="time"
              id="${cellId}"
              value="${timeValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }
        // Boolean/Checkbox fields
        else if (col.type.toLowerCase().includes('bool') || col.type.toLowerCase().includes('bit')) {
          const checked = value === 1 || value === true || value === 'true' || value === '1';
          html += `
            <label style="display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <input type="checkbox"
                id="${cellId}"
                ${checked ? 'checked' : ''}
                onchange="markDirty(${rowIndex}, '${col.name}', this.checked ? 1 : 0)"
                style="width: 20px; height: 20px; cursor: pointer;">
            </label>
          `;
        }
        // Integer/Number fields
        else if (col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('integer')) {
          html += `
            <input type="number"
              id="${cellId}"
              value="${value || 0}"
              step="1"
              onchange="markDirty(${rowIndex}, '${col.name}', parseInt(this.value) || 0)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%; text-align: right;">
          `;
        }
        // Decimal/Float fields
        else if (col.type.toLowerCase().includes('decimal') || col.type.toLowerCase().includes('float') || col.type.toLowerCase().includes('double')) {
          html += `
            <input type="number"
              id="${cellId}"
              value="${value || 0}"
              step="0.01"
              onchange="markDirty(${rowIndex}, '${col.name}', parseFloat(this.value) || 0)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%; text-align: right;">
          `;
        }
        // Long text fields (description, notes, etc.)
        else if (
          col.name.toLowerCase().includes('description') ||
          col.name.toLowerCase().includes('notes') ||
          col.name.toLowerCase().includes('comment') ||
          col.name.toLowerCase().includes('details') ||
          (typeof value === 'string' && value.length > 100)
        ) {
          html += `
            <textarea
              id="${cellId}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              rows="2"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%; resize: vertical; font-family: inherit;">${escapeHtml(String(value || ''))}</textarea>
          `;
        }
        // Regular text fields
        else {
          html += `
            <input type="text"
              id="${cellId}"
              value="${escapeHtml(String(value || ''))}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              placeholder="${col.trans_name || col.name}"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }

        html += '</td>';
      });

      html += '</tr>';
    });

    html += `
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button onclick="prevPage()" disabled>السابق</button>
        <span>صفحة ${data.page || 1} - إجمالي: ${data.count || 0} سجل</span>
        <button onclick="nextPage()" disabled>التالي</button>
      </div>
    `;

    content.innerHTML = html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== EDIT HANDLING ====================

  window.markDirty = function(rowIndex, fieldName, value, isFk = false) {
    if (!currentData || !currentData.data[rowIndex]) return;

    const record = currentData.data[rowIndex];

    if (isFk) {
      // FK field: update value but keep id
      if (typeof record[fieldName] === 'object' && record[fieldName] !== null) {
        record[fieldName].value = value;
      } else {
        record[fieldName] = { value, id: value };
      }
    } else {
      record[fieldName] = value;
    }

    isDirty = true;

    // Enable save button
    const saveBtn = document.querySelector('.btn-success');
    if (saveBtn) saveBtn.disabled = false;
  };

  // ==================== ACTIONS ====================

  window.reloadTable = async function() {
    if (currentTable) {
      await loadTable(currentTable);
    }
  };

  window.addRow = function() {
    if (!currentData || !currentData.columns) {
      showToast('لا يمكن إضافة صف', 'error');
      return;
    }

    // Create empty row based on columns
    const newRow = {};
    currentData.columns.forEach(col => {
      if (col.name.toLowerCase() === 'id') {
        newRow[col.name] = `new-${Date.now()}`;
      } else if (col.isreferences) {
        newRow[col.name] = { value: '', id: '' };
      } else if (col.type.includes('int') || col.type.includes('decimal')) {
        newRow[col.name] = 0;
      } else if (col.type.includes('datetime')) {
        newRow[col.name] = new Date().toISOString();
      } else {
        newRow[col.name] = '';
      }
    });

    currentData.data.push(newRow);
    isDirty = true;

    renderTable(currentData);
    showToast('تم إضافة صف جديد', 'success');
  };

  window.saveChanges = async function() {
    if (!crud || !currentData || !isDirty) {
      return;
    }

    try {
      showToast('جاري الحفظ...', 'info');

      const result = await crud.save(currentTable, currentData);

      if (result.success) {
        showToast(`تم الحفظ بنجاح: ${result.saved} سجل`, 'success');
        isDirty = false;
        await reloadTable();
      } else {
        showToast(`تم الحفظ جزئياً: ${result.saved} نجح، ${result.errors} فشل`, 'error');
        console.error('Save errors:', result.errorDetails);
      }

    } catch (error) {
      console.error('Save error:', error);
      showToast(`فشل الحفظ: ${error.message}`, 'error');
    }
  };

  window.prevPage = function() {
    // TODO: Implement pagination
    showToast('قيد التطوير', 'info');
  };

  window.nextPage = function() {
    // TODO: Implement pagination
    showToast('قيد التطوير', 'info');
  };

  // ==================== BRANCHES & MODULES ====================

  async function loadBranches() {
    try {
      const response = await fetch('/api/branches');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      const select = document.getElementById('branchId');
      select.innerHTML = '<option value="">-- اختر الفرع --</option>';

      if (Array.isArray(data.branches)) {
        availableBranches = data.branches.map(normalizeBranchEntry).filter(b => b.id);

        availableBranches.forEach(branch => {
          const option = document.createElement('option');
          option.value = branch.id;
          option.textContent = branch.label || branch.id;
          select.appendChild(option);
        });
      } else {
        availableBranches = [];
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
      showToast('فشل تحميل الفروع', 'error');
    }
  }

  async function loadModules(branchId) {
    const select = document.getElementById('moduleId');
    select.innerHTML = '<option value="">-- اختر الموديول --</option>';
    document.getElementById('connectBtn').disabled = true;

    if (!branchId) {
      availableModules = [];
      return;
    }

    const branch = availableBranches.find(entry => entry.id === branchId);
    if (branch && Array.isArray(branch.modules) && branch.modules.length > 0) {
      availableModules = branch.modules;
      branch.modules.forEach(module => {
        const option = document.createElement('option');
        option.value = module.id;
        option.textContent = module.label || module.id;
        if (module.version) {
          option.textContent += ` (v${module.version})`;
        }
        select.appendChild(option);
      });
      return;
    }

    try {
      const response = await fetch(`/api/branches/${encodeURIComponent(branchId)}/modules`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      if (Array.isArray(data.modules)) {
        availableModules = data.modules.map(normalizeModuleEntry).filter(Boolean);
        if (availableModules.length === 0) {
          select.innerHTML = '<option value="">لا توجد موديولات</option>';
          return;
        }

        availableModules.forEach(module => {
          const option = document.createElement('option');
          option.value = module.id;
          option.textContent = module.label || module.id;
          select.appendChild(option);
        });
      } else {
        select.innerHTML = '<option value="">لا توجد موديولات</option>';
        availableModules = [];
      }
    } catch (error) {
      console.error('Failed to load modules:', error);
      showToast('فشل تحميل الموديولات', 'error');
    }
  }

  // ==================== SAVE SEEDS ====================

  window.saveSeeds = async function() {
    if (!crud || !store) {
      showToast('غير متصل بالخادم', 'error');
      return;
    }

    // Show table selection dialog
    const snapshot = store.snapshot();
    if (!snapshot || !snapshot.tables) {
      showToast('لا توجد بيانات لحفظها', 'error');
      return;
    }

    const tables = Object.keys(snapshot.tables || {});
    if (tables.length === 0) {
      showToast('لا توجد جداول', 'error');
      return;
    }

    // Create dialog for table selection
    const selectedTables = await showTableSelectionDialog(tables);

    if (!selectedTables || selectedTables.length === 0) {
      return;
    }

    try {
      showToast('جاري حفظ البذور...', 'info');

      const seeds = {};

      for (const tableName of selectedTables) {
        const tableData = snapshot.tables[tableName];
        if (tableData) {
          seeds[tableName] = Object.values(tableData);
        }
      }

      const branchId = document.getElementById('branchId').value;
      const moduleId = document.getElementById('moduleId').value;

      const response = await fetch('/api/seeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          branchId,
          moduleId,
          seeds
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast(`✅ تم حفظ البذور: ${result.recordCount} سجل من ${result.tables.length} جدول`, 'success');
      } else {
        showToast('فشل حفظ البذور', 'error');
      }

    } catch (error) {
      console.error('Save seeds error:', error);
      showToast(`فشل حفظ البذور: ${error.message}`, 'error');
    }
  };

  async function showTableSelectionDialog(tables) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 16px; color: #111827; font-size: 18px;">اختر الجداول لحفظ البذور</h3>
        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; background: #f9fafb; margin-bottom: 8px;">
            <input type="checkbox" id="selectAll" style="width: 18px; height: 18px;">
            <span style="font-weight: 600;">تحديد الكل</span>
          </label>
        </div>
        <div id="tableList" style="margin-bottom: 20px; max-height: 400px; overflow-y: auto;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancelBtn" style="padding: 10px 20px; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; font-weight: 500;">إلغاء</button>
          <button id="confirmBtn" style="padding: 10px 20px; border: none; border-radius: 6px; background: #667eea; color: white; cursor: pointer; font-weight: 500;">حفظ البذور</button>
        </div>
      `;

      const tableList = dialog.querySelector('#tableList');
      tables.forEach(tableName => {
        const label = document.createElement('label');
        label.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.2s;
        `;
        label.onmouseover = () => label.style.background = '#f3f4f6';
        label.onmouseout = () => label.style.background = 'transparent';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tableName;
        checkbox.className = 'table-checkbox';
        checkbox.style.cssText = 'width: 16px; height: 16px;';

        const span = document.createElement('span');
        span.textContent = tableName;
        span.style.fontSize = '14px';

        label.appendChild(checkbox);
        label.appendChild(span);
        tableList.appendChild(label);
      });

      // Select all functionality
      const selectAll = dialog.querySelector('#selectAll');
      selectAll.onchange = () => {
        const checkboxes = dialog.querySelectorAll('.table-checkbox');
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
      };

      dialog.querySelector('#cancelBtn').onclick = () => {
        overlay.remove();
        resolve(null);
      };

      dialog.querySelector('#confirmBtn').onclick = () => {
        const checkboxes = dialog.querySelectorAll('.table-checkbox:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        overlay.remove();
        resolve(selected);
      };

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      };
    });
  }

  // ==================== SQL ADMIN ====================

  async function fetchSqlSchema(showToastMessage = false) {
    const buttons = [document.getElementById('refreshSchemaBtn'), document.getElementById('refreshAutocompleteBtn')];
    buttons.forEach(btn => {
      if (!btn) return;
      btn.disabled = true;
      if (!btn.dataset.originalLabel) {
        btn.dataset.originalLabel = btn.textContent;
      }
      btn.textContent = '⏳ جاري التحديث...';
    });

    try {
      const response = await fetch('/api/schema/database');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const schema = await response.json();
      sqlSchema = schema;
      updateSqlObjectsTree(schema);
      buildSqlAutocompleteTokens(schema);
      if (showToastMessage) {
        showToast('تم تحديث المخطط والإكمال التلقائي', 'success');
      }
    } catch (error) {
      console.error('Failed to load SQL schema:', error);
      showToast('فشل تحميل معلومات SQLite', 'error');
      const tree = document.getElementById('sqlObjectsTree');
      if (tree) {
        tree.innerHTML = '<li class="sql-placeholder">تعذر تحميل عناصر قاعدة البيانات</li>';
      }
    } finally {
      buttons.forEach(btn => {
        if (!btn) return;
        btn.disabled = false;
        btn.textContent = btn.dataset.originalLabel || btn.textContent;
      });
    }
  }

  function updateSqlObjectsTree(schema) {
    const tree = document.getElementById('sqlObjectsTree');
    if (!tree) return;

    const groups = [
      { key: 'table', label: 'الجداول', icon: '📁', items: [] },
      { key: 'view', label: 'العروض (Views)', icon: '🪟', items: [] },
      { key: 'trigger', label: 'المحفزات (Triggers)', icon: '⚡', items: [] },
      { key: 'index', label: 'الفهارس', icon: '🧭', items: [] },
      { key: 'function', label: 'الدوال', icon: '∑', items: [] },
      { key: 'procedure', label: 'الإجراءات', icon: '🧠', items: [] }
    ];

    const tables = Array.isArray(schema?.tables) ? schema.tables : [];
    groups[0].items = tables.filter(item => (item.type || '').toLowerCase() === 'table');
    groups[1].items = tables.filter(item => (item.type || '').toLowerCase() === 'view');
    groups[2].items = Array.isArray(schema?.triggers) ? schema.triggers : [];
    groups[3].items = Array.isArray(schema?.indexes) ? schema.indexes : [];
    groups[4].items = Array.isArray(schema?.functions) ? schema.functions : [];
    groups[5].items = Array.isArray(schema?.procedures) ? schema.procedures : [];

    tree.innerHTML = '';
    let hasItems = false;

    groups.forEach(group => {
      if (!group.items || group.items.length === 0) {
        return;
      }

      hasItems = true;
      const wrapper = document.createElement('li');
      wrapper.className = 'sql-tree-group';

      const heading = document.createElement('h4');
      heading.textContent = `${group.icon} ${group.label}`;
      wrapper.appendChild(heading);

      const list = document.createElement('ul');
      list.className = 'sql-tree-items';

      group.items.forEach(item => {
        if (!item || !item.name) return;
        const entry = document.createElement('li');
        entry.className = 'sql-tree-item';
        const label = document.createElement('span');
        label.textContent = `${group.icon} ${item.name}`;
        entry.appendChild(label);

        if (item.tableName || item.tbl_name) {
          const hint = document.createElement('small');
          hint.textContent = item.tableName || item.tbl_name;
          entry.appendChild(hint);
        }

        entry.addEventListener('contextmenu', (event) => handleSqlObjectContextMenu(event, item, group.key));
        entry.addEventListener('dblclick', () => showSqlCreateStatement(item));
        list.appendChild(entry);
      });

      wrapper.appendChild(list);
      tree.appendChild(wrapper);
    });

    if (!hasItems) {
      tree.innerHTML = '<li class="sql-placeholder">لا توجد كائنات مسجلة في قاعدة البيانات</li>';
    }
  }

  function buildSqlAutocompleteTokens(schema) {
    const tokens = new Set([
      'SELECT',
      'FROM',
      'WHERE',
      'LIMIT',
      'OFFSET',
      'ORDER',
      'BY',
      'GROUP',
      'HAVING',
      'JOIN',
      'LEFT',
      'RIGHT',
      'INNER',
      'OUTER',
      'AND',
      'OR',
      'NOT',
      'IN',
      'BETWEEN'
    ]);

    const columnsByTable = schema?.columnsByTable || {};
    const addColumns = (tableName, columns) => {
      if (!columns) return;
      columns.forEach(column => {
        if (!column) return;
        if (typeof column === 'string') {
          tokens.add(column);
          tokens.add(`${tableName}.${column}`);
          return;
        }
        if (column.name) {
          tokens.add(column.name);
          tokens.add(`${tableName}.${column.name}`);
        }
      });
    };

    (schema?.tables || []).forEach(entry => {
      if (!entry || !entry.name) return;
      tokens.add(entry.name);
      addColumns(entry.name, entry.columns || columnsByTable[entry.name]);
    });

    Object.entries(columnsByTable).forEach(([tableName, columns]) => {
      tokens.add(tableName);
      addColumns(tableName, columns);
    });

    sqlAutocompleteTokens = Array.from(tokens)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  function initializeSqlAdmin() {
    const textarea = document.getElementById('sqlEditor');
    if (!textarea || typeof window.CodeMirror === 'undefined') {
      console.warn('CodeMirror not available for SQL admin');
      return;
    }

    sqlContextMenu = document.getElementById('sqlContextMenu');
    if (sqlContextMenu) {
      sqlContextMenu.addEventListener('click', (event) => event.stopPropagation());
    }

    sqlEditor = CodeMirror.fromTextArea(textarea, {
      mode: 'text/x-sql',
      lineNumbers: true,
      theme: 'material',
      lineWrapping: true,
      extraKeys: {
        'Ctrl-Space': (cm) => triggerSqlAutocomplete(cm),
        'Cmd-Space': (cm) => triggerSqlAutocomplete(cm),
        'Ctrl-Enter': () => runSqlQuery(),
        'Cmd-Enter': () => runSqlQuery()
      }
    });

    sqlEditor.on('keyup', (cm, event) => {
      if (!cm.state.completionActive && /^[A-Za-z_.]$/.test(event.key)) {
        triggerSqlAutocomplete(cm);
      }
    });

    const runBtn = document.getElementById('runSqlBtn');
    if (runBtn) {
      runBtn.onclick = runSqlQuery;
    }

    document.addEventListener('click', hideSqlContextMenu);

    fetchSqlSchema();
    setupSqlResizer();
  }

  function triggerSqlAutocomplete(editor) {
    if (!editor || typeof window.CodeMirror === 'undefined') return;
    if (!sqlAutocompleteTokens.length) return;
    window.CodeMirror.showHint(editor, provideSqlHints, { completeSingle: false });
  }

  function provideSqlHints(cm) {
    const cursor = cm.getCursor();
    const token = cm.getTokenAt(cursor);
    const start = token.start;
    const end = token.end;
    const current = token.string?.slice(0, cursor.ch - start) || '';
    const normalized = current.trim().toLowerCase();

    const list = sqlAutocompleteTokens.filter(entry =>
      !normalized || entry.toLowerCase().startsWith(normalized)
    );

    return {
      list,
      from: window.CodeMirror.Pos(cursor.line, start),
      to: window.CodeMirror.Pos(cursor.line, end)
    };
  }

  async function runSqlQuery() {
    if (!sqlEditor) return;
    const sql = sqlEditor.getValue().trim();
    if (!sql) {
      showToast('أدخل استعلام SQL أولاً', 'error');
      return;
    }

    const results = document.getElementById('sqlResults');
    if (results) {
      results.innerHTML = '<div class="sql-placeholder">⏳ جاري تنفيذ الاستعلام...</div>';
    }

    const runBtn = document.getElementById('runSqlBtn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = '⏳ جاري التنفيذ...';
    }

    try {
      const branchId = document.getElementById('branchId').value || null;
      const moduleId = document.getElementById('moduleId').value || null;
      const response = await fetch('/api/query/raw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql, branchId, moduleId })
      });

      const payload = await response.json().catch(() => ({ rows: [] }));
      if (!response.ok) {
        throw new Error(payload.error || 'فشل تنفيذ الاستعلام');
      }

      renderSqlResults(payload);
      showToast('تم تنفيذ الاستعلام بنجاح', 'success');
    } catch (error) {
      console.error('SQL execution failed:', error);
      showSqlError(error.message || 'تعذر تنفيذ الاستعلام');
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = '▶️ تنفيذ الاستعلام (Ctrl + Enter)';
      }
    }
  }

  function renderSqlResults(result) {
    const container = document.getElementById('sqlResults');
    if (!container) return;

    const rows = Array.isArray(result?.rows) ? result.rows : [];
    if (rows.length === 0) {
      container.innerHTML = '<div class="sql-placeholder"><strong>لا توجد نتائج</strong><span>تحقق من شروط الاستعلام أو قم بإزالة محدد LIMIT.</span></div>';
      return;
    }

    const columns = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row || {}).forEach(key => set.add(key));
        return set;
      }, new Set())
    );

    const metaParts = [];
    if (result?.meta?.count != null) {
      metaParts.push(`عدد السجلات: ${result.meta.count}`);
    }
    if (result?.meta?.queryTime != null) {
      metaParts.push(`الزمن: ${result.meta.queryTime}ms`);
    }
    if (result?.meta?.source) {
      const sourceLabel = result.meta.source === 'module-store'
        ? 'لقطة الموديول'
        : result.meta.source;
      metaParts.push(`المصدر: ${sourceLabel}`);
    }

    let html = '';
    if (metaParts.length) {
      html += `<div class="sql-meta">${metaParts.join(' • ')}</div>`;
    }

    html += '<div class="table-container"><table><thead><tr>';
    columns.forEach(col => {
      html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
      html += '<tr>';
      columns.forEach(col => {
        html += `<td>${formatSqlValue(row[col])}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function formatSqlValue(value) {
    if (value === null || value === undefined) {
      return '<span style="color:#9ca3af">NULL</span>';
    }
    if (typeof value === 'object') {
      return `<pre style="margin:0; white-space:pre-wrap;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }
    return escapeHtml(String(value));
  }

  function showSqlError(message) {
    const container = document.getElementById('sqlResults');
    if (!container) return;
    container.innerHTML = `<div class="sql-placeholder"><strong>فشل الاستعلام</strong>${escapeHtml(message || 'خطأ غير معروف')}</div>`;
  }

  function showSqlCreateStatement(object) {
    const container = document.getElementById('sqlResults');
    if (!container) return;

    const statement = object?.createStatement || 'CREATE statement غير متاح';
    const type = (object?.type || '').toUpperCase();

    container.innerHTML = `
      <div class="sql-meta">${escapeHtml(object?.name || '')} ${type ? `• ${escapeHtml(type)}` : ''}</div>
      <pre style="background:#0d1117;color:#f8fafc;padding:16px;border-radius:10px;overflow:auto;line-height:1.4;">${escapeHtml(statement)}</pre>
    `;
  }

  function insertSqlSnippet(snippet, replace = true) {
    if (!sqlEditor || !snippet) return;
    if (replace) {
      sqlEditor.setValue(snippet);
    } else {
      const cursor = sqlEditor.getCursor();
      sqlEditor.replaceRange(`\n${snippet}`, cursor);
    }
    sqlEditor.focus();
    sqlEditor.setCursor(sqlEditor.lineCount(), 0);
  }

  function buildProcedureTemplate(object) {
    const name = object?.name || 'procedure_name';
    const params = Array.isArray(object?.parameters) && object.parameters.length
      ? object.parameters.map((param, index) => `:${param.name || `param${index + 1}`}`).join(', ')
      : ':param1';
    return `-- تنفيذ الإجراء ${name}\n-- قم بتحديث المتغيرات قبل التنفيذ\nSELECT ${quoteIdentifier(name)}(${params});`;
  }

  function handleSqlObjectContextMenu(event, object, type) {
    event.preventDefault();
    event.stopPropagation();
    hideSqlContextMenu();

    if (!sqlContextMenu || !object) return;

    const normalizedType = (type || object.type || '').toLowerCase();
    const actions = [
      {
        label: 'عرض CREATE',
        description: 'عرض التعريف الأصلي للكائن',
        handler: () => showSqlCreateStatement(object)
      }
    ];

    if (['table', 'view', 'function'].includes(normalizedType)) {
      actions.push({
        label: 'SELECT * LIMIT 100',
        description: 'إنشاء استعلام قراءة سريع',
        handler: () => insertSqlSnippet(`SELECT * FROM ${quoteIdentifier(object.name)} LIMIT 100;`)
      });
    }

    if (normalizedType === 'procedure') {
      actions.push({
        label: 'نموذج تنفيذ الإجراء',
        description: 'إدراج قالب مع المتغيرات',
        handler: () => insertSqlSnippet(buildProcedureTemplate(object))
      });
    }

    sqlContextMenu.innerHTML = '';
    actions.forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `${action.label}<small>${action.description}</small>`;
      button.onclick = () => {
        action.handler();
        hideSqlContextMenu();
      };
      sqlContextMenu.appendChild(button);
    });

    const { clientX, clientY } = event;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = 220;
    const menuHeight = 44 * actions.length;

    const left = Math.min(clientX, viewportWidth - menuWidth - 16);
    const top = Math.min(clientY, viewportHeight - menuHeight - 16);

    sqlContextMenu.style.left = `${left}px`;
    sqlContextMenu.style.top = `${top}px`;
    sqlContextMenu.classList.add('visible');
  }

  function hideSqlContextMenu() {
    if (!sqlContextMenu) return;
    sqlContextMenu.classList.remove('visible');
    sqlContextMenu.innerHTML = '';
  }

  function setupSqlResizer() {
    if (sqlResizeSetupDone) {
      if (typeof sqlLayoutController?.clamp === 'function') {
        sqlLayoutController.clamp();
      }
      return;
    }

    const workspace = document.querySelector('.sql-workspace');
    const editorContainer = document.getElementById('sqlEditorContainer');
    const resizer = document.getElementById('sqlResizer');

    if (!workspace || !editorContainer || !resizer) {
      return;
    }

    const MIN_EDITOR = 0;
    const MIN_RESULTS = 0;
    const state = { active: false, startY: 0, startHeight: 0 };

    function pointerY(event) {
      return event.touches?.[0]?.clientY ?? event.clientY;
    }

    function applyHeight(desiredHeight) {
      const workspaceHeight = workspace.getBoundingClientRect().height || 0;
      const maxHeight = Math.max(0, workspaceHeight - MIN_RESULTS);
      const nextHeight = Math.min(Math.max(desiredHeight, MIN_EDITOR), maxHeight);

      editorContainer.style.setProperty('--sql-editor-height', `${nextHeight}px`);
      editorContainer.style.height = `${nextHeight}px`;
      editorContainer.dataset.height = String(nextHeight);

      if (sqlEditor && typeof sqlEditor.refresh === 'function') {
        sqlEditor.refresh();
      }
    }

    function clampHeight() {
      const stored = parseFloat(editorContainer.dataset.height);
      const fallback = Number.isFinite(stored)
        ? stored
        : editorContainer.getBoundingClientRect().height || 260;
      applyHeight(fallback);
    }

    function stopDrag() {
      if (!state.active) return;
      state.active = false;
      resizer.classList.remove('dragging');
      document.body.classList.remove('sql-resizing');
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
    }

    function handleMove(event) {
      if (!state.active) return;
      event.preventDefault();
      const clientY = pointerY(event);
      const delta = clientY - state.startY;
      applyHeight(state.startHeight + delta);
    }

    function startDrag(event) {
      event.preventDefault();
      state.active = true;
      state.startY = pointerY(event);
      state.startHeight = editorContainer.getBoundingClientRect().height || MIN_EDITOR;
      resizer.classList.add('dragging');
      document.body.classList.add('sql-resizing');
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('touchend', stopDrag);
      window.addEventListener('touchcancel', stopDrag);
    }

    resizer.addEventListener('mousedown', startDrag);
    resizer.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('resize', clampHeight);

    sqlLayoutController = { clamp: clampHeight };
    sqlResizeSetupDone = true;

    requestAnimationFrame(() => clampHeight());
  }

  // ==================== INIT ====================

  document.addEventListener('DOMContentLoaded', () => {
    startChromeWatcher();

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => setActivePanel(tab.dataset.tab));
    });

    // Load branches on init
    loadBranches();

    // Branch selection handler
    document.getElementById('branchId').onchange = (e) => {
      loadModules(e.target.value);
    };

    // Module selection handler
    document.getElementById('moduleId').onchange = (e) => {
      const branchId = document.getElementById('branchId').value;
      const moduleId = e.target.value;

      if (branchId && moduleId) {
        document.getElementById('connectBtn').disabled = false;
      } else {
        document.getElementById('connectBtn').disabled = true;
      }
    };

    document.getElementById('connectBtn').onclick = connect;

    initializeSqlAdmin();

    const refreshButtons = [document.getElementById('refreshSchemaBtn'), document.getElementById('refreshAutocompleteBtn')];
    refreshButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => fetchSqlSchema(true));
      }
    });

    // Check if already connected via query params
    const params = new URLSearchParams(window.location.search);
    const autoConnect = params.get('autoConnect');

    if (autoConnect === 'true') {
      setTimeout(connect, 500);
    }
  });

})();
