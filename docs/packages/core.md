# @emory/core

Face detection and recognition engine using ONNX Runtime. Provides SCRFD detection and ArcFace embedding extraction.

## Overview

This package contains the core face processing logic that runs in Electron's main process. It wraps two ONNX models — SCRFD for face detection and ArcFace for face embedding extraction — and provides face matching against a database of known embeddings.

## Architecture

```
packages/core/src/
├── index.ts                          # Barrel exports
├── types/
│   └── face.ts                       # Domain types for face processing
└── services/
    ├── face.service.ts               # SCRFD + ArcFace ONNX inference
    ├── quality.service.ts            # Frame & face quality assessment
    ├── liveness.service.ts           # Anti-spoofing: texture, motion, depth heuristics
    ├── appearance.service.ts         # Embedding clustering + appearance shift detection
    ├── embedding-validator.service.ts # Embedding sanity checks (512-dim ArcFace templates)
    ├── graded-identity.service.ts    # Confidence tier for identity announcements
    └── model-downloader.service.ts   # ONNX model download utility
```

### Exports

| Export | Type | Description |
|---|---|---|
| `FaceService` | class | Main service — model loading, detection, embedding extraction, matching |
| `ModelLoadError` | class | Error thrown when an ONNX model fails to load |
| `Point` | type | `{ x, y }` coordinate |
| `BoundingBox` | type | `{ x, y, width, height }` rectangle |
| `FaceLandmarks` | type | Five facial landmarks (eyes, nose, mouth corners) |
| `FaceDetection` | type | Detected face with bbox, landmarks, and confidence score |
| `FaceMatch` | type | Matched face with `personId`, `personName`, `similarity`, **`matchMargin`**, `bbox`, `landmarks` |
| `FaceProcessingResult` | type | Full frame result: detections, matches, unknown faces, timing |
| `KnownFaceEntry` | type | Known person entry for matching (personId, personName, embedding) |
| `AutoLearnResult` | type | Outcome of persisting an auto-learned embedding (`learned`, `personId`, `reason`) |
| `QualityService` | class | Frame quality assessment — blur, brightness, face pose, overall score |
| `FrameQualityResult` | type | Quality metrics returned by `QualityService.assessFrameQuality` |
| `validateEmbedding` | function | Validates a `Float32Array` embedding for NaN, norm, variance, diversity |
| `EmbeddingValidationResult` | type | Validation outcome with `valid`, `qualityScore`, and `issues` |
| `gradeIdentity` | function | Maps similarity, margin, and votes to an announcement tier (see below) |
| `GradedIdentityResult` | type | `{ grade, announcement, showInOverlay }` — `grade` is `IdentityGrade` (exported from this module; same union as in `@emory/db`) |
| `LivenessService` | class | `assessLiveness` — texture / landmark motion / focus heuristics; returns `LivenessResult` |
| `AppearanceService` | class | `clusterEmbeddings`, `detectAppearanceShift`, centroid helpers for drift workflows |

`FaceService` also exposes **`static cosineSimilarity(a, b)`** for comparing two embedding vectors (used by the desktop main process when validating diversity before insert).

### Lifecycle and cleanup

- **`isInitialized()`** — Returns `true` when both SCRFD and ArcFace ONNX sessions are loaded.
- **`dispose()`** — Releases both `InferenceSession` instances via `release()`, clears internal references, and logs disposal. Call on app shutdown so native ONNX resources are freed (see `docs/apps/desktop.md`).

## Usage

```typescript
import { FaceService } from '@emory/core'
import type { FaceDetection, KnownFaceEntry } from '@emory/core'

const service = new FaceService('/path/to/models')
await service.initialize()

const detections = await service.detectFaces(imageBuffer, width, height, 4, 0.35)
const embedding = await service.extractEmbedding(imageBuffer, width, height, detections[0])

const match = service.findBestMatch(embedding, knownEntries, 0.45)
```

### Default match threshold

`FaceService` uses **`DEFAULT_MATCH_THRESHOLD = 0.45`** (raised from `0.4`). Callers should align UI defaults and `findBestMatch` / `findTopMatches` thresholds with this unless they intentionally override (e.g. user slider).

### `detectFaces`

`detectFaces(imageBuffer, width, height, channels?, detectionThreshold?)` runs SCRFD inference and returns an array of `FaceDetection`. The optional `detectionThreshold` (default `0.35`) controls the minimum confidence score for accepting a detection anchor.

### `findBestMatch`

`findBestMatch(embedding, knownEntries, threshold)` compares the probe embedding against known entries, applies **`threshold`** to the winning score, and returns a `FaceMatch` or `null`. The service default for **`threshold`** is **`0.45`** (`DEFAULT_MATCH_THRESHOLD`).

- **Per-person best similarity:** `knownEmbeddings` is a flat list of `KnownFaceEntry` rows; multiple rows may share the same `personId`. The implementation aggregates by **person** (each person’s best cosine similarity to the probe), then picks the top person as the match.
- **`matchMargin`:** After aggregation, `matchMargin` is the difference between the best person’s similarity and the **second-best distinct person’s** similarity when at least two people are present; if only one person exists in the gallery, `matchMargin` is set to that best similarity (no runner-up gap).

### `findTopMatches`

`findTopMatches(embedding, knownEmbeddings, topN?, threshold?)` uses the same per-person aggregation as `findBestMatch` (best cosine similarity per `personId`), keeps matches at or above **`threshold`**, sorts by similarity descending, and returns up to **`topN`** entries as `{ personId, personName, similarity }`. Use when you need ranked candidates without `matchMargin` or bbox/landmarks.

### Auto-learn result shape

Consumed by Electron IPC `face:auto-learn` (see `docs/apps/desktop.md`):

```typescript
export type AutoLearnResult = {
  learned: boolean
  personId: string
  reason:
    | 'stored'
    | 'too_similar'
    | 'cooldown'
    | 'max_reached'
    | 'replaced_oldest'
    | 'error'
}
```

## Quality Assessment

`QualityService` evaluates whether a detected face frame is suitable for embedding extraction. It computes blur (Laplacian variance), brightness, face-to-frame ratio, and estimated head pose from landmarks.

```typescript
import { QualityService } from '@emory/core'

const quality = new QualityService()
const result = await quality.assessFrameQuality(buffer, width, height, faceBbox, landmarks)

if (!quality.isAcceptable(result)) {
  console.log('Rejected:', result.reasons) // e.g. ['blurry', 'extreme_yaw']
}
```

Thresholds are configurable via the constructor (`minBlurScore`, `minBrightness`, `maxBrightness`, `minFaceRatio`, `maxYaw`, `maxPitch`).

## Graded identity announcements

`gradeIdentity` decides how strongly to verbalize a match: **definite** (high similarity, margin, and vote count), **probable**, **uncertain** (overlay only, no scripted line), or **silent** (no overlay). Optional `thresholds` merge with defaults. `IdentityGrade` is exported from `@emory/core` (`graded-identity.service.ts`) and duplicated in `@emory/db` for domain types that reference grades without depending on core.

```typescript
import { gradeIdentity } from '@emory/core'

const { grade, announcement, showInOverlay } = gradeIdentity(
  similarity,
  matchMargin,
  voteCount,
  personName,
  relationship,
)
```

## Embedding Validation

`validateEmbedding` performs sanity checks on a **512**-dimensional `Float32Array` embedding (ArcFace template size) before it is persisted or compared. Checks include length, NaN/Infinity, L2 norm range, variance, value diversity, and all-zeros.

```typescript
import { validateEmbedding } from '@emory/core'

const result = validateEmbedding(embedding)
if (!result.valid) {
  console.log('Embedding rejected:', result.issues)
}
```

The desktop app’s `face:auto-learn` IPC handler calls `validateEmbedding` before diversity checks and skips persistence when `valid` is false or `qualityScore` is below **0.5** (see `docs/apps/desktop.md`).

## Models

Both model files must exist in the `modelsDir` path:

| Model | File | Purpose | Input Size |
|---|---|---|---|
| SCRFD | `det_10g.onnx` | Face detection + landmarks | 640x640 |
| ArcFace | `w600k_r50.onnx` | Face embedding extraction | 112x112 |

## Liveness and appearance (library-ready)

- **`LivenessService`** — Stateless per-call assessment with optional landmark history keyed by `trackId`. Not wired into the default desktop IPC path; available for stricter gates or future UI.
- **`AppearanceService`** — Groups embeddings into clusters and scores drift between centroids; pairs with DB `appearance_changes` when persistence is added.

## Testing

Unit tests live in `src/__tests__/benchmark.test.ts` and exercise service logic with mock embeddings — no ONNX models required.

```bash
bun run test          # single run
bun run test:watch    # watch mode
```

### What's covered

| Suite | Tests | What it validates |
|---|---|---|
| `FaceService.cosineSimilarity` | 4 | Identity, noise tolerance, cross-person separation, zero-vector safety |
| `FaceService.findBestMatch` | 3 | Correct person selection, threshold rejection, matchMargin computation |
| `validateEmbedding` | 4 | Valid pass, NaN rejection, all-zeros rejection, wrong-length rejection |
| `gradeIdentity` | 4 | Definite/probable/uncertain/silent tier boundaries and announcement text |
| `AppearanceService` | 3 | Clustering, appearance shift detection, no-shift for same appearance |

Mock embeddings are deterministic sine-based vectors (seeded, L2-normalised). `addNoise` perturbs them with uniform random noise then re-normalises — useful for testing similarity degradation at controlled magnitudes.

## Dependencies

- `@emory/db` — Shared domain types where needed
- `onnxruntime-node` — ONNX model inference
- `sharp` — Image preprocessing (resize, crop, format conversion)
