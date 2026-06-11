import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'client/src/pages/Landing.tsx');

// Read the file
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find all lines that start with a comma and fix them
const fixedLines = lines.map(line => {
  if (line.startsWith(',')) {
    return line.substring(1); // Remove the leading comma
  }
  return line;
});

const newContent = fixedLines.join('\n');

// Write back
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('Fixed all lines with leading commas');
