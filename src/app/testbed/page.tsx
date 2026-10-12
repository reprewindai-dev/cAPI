"use client";

export const dynamic = "force-dynamic";

import TestBed from "@/components/TestBed";
import { NetworkSection } from "@/components/Network";

export default function TestBedPage() {
  return (
    <>
      <div className="mx-auto mb-5 max-w-[1220px] [&>*:first-child]:mt-0">
        <NetworkSection view="console" />
      </div>
      <TestBed />
    </>
  );
}
