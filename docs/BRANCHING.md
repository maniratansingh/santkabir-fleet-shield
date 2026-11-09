# Branch Model

This repository uses three long-lived branches.

| Branch | Purpose | Deployed? | Stability |
|---|---|---|---|
| `main` | Stable production wallboard | **Yes** | Production |
| `testing` | Integration, QA and verification | No | Should pass all suites |
| `experimental` | New, unusual and unproven ideas | No | Unstable by design |

`main` is the GitHub default branch.

## Rules

### `main`
- Only receives changes that have passed `testing`.
- Every commit must keep the build green.
- `npm test` must pass, including the route anchor guard.
- No direct experimental work.

### `testing`
- Integration and verification branch.
- Run the full suite here:
  - `npm test`
  - `npm run test:kalman`
  - `npm run test:map-matching`
  - `npm run test:do-ws` (requires `wrangler dev` on port 8787)
  - `npm run test:routes`
- Visual QA, responsive checks and data checks happen here.
- When green, merge `testing` into `main`.

### `experimental`
- New features, wild ideas, refactors and prototypes.
- No stability guarantee.
- May be broken at any time.
- Not deployed.
- When an experiment is worth keeping, merge it into `testing`, verify it, then merge `testing` into `main`.

## Flow

```text
experimental  →  testing  →  main
   unstable       verified    production
```

## Keeping branches in sync

```bash
# Start from the latest production
git checkout main
git pull origin main

# Bring testing up to date
git checkout testing
git merge main
git push origin testing

# Bring experimental up to date
git checkout experimental
git merge main
git push origin experimental
```

## Starting a new experiment

```bash
git checkout experimental
git pull origin experimental
git merge main
# work here
git add .
git commit -m "experiment: ..."
git push origin experimental
```

## Promoting an experiment

```bash
git checkout testing
git merge experimental
npm test
# run the remaining suites
git push origin testing
```

Then open a PR from `testing` to `main` or merge locally after review.

## Old branches

These branches are fully merged into `main` and are archived as tags:

- `archive/step1-clear-auth` → `3d2237a`
- `archive/durable-object-websockets` → `55d6468`

They are kept only for history. Do not develop on them.

## Branch naming

Use clear prefixes for short-lived work:

- `feat/<topic>`
- `fix/<topic>`
- `test/<topic>`
- `experiment/<topic>`

Delete short-lived branches after merging.
