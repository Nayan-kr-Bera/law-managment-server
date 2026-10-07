import db from "./db/index.js";
import invoices from "./db/schema/finance/invoices.js";
import payments from "./db/schema/finance/payments.js";
import clientLedger from "./db/schema/clients/clientLedger.js";
import { eq, and } from "drizzle-orm";

async function main() {
  const invoiceId = "d402a5c8-8652-4149-ba80-1c64a0296c6c";
  const clientId = "6ca054c5-1811-46cf-890f-42a28d1267e2";
  const amount = 1180;
  const paymentMethod = "Razorpay (Online)";
  const razorpayPaymentId = "pay_test123456";
  const razorpayOrderId = "order_test123456";
  const hearingNotes = undefined;

  const invoiceRecord = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      clientId ? eq(invoices.clientId, clientId) : undefined
    ),
    with: {
      payments: true,
    },
  });

  if (!invoiceRecord) {
    console.error("Invoice not found");
    return;
  }

  const totalNum = Number(invoiceRecord.total) || 0;
  const existingPaid = (invoiceRecord.payments || []).reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );
  const remainingDue = Math.max(0, totalNum - existingPaid);
  console.log({ totalNum, existingPaid, remainingDue });

  let payAmount = remainingDue;
  if (amount && Number(amount) > 0) {
    payAmount = Math.min(Number(amount), remainingDue);
  }

  const isPartPayment = payAmount < remainingDue - 0.01;
  const verifiedPaymentMethod = razorpayPaymentId
    ? `Razorpay (Online) - Ref: ${razorpayPaymentId}`
    : "Razorpay (Online)";

  console.log("Attempting insert payments...");
  try {
    const [newPayment] = await db
      .insert(payments)
      .values({
        invoiceId: invoiceRecord.id,
        amount: String(payAmount),
        paymentMethod: verifiedPaymentMethod,
      })
      .returning();
    console.log("Payment inserted:", newPayment);

    console.log("Attempting insert clientLedger...");
    if (invoiceRecord.clientId && invoiceRecord.tenantId) {
      const ledgerRes = await db.insert(clientLedger).values({
        tenantId: invoiceRecord.tenantId,
        clientId: invoiceRecord.clientId,
        caseId: invoiceRecord.caseId,
        invoiceId: invoiceRecord.id,
        paymentId: newPayment?.id,
        debit: "0",
        credit: String(payAmount),
        description: isPartPayment
          ? `Part Payment via ${verifiedPaymentMethod} for ${invoiceRecord.invoiceNo}${
              hearingNotes ? ` (${hearingNotes})` : ""
            }`
          : `Settlement Payment via ${verifiedPaymentMethod} for ${invoiceRecord.invoiceNo}`,
        transactionDate: new Date(),
      }).returning();
      console.log("Ledger inserted:", ledgerRes);
    }

    console.log("Attempting update invoice status...");
    const newTotalPaid = existingPaid + payAmount;
    const newStatus = newTotalPaid >= totalNum - 0.01 ? "paid" : "partially_paid";
    await db
      .update(invoices)
      .set({
        status: newStatus,
      })
      .where(eq(invoices.id, invoiceId));
    console.log("Invoice updated to:", newStatus);
  } catch (err) {
    console.error("EXACT ERROR IN PAY INVOICE:", err);
  }
  process.exit(0);
}

main().catch(err => {
  console.error("Main error:", err);
  process.exit(1);
});
