import json
import uuid
import datetime

def get_uuid():
    return str(uuid.uuid4())

def get_date():
    return "2026-01-01T00:00:00"

data = {
    "version": 1,
    "meta": {
        "branchId": "clinic",
        "moduleId": "pt",
        "counter": 0,
        "labCounter": 0
    },
    "tables": {}
}

# 1. Languages (System)
# ---------------------------------------------------------
langs = [
    {"id": get_uuid(), "code": "ar", "name": "العربية", "direction": "rtl", "is_default": 1, "is_active": 1},
    {"id": get_uuid(), "code": "en", "name": "English", "direction": "ltr", "is_default": 0, "is_active": 1}
]
data["tables"]["languages"] = langs

# 2. UI Labels (Minimal set for dashboard)
# ---------------------------------------------------------
# (Usually these are static, I'll generate a few critical ones to ensure dashboard works)
ui_keys = [
    "app.title", "nav.dashboard", "nav.patients", "nav.bookings", "nav.settings",
    "label.name", "label.phone", "label.service", "label.price", "action.save", "action.cancel",
    "section.appointments", "section.stats"
]
ui_labels = []
ui_labels_lang = []
for key in ui_keys:
    k_id = get_uuid()
    ui_labels.append({"id": k_id, "code": key})
    # Arabize simple keys (mock translation)
    ar_text = key.split('.')[-1].capitalize() # Fallback
    if "dashboard" in key: ar_text = "لوحة التحكم"
    if "patients" in key: ar_text = "المرضى"
    if "bookings" in key: ar_text = "الحجوزات"
    if "settings" in key: ar_text = "الإعدادات"
    if "save" in key: ar_text = "حفظ"
    
    ui_labels_lang.append({"id": get_uuid(), "clinic_ui_labels_id": k_id, "lang": "ar", "text": ar_text})
    ui_labels_lang.append({"id": get_uuid(), "clinic_ui_labels_id": k_id, "lang": "en", "text": key.replace(".", " ").capitalize()})

data["tables"]["clinic_ui_labels"] = ui_labels
data["tables"]["clinic_ui_labels_lang"] = ui_labels_lang


# 3. Company & Branches
# ---------------------------------------------------------
company_id = get_uuid()
data["tables"]["companies"] = [{
    "id": company_id,
    "tax_number": "300-500-700",
    "begin_date": get_date(),
    "is_active": 1
}]
data["tables"]["companies_lang"] = [
    {"id": get_uuid(), "companies_id": company_id, "lang": "ar", "name": "عيادات إليت كير - Elite Care"},
    {"id": get_uuid(), "companies_id": company_id, "lang": "en", "name": "Elite Care Clinics"}
]

branch_id = get_uuid()
data["tables"]["branches"] = [{
    "id": branch_id,
    "company_id": company_id,
    "code": "MAADI",
    "begin_date": get_date(),
    "is_active": 1
}]
data["tables"]["branches_lang"] = [
    {"id": get_uuid(), "branches_id": branch_id, "lang": "ar", "name": "فرع المعادي"},
    {"id": get_uuid(), "branches_id": branch_id, "lang": "en", "name": "Maadi Branch"}
]

# 4. Specialties
# ---------------------------------------------------------
specs = [
    {"code": "PT", "ar": "علاج طبيعي", "en": "Physical Therapy"},
    {"code": "NUT", "ar": "تغذية علاجية", "en": "Clinical Nutrition"},
    {"code": "DERM", "ar": "جلدية وتجميل", "en": "Dermatology & Cosmetology"}
]
spec_objs = []
spec_lang_objs = []
spec_map = {} # code -> id

for sp in specs:
    s_id = get_uuid()
    spec_map[sp["code"]] = s_id
    spec_objs.append({
        "id": s_id,
        "company_id": company_id,
        "begin_date": get_date(),
        "is_active": 1
    })
    spec_lang_objs.append({"id": get_uuid(), "clinic_specialties_id": s_id, "lang": "ar", "name": sp["ar"]})
    spec_lang_objs.append({"id": get_uuid(), "clinic_specialties_id": s_id, "lang": "en", "name": sp["en"]})

data["tables"]["clinic_specialties"] = spec_objs
data["tables"]["clinic_specialties_lang"] = spec_lang_objs

# 5. Service Domains & Clinic Types (Vertical Structure)
# ---------------------------------------------------------
# Domains usually map 1:1 to specialties in simple setups, or groupings.
domains = [
    {"code": "DOM-PT", "ar": "تأهيل وإصابات ملاعب", "en": "Rehabilitation & Sports Injury", "spec": "PT"},
    {"code": "DOM-SLIM", "ar": "تنسيق قوام وتخسيس", "en": "Body Contouring & Slimming", "spec": "NUT"},
    {"code": "DOM-LASER", "ar": "ليزر وعناية بالبشرة", "en": "Laser & Skin Care", "spec": "DERM"}
]

clinic_types = [
    {"code": "CONS", "ar": "كشف / استشارة", "en": "Consultation", "mins": 30},
    {"code": "SESS", "ar": "جلسة علاجية", "en": "Treatment Session", "mins": 45},
    {"code": "FOLLOW", "ar": "متابعة", "en": "Follow-up", "mins": 15}
]

domain_map = {} # code -> id
type_map = {} # code -> id

# Generate Domains
d_objs, d_lang = [], []
for d in domains:
    d_id = get_uuid()
    domain_map[d["code"]] = d_id
    d_objs.append({
        "id": d_id,
        "company_id": company_id,
        "code": d["code"],
        "begin_date": get_date(),
        "is_active": 1
    })
    d_lang.append({"id": get_uuid(), "clinic_service_domains_id": d_id, "lang": "ar", "name": d["ar"]})
    d_lang.append({"id": get_uuid(), "clinic_service_domains_id": d_id, "lang": "en", "name": d["en"]})
data["tables"]["clinic_service_domains"] = d_objs
data["tables"]["clinic_service_domains_lang"] = d_lang

# Generate Types
t_objs, t_lang = [], []
for t in clinic_types:
    t_id = get_uuid()
    type_map[t["code"]] = t_id
    t_objs.append({
        "id": t_id,
        "company_id": company_id,
        "standard_duration_minutes": t["mins"],
        "visit_kind": "consultation" if t["code"] == "CONS" else "session",
        "begin_date": get_date(),
        "is_active": 1
    })
    t_lang.append({"id": get_uuid(), "clinic_types_id": t_id, "lang": "ar", "name": t["ar"]})
    t_lang.append({"id": get_uuid(), "clinic_types_id": t_id, "lang": "en", "name": t["en"]})
data["tables"]["clinic_types"] = t_objs
data["tables"]["clinic_types_lang"] = t_lang


# 6. Rooms & Stations
# ---------------------------------------------------------
rooms_data = [
    {"code": "R-PT-1", "ar": "غرفة العلاج الطبيعي 1", "en": "Physio Room 1", "type": "SESS"},
    {"code": "R-PT-2", "ar": "غرفة العلاج الطبيعي 2", "en": "Physio Room 2", "type": "SESS"},
    {"code": "R-NUT", "ar": "عيادة التغذية", "en": "Nutrition Clinic", "type": "CONS"},
    {"code": "R-DERM", "ar": "عيادة الجلدية", "en": "Derma Clinic", "type": "CONS"},
    {"code": "R-LASER", "ar": "غرفة الليزر", "en": "Laser Room", "type": "SESS"}
]

r_objs, r_lang, st_objs, st_lang = [], [], [], []
for r in rooms_data:
    r_id = get_uuid()
    c_type_id = type_map[r["type"]]
    r_objs.append({
        "id": r_id,
        "company_id": company_id,
        "branch_id": branch_id,
        "clinic_type": c_type_id,
        "room_code": r["code"],
        "begin_date": get_date(),
        "is_active": 1
    })
    r_lang.append({"id": get_uuid(), "clinic_rooms_id": r_id, "lang": "ar", "name": r["ar"]})
    r_lang.append({"id": get_uuid(), "clinic_rooms_id": r_id, "lang": "en", "name": r["en"]})

    # Create 1-2 stations (beds/chairs) per room
    for i in range(1, 3):
        st_id = get_uuid()
        st_objs.append({
            "id": st_id,
            "company_id": company_id,
            "room": r_id,
            "station_code": f"{r['code']}-S{i}",
            "begin_date": get_date(),
            "is_active": 1
        })
        st_lang.append({"id": get_uuid(), "clinic_stations_id": st_id, "lang": "ar", "name": f"سرير/كرسي {i}"})
        st_lang.append({"id": get_uuid(), "clinic_stations_id": st_id, "lang": "en", "name": f"Bed/Chair {i}"})

data["tables"]["clinic_rooms"] = r_objs
data["tables"]["clinic_rooms_lang"] = r_lang
data["tables"]["clinic_stations"] = st_objs
data["tables"]["clinic_stations_lang"] = st_lang

# 7. Devices
# ---------------------------------------------------------
devices_list = [
    {"code": "US", "ar": "موجات صوتية", "en": "Ultrasound"},
    {"code": "TENS", "ar": "تنبيه كهربائي", "en": "TENS Unit"},
    {"code": "LAS-AX", "ar": "ليزر كانديلا", "en": "Candela Laser"},
    {"code": "INBODY", "ar": "ميزان إنبادي", "en": "InBody Scale"}
]
dv_objs, dv_lang = [], []
for dv in devices_list:
    dv_id = get_uuid()
    dv_objs.append({
        "id": dv_id,
        "company_id": company_id,
        "code": dv["code"],
        "begin_date": get_date(),
        "is_active": 1
    })
    dv_lang.append({"id": get_uuid(), "clinic_devices_id": dv_id, "lang": "ar", "name": dv["ar"]})
    dv_lang.append({"id": get_uuid(), "clinic_devices_id": dv_id, "lang": "en", "name": dv["en"]})

data["tables"]["clinic_devices"] = dv_objs
data["tables"]["clinic_devices_lang"] = dv_lang


# 8. Services (The Meat)
# ---------------------------------------------------------
services_list = [
    # PT
    {"code": "PT-EVAL", "ar": "كشف وتقييم علاج طبيعي", "en": "PT Evaluation", "price": 300, "min": 30, "domain": "DOM-PT", "type": "CONS"},
    {"code": "PT-SESS", "ar": "جلسة علاج طبيعي يدوي", "en": "Manual Therapy Session", "price": 500, "min": 60, "domain": "DOM-PT", "type": "SESS"},
    {"code": "PT-HOME", "ar": "جلسة علاج طبيعي منزلي", "en": "Home PT Session", "price": 800, "min": 60, "domain": "DOM-PT", "type": "SESS"},
    
    # Nutrition
    {"code": "NUT-CONS", "ar": "كشف تغذية + InBody", "en": "Nutrition Consultation + InBody", "price": 400, "min": 30, "domain": "DOM-SLIM", "type": "CONS"},
    {"code": "NUT-FOL", "ar": "متابعة أسبوعية", "en": "Weekly Follow-up", "price": 150, "min": 15, "domain": "DOM-SLIM", "type": "FOLLOW"},
    {"code": "CRYO-SESS", "ar": "جلسة تجميد دهون (Cryo)", "en": "Cryolipolysis Session", "price": 600, "min": 45, "domain": "DOM-SLIM", "type": "SESS"},

    # Derma
    {"code": "DERM-CONS", "ar": "كشف جلدية", "en": "Dermatology Consultation", "price": 350, "min": 20, "domain": "DOM-LASER", "type": "CONS"},
    {"code": "BOTOX", "ar": "حقن بوتوكس (بالوحدة)", "en": "Botox Injection (Unit)", "price": 120, "min": 30, "domain": "DOM-LASER", "type": "SESS"},
    {"code": "LAS-BODY", "ar": "ليزر إزالة شعر - جسم كامل", "en": "Laser Hair Removal - Full Body", "price": 2500, "min": 90, "domain": "DOM-LASER", "type": "SESS"}
]

serv_objs, serv_lang = [], []

for s in services_list:
    s_id = get_uuid()
    serv_objs.append({
        "id": s_id,
        "company_id": company_id,
        "clinic_type": type_map[s["type"]],
        "service_domain": domain_map[s["domain"]],
        "code": s["code"],
        "base_price": s["price"],
        "base_duration_minutes": s["min"],
        "slot_minutes": s["min"],
        "is_package": 0,
        "begin_date": get_date(),
        "is_active": 1
    })
    serv_lang.append({"id": get_uuid(), "clinic_services_id": s_id, "lang": "ar", "name": s["ar"]})
    serv_lang.append({"id": get_uuid(), "clinic_services_id": s_id, "lang": "en", "name": s["en"]})

data["tables"]["clinic_services"] = serv_objs
data["tables"]["clinic_services_lang"] = serv_lang
# Add default_name for convenience (though typically lang table is used)
for s in serv_objs:
    # find english name
    en_name = next(l["name"] for l in serv_lang if l["clinic_services_id"] == s["id"] and l["lang"] == "en")
    s["default_name"] = en_name

# Output
# Output to file directly to avoid console encoding issues
output_path = "data/branches/pt/modules/clinic/seeds/initial.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print(f"Successfully wrote seed data to {output_path}")
