import CoRunner, { Task } from "../index";

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

describe("concurrent runner", () => {
  function getR() {
    const r = new CoRunner<TimeTask>({
      concurrency: 2,
      comparator(t: TimeTask, t2: TimeTask) {
        return t.time === t2.time ? 0 : t.time > t2.time ? 1 : -1;
      },
    });
    const ret: number[][] = [];
    const promises = [];
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
      promises.push(p);
      p.then(
        (r) => {
          ret.push([time, r]);
        },
        (r) => {
          ret.push([time, r]);
        }
      );
    }
    return { r, ret, promises };
  }

  it("works for concurrency", (done) => {
    const { r, ret } = getR();
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
    const { r, ret, promises } = getR();
    const startTime: number[][] = [];
    const start = Date.now();

    setTimeout(() => {
      promises[2].cancel();
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
    const { r, ret, promises } = getR();
    const startTime: number[][] = [];
    const start = Date.now();

    setTimeout(() => {
      promises[3].cancel();
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
});
