import cors from "cors";
import express, { Request, Response } from "express";
import { config } from "./config/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import autoAuditMiddleware from "./middleware/auditMiddleware.js";
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
  auditLogRoutes,
  notificationRoutes,
  adminRoutes,
  bareActRoutes,
  judgmentAiRoutes,
  casePrecedentRoutes,
} from "./routes/index.js";

const app = express();


/* ---------- Global Middlewares ---------- */
app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or in development mode
      if (!origin || config.NODE_ENV === "development") {
        return callback(null, true);
      }

      const allowedOrigins = [
        config.ORIGIN_FRONTEND,
        config.ORIGIN_CLIENT,
        config.ORIGIN_ADMIN,
      ].filter(Boolean) as string[];

      const isAllowed =
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://10.0.2.2:") ||
        origin.startsWith("http://192.168.") ||
        origin.startsWith("http://10.") ||
        origin.startsWith("exp://") ||
        origin.endsWith(".vercel.app") ||
        allowedOrigins.includes(origin) ||
        (process.env.ALLOWED_ORIGINS &&
          process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin));

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
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

/* ---------- Global Audit Middleware ---------- */
app.use("/api", autoAuditMiddleware);

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
app.use("/api/subscription-payments", subscriptionPaymentRoutes);
app.use("/api/subscriptions", subscriptionPlanRoutes);
app.use("/api/tenantsubscription", tenantsubscriptionRoutes);
app.use("/api/tenant-subscription", tenantsubscriptionRoutes);
app.use("/api/document", documentsRoutes);
app.use("/api/documentFolder",documentsFolderRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/client-portal", clientPortalRoutes);
app.use("/api/support-tickets", supportTicketRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/contact-us", contactUsRoutes);
app.use("/api/ai", aiDraftRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/bare-acts", bareActRoutes);
app.use("/api/judgment-ai", judgmentAiRoutes);
app.use("/api/case-precedents", casePrecedentRoutes);

/* ---------- Admin Portal Routes ---------- */

app.use("/api/admin", adminRoutes);
app.use("/api/system-stats", adminRoutes);

/* ---------- 404 ---------- */
app.use(notFound);

/* ---------- Error Handler ---------- */
app.use(errorHandler);

export default app;
