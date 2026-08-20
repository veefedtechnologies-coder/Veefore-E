const fs = require('fs');
const filepath = 'server/services/oauth/__tests__/TokenExchangeService.property.test.ts';
let content = fs.readFileSync(filepath, 'utf8');

// Use Vitest mock clear correctly
content = content.replace(
  /vi\.clearAllMocks\(\);/g,
  `mockOAuth2Client.setCredentials.mockClear();
            mockOAuth2Client.refreshAccessToken.mockClear();`
);

fs.writeFileSync(filepath, content, 'utf8');
