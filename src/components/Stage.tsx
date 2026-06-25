"use client";

import dynamic from "next/dynamic";

const StageFlow = dynamic(() => import("./stage/flow/StageFlow"), { ssr: false });

export default function Stage() {
  return <StageFlow />;
}
