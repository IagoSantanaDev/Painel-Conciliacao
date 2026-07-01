export const DEFAULT_UNDO_HISTORY_LIMIT = 50;

export function createUndoStack(limit = DEFAULT_UNDO_HISTORY_LIMIT) {
  const undoStack = [];
  const redoStack = [];

  return {
    push(before, after, index) {
      if (!before || !after) return;
      undoStack.push({ index, before, after });
      while (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    },
    undo() {
      const op = undoStack.pop();
      if (!op) return null;
      redoStack.push(op);
      return op;
    },
    redo() {
      const op = redoStack.pop();
      if (!op) return null;
      undoStack.push(op);
      return op;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
    size() {
      return undoStack.length;
    },
  };
}
