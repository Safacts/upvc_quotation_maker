import InventoryClient from "./InventoryClient";

export const metadata = {
  title: "Inventory & Stock — Console",
  description: "Manage uPVC profiles, glass sheets, hardware stock levels, and low-stock alerts.",
};

export default function InventoryPage() {
  return <InventoryClient />;
}
