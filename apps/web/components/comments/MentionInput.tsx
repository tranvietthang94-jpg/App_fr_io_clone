"use client";

import { useRef, useState } from "react";

export interface MentionMember {
  userId: string;
  name: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onMentionAdded?: (name: string, userId: string) => void;
  members: MentionMember[];
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}

export function MentionInput({
  value,
  onChange,
  onMentionAdded,
  members,
  placeholder,
  className,
  onEnter,
  autoFocus,
}: MentionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);

    const cursor = e.target.selectionStart ?? next.length;
    const uptoCursor = next.slice(0, cursor);
    const atIndex = uptoCursor.lastIndexOf("@");
    if (atIndex === -1 || /\s/.test(uptoCursor.slice(atIndex + 1))) {
      setQuery(null);
      return;
    }
    setQuery(uptoCursor.slice(atIndex + 1));
  };

  const selectMember = (member: MentionMember) => {
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? value.length;
    const uptoCursor = value.slice(0, cursor);
    const atIndex = uptoCursor.lastIndexOf("@");
    if (atIndex === -1) return;

    const before = value.slice(0, atIndex);
    const after = value.slice(cursor);
    onChange(`${before}@${member.name} ${after}`);
    onMentionAdded?.(member.name, member.userId);
    setQuery(null);
    requestAnimationFrame(() => input?.focus());
  };

  const filtered =
    query !== null
      ? members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
      : [];

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length === 0) {
            onEnter?.();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={
          className ||
          "w-full px-4 py-2 bg-bg-tertiary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        }
      />
      {filtered.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 right-0 bg-bg-secondary border border-border rounded-md shadow-lg max-h-40 overflow-y-auto z-30">
          {filtered.map((m) => (
            <button
              key={m.userId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectMember(m);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-bg-tertiary"
            >
              @{m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Replaces `@Name` occurrences with the `@[userId]` token the API parses for mention notifications. */
export function serializeMentions(text: string, mentionMap: Map<string, string>): string {
  let result = text;
  for (const [name, userId] of Array.from(mentionMap.entries())) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`@${escaped}(?=\\s|$)`, "g"), `@[${userId}]`);
  }
  return result;
}
