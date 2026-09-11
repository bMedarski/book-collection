const fs = require('fs');
const path = require('path');

const csvName = process.argv[2] || 'fantasy.csv';
const outName = process.argv[3] || 'books.json';
const hasReadGoodreads = process.argv.includes('--read-goodreads');
const csvPath = path.join(__dirname, '..', 'data', csvName);
const outPath = path.join(__dirname, '..', 'data', outName);

const rawLines = fs.readFileSync(csvPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
const header = rawLines[0];
const rawRows = rawLines.slice(1);

// The sheet's CSV export drops empty trailing cells, so Read/Goodreads (the
// last two columns) may or may not be present per row. Goodreads URLs are
// identified by domain (never ambiguous with a cover-image host), which lets
// us strip both off the raw line -- before any comma-splitting -- so the
// existing Image/ISBN/Year/title parsing below sees exactly the same shape
// it always has.
function stripReadGoodreads(line) {
  if (!hasReadGoodreads) return { rest: line, read: false, goodreads: '' };

  let rest = line;
  let goodreads = '';
  let read = false;

  const grMatch = rest.match(/,(https?:\/\/(?:www\.)?goodreads\.com\/\S*)\s*$/i);
  if (grMatch) {
    goodreads = grMatch[1].trim();
    rest = rest.slice(0, grMatch.index);
  }

  const yMatch = rest.match(/,\s*[yY]\s*$/);
  if (yMatch) {
    read = true;
    rest = rest.slice(0, yMatch.index);
  } else if (goodreads) {
    // An empty Read cell only leaves a trailing "," behind when Goodreads
    // (a later column) forced the sheet to keep the placeholder.
    const emptyTrailMatch = rest.match(/,\s*$/);
    if (emptyTrailMatch) rest = rest.slice(0, emptyTrailMatch.index);
  }

  return { rest, read, goodreads };
}

const rows = rawRows.map((line) => stripReadGoodreads(line));

// A real ISBN-10/13 is 10 or 13 chars, but some source rows have garbled,
// concatenated digit strings in this slot (data-entry mistakes) -- widen the
// range so those still get recognized as "the isbn slot" and popped, even
// though the stored value itself is junk we can't fix here.
const ISBN_RE = /^[0-9][0-9XxХх/-]{4,19}$/;
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
for (const { rest } of rows) {
  const { fields } = splitLine(rest);
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

const books = rows.map(({ rest, read, goodreads }, i) => {
  const { fields, year, isbn, image } = splitLine(rest);
  const { title, series, author, publisher } = assignTextFields(fields);
  return {
    id: i,
    title: title.trim(),
    series: series.trim(),
    author: author.trim(),
    publisher: publisher.trim(),
    year,
    isbn,
    image,
    read,
    goodreads,
  };
}).filter((b) => b.title);

fs.writeFileSync(outPath, JSON.stringify(books, null, 2), 'utf8');
console.log(`Parsed ${books.length} books -> ${outPath}`);
console.log('Missing series:', books.filter((b) => !b.series).length);
console.log('Missing author:', books.filter((b) => !b.author).length);
console.log('Missing publisher:', books.filter((b) => !b.publisher).length);
console.log('Missing isbn:', books.filter((b) => !b.isbn).length);
console.log('Missing image:', books.filter((b) => !b.image).length);
console.log('Known publisher whitelist size:', knownPublishers.size);
if (hasReadGoodreads) {
  console.log('Marked read:', books.filter((b) => b.read).length);
  console.log('Has goodreads link:', books.filter((b) => b.goodreads).length);
}
