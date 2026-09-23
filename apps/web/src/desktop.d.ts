export {};

declare global {
  interface Window {
    industrialDesktop?: {
      readonly wsOrigin: string;
    };
  }
}
