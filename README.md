# Turfcare Social Games League

Static Cloudflare Pages frontend connected to the league's Supabase project.

## Current included features
- Public league homepage and four-discipline theme
- Public standings calculated from completed matchups and individual game winners
- Public matchup list and deadline countdown
- Supabase email/password sign-in and password-reset request

## Important
This is the first deployable frontend milestone, not the complete league management system. Score submission, invitation-only registration, organizer tools, automated missed-matchup processing, and season scheduling are not enabled yet. Do not announce this as a finished league site until those are implemented and tested.

The Supabase publishable key in `index.html` is intended for browser use. Never add a Supabase secret/service-role key to this repository.

## Deploy
Cloudflare Pages can deploy this repository as a static site. Build command: leave blank. Build output directory: `/` (root).
