import { Router } from "express";
import invoicesController from "../controller/finance/invoices.controller.js";
import auth from "../middleware/auth.js";

const router = Router();

router.get("/", auth, invoicesController.getInvoices);
router.post("/", auth, invoicesController.createInvoice);
router.get("/receipts", auth, invoicesController.getReceipts);
router.post("/receipts", auth, invoicesController.createReceipt);
router.put("/receipts/:id", auth, invoicesController.updateReceipt);
router.delete("/receipts/:id", auth, invoicesController.deleteReceipt);
router.get("/:id", auth, invoicesController.getInvoiceById);
router.put("/:id", auth, invoicesController.updateInvoice);
router.delete("/:id", auth, invoicesController.deleteInvoice);

export default router;
