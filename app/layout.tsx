import type { Metadata, Viewport } from "next";
import "./globals.css";
import UmamiTracker from "./UmamiTracker";

export const metadata: Metadata = {
  title: "vitharn upvc — Quotation & Business Management Portal",
  description: "vitharn upvc is a complete platform for UPVC window and door businesses to create, manage, and send professional quotations — on Android and the web.",
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
      <body>
        {children}
        <UmamiTracker />
      </body>
    </html>
  );
}
