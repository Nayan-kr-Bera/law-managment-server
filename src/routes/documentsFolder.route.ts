import { Router } from "express";
import auth from "../middleware/auth.js";
import documentFolderController from "../controller/documents/documentFolder.controller.js";
import officeGuard from "../middleware/officeGuard.js";
const router = Router();

// Create folder
router.post("/", auth,officeGuard, documentFolderController.createFolder);

// Get folders
router.get("/", auth, documentFolderController.getFolders);

// Get folder by ID
router.get("/:id", auth, documentFolderController.getFolderById);

// Update folder
router.put("/:id", auth, documentFolderController.updateFolder);

// Delete folder
router.delete("/:id", auth, documentFolderController.deleteFolder);

export default router;
