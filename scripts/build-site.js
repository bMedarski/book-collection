const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'template.html'), 'utf8');

const SHELF_FILES = [
  { key: 'fantasy', label: 'Fantasy', file: 'books.json' },
  { key: 'others', label: 'Other Books', file: 'others.json' },
];

const shelves = SHELF_FILES.map(({ key, label, file }) => {
  const books = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
  return {
    key,
    label,
    books: books.map((b) => ({ ...b, id: `${key}-${b.id}`, shelfKey: key })),
  };
});

const dataJson = JSON.stringify(shelves).replace(/</g, '\\u003c');

const output = template.replace(
  '/*__SHELVES_DATA__*/[]/*__END_SHELVES_DATA__*/',
  dataJson
);

fs.writeFileSync(path.join(root, 'index.html'), output, 'utf8');
const total = shelves.reduce((n, s) => n + s.books.length, 0);
console.log(`Wrote index.html with ${total} books across ${shelves.length} shelves (${(output.length / 1024).toFixed(0)} KB)`);
shelves.forEach((s) => console.log(`  ${s.label}: ${s.books.length}`));
