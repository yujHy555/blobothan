export type PlatformDef = { x: number; y: number; z: number; w: number; h: number; d: number };
export type WallDef = { x: number; y: number; z: number; w: number; h: number; d: number };
export type BumperDef = { x: number; y: number; z: number; power?: number };
export type SpinnerDef = { x: number; y: number; z: number };
export type SpringDef = { x: number; y: number; z: number; power?: number };
export type SmasherDef = { x: number; y: number; z: number; w: number; h: number; d: number; period: number; phase: number; travel: number };
export type PortalDef = { x: number; y: number; z: number; target: number };
export type ItemDef = { x: number; y: number; z: number };

export type RealmDef = {
  spawn: { x: number; y: number; z: number };
  platforms: PlatformDef[];
  walls?: WallDef[];
  bumpers: BumperDef[];
  spinners: SpinnerDef[];
  springs?: SpringDef[];
  smashers?: SmasherDef[];
  portals: PortalDef[];
  goal?: ItemDef;
  jetpacks?: ItemDef[];
  growths?: ItemDef[];
  sporelights: ItemDef[];
  wunderDust: ItemDef[];
  rabbits: ItemDef[];
};

/**
 * TWO 2.5D side-scrolling levels. Portals link them; the goal in level 2 wins.
 */
export const WORLD: RealmDef[] = [
  // ================================================================ LEVEL 1: Glowgrove
  {
    spawn: { x: 0, y: 6, z: 0 },
    platforms: [
      { x: 0, y: 2, z: 0, w: 24, h: 1.2, d: 8 },
      { x: 16, y: 3, z: 0, w: 7, h: 1, d: 6 },
      { x: 30, y: 10, z: 0, w: 8, h: 1, d: 6 },
      // grapple showcase chasm
      { x: 34, y: 8, z: 0, w: 6, h: 1, d: 7 },
      { x: 44, y: 17, z: 0, w: 3, h: 9, d: 6 },
      { x: 51, y: 18, z: 0, w: 3, h: 10, d: 6 },
      { x: 56, y: 8, z: 0, w: 7, h: 1, d: 7 },
      // smasher corridor
      { x: 66, y: 8, z: 0, w: 10, h: 1, d: 7 },
      { x: 80, y: 8, z: 0, w: 10, h: 1, d: 7 },
      // growth plaza → jetpack cruise → crouch-pop summit → portal terrace
      { x: 98, y: 7, z: 0, w: 14, h: 1.2, d: 8 },
      { x: 118, y: 8, z: 0, w: 8, h: 1, d: 6 },
      { x: 140, y: 14, z: 0, w: 8, h: 1, d: 6 },
      { x: 156, y: 20, z: 0, w: 10, h: 1, d: 7 },
      { x: 174, y: 16, z: 0, w: 12, h: 1.2, d: 8 },
    ],
    walls: [
      { x: 40, y: 10, z: 0, w: 2.5, h: 12, d: 7 },
      { x: 88, y: 9, z: 0, w: 2.5, h: 9, d: 7 },   // moved clear of the x=98 platform
      { x: 166, y: 14, z: 0, w: 2.5, h: 14, d: 7 },
    ],
    bumpers: [
      { x: 24, y: 9, z: 0, power: 20 },
      { x: 56, y: 10, z: 0, power: 22 },
      { x: 104, y: 9, z: 0, power: 21 },
      { x: 150, y: 16, z: 0, power: 24 },
    ],
    spinners: [{ x: 74, y: 9, z: 0 }],
    springs: [
      { x: 16, y: 3.7, z: 0, power: 30 },
      { x: 118, y: 8.7, z: 0, power: 26 },
    ],
    smashers: [
      { x: 66, y: 12, z: 0, w: 3.2, h: 2.4, d: 7, period: 2.0, phase: 0.0, travel: 6 },
      { x: 80, y: 12, z: 0, w: 3.2, h: 2.4, d: 7, period: 2.0, phase: 1.0, travel: 6 },
    ],
    portals: [{ x: 174, y: 18, z: 0, target: 1 }],
    growths: [{ x: 98, y: 9, z: 0 }],
    jetpacks: [{ x: 118, y: 10, z: 0 }],
    sporelights: [
      { x: 16, y: 5, z: 0 }, { x: 30, y: 12, z: 0 }, { x: 44, y: 12, z: 0 },
      { x: 50, y: 10, z: 0 }, { x: 66, y: 10, z: 0 }, { x: 80, y: 10, z: 0 },
      { x: 104, y: 9, z: 0 }, { x: 118, y: 10, z: 0 }, { x: 140, y: 16, z: 0 },
      { x: 156, y: 22, z: 0 },
    ],
    wunderDust: [{ x: 44, y: 14, z: 0 }, { x: 140, y: 17, z: 0 }],
    rabbits: [{ x: 104, y: 9, z: 0 }, { x: 156, y: 22, z: 0 }],
  },

  // ================================================================ LEVEL 2: Floorplanz
  // Same classic 2.5D style as level 1, with a cyan blueprint identity and the FINAL GOAL.
  {
    spawn: { x: 0, y: 6, z: 0 },
    platforms: [
      { x: 0, y: 2, z: 0, w: 20, h: 1.2, d: 8 },
      // spring → high ledge
      { x: 14, y: 3, z: 0, w: 6, h: 1, d: 6 },
      { x: 28, y: 9, z: 0, w: 8, h: 1, d: 6 },
      // grapple chasm with anchor pillars
      { x: 40, y: 8, z: 0, w: 6, h: 1, d: 7 },
      { x: 50, y: 17, z: 0, w: 3, h: 9, d: 6 },
      { x: 57, y: 18, z: 0, w: 3, h: 10, d: 6 },
      { x: 62, y: 8, z: 0, w: 8, h: 1, d: 7 },
      // triple smasher corridor
      { x: 76, y: 8, z: 0, w: 10, h: 1, d: 7 },
      { x: 92, y: 8, z: 0, w: 10, h: 1, d: 7 },
      { x: 108, y: 8, z: 0, w: 10, h: 1, d: 7 },
      // growth plaza → jetpack → crouch-pop summit → goal terrace
      { x: 126, y: 7, z: 0, w: 14, h: 1.2, d: 8 },
      { x: 146, y: 8, z: 0, w: 8, h: 1, d: 6 },
      { x: 168, y: 14, z: 0, w: 8, h: 1, d: 6 },
      { x: 184, y: 20, z: 0, w: 10, h: 1, d: 7 },
      { x: 202, y: 16, z: 0, w: 14, h: 1.2, d: 8 },
    ],
    walls: [
      { x: 46, y: 10, z: 0, w: 2.5, h: 12, d: 7 },
      { x: 116, y: 9, z: 0, w: 2.5, h: 9, d: 7 },  // moved clear of the x=126 platform
      { x: 192, y: 14, z: 0, w: 2.5, h: 14, d: 7 }, // clear of both x=184 and x=202 platforms
    ],
    bumpers: [
      { x: 22, y: 9, z: 0, power: 21 },
      { x: 62, y: 10, z: 0, power: 23 },
      { x: 132, y: 9, z: 0, power: 22 },
      { x: 178, y: 16, z: 0, power: 25 },
    ],
    spinners: [{ x: 84, y: 9, z: 0 }, { x: 100, y: 9, z: 0 }],
    springs: [
      { x: 14, y: 3.7, z: 0, power: 31 },
      { x: 146, y: 8.7, z: 0, power: 27 },
    ],
    smashers: [
      { x: 76, y: 12, z: 0, w: 3.2, h: 2.4, d: 7, period: 1.8, phase: 0.0, travel: 6 },
      { x: 92, y: 12, z: 0, w: 3.2, h: 2.4, d: 7, period: 1.8, phase: 0.6, travel: 6 },
      { x: 108, y: 12, z: 0, w: 3.2, h: 2.4, d: 7, period: 1.8, phase: 1.2, travel: 6 },
    ],
    portals: [
      { x: 202, y: 18, z: 0, target: 2 },   // to the Neon Bowl skate level
    ],
    growths: [{ x: 126, y: 9, z: 0 }],
    jetpacks: [{ x: 146, y: 10, z: 0 }],
    sporelights: [
      { x: 14, y: 5, z: 0 }, { x: 28, y: 11, z: 0 }, { x: 50, y: 12, z: 0 },
      { x: 62, y: 10, z: 0 }, { x: 76, y: 10, z: 0 }, { x: 92, y: 10, z: 0 },
      { x: 108, y: 10, z: 0 }, { x: 132, y: 9, z: 0 }, { x: 146, y: 10, z: 0 },
      { x: 168, y: 16, z: 0 }, { x: 184, y: 22, z: 0 },
    ],
    wunderDust: [{ x: 50, y: 14, z: 0 }, { x: 168, y: 17, z: 0 }],
    rabbits: [{ x: 132, y: 9, z: 0 }, { x: 184, y: 22, z: 0 }],
  },

  // ================================================================ LEVEL 3: Neon Bowl (half-pipe skating)
  {
    spawn: { x: -20, y: 12, z: 0 },
    platforms: [],
    bumpers: [],
    spinners: [],
    sporelights: [],
    wunderDust: [],
    rabbits: [],
    portals: [
      { x: -44, y: 23.4, z: 0, target: 1 }, // back to Solar Foundry
      { x: 44, y: 23.4, z: 0, target: 3 },  // to the endless Ollie Ollie Ollie park
    ],
  },

  // ================================================================ LEVEL 4: Ollie Ollie Ollie (continuous mega-park)
  {
    spawn: { x: 0, y: 8, z: 0 },
    platforms: [],
    bumpers: [],
    spinners: [],
    sporelights: [],
    wunderDust: [],
    rabbits: [],
    portals: [
      { x: -40, y: 7, z: 0, target: 2 }, // back to Neon Bowl (well behind the start)
    ],
    // No goal — the run is endless. Chase distance and combos forever.
  },
];
