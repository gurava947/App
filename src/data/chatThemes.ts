import type { ChatBubbleTheme, ChatTheme, ChatWallpaperTheme } from "../types";

type ThemeGroup<T extends string, O> = {
  id: string;
  title: string;
  options: Array<O & { id: T; label: string }>;
};

export type BubbleThemeOption = {
  id: ChatBubbleTheme;
  label: string;
  mine: string;
  mineText: string;
  theirs: string;
  theirsText: string;
};

export type WallpaperThemeOption = {
  id: ChatWallpaperTheme;
  label: string;
  background: string;
};

export const defaultChatTheme: ChatTheme = { bubble: "featured-1", wallpaper: "none" };

export const bubbleThemeGroups: Array<ThemeGroup<ChatBubbleTheme, Omit<BubbleThemeOption, "id" | "label">>> = [
  {
    id: "featured",
    title: "Featured",
    options: [
      { id: "featured-1", label: "Emerald", mine: "#168a6a", mineText: "#ffffff", theirs: "#e5f1e9", theirsText: "#193126" },
      { id: "featured-2", label: "Coral", mine: "#d9634e", mineText: "#ffffff", theirs: "#fff0e9", theirsText: "#44251f" },
      { id: "featured-3", label: "Sunshine", mine: "#f4bf25", mineText: "#30290f", theirs: "#fff7d9", theirsText: "#30290f" },
      { id: "featured-4", label: "Midnight", mine: "#3d4854", mineText: "#ffffff", theirs: "#e7ebee", theirsText: "#1d2730" },
    ],
  },
  {
    id: "nature",
    title: "Nature",
    options: [
      { id: "nature-1", label: "Tropical", mine: "#168b88", mineText: "#ffffff", theirs: "#e1f3eb", theirsText: "#173b37" },
      { id: "nature-2", label: "Dune", mine: "#81529c", mineText: "#ffffff", theirs: "#f5e4d3", theirsText: "#3f2a4b" },
      { id: "nature-3", label: "Blue hour", mine: "#5265bb", mineText: "#ffffff", theirs: "#e8e8f7", theirsText: "#2b345d" },
      { id: "nature-4", label: "Blossom", mine: "#a83e70", mineText: "#ffffff", theirs: "#fde9f1", theirsText: "#4d2439" },
    ],
  },
  {
    id: "live",
    title: "Live",
    options: [
      { id: "live-1", label: "Iridescent", mine: "#8b58c1", mineText: "#ffffff", theirs: "#f0e9fa", theirsText: "#38294b" },
      { id: "live-2", label: "Sky", mine: "#2475d6", mineText: "#ffffff", theirs: "#e7f2ff", theirsText: "#1c3554" },
      { id: "live-3", label: "Aurora", mine: "#168a83", mineText: "#ffffff", theirs: "#e0f3f0", theirsText: "#173c39" },
      { id: "live-4", label: "Glass", mine: "#56616d", mineText: "#ffffff", theirs: "#e9edf1", theirsText: "#202930" },
    ],
  },
  {
    id: "minimal",
    title: "Minimal",
    options: [
      { id: "minimal-1", label: "Blue", mine: "#176fc1", mineText: "#ffffff", theirs: "#e7f1fc", theirsText: "#1b3550" },
      { id: "minimal-2", label: "Pink", mine: "#c73678", mineText: "#ffffff", theirs: "#fbe8f1", theirsText: "#4e2639" },
      { id: "minimal-3", label: "Teal", mine: "#087f69", mineText: "#ffffff", theirs: "#e1f2eb", theirsText: "#183b31" },
      { id: "minimal-4", label: "Orange", mine: "#bd552a", mineText: "#ffffff", theirs: "#fbeadd", theirsText: "#482b1d" },
    ],
  },
  {
    id: "doodle",
    title: "Doodle",
    options: [
      { id: "doodle-1", label: "Violet", mine: "#5942b7", mineText: "#ffffff", theirs: "#eeeafb", theirsText: "#2e2750" },
      { id: "doodle-2", label: "Ocean", mine: "#1178aa", mineText: "#ffffff", theirs: "#e3f3f8", theirsText: "#183945" },
      { id: "doodle-3", label: "Berry", mine: "#c13e78", mineText: "#ffffff", theirs: "#fae7f0", theirsText: "#4c2337" },
      { id: "doodle-4", label: "Graphite", mine: "#616773", mineText: "#ffffff", theirs: "#eceef1", theirsText: "#282d35" },
    ],
  },
];

export const wallpaperThemeGroups: Array<ThemeGroup<ChatWallpaperTheme, { background: string }>> = [
  {
    id: "featured",
    title: "Featured",
    options: [
      { id: "featured-1", label: "Liquid colour", background: "radial-gradient(ellipse at 18% 22%, rgba(255,255,255,.82), transparent 29%), radial-gradient(ellipse at 85% 72%, rgba(245,165,208,.72), transparent 34%), linear-gradient(135deg, #9be4e1, #eac5eb 48%, #f8d7a8)" },
      { id: "featured-2", label: "Golden stars", background: "radial-gradient(circle at 22% 24%, #fff4ad 0 2px, transparent 3px), radial-gradient(circle at 78% 58%, #fff4ad 0 2px, transparent 3px), linear-gradient(145deg, #ffdb39, #f8a72c 58%, #ed8a43)" },
      { id: "featured-3", label: "Aurora glass", background: "radial-gradient(ellipse at 36% 24%, rgba(47,186,178,.48), transparent 42%), radial-gradient(ellipse at 70% 76%, rgba(109,76,166,.4), transparent 40%), linear-gradient(160deg, #092b39, #101b32 56%, #27162f)" },
      { id: "featured-4", label: "Dark glass", background: "radial-gradient(ellipse at 20% 28%, rgba(99,159,211,.5), transparent 18%), radial-gradient(ellipse at 72% 75%, rgba(98,143,194,.35), transparent 22%), linear-gradient(145deg, #081117, #18212b 55%, #080c12)" },
    ],
  },
  {
    id: "nature",
    title: "Nature",
    options: [
      { id: "nature-1", label: "Ocean", background: "radial-gradient(ellipse at 58% 100%, rgba(255,255,255,.72), transparent 30%), repeating-linear-gradient(165deg, transparent 0 22px, rgba(255,255,255,.16) 23px 25px), linear-gradient(155deg, #87d9d3, #228fa6 48%, #154c6c)" },
      { id: "nature-2", label: "Palm shade", background: "radial-gradient(ellipse at 22% 20%, rgba(28,78,43,.34), transparent 24%), radial-gradient(ellipse at 77% 85%, rgba(27,110,91,.38), transparent 30%), linear-gradient(145deg, #bce7cf, #69bcae 52%, #2d7f79)" },
      { id: "nature-3", label: "Desert", background: "radial-gradient(ellipse at 75% 15%, rgba(255,245,219,.75), transparent 28%), linear-gradient(155deg, #f2c99e, #d8926f 50%, #785989)" },
      { id: "nature-4", label: "Blossom", background: "radial-gradient(circle at 20% 30%, #f8b8d3 0 15px, transparent 16px), radial-gradient(circle at 75% 72%, #f4a8cc 0 22px, transparent 23px), linear-gradient(145deg, #ffdced, #f6a8c6 58%, #d672a0)" },
    ],
  },
  {
    id: "live",
    title: "Live",
    options: [
      { id: "live-1", label: "Pearl swirl", background: "conic-gradient(from 25deg at 50% 50%, #f7c7df, #d7ceff, #a4e8e4, #fff1c8, #e6c6f2, #f7c7df)" },
      { id: "live-2", label: "Blue sky", background: "linear-gradient(180deg, #347eea 0%, #96d9ff 53%, #ecf5cc 100%)" },
      { id: "live-3", label: "Northern lights", background: "radial-gradient(ellipse at 24% 25%, rgba(0,198,166,.42), transparent 34%), radial-gradient(ellipse at 80% 68%, rgba(108,69,166,.5), transparent 38%), linear-gradient(160deg, #081c2c, #10293d 52%, #160e29)" },
      { id: "live-4", label: "Liquid glass", background: "radial-gradient(ellipse at 20% 28%, rgba(112,164,218,.35), transparent 23%), radial-gradient(ellipse at 77% 73%, rgba(112,164,218,.25), transparent 25%), linear-gradient(145deg, #101720, #05090d)" },
    ],
  },
  {
    id: "vibrant",
    title: "Vibrant",
    options: [
      { id: "vibrant-1", label: "Citrus", background: "radial-gradient(circle at 25% 35%, rgba(255,255,255,.5) 0 3px, transparent 4px), radial-gradient(circle at 78% 72%, rgba(255,255,255,.45) 0 4px, transparent 5px), linear-gradient(145deg, #dcf36a, #89d84a 58%, #43af69)" },
      { id: "vibrant-2", label: "Grape", background: "radial-gradient(circle at 20% 25%, rgba(255,255,255,.35) 0 6px, transparent 7px), radial-gradient(circle at 73% 68%, rgba(255,255,255,.25) 0 12px, transparent 13px), linear-gradient(145deg, #b7df74, #77bc67 55%, #527c88)" },
      { id: "vibrant-3", label: "Berry", background: "radial-gradient(ellipse at 20% 22%, rgba(255,255,255,.65), transparent 25%), linear-gradient(150deg, #ffd3ec, #e986c1 52%, #9a6fd1)" },
      { id: "vibrant-4", label: "Aqua", background: "radial-gradient(ellipse at 70% 22%, rgba(255,255,255,.65), transparent 28%), linear-gradient(150deg, #b9f1e8, #41bdc0 52%, #497cc3)" },
    ],
  },
  {
    id: "gradient",
    title: "Gradient",
    options: [
      { id: "gradient-1", label: "Sand", background: "linear-gradient(180deg, #f6d2b7, #e7b994 50%, #b78364)" },
      { id: "gradient-2", label: "Rose", background: "linear-gradient(180deg, #d9c3ff, #e9a6cb 52%, #a34a7d)" },
      { id: "gradient-3", label: "Mint", background: "linear-gradient(180deg, #d9f6e8, #94d8c0 52%, #378b81)" },
      { id: "gradient-4", label: "Peach", background: "linear-gradient(180deg, #ffd8a1, #ff9a6a 52%, #c55754)" },
    ],
  },
  {
    id: "colour",
    title: "Colour",
    options: [
      { id: "none", label: "Clean", background: "linear-gradient(145deg, #f9fbf9, #eaf3ed)" },
      { id: "colour-1", label: "Blue tint", background: "linear-gradient(145deg, #f4f9ff, #dcecff)" },
      { id: "colour-2", label: "Pink tint", background: "linear-gradient(145deg, #fff7fb, #f8e4ef)" },
      { id: "colour-3", label: "Green tint", background: "linear-gradient(145deg, #f5fbf6, #dcefe1)" },
    ],
  },
];

export const chatBubbleThemes = bubbleThemeGroups.flatMap((group) => group.options);
export const chatWallpaperThemes = wallpaperThemeGroups.flatMap((group) => group.options);
