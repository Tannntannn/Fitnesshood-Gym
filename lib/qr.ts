import QRCode from "qrcode";
import type { UserRole } from "@prisma/client";

const rolePrefixMap: Record<UserRole, string> = {
  MEMBER: "MEM",
  NON_MEMBER: "NMB",
  WALK_IN: "WLK",
  WALK_IN_REGULAR: "WIR",
};

export function buildQrString(role: UserRole): string {
  // Numeric suffix is generally easier for low-quality scanners/cameras.
  const suffix = Math.floor(10000000 + Math.random() * 90000000).toString();
  // Example: GYM-MEM-48271635
  return `GYM-${rolePrefixMap[role]}-${suffix}`;
}

export async function generateQrBase64(qrString: string): Promise<string> {
  // Lower density improves recognition on budget scanners/cameras.
  return QRCode.toDataURL(qrString, { width: 768, margin: 4, errorCorrectionLevel: "L" });
}
