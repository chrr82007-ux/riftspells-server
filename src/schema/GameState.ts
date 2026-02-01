import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

// Types
export type MatchPhase = "planning" | "resolving" | "results" | "gameOver";
export type CardType = "offense" | "defense" | "support";

// Card Schema
export class Card extends Schema {
    @type("string") id: string = "";
    @type("string") templateId: string = "";
    @type("string") name: string = "";
    @type("number") cost: number = 0;
    @type("string") type: CardType = "offense";
    @type("number") value: number = 0;
    @type("string") description: string = "";
}

// RoundResult Schema (for showing what happened)
export class RoundResult extends Schema {
    @type("number") slotIndex: number = 0;
    @type(Card) playerCard: Card = new Card();
    @type(Card) opponentCard: Card = new Card();
    @type("string") interaction: string = ""; // "clash", "counter", "breaker", "outwit"
    @type("number") damageDealt: number = 0;
    @type("number") damageTaken: number = 0;
    @type("string") log: string = "";
}

// Player Schema
export class Player extends Schema {
    @type("string") id: string = "";
    @type("string") username: string = "";
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") shield: number = 0;
    @type("number") mana: number = 3;
    @type("number") maxMana: number = 10;
    @type([Card]) hand = new ArraySchema<Card>();
    @type([Card]) slots = new ArraySchema<Card>(); // Fixed size 3 usually, but dynamic here
    @type("boolean") confirmed: boolean = false;
    @type("number") handCount: number = 0; // For opponent view
}

// Main Game State Schema
export class GameRoomState extends Schema {
    @type("string") roomCode: string = "";
    @type("string") phase: MatchPhase = "planning";
    @type("number") turnTimer: number = 30;
    @type(Player) player1: Player = new Player(); // Use specific slots for P1/P2
    @type(Player) player2: Player = new Player();
    @type("number") currentTurn: number = 1;
    @type([RoundResult]) lastRoundResults = new ArraySchema<RoundResult>();
    @type("string") winnerId: string = "";
}
