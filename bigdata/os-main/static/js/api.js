// API Client Helper
const API_BASE = '';

const API = {
    models: {
        list: async (params = {}) => {
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`${API_BASE}/api/models${query ? '?' + query : ''}`);
            return res.json();
        },
        get: async (id) => {
            const res = await fetch(`${API_BASE}/api/models/${id}`);
            return res.json();
        },
        download: async (hf_name, model_type, modality = 'text') => {
            const res = await fetch(`${API_BASE}/api/models/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hf_name, model_type, modality })
            });
            return res.json();
        },
        upload: async (file, name, model_type, modality = 'text') => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', name);
            formData.append('model_type', model_type);
            formData.append('modality', modality);
            const res = await fetch(`${API_BASE}/api/models/upload`, {
                method: 'POST',
                body: formData
            });
            return res.json();
        },
        delete: async (id) => {
            const res = await fetch(`${API_BASE}/api/models/${id}`, { method: 'DELETE' });
            return res.json();
        }
    },

    experiments: {
        list: async (params = {}) => {
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`${API_BASE}/api/experiments${query ? '?' + query : ''}`);
            return res.json();
        },
        get: async (id) => {
            const res = await fetch(`${API_BASE}/api/experiments/${id}`);
            return res.json();
        },
        create: async (data) => {
            const res = await fetch(`${API_BASE}/api/experiments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return res.json();
        },
        start: async (id) => {
            const res = await fetch(`${API_BASE}/api/experiments/${id}/start`, { method: 'POST' });
            return res.json();
        },
        stop: async (id) => {
            const res = await fetch(`${API_BASE}/api/experiments/${id}/stop`, { method: 'POST' });
            return res.json();
        },
        delete: async (id) => {
            const res = await fetch(`${API_BASE}/api/experiments/${id}`, { method: 'DELETE' });
            return res.json();
        }
    },

    patterns: {
        list: async (params = {}) => {
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`${API_BASE}/api/patterns${query ? '?' + query : ''}`);
            return res.json();
        },
        get: async (id) => {
            const res = await fetch(`${API_BASE}/api/patterns/${id}`);
            return res.json();
        },
        getViz: async (id, max_points = 10000) => {
            const res = await fetch(`${API_BASE}/api/patterns/${id}/viz?max_points=${max_points}`);
            return res.json();
        },
        compare: async (pattern_a, pattern_b) => {
            const res = await fetch(`${API_BASE}/api/patterns/compare?pattern_a=${pattern_a}&pattern_b=${pattern_b}`);
            return res.json();
        }
    }
};
