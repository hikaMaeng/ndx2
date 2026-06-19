# Headless Browser Test

- status: failed
- mode: scenario
- testedUrl: http://127.0.0.1:18080
- finalUrl: http://127.0.0.1:18080/
- documentStatus: 200
- title: NDX vibe
- mainPresent: true
- consoleErrors: 0
- pageErrors: 0
- trace: /mnt/f/dev/ndx2/test/20260619/20260619-060112_headless-browser-test/trace.zip
- screenshots: 2

## Screenshots
- /mnt/f/dev/ndx2/test/20260619/20260619-060112_headless-browser-test/screenshots/01-home.png
- /mnt/f/dev/ndx2/test/20260619/20260619-060112_headless-browser-test/screenshots/failure.png

## Step Results
- 1. goto: passed
- 2. scenario: failed - locator.waitFor: Error: strict mode violation: getByRole('heading', { name: '설정' }) resolved to 2 elements:
    1) <h1 class="text-base font-semibold">설정</h1> aka getByRole('heading', { name: '설정', exact: true })
    2) <h2 class="text-lg font-semibold">모델 설정</h2> aka getByRole('heading', { name: '모델 설정' })

Call log:
  - waiting for getByRole('heading', { name: '설정' }) to be visible


## Browser Errors
