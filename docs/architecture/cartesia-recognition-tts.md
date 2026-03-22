# Cartesia TTS for recognized-face popups

This document describes the best-fit architecture for speaking a short recognition briefing into the Meta Ray-Ban audio route when the iOS app shows a recognized-person popup.

Target spoken payload:

1. Person name
2. Relationship / relation label
3. Most recent conversation summary

Example:

> "Ryan, your grandson. Last time, you talked about school and his plan to propose soon."

## Recommendation

Keep **Cartesia synthesis on desktop** and make **iOS own playback + route selection + recognition sequencing**.

That split matches the codebase:

- The **summary source of truth** already lives on desktop in [`ConversationRepository`](../../packages/db/src/repositories/conversation.repository.ts) and [`ConversationProcessingService`](../../apps/desktop/src/main/services/conversation-processing.service.ts).
- The **Cartesia integration** already exists on desktop in [`cartesia-tts.service.ts`](../../apps/desktop/src/main/services/cartesia-tts.service.ts).
- The **Meta audio route** only exists on iOS today via [`AudioRouteDetector`](../../emory/emory/Services/AudioRouteDetector.swift) and the app’s `AVAudioSession` usage in [`MicrophoneCaptureService`](../../emory/emory/Services/MicrophoneCaptureService.swift).

Do **not** move Cartesia to iOS for the first implementation:

- it would duplicate summary assembly logic on the client,
- it would require putting the API key on the phone,
- and it would make the desktop/mobile contracts less coherent.

Do **not** enrich the hot `person_focus_changed` WebSocket payload with summary or audio bytes:

- `PersonFocusService` runs in the face-processing path and should stay cheap,
- summary lookup and TTS are slower and belong off the recognition critical path,
- and popup UI already does a follow-up detail fetch pattern.

## Current architecture

### Desktop

- [`PersonFocusService`](../../apps/desktop/src/main/services/person-focus.service.ts) emits a thin `person_focus_changed` payload: `id`, `name`, `relationship`, `similarity`, `faceThumbnail`.
- [`RemoteIngestServerService`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts) sends that event to the iOS app over `/signaling?role=mobile`.
- [`MobileApiService`](../../apps/desktop/src/main/services/mobile-api.service.ts) serves `GET /api/v1/people/:id` for richer person detail.
- [`ConversationProcessingService`](../../apps/desktop/src/main/services/conversation-processing.service.ts) writes the latest structured summary into `conversation_recordings.extraction_json.summary`.
- [`CartesiaTtsService`](../../apps/desktop/src/main/services/cartesia-tts.service.ts) already synthesizes WAV bytes and is wired through IPC for desktop-only testing.

### iOS

- [`DesktopRecognitionStore`](../../emory/emory/ViewModels/DesktopRecognitionStore.swift) listens to `person_focus_changed`, shows the popup, then fetches full detail via [`DesktopApiClient`](../../emory/emory/Services/DesktopApiClient.swift).
- [`RecognitionPopupView`](../../emory/emory/Views/RecognitionPopupView.swift) is presentation-only.
- [`ConversationCaptureCoordinator`](../../emory/emory/Services/ConversationCaptureCoordinator.swift) currently reacts directly to focus changes and starts recording immediately.
- [`MicrophoneCaptureService`](../../emory/emory/Services/MicrophoneCaptureService.swift) already owns `AVAudioSession` setup and Bluetooth mic selection.
- [`AudioRouteDetector`](../../emory/emory/Services/AudioRouteDetector.swift) already knows whether the Meta/Ray-Ban audio route is active.

## Proposed architecture

### 1. Desktop: add a recognition-context service

Add a new main-process service, for example:

`apps/desktop/src/main/services/recognition-context.service.ts`

Responsibilities:

- Resolve the best relationship label for speech.
- Resolve the newest non-empty conversation summary.
- Build a short, speech-safe announcement string.
- Return stable metadata used by both the popup detail API and the audio endpoint.

Suggested shape:

```ts
export type RecognitionContext = {
  personId: string
  personName: string
  relationshipLabel: string | null
  latestConversationSummary: string | null
  latestConversationRecordedAt: string | null
  announcementText: string
  fingerprint: string
}
```

Selection rules:

1. `personName`: `peopleRepo.findById(personId).name`
2. `relationshipLabel`:
   - first `people.relationship`
   - fallback to graph relation between `self` and target if available
   - else `null`
3. `latestConversationSummary`:
   - scan `conversationRepo.getRecordingsByPerson(personId, 5)`
   - choose the newest recording where:
     - `extractionStatus === 'complete'`
     - `extractionJson?.summary.trim()` is non-empty
4. `announcementText`:
   - concise, plain text only
   - no more than roughly 1-2 short sentences
   - omit empty fields instead of speaking placeholders

Suggested template:

```text
{name}. {relationship sentence if present} {last-time sentence if summary present}
```

Examples:

- `Ryan. Your grandson. Last time, you talked about school and his proposal plans.`
- `Sarah. Last time, you talked about family dinner plans.`

Use a small normalization helper:

- trim whitespace
- collapse newlines/bullets
- strip quotes
- cap summary length for speech

### 2. Desktop: add a recognition-announcement service on top of Cartesia

Add a second service, for example:

`apps/desktop/src/main/services/recognition-announcement.service.ts`

Responsibilities:

- call `RecognitionContextService`,
- synthesize speech through `CartesiaTtsService`,
- cache generated audio by `fingerprint`,
- return `{ mimeType, audioBytes, text, fingerprint }`.

Cache key inputs:

- `personId`
- normalized `announcementText`
- Cartesia `voiceId`
- Cartesia `modelId`

Store cache under the existing TTS root:

- `app.getPath('userData')/tts/recognitions/<fingerprint>.wav`

This keeps the existing debug-audio behavior but adds real cache reuse for repeated recognitions.

### 3. Desktop HTTP API: add dedicated mobile endpoints

Keep this inside [`RemoteIngestServerService`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts), alongside the other mobile API routes.

Add:

1. `GET /api/v1/people/:id/recognition-context`
2. `GET /api/v1/people/:id/recognition-announcement`

Recommended responses:

`GET /api/v1/people/:id/recognition-context`

```json
{
  "personId": "uuid",
  "personName": "Ryan",
  "relationshipLabel": "Grandson",
  "latestConversationSummary": "You talked about school and his proposal plans.",
  "latestConversationRecordedAt": "2026-03-21T15:10:00.000Z",
  "announcementText": "Ryan. Your grandson. Last time, you talked about school and his proposal plans.",
  "fingerprint": "sha256..."
}
```

`GET /api/v1/people/:id/recognition-announcement`

- `200`
- `Content-Type: audio/wav`
- header `X-Emory-Announcement-Fingerprint: ...`

Why a dedicated audio endpoint:

- the popup can fetch detail/context independently,
- the face-recognition event stays thin,
- and the phone does only one hop to get playable bytes.

### 4. Desktop mobile API: enrich person detail

Extend [`MobileApiPersonDetail`](../../apps/desktop/src/main/services/mobile-api.types.ts) and [`MobileApiService`](../../apps/desktop/src/main/services/mobile-api.service.ts) so the popup can display the same summary the wearable hears.

Suggested addition:

```ts
latestConversationSummary: string | null
latestConversationRecordedAt: string | null
```

This removes the current gap where the popup has memories and topics but not the actual latest summary string.

### 5. iOS: add a dedicated announcement player

Add a lightweight service, for example:

`emory/emory/Services/RecognitionAnnouncementPlayer.swift`

Responsibilities:

- fetch announcement audio from desktop,
- play it once,
- cancel in-flight playback if focus changes,
- refuse playback when the Meta audio route is not active.

Playback rules:

- default behavior should be **Meta route only**
- no speaker fallback unless explicitly enabled later
- use `AVAudioSession` for playback and `AVAudioPlayer` or `AVAudioEngine` for WAV data

The simplest first slice is `AVAudioPlayer` from `Data` or a temp file.

### 6. iOS: introduce a recognition-experience coordinator

Add:

`emory/emory/Services/RecognitionExperienceCoordinator.swift`

This coordinator should own sequencing between:

- popup presentation,
- announcement playback,
- and conversation recording.

Why a new coordinator:

- [`DesktopRecognitionStore`](../../emory/emory/ViewModels/DesktopRecognitionStore.swift) should stay focused on recognition UI state,
- [`ConversationCaptureCoordinator`](../../emory/emory/Services/ConversationCaptureCoordinator.swift) should stay focused on recording/upload lifecycle,
- and the new TTS behavior introduces cross-cutting sequencing that does not belong in the SwiftUI view.

Recommended flow:

1. `DesktopRecognitionStore` receives `person_focus_changed`.
2. It presents the popup immediately.
3. It tells `RecognitionExperienceCoordinator` about the focus event.
4. The coordinator:
   - cancels any prior in-flight announcement for another person,
   - starts popup detail/context fetch,
   - fetches and plays the announcement if enabled and route is active,
   - only then starts conversation recording.
5. On focus clear/change:
   - cancel playback,
   - end active recording using the existing `ConversationCaptureCoordinator`.

## Important sequencing decision

Do **not** start conversation recording before the TTS finishes.

That is the most important behavioral change in this spec.

Reason:

- the current app starts recording immediately on recognition,
- if TTS plays at the same time, the prompt can be captured into the conversation recording,
- and the risk is worse when audio input is set to Ray-Ban/Meta Bluetooth.

So the correct sequence is:

1. recognition arrives
2. popup appears
3. TTS plays
4. recording begins

If TTS is skipped or fails, recording starts immediately.

## iOS model / client changes

Update:

- [`DesktopApiModels.swift`](../../emory/emory/Models/DesktopApiModels.swift)
- [`DesktopApiClient.swift`](../../emory/emory/Services/DesktopApiClient.swift)
- [`DesktopRecognitionStore.swift`](../../emory/emory/ViewModels/DesktopRecognitionStore.swift)

Add:

- `DesktopRecognitionContextResponse`
- `fetchRecognitionContext(personId:)`
- `fetchRecognitionAnnouncement(personId:)`

Extend popup state:

```swift
var latestConversationSummary: String?
var latestConversationRecordedAt: String?
var isPlayingAnnouncement: Bool
```

## Settings and rollout

Add iOS settings in [`AppSettings.swift`](../../emory/emory/Models/AppSettings.swift) and surface them in [`SettingsView.swift`](../../emory/emory/Views/SettingsView.swift):

1. `recognitionAnnouncementsEnabled: Bool`
2. `recognitionAnnouncementsRequireMetaRoute: Bool`

Recommended defaults:

- enabled: `true`
- require Meta route: `true`

This keeps behavior aligned with the product request: the speech is for the bands, not the room speaker.

## Desktop implementation plan

1. Create `RecognitionContextService`.
2. Add tests for summary selection and announcement text formatting.
3. Create `RecognitionAnnouncementService` with cache lookup.
4. Add `/api/v1/people/:id/recognition-context`.
5. Add `/api/v1/people/:id/recognition-announcement`.
6. Extend `MobileApiPersonDetail` with latest-summary fields.
7. Log cache hits/misses and synthesis latency.

## iOS implementation plan

1. Add new API DTOs and client methods.
2. Add `RecognitionAnnouncementPlayer`.
3. Add `RecognitionExperienceCoordinator`.
4. Refactor `ConversationCaptureCoordinator` so recording can be started explicitly instead of only via direct focus handling.
5. Update `DesktopRecognitionStore` to call the new coordinator.
6. Update `RecognitionPopupView` to show the latest summary.
7. Add settings toggles and route-aware skip behavior.

## Testing strategy

### Desktop

- unit test `RecognitionContextService`
  - uses newest non-empty summary
  - falls back when summary missing
  - relationship precedence is stable
- unit test `RecognitionAnnouncementService`
  - cache hit vs cache miss
  - fingerprint changes when summary/text changes
- integration test HTTP routes on `RemoteIngestServerService`

### iOS

- unit test `RecognitionExperienceCoordinator`
  - focus change cancels prior playback
  - focus clear ends playback and recording
  - TTS failure falls through to recording
- unit test `DesktopRecognitionStore` model mapping
- manual QA on-device
  - Meta route connected
  - Meta route missing
  - repeated recognition of same person
  - focus change during playback
  - long summary clipped correctly

## Risks and mitigations

### Repeated announcements

Risk: focus flaps cause repeated speech.

Mitigation:

- add an iOS cooldown keyed by `personId + fingerprint`
- suggested default: 60-120 seconds

### Long or awkward summaries

Risk: extracted summary is too long or sounds unnatural aloud.

Mitigation:

- normalize and cap the spoken summary
- optionally add a future “speech summary” field if the stored summary proves too verbose

### Audio-session conflicts

Risk: playback and mic capture fight over the same Bluetooth route.

Mitigation:

- sequence TTS before recording
- keep playback on iOS where `AVAudioSession` is controlled

### Latency

Risk: synthesis delays the start of recording.

Mitigation:

- cache by fingerprint
- keep announcement text short
- use a timeout; on timeout, skip TTS and begin recording

## Non-goals for the first slice

- generic mobile TTS for arbitrary prompts
- streaming TTS over WebSocket
- putting Cartesia credentials on iOS
- changing `person_focus_changed` into a heavy payload

## Final recommendation

The cleanest first implementation is:

- **desktop** assembles the announcement text and synthesizes/caches audio,
- **remote-ingest HTTP** exposes context + audio endpoints,
- **iOS** plays that audio only when the Meta route is active,
- and **recording starts after playback completes**.

That gives the feature the user wants while staying consistent with the repo’s current boundaries and avoiding the biggest failure mode: the app recording its own announcement.
