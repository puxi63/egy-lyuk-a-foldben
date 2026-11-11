/* ==== edge.js — the edge of the world (NOTES-44-pickup-edge, TODO item 36) ====
 * The diggable block ends EDGE_LOCK samples inside its side and bottom faces (world.js digSphere never digs those
 * samples), and on the surface the players are kept inside a ±60 m square (player.js). This module only derives those
 * limits from config.js and answers "is this point past the edge"; it is read by player.js (the throttled HUD lines),
 * terrain.js (the edge rock face in the soil shader), ui/map.js (the edge on Thrór's map) and surface/edge-fence.js. */
import { CELL, EDGE_LOCK, NX, NZ, ORIGIN } from './config.js';

/** The last diggable sample planes (x / z in metres; y0 the lowest diggable height) and the surface bound. */
export const EDGE = {
  x0: ORIGIN.x + EDGE_LOCK * CELL,
  x1: ORIGIN.x + (NX - 1 - EDGE_LOCK) * CELL,
  z0: ORIGIN.z + EDGE_LOCK * CELL,
  z1: ORIGIN.z + (NZ - 1 - EDGE_LOCK) * CELL,
  y0: ORIGIN.y + EDGE_LOCK * CELL,
  /** The players' walkable square on the surface (|x|, |z| ≤ this; player.js clamps to it). */
  surface: 60,
};

/** The HUD lines (Hungarian UI) and how often one player hears them. */
export const EDGE_LINES = {
  dig: 'Itt a világ széle — erre nem lehet tovább ásni.',
  walk: 'Itt a világ széle — erre nem lehet továbbmenni.',
  every: 5, // seconds between two lines for one player
  push: 0.45, // seconds of pushing into the edge before the line
};

/** True when (x, y, z) lies past the last diggable sample (by more than `m` metres), below the open sky. */
export function beyondEdge(x, y, z, m = 0.02) {
  return x < EDGE.x0 - m || x > EDGE.x1 + m || z < EDGE.z0 - m || z > EDGE.z1 + m || y < EDGE.y0 - m;
}

/**
 * The outward push against the block's side faces underground: `wx`, `wz` the player's walking direction (world, length
 * ≤ 1), `r` how near to the edge plane counts. Returns true when he stands within r of a side face and walks into it.
 */
export function pushesEdge(x, z, wx, wz, r = 0.5) {
  return (x > EDGE.x1 - r && wx > 0.5) || (x < EDGE.x0 + r && wx < -0.5) || (z > EDGE.z1 - r && wz > 0.5) || (z < EDGE.z0 + r && wz < -0.5);
}
