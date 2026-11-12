import { createServer } from "http";
import app from "./app.js";
import { config } from "./config/index.js";
import { initSocketServer } from "./socket/socket.service.js";
import { startReminderCron } from "./services/reminderCron.service.js";
import { startHearingReminderCron } from "./services/hearingReminderCron.service.js";
import { startTaskReminderCron } from "./services/taskReminderCron.service.js";
import { startReminderWorker } from "./services/reminderEmailWorker.service.js";
import { verifySMTP } from "./services/emailOtp.service.js";
import { closeRabbitMQ } from "./lib/rabbitmq.js";

const PORT = config.PORT;

const startServer = async () => {
	try {
		const httpServer = createServer(app);
		initSocketServer(httpServer);

		httpServer.listen(PORT, async () => {
			console.log(`🚀 Server is running on: http://localhost:${PORT} (${config.NODE_ENV} mode, Socket.IO active)`);
			console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
			await verifySMTP();
			startReminderCron();
			startHearingReminderCron();
			startTaskReminderCron();
			startReminderWorker();
		});

		/* Graceful Shutdown */
		const shutdown = async () => {
			try {
				await closeRabbitMQ();
			} catch { }
			httpServer.close(() => {
				console.log("Server closed");
				process.exit(0);
			});
		};

		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	} catch (error) {
		console.error("❌ Failed to start server:", error);
		process.exit(1);
	}
};

startServer();
