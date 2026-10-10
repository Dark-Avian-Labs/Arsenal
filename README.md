<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# Arsenal

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

Arsenal is the Dark Avian Labs web apps in one checkout. Five of them are hosted. The sixth is the empty shell a new one starts from.

One Dark Avian Labs account opens all of them. The left rail jumps between the sites, and lists Sentinel only when that account has Sentinel admin access. Codex, Armory, Outfitter, and BudgetPlanner are for players and for the household. Sentinel is the dashboard for the person running the fleet, and a normal sign-in is not enough to open it.

| App                             | What it is                                                         | Live                                                               |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [Codex](#codex)                 | Collection tracker for Warframe, Epic Seven, and Watcher of Realms | [codex.darkavianlabs.com](https://codex.darkavianlabs.com)         |
| [Armory](#armory)               | Warframe mod builder                                               | [armory.darkavianlabs.com](https://armory.darkavianlabs.com)       |
| [Outfitter](#outfitter)         | Watcher of Realms gear stash and loadout search                    | [outfitter.darkavianlabs.com](https://outfitter.darkavianlabs.com) |
| [BudgetPlanner](#budgetplanner) | Household ledger for bills, income, and credits                    | [budget.darkavianlabs.com](https://budget.darkavianlabs.com)       |
| [Sentinel](#sentinel)           | Charts for the Node apps running under PM2                         | [sentinel.darkavianlabs.com](https://sentinel.darkavianlabs.com)   |
| [AppBase](#appbase)             | The empty house a new app copies                                   | not hosted                                                         |

Codex is the catalog. Armory reads its Warframe list. Outfitter reads its Watcher of Realms list. Epic Seven stays inside Codex.

## Codex

A collection tracker. You sign in, pick a game, and mark what you own. A frame still waiting on a level, an Epic Seven hero on the way to SSS, and a Watcher of Realms artifact waiting on a promotion each get their own columns. The sheet is meant to survive a new patch, and a second account.

**Separate lists.** Warframe covers frames, weapons, companions, arcanes, and smaller categories like K-Drives. Epic Seven is heroes and artifacts. Watcher of Realms is heroes, artifacts, and demons. Search, filters, and a done-count sit on whichever list is open.

**Progress you click through.** Warframe cells go blank, Obtained, Complete, plus a Helminth mark on frames that can be subsumed. Advanced mode tracks rank for the normal version and the Prime. Epic Seven heroes step through imprint ratings up to SSS, and artifacts step through gauge levels. Watcher of Realms tracks ownership, then awakening, promotion, or level.

**Hide completed rows.** On Warframe and Watcher of Realms, finished items can drop off the list. Search brings them back.

**Named alts.** Epic Seven and Watcher of Realms can hold several accounts, and the checkmarks stay with the one you switch to. Warframe keeps one sheet per sign-in.

**warframe.market links.** A toggle adds a link on items that have a listing.

Codex keeps your account id and the progress you mark. Email and display name stay with the sign-in service. The sheet is private to your sign-in. New items appear after a catalog import, which is an admin step. A drop from this morning can be missing until the next refresh.

## Armory

A Warframe mod builder that feels closer to the in-game Arsenal than to a spreadsheet. Pick a frame or weapon, stack the mods, and save the result so the next mission is a click away. The extra stats, Helminth choices, and shard layouts the in-game screen does not keep around live here.

**A builder for the whole kit.** Frames, weapons, companions, and the rest of the arsenal open in the same mod screen. Helminth replacements, Archon shards, Incarnon upgrades, and rivens sit on that build.

**Named builds and loadouts.** A build is one item. A loadout groups the pieces you actually take on a mission. Favorites keep the ones you reuse at the top.

**Public, unlisted, or private.** Public builds show up in the catalog for that item. Unlisted builds open from the link. Private ones stay on your account. A share image can carry a background you pick, which is the version people post.

**Foil on the odd mods.** Atragraph mods get a holo pass on the card, so the weird ones are easy to spot in a full grid.

Public builds are open to anyone. Saving your own, favorites, and private builds need an account. The item list is a copy of Codex's Warframe catalog. A fresh copy starts empty and fills when you sync that database. Until the sync has run, the builder has nothing to pick.

## Outfitter

A Watcher of Realms stash you can search. Drop mythic gear and artifacts in, set the stat floors you care about, and let it look for a loadout that hits them. The alternative is opening the inventory, squinting at substats, and swapping pieces one slot at a time.

**A stash with the rolls visible.** Gear and artifacts keep their sets, prefixes, and substats. Gauges make a good roll obvious before you open the piece.

**One outfit per hero.** The search saves a single loadout on that hero. The next swap is the saved outfit. A piece already equipped on someone else stays put.

**Floors and sets.** You set minimum stats and can force a set. If nothing fits, the page says so and tells you to relax a floor or add more gear.

**Paste a screenshot.** Ctrl+V on the add dialog reads the gear or artifact shot and fills type, set, prefix, and stats. You still check the numbers.

Names, portraits, and the level 60 combat bases come from Codex's Watcher of Realms catalog. Outfitter does not keep a second hero list. The stash stays on your sign-in. A fresh copy has no heroes until `CODEX_WOR_DB_PATH` points at a `wor-catalog.db` from a Codex that has already imported Watcher of Realms.

## BudgetPlanner

The household ledger for recurring bills, income, and credits. You keep one plan, see what is actually due this month, and hand someone else a link when they need to look at it too. The argument can be about the number on the screen, on a phone, at the table.

**One plan, three kinds of money.** Expenses, income, and credits live in the same list. Credits can carry an end date and a final installment, so a loan does not look like a bill that lasts forever.

**Cadence that matches the bill.** Monthly, quarterly, twice a year, or yearly. The this-month totals only count what falls in the current calendar month. The rest of the year stays on the row so you can still see it coming.

**A link instead of a shared login.** Invite someone by email as a viewer or an editor. The app gives you a link to send. An invited plan can be the one that opens by default. The other person still signs in with their own account before it opens. A viewer can read the plan. An editor can change entries.

**English and German.** The language follows the browser, and a switcher in the app changes it. Amounts use the currency set on the plan. There is a print view when the table needs paper.

## Sentinel

The dashboard for the Node apps Dark Avian Labs runs under PM2. CPU, memory, HTTP latency, event-loop lag, and restarts show up as charts on the machine that hosts the fleet. It is the page you open when something feels slow, without standing up a second monitoring stack.

**A fleet list.** Each app shows how many restarts and crashes it had in the last day. Open one for the charts.

**The numbers that explain a stall.** CPU and memory sit next to HTTP p95 latency and event-loop lag. A process can look idle on CPU and still be late on requests. Both are on the same page.

**Restarts and crashes, split apart.** A clean restart and a crash are different events. The app page lists them for the time range you picked.

**Samples from the apps themselves.** Hosted apps post metrics to `/api/ingest`. A PM2 bridge on the server host can do the same. The charts are whatever those samples contain.

The dashboard is limited to admin accounts. Ping and error digests stay in pm2-discord. The charts stay empty until something posts a sample. A fresh install shows that empty state on purpose. Sentinel only sees processes that can reach its ingest URL, so it belongs on the host that runs the fleet, or somewhere those agents can post to.

## AppBase

The empty house a new Dark Avian Labs web app starts from. Glass panels, an Express API, a Vite client, Clerk sign-in, and the same buttons you see on Codex and Armory. The product features stay out on purpose, so the next app copies a finished shell instead of a half-built Codex.

The shell is `@dark-avian-labs/ui`. The HTTP stack is `@dark-avian-labs/server-kit`. Change them once. The package name in this repo is `dal-template`, under `apps/_template`. Nobody is meant to use an AppBase deployment as a product.

## Layout

```
apps/armory
apps/budget-planner
apps/codex
apps/outfitter
apps/sentinel
apps/_template          AppBase
packages/server-kit     HTTP stack shared by the apps
packages/ui             the shell
packages/config         shared TypeScript config
packages/sentinel-agent in-process metrics agent
```

Each hosted app keeps its own version. The root package, `dark-avian-labs-apps`, stays at `1.0.0`.

## Self-hosting

Node 26 or newer, and pnpm 12.10.1. From this directory:

```
pnpm install
pnpm --filter <app> dev
```

`<app>` is `codex`, `armory`, `outfitter`, `budget-planner`, `sentinel`, or `dal-template`. `dev` starts the API. `dev:client` starts Vite. Copy that app's `.env.example` to `.env.development` first. Clerk keys can stay empty for local dev on most of them. Production refuses to boot without them.

A hosted process needs `NODE_ENV=production` and `.env.production`. Fill the `VITE_` values before `pnpm --filter <app> run build`. The client bundle reads them at build time.

A few apps want an extra step:

**Codex.** `pnpm --filter codex start` looks for `.env.production` and will not boot without it. `pnpm --filter codex run db:init` loads the schemas. An empty Warframe catalog starts an import on first boot, which needs outbound network and takes a while. Watcher of Realms comes up from a fixture in the repo. `pnpm --filter codex run wor:import` replaces it with a full pull. Epic Seven starts empty. Heroes and artifacts are added from the admin pages.

**Armory.** `pnpm --filter armory start` leaves `NODE_ENV` unset, so it reads `.env.development`. `pnpm --filter armory run catalog:sync` copies Codex's Warframe catalog in. `CODEX_WARFRAME_CATALOG_DB_PATH` has to point at a real Codex database.

**Outfitter.** Without the Codex catalog file, the hero list stays empty no matter how the app is built.

**BudgetPlanner.** `pnpm --filter budget-planner run build` stops if `.env.production` is missing or still encrypted. `pnpm --filter budget-planner start` keeps reading `.env.development` until `NODE_ENV=production`.

**Sentinel.** Set `SENTINEL_INGEST_TOKEN` and give that same token to each app you want on the charts.

`pnpm run validate` at the root runs format, lint, typecheck, and tests.

## License

MIT. Copyright 2026 Lutz Schwemer Panchez.
