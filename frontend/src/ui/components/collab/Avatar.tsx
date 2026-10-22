import './Avatar.css';

const HUES = ['teal', 'blue', 'violet', 'pink', 'orange', 'amber', 'green', 'red'] as const;

function hueFor(seed: string): (typeof HUES)[number] {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return HUES[hash % HUES.length];
}

interface AvatarProps {
  name: string;
  seed?: string;
  size?: 'sm' | 'md';
}

/** Decorative: the name always sits next to it in text. */
export function Avatar({ name, seed, size = 'md' }: AvatarProps) {
  return (
    <span className={`avatar avatar--${size}`} data-hue={hueFor(seed ?? name)} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
