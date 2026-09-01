import { Router } from "express";
import clientController from "../controller/client/client.controller.js";
import auth from "../middleware/auth.js";

const router = Router();

router.get("/", auth, clientController.getClients);

router.post("/", auth, clientController.createClient);

router.get("/forform", auth, clientController.getclienForFrom);

router.get("/:id", auth, clientController.getClient);

router.put("/:id", auth, clientController.updateClient);

router.delete("/:id", auth, clientController.deleteClient);

router.post("/:clientId/cases", auth, clientController.assignCasesToClient);

router.delete("/:clientId/cases", auth, clientController.removeCasesFromClient);

router.get("/:clientId/cases", auth, clientController.getClientCases);

router.get(
  "/:clientId/pending-fees",
  auth,
  clientController.getClientPendingFees,
);

router.get("/:clientId/fee-ledger", auth, clientController.getClientFeeLedger);

router.get("/paystatus/:clientId", auth, clientController.getClientCaseSummary);

export default router;
