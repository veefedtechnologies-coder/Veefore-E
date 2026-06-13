import { InstagramApiService } from './server/services/instagramApi';
import * as dotenv from 'dotenv';
import { IStorage } from './server/storage';
import { SocialAccountRepository } from './server/repositories/SocialAccountRepository';

dotenv.config();

async function diagnose() {
    const workspaceId = process.argv[2];
    if (!workspaceId) {
        console.error('Usage: npx tsx diagnostic-demographics.ts <workspaceId>');
        process.exit(1);
    }

    try {
        const repo = new SocialAccountRepository();
        const accounts = await repo.findByWorkspaceId(workspaceId);
        const insta = accounts.find(a => a.platform === 'instagram');

        if (!insta || !insta.accountId || !insta.accessToken) {
            console.error('Instagram account not found or missing credentials');
            return;
        }

        console.log(`Diagnosing account: ${insta.username} (${insta.accountId})`);

        const isBasicToken = insta.accessToken.startsWith('IGAA');
        const apiBase = isBasicToken ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
        const version = 'v22.0';

        const breakdowns = ['city', 'country', 'age', 'gender'];

        for (const breakdown of breakdowns) {
            const url = `${apiBase}/${version}/${insta.accountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}&access_token=${insta.accessToken}`;
            console.log(`\n--- Testing breakdown: ${breakdown} ---`);
            console.log(`URL: ${url}`);

            try {
                // We use private makeApiRequest via cast to access it for testing
                const response = await (InstagramApiService as any).makeApiRequest(url, insta.accessToken);
                console.log('Response Structure:', JSON.stringify(response, null, 2));
            } catch (error: any) {
                console.error(`Error for ${breakdown}:`, error.message);
                if (error.response) console.error(error.response.data);
            }
        }

    } catch (err: any) {
        console.error('Diagnostic failed:', err.message);
    }
}

diagnose();
