// Spin & Deal — simulation harness.
// Runs >= 10,000 logged slot spins plus blackjack/roulette sessions and compares
// actual RTP and hit frequency against the disclosed prize table in slot.js.
// Usage: npm run sim  (or: node src/simulate.js --spins 50000)

import { spinReels, evaluateSpin, theoreticalRtp, SYMBOLS } from './slot.js';

const args = process.argv.slice(2);
const spinArg = args.find((a) => a === '--spins');
const SPINS = spinArg ? Number(args[args.indexOf('--spins') + 1]) : 10000;
if (SPINS < 10000) {
  console.warn(`Warning: ${SPINS} spins is below the 10,000 minimum for a publishable result.`);
}

function runSlotSimulation(spins) {
  let totalBet = 0;
  let totalWin = 0;
  let hits = 0;
  let jackpots = 0;
  let freeSpinTriggers = 0;
  const log = [];
  for (let i = 0; i < spins; i++) {
    const bet = 10;
    const reels = spinReels('classic');
    const result = evaluateSpin(reels, bet);
    totalBet += bet;
    totalWin += result.win;
    if (result.win > 0) hits++;
    if (result.kind === 'jackpot') jackpots++;
    if (result.triggersFreeSpins) freeSpinTriggers++;
    if (i < 5 || i % Math.ceil(spins / 10) === 0) {
      log.push({ spin: i + 1, reels: reels.map((r) => SYMBOLS[r]).join(''), bet, win: result.win, kind: result.kind });
    }
  }
  return {
    spins,
    rtp: totalWin / totalBet,
    hitFrequency: hits / spins,
    jackpotRate: jackpots / spins,
    freeSpinTriggerRate: freeSpinTriggers / spins,
    sampleLog: log,
  };
}

// Simplified blackjack session model: player stands on 17+, dealer stands on 17.
// Used only as a smoke check that the table-game loop and logging work end to end.
function runBlackjackSimulation(hands) {
  const draw = () => Math.min(10, Math.floor(Math.random() * 13) + 1);
  let wins = 0, losses = 0, pushes = 0;
  for (let i = 0; i < hands; i++) {
    let player = draw() + draw();
    while (player < 17) player += draw();
    let dealer = draw() + draw();
    while (dealer < 17) dealer += draw();
    if (player > 21 || (dealer <= 21 && dealer > player)) losses++;
    else if (dealer > 21 || player > dealer) wins++;
    else pushes++;
  }
  return { hands, winRate: wins / hands, lossRate: losses / hands, pushRate: pushes / hands };
}

// Simplified roulette: single-number bet on red/black (even money), European wheel.
function runRouletteSimulation(spins) {
  let wins = 0;
  for (let i = 0; i < spins; i++) {
    const pocket = Math.floor(Math.random() * 37); // 0-36
    if (pocket !== 0 && pocket % 2 === 1) wins++; // red (odd pockets, simplified)
  }
  return { spins, winRate: wins / spins, expected: 18 / 37 };
}

const slot = runSlotSimulation(SPINS);
const blackjack = runBlackjackSimulation(2000);
const roulette = runRouletteSimulation(2000);

const report = {
  generatedAt: new Date().toISOString(),
  theoreticalRtp: theoreticalRtp(),
  slot,
  blackjack,
  roulette,
  verdict:
    Math.abs(slot.rtp - theoreticalRtp()) < 0.03
      ? 'PASS — measured RTP within 3 points of the disclosed prize-table RTP'
      : 'REVIEW — measured RTP diverged from the prize table; retune weights before release',
};

console.log(JSON.stringify(report, null, 2));
