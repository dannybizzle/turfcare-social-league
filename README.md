# Turfcare Social Games League

Static Cloudflare Pages frontend connected to the league's Supabase project.

## Included in this milestone
- Public league homepage, standings, matchup list, and deadline countdown
- Supabase email/password sign-in and password-reset request
- Admin-only dashboard visibility based on the signed-in profile role
- Create season records
- Randomized full-season round-robin schedule preview
- Repeat opponents avoided until unique pairings are exhausted
- Rotating byes when the number of registered players is odd
- Three different randomly selected disciplines per matchup
- Explicit approval before schedule publication
- Transactional schedule publishing through the secure Supabase RPC in `supabase/schedule_generator.sql`

## Important limitations
This is an incremental milestone, not the complete league management system. Player invitations/account creation, player score submission, profile pages, automated missed-matchup processing, and full player-management controls are not included yet. Test the schedule preview and publishing with a test season before relying on it for a live competition.

The Supabase publishable key in `index.html` is intended for browser use. Never add a Supabase secret/service-role key to this repository.

## Deploy
Cloudflare Pages can deploy this repository as a static site. Build command: leave blank. Build output directory: `/` (root).

## Database update for this milestone
Run `supabase/schedule_generator.sql` in the Supabase SQL Editor while signed in as the project owner. It adds one admin-checked RPC function. It does not replace or modify the existing tables. The function refuses to publish into a season that already has matchups.
