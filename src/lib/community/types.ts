import type { ExerciseType } from '@/types/exercise';

export interface CommunitySession {
  email: string;
  username?: string;
  user_id?: string;
  date: string; // ISO string
  count: number;
  exercise?: ExerciseType;
  exercise_type?: ExerciseType;
}
