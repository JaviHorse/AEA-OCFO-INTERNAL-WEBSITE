// An environment sender explicitly enables Resend; a database override alone
// must not re-enable it while the organization has no verified sending domain.
export function resendConfiguration() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return sender && apiKey ? { sender, apiKey } : null;
}
