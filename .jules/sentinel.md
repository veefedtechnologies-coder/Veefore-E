## 2024-08-14 - Prevent XSS in Admin Search
**Vulnerability:** XSS vulnerability in admin-panel search highlighting via dangerouslySetInnerHTML without sanitization.
**Learning:** Even internal admin search results need sanitization before rendering HTML to prevent stored/reflected XSS if indexed data is malicious.
**Prevention:** Always use DOMPurify when using dangerouslySetInnerHTML, even for trusted data sources.
