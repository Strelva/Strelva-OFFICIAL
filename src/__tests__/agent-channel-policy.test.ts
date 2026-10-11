import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/platform/infra/inquiry-records",()=>({inquiryRecordsRpc:f.rpc}));
import { agentConfirmationEmailAllowed } from "@/platform/agent-channel/policy";
const workspaceId="ac161100-0000-4000-8000-000000000010";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("STRELVA_WORKSPACE_RELEASE","1");vi.stubEnv("STRELVA_AGENT_CHANNEL_RELEASE","1");vi.stubEnv("CUSTOMER_EMAIL_ENABLED","true");vi.stubEnv("EMAIL_SENDING_ENABLED","false");vi.stubEnv("STRELVA_BOOKING_REMINDERS","0");vi.stubEnv("STRELVA_BOOKING_OWNER_NOTICE","0");f.rpc.mockResolvedValue({enabled:true,killed:false,workspaceId});});
afterEach(()=>vi.unstubAllEnvs());
describe("isolated agent customer confirmation policy",()=>{
 it("requires explicit native business consent+release while owner notices and reminders stay off",async()=>{expect(await agentConfirmationEmailAllowed(`workspace:${workspaceId}`)).toBe(true);expect(f.rpc).toHaveBeenCalledWith("read_agent_channel_policy",{p_scope:`workspace:${workspaceId}`});expect(process.env.EMAIL_SENDING_ENABLED).toBe("false");expect(process.env.STRELVA_BOOKING_REMINDERS).toBe("0");});
 it("fails closed when consent, release, customer delivery or policy read is unavailable",async()=>{f.rpc.mockResolvedValue({enabled:false,killed:false,workspaceId});expect(await agentConfirmationEmailAllowed(`workspace:${workspaceId}`)).toBe(false);f.rpc.mockRejectedValue(new Error("read outage"));expect(await agentConfirmationEmailAllowed(`workspace:${workspaceId}`)).toBe(false);vi.stubEnv("CUSTOMER_EMAIL_ENABLED","false");f.rpc.mockClear();expect(await agentConfirmationEmailAllowed(`workspace:${workspaceId}`)).toBe(false);expect(f.rpc).not.toHaveBeenCalled();vi.stubEnv("CUSTOMER_EMAIL_ENABLED","true");vi.stubEnv("STRELVA_AGENT_CHANNEL_RELEASE","0");expect(await agentConfirmationEmailAllowed(`workspace:${workspaceId}`)).toBe(false);});
});
