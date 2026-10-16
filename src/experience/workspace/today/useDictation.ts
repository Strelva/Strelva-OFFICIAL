"use client";
/**
 * Say it instead: the composer's mic (XA · O2, LX · Composer · With a yes).
 * Uses the browser's own speech recognition where it exists (Chrome, Safari,
 * Edge); nothing is sent to Strelva until the person presses send. Where the
 * browser has none, `supported` is false and the mic is not drawn, so there
 * is never a dead control.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const subscribe = () => () => undefined;

export function useDictation(onText: (text: string) => void): { supported: boolean; listening: boolean; start: () => void } {
  // Server markup never draws the mic; the client adds it after hydration when the browser can listen.
  const supported = useSyncExternalStore(subscribe, () => recognitionConstructor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const active = useRef<Recognition | null>(null);
  const deliver = useRef(onText);
  useEffect(() => { deliver.current = onText; }, [onText]);
  useEffect(() => () => active.current?.stop(), []);
  const start = () => {
    if (active.current) { active.current.stop(); return; }
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = document.documentElement.lang || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = event => {
      const text = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (text) deliver.current(text);
    };
    recognition.onend = recognition.onerror = () => { active.current = null; setListening(false); };
    active.current = recognition;
    setListening(true);
    try { recognition.start(); } catch { active.current = null; setListening(false); }
  };
  return { supported, listening, start };
}
