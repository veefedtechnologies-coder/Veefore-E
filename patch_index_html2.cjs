const fs = require('fs');
let content = fs.readFileSync('client/index.html', 'utf8');

// For line 255: `            originalError.apply(console, args);` inside the resize observer suppression script.
content = content.replace(/          const originalError = console\.error;\n          console\.error = function \(\.\.\.args\) \{[\s\S]*?          \};/m, `          const originalError = console.error;
          console.error = function (...args) {
            if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver loop limit exceeded')) {
              return;
            }
            if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver loop completed with undelivered notifications.')) {
              return;
            }
            originalError.apply(console, args.map(a => typeof a === 'string' ? a.replace(/[<>\\\`]/g, '') : a));
          };`);

fs.writeFileSync('client/index.html', content);
