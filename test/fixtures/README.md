# Test fixtures

`gdelt-india-7d.json` — a real GDELT DOC 2.0 `artlist` response: India,
English, 7 days, 250 records. Committed so the clustering tests run offline
and reproducibly.

It is a per-country slice on purpose. A sparse global sample (2 days, 75
records) was measured to yield 63 singleton clusters and one false positive
— a syndicated non-protest story — which is why Tier 2 queries per country
over a wide window rather than globally over a narrow one.

Recapture with:

    curl -s --compressed -A "ProtestTrackerBot/1.0 (https://protesttracker.net)" \
      "https://api.gdeltproject.org/api/v2/doc/doc?query=%28protest%20OR%20demonstration%20OR%20strike%29%20sourcelang%3Aeng%20sourcecountry%3AIndia&mode=artlist&maxrecords=250&format=json&timespan=7d" \
      -o test/fixtures/gdelt-india-7d.json

Two GDELT gotchas: OR'd terms must be wrapped in parentheses, and a
rate-limit violation returns HTTP 200 with a plain-text body. Both failure
modes look like success to curl, so check the file starts with `{`.
