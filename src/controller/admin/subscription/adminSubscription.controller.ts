import { and, desc, eq, ilike, or, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  subscriptionPaymentHistory,
  subscriptionPlans,
  tenantSubscriptions,
  tenants,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";

const adminSubscriptionController = {
  // =========================================================================
  // GET ALL TENANT SUBSCRIPTIONS
  // =========================================================================
  async getAllSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search } = req.query as {
        status?: string;
        search?: string;
      };

      const conditions: SQL[] = [];
      if (status && status !== "all") {
        conditions.push(eq(tenantSubscriptions.status, status as typeof tenantSubscriptions.$inferSelect.status));
      }

      const allSubs = await db.query.tenantSubscriptions.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          tenant: true,
          plan: true,
        },
        orderBy: (s, { desc }) => [desc(s.createdAt)],
      });

      let filteredSubs = allSubs;
      if (search && search.trim() !== "") {
        const queryTerm = search.trim().toLowerCase();
        filteredSubs = allSubs.filter(
          (s) =>
            s.tenant?.name?.toLowerCase().includes(queryTerm) ||
            s.plan?.name?.toLowerCase().includes(queryTerm)
        );
      }

      const formattedSubs = filteredSubs.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        tenantName: s.tenant?.name || "Law Firm",
        planId: s.planId,
        planName: s.plan?.name || "Standard",
        status: s.status,
        billingCycle: s.billingCycle || "monthly",
        amount: Number(s.amount || (s.billingCycle === "annual" ? s.plan?.annualPrice : s.plan?.monthlyPrice) || 0),
        currency: s.currency || s.plan?.currency || "INR",
        startDate: s.startDate ? new Date(s.startDate).toISOString() : new Date().toISOString(),
        endDate: s.nextBillingDate ? new Date(s.nextBillingDate).toISOString() : new Date().toISOString(),
        autoRenew: s.autoRenew ?? true,
        paymentMethod: s.paymentMethodBrand ? `${s.paymentMethodBrand} •••• ${s.paymentMethodLast4 || ""}` : "Razorpay / Online",
        lastPaymentDate: s.startDate ? new Date(s.startDate).toISOString() : undefined,
        nextBillingDate: s.nextBillingDate ? new Date(s.nextBillingDate).toISOString() : undefined,
      }));

      return res.status(200).json(
        ResponseHandler(200, "Subscriptions fetched successfully", formattedSubs)
      );
    } catch (error) {
      console.error("Admin get all subscriptions error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET PAYMENT TRANSACTIONS
  // =========================================================================
  async getPaymentTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const payments = await db.query.subscriptionPaymentHistory.findMany({
        with: {
          tenant: true,
          plan: true,
        },
        orderBy: [desc(subscriptionPaymentHistory.transactionDate)],
        limit: 100,
      });

      const formattedPayments = payments.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        tenantName: p.tenant?.name || "Law Firm",
        amount: Number(p.amount || 0),
        currency: p.currency || "INR",
        status: p.status === "paid" ? "success" : p.status,
        orderId: p.invoiceNumber || `INV-${p.id.substring(0, 8)}`,
        paymentId: p.invoiceNumber || `PAY-${p.id.substring(0, 8)}`,
        createdAt: p.transactionDate
          ? new Date(p.transactionDate).toISOString()
          : new Date().toISOString(),
        planName: p.planName || p.plan?.name || "Subscription Plan",
      }));

      return res.status(200).json(
        ResponseHandler(200, "Payment transactions fetched successfully", formattedPayments)
      );
    } catch (error) {
      console.error("Admin get payment transactions error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // ASSIGN / CHANGE TENANT PLAN
  // =========================================================================
  async assignTenantPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.params;
      const { planId, billingCycle } = req.body;

      if (!tenantId || !planId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID and Plan ID are required")
        );
      }

      const plan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, planId),
      });

      if (!plan) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      const existingSub = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
      });

      const startDate = new Date();
      const cycle: "monthly" | "annual" = billingCycle === "annual" ? "annual" : "monthly";
      const durationDays = cycle === "annual" ? 365 : 30;
      const nextBilling = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const planAmount = cycle === "annual" ? String(plan.annualPrice || 0) : String(plan.monthlyPrice || 0);

      if (existingSub) {
        await db
          .update(tenantSubscriptions)
          .set({
            planId: plan.id,
            status: "active",
            billingCycle: cycle,
            amount: planAmount,
            startDate: startDate.toISOString().split("T")[0],
            nextBillingDate: nextBilling.toISOString().split("T")[0],
            pendingPlanId: null,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.id, existingSub.id));
      } else {
        await db.insert(tenantSubscriptions).values({
          tenantId,
          planId: plan.id,
          status: "active",
          billingCycle: cycle,
          amount: planAmount,
          currency: plan.currency || "INR",
          startDate: startDate.toISOString().split("T")[0],
          nextBillingDate: nextBilling.toISOString().split("T")[0],
          autoRenew: true,
        });
      }

      return res.status(200).json(
        ResponseHandler(200, "Tenant subscription plan updated successfully")
      );
    } catch (error) {
      console.error("Admin assign plan error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // CANCEL TENANT SUBSCRIPTION
  // =========================================================================
  async cancelTenantSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.params;

      const sub = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
      });

      if (!sub) {
        return next(CustomErrorHandler.notFound("Subscription not found"));
      }

      await db
        .update(tenantSubscriptions)
        .set({
          status: "canceled",
          autoRenew: false,
          updatedAt: new Date(),
        })
        .where(eq(tenantSubscriptions.id, sub.id));

      return res.status(200).json(
        ResponseHandler(200, "Tenant subscription canceled successfully")
      );
    } catch (error) {
      console.error("Admin cancel subscription error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminSubscriptionController;
