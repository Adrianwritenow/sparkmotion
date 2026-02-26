import { getResend } from "./client";
import { ContactOrgEmail } from "./templates/contact-org";

interface SendContactEmailParams {
  to: string;
  subject: string;
  body: string;
  orgName: string;
  senderName: string;
}

export async function sendContactEmail({
  to,
  subject,
  body,
  orgName,
  senderName,
}: SendContactEmailParams) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: "SparkMotion <noreply@sparkmotion.net>",
    to,
    subject,
    react: ContactOrgEmail({ senderName, orgName, subject, body }),
  });

  if (error) {
    console.error("Failed to send contact email:", error);
    throw new Error("Failed to send contact email");
  }
}
