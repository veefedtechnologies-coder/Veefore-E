## 2026-08-21 - Prevent XSS in Admin Panel Global Search
**Vulnerability:** The Admin Panel's `GlobalSearch` component was rendering unescaped, highlighted search results from the backend using `dangerouslySetInnerHTML`, leaving it susceptible to Cross-Site Scripting (XSS).
**Learning:** Even internal or admin-facing tools need sanitization, especially when rendering data that includes HTML like search query highlights. React's `dangerouslySetInnerHTML` must always be used alongside a sanitizer.
**Prevention:** Always wrap `dangerouslySetInnerHTML` usage with `DOMPurify.sanitize()` (or a similar tool) when the HTML comes from a database or search API, unless it's strictly validated on output.
