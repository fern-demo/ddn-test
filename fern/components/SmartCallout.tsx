import { Note, Tip, Warning, Danger } from "fern-docs/components";

export const SmartCallout = ({ type = "note", children }) => {
  const map = {
    note: { C: Note, title: "Note" },
    tip: { C: Tip, title: "Tip" },
    warning: { C: Warning, title: "Warning" },
    danger: { C: Danger, title: "Important" }
  };

  const { C, title } = map[type] ?? map.note;
  return <C title={title}>{children}</C>;
};