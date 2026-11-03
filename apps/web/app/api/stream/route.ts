import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SSE_HEADERS } from "@/lib/sse";
import { Redis } from "ioredis";

function createSubscriber() {
  return new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();
  const channel = `sse:${userId}`;
  const subscriber = createSubscriber();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial heartbeat
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({ userId })}\n\n`
        )
      );

      // ioredis message event — correct way to receive pub/sub messages
      await subscriber.subscribe(channel);

      subscriber.on("message", (ch: string, message: string) => {
        if (ch !== channel) return;
        try {
          const parsed = JSON.parse(message) as {
            event: string;
            data: unknown;
          };
          const payload = `event: ${parsed.event}\ndata: ${JSON.stringify(
            parsed.data
          )}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error("[SSE] Failed to parse message:", err);
        }
      });

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({
                ts: Date.now(),
              })}\n\n`
            )
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.disconnect();
        controller.close();
      });
    },

    cancel() {
      subscriber.disconnect();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}