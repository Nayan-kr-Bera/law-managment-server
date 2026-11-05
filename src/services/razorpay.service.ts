import crypto from "crypto";

import razorpay from "../config/razorpay.js";

interface CreateRazorpayOrderParams {
  amount: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

interface VerifyPaymentParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

const razorpayService = {
  async createOrder({
    amount,
    currency = "INR",
    receipt,
    notes,
  }: CreateRazorpayOrderParams) {
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
      notes,
    });

    return order;
  },

  async getOrder(orderId: string) {
    const order = await razorpay.orders.fetch(orderId);

    return order;
  },

  async getPayment(paymentId: string) {
    const payment = await razorpay.payments.fetch(paymentId);

    return payment;
  },

  verifyPayment({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  }: VerifyPaymentParams) {
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret) {
      throw new Error("RAZORPAY_KEY_SECRET is not configured");
    }

    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(razorpaySignature),
    );
  },
};

export default razorpayService;
