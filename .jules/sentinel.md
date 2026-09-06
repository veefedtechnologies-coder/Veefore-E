## 2025-02-12 - Cross-Site Scripting (XSS) via Unsanitized HTML
**Vulnerability:** XSS vulnerability found in `GlobalSearch.tsx` where user search results (title and description) were rendered directly using `dangerouslySetInnerHTML` without any sanitization.
**Learning:** Even internal admin panel search results that highlight search text can be a vector for XSS if the data source contains malicious scripts and the UI blindly trusts it.
**Prevention:** Always use a sanitization library like `DOMPurify.sanitize()` before passing any dynamic content to `dangerouslySetInnerHTML`, regardless of the data source.
