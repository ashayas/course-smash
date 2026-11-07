// Each course is drawn as a building in an isometric city (public/city.js).
// The planner picks the building from these fixed parts, so every icon is on-style and the model never writes markup.
import { z } from "zod";

export const ARCHETYPES = ["tower", "setback", "rotunda", "capitol", "factory", "datacenter", "port", "greenhouse", "townhall"] as const;
export const MATERIALS = ["sandstone", "brick", "glass", "teal", "concrete", "white"] as const;
export const ROOFS = ["none", "garden", "helipad", "antenna", "dish", "tank", "solar"] as const;
export const ACCENTS = ["orange", "yellow", "green", "blue", "pink", "purple"] as const;

export const IconSchema = z.object({
  archetype: z.enum(ARCHETYPES),
  material: z.enum(MATERIALS),
  roof: z.enum(ROOFS),
  accent: z.enum(ACCENTS),
});
export type Icon = z.infer<typeof IconSchema>;

/** What the planner reads to choose a building that fits the topic. */
export const ICON_GUIDE =
  "Also pick the course's building for the learner's city map, as `icon`. archetype: tower (software, AI, modern tech), " +
  "setback (finance, business, statistics, careers), rotunda (science, space, physics, maths), capitol (history, law, civics, philosophy, the arts), " +
  "factory (engineering, hardware, energy, making things), datacenter (networking, databases, infrastructure, security), " +
  "port (logistics, containers, operations, travel), greenhouse (biology, health, food, nature, climate), townhall (languages, writing, teaching, everyday skills). " +
  "material: sandstone, brick, glass, teal, concrete or white. roof: none, garden, helipad, antenna, dish, tank or solar. " +
  "accent (trim colour): orange, yellow, green, blue, pink or purple. Choose what suits the topic's mood.";

/** Stored icons are JSON; anything that no longer parses is dropped and the client picks one from the topic. */
export function parseIcon(raw: string | null | undefined): Icon | null {
  if (!raw) return null;
  try {
    const parsed = IconSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
