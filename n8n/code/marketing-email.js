const event = $input.first().json.body;
if (!event || event.type !== 'campaign.offer' || !event.event_id) throw new Error('Expected campaign.offer with event_id');
const recipient = event.recipient || {};
const email = String(recipient.email || '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email address');
if (recipient.email_marketing_opt_in !== true || recipient.email_opted_out === true) return [];
const offer = event.offer || {};
const title = String(offer.title || '').trim().slice(0, 140);
const description = String(offer.description || '').trim().slice(0, 1000);
const url = String(offer.url || '');
const unsubscribeUrl = String(recipient.unsubscribe_url || '');
if (!title || !description || !/^https:\/\/[^\s]+$/i.test(url) || !/^https:\/\/[^\s]+$/i.test(unsubscribeUrl)) throw new Error('Invalid offer or unsubscribe URL');
return [{json: {event_id: event.event_id, to: email, subject: title,
  message: `${description}\n\nView offer: ${url}\n\nUnsubscribe: ${unsubscribeUrl}`}}];
