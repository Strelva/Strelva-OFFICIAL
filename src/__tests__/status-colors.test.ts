import { describe, it, expect } from "vitest";
import {
  gradeTone,
  launchTone,
  checkTone,
  scoreTone,
  TONE_PILL,
  TONE_DOT,
  TONE_TEXT,
  type Tone,
} from "@/lib/status-colors";

const TONES: Tone[] = ["good", "warn", "bad", "info", "neutral"];

describe("status-colors tone mappers", () => {
  it("gradeTone: A/B good, C warn, D/F bad", () => {
    expect(gradeTone("A")).toBe("good");
    expect(gradeTone("B")).toBe("good");
    expect(gradeTone("C")).toBe("warn");
    expect(gradeTone("D")).toBe("bad");
    expect(gradeTone("F")).toBe("bad");
  });

  it("launchTone: ready good, watch warn, blocked bad", () => {
    expect(launchTone("ready")).toBe("good");
    expect(launchTone("watch")).toBe("warn");
    expect(launchTone("blocked")).toBe("bad");
  });

  it("scoreTone: thresholds at 80 (good) and 55 (warn)", () => {
    expect(scoreTone(100)).toBe("good");
    expect(scoreTone(80)).toBe("good");
    expect(scoreTone(79)).toBe("warn");
    expect(scoreTone(55)).toBe("warn");
    expect(scoreTone(54)).toBe("bad");
    expect(scoreTone(0)).toBe("bad");
  });

  it("checkTone: pass/ok good, warn warn, fail/error bad", () => {
    expect(checkTone("pass")).toBe("good");
    expect(checkTone("ok")).toBe("good");
    expect(checkTone("warn")).toBe("warn");
    expect(checkTone("fail")).toBe("bad");
    expect(checkTone("error")).toBe("bad");
  });

  it("every tone has a pill, dot, and text class", () => {
    for (const tone of TONES) {
      expect(TONE_PILL[tone]).toBeTruthy();
      expect(TONE_DOT[tone]).toBeTruthy();
      expect(TONE_TEXT[tone]).toBeTruthy();
    }
  });
});
