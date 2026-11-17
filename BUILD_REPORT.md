# Build Report: Token Launch Radar (token-radar-01)

## Summary Statistics
- **Board Row Count:** 289 ranked pre-token protocols (all rankable pre-token protocols in the snapshot).
- **Watchlist Coverage:** 40 / 40 (100% coverage of the sealed watchlist).
- **Live Set Aside:** 24 live-token protocols (for comparison view only, never in the board).
- **Dashboard Source Total Bytes:** 28,890 bytes (well under the 64 KB cap).
- **Dossier Size (`dossier.json`):** 533,684 bytes (well under the 1.5 MiB cap).

## Screenshots
- `screenshots/1-board.png`: 128,986 bytes, 1280x800 resolution (long side 1280 <= 1440, short side 800 >= 800).
- `screenshots/2-detail.png`: 128,879 bytes, 1280x800 resolution.
- `screenshots/3-filtered.png`: 119,516 bytes, 1280x800 resolution.

## Gate Validation Results
All seven gate rows passed successfully:
1. `dashboard_files`: PASS (index.html, app.css, app.js present; 3 files total; 28.9 KB; no network URLs in attributes, CSS, or JS).
2. `board_file`: PASS (289 rows, valid protocol slugs, non-empty names, positive whole ranks 1..289, positive whole implied values, valid farm steps).
3. `sorted_by_value`: PASS (ranks exactly 1..N once each; implied values strictly non-increasing with rank; not all equal).
4. `coverage`: PASS (all 40 watchlist slugs present).
5. `farm_steps`: PASS (every row has 6 farm steps, each 20 to 600 characters).
6. `screenshots`: PASS (3 PNG images, each under 512 KiB, valid dimensions).
7. `dossier_matches`: PASS (dossier.json matches `buildDossier` output byte-for-byte; size <= 1.5 MiB).
8. **Determinism Check:** `diff -r out1 out2` verified byte-identical outputs across independent runs.

## Category Multiples Calibration Table (Derived from Snapshot)
Global Median Mcap/TVL Ratio: `0.1857` (winsorized to `[0.02, 2.00]`).

| Category | Live Count | Median Ratio | Assigned Multiple (Winsorized) |
|---|---|---|---|
| Lending | 15 | 0.1324x | 0.1324x |
| Yield | 13 | 0.1206x | 0.1206x |
| Dexs | 11 | 0.3424x | 0.3424x |
| Liquid Staking | 11 | 0.0343x | 0.0343x |
| RWA | 9 | 0.2748x | 0.2748x |
| Basis Trading | 8 | 0.4822x | 0.4822x |
| Bridge | 8 | 0.0884x | 0.0884x |
| Canonical Bridge | 8 | 0.7464x | 0.7464x |
| Yield Aggregator | 5 | 0.0504x | 0.0504x |
| Cross Chain Bridge | 4 | 1.2205x | 1.2205x |
| CDP | 3 | 0.1687x | 0.1687x |
| Indexes | 3 | 0.1477x | 0.1477x |
| Onchain Capital Allocator | 3 | 0.0059x | 0.0200x |
| Privacy | 3 | 0.9691x | 0.9691x |
| AI Agents | 2 | 0.6047x | 0.6047x |
| Derivatives | 2 | 2.1619x | 2.0000x |
| Privacy / Stablecoins / Restaking / etc. | ... | ... | (Assigned via sample size / global fallback) |

## Agent Session Location
Session logs are preserved under `/data/home/.gemini/tmp/token-radar/chats/` (and parent session directories) for transcript gate verification.
