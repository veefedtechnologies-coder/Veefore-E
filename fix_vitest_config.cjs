const fs = require('fs');

let vitestPath = 'vitest.config.ts';
if (fs.existsSync(vitestPath)) {
  let content = fs.readFileSync(vitestPath, 'utf8');
  content = content.replace(/process\.env\.RAZORPAY_KEY_ID = 'rzp_test_12345';\n/g, "");
  content = content.replace(/process\.env\.RAZORPAY_KEY_SECRET = 'rzp_test_12345';\n/g, "");

  content = `
process.env.RAZORPAY_KEY_ID = 'rzp_test_12345';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_12345';
process.env.OAUTH_CALLBACK_URL = 'http://localhost/callback';
process.env.SESSION_SECRET = 'a_very_long_session_secret_for_tests_that_is_32_bytes_long';
process.env.JWT_SECRET = 'a_very_long_jwt_secret_for_tests_that_is_32_bytes_long';
` + content;
  fs.writeFileSync(vitestPath, content);
}
