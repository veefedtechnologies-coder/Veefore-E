
## 2024-05-18 - Fix XSS vulnerability in GlobalSearch
**Vulnerability:** XSS vulnerability in GlobalSearch component due to unsanitized HTML being injected via dangerouslySetInnerHTML.
**Learning:** `dangerouslySetInnerHTML` should never be used without sanitizing the input first, especially when the input comes from search results which could be influenced by a malicious user.
**Prevention:** Always sanitize input using a library like `DOMPurify` before injecting it into the DOM.
