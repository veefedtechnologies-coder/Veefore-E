## 2024-05-24 - [XSS Fix]
**Vulnerability:** XSS vulnerability via dangerouslySetInnerHTML.
**Learning:** We should sanitize input before rendering.
**Prevention:** Use DOMPurify.sanitize().
