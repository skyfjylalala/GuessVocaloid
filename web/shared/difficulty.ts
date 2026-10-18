export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export const DIFFICULTY_LIMITS: Record<Difficulty, number> = {
  beginner: 50,
  intermediate: 200,
  advanced: 1000,
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

export function poolSize(difficulty: Difficulty, catalogSize: number) {
  return Math.min(DIFFICULTY_LIMITS[difficulty], catalogSize);
}
