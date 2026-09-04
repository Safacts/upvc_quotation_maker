import fs from "fs";
import path from "path";
import { buildQuotationPdf } from "../src/lib/quotation-pdf";

async function run() {
  console.log("Generating test PDF for Vaishnavi...");
  
  const dummyData = {
    quoteNo: "322",
    date: new Date("2026-08-13T00:00:00Z"),
    customerName: "Santhosh kumar",
    contactNo: "",
    email: "",
    address: "",
    reference: "",
    supplierCompany: "",
    measured: [
      {
        code: "",
        description: "3 track sliding windows with mesh shutter",
        glass: "Clear",
        width: 1828,
        height: 1828,
        units: 46,
        rate: 355.93,
      },
      {
        code: "",
        description: "2.5 track sliding window",
        glass: "Clear",
        width: 1036,
        height: 1828,
        units: 6,
        rate: 355.93,
      }
    ],
    unmeasured: [],
    totals: {
      totalSqft: 3182.4,
      totalMeasured: 3182.4,
      totalUnmeasured: 0,
      subtotal: 1132718.64,
      transport: 0,
      discountAmount: 0,
      discountPercentage: 0,
      gstPercentage: 18,
      gstAmount: 203889.36,
      grandTotal: 1336608.00,
      advancePaid: 0,
      balanceDue: 1336608.00,
      roundoff: 0,
      netTotal: 1132718.64,
    },
    clientId: "vaishnavi",
    companyName: "Vaishnavi Upvc Windows & Doors",
    companyAddress: "SY NO 21 AND 22 Near Kharmanghat\nHanuman Temple Gayatri Nagar X\nRoads Hyderabad",
    companyProprietor: "Vaishnavi",
    companyContact: "9640000825",
    gstNumber: "36CSPPV7053P1ZJ",
    bankName: "Yes Bank",
    bankBranch: "Lb Nagar, Hyderabad",
    bankAccountNo: "11352700000045",
    bankIfsc: "YESB0001135",
    termsAndConditions: [
      "1) the proposal made is based on the routh measurements / dimensions provide to us once the order is confirmed accurate site measurements are taken again.hence there maybe increase or decrease in total SFT.",
      "2) A work order with contract detai need to be provide latter head duly signed along with advance payment.",
      "3) payments TERM: 30% Along with work order 50% after material delivery 20% after work completed",
      "4) delivery Date: 16 day's",
      "5) offer validity: 30 days from date of quatation",
      "Thank you for doing business with us."
    ],
  };

  try {
    const pdfBytes = await buildQuotationPdf(dummyData);
    const outPath = path.join(process.cwd(), "vaishnavi_test_preview.pdf");
    fs.writeFileSync(outPath, pdfBytes);
    console.log(`Success! PDF saved to: ${outPath}`);
  } catch (err) {
    console.error("Error generating PDF:", err);
  }
}

run();
