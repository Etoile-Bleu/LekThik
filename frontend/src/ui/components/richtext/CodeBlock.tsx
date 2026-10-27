import { useEffect, useRef, useState } from 'react';

import { announce } from '@lib/announcer';

import { CheckIcon } from '../ui/Icons';
import './CodeBlock.css';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  lineNumbers?: boolean;
}

function gutterOf(code: string): string {
  const lines = code.replace(/\n$/, '').split('\n').length;
  return Array.from({ length: lines }, (_, index) => index + 1).join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Code in its own scrollable region that a keyboard can reach, with the language named and a
 * button that copies it. Highlighting is loaded only when a block of code is on screen.
 */
export function CodeBlock({ code, language, filename = '', lineNumbers = false }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    if (language) {
      import('./highlight')
        .then((module) => {
          if (!cancelled) setHtml(module.highlight(code, language));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    const done = await copyText(code);
    announce(done ? 'Code copied.' : 'Could not copy the code.');
    if (done) {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    }
  }

  const name = language || 'text';

  return (
    <div className="rt-code">
      <div className="rt-code__bar">
        <span className="rt-code__lang">
          {filename && <span className="rt-code__file">{filename}</span>}
          {name}
        </span>
        <button type="button" className="rt-code__copy" onClick={() => void copy()}>
          {copied ? <CheckIcon size={13} /> : null}
          {copied ? 'Copied' : 'Copy'}
          <span className="sr-only"> code</span>
        </button>
      </div>
      {/* A region so a keyboard can scroll a long line, and so it has a name. */}
      <div
        className="rt-code__scroll"
        role="region"
        aria-label={`Code, ${filename || name}`}
        tabIndex={0}
      >
        <pre>
          {lineNumbers && (
            <span className="rt-code__gutter" aria-hidden="true">
              {gutterOf(code)}
            </span>
          )}
          {html !== null ? (
            <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <code>{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
