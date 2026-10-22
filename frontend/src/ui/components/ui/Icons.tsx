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
