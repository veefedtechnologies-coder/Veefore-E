
## 2025-02-18 - XSS in dangerouslySetInnerHTML
**Vulnerability:** Found un-sanitized user input being passed directly to `dangerouslySetInnerHTML` in the `GlobalSearch.tsx` component.
**Learning:** `dangerouslySetInnerHTML` is inherently dangerous as it allows for arbitrary HTML execution if input is not sanitized, leading to Cross-Site Scripting (XSS).
**Prevention:** Always sanitize input using a library like `DOMPurify` (`DOMPurify.sanitize()`) before injecting it into the DOM via `dangerouslySetInnerHTML` or similar methods.
