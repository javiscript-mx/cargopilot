// Marca HM Sistema — malla de nodos (red logística) reutilizable.
// El trazo usa `currentColor`; el centro de cada nodo se rellena con `bg`
// para enmascarar las líneas y dejar anillos limpios sobre cualquier fondo.

const NODES: [number, number][] = [
  [22, 22], [50, 22], [78, 22],
  [22, 50], [50, 50], [78, 50],
  [22, 78], [50, 78], [78, 78],
]

const LINKS =
  "M22 22L50 50M50 22L22 50M50 22L78 50M78 22L50 50M22 50L50 78M22 78L50 50M50 50L78 78M78 50L50 78"

interface LogoProps {
  /** Tamaño en px (cuadrado). */
  size?: number
  /** Dibuja el mosaico redondeado navy detrás de la malla. */
  tile?: boolean
  /** Color de fondo: rellena el mosaico y el centro de los nodos. */
  bg?: string
  className?: string
}

export function Logo({ size = 28, tile = false, bg = "#1e3550", className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="HM Sistema"
    >
      {tile && <rect width="100" height="100" rx="22" fill={bg} />}
      <path d={LINKS} fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      <g fill={bg} stroke="currentColor" strokeWidth={3.5}>
        {NODES.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={6.5} />
        ))}
      </g>
    </svg>
  )
}
