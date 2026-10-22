import { useEffect, useState } from 'react';

import {
  type EffectiveTheme,
  effectiveTheme,
  readSystemSettings,
  watchSystemSettings,
} from '@lib/appearance';
import { usePrefsStore } from '@lib/prefsStore';

/** The theme actually showing, after "system" has been resolved. */
export function useEffectiveTheme(): EffectiveTheme {
  const theme = usePrefsStore((state) => state.prefs.theme);
  const [system, setSystem] = useState(readSystemSettings);

  useEffect(() => watchSystemSettings(() => setSystem(readSystemSettings())), []);

  return effectiveTheme(theme, system);
}
