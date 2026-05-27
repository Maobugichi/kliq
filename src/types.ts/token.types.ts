export interface AccessTokenPayload {
  id: string;
  email: string;
  role?: "creator" | "buyer" | "admin";
}

export interface RefreshTokenPayload {
  userId: string;
}