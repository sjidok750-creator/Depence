// Tower definitions. Each tower has three levels; `levels[0]` is the base
// tower and `cost` is the price to build. Upgrade costs live on levels 1-2.

export const TOWERS = {
  archer: {
    id: 'archer',
    name: '궁수탑',
    short: '궁수',
    hotkey: '1',
    cost: 60,
    color: '#6fbf73',
    accent: '#2f6b3a',
    desc: '빠른 연사, 단일 대상. 공중 유닛도 공격합니다.',
    tags: ['단일', '공중 가능'],
    kind: 'projectile',
    turnSpeed: 9,
    levels: [
      { cost: 0, range: 130, damage: 9, rate: 2.4, projectileSpeed: 460 },
      { cost: 55, range: 142, damage: 13, rate: 2.7, projectileSpeed: 480 },
      { cost: 95, range: 155, damage: 21, rate: 3.1, projectileSpeed: 520, multishot: 2 },
    ],
  },
  cannon: {
    id: 'cannon',
    name: '대포탑',
    short: '대포',
    hotkey: '2',
    cost: 100,
    color: '#8d8a9b',
    accent: '#3b3947',
    desc: '범위 폭발 피해. 지상 유닛만 공격합니다.',
    tags: ['범위', '지상 전용'],
    kind: 'artillery',
    groundOnly: true,
    turnSpeed: 4,
    levels: [
      { cost: 0, range: 118, damage: 32, rate: 0.65, splash: 46, flightTime: 0.55 },
      { cost: 85, range: 128, damage: 54, rate: 0.7, splash: 56, flightTime: 0.55 },
      { cost: 150, range: 138, damage: 92, rate: 0.78, splash: 68, flightTime: 0.5 },
    ],
  },
  frost: {
    id: 'frost',
    name: '서리탑',
    short: '서리',
    hotkey: '3',
    cost: 80,
    color: '#7fd3ff',
    accent: '#2b6ea3',
    desc: '주기적으로 냉기를 퍼뜨려 주변 적을 느리게 합니다.',
    tags: ['둔화', '범위'],
    kind: 'pulse',
    turnSpeed: 0,
    levels: [
      { cost: 0, range: 100, damage: 4, rate: 1 / 1.5, slow: 0.4, slowDuration: 2.0 },
      { cost: 70, range: 112, damage: 7, rate: 1 / 1.35, slow: 0.5, slowDuration: 2.2 },
      { cost: 125, range: 124, damage: 12, rate: 1 / 1.2, slow: 0.6, slowDuration: 2.5 },
    ],
  },
  tesla: {
    id: 'tesla',
    name: '번개탑',
    short: '번개',
    hotkey: '4',
    cost: 130,
    color: '#c9a3ff',
    accent: '#5c34a8',
    desc: '번개가 여러 적에게 연쇄됩니다. 방어력을 무시합니다.',
    tags: ['연쇄', '방어 무시'],
    kind: 'chain',
    turnSpeed: 0,
    levels: [
      { cost: 0, range: 120, damage: 16, rate: 1.1, chains: 3, chainRange: 90, falloff: 0.75 },
      { cost: 115, range: 130, damage: 26, rate: 1.2, chains: 4, chainRange: 100, falloff: 0.78 },
      { cost: 190, range: 140, damage: 40, rate: 1.35, chains: 6, chainRange: 110, falloff: 0.8 },
    ],
  },
  sniper: {
    id: 'sniper',
    name: '저격탑',
    short: '저격',
    hotkey: '5',
    cost: 150,
    color: '#f2b872',
    accent: '#8a4b1c',
    desc: '매우 긴 사거리와 강력한 한 방. 보스에게 추가 피해.',
    tags: ['장거리', '보스 특화'],
    kind: 'hitscan',
    turnSpeed: 5,
    levels: [
      { cost: 0, range: 250, damage: 85, rate: 0.42, bossBonus: 1.6, armorPierce: true },
      { cost: 135, range: 275, damage: 150, rate: 0.46, bossBonus: 1.8, armorPierce: true },
      { cost: 230, range: 300, damage: 265, rate: 0.5, bossBonus: 2.0, armorPierce: true },
    ],
  },
};

export const TOWER_ORDER = ['archer', 'cannon', 'frost', 'tesla', 'sniper'];

export const SELL_RATIO = 0.7;

export const TARGET_MODES = [
  { id: 'first', label: '선두' },
  { id: 'last', label: '후미' },
  { id: 'strong', label: '강함' },
  { id: 'close', label: '근접' },
];

export function towerTotalCost(def, level) {
  let total = def.cost;
  for (let i = 1; i <= level; i++) total += def.levels[i].cost;
  return total;
}
