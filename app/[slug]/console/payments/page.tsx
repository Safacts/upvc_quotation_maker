import PaymentsClient from "./PaymentsClient";

export const metadata = {
  title: "Payments & Ledger — Console",
  description: "Track customer advance payments, receivables, and payment modes.",
};

export default function PaymentsPage() {
  return <PaymentsClient />;
}
