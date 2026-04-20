"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

type PageTransitionProps = {
  children: ReactNode;
};

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-transition-enter">
      {children}
    </div>
  );
}
