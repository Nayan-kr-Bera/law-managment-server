import express from "express";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";
import roleController from "../controller/roles/role.controller.js";
import permissionController from "../controller/permission/permission.controller.js";

const router = express.Router();

router.get("/all", auth, permissionGuard("role.read"), roleController.getRoles);
router.get("/all/:id", auth, permissionGuard("role.read"), roleController.getRoles);
router.get("/permissions", auth, permissionGuard("role.read"), permissionController.getPermission);
router.post("/create", auth, permissionGuard("role.create"), roleController.createRole);
router.get("/:id", auth, permissionGuard("role.read"), roleController.getRoleById);
router.put("/update/:id", auth, permissionGuard("role.update"), roleController.updateRole);
router.delete("/delete/:id", auth, permissionGuard("role.delete"), roleController.deleteRole);

export default router;
