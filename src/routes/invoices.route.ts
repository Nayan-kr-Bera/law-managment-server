import { Router } from "express";
import invoicesController from "../controller/finance/invoices.controller.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";

const router = Router();

router.get("/", auth, permissionGuard("invoice.read"), invoicesController.getInvoices);
router.post("/", auth, permissionGuard("invoice.create"), invoicesController.createInvoice);
router.get("/receipts", auth, permissionGuard("payment.read"), invoicesController.getReceipts);
router.post("/receipts", auth, permissionGuard("payment.create"), invoicesController.createReceipt);
router.put("/receipts/:id", auth, permissionGuard("payment.update"), invoicesController.updateReceipt);
router.delete("/receipts/:id", auth, permissionGuard("payment.delete"), invoicesController.deleteReceipt);
router.get("/:id", auth, permissionGuard("invoice.read"), invoicesController.getInvoiceById);
router.put("/:id", auth, permissionGuard("invoice.update"), invoicesController.updateInvoice);
router.delete("/:id", auth, permissionGuard("invoice.delete"), invoicesController.deleteInvoice);

export default router;
