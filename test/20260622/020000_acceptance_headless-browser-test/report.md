# Headless Browser Acceptance Test

- status: failed
- mode: scenario
- testedUrl: http://127.0.0.1:18080
- finalUrl: http://127.0.0.1:18080/
- documentStatus: 200
- trace: /work/test/20260622/020000_acceptance_headless-browser-test/trace.zip
- screenshots: 1
- consoleErrors: 0
- pageErrors: 0

## Screenshots
- /work/test/20260622/020000_acceptance_headless-browser-test/screenshots/failure-2-open-home-shell.png

## Step Results
- 1. health endpoints respond: passed
- 2. open home shell: failed - locator.waitFor: Error: strict mode violation: getByText('/프로젝트|projects/iu') resolved to 2 elements:
    1) <h2 id="project-list-title-desktop" class="text-xs font-semibold uppercase text-zinc-500">Projects</h2> aka getByRole('heading', { name: 'Projects' })
    2) <p class="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">No projects added</p> aka getByText('No projects added')

Call log:
  - waiting for getByText('/프로젝트|projects/iu') to be visible


## Failure
locator.waitFor: Error: strict mode violation: getByText('/프로젝트|projects/iu') resolved to 2 elements:
    1) <h2 id="project-list-title-desktop" class="text-xs font-semibold uppercase text-zinc-500">Projects</h2> aka getByRole('heading', { name: 'Projects' })
    2) <p class="rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500">No projects added</p> aka getByText('No projects added')

Call log:
  - waiting for getByText('/프로젝트|projects/iu') to be visible

    at /work/test/20260622/020000_acceptance_headless-browser-test/acceptance-scenario.mjs:89:45
    at async step (/work/test/20260622/020000_acceptance_headless-browser-test/acceptance-scenario.mjs:44:19)
    at async file:///work/test/20260622/020000_acceptance_headless-browser-test/acceptance-scenario.mjs:84:3

## Browser Errors