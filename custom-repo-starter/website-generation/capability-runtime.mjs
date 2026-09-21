// Browser runtime for a generated site's explicitly published capabilities.
// It uses the same versioned public protocol as inquiry-client.ts and
// booking-client.ts, without exposing workspace, provider, or grant ids.

const TENANT = /^[a-z0-9-]+$/;
const TOKEN = /^[A-Za-z0-9._~-]{8,2048}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function publicEndpoint(config, resource, suffix = "") {
  const base = text(config.baseUrl).trim().replace(/\/$/, "");
  const tenant = text(config.tenant).trim();
  if (!/^https?:\/\//i.test(base) || !TENANT.test(tenant)) throw new Error("This published capability is unavailable.");
  return `${base}/api/v1/${resource}/${encodeURIComponent(tenant)}${suffix}`;
}

async function jsonResponse(response, fallback) {
  let body = null;
  try { body = await response.json(); } catch { /* use the stable fallback */ }
  if (!response.ok) {
    const error = record(body);
    throw new Error(typeof error?.error === "string" ? error.error : fallback);
  }
  if (!record(body)) throw new Error(fallback);
  return body;
}

function inquiryForm(value, expected) {
  const item = record(value);
  const form = item && record(item.form);
  if (!item || item.schemaVersion !== 1 || item.capabilityId !== expected.capabilityId || item.version !== expected.version || !text(item.name) ||
    !form || form.component !== "form" || form.disclosure !== "Strelva" || !text(form.id) || !text(form.title) || !text(form.intro) ||
    !Array.isArray(form.fields) || form.fields.length < 1 || form.fields.length > 30) return null;
  const ids = new Set();
  for (const field of form.fields) {
    if (!record(field) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(text(field.id)) || ids.has(field.id) || !text(field.label) || typeof field.required !== "boolean") return null;
    if (!["text", "email", "phone", "date", "textarea", "select"].includes(field.kind)) return null;
    if (field.kind === "select" && (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 100 || !field.options.every(option => typeof option === "string"))) return null;
    ids.add(field.id);
  }
  return item;
}

function bookingSchedule(value, expected) {
  const item = record(value);
  if (!item || item.schemaVersion !== 1 || item.capabilityId !== expected.capabilityId || item.version !== expected.version || !text(item.name) ||
    !["outlook", "google"].includes(item.provider) || !text(item.timeZone) || !Array.isArray(item.slots) || item.slots.length > 500) return null;
  if (!item.slots.every(slot => record(slot) && TOKEN.test(text(slot.id)) && ISO.test(text(slot.start)) && ISO.test(text(slot.end)) && Date.parse(slot.end) > Date.parse(slot.start))) return null;
  return item;
}

function bookingReceipt(value, expected) {
  const item = record(value)?.receipt ?? record(value)?.reservation ?? value;
  if (!record(item) || item.schemaVersion !== 1 || !TOKEN.test(text(item.reservationId)) || !TOKEN.test(text(item.managementToken)) ||
    item.capabilityId !== expected.capabilityId || item.version !== expected.version || !["outlook", "google"].includes(item.provider) ||
    !["confirmed", "pending", "cancelled"].includes(item.status) || !text(item.title) || !ISO.test(text(item.start)) || !ISO.test(text(item.end)) ||
    Date.parse(item.end) <= Date.parse(item.start) || !text(item.timeZone)) return null;
  return item;
}

function visitor(value) {
  const item = record(value);
  const name = text(item?.name).trim().slice(0, 160);
  const email = text(item?.email).trim().toLowerCase().slice(0, 320);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter your name and a valid email address.");
  const message = text(item?.message).trim().slice(0, 2_000);
  return { name, email, ...(message ? { message } : {}) };
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return `request-${globalThis.crypto.randomUUID()}`;
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return `request-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
    } catch { /* fail closed below */ }
  }
  throw new Error("Booking requests require a secure random source. Please use a modern browser and try again.");
}

function bookingRequestKey(config, schedule, slot, visitorValue) {
  const source = JSON.stringify({
    baseUrl: text(config.baseUrl).trim().replace(/\/$/, ""),
    tenant: text(config.tenant),
    capabilityId: schedule.capabilityId,
    version: schedule.version,
    slotId: slot.id,
    visitor: visitorValue,
  });
  // Keep visitor details out of the storage key while making a different
  // visitor or slot receive a different replay id in this browser session.
  let left = 2166136261;
  let right = 2654435761;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ (code + index), 2246822519);
  }
  return `strelva:booking-request:${(left >>> 0).toString(16)}${(right >>> 0).toString(16)}`;
}

function durableRequestId(key, memory) {
  try {
    const stored = globalThis.sessionStorage?.getItem(key);
    if (stored && TOKEN.test(stored)) return stored;
  } catch { /* session storage can be unavailable in privacy-restricted browsers */ }
  const inMemory = memory.get(key);
  if (inMemory) return inMemory;
  const generated = requestId();
  memory.set(key, generated);
  try { globalThis.sessionStorage?.setItem(key, generated); } catch { /* fall back to the in-memory request */ }
  return generated;
}

function clearDurableRequestId(key, value, memory) {
  if (memory.get(key) === value) memory.delete(key);
  try {
    if (globalThis.sessionStorage?.getItem(key) === value) globalThis.sessionStorage.removeItem(key);
  } catch { /* nothing to clear when storage is unavailable */ }
}

export function createCapabilityApi(fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") throw new Error("This published capability is unavailable.");
  const requestIds = new Map();
  return {
    async loadInquiry(config, signal) {
      const expected = config.inquiry;
      const response = await fetcher(`${publicEndpoint(config, "inquiries")}?capabilityId=${encodeURIComponent(expected.capabilityId)}`, { credentials: "omit", cache: "no-store", signal });
      const value = inquiryForm(await jsonResponse(response, "This inquiry form is unavailable. Please contact the business directly."), expected);
      if (!value) throw new Error("This inquiry form could not be loaded.");
      return value;
    },
    async submitInquiry(config, definition, fields) {
      const response = await fetcher(publicEndpoint(config, "leads"), {
        method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilityId: definition.capabilityId, capabilityVersion: definition.version, fields, name: fields.name, email: fields.email, message: fields.message ?? fields.request, source: "inquiry-capability" }),
      });
      const value = await jsonResponse(response, response.status === 409 ? "This form changed. Reload it before sending your request." : "Your request was not confirmed. Please try again.");
      if (value.ok !== true) throw new Error("Your request was not confirmed. Please try again.");
    },
    async loadBooking(config, signal) {
      const expected = config.booking;
      const url = new URL(publicEndpoint(config, "bookings"));
      url.searchParams.set("capabilityId", expected.capabilityId);
      url.searchParams.set("from", expected.range.from);
      url.searchParams.set("to", expected.range.to);
      const value = bookingSchedule(await jsonResponse(await fetcher(url, { credentials: "omit", cache: "no-store", signal }), "Booking availability is unavailable. Please try again."), expected);
      if (!value) throw new Error("This booking schedule could not be loaded.");
      return value;
    },
    async reserveBooking(config, schedule, slot, input) {
      const expected = config.booking;
      const visitorValue = visitor(input);
      const requestKey = bookingRequestKey(config, schedule, slot, visitorValue);
      const request = durableRequestId(requestKey, requestIds);
      const body = { capabilityId: schedule.capabilityId, capabilityVersion: schedule.version, slotId: slot.id, visitor: visitorValue, requestId: request };
      const value = bookingReceipt(await jsonResponse(await fetcher(publicEndpoint(config, "bookings", "/reservations"), { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "That time could not be reserved. Please choose another time."), expected);
      if (!value) throw new Error("The booking service returned an incomplete receipt.");
      clearDurableRequestId(requestKey, request, requestIds);
      return value;
    },
    async changeBooking(config, receipt, slot) {
      const expected = config.booking;
      const body = { managementToken: receipt.managementToken, capabilityId: receipt.capabilityId, capabilityVersion: receipt.version, slotId: slot.id };
      const value = bookingReceipt(await jsonResponse(await fetcher(publicEndpoint(config, "bookings", `/reservations/${encodeURIComponent(receipt.reservationId)}`), { method: "PATCH", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "That time could not be changed. Please choose another time."), expected);
      if (!value) throw new Error("The booking service returned an incomplete receipt.");
      return value;
    },
    async readbackBooking(config, receipt) {
      const expected = config.booking;
      const value = bookingReceipt(await jsonResponse(await fetcher(publicEndpoint(config, "bookings", `/reservations/${encodeURIComponent(receipt.reservationId)}/readback`), { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managementToken: receipt.managementToken }) }), "This booking status could not be checked. Please try again."), expected);
      if (!value) throw new Error("The booking service returned an incomplete receipt.");
      return value;
    },
    async cancelBooking(config, receipt) {
      const expected = config.booking;
      const value = bookingReceipt(await jsonResponse(await fetcher(publicEndpoint(config, "bookings", `/reservations/${encodeURIComponent(receipt.reservationId)}`), { method: "DELETE", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managementToken: receipt.managementToken }) }), "This booking could not be cancelled. Please try again."), expected);
      if (!value) throw new Error("The booking service returned an incomplete receipt.");
      return value;
    },
  };
}

function element(tag, textContent, attributes = {}) {
  const node = document.createElement(tag);
  if (textContent !== undefined) node.textContent = textContent;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function status(root, message, role = "alert") {
  root.replaceChildren(element("p", message, { role }));
}

function mountInquiry(root, config, api) {
  void api.loadInquiry(config).then(definition => {
    const form = element("form", undefined, { "aria-label": definition.form.title });
    form.append(element("h2", definition.form.title), element("p", definition.form.intro));
    const fields = [];
    for (const field of definition.form.fields) {
      const id = `strelva-${field.id}`;
      const label = element("label", `${field.label}${field.required ? " (required)" : ""}`, { for: id });
      let input;
      if (field.kind === "textarea") input = element("textarea");
      else if (field.kind === "select") {
        input = element("select");
        input.append(element("option", "Choose an option", { value: "" }));
        for (const option of field.options) input.append(element("option", option, { value: option }));
      } else input = element("input", undefined, { type: field.kind === "phone" ? "tel" : field.kind });
      input.id = id; input.name = field.id; input.required = field.required; if (field.placeholder) input.placeholder = field.placeholder;
      const wrapper = element("div"); wrapper.append(label, input); form.append(wrapper); fields.push(input);
    }
    const submit = element("button", "Send request", { type: "submit" });
    const result = element("p", undefined, { role: "status" });
    form.append(element("p", "Strelva helps this business handle your request."), submit, result);
    form.addEventListener("submit", event => {
      event.preventDefault(); submit.disabled = true; result.textContent = "";
      const values = Object.fromEntries(fields.map(field => [field.name, String(field.value).trim()]));
      void api.submitInquiry(config, definition, values).then(() => { form.reset(); result.textContent = "Your request has been received."; }, error => { result.textContent = error instanceof Error ? error.message : "Your request was not confirmed. Please try again."; }).finally(() => { submit.disabled = false; });
    });
    root.replaceChildren(form);
  }, error => status(root, error instanceof Error ? error.message : "This inquiry form is unavailable."));
}

function slotLabel(slot, timeZone) {
  try {
    const format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone });
    return `${format.format(new Date(slot.start))}–${format.format(new Date(slot.end))}`;
  } catch { return `${slot.start}–${slot.end}`; }
}

function mountBooking(root, config, api) {
  void api.loadBooking(config).then(schedule => {
    if (!schedule.slots.length) {
      status(root, "No booking times are available right now. Please contact the business directly.", "status");
      return;
    }
    let currentSchedule = schedule;
    const wrapper = element("section", undefined, { "aria-label": schedule.name });
    wrapper.append(element("h2", schedule.name), element("p", `Choose a time. ${schedule.provider === "outlook" ? "Outlook" : "Google Calendar"} will confirm the reservation.`));
    const form = element("form", undefined, { "aria-label": "Reserve a time" });
    const slotSelect = element("select", undefined, { id: "strelva-booking-slot", name: "slot" });
    const renderSlots = () => {
      const selected = slotSelect.value;
      slotSelect.replaceChildren(...currentSchedule.slots.map(slot => element("option", slotLabel(slot, currentSchedule.timeZone), { value: slot.id })));
      if (currentSchedule.slots.some(slot => slot.id === selected)) slotSelect.value = selected;
    };
    renderSlots();
    const name = element("input", undefined, { id: "strelva-booking-name", name: "name", required: "true", maxlength: "160" });
    const email = element("input", undefined, { id: "strelva-booking-email", name: "email", type: "email", required: "true", maxlength: "320" });
    const message = element("textarea", undefined, { id: "strelva-booking-message", name: "message", maxlength: "2000" });
    form.append(element("label", "Available time", { for: "strelva-booking-slot" }), slotSelect, element("label", "Name", { for: "strelva-booking-name" }), name, element("label", "Email", { for: "strelva-booking-email" }), email, element("label", "Note (optional)", { for: "strelva-booking-message" }), message);
    const reserve = element("button", "Reserve time", { type: "submit" }); form.append(reserve);
    const result = element("p", undefined, { role: "status" }); form.append(result); wrapper.append(form);
    const receiptRoot = element("section", undefined, { "aria-label": "Booking receipt" }); wrapper.append(receiptRoot);
    let receipt = null;
    const updateReceipt = () => {
      receiptRoot.replaceChildren();
      if (!receipt) return;
      receiptRoot.append(element("h3", receipt.title), element("p", slotLabel(receipt, receipt.timeZone)), element("p", receipt.status === "confirmed" ? `${currentSchedule.provider === "outlook" ? "Outlook" : "Google Calendar"} confirmed this reservation.` : receipt.status === "cancelled" ? "This reservation is cancelled." : "We could not confirm this reservation yet. Check the calendar before trying again.", { role: "status" }));
      if (receipt.status === "cancelled") return;
      if (receipt.status === "pending") {
        const check = element("button", "Check booking status", { type: "button" });
        check.addEventListener("click", () => {
          check.disabled = true;
          void api.readbackBooking(config, receipt).then(next => {
            receipt = next;
            updateReceipt();
            result.textContent = next.status === "confirmed" ? "The reservation is confirmed." : next.status === "cancelled" ? "The reservation is cancelled." : "The reservation is still awaiting confirmation. Check the calendar before trying again.";
          }, error => {
            result.textContent = error instanceof Error ? error.message : "The booking status could not be checked. Please try again.";
            check.disabled = false;
          });
        });
        receiptRoot.append(check);
        return;
      }
      const change = element("button", "Change time", { type: "button" });
      change.addEventListener("click", () => { change.disabled = true; void api.changeBooking(config, receipt, currentSchedule.slots.find(slot => slot.id === slotSelect.value)).then(next => { receipt = next; updateReceipt(); }, error => { result.textContent = error instanceof Error ? error.message : "Your booking was not changed. Please try again."; }).finally(() => { change.disabled = false; }); });
      const cancel = element("button", "Cancel reservation", { type: "button" });
      cancel.addEventListener("click", () => { cancel.disabled = true; void api.cancelBooking(config, receipt).then(next => { receipt = next; updateReceipt(); }, error => { result.textContent = error instanceof Error ? error.message : "Your booking was not cancelled. Please try again."; }).finally(() => { cancel.disabled = false; }); });
      receiptRoot.append(change, cancel);
    };
    form.addEventListener("submit", event => { event.preventDefault(); reserve.disabled = true; result.textContent = ""; void api.reserveBooking(config, currentSchedule, currentSchedule.slots.find(slot => slot.id === slotSelect.value), { name: name.value, email: email.value, message: message.value }).then(next => { receipt = next; updateReceipt(); result.textContent = next.status === "confirmed" ? "Your time is reserved." : "Your request was received for confirmation."; form.reset(); }, error => { result.textContent = error instanceof Error ? error.message : "Your booking was not confirmed. Please try again."; }).finally(() => { reserve.disabled = false; }); });
    root.replaceChildren(wrapper);
  }, error => status(root, error instanceof Error ? error.message : "Booking availability is unavailable."));
}

export function mountPublishedCapabilities(scope = document) {
  const roots = scope.querySelectorAll("[data-strelva-capability]");
  for (const root of roots) {
    let config;
    try { config = JSON.parse(root.getAttribute("data-strelva-config") || ""); } catch { status(root, "This published capability is unavailable."); continue; }
    const kind = root.getAttribute("data-strelva-capability");
    if ((kind !== "inquiry" && kind !== "booking") || !record(config) || !text(config.baseUrl) || !TENANT.test(text(config.tenant)) || (kind === "inquiry" ? !record(config.inquiry) : !record(config.booking))) {
      status(root, "This published capability is unavailable."); continue;
    }
    const api = createCapabilityApi();
    if (kind === "inquiry") mountInquiry(root, config, api); else mountBooking(root, config, api);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountPublishedCapabilities());
  else mountPublishedCapabilities();
}
