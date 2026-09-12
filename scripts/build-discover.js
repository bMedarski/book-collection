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

const canonicalAuthors = [...new Set(Object.values(authorMap))].sort((a, b) => a.localeCompare(b));

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
// short pages of ~20 are normal), capped at 6 pages/ordering as a ceiling.
async function fetchAuthor(name) {
  const all = [];
  for (const orderBy of ['relevance', 'newest']) {
    for (let page = 0; page < 6; page++) {
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

function bestImage(imageLinks) {
  if (!imageLinks) return '';
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
        image: bestImage(info.imageLinks),
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

  books.forEach((b, i) => { b.id = i; });

  const outPath = path.join(root, 'data', 'discover.json');
  fs.writeFileSync(outPath, JSON.stringify(books, null, 2), 'utf8');
  console.log(`\nWrote ${books.length} suggestions from ${perAuthorResults.size} authors -> ${outPath}`);
}

main();
