import { defineType, defineField } from "sanity";

export const bookingConfig = defineType({
  name: "bookingConfig",
  title: "Booking Config",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "timezone", title: "Timezone", type: "string" }),
    defineField({
      name: "weeklySchedule",
      title: "Weekly Schedule",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "day", title: "Day (0=Sun)", type: "number", validation: (r) => r.min(0).max(6) }),
            defineField({ name: "start", title: "Start Time", type: "string" }),
            defineField({ name: "end", title: "End Time", type: "string" }),
            defineField({ name: "enabled", title: "Enabled", type: "boolean" }),
          ],
        },
      ],
    }),
    defineField({ name: "slotDuration", title: "Slot Duration (min)", type: "number" }),
    defineField({ name: "bufferTime", title: "Buffer Time (min)", type: "number" }),
    defineField({ name: "bookingLeadTime", title: "Lead Time (hours)", type: "number" }),
    defineField({ name: "maxAdvanceBooking", title: "Max Advance Booking (days)", type: "number" }),
    defineField({ name: "requirePayment", title: "Require Payment", type: "boolean" }),
  ],
  preview: {
    select: { title: "tenant" },
  },
});
