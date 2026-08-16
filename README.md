# STRATA

An open-world voxel RPG with **freeze-in-place** turn-based combat.

Single file (`index.html`), Three.js via CDN import map, no build step.
Serve it and open <http://localhost:5806>:

```bash
python -m http.server 5806 -d "C:\Users\danie\OneDrive\Desktop\Claude Cowork\strata"
```

Also registered in `.claude/launch.json` as **strata**.

---

## The thesis

**A voxel world is already a tactics grid.** You don't build one — you have one.
Every block is a tile, elevation is free, cover is free, line-of-sight is a voxel
raycast, and reachability is a flood fill over standable cells. Most tactics games
spend enormous effort authoring grids and hand-placing cover. Here it falls out of
the terrain generator, everywhere, for free.

That is why combat is **freeze-in-place** (Divinity / BG3) rather than
**encounter-swap** (Pokémon / FF). Cutting to a separate arena would throw away the
only structural advantage the premise has. When a fight starts, the ground you were
already standing on becomes the board.

## ⚠️ The hook is NOT chosen yet

This is M0–M1 built deliberately hook-agnostic, so the choice can be made from real
play instead of on paper. Three candidates are still open:

| | Hook |
|---|---|
| **A** | Combat reshapes the world — dig/collapse/raise terrain mid-fight, damage is permanent, old battlefields stay scarred |
| **B** | The world is your weapon — spells transmute voxels, damage is mostly environmental |
| **C** | Elevation is everything — a vertical-first world, height is the core stat |

All three need the same substrate, which is what's built: reachability BFS, LOS
raycast, elevation deltas, destructible terrain.

**QUARRY and RAISE are a probe, not a commitment.** They're the two dashed-outline
buttons on the action bar (break a block within 5; place stone within 4). They exist
so you can *feel* whether terrain manipulation is fun before picking a hook. If it
isn't, delete two entries from `ABILITIES` and the game is unchanged.

---

## What's in

**M0 — world**
- Chunked voxel terrain (16×16×80), value-noise FBM with continentalness + mountain mask
- Baked per-vertex ambient occlusion with the standard diagonal flip
- Biomes by height: sand → grass → stone → snow; sea level 26; seamless cross-chunk trees
- Streaming with a per-frame meshing budget; far chunk data is evicted (lossless)
- First-person walk/jump/swim, AABB collision, **1-block auto-step**
- Mine and place blocks (click or hold), 5-slot hotbar
- Save/load persists the **seed plus a diff list**, never the world

**M1 — combat**
- Freeze-in-place: fight on the terrain you were standing on, no arena
- Initiative order, movement points + action points
- Click-to-move over BFS-reachable cells with a hovered path preview
- Strike (melee), Sling (ranged, needs LOS), Quarry, Raise
- **High ground +25% / low ground −15%**, ranged **cover −25%**, LOS blocking
- Creatures fall when you remove their footing, and take fall damage
- Three creature types (Husk / Sprig / Slinger), spawned in **packs**
- XP, levels, death → respawn at your waystone

## What's deliberately out

Crafting, dialogue, factions, economy, caves, quests, sound. Each is a separate game;
picking any of them before the hook is settled is how prototypes die.

---

## Headless API

Every loop is dt-driven and drivable without a visible tab (`window.STRATA`):

```js
STRATA.fresh()                 // new world, skip the title
STRATA.sim(seconds)            // run N seconds of simulation
STRATA.step(dt)                // single tick
STRATA.state()                 // snapshot: mode, pos, hp, chunks, combat, tris
STRATA.teleport(x, z)
STRATA.ambush()                // trigger a real fight (walks you up to the pack first)
STRATA.autoFight(maxRounds)    // drive a whole fight; returns {result, turns, hpLost}
STRATA.dig(x,y,z) / .place(x,y,z,block) / .block(x,y,z)
STRATA.planApproach(a, target, ability)   // the shared movement planner
```

`autoFight` drives the player with **`planApproach` — the exact same planner the
creature AI uses.** A hand-rolled mirror of the real policy measures the mirror, not
the game.

### Last regression (33 ambushes, level-1 character, naive auto-player)

| | |
|---|---|
| Outcomes | 26 win · 5 lose · 2 draw · **0 hangs** |
| Pack size | 1–5 creatures |
| Length | ~21 player turns |
| HP lost | ~38 of 60 |

⚠️ **Balance is UNVALIDATED.** These numbers come from an auto-player with no tactics
at all — it never takes high ground, never uses cover, never digs. A human who plays
well should find this much easier, and the numbers say nothing about whether it's
*fun*. Do not tune from sim runs.

---

## Gotchas found building this (don't re-learn these)

- **Search wide, walk short.** Capping a creature's pathfinding at its movement
  budget makes it blind to any route longer than one turn. Stand it at the foot of a
  3-block ledge and every neighbouring cell scores worse than staying put, so it does
  nothing — forever. The budget limits the walk, not the lookahead.
- **Watch damage, not positions, to detect a stalemate.** A creature shuffling
  between two cells changes the board every round while achieving nothing, which
  defeats a position signature. Also bound combat on elapsed time: the round counter
  only advances through `nextTurn`, so anything that wedges a *phase* never reaches a
  round cap.
- **Plan once per AI turn.** Re-planning every tick lets a creature already in range
  attack forever — its plan never becomes empty.
- **Axis-aligned rays NaN the DDA.** `0 * Infinity` silently kills the traversal;
  force a zero direction component to "never crosses a boundary".
- **The third-person camera needs terrain collision.** A fight under a forest
  otherwise points the tactical camera at the inside of a leaf block.
- **Grass blocks need green sides.** With brown sides, the detail octave's many
  1-block steps make every terrace corner read as litter scattered on the lawn.
- **The pointer-lock overlay is `rgba(8,10,14,.55)`** — it dims the whole scene. A
  "too dark" screenshot is probably that, not your lighting.
- **Scatter creatures uniformly and every ambush is a 1v1**, the least interesting
  thing a tactics grid can do. Spawn packs.
- **Triggering a fight from far away silently makes it 1v1 too** — packmates fall
  outside the gather radius. A test must walk the player up first.
- **Evict chunk DATA, not just meshes.** Roaming grew `CHUNKS` to 2333 (~48MB).
  Eviction is lossless because terrain is a pure function of the seed and every
  player change lives in `EDITS`.
- InstancedMesh culls by its origin-centred bounding sphere → `frustumCulled = false`.
- A hidden tab pauses RAF entirely; the `setInterval` render watchdog is what keeps
  the canvas from compositing as a black rectangle.

## Next

1. **Playtest it.** Does the freeze-in-place transition feel good? Do high ground and
   cover actually change your decisions, or are they invisible? Is Quarry/Raise fun?
2. Pick the hook from what that playtest says.
3. Then, and only then, balance.
