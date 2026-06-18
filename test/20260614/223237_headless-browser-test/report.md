# Headless Browser Test

- status: failed
- mode: smoke
- testedUrl: http://127.0.0.1:5173/
- finalUrl: http://127.0.0.1:5173/
- documentStatus: 200
- title: NDX vibe
- mainPresent: false
- consoleErrors: 2
- pageErrors: 0
- trace: /mnt/f/dev/ndx2/test/20260614/223237_headless-browser-test/trace.zip
- screenshots: 1

## Screenshots
- /mnt/f/dev/ndx2/test/20260614/223237_headless-browser-test/screenshots/failure-2-assertRole.png

## Step Results
- 1. goto: passed
- 2. assertRole: failed - locator.waitFor: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for getByRole('main').first() to be visible[22m


## Browser Errors
- console: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.
- console: Failed to load resource: the server responded with a status of 404 (Not Found)
