

interface Task<T = any> {
  run: () => Promise<T>;
}

interface TaskMeta {
  task: Task;
  cancel: boolean;
  resolve: Function;
  reject: Function;
}
type Comparator = (t1: Task, t2: Task) => -1 | 0 | 1;

type CancelablePromise<T> = Promise<T> & { cancel: () => void };

function noop() { }

class CoRunner {
  private heap: TaskMeta[] = [];
  private running: Set<TaskMeta> = new Set();
  private started = false;
  private paused = false;

  constructor(private concurrency: number, private comparator: Comparator) {

  }

  public setConcurrency(concurrency: number) {
    this.concurrency = concurrency;
  }

  public start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.checkAndSchedule();
  }

  public pause() {
    this.paused = true;
  }

  public cancelAllRunning() {
    for (const t of Array.from(this.running)) {
      t.cancel = true;
    }
  }

  public resume() {
    this.paused = false;
    this.checkAndSchedule();
  }

  public stop() {
    this.started = false;
    this.heap = [];
  }

  private endAndSchedule(taskMeta: TaskMeta) {
    this.running.delete(taskMeta);
    this.checkAndSchedule();
  }

  private checkAndSchedule() {
    if (this.paused) {
      return;
    }
    while (this.running.size < this.concurrency && this.heap.length) {
      const heap = this.heap;
      const taskMeta = heap.shift()!;
      if (heap.length > 1) {
        const lastTask = heap.pop()!;
        heap.unshift(lastTask);
        heapify(heap, 0, heap.length, this.comparator);
      }
      if (taskMeta.cancel) {
        continue;
      }
      this.running.add(taskMeta);
      taskMeta.task.run().then((ret) => {
        this.endAndSchedule(taskMeta);
        if (!taskMeta.cancel) {
          taskMeta.resolve(ret);
        }
      }, (ret) => {
        this.endAndSchedule(taskMeta);
        if (!taskMeta.cancel) {
          taskMeta.reject(ret);
        }
      });
    }
  }

  public addTask<T>(task: Task<T>): CancelablePromise<T> {
    const taskMeta: TaskMeta = {
      task,
      cancel: false,
      reject: noop,
      resolve: noop,
    }
    const { heap } = this;

    const promise: CancelablePromise<T> = new Promise<T>((resolve, reject) => {
      taskMeta.reject = reject;
      taskMeta.resolve = resolve;
      insertHeap(heap, heap.length, taskMeta, this.comparator);
      if (this.started) {
        this.checkAndSchedule();
      }
    }) as CancelablePromise<T>;

    promise.cancel = () => {
      taskMeta.cancel = true;
    };

    return promise;
  }
}


function insertHeap(heap: TaskMeta[], index: number, value: TaskMeta, comparator: Comparator) {
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

function heapify(heap: TaskMeta[], i: number, size: number, comparator: Comparator) {
  const leftIndex = 2 * i + 1;
  const rightIndex = leftIndex + 1;
  let smallestIndex = i;
  if (leftIndex < size && comparator(heap[leftIndex].task, heap[smallestIndex].task) < 0) {
    smallestIndex = leftIndex;
  }
  if (rightIndex < size && comparator(heap[rightIndex].task, heap[smallestIndex].task) < 0) {
    smallestIndex = rightIndex;
  }
  if (smallestIndex !== i) {
    swap(heap, smallestIndex, i);
    heapify(heap, smallestIndex, size, comparator);
  }
}

function swap(heap: TaskMeta[], i: number, j: number) {
  [heap[i], heap[j]] = [heap[j], heap[i]];
}
