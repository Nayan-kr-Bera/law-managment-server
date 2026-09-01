import { Router } from "express";
import userController from "../controller/user/user.controller.js";
import { upload } from "../middleware/upload.js";
import auth from "../middleware/auth.js";

const router = Router();

router.get("/", auth, userController.getUsers);

router.get("/me/tenants", auth, userController.getMyTenants);

router.get("/:id", auth, userController.getUserById);

router.put("/:id", auth, upload.single("avatar"), userController.updateUser);

router.patch("/:id/status", auth, userController.updateUserStatus);

router.delete("/:id", auth, userController.deleteUser);

export default router;
