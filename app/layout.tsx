import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import PwaSwRegister from "./PwaSwRegister";
import UmamiTracker from "./UmamiTracker";
import UmamiClickTracker from "./UmamiClickTracker";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.vitharn.com"),
  title: "Vitharn ERP Services — Business Software for Indian Fabricators",
  description:
    "Vitharn builds industry-specific software for UPVC, glass, and fabrication businesses. Branded quotations, customer portals, and business websites. Made in Hyderabad, India.",
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Get CSP nonce from middleware header (set via middleware)
  const headersList = headers();
  const nonce = headersList.get("x-csp-nonce") || "";

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <PwaSwRegister />
        <UmamiTracker nonce={nonce} />
        <UmamiClickTracker nonce={nonce} />
      </body>
    </html>
  );
}
