import cors from "cors";
import express, { Request, Response } from "express";
import { config } from "./config/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import {
  advocateRoutes,
  appointmentRoutes,
  authRoutes,
  caseActionRoutes,
  caseRoutes,
  caseTypesRoutes,
  clientRoutes,
  clientPortalRoutes,
  companiesRoutes,
  courtsRoute,
  custmFieldsRoutes,
  documentsFolderRoutes,
  documentsRoutes,
  empanelmentsRoutes,
  hearingRoutes,
  officeRoutes,
  otpRoutes,
  passwordRoutes,
  permissionRoutes,
  policementStationRoutes,
  reminderRoutes,
  roleRoutes,
  subscriptionPaymentRoutes,
  subscriptionPlanRoutes,
  systemAlartsRoutes,
  tagRoutes,
  taskCommentRoutes,
  taskRoutes,
  tenantRoutes,
  tenantsubscriptionRoutes,
  undersectionRoutes,
  userRoutes,
  supportTicketRoutes,
  invoicesRoutes,
  contactUsRoutes,
  aiDraftRoutes,
} from "./routes/index.js";

const app = express();

/* ---------- Global Middlewares ---------- */
app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      const isAllowed =
        !origin ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin === config.ORIGIN_FRONTEND ||
        origin === config.ORIGIN_CLIENT;
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

/* ---------- Health Check ---------- */
app.get("/", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Server is running",
  });
});

/* ---------- Routes ---------- */

app.use("/api/auth", authRoutes);
app.use("/api/password", passwordRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/permission", permissionRoutes);
app.use("/api/casetypes", caseTypesRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/courts", courtsRoute);
app.use("/api/custom-fields", custmFieldsRoutes);
app.use("/api/empanelments", empanelmentsRoutes);
app.use("/api/police-stations", policementStationRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/under-sections", undersectionRoutes);
app.use("/api/offices", officeRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/advocates", advocateRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/hearings", hearingRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/user", userRoutes);
app.use("/api/task", taskRoutes);
app.use("/api/task-comments", taskCommentRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/case-actions", caseActionRoutes);
app.use("/api/system", systemAlartsRoutes);
app.use("/api/subscriptionPayment", subscriptionPaymentRoutes);
app.use("/api/subscriptions", subscriptionPlanRoutes);
app.use("/api/tenantsubscription", tenantsubscriptionRoutes);
app.use("/api/document", documentsRoutes);
app.use("/api/documentFolder",documentsFolderRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/client-portal", clientPortalRoutes);
app.use("/api/support-tickets", supportTicketRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/contact-us", contactUsRoutes);
app.use("/api/ai", aiDraftRoutes);

/* ---------- 404 ---------- */
app.use(notFound);

/* ---------- Error Handler ---------- */
app.use(errorHandler);

export default app;
