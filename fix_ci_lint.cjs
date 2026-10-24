const fs = require('fs');
let eslintRc = '.eslintrc.json';
if (fs.existsSync(eslintRc)) {
  let config = JSON.parse(fs.readFileSync(eslintRc, 'utf8'));

  config.plugins.push("react-hooks");

  fs.writeFileSync(eslintRc, JSON.stringify(config, null, 2));
}
