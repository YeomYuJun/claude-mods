export function projectKeyOf(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

export function sessionDirOf(input: { configDir: string; cwd: string; sessionId: string }): string {
  const base = input.configDir.replace(/\\/g, '/').replace(/\/+$/, '')
  return `${base}/projects/${projectKeyOf(input.cwd)}/${input.sessionId}`
}
