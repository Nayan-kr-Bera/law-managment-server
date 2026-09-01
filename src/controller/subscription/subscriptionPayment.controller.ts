import { and, desc, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";

import { subscriptionPaymentHistory } from "../../db/schema/index.js";

import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const subscriptionPaymentController = {
  // GET ALL PAYMENTS OF TENANT
  async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.params;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      const payments = await db.query.subscriptionPaymentHistory.findMany({
        where: eq(subscriptionPaymentHistory.tenantId, tenantId),
        orderBy: [desc(subscriptionPaymentHistory.transactionDate)],
        with: {
          plan: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Payment history fetched successfully",
            payments,
          ),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET PAYMENT BY ID
  async getPaymentById(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId, id } = req.params;

      if (!tenantId || !id) {
        return next(
          CustomErrorHandler.badRequest(
            "Tenant id and payment id are required",
          ),
        );
      }

      const payment = await db.query.subscriptionPaymentHistory.findFirst({
        where: and(
          eq(subscriptionPaymentHistory.id, id),
          eq(subscriptionPaymentHistory.tenantId, tenantId),
        ),
        with: {
          plan: true,
        },
      });

      if (!payment) {
        return next(CustomErrorHandler.notFound("Payment not found"));
      }

      return res
        .status(200)
        .send(ResponseHandler(200, "Payment fetched successfully", payment));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default subscriptionPaymentController;
