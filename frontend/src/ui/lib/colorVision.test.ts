import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Deficiency, closestPair, deltaE, simulate } from './colorVision';

const accessCss = readFileSync(resolve(process.cwd(), 'src/ui/styles/access.css'), 'utf8');

function dots(mode: 'redgreen' | 'blueyellow'): Record<string, string> {
  const start = accessCss.indexOf(`html[data-cvd='${mode}'] .shell {`);
  const block = accessCss.slice(start, accessCss.indexOf('}', start));
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/--label-(\w+)-dot:\s*(#[0-9a-fA-F]{6})/g)) {
    found[match[1]] = match[2];
  }
  return found;
}

// Below roughly 2 two colours look the same, around 10 they are clearly different.
const MIN_DISTANCE = 12;

describe('colour vision simulation', () => {
  it('leaves greys alone', () => {
    const [r, g, b] = simulate('#808080', 'deuteranopia');

    expect(Math.abs(r - 128)).toBeLessThan(3);
    expect(Math.abs(g - 128)).toBeLessThan(3);
    expect(Math.abs(b - 128)).toBeLessThan(3);
  });

  it('makes red and green much closer for red green blindness', () => {
    const normal = deltaE([213, 94, 0], [0, 158, 115]);
    const seen = deltaE(simulate('#d55e00', 'deuteranopia'), simulate('#009e73', 'deuteranopia'));

    expect(seen).toBeLessThan(normal);
  });
});

describe('the standard palette is the problem the modes solve', () => {
  it('has labels that blur together under red green blindness', () => {
    const standard = {
      slate: '#7a8294',
      red: '#d9534a',
      orange: '#e8802a',
      amber: '#d9a514',
      green: '#2fa35c',
      teal: '#14c9a0',
      blue: '#3b78d8',
      violet: '#7a5ce0',
      pink: '#d94d8f',
    };

    expect(closestPair(standard, 'deuteranopia').distance).toBeLessThan(MIN_DISTANCE);
  });
});

describe.each<{ mode: 'redgreen' | 'blueyellow'; deficiencies: Deficiency[] }>([
  { mode: 'redgreen', deficiencies: ['protanopia', 'deuteranopia'] },
  { mode: 'blueyellow', deficiencies: ['tritanopia'] },
])('the $mode palette', ({ mode, deficiencies }) => {
  const palette = dots(mode);

  it('defines all nine label colours', () => {
    expect(Object.keys(palette).sort()).toEqual(
      ['amber', 'blue', 'green', 'orange', 'pink', 'red', 'slate', 'teal', 'violet'].sort()
    );
  });

  for (const deficiency of deficiencies) {
    it(`keeps every pair of colours apart for ${deficiency}`, () => {
      const { distance, pair } = closestPair(palette, deficiency);

      expect(distance, `${pair.join(' and ')} are too close`).toBeGreaterThanOrEqual(MIN_DISTANCE);
    });
  }
});
