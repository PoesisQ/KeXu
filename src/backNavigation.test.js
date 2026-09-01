import { describe, expect, it, vi } from 'vitest';
import { createBackStack } from './backNavigation';

describe('back navigation stack', () => {
  it('dispatches only the most recently registered layer', () => {
    const stack = createBackStack();
    const parent = vi.fn();
    const child = vi.fn();
    stack.register(parent);
    stack.register(child);

    expect(stack.dispatch()).toBe(true);
    expect(child).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();
  });

  it('restores the previous layer after cleanup', () => {
    const stack = createBackStack();
    const parent = vi.fn();
    const child = vi.fn();
    stack.register(parent);
    const unregisterChild = stack.register(child);
    unregisterChild();

    stack.dispatch();
    expect(parent).toHaveBeenCalledOnce();
    expect(stack.size()).toBe(1);
  });

  it('reports an empty stack without consuming back', () => {
    expect(createBackStack().dispatch()).toBe(false);
  });
});
