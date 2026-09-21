from app.integrations import build_order_whatsapp_payload, build_product_query_answer


def test_build_order_whatsapp_payload_includes_order_and_image():
    payload = build_order_whatsapp_payload(
        {
            "order_number": "GWD-1001",
            "customer_name": "Asha",
            "total": 1499,
            "payment_method": "razorpay",
        },
        [{
            "quantity": 1,
            "product_name": "A2 Gir Cow Ghee",
            "variant_name": "500ml",
            "image_url": "https://cdn.example.com/ghee-500ml.jpg",
        }],
    )

    assert "GWD-1001" in payload["text"]
    assert "Asha" in payload["text"]
    assert payload["image_url"] == "https://cdn.example.com/ghee-500ml.jpg"
    assert "ghee" in payload["text"].lower()


def test_build_product_query_answer_handles_variant_question():
    products = [{
        "full_name": "A2 Gir Cow Ghee",
        "price": 899,
        "description": "Traditional bilona ghee made from A2 Gir cow milk.",
        "image": "https://cdn.example.com/ghee.jpg",
    }]

    reply = build_product_query_answer(
        "what variants do you have for ghee?",
        products,
        "999",
        "care@gawdee.com",
    )

    assert "A2 Gir Cow Ghee" in reply
    assert "variants" in reply.lower()
    assert "care@gawdee.com" in reply
