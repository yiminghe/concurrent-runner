import {
  Task,
  TaskMeta,
  RunnerOptions,
  CancelablePromise,
  ExtractTaskResult,
} from "./types";
import { noop, heapify, heapInsert, ConcurrentRunnerAbortError } from "./utils";

export * from "./types";

export default class CocurrentRunner<T extends Task> {
  private heap: TaskMeta<T>[] = [];
  private running: number = 0;
  private started = false;
  private paused = false;

  constructor(private options: RunnerOptions<T>) {}

  setOptions(options: Partial<RunnerOptions<T>>) {
    Object.assign(this.options, options);
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

  public resume() {
    this.paused = false;
    this.checkAndSchedule();
  }

  public stop() {
    this.started = false;
    this.heap = [];
  }

  private endAndSchedule() {
    this.running--;
    this.checkAndSchedule();
  }

  private checkAndSchedule() {
    if (this.paused) {
      return;
    }
    const {
      concurrency,
      comparator,
      onEmpty = noop,
      onTaskStart = noop,
      onTaskEnd = noop,
    } = this.options;

    while (this.running < concurrency && this.heap.length) {
      const heap = this.heap;
      const taskMeta = heap[0]!;
      if (heap.length > 2) {
        const lastTask = heap.pop()!;
        heap[0] = lastTask;
        heapify(heap, 0, heap.length, comparator);
      } else {
        heap.shift();
      }
      if (taskMeta.canceled) {
        continue;
      }
      this.running++;
      onTaskStart({ task: taskMeta.task });
      taskMeta.start = true;
      const { promise, cancel } = taskMeta.task.run();
      taskMeta.cancel = cancel;
      promise.then(
        (result) => {
          taskMeta.end = true;
          if (!taskMeta.canceled) {
            taskMeta.resolve(result);
            onTaskEnd({ task: taskMeta.task, result });
            this.endAndSchedule();
          }
        },
        (result) => {
          taskMeta.end = true;
          if (!taskMeta.canceled) {
            taskMeta.reject(result);
            onTaskEnd({ task: taskMeta.task, result });
            this.endAndSchedule();
          }
        }
      );
    }

    if (this.running === 0 && this.heap.length === 0) {
      return setTimeout(() => {
        if (this.running === 0 && this.heap.length === 0) {
          onEmpty();
        }
      }, 0);
    }
  }

  public addTask<TT extends T, R = ExtractTaskResult<TT>>(
    task: TT
  ): CancelablePromise<R> {
    const taskMeta: TaskMeta<TT> = {
      task,
      start: false,
      canceled: false,
      reject: noop,
      resolve: noop,
      end: false,
    };
    const {
      heap,
      options: { comparator, onTaskEnd = noop },
    } = this;

    const promise: CancelablePromise<R> = new Promise<R>((resolve, reject) => {
      taskMeta.reject = reject;
      taskMeta.resolve = resolve;
      heapInsert<T>(heap, heap.length, taskMeta, comparator);
      if (this.started) {
        this.checkAndSchedule();
      }
    }) as CancelablePromise<R>;

    promise.cancel = () => {
      taskMeta.canceled = true;
      if (!taskMeta.end) {
        taskMeta.end = true;
        taskMeta.reject(new ConcurrentRunnerAbortError(task));
        if (taskMeta.cancel) {
          taskMeta.cancel();
        }
        if (taskMeta.start) {
          onTaskEnd({ task, result: new ConcurrentRunnerAbortError(task) });
          this.endAndSchedule();
        }
      }
    };

    return promise;
  }
}
