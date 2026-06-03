# askUserQuestion E2E
- status: failed
- mode: scenario
- testedUrl: http://localhost:18082/
- mockRequests: 1
- trace: /work/test/20260530/093624_askuserquestion-ui-e2e/trace.zip
- screenshots: 2
- error: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('dialog').filter({ hasText: 'ASK_USER_QUESTION_LONG_HEADER' }).getByRole('heading', { name: /응답 필요|Response needed/ }) to be visible

## Screenshots
- /work/test/20260530/093624_askuserquestion-ui-e2e/screenshots/01-home.png
- /work/test/20260530/093624_askuserquestion-ui-e2e/screenshots/02-new-session.png
## Browser Errors
