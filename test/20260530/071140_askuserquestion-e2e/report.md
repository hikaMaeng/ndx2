# askUserQuestion E2E
- status: failed
- mode: scenario
- testedUrl: http://localhost:18082/
- mockRequests: 2
- trace: /work/test/20260530/071140_askuserquestion-e2e/trace.zip
- screenshots: 3
- error: locator.waitFor: Timeout 60000ms exceeded.
Call log:
  - waiting for getByLabel('Iteration 2 assistant text').filter({ hasText: 'E2E_ASKUSERQUESTION_DONE' }) to be visible
    123 × locator resolved to hidden <section aria-label="Iteration 2 assistant text" class="min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/70 p-3">…</section>

## Screenshots
- /work/test/20260530/071140_askuserquestion-e2e/screenshots/01-home.png
- /work/test/20260530/071140_askuserquestion-e2e/screenshots/02-new-session.png
- /work/test/20260530/071140_askuserquestion-e2e/screenshots/03-question-dialog.png
## Browser Errors
