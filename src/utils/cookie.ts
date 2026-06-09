const isProd = process.env.NODE_ENV === "production";

const BASE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  ...(isProd && { domain: ".outray.app" }),
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