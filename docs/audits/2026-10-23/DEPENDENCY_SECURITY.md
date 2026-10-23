# Dependency security maintenance

Audit on 2026-10-23: 12 advisories (3 high, 6 moderate, 3 low) before;
zero known advisories after the targeted update. Counts describe the registry
audit at that time, not an absence of all possible vulnerabilities.

| Package | Resolved version | Exposure in CoqPi | Advisory IDs fixed |
| --- | --- | --- | --- |
| Electron | 44.3.0 -> 44.9.3 | Packaged desktop runtime, even though declared as devDependency | GHSA-x562-297c-g43g; GHSA-3qxv-5xgr-q7w9; GHSA-h3v5-h239-pg29 |
| Vite | 6.4.3 -> 6.4.5 | Development server/editor integration, not the packaged server | GHSA-698v-4r3x-3vcv; GHSA-r825-w8mm-5pxw; GHSA-587h-7wmj-h5pm; GHSA-9jrq-w75r-8gcw; GHSA-rq7h-c2jc-7f22 |
| fast-uri | 3.1.7 -> 3.1.9 | AJV in packaging tools | GHSA-hrr3-gc8f-f4qj |
| follow-redirects | 1.16.0 -> 1.16.1 | axios in wait-on development helper | GHSA-q3jh-wrc6-jgq8; GHSA-8r9p-f939-6h3c |
| stream-json | 3.6.0 -> 3.7.0 | Retained Crawlee runtime dependency | GHSA-jj87-hc4r-jwfw |

All upgrades remain within the existing major versions. Existing overrides for
other advisories are retained; fast-uri/stream-json minimums were raised and
follow-redirects received a bounded override. No audit ignores or severity
suppression were added. The committed lockfile pins the tested graph.

Primary references: [Electron](https://github.com/advisories/GHSA-x562-297c-g43g),
[Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm),
[fast-uri](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj),
[follow-redirects](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8),
[stream-json](https://github.com/advisories/GHSA-jj87-hc4r-jwfw).

## Verification

Release verification results are recorded in [v0.3.4](../../releases/v0.3.4.md).
The earlier STT report's 12 advisories are historical evidence, superseded by
this dependency pass; its real-audio timings apply to its original runtime.

Never publish real transcript/audio evidence, copied credentials or user profiles
as release assets. Distribute the built app plus checksums only.
