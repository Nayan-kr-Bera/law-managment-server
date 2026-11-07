import { Router } from "express";

import hearingController from "../controller/hearing/hearing.controller.js";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";

const router = Router();

router.get("/", auth, officeGuard, permissionGuard("hearing.read"), hearingController.getHearings);
router.post("/", auth, officeGuard, permissionGuard("hearing.create"), hearingController.createHearing);
router.put("/:id", auth, officeGuard, permissionGuard("hearing.update"), hearingController.updateHearing);
router.delete("/:id", auth, officeGuard, permissionGuard("hearing.delete"), hearingController.deleteHearing);

export default router;
