"use client";

import { Button } from "@/components/ui/button";

export function QrDisplay({ name, role, qrCodeImage }: { name: string; role: string; qrCodeImage: string }) {
  const printQr = () => window.print();
  const downloadQr = () => {
    const link = document.createElement("a");
    link.href = qrCodeImage;
    link.download = `${name.replace(/\s+/g, "_")}_QR.png`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-5 bg-gradient-to-b from-white to-slate-50 print:shadow-none print:border-0 print:p-0">
        <p className="font-semibold text-slate-900">{name}</p>
        <p className="text-sm text-slate-500">{role}</p>
        {/* Using img to keep QR pixels crisp for scanner compatibility. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrCodeImage}
          alt="QR Code"
          width={360}
          height={360}
          className="mt-4 mx-auto block w-[360px] h-[360px] max-w-full bg-white border border-slate-200 p-3 rounded-xl shadow-sm"
          style={{ imageRendering: "pixelated" }}
        />
        <p className="mt-3 text-xs text-center text-slate-500">Present this code clearly to the scanner.</p>
      </div>
      <div className="flex gap-2 print:hidden">
        <Button className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90" onClick={printQr}>
          Print QR
        </Button>
        <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={downloadQr}>
          Download QR
        </Button>
      </div>
    </div>
  );
}
