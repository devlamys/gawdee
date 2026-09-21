const event = $input.first().json.body;
if (!event || event.type !== 'checkout.abandoned' || !event.event_id) throw new Error('Expected checkout.abandoned with event_id');
const lead = event.lead || {};
const phone = String(lead.phone || '').replace(/\D/g, '');
if (!/^\d{8,15}$/.test(phone)) throw new Error('Phone must include country code');
if (lead.whatsapp_followup_opt_in !== true || lead.purchased === true || lead.whatsapp_opted_out === true) return [];
const checkedAt = Date.parse(lead.purchase_checked_at || '');
const abandonedAt = Date.parse(lead.abandoned_at || '');
if (!Number.isFinite(checkedAt) || !Number.isFinite(abandonedAt) || checkedAt - abandonedAt < 3600000 || Date.now() - checkedAt > 300000) {
  throw new Error('Purchase must be rechecked at least one hour after abandonment and within the last five minutes');
}
const product = String(lead.product_name || 'your items').slice(0, 140);
const checkoutUrl = String(lead.checkout_url || '');
if (!/^https:\/\/[^\s]+$/i.test(checkoutUrl)) throw new Error('A secure checkout URL is required');
const image = String(lead.image_url || '');
const hasImage = /^https:\/\/[^\s]+$/i.test(image);
const components = [];
if (hasImage) components.push({type: 'header', parameters: [{type: 'image', image: {link: image}}]});
components.push({type: 'body', parameters: [product, checkoutUrl].map(text => ({type: 'text', text}))});
return [{json: {event_id: event.event_id, payload: {
  messaging_product: 'whatsapp', to: phone, type: 'template', template: {
    name: hasImage ? 'gawdee_checkout_followup_image' : 'gawdee_checkout_followup_text',
    language: {code: 'en_US'}, components,
  },
}}}];
