import { Router } from "express";
import auth from "../middleware/auth.js";
import appointmentController from "../controller/appointement/appointment.controller.js";
const router = Router();

router.post("/", auth, appointmentController.createAppointment);

router.get("/", auth, appointmentController.getAppointments);

router.get("/:id", auth, appointmentController.getAppointmentById);

router.put("/:id", auth, appointmentController.updateAppointment);
router.patch(
  "/:id/status",
  auth,
  appointmentController.updateAppointmentStatus,
);

router.delete("/:id", auth, appointmentController.deleteAppointment);

export default router;
