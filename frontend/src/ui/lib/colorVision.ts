/**
 * Simulation of the common kinds of colour blindness (Machado, Oliveira and
 * Fernandes, 2009, full severity), used to check that label colours stay
 * apart. Applied in linear RGB, compared in CIE Lab.
 */

export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

type Matrix = [[number, number, number], [number, number, number], [number, number, number]];

const MATRICES: Record<Deficiency, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

type Rgb = [number, number, number];

function toLinear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

export function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function simulate(hex: string, deficiency: Deficiency): Rgb {
  const linear = parseHex(hex).map(toLinear);
  const matrix = MATRICES[deficiency];
  const mixed = matrix.map((row) => row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]);
  return [fromLinear(mixed[0]), fromLinear(mixed[1]), fromLinear(mixed[2])];
}

export function toLab([red, green, blue]: Rgb): [number, number, number] {
  const [r, g, b] = [red, green, blue].map(toLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Perceptual distance between two colours (CIE76), around 2 is just noticeable. */
export function deltaE(first: Rgb, second: Rgb): number {
  const [l1, a1, b1] = toLab(first);
  const [l2, a2, b2] = toLab(second);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** The smallest distance between any two of the colours once seen with `deficiency`. */
export function closestPair(
  colors: Record<string, string>,
  deficiency: Deficiency
): { distance: number; pair: [string, string] } {
  const names = Object.keys(colors);
  let best = { distance: Infinity, pair: [names[0], names[1]] as [string, string] };
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const distance = deltaE(
        simulate(colors[names[i]], deficiency),
        simulate(colors[names[j]], deficiency)
      );
      if (distance < best.distance) {
        best = { distance, pair: [names[i], names[j]] };
      }
    }
  }
  return best;
}
