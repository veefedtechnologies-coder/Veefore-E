## 2024-05-15 - [XSS in GlobalSearch]
**Vulnerability:** XSS vulnerability in admin-panel GlobalSearch where result title and description were injected raw via dangerouslySetInnerHTML.
**Learning:** The application uses dangerouslySetInnerHTML to display search result highlights without prior sanitization.
**Prevention:** Always use DOMPurify to sanitize inputs passed to dangerouslySetInnerHTML.
