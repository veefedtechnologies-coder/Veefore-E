## 2024-05-24 - Fix XSS in GlobalSearch
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability via `dangerouslySetInnerHTML` in the `GlobalSearch` component when rendering search result highlights.
**Learning:** Highlighting search results often requires rendering raw HTML, which is a common vector for XSS if the input is not strictly controlled or sanitized. In a React application, always sanitize input passed to `dangerouslySetInnerHTML`.
**Prevention:** Always use `DOMPurify.sanitize()` or a similar library when rendering raw HTML, especially if the HTML contains content derived from user input or external sources (even search indexes).
