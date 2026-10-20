# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What it is

ioBroker adapter for [ZoneMinder](https://zoneminder.com/). It polls the ZoneMinder REST API for the monitor
list, mirrors every monitor as a device `cam_<Id>`, lets the user switch a monitor's function / enabled flag, and
optionally listens to the [zmEventNotification](https://github.com/ZoneMinder/zmeventnotification) server for alarms.

## Commands

```bash
npm run build              # tsc -p tsconfig.build.json: src/ -> build/ (gitignored, common.nogit: true)
npm run check              # type check only
npm run lint               # eslint (@iobroker/eslint-config); fix with: npx eslint -c eslint.config.mjs --fix src
npm test                   # = test:package
npm run test:integration   # starts a real js-controller, fails if one is already running on the machine
npm run translate          # translate admin/i18n/en.json into the other languages
```

There is no `prepare` script on purpose: the build only runs via `npm run build` and in CI (`build: true`).
There is no `tasks.ts`: the admin is pure JsonConfig, so nothing is left to do besides `tsc`.

## Architecture

- `src/main.ts` — `ZoneminderAdapter extends utils.Adapter`, compact-mode export at the end.
  - `onReady`: creates `ZoneMinder`, wires its events, starts polling (`setMonitors` every `pollingMon` s).
  - `connect` event (after every successful login, also on token renewal) → `createMonitors()`:
    creates `history.LastzmEvent.*`, and per monitor `cam_<Id>` (device) with channels `info`, `monitor`
    (and `zmEvent` if enabled). Devices that no longer exist in ZoneMinder are deleted (only the device object).
  - `findState()` maps raw API keys to state kinds (`size` → MB, `level` → %, `default_num`, `text`, `date`, …);
    `Function` / `Enabled` (kind `null`) only get their value written, their objects are created explicitly.
  - `onStateChange`: writes to `cam_<Id>.monitor.Function` / `.Enabled` are POSTed to `/api/monitors/<Id>.json`
    and acknowledged when ZoneMinder answers `{"message":"Saved"}`.
  - `alarm` event → `cam_<Id>.zmEvent.*` and `history.LastzmEvent.*` (video and snapshot URL incl. auth).
- `src/lib/api.ts` — `ZoneMinder extends EventEmitter` (`connect`, `error`, `alarm`).
  - Login via `/api/host/login.json`: token auth (`access_token` / `refresh_token`, renewed by timers) or the
    legacy `credentials` auth key. `authUrl` is appended to every API and stream URL.
  - HTTP via `axios`; `request()` never throws, it logs, emits `error` and returns `null`.
  - zmEventNotification via `websocket` on `wss://<host>:9000/` (self-signed certificates accepted).
- `src/lib/types.ts` — API payloads. `src/lib/utils.ts` — `FUNCSTATES`, `ZM_EVENT_PLACEHOLDER`, `bToMb`.
- `src/lib/adapter-config.d.ts` — typed `this.config`; must match `native` in `io-package.json` and
  `admin/jsonConfig.json`.

## Conventions

- Object IDs, roles, `native` keys and defaults must not change — existing installations depend on them.
- Timers only via `this.setTimeout` / `this.adapter.setTimeout` so they are cleared on unload.
- `password` is stored unencrypted in `native` (historically) — do not switch to `encryptedNative`, that would
  invalidate stored credentials.
- `pollingMonState` is configurable in the admin but not used by the backend.
- Instances configured with the old HTML admin may hold `pollingMon` as string, hence `Number(...)`.

## Release

`npm run release-patch|minor|major` (`@alcalzone/release-script`, plugins `iobroker`, `license`, `manual-review`).
Add changelog lines under `### **WORK IN PROGRESS**` in `README.md`; do not edit `common.news` by hand.
