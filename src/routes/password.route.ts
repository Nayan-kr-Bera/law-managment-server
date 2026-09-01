
import express from 'express'
import forgotPasswordController from '../controller/auth/forgotPassword.controller.js';
import { auth } from '../index.js';
const router =  express.Router()

router.post('/forgot-password',forgotPasswordController.changePassword);
router.put('/update-password',auth,forgotPasswordController.updatePassword);

export default router;