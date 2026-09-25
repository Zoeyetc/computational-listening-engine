# Computational Listening Engine

A framework for computational listening.

## Installation

```sh
npm install @zoeyetc/computational-listening-engine
```

```js
import { hzToMidi, midiToNoteName } from '@zoeyetc/computational-listening-engine';

const midi = hzToMidi(440); // 69
console.log(midiToNoteName(midi)); // A4
```

This repository is UI-independent and product-independent. It accepts PCM data and explicit timeline inputs; it does not acquire browser audio or render a presentation.

## Model

- **Signal:** bounded PCM analysis derives amplitude, spectrum, pitch, rhythm, percussion, harmony, tonal center, and structure.
- **Evidence:** retained frames and diagnostics preserve observations and uncertainty separately from accepted musical capabilities.
- **Listening:** `ListeningMap` holds the analyzed result; `ListeningSnapshot` resolves current musical truth from an explicit time.
- **Temporal reasoning:** retained evidence selection and timeline crossings use the supplied musical time without creating a transport clock.
- **Timeline:** `ListeningTimeline` produces deterministic snapshots and discrete events, including seek and map-replacement behavior.
- **Streaming:** `RollingListeningSession` analyzes bounded rolling PCM and retains causal evidence.
- **Diagnostics:** analysis characterization is exposed through the same package API without changing production decisions.

The engine has no React, UI, product, DOM, Web Audio acquisition, permission, or device-selection dependency. Audio acquisition and source metadata belong to the browser audio-source client.

## Consumers

- Zoë — computational listening instrument.
- Z.land — music-driven physical world.

Both products consume `@zoeyetc/computational-listening-engine`; neither owns its implementation.

## Development

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run check:boundaries
npm run typecheck
npm test
npm run build
```

The package publishes one root API. `dist/` contains ESM JavaScript and declarations. The package is versioned independently of its consumers.

## Dual-Path Listening v0.1

The opt-in [Dual-Path Listening architecture](docs/architecture/DUAL_PATH_LISTENING_V0.1.md)
adds an independent Bass Path over existing candidate evidence. It does not change the
existing Melody path or claim bass accuracy before a ground-truth dataset exists.

## Evaluation

The independent [Evaluation Suite v0.1](evaluation/README.md) scores pitch, melody,
rhythm, harmony, and confidence calibration without changing Engine analysis.
Run `npm run test:evaluation` for metric tests and `npm run benchmark` to generate
[evaluation-report.md](evaluation-report.md) from deterministic synthetic PCM.
The evaluation documentation covers metric definitions, its local API, and adding datasets.

## Package publication

`@zoeyetc/computational-listening-engine` is configured for public publication to the npm
registry. Its only exported entry point is the package root, backed by
`dist/index.js` and `dist/index.d.ts`. The tarball includes `dist/`, this README,
`LICENSE`, and `package.json`.

Before a release, run:

```sh
npm test
npm publish --dry-run
```

Packing and publishing automatically check source boundaries, typecheck, and
rebuild `dist/` from scratch. The dry run prepares the package without publishing
it. Actual publication requires a separate, explicit release step and npm access
to the `@zoeyetc` scope.

## License

MIT. See [LICENSE](LICENSE).
