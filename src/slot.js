// Spin & Deal — weighted three-reel engine + second variant with free-spins bonus.
// The prize table is disclosed to the player (see README / Math Transparency screen).
// Weights are retuned from the simulation in simulate.js; see docs/sim-results.md.

export const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];

// Per-reel symbol weights (retuned: flatter distribution to remove long dry spells).
export const REEL_WEIGHTS = [
  [30, 26, 18, 12, 8, 6],
  [30, 26, 18, 12, 8, 6],
  [30, 26, 18, 12, 8, 6],
];

// Payout multipliers for three-of-a-kind, keyed by symbol index.
export const PRIZE_TABLE = {
  0: 5,    // 🍒 x5
  1: 8,    // 🍋 x8
  2: 15,   // 🔔 x15
  3: 25,   // ⭐ x25
  4: 50,   // 💎 x50
  5: 100,  // 7️⃣ x100
};
export const ANY_TWO_MATCH_PAYOUT = 2; // any two matching symbols pays 2x bet

export function weightedPick(weights, rng = Math.random) {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

export function spinReels(variant = 'classic', rng = Math.random) {
  const weights = variant === 'neon' ? NEON_VARIANT_WEIGHTS : REEL_WEIGHTS;
  return REEL_WEIGHTS.map((_, reel) => weightedPick(weights[reel], rng));
}

// Second slot variant: "Neon Nights" — slightly rarer top symbols, but the
// free-spins bonus (3+ ⭐ anywhere triggers 8 free spins at 2x) lifts its RTP.
export const NEON_VARIANT_WEIGHTS = [
  [32, 26, 18, 12, 7, 5],
  [32, 26, 18, 12, 7, 5],
  [32, 26, 18, 12, 7, 5],
];
export const FREE_SPINS_TRIGGER = 3; // ⭐ symbols anywhere
export const FREE_SPINS_COUNT = 8;
export const FREE_SPINS_MULTIPLIER = 2;

export function evaluateSpin(reels, bet, { freeSpinsActive = false } = {}) {
  const [a, b, c] = reels;
  let win = 0;
  let kind = 'loss';
  if (a === b && b === c) {
    win = bet * PRIZE_TABLE[a];
    kind = 'jackpot';
  } else if (a === b || b === c || a === c) {
    win = bet * ANY_TWO_MATCH_PAYOUT;
    kind = 'pair';
  }
  const stars = reels.filter((s) => s === 3).length;
  const triggersFreeSpins = stars >= FREE_SPINS_TRIGGER;
  if (freeSpinsActive) win *= FREE_SPINS_MULTIPLIER;
  return { reels, bet, win, kind, triggersFreeSpins, freeSpinsActive, net: win - bet };
}

export function theoreticalRtp() {
  // Exact RTP for the classic variant, computed from the weights and prize table.
  const probs = REEL_WEIGHTS.map((w) => {
    const t = w.reduce((x, y) => x + y, 0);
    return w.map((v) => v / t);
  });
  let rtp = 0;
  for (let i = 0; i < SYMBOLS.length; i++) {
    const p3 = probs[0][i] * probs[1][i] * probs[2][i];
    rtp += p3 * PRIZE_TABLE[i];
  }
  // Any-two-match: P(exactly two equal) = sum over pairs of P(pair) - 3*P(three).
  let pPair = 0;
  for (let i = 0; i < SYMBOLS.length; i++) {
    pPair += probs[0][i] * probs[1][i] * (1 - probs[2][i])
      + probs[0][i] * (1 - probs[1][i]) * probs[2][i]
      + (1 - probs[0][i]) * probs[1][i] * probs[2][i];
  }
  rtp += pPair * ANY_TWO_MATCH_PAYOUT;
  return rtp; // fraction of bet returned, e.g. 0.94 = 94%
}
