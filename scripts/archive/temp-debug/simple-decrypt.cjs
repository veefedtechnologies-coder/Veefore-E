const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const GLOBAL_SALT_STRING = ''; // It was empty in .env

const masterKey = '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';

const encryptedToken = { "encryptedData": "Ghj+eNbou6nbB5n+FoP5aHnX9eQfAlW67SAW8RdTULIfgquAuZmdy5F2ujn/UU8bSJlgA/59dUo7bQPeTzmTWGxvqqJOD5fIod64E500xmQkmi7QslRJBd7GKvImq06XoLVsUirqnljrOFwkt7O0OQX05vhINGomYnVQJ4lu2HMSzB0PefYcJ5Pm6pJRFUa2Jm1fu28W8fCnq8rcAXLd", "iv": "dqaKGPWzsKMQMQDS", "salt": "Em4R3Fw7l1DqGTy1H0majXygCmVrdQkGBJt97q6C1ng=", "tag": "0P7bhvhz4pl6hSSOoaUtGQ==", "kdf": 100000 };

function deriveKey(salt, iterations) {
    const globalSalt = GLOBAL_SALT_STRING ? Buffer.from(GLOBAL_SALT_STRING, 'utf8') : null;
    const effectiveSalt = globalSalt ? Buffer.concat([salt, globalSalt]) : salt;
    return crypto.pbkdf2Sync(masterKey, effectiveSalt, iterations, KEY_LENGTH, 'sha256');
}

function decrypt() {
    try {
        const { encryptedData, iv, salt, tag, kdf } = encryptedToken;

        const ivBuffer = Buffer.from(iv, 'base64');
        const saltBuffer = Buffer.from(salt, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');
        const iterations = kdf || 100000;

        const key = deriveKey(saltBuffer, iterations);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
        decryptedData += decipher.final('utf8');

        console.log('DECRYPTED_TOKEN:', decryptedToken = decryptedData);
    } catch (e) {
        console.error('Decryption failed:', e.message);
    }
}

decrypt();
