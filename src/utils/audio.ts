const APP_AUDIO_SOURCES = {
  dice: '/audios/dados.mp3',
  pix: '/audios/audio_pix.mp3',
} as const;

export type AppAudioKey = keyof typeof APP_AUDIO_SOURCES;

export function playAppAudio(key: AppAudioKey) {
  const audio = new Audio(APP_AUDIO_SOURCES[key]);

  audio.currentTime = 0;
  audio.volume = 0.9;

  void audio.play().catch(() => {
    // Browsers can block audio until the user interacts with the page.
  });
}
