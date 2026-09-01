import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";

import {
  subscriptionPlans,
  subscriptionPaymentHistory,
  tenantSubscriptions,
  tenants,
} from "../../db/schema/index.js";

import razorpayService from "../../services/razorpay.service.js";

import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const tenantSubscriptionController = {
  // GET CURRENT SUBSCRIPTION

  async getSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      // GET TENANT ID FROM AUTHENTICATED USER

      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      // CHECK TENANT EXISTS

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });

      if (!tenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      // GET CURRENT TENANT SUBSCRIPTION

      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
        with: {
          plan: true,
          pendingPlan: true,
        },
      });

      // NO SUBSCRIPTION

      if (!subscription) {
        return res
          .status(200)
          .send(
            ResponseHandler(
              200,
              "Tenant does not have an active subscription",
              null,
            ),
          );
      }

      // SUCCESS

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Tenant subscription fetched successfully",
            subscription,
          ),
        );
    } catch (error) {
      console.error("GET SUBSCRIPTION ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // GET SUBSCRIPTION STATUS

  async getSubscriptionStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId: paramTenantId } = req.params;

      const tenantId =
        req.user?.tenantId !== undefined
          ? String(req.user.tenantId)
          : paramTenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
        with: {
          plan: true,
          pendingPlan: true,
        },
      });

      if (!subscription) {
        return next(
          CustomErrorHandler.notFound("Tenant subscription not found"),
        );
      }

      return res.status(200).send(
        ResponseHandler(200, "Subscription status fetched successfully", {
          status: subscription.status,

          autoRenew: subscription.autoRenew,

          currentPlan: subscription.plan,

          billingCycle: subscription.billingCycle,

          amount: subscription.amount,

          startDate: subscription.startDate,

          nextBillingDate: subscription.nextBillingDate,

          pendingChange: subscription.pendingPlan
            ? {
                plan: subscription.pendingPlan,

                billingCycle: subscription.pendingBillingCycle,

                effectiveAt: subscription.nextBillingDate,
              }
            : null,
        }),
      );
    } catch (error) {
      console.error("GET SUBSCRIPTION STATUS ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE PAYMENT ORDER

  async createPaymentOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId: paramTenantId } = req.params;

      const tenantId =
        req.user?.tenantId !== undefined
          ? String(req.user.tenantId)
          : paramTenantId;

      const { planId, billingCycle = "annual" } = req.body;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      if (!planId) {
        return next(CustomErrorHandler.badRequest("Plan id is required"));
      }

      if (billingCycle !== "monthly" && billingCycle !== "annual") {
        return next(CustomErrorHandler.badRequest("Invalid billing cycle"));
      }

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });

      if (!tenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      const plan = await db.query.subscriptionPlans.findFirst({
        where: and(
          eq(subscriptionPlans.id, String(planId)),
          eq(subscriptionPlans.isActive, true),
        ),
      });

      if (!plan) {
        return next(
          CustomErrorHandler.notFound("Active subscription plan not found"),
        );
      }

      const existingSubscription = await db.query.tenantSubscriptions.findFirst(
        {
          where: eq(tenantSubscriptions.tenantId, tenantId),
        },
      );

      if (existingSubscription) {
        return next(
          CustomErrorHandler.badRequest(
            "Tenant already has a subscription. Use change-plan for an existing subscription.",
          ),
        );
      }

      const amount =
        billingCycle === "annual"
          ? Number(plan.annualPrice)
          : Number(plan.monthlyPrice);

      if (!Number.isFinite(amount) || amount <= 0) {
        return next(
          CustomErrorHandler.badRequest("Invalid subscription amount"),
        );
      }

      const amountInPaise = Math.round(amount * 100);

      const receipt = `sub_${tenantId.slice(0, 8)}_${Date.now()}`;

      const order = await razorpayService.createOrder({
        amount: amountInPaise,

        currency: plan.currency || "INR",

        receipt,

        notes: {
          tenantId,
          planId: String(planId),
          billingCycle,
        },
      });

      return res.status(201).send(
        ResponseHandler(201, "Payment order created successfully", {
          orderId: order.id,

          amount: order.amount,

          currency: order.currency,

          receipt: order.receipt,

          keyId: process.env.RAZORPAY_KEY_ID,

          plan: {
            id: plan.id,
            name: plan.name,
            monthlyPrice: plan.monthlyPrice,
            annualPrice: plan.annualPrice,
          },

          billingCycle,
        }),
      );
    } catch (error) {
      console.error("CREATE PAYMENT ORDER ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // VERIFY INITIAL PAYMENT

  async verifyPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return next(
          CustomErrorHandler.badRequest(
            "Razorpay payment details are required",
          ),
        );
      }

      const isValid = razorpayService.verifyPayment({
        razorpayOrderId: razorpay_order_id,

        razorpayPaymentId: razorpay_payment_id,

        razorpaySignature: razorpay_signature,
      });

      if (!isValid) {
        return next(
          CustomErrorHandler.badRequest("Invalid Razorpay payment signature"),
        );
      }

      const payment = await razorpayService.getPayment(razorpay_payment_id);

      if (payment.order_id && payment.order_id !== razorpay_order_id) {
        return next(
          CustomErrorHandler.badRequest(
            "Payment does not belong to this order",
          ),
        );
      }

      if (payment.status !== "captured") {
        return next(
          CustomErrorHandler.badRequest(
            `Payment is not captured. Current status: ${payment.status}`,
          ),
        );
      }

      const order = await razorpayService.getOrder(razorpay_order_id);

      const tenantId = order.notes?.tenantId;

      const planId = order.notes?.planId;

      const billingCycle = order.notes?.billingCycle;

      if (!tenantId || !planId || !billingCycle) {
        return next(
          CustomErrorHandler.badRequest("Invalid subscription order"),
        );
      }

      if (billingCycle !== "monthly" && billingCycle !== "annual") {
        return next(CustomErrorHandler.badRequest("Invalid billing cycle"));
      }

      if (
        req.user?.tenantId !== undefined &&
        String(req.user.tenantId) !== String(tenantId)
      ) {
        return next(
          CustomErrorHandler.forbidden("You cannot verify this payment"),
        );
      }

      const plan = await db.query.subscriptionPlans.findFirst({
        where: and(
          eq(subscriptionPlans.id, String(planId)),
          eq(subscriptionPlans.isActive, true),
        ),
      });

      if (!plan) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      const expectedAmount =
        billingCycle === "annual"
          ? Number(plan.annualPrice)
          : Number(plan.monthlyPrice);

      const expectedAmountInPaise = Math.round(expectedAmount * 100);

      if (Number(order.amount) !== expectedAmountInPaise) {
        return next(
          CustomErrorHandler.badRequest(
            "Payment amount does not match subscription plan",
          ),
        );
      }

      if (Number(payment.amount) !== expectedAmountInPaise) {
        return next(CustomErrorHandler.badRequest("Payment amount is invalid"));
      }

      const existingSubscription = await db.query.tenantSubscriptions.findFirst(
        {
          where: eq(tenantSubscriptions.tenantId, String(tenantId)),
        },
      );

      if (existingSubscription) {
        return next(
          CustomErrorHandler.badRequest("Tenant already has a subscription"),
        );
      }

      const today = new Date();

      const nextBillingDate = new Date(today);

      if (billingCycle === "annual") {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      } else {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }

      const amount =
        billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;

      const result = await db.transaction(async (tx) => {
        const [subscription] = await tx
          .insert(tenantSubscriptions)
          .values({
            tenantId: String(tenantId),

            planId: String(planId),

            status: "active",

            billingCycle,

            amount,

            currency: plan.currency,

            startDate: today.toISOString().split("T")[0],

            nextBillingDate: nextBillingDate.toISOString().split("T")[0],

            autoRenew: true,

            paymentMethodBrand: payment.method,

            paymentMethodLast4: payment.card?.last4 || null,
          })
          .returning();

        const invoiceNumber = `INV-${Date.now()}`;

        const [paymentHistory] = await tx
          .insert(subscriptionPaymentHistory)
          .values({
            tenantId: String(tenantId),

            invoiceNumber,

            planId: String(planId),

            planName: plan.name,

            amount,

            currency: plan.currency,

            status: "paid",

            billingCycle,

            paymentMethod: payment.method,

            transactionDate: new Date(),

            createdAt: new Date(),
          })
          .returning();

        return {
          subscription,
          paymentHistory,
        };
      });

      return res.status(200).send(
        ResponseHandler(
          200,
          "Payment verified and subscription activated successfully",
          {
            subscription: result.subscription,

            payment: result.paymentHistory,

            razorpay: {
              orderId: razorpay_order_id,

              paymentId: razorpay_payment_id,
            },
          },
        ),
      );
    } catch (error) {
      console.error("VERIFY PAYMENT ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // CHANGE PLAN
  //
  // IMPORTANT:
  // No payment happens here.
  //
  // The new plan becomes active on the
  // next billing cycle.
  //

  async changePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId: paramTenantId } = req.params;

      const tenantId =
        req.user?.tenantId !== undefined
          ? String(req.user.tenantId)
          : paramTenantId;

      const { planId, billingCycle } = req.body;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      if (!planId) {
        return next(CustomErrorHandler.badRequest("Plan id is required"));
      }

      if (billingCycle !== "monthly" && billingCycle !== "annual") {
        return next(
          CustomErrorHandler.badRequest(
            "Billing cycle must be monthly or annual",
          ),
        );
      }

      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
        with: {
          plan: true,
        },
      });

      if (!subscription) {
        return next(
          CustomErrorHandler.notFound("Tenant subscription not found"),
        );
      }

      if (subscription.status !== "active") {
        return next(
          CustomErrorHandler.badRequest(
            "Only active subscriptions can change plans",
          ),
        );
      }

      const newPlan = await db.query.subscriptionPlans.findFirst({
        where: and(
          eq(subscriptionPlans.id, String(planId)),
          eq(subscriptionPlans.isActive, true),
        ),
      });

      if (!newPlan) {
        return next(
          CustomErrorHandler.notFound("Active subscription plan not found"),
        );
      }

      if (
        String(subscription.planId) === String(newPlan.id) &&
        subscription.billingCycle === billingCycle
      ) {
        return next(
          CustomErrorHandler.badRequest(
            "You are already subscribed to this plan and billing cycle",
          ),
        );
      }

      const [updatedSubscription] = await db
        .update(tenantSubscriptions)
        .set({
          pendingPlanId: String(newPlan.id),

          pendingBillingCycle: billingCycle,

          updatedAt: new Date(),
        })
        .where(eq(tenantSubscriptions.tenantId, tenantId))
        .returning();

      return res.status(200).send(
        ResponseHandler(200, "Plan change scheduled for next billing cycle", {
          currentPlan: subscription.plan,

          currentBillingCycle: subscription.billingCycle,

          pendingPlan: newPlan,

          pendingBillingCycle: billingCycle,

          effectiveAt: subscription.nextBillingDate,

          subscription: updatedSubscription,
        }),
      );
    } catch (error) {
      console.error("CHANGE PLAN ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // CANCEL PENDING PLAN CHANGE

  async cancelPendingPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId: paramTenantId } = req.params;

      const tenantId =
        req.user?.tenantId !== undefined
          ? String(req.user.tenantId)
          : paramTenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
      });

      if (!subscription) {
        return next(
          CustomErrorHandler.notFound("Tenant subscription not found"),
        );
      }

      if (!subscription.pendingPlanId) {
        return next(
          CustomErrorHandler.badRequest("No pending plan change found"),
        );
      }

      const [updatedSubscription] = await db
        .update(tenantSubscriptions)
        .set({
          pendingPlanId: null,

          pendingBillingCycle: null,

          updatedAt: new Date(),
        })
        .where(eq(tenantSubscriptions.tenantId, tenantId))
        .returning();

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Pending plan change cancelled successfully",
            updatedSubscription,
          ),
        );
    } catch (error) {
      console.error("CANCEL PENDING PLAN ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // UPDATE AUTO RENEW

  async updateAutoRenew(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId: paramTenantId } = req.params;

      const tenantId =
        req.user?.tenantId !== undefined
          ? String(req.user.tenantId)
          : paramTenantId;

      const { autoRenew } = req.body;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      if (typeof autoRenew !== "boolean") {
        return next(
          CustomErrorHandler.badRequest("autoRenew must be a boolean"),
        );
      }

      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
      });

      if (!subscription) {
        return next(
          CustomErrorHandler.notFound("Tenant subscription not found"),
        );
      }

      const [updatedSubscription] = await db
        .update(tenantSubscriptions)
        .set({
          autoRenew,

          updatedAt: new Date(),
        })
        .where(eq(tenantSubscriptions.tenantId, tenantId))
        .returning();

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            autoRenew
              ? "Auto-renew enabled successfully"
              : "Auto-renew disabled successfully",
            updatedSubscription,
          ),
        );
    } catch (error) {
      console.error("UPDATE AUTO RENEW ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // REACTIVATE SUBSCRIPTION

  async reactivateSubscription(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { tenantId: paramTenantId } = req.params;

      const tenantId =
        req.user?.tenantId !== undefined
          ? String(req.user.tenantId)
          : paramTenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      const subscription = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenantId),
      });

      if (!subscription) {
        return next(
          CustomErrorHandler.notFound("Tenant subscription not found"),
        );
      }

      if (subscription.status === "active") {
        return next(
          CustomErrorHandler.badRequest("Subscription is already active"),
        );
      }

      return res.status(200).send(
        ResponseHandler(
          200,
          "Please create a new payment to reactivate the subscription",
          {
            tenantId,
            requiresPayment: true,
            nextStep: "Create a new payment order",
          },
        ),
      );
    } catch (error) {
      console.error("REACTIVATE SUBSCRIPTION ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
};

export default tenantSubscriptionController;
