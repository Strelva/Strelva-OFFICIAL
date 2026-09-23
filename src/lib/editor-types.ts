

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
