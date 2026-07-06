# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-05

### Added
- Interactive 3D driving portfolio built with Three.js (WebGPU / TSL node materials) and Rapier (WASM) physics, with a drivable vehicle and dynamic objects you can crash into.
- Fully explorable 3D island surfacing projects, career timeline, and achievements through in-world monuments and interactive points.
- Day/night cycles, seasons, and live weather effects — rain, snow, lightning, and a tornado.
- Mini-games including bowling and a race circuit with a Cloudflare Worker leaderboard, plus hidden easter eggs.
- Spatial audio and original music via Howler.js, with deferred preloading on world entry.
- WebGPU rendering with a WebGL fallback, a 60fps cap, and automatic performance mode on struggling machines.
- Self-hosted analytics dashboard (key-protected `/stats` visitor funnel) and an AI guide.
- GitHub Pages CI/CD pipeline (build, smoke test, runtime E2E gate, deploy with transient-failure retry) plus a Blender export and GLB/texture compression asset pipeline.

[0.1.0]: https://github.com/Kantamaniprakash/prakash-folio/releases/tag/v0.1.0
