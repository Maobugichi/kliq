type CookieMode = "local" | "shared";

const cookieMode = (process.env.COOKIE_MODE as CookieMode) ?? "local";

if (cookieMode !== "local" && cookieMode !== "shared") {
  throw new Error(
    `Invalid COOKIE_MODE "${cookieMode}" — must be "local" or "shared"`
  );
}

const isShared = cookieMode === "shared";

const BASE = {
  httpOnly: true,
  secure: isShared,
  sameSite: isShared ? ("none" as const) : ("lax" as const),
  ...(isShared && { domain: ".outray.app" }),
};

export const ACCESS_COOKIE_OPTIONS = {
  ...BASE,
  maxAge: 1000 * 60 * 15,
};

export const REFRESH_COOKIE_OPTIONS = {
  ...BASE,
  maxAge: 1000 * 60 * 60 * 24 * 30,
};

export const COOKIE_CLEAR_OPTIONS = { ...BASE };

export function cookieOptions(type: "access" | "refresh") {
  return type === "access" ? ACCESS_COOKIE_OPTIONS : REFRESH_COOKIE_OPTIONS;
}