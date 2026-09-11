# The Fantasy Shelf

A searchable, single-page catalog of a personal book collection, sourced from a Google Sheets library spreadsheet. Search by title, series, or author; each card shows the cover, title, author, series, and publisher/year when available.

Currently loaded with the **Fantasy** tab only (653 books). The spreadsheet also has "Others" and "Encyclopedias & Dictionaries" tabs not yet included.

## Structure

- `data/fantasy.csv` — raw export of the Fantasy tab (Title, Series, Author, Publisher, Year, ISBN, Image).
- `scripts/build-books-json.js` — parses the CSV into `data/books.json`. The sheet's CSV export drops empty cells (even mid-row), so the parser reconstructs Series/Author/Publisher using pattern matching (ISBN/Year regex, a publisher whitelist) rather than fixed column positions.
- `scripts/build-site.js` — inlines `data/books.json` into `template.html` to produce the final `index.html`.
- `index.html` — the built, self-contained page (open directly in a browser, or serve statically).

## Updating the data

1. Refresh `data/fantasy.csv` with the current spreadsheet export.
2. `node scripts/build-books-json.js`
3. `node scripts/build-site.js`
