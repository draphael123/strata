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

**Character creator**
- Four stats — Might, Vitality, Intellect, Agility. Base 4, twelve points to spend, cap 12.
- **Weapons are stat-gated**: Worn Blade (free), Sword & Shield (Vit 8, soaks 25%),
  Greataxe (Mgt 10, −1 move), Elm Staff (Int 9, ranged + deeper mana), Hunting Bow (Agi 9).
- **One ability, also stat-gated**: Second Wind (free), Shield Bash (Vit 8, hurls a foe
  2 cells — off a ledge if one is there), Cleave (Mgt 10), Fireball (Int 9, splashes),
  Piercing Shot (Agi 9, ignores cover), Stone Sunder (Mgt 8, shatters ground).
- **Strike is always slot 1** — it's whatever weapon you carry, so turn one is never empty.
- Derived numbers (vigour, mana, movement, initiative, shield) preview live as you spend.
- Anything your stats stop supporting silently falls back rather than locking you out.

**Mana** — spells cost it, it trickles back 2 per turn and refills between fights.
Intellect and the staff both deepen the pool.

**The starting vale** — you wake at a campfire, and it is *authored*, not found:
a lake below the shore, mossy ruins with a standing arch around the fire, creatures
prowling the meadow, and a town on a rise ~75 blocks out with a watchtower.
It is blended into the noise function rather than stamped as edits, so it survives
save/load and chunk eviction for free and seams back into procedural terrain.

**Animations** — attack lunges, cast flourishes, hurt recoils, death topples, walk
cycles with counter-swinging arms, idle sway, a flickering fire with real point light,
and impact bursts for Fireball and Sunder.

**The look pass**
- Gradient sky dome with a real sun disc and bloom, plus **blocky drifting clouds**
  that wrap around the camera so the sky is never empty
- **Water that reads as a lake**: swell in the vertex shader, sun glint, a narrow
  foam lace at the waterline, and colour + opacity driven by a baked **depth**
  attribute — pale green over the shallows, dark in the deeps
- **Ground scatter emitted into the chunk buffer itself** — grass blades, ferns,
  flowers, pebbles, shoreline reeds, lily pads. No extra draw calls, and it streams
  and evicts with the terrain for free
- **Three tree species** — tapered conifers, airy pale-trunked birches, round oaks
- Per-voxel brightness jitter weighted heavily toward masonry, so ruin walls read as
  weathered stone instead of painted cardboard
- Contact shadows under every figure; campfire embers and smoke
- Fog retuned to the sky dome's *horizon* colour so distance melts into haze

**Away from Minecraft.** Perfect unit cubes are the loudest borrowed signal a voxel
world sends — above palette or content. So:
- **Blocks are bevelled.** Exposed edges are inset and bridged with a 45° chamfer,
  plus corner patches where two chamfers meet. Interior edges are untouched, so a
  flat wall or plain still tiles seamlessly and costs nothing — geometry appears
  only on silhouettes, which is the only place it matters.
- **Trees are real tapered meshes**, instanced: layered conifers, faceted oaks,
  pale airy birches, each with its own yaw and lean so nothing is axis-aligned.
  The tree *voxels* are still there and still block movement, sight and cover —
  they are simply not drawn. Gameplay is untouched; only the picture changed.
- **Golden hour**: a low raking sun, warm key against cool bounce, real cast
  shadows, warm horizon haze, soft cloud banks.

**Ground character** — moisture, wear and slope are sampled once per column and
tint the terrain: strawy where it's exposed, deep green where it's sheltered,
worn through to bare earth on slopes and hard ground. One flat green across the
whole vale reads as carpet; this costs nothing (it's the existing vertex colour).

**Wind** — a `sway` attribute is emitted alongside every vertex: 0 on solid block
faces, rising toward the tip of each blade. It's displaced in a vertex shader
injected into the standard Lambert material via `onBeforeCompile`, so shadows,
fog and lighting all keep working, and the depth pass gets the same patch so
shadows don't detach from the grass. Terrain is rock-still; only vegetation moves.

**Sound** — fully procedural WebAudio, no assets. Swings, impacts, bowstrings,
casts, deaths, footfalls paced to ground speed, turn chimes, victory and defeat
stings, a wind bed, distance-driven campfire crackle, and occasional birdsong.
The context is only created on a real user gesture, so a headless `sim()` never
makes a single node.

Render cost at 7-chunk view distance: ~1.0 ms/frame, ~230k triangles.

**M0 — world**
- Chunked voxel terrain (16×16×80), value-noise FBM with continentalness + mountain mask
- Baked per-vertex ambient occlusion with the standard diagonal flip
- Biomes by height: sand → grass → stone → snow; sea level 26; seamless cross-chunk trees
- Streaming with a per-frame meshing budget; far chunk data is evicted (lossless)
- First-person walk/jump/swim, AABB collision, **1-block auto-step**
- Mine blocks (click or hold). The block palette is gone — this is an RPG, not a builder
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
STRATA.teleport(x, z)          // SURFACE only — cannot put you in the barrow
STRATA.placeAt(x, y, z)        // streams chunks first, then places; use this underground
STRATA.ambush()                // trigger a real fight (walks you up to the pack first)
STRATA.autoFight(rounds, mode) // mode: false | true (positional) | 'player' (full kit)
STRATA.dig(x,y,z) / .place(x,y,z,block) / .block(x,y,z)
STRATA.planApproach(a, target, ability)   // the shared movement planner
```

`autoFight` drives the player with **`planApproach` — the exact same planner the
creature AI uses.** A hand-rolled mirror of the real policy measures the mirror, not
the game. `'player'` mode additionally focus-fires the weakest thing it can reach,
drinks when a single round could kill it, cleaves when surrounded, and spends a
leftover action on Guard. Plain `true` is Strike-only and is a FLOOR, not a verdict.

### ⚠️ Four ways this harness has silently measured nothing

Every one of these produced confident, plausible, completely wrong numbers.

1. **`player.pos.set()` is not a teleport.** The chunks aren't streamed, collision
   reads unloaded space as solid, and the next `sim()` ejects you to the surface. A
   whole afternoon of "boss fights" ran with the player on the hillside 29 blocks
   above the dungeon. Use `placeAt`, then assert `y` didn't move after a tick.
2. **`sim()` repopulates the world.** Clear the entities, stage your encounter, call
   `sim()` to settle, and the ambush hands you a passing wolf. Settle *first*, then
   stage — and assert your boss is actually in `CB.order`.
3. **Aggro has a gather radius, so where you stand decides who joins.** Same room,
   same spawns: 2 foes from the entrance, 1 mid-hall, all 3 only from the middle.
   Report the mean `CB.order.length` or encounter size is an unmeasured variable.
4. **Check consumables cost an action.** They didn't, once — free healing every
   round makes every number meaningless in both directions.

### Last regression (25 ambushes across all six builds, level 1)

| | |
|---|---|
| Outcomes | 13 win · 11 lose · 1 draw · **0 hangs** |
| Pack size | 1–6 creatures |
| Length | ~13 player turns |
| HP lost | ~31 |

⚠️ **Balance is UNVALIDATED.** These numbers come from an auto-player with no tactics
at all — it never takes high ground, never uses cover, never digs. A human who plays
well should find this much easier, and the numbers say nothing about whether it's
*fun*. Do not tune from sim runs.

### The barrow, level 5, three foes, `'player'` policy (n=12 per build)

Fought on even ground, after the melee follow-through pass:

| build | win % | HP left on a win |
|---|---|---|
| Elm Staff / Fireball | 100% | 47% |
| Hunting Bow / Piercing Shot | 100% | 37% |
| Greataxe / Cleave | 58% | 44% |
| Sword & Shield / Second Wind | 42% | 53% |

**Ranged is still untouchable and that is the open problem.** The barrow does have an
answer — the Wisp has reach 8 — but at 16 hp an archer deletes it in one shot and
then kites the two brutes freely. Wants a human at the controls before guessing.

Two findings here were **positional, not statistical**, and they matter more than any
stat tweak:

- **The dais is decisive.** With the barrow-lord standing on it the greataxe wins
  **8%**; pulled down onto the flagstones it wins **58%**. High ground (+25%/−15%) is
  doing exactly what it should — the correct play is to make him come down.
- **The hall pulls in pieces** — two at the entrance, one mid-hall, all three only if
  you barge to the middle — so a careful approach is already rewarded. Count the
  standable neighbours of a cell and you get the melee tax directly: the two-wide
  throat exposes 3–4, the open hall 7–8.

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
- **An authored area has to READ, not just exist.** The first vale was correct in every
  block count and still showed neither the lake nor the town — normal forest density hid
  both. Thin the woods toward the camp and clear a corridor along each sightline.
- **Props laid AT ground level replace the turf and read as stains**, not objects. The log
  seats were a brown rectangle painted on the grass until raised a block. The inverse also
  bites: raising the hearth ring walled the flame in and hid the fire entirely.
- **A purely radial lake bowl carves perfect concentric steps** — a machined amphitheatre.
  Add noise to the bed. And a smoothstep profile only dips below sea level near the centre,
  giving a pond ringed by a desert; a steeper exponent keeps the water wide.
- **Don't measure a structure with `surfaceY`** — it returns the roof, so every wall below
  falls outside the scanned band and reads as missing. Sweep an absolute Y range.
- **Crossed quads make cones.** A tapered X-billboard reads as a miniature conifer planted
  on the lawn at *every* size — shrinking it doesn't help. Grass has to be several
  separate thin single quads at scattered angles with a lean.
- **Clear water shows you a staircase.** A voxel lake bed is stepped by construction; the
  fix is a baked per-vertex depth driving colour and opacity, not more bed noise.
- **A custom ShaderMaterial does not get `attribute vec3 color`** — three only auto-declares
  position/normal/uv. Alias the buffer under another name (`wcol`) and declare it yourself.
- Wrap sky/cloud instances inside **both** the dome radius and the camera far plane, or
  they pop out of existence at the seam.
- Faces turned away from the sun crush to near-black with stingy ambient — a shaded ruin
  wall should read as stone, not as a hole in the world.
- **A CDN import map is a silent single point of failure** — see the vendored `vendor/`
  directory and the boot watchdog. A dead engine looks exactly like dead buttons.
- InstancedMesh culls by its origin-centred bounding sphere → `frustumCulled = false`.
- A hidden tab pauses RAF entirely; the `setInterval` render watchdog is what keeps
  the canvas from compositing as a black rectangle.

## Next

1. **Playtest it.** Does the freeze-in-place transition feel good? Do high ground and
   cover actually change your decisions, or are they invisible? Is Quarry/Raise fun?
2. Pick the hook from what that playtest says.
3. Then, and only then, balance.

## Audio credits

Music is CC0 from OpenGameArt and streamed from `audio/`:

- `explore.ogg` — *Creepy Forest F* by Brandon Morris (CC0)
- `barrow.ogg` — *Cave Theme* by brandon75689 (CC0)
- `battle.mp3` — *Battle Theme A* by cynicmusic (CC0)

Sound effects are procedural WebAudio, generated at runtime — no files.
