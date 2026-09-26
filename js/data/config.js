export const DIFFICULTIES = {
  easy: { id: 'easy', name: '쉬움', lives: 30, gold: 260, hpMult: 0.8, goldMult: 1.2, desc: '느긋하게 배우기' },
  normal: { id: 'normal', name: '보통', lives: 20, gold: 220, hpMult: 1.0, goldMult: 1.0, desc: '균형 잡힌 도전' },
  hard: { id: 'hard', name: '어려움', lives: 12, gold: 200, hpMult: 1.2, goldMult: 0.9, desc: '실수는 용납되지 않음' },
};

export const RULES = {
  tickRate: 60,
  waveCountdown: 22, // seconds between waves when the player does not call early
  firstWaveCountdown: 30,
  earlyCallBonusPerSecond: 1.5,
  waveClearBonusBase: 20,
  waveClearBonusPerWave: 4,
  maxSpeed: 3,
};
