import { Router } from "express";
import officeController from "../controller/office/office.controller.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";
import subscriptionMiddleware from "../middleware/subscriptionMiddleware.js";
import subscriptionLimitMiddleware from "../middleware/subscriptionLimitMiddleware.js";

const router = Router();

router.get("/", auth, permissionGuard("office.read"), officeController.getOffices);
router.post(
  "/self-office",
  auth,
  permissionGuard("office.create"),
  subscriptionMiddleware,
  subscriptionLimitMiddleware.checkOfficeLimit,
  officeController.createOfficeForUserSelf,
);
//only name id
router.get("/names", auth, permissionGuard("office.read"), officeController.getOfficesNames);
router.get("/:id", auth, permissionGuard("office.read"), officeController.getOffice);
router.post("/", auth, permissionGuard("office.create"), officeController.createOffice);
router.put("/:id", auth, permissionGuard("office.update"), officeController.updateOffice);
router.delete("/:id", auth, permissionGuard("office.delete"), officeController.deleteOffice);

export default router;
