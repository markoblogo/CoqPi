"use client";
import React from "react";
import { ProjectPreview } from "@webprodigies/flute/preview";
import { sceneModules } from "./catalog";
// Host-owned development flag: no process, Vite or Electron globals in this adapter.
export function FluteProjectPreview({ children, enabled, active, ...props }) {
  if (!enabled) return children;
  return <ProjectPreview {...props} projectId="b49722d7-0c33-415b-aa5d-fb327bec6837" enabled={enabled} active={active} sceneModules={sceneModules}>{children}</ProjectPreview>;
}
