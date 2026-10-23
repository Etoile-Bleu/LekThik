import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnouncer } from './announcer';
import { useFullscreenStore, watchFullscreen } from './fullscreenStore';

function browser(options: { enabled: boolean; request?: () => Promise<void> }) {
  Object.defineProperty(document, 'fullscreenEnabled', {
    value: options.enabled,
    configurable: true,
  });
  Object.defineProperty(document, 'fullscreenElement', {
    value: null,
    configurable: true,
    writable: true,
  });
  document.documentElement.requestFullscreen = vi.fn(options.request ?? (() => Promise.resolve()));
  document.exitFullscreen = vi.fn(() => Promise.resolve());
}

describe('fullscreen', () => {
  beforeEach(() => {
    useFullscreenStore.setState({ active: false, real: false, navOpen: false });
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides the page chrome at once, then asks the browser to go full screen', async () => {
    browser({ enabled: true });

    const entering = useFullscreenStore.getState().enter();
    expect(useFullscreenStore.getState().active).toBe(true);
    await entering;

    expect(document.documentElement.requestFullscreen).toHaveBeenCalledWith({
      navigationUI: 'hide',
    });
    expect(useFullscreenStore.getState().real).toBe(true);
    expect(useAnnouncer.getState().message).toContain('Full screen');
  });

  it('still clears the page when the browser cannot or will not go full screen', async () => {
    browser({ enabled: false });
    await useFullscreenStore.getState().enter();
    expect(useFullscreenStore.getState()).toMatchObject({ active: true, real: false });

    useFullscreenStore.setState({ active: false });
    browser({ enabled: true, request: () => Promise.reject(new Error('refused')) });
    await useFullscreenStore.getState().enter();
    expect(useFullscreenStore.getState()).toMatchObject({ active: true, real: false });
  });

  it('leaves full screen from the button, closing the navigation too', async () => {
    browser({ enabled: true });
    await useFullscreenStore.getState().enter();
    useFullscreenStore.getState().setNavOpen(true);
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      configurable: true,
    });

    await useFullscreenStore.getState().exit();

    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(useFullscreenStore.getState()).toMatchObject({
      active: false,
      real: false,
      navOpen: false,
    });
    expect(useAnnouncer.getState().message).toBe('Left full screen.');
  });

  it('toggles', async () => {
    browser({ enabled: false });

    await useFullscreenStore.getState().toggle();
    expect(useFullscreenStore.getState().active).toBe(true);
    await useFullscreenStore.getState().toggle();
    expect(useFullscreenStore.getState().active).toBe(false);
  });

  it('only slides the navigation in while in full screen', () => {
    useFullscreenStore.getState().setNavOpen(true);
    expect(useFullscreenStore.getState().navOpen).toBe(false);

    useFullscreenStore.setState({ active: true });
    useFullscreenStore.getState().setNavOpen(true);
    expect(useFullscreenStore.getState().navOpen).toBe(true);
  });

  it('comes back with the browser when Escape ends full screen', async () => {
    browser({ enabled: true });
    const stop = watchFullscreen();
    await useFullscreenStore.getState().enter();
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(useFullscreenStore.getState().active).toBe(false);
    stop();
  });

  it('does not end the chrome only mode when the browser reports a change', async () => {
    browser({ enabled: false });
    const stop = watchFullscreen();
    await useFullscreenStore.getState().enter();

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(useFullscreenStore.getState().active).toBe(true);
    stop();
  });
});
