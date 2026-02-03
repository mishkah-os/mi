import json

k = "clinic_patients"
f = r"d:\git\os\data\schemas\clinic_schema.json"

with open(f, "r", encoding="utf-8") as file:
    lines = file.readlines()
    for i, line in enumerate(lines):
        if '"name": "clinic_patients"' in line or '"name": "patients"' in line:
            print(f"Found {line.strip()} at line {i+1}")
