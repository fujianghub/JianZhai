// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import {
  registerTextLayer,
  registeredTextLayerCount,
  textSelectionListenersActive,
  unregisterTextLayer,
} from './pdfTextSelection';

function makeLayer() {
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  const end = document.createElement('div');
  end.className = 'endOfContent';
  layer.append(end);
  document.body.append(layer);
  return { layer, end };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pdfTextSelection', () => {
  it('marks a layer as selecting on mousedown and resets on pointerup', () => {
    const { layer } = makeLayer();
    registerTextLayer(layer, layer.firstElementChild as HTMLElement);
    expect(textSelectionListenersActive()).toBe(true);
    layer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(layer.classList.contains('selecting')).toBe(true);
    document.dispatchEvent(new Event('pointerup'));
    expect(layer.classList.contains('selecting')).toBe(false);
    // endOfContent stays the last child after a reset (re-appended).
    expect(layer.lastElementChild?.classList.contains('endOfContent')).toBe(true);
    unregisterTextLayer(layer);
  });

  it('tears the document listeners down once the last layer unregisters', () => {
    const a = makeLayer();
    const b = makeLayer();
    registerTextLayer(a.layer, a.end);
    registerTextLayer(b.layer, b.end);
    expect(registeredTextLayerCount()).toBe(2);
    unregisterTextLayer(a.layer);
    expect(textSelectionListenersActive()).toBe(true);
    unregisterTextLayer(b.layer);
    expect(registeredTextLayerCount()).toBe(0);
    expect(textSelectionListenersActive()).toBe(false);
    // Events after teardown are inert.
    a.layer.classList.add('selecting');
    document.dispatchEvent(new Event('pointerup'));
    expect(a.layer.classList.contains('selecting')).toBe(true);
  });
});
