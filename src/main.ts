import "./styles.css";
import { nextCount, type CounterAction } from "./counter";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

let count = 0;

app.innerHTML = `
  <section class="counter" aria-labelledby="counter-title">
    <p class="eyebrow">Vanilla TypeScript</p>
    <h1 id="counter-title">Stegosaur Counter</h1>
    <p class="counter-value" data-count aria-live="polite">0</p>
    <div class="counter-actions">
      <button type="button" data-action="decrement">-</button>
      <button type="button" data-action="reset">Reset</button>
      <button type="button" data-action="increment">+</button>
    </div>
  </section>
`;

const countElement = app.querySelector<HTMLElement>("[data-count]");
const actionButtons = app.querySelectorAll<HTMLButtonElement>("[data-action]");

function render(): void {
  if (countElement) {
    countElement.textContent = String(count);
  }
}

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action as CounterAction | undefined;

    if (!action) {
      return;
    }

    count = nextCount(count, action);
    render();
  });
});
