import { describe, expect, it, vi } from "vitest";
import {
  assertBusinessAiBudget,
  ModelAgencyCapReachedError,
  ModelAiPausedError,
  ModelBudgetPausedError,
  ModelBudgetUnavailableError,
  type AiControlsState,
  type BusinessAiBudgetV2,
} from "@/platform/infra/business-ai-budget";

const WS = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const both = { STRELVA_BUSINESS_AI_BUDGET: "1", STRELVA_AI_CONTROLS_RELEASE: "1" };
const controlsOnly = { STRELVA_AI_CONTROLS_RELEASE: "1" };
const none: AiControlsState = { paused: false, monthlyCapCents: null, reviewAutoPost: "client_choice", revision: 0, setBy: null, changedAt: null };
const agency = { kind: "agency" as const, agencyName: "North Studio" };
const budget = (over: Partial<BusinessAiBudgetV2> = {}, controls: Partial<AiControlsState> = {}): BusinessAiBudgetV2 => ({
  spentUsd: "0", reservedUsd: "0", since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z",
  capCents: null, subscribed: true, unknownCostCalls: 0, controls: { ...none, ...controls }, ...over,
});
const context = { purpose: "ask" as const, workspaceId: WS, maximumCostUsd: "0.01" };
const PURPOSES = ["ask", "ask.background", "rebuild", "work_plan", "report", "review_reply", "suggestion", "weekly_brief"] as const;

describe("per-client usage controls in admission", () => {
  it("reads nothing with both flags off", async () => {
    const read = vi.fn();
    await expect(assertBusinessAiBudget(context, { environment: {}, read })).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("legacy managed client keeps AI with no controls row", async () => {
    const reserveV2 = vi.fn();
    await expect(assertBusinessAiBudget(context, { environment: both, read: async () => budget(), reserveV2 })).resolves.toBeNull();
    expect(reserveV2).not.toHaveBeenCalled();
  });

  it.each(PURPOSES)("refuses %s while paused, naming the agency, and stays a budget pause", async purpose => {
    const read = async () => budget({}, { paused: true, setBy: agency });
    const error = await assertBusinessAiBudget({ ...context, purpose }, { environment: both, read }).catch(failure => failure);
    expect(error).toBeInstanceOf(ModelAiPausedError);
    expect(error).toBeInstanceOf(ModelBudgetPausedError);
    expect(error.message).toContain("North Studio paused Strelva work");
  });

  it("names a Strelva operator when an operator paused it, and leaves the operator purpose alone", async () => {
    const read = vi.fn(async () => budget({}, { paused: true, setBy: { kind: "operator" as const, agencyName: null } }));
    await expect(assertBusinessAiBudget(context, { environment: both, read })).rejects.toThrow("paused for this business by a Strelva operator");
    await expect(assertBusinessAiBudget({ ...context, purpose: "operator" }, { environment: both, read })).resolves.toBeNull();
    await expect(assertBusinessAiBudget({ ...context, purpose: "visibility_probe" }, { environment: both, read })).resolves.toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("applies an agency limit with the payer budget flag off, without the base cap", async () => {
    const reserveV2 = vi.fn(async () => ({ status: "reserved" as const, reason: null, reservationId: ID, budget: budget({ spentUsd: "0.5" }, { monthlyCapCents: 100 }) }));
    const read = async () => budget({ spentUsd: "0.5" }, { monthlyCapCents: 100 });
    await expect(assertBusinessAiBudget({ ...context, ceilingSource: "list_price" }, { environment: controlsOnly, read, reserveV2 })).resolves.toBe(ID);
    expect(reserveV2).toHaveBeenCalledWith(WS, "0.01", null, false, "list_price", true);
  });

  it("takes the lower of the payer cap and the agency limit, and says who set it when reached", async () => {
    const read = async () => budget({ spentUsd: "1", capCents: 500 }, { monthlyCapCents: 100, setBy: agency });
    const error = await assertBusinessAiBudget(context, { environment: both, read }).catch(failure => failure);
    expect(error).toBeInstanceOf(ModelAgencyCapReachedError);
    expect(error).toBeInstanceOf(ModelBudgetPausedError);
    expect(error.message).toContain("North Studio set a monthly limit");
    expect(error.message).toContain("resets Nov 1");
  });

  it("keeps the payer cap error when the payer cap is the lower one", async () => {
    const read = async () => budget({ spentUsd: "1", capCents: 100 }, { monthlyCapCents: 500, setBy: agency });
    const error = await assertBusinessAiBudget(context, { environment: both, read }).catch(failure => failure);
    expect(error).toBeInstanceOf(ModelBudgetPausedError);
    expect(error).not.toBeInstanceOf(ModelAgencyCapReachedError);
  });

  it.each([
    ["controls", ModelAiPausedError],
    ["agency_cap", ModelAgencyCapReachedError],
    ["cap", ModelBudgetPausedError],
  ] as const)("maps the database's %s decision to its error", async (reason, expected) => {
    const read = async () => budget({ capCents: 500 }, { monthlyCapCents: 400, setBy: agency });
    const reserveV2 = async () => ({ status: "paused" as const, reason, reservationId: null, budget: budget({ spentUsd: "3.99", capCents: 500 }, { monthlyCapCents: 400, setBy: agency, paused: reason === "controls" }) });
    const error = await assertBusinessAiBudget(context, { environment: both, read, reserveV2 }).catch(failure => failure);
    expect(error).toBeInstanceOf(expected);
    if (reason === "cap") expect(error).not.toBeInstanceOf(ModelAgencyCapReachedError);
  });

  it("will not guess when a capped client has unknown historical cost", async () => {
    const read = async () => budget({ unknownCostCalls: 1 }, { monthlyCapCents: 100 });
    await expect(assertBusinessAiBudget(context, { environment: both, read })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
  });

  it("treats a read that lacks the controls as unavailable when controls are on", async () => {
    const { controls: _controls, ...v1 } = budget();
    await expect(assertBusinessAiBudget(context, { environment: both, read: async () => v1 as never })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
  });
});
