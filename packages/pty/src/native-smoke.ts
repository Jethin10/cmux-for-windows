import { NodePtyBroker } from "./broker.js";

export async function verifyNativeNodePty(): Promise<void> {
  await NodePtyBroker.load();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyNativeNodePty()
    .then(() => {
      console.log("node-pty loaded successfully");
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
