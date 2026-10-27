# AlArabi Inventory — Desktop/offline migration plan

## Status
This branch is an isolated work branch. The production `main` branch and deployed Vercel site are not changed by this plan.

The current app is a React/Vite web app and `src/App.tsx` directly uses Supabase auth and the `app_state` table. Simply wrapping the current site in Electron will NOT make it offline.

## Required implementation stages

1. Preserve current web behavior and make a verified export/backup of existing business records before any migration.
2. Introduce a desktop main process and a narrowly scoped preload API. Do not expose arbitrary Node.js access to the renderer.
3. Add a local SQLite repository for products, quotes, invoices, cash entries, and stock movements. Use transactions for invoice/stock/payment operations.
4. Replace direct Supabase reads/writes in the desktop build with the local repository; keep the web build separate until parity is tested. Do not seed sample data over a real database.
5. Add password protection with a modern password hash, session lock, and safe secret handling.
6. Validate backup/restore format and require a second backup before restore overwrites local records.
7. Preserve Arabic RTL layouts, A4 invoice/quote printing, and Excel/PDF reports. Audit the vulnerable `xlsx@0.18.5` dependency and replace it or isolate and validate inputs before shipping.
8. Add remote read-only monitoring only after local mode is stable. Remote access must use strong authentication, least privilege, encrypted transport, and must not expose SQLite or an unauthenticated endpoint directly to the internet. Remote view is unavailable while the shop PC is offline.
9. Build and test a Windows installer on a Windows environment. Test offline startup, CRUD, invoice stock changes, cash payments, backup/restore, printing, and remote-access denial for unauthorized users.

## Safety constraints
- Do not merge this branch into `main` or deploy it until tested and reviewed.
- Do not run database migrations or write to the existing Supabase production data as part of desktop work.
- Do not commit credentials, local database files, backups, or `.env` files.
- The repository is currently public; consider making it private before adding proprietary code. Never commit customer data or secrets.
- A build succeeding is not proof that offline persistence or accounting invariants work.
