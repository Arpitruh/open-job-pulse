import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { decrypt } from "./encrypt";

export type AiProvider = "openai" | "anthropic";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiResponse {
  content: string;
  model: string;
  tokensUsed: number;
}

// Auto-detect provider from encrypted key prefix
export function detectProvider(encryptedKey: string): AiProvider {
  const key = decrypt(encryptedKey);
  if (key.startsWith("sk-ant-")) return "anthropic";
  return "openai";
}

export async function callAi(
  encryptedKey: string,
  messages: AiMessage[],
  options: { maxTokens?: number; stream?: boolean } = {}
): Promise<AiResponse> {
  const apiKey = decrypt(encryptedKey);
  const provider = detectProvider(encryptedKey);
  const maxTokens = options.maxTokens ?? 1500;

  if (provider === "openai") {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens,
    });
    return {
      content: response.choices[0]?.message.content ?? "",
      model: response.model,
      tokensUsed: response.usage?.total_tokens ?? 0,
    };
  }

  // Anthropic
  const client = new Anthropic({ apiKey });
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    system: systemMsg,
    messages: userMessages,
    max_tokens: maxTokens,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    content: textBlock?.type === "text" ? textBlock.text : "",
    model: response.model,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

// Streaming variant — returns async iterable for SSE
export async function* streamAi(
  encryptedKey: string,
  messages: AiMessage[],
  maxTokens = 1500
): AsyncIterable<string> {
  const apiKey = decrypt(encryptedKey);
  const provider = detectProvider(encryptedKey);

  if (provider === "openai") {
    const client = new OpenAI({ apiKey });
    const stream = client.beta.chat.completions.stream({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
    return;
  }

  // Anthropic streaming
  const client = new Anthropic({ apiKey });
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const stream = await client.messages.stream({
    model: "claude-3-5-sonnet-20241022",
    system: systemMsg,
    messages: userMessages,
    max_tokens: maxTokens,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}