# Photo Editor

A browser photo editor with the three-pane layout: **toolbar on the left, canvas in the middle,
AI chat on the right**. Built as a real editor core, not a demo: non-destructive filter chains,
GPU rendering, patch-based undo, and an AI layer that can only touch the document through typed tools.

```bash
cd ~/photo-editor
npm install
npm run dev          # http://127.0.0.1:5273
```

A procedural sample photo loads on boot, so it works with zero setup.

## Running on the LAN

`npm run dev` binds `0.0.0.0`, so the editor is reachable from any device on the
same network — phone, tablet, another laptop:

```
Local:   http://localhost:5273/
Network: http://192.168.1.122:5273/     <- open this on the other device
```

| want | command |
|---|---|
| LAN (default) | `npm run dev` |
| loopback only | `npm run dev:local` |
| production build + preview (also on the LAN) | `npm run build && npm run preview` → port 4173 |
| different port | `npx vite --port 5280` |

### Open the firewall (ufw)

If `ufw` is enabled — this box runs with `DEFAULT_INPUT_POLICY="DROP"` — the port is
bound but every LAN client is silently dropped. Allow it for your subnet only:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 5273 proto tcp   # dev server
sudo ufw allow from 192.168.1.0/24 to any port 4173 proto tcp   # preview server
```

Revoke with `sudo ufw delete allow from 192.168.1.0/24 to any port 5273 proto tcp`.
`npm run lan:ip` prints the URL to open on the other device.

**Caveats when you open it by IP rather than localhost:**

- It is plain **HTTP**, so it is not a secure context. `navigator.clipboard` will
  refuse, which is why 复制到剪贴板 shows an error there. Everything else — canvas,
  WebGL, file pickers, export — works normally. Put it behind HTTPS (mkcert, or a
  tunnel) if you need clipboard access.
- **Everyone on that network can open it**, and the Vite *dev* server serves your
  source files as-is — including any `VITE_AI_API_KEY`. Only do this on a network
  you trust; for anything else use `npm run preview` of a build.
- Vite checks the `Host` header, so use the IP or `localhost`. A hostname such as
  `mybox.local` has to be listed in `server.allowedHosts` in `vite.config.ts`.
- Touch works for dragging, but **pinch-zoom is not implemented** — use the −/＋
  buttons on small screens.

---

## The three decisions that matter

### 1. The document is the single source of truth

```ts
type Doc = {
  id: string
  width: number; height: number
  background: string
  layers: Layer[]
  selection: string[]
}
```

It holds **no pixel data** — only a `src` handle. Images live in a registry
(`src/doc/sources.ts`) and, on the GPU, in a texture cache keyed by the same id.
The document is therefore fully serialisable, cheap to snapshot, and cheap to send to a server later.

### 2. Every mutation is a pure recipe, undo is free

```ts
type Recipe = (draft: Draft<Doc>) => void
```

`useDoc.commit(recipe)` runs it through immer's `produceWithPatches` and stores
`{ fwd, inv }` patch pairs. Undo applies `inv`, redo applies `fwd`. Because patches are
recorded at the data layer, *every* feature gets undo for free — including AI edits.

Consecutive commits with the same `coalesce` key within 800 ms merge into one history entry,
so dragging a slider is one undo step, not two hundred.

### 3. Photo effects are a linear chain, not a node graph

```ts
type FilterOp =
  | { kind: 'exposure';    value: number }
  | { kind: 'contrast';    value: number }
  | { kind: 'saturation';  value: number }
  | { kind: 'temperature'; value: number }
  | { kind: 'vignette';    amount: number; feather: number }
  | { kind: 'blur';        radius: number }
  | { kind: 'sharpen';     amount: number }
```

Photoshop, Lightroom and Canva all expose a *linear* model. A DAG is for compositing
(masks, generative fill back into a layer), and it can be added later without changing
anything else, because every op is already `texture → texture`.

The "engine" is ~200 lines: `src/render/evaluate.ts` walks the chain and caches the
**output texture of every stage**, keyed by `hash(input texture id + op params)`.
Dragging the last slider only re-runs the passes after it. Cache is LRU-capped at 28 textures.

---

## Top bar

One row of grouped, always-visible commands:

| group | commands |
|---|---|
| **File** | 新建 · 打开（替换文档）· ＋图层 · 导出 ▾ (PNG / JPG / 复制到剪贴板) |
| **Edit** | ↶ 撤销 · ↷ 重做（＝取消撤销）· 历史 ▾ |
| **View** | − · zoom % (click = 100%) · ＋ · 适应 |

**撤销 / 重做** are labelled with what they will act on — the button tooltip reads
`撤销：移动图层` or `取消撤销：预设 胶片`, and is disabled when the corresponding stack is empty.

**历史 ▾** lists every step, marks the current one, strikes through the ones you
undid, and lets you click any row to jump straight there (`store.jumpTo(n)` replays
patches forwards or backwards). It renders through a portal so the top bar's
horizontal scroll container can't clip it.

### Undo semantics

Entries store `{ fwd, inv, label }` patch pairs. `undo` applies `inv`, `redo` applies
`fwd`. Slider drags pass a `coalesce` key, so 200 intermediate values collapse into
one history entry — and **an edit made after an undo is always a new entry**, never
merged into the entry you just undid (regression-tested in `npm run smoke:history`).

## Languages (i18n)

A switcher sits at the **top-right** of the bar (`繁 / 简 / EN`). Three locales ship:
`zh-Hant`, `zh-Hans`, `en`.

Resolution order: `localStorage["photo-editor.locale"]` → `navigator.languages`
(`zh-TW/HK/MO/Hant` → 繁, other `zh` → 简, `en` → EN) → `zh-Hans`.

```ts
const t = useT()                              // inside a component, re-renders on switch
t('layers.title', { n: 3 })                   // outside React: import { t }
```

`t()` interpolates `{name}` placeholders and falls back to `zh-Hans`, then to the key
itself — so raw strings pass through untouched.

Two details that make it behave correctly rather than approximately:

- **History labels are stored as keys, not text.** `commit(recipe, 'hist.moveLayer')`.
  Switching language relabels the entire undo stack instantly, including rows you made
  before the switch.
- **Filter, preset, blend and slider labels are keys too** (`filter.exposure`,
  `preset.film`, `param.tolerance`), resolved at render time.

Deliberately *not* translated:

- the local intent parser's keyword lists — it must understand 「更亮」 and "brighter"
  regardless of what the UI is set to;
- AI tool `description`/param text — that is read by the model, not the user.

Add a language by appending a `Dict` in `src/i18n/dict.ts` and one row to `LOCALES`.

## Layers

Multiple images composite into one document. `Doc.layers` is an ordered stack
(index 0 = bottom); each layer carries its own transform, opacity, blend mode and
**independent filter chain**, so one layer can be B&W while the one above it stays warm.

| action | how |
|---|---|
| add a picture as a new layer | topbar **＋ 图层** or **＋ 添加** in the layers panel (multi-select works) |
| drop files onto the canvas | adds them as layers, one undo step |
| reorder | drag a row in the layer list, or 上移 / 下移 |
| duplicate | 复制 (offset by 24 px, filters cloned) |
| replace the whole document | topbar 载入图片 — resets size and history |

Adding a layer fits the image inside the document, centred, and switches to the
layers panel. Replacing the document frees the old GPU textures and bitmaps
(`Compositor.resetTextures()` + `releaseAllExcept()`), so memory does not crawl.

## Selection & masking（魔棒 / 背景橡皮擦）

Layers carry an optional **alpha mask** — one byte per source pixel, `255` keep / `0` erased.

```
Doc ──► layer.filter chain ──► blit(tex × mask × opacity, blend) ──► accum ──► canvas
```

Masks follow the same rule as image sources: **the document stores only `maskId`**, the
raster lives in a registry (`src/doc/mask.ts`). Committed masks are immutable — every edit
produces a new one — so undo is a single `maskId` patch, and a duplicated layer can share
a mask safely. Rasters that no document or history entry can reach are pruned on every commit.

### 魔棒 Magic Wand (`W`)

Colour-distance flood fill from the clicked pixel. Contiguous / global, tolerance 0–100, feather 0–16 px.
Click = **delete the selection**; `Shift`+click = **keep only the selection**.

### 背景橡皮擦 Background Eraser (`E`)

Brush that samples the colour under the cursor and erases similar pixels as you drag, with a
soft brush edge and a colour-similarity falloff. Radius and tolerance in the tool options.

Implementation notes that matter:

- Both run on the **CPU** against the layer's own pixels (`src/tools/pixels.ts` caches one
  `ImageData` per source). The result is uploaded as a `LUMINANCE` texture, so a mask costs
  1 byte/px of GPU memory instead of 4.
- Brush strokes mutate a **temporary** mask and only commit on pointer-up, so a 300-event drag
  is **one** undo step and one mask snapshot — never 300.
- A stroke that changes nothing is discarded instead of polluting history (`eraseDab` reports
  whether it actually wrote a pixel).
- Feather and brush falloff are a separable sliding-window box blur — `O(w·h)`, not `O(w·h·r)`.

### Memory

Each committed mask retains one snapshot (`~1 byte × source pixels`) for as long as history can
reach it. At 1600×1067 that is ≈1.7 MB per erase step. Deep histories on large images are the
main memory consumer; `pruneMasks()` keeps it bounded to what undo actually needs.

## Rendering

```
Doc ──► per-layer filter chain (WebGL passes) ──► accumulated framebuffer ──► canvas
                                                     ▲
                                       layer transform (mat3) + blend mode
```

- One vertex shader (full-screen quad) serves everything; each filter is one fragment shader
  (`src/render/shaders.ts`).
- Compositing happens **in GL** with fixed-function blending (`normal` / `multiply` / `screen`
  are the only modes expressible that way — `overlay` would need a shader, so it is not offered).
- **Preview and export share one code path.** `exportDoc()` re-renders the same document
  through the same compositor, so WYSIWYG cannot drift. This is the thing that kills most
  editors at month three.
- `ImageBitmap` uploads ignore `UNPACK_FLIP_Y_WEBGL` in WebGL; the UV matrix accounts for it
  (`src/render/geometry.ts`). Getting this wrong silently flips every image.

## The AI layer

The model **never** emits coordinates or code. It picks from a typed tool registry
(`src/ai/tools.ts`), each tool being a schema + a recipe:

| tool | what it does |
|---|---|
| `describe_document` | reads size / layers / filter chains (read tool) |
| `set_preset` | replaces the chain with a named preset |
| `set_adjustment` | sets or adds one base adjustment |
| `add_effect` / `remove_effect` | vignette, blur, sharpen |
| `reset_edits` | clears the chain |
| `crop` | aspect-ratio crop, reflows every layer |
| `set_opacity` / `set_blend` | layer properties |

Flow: **prompt → validated tool calls → dry-run on a copy → live preview → accept/discard → one undoable commit.**

The preview is a real render of the *proposed* document (amber "AI 预览 · 未应用" badge),
while the panel and history still show the untouched real state. Discarding is a no-op by
construction, not by cleanup.

### Offline by default

Without an API key, a local intent parser (`localCalls`) produces the same tool calls a model
would. Same validation, same preview, same commit path — it proves the tool layer is the real
interface. It handles numbers positionally so `曝光 +0.5 对比度 25` gives 0.5 to exposure and
25 to contrast.

### With an LLM

```bash
VITE_AI_API_KEY=sk-... \
VITE_AI_MODEL=gpt-4o-mini \            # any OpenAI-compatible model
VITE_AI_BASE_URL=https://api.openai.com/v1 \
npm run dev
```

Requests go through `chat/completions` with `tools: [...]` and `tool_choice: 'auto'`.
If the call fails, it falls back to the local parser and says so in the chat.

> The key is a `VITE_` variable, i.e. it ships to the browser. Fine for local use;
> for anything public, move `llmCalls()` behind your own endpoint.

---

## Layout

```
src/
  doc/         types, ops (recipes), store (undo/redo), presets, source registry
  render/      shaders, GL wrapper, chain evaluator + cache, compositor, matrix math
  ai/          tool registry, param schema, planner (local + LLM)
  i18n/        locale store, t()/useT(), dictionaries
  components/  Viewport, panels, ToolPalette, ChatPanel, Topbar, LangSwitcher, Dropdown
  demo/        procedural sample image
scripts/
  ai-smoke.ts  headless test of the tool layer (11 prompts + validation)
```

## Controls

| | |
|---|---|---|
| Wheel | zoom at cursor |
| Space / Alt / middle-drag | pan |
| Drag layer | move · corner handle | scale from centre |
| `V` / `W` / `E` | 移动 · 魔棒 · 背景橡皮擦 |
| `Shift`+click (wand) | keep selection only（反选删除） |
| `F` | fit · `B` hold | show original (filters stripped) |
| `Del` | delete selected layer |
| `⌘/Ctrl+Z` | 撤销 undo |
| `⇧⌘Z` / `Ctrl+Y` | 重做 · 取消撤销 |

## Tests

```bash
npm run smoke           # all three suites
npm run smoke:history   # undo/redo/coalesce/jumpTo — 18 assertions
npm run smoke:mask      # wand / eraser / blur — 22 assertions
npm run smoke:ai        # the tool layer — 11 prompts + validation
```

`smoke:mask` runs the selection algorithms headlessly (no DOM) against a synthetic
two-colour image: contiguous vs global flood fill, seed-colour sensitivity, tolerance,
feather producing partial alpha, `erase`/`keep` polarity, idempotence, box-blur edges,
and that a fast drag leaves no gaps.

`smoke:history` covers the dangerous parts of a patch stack: counting entries, drag
coalescing, undoing a merged drag, the post-undo-no-merge rule, redo invalidation,
`jumpTo` in both directions, and that extra undos are harmless.

`smoke:ai` covers preset resolution, multi-intent numeric parsing, keyword collisions
(`暗角` vs `暗`), crop, layer props, enum rejection, and that every produced recipe
actually mutates the document.

## Not built (deliberately)

- **Text / shape layers** — the document model is image-only right now.
- **Groups, multi-select** — `selection` holds one id in practice; masks are per-layer only, no mask editing (paint on the mask to restore).
- **Background removal, upscaling, generative fill** — these need server-side models.
  The chat says so instead of pretending.
- **Overlay/darken/lighten blending** — needs shader compositing rather than fixed-function blending.
- **Persistence** — reload loses the document.

## Known limits

- `readPixels`/`toBlob` on the compositor relies on `preserveDrawingBuffer: true` (small perf cost).
- Blur is a single-pass 5×5 approximation; large radii get boxy. A separable two-pass version
  is the upgrade.
- Filter math is done in sRGB, not linear light. Fine visually, not colourimetrically correct.
- One 24 MP document will be slow — the texture cache holds full-resolution stages, and the
  wand's flood fill runs on the main thread (~10–40 ms on a large image).
- Masks are per-layer rasters; there is no way to paint a mask back in by hand yet
  (only 移除蒙版 to reset it).
