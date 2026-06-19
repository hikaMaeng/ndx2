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
- trace: /mnt/f/dev/ndx2/test/20260619/20260619-060305_headless-browser-test/trace.zip
- screenshots: 3

## Screenshots
- /mnt/f/dev/ndx2/test/20260619/20260619-060305_headless-browser-test/screenshots/01-home.png
- /mnt/f/dev/ndx2/test/20260619/20260619-060305_headless-browser-test/screenshots/02-selfcheck-ready.png
- /mnt/f/dev/ndx2/test/20260619/20260619-060305_headless-browser-test/screenshots/failure.png

## Step Results
- 1. goto: passed
- 2. open settings: passed
- 3. open selfcheck: passed
- 4. scenario: failed - locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByText('분석 모델 키를 저장한 뒤 LLM 분석을 실행하세요.') to be visible


## Browser Errors
