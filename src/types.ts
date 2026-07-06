export interface Sentence {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  author?: string;
  translation?: string;
}

export type RacerType = 'car' | 'rocket' | 'horse' | 'ufo' | 'bicycle';

export interface RacerOption {
  type: RacerType;
  emoji: string;
  name: string;
  color: string;
  speedMultiplier: number;
}

export interface GameStats {
  wpm: number;
  accuracy: number;
  errors: number;
  elapsedTime: number; // in seconds
  progress: number; // 0 to 100
}

export interface GameHistoryEntry {
  id: string;
  sentenceText: string;
  wpm: number;
  accuracy: number;
  errors: number;
  date: string;
  racer: RacerType;
}
