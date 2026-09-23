import json

from app.database import to_item_dto


def test_to_item_dto_keeps_marketing_content():
    payload = {
        "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "gallery": ["/assets/images/one.jpg", "/assets/images/two.jpg"],
        "uses": ["Daily wellness", "Cooking support"],
        "benefits": ["Natural energy", "Digestive comfort"],
        "advantages": ["Chemical-free", "Small batch"],
        "faqs": [{"question": "How do I use it?", "answer": "Use 1-2 teaspoons daily."}],
    }

    dto = to_item_dto({
        "id": 1,
        "slug": "demo-honey",
        "name": "Demo Honey",
        "description": "A sample product",
        "image_url": "/assets/images/main.jpg",
        "category": "Honey",
        "category_key": "honey",
        "is_active": 1,
        "rich_image_sections": json.dumps(payload),
    })

    assert dto["rich_image_sections"]["video_url"] == payload["video_url"]
    assert dto["rich_image_sections"]["uses"] == payload["uses"]
    assert dto["rich_image_sections"]["faqs"][0]["question"] == "How do I use it?"


def test_to_item_dto_accepts_object_marketing_content():
    payload = {
        "video_url": "https://example.com/video.mp4",
        "uses": ["Morning energy"],
    }

    dto = to_item_dto({
        "id": 2,
        "slug": "demo-ghee",
        "name": "Demo Ghee",
        "description": "A sample product",
        "image_url": "/assets/images/main.jpg",
        "category": "Ghee",
        "category_key": "ghee",
        "is_active": 1,
        "rich_image_sections": payload,
    })

    assert dto["rich_image_sections"]["uses"] == ["Morning energy"]
