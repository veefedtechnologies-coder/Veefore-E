import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'client/src/pages/Landing.tsx');

// Read the file
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Remove lines 1580-2134 (0-indexed, so 1579-2133)
// Line 1581 in editor = index 1580
// Line 2135 in editor = index 2134
const startLine = 1580; // Line 1581 in editor (0-indexed)
const endLine = 2134;   // Line 2135 in editor (0-indexed)

const before = lines.slice(0, startLine);
const after = lines.slice(endLine + 1);

const newContent = [...before, '', after].join('\n');

// Write back
fs.writeFileSync(filePath, newContent, 'utf8');

console.log(`Deleted lines ${startLine + 1} to ${endLine + 1} from Landing.tsx`);
console.log(`Removed ${endLine - startLine + 1} lines`);
