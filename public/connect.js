/*! Strelva connect.js — connects any website to a Strelva business.
 * <script src="https://app.strelva.com/connect.js" data-strelva-site="sk_pub_..." defer></script>
 * <div data-strelva-app="dental_intake"></div> mounts a Strelva App form (its live Release decides the fields).
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
  // The browser sends only a presence hint. The server fetches the verified
  // site's stored URL and compares its public JSON-LD to confirmed facts.
  function ownBusinessSchema() {
    return { present: true };
  }
  function reportOwnBusinessSchema() {
    if (granted && hasOwnBusinessLd()) post("/events", { events: [], platformSchema: ownBusinessSchema() }, false);
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
        if (c.site.injectSchema) {
          reportOwnBusinessSchema();
          if (c.jsonLd) injectLd(c.jsonLd);
        }
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
    post("/inquiries", { id: "i" + rand(22), sid: session(), capture: "site-form", path: location.pathname, fields: fields }, false);
  }

  // ---- The Strelva form ---------------------------------------------------
  var INPUT_STYLE = "display:block;width:100%;box-sizing:border-box;margin-top:.3em;padding:.6em .7em;font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.55);border-radius:6px";
  // Keep these contact rules in sync with connected-sites/contracts.ts.
  var EMAIL_CORRECTION = "Enter a valid email address, or clear it and use your phone number.";
  var PHONE_CORRECTION = "Enter a valid phone number, or clear it and use your email address.";
  var CONTACT_REQUIRED = "Add an email or phone number so we can reply.";
  function validEmail(value) {
    return value.length <= 320 && /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) && value.charAt(value.indexOf("@") - 1) !== ".";
  }
  function validPhone(value) {
    var digits = value.replace(/\D/g, "");
    return /^\+?[0-9 ().-]{7,24}$/.test(value) && digits.length >= 7 && digits.length <= 15;
  }
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
    status.id = p + "status";
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.setAttribute("style", "margin:0");
    form.appendChild(status);
    var times = d.createElement("section");
    times.setAttribute("aria-label", "Appointment times");
    form.appendChild(times);
    function correction(input, text) {
      status.textContent = text;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", status.id);
      input.focus();
    }
    function clearCorrection(input) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (button.disabled) return;
      clearCorrection(email); clearCorrection(phone); clearCorrection(message);
      if (!granted) { status.textContent = "Allow Strelva to send this form before continuing, or call or email us."; return; }
      var emailValue = email.value.trim(), phoneValue = phone.value.trim();
      if (emailValue && !validEmail(emailValue)) { correction(email, EMAIL_CORRECTION); return; }
      if (phoneValue && !validPhone(phoneValue)) { correction(phone, PHONE_CORRECTION); return; }
      if (!emailValue && !phoneValue) { correction(email, CONTACT_REQUIRED); return; }
      if (!message.value.trim() && !name.value.trim()) { correction(message, "Tell us a little about what you need."); return; }
      button.disabled = true; status.textContent = "Sending…"; times.textContent = "";
      var fields = {}, list = [name, email, phone, message];
      for (var i = 0; i < list.length; i++) if (list[i].value.trim()) fields[list[i].name] = list[i].value.trim().slice(0, 5000);
      w.fetch(base + "/inquiries", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ id: "i" + rand(22), sid: session(), capture: "strelva-form", path: location.pathname, _hp: hp.value, fields: fields }) })
        .then(function (r) {
          if (r.status === 400) return r.json().catch(function () { return null; }).then(function (body) {
            var text = body && body.error;
            throw new Error(text === EMAIL_CORRECTION || text === PHONE_CORRECTION || text === CONTACT_REQUIRED ? text : "Failed");
          });
          if (!r.ok) throw new Error(String(r.status));
          return r.json().catch(function () { return null; });
        })
        .then(function (result) {
          form.reset(); status.textContent = "Thanks. Your message was sent.";
          var offer = result && result.bookingOffer;
          if (!offer || typeof offer.serviceName !== "string" || offer.serviceName.length > 160 || !Array.isArray(offer.slots) || !offer.slots.length || offer.slots.length > 3) return;
          for (var n = 0; n < offer.slots.length; n++) {
            var s = offer.slots[n];
            if (!s || typeof s.label !== "string" || s.label.length > 200 || typeof s.chooseUrl !== "string" || !/^\/inquiry-booking\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\?slot=[0-2]$/.test(s.chooseUrl)) return;
          }
          var title = d.createElement("h3"), note = d.createElement("p");
          title.textContent = "Request a time for " + offer.serviceName;
          note.textContent = "Choose a time, then check your email to confirm. The business may then need to accept your request.";
          times.appendChild(title); times.appendChild(note);
          for (var j = 0; j < offer.slots.length; j++) {
            var row = d.createElement("p"), link = d.createElement("a");
            link.href = origin + offer.slots[j].chooseUrl;
            link.textContent = offer.slots[j].label;
            link.setAttribute("style", "display:inline-flex;align-items:center;min-height:44px");
            row.appendChild(link); times.appendChild(row);
          }
        })
        .catch(function (error) {
          var detail = error && error.message;
          if (detail === EMAIL_CORRECTION || detail === CONTACT_REQUIRED) correction(email, detail);
          else if (detail === PHONE_CORRECTION) correction(phone, detail);
          else status.textContent = "That didn't send. Please try again, or call or email us.";
        })
        .then(function () { button.disabled = false; });
    });
    host.appendChild(form);
  }
  function mountAll() {
    var hosts = d.querySelectorAll("[data-strelva-form]");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  // ---- Strelva Apps (e.g. Dental intake) -----------------------------------
  // <div data-strelva-app="dental_intake"></div> mounts the form its live Release defines.
  // Answers go only to the office through /apps/<id>/intake. Never through track() or the beacon.
  var APP_PHONE_CORRECTION = "Enter a valid phone number.";
  var APP_UNAVAILABLE = "This form isn't available right now. Please call or email the office.";
  var APP_KINDS = /^(text|email|phone|choice|multi_choice|textarea)$/;
  function telHref(phone) { return "tel:" + String(phone).replace(/[^0-9+]/g, ""); }
  function appCall(phone, label) {
    var a = d.createElement("a");
    a.href = telHref(phone); a.textContent = label + phone;
    a.setAttribute("style", "display:inline-flex;min-height:44px;align-items:center;font-weight:600");
    return a;
  }
  function appText(tag, text, style) {
    var el = d.createElement(tag);
    el.textContent = text;
    if (style) el.setAttribute("style", style);
    return el;
  }
  function validApp(form) {
    if (!form || form.schemaVersion !== 1 || !Array.isArray(form.fields) || form.fields.length > 20 || !Array.isArray(form.triage)) return false;
    for (var i = 0; i < form.fields.length; i++) {
      var f = form.fields[i];
      if (!f || typeof f.id !== "string" || typeof f.label !== "string" || !APP_KINDS.test(f.kind)) return false;
    }
    return true;
  }
  function renderApp(host, form, appId) {
    var p = "strelva-a" + (++formCount) + "-", el = d.createElement("form"), rows = {}, order = [];
    el.setAttribute("data-strelva-mounted", ""); el.noValidate = true;
    el.setAttribute("style", "display:grid;gap:.8em;font:inherit;color:inherit");
    el.appendChild(appText("h3", form.title || "")); el.appendChild(appText("p", form.intro || ""));
    el.appendChild(appText("p", form.notice || "", "margin:0;font-size:.85em;opacity:.8"));
    var status = appText("p", "", "margin:0"); status.id = p + "status";
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    function inputsOf(f) { return rows[f.id].querySelectorAll("input,select,textarea"); }
    function answerOf(f) {
      var els = inputsOf(f), out = [], i;
      if (f.kind === "multi_choice") { for (i = 0; i < els.length; i++) if (els[i].checked) out.push(els[i].value); return out.join(","); }
      if (f.kind === "choice" && f.options && f.options.length <= 3) { for (i = 0; i < els.length; i++) if (els[i].checked) return els[i].value; return ""; }
      return els.length ? String(els[0].value || "").trim() : "";
    }
    function isHidden(f) { return !!(f.shownWhen && rows[f.shownWhen.field] && f.shownWhen.notIn.indexOf(answerOf(byId(f.shownWhen.field))) >= 0); }
    function byId(id) { for (var i = 0; i < form.fields.length; i++) if (form.fields[i].id === id) return form.fields[i]; return null; }
    form.fields.forEach(function (f) {
      var id = p + f.id, wrap = d.createElement("div"), hint = null, text = f.label + (f.required ? " (required)" : "");
      if (f.hint) { hint = appText("p", f.hint, "margin:.2em 0 0;font-size:.85em;opacity:.8"); hint.id = id + "-hint"; }
      if (f.kind === "multi_choice" || (f.kind === "choice" && f.options && f.options.length <= 3)) {
        var set = d.createElement("fieldset"); set.setAttribute("style", "border:0;margin:0;padding:0");
        set.appendChild(appText("legend", text, "padding:0"));
        (f.options || []).forEach(function (o, n) {
          var lab = d.createElement("label"), box = d.createElement("input");
          box.type = f.kind === "multi_choice" ? "checkbox" : "radio"; box.name = id; box.value = o.value; box.id = id + "-" + n;
          if (hint) box.setAttribute("aria-describedby", hint.id);
          lab.setAttribute("style", "display:flex;gap:.5em;align-items:center;min-height:44px");
          lab.appendChild(box); lab.appendChild(d.createTextNode(o.label)); set.appendChild(lab);
        });
        wrap.appendChild(set);
      } else {
        var l = d.createElement("label"), c;
        l.htmlFor = id; l.textContent = text; wrap.appendChild(l);
        if (f.kind === "choice") {
          c = d.createElement("select"); c.appendChild(new Option("Choose…", ""));
          (f.options || []).forEach(function (o) { c.appendChild(new Option(o.label, o.value)); });
        } else if (f.kind === "textarea") { c = d.createElement("textarea"); c.rows = 4; }
        else { c = d.createElement("input"); c.type = f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text"; }
        c.id = id; c.name = f.id; if (f.maxLength) c.maxLength = f.maxLength;
        if (f.autocomplete) c.setAttribute("autocomplete", f.autocomplete); else if (f.sensitive) c.setAttribute("autocomplete", "off");
        if (f.required) c.setAttribute("aria-required", "true");
        if (hint) c.setAttribute("aria-describedby", hint.id);
        c.setAttribute("style", INPUT_STYLE); wrap.appendChild(c);
      }
      if (hint) wrap.appendChild(hint);
      rows[f.id] = wrap; order.push(f); el.appendChild(wrap);
    });
    var trap = d.createElement("div"), hp = d.createElement("input");
    trap.setAttribute("aria-hidden", "true"); trap.setAttribute("style", "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden");
    hp.name = "_hp"; hp.tabIndex = -1; hp.setAttribute("autocomplete", "off"); trap.appendChild(hp); el.appendChild(trap);
    var panel = d.createElement("div"), revealed = false;
    panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "Urgent care"); panel.hidden = true;
    panel.setAttribute("style", "padding:.8em;border:1px solid currentColor;border-radius:6px");
    el.appendChild(panel);
    var button = d.createElement("button");
    button.type = "submit"; button.textContent = form.submitLabel || "Send";
    button.setAttribute("style", "justify-self:start;padding:.7em 1.3em;font:inherit;cursor:pointer;border-radius:6px");
    el.appendChild(button); el.appendChild(status);
    function urgentRule() {
      for (var i = 0; i < form.triage.length; i++) {
        var f = byId(form.triage[i].field), v = f ? answerOf(f).split(",") : [];
        for (var j = 0; j < v.length; j++) if (form.triage[i].anyOf.indexOf(v[j]) >= 0) return form.triage[i];
      }
      return null;
    }
    function refresh() {
      order.forEach(function (f) { rows[f.id].hidden = isHidden(f); });
      var rule = urgentRule(), office = form.office || {};
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      panel.hidden = !rule;
      if (!rule) return;
      var h = appText("h4", rule.title); h.tabIndex = -1; panel.appendChild(h); panel.appendChild(appText("p", rule.body));
      if (office.phone) { var line = d.createElement("p"); line.appendChild(appCall(office.phone, "Call the office: ")); panel.appendChild(line); }
      if (office.openNow === false) panel.appendChild(appText("p", "The office is closed now. Calling plays their after-hours instructions."));
      panel.appendChild(appText("p", rule.emergencyNote)); panel.appendChild(appText("p", rule.afterSubmit));
      if (!revealed) { revealed = true; h.focus(); }
    }
    el.addEventListener("change", refresh); refresh();
    function correction(f, text) {
      status.textContent = text;
      var first = inputsOf(f)[0];
      if (first) { first.setAttribute("aria-invalid", "true"); first.setAttribute("aria-describedby", status.id); first.focus(); }
    }
    el.addEventListener("submit", function (e) {
      e.preventDefault();
      if (button.disabled) return;
      var bad = el.querySelectorAll("[aria-invalid]"), i;
      for (i = 0; i < bad.length; i++) { bad[i].removeAttribute("aria-invalid"); bad[i].removeAttribute("aria-describedby"); }
      if (!granted) { status.textContent = "Allow Strelva to send this form before continuing, or call or email us."; return; }
      var answers = {};
      for (i = 0; i < order.length; i++) {
        var f = order[i], v = isHidden(f) ? "" : answerOf(f);
        if (isHidden(f)) continue;
        if (!v && f.required) { correction(f, "Please answer: " + f.label + "."); return; }
        if (v && f.kind === "email" && !validEmail(v)) { correction(f, EMAIL_CORRECTION); return; }
        if (v && f.kind === "phone" && !validPhone(v)) { correction(f, APP_PHONE_CORRECTION); return; }
        if (v) answers[f.id] = v;
      }
      button.disabled = true; status.textContent = "Sending…";
      w.fetch(base + "/apps/" + appId + "/intake", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ id: "i" + rand(22), sid: session(), path: location.pathname, _hp: hp.value, answers: answers }) })
        .then(function (r) {
          if (r.status === 400) return r.json().catch(function () { return null; }).then(function (body) {
            throw new Error(body && typeof body.error === "string" && body.error.length <= 200 ? body.error : "Check your answers and try again.");
          });
          if (!r.ok) throw new Error("");
          return r.json().catch(function () { return null; });
        })
        .then(function (result) {
          var urgent = !!(result && result.triage === "urgent"), thanks = form.thanks || {};
          while (el.firstChild) el.removeChild(el.firstChild);
          var note = appText("p", (urgent ? thanks.urgent : thanks.routine) || "Thanks."); note.setAttribute("role", "status"); el.appendChild(note);
          if (urgent && form.office && form.office.phone) { var line = d.createElement("p"); line.appendChild(appCall(form.office.phone, "Call the office: ")); el.appendChild(line); }
        })
        .catch(function (error) {
          button.disabled = false;
          status.textContent = error && error.message ? error.message : "That didn't send. Please call the office.";
          if (!(error && error.message) && form.office && form.office.phone) { var line = d.createElement("p"); line.appendChild(appCall(form.office.phone, "Call the office: ")); status.appendChild(line); }
        });
    });
    host.appendChild(el);
  }
  function mountApp(host) {
    var appId = host.getAttribute("data-strelva-app");
    // A code site's own StrelvaIntake component renders itself; it carries the site key.
    if (host.hasAttribute("data-strelva-mounted") || host.hasAttribute("data-strelva-site") || !/^[a-z][a-z_]{2,39}$/.test(appId || "") || !w.fetch) return;
    host.setAttribute("data-strelva-mounted", "");
    w.fetch(base + "/apps/" + appId, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (form) {
        if (validApp(form)) renderApp(host, form, appId);
        else host.appendChild(appText("p", APP_UNAVAILABLE));
      })
      .catch(function () { host.appendChild(appText("p", APP_UNAVAILABLE)); });
  }
  function mountApps() {
    var hosts = d.querySelectorAll("[data-strelva-app]");
    for (var i = 0; i < hosts.length; i++) mountApp(hosts[i]);
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
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", function () { mountAll(); mountApps(); }); else { mountAll(); mountApps(); }
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
