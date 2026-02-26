import crypto from "crypto";
import { db } from "@sparkmotion/database";
import type { UserRole } from "@sparkmotion/database";
import { sendPasswordResetEmail } from "@sparkmotion/email";

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";
const CUSTOMER_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_URL || "http://localhost:3001";

export async function generateAndSendResetToken(
  userId: string,
  email: string,
  name: string | null,
  role: UserRole
) {
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
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    },
  });

  // Build role-based URL
  const baseUrl = role === "ADMIN" ? ADMIN_URL : CUSTOMER_URL;
  const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}`;

  await sendPasswordResetEmail({ to: email, resetUrl, userName: name });
}
