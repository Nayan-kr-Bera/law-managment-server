import { Request, Response, NextFunction } from "express";
import db from "../../db/index.js";
import { and, desc, eq } from "drizzle-orm";
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
  // GET ALL INVOICES FOR TENANT
  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const invList = await db.query.invoices.findMany({
        where: eq(invoices.tenantId, tenantId),
        with: {
          client: true,
          case: {
            columns: { id: true, caseNumber: true, title: true },
          },
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

      const updateData: Record<string, any> = {
        total: String(finalTotal),
      };
      if (invoiceNo) updateData.invoiceNo = invoiceNo;
      if (clientId !== undefined) updateData.clientId = clientId || null;
      if (caseId !== undefined) updateData.caseId = caseId || null;
      if (status) updateData.status = status;

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

      // Update client ledger debit if exists
      if (inv.clientId) {
        await db
          .update(clientLedger)
          .set({
            debit: String(finalTotal),
            description: `Invoice updated: ${updatedInvoice.invoiceNo}`,
          })
          .where(and(eq(clientLedger.invoiceId, id), eq(clientLedger.tenantId, tenantId)));
      }

      return res.status(200).json(
        ResponseHandler(200, "Invoice updated successfully", updatedInvoice),
      );
    } catch (error) {
      console.error("Update invoice error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // DELETE INVOICE
  async deleteInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;

      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)),
      });

      if (!inv) {
        return next(CustomErrorHandler.notFound("Invoice not found"));
      }

      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await db.delete(payments).where(eq(payments.invoiceId, id));
      await db.delete(clientLedger).where(eq(clientLedger.invoiceId, id));
      await db.delete(invoices).where(eq(invoices.id, id));

      return res.status(200).json(
        ResponseHandler(200, "Invoice deleted successfully", null),
      );
    } catch (error) {
      console.error("Delete invoice error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET ALL RECEIPTS / PAYMENTS
  async getReceipts(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context missing"));
      }

      const allPayments = await db.query.payments.findMany({
        with: {
          invoice: {
            with: {
              client: true,
              case: true,
            },
          },
        },
        orderBy: [desc(payments.paidAt)],
      });

      const tenantPayments = allPayments.filter(
        (p) => p.invoice?.tenantId === tenantId,
      );

      const receipts = tenantPayments.map((p, idx) => {
        const isPaid =
          p.invoice?.status === "paid" ||
          p.paymentMethod?.toLowerCase().includes("online") ||
          p.paymentMethod?.toLowerCase().includes("razorpay");
        const isOnline =
          p.paymentMethod?.toLowerCase().includes("online") ||
          p.paymentMethod?.toLowerCase().includes("razorpay");
        const isTDS =
          p.paymentMethod?.toLowerCase().includes("tds") || false;

        return {
          id: p.id,
          invoiceId: p.invoiceId,
          invoiceNo: p.invoice?.invoiceNo || "",
          no: `RCPT/${String(idx + 1).padStart(3, "0")}`,
          date: p.paidAt ? new Date(p.paidAt).toISOString().split("T")[0] : "",
          amount: Number(p.amount) || 0,
          mode: p.paymentMethod || "Bank Transfer",
          paymentMode: p.paymentMethod || "Bank Transfer",
          type: isTDS ? "TDS" : "Receipt",
          description: p.paymentMethod ? (isTDS ? "TDS Deducted at Source" : `Payment via ${p.paymentMethod}`) : "Payment Received",
          clientName: p.invoice?.client?.companyName || `${p.invoice?.client?.firstName || ""} ${p.invoice?.client?.lastName || ""}`.trim() || "Client",
          caseNo: p.invoice?.case?.caseNumber || "",
          status: p.invoice?.status || "paid",
          isPaid,
          isOnline,
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
      const { amount, mode } = req.body;

      const existing = await db.query.payments.findFirst({
        where: eq(payments.id, id),
        with: {
          invoice: true,
        },
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Payment receipt not found"));
      }

      // If once generated billed paid from customer site / online or invoice is settled, it cannot be edited
      const isOnlineOrPaid =
        existing.invoice?.status === "paid" ||
        existing.paymentMethod?.toLowerCase().includes("online") ||
        existing.paymentMethod?.toLowerCase().includes("razorpay");

      if (isOnlineOrPaid) {
        return next(
          CustomErrorHandler.badRequest(
            "This receipt has been paid/completed from the customer portal and cannot be edited.",
          ),
        );
      }

      const [updated] = await db
        .update(payments)
        .set({
          amount: amount ? String(amount) : undefined,
          paymentMethod: mode || undefined,
        })
        .where(eq(payments.id, id))
        .returning();

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
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Payment receipt not found"));
      }

      await db.delete(payments).where(eq(payments.id, id));

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
