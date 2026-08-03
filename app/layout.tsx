import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vitharn UPVC Quotation Maker",
  description: "A complete platform for UPVC window and door businesses to create, manage, and send professional quotations — on Android and the web.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // allow pinch zoom for accessibility
  userScalable: true,
  interactiveWidget: "resizes-visual",
  themeColor: "#6366f1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
