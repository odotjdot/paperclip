export { TelemetryClient } from "./client.js";
export { resolveTelemetryConfig } from "./config.js";
export { loadOrCreateState, saveTelemetryState } from "./state.js";
export {
  getTelemetryTracker,
  setTelemetryTracker,
  trackInstallStarted,
  trackInstallCompleted,
  trackCompanyImported,
  trackProjectCreated,
  trackRoutineCreated,
  trackRoutineRun,
  trackTaskCreated,
  trackTaskStatusChanged,
  trackTaskCompleted,
  trackTaskBlocked,
  trackTaskReopened,
  trackProductFirstTaskCompleted,
  trackGoalCreated,
  trackAgentCreated,
  trackSkillImported,
  trackSkillInvoked,
  trackInteractionCreated,
  trackInteractionResolved,
  trackAgentFirstHeartbeat,
  trackAgentTaskCompleted,
  trackErrorHandlerCrash,
} from "./events.js";
export type { TelemetryTracker } from "./events.js";
export type {
  TelemetryConfig,
  TelemetryDimensions,
  TelemetryState,
  TelemetryEvent,
  TelemetryEventEnvelope,
  TelemetryEventName,
} from "./types.js";
