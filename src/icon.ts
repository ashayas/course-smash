// Each course is drawn as a building in an isometric city (public/city.js).
// The planner picks the building from these fixed parts, so every icon is on-style and the model never writes markup.
import { z } from "zod";

export const ARCHETYPES = [
  "tower", "setback", "rotunda", "capitol", "factory", "datacenter", "port", "greenhouse", "townhall",
  "lighthouse", "observatory", "fortress", "vault", "powerplant", "warehouse", "station", "controltower",
  "workshop", "library", "stadium", "windfarm", "lab", "pagoda", "apartments",
] as const;
export const MATERIALS = [
  "sandstone", "brick", "glass", "teal", "concrete", "white",
  "slate", "terracotta", "sage", "lilac", "charcoal",
] as const;
export const ROOFS = [
  "none", "garden", "helipad", "antenna", "dish", "tank", "solar",
  "spire", "flag", "beacon", "billboard", "crown", "turbine",
] as const;
export const ACCENTS = ["orange", "yellow", "green", "blue", "pink", "purple", "red", "teal"] as const;

export const IconSchema = z.object({
  archetype: z.enum(ARCHETYPES),
  material: z.enum(MATERIALS),
  roof: z.enum(ROOFS),
  accent: z.enum(ACCENTS),
});
export type Icon = z.infer<typeof IconSchema>;

/** What the planner reads to choose a building that fits the topic. */
export const ICON_GUIDE =
  "Also pick the course's building for the learner's city map, as `icon`. Vary the archetype, material, roof and accent so courses look distinct. " +
  "archetype: tower (software, AI, modern tech), setback (finance, business, statistics, careers), rotunda (science, physics, maths), " +
  "capitol (history, law, civics, philosophy, the arts), factory (manufacturing, compilers, industrial engineering), " +
  "datacenter (servers, databases, cloud infrastructure, Linux), port (containers, shipping, supply chain, logistics), " +
  "greenhouse (biology, ecology, botany, food, health), townhall (European languages, teaching, music, community), " +
  "lighthouse (observability, monitoring, logging, alerting, debugging, navigation), observatory (astronomy, astrophysics, analytics, forecasting, data science), " +
  "fortress (cybersecurity, network defense, hardening, threat modeling), vault (cryptography, auth, secrets, zero trust, banking, accounting), " +
  "powerplant (GPUs, high-throughput compute, inference engines, energy, electrical engineering), warehouse (storage engines, caching, object stores, inventory, data lakes), " +
  "station (routing, load balancing, message queues, streaming, transit, networking protocols), controltower (orchestration, Kubernetes control planes, scheduling, aviation, DevOps), " +
  "workshop (robotics, embedded systems, hardware, electronics, CAD, making things), library (literature, reading, documentation, RFCs, identity standards, humanities), " +
  "stadium (sports, games, benchmarks, competitive programming, tournaments), windfarm (clean energy, climate tech, sustainability, environmental science), " +
  "lab (chemistry, materials science, pharmacology, wet-lab research, experiments), pagoda (Asian languages, culture, history, mindfulness, martial arts), " +
  "apartments (everyday life, UX, product design, psychology, personal habits). " +
  "material: sandstone, brick, glass, teal, concrete, white, slate, terracotta, sage, lilac or charcoal. " +
  "roof: none, garden, helipad, antenna, dish, tank, solar, spire, flag, beacon, billboard, crown or turbine. " +
  "accent (trim colour): orange, yellow, green, blue, pink, purple, red or teal. Choose what suits the topic's mood.";

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
