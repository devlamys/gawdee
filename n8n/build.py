"""Build importable n8n workflows from the reviewed Code node sources."""

import json
import uuid
from pathlib import Path


ROOT = Path(__file__).parent
OUT = ROOT / "workflows"
GRAPH_URL = "https://graph.facebook.com/v23.0/REPLACE_PHONE_NUMBER_ID/messages"


def node(name, kind, version, parameters, x, y):
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"gawdee-n8n:{name}")),
        "name": name,
        "type": f"n8n-nodes-base.{kind}",
        "typeVersion": version,
        "position": [x, y],
        "parameters": parameters,
    }


def webhook(name, path):
    n = node(name, "webhook", 2.1, {
        "httpMethod": "POST",
        "path": path,
        "authentication": "headerAuth",
        "responseMode": "onReceived",
        "options": {},
    }, 240, 300)
    n["webhookId"] = str(uuid.uuid5(uuid.NAMESPACE_URL, f"gawdee-webhook:{path}"))
    return n


def code(name, file, x=480):
    return node(name, "code", 2, {
        "mode": "runOnceForAllItems",
        "jsCode": (ROOT / "code" / file).read_text(),
    }, x, 300)


def whatsapp_send(name, x=720):
    return node(name, "httpRequest", 4.2, {
        "method": "POST",
        "url": GRAPH_URL,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpBearerAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.payload) }}",
        "options": {},
    }, x, 300)


def workflow(name, nodes, edges):
    connections = {}
    for source, target in edges:
        connections.setdefault(source, {"main": [[]]})["main"][0].append({
            "node": target, "type": "main", "index": 0,
        })
    return {
        "name": name,
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
        "active": False,
        "pinData": {},
        "tags": [],
    }


def save(filename, content):
    OUT.mkdir(exist_ok=True)
    (OUT / filename).write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n")


def main():
    for slug, title, code_file in [
        ("order", "Purchase item image notifications", "order.js"),
        ("followup", "Abandoned checkout follow-up", "followup.js"),
        ("marketing-wa", "Opted-in WhatsApp offers", "marketing-wa.js"),
    ]:
        hook = f"{slug} event"
        prepare = f"Prepare {slug} messages"
        send = f"Send {slug} WhatsApp"
        save(f"{slug}.json", workflow(
            f"Gawdee | {title}",
            [webhook(hook, f"gawdee/{slug}"), code(prepare, code_file), whatsapp_send(send)],
            [(hook, prepare), (prepare, send)],
        ))

    save("marketing-sms.json", workflow(
        "Gawdee | Opted-in SMS offers",
        [
            webhook("SMS event", "gawdee/marketing-sms"),
            code("Prepare SMS", "marketing-sms.js"),
            node("Send via SMS provider", "httpRequest", 4.2, {
                "method": "POST",
                "url": "https://REPLACE_SMS_PROVIDER_ENDPOINT",
                "authentication": "genericCredentialType",
                "genericAuthType": "httpBearerAuth",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json.payload) }}",
                "options": {},
            }, 720, 300),
        ],
        [("SMS event", "Prepare SMS"), ("Prepare SMS", "Send via SMS provider")],
    ))

    save("marketing-email.json", workflow(
        "Gawdee | Opted-in email offers",
        [
            webhook("Email event", "gawdee/marketing-email"),
            code("Prepare email", "marketing-email.js"),
            node("Send offer email", "emailSend", 2.1, {
                "fromEmail": "Gawdee <REPLACE_SENDER_EMAIL>",
                "toEmail": "={{ $json.to }}",
                "subject": "={{ $json.subject }}",
                "emailType": "text",
                "message": "={{ $json.message }}",
                "options": {},
            }, 720, 300),
        ],
        [("Email event", "Prepare email"), ("Prepare email", "Send offer email")],
    ))

    save("support.json", workflow(
        "Gawdee | WhatsApp product and variant answers",
        [
            webhook("Support event", "gawdee/support"),
            node("Read current catalog", "httpRequest", 4.2, {
                "url": "https://REPLACE_BACKEND_HOST/api/catalog/items",
                "options": {},
            }, 480, 300),
            code("Answer from catalog", "support.js", 720),
            whatsapp_send("Send support reply", 960),
        ],
        [
            ("Support event", "Read current catalog"),
            ("Read current catalog", "Answer from catalog"),
            ("Answer from catalog", "Send support reply"),
        ],
    ))


if __name__ == "__main__":
    main()
