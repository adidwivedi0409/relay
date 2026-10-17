import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number;
}

function Base({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
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

export const IconExternal = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 3.5H3.5v9h9V9.5" />
    <path d="M9.5 2.5h4v4" />
    <path d="M13.5 2.5 7.5 8.5" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Base>
);

export const IconX = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Base>
);

export const IconLink = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-.9.9" />
    <path d="M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l.9-.9" />
  </Base>
);

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m3.5 6 4.5 4.5L12.5 6" />
  </Base>
);

export const IconArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 8h11" />
    <path d="m9 3.5 4.5 4.5L9 12.5" />
  </Base>
);

export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 2.5 14 13H2L8 2.5Z" />
    <path d="M8 6.5v3" />
    <path d="M8 11.25v.01" />
  </Base>
);

export const IconInfo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 7.25V11" />
    <path d="M8 5v.01" />
  </Base>
);

export const IconFile = (p: IconProps) => (
  <Base {...p}>
    <path d="M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V5l-3.25-3.25Z" />
    <path d="M9.5 1.75V5h3.25" />
  </Base>
);

export const IconLayers = (p: IconProps) => (
  <Base {...p}>
    <path d="m8 2.5 6 3-6 3-6-3 6-3Z" />
    <path d="m2 8.5 6 3 6-3" />
    <path d="m2 11.5 6 3 6-3" />
  </Base>
);

export const IconEye = (p: IconProps) => (
  <Base {...p}>
    <path d="M1.75 8s2.5-4.5 6.25-4.5S14.25 8 14.25 8s-2.5 4.5-6.25 4.5S1.75 8 1.75 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Base>
);

export const IconCode = (p: IconProps) => (
  <Base {...p}>
    <path d="m5.5 4.5-4 3.5 4 3.5" />
    <path d="m10.5 4.5 4 3.5-4 3.5" />
    <path d="m9.25 2.75-2.5 10.5" />
  </Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Base>
);

export const IconBolt = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 1.75 3.5 9h4l-.5 5.25L12.5 7h-4l.5-5.25Z" />
  </Base>
);

export const IconSend = (p: IconProps) => (
  <Base {...p}>
    <path d="M13.5 2.5 2.5 7l5 1.5 1.5 5 4.5-11Z" />
    <path d="M7.5 8.5 13.5 2.5" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3v10M3 8h10" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71" />
    <path d="M13.25 2.75v3.5h-3.5" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13.25a4.25 4.25 0 0 1 8.5 0" />
    <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4" />
    <path d="M12 9.5a4.25 4.25 0 0 1 2.25 3.75" />
  </Base>
);

export const IconHandoff = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 5.5h7.5" />
    <path d="m7.5 3 2.5 2.5L7.5 8" />
    <path d="M13.5 10.5H6" />
    <path d="m8.5 8-2.5 2.5L8.5 13" />
  </Base>
);

export const IconGit = (p: IconProps) => (
  <Base {...p}>
    <circle cx="4.5" cy="3.5" r="1.75" />
    <circle cx="4.5" cy="12.5" r="1.75" />
    <circle cx="11.5" cy="5.5" r="1.75" />
    <path d="M4.5 5.25v5.5" />
    <path d="M11.5 7.25c0 2.5-7 1.5-7 3.5" />
  </Base>
);

export const IconDotGrid = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4h.01M8 4h.01M12 4h.01M4 8h.01M8 8h.01M12 8h.01M4 12h.01M8 12h.01M12 12h.01" strokeWidth={2} />
  </Base>
);

export const IconSpinner = (p: IconProps) => (
  <Base {...p} className={["animate-spin", p.className].filter(Boolean).join(" ")}>
    <path d="M8 2.25a5.75 5.75 0 1 1-5.57 4.3" />
  </Base>
);
