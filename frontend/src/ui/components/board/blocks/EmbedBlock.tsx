import { useId, useState } from 'react';

import { announce } from '@lib/announcer';
import { embedConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import { useEmbedConsent } from '@lib/embedConsent';
import { PROVIDERS, embedSrc, openSrc } from '@lib/embeds';

import { ExternalLinkIcon, PlayIcon } from '../../ui/Icons';
import './EmbedBlock.css';

interface EmbedBlockProps {
  block: BoardList;
}

/**
 * Outside content, held back until someone asks for it. Until then nothing is requested from the
 * provider at all: no frame, no thumbnail, no script, so no address reaches a third party. The
 * placeholder says who would receive what, and a press on the button is the choice. People who
 * want it remembered can say so, on this device only, and withdraw it in Settings.
 */
export function EmbedBlock({ block }: EmbedBlockProps) {
  const config = embedConfig(block);
  const allowed = useEmbedConsent((state) => (config ? state.allowed[config.provider] : false));
  const allow = useEmbedConsent((state) => state.allow);
  const [loaded, setLoaded] = useState(false);
  const [remember, setRemember] = useState(false);
  const rememberId = useId();

  if (!config) {
    return (
      <div className="embed-block embed-block--empty">
        <p>This embed shows nothing yet. Open its settings to choose what to show.</p>
      </div>
    );
  }

  const provider = PROVIDERS[config.provider];
  const src = embedSrc(config.provider, config.id);
  const page = openSrc(config.provider, config.id);
  const showing = (loaded || allowed) && src !== null;

  if (showing && src) {
    return (
      <div className="embed-block">
        <div className="embed-block__frame" data-kind={provider.shape}>
          <iframe
            src={src}
            title={config.title}
            loading="lazy"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        </div>
        <div className="embed-block__foot">
          <span className="embed-block__source">
            From {provider.name}, loaded because you asked.
            {page && (
              <>
                {' '}
                <a href={page} target="_blank" rel="noopener noreferrer">
                  Open it in a new tab
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>{' '}
                if nothing shows.
              </>
            )}
          </span>
          {!allowed && (
            <button
              type="button"
              className="embed-block__stop"
              onClick={() => {
                setLoaded(false);
                announce(`${provider.name} content removed from this page.`);
              }}
            >
              Stop and remove
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="embed-block">
      <div className="embed-block__facade" data-kind={provider.shape}>
        <span className="embed-block__badge" aria-hidden="true">
          <PlayIcon size={22} />
        </span>
        <p className="embed-block__title">{config.title}</p>
        <p className="embed-block__notice">
          Showing this {provider.what} loads it from <strong>{provider.name}</strong>.{' '}
          {provider.company} will receive your IP address and may set cookies. Nothing has been
          requested yet.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            if (remember) allow(config.provider);
            setLoaded(true);
            announce(`Loading ${provider.name} ${provider.what}.`);
          }}
        >
          {provider.action}
        </button>
        <div className="embed-block__remember">
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <label htmlFor={rememberId}>
            Remember for {provider.name} on this device
            <span className="embed-block__remember-hint">
              You can withdraw this in Settings, Privacy.
            </span>
          </label>
        </div>
        <a
          className="embed-block__policy"
          href={provider.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {provider.name} privacy policy <ExternalLinkIcon size={12} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
