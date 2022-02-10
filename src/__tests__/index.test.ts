import CoRunner, { Task } from "../index";

describe("concurrent runner", () => {
  interface TimeTask<U = any> extends Task<U> {
    time: number;
  }
  
  function timeout(d: number): Promise<number> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(d);
      }, d);
    });
  }
  
  function eq(r1: number, r3: number) {
    return Math.abs(r1 - r3) < 20;
  }

  function getRunner() {
    const r = new CoRunner<TimeTask>({
      concurrency: 2,
      comparator(t: TimeTask, t2: TimeTask) {
        return t.time === t2.time ? 0 : t.time > t2.time ? 1 : -1;
      },
    });
    return r;
  }
  function getRunnerWithTasks() {
    const r = getRunner();
    const ret: number[][] = [];
    const taskHandles = [];
    const times = [300, 100, 500, 100];
    for (let time = 0; time < times.length; time++) {
      const p = r.addTask({
        run() {
          return {
            promise: timeout(times[time]),
          };
        },
        time,
      });
      taskHandles.push(p);
      p.promise.then(
        (r) => {
          ret.push([time, r]);
        },
        (r) => {
          ret.push([time, r]);
        }
      );
    }
    return { r, ret, taskHandles };
  }

  it("works for concurrency", (done) => {
    const { r, ret } = getRunnerWithTasks();
    const startTime: number[][] = [];
    const start = Date.now();

    r.setOptions({
      onTaskStart(info) {
        startTime.push([info.task.time, Date.now() - start]);
      },
      onEmpty() {
        expect(eq(startTime[2][1], 100)).toBe(true);
        expect(eq(startTime[3][1], 300)).toBe(true);
        expect(startTime.map((r) => r[0])).toEqual([0, 1, 2, 3]);
        expect(ret.map((r) => r[0])).toEqual([1, 0, 3, 2]);

        done();
      },
    });

    r.start();
  });

  it("can cancel running", (done) => {
    const { r, ret, taskHandles } = getRunnerWithTasks();
    const startTime: number[][] = [];
    const start = Date.now();

    setTimeout(() => {
      taskHandles[2].cancel();
    }, 200);

    r.setOptions({
      onTaskStart(info) {
        startTime.push([info.task.time, Date.now() - start]);
      },
      onEmpty() {
        expect(eq(startTime[2][1], 100)).toBe(true);
        expect(eq(startTime[3][1], 200)).toBe(true);
        expect(startTime.map((r) => r[0])).toEqual([0, 1, 2, 3]);
        expect(ret.map((r) => r[0])).toEqual([1, 2, 0, 3]);
        expect((ret[1][1] as any).name).toEqual("ConcurrentRunnerAbortError");
        done();
      },
    });

    r.start();
  });

  it("can cancel waiting", (done) => {
    const { r, ret, taskHandles } = getRunnerWithTasks();
    const startTime: number[][] = [];
    const start = Date.now();

    setTimeout(() => {
      taskHandles[3].cancel();
    }, 200);

    r.setOptions({
      onTaskStart(info) {
        startTime.push([info.task.time, Date.now() - start]);
      },
      onEmpty() {
        expect(eq(startTime[2][1], 100)).toBe(true);
        expect(startTime.map((r) => r[0])).toEqual([0, 1, 2]);
        expect(ret.map((r) => r[0])).toEqual([1, 3, 0, 2]);
        expect((ret[1][1] as any).name).toEqual("ConcurrentRunnerAbortError");
        done();
      },
    });

    r.start();
  });

  function runWithCancel(fn: (...args: any) => Generator, ...args: any[]): { promise: Promise<any>; cancel: () => void; } {
    const gen = fn(...args);
    let cancelled: boolean, cancel: () => void = function () { };
    const promise = new Promise((resolve, reject) => {
      cancel = () => {
        cancelled = true;
      };

      onFulfilled();

      function onFulfilled(res?: any) {
        if (!cancelled) {
          let result: any;
          try {
            result = gen.next(res);
          } catch (e) {
            return reject(e);
          }
          next(result);
          return null;
        }
      }

      function onRejected(err: any) {
        var result: any;
        try {
          result = gen.throw(err);
        } catch (e) {
          return reject(e);
        }
        next(result);
      }

      function next({ done, value }: any) {
        if (done) {
          return resolve(value);
        }
        return value.then(onFulfilled, onRejected);
      }
    });

    return { promise, cancel };
  }

  function getCancelableRunner() {
    const r = getRunner();
    const ret: any[] = [];
    const ret2: any[] = [];

    const p = r.addTask({
      run() {
        return runWithCancel(function* r() {
          ret2.push(1);
          yield timeout(200);
          ret2.push(2);
          yield timeout(300);
          ret2.push(3);
          return 4;
        });
      },
      time: 1,
    });
    p.promise.then(
      (r) => {
        ret.push(r);
      },
      (r) => {
        ret.push(r);
      }
    );
    return { r, p,ret, ret2 };
  }

  it('do not call cancel', (done) => {
    const { r, ret, ret2 } = getCancelableRunner();
    r.setOptions({
      onEmpty() {
        expect(ret).toEqual([4]);
        expect(ret2).toEqual([1,2,3]);
        done();
      }
    })
    r.start();
  });

  it('call task cancel', (done) => {
    const { r,p, ret, ret2 } = getCancelableRunner();
    r.setOptions({
      onEmpty() {
        expect(ret.length).toEqual(1);
        expect(ret[0].name).toEqual('ConcurrentRunnerAbortError');
        expect(ret2).toEqual([1,2]);
        done();
      }
    })
    r.start();
    setTimeout(() => {
      p.cancel();
    }, 300);
  });
});
