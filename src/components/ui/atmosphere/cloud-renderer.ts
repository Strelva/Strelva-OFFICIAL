import { cloudFragmentShader, cloudVertexShader } from "./cloud-shader";

export type AtmosphereTheme = "light" | "dark";
export type AtmosphereMotion = "running" | "paused" | "static" | "offscreen" | "hidden" | "fallback";

interface RendererOptions {
  card: HTMLElement;
  canvas: HTMLCanvasElement;
  variant: number;
  theme?: AtmosphereTheme;
  paused: boolean;
}

/** A bounded decorative renderer. No per-frame layout reads or React updates. */
export function createCloudRenderer({ card, canvas, variant, theme, paused }: RendererOptions) {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const transparencyPreference = window.matchMedia("(prefers-reduced-transparency: reduce)");
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const backdropSupported = CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let shaders: WebGLShader[] = [];
  let locations: Record<string, WebGLUniformLocation | null> = {};
  let raf = 0;
  let last = 0;
  let time = variant * 11;
  let frames = 0;
  let visible = false;
  let pageHidden = false;
  let lost = false;
  let disposed = false;
  let width = 1;
  let height = 1;
  let light = theme === "light";

  function release() {
    if (!gl) return;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach((shader) => gl.deleteShader(shader));
    shaders = [];
    buffer = null;
    program = null;
  }

  function initialize() {
    if (!gl || disposed) return;
    try {
      release();
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error("Cloud shader unavailable");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Cloud shader compilation failed");
        return shader;
      };
      program = gl.createProgram();
      if (!program) throw new Error("Cloud program unavailable");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, cloudVertexShader));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, cloudFragmentShader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Cloud shader linking failed");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Cloud buffer unavailable");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      locations = Object.fromEntries(["u_size", "u_time", "u_variant", "u_light"].map((name) => [name, gl.getUniformLocation(program!, name)]));
    } catch {
      release();
    }
  }

  function state(): AtmosphereMotion {
    if (!gl || !program || lost || !backdropSupported || transparencyPreference.matches || forcedColors.matches) return "fallback";
    if (document.hidden || pageHidden) return "hidden";
    if (!visible) return "offscreen";
    if (motionPreference.matches) return "static";
    if (paused) return "paused";
    return "running";
  }

  function draw() {
    if (!gl || !program || lost || disposed) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(locations.u_size ?? null, width, height);
    gl.uniform1f(locations.u_time ?? null, time);
    gl.uniform1f(locations.u_variant ?? null, variant);
    gl.uniform1f(locations.u_light ?? null, light ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.dataset.frames = String(++frames);
  }

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    if (state() !== "running") {
      sync();
      return;
    }
    if (!last || now - last >= 1000 / 24) {
      time += last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      draw();
    }
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    if (disposed) return;
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    light = theme ? theme === "light" : getComputedStyle(card).getPropertyValue("--atmosphere-light").trim() === "1";
    card.dataset.palette = light ? "light" : "dark";
    const mode = state();
    card.dataset.motion = mode;
    card.dataset.renderer = mode === "fallback" ? "fallback" : "webgl";
    canvas.dataset.renderer = card.dataset.renderer;
    if (["running", "paused", "static"].includes(mode) || (mode === "offscreen" && (frames === 0 || canvas.width !== width || canvas.height !== height))) draw();
    if (mode === "running") raf = requestAnimationFrame(frame);
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const rect = entry.contentRect;
    const ratio = Math.min(1, 640 / Math.max(1, rect.width, rect.height));
    width = Math.max(1, Math.round(rect.width * ratio));
    height = Math.max(1, Math.round(rect.height * ratio));
    sync();
  });
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  });
  // Theme scopes can live anywhere above the card. Observe only ancestor attributes,
  // not the canvas diagnostics or the card attributes written by this renderer.
  const themeObserver = new MutationObserver(sync);
  for (let parent = card.parentElement; parent; parent = parent.parentElement) {
    themeObserver.observe(parent, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  }
  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    sync();
  };
  const contextRestored = () => {
    lost = false;
    initialize();
    sync();
  };
  const pageHide = () => {
    pageHidden = true;
    sync();
  };
  const pageShow = () => {
    pageHidden = false;
    sync();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  motionPreference.addEventListener("change", sync);
  transparencyPreference.addEventListener("change", sync);
  forcedColors.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  initialize();
  resize.observe(canvas);
  intersection.observe(card);
  sync();

  return {
    setPaused(value: boolean) { paused = value; sync(); },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      motionPreference.removeEventListener("change", sync);
      transparencyPreference.removeEventListener("change", sync);
      forcedColors.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      release();
    },
  };
}
