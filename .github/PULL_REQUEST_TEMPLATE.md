## Summary

<!-- What does this PR change and why? One or two sentences. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] Build / CI
- [ ] Dependency bump

## Test plan

<!-- How did you verify this change? List commands run, screens tested, environments hit. -->

- [ ] `make lint` passes
- [ ] `make test` passes (49/49 green)
- [ ] Frontend type-check passes (`cd app/frontend && npx tsc -b --noEmit`)
- [ ] Manual smoke test against a live workspace (describe scenario):

## UI-affecting changes

- [ ] Rebuilt `app/frontend/dist/` and committed the updated bundle
- [ ] N/A (backend-only change)

## Schema / API changes

- [ ] Updated Pydantic model in `app/server/routes.py`
- [ ] Updated matching TypeScript type on the frontend
- [ ] N/A

## Checklist

- [ ] Linked issue or context in the summary
- [ ] No secrets, tokens, pixel IDs, or customer-specific workspace URLs in the diff
- [ ] CHANGELOG.md updated if the change is user-visible
