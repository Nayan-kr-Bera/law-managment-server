import { Router } from "express";
import auth from "../middleware/auth.js";
import casePrecedentController from "../controller/case/casePrecedent.controller.js";

const router = Router();

// 1. Get all precedents linked to a case
router.get("/case/:caseId", auth, casePrecedentController.getCasePrecedents);

// 2. Attach a precedent / neutral citation to a case
router.post("/", auth, casePrecedentController.attachPrecedent);

// 3. Update notes or relevance tag of an attached precedent
router.patch("/:id", auth, casePrecedentController.updatePrecedent);

// 4. Remove an attached precedent from a case
router.delete("/:id", auth, casePrecedentController.removePrecedent);

export default router;
