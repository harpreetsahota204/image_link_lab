# image_link_lab: design

Status: built and tested (stages 0 to 4). The optional link graph (stage 5) is not built. Author: Harpreet Sahota.

Plugin name: `@harpreetsahota/image_link_lab`. Operator URIs follow from it, for example `@harpreetsahota/image_link_lab/run_rule`.

## 1. What this is

A FiftyOne plugin that lets you **define which image-similarity signals to combine, apply that rule to a set of images, score it against known links, and explain every link it makes.**

It exists to show how far the FiftyOne plugin ecosystem (operators, delegated execution, brain indexes, panels, the execution store, server-sent events, JS components) can be composed into one real workflow. It is written for the digital-forensics community member, but contains no dataset-specific code.

All custom UI is built with VOODO (`@voxel51/voodo`), the FiftyOne design system, so the plugin looks and behaves like the rest of the App.

### The problem it answers

The community member's words: forensic tools are black boxes, "I can't define which combination of which algorithms, VLMs, ViTs should be applied", and they want to "plot the relationships between images in a graph with explainable edge-building."

The ViTHash paper they pointed to (De Geest et al., IEEE Consumer Electronics Magazine, 2026) gives the technical reason: ViTHash beats pHash, dHash and PDQHash on spatial edits (rotation, mirroring) but is less robust to quality edits (blur, compression). No single signal wins, so the useful tool is one where you choose the combination and see where it fails.

The demo data shows the same thing. On `disc21_link_lab`, pHash and PDQ catch 0% of horizontal flips while CLIP catches 53%; on blur the hashes catch about 27% and CLIP 3%. Combining them matches or beats the best single signal for every edit type.

### What it is not

- Not a reproduction of any paper's numbers. Dataset size is irrelevant to the goal.
- Not a forensic product. It runs offline on open-source FiftyOne and makes no claims about legal admissibility.
- Not a new similarity model. It composes models and hashes that already exist.

## 2. The user workflow

Four steps. Each maps to one FiftyOne building block.

| Step | What the user does | What they see | Building block |
|---|---|---|---|
| 1. Compute signals | Fills in the panel's "Compute signals" tab (or runs the `compute_signals` operator): hashes, an embedding model (CLIP by default), now or in the background | Live progress in the panel, then the new signals appear in the "Run rule" tab | Operator triggered from the panel, delegation, brain index, SSE |
| 2. Define a rule | Picks query and candidate images, toggles signals, sets thresholds, picks how to combine them | A form with a live rule summary, e.g. `OR(phash<=16, sig_clip>=0.80)` | Hybrid panel (Python logic, VOODO UI) |
| 3. Run and score | Clicks "Run rule" | Precision, recall, F1, and a recall grid of each signal against each group | Shared engine, run store |
| 4. Explain | Clicks a grid cell, or selects one sample | Missed images in the grid, or that sample's links with the evidence for each, including why a true link was missed | Panel events, grid view control |

Every run is saved per dataset. The run list lets the user load, clone into the form, rename and delete runs ("pHash only" against "pHash OR CLIP").

## 3. Plugin layout

```text
image_link_lab/
  fiftyone.yml
  __init__.py                 # register(): operators + panel
  constants.py                # store keys, defaults, RunStatus
  engine.py                   # FiftyOne glue: scopes, matrices, run_link_rule()
  run_manager.py              # run records in a dataset-scoped execution store
  operators/
    compute_signals.py        # step 1
    run_rule.py               # step 3 from the operator browser, MCP or scripts
    helpers.py                # unlisted grid helpers + SSE store notifier
  panels/
    link_lab.py               # panel state, events, evidence
  core/                       # pure functions, no FiftyOne imports
    signals.py                # hashes, Hamming and cosine matrices
    candidates.py             # top-k candidates per signal, union
    rules.py                  # thresholds, fusion, direction, one-parent pruning
    evaluate.py               # precision, recall, per-group grid
  tests/                      # pytest for core/
  requirements.txt
  js/
    package.json              # @voxel51/voodo, build tooling; no @fiftyone/* deps
    vite.config.ts            # @voxel51/fiftyone-js-plugin-build
    tsconfig.json
    src/
      index.tsx               # registerComponent("LinkLabView")
      LinkLabView.tsx         # root component, composes the sections below
      theme.ts                # injects VOODO's theme CSS once
      fiftyone.d.ts           # types for the @fiftyone/* globals the App provides
      types.ts
      utils.ts                # rule text, validation, run params, colours
      components/
        Section.tsx  Disclosure.tsx
        InputTabs.tsx         # "Compute signals" | "Run rule" tabs
        SignalsForm.tsx  RuleForm.tsx
        Results.tsx           # metric tiles + recall heatmap
        Evidence.tsx          # link table + "why was it missed"
        RunList.tsx           # status pills, load / clone / rename / delete
      hooks/
        usePanelClient.ts     # calls Python panel methods, awaits completion
        usePersistentState.ts # UI state that survives re-mounts
        useStoreSubscribe.ts  # SSE subscription to the run store
      __tests__/              # vitest
    dist/index.umd.js         # built bundle
  DESIGN.md
```

The `core/` split is deliberate. Rules and evaluation are plain functions on arrays and dicts, so they can be unit-tested without a running App and reused in a notebook. `engine.py` is the only module that turns FiftyOne views and indexes into those arrays, and both the `run_rule` operator and the panel call its `run_link_rule()`, so a run behaves the same from every entry point.

The panel is a hybrid, the architecture the plugin skill recommends for a grid panel with a rich UI. `link_lab.py` owns state and persistence. Its `render()` returns one `types.View(component="LinkLabView", composite_view=True, run_rule=self.run_rule, ...)`. The JS side calls those Python methods through `useTriggerPanelEvent()`, awaiting the callback so the "Run rule" button can show progress, and reads results from `ctx.panel.set_data(...)`.

**Build.** `cd js && yarn install && yarn build`. No FiftyOne source checkout is needed: `@voxel51/fiftyone-js-plugin-build` maps `@fiftyone/*` imports to globals the App provides at runtime, so `src/fiftyone.d.ts` only declares the few types the plugin uses. The build tool insists on a `FIFTYONE_DIR` variable but only reads it for private packages, so `vite.config.ts` defaults it. (The official `hybrid-panel` example links `@fiftyone/*` into a source checkout instead; recent checkouts use Yarn `catalog:` entries that a plugin's Yarn can't resolve.)

The panel is grid-only (`surfaces="grid"`). The skill warns that `composite_view=True` gives "Unsupported View" errors in the sample modal, so the evidence view follows the grid selection instead of living in the modal.

## 4. Data contract

The plugin must work on any dataset. It asks for two scopes and up to four optional fields.

| Setting | Required | Meaning | DISC21 value | Reddit value | Forensics example |
|---|---|---|---|---|---|
| Query images | Yes | Images to find links for: current view, whole dataset, or a tag | `Tag: final_query` | current view (one battle) | selected case |
| Match against | Yes | Candidate pool, same choices | `Tag: reference` | current view | whole dataset |
| ID field | No | Field holding a sample's identity, used to resolve the truth field | `disc21_id` | `node_id` style id | file hash |
| Truth field | No | Field holding the id of the known linked image. Enables scoring | `reference_id` | `parent_id` | none |
| Group field | No | Field (string or list) to break scores down by | `transform_names` | `battle_id` | evidence source |
| Time field | No | Datetime field. Earlier image is treated as parent | none | `posted_at` | EXIF time |

When no truth field is set, scoring and the grid are switched off. The panel still shows links and their evidence.

### Fields and stores the plugin writes

| Name | Type | Written by | Notes |
|---|---|---|---|
| `sig_phash`, `sig_dhash`, `sig_pdq` | string (hex) | `compute_signals` | one per chosen hash |
| brain index (`sig_clip` by default) | brain similarity run | `compute_signals` | any similarity index can be used as a signal, including ones built elsewhere |
| `links_<first 8 chars of run id>` | list of dicts | `run_link_rule()` | one entry per link, see section 6; deleted with its run |
| execution store `image_link_lab` | key-value, scoped to the dataset | engine, panel, `compute_signals` | `run:<uuid>` run records, `form:v1` last rule form, `signals:status` last signal change, `signals:progress` state, fraction and label of the current `compute_signals` run |

## 5. Operators

| Operator | Listed | Risk | Purpose |
|---|---|---|---|
| `compute_signals` | yes | medium | hashes + embedding index; generator, defaults to delegated |
| `run_rule` | yes | medium | apply a rule, write links, score; immediate or delegated |
| `open_misses_in_grid` | no | low | grid view of the queries one grid cell missed |
| `open_links_in_grid` | no | low | grid view of a query and everything it linked to |
| `link_lab_store_notifier` | no | low | `SseOperator` that streams run-store changes to open panels |

### `compute_signals`

- **Inputs:** target view; checkboxes for pHash, dHash, PDQ; an embedding model (default `clip-vit-base32-torch`) and index name (default `sig_clip`); batch size; "skip samples that already have hashes"; "rebuild the index".
- **Does:** opens each image once, computes every chosen hash and stores it as hex. Builds one brain similarity index with the chosen zoo model. Run it again with another model and index name to add more embedding signals (for example `open-clip-torch` or `dinov2-vits14-torch`).
- **Then:** writes `signals:status` to the store, which notifies open panels and invalidates cached matrices.
- **Panel parameters** (not in the operator form): `scope` picks the images instead of the view target, `delegate` forces background or immediate execution through `resolve_delegation()`, and `from_panel` reports progress only to the panel, via `signals:progress`, instead of the App's progress and output dialogs.

### `run_rule`

- **Inputs:** the settings in section 4, a toggle and threshold per available signal, the fusion mode, the weighted cutoff, `top_k`, direction toggles when a time field is set, and a run name. The form is dynamic, so it only shows thresholds for enabled signals.
- **Callable without the panel.** The same operator is reachable from the MCP server and from agents, so the workflow is scriptable.
- **Output:** run id, links field, link count, and precision, recall and F1 when a truth field is set.

### Run tracking

Modelled on the Similarity Search panel's `RunManager` (`plugins/panels/similarity_search/` in FiftyOne). A run record holds its name, status (pending, running, completed, failed), timestamps, the resolved rule and its text, scopes, fields, metrics, and two heavy fields left out of listings: the group matrix and the misses per grid cell. `run_link_rule()` sets running, then completed with results or failed with the error message.

## 6. Core logic

### Candidate generation

For each query image and each enabled signal, take the `top_k` nearest images in the candidate pool, never pairing an image with itself. The candidate set for a query is the union across signals. Hash distance is Hamming distance over the stored hex hashes. Embedding similarity is cosine similarity over embeddings read from the brain index. Matrices are dense, capped at 50 million pairs, and cached per signal so threshold changes don't recompute them.

### Rule

A candidate pair becomes a link if the rule fires:

- **OR:** any enabled signal passes its threshold.
- **AND:** every enabled signal passes its threshold.
- **Weighted:** the weighted mean of normalized scores passes a cutoff. Hashes normalize to `1 - distance / bits`, embeddings to cosine clipped to `[0, 1]`. Each signal has a weight (default 1).

Optional post-steps:

- **Direction:** if a time field is set, the earlier image is the parent and the link is directed.
- **One parent per image:** requires direction. Keep only the highest-scoring parent link per image.

### Link record

Every link stores its own evidence, so nothing is a black box:

```python
{
    "target_id": "R000123",           # value of the ID field
    "signals": {"phash": 11, "sig_clip": 0.86},   # raw values per signal
    "passed": ["phash", "sig_clip"],  # signals that passed their threshold
    "fused": 0.74,
    "rule": "OR(phash<=16, sig_clip>=0.80)",
    "direction": "undirected",        # or "parent" / "child"
    "sample_id": "6abe...",           # the linked sample, for navigation
}
```

### Evaluation (only when a truth field is set)

- A link is correct if its target is the query's truth value, or the target's truth value is the query (so a parent-to-child link counts on trees like Reddit).
- A query with no truth value (a distractor) counts every link it makes as wrong.
- Reported: link precision, recall, F1, overall and per group.
- **Signal-by-group grid:** each enabled signal on its own, plus the combined rule, against each group value. The cell is recall. When the group field is a list, a query counts in each of its values. Without a group field there is one `all` group.

## 7. The panel (hybrid: Python logic, VOODO UI)

### Layout, top to bottom

1. **Inputs.** One card with two VOODO `ToggleSwitch` tabs. It opens on "Run rule" when signals exist and on "Compute signals" otherwise; cloning a run switches to "Run rule".
   - **1. Compute signals:** what's computed so far, which images to process, hash checkboxes with one-line descriptions, the embedding index (model picker over the zoo's 101 embedding models, an index name suggested from the model, batch size), an "Advanced" section (skip existing, rebuild index, run in the background), live progress or the error, and "Compute signals".
   - **2. Run rule:** query and candidate pickers, one row per signal (toggle, kind, threshold slider, plain-language threshold, weight slider when weighted), fusion radio group and cutoff, an open "Fields" section, a collapsed "Advanced" section (`top_k`, direction toggles with tooltips explaining why they're disabled, run name), the live rule text, validation errors and "Run rule". Without signals it shows an `EmptyState` pointing to the first tab.
3. **Results.** Precision, recall, F1, links and pair-count tiles, then the recall heatmap: groups as rows sorted by number of true links, signals as columns, your rule last. Clicking a cell loads that cell's misses into the grid.
4. **Why this link?** For one selected sample: its thumbnail, a table of its links with each signal's value (green when it passed) and a correct/wrong verdict, plus the true link if it was missed, with each signal's value against its threshold.
5. **Runs.** Every run with status, precision, recall, F1 and link count. Clicking a row loads it; the row menu clones it into the form, renames it or deletes it (after a confirmation) together with its links field.

### VOODO notes

Every control is a VOODO component using VOODO tokens. VOODO 2.1.0 is bundled with the plugin, because the App doesn't share VOODO with plugins (it isn't in `externalize.ts`), and `theme.ts` injects its theme CSS once. The App's own styling is unaffected. The published VOODO LLM reference lags 2.1.0 on some colour token names (for example `StatusColor.ApprovedBg`, `TextColor.Foreground`, `TextColor.Failure`). VOODO has no chart component, so the heatmap is a small table of coloured cells.

### Events

| Event | Handler |
|---|---|
| Panel loads | Load signals, scope and field options, runs, the last form, and the last loaded run |
| Grid selection changes | Rebuild the evidence for the single selected sample |
| Run rule | `run_rule` saves the form, calls `run_link_rule()`, refreshes runs and loads the new run |
| Heatmap cell click | `open_misses` sets the grid view to that cell's misses |
| Compute signals | `compute_signals` triggers the operator with `scope`, `delegate` and `from_panel` |
| Run store changes (SSE) | Show `signals:progress` values directly; refresh signals and options on `signals:status`; refresh runs otherwise |

The App's `useExecutionStoreSubscribe` hook lives in `@fiftyone/core`, which plugins can't import, so `useStoreSubscribe.ts` is a trimmed port that uses the shared `getEventSource` and the `/operators/subscribe-execution-store` endpoint.

### State

`ctx.panel.state` holds only the loaded run id. `ctx.panel.set_data` holds everything Python sends: signals, options, zoo models, signal progress, the saved form, clones (tagged with a one-time `nonce`), runs, the loaded run and the evidence. Python panel events can read state but not data, so forms travel with their calls as parameters.

UI state (the selected tab and both forms) lives in `usePersistentState`, a small per-panel store in the plugin bundle. React state is lost when the App re-mounts panel content on layout changes, and the App's local panel state is replaced whenever Python sends data, so neither works for it.

## 8. Staging

| Stage | Work | Status |
|---|---|---|
| 0. Pre-checks | Env and database check, demo dataset, plugin symlink, JS toolchain and VOODO proven inside the App | done |
| 1. Core | `core/` with pytest | done (36 tests) |
| 2. Operators | `compute_signals`, `run_rule`, helpers, run manager, SSE notifier | done |
| 3a. JS scaffold | build to `dist/`, one VOODO component rendered from Python | done |
| 3b. Panel | tabbed inputs (compute signals, run rule), results, heatmap, evidence, run list, live refresh | done (17 vitest tests) |
| 4. Evaluate | `fiftyone-eval-plugin` checklist, fixes applied | done |
| 5. Link graph (optional) | Cytoscape graph in the evidence section | not started |

Not built: an `init_link_run` operator that would show a delegated run as pending the moment it's queued. Panel runs execute immediately (about 1 second on the demo), and delegated runs started from the operator browser create their own record when they start.

### Demo dataset

`disc21_link_lab` is a persistent clone of `disc21` with 6,000 samples: the 500 final queries whose reference is on disk, 500 distractor final queries, and 5,000 references including all 500 true ones. It keeps the plugin's field writes off the 200,000-sample source. `compute_signals` (pHash, PDQ, CLIP) takes about 3 minutes on it.

## 9. Testing

- **Unit tests (pytest):** `core/` on synthetic data. Run `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests` in the `fiftyone` env; an unrelated `torchtyping` pytest plugin there crashes on load otherwise.
- **Unit tests (vitest):** `js/src/utils.ts`: rule text, validation, run parameters, signal merging, colours. `cd js && yarn test`.
- **Integration:** `compute_signals` and `run_rule` run headless through `foo.execute_operator` on `disc21_link_lab`.
- **Detection and schemas:** through the FiftyOne MCP tools, `list_operators` shows all entries and `get_operator_schema` matches section 5.
- **In the App:** load a run, click a heatmap cell, select a sample, clone a run and run it, rename and delete a run, and start a run from another process to see the list refresh live.

## 10. What the blog shows

1. The problem in the member's own words, and the paper's finding that no single signal wins.
2. Install the plugin. Run `compute_signals` in the background.
3. Run pHash alone, then CLIP alone. Read the grid to see where each fails (flips versus blur).
4. Combine them with OR and watch recall rise (25% to 41%); switch to AND and watch precision rise instead (97% for PDQ AND CLIP).
5. Select a missed query and read why: every signal's value against its threshold.
6. Point the same plugin at a second dataset by changing only the field pickers.
7. Where to extend: add your own signal (any similarity index), add a metadata signal, add the graph view.

## 11. Open questions

- **Delegated execution.** Needs an orchestrator running (`fiftyone delegated launch`). The blog should say so.
- **Metadata signals.** v1 uses the time field only for direction. Matching on a field such as camera model is a natural v1.1.
- **Scale.** Dense matrices cap out at 50 million pairs. Larger pools would need the brain index's approximate search for candidates.
- **Operator dialogs.** In the panel both forms are VOODO. Opened from the operator browser or an agent, `compute_signals` and `run_rule` still use the App's built-in operator form.
- **SSCD.** The model trained on DISC21 is not in the zoo. It could be added later as a remote zoo source.

## 12. Out of scope

Training models, a custom graph database, case management, report export, and anything that handles real forensic evidence.
