# Discord Payout Bot

## Overview

A Discord bot application for managing payout requests within Discord servers. The bot provides slash commands for setting up request and log channels, with an automated approval workflow system. The application includes a web dashboard for bot setup and status monitoring.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (new-york style)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend is a single-page application located in `client/src/` with a Discord-themed UI that mimics Discord's color palette and styling conventions.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (transpiled with tsx for development, esbuild for production)
- **API Design**: RESTful endpoints under `/api/` prefix
- **Discord Integration**: discord.js library for bot functionality

The server handles both the web API and Discord bot in a single process. The Express server serves the static frontend in production and proxies to Vite in development.

### Database Layer
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (connection via `DATABASE_URL` environment variable)
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Stored in `migrations/` directory, managed via `drizzle-kit push`

### Key Design Patterns
- **Shared Types**: The `shared/` directory contains schema definitions and types used by both frontend and backend
- **Storage Abstraction**: `server/storage.ts` provides a `DatabaseStorage` class implementing `IStorage` interface for database operations
- **Path Aliases**: TypeScript path aliases (`@/`, `@shared/`, `@assets/`) for clean imports

### Build Process
- Development: Vite dev server with HMR for frontend, tsx for backend
- Production: Custom build script (`script/build.ts`) using Vite for frontend and esbuild for backend bundling

## External Dependencies

### Discord Bot
- Requires `DISCORD_BOT_TOKEN` environment variable
- Requires `DISCORD_APPLICATION_ID` environment variable
- Uses discord.js v14 with Gateway Intents for Guilds, GuildMessages, and DirectMessages
- DM message caching: Stores last 50 messages per user to enable delete/edit tracking

## Recent Changes (January 2026)

### Quiz Progress Logging
- Added `/setup_quiz_log` command to configure a channel for quiz progress logging
- Logs when users start quizzes, progress through each question, and complete quizzes
- Uses dynamic question count from questions array (not hardcoded)
- Schema field: `quizLogChannelId` in guildConfigs table

### Modmail DM Edit/Delete Tracking
- Implemented DM message cache (50 messages per user) to track edits/deletes
- Delete tracking shows deleted content on staff side without actually deleting from thread
- Edit tracking shows before/after content for message edits
- Handles partial messages gracefully with cache fallback

### Database
- PostgreSQL database required
- Connection string via `DATABASE_URL` environment variable
- Uses `connect-pg-simple` for session storage capability

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `DISCORD_BOT_TOKEN`: Discord bot authentication token
- `DISCORD_APPLICATION_ID`: Discord application ID for invite URL generation