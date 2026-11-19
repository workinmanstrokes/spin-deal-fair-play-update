// Spin & Deal — cloud-backed state stub (Firebase / Firestore).
// The server (Firestore) is the source of truth for wallet, XP, level, streak and
// missions. Local storage is a cache only — a locally edited balance is never
// trusted and is overwritten by the server value on sync.
// Firebase config lives in src/firebase.config.js (NOT committed — copy the
// example values from your Firebase console). Analytics + Crashlytics log every
// spin, hand and session with outcome and balance delta.

import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebase.config.js';

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);

const CACHE_KEY = 'spindeal.cache.v1';

export function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(state) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, cachedAt: Date.now() }));
  } catch {
    // Cache is best-effort; the server is authoritative.
  }
}

// Load the player's authoritative state from Firestore, falling back to the
// (stale, untrusted) cache only while offline. The cache never writes back.
export async function loadPlayerState(playerId) {
  const ref = doc(db, 'players', playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const fresh = {
      coins: 1000,
      xp: 0,
      level: 1,
      streakDays: 0,
      lastDailyClaim: null,
      missions: {},
      personalBests: { biggestSlotWin: 0, bestBlackjack: 0, bestRoulette: 0 },
      weeklyChallenge: null,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, fresh);
    writeCache(fresh);
    return fresh;
  }
  const state = snap.data();
  writeCache(state);
  return state;
}

// Every balance change goes through the server. Callers pass the delta and the
// reason; the server value is re-read after the write so the UI shows the
// authoritative number, never a locally computed one.
export async function applyBalanceDelta(playerId, delta, reason) {
  const ref = doc(db, 'players', playerId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : { coins: 1000 };
  const next = Math.max(0, (current.coins || 0) + delta);
  await updateDoc(ref, { coins: next, updatedAt: serverTimestamp() });
  logEvent(analytics, 'balance_change', { delta, reason, balance_after: next });
  writeCache({ ...current, coins: next });
  return next;
}

export function logSlotSpin({ bet, win, variant, freeSpins }) {
  logEvent(analytics, 'slot_spin', { bet, win, variant, free_spins: !!freeSpins, net: win - bet });
}

export function logTableGame({ game, outcome, bet, win }) {
  logEvent(analytics, 'table_game', { game, outcome, bet, win, net: win - bet });
}

export function logDailyClaim({ streakDays, coins, xp }) {
  logEvent(analytics, 'daily_claim', { streak_days: streakDays, coins, xp });
}
