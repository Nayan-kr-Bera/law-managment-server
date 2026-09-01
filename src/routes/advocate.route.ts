import { Router } from "express";
import advocatesController from "../controller/advocates/advocates.controller.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";
import subscriptionMiddleware from "../middleware/subscriptionMiddleware.js";
import subscriptionLimitMiddleware from "../middleware/subscriptionLimitMiddleware.js";

const router = Router();

router.get("/", auth, advocatesController.getadvocates);
router.post(
  "/",
  auth,
  permissionGuard("advocate.create"),
  subscriptionMiddleware,
  subscriptionLimitMiddleware.checkUserLimit,
  advocatesController.createAdvocate,
);
router.put("/reassign-cases", auth, advocatesController.reassignCases);
router.put("/:id", auth, advocatesController.updateAdvocate);
router.delete("/:id", auth, advocatesController.deleteAdvocate);
router.put("/:advocateId/cases", auth, advocatesController.assignCases);
router.get("/advocate/:advocateId", auth, advocatesController.getAdvocateCases);
router.get("/for-from", auth, advocatesController.getAdvocatesForFrom);
export default router;
