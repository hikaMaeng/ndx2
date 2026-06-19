# Headless Browser Test

- status: failed
- mode: scenario
- testedUrl: http://host.docker.internal:18080/
- finalUrl: http://host.docker.internal:18080/
- documentStatus: 200
- title: tetris
- mainPresent: true
- consoleErrors: 0
- pageErrors: 0
- trace: /mnt/f/dev/ndx2/test/20260619/055542_headless-browser-test/trace.zip
- screenshots: 2

## Screenshots
- /mnt/f/dev/ndx2/test/20260619/055542_headless-browser-test/screenshots/01-home.png
- /mnt/f/dev/ndx2/test/20260619/055542_headless-browser-test/screenshots/failure-4-click.png

## Step Results
- 1. goto: passed
- 2. assertRole: passed
- 3. screenshot: passed
- 4. click: failed - locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '설정' })


## Browser Errors
