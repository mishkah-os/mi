(function (global) {
    'use strict';

    var M = global.Mishkah;
    var UC = global.UniversalComp;
    var UI = M && M.UI;
    var D = M && M.DSL;

    if (!M || !D || !UC || !M.REST) {
        console.error('[Clinic Contracts] Missing Mishkah DSL/REST/UniversalComp.');
        return;
    }

    function formatDate(value) {
        if (!value) return '';
        var parsed = Date.parse(value);
        if (!Number.isFinite(parsed)) return String(value);
        return new Date(parsed).toISOString().slice(0, 10);
    }

    function resolvePatientLabel(patient, lang) {
        if (!patient) return '';
        if (typeof patient === 'string') return patient;
        return patient.name || patient.display_name || patient.title || (lang === 'ar' ? 'مريض غير مسمى' : 'Unnamed Patient');
    }

    async function loadLanguages(ctx) {
        if (!M || !M.REST) return;
        try {
            var repo = M.REST.repo('languages');
            var res = await repo.search({ limit: 100 });
            var rows = res.data || res || [];
            var formatted = rows.map(function (l) { return { code: l.code, label: l.display_name || l.name || l.code, dir: l.direction || 'ltr' }; });

            // Ensure basics exist
            var defaults = [{ code: 'ar', label: 'العربية', dir: 'rtl' }, { code: 'en', label: 'English', dir: 'ltr' }];
            var merged = defaults.concat(formatted.filter(function (r) { return r.code !== 'ar' && r.code !== 'en'; }));

            ctx.setState(function (prev) {
                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { languages: merged }) });
            });
        } catch (e) { console.warn('Failed to load languages', e); }
    }

    function formatMoney(value) {
        var num = Number(value || 0);
        if (!Number.isFinite(num)) return String(value || '0');
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function isSystemColumn(name) {
        if (!name) return false;
        var lower = String(name).toLowerCase();
        return ['company', 'company_id', 'branch', 'branch_id', 'user_insert', 'begin_date', 'created_date', 'last_update', 'last_update_date'].indexOf(lower) !== -1;
    }

    function getRecordId(value) {
        if (!value) return value;
        if (typeof value === 'object') {
            return value.id || value.Id || value.uuid || value.uid || value;
        }
        return value;
    }

    function getSystemDefaults(ctx) {
        var data = ctx.getState().data || {};
        var defaults = {};
        var defaultContext = data.defaultContext || {};
        var companyId = (data.companyInfo && data.companyInfo.id) || (defaultContext.company && defaultContext.company.id);
        if (companyId) defaults.company_id = companyId;
        if (defaultContext.branch && defaultContext.branch.id) defaults.branch_id = defaultContext.branch.id;
        if (defaultContext.user && defaultContext.user.id) defaults.user_insert = defaultContext.user.id;
        return defaults;
    }

    function getTableDef(appState, tableName) {
        var info = appState.data.schemaInfo || {};
        var map = info.tableMap || {};
        return map[tableName] || {};
    }

    function getSmartColumns(appState, tableName) {
        var table = getTableDef(appState, tableName);
        var cols = (table.smart_features && table.smart_features.columns) || [];
        return Array.isArray(cols) ? cols : [];
    }

    function getSmartColumn(appState, tableName, fieldName) {
        var cols = getSmartColumns(appState, tableName);
        return cols.find(function (col) { return col && col.name === fieldName; }) || null;
    }

    function resolveSchemaColumns(appState, tableName) {
        var sc = appState.data.screens.contracts || {};
        var columnsMeta = (sc.columnsMetaByTable && sc.columnsMetaByTable[tableName]) || [];
        if (columnsMeta.length) return columnsMeta;
        var schema = getTableDef(appState, tableName);
        var smart = (schema.smart_features && schema.smart_features.columns) || [];
        return smart;
    }

    function getGroups(appState, tableName, lang) {
        var table = getTableDef(appState, tableName);
        var groups = (table.smart_features && table.smart_features.settings && table.smart_features.settings.groups) || {};
        var list = Object.keys(groups).map(function (id) {
            var def = groups[id] || {};
            var labels = def.labels || {};
            return {
                id: id,
                order: def.order || 999,
                label: labels[lang] || labels.ar || labels.en || id
            };
        });
        if (!list.length) {
            list.push({ id: 'basic', order: 1, label: 'basic' });
        }
        list.sort(function (a, b) { return a.order - b.order; });
        return list;
    }

    function resolveLabel(col, lang) {
        var labels = (col && col.labels) || {};
        return labels[lang] || labels.ar || labels.en || col.label || col.name || '';
    }

    function resolveFkTarget(schema, fieldName) {
        if (!fieldName) return null;
        var fkList = (schema && schema.fkReferences) || [];
        var match = fkList.find(function (fk) { return fk && (fk.columnName === fieldName || fk.name === fieldName); });
        if (match) return match.targetTable;

        // Hardcoded fallbacks for clinic system critical fields
        if (fieldName === 'clinic_type') return 'clinic_types';
        if (fieldName === 'supervising_doctor' || fieldName === 'executing_doctor') return 'clinic_doctors';
        if (fieldName === 'referral_doctor') return 'clinic_referral_doctors';
        if (fieldName === 'patient') return 'clinic_patients';

        return null;
    }

    function resolveOptionLabel(row, lang) {
        if (!row || typeof row !== 'object') return '';

        // Priority 1: Check i18n (for joined _lang data)
        var i18n = row.i18n || {};
        var langEntry = (i18n.lang && i18n.lang[lang]) || i18n[lang] || null;

        // If we have lang data, find first TEXT field ONLY
        if (langEntry && typeof langEntry === 'object') {
            var langKeys = Object.keys(langEntry);
            for (var i = 0; i < langKeys.length; i++) {
                var key = langKeys[i];
                var value = langEntry[key];

                // Skip any non-string field (STRICT: only text fields)
                if (typeof value !== 'string') continue;

                // Skip empty strings
                if (!value || value.length === 0) continue;

                // Skip ID fields
                if (key === 'id' || key.indexOf('_id') !== -1) continue;

                if (value.match(/^\d{4}-\d{2}-\d{2}/)) continue;
                if (value.match(/^\d{2}:\d{2}/)) continue; // time

                // Skip UUIDs (looks like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
                if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) continue;

                // This is a valid text field!
                return value;
            }
        }

        // Priority 2: Check main row for text fields
        // Preferred field names first
        var preferred = ['default_name', 'name', 'display_name', 'label', 'title', 'full_name', 'description', 'code'];
        for (var j = 0; j < preferred.length; j++) {
            var pref = preferred[j];
            var prefVal = row[pref];
            // STRICT: Only string type allowed
            if (prefVal && typeof prefVal === 'string' && prefVal.length > 0) {
                // Skip dates
                if (prefVal.match(/^\d{4}-\d{2}-\d{2}/)) continue;
                return prefVal;
            }
        }

        // Priority 3: Auto-detect first TEXT field in main row
        var rowKeys = Object.keys(row);
        for (var k = 0; k < rowKeys.length; k++) {
            var rkey = rowKeys[k];
            var rvalue = row[rkey];

            // STRICT: Only string type allowed
            if (typeof rvalue !== 'string') continue;

            // Skip empty
            if (!rvalue || rvalue.length === 0) continue;

            // Skip system/id fields
            if (rkey === 'id' || rkey.indexOf('_id') !== -1 || rkey === 'i18n') continue;
            if (rkey === 'begin_date' || rkey === 'created_date' || rkey === 'last_update' || rkey === 'end_date') continue;

            // Skip dates
            if (rvalue.match(/^\d{4}-\d{2}-\d{2}/)) continue;

            // Skip UUIDs
            if (rvalue.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) continue;

            // This is a valid text field!
            return rvalue;
        }

        // Fallback: return ID (as last resort)
        return row.id || row.Id || row.uuid || row.uid || '';
    }

    function formatDisplayValue(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') {
            return value.display_name || value.name || value.label || value.title || (value.id ? String(value.id) : JSON.stringify(value));
        }
        return String(value);
    }

    function formatDisplayValue(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') {
            return value.display_name || value.name || value.label || value.title || (value.id ? String(value.id) : JSON.stringify(value));
        }
        return String(value);
    }

    function resolveLangName(row, lang) {
        if (!row || typeof row !== 'object') return '';
        if (row.name || row.title || row.label || row.code) {
            return row.name || row.title || row.label || row.code;
        }
        var i18n = row.i18n || {};
        var langEntry = (i18n.lang && i18n.lang[lang]) || i18n[lang] || null;
        if (langEntry && (langEntry.name || langEntry.label || langEntry.title)) {
            return langEntry.name || langEntry.label || langEntry.title;
        }
        return '';
    }

    function resolvePatientLabel(row, lang) {
        if (!row || typeof row !== 'object') return '';

        // Get code
        var code = row.code || row.patient_code || row.number || '';

        // Get name - try i18n structure first (like dashboard does)
        var name = '';
        if (row.i18n && row.i18n.lang) {
            var langEntry = row.i18n.lang[lang] || row.i18n.lang.ar || row.i18n.lang.en;
            if (langEntry) {
                name = langEntry.name || langEntry.label || langEntry.title || '';
            }
        }
        // Fallback to direct fields
        if (!name) {
            name = lang === 'ar' ? (row.name_ar || row.name_en || row.name) : (row.name_en || row.name_ar || row.name);
        }

        // Get phone
        var phone = row.phone || row.mobile || row.phone_number || row.mobile_number || row.telephone || '';

        // Build label
        var parts = [];
        if (code) parts.push(code.startsWith(lang === 'ar' ? '\u0627\u0644\u0639\u0645\u064a\u0644' : 'Patient') ? code : (lang === 'ar' ? '\u0627\u0644\u0639\u0645\u064a\u0644 ' + code : 'Patient ' + code));
        if (name) parts.push(name);
        if (phone) parts.push(phone);

        return parts.join(' - ') || (row.id ? String(row.id).slice(0, 12) : '---');
    }

    // ============================================================================
    // CRUD HELPER FUNCTIONS
    // ============================================================================

    function normalizeColumnsMeta(meta) {
        if (!meta || !Array.isArray(meta)) return [];
        return meta.map(function (col) {
            if (!col || typeof col !== 'object') return null;
            return col;
        }).filter(Boolean);
    }

    function buildSystemDefaults(data, columnsMeta) {
        var defaults = {};
        var defaultContext = data.defaultContext || {};
        var companyId = (data.companyInfo && data.companyInfo.id) || (defaultContext.company && defaultContext.company.id);
        if (companyId) defaults.company_id = companyId;
        if (defaultContext.branch && defaultContext.branch.id) defaults.branch_id = defaultContext.branch.id;
        if (defaultContext.user && defaultContext.user.id) defaults.user_insert = defaultContext.user.id;
        return defaults;
    }

    function ensureTranslationFields(currentFields, translations) {
        var fields = [];
        if (Array.isArray(currentFields) && currentFields.length) {
            return currentFields;
        }
        Object.keys(translations || {}).forEach(function (lang) {
            var entry = translations[lang];
            if (entry && typeof entry === 'object') {
                Object.keys(entry).forEach(function (key) {
                    if (fields.indexOf(key) === -1) fields.push(key);
                });
            }
        });
        return fields;
    }

    function buildEmptyTranslations(languages, fields) {
        var translations = {};
        (languages || []).forEach(function (lang) {
            var code = typeof lang === 'string' ? lang : (lang.code || lang.langCode);
            if (!code) return;
            var entry = {};
            (fields || []).forEach(function (field) {
                entry[field] = '';
            });
            translations[code] = entry;
        });
        return translations;
    }

    function applyDefaultsFromColumnsMeta(record, columnsMeta) {
        var draft = Object.assign({}, record || {});
        (columnsMeta || []).forEach(function (col) {
            if (!col || !col.name) return;
            if (draft[col.name] !== undefined) return;
            if (col.has_default && col.default_value !== undefined && col.default_value !== null) {
                draft[col.name] = col.default_value;
            }
        });
        return draft;
    }

    function computeRecordPatch(baseline, current) {
        var patch = {};
        Object.keys(current || {}).forEach(function (key) {
            if (key === 'i18n' || key === '_display') return;
            patch[key] = current[key];
        });
        return patch;
    }

    function computeTranslationPayload(translations, baseline, removals, fields) {
        var payload = { upserts: [], removals: removals || [] };
        Object.keys(translations || {}).forEach(function (lang) {
            var entry = translations[lang] || {};
            var hasContent = false;
            (fields || []).forEach(function (field) {
                if (entry[field]) hasContent = true;
            });
            if (hasContent) {
                payload.upserts.push({ langCode: lang, data: entry });
            }
        });
        return payload;
    }

    function buildSavePayload(crudState) {
        var record = computeRecordPatch(crudState.selectedRecord, crudState.editRecord);
        var translations = computeTranslationPayload(
            crudState.translations || {},
            crudState.translationBaseline || {},
            crudState.translationRemovals || [],
            crudState.translationFields || []
        );
        return { record: record, translations: translations };
    }

    function pushNotification(app, type, message) {
        if (!app || !message) return;
        var entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: type || 'info',
            message: message
        };
        app.setState(function (prev) {
            var current = (prev.data.notifications || []).slice(-4);
            var next = current.concat([entry]);
            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { notifications: next }) });
        });
    }

    async function loadContractsReferenceData(app) {
        var state = app.getState();

        // Extract branch name from user session
        var branchId = 'pt'; // Default fallback
        try {
            var sessionData = localStorage.getItem('mishkah_user');
            if (sessionData) {
                var userData = JSON.parse(sessionData);
                // Use brname (branch name like "fas", "pt")
                branchId = userData.brname || userData.branch_id || branchId;
            }
        } catch (e) {
            console.warn('[Contracts] Failed to parse session data:', e);
        }

        // Fallback chain
        branchId = branchId || window.MISHKAH_BRANCH || (state.env && state.env.branchId) || 'pt';
        var moduleId = window.MODULE_ID || (state.env && state.env.moduleId) || 'clinic';

        var tables = [
            'clinic_contracts_header',
            'clinic_contracts_lines',
            'clinic_contract_schedule_preferences',
            'clinic_payments',
            'clinic_doctors',
            'clinic_patients',
            'clinic_services',
            'clinic_service_packages',
            'clinic_service_package_tiers',
            'clinic_payment_methods',
            'clinic_types',
            'clinic_service_clinic_types',
            'clinic_referral_doctors',
            'clinic_booking_requests',
            'clinic_booking_items'
        ];

        var requests = {};
        tables.forEach(function (t) {
            requests[t] = { table: t, query: { limit: 2000 } };
        });

        try {
            // Use fetch directly as M.REST might not support RPC style yet
            var resp = await fetch('/api/rpc/batch-dataset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branchId: branchId, moduleId: moduleId, requests: requests })
            });
            var json = await resp.json();

            if (json.success && json.results) {

                app.setState(function (prev) {
                    var refData = Object.assign({}, prev.data.referenceData || {});

                    // Helper to safely get data
                    var get = function (k) { return (json.results[k] && json.results[k].data) || []; };

                    // 1. Populate top-level generic cache (good for direct lookups)
                    Object.keys(json.results).forEach(function (k) {
                        refData[k] = get(k);
                    });

                    // 2. Populate NESTED cache for 'clinic_contracts_header'
                    // Used by form editor for dropdowns
                    refData['clinic_contracts_header'] = Object.assign({}, refData['clinic_contracts_header'] || {}, {
                        clinic_types: get('clinic_types'),
                        clinic_doctors: get('clinic_doctors'),
                        clinic_referral_doctors: get('clinic_referral_doctors'),
                        clinic_patients: get('clinic_patients'),
                        clinic_services: get('clinic_services') // sometimes used for filtering
                    });

                    // 3. Populate NESTED cache for 'clinic_contracts_lines'
                    refData['clinic_contracts_lines'] = Object.assign({}, refData['clinic_contracts_lines'] || {}, {
                        clinic_services: get('clinic_services'),
                        clinic_service_packages: get('clinic_service_packages'),
                        clinic_service_package_tiers: get('clinic_service_package_tiers'),
                        clinic_service_clinic_types: get('clinic_service_clinic_types')
                    });

                    // 4. Populate NESTED for 'clinic_payments'
                    refData['clinic_payments'] = Object.assign({}, refData['clinic_payments'] || {}, {
                        clinic_payment_methods: get('clinic_payment_methods')
                    });

                    refData['clinic_contract_schedule_preferences'] = Object.assign({}, refData['clinic_contract_schedule_preferences'] || {}, {
                        clinic_contracts_lines: get('clinic_contracts_lines'), // usually self-referential or from current editor
                        clinic_doctors: get('clinic_doctors')
                    });

                    // 6. Populate 'clinic_booking_requests'
                    refData['clinic_booking_requests'] = Object.assign({}, refData['clinic_booking_requests'] || {}, {
                        clinic_contracts_lines: get('clinic_contracts_lines'),
                        clinic_services: get('clinic_services')
                    });

                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, { referenceData: refData })
                    });
                });
            } else {
                console.warn('[Contracts] Batch load warning:', json);
            }
        } catch (err) {
            console.error('[Contracts] Batch load failed', err);
        }
    }

    function resolveFkValue(appState, tableName, fieldName, value, lang) {
        var schema = getTableDef(appState, tableName);
        var target = resolveFkTarget(schema, fieldName);
        if (!target) return value;
        var refData = (appState.data.referenceData && appState.data.referenceData[tableName]) || {};
        var rows = refData[target] || [];
        var match = rows.find(function (row) { return String(getRecordId(row)) === String(value); });
        return match ? resolveOptionLabel(match, lang) : value;
    }

    function resolveClinicType(appState, clinicTypeId) {
        if (!clinicTypeId) return null;
        var refData = (appState.data.referenceData && appState.data.referenceData['clinic_contracts_header']) || {};
        var types = refData.clinic_types || [];
        return types.find(function (row) { return String(getRecordId(row)) === String(clinicTypeId); }) || null;
    }

    function resolveServiceMinutes(serviceRow) {
        if (!serviceRow) return null;
        var slotMinutes = Number(serviceRow.slot_minutes || 0);
        if (slotMinutes > 0) return slotMinutes;
        var baseDuration = Number(serviceRow.base_duration_minutes || serviceRow.standard_duration_minutes || 0);
        return baseDuration > 0 ? baseDuration : null;
    }

    function isConsultationType(clinicType, lang) {
        if (!clinicType) return false;
        var kind = String(clinicType.visit_kind || '').toLowerCase();
        if (kind === 'consultation' || kind === 'consult' || kind === 'general') return true;

        var label = resolveOptionLabel(clinicType, lang);
        if (!label) return false;

        var lower = String(label).toLowerCase();
        // Check for "كشف" (Consultation) or common consultation terms
        return lower.indexOf('consult') !== -1 ||
            label.indexOf('كشف') !== -1 ||
            label.indexOf('تقييم') !== -1 ||
            lower.indexOf('rehab') !== -1 ||
            lower.indexOf('general') !== -1;
    }

    function resolveServiceByLine(line, services, packages) {
        if (!line) return null;
        var serviceId = line.service;
        if (!serviceId && line.service_package) {
            var pack = packages.find(function (row) { return String(getRecordId(row)) === String(line.service_package); });
            serviceId = pack && pack.service ? pack.service : serviceId;
        }
        return services.find(function (row) { return String(getRecordId(row)) === String(serviceId); }) || null;
    }

    function resolveActiveServiceMinutes(editor, services, packages, clinicType) {
        var lines = editor.lines || [];
        var lineBookings = editor.lineBookings || {};
        var lineBookings = editor.lineBookings || {};
        var lineBookings = editor.lineBookings || {};
        var draft = editor.lineDraft || {};
        var minutesList = [];
        lines.forEach(function (line) {
            var srv = resolveServiceByLine(line, services, packages);
            var mins = resolveServiceMinutes(srv);
            if (mins) minutesList.push(mins);
        });
        if (!minutesList.length) {
            var draftSrv = resolveServiceByLine(draft, services, packages);
            var draftMins = resolveServiceMinutes(draftSrv);
            if (draftMins) minutesList.push(draftMins);
        }
        var typeMins = Number((clinicType && clinicType.standard_duration_minutes) || 0);
        if (!minutesList.length && typeMins > 0) minutesList.push(typeMins);
        if (!minutesList.length) minutesList.push(60);
        return Math.max.apply(null, minutesList);
    }

    function resolveBaseSlotMinutes(clinicType) {
        var base = Number((clinicType && clinicType.base_slot_minutes) || 0);
        return base > 0 ? base : 15;
    }

    function inferSlotMinutes(slots) {
        if (!Array.isArray(slots)) return null;
        for (var i = 0; i < slots.length; i++) {
            var slot = slots[i];
            if (!slot) continue;
            var start = timeToMinutes(slot.slot_time_start);
            var end = timeToMinutes(slot.slot_time_end);
            if (start !== null && end !== null && end > start) {
                return end - start;
            }
        }
        return null;
    }

    function buildSlotBlocks(slots, baseSlotMinutes, serviceMinutes) {
        if (!Array.isArray(slots) || !slots.length) return [];
        var inferredSlotMinutes = inferSlotMinutes(slots);
        var initialSlotSize = Math.max(1, Number(baseSlotMinutes || 0));
        if (!Number.isFinite(initialSlotSize) || initialSlotSize <= 0) {
            initialSlotSize = inferredSlotMinutes || 15;
        }

        function buildWithSlotSize(slotSize) {
            var serviceMins = Math.max(slotSize, Number(serviceMinutes || slotSize));
            var needed = Math.max(1, Math.ceil(serviceMins / slotSize));
            var grouped = {};
            slots.forEach(function (slot) {
                if (!slot) return;
                var status = String(slot.slot_status || slot.status || '').toLowerCase();
                if (status && status !== 'available') return;
                var dateKey = slot.slot_date || '';
                var stationKey = getRecordId(slot.station) || 'none';
                var key = dateKey + '|' + stationKey;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(slot);
            });

            var blocks = [];
            Object.keys(grouped).forEach(function (key) {
                var list = grouped[key].slice().sort(function (a, b) {
                    return String(a.slot_time_start || '').localeCompare(String(b.slot_time_start || ''));
                });
                for (var i = 0; i + needed <= list.length;) {
                    var windowSlots = list.slice(i, i + needed);
                    var isContiguous = true;
                    for (var j = 1; j < windowSlots.length; j++) {
                        var prev = windowSlots[j - 1];
                        var curr = windowSlots[j];
                        var prevStart = timeToMinutes(prev.slot_time_start);
                        var currStart = timeToMinutes(curr.slot_time_start);
                        if (prevStart === null || currStart === null || currStart - prevStart !== slotSize) {
                            isContiguous = false;
                            break;
                        }
                    }
                    if (!isContiguous) {
                        i += 1;
                        continue;
                    }
                    var first = windowSlots[0];
                    var last = windowSlots[windowSlots.length - 1];
                    var label = (first.slot_date || '') + ' • ' + (first.slot_time_start || '') + ' - ' + (last.slot_time_end || last.slot_time_start || '');
                    blocks.push({
                        id: getRecordId(first),
                        slots: windowSlots,
                        slot_date: first.slot_date,
                        slot_time_start: first.slot_time_start,
                        slot_time_end: last.slot_time_end || last.slot_time_start,
                        label: label
                    });
                    i += needed;
                }
            });

            blocks.sort(function (a, b) {
                if (a.slot_date === b.slot_date) return String(a.slot_time_start || '').localeCompare(String(b.slot_time_start || ''));
                return String(a.slot_date || '').localeCompare(String(b.slot_date || ''));
            });
            return blocks;
        }

        var blocks = buildWithSlotSize(initialSlotSize);
        if (!blocks.length && inferredSlotMinutes && inferredSlotMinutes !== initialSlotSize) {
            blocks = buildWithSlotSize(inferredSlotMinutes);
        }
        return blocks;
    }

    function getBlockDate(block) {
        return block && (block.slot_date || block.date || (block.slot && block.slot.slot_date)) || '';
    }

    function getBlockStart(block) {
        return block && (block.slot_time_start || block.timeStart || (block.slot && block.slot.slot_time_start)) || '';
    }

    function getBlockEnd(block) {
        return block && (block.slot_time_end || block.timeEnd || (block.slot && block.slot.slot_time_end) || getBlockStart(block)) || '';
    }

    function formatBookingLabel(block) {
        var date = getBlockDate(block);
        var start = getBlockStart(block);
        var end = getBlockEnd(block);
        var timeLabel = '';
        if (start && end) timeLabel = start.slice(0, 5) + ' - ' + end.slice(0, 5);
        else if (start) timeLabel = start.slice(0, 5);
        return date ? (date + (timeLabel ? ' • ' + timeLabel : '')) : (timeLabel || '');
    }

    function buildBookingSummary(blocks) {
        if (!Array.isArray(blocks) || !blocks.length) return { label: '', count: 0 };
        var label = formatBookingLabel(blocks[0]);
        return { label: label || '—', count: blocks.length };
    }

    function blockOverlaps(a, b) {
        if (!a || !b) return false;
        var dateA = getBlockDate(a);
        var dateB = getBlockDate(b);
        if (!dateA || !dateB || dateA !== dateB) return false;
        var startA = timeToMinutes(getBlockStart(a));
        var endA = timeToMinutes(getBlockEnd(a));
        var startB = timeToMinutes(getBlockStart(b));
        var endB = timeToMinutes(getBlockEnd(b));
        if (startA === null || endA === null || startB === null || endB === null) return false;
        return startA < endB && startB < endA;
    }

    function collectBookedBlocks(lineBookings, excludeLineId) {
        var booked = [];
        if (!lineBookings) return booked;
        Object.keys(lineBookings).forEach(function (lineId) {
            if (excludeLineId && String(lineId) === String(excludeLineId)) return;
            var blocks = lineBookings[lineId] || [];
            blocks.forEach(function (block) {
                if (block) booked.push(block);
            });
        });
        return booked;
    }

    function updateActions(actions, appState) {
        // Assuming 'actions' is an object that we are adding properties to.
        // The provided snippet implies this is the context.
        Object.assign(actions, {
            'contracts:ctx-info': {
                on: ['click'],
                gkeys: ['contracts:ctx-info'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    try {
                        var res = await M.REST.repo('clinic_contracts_header').read(id);
                        var header = res.record || res;

                        // Load related data
                        var linesRes = await M.REST.repo('clinic_contracts_lines').search({ contract: id });
                        var paymentsRes = await M.REST.repo('clinic_payments').search({ contract: id });

                        var data = {
                            header: header,
                            lines: linesRes.data || linesRes || [],
                            payments: paymentsRes.data || paymentsRes || []
                        };

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { infoModal: { open: true, data: data } })
                                    })
                                })
                            });
                        });
                    } catch (error) {
                        console.error(error);
                        alert('Failed to load contract details');
                    }
                }
            },
            'contracts:ctx-edit': {
                on: ['click'],
                gkeys: ['contracts:ctx-edit'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    try {
                        // Re-use logic to load editor with existing data
                        var res = await M.REST.repo('clinic_contracts_header').read(id);
                        var header = res.record || res;
                        var linesRes = await M.REST.repo('clinic_contracts_lines').search({ contract: id });
                        var paymentsRes = await M.REST.repo('clinic_payments').search({ contract: id });

                        var editorState = {
                            open: true,
                            mode: 'edit',
                            form: header,
                            lines: linesRes.data || linesRes || [],
                            payments: paymentsRes.data || paymentsRes || [],
                            lineDraft: initLineDraft(),
                            paymentDraft: initPaymentDraft()
                        };

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: editorState })
                                    })
                                })
                            });
                        });
                    } catch (error) {
                        console.error(error);
                        alert('Failed to load contract for editing');
                    }
                }
            },
            'contracts:print-open': { // Button inside Info Modal or Editor
                on: ['click'],
                gkeys: ['contracts:print-open'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    var state = ctx.getState();
                    var lang = (state && state.env && state.env.lang) || 'en';
                    if (!id) {
                        var editor = state.data.screens.contracts && state.data.screens.contracts.editor;
                        if (editor && editor.form) id = getRecordId(editor.form);
                    }

                    if (!id) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        printModal: { open: true, contractId: id, loading: true, details: null }
                                    })
                                })
                            })
                        });
                    });

                    try {
                        var details = await loadContractDetails(ctx, id);
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var modalState = Object.assign({}, sc.printModal || {}, {
                                open: true,
                                loading: false,
                                contractId: id,
                                details: details || null
                            });
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { printModal: modalState })
                                    })
                                })
                            });
                        });
                    } catch (err) {
                        console.error('[Contracts] Print data load failed', err);
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { printModal: { open: false } })
                                    })
                                })
                            });
                        });
                        var errMsg = err && (err.message || err.error || err) ? (' - ' + (err.message || err.error || err)) : '';
                        alert(lang === 'ar' ? 'فشل تحميل نموذج الطباعة' + errMsg : 'Failed to load print template' + errMsg);
                    }
                }
            },
            'contracts:print-close': {
                on: ['click'],
                gkeys: ['contracts:print-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { printModal: { open: false } })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:print-exec': {
                on: ['click'],
                gkeys: ['contracts:print-exec'],
                handler: function (_ev, ctx) {
                    window.print();
                }
            },
            'contracts:confirm': {
                on: ['click'],
                gkeys: ['contracts:confirm'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var editor = state.data.screens.contracts.editor;
                    if (!editor || !editor.open) return;

                    // Set loading state
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        editor: Object.assign({}, sc.editor, { loading: true })
                                    })
                                })
                            })
                        });
                    });

                    var payload = {
                        branchId: (state.env && state.env.branchId) || 'pt',
                        moduleId: (state.env && state.env.moduleId) || 'clinic',
                        form: editor.form,
                        lines: editor.lines,
                        payments: editor.payments,
                        schedule: (editor.schedule || []),
                        selectedSlots: (editor.selectedBlocks || []), // Send selected blocks/slots from the grid
                        lineBookings: (editor.lineBookings || {}),
                        user: state.user || { id: 'system' }
                    };

                    try {
                        var res = await M.REST.rpc('clinic-confirm-contract', payload);
                        if (res.success) {
                            var lang = (state.env && state.env.lang) || 'en';
                            pushNotification(ctx, 'success', lang === 'ar' ? 'تم حفظ العقد بنجاح' : 'Contract saved successfully');

                            // Refresh list and close editor
                            ctx.setState(function (prev) {
                                var sc = prev.data.screens.contracts || {};
                                return Object.assign({}, prev, {
                                    data: Object.assign({}, prev.data, {
                                        screens: Object.assign({}, prev.data.screens, {
                                            contracts: Object.assign({}, sc, { editor: null, loading: true })
                                        })
                                    })
                                });
                            });

                            // Reload requests to update list
                            loadScreen(ctx);
                        } else {
                            throw new Error(res.error || 'Unknown error');
                        }
                    } catch (err) {
                        console.error(err);
                        var lang = (state.env && state.env.lang) || 'en';
                        pushNotification(ctx, 'error', (lang === 'ar' ? 'فشل الحفظ: ' : 'Save failed: ') + (err.message || err));

                        // Reset loading state
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, {
                                            editor: Object.assign({}, sc.editor, { loading: false })
                                        })
                                    })
                                })
                            });
                        });
                    }
                }
            }
        });

        return actions;
    }

    function resolveInputType(col) {
        if (!col) return 'text';
        var component = col.component || '';
        if (component === 'textarea') return 'textarea';
        if (component === 'date') return 'date';
        if (component === 'datetime' || component === 'datetime-local') return 'datetime-local';
        if (component === 'number') return 'number';
        if (component === 'phone') return 'tel';
        if (component === 'email') return 'email';
        if (component === 'checkbox') return 'checkbox';
        var rawType = String(col.type || col.data_type || '').toLowerCase();
        if (rawType === 'boolean' || rawType === 'bool' || rawType === 'bit') return 'checkbox';
        var name = col.name || '';
        if (name.indexOf('date') !== -1 && name.indexOf('time') === -1) return 'date';
        if (name.indexOf('time') !== -1) return 'time';
        if (name.indexOf('count') !== -1 || name.indexOf('_kg') !== -1 || name.indexOf('_cm') !== -1 || name.indexOf('_l_') !== -1) return 'number';
        if (name === 'mobile' || name === 'phone') return 'tel';
        if (name === 'email') return 'email';
        return 'text';
    }

    function renderField(col, form, schema, referenceData, lang, gkey, readonly) {
        if (!col) return null;
        var fieldName = col.name;
        var label = resolveLabel(col, lang) || fieldName;
        var value = form[fieldName];
        var isFk = col.source === 'fk' || (fieldName && fieldName.endsWith('_id') && fieldName !== 'id');
        var inputClass = 'flex h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-base focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-[var(--muted-foreground)]';
        var labelClass = 'text-sm font-semibold text-[var(--foreground)] mb-2 block';
        var inputType = resolveInputType(col);

        // Special case: referral_doctor - allow typing new names
        if (isFk && fieldName === 'referral_doctor') {
            var refTableName = resolveFkTarget(schema, fieldName);
            var refData = [];
            if (referenceData && refTableName) {
                if (Array.isArray(referenceData[refTableName])) {
                    refData = referenceData[refTableName];
                } else if (typeof referenceData === 'object' && referenceData[refTableName]) {
                    refData = referenceData[refTableName];
                }
            }

            // Get current value - could be UUID or name
            var currentValue = (value && typeof value === 'object') ? (value.id || value.Id || value.uuid || value.uid) : value;

            // If it's a UUID, resolve to name for display
            var displayValue = currentValue;
            if (currentValue) {
                var matchedDoc = refData.find(function (row) {
                    var id = row.id || row.Id || row.uuid || row.uid;
                    return String(id) === String(currentValue);
                });
                if (matchedDoc) {
                    displayValue = resolveOptionLabel(matchedDoc, lang) || currentValue;
                }
            }

            var listId = 'referral-doctors-list-' + gkey;

            return D.Div({ attrs: { class: 'flex flex-col' } }, [
                D.Label({ attrs: { class: labelClass } }, [label]),
                D.Input({
                    attrs: {
                        type: 'text',
                        value: displayValue || '',
                        'data-field': fieldName,
                        gkey: gkey,
                        list: listId,
                        placeholder: lang === 'ar' ? 'اكتب اسم الطبيب أو اختر من القائمة' : 'Type doctor name or select',
                        readonly: !!readonly,
                        class: inputClass,
                        autocomplete: 'off'
                    }
                }),
                D.datalist({ attrs: { id: listId } },
                    refData.map(function (row) {
                        var id = row.id || row.Id || row.uuid || row.uid;
                        var label = resolveOptionLabel(row, lang) || id;
                        return D.option({ attrs: { value: label, 'data-id': id } });
                    })
                )
            ]);
        }

        if (isFk) {
            var refTableName = resolveFkTarget(schema, fieldName);

            // Support both flat lookup (referenceData['clinic_doctors']) 
            // and nested lookup (referenceData already is {'clinic_doctors': [...]})
            var refData = [];
            if (referenceData && refTableName) {
                // Try direct lookup first (flat structure)
                if (Array.isArray(referenceData[refTableName])) {
                    refData = referenceData[refTableName];
                }
                // Fallback: check if referenceData itself contains the data (nested structure)
                else if (typeof referenceData === 'object' && referenceData[refTableName]) {
                    refData = referenceData[refTableName];
                }
            }

            var currentValue = (value && typeof value === 'object') ? (value.id || value.Id || value.uuid || value.uid) : value;
            var options = refData.map(function (row) {
                var id = row.id || row.Id || row.uuid || row.uid;
                return { id: id, label: resolveOptionLabel(row, lang) || id };
            });
            var disabled = !refTableName || readonly;
            return D.Div({ attrs: { class: 'flex flex-col' } }, [
                D.Label({ attrs: { class: labelClass } }, [label]),
                D.Select({
                    attrs: {
                        'data-field': fieldName,
                        gkey: gkey,
                        class: inputClass + ' appearance-none',
                        value: currentValue || '',
                        disabled: disabled
                    }
                }, [
                    D.Option({ attrs: { value: '' } }, ['---']),
                    ...options.map(function (opt) {
                        return D.Option({ attrs: { value: opt.id, selected: String(currentValue) === String(opt.id) } }, [opt.label]);
                    })
                ])
            ]);
        }

        if (inputType === 'textarea') {
            return D.Div({ attrs: { class: 'flex flex-col md:col-span-2' } }, [
                D.Label({ attrs: { class: labelClass } }, [label]),
                D.Textarea({
                    attrs: {
                        value: value || '',
                        'data-field': fieldName,
                        gkey: gkey,
                        rows: 4,
                        readonly: !!readonly,
                        class: inputClass + ' h-auto min-h-[120px]'
                    }
                })
            ]);
        }

        if (inputType === 'checkbox') {
            return D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                D.Input({
                    attrs: {
                        type: 'checkbox',
                        checked: !!value,
                        'data-field': fieldName,
                        gkey: gkey,
                        disabled: !!readonly,
                        class: 'h-4 w-4'
                    }
                }),
                D.Label({ attrs: { class: 'text-sm text-[var(--foreground)]' } }, [label])
            ]);
        }

        var displayValue = value;
        if (inputType === 'date' && value) {
            displayValue = String(value).split('T')[0];
        }

        var isDate = inputType === 'date' || inputType === 'datetime-local' || fieldName.indexOf('date') !== -1;
        var finalInputClass = inputClass + (isDate ? ' max-w-[200px]' : '');

        return D.Div({ attrs: { class: 'flex flex-col' } }, [
            D.Label({ attrs: { class: labelClass } }, [label]),
            D.Input({
                attrs: {
                    type: inputType,
                    value: displayValue || '',
                    'data-field': fieldName,
                    gkey: gkey,
                    readonly: fieldName === 'id' || !!readonly,
                    class: finalInputClass
                }
            })
        ]);
    }

    function renderSchemaForm(appState, tableName, form, gkey, groupFilter) {
        var lang = appState.env.lang;
        var schema = getTableDef(appState, tableName);
        var columns = getSmartColumns(appState, tableName)
            .filter(function (col) { return col && col.name && col.is_edit_show !== false; })
            .sort(function (a, b) { return (a.sort || 999) - (b.sort || 999); });

        if (groupFilter && groupFilter.length) {
            columns = columns.filter(function (col) {
                var group = col.group || 'basic';
                return groupFilter.indexOf(group) !== -1;
            });
        }

        var referenceData = (appState.data.referenceData && appState.data.referenceData[tableName]) || {};

        return D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-4' } }, columns.map(function (col) {
            return renderField(col, form, schema, referenceData, lang, gkey, false);
        }));
    }

    function renderTableSection(title, actions, body) {
        return D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3' } }, [
            D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                D.Div({ attrs: { class: 'font-semibold' } }, [title]),
                actions || null
            ].filter(Boolean)),
            body
        ]);
    }

    async function ensureReferenceDataForTable(app, tableName) {
        var state = app.getState();
        var cache = (state.data.referenceData && state.data.referenceData[tableName]) || null;
        // Check if we already have data for all targets
        var schema = getTableDef(state, tableName);
        var targets = new Set();
        (schema.fkReferences || []).forEach(function (fk) {
            if (fk && fk.targetTable) targets.add(fk.targetTable);
        });

        // If cache exists and has keys for all targets, return it
        if (cache) {
            var allLoaded = Array.from(targets).every(function (t) { return Array.isArray(cache[t]); });
            if (allLoaded) return cache;
        }

        var fetched = cache ? Object.assign({}, cache) : {};
        var lang = state.env.lang;

        return Promise.all(Array.from(targets).map(function (target) {
            // Skip if already loaded in this table's cache context
            if (fetched[target] && fetched[target].length) return Promise.resolve();

            return M.REST.repo(target).search({ lang: lang, limit: 1000 }).then(function (res) { // Increased limit for referenced data
                fetched[target] = res.data || res || [];
            }).catch(function (err) {
                console.warn('[Clinic Contracts] Failed to load FK data for', target, err);
                fetched[target] = [];
            });
        })).then(function () {
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        referenceData: Object.assign({}, prev.data.referenceData || {}, (function () {
                            var next = {};
                            next[tableName] = fetched;
                            return next;
                        })()),
                        // Also populate flat cache for SchemaCrud compatibility (fkReferenceCache)
                        fkReferenceCache: Object.assign({}, prev.data.fkReferenceCache || {}, fetched)
                    })
                });
            });
            return fetched;
        });
    }

    function resolveSchemaColumns(appState, tableName) {
        var contracts = (appState.data.screens && appState.data.screens.contracts) || {};
        var cache = contracts.columnsMetaByTable || {};
        if (cache[tableName] && cache[tableName].length) return cache[tableName];
        var schema = getTableDef(appState, tableName);
        var smartColumns = (schema.smart_features && schema.smart_features.columns) || [];
        return Array.isArray(smartColumns) ? smartColumns : [];
    }

    async function ensureTableMeta(app, tableName) {
        var state = app.getState();
        var contracts = state.data.screens.contracts || {};
        var cache = contracts.columnsMetaByTable || {};
        if (cache[tableName]) return cache[tableName];
        try {
            var res = await M.REST.repo(tableName).search({ lang: state.env.lang, limit: 1, withMeta: 1 });
            var columnsMeta = res.columnsMeta || [];
            app.setState(function (prev) {
                var sc = prev.data.screens.contracts || {};
                var nextMeta = Object.assign({}, sc.columnsMetaByTable || {});
                nextMeta[tableName] = columnsMeta;
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        screens: Object.assign({}, prev.data.screens, {
                            contracts: Object.assign({}, sc, { columnsMetaByTable: nextMeta })
                        })
                    })
                });
            });
            return columnsMeta;
        } catch (err) {
            console.warn('[Clinic Contracts] Failed to load columns meta for', tableName, err);
            return [];
        }
    }

    function getGroupColumns(appState, tableName, groupId) {
        var columns = resolveSchemaColumns(appState, tableName);
        return columns.filter(function (col) {
            if (!col || !col.name || col.is_edit_show === false) return false;
            if (isSystemColumn(col.name)) return false;
            var group = col.group || 'basic';
            return group === groupId;
        });
    }

    function renderHeaderEditor(appState, editor, lang) {
        var groups = getGroups(appState, 'clinic_contracts_header', lang);
        var headerForm = editor.form || {};
        var schema = getTableDef(appState, 'clinic_contracts_header');
        var referenceData = (appState.data.referenceData && appState.data.referenceData['clinic_contracts_header']) || {};
        var readOnly = !!editor.readonly;

        // Determine if executing_doctor should be hidden (consultation types only show supervising_doctor)
        var clinicType = resolveClinicType(appState, headerForm.clinic_type);
        var shouldHideExecutingDoctor = isConsultationType(clinicType, lang);

        return D.Div({ attrs: { class: 'space-y-6' } }, groups.map(function (group) {
            var cols = getGroupColumns(appState, 'clinic_contracts_header', group.id);
            if (!cols.length) return null;

            // Filter out executing_doctor for consultation types
            if (shouldHideExecutingDoctor) {
                cols = cols.filter(function (col) { return col.name !== 'executing_doctor'; });
            }

            return renderTableSection(group.label, null, D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-5' } }, cols.map(function (col) {
                return renderField(col, headerForm, schema, referenceData, lang, 'contracts:update-header', readOnly);
            })));
        }).filter(Boolean));
    }

    function buildLineColumns(appState, tableName, rows) {
        var lang = appState.env.lang;
        var columns = getSmartColumns(appState, tableName)
            .filter(function (col) { return col && col.name && col.is_table_show !== false && !isSystemColumn(col.name) && col.name !== 'id'; })
            .sort(function (a, b) { return (a.sort || 999) - (b.sort || 999); })
            .map(function (col) { return { key: col.name, label: resolveLabel(col, lang) }; });
        if (!columns.length && rows && rows[0]) {
            columns = Object.keys(rows[0]).filter(function (key) { return !isSystemColumn(key) && key !== 'id'; }).map(function (key) { return { key: key, label: key }; });
        }
        return columns;
    }

    function renderBookingPlan(editor, lang) {
        var requests = editor.bookingRequests || [];
        var items = editor.bookingItems || [];
        if (!requests.length) return null;

        return D.Div({ attrs: { class: 'space-y-4 mb-6 border rounded-lg p-4 bg-[var(--card)]' } }, [
            D.Div({ attrs: { class: 'font-semibold text-sm mb-2' } }, [lang === 'ar' ? 'خطة الحجز (الطلبات)' : 'Booking Plan (Requests)']),
            D.Div({ attrs: { class: 'space-y-4' } }, requests.map(function (req) {
                var reqItems = items.filter(function (i) { return String(getRecordId(i.booking_request)) === String(getRecordId(req)); });
                var statusColor = reqItems.every(function (i) { return i.status === 'Booked'; }) ? 'text-green-600' : 'text-blue-600';

                return D.Div({ attrs: { class: 'border rounded-md p-3' } }, [
                    D.Div({ attrs: { class: 'flex justify-between items-center mb-2' } }, [
                        D.Div({ attrs: { class: 'font-bold text-sm' } }, [req.pattern_summary || ('Request ' + getRecordId(req).slice(0, 8))]),
                        D.Div({ attrs: { class: 'text-xs ' + statusColor } }, [reqItems.length + (lang === 'ar' ? ' مواعيد' : ' sessions')])
                    ]),
                    D.Div({ attrs: { class: 'grid grid-cols-4 gap-2' } }, reqItems.map(function (item) {
                        var isBooked = item.status === 'Booked';
                        var itemClass = 'text-xs p-2 rounded border text-center ' + (isBooked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700');
                        var label = item.booking_date || item.generated_date;
                        if (item.start_time) label += ' ' + item.start_time.slice(0, 5);
                        return D.Div({ attrs: { class: itemClass } }, [
                            D.Div({}, [label]),
                            D.Div({ attrs: { class: 'font-semibold' } }, [item.status])
                        ]);
                    }))
                ]);
            }))
        ]);
    }

    function renderEditor(appState) {
        var state = appState.data.screens.contracts || {};
        var editor = state.editor || {};
        var lang = appState.env.lang;

        if (!editor.open) return null;
        var readOnly = !!editor.readonly;
        var allowLineEdit = !readOnly;
        var allowPaymentEdit = !readOnly;

        var headerForm = editor.form || {};
        var patientSearch = editor.patientSearch || initPatientSearch(lang);
        var lineDraft = editor.lineDraft || initLineDraft();
        var paymentDraft = editor.paymentDraft || initPaymentDraft();
        var lines = editor.lines || [];
        var payments = editor.payments || [];
        var selectedSlots = editor.selectedSlots || [];
        var selectedBlocks = editor.selectedBlocks || [];
        var slotsCache = editor.slotsCache || { loading: false, list: [], error: null };

        var totalSessions = lines.reduce(function (sum, row) { return sum + Number(row.sessions_count || 0); }, 0);
        var totalAmount = lines.reduce(function (sum, row) { return sum + Number(row.price_total || 0); }, 0);
        var paidAmount = payments.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
        var remaining = Math.max(0, totalAmount - paidAmount);

        var lineRefs = (appState.data.referenceData && appState.data.referenceData['clinic_contracts_lines']) || {};
        var services = lineRefs.clinic_services || [];
        var packages = lineRefs.clinic_service_packages || [];
        var tiers = lineRefs.clinic_service_package_tiers || [];
        var serviceTypeLinks = lineRefs.clinic_service_clinic_types || [];
        var clinicType = resolveClinicType(appState, headerForm.clinic_type);
        var baseSlotMinutes = resolveBaseSlotMinutes(clinicType);
        var serviceMinutes = resolveActiveServiceMinutes(editor, services, packages, clinicType);
        var isConsultation = isConsultationType(clinicType, lang);

        if (clinicType) {
            var clinicTypeId = String(getRecordId(clinicType));
            var allowedServiceIds = serviceTypeLinks
                .filter(function (row) { return String(getRecordId(row.clinic_type)) === clinicTypeId; })
                .map(function (row) { return String(getRecordId(row.service)); });

            services = services.filter(function (row) {
                if (allowedServiceIds.length > 0) {
                    return allowedServiceIds.indexOf(String(getRecordId(row))) !== -1;
                }
                return row && row.clinic_type && String(getRecordId(row.clinic_type)) === clinicTypeId;
            });

            packages = packages.filter(function (row) {
                if (allowedServiceIds.length > 0) {
                    return allowedServiceIds.indexOf(String(getRecordId(row.service))) !== -1;
                }
                var srv = services.find(function (s) { return String(getRecordId(s)) === String(getRecordId(row.service)); });
                return srv && srv.clinic_type && String(getRecordId(srv.clinic_type)) === clinicTypeId;
            });
        }
        var tierOptions = tiers;
        if (lineDraft.service) {
            var selectedServiceId = String(getRecordId(lineDraft.service));
            var servicePackageIds = packages
                .filter(function (p) { return String(getRecordId(p.service)) === selectedServiceId; })
                .map(function (p) { return String(getRecordId(p)); });

            tierOptions = tiers.filter(function (row) {
                var pId = String(getRecordId(row.package || row.service_package));
                return servicePackageIds.indexOf(pId) !== -1;
            });
        } else {
            tierOptions = [];
        }
        var paymentMethods = (state.options && state.options.paymentMethods) || [];
        var linesWithBookings = lines.map(function (line) {
            var blocks = (editor.lineBookings || {})[line.id] || [];
            var summary = buildBookingSummary(blocks);
            return Object.assign({}, line, {
                booking_blocks: blocks,
                booking_summary: summary.label,
                booking_count: summary.count
            });
        });

        function mapOptions(rows, labelFn) {
            return (rows || []).map(function (row) {
                var id = getRecordId(row);
                return { id: id, label: (labelFn ? labelFn(row) : resolveOptionLabel(row, lang)) || id };
            }).filter(function (opt) { return opt.id; });
        }

        function tierLabel(row) {
            var count = row && row.sessions_count;
            var price = row && row.price_total;
            var countLabel = count ? (lang === 'ar' ? (count + ' جلسة') : (count + ' sessions')) : '';
            var priceLabel = price ? formatMoney(price) : '';
            if (countLabel && priceLabel) return countLabel + ' • ' + priceLabel;
            return countLabel || priceLabel || resolveOptionLabel(row, lang);
        }

        function packageLabel(row) {
            var base = resolveLangName(row, lang) || resolveOptionLabel(row, lang);
            var packId = getRecordId(row);
            var defaultTier = tiers.find(function (tier) {
                return String(getRecordId(tier.package || tier.service_package)) === String(packId) && String(tier.is_default) === '1';
            }) || tiers.find(function (tier) {
                return String(getRecordId(tier.package || tier.service_package)) === String(packId);
            });
            var count = defaultTier && defaultTier.sessions_count;
            return count ? (base + ' • ' + count) : base;
        }

        function fallbackColumn(name, type, component) {
            return {
                name: name,
                type: type,
                component: component,
                source: (component === 'select' || component === 'select' || type === 'uuid' || name.indexOf('_doctor') !== -1 || name === 'clinic_type') ? 'fk' : 'direct',
                labels: { ar: name, en: name }
            };
        }

        function renderBookingCell(row) {
            var blocks = row.booking_blocks || [];
            if (!blocks.length) return D.Span({ attrs: { class: 'text-[var(--muted-foreground)]' } }, ['—']);
            var summary = buildBookingSummary(blocks);
            var extraCount = Math.max(0, summary.count - 1);
            return D.Div({ attrs: { class: 'flex items-center justify-center gap-2' } }, [
                D.Span({ attrs: { class: 'text-xs' } }, [summary.label]),
                extraCount ? D.Button({
                    attrs: {
                        class: 'text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-1)] border border-[var(--border)]',
                        gkey: 'contracts:booking-preview',
                        'data-record-id': row.id
                    }
                }, ['+' + extraCount]) : null
            ].filter(Boolean));
        }

        var headerSchema = getTableDef(appState, 'clinic_contracts_header');
        var headerRefData = (appState.data.referenceData && appState.data.referenceData['clinic_contracts_header']) || {};
        var headerFields = [
            getSmartColumn(appState, 'clinic_contracts_header', 'clinic_type') || fallbackColumn('clinic_type', 'uuid', 'select'),
            getSmartColumn(appState, 'clinic_contracts_header', 'contract_date') || fallbackColumn('contract_date', 'date', 'date'),
            getSmartColumn(appState, 'clinic_contracts_header', 'start_date') || fallbackColumn('start_date', 'date', 'date'),
            getSmartColumn(appState, 'clinic_contracts_header', 'supervising_doctor') || fallbackColumn('supervising_doctor', 'uuid', 'select'),
            getSmartColumn(appState, 'clinic_contracts_header', 'referral_doctor') || fallbackColumn('referral_doctor', 'uuid', 'select'),
            getSmartColumn(appState, 'clinic_contracts_header', 'notes') || fallbackColumn('notes', 'nvarchar', 'textarea')
        ].filter(function (col) {
            if (!col) return false;
            if (col.name === 'executing_doctor') return false;
            return true;
        });

        var patientItems = (patientSearch.results || []).map(function (row) {
            return { id: getRecordId(row), label: resolvePatientLabel(row, lang) };
        });

        function slotLabel(slot) {
            if (!slot) return '';
            return slot.label || '';
        }

        var blockOptions = buildSlotBlocks(slotsCache.list || [], baseSlotMinutes, serviceMinutes);

        var modalContent = D.Div({ attrs: { class: 'space-y-6' } }, [
            renderTableSection(lang === 'ar' ? 'بيانات التعاقد' : 'Contract Info', null, D.Div({ attrs: { class: 'space-y-6' } }, [
                // Top Row: Patient and Clinic Type
                D.Div({ attrs: { class: 'grid md:grid-cols-12 gap-6' } }, [
                    D.Div({ attrs: { class: 'md:col-span-8' } }, [
                        UC.AutoComplete({
                            label: lang === 'ar' ? 'العميل' : 'Patient',
                            value: patientSearch.query || '',
                            placeholder: patientSearch.placeholder,
                            items: patientItems,
                            open: patientSearch.open,
                            loading: patientSearch.loading,
                            onInputKey: 'contracts:patient-search',
                            onSelectKey: 'contracts:patient-select',
                            actions: [
                                { key: 'contracts:patient-advanced-open', label: lang === 'ar' ? 'بحث متقدم' : 'Advanced', icon: '🔎', variant: 'outline', size: 'sm' },
                                { key: 'contracts:patient-create-open', label: lang === 'ar' ? 'عميل جديد' : 'New Patient', icon: '➕', variant: 'outline', size: 'sm' }
                            ]
                        })
                    ]),
                    D.Div({ attrs: { class: 'md:col-span-4' } }, [
                        (function () {
                            var col = getSmartColumn(appState, 'clinic_contracts_header', 'clinic_type') || fallbackColumn('clinic_type', 'uuid', 'select');
                            return renderField(col, headerForm, headerSchema, headerRefData, lang, 'contracts:update-header', readOnly);
                        })()
                    ])
                ]),

                // Middle Row: Dates and Doctors
                D.Div({ attrs: { class: 'grid md:grid-cols-4 gap-6' } },
                    headerFields
                        .filter(function (col) { return col.name !== 'clinic_type' && col.name !== 'notes'; })
                        .map(function (col) {
                            return renderField(col, headerForm, headerSchema, headerRefData, lang, 'contracts:update-header', readOnly);
                        })
                ),
                null,

                // Bottom Row: Notes
                (function () {
                    var col = getSmartColumn(appState, 'clinic_contracts_header', 'notes') || fallbackColumn('notes', 'nvarchar', 'textarea');
                    return D.Div({ attrs: { class: 'w-full' } }, [
                        renderField(col, headerForm, headerSchema, headerRefData, lang, 'contracts:update-header', readOnly)
                    ]);
                })()
            ])),
            renderTableSection(lang === 'ar' ? 'تفاصيل الخدمات' : 'Service Lines', null, D.Div({ attrs: { class: 'space-y-4' } }, [
                D.Div({ attrs: { class: 'grid lg:grid-cols-12 gap-3 items-end' } }, [
                    D.Div({ attrs: { class: 'lg:col-span-5' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'الخدمة' : 'Service']),
                        D.Select({
                            attrs: { gkey: 'contracts:line-update', 'data-field': 'service', class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm', disabled: !allowLineEdit }
                        }, [
                            D.Option({ attrs: { value: '' } }, ['---'])
                        ].concat(mapOptions(services).map(function (opt) {
                            return D.Option({ attrs: { value: opt.id, selected: String(lineDraft.service) === String(opt.id) } }, [opt.label]);
                        })))
                    ]),
                    D.Div({ attrs: { class: 'lg:col-span-3' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'خطة العلاج / الشرائح' : 'Plan / Tiers']),
                        D.Select({
                            attrs: { gkey: 'contracts:line-update', 'data-field': 'service_package_tier', class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm', disabled: !allowLineEdit || !lineDraft.service }
                        }, [
                            D.Option({ attrs: { value: '', selected: !lineDraft.service_package_tier } }, [lang === 'ar' ? 'جلسة واحدة (افتراضي)' : 'Single Session (Default)'])
                        ].concat(mapOptions(tierOptions, tierLabel).map(function (opt) {
                            return D.Option({ attrs: { value: opt.id, selected: String(lineDraft.service_package_tier) === String(opt.id) } }, [opt.label]);
                        })))
                    ]),
                    D.Div({ attrs: { class: 'lg:col-span-1' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'الجلسات' : 'Sessions']),
                        D.Input({
                            attrs: {
                                type: 'number',
                                value: lineDraft.sessions_count || '',
                                gkey: 'contracts:line-update',
                                'data-field': 'sessions_count',
                                class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm',
                                readonly: !allowLineEdit || lineDraft.mode === 'package'
                            }
                        })
                    ]),
                    D.Div({ attrs: { class: 'lg:col-span-1' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'السعر' : 'Price']),
                        D.Input({
                            attrs: {
                                type: 'number',
                                value: lineDraft.unit_price || '',
                                gkey: 'contracts:line-update',
                                'data-field': 'unit_price',
                                class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm',
                                readonly: !allowLineEdit
                            }
                        })
                    ]),
                    D.Div({ attrs: { class: 'lg:col-span-2' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'الإجمالي' : 'Total']),
                        D.Input({
                            attrs: {
                                type: 'number',
                                value: lineDraft.price_total || '',
                                gkey: 'contracts:line-update',
                                'data-field': 'price_total',
                                class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold text-lg',
                                readonly: true
                            }
                        })
                    ]),
                    allowLineEdit ? D.Div({ attrs: { class: 'lg:col-span-12 flex items-center gap-2' } }, [
                        UC.Button({ key: 'contracts:line-add', label: lang === 'ar' ? (lineDraft.id ? 'تحديث السطر' : 'إضافة سطر') : (lineDraft.id ? 'Update Line' : 'Add Line'), icon: '➕', variant: 'primary', size: 'sm' }),
                        lineDraft.id ? UC.Button({ key: 'contracts:line-cancel', label: lang === 'ar' ? 'إلغاء' : 'Cancel', variant: 'ghost', size: 'sm' }) : null
                    ].filter(Boolean)) : null
                ]),
                UC.Table({
                    columns: [
                        { key: 'service', label: lang === 'ar' ? 'الخدمة' : 'Service' },
                        { key: 'sessions_count', label: lang === 'ar' ? 'الجلسات' : 'Sessions' },
                        { key: 'booking_summary', label: lang === 'ar' ? 'المواعيد' : 'Bookings', render: renderBookingCell },
                        { key: 'price_total', label: lang === 'ar' ? 'الإجمالي' : 'Total' }
                    ],
                    data: linesWithBookings,
                    schemaInfo: appState.data.schemaInfo,
                    referenceData: (appState.data.referenceData && appState.data.referenceData['clinic_contracts_lines']) || {},
                    tableName: 'clinic_contracts_lines',
                    lang: lang,
                    actions: allowLineEdit ? [
                        { key: 'contracts:open-wizard', label: lang === 'ar' ? 'حجز' : 'Schedule', icon: '📅', variant: 'outline' },
                        { key: 'contracts:line-edit', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'outline' },
                        { key: 'contracts:line-remove', label: lang === 'ar' ? 'حذف' : 'Remove', icon: '🗑️', variant: 'danger' }
                    ] : []
                }),
                D.Div({ attrs: { class: 'flex items-center justify-between text-sm' } }, [
                    D.Span({}, [lang === 'ar' ? 'إجمالي الجلسات' : 'Total Sessions']),
                    D.Span({ attrs: { class: 'font-semibold' } }, [String(totalSessions || 0)])
                ])
            ])),
            renderTableSection(lang === 'ar' ? 'السداد' : 'Payments', null, D.Div({ attrs: { class: 'space-y-4' } }, [
                D.Div({ attrs: { class: 'grid lg:grid-cols-12 gap-3 items-end' } }, [
                    D.Div({ attrs: { class: 'lg:col-span-4' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'طريقة الدفع' : 'Method']),
                        D.Select({
                            attrs: { gkey: 'contracts:payment-update', 'data-field': 'method', class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm', disabled: !allowPaymentEdit }
                        }, [
                            D.Option({ attrs: { value: '' } }, ['---'])
                        ].concat(mapOptions(paymentMethods, function (row) { return resolveOptionLabel(row, lang); }).map(function (opt) {
                            return D.Option({ attrs: { value: opt.label, selected: String(paymentDraft.method) === String(opt.label) } }, [opt.label]);
                        })))
                    ]),
                    D.Div({ attrs: { class: 'lg:col-span-3' } }, [
                        D.Label({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)] mb-2 block' } }, [lang === 'ar' ? 'المبلغ' : 'Amount']),
                        D.Input({
                            attrs: {
                                type: 'number',
                                value: paymentDraft.amount || '',
                                gkey: 'contracts:payment-update',
                                'data-field': 'amount',
                                class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm',
                                readonly: !allowPaymentEdit
                            }
                        })
                    ]),
                    allowPaymentEdit ? D.Div({ attrs: { class: 'lg:col-span-5 flex items-center gap-2' } }, [
                        UC.Button({ key: 'contracts:payment-add', label: lang === 'ar' ? (paymentDraft.id ? 'تحديث الدفع' : 'إضافة دفعة') : (paymentDraft.id ? 'Update Payment' : 'Add Payment'), icon: '💳', variant: 'primary', size: 'sm' }),
                        paymentDraft.id ? UC.Button({ key: 'contracts:payment-cancel', label: lang === 'ar' ? 'إلغاء' : 'Cancel', variant: 'ghost', size: 'sm' }) : null
                    ].filter(Boolean)) : null
                ]),
                UC.Table({
                    columns: [
                        { key: 'method', label: lang === 'ar' ? 'الوسيلة' : 'Method' },
                        { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' }
                    ],
                    data: payments,
                    schemaInfo: appState.data.schemaInfo,
                    referenceData: (appState.data.referenceData && appState.data.referenceData['clinic_payments']) || {},
                    tableName: 'clinic_payments',
                    lang: lang,
                    actions: allowPaymentEdit ? [
                        { key: 'contracts:payment-edit', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'outline' },
                        { key: 'contracts:payment-remove', label: lang === 'ar' ? 'حذف' : 'Remove', icon: '🗑️', variant: 'danger' }
                    ] : []
                }),
                D.Div({ attrs: { class: 'grid md:grid-cols-3 gap-3 text-sm' } }, [
                    D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3 flex items-center justify-between' } }, [
                        D.Span({}, [lang === 'ar' ? 'الإجمالي' : 'Total']),
                        D.Span({ attrs: { class: 'font-semibold' } }, [formatMoney(totalAmount)])
                    ]),
                    D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3 flex items-center justify-between' } }, [
                        D.Span({}, [lang === 'ar' ? 'المدفوع' : 'Paid']),
                        D.Span({ attrs: { class: 'font-semibold' } }, [formatMoney(paidAmount)])
                    ]),
                    D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3 flex items-center justify-between' } }, [
                        D.Span({}, [lang === 'ar' ? 'المتبقي' : 'Remaining']),
                        D.Span({ attrs: { class: 'font-semibold' } }, [formatMoney(remaining)])
                    ])
                ])
            ]))
     /* ,renderTableSection(lang === 'ar' ? 'الحجز' : 'Scheduling', null, D.Div({ attrs: { class: 'space-y-4' } }, [
        D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, [
          // Wizard button removed
          UC.Button({ key: 'contracts:slots-load', label: lang === 'ar' ? 'تحميل المواعيد' : 'Load Slots', icon: '🗓️', variant: 'outline', size: 'sm', disabled: editor.loading }),
          UC.Button({ key: 'contracts:slots-auto', label: lang === 'ar' ? 'تسكين تلقائي' : 'Auto Fill', icon: '✨', variant: 'primary', size: 'sm', disabled: editor.loading }),
          D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [(lang === 'ar' ? 'مدة الجلسة: ' : 'Session length: ') + String(serviceMinutes || 0) + (lang === 'ar' ? ' دقيقة' : ' min')])
        ]),
        renderBookingPlan(editor, lang),
        D.Div({ attrs: { class: 'grid lg:grid-cols-2 gap-4' } }, [
          D.Div({ attrs: { class: 'space-y-2' } }, [
            D.Div({ attrs: { class: 'text-sm font-semibold' } }, [lang === 'ar' ? 'المواعيد المتاحة' : 'Available Slots']),
            D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] bg-[var(--card)] max-h-64 overflow-y-auto' } }, [
              slotsCache.loading ? D.Div({ attrs: { class: 'px-3 py-3 text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...']) :
                blockOptions.length ? D.Ul({ attrs: { class: 'divide-y divide-[var(--border)]' } }, blockOptions.map(function (slot) {
                  var slotId = slot.id;
                  var isSelected = selectedBlocks.some(function (s) { return String(s.id) === String(slotId); });
                  return D.Li({
                    attrs: {
                      class: 'px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--surface-1)] cursor-pointer',
                      gkey: 'contracts:slot-toggle',
                      'data-id': slotId
                    }
                  }, [
                    D.Span({}, [slotLabel(slot)]),
                    D.Span({ attrs: { class: 'text-xs' } }, [isSelected ? '✓' : '+'])
                  ]);
                })) : D.Div({ attrs: { class: 'px-3 py-3 text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لا توجد مواعيد متاحة' : 'No available slots'])
            ])
          ]),
          D.Div({ attrs: { class: 'space-y-2' } }, [
            D.Div({ attrs: { class: 'text-sm font-semibold' } }, [lang === 'ar' ? 'المواعيد المختارة' : 'Selected Slots']),
            D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] bg-[var(--card)] max-h-64 overflow-y-auto' } }, [
              selectedBlocks.length ? D.Ul({ attrs: { class: 'divide-y divide-[var(--border)]' } }, selectedBlocks.map(function (slot) {
                return D.Li({ attrs: { class: 'px-3 py-2 text-sm flex items-center justify-between' } }, [
                  D.Span({}, [slotLabel(slot)]),
                  D.Button({ attrs: { class: 'text-xs text-[var(--danger)]', gkey: 'contracts:slot-toggle', 'data-id': slot.id } }, ['✕'])
                ]);
              })) : D.Div({ attrs: { class: 'px-3 py-3 text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لم يتم اختيار مواعيد بعد' : 'No slots selected'])
            ])
          ])
        ])
      ])) */,
            D.Div({ attrs: { class: 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-wrap items-center justify-between gap-3' } }, [
                D.Div({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'سوف يتم إنشاء الفاتورة والحجوزات تلقائياً بعد التأكيد.' : 'Invoice and bookings will be generated after confirmation.']),
                D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, [
                    UC.Button({ key: 'contracts:cancel-editor', label: lang === 'ar' ? 'إلغاء' : 'Cancel', variant: 'ghost', disabled: editor.loading }),
                    UC.Button({ key: 'contracts:confirm', label: lang === 'ar' ? (editor.loading ? 'جاري الحفظ...' : 'تأكيد التعاقد') : (editor.loading ? 'Saving...' : 'Confirm Contract'), icon: '✅', variant: 'primary', disabled: editor.loading })
                ])
            ])
        ]);

        // Get modal size from editor state or default to 'xl'
        var modalSize = editor.modalSize || 'xl';

        return UI.Modal({
            open: true,
            title: lang === 'ar' ? 'تعاقد جديد' : 'New Contract',
            size: modalSize,
            sizeKey: 'contracts:modal:size',
            sizeOptions: ['md', 'lg', 'xl', 'full'],
            closeGkey: 'contracts:cancel-editor',
            content: modalContent,
            actions: []
        });
    }

    function renderModal(appState) {
        var state = appState.data.screens.contracts || {};
        var modal = state.modal || {};
        var lang = appState.env.lang;
        if (!global.ClinicSchemaCrud || !modal.open) return null;
        var tableName = modal.table;
        var referenceData = (appState.data.referenceData && appState.data.referenceData[tableName]) || {};

        if (tableName === 'clinic_contract_schedule_preferences') {
            var lines = (state.editor && state.editor.lines) || [];
            var lineOptions = lines.map(function (line) {
                return Object.assign({}, line, {
                    display_name: line.display_name || line.service_name || line.service || line.id
                });
            });
            referenceData = Object.assign({}, referenceData, { clinic_contracts_lines: lineOptions });
        }

        return global.ClinicSchemaCrud.renderModal(appState, {
            open: modal.open,
            table: tableName,
            form: modal.form,
            meta: resolveSchemaColumns(appState, tableName),
            groups: null, // Let schema-crud derive groups
            fkOptions: null, // Let schema-crud build options
            fkReferenceCache: referenceData,
            translations: modal.translations,
            translationFields: modal.translationFields,
            languages: modal.languages,
            errors: modal.errors,
            tab: modal.activeTab || modal.tab,
            loading: modal.loading,
            title: modal.title,
            readonly: modal.mode === 'view',
            records: modal.records,
            onAddFk: 'contracts:patient-add-fk' // Pass the FK add handler key
        });
    }

    function renderPatientSearchModal(appState) {
        var state = appState.data.screens.contracts || {};
        var editor = state.editor || {};
        var modal = editor.patientSearchModal || {};
        var lang = appState.env.lang;
        if (!modal.open) return null;
        var items = (modal.results || []).map(function (row) {
            return { id: getRecordId(row), label: resolvePatientLabel(row, lang) };
        });

        var content = D.Div({ attrs: { class: 'space-y-4' } }, [
            D.Input({
                attrs: {
                    type: 'text',
                    value: modal.query || '',
                    gkey: 'contracts:patient-advanced-search',
                    class: 'w-full h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:ring-2 focus:ring-[var(--primary)]',
                    placeholder: lang === 'ar' ? 'ابحث بالاسم أو الهاتف...' : 'Search by name or phone...'
                }
            }),
            modal.loading ? D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'جارٍ البحث...' : 'Searching...']) :
                (items.length ? D.Ul({ attrs: { class: 'divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]' } }, items.map(function (item) {
                    return D.Li({
                        attrs: {
                            class: 'px-4 py-3 text-sm hover:bg-[var(--surface-1)] cursor-pointer',
                            gkey: 'contracts:patient-advanced-select',
                            'data-id': item.id
                        }
                    }, [item.label]);
                })) : D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لا توجد نتائج' : 'No results']))
        ]);

        return UI.Modal({
            open: true,
            title: lang === 'ar' ? 'بحث متقدم عن عميل' : 'Advanced Patient Search',
            size: 'lg',
            closeGkey: 'contracts:patient-advanced-close',
            content: content,
            actions: [UC.Button({ key: 'contracts:patient-advanced-close', label: lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })]
        });
    }

    function renderContextMenu(state, lang) {
        var ctxMenu = state.contextMenu;
        if (!ctxMenu || !ctxMenu.visible) return null;

        var menuItems = [
            { key: 'contracts:ctx-info', label: lang === 'ar' ? 'استعراض' : 'View', icon: '👁️' },
            { key: 'contracts:ctx-edit', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️' }
        ];

        return D.Div({
            attrs: {
                class: 'fixed bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl py-1 min-w-[200px] z-[200]',
                style: 'left: ' + ctxMenu.x + 'px; top: ' + ctxMenu.y + 'px;',
                gkey: 'contracts:close-context-menu'
            }
        }, menuItems.map(function (item) {
            if (item.divider) {
                return D.Div({ attrs: { class: 'h-px bg-[var(--border)] my-1' } });
            }
            return D.Button({
                attrs: {
                    type: 'button',
                    gkey: item.key,
                    'data-record-id': ctxMenu.recordId,
                    class: 'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-[var(--muted)] text-[var(--foreground)]'
                }
            }, [
                D.Span({ attrs: { class: 'text-base' } }, [item.icon]),
                D.Span({}, [item.label])
            ]);
        }));
    }

    function renderInfoModal(appState) {
        var state = appState.data.screens.contracts || {};
        var info = state.infoModal || {};
        var lang = appState.env.lang;
        if (!info.open) return null;
        var data = info.data || {};
        var header = data.header || {};
        var lines = data.lines || [];
        var payments = data.payments || [];
        var bookings = data.bookings || [];
        var totals = data.totals || {};

        var summaryItems = [
            { label: lang === 'ar' ? 'العميل' : 'Patient', value: formatDisplayValue(resolveFkValue(appState, 'clinic_contracts_header', 'patient', header.patient, lang)) },
            { label: lang === 'ar' ? 'تاريخ التعاقد' : 'Contract Date', value: formatDate(header.contract_date) },
            { label: lang === 'ar' ? 'تاريخ البداية' : 'Start Date', value: formatDate(header.start_date) },
            { label: lang === 'ar' ? 'الطبيب المشرف' : 'Supervising Doctor', value: formatDisplayValue(resolveFkValue(appState, 'clinic_contracts_header', 'supervising_doctor', header.supervising_doctor, lang)) },
            { label: lang === 'ar' ? 'الطبيب المعالج' : 'Executing Doctor', value: formatDisplayValue(resolveFkValue(appState, 'clinic_contracts_header', 'executing_doctor', header.executing_doctor, lang)) },
            { label: lang === 'ar' ? 'دكتور الإحالة' : 'Referral Doctor', value: formatDisplayValue(resolveFkValue(appState, 'clinic_contracts_header', 'referral_doctor', header.referral_doctor, lang)) },
            { label: lang === 'ar' ? 'الحالة' : 'Status', value: header.contract_status || '—' }
        ];

        var content = D.Div({ attrs: { class: 'space-y-6' } }, [
            D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-4' } }, summaryItems.map(function (item) {
                return D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3' } }, [
                    D.Div({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)]' } }, [item.label]),
                    D.Div({ attrs: { class: 'text-sm font-medium mt-1' } }, [String(item.value || '—')])
                ]);
            })),
            header.notes ? D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3' } }, [
                D.Div({ attrs: { class: 'text-xs font-semibold text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'ملاحظات' : 'Notes']),
                D.Div({ attrs: { class: 'text-sm mt-1 whitespace-pre-wrap' } }, [String(header.notes || '')])
            ]) : null,
            renderTableSection(lang === 'ar' ? 'الخدمات' : 'Services', null, UC.Table({
                columns: [
                    { key: 'service', label: lang === 'ar' ? 'الخدمة' : 'Service' },
                    { key: 'sessions_count', label: lang === 'ar' ? 'الجلسات' : 'Sessions' },
                    { key: 'price_total', label: lang === 'ar' ? 'الإجمالي' : 'Total' }
                ],
                data: lines,
                schemaInfo: appState.data.schemaInfo,
                referenceData: (appState.data.referenceData && appState.data.referenceData['clinic_contracts_lines']) || {},
                tableName: 'clinic_contracts_lines',
                lang: lang
            })),
            renderTableSection(lang === 'ar' ? 'المدفوعات' : 'Payments', null, UC.Table({
                columns: [
                    { key: 'method', label: lang === 'ar' ? 'الوسيلة' : 'Method' },
                    { key: 'amount', label: lang === 'ar' ? 'المبلغ' : 'Amount' }
                ],
                data: payments,
                schemaInfo: appState.data.schemaInfo,
                referenceData: (appState.data.referenceData && appState.data.referenceData['clinic_payments']) || {},
                tableName: 'clinic_payments',
                lang: lang
            })),
            renderTableSection(lang === 'ar' ? 'سجل الحجز' : 'Bookings', null, UC.Table({
                columns: [
                    { key: 'slot_label', label: lang === 'ar' ? 'الموعد' : 'Slot' },
                    { key: 'booking_status', label: lang === 'ar' ? 'الحالة' : 'Status' }
                ],
                data: bookings,
                lang: lang
            })),
            D.Div({ attrs: { class: 'grid md:grid-cols-3 gap-3 text-sm' } }, [
                D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3 flex items-center justify-between' } }, [
                    D.Span({}, [lang === 'ar' ? 'الإجمالي' : 'Total']),
                    D.Span({ attrs: { class: 'font-semibold' } }, [formatMoney(totals.totalAmount || 0)])
                ]),
                D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3 flex items-center justify-between' } }, [
                    D.Span({}, [lang === 'ar' ? 'المدفوع' : 'Paid']),
                    D.Span({ attrs: { class: 'font-semibold' } }, [formatMoney(totals.paidAmount || 0)])
                ]),
                D.Div({ attrs: { class: 'rounded-lg border border-[var(--border)] p-3 flex items-center justify-between' } }, [
                    D.Span({}, [lang === 'ar' ? 'المتبقي' : 'Remaining']),
                    D.Span({ attrs: { class: 'font-semibold' } }, [formatMoney(totals.remaining || 0)])
                ])
            ])
        ].filter(Boolean));

        return UI.Modal({
            open: true,
            title: lang === 'ar' ? 'تفاصيل العقد' : 'Contract Details',
            size: 'lg',
            closeGkey: 'contracts:info-close',
            content: content,
            actions: [
                UC.Button({ key: 'contracts:ctx-edit', label: lang === 'ar' ? 'تعديل' : 'Edit', icon: '✏️', variant: 'outline', attrs: { 'data-record-id': getRecordId(header) } }),
                UC.Button({ key: 'contracts:info-close', label: lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })
            ]
        });
    }

    function renderContractsTable(columns, data, activeId, rowKey, lang) {
        if (!data || !data.length) {
            return D.Div({ attrs: { class: 'p-8 text-center text-gray-500 border rounded-lg' } }, [
                lang === 'ar' ? 'لا توجد بيانات' : 'No Data'
            ]);
        }

        return D.Div({ attrs: { class: 'overflow-x-auto rounded-lg border border-[var(--border)]' } }, [
            D.Table({ attrs: { class: 'w-full text-sm' } }, [
                D.Thead({ attrs: { class: 'bg-[var(--muted)]/50' } }, [
                    D.Tr({}, columns.map(function (col) {
                        return D.Th({ attrs: { class: 'h-10 px-4 text-start font-medium text-[var(--muted-foreground)] whitespace-nowrap' } }, [col.label || col.key]);
                    }))
                ]),
                D.Tbody({}, data.map(function (row, idx) {
                    var id = getRecordId(row);
                    if (!id) id = 'row-' + idx;
                    var isActive = String(id) === String(activeId);
                    return D.Tr({
                        attrs: {
                            class: 'border-t hover:bg-[var(--muted)]/50 transition-colors ' + (isActive ? 'bg-[var(--muted)]' : ''),
                            'data-id': id,
                            gkey: rowKey
                        }
                    }, columns.map(function (col) {
                        var rawValue = col.render ? col.render(row) : row[col.key];
                        var content = col.render ? rawValue : formatTableCellValue(rawValue);
                        return D.Td({ attrs: { class: 'p-4 align-middle' } }, [content]);
                    }));
                }))
            ])
        ]);
    }

    function formatTableCellValue(value) {
        if (value === undefined || value === null || value === '') return '—';
        if (typeof value === 'object') return formatDisplayValue(value);
        return String(value);
    }

    function renderScreen(appState) {
        var state = appState.data.screens.contracts || {};
        var lang = appState.env.lang;
        var columns = buildLineColumns(appState, 'clinic_contracts_header', state.list || []);

        // Inject Action Column
        var actionColumn = {
            key: 'actions',
            label: lang === 'ar' ? 'إجراءات' : 'Actions',
            sortable: false,
            render: function (row) {
                return D.Div({ attrs: { class: 'flex items-center justify-end gap-2' } }, [
                    D.Button({
                        attrs: {
                            class: 'p-1 hover:bg-[var(--accent)] rounded text-[var(--foreground)]',
                            title: lang === 'ar' ? 'استعراض' : 'View',
                            gkey: 'contracts:ctx-info',
                            'data-record-id': getRecordId(row)
                        }
                    }, ['👁️']),
                    D.Button({
                        attrs: {
                            class: 'p-1 hover:bg-[var(--accent)] rounded text-[var(--foreground)]',
                            title: lang === 'ar' ? 'تعديل' : 'Edit',
                            gkey: 'contracts:ctx-edit',
                            'data-record-id': getRecordId(row)
                        }
                    }, ['✏️']),
                    D.Button({
                        attrs: {
                            class: 'p-1 hover:bg-[var(--accent)] rounded text-[var(--foreground)]',
                            title: lang === 'ar' ? 'طباعة' : 'Print',
                            gkey: 'contracts:print-main',
                            'data-record-id': getRecordId(row)
                        }
                    }, ['🖨️'])
                ]);
            }
        };

        // Add actions as the last column
        var displayColumns = columns.slice().concat([actionColumn]);

        return D.Div({ attrs: { class: 'space-y-4' } }, [
            D.Div({ attrs: { class: 'flex flex-wrap items-center justify-between gap-3' } }, [
                D.Div({ attrs: { class: 'flex items-center gap-4' } }, [
                    D.Div({ attrs: { class: 'text-2xl font-bold' } }, [lang === 'ar' ? 'نموذج طلب خدمة طبية' : 'Medical Service Request Form']),
                    D.Input({
                        attrs: {
                            key: 'contracts-search-input',
                            key: 'contracts-search-input',
                            type: 'search',
                            placeholder: lang === 'ar' ? 'بحث (اسم العميل / الهاتف)...' : 'Search (Patient / Phone)...',
                            class: 'w-64 h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:ring-2 focus:ring-[var(--primary)]',
                            value: state.search || '',
                            gkey: 'contracts:search'
                        }
                    })
                ]),
                D.Div({ attrs: { class: 'flex flex-wrap items-center gap-2' } }, [
                    UC.Button({ key: 'contracts:new', label: lang === 'ar' ? 'عقد جديد' : 'New Contract', icon: '➕', variant: 'primary' })
                ])
            ]),
            renderContractsTable(displayColumns, state.list || [], state.selectedId, 'contracts:select', lang),
            D.Div({ attrs: { class: 'flex items-center justify-between p-2' } }, [
                D.Button({
                    attrs: {
                        class: 'px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50',
                        gkey: 'contracts:page-prev',
                        disabled: !state.page || state.page <= 1
                    }
                }, [lang === 'ar' ? 'السابق' : 'Previous']),
                D.Span({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [
                    (lang === 'ar' ? 'صفحة ' : 'Page ') + (state.page || 1)
                ]),
                D.Button({
                    attrs: {
                        class: 'px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50',
                        gkey: 'contracts:page-next',
                        disabled: (state.list || []).length < (state.limit || 50)
                    }
                }, [lang === 'ar' ? 'التالي' : 'Next'])
            ]),
            renderEditor(appState),
            renderInfoModal(appState),
            renderModal(appState),
            renderPatientSearchModal(appState),
            renderContextMenu(state, lang),
            renderBlockInfoModal(appState),
            renderBookingPreviewModal(appState),
            renderPrintModal(appState)
        ]);
    }

    function buildPrintServiceLabel(appState, line, lang) {
        if (!line) return '';
        var parts = [];
        var serviceLabel = resolveFkValue(appState, 'clinic_contracts_lines', 'service', line.service, lang);
        if (serviceLabel) parts.push(serviceLabel);
        var packageLabel = resolveFkValue(appState, 'clinic_contracts_lines', 'service_package', line.service_package, lang);
        if (packageLabel && parts.indexOf(packageLabel) === -1) parts.push(packageLabel);
        var tierLabel = resolveFkValue(appState, 'clinic_contracts_lines', 'service_package_tier', line.service_package_tier, lang);
        if (tierLabel && parts.indexOf(tierLabel) === -1) parts.push(tierLabel);
        if (!parts.length) {
            var fallback = line.service_name || line.label || line.name;
            if (fallback) parts.push(formatDisplayValue(fallback));
        }
        return parts.join(' • ');
    }

    function formatPrintBookingItem(item) {
        if (!item) return '';
        var parts = [];
        var date = item.booking_date || item.generated_date || item.date;
        if (date) parts.push(formatDate(date));
        var start = item.start_time || item.slot_time_start;
        if (start) parts.push((start || '').slice(0, 5));
        var end = item.end_time || item.slot_time_end;
        if (end) parts.push('- ' + (end || '').slice(0, 5));
        if (!start && !end && item.slot_label) parts.push(item.slot_label);
        if (item.booking_status) parts.push('(' + item.booking_status + ')');
        return parts.filter(Boolean).join(' ');
    }

    function formatPrintScheduleRow(row) {
        if (!row) return '';
        var parts = [];
        if (row.pattern_summary) parts.push(row.pattern_summary);
        var dayLabel = row.day_name || row.day || row.week_day;
        if (dayLabel) parts.push(dayLabel);
        var start = row.start_time || row.slot_time_start || row.preferred_time;
        var end = row.end_time || row.slot_time_end;
        if (start) {
            parts.push((start || '').slice(0, 5) + (end ? (' - ' + (end || '').slice(0, 5)) : ''));
        }
        if (row.frequency) parts.push(row.frequency);
        return parts.filter(Boolean).join(' • ');
    }

    function renderPrintModal(appState) {
        var state = appState.data.screens.contracts || {};
        var print = state.printModal || {};
        var lang = appState.env.lang;
        if (!print.open) return null;

        var content;
        if (print.loading || !print.details) {
            content = D.Div({ attrs: { class: 'print-preview-container p-8 bg-white text-black text-center text-sm text-[var(--muted-foreground)]' } }, [
                lang === 'ar' ? 'جاري تحميل نموذج الطباعة...' : 'Loading print template...'
            ]);
        } else {
            var details = print.details || {};
            var header = details.header || {};
            var lines = details.lines || [];
            var payments = details.payments || [];
            var bookings = details.bookings || [];
            var bookingRequests = details.bookingRequests || [];
            var bookingItems = details.bookingItems || [];
            var schedule = details.schedule || [];
            var totals = details.totals || {};

            var patientName = resolveFkValue(appState, 'clinic_contracts_header', 'patient', header.patient, lang) ||
                formatDisplayValue(header.patient_name || header.patient_label || header.patient);
            var patientPhone = header.patient_phone || header.patient_mobile || header.mobile || header.phone || '';
            var statusLabel = formatDisplayValue(header.contract_status || header.status || '');
            var clinicTypeLabel = resolveFkValue(appState, 'clinic_contracts_header', 'clinic_type', header.clinic_type, lang);
            var supervisingDoctor = resolveFkValue(appState, 'clinic_contracts_header', 'supervising_doctor', header.supervising_doctor, lang);
            var executingDoctor = resolveFkValue(appState, 'clinic_contracts_header', 'executing_doctor', header.executing_doctor, lang) || supervisingDoctor;
            var referralDoctor = formatDisplayValue(header.referral_doctor || header.referral_doctor_name || '');
            var contractDate = formatDate(header.contract_date);
            var startDate = formatDate(header.start_date || header.contract_date);
            var contractIdLabel = getRecordId(header) || print.contractId || '';
            var metaSections = [
                [
                    { labelEn: 'Patient', labelAr: 'المريض', value: patientName },
                    { labelEn: 'Phone', labelAr: 'الهاتف', value: patientPhone },
                    { labelEn: 'Clinic Type', labelAr: 'نوع الخدمة', value: clinicTypeLabel },
                    { labelEn: 'Contract Date', labelAr: 'تاريخ العقد', value: contractDate }
                ],
                [
                    { labelEn: 'Doctor (Supervising)', labelAr: 'الطبيب المشرف', value: supervisingDoctor },
                    { labelEn: 'Doctor (Executing)', labelAr: 'الطبيب التنفيذي', value: executingDoctor },
                    { labelEn: 'Referral', labelAr: 'المنسوب', value: referralDoctor },
                    { labelEn: 'Start Date', labelAr: 'بداية الخدمة', value: startDate }
                ]
            ];
            var totalsValues = {
                total: totals.totalAmount || header.total_amount || 0,
                paid: totals.paidAmount || header.paid_amount || 0,
                remaining: typeof totals.remaining === 'number' ? totals.remaining : Math.max(0, (totals.totalAmount || header.total_amount || 0) - (totals.paidAmount || header.paid_amount || 0))
            };

            var serviceRows = lines.map(function (line, idx) {
                var label = buildPrintServiceLabel(appState, line, lang) || ('#' + (idx + 1));
                var sessions = line.sessions_count || line.session_count || line.sessions || 1;
                var duration = line.duration_minutes || line.service_minutes || line.time_minutes || '';
                var unitPrice = line.unit_price || line.price || 0;
                var totalPrice = line.price_total || line.total_price || line.amount || line.price || 0;
                return D.Tr({
                    attrs: { class: 'border-b last:border-b-0' }
                }, [
                    D.Td({ attrs: { class: 'px-2 py-2 text-[13px]' } }, [label]),
                    D.Td({ attrs: { class: 'px-2 py-2 text-[13px] text-right' } }, [sessions ? sessions + (lang === 'ar' ? ' جلسة' : ' sessions') : '—']),
                    D.Td({ attrs: { class: 'px-2 py-2 text-[13px] text-right' } }, [duration ? (duration + (lang === 'ar' ? ' د' : ' min')) : '—']),
                    D.Td({ attrs: { class: 'px-2 py-2 text-[13px] text-right' } }, [formatMoney(unitPrice)]),
                    D.Td({ attrs: { class: 'px-2 py-2 text-[13px] text-right' } }, [formatMoney(totalPrice)])
                ]);
            });
            var bookingSummaryRows = bookings.map(function (booking) {
                return D.Div({ attrs: { class: 'flex items-center justify-between text-sm gap-2 px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)]' } }, [
                    D.Span({}, [booking.slot_label || '—']),
                    D.Span({ attrs: { class: 'text-[11px] uppercase text-[var(--muted-foreground)]' } }, [booking.booking_status || booking.status || '—'])
                ]);
            });
            var requestSummaryRows = bookingRequests.map(function (req) {
                var label = req.pattern_summary || req.summary || formatDisplayValue(req);
                var count = req.sessions_count || req.sessions || req.count || '';
                return D.Div({ attrs: { class: 'text-sm border-b last:border-b-0 py-1 text-[var(--muted-foreground)]' } }, [
                    D.Span({ attrs: { class: 'font-semibold text-[var(--foreground)]' } }, [label || '—']),
                    count ? D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [lang === 'ar' ? count + ' مواعيد' : count + ' slots']) : null
                ]);
            });
            var generatedItemRows = bookingItems.map(function (item) {
                var label = formatPrintBookingItem(item);
                return D.Div({ attrs: { class: 'text-sm py-1 border-b last:border-b-0' } }, [label || '—']);
            });
            var scheduleRows = schedule.map(function (row) {
                var label = formatPrintScheduleRow(row);
                if (!label) return null;
                return D.Div({ attrs: { class: 'text-sm py-1 border-b last:border-b-0 text-[var(--muted-foreground)]' } }, [label]);
            }).filter(Boolean);

            content = D.Div({ attrs: { class: 'print-preview-container p-8 bg-white text-black space-y-8' } }, [
                D.Div({ attrs: { class: 'space-y-3 border-b pb-4' } }, [
                    D.Div({ attrs: { class: 'flex flex-col md:flex-row md:items-end md:justify-between gap-2' } }, [
                        D.Div({ attrs: { class: 'text-lg font-bold' } }, [lang === 'ar' ? 'نموذج طلب خدمة طبية' : 'Medical Service Request Form']),
                        D.Div({ attrs: { class: 'text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'رقم العقد' : 'Contract #']),
                        D.Div({ attrs: { class: 'text-sm font-semibold' } }, [contractIdLabel || '—'])
                    ]),
                    statusLabel ? D.Div({ attrs: { class: 'text-xs text-[var(--muted-foreground)] flex items-center gap-1' } }, [
                        D.Span({}, [lang === 'ar' ? 'حالة العقد' : 'Contract Status']),
                        D.Span({ attrs: { class: 'font-semibold uppercase' } }, [statusLabel])
                    ]) : null
                ]),
                D.Div({ attrs: { class: 'grid gap-6 md:grid-cols-2' } }, metaSections.map(function (group) {
                    var rows = group.map(function (item) {
                        if (!item || !item.value) return null;
                        return D.Div({ attrs: { class: 'flex justify-between text-sm' } }, [
                            D.Span({ attrs: { class: 'text-[var(--muted-foreground)]' } }, [lang === 'ar' ? item.labelAr : item.labelEn]),
                            D.Span({ attrs: { class: 'font-semibold text-[var(--foreground)]' } }, [item.value])
                        ]);
                    }).filter(Boolean);
                    if (!rows.length) return null;
                    return D.Div({ attrs: { class: 'space-y-1' } }, rows);
                })),
                D.Div({ attrs: { class: 'space-y-2' } }, [
                    D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                        D.Div({ attrs: { class: 'font-semibold text-sm' } }, [lang === 'ar' ? 'الخدمات' : 'Services']),
                        D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'جميع البنود' : 'Line items'])
                    ]),
                    D.Div({ attrs: { class: 'border rounded-lg overflow-hidden' } }, [
                        D.Table({ attrs: { class: 'w-full text-[12px] border-collapse' } }, [
                            D.Thead({}, [
                                D.Tr({}, [
                                    D.Th({ attrs: { class: 'px-2 py-2 text-left text-[var(--muted-foreground)] uppercase text-[10px]' } }, [lang === 'ar' ? 'الخدمة' : 'Service']),
                                    D.Th({ attrs: { class: 'px-2 py-2 text-right text-[var(--muted-foreground)] uppercase text-[10px]' } }, [lang === 'ar' ? 'الجلسات' : 'Sessions']),
                                    D.Th({ attrs: { class: 'px-2 py-2 text-right text-[var(--muted-foreground)] uppercase text-[10px]' } }, [lang === 'ar' ? 'المدة' : 'Duration']),
                                    D.Th({ attrs: { class: 'px-2 py-2 text-right text-[var(--muted-foreground)] uppercase text-[10px]' } }, [lang === 'ar' ? 'سعر الوحدة' : 'Unit Price']),
                                    D.Th({ attrs: { class: 'px-2 py-2 text-right text-[var(--muted-foreground)] uppercase text-[10px]' } }, [lang === 'ar' ? 'السعر الإجمالي' : 'Total Price'])
                                ])
                            ]),
                            D.Tbody({}, serviceRows.length ? serviceRows : [
                                D.Tr({}, [
                                    D.Td({ attrs: { colspan: 5, class: 'text-center py-4 text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لا توجد خدمات' : 'No services added'])
                                ])
                            ]),
                            D.Tfoot({}, [
                                D.Tr({}, [
                                    D.Td({ attrs: { colspan: 3, class: 'px-2 py-2 text-sm font-semibold' } }, [lang === 'ar' ? 'الإجمالي' : 'Totals']),
                                    D.Td({ attrs: { class: 'px-2 py-2 text-right text-sm font-semibold' } }, [lang === 'ar' ? 'المدفوع' : 'Paid']),
                                    D.Td({ attrs: { class: 'px-2 py-2 text-right text-sm font-semibold' } }, [
                                        formatMoney(totalsValues.total)
                                    ])
                                ]),
                                D.Tr({}, [
                                    D.Td({ attrs: { colspan: 4, class: 'px-2 py-2 text-sm font-normal text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'المدفوع' : 'Paid Amount']),
                                    D.Td({ attrs: { class: 'px-2 py-2 text-right text-sm font-semibold' } }, [formatMoney(totalsValues.paid)])
                                ]),
                                D.Tr({}, [
                                    D.Td({ attrs: { colspan: 4, class: 'px-2 py-2 text-sm font-normal text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'المتبقي' : 'Remaining']),
                                    D.Td({ attrs: { class: 'px-2 py-2 text-right text-sm font-semibold' } }, [formatMoney(totalsValues.remaining)])
                                ])
                            ])
                        ])
                    ])
                ]),
                D.Div({ attrs: { class: 'grid gap-4 md:grid-cols-2' } }, [
                    D.Div({ attrs: { class: 'border rounded-lg p-4 space-y-2' } }, [
                        D.Div({ attrs: { class: 'text-sm font-semibold' } }, [lang === 'ar' ? 'الحجوزات' : 'Bookings']),
                        bookingSummaryRows.length ? D.Div({ attrs: { class: 'space-y-1' } }, bookingSummaryRows) :
                            D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لا توجد حجوزات' : 'No bookings recorded']),
                        D.Div({ attrs: { class: 'text-[11px] text-[var(--muted-foreground)]' } }, [
                            (lang === 'ar' ? 'مجموع' : 'Count') + ': ' + bookings.length
                        ])
                    ]),
                    D.Div({ attrs: { class: 'border rounded-lg p-4 space-y-2' } }, [
                        D.Div({ attrs: { class: 'text-sm font-semibold' } }, [lang === 'ar' ? 'خطة الحجز' : 'Booking Plan']),
                        requestSummaryRows.length ? D.Div({ attrs: { class: 'space-y-1' } }, requestSummaryRows) :
                            D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لا توجد خطة' : 'No plan defined']),
                        generatedItemRows.length ? D.Div({ attrs: { class: 'space-y-1 pt-2 border-t border-[var(--border)]' } }, generatedItemRows) : null,
                        scheduleRows.length ? D.Div({ attrs: { class: 'space-y-1 pt-2 border-t border-[var(--border)]' } }, scheduleRows) : null
                    ])
                ]),
                D.Div({ attrs: { class: 'border rounded-lg overflow-hidden' } }, [
                    D.Div({ attrs: { class: 'flex items-center justify-between px-4 py-2 border-b text-sm font-semibold' } }, [
                        D.Div({}, [lang === 'ar' ? 'المدفوعات' : 'Payments']),
                        D.Span({ attrs: { class: 'text-xs text-[var(--muted-foreground)]' } }, [
                            (lang === 'ar' ? 'المجموع ' : 'Total ')
                        ])
                    ]),
                    D.Table({ attrs: { class: 'w-full text-[13px]' } }, [
                        D.Tbody({}, payments.length ? payments.map(function (payment) {
                            var methodLabel = resolveFkValue(appState, 'clinic_payments', 'method', payment.method, lang) || formatDisplayValue(payment.method);
                            return D.Tr({}, [
                                D.Td({ attrs: { class: 'px-3 py-2 text-sm' } }, [methodLabel || (lang === 'ar' ? 'طريقة غير معروفة' : 'Unknown method')]),
                                D.Td({ attrs: { class: 'px-3 py-2 text-sm text-right' } }, [formatMoney(payment.amount || 0)]),
                                D.Td({ attrs: { class: 'px-3 py-2 text-sm text-right text-[var(--muted-foreground)]' } }, [formatDate(payment.payment_date || payment.date)])
                            ]);
                        }) : [
                            D.Tr({}, [
                                D.Td({ attrs: { colspan: 3, class: 'px-3 py-4 text-sm text-[var(--muted-foreground)] text-center' } }, [lang === 'ar' ? 'لا توجد مدفوعات' : 'No payments recorded'])
                            ])
                        ])
                    ]),
                    D.Div({ attrs: { class: 'px-4 py-2 flex items-center justify-end gap-6 text-sm text-[var(--muted-foreground)]' } }, [
                        D.Span({}, [(lang === 'ar' ? 'المدفوع ' : 'Paid ') + formatMoney(totalsValues.paid)]),
                        D.Span({}, [(lang === 'ar' ? 'المتبقي ' : 'Remaining ') + formatMoney(totalsValues.remaining)])
                    ])
                ])
            ]);
        }

        return UI.Modal({
            open: true,
            title: lang === 'ar' ? 'طباعة العقد' : 'Print Contract',
            size: 'xl',
            closeGkey: 'contracts:print-close',
            content: content,
            actions: [
                UC.Button({ key: 'contracts:print-exec', label: lang === 'ar' ? 'طباعة' : 'Print', icon: '🖨️', variant: 'primary' }),
                UC.Button({ key: 'contracts:print-close', label: lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })
            ]
        });
    }

    function renderBookingPreviewModal(appState) {
        var state = appState.data.screens.contracts || {};
        var editor = state.editor || {};
        var preview = editor.bookingPreview || {};
        var lang = appState.env.lang;
        if (!preview.open) return null;

        var blocks = preview.blocks || [];
        var content = D.Div({ attrs: { class: 'space-y-2' } }, [
            blocks.length ? D.Ul({ attrs: { class: 'divide-y divide-[var(--border)]' } }, blocks.map(function (block) {
                return D.Li({ attrs: { class: 'py-2 text-sm' } }, [formatBookingLabel(block) || '—']);
            })) : D.Div({ attrs: { class: 'text-sm text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'لا توجد مواعيد محفوظة' : 'No bookings saved'])
        ]);

        return UI.Modal({
            open: true,
            title: lang === 'ar' ? 'تفاصيل المواعيد' : 'Booking Details',
            size: 'md',
            closeGkey: 'contracts:booking-preview-close',
            content: content,
            actions: [
                UC.Button({ key: 'contracts:booking-preview-close', label: lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })
            ]
        });
    }

    function renderBlockInfoModal(appState) {
        var state = appState.data.screens.contracts || {};
        var editor = state.editor || {};
        var info = editor.blockInfo || {};
        var lang = appState.env.lang;
        if (!info.open) return null;

        var content = D.Div({ attrs: { class: 'space-y-2' } }, [
            D.Div({ attrs: { class: 'text-sm font-semibold text-[var(--muted-foreground)]' } }, [lang === 'ar' ? 'رقم الحجز' : 'Booking #']),
            D.Div({ attrs: { class: 'text-lg font-semibold' } }, [info.sequence ? ('#' + info.sequence) : '—']),
            info.lineLabel ? D.Div({ attrs: { class: 'text-sm' } }, [lang === 'ar' ? 'الخدمة' : 'Service', ': ' + info.lineLabel]) : null,
            info.label ? D.Div({ attrs: { class: 'text-sm' } }, [lang === 'ar' ? 'الوقت' : 'Time', ': ' + info.label]) : null
        ]);

        return UI.Modal({
            open: true,
            title: lang === 'ar' ? 'تفاصيل الحجز' : 'Booking Details',
            size: 'sm',
            closeGkey: 'contracts:block-info-close',
            content: content,
            actions: [
                UC.Button({ key: 'contracts:block-info-close', label: lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })
            ]
        });
    }

    function initPatientSearch(lang) {
        return {
            query: '',
            open: false,
            loading: false,
            results: [],
            placeholder: lang === 'ar' ? 'بحث بالاسم أو الهاتف...' : 'Search by name or phone...'
        };
    }

    function initLineDraft() {
        return {
            id: null,
            mode: 'service',
            service: '',
            service_package: '',
            service_package_tier: '',
            sessions_count: 1,
            unit_price: 0,
            price_total: 0,
            discount_percent: 0
        };
    }

    function initPaymentDraft() {
        return {
            id: null,
            method: '',
            amount: ''
        };
    }

    function initEditor(ctx) {
        var defaults = getSystemDefaults(ctx);
        var today = new Date().toISOString();
        var lang = ctx.getState().env.lang;
        return {
            open: true,
            form: Object.assign({}, defaults, {
                contract_date: formatDate(today),
                start_date: formatDate(today),
                contract_status: 'draft'
            }),
            lines: [],
            schedule: [],
            payments: [],
            patientSearch: initPatientSearch(lang),
            patientSearchModal: { open: false, query: '', loading: false, results: [] },
            lineDraft: initLineDraft(),
            paymentDraft: initPaymentDraft(),
            selectedBlocks: [],
            selectedSlots: [],
            slotsCache: { loading: false, list: [], error: null },
            bookingCalendar: { open: false, loading: false, days: [], selected: [], startDate: null, doctorId: null }
        };
    }

    function applyModalSave(state, modal) {
        var editor = state.editor || {};
        var form = Object.assign({}, modal.form || {});
        if (!form.id) {
            form.id = 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        }
        if (modal.context === 'lines') {
            var lines = (editor.lines || []).slice();
            var idx = lines.findIndex(function (row) { return String(row.id) === String(form.id); });
            if (idx >= 0) lines[idx] = form; else lines.push(form);
            editor.lines = lines;
        } else if (modal.context === 'schedule') {
            var schedules = (editor.schedule || []).slice();
            var sIdx = schedules.findIndex(function (row) { return String(row.id) === String(form.id); });
            if (sIdx >= 0) schedules[sIdx] = form; else schedules.push(form);
            editor.schedule = schedules;
        } else if (modal.context === 'payments') {
            var payments = (editor.payments || []).slice();
            var pIdx = payments.findIndex(function (row) { return String(row.id) === String(form.id); });
            if (pIdx >= 0) payments[pIdx] = form; else payments.push(form);
            editor.payments = payments;
        }
        editor.form.total_amount = (editor.lines || []).reduce(function (sum, row) { return sum + Number(row.price_total || 0); }, 0);
        return editor;
    }

    function mapDateToWeekId(dateStr) {
        var dt = new Date(dateStr);
        if (!Number.isFinite(dt.getTime())) return null;
        var day = dt.getDay();
        var mapping = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 1 };
        return mapping[day] || null;
    }

    function normalizeDateOnly(value) {
        if (!value) return null;
        var dt = value instanceof Date ? new Date(value) : new Date(value);
        if (!Number.isFinite(dt.getTime())) return null;
        return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    }

    function formatDateOnly(dt) {
        if (!dt) return '';
        return new Date(dt).toISOString().slice(0, 10);
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return null;
        var parts = String(timeStr).split(':');
        if (!parts.length) return null;
        var h = parseInt(parts[0], 10);
        var m = parseInt(parts[1] || '0', 10);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return h * 60 + m;
    }

    function minutesToTime(mins) {
        if (!Number.isFinite(mins)) return '';
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
    }

    function toAmPm(timeStr) {
        if (!timeStr) return '';
        var parts = String(timeStr).split(':');
        if (!parts.length) return '';
        var h = Number(parts[0]);
        var m = parts[1] ? parts[1].padStart(2, '0') : '00';
        if (!Number.isFinite(h)) h = 0;
        var suffix = h >= 12 ? 'م' : 'ص';
        var hour = h % 12;
        if (hour === 0) hour = 12;
        return String(hour) + ':' + m + ' ' + suffix;
    }

    function formatBlockTimeRange(block) {
        var start = getBlockStart(block);
        var end = getBlockEnd(block);
        var label = '';
        if (start) label += toAmPm(start.slice(0, 5));
        if (end) label += ' - ' + toAmPm(end.slice(0, 5));
        return label || '';
    }

    function buildBookingSlotIndex(lineBookings, lines, appState, lang) {
        var map = new Map();
        var serial = 1;
        var lineLookup = {};
        (lines || []).forEach(function (line) {
            var lineId = getRecordId(line.id || line);
            if (lineId) lineLookup[lineId] = line;
        });
        Object.keys(lineBookings || {}).forEach(function (lineId) {
            var blocks = lineBookings[lineId] || [];
            blocks.forEach(function (block) {
                var slot = (block.slots && block.slots[0]) || block.slot;
                var slotId = (slot && getRecordId(slot)) || block.id || block.blockId;
                if (!slotId) return;
                var line = lineLookup[lineId];
                var lineLabel = line ? resolveOptionLabel(line, lang) : '';
                map.set(slotId, {
                    block: block,
                    lineId: lineId,
                    lineLabel: lineLabel || '',
                    sequence: serial++
                });
            });
        });
        return map;
    }

    function resolveDayLabel(day, lang) {
        if (!day) return '';
        var dayNum = Number(day.dayNum);
        var arDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        if (lang === 'ar') {
            return arDays[Number.isFinite(dayNum) ? dayNum : 0] || day.dayName || '';
        }
        return day.dayName || '';
    }

    function normalizeGridSlot(slot, fallbackDate) {
        if (!slot) return null;
        if (slot.slot_time_start) {
            return Object.assign({}, slot, {
                slot_status: slot.slot_status || 'available',
                slot_date: slot.slot_date || fallbackDate
            });
        }
        return {
            id: slot.id,
            slot_date: slot.date || fallbackDate,
            slot_time_start: slot.time || slot.timeStart || '',
            slot_time_end: slot.timeEnd || '',
            slot_status: slot.status || 'available',
            station: slot.station || null
        };
    }

    function buildBlocksForDay(day, baseSlotMinutes, serviceMinutes) {
        var availableSlots = (day.slots || []).filter(function (slot) {
            var nested = slot && slot.slot;
            var status = String(slot.status || slot.slot_status || (nested && nested.slot_status) || '').toLowerCase();
            return status === 'available';
        }).map(function (slot) {
            return normalizeGridSlot(slot.slot || slot, day.date);
        }).filter(Boolean);

        return buildSlotBlocks(availableSlots, baseSlotMinutes, serviceMinutes).map(function (block) {
            var label = (block.slot_time_start || '').slice(0, 5) + ' - ' + (block.slot_time_end || block.slot_time_start || '').slice(0, 5);
            return Object.assign({}, block, {
                blockId: String(block.id || '') + '|' + String(block.slot_date || '') + '|' + String(block.slot_time_start || ''),
                label: label
            });
        });
    }

    function attachBlocksToDays(days, baseSlotMinutes, serviceMinutes) {
        return (days || []).map(function (day) {
            return Object.assign({}, day, {
                blocks: buildBlocksForDay(day, baseSlotMinutes, serviceMinutes)
            });
        });
    }

    function isDateInRange(dateStr, start, end) {
        if (!dateStr) return false;
        var dt = normalizeDateOnly(dateStr);
        if (!dt) return false;
        if (start && dt < start) return false;
        if (end && dt > end) return false;
        return true;
    }

    function timeOverlapsRange(timeStart, timeEnd, rangeStart, rangeEnd) {
        if (!timeStart || !timeEnd) return false;
        var s = timeToMinutes(timeStart);
        var e = timeToMinutes(timeEnd);
        var rs = rangeStart ? timeToMinutes(rangeStart) : null;
        var re = rangeEnd ? timeToMinutes(rangeEnd) : null;
        if (s === null || e === null) return false;
        if (rs !== null && e <= rs) return false;
        if (re !== null && s >= re) return false;
        return true;
    }

    async function ensureSlotsForDoctor(ctx, doctorId, startDate, days, baseSlotMinutes) {
        if (!doctorId) return 0;
        var state = ctx.getState();
        var lang = state.env.lang;
        var defaults = getSystemDefaults(ctx);
        var start = normalizeDateOnly(startDate || new Date());
        var end = normalizeDateOnly(new Date(start.getTime() + (days || 30) * 86400000));

        var templatesRes = await M.REST.repo('clinic_doctor_schedule_templates').search({ lang: lang, limit: 2000 });
        var templates = (templatesRes.data || templatesRes || []).filter(function (row) {
            return String(getRecordId(row.doctor)) === String(doctorId);
        });
        if (!templates.length) return 0;

        var linesRes = await M.REST.repo('clinic_doctor_schedule_template_lines').search({ lang: lang, limit: 4000 });
        var lines = (linesRes.data || linesRes || []).filter(function (row) {
            return templates.some(function (tpl) { return String(getRecordId(row.template)) === String(getRecordId(tpl)); });
        });

        var stationsRes = await M.REST.repo('clinic_stations').search({ lang: lang, limit: 2000 });
        var stations = (stationsRes.data || stationsRes || []);
        var stationByRoom = {};
        stations.forEach(function (station) {
            var roomId = getRecordId(station.room);
            if (roomId && !stationByRoom[roomId]) stationByRoom[roomId] = getRecordId(station);
        });

        var holidaysRes = await M.REST.repo('clinic_holidays').search({ lang: lang, limit: 2000 });
        var holidays = holidaysRes.data || holidaysRes || [];
        var leavesRes = await M.REST.repo('clinic_doctor_leaves').search({ lang: lang, limit: 2000 });
        var leaves = (leavesRes.data || leavesRes || []).filter(function (row) {
            return String(getRecordId(row.doctor)) === String(doctorId);
        });

        var slotsRes = await M.REST.repo('clinic_slots_inventory').search({ lang: lang, limit: 5000 });
        var slots = slotsRes.data || slotsRes || [];
        var existingKeys = new Set();
        slots.forEach(function (slot) {
            if (String(getRecordId(slot.doctor)) !== String(doctorId)) return;
            if (!slot.slot_date || !slot.slot_time_start) return;
            var key = [slot.slot_date, slot.slot_time_start, getRecordId(slot.station)].join('|');
            existingKeys.add(key);
        });

        var createdCount = 0;
        var slotsRepo = M.REST.repo('clinic_slots_inventory');

        for (var dayOffset = 0; dayOffset <= (days || 30); dayOffset++) {
            var current = new Date(start.getTime() + dayOffset * 86400000);
            if (current > end) break;
            var dateStr = formatDateOnly(current);
            var weekId = mapDateToWeekId(dateStr);
            if (!weekId) continue;

            var isHoliday = holidays.some(function (h) { return isDateInRange(h.holiday_date, current, current) && String(h.is_full_day) === '1'; });
            if (isHoliday) continue;
            var isLeave = leaves.some(function (l) { return isDateInRange(l.leave_date, current, current) && String(l.is_full_day) === '1'; });
            if (isLeave) continue;

            var templateForDay = templates.find(function (tpl) {
                var from = tpl.valid_from ? normalizeDateOnly(tpl.valid_from) : null;
                var to = tpl.valid_to ? normalizeDateOnly(tpl.valid_to) : null;
                return isDateInRange(dateStr, from, to);
            }) || templates.find(function (tpl) { return String(tpl.is_default) === '1'; }) || templates[0];

            var dayLines = lines.filter(function (line) {
                return String(getRecordId(line.template)) === String(getRecordId(templateForDay)) && String(getRecordId(line.day)) === String(weekId);
            });

            for (var l = 0; l < dayLines.length; l++) {
                var line = dayLines[l];
                var stationId = stationByRoom[getRecordId(line.room)];
                if (!stationId) continue;
                var slotMinutes = Number(line.slot_minutes_override || baseSlotMinutes || 60);
                var shiftStart = timeToMinutes(line.shift_start);
                var shiftEnd = timeToMinutes(line.shift_end);
                if (shiftStart === null || shiftEnd === null || shiftEnd <= shiftStart) continue;

                for (var t = shiftStart; t + slotMinutes <= shiftEnd; t += slotMinutes) {
                    var timeStart = minutesToTime(t);
                    var timeEnd = minutesToTime(t + slotMinutes);
                    var holidayBlocked = holidays.some(function (h) {
                        if (!isDateInRange(h.holiday_date, current, current) || String(h.is_full_day) === '1') return false;
                        return timeOverlapsRange(timeStart, timeEnd, h.from_time, h.to_time);
                    });
                    if (holidayBlocked) continue;
                    var leaveBlocked = leaves.some(function (l) {
                        if (!isDateInRange(l.leave_date, current, current) || String(l.is_full_day) === '1') return false;
                        return timeOverlapsRange(timeStart, timeEnd, l.from_time, l.to_time);
                    });
                    if (leaveBlocked) continue;

                    var key = [dateStr, timeStart, stationId].join('|');
                    if (existingKeys.has(key)) continue;
                    existingKeys.add(key);
                    await slotsRepo.create({
                        record: {
                            company_id: defaults.company_id,
                            branch_id: defaults.branch_id,
                            doctor: doctorId,
                            station: stationId,
                            slot_date: dateStr,
                            slot_time_start: timeStart,
                            slot_time_end: timeEnd,
                            slot_start_datetime: dateStr + 'T' + timeStart,
                            slot_end_datetime: dateStr + 'T' + timeEnd,
                            slot_status: 'Available',
                            is_booked: 0
                        }
                    });
                    createdCount += 1;
                }
            }
        }

        return createdCount;
    }

    function slotMatchesPreference(slot, pref, startDate) {
        if (!slot || slot.slot_status !== 'Available') return false;
        if (startDate && slot.slot_date && slot.slot_date < startDate) return false;
        var slotDayId = mapDateToWeekId(slot.slot_date);
        if (pref.week_day && slotDayId && String(getRecordId(pref.week_day)) !== String(slotDayId)) return false;
        if (pref.time_start && slot.slot_time_start && slot.slot_time_start < pref.time_start) return false;
        if (pref.time_end && slot.slot_time_end && slot.slot_time_end > pref.time_end) return false;
        return true;
    }

    async function confirmContract(ctx) {
        function setLoading(isLoading) {
            ctx.setState(function (prev) {
                var sc = prev.data.screens.contracts || {};
                var ed = Object.assign({}, sc.editor || {});
                ed.loading = isLoading;
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        screens: Object.assign({}, prev.data.screens, {
                            contracts: Object.assign({}, sc, { editor: ed })
                        })
                    })
                });
            });
        }

        // Set loading
        setLoading(true);

        var state = ctx.getState();
        var screen = state.data.screens.contracts || {};
        var editor = screen.editor || {};
        var form = Object.assign({}, editor.form || {});
        var sysDefaults = getSystemDefaults(ctx);
        Object.keys(sysDefaults).forEach(function (key) {
            if (sysDefaults[key] !== undefined && sysDefaults[key] !== null) {
                form[key] = sysDefaults[key];
            }
        });
        if (form.supervising_doctor) {
            form.executing_doctor = form.supervising_doctor;
        }
        var lines = editor.lines || [];
        var schedule = editor.schedule || []
        var payments = editor.payments || [];
        var selectedSlots = editor.selectedSlots || [];
        var lang = state.env.lang;

        // Determine clinic type
        var isCheckup = false;
        var isTreatmentPlan = false;
        // TODO: Get actual clinic_type values from reference data
        // For now, check if executing_doctor is filled to determine type
        if (!form.executing_doctor) {
            isCheckup = true;
        } else {
            isTreatmentPlan = true;
        }

        // Validation
        if (!form.patient) {
            alert(lang === 'ar' ? 'يرجى اختيار العميل' : 'Select patient');
            setLoading(false);
            return;
        }
        if (!form.supervising_doctor) {
            alert(lang === 'ar' ? 'يرجى اختيار الطبيب المشرف' : 'Select supervising doctor');
            setLoading(false);
            return;
        }
        if (isTreatmentPlan && !form.executing_doctor) {
            alert(lang === 'ar' ? 'يرجى اختيار الطبيب التنفيذي' : 'Select executing doctor');
            setLoading(false);
            return;
        }

        if (!lines.length) {
            alert(lang === 'ar' ? 'أضف بنود العقد أولاً' : 'Add contract lines first');
            setLoading(false);
            return;
        }

        var totalAmount = lines.reduce(function (sum, row) { return sum + Number(row.price_total || 0); }, 0);
        var paidAmount = payments.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);

        // Payment validation based on type
        if (isCheckup && paidAmount < totalAmount) {
            alert(lang === 'ar' ? 'الكشف يتطلب الدفع الكامل' : 'Checkup requires full payment');
            setLoading(false);
            return;
        }

        // Treatment plans allow partial payment (down payment)
        // No payment validation needed for treatment plans

        var defaults = getSystemDefaults(ctx);

        // Convert objects to UUIDs
        form.patient = getRecordId(form.patient);
        form.executing_doctor = getRecordId(form.executing_doctor);
        form.supervising_doctor = getRecordId(form.supervising_doctor);
        form.referral_doctor = getRecordId(form.referral_doctor);
        form.clinic_type = getRecordId(form.clinic_type);

        // Add branch_id explicitly for backend router
        form.branch_id = form.branch_id || (ctx.getState().env && ctx.getState().env.branchId) || 'pt';

        form = Object.assign({}, defaults, form, { total_amount: totalAmount, contract_status: 'confirmed' });

        try {
            // RPC Payload
            var payload = {
                form: form,
                lines: lines.map(function (l) { return Object.assign({}, l, { service: getRecordId(l.service) }); }), // Clean line data
                schedule: schedule,
                selectedSlots: selectedSlots,
                lineBookings: editor.lineBookings || {},
                totalAmount: totalAmount,
                paidAmount: paidAmount,
                payments: payments,
                user: { id: form.user_insert || 'system' }
            };

            var response = await M.REST.rpc('clinic-confirm-contract', payload);

            if (response && (response.success || response.contractId)) {
                setLoading(false);
                alert(lang === 'ar' ? 'تم تأكيد العقد بنجاح' : 'Contract confirmed');
                loadScreen(ctx);
                ctx.setState(function (prev) {
                    var sc = prev.data.screens.contracts || {};
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            screens: Object.assign({}, prev.data.screens, {
                                contracts: Object.assign({}, sc, { editor: { open: false } })
                            })
                        })
                    });
                });
            } else {
                throw new Error(response.error || 'Unknown error');
            }

        } catch (err) {
            console.error('[Contracts] Contract confirmation failed:', err);
            setLoading(false);
            var msg = err.message || err.error || err;
            alert(lang === 'ar' ? 'فشل تأكيد العقد: ' + msg : 'Failed to confirm contract: ' + msg);
        }
    }

    async function loadScreen(app) {
        var state = app.getState();
        var screenState = state.data.screens.contracts || {};
        var lang = state.env.lang;

        // Guard: Prevent double-loading if already in progress
        if (screenState.loading && screenState.loadingAt && (Date.now() - screenState.loadingAt < 5000)) {
            return;
        }

        app.setState(function (prev) {
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                    screens: Object.assign({}, prev.data.screens, {
                        contracts: Object.assign({}, screenState, { loading: true, loadingAt: Date.now() })
                    })
                })
            });
        });

        try {
            await loadContractsReferenceData(app);

            var repo = M.REST.repo('clinic_contracts_header');
            var result = await repo.search({
                lang: lang,
                q: screenState.search || '',
                page: screenState.page || 1,
                limit: screenState.limit || 50,
                sort: { created_date: 'desc' }
            });
            var list = result.data || result || [];
            var selected = list[0] || null;
            var selectedId = selected ? (selected.id || selected.Id || selected.uuid) : null;

            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        screens: Object.assign({}, prev.data.screens, {
                            contracts: Object.assign({}, screenState, {
                                loading: false,
                                list: list,
                                total: result.count || list.length,
                                selected: selected,
                                selectedId: selectedId
                            })
                        })
                    })
                });
            });
        } catch (error) {
            console.error('[Contracts] Load failed', error);
            app.setState(function (prev) {
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        screens: Object.assign({}, prev.data.screens, {
                            contracts: Object.assign({}, screenState, { loading: false })
                        })
                    })
                });
            });
        }
    }

    async function loadPaymentMethods(app) {
        var state = app.getState();
        var screenState = state.data.screens.contracts || {};
        try {
            var res = await M.REST.repo('clinic_payment_methods').search({ lang: state.env.lang, limit: 200 });
            var rows = res.data || res || [];
            app.setState(function (prev) {
                var sc = prev.data.screens.contracts || {};
                var opts = Object.assign({}, sc.options || {}, { paymentMethods: rows });
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        screens: Object.assign({}, prev.data.screens, {
                            contracts: Object.assign({}, sc, { options: opts })
                        })
                    })
                });
            });
            return rows;
        } catch (err) {
            console.warn('[Contracts] Failed to load payment methods', err);
            return [];
        }
    }

    async function loadContractDetails(app, contractId) {
        var state = app.getState();
        var lang = state.env.lang;
        var screenState = state.data.screens.contracts || {};
        var header = (screenState.list || []).find(function (row) { return String(getRecordId(row)) === String(contractId); }) || {};

        var linesRes = await M.REST.repo('clinic_contracts_lines').search({ lang: lang, limit: 2000 });
        var lines = (linesRes.data || linesRes || []).filter(function (row) { return String(getRecordId(row.contract)) === String(contractId); });

        var scheduleRes = await M.REST.repo('clinic_contract_schedule_preferences').search({ lang: lang, limit: 2000 });
        var schedule = (scheduleRes.data || scheduleRes || []).filter(function (row) { return String(getRecordId(row.contract)) === String(contractId); });

        var invoicesRes = await M.REST.repo('clinic_invoices_header').search({ lang: lang, limit: 2000 });
        var invoices = (invoicesRes.data || invoicesRes || []).filter(function (row) { return String(getRecordId(row.contract)) === String(contractId); });
        var invoiceIds = invoices.map(function (row) { return getRecordId(row); }).filter(Boolean);

        var paymentsRes = await M.REST.repo('clinic_payments').search({ lang: lang, limit: 2000 });
        var payments = (paymentsRes.data || paymentsRes || []).filter(function (row) {
            return invoiceIds.length && invoiceIds.indexOf(getRecordId(row.invoice)) !== -1;
        });

        var visitsRes = await M.REST.repo('clinic_visit_tickets').search({ lang: lang, limit: 4000 });
        var visits = (visitsRes.data || visitsRes || []).filter(function (row) { return String(getRecordId(row.contract)) === String(contractId); });
        var visitIds = visits.map(function (row) { return getRecordId(row); }).filter(Boolean);

        var bookingsRes = await M.REST.repo('clinic_bookings').search({ lang: lang, limit: 4000 });
        var bookings = (bookingsRes.data || bookingsRes || []).filter(function (row) {
            return visitIds.length && visitIds.indexOf(getRecordId(row.visit_ticket)) !== -1;
        });

        // New Booking System Data
        var lineIds = lines.map(function (l) { return getRecordId(l); });
        var requestsRes = await M.REST.repo('clinic_booking_requests').search({ lang: lang, limit: 1000 });
        var requests = (requestsRes.data || requestsRes || []).filter(function (row) {
            return lineIds.indexOf(getRecordId(row.contract_line)) !== -1;
        });

        var requestIds = requests.map(function (r) { return getRecordId(r); });
        var itemsRes = await M.REST.repo('clinic_booking_items').search({ lang: lang, limit: 2000 });
        var items = (itemsRes.data || itemsRes || []).filter(function (row) {
            return requestIds.indexOf(getRecordId(row.booking_request)) !== -1;
        });

        var slotsRes = await M.REST.repo('clinic_slots_inventory').search({ lang: lang, limit: 5000 });
        var slots = (slotsRes.data || slotsRes || []);
        var slotsById = {};
        slots.forEach(function (slot) {
            var id = getRecordId(slot);
            if (id) slotsById[id] = slot;
        });

        var bookingRows = bookings.map(function (booking) {
            var slot = slotsById[getRecordId(booking.slot)] || {};
            var label = slot.slot_date ? (slot.slot_date + ' • ' + (slot.slot_time_start || '') + ' - ' + (slot.slot_time_end || '')) : (booking.slot || '—');
            return {
                slot_label: label,
                booking_status: booking.booking_status || booking.status || '—'
            };
        });

        var totalAmount = lines.reduce(function (sum, row) { return sum + Number(row.price_total || 0); }, 0);
        var paidAmount = payments.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
        var totals = { totalAmount: totalAmount, paidAmount: paidAmount, remaining: Math.max(0, totalAmount - paidAmount) };

        return {
            header: header,
            lines: lines,
            schedule: schedule,
            invoices: invoices,
            payments: payments,
            bookings: bookingRows,
            bookingRequests: requests,
            bookingItems: items,
            totals: totals
        };
    }

    async function openContractEditor(ctx, contractId) {
        // Reference data already loaded by batch loader in loadScreen
        await loadPaymentMethods(ctx);

        var details = await loadContractDetails(ctx, contractId);
        var header = details.header || {};
        var lang = ctx.getState().env.lang;
        var editor = initEditor(ctx);
        editor.form = Object.assign({}, header);
        editor.lines = (details.lines || []).map(function (row) { return Object.assign({}, row); });
        editor.payments = (details.payments || []).map(function (row) { return Object.assign({}, row); });
        editor.schedule = (details.schedule || []).map(function (row) { return Object.assign({}, row); });
        editor.bookingRequests = (details.bookingRequests || []).map(function (row) { return Object.assign({}, row); });
        editor.bookingItems = (details.bookingItems || []).map(function (row) { return Object.assign({}, row); });
        editor.readonly = !!(header.contract_status && header.contract_status !== 'draft');

        var patientLabel = resolveFkValue(ctx.getState(), 'clinic_contracts_header', 'patient', header.patient, lang);
        editor.patientSearch = Object.assign({}, initPatientSearch(lang), { query: patientLabel });

        ctx.setState(function (prev) {
            var sc = prev.data.screens.contracts || {};
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                    screens: Object.assign({}, prev.data.screens, {
                        contracts: Object.assign({}, sc, { editor: editor })
                    })
                })
            });
        });
    }

    function initBookingWizard() {
        return {
            open: false,
            mode: 'booking',
            step: 1,
            contract_line: null,
            service: '',
            doctor: '',
            doctor_name: '',
            start_date: new Date().toISOString().slice(0, 10),
            sessions_count: 12,
            days_count: 10,
            days_of_week: [],
            // Grid View State
            gridData: { days: [] },
            selectedSlots: [],
            loading: false
        };
    }

    async function loadAvailabilityGrid(ctx, options) {
        var state = ctx.getState();
        var screen = state.data.screens.contracts || {};
        var editor = screen.editor || {};
        var wiz = editor.bookingWizard;
        if (!wiz) return;
        var form = editor.form || {};
        var lang = state.env.lang;

        var doctorId = getRecordId((options && options.doctorId) || wiz.doctor || form.executing_doctor || form.supervising_doctor);
        if (!doctorId) {
            alert(lang === 'ar' ? 'يرجى اختيار الطبيب أولاً' : 'Please select a doctor first');
            return;
        }

        var startDate = (options && options.start_date) || wiz.start_date || new Date().toISOString().slice(0, 10);
        var daysCount = Number((options && options.days_count) || wiz.days_count || 10);
        if (!daysCount || daysCount < 1) daysCount = 10;

        ctx.setState(function (prev) {
            var sc = prev.data.screens.contracts || {};
            var ed = Object.assign({}, sc.editor || {});
            var nextWiz = Object.assign({}, ed.bookingWizard || {});
            nextWiz.loading = true;
            nextWiz.step = 2;
            nextWiz.doctor = doctorId;
            nextWiz.start_date = startDate;
            nextWiz.days_count = daysCount;
            ed.bookingWizard = nextWiz;
            return Object.assign({}, prev, {
                data: Object.assign({}, prev.data, {
                    screens: Object.assign({}, prev.data.screens, {
                        contracts: Object.assign({}, sc, { editor: ed })
                    })
                })
            });
        });

        try {
            var payload = {
                doctorId: doctorId,
                startDate: startDate,
                days: daysCount
            };

            var res = await fetch('/api/rpc/clinic-get-availability-grid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var json = await res.json();

            if (json && json.success) {
                var clinicType = resolveClinicType(state, editor.form && editor.form.clinic_type);
                var baseSlotMinutes = resolveBaseSlotMinutes(clinicType);
                var lineRefs = (state.data.referenceData && state.data.referenceData['clinic_contracts_lines']) || {};
                var services = lineRefs.clinic_services || (state.data.referenceData && state.data.referenceData.clinic_services) || [];
                var packages = lineRefs.clinic_service_packages || (state.data.referenceData && state.data.referenceData.clinic_service_packages) || [];
                var serviceMinutes = resolveActiveServiceMinutes(editor, services, packages, clinicType);
                var days = (json.days || []).filter(function (day) {
                    if (!day || !Array.isArray(day.slots) || !day.slots.length) return false;
                    return day.slots.some(function (slot) {
                        var nested = slot && slot.slot;
                        var status = String(slot.status || slot.slot_status || (nested && nested.slot_status) || '').toLowerCase();
                        return status === 'available';
                    });
                });
                var gridDays = attachBlocksToDays(days, baseSlotMinutes, serviceMinutes);

                ctx.setState(function (prev) {
                    var sc = prev.data.screens.contracts || {};
                    var ed = Object.assign({}, sc.editor || {});
                    var nextWiz = Object.assign({}, ed.bookingWizard || {});
                    nextWiz.loading = false;
                    nextWiz.step = 2;
                    nextWiz.gridData = { days: gridDays };
                    ed.bookingWizard = nextWiz;
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            screens: Object.assign({}, prev.data.screens, {
                                contracts: Object.assign({}, sc, { editor: ed })
                            })
                        })
                    });
                });
            } else {
                throw new Error((json && json.error) || 'Unknown error');
            }
        } catch (err) {
            console.error(err);
            alert(lang === 'ar' ? 'فشل تحميل المواعيد' : 'Failed to load availability');
            ctx.setState(function (prev) {
                var sc = prev.data.screens.contracts || {};
                var ed = Object.assign({}, sc.editor || {});
                var nextWiz = Object.assign({}, ed.bookingWizard || {});
                nextWiz.loading = false;
                ed.bookingWizard = nextWiz;
                return Object.assign({}, prev, {
                    data: Object.assign({}, prev.data, {
                        screens: Object.assign({}, prev.data.screens, {
                            contracts: Object.assign({}, sc, { editor: ed })
                        })
                    })
                });
            });
        }
    }

    function renderBookingWizard(appState, editor) {
        if (!editor.bookingWizard || !editor.bookingWizard.open) return null;
        var wiz = editor.bookingWizard;
        var lang = appState.env.lang;
        var lines = editor.lines || [];
        var lineRefs = (appState.data.referenceData && appState.data.referenceData['clinic_contracts_lines']) || {};
        var services = lineRefs.clinic_services || (appState.data.referenceData && appState.data.referenceData.clinic_services) || [];
        var packages = lineRefs.clinic_service_packages || (appState.data.referenceData && appState.data.referenceData.clinic_service_packages) || [];
        var clinicType = resolveClinicType(appState, editor.form && editor.form.clinic_type);
        var baseSlotMinutes = resolveBaseSlotMinutes(clinicType);
        var serviceMinutes = resolveActiveServiceMinutes(editor, services, packages, clinicType);
        var todayStr = new Date().toISOString().slice(0, 10);
        var lineBookings = editor.lineBookings || {};
        var bookingSlotsMap = buildBookingSlotIndex(lineBookings, lines, appState, lang);
        var blockedBlocks = collectBookedBlocks(lineBookings, wiz.contract_line);

        if (!wiz.open) return null;

        var content;
        if (wiz.step === 1) {
            // Config Step
            content = D.Div({ attrs: { class: 'space-y-6' } }, [
                D.Div({ attrs: { class: 'grid md:grid-cols-2 gap-4' } }, [
                    D.Div({}, [
                        D.Label({ attrs: { class: 'block text-sm font-medium mb-1' } }, [lang === 'ar' ? 'تاريخ البدء' : 'Start Date']),
                        D.Input({
                            attrs: { type: 'date', class: 'w-full p-2 border rounded', value: wiz.start_date, gkey: 'contracts:wiz:update', 'data-field': 'start_date' }
                        })
                    ]),
                    D.Div({}, [
                        D.Label({ attrs: { class: 'block text-sm font-medium mb-1' } }, [lang === 'ar' ? 'عدد الجلسات' : 'Sessions Count']),
                        D.Input({
                            attrs: { type: 'number', class: 'w-full p-2 border rounded', value: wiz.sessions_count, gkey: 'contracts:wiz:update', 'data-field': 'sessions_count' }
                        })
                    ]),
                    D.Div({ attrs: { class: 'md:col-span-2' } }, [
                        D.Label({ attrs: { class: 'block text-sm font-medium mb-1' } }, [lang === 'ar' ? 'الأيام المفضلة' : 'Preferred Days']),
                        D.Div({ attrs: { class: 'flex flex-wrap gap-4' } }, [
                            { id: 6, l: lang === 'ar' ? 'السبت' : 'Sat' },
                            { id: 0, l: lang === 'ar' ? 'الأحد' : 'Sun' },
                            { id: 1, l: lang === 'ar' ? 'الاثنين' : 'Mon' },
                            { id: 2, l: lang === 'ar' ? 'الثلاثاء' : 'Tue' },
                            { id: 3, l: lang === 'ar' ? 'الأربعاء' : 'Wed' },
                            { id: 4, l: lang === 'ar' ? 'الخميس' : 'Thu' },
                            { id: 5, l: lang === 'ar' ? 'الجمعة' : 'Fri' }
                        ].map(function (d) {
                            var isChecked = (wiz.days_of_week || []).includes(d.id);
                            return D.Label({ attrs: { class: 'flex items-center gap-2 cursor-pointer border p-2 rounded hover:bg-gray-50 ' + (isChecked ? 'bg-blue-50 border-blue-200' : '') } }, [
                                D.Input({
                                    attrs: { type: 'checkbox', value: d.id, checked: isChecked, gkey: 'contracts:wiz:toggle-day', class: 'h-4 w-4' }
                                }),
                                D.Span({}, [d.l])
                            ]);
                        }))
                    ])
                ])
            ]);
        } else {
            // Calendar Grid View
            var gridDays = (wiz.gridData && wiz.gridData.days) || [];
            content = D.Div({ attrs: { class: 'space-y-4' } }, [
                D.Div({ attrs: { class: 'flex flex-wrap items-end gap-3' } }, [
                    D.Div({ attrs: { class: 'min-w-[180px]' } }, [
                        D.Label({ attrs: { class: 'block text-xs font-semibold text-[var(--muted-foreground)] mb-1' } }, [lang === 'ar' ? 'تاريخ البداية' : 'Start Date']),
                        D.Input({
                            attrs: {
                                type: 'date',
                                class: 'w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm',
                                value: wiz.start_date,
                                gkey: 'contracts:wiz:update',
                                'data-field': 'start_date'
                            }
                        })
                    ]),
                    D.Div({ attrs: { class: 'min-w-[140px]' } }, [
                        D.Label({ attrs: { class: 'block text-xs font-semibold text-[var(--muted-foreground)] mb-1' } }, [lang === 'ar' ? 'عدد الأيام' : 'Days Count']),
                        D.Input({
                            attrs: {
                                type: 'number',
                                min: '1',
                                class: 'w-full h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm',
                                value: wiz.days_count || 10,
                                gkey: 'contracts:wiz:update',
                                'data-field': 'days_count'
                            }
                        })
                    ]),
                    UC.Button({
                        key: 'contracts:wiz:refresh',
                        label: lang === 'ar' ? 'تحديث' : 'Refresh',
                        icon: '🔄',
                        variant: 'outline',
                        size: 'sm',
                        disabled: wiz.loading
                    })
                ]),
                D.Div({ attrs: { class: 'flex justify-between items-center mb-2' } }, [
                    D.Div({ attrs: { class: 'text-lg font-bold' } }, [
                        (lang === 'ar' ? 'المواعيد المتاحة - القادمة ' : 'Available Appointments - Next ') + String(wiz.days_count || 10) + (lang === 'ar' ? ' أيام' : ' Days')
                    ]),
                    D.Div({ attrs: { class: 'text-sm text-gray-500' } }, [
                        wiz.loading ? 'Loading...' :
                            (gridDays.length ? (gridDays.length + ' ' + (lang === 'ar' ? 'يوم متاح' : 'days available')) : '')
                    ])
                ]),
                D.Div({ attrs: { class: 'flex flex-wrap gap-2 text-xs text-gray-500' } }, [
                    D.Span({ attrs: { class: 'px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200' } }, [lang === 'ar' ? 'متاح للحجز' : 'Available']),
                    D.Span({ attrs: { class: 'px-2 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200' } }, [lang === 'ar' ? 'محجوز/غير متاح' : 'Booked/Blocked']),
                    D.Span({ attrs: { class: 'px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200' } }, [
                        (lang === 'ar' ? 'مدة الخدمة: ' : 'Service duration: ') + serviceMinutes + (lang === 'ar' ? ' دقيقة' : ' min')
                    ])
                ]),

                // Calendar Grid
                wiz.loading ? D.Div({ attrs: { class: 'text-center p-8' } }, ['Loading calendar...']) :
                    (!gridDays.length ? D.Div({ attrs: { class: 'text-center p-8 text-sm text-[var(--muted-foreground)]' } }, [
                        lang === 'ar' ? 'لا توجد مواعيد متاحة خلال الفترة المحددة' : 'No available appointments for the selected range'
                    ]) : D.Div({ attrs: { class: 'grid grid-cols-2 md:grid-cols-5 gap-3' } },
                        gridDays.map(function (day, dayIdx) {
                            var isClosed = day.status === 'closed';
                            var hasSlots = day.slots && day.slots.length > 0;
                            var availableSlots = hasSlots ? day.slots.filter(function (slot) {
                                var nested = slot && slot.slot;
                                var status = String(slot.status || slot.slot_status || (nested && nested.slot_status) || '').toLowerCase();
                                return status === 'available';
                            }) : [];
                            var bookedSlots = hasSlots ? day.slots.filter(function (slot) {
                                var nested = slot && slot.slot;
                                var status = String(slot.status || slot.slot_status || (nested && nested.slot_status) || '').toLowerCase();
                                return status && status !== 'available';
                            }) : [];
                            var blocks = day.blocks || buildBlocksForDay(day, baseSlotMinutes, serviceMinutes);
                            var hasBlocks = blocks.length > 0;
                            var isToday = day.date === todayStr;

                            return D.Div({
                                attrs: {
                                    class: 'border rounded-lg p-3 ' +
                                        (isClosed ? 'bg-gray-100 opacity-60' :
                                            hasSlots ? 'bg-white hover:shadow-md transition-shadow' : 'bg-gray-50')
                                }
                            }, [
                                // Day Header
                                D.Div({ attrs: { class: 'font-semibold text-sm mb-2 pb-2 border-b flex justify-between items-center' } }, [
                                    D.Div({}, [
                                        D.Div({ attrs: { class: 'text-xs text-gray-500' } }, [resolveDayLabel(day, lang)]),
                                        D.Div({ attrs: { class: 'flex items-center gap-2' } }, [
                                            D.Span({}, [day.date.slice(5)]),
                                            isToday ? D.Span({ attrs: { class: 'text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700' } }, [
                                                lang === 'ar' ? 'اليوم' : 'Today'
                                            ]) : null
                                        ])
                                    ]),
                                    hasBlocks ? D.Span({ attrs: { class: 'text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded' } },
                                        [blocks.length + '']) : null
                                ]),

                                // Slots or Status
                                isClosed ?
                                    D.Div({ attrs: { class: 'text-center py-4 text-gray-400 text-sm' } }, [
                                        D.Div({}, ['🚫']),
                                        D.Div({ attrs: { class: 'text-xs mt-1' } }, [lang === 'ar' ? 'إجازة' : 'Closed'])
                                    ]) :
                                    !hasBlocks ?
                                        D.Div({ attrs: { class: 'text-center py-4 text-gray-400 text-sm' } }, [
                                            D.Div({}, ['—']),
                                            D.Div({ attrs: { class: 'text-xs mt-1' } }, [lang === 'ar' ? 'لا مواعيد' : 'No slots'])
                                        ]) :
                                        D.Div({ attrs: { class: 'space-y-2 max-h-[240px] overflow-y-auto' } }, [
                                            D.Div({ attrs: { class: 'space-y-1' } }, blocks.map(function (block) {
                                                var isSelected = (wiz.selectedSlots || []).some(function (s) { return s.blockId === block.blockId; });
                                                var isBlocked = blockedBlocks.some(function (reserved) { return blockOverlaps(block, reserved); });
                                                var durationLabel = serviceMinutes + (lang === 'ar' ? ' د' : ' min');
                                                var slot = (block.slots && block.slots[0]) || block.slot;
                                                var slotId = slot && getRecordId(slot);
                                                var bookingMeta = slotId ? bookingSlotsMap.get(slotId) : null;
                                                var timeLabel = formatBlockTimeRange(block) || block.label || (slot && slot.slot_time_start ? toAmPm(slot.slot_time_start.slice(0, 5)) : '');

                                                var baseClass = 'w-full text-left px-2 py-1.5 rounded text-sm transition-colors border ';
                                                var computedClass = '';
                                                if (bookingMeta) {
                                                    computedClass = 'bg-orange-50 text-orange-700 border-orange-200 cursor-pointer';
                                                } else if (isBlocked) {
                                                    computedClass = 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed';
                                                } else if (isSelected) {
                                                    computedClass = 'bg-blue-500 text-white border-blue-500';
                                                } else {
                                                    computedClass = 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100';
                                                }

                                                return D.Button({
                                                    attrs: {
                                                        class: baseClass + computedClass,
                                                        gkey: bookingMeta ? 'contracts:block-info' : 'contracts:wiz:select-grid-slot',
                                                        'data-day-idx': dayIdx,
                                                        'data-block-id': block.blockId,
                                                        'data-slot-id': slotId,
                                                        'data-booking-line': bookingMeta ? bookingMeta.lineLabel : '',
                                                        'data-booking-seq': bookingMeta ? bookingMeta.sequence : '',
                                                        'data-booking-label': bookingMeta ? bookingMeta.block.label : '',
                                                        disabled: isBlocked
                                                    }
                                                }, [
                                                    D.Div({ attrs: { class: 'flex items-center justify-between' } }, [
                                                        D.Span({}, [timeLabel || (lang === 'ar' ? 'غير متوفر' : 'Unavailable')]),
                                                        D.Span({ attrs: { class: 'text-[10px] px-2 py-0.5 rounded-full bg-white/70' } }, [durationLabel])
                                                    ]),
                                                    bookingMeta ? D.Div({ attrs: { class: 'text-[10px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1' } }, [
                                                        D.Span({}, [lang === 'ar' ? 'حجز' : 'Booking']),
                                                        D.Span({ attrs: { class: 'font-semibold' } }, ['#' + bookingMeta.sequence])
                                                    ]) : null
                                                ]);
                                            })),
                                            bookedSlots.length ? D.Div({ attrs: { class: 'flex flex-wrap gap-1 pt-1' } }, bookedSlots.slice(0, 6).map(function (slot) {
                                                return D.Span({ attrs: { class: 'px-2 py-1 rounded bg-gray-100 text-gray-400 text-xs border border-gray-200 line-through' } }, [
                                                    slot.time
                                                ]);
                                            })) : null
                                        ]),

                                // Show more indicator
                                hasSlots && day.slots.length > 8 ?
                                    D.Div({ attrs: { class: 'text-xs text-center text-gray-500 mt-1' } }, [
                                        '+' + (day.slots.length - 8) + ' ' + (lang === 'ar' ? 'المزيد' : 'more')
                                    ]) : null
                            ]);
                        })
                    ))
            ]);
        }

        var isViewer = wiz.mode === 'viewer';
        var footer = isViewer ? D.Div({ attrs: { class: 'flex justify-end gap-2 pt-4 border-t mt-4' } }, [
            UC.Button({ key: 'contracts:wiz-cancel', label: lang === 'ar' ? 'إغلاق' : 'Close', variant: 'ghost' })
        ]) : D.Div({ attrs: { class: 'flex justify-end gap-2 pt-4 border-t mt-4' } }, [
            UC.Button({ key: 'contracts:wiz-cancel', label: lang === 'ar' ? 'إلغاء' : 'Cancel', variant: 'ghost' }),
            wiz.step === 1
                ? UC.Button({
                    key: 'contracts:wiz:analyze',
                    label: wiz.loading ? (lang === 'ar' ? 'جاري التحليل...' : 'Analyzing...') : (lang === 'ar' ? 'بحث المواعيد' : 'Search Availability'),
                    icon: '✨',
                    variant: 'primary',
                    disabled: wiz.loading
                })
                : D.Div({ attrs: { class: 'flex gap-2' } }, [
                    UC.Button({ key: 'contracts:wiz:back', label: lang === 'ar' ? 'عودة' : 'Back', variant: 'outline' }),
                    UC.Button({ key: 'contracts:wiz:confirm', label: lang === 'ar' ? 'تأكيد الحجز' : 'Confirm Booking', icon: '✅', variant: 'primary' })
                ])
        ]);

        return M.UI.Modal({
            open: true,
            title: lang === 'ar' ? 'معالج حجز المواعيد (الذكي)' : 'Smart Scheduling Wizard',
            size: 'xl',
            content: D.Div({ attrs: { class: 'p-1' } }, [content, footer]),
            closeGkey: 'contracts:wiz-cancel',
            hideFooter: true
        });
    }

    global.ClinicScreens = global.ClinicScreens || {};
    global.ClinicScreens.contracts = {
        load: loadScreen,
        render: function (app) {
            var base = renderScreen(app);
            var cal = renderBookingCalendar(app);
            var wiz = renderBookingWizard(app, app.data.screens.contracts.editor || {});
            var crudModal = renderPatientModal(app); // Uses SchemaCrud
            var managerModal = renderManagerModal(app); // Uses SchemaCrud
            return D.Div({}, [base, cal, wiz, crudModal, managerModal].filter(Boolean));
        },
        orders: {
            updateContractsModal: function (ctx, updater) {
                ctx.setState(function (prev) {
                    var sc = prev.data.screens.contracts || {};
                    var modalKey = (sc.modal && sc.modal.open) ? 'modal' : ((sc.patientModal && sc.patientModal.open) ? 'patientModal' : 'modal');
                    var modal = Object.assign({}, sc[modalKey] || {});
                    var nextModal = updater(modal, prev, modalKey) || modal;
                    return Object.assign({}, prev, {
                        data: Object.assign({}, prev.data, {
                            screens: Object.assign({}, prev.data.screens, {
                                contracts: Object.assign({}, sc, (function () {
                                    var patch = {};
                                    patch[modalKey] = nextModal;
                                    return patch;
                                })())
                            })
                        })
                    });
                });
            },
            'contracts:new': {
                on: ['click'],
                gkeys: ['contracts:new'],
                handler: async function (_ev, ctx) {
                    // Reference data already loaded by batch loader
                    await loadPaymentMethods(ctx);
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};

                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: initEditor(ctx) })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:search': {
                on: ['input'],
                gkeys: ['contracts:search'],
                handler: function (ev, ctx) {
                    var val = ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { search: val, page: 1 }) }) }) });
                    });
                    if (ctx._searchTimer) clearTimeout(ctx._searchTimer);
                    ctx._searchTimer = setTimeout(function () {
                        loadScreen(ctx);
                    }, 500);
                }
            },
            'contracts:page-prev': {
                on: ['click'],
                gkeys: ['contracts:page-prev'],
                handler: function (ev, ctx) {
                    var sc = ctx.getState().data.screens.contracts || {};
                    if (sc.page > 1) {
                        ctx.setState(function (prev) {
                            var s = prev.data.screens.contracts || {};
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, s, { page: (s.page || 1) - 1 }) }) }) });
                        });
                        loadScreen(ctx);
                    }
                }
            },
            'contracts:page-next': {
                on: ['click'],
                gkeys: ['contracts:page-next'],
                handler: function (ev, ctx) {
                    var sc = ctx.getState().data.screens.contracts || {};
                    ctx.setState(function (prev) {
                        var s = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, s, { page: (s.page || 1) + 1 }) }) }) });
                    });
                    loadScreen(ctx);
                }
            },
            'contracts:print-main': {
                on: ['click'],
                gkeys: ['contracts:print-main'],
                handler: function (ev, ctx) {
                    window.print();
                }
            },
            'contracts:booking-preview': {
                on: ['click'],
                gkeys: ['contracts:booking-preview'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var blocks = (editor.lineBookings && editor.lineBookings[id]) || [];
                        editor.bookingPreview = { open: true, lineId: id, blocks: blocks };
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:booking-preview-close': {
                on: ['click'],
                gkeys: ['contracts:booking-preview-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.bookingPreview = { open: false };
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:block-info': {
                on: ['click'],
                gkeys: ['contracts:block-info'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    if (!btn) return;
                    var slotId = btn.getAttribute('data-slot-id');
                    var lineLabel = btn.getAttribute('data-booking-line');
                    var sequence = btn.getAttribute('data-booking-seq');
                    var blockLabel = btn.getAttribute('data-booking-label');
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.blockInfo = {
                            open: true,
                            slotId: slotId,
                            lineLabel: lineLabel,
                            sequence: sequence,
                            label: blockLabel
                        };
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:block-info-close': {
                on: ['click'],
                gkeys: ['contracts:block-info-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.blockInfo = { open: false };
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:update-header': {
                on: ['input', 'change'],
                gkeys: ['contracts:update-header'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('data-field');
                    var value = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var form = Object.assign({}, editor.form || {});
                        form[field] = value;
                        if (field === 'clinic_type') {
                            var nextType = resolveClinicType(prev, value);
                            var draft = Object.assign({}, editor.lineDraft || initLineDraft());
                            if (isConsultationType(nextType, prev.env && prev.env.lang)) {
                                form.supervising_doctor = form.supervising_doctor || form.executing_doctor;
                                form.executing_doctor = form.supervising_doctor;
                                draft.mode = 'service';
                            } else {
                                draft.mode = 'package';
                            }
                            draft.service = '';
                            draft.service_package = '';
                            draft.service_package_tier = '';
                            draft.sessions_count = 1;
                            editor.lineDraft = draft;
                        }
                        if (field === 'supervising_doctor') {
                            form.executing_doctor = value;
                        }
                        editor.form = form;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:patient-search': {
                on: ['input'],
                gkeys: ['contracts:patient-search'],
                handler: async function (ev, ctx) {
                    var value = (ev.target.value || '').trim();
                    var lang = ctx.getState().env.lang;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var search = Object.assign({}, editor.patientSearch || {});
                        search.query = value;
                        search.open = !!value;
                        search.loading = !!value;
                        search.results = value ? (search.results || []) : [];
                        editor.patientSearch = search;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                    if (!value) return;
                    try {
                        var res = await M.REST.repo('clinic_patients').search({ lang: lang, q: value, limit: 25 });
                        var rows = res.data || res || [];
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var editor = Object.assign({}, sc.editor || {});
                            var search = Object.assign({}, editor.patientSearch || {});
                            search.loading = false;
                            search.results = rows;
                            editor.patientSearch = search;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: editor })
                                    })
                                })
                            });
                        });
                    } catch (err) {
                        console.warn('[Contracts] Patient search failed', err);
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var editor = Object.assign({}, sc.editor || {});
                            var search = Object.assign({}, editor.patientSearch || {});
                            search.loading = false;
                            editor.patientSearch = search;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: editor })
                                    })
                                })
                            });
                        });
                    }
                }
            },
            'contracts:patient-select': {
                on: ['click'],
                gkeys: ['contracts:patient-select'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-id');
                    if (!id) return;
                    var state = ctx.getState();
                    var lang = state.env.lang;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var search = Object.assign({}, editor.patientSearch || {});
                        var results = search.results || [];
                        var selected = results.find(function (row) { return String(getRecordId(row)) === String(id); }) || null;
                        if (selected) {
                            var form = Object.assign({}, editor.form || {});
                            form.patient = selected;
                            editor.form = form;
                            search.query = resolvePatientLabel(selected, lang);
                            search.open = false;
                        }
                        editor.patientSearch = search;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:patient-advanced-open': {
                on: ['click'],
                gkeys: ['contracts:patient-advanced-open'],
                handler: function (ev, ctx) {
                    if (ctx.orders && ctx.orders['contracts:open-patient-manager']) {
                        return ctx.orders['contracts:open-patient-manager'].handler(ev, ctx);
                    }
                }
            },
            'contracts:patient-advanced-search': {
                on: ['input'],
                gkeys: ['contracts:patient-advanced-search'],
                handler: async function (ev, ctx) {
                    var value = (ev.target.value || '').trim();
                    var lang = ctx.getState().env.lang;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var modal = Object.assign({}, editor.patientSearchModal || {});
                        modal.query = value;
                        modal.loading = !!value;
                        modal.results = value ? (modal.results || []) : [];
                        editor.patientSearchModal = modal;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                    if (!value) return;
                    try {
                        var res = await M.REST.repo('clinic_patients').search({ lang: lang, q: value, limit: 50 });
                        var rows = res.data || res || [];
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var editor = Object.assign({}, sc.editor || {});
                            var modal = Object.assign({}, editor.patientSearchModal || {});
                            modal.loading = false;
                            modal.results = rows;
                            editor.patientSearchModal = modal;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: editor })
                                    })
                                })
                            });
                        });
                    } catch (err) {
                        console.warn('[Contracts] Advanced patient search failed', err);
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var editor = Object.assign({}, sc.editor || {});
                            var modal = Object.assign({}, editor.patientSearchModal || {});
                            modal.loading = false;
                            editor.patientSearchModal = modal;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: editor })
                                    })
                                })
                            });
                        });
                    }
                }
            },
            'contracts:patient-advanced-select': {
                on: ['click'],
                gkeys: ['contracts:patient-advanced-select'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-id');
                    if (!id) return;
                    var state = ctx.getState();
                    var lang = state.env.lang;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var modal = Object.assign({}, editor.patientSearchModal || {});
                        var results = modal.results || [];
                        var selected = results.find(function (row) { return String(getRecordId(row)) === String(id); }) || null;
                        if (selected) {
                            var form = Object.assign({}, editor.form || {});
                            form.patient = selected;
                            editor.form = form;
                            var search = Object.assign({}, editor.patientSearch || {});
                            search.query = resolvePatientLabel(selected, lang);
                            search.open = false;
                            editor.patientSearch = search;
                        }
                        modal.open = false;
                        editor.patientSearchModal = modal;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:patient-advanced-close': {
                on: ['click'],
                gkeys: ['contracts:patient-advanced-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var modal = Object.assign({}, editor.patientSearchModal || {});
                        modal.open = false;
                        editor.patientSearchModal = modal;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:show-context-menu': {
                on: ['contextmenu'],
                gkeys: ['contracts:show-context-menu'],
                handler: function (ev, ctx) {
                    ev.preventDefault();
                    var tr = ev.target.closest('tr');
                    if (!tr) return;
                    var id = tr.getAttribute('data-record-id');
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        contextMenu: { visible: true, x: ev.clientX, y: ev.clientY, recordId: id }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:close-context-menu': {
                on: ['click'],
                gkeys: ['document'],
                handler: function (ev, ctx) {
                    var state = ctx.getState().data.screens.contracts || {};
                    if (!state.contextMenu || !state.contextMenu.visible) return;

                    var menu = ev.target.closest('[gkey="contracts:close-context-menu"]');
                    if (menu && ev.target.closest('button')) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { contextMenu: { visible: false } })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:ctx-info': {
                on: ['click'],
                gkeys: ['contracts:ctx-info'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { infoModal: { open: true, loading: true }, contextMenu: { visible: false } })
                                })
                            })
                        });
                    });
                    var data = await loadContractDetails(ctx, id);
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { infoModal: { open: true, loading: false, data: data } })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:ctx-edit': {
                on: ['click'],
                gkeys: ['contracts:ctx-edit'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { contextMenu: { visible: false }, infoModal: { open: false, loading: false, data: null } })
                                })
                            })
                        });
                    });
                    await openContractEditor(ctx, id);
                }
            },
            'contracts:info-close': {
                on: ['click'],
                gkeys: ['contracts:info-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { infoModal: { open: false, loading: false, data: null } })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:open-patient-manager': {
                on: ['click'],
                gkeys: ['contracts:open-patient-manager'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    await ensureTableMeta(ctx, 'clinic_patients');

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        patientManager: {
                                            open: true,
                                            loading: true,
                                            page: 1,
                                            limit: 20,
                                            total: 0,
                                            list: [],
                                            search: ''
                                        }
                                    })
                                })
                            })
                        });
                    });

                    try {
                        var repo = M.REST.repo('clinic_patients');
                        var res = await repo.search({ lang: state.env.lang, limit: 20 });
                        var data = res.data || res || [];
                        var total = res.pagination && res.pagination.total ? res.pagination.total : data.length;

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var pm = Object.assign({}, sc.patientManager || {});
                            pm.loading = false;
                            pm.list = data;
                            pm.total = total;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { patientManager: pm })
                                    })
                                })
                            });
                        });
                    } catch (e) {
                        console.error(e);
                    }
                }
            },
            'contracts:manager-close': {
                on: ['click'],
                gkeys: ['contracts:manager-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientManager: null })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:manager:search': {
                on: ['input'],
                gkeys: ['contracts:manager:search'],
                handler: async function (ev, ctx) {
                    var val = ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var pm = Object.assign({}, sc.patientManager || {});
                        pm.search = val;
                        pm.loading = true;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientManager: pm })
                                })
                            })
                        });
                    });

                    if (ctx._mgrSearchTimer) clearTimeout(ctx._mgrSearchTimer);
                    ctx._mgrSearchTimer = setTimeout(async function () {
                        var state = ctx.getState();
                        var repo = M.REST.repo('clinic_patients');
                        var res = await repo.search({ lang: state.env.lang, limit: 20, q: val });
                        var data = res.data || res || [];
                        var total = res.pagination && res.pagination.total ? res.pagination.total : data.length;

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var pm = Object.assign({}, sc.patientManager || {});
                            pm.loading = false;
                            pm.list = data;
                            pm.total = total;
                            pm.page = 1;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { patientManager: pm })
                                    })
                                })
                            });
                        });
                    }, 500);
                }
            },
            'contracts:manager:page-prev': {
                on: ['click'],
                gkeys: ['contracts:manager:page-prev'],
                handler: function (ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var pm = Object.assign({}, sc.patientManager || {});
                        if (pm.page > 1) {
                            pm.page = pm.page - 1;
                            pm.loading = true;
                        } else {
                            return prev;
                        }
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientManager: pm })
                                })
                            })
                        });
                    });
                    // Trigger refresh
                    ctx.orders['contracts:manager:search'].handler({ target: { value: ctx.getState().data.screens.contracts.patientManager.search } }, ctx);
                }
            },
            'contracts:manager:page-next': {
                on: ['click'],
                gkeys: ['contracts:manager:page-next'],
                handler: function (ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var pm = Object.assign({}, sc.patientManager || {});
                        // Calculate max page?
                        var totalPages = Math.ceil(pm.total / pm.limit);
                        if (pm.page < totalPages) {
                            pm.page = pm.page + 1;
                            pm.loading = true;
                        } else {
                            return prev;
                        }
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientManager: pm })
                                })
                            })
                        });
                    });
                    // Trigger refresh
                    ctx.orders['contracts:manager:search'].handler({ target: { value: ctx.getState().data.screens.contracts.patientManager.search } }, ctx);
                }
            },
            'contracts:manager-select': {
                on: ['click'],
                gkeys: ['contracts:manager-select'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-id');
                    if (!id) return;
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    var manager = sc.patientManager || {};
                    var selected = (manager.list || []).find(function (row) { return String(getRecordId(row)) === String(id); }) || null;
                    if (!selected) return;
                    ctx.setState(function (prev) {
                        var contracts = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, contracts.editor || {});
                        var form = Object.assign({}, editor.form || {});
                        form.patient = selected;
                        editor.form = form;
                        var search = Object.assign({}, editor.patientSearch || {});
                        search.query = resolvePatientLabel(selected, prev.env.lang);
                        search.open = false;
                        editor.patientSearch = search;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, contracts, { editor: editor, patientManager: null })
                                })
                            })
                        });
                    });
                }
            },

            'contracts:patient-modal-open': {
                on: ['click'],
                gkeys: ['contracts:patient-create-open', 'contracts:patient-modal-open'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var lang = (state && state.env && state.env.lang) || 'ar';
                    var tableName = 'clinic_patients';

                    // Initialize generic CRUD modal
                    await ensureTableMeta(ctx, tableName);
                    await ensureReferenceDataForTable(ctx, tableName);

                    // Ensure languages are available for translations
                    var state = ctx.getState();
                    if (!state.data.languages || !state.data.languages.length) {
                        // Try to load basic languages or fetch
                        await loadLanguages(ctx);
                    }

                    // Replicating dashboard.js crud:create logic EXACTLY (L1488)
                    // "Instead of this stupid Modal" -> We follow the successful pattern strictly.

                    if (!global.ClinicSchemaCrud || !global.ClinicSchemaCrud.helpers) {
                        console.error('SchemaCrud helpers missing'); return;
                    }
                    var H = global.ClinicSchemaCrud.helpers;

                    // 1. Meta & Fields
                    var columnsMeta = H.normalizeColumnsMeta(state.data.columnsMeta || []);
                    var fields = H.ensureTranslationFields([], {}); // Dashboard uses state.data.translationFields but for sub-modal we auto-detect
                    // Initialize generic CRUD modal
                    var loadedMeta = await ensureTableMeta(ctx, tableName);
                    await ensureReferenceDataForTable(ctx, tableName);

                    ctx.setState(function (prev) {
                        // 1. Meta & Fields
                        var columnsMeta = H.normalizeColumnsMeta(loadedMeta || []);
                        var fields = H.ensureTranslationFields([], columnsMeta); // Start with empty fields list, let helper derive from meta
                        var languages = prev.data.languages || [];

                        // 2. Build Translation Drafts
                        var translations = H.buildEmptyTranslations(languages, fields);

                        // 3. Build Main Draft (Default Values)
                        var draft = H.applyDefaultsFromColumnsMeta({}, columnsMeta);
                        var sysDefaults = H.buildSystemDefaults(prev.data, columnsMeta);
                        Object.keys(sysDefaults).forEach(function (key) {
                            if (draft[key] === undefined || draft[key] === null || draft[key] === '') {
                                draft[key] = sysDefaults[key];
                            }
                        });

                        // 4. Derive Active Tab (Groups)
                        var groups = H.getTableGroups(tableName, prev.data.schemaInfo, prev.env.lang);
                        var defaultTab = (groups[0] && groups[0].id) || 'basic';

                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: Object.assign({}, sc.modal || {}, {
                                            open: true,
                                            table: tableName,
                                            form: draft,
                                            translations: translations,
                                            translationFields: fields,
                                            activeTab: defaultTab, // activeFormTab
                                            // Context properties
                                            records: [],
                                            languages: prev.data.languages
                                        }),
                                        patientModal: null // Clear legacy
                                    })
                                })
                            })
                        });
                    });

                    // 7. Refresh Hints (Dashboard does this)
                    // await refreshSequenceHints(ctx, tableName); // If available
                }
            },
            'contracts:patient-add-fk': {
                on: ['click'],
                gkeys: ['contracts:patient-add-fk'],
                handler: function (ev, ctx) {
                    var table = ev.target.getAttribute('data-table');
                    alert('Quick add for ' + table + ' coming soon (requires full recursive modal support)');
                }
            },
            'crud:generic:close': {
                on: ['click'],
                gkeys: ['crud:generic:close'],
                handler: function (ev, ctx) {
                    if (ctx.orders && ctx.orders.updateContractsModal) {
                        return ctx.orders.updateContractsModal(ctx, function (modal) {
                            var next = Object.assign({}, modal);
                            next.open = false;
                            next.loading = false;
                            return next;
                        });
                    }
                }
            },
            'crud:generic:save': {
                on: ['click'],
                gkeys: ['crud:generic:save'],
                handler: function (ev, ctx) {
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    if (sc.patientModal && sc.patientModal.open && ctx.orders && ctx.orders['contracts:patient-modal-save']) {
                        return ctx.orders['contracts:patient-modal-save'].handler(ev, ctx);
                    }
                    if (ctx.orders && ctx.orders['contracts:modal-save']) {
                        return ctx.orders['contracts:modal-save'].handler(ev, ctx);
                    }
                }
            },
            'crud:generic:tab': {
                on: ['click'],
                gkeys: ['crud:generic:tab'],
                handler: function (ev, ctx) {
                    var tab = ev.target.getAttribute('data-tab');
                    if (!tab) return;
                    ctx.orders.updateContractsModal(ctx, function (modal) {
                        var next = Object.assign({}, modal);
                        next.activeTab = tab;
                        next.tab = tab;
                        return next;
                    });
                }
            },
            'crud:generic:update': {
                on: ['input', 'change'],
                gkeys: ['crud:generic:update'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('name') || ev.target.getAttribute('data-field');
                    if (!field) return;
                    var value = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
                    ctx.orders.updateContractsModal(ctx, function (modal) {
                        var next = Object.assign({}, modal);
                        var form = Object.assign({}, next.form || {});
                        form[field] = value;
                        next.form = form;
                        return next;
                    });
                }
            },
            'crud:generic:toggle': {
                on: ['input', 'change'],
                gkeys: ['crud:generic:toggle'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('name') || ev.target.getAttribute('data-field');
                    if (!field) return;
                    var value = !!ev.target.checked;
                    ctx.orders.updateContractsModal(ctx, function (modal) {
                        var next = Object.assign({}, modal);
                        var form = Object.assign({}, next.form || {});
                        form[field] = value;
                        next.form = form;
                        return next;
                    });
                }
            },
            'crud:generic:update-translation': {
                on: ['input', 'change'],
                gkeys: ['crud:generic:update-translation'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('name');
                    var lang = ev.target.getAttribute('data-lang');
                    if (!field || !lang) return;
                    var value = ev.target.value;
                    ctx.orders.updateContractsModal(ctx, function (modal) {
                        var next = Object.assign({}, modal);
                        var translations = Object.assign({}, next.translations || {});
                        var entry = Object.assign({}, translations[lang] || {});
                        entry[field] = value;
                        translations[lang] = entry;
                        next.translations = translations;
                        return next;
                    });
                }
            },
            'contracts:modal-save': {
                on: ['click'],
                gkeys: ['contracts:modal-save'],
                handler: async function (ev, ctx) {
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    var modal = sc.modal || {};
                    if (!modal.table || !modal.open) return;

                    ctx.setState(function (prev) {
                        var m = prev.data.screens.contracts.modal;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, prev.data.screens.contracts, { modal: Object.assign({}, m, { loading: true }) }) }) }) });
                    });

                    try {
                        // Use generic buildSavePayload
                        if (!global.ClinicSchemaCrud || !global.ClinicSchemaCrud.helpers || !global.ClinicSchemaCrud.helpers.buildSavePayload) {
                            throw new Error('SchemaCrud save helper missing');
                        }

                        var payload = global.ClinicSchemaCrud.helpers.buildSavePayload({
                            form: modal.form,
                            baseline: null, // Create mode
                            translations: modal.translations,
                            translationBaseline: {},
                            translationFields: modal.translationFields,
                            meta: state.data.columnsMeta,
                            table: modal.table,
                            schemaInfo: state.data.schemaInfo
                        });

                        // Save via Repo
                        var repo = M.REST.repo(modal.table);
                        var res = await repo.create(payload);
                        var record = res.record || res;

                        pushNotification(ctx, 'success', state.env.lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully');

                        // If this was patient create, update the editor
                        if (modal.table === 'clinic_patients') {
                            ctx.setState(function (prev) {
                                var sc = prev.data.screens.contracts || {};
                                var editor = Object.assign({}, sc.editor || {});
                                var edForm = Object.assign({}, editor.form || {});

                                // Update patient
                                edForm.patient = record;
                                editor.form = edForm;

                                // Update search
                                var search = Object.assign({}, editor.patientSearch || {});
                                search.query = resolvePatientLabel(record, state.env.lang);
                                search.open = false;
                                editor.patientSearch = search;

                                return Object.assign({}, prev, {
                                    data: Object.assign({}, prev.data, {
                                        screens: Object.assign({}, prev.data.screens, {
                                            contracts: Object.assign({}, sc, {
                                                editor: edForm.patient ? Object.assign({}, editor, { form: edForm, patientSearch: search }) : editor, // Ensure editor update
                                                modal: Object.assign({}, sc.modal, { open: false, loading: false }) // Close modal
                                            })
                                        })
                                    })
                                });
                            });
                        } else {
                            // Close other modals
                            ctx.setState(function (prev) {
                                var sc = prev.data.screens.contracts;
                                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { modal: Object.assign({}, sc.modal, { open: false, loading: false }) }) }) }) });
                            });
                        }

                    } catch (err) {
                        console.error(err);
                        pushNotification(ctx, 'error', 'Failed to save: ' + err.message);
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { modal: Object.assign({}, sc.modal, { loading: false }) }) }) }) });
                        });
                    }
                }
            },
            'contracts:modal-close': {
                on: ['click'],
                gkeys: ['contracts:modal-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        // Preserve other properties but close
                        var m = Object.assign({}, sc.modal || { open: false });
                        m.open = false;
                        var pm = Object.assign({}, sc.patientModal || {});
                        if (pm.open) {
                            pm.open = false;
                            pm.loading = false;
                        }
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { modal: m, patientModal: pm })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:modal-update': {
                on: ['input', 'change'],
                gkeys: ['contracts:modal-update'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('name') || ev.target.getAttribute('data-field');
                    var value = ev.target.value;
                    if (!field) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var modal = Object.assign({}, sc.modal || {});
                        var form = Object.assign({}, modal.form || {});
                        form[field] = value;
                        modal.form = form;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { modal: modal })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:modal-tab': {
                on: ['click'],
                gkeys: ['contracts:modal-tab'],
                handler: function (ev, ctx) {
                    var tab = ev.target.getAttribute('data-tab');
                    if (!tab) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var modal = Object.assign({}, sc.modal || {});
                        modal.activeTab = tab;
                        modal.tab = tab;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { modal: modal })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:patient-modal-close': {
                on: ['click'],
                gkeys: ['contracts:patient-modal-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientModal: null })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:patient-modal-update-field': {
                on: ['input', 'change'],
                gkeys: ['contracts:patient-modal-update-field'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('name') || ev.target.getAttribute('data-field');
                    var value = ev.target.value;
                    if (!field) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var modal = Object.assign({}, sc.patientModal || {});
                        var form = Object.assign({}, modal.form || {});
                        form[field] = value;
                        modal.form = form;

                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientModal: modal })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:patient-modal-save': {
                on: ['click'],
                gkeys: ['contracts:patient-modal-save'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    var modal = sc.patientModal || {};

                    if (!modal.table) return;

                    // Set loading
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var m = Object.assign({}, sc.patientModal || {});
                        m.loading = true;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { patientModal: m })
                                })
                            })
                        });
                    });

                    try {
                        var repo = M.REST.repo(modal.table);
                        var payload = buildSavePayload(modal);
                        var response = await repo.create(payload, { lang: state.env.lang });
                        var record = response.record || response;

                        // Close modal and update patient in editor
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var editor = Object.assign({}, sc.editor || {});
                            var form = Object.assign({}, editor.form || {});
                            form.patient = record;

                            // Update patient search display
                            var search = Object.assign({}, editor.patientSearch || {});
                            search.query = resolvePatientLabel(record, state.env.lang);
                            search.open = false;
                            editor.patientSearch = search;
                            editor.form = form;

                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, {
                                            editor: editor,
                                            patientModal: null
                                        })
                                    })
                                })
                            });
                        });

                        pushNotification(ctx, 'success', state.env.lang === 'ar' ? 'تم حفظ العميل بنجاح' : 'Patient saved successfully');
                    } catch (error) {
                        console.error('[Contracts Patient Modal] Save failed', error);
                        pushNotification(ctx, 'error', (state.env.lang === 'ar' ? 'لم يتم حفظ العميل: ' : 'Failed to save patient: ') + error.message);

                        // Reset loading
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var m = Object.assign({}, sc.patientModal || {});
                            m.loading = false;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { patientModal: m })
                                    })
                                })
                            });
                        });
                    }
                }
            },
            'contracts:line-update': {
                on: ['input', 'change'],
                gkeys: ['contracts:line-update'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('data-field');
                    var value = ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var draft = Object.assign({}, editor.lineDraft || initLineDraft());
                        var lineRefs = (prev.data.referenceData && prev.data.referenceData['clinic_contracts_lines']) || {};
                        var services = lineRefs.clinic_services || [];
                        var packages = lineRefs.clinic_service_packages || [];
                        var tiers = lineRefs.clinic_service_package_tiers || [];
                        var clinicType = resolveClinicType(prev, editor.form && editor.form.clinic_type);
                        var isConsultation = isConsultationType(clinicType, prev.env && prev.env.lang);
                        draft[field] = value;

                        if (field === 'service') {
                            draft.service_package = '';
                            draft.service_package_tier = '';
                            draft.mode = 'service';
                            var service = services.find(function (row) { return String(getRecordId(row)) === String(value); });
                            draft.unit_price = Number(service && service.base_price ? service.base_price : 0);
                            draft.sessions_count = 1;
                            draft.price_total = draft.unit_price;
                        }

                        if (field === 'service_package_tier') {
                            if (!value) {
                                draft.mode = 'service';
                                draft.service_package = '';
                                var srv = services.find(function (row) { return String(getRecordId(row)) === String(draft.service); });
                                draft.unit_price = Number(srv && srv.base_price ? srv.base_price : 0);
                                draft.sessions_count = 1;
                                draft.price_total = draft.unit_price;
                            } else {
                                draft.mode = 'package';
                                var tier = tiers.find(function (row) { return String(getRecordId(row)) === String(value); });
                                if (tier) {
                                    draft.service_package = tier.package || tier.service_package;
                                    draft.sessions_count = Number(tier.sessions_count || 0);
                                    draft.price_total = Number(tier.price_total || 0);
                                    draft.discount_percent = Number(tier.discount_percent || 0);
                                    draft.unit_price = draft.sessions_count ? (draft.price_total / draft.sessions_count) : 0;
                                }
                            }
                        }

                        if (draft.mode === 'service') {
                            if (field === 'sessions_count' || field === 'unit_price') {
                                var s = Math.max(1, Number(draft.sessions_count || 1));
                                draft.sessions_count = s;
                                draft.price_total = Number(draft.unit_price || 0) * s;
                            }
                        } else {
                            // Package mode price adjustments
                            if (field === 'unit_price') {
                                draft.unit_price = Number(value || 0);
                                draft.price_total = Number(draft.unit_price || 0) * Number(draft.sessions_count || 0);
                            }
                        }
                        editor.lineDraft = draft;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:line-add': {
                on: ['click'],
                gkeys: ['contracts:line-add'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var draft = Object.assign({}, editor.lineDraft || initLineDraft());
                        if (!draft.service) return prev;
                        var lines = (editor.lines || []).slice();
                        if (!draft.id) {
                            draft.id = 'line-' + Date.now().toString(36);
                            lines.push(Object.assign({}, draft));
                        } else {
                            var idx = lines.findIndex(function (row) { return String(row.id) === String(draft.id); });
                            if (idx >= 0) lines[idx] = Object.assign({}, draft);
                        }
                        editor.lines = lines;
                        editor.lineDraft = initLineDraft();
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:line-edit': {
                on: ['click'],
                gkeys: ['contracts:line-edit'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-record-id');
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var lines = editor.lines || [];
                        var line = lines.find(function (row) { return String(row.id) === String(id); });
                        if (line) editor.lineDraft = Object.assign({}, line);
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:line-remove': {
                on: ['click'],
                gkeys: ['contracts:line-remove'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        editor.lines = (editor.lines || []).filter(function (row) { return String(row.id) !== String(id); });
                        if (editor.lineDraft && String(editor.lineDraft.id) === String(id)) {
                            editor.lineDraft = initLineDraft();
                        }
                        if (editor.lineBookings && editor.lineBookings[id]) {
                            delete editor.lineBookings[id];
                            editor.selectedSlots = Object.keys(editor.lineBookings).reduce(function (acc, key) {
                                return acc.concat(editor.lineBookings[key] || []);
                            }, []);
                        }
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:line-cancel': {
                on: ['click'],
                gkeys: ['contracts:line-cancel'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.lineDraft = initLineDraft();
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:payment-update': {
                on: ['input', 'change'],
                gkeys: ['contracts:payment-update'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('data-field');
                    var value = ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var draft = Object.assign({}, editor.paymentDraft || initPaymentDraft());
                        draft[field] = value;
                        editor.paymentDraft = draft;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:payment-add': {
                on: ['click'],
                gkeys: ['contracts:payment-add'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var draft = Object.assign({}, editor.paymentDraft || initPaymentDraft());
                        var amount = Number(draft.amount || 0);
                        if (!draft.method || amount <= 0) return prev;
                        var lines = editor.lines || [];
                        var totalAmount = lines.reduce(function (sum, row) { return sum + Number(row.price_total || 0); }, 0);
                        var payments = (editor.payments || []).slice();
                        var paidAmount = payments.reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
                        var remaining = Math.max(0, totalAmount - paidAmount);
                        if (amount > remaining) amount = remaining;
                        draft.amount = amount;
                        if (!draft.id) {
                            draft.id = 'pay-' + Date.now().toString(36);
                            draft.payment_date = new Date().toISOString();
                            payments.push(Object.assign({}, draft));
                        } else {
                            var idx = payments.findIndex(function (row) { return String(row.id) === String(draft.id); });
                            if (idx >= 0) payments[idx] = Object.assign({}, draft);
                        }
                        editor.payments = payments;
                        editor.paymentDraft = initPaymentDraft();
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:payment-edit': {
                on: ['click'],
                gkeys: ['contracts:payment-edit'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-record-id');
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        var payments = editor.payments || [];
                        var row = payments.find(function (item) { return String(item.id) === String(id); });
                        if (row) editor.paymentDraft = Object.assign({}, row);
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:payment-remove': {
                on: ['click'],
                gkeys: ['contracts:payment-remove'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-record-id');
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        if (sc.editor && sc.editor.readonly) return prev;
                        var editor = Object.assign({}, sc.editor || {});
                        editor.payments = (editor.payments || []).filter(function (row) { return String(row.id) !== String(id); });
                        if (editor.paymentDraft && String(editor.paymentDraft.id) === String(id)) {
                            editor.paymentDraft = initPaymentDraft();
                        }
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:payment-cancel': {
                on: ['click'],
                gkeys: ['contracts:payment-cancel'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.paymentDraft = initPaymentDraft();
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:slots-load': {
                on: ['click'],
                gkeys: ['contracts:slots-load'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    var editor = sc.editor || {};
                    var form = editor.form || {};
                    var doctorId = getRecordId(form.executing_doctor);
                    if (!doctorId) return;
                    ctx.setState(function (prev) {
                        var scp = prev.data.screens.contracts || {};
                        var ed = Object.assign({}, scp.editor || {});
                        ed.slotsCache = Object.assign({}, ed.slotsCache || {}, { loading: true, error: null });
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, scp, { editor: ed })
                                })
                            })
                        });
                    });
                    try {
                        var lang = state.env.lang;
                        var startDate = form.start_date || new Date().toISOString().slice(0, 10);
                        var start = new Date(startDate);
                        var end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
                        var clinicType = resolveClinicType(state, form.clinic_type);
                        var baseSlotMinutes = resolveBaseSlotMinutes(clinicType);

                        // Fetch slots
                        var res = await M.REST.repo('clinic_slots_inventory').search({ lang: lang, limit: 5000 });
                        var slots = res.data || res || [];

                        // Filter slots for the doctor and availability
                        var filtered = slots.filter(function (slot) {
                            if (String(getRecordId(slot.doctor)) !== String(doctorId)) return false;
                            if (slot.slot_status !== 'Available') return false;
                            if (!slot.slot_date) return false;
                            var dt = new Date(slot.slot_date);
                            return dt >= start && dt <= end;
                        }).sort(function (a, b) {
                            if (a.slot_date === b.slot_date) return String(a.slot_time_start || '').localeCompare(String(b.slot_time_start || ''));
                            return String(a.slot_date || '').localeCompare(String(b.slot_date || ''));
                        });

                        // If no slots found, try to ensure slots for the doctor and reload
                        if (!filtered.length) {
                            await ensureSlotsForDoctor(ctx, doctorId, startDate, 30, baseSlotMinutes);
                            var reloadRes = await M.REST.repo('clinic_slots_inventory').search({ lang: lang, limit: 5000 });
                            var reSlots = reloadRes.data || reloadRes || [];
                            filtered = reSlots.filter(function (slot) {
                                if (String(getRecordId(slot.doctor)) !== String(doctorId)) return false;
                                if (slot.slot_status !== 'Available') return false;
                                if (!slot.slot_date) return false;
                                var dt = new Date(slot.slot_date);
                                return dt >= start && dt <= end;
                            }).sort(function (a, b) {
                                if (a.slot_date === b.slot_date) return String(a.slot_time_start || '').localeCompare(String(b.slot_time_start || ''));
                                return String(a.slot_date || '').localeCompare(String(b.slot_date || ''));
                            });
                        }

                        ctx.setState(function (prev) {
                            var scp = prev.data.screens.contracts || {};
                            var ed = Object.assign({}, scp.editor || {});
                            ed.slotsCache = { loading: false, list: filtered, error: null };
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, scp, { editor: ed })
                                    })
                                })
                            });
                        });
                    } catch (err) {
                        console.warn('[Contracts] Load slots failed', err);
                        ctx.setState(function (prev) {
                            var scp = prev.data.screens.contracts || {};
                            var ed = Object.assign({}, scp.editor || {});
                            ed.slotsCache = { loading: false, list: [], error: err.message || 'failed' };
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, scp, { editor: ed })
                                    })
                                })
                            });
                        });
                    }
                }
            }/* ,
      'contracts:slots-auto': {
        on: ['click'],
        gkeys: ['contracts:slots-auto'],
        handler: function (_ev, ctx) {
          ctx.setState(function (prev) {
            var sc = prev.data.screens.contracts || {};
            var editor = Object.assign({}, sc.editor || {});
            var lines = editor.lines || [];
            var totalSessions = lines.reduce(function (sum, row) { return sum + Number(row.sessions_count || 0); }, 0);
            var slots = (editor.slotsCache && editor.slotsCache.list) || [];
            var lineRefs = (prev.data.referenceData && prev.data.referenceData['clinic_contracts_lines']) || {};
            var services = lineRefs.clinic_services || [];
            var packages = lineRefs.clinic_service_packages || [];
            var clinicType = resolveClinicType(prev, editor.form && editor.form.clinic_type);
            var baseSlotMinutes = resolveBaseSlotMinutes(clinicType);
            var serviceMinutes = resolveActiveServiceMinutes(editor, services, packages, clinicType);
            var serviceMinutes = resolveActiveServiceMinutes(editor, services, packages, clinicType);
            var blocks = buildSlotBlocks(slots, baseSlotMinutes, serviceMinutes);

            // Prioritize slots matching Booking Items
            var bookingItems = editor.bookingItems || [];
            var matchedBlocks = [];
            if (bookingItems.length) {
              blocks.forEach(function (block) {
                var slot = block.slots[0];
                if (!slot) return;
                var match = bookingItems.find(function (item) {
                  // Check exact date and time match
                  var d = item.booking_date || item.generated_date;
                  var t = item.start_time || item.generated_time;
                  return d === slot.slot_date && t && t.slice(0, 5) === slot.slot_time_start.slice(0, 5);
                });
                if (match) matchedBlocks.push(block);
              });
            }

            var needed = Math.max(0, totalSessions - matchedBlocks.length);
            var remaining = blocks.filter(function (b) { return matchedBlocks.indexOf(b) === -1; });
            var finalSelection = matchedBlocks.concat(remaining.slice(0, needed));

            editor.selectedBlocks = finalSelection;
            editor.selectedSlots = editor.selectedBlocks.reduce(function (acc, block) {
              return acc.concat(block.slots || []);
            }, []);
            return Object.assign({}, prev, {
              data: Object.assign({}, prev.data, {
                screens: Object.assign({}, prev.data.screens, {
                  contracts: Object.assign({}, sc, { editor: editor })
                })
              })
            });
          });
        }
      } */,
            'contracts:slot-toggle': {
                on: ['click'],
                gkeys: ['contracts:slot-toggle'],
                handler: function (ev, ctx) {
                    var id = ev.target.getAttribute('data-id');
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var blocksSelected = (editor.selectedBlocks || []).slice();
                        var idx = blocksSelected.findIndex(function (slot) { return String(slot.id) === String(id); });
                        if (idx >= 0) {
                            blocksSelected.splice(idx, 1);
                        } else {
                            var available = (editor.slotsCache && editor.slotsCache.list) || [];
                            var lineRefs = (prev.data.referenceData && prev.data.referenceData['clinic_contracts_lines']) || {};
                            var services = lineRefs.clinic_services || [];
                            var packages = lineRefs.clinic_service_packages || [];
                            var clinicType = resolveClinicType(prev, editor.form && editor.form.clinic_type);
                            var baseSlotMinutes = resolveBaseSlotMinutes(clinicType);
                            var serviceMinutes = resolveActiveServiceMinutes(editor, services, packages, clinicType);
                            var blocks = buildSlotBlocks(available, baseSlotMinutes, serviceMinutes);
                            var block = blocks.find(function (item) { return String(item.id) === String(id); });
                            if (block) blocksSelected.push(block);
                        }
                        editor.selectedBlocks = blocksSelected;
                        editor.selectedSlots = blocksSelected.reduce(function (acc, block) {
                            return acc.concat(block.slots || []);
                        }, []);
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:add-line': {
                on: ['click'],
                gkeys: ['contracts:add-line'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: { open: true, table: 'clinic_contracts_lines', form: {}, tab: 'core', mode: 'create', context: 'lines' }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:add-schedule': {
                on: ['click'],
                gkeys: ['contracts:add-schedule'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = sc.editor || {};
                        var form = { executing_doctor: editor.form && editor.form.executing_doctor };
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: { open: true, table: 'clinic_contract_schedule_preferences', form: form, tab: 'basic', mode: 'create', context: 'schedule' }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:add-payment': {
                on: ['click'],
                gkeys: ['contracts:add-payment'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: { open: true, table: 'clinic_payments', form: { payment_date: new Date().toISOString() }, tab: 'basic', mode: 'create', context: 'payments' }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:modal-update': {
                on: ['input', 'change'],
                gkeys: ['contracts:modal-update'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('data-field');
                    var value = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var modal = Object.assign({}, sc.modal || {});
                        var form = Object.assign({}, modal.form || {});
                        form[field] = value;
                        modal.form = form;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { modal: modal })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:modal-save': {
                on: ['click'],
                gkeys: ['contracts:modal-save'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    var modal = sc.modal || {};
                    if (modal.context === 'patient') {
                        try {
                            var res = await M.REST.repo('clinic_patients').create({ record: modal.form || {} });
                            var record = res.record || res;
                            ctx.setState(function (prev) {
                                var scp = prev.data.screens.contracts || {};
                                var editor = Object.assign({}, scp.editor || {});
                                var form = Object.assign({}, editor.form || {});
                                form.patient = record;
                                editor.form = form;
                                var search = Object.assign({}, editor.patientSearch || {});
                                search.query = resolvePatientLabel(record, state.env.lang);
                                search.open = false;
                                editor.patientSearch = search;
                                return Object.assign({}, prev, {
                                    data: Object.assign({}, prev.data, {
                                        screens: Object.assign({}, prev.data.screens, {
                                            contracts: Object.assign({}, scp, { editor: editor, modal: { open: false } })
                                        })
                                    })
                                });
                            });
                        } catch (err) {
                            console.error('[Contracts] Patient create failed', err);
                            alert(state.env.lang === 'ar' ? 'فشل إنشاء العميل' : 'Failed to create patient');
                        }
                        return;
                    }
                    ctx.setState(function (prev) {
                        var scp = prev.data.screens.contracts || {};
                        var mod = scp.modal || {};
                        var editor = applyModalSave(scp, mod);
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, scp, { editor: editor, modal: { open: false } })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:modal-close': {
                on: ['click'],
                gkeys: ['contracts:modal-close'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { modal: { open: false } })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:confirm': {
                on: ['click'],
                gkeys: ['contracts:confirm'],
                handler: function (_ev, ctx) {
                    confirmContract(ctx);
                }
            },
            'contracts:edit-line': {
                on: ['click'],
                gkeys: ['contracts:edit-line'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = sc.editor || {};
                        var lines = editor.lines || [];
                        var line = lines.find(function (row) { return String(row.id) === String(id); });
                        if (!line) return prev;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: { open: true, table: 'clinic_contracts_lines', form: Object.assign({}, line), tab: 'core', mode: 'edit', context: 'lines' }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:remove-line': {
                on: ['click'],
                gkeys: ['contracts:remove-line'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.lines = (editor.lines || []).filter(function (row) { return String(row.id) !== String(id); });
                        editor.form = Object.assign({}, editor.form || {}, {
                            total_amount: (editor.lines || []).reduce(function (sum, row) { return sum + Number(row.price_total || 0); }, 0)
                        });
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:edit-schedule': {
                on: ['click'],
                gkeys: ['contracts:edit-schedule'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = sc.editor || {};
                        var schedule = editor.schedule || [];
                        var row = schedule.find(function (item) { return String(item.id) === String(id); });
                        if (!row) return prev;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: { open: true, table: 'clinic_contract_schedule_preferences', form: Object.assign({}, row), tab: 'basic', mode: 'edit', context: 'schedule' }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:remove-schedule': {
                on: ['click'],
                gkeys: ['contracts:remove-schedule'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.schedule = (editor.schedule || []).filter(function (row) { return String(row.id) !== String(id); });
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:edit-payment': {
                on: ['click'],
                gkeys: ['contracts:edit-payment'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = sc.editor || {};
                        var payments = editor.payments || [];
                        var row = payments.find(function (item) { return String(item.id) === String(id); });
                        if (!row) return prev;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, {
                                        modal: { open: true, table: 'clinic_payments', form: Object.assign({}, row), tab: 'basic', mode: 'edit', context: 'payments' }
                                    })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:remove-payment': {
                on: ['click'],
                gkeys: ['contracts:remove-payment'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var id = btn ? btn.getAttribute('data-record-id') : null;
                    if (!id) return;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        editor.payments = (editor.payments || []).filter(function (row) { return String(row.id) !== String(id); });
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:cancel-editor': {
                on: ['click'],
                gkeys: ['contracts:cancel-editor'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: { open: false } })
                                })
                            })
                        });
                    });
                }
            },
            'ui:modal:size': {
                on: ['click'],
                gkeys: ['ui:modal:size'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var sizeKey = btn ? btn.getAttribute('data-modal-size-key') : null;
                    var size = btn ? btn.getAttribute('data-modal-size') : null;
                    if (sizeKey === 'contracts:modal:size' && size) {
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var editor = Object.assign({}, sc.editor || {});
                            editor.modalSize = size;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: editor })
                                    })
                                })
                            });
                        });
                    }
                }
            },

            'contracts:open-wizard': {
                on: ['click'],
                gkeys: ['contracts:open-wizard'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var lineId = btn ? btn.getAttribute('data-record-id') : null;
                    if (!lineId) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var lines = editor.lines || [];
                        var form = editor.form || {};
                        var state = ctx.getState();

                        // Validation before opening wizard
                        if (!form.supervising_doctor && !form.executing_doctor) {
                            alert(state.env.lang === 'ar' ? 'يجب اختيار الطبيب أولاً في بيانات العقد' : 'Please select a doctor in contract details first');
                            return prev;
                        }

                        var line = lines.find(function (l) { return String(l.id) === String(lineId); });
                        if (!line) return prev;
                        if (!line.service) {
                            alert(state.env.lang === 'ar' ? 'يجب اختيار الخدمة أولاً' : 'Please select a service first');
                            return prev;
                        }
                        var sessionsCount = Number(line.sessions_count || 0);
                        if (!Number.isFinite(sessionsCount) || sessionsCount < 1) {
                            alert(state.env.lang === 'ar' ? 'يجب تحديد عدد الجلسات أولاً' : 'Please set sessions count first');
                            return prev;
                        }

                        var wiz = initBookingWizard();
                        wiz.open = true;
                        wiz.mode = 'booking';
                        wiz.step = 2;
                        wiz.contract_line = line.id;
                        wiz.doctor = form.supervising_doctor || form.executing_doctor;
                        wiz.service = line.service;
                        wiz.start_date = form.start_date || new Date().toISOString().slice(0, 10);
                        wiz.sessions_count = sessionsCount;
                        wiz.selectedSlots = (editor.lineBookings && editor.lineBookings[line.id]) ? editor.lineBookings[line.id].slice() : [];

                        editor.bookingWizard = wiz;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });

                    await loadAvailabilityGrid(ctx);
                }
            },
            'contracts:open-availability-grid': {
                on: ['click'],
                gkeys: ['contracts:open-availability-grid'],
                handler: async function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var form = editor.form || {};
                        var state = ctx.getState();

                        if (!form.supervising_doctor && !form.executing_doctor) {
                            alert(state.env.lang === 'ar' ? 'يجب اختيار الطبيب أولاً' : 'Please select a doctor first');
                            return prev;
                        }

                        var wiz = initBookingWizard();
                        wiz.open = true;
                        wiz.mode = 'viewer';
                        wiz.step = 2;
                        wiz.doctor = form.supervising_doctor || form.executing_doctor;
                        wiz.start_date = form.start_date || new Date().toISOString().slice(0, 10);
                        editor.bookingWizard = wiz;

                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });

                    await loadAvailabilityGrid(ctx);
                }
            },

            'contracts:wiz-cancel': {
                on: ['click'],
                gkeys: ['contracts:wiz-cancel'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        if (editor.bookingWizard) {
                            editor.bookingWizard.open = false;
                        }
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:wiz:update': {
                on: ['input', 'change'],
                gkeys: ['contracts:wiz:update'],
                handler: function (ev, ctx) {
                    var field = ev.target.getAttribute('data-field');
                    var value = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var wiz = Object.assign({}, editor.bookingWizard || {});
                        wiz[field] = value;
                        editor.bookingWizard = wiz;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:wiz:toggle-day': {
                on: ['change'],
                gkeys: ['contracts:wiz:toggle-day'],
                handler: function (ev, ctx) {
                    var day = Number(ev.target.value);
                    var checked = ev.target.checked;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var wiz = Object.assign({}, editor.bookingWizard || {});
                        var days = (wiz.days_of_week || []).slice();
                        if (checked && days.indexOf(day) === -1) days.push(day);
                        else if (!checked) days = days.filter(function (d) { return d !== day; });
                        wiz.days_of_week = days;
                        editor.bookingWizard = wiz;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:wiz:analyze': {
                on: ['click'],
                gkeys: ['contracts:wiz:analyze'],
                handler: async function (_ev, ctx) {
                    await loadAvailabilityGrid(ctx);
                }
            },
            'contracts:wiz:refresh': {
                on: ['click'],
                gkeys: ['contracts:wiz:refresh'],
                handler: async function (_ev, ctx) {
                    await loadAvailabilityGrid(ctx);
                }
            },
            'contracts:wiz:select-grid-slot': {
                on: ['click'],
                gkeys: ['contracts:wiz:select-grid-slot'],
                handler: function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    if (!btn) return;
                    var blockId = btn.getAttribute('data-block-id');
                    var slotId = btn.getAttribute('data-slot-id');
                    var dayIdx = Number(btn.getAttribute('data-day-idx'));

                    var state = ctx.getState();
                    var scState = state.data.screens.contracts || {};
                    var editor = scState.editor || {};
                    var wiz = editor.bookingWizard;
                    var day = wiz.gridData.days[dayIdx];

                    if (!day) return;

                    var target;
                    if (blockId) {
                        var blocks = day.blocks || [];
                        target = blocks.find(function (block) { return block.blockId === blockId; });
                    } else if (slotId) {
                        target = (day.slots || []).find(function (s) { return s.id === slotId; });
                    }

                    if (!target) return;
                    var blockedBlocks = collectBookedBlocks(editor.lineBookings || {}, wiz.contract_line);
                    if (blockedBlocks.some(function (reserved) { return blockOverlaps(target, reserved); })) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts;
                        var ed = Object.assign({}, sc.editor);
                        var w = Object.assign({}, ed.bookingWizard);
                        var selected = (w.selectedSlots || []).slice();
                        var sessionsLimit = Math.max(1, Number(w.sessions_count || 1));
                        var targetDate = getBlockDate(target);

                        var findIndex = selected.findIndex(function (s) {
                            if (blockId) return s.blockId === blockId;
                            return s.id === slotId;
                        });

                        if (findIndex >= 0) {
                            selected.splice(findIndex, 1); // Deselect
                        } else {
                            if (sessionsLimit === 1) {
                                selected = [];
                            }
                            if (targetDate) {
                                selected = selected.filter(function (s) { return getBlockDate(s) !== targetDate; });
                            }
                            if (selected.length >= sessionsLimit) {
                                alert((state.env.lang === 'ar' ? 'لا يمكن اختيار أكثر من ' : 'Cannot select more than ') + sessionsLimit);
                                return prev;
                            }
                            selected.push(target); // Select
                        }

                        w.selectedSlots = selected;
                        ed.bookingWizard = w;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                    });
                }
            },
            'contracts:wiz:open-picker': {
                on: ['click'],
                gkeys: ['contracts:wiz:open-picker'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button') || ev.target.closest('span');
                    var idx = Number(btn.getAttribute('data-idx'));

                    var state = ctx.getState();
                    var editor = state.data.screens.contracts.editor;
                    var wiz = editor.bookingWizard;
                    var row = wiz.proposed_schedule[idx];

                    if (!row) return;

                    // Open Picker with Loading
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts;
                        var ed = Object.assign({}, sc.editor);
                        var w = Object.assign({}, ed.bookingWizard);
                        w.slotPicker = {
                            open: true,
                            rowIndex: idx,
                            date: row.date,
                            slots: [],
                            loading: true,
                            applyAll: false
                        };
                        ed.bookingWizard = w;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                    });

                    try {
                        // Fetch slots for this specific day
                        var form = editor.form || {};
                        var doctorId = getRecordId(form.executing_doctor);
                        var branchId = form.branch_id || getSystemDefaults(ctx).branch_id;

                        // Use same RPC but for single day
                        var res = await fetch('/api/rpc/clinic-generate-slots', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                doctorId: doctorId,
                                branchId: branchId,
                                startDate: row.date,
                                endDate: row.date, // Same day
                                daysOfWeek: null, // Not needed for specific date range
                                sessionDuration: 30 // TODO: optimize
                            })
                        });
                        var json = await res.json();

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            var ed = Object.assign({}, sc.editor);
                            var w = Object.assign({}, ed.bookingWizard);
                            w.slotPicker = Object.assign({}, w.slotPicker, {
                                loading: false,
                                slots: json.slots || []
                            });
                            ed.bookingWizard = w;
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });

                    } catch (e) {
                        console.error(e);
                        alert('Error loading slots');
                    }
                }
            },
            'contracts:wiz:close-picker': {
                on: ['click'],
                gkeys: ['contracts:wiz:close-picker'],
                handler: function (_ev, ctx) {
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts;
                        var ed = Object.assign({}, sc.editor);
                        var w = Object.assign({}, ed.bookingWizard);
                        w.slotPicker = Object.assign({}, w.slotPicker, { open: false });
                        ed.bookingWizard = w;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                    });
                }
            },
            'contracts:wiz:toggle-apply-all': {
                on: ['change'],
                gkeys: ['contracts:wiz:toggle-apply-all'],
                handler: function (ev, ctx) {
                    var checked = ev.target.checked;
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts;
                        var ed = Object.assign({}, sc.editor);
                        var w = Object.assign({}, ed.bookingWizard);
                        w.slotPicker = Object.assign({}, w.slotPicker, { applyAll: checked });
                        ed.bookingWizard = w;
                        return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                    });
                }
            },
            'contracts:wiz:pick-slot': {
                on: ['click'],
                gkeys: ['contracts:wiz:pick-slot'],
                handler: async function (ev, ctx) {
                    var btn = ev.target.closest('button');
                    var time = btn.getAttribute('data-time');
                    var state = ctx.getState();
                    var editor = state.data.screens.contracts.editor;
                    var wiz = editor.bookingWizard;
                    var picker = wiz.slotPicker;

                    if (picker.applyAll) {
                        // Cascade Logic: Re-Analyze with this time
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            var ed = Object.assign({}, sc.editor);
                            // Close picker and show loading on main wizard
                            ed.bookingWizard = Object.assign({}, ed.bookingWizard, {
                                loading: true,
                                slotPicker: Object.assign({}, ed.bookingWizard.slotPicker, { open: false })
                            });
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });

                        try {
                            var form = editor.form || {};
                            var doctorId = getRecordId(form.executing_doctor);
                            var branchId = form.branch_id || getSystemDefaults(ctx).branch_id;

                            var payload = {
                                doctorId: doctorId,
                                branchId: branchId,
                                startDate: wiz.start_date, // Start from beginning? Or from current row? 
                                // Request said "Apply to subsequent sessions" or "Apply to all"?
                                // User said "Apply to all days following" usually. 
                                // Let's re-analyze from START date but with preferredTime. 
                                // It will overwrite previous manual changes if any? 
                                // For simplicity, yes, it regenerates the whole schedule with this pattern.
                                sessionsCount: Number(wiz.sessions_count || 12),
                                daysOfWeek: wiz.days_of_week,
                                preferredTime: time
                            };

                            var res = await fetch('/api/rpc/clinic-analyze-schedule', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            var json = await res.json();

                            if (json.success) {
                                ctx.setState(function (prev) {
                                    var sc = prev.data.screens.contracts;
                                    var ed = Object.assign({}, sc.editor);
                                    ed.bookingWizard = Object.assign({}, ed.bookingWizard, {
                                        loading: false,
                                        proposed_schedule: json.schedule || [],
                                        possible_count: (json.schedule || []).filter(s => s.status === 'Available').length
                                    });
                                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                                });
                            }
                        } catch (e) {
                            console.error(e);
                            alert('Cascade failed');
                        }

                    } else {
                        // Single Row Update
                        // We need to locally update this row with the selected time
                        // AND ideally check availability? But we just clicked an Available slot from the picker.
                        // So we assume it's Available. We need the full slot object though.
                        var slotObj = picker.slots.find(function (s) { return s.slot_time_start.slice(0, 5) === time; });

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            var ed = Object.assign({}, sc.editor);
                            var w = Object.assign({}, ed.bookingWizard);
                            var rows = w.proposed_schedule.slice();
                            var row = Object.assign({}, rows[picker.rowIndex]);

                            row.time = time;
                            row.status = 'Available'; // We picked from available list
                            row.reason = null;
                            row.slot = slotObj;
                            row.slotId = slotObj.id;

                            rows[picker.rowIndex] = row;
                            w.proposed_schedule = rows;
                            w.slotPicker = Object.assign({}, w.slotPicker, { open: false });
                            w.possible_count = rows.filter(s => s.status === 'Available').length;

                            ed.bookingWizard = w;
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });
                    }
                }
            },
            'contracts:wiz:confirm': {
                on: ['click'],
                gkeys: ['contracts:wiz:confirm'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var sc = state.data.screens.contracts || {};
                    var ed = sc.editor || {};
                    var wiz = ed.bookingWizard || {};

                    var toBook = wiz.selectedSlots || [];

                    if (toBook.length === 0) {
                        alert(state.env.lang === 'ar' ? 'يرجى اختيار موعد واحد على الأقل' : 'Please select at least one slot');
                        return;
                    }

                    if (!confirm((state.env.lang === 'ar' ? 'تأكيد حجز ' : 'Confirm booking ') + toBook.length + (state.env.lang === 'ar' ? ' موعد؟' : ' slots?'))) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var ed = Object.assign({}, sc.editor || {});
                        // Copy selected slots to editor for confirmContract
                        var normalizedBlocks = [];
                        toBook.forEach(function (item) {
                            if (item && item.slots && item.slots.length) {
                                var normalizedSlots = item.slots.map(function (slot) {
                                    return normalizeGridSlot(slot, item.slot_date);
                                }).filter(Boolean);
                                if (!normalizedSlots.length) return;
                                normalizedBlocks.push(Object.assign({}, item, { slots: normalizedSlots }));
                                return;
                            }
                            if (item && item.slot) {
                                var normalized = normalizeGridSlot(item.slot, item.slot_date);
                                if (normalized) normalizedBlocks.push(Object.assign({}, item, { slots: [normalized] }));
                                return;
                            }
                            var fallback = normalizeGridSlot(item, item && item.date);
                            if (fallback) normalizedBlocks.push(Object.assign({}, item, { slots: [fallback] }));
                        });
                        var lineId = ed.bookingWizard && ed.bookingWizard.contract_line;
                        var lineBookings = Object.assign({}, ed.lineBookings || {});
                        if (lineId) lineBookings[lineId] = normalizedBlocks;
                        ed.lineBookings = lineBookings;
                        ed.selectedSlots = Object.keys(lineBookings).reduce(function (acc, key) {
                            var blocks = lineBookings[key] || [];
                            return acc.concat(blocks);
                        }, []);
                        ed.schedule = []; // Clear old preferences
                        // Close wizard
                        ed.bookingWizard = Object.assign({}, ed.bookingWizard, { open: false });
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: ed })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:wiz:select-slot': {
                on: ['click'],
                gkeys: ['contracts:wiz:select-slot'],
                handler: function (ev, ctx) {
                    var slotId = ev.target.closest('[data-slot-id]').getAttribute('data-slot-id');
                    if (!slotId) return;

                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var editor = Object.assign({}, sc.editor || {});
                        var wiz = Object.assign({}, editor.bookingWizard || {});
                        var selected = (wiz.selectedSlots || []).slice();
                        var available = wiz.availableSlots || [];

                        // Find the slot
                        var slot = available.find(function (s) { return s.slotId === slotId; });
                        if (!slot) return prev;

                        // Toggle selection
                        var idx = selected.findIndex(function (s) { return s.slotId === slotId; });
                        if (idx !== -1) {
                            selected.splice(idx, 1);
                        } else {
                            selected.push(slot);
                        }

                        wiz.selectedSlots = selected;
                        editor.bookingWizard = wiz;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: editor })
                                })
                            })
                        });
                    });
                }
            },
            'contracts:wiz:generate': {
                on: ['click'],
                gkeys: ['contracts:wiz:generate'],
                handler: async function (_ev, ctx) {
                    var state = ctx.getState();
                    var lang = state.env.lang;
                    var editor = state.data.screens.contracts.editor || {};
                    var wiz = editor.bookingWizard || {};

                    if (!wiz.contract_line) {
                        alert(lang === 'ar' ? 'اختر الخدمة' : 'Select Service');
                        return;
                    }

                    if (!wiz.slotsChecked || !wiz.selectedSlots || wiz.selectedSlots.length === 0) {
                        alert(lang === 'ar' ? 'يجب اختيار المواعيد أولاً' : 'Please select slots first');
                        return;
                    }

                    // Set Loading
                    ctx.setState(function (prev) {
                        var sc = prev.data.screens.contracts || {};
                        var ed = Object.assign({}, sc.editor || {});
                        var w = Object.assign({}, ed.bookingWizard || {});
                        w.loading = true;
                        ed.bookingWizard = w;
                        return Object.assign({}, prev, {
                            data: Object.assign({}, prev.data, {
                                screens: Object.assign({}, prev.data.screens, {
                                    contracts: Object.assign({}, sc, { editor: ed })
                                })
                            })
                        });
                    });

                    try {
                        // Build patterns data from selected slots
                        var slotsGroupedByPattern = {};
                        wiz.selectedSlots.forEach(function (slot) {
                            var key = slot.dayOfWeek + '_' + slot.timeStart;
                            if (!slotsGroupedByPattern[key]) {
                                slotsGroupedByPattern[key] = {
                                    week_day: slot.dayOfWeek,
                                    time_start: slot.timeStart,
                                    duration_minutes: Number(wiz.duration_minutes || 60),
                                    selected_days: [slot.dayOfWeek],
                                    pattern_type: wiz.pattern_type,
                                    repeat_weeks: Number(wiz.weeks_count || 4),
                                    start_date: wiz.start_date,
                                    slots: [slot]
                                };
                            } else {
                                slotsGroupedByPattern[key].slots.push(slot);
                            }
                        });

                        var payload = {
                            contractLineId: wiz.contract_line,
                            selectedSlots: wiz.selectedSlots, // Pass validated slots
                            patternsData: Object.values(slotsGroupedByPattern)
                        };

                        var res = await fetch('/api/rpc/clinic-create-request', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        var json = await res.json();

                        if (json.success) {
                            alert(lang === 'ar' ? 'تم إنشاء طلب الحجز بنجاح' : 'Booking request created successfully');
                            // Refresh contract details to see the new request
                            var updated = await loadContractDetails(ctx, getRecordId(editor.form)); // Reuse existing loader
                            // Also close wizard
                            ctx.setState(function (prev) {
                                var sc = prev.data.screens.contracts || {};
                                var ed = Object.assign({}, sc.editor || {});
                                ed.bookingWizard = { open: false }; // close
                                // Update editor with new details (specifically bookings/requests list if we had one)
                                // For now just close wizard

                                return Object.assign({}, prev, {
                                    data: Object.assign({}, prev.data, {
                                        screens: Object.assign({}, prev.data.screens, {
                                            contracts: Object.assign({}, sc, { editor: ed })
                                        })
                                    })
                                });
                            });
                        } else {
                            throw new Error(json.error || 'Unknown error');
                        }

                    } catch (err) {
                        console.error(err);
                        alert(lang === 'ar' ? 'فشل الغنشاء' : 'Failed to create request');
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts || {};
                            var ed = Object.assign({}, sc.editor || {});
                            var w = Object.assign({}, ed.bookingWizard || {});
                            w.loading = false;
                            ed.bookingWizard = w;
                            return Object.assign({}, prev, {
                                data: Object.assign({}, prev.data, {
                                    screens: Object.assign({}, prev.data.screens, {
                                        contracts: Object.assign({}, sc, { editor: ed })
                                    })
                                })
                            });
                        });
                    }
                },
                'contracts:open-booking-calendar': {
                    on: ['click'],
                    gkeys: ['contracts:open-booking-calendar'],
                    handler: async function (_ev, ctx) {
                        var state = ctx.getState();
                        var editor = state.data.screens.contracts && state.data.screens.contracts.editor;
                        if (!editor) return; // Safety check
                        var form = editor.form;
                        var doctorId = getRecordId(form.executing_doctor);
                        var lang = state.env.lang;

                        if (!doctorId) {
                            alert(lang === 'ar' ? 'يرجى اختيار الطبيب المعالج أولاً' : 'Please select executing doctor first');
                            return;
                        }

                        // Initialize Calendar State
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            var ed = Object.assign({}, sc.editor);
                            ed.bookingCalendar = {
                                open: true,
                                loading: true,
                                days: [],
                                selected: [],
                                startDate: new Date().toISOString().slice(0, 10),
                                doctorId: doctorId,
                                daysCount: 14 // 2 weeks default
                            };
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });

                        // Fetch Data
                        try {
                            var payload = {
                                doctorId: doctorId,
                                startDate: new Date().toISOString().slice(0, 10),
                                daysCount: 14,
                                branchId: form.branch_id || 'pt'
                            };

                            var res = await fetch('/api/rpc/clinic-get-booking-calendar', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            var json = await res.json();

                            if (json.success) {
                                ctx.setState(function (prev) {
                                    var sc = prev.data.screens.contracts;
                                    var ed = Object.assign({}, sc.editor);
                                    var cal = Object.assign({}, ed.bookingCalendar);
                                    cal.loading = false;
                                    cal.days = json.calendar || [];
                                    ed.bookingCalendar = cal;
                                    return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                                });
                            } else {
                                throw new Error(json.error);
                            }
                        } catch (err) {
                            console.error(err);
                            alert('Failed to load calendar');
                            ctx.setState(function (prev) {
                                // Close on error
                                var sc = prev.data.screens.contracts;
                                var ed = Object.assign({}, sc.editor);
                                var cal = Object.assign({}, ed.bookingCalendar);
                                cal.open = false;
                                ed.bookingCalendar = cal;
                                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                            });
                        }
                    }
                },
                'calendar:navigate': {
                    on: ['click'],
                    gkeys: ['calendar:navigate'],
                    handler: async function (ev, ctx) {
                        var dir = Number(ev.target.getAttribute('data-dir') || 0);
                        var state = ctx.getState();
                        var editor = state.data.screens.contracts && state.data.screens.contracts.editor;
                        if (!editor || !editor.bookingCalendar) return; // Safety check
                        var calState = editor.bookingCalendar;

                        var currentStart = new Date(calState.startDate);
                        currentStart.setDate(currentStart.getDate() + (dir * 7)); // Move by week
                        var newStartDate = currentStart.toISOString().slice(0, 10);

                        // Update State & Loading
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            var ed = Object.assign({}, sc.editor);
                            var cal = Object.assign({}, ed.bookingCalendar);
                            cal.loading = true;
                            cal.startDate = newStartDate;
                            ed.bookingCalendar = cal;
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });

                        // Fetch RPC
                        try {
                            var payload = {
                                doctorId: calState.doctorId,
                                startDate: newStartDate,
                                daysCount: calState.daysCount,
                                branchId: 'pt'
                            };
                            var res = await fetch('/api/rpc/clinic-get-booking-calendar', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            var json = await res.json();

                            ctx.setState(function (prev) {
                                var sc = prev.data.screens.contracts;
                                var ed = Object.assign({}, sc.editor);
                                var cal = Object.assign({}, ed.bookingCalendar);
                                cal.loading = false;
                                if (json.success) cal.days = json.calendar || [];
                                ed.bookingCalendar = cal;
                                return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                            });
                        } catch (e) { console.error(e); }
                    }
                },
                'calendar:toggle-slot': {
                    on: ['click'],
                    gkeys: ['calendar:toggle-slot'],
                    handler: function (ev, ctx) {
                        var slotId = ev.target.getAttribute('data-slot-id');
                        var slotTime = ev.target.getAttribute('data-slot-time');
                        var slotDate = ev.target.getAttribute('data-slot-date');

                        if (!slotId) return;

                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            if (!sc || !sc.editor || !sc.editor.bookingCalendar) return prev; // Safety check
                            var ed = Object.assign({}, sc.editor);
                            var cal = Object.assign({}, ed.bookingCalendar);
                            var selected = (cal.selected || []).slice();

                            var idx = selected.findIndex(function (s) { return s.id === slotId; });
                            if (idx >= 0) {
                                selected.splice(idx, 1);
                            } else {
                                selected.push({ id: slotId, date: slotDate, time: slotTime });
                            }

                            cal.selected = selected;
                            ed.bookingCalendar = cal;
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });
                    }
                },
                'calendar:confirm': {
                    on: ['click'],
                    gkeys: ['calendar:confirm'],
                    handler: function (_ev, ctx) {
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            if (!sc || !sc.editor || !sc.editor.bookingCalendar) return prev; // Safety check
                            var ed = Object.assign({}, sc.editor);
                            var cal = ed.bookingCalendar;

                            // Transfer selected slots to main editor
                            // We need to fetch full slot objects? Or just trust IDs? 
                            // Ideally we map them to the same structure as 'selectedBlocks'
                            var newBlocks = cal.selected.map(function (s) {
                                return {
                                    id: s.id,
                                    slot_date: s.date,
                                    slot_time_start: s.time,
                                    slots: [s] // mimic block structure
                                };
                            });

                            ed.selectedBlocks = (ed.selectedBlocks || []).concat(newBlocks);
                            ed.selectedSlots = (ed.selectedSlots || []).concat(cal.selected);

                            // Close Calendar
                            ed.bookingCalendar = Object.assign({}, cal, { open: false });

                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });
                    }
                },
                'calendar:close': {
                    on: ['click'],
                    gkeys: ['calendar:close'],
                    handler: function (_ev, ctx) {
                        ctx.setState(function (prev) {
                            var sc = prev.data.screens.contracts;
                            if (!sc || !sc.editor) return prev; // Safety check
                            var ed = Object.assign({}, sc.editor);
                            ed.bookingCalendar = Object.assign({}, ed.bookingCalendar || {}, { open: false });
                            return Object.assign({}, prev, { data: Object.assign({}, prev.data, { screens: Object.assign({}, prev.data.screens, { contracts: Object.assign({}, sc, { editor: ed }) }) }) });
                        });
                    }
                }
            }
        }
    };

    // --- RENDER FUNCTIONS ---


    // ===================================
    // Patient Modal Rendering
    // ===================================
    function renderPatientModal(ctx) {
        var state = (ctx && typeof ctx.getState === 'function') ? ctx.getState() : ctx;
        var sc = state.data.screens.contracts || {};
        var modal = sc.patientModal; // { open: true, table: 'clinic_patients', form: {}, ... }

        if (!modal || !modal.open) return null;

        // Use shared SchemaCrud
        if (global.ClinicSchemaCrud && global.ClinicSchemaCrud.renderModal) {
            // SchemaCrud.renderModal expects "app" to call .getState()
            // We must mock it if we only have state
            var mockApp = (ctx && typeof ctx.getState === 'function') ? ctx : { getState: function () { return state; } };

            return global.ClinicSchemaCrud.renderModal(mockApp, {
                open: true,
                table: modal.table || 'clinic_patients',
                form: modal.form || {},
                meta: state.data.columnsMeta, // Should be specifically for this table ideally, but simpler for now
                loading: modal.loading,
                title: state.env.lang === 'ar' ? 'بيانات المريض' : 'Patient Data',
                fkReferenceCache: state.data.fkReferenceCache, // Pass raw cache for buildFkOptions
                fkOptions: state.data.fkReferenceCache && state.data.fkReferenceCache['clinic_patients'], // Backward compat
                translations: modal.translations,
                translationFields: modal.translationFields,
                languages: state.data.languages,
                languages: state.data.languages,
                onAddFk: 'contracts:patient-add-fk', // Enable add button
                records: state.data.records // Pass context records
            });
        }

        return null; // Fallback
    }

    function renderManagerModal(ctx) {
        var state = (ctx && typeof ctx.getState === 'function') ? ctx.getState() : ctx;
        var sc = state.data.screens.contracts || {};
        var manager = sc.patientManager; // { open: true, ... }

        if (!manager || !manager.open) return null;

        if (global.ClinicSchemaCrud && global.ClinicSchemaCrud.renderManager) {
            var mockApp = (ctx && typeof ctx.getState === 'function') ? ctx : { getState: function () { return state; } };

            var content = global.ClinicSchemaCrud.renderManager(mockApp, {
                table: 'clinic_patients',
                records: manager.list || [],
                total: manager.total || 0,
                page: manager.page || 1,
                limit: manager.limit || 20,
                searchTerm: manager.search || '',
                loading: manager.loading,
                meta: resolveSchemaColumns(state, 'clinic_patients'),
                labels: state.data.schemaInfo && state.data.schemaInfo.tableMap && state.data.schemaInfo.tableMap.clinic_patients && state.data.schemaInfo.tableMap.clinic_patients.labels,
                fkReferenceCache: state.data.fkReferenceCache,
                // Explicit Event Binding
                onSearch: 'contracts:manager:search',
                onPagePrev: 'contracts:manager:page-prev',
                onPageNext: 'contracts:manager:page-next',
                onAdd: 'contracts:patient-modal-open', // Reuse existing add modal
                onRefresh: 'contracts:manager:search', // Reuse search to refresh
                onEdit: 'contracts:manager-select'
            });

            return UI.Modal({
                open: true,
                title: state.env.lang === 'ar' ? 'إدارة المرضى' : 'Patient Management',
                size: 'xl',
                closeGkey: 'contracts:manager-close',
                hideFooter: true,
                content: D.Div({ class: 'h-[80vh] flex flex-col' }, [content])
            });
        }
    }


    // ===================================
    // Booking Calendar Rendering
    // ===================================
    function renderBookingCalendar(ctx) {
        var state = (ctx && typeof ctx.getState === 'function') ? ctx.getState() : ctx;
        if (!state || !state.data) return null; // Safety check

        var editor = state.data.screens.contracts && state.data.screens.contracts.editor;
        if (!editor) return null; // Safety check for editor

        var calendar = editor.bookingCalendar;
        if (!calendar || !calendar.open) return null;

        var lang = state.env.lang;
        var t = function (s) { return s; }; // shim

        var content;
        if (calendar.loading) {
            content = D.Div({ attrs: { class: 'p-8 text-center' } }, ['Loading...']);
        } else {
            // Grid Render
            content = D.Div({ attrs: { class: 'calendar-grid-container' } }, [
                // Header
                D.Div({ attrs: { class: 'flex justify-between items-center mb-4 p-2 bg-gray-50 rounded' } }, [
                    D.Button({ attrs: { class: 'btn btn-sm btn-outline', gkey: 'calendar:navigate', 'data-dir': '-1' } }, ['Previous Week']),
                    D.Span({ attrs: { class: 'font-bold' } }, [calendar.startDate + ' (2 Weeks)']),
                    D.Button({ attrs: { class: 'btn btn-sm btn-outline', gkey: 'calendar:navigate', 'data-dir': '1' } }, ['Next Week'])
                ]),
                // Table
                D.Div({ attrs: { class: 'overflow-auto', style: 'max-height: 60vh;' } }, [
                    D.Table({ attrs: { class: 'table w-full border-collapse' } }, [
                        D.Thead({}, [
                            D.Tr({}, [
                                D.Th({ attrs: { class: 'p-2 border bg-gray-100 w-32' } }, [lang === 'ar' ? 'التاريخ' : 'Date']),
                                D.Th({ attrs: { class: 'p-2 border bg-gray-100 w-24' } }, [lang === 'ar' ? 'اليوم' : 'Day']),
                                D.Th({ attrs: { class: 'p-2 border bg-gray-100' } }, [lang === 'ar' ? 'المواعيد المتاحة' : 'Available Slots'])
                            ])
                        ]),
                        D.Tbody({}, (calendar.days || []).map(function (day) {
                            return D.Tr({ attrs: { class: 'hover:bg-gray-50' } }, [
                                D.Td({ attrs: { class: 'p-2 border align-top font-mono' } }, [day.date]),
                                D.Td({ attrs: { class: 'p-2 border align-top font-bold' } }, [lang === 'ar' ? day.dayName : day.dayNameEn]),
                                D.Td({ attrs: { class: 'p-2 border' } }, [
                                    day.hasSlots
                                        ? D.Div({ attrs: { class: 'flex flex-wrap gap-2' } }, day.slots.map(function (slot) {
                                            var isSelected = (calendar.selected || []).find(function (s) { return s.id === slot.id; });
                                            var isBooked = slot.status === 'booked';
                                            var isBlocked = slot.status === 'blocked';

                                            if (isBooked || isBlocked) {
                                                return D.Button({
                                                    attrs: {
                                                        class: 'px-2 py-1 rounded bg-gray-100 text-gray-400 text-sm cursor-not-allowed border border-gray-200',
                                                        disabled: true
                                                    }
                                                }, ['🔒 ' + slot.time]);
                                            }

                                            return D.Button({
                                                attrs: {
                                                    class: 'px-3 py-1 rounded text-sm cursor-pointer border transition-colors duration-200 ' + (isSelected ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'),
                                                    gkey: 'calendar:toggle-slot',
                                                    'data-slot-id': slot.id,
                                                    'data-slot-time': slot.time,
                                                    'data-slot-date': slot.date
                                                }
                                            }, [(isSelected ? '✔ ' : '') + slot.time]);
                                        }))
                                        : D.Span({ attrs: { class: 'text-red-400 italic text-sm' } }, [
                                            day.reason === 'doctor_leave' ? (lang === 'ar' ? 'إجازة طبيب' : 'Doctor Leave')
                                                : (lang === 'ar' ? 'لا توجد مواعيد' : 'No available slots')
                                        ])
                                ])
                            ]);
                        }))
                    ])
                ]),
                // Footer
                D.Div({ attrs: { class: 'mt-4 pt-4 border-t flex justify-end gap-2' } }, [
                    D.Div({ attrs: { class: 'flex-1 self-center text-gray-600' } }, [
                        (lang === 'ar' ? 'المواعيد المختارة: ' : 'Selected Slots: ') + (calendar.selected || []).length
                    ]),
                    D.Button({ attrs: { class: 'btn btn-ghost', gkey: 'calendar:close' } }, [lang === 'ar' ? 'إلغاء' : 'Cancel']),
                    D.Button({ attrs: { class: 'btn btn-primary', gkey: 'calendar:confirm' } }, [lang === 'ar' ? 'تأكيد الحجز' : 'Confirm Booking'])
                ])
            ]);
        }

        return UI.Modal({
            size: 'xl',
            isOpen: true,
            title: lang === 'ar' ? 'اختيــار المواعيد' : 'Select Appointment Slots',
            onClose: null, // handled by gkey
            content: content
        });
    }

})(window);