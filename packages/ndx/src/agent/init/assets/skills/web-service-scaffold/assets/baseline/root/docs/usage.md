# Usage

Use `npm run deploy` for the baseline deployment path. The deploy script runs
the required Yarn install check, builds the target service, and refreshes Docker
Compose.

The generated service Docker image is a runtime image, not the project build
environment. It still preinstalls the scaffold runtime toolchain needed for
diagnostics and skill-backed checks: Yarn through Corepack, Chromium, global
Playwright packages, Korean/emoji fonts, and standard shell/network utilities.
