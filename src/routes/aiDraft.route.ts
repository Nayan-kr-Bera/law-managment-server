import { Router } from "express";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";
import aiDraftGuard from "../middleware/aiDraftGuard.js";
import aiDraftController from "../controller/ai/aiDraft.controller.js";

const router = Router();

// 1. Get Quota & Credit Packs
router.get(
  "/quota",
  auth,
  officeGuard,
  permissionGuard("ai_drafter.use"),
  aiDraftController.getQuota,
);

// 2. Generate Legal Draft (Guarded by Subscription & Quota)
router.post(
  "/draft",
  auth,
  officeGuard,
  permissionGuard("ai_drafter.use"),
  aiDraftGuard,
  aiDraftController.generateDraft,
);

// 3. Purchase Add-on Credits: Create Razorpay Order
router.post(
  "/purchase-credits/create-order",
  auth,
  officeGuard,
  permissionGuard("ai_drafter.use"),
  aiDraftController.createCreditOrder,
);

// 4. Purchase Add-on Credits: Verify Payment
router.post(
  "/purchase-credits/verify",
  auth,
  officeGuard,
  permissionGuard("ai_drafter.use"),
  aiDraftController.verifyCreditPayment,
);

// 5. Get Past Drafts History
router.get(
  "/history",
  auth,
  officeGuard,
  permissionGuard("ai_drafter.use"),
  aiDraftController.getDraftHistory,
);

export default router;
