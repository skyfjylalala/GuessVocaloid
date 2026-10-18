import type { Artist, Comparison, Guess, Song } from './types';

function compareArtists(guess: Artist[], answer: Artist[]): Comparison {
  if (!guess.length || !answer.length) return 'unknown';
  const guessed = new Set(guess.map(artist => artist.id));
  const expected = new Set(answer.map(artist => artist.id));
  const overlap = [...guessed].filter(id => expected.has(id)).length;
  if (overlap === guessed.size && overlap === expected.size) return 'match';
  return overlap ? 'partial' : 'different';
}

function compareNumber(guess: number | null, answer: number | null): Comparison {
  if (guess === null || answer === null) return 'unknown';
  return guess === answer ? 'match' : answer > guess ? 'higher' : 'lower';
}

export function compareSongs(guess: Song, answer: Song): Guess {
  let bpm: Comparison = 'unknown';
  if (guess.bpmMin !== null && guess.bpmMax !== null && answer.bpmMin !== null && answer.bpmMax !== null) {
    if (guess.bpmMin === answer.bpmMin && guess.bpmMax === answer.bpmMax) bpm = 'match';
    else if (answer.bpmMin > guess.bpmMax) bpm = 'higher';
    else if (answer.bpmMax < guess.bpmMin) bpm = 'lower';
    else bpm = 'partial';
  }
  return {
    song: guess,
    feedback: {
      vocalists: compareArtists(guess.vocalists, answer.vocalists),
      producers: compareArtists(guess.producers, answer.producers),
      year: compareNumber(guess.year, answer.year),
      bpm,
      length: compareNumber(guess.lengthSeconds, answer.lengthSeconds),
    },
  };
}
