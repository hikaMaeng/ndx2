# Headless Browser Test

- status: failed
- mode: smoke
- testedUrl: http://host.docker.internal:18082/
- finalUrl: http://host.docker.internal:18082/
- documentStatus: 200
- title: NDX vibe
- mainPresent: false
- consoleErrors: 0
- pageErrors: 1
- trace: /work/test/20260530/060817_headless-browser-test/trace.zip
- screenshots: 1

## Screenshots
- /work/test/20260530/060817_headless-browser-test/screenshots/failure-2-assertRole.png

## Step Results
- 1. goto: passed
- 2. assertRole: failed - locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('main').first() to be visible


## Browser Errors
- page: crypto.randomUUID is not a function
