import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ generate: vi.fn(), fallback: vi.fn() }));
vi.mock("@/platform/infra/ai-models", () => ({ getPrimaryModel: () => ({ label: "google/gemini-2.5-flash", model: {} }), getFallbackModel: calls.fallback }));
vi.mock("@/platform/infra/model-calls", () => ({ generateModelText: calls.generate }));
import { ModelBudgetPausedError, ModelBudgetUnavailableError } from "@/platform/infra/business-ai-budget";
import { defaultGenerate } from "@/products/work-plans/generation";
import { createWorkPlanRequestSchema } from "@/products/work-plans/contracts";
const input = { workspaceId: "11111111-1111-4111-8111-111111111111", userGoal: "Private original intent", evidence: [], allowedOperations: [], approvedModelLabels: ["google/gemini-2.5-flash"] };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_PLANNING_ENABLED", "1"); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "unit-placeholder"); vi.stubEnv("AI_FALLBACK_PROVIDER", ""); calls.generate.mockResolvedValue({ result: { output: {} } }); });
afterEach(() => vi.unstubAllEnvs());
it("refuses a different actual server provider before sending private intent", async () => {
 await expect(defaultGenerate({ ...input, approvedModelLabels: ["openai/other"] })).rejects.toThrow("approved model restriction");
 expect(calls.generate).not.toHaveBeenCalled();
});
it("refuses an unapproved fallback before any primary request", async () => {
 vi.stubEnv("AI_FALLBACK_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "unit-placeholder"); calls.fallback.mockReturnValue({ label: "openai/other", model: {} });
 await expect(defaultGenerate(input)).rejects.toThrow("approved model restriction"); expect(calls.generate).not.toHaveBeenCalled();
});
it("uses the same admitted server model set for the actual generation call", async () => {
 await defaultGenerate(input); expect(calls.generate).toHaveBeenCalledOnce();
 const dispatch = calls.generate.mock.calls[0];
 if (!dispatch) throw new Error("Actual model dispatch was not recorded.");
 expect(dispatch[2].models.map((model: { label: string }) => model.label)).toEqual(input.approvedModelLabels);
});
it("request restriction cannot configure arbitrary providers or exceed the bounded fallback set", () => {
 const request = { workspaceId: "11111111-1111-4111-8111-111111111111", userGoal: "A private plan", planningEconomics: { jobId: "22222222-2222-4222-8222-222222222222", executionKey: "one", maximumCents: 100, approvedModelLabels: input.approvedModelLabels } };
 expect(createWorkPlanRequestSchema.safeParse(request).success).toBe(true);
 expect(createWorkPlanRequestSchema.safeParse({ ...request, planningEconomics: { ...request.planningEconomics, approvedModelLabels: ["arbitrary/provider"] } }).success).toBe(false);
});

it.each([new ModelBudgetPausedError(0, 0), new ModelBudgetUnavailableError()])("retains an honest non-model plan on budget refusal", async (error) => {
 calls.generate.mockRejectedValue(error);
 const result = await defaultGenerate(input);
 expect(result).toMatchObject({ generation: "non_model", noProviderCall: true, output: { status: "needs_scoping", proposedOutputs: [] } });
 expect((result as { output: { summary: string } }).output.summary).toContain(error.message);
 expect(calls.generate.mock.calls[0]?.[0]).toMatchObject({ workspaceId: input.workspaceId, purpose: "work_plan" });
});
it("retains uncertain cost when a later fallback admission fails", async () => {
 calls.generate.mockImplementation(async (_context, _options, controls) => {
   try { await controls.wrapAttempt({}, async () => { throw new Error("primary failed after dispatch"); }); } catch {}
   return controls.wrapAttempt({}, async () => { throw new ModelBudgetUnavailableError(); });
 });
 expect(await defaultGenerate(input)).toMatchObject({ generation: "non_model", noProviderCall: false });
});
