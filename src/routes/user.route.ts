import { Router } from "express";
import userController from "../controller/user/user.controller.js";
import { upload } from "../middleware/upload.js";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";

const router = Router();

router.get("/", auth, permissionGuard("advocate.read"), userController.getUsers);

router.get("/me/tenants", auth, userController.getMyTenants);

router.get("/:id", auth, permissionGuard("advocate.read"), userController.getUserById);

router.put("/:id", auth, upload.single("avatar"), userController.updateUser);

router.patch("/:id/status", auth, permissionGuard("advocate.update"), userController.updateUserStatus);

router.delete("/:id", auth, permissionGuard("advocate.delete"), userController.deleteUser);

export default router;
