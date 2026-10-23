# LevelViewer

Draws a ULB level from its `.ulb` file. Drop this whole folder into the repo root.

## Try it

It has to be served over http (not opened as a file), same as the rest of the site:

    python -m http.server 8000

Then open `http://localhost:8000/LevelViewer/` and drop a `.ulb` on the page.
`LevelViewer/?file=../levels/123456.ulb` opens a level directly.

## Files

| File | What it does |
|---|---|
| `ulb.js` | Decodes a `.ulb` file into the level data. |
| `renderer.js` | Draws a level on a canvas. Also makes thumbnails. |
| `viewer.js` + `index.html` | The test page: pan, zoom, save PNGs. |
| `embed.js` | The viewer used on the level details page: `mountViewer(element, url)`. |
| `thumbs.html` + `thumbs.js` | The thumbnail maker: makes `thumbs/<id>.png` for many levels at once, plus `thumbs/list.json`. |
| `data/blockmap.json` | One entry per game item: which picture it uses for each variant. |
| `data/colors.json` | Block colours, the back-layer tint, and which items can be coloured. |
| `data/backgrounds.json` + `backgrounds/` | The 16 backgrounds: flat colour, and which pictures repeat across which band of the level. |
| `data/sprites.json` | Where each picture sits in the atlas: `[atlas, x, y, width, height]`, plus a 6th number (4) for the pictures stored at 4x size. Generated, don't edit. |
| `atlas/game.png` | Every picture the viewer needs, packed into one sheet. |

## Where the data comes from

`blockmap.json`, `sprites.json` and `atlas/game.png` were generated from the game's own
item list (all 478 items), then checked against editor screenshots. For a few dozen
variants where a picture cut from a screenshot matched the editor better than the
game-data one (animated items, liquids), the screenshot picture is used instead; those
sprite names end in `s`.

## Reading blockmap.json

    "48": {"name": "Spikes", "kind": "tile", "v": {"0": ["48", 0, -1, -1], "1": ["48", 1, -1, -1]}}

`v` is keyed by the variant number saved in the level. Each value is
`[picture name, quarter turns clockwise, x offset, y offset]`, offsets in pixels from
the cell's top-left corner.

- `tile` and `object` items: variants 0-3 are rotations (only if the item can rotate).
- `tileset` items (ground, pipes, logs...): 0-14 are the connected shapes, 15 is the
  stand-alone block, 16-19 are the slopes.
- An `object` that appears in the block layer is a filler cell of a big object and is
  not drawn.

## Two-point items and links

Platforms, conveyors, mine tracks, pulleys and power lines are saved as two points.
Their entry has a `span` with an end piece for each point (`l`, `r`) and a middle (`m`)
that is stretched or repeated between them, at any angle.

Doors save the cell they lead to. Their entry has a `beam`, drawn as a thin line from
the door to that cell.

## Level format notes

Each block row holds, for one cell: front block, its variant and colour; back block,
its variant and colour; an overlay and its rotation; a liquid; then x and y.
Back blocks are drawn darker, the way the editor shows them. Levels are 250 x 250 cells.

## Backgrounds, attachments, door lines

- **Backgrounds** are stuck to the level (they don't scroll), so they are drawn like
  blocks. Call `await loadBackground(assets, area.background)` once, then pass
  `background: 'art'` to `renderToCanvas`, or call `drawBackground` yourself.
- **Attachments** (a level's `Modifiers`: pins, helmets, propellers, load attachments...)
  use the `"mod"` entry of their item in `blockmap.json`: `[picture, x offset, y offset]`
  from the host's cell. They are drawn at 0.8 size on top of the object they ride on.
- **Shrunk sprites.** The game draws some pictures smaller or bigger than 1:1 (exit signs,
  balloons, spikes, most attachments), so they have detail finer than one game pixel.
  Those are stored at 4x size in the atlas. To see that detail, render at a bigger scale:
  `renderToCanvas(assets, area, cells, 4)`. The test page does this on its own when zoomed in.
- **Door lines** only show while the door they belong to is in view, like in the editor.
  Pass `links: false` to `renderToCanvas` (or untick the box on the test page) to hide them.
- **The START block** (item 125) is drawn like in the editor. Pass `start: false` to
  `renderToCanvas` to leave it out; the thumbnail maker does.
- **Studying the layout.** `hideBack: true` leaves out the background layer and
  `hideDeco: true` leaves out decoration: items marked `"deco": true` in `blockmap.json`,
  the background-layer-capable blocks that have no collision in the front layer either
  (grass, flowers, grates, pipes, poles, crops...), taken from the game's own data
  (barbed wire is left out by hand: it hurts). The level page's "Layout mode" button
  does both at once.
