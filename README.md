# Quizbuzz Ops

Quizbuzz Ops is the internal operations and administration dashboard for the Quizbuzz platform.

## Overview

This application is built with **Next.js 15 (App Router)** and provides essential tools for managing the Quizbuzz platform, including billing, user management, and dashboard analytics. It leverages a modern tech stack to ensure high performance, reliability, and ease of development.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React 19)
- **Database ORM**: [Prisma](https://www.prisma.io/) (PostgreSQL)
- **Background Jobs**: [BullMQ](https://docs.bullmq.io/) backed by [Redis](https://redis.io/)
- **Authentication**: Custom authentication (using bcryptjs)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Forms & Validation**: [React Hook Form](https://react-hook-form.com/) & [Zod](https://zod.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Motion](https://motion.dev/)

## Project Structure

- `/app`: Next.js App Router containing pages and API routes (`/dashboard`, `/billing`, `/login`, etc.)
- `/components`: Reusable React components for the UI
- `/lib`: Utility functions, configuration, and shared code
- `/prisma`: Prisma schema, migrations, and database seed scripts
- `/server`: Server-side logic, controllers, and services
- `/scripts`: Standalone scripts like the background job worker (`worker.ts`)
- `/public`: Static assets (images, fonts, etc.)
- `/docs`: Additional documentation

## Getting Started

### Prerequisites

Ensure you have the following installed:
- Node.js (v18 or higher recommended)
- PostgreSQL
- Redis

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Copy the example environment file and update it with your local settings (Database URL, Redis connection string, etc.).
   ```bash
   cp .env.production.example .env
   ```

3. **Database Setup:**
   Run Prisma migrations and optionally seed the database:
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000` (or `http://localhost:3010` if started using `npm start`).

5. **Start the Background Worker:**
   In a separate terminal, start the BullMQ background worker to process asynchronous jobs:
   ```bash
   npm run worker
   ```

## Docker / Production

The project includes Docker configuration for production deployment:
- `docker-compose.yml`: For running the complete stack (app, db, redis) in containers.
- `Dockerfile`: Multi-stage build for the Next.js application.
- `nginx/`: Nginx configuration for reverse proxying.

To build and run in production mode locally:
```bash
npm run build
npm run start
```
