import { snippetConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';

import { CodeBlock } from '../../richtext/CodeBlock';
import { CodeIcon } from '../../ui/Icons';
import './SnippetBlock.css';

interface SnippetBlockProps {
  block: BoardList;
  editable: boolean;
  onAddCode: (blockId: string) => void;
}

export function SnippetBlock({ block, editable, onAddCode }: SnippetBlockProps) {
  const config = snippetConfig(block);

  if (config.code.trim() === '') {
    return (
      <div className="snippet-block snippet-block--empty">
        <CodeIcon size={26} />
        <p className="snippet-block__title">No code yet</p>
        <p>A command, a config or a query, with its language.</p>
        {editable && (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => onAddCode(block.id)}
          >
            Add code
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="snippet-block">
      <CodeBlock
        code={config.code}
        language={config.language === 'text' ? '' : config.language}
        filename={config.filename}
        lineNumbers={config.line_numbers}
      />
    </div>
  );
}
