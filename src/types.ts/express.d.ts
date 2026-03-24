import "express";
import type { UserProp } from "./global.types.js";

declare module "express" {
  interface Request {
    user?: Pick<UserProp, "id" | "email" | "role">;
  }
}

declare module "express-serve-static-core" {
  interface ParamsDictionary {
    [key: string]: string;
  }
  interface Request {
    params: Record<string, string>;
    query: Record<string, string>;
  }
}