# Example CI shapes

## Semantic-release deployable (Track A)

Job order sketch (see Armory/Codex `ci.yml` for full deploy SSH/PM2 steps):

```yaml
name: <App> CI/CD

env:
  NODE_VERSION: 26

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deployment-check:
    runs-on: blacksmith-2vcpu-ubuntu-2404
    # decide deploy=true/false …

  version:
    runs-on: blacksmith-8vcpu-ubuntu-2404
    needs: [deployment-check]
    # semantic-release via CI_PAT …

  validate:
    runs-on: blacksmith-8vcpu-ubuntu-2404
    needs: [deployment-check, version]
    steps:
      # checkout release target SHA
      - run: pnpm run validate

  build-and-deploy:
    runs-on: blacksmith-8vcpu-ubuntu-2404
    needs: [deployment-check, version, validate]
    # build + rsync + pm2 …

  discord-status:
    runs-on: blacksmith-2vcpu-ubuntu-2404
    needs: [deployment-check, version, validate, build-and-deploy]
    if: ${{ always() && github.ref == 'refs/heads/main' }}
    steps:
      - uses: iShark5060/actions-discord-status@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK }}
          job_results: ${{ join(needs.*.result, ',') }}
          mention_on: failure
          content: '<@${{ secrets.DISCORD_USERID }}>'
          title: ${{ github.workflow }}
          # optional description for human-readable outcome text
```

## Direct deploy static site (Track C)

```yaml
jobs:
  validate:
    runs-on: blacksmith-8vcpu-ubuntu-2404
    steps:
      # Pin to commit SHAs in real workflows (see pr.yml.md).
      - uses: useblacksmith/checkout@2d63ce5ba61677748c4e92f6eb578a8694226225 # v1.2.0
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: '26'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level high
      - run: pnpm run validate
      - run: pnpm run build

  deploy:
    runs-on: blacksmith-8vcpu-ubuntu-2404
    needs: [validate]
    # existing rsync/SSH deploy …

  discord-status:
    runs-on: blacksmith-2vcpu-ubuntu-2404
    needs: [validate, deploy]
    if: always()
    steps:
      - uses: iShark5060/actions-discord-status@v1
        with:
          webhook: ${{ secrets.DISCORD_WEBHOOK }}
          job_results: ${{ join(needs.*.result, ',') }}
          mention_on: failure
          content: '<@${{ secrets.DISCORD_USERID }}>'
          title: ${{ github.workflow }}
```
