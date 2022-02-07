import { Task, TaskMeta, Comparator } from "./types";

export function noop() { }

export class ConcurrentRunnerAbortError extends Error {
  name = "ConcurrentRunnerAbortError";
  constructor(public task: Task) {
    super("ConcurrentRunnerAbortError");
  }
}
export function heapInsert<T extends Task>(
  heap: TaskMeta<T>[],
  index: number,
  value: TaskMeta<T>,
  comparator: Comparator<T>
) {
  heap[index] = value;
  while (index) {
    const parent = ((index - 1) / 2) | 0;
    if (comparator(heap[parent].task, heap[index].task) > 0) {
      swap(heap, index, parent);
      index = parent;
    } else {
      break;
    }
  }
}

export function heapify<T extends Task>(
  heap: TaskMeta<T>[],
  i: number,
  size: number,
  comparator: Comparator<T>
) {
  while (1) {
    const leftIndex = 2 * i + 1;
    const rightIndex = leftIndex + 1;
    let smallestIndex = i;
    if (
      leftIndex < size &&
      comparator(heap[leftIndex].task, heap[smallestIndex].task) < 0
    ) {
      smallestIndex = leftIndex;
    }
    if (
      rightIndex < size &&
      comparator(heap[rightIndex].task, heap[smallestIndex].task) < 0
    ) {
      smallestIndex = rightIndex;
    }
    if (smallestIndex !== i) {
      swap(heap, smallestIndex, i);
      i = smallestIndex;
    } else {
      break;
    }
  }
}

function swap<T extends Task>(heap: TaskMeta<T>[], i: number, j: number) {
  [heap[i], heap[j]] = [heap[j], heap[i]];
}
