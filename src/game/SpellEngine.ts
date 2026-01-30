import { v4 as uuidv4 } from "uuid";
import { ArraySchema } from "@colyseus/schema";
import { Spell, ElementType } from "../schema/GameState";

// Spell definitions
interface SpellDefinition {
    name: string;
    elements: ElementType[];
    maxCharges: number;
    cooldownSeconds: number;
    duration: number;
    radius: number;
    damagePerSecond: number;
}

// Basic spells (single element)
const basicSpells: Record<ElementType, SpellDefinition> = {
    fire: {
        name: "Ember Ground",
        elements: ["fire"],
        maxCharges: 2,
        cooldownSeconds: 5,
        duration: 4,
        radius: 40,
        damagePerSecond: 8,
    },
    ice: {
        name: "Frost Patch",
        elements: ["ice"],
        maxCharges: 2,
        cooldownSeconds: 5,
        duration: 5,
        radius: 45,
        damagePerSecond: 3,
    },
    wind: {
        name: "Gust Field",
        elements: ["wind"],
        maxCharges: 3,
        cooldownSeconds: 4,
        duration: 3,
        radius: 50,
        damagePerSecond: 2,
    },
    earth: {
        name: "Stone Wall",
        elements: ["earth"],
        maxCharges: 2,
        cooldownSeconds: 6,
        duration: 6,
        radius: 35,
        damagePerSecond: 0,
    },
    lightning: {
        name: "Static Field",
        elements: ["lightning"],
        maxCharges: 2,
        cooldownSeconds: 6,
        duration: 3,
        radius: 35,
        damagePerSecond: 10,
    },
    shadow: {
        name: "Dark Pool",
        elements: ["shadow"],
        maxCharges: 2,
        cooldownSeconds: 5,
        duration: 4,
        radius: 40,
        damagePerSecond: 5,
    },
};

// Combined spells (two elements)
const combinedSpells: Record<string, SpellDefinition> = {
    "fire_ice": {
        name: "Steam Eruption",
        elements: ["fire", "ice"],
        maxCharges: 2,
        cooldownSeconds: 7,
        duration: 5,
        radius: 55,
        damagePerSecond: 6,
    },
    "fire_wind": {
        name: "Flame Wave",
        elements: ["fire", "wind"],
        maxCharges: 2,
        cooldownSeconds: 6,
        duration: 2,
        radius: 60,
        damagePerSecond: 12,
    },
    "fire_lightning": {
        name: "Plasma Storm",
        elements: ["fire", "lightning"],
        maxCharges: 1,
        cooldownSeconds: 8,
        duration: 3,
        radius: 45,
        damagePerSecond: 15,
    },
    "ice_wind": {
        name: "Blizzard",
        elements: ["ice", "wind"],
        maxCharges: 2,
        cooldownSeconds: 7,
        duration: 6,
        radius: 65,
        damagePerSecond: 4,
    },
    "ice_shadow": {
        name: "Frozen Void",
        elements: ["ice", "shadow"],
        maxCharges: 1,
        cooldownSeconds: 8,
        duration: 5,
        radius: 50,
        damagePerSecond: 3,
    },
    "earth_wind": {
        name: "Sandstorm",
        elements: ["earth", "wind"],
        maxCharges: 2,
        cooldownSeconds: 6,
        duration: 4,
        radius: 55,
        damagePerSecond: 7,
    },
    "earth_lightning": {
        name: "Seismic Shock",
        elements: ["earth", "lightning"],
        maxCharges: 2,
        cooldownSeconds: 7,
        duration: 4,
        radius: 50,
        damagePerSecond: 9,
    },
    "lightning_shadow": {
        name: "Shadow Lightning",
        elements: ["lightning", "shadow"],
        maxCharges: 2,
        cooldownSeconds: 6,
        duration: 2,
        radius: 40,
        damagePerSecond: 11,
    },
};

// Create combo key (sorted for consistent lookup)
function comboKey(a: string, b: string): string {
    const sorted = [a, b].sort();
    return `${sorted[0]}_${sorted[1]}`;
}

// Forge a spell from elements
export function forgeSpell(elements: ElementType[]): Spell | null {
    if (elements.length === 0 || elements.length > 2) return null;

    let definition: SpellDefinition | undefined;

    if (elements.length === 1) {
        definition = basicSpells[elements[0]];
    } else {
        const key = comboKey(elements[0], elements[1]);
        definition = combinedSpells[key];
    }

    if (!definition) return null;

    const spell = new Spell();
    spell.id = uuidv4();
    spell.name = definition.name;
    spell.elements = new ArraySchema<string>(...definition.elements);
    spell.maxCharges = definition.maxCharges;
    spell.currentCharges = definition.maxCharges;
    spell.cooldownSeconds = definition.cooldownSeconds;
    spell.currentCooldown = 0;
    spell.duration = definition.duration;
    spell.radius = definition.radius;
    spell.damagePerSecond = definition.damagePerSecond;

    return spell;
}

// Check if elements can make a valid spell
export function isValidCombination(elements: ElementType[]): boolean {
    if (elements.length === 0 || elements.length > 2) return false;
    if (elements.length === 1) return elements[0] in basicSpells;
    const key = comboKey(elements[0], elements[1]);
    return key in combinedSpells;
}

// Get spell name preview
export function getSpellName(elements: ElementType[]): string | null {
    if (elements.length === 0 || elements.length > 2) return null;
    if (elements.length === 1) return basicSpells[elements[0]]?.name || null;
    const key = comboKey(elements[0], elements[1]);
    return combinedSpells[key]?.name || null;
}
