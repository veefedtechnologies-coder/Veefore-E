const value = {
  "sender": { "id": "1479580653003682" },
  "recipient": { "id": "17841474747481653" },
  "timestamp": 1779916969876,
  "postback": {
    "title": "See products",
    "payload": "PAYLOAD_1779912136015_35",
    "mid": "test_mid"
  }
};

let itemsToProcess = [];
if (value && Array.isArray(value)) {
  itemsToProcess = value;
} else if (value && value.messaging && Array.isArray(value.messaging)) {
  itemsToProcess = value.messaging;
} else if (value && typeof value === 'object') {
  itemsToProcess = [value];
}

console.log("itemsToProcess:", itemsToProcess.length);
