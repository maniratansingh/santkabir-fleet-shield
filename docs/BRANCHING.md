# Branch Model

Three long-lived branches. All new work starts on `experimental`. `testing`
and `main` only receive work from the branch below them.

| Branch | Role | Deployed | Direct edits |
|---|---|---|---|
| `main` | Production wallboard | Promotion target | No. Merge from `testing` only. |
| `testing` | Active history work + deployed verification | **Yes** — `fleet.mrps.in` | Yes, for this phase. |
| `experimental` | Frozen reference base | No | **No.** Do not edit or push. |

`main` is the GitHub default branch.

## Rules by branch

### `testing` — work and verify here

This is the working branch for the history redesign and the branch deployed at
`fleet.mrps.in`.

- Commit focused changes with `feat:`, `fix:`, `perf:` or `docs:` prefixes.
- Run the build and at least `npm test` before calling a change finished.
- Run `npm run test:kalman` and `npm run test:map-matching` for telemetry or
  rendering changes.
- Do visual checks at desktop and mobile widths, in both themes.
- Push to `testing` only.

### `experimental` — frozen reference

- It is the base the history work was built on.
- Do not edit, commit, or push to it in this phase.
- Read it for reference only.

### `main` — release here

- Receives verified merges from `testing` only.
- Every commit must build and pass the route-anchor guard.
- Deployment follows `npm run build` and `npx wrangler deploy`.

## Promotion flow

```text
testing  →  main
  active work     QA gate     production
```

```bash
# 1. Finish and verify on experimental
git checkout experimental
git pull origin experimental
npm run build
npm test

# 2. Promote to testing
git checkout testing
git pull origin testing
git merge --ff-only experimental
npm test
npm run test:kalman
npm run test:map-matching
npm run test:routes
git push origin testing

# 3. Promote to main
git checkout main
git pull origin main
git merge --ff-only testing
git push origin main

# 4. Return to work
git checkout experimental
git merge main
```

`--ff-only` keeps history linear and fails loudly if the branches diverged.
If it fails, stop and inspect the divergence rather than forcing a merge.

## Syncing the branches

Check where each branch is:

```bash
git log --oneline -1 main testing experimental
git branch -vv
```

After a release, bring `experimental` back up to `main` so the next change
starts from the released code:

```bash
git checkout experimental
git merge main
git push origin experimental
```

Do not copy commits between branches by hand. Promote the whole branch.

## What goes where

| Change | Branch |
|---|---|
| New feature or UI experiment | `experimental` |
| Bug fix | `experimental` |
| Documentation and screenshots | `experimental` |
| Full test run and visual QA | `testing` |
| Production release | `main` |

## Old branches

These branches are fully merged into `main` and archived as tags:

- `archive/step1-clear-auth` → `3d2237a`
- `archive/durable-object-websockets` → `55d6468`

They are kept only for history. Do not develop on them.

## Short-lived branches

For isolated work that is not ready for `experimental`:

- `feat/<topic>`
- `fix/<topic>`
- `test/<topic>`
- `experiment/<topic>`

Merge them into `experimental`, then delete them.
