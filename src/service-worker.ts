interface ServiceWorkerRegistrar {
  register(scriptURL: string | URL, options?: RegistrationOptions): Promise<unknown>;
}

interface ServiceWorkerNavigator {
  serviceWorker?: ServiceWorkerRegistrar;
}

interface LoadEventTarget {
  addEventListener(type: "load", listener: () => void): void;
}

export function getServiceWorkerUrl(baseUrl = import.meta.env.BASE_URL): string {
  return `${baseUrl.replace(/\/?$/, "/")}sw.js`;
}

export function registerServiceWorker(
  nav: ServiceWorkerNavigator = navigator,
  target: LoadEventTarget = window,
  baseUrl = import.meta.env.BASE_URL,
): void {
  if (!nav.serviceWorker) {
    return;
  }

  target.addEventListener("load", () => {
    void nav.serviceWorker?.register(getServiceWorkerUrl(baseUrl)).catch(() => undefined);
  });
}
