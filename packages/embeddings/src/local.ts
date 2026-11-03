import path from "path";

let pipeline: any = null;

export async function loadLocalEmbedder() {
  if (pipeline) return pipeline;

  try {
    const { pipeline: createPipeline } = await import("@xenova/transformers");
    pipeline = await createPipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { cache_dir: path.join(process.cwd(), ".model_cache") }
    );
    console.log("[Embeddings] Local MiniLM model loaded");
    return pipeline;
  } catch (err: any) {
    console.error("[Embeddings] Failed to load local model:", err.message);
    throw err;
  }
}

export async function embedLocal(text: string): Promise<number[]> {
  const pipe = await loadLocalEmbedder();

  const output = await pipe(text, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data as Float32Array);
}