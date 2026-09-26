// Enemy archetypes. `hp` and `reward` are base values scaled by wave.

export const ENEMIES = {
  slime: {
    id: 'slime', name: '슬라임', hp: 42, speed: 56, reward: 3, armor: 0, radius: 13,
    color: '#7ee081', dark: '#3f9a4b',
  },
  wisp: {
    id: 'wisp', name: '도깨비불', hp: 26, speed: 128, reward: 3, armor: 0, radius: 10,
    color: '#8fd7ff', dark: '#3d7fd6',
  },
  bat: {
    id: 'bat', name: '박쥐', hp: 34, speed: 88, reward: 4, armor: 0, radius: 11,
    flying: true, color: '#8f7bd6', dark: '#4b3690',
  },
  beetle: {
    id: 'beetle', name: '딱정벌레', hp: 95, speed: 42, reward: 6, armor: 4, radius: 14,
    color: '#d68a5c', dark: '#7c4327',
  },
  golem: {
    id: 'golem', name: '골렘', hp: 320, speed: 30, reward: 15, armor: 2, radius: 18,
    color: '#a5a0b0', dark: '#4f4b5c',
  },
  shaman: {
    id: 'shaman', name: '주술사', hp: 75, speed: 46, reward: 9, armor: 0, radius: 13,
    heal: 6, healRadius: 72, color: '#f2c4e0', dark: '#a84f8a',
  },
  slimeKing: {
    id: 'slimeKing', name: '슬라임 왕', hp: 1000, speed: 30, reward: 70, armor: 1, radius: 24,
    boss: true, splitInto: { type: 'slime', count: 5 }, color: '#7ee081', dark: '#3f9a4b',
  },
  drake: {
    id: 'drake', name: '어린 드레이크', hp: 1600, speed: 40, reward: 130, armor: 2, radius: 24,
    boss: true, flying: true, color: '#ff8f7a', dark: '#a8352a',
  },
  titan: {
    id: 'titan', name: '고대 타이탄', hp: 4500, speed: 26, reward: 250, armor: 4, radius: 28,
    boss: true, color: '#c9b8ff', dark: '#5e42a8',
  },
};

/** Health multiplier applied per wave (1-based). */
export function hpScale(wave) {
  const w = wave - 1;
  return 1 + 0.11 * w + 0.0045 * w * w;
}

/** Gold reward multiplier per wave. */
export function rewardScale(wave) {
  return 1 + 0.02 * (wave - 1);
}
