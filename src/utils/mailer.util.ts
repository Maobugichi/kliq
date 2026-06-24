import { Resend } from "resend";
import type { BuyerEmailTemplate } from "../types/email.types.js";

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



const mergeTags = (str: string, firstName: string): string =>
  str.replace(/\{name\}/gi, firstName);

const bodyToHtml = (raw: string, firstName: string): string =>
  mergeTags(raw, firstName)
    .split("\n")
    .map(
      (line) =>
        `<p style="color:#cfcfcf;line-height:1.7;margin:0 0 10px;font-size:14px;">${
          line.trim() || "&nbsp;"
        }</p>`
    )
    .join("");


const unsubscribeFooter = `
  <div style="
    margin-top:24px;
    padding:12px 14px;
    border-radius:10px;
    background:rgba(255,255,255,0.02);
    border:1px solid rgba(255,255,255,0.05);
    font-size:11px;
    color:#444;
    line-height:1.6;
    text-align:center;
  ">
    You're receiving this because you purchased from this creator on
    <span style="color:#FF5C00;">CreatorLock</span>.
    To stop receiving messages, reply with "unsubscribe".
  </div>
`;

// ─── Template: Thank You ──────────────────────────────────────────────────────

const renderThankYou = (
  firstName: string,
  creatorName: string,
  body: string
): string =>
  baseLayout(`
    ${heading("🎉", "Thank you so much!", `A message from ${creatorName}`)}

    ${bodyToHtml(body, firstName)}

    <div style="
      margin:20px 0;
      padding:14px;
      border-radius:12px;
      background:rgba(255,92,0,0.06);
      border:1px solid rgba(255,92,0,0.15);
      font-size:13px;
      color:#ffb38a;
      text-align:center;
      line-height:1.6;
    ">
      💛 Your support means everything. Thank you for being a customer.
    </div>

    ${unsubscribeFooter}
  `);

// ─── Template: Re-engagement ──────────────────────────────────────────────────

const renderReengagement = (
  firstName: string,
  creatorName: string,
  body: string
): string =>
  baseLayout(`
    ${heading("💌", `Hey ${firstName}, we miss you!`, `From ${creatorName}`)}

    ${bodyToHtml(body, firstName)}

    <div style="
      margin:20px 0;
      padding:14px;
      border-radius:12px;
      background:rgba(255,255,255,0.03);
      border:1px solid rgba(255,255,255,0.07);
      font-size:13px;
      color:#888;
      text-align:center;
      line-height:1.6;
    ">
      It's been a while — come see what's new 👀
    </div>

    ${unsubscribeFooter}
  `);

// ─── Template: Discount ───────────────────────────────────────────────────────

const renderDiscount = (
  firstName: string,
  creatorName: string,
  body: string,
  couponCode?: string
): string =>
  baseLayout(`
    ${heading("🏷️", "A special offer, just for you", `From ${creatorName}`)}

    ${bodyToHtml(body, firstName)}

    ${
      couponCode
        ? `<div style="margin:20px 0;">
            <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;text-align:center;">
              Your discount code
            </p>
            <div style="
              background:rgba(255,92,0,0.08);
              border:1px dashed rgba(255,92,0,0.4);
              border-radius:12px;
              padding:16px;
              text-align:center;
            ">
              <span style="
                font-family:monospace;
                font-size:22px;
                font-weight:700;
                color:#FF5C00;
                letter-spacing:0.15em;
              ">${couponCode}</span>
            </div>
          </div>`
        : ""
    }

    ${unsubscribeFooter}
  `);

// ─── Template: New Product ────────────────────────────────────────────────────

const renderNewProduct = (
  firstName: string,
  creatorName: string,
  body: string,
  productTitle?: string,
  productUrl?: string
): string =>
  baseLayout(`
    ${heading("🚀", "Something new just dropped", `From ${creatorName}`)}

    ${bodyToHtml(body, firstName)}

    ${
      productTitle
        ? `<div style="
            margin:20px 0;
            background:rgba(255,92,0,0.06);
            border:1px solid rgba(255,92,0,0.2);
            border-radius:12px;
            padding:16px;
            text-align:center;
          ">
            <p style="margin:0 0 4px;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">New release</p>
            <p style="margin:0;color:#fff;font-size:16px;font-weight:700;">${productTitle}</p>
          </div>
          ${productUrl ? button("Check it out →", productUrl) : ""}`
        : ""
    }

    ${unsubscribeFooter}
  `);

// ─── Template: Custom (no structural chrome, just the creator's message) ─────

const renderCustom = (
  firstName: string,
  creatorName: string,
  subject: string,
  body: string
): string =>
  baseLayout(`
    ${heading("✉️", subject, `A message from ${creatorName}`)}

    ${bodyToHtml(body, firstName)}

    ${unsubscribeFooter}
  `);

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export const sendBuyerBroadcastEmail = async (payload: {
  to: string;
  buyerName: string;
  creatorName: string;
  template: BuyerEmailTemplate;
  subject: string;
  body: string;
  couponCode?: string;
  productTitle?: string;
  productUrl?: string;
}): Promise<void> => {
  const buyerName = payload.buyerName;
  let html: string;

  switch (payload.template) {
    case "thank_you":
      html = renderThankYou(buyerName, payload.creatorName, payload.body);
      break;

    case "reengagement":
      html = renderReengagement(buyerName, payload.creatorName, payload.body);
      break;

    case "discount":
      html = renderDiscount(
        buyerName,
        payload.creatorName,
        payload.body,
        payload.couponCode
      );
      break;

    case "new_product":
      html = renderNewProduct(
        buyerName,
        payload.creatorName,
        payload.body,
        payload.productTitle,
        payload.productUrl
      );
      break;

    case "custom":
      html = renderCustom(
        buyerName,
        payload.creatorName,
        payload.subject,
        payload.body
      );
      break;

    default: {
      const _exhaustive: never = payload.template;
      throw new Error(`Unknown buyer email template: ${_exhaustive}`);
    }
  }

  await sendEmail({ to: payload.to, subject: payload.subject, html });
};