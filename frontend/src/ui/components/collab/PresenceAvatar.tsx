import { Avatar } from './Avatar';
import './PresenceAvatar.css';

interface PresenceAvatarProps {
  name: string;
  seed: string;
  size?: 'xs' | 'sm';
  leaving?: boolean;
}

/**
 * An avatar for somebody who is here right now: a ring and a soft pulse around it. The pulse is
 * decoration, the name is always given in text beside it, and it stops with reduced motion.
 */
export function PresenceAvatar({ name, seed, size = 'sm', leaving = false }: PresenceAvatarProps) {
  return (
    <span className="presence-avatar" data-size={size} data-leaving={leaving || undefined}>
      <Avatar name={name} seed={seed} size={size} />
    </span>
  );
}
