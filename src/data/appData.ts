import type { Page, Reel } from "../types";
import type { IconName } from "../types";

export const navigation: { id: Page; icon: IconName }[] = [
  { id: "Chats", icon: "chat" }, { id: "Updates", icon: "updates" }, { id: "Reels", icon: "movie" }, { id: "Calls", icon: "call" }, { id: "Settings", icon: "settings" },
];

export const reels: Reel[] = [
  { name: "Maya", initials: "MY", title: "Golden hour walk", views: "2.4K views", duration: "0:18", style: "reel-peach", bg: "#f6c7ae" },
  { name: "Aarav", initials: "AR", title: "A quiet trail outside town", views: "1.8K views", duration: "0:24", style: "reel-green", bg: "#b8d9be" },
  { name: "Nina", initials: "NI", title: "Coffee and a slow morning", views: "986 views", duration: "0:15", style: "reel-lilac", bg: "#d5c7e8" },
  { name: "Dev", initials: "DV", title: "Little street food stop", views: "1.2K views", duration: "0:21", style: "reel-green", bg: "#b8d9be" },
  { name: "Ira", initials: "IR", title: "Weekend flowers in bloom", views: "754 views", duration: "0:13", style: "reel-peach", bg: "#f6c7ae" },
  { name: "Sam", initials: "SA", title: "The view from the lookout", views: "3.1K views", duration: "0:27", style: "reel-lilac", bg: "#d5c7e8" },
];
