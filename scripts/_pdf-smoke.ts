import { writeFileSync } from "fs";
import { renderReceiptPdf, amountInWords } from "../src/lib/fees/receipt-pdf";

async function main() {
const buf = await renderReceiptPdf({
  school: { name: "Demo Secondary School", nameNe: "डेमो माध्यमिक विद्यालय", address: "Kathmandu", phone: "01-5550123", panVatNo: "609123456" },
  receiptNo: "2083/84-RCP-000001",
  paidAt: new Date(),
  method: "cash",
  reference: null,
  providerRef: null,
  amountPaisa: 1234550,
  invoiceNo: "2083/84-INV-000007",
  periodLabel: "Jestha 2083",
  student: { name: "Aarav Shrestha", nameNe: "आरव श्रेष्ठ", admissionNo: "ADM-2082-0014", className: "Class 5", sectionName: "B", rollNo: 14 },
  receivedByName: "Demo Admin",
  priorPrints: 1,
});
writeFileSync("C:/Users/Dell/AppData/Local/Temp/receipt-smoke.pdf", buf);
console.log("bytes:", buf.length, "| words:", amountInWords(1234550));
}
main();
