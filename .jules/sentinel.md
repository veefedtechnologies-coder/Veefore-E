## 2024-05-24 - Sanitized XSS in GlobalSearch
**Vulnerability:** XSS vulnerability through dangerouslySetInnerHTML via GlobalSearch results.
**Learning:** Highlighted search results retrieved dynamically or through search services should always be sanitized before injection.
**Prevention:** Always use a library like dompurify with dangerouslySetInnerHTML to prevent HTML injection.
