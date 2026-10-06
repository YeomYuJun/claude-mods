export type Messages = {
  commandDescription: string
  argumentHint: string
  panelShown: (path: string) => string
  panelHidden: string
  notReady: string
  progress: (done: number, total: number) => string
  missing: string
  tooLarge: (kib: number) => string
  readFailed: (message: string) => string
  noItems: string
}
