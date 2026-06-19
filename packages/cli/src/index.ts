#!/usr/bin/env node

export function main(argv = process.argv.slice(2)): number {
  if (argv.includes("--help") || argv.length === 0) {
    console.log("cmux: local CLI placeholder. Named-pipe commands arrive in Phase 7.");
    return 0;
  }
  console.error(`Unknown command: ${argv.join(" ")}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
