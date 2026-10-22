import {
  Children,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
  createElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import { hostOf, isExternal, needsMath, safeHref } from '@lib/richText';

import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import './RichText.css';

export interface RichTextProps {
  text: string;
  /** How far the headings are pushed down, so they never outrank the title they sit under. */
  headingOffset?: number;
  /** Given for people who can edit, which makes the boxes of a checklist work. */
  onToggleTask?: (index: number) => void;
}

type Plugins = NonNullable<Options['remarkPlugins']>;
type MathPlugins = { remark: Plugins; rehype: Plugins };

function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/**
 * Markdown, drawn without ever reading it as HTML. Raw HTML in the text stays text, links are only
 * kept when they are web or mail addresses, and pictures are never fetched from other sites (that
 * would hand the reader's address to a stranger), they show as a link instead. Maths, highlighting
 * and diagrams each load only when the text needs them.
 */
export default function RichTextImpl({ text, headingOffset = 2, onToggleTask }: RichTextProps) {
  const [math, setMath] = useState<MathPlugins | null>(null);
  const taskIndex = useRef(0);
  taskIndex.current = 0;

  const wantsMath = needsMath(text);
  useEffect(() => {
    if (!wantsMath || math) return;
    let cancelled = false;
    import('./math')
      .then((module) => {
        if (!cancelled) setMath(module.mathPlugins);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wantsMath, math]);

  const components = useMemo<Components>(() => {
    const heading = (level: number) =>
      function Heading({ children }: ComponentPropsWithoutRef<'h1'>) {
        return createElement(
          `h${Math.min(6, level + headingOffset)}`,
          { className: 'rt-heading' },
          children
        );
      };

    return {
      h1: heading(1),
      h2: heading(2),
      h3: heading(3),
      h4: heading(4),
      h5: heading(5),
      h6: heading(6),
      a({ href, children }) {
        const safe = safeHref(href);
        if (!safe) return <span>{children}</span>;
        if (!isExternal(safe)) return <a href={safe}>{children}</a>;
        return (
          <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="rt-link">
            {children}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
      },
      img({ src, alt }) {
        const safe = safeHref(typeof src === 'string' ? src : undefined);
        if (!safe || !isExternal(safe)) return <span>{alt}</span>;
        return (
          <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="rt-link">
            {alt || 'Picture'}
            <span className="rt-note"> (picture on {hostOf(safe)}, not loaded)</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
      },
      pre({ children }) {
        const only = Children.toArray(children)[0] as ReactElement<{
          className?: string;
          children?: ReactNode;
        }>;
        if (!isValidElement(only)) return <pre>{children}</pre>;
        const language = /language-([\w-]+)/.exec(only.props.className ?? '')?.[1] ?? '';
        const code = textOf(only.props.children).replace(/\n$/, '');
        if (language === 'mermaid') return <MermaidDiagram source={code} />;
        return <CodeBlock code={code} language={language} />;
      },
      table({ children }) {
        return (
          <div className="rt-table" role="region" aria-label="Table" tabIndex={0}>
            <table>{children}</table>
          </div>
        );
      },
      th({ children, style }) {
        return (
          <th scope="col" style={style}>
            {children}
          </th>
        );
      },
      li({ className, children }) {
        if (className?.includes('task-list-item')) {
          return (
            <li className="rt-task">
              <label>{children}</label>
            </li>
          );
        }
        return <li>{children}</li>;
      },
      input({ type, checked }) {
        if (type !== 'checkbox') return null;
        const index = taskIndex.current++;
        return (
          <input
            type="checkbox"
            className="rt-check"
            checked={Boolean(checked)}
            disabled={!onToggleTask}
            onChange={() => onToggleTask?.(index)}
          />
        );
      },
    };
  }, [headingOffset, onToggleTask]);

  return (
    <div className="rt">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, ...(math?.remark ?? [])]}
        rehypePlugins={math?.rehype ?? []}
        components={components}
        urlTransform={(url) => url}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
