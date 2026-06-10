export type AmbientAudioHandle = {
  stop: () => void;
};

type AudioContextConstructor = new () => AudioContext;

type WindowWithAudioContext = Window & {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
};

const PAD_CHORDS = [
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [164.81, 196, 246.94],
  [185, 233.08, 277.18],
] as const;

export async function startAmbientGameAudio(): Promise<AmbientAudioHandle> {
  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    throw new Error("Audio is not supported in this browser.");
  }

  const context = new AudioContextCtor();
  if (context.state === "suspended") {
    await context.resume();
  }

  const masterGain = context.createGain();
  const startAt = context.currentTime;
  masterGain.gain.setValueAtTime(0.0001, startAt);
  masterGain.gain.exponentialRampToValueAtTime(0.34, startAt + 1.2);
  masterGain.connect(context.destination);

  const sources: AudioScheduledSourceNode[] = [
    createLoopingNoise(context, masterGain, {
      filterType: "bandpass",
      frequency: 720,
      gain: 0.045,
      q: 0.6,
      seconds: 2.7,
    }),
    createLoopingNoise(context, masterGain, {
      filterType: "lowpass",
      frequency: 310,
      gain: 0.032,
      q: 0.35,
      seconds: 4.1,
    }),
  ];
  const timers: number[] = [];
  const pad = createSoftPad(context, masterGain);
  sources.push(...pad.sources);
  timers.push(pad.timer);
  timers.push(
    window.setInterval(() => {
      if (document.hidden) return;
      playNatureBlip(context, masterGain);
    }, 4600),
  );

  let stopped = false;

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      timers.forEach((timer) => window.clearInterval(timer));

      const fadeAt = context.currentTime;
      masterGain.gain.cancelScheduledValues(fadeAt);
      masterGain.gain.setTargetAtTime(0.0001, fadeAt, 0.35);

      window.setTimeout(() => {
        sources.forEach((source) => {
          try {
            source.stop();
          } catch {
            // Some browsers throw when a source is already stopped.
          }
        });
        void context.close();
      }, 1200);
    },
  };
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as WindowWithAudioContext;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function createLoopingNoise(
  context: AudioContext,
  destination: AudioNode,
  options: {
    filterType: BiquadFilterType;
    frequency: number;
    gain: number;
    q: number;
    seconds: number;
  },
) {
  const bufferLength = Math.floor(context.sampleRate * options.seconds);
  const buffer = context.createBuffer(1, bufferLength, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    const fade = Math.sin((Math.PI * index) / channel.length);
    channel[index] = (Math.random() * 2 - 1) * fade;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = options.filterType;
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q;

  const gain = context.createGain();
  gain.gain.value = options.gain;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start();

  return source;
}

function createSoftPad(context: AudioContext, destination: AudioNode) {
  let chordIndex = 0;
  const padGain = context.createGain();
  padGain.gain.value = 0.7;
  padGain.connect(destination);

  const sources = PAD_CHORDS[0].map((frequency, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    voiceGain.gain.value = index === 0 ? 0.018 : 0.011;
    oscillator.connect(voiceGain);
    voiceGain.connect(padGain);
    oscillator.start(context.currentTime + index * 0.04);
    return oscillator;
  });

  const timer = window.setInterval(() => {
    chordIndex = (chordIndex + 1) % PAD_CHORDS.length;
    const chord = PAD_CHORDS[chordIndex] ?? PAD_CHORDS[0];
    const changeAt = context.currentTime + 0.05;
    sources.forEach((source, index) => {
      const nextFrequency = chord[index] ?? chord[0];
      source.frequency.exponentialRampToValueAtTime(
        nextFrequency,
        changeAt + 4,
      );
    });
  }, 14000);

  return { sources, timer };
}

function playNatureBlip(context: AudioContext, destination: AudioNode) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const startFrequency = 840 + Math.random() * 380;
  const endFrequency = 540 + Math.random() * 260;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.45);
  filter.type = "bandpass";
  filter.frequency.value = 980;
  filter.Q.value = 4.5;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.018, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  oscillator.start(now);
  oscillator.stop(now + 0.85);
}
