import { Router } from "express";

import tenantSubscriptionController from "../controller/subscription/tenantSubscription.controller.js";
import auth from "../middleware/auth.js";

const router = Router();

// CURRENT SUBSCRIPTION

router.get("/", auth,tenantSubscriptionController.getSubscription);

// SUBSCRIPTION STATUS

router.get(
  "/:tenantId/status",
  tenantSubscriptionController.getSubscriptionStatus,
);

// INITIAL SUBSCRIPTION PAYMENT

router.post(
  "/:tenantId/payment-order",
  tenantSubscriptionController.createPaymentOrder,
);

router.post(
  "/:tenantId/verify-payment",
  tenantSubscriptionController.verifyPayment,
);

// CHANGE PLAN PREVIEW & PRORATION
router.post(
  "/:tenantId/preview-transition",
  tenantSubscriptionController.previewTransition,
);

// CHANGE PLAN
// Upgrade / Downgrade
// Effective NEXT billing cycle

router.post("/:tenantId/change-plan", tenantSubscriptionController.changePlan);

// CANCEL SCHEDULED PLAN CHANGE

router.delete(
  "/:tenantId/pending-plan",
  tenantSubscriptionController.cancelPendingPlan,
);

// AUTO RENEW

router.patch(
  "/:tenantId/auto-renew",
  tenantSubscriptionController.updateAutoRenew,
);

// REACTIVATE

router.post(
  "/:tenantId/reactivate",
  tenantSubscriptionController.reactivateSubscription,
);

export default router;
