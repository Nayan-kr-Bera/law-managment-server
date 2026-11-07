import { Router } from "express";
import advocatesController from "../controller/advocates/advocates.controller.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";
import subscriptionMiddleware from "../middleware/subscriptionMiddleware.js";
import subscriptionLimitMiddleware from "../middleware/subscriptionLimitMiddleware.js";

const router = Router();

router.get("/", auth, permissionGuard("advocate.read"), advocatesController.getadvocates);
router.post(
  "/",
  auth,
  permissionGuard("advocate.create"),
  subscriptionMiddleware,
  subscriptionLimitMiddleware.checkUserLimit,
  advocatesController.createAdvocate,
);
router.put("/reassign-cases", auth, permissionGuard("case.assign"), advocatesController.reassignCases);
router.get("/:id/permissions", auth, permissionGuard("user_permission.manage"), advocatesController.getAdvocatePermissions);
router.put("/:id/permissions", auth, permissionGuard("user_permission.manage"), advocatesController.updateAdvocatePermissions);
router.put("/:id", auth, permissionGuard("advocate.update"), advocatesController.updateAdvocate);
router.delete("/:id", auth, permissionGuard("advocate.delete"), advocatesController.deleteAdvocate);
router.put("/:advocateId/cases", auth, permissionGuard("case.assign"), advocatesController.assignCases);
router.get("/advocate/:advocateId", auth, permissionGuard("advocate.read"), advocatesController.getAdvocateCases);
router.get("/for-from", auth, permissionGuard("advocate.read"), advocatesController.getAdvocatesForFrom);
export default router;
