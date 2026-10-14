# Development-only Flute experiment — 2026-10-14

CoqPi source baseline: `848fbdb89a7b99054f430429fd4f0a2bdc22bcfb`.
Installed runtime: React 19.2.7, Vite 6.4.3, Flute 0.1.2, Playwright 1.58.2,
Node 24. The experiment runs this Electron project's React renderer in a browser;
the packaged Electron app and its preload/main process were not exercised.

## What is real and what is synthetic

The scene imports `MeetingPreparationBrief`, `TrainingPanel`, and `CallFocusPanel`
directly, with CoqPi's existing styles and logo. These component files are unchanged.
Presentation wrappers restore the scoped control styles and add spacing; this is
not a pixel-identical rendering of the entire app window. Only the camera/focus
and surrounding promotional captions are newly authored.

All visible context and the example answer are synthetic and labelled DEMO. A
preview-only bridge supplies empty training history and rejects other operations.
It does not connect to Electron IPC, microphone, real transcripts or AI providers.
It is loaded only by the development query, behind Vite's compile-time DEV guard.
The ordinary entry and production bundle do not load the Flute demo.

## Run locally

Use the package's pinned pnpm version and Node 22.12 or newer. Install dependencies
in an isolated checkout. Flute is a development dependency; no global skill is installed.

```sh
pnpm exec vite --host 127.0.0.1 --port 5188 --strictPort
```

Open `http://127.0.0.1:5188/?flute-preview=1&flute-scene=coqpi-cinematic` in a browser.
Keep the renderer running during export. This route is the demonstration, not the
normal Electron app. Do not start microphone/provider actions for video capture.

Flute's portable `init --adapter react` creates the handoff and registry. The typed
host connection is `src/renderer/flute-preview.tsx`; the scene uses one source for
its JSON transforms and actual Surface poses. The studio owns playback/capture.

```sh
pnpm exec flute scenes --json
pnpm exec flute guide --json
pnpm check
pnpm check:flute
```

Install Chromium for the Playwright version used by Flute, with a browser cache on
the work disk. With FFmpeg available, use the explicit full scene URL:

```sh
pnpm exec flute export --url 'http://127.0.0.1:5188/?flute-preview=1&flute-scene=coqpi-cinematic' --output flute-output/coqpi-new.mp4 --fps 30 --width 1920 --height 1080 --json
```

Choose a fresh filename; Flute refuses overwrites. In this pnpm layout, the optional
Playwright package did not expose a root CLI binary: its installed `cli.js` was
invoked directly to download Chromium. This is a package-layout detail, not a need
to install an unrelated package or change the renderer.

## Verified result and limits

- Flute authoring review: valid, no issues or advice; browser/encoded frames inspected.
- Native export: 23 seconds, 1920×1080, 30 fps, 690 frames, H.264, no audio.
- Finished version: same encoded video stream, plus original local instrumental/AAC.
- `pnpm check`: 359 tests passed, zero failures; two moderate audit findings remain,
  below the repository's high-severity failure threshold. This is not a zero-advisory claim.
- Separate scene typecheck and production-boundary check passed. A clean fixture
  was accepted and an injected Flute capture marker was correctly rejected.
- `flute snapshot` failed for this manual React adapter with the instruction to
  open the renderer manually. Direct-URL MP4 export worked; thumbnail extracted
  from the actual encoded video with FFmpeg. No upstream code was patched.

DOF is Flute's DOM blur approximation, not ray-traced optics. Full Electron runtime,
other React applications, alternate formats, live-call quality and audience impact
remain untested. The video's artistic acceptance is pending owner review.

Exports, browser cache and full logs are retained on the external work disk, not
committed as runtime data. The method record is owned by
[Framewright](https://github.com/markoblogo/framewright).
