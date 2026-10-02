const fs = require('fs');
let content = fs.readFileSync('.github/workflows/security-audit.yml', 'utf8');

// For dependency-review-action error: "Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled"
content = content.replace(/      - name: Dependency Review\n        uses: actions\/dependency-review-action@v4\n        with:\n          fail-on-severity: critical\n          deny-licenses: GPL-2.0, GPL-3.0, LGPL-2.1, LGPL-3.0/g, `      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        if: false # Disabled since Dependency graph is not enabled on this repository
        with:
          fail-on-severity: critical
          deny-licenses: GPL-2.0, GPL-3.0, LGPL-2.1, LGPL-3.0`);

fs.writeFileSync('.github/workflows/security-audit.yml', content);
