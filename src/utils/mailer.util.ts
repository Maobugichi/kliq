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

export const sendWaitlistConfirmationEmail = async (to: string): Promise<void> => {
  await sendEmail({
    to,
    subject: "You’ve been locked in 🔐 CreatorLock waitlist",
    
    html: `
      <div style="
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        max-width: 520px;
        margin: 0 auto;
        padding: 40px 28px;
        background: #0b0b0c;
        color: #e5e5e5;
        border-radius: 16px;
      ">

      
        <div style="text-align:center;margin-bottom:28px;">
           <div style="
              width:42px;
              height:42px;
              margin:0 auto 14px;
              border-radius:999px;
              background:rgba(255,92,0,0.12);
              border:1px solid rgba(255,92,0,0.35);
              color:#FF5C00;
              font-size:20px;
              line-height:42px;
              text-align:center;
            ">
              🔐
            </div>

          <h2 style="
            margin:0;
            font-size:22px;
            color:#ffffff;
            letter-spacing:-0.02em;
          ">
            You’re locked in.
          </h2>

          <p style="
            margin:6px 0 0;
            font-size:13px;
            color:#888;
            letter-spacing:0.12em;
            text-transform:uppercase;
          ">
            CreatorLock waitlist
          </p>
        </div>

        
        <p style="color:#cfcfcf;line-height:1.7;margin:0 0 18px;">
          You’ve just secured early access to CreatorLock — a private space for African creators building, selling, and protecting digital products.
        </p>

        <p style="color:#cfcfcf;line-height:1.7;margin:0 0 22px;">
          Think of this as a quiet entry into something early. We’re still setting things up behind the scenes, but you’ll be one of the first to step inside when the doors open.
        </p>

        
        <div style="
          padding:12px 14px;
          border-radius:12px;
          background:rgba(255,92,0,0.06);
          border:1px solid rgba(255,92,0,0.15);
          color:#ffb38a;
          font-size:13px;
          margin-bottom:24px;
        ">
          ⚡ Early access is reserved. You’re ahead of the crowd.
        </div>

       
        <p style="color:#777;font-size:12px;line-height:1.6;margin:0;">
          Didn’t request this? You can ignore this email safely.
        </p>
      </div>
    `,
  });
};