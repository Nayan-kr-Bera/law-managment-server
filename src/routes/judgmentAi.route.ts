import { Router } from "express";
import auth from "../middleware/auth.js";
import judgmentCreditGuard from "../middleware/judgmentCreditGuard.js";
import judgmentAiController from "../controller/ai/judgmentAi.controller.js";

const router = Router();

// 1. Get Quota & Remaining Credits
router.get(
  "/quota",
  auth,
  judgmentAiController.getQuota,
);

// 2. Get Landmark Judgments from Library
router.get(
  "/judgments",
  auth,
  judgmentAiController.getJudgments,
);

// 2b. Fast Neutral Citation & Cross-Reference Lookup (Zero heavy load)
router.get(
  "/lookup",
  auth,
  judgmentAiController.lookupCitation,
);

// 3. Stream Judgment Briefing or Q&A (Credit Guarded: 15 Credits per Report)
router.post(
  "/chat",
  auth,
  judgmentCreditGuard,
  judgmentAiController.streamChat,
);

// 4. Get Available Judgment Credit Packs & Pricing (₹1.15 / credit)
router.get(
  "/credit-packs",
  auth,
  judgmentAiController.getCreditPacks,
);

// 5. Create Razorpay Payment Order for Judgment Credits
router.post(
  "/create-credit-order",
  auth,
  judgmentAiController.createCreditOrder,
);

// 6. Verify Razorpay Payment for Judgment Credits
router.post(
  "/verify-credit-payment",
  auth,
  judgmentAiController.verifyCreditPayment,
);

export default router;
