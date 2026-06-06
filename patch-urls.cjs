const fs = require('fs');
let content = fs.readFileSync('client/src/pages/SocialListeningPage.tsx', 'utf8');

content = content.replace("await apiRequest(`/api/social-listening/dashboard/overview/${currentWorkspace.id}`);", "await apiRequest(`/api/social-listening/dashboard/overview/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);");
content = content.replace("await apiRequest(`/api/social-listening/dashboard/sentiment-timeline/${currentWorkspace.id}`);", "await apiRequest(`/api/social-listening/dashboard/sentiment-timeline/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);");
content = content.replace("await apiRequest(`/api/social-listening/dashboard/topic-clusters/${currentWorkspace.id}`);", "await apiRequest(`/api/social-listening/dashboard/topic-clusters/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);");
content = content.replace("await apiRequest(`/api/social-listening/dashboard/viral-hooks/${currentWorkspace.id}`);", "await apiRequest(`/api/social-listening/dashboard/viral-hooks/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);");
content = content.replace("await apiRequest(`/api/social-listening/posts/${currentWorkspace.id}`);", "await apiRequest(`/api/social-listening/posts/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);");

fs.writeFileSync('client/src/pages/SocialListeningPage.tsx', content);
console.log('patched');
