# Artiom Diulgher — portfolio

Static portfolio with project pages and screenshots imported from GitHub release bundles.

[Live site](https://taonity.github.io/taonity-portfolio/)

## Run locally

Requires Node.js 24+ and Python 3. On Windows, use WSL.

```bash
npm ci
npm run sync:screenshots
npm run dev
```

Open http://127.0.0.1:4173. To import a local capture instead of a release:

```bash
npm run import:screenshots -- /path/to/capture-directory sinair-llm-bot
```

## Add or edit a project

1. Edit [data/projects.json](data/projects.json) for the description, tags, links, cover scene, and capture source.
2. Add `projects/<project-id>/index.html`, following the [existing project page](projects/sinair-llm-bot/index.html).
3. Set up [demo-screenshots](https://github.com/taonity/demo-screenshots) in the project repository and publish a capture bundle before syncing.

## Deploy

Run `npm run build` and serve `dist/` on any static host.

The [Pages workflow](.github/workflows/pages.yml) deploys on pushes to `main` and manual runs. It also checks for new screenshot releases approximately every 15 minutes, rebuilding only when they change. Select **GitHub Actions** as the repository's Pages publishing source.

## Notes

- Generated screenshots and their metadata are ignored by Git. Run the sync before building a fresh checkout.
- Capture sources must be public. No cross-repository secret is needed.
- GitHub can delay scheduled checks and disable them after 60 days without repository activity. Re-enable the workflow if needed; the published site stays online.
- Font and Splide licenses are included under `assets/`.

## Tests

```bash
npx playwright install --with-deps chromium
npm test
npm run test:sync
```
