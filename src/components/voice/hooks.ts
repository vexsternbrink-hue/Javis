"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getRecognitionCtor,
  recognitionErrorMessage,
  speak,
  speechInputSupported,
  speechOutputSupported,
  stopSpeaking,
  type RecognitionLike,
} from "@/lib/voice/speech";

const noopSubscribe = () => () => {};

/** true, sobald im Browser feststeht, dass die Funktion vorhanden ist (beim Server-Rendern false). */
export function useSupported(check: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, check, () => false);
}

export function useSpeechInputSupported() {
  return useSupported(speechInputSupported);
}

export function useSpeechOutputSupported() {
  return useSupported(speechOutputSupported);
}

/**
 * Einmalige Spracheingabe: liefert Zwischenergebnisse live über onText und
 * endet automatisch nach einer Sprechpause.
 */
export function useSpeechInput(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    recognitionRef.current?.abort();
    stopSpeaking();
    const recognition = new Ctor();
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    let finalText = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onTextRef.current((finalText + interim).trim(), false);
    };
    recognition.onerror = (event) => {
      const message = recognitionErrorMessage(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (finalText.trim()) onTextRef.current(finalText.trim(), true);
    };
    setError(null);
    setListening(true);
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("Die Spracherkennung konnte nicht gestartet werden.");
    }
  }, []);

  return { listening, error, start, stop, clearError: () => setError(null) };
}

/** Vorlesen mit Status, welcher Text gerade gesprochen wird. */
export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const toggle = useCallback(
    (id: string, text: string) => {
      if (speakingId === id) {
        stopRef.current?.();
        stopRef.current = null;
        setSpeakingId(null);
        return;
      }
      stopRef.current?.();
      setSpeakingId(id);
      stopRef.current = speak(text, { onEnd: () => setSpeakingId((current) => (current === id ? null : current)) });
    },
    [speakingId],
  );

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setSpeakingId(null);
  }, []);

  return { speakingId, toggle, stop };
}
