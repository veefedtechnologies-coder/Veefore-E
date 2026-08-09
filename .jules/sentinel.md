## 2026-08-09 - Sanitize dangerouslySetInnerHTML inputs in React
**Vulnerability:** XSS vulnerability through usage of unsanitized dangerouslySetInnerHTML in React components.
**Learning:** React escapes values to prevent XSS but doesn't do so for dangerouslySetInnerHTML. Unsanitized strings in dangerouslySetInnerHTML can execute malicious scripts.
**Prevention:** Use DOMPurify library (DOMPurify.sanitize(value)) around the string passed to dangerouslySetInnerHTML to remove potentially malicious elements.
