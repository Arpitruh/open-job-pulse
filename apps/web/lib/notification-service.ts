// Server-side only: never import this module from client components.
type Accepted = { notificationId: string; status: string };

function configuration() {
  const baseUrl = process.env.NOTIFICATION_SERVICE_URL;
  const apiKey = process.env.NOTIFICATION_SERVICE_API_KEY;
  if (!baseUrl || !apiKey) return null;
  const target = new URL(baseUrl);
  if (target.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && target.hostname === "localhost")) {
    throw new Error("Notification Service must use HTTPS in production");
  }
  return { target, apiKey };
}

export function isNotificationServiceConfigured() {
  return !!process.env.NOTIFICATION_SERVICE_URL && !!process.env.NOTIFICATION_SERVICE_API_KEY;
}

async function submit(path: string, body: unknown): Promise<Accepted | { status: string }> {
  const config = configuration();
  if (!config) throw new Error("Notification Service is not configured");
  const response = await fetch(new URL(path, config.target), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.apiKey },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    // Intentionally omit recipient, API keys, and reset tokens from logs.
    throw new Error(`Notification Service rejected request (HTTP ${response.status})`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("status" in result) ||
      typeof result.status !== "string") throw new Error("Unexpected Notification Service response");
  return result as Accepted;
}

export async function sendPasswordResetEmail(email: string, resetUrl: string, idempotencyKey: string) {
  return submit("/api/v1/notifications/send", {
    recipient: email,
    channel: "email",
    templateId: process.env.NOTIFICATION_SERVICE_PASSWORD_RESET_TEMPLATE ?? "openjobpulse-password-reset",
    payloadData: { resetUrl, expiryMinutes: 15 },
    idempotencyKey,
  });
}

export async function sendRegistrationWelcomeEvent(userId: string, email: string, name: string) {
  return submit("/api/v1/notifications/events/user.registered", { userId, email, name });
}
