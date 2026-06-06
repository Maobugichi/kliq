import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

/* ─────────────────────────────────────────────
   BASE EMAIL SENDER
──────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   BRAND SYSTEM (CreatorLock Email UI Kit)
──────────────────────────────────────────── */

const baseLayout = (content: string) => `
  <div style="
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background:#0b0b0c;
    padding:40px 16px;
    color:#e5e5e5;
  ">
    <div style="
      max-width:520px;
      margin:0 auto;
      background:#0f0f10;
      border:1px solid rgba(255,255,255,0.06);
      border-radius:16px;
      padding:28px;
    ">
      ${content}
    </div>
  </div>
`;

const heading = (icon: string, title: string, subtitle?: string) => `
  <div style="text-align:center;margin-bottom:22px;">
    <div style="
      width:44px;
      height:44px;
      margin:0 auto 12px;
      border-radius:999px;
      background:rgba(255,92,0,0.12);
      border:1px solid rgba(255,92,0,0.35);
      color:#FF5C00;
      font-size:20px;
      line-height:44px;
    ">
      ${icon}
    </div>

    <h2 style="margin:0;font-size:22px;color:#fff;letter-spacing:-0.02em;">
      ${title}
    </h2>

    ${
      subtitle
        ? `<p style="margin:6px 0 0;font-size:12px;color:#888;letter-spacing:0.12em;text-transform:uppercase;">
            ${subtitle}
          </p>`
        : ""
    }
  </div>
`;

const text = (content: string) => `
  <p style="
    color:#cfcfcf;
    line-height:1.7;
    margin:0 0 14px;
    font-size:14px;
  ">
    ${content}
  </p>
`;

const button = (label: string, url: string) => `
  <div style="text-align:center;margin:26px 0;">
    <a href="${url}"
      style="
        display:inline-block;
        padding:14px 28px;
        background:#FF5C00;
        color:#fff;
        text-decoration:none;
        border-radius:10px;
        font-weight:600;
        font-size:14px;
      ">
      ${label}
    </a>
  </div>
`;

const codeBox = (value: string) => `
  <code style="
    display:block;
    background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.08);
    color:#aaa;
    padding:12px;
    border-radius:10px;
    font-size:12px;
    word-break:break-all;
  ">
    ${value}
  </code>
`;

/* ─────────────────────────────────────────────
   EMAIL TEMPLATES
──────────────────────────────────────────── */

/* 🔐 VERIFY EMAIL */
export const sendVerificationEmail = async (
  to: string,
  token: string
): Promise<void> => {
  const url = `${process.env.FRONTEND_URL}/verify-email/confirm?token=${token}`;

  const html = baseLayout(`
    ${heading("📨", "Verify your email", "CreatorLock")}

    ${text("Click the button below to verify your CreatorLock account and continue onboarding.")}

    ${button("Verify Email", url)}

    ${text("If you didn’t create this account, you can safely ignore this email.")}
  `);

  await sendEmail({
    to,
    subject: "Verify your CreatorLock email",
    html,
  });
};

/* 🔑 PASSWORD RESET */
export const sendPasswordResetEmail = async (
  to: string,
  token: string
): Promise<void> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const html = baseLayout(`
    ${heading("🔑", "Reset your password", "CreatorLock")}

    ${text("We received a request to reset your password. This link expires in 1 hour.")}

    ${button("Reset Password", resetUrl)}

    ${text("If you didn’t request this, you can ignore this email safely.")}
  `);

  await sendEmail({
    to,
    subject: "Reset your CreatorLock password",
    html,
  });
};

/* 📦 DOWNLOAD EMAIL */
export const sendDownloadEmail = async (
  to: string,
  name: string,
  productTitle: string,
  token: string
): Promise<void> => {
  const downloadUrl = `${process.env.FRONTEND_URL}/download/${token}`;

  const html = baseLayout(`
    ${heading("📦", "Your download is ready", "CreatorLock")}

    ${text(`Hey <b>${name}</b>, your purchase of <b>${productTitle}</b> is ready.`)}

    ${button("Download Now", downloadUrl)}

    ${text("This download link is time-limited and tied to your purchase. You can use it up to 3 times.")}

    ${text("Keep this email safe — it serves as your proof of purchase.")}
  `);

  await sendEmail({
    to,
    subject: `Your download is ready — ${productTitle}`,
    html,
  });
};

/* 🔐 WAITLIST EMAIL */
export const sendWaitlistConfirmationEmail = async (
  to: string
): Promise<void> => {
  const html = baseLayout(`
    ${heading("🔐", "You’re locked in.", "CreatorLock waitlist")}

    ${text("You’ve secured early access to CreatorLock — a private space for creators building and selling digital products.")}

    ${text("We’re still building behind the scenes, but you’ll be among the first to enter when we open.")}

    <div style="
      margin:18px 0;
      padding:12px 14px;
      border-radius:12px;
      background:rgba(255,92,0,0.06);
      border:1px solid rgba(255,92,0,0.15);
      color:#ffb38a;
      font-size:13px;
    ">
      ⚡ Early access is reserved. You’re ahead of the crowd.
    </div>

    ${text("If you didn’t request this, you can ignore this email.")}
  `);

  await sendEmail({
    to,
    subject: "You’ve been locked in 🔐 CreatorLock waitlist",
    html,
  });
};


export const sendAffiliateInviteEmail = async (
  to: string,
  affiliateName: string,
  creatorName: string,
  productPlatformUrl: string,
  commissionPercent: number,
  affiliateCode: string
): Promise<void> => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard/affiliate`;

  const html = baseLayout(`
    ${heading("🤝", "You've been added as an affiliate", "CreatorLock")}

    ${text(`Hey <b>${affiliateName}</b>, <b>${creatorName}</b> has added you as an affiliate on CreatorLock with a <b>${commissionPercent}% commission</b> on every sale you refer.`)}

    ${text("Share the link below with your audience. When someone buys through it, you earn automatically.")}

    <div style="margin:18px 0;">
      <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Your referral link</p>
      ${codeBox(`${productPlatformUrl}?ref=${affiliateCode}`)}
    </div>

    ${button("View Your Affiliate Dashboard", dashboardUrl)}

    ${text("You can track your conversions and earnings anytime from your dashboard.")}
  `);

  await sendEmail({
    to,
    subject: `${creatorName} added you as an affiliate — earn ${commissionPercent}% per sale`,
    html,
  });
};


export const sendAffiliateConversionEmail = async (
  to: string,
  affiliateName: string,
  productTitle: string,
  commissionCents: number,
  totalEarnedCents: number
): Promise<void> => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard/affiliate`;
  const commission = (commissionCents / 100).toFixed(2);
  const totalEarned = (totalEarnedCents / 100).toFixed(2);

  const html = baseLayout(`
    ${heading("💸", "You just earned a commission", "CreatorLock")}

    ${text(`Hey <b>${affiliateName}</b>, someone just purchased <b>${productTitle}</b> through your referral link.`)}

    <div style="
      display:flex;
      gap:12px;
      margin:20px 0;
    ">
      <div style="
        flex:1;
        background:rgba(255,92,0,0.06);
        border:1px solid rgba(255,92,0,0.15);
        border-radius:12px;
        padding:14px;
        text-align:center;
      ">
        <p style="margin:0;color:#FF5C00;font-size:22px;font-weight:700;">$${commission}</p>
        <p style="margin:4px 0 0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">This sale</p>
      </div>
      <div style="
        flex:1;
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.06);
        border-radius:12px;
        padding:14px;
        text-align:center;
      ">
        <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">$${totalEarned}</p>
        <p style="margin:4px 0 0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Total earned</p>
      </div>
    </div>

    ${button("View Your Earnings", dashboardUrl)}

    ${text("Commissions are tracked and paid out by the creator. Check your dashboard for payout status.")}
  `);

  await sendEmail({
    to,
    subject: `You earned $${commission} — ${productTitle} sale via your link`,
    html,
  });
};

export const sendNewSaleEmail = async (
  to: string,
  creatorName: string,
  productTitle: string,
  amountCents: number,
  buyerName: string
): Promise<void> => {
  const amount = (amountCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'NGN',
  });

  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;

  const html = baseLayout(`
    ${heading("🎉", "You just made a sale!", "CreatorLock")}

    ${text(`Hey <b>${creatorName}</b>, <b>${buyerName}</b> just purchased <b>${productTitle}</b>.`)}

    <div style="
      margin:20px 0;
      background:rgba(255,92,0,0.06);
      border:1px solid rgba(255,92,0,0.15);
      border-radius:12px;
      padding:16px;
      text-align:center;
    ">
      <p style="margin:0;color:#FF5C00;font-size:28px;font-weight:700;">${amount}</p>
      <p style="margin:4px 0 0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Sale amount</p>
    </div>

    ${button("View Dashboard", dashboardUrl)}

    ${text("Keep creating — your next sale is on the way.")}
  `);

  await sendEmail({
    to,
    subject: `New sale — ${buyerName} bought "${productTitle}"`,
    html,
  });
};