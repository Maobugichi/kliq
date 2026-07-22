export const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://creatorlock.co",
  "https://www.creatorlock.co",
].filter(Boolean) as string[];