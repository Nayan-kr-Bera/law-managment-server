import { Router } from "express";

import hearingController from "../controller/hearing/hearing.controller.js";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";

const router = Router();

router.get("/", auth, officeGuard, hearingController.getHearings);
router.post("/", auth, officeGuard, hearingController.createHearing);
router.put("/:id", auth, officeGuard, hearingController.updateHearing);
router.delete("/:id", auth, officeGuard, hearingController.deleteHearing);

export default router;
