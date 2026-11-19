// Spin & Deal — app wiring: routing, wallet/XP display, daily streak & missions,
// responsible-play session reminder. All balances come from cloud.js (Firestore
// is authoritative); localStorage is cache only.

import { spinReels, evaluateSpin, SYMBOLS } from './slot.js';
import { loadPlayerState, applyBalanceDelta, logSlotSpin, logDailyClaim } from './cloud.js';

const PLAYER_ID = 'local-player'; // replaced by the signed-in uid once auth lands
const SESSION_REMINDER_MINUTES = 30;

const state = {
  player: null,
  variant: 'classic',
  freeSpinsLeft: 0,
  sessionStart: Date.now(),
  reminderShown: false,
};

const $ = (id) => document.getElementById(id);

function renderWallet() {
  if (!state.player) return;
  $('wallet-balance').textContent = state.player.coins.toLocaleString();
  $('xp-level').textContent = String(state.player.level);
  $('streak-line').textContent =
    `Streak: ${state.player.streakDays} day${state.player.streakDays === 1 ? '' : 's'} · ` +
    `Next reward grows with your streak — claim it in Daily & Missions.`;
}

async function boot() {
  try {
    state.player = await loadPlayerState(PLAYER_ID);
  } catch (err) {
    console.error('Cloud state unavailable — showing cached balance only (never trusted).', err);
    state.player = { coins: 0, xp: 0, level: 1, streakDays: 0 };
  }
  renderWallet();
  setInterval(maybeRemindSession, 60_000);
}

function maybeRemindSession() {
  const elapsed = (Date.now() - state.sessionStart) / 60_000;
  if (elapsed >= SESSION_REMINDER_MINUTES && !state.reminderShown) {
    state.reminderShown = true;
    alert(`You've been playing for ${Math.round(elapsed)} minutes. Take a break — your coins will be here when you get back.`);
  }
}

async function onSpin() {
  if (!state.player) return;
  const bet = 10;
  if (state.player.coins < bet && state.freeSpinsLeft === 0) {
    $('slot-message').textContent = 'Out of coins — come back tomorrow for your daily reward.';
    return;
  }
  const usingFreeSpin = state.freeSpinsLeft > 0;
  const reels = spinReels(state.variant);
  const result = evaluateSpin(reels, bet, { freeSpinsActive: usingFreeSpin });
  if (usingFreeSpin) state.freeSpinsLeft--;
  if (result.triggersFreeSpins && state.variant === 'neon') {
    state.freeSpinsLeft += 8;
    $('slot-message').textContent = `Bonus! 8 free spins at 2x — ${state.freeSpinsLeft} left.`;
  }
  reels.forEach((symbol, i) => { $(`reel-${i}`).textContent = SYMBOLS[symbol]; });
  const net = result.win - (usingFreeSpin ? 0 : bet);
  state.player.coins = await applyBalanceDelta(PLAYER_ID, net, usingFreeSpin ? 'free_spin' : 'slot_spin');
  logSlotSpin({ bet, win: result.win, variant: state.variant, freeSpins: usingFreeSpin });
  $('slot-last-win').textContent = result.win > 0 ? `${result.win} coins` : '—';
  if (!result.triggersFreeSpins) {
    $('slot-message').textContent =
      result.kind === 'jackpot' ? `Three of a kind — ${result.win} coins!`
      : result.kind === 'pair' ? `A pair — ${result.win} coins.`
      : 'No win this time. The prize table is on the Math screen.';
  }
  if (state.player.coins > (state.player.personalBests?.biggestSlotWin || 0) && result.win > 0) {
    // Personal best is stored server-side with the next cloud sync; see cloud.js.
  }
  renderWallet();
}

// Escalating 7-day streak: day n pays 100 * n coins + 25 * n XP (day 7: 700 + 175).
export function streakReward(day) {
  const d = Math.min(Math.max(day, 1), 7);
  return { coins: 100 * d, xp: 25 * d };
}

// Three rotating daily missions — one per game, rotating by day-of-year.
export function missionsForDate(date = new Date()) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86_400_000);
  const sets = [
    [
      { id: 'slots-10', game: 'slots', text: 'Spin the slots 10 times', reward: { coins: 150, xp: 50 } },
      { id: 'bj-win-2', game: 'blackjack', text: 'Win 2 blackjack hands', reward: { coins: 200, xp: 60 } },
      { id: 'roulette-5', game: 'roulette', text: 'Play 5 roulette spins', reward: { coins: 150, xp: 50 } },
    ],
    [
      { id: 'slots-win-100', game: 'slots', text: 'Win 100+ coins in one slot spin', reward: { coins: 200, xp: 60 } },
      { id: 'bj-21', game: 'blackjack', text: 'Hit blackjack (21) once', reward: { coins: 250, xp: 80 } },
      { id: 'roulette-red-3', game: 'roulette', text: 'Win 3 red bets', reward: { coins: 150, xp: 50 } },
    ],
  ];
  return sets[dayOfYear % sets.length];
}

document.querySelectorAll('#lobby-nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#lobby-nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    // Views beyond the slot lobby are wired in their own screens (blackjack,
    // roulette, daily, records, store, settings) as milestones 3–6 land.
    if (btn.dataset.route === 'daily') {
      const missions = missionsForDate();
      alert(`Today's missions:\n${missions.map((m) => `• ${m.text} — ${m.reward.coins} coins, ${m.reward.xp} XP`).join('\n')}`);
    }
  });
});

$('spin-btn')?.addEventListener('click', onSpin);

boot();
