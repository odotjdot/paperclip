import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setTelemetryTracker,
  trackAgentCreated,
  trackAgentFirstHeartbeat,
  trackAgentTaskCompleted,
  trackInteractionCreated,
  trackInteractionResolved,
  trackInstallCompleted,
  trackProductFirstTaskCompleted,
  trackSkillInvoked,
  trackTaskBlocked,
  trackTaskCompleted,
  trackTaskCreated,
  trackTaskReopened,
  trackTaskStatusChanged,
} from "@paperclipai/shared/telemetry";
import type { TelemetryTracker } from "@paperclipai/shared/telemetry";

function createTracker(): TelemetryTracker {
  return {
    track: vi.fn(),
    hashPrivateRef: vi.fn((value: string) => `hashed:${value}`),
  };
}

describe("shared telemetry agent events", () => {
  afterEach(() => {
    setTelemetryTracker(null);
  });

  it("includes agent_id for agent.created", () => {
    const tracker = createTracker();
    setTelemetryTracker(tracker);

    trackAgentCreated({
      agentRole: "engineer",
      agentId: "11111111-1111-4111-8111-111111111111",
    });

    expect(tracker.track).toHaveBeenCalledWith("agent.created", {
      agent_role: "engineer",
      agent_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("includes agent_id for agent.first_heartbeat", () => {
    const tracker = createTracker();
    setTelemetryTracker(tracker);

    trackAgentFirstHeartbeat({
      agentRole: "coder",
      agentId: "22222222-2222-4222-8222-222222222222",
    });

    expect(tracker.track).toHaveBeenCalledWith("agent.first_heartbeat", {
      agent_role: "coder",
      agent_id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("includes agent_id for agent.task_completed", () => {
    const tracker = createTracker();
    setTelemetryTracker(tracker);

    trackAgentTaskCompleted({
      agentRole: "qa",
      agentId: "33333333-3333-4333-8333-333333333333",
    });

    expect(tracker.track).toHaveBeenCalledWith("agent.task_completed", {
      agent_role: "qa",
      agent_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("keeps non-agent event dimensions unchanged", () => {
    const tracker = createTracker();
    setTelemetryTracker(tracker);

    trackInstallCompleted({ adapterType: "codex_local" });

    expect(tracker.track).toHaveBeenCalledWith("install.completed", {
      adapter_type: "codex_local",
    });
    expect(tracker.track).not.toHaveBeenCalledWith(
      "install.completed",
      expect.objectContaining({ agent_id: expect.any(String) }),
    );
  });

  it("tracks task lifecycle dimensions", () => {
    const tracker = createTracker();
    setTelemetryTracker(tracker);

    trackTaskCreated({ workMode: "standard", priority: "high", hasAssignee: true });
    trackTaskStatusChanged({ from: "todo", to: "blocked", workMode: "standard" });
    trackTaskCompleted({ outcome: "done", workMode: "standard" });
    trackTaskBlocked({ hasBlockerCount: 2 });
    trackTaskReopened({ from: "done", workMode: "standard" });
    trackProductFirstTaskCompleted();

    expect(tracker.track).toHaveBeenCalledWith("task.created", {
      work_mode: "standard",
      priority: "high",
      has_assignee: true,
    });
    expect(tracker.track).toHaveBeenCalledWith("task.status_changed", {
      from: "todo",
      to: "blocked",
      work_mode: "standard",
    });
    expect(tracker.track).toHaveBeenCalledWith("task.completed", {
      outcome: "done",
      work_mode: "standard",
    });
    expect(tracker.track).toHaveBeenCalledWith("task.blocked", {
      has_blocker_count: 2,
    });
    expect(tracker.track).toHaveBeenCalledWith("task.reopened", {
      from: "done",
      work_mode: "standard",
    });
    expect(tracker.track).toHaveBeenCalledWith("product.first_task_completed");
  });

  it("tracks interaction and skill telemetry dimensions", () => {
    const tracker = createTracker();
    setTelemetryTracker(tracker);

    trackInteractionCreated({
      kind: "request_confirmation",
      continuationPolicy: "wake_assignee",
    });
    trackInteractionResolved({
      kind: "request_confirmation",
      outcome: "accepted",
    });
    trackSkillInvoked({
      sourceType: "company_skill",
      skillRef: "paperclip",
    });

    expect(tracker.track).toHaveBeenCalledWith("interaction.created", {
      kind: "request_confirmation",
      continuation_policy: "wake_assignee",
    });
    expect(tracker.track).toHaveBeenCalledWith("interaction.resolved", {
      kind: "request_confirmation",
      outcome: "accepted",
    });
    expect(tracker.track).toHaveBeenCalledWith("skill.invoked", {
      source_type: "company_skill",
      skill_ref: "paperclip",
    });
  });
});
