import requests
import json
import uuid

BASE = "http://localhost:8000/api/inventory"

products = [
    {
        "productId": str(uuid.uuid4()),
        "operationId": "seed-1",
        "name": "威猛先生厨房清洁剂",
        "brand": "威猛先生",
        "category": "kitchen_cleaner",
        "ingredients": [{"display_value": "次氯酸钠"}, {"display_value": "水"}, {"display_value": "表面活性剂"}],
        "label_warnings": [{"display_value": "远离儿童"}, {"display_value": "不可食用"}],
        "hazards": [{"text": "腐蚀性液体，避免接触皮肤"}],
        "storage_requirements": [{"text": "避光阴凉处保存"}, {"text": "远离热源"}],
        "incompatibility_targets": [{"text": "含氨清洁剂"}, {"text": "酸性清洁剂"}],
        "production_date": {"value": "2025-03"},
        "expiry_date": {"value": "2027-03"},
        "shelf_life_text": "24个月",
        "duplicateDecision": "create_another",
    },
    {
        "productId": str(uuid.uuid4()),
        "operationId": "seed-2",
        "name": "蓝月亮洗手液",
        "brand": "蓝月亮",
        "category": "disinfectant",
        "ingredients": [{"display_value": "乙醇"}, {"display_value": "甘油"}, {"display_value": "水"}],
        "label_warnings": [{"display_value": "外用勿饮"}],
        "hazards": [{"text": "含酒精，远离火源"}],
        "storage_requirements": [{"text": "常温保存"}],
        "incompatibility_targets": [],
        "production_date": {"value": "2025-06"},
        "expiry_date": {"value": "2027-06"},
        "shelf_life_text": "24个月",
        "duplicateDecision": "create_another",
    },
    {
        "productId": str(uuid.uuid4()),
        "operationId": "seed-3",
        "name": "超威杀虫气雾剂",
        "brand": "超威",
        "category": "pesticide",
        "ingredients": [{"display_value": "氯菊酯"}, {"display_value": "溶剂油"}],
        "label_warnings": [{"display_value": "有毒"}, {"display_value": "远离儿童"}, {"display_value": "不可与食物混放"}],
        "hazards": [{"text": "有毒，吸入有害"}, {"text": "易燃，远离火源"}],
        "storage_requirements": [{"text": "阴凉干燥处"}, {"text": "避免阳光直射"}],
        "incompatibility_targets": [{"text": "漂白剂"}, {"text": "氧化剂"}],
        "production_date": {"value": "2025-01"},
        "expiry_date": {"value": "2027-01"},
        "shelf_life_text": "24个月",
        "duplicateDecision": "create_another",
    },
    {
        "productId": str(uuid.uuid4()),
        "operationId": "seed-4",
        "name": "威白洁厕灵",
        "brand": "威白",
        "category": "toilet_cleaner",
        "ingredients": [{"display_value": "盐酸"}, {"display_value": "表面活性剂"}],
        "label_warnings": [{"display_value": "腐蚀性"}, {"display_value": "勿与漂白剂混用"}],
        "hazards": [{"text": "强酸性，避免接触皮肤和眼睛"}],
        "storage_requirements": [{"text": "密封保存"}, {"text": "远离儿童"}],
        "incompatibility_targets": [{"text": "漂白剂"}, {"text": "含氨清洁剂"}],
        "production_date": {"value": "2024-12"},
        "expiry_date": {"value": "2026-12"},
        "shelf_life_text": "24个月",
        "duplicateDecision": "create_another",
    },
]

for p in products:
    r = requests.post(f"{BASE}/products", json=p)
    print(f"{p['name']}: {r.status_code}")
    if r.status_code != 201:
        print(f"  Error: {r.text[:300]}")

print("\n--- Listing products ---")
r = requests.get(f"{BASE}/products")
data = r.json()
print(f"Total: {data['total']}")
for item in data["items"]:
    print(f"  - {item['name']} ({item['category']}) id={item['productId']}")
