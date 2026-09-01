import express from 'express';
import emailVerificationController from '../controller/otp/emailVerification.controller.js';

const router = express.Router();

router.post('/verify-otp',emailVerificationController.verifyOtp);
router.post('/reset-password', emailVerificationController.resetPassword);
router.post('/resend-otp', emailVerificationController.sendVerificationOtp);
export default router;