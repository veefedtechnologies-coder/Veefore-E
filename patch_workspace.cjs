const fs = require('fs');
let content = fs.readFileSync('server/controllers/WorkspaceController.ts', 'utf8');

// CodeQL complains about "let hasTeamAccess = userPlan !== 'Free'; ... if (!hasTeamAccess) { ... } if (!hasTeamAccess) { ... } if (hasTeamAccess) { ... }"
// Let's refactor this section so it evaluates dynamically.
content = content.replace(/const hasTeamAccess = true; \/\/ TEMP FIX FOR CODEQL[\s\S]*?console.log\(`\[TEAM INVITE\] User \$\{user\.id\} - Plan: \$\{userPlan\}, Has team access: \$\{hasTeamAccess\}`\);/m, `    let hasTeamAccess = false;

    if (userPlan !== 'Free') {
      hasTeamAccess = true;
    } else {
      console.log(\`[TEAM INVITE] Checking team access for user \${user.id} (\${user.username})\`);
      try {
        const userAddons = await storage.getUserAddons(user.id);
        console.log(\`[TEAM INVITE] Found \${userAddons.length} addons for user\`);

        const teamMemberAddon = userAddons.find(addon =>
          (addon.type === 'team-member' || (addon.name && addon.name.includes('team-member'))) &&
          addon.isActive
        );

        if (teamMemberAddon) {
          hasTeamAccess = true;
        }
      } catch (error) {
        console.error(\`[TEAM INVITE] Error during team access check:\`, error);
      }
    }

    console.log(\`[TEAM INVITE] User \${user.id} - Plan: \${userPlan}, Has team access: \${hasTeamAccess}\`);`);

fs.writeFileSync('server/controllers/WorkspaceController.ts', content);
