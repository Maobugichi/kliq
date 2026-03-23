import type { UserProp } from "./global.types.js";

declare global {
  namespace Express {
    interface Request {
      user?: Pick<UserProp, "id" | "email" | "role">;
    }
  }
}