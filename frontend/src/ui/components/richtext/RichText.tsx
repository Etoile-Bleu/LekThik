import { Suspense, lazy } from 'react';

import type { RichTextProps } from './RichTextImpl';

// The Markdown libraries load the first time a text is drawn, so the board itself stays light.
const Impl = lazy(() => import('./RichTextImpl'));

function Plain({ text }: { text: string }) {
  return (
    <div className="rt">
      <p className="rt-plain">{text}</p>
    </div>
  );
}

/** Draws Markdown, with plain text shown for the instant it takes to load. */
export function RichText(props: RichTextProps) {
  return (
    <Suspense fallback={<Plain text={props.text} />}>
      <Impl {...props} />
    </Suspense>
  );
}
