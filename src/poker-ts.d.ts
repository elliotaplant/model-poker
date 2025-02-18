// Written manually, but should be pulled from package
declare module "poker-ts/dist/facade/poker" {
  export interface Card {
    rank: string;
    suit: string;
  }

  export interface PokerTable {
    numSeats(): number;
    sitDown(index: number, chips: number): void;
    seats(): (any | null)[];
    startHand(): void;
    isHandInProgress(): boolean;
    isBettingRoundInProgress(): boolean;
    playerToAct(): number;
    legalActions(): any;
    holeCards(): (Card[] | null)[];
    actionTaken(action: string, betSize?: number): void;
    endBettingRound(): void;
    pots(): any[];
    communityCards(): Card[];
    areBettingRoundsCompleted(): boolean;
    showdown(): void;
    winners(): any[];
    roundOfBetting(): string;
  }

  export default PokerTable;
}

declare module "types/seat-index" {
  export type SeatIndex = number;
}

declare module "types/chips" {
  export type Chips = number;
}

declare module "types/hole-cards" {
  import { Card } from "poker-ts/dist/facade/poker";
  export type HoleCards = Card[];
}
