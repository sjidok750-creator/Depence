// Authored wave list. Each wave is a list of spawn groups:
//   { type, count, interval (s between spawns), delay (s after wave start) }
// Enemy health scales with the wave number (see enemies.js), so the
// composition here only needs to control pacing and variety.

const g = (type, count, interval, delay = 0) => ({ type, count, interval, delay });

export const WAVES = [
  /* 1 */ [g('slime', 8, 1.1)],
  /* 2 */ [g('slime', 10, 0.95), g('wisp', 3, 0.8, 6)],
  /* 3 */ [g('slime', 8, 0.9), g('bat', 5, 0.9, 3)],
  /* 4 */ [g('beetle', 4, 1.6), g('slime', 10, 0.7, 2)],
  /* 5 */ [g('wisp', 12, 0.55), g('bat', 6, 0.8, 4)],
  /* 6 */ [g('slime', 14, 0.6), g('beetle', 6, 1.3, 3), g('shaman', 1, 1, 6)],
  /* 7 */ [g('bat', 12, 0.6), g('wisp', 8, 0.5, 5)],
  /* 8 */ [g('beetle', 10, 1.0), g('shaman', 2, 3, 4)],
  /* 9 */ [g('golem', 2, 4), g('slime', 16, 0.5, 1), g('wisp', 8, 0.45, 9)],
  /* 10 */ [g('slimeKing', 1, 0, 1), g('slime', 8, 0.8, 6)],
  /* 11 */ [g('bat', 14, 0.5), g('beetle', 8, 1.0, 2), g('shaman', 2, 2, 5)],
  /* 12 */ [g('wisp', 20, 0.4), g('golem', 2, 3, 6)],
  /* 13 */ [g('slime', 20, 0.45), g('shaman', 3, 2, 3), g('bat', 8, 0.6, 8)],
  /* 14 */ [g('golem', 4, 2.5), g('beetle', 10, 0.8, 2)],
  /* 15 */ [g('bat', 18, 0.45), g('wisp', 16, 0.4, 3), g('shaman', 2, 2, 7)],
  /* 16 */ [g('beetle', 14, 0.7), g('golem', 3, 3, 4), g('shaman', 3, 2, 6)],
  /* 17 */ [g('slime', 24, 0.4), g('bat', 12, 0.5, 4), g('golem', 2, 4, 8)],
  /* 18 */ [g('wisp', 24, 0.35), g('beetle', 10, 0.8, 5)],
  /* 19 */ [g('golem', 6, 2.2), g('shaman', 4, 1.5, 3), g('bat', 12, 0.5, 6)],
  /* 20 */ [g('drake', 1, 0, 1), g('bat', 12, 0.6, 4), g('wisp', 10, 0.5, 10)],
  /* 21 */ [g('beetle', 18, 0.6), g('golem', 4, 2.5, 3), g('shaman', 4, 1.5, 6)],
  /* 22 */ [g('slime', 30, 0.35), g('wisp', 20, 0.35, 5), g('bat', 10, 0.5, 9)],
  /* 23 */ [g('golem', 8, 1.8), g('shaman', 5, 1.5, 2)],
  /* 24 */ [g('bat', 26, 0.4), g('wisp', 20, 0.35, 6)],
  /* 25 */ [g('slimeKing', 2, 6, 1), g('beetle', 14, 0.7, 4), g('shaman', 4, 1.5, 8)],
  /* 26 */ [g('golem', 8, 1.6), g('beetle', 16, 0.6, 3), g('bat', 14, 0.45, 7)],
  /* 27 */ [g('wisp', 30, 0.3), g('shaman', 6, 1.2, 4), g('golem', 5, 2, 8)],
  /* 28 */ [g('drake', 1, 0, 1), g('bat', 20, 0.45, 3), g('golem', 6, 2, 8)],
  /* 29 */ [g('beetle', 20, 0.55), g('golem', 10, 1.5, 3), g('shaman', 6, 1.2, 5), g('bat', 16, 0.4, 10)],
  /* 30 */ [g('titan', 1, 0, 1), g('golem', 6, 2, 5), g('shaman', 4, 1.5, 8), g('wisp', 20, 0.35, 12)],
];

export const WAVE_COUNT = WAVES.length;

/** Endless waves after 30: blend of everything, scaled by hpScale. */
export function endlessWave(wave) {
  const n = wave - WAVE_COUNT;
  const list = [
    g('slime', 20 + n * 2, 0.35),
    g('beetle', 12 + n, 0.6, 3),
    g('bat', 12 + n, 0.45, 6),
    g('golem', 6 + Math.floor(n / 2), 1.8, 8),
    g('shaman', 4 + Math.floor(n / 3), 1.5, 10),
    g('wisp', 20 + n * 2, 0.3, 12),
  ];
  if (n % 5 === 0) list.push(g('titan', 1, 0, 2));
  else if (n % 5 === 3) list.push(g('drake', 1, 0, 2));
  else if (n % 5 === 1) list.push(g('slimeKing', 2, 5, 2));
  return list;
}

export function getWave(wave) {
  return wave <= WAVE_COUNT ? WAVES[wave - 1] : endlessWave(wave);
}

/** Total enemy count in a wave, for the HUD preview. */
export function waveSummary(wave) {
  const counts = {};
  for (const grp of getWave(wave)) counts[grp.type] = (counts[grp.type] || 0) + grp.count;
  return counts;
}

/** Total scheduled duration of spawns (used by the simulator / tests). */
export function waveDuration(wave) {
  let end = 0;
  for (const grp of getWave(wave)) end = Math.max(end, grp.delay + Math.max(0, grp.count - 1) * grp.interval);
  return end;
}
