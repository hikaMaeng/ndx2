# askUserQuestion E2E
- status: failed
- mode: scenario
- testedUrl: http://localhost:18082/
- mockRequests: 1
- trace: /work/test/20260530/095123_askuserquestion-ui-e2e/trace.zip
- screenshots: 2
- error: locator.waitFor: Error: strict mode violation: getByRole('dialog').filter({ hasText: 'ASK_USER_QUESTION_LONG_HEADER' }).getByText(/추가 답변|Additional answer/) resolved to 3 elements:
    1) <span class="ndx-wrap-anywhere whitespace-pre-wrap text-xs leading-5 text-zinc-500">이 선택지는 현재 구현을 유지하면서 긴 질문, 긴 선택지, 추가 답변, 이미지 붙여넣기 …</span> aka getByLabel('응답 필요').getByText('이 선택지는 현재 구현을 유지하면서 긴 질문, 긴 선택지, 추가 답변, 이미지 붙여넣기 첨부가 모두 다음 모델 이터레이션으로 전달되는지 검증합니')
    2) <span class="ndx-wrap-anywhere whitespace-pre-wrap text-xs leading-5 text-zinc-500">현재 턴을 취소하고 이미지와 추가 답변이 모델로 전달되지 않는 경로를 검증합니다.</span> aka getByText('현재 턴을 취소하고 이미지와 추가 답변이 모델로 전달되지 않는 경로를 검증합니다.', { exact: true })
    3) <label class="grid gap-1 text-sm text-zinc-300">…</label> aka getByText('추가 답변', { exact: true })

Call log:
  - waiting for getByRole('dialog').filter({ hasText: 'ASK_USER_QUESTION_LONG_HEADER' }).getByText(/추가 답변|Additional answer/) to be visible

## Screenshots
- /work/test/20260530/095123_askuserquestion-ui-e2e/screenshots/01-home.png
- /work/test/20260530/095123_askuserquestion-ui-e2e/screenshots/02-new-session.png
## Browser Errors
