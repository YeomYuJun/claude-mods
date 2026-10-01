export type Target = { kind: 'cwd' } | { kind: 'file'; path: string }

// 명령 인자를 경로 하나로 읽는다. 공백 경로를 감싼 따옴표는 벗긴다.
export function argOf(args: string): string {
  const trimmed = args.trim()
  const quoted = /^(["'])(.*)\1$/.exec(trimmed)
  return quoted ? (quoted[2] ?? '').trim() : trimmed
}

export function isAbsolute(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]/.test(path)
}

// 구분자를 / 로 맞추고 . 과 .. 을 푼다. 드라이브 문자와 루트는 남긴다.
export function normalize(path: string): string {
  const match = /^([A-Za-z]:)?(\/)?(.*)$/.exec(path.replace(/\\/g, '/'))
  const drive = match?.[1] ?? ''
  const isRooted = match?.[2] !== undefined
  const parts: string[] = []
  for (const segment of (match?.[3] ?? '').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
      else if (!isRooted) parts.push('..')
      continue
    }
    parts.push(segment)
  }
  return `${drive}${isRooted ? '/' : ''}${parts.join('/')}`
}

export function join(dir: string, name: string): string {
  return normalize(`${dir}/${name}`)
}

export function resolve(cwd: string, arg: string): string {
  return isAbsolute(arg) ? normalize(arg) : join(cwd, arg)
}

// Windows 경로는 대소문자를 가리지 않는다.
export function isSameFile(a: string, b: string): boolean {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase()
}
