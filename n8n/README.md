# Gawdee WhatsApp automation in n8n

These six importable workflows handle order item images, abandoned checkout follow-ups, opted-in offers over WhatsApp/SMS/email, and product/variant questions. They are **inactive** exports. The website integration and provider credentials are still needed before messages can be sent.

## Import and configure

1. Import each JSON file in [`workflows/`](workflows) into n8n. Attach a **Header Auth** credential to every Webhook node. Use a long shared secret in a header such as `X-Gawdee-Automation-Key`. Send events only from a trusted server, never from the browser. Publish the workflows after configuration. n8n uses different test and production webhook URLs.
2. On each WhatsApp HTTP Request node, replace `REPLACE_PHONE_NUMBER_ID` with the Meta phone number ID and attach an **HTTP Bearer Auth** credential holding the Cloud API access token. Create and get approval for the templates below in WhatsApp Manager. Use public HTTPS image URLs reachable by Meta. Review the API version in the URL before deployment.
3. In the support workflow, replace `REPLACE_BACKEND_HOST` with the public backend host. Its `GET /api/catalog/items` endpoint supplies current item/variant names, stock, and selling prices. Attach backend authentication if this endpoint becomes private.
4. In the SMS workflow, replace `REPLACE_SMS_PROVIDER_ENDPOINT` and adapt the JSON body to the chosen SMS provider. The default body is `{ "to": "+91...", "message": "..." }`; providers vary. Attach the provider's credential.
5. In the email workflow, set `REPLACE_SENDER_EMAIL` and attach an SMTP credential. Make the supplied unsubscribe URL actually remove email marketing consent before publishing.
6. Run `python3 n8n/build.py` after editing a Code node source. Run `node n8n/verify.mjs` to check the exports and payload rules.

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
- The existing WhatsApp webhook currently receives Meta callbacks, and there are uncommitted changes for direct product auto-replies. When connecting n8n, make that backend handler verify Meta signatures, deduplicate messages, process STOP, and forward inbound text to `gawdee/support`. Disable its direct auto-reply to avoid two answers.
- Existing order notification queue processing can also send WhatsApp templates. Switch that path off for events handled by n8n to avoid duplicate order notices.
- Use server-side authorization, rate limits, and audit logs for campaign dispatch. Recheck consent at send time, keep campaign frequency limits, and suppress opted-out recipients across every channel.

The workflows are a prepared integration package; they have not been connected to a live n8n instance or message providers. The app does not yet emit these event payloads.

References: [n8n Webhook and authentication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/), [n8n WhatsApp Cloud node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp/), [n8n SMTP email node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/), [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/).
