# Advantage Protocol - Card Counter Blackjack

A browser-based Blackjack simulator focused on card counting, bet ramping, and strategy execution.

## Overview

This project runs entirely in the browser with a simple static server. It includes:

- Simulation mode (5 automated bots)
- Manual mode (you play as Player 1 with live recommended actions)
- Hi-Lo running/true count tracking
- Basic strategy with count-based deviations
- Dynamic bet ramping from true count
- Action log export
- Background music, win sound effects, and whale-alert visual/audio cue on high bet multipliers

## Tech Stack

- HTML (`index.html`)
- CSS (`style.css`)
- Vanilla JavaScript ES Modules (`app.js`)
- PowerShell helper script for local hosting (`start-server.ps1`)

## Quick Start

### 1. Clone

```bash
git clone <your-repo-url>
cd AdvantageProtocol
```

### 2. Start local server (Windows PowerShell)

```powershell
.\start-server.ps1
```

Default URL: `http://localhost:8080`

Use a different port:

```powershell
.\start-server.ps1 -Port 3000
```

### 3. Open in browser

Visit the URL printed in your terminal.

## How To Use

1. Choose a mode from the main menu:
   - `Simulation`: all players are bots.
   - `Manual Play`: you control Player 1 while bots play the rest.
2. Set simulation speed and base bet.
3. Click `Start Auto`.
4. In Manual mode, set your bet and click `Submit Bet` each round, then choose actions (`Hit`, `Stand`, `Double`, `Split`, `Surrender`) when prompted.
5. Use `Save Log` to download a text log of gameplay.

## Game/Strategy Notes

- Shoe: 6 decks
- Dealer: stands on soft 17
- Count system: Hi-Lo
- Strategy: basic strategy + selected count deviations
- Bet ramp by true count:
  - `TC < 1`: 1x
  - `TC >= 1`: 2x
  - `TC >= 2`: 4x
  - `TC >= 3`: 6x

## Project Structure

```text
AdvantageProtocol/
|- index.html
|- style.css
|- app.js
|- start-server.ps1
|- *.wav / *.mp3 assets
|- whale_pic.jpg
```

## Requirements

- A modern browser
- One of:
  - Python (for `python -m http.server`), or
  - Node.js + `npx` (fallback used by `start-server.ps1`)

## Notes

- Card images are loaded from `https://deckofcardsapi.com/static/img/`.
- Audio playback may require user interaction depending on browser autoplay policy.

## License

Add your preferred license (for example, MIT) in a `LICENSE` file.
