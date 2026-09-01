import express from 'express';
import loginController from '../controller/auth/login.controller.js';
import refreshController from '../controller/auth/refreshToken.controller.js';
import logoutController from '../controller/auth/logout.controller.js';
import registerController from '../controller/auth/register.controller.js';

const router = express.Router();
router.post('/login', loginController.userlogin);
router.post('/refresh-token', refreshController.refresh);
router.post('/logout', logoutController.logout);
router.post("/register",registerController.userRegister);

export default router;