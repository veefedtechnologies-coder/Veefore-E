## 2024-05-24 - Cross-Site Scripting (XSS) via dangerouslySetInnerHTML
**Vulnerability:** The `GlobalSearch` component uses `dangerouslySetInnerHTML` directly with user search results (`result.highlighted.title` and `result.highlighted.description`) without proper sanitization.
**Learning:** React components that render HTML from APIs must sanitize the HTML on the client side, as backend sanitization might be bypassed or missing, and data might come from untrusted sources. The admin panel frontend lacked `dompurify` integration.
**Prevention:** Always use `DOMPurify.sanitize()` before passing any dynamic HTML string to `dangerouslySetInnerHTML`.
