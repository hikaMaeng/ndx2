# Headless Browser Test

- status: failed
- mode: smoke
- testedUrl: http://172.30.0.2:18080/
- finalUrl: http://172.30.0.2:18080/
- documentStatus: 200
- title: NDX vibe
- mainPresent: false
- consoleErrors: 0
- pageErrors: 1
- trace: /mnt/f/dev/ndx2/test/20260619/055621_headless-browser-test/trace.zip
- screenshots: 1

## Screenshots
- /mnt/f/dev/ndx2/test/20260619/055621_headless-browser-test/screenshots/failure-2-assertRole.png

## Step Results
- 1. goto: passed
- 2. assertRole: failed - locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('main').first() to be visible


## Browser Errors
- page: crypto.randomUUID is not a function
