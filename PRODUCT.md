# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Listeners who want to discover new and special music — not necessarily record collectors themselves, just people chasing a better find than their streaming feed gives them. What they get is real: every album is curated by actual DJs and collectors around the world, not a regular recommendation. It's the find you'd walk away with as a digger flipping through crates in a record store, not a suggestion a taste model generated for you.

## Product Purpose
WaxRiffle surfaces random albums pulled from real record-store inventories, DJs, and collectors around the world, so listeners can break out of algorithm-driven recommendations. Success is a user finding — and optionally saving — an album they would not have discovered through a streaming algorithm.

## Positioning
"Random discovery. Curated music. No algorithm."

The mechanism a competitor can't casually copy: albums come from actual Discogs marketplace store inventories (real sellers' live stock), selected at random (optionally filtered by genre), rather than from a taste-model recommendation engine. The randomness is genuine and the source is real human inventory — not a personalization system wearing a "curated" label.

## Operating Context
Single-page flow: hero screen with "Find Album" → random album result (cover, title, artist, year, genre, Spotify embed + link) → optional "Save" to a local Saved Albums list → optional genre filter pills narrowing the pool before selection.

Backend (Node/Express, `server.js`, `api/`) proxies the Discogs API — fetching real store inventory pages and picking a random page/item — and the Spotify Web API to match each album to a streaming link/embed. Shipped as an installable PWA (`manifest.json`, apple touch icons, theme color) and deployed via Vercel.

## Capabilities and Constraints
- Genre filter across 11 categories (Hip-Hop/Rap, Funk/Soul, Jazz, Electronic, Rock, Blues, Reggae/Dub, World, Folk, Latin, Classical), each mapped to Discogs genre/style tags.
- Random selection draws from real Discogs marketplace store inventories via true pagination (random page, then random item), not a recommendation algorithm.
- Save/heart an album to a locally-scoped Saved Albums list.
- Spotify search-matching supplies an embedded player and a "Listen on Spotify" link when a match is found.
- `custom_albums.json` holds a small hand-picked fallback/seed set.
- Solo/indie project: no named partner stores, DJs, or collectors to credit; no monetization currently in place.
- Google Tag Manager is installed for analytics.
- Contact: waxriffle@gmail.com.

## Evidence on Hand
No usage numbers, testimonials, case studies, or press exist. Future work must not fabricate any of these or imply named store/DJ/collector partnerships — none are confirmed.

## Product Principles
1. **Discovery over search.** One click to a result beats browsing or searching a catalog.
2. **Real inventory over recommendation.** The album pool comes from actual marketplace listings, not a trained taste model — the "no algorithm" claim has to stay literally true.
3. **Filter, don't personalize.** Genre pills narrow scope without building a taste profile or tracking individual behavior.
4. **Save what you find.** Lightweight collecting (heart/save) supports serendipity without requiring an account.
5. **No black box.** The mechanism is explainable in one sentence — that's the product's honesty advantage over opaque recommenders.
