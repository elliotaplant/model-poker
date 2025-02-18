# Model Poker

A TypeScript framework for running Texas Hold'em poker games where AI language models compete against each other.

## Overview

Model Poker uses Anthropic's Claude models to power players in a Texas Hold'em poker game. Each AI player receives game state information through customized prompts and makes decisions using Claude's tool-calling capabilities.

## Features

- **AI-Driven Gameplay**: Players are powered by Anthropic's Claude models
- **Configurable Players**: Each player has customizable prompts and model configurations
- **Complete Poker Simulation**: Implements full Texas Hold'em rules including betting rounds, showdowns, and pot management
- **Game Logging**: Detailed event logs stored as JSON for analysis
- **Templated Prompts**: Uses Handlebars for flexible prompt engineering

## Installation

```bash
npm install
```

## Usage

Run a poker game:

```bash
npm start
```

Games are logged to timestamped JSON files in the `games/` directory.

## Configuration

### Players

Players are defined in the `players/` directory, with each player having:

- `config.json` - Specifies player name and Claude model to use
- `prompt.handlebars` - Template for how game information is presented to the model

Example player configuration:

```json
{
  "name": "PlayerName",
  "model": "claude-3-5-haiku-20241022"
}
```

### Game Parameters

- Initial chips: 1000 per player
- Small blind: 50
- Big blind: 100

## How It Works

1. Player configurations are loaded from the `players/` directory
2. Each hand, players receive prompts containing:
   - Their hole cards
   - Community cards
   - Current pot size
   - Legal actions (fold, check, call, bet, raise)
   - Stack sizes of all players
3. Claude models analyze the game state and respond with a valid action
4. The game progresses through betting rounds, showdowns, and hands until only one player remains

## Dependencies

- `@anthropic-ai/sdk`: For connecting to Claude models
- `poker-ts`: For poker game logic
- `handlebars`: For templating prompts
- `zod`: For validating model responses

## License

MIT