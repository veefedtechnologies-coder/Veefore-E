
const http = require('http');

const data = JSON.stringify({
    name: "Duplicate Tester",
    email: "race@test.com",
    role: "solo",
    questionnaire: {
        name: "Duplicate Tester",
        email: "race@test.com",
        orgType: "solo",
        primaryPlatform: "instagram",
        contentNiche: "tech",
        creatorAudienceSize: "10k-100k",
        postingFrequency: "daily",
        referralSource: "search",
        primaryGoal: "viral"
    }
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/early-access/join',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

// First request (Create)
const req1 = http.request(options, (res) => {
    console.log(`Req 1 Status: ${res.statusCode}`);

    // Second request (Duplicate)
    const req2 = http.request(options, (res2) => {
        console.log(`Req 2 Status: ${res2.statusCode}`);
    });
    req2.write(data);
    req2.end();
});

req1.write(data);
req1.end();
