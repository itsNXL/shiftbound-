import Phaser from 'phaser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MBody = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMatter(): any {
  return (Phaser.Physics.Matter as unknown as { Matter: any }).Matter;
}

/** Returns every body currently in the Matter world. */
export function getWorldBodies(scene: Phaser.Scene): MBody[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const world = (scene.matter as any).world.localWorld;
  return getMatter().Composite.allBodies(world) as MBody[];
}
