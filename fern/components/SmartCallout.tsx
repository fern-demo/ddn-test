import React from 'react';

const Callout = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="callout">
    <strong>{title}</strong>
    {children}
  </div>
);

export const SmartCallout = ({ type = "note", children }: { type?: "note" | "tip" | "warning" | "danger"; children: React.ReactNode }) => {
  const map = {
    note: { title: "Note" },
    tip: { title: "Tip" },
    warning: { title: "Warning" },
    danger: { title: "Important" }
  };

  const { title } = map[type] ?? map.note;
  return <Callout title={title}>{children}</Callout>;
};