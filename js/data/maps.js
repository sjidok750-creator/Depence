// Map definitions in tile coordinates. Paths run through tile centres.
// `paths` may contain several routes; ground enemies alternate between them.
// Flying enemies ignore the road and fly straight from spawn to the keep.

export const COLS = 20;
export const ROWS = 12;
export const TILE = 48;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export const MAPS = [
  {
    id: 'meadow',
    name: '초원 길',
    subtitle: '구불구불한 한 갈래 길. 입문용.',
    seed: 11,
    theme: { grass: '#8fcf6f', grass2: '#7fbf5f', path: '#d9b985', pathEdge: '#b8945e', water: '#6fb7e8' },
    paths: [[[-1, 2], [3, 2], [3, 8], [8, 8], [8, 3], [13, 3], [13, 9], [17, 9], [17, 5], [20, 5]]],
    blocked: [[0, 10], [1, 10], [0, 11], [1, 11], [18, 0], [19, 0], [19, 1], [10, 0], [11, 0]],
    water: [],
    difficultyMult: 1,
  },
  {
    id: 'river',
    name: '굽이진 강',
    subtitle: '강이 건설 공간을 제한합니다.',
    seed: 23,
    theme: { grass: '#86c86d', grass2: '#76b85d', path: '#d6b58c', pathEdge: '#b08b5c', water: '#5fa9e6' },
    paths: [[[-1, 6], [4, 6], [4, 1], [10, 1], [10, 10], [15, 10], [15, 4], [20, 4]]],
    blocked: [[0, 0], [1, 0], [0, 1], [19, 11], [18, 11], [19, 10]],
    water: [
      [6, 4], [7, 4], [8, 4], [8, 5], [8, 6], [7, 6], [6, 6], [6, 5], [7, 5],
      [12, 6], [13, 6], [13, 7], [12, 7], [17, 8], [18, 8], [17, 9], [18, 9],
    ],
    difficultyMult: 1.08,
  },
  {
    id: 'twin',
    name: '쌍둥이 길',
    subtitle: '두 갈래 길이 중앙에서 합쳐집니다.',
    seed: 37,
    theme: { grass: '#97cf74', grass2: '#84bf62', path: '#dcbf8e', pathEdge: '#b99763', water: '#6ab4ea' },
    paths: [
      [[-1, 1], [5, 1], [5, 5], [9, 5], [9, 6], [14, 6], [14, 9], [20, 9]],
      [[-1, 10], [5, 10], [5, 7], [9, 7], [9, 6], [14, 6], [14, 9], [20, 9]],
    ],
    blocked: [[0, 5], [0, 6], [19, 1], [19, 0], [18, 0]],
    water: [[16, 2], [17, 2], [17, 3], [16, 3]],
    difficultyMult: 1.15,
  },
];

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
