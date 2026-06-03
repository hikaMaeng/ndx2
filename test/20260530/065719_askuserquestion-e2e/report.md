# askUserQuestion E2E
- status: failed
- mode: scenario
- testedUrl: http://localhost:18082/
- mockRequests: 0
- trace: /work/test/20260530/065719_askuserquestion-e2e/trace.zip
- screenshots: 3
- error: locator.waitFor: Error: strict mode violation: getByText('사용자 응답을 받아 다음 이터레이션까지 진행했습니다.') resolved to 2 elements:
    1) <div class="ndx-wrap-anywhere whitespace-pre-wrap text-sm leading-6 text-zinc-300">E2E_ASKUSERQUESTION_DONE: 사용자 응답을 받아 다음 이터레이션까지 진…</div> aka getByLabel('Iteration 2 assistant text').getByText('E2E_ASKUSERQUESTION_DONE: 사용자 응답을 받아 다음 이터레이션까지 진행했습니다')
    2) <p>E2E_ASKUSERQUESTION_DONE: 사용자 응답을 받아 다음 이터레이션까지 진…</p> aka getByRole('paragraph').filter({ hasText: 'E2E_ASKUSERQUESTION_DONE: 사용자 응답을 받아 다음 이터레이션까지 진행했습니다' })

Call log:
  - waiting for getByText('사용자 응답을 받아 다음 이터레이션까지 진행했습니다.') to be visible

## Screenshots
- /work/test/20260530/065719_askuserquestion-e2e/screenshots/01-home.png
- /work/test/20260530/065719_askuserquestion-e2e/screenshots/02-new-session.png
- /work/test/20260530/065719_askuserquestion-e2e/screenshots/03-question-dialog.png
## Browser Errors
