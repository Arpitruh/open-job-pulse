# OpenJobPulse → Notification Service

OpenJobPulse submits job-match email digests to the reusable Notification Service.
The Notification Service validates the application key, renders the published
application template, commits the request to its outbox, and handles delivery
and retries. OpenJobPulse's BullMQ worker retries submission failures.

## One-time setup (no secrets in git)

1. Open the Notification Service dashboard and create an enabled application with
   slug `openjobpulse`.
2. Create an application-scoped API credential; copy its secret to the **worker**
   environment as `NOTIFICATION_SERVICE_API_KEY`. Never expose it to browsers.
3. Create and **publish** an email template with slug `openjobpulse-job-digest`.
   Required variables: `name`, `matchCount`, `digestType`, `jobs`,
   `dashboardUrl`. Suggested subject:
   `{{matchCount}} new job matches on OpenJobPulse`.
   Suggested HTML (Handlebars escapes variables by default):

   ```html
   <h2>{{matchCount}} new job matches</h2>
   <p>Hi {{name}}, here is your {{digestType}} update.</p>
   <pre style="white-space:pre-wrap;font-family:inherit">{{jobs}}</pre>
   <p><a href="{{dashboardUrl}}">View your application board</a></p>
   ```

4. Configure the running OpenJobPulse **worker** with
   `NOTIFICATION_SERVICE_URL=https://notification-service-18dh.onrender.com`,
   `NOTIFICATION_SERVICE_API_KEY`, and (optionally)
   `NOTIFICATION_SERVICE_JOB_DIGEST_TEMPLATE`.
5. Confirm the Notification Service `/ready` endpoint and sender configuration.
6. Trigger a test digest with real matching data, inspect the accepted
   `notificationId`, then verify the downstream delivery status in the
   Notification Service. HTTP 202 means *queued*, not delivered.

## Request contract

`POST /api/v1/notifications/send` with `X-API-Key` and JSON:
```json
{
  "recipient": "test@example.com",
  "channel": "email",
  "templateId": "openjobpulse-job-digest",
  "payloadData": {
    "name": "Test",
    "matchCount": 1,
    "digestType": "daily",
    "jobs": "1. Frontend Engineer at Example (90% match) — https://example.com/apply",
    "dashboardUrl": "https://your-openjobpulse-domain/kanban"
  },
  "idempotencyKey": "openjobpulse:digest:<user>:daily:<matched-ids>"
}
```

## Operational notes

- Requests are idempotent for a given digest/user/matched set, so BullMQ retries
  do not intentionally resend the same accepted request.
- OpenJobPulse's local notification log records acceptance with
  `delivered: false`. It is **not** proof of email delivery.
- No fallback to Resend is used for digests; provider configuration errors
  should surface rather than silently selecting a paid transport.
- Email digests, welcome events and password resets use Notification Service.
  Telegram and existing app-specific webhooks remain unchanged. Other
  transactional emails require separately defined templates and integration.
- The worker needs to be hosted continuously; Vercel's web deployment does
  not run these BullMQ consumers.

## Account emails (separate rollout)

Account registration calls `POST /api/v1/notifications/events/user.registered`
after the database transaction commits. For this to send, configure the
`openjobpulse` application in Notification Service: a published welcome
template, `dashboardUrl`, and `welcomeEnabled`. Failures are logged but do
not prevent users from signing up.

Password recovery calls `POST /api/v1/notifications/send` with the
`openjobpulse-password-reset` template and the variables `resetUrl` and
`expiryMinutes`. Suggested template:

```html
<h2>Reset your OpenJobPulse password</h2>
<p>Use this link within {{expiryMinutes}} minutes:</p>
<p><a href="{{resetUrl}}">Reset password</a></p>
<p>If you did not request this, you can ignore this message.</p>
```

Required variables: `resetUrl`, `expiryMinutes`.
Suggested subject: `Reset your OpenJobPulse password`.
Publish the template in the OpenJobPulse application. The token remains
HMAC signed and single-use (invalidated by password-hash change).

The **Vercel web app** needs the same server-only
`NOTIFICATION_SERVICE_URL` and `NOTIFICATION_SERVICE_API_KEY` as the worker.
Set `NOTIFICATION_SERVICE_PASSWORD_RESET_TEMPLATE` only when using a
different template slug.

**Do not deploy the account-email switch until the application credential and
password-reset template are configured and a test reset is received.** The
account-email PR deliberately stays separate from the already merged digest
integration, so the existing reset flow can remain available during rollout.
