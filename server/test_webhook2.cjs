const crypto = require('crypto');
const axios = require('axios');

const payload = {
  "object": "instagram",
  "entry": [
    {
      "id": "17841474747481653",
      "time": 1779916969,
      "changes": [
        {
          "field": "messages",
          "value": {
            "sender": { "id": "1479580653003682" },
            "recipient": { "id": "17841474747481653" },
            "timestamp": 1779916969876,
            "postback": {
              "title": "See products",
              "payload": "PAYLOAD_1779912136015_35",
              "mid": "test_mid"
            }
          }
        }
      ]
    }
  ]
};

const secret = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
const payloadString = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

axios.post('http://localhost:3000/api/webhooks/instagram', payload, {
  headers: {
    'x-hub-signature-256': `sha256=${signature}`,
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log("Success:", res.status);
}).catch(err => {
  console.error("Error:", err.response ? err.response.data : err.message);
});
