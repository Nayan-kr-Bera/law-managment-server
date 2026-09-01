import tenantController from "../controller/tenant/tenant.controller.js";
import express from "express";
import auth from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();
router.post("/", auth, tenantController.createTenant);
router.get("/my-tenant", auth, tenantController.getTenantByUserId);
router.get("/", auth, tenantController.getTenants);
router.get("/tenant-details", auth, tenantController.getTenantDetails);
router.put("/:id", auth, upload.single("logo"), tenantController.updateTenant);
router.delete("/:id", auth, tenantController.deleteTenant);

export default router;
