## 2024-05-31 - [High] Sanitize Search Highlight Results to prevent XSS
**Vulnerability:** Found `dangerouslySetInnerHTML` being used for `result.highlighted.title` and `result.highlighted.description` without prior sanitization in the React `GlobalSearch` component.
**Learning:** Search highlight results are often derived directly from user input or untrusted database content. Rendering them directly via `dangerouslySetInnerHTML` allows for Cross-Site Scripting (XSS) attacks if an attacker injects malicious scripts into the search fields.
**Prevention:** Always sanitize input passed to `dangerouslySetInnerHTML` using libraries like `DOMPurify` (`DOMPurify.sanitize(input)`), regardless of whether it originates directly from the user or from a backend search engine.
