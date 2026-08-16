import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vitharn UPVC Changelog | Product Updates",
  description: "See the latest Vitharn UPVC quotation, invoicing, portal, and fabricator workflow improvements.",
  alternates: { canonical: "https://app.vitharn.com/upvc/changelog" },
};

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
