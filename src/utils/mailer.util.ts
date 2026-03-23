import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> => {
  await resend.emails.send({ from: FROM, to, subject, html });
};

export const sendVerificationEmail = async (
  to: string,
  token: string
): Promise<void> => {
  const url = `${process.env.APP_URL}/api/auth/verify-email/confirm`;
  await sendEmail({
    to,
    subject: "Verify your CreatorLock email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Verify your email</h2>
        <p>Use the token below to verify your email address. It expires in 24 hours.</p>
        <code style="background:#f4f4f4;padding:12px 20px;display:block;border-radius:6px;font-size:16px;letter-spacing:2px">${token}</code>
        <p style="color:#888;font-size:13px;margin-top:16px">If you didn't create a CreatorLock account, ignore this email.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (
  to: string,
  token: string
): Promise<void> => {
  await sendEmail({
    to,
    subject: "Reset your CreatorLock password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Reset your password</h2>
        <p>Use the token below to reset your password. It expires in 1 hour.</p>
        <code style="background:#f4f4f4;padding:12px 20px;display:block;border-radius:6px;font-size:16px;letter-spacing:2px">${token}</code>
        <p style="color:#888;font-size:13px;margin-top:16px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};

// Add this to your existing src/utils/mailer.ts

export const sendDownloadEmail = async (
  to: string,
  name: string,
  productTitle: string,
  token: string
): Promise<void> => {
  const downloadUrl = `${process.env.APP_URL}/download/${token}`;

  await sendEmail({
    to,
    subject: `Your download is ready — ${productTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Your purchase is confirmed 🎉</h2>
        <p>Hey ${name}, thanks for your purchase. Your download for <strong>${productTitle}</strong> is ready.</p>
        <a href="${downloadUrl}"
           style="display:inline-block;padding:12px 24px;background:#ff6b2b;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
          Download Now
        </a>
        <p style="margin-top:16px;color:#888;font-size:13px;">
          This link expires in 1 year and can be used up to 3 times.
          Keep this email safe — it's your proof of purchase.
        </p>
      </div>
    `,
  });
};