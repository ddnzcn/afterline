import { PIECE_COLOR, PREVIEW_SHAPE } from "../board";

interface PiecePreviewProps {
  piece: string | null;
  size?: number;
  dim?: boolean;
}

/** Small SVG of a piece for the hold / next columns. */
export function PiecePreview({ piece, size = 14, dim = false }: PiecePreviewProps) {
  const shape = piece ? PREVIEW_SHAPE[piece] : undefined;
  const w = 4 * size;
  const h = 2 * size;
  if (!shape || !piece) return <svg width={w} height={h} className="preview" aria-hidden />;
  const cols = Math.max(...shape.map(([x]) => x)) + 1;
  const offset = ((4 - cols) * size) / 2;
  return (
    <svg width={w} height={h} className="preview" role="img" aria-label={piece.toUpperCase()} opacity={dim ? 0.45 : 1}>
      {shape.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={offset + x * size + 1} y={y * size + 1} width={size - 2} height={size - 2} rx={2} fill={PIECE_COLOR[piece]} />
      ))}
    </svg>
  );
}
