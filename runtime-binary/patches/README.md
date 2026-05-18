# Patches

Each `.patch` file in this directory is a `git apply`-compatible diff
against the Chromium tree at the target stable version. The build
script applies them in lexicographic order — number prefixes
(`01-…`, `02-…`) encode dependencies.

## File naming

`NN-surface-id.patch`

where `NN` is a two-digit sequence (00-99), `surface` is the patch
manifest surface group (`v8-binding`, `graphics-2d`, `graphics-gl`,
`fonts`, `audio`, `network-tls`, `network-h2`, `network-h3`, `webrtc`,
`network-dns`, `system`, `intl`), and `id` matches the patch id in
`../patches.json`.

## Status

The patch manifest in `../patches.json` lists 18 planned patches with
priority, surface, and current status. None have landed yet — each one
will arrive as its own commit with a description of the detection
vector it closes and a test page demonstrating the change.

## Authoring guidelines

* Land one patch per commit; never bundle.
* Write a short header in the patch body explaining the detection
  vector and how the change neutralizes it. Reviewers should be able
  to evaluate the patch without reading external context.
* Add a regression entry to `../tests/` when a detection site exposes
  a new probe relevant to the patched surface.
* Do not introduce new build flags except where strictly necessary.
  Where flags are necessary, prefix with `--ab-` so they cannot
  collide with upstream Chromium flags.

## Build

```bash
./build/bootstrap.sh           # one-time: fetch source + depot_tools
./build/build.sh ~/agentic-chromium/src release
./build/package.sh ~/agentic-chromium/src out/Agentic
```

Output archives land in `dist/`. The CI workflow at
`../../.github/workflows/build-runtime-binary.yml` does the same on
GitHub Actions for the three release platforms.
