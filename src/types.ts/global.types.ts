export interface UserProp {
  id: string;
  email: string;
  name: string;
  role: "creator" | "buyer" | "admin";
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}