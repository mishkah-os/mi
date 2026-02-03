/**
 * Simple POS Data Loader
 * Loads data directly from REST API bypassing WebSocket store
 * This preserves the original seed data structure without schema transformation
 */

(function(window) {
  'use strict';

  async function loadPosData(branchId, moduleId) {
    const apiUrl =window.basedomain + `/api/branches/${branchId}/modules/${moduleId}`;

    try {
      const response = await fetch(apiUrl, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const tables = data.tables || {};

      // Handle menu_modifiers → modifiers object with add_ons and removals
      // This is the only mapping needed since seeds use separate arrays
      if (tables.menu_modifiers && Array.isArray(tables.menu_modifiers)) {
        const add_ons = [];
        const removals = [];

        tables.menu_modifiers.forEach(mod => {
          if (mod.modifierType === 'add_on' || mod.modifierType === 'addon') {
            add_ons.push(mod);
          } else if (mod.modifierType === 'removal' || mod.modifierType === 'remove') {
            removals.push(mod);
          }
        });

        // Seeds use separate arrays, not nested in modifiers object
        if (!tables.add_ons) tables.add_ons = add_ons;
        if (!tables.removals) tables.removals = removals;
      }

      return tables;

    } catch (error) {
      throw error;
    }
  }

  // Expose to window
  window.loadPosData = loadPosData;

})(window);
