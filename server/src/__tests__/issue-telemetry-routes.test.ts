import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIssueService = vi.hoisted(() => ({
  getRelationSummaries: vi.fn(),
  getById: vi.fn(),
  getWakeableParentAfterChildCompletion: vi.fn(),
  listWakeableBlockedDependents: vi.fn(),
  update: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockTrackAgentTaskCompleted = vi.hoisted(() => vi.fn());
const mockTrackProductFirstTaskCompleted = vi.hoisted(() => vi.fn());
const mockTrackTaskBlocked = vi.hoisted(() => vi.fn());
const mockTrackTaskCompleted = vi.hoisted(() => vi.fn());
const mockTrackTaskCreated = vi.hoisted(() => vi.fn());
const mockTrackTaskReopened = vi.hoisted(() => vi.fn());
const mockTrackTaskStatusChanged = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());
const mockDbSelectWhere = vi.hoisted(() => vi.fn(() => ({
  then: (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve([{ companyId: "company-1", permissions: null }]).then(onFulfilled, onRejected),
})));
const mockDbSelectFrom = vi.hoisted(() => vi.fn(() => ({ where: mockDbSelectWhere })));
const mockDbSelect = vi.hoisted(() => vi.fn(() => ({ from: mockDbSelectFrom })));
const mockDb = vi.hoisted(() => ({
  select: mockDbSelect,
}));

function registerModuleMocks() {
  vi.doMock("@paperclipai/shared/telemetry", () => ({
    trackAgentTaskCompleted: mockTrackAgentTaskCompleted,
    trackErrorHandlerCrash: vi.fn(),
    trackProductFirstTaskCompleted: mockTrackProductFirstTaskCompleted,
    trackTaskBlocked: mockTrackTaskBlocked,
    trackTaskCompleted: mockTrackTaskCompleted,
    trackTaskCreated: mockTrackTaskCreated,
    trackTaskReopened: mockTrackTaskReopened,
    trackTaskStatusChanged: mockTrackTaskStatusChanged,
  }));

  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));

  vi.doMock("../services/index.js", () => ({
    companyService: () => ({
      getById: vi.fn(async () => ({ id: "company-1", attachmentMaxBytes: 10 * 1024 * 1024 })),
    }),
    accessService: () => ({
      canUser: vi.fn(),
      decide: vi.fn(async () => ({
        allowed: true,
        action: "issue:mutate",
        reason: "allow_test",
        explanation: "Allowed by test mock.",
      })),
      hasPermission: vi.fn(),
    }),
    agentService: () => mockAgentService,
    documentAnnotationService: () => ({ remapOpenThreadsForDocument: async () => [] }),
    documentService: () => ({}),
    executionWorkspaceService: () => ({}),
    feedbackService: () => ({}),
    goalService: () => ({}),
    heartbeatService: () => ({
      wakeup: vi.fn(async () => undefined),
      reportRunActivity: vi.fn(async () => undefined),
    }),
    instanceSettingsService: () => ({}),
    issueApprovalService: () => ({}),
    issueReferenceService: () => ({
      deleteDocumentSource: async () => undefined,
      diffIssueReferenceSummary: () => ({
        addedReferencedIssues: [],
        removedReferencedIssues: [],
        currentReferencedIssues: [],
      }),
      emptySummary: () => ({ outbound: [], inbound: [] }),
      listIssueReferenceSummary: async () => ({ outbound: [], inbound: [] }),
      syncComment: async () => undefined,
      syncDocument: async () => undefined,
      syncIssue: async () => undefined,
    }),
    issueThreadInteractionService: () => ({
      listForIssue: vi.fn(async () => []),
      expireRequestConfirmationsSupersededByComment: vi.fn(async () => []),
      expireStaleRequestConfirmationsForIssueDocument: vi.fn(async () => []),
    }),
    issueRecoveryActionService: () => ({
      getActiveForIssue: vi.fn(async () => null),
      listActiveForIssues: vi.fn(async () => new Map()),
    }),
    issueService: () => mockIssueService,
    logActivity: vi.fn(async () => undefined),
    projectService: () => ({}),
    routineService: () => ({
      syncRunStatusForIssue: vi.fn(async () => undefined),
    }),
    workProductService: () => ({}),
  }));
}

function makeIssue(status: "todo" | "done" | "blocked" | "cancelled") {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "company-1",
    status,
    workMode: "standard",
    priority: "high",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    createdByUserId: "local-board",
    identifier: "PAP-1018",
    title: "Telemetry test",
  };
}

async function createApp(actor: Record<string, unknown>) {
  const [{ errorHandler }, { issueRoutes }] = await Promise.all([
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    vi.importActual<typeof import("../routes/issues.js")>("../routes/issues.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", issueRoutes(mockDb as any, {} as any));
  app.use(errorHandler);
  return app;
}

describe("issue telemetry routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@paperclipai/shared/telemetry");
    vi.doUnmock("../telemetry.js");
    vi.doUnmock("../services/index.js");
    vi.doUnmock("../routes/issues.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockGetTelemetryClient.mockReturnValue({
      track: vi.fn(),
      hasTrackedEventName: vi.fn(() => false),
    });
    mockIssueService.getById.mockResolvedValue(makeIssue("todo"));
    mockIssueService.getRelationSummaries.mockResolvedValue({
      blockedBy: [{ id: "blocker-1" }, { id: "blocker-2" }],
      blocks: [],
    });
    mockIssueService.getWakeableParentAfterChildCompletion.mockResolvedValue(null);
    mockIssueService.listWakeableBlockedDependents.mockResolvedValue([]);
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue("todo"),
      ...patch,
    }));
    mockDbSelect.mockImplementation(() => ({ from: mockDbSelectFrom }));
    mockDbSelectFrom.mockImplementation(() => ({ where: mockDbSelectWhere }));
    mockDbSelectWhere.mockImplementation(() => ({
      then: (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve([{ companyId: "company-1", permissions: null }]).then(onFulfilled, onRejected),
    }));
  });

  it("emits task-completed telemetry with the agent role, adapter type, and model", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: "agent-1",
      companyId: "company-1",
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: { model: "claude-sonnet-4-6" },
    });

    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      runId: null,
    });
    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "done" });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(mockTrackAgentTaskCompleted).toHaveBeenCalledWith({
        agentRole: "engineer",
        agentId: "agent-1",
        adapterType: "codex_local",
        model: "claude-sonnet-4-6",
      });
    });
    expect(mockTrackTaskStatusChanged).toHaveBeenCalledWith({
      from: "todo",
      to: "done",
      workMode: "standard",
    });
    expect(mockTrackTaskCompleted).toHaveBeenCalledWith({
      outcome: "done",
      workMode: "standard",
    });
    expect(mockTrackProductFirstTaskCompleted).toHaveBeenCalledWith();
  }, 10_000);

  it("does not emit agent task-completed telemetry for board-driven completions", async () => {
    const app = await createApp({
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    });
    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "done" });

    expect(res.status).toBe(200);
    expect(mockTrackAgentTaskCompleted).not.toHaveBeenCalled();
    expect(mockAgentService.getById).not.toHaveBeenCalled();
    expect(mockTrackTaskCompleted).toHaveBeenCalledWith({
      outcome: "done",
      workMode: "standard",
    });
  });

  it("emits task blocked telemetry with blocker count", async () => {
    const app = await createApp({
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "blocked" });

    expect(res.status).toBe(200);
    expect(mockTrackTaskStatusChanged).toHaveBeenCalledWith({
      from: "todo",
      to: "blocked",
      workMode: "standard",
    });
    expect(mockTrackTaskBlocked).toHaveBeenCalledWith({
      hasBlockerCount: 2,
    });
  });

  it("emits task reopened telemetry when a closed issue returns to todo", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue("done"));
    mockIssueService.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...makeIssue("done"),
      ...patch,
    }));
    const app = await createApp({
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .patch("/api/issues/11111111-1111-4111-8111-111111111111")
      .send({ status: "todo" });

    expect(res.status).toBe(200);
    expect(mockTrackTaskReopened).toHaveBeenCalledWith({
      from: "done",
      workMode: "standard",
    });
  });
});
