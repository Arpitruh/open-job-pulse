import { embedLocal } from "./local";
import { embedOpenAI } from "./openai";

export type EmbeddingEngine = "local" | "openai";

export async function embed(
  text: string,
  engine: EmbeddingEngine = "local",
  openAiKey?: string
): Promise<number[]> {
  if (engine === "openai" && openAiKey) {
    return embedOpenAI(text, openAiKey);
  }
  return embedLocal(text);
}

export function formatVectorForPrisma(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export { embedLocal, embedOpenAI };