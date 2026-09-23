const event = $input.first().json.body;
if (!event || event.type !== 'campaign.offer' || !event.event_id) throw new Error('Expected campaign.offer with event_id');
const recipient = event.recipient || {};
const phone = String(recipient.phone || '').replace(/\D/g, '');
if (!/^\d{8,15}$/.test(phone)) throw new Error('Phone must include country code');
if (recipient.whatsapp_marketing_opt_in !== true || recipient.whatsapp_opted_out === true) return [];
const offer = event.offer || {};
const title = String(offer.title || '').trim().slice(0, 140);
const description = String(offer.description || '').trim().slice(0, 500);
const url = String(offer.url || '');
if (!title || !description || !/^https:\/\/[^\s]+$/i.test(url)) throw new Error('Offer title, description and HTTPS URL are required');
const image = String(offer.image_url || '');
const hasImage = /^https:\/\/[^\s]+$/i.test(image);
const components = [];
if (hasImage) components.push({type: 'header', parameters: [{type: 'image', image: {link: image}}]});
components.push({type: 'body', parameters: [title, description, url].map(text => ({type: 'text', text}))});
return [{json: {event_id: event.event_id, payload: {
  messaging_product: 'whatsapp', to: phone, type: 'template', template: {
    name: hasImage ? 'gawdee_offer_image' : 'gawdee_offer_text',
    language: {code: 'en_US'}, components,
  },
}}}];
