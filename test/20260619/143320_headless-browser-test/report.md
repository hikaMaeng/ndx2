# Headless Browser Test Report

- Status: fail-functional-zero-llm-analysis
- Tested URL: http://127.0.0.1:18080
- External URL: http://127.0.0.1:18082
- Kind: scenario-based
- Screenshots:
  - screenshots/01-home.png
  - screenshots/02-selfcheck-ready.png
  - screenshots/03-selfcheck-after-llm.png
- Console errors: 0
- Page errors: 0

## Finding

LLM 분석 button sends POST /api/agent/selfcheck/run, but the response reports zero LLM analyses. Current selfcheck.model is "". Visible message: "실행 완료: 후보 0건, LLM 분석 0건, selfcheck 0건".

## Steps

- smoke: {"name":"smoke","at":"2026-06-19T05:35:22.925Z","title":"NDX vibe","hasMain":1}
- open-selfcheck-ready: {"name":"open-selfcheck-ready","at":"2026-06-19T05:36:19.609Z","selfcheckSettings":{"enabled":true,"model":"","defaultIntervalMs":3600000,"defaultBatchSize":100,"maxLlmAnalysesPerRun":20,"maxEvidenceChars":12000}}
- click-llm-analysis: {"name":"click-llm-analysis","at":"2026-06-19T05:36:19.898Z","status":200,"response":{"runid":"307d9c33-2810-4ff7-a591-9666921fe9b5","createdCandidates":0,"llmAnalyses":0,"createdChecks":0,"dedupedChecks":0},"visibleMessage":"실행 완료: 후보 0건, LLM 분석 0건, selfcheck 0건"}
