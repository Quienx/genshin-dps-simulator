// The player's keys work wherever the focus is on the page, but never
// take a key from a field being typed in, a dialog, a menu or a control
// that uses it.
import { describe, expect, it } from 'vitest';

import { playerKeyOf } from '../_components/timeline/usePlayback';
import { FRAMES_PER_SECOND } from '../_lib/frames';

// A focused element that sits in what `inside` matches (a selector of the
// list), as Element.closest answers.
const focusedIn = (...inside: string[]) => ({
  closest: (selector: string) =>
    inside.some((tag) => selector.split(', ').includes(tag)) ? {} : null,
});
const press = (
  key: string,
  target: ReturnType<typeof focusedIn> | null = null,
  modifiers: Partial<
    Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>
  > = {}
) =>
  playerKeyOf({
    key,
    target,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers,
  });

describe('the player’s keys', () => {
  it('play, step, go to either end and zoom', () => {
    expect(press(' ')).toEqual({ kind: 'toggle' });
    expect(press('ArrowRight')).toEqual({
      kind: 'step',
      seconds: 1 / FRAMES_PER_SECOND,
    });
    expect(press('ArrowLeft', null, { shiftKey: true })).toEqual({
      kind: 'step',
      seconds: -1,
    });
    expect(press('Home')).toEqual({ kind: 'start' });
    expect(press('End')).toEqual({ kind: 'end' });
    expect(press('+')).toEqual({ kind: 'zoom', factor: 1.25 });
    expect(press('-')).toEqual({ kind: 'zoom', factor: 0.8 });
    expect(press('a')).toBeNull();
  });

  it('work with the focus on the chart or the page', () => {
    expect(press(' ', focusedIn('div'))).toEqual({ kind: 'toggle' });
  });

  it('leave a field, a dialog and a menu their keys', () => {
    ['input', 'textarea', '[role=dialog]', '[role=listbox]'].forEach(
      (place) => {
        expect(press(' ', focusedIn(place))).toBeNull();
        expect(press('Home', focusedIn(place))).toBeNull();
      }
    );
  });

  it('leave Space and the arrows to a focused control', () => {
    expect(press(' ', focusedIn('button'))).toBeNull();
    expect(press('ArrowRight', focusedIn('[role=radio]'))).toBeNull();
    expect(press('ArrowLeft', focusedIn('[role=separator]'))).toBeNull();
    // Home and End still go to either end.
    expect(press('End', focusedIn('button'))).toEqual({ kind: 'end' });
  });

  it('leave Ctrl, Cmd and Alt combinations alone (browser zoom, edit keys)', () => {
    expect(press('-', null, { ctrlKey: true })).toBeNull();
    expect(press('a', null, { metaKey: true })).toBeNull();
    expect(press(' ', null, { altKey: true })).toBeNull();
  });
});
