export type IdeologyLabel =
  | 'Very Liberal'
  | 'Liberal'
  | 'Moderate Liberal'
  | 'Moderate'
  | 'Moderate Conservative'
  | 'Conservative'
  | 'Very Conservative'

export function getIdeologyLabel(dim1: number | null): IdeologyLabel | null {
  if (dim1 === null || dim1 === undefined) return null
  if (dim1 <= -0.6)  return 'Very Liberal'
  if (dim1 <= -0.35) return 'Liberal'
  if (dim1 <= -0.1)  return 'Moderate Liberal'
  if (dim1 <= 0.1)   return 'Moderate'
  if (dim1 <= 0.35)  return 'Moderate Conservative'
  if (dim1 <= 0.6)   return 'Conservative'
  return 'Very Conservative'
}
