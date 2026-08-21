# OA_WL-TestAutomation

Playwright automation tests covering three portals:

- **OA/** — the ecdconnect app (QA + staging environments)
- **WL/** — the whitelabel portal (QA, staging, and prod variants)
- **GG/** — GrowGreat / CHW Connect (QA + staging environments)

`GoogleSearch.test.js` at the root is an unrelated sanity check that a browser can launch and search Google.

## Setup

```
npm install
npx playwright install   # downloads the browser binaries, first time only
```

## Running tests

```
npm test          # run everything
npm run test:oa   # just OA/
npm run test:wl   # just WL/
npm run test:gg   # just GG/
npx playwright test OA/signup.test.js   # a single spec
```

Tests run serially, headed, with no retries (`playwright.config.js`) — several of these scripts create real accounts against live staging/prod environments, so parallel workers or automatic retries risk double-submitting data.

## Screenshots

Each app writes its run screenshots to `<app>/screenshots/`. New screenshots aren't tracked by git (see `.gitignore`); the ones already committed are historical references kept from earlier runs.

## Test data

Repeated OA test data (phone numbers, address, ID digits) lives in `OA/testdata.js` rather than being duplicated inline across specs.
