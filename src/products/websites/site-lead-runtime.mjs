// Static-export equivalent of the hosted native lead form. Never loaded in preview.
for (const root of document.querySelectorAll('[data-site-inquiry]')) {
  const tenant = root.getAttribute('data-site-inquiry');
  if (!tenant || !/^[a-z0-9-]+$/.test(tenant)) continue;
  const base = root.getAttribute('data-site-api-origin') || location.origin;
  let endpoint;
  try { const url = new URL(base); if (!['http:', 'https:'].includes(url.protocol)) continue; endpoint = `${url.origin}/api/v1/leads/${encodeURIComponent(tenant)}`; } catch { continue; }
  const form = document.createElement('form'); form.setAttribute('aria-label', 'Send an inquiry');
  const fields = [];
  for (const [name, label, type, max] of [['name', 'Name', 'text', 200], ['email', 'Email', 'email', 320], ['message', 'Message', 'textarea', 5000]]) {
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.id = `${root.dataset.nodeId || tenant}-${name}`; input.name = name; input.required = true; input.maxLength = max;
    const text = document.createElement('label'); text.htmlFor = input.id; text.textContent = label;
    form.append(text, input); fields.push(input);
  }
  const honeypot = document.createElement('input'); honeypot.name = 'website'; honeypot.tabIndex = -1; honeypot.autocomplete = 'off';
  const hidden = document.createElement('div'); hidden.hidden = true; hidden.append(honeypot); form.append(hidden);
  const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Send request';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  form.append(button, status);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (button.disabled) return; button.disabled = true; button.textContent = 'Sending…'; status.textContent = '';
    try { const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(fields.map(field => [field.name, field.value.trim()])), website: honeypot.value, source: 'hosted-site-export' }) }); const result = await response.json(); if (!response.ok || result.ok !== true) throw new Error(typeof result.error === 'string' ? result.error : 'Your request was not confirmed. Please try again.'); status.setAttribute('role', 'status'); status.textContent = 'Your request has been received.'; form.reset(); }
    catch (error) { status.setAttribute('role', 'alert'); status.textContent = error instanceof Error ? error.message : 'Your request was not confirmed. Please try again.'; }
    finally { button.disabled = false; button.textContent = 'Send request'; }
  });
  root.replaceChildren(form);
}
