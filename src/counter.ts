export type CounterAction = "decrement" | "increment" | "reset";

export function nextCount(current: number, action: CounterAction): number {
  switch (action) {
    case "decrement":
      return current - 1;
    case "increment":
      return current + 1;
    case "reset":
      return 0;
  }
}
