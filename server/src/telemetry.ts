import path from "node:path";
import {
  TelemetryClient,
  resolveTelemetryConfig,
  loadOrCreateState,
  saveTelemetryState,
  setTelemetryTracker,
} from "@paperclipai/shared/telemetry";
import type { TelemetryEventName } from "@paperclipai/shared/telemetry";
import { resolvePaperclipInstanceRoot } from "./home-paths.js";
import { serverVersion } from "./version.js";

let client: TelemetryClient | null = null;

export const telemetry = {
  track(
    eventName: TelemetryEventName,
    dimensions?: Record<string, string | number | boolean>,
  ): void {
    client?.track(eventName, dimensions);
  },
  async flush(): Promise<void> {
    await client?.flush();
  },
  stop(): void {
    client?.stop();
  },
  hashPrivateRef(value: string): string {
    return client?.hashPrivateRef(value) ?? value;
  },
};

export function initTelemetry(fileConfig?: { enabled?: boolean }): TelemetryClient | null {
  if (client) {
    setTelemetryTracker(telemetry);
    return client;
  }

  const config = resolveTelemetryConfig(fileConfig);
  if (!config.enabled) {
    setTelemetryTracker(null);
    return null;
  }

  const stateDir = path.join(resolvePaperclipInstanceRoot(), "telemetry");
  client = new TelemetryClient(
    config,
    () => loadOrCreateState(stateDir, serverVersion),
    serverVersion,
    (state) => saveTelemetryState(stateDir, state),
  );
  client.setContext({ component: "server" });
  client.startPeriodicFlush(60_000);
  setTelemetryTracker(telemetry);
  return client;
}

export function getTelemetryClient(): TelemetryClient | null {
  return client;
}
