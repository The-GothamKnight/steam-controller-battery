# Steam Controller Battery development

## Requirements

- Millennium with Starlight support
- Bun

## Commands

```powershell
bun install
bun run watch
bun test
bunx tsc --noEmit
bun run pack
```

`bun run pack` creates a release `.star` package and writes it to the output
configured by Starlight. Use it only while Steam is closed because its current
output path installs the package directly into Millennium.

## Project structure

- `frontend/battery-state.ts` reads and normalizes Steam's ControllerStore.
- `frontend/index.tsx` owns polling, lifecycle, and the React FFI export.
- `frontend/steam-battery-indicator.tsx` renders the title-bar indicator.
- `frontend/xenon-reconciliation.ts` publishes changes and reconciles Xenon.
- `backend/main.lua` provides the Starlight FFI and the Steam UI patch.
- `tests/` covers state serialization, reconciliation, indicator state,
  shutdown behavior, backend contracts, and the current Steam patch target.

## Controller state

The frontend samples `ControllerStore` every two seconds. It recognizes Steam
Controller hardware by Steam's vendor/product identifiers, with Steam's device
name as a fallback. Battery values are rounded to percentages. A transient
100% report is held briefly while Steam finishes synchronizing a newly observed
controller state.

The normalized state contains only `connected`, `battery`, `charging`,
`wireless`, and `syncing` when it is sent to Xenon.

## Steam UI integration

The Starlight backend patch targets Steam's desktop `TitleBarControls` icon
bar. It prepends the `SteamBatteryIndicator` FFI component before Steam's first
native child and leaves every native child in its original order. The patch has
no dependency on the announcements control.

The React indicator uses `useSyncExternalStore`; mounting and unmounting stay
inside Steam's React tree.

## Xenon integration

Lua is the only component that calls Xenon's loopback API. `publish_state`
uses `POST /state/set`; `ensure_state` reads `GET /state/get` and posts only
when Xenon is missing or differs from the current controller state.

Controller changes publish immediately. A healthy state is reconciled every
30 seconds. When Xenon is unavailable, reconciliation uses a 30, 60, 120, then
300 second backoff. Xenon is optional and does not affect Steam indicator
updates.

## Lifecycle

`SteamClient.User.RegisterForShutdownStart` handles normal Steam shutdown. The
frontend stops its timers and reconciler, then requests one final canonical
disconnected publication without waiting, retrying, or blocking Steam exit.

Lua `on_unload` makes a separate best-effort disconnected publication for
plugin disable or clean backend shutdown. A normal WebHelper/UI reload
unregisters the shutdown callback and does not intentionally publish a
disconnected state. A crash or forced process termination cannot guarantee the
final publication; the plugin deliberately has no heartbeat or expiry fallback.