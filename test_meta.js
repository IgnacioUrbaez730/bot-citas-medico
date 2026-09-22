const token = process.env.WHATSAPP_API_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_ID;

fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    to: '584127599855',
    type: 'text',
    text: { body: 'Direct Test' }
  })
}).then(r => r.json()).then(console.log);
