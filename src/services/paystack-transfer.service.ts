const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE = "https://api.paystack.co";

export const paystackRequest = async (
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string
) => {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json();
  if (!data.status) throw new Error(data.message ?? "Paystack request failed");
  return data;
};

export const resolveBankAccount = async (
  accountNumber: string,
  bankCode: string
): Promise<{ account_name: string; account_number: string }> => {
  const data = await paystackRequest(
    "GET",
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
  );
  return {
    account_name: data.data.account_name,
    account_number: data.data.account_number,
  };
};

export const getBankList = async (): Promise<{ name: string; code: string }[]> => {
  const data = await paystackRequest("GET", "/bank?currency=NGN&country=nigeria");
  return data.data.map((b: any) => ({ name: b.name, code: b.code }));
};

// Payee-agnostic recipient caching. The caller supplies how to read/write
// the cached code for whatever row actually owns it — a creator_profiles
// row for creators, a users row for affiliates — so this function doesn't
// need to know or care which one it's talking to.
export const ensurePaystackRecipient = async (
  getCachedCode: () => Promise<string | null>,
  saveCode: (code: string) => Promise<void>,
  accountName: string,
  accountNumber: string,
  bankCode: string
): Promise<string> => {
  const cached = await getCachedCode();
  if (cached) return cached;

  const data = await paystackRequest("POST", "/transferrecipient", {
    type: "nuban",
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: "NGN",
  });

  const recipientCode = data.data.recipient_code as string;
  await saveCode(recipientCode);
  return recipientCode;
};

// Payee-agnostic transfer send — just moves money to a recipient code.
// Idempotency key prevents duplicate transfers on retry, same as before.
export const sendPaystackTransfer = async (
  amountCents: number,
  recipientCode: string,
  reason: string,
  idempotencyKey: string
): Promise<{ transfer_code: string }> => {
  const data = await paystackRequest(
    "POST",
    "/transfer",
    {
      source: "balance",
      amount: amountCents,
      recipient: recipientCode,
      reason,
    },
    idempotencyKey
  );

  return { transfer_code: data.data.transfer_code };
};