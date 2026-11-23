// Backend-only client for the reusable Notification Service.
// Never expose the application API key to the Next.js browser bundle.
type SendRequest = {
  recipient: string;
  templateId: string;
  payloadData: Record<string, string | number>;
  idempotencyKey: string;
};

type AcceptedNotification = { notificationId: string; status: string };

export async function sendTemplatedNotification(request: SendRequest): Promise<AcceptedNotification> {
  const baseUrl = process.env.NOTIFICATION_SERVICE_URL;
  const apiKey = process.env.NOTIFICATION_SERVICE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("[Notifications] NOTIFICATION_SERVICE_URL and NOTIFICATION_SERVICE_API_KEY must be configured");
  }

  const endpoint = new URL("/api/v1/notifications/send", baseUrl);
  if (endpoint.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && endpoint.hostname === "localhost")) {
    throw new Error("[Notifications] Production endpoint must use HTTPS");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      recipient: request.recipient,
      channel: "email",
      templateId: request.templateId,
      payloadData: request.payloadData,
      idempotencyKey: request.idempotencyKey,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    // Do not log the recipient, API key, or email payload.
    throw new Error(`[Notifications] API rejected request: HTTP ${response.status}`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" ||
      !("notificationId" in result) || typeof result.notificationId !== "string" ||
      !("status" in result) || typeof result.status !== "string") {
    throw new Error("[Notifications] Invalid accepted notification response");
  }
  return { notificationId: result.notificationId, status: result.status };
}
