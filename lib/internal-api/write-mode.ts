export const cutoverTestEmail = "phase-e-cutover@example.invalid";
export const cutoverClientId = "phase-e-cutover";
export const maintenanceMessage = "系统正在进行短暂维护，请稍后重试。";

// Unknown or absent configuration fails closed. Reads remain available.
export function productionWriteMode() {
  const mode = process.env.HITNOTICE_WRITE_MODE;
  return mode === "open" || mode === "synthetic" ? mode : "maintenance";
}
