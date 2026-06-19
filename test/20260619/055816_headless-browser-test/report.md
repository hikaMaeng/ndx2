# Headless Browser Test

- status: failed
- mode: scenario
- testedUrl: http://127.0.0.1:18080/
- finalUrl: http://127.0.0.1:18080/
- documentStatus: 200
- title: NDX vibe
- mainPresent: true
- consoleErrors: 0
- pageErrors: 0
- trace: /mnt/f/dev/ndx2/test/20260619/055816_headless-browser-test/trace.zip
- screenshots: 2

## Screenshots
- /mnt/f/dev/ndx2/test/20260619/055816_headless-browser-test/screenshots/01-home.png
- /mnt/f/dev/ndx2/test/20260619/055816_headless-browser-test/screenshots/failure-4-click.png

## Step Results
- 1. goto: passed
- 2. assertRole: passed
- 3. screenshot: passed
- 4. click: failed - locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '설정' })
    - locator resolved to <button type="button" class="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable


## Browser Errors
