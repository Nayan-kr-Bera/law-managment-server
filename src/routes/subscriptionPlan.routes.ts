import { Router } from "express";
import subscriptionPlanController from "../controller/subscription/subscriptionPlans.controller.js";

const router = Router();

router.get("/", subscriptionPlanController.getPlans);

router.get("/:id", subscriptionPlanController.getPlanById);

router.post("/", subscriptionPlanController.createPlan);

router.put("/:id", subscriptionPlanController.updatePlan);

router.delete("/:id", subscriptionPlanController.deletePlan);

export default router;
