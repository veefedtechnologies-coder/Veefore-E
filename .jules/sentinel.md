## 2024-05-18 - Fix XSS in dangerouslySetInnerHTML
**Vulnerability:** XSS vulnerability in dangerouslySetInnerHTML without sanitization
**Learning:** Always sanitize user input before passing it to dangerouslySetInnerHTML.
**Prevention:** Use DOMPurify.sanitize() to sanitize user input before passing it to dangerouslySetInnerHTML.
