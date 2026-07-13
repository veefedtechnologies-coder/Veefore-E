## 2026-07-13 - [GlobalSearch XSS Vulnerability]
**Vulnerability:** Found a Cross-Site Scripting (XSS) vulnerability in `admin-panel/client/src/components/ui/GlobalSearch.tsx` where API response data was directly rendered using `dangerouslySetInnerHTML`.
**Learning:** External API data should never be trusted and rendered as raw HTML without sanitization, as this could allow for arbitrary script execution.
**Prevention:** Always use `DOMPurify` to sanitize HTML content before passing it to `dangerouslySetInnerHTML`.
