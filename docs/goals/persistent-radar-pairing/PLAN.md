# Persistent Radar Pairing Implementation Plan

**Intent:** Pair REM Sync once and reconnect automatically after REM, Zepp or phone restarts.
**Current Behavior:** Watch Status issues an in-memory eight-hour bearer, replaces it on settings save and revokes it on service stop. REM Sync rejects a new source session on an unchanged phone channel.
**Expected Outcome:** A private, durable phone credential remains valid until explicitly replaced, forgotten, radar access is disabled, or plugin data is cleared. Temporary host/service loss invalidates outstanding reads without forgetting pairing.
**Target-Perspective Output:** The same saved Zepp pairing reconnects to fresh radar data after restarting the native source and phone-side client, without copying another code.
**Truth Owner:** Watch Status owns persistent pairing and live host authorization. REM Sync phone client owns the authenticated source-to-watch channel; the watch owns rendering and request/sequence validation.
**Contract Boundary:** Existing loopback-only bearer-authenticated radar endpoint and MessageBuilder projection remain unchanged. Configuration reports persistent pairing instead of a countdown.
**Cutover:** Replace the eight-hour process-local credential lifecycle. Existing in-memory credentials cannot be recovered across package replacement; one final pairing is required for this upgrade, then pairing persists.
**Displaced Path:** Remove expiry, unconditional settings-save rotation, and stop-time credential deletion. Keep explicit replacement, forgetting, radar-disable revocation, permission enforcement and in-flight generation checks.
**Value Density:** Change only the plugin pairing lifecycle and companion authenticated source-session handling, with focused restart/revocation evidence.
**Acceptance Evidence:** Native real-HTTP tests reuse one stored bearer across new access/provider instances and long elapsed time; companion integration tests recover through a restarted source/client and preserve replay/denial protection. Build both installable packages. Inspect connected-device versions and, where available, source restart recovery without recording credentials or coordinates. Full phone reboot/watch verification remains explicitly unproven unless observed.
**Evidence Lane:** Deterministic native HTTP and real companion client/controller integration; device delivery evidence kept separate.
**Kill Criteria:** No second credential authority, anonymous radar access, endless retries on explicit denial, secret logging, or changes outside the two named repositories.
**Architecture Slice:** See below.
**Plan Review Gate:** Requires PRE review before execution.

PRE review completed: aligned, no blockers. Additional gates cover unchanged settings, server pause/resume, durable explicit revocation, and distinguish saved pairing after boot from Android launching REM/Zepp.

## Architecture slice

- Modify REM `plugins/watch-status/android`: `RadarAccess`, `WatchStatusSettings`, `WatchStatusPluginService`, configuration assets, manifest/build version and focused tests. Persist the credential in app-private preferences, disable backup, synchronously commit credential changes, and fail closed on write failure.
- Pause runtime access on host stop; resume the same durable credential with a new public source session on restart. Distinguish pairing from ephemeral request tickets. Radar-disable/forget deletes pairing; a general server pause or unchanged settings save preserves it. Permission denial revokes the active access and durable credential.
- Modify companion `common/radar/phoneClient.js`, settings wording, version and tests. Change the phone channel after a validated authenticated source-session switch so the existing watch controller can reconnect automatically. Keep retired-session and stale-sequence rejection.
- Correctness review found a cached native Side Service port survives phone restarts. Also modify the companion's existing `shared/message.js`: rediscover the port after a bounded request timeout, without replaying sent requests or reconnecting the shared bridge at page level. Verify a recreated Side Service/MessageBuilder with a different native port. A same-pairing source suspension returns transient 503 rather than a terminal denial.
- Update current plugin/radar documentation; preserve dated historical device evidence.
- Avoid REM host/Rust code, global grants, unrelated dirty/untracked files, watch-face source and retained release artifacts.

## Ordered tasks

1. Native lifecycle (main agent): implement durable credential storage and pause/resume/forget semantics, preserve tickets and fresh grant reads. Verify with `:watch-status-plugin:testDebugUnitTest` and real-HTTP restart/denial cases.
2. Companion reconnect (main agent, depends on 1): adapt authenticated source channels and pairing UI, test source restart with the same credential and client restart. Run companion tests and focused transport integration.
3. Packaging/docs (main agent, depends on 1-2): bump Watch Status to 1.1.4 and REM Sync to 0.1.32, update docs/settings and build both packages. Preserve original packages. Check diffs/source sizes.
4. Review and delivery (main agent plus read-only reviewers): run POST/correctness/maintainability reviews, resolve material findings, inspect build contents and connected-device availability. Install updates where supported; report any remaining hardware acceptance clearly. Do not reboot the user's phone automatically.

Only read-only review/exploration may run in parallel. All implementation remains with the main agent.

## Completion

All four tasks are implemented, reviewed and delivered. See [verification](VERIFICATION.md) for the 216 passing checks, retained packages, installed phone/watch versions, device pairing persistence and user-confirmed automatic watch recovery after a real REM restart and a full phone reboot. The user performed and confirmed the phone reboot; no reboot was initiated automatically.
