# Contributing

## Setup

Node 22 LTS (see `.nvmrc`), then from the repository root:

```sh
npm install
npm run check
```

`npm run check` runs lint, the type check and the unit tests across every workspace.

## Branches

We use Gitflow without pull requests.

| Branch | Takes | Receives merges from |
|---|---|---|
| `main` | What is in production. Every merge deploys. | `release/*`, `hotfix/*` |
| `develop` | What is on staging. Every push deploys to staging. | `feature/*`, and `main` after a release |
| `feature/<short-name>` | One feature, for example `feature/claim-lock` | |
| `release/x.y.z` | Version bump and changelog | |
| `hotfix/<short-name>` | An urgent production fix, branched from `main` | |

Do not commit directly on `main` or `develop`.

## Working on a feature

```sh
git switch develop
git pull
git switch -c feature/<short-name>
# work and commit; push the branch at least once a day
git push -u origin feature/<short-name>
```

When it is done:

```sh
npm run check
git switch develop
git pull
git merge --no-ff feature/<short-name>
git push
git branch -d feature/<short-name>
git push origin --delete feature/<short-name>
```

Always merge with `--no-ff`, so each feature shows in the history as its own branch.
The merge commit subject is `Merge feature/<short-name>: <what it delivers>`.

If `develop` goes red after your merge, fix it or revert your merge (`git revert -m 1 <merge sha>`) within 30 minutes.
Nothing else is merged into a red `develop`.

Force-pushing `main` or `develop` is reserved for removing something that must not stay in the history, such as a committed secret, and only with the whole team agreed.

## Releases

```sh
git switch -c release/x.y.z develop
# bump versions, add a CHANGELOG entry, commit
git switch main
git merge --no-ff release/x.y.z
git tag vx.y.z
git push origin main --tags
git switch develop
git merge --no-ff main
git push
```

Pushing `main` runs the CI checks again and deploys to production only if they pass.

## Commits

Conventional commit headers, with a scope where one applies (`web`, `api`, `jobs`, `contract`):

```
feat(api): take the claim lock with a conditional update
fix(web): show server field errors next to the right input
ci: cache the MongoDB binary
```

Keep commits small.
Commit under your own name.
When pairing, whoever types commits and adds a `Co-authored-by:` trailer for the other person.

## Secrets

Never commit a real secret.
Local values go in an ignored `.env`; `.env.example` lists every variable name with no values.
Deployed values live only in the hosting platforms and in GitHub repository secrets.
