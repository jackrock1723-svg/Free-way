import { useEffect, useId, useRef, useState } from 'react';

export function ChatRowMenu({ chat, archived = chat.archived, disabled = false, onPin, onRename, onArchive, onRestore, onDelete }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  const label = `Actions for ${chat.title}`;
  const actions = archived
    ? [
      { label: 'Restore', run: () => onRestore(chat.id) },
      { label: 'Delete', run: () => onDelete(chat) },
    ]
    : [
      { label: chat.pinned ? 'Unpin' : 'Pin', run: () => onPin(chat.id, !chat.pinned) },
      { label: 'Rename', run: () => onRename(chat) },
      { label: 'Archive', run: () => onArchive(chat.id) },
      { label: 'Delete', run: () => onDelete(chat) },
    ];

  useEffect(() => {
    if (!open) return undefined;
    containerRef.current?.querySelector('[role="menuitem"]')?.focus();
    const closeOnOutsidePointer = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  function handleMenuKeyDown(event) {
    const items = Array.from(containerRef.current?.querySelectorAll('[role="menuitem"]') || []);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="chat-row-menu" ref={containerRef}>
      <button
        className="chat-row-menu-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      ><span aria-hidden="true">⋯</span></button>
      {open && <div className="chat-row-menu-popover" id={menuId} role="menu" aria-label={label} onKeyDown={handleMenuKeyDown}>
        {actions.map((action) => <button
          className="chat-row-menu-item"
          type="button"
          role="menuitem"
          key={action.label}
          onClick={() => { action.run(); setOpen(false); }}
        >{action.label}</button>)}
      </div>}
    </div>
  );
}
