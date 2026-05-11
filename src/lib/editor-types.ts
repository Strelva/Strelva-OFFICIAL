import type { PageSectionConfig } from "./types";

export type EditableFieldPath = string;

export type EditableNodeType =
  | "section"
  | "text"
  | "image"
  | "button"
  | "link"
  | "content";

export interface EditableNodeRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface EditableNode {
  section: string;
  field?: EditableFieldPath;
  label?: string;
  nodeType: EditableNodeType;
  rect?: EditableNodeRect;
}

export type SafeLayoutToken = NonNullable<PageSectionConfig["layout"]>;

export interface EditorContract {
  section: string;
  label: string;
  fields: EditableFieldPath[];
  layout?: {
    gap?: boolean;
    padding?: boolean;
  };
  codeChangesRequireRequest: boolean;
}
