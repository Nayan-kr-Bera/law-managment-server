import { Request, Response, NextFunction } from "express";
import db from "../../db/index.js";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import invoices from "../../db/schema/finance/invoices.js";
import invoiceItems from "../../db/schema/finance/invoiceItems.js";
import payments from "../../db/schema/finance/payments.js";
import clientLedger from "../../db/schema/clients/clientLedger.js";
import clients from "../../db/schema/clients/clients.js";
import cases from "../../db/schema/caseMangment/cases.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

interface InvoiceLineItemInput {
  description?: string;
  amount?: number | string;
  price?: number | string;
  quantity?: number;
}

export const invoicesController = {
  // GET ALL INVOICES FOR TENANT (Filtered by active office)
  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = (req.headers["x-office-id"] as string) || (req.query.officeId as string) || undefined;
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const whereConditions = [eq(invoices.tenantId, tenantId)];
      if (officeId) {
        whereConditions.push(eq(invoices.officeId, officeId));
      }

      const invList = await db.query.invoices.findMany({
        where: and(...whereConditions),
        with: {
          client: true,
          case: {
            columns: { id: true, caseNumber: true, title: true },
          },
          office: true,
          tenant: true,
          items: true,
          payments: true,
        },
        orderBy: [desc(invoices.createdAt)],
      });

      const formatted = invList.map((inv) => {
        const total = Number(inv.total) || 0;
        const totalPaid = (inv.payments || []).reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0,
        );
        const balance = Math.max(0, total - totalPaid);

        return {
          id: inv.id,
          type: "Invoice",
          invoiceNo: inv.invoiceNo,
          date: inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "",
          createdAt: inv.createdAt,
          description: inv.items?.[0]?.description || "Legal Services",
          prefix: "INV",
          tenantId: inv.tenantId,
          tenantName: inv.tenant?.name || "Advocate Legal Chambers",
          tenantGst: inv.tenant?.gst || "",
          tenantEmail: inv.tenant?.organisationEmail || "",
          tenantPhone: inv.tenant?.organisationPhone || "",
          officeId: inv.officeId,
          officeName: inv.office?.name || "Main Chamber Office",
          officeAddress: [inv.office?.address, inv.office?.city, inv.office?.state, inv.office?.postalCode].filter(Boolean).join(", "),
          officePhone: inv.office?.phone || inv.tenant?.organisationPhone || "",
          officeEmail: inv.office?.email || inv.tenant?.organisationEmail || "",
          clientId: inv.clientId,
          clientName: inv.client?.companyName || `${inv.client?.firstName || ""} ${inv.client?.lastName || ""}`.trim() || "Client",
          clientContact: inv.client?.phone || "",
          clientAddress: [inv.client?.address, inv.client?.city, inv.client?.state].filter(Boolean).join(", "),
          clientEmail: inv.client?.email || "",
          clientPan: "",
          caseId: inv.caseId,
          caseNo: inv.case?.caseNumber || "",
          caseTitle: inv.case?.title || "",
          lineItems: (inv.items || []).map((item) => ({
            id: item.id,
            description: item.description,
            amount: Number(item.price) * (item.quantity || 1),
            quantity: item.quantity,
            price: Number(item.price),
            isGstApplicable: !item.description?.toLowerCase().includes("non-gst"),
          })),
          discountMode: "flat",
          discountValue: 0,
          applyTDS: false,
          tdsRate: 0,
          adjustment: 0,
          subtotal: total,
          total,
          balance,
          totalPaid,
          status: inv.status,
          payments: inv.payments || [],
        };
      });

      return res.status(200).json(
        ResponseHandler(200, "Invoices retrieved successfully", formatted),
      );
    } catch (error) {
      console.error("Get invoices error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE INVOICE
  async createInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = (req.user as unknown as { officeId?: string })?.officeId || (req.headers["x-office-id"] as string) || null;
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const {
        invoiceNo,
        clientId,
        caseId,
        lineItems,
        total,
        status = "sent",
      } = req.body;

      const autoInvoiceNo =
        invoiceNo || `INV/${Date.now().toString().slice(-4)}/${new Date().getFullYear()}`;

      const typedLineItems = Array.isArray(lineItems) ? (lineItems as InvoiceLineItemInput[]) : [];

      const finalTotal =
        total ??
        typedLineItems.reduce((acc: number, item: InvoiceLineItemInput) => acc + (Number(item.amount) || 0), 0);

      const [newInvoice] = await db
        .insert(invoices)
        .values({
          tenantId,
          officeId: officeId || null,
          clientId: clientId || null,
          caseId: caseId || null,
          invoiceNo: autoInvoiceNo,
          total: String(finalTotal),
          status: status || "draft",
        })
        .returning();

      if (typedLineItems.length > 0) {
        const itemRows = typedLineItems.map((item: InvoiceLineItemInput) => ({
          invoiceId: newInvoice.id,
          description: item.description || "Legal Services",
          quantity: item.quantity || 1,
          price: String(item.amount ?? item.price ?? 0),
        }));
        await db.insert(invoiceItems).values(itemRows);
      }

      // Record in client ledger if clientId is provided
      if (clientId) {
        await db.insert(clientLedger).values({
          tenantId,
          clientId,
          caseId: caseId || undefined,
          invoiceId: newInvoice.id,
          debit: String(finalTotal),
          credit: "0",
          description: `Invoice generated: ${autoInvoiceNo}`,
          transactionDate: new Date(),
        });
      }

      return res.status(201).json(
        ResponseHandler(201, "Invoice created successfully", newInvoice),
      );
    } catch (error) {
      console.error("Create invoice error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET INVOICE BY ID
  async getInvoiceById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;

      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)),
        with: {
          client: true,
          case: true,
          office: true,
          tenant: true,
          items: true,
          payments: true,
        },
      });

      if (!inv) {
        return next(CustomErrorHandler.notFound("Invoice not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Invoice retrieved successfully", inv),
      );
    } catch (error) {
      console.error("Get invoice by id error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // UPDATE INVOICE
  async updateInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)),
        with: { items: true },
      });

      if (!inv) {
        return next(CustomErrorHandler.notFound("Invoice not found"));
      }

      const {
        invoiceNo,
        clientId,
        caseId,
        lineItems,
        total,
        status,
      } = req.body;

      const typedLineItems = Array.isArray(lineItems) ? (lineItems as InvoiceLineItemInput[]) : null;

      const finalTotal =
        total !== undefined
          ? Number(total)
          : typedLineItems
          ? typedLineItems.reduce((acc: number, item: InvoiceLineItemInput) => acc + (Number(item.amount) || 0), 0)
          : Number(inv.total);

      const targetClientId =
        clientId !== undefined
          ? clientId && typeof clientId === "string" && clientId.trim().length > 0
            ? clientId.trim()
            : null
          : inv.clientId;

      const targetCaseId =
        caseId !== undefined
          ? caseId && typeof caseId === "string" && caseId.trim().length > 0
            ? caseId.trim()
            : null
          : inv.caseId;

      const updateData: Partial<typeof invoices.$inferInsert> = {
        total: String(finalTotal),
      };
      if (invoiceNo && typeof invoiceNo === "string" && invoiceNo.trim()) {
        updateData.invoiceNo = invoiceNo.trim();
      }
      if (clientId !== undefined) {
        updateData.clientId = targetClientId;
      }
      if (caseId !== undefined) {
        updateData.caseId = targetCaseId;
      }
      // Recalculate status based on actual payments vs updated total
      const existingPayments = await db.query.payments.findMany({
        where: eq(payments.invoiceId, id),
      });
      const totalPaid = existingPayments.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );

      if (status === "cancelled" || status === "draft") {
        updateData.status = status;
      } else if (totalPaid >= finalTotal - 0.01 && finalTotal > 0) {
        updateData.status = "paid";
      } else if (totalPaid > 0) {
        updateData.status = "partially_paid";
      } else {
        updateData.status = status && ["draft", "sent", "overdue"].includes(status) ? (status as typeof invoices.$inferSelect.status) : "sent";
      }

      const [updatedInvoice] = await db
        .update(invoices)
        .set(updateData)
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
        .returning();

      if (typedLineItems !== null) {
        await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
        if (typedLineItems.length > 0) {
          const itemRows = typedLineItems.map((item: InvoiceLineItemInput) => ({
            invoiceId: id,
            description: item.description || "Legal Services",
            quantity: item.quantity || 1,
            price: String(item.amount ?? item.price ?? 0),
          }));
          await db.insert(invoiceItems).values(itemRows);
        }
      }

      // Upsert into client ledger debit entry
      if (targetClientId) {
        const existingLedger = await db.query.clientLedger.findFirst({
          where: and(
            eq(clientLedger.invoiceId, id),
            eq(clientLedger.tenantId, tenantId),
            isNull(clientLedger.paymentId),
          ),
        });

        if (existingLedger) {
          await db
            .update(clientLedger)
            .set({
              clientId: targetClientId,
              caseId: targetCaseId || null,
              debit: String(finalTotal),
              description: `Invoice updated: ${updatedInvoice.invoiceNo}`,
            })
            .where(eq(clientLedger.id, existingLedger.id));
        } else {
          await db.insert(clientLedger).values({
            tenantId,
            clientId: targetClientId,
            caseId: targetCaseId || undefined,
            invoiceId: id,
            debit: String(finalTotal),
            credit: "0",
            description: `Invoice generated: ${updatedInvoice.invoiceNo}`,
            transactionDate: new Date(),
          });
        }
      }

      return res.status(200).json(
        ResponseHandler(200, "Invoice updated successfully", updatedInvoice),
      );
    } catch (error: unknown) {
      console.error("Update invoice error:", error);
      const message = error instanceof Error ? error.message : "Failed to update invoice";
      return next(CustomErrorHandler.serverError(message));
    }
  },

  // DELETE INVOICE
  async deleteInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)),
      });

      if (!inv) {
        return next(CustomErrorHandler.notFound("Invoice not found"));
      }

      await db.transaction(async (tx) => {
        // 1. Fetch all payment IDs linked to this invoice
        const invoicePayments = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.invoiceId, id));
        const paymentIds = invoicePayments.map((p) => p.id);

        // 2. Delete client ledger records referencing those payments
        if (paymentIds.length > 0) {
          await tx
            .delete(clientLedger)
            .where(inArray(clientLedger.paymentId, paymentIds));
        }

        // 3. Delete client ledger records referencing this invoice directly (e.g. invoice debit)
        await tx
          .delete(clientLedger)
          .where(eq(clientLedger.invoiceId, id));

        // 4. Delete payments referencing this invoice
        await tx
          .delete(payments)
          .where(eq(payments.invoiceId, id));

        // 5. Delete line items referencing this invoice
        await tx
          .delete(invoiceItems)
          .where(eq(invoiceItems.invoiceId, id));

        // 6. Delete invoice record itself
        await tx
          .delete(invoices)
          .where(eq(invoices.id, id));
      });

      return res.status(200).json(
        ResponseHandler(200, "Invoice deleted successfully", null),
      );
    } catch (error: unknown) {
      console.error("Delete invoice error:", error);
      const message = error instanceof Error ? error.message : "Failed to delete invoice";
      return next(CustomErrorHandler.serverError(message));
    }
  },

  // GET ALL RECEIPTS / PAYMENTS (Filtered by active office)
  async getReceipts(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = (req.headers["x-office-id"] as string) || (req.query.officeId as string) || undefined;
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const allPayments = await db.query.payments.findMany({
        with: {
          invoice: {
            with: {
              client: true,
              case: true,
              office: true,
              tenant: true,
              items: true,
              payments: true,
            },
          },
        },
        orderBy: [desc(payments.paidAt)],
      });

      const tenantPayments = allPayments.filter((p) => {
        if (!p.invoice || p.invoice.tenantId !== tenantId) return false;
        if (officeId) {
          return p.invoice.officeId === officeId;
        }
        return true;
      });

      const receipts = tenantPayments.map((p, idx) => {
        const isTDS =
          p.paymentMethod?.toLowerCase().includes("tds") || false;
        const isOnline =
          p.paymentMethod?.toLowerCase().includes("razorpay") || false;

        const invTotal = Number(p.invoice?.total) || 0;
        const sisterPayments = p.invoice?.payments || [];
        const totalPaidSoFar = sisterPayments.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);

        return {
          id: p.id,
          invoiceId: p.invoiceId,
          invoiceNo: p.invoice?.invoiceNo || "",
          no: `RCPT/${String(idx + 1).padStart(3, "0")}`,
          date: p.paidAt ? new Date(p.paidAt).toISOString().split("T")[0] : "",
          amount: Number(p.amount) || 0,
          totalAmount: invTotal,
          totalPaid: totalPaidSoFar,
          remainingDue: Math.max(0, invTotal - totalPaidSoFar),
          mode: p.paymentMethod || "Bank Transfer",
          paymentMode: p.paymentMethod || "Bank Transfer",
          type: isTDS ? "TDS" : "Receipt",
          description: p.paymentMethod ? (isTDS ? "TDS Deducted at Source" : `Payment via ${p.paymentMethod}`) : "Payment Received",
          clientName: p.invoice?.client?.companyName || `${p.invoice?.client?.firstName || ""} ${p.invoice?.client?.lastName || ""}`.trim() || "Client",
          clientEmail: p.invoice?.client?.email || "",
          clientPhone: p.invoice?.client?.phone || "",
          clientAddress: [p.invoice?.client?.address, p.invoice?.client?.city, p.invoice?.client?.state].filter(Boolean).join(", "),
          tenantName: p.invoice?.tenant?.name || "Advocate Legal Chambers",
          tenantGst: p.invoice?.tenant?.gst || "",
          officeName: p.invoice?.office?.name || "Main Chamber",
          officeAddress: [p.invoice?.office?.address, p.invoice?.office?.city, p.invoice?.office?.state, p.invoice?.office?.postalCode].filter(Boolean).join(", "),
          officePhone: p.invoice?.office?.phone || p.invoice?.tenant?.organisationPhone || "",
          officeEmail: p.invoice?.office?.email || p.invoice?.tenant?.organisationEmail || "",
          caseNo: p.invoice?.case?.caseNumber || "",
          caseTitle: p.invoice?.case?.title || "",
          status: p.invoice?.status || "sent",
          isPaid: p.invoice?.status === "paid",
          isOnline,
          lineItems: (p.invoice?.items || []).map((it) => ({
            id: it.id,
            description: it.description,
            amount: Number(it.price) * (it.quantity || 1),
            quantity: it.quantity,
            price: Number(it.price),
            isGstApplicable: !it.description?.toLowerCase().includes("non-gst"),
          })),
          payments: sisterPayments.map((sp, sIdx) => ({
            id: sp.id,
            receiptNo: `RCPT/${String(sIdx + 1).padStart(3, "0")}`,
            date: sp.paidAt ? new Date(sp.paidAt).toISOString().split("T")[0] : "",
            amount: Number(sp.amount) || 0,
            mode: sp.paymentMethod || "Direct",
            description: sp.paymentMethod || "Payment",
          })),
        };
      });

      return res.status(200).json(
        ResponseHandler(200, "Receipts retrieved successfully", receipts),
      );
    } catch (error) {
      console.error("Get receipts error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE PAYMENT / RECEIPT / TDS
  async createReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const { invoiceId, amount, mode = "Bank Transfer", description } = req.body;
      const tenantId = req.user?.tenantId;

      if (!invoiceId || !amount) {
        return next(CustomErrorHandler.badRequest("Invoice ID and amount are required"));
      }

      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)),
        with: { payments: true },
      });

      if (!inv) {
        return next(CustomErrorHandler.notFound("Invoice not found"));
      }

      const [newPayment] = await db
        .insert(payments)
        .values({
          invoiceId,
          amount: String(amount),
          paymentMethod: mode,
        })
        .returning();

      // Check if invoice is now settled
      const currentPaid = (inv.payments || []).reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );
      const newTotalPaid = currentPaid + Number(amount);
      if (newTotalPaid >= Number(inv.total)) {
        await db
          .update(invoices)
          .set({ status: "paid" })
          .where(eq(invoices.id, invoiceId));
      } else if (newTotalPaid > 0 && inv.status === "draft") {
        await db
          .update(invoices)
          .set({ status: "sent" })
          .where(eq(invoices.id, invoiceId));
      }

      // Record in client ledger
      if (inv.clientId) {
        await db.insert(clientLedger).values({
          tenantId,
          clientId: inv.clientId,
          caseId: inv.caseId || undefined,
          invoiceId,
          paymentId: newPayment.id,
          debit: "0",
          credit: String(amount),
          description: description || `Payment received for ${inv.invoiceNo} via ${mode}`,
          transactionDate: new Date(),
        });
      }

      return res.status(201).json(
        ResponseHandler(201, "Receipt created successfully", newPayment),
      );
    } catch (error) {
      console.error("Create receipt error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // UPDATE RECEIPT
  async updateReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount, mode, description } = req.body;

      const existing = await db.query.payments.findFirst({
        where: eq(payments.id, id),
        with: {
          invoice: {
            with: { payments: true },
          },
        },
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Payment receipt not found"));
      }

      // If processed through Razorpay online gateway, lock it permanently for financial audit compliance
      const isOnlineRazorpay = existing.paymentMethod?.toLowerCase().includes("razorpay");
      if (isOnlineRazorpay) {
        return next(
          CustomErrorHandler.badRequest(
            "This payment was processed online through Razorpay by the client. It cannot be modified to preserve transaction integrity.",
          ),
        );
      }

      const [updated] = await db
        .update(payments)
        .set({
          amount: amount !== undefined ? String(amount) : undefined,
          paymentMethod: mode || undefined,
        })
        .where(eq(payments.id, id))
        .returning();

      // Update client ledger entry if exists
      if (existing.invoice?.clientId && amount !== undefined) {
        await db
          .update(clientLedger)
          .set({
            credit: String(amount),
            description: description || (mode ? `Payment received via ${mode}` : undefined),
          })
          .where(eq(clientLedger.paymentId, id));
      }

      // Recalculate invoice status
      if (existing.invoiceId && existing.invoice) {
        const remainingPayments = await db.query.payments.findMany({
          where: eq(payments.invoiceId, existing.invoiceId),
        });
        const totalPaid = remainingPayments.reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0,
        );
        const invoiceTotal = Number(existing.invoice.total) || 0;
        const newStatus = totalPaid >= invoiceTotal ? "paid" : "sent";

        await db
          .update(invoices)
          .set({ status: newStatus })
          .where(eq(invoices.id, existing.invoiceId));
      }

      return res.status(200).json(
        ResponseHandler(200, "Receipt updated successfully", updated),
      );
    } catch (error) {
      console.error("Update receipt error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // DELETE RECEIPT
  async deleteReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await db.query.payments.findFirst({
        where: eq(payments.id, id),
        with: {
          invoice: true,
        },
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Payment receipt not found"));
      }

      // If processed through Razorpay online gateway, lock it permanently for financial audit compliance
      const isOnlineRazorpay = existing.paymentMethod?.toLowerCase().includes("razorpay");
      if (isOnlineRazorpay) {
        return next(
          CustomErrorHandler.badRequest(
            "This payment was processed online through Razorpay by the client. It cannot be deleted to protect client payment records.",
          ),
        );
      }

      const invoiceId = existing.invoiceId;
      const invoiceRecord = existing.invoice;

      // Delete associated client ledger entries first
      await db.delete(clientLedger).where(eq(clientLedger.paymentId, id));

      // Delete payment record
      await db.delete(payments).where(eq(payments.id, id));

      // Recalculate invoice status and total settled
      if (invoiceId && invoiceRecord) {
        const remainingPayments = await db.query.payments.findMany({
          where: eq(payments.invoiceId, invoiceId),
        });
        const totalPaid = remainingPayments.reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0,
        );
        const invoiceTotal = Number(invoiceRecord.total) || 0;
        const newStatus = totalPaid >= invoiceTotal && invoiceTotal > 0 ? "paid" : "sent";

        await db
          .update(invoices)
          .set({ status: newStatus })
          .where(eq(invoices.id, invoiceId));
      }

      return res.status(200).json(
        ResponseHandler(200, "Receipt deleted successfully", null),
      );
    } catch (error) {
      console.error("Delete receipt error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default invoicesController;
