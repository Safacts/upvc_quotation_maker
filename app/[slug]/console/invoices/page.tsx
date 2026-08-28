import InvoicesClient from "./InvoicesClient";

export const metadata = {
  title: "GST Tax Invoices — Console",
  description: "Generate compliant GST tax invoices, manage payments, and download official invoices.",
};

export default function InvoicesPage() {
  return <InvoicesClient />;
}
