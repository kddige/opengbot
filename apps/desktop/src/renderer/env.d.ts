import type { OpenGBotDesktopApi } from "../preload";

declare global {
  interface Window {
    opengbot: OpenGBotDesktopApi;
  }
}
