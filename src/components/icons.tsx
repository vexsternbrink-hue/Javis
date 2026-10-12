// Schlichte Inline-Icons (keine externe Bibliothek nötig).
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width={20}
      height={20}
      {...props}
    />
  );
}

export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></Icon>
);
export const TaskIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Icon>
);
export const NoteIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></Icon>
);
export const MemoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3Z" /><path d="M9.5 21h5" /></Icon>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Icon>
);
export const EditIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></Icon>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
);
export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M5 12h13M12 5l7 7-7 7" /></Icon>
);
export const StopIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /></Icon>
);
export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Icon>
);
export const BackIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M15 6l-6 6 6 6" /></Icon>
);
export const LogoMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 64 64" width={28} height={28} aria-hidden="true" {...p}>
    <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="5" />
    <circle cx="32" cy="32" r="8" fill="currentColor" />
  </svg>
);
export const GridIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Icon>
);
export const MailIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></Icon>
);
export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon>
);
export const CoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="3 3" /></Icon>
);
export const DatabaseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></Icon>
);
export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></Icon>
);
export const BoltIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></Icon>
);
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></Icon>
);
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
