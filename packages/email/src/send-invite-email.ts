import { getResend } from "./client";
import { UserInviteEmail } from "./templates/user-invite";

interface SendInviteEmailParams {
  to: string;
  resetUrl: string;
  userName?: string | null;
  invitedByName?: string | null;
}

export async function sendInviteEmail({
  to,
  resetUrl,
  userName,
  invitedByName,
}: SendInviteEmailParams) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: "SparkMotion <noreply@sparkmotion.net>",
    to,
    subject: "You're invited to SparkMotion",
    react: UserInviteEmail({ resetUrl, userName, invitedByName }),
  });

  if (error) {
    console.error("Failed to send invite email:", error);
    throw new Error("Failed to send invite email");
  }
}
