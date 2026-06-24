// ─────────────────────────────────────────────────────────────
// buyerEmailTemplates.ts
// Single source of truth for all buyer email templates.
// The drawer loads these; the API validates against template IDs.
// ─────────────────────────────────────────────────────────────

export type TemplateId =
  | "re-engagement"
  | "discount"
  | "new-product"
  | "follow-up"
  | "custom";

export interface EmailTemplate {
  id: TemplateId;
  label: string;
  description: string; // shown in the template picker card
  icon: string;        // emoji — keeps the picker lightweight
  defaultSubject: string;
  defaultBody: string; // {name} is the only merge tag for now
}

// ── Templates ────────────────────────────────────────────────

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "re-engagement",
    label: "We miss you",
    description: "Re-engage buyers who haven't ordered in a while.",
    icon: "👋",
    defaultSubject: "Hey {name}, we miss you",
    defaultBody: `Hey {name},

It's been a while since your last order, and we just wanted to check in.

We've been busy building and there's a lot of new stuff waiting for you. Come take a look — we think you'll like what you find.

As always, reply to this email if there's anything we can help with.

Talk soon.`,
  },

  {
    id: "discount",
    label: "You've got a discount",
    description: "Send a promo code or special offer to your buyers.",
    icon: "🎁",
    defaultSubject: "A little something for you, {name}",
    defaultBody: `Hey {name},

You've been a great customer, and we want to show some appreciation.

Use the code below at checkout to get a discount on your next order:

[INSERT PROMO CODE]

This offer is just for you — enjoy it.

Thanks for your support. It really means a lot.`,
  },

  {
    id: "new-product",
    label: "New product announcement",
    description: "Let your buyers know about something new you've launched.",
    icon: "🚀",
    defaultSubject: "{name}, something new just dropped",
    defaultBody: `Hey {name},

We just launched something new and you're one of the first to hear about it.

[DESCRIBE YOUR PRODUCT IN 1–2 SENTENCES]

Check it out here: [INSERT LINK]

We put a lot into this one. Hope you love it as much as we do.`,
  },

  {
    id: "follow-up",
    label: "Order follow-up",
    description: "Check in after a purchase and invite a review.",
    icon: "⭐",
    defaultSubject: "How was your experience, {name}?",
    defaultBody: `Hey {name},

Hope you're enjoying your recent purchase!

We'd love to hear what you think. If you have a moment, leaving a quick review helps us improve and helps other buyers know what to expect.

[INSERT REVIEW LINK]

And if anything wasn't quite right, just reply here — we'll make it right.

Thanks again for your support.`,
  },
];

// ── Custom template placeholder ──────────────────────────────
// Not stored in the array above (it has no defaults to show in a card),
// but the TemplateId union includes "custom" so the drawer and API
// can handle it as a first-class mode.

export const CUSTOM_TEMPLATE_META = {
  id: "custom" as TemplateId,
  label: "Custom email",
  description: "Write your own subject and message from scratch.",
  icon: "✏️",
};

// ── Helper ───────────────────────────────────────────────────

export function getTemplateById(id: TemplateId): EmailTemplate | null {
  return EMAIL_TEMPLATES.find((t) => t.id === id) ?? null;
}