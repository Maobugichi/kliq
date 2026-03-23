export enum CreatorStatus {
  PENDING = "pending",
  ACTIVE = "active",
  SUSPENDED = "suspended",
  REJECTED = "rejected",
}

export interface CreatorProfile {
  id: string;
  user_id: string;
  display_name: string;
  store_slug: string;
  bio: string | null;
  profile_image: string | null;
  banner_image: string | null;
  social_links: Record<string, string> | null;
  store_customization: Record<string, unknown> | null;
  payout_enabled: boolean;
  status: CreatorStatus;
  verified_at: Date | null;
  suspended_at: Date | null;
  suspended_reason: string | null;
  rejected_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export type UpdateCreatorProfileInput = Partial<
  Pick<
    CreatorProfile,
    | "display_name"
    | "bio"
    | "profile_image"
    | "banner_image"
    | "social_links"
    | "store_customization"
  >
>;


