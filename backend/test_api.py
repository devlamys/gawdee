import asyncio
import json
import base64
import time
import hmac
import hashlib
from app.core.config import settings
from app.database import get_secret_key
import urllib.request

def create_admin_token():
    data = {
        "id": 1,
        "name": "Admin",
        "email": "admin@example.com",
        "role": "admin",
        "exp": int(time.time()) + 86400,
    }
    payload = base64.b64encode(json.dumps(data).encode()).decode()
    sig = hmac.new(get_secret_key(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"

token = create_admin_token()

payload_data = {
    "name": "Test Item API",
    "slug": "test-item-api",
    "rich_image_sections": [{"landscape": "foo", "portrait_1": "bar", "portrait_2": "baz"}],
    "variants": [
        {"variant_name": "Standard", "sku": "12345", "mrp": 100, "selling_price": 50, "stock_quantity": 10}
    ]
}

req = urllib.request.Request("http://localhost:8001/api/admin/items", data=json.dumps(payload_data).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode())
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode())
