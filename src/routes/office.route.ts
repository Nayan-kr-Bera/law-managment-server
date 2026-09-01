import { Router } from "express";
import officeController from "../controller/office/office.controller.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";
import subscriptionMiddleware from "../middleware/subscriptionMiddleware.js";
import subscriptionLimitMiddleware from "../middleware/subscriptionLimitMiddleware.js";

const router = Router();

router.get("/", auth, officeController.getOffices);
router.post(
  "/self-office",
  auth,
  permissionGuard("office.create"),
  subscriptionMiddleware,
  subscriptionLimitMiddleware.checkOfficeLimit,
  officeController.createOfficeForUserSelf,
);
//only name id
router.get("/names", auth, officeController.getOfficesNames);
router.get("/:id", auth, officeController.getOffice);
router.post("/", auth, officeController.createOffice);
router.put("/:id", auth, officeController.updateOffice);
router.delete("/:id", auth, officeController.deleteOffice);

export default router;
