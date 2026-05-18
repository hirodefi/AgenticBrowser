# CI workflow template

`build-runtime-binary.yml` is a GitHub Actions workflow template. To
activate it, copy the file into `.github/workflows/` at the repo root:

```bash
mkdir -p .github/workflows
cp runtime-binary/ci/build-runtime-binary.yml .github/workflows/
git add .github/workflows/build-runtime-binary.yml
git commit -m "Enable runtime-binary CI"
git push
```

Pushing workflow files requires a token with the `workflow` scope.
The template lives here so it can ship in regular commits without that
scope, then get activated explicitly once the patched-Chromium build is
ready to run end-to-end in CI.
