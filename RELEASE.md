# Release Process

This project uses [Semantic Versioning](https://semver.org/). While in Databricks Labs, versions stay below `1.0.0`.

## How to cut a release

1. **Update the version** in `pyproject.toml`:
   ```toml
   [project]
   version = "0.2.0"
   ```
   The app automatically propagates this version to the Databricks SDK user-agent on next deploy — no other files need updating.

2. **Update `CHANGELOG.md`**:
   - Move items from `[Unreleased]` into a new `[0.2.0] — YYYY-MM-DD` section.
   - Create a fresh empty `[Unreleased]` section at the top.
   - Update the comparison links at the bottom of the file.

3. **Commit** on `main`:
   ```bash
   git add pyproject.toml CHANGELOG.md
   git commit -m "Release v0.2.0"
   git push
   ```

4. **Tag and push**:
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin v0.2.0
   ```

5. **The release workflow** (`.github/workflows/release.yml`) runs automatically when a `v*` tag is pushed:
   - Runs the backend test suite
   - Builds the frontend
   - Creates a GitHub Release with auto-generated release notes
   - Attaches the built frontend (`frontend/dist/`) as a release asset

## Branch protection

The `main` branch is protected:
- Force pushes are blocked
- Pull requests require approval before merging
- CI checks (backend tests, frontend build, CodeQL) must pass

Tag protection is configured for `v*` tags: only repository maintainers can create or modify them.

## Pre-release checks

Before pushing the tag, verify:
- [ ] `make test` passes locally
- [ ] `make lint` passes
- [ ] `frontend/dist/` is rebuilt and committed (required because the Databricks App runtime serves the pre-built bundle)
- [ ] `CHANGELOG.md` is up to date
- [ ] The app deploys cleanly via `databricks apps deploy conversions-api-app`

## Hotfix process

For urgent fixes between planned releases:
1. Branch from the latest tag (e.g. `hotfix/v0.2.1` off `v0.2.0`)
2. Land the fix via PR
3. Tag `v0.2.1` on `main` and push as above

## Labs graduation

If this project graduates from Labs into the main product, the first post-graduation release can bump directly to `1.0.0`.
