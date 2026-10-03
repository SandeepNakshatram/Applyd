import "server-only";
import { heuristicClient } from "./heuristicClient";
import { GeminiClient } from "./geminiClient";
import type { AIClient } from "./types";

let cached: AIClient | null = null;

/** True when a real model (Gemini) is configured, as opposed to the rule-based heuristics only. */
export function isModelConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(apiKey && !apiKey.startsWith("replace-with"));
}

/** Gemini when a real key is configured, deterministic heuristics otherwise. */
export function getAIClient(): AIClient {
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && !apiKey.startsWith("replace-with")) {
    // "gemini-flash-lite-latest" (a) is an alias Google maintains across
    // model retirements — avoids pinning a dated version name that can 404
    // once retired, as gemini-2.0-flash did — and (b) the free tier's daily
    // request quota for non-lite "flash"/"pro" models is small enough
    // (as low as 20/day) that a single mailbox scan can exhaust it; lite
    // models get a much higher free allotment and are plenty capable for
    // structured classification/extraction.
    cached = new GeminiClient(apiKey, process.env.GEMINI_MODEL || "gemini-flash-lite-latest");
  } else {
    cached = heuristicClient;
  }
  return cached;
}

export type { AIClient } from "./types";
