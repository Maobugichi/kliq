export interface AccessTokenPayload {
  id: string;
  email: string;
  role?: "creator" | "buyer" | "admin";
  email_verified: boolean;  
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;  
}