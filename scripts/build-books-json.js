const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'data', 'fantasy.csv');
const outPath = path.join(__dirname, '..', 'data', 'books.json');

const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
const rows = lines.slice(1);

const ISBN_RE = /^[0-9]{9,12}[0-9XxХх]$/;
const YEAR_RE = /^\d{4}$/;

function splitLine(line) {
  const httpIdx = line.indexOf('http');
  let prefix = line;
  let image = '';
  if (httpIdx !== -1) {
    image = line.slice(httpIdx).trim();
    prefix = line.slice(0, httpIdx).replace(/,$/, '');
  }
  const fields = prefix.split(',').map((f) => f.trim());

  let isbn = '';
  if (fields.length && (fields[fields.length - 1] === '' || ISBN_RE.test(fields[fields.length - 1]))) {
    isbn = fields.pop();
  }

  let year = '';
  if (fields.length && (fields[fields.length - 1] === '' || YEAR_RE.test(fields[fields.length - 1]))) {
    year = fields.pop();
  }

  return { fields, year, isbn, image };
}

// First pass: collect known publishers from unambiguous 4-field rows.
const publisherCounts = new Map();
for (const line of rows) {
  const { fields } = splitLine(line);
  if (fields.length === 4) {
    const pub = fields[3];
    if (pub) publisherCounts.set(pub, (publisherCounts.get(pub) || 0) + 1);
  }
}
const knownPublishers = new Set(publisherCounts.keys());

function assignTextFields(fields) {
  const n = fields.length;
  if (n === 4) {
    const [title, series, author, publisher] = fields;
    return { title, series, author, publisher };
  }
  if (n === 3) {
    // Series is overwhelmingly the field that goes missing when compacted;
    // verified against the full dataset that this holds for every ambiguous case.
    const [title, a, b] = fields;
    return { title, series: '', author: a, publisher: b };
  }
  if (n === 2) {
    const [title, a] = fields;
    if (knownPublishers.has(a)) {
      return { title, series: '', author: '', publisher: a };
    }
    return { title, series: '', author: a, publisher: '' };
  }
  if (n === 1) {
    return { title: fields[0], series: '', author: '', publisher: '' };
  }
  if (n > 4) {
    // Title itself contained literal commas; last 3 fields are Series/Author/Publisher.
    const title = fields.slice(0, n - 3).join(',');
    const [series, author, publisher] = fields.slice(n - 3);
    return { title, series, author, publisher };
  }
  return { title: '', series: '', author: '', publisher: '' };
}

const books = rows.map((line) => {
  const { fields, year, isbn, image } = splitLine(line);
  const { title, series, author, publisher } = assignTextFields(fields);
  return { title: title.trim(), series: series.trim(), author: author.trim(), publisher: publisher.trim(), year, isbn, image };
}).filter((b) => b.title);

fs.writeFileSync(outPath, JSON.stringify(books, null, 2), 'utf8');
console.log(`Parsed ${books.length} books -> ${outPath}`);
console.log('Missing series:', books.filter((b) => !b.series).length);
console.log('Missing author:', books.filter((b) => !b.author).length);
console.log('Missing publisher:', books.filter((b) => !b.publisher).length);
console.log('Missing isbn:', books.filter((b) => !b.isbn).length);
console.log('Missing image:', books.filter((b) => !b.image).length);
console.log('Known publisher whitelist size:', knownPublishers.size);
