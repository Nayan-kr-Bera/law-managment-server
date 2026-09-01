import { Router } from "express";
import subscriptionPaymentController from "../controller/subscription/subscriptionPayment.controller.js";


const router = Router();

router.get(
  "/:tenantId",
  subscriptionPaymentController.getPayments,
);

router.get(
  "/:tenantId/:id",
  subscriptionPaymentController.getPaymentById,
);

export default router;