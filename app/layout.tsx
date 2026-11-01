import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofBeforePay — Evidence before payment",
  description: "Agree the scope, authorize a test payment, review delivery evidence, and approve capture only after acceptance.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
