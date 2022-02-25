export interface Task<T = any> {
  run: () => { promise: Promise<T>; cancel?: () => void; };
}

export type ExtractTaskResult<T> = T extends Task<infer U> ? U : never;

export interface TaskMeta<T extends Task> {
  task: T;
  canceled: boolean;
  resolve: Function;
  reject: Function;
  start: boolean;
  end: boolean;
  cancel?: Function;
}

/**
 * -1 means higher priority
 */
export type Comparator<T extends Task = Task> = (t1: T, t2: T) => -1 | 0 | 1;

export type TaskHandle<T> = {
  promise: Promise<T>;
  cancel: () => void
};

export interface RunnerOptions<T extends Task = Task> {
  concurrency: number;
  comparator: Comparator<T>;
  onEmpty?: () => void;
  onTaskStart?: (o: { task: T }) => void;
  onTaskEnd?: (o: { task: T; result: any }) => void;
}
