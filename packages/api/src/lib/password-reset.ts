import crypto from "crypto";
import { db } from "@sparkmotion/database";
import type { UserRole } from "@sparkmotion/database";
import { sendPasswordResetEmail, sendInviteEmail } from "@sparkmotion/email";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const INVITE_TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

function getAdminUrl() {
  return process.env.ADMIN_URL || process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";
}

function getCustomerUrl() {
  return process.env.CUSTOMER_URL || process.env.NEXT_PUBLIC_CUSTOMER_URL || "http://localhost:3001";
}

interface InviteOptions {
  tokenExpiryMs?: number;
  isInvite?: boolean;
  orgName?: string | null;
}

export async function generateAndSendResetToken(
  userId: string,
  email: string,
  name: string | null,
  role: UserRole,
  options?: InviteOptions
) {
  const { tokenExpiryMs, isInvite, orgName } = options ?? {};
  const expiry = tokenExpiryMs ?? (isInvite ? INVITE_TOKEN_EXPIRY_MS : TOKEN_EXPIRY_MS);

  // Invalidate any existing unused tokens for this user
  await db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Generate token
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  await db.passwordResetToken.create({
    data: {
      userId,
      token: hashedToken,
      expiresAt: new Date(Date.now() + expiry),
    },
  });

  // Build role-based URL
  const baseUrl = role === "ADMIN" ? getAdminUrl() : getCustomerUrl();
  const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}`;

  if (isInvite) {
    await sendInviteEmail({ to: email, resetUrl, userName: name, orgName: orgName ?? null, isAdmin: role === "ADMIN" });
  } else {
    await sendPasswordResetEmail({ to: email, resetUrl, userName: name });
  }
}
