import { Room, Client, Delayed } from "colyseus";
import { v4 as uuidv4 } from "uuid";
import { ArraySchema } from "@colyseus/schema";
import {
    GameRoomState,
    Player,
    Card,
    RoundResult,
    MatchPhase,
    CardType
} from "../schema/GameState";

// Card Database (Simplified for prototype)
const CARD_TEMPLATES = [
    { id: 'strike', name: 'Strike', cost: 1, type: 'offense', value: 10, desc: 'Deal 10 Damage' },
    { id: 'heavy_swing', name: 'Heavy Swing', cost: 2, type: 'offense', value: 25, desc: 'Deal 25 Damage' },
    { id: 'block', name: 'Block', cost: 1, type: 'defense', value: 10, desc: 'Block 10 Damage' },
    { id: 'fortify', name: 'Fortify', cost: 2, type: 'defense', value: 20, desc: 'Gain 20 Shield' },
    { id: 'heal', name: 'Heal', cost: 2, type: 'support', value: 15, desc: 'Restore 15 HP' },
    { id: 'execute', name: 'Execute', cost: 3, type: 'offense', value: 40, desc: 'Deal 40 Damage' },
];

export class GameRoom extends Room<GameRoomState> {
    private turnTimerInterval?: Delayed;

    onCreate(options: any) {
        this.setState(new GameRoomState());
        this.state.roomCode = this.generateRoomCode();
        this.maxClients = 2;

        console.log(`Card Game Room created: ${this.state.roomCode}`);

        // Message Handlers
        this.onMessage("submitHand", (client, message) => this.handleSubmitHand(client, message));
        this.onMessage("emote", (client, message) => this.handleEmote(client, message));
    }

    onJoin(client: Client, options: { username?: string } = {}) {
        const player = new Player();
        player.id = client.sessionId;
        player.username = options.username || `Player ${this.clients.length}`;
        player.hp = 100;
        player.mana = 3;

        // Initial Hand
        this.drawCards(player, 5);

        if (this.clients.length === 1) {
            this.state.player1 = player;
        } else if (this.clients.length === 2) {
            this.state.player2 = player;
            this.startGame();
        }

        console.log(`${player.username} joined.`);
        this.broadcastState();
    }

    startGame() {
        this.state.phase = "planning";
        this.state.currentTurn = 1;
        this.startTurnTimer();
    }

    startTurnTimer() {
        if (this.turnTimerInterval) this.turnTimerInterval.clear();
        this.state.turnTimer = 30;

        this.turnTimerInterval = this.clock.setInterval(() => {
            this.state.turnTimer--;

            if (this.state.turnTimer <= 0) {
                this.resolveRound(); // Auto-resolve or force submit? For now, just resolve
                this.turnTimerInterval?.clear();
            }

            // Optimization: Don't broadcast every single second if not needed, 
            // but for a timer it's usually fine or done client-side predictive.
            if (this.state.turnTimer % 5 === 0 || this.state.turnTimer < 6) {
                this.broadcastState();
            }
        }, 1000);
    }

    handleSubmitHand(client: Client, message: { slots: string[] }) {
        if (this.state.phase !== "planning") return;

        const player = this.getPlayer(client.sessionId);
        if (!player || player.confirmed) return;

        // Message contains Card IDs. Validate ownership and mana cost.
        let totalCost = 0;
        const selectedCards = new ArraySchema<Card>();

        // Logic to verify cards are in hand and calculate cost
        // Simplified: Trust the client IDs for now but check if they exist in hand map
        // Production: Map<CardId, Card> in hand.

        // We need to move cards from hand to slots
        const newHand = new ArraySchema<Card>();
        const handMap = new Map<string, Card>();
        player.hand.forEach(c => handMap.set(c.id, c));

        // Reset slots
        player.slots = new ArraySchema<Card>();

        // Process slots (size 3)
        const slotIds = message.slots || [null, null, null];

        for (let i = 0; i < 3; i++) {
            const cId = slotIds[i];
            if (cId && handMap.has(cId)) {
                const card = handMap.get(cId)!;
                totalCost += card.cost;
                player.slots.push(card);
                handMap.delete(cId); // Remove from available hand
            } else {
                player.slots.push(null); // Empty slot
            }
        }

        if (totalCost > player.mana) {
            // Reject submission usually, or fail silently
            return;
        }

        // Update Hand
        player.hand = new ArraySchema<Card>();
        handMap.forEach(c => player.hand.push(c));

        player.mana -= totalCost;
        player.confirmed = true;

        // Check if both ready
        if (this.state.player1.confirmed && this.state.player2.confirmed) {
            this.resolveRound();
        } else {
            this.broadcastState();
        }
    }

    resolveRound() {
        if (this.turnTimerInterval) this.turnTimerInterval.clear();
        this.state.phase = "resolving";
        this.broadcastState();

        // Simulate resolution delay
        this.clock.setTimeout(() => {
            this.calculateOutcome();
        }, 500);
    }

    calculateOutcome() {
        const p1 = this.state.player1;
        const p2 = this.state.player2;

        const results = new ArraySchema<RoundResult>();
        let p1Shield = 0;
        let p2Shield = 0; // Shield from previous turns? Or fresh? Assume fresh.
        let p1DmgTaken = 0;
        let p2DmgTaken = 0;

        for (let i = 0; i < 3; i++) {
            const c1 = p1.slots[i]; // May be null/undefined if Schema behavior is weird with nulls
            const c2 = p2.slots[i];

            const res = new RoundResult();
            res.slotIndex = i;
            if (c1) res.playerCard = c1; // Clone?
            if (c2) res.opponentCard = c2;

            // Interaction Logic (Matches Dart Logic)
            if (!c1 && !c2) {
                res.log = "Empty";
            } else if (!c1) {
                // Direct Hit P2 -> P1
                if (c2.type === 'offense') p1DmgTaken += c2.value;
                if (c2.type === 'defense') p2Shield += c2.value;
                if (c2.type === 'support' && c2.templateId === 'heal') p2Shield += c2.value; // Heal as shield/restore
            } else if (!c2) {
                // Direct Hit P1 -> P2
                if (c1.type === 'offense') p2DmgTaken += c1.value;
                if (c1.type === 'defense') p1Shield += c1.value;
                if (c1.type === 'support' && c1.templateId === 'heal') p1Shield += c1.value;
            } else {
                // Head to Head
                const mult1 = this.getMultiplier(c1.type, c2.type);
                const mult2 = this.getMultiplier(c2.type, c1.type);

                // Apply Logic
                if (c1.type === 'offense' && c2.type === 'offense') {
                    p2DmgTaken += c1.value;
                    p1DmgTaken += c2.value;
                    res.interaction = 'clash';
                } else if (c1.type === 'offense' && c2.type === 'defense') {
                    p1DmgTaken += Math.round(c1.value * 0.5); // Reflect
                    p2Shield += c2.value;
                    res.interaction = 'counter';
                } else if (c1.type === 'defense' && c2.type === 'offense') {
                    p2DmgTaken += Math.round(c2.value * 0.5);
                    p1Shield += c1.value;
                    res.interaction = 'counter';
                } else {
                    // Generic Buffed Damage/Shield
                    if (c1.type === 'offense') p2DmgTaken += Math.round(c1.value * mult1);
                    if (c2.type === 'offense') p1DmgTaken += Math.round(c2.value * mult2);

                    if (c1.type === 'defense') p1Shield += Math.round(c1.value * mult1);
                    if (c2.type === 'defense') p2Shield += Math.round(c2.value * mult2);

                    if (c1.type === 'support') p1Shield += c1.value; // Heal
                    if (c2.type === 'support') p2Shield += c2.value;
                }
            }

            res.damageDealt = Math.max(0, p2DmgTaken - p2Shield); // Approx per slot for log
            res.damageTaken = Math.max(0, p1DmgTaken - p1Shield);
            results.push(res);
        }

        // Final State Update
        const finalDamageToP1 = Math.max(0, p1DmgTaken - p1Shield);
        const finalDamageToP2 = Math.max(0, p2DmgTaken - p2Shield);

        p1.hp = Math.max(0, p1.hp - finalDamageToP1);
        p2.hp = Math.max(0, p2.hp - finalDamageToP2);

        this.state.lastRoundResults = results;
        this.state.phase = "results";
        this.broadcastState();

        // Next Turn Delay
        this.clock.setTimeout(() => {
            if (p1.hp <= 0 || p2.hp <= 0) {
                this.state.phase = "gameOver";
                this.state.winnerId = p1.hp > 0 ? p1.id : p2.id;
                this.broadcastState();
            } else {
                this.nextTurn();
            }
        }, 4000);
    }

    nextTurn() {
        this.state.phase = "planning";
        this.state.currentTurn++;

        const p1 = this.state.player1;
        const p2 = this.state.player2;

        // Reset round state
        p1.confirmed = false;
        p2.confirmed = false;
        p1.slots = new ArraySchema<Card>();
        p2.slots = new ArraySchema<Card>();

        // Regen Mana
        p1.mana = Math.min(p1.maxMana, p1.mana + 3);
        p2.mana = Math.min(p2.maxMana, p2.mana + 3);

        // Draw Cards
        this.drawCards(p1, 2);
        this.drawCards(p2, 2);

        this.startTurnTimer();
        this.broadcastState();
    }

    drawCards(player: Player, count: number) {
        for (let i = 0; i < count; i++) {
            if (player.hand.length >= 7) break;
            const template = CARD_TEMPLATES[Math.floor(Math.random() * CARD_TEMPLATES.length)];
            const card = new Card();
            card.id = uuidv4();
            card.templateId = template.id;
            card.name = template.name;
            card.cost = template.cost;
            card.type = template.type as CardType;
            card.value = template.value;
            card.description = template.desc;
            player.hand.push(card);
        }
        player.handCount = player.hand.length;
    }

    getPlayer(sessionId: string): Player | undefined {
        if (this.state.player1?.id === sessionId) return this.state.player1;
        if (this.state.player2?.id === sessionId) return this.state.player2;
        return undefined;
    }

    getMultiplier(type1: string, type2: string): number {
        if (type1 === 'offense' && type2 === 'support') return 1.5;
        if (type1 === 'support' && type2 === 'defense') return 2.0;
        return 1.0;
    }

    generateRoomCode(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    private handleEmote(client: Client, message: any) {
        // ...
    }

    private broadcastState() {
        // Custom broadcast to ensure JSON is sent for parsing simplification in Flutter if needed, 
        // OR standard Colyseus schema sync.
        // Standard schema sync is better if Client supports it.
        // Our Flutter client uses JSON parsing of a `state` message for simplicity.

        const json = this.state.toJSON();
        this.broadcast("state", { state: json });
    }

    onLeave(client: Client) {
        // ... Disconnection logic
    }
}
