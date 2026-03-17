# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean-language inventory management web application for tracking products (wafers, targets, gas, equipment), inventory transactions (입고/출고/불출), barcode scanning, and target material lifecycle.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript (strict mode)
- **UI**: React 19, Tailwind CSS 4, Lucide React icons
- **Database**: PostgreSQL via Prisma 7 ORM with PrismaPg adapter
- **Path alias**: `@/*` maps to project root

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npx prisma migrate dev    # Run database migrations
npx prisma generate       # Regenerate Prisma client
npx tsx prisma/seed.ts    # Seed database
```

No test framework is configured.

## Architecture

### Frontend: Single-Page App Pattern

`app/page.tsx` is the sole page — it renders a `Sidebar` and swaps page components based on a `PageId` state variable. Navigation is client-side state, not file-based routing. Page components live in `components/` (e.g., `InventoryPage.tsx`, `DashboardPage.tsx`).

State management is plain `useState` — no Redux/Zustand/Context. The custom `useApi` hook (`lib/useApi.ts`) wraps `fetch` with loading/error states.

### Backend: Next.js API Routes

All API endpoints are in `app/api/` as RESTful route handlers. They use Prisma directly — no service layer or middleware. Key endpoints:

- `/api/inventory` — transaction CRUD with filters
- `/api/items`, `/api/partners` — master data CRUD
- `/api/dashboard` — KPI aggregates
- `/api/status` — current inventory holdings
- `/api/targets` — target unit tracking with measurement logs
- `/api/barcodes` — barcode lookup
- `/api/admin/users` — user permission management

### Data Layer

Prisma schema (`prisma/schema.prisma`) defines 13 models. Core domain models:

- **InventoryTx** — central transaction record linking Item, Partner, and optionally TargetUnit
- **TargetUnit** / **TargetLog** — lifecycle tracking for individual target materials (status: available → using → disposed)
- **Barcode** — links to either Item or TargetUnit
- **UserPermission** — resource-based access control (canView/canEdit per resource)
- **AuditLog** — change history tracking

Prisma client singleton is in `lib/prisma.ts`. Shared types, constants, and formatters are in `lib/data.ts`.

### Authentication

Scaffolded but not fully implemented. User model has googleId field for Google OAuth. Role-based (admin/employee) + resource-based permissions exist in the schema.

## Key Conventions

- UI text and labels are in Korean
- Transaction types: 입고 (inbound), 출고 (outbound), 불출 (disbursal)
- API routes use `NextResponse.json()` with try/catch error handling
- Prisma queries use AND arrays for complex WHERE conditions and `include` for eager loading
