import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/public-files.json'), 'utf8'));
const topLevel = new Set(['index.html', 'landing.html', 'intake.html', 'user-guide.html', '404.html', 'LICENSE', 'LICENSE-DOCS', 'NOTICE', 'THIRD_PARTY_NOTICES.md']);
if (!Array.isArray(files) || files.length !== new Set(files).size) throw new Error('Invalid public file manifest');
for (const file of files) {
  if (typeof file !== 'string' || file.includes('\\') || file.startsWith('/') || file.split('/').some(p => !p || p === '..' || p.startsWith('.'))) throw new Error('Unsafe public path');
  if (!topLevel.has(file) && !file.startsWith('assets/')) throw new Error('Non-public file in manifest');
  if (/\.(sql|env|cjs|map|zip)$/i.test(file) || /(?:^|\/)(?:seed|credentials)(?:[.-]|$)/i.test(file)) throw new Error('Private file in manifest');
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Public symlinks are not allowed');
  }
  if (!fs.statSync(current).isFile()) throw new Error('Public manifest entry is not a file');
}
// Only this fixed generated folder can be cleaned. Never clean a user-supplied path.
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('public must not be a symlink');
fs.rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
console.log(`Built public/ with ${files.length} explicitly approved files.`);
