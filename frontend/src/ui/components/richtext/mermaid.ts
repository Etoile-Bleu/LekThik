import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

/** What Mermaid is allowed to do: no scripts, no HTML in labels, and a cap on what it will draw. */
function configure(dark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'neutral',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    maxTextSize: 12_000,
    maxEdges: 300,
    suppressErrorRendering: true,
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  });
}

// Mermaid keeps global state, so diagrams are drawn one after the other.
let queue: Promise<unknown> = Promise.resolve();

export interface DiagramResult {
  svg: string;
}

/**
 * Draws a diagram as SVG. The result goes through DOMPurify as well as Mermaid's own strict mode,
 * so what is put on the page can contain neither a script nor an event handler.
 */
export function renderDiagram(id: string, source: string, dark: boolean): Promise<DiagramResult> {
  const job = queue.then(async () => {
    configure(dark);
    const { svg } = await mermaid.render(id, source);
    const clean = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject', 'script'],
    });
    return { svg: clean };
  });
  queue = job.catch(() => undefined);
  return job;
}
