/// <reference types="vite/client" />

import type { CmuxBridge } from "../preload/index.js";

declare global {
  interface Window {
    cmux: CmuxBridge;
  }
}
