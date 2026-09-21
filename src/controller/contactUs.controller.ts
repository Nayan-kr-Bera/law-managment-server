import { NextFunction, Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import db from "../db/index.js";
import contactUsMessages from "../db/schema/contactUs.js";
import CustomErrorHandler from "../utils/customErrorHandler.js";
import ResponseHandler from "../utils/responseHandler.js";

const contactUsController = {
  // Public submission endpoint from website Contact/Support page
  async submitContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { fullName, email, phone, firmName, role, subject, message } = req.body;

      if (!fullName || !email || !subject || !message) {
        return next(
          CustomErrorHandler.badRequest(
            "Full name, email address, subject, and message are required."
          )
        );
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(CustomErrorHandler.badRequest("Please provide a valid email address."));
      }

      const [inserted] = await db
        .insert(contactUsMessages)
        .values({
          fullName: String(fullName).trim(),
          email: String(email).trim().toLowerCase(),
          phone: phone ? String(phone).trim() : null,
          firmName: firmName ? String(firmName).trim() : null,
          role: role ? String(role).trim() : "Advocate",
          subject: String(subject).trim(),
          message: String(message).trim(),
          status: "pending",
        })
        .returning();

      return res
        .status(201)
        .json(
          ResponseHandler(
            201,
            "Thank you for contacting MI Law. Our practice support team will connect with you shortly.",
            inserted
          )
        );
    } catch (error) {
      console.error("Submit contact inquiry error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET /api/contact-us (Ready for future Admin Panel)
  async getAllMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const statusFilter = req.query.status as string;

      const whereClause = statusFilter ? eq(contactUsMessages.status, statusFilter) : undefined;

      const records = await db.query.contactUsMessages.findMany({
        where: whereClause,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return res
        .status(200)
        .json(ResponseHandler(200, "Contact inquiries fetched successfully", records));
    } catch (error) {
      console.error("Get contact inquiries error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET /api/contact-us/:id (Ready for future Admin Panel)
  async getMessageById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) {
        return next(CustomErrorHandler.badRequest("Inquiry ID is required."));
      }

      const record = await db.query.contactUsMessages.findFirst({
        where: eq(contactUsMessages.id, id),
      });

      if (!record) {
        return next(CustomErrorHandler.notFound("Contact inquiry not found."));
      }

      return res
        .status(200)
        .json(ResponseHandler(200, "Contact inquiry details fetched successfully", record));
    } catch (error) {
      console.error("Get contact inquiry by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // PATCH /api/contact-us/:id/status (Ready for future Admin Panel)
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Inquiry ID is required."));
      }

      const [updated] = await db
        .update(contactUsMessages)
        .set({
          status: status || undefined,
          adminNotes: adminNotes !== undefined ? adminNotes : undefined,
          updatedAt: new Date(),
        })
        .where(eq(contactUsMessages.id, id))
        .returning();

      if (!updated) {
        return next(CustomErrorHandler.notFound("Contact inquiry not found."));
      }

      return res
        .status(200)
        .json(ResponseHandler(200, "Contact inquiry status updated successfully", updated));
    } catch (error) {
      console.error("Update contact inquiry status error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default contactUsController;
