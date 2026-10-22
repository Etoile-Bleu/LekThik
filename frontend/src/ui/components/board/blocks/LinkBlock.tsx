import { linkConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import { hostOf } from '@lib/richText';

import { ExternalLinkIcon, LinkIcon } from '../../ui/Icons';
import './LinkBlock.css';

interface LinkBlockProps {
  block: BoardList;
}

/**
 * A card for a page. It shows the title that was written and the real site, so people know where
 * a press will take them. Nothing is fetched from the page, not a preview, not an icon, so the
 * link costs nobody a request until it is opened, in a new tab without handing over this page.
 */
export function LinkBlock({ block }: LinkBlockProps) {
  const config = linkConfig(block);
  const host = hostOf(config.url);

  return (
    <div className="link-block">
      <a
        className="link-block__card"
        href={config.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        <span className="link-block__icon" aria-hidden="true">
          <LinkIcon size={18} />
        </span>
        <span className="link-block__text">
          <span className="link-block__title">{config.title || host}</span>
          <span className="link-block__host">{host}</span>
          <span className="link-block__url">{config.url}</span>
        </span>
        <span className="link-block__out" aria-hidden="true">
          <ExternalLinkIcon size={16} />
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );
}
