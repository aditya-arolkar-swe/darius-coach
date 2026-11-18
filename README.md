<p align="center">
  <img src="public/darius.png" width="96" alt="Darius" />
</p>

<h1 align="center">Darius Coach</h1>

<p align="center"><b>A matchup coach for Darius players, built for the draft pick stage.</b></p>

<p align="center"><img src="docs/darius-splash.jpg" width="640" alt="Darius splash art" /></p>

## Why I made this

I main Darius top lane and sometimes play him in the jungle. During champion select I kept doing the same thing: googling "*{champion}* abilities", digging through the League of Legends Wiki for the one section I needed, and trying to remember how that matchup works, all before the timer ran out.

Darius Coach puts that into a single screen. Once I see what I'm laning against in draft, I:

1. **Search the enemy champion** and get their Abilities section exactly as it looks on the wiki, with the wiki's hover previews (hover *silence* to see what it does), but without the ads, nav or sidebars.
2. **Ask the coach** "How should I play Darius into them? What should I build?" and get **3 quick tips** (game plan, the ability to respect, item build) before the game loads.
3. **Ask follow-ups** when I have time. After every answer the coach suggests the 3 questions I'm most likely to ask next, so it leads the conversation and I just click one.

The coach is personal. It reads my **Playbook**: my own habits and preferences, such as which jungle camp I ward to track the enemy jungler, preferring Youmuu's Ghostblade over Stridebreaker, and building crit when it's viable. Its advice fits how I actually play instead of a generic guide.

## Features

- **Searchable champion picker** using Riot's Data Dragon champion list.
- **Wiki-accurate ability breakdowns**: only the Abilities section, rendered with the wiki's own styles. Hovering a keyword, ability, item or champion shows the same tooltip as the wiki, and the Notes tabs and ◄ ► value toggles work too.
- **AI matchup coach** (Claude). Its prompt includes the exact ability text for Darius and the opponent, plus the Top/Jungle role. It only answers when you click Send.
- **Coach-suggested follow-ups**: after each reply, Claude predicts the 3 questions you'll most likely ask next and shows them as one-click chips (they fill the input; you still press Send).
- **Answer cache**: asking the exact same thing again (same matchup, role, playbook, patch and conversation) replays the saved answer instantly instead of spending tokens. Suggested questions are cached the same way.
- **Playbook**: add, edit or delete your habits in the sidebar. They are saved to `data/knowledge.json` and sent to the coach with every message.

## Run it

```bash
pnpm install
pnpm start          # → http://localhost:3000
```

### Connecting Claude

| Option | What it uses | Setup |
|---|---|---|
| **A. Your Claude account (default)** | Your Claude Pro/Max subscription, through the `claude` CLI | Install [Claude Code](https://claude.com/claude-code) and run `claude` once to log in. No API key needed. |
| **B. API key** | Pay-per-use billing on the Claude Console | `cp .env.example .env`, then set `ANTHROPIC_API_KEY=...` |

When an API key is present, option B is used. Optional settings: `CHAT_PROVIDER=cli|api`, `CLAUDE_MODEL` (default `claude-opus-5-5`), `CLAUDE_EFFORT` (default `medium`), `PORT`, `PLAYBOOK_FILE`, `CACHE_DIR` (default `data/cache`; delete it to force a fresh download).

## How it works

| Path | Role |
|---|---|
| `server/champions.js` | Champion list from Riot Data Dragon |
| `server/wiki.js` | Fetches only the "Abilities" section through the wiki's MediaWiki API |
| `server/diskCache.js` | Saves fetched abilities and tooltips to `data/cache/`, so each is downloaded once per patch and loads instantly after that, even across restarts |
| `server/wikiHtml.js` | Sanitizes wiki HTML (no scripts, iframes or event handlers) and points links and images back to the wiki |
| `server/embed.js` | Serves the Abilities section as a standalone page with the wiki's stylesheets and a strict content security policy |
| `server/tooltip.js` | Renders the wiki's `{{Tooltip/...}}` templates (allowlist only) for hover previews |
| `public/embed/embed.js` | Plain-JS versions of the wiki's tooltip, tab, flip-text and skill-tab scripts |
| `server/answerCache.js` | Saves coach answers and suggested questions to `data/cache/answers/`, keyed by a hash of the full prompt and conversation |
| `server/knowledge.js` | Playbook storage (JSON file) |
| `server/prompt.js` | Coach system prompt: abilities + playbook + answer format |
| `server/suggestions.js` | Prompt and validation for the coach's suggested next questions (structured output) |
| `server/providers/` | Claude through the Anthropic SDK (`api.js`) or the `claude` CLI (`cli.js`) |
| `public/` | Plain HTML, CSS and JS with no build step |

```bash
pnpm test
```

## Credits

Ability data comes from the [League of Legends Wiki](https://wiki.leagueoflegends.com/) (CC BY-SA). Champion art and data come from Riot Games' Data Dragon.

Darius Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
