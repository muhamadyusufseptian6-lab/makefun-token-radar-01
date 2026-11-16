// Token Radar — model radar-2.
//
// One sealed snapshot in, one ranked board out. The board ranks every
// rankable pre-token protocol: the whole watchlist (the floor) plus every
// other pre-token protocol the snapshot carries that is not an exchange and
// not a versioned pool. A protocol is pre-token when its record carries no
// market cap, no CoinGecko id and no symbol; "records no token" is what the
// snapshot says, never proof the protocol has no token.
//
// Implied value comes only from the snapshot's own figures:
//
//   base      = tvl_usd x BASE_MULTIPLE
//   growth    = clamp(change_7d, -50, 150) per cent
//   growthMult    = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturityMult  = 0.55 + min(age_days, 1460) / 1460 x 0.45
//                   (age_days unknown: 365; age is days since first listed)
//   breadthMult   = 1 + 0.03 x min(max(chains - 1, 0), 5)
//   implied   = max(1, round(base x growthMult x maturityMult x breadthMult))
//
// TVL is the size of the prize, seven-day growth is its momentum, age is how
// long the protocol has run with no token on record, and chain breadth is how
// widely its TVL is spread. No protocol name is ever special-cased: the same
// function scores every row, and the dashboard recomputes it in the page.

/** One protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_chains: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  watchlist: boolean;
  excluded_reason: string | null;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule leaves out (bridged, staked or exchange products). */
const WATCHLIST_OUT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Restaking',
  'CEX',
]);

/** Exchange names the watchlist rule treats as a prefix to leave out. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped,
 * staked or bridged product of a token that already trades. This mirrors the
 * watchlist rule (minus its TVL floor and DefiLlama's parent record, which
 * the snapshot does not carry): no exchange, no versioned pool, no Bridge /
 * Liquid Staking / Liquid Restaking / Restaked BTC / Restaking category, or any
 * bridge category, no wrapped, staked, staking or restaking word in the name, and no exchange
 * prefix. WBTC, Binance staked ETH and USDT0 are therefore never ranked: each is a product of a
 * token that already trades, not a protocol still waiting on a launch. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (
    p.category === 'CEX' ||
    (p.category !== null &&
      (WATCHLIST_OUT_CATEGORIES.has(p.category) || p.category.toLowerCase().includes('bridge')))
  )
    return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\bwrapped\b|\bstaked\b|\bstaking\b|restak/i.test(p.name)) return false;
  for (const ex of EXCHANGE_PREFIXES) if (p.name.startsWith(ex)) return false;
  return true;
}

/** Why a rankable protocol is not on the watchlist, or null when it is on it. */
export function excludedReason(p: SnapshotProtocol, snapshot: Snapshot): string | null {
  if (snapshot.watchlist.includes(p.slug)) return null;
  if (p.category !== null && WATCHLIST_OUT_CATEGORIES.has(p.category)) {
    return `Left out of the watchlist because its category is ${p.category}, which the watchlist rule excludes.`;
  }
  if (/\bwrapped\b|\bstaked\b|\bstaking\b/i.test(p.name)) {
    return 'Left out of the watchlist because its name carries a wrapped, staked or staking word.';
  }
  for (const ex of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(ex)) return `Left out of the watchlist because its name begins with ${ex}.`;
  }
  if (p.tvl_usd < snapshot.floor_usd) {
    return `Below the watchlist floor of $${Math.round(snapshot.floor_usd / 1_000_000)}M of TVL, so the early radar found it instead.`;
  }
  return 'Left out of the watchlist by the house rule, so the early radar found it instead.';
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its
  // size — the protocols below the floor and the ones the watchlist rule
  // leaves out are the early finds the radar exists to surface.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 20_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Lowercase category, for matching. */
function cat(p: SnapshotProtocol): string {
  return (p.category ?? '').toLowerCase();
}

/** The category's main farming action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = cat(p);
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateralized debt'))
    return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $20 of stablecoin against it and repay it a week later.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('canonical bridge'))
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds once inside its app.`;
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restaked'))
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic'))
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged trade.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${name} on ${chain} and place one small market position.`;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('onchain capital'))
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} through ${name} and hold it.`;
  if (c.includes('stable'))
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('yield') || c.includes('yield aggregator'))
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL strategy vault on ${chain}.`;
  if (c.includes('privacy'))
    return `Deposit $${capital} through ${name} on ${chain} and make one shielded transfer.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action, so the plan is not one deposit and done. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = cat(p);
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp'))
    return `Borrow $20 against the deposit on ${name}, hold the loan for seven days, then repay it in full.`;
  if (c.includes('dex') || c.includes('leveraged farm'))
    return `Swap $25 through ${name} on ${chain} in the same pool you supplied, so the wallet shows both providing and trading.`;
  if (c.includes('bridge') || c.includes('canonical bridge'))
    return `Bridge $25 back through ${name} the following week, so the wallet shows repeated use in both directions.`;
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restaked'))
    return `Use the receipt token once in a lending market on ${chain}, then return it to the wallet that staked it.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic'))
    return `Close the first trade on ${name} and open a second one half its size the next week.`;
  if (c.includes('prediction'))
    return `Place a second small position on a different ${name} market the following week.`;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('onchain capital'))
    return `Deposit a further $25 into the same ${name} vault on ${chain} the next week, so the wallet shows repeat deposits.`;
  if (c.includes('rwa'))
    return `Hold the asset for a full rewards cycle, then claim any yield it pays into the same wallet.`;
  if (c.includes('stable'))
    return `Use the minted stable asset once in a ${name} pool or vault on ${chain}.`;
  if (c.includes('insurance'))
    return `Renew or top up the ${name} cover once before the first policy ends.`;
  if (c.includes('yield'))
    return `Move $25 between two ${name} strategy vaults on ${chain} the following week.`;
  return `Make a second $25 deposit into ${name} on ${chain} the following week, from the same wallet.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL
 * and age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = chain === 'Ethereum' ? 12 : chain === 'Solana' ? 1 : 4;
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas on ${chain}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: 'about $25 of capital and $2 of gas',
      time: '10 minutes',
    },
    {
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never let the wallet sit idle for a whole month.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: "Before you withdraw, open the protocol's own points or rewards page from its own site and claim only from the link it publishes; never pay anyone to claim for you.",
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and every transaction hash in a farm log, then unwind the position in two halves a week apart so the exit is not one sudden withdrawal.',
      cost: 'about $2 of gas to exit',
      time: '5 minutes to log, a week to exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  const p = snapshot.protocols.find((x) => x.slug === row.slug);
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist: row.watchlist,
    excluded_reason: p ? excludedReason(p, snapshot) : null,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of))
    throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (
      typeof p.slug !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tvl_usd !== 'number' ||
      !Number.isFinite(p.tvl_usd)
    ) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains)
        ? p.chains.filter((c): c is string => typeof c === 'string')
        : [],
      tvl_usd: p.tvl_usd,
      change_7d:
        typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd:
        typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0)
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++)
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++)
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd)
      return `row ${i + 1} outranks row ${i} on implied value`;
  if (
    board.length >= 2 &&
    board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd
  ) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps)
      if (s.trim().length < 20 || s.trim().length > 600)
        return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0)
      return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
