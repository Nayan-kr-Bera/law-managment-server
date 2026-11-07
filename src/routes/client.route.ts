import { Router } from "express";
import clientController from "../controller/client/client.controller.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";

const router = Router();

router.get("/", auth, permissionGuard("client.read"), clientController.getClients);

router.post("/", auth, permissionGuard("client.create"), clientController.createClient);

router.get("/forform", auth, permissionGuard("client.read"), clientController.getclienForFrom);

router.get("/:id", auth, permissionGuard("client.read"), clientController.getClient);

router.put("/:id", auth, permissionGuard("client.update"), clientController.updateClient);

router.delete("/:id", auth, permissionGuard("client.delete"), clientController.deleteClient);

router.post("/:clientId/cases", auth, permissionGuard("client.update"), clientController.assignCasesToClient);

router.delete("/:clientId/cases", auth, permissionGuard("client.update"), clientController.removeCasesFromClient);

router.get("/:clientId/cases", auth, permissionGuard("client.read"), clientController.getClientCases);

router.get(
  "/:clientId/pending-fees",
  auth,
  permissionGuard("client.read"),
  clientController.getClientPendingFees,
);

router.get("/:clientId/fee-ledger", auth, permissionGuard("client.read"), clientController.getClientFeeLedger);

router.get("/paystatus/:clientId", auth, permissionGuard("client.read"), clientController.getClientCaseSummary);

export default router;
