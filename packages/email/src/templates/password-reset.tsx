import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface PasswordResetEmailProps {
  resetUrl: string;
  userName?: string | null;
}

export function PasswordResetEmail({
  resetUrl,
  userName,
}: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Reset your password</Text>
            <Text style={text}>
              Hi {userName || "there"},
            </Text>
            <Text style={text}>
              We received a request to reset your SparkMotion password. Click the
              button below to choose a new one.
            </Text>
            <Button style={button} href={resetUrl}>
              Reset Password
            </Button>
            <Text style={smallText}>
              This link expires in 1 hour. If you didn't request a password
              reset, you can safely ignore this email.
            </Text>
            <Hr style={hr} />
            <Text style={footer}>SparkMotion</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "560px",
};

const section = {
  padding: "0 48px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "bold" as const,
  color: "#1a1a1a",
  margin: "40px 0 16px",
};

const text = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#444",
};

const button = {
  backgroundColor: "#0f172a",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  margin: "24px 0",
};

const smallText = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#888",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0 16px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
};
