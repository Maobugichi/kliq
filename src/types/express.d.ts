import "express";
import type { UserProp } from "./global.types";

declare global {
  namespace Express {
    interface User extends Pick<UserProp, "id" | "email" | "role"> {}
  }
}

export {};

