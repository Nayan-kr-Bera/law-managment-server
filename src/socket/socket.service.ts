import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  io.on("connection", (socket) => {
    // Advocate or Staff Agent joins a specific ticket chat room
    socket.on("join_ticket", (ticketId: string) => {
      if (!ticketId) return;
      const room = `ticket_${ticketId}`;
      socket.join(room);
    });

    // Leave ticket room
    socket.on("leave_ticket", (ticketId: string) => {
      if (!ticketId) return;
      const room = `ticket_${ticketId}`;
      socket.leave(room);
    });

    // Real-time keystroke typing indicator between Advocate and Staff Agent
    socket.on(
      "ticket_typing",
      (data: { ticketId: string; senderName?: string; userName?: string; isTyping: boolean }) => {
        if (!data?.ticketId) return;
        const resolvedName = data.senderName || data.userName || "Someone";
        socket.to(`ticket_${data.ticketId}`).emit("ticket_typing", {
          ticketId: data.ticketId,
          senderName: resolvedName,
          userName: resolvedName,
          isTyping: Boolean(data.isTyping),
        });
      }
    );

    socket.on("disconnect", () => {
      // Clean up connection automatically handled by Socket.IO
    });
  });

  return io;
};

export const getIO = (): SocketIOServer | null => io;

/**
 * Broadcasts a new message directly into the ticket room in real time
 */
export const emitTicketMessage = (ticketId: string, messageData: unknown): void => {
  if (!io || !ticketId) return;
  io.to(`ticket_${ticketId}`).emit("new_ticket_message", {
    ticketId,
    message: messageData,
  });
};

/**
 * Broadcasts ticket stage/status changes (e.g. assigned, status update)
 */
export const emitTicketUpdated = (ticketId: string, updateData: unknown): void => {
  if (!io || !ticketId) return;
  io.to(`ticket_${ticketId}`).emit("ticket_updated", {
    ticketId,
    update: updateData,
  });
};

/**
 * Signals that ticket is closed, prompting clients to disconnect the socket cleanly
 */
export const emitTicketClosed = (ticketId: string): void => {
  if (!io || !ticketId) return;
  io.to(`ticket_${ticketId}`).emit("ticket_closed", { ticketId });
  // Evict all sockets from this closed ticket's room
  io.in(`ticket_${ticketId}`).socketsLeave(`ticket_${ticketId}`);
};
