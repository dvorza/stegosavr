export const MNEMONIC_MARKER = "🔐";

export interface MnemonicDictionaryProfile {
  id: string;
  label: string;
  marker: typeof MNEMONIC_MARKER;
  adjectives: string[];
  nouns: string[];
  emoji: string[];
}

const standardAdjectiveRoots = [
  "quiet",
  "bright",
  "velvet",
  "silver",
  "lunar",
  "patient",
  "gentle",
  "brave",
  "crystal",
  "hidden",
  "rapid",
  "warm",
  "soft",
  "clear",
  "tiny",
  "amber",
];

const standardAdjectiveFlavors = [
  "blue",
  "green",
  "gold",
  "red",
  "violet",
  "white",
  "black",
  "orange",
  "indigo",
  "rose",
  "mint",
  "pearl",
  "copper",
  "frost",
  "sunny",
  "misty",
];

const standardNounRoots = [
  "mango",
  "archive",
  "garden",
  "signal",
  "harbor",
  "lantern",
  "meadow",
  "orbit",
  "river",
  "notebook",
  "station",
  "cloud",
  "mirror",
  "compass",
  "summit",
  "library",
];

const standardNounFlavors = [
  "field",
  "bridge",
  "spark",
  "path",
  "room",
  "tower",
  "stone",
  "paper",
  "thread",
  "window",
  "forest",
  "shore",
  "map",
  "seed",
  "voice",
  "drift",
];

const standardEmoji = ["🌙", "🧭", "✨", "📡", "🔑", "🪐", "🧊", "🌊", "🕯️", "🧬", "🪞", "🌿", "⚡", "🎲", "🌺", "🛰️"];

const vegetableAdjectiveRoots = [
  "crisp",
  "fresh",
  "green",
  "sunny",
  "earthy",
  "tender",
  "leafy",
  "golden",
  "sweet",
  "peppery",
  "garden",
  "ripe",
  "bright",
  "juicy",
  "humble",
  "rooted",
];

const vegetableAdjectiveFlavors = [
  "basil",
  "carrot",
  "tomato",
  "onion",
  "pepper",
  "garlic",
  "squash",
  "radish",
  "turnip",
  "celery",
  "cucumber",
  "pumpkin",
  "lettuce",
  "parsley",
  "beet",
  "pea",
];

const vegetableNounRoots = [
  "carrot",
  "pepper",
  "pumpkin",
  "radish",
  "tomato",
  "turnip",
  "lettuce",
  "cabbage",
  "beet",
  "onion",
  "garlic",
  "squash",
  "cucumber",
  "celery",
  "pea",
  "herb",
];

const vegetableNounFlavors = [
  "patch",
  "basket",
  "sprout",
  "market",
  "kitchen",
  "seed",
  "vine",
  "harvest",
  "bed",
  "row",
  "soil",
  "leaf",
  "stew",
  "plot",
  "root",
  "bunch",
];

const vegetableEmoji = ["🥕", "🥬", "🍅", "🌽", "🧄", "🧅", "🥒", "🥦", "🫑", "🥔", "🍠", "🫛", "🌶️", "🎃", "🌱", "🪴"];

export const standardDictionary: MnemonicDictionaryProfile = {
  id: "standard",
  label: "Standard mnemonic",
  marker: MNEMONIC_MARKER,
  adjectives: makeCompounds(standardAdjectiveRoots, standardAdjectiveFlavors),
  nouns: makeCompounds(standardNounRoots, standardNounFlavors),
  emoji: makePairs(standardEmoji),
};

export const vegetablesDictionary: MnemonicDictionaryProfile = {
  id: "vegetables",
  label: "Vegetables mnemonic",
  marker: MNEMONIC_MARKER,
  adjectives: makeCompounds(vegetableAdjectiveRoots, vegetableAdjectiveFlavors),
  nouns: makeCompounds(vegetableNounRoots, vegetableNounFlavors),
  emoji: makePairs(vegetableEmoji),
};

export const dictionaryProfiles = [standardDictionary, vegetablesDictionary] as const;

export function listDictionaryProfiles(): MnemonicDictionaryProfile[] {
  return [...dictionaryProfiles];
}

export function getDictionaryProfile(id: string): MnemonicDictionaryProfile {
  const profile = dictionaryProfiles.find((candidate) => candidate.id === id);

  if (!profile) {
    throw new Error(`Unknown mnemonic dictionary profile: ${id}`);
  }

  return profile;
}

export function validateDictionaryProfile(profile: MnemonicDictionaryProfile): void {
  if (!profile.id || !profile.label || profile.marker !== MNEMONIC_MARKER) {
    throw new Error(`Invalid mnemonic dictionary metadata for ${profile.id || "unknown"}.`);
  }

  validateTokens(profile.adjectives, `${profile.id}.adjectives`);
  validateTokens(profile.nouns, `${profile.id}.nouns`);
  validateTokens(profile.emoji, `${profile.id}.emoji`);
}

function validateTokens(tokens: string[], name: string): void {
  if (tokens.length !== 256) {
    throw new Error(`${name} must contain exactly 256 tokens.`);
  }

  if (new Set(tokens).size !== tokens.length) {
    throw new Error(`${name} must not contain duplicate tokens.`);
  }
}

function makeCompounds(left: string[], right: string[]): string[] {
  return left.flatMap((first) => right.map((second) => `${first}-${second}`));
}

function makePairs(tokens: string[]): string[] {
  return tokens.flatMap((first) => tokens.map((second) => `${first}${second}`));
}
