import ChallansClient from "./ChallansClient";

export const metadata = {
  title: "Delivery Challans & Gate Passes — Console",
  description: "Generate factory gate passes, dispatch challans, vehicle and driver records.",
};

export default function ChallansPage() {
  return <ChallansClient />;
}
