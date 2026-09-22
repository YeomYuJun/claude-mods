export function textOf(tree: unknown): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (typeof tree !== 'object' || !tree) return ''
  const props = Reflect.get(tree, 'props') as Record<string, unknown> | undefined
  const lead = typeof props?.label === 'string' ? props.label : typeof props?.source === 'string' ? props.source : ''
  return `${lead}${textOf(Reflect.get(tree, 'children') ?? [])}`
}

export function keysOf(tree: unknown): string[] {
  if (Array.isArray(tree)) return tree.flatMap(keysOf)
  if (typeof tree !== 'object' || !tree) return []
  const type = Reflect.get(tree, 'type')
  const props = Reflect.get(tree, 'props') as Record<string, unknown> | undefined
  const own = type === 'Button' && typeof props?.key === 'string' ? [props.key] : []
  return [...own, ...keysOf(Reflect.get(tree, 'children') ?? [])]
}
