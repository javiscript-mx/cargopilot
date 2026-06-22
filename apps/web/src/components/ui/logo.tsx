const DEFAULT_LOGO_SRC = "/logo.png"

interface LogoProps {
  size?: number
  tile?: boolean
  bg?: string
  className?: string
}

export function Logo({ size = 28, tile = false, bg = "#1e3550", className }: LogoProps) {
  return (
    <img
      src={DEFAULT_LOGO_SRC}
      alt="HM Sistema"
      width={size}
      height={size}
      className={className}
      style={{
        borderRadius: tile ? "22%" : undefined,
        backgroundColor: tile ? bg : undefined,
      }}
    />
  )
}
