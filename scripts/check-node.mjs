const major = Number(process.versions.node.split(".")[0]);
if (major !== 24) {
  console.error(
    `Phase 0 requires Node.js 24 LTS. Current: ${process.version}`,
  );
  process.exit(1);
}
console.log(`Node.js ${process.version} OK (24.x)`);
