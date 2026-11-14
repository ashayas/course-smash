// Small pieces of app logic that every client needs, kept on the server so the web app and the iOS app share them.
import { ACCENTS, ARCHETYPES, MATERIALS, ROOFS } from "./icon";

/** Starter prompts under the composer on the home screen. */
const IDEAS = [
  "TCP well enough to debug slow APIs",
  "Enough statistics to read an A/B test",
  "How CRISPR works, for a non-biologist",
];

const NAMES: Record<string, string> = {
  controltower: "control tower", powerplant: "power plant", datacenter: "data centre", townhall: "town hall", windfarm: "wind farm",
};
const label = (id: string) => {
  const word = NAMES[id] ?? id;
  return word[0]!.toUpperCase() + word.slice(1);
};
const labelled = (ids: readonly string[]) => ids.map((id) => ({ id, label: label(id) }));

/** What a client needs before it draws anything: starter ideas and the building picker's choices. */
export const appConfig = () => ({
  ideas: IDEAS,
  buildings: { archetypes: labelled(ARCHETYPES), materials: labelled(MATERIALS), roofs: labelled(ROOFS), accents: labelled(ACCENTS) },
});

type CatalogEntry = { track: string; title: string; summary: string; tags: string[]; level: string };

/** The library search: every word must appear in the title, summary, tags or level. `track` narrows to one track. */
export function filterCatalog<T extends CatalogEntry>(catalog: { tracks: Record<string, string>; courses: T[] }, query: string, track: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    tracks: catalog.tracks,
    // JSON object order is not something every client keeps, so the display order is also sent as a list.
    track_list: Object.entries(catalog.tracks).map(([id, title]) => ({ id, title })),
    courses: catalog.courses.filter((c) => (!track || c.track === track) &&
      words.every((w) => `${c.title} ${c.summary} ${c.tags.join(" ")} ${c.level}`.toLowerCase().includes(w))),
  };
}

type StatCourse = { answered: number; average: number | null; recent_average: number | null; last_answered_at: number | null; created_at: number };

/**
 * Adds what the stats page reads off the numbers: each course's recent trend, the courses most recently studied first,
 * and the top of the activity chart's scale.
 */
export function withInsights<C extends StatCourse, S extends { days: { answered: number }[]; courses: C[] }>(stats: S) {
  const peak = Math.max(4, ...stats.days.map((d) => d.answered));
  return {
    ...stats,
    chart_max: peak % 2 ? peak + 1 : peak,
    courses: stats.courses
      .map((c) => {
        // The last ten answers against the whole course, once there are enough answers for that to mean something.
        const trend = c.recent_average != null && c.average != null && c.answered >= 12 ? c.recent_average - c.average : null;
        const points = trend == null ? 0 : Math.round(Math.abs(trend) * 100);
        const trend_label = trend == null ? null : Math.abs(trend) < 0.05 ? "Holding steady" : trend > 0 ? `Up ${points} points lately` : `Down ${points} points lately`;
        return { ...c, trend, trend_label };
      })
      .sort((a, b) => (b.last_answered_at ?? b.created_at) - (a.last_answered_at ?? a.created_at)),
  };
}
