# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mkmk56/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mkmk56/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar is an advanced analytics dashboard and valuation engine for pre-token protocols across the DefiLlama ecosystem. It reads a sealed snapshot of protocol data, identifies all protocols without a token, and ranks them by an analytical implied valuation claim.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## Overview
Token Launch Radar is an advanced analytics dashboard and valuation engine for pre-token protocols across the DefiLlama ecosystem. It reads a sealed snapshot of protocol data, identifies all protocols without a token, and ranks them by an analytical implied valuation claim.

## Valuation Model
The valuation model anchors pre-token protocol TVL to empirical market-calibrated category multiples derived directly from live-token peers in the same category (winsorized to `[0.02, 2.00]`, with global median fallback). It adjusts base valuations using a clamped 7-day TVL growth multiplier (`[-60%, +120%]`), a maturity multiplier based on active tracking duration from `listed_at` to `as_of` (`0.6` to `1.0`), and a chain breadth multiplier (`1.0` to `1.20`). Every pre-token protocol that is rankable is scored and ranked deterministically into `board.json`.

## Competition & Links
- Competition: [token-radar-01 on make.fun](https://make.fun/competitions/token-radar-01)
- Repository: `mkmk56/token-radar`
- License: MIT

---

<sub>Entered on [make.fun](https://make.fun/?ref=6wpzy311&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
