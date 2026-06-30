# Flow

Personal finance dashboard for tracking spending, income, net worth, and savings across multiple currencies and accounts.

## Setup

1. Clone the repo
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase and Anthropic API keys
4. Run the Supabase migration: `supabase db push` (or apply `supabase/migrations/001_initial_schema.sql` manually)
5. `npm run dev`

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Recharts
- Claude API (transaction categorisation)
