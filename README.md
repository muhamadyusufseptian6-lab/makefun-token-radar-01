# Token Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/muhamadyusufseptian6-lab/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/muhamadyusufseptian6-lab/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot, ranks every
rankable pre-token protocol by an implied value, and shows a reader how to
farm each one.

## Model (radar-2)

`implied = round(TVL × 0.22 × growth × maturity × breadth)`

- **growth** = `1 + clamp(change_7d, −50, +150) / 100 × 0.6`
- **maturity** = `0.55 + min(age_days, 1460) / 1460 × 0.45` (age = days since
  first listed; unknown age uses 365 days)
- **breadth** = `1 + 0.03 × min(chains − 1, 5)`

No protocol name is special-cased. The board covers the whole 40-protocol
watchlist plus every other rankable pre-token protocol in the snapshot
(289 rows), and sets the 24 largest live-token protocols aside with their
market caps. Farm plans (7 steps each, with cost and time) are derived from
each protocol's category, chains, TVL and age.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`. Node 22+, standard library only,
deterministic, no network.

## Dashboard

`dashboard/` is a static page (no network): search, category and chain
filters, a watchlist-only toggle, sortable columns, a top-3 spotlight, a
detail drawer per protocol (model breakdown + farm plan), and a separate
live-token view. Screenshots: `screenshots/1-board.png` (board),
`2-detail.png` (detail view), `3-filtered.png` (filtered view).

## Honest limits

"No token" means the snapshot records no token — not proof the protocol has
none. Implied value is this radar's own estimate, not a price, and the radar
never predicts whether or when a token is issued.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=515temp1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
