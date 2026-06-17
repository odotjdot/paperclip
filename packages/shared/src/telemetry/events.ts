import type { TelemetryEventName } from "./types.js";

export interface TelemetryTracker {
  track(eventName: TelemetryEventName, dimensions?: Record<string, string | number | boolean>): void;
  hashPrivateRef(value: string): string;
}

let telemetryTracker: TelemetryTracker | null = null;

export function setTelemetryTracker(tracker: TelemetryTracker | null): void {
  telemetryTracker = tracker;
}

export function getTelemetryTracker(): TelemetryTracker | null {
  return telemetryTracker;
}

export function trackInstallStarted(): void {
  telemetryTracker?.track("install.started");
}

export function trackInstallCompleted(dims: { adapterType: string }): void {
  telemetryTracker?.track("install.completed", { adapter_type: dims.adapterType });
}

export function trackCompanyImported(dims: {
  sourceType: string;
  sourceRef: string;
  isPrivate: boolean;
}): void {
  if (!telemetryTracker) return;
  const ref = dims.isPrivate ? telemetryTracker.hashPrivateRef(dims.sourceRef) : dims.sourceRef;
  telemetryTracker.track("company.imported", {
    source_type: dims.sourceType,
    source_ref: ref,
    source_ref_hashed: dims.isPrivate,
  });
}

export function trackProjectCreated(): void {
  telemetryTracker?.track("project.created");
}

export function trackRoutineCreated(): void {
  telemetryTracker?.track("routine.created");
}

export function trackRoutineRun(dims: { source: string; status: string }): void {
  telemetryTracker?.track("routine.run", {
    source: dims.source,
    status: dims.status,
  });
}

export function trackTaskCreated(dims: {
  workMode: string;
  priority: string;
  hasAssignee: boolean;
}): void {
  telemetryTracker?.track("task.created", {
    work_mode: dims.workMode,
    priority: dims.priority,
    has_assignee: dims.hasAssignee,
  });
}

export function trackTaskStatusChanged(dims: { from: string; to: string; workMode: string }): void {
  telemetryTracker?.track("task.status_changed", {
    from: dims.from,
    to: dims.to,
    work_mode: dims.workMode,
  });
}

export function trackTaskCompleted(dims: { outcome: "done" | "cancelled"; workMode: string }): void {
  telemetryTracker?.track("task.completed", {
    outcome: dims.outcome,
    work_mode: dims.workMode,
  });
}

export function trackTaskBlocked(dims: { hasBlockerCount: number }): void {
  telemetryTracker?.track("task.blocked", {
    has_blocker_count: dims.hasBlockerCount,
  });
}

export function trackTaskReopened(dims: { from: "done" | "cancelled"; workMode: string }): void {
  telemetryTracker?.track("task.reopened", {
    from: dims.from,
    work_mode: dims.workMode,
  });
}

export function trackProductFirstTaskCompleted(): void {
  telemetryTracker?.track("product.first_task_completed");
}

export function trackGoalCreated(dims?: { goalLevel?: string | null }): void {
  telemetryTracker?.track("goal.created", dims?.goalLevel ? { goal_level: dims.goalLevel } : undefined);
}

export function trackAgentCreated(dims: { agentRole: string; agentId?: string }): void {
  telemetryTracker?.track("agent.created", {
    agent_role: dims.agentRole,
    ...(dims.agentId ? { agent_id: dims.agentId } : {}),
  });
}

export function trackSkillImported(dims: { sourceType: string; skillRef?: string | null }): void {
  telemetryTracker?.track("skill.imported", {
    source_type: dims.sourceType,
    ...(dims.skillRef ? { skill_ref: dims.skillRef } : {}),
  });
}

export function trackSkillInvoked(dims: { sourceType: string; skillRef?: string | null }): void {
  telemetryTracker?.track("skill.invoked", {
    source_type: dims.sourceType,
    ...(dims.skillRef ? { skill_ref: dims.skillRef } : {}),
  });
}

export function trackInteractionCreated(dims: { kind: string; continuationPolicy: string }): void {
  telemetryTracker?.track("interaction.created", {
    kind: dims.kind,
    continuation_policy: dims.continuationPolicy,
  });
}

export function trackInteractionResolved(dims: {
  kind: string;
  outcome: "accepted" | "rejected" | "expired" | "superseded" | "cancelled";
}): void {
  telemetryTracker?.track("interaction.resolved", {
    kind: dims.kind,
    outcome: dims.outcome,
  });
}

export function trackAgentFirstHeartbeat(dims: { agentRole: string; agentId?: string }): void {
  telemetryTracker?.track("agent.first_heartbeat", {
    agent_role: dims.agentRole,
    ...(dims.agentId ? { agent_id: dims.agentId } : {}),
  });
}

export function trackAgentTaskCompleted(dims: {
  agentRole: string;
  agentId?: string;
  adapterType?: string;
  model?: string;
}): void {
  telemetryTracker?.track("agent.task_completed", {
    agent_role: dims.agentRole,
    ...(dims.agentId ? { agent_id: dims.agentId } : {}),
    ...(dims.adapterType ? { adapter_type: dims.adapterType } : {}),
    ...(dims.model ? { model: dims.model } : {}),
  });
}

export function trackErrorHandlerCrash(dims: { errorCode: string }): void {
  telemetryTracker?.track("error.handler_crash", { error_code: dims.errorCode });
}
