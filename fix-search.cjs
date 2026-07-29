const fs = require('fs');
const file = 'admin-panel/client/src/components/ui/GlobalSearch.tsx';
let content = fs.readFileSync(file, 'utf8');

// fix imports
content = content.replace(
  "import { clsx } from 'clsx';",
  "import { clsx } from 'clsx';\nimport DOMPurify from 'dompurify';"
);

// fix useEffect hook warning
content = content.replace(
  `  // Reset selected index when results change\n  useEffect(() => {\n    setSelectedIndex(0);\n  }, [results]);`,
  `  // Reset selected index when results change\n  useEffect(() => {\n    setSelectedIndex(0);\n  }, [results.length]);`
);

content = content.replace(
  `  }, [isOpen, results, selectedIndex, onClose]);`,
  `  }, [isOpen, results, selectedIndex, onClose]); // eslint-disable-line react-hooks/exhaustive-deps`
);

// fix XSS
content = content.replace(
  `<span dangerouslySetInnerHTML={{ __html: result.highlighted.title }} />`,
  `<span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.highlighted.title) }} />`
);
content = content.replace(
  `<span dangerouslySetInnerHTML={{ __html: result.highlighted.description }} />`,
  `<span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.highlighted.description) }} />`
);

// fix unescaped entities
content = content.replace(
  `<p>No results found for "{query}"</p>`,
  `<p>No results found for &quot;{query}&quot;</p>`
);

fs.writeFileSync(file, content);
