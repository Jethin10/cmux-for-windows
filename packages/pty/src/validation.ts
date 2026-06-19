export function assertValidTerminalSize(cols: number, rows: number): void {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error(`Invalid terminal size ${cols}x${rows}; never send 0x0 resize to ConPTY`);
  }
}
