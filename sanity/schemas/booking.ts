import { defineType, defineField } from "sanity";

export const booking = defineType({
  name: "booking",
  title: "Booking",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "bookingId", title: "Booking ID", type: "string" }),
    defineField({ name: "serviceId", title: "Service ID", type: "string" }),
    defineField({ name: "serviceName", title: "Service Name", type: "string" }),
    defineField({ name: "date", title: "Date", type: "date" }),
    defineField({ name: "startTime", title: "Start Time", type: "string" }),
    defineField({ name: "endTime", title: "End Time", type: "string" }),
    defineField({ name: "clientName", title: "Client Name", type: "string" }),
    defineField({ name: "clientEmail", title: "Client Email", type: "string" }),
    defineField({ name: "clientPhone", title: "Client Phone", type: "string" }),
    defineField({ name: "notes", title: "Notes", type: "text" }),
    defineField({ name: "status", title: "Status", type: "string", options: { list: ["confirmed", "cancelled", "completed"] } }),
    defineField({ name: "cancelledAt", title: "Cancelled At", type: "datetime" }),
  ],
  preview: {
    select: { title: "clientName", subtitle: "date" },
  },
});
