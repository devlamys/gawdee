import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const exports = fs.readdirSync(path.join(dir, 'workflows')).filter(name => name.endsWith('.json'));
assert.equal(exports.length, 6);
for (const name of exports) {
  const workflow = JSON.parse(fs.readFileSync(path.join(dir, 'workflows', name), 'utf8'));
  assert.equal(workflow.active, false);
  const names = new Set(workflow.nodes.map(node => node.name));
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert(names.has(source));
    for (const edge of outputs.main.flat()) assert(names.has(edge.node));
  }
  assert(workflow.nodes.some(node => node.type === 'n8n-nodes-base.webhook'));
}

function run(file, body, result = {}, webhookName = 'Support event') {
  const source = fs.readFileSync(path.join(dir, 'code', file), 'utf8');
  const input = {first: () => ({json: file === 'support.js' ? result : {body}})};
  const lookup = name => {
    assert.equal(name, webhookName);
    return {first: () => ({json: {body}})};
  };
  return new Function('$input', '$', source)(input, lookup);
}

const order = {type: 'order.confirmed', event_id: 'order:1', order: {
  order_number: 'GD1', customer_name: 'Asha', phone: '919876543210', status: 'processing',
  payment_method: 'razorpay', payment_status: 'paid', whatsapp_order_opt_in: true, total: 1499,
  items: [
    {product_name: 'Ghee 500ml', quantity: 1, image_url: 'https://example.com/ghee.jpg'},
    {product_name: 'Honey', quantity: 2, image_url: 'https://example.com/honey.jpg'},
  ],
}};
const orderOutput = run('order.js', order);
assert.equal(orderOutput.length, 2);
assert.equal(orderOutput[0].json.payload.template.components[0].parameters[0].image.link, 'https://example.com/ghee.jpg');
assert.equal(orderOutput[1].json.payload.template.components[0].parameters[0].image.link, 'https://example.com/honey.jpg');
assert.equal(run('order.js', {...order, order: {...order.order, payment_status: 'pending'}}).length, 0);
assert.equal(run('order.js', {...order, order: {...order.order, whatsapp_order_opt_in: false}}).length, 0);

const now = Date.now();
const followup = {type: 'checkout.abandoned', event_id: 'cart:1', lead: {
  phone: '919876543210', whatsapp_followup_opt_in: true, purchased: false,
  abandoned_at: new Date(now - 66 * 60000).toISOString(),
  purchase_checked_at: new Date(now - 60000).toISOString(),
  product_name: 'Ghee', checkout_url: 'https://example.com/checkout',
}};
assert.equal(run('followup.js', followup).length, 1);
assert.equal(run('followup.js', {...followup, lead: {...followup.lead, purchased: true}}).length, 0);

const offer = {type: 'campaign.offer', event_id: 'campaign:1',
  recipient: {phone: '919876543210', email: 'asha@example.com', whatsapp_marketing_opt_in: true,
    sms_marketing_opt_in: true, email_marketing_opt_in: true,
    unsubscribe_url: 'https://example.com/unsubscribe/token'},
  offer: {title: 'Offer', description: 'Save this week', url: 'https://example.com/offer',
    image_url: 'https://example.com/offer.jpg'},
};
assert.equal(run('marketing-wa.js', offer).length, 1);
assert.equal(run('marketing-sms.js', offer).length, 1);
assert(run('marketing-email.js', offer)[0].json.message.includes('Unsubscribe:'));
assert.equal(run('marketing-wa.js', {...offer, recipient: {...offer.recipient, whatsapp_marketing_opt_in: false}}).length, 0);

const support = {type: 'whatsapp.message', message_id: 'wamid.1', from: '919876543210',
  text: 'What sizes of ghee are available?', received_at: new Date(now - 60000).toISOString()};
const catalog = {ok: true, items: [{name: 'A2 Ghee', isActive: 1, variants: [
  {variantName: '500ml', sellingPrice: 899, stock: 5, isActive: 1},
  {variantName: '1L', sellingPrice: 1699, stock: 0, isActive: 1},
]}]};
const answer = run('support.js', support, catalog)[0].json.payload.text.body;
assert(answer.includes('500ml: ₹899'));
assert(!answer.includes('1L'));
assert.equal(run('support.js', {...support, received_at: new Date(now - 25 * 3600000).toISOString()}, catalog).length, 0);

console.log('Verified 6 workflow graphs and representative order, follow-up, consent, and catalog answers.');
