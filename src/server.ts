import { createServer } from "http";
import app from "./app.js";
import { config } from "./config/index.js";
import { initSocketServer } from "./socket/socket.service.js";
import { startReminderCron } from "./services/reminderCron.service.js";
import { startHearingReminderCron } from "./services/hearingReminderCron.service.js";
import { startTaskReminderCron } from "./services/taskReminderCron.service.js";
import { startReminderWorker } from "./services/reminderEmailWorker.service.js";
import { verifySMTP } from "./services/emailOtp.service.js";

const PORT = config.PORT;

const startServer = async () => {
	try {
		const httpServer = createServer(app);
		initSocketServer(httpServer);

		httpServer.listen(PORT, async () => {
			console.log(`🚀 Server is running on port ${PORT} in ${config.NODE_ENV} mode (Socket.IO active)`);
			await verifySMTP();
			startReminderCron();
			startHearingReminderCron();
			startTaskReminderCron();
			startReminderWorker();
		});

		/* Graceful Shutdown */
		process.on("SIGINT", () => {
			httpServer.close(() => {
				console.log("Server closed");
				process.exit(0);
			});
		});
	} catch (error) {
		console.error("❌ Failed to start server:", error);
		process.exit(1);
	}
};

startServer();
