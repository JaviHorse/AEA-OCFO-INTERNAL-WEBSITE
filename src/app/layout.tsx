import type { Metadata } from "next";
import "./globals.css";
import "./aea-theme.css";
export const metadata: Metadata = {
  title: { default: "AEA Finance", template: "%s · AEA Finance" },
  description: "Finance operations for the Ateneo Economics Association.",
  icons: { icon: "/brand/aea-logo.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
