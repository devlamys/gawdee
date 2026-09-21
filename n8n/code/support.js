const event = $('Support event').first().json.body;
if (!event || event.type !== 'whatsapp.message' || !event.message_id) throw new Error('Expected whatsapp.message with message_id');
const phone = String(event.from || '').replace(/\D/g, '');
const query = String(event.text || '').trim().slice(0, 700);
if (!/^\d{8,15}$/.test(phone) || !query) return [];
const receivedAt = Date.parse(event.received_at || '');
if (!Number.isFinite(receivedAt) || Date.now() - receivedAt > 23 * 3600000 || receivedAt > Date.now() + 300000) return [];
if (/^(stop|unsubscribe|cancel|opt out)$/i.test(query)) return [];
const catalog = $input.first().json;
if (!catalog || catalog.ok !== true || !Array.isArray(catalog.items)) throw new Error('Catalog unavailable');
const words = query.toLowerCase().match(/[a-z0-9]+/g) || [];
const ignored = new Set(['what','which','the','and','have','with','does','your','price','size','sizes','variant','variants','pack','packs','available','do','you','is','are','for','of','in','a','i','want','show','me','about']);
const terms = words.filter(word => word.length > 2 && !ignored.has(word));
const scored = catalog.items.filter(item => item.isActive && Array.isArray(item.variants)).map(item => {
  const name = `${item.name || ''} ${item.flavor || ''}`.toLowerCase();
  const variantNames = item.variants.map(v => `${v.variantName || ''} ${v.uom || ''}`.toLowerCase()).join(' ');
  const score = terms.reduce((sum, word) => sum + (name.includes(word) ? 3 : 0) + (variantNames.includes(word) ? 1 : 0), 0);
  return {item, score};
}).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score);
let reply;
if (/\b(human|agent|person|complaint)\b/i.test(query)) {
  reply = 'For help from a person, please contact Gawdee support through the website.';
} else if (!scored.length) {
  reply = 'I can help with Gawdee products, prices, and available variants. Please send a product name, or ask for a person to help.';
} else {
  const lines = scored.slice(0, 3).map(({item}) => {
    const variants = item.variants.filter(v => v.isActive && Number(v.stock) > 0);
    const list = variants.length ? variants.slice(0, 8).map(v => `${v.variantName || v.uom || 'Standard'}: ₹${Number(v.sellingPrice).toLocaleString('en-IN')}`).join(', ') : 'Currently out of stock';
    return `${item.name}: ${list}`;
  });
  reply = `${lines.join('\n')}\n\nPrices and availability can change. Ask for a person if you need more help.`;
}
return [{json: {message_id: event.message_id, payload: {messaging_product: 'whatsapp', to: phone, type: 'text', text: {body: reply.slice(0, 2000)}}}}];
