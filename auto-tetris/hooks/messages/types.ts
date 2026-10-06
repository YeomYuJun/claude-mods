export type Messages = {
  commandDescription: string
  panelShown: string
  panelHidden: string
  tooSmall: (minCols: number, minRows: number, cols: number, rows: number) => string[]
  notTerminal: string
}
