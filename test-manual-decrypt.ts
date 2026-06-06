
import crypto from 'crypto';
import dotenv from 'dotenv';
// Load root .env
dotenv.config();

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || ''; // Root key
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

function decrypt(encryptedToken: any, iterations: number) {
    try {
        const { encryptedData, iv, salt, tag } = encryptedToken;
        const ivBuffer = Buffer.from(iv, 'base64');
        const saltBuffer = Buffer.from(salt, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');

        // derive key
        const masterKey = ENCRYPTION_KEY;
        // Try WITHOUT global salt first (like the debug script)
        const key = crypto.pbkdf2Sync(masterKey, saltBuffer, iterations, KEY_LENGTH, 'sha256');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err: any) {
        return 'FAILED: ' + err.message;
    }
}

// Token data for rahulc1020
const tokenData = {
    "encryptedData": "QEESs3KZ/ghppaD70DxKreXOE1gkO9jIKgxh8JE65eXRf4Tk1ik3LuGNR63r1YVc/Mq/xfGKx+TYz6SN9FyvROjTOKGeKQFtbrcDI/ehxVvSjdBMudf/dIzTwqGiudkEeBuNxRsDSibNpQF43zdu5tBlWttIAfx45oki8XrxJusfefrbQulzhakt/RTu5PhTtp8KJu56k2O5fNoY",
    "iv": "AfvX71CrgA+4yZg0",
    "salt": "toTESRUsR0AP+w3Uzi+EiqcneYKAVPlrXTo7sAOSY8E=",
    "tag": "ZoDnIk1zk2jZ9Llk6D0pwA==",
    "kdf": 100000
};

console.log('Testing with root key: ' + ENCRYPTION_KEY.substring(0, 10) + '...');
console.log('Iterations 100000: ' + decrypt(tokenData, 100000));
console.log('Iterations 310000: ' + decrypt(tokenData, 310000));

// Try with GLOBAL_SALT from server/.env if available
const globalSaltStr = '8d148018566c696f0dfbda2d10b8abdd100354ce54e5dce4ad4f8954caaf2673';
function decryptWithSalt(encryptedToken: any, iterations: number) {
    try {
        const { encryptedData, iv, salt, tag } = encryptedToken;
        const ivBuffer = Buffer.from(iv, 'base64');
        const saltBuffer = Buffer.from(salt, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');
        const globalSalt = Buffer.from(globalSaltStr, 'utf8');
        const effectiveSalt = Buffer.concat([saltBuffer, globalSalt]);

        const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, effectiveSalt, iterations, KEY_LENGTH, 'sha256');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err: any) {
        return 'FAILED WITH SALT: ' + err.message;
    }
}

console.log('Iterations 100000 with salt: ' + decryptWithSalt(tokenData, 100000));
console.log('Iterations 310000 with salt: ' + decryptWithSalt(tokenData, 310000));
