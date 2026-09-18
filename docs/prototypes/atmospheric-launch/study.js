const materials = [
  ['rift','Sage rift','An uneven opening through layered indigo.','A diagonal cloud opening, shaped by multiple scales of moving noise. Moss and sage light sit between deep indigo layers.'],
  ['banks','Cloud banks','Broad overlapping masses, softened by distance.','Low-frequency cloud masses move at different depths. A soft lower band lights the underside of the glass.'],
  ['veil','Mineral veil','Muted pigment, suspended in a moving field.','Fine cloud structure interrupts a wide sage wash. The material is computed, not a translated background image.'],
  ['current','Undercurrent','A narrow, irregular current crossing the frame.','A warped horizontal current cuts through denser blue shadow. Small-scale noise breaks the edge into soft, irregular folds.'],
  ['opening','The opening','A slow emergence inside a clouded field.','A diffuse opening expands into uneven surrounding cloud. There is no geometric ring or lens-flare overlay.'],
  ['mist','Silver mist','Pale light through blue-gray atmosphere.','A lower-contrast cloud field with more silver-blue and less green. The light version uses its own pigment values rather than an inversion.'],
];
const daylightCaptions = [
  'Sage pigment opening into ivory and pale blue.',
  'Soft sky-blue washes across a warm white ground.',
  'Mineral lilac and sand beneath milky glass.',
  'A cool turquoise wash with softened sage edges.',
  'Warm cream and pale gold, opening into daylight.',
  'Silver-blue pigment fading into pearl white.',
];
const root = document.documentElement;
const grid = document.querySelector('.studies');
const dialog = document.querySelector('dialog');
grid.innerHTML = materials.map(([id, name, caption], index) => `
  <article class="study" id="material-${id}" aria-labelledby="name-${id}">
    <div class="card ${id}" data-visible="false">
      <div class="field fallback-material" aria-hidden="true">
        <canvas class="canvas-material" data-variant="${index}"></canvas>
        <div class="aceternity-layer"><i></i><i></i><i></i></div>
        <div class="material-scrim"></div>
      </div>
      <svg class="grain" aria-hidden="true"><rect width="100%" height="100%" filter="url(#grain)"/></svg>
      <div class="card-head">
        <span><svg aria-hidden="true"><use href="#cairn"/></svg> Strelva</span>
        <span class="tag">${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="glass">
        <h2 id="name-${id}">${name}</h2>
        <p>${caption}</p>
      </div>
      <div class="card-bottom">
        <span class="status"><span class="theme-label">Dark</span> material</span>
        <button data-detail="${index}" aria-label="Inspect ${name} material" aria-haspopup="dialog">Inspect <span aria-hidden="true">↗</span></button>
      </div>
    </div>
  </article>
`).join('');
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
const blur = document.querySelector('#blur');
const motion = document.querySelector('#motion');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;
let selectedMaterial = null;
let dialogTrigger = null;

function writeURL() {
  const url = new URL(location.href);
  url.searchParams.set('theme', root.dataset.theme);
  url.searchParams.set('blur', blur.value);
  if (selectedMaterial) url.searchParams.set('material', selectedMaterial);
  else url.searchParams.delete('material');
  history.replaceState(null, '', url);
}
function setTheme(theme) {
  root.dataset.switchingTheme = 'true';
  root.dataset.theme = theme;
  document.querySelectorAll('.glass > p').forEach((label, index) => label.textContent = theme === 'light' ? daylightCaptions[index] : materials[index][2]);
  themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
  document.querySelectorAll('.theme-label').forEach(label => label.textContent = theme === 'light' ? 'Light' : 'Dark');
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f2f3ef' : '#101518';
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.switchingTheme));
}
function setBlur(value) {
  const amount = Math.max(0, Math.min(40, Math.round(Number(value) / 8) * 8));
  blur.value = String(Number.isFinite(amount) ? amount : 24);
  root.style.setProperty('--glass-blur', `${blur.value}px`);
  document.querySelector('output').textContent = `${blur.value} px`;
  document.querySelector('#recipe-blur').textContent = `${blur.value} px backdrop blur with a tinted fill; an opaque panel when filtering is unavailable.`;
}
function selectMaterial(id, trigger = null) {
  const material = materials.find(item => item[0] === id);
  if (!material) return;
  selectedMaterial = id;
  dialogTrigger = trigger;
  document.querySelector('#detail-title').textContent = material[1];
  document.querySelector('#detail-copy').textContent = root.dataset.theme === 'light' ? daylightCaptions[materials.indexOf(material)] + ' Broad pigment washes sit on a pale ground, with a separate light-mode frost and edge treatment.' : material[3];
  document.querySelectorAll('.study').forEach(study => study.dataset.selected = String(study.id === `material-${id}`));
  if (!dialog.open) dialog.showModal();
}
function readURL() {
  const params = new URL(location.href).searchParams;
  setTheme(params.get('theme') === 'light' ? 'light' : 'dark');
  setBlur(params.has('blur') && params.get('blur').trim() ? params.get('blur') : 24);
  const material = params.get('material');
  if (materials.some(item => item[0] === material)) selectMaterial(material);
  else if (dialog.open) dialog.close();
}
themeButtons.forEach(button => button.addEventListener('click', () => {
  setTheme(button.dataset.themeChoice);
  writeURL();
}));
blur.addEventListener('input', () => { setBlur(blur.value); writeURL(); });
function updateMotion() {
  root.dataset.paused = String(paused || preference.matches);
  motion.disabled = preference.matches;
  motion.setAttribute('aria-pressed', String(paused || preference.matches));
  motion.innerHTML = preference.matches ? 'Reduced motion' : paused ? 'Play motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
}
motion.addEventListener('click', () => { paused = !paused; updateMotion(); });
preference.addEventListener('change', updateMotion);
updateMotion();
const observer = new IntersectionObserver(entries => entries.forEach(entry => entry.target.dataset.visible = String(entry.isIntersecting)), { threshold: 0 });
document.querySelectorAll('.card').forEach(card => observer.observe(card));
function updateVisibility() { root.dataset.hidden = String(document.hidden); }
document.addEventListener('visibilitychange', updateVisibility);
window.addEventListener('pageshow', updateVisibility);
updateVisibility();
document.querySelectorAll('[data-detail]').forEach(button => button.addEventListener('click', () => {
  selectMaterial(materials[Number(button.dataset.detail)][0], button);
  writeURL();
}));
document.querySelector('#close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  selectedMaterial = null;
  document.querySelectorAll('.study').forEach(study => delete study.dataset.selected);
  writeURL();
  if (dialogTrigger) dialogTrigger.focus({ preventScroll: true });
  dialogTrigger = null;
});
document.querySelector('#glass-toggle').addEventListener('click', event => {
  const hidden = root.dataset.noGlass !== 'true';
  root.dataset.noGlass = String(hidden);
  event.currentTarget.setAttribute('aria-pressed', String(hidden));
  event.currentTarget.textContent = hidden ? 'Restore glass' : 'Remove glass';
});
window.addEventListener('popstate', readURL);
readURL();
