# Headless Browser Test

- status: failed
- mode: scenario
- inputUrl: http://127.0.0.1:18082
- finalUrl: http://127.0.0.1:18082/
- title: NDX vibe
- consoleErrors: 0
- pageErrors: 0
- trace: test/20260702/053640_headless-browser-test/trace.zip
- screenshots: 2

## Step Results
- 1. open webclient home: passed
- 2. open settings and model patch tab: failed - locator.click: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /설정|settings/i }).or(getByText('설정', { exact: true })).first()[22m
[2m    - locator resolved to <button type="button" class="justify-center whitespace-nowrap rounded-md disabled:pointer-events-none disabled:opacity-50 bg-zinc-100 hover:bg-white px-3 inline-flex h-8 items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950">…</button>[22m
[2m  - attempting click action[22m
[2m    - waiting for element to be visible, enabled and stable[22m

- 3. failure: failed - locator.click: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /설정|settings/i }).or(getByText('설정', { exact: true })).first()[22m
[2m    - locator resolved to <button type="button" class="justify-center whitespace-nowrap rounded-md disabled:pointer-events-none disabled:opacity-50 bg-zinc-100 hover:bg-white px-3 inline-flex h-8 items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950">…</button>[22m
[2m  - attempting click action[22m
[2m    - waiting for element to be visible, enabled and stable[22m


## Screenshots
- test/20260702/053640_headless-browser-test/screenshots/webclient-home.png
- test/20260702/053640_headless-browser-test/screenshots/failure.png

## Browser Errors
