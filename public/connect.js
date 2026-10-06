/*! Strelva connect.js — connects any website to a Strelva business.
 * <script src="https://app.strelva.com/connect.js" data-strelva-site="sk_pub_..." defer></script>
 * Optional: data-strelva-consent="required" (wait for strelva.consent(true)),
 *           data-strelva-capture="off" (never read the site's own forms).
 * No cookies. No keystrokes. Query strings are never sent. */
(function () {
  "use strict";
  var w = window, d = document;
  if (w.__strelvaConnect) return;
  w.__strelvaConnect = true;

  var script = d.currentScript || d.querySelector("script[data-strelva-site]");
  var key = script && script.getAttribute("data-strelva-site");
  if (!key || !/^sk_pub_[a-z0-9]{24}$/.test(key)) return;
  var origin;
  try { origin = new URL(script.src, location.href).origin; } catch (_e) { return; }
  var base = origin + "/api/v1/connect/" + key;
  var needConsent = script.getAttribute("data-strelva-consent") === "required";
  var captureOff = script.getAttribute("data-strelva-capture") === "off";

  var BOOKING_HOSTS = ["calendly.com", "acuityscheduling.com", "vagaro.com", "booksy.com", "mindbodyonline.com",
    "opentable.com", "resy.com", "setmore.com", "schedulicity.com"];
  var MAP_HOSTS = ["maps.apple.com", "maps.app.goo.gl"];
  var SKIP_NAME = /(^|[^a-z])(cc|card|cvv|cvc|csc)([^a-z]|$)|card.?num|credit|expir|password|passwd|ssn|social.?security|csrf|token|nonce|captcha/i;

  var started = false, granted = !needConsent, queue = [], timer = 0, lastPath = null, context = null, sid = null, formCount = 0;

  function rand(n) {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789", out = "", bytes = new Uint8Array(n), i;
    if (w.crypto && w.crypto.getRandomValues) w.crypto.getRandomValues(bytes);
    else for (i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < n; i++) out += chars[bytes[i] % 36];
    return out;
  }
  function session() {
    if (sid) return sid;
    try {
      sid = sessionStorage.getItem("strelva_sid");
      if (!sid || !/^[a-z0-9]{20,64}$/.test(sid)) { sid = rand(22); sessionStorage.setItem("strelva_sid", sid); }
    } catch (_e) { sid = sid || rand(22); }
    return sid;
  }

  function post(path, body, beacon) {
    var url = base + path, text = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(url, text)) return Promise.resolve(null); } catch (_e) { /* fall through */ }
    }
    if (!w.fetch) return Promise.resolve(null);
    // text/plain keeps this a simple CORS request: no preflight.
    return w.fetch(url, { method: "POST", body: text, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } })
      .catch(function () { return null; });
  }

  function flush(beacon) {
    if (timer) { clearTimeout(timer); timer = 0; }
    while (queue.length) post("/events", { sid: session(), events: queue.splice(0, 20) }, beacon);
  }

  function track(kind, target, ref) {
    if (!granted) return;
    var ev = { id: "e" + rand(20), kind: kind, at: Date.now(), path: location.pathname };
    if (ref) { try { ev.ref = new URL(ref).origin + "/"; } catch (_e) { /* no referrer */ } }
    if (target) ev.target = String(target).split(/[?#]/)[0].slice(0, 500);
    queue.push(ev);
    if (!timer) timer = setTimeout(function () { timer = 0; flush(false); }, 2000);
  }

  function visit(ref) {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    track("visit", null, ref);
  }

  function hostIs(host, list) {
    for (var i = 0; i < list.length; i++) if (host === list[i] || host.slice(-list[i].length - 1) === "." + list[i]) return true;
    return false;
  }
  function classify(href) {
    if (/^tel:/i.test(href)) return ["call_click", href];
    if (/^mailto:/i.test(href)) return ["email_click", href];
    var u;
    try { u = new URL(href, location.href); } catch (_e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    var host = u.hostname.toLowerCase().replace(/^www\./, ""), target = u.origin + u.pathname;
    if (hostIs(host, MAP_HOSTS) || (/(^|\.)google\.[a-z.]+$/.test(host) && /^\/maps/.test(u.pathname)) ||
      (host === "goo.gl" && /^\/maps/.test(u.pathname))) return ["directions_click", target];
    if (hostIs(host, BOOKING_HOSTS) || (host === "squareup.com" && /^\/appointments/.test(u.pathname)) ||
      /(^|[^a-z])book/i.test(u.pathname)) return ["booking_click", target];
    return null;
  }

  function onClick(e) {
    var el = e.target;
    while (el && el.nodeType === 1 && el.tagName !== "A") el = el.parentNode;
    if (!el || el.nodeType !== 1 || !el.getAttribute("href")) return;
    var hit = classify(el.getAttribute("href"));
    if (hit) track(hit[0], hit[1]);
  }

  // ---- Business facts ----------------------------------------------------
  var DAYS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  function clock(t) {
    var m = /^(\d{2}):(\d{2})$/.exec(t || "");
    if (!m) return t || "";
    var h = +m[1] % 24, ap = h < 12 ? "AM" : "PM", h12 = h % 12 || 12;
    return h12 + (m[2] === "00" ? "" : ":" + m[2]) + " " + ap;
  }
  function fill(facts) {
    var els = d.querySelectorAll("[data-strelva-fact]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i], k = el.getAttribute("data-strelva-fact"), v = facts[k];
      if (v == null) continue;
      if (k === "hours" && v.length) {
        while (el.firstChild) el.removeChild(el.firstChild);
        for (var j = 0; j < v.length; j++) {
          if (j) el.appendChild(d.createElement("br"));
          el.appendChild(d.createTextNode((DAYS[v[j].day] || v[j].day) + " " + (v[j].closed ? "Closed" : clock(v[j].opens) + " – " + clock(v[j].closes))));
        }
      } else if (k === "booking_url" && typeof v === "string") {
        // Keep the site's own button label; only point it at the current link.
        if (el.tagName === "A" && /^https?:\/\//.test(v)) el.setAttribute("href", v);
      } else if (k === "address" && typeof v === "object") {
        el.textContent = [v.street, v.locality, [v.region, v.postalCode].join(" ")].filter(Boolean).join(", ");
      } else if (typeof v === "string") {
        el.textContent = v;
        if (el.tagName === "A" && k === "phone") el.setAttribute("href", "tel:" + v.replace(/[^0-9+]/g, ""));
        if (el.tagName === "A" && k === "email") el.setAttribute("href", "mailto:" + v);
      }
    }
  }

  var BIZ_LD = /"@type"\s*:\s*\[?[^\]]*?"[A-Za-z]*(LocalBusiness|Organization|Corporation|Business|Store|Service|Restaurant|Establishment|Attorney|Dentist|Physician|Clinic|Salon|Contractor|Plumber|Electrician)"/;
  function hasOwnBusinessLd() {
    var s = d.querySelectorAll('script[type="application/ld+json"]:not([data-strelva])');
    for (var i = 0; i < s.length; i++) if (BIZ_LD.test(s[i].textContent || "")) return true;
    return false;
  }
  function injectLd(ld) {
    if (hasOwnBusinessLd()) return;
    var el = d.querySelector("script[data-strelva]");
    if (!el) { el = d.createElement("script"); el.type = "application/ld+json"; el.setAttribute("data-strelva", ""); d.head.appendChild(el); }
    el.textContent = JSON.stringify(ld);
  }

  function loadContext() {
    if (!w.fetch) return;
    w.fetch(base + "/context", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        if (!c || !c.site) return;
        context = c;
        api.facts = c.facts || {};
        fill(api.facts);
        if (c.site.injectSchema && c.jsonLd) injectLd(c.jsonLd);
      })
      .catch(function () { /* the site keeps working without Strelva */ });
  }

  // ---- The site's own forms ---------------------------------------------
  function fieldsOf(form) {
    var out = {}, n = 0, els = form.elements;
    for (var i = 0; i < els.length && n < 30; i++) {
      var el = els[i], type = (el.type || "").toLowerCase(), name = el.name || "";
      if (!name || el.disabled || /^(file|password|submit|button|reset|image)$/.test(type)) continue;
      if ((type === "checkbox" || type === "radio") && !el.checked) continue;
      if (type === "hidden" && name.charAt(0) === "_") continue;
      if (SKIP_NAME.test(name) || /^cc-/.test(el.getAttribute("autocomplete") || "")) continue;
      var value = String(el.value || "").trim();
      if (!value || value.length > 5000) continue;
      var clean = name.replace(/[^a-zA-Z0-9_ -]+/g, "_").replace(/^[^a-zA-Z]+/, "").slice(0, 64);
      if (!clean) continue;
      out[clean] = out[clean] ? (out[clean] + ", " + value).slice(0, 5000) : value;
      n++;
    }
    return n ? out : null;
  }
  function isContactForm(form) {
    return !!form.querySelector('input[type="email"],input[type="tel"],[name*="mail" i],[name*="phone" i]');
  }
  function onSubmit(e) {
    var form = e.target;
    if (!granted || captureOff || !context || !context.site.captureForms) return;
    if (!form || form.tagName !== "FORM" || form.hasAttribute("data-strelva-ignore") || form.hasAttribute("data-strelva-mounted")) return;
    if (!isContactForm(form)) return;
    var fields = fieldsOf(form);
    if (!fields) return;
    post("/inquiries", { id: "i" + rand(22), sid: session(), capture: "site-form", path: location.pathname, ref: d.referrer || undefined, fields: fields }, false);
  }

  // ---- The Strelva form ---------------------------------------------------
  var INPUT_STYLE = "display:block;width:100%;box-sizing:border-box;margin-top:.3em;padding:.6em .7em;font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.55);border-radius:6px";
  function field(form, id, label, tag, type, auto) {
    var wrap = d.createElement("div"), l = d.createElement("label"), input = d.createElement(tag);
    l.htmlFor = id; l.textContent = label;
    input.id = id; input.name = id.split("-").pop();
    if (type) input.type = type;
    if (auto) input.setAttribute("autocomplete", auto);
    if (tag === "textarea") input.rows = 4;
    input.setAttribute("style", INPUT_STYLE);
    wrap.appendChild(l); wrap.appendChild(input); form.appendChild(wrap);
    return input;
  }
  function mount(host) {
    if (host.hasAttribute("data-strelva-mounted")) return;
    host.setAttribute("data-strelva-mounted", "");
    var p = "strelva-f" + (++formCount) + "-", form = d.createElement("form");
    form.setAttribute("data-strelva-mounted", "");
    form.setAttribute("style", "display:grid;gap:.8em;font:inherit;color:inherit");
    form.noValidate = true;
    var name = field(form, p + "name", "Name", "input", "text", "name");
    var email = field(form, p + "email", "Email", "input", "email", "email");
    var phone = field(form, p + "phone", "Phone", "input", "tel", "tel");
    var message = field(form, p + "message", "How can we help?", "textarea");
    var trap = d.createElement("div");
    trap.setAttribute("aria-hidden", "true");
    trap.setAttribute("style", "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden");
    var hp = d.createElement("input");
    hp.name = "_hp"; hp.tabIndex = -1; hp.setAttribute("autocomplete", "off");
    trap.appendChild(hp); form.appendChild(trap);
    var button = d.createElement("button");
    button.type = "submit"; button.textContent = host.getAttribute("data-strelva-form-label") || "Send";
    button.setAttribute("style", "justify-self:start;padding:.7em 1.3em;font:inherit;cursor:pointer;border-radius:6px");
    form.appendChild(button);
    var status = d.createElement("p");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.setAttribute("style", "margin:0");
    form.appendChild(status);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!email.value.trim() && !phone.value.trim()) { status.textContent = "Add an email or phone number so we can reply."; email.focus(); return; }
      if (!message.value.trim() && !name.value.trim()) { status.textContent = "Tell us a little about what you need."; message.focus(); return; }
      button.disabled = true; status.textContent = "Sending…";
      var fields = {}, list = [name, email, phone, message];
      for (var i = 0; i < list.length; i++) if (list[i].value.trim()) fields[list[i].name] = list[i].value.trim().slice(0, 5000);
      w.fetch(base + "/inquiries", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ id: "i" + rand(22), sid: session(), capture: "strelva-form", path: location.pathname, ref: d.referrer || undefined, _hp: hp.value, fields: fields }) })
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          form.reset(); status.textContent = "Thanks. Your message was sent.";
        })
        .catch(function () { status.textContent = "That didn't send. Please try again, or call or email us."; })
        .then(function () { button.disabled = false; });
    });
    host.appendChild(form);
  }
  function mountAll() {
    var hosts = d.querySelectorAll("[data-strelva-form]");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  // ---- Start ---------------------------------------------------------------
  function patch(method) {
    var original = history[method];
    if (typeof original !== "function") return;
    history[method] = function () {
      var before = location.href, result = original.apply(this, arguments);
      setTimeout(function () { visit(before); }, 0);
      return result;
    };
  }
  function start() {
    if (started) return;
    started = true;
    visit(d.referrer);
    d.addEventListener("click", onClick, true);
    d.addEventListener("submit", onSubmit, true);
    patch("pushState"); patch("replaceState");
    w.addEventListener("popstate", function () { visit(null); });
    w.addEventListener("pagehide", function () { flush(true); });
    d.addEventListener("visibilitychange", function () { if (d.visibilityState === "hidden") flush(true); });
    loadContext();
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", mountAll); else mountAll();
  }

  var api = {
    facts: {},
    consent: function (yes) {
      granted = yes === true;
      if (granted) start(); else { queue.length = 0; if (timer) { clearTimeout(timer); timer = 0; } }
    },
    track: function (kind, target) {
      if (/^(visit|call_click|email_click|booking_click|directions_click|form_submit)$/.test(kind)) track(kind, target);
    },
  };
  w.strelva = api;
  if (granted) start();
})();
