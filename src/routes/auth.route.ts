import express from 'express';
import loginController from '../controller/auth/login.controller.js';
import adminAuthController from '../controller/admin/auth/adminAuth.controller.js';
import refreshController from '../controller/auth/refreshToken.controller.js';
import logoutController from '../controller/auth/logout.controller.js';
import registerController from '../controller/auth/register.controller.js';

const router = express.Router();

// Tenant Client Authentication
router.post('/login', loginController.userlogin);
router.post('/refresh-token', refreshController.refresh);
router.post("/register", registerController.userRegister);
router.post('/logout', logoutController.logout);

// Platform Super Admin & Departmental Admin Authentication
router.post('/admin/login', adminAuthController.login);
router.post('/admin/refresh-token', adminAuthController.refreshToken);

export default router;