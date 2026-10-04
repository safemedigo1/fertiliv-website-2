import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  disconnectGoogleCalendar,
  executeGoogleCalendarBackfill,
  getGoogleCalendarSafeStatus,
  getGoogleCalendarAppointmentEventLink,
  listOwnedGoogleCalendars,
  previewGoogleCalendarBackfill,
  runGoogleCalendarTestLifecycle,
  selectGoogleCalendarDestination,
} from "../googleCalendarService";

export const googleCalendarRouter = router({
  status: adminProcedure.query(() => getGoogleCalendarSafeStatus()),
  mappedEventLink: adminProcedure
    .input(z.object({ appointmentId: z.number().int().positive() }))
    .query(({ input }) => getGoogleCalendarAppointmentEventLink(input.appointmentId)),
  listOwnedCalendars: adminProcedure.query(() => listOwnedGoogleCalendars()),
  selectDestination: adminProcedure
    .input(z.object({ calendarId: z.string().trim().min(1).max(512) }))
    .mutation(({ input, ctx }) => selectGoogleCalendarDestination({ calendarId: input.calendarId, userId: ctx.user.id })),
  testConnection: adminProcedure.mutation(async () => {
    await runGoogleCalendarTestLifecycle();
    return { success: true };
  }),
  backfillPreview: adminProcedure.query(() => previewGoogleCalendarBackfill()),
  executeBackfill: adminProcedure.mutation(({ ctx }) => executeGoogleCalendarBackfill(ctx.user.id)),
  disconnect: adminProcedure.mutation(async () => {
    await disconnectGoogleCalendar();
    return { success: true };
  }),
});
