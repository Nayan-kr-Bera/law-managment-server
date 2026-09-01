import express from 'express';
import permissionController from '../controller/permission/permission.controller.js';
import auth from '../middleware/auth.js';
const router = express.Router();

router.get('/all',auth, permissionController.getPermission)

export default router;
