import type { ReactNode, SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Base({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 7.5 5 5 5-5" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5.5 5.5 9 9m0-9-9 9" />
    </Base>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="4.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="7.5" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="15" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
    </Base>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 10.6V4.5a1 1 0 0 1 1-1h6.1a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 0 1.4l-6.1 6.1a1 1 0 0 1-1.4 0l-5.4-5.4a1 1 0 0 1-.3-.7Z" />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 5.5h12M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10" />
    </Base>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m12.5 4.5 3 3L7 16H4v-3l8.5-8.5Z" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </Base>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 10H4.5m5-5.5L4.5 10l5 5.5" />
    </Base>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10h11.5m-5-5.5L15.5 10l-5 5.5" />
    </Base>
  );
}

export function TextLinesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" />
    </Base>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 5h13l-5 6v4.5l-3-1.5v-3l-5-6Z" />
    </Base>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12.5 6.5 16 10l-3.5 3.5M16 10H8" />
    </Base>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16c.4-2.6 2.4-4 5-4s4.6 1.4 5 4" />
      <path d="M12.5 4.4a2.75 2.75 0 0 1 0 5.2M14.2 12.3c1.8.5 3 1.8 3.3 3.7" />
    </Base>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="2" />
      <path d="m3.5 6 6.5 5 6.5-5" />
    </Base>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H8M12 7l3 3-3 3M15 10H8" />
    </Base>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </Base>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 3.5 17 16H3L10 3.5Z" />
      <path d="M10 8.5v3.2M10 13.8v.01" />
    </Base>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 6h7M14 6h3M3 14h3M10 14h7" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="8" cy="14" r="2" />
    </Base>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 3a7 7 0 1 0 0 14c1.1 0 1.6-.8 1.3-1.7-.3-.9.2-1.8 1.2-1.8H14a3 3 0 0 0 3-3C17 6.4 13.9 3 10 3Z" />
      <path d="M6.6 9.5v.01M9 6.8v.01M12.4 7.4v.01" />
    </Base>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.9 7.9a2.2 2.2 0 1 1 3.2 2c-.8.4-1.1.9-1.1 1.6M10 13.9v.01" />
    </Base>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.5 10s2.6-5 7.5-5 7.5 5 7.5 5-2.6 5-7.5 5-7.5-5-7.5-5Z" />
      <circle cx="10" cy="10" r="2.3" />
    </Base>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="5.5" width="15" height="9" rx="2" />
      <path d="M5.5 8.5h.01M8.5 8.5h.01M11.5 8.5h.01M14.5 8.5h.01M6.5 11.5h7" />
    </Base>
  );
}

export function ColumnsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3.5" width="4" height="13" rx="1.2" />
      <rect x="8" y="3.5" width="4" height="8.5" rx="1.2" />
      <rect x="13" y="3.5" width="4" height="11" rx="1.2" />
    </Base>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M3 12.5h14M8 8.5V16" />
    </Base>
  );
}

export function ChevronsLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m10.5 5-5 5 5 5M16 5l-5 5 5 5" />
    </Base>
  );
}

export function ChevronsRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m9.5 5 5 5-5 5M4 5l5 5-5 5" />
    </Base>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m12 5-5 5 5 5" />
    </Base>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m8 5 5 5-5 5" />
    </Base>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 16V4.5M5 9.5l5-5 5 5" />
    </Base>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 4v11.5M5 10.5l5 5 5-5" />
    </Base>
  );
}

/** Two small chevrons: the column can be sorted, and is not yet. */
export function SortIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m6.5 8.5 3.5-3.5 3.5 3.5M6.5 11.5l3.5 3.5 3.5-3.5" />
    </Base>
  );
}

/** A filled triangle for the column being sorted, so the state is a shape and not only a colour. */
export function SortAscendingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 5.5 15 13H5l5-7.5Z" fill="currentColor" />
    </Base>
  );
}

export function SortDescendingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 14.5 5 7h10l-5 7.5Z" fill="currentColor" />
    </Base>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
    </Base>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.5 4.5 3.5 7.5l3 3M4 7.5h7.5a4.5 4.5 0 0 1 0 9H8" />
    </Base>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 14a6.5 6.5 0 1 1 13 0" />
      <path d="m10 14 3-4.2" />
      <path d="M10 14h.01" />
    </Base>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 5.8V10l2.8 1.8" />
    </Base>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 3.5h11v8l-4 5h-7v-13Z" />
      <path d="M11.5 16.5v-5h4M7 7.5h6M7 10.5h3" />
    </Base>
  );
}

export function HashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7.5 3.5 6.5 16.5M13.5 3.5l-1 13M3.5 7.5h13M3.5 12.5h13" />
    </Base>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 5.5h12v7.5H9.2L6 15.8V13H4V5.5Z" />
    </Base>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="11" r="6" />
      <path d="M10 11V7.8M8 2.8h4M15.2 5l1.1-1.1" />
    </Base>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M3.5 10h13M10 3.5c-2 2-2.8 4.2-2.8 6.5s.8 4.5 2.8 6.5c2-2 2.8-4.2 2.8-6.5S12 5.5 10 3.5Z" />
    </Base>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 3v1.8M10 15.2V17M3 10h1.8M15.2 10H17M5.1 5.1l1.3 1.3M13.6 13.6l1.3 1.3M14.9 5.1l-1.3 1.3M6.4 13.6l-1.3 1.3" />
    </Base>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 11.6A6.2 6.2 0 0 1 8.4 4a6.2 6.2 0 1 0 7.6 7.6Z" />
    </Base>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m7 6-4 4 4 4M13 6l4 4-4 4M11.2 4.5l-2.4 11" />
    </Base>
  );
}

export function BarsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 16V9M10 16V4M16 16v-5" />
    </Base>
  );
}

export function RingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="6.5" opacity="0.35" />
      <path d="M10 3.5a6.5 6.5 0 0 1 6.5 6.5" />
    </Base>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8.5 4.5h-4v11h11v-4M11.5 4.5h4v4M15.5 4.5 9 11" />
    </Base>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.05 5.05l1.4 1.4M13.55 13.55l1.4 1.4M14.95 5.05l-1.4 1.4M6.45 13.55l-1.4 1.4" />
    </Base>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <circle cx="7.5" cy="8.5" r="1.3" />
      <path d="m4 14.5 4-3.5 3 2.5 2.5-2L17 14" />
    </Base>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.75" y="4.5" width="14.5" height="11" rx="2.5" />
      <path d="m8.5 7.6 4 2.4-4 2.4V7.6Z" fill="currentColor" />
    </Base>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" />
      <path d="M11.5 8.5a3 3 0 0 0-4.2 0L4.7 11.1a3 3 0 0 0 4.2 4.2l.9-.9" />
    </Base>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 2.8 4.5 5v4.6c0 3.4 2.3 5.9 5.5 7.1 3.2-1.2 5.5-3.7 5.5-7.1V5L10 2.8Z" />
      <path d="m7.6 9.8 1.8 1.8 3.2-3.5" />
    </Base>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 13V4.5M6.5 8 10 4.5 13.5 8M4 13.5v2h12v-2" />
    </Base>
  );
}

export function LayoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3.5" width="6.5" height="8" rx="1.5" />
      <rect x="12" y="3.5" width="5" height="4" rx="1.5" />
      <rect x="12" y="10" width="5" height="6.5" rx="1.5" />
      <rect x="3" y="14" width="6.5" height="2.5" rx="1.25" />
    </Base>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
      <rect x="7" y="7" width="6" height="6" rx="1.25" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="9" r="5" />
      <path d="m13 13 3.5 3.5" />
    </Base>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 3v14M3 10h14M10 3 8 5M10 3l2 2M10 17l-2-2M10 17l2-2M3 10l2-2M3 10l2 2M17 10l-2-2M17 10l-2 2" />
    </Base>
  );
}

export function ResizeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 8v8H8M16 16 9 9M12 16h4M16 12v4" />
    </Base>
  );
}

export function CornerDownLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 4.5v6a2 2 0 0 1-2 2H4.5M8 8.5l-3.5 3.5L8 15.5" />
    </Base>
  );
}

export function ZapIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M11 2.5 4.5 11H10l-1 6.5L15.5 9H10l1-6.5Z" />
    </Base>
  );
}

export function MaximizeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
    </Base>
  );
}

export function MinimizeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7.5 3.5v4h-4M12.5 3.5v4h4M7.5 16.5v-4h-4M12.5 16.5v-4h4" />
    </Base>
  );
}

export function SidebarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M8 4v12" />
    </Base>
  );
}

export function CursorIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m4.5 3.5 11 5-4.7 1.6L9.2 15Z" />
    </Base>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 10V4.8a1.2 1.2 0 0 1 2.4 0V9m0-4.7a1.2 1.2 0 0 1 2.4 0V9m0-3.6a1.2 1.2 0 0 1 2.4 0V11m0-3.2a1.2 1.2 0 0 1 2.4 0v4.2c0 2.6-1.8 4.5-4.5 4.5H10c-1.6 0-2.5-.7-3.4-1.9L4 11.4a1.2 1.2 0 0 1 1.9-1.4L7 11.4" />
    </Base>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="7" y="7" width="9" height="9" rx="2" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
    </Base>
  );
}

export function SelectAllIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" strokeDasharray="2.5 2.5" />
      <path d="m7.5 10 2 2 3.5-4" />
    </Base>
  );
}

export function FolderMoveIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 1.8h6A1.5 1.5 0 0 1 17 8.3v6.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z" />
      <path d="M8 11.5h5m-1.8-1.8 1.8 1.8-1.8 1.8" />
    </Base>
  );
}
