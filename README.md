This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Automatización de temporada

El proyecto incluye un cron backend en `app/api/cron/season-tick/route.ts` que ejecuta:

- Precálculo automático del replay antes de la hora oficial del partido.
- Cierre oficial de partidos con `played = false` y `match_date <= now`.
- Generación de cruces de playoff y cierre automático de temporada al terminar las finales.
- Ascensos/descensos, conservación del histórico de temporada y activación del Draft de Temporada para clubes de usuario.
- Mantenimiento semanal (forma + reset de entrenos) mediante la RPC `run_weekly_maintenance`.
- Cálculo de finanzas semanal (salarios + mantenimiento) ejecutado directamente en el endpoint (TypeScript).

### Variables de entorno requeridas

- `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (obligatoria para las páginas cliente que usan Supabase)
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (recomendado en producción)
- `GITHUB_TOKEN` (necesario para `POST /api/github/sync` desde `/admin`)
- `SCHEDULED_MATCH_PREP_MINUTES` (opcional, por defecto `15`)

### Cron en Vercel

En `vercel.json` está configurado para ejecutarse una vez al día y ser compatible con Vercel Hobby:

- `path`: `/api/cron/season-tick`
- `schedule`: `0 3 * * *`

Vercel enviará `Authorization: Bearer <CRON_SECRET>` si defines `CRON_SECRET` en el proyecto.

Si despliegas en Vercel Pro/Enterprise y necesitas preparar/cerrar partidos cerca de su hora oficial, puedes cambiar el cron a `* * * * *`.

En despliegues donde el cron no tenga suficiente frecuencia, la app dispara además un fallback autenticado en `POST /api/automation/pulse` al entrar en `/calendar` y `/match` para preparar/cerrar partidos oficiales cercanos a su hora.

### SQL necesario

Aplica las migraciones de `db/migrations`, en especial:

- `20260302_automation_scheduler.sql`
- `20260314_prepare_scheduled_match_replays.sql`
- `20260304_add_github_integration_config.sql`

Esa migración añade:

- `match_date` en `matches` (con trigger/autocálculo por jornada).
- Precálculo de replay en `matches` (`simulated_*`) para emitir en directo sin adelantar clasificaciones.
- `automation_runs` para idempotencia.
- Función `run_weekly_maintenance(boolean)` para el cierre semanal (forma y entrenos).

La migración `20260427_add_match_seasons.sql` añade `season_number` a `matches`: los partidos existentes quedan como Temporada 1 y los nuevos calendarios se generan como Temporada 2, 3, etc. El cierre de temporada ya no borra partidos anteriores.
