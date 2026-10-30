import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { playerAccounts } from "./schema";

export const playerInvitationPolicy = sqliteTable("player_invitation_policy", {
  id: text("id").primaryKey(), enabled: integer("enabled").notNull(), period: text("period").notNull(),
  maxRegistrationsPerPeriod: integer("max_registrations_per_period").notNull(),
  maxUsesPerCode: integer("max_uses_per_code").notNull(), maxValidityDays: integer("max_validity_days").notNull(),
  minAccountAgeDays: integer("min_account_age_days").notNull(), minApprovedSubmissions: integer("min_approved_submissions").notNull(), eligibilityMode: text("eligibility_mode").notNull(),
  updatedBy: text("updated_by").notNull(), updatedAt: integer("updated_at").notNull(),
});

export const playerInvitationOverrides = sqliteTable("player_invitation_overrides", {
  playerAccountId: text("player_account_id").primaryKey().references(() => playerAccounts.id), enabled: integer("enabled"),
  maxRegistrationsPerPeriod: integer("max_registrations_per_period"),
  maxUsesPerCode: integer("max_uses_per_code"), maxValidityDays: integer("max_validity_days"),
  minAccountAgeDays: integer("min_account_age_days"), minApprovedSubmissions: integer("min_approved_submissions"), eligibilityMode: text("eligibility_mode"),
  updatedBy: text("updated_by").notNull(), updatedAt: integer("updated_at").notNull(),
});

export const playerInvitations = sqliteTable("player_invitations", {
  id: text("id").primaryKey(), code: text("code").notNull(), inviterPlayerAccountId: text("inviter_player_account_id").notNull().references(() => playerAccounts.id),
  maxUses: integer("max_uses").notNull(), expiresAt: integer("expires_at").notNull(), revokedAt: integer("revoked_at"), revokedBy: text("revoked_by"), createdAt: integer("created_at").notNull(),
}, (table) => ({
  code: uniqueIndex("player_invitations_code_idx").on(table.code),
  inviter: index("player_invitations_inviter_idx").on(table.inviterPlayerAccountId, table.createdAt),
}));

export const playerInvitationRedemptions = sqliteTable("player_invitation_redemptions", {
  id: text("id").primaryKey(), invitationId: text("invitation_id").notNull().references(() => playerInvitations.id),
  inviterPlayerAccountId: text("inviter_player_account_id").notNull().references(() => playerAccounts.id),
  inviteePlayerAccountId: text("invitee_player_account_id").notNull().references(() => playerAccounts.id), completedAt: integer("completed_at").notNull(),
}, (table) => ({
  invitee: uniqueIndex("player_invitation_redemptions_invitee_idx").on(table.inviteePlayerAccountId),
  inviter: index("player_invitation_redemptions_inviter_idx").on(table.inviterPlayerAccountId, table.completedAt),
  invitation: index("player_invitation_redemptions_invitation_idx").on(table.invitationId),
}));

export const playerInvitationClaims = sqliteTable("player_invitation_claims", {
  id: text("id").primaryKey(), invitationId: text("invitation_id").notNull().references(() => playerInvitations.id), tokenHash: text("token_hash").notNull(), codeHash: text("code_hash").notNull().unique(),
  playerName: text("player_name").notNull(), normalizedPlayerName: text("normalized_player_name").notNull(), playerId: text("player_id").notNull(),
  status: text("status").notNull(), rejectionReason: text("rejection_reason"), memberOpenId: text("member_open_id"), groupOpenId: text("group_open_id"), messageId: text("message_id"),
  expiresAt: integer("expires_at").notNull(), createdAt: integer("created_at").notNull(), verifiedAt: integer("verified_at"), decidedAt: integer("decided_at"),
}, (table) => ({
  expiry: index("player_invitation_claims_expiry_idx").on(table.status, table.expiresAt),
  invitation: index("player_invitation_claims_invitation_idx").on(table.invitationId),
}));
