# Telemetry

Shared telemetry types, the client, and event helpers live in this directory.

## Adding a new event

Add first-party Paperclip events to `TelemetryEventName` in `types.ts`, then add a small helper in
`events.ts` so call sites keep event names and dimensions consistent.

The `plugin.${string}` template literal in `TelemetryEventName` is an escape valve for plugin-owned
events. It allows any `plugin.<name>` event to be tracked today without editing `types.ts`.

```ts
telemetry.track("plugin.my-new-event", { context: "value" });
```

Once the Phase 1 registry lands, new events should be registered there instead of relying on this
escape valve.
