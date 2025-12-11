import daniloSound from "../../../assets/sounds/danilo.mp3";
import guitarSound from "../../../assets/sounds/guitar.mp3";
import reviSound from "../../../assets/sounds/revi.mp3";

export const sounds = {
  guitar: guitarSound,
  danilo: daniloSound,
  revi: reviSound,
} as const;

export type SoundName = keyof typeof sounds;
