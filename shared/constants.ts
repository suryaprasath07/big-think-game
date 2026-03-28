import type { Arena } from "./types";

export const ARENAS: Arena[] = [
  {
    id: "ancient_ruins",
    name: "Ancient Ruins",
    description: "Battle among crumbling stone temples reclaimed by jungle.",
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    accentColor: "#a0764a",
    tags: ["outdoor", "ruins", "jungle"],
  },
  {
    id: "neon_city",
    name: "Neon City",
    description: "A rain-soaked cyberpunk district glowing with neon lights.",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    accentColor: "#7c3aed",
    tags: ["urban", "night", "futuristic"],
  },
  {
    id: "arctic_outpost",
    name: "Arctic Outpost",
    description: "A frozen research station at the edge of the world.",
    imageUrl: "https://images.unsplash.com/photo-1551582045-6ec9c11d8697?w=800&q=80",
    accentColor: "#0ea5e9",
    tags: ["snow", "cold", "outdoor"],
  },
  {
    id: "volcanic_crater",
    name: "Volcanic Crater",
    description: "Precarious platforms above rivers of flowing lava.",
    imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
    accentColor: "#ea580c",
    tags: ["fire", "lava", "dangerous"],
  },
  {
    id: "forest_clearing",
    name: "Enchanted Forest",
    description: "A mystical grove where ancient magic still lingers.",
    imageUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80",
    accentColor: "#16a34a",
    tags: ["forest", "nature", "mystical"],
  },
  {
    id: "desert_canyon",
    name: "Desert Canyon",
    description: "Vast sandstone canyons carved by ancient rivers.",
    imageUrl: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80",
    accentColor: "#d97706",
    tags: ["desert", "outdoor", "canyon"],
  },
];

export const ARENA_MAP = Object.fromEntries(ARENAS.map((a) => [a.id, a]));

export const MAX_PLAYERS_OPTIONS = [2, 4, 6, 8, 12, 16];

export const WS_URL =
  typeof window !== "undefined"
    ? `ws://${window.location.hostname}:${process.env.NEXT_PUBLIC_WS_PORT ?? "3001"}`
    : "ws://localhost:3001";