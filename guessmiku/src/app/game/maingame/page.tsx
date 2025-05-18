import { vocaloidSong } from "../../lib/testdata";
import Head from 'next/head'

export const metadata = {
  title: "Guess Vocaloid!",
};

export default function FirstPost() {
  return (
        <div>
          <h1>Guess the Vocaloid Song</h1>
          <h2>Guess the song name from the lyrics</h2>
          <div>
            {vocaloidSong.map((song) => (
            <div key={song.id}>
            <h3>{song.songName}</h3>
            <p>{song.singer}</p>
            <p>{song.producer}</p>
            </div>
            ))}
          </div>
        </div>
  )
}