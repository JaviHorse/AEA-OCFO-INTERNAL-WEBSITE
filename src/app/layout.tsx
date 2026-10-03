import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "AEA Finance", template: "%s · AEA Finance" },
  description: "Finance operations for the Ateneo Economics Association.",
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
