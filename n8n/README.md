# Gawdee WhatsApp automation in n8n

These six importable workflows handle order item images, abandoned checkout follow-ups, opted-in offers over WhatsApp/SMS/email, and product/variant questions. They are **inactive** exports. Provider credentials and publishing are needed before messages can be sent. The backend can relay signed incoming Meta messages to the support workflow once configured.

## Import and configure

1. Import each JSON file in [`workflows/`](workflows) into n8n. Attach a **Header Auth** credential to every Webhook node. Use a long shared secret in a header such as `X-Gawdee-Automation-Key`. Send events only from a trusted server, never from the browser. Publish the workflows after configuration. n8n uses different test and production webhook URLs.
2. On each WhatsApp HTTP Request node, replace `REPLACE_PHONE_NUMBER_ID` with the Meta phone number ID and attach an **HTTP Bearer Auth** credential holding the Cloud API access token. Create and get approval for the templates below in WhatsApp Manager. Use public HTTPS image URLs reachable by Meta. Review the API version in the URL before deployment.
3. In the support workflow, replace the `Read current catalog` URL with a backend URL reachable from the n8n process, such as `http://127.0.0.1:8001/api/catalog/items` when both run directly on the same machine. Its endpoint supplies current item/variant names, stock, and selling prices. Attach backend authentication if this endpoint becomes private.
4. In the SMS workflow, replace `REPLACE_SMS_PROVIDER_ENDPOINT` and adapt the JSON body to the chosen SMS provider. The default body is `{ "to": "+91...", "message": "..." }`; providers vary. Attach the provider's credential.
5. In the email workflow, set `REPLACE_SENDER_EMAIL` and attach an SMTP credential. Make the supplied unsubscribe URL actually remove email marketing consent before publishing.
6. Run `python3 n8n/build.py` after editing a Code node source. Run `node n8n/verify.mjs` to check the exports and payload rules.

## Connect incoming WhatsApp support messages

1. Register the business phone number in Meta WhatsApp Cloud API and obtain its Phone Number ID and Meta App Secret. For a local test, keep the backend on port 8001 and expose it through a temporary HTTPS tunnel. Set Meta's callback URL to `https://YOUR-TUNNEL/api/webhooks/whatsapp` and subscribe to the `messages` field. Meta must reach the backend callback, not the n8n support webhook: the backend verifies Meta's challenge and signature, processes `STOP`, and translates messages to the n8n event format.
2. From the `backend/` directory, run `./.venv/bin/python configure_whatsapp_support.py`. Enter the Meta App Secret and the n8n production webhook URL. The script securely stores the Meta verify token, App Secret, and n8n Header Auth value in backend settings. Copy the printed verify token into Meta and the printed Header Auth value into the n8n support Webhook credential. If you already configured either value, enter it at the prompt to reuse it.
3. In n8n, configure the support workflow's `Read current catalog` URL and `Send support reply` node. The latter needs the Meta Phone Number ID in its URL and an HTTP Bearer Auth credential with the Cloud API access token. Publish the workflow so `/webhook/gawdee/support` is registered; the `/webhook-test/` URL only works while listening for a test event.
4. Send a product question to the Cloud API number from another WhatsApp account. Check the backend integration log for `support_forward_accepted`, then check the support workflow's **Executions** tab for catalog and Meta send results. n8n acknowledges the webhook before the reply node completes, so an accepted relay alone does not prove WhatsApp delivery.

When `n8n_support_webhook_url` is configured, the backend forwards inbound text only to n8n and does not run its direct product reply for that message. Each Meta message ID is deduplicated before forwarding. Without the n8n URL, the existing direct reply path remains in use.

## Event contract for the later website integration

Post one JSON event to the corresponding authenticated production webhook. Use a stable unique `event_id` for outbound notifications and `message_id` for inbound messages. The sending app must persist delivery/idempotency state and avoid replaying an event after an accepted send; n8n execution history alone is not a durable deduplication store. Keep provider message IDs and failures for retries. Do not put tokens or secrets in event bodies.

| Workflow path | Event | Required trigger condition |
| --- | --- | --- |
| `gawdee/order` | `order.confirmed` | COD order confirmed, or online payment verified; include order WhatsApp permission, all items, and absolute HTTPS image URLs. |
| `gawdee/followup` | `checkout.abandoned` | A visitor entered a phone number, opted in to WhatsApp follow-up, and a server check at least one hour later found no purchase. |
| `gawdee/marketing-wa` | `campaign.offer` | One recipient per event, with active WhatsApp marketing consent and no opt-out. |
| `gawdee/marketing-sms` | `campaign.offer` | One recipient per event, with active SMS marketing consent and an unsubscribe URL. |
| `gawdee/marketing-email` | `campaign.offer` | One recipient per event, with active email marketing consent and an unsubscribe URL. |
| `gawdee/support` | `whatsapp.message` | A signed, deduplicated incoming Meta message. Include its true receive timestamp. |

Example order event:

```json
{
  "type": "order.confirmed",
  "event_id": "order:GD260921001:confirmed",
  "order": {
    "order_number": "GD260921001",
    "customer_name": "Asha",
    "phone": "919876543210",
    "status": "processing",
    "payment_method": "razorpay",
    "payment_status": "paid",
    "whatsapp_order_opt_in": true,
    "whatsapp_opted_out": false,
    "total": 1499,
    "items": [
      {"product_name": "A2 Gir Cow Ghee 500ml", "quantity": 1, "image_url": "https://shop.example.com/assets/ghee-500ml.jpg"},
      {"product_name": "Raw Honey 250g", "quantity": 1, "image_url": "https://shop.example.com/assets/honey-250g.jpg"}
    ]
  }
}
```

The order workflow sends one approved template per purchased item. Its image header displays that item's image, with customer, order number, item, quantity, and order total in the body. Missing/non-HTTPS images use the text-only template.

Example abandoned checkout event:

```json
{
  "type": "checkout.abandoned",
  "event_id": "cart:abc123:followup:1",
  "lead": {
    "phone": "919876543210",
    "whatsapp_followup_opt_in": true,
    "whatsapp_opted_out": false,
    "purchased": false,
    "abandoned_at": "2026-09-21T10:00:00Z",
    "purchase_checked_at": "2026-09-21T11:05:00Z",
    "product_name": "A2 Gir Cow Ghee 500ml",
    "image_url": "https://shop.example.com/assets/ghee-500ml.jpg",
    "checkout_url": "https://shop.example.com/checkout"
  }
}
```

The app must recheck purchase immediately before dispatch. The workflow rejects a check older than five minutes. A bare page visit or anonymous cart cannot trigger WhatsApp: it supplies neither a phone number nor permission.

Example offer event, sent separately to each channel webhook:

```json
{
  "type": "campaign.offer",
  "event_id": "campaign:autumn26:user:42:whatsapp",
  "recipient": {
    "phone": "919876543210",
    "email": "asha@example.com",
    "whatsapp_marketing_opt_in": true,
    "sms_marketing_opt_in": true,
    "email_marketing_opt_in": true,
    "whatsapp_opted_out": false,
    "sms_opted_out": false,
    "email_opted_out": false,
    "unsubscribe_url": "https://shop.example.com/unsubscribe/opaque-token"
  },
  "offer": {
    "title": "Autumn offer",
    "description": "Save on selected Gawdee products this week.",
    "url": "https://shop.example.com/offers/autumn",
    "image_url": "https://shop.example.com/assets/autumn-offer.jpg"
  }
}
```

Example inbound support event:

```json
{
  "type": "whatsapp.message",
  "message_id": "wamid.example",
  "from": "919876543210",
  "text": "What sizes of ghee are available?",
  "received_at": "2026-09-21T11:10:00Z"
}
```

The support workflow answers from the current catalog. It lists only active variants with stock and current selling prices, asks for a product name if it cannot match, and directs customers to website support for a person. The future website bridge should create a support ticket or inbox handoff when a customer asks for a person. Inbound `STOP` must update the customer suppression record before this workflow runs.

## Approved WhatsApp templates

Create matching **approved** templates in WhatsApp Manager. Set image headers only on the `_image` versions. Add body placeholders in this order:

| Template | Category | Body placeholders |
| --- | --- | --- |
| `gawdee_order_item_image`, `gawdee_order_item_text` | Utility | Customer name, order number, item name, quantity, order total |
| `gawdee_checkout_followup_image`, `gawdee_checkout_followup_text` | Marketing | Item name, checkout URL |
| `gawdee_offer_image`, `gawdee_offer_text` | Marketing | Offer title, offer description, offer URL |

Template approval and category are determined by Meta. Adjust the component layout and approved template names in the Code nodes if Meta changes them. WhatsApp free-form support replies are sent only for messages received within the last 23 hours, leaving a buffer before the 24-hour window closes.

## Mapping to this app

- `orders` and `order_items` already contain order totals, purchased item names, quantities, and image paths. Convert image paths to public HTTPS URLs when producing the order event.
- `users.whatsapp_marketing_opt_in` and `whatsapp_opt_out_at` already exist. Order-update permission, SMS and email marketing consent, unsubscribe links, and phone-lead/cart abandonment records do **not** exist yet; add them with the later app integration before enabling those flows.
- The existing WhatsApp webhook verifies Meta signatures, deduplicates message IDs, processes `STOP`, and forwards inbound text to `gawdee/support` when the n8n support URL and key are configured. It skips its direct product reply in that case.
- Existing order notification queue processing can also send WhatsApp templates. Switch that path off for events handled by n8n to avoid duplicate order notices.
- Use server-side authorization, rate limits, and audit logs for campaign dispatch. Recheck consent at send time, keep campaign frequency limits, and suppress opted-out recipients across every channel.

The support relay is implemented but requires the Meta and n8n settings above. Other workflows are prepared integration packages; the app does not yet emit their event payloads.

References: [n8n Webhook and authentication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [n8n WhatsApp Cloud node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp/), [n8n SMTP email node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/), [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).
