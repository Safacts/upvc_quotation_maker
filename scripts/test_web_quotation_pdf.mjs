import fs from 'fs';
import { buildQuotationPdf } from '../src/lib/quotation-pdf.ts';

async function test() {
  const data = {
    quoteNo: "KPRUPVC-25082026-0200",
    date: new Date("2026-08-25"),
    customerName: "SRINIVASREDDY SIR",
    contactNo: "9247878056",
    email: "",
    address: "",
    reference: "",
    supplierCompany: "",
    measured: [
      {
        code: "",
        description: "ALUMINIUM ELEUVATION",
        glass: "6MM SAFARI BLUE TUFFND GLASS",
        width: 1380,
        height: 3050,
        units: 2,
        rate: 670,
      }
    ],
    unmeasured: [],
    totals: {
      totalSqft: 90.61,
      subtotal: 60709.10,
      transport: 2000,
      gstPercentage: 18,
      gstAmount: 11287.64,
      grandTotal: 73996.74,
      discount: 0,
      roundoff: 0,
    },
    companyName: "KPR UPVC WINDOWS AND DOOR SYSTEMS",
    companyAddress: "plot no 33, hastinapur, anupama nagar colony",
    companyProprietor: "PRABHAKAAR REDDI",
    companyContact: "9848264478",
    gstNumber: "36AAQFK269C1Z1",
    bankName: "UNION BANK OF INDIA",
    bankBranch: "HASTHINAPURAM",
    bankAccountNo: "178511010000212",
    bankIfsc: "UBIN0817856",
    termsAndConditions: [
      "1. Payments terms: 100% Advance along with order.",
      "2. Price on quote is valid for 15 days only."
    ],
  };

  const bytes = await buildQuotationPdf(data);
  fs.writeFileSync('test_output/web_console_quotation_test.pdf', Buffer.from(bytes));
  console.log('Successfully generated test_output/web_console_quotation_test.pdf');
}

test().catch(console.error);
