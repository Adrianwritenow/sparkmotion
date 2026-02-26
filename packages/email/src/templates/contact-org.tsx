import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface ContactOrgEmailProps {
  senderName: string;
  orgName: string;
  subject: string;
  body: string;
}

export function ContactOrgEmail({
  senderName,
  orgName,
  subject,
  body,
}: ContactOrgEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Message from SparkMotion</Text>
            <Text style={text}>
              <strong>{senderName}</strong> sent a message regarding{" "}
              <strong>{orgName}</strong>:
            </Text>
            <Text style={subjectStyle}>Subject: {subject}</Text>
            <Text style={text}>{body}</Text>
            <Hr style={hr} />
            <Text style={footer}>
              This email was sent via SparkMotion Admin. Do not reply directly to
              this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
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

const subjectStyle = {
  fontSize: "16px",
  lineHeight: "26px",
  color: "#444",
  fontWeight: "bold" as const,
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0 16px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
};
