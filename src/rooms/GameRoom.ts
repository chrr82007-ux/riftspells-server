import { Room, Client, Delayed } from "colyseus";
import { v4 as uuidv4 } from "uuid";
import { ArraySchema } from "@colyseus/schema";
import {
    GameRoomState,
    Player,
    ElementOrb,
    Zone,
    ElementType,
    MatchPhase,
    SigilType,
    BonusType,
} from "../schema/GameState";
import { forgeSpell, isValidCombination } from "../game/SpellEngine";

// All element types
const ELEMENTS: ElementType[] = ["fire", "ice", "wind", "earth", "lightning", "shadow"];

// Generate random room code
function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export class GameRoom extends Room<GameRoomState> {
    private gameLoop?: Delayed;
    private orbSpawnTimer: number = 0;
    private orbSpawnInterval: number = 3; // Seconds between orb spawns

    onCreate(options: any) {
        this.setState(new GameRoomState());
        this.state.roomCode = generateRoomCode();
        this.maxClients = 2;

        console.log(`Room created: ${this.state.roomCode}`);

        // Set up message handlers
        this.onMessage("setReady", (client, message) => this.handleSetReady(client, message));
        this.onMessage("selectSigil", (client, message) => this.handleSelectSigil(client, message));
        this.onMessage("collectOrb", (client, message) => this.handleCollectOrb(client, message));
        this.onMessage("forgeSpell", (client, message) => this.handleForgeSpell(client, message));
        this.onMessage("castSpell", (client, message) => this.handleCastSpell(client, message));
        this.onMessage("dispelPulse", (client, message) => this.handleDispelPulse(client, message));
        this.onMessage("selectBonus", (client, message) => this.handleSelectBonus(client, message));
    }

    onJoin(client: Client, options: { username?: string; sigil?: string } = {}) {
        const player = new Player();
        player.id = client.sessionId;
        player.username = options.username || `Player${Math.floor(Math.random() * 1000)}`;
        player.selectedSigil = (options.sigil as SigilType) || "";
        player.crystalHealth = 100;

        if (!this.state.player1) {
            this.state.player1 = player;
            console.log(`Player 1 joined: ${player.username}`);
        } else if (!this.state.player2) {
            this.state.player2 = player;
            console.log(`Player 2 joined: ${player.username}`);
        }

        // Send room info to client
        client.send("roomJoined", {
            roomCode: this.state.roomCode,
            playerId: client.sessionId,
        });

        // Check if ready to start
        if (this.state.player1 && this.state.player2) {
            this.state.phase = "sigilSelect";
        }

        // Broadcast state to all clients
        this.broadcastState();
    }

    onLeave(client: Client, consented: boolean) {
        if (this.state.player1?.id === client.sessionId) {
            this.state.player1 = undefined;
        } else if (this.state.player2?.id === client.sessionId) {
            this.state.player2 = undefined;
        }

        // End match if player leaves during game
        if (this.state.phase !== "lobby" && this.state.phase !== "matchEnd") {
            const remainingPlayer = this.state.player1 || this.state.player2;
            if (remainingPlayer) {
                this.state.winnerId = remainingPlayer.id;
                this.state.phase = "matchEnd";
            }
        }

        this.broadcastState();
    }

    // Convert state to JSON for Flutter client
    private stateToJson(): any {
        return {
            roomCode: this.state.roomCode,
            phase: this.state.phase,
            player1: this.state.player1 ? this.playerToJson(this.state.player1) : null,
            player2: this.state.player2 ? this.playerToJson(this.state.player2) : null,
            orbs: Array.from(this.state.orbs).map(o => ({
                id: o.id,
                element: o.element,
                x: o.x,
                y: o.y,
            })),
            zones: Array.from(this.state.zones).map(z => ({
                id: z.id,
                spellId: z.spellId,
                ownerId: z.ownerId,
                primaryElement: z.primaryElement,
                secondaryElement: z.secondaryElement,
                x: z.x,
                y: z.y,
                radius: z.radius,
                remainingDuration: z.remainingDuration,
                damagePerSecond: z.damagePerSecond,
            })),
            currentRound: this.state.currentRound,
            roundTimer: this.state.roundTimer,
            countdownTimer: this.state.countdownTimer,
            arenaWidth: this.state.arenaWidth,
            arenaHeight: this.state.arenaHeight,
            suddenDeathShrink: this.state.suddenDeathShrink,
            winnerId: this.state.winnerId,
        };
    }

    private playerToJson(player: Player): any {
        return {
            id: player.id,
            username: player.username,
            selectedSigil: player.selectedSigil,
            forgeQueue: Array.from(player.forgeQueue),
            spellSlots: Array.from(player.spellSlots).map(s => ({
                id: s.id,
                name: s.name,
                elements: Array.from(s.elements),
                maxCharges: s.maxCharges,
                currentCharges: s.currentCharges,
                cooldownSeconds: s.cooldownSeconds,
                currentCooldown: s.currentCooldown,
                duration: s.duration,
                radius: s.radius,
                damagePerSecond: s.damagePerSecond,
            })),
            crystalHealth: player.crystalHealth,
            dispelCooldown: player.dispelCooldown,
            roundsWon: player.roundsWon,
            isReady: player.isReady,
            selectedBonus: player.selectedBonus,
        };
    }

    private broadcastState() {
        this.broadcast("state", this.stateToJson());
    }

    private handleSetReady(client: Client, message: { ready: boolean }) {
        const player = this.getPlayer(client.sessionId);
        if (!player) return;

        player.isReady = message.ready;

        // Start countdown if both ready
        if (
            this.state.player1?.isReady &&
            this.state.player2?.isReady &&
            this.state.phase === "sigilSelect"
        ) {
            this.startCountdown();
        }

        this.broadcastState();
    }

    private handleSelectSigil(client: Client, message: { sigil: SigilType }) {
        const player = this.getPlayer(client.sessionId);
        if (!player || this.state.phase !== "sigilSelect") return;

        player.selectedSigil = message.sigil;
        this.broadcastState();
    }

    private handleCollectOrb(client: Client, message: { orbId: string }) {
        const player = this.getPlayer(client.sessionId);
        if (!player || this.state.phase !== "combat") return;

        // Check forge queue capacity
        if (player.forgeQueue.length >= 3) return;

        // Find and remove orb
        const orbIndex = this.state.orbs.findIndex((o) => o.id === message.orbId);
        if (orbIndex === -1) return;

        const orb = this.state.orbs[orbIndex];
        if (!orb) return;
        player.forgeQueue.push(orb.element);
        this.state.orbs.splice(orbIndex, 1);

        this.broadcastState();
    }

    private handleForgeSpell(client: Client, message: { elements: number[] }) {
        const player = this.getPlayer(client.sessionId);
        if (!player || this.state.phase !== "combat") return;

        const indices = message.elements;
        if (indices.length === 0 || indices.length > 2) return;

        // Validate indices
        for (const idx of indices) {
            if (idx < 0 || idx >= player.forgeQueue.length) return;
        }

        // Get elements from queue
        const elements = indices.map((i) => player.forgeQueue[i] as ElementType);

        // Check if valid combination
        if (!isValidCombination(elements)) return;

        // Forge the spell
        const spell = forgeSpell(elements);
        if (!spell) return;

        // Apply sigil modifiers
        this.applySigilToSpell(player, spell);

        // Check spell slot capacity
        if (player.spellSlots.length >= 4) {
            // Replace oldest spell
            player.spellSlots.shift();
        }
        player.spellSlots.push(spell);

        // Remove used elements from queue (reverse order to maintain indices)
        const sortedIndices = [...indices].sort((a, b) => b - a);
        for (const idx of sortedIndices) {
            player.forgeQueue.splice(idx, 1);
        }

        this.broadcastState();
    }

    private handleCastSpell(client: Client, message: { spellId: string; x: number; y: number }) {
        const player = this.getPlayer(client.sessionId);
        if (!player || this.state.phase !== "combat") return;

        // Find spell
        const spellIndex = player.spellSlots.findIndex((s) => s.id === message.spellId);
        if (spellIndex === -1) return;

        const spell = player.spellSlots[spellIndex];
        if (!spell) return;

        // Check if can cast
        if (spell.currentCharges <= 0 || spell.currentCooldown > 0) return;

        // Create zone
        const zone = new Zone();
        zone.id = uuidv4();
        zone.spellId = spell.id;
        zone.ownerId = player.id;
        const primaryEl = spell.elements[0];
        zone.primaryElement = (primaryEl || "fire") as ElementType;
        zone.secondaryElement = spell.elements.length > 1 ? (spell.elements[1] || "") : "";
        zone.x = message.x;
        zone.y = message.y;
        zone.radius = spell.radius;
        zone.remainingDuration = spell.duration;
        zone.damagePerSecond = spell.damagePerSecond;

        this.state.zones.push(zone);

        // Consume charge and start cooldown
        spell.currentCharges--;
        spell.currentCooldown = spell.cooldownSeconds;

        // Echo sigil effect
        if (player.selectedSigil === "echo") {
            this.clock.setTimeout(() => {
                this.createEchoZone(zone, player.id);
            }, 1500);
        }

        this.broadcastState();
    }

    private handleDispelPulse(client: Client, message: { x: number; y: number }) {
        const player = this.getPlayer(client.sessionId);
        if (!player || this.state.phase !== "combat") return;

        // Check cooldown
        if (player.dispelCooldown > 0) return;

        const dispelRadius = 60;
        const dispelX = message.x;
        const dispelY = message.y;

        // Remove zones within radius
        const zonesToRemove: number[] = [];
        for (let i = 0; i < this.state.zones.length; i++) {
            const zone = this.state.zones[i];
            if (!zone) continue;
            const dist = Math.sqrt(Math.pow(zone.x - dispelX, 2) + Math.pow(zone.y - dispelY, 2));
            if (dist < dispelRadius + zone.radius) {
                zonesToRemove.push(i);
            }
        }

        // Remove in reverse order
        for (let i = zonesToRemove.length - 1; i >= 0; i--) {
            this.state.zones.splice(zonesToRemove[i], 1);
        }

        // Start cooldown
        player.dispelCooldown = 12;

        this.broadcastState();
    }

    private handleSelectBonus(client: Client, message: { bonus: BonusType }) {
        const player = this.getPlayer(client.sessionId);
        if (!player || this.state.phase !== "bonusSelect") return;

        player.selectedBonus = message.bonus;

        // Apply bonus
        this.applyBonus(player, message.bonus);

        // Check if both players selected
        if (this.state.player1?.selectedBonus && this.state.player2?.selectedBonus) {
            this.startNextRound();
        }

        this.broadcastState();
    }

    private getPlayer(sessionId: string): Player | undefined {
        if (this.state.player1?.id === sessionId) return this.state.player1;
        if (this.state.player2?.id === sessionId) return this.state.player2;
        return undefined;
    }

    private startCountdown() {
        this.state.phase = "countdown";
        this.state.countdownTimer = 3;

        const countdown = this.clock.setInterval(() => {
            this.state.countdownTimer--;
            this.broadcastState();
            if (this.state.countdownTimer <= 0) {
                countdown.clear();
                this.startCombat();
            }
        }, 1000);
    }

    private startCombat() {
        this.state.phase = "combat";
        this.state.roundTimer = 180;
        this.orbSpawnTimer = 0;

        // Spawn initial orbs
        this.spawnOrbs(3);

        // Start game loop
        this.gameLoop = this.clock.setInterval(() => {
            this.tick(1 / 20); // 20fps
        }, 50);

        this.broadcastState();
    }

    private tick(dt: number) {
        if (this.state.phase !== "combat") return;

        // Update round timer
        this.state.roundTimer -= dt;
        if (this.state.roundTimer <= 0) {
            // Sudden death - shrink arena
            this.state.suddenDeathShrink = Math.min(1, this.state.suddenDeathShrink + dt * 0.1);
        }

        // Spawn orbs periodically
        this.orbSpawnTimer += dt;
        if (this.orbSpawnTimer >= this.orbSpawnInterval && this.state.orbs.length < 5) {
            this.spawnOrbs(1);
            this.orbSpawnTimer = 0;
            // Speed up spawns over time
            this.orbSpawnInterval = Math.max(1.5, this.orbSpawnInterval - 0.1);
        }

        // Update spell cooldowns
        this.updateCooldowns(dt);

        // Update zone durations and apply damage
        this.updateZones(dt);

        // Check win condition
        this.checkWinCondition();

        // Broadcast state every 100ms (5 times per second) to avoid flooding
        if (Math.floor(this.state.roundTimer * 5) !== Math.floor((this.state.roundTimer + dt) * 5)) {
            this.broadcastState();
        }
    }

    private updateCooldowns(dt: number) {
        for (const player of [this.state.player1, this.state.player2]) {
            if (!player) continue;

            // Dispel cooldown
            if (player.dispelCooldown > 0) {
                player.dispelCooldown = Math.max(0, player.dispelCooldown - dt);
            }

            // Spell cooldowns
            for (const spell of player.spellSlots) {
                if (spell.currentCooldown > 0) {
                    spell.currentCooldown = Math.max(0, spell.currentCooldown - dt);
                    // Restore charge when cooldown ends
                    if (spell.currentCooldown === 0 && spell.currentCharges < spell.maxCharges) {
                        spell.currentCharges++;
                        spell.currentCooldown = spell.currentCharges < spell.maxCharges ? spell.cooldownSeconds : 0;
                    }
                }
            }
        }
    }

    private updateZones(dt: number) {
        const zonesToRemove: number[] = [];

        for (let i = 0; i < this.state.zones.length; i++) {
            const zone = this.state.zones[i];
            if (!zone) continue;
            zone.remainingDuration -= dt;

            if (zone.remainingDuration <= 0) {
                zonesToRemove.push(i);
                continue;
            }

            // Apply damage to crystals
            const arenaMiddle = this.state.arenaHeight / 2 + 100; // Offset for UI

            // Player 1's crystal is at bottom (y > arenaMiddle)
            // Player 2's crystal is at top (y < arenaMiddle)
            if (this.state.player1 && zone.ownerId === this.state.player1.id && zone.y < arenaMiddle - 50) {
                // Zone in enemy territory - damage player 2
                if (this.state.player2) {
                    const damage = zone.damagePerSecond * dt * 0.5; // Reduced for balance
                    this.state.player2.crystalHealth = Math.max(0, this.state.player2.crystalHealth - damage);
                }
            } else if (this.state.player2 && zone.ownerId === this.state.player2.id && zone.y > arenaMiddle + 50) {
                // Zone in enemy territory - damage player 1
                if (this.state.player1) {
                    const damage = zone.damagePerSecond * dt * 0.5;
                    this.state.player1.crystalHealth = Math.max(0, this.state.player1.crystalHealth - damage);
                }
            }
        }

        // Remove expired zones
        for (let i = zonesToRemove.length - 1; i >= 0; i--) {
            this.state.zones.splice(zonesToRemove[i], 1);
        }
    }

    private spawnOrbs(count: number) {
        const contestedTop = 250;
        const contestedBottom = 350;
        const arenaLeft = 40;
        const arenaRight = 360;

        for (let i = 0; i < count; i++) {
            const orb = new ElementOrb();
            orb.id = uuidv4();
            orb.element = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
            orb.x = arenaLeft + Math.random() * (arenaRight - arenaLeft);
            orb.y = contestedTop + Math.random() * (contestedBottom - contestedTop);
            this.state.orbs.push(orb);
        }
    }

    private checkWinCondition() {
        // Check crystal health
        if (this.state.player1 && this.state.player1.crystalHealth <= 0) {
            this.endRound(this.state.player2?.id || "");
        } else if (this.state.player2 && this.state.player2.crystalHealth <= 0) {
            this.endRound(this.state.player1?.id || "");
        }
    }

    private endRound(winnerId: string) {
        this.gameLoop?.clear();
        this.state.phase = "roundEnd";

        // Award round win
        if (this.state.player1?.id === winnerId) {
            this.state.player1.roundsWon++;
        } else if (this.state.player2?.id === winnerId) {
            this.state.player2.roundsWon++;
        }

        // Check match win
        const p1Wins = this.state.player1?.roundsWon || 0;
        const p2Wins = this.state.player2?.roundsWon || 0;

        if (p1Wins >= 3) {
            this.state.winnerId = this.state.player1?.id || "";
            this.state.phase = "matchEnd";
        } else if (p2Wins >= 3) {
            this.state.winnerId = this.state.player2?.id || "";
            this.state.phase = "matchEnd";
        } else {
            // Transition to bonus select after delay
            this.clock.setTimeout(() => {
                this.state.phase = "bonusSelect";
                if (this.state.player1) this.state.player1.selectedBonus = "";
                if (this.state.player2) this.state.player2.selectedBonus = "";
                this.broadcastState();
            }, 2000);
        }

        this.broadcastState();
    }

    private startNextRound() {
        this.state.currentRound++;

        // Reset player states
        if (this.state.player1) {
            this.state.player1.crystalHealth = 100;
            this.state.player1.forgeQueue = new ArraySchema<string>();
            this.state.player1.dispelCooldown = 0;
            this.state.player1.isReady = true;
        }
        if (this.state.player2) {
            this.state.player2.crystalHealth = 100;
            this.state.player2.forgeQueue = new ArraySchema<string>();
            this.state.player2.dispelCooldown = 0;
            this.state.player2.isReady = true;
        }

        // Clear zones and orbs
        this.state.zones = new ArraySchema<Zone>();
        this.state.orbs = new ArraySchema<ElementOrb>();
        this.state.suddenDeathShrink = 0;
        this.orbSpawnInterval = 3;

        this.startCountdown();
    }

    private applySigilToSpell(player: Player, spell: any) {
        switch (player.selectedSigil) {
            case "stability":
                spell.duration *= 1.3;
                break;
            case "greed":
                spell.maxCharges++;
                spell.currentCharges++;
                spell.cooldownSeconds *= 1.25;
                break;
            // Other sigils apply during gameplay, not forging
        }
    }

    private applyBonus(player: Player, bonus: BonusType) {
        switch (bonus) {
            case "powerSurge":
                if (player.spellSlots.length > 0) {
                    const randomSpell = player.spellSlots[Math.floor(Math.random() * player.spellSlots.length)];
                    if (randomSpell) {
                        randomSpell.maxCharges++;
                        randomSpell.currentCharges++;
                    }
                }
                break;
            case "quickCast":
                if (player.spellSlots.length > 0) {
                    const randomSpell = player.spellSlots[Math.floor(Math.random() * player.spellSlots.length)];
                    if (randomSpell) {
                        randomSpell.cooldownSeconds *= 0.8;
                    }
                }
                break;
            case "forgeMastery":
                // Applied during next round's forging (would need additional tracking)
                break;
        }
    }

    private createEchoZone(originalZone: Zone, playerId: string) {
        if (this.state.phase !== "combat") return;

        const zone = new Zone();
        zone.id = uuidv4();
        zone.spellId = originalZone.spellId;
        zone.ownerId = playerId;
        zone.primaryElement = originalZone.primaryElement;
        zone.secondaryElement = originalZone.secondaryElement;
        zone.x = originalZone.x + (Math.random() - 0.5) * 30;
        zone.y = originalZone.y + (Math.random() - 0.5) * 30;
        zone.radius = originalZone.radius * 0.7;
        zone.remainingDuration = originalZone.remainingDuration * 0.5;
        zone.damagePerSecond = originalZone.damagePerSecond * 0.5;

        this.state.zones.push(zone);
        this.broadcastState();
    }
}
