import type { Metadata } from "next";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/lib/trpc-provider";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparkMotion Admin",
  description: "SparkMotion admin dashboard",
  icons: {
    icon: "/sparkmotion_icon_gradient.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <TRPCProvider>{children}</TRPCProvider>
        </Providers>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
