const event = $input.first().json.body;
if (!event || event.type !== 'order.confirmed' || !event.event_id) throw new Error('Expected order.confirmed with event_id');
const order = event.order || {};
const phone = String(order.phone || '').replace(/\D/g, '');
if (!/^\d{8,15}$/.test(phone) || !order.order_number || !Array.isArray(order.items)) throw new Error('Invalid order notification');
if (order.whatsapp_order_opt_in !== true || order.whatsapp_opted_out === true) return [];
if (!['processing', 'packed', 'shipped', 'delivered'].includes(order.status)) return [];
if (order.payment_status !== 'paid' && order.payment_method !== 'cod') return [];
const total = Number(order.total);
if (!Number.isFinite(total) || total < 0) throw new Error('Invalid order total');
const name = String(order.customer_name || 'Customer').slice(0, 80);
const number = String(order.order_number).slice(0, 80);
const items = order.items;
if (!items.length) throw new Error('Order has no items');
if (items.length > 50) throw new Error('Order has too many items for a single notification event');
return items.map((item, index) => {
  const product = String(item.product_name || '').trim().slice(0, 140);
  const quantity = Number(item.quantity);
  if (!product || !Number.isInteger(quantity) || quantity < 1) throw new Error('Invalid order item');
  const image = String(item.image_url || item.image || '').trim();
  const hasImage = /^https:\/\/[^\s]+$/i.test(image);
  const components = [];
  if (hasImage) components.push({type: 'header', parameters: [{type: 'image', image: {link: image}}]});
  components.push({type: 'body', parameters: [name, number, product, String(quantity), `₹${total.toLocaleString('en-IN')}`].map(text => ({type: 'text', text}))});
  return {json: {
    event_id: `${event.event_id}:item:${index}`,
    payload: {messaging_product: 'whatsapp', to: phone, type: 'template', template: {
      name: hasImage ? 'gawdee_order_item_image' : 'gawdee_order_item_text',
      language: {code: 'en_US'}, components,
    }},
  }};
});
