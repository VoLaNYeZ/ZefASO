import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the file
const filePath = path.join(__dirname, 'dist', 'assets', 'index-9yVmAR0i.js');
const content = fs.readFileSync(filePath, 'utf8');

// Remove all JSDoc/comment blocks (/** ... */)
let cleaned = content.replace(/\/\*\*[\s\S]*?\*\//g, '');

// Remove all multi-line comments (/* ... */)
cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

// Remove all single-line comments (// ...)
cleaned = cleaned.replace(/\/\/.*$/gm, '');

// Remove copyright/license headers that might be at the start
const lines = cleaned.split('\n');
const filteredLines = [];

for (let line of lines) {
    // Skip empty lines at the beginning
    if (filteredLines.length === 0 && line.trim() === '') {
        continue;
    }
    filteredLines.push(line);
}

cleaned = filteredLines.join('\n');

// Trim leading/trailing whitespace
cleaned = cleaned.trim();

// Write back
fs.writeFileSync(filePath, cleaned, 'utf8');

console.log('File cleaned successfully!');
console.log(`Original size: ${content.length} bytes`);
console.log(`Cleaned size: ${cleaned.length} bytes`);
console.log(`Saved: ${content.length - cleaned.length} bytes (${((content.length - cleaned.length) / content.length * 100).toFixed(2)}%)`);
