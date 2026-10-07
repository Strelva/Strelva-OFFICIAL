import { bookingAgentsEnabled } from "@/platform/bookings/flags";
import { bookingJson } from "../_shared";
const string = { type: "string" };
const tenant = { name: "tenant", in: "path", required: true, schema: string };
const ok = { "200": { description: "Success" }, "400": { description: "Invalid input" }, "404": { description: "Not found" }, "429": { description: "Rate limited" }, "503": { description: "Unavailable or disabled" } };
export function GET() {
  if (!bookingAgentsEnabled()) return bookingJson({ error: "Agent bookings are not enabled." }, 503);
  return bookingJson({ openapi: "3.1.0", info: { title: "Strelva Bookings", version: "1.0.0", description: "An agent receives a 15-minute hold. Only the customer's emailed confirmation places the booking. Ten agent holds per business per hour; 20 requests per IP window." },
    paths: {
      "/api/v1/bookings/{tenant}/services": { get: { operationId: "list_services", parameters: [tenant], responses: ok } },
      "/api/v1/bookings/{tenant}/slots": { get: { operationId: "find_slots", parameters: [tenant, ...["service", "from", "to"].map(name => ({ name, in: "query", required: true, schema: string }))], responses: ok } },
      "/api/v1/bookings/{tenant}/reservations": { post: { operationId: "request_booking", parameters: [tenant], requestBody: { required: true, content: { "application/json": { schema: { type: "object", additionalProperties: false,
        required: ["origin", "serviceId", "start", "requestId", "agent", "customer"], properties: {
          origin: { const: "agent" }, serviceId: string, start: { type: "string", format: "date-time" }, requestId: { type: "string", pattern: "^[A-Za-z0-9_-]{8,80}$" },
          agent: { type: "object", required: ["name"], properties: { name: string } },
          customer: { type: "object", required: ["name", "email"], properties: { name: string, email: { type: "string", format: "email" }, phone: string } },
          intakeAnswers: { type: "object", maxProperties: 8, propertyNames: { pattern: "^[A-Za-z0-9_-]{1,80}$" }, additionalProperties: { type: "string", maxLength: 2000 } },
        } } } } }, responses: { ...ok, "201": { description: "Held, not confirmed. Receipt contains reservationId, status, start, end, confirmationRequired and statusToken. No confirmation or management token is exposed to the agent." }, "409": { description: "Taken, paused, changed request or tenant hold limit reached" } } } },
      "/api/v1/bookings/{tenant}/status": { get: { operationId: "get_booking_status", parameters: [tenant, { name: "token", in: "query", required: true, schema: string }], responses: ok } },
    },
  });
}
