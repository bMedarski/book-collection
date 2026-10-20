// Fetches "more books by these authors" from the Google Books API for every
// author on the Fantasy shelf that has a known English name (data/author-map.json),
// excludes books already in the collection, and writes data/discover.json.
//
// Requires GOOGLE_BOOKS_API_KEY in the environment (see .env, not committed).

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
if (!API_KEY) {
  console.error('Missing GOOGLE_BOOKS_API_KEY (expected in .env)');
  process.exit(1);
}

const authorMap = JSON.parse(fs.readFileSync(path.join(root, 'data', 'author-map.json'), 'utf8'));
const fantasyBooks = JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8'));

// --only=path/to/names.json restricts the run to a subset of authors (e.g.
// ones that previously only got a shallow fetch) -- entries for OTHER
// authors already in data/discover.json are preserved, not wiped.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
let canonicalAuthors = [...new Set(Object.values(authorMap))].sort((a, b) => a.localeCompare(b));
if (onlyArg) {
  const onlyList = new Set(JSON.parse(fs.readFileSync(onlyArg.slice('--only='.length), 'utf8')));
  canonicalAuthors = canonicalAuthors.filter((a) => onlyList.has(a));
}

function normTitle(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ownedTitles = new Set(fantasyBooks.map((b) => normTitle(b.title)).filter(Boolean));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchPage(name, startIndex, orderBy, attempt = 1) {
  // langRestrict=en turns out to trigger far more 503s and doesn't reliably
  // widen results -- filter language client-side (isEnglish below) instead.
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('inauthor:"' + name + '"')}&maxResults=40&startIndex=${startIndex}&orderBy=${orderBy}&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    if ((res.status === 503 || res.status === 429) && attempt < 5) {
      await sleep(400 * attempt);
      return fetchPage(name, startIndex, orderBy, attempt + 1);
    }
    console.warn(`  HTTP ${res.status} for ${name} at offset ${startIndex}/${orderBy} (giving up after ${attempt} attempts)`);
    return [];
  }
  const data = await res.json();
  return data.items || [];
}

// Despite maxResults=40, Google Books returns results in ~20-item pages here
// and "relevance" vs "newest" surface different subsets for a prolific author
// (Sanderson, Pratchett, etc. easily have 30-50+ real English titles) -- pull
// both orderings, paging each until a page comes back empty (not just short;
// short pages of ~20 are normal), capped at 4 pages/ordering (8 requests per
// author) as a quota-conscious ceiling -- the free tier is 1,000 queries/day
// and a run across ~100 authors needs headroom for retries too.
async function fetchAuthor(name) {
  const all = [];
  for (const orderBy of ['relevance', 'newest']) {
    for (let page = 0; page < 4; page++) {
      const items = await fetchPage(name, page * 40, orderBy);
      if (!items.length) break;
      all.push(...items);
      await sleep(150);
    }
  }
  return all;
}

function isEnglish(info) {
  return info.language === 'en';
}

// Google Books ids ending "ACAAJ" are print-only listings with no real
// digitized cover -- their thumbnail URL still returns 200, but it's the
// exact same generic placeholder image for every such book (verified by
// content-length on a sample), which looks like a wrong/broken cover rather
// than a missing one. Treat them as having no image at all.
function bestImage(id, imageLinks) {
  if (!imageLinks || /ACAAJ$/.test(id)) return '';
  const url = imageLinks.thumbnail || imageLinks.smallThumbnail || '';
  return url.replace(/^http:/, 'https:').replace('zoom=1', 'zoom=2');
}

async function main() {
  const perAuthorResults = new Map(); // canonical author -> Map(normTitle -> best item)

  for (const author of canonicalAuthors) {
    process.stdout.write(`Fetching: ${author} ... `);
    let items;
    try {
      items = await fetchAuthor(author);
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      continue;
    }
    console.log(`${items.length} results`);

    const byTitle = new Map();
    for (const item of items) {
      const info = item.volumeInfo || {};
      if (!info.title || !isEnglish(info)) continue;
      const authors = info.authors || [];
      // Keep only items that actually credit this author (Google's inauthor
      // match is fuzzy and sometimes returns unrelated results).
      const isMatch = authors.some((a) => normTitle(a).includes(normTitle(author).split(' ').pop()));
      if (!isMatch) continue;

      const key = normTitle(info.title);
      if (!key || ownedTitles.has(key)) continue;

      const candidate = {
        title: info.title,
        author: authors.join(', '),
        matchedAuthor: author,
        description: (info.description || '').slice(0, 500),
        year: info.publishedDate ? info.publishedDate.slice(0, 4) : '',
        image: bestImage(item.id, info.imageLinks),
        rating: info.averageRating || 0,
        ratingsCount: info.ratingsCount || 0,
        infoLink: (info.infoLink || item.selfLink || '').replace(/^http:/, 'https:'),
      };

      const existing = byTitle.get(key);
      if (!existing || candidate.ratingsCount > existing.ratingsCount) {
        byTitle.set(key, candidate);
      }
    }

    if (byTitle.size) perAuthorResults.set(author, byTitle);
    await sleep(120);
  }

  const books = [];
  for (const [, byTitle] of perAuthorResults) {
    const sorted = [...byTitle.values()].sort((a, b) => b.ratingsCount - a.ratingsCount || b.rating - a.rating);
    books.push(...sorted);
  }

  const outPath = path.join(root, 'data', 'discover.json');
  let finalBooks = books;
  if (onlyArg && fs.existsSync(outPath)) {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const touchedAuthors = new Set(perAuthorResults.keys());
    const untouched = existing.filter((b) => !touchedAuthors.has(b.matchedAuthor));
    finalBooks = [...untouched, ...books];
  }

  finalBooks.forEach((b, i) => { b.id = i; });
  fs.writeFileSync(outPath, JSON.stringify(finalBooks, null, 2), 'utf8');
  console.log(`\nWrote ${finalBooks.length} total suggestions (${books.length} from this run's ${perAuthorResults.size} authors) -> ${outPath}`);
}

main();
