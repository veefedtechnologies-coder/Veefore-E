import { tokenEncryption } from '../security/token-encryption';

async function runTests() {
    console.log('🧪 Testing TokenEncryptionService robustness...');

    const invalidInputs = [
        null,
        undefined,
        {},
        { encryptedData: 'test' }, // missing iv, salt, tag
        { encryptedData: 'test', iv: null, salt: 's', tag: 't' }, // iv is null
        { encryptedData: 'test', iv: 'iv', salt: 123, tag: 't' }, // salt is number
        { encryptedData: 'test', iv: 'iv', salt: 's', tag: true }, // tag is boolean
    ];

    let passed = 0;
    let failed = 0;

    for (const input of invalidInputs) {
        try {
            console.log(`\nTesting input: ${JSON.stringify(input)}`);
            tokenEncryption.decryptToken(input as any);
            console.error('❌ FAILED: Should have thrown an error');
            failed++;
        } catch (error: any) {
            if (error instanceof TypeError) {
                console.error('❌ FAILED: Caught TypeError (expected a regular Error):', error.message);
                failed++;
            } else {
                console.log('✅ PASSED: Caught expected Error:', error.message);
                passed++;
            }
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
});
