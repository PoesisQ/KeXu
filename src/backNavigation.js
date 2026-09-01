export function createBackStack() {
  const handlers = [];

  return {
    register(handler) {
      const entry = { handler };
      handlers.push(entry);
      return () => {
        const index = handlers.lastIndexOf(entry);
        if (index >= 0) handlers.splice(index, 1);
      };
    },
    dispatch() {
      const entry = handlers.at(-1);
      if (!entry) return false;
      entry.handler();
      return true;
    },
    size() {
      return handlers.length;
    }
  };
}

export const backStack = createBackStack();
