# Video Editor — Capability & Behaviour Reference

This document captures **what every capability in the chat-driven video editor actually does**,
whether it is **deterministic (FFmpeg, no AI)**, **generative (Google AI)**, or **analysis-assisted**
(uses real signal extraction / speech-to-text but renders deterministically), and how each one
behaves on the happy path and on failure.

It reflects the actual code in `server/features/video-editor/services/`, primarily:
- `chat-video-edit.service.ts` — the turn orchestrator
- `deterministic-editor.service.ts` — the FFmpeg engine (no AI, ever)
- `generative-video.service.ts` — Google Veo (generate) + Gemini Omni Flash (edit)
- `edit-localization.service.ts` + `localization-window.logic.ts` — the localization pre-pass
- `highlight-selection.logic.ts`, `auto-cut.logic.ts`, `edit-range.logic.ts` — pure decision cores

> **Golden rule across the whole system — No-Mock (Req 23):** a real artifact is produced ONLY when a
> real render/model actually returned bytes. Every failure degrades **honestly** (skip / clarify /
> needs_async / whole-clip fallback). Nothing is ever fabricated.

---

## 1. Classification of every capability

| Capability | Engine | Uses AI? | What it produces |
|---|---|---|---|
| **Trim / Cut** | Deterministic (FFmpeg) | No | Frame-exact cut of a range |
| **Aspect / Resize (reframe)** | Deterministic (FFmpeg) | No | Scaled + padded/cropped frame |
| **Speed** | Deterministic (FFmpeg) | No | Re-timed video + audio (atempo) |
| **Fades** | Deterministic (FFmpeg) | No | Fade in/out on video + audio |
| **Filter / Colour grade** | Deterministic (FFmpeg) | No | Named look (cinematic/warm/cool/vivid/bw/vintage) |
| **Audio normalize** | Deterministic (FFmpeg) | No | Loudness-normalized audio (video copied) |
| **Concat / Multi-clip assembly** | Deterministic (FFmpeg) | No | One stitched video from N clips |
| **Auto-cut (beat montage)** | Deterministic render **+ audio analysis** | No (DSP only) | Beat-synced montage |
| **Highlight ("editorial brain")** | Deterministic render **+ audio analysis + speech transcription** | Speech-to-text only (no generative video) | Tightened highlight reel |
| **Captions (burn-in)** | Deterministic render **+ speech transcription** | Speech-to-text only | Animated captions burned onto video |
| **Silence removal** | Deterministic render **+ audio analysis** | No | Speech kept, silence dropped |
| **Object removal** | **Generative** (Gemini Omni Flash) | Yes | AI-edited video |
| **Background replace** | **Generative** (Gemini Omni Flash) | Yes | AI-edited video |
| **Generative edit** | **Generative** (Gemini Omni Flash) | Yes | AI-edited video |
| **Generate / Generate b-roll** | **Generative** (Google Veo) | Yes | Brand-new AI-generated clip |
| **Localization pre-pass** | Analysis (frame sample + cheap Gemini vision) → feeds generative | Yes (cheap vision model) | Time windows for where an edit applies |
| **Reel polish (one-shot)** | Deterministic chain | No | Curated multi-step deterministic edit |

**Key takeaway on your question about the editorial brain:** the **highlight** capability is
**deterministic at render time** — it never sends video to a generative model. Its "intelligence"
comes from **real analysis** (audio energy envelope + real speech transcription) scored by a **pure,
deterministic algorithm**, and the final cut is rendered by the deterministic engine's `auto_cut` op.
So it is best described as *analysis-assisted deterministic editing*, not a generative edit.

---

## 2. The turn pipeline (order of operations)

Every chat edit runs through `runChatVideoEditTurn`:

1. **Resolve source** — newest analyzed source for the project (or a named one). No source → `error`.
2. **Intent_Router** — classifies the message into a `VideoIntent`. Uses an LLM with a **deterministic
   video-editor fallback**, so a clear instruction always yields executable operations instead of a
   dead-end clarification. A one-shot "reel polish" request is detected purely from the message.
3. **Version** — a new immutable version is created for the refinement (versioned edit history).
4. **Editing_Planner** — turns the intent into a structured plan of operations, each tagged
   `deterministic` | `generative` | `analysis` | `render` and `executable` or not.
5. **Execute a CHAINED edit** — each step runs on the previous step's output artifact, in this fixed
   order so the result is coherent:
   1. **Assembly (concat)** — pre-step, stitch clips first
   2. **Pixel/timeline deterministic ops** — filter, aspect, trim, speed, fades, audio normalize
      (de-duplicated by kind so the video is never re-encoded twice for the same effect)
   3. **Highlight** — analysis pre-pass, then deterministic render (runs before captions)
   4. **Auto-cut** — analysis pre-pass, then deterministic render (skipped if highlight already ran)
   5. **Generative ops** — Omni edit / Veo generate (runs before captions)
   6. **Captions** — always LAST so captions sit on top of the final look

Progress is streamed as stage-derived percentages (never timer-interpolated).

---

## 3. Outcomes (what the turn can return)

| Outcome | Meaning |
|---|---|
| `rendered` | At least one step produced a final artifact; returns versionId + artifactId + summary |
| `clarification` | The turn needs more input (e.g. "which edit?", "no speech to caption") |
| `needs_async` | The edit requires the background pipeline / AI generation with a credit estimate |
| `no_op` | Nothing executable could be derived from the instruction |
| `error` | A real failure occurred (credits are not charged) |

**Non-fatal skips:** when one step in a chain can't run (e.g. no speech for captions) but another step
already produced an artifact, the failing step is **skipped with an honest note** appended to the
summary, rather than failing the whole turn.

---

## 4. Deterministic operations (FFmpeg engine — never calls AI)

The `Deterministic_Editor` imports only `fluent-ffmpeg`, storage, and the artifact repository. It
generates a **fully-specified, reproducible FFmpeg command** per operation (fixed encoder settings:
`libx264`, `preset medium`, `crf 18`, `yuv420p`). Cost is always **0 credits**, provenance is the
`ffmpeg` engine id. On failure it records an error code, marks the job failed, and produces **no
artifact**.

### Trim / Cut
- Frame-exact cut of `[startMs, endMs)` via output-side `-ss`/`-to`. Audio re-encoded (AAC) to keep sync.

### Aspect / Resize (reframe)
- Scales to a target box, then **pads** (letterbox, default) or **crops** to the exact dimensions.
- Dimensions come from export profiles (9:16 → 1080×1920, 16:9 → 1920×1080, 1:1 → 1080×1080, 4:5 → 1080×1350).

### Speed
- Video PTS scaled by `1/factor`; audio retimed with a chained `atempo` filter (kept within FFmpeg's
  0.5–2.0 range). Explicit factors parsed from the message ("2x", "half", "slow-mo").

### Fades
- Fade in and/or out over given durations on both video (`fade`) and audio (`afade`). Default 500 ms each.

### Filter / Colour grade
- One of a **closed set of named looks**, each a fixed FFmpeg filter chain (audio untouched):
  `cinematic` (default), `warm`, `cool`, `vivid`, `bw`, `vintage`. The look is chosen from the message
  wording. Every filter used ships in the standard `ffmpeg-static` build.

### Audio normalize
- Loudness normalization to the configured LUFS target with a true-peak ceiling. Video stream copied
  verbatim; only audio re-encoded.

### Concat / Multi-clip assembly
- Stitches **all usable analyzed sources** (oldest → newest) into ONE video, each letterboxed to a
  target box. Requires **2+ clips**; with fewer it degrades honestly (clarify if concat is the only
  op, else skip and continue with the single clip). Runs first so the rest of the chain operates on
  the assembled result. Effective duration becomes the SUM of stitched clip durations.

---

## 5. Analysis-assisted deterministic operations

These render deterministically but require a **real analysis pre-pass**. They never use a generative
video model.

### Auto-cut (beat-synced montage)
- **Pre-pass:** extract the real audio energy envelope (RMS windows over decoded PCM).
- **Decision (pure):** `computeAutoCutSegments` derives a peak threshold from the envelope's own
  dynamics (`mean + k·stddev`), detects rising onsets, caps to the strongest boundaries, and tiles the
  timeline into contiguous keep-segments.
- **Render:** the deterministic `auto_cut` op (select/aselect filtergraph); optional subtle centred
  "punch-in" zoom via `crop` when the message asks for zoom/dynamic.
- **No-Mock:** no audio or no distinct beats → skipped honestly (or a clarification if it's the only op).
  Never fabricates cut points.

### Highlight ("editorial brain")
- **Pre-pass:** real audio energy envelope **AND** real speech spans from the transcription service.
- **Decision (pure):** `computeHighlightSegments` tiles the timeline, scores each window as
  *normalized energy + speech bonus* (windows that are both loud and spoken score highest), greedily
  grows keep-spans around the top windows up to a target duration, merges/sorts them **chronologically**
  (v1 never reorders shots).
- **Target duration:** parsed from the message ("30 seconds", "one minute") or intent, else default 30 s,
  always clamped to the clip length.
- **Render:** reuses the deterministic `auto_cut` op — **no new render engine, no generative model**.
- **No-Mock:** if the clip is already short enough, or there's no usable signal (flat envelope AND no
  speech), it returns the honest whole clip. As the only op with no signal → honest `no_op`/clarification.
- Highlight and auto-cut are **mutually redundant** (both produce a tightened cut); when both are
  planned, highlight runs and auto-cut is skipped.

### Captions (burn-in)
- **Pre-pass:** real speech-to-text transcription of the current chained video.
- **Render:** deterministic animated word-level caption burn-in (ASS + libass, with a static drawtext
  fallback when libass is unavailable — captions are never silently dropped). Style preset chosen from
  the message (`bold_pop` default, `karaoke_box`, `clean_minimal`); placement preset from platform/aspect.
- Always the LAST step so captions sit on top of the final graded/edited frames.
- **No-Mock:** transcription failure or no speech → captions skipped (honest note), unless captions are
  the only op (then `error` on hard failure, `clarification` on no speech). Never fabricates captions.

### Silence removal
- Deterministic `silence_removal` op (keep-ranges are the complement of analysis-classified silence,
  validated to not cut speech). **Note:** in the current chat driver this maps to *needs an audio
  analysis pass* and is surfaced as `needs_async` rather than executed inline.

---

## 6. Generative operations (Google AI — costs credits, No-Mock)

Run **inline only when a Google key is configured** (`isGenerativeVideoConfigured()`); otherwise they
degrade to the honest `needs_async` behaviour. A real artifact is advanced **only when Google actually
returns video bytes**.

### Generate / Generate b-roll → **Veo** (`generateVideo`)
- Produces a **brand-new clip** from a text prompt (aspect ratio + duration from intent). Polls the Veo
  operation until done. Safety-filtered / timeout / no-video → honest degrade, no artifact.

### Object removal / Background replace / Generative edit → **Gemini Omni Flash** (`editVideo`)
- **Edits the current chained artifact.** How the edit is scoped depends on the instruction:

  **(a) Explicit time range** (e.g. "remove the guy from 0:05 to 0:10")
  - `parseEditRange` → `segment`. Cut ONLY that segment (deterministic trim) → send just that segment to
    Omni → splice `[head, edited, tail]` back with the deterministic assembly concat. Cost/latency scale
    with the edited portion; the rest stays visually original. Label: `AI edit (0:05–0:10)`.

  **(b) Global edit / no explicit range** → **the localization pre-pass runs here** (see §7).
  - Localizer returns **windows** → per-window `trim → editVideo(Omni) → splice` back into one timeline.
    Label: `AI edit (localized: <k> window(s): <ranges>)`.
  - Localizer returns **whole-clip** → the original behaviour, byte-for-byte: send the WHOLE artifact to
    Omni in a single edit.
  - **No-Mock:** if any window's edit doesn't return `rendered`, the splice is abandoned and it falls
    back to a single whole-clip edit with an honest note. A partial/fabricated splice is never produced.

---

## 7. Localization pre-pass (the newly added feature)

Runs in exactly ONE place: the **edit-type generative + no-explicit-range** branch. It makes a global
AI edit cheaper by finding *where* the edit applies so only those regions pass through Omni.

**Flow (`EditLocalizationService.localize`):**
1. **Frame_Sampler** — download the current artifact, run FFmpeg to sample low-res JPEG frames
   (`fps=<sampleFps>,scale=-2:<frameHeight>`, `-q:v 4`, `image2`).
2. **Vision_Localizer** — send the frames + instruction to a **cheap Gemini vision model** and parse a
   strict `{ "ranges": [{ startMs, endMs, confidence }] }` response.
3. **Window_Resolver** (pure `resolveLocalizationWindows`) — sanitize / clamp / merge / cap the candidate
   ranges into ≤N clean, sorted, non-overlapping windows, or signal whole-clip.

**Always degrades to whole-clip (never throws, never fabricates a window)** on: source download failure,
FFmpeg failure, zero frames, vision call throwing, empty/text-only/malformed/missing-`ranges` response,
`{ "ranges": [] }`, all-below-confidence candidates, or when merged windows cover ~the whole clip.

**Guarantees of the pure resolver (property-tested, 200 runs each):** clamping to `[0, duration]`,
minimum window length, ≤maxWindows cap, ascending order, non-overlap, merge idempotence, whole-clip
promotion, never-empty-when-segment, no fabrication, and determinism/totality.

**Config (env vars, all with safe defaults):**

| Env var | Default | Purpose |
|---|---|---|
| `GEMINI_LOCALIZER_MODEL` | `gemini-2.5-flash` | Cheap vision model id |
| `LOCALIZER_SAMPLE_FPS` | `1` | Frame sampling rate |
| `LOCALIZER_FRAME_HEIGHT` | `360` | Downscaled frame height |
| `LOCALIZER_MAX_WINDOWS` | `3` | Max localized windows |
| `LOCALIZER_MIN_CONFIDENCE` | `0.3` | Confidence floor for candidates |

---

## 8. Reel polish (one-shot)

A single instruction like "make this a reel" / "premium reel" expands into a curated, tasteful chain of
**deterministic** edits (grade → reframe 9:16 → normalize audio → fades → beat-cut → animated captions).
Detected purely from the message, so it works even when the LLM couldn't classify a concrete edit. Each
step still degrades honestly downstream.

---

## 9. Explicit-range vs global routing (quick reference)

| Instruction example | Route | Localizer runs? |
|---|---|---|
| "remove the guy **from 0:05 to 0:10**" | Segment-scoped (explicit range) | No — bypassed |
| "remove the person in the background" (no range) | Global → localization pre-pass | Yes |
| "restyle the **whole** video" | Global → localization → likely whole-clip | Yes (then whole-clip) |
| "reframe to 9:16" | Deterministic pixel op | No (not generative) |
| "make the best 30-second highlight" | Analysis + deterministic render | No (not generative) |

---

## 10. Debug trace file (per-run capture)

Every chat-driven edit turn can record **exactly what it did** to a JSONL file, so you can inspect a
run after the fact instead of watching the fast streaming console.

**Enable it** (off by default, zero overhead when off):

```bash
VIDEO_EDITOR_DEBUG=true          # write the trace
VIDEO_EDITOR_DEBUG_TEXT=true     # also store a truncated copy of the instruction (optional, privacy)
```

**Where:** `logs/video-editor-debug.jsonl` — one JSON object per line. Every line for a single edit run
shares a `traceId`, plus a monotonic `seq` and elapsed `ms`, so a run is reconstructed by filtering on
the id. Recording **never throws** and **never affects the edit**.

**Stages captured per run:**

| `stage` | What it captures |
|---|---|
| `turn.start` | project/workspace/user ids, sourceId, (optional) instruction preview + length |
| `source` | resolved source id, duration, storage key, file name (or `error` if none) |
| `intent` | classification status, reel-polish flag, resolved action / aspect / duration / platform |
| `plan` | versionId + every planned operation (kind/type/status) and the operation count |
| `exec.plan` | what will actually run: assembly?, mapped pixel ops, caption/autocut/highlight flags, generative kinds, effective duration |
| `exec.assembly` | deterministic stitch — clip count + target dims + artifactId |
| `exec.pixel` | each deterministic pixel/timeline op — planKind → mapped ffmpeg op + artifactId |
| `exec.highlight` | editorial brain — `usesGenerative:false`, whether an energy envelope / speech spans were available, target duration, selected segment count |
| `exec.autocut` | beat analysis — envelope present?, segment count, whether real cuts were found |
| `exec.scope` | how the edit was scoped — `mode` (`segment` vs `global`), the explicit `range` if any, and `localizerWillRun` |
| `exec.segment` | explicit-range path — the exact `startMs`/`endMs`/`segmentMs` being cut and sent to the model, `coversWholeClip` |
| `exec.segment.splice` | explicit-range path — whether the edited segment was spliced back (`spliced`, `pieces`, `hasHead`, `hasTail`) |
| `exec.localize` | global path — localization decision: `whole-clip` vs the exact `windows` array (each `startMs`/`endMs`) |
| `exec.generative` | each generative op — engine (`veo`/`gemini-omni-flash`), `usesGenerative:true`, kind, provider outcome, label, artifactId |
| `exec.captions` | transcription result — hardFailure / noSpeech / cue count |
| `turn.end` | final outcome, final artifact/version, applied labels, honest skip notes, total elapsed ms |

**Example (one run, abbreviated):**

```json
{"ts":"2026-08-18T…","traceId":"vedit-abc","seq":1,"ms":0,"stage":"turn.start","projectId":"p1", …}
{"ts":"…","traceId":"vedit-abc","seq":2,"ms":40,"stage":"source","resolvedSourceId":"src-1","durationMs":30000, …}
{"ts":"…","traceId":"vedit-abc","seq":3,"ms":610,"stage":"intent","routeStatus":"classified","reelPolish":false, …}
{"ts":"…","traceId":"vedit-abc","seq":4,"ms":1400,"stage":"plan","operationCount":1,"operations":[{"kind":"object_removal","type":"generative","status":"executable"}]}
{"ts":"…","traceId":"vedit-abc","seq":5,"ms":1600,"stage":"exec.plan","runGenerative":true,"generativeKinds":["object_removal"], …}
{"ts":"…","traceId":"vedit-abc","seq":6,"ms":4200,"stage":"exec.localize","kind":"windows","windows":[{"startMs":5000,"endMs":10000}]}
{"ts":"…","traceId":"vedit-abc","seq":7,"ms":9100,"stage":"exec.generative","engine":"gemini-omni-flash","usesGenerative":true,"kind":"object_removal","outcome":"rendered","artifactId":"edited-seg-1"}
{"ts":"…","traceId":"vedit-abc","seq":8,"ms":12800,"stage":"turn.end","outcome":"rendered","finalKind":"object_removal","appliedLabels":["AI edit (localized: 1 window(s): 0:05–0:10)"],"totalMs":12800}
```

**Verifying whole-clip vs segment scoping** (the key thing to confirm both paths work):

- **Explicit range** (`"remove the guy from 0:05 to 0:10"`) → you'll see
  `exec.scope` with `mode:"segment"`, `range:{startMs:5000,endMs:10000}`, `localizerWillRun:false`,
  then `exec.segment` with the exact cut, then `exec.segment.splice` showing `spliced:true`.
- **Global, localizer finds regions** (`"remove the person in the background"`) → `exec.scope` with
  `mode:"global"`, `localizerWillRun:true`, then `exec.localize` with `kind:"windows"` and the
  `windows` array.
- **Global, whole-clip fallback** → `exec.scope` `mode:"global"` then `exec.localize` with
  `kind:"whole-clip"` (the whole clip is sent to the model unchanged).

```bash
# just the scoping decisions for a run
jq -c 'select(.stage|test("exec.scope|exec.segment|exec.localize")) | {seq,stage,mode,range,kind,windows,spliced}' logs/video-editor-debug.jsonl
```

**Reading it quickly:**

```bash
# pretty-print the last run
tail -20 logs/video-editor-debug.jsonl | jq .

# all lines for one run
grep '"traceId":"vedit-abc"' logs/video-editor-debug.jsonl | jq -c '{seq,stage,outcome,kind}'

# just the decisions that matter (deterministic vs generative, localization)
jq -c 'select(.stage|test("exec.")) | {stage,engine,usesGenerative,kind,outcome}' logs/video-editor-debug.jsonl
```

Implemented by `server/features/video-editor/services/video-editor-debug.ts` (recorder) and wired into
`chat-video-edit.service.ts` (`runChatVideoEditTurn`).

---

## 11. Verification status

- All new/related tests pass together: **39 tests across 4 files** (resolver property tests at 200 runs
  each, resolver-model unit tests, localization-service unit tests with injected fakes, and chat-wiring
  tests). Type-check is clean across the four touched source files.
- Tests use injected fakes (no real FFmpeg spawn, no real Google API calls). A true live run against a
  real clip + configured `GEMINI_LOCALIZER_MODEL` key has not been exercised in CI.
