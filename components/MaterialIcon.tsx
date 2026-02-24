// Material Symbol Component — uses Google Material Symbols Outlined
export interface IconProps {
  name: string;
  size?: "small" | "medium" | "large" | "xlarge";
  className?: string;
}

export function MaterialIcon({
  name,
  size = "medium",
  className = "",
}: IconProps) {
  const fontSize = {
    small: "1rem",
    medium: "1.25rem",
    large: "1.5rem",
    xlarge: "2rem",
  }[size];

  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{ fontSize, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
    >
      {name}
    </span>
  );
}
