export interface GoogleCalendarEventOptions {
  title: string;
  description?: string;
  location?: string;
  startDate: Date | string;
  endDate?: Date | string;
  guestEmails?: string[];
}

/**
 * Format a Date object or date string into Google Calendar ISO 8601 format (YYYYMMDDTHHmmssZ)
 */
function formatGoogleCalendarDate(dateInput: Date | string, isAllDay: boolean = false): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

  if (isNaN(d.getTime())) {
    const today = new Date();
    return today.toISOString().replace(/-|:|\.\d+/g, "");
  }

  if (isAllDay) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  return d.toISOString().replace(/-|:|\.\d+/g, "");
}

/**
 * Generate direct Google Calendar Event URL (1-click Add to Google Calendar)
 */
export function generateGoogleCalendarUrl(options: GoogleCalendarEventOptions): string {
  const { title, description = "", location = "", startDate, endDate, guestEmails = [] } = options;

  const startObj = typeof startDate === "string" ? new Date(startDate) : startDate;
  let endObj = endDate ? (typeof endDate === "string" ? new Date(endDate) : endDate) : new Date(startObj);

  // If no end date provided, set default 1 hour duration
  if (!endDate) {
    endObj = new Date(startObj.getTime() + 60 * 60 * 1000);
  }

  const startFormatted = formatGoogleCalendarDate(startObj);
  const endFormatted = formatGoogleCalendarDate(endObj);
  const datesParam = `${startFormatted}/${endFormatted}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: datesParam,
    details: description,
    location,
  });

  if (guestEmails && guestEmails.length > 0) {
    const cleanEmails = guestEmails.map((e) => e.trim()).filter(Boolean);
    if (cleanEmails.length > 0) {
      params.append("add", cleanEmails.join(","));
    }
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate iCalendar (.ics) file string content for standard calendar imports
 */
export function generateICSContent(options: GoogleCalendarEventOptions): string {
  const { title, description = "", location = "", startDate, endDate } = options;

  const startObj = typeof startDate === "string" ? new Date(startDate) : startDate;
  let endObj = endDate ? (typeof endDate === "string" ? new Date(endDate) : endDate) : new Date(startObj);

  if (!endDate) {
    endObj = new Date(startObj.getTime() + 60 * 60 * 1000);
  }

  const startFormatted = formatGoogleCalendarDate(startObj);
  const endFormatted = formatGoogleCalendarDate(endObj);
  const nowFormatted = formatGoogleCalendarDate(new Date());

  const cleanTitle = title.replace(/\n/g, " ");
  const cleanDescription = description.replace(/\n/g, "\\n");
  const cleanLocation = location.replace(/\n/g, ", ");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Law Practice Management System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:law-event-${Date.now()}@lawpractice.local`,
    `DTSTAMP:${nowFormatted}`,
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    `SUMMARY:${cleanTitle}`,
    `DESCRIPTION:${cleanDescription}`,
    `LOCATION:${cleanLocation}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
