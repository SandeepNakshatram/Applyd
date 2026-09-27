import "server-only";
import { heuristicClient } from "./heuristicClient";
import { GeminiClient } from "./geminiClient";
import type { AIClient } from "./types";

let cached: AIClient | null = null;

/** Gemini when a real key is configured, deterministic heuristics otherwise. */
export function getAIClient(): AIClient {
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && !apiKey.startsWith("replace-with")) {
    cached = new GeminiClient(apiKey, process.env.GEMINI_MODEL || "gemini-2.0-flash");
  } else {
    cached = heuristicClient;
  }
  return cached;
}

export type { AIClient } from "./types";
