import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

// Element types
export type ElementType = "fire" | "ice" | "wind" | "earth" | "lightning" | "shadow";

// Match phases
export type MatchPhase = "lobby" | "sigilSelect" | "countdown" | "combat" | "roundEnd" | "bonusSelect" | "matchEnd";

// Sigil types
export type SigilType = "cascade" | "echo" | "stability" | "fracture" | "harvest" | "greed";

// Bonus types
export type BonusType = "powerSurge" | "quickCast" | "forgeMastery";

// Element Orb Schema
export class ElementOrb extends Schema {
    @type("string") id: string = "";
    @type("string") element: ElementType = "fire";
    @type("number") x: number = 0;
    @type("number") y: number = 0;
}

// Spell Schema
export class Spell extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    @type(["string"]) elements = new ArraySchema<string>();
    @type("number") maxCharges: number = 2;
    @type("number") currentCharges: number = 2;
    @type("number") cooldownSeconds: number = 5;
    @type("number") currentCooldown: number = 0;
    @type("number") duration: number = 4;
    @type("number") radius: number = 40;
    @type("number") damagePerSecond: number = 5;
}

// Zone Schema
export class Zone extends Schema {
    @type("string") id: string = "";
    @type("string") spellId: string = "";
    @type("string") ownerId: string = "";
    @type("string") primaryElement: ElementType = "fire";
    @type("string") secondaryElement: string = ""; // Optional
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") radius: number = 40;
    @type("number") remainingDuration: number = 4;
    @type("number") damagePerSecond: number = 5;
}

// Player Schema
export class Player extends Schema {
    @type("string") id: string = "";
    @type("string") username: string = "";
    @type("string") selectedSigil: SigilType | "" = "";
    @type(["string"]) forgeQueue = new ArraySchema<string>(); // Element names
    @type([Spell]) spellSlots = new ArraySchema<Spell>();
    @type("number") crystalHealth: number = 100;
    @type("number") dispelCooldown: number = 0;
    @type("number") roundsWon: number = 0;
    @type("boolean") isReady: boolean = false;
    @type("string") selectedBonus: BonusType | "" = "";
}

// Main Game State Schema
export class GameRoomState extends Schema {
    @type("string") roomCode: string = "";
    @type("string") phase: MatchPhase = "lobby";
    @type(Player) player1?: Player;
    @type(Player) player2?: Player;
    @type([ElementOrb]) orbs = new ArraySchema<ElementOrb>();
    @type([Zone]) zones = new ArraySchema<Zone>();
    @type("number") currentRound: number = 1;
    @type("number") roundTimer: number = 180;
    @type("number") countdownTimer: number = 3;
    @type("number") arenaWidth: number = 400;
    @type("number") arenaHeight: number = 600;
    @type("number") suddenDeathShrink: number = 0;
    @type("string") winnerId: string = "";
}
