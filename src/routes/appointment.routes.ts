import { Router } from "express";
import auth from "../middleware/auth.js";
import { permissionGuard } from "../middleware/permission.js";
import appointmentController from "../controller/appointement/appointment.controller.js";
const router = Router();

router.post("/", auth, permissionGuard("appointment.create"), appointmentController.createAppointment);

router.get("/", auth, permissionGuard("appointment.read"), appointmentController.getAppointments);

router.get("/:id", auth, permissionGuard("appointment.read"), appointmentController.getAppointmentById);

router.put("/:id", auth, permissionGuard("appointment.update"), appointmentController.updateAppointment);
router.patch(
  "/:id/status",
  auth,
  permissionGuard("appointment.update"),
  appointmentController.updateAppointmentStatus,
);

router.delete("/:id", auth, permissionGuard("appointment.delete"), appointmentController.deleteAppointment);

export default router;
