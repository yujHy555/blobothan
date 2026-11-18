export interface LevelData {
  spawn: { x: number; y: number; z: number };
  goal: { x: number; y: number; z: number };
  platforms: Array<{ x: number; y: number; z: number; width: number; height: number; depth: number; oneWay?: boolean; glow?: boolean }>;
  collectibles: Array<{ x: number; y: number; z: number }>;
  enemies: Array<{ x: number; y: number; z: number; patrolX: number; speed: number }>;
}

export const level1: LevelData = {
  spawn: { x: 0, y: 5.5, z: 0 },
  goal: { x: 58, y: 9, z: 0 },

  platforms: [
    // start bank
    { x: 0, y: 3, z: 0, width: 8, height: 1.2, depth: 6 },
    // stepping up
    { x: 10, y: 5, z: 0, width: 5, height: 1, depth: 5 },
    { x: 18, y: 6, z: 2, width: 6, height: 1, depth: 5 },
    { x: 26, y: 5, z: -2, width: 6, height: 1, depth: 5 },
    // gap jump
    { x: 36, y: 6, z: 0, width: 6, height: 1, depth: 6 },
    // moving-ish static series up
    { x: 46, y: 8, z: 1, width: 6, height: 1, depth: 5 },
    { x: 54, y: 9, z: -1, width: 6, height: 1, depth: 5 },
    // higher stretch with a one-way (can jump up through)
    { x: 66, y: 11, z: 0, width: 7, height: 1, depth: 6 },
    { x: 78, y: 13, z: 2, width: 7, height: 1, depth: 6, oneWay: true },
    // goal platform
    { x: 90, y: 15, z: 0, width: 8, height: 1.2, depth: 8 },

    // optional lower route
    { x: 20, y: 1, z: 4, width: 6, height: 1, depth: 5 },
    { x: 30, y: 2, z: 4, width: 6, height: 1, depth: 5 },
  ],

  collectibles: [
    { x: 10, y: 6, z: 0 },
    { x: 18, y: 7, z: 2 },
    { x: 26, y: 6, z: -2 },
    { x: 36, y: 7, z: 0 },
    { x: 46, y: 9, z: 1 },
    { x: 54, y: 10, z: -1 },
    { x: 66, y: 12, z: 0 },
    { x: 78, y: 14, z: 2 },
    { x: 90, y: 16, z: 0 },
    { x: 20, y: 2, z: 4 },
    { x: 30, y: 3, z: 4 },
  ],

  enemies: [
    { x: 42, y: 6.6, z: 0, patrolX: 3, speed: 4 },
    { x: 70, y: 11.6, z: 0, patrolX: 2.5, speed: 3 },
  ],
};
