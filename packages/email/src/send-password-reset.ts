import { getResend } from "./client";
import { PasswordResetEmail } from "./templates/password-reset";

interface SendPasswordResetParams {
  to: string;
  resetUrl: string;
  userName?: string | null;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  userName,
}: SendPasswordResetParams) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: "SparkMotion <noreply@sparkmotion.net>",
    to,
    subject: "Reset your password",
    react: PasswordResetEmail({ resetUrl, userName }),
  });

  if (error) {
    console.error("Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}
