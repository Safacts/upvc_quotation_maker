import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaSwRegister from "./PwaSwRegister";
import UmamiTracker from "./UmamiTracker";
import UmamiClickTracker from "./UmamiClickTracker";

export const metadata: Metadata = {
  title: "Vitharn ERP Services — Industry Software Built for Speed",
  description: "Vitharn builds vertical-specific ERP tools that transform small shops into modern, digital-first enterprises. Explore UPVC, Glass, Retail, and more.",
  icons: {
    icon: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Vitharn ERP",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
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
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <PwaSwRegister />
        <UmamiTracker />
        <UmamiClickTracker />
      </body>
    </html>
  );
}
