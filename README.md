# Attendance App

A Telegram bot and website that take the chaos out of organising sports training sessions: who is coming, how many spots are left, who is on the waiting list, and who can be called in as a substitute.

Built as a thesis project at the University of Tartu, Narva College (Information Systems Development).

- **Bot:** [@attendance_team2026_bot](https://t.me/attendance_team2026_bot)
- **Website:** https://attendance-app-ten-topaz.vercel.app
- **Languages:** Estonian, Russian, English (bot and website)

---

## The problem

Student sports teams usually coordinate through a group chat. Organisers scroll back through messages to count who answered, chase people one by one, and find out an hour before the session that too few players are coming. This app moves that routine into a bot that does it automatically, with a website for the bigger picture (calendar, member lists, settings).

## Features

**Training polls**
- One-off trainings and recurring schedules (every week, or every 2–4 weeks).
- The bot posts a poll in the team's group chat a configurable number of hours before the session, and sends a reminder later.
- Players answer with buttons: **Going**, **Not going**, **I'll answer later**. People who pick "later" are asked again after an hour.
- Optional player limit: the first N people to say "going" get a spot, the rest are placed in a queue in the order they answered.
- **Bringing guests:** a player can reserve extra spots (1–5) for people they bring; guests count towards the limit.
- Cancelling a training updates the poll.

**Reserve players**
- People outside the main group can join a team as reserves using a separate invite code.
- If a training is short of players, the bot messages reserves privately, one by one in a fixed order, and does not ask the same person twice for the same session.

**Teams and members**
- Create a team, invite players with a code or link, link a Telegram group to the team.
- Two roles: **admin** (organiser) and **player**.
- Organisers can remove members, promote or demote others, and see who has not answered.
- Players can mark themselves as "not counted" and leave a team.

**Organiser alerts**
- Organisers get a private warning when a training is short of players, together with the list of people who have not answered yet.

**Website**
- Sign in through Telegram. Inside Telegram the site opens as a Mini App and logs you in automatically; in a normal browser you confirm the login through the bot.
- Team page with members, trainings, answers and settings.
- Team calendar that shows trainings and other events: tournaments, matches, meetings and anything else.

## How it works

```
 Telegram ──webhook──▶  /api/telegram  ──▶ grammY bot ──┐
                                                         ├──▶ PostgreSQL (Neon)
 Vercel Cron / scheduler ──▶ /api/cron/tick ──▶ runTick ─┤
                                                         │
 Browser / Mini App ──▶ Next.js pages + server actions ──┘
```

The bot and the website share one database, so a change made in either place shows up in the other.

The scheduler ("tick") is a single function that is safe to call any number of times. Each call:

1. creates upcoming trainings from the schedules (14 days ahead);
2. publishes polls whose time has come;
3. sends reminders and warns organisers about missing players;
4. re-asks people who chose "I'll answer later";
5. messages reserve players when a training is short.

Because every step checks what has already been sent, calling it more often never produces duplicates.

## Tech stack

| Part | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Bot | [grammY](https://grammy.dev) |
| Database | PostgreSQL ([Neon](https://neon.tech)) via the `postgres` driver |
| Hosting | Vercel |
| Auth | Signed session cookie (HMAC-SHA256), Telegram login |

## Bot commands

In a private chat with the bot:

| Command | What it does |
|---|---|
| `/start` | Start and see what the bot can do |
| `/newteam Name` | Create a team |
| `/join CODE` | Join a team with an invite code |
| `/invite` | Get an invite link for players |
| `/newtraining` | Create a one-off training (the poll goes to the group) |
| `/newschedule` | Set recurring training days and time |
| `/schedule` | Show the training schedule |
| `/canceltraining` | Cancel a training |
| `/timing` | Choose when polls and reminders are sent |
| `/reserve` | Manage reserve players and their invite code |
| `/members` | Team members (remove, promote, mark yourself as not counted) |
| `/myteams` | Your teams and roles |
| `/leave` | Leave a team |
| `/login` | Sign-in link for the website |
| `/language` | Choose language |
| `/help` | Help and list of commands |

In the team's group chat: `/linkgroup`, `/language`, `/help`.

Use `/help` in the bot for the exact argument format of `/newtraining` and `/newschedule`. A map link can be added at the end, after the place.

## Getting started

### Requirements

- Node.js 20 or newer
- A PostgreSQL database (a free [Neon](https://neon.tech) project works)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Install

```bash
git clone https://github.com/siuzannanevar/Attendance-app.git
cd Attendance-app
npm install
```

### 2. Configure

Create a file named `.env.local` in the project root:

```env
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...        # from @BotFather
TELEGRAM_WEBHOOK_SECRET=long-random-string

# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Website
SESSION_SECRET=another-long-random-string   # signs login cookies
SITE_URL=https://your-site.vercel.app       # public address of the site

# Scheduler
CRON_SECRET=a-third-long-random-string      # protects /api/cron/tick
```

Generate each secret with, for example, `openssl rand -base64 32`. Never commit `.env.local`.

### 3. Create the database tables

The `db/` folder contains numbered SQL migrations. Run them **in order** (`001_…` first) in the Neon SQL editor or with `psql`:

```bash
psql "$DATABASE_URL" -f db/001_init.sql
psql "$DATABASE_URL" -f db/002_trainings.sql
# ...and so on through the last file
```

When you add a new migration, give it the next number and apply it to every environment.

### 4. Run locally

```bash
npm run dev          # website at http://localhost:3000
npm run bot:dev      # bot in polling mode (separate terminal)
```

`bot:dev` removes the webhook and uses long polling, so you do not need a public address while developing. Use a separate test bot token for local work, otherwise you will take over the production bot.

To register the command menu and the "Site" menu button in Telegram, run once and again after editing `src/bot/commands.ts`:

```bash
npm run bot:commands
```

## Deployment (Vercel)

1. Import the repository into Vercel and add all variables from `.env.local` under **Settings → Environment Variables**.
2. Deploy.
3. Point Telegram at the webhook, using the same secret as `TELEGRAM_WEBHOOK_SECRET`:

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://your-site.vercel.app/api/telegram" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

4. Run `npm run bot:commands` once.
5. Add the bot to the team's group chat and run `/linkgroup` there.

### The scheduler

Polls and reminders are sent relative to the training time (for example 48 and 24 hours before), so the tick must run often. In production it is triggered by a job on [cron-job.org](https://console.cron-job.org) that calls the endpoint every few minutes. `vercel.json` also contains a once-a-day Vercel Cron as a fallback. Any scheduler that can send an HTTP request with a header will work:

```
GET https://your-site.vercel.app/api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

The endpoint returns 401 without the correct secret.

## Project structure

```
src/
  app/                 Next.js pages and API routes
    api/telegram/      bot webhook
    api/cron/tick/     scheduler endpoint
    api/auth/          website login (Telegram, Mini App, browser)
    dashboard/         list of the user's teams
    teams/[id]/        team page, server actions for trainings and events
  bot/                 bot logic, one file per area
    i18n.ts            all bot texts in et / ru / en
    commands.ts        command menu
  components/          calendar, header, login components
  lib/                 database, sessions, RSVP and seat logic, scheduler (tick.ts)
db/                    numbered SQL migrations
scripts/               dev-bot.ts (polling), set-commands.ts
```

### Main data model

| Table | Purpose |
|---|---|
| `users`, `teams`, `memberships` | People, teams, and their roles (admin / player) |
| `invite_codes` | Invite codes for players and reserves |
| `schedules`, `trainings` | Recurring rules and the actual sessions |
| `rsvps`, `rsvp_events`, `rsvp_guests` | Answers, answer history, guests |
| `reserve_asks` | Which reserves were already asked for which training |
| `events` | Calendar events: tournament, match, meeting, other |
| `login_links` | One-time links for website sign-in |

## Roadmap

Ideas collected from interviews with team organisers:

- [x] **Map link for places (step 1):** an optional map link (Google Maps, OpenStreetMap…) for trainings, schedule slots and tournaments. In the bot, paste it after the place (`/newtraining 15.10 19:00 12 College gym https://maps.app.goo.gl/…`); on the website there is a separate field. The poll gets an “Open on map” button.
- [ ] **Map for places (step 2):** store coordinates and show a small OpenStreetMap map on the event page and in the calendar.
- [ ] **Payment tracking:** organisers mark who has paid, and the bot privately reminds people how much they owe. Planned as an optional per-team setting, because only some teams charge for training.
- [ ] Automated tests for the seat and queue logic.

## Contributing and feedback

Issues and suggestions are welcome. When changing bot texts, edit `src/bot/i18n.ts` and update all three languages.