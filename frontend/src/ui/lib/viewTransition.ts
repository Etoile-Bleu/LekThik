import { flushSync } from 'react-dom';

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

function prefersLessMotion(): boolean {
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Runs a state change inside the browser's view transition, so elements that
 * keep their `view-transition-name` glide to their new place. Where the API is
 * missing, or motion is reduced, the change just happens.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as TransitionDocument;
  if (!doc.startViewTransition || prefersLessMotion()) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}
