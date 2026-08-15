import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { metaRouter } from "./routers/meta";
import { dashboardRouter } from "./routers/dashboard";
import { patientsRouter } from "./routers/patients";
import { appointmentsRouter } from "./routers/appointments";
import { clinicalRouter, documentsRouter } from "./routers/clinical";
import { financeRouter } from "./routers/finance";
import { reportsRouter } from "./routers/reports";
import { whatsappRouter } from "./routers/whatsapp";
import { aiRouter } from "./routers/ai";
import { marketingRouter, operationsRouter, adminRouter, settingsRouter, searchRouter } from "./routers/ops";
import { intelligenceRouter } from "./routers/intelligence";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  meta: metaRouter,
  dashboard: dashboardRouter,
  patients: patientsRouter,
  appointments: appointmentsRouter,
  clinical: clinicalRouter,
  documents: documentsRouter,
  finance: financeRouter,
  reports: reportsRouter,
  whatsapp: whatsappRouter,
  ai: aiRouter,
  marketing: marketingRouter,
  operations: operationsRouter,
  admin: adminRouter,
  settings: settingsRouter,
  search: searchRouter,
  intelligence: intelligenceRouter,
});

export type AppRouter = typeof appRouter;
