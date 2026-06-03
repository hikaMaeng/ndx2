# askUserQuestion E2E
- status: failed
- mode: scenario
- testedUrl: http://localhost:18082/
- mockRequests: 0
- trace: /work/test/20260530/065415_askuserquestion-e2e/trace.zip
- screenshots: 3
- error: locator.waitFor: Error: strict mode violation: getByText('E2E_ASKUSERQUESTION_DONE') resolved to 5 elements:
    1) <span class="block min-w-0 truncate" title="E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자 응답을 받은 뒤 최종 답변에 E2E_ASKUSERQUESTION_DONE 문자열을 포함하세요.">E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자…</span> aka getByRole('button', { name: 'E2E 테스트입니다.\\n반드시' }).first()
    2) <span class="block min-w-0 truncate" title="E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자 응답을 받은 뒤 최종 답변에 E2E_ASKUSERQUESTION_DONE 문자열을 포함하세요.">E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자…</span> aka getByRole('button', { name: 'E2E 테스트입니다.\\n반드시' }).nth(1)
    3) <span class="block min-w-0 truncate" title="E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자 응답을 받은 뒤 최종 답변에 E2E_ASKUSERQUESTION_DONE 문자열을 포함하세요.">E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자…</span> aka getByRole('button', { name: 'E2E 테스트입니다.\\n반드시' }).nth(2)
    4) <h1 class="text-2xl font-semibold leading-8 text-zinc-50" id="session-page-title-019e77aa-c767-7c4b-bf24-98c6372dcb81">E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자…</h1> aka getByRole('heading', { name: 'E2E 테스트입니다.\\n반드시' })
    5) <p class="ndx-wrap-anywhere whitespace-pre-wrap">E2E 테스트입니다.\n반드시 askUserQuestion 도구를 먼저 호출하고, 사용자…</p> aka getByTestId('user-chat-message').getByText('E2E 테스트입니다.\\n반드시')

Call log:
  - waiting for getByText('E2E_ASKUSERQUESTION_DONE') to be visible

## Screenshots
- /work/test/20260530/065415_askuserquestion-e2e/screenshots/01-home.png
- /work/test/20260530/065415_askuserquestion-e2e/screenshots/02-new-session.png
- /work/test/20260530/065415_askuserquestion-e2e/screenshots/03-question-dialog.png
## Browser Errors
