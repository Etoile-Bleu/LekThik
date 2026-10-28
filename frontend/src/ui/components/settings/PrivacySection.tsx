import { announce } from '@lib/announcer';
import { useEmbedConsent } from '@lib/embedConsent';
import { PROVIDERS, PROVIDER_ORDER } from '@lib/embeds';
import { WEATHER_PROVIDER } from '@lib/weather';

import { Switch } from '../ui/Switch';
import './PrivacySection.css';

const POLICY_URL = 'https://github.com/Etoile-Bleu/LekThik/blob/main/docs/privacy.md';

/**
 * What LekThik keeps, in plain words, and the one choice that is yours to make here: whether
 * videos and calendars from other companies may load without asking. The choice is kept in this
 * browser only and can be taken back as easily as it was given.
 */
export function PrivacySection() {
  const allowed = useEmbedConsent((state) => state.allowed);
  const allow = useEmbedConsent((state) => state.allow);
  const withdraw = useEmbedConsent((state) => state.withdraw);
  const withdrawAll = useEmbedConsent((state) => state.withdrawAll);
  const anyAllowed = [...PROVIDER_ORDER, 'open_meteo' as const].some(
    (provider) => allowed[provider]
  );

  return (
    <div className="privacy">
      <p className="privacy__lead">
        LekThik has no advertising, no analytics and no tracking. It loads no fonts, scripts or
        pictures from other companies, and it never sends your address anywhere unless you press a
        button that says so.
      </p>

      <section className="privacy__block" aria-labelledby="privacy-kept">
        <h3 id="privacy-kept" className="settings-block__title">
          What LekThik keeps about you
        </h3>
        <ul className="privacy__list">
          <li>Your email address, your name and a scrambled form of your password.</li>
          <li>Your settings, so they follow you to every device.</li>
          <li>
            What you and your teammates write: boards, lists, cards, notes and the pictures you add.
          </li>
          <li>
            Nothing about what you read, watch or click, and nothing is shared with anyone outside
            the workspace.
          </li>
        </ul>
      </section>

      <section className="privacy__block" aria-labelledby="privacy-pictures">
        <h3 id="privacy-pictures" className="settings-block__title">
          Pictures
        </h3>
        <ul className="privacy__list">
          <li>
            A picture is kept in LekThik&apos;s own database, never at a public address, and is
            shown only to members of its workspace.
          </li>
          <li>
            When you add one, LekThik makes a new copy from its pixels, which removes where it was
            taken, the camera, the time and the author.
          </li>
          <li>
            Deleting a picture&apos;s block, its board or its workspace deletes the picture with it.
          </li>
        </ul>
      </section>

      <section className="privacy__block" aria-labelledby="privacy-outside">
        <h3 id="privacy-outside" className="settings-block__title">
          Videos, calendars, drawings and pages from other companies
        </h3>
        <p className="privacy__hint">
          An embed block shows a placeholder and loads nothing until someone presses the button on
          it. If you chose to remember that for a provider, it is listed here. The choice is kept in
          this browser only, LekThik never sees it.
        </p>
        <div className="privacy__providers">
          {PROVIDER_ORDER.map((provider) => (
            <div key={provider} className="setting-row setting-row--toggle">
              <Switch
                label={`${PROVIDERS[provider].name}, run by ${PROVIDERS[provider].company}`}
                hint={
                  allowed[provider]
                    ? 'Loads without asking on this device.'
                    : 'Asks each time before loading.'
                }
                checked={allowed[provider] === true}
                onChange={(on) => {
                  if (on) allow(provider);
                  else withdraw(provider);
                  announce(
                    on
                      ? `${PROVIDERS[provider].name} will load without asking.`
                      : `${PROVIDERS[provider].name} will ask before loading.`
                  );
                }}
              />
            </div>
          ))}
          <div className="setting-row setting-row--toggle">
            <Switch
              label={`${WEATHER_PROVIDER.name}, for the weather in a clocks block`}
              hint={
                allowed.open_meteo
                  ? 'Loads without asking on this device.'
                  : 'Asks each time before loading.'
              }
              checked={allowed.open_meteo === true}
              onChange={(on) => {
                if (on) allow('open_meteo');
                else withdraw('open_meteo');
                announce(
                  on
                    ? `${WEATHER_PROVIDER.name} will load without asking.`
                    : `${WEATHER_PROVIDER.name} will ask before loading.`
                );
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm privacy__withdraw"
          disabled={!anyAllowed}
          onClick={() => {
            withdrawAll();
            announce('Every choice withdrawn. Outside content will ask before loading.');
          }}
        >
          Withdraw every choice
        </button>
      </section>

      <section className="privacy__block" aria-labelledby="privacy-rights">
        <h3 id="privacy-rights" className="settings-block__title">
          Your rights
        </h3>
        <p className="privacy__hint">
          You can correct what you wrote and delete it, and deleting a block, board or workspace
          removes its content for good. Exporting or deleting your whole account is not in the app
          yet, ask whoever runs this LekThik to do it. The full account of what is stored, why and
          for how long is in the{' '}
          <a href={POLICY_URL} target="_blank" rel="noopener noreferrer">
            privacy notes
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      </section>
    </div>
  );
}
