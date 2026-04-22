import type { TenantConfig } from "./types";

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

function getTwilioConfig(tenantConfig?: TenantConfig | null): TwilioConfig | null {
  // Tenant-level config takes priority
  if (tenantConfig?.twilioConfig?.accountSid) {
    return tenantConfig.twilioConfig;
  }
  // Fall back to platform env vars
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (accountSid && authToken && phoneNumber) {
    return { accountSid, authToken, phoneNumber };
  }
  return null;
}

export async function sendSms(
  to: string,
  body: string,
  tenantConfig?: TenantConfig | null
): Promise<{ sid: string }> {
  const config = getTwilioConfig(tenantConfig);

  if (!config) {
    console.log(`[SMS dev] To: ${to}\n${body}`);
    return { sid: `mock_${Date.now()}` };
  }

  const { accountSid, authToken, phoneNumber } = config;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: phoneNumber, Body: body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return { sid: data.sid };
}
