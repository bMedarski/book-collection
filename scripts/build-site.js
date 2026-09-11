const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'template.html'), 'utf8');
const books = JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8'));

const dataJson = JSON.stringify(books).replace(/</g, '\\u003c');

const output = template.replace(
  '/*__BOOKS_DATA__*/[]/*__END_BOOKS_DATA__*/',
  dataJson
);

fs.writeFileSync(path.join(root, 'index.html'), output, 'utf8');
console.log(`Wrote index.html with ${books.length} books (${(output.length / 1024).toFixed(0)} KB)`);
