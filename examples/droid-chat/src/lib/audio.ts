type AudioOptions = {
  loop?: boolean;
};

export function createAudio(src: string, volume = 1, opts: AudioOptions = {}) {
  let audio: HTMLAudioElement | null = null;

  const ensureAudio = () => {
    if (!audio) {
      audio = new Audio(src);
      audio.volume = volume;
      audio.loop = Boolean(opts.loop);
    }
    return audio;
  };

  return {
    async play() {
      try {
        const el = ensureAudio();
        el.currentTime = 0;
        await el.play();
      } catch {
        // playback may be blocked by browser policies
      }
    },
    stop() {
      const el = audio;
      if (!el) return;
      el.pause();
      el.currentTime = 0;
    }
  };
}
