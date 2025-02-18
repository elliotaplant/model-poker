import { Table } from "poker-ts";
import type Poker from "poker-ts/dist/facade/poker";
import fs from "fs";
import Handlebars from "handlebars";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Types and interfaces
 */

// Type definitions for poker-ts
interface Pot {
  size: number;
  eligiblePlayers: number[];
}

interface Seat {
  totalChips: number;
  stack: number;
  betSize: number;
}

// Possible poker actions a player can take
type Action = "fold" | "check" | "call" | "bet" | "raise";

// Structure of legal actions available to a player
interface LegalActions {
  actions: Action[];
  chipRange?: { min: number; max: number };
}

// Structure of an action taken by a player
interface TakenAction {
  action: Action;
  betSize?: number;
}

// Player configuration loaded from file
interface PlayerConfig {
  name: string;
  model: string; // LLM model to use for this player
}

// Model player with prompt and template information
interface ModelPlayer {
  name: string;
  index: number; // Seat index at the table
  prompt: string; // Raw Handlebars template as string
  model: string; // LLM model to use
  template: Handlebars.TemplateDelegate; // Compiled template
}

/**
 * Initialize Anthropic client
 */
// Get API key from environment variable
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

/**
 * Initialize poker table and game state
 */
// Create a new poker table with standard blinds
const INITIAL_CHIPS = 1000;
const SMALL_BLIND = 50;
const BIG_BLIND = 100;
const table: Poker = new Table({
  smallBlind: SMALL_BLIND,
  bigBlind: BIG_BLIND,
});

// Create a timestamped filename for game logs
const gameFilePrefix = new Date()
  .toISOString()
  .replace(/:/g, "-")
  .replace(/\..+/, "");
const gameFile = `./games/${gameFilePrefix}.json`;
console.log("Starting game", gameFile);

/**
 * Register Handlebars helpers for prompt templates
 */
// Generate a random number (useful for seed or other randomization in prompts)
Handlebars.registerHelper("randomNumber", () => {
  return Math.round(Math.random() * 100).toString();
});

// Join array elements with comma
Handlebars.registerHelper("join", (arr: string[]) => {
  return arr.join(", ");
});

const players: ModelPlayer[] = [];

async function main(): Promise<void> {
  /**
   * Load players from configuration files
   */

  // Read all player directories
  const playerDirs = fs.readdirSync("./players");

  // Load each player's configuration and prompt template
  for (const dir of playerDirs) {
    // Load and parse player configuration
    const config: PlayerConfig = JSON.parse(
      fs.readFileSync(`./players/${dir}/config.json`, "utf8")
    );

    // Load player's prompt template
    const prompt = fs.readFileSync(
      `./players/${dir}/prompt.handlebars`,
      "utf8"
    );

    // Create player object with compiled template
    const player: ModelPlayer = {
      name: config.name,
      model: config.model,
      index: players.length,
      prompt: prompt,
      template: Handlebars.compile(prompt),
    };

    console.log("Adding player", player.index, player.name, player.model);
    players.push(player);

    // Ensure we don't exceed table capacity
    if (players.length > table.numSeats()) {
      throw new Error(`Too many players (max ${table.numSeats()})`);
    }

    // Seat player at the table with initial chips
    table.sitDown(player.index, INITIAL_CHIPS);
  }

  // Log game start
  logger("game_start", { seats: table.seats() });

  /**
   * Main game loop
   */
  // Loop until only one player remains
  for (
    let handIndex = 1;
    table.seats().filter(Boolean).length > 1;
    handIndex++
  ) {
    // Start a new hand
    table.startHand();
    logger("hand_start", { handIndex, seats: table.seats() });

    // Continue while hand is in progress
    while (table.isHandInProgress()) {
      // Handle all betting rounds
      while (table.isBettingRoundInProgress()) {
        const seatIndex = table.playerToAct();

        // Get the legal actions for current player
        const legalActions: LegalActions = table.legalActions();
        const player = players[seatIndex];
        const cards = table.holeCards()[seatIndex];

        // Get player's action from model
        const { action, betSize } = await getModelAction(table, player);
        const name = player.name;

        // Log the action
        logger("player_action", { name, cards, action, betSize });

        // Apply the action to the table
        table.actionTaken(action, betSize);
      }

      // End the current betting round
      table.endBettingRound();
      logger("end_betting_round", {
        pots: table.pots(),
        communityCards: table.communityCards(),
      });

      // Perform showdown if all betting rounds are completed
      if (table.areBettingRoundsCompleted()) {
        table.showdown();
        const winners = table.winners();
        logger("showdown", { winners });
      }
    }

    // Log the end of the hand
    logger("hand_end", { seats: table.seats() });
  }

  logger("game_end", {
    winner: players[table.seats().findIndex(Boolean)].name,
  });
}

/**
 * Main function to get action for a model player
 */
async function getModelAction(
  table: Poker,
  player: ModelPlayer
): Promise<TakenAction> {
  // Generate template data for the model
  const templateData = createTemplateData(table, player);

  // Generate hydrated prompt for the model
  const hydratedPrompt = player.template(templateData);

  try {
    // Call Anthropic API with the hydrated prompt
    console.log("Calling model with prompt:");
    console.log(hydratedPrompt);

    return await callModel(player, hydratedPrompt, table.legalActions());
  } catch (error) {
    console.error(error);
    // Fall back to random action
    return { action: "fold" };
  }
}

/**
 * Helper function to call the Anthropic model
 */
async function callModel(
  player: ModelPlayer,
  prompt: string,
  legalActions: LegalActions
): Promise<TakenAction> {
  const actionTool: Anthropic.Messages.Tool = {
    name: "take_action",
    description: "Take an action on the poker table",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: legalActions.actions,
          description: "Action to take",
        },
      },
      required: ["action"],
    },
  };

  if (legalActions.chipRange) {
    (actionTool.input_schema.properties as Record<string, any>).betSize = {
      type: "number",
      minimum: legalActions.chipRange.min,
      maximum: legalActions.chipRange.max,
      description:
        'Amount to bet or raise. Required for "bet" and "raise" actions.',
    };
  }

  const response = await anthropic.messages.create({
    model: player.model,
    max_tokens: 2048,
    temperature: 0.7,
    tools: [actionTool],
    system: `You are ${player.name}, an expert poker player making decisions in a Texas Hold'em game.`,
    messages: [{ role: "user", content: prompt }],
  });

  console.log("Model response:");
  console.log(response.content);

  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use" && block.name === "take_action"
  );
  if (!toolUseBlock || toolUseBlock?.type !== "tool_use") {
    // Fold if no tool use
    throw new Error("No tool use block found");
  }

  // Parse block input with zod
  if (legalActions.chipRange) {
    const takenActionSchema = z.object({
      action: z.enum([
        legalActions.actions[0],
        ...legalActions.actions.slice(1),
      ]),
      betSize: z
        .number()
        .min(legalActions.chipRange.min)
        .max(legalActions.chipRange.max)
        .optional(),
    });
    return takenActionSchema.parse(toolUseBlock.input);
  } else {
    const takenActionSchema = z.object({
      action: z.enum([
        legalActions.actions[0],
        ...legalActions.actions.slice(1),
      ]),
    });
    return takenActionSchema.parse(toolUseBlock.input);
  }
}

/**
 * Logger function to record game events to file and console
 */
function logger(event: string, data: Record<string, any> = {}) {
  const obj = { event, ...data };
  console.log(obj);
  // Append event to game log file as JSON line
  fs.appendFileSync(gameFile, JSON.stringify(obj) + "\n");
}

/**
 * Helper function to create template data for the model prompt
 */
function createTemplateData(table: Poker, player: ModelPlayer) {
  return {
    player: {
      name: player.name,
      seatIndex: player.index,
    },
    currentHand: {
      holeCards: table.holeCards()[player.index],
      communityCards: table.communityCards(),
      pots: table.pots().map((pot: Pot) => ({
        size: pot.size,
        eligiblePlayers: pot.eligiblePlayers.map(
          (playerIndex: number) => players[playerIndex].name
        ),
      })),
      legalActions: table.legalActions(),
      round: table.roundOfBetting(),
    },
    game: {
      playerStacks: table
        .seats()
        .filter((_: any, i: number) => i < players.length)
        .map((seat: Seat | null, seatIndex: number) =>
          seat
            ? {
                name: players[seatIndex].name,
                status: "active",
                totalChips: seat.totalChips,
                stack: seat.stack,
                betSize: seat.betSize,
              }
            : {
                name: players[seatIndex].name,
                totalChips: 0,
                status: "eliminated",
              }
        ),
    },
  };
}
main().catch(console.error);
