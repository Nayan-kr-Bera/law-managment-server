import { and, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import db from "../db/index.js";
import { supportTickets, supportTicketMessages, user } from "../db/schema/index.js";
import {
  emitTicketClosed,
  emitTicketMessage,
  emitTicketUpdated,
} from "../socket/socket.service.js";

// =============================================================================
// HELPER: OFFICE HOURS CHECK (10:00 AM to 7:00 PM IST)
// =============================================================================
export function isSupportOfficeHours(): boolean {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utcMs + 5.5 * 3600000);
  const currentHour = istDate.getHours();
  return currentHour >= 10 && currentHour < 19;
}

// =============================================================================
// HELPER: EXPLICIT RESOLUTION DETECTION
// =============================================================================
export function isExplicitProblemSolved(message: string): boolean {
  if (!message) return false;
  return /problem solved|please close|issue resolved|close (the )?ticket|already solved|fixed/i.test(
    message
  );
}

// =============================================================================
// HELPER: FORMAT TICKET MESSAGE
// =============================================================================
export function formatTicketMessage(m: {
  id: string;
  senderName: string;
  senderType: string;
  message: string;
  createdAt?: Date | string | null;
}) {
  return {
    id: m.id,
    senderName: m.senderName,
    senderRole: m.senderType,
    message: m.message,
    timestamp: m.createdAt ? new Date(m.createdAt).toLocaleString() : "",
  };
}

// =============================================================================
// HELPER: FIND OPTIMAL ONLINE SUPPORT AGENT (Round-Robin by lowest active load)
// =============================================================================
export async function findOptimalOnlineSupportAgent(): Promise<{
  id: string;
  name: string;
  email: string;
} | null> {
  const ONLINE_THRESHOLD_MS = 2.5 * 60 * 1000; // 2.5 minutes
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS);

  interface OnlineAgentRow {
    id: string;
    name: string;
    email: string;
    lastActiveAt?: Date | null;
    supportAvailability?: string | null;
  }

  const allUsers = (await db.query.user.findMany({
    where: and(
      eq(user.isSupportAgent, true),
      eq(user.status, "active"),
      isNull(user.deletedAt),
      isNotNull(user.lastActiveAt)
    ),
    columns: {
      id: true,
      name: true,
      email: true,
      lastActiveAt: true,
      supportAvailability: true,
    },
  })) as OnlineAgentRow[];

  const onlineAgents = allUsers.filter((u) => {
    if (!u.lastActiveAt) return false;
    const isRecent = new Date(u.lastActiveAt).getTime() >= cutoff.getTime();
    const notOffline = u.supportAvailability !== "offline" && u.supportAvailability !== "busy";
    return isRecent && notOffline;
  });

  if (onlineAgents.length === 0) return null;

  // Calculate active open tickets per agent
  const activeTickets = await db.query.supportTickets.findMany({
    where: and(
      isNull(supportTickets.caseId),
      isNull(supportTickets.clientId),
      isNull(supportTickets.clientUserId),
      isNotNull(supportTickets.assignedToUserId)
    ),
    columns: {
      id: true,
      assignedToUserId: true,
      status: true,
    },
  });

  const counts: Record<string, number> = {};
  for (const t of activeTickets) {
    if (t.assignedToUserId && t.status !== "closed" && t.status !== "resolved") {
      counts[t.assignedToUserId] = (counts[t.assignedToUserId] || 0) + 1;
    }
  }

  // Sort by lowest active workload
  onlineAgents.sort((a, b) => {
    const countA = counts[a.id] || 0;
    const countB = counts[b.id] || 0;
    return countA - countB;
  });

  return {
    id: onlineAgents[0].id,
    name: onlineAgents[0].name,
    email: onlineAgents[0].email,
  };
}

// =============================================================================
// HELPER: CHECK IF ANY ONLINE SUPPORT AGENT IS BUSY
// =============================================================================
export async function isAnySupportAgentBusy(): Promise<boolean> {
  const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS);

  const onlineSupportUsers = await db.query.user.findMany({
    where: and(
      eq(user.isSupportAgent, true),
      eq(user.status, "active"),
      isNull(user.deletedAt),
      isNotNull(user.lastActiveAt),
      gte(user.lastActiveAt, cutoff)
    ),
    columns: {
      id: true,
      supportAvailability: true,
    },
  });

  return onlineSupportUsers.some((u) => u.supportAvailability === "busy");
}

// =============================================================================
// HELPER: AUTO-CLOSE INACTIVE AI-HANDLED TICKETS (7 minutes = 2m checkin + 5m wait)
// =============================================================================
const INACTIVITY_TIMEOUT_MS = 7 * 60 * 1000;

export async function autoCloseInactiveTicketIfExpired(ticket: {
  id: string;
  status: string;
  assignedToUserId?: string | null;
  aiResolutionStatus?: string | null;
  messages?: Array<{ senderType?: string | null; senderName?: string | null; createdAt?: Date | string | null }>;
}): Promise<boolean> {
  if (
    ticket.status === "closed" ||
    ticket.status === "resolved" ||
    ticket.assignedToUserId ||
    !ticket.messages ||
    ticket.messages.length === 0
  ) {
    return false;
  }

  const lastMsg = ticket.messages[ticket.messages.length - 1];
  if (
    (lastMsg.senderType === "ai" || lastMsg.senderName === "Nyaya Sahayak AI") &&
    lastMsg.createdAt
  ) {
    const msgTime = new Date(lastMsg.createdAt).getTime();
    if (Date.now() - msgTime >= INACTIVITY_TIMEOUT_MS) {
      ticket.status = "closed";
      ticket.aiResolutionStatus = "resolved_by_ai";

      await db
        .update(supportTickets)
        .set({
          status: "closed",
          aiResolutionStatus: "resolved_by_ai",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticket.id))
        .catch((e) => console.error("Auto close ticket error:", e));

      emitTicketClosed(ticket.id);
      emitTicketUpdated(ticket.id, { status: "closed" });
      return true;
    }
  }

  return false;
}

export async function autoCloseInactiveTicketsList(
  tickets: Array<{
    id: string;
    status: string;
    assignedToUserId?: string | null;
    aiResolutionStatus?: string | null;
    messages?: Array<{ senderType?: string | null; senderName?: string | null; createdAt?: Date | string | null }>;
  }>
): Promise<void> {
  for (const t of tickets) {
    await autoCloseInactiveTicketIfExpired(t);
  }
}

// =============================================================================
// HELPER: AUTO-ASSIGN PENDING ESCALATED TICKET TO AGENT WHO JUST CAME ONLINE
// =============================================================================
export async function assignPendingEscalatedTicketsToAgent(agent: {
  id: string;
  name: string;
}): Promise<boolean> {
  const pendingTicket = await db.query.supportTickets.findFirst({
    where: and(
      isNull(supportTickets.assignedToUserId),
      isNull(supportTickets.caseId),
      isNull(supportTickets.clientId),
      isNull(supportTickets.clientUserId),
      eq(supportTickets.aiResolutionStatus, "escalated"),
      or(eq(supportTickets.status, "open"), eq(supportTickets.status, "in_progress"))
    ),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  if (!pendingTicket) return false;

  await db
    .update(supportTickets)
    .set({
      assignedToUserId: agent.id,
      assignedAt: new Date(),
      status: "in_progress",
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, pendingTicket.id));

  const handoverNotice = `Connected with specialist ${agent.name}. They will assist you with your request.`;
  const [handoverMsg] = await db
    .insert(supportTicketMessages)
    .values({
      ticketId: pendingTicket.id,
      senderType: "system",
      senderName: "System",
      message: handoverNotice,
    })
    .returning();

  emitTicketMessage(pendingTicket.id, handoverMsg);
  emitTicketUpdated(pendingTicket.id, {
    assignedToUserId: agent.id,
    assignedToUser: { id: agent.id, name: agent.name },
    status: "in_progress",
  });

  return true;
}
