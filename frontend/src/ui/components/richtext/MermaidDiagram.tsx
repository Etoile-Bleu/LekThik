import { useEffect, useId, useState } from 'react';

import { useEffectiveTheme } from '@hooks/useEffectiveTheme';

import './MermaidDiagram.css';

interface MermaidDiagramProps {
  source: string;
}

type State =
  { kind: 'loading' } | { kind: 'ready'; svg: string } | { kind: 'error'; message: string };

function metaOf(source: string, name: 'accTitle' | 'accDescr'): string {
  return new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'm').exec(source)?.[1].trim() ?? '';
}

/**
 * A Mermaid diagram, drawn on demand. The library is large, so it is only loaded when a diagram is
 * on screen. The source is always available as text underneath, which is the alternative for
 * anyone who cannot see the drawing, and a title and description written with `accTitle` and
 * `accDescr` are read out with it.
 */
export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const theme = useEffectiveTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const id = `diagram${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const dark = theme !== 'light';
  const title = metaOf(source, 'accTitle');
  const description = metaOf(source, 'accDescr');

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    import('./mermaid')
      .then((module) => module.renderDiagram(id, source, dark))
      .then((result) => {
        if (!cancelled) setState({ kind: 'ready', svg: result.svg });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'The diagram could not be drawn.';
        setState({ kind: 'error', message: message.split('\n').slice(0, 3).join(' ') });
      });
    return () => {
      cancelled = true;
    };
  }, [id, source, dark]);

  return (
    <figure className="rt-diagram" data-state={state.kind}>
      {title && <figcaption className="rt-diagram__title">{title}</figcaption>}
      {state.kind === 'loading' && (
        <p className="rt-diagram__status" role="status">
          Drawing the diagram…
        </p>
      )}
      {state.kind === 'error' && (
        <p className="rt-diagram__error" role="alert">
          This diagram has a mistake and could not be drawn. {state.message}
        </p>
      )}
      {state.kind === 'ready' && (
        <div
          className="rt-diagram__canvas"
          role="region"
          aria-label={title ? `Diagram: ${title}` : 'Diagram'}
          tabIndex={0}
          // The SVG was drawn by Mermaid in strict mode and cleaned by DOMPurify.
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )}
      {description && <p className="sr-only">{description}</p>}
      <details className="rt-diagram__source">
        <summary>Diagram source</summary>
        <pre>
          <code>{source}</code>
        </pre>
      </details>
    </figure>
  );
}
