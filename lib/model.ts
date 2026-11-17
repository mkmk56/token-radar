// The token radar's advanced valuation model and farm plan generator.
// Derives everything from the sealed snapshot with zero hardcoded protocol names.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_weight: number;
  chain_max_extra: number;
  chain_cap: number;
  winsor_min: number;
  winsor_max: number;
  min_live_samples: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_weight: 0.05,
  chain_max_extra: 4,
  chain_cap: 1.20,
  winsor_min: 0.02,
  winsor_max: 2.00,
  min_live_samples: 3,
};

export const MODEL_VERSION = 'radar-v2-calibrated';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface ModelBreakdown {
  base_tvl: number;
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  age_days: number | null;
  chains_count: number;
}

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
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

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
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number;
}

export interface CategoryMultipleInfo {
  category: string;
  live_count: number;
  median_ratio: number;
  assigned_multiple: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  global_median_ratio: number;
  category_multiples: CategoryMultipleInfo[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Compute category multiples from live protocols in the snapshot. */
export function computeCategoryMultiples(protocols: SnapshotProtocol[], model: ModelConstants): {
  categoryMultiples: Map<string, number>;
  globalMedian: number;
  infoList: CategoryMultipleInfo[];
} {
  const liveProtos = protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX');
  const globalRatios = liveProtos.map((p) => p.mcap_usd! / p.tvl_usd);
  const rawGlobalMedian = median(globalRatios);
  const globalMedian = Math.max(model.winsor_min, Math.min(model.winsor_max, rawGlobalMedian > 0 ? rawGlobalMedian : 0.25));

  const byCat = new Map<string, number[]>();
  for (const p of liveProtos) {
    const cat = p.category || 'Other';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(p.mcap_usd! / p.tvl_usd);
  }

  const categoryMultiples = new Map<string, number>();
  const infoList: CategoryMultipleInfo[] = [];

  const allCategories = new Set<string>();
  protocols.forEach((p) => {
    if (p.category) allCategories.add(p.category);
  });
  allCategories.add('Other');

  for (const cat of allCategories) {
    const ratios = byCat.get(cat) || [];
    let assigned = globalMedian;
    let med = 0;
    if (ratios.length >= model.min_live_samples) {
      med = median(ratios);
      assigned = Math.max(model.winsor_min, Math.min(model.winsor_max, med));
    } else if (ratios.length > 0) {
      med = median(ratios);
      assigned = Math.max(model.winsor_min, Math.min(model.winsor_max, med));
    }
    categoryMultiples.set(cat, assigned);
    infoList.push({
      category: cat,
      live_count: ratios.length,
      median_ratio: round4(med || assigned),
      assigned_multiple: round4(assigned),
    });
  }

  infoList.sort((a, b) => b.live_count - a.live_count || a.category.localeCompare(b.category));
  return { categoryMultiples, globalMedian, infoList };
}

/** Compute implied value and per-protocol breakdown. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  categoryMultiple: number
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;

  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;

  const chainsCount = Math.max(1, protocol.chains.length);
  const chainExtra = Math.min(chainsCount - 1, model.chain_max_extra);
  const chainMult = Math.min(model.chain_cap, 1 + model.chain_weight * chainExtra);

  const impliedRaw = protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * chainMult;
  const implied = Math.max(1, Math.round(impliedRaw));

  return {
    implied,
    breakdown: {
      base_tvl: protocol.tvl_usd,
      category_multiple: round4(categoryMultiple),
      growth_pct: round4(growthPct),
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      chain_multiplier: round4(chainMult),
      age_days: age,
      chains_count: chainsCount,
    },
  };
}

/** Build ranked board containing ALL rankable pre-token protocols (289 protocols). */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { categoryMultiples } = computeCategoryMultiples(snapshot.protocols, model);
  const defaultMultiple = categoryMultiples.get('Other') ?? 0.25;

  const rankables = snapshot.protocols.filter(isRankable);

  const scored = rankables.map((p) => {
    const cat = p.category || 'Other';
    const mult = categoryMultiples.get(cat) ?? defaultMultiple;
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, model, mult);
    return { p, implied, breakdown };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

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
    age_days: s.breakdown.age_days,
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 5000;
  if (p.tvl_usd >= 1_000_000_000) return 2500;
  if (p.tvl_usd >= 100_000_000) return 1000;
  return 500;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital.toLocaleString()} of USDC or stablecoins to ${name} on ${chain} and borrow against collateral to maintain an active loan position.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `Provide $${capital.toLocaleString()} of liquidity into ${name}'s primary trading pairs on ${chain} and stake LP tokens in their reward vault.`;
  if (c.includes('bridge'))
    return `Bridge $${capital.toLocaleString()} of assets across networks using ${name} and execute at least two cross-chain transfers weekly.`;
  if (c.includes('staking') || c.includes('restak'))
    return `Stake $${capital.toLocaleString()} worth of native assets through ${name} and delegate to an active validator on ${chain}.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital.toLocaleString()} of USDC margin into ${name} and execute regular perpetual trades while maintaining open positions.`;
  if (c.includes('prediction'))
    return `Fund $${capital.toLocaleString()} into ${name} and participate in active prediction markets with diverse outcome positions on ${chain}.`;
  if (c.includes('curator') || c.includes('allocator'))
    return `Deposit $${capital.toLocaleString()} into curated strategy vaults on ${name} across ${chain} and compound yields.`;
  if (c.includes('stable'))
    return `Mint and deposit $${capital.toLocaleString()} of synthetic stablecoins via ${name} on ${chain} into their savings rate module.`;
  if (c.includes('rwa'))
    return `Deposit $${capital.toLocaleString()} into tokenized real-world asset pools on ${name} and hold the yield-bearing receipt tokens.`;
  if (c.includes('insurance'))
    return `Purchase $${capital.toLocaleString()} of smart contract coverage on ${name} and provide underwriting capital to their risk pool.`;
  return `Deposit $${capital.toLocaleString()} of capital into ${name} on ${chain} and participate in their core governance and utility loops.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Prepare a dedicated non-custodial wallet funded with native gas tokens on ${chain} and stablecoins for farming.`,
      cost: 'under $5 of network gas for initial setup',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital.toLocaleString()} capital allocation plus $5-$15 transaction gas`,
      time: '20 minutes',
    },
    {
      text: `Perform recurring weekly interactions on ${nameClean(p.name)} such as compounding rewards, rebalancing, or voting on governance proposals.`,
      cost: '$2-$4 weekly gas fees',
      time: '10 minutes weekly',
    },
    {
      text: `Maintain the active position for at least ${hold} consecutive days to capture snapshot eligibility across multi-epoch reward distributions.`,
      cost: `capital locked in position for ${hold} days`,
      time: `${hold} days`,
    },
    {
      text: `Verify reward allocations exclusively via ${nameClean(p.name)}'s official web portal and claim distributed tokens securely.`,
      cost: 'zero claim fees other than standard network gas',
      time: '10 minutes',
    },
    {
      text: `Log transaction hashes, deposit timestamps, and position metrics in a structured record to facilitate seamless unwinding or tax reporting.`,
      cost: 'no monetary cost',
      time: '5 minutes',
    },
  ];
}

function nameClean(name: string): string {
  return name.replace(/[^\w\s-]/g, '').trim();
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio: round4(p.mcap_usd! / p.tvl_usd),
    }));
}

export function radarRow(row: BoardRow): RadarRow {
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
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { globalMedian, infoList } = computeCategoryMultiples(snapshot.protocols, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    global_median_ratio: round4(globalMedian),
    category_multiples: infoList,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
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

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR_DATA=${JSON.stringify(radar)};\n`;
}
