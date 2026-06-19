# Stegosaur

A small single page app built with Vite, TypeScript, plain CSS, and Vitest.

## Scripts

- `npm run dev` starts the local development server.
- `npm test` runs unit tests.
- `npm run build` type-checks and builds the app into `dist`.
- `npm run preview` previews the production build locally.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy.yml`.
The workflow installs dependencies, runs tests, builds the app, and deploys `dist`
to GitHub Pages.
