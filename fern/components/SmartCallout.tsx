// Fern's built-in components (Note, Tip, Warning, Danger) are only available in MDX files
// For custom components, we need to define our own callout component
interface CalloutProps {
  title: string;
  children: React.ReactNode;
  variant: 'note' | 'tip' | 'warning' | 'danger';
}

const Callout = ({ title, children, variant }: CalloutProps) => {
  const styles = {
    note: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100',
    tip: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950 dark:border-green-800 dark:text-green-100',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-100',
    danger: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100'
  };

  return (
    <div className={`border-l-4 p-4 ${styles[variant]}`}>
      <div className="font-semibold mb-2">{title}</div>
      <div>{children}</div>
    </div>
  );
};

export const SmartCallout = ({ type = "note", children }: { type?: 'note' | 'tip' | 'warning' | 'danger'; children: React.ReactNode }) => {
  const map = {
    note: { title: "Note", variant: 'note' as const },
    tip: { title: "Tip", variant: 'tip' as const },
    warning: { title: "Warning", variant: 'warning' as const },
    danger: { title: "Important", variant: 'danger' as const }
  };

  const { title, variant } = map[type] ?? map.note;
  return <Callout title={title} variant={variant}>{children}</Callout>;
};