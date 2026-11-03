import OpenAI from "openai";

export async function embedOpenAI(
  text: string,
  apiKey: string
): Promise<number[]> {
  const client = new OpenAI({ apiKey });

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // token limit
    encoding_format: "float",
  });

  return response.data[0]?.embedding ?? [];
}