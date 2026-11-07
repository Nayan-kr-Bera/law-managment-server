import express from "express";
import auth from "../middleware/auth.js";
import roleController from "../controller/roles/role.controller.js";
import permissionController from "../controller/permission/permission.controller.js";

const router = express.Router();

router.get("/all", auth, roleController.getRoles);
router.get("/all/:id", auth, roleController.getRoles);
router.get("/permissions", auth, permissionController.getPermission);
router.post("/create", auth, roleController.createRole);
router.get("/:id", auth, roleController.getRoleById);
router.put("/update/:id", auth, roleController.updateRole);
router.delete("/delete/:id", auth, roleController.deleteRole);

export default router;
