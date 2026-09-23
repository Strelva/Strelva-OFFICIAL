// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  on: vi.fn(), raf: vi.fn(), destroy: vi.fn(), refresh: vi.fn(),
  add: vi.fn(), remove: vi.fn(), lagSmoothing: vi.fn(),
}));
vi.mock("@studio-freight/lenis", () => ({ default: class {
  on = mocks.on; raf = mocks.raf; destroy = mocks.destroy;
} }));
vi.mock("gsap", () => ({ default: { registerPlugin: vi.fn(), ticker: { add: mocks.add, remove: mocks.remove, lagSmoothing: mocks.lagSmoothing } } }));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: { refresh: mocks.refresh, update: vi.fn() } }));
import { initLenis } from "@/lib/lenis";

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  vi.clearAllMocks(); frames = new Map(); nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
function runFrame(id: number) { const callback = frames.get(id)!; frames.delete(id); callback(0); }

describe("smooth scroll ownership", () => {
  it("removes its exact ticker callback and pending refresh when disposed", () => {
    const session = initLenis();
    const tick = mocks.add.mock.calls[0]![0];
    tick(2); expect(mocks.raf).toHaveBeenCalledWith(2000);
    session.dispose(); session.dispose();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(tick);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it("cancels the second animation frame when disposal happens between frames", () => {
    const session = initLenis(); runFrame(1);
    expect(frames.has(2)).toBe(true);
    session.dispose();
    expect(frames.size).toBe(0); expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("retains the delayed initial refresh and gives each mount its own ticker", () => {
    const first = initLenis(); const second = initLenis();
    const firstTick = mocks.add.mock.calls[0]![0]; const secondTick = mocks.add.mock.calls[1]![0];
    expect(firstTick).not.toBe(secondTick);
    runFrame(1); runFrame(3); expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(true);
    first.dispose(); expect(mocks.remove).toHaveBeenCalledWith(firstTick);
    expect(mocks.remove).not.toHaveBeenCalledWith(secondTick);
    second.dispose(); expect(mocks.remove).toHaveBeenCalledWith(secondTick);
  });
});
