interface DraggableItemProps {
  label: string;
}

export function DraggableItem({ label }: DraggableItemProps) {
  return (
    <div className="cursor-grab rounded border border-slate-300 bg-white px-3 py-2 text-sm">
      {label}
    </div>
  );
}
